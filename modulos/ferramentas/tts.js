
import { resolverCanal } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";
import * as abrev from "../core/abreviacoes.js";
import * as filtro from "./tts-filtro.js";

const VOZ_URL   = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
const VOZ_CHAVE = process.env.VOZ_CHAVE || "";
const SERVIDORES = (process.env.TTS_SERVIDORES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
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
  "filtro", "entrar", "sair", "voz", "efeito", "tom", "cooldown", "nomes",
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

// Só dispara com UMA palavra: `&tts entrar agora na call` é fala de verdade.
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

function pareceCanalDeVoz(canal) {
  if (!canal) return false;
  const t = String(canal.type ?? canal.channel_type ?? "");
  // Canal de servidor (texto ou voz) serve; DM e categoria, não.
  return /text|voice/i.test(t) || !!canal.voice || !!canal.activeCall;
}

function canaisDeVozDo(server, client) {
  const lista = Array.isArray(server?.channels) ? server.channels
    : (server?.channels && typeof server.channels.values === "function") ? [...server.channels.values()]
    : [];
  const resolvidos = lista.map((c) => (typeof c === "string" ? client?.channels?.get?.(c) : c)).filter(Boolean);
  return resolvidos.filter(pareceCanalDeVoz);
}

function descobrirCanalDeVoz(message, server, ctx, config) {
  const atual = message.channel ?? ctx.client?.channels?.get?.(message.channelId);
  if (message.channelId && pareceCanalDeVoz(atual)) {
    return { id: message.channelId, fonte: "aqui" };
  }
  if (config?.canalVoz) return { id: config.canalVoz, fonte: "configurado" };
  const vozes = canaisDeVozDo(server, ctx.client);
  if (vozes.length === 1) return { id: vozes[0].id ?? vozes[0]._id, fonte: "unico" };
  return { id: null, opcoes: vozes.slice(0, 10) };
}

export function servidorPermitido(serverId) {
  return !!serverId && SERVIDORES.includes(serverId);
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
  const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
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
    })).catch(() => {});
  }

  // 1. entrar na auxiliar — a primeira que NÃO estiver presa também
  let aux = null;
  for (const cand of candidatas) {
    try {
      const r = await chamar("/entrar", { canalVoz: cand, serverId, servidores: servidoresConhecidos(ctx) });
      aux = cand;
      ok(`${lang === "en" ? "joined helper call" : "entrei na call auxiliar"} <#${cand}>${r?.jaEstava ? (lang === "en" ? " (was already there)" : " (já estava)") : ""}`);
      break;
    } catch (e) {
      const m = String(e.message ?? e).replace(/`/g, "");
      passos.push(`⏭️ <#${cand}>: ${/AlreadyConnected/i.test(m) ? (lang === "en" ? "stuck too" : "presa também") : m.slice(0, 90)}`);
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
    ? `✅ ${lang === "en" ? "Stoat registered me in the helper call" : "o Stoat me registrou na call auxiliar"}`
    : `⚠️ ${lang === "en" ? "didn't see myself listed in the helper call after 10s — trying anyway" : "não me vi listada na call auxiliar em 10s — tentando assim mesmo"}`);

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
    const r = await fetch(`${API}/servers/${serverId}/members/${meuId}`, {
      method: "PATCH",
      headers: { "X-Bot-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ voice_channel: presa }),
      signal: AbortSignal.timeout(10_000),
    });
    const txt = await r.text().catch(() => "");
    patch = { ok: r.ok, status: r.status, corpo: txt.slice(0, 140) };
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
  ok(`${lang === "en" ? "got the token for" : "recebi o token para"} <#${presa}> (node \`${ev.node ?? "?"}\`)`);

  // 4. o serviço entra com o token (sai da auxiliar no caminho)
  try {
    await chamar("/entrar-com-token", { canalVoz: presa, token: ev.token, node: ev.node ?? null, serverId });
    ok(`${lang === "en" ? "connected for real in" : "conectei de verdade em"} <#${presa}>`);
  } catch (e) {
    falha(`${lang === "en" ? "join with token" : "entrada com token"}: \`${String(e.message ?? e).replace(/`/g, "")}\``);
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
      title: lang === "en" ? "🔊 I'm in — and already reading" : "🔊 Entrei — e já estou lendo",
      description: [
        ...r.passos, "",
        lang === "en"
          ? `Stoat had me recorded as already in <#${presa}>, so I came in through <#${r.aux}> and moved myself here. Reading <#${c.canalTexto}>.\n\n⚠️ Applies to **everyone** who writes here · \`${P}tts sair\` to leave.`
          : `O Stoat me registrava como já estando em <#${presa}>, então entrei por <#${r.aux}> e me movi para cá. Lendo <#${c.canalTexto}>.\n\n⚠️ Vale para **todo mundo** que escrever aqui · \`${P}tts sair\` para eu sair.`,
      ].join("\n"), colour: COR.sucesso,
    });
  }
  const dicas = {
    "sem-auxiliar": lang === "en"
      ? `The rescue goes through **another call in this server** and I couldn't find one. Tell me which: \`${P}tts resgatar #helper-call\`.`
      : `O resgate passa por **outra call do mesmo servidor** e não achei nenhuma. Diga qual: \`${P}tts resgatar #call-auxiliar\`.`,
    "auxiliares-presas": lang === "en"
      ? `Every helper call I tried is stuck too. Pick one I didn't try: \`${P}tts resgatar #other-call\`.`
      : `Todas as calls auxiliares que tentei estão presas também. Indique uma que eu não tentei: \`${P}tts resgatar #outra-call\`.`,
    "not-connected": lang === "en"
      ? "`NotConnected`: Stoat never recorded my join in the helper call. That's the `participant_joined` webhook not being processed on their side — nothing I can fix from here; try again in a minute."
      : "`NotConnected`: o Stoat não registrou minha entrada na call auxiliar. É o webhook `participant_joined` não sendo processado do lado deles — não tenho como consertar daqui; tente de novo em um minuto.",
    "mover": lang === "en" ? `I'll stay in the helper call; \`${P}tts sair\` drops me.` : `Fico na call auxiliar; \`${P}tts sair\` me tira.`,
    "sem-evento": lang === "en"
      ? `Stoat accepted the move but never sent the \`UserMoveVoiceChannel\` event with the token. \`${P}tts sair\` and try again.`
      : `O Stoat aceitou o mover mas não mandou o evento \`UserMoveVoiceChannel\` com o token. \`${P}tts sair\` e tente de novo.`,
    "token-join": lang === "en"
      ? `If the service answered "rota desconhecida", update \`voz-servico/\` on the machine (this needs API version ${VOZ_API_ESPERADA}).`
      : `Se o serviço respondeu "rota desconhecida", atualize o \`voz-servico/\` na máquina (isto precisa da versão ${VOZ_API_ESPERADA} da API).`,
    "config": r.dica ?? "",
  };
  return sendEmbed(message.channel, {
    title: lang === "en" ? "⚠️ Couldn't get into the call" : "⚠️ Não consegui entrar na call",
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
        description: `Judy's voice isn't enabled on this server.`, colour: COR.aviso }));
  }

  // ── estado (público) ──
  if (sub === "estado" || sub === "status" || sub === "saude" || sub === "health") {
    let saude = null, erroSaude = null;
    try { saude = await chamar("/saude", null, "GET"); }
    catch (e) { erroSaude = e?.message ?? String(e); }

    const linhas = [
      `**${lang === "en" ? "Enabled" : "Ligado"}:** ${c.ativo ? "🟢" : "🔴"}`,
      `**${lang === "en" ? "Voice channel" : "Canal de voz"}:** ${c.canalVoz ? `<#${c.canalVoz}>` : "_—_"}`,
      `**${lang === "en" ? "Broadcast from" : "Transmite de"}:** ${c.canalTexto ? `<#${c.canalTexto}>` : "_—_"}`,
      `**${lang === "en" ? "Sieve" : "Peneira"}:** ${c.filtro === false ? "🔴" : "🟢"} ${lang === "en"
        ? `up to ${c.porMinuto ?? filtro.PADROES.porMinuto}/min` : `até ${c.porMinuto ?? filtro.PADROES.porMinuto}/min`}${(() => {
          const e = c.canalTexto ? filtro.estadoDoCanal(c.canalTexto) : null;
          return e?.silenciado ? ` · 🤫 ${Math.ceil(e.faltamMs / 1000)}s` : "";
        })()} _(\`${PREFIXO}tts filtro\`)_`,
      "",
      `**${lang === "en" ? "Voice service" : "Serviço de voz"}:** ${saude ? "🟢 ok" : `🔴 ${erroSaude}`}`,
    ];
    if (saude) {
      const v = Number(saude.versao ?? 1);
      linhas.push(v < VOZ_API_ESPERADA
        ? `**${lang === "en" ? "Service version" : "Versão do serviço"}:** ⚠️ **${v}** ${lang === "en"
            ? `— this bot expects **${VOZ_API_ESPERADA}**. Update \`voz-servico/\` on the machine and restart \`judy-voz\`; until then, commands the old version doesn't know will answer "rota desconhecida".`
            : `— este bot espera a **${VOZ_API_ESPERADA}**. Atualize o \`voz-servico/\` na máquina e reinicie o \`judy-voz\`; até lá, comandos que a versão antiga não conhece respondem "rota desconhecida".`}`
        : `**${lang === "en" ? "Service version" : "Versão do serviço"}:** 🟢 ${v}`);
      linhas.push(`**Piper:** ${saude.piper?.ok ? `🟢 ${saude.piper.vozAtual}` : `🔴 ${saude.piper?.erro}`}`);
      linhas.push(`**${lang === "en" ? "revoice (library)" : "revoice (biblioteca)"}:** ${saude.voz?.pronto
        ? (lang === "en" ? "🟢 loaded" : "🟢 carregada") : `🔴 ${saude.voz?.erro}`}`);
      const con = saude.voz?.conexoes ?? [];
      linhas.push(`**${lang === "en" ? "In calls" : "Em calls"}:** ${con.length
        ? con.map((x) => `<#${x.canalVoz}> (${x.falas} ${lang === "en" ? "utterances" : "falas"})`).join(", ")
        : "_—_"}`);
    }
    linhas.push("", lang === "en"
      ? `_Can't join? \`${PREFIXO}tts diagnostico\` says at which step it jams._`
      : `_Não consegue entrar? \`${PREFIXO}tts diagnostico\` diz em qual etapa trava._`);
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🔊 Voice status" : "🔊 Estado da voz",
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
          description: "You need **ManageMessages** to run the diagnostics.", colour: COR.erro }));
    }
    if (!c.canalVoz) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não sei em qual call olhar",
          description: `Mande \`${PREFIXO}tts entrar\` dentro da call primeiro — o diagnóstico examina a call que eu estou usando.`, colour: COR.erro },
        { title: "❌ I don't know which call to look at",
          description: `Send \`${PREFIXO}tts entrar\` inside the call first — the diagnostics examine the call I'm using.`, colour: COR.erro }));
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
          `Depois, \`${PREFIXO}tts estado\` deve mostrar **versão ${VOZ_API_ESPERADA}**.`,
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
          `After that, \`${PREFIXO}tts estado\` should show **version ${VOZ_API_ESPERADA}**.`,
          "",
          "_Meanwhile: the join/leave fixes live in that same folder, so the timeout you're seeing keeps happening until it goes up._",
        ].join("\n"),
        colour: COR.aviso,
      }) : {
        title: lang === "en" ? "❌ The voice service didn't answer" : "❌ O serviço de voz não respondeu",
        description: `\`${motivo}\`\n\n${lang === "en"
          ? "The problem is before the call: `judy-voz` is down or unreachable. It needs a hand on the machine."
          : "O problema é antes da call: o `judy-voz` está fora do ar ou inalcançável. Precisa de mão na máquina."}`,
        colour: COR.erro });
    }

    const marca = (v) => v === true ? "✅" : v === false ? "❌" : "❔";
    const linhas = (d.etapas ?? []).map((e) =>
      `${marca(e.ok)} **${e.etapa}** — ${e.ms}ms${e.status ? ` · HTTP ${e.status}` : ""}\n   ${String(e.detalhe ?? "").slice(0, 160).replace(/`/g, "")}`);

    const marcos = d.marcos ?? d.ultimaFalha?.marcos ?? [];
    const linhaMarcos = marcos.length
      ? `\n**${lang === "en" ? "Last attempt, step by step" : "Última tentativa, passo a passo"}**\n`
        + marcos.map((m) => `\`${String(m.ms).padStart(6)}ms\` ${m.nome}`).join("\n")
      : "";

    const passo = (nome) => d.etapas?.find((e) => e.etapa === nome);
    const api = passo("api+token"), canal = passo("canal"), jc = passo("join_call"), tcp = passo("livekit-tcp");
    let veredito;
    if (d.flagNode !== "ok") {
      veredito = tr(ctx,
        "⚠️ **O serviço está sem a flag do Node.** Suba o `judy-voz` com `--no-experimental-global-navigator` — sem ela a entrada falha sempre.",
        "⚠️ **The service is missing the Node flag.** Start `judy-voz` with `--no-experimental-global-navigator` — without it joining always fails.");
    } else if (api?.ok === false) {
      veredito = tr(ctx,
        "🔎 **Nem a autenticação passa.** Não é a call: é o token ou o alcance da API. Confira se o `BOT_TOKEN` no `.env` do `judy-voz` é o **mesmo** do bot, e se a máquina alcança a API do Stoat.",
        "🔎 **Authentication itself fails.** It's not the call: it's the token or reaching the API. Check that `BOT_TOKEN` in `judy-voz`'s `.env` is the **same** as the bot's, and that the machine can reach Stoat's API.");
    } else if (canal?.ok === false) {
      veredito = tr(ctx,
        `🔎 **Não consigo nem ler esse canal.** Ele pode ter sido apagado, ou o bot não o enxerga. Entre na call e mande \`${PREFIXO}tts entrar\` por lá — eu passo a usar esse canal.`,
        `🔎 **I can't even read that channel.** It may have been deleted, or the bot can't see it. Join the call and send \`${PREFIXO}tts entrar\` there — I'll switch to that channel.`);
    } else if (/UnknownNode/i.test(String(jc?.detalhe ?? ""))) {
      veredito = tr(ctx,
        "🔎 **`UnknownNode`: a call ainda não existe.** O Stoat só sabe em qual servidor de voz uma call está depois que alguém a inicia; antes disso, quem entra precisa **dizer** qual usar. Eu passei a informar isso sozinha ao abrir a sala — se este aviso apareceu, a API não me anunciou nenhum node de voz (veja a etapa `node` acima).\n\nContorno imediato: **entre na call primeiro** e me chame depois.",
        "🔎 **`UnknownNode`: the call doesn't exist yet.** Stoat only knows which voice server a call lives on after someone starts it; before that, whoever joins has to **say** which one to use. I now provide that myself when opening the room — if you're seeing this, the API announced no voice node at all (see the `node` step above).\n\nImmediate workaround: **join the call first**, then call me.");
    } else if (/AlreadyConnected/i.test(String(jc?.detalhe ?? ""))) {
      veredito = tr(ctx,
        `🔎 **\`AlreadyConnected\`: o Stoat me registra como já estando nesta call.** Não é permissão nem rede: é um registro preso no lado dele, sobra de uma entrada que travou no meio.\n\n\`${PREFIXO}tts entrar\` já resolve isso sozinho: entra por outra call e se move para esta — o mover emite um token sem conferir o registro preso. _(Remover pelo cliente ou kick passam pela mesma chave que o destravar, então não adiantam quando ele não adianta.)_`,
        `🔎 **\`AlreadyConnected\`: Stoat records me as already in this call.** Not permission, not network: a stuck record on their side, left over from a join that jammed halfway.\n\n\`${PREFIXO}tts entrar\` already handles this by itself: it comes in through another call and moves me here — the move issues a token without checking the stuck record. _(Removing me in the client or kicking go through the same key as destravar, so they won't help when it doesn't.)_`);
    } else if (jc?.ok === false) {
      const html = /HTML/i.test(String(jc.detalhe ?? ""));
      veredito = html
        ? tr(ctx,
          "🔎 **A resposta do `join_call` veio em HTML, não JSON** — quem respondeu foi um proxy/CDN no caminho, não a API. Isso NÃO quer dizer que o Stoat recusou a entrada: quer dizer que a requisição não chegou até ele. Suspeite do endereço da API (`STOAT_API`) ou de algo interceptando a saída da máquina.",
          "🔎 **`join_call` answered with HTML, not JSON** — a proxy/CDN on the way replied, not the API. This does NOT mean Stoat refused the join: it means the request never reached it. Suspect the API address (`STOAT_API`) or something intercepting the machine's outbound traffic.")
        : tr(ctx,
          "🔎 **O Stoat recusou o `join_call`.** Veja o HTTP e o tipo acima: `403` é falta de **Connect**/**Speak** para o cargo do bot no canal de voz, `404` é canal inexistente, `409`/`400` com JSON costuma ser o servidor achando que ainda estou na call.",
          "🔎 **Stoat refused `join_call`.** Check the HTTP and type above: `403` is missing **Connect**/**Speak** for the bot's role on the voice channel, `404` is a non-existent channel, `409`/`400` with JSON usually means the server still thinks I'm in the call.");
    } else if (tcp?.ok === false) {
      veredito = tr(ctx,
        "🔎 **A API autoriza, mas não alcanço o LiveKit.** É rede da máquina do serviço: firewall, DNS ou rota de saída. Se nem o TCP abre, o UDP também não vai.",
        "🔎 **The API authorises, but I can't reach LiveKit.** It's the service machine's network: firewall, DNS or outbound routing. If TCP won't even open, UDP won't either.");
    } else if (jc?.ok && tcp?.ok) {
      veredito = tr(ctx,
        `🔎 **Todas as etapas passam neste teste, mas entrar trava mesmo assim.** Então a trava está no que este teste não cobre: a mídia do LiveKit, que anda por **UDP**. Libere UDP de saída na máquina do \`judy-voz\` e confira a MTU da Tailscale.\n\nPara ver por dentro: suba o serviço com \`VOZ_DEBUG=1\`, tente \`${PREFIXO}tts entrar\` e olhe o log — com o debug ligado o LiveKit passa a contar o que faz durante os 20s.`,
        `🔎 **Every step passes in this test, yet joining still jams.** So the jam is in what this test doesn't cover: LiveKit media, which rides on **UDP**. Allow outbound UDP on the \`judy-voz\` machine and check the Tailscale MTU.\n\nTo see inside: start the service with \`VOZ_DEBUG=1\`, try \`${PREFIXO}tts entrar\` and read the log — with debug on, LiveKit narrates what it does during those 20s.`);
    } else {
      veredito = tr(ctx, "🔎 Resultado inconclusivo — veja as etapas acima.", "🔎 Inconclusive — see the steps above.");
    }
    if (!d.debug) {
      veredito += tr(ctx,
        "\n\n_Para o log contar mais: suba o `judy-voz` com `VOZ_DEBUG=1`._",
        "\n\n_For a more talkative log: start `judy-voz` with `VOZ_DEBUG=1`._");
    }

    return sendEmbed(message.channel, {
      title: lang === "en" ? "🩺 Voice diagnostics" : "🩺 Diagnóstico da voz",
      description: [
        ...linhas,
        linhaMarcos,
        "",
        `${lang === "en" ? "**In the call now**" : "**Na call agora**"}: ${d.naCall ? "🟢" : "🔴"}`
          + (d.entrandoAgora ? (lang === "en" ? " · entering right now" : " · entrando neste momento") : ""),
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
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro }));
    }
    const alvo = c.canalVoz ?? message.channelId;
    let r;
    try { r = await chamar("/destravar", { canalVoz: alvo, serverId, servidores: servidoresConhecidos(ctx) }); }
    catch (e) {
      return sendEmbed(message.channel, {
        title: lang === "en" ? "❌ The service didn't answer" : "❌ O serviço não respondeu",
        description: `\`${String(e.message ?? e).replace(/`/g, "")}\``, colour: COR.erro });
    }
    const linhas = (r?.passos ?? r?.resultados ?? []).map((t) =>
      `${t.ok ? "✅" : "❌"} \`${t.metodo ?? ""} ${String(t.rota ?? "").replace(alvo, "…")}\` — ${t.erro ?? `HTTP ${t.status}`}`);
    return sendEmbed(message.channel, tr(ctx, {
      title: r?.ok ? "🔓 Desconexão pedida" : "⚠️ Continua preso",
      description: [
        ...linhas, "",
        r?.ok
          ? `Pedi a desconexão e o Stoat aceitou. Agora \`${PREFIXO}tts entrar\` **de dentro da call** — a entrada é que diz se funcionou.`
          : [
            "O Stoat aceitou o pedido (HTTP 200) mas o registro **continua lá** — eu conferi tentando entrar de novo.",
            "",
            "Por quê: essa rota só manda o LiveKit me remover, e quem apaga o registro é o aviso que o LiveKit dispara depois. Se eu já não estava lá (queda de energia, processo morto), não há o que remover e aviso nenhum é disparado.",
            "",
            "**As saídas, da menos à mais drástica:**",
            `1. Use **outra call** — o Stoat só me bloqueia neste canal; em outro eu entro normalmente. \`${PREFIXO}tts entrar\` lá.`,
            "2. Espere: a sala pode expirar sozinha e liberar.",
            `3. **\`${PREFIXO}tts resgatar\`** — entro numa call auxiliar, me movo para esta pelo PATCH do Stoat (que emite token sem conferir o registro preso) e conecto de verdade. _(Kick não resolve: \`member_remove\` lê a mesma chave que esta rota.)_`,
          ].join("\n"),
      ].join("\n"), colour: r?.ok ? COR.sucesso : COR.aviso,
    }, {
      title: r?.ok ? "🔓 Disconnect requested" : "⚠️ Still stuck",
      description: [
        ...linhas, "",
        r?.ok
          ? `I asked to be disconnected and Stoat accepted. Now \`${PREFIXO}tts entrar\` **from inside the call** — the join itself will tell.`
          : [
            "Stoat accepted the request (HTTP 200) but the record **is still there** — I checked by trying to join again.",
            "",
            "Why: that route only tells LiveKit to remove me, and what deletes the record is the notice LiveKit fires afterwards. If I wasn't there anymore (power cut, dead process), there's nothing to remove and no notice is fired.",
            "",
            "**Ways out, least to most drastic:**",
            `1. Use **another call** — Stoat only blocks me on this channel; elsewhere I join fine. \`${PREFIXO}tts entrar\` there.`,
            "2. Wait: the room may expire on its own and free it.",
            `3. **\`${PREFIXO}tts resgatar\`** — I join a helper call, move myself here through Stoat's PATCH (which issues a token without checking the stuck record) and connect for real. _(Kicking doesn't help: \`member_remove\` reads the same key this route does.)_`,
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
        { title: "❓ Couldn't find that call", description: `I didn't recognise \`${resto}\` as a channel in this server.`, colour: COR.aviso }));
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
          description: "You need **ManageMessages** to restart the voice service.", colour: COR.erro }));
    }
    filtro.limpar(c.canalTexto ?? null);
    try {
      const r = await chamar("/reiniciar", {});
      return sendEmbed(message.channel, tr(ctx,
        { title: r?.ok ? "✅ Voz reiniciada" : "⚠️ Reiniciei, mas com problema",
          description: r?.ok
            ? `Saí de todas as calls e recriei a conexão.\n\nAgora: \`${PREFIXO}tts entrar\``
            : `\`${r?.erro}\`\n\nVeja \`${PREFIXO}tts estado\`.`,
          colour: r?.ok ? COR.sucesso : COR.aviso },
        { title: r?.ok ? "✅ Voice restarted" : "⚠️ Restarted, but with a problem",
          description: r?.ok
            ? `I left every call and rebuilt the connection.\n\nNow: \`${PREFIXO}tts entrar\``
            : `\`${r?.erro}\`\n\nSee \`${PREFIXO}tts estado\`.`,
          colour: r?.ok ? COR.sucesso : COR.aviso }));
    } catch (e) {
      return sendEmbed(message.channel, {
        title: lang === "en" ? "❌ Couldn't restart" : "❌ Não consegui reiniciar",
        description: `\`${e.message}\`\n\n${lang === "en"
          ? "The voice service itself may be down — it needs a hand on the machine."
          : "O serviço de voz pode estar fora do ar — aí precisa de mão na máquina."}`,
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
          { title: "❌ Falta o texto", description: `Uso: \`${PREFIXO}tts filtro teste <texto>\``, colour: COR.erro },
          { title: "❌ Missing text", description: `Usage: \`${PREFIXO}tts filtro teste <text>\``, colour: COR.erro }));
      }
      const v = filtro.avaliar(alvo);
      return sendEmbed(message.channel, {
        title: v.falar ? (lang === "en" ? "🔊 Would be spoken" : "🔊 Seria falado") : (lang === "en" ? "🔇 Would be ignored" : "🔇 Seria ignorado"),
        description: `\`${alvo.slice(0, 200)}\`\n\n**${lang === "en" ? "Reason" : "Motivo"}:** \`${v.motivo}\``,
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
          `\`${PREFIXO}tts filtro teste <texto>\` — ver o que aconteceria com uma frase`,
          `\`${PREFIXO}tts filtro on|off\` · \`${PREFIXO}tts filtro porminuto <n>\` *(ManageMessages)*`,
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
          `\`${PREFIXO}tts filtro teste <text>\` — see what would happen to a sentence`,
          `\`${PREFIXO}tts filtro on|off\` · \`${PREFIXO}tts filtro porminuto <n>\` *(ManageMessages)*`,
        ].filter(Boolean).join("\n"),
        colour: COR.info,
      }));
    }
    if (!membroTemPermissao(message, await getServer(message).catch(() => null), "ManageMessages")) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para mexer na peneira.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to change the sieve.", colour: COR.erro }));
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
          colour: c.filtro ? COR.sucesso : COR.aviso }));
    }
    if (["porminuto", "perminute", "teto", "cap"].includes(acao)) {
      const n = Number(args[2]);
      if (!Number.isFinite(n) || n < 1 || n > 60) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Valor inválido", description: `Uso: \`${PREFIXO}tts filtro porminuto <1 a 60>\``, colour: COR.erro },
          { title: "❌ Invalid value", description: `Usage: \`${PREFIXO}tts filtro porminuto <1 to 60>\``, colour: COR.erro }));
      }
      c.porMinuto = Math.round(n); salvarConfig?.();
      filtro.limpar(c.canalTexto ?? null);
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Teto ajustado", description: `Até **${c.porMinuto}** fala(s) por minuto vindas da transmissão.`, colour: COR.sucesso },
        { title: "✅ Cap adjusted", description: `Up to **${c.porMinuto}** utterance(s) per minute from the broadcast.`, colour: COR.sucesso }));
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não conheço essa opção", description: `\`${PREFIXO}tts filtro [status|on|off|porminuto <n>|teste <texto>]\``, colour: COR.erro },
      { title: "❌ Unknown option", description: `\`${PREFIXO}tts filtro [status|on|off|porminuto <n>|teste <text>]\``, colour: COR.erro }));
  }

  if (["entrar", "join", "sair", "leave", "ler", "comecar", "começar", "start", "stop"].includes(sub)) {
    const entrando = ["entrar", "join", "ler", "comecar", "começar", "start"].includes(sub);
    const chaveAcao = `${serverId}:${message.authorId}`;
    const faltam = (c.cooldown ?? COOLDOWN_MS) - (Date.now() - (ultimaFala.get(chaveAcao) ?? 0));
    if (faltam > 0 && !ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Calma lá", description: `Espere ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso },
        { title: "⏳ Slow down", description: `Wait ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso }));
    }
    ultimaFala.set(chaveAcao, Date.now());

    if (entrando) {
      const server = await getServer(message).catch(() => null);
      const achado = descobrirCanalDeVoz(message, server, ctx, c);

      if (!achado.id) {
        const opcoes = achado.opcoes?.length
          ? "\n\n" + achado.opcoes.map((v) => `• <#${v.id ?? v._id}>`).join("\n")
          : "";
        return sendEmbed(message.channel, tr(ctx, {
          title: "❓ Em qual call?",
          description: `Digite \`${PREFIXO}tts entrar\` **dentro da call** e eu entro nela.${
            opcoes ? `\n\nAs calls que encontrei:${opcoes}` : ""}`,
          colour: COR.aviso,
        }, {
          title: "❓ Which call?",
          description: `Type \`${PREFIXO}tts entrar\` **inside the call** and I'll join it.${
            opcoes ? `\n\nThe calls I found:${opcoes}` : ""}`,
          colour: COR.aviso,
        }));
      }

      const vinhaDeOutra = !!c.canalVoz && c.canalVoz !== achado.id;
      const mudou = [];
      if (!c.ativo) c.ativo = true;
      if (c.canalVoz !== achado.id) { c.canalVoz = achado.id; mudou.push(lang === "en" ? "the call" : "a call"); }
      if (c.canalTexto !== message.channelId) {
        c.canalTexto = message.channelId;
        mudou.push(lang === "en" ? "the channel I read" : "o canal que eu leio");
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
          title: lang === "en" ? "❌ Couldn't join" : "❌ Não consegui entrar",
          description: `\`${motivo}\`\n\n${lang === "en"
            ? `**Make sure you're already in the call** before calling me — joining an empty call is where it usually jams.\n\nFind out where: \`${PREFIXO}tts diagnostico\``
            : `**Entre na call antes de me chamar** — entrar numa call vazia é onde costuma travar.\n\nDescubra onde: \`${PREFIXO}tts diagnostico\``}`,
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
          `\`${PREFIXO}tts sair\` — saio e paro de ler`,
          `\`${PREFIXO}tts filtro\` — o que eu ignoro (repetição, parede de texto…)`,
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
          `\`${PREFIXO}tts sair\` — I leave and stop reading`,
          `\`${PREFIXO}tts filtro\` — what I skip (repetition, walls of text…)`,
          mudou.length
            ? `\n_I picked on my own: ${mudou.join(" · ")}._`
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
        `Para voltar: \`${PREFIXO}tts entrar\` dentro da call.`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: "👋 Left the call",
      description: [
        lia ? "I stopped reading the messages as well." : "See you.",
        "",
        `To come back: \`${PREFIXO}tts entrar\` inside the call.`,
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
          `**Embutidas:** ${c.expandir === false ? "🔴 desligadas" : `🟢 ${Object.keys(abrev.PADRAO).length}`} _(\`${PREFIXO}tts dicionario padrao on|off\`)_`,
          `**Deste servidor:** ${entradas.length}`,
          entradas.length ? "\n" + entradas.map(([k, v]) => `\`${k}\` → ${v}`).join(" · ") : "",
          "",
          `\`${PREFIXO}tts dicionario add <abrev> <texto>\` — adiciona`,
          `\`${PREFIXO}tts dicionario remove <abrev>\` — tira`,
          `\`${PREFIXO}tts dicionario teste <frase>\` — mostra como sairia falado`,
        ].filter(Boolean).join("\n"), colour: COR.info,
      }, {
        title: "📖 Speech dictionary",
        description: [
          `**Built-in:** ${c.expandir === false ? "🔴 off" : `🟢 ${Object.keys(abrev.PADRAO).length}`} _(\`${PREFIXO}tts dicionario padrao on|off\`)_`,
          `**This server's:** ${entradas.length}`,
          entradas.length ? "\n" + entradas.map(([k, v]) => `\`${k}\` → ${v}`).join(" · ") : "",
          "",
          `\`${PREFIXO}tts dicionario add <abbrev> <text>\` — add`,
          `\`${PREFIXO}tts dicionario remove <abbrev>\` — remove`,
          `\`${PREFIXO}tts dicionario teste <phrase>\` — show how it would be spoken`,
        ].filter(Boolean).join("\n"), colour: COR.info,
      }));
    };
    if (!acao || ["lista", "list", "ver", "show"].includes(acao)) return listar();

    if (["teste", "test", "testar"].includes(acao)) {
      const frase = args.slice(2).join(" ").trim();
      if (!frase) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❓ Testar o quê?", description: `\`${PREFIXO}tts dicionario teste vc n vem hj?\``, colour: COR.aviso },
          { title: "❓ Test what?", description: `\`${PREFIXO}tts dicionario teste vc n vem hj?\``, colour: COR.aviso }));
      }
      const saida = abrev.expandir(frase, proprias, c.expandir !== false);
      return sendEmbed(message.channel, {
        title: lang === "en" ? "🗣️ How it would be spoken" : "🗣️ Como sairia falado",
        description: `\`${frase.slice(0, 200)}\`\n↓\n**${saida.slice(0, 400)}**${
          saida === frase ? `\n\n_${lang === "en" ? "nothing changed — no abbreviation matched" : "nada mudou — nenhuma abreviação bateu"}_` : ""}`,
        colour: COR.info });
    }

    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: `Ver o dicionário é livre; mudar precisa de **ManageMessages**.\n\n\`${PREFIXO}tts dicionario\` mostra o que está valendo.`, colour: COR.erro },
        { title: "🚫 Missing permission", description: `Viewing the dictionary is open; changing it needs **ManageMessages**.\n\n\`${PREFIXO}tts dicionario\` shows what's in effect.`, colour: COR.erro }));
    }

    if (["padrao", "padrão", "default", "embutidas", "builtin"].includes(acao)) {
      const v = (args[2] ?? "").toLowerCase();
      if (!["on", "off", "ligar", "desligar"].includes(v)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❓ Ligar ou desligar?", description: `\`${PREFIXO}tts dicionario padrao on\` ou \`off\` — vale para as ${Object.keys(abrev.PADRAO).length} abreviações embutidas. As deste servidor continuam valendo de qualquer jeito.`, colour: COR.aviso },
          { title: "❓ On or off?", description: `\`${PREFIXO}tts dicionario padrao on\` or \`off\` — applies to the ${Object.keys(abrev.PADRAO).length} built-in abbreviations. This server's own entries keep working either way.`, colour: COR.aviso }));
      }
      c.expandir = ["on", "ligar"].includes(v);
      salvarConfig?.();
      return sendEmbed(message.channel, {
        title: c.expandir
          ? (lang === "en" ? "🟢 Built-in abbreviations on" : "🟢 Abreviações embutidas ligadas")
          : (lang === "en" ? "🔴 Built-in abbreviations off" : "🔴 Abreviações embutidas desligadas"),
        description: c.expandir
          ? (lang === "en" ? `\`vc n vem hj\` → **você não vem hoje**` : `\`vc n vem hj\` → **você não vem hoje**`)
          : (lang === "en" ? "Only this server's own entries apply now." : "Agora só valem as entradas deste servidor."),
        colour: COR.sucesso });
    }

    if (["add", "adicionar", "por", "pôr", "set"].includes(acao)) {
      const chave = (args[2] ?? "").toLowerCase();
      const valor = args.slice(3).join(" ").trim();
      if (!chave || !valor) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❓ Faltou o quê e por quê", description: `\`${PREFIXO}tts dicionario add vish vixi\` — a abreviação primeiro, o texto falado depois.`, colour: COR.aviso },
          { title: "❓ Missing what and with what", description: `\`${PREFIXO}tts dicionario add vish vixi\` — abbreviation first, spoken text after.`, colour: COR.aviso }));
      }
      if (/\s/.test(chave)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ A abreviação é uma palavra só", description: "Ela é trocada palavra por palavra, então `de boa` nunca casaria. Use uma palavra só do lado esquerdo — o direito pode ter quantas quiser.", colour: COR.erro },
          { title: "❌ The abbreviation must be a single word", description: "It's replaced word by word, so `de boa` would never match. Use one word on the left — the right side can have as many as you like.", colour: COR.erro }));
      }
      if (Object.keys(proprias).length >= 200 && !(chave in proprias)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Dicionário cheio", description: `São 200 entradas no máximo. \`${PREFIXO}tts dicionario remove <abrev>\` abre espaço.`, colour: COR.erro },
          { title: "❌ Dictionary full", description: `200 entries max. \`${PREFIXO}tts dicionario remove <abbrev>\` frees a slot.`, colour: COR.erro }));
      }
      const antes = proprias[chave];
      proprias[chave] = valor.slice(0, 120);
      c.dicionario = proprias;
      salvarConfig?.();
      const exemplo = abrev.expandir(chave, proprias, c.expandir !== false);
      return sendEmbed(message.channel, {
        title: lang === "en" ? "✅ Added to the dictionary" : "✅ Guardei no dicionário",
        description: `\`${chave}\` → **${exemplo}**${antes ? `\n\n_${lang === "en" ? "was" : "antes era"}: ${antes}_` : ""}${
          chave in abrev.PADRAO ? `\n\n_${lang === "en" ? "this overrides the built-in entry" : "isto sobrescreve a entrada embutida"}_` : ""}`,
        colour: COR.sucesso });
    }

    if (["remove", "remover", "tirar", "del", "delete", "rm"].includes(acao)) {
      const chave = (args[2] ?? "").toLowerCase();
      if (!chave || !(chave in proprias)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❓ Não achei essa entrada", description: `\`${PREFIXO}tts dicionario\` lista o que este servidor tem.${
            chave in abrev.PADRAO ? `\n\n\`${chave}\` é embutida: para anular só ela, \`${PREFIXO}tts dicionario add ${chave} ${chave}\`.` : ""}`, colour: COR.aviso },
          { title: "❓ No such entry", description: `\`${PREFIXO}tts dicionario\` lists this server's entries.${
            chave in abrev.PADRAO ? `\n\n\`${chave}\` is built in: to cancel just that one, \`${PREFIXO}tts dicionario add ${chave} ${chave}\`.` : ""}`, colour: COR.aviso }));
      }
      delete proprias[chave];
      c.dicionario = proprias;
      salvarConfig?.();
      return sendEmbed(message.channel, {
        title: lang === "en" ? "🗑️ Removed" : "🗑️ Tirei do dicionário",
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
          description: `Agora: ${c.anunciarNome === false ? "🔴 **off** — leio só a mensagem" : "🟢 **on** — leio \\\"Fulano disse: …\\\""}\n\n\`${PREFIXO}tts nomes on|off\``,
          colour: COR.info },
        { title: "🗣️ Announcing who spoke",
          description: `Currently: ${c.anunciarNome === false ? "🔴 **off** — I read the message only" : "🟢 **on** — I read \\\"So-and-so said: …\\\""}\n\n\`${PREFIXO}tts nomes on|off\``,
          colour: COR.info }));
    }
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: "Você precisa de **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro }));
    }
    c.anunciarNome = ["on", "ligar"].includes(v);
    salvarConfig?.();
    return sendEmbed(message.channel, {
      title: c.anunciarNome
        ? (lang === "en" ? "🟢 I'll announce who spoke" : "🟢 Vou anunciar quem falou")
        : (lang === "en" ? "🔴 I'll read the message only" : "🔴 Vou ler só a mensagem"),
      colour: COR.sucesso });
  }

  // ── cooldown: freio entre falas da MESMA pessoa ──
  if (["cooldown", "espera", "freio"].includes(sub)) {
    if (!resto) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Espera entre falas",
          description: `Agora: **${Math.round((c.cooldown ?? COOLDOWN_MS) / 1000)}s** por pessoa.\n\n\`${PREFIXO}tts cooldown <segundos>\` — \`0\` desliga.\n_A equipe não passa por ele. O teto por minuto do canal é outro: \`${PREFIXO}tts filtro\`._`,
          colour: COR.info },
        { title: "⏳ Wait between messages",
          description: `Currently: **${Math.round((c.cooldown ?? COOLDOWN_MS) / 1000)}s** per person.\n\n\`${PREFIXO}tts cooldown <seconds>\` — \`0\` turns it off.\n_Staff isn't subject to it. The per-minute channel cap is separate: \`${PREFIXO}tts filtro\`._`,
          colour: COR.info }));
    }
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: "Você precisa de **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro }));
    }
    const n = Number(String(resto).replace(",", ".").replace(/s$/i, ""));
    if (!Number.isFinite(n) || n < 0 || n > 300) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Valor inválido", description: "Um número de segundos entre 0 e 300.", colour: COR.erro },
        { title: "❌ Invalid value", description: "A number of seconds between 0 and 300.", colour: COR.erro }));
    }
    c.cooldown = Math.round(n * 1000);
    salvarConfig?.();
    return sendEmbed(message.channel, {
      title: lang === "en" ? "⏳ Wait updated" : "⏳ Espera atualizada",
      description: n === 0
        ? (lang === "en" ? "No wait between messages from the same person." : "Sem espera entre falas da mesma pessoa.")
        : (lang === "en" ? `**${n}s** per person.` : `**${n}s** por pessoa.`),
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
          title: lang === "en" ? "❌ The voice service didn't answer" : "❌ O serviço de voz não respondeu",
          description: `\`${String(e.message ?? e).replace(/`/g, "")}\`\n\n\`${PREFIXO}tts estado\``, colour: COR.erro });
      }
    }
    const opcoes = ehVoz ? (saude?.piper?.vozes ?? []) : (saude?.efeitos ?? []);
    const atual = ehVoz ? (c.voz ?? saude?.piper?.vozAtual) : (c.efeito ?? null);

    if (ehTom && !resto) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎚️ Tom da voz",
          description: `Agora: **${c.tom ?? 1}** _(1.0 = original)_\n\n\`${PREFIXO}tts tom 1.05\` — sobe tom **e formantes** juntos, então uma voz masculina vira feminina de verdade. Se a base já é feminina, mexa pouco: acima de 1.05 soa infantil.\n\`${PREFIXO}tts tom 1\` volta ao original.`,
          colour: COR.info },
        { title: "🎚️ Voice pitch",
          description: `Currently: **${c.tom ?? 1}** _(1.0 = original)_\n\n\`${PREFIXO}tts tom 1.05\` — raises pitch **and formants** together, so a male voice turns properly female. If the base voice is already female, go easy: above 1.05 it sounds childish.\n\`${PREFIXO}tts tom 1\` restores the original.`,
          colour: COR.info }));
    }
    if (!ehTom && !resto) {
      return sendEmbed(message.channel, {
        title: ehVoz ? (lang === "en" ? "🎙️ Voices" : "🎙️ Vozes") : (lang === "en" ? "🎛️ Effects" : "🎛️ Efeitos"),
        description: [
          `${lang === "en" ? "Currently" : "Agora"}: **${atual ?? (lang === "en" ? "none" : "nenhum")}**`,
          "",
          opcoes.length ? opcoes.map((o) => (o === atual ? `**${o}**` : `\`${o}\``)).join(" · ")
            : (lang === "en" ? "_the service listed none_" : "_o serviço não listou nenhum_"),
          "",
          ehVoz ? `\`${PREFIXO}tts voz <nome>\`` : `\`${PREFIXO}tts efeito <nome>\` · \`${PREFIXO}tts efeito nenhum\` tira`,
        ].join("\n"), colour: COR.info });
    }

    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: "Você precisa de **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro }));
    }

    if (ehTom) {
      const n = Number(String(resto).replace(",", "."));
      if (!Number.isFinite(n) || n < 0.5 || n > 2) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Valor inválido", description: "Um número entre 0.5 e 2 — `1` é o original.", colour: COR.erro },
          { title: "❌ Invalid value", description: "A number between 0.5 and 2 — `1` is the original.", colour: COR.erro }));
      }
      c.tom = n;
      salvarConfig?.();
      return sendEmbed(message.channel, {
        title: lang === "en" ? "🎚️ Pitch updated" : "🎚️ Tom atualizado",
        description: `**${n}**\n\n${lang === "en" ? "Hear it:" : "Ouça:"} \`${PREFIXO}tts ${lang === "en" ? "testing one two three" : "testando um dois três"}\``,
        colour: COR.sucesso });
    }

    const escolha = resto.toLowerCase();
    if (!ehVoz && ["nenhum", "none", "off", "limpar", "clear"].includes(escolha)) {
      c.efeito = null; salvarConfig?.();
      return sendEmbed(message.channel, { title: lang === "en" ? "🎛️ Effect removed" : "🎛️ Efeito removido", colour: COR.sucesso });
    }
    const achado = opcoes.find((o) => String(o).toLowerCase() === escolha)
      ?? opcoes.find((o) => semAcento(String(o)) === semAcento(escolha));
    if (!achado) {
      return sendEmbed(message.channel, {
        title: ehVoz ? (lang === "en" ? "❓ I don't have that voice" : "❓ Não tenho essa voz")
                     : (lang === "en" ? "❓ I don't have that effect" : "❓ Não tenho esse efeito"),
        description: opcoes.length ? opcoes.map((o) => `\`${o}\``).join(" · ")
          : (lang === "en" ? "_the service listed none_" : "_o serviço não listou nenhum_"),
        colour: COR.aviso });
    }
    if (ehVoz) c.voz = achado; else c.efeito = achado;
    salvarConfig?.();
    return sendEmbed(message.channel, {
      title: ehVoz ? (lang === "en" ? "🎙️ Voice changed" : "🎙️ Voz trocada") : (lang === "en" ? "🎛️ Effect applied" : "🎛️ Efeito aplicado"),
      description: `**${achado}**\n\n${lang === "en" ? "Hear it:" : "Ouça:"} \`${PREFIXO}tts ${lang === "en" ? "testing one two three" : "testando um dois três"}\``,
      colour: COR.sucesso });
  }

  const talvez = quaseSubcomando(args);
  if (talvez) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🤔 Você quis dizer um comando?",
      description: `\`${PREFIXO}tts ${args[0]}\` não é um subcomando — o mais parecido é \`${PREFIXO}tts ${talvez}\`.\n\nSe era mesmo para eu **falar** essa palavra, mande \`${PREFIXO}tts falar ${args[0]}\`.`,
      colour: COR.aviso,
    }, {
      title: "🤔 Did you mean a command?",
      description: `\`${PREFIXO}tts ${args[0]}\` isn't a subcommand — the closest one is \`${PREFIXO}tts ${talvez}\`.\n\nIf you really wanted me to **say** that word, send \`${PREFIXO}tts falar ${args[0]}\`.`,
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
        `**\`${PREFIXO}tts entrar\`** — dentro da call. Eu entro e passo a **falar tudo que for escrito ali**.`,
        `**\`${PREFIXO}tts sair\`** — saio e paro de ler.`,
        "",
        "É só isso para o uso normal. O resto é ajuste fino:",
        "",
        `\`${PREFIXO}tts <texto>\` — falo uma frase específica, mesmo fora da leitura`,
        `\`${PREFIXO}tts voz [nome]\` — troca a voz · \`${PREFIXO}tts efeito <nome>\` · \`${PREFIXO}tts tom <n>\``,
        `\`${PREFIXO}tts filtro\` — o que eu ignoro (repetição, parede de texto…)`,
        `\`${PREFIXO}tts estado\` — está tudo de pé? · \`${PREFIXO}tts diagnostico\` — onde travou`,
        "",
        `\`${PREFIXO}tts dicionario\` — a escrita de chat vira fala (\`vc\` → \`você\`)`,
        "",
        `**Ajustes** _(ManageMessages)_`,
        `\`${PREFIXO}tts nomes on|off\` — anunciar quem falou · \`${PREFIXO}tts cooldown <s>\` — freio por pessoa`,
        `\`${PREFIXO}tts reiniciar\` — quando o serviço de voz trava`,
      ].join("\n"), colour: COR.info,
    }, {
      title: "🔊 Judy's voice",
      description: [
        `**\`${PREFIXO}tts entrar\`** — inside the call. I join and start **speaking everything written there**.`,
        `**\`${PREFIXO}tts sair\`** — I leave and stop reading.`,
        "",
        "That's it for normal use. The rest is fine-tuning:",
        "",
        `\`${PREFIXO}tts <text>\` — I say one specific line, even outside the reading`,
        `\`${PREFIXO}tts voz [name]\` — change the voice · \`${PREFIXO}tts efeito <name>\` · \`${PREFIXO}tts tom <n>\``,
        `\`${PREFIXO}tts filtro\` — what I skip (repetition, walls of text…)`,
        `\`${PREFIXO}tts estado\` — is everything up? · \`${PREFIXO}tts diagnostico\` — where it jammed`,
        "",
        `\`${PREFIXO}tts dicionario\` — chat shorthand becomes proper speech (\`vc\` → \`você\`)`,
        "",
        `**Settings** _(ManageMessages)_`,
        `\`${PREFIXO}tts nomes on|off\` — announce who spoke · \`${PREFIXO}tts cooldown <s>\` — per-person brake`,
        `\`${PREFIXO}tts reiniciar\` — when the voice service jams`,
      ].join("\n"), colour: COR.info,
    }));
  }

  if (!c.ativo || !c.canalVoz) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔇 Não estou em nenhuma call",
        description: `Entre numa call e mande \`${PREFIXO}tts entrar\` por lá — eu configuro o resto sozinha.`,
        colour: COR.aviso },
      { title: "🔇 I'm not in any call",
        description: `Join a call and send \`${PREFIXO}tts entrar\` there — I'll set up the rest myself.`,
        colour: COR.aviso }));
  }

  // Cooldown: o megafone precisa de freio, mesmo para quem é da casa.
  const chave = `${serverId}:${message.authorId}`;
  const espera = (c.cooldown ?? COOLDOWN_MS) - (Date.now() - (ultimaFala.get(chave) ?? 0));
  if (espera > 0 && !ehStaff) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "⏳ Calma lá", description: `Espere ${Math.ceil(espera / 1000)}s para falar de novo.`, colour: COR.aviso },
      { title: "⏳ Slow down", description: `Wait ${Math.ceil(espera / 1000)}s before speaking again.`, colour: COR.aviso }));
  }
  ultimaFala.set(chave, Date.now());

  const falado = c.expandir === false ? texto : abrev.expandir(texto, c.dicionario ?? {});
  try {
    const r = await chamar("/falar", { canalVoz: c.canalVoz, texto: falado, voz: c.voz, efeito: c.efeito, tom: c.tom });
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🔊 Speaking" : "🔊 Falando",
      description: `${falado.length > 120 ? falado.slice(0, 120) + "…" : falado}${
        r.naFila > 1 ? `\n\n_${lang === "en" ? "in queue" : "na fila"}: ${r.naFila}_` : ""}`,
      colour: COR.sucesso });
  } catch (e) {
    const motivo = String(e.message ?? e).replace(/`/g, "");
    return sendEmbed(message.channel, {
      title: lang === "en" ? "❌ Couldn't speak" : "❌ Não consegui falar",
      description: `\`${motivo}\`\n\n${lang === "en" ? "Diagnose with" : "Diagnostique com"} \`${PREFIXO}tts diagnostico\``,
      colour: COR.erro });
  }
}
