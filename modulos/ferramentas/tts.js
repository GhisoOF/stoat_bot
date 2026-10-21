
import { resolverCanal } from "../core/ids.js";
import { citar, citarInterno } from "../core/aliases.js";
import { servidorNaLista } from "../core/env.js";
import { tr, lingua } from "../core/i18n.js";
import { chamarApi } from "../core/stoat-api.js";
import * as abrev from "../core/abreviacoes.js";
import * as filtro from "./tts-filtro.js";

const VOZ_URL   = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
const VOZ_CHAVE = process.env.VOZ_CHAVE || "";
const VOZ_API_ESPERADA = 11;

const COOLDOWN_MS = Number(process.env.TTS_COOLDOWN_MS || 8000);
const MAX_CHARS   = Number(process.env.TTS_MAX_CHARS || 400);

const ultimaFala = new Map();   // `${serverId}:${userId}` → timestamp
// erro → quando foi logado pela última vez (anti-enxurrada no log)
const ultimoErro = new Map();
setInterval(() => {
  const corte = Date.now() - COOLDOWN_MS * 10;
  for (const [k, t] of ultimaFala) if (t < corte) ultimaFala.delete(k);
}, 10 * 60_000).unref?.();

const SUBCOMANDOS = [
  "estado", "status", "saude", "diagnostico", "reiniciar", "resgatar", "destravar",
  "filtro", "voz", "efeito", "tom", "cooldown", "nomes",
  "dicionario", "ajuda",
];

function semAcento(t) {
  return String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Distância de edição, com corte: acima de `max` não interessa o valor exato.
function perto(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return false;
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let ant = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1));
      ant = tmp;
    }
  }
  return d[b.length] <= max;
}

// Só dispara com UMA palavra: `&tts estado da call` é fala de verdade.
function quaseSubcomando(args) {
  const p = semAcento(args[0] ?? "");
  if (p.length < 4) return null;
  if (args.length !== 1) {
    if (p.length < 6) return null;
    for (const sc of COM_ARGUMENTO) if (p !== sc && perto(p, sc, 1)) return sc;
    return null;
  }
  for (const sc of SUBCOMANDOS) {
    if (p === sc) return null;                    // exato já foi tratado acima
    if (sc.startsWith(p) || p.startsWith(sc) || perto(p, sc)) return sc;
  }
  return null;
}
const COM_ARGUMENTO = ["resgatar", "filtro", "cooldown", "dicionario", "efeito", "voz", "nomes", "tom"];

function servidoresConhecidos(ctx) {
  try { return [...(ctx.client?.servers?.keys?.() ?? [])].slice(0, 25); }
  catch { return []; }
}

// Só canal que tem CALL serve. Antes qualquer canal de texto "servia": o
// `&entrar` digitado em #colocar-musicas tentava entrar no próprio canal de
// texto e o Stoat devolvia NotAVoiceChannel (1 out 2026).
export function pareceCanalDeVoz(canal) {
  if (!canal) return false;
  const t = String(canal.type ?? canal.channel_type ?? "");
  if (/^(DirectMessage|Group|SavedMessages)$/i.test(t)) return false;
  return /voice/i.test(t) || canal.isVoice === true || (typeof canal.voice === "object" && canal.voice !== null) || !!canal.activeCall;
}

// A call em que a PESSOA está agora (a stoat.js mantém voiceParticipants por canal).
export function callDaPessoa(server, client, userId) {
  if (!userId) return null;
  const achadas = canaisDeVozDo(server, client).filter((c) => {
    try { return c.voiceParticipants?.has?.(userId); } catch { return false; }
  });
  return achadas.length === 1 ? achadas[0] : null;   // em duas ao mesmo tempo: estado velho, não arrisca
}

function canaisDeVozDo(server, client) {
  const lista = Array.isArray(server?.channels) ? server.channels
    : (server?.channels && typeof server.channels.values === "function") ? [...server.channels.values()]
    : [];
  const resolvidos = lista.map((c) => (typeof c === "string" ? client?.channels?.get?.(c) : c)).filter(Boolean);
  return resolvidos.filter(pareceCanalDeVoz);
}

// A call para entrar — o `&entrar` pode vir de QUALQUER canal de texto (há
// servidores que fecham o chat das calls e usam um canal à parte, como
// #call-sem-mic e #colocar-musicas). Ordem:
//   1. a call escrita no comando (`&entrar call 1`)
//   2. a call em que a pessoa está agora
//   3. o próprio canal, se ele tem call
//   4. a call de antes (se ainda existe) · 5. a única call do servidor
export function descobrirCanalDeVoz(message, server, ctx, config, pedido = "") {
  const vozes = canaisDeVozDo(server, ctx.client);
  const porId = (id) => vozes.find((v) => (v.id ?? v._id) === id) ?? null;
  if (pedido) {
    const id = resolverCanal(pedido, { message, server });
    const alvo = id ? porId(id) : null;
    if (alvo) return { id: alvo.id ?? alvo._id, fonte: "pedido" };
    const parecido = vozes.find((v) => String(v.name ?? "").toLowerCase().includes(pedido.replace(/^#/, "").toLowerCase()));
    if (parecido) return { id: parecido.id ?? parecido._id, fonte: "pedido" };
    return { id: null, naoAchou: pedido, opcoes: vozes.slice(0, 10) };
  }
  const daPessoa = callDaPessoa(server, ctx.client, message.authorId);
  if (daPessoa) return { id: daPessoa.id ?? daPessoa._id, fonte: "pessoa" };
  const atual = message.channel ?? ctx.client?.channels?.get?.(message.channelId);
  if (message.channelId && pareceCanalDeVoz(atual)) return { id: message.channelId, fonte: "aqui" };
  if (config?.canalVoz && (porId(config.canalVoz) || !vozes.length)) return { id: config.canalVoz, fonte: "configurado" };
  if (vozes.length === 1) return { id: vozes[0].id ?? vozes[0]._id, fonte: "unico" };
  return { id: null, opcoes: vozes.slice(0, 10) };
}

export function servidorPermitido(serverId) {
  return servidorNaLista("TTS_SERVIDORES", serverId);
}

function garantirConfig(config) {
  config.tts ??= {};
  config.tts.ativo ??= false;
  config.tts.canalVoz ??= null;
  config.tts.canalTexto ??= null;   // transmissão automática
  config.tts.voz ??= null;
  config.tts.cooldown ??= null;    // ms; null = usa o padrão do ambiente
  config.tts.anunciarNome ??= true;
  config.tts.dicionario ??= {};      // abreviações extras deste servidor
  config.tts.expandir ??= true;      // usar o dicionário embutido
  config.tts.efeito ??= null;        // caráter: glados, robo, radio…
  config.tts.tom ??= null;           // altura da voz (1.0 = original)
  config.tts.filtro ??= true;        // peneira anti-barulho na transmissão
  config.tts.porMinuto ??= null;     // teto de falas por minuto no canal
  return config.tts;
}

async function chamar(rota, corpo = null, metodo = "POST") {
  if (!VOZ_URL) throw new Error("VOZ_SERVICO_URL não configurada no ambiente do bot");
  const res = await fetch(`${VOZ_URL}${rota}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...(VOZ_CHAVE ? { "x-chave": VOZ_CHAVE } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS || 40_000)),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados?.erro ?? `HTTP ${res.status}`);
  return dados;
}

export async function falarNaCall(config, texto, ctx) {
  const c = garantirConfig(config);
  if (!c.ativo || !c.canalVoz) return { ok: false, erro: "desligado" };
  return chamar("/falar", { canalVoz: c.canalVoz, texto, voz: c.voz });
}

export async function aoMensagem(message, ctx) {
  try {
    const serverId = ctx.serverId;
    if (!servidorPermitido(serverId)) return false;
    const c = ctx.config?.tts;
    if (!c?.ativo || !c.canalTexto || !c.canalVoz) return false;
    if (message.channelId !== c.canalTexto) return false;
    if (message.author?.bot) return false;

    const texto = (message.content ?? "").trim();
    if (!texto || texto.startsWith(ctx.PREFIXO)) return false;

    if (c.filtro !== false) {
      const v = filtro.avaliar(texto);
      if (!v.falar) {
        if (ctx.cfgGlobal?.debug !== false) console.log(`[TTS] ignorei (${v.motivo}): ${JSON.stringify(texto.slice(0, 60))}`);
        return false;
      }
    }

    const chave = `${serverId}:${message.authorId}`;
    const agora = Date.now();
    const espera = c.cooldown ?? COOLDOWN_MS;
    if (agora - (ultimaFala.get(chave) ?? 0) < espera) return false;

    const jaSilenciado = filtro.emEnxurrada(message.channelId, agora);
    if (jaSilenciado.silenciado) return false;
    const cota = filtro.registrarFala(message.channelId, agora,
      c.porMinuto ? { porMinuto: c.porMinuto } : {});
    if (!cota.permitido) {
      if (cota.estreando) {
        const seg = Math.ceil((cota.ate - agora) / 1000);
        await ctx.sendEmbed(message.channel, tr(ctx, {
          title: "🤫 Muita coisa de uma vez",
          description: `Vou parar de falar por ${seg}s para a call respirar.\n\nO \`${ctx.PREFIXO}tts <texto>\` continua funcionando normalmente.`,
          colour: ctx.COR.aviso,
        }, {
          title: "🤫 Too much at once",
          description: `I'll stop speaking for ${seg}s so the call can breathe.\n\n\`${ctx.PREFIXO}tts <text>\` still works normally.`,
          colour: ctx.COR.aviso,
        }, {
          title: "🤫 Demasiado a la vez",
          description: `Voy a dejar de hablar ${seg}s para que la llamada respire.\n\n\`${citar("tts", "es", ctx.PREFIXO)} <texto>\` sigue funcionando con normalidad.`,
          colour: ctx.COR.aviso,
        })).catch(() => {});
      }
      return false;
    }
    ultimaFala.set(chave, agora);

    const nome = message.author?.username ?? "alguém";
    const corpo = (c.expandir === false
      ? texto
      : abrev.expandir(texto, c.dicionario ?? {})).slice(0, MAX_CHARS);
    const r = await chamar("/falar", {
      canalVoz: c.canalVoz,
      texto: c.anunciarNome === false ? corpo : `${nome} disse: ${corpo}`,
      voz: c.voz, efeito: c.efeito, tom: c.tom,
      autoEntrar: false,
    });
    return r?.ok !== false;
  } catch (e) {
    const msg = e?.message ?? String(e);
    const agora = Date.now();
    if (agora - (ultimoErro.get(msg) ?? 0) > 60_000) {
      ultimoErro.set(msg, agora);
      console.error("[TTS] transmissão:", msg);
    }
    return false;
  }
}

function candidatasAuxiliares(server, client, presa, preferida = null) {
  const lista = canaisDeVozDo(server, client)
    .map((v) => v.id ?? v._id)
    .filter((id) => id && id !== presa);
  const meuId = client?.user?.id;
  const peso = (id) => {
    const ch = client?.channels?.get?.(id);
    const gente = [...(ch?.voiceParticipants?.keys?.() ?? [])].filter((u) => u !== meuId).length;
    return (gente > 0 ? 2 : 0) + (ch?.isVoice === true ? 1 : 0);
  };
  lista.sort((a, b) => peso(b) - peso(a));
  const ordem = preferida && preferida !== presa ? [preferida, ...lista.filter((x) => x !== preferida)] : lista;
  return [...new Set(ordem)].slice(0, 6);
}

async function executarResgate({ presa, auxPreferida = null, message, ctx, c, server, lang, anunciar = false }) {
  const { sendEmbed, COR, PREFIXO, serverId } = ctx;
  const client = ctx.client;
  const meuId = client?.user?.id;
  const token = process.env.BOT_TOKEN;
  const passos = [];
  const ok = (t) => passos.push(`✅ ${t}`);
  const falha = (t) => passos.push(`❌ ${t}`);
  const resultado = (okFinal, motivo = null, extra = {}) => ({ ok: okFinal, passos, motivo, ...extra });

  if (!meuId || !token) return resultado(false, "config", { dica: "sem `BOT_TOKEN`/id próprio no ambiente do bot" });

  const candidatas = candidatasAuxiliares(server, client, presa, auxPreferida);
  if (!candidatas.length) return resultado(false, "sem-auxiliar");

  if (anunciar) {
    await sendEmbed(message.channel, tr(ctx, {
      title: "🛟 Resgate em andamento",
      description: `O Stoat me registra como já estando em <#${presa}>. Vou entrar por outra call e me mover para cá. Leva uns 10–30s.`,
      colour: COR.info,
    }, {
      title: "🛟 Rescue in progress",
      description: `Stoat records me as already in <#${presa}>. I'll come in through another call and move myself here. Takes about 10–30s.`,
      colour: COR.info,
    }, {
      title: "🛟 Rescate en curso",
      description: `Stoat me tiene registrada como si ya estuviera en <#${presa}>. Voy a entrar por otra llamada y moverme aquí. Tarda unos 10–30s.`,
      colour: COR.info,
    })).catch(() => {});
  }

  // 1. entrar na auxiliar — a primeira que NÃO estiver presa também
  let aux = null;
  for (const cand of candidatas) {
    try {
      const r = await chamar("/entrar", { canalVoz: cand, serverId, servidores: servidoresConhecidos(ctx) });
      aux = cand;
      ok(`${tr(ctx, "entrei na call auxiliar", "joined helper call", "entré en la llamada auxiliar")} <#${cand}>${r?.jaEstava ? tr(ctx, " (já estava)", " (was already there)", " (ya estaba)") : ""}`);
      break;
    } catch (e) {
      const m = String(e.message ?? e).replace(/`/g, "");
      passos.push(`⏭️ <#${cand}>: ${/AlreadyConnected/i.test(m) ? tr(ctx, "presa também", "stuck too", "también atascada") : m.slice(0, 90)}`);
    }
  }
  if (!aux) return resultado(false, "auxiliares-presas");

  // 2. esperar o Stoat me registrar lá (é a chave que o mover vai ler)
  const canalAux = client?.channels?.get?.(aux);
  let registrada = false;
  for (let i = 0; i < 40 && !registrada; i++) {
    registrada = !!canalAux?.voiceParticipants?.has?.(meuId);
    if (!registrada) await new Promise((r) => setTimeout(r, 250));
  }
  passos.push(registrada
    ? `✅ ${tr(ctx, "o Stoat me registrou na call auxiliar", "Stoat registered me in the helper call", "Stoat me registró en la llamada auxiliar")}`
    : `⚠️ ${tr(ctx, "não me vi listada na call auxiliar em 10s — tentando assim mesmo", "didn't see myself listed in the helper call after 10s — trying anyway", "no me vi en la lista de la llamada auxiliar en 10s — lo intento igualmente")}`);

  // 3. ouvir o evento que traz o token, e pedir o mover
  let ouvir;
  const tokenDoMover = new Promise((resolve, reject) => {
    const t = setTimeout(() => { client?.events?.off?.("event", ouvir); reject(new Error("15s sem o evento UserMoveVoiceChannel")); }, 15_000);
    ouvir = (ev) => {
      if (ev?.type !== "UserMoveVoiceChannel" || ev?.to !== presa) return;
      clearTimeout(t); client?.events?.off?.("event", ouvir); resolve(ev);
    };
    client?.events?.on?.("event", ouvir);
  });
  tokenDoMover.catch(() => {});
  let patch;
  try {
    const r = await chamarApi(`/servers/${serverId}/members/${meuId}`, {
      metodo: "PATCH", corpo: { voice_channel: presa }, ms: 10_000,
    });
    patch = r.erro ? { ok: false, erro: r.erro } : { ok: r.ok, status: r.status, corpo: r.texto.slice(0, 140) };
  } catch (e) { patch = { ok: false, erro: e?.message ?? String(e) }; }
  if (!patch.ok) {
    client?.events?.off?.("event", ouvir);
    falha(`PATCH voice_channel → ${patch.erro ?? `HTTP ${patch.status} ${(patch.corpo ?? "").replace(/`/g, "")}`}`);
    return resultado(false, /NotConnected/i.test(patch.corpo ?? "") ? "not-connected" : "mover", { aux });
  }
  ok(`PATCH voice_channel → HTTP ${patch.status}`);

  let ev;
  try { ev = await tokenDoMover; }
  catch (e) { falha(`token: \`${e.message}\``); return resultado(false, "sem-evento", { aux }); }
  ok(`${tr(ctx, "recebi o token para", "got the token for", "recibí el token para")} <#${presa}> (node \`${ev.node ?? "?"}\`)`);

  // 4. o serviço entra com o token (sai da auxiliar no caminho)
  try {
    await chamar("/entrar-com-token", { canalVoz: presa, token: ev.token, node: ev.node ?? null, serverId });
    ok(`${tr(ctx, "conectei de verdade em", "connected for real in", "me conecté de verdad en")} <#${presa}>`);
  } catch (e) {
    falha(`${tr(ctx, "entrada com token", "join with token", "entrada con token")}: \`${String(e.message ?? e).replace(/`/g, "")}\``);
    return resultado(false, "token-join", { aux });
  }
  return resultado(true, null, { aux });
}

function relatarResgate(r, { presa, message, ctx, c, lang }) {
  const { sendEmbed, COR, PREFIXO, salvarConfig } = ctx;
  const P = PREFIXO;
  if (r.ok) {
    if (!c.ativo) c.ativo = true;
    c.canalVoz = presa;
    c.canalTexto = message.channelId;
    salvarConfig?.();
    filtro.limpar(c.canalTexto ?? null);
    return sendEmbed(message.channel, {
      title: tr(ctx, "🔊 Entrei — e já estou lendo", "🔊 I'm in — and already reading", "🔊 Entré — y ya estoy leyendo"),
      description: [
        ...r.passos, "",
        tr(ctx,
          `O Stoat me registrava como já estando em <#${presa}>, então entrei por <#${r.aux}> e me movi para cá. Lendo <#${c.canalTexto}>.\n\n⚠️ Vale para **todo mundo** que escrever aqui · \`${citarInterno("sair", P)}\` para eu sair.`,
          `Stoat had me recorded as already in <#${presa}>, so I came in through <#${r.aux}> and moved myself here. Reading <#${c.canalTexto}>.\n\n⚠️ Applies to **everyone** who writes here · \`${citarInterno("sair", P)}\` to leave.`,
          `Stoat me tenía registrada como si ya estuviera en <#${presa}>, así que entré por <#${r.aux}> y me moví aquí. Leyendo <#${c.canalTexto}>.\n\n⚠️ Vale para **todos** los que escriban aquí · \`${citar("sair", "es", P)}\` para que me vaya.`),
      ].join("\n"), colour: COR.sucesso,
    });
  }
  const dicas = {
    "sem-auxiliar": tr(ctx,
      `O resgate passa por **outra call do mesmo servidor** e não achei nenhuma. Diga qual: \`${citarInterno("tts.resgatar", P)} #call-auxiliar\`.`,
      `The rescue goes through **another call in this server** and I couldn't find one. Tell me which: \`${citarInterno("tts.resgatar", P)} #helper-call\`.`,
      `El rescate pasa por **otra llamada del mismo servidor** y no encontré ninguna. Dime cuál: \`${citar("tts.resgatar", "es", P)} #llamada-auxiliar\`.`),
    "auxiliares-presas": tr(ctx,
      `Todas as calls auxiliares que tentei estão presas também. Indique uma que eu não tentei: \`${citarInterno("tts.resgatar", P)} #outra-call\`.`,
      `Every helper call I tried is stuck too. Pick one I didn't try: \`${citarInterno("tts.resgatar", P)} #other-call\`.`,
      `Todas las llamadas auxiliares que probé también están atascadas. Indica una que no haya probado: \`${citar("tts.resgatar", "es", P)} #otra-llamada\`.`),
    "not-connected": tr(ctx,
      "`NotConnected`: o Stoat não registrou minha entrada na call auxiliar. É o webhook `participant_joined` não sendo processado do lado deles — não tenho como consertar daqui; tente de novo em um minuto.",
      "`NotConnected`: Stoat never recorded my join in the helper call. That's the `participant_joined` webhook not being processed on their side — nothing I can fix from here; try again in a minute.",
      "`NotConnected`: Stoat no registró mi entrada en la llamada auxiliar. Es el webhook `participant_joined`, que no se procesa de su lado — no puedo arreglarlo desde aquí; inténtalo de nuevo en un minuto."),
    "mover": tr(ctx, `Fico na call auxiliar; \`${citarInterno("sair", P)}\` me tira.`, `I'll stay in the helper call; \`${citarInterno("sair", P)}\` drops me.`, `Me quedo en la llamada auxiliar; \`${citar("sair", "es", P)}\` me saca.`),
    "sem-evento": tr(ctx,
      `O Stoat aceitou o mover mas não mandou o evento \`UserMoveVoiceChannel\` com o token. \`${citarInterno("sair", P)}\` e tente de novo.`,
      `Stoat accepted the move but never sent the \`UserMoveVoiceChannel\` event with the token. \`${citarInterno("sair", P)}\` and try again.`,
      `Stoat aceptó el movimiento pero no envió el evento \`UserMoveVoiceChannel\` con el token. \`${citar("sair", "es", P)}\` e inténtalo de nuevo.`),
    "token-join": tr(ctx,
      `Se o serviço respondeu "rota desconhecida", atualize o \`voz-servico/\` na máquina (isto precisa da versão ${VOZ_API_ESPERADA} da API).`,
      `If the service answered "rota desconhecida", update \`voz-servico/\` on the machine (this needs API version ${VOZ_API_ESPERADA}).`,
      `Si el servicio respondió "rota desconhecida", actualiza \`voz-servico/\` en la máquina (esto necesita la versión ${VOZ_API_ESPERADA} de la API).`),
    "config": r.dica ?? "",
  };
  return sendEmbed(message.channel, {
    title: tr(ctx, "⚠️ Não consegui entrar na call", "⚠️ Couldn't get into the call", "⚠️ No pude entrar en la llamada"),
    description: [...r.passos, "", dicas[r.motivo] ?? ""].join("\n"),
    colour: COR.aviso,
  });
}

export async function cmdTts(message, args, ctx) {
  const { config, sendEmbed, COR, PREFIXO, getServer, membroTemPermissao, salvarConfig, serverId } = ctx;
  const lang = lingua(ctx);
  const c = garantirConfig(config);
  const sub = args[0]?.toLowerCase();
  const resto = args.slice(1).join(" ").trim();

  if (!servidorPermitido(serverId)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Indisponível aqui",
        description: `A voz da Judy não está habilitada neste servidor.`, colour: COR.aviso },
      { title: "🚫 Unavailable here",
        description: `Judy's voice isn't enabled on this server.`, colour: COR.aviso },
      { title: "🚫 No disponible aquí",
        description: `La voz de Judy no está habilitada en este servidor.`, colour: COR.aviso }));
  }

  // ── estado (público) ──
  if (sub === "estado" || sub === "status" || sub === "saude" || sub === "health") {
    let saude = null, erroSaude = null;
    try { saude = await chamar("/saude", null, "GET"); }
    catch (e) {
      erroSaude = !VOZ_URL
        ? tr(ctx, "`VOZ_SERVICO_URL` não configurada no ambiente do bot", "`VOZ_SERVICO_URL` isn't set in the bot's environment", "`VOZ_SERVICO_URL` no está configurada en el entorno del bot")
        : (e?.message ?? String(e));
    }

    const linhas = [
      `**${tr(ctx, "Ligado", "Enabled", "Activado")}:** ${c.ativo ? "🟢" : "🔴"}`,
      `**${tr(ctx, "Canal de voz", "Voice channel", "Canal de voz")}:** ${c.canalVoz ? `<#${c.canalVoz}>` : "_—_"}`,
      `**${tr(ctx, "Transmite de", "Broadcast from", "Transmite desde")}:** ${c.canalTexto ? `<#${c.canalTexto}>` : "_—_"}`,
      `**${tr(ctx, "Peneira", "Sieve", "Filtro")}:** ${c.filtro === false ? "🔴" : "🟢"} ${tr(ctx,
        `até ${c.porMinuto ?? filtro.PADROES.porMinuto}/min`, `up to ${c.porMinuto ?? filtro.PADROES.porMinuto}/min`, `hasta ${c.porMinuto ?? filtro.PADROES.porMinuto}/min`)}${(() => {
          const e = c.canalTexto ? filtro.estadoDoCanal(c.canalTexto) : null;
          return e?.silenciado ? ` · 🤫 ${Math.ceil(e.faltamMs / 1000)}s` : "";
        })()} _(\`${tr(ctx, citarInterno("tts.filtro", PREFIXO), citarInterno("tts.filtro", PREFIXO), citar("tts.filtro", "es", PREFIXO))}\`)_`,
      "",
      `**${tr(ctx, "Serviço de voz", "Voice service", "Servicio de voz")}:** ${saude ? "🟢 ok" : `🔴 ${erroSaude}`}`,
    ];
    if (saude) {
      const v = Number(saude.versao ?? 1);
      linhas.push(v < VOZ_API_ESPERADA
        ? `**${tr(ctx, "Versão do serviço", "Service version", "Versión del servicio")}:** ⚠️ **${v}** ${tr(ctx,
            `— este bot espera a **${VOZ_API_ESPERADA}**. Atualize o \`voz-servico/\` na máquina e reinicie o \`judy-voz\`; até lá, comandos que a versão antiga não conhece respondem "rota desconhecida".`,
            `— this bot expects **${VOZ_API_ESPERADA}**. Update \`voz-servico/\` on the machine and restart \`judy-voz\`; until then, commands the old version doesn't know will answer "rota desconhecida".`,
            `— este bot espera la **${VOZ_API_ESPERADA}**. Actualiza \`voz-servico/\` en la máquina y reinicia \`judy-voz\`; hasta entonces, los comandos que la versión antigua no conoce responden "rota desconhecida".`)}`
        : `**${tr(ctx, "Versão do serviço", "Service version", "Versión del servicio")}:** 🟢 ${v}`);
      linhas.push(`**Piper:** ${saude.piper?.ok ? `🟢 ${saude.piper.vozAtual}` : `🔴 ${saude.piper?.erro}`}`);
      linhas.push(`**${tr(ctx, "revoice (biblioteca)", "revoice (library)", "revoice (biblioteca)")}:** ${saude.voz?.pronto
        ? tr(ctx, "🟢 carregada", "🟢 loaded", "🟢 cargada") : `🔴 ${saude.voz?.erro}`}`);
      const con = saude.voz?.conexoes ?? [];
      linhas.push(`**${tr(ctx, "Em calls", "In calls", "En llamadas")}:** ${con.length
        ? con.map((x) => `<#${x.canalVoz}> (${x.falas} ${tr(ctx, "falas", "utterances", "frases")})`).join(", ")
        : "_—_"}`);
    }
    linhas.push("", tr(ctx,
      `_Não consegue entrar? \`${citarInterno("tts.diagnostico", PREFIXO)}\` diz em qual etapa trava._`,
      `_Can't join? \`${citarInterno("tts.diagnostico", PREFIXO)}\` says at which step it jams._`,
      `_¿No logras entrar? \`${citar("tts.diagnostico", "es", PREFIXO)}\` dice en qué paso se atasca._`));
    return sendEmbed(message.channel, {
      title: tr(ctx, "🔊 Estado da voz", "🔊 Voice status", "🔊 Estado de la voz"),
      description: linhas.join("\n"),
      colour: saude?.piper?.ok && saude?.voz?.pronto ? COR.sucesso : COR.aviso,
    });
  }

  const server = await getServer(message).catch(() => null);
  const ehStaff = membroTemPermissao(message, server, "ManageMessages");

  if (["diagnostico", "diagnóstico", "diagnosticar", "diagnose", "diagnostics",
       "checar", "check", "porque", "porquê"].includes(sub)) {
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para rodar o diagnóstico.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to run the diagnostics.", colour: COR.erro },
        { title: "🚫 Permiso insuficiente",
          description: "Necesitas **ManageMessages** para ejecutar el diagnóstico.", colour: COR.erro }));
    }
    if (!c.canalVoz) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não sei em qual call olhar",
          description: `Mande \`${citarInterno("entrar", PREFIXO)}\` primeiro (estando numa call) — o diagnóstico examina a call que eu estou usando.`, colour: COR.erro },
        { title: "❌ I don't know which call to look at",
          description: `Send \`${citarInterno("entrar", PREFIXO)}\` first (while in a call) — the diagnostics examine the call I'm using.`, colour: COR.erro },
        { title: "❌ No sé qué llamada mirar",
          description: `Envía \`${citar("entrar", "es", PREFIXO)}\` primero (estando en una llamada) — el diagnóstico examina la llamada que estoy usando.`, colour: COR.erro }));
    }
    let d;
    try { d = await chamar("/diagnostico", { canalVoz: c.canalVoz }); }
    catch (e) {
      const motivo = String(e.message ?? e).replace(/`/g, "");
      const velho = /rota desconhecida|HTTP 404/i.test(motivo);
      return sendEmbed(message.channel, velho ? tr(ctx, {
        title: "⚠️ O serviço de voz está desatualizado",
        description: [
          `O \`judy-voz\` respondeu, mas não conhece o \`/diagnostico\` — ele ainda roda uma versão anterior à ${VOZ_API_ESPERADA}.`,
          "",
          "O bot é atualizado pelo deploy do container; o serviço de voz **não** — ele roda nativo na máquina, e precisa ser copiado e reiniciado à mão:",
          "",
          "```",
          "# na máquina do judy-voz",
          "cd ~/Downloads/github/voz-servico   # onde ele vive",
          "# substitua os arquivos pelo voz-servico/ do pacote novo",
          "# e reinicie o serviço",
          "```",
          "",
          `Depois, \`${citarInterno("tts.estado", PREFIXO)}\` deve mostrar **versão ${VOZ_API_ESPERADA}**.`,
          "",
          "_Enquanto isso: as correções de entrar/sair também estão nessa pasta, então o timeout que você está vendo continua acontecendo até ela subir._",
        ].join("\n"),
        colour: COR.aviso,
      }, {
        title: "⚠️ The voice service is out of date",
        description: [
          `\`judy-voz\` answered, but doesn't know \`/diagnostico\` — it's still running a version older than ${VOZ_API_ESPERADA}.`,
          "",
          "The bot updates through the container deploy; the voice service does **not** — it runs natively on the machine and has to be copied and restarted by hand:",
          "",
          "```",
          "# on the judy-voz machine",
          "cd ~/Downloads/github/voz-servico   # wherever it lives",
          "# replace the files with voz-servico/ from the new package",
          "# then restart the service",
          "```",
          "",
          `After that, \`${citarInterno("tts.estado", PREFIXO)}\` should show **version ${VOZ_API_ESPERADA}**.`,
          "",
          "_Meanwhile: the join/leave fixes live in that same folder, so the timeout you're seeing keeps happening until it goes up._",
        ].join("\n"),
        colour: COR.aviso,
      }, {
        title: "⚠️ El servicio de voz está desactualizado",
        description: [
          `\`judy-voz\` respondió, pero no conoce \`/diagnostico\` — todavía ejecuta una versión anterior a la ${VOZ_API_ESPERADA}.`,
          "",
          "El bot se actualiza con el deploy del contenedor; el servicio de voz **no** — se ejecuta nativo en la máquina y hay que copiarlo y reiniciarlo a mano:",
          "",
          "```",
          "# en la máquina de judy-voz",
          "cd ~/Downloads/github/voz-servico   # donde viva",
          "# sustituye los archivos por voz-servico/ del paquete nuevo",
          "# y reinicia el servicio",
          "```",
          "",
          `Después, \`${citar("tts.estado", "es", PREFIXO)}\` debería mostrar la **versión ${VOZ_API_ESPERADA}**.`,
          "",
          "_Mientras tanto: los arreglos de entrar/salir también están en esa carpeta, así que el timeout que ves seguirá ocurriendo hasta que se suba._",
        ].join("\n"),
        colour: COR.aviso,
      }) : {
        title: tr(ctx, "❌ O serviço de voz não respondeu", "❌ The voice service didn't answer", "❌ El servicio de voz no respondió"),
        description: `\`${motivo}\`\n\n${tr(ctx,
          "O problema é antes da call: o `judy-voz` está fora do ar ou inalcançável. Precisa de mão na máquina.",
          "The problem is before the call: `judy-voz` is down or unreachable. It needs a hand on the machine.",
          "El problema está antes de la llamada: `judy-voz` está caído o inalcanzable. Hay que intervenir en la máquina.")}`,
        colour: COR.erro });
    }

    const marca = (v) => v === true ? "✅" : v === false ? "❌" : "❔";
    const linhas = (d.etapas ?? []).map((e) =>
      `${marca(e.ok)} **${e.etapa}** — ${e.ms}ms${e.status ? ` · HTTP ${e.status}` : ""}\n   ${String(e.detalhe ?? "").slice(0, 160).replace(/`/g, "")}`);

    const marcos = d.marcos ?? d.ultimaFalha?.marcos ?? [];
    const linhaMarcos = marcos.length
      ? `\n**${tr(ctx, "Última tentativa, passo a passo", "Last attempt, step by step", "Último intento, paso a paso")}**\n`
        + marcos.map((m) => `\`${String(m.ms).padStart(6)}ms\` ${m.nome}`).join("\n")
      : "";

    const passo = (nome) => d.etapas?.find((e) => e.etapa === nome);
    const api = passo("api+token"), canal = passo("canal"), jc = passo("join_call"), tcp = passo("livekit-tcp");
    let veredito;
    if (d.flagNode !== "ok") {
      veredito = tr(ctx,
        "⚠️ **O serviço está sem a flag do Node.** Suba o `judy-voz` com `--no-experimental-global-navigator` — sem ela a entrada falha sempre.",
        "⚠️ **The service is missing the Node flag.** Start `judy-voz` with `--no-experimental-global-navigator` — without it joining always fails.",
        "⚠️ **Al servicio le falta la flag de Node.** Arranca `judy-voz` con `--no-experimental-global-navigator` — sin ella la entrada falla siempre.");
    } else if (api?.ok === false) {
      veredito = tr(ctx,
        "🔎 **Nem a autenticação passa.** Não é a call: é o token ou o alcance da API. Confira se o `BOT_TOKEN` no `.env` do `judy-voz` é o **mesmo** do bot, e se a máquina alcança a API do Stoat.",
        "🔎 **Authentication itself fails.** It's not the call: it's the token or reaching the API. Check that `BOT_TOKEN` in `judy-voz`'s `.env` is the **same** as the bot's, and that the machine can reach Stoat's API.",
        "🔎 **Ni siquiera pasa la autenticación.** No es la llamada: es el token o el acceso a la API. Comprueba que el `BOT_TOKEN` del `.env` de `judy-voz` sea el **mismo** que el del bot, y que la máquina llegue a la API de Stoat.");
    } else if (canal?.ok === false) {
      veredito = tr(ctx,
        `🔎 **Não consigo nem ler esse canal.** Ele pode ter sido apagado, ou o bot não o enxerga. Entre na call e mande \`${citarInterno("entrar", PREFIXO)}\` por lá — eu passo a usar esse canal.`,
        `🔎 **I can't even read that channel.** It may have been deleted, or the bot can't see it. Join the call and send \`${citarInterno("entrar", PREFIXO)}\` there — I'll switch to that channel.`,
        `🔎 **Ni siquiera puedo leer ese canal.** Puede que lo hayan borrado, o que el bot no lo vea. Entra en la llamada y envía \`${citar("entrar", "es", PREFIXO)}\` desde allí — pasaré a usar ese canal.`);
    } else if (/UnknownNode/i.test(String(jc?.detalhe ?? ""))) {
      veredito = tr(ctx,
        "🔎 **`UnknownNode`: a call ainda não existe.** O Stoat só sabe em qual servidor de voz uma call está depois que alguém a inicia; antes disso, quem entra precisa **dizer** qual usar. Eu passei a informar isso sozinha ao abrir a sala — se este aviso apareceu, a API não me anunciou nenhum node de voz (veja a etapa `node` acima).\n\nContorno imediato: **entre na call primeiro** e me chame depois.",
        "🔎 **`UnknownNode`: the call doesn't exist yet.** Stoat only knows which voice server a call lives on after someone starts it; before that, whoever joins has to **say** which one to use. I now provide that myself when opening the room — if you're seeing this, the API announced no voice node at all (see the `node` step above).\n\nImmediate workaround: **join the call first**, then call me.",
        "🔎 **`UnknownNode`: la llamada todavía no existe.** Stoat solo sabe en qué servidor de voz está una llamada después de que alguien la inicia; antes de eso, quien entra tiene que **decir** cuál usar. Ahora lo indico yo sola al abrir la sala — si ves este aviso, la API no me anunció ningún node de voz (mira el paso `node` arriba).\n\nSolución inmediata: **entra en la llamada primero** y llámame después.");
    } else if (/AlreadyConnected/i.test(String(jc?.detalhe ?? ""))) {
      veredito = tr(ctx,
        `🔎 **\`AlreadyConnected\`: o Stoat me registra como já estando nesta call.** Não é permissão nem rede: é um registro preso no lado dele, sobra de uma entrada que travou no meio.\n\n\`${citarInterno("entrar", PREFIXO)}\` já resolve isso sozinho: entra por outra call e se move para esta — o mover emite um token sem conferir o registro preso. _(Remover pelo cliente ou kick passam pela mesma chave que o destravar, então não adiantam quando ele não adianta.)_`,
        `🔎 **\`AlreadyConnected\`: Stoat records me as already in this call.** Not permission, not network: a stuck record on their side, left over from a join that jammed halfway.\n\n\`${citarInterno("entrar", PREFIXO)}\` already handles this by itself: it comes in through another call and moves me here — the move issues a token without checking the stuck record. _(Removing me in the client or kicking go through the same key as destravar, so they won't help when it doesn't.)_`,
        `🔎 **\`AlreadyConnected\`: Stoat me tiene registrada como si ya estuviera en esta llamada.** No es permiso ni red: es un registro atascado de su lado, resto de una entrada que se trabó a mitad.\n\n\`${citar("entrar", "es", PREFIXO)}\` ya lo resuelve solo: entra por otra llamada y se mueve a esta — el movimiento emite un token sin revisar el registro atascado. _(Sacarme desde el cliente o con kick pasa por la misma clave que destravar, así que no sirve cuando eso no sirve.)_`);
    } else if (jc?.ok === false) {
      const html = /HTML/i.test(String(jc.detalhe ?? ""));
      veredito = html
        ? tr(ctx,
          "🔎 **A resposta do `join_call` veio em HTML, não JSON** — quem respondeu foi um proxy/CDN no caminho, não a API. Isso NÃO quer dizer que o Stoat recusou a entrada: quer dizer que a requisição não chegou até ele. Suspeite do endereço da API (`STOAT_API`) ou de algo interceptando a saída da máquina.",
          "🔎 **`join_call` answered with HTML, not JSON** — a proxy/CDN on the way replied, not the API. This does NOT mean Stoat refused the join: it means the request never reached it. Suspect the API address (`STOAT_API`) or something intercepting the machine's outbound traffic.",
          "🔎 **La respuesta de `join_call` llegó en HTML, no en JSON** — respondió un proxy/CDN en el camino, no la API. Esto NO significa que Stoat rechazó la entrada: significa que la petición nunca le llegó. Sospecha de la dirección de la API (`STOAT_API`) o de algo que intercepta el tráfico de salida de la máquina.")
        : tr(ctx,
          "🔎 **O Stoat recusou o `join_call`.** Veja o HTTP e o tipo acima: `403` é falta de **Connect**/**Speak** para o cargo do bot no canal de voz, `404` é canal inexistente, `409`/`400` com JSON costuma ser o servidor achando que ainda estou na call.",
          "🔎 **Stoat refused `join_call`.** Check the HTTP and type above: `403` is missing **Connect**/**Speak** for the bot's role on the voice channel, `404` is a non-existent channel, `409`/`400` with JSON usually means the server still thinks I'm in the call.",
          "🔎 **Stoat rechazó el `join_call`.** Mira el HTTP y el tipo arriba: `403` es que falta **Connect**/**Speak** para el rol del bot en el canal de voz, `404` es un canal inexistente, `409`/`400` con JSON suele ser el servidor creyendo que aún estoy en la llamada.");
    } else if (tcp?.ok === false) {
      veredito = tr(ctx,
        "🔎 **A API autoriza, mas não alcanço o LiveKit.** É rede da máquina do serviço: firewall, DNS ou rota de saída. Se nem o TCP abre, o UDP também não vai.",
        "🔎 **The API authorises, but I can't reach LiveKit.** It's the service machine's network: firewall, DNS or outbound routing. If TCP won't even open, UDP won't either.",
        "🔎 **La API autoriza, pero no llego a LiveKit.** Es la red de la máquina del servicio: firewall, DNS o ruta de salida. Si ni el TCP abre, el UDP tampoco.");
    } else if (jc?.ok && tcp?.ok) {
      veredito = tr(ctx,
        `🔎 **Todas as etapas passam neste teste, mas entrar trava mesmo assim.** Então a trava está no que este teste não cobre: a mídia do LiveKit, que anda por **UDP**. Libere UDP de saída na máquina do \`judy-voz\` e confira a MTU da Tailscale.\n\nPara ver por dentro: suba o serviço com \`VOZ_DEBUG=1\`, tente \`${citarInterno("entrar", PREFIXO)}\` e olhe o log — com o debug ligado o LiveKit passa a contar o que faz durante os 20s.`,
        `🔎 **Every step passes in this test, yet joining still jams.** So the jam is in what this test doesn't cover: LiveKit media, which rides on **UDP**. Allow outbound UDP on the \`judy-voz\` machine and check the Tailscale MTU.\n\nTo see inside: start the service with \`VOZ_DEBUG=1\`, try \`${citarInterno("entrar", PREFIXO)}\` and read the log — with debug on, LiveKit narrates what it does during those 20s.`,
        `🔎 **Todos los pasos pasan en esta prueba, pero entrar se atasca igualmente.** Entonces el atasco está en lo que esta prueba no cubre: los medios de LiveKit, que van por **UDP**. Permite UDP de salida en la máquina de \`judy-voz\` y revisa la MTU de Tailscale.\n\nPara verlo por dentro: arranca el servicio con \`VOZ_DEBUG=1\`, prueba \`${citar("entrar", "es", PREFIXO)}\` y mira el log — con el debug activado, LiveKit cuenta lo que hace durante esos 20s.`);
    } else {
      veredito = tr(ctx, "🔎 Resultado inconclusivo — veja as etapas acima.", "🔎 Inconclusive — see the steps above.", "🔎 Resultado no concluyente — mira los pasos de arriba.");
    }
    if (!d.debug) {
      veredito += tr(ctx,
        "\n\n_Para o log contar mais: suba o `judy-voz` com `VOZ_DEBUG=1`._",
        "\n\n_For a more talkative log: start `judy-voz` with `VOZ_DEBUG=1`._",
        "\n\n_Para que el log cuente más: arranca `judy-voz` con `VOZ_DEBUG=1`._");
    }

    return sendEmbed(message.channel, {
      title: tr(ctx, "🩺 Diagnóstico da voz", "🩺 Voice diagnostics", "🩺 Diagnóstico de la voz"),
      description: [
        ...linhas,
        linhaMarcos,
        "",
        `${tr(ctx, "**Na call agora**", "**In the call now**", "**En la llamada ahora**")}: ${d.naCall ? "🟢" : "🔴"}`
          + (d.entrandoAgora ? tr(ctx, " · entrando neste momento", " · entering right now", " · entrando en este momento") : ""),
        "",
        veredito,
      ].filter(Boolean).join("\n"),
      colour: d.ok ? COR.info : COR.aviso,
    });
  }

  // ── destravar: limpa o "AlreadyConnected" do lado do Stoat ──
  if (["destravar", "unstick", "forcarsaida", "leave"].includes(sub)) {
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: "Você precisa de **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Permiso insuficiente", description: "Necesitas **ManageMessages**.", colour: COR.erro }));
    }
    const alvo = c.canalVoz ?? message.channelId;
    let r;
    try { r = await chamar("/destravar", { canalVoz: alvo, serverId, servidores: servidoresConhecidos(ctx) }); }
    catch (e) {
      return sendEmbed(message.channel, {
        title: tr(ctx, "❌ O serviço não respondeu", "❌ The service didn't answer", "❌ El servicio no respondió"),
        description: `\`${String(e.message ?? e).replace(/`/g, "")}\``, colour: COR.erro });
    }
    const linhas = (r?.passos ?? r?.resultados ?? []).map((t) =>
      `${t.ok ? "✅" : "❌"} \`${t.metodo ?? ""} ${String(t.rota ?? "").replace(alvo, "…")}\` — ${t.erro ?? `HTTP ${t.status}`}`);
    return sendEmbed(message.channel, tr(ctx, {
      title: r?.ok ? "🔓 Desconexão pedida" : "⚠️ Continua preso",
      description: [
        ...linhas, "",
        r?.ok
          ? `Pedi a desconexão e o Stoat aceitou. Agora \`${citarInterno("entrar", PREFIXO)}\` **estando na call** — a entrada é que diz se funcionou.`
          : [
            "O Stoat aceitou o pedido (HTTP 200) mas o registro **continua lá** — eu conferi tentando entrar de novo.",
            "",
            "Por quê: essa rota só manda o LiveKit me remover, e quem apaga o registro é o aviso que o LiveKit dispara depois. Se eu já não estava lá (queda de energia, processo morto), não há o que remover e aviso nenhum é disparado.",
            "",
            "**As saídas, da menos à mais drástica:**",
            `1. Use **outra call** — o Stoat só me bloqueia neste canal; em outro eu entro normalmente. \`${citarInterno("entrar", PREFIXO)}\` lá.`,
            "2. Espere: a sala pode expirar sozinha e liberar.",
            `3. **\`${citarInterno("tts.resgatar", PREFIXO)}\`** — entro numa call auxiliar, me movo para esta pelo PATCH do Stoat (que emite token sem conferir o registro preso) e conecto de verdade. _(Kick não resolve: \`member_remove\` lê a mesma chave que esta rota.)_`,
          ].join("\n"),
      ].join("\n"), colour: r?.ok ? COR.sucesso : COR.aviso,
    }, {
      title: r?.ok ? "🔓 Disconnect requested" : "⚠️ Still stuck",
      description: [
        ...linhas, "",
        r?.ok
          ? `I asked to be disconnected and Stoat accepted. Now \`${citarInterno("entrar", PREFIXO)}\` **while in the call** — the join itself will tell.`
          : [
            "Stoat accepted the request (HTTP 200) but the record **is still there** — I checked by trying to join again.",
            "",
            "Why: that route only tells LiveKit to remove me, and what deletes the record is the notice LiveKit fires afterwards. If I wasn't there anymore (power cut, dead process), there's nothing to remove and no notice is fired.",
            "",
            "**Ways out, least to most drastic:**",
            `1. Use **another call** — Stoat only blocks me on this channel; elsewhere I join fine. \`${citarInterno("entrar", PREFIXO)}\` there.`,
            "2. Wait: the room may expire on its own and free it.",
            `3. **\`${citarInterno("tts.resgatar", PREFIXO)}\`** — I join a helper call, move myself here through Stoat's PATCH (which issues a token without checking the stuck record) and connect for real. _(Kicking doesn't help: \`member_remove\` reads the same key this route does.)_`,
          ].join("\n"),
      ].join("\n"), colour: r?.ok ? COR.sucesso : COR.aviso,
    }, {
      title: r?.ok ? "🔓 Desconexión solicitada" : "⚠️ Sigue atascada",
      description: [
        ...linhas, "",
        r?.ok
          ? `Pedí la desconexión y Stoat la aceptó. Ahora \`${citar("entrar", "es", PREFIXO)}\` **estando en la llamada** — la entrada es la que dirá si funcionó.`
          : [
            "Stoat aceptó la petición (HTTP 200) pero el registro **sigue ahí** — lo comprobé intentando entrar de nuevo.",
            "",
            "Por qué: esa ruta solo le pide a LiveKit que me saque, y lo que borra el registro es el aviso que LiveKit dispara después. Si yo ya no estaba (corte de luz, proceso muerto), no hay nada que sacar y no se dispara ningún aviso.",
            "",
            "**Las salidas, de la menos a la más drástica:**",
            `1. Usa **otra llamada** — Stoat solo me bloquea en este canal; en otro entro sin problema. \`${citar("entrar", "es", PREFIXO)}\` allí.`,
            "2. Espera: la sala puede caducar sola y liberarse.",
            `3. **\`${citar("tts.resgatar", "es", PREFIXO)}\`** — entro en una llamada auxiliar, me muevo a esta con el PATCH de Stoat (que emite un token sin revisar el registro atascado) y me conecto de verdad. _(El kick no lo resuelve: \`member_remove\` lee la misma clave que esta ruta.)_`,
          ].join("\n"),
      ].join("\n"), colour: r?.ok ? COR.sucesso : COR.aviso,
    }));
  }

  if (["resgatar", "resgate", "rescue"].includes(sub)) {
    const server = await getServer(message).catch(() => null);
    const presa = c.canalVoz && c.canalVoz !== message.channelId && !pareceCanalDeVoz(message.channel)
      ? c.canalVoz : message.channelId;
    const auxArg = resto ? resolverCanal(resto, { message, server }) : null;
    if (resto && !auxArg) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❓ Não achei essa call", description: `Não reconheci \`${resto}\` como um canal deste servidor.`, colour: COR.aviso },
        { title: "❓ Couldn't find that call", description: `I didn't recognise \`${resto}\` as a channel in this server.`, colour: COR.aviso },
        { title: "❓ No encontré esa llamada", description: `No reconocí \`${resto}\` como un canal de este servidor.`, colour: COR.aviso }));
    }
    const r = await executarResgate({ presa, auxPreferida: auxArg, message, ctx, c, server, lang, anunciar: true });
    return relatarResgate(r, { presa, message, ctx, c, lang });
  }

  if (["reiniciar", "restart", "destravar", "reset"].includes(sub)) {
    if (!membroTemPermissao(message, await getServer(message).catch(() => null), "ManageMessages")) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para reiniciar a voz.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to restart the voice service.", colour: COR.erro },
        { title: "🚫 Permiso insuficiente",
          description: "Necesitas **ManageMessages** para reiniciar la voz.", colour: COR.erro }));
    }
    filtro.limpar(c.canalTexto ?? null);
    try {
      const r = await chamar("/reiniciar", {});
      return sendEmbed(message.channel, tr(ctx,
        { title: r?.ok ? "✅ Voz reiniciada" : "⚠️ Reiniciei, mas com problema",
          description: r?.ok
            ? `Saí de todas as calls e recriei a conexão.\n\nAgora: \`${citarInterno("entrar", PREFIXO)}\``
            : `\`${r?.erro}\`\n\nVeja \`${citarInterno("tts.estado", PREFIXO)}\`.`,
          colour: r?.ok ? COR.sucesso : COR.aviso },
        { title: r?.ok ? "✅ Voice restarted" : "⚠️ Restarted, but with a problem",
          description: r?.ok
            ? `I left every call and rebuilt the connection.\n\nNow: \`${citarInterno("entrar", PREFIXO)}\``
            : `\`${r?.erro}\`\n\nSee \`${citarInterno("tts.estado", PREFIXO)}\`.`,
          colour: r?.ok ? COR.sucesso : COR.aviso },
        { title: r?.ok ? "✅ Voz reiniciada" : "⚠️ Reinicié, pero con un problema",
          description: r?.ok
            ? `Salí de todas las llamadas y recreé la conexión.\n\nAhora: \`${citar("entrar", "es", PREFIXO)}\``
            : `\`${r?.erro}\`\n\nMira \`${citar("tts.estado", "es", PREFIXO)}\`.`,
          colour: r?.ok ? COR.sucesso : COR.aviso }));
    } catch (e) {
      return sendEmbed(message.channel, {
        title: tr(ctx, "❌ Não consegui reiniciar", "❌ Couldn't restart", "❌ No pude reiniciar"),
        description: `\`${e.message}\`\n\n${tr(ctx,
          "O serviço de voz pode estar fora do ar — aí precisa de mão na máquina.",
          "The voice service itself may be down — it needs a hand on the machine.",
          "Puede que el servicio de voz esté caído — entonces hay que intervenir en la máquina.")}`,
        colour: COR.erro });
    }
  }

  // ── filtro (consulta pública, mudança é staff) ──
  if (["filtro", "filter", "peneira"].includes(sub)) {
    const acao = (args[1] ?? "").toLowerCase();
    if (["teste", "test"].includes(acao)) {
      const alvo = args.slice(2).join(" ");
      if (!alvo) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falta o texto", description: `Uso: \`${citarInterno("tts.filtro.teste", PREFIXO)} <texto>\``, colour: COR.erro },
          { title: "❌ Missing text", description: `Usage: \`${citarInterno("tts.filtro.teste", PREFIXO)} <text>\``, colour: COR.erro },
          { title: "❌ Falta el texto", description: `Uso: \`${citar("tts.filtro.teste", "es", PREFIXO)} <texto>\``, colour: COR.erro }));
      }
      const v = filtro.avaliar(alvo);
      return sendEmbed(message.channel, {
        title: v.falar ? tr(ctx, "🔊 Seria falado", "🔊 Would be spoken", "🔊 Se diría en voz alta") : tr(ctx, "🔇 Seria ignorado", "🔇 Would be ignored", "🔇 Se ignoraría"),
        description: `\`${alvo.slice(0, 200)}\`\n\n**${tr(ctx, "Motivo", "Reason", "Motivo")}:** \`${v.motivo}\``,
        colour: v.falar ? COR.sucesso : COR.aviso,
      });
    }
    if (!acao || acao === "status") {
      const est = c.canalTexto ? filtro.estadoDoCanal(c.canalTexto) : null;
      return sendEmbed(message.channel, tr(ctx, {
        title: "🧹 Peneira da transmissão",
        description: [
          `**Estado:** ${c.filtro === false ? "🔴 desligada" : "🟢 ligada"}`,
          `**Teto por minuto no canal:** ${c.porMinuto ?? filtro.PADROES.porMinuto}`,
          est ? `**Agora:** ${est.noMinuto} fala(s) no último minuto${est.silenciado ? ` · 🤫 em silêncio por mais ${Math.ceil(est.faltamMs / 1000)}s` : ""}` : null,
          "",
          "Ignoro mensagens que são **forma de barulho**, não conteúdo:",
          "• letra repetida (`renaaaaaa…`) · bloco repetido (`lalalala`)",
          "• pouca variedade de caracteres (`9?99?999?`) · só pontuação ou emoji",
          "• 1 caractere sozinho · parede de texto (acima de 600 caracteres)",
          "",
          "_Risada (`kkkk`, `rsrs`, `hahaha`) passa de propósito._",
          "",
          `\`${citarInterno("tts.filtro.teste", PREFIXO)} <texto>\` — ver o que aconteceria com uma frase`,
          `\`${citarInterno("tts.filtro", PREFIXO)} on|off\` · \`${citarInterno("tts.filtro.porminuto", PREFIXO)} <n>\` *(ManageMessages)*`,
        ].filter(Boolean).join("\n"),
        colour: COR.info,
      }, {
        title: "🧹 Broadcast sieve",
        description: [
          `**State:** ${c.filtro === false ? "🔴 off" : "🟢 on"}`,
          `**Per-minute cap on the channel:** ${c.porMinuto ?? filtro.PADROES.porMinuto}`,
          est ? `**Right now:** ${est.noMinuto} utterance(s) in the last minute${est.silenciado ? ` · 🤫 quiet for ${Math.ceil(est.faltamMs / 1000)}s more` : ""}` : null,
          "",
          "I skip messages that are **noise by shape**, not by content:",
          "• repeated letter (`renaaaaaa…`) · repeated block (`lalalala`)",
          "• few distinct characters (`9?99?999?`) · punctuation or emoji only",
          "• a single character · wall of text (over 600 characters)",
          "",
          "_Laughter (`kkkk`, `rsrs`, `hahaha`) passes on purpose._",
          "",
          `\`${citarInterno("tts.filtro.teste", PREFIXO)} <text>\` — see what would happen to a sentence`,
          `\`${citarInterno("tts.filtro", PREFIXO)} on|off\` · \`${citarInterno("tts.filtro.porminuto", PREFIXO)} <n>\` *(ManageMessages)*`,
        ].filter(Boolean).join("\n"),
        colour: COR.info,
      }, {
        title: "🧹 Filtro de la transmisión",
        description: [
          `**Estado:** ${c.filtro === false ? "🔴 desactivado" : "🟢 activado"}`,
          `**Tope por minuto en el canal:** ${c.porMinuto ?? filtro.PADROES.porMinuto}`,
          est ? `**Ahora:** ${est.noMinuto} frase(s) en el último minuto${est.silenciado ? ` · 🤫 en silencio ${Math.ceil(est.faltamMs / 1000)}s más` : ""}` : null,
          "",
          "Ignoro los mensajes que son **ruido por su forma**, no por su contenido:",
          "• letra repetida (`renaaaaaa…`) · bloque repetido (`lalalala`)",
          "• poca variedad de caracteres (`9?99?999?`) · solo puntuación o emoji",
          "• 1 carácter suelto · muro de texto (más de 600 caracteres)",
          "",
          "_La risa (`kkkk`, `rsrs`, `hahaha`) pasa a propósito._",
          "",
          `\`${citar("tts.filtro.teste", "es", PREFIXO)} <texto>\` — ver qué pasaría con una frase`,
          `\`${citar("tts.filtro", "es", PREFIXO)} on|off\` · \`${citar("tts.filtro.porminuto", "es", PREFIXO)} <n>\` *(ManageMessages)*`,
        ].filter(Boolean).join("\n"),
        colour: COR.info,
      }));
    }
    if (!membroTemPermissao(message, await getServer(message).catch(() => null), "ManageMessages")) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para mexer na peneira.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to change the sieve.", colour: COR.erro },
        { title: "🚫 Permiso insuficiente",
          description: "Necesitas **ManageMessages** para cambiar el filtro.", colour: COR.erro }));
    }
    if (acao === "on" || acao === "off") {
      c.filtro = acao === "on"; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: c.filtro ? "✅ Peneira ligada" : "🔴 Peneira desligada",
          description: c.filtro ? "Volto a ignorar barulho na transmissão."
            : "⚠️ Vou falar **tudo** que for escrito no canal de transmissão, inclusive paredes de texto repetido.",
          colour: c.filtro ? COR.sucesso : COR.aviso },
        { title: c.filtro ? "✅ Sieve on" : "🔴 Sieve off",
          description: c.filtro ? "I'll skip noise on the broadcast again."
            : "⚠️ I'll speak **everything** written in the broadcast channel, walls of repeated text included.",
          colour: c.filtro ? COR.sucesso : COR.aviso },
        { title: c.filtro ? "✅ Filtro activado" : "🔴 Filtro desactivado",
          description: c.filtro ? "Vuelvo a ignorar el ruido en la transmisión."
            : "⚠️ Voy a decir **todo** lo que se escriba en el canal de transmisión, incluidos los muros de texto repetido.",
          colour: c.filtro ? COR.sucesso : COR.aviso }));
    }
    if (["porminuto", "perminute", "teto", "cap"].includes(acao)) {
      const n = Number(args[2]);
      if (!Number.isFinite(n) || n < 1 || n > 60) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Valor inválido", description: `Uso: \`${citarInterno("tts.filtro.porminuto", PREFIXO)} <1 a 60>\``, colour: COR.erro },
          { title: "❌ Invalid value", description: `Usage: \`${citarInterno("tts.filtro.porminuto", PREFIXO)} <1 to 60>\``, colour: COR.erro },
          { title: "❌ Valor no válido", description: `Uso: \`${citar("tts.filtro.porminuto", "es", PREFIXO)} <1 a 60>\``, colour: COR.erro }));
      }
      c.porMinuto = Math.round(n); salvarConfig?.();
      filtro.limpar(c.canalTexto ?? null);
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Teto ajustado", description: `Até **${c.porMinuto}** fala(s) por minuto vindas da transmissão.`, colour: COR.sucesso },
        { title: "✅ Cap adjusted", description: `Up to **${c.porMinuto}** utterance(s) per minute from the broadcast.`, colour: COR.sucesso },
        { title: "✅ Tope ajustado", description: `Hasta **${c.porMinuto}** frase(s) por minuto desde la transmisión.`, colour: COR.sucesso }));
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não conheço essa opção", description: `\`${citarInterno("tts.filtro", PREFIXO)} [status|on|off|porminuto <n>|teste <texto>]\``, colour: COR.erro },
      { title: "❌ Unknown option", description: `\`${citarInterno("tts.filtro", PREFIXO)} [status|on|off|porminuto <n>|teste <text>]\``, colour: COR.erro },
      { title: "❌ No conozco esa opción", description: `\`${citar("tts.filtro", "es", PREFIXO)} [status|on|off|perminute <n>|test <texto>]\``, colour: COR.erro }));
  }

  // Entrar/sair na call é SÓ `&entrar`/`&sair` (que chegam aqui com
  // viaAtalhoVoz). Por `&tts`, essas palavras não são comando nenhum.
  if (ctx.viaAtalhoVoz && ["entrar", "join", "sair", "leave", "ler", "comecar", "começar", "start", "stop"].includes(sub)) {
    const entrando = ["entrar", "join", "ler", "comecar", "começar", "start"].includes(sub);
    const chaveAcao = `${serverId}:${message.authorId}`;
    const faltam = (c.cooldown ?? COOLDOWN_MS) - (Date.now() - (ultimaFala.get(chaveAcao) ?? 0));
    if (faltam > 0 && !ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Calma lá", description: `Espere ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso },
        { title: "⏳ Slow down", description: `Wait ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso },
        { title: "⏳ Con calma", description: `Espera ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso }));
    }
    ultimaFala.set(chaveAcao, Date.now());

    if (entrando) {
      // Fim da meia-verdade: sem o servidor em TTS_SERVIDORES, o bot entrava
      // na call, prometia ler… e a leitura era barrada em silêncio no
      // aoMensagem. Agora o entrar avisa na hora, com o id pronto para copiar.
      if (!servidorPermitido(serverId)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "🔒 Voz desligada neste servidor",
            description: `A leitura por voz só roda nos servidores listados em \`TTS_SERVIDORES\` no \`.env\` do bot.\nPara liberar aqui, quem cuida do bot adiciona este id à lista:\n\`${serverId}\`\n(vários ids separados por vírgula; reinicie o bot depois)`,
            colour: COR.aviso },
          { title: "🔒 Voice disabled on this server",
            description: `Voice reading only runs on servers listed in \`TTS_SERVIDORES\` in the bot's \`.env\`.\nTo enable it here, whoever runs the bot adds this id to the list:\n\`${serverId}\`\n(comma-separated ids; restart the bot afterwards)`,
            colour: COR.aviso },
          { title: "🔒 Voz desactivada en este servidor",
            description: `La lectura por voz solo funciona en los servidores listados en \`TTS_SERVIDORES\` del \`.env\` del bot.\nPara habilitarla aquí, quien administra el bot añade este id a la lista:\n\`${serverId}\`\n(varios ids separados por comas; reinicia el bot después)`,
            colour: COR.aviso }));
      }
      const server = await getServer(message).catch(() => null);
      const achado = descobrirCanalDeVoz(message, server, ctx, c, resto);

      if (!achado.id) {
        const opcoes = achado.opcoes?.length
          ? "\n\n" + achado.opcoes.map((v) => `• <#${v.id ?? v._id}> — \`${citarInterno("entrar", PREFIXO)} ${v.name ?? v.id}\``).join("\n")
          : "";
        const opcoesEs = achado.opcoes?.length
          ? "\n\n" + achado.opcoes.map((v) => `• <#${v.id ?? v._id}> — \`${citar("entrar", "es", PREFIXO)} ${v.name ?? v.id}\``).join("\n")
          : "";
        return sendEmbed(message.channel, tr(ctx, {
          title: achado.naoAchou ? "❓ Não achei essa call" : "❓ Em qual call?",
          description: `${achado.naoAchou ? `\`${achado.naoAchou}\` não é uma call deste servidor.` : "Entre numa call e digite `" + PREFIXO + "entrar` de qualquer canal — eu vou até você."}${
            opcoes ? `\n\nAs calls que encontrei:${opcoes}` : ""}`,
          colour: COR.aviso,
        }, {
          title: achado.naoAchou ? "❓ Couldn't find that call" : "❓ Which call?",
          description: `${achado.naoAchou ? `\`${achado.naoAchou}\` isn't a call on this server.` : "Join a call and type `" + PREFIXO + "entrar` from any channel — I'll come to you."}${
            opcoes ? `\n\nThe calls I found:${opcoes}` : ""}`,
          colour: COR.aviso,
        }, {
          title: achado.naoAchou ? "❓ No encontré esa llamada" : "❓ ¿En qué llamada?",
          description: `${achado.naoAchou ? `\`${achado.naoAchou}\` no es una llamada de este servidor.` : "Entra en una llamada y escribe `" + citar("entrar", "es", PREFIXO) + "` desde cualquier canal — yo voy contigo."}${
            opcoesEs ? `\n\nLas llamadas que encontré:${opcoesEs}` : ""}`,
          colour: COR.aviso,
        }));
      }

      const vinhaDeOutra = !!c.canalVoz && c.canalVoz !== achado.id;
      const mudou = [];
      if (!c.ativo) c.ativo = true;
      if (c.canalVoz !== achado.id) { c.canalVoz = achado.id; mudou.push(tr(ctx, "a call", "the call", "la llamada")); }
      if (c.canalTexto !== message.channelId) {
        c.canalTexto = message.channelId;
        mudou.push(tr(ctx, "o canal que eu leio", "the channel I read", "el canal que leo"));
      }
      salvarConfig?.();

      filtro.limpar(c.canalTexto ?? null);
      try {
        await chamar("/entrar", { canalVoz: c.canalVoz, serverId, servidores: servidoresConhecidos(ctx) });
      } catch (e) {
        const motivo = String(e.message ?? e).replace(/`/g, "");
        if (/AlreadyConnected/i.test(motivo)) {
          const r = await executarResgate({ presa: c.canalVoz, message, ctx, c, server, lang, anunciar: true });
          return relatarResgate(r, { presa: c.canalVoz, message, ctx, c, lang });
        }
        return sendEmbed(message.channel, {
          title: tr(ctx, "❌ Não consegui entrar", "❌ Couldn't join", "❌ No pude entrar"),
          description: `\`${motivo}\`\n\n${tr(ctx,
            `**Entre na call antes de me chamar** — entrar numa call vazia é onde costuma travar.\n\nDescubra onde: \`${citarInterno("tts.diagnostico", PREFIXO)}\``,
            `**Make sure you're already in the call** before calling me — joining an empty call is where it usually jams.\n\nFind out where: \`${citarInterno("tts.diagnostico", PREFIXO)}\``,
            `**Entra en la llamada antes de llamarme** — entrar en una llamada vacía es donde suele atascarse.\n\nAverigua dónde: \`${citar("tts.diagnostico", "es", PREFIXO)}\``)}`,
          colour: COR.erro });
      }

      return sendEmbed(message.channel, tr(ctx, {
        title: vinhaDeOutra ? "🔊 Vim para cá e já estou lendo" : "🔊 Entrei e já estou lendo",
        description: [
          vinhaDeOutra ? `Saí da call anterior e vim para <#${c.canalVoz}>.` : null,
          `Estou em <#${c.canalVoz}> e **falo tudo que for escrito** em <#${c.canalTexto}>.`,
          "",
          "⚠️ Vale para **todo mundo** que escrever aqui.",
          "",
          `\`${citarInterno("sair", PREFIXO)}\` — saio e paro de ler`,
          `\`${citarInterno("tts.filtro", PREFIXO)}\` — o que eu ignoro (repetição, parede de texto…)`,
          mudou.length
            ? `\n_Escolhi sozinha: ${mudou.join(" · ")}._`
            : "",
        ].filter(Boolean).join("\n"),
        colour: COR.sucesso,
      }, {
        title: vinhaDeOutra ? "🔊 Moved over and already reading" : "🔊 Joined and already reading",
        description: [
          vinhaDeOutra ? `I left the previous call and came to <#${c.canalVoz}>.` : null,
          `I'm in <#${c.canalVoz}> and I **speak everything written** in <#${c.canalTexto}>.`,
          "",
          "⚠️ That applies to **everyone** writing here.",
          "",
          `\`${citarInterno("sair", PREFIXO)}\` — I leave and stop reading`,
          `\`${citarInterno("tts.filtro", PREFIXO)}\` — what I skip (repetition, walls of text…)`,
          mudou.length
            ? `\n_I picked on my own: ${mudou.join(" · ")}._`
            : "",
        ].filter(Boolean).join("\n"),
        colour: COR.sucesso,
      }, {
        title: vinhaDeOutra ? "🔊 Me vine aquí y ya estoy leyendo" : "🔊 Entré y ya estoy leyendo",
        description: [
          vinhaDeOutra ? `Salí de la llamada anterior y vine a <#${c.canalVoz}>.` : null,
          `Estoy en <#${c.canalVoz}> y **digo todo lo que se escriba** en <#${c.canalTexto}>.`,
          "",
          "⚠️ Vale para **todos** los que escriban aquí.",
          "",
          `\`${citar("sair", "es", PREFIXO)}\` — salgo y dejo de leer`,
          `\`${citar("tts.filtro", "es", PREFIXO)}\` — lo que ignoro (repetición, muros de texto…)`,
          mudou.length
            ? `\n_Elegí yo sola: ${mudou.join(" · ")}._`
            : "",
        ].filter(Boolean).join("\n"),
        colour: COR.sucesso,
      }));
    }

    try { await chamar("/sair", { canalVoz: c.canalVoz }); } catch {}
    filtro.limpar(c.canalTexto ?? null);
    const lia = !!c.canalTexto;
    c.canalTexto = null;
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx, {
      title: "👋 Saí da call",
      description: [
        lia ? "Parei de ler as mensagens também." : "Até a próxima.",
        "",
        `Para voltar: \`${citarInterno("entrar", PREFIXO)}\` estando numa call.`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: "👋 Left the call",
      description: [
        lia ? "I stopped reading the messages as well." : "See you.",
        "",
        `To come back: \`${citarInterno("entrar", PREFIXO)}\` while in a call.`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: "👋 Salí de la llamada",
      description: [
        lia ? "También dejé de leer los mensajes." : "Hasta la próxima.",
        "",
        `Para volver: \`${citar("entrar", "es", PREFIXO)}\` estando en una llamada.`,
      ].join("\n"),
      colour: COR.sucesso,
    }));
  }

  // ── dicionário: como a escrita de chat vira fala ──
  if (["dicionario", "dicionário", "dictionary", "abreviacoes", "abreviações", "abbrev"].includes(sub)) {
    const acao = (args[1] ?? "").toLowerCase();
    const proprias = c.dicionario ?? {};
    const listar = () => {
      const entradas = Object.entries(proprias);
      return sendEmbed(message.channel, tr(ctx, {
        title: "📖 Dicionário da fala",
        description: [
          `**Embutidas:** ${c.expandir === false ? "🔴 desligadas" : `🟢 ${Object.keys(abrev.PADRAO).length}`} _(\`${citarInterno("tts.dicionario.padrao", PREFIXO)} on|off\`)_`,
          `**Deste servidor:** ${entradas.length}`,
          entradas.length ? "\n" + entradas.map(([k, v]) => `\`${k}\` → ${v}`).join(" · ") : "",
          "",
          `\`${citarInterno("tts.dicionario", PREFIXO)} add <abrev> <texto>\` — adiciona`,
          `\`${citarInterno("tts.dicionario", PREFIXO)} remove <abrev>\` — tira`,
          `\`${citarInterno("tts.dicionario.teste", PREFIXO)} <frase>\` — mostra como sairia falado`,
        ].filter(Boolean).join("\n"), colour: COR.info,
      }, {
        title: "📖 Speech dictionary",
        description: [
          `**Built-in:** ${c.expandir === false ? "🔴 off" : `🟢 ${Object.keys(abrev.PADRAO).length}`} _(\`${citarInterno("tts.dicionario.padrao", PREFIXO)} on|off\`)_`,
          `**This server's:** ${entradas.length}`,
          entradas.length ? "\n" + entradas.map(([k, v]) => `\`${k}\` → ${v}`).join(" · ") : "",
          "",
          `\`${citarInterno("tts.dicionario", PREFIXO)} add <abbrev> <text>\` — add`,
          `\`${citarInterno("tts.dicionario", PREFIXO)} remove <abbrev>\` — remove`,
          `\`${citarInterno("tts.dicionario.teste", PREFIXO)} <phrase>\` — show how it would be spoken`,
        ].filter(Boolean).join("\n"), colour: COR.info,
      }, {
        title: "📖 Diccionario del habla",
        description: [
          `**Integradas:** ${c.expandir === false ? "🔴 desactivadas" : `🟢 ${Object.keys(abrev.PADRAO).length}`} _(\`${citar("tts.dicionario.padrao", "es", PREFIXO)} on|off\`)_`,
          `**De este servidor:** ${entradas.length}`,
          entradas.length ? "\n" + entradas.map(([k, v]) => `\`${k}\` → ${v}`).join(" · ") : "",
          "",
          `\`${citar("tts.dicionario", "es", PREFIXO)} add <abrev> <texto>\` — añade`,
          `\`${citar("tts.dicionario", "es", PREFIXO)} remove <abrev>\` — quita`,
          `\`${citar("tts.dicionario.teste", "es", PREFIXO)} <frase>\` — muestra cómo se diría en voz alta`,
        ].filter(Boolean).join("\n"), colour: COR.info,
      }));
    };
    if (!acao || ["lista", "list", "ver", "show"].includes(acao)) return listar();

    if (["teste", "test", "testar"].includes(acao)) {
      const frase = args.slice(2).join(" ").trim();
      if (!frase) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❓ Testar o quê?", description: `\`${citarInterno("tts.dicionario.teste", PREFIXO)} vc n vem hj?\``, colour: COR.aviso },
          { title: "❓ Test what?", description: `\`${citarInterno("tts.dicionario.teste", PREFIXO)} vc n vem hj?\``, colour: COR.aviso },
          { title: "❓ ¿Probar qué?", description: `\`${citar("tts.dicionario.teste", "es", PREFIXO)} vc n vem hj?\``, colour: COR.aviso }));
      }
      const saida = abrev.expandir(frase, proprias, c.expandir !== false);
      return sendEmbed(message.channel, {
        title: tr(ctx, "🗣️ Como sairia falado", "🗣️ How it would be spoken", "🗣️ Cómo se diría en voz alta"),
        description: `\`${frase.slice(0, 200)}\`\n↓\n**${saida.slice(0, 400)}**${
          saida === frase ? `\n\n_${tr(ctx, "nada mudou — nenhuma abreviação bateu", "nothing changed — no abbreviation matched", "nada cambió — ninguna abreviatura coincidió")}_` : ""}`,
        colour: COR.info });
    }

    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: `Ver o dicionário é livre; mudar precisa de **ManageMessages**.\n\n\`${citarInterno("tts.dicionario", PREFIXO)}\` mostra o que está valendo.`, colour: COR.erro },
        { title: "🚫 Missing permission", description: `Viewing the dictionary is open; changing it needs **ManageMessages**.\n\n\`${citarInterno("tts.dicionario", PREFIXO)}\` shows what's in effect.`, colour: COR.erro },
        { title: "🚫 Permiso insuficiente", description: `Ver el diccionario es libre; cambiarlo requiere **ManageMessages**.\n\n\`${citar("tts.dicionario", "es", PREFIXO)}\` muestra lo que está vigente.`, colour: COR.erro }));
    }

    if (["padrao", "padrão", "default", "embutidas", "builtin"].includes(acao)) {
      const v = (args[2] ?? "").toLowerCase();
      if (!["on", "off", "ligar", "desligar"].includes(v)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❓ Ligar ou desligar?", description: `\`${citarInterno("tts.dicionario.padrao", PREFIXO)} on\` ou \`off\` — vale para as ${Object.keys(abrev.PADRAO).length} abreviações embutidas. As deste servidor continuam valendo de qualquer jeito.`, colour: COR.aviso },
          { title: "❓ On or off?", description: `\`${citarInterno("tts.dicionario.padrao", PREFIXO)} on\` or \`off\` — applies to the ${Object.keys(abrev.PADRAO).length} built-in abbreviations. This server's own entries keep working either way.`, colour: COR.aviso },
          { title: "❓ ¿Activar o desactivar?", description: `\`${citar("tts.dicionario.padrao", "es", PREFIXO)} on\` u \`off\` — vale para las ${Object.keys(abrev.PADRAO).length} abreviaturas integradas. Las de este servidor siguen valiendo de todos modos.`, colour: COR.aviso }));
      }
      c.expandir = ["on", "ligar"].includes(v);
      salvarConfig?.();
      return sendEmbed(message.channel, {
        title: c.expandir
          ? tr(ctx, "🟢 Abreviações embutidas ligadas", "🟢 Built-in abbreviations on", "🟢 Abreviaturas integradas activadas")
          : tr(ctx, "🔴 Abreviações embutidas desligadas", "🔴 Built-in abbreviations off", "🔴 Abreviaturas integradas desactivadas"),
        description: c.expandir
          ? tr(ctx, `\`vc n vem hj\` → **você não vem hoje**`, `\`vc n vem hj\` → **você não vem hoje**`, `\`vc n vem hj\` → **você não vem hoje**`)
          : tr(ctx, "Agora só valem as entradas deste servidor.", "Only this server's own entries apply now.", "Ahora solo valen las entradas de este servidor."),
        colour: COR.sucesso });
    }

    if (["add", "adicionar", "por", "pôr", "set"].includes(acao)) {
      const chave = (args[2] ?? "").toLowerCase();
      const valor = args.slice(3).join(" ").trim();
      if (!chave || !valor) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❓ Faltou o quê e por quê", description: `\`${citarInterno("tts.dicionario", PREFIXO)} add vish vixi\` — a abreviação primeiro, o texto falado depois.`, colour: COR.aviso },
          { title: "❓ Missing what and with what", description: `\`${citarInterno("tts.dicionario", PREFIXO)} add vish vixi\` — abbreviation first, spoken text after.`, colour: COR.aviso },
          { title: "❓ Falta qué y por qué", description: `\`${citar("tts.dicionario", "es", PREFIXO)} add vish vixi\` — primero la abreviatura, después el texto hablado.`, colour: COR.aviso }));
      }
      if (/\s/.test(chave)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ A abreviação é uma palavra só", description: "Ela é trocada palavra por palavra, então `de boa` nunca casaria. Use uma palavra só do lado esquerdo — o direito pode ter quantas quiser.", colour: COR.erro },
          { title: "❌ The abbreviation must be a single word", description: "It's replaced word by word, so `de boa` would never match. Use one word on the left — the right side can have as many as you like.", colour: COR.erro },
          { title: "❌ La abreviatura es una sola palabra", description: "Se reemplaza palabra por palabra, así que `de boa` nunca coincidiría. Usa una sola palabra a la izquierda — la derecha puede tener las que quieras.", colour: COR.erro }));
      }
      if (Object.keys(proprias).length >= 200 && !(chave in proprias)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Dicionário cheio", description: `São 200 entradas no máximo. \`${citarInterno("tts.dicionario", PREFIXO)} remove <abrev>\` abre espaço.`, colour: COR.erro },
          { title: "❌ Dictionary full", description: `200 entries max. \`${citarInterno("tts.dicionario", PREFIXO)} remove <abbrev>\` frees a slot.`, colour: COR.erro },
          { title: "❌ Diccionario lleno", description: `Son 200 entradas como máximo. \`${citar("tts.dicionario", "es", PREFIXO)} remove <abrev>\` libera espacio.`, colour: COR.erro }));
      }
      const antes = proprias[chave];
      proprias[chave] = valor.slice(0, 120);
      c.dicionario = proprias;
      salvarConfig?.();
      const exemplo = abrev.expandir(chave, proprias, c.expandir !== false);
      return sendEmbed(message.channel, {
        title: tr(ctx, "✅ Guardei no dicionário", "✅ Added to the dictionary", "✅ Guardado en el diccionario"),
        description: `\`${chave}\` → **${exemplo}**${antes ? `\n\n_${tr(ctx, "antes era", "was", "antes era")}: ${antes}_` : ""}${
          chave in abrev.PADRAO ? `\n\n_${tr(ctx, "isto sobrescreve a entrada embutida", "this overrides the built-in entry", "esto sobrescribe la entrada integrada")}_` : ""}`,
        colour: COR.sucesso });
    }

    if (["remove", "remover", "tirar", "del", "delete", "rm"].includes(acao)) {
      const chave = (args[2] ?? "").toLowerCase();
      if (!chave || !(chave in proprias)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❓ Não achei essa entrada", description: `\`${citarInterno("tts.dicionario", PREFIXO)}\` lista o que este servidor tem.${
            chave in abrev.PADRAO ? `\n\n\`${chave}\` é embutida: para anular só ela, \`${citarInterno("tts.dicionario", PREFIXO)} add ${chave} ${chave}\`.` : ""}`, colour: COR.aviso },
          { title: "❓ No such entry", description: `\`${citarInterno("tts.dicionario", PREFIXO)}\` lists this server's entries.${
            chave in abrev.PADRAO ? `\n\n\`${chave}\` is built in: to cancel just that one, \`${citarInterno("tts.dicionario", PREFIXO)} add ${chave} ${chave}\`.` : ""}`, colour: COR.aviso },
          { title: "❓ No encontré esa entrada", description: `\`${citar("tts.dicionario", "es", PREFIXO)}\` lista lo que tiene este servidor.${
            chave in abrev.PADRAO ? `\n\n\`${chave}\` es integrada: para anular solo esa, \`${citar("tts.dicionario", "es", PREFIXO)} add ${chave} ${chave}\`.` : ""}`, colour: COR.aviso }));
      }
      delete proprias[chave];
      c.dicionario = proprias;
      salvarConfig?.();
      return sendEmbed(message.channel, {
        title: tr(ctx, "🗑️ Tirei do dicionário", "🗑️ Removed", "🗑️ Quitado del diccionario"),
        description: `\`${chave}\``, colour: COR.sucesso });
    }

    return listar();
  }

  // ── nomes: anunciar ou não quem escreveu ──
  if (["nomes", "nome", "names", "anunciar"].includes(sub)) {
    const v = (args[1] ?? "").toLowerCase();
    if (!["on", "off", "ligar", "desligar"].includes(v)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🗣️ Anúncio de quem falou",
          description: `Agora: ${c.anunciarNome === false ? "🔴 **off** — leio só a mensagem" : "🟢 **on** — leio \\\"Fulano disse: …\\\""}\n\n\`${citarInterno("tts.nomes", PREFIXO)} on|off\``,
          colour: COR.info },
        { title: "🗣️ Announcing who spoke",
          description: `Currently: ${c.anunciarNome === false ? "🔴 **off** — I read the message only" : "🟢 **on** — I read \\\"So-and-so said: …\\\""}\n\n\`${citarInterno("tts.nomes", PREFIXO)} on|off\``,
          colour: COR.info },
        { title: "🗣️ Anuncio de quién habló",
          description: `Ahora: ${c.anunciarNome === false ? "🔴 **off** — leo solo el mensaje" : "🟢 **on** — leo \\\"Fulano disse: …\\\""}\n\n\`${citar("tts.nomes", "es", PREFIXO)} on|off\``,
          colour: COR.info }));
    }
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: "Você precisa de **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Permiso insuficiente", description: "Necesitas **ManageMessages**.", colour: COR.erro }));
    }
    c.anunciarNome = ["on", "ligar"].includes(v);
    salvarConfig?.();
    return sendEmbed(message.channel, {
      title: c.anunciarNome
        ? tr(ctx, "🟢 Vou anunciar quem falou", "🟢 I'll announce who spoke", "🟢 Voy a anunciar quién habló")
        : tr(ctx, "🔴 Vou ler só a mensagem", "🔴 I'll read the message only", "🔴 Voy a leer solo el mensaje"),
      colour: COR.sucesso });
  }

  // ── cooldown: freio entre falas da MESMA pessoa ──
  if (["cooldown", "espera", "freio"].includes(sub)) {
    if (!resto) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Espera entre falas",
          description: `Agora: **${Math.round((c.cooldown ?? COOLDOWN_MS) / 1000)}s** por pessoa.\n\n\`${citarInterno("tts.cooldown", PREFIXO)} <segundos>\` — \`0\` desliga.\n_A equipe não passa por ele. O teto por minuto do canal é outro: \`${citarInterno("tts.filtro", PREFIXO)}\`._`,
          colour: COR.info },
        { title: "⏳ Wait between messages",
          description: `Currently: **${Math.round((c.cooldown ?? COOLDOWN_MS) / 1000)}s** per person.\n\n\`${citarInterno("tts.cooldown", PREFIXO)} <seconds>\` — \`0\` turns it off.\n_Staff isn't subject to it. The per-minute channel cap is separate: \`${citarInterno("tts.filtro", PREFIXO)}\`._`,
          colour: COR.info },
        { title: "⏳ Espera entre frases",
          description: `Ahora: **${Math.round((c.cooldown ?? COOLDOWN_MS) / 1000)}s** por persona.\n\n\`${citar("tts.cooldown", "es", PREFIXO)} <segundos>\` — \`0\` la desactiva.\n_El staff no pasa por ella. El tope por minuto del canal es otro: \`${citar("tts.filtro", "es", PREFIXO)}\`._`,
          colour: COR.info }));
    }
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: "Você precisa de **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Permiso insuficiente", description: "Necesitas **ManageMessages**.", colour: COR.erro }));
    }
    const n = Number(String(resto).replace(",", ".").replace(/s$/i, ""));
    if (!Number.isFinite(n) || n < 0 || n > 300) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Valor inválido", description: "Um número de segundos entre 0 e 300.", colour: COR.erro },
        { title: "❌ Invalid value", description: "A number of seconds between 0 and 300.", colour: COR.erro },
        { title: "❌ Valor no válido", description: "Un número de segundos entre 0 y 300.", colour: COR.erro }));
    }
    c.cooldown = Math.round(n * 1000);
    salvarConfig?.();
    return sendEmbed(message.channel, {
      title: tr(ctx, "⏳ Espera atualizada", "⏳ Wait updated", "⏳ Espera actualizada"),
      description: n === 0
        ? tr(ctx, "Sem espera entre falas da mesma pessoa.", "No wait between messages from the same person.", "Sin espera entre frases de la misma persona.")
        : tr(ctx, `**${n}s** por pessoa.`, `**${n}s** per person.`, `**${n}s** por persona.`),
      colour: COR.sucesso });
  }

  if (["voz", "voice", "efeito", "effect", "efeitos", "tom", "pitch"].includes(sub)) {
    const ehVoz = ["voz", "voice"].includes(sub);
    const ehTom = ["tom", "pitch"].includes(sub);
    let saude = null;
    if (!ehTom) {
      try { saude = await chamar("/saude", null, "GET"); }
      catch (e) {
        return sendEmbed(message.channel, {
          title: tr(ctx, "❌ O serviço de voz não respondeu", "❌ The voice service didn't answer", "❌ El servicio de voz no respondió"),
          description: `\`${String(e.message ?? e).replace(/`/g, "")}\`\n\n\`${tr(ctx, citarInterno("tts.estado", PREFIXO), citarInterno("tts.estado", PREFIXO), citar("tts.estado", "es", PREFIXO))}\``, colour: COR.erro });
      }
    }
    const opcoes = ehVoz ? (saude?.piper?.vozes ?? []) : (saude?.efeitos ?? []);
    const atual = ehVoz ? (c.voz ?? saude?.piper?.vozAtual) : (c.efeito ?? null);

    if (ehTom && !resto) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎚️ Tom da voz",
          description: `Agora: **${c.tom ?? 1}** _(1.0 = original)_\n\n\`${citarInterno("tts.tom", PREFIXO)} 1.05\` — sobe tom **e formantes** juntos, então uma voz masculina vira feminina de verdade. Se a base já é feminina, mexa pouco: acima de 1.05 soa infantil.\n\`${citarInterno("tts.tom", PREFIXO)} 1\` volta ao original.`,
          colour: COR.info },
        { title: "🎚️ Voice pitch",
          description: `Currently: **${c.tom ?? 1}** _(1.0 = original)_\n\n\`${citarInterno("tts.tom", PREFIXO)} 1.05\` — raises pitch **and formants** together, so a male voice turns properly female. If the base voice is already female, go easy: above 1.05 it sounds childish.\n\`${citarInterno("tts.tom", PREFIXO)} 1\` restores the original.`,
          colour: COR.info },
        { title: "🎚️ Tono de la voz",
          description: `Ahora: **${c.tom ?? 1}** _(1.0 = original)_\n\n\`${citar("tts.tom", "es", PREFIXO)} 1.05\` — sube el tono **y los formantes** juntos, así que una voz masculina se vuelve femenina de verdad. Si la base ya es femenina, cámbialo poco: por encima de 1.05 suena infantil.\n\`${citar("tts.tom", "es", PREFIXO)} 1\` vuelve al original.`,
          colour: COR.info }));
    }
    if (!ehTom && !resto) {
      return sendEmbed(message.channel, {
        title: ehVoz ? tr(ctx, "🎙️ Vozes", "🎙️ Voices", "🎙️ Voces") : tr(ctx, "🎛️ Efeitos", "🎛️ Effects", "🎛️ Efectos"),
        description: [
          `${tr(ctx, "Agora", "Currently", "Ahora")}: **${atual ?? tr(ctx, "nenhum", "none", "ninguno")}**`,
          "",
          opcoes.length ? opcoes.map((o) => (o === atual ? `**${o}**` : `\`${o}\``)).join(" · ")
            : tr(ctx, "_o serviço não listou nenhum_", "_the service listed none_", "_el servicio no listó ninguno_"),
          "",
          tr(ctx,
            ehVoz ? `\`${citarInterno("tts.voz", PREFIXO)} <nome>\`` : `\`${citarInterno("tts.efeito", PREFIXO)} <nome>\` · \`${citarInterno("tts.efeito", PREFIXO)} nenhum\` tira`,
            ehVoz ? `\`${citarInterno("tts.voz", PREFIXO)} <nome>\`` : `\`${citarInterno("tts.efeito", PREFIXO)} <nome>\` · \`${citarInterno("tts.efeito", PREFIXO)} nenhum\` tira`,
            ehVoz ? `\`${citar("tts.voz", "es", PREFIXO)} <nombre>\`` : `\`${citar("tts.efeito", "es", PREFIXO)} <nombre>\` · \`${citar("tts.efeito", "es", PREFIXO)} none\` lo quita`),
        ].join("\n"), colour: COR.info });
    }

    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: "Você precisa de **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Permiso insuficiente", description: "Necesitas **ManageMessages**.", colour: COR.erro }));
    }

    if (ehTom) {
      const n = Number(String(resto).replace(",", "."));
      if (!Number.isFinite(n) || n < 0.5 || n > 2) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Valor inválido", description: "Um número entre 0.5 e 2 — `1` é o original.", colour: COR.erro },
          { title: "❌ Invalid value", description: "A number between 0.5 and 2 — `1` is the original.", colour: COR.erro },
          { title: "❌ Valor no válido", description: "Un número entre 0.5 y 2 — `1` es el original.", colour: COR.erro }));
      }
      c.tom = n;
      salvarConfig?.();
      return sendEmbed(message.channel, {
        title: tr(ctx, "🎚️ Tom atualizado", "🎚️ Pitch updated", "🎚️ Tono actualizado"),
        description: `**${n}**\n\n${tr(ctx, "Ouça:", "Hear it:", "Escúchalo:")} \`${tr(ctx, citarInterno("tts", PREFIXO), citarInterno("tts", PREFIXO), citar("tts", "es", PREFIXO))} ${tr(ctx, "testando um dois três", "testing one two three", "probando uno dos tres")}\``,
        colour: COR.sucesso });
    }

    const escolha = resto.toLowerCase();
    if (!ehVoz && ["nenhum", "none", "off", "limpar", "clear"].includes(escolha)) {
      c.efeito = null; salvarConfig?.();
      return sendEmbed(message.channel, { title: tr(ctx, "🎛️ Efeito removido", "🎛️ Effect removed", "🎛️ Efecto quitado"), colour: COR.sucesso });
    }
    const achado = opcoes.find((o) => String(o).toLowerCase() === escolha)
      ?? opcoes.find((o) => semAcento(String(o)) === semAcento(escolha));
    if (!achado) {
      return sendEmbed(message.channel, {
        title: ehVoz ? tr(ctx, "❓ Não tenho essa voz", "❓ I don't have that voice", "❓ No tengo esa voz")
                     : tr(ctx, "❓ Não tenho esse efeito", "❓ I don't have that effect", "❓ No tengo ese efecto"),
        description: opcoes.length ? opcoes.map((o) => `\`${o}\``).join(" · ")
          : tr(ctx, "_o serviço não listou nenhum_", "_the service listed none_", "_el servicio no listó ninguno_"),
        colour: COR.aviso });
    }
    if (ehVoz) c.voz = achado; else c.efeito = achado;
    salvarConfig?.();
    return sendEmbed(message.channel, {
      title: ehVoz ? tr(ctx, "🎙️ Voz trocada", "🎙️ Voice changed", "🎙️ Voz cambiada") : tr(ctx, "🎛️ Efeito aplicado", "🎛️ Effect applied", "🎛️ Efecto aplicado"),
      description: `**${achado}**\n\n${tr(ctx, "Ouça:", "Hear it:", "Escúchalo:")} \`${tr(ctx, citarInterno("tts", PREFIXO), citarInterno("tts", PREFIXO), citar("tts", "es", PREFIXO))} ${tr(ctx, "testando um dois três", "testing one two three", "probando uno dos tres")}\``,
      colour: COR.sucesso });
  }

  const talvez = quaseSubcomando(args);
  if (talvez) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🤔 Você quis dizer um comando?",
      description: `\`${citarInterno("tts", PREFIXO)} ${args[0]}\` não é um subcomando — o mais parecido é \`${citarInterno("tts", PREFIXO)} ${talvez}\`.\n\nSe era mesmo para eu **falar** essa palavra, mande \`${citarInterno("tts", PREFIXO)} falar ${args[0]}\`.`,
      colour: COR.aviso,
    }, {
      title: "🤔 Did you mean a command?",
      description: `\`${citarInterno("tts", PREFIXO)} ${args[0]}\` isn't a subcommand — the closest one is \`${citarInterno("tts", PREFIXO)} ${talvez}\`.\n\nIf you really wanted me to **say** that word, send \`${citarInterno("tts", PREFIXO)} falar ${args[0]}\`.`,
      colour: COR.aviso,
    }, {
      title: "🤔 ¿Querías decir un comando?",
      description: `\`${citar("tts", "es", PREFIXO)} ${args[0]}\` no es un subcomando — el más parecido es \`${citar("tts", "es", PREFIXO)} ${talvez}\`.\n\nSi de verdad querías que **dijera** esa palabra, envía \`${citar("tts", "es", PREFIXO)} say ${args[0]}\`.`,
      colour: COR.aviso,
    }));
  }
  // `falar` é a saída explícita: força a fala do que vier depois, mesmo que
  // pareça um comando.
  if (["falar", "fala", "say", "speak"].includes((args[0] ?? "").toLowerCase()) && args.length > 1) {
    args = args.slice(1);
  }
  const texto = args.join(" ").trim();
  if (!texto) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🔊 Voz da Judy",
      description: [
        `**\`${citarInterno("entrar", PREFIXO)}\`** — de qualquer canal, estando numa call. Eu entro na sua call e passo a **falar tudo que for escrito no canal onde você digitou** (\`${citarInterno("entrar", PREFIXO)} call 1\` escolhe a call).`,
        `**\`${citarInterno("sair", PREFIXO)}\`** — saio e paro de ler.`,
        "",
        "É só isso para o uso normal. O resto é ajuste fino:",
        "",
        `\`${citarInterno("tts", PREFIXO)} <texto>\` — falo uma frase específica, mesmo fora da leitura`,
        `\`${citarInterno("tts.voz", PREFIXO)} [nome]\` — troca a voz · \`${citarInterno("tts.efeito", PREFIXO)} <nome>\` · \`${citarInterno("tts.tom", PREFIXO)} <n>\``,
        `\`${citarInterno("tts.filtro", PREFIXO)}\` — o que eu ignoro (repetição, parede de texto…)`,
        `\`${citarInterno("tts.estado", PREFIXO)}\` — está tudo de pé? · \`${citarInterno("tts.diagnostico", PREFIXO)}\` — onde travou`,
        "",
        `\`${citarInterno("tts.dicionario", PREFIXO)}\` — a escrita de chat vira fala (\`vc\` → \`você\`)`,
        "",
        `**Ajustes** _(ManageMessages)_`,
        `\`${citarInterno("tts.nomes", PREFIXO)} on|off\` — anunciar quem falou · \`${citarInterno("tts.cooldown", PREFIXO)} <s>\` — freio por pessoa`,
        `\`${citarInterno("tts.reiniciar", PREFIXO)}\` — quando o serviço de voz trava`,
      ].join("\n"), colour: COR.info,
    }, {
      title: "🔊 Judy's voice",
      description: [
        `**\`${citarInterno("entrar", PREFIXO)}\`** — from any channel, while you're in a call. I join your call and start **speaking everything written in the channel where you typed it** (\`${citarInterno("entrar", PREFIXO)} call 1\` picks the call).`,
        `**\`${citarInterno("sair", PREFIXO)}\`** — I leave and stop reading.`,
        "",
        "That's it for normal use. The rest is fine-tuning:",
        "",
        `\`${citarInterno("tts", PREFIXO)} <text>\` — I say one specific line, even outside the reading`,
        `\`${citarInterno("tts.voz", PREFIXO)} [name]\` — change the voice · \`${citarInterno("tts.efeito", PREFIXO)} <name>\` · \`${citarInterno("tts.tom", PREFIXO)} <n>\``,
        `\`${citarInterno("tts.filtro", PREFIXO)}\` — what I skip (repetition, walls of text…)`,
        `\`${citarInterno("tts.estado", PREFIXO)}\` — is everything up? · \`${citarInterno("tts.diagnostico", PREFIXO)}\` — where it jammed`,
        "",
        `\`${citarInterno("tts.dicionario", PREFIXO)}\` — chat shorthand becomes proper speech (\`vc\` → \`você\`)`,
        "",
        `**Settings** _(ManageMessages)_`,
        `\`${citarInterno("tts.nomes", PREFIXO)} on|off\` — announce who spoke · \`${citarInterno("tts.cooldown", PREFIXO)} <s>\` — per-person brake`,
        `\`${citarInterno("tts.reiniciar", PREFIXO)}\` — when the voice service jams`,
      ].join("\n"), colour: COR.info,
    }, {
      title: "🔊 Voz de Judy",
      description: [
        `**\`${citar("entrar", "es", PREFIXO)}\`** — desde cualquier canal, estando en una llamada. Entro en tu llamada y paso a **decir todo lo que se escriba en el canal donde lo escribiste** (\`${citar("entrar", "es", PREFIXO)} call 1\` elige la llamada).`,
        `**\`${citar("sair", "es", PREFIXO)}\`** — salgo y dejo de leer.`,
        "",
        "Eso es todo para el uso normal. Lo demás es ajuste fino:",
        "",
        `\`${citar("tts", "es", PREFIXO)} <texto>\` — digo una frase concreta, incluso fuera de la lectura`,
        `\`${citar("tts.voz", "es", PREFIXO)} [nombre]\` — cambia la voz · \`${citar("tts.efeito", "es", PREFIXO)} <nombre>\` · \`${citar("tts.tom", "es", PREFIXO)} <n>\``,
        `\`${citar("tts.filtro", "es", PREFIXO)}\` — lo que ignoro (repetición, muros de texto…)`,
        `\`${citar("tts.estado", "es", PREFIXO)}\` — ¿está todo en marcha? · \`${citar("tts.diagnostico", "es", PREFIXO)}\` — dónde se atascó`,
        "",
        `\`${citar("tts.dicionario", "es", PREFIXO)}\` — la escritura de chat se convierte en habla (\`vc\` → \`você\`)`,
        "",
        `**Ajustes** _(ManageMessages)_`,
        `\`${citar("tts.nomes", "es", PREFIXO)} on|off\` — anunciar quién habló · \`${citar("tts.cooldown", "es", PREFIXO)} <s>\` — freno por persona`,
        `\`${citar("tts.reiniciar", "es", PREFIXO)}\` — cuando el servicio de voz se atasca`,
      ].join("\n"), colour: COR.info,
    }));
  }

  if (!c.ativo || !c.canalVoz) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔇 Não estou em nenhuma call",
        description: `Entre numa call e mande \`${citarInterno("entrar", PREFIXO)}\` por lá — eu configuro o resto sozinha.`,
        colour: COR.aviso },
      { title: "🔇 I'm not in any call",
        description: `Join a call and send \`${citarInterno("entrar", PREFIXO)}\` there — I'll set up the rest myself.`,
        colour: COR.aviso },
      { title: "🔇 No estoy en ninguna llamada",
        description: `Entra en una llamada y envía \`${citar("entrar", "es", PREFIXO)}\` desde allí — yo configuro el resto sola.`,
        colour: COR.aviso }));
  }

  // Cooldown: o megafone precisa de freio, mesmo para quem é da casa.
  const chave = `${serverId}:${message.authorId}`;
  const espera = (c.cooldown ?? COOLDOWN_MS) - (Date.now() - (ultimaFala.get(chave) ?? 0));
  if (espera > 0 && !ehStaff) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "⏳ Calma lá", description: `Espere ${Math.ceil(espera / 1000)}s para falar de novo.`, colour: COR.aviso },
      { title: "⏳ Slow down", description: `Wait ${Math.ceil(espera / 1000)}s before speaking again.`, colour: COR.aviso },
      { title: "⏳ Con calma", description: `Espera ${Math.ceil(espera / 1000)}s para hablar de nuevo.`, colour: COR.aviso }));
  }
  ultimaFala.set(chave, Date.now());

  const falado = c.expandir === false ? texto : abrev.expandir(texto, c.dicionario ?? {});
  try {
    const r = await chamar("/falar", { canalVoz: c.canalVoz, texto: falado, voz: c.voz, efeito: c.efeito, tom: c.tom });
    return sendEmbed(message.channel, {
      title: tr(ctx, "🔊 Falando", "🔊 Speaking", "🔊 Hablando"),
      description: `${falado.length > 120 ? falado.slice(0, 120) + "…" : falado}${
        r.naFila > 1 ? `\n\n_${tr(ctx, "na fila", "in queue", "en cola")}: ${r.naFila}_` : ""}`,
      colour: COR.sucesso });
  } catch (e) {
    const motivo = String(e.message ?? e).replace(/`/g, "");
    return sendEmbed(message.channel, {
      title: tr(ctx, "❌ Não consegui falar", "❌ Couldn't speak", "❌ No pude hablar"),
      description: `\`${motivo}\`\n\n${tr(ctx, "Diagnostique com", "Diagnose with", "Diagnostica con")} \`${tr(ctx, citarInterno("tts.diagnostico", PREFIXO), citarInterno("tts.diagnostico", PREFIXO), citar("tts.diagnostico", "es", PREFIXO))}\``,
      colour: COR.erro });
  }
}

// ── Para a música: a call DESTE servidor ──────────────────────────────────────
// A música ia para "a call ativa" do serviço de voz — com o bot em calls de
// dois servidores, ia para a errada — e só funcionava no canal da call. Agora
// o &musica de qualquer canal usa a call do bot neste servidor; se ele não
// está em nenhuma e a pessoa está numa, ele entra nela (sem ligar a leitura
// de texto: o TTS só lê onde alguém deu `&entrar`).
export async function callParaMusica(message, ctx) {
  const c = garantirConfig(ctx.config);
  if (c.ativo && c.canalVoz) return { canal: c.canalVoz };
  if (!servidorPermitido(ctx.serverId)) return { erro: "fora" };
  const server = await ctx.getServer?.(message).catch(() => null);
  const daPessoa = callDaPessoa(server, ctx.client, message.authorId);
  if (!daPessoa) return { erro: "sem-call" };
  const id = daPessoa.id ?? daPessoa._id;
  try {
    await chamar("/entrar", { canalVoz: id, serverId: ctx.serverId, servidores: servidoresConhecidos(ctx) });
  } catch (e) { return { erro: "entrar", detalhe: String(e?.message ?? e) }; }
  c.ativo = true; c.canalVoz = id;
  ctx.salvarConfig?.();
  return { canal: id, entrou: true };
}
