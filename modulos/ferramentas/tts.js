// ══════════════════════════════════════════════════════════
//  tts.js — &tts: a Judy fala nas calls
//
//  O trabalho pesado (LiveKit + Piper) vive no `judy-voz`, nativo no
//  Gentoo. Aqui ficam só o comando, as permissões e os limites.
//
//   &tts <texto>             → fala agora na call configurada
//   &tts canal <#voz>        → define em qual call falar   (ManageMessages)
//   &tts transmitir <#texto> → tudo que for escrito lá é falado na call
//   &tts entrar | sair       → conecta/desconecta da call
//   &tts on | off            → liga/desliga sem perder a configuração
//   &tts voz [nome]          → escolhe a voz do Piper
//   &tts estado              → diagnóstico da cadeia inteira
//
//  ── Isolamento ──
//  Recurso caro e barulhento: só funciona nos servidores listados em
//  TTS_SERVIDORES. Mesmo padrão do chat de IA. Sem a variável, fica
//  desligado em todo lugar — nunca "ligado por engano".
//
//  ── Anti-abuso ──
//  TTS numa call é um megafone. Cooldown por pessoa, teto de tamanho e
//  um `&tts off` que qualquer moderador alcança rápido.
// ══════════════════════════════════════════════════════════

import { resolverCanal } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";
import * as abrev from "../core/abreviacoes.js";
import * as filtro from "./tts-filtro.js";

const VOZ_URL   = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
const VOZ_CHAVE = process.env.VOZ_CHAVE || "";
const SERVIDORES = (process.env.TTS_SERVIDORES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Versão da interface que ESTE código espera do judy-voz. O serviço roda no
// Gentoo, fora do Docker, então os dois são atualizados por caminhos
// diferentes e podem ficar defasados — o pior estado possível, porque tudo
// "parece" atualizado e a fala sai sem efeito, em silêncio.
const VOZ_API_ESPERADA = 4;

const COOLDOWN_MS = Number(process.env.TTS_COOLDOWN_MS || 8000);
const MAX_CHARS   = Number(process.env.TTS_MAX_CHARS || 400);

const ultimaFala = new Map();   // `${serverId}:${userId}` → timestamp
// erro → quando foi logado pela última vez (anti-enxurrada no log)
const ultimoErro = new Map();
setInterval(() => {
  const corte = Date.now() - COOLDOWN_MS * 10;
  for (const [k, t] of ultimaFala) if (t < corte) ultimaFala.delete(k);
}, 10 * 60_000).unref?.();

// Todo subcomando que o `&tts` entende. Serve para pegar o erro de digitação
// antes de ele virar fala: `&tts diagnosticar` (com o "r") não é um pedido
// para a Judy dizer a palavra "diagnosticar" em voz alta — mas era isso que
// acontecia, e ainda gastava 20s tentando entrar na call para fazê-lo.
const SUBCOMANDOS = [
  "estado", "status", "saude", "diagnostico", "reiniciar", "filtro",
  "entrar", "sair", "canal", "transmitir", "on", "off", "voz", "efeito",
  "tom", "cooldown", "nomes", "dicionario", "ajuda",
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
  if (args.length !== 1) return null;
  const p = semAcento(args[0]);
  if (p.length < 4) return null;
  for (const sc of SUBCOMANDOS) {
    if (p === sc) return null;                    // exato já foi tratado acima
    if (sc.startsWith(p) || p.startsWith(sc) || perto(p, sc)) return sc;
  }
  return null;
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

// ── Conversa com o judy-voz ───────────────────────────────
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

// Fala um texto na call configurada. Usado pelo comando E pela
// transmissão automática — por isso vive separado.
export async function falarNaCall(config, texto, ctx) {
  const c = garantirConfig(config);
  if (!c.ativo || !c.canalVoz) return { ok: false, erro: "desligado" };
  return chamar("/falar", { canalVoz: c.canalVoz, texto, voz: c.voz });
}

// ── Transmissão automática ────────────────────────────────
// Chamado pelo main a cada mensagem. Sai cedo e barato quando não é o
// caso — isto roda no caminho quente.
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

    // ── Peneira: isto é fala ou é barulho? ──
    // Só forma (repetição, variedade, tamanho), nunca conteúdo. Sai antes
    // do cooldown de propósito: barulho não deve consumir a vez de ninguém.
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

    // ── Teto POR CANAL ──
    // O cooldown acima é por pessoa: cinco pessoas escrevendo juntas passam
    // por ele sem esforço, e a call vira um megafone. Aqui é o freio
    // coletivo. Quem realmente precisa falar continua tendo o `&tts <texto>`,
    // que não passa por esta função.
    const jaSilenciado = filtro.emEnxurrada(message.channelId, agora);
    if (jaSilenciado.silenciado) return false;
    const cota = filtro.registrarFala(message.channelId, agora,
      c.porMinuto ? { porMinuto: c.porMinuto } : {});
    if (!cota.permitido) {
      // Avisa UMA vez, quando o silêncio começa. Repetir a cada mensagem
      // seria trocar o barulho na call por barulho no chat.
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

    // Numa conversa de verdade, ouvir "Fulano disse:" antes de cada frase
    // cansa rápido. Configurável, e o padrão continua anunciando porque numa
    // call com várias pessoas escrevendo é o que faz sentido.
    const nome = message.author?.username ?? "alguém";
    // Expande antes de cortar: "vc" ocupa 2 chars, "você" ocupa 4 — cortar
    // primeiro deixaria uma abreviação pela metade no fim da frase.
    const corpo = (c.expandir === false
      ? texto
      : abrev.expandir(texto, c.dicionario ?? {})).slice(0, MAX_CHARS);
    // `autoEntrar: false` — se o bot não está na call, a transmissão NÃO o
    // traz de volta. Quem mandou `&tts sair` mandou de verdade; antes, a
    // mensagem seguinte de qualquer pessoa desfazia o pedido.
    const r = await chamar("/falar", {
      canalVoz: c.canalVoz,
      texto: c.anunciarNome === false ? corpo : `${nome} disse: ${corpo}`,
      voz: c.voz, efeito: c.efeito, tom: c.tom,
      autoEntrar: false,
    });
    return r?.ok !== false;
  } catch (e) {
    const msg = e?.message ?? String(e);
    // Um serviço fora do ar gera um erro POR MENSAGEM do canal. Isso encheu
    // o log de linhas idênticas justamente na hora em que ele precisava
    // estar legível. Uma linha por minuto por tipo de erro basta.
    const agora = Date.now();
    if (agora - (ultimoErro.get(msg) ?? 0) > 60_000) {
      ultimoErro.set(msg, agora);
      console.error("[TTS] transmissão:", msg);
    }
    return false;
  }
}


// ── Comando ───────────────────────────────────────────────
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
      // "pronto" aqui é só "a biblioteca carregou" — NÃO diz nada sobre
      // conseguir entrar numa call. Confundir os dois foi o que fez este
      // painel parecer saudável enquanto toda entrada dava timeout.
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

  // ── entrar / sair: LIBERADOS a todos ──
  //
  // O canal já foi escolhido pela staff; entrar nele é reversível e é
  // justamente o que quem está na call precisa fazer. Exigir ManageMessages
  // aqui significava que só o dono conseguia chamar a Judy — o recurso
  // existia para todos no papel e para uma pessoa na prática.
  //
  // O freio contra vai-e-vem é o mesmo cooldown das falas: quem não é staff
  // espera entre uma ação e outra.
  // ── diagnostico (staff): ONDE, exatamente, a entrada trava ──
  //
  // "Não consigo entrar" tem duas causas com o mesmo sintoma: a API do
  // Stoat recusando/pendurando (token, permissão, o servidor achar que o
  // bot já está na call) ou a rede não alcançando o LiveKit (UDP, MTU,
  // firewall). O remédio de uma não serve para a outra. Isto separa as
  // duas antes de qualquer chute.
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
        { title: "❌ Falta o canal de voz",
          description: `Defina primeiro com \`${PREFIXO}tts canal aqui\` (dentro da call).`, colour: COR.erro },
        { title: "❌ No voice channel",
          description: `Set it first with \`${PREFIXO}tts canal aqui\` (inside the call).`, colour: COR.erro }));
    }
    let d;
    try { d = await chamar("/diagnostico", { canalVoz: c.canalVoz }); }
    catch (e) {
      const motivo = String(e.message ?? e).replace(/`/g, "");
      // O serviço RESPONDEU, só não conhece a rota: está numa versão anterior.
      // É um diagnóstico completamente diferente de "está fora do ar", e
      // mandava investigar rede quando o que falta é copiar uma pasta.
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
    const linhas = (d.etapas ?? []).map((e) => `${marca(e.ok)} **${e.etapa}** — ${e.ms}ms${e.status ? ` · HTTP ${e.status}` : ""}\n   \`${String(e.detalhe ?? "").slice(0, 180)}\``);

    // O veredito é o que importa: cada combinação tem um culpado diferente.
    const httpOk = d.etapas?.find((e) => e.etapa === "join_call")?.ok;
    const tcpOk = d.etapas?.find((e) => e.etapa === "livekit-tcp")?.ok;
    let veredito;
    if (d.flagNode !== "ok") {
      veredito = tr(ctx,
        "⚠️ **O serviço está sem a flag do Node.** Suba o `judy-voz` com `--no-experimental-global-navigator` — sem ela a entrada falha sempre.",
        "⚠️ **The service is missing the Node flag.** Start `judy-voz` with `--no-experimental-global-navigator` — without it joining always fails.");
    } else if (httpOk === false) {
      veredito = tr(ctx,
        "🔎 **Trava na API do Stoat**, antes de qualquer coisa de rede. Olhe o HTTP acima: `401` é token do bot, `403` é falta de **Connect**/**Speak** no canal de voz, `404` é ID errado, `400`/`409` costuma ser o Stoat achando que ainda estou na call — nesse caso, saia da call pelo cliente (ou reinicie o servidor de voz do Stoat) e tente de novo.",
        "🔎 **It jams at Stoat's API**, before anything network-related. Look at the HTTP above: `401` is the bot token, `403` is missing **Connect**/**Speak** on the voice channel, `404` is a wrong ID, `400`/`409` usually means Stoat still thinks I'm in the call — in that case, leave the call from the client (or restart Stoat's voice server) and try again.");
    } else if (tcpOk === false) {
      veredito = tr(ctx,
        "🔎 **A API responde, mas não alcanço o LiveKit.** É rede da máquina do serviço: firewall, DNS ou rota. Se o TCP nem abre, o UDP também não vai — confira a saída da máquina do `judy-voz`.",
        "🔎 **The API answers, but I can't reach LiveKit.** It's the service machine's network: firewall, DNS or routing. If TCP won't even open, UDP won't either — check outbound access from the `judy-voz` machine.");
    } else if (httpOk && tcpOk !== false) {
      veredito = tr(ctx,
        "🔎 **As duas etapas passam aqui.** Então a trava é no meio: a mídia do LiveKit anda por **UDP**, que este teste não cobre. Libere UDP de saída na máquina do `judy-voz` (e verifique a MTU da Tailscale). Se acabou de acontecer, `&tts reiniciar` e tente entrar de novo.",
        "🔎 **Both steps pass here.** So the jam is in between: LiveKit media rides on **UDP**, which this test doesn't cover. Allow outbound UDP on the `judy-voz` machine (and check the Tailscale MTU). If it just happened, `&tts reiniciar` and try joining again.");
    } else {
      veredito = tr(ctx, "🔎 Resultado inconclusivo — veja as etapas acima.", "🔎 Inconclusive — see the steps above.");
    }

    return sendEmbed(message.channel, {
      title: lang === "en" ? "🩺 Voice diagnostics" : "🩺 Diagnóstico da voz",
      description: [
        ...linhas,
        "",
        `${lang === "en" ? "**In the call now**" : "**Na call agora**"}: ${d.naCall ? "🟢" : "🔴"}`
          + (d.entrandoAgora ? (lang === "en" ? " · entering right now" : " · entrando neste momento") : ""),
        d.ultimaFalha ? `${lang === "en" ? "**Last failure**" : "**Última falha**"}: \`${String(d.ultimaFalha.erro).slice(0, 140)}\`` : null,
        "",
        veredito,
      ].filter(Boolean).join("\n"),
      colour: d.ok ? COR.info : COR.aviso,
    });
  }

  // ── reiniciar (staff): destrava o serviço sem ir ao terminal ──
  // Quando o estado do lado do Stoat/LiveKit fica inconsistente, a entrada
  // pendura e nenhum comando resolve. Antes só reiniciando o judy-voz à mão
  // no Gentoo — impossível para quem está no celular, às duas da manhã.
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

  if (["entrar", "join", "sair", "leave"].includes(sub)) {
    const entrando = ["entrar", "join"].includes(sub);
    const chaveAcao = `${serverId}:${message.authorId}`;
    const faltam = (c.cooldown ?? COOLDOWN_MS) - (Date.now() - (ultimaFala.get(chaveAcao) ?? 0));
    if (faltam > 0 && !ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Calma lá", description: `Espere ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso },
        { title: "⏳ Slow down", description: `Wait ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso }));
    }
    ultimaFala.set(chaveAcao, Date.now());

    if (entrando) {
      if (!c.canalVoz) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falta configurar o canal",
            description: `Ninguém definiu em qual call a Judy fala.\n\nQuem tem **ManageMessages** resolve com \`${PREFIXO}tts canal aqui\` dentro da call.`,
            colour: COR.erro },
          { title: "❌ No channel configured",
            description: `Nobody set which call Judy speaks in.\n\nAnyone with **ManageMessages** can fix it with \`${PREFIXO}tts canal here\` inside the call.`,
            colour: COR.erro }));
      }
      if (!c.ativo) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "🔴 A voz está desligada",
            description: `Peça a alguém da equipe para religar com \`${PREFIXO}tts on\`.`, colour: COR.aviso },
          { title: "🔴 Voice is off",
            description: `Ask a staff member to turn it back on with \`${PREFIXO}tts on\`.`, colour: COR.aviso }));
      }
      // Quem chamou o bot de volta não herda o silêncio da bagunça anterior.
      filtro.limpar(c.canalTexto ?? null);
      try {
        await chamar("/entrar", { canalVoz: c.canalVoz });
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Entrei na call", description: `Estou em <#${c.canalVoz}>.\n\nManda o que eu falo: \`${PREFIXO}tts oi pessoal\``, colour: COR.sucesso },
          { title: "✅ Joined the call", description: `I'm in <#${c.canalVoz}>.\n\nTell me what to say: \`${PREFIXO}tts hello\``, colour: COR.sucesso }));
      } catch (e) {
        // Tira crases da mensagem do serviço: ela entra DENTRO de um trecho
        // em crase, e uma crase no meio fecha o trecho cedo — foi assim que
        // o erro apareceu no chat com uma crase solta no fim.
        const motivo = String(e.message ?? e).replace(/`/g, "");
        return sendEmbed(message.channel, {
          title: lang === "en" ? "❌ Couldn't join" : "❌ Não consegui entrar",
          description: `\`${motivo}\`\n\n${lang === "en"
            ? `Find out where it jams: \`${PREFIXO}tts diagnostico\``
            : `Descubra onde trava: \`${PREFIXO}tts diagnostico\``}`,
          colour: COR.erro });
      }
    }

    try { await chamar("/sair", { canalVoz: c.canalVoz }); } catch {}
    filtro.limpar(c.canalTexto ?? null);
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Saí da call",
        description: `Até a próxima.\n\n_A transmissão não me traz de volta sozinha — chame com \`${PREFIXO}tts entrar\`._`,
        colour: COR.sucesso },
      { title: "✅ Left the call",
        description: `See you.\n\n_The broadcast won't drag me back on its own — call me with \`${PREFIXO}tts entrar\`._`,
        colour: COR.sucesso }));
  }


  // ── configuração (staff) ──
  // ── &tts dicionario ── (consulta é pública, edição é staff)
  if (["dicionario", "dicionário", "dictionary", "dic", "abreviacoes", "abreviações"].includes(sub)) {
    const acao = (args[1] ?? "").toLowerCase();
    const arg = args.slice(2).join(" ").trim();

    if (!acao || ["lista", "list", "ver"].includes(acao)) {
      const meus = Object.entries(c.dicionario ?? {});
      return sendEmbed(message.channel, tr(ctx, {
        title: "📖 Dicionário da voz",
        description: [
          `**Embutido:** ${c.expandir === false ? "🔴 desligado" : `🟢 ${Object.keys(abrev.PADRAO).length} abreviações comuns`}`,
          `_(vc → você, n → não, pq → porque, kkkk → risada…)_`,
          "",
          `**Deste servidor:** ${meus.length ? meus.length : "_nenhuma_"}`,
          ...(meus.length ? [meus.map(([k, v]) => `\`${k}\` → ${v}`).join("\n")] : []),
          "",
          `\`${PREFIXO}tts dicionario add <abrev> <texto>\``,
          `\`${PREFIXO}tts dicionario remove <abrev>\` · \`${PREFIXO}tts dicionario padrao on|off\``,
        ].join("\n"),
        colour: COR.info,
      }, {
        title: "📖 Voice dictionary",
        description: [
          `**Built-in:** ${c.expandir === false ? "🔴 off" : `🟢 ${Object.keys(abrev.PADRAO).length} common abbreviations`}`,
          `_(vc → você, n → não, pq → porque, kkkk → laughter…)_`,
          "",
          `**This server's:** ${meus.length ? meus.length : "_none_"}`,
          ...(meus.length ? [meus.map(([k, v]) => `\`${k}\` → ${v}`).join("\n")] : []),
          "",
          `\`${PREFIXO}tts dicionario add <abbrev> <text>\``,
          `\`${PREFIXO}tts dicionario remove <abbrev>\` · \`${PREFIXO}tts dicionario padrao on|off\``,
        ].join("\n"),
        colour: COR.info,
      }));
    }

    const server0 = await getServer(message).catch(() => null);
    if (!membroTemPermissao(message, server0, "ManageMessages")) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para mexer no dicionário.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to change the dictionary.", colour: COR.erro }));
    }

    if (["add", "adicionar", "set"].includes(acao)) {
      const partes = arg.split(/\s+/);
      const chave = (partes.shift() ?? "").toLowerCase();
      const valor = partes.join(" ").trim();
      if (!chave || !valor) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Faltou algo",
            description: `Uso: \`${PREFIXO}tts dicionario add <abrev> <texto>\`\nEx.: \`${PREFIXO}tts dicionario add rt retuíte\``, colour: COR.erro },
          { title: "❌ Missing something",
            description: `Usage: \`${PREFIXO}tts dicionario add <abbrev> <text>\``, colour: COR.erro }));
      }
      if (chave.length > 20 || valor.length > 80) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Longo demais", description: "Abreviação até 20 e expansão até 80 caracteres.", colour: COR.erro },
          { title: "❌ Too long", description: "Abbreviation up to 20 and expansion up to 80 characters.", colour: COR.erro }));
      }
      if (Object.keys(c.dicionario).length >= 200) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Dicionário cheio", description: "O limite é de 200 entradas por servidor.", colour: COR.erro },
          { title: "❌ Dictionary full", description: "The limit is 200 entries per server.", colour: COR.erro }));
      }
      c.dicionario[chave] = valor; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "📖 Adicionado",
          description: `\`${chave}\` → **${valor}**\n\n_Exemplo:_ "${abrev.expandir(`teste ${chave} aqui`, c.dicionario)}"`,
          colour: COR.sucesso },
        { title: "📖 Added",
          description: `\`${chave}\` → **${valor}**`, colour: COR.sucesso }));
    }

    if (["remove", "remover", "rem", "del"].includes(acao)) {
      const chave = arg.toLowerCase();
      const tinha = chave in (c.dicionario ?? {});
      delete c.dicionario[chave]; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: tinha ? "📖 Removido" : "📖 Não estava no dicionário",
          description: tinha
            ? `\`${chave}\` não é mais expandido.`
            : `\`${chave}\` não constava. _(As abreviações embutidas não se removem uma a uma — use \`padrao off\`.)_`,
          colour: tinha ? COR.sucesso : COR.aviso },
        { title: tinha ? "📖 Removed" : "📖 Not in the dictionary",
          description: tinha ? `\`${chave}\` is no longer expanded.` : `\`${chave}\` wasn't there.`,
          colour: tinha ? COR.sucesso : COR.aviso }));
    }

    if (["padrao", "padrão", "default", "embutido"].includes(acao)) {
      c.expandir = !["off", "nao", "não", "no"].includes(arg.toLowerCase());
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: c.expandir ? "📖 Dicionário embutido ligado" : "📖 Dicionário embutido desligado",
          description: c.expandir
            ? "As abreviações comuns voltam a ser expandidas."
            : "Só o dicionário deste servidor vale agora — a escrita de chat será lida como está.",
          colour: COR.sucesso },
        { title: c.expandir ? "📖 Built-in dictionary on" : "📖 Built-in dictionary off",
          description: c.expandir ? "Common abbreviations are expanded again." : "Only this server's dictionary applies now.",
          colour: COR.sucesso }));
    }

    if (["limpar", "clear"].includes(acao)) {
      c.dicionario = {}; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "📖 Dicionário do servidor esvaziado", description: "As abreviações embutidas continuam valendo.", colour: COR.sucesso },
        { title: "📖 Server dictionary cleared", description: "The built-in abbreviations still apply.", colour: COR.sucesso }));
    }
  }

  if (["canal", "channel", "transmitir", "broadcast",
       "on", "off", "voz", "voice", "cooldown", "espera", "nomes", "names",
       "efeito", "effect", "timbre", "tom", "pitch", "altura"].includes(sub)) {
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para configurar a voz.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to configure the voice.", colour: COR.erro }));
    }

    if (["canal", "channel"].includes(sub)) {
      // Canais de voz do Stoat têm chat próprio, então `aqui` é o atalho
      // natural: você digita dentro da call que quer configurar. Sem alvo
      // nenhum, assume `aqui` — é o que a pessoa quis dizer.
      const alvo = resto || "aqui";
      const id = resolverCanal(alvo, { message, server });
      if (!id) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido",
            description: [
              `Não identifiquei um canal em \`${alvo}\`.`,
              "",
              `\`${PREFIXO}tts canal aqui\` — usa **este** canal (digite dentro da call)`,
              `\`${PREFIXO}tts canal <#canal>\` — por menção, link, ID ou nome`,
              "",
              "_Precisa ser um canal de **voz**._",
            ].join("\n"), colour: COR.erro },
          { title: "❌ Invalid channel",
            description: [
              `I couldn't identify a channel in \`${alvo}\`.`,
              "",
              `\`${PREFIXO}tts canal here\` — uses **this** channel (type it inside the call)`,
              `\`${PREFIXO}tts canal <#channel>\` — by mention, link, ID or name`,
              "",
              "_It must be a **voice** channel._",
            ].join("\n"), colour: COR.erro }));
      }
      c.canalVoz = id; c.ativo = true; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Canal de voz definido",
          description: `A Judy vai falar em <#${id}>.\n\nTeste: \`${PREFIXO}tts olá pessoal\``, colour: COR.sucesso },
        { title: "✅ Voice channel set",
          description: `Judy will speak in <#${id}>.\n\nTest: \`${PREFIXO}tts hello everyone\``, colour: COR.sucesso }));
    }

    if (["transmitir", "broadcast"].includes(sub)) {
      if (["off", "limpar", "clear", "nao", "não"].includes(resto.toLowerCase())) {
        c.canalTexto = null; salvarConfig?.();
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Transmissão desligada",
            description: `Só o \`${PREFIXO}tts <texto>\` fala agora.`, colour: COR.sucesso },
          { title: "✅ Broadcast off",
            description: `Only \`${PREFIXO}tts <text>\` speaks now.`, colour: COR.sucesso }));
      }
      const id = resolverCanal(resto || "aqui", { message, server });
      if (!id) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido", description: `Uso: \`${PREFIXO}tts transmitir <#canal-de-texto>\``, colour: COR.erro },
          { title: "❌ Invalid channel", description: `Usage: \`${PREFIXO}tts transmitir <#text-channel>\``, colour: COR.erro }));
      }
      c.canalTexto = id; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Transmissão ligada",
          description: `Tudo escrito em <#${id}> será **falado na call**.\n\n⚠️ Vale para todo mundo que escrever lá — desligue com \`${PREFIXO}tts transmitir off\`.`,
          colour: COR.aviso },
        { title: "✅ Broadcast on",
          description: `Everything written in <#${id}> will be **spoken in the call**.\n\n⚠️ That applies to everyone writing there — turn it off with \`${PREFIXO}tts transmitir off\`.`,
          colour: COR.aviso }));
    }

    if (sub === "on" || sub === "off") {
      c.ativo = sub === "on"; salvarConfig?.();
      if (!c.ativo) { try { await chamar("/sair", { canalVoz: c.canalVoz }); } catch {} }
      return sendEmbed(message.channel, tr(ctx,
        { title: c.ativo ? "✅ Voz ligada" : "🔴 Voz desligada",
          description: c.ativo ? "A Judy volta a falar." : "Nada será falado até religar.", colour: COR.mod },
        { title: c.ativo ? "✅ Voice on" : "🔴 Voice off",
          description: c.ativo ? "Judy speaks again." : "Nothing will be spoken until re-enabled.", colour: COR.mod }));
    }

    if (["tom", "pitch", "altura"].includes(sub)) {
      if (!resto) {
        return sendEmbed(message.channel, tr(ctx, {
          title: "🎚️ Tom da voz",
          description: [
            `**Agora:** ${c.tom ?? 1}${c.tom && c.tom !== 1 ? "" : " _(original)_"}`,
            "",
            `\`${PREFIXO}tts tom 1.10\` — mais agudo · \`${PREFIXO}tts tom 0.92\` — mais grave`,
            `\`${PREFIXO}tts tom 1\` — volta ao original`,
            "",
            "_Sobe **tom e formantes juntos**: uma voz masculina vira feminina de verdade, não 'homem falando fino'._",
            "_Se a voz base já é feminina (como a `dii`), mexa pouco — acima de 1.05 começa a soar infantil._",
          ].join("\n"),
          colour: COR.info,
        }, {
          title: "🎚️ Voice pitch",
          description: [
            `**Now:** ${c.tom ?? 1}${c.tom && c.tom !== 1 ? "" : " _(original)_"}`,
            "",
            `\`${PREFIXO}tts tom 1.10\` — higher · \`${PREFIXO}tts tom 0.92\` — lower`,
            `\`${PREFIXO}tts tom 1\` — back to original`,
            "",
            "_Shifts **pitch and formants together**: a male voice becomes properly feminine, not a sped-up man._",
            "_If the base voice is already female (like `dii`), go easy — above 1.05 starts sounding childlike._",
          ].join("\n"),
          colour: COR.info,
        }));
      }
      const n = Number(resto.replace(",", "."));
      if (!Number.isFinite(n) || n < 0.5 || n > 2) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Valor inválido", description: `Entre 0.5 e 2.0. Ex.: \`${PREFIXO}tts tom 1.08\``, colour: COR.erro },
          { title: "❌ Invalid value", description: `Between 0.5 and 2.0. E.g.: \`${PREFIXO}tts tom 1.08\``, colour: COR.erro }));
      }
      c.tom = n === 1 ? null : n; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎚️ Tom ajustado",
          description: `${n === 1 ? "Voltou ao tom original." : `Tom em **${n}**.`}\n\nOuça: \`${PREFIXO}tts teste de voz\``,
          colour: COR.sucesso },
        { title: "🎚️ Pitch adjusted",
          description: `${n === 1 ? "Back to the original pitch." : `Pitch at **${n}**.`}`,
          colour: COR.sucesso }));
    }

    if (["efeito", "effect", "timbre"].includes(sub)) {
      let saude = null;
      try { saude = await chamar("/saude", null, "GET"); } catch {}
      const disp = saude?.efeitos ?? ["nenhum", "glados", "robo", "radio", "grave", "agudo", "sussurro"];
      const alvo = resto.toLowerCase();

      if (!alvo) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "🎛️ Voice effects" : "🎛️ Efeitos de voz",
          description: [
            ...disp.map((e) => `• \`${e}\`${e === (c.efeito ?? "nenhum") ? " ←" : ""}`),
            "",
            "",
            lang === "en"
              ? `_These change the **character** only — pitch is a separate knob: \`${PREFIXO}tts tom <n>\`. That way an effect sounds the same over any base voice._`
              : `_Estes mudam só o **caráter** — a altura é um controle à parte: \`${PREFIXO}tts tom <n>\`. Assim um efeito soa igual sobre qualquer voz base._`,
            "",
            lang === "en"
              ? "_There's no GLaDOS voice trained in Portuguese — the ready-made ones are English models from Portal. `glados` here is the **processing** (narrow band, metallic ring, chamber, slight pitch), applied over the voice you already use._"
              : "_Não existe voz GLaDOS treinada em português — as prontas são modelos ingleses do Portal. O `glados` aqui é o **processamento** (banda estreita, ressonância metálica, câmara e leve mudança de tom), aplicado sobre a voz que você já usa._",
          ].join("\n"),
          colour: COR.info });
      }

      // O serviço de voz é atualizado à parte (roda no Gentoo, fora do
      // Docker). Se ele não conhece efeitos que este código já conhece, está
      // com versão antiga — e aceitar o pedido faria a fala sair SEM efeito,
      // silenciosamente. Melhor dizer o que houve e como resolver.
      if (saude && Number(saude.versao ?? 0) < VOZ_API_ESPERADA) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "⚠️ Serviço de voz desatualizado",
            description: [
              `O bot espera a versão **${VOZ_API_ESPERADA}** do serviço de voz, mas o \`judy-voz\` responde **${saude.versao ?? "1"}** — a fala sairia sem efeito.`,
              "",
              "No Gentoo:",
              "```sudo rc-service judy-voz restart```",
              `Depois: \`${PREFIXO}tts efeito\` para ver a lista completa.`,
            ].join("\n"), colour: COR.aviso },
          { title: "⚠️ Voice service is outdated",
            description: [
              `The bot expects voice service version **${VOZ_API_ESPERADA}**, but \`judy-voz\` reports **${saude.versao ?? "1"}** — speech would come out with no effect.`,
              "",
              "On the Gentoo box:",
              "```sudo rc-service judy-voz restart```",
            ].join("\n"), colour: COR.aviso }));
      }

      if (!disp.includes(alvo)) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "❌ Unknown effect" : "❌ Efeito desconhecido",
          description: `\`${alvo}\`\n\n${disp.map((e) => `\`${e}\``).join(", ")}`, colour: COR.erro });
      }
      c.efeito = alvo === "nenhum" ? null : alvo; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎛️ Efeito aplicado",
          description: `Agora falo com \`${alvo}\`.\n\nOuça: \`${PREFIXO}tts teste de voz\``, colour: COR.sucesso },
        { title: "🎛️ Effect applied",
          description: `Now speaking with \`${alvo}\`.\n\nHear it: \`${PREFIXO}tts voice test\``, colour: COR.sucesso }));
    }

    if (["cooldown", "espera"].includes(sub)) {
      const seg = Number(resto.replace(",", "."));
      if (!Number.isFinite(seg) || seg < 0 || seg > 300) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Valor inválido",
            description: `Uso: \`${PREFIXO}tts cooldown <segundos>\` (0 a 300)\n_0 desliga o freio — cuidado em canal movimentado._`, colour: COR.erro },
          { title: "❌ Invalid value",
            description: `Usage: \`${PREFIXO}tts cooldown <seconds>\` (0 to 300)\n_0 removes the brake — careful on a busy channel._`, colour: COR.erro }));
      }
      c.cooldown = Math.round(seg * 1000); salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Freio ajustado",
          description: seg === 0
            ? "Sem espera entre falas da mesma pessoa.\n\n⚠️ Num canal movimentado isso vira uma fila enorme de fala."
            : `Cada pessoa espera **${seg}s** entre uma fala e outra.`,
          colour: seg === 0 ? COR.aviso : COR.sucesso },
        { title: "✅ Brake adjusted",
          description: seg === 0
            ? "No wait between the same person's utterances.\n\n⚠️ On a busy channel this builds a huge speech queue."
            : `Each person waits **${seg}s** between utterances.`,
          colour: seg === 0 ? COR.aviso : COR.sucesso }));
    }

    if (["nomes", "names"].includes(sub)) {
      const ligar = !["off", "nao", "não", "no"].includes(resto.toLowerCase());
      c.anunciarNome = ligar; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: ligar ? "✅ Anunciando quem falou" : "✅ Só o texto",
          description: ligar ? '_"Fulano disse: bom dia"_' : '_"bom dia"_',
          colour: COR.sucesso },
        { title: ligar ? "✅ Announcing who spoke" : "✅ Text only",
          description: ligar ? '_"Someone said: good morning"_' : '_"good morning"_',
          colour: COR.sucesso }));
    }

    if (["voz", "voice"].includes(sub)) {
      let saude = null;
      try { saude = await chamar("/saude", null, "GET"); } catch {}
      const vozes = saude?.piper?.vozes ?? [];
      if (!resto) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "🔊 Available voices" : "🔊 Vozes disponíveis",
          description: vozes.length
            ? vozes.map((v) => `• \`${v}\`${v === (c.voz ?? saude?.piper?.vozAtual) ? " ←" : ""}`).join("\n")
            : (lang === "en" ? "_none installed_" : "_nenhuma instalada_"),
          colour: COR.info });
      }
      if (vozes.length && !vozes.includes(resto)) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "❌ Unknown voice" : "❌ Voz desconhecida",
          description: `\`${resto}\`\n\n${vozes.map((v) => `\`${v}\``).join(", ")}`, colour: COR.erro });
      }
      c.voz = resto; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Voz alterada", description: `Agora falo com \`${resto}\`.`, colour: COR.sucesso },
        { title: "✅ Voice changed", description: `Now speaking with \`${resto}\`.`, colour: COR.sucesso }));
    }
  }

  // ── &tts <texto> → falar ──
  // Antes: uma palavra digitada errado virava fala. `&tts diagnosticar`
  // mandava a Judy dizer "diagnosticar" — e, como fala explícita entra na
  // call sozinha, gastava os 20s do timeout de entrada para fazer isso.
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
        `\`${PREFIXO}tts <texto>\` — fala na call`,
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` — chama ou dispensa a Judy`,
        `\`${PREFIXO}tts estado\` — diagnóstico`,
        "_Estes valem para **todo mundo**._",
        "",
        `**Configuração** _(ManageMessages)_`,
        `\`${PREFIXO}tts canal aqui\` — define a call em que você está`
        + `\n\`${PREFIXO}tts transmitir aqui\` — **tudo** que for escrito aqui vira fala`
        + `\n\`${PREFIXO}tts canal <#voz>\` · \`${PREFIXO}tts voz\` · \`${PREFIXO}tts efeito\``
        + `\n\`${PREFIXO}tts tom <n>\` · \`${PREFIXO}tts cooldown <s>\` · \`${PREFIXO}tts nomes on|off\` · \`${PREFIXO}tts dicionario\``,
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` · \`${PREFIXO}tts on|off\``,
        `\`${PREFIXO}tts voz [nome]\` — escolhe a voz`,
      ].join("\n"), colour: COR.info,
    }, {
      title: "🔊 Judy's voice",
      description: [
        `\`${PREFIXO}tts <text>\` — speaks in the call`,
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` — call or dismiss Judy`,
        `\`${PREFIXO}tts estado\` — diagnostics`,
        "_These are open to **everyone**._",
        "",
        `**Configuration** _(ManageMessages)_`,
        `\`${PREFIXO}tts canal here\` — sets the call you are in`
        + `\n\`${PREFIXO}tts transmitir here\` — **everything** written here becomes speech`
        + `\n\`${PREFIXO}tts canal <#voice>\` · \`${PREFIXO}tts cooldown <s>\` · \`${PREFIXO}tts nomes on|off\``,
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` · \`${PREFIXO}tts on|off\``,
        `\`${PREFIXO}tts voz [name]\` — pick the voice`,
      ].join("\n"), colour: COR.info,
    }));
  }

  if (!c.ativo || !c.canalVoz) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Voz não configurada", description: `Defina o canal: \`${PREFIXO}tts canal <#voz>\``, colour: COR.erro },
      { title: "❌ Voice not set up", description: `Set the channel: \`${PREFIXO}tts canal <#voice>\``, colour: COR.erro }));
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
