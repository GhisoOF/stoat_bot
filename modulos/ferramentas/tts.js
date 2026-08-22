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

// Todo subcomando que o `&tts` entende. Serve para pegar o erro de digitação
// antes de ele virar fala: `&tts diagnosticar` (com o "r") não é um pedido
// para a Judy dizer a palavra "diagnosticar" em voz alta — mas era isso que
// acontecia, e ainda gastava 20s tentando entrar na call para fazê-lo.
const SUBCOMANDOS = [
  "estado", "status", "saude", "diagnostico", "reiniciar", "resgatar", "filtro",
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

// ──────────────────────────────────────────────────────────
//  Em qual call eu entro?
//
//  No Stoat um canal de "Call" tem voz E chat no mesmo canal — então, na
//  esmagadora maioria das vezes, a resposta é "a call onde a pessoa acabou
//  de digitar o comando". Exigir que alguém configurasse isso antes era
//  pedir para declarar o óbvio.
//
//  Ordem: o canal atual, se for de voz → o que já estiver configurado →
//  o único canal de voz do servidor, se houver só um. Nada disso valendo,
//  quem chama mostra as opções em vez de adivinhar.
// ──────────────────────────────────────────────────────────
// ATENÇÃO: no Stoat NÃO existe um "VoiceChannel" separado — uma call vive
// dentro de um `TextChannel` com voz habilitada. Eu tinha suposto o contrário,
// e o resultado foi `&tts entrar` recusar exatamente o canal certo (o
// diagnóstico do servidor mostrou "tipo: TextChannel · nome: Call") e cair
// para uma configuração antiga, entrando na call errada.
//
// Como qualquer canal pode ter call, a pergunta "isto é um canal de voz?" não
// tem resposta confiável no cliente. A resposta útil é outra: **a call é a do
// canal onde a pessoa digitou**. Se não houver call ali, o join_call falha com
// uma mensagem clara — melhor do que adivinhar em silêncio.
// A call presa pode estar num canal de OUTRO servidor, e a rota que
// desconecta só a encontra se procurar no servidor certo. O serviço de voz
// não tem a lista; o bot tem.
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
  // O canal onde a pessoa digitou vem primeiro, sempre. É o que ela quer
  // dizer com "entra aqui", e no Stoat é onde a call de fato está.
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
    const linhas = (d.etapas ?? []).map((e) =>
      `${marca(e.ok)} **${e.etapa}** — ${e.ms}ms${e.status ? ` · HTTP ${e.status}` : ""}\n   ${String(e.detalhe ?? "").slice(0, 160).replace(/`/g, "")}`);

    // Onde os 20s foram gastos na última tentativa. É o dado que falta
    // quando o join é uma caixa preta: sem ele, "travou no join" é tudo
    // que dá para dizer, e não é suficiente para consertar nada.
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
        `🔎 **\`AlreadyConnected\`: o Stoat me registra como já estando nesta call.** Não é permissão nem rede: é um registro preso no lado dele, sobra de uma entrada que travou no meio.\n\n\`${PREFIXO}tts destravar\` tenta me desconectar _(ManageMessages)_. Não dando certo, \`${PREFIXO}tts resgatar\`: entro por outra call e me movo para esta — o mover emite um token sem conferir o registro preso. _(Remover pelo cliente ou kick passam pela mesma chave que o destravar, então não adiantam quando ele não adianta.)_`,
        `🔎 **\`AlreadyConnected\`: Stoat records me as already in this call.** Not permission, not network: a stuck record on their side, left over from a join that jammed halfway.\n\n\`${PREFIXO}tts destravar\` tries to disconnect me _(ManageMessages)_. If that fails, \`${PREFIXO}tts resgatar\`: I come in through another call and move myself here — the move issues a token without checking the stuck record. _(Removing me in the client or kicking go through the same key as destravar, so they won't help when it doesn't.)_`);
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

  // ── resgatar (staff): sai do AlreadyConnected pela porta dos fundos ──
  //
  //  O que está preso é um conjunto no Redis do Stoat (`vc:{bot}`), que só o
  //  aviso `participant_left` do LiveKit limpa. `destravar` não o alcança: a
  //  rota que ele usa só age se a chave `{bot}:{servidor}` apontar para uma
  //  call — e devolve 200 mesmo quando não aponta para nada. Nem kick ajuda:
  //  `member_remove` lê a MESMA chave. Sobra o MOVER (`voice_channel` no PATCH
  //  do próprio membro), que emite um token para o canal destino sem passar
  //  pelo `raise_if_in_voice`. O token vem pelo WebSocket, no evento
  //  `UserMoveVoiceChannel`; aqui a gente o captura e entrega ao serviço.
  //
  //  Roteiro: entrar numa call AUXILIAR do mesmo servidor (para a chave
  //  existir) → PATCH voice_channel → pegar o token do evento → o serviço
  //  conecta com ele na call presa. Pronto: de participante real, o estado
  //  do Stoat volta a bater com o meu, e a leitura já começa ali.
  if (["resgatar", "resgate", "rescue"].includes(sub)) {
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente", description: "Você precisa de **ManageMessages**.", colour: COR.erro },
        { title: "🚫 Missing permission", description: "You need **ManageMessages**.", colour: COR.erro }));
    }
    const client = ctx.client;
    const meuId = client?.user?.id;
    const token = process.env.BOT_TOKEN;
    const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
    const presa = c.canalVoz && c.canalVoz !== message.channelId && !pareceCanalDeVoz(message.channel)
      ? c.canalVoz : message.channelId;
    const passos = [];
    const ok = (t) => passos.push(`✅ ${t}`);
    const falha = (t) => passos.push(`❌ ${t}`);
    const relatar = (titulo, cor, rodape) => sendEmbed(message.channel, {
      title: titulo, description: [...passos, "", rodape].filter((x) => x != null).join("\n"), colour: cor,
    });

    // Call auxiliar: a indicada, ou a primeira outra call do servidor.
    const auxArg = resto ? resolverCanal(resto, { message, server }) : null;
    const candidatas = canaisDeVozDo(server, client)
      .filter((v) => (v.id ?? v._id) !== presa)
      .sort((a, b) => (b.isVoice === true) - (a.isVoice === true));
    const aux = auxArg ?? (candidatas[0]?.id ?? candidatas[0]?._id ?? null);
    if (!aux || aux === presa) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❓ Preciso de uma call auxiliar",
        description: `O resgate passa por **outra call do mesmo servidor** (entro nela e me movo para <#${presa}>). Não achei nenhuma sozinha — diga qual: \`${PREFIXO}tts resgatar #call-auxiliar\`.`,
        colour: COR.aviso,
      }, {
        title: "❓ I need a helper call",
        description: `The rescue goes through **another call in this server** (I join it and move myself to <#${presa}>). I couldn't find one on my own — tell me which: \`${PREFIXO}tts resgatar #helper-call\`.`,
        colour: COR.aviso,
      }));
    }
    if (!meuId || !token) {
      return sendEmbed(message.channel, { title: "❌", description: "sem `BOT_TOKEN`/id próprio no ambiente do bot", colour: COR.erro });
    }

    await sendEmbed(message.channel, tr(ctx, {
      title: "🛟 Resgate em andamento",
      description: `Entrando em <#${aux}> para depois me mover para <#${presa}>. Leva uns 10–30s.`,
      colour: COR.info,
    }, {
      title: "🛟 Rescue in progress",
      description: `Joining <#${aux}> so I can move myself to <#${presa}>. Takes about 10–30s.`,
      colour: COR.info,
    }));

    // 1. entrar na auxiliar
    try {
      const r = await chamar("/entrar", { canalVoz: aux, serverId, servidores: servidoresConhecidos(ctx) });
      ok(`${lang === "en" ? "joined helper call" : "entrei na call auxiliar"} <#${aux}>${r?.jaEstava ? (lang === "en" ? " (was already there)" : " (já estava)") : ""}`);
    } catch (e) {
      falha(`${lang === "en" ? "helper call" : "call auxiliar"} <#${aux}>: \`${String(e.message ?? e).replace(/`/g, "")}\``);
      return relatar(lang === "en" ? "⚠️ Rescue stopped at the helper call" : "⚠️ Resgate parou na call auxiliar", COR.aviso,
        lang === "en"
          ? "If this one is also stuck, pick another: `" + PREFIXO + "tts resgatar #other-call`."
          : "Se essa também está presa, escolha outra: `" + PREFIXO + "tts resgatar #outra-call`.");
    }

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
    const tokenDoMover = new Promise((resolve, reject) => {
      const t = setTimeout(() => { client?.events?.off?.("event", ouvir); reject(new Error("15s sem o evento UserMoveVoiceChannel")); }, 15_000);
      const ouvir = (ev) => {
        if (ev?.type !== "UserMoveVoiceChannel" || ev?.to !== presa) return;
        clearTimeout(t); client?.events?.off?.("event", ouvir); resolve(ev);
      };
      client?.events?.on?.("event", ouvir);
    });
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
      tokenDoMover.catch(() => {});
      falha(`PATCH voice_channel → ${patch.erro ?? `HTTP ${patch.status} ${patch.corpo.replace(/`/g, "")}`}`);
      const dica = /NotConnected/i.test(patch.corpo ?? "")
        ? (lang === "en"
            ? "`NotConnected`: Stoat never recorded my join in the helper call. That's the `participant_joined` webhook not being processed on their side — nothing I can fix from here; try again in a minute."
            : "`NotConnected`: o Stoat não registrou minha entrada na call auxiliar. É o webhook `participant_joined` não sendo processado do lado deles — não tenho como consertar daqui; tente de novo em um minuto.")
        : (lang === "en" ? "I'll stay in the helper call; `" + PREFIXO + "tts sair` drops me." : "Fico na call auxiliar; `" + PREFIXO + "tts sair` me tira.");
      return relatar(lang === "en" ? "⚠️ Rescue failed at the move" : "⚠️ Resgate falhou no mover", COR.aviso, dica);
    }
    ok(`PATCH voice_channel → HTTP ${patch.status}`);

    let ev;
    try { ev = await tokenDoMover; }
    catch (e) {
      falha(`${lang === "en" ? "token" : "token"}: \`${e.message}\``);
      return relatar(lang === "en" ? "⚠️ Rescue failed waiting for the token" : "⚠️ Resgate falhou esperando o token", COR.aviso,
        lang === "en"
          ? "Stoat accepted the move but never sent the `UserMoveVoiceChannel` event with the token. `" + PREFIXO + "tts sair` and try again."
          : "O Stoat aceitou o mover mas não mandou o evento `UserMoveVoiceChannel` com o token. `" + PREFIXO + "tts sair` e tente de novo.");
    }
    ok(`${lang === "en" ? "got the token for" : "recebi o token para"} <#${presa}> (node \`${ev.node ?? "?"}\`)`);

    // 4. o serviço entra com o token (sai da auxiliar no caminho)
    try {
      await chamar("/entrar-com-token", { canalVoz: presa, token: ev.token, node: ev.node ?? null, serverId });
      ok(`${lang === "en" ? "connected for real in" : "conectei de verdade em"} <#${presa}>`);
    } catch (e) {
      falha(`${lang === "en" ? "join with token" : "entrada com token"}: \`${String(e.message ?? e).replace(/`/g, "")}\``);
      return relatar(lang === "en" ? "⚠️ Rescue failed at the final join" : "⚠️ Resgate falhou na entrada final", COR.aviso,
        lang === "en"
          ? "If the service answered \"rota desconhecida\", update `voz-servico/` on the machine (this needs API version " + VOZ_API_ESPERADA + ")."
          : "Se o serviço respondeu \"rota desconhecida\", atualize o `voz-servico/` na máquina (isto precisa da versão " + VOZ_API_ESPERADA + " da API).");
    }

    // Já que estou lá, a leitura começa ali — é o que a pessoa queria.
    if (!c.ativo) c.ativo = true;
    c.canalVoz = presa;
    if (!c.canalTexto) c.canalTexto = message.channelId;
    salvarConfig?.();
    filtro.limpar(c.canalTexto ?? null);
    return relatar(lang === "en" ? "🛟 Rescued — I'm in the call" : "🛟 Resgatada — estou na call", COR.sucesso,
      lang === "en"
        ? `Reading <#${c.canalTexto}> into <#${presa}>. From now on Stoat's record and mine match again, so \`${PREFIXO}tts sair\` / \`${PREFIXO}tts entrar\` work normally.`
        : `Lendo <#${c.canalTexto}> em <#${presa}>. Daqui em diante o registro do Stoat e o meu batem de novo, então \`${PREFIXO}tts sair\` / \`${PREFIXO}tts entrar\` voltam ao normal.`);
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
      // ── Um comando faz tudo ──
      //
      // Antes eram quatro, na ordem certa: `tts on`, `tts canal aqui`,
      // `tts transmitir aqui`, `tts entrar`. Errar a ordem dava mensagens de
      // erro que falavam de OUTRO comando, e ninguém que só queria a Judy
      // lendo a call tinha por que aprender essa sequência. Agora `entrar`
      // descobre a call, liga o sistema, liga a leitura e entra.
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

      // Configura sozinho o que estiver faltando, e lembra o que mudou para
      // contar no fim — quem quiser aprender os comandos vê quais foram.
      // Estava noutra call? Então este `entrar` é um "vem para cá".
      const vinhaDeOutra = !!c.canalVoz && c.canalVoz !== achado.id;
      const mudou = [];
      if (!c.ativo) { c.ativo = true; mudou.push(`${PREFIXO}tts on`); }
      if (c.canalVoz !== achado.id) { c.canalVoz = achado.id; mudou.push(`${PREFIXO}tts canal aqui`); }
      // A leitura fica no canal onde o comando foi dado. Num canal de call do
      // Stoat esse é o próprio chat da call, que é exatamente o que se espera.
      if (c.canalTexto !== message.channelId) {
        c.canalTexto = message.channelId;
        mudou.push(`${PREFIXO}tts transmitir aqui`);
      }
      if (mudou.length) salvarConfig?.();

      filtro.limpar(c.canalTexto ?? null);
      try {
        await chamar("/entrar", { canalVoz: c.canalVoz, serverId, servidores: servidoresConhecidos(ctx) });
      } catch (e) {
        const motivo = String(e.message ?? e).replace(/`/g, "");
        if (/AlreadyConnected/i.test(motivo)) {
          return sendEmbed(message.channel, tr(ctx, {
            title: "🔒 O Stoat me registra como já estando nesta call",
            description: [
              "Ele guarda isso num registro próprio e recusa toda entrada nova enquanto ele existir — mesmo eu não estando em call nenhuma. Sobra de uma entrada que travou no meio.",
              "",
              `Já tentei me desconectar sozinha e não deu. \`${PREFIXO}tts destravar\` tenta de novo e **confere** se funcionou _(ManageMessages)_.`,
              "",
              `**Enquanto isso, use outra call:** o bloqueio é só neste canal — em qualquer outro eu entro normalmente. Basta \`${PREFIXO}tts entrar\` lá.`,
              "",
              `Para liberar este canal de vez: \`${PREFIXO}tts resgatar\` _(ManageMessages)_ — entro por outra call e me movo para cá.`,
            ].join("\n"), colour: COR.aviso,
          }, {
            title: "🔒 Stoat records me as already in this call",
            description: [
              "It keeps its own record and refuses every new join while that record exists — even though I'm in no call at all. Left over from a join that jammed halfway.",
              "",
              `I already tried to disconnect myself and it didn't work. \`${PREFIXO}tts destravar\` tries again and **verifies** whether it worked _(ManageMessages)_.`,
              "",
              `**Meanwhile, use another call:** the block is on this channel only — anywhere else I join fine. Just \`${PREFIXO}tts entrar\` there.`,
              "",
              `To free this channel for good: \`${PREFIXO}tts resgatar\` _(ManageMessages)_ — I come in through another call and move myself here.`,
            ].join("\n"), colour: COR.aviso,
          }));
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
            ? `\n_Configurei sozinha o equivalente a: ${mudou.map((m) => `\`${m}\``).join(" · ")}_`
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
            ? `\n_I set up the equivalent of: ${mudou.map((m) => `\`${m}\``).join(" · ")}_`
            : "",
        ].filter(Boolean).join("\n"),
        colour: COR.sucesso,
      }));
    }

    // ── Sair: para de ler também ──
    // Sair da call e continuar "lendo" para ninguém não é um estado que alguém
    // queira. Quem sai, sai inteiro.
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
        `**Ajustes** _(ManageMessages)_`,
        `\`${PREFIXO}tts transmitir <#canal|off>\` — ler outro canal, ou parar de ler sem sair`,
        `\`${PREFIXO}tts canal <#voz>\` — fixar a call · \`${PREFIXO}tts nomes on|off\` — anunciar quem falou`,
        `\`${PREFIXO}tts cooldown <s>\` · \`${PREFIXO}tts dicionario\` · \`${PREFIXO}tts on|off\` · \`${PREFIXO}tts reiniciar\``,
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
        `**Settings** _(ManageMessages)_`,
        `\`${PREFIXO}tts transmitir <#channel|off>\` — read another channel, or stop reading without leaving`,
        `\`${PREFIXO}tts canal <#voice>\` — pin the call · \`${PREFIXO}tts nomes on|off\` — announce who spoke`,
        `\`${PREFIXO}tts cooldown <s>\` · \`${PREFIXO}tts dicionario\` · \`${PREFIXO}tts on|off\` · \`${PREFIXO}tts reiniciar\``,
      ].join("\n"), colour: COR.info,
    }));
  }

  // Falar sem estar em call: em vez de listar comandos de configuração,
  // aponta o único que a pessoa precisa saber.
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
