// assuntos.js — temas proibidos pela regra do servidor (13 out 2026).
//
// Pedido de Ghieh: há servidores com regra de "aqui não se discute política,
// religião…", mas o pessoal ZOA com esses temas e isso é OK. Então cada tema é
// um módulo que o servidor liga com a ação que quiser — e a palavra-chave
// sozinha nunca pune:
//
//   1. a palavra-chave (lista de fábrica + as do servidor) só LEVANTA a mão;
//   2. o modelo lê o fio recente do canal e decide se é DISCUSSÃO de verdade
//      (debate, briga de opinião, propaganda, oferta de droga, conteúdo sexual
//      explícito) ou brincadeira/menção de passagem — na dúvida, brincadeira;
//   3. só então a ação do tema: `alertar` (chama a staff, a mensagem fica),
//      `apagar` (só tira a mensagem) ou `punir` (apaga e conta na escada).
//
// Roda em segundo plano: a mensagem não espera o modelo. Erro do modelo nunca
// vira punição (fail-safe). Staff, como no resto do automod, não é moderada.

import * as log from "../core/log.js";

export const ACOES = ["off", "alertar", "apagar", "punir"];
const ACAO_EN = { alert: "alertar", delete: "apagar", punish: "punir", desligar: "off", desligado: "off", nada: "off", remover: "apagar", excluir: "apagar" };
export const acaoValida = (x) => {
  const a = String(x ?? "").toLowerCase();
  const v = ACAO_EN[a] ?? a;
  return ACOES.includes(v) ? v : null;
};

// Os termos estão SEM acento: o texto é comparado sem acento ("religiao" e
// "religião" são a mesma coisa). Uma palavra-chave só chama o modelo — por
// isso as expressões do dia a dia ("meu deus", "que droga") ficam de fora.
export const TEMAS = {
  politica: {
    emoji: "🏛️", pt: "política", en: "politics",
    termos: [
      "politic\\w*", "lula", "lulista\\w*", "bolsonar\\w*", "petista\\w*", "petralha\\w*", "esquerdista\\w*", "direitista\\w*",
      "esquerdopata\\w*", "esquerdalha", "comunis\\w*", "socialis\\w*", "fascis\\w*", "eleicao", "eleicoes", "eleitor\\w*",
      "urnas?", "stf", "xandao", "alexandre de moraes", "congresso", "senador\\w*", "deputad\\w*", "ministro\\w*",
      "governo", "presidente", "impeachment", "ditadura", "militancia", "militante\\w*", "haddad", "tarcisio", "ciro gomes",
      "dilma", "michel temer", "alckmin", "marcal", "psol", "mbl", "trump", "biden", "kamala", "milei", "putin", "zelensk\\w*",
      "democrat\\w*", "republican\\w*", "election\\w*", "voter\\w*", "liberals?", "conservative\\w*", "leftists?", "right[- ]wing",
    ],
    discussao_pt: "debate ou briga de opinião sobre política, políticos, partidos, eleições ou governo; defender ou atacar um lado; campanha ou propaganda política; tentar convencer alguém a votar",
    discussao_en: "a debate or argument about politics, politicians, parties, elections or government; defending or attacking a side; campaigning or political propaganda; trying to convince someone how to vote",
  },
  religiao: {
    emoji: "⛪", pt: "religião", en: "religion",
    termos: [
      "religi\\w*", "igrejas?", "evangelic\\w*", "crentes?", "catolic\\w*", "protestant\\w*", "ateus?", "ateia", "ateis\\w*",
      "biblias?", "biblic\\w*", "pastor(es)?", "padres?", "umbanda", "candomble", "espirit(a|as|ismo)", "macumba\\w*",
      "isla", "islam\\w*", "muculman\\w*", "alcorao", "judaismo", "budis\\w*", "hindu\\w*", "satanis\\w*", "jesus",
      "existe deus", "deus (nao )?existe", "acredit\\w* em deus", "church\\w*", "christian\\w*", "catholic\\w*",
      "atheis\\w*", "bible", "quran", "muslims?", "god (doesn'?t |does not )?exists?", "believe in god",
    ],
    discussao_pt: "debate ou briga sobre religião ou crença; atacar ou defender uma religião; pregação ou tentar converter alguém",
    discussao_en: "a debate or argument about religion or belief; attacking or defending a religion; preaching or trying to convert someone",
  },
  drogas: {
    emoji: "💊", pt: "drogas", en: "drugs",
    termos: [
      "drogas", "maconha", "cannabis", "baseado", "beck", "haxixe", "skunk", "cocaina", "crack", "lsd", "ecstasy", "ecstasi",
      "mdma", "ketamina", "cetamina", "heroina", "metanfetamina", "lanca[- ]perfume", "lolo", "cogumelos? magicos?",
      "psilocibina", "traficante\\w*", "trafico", "boca de fumo", "fumar um", "weed", "cocaine", "heroin", "meth",
      "molly", "shrooms", "drug dealer\\w*",
    ],
    discussao_pt: "oferecer, vender ou pedir drogas ilícitas; ensinar a conseguir, preparar ou usar; incentivar o uso",
    discussao_en: "offering, selling or asking for illegal drugs; teaching how to get, prepare or use them; encouraging their use",
  },
  sexual: {
    emoji: "🔞", pt: "conteúdo sexual", en: "sexual content",
    termos: [
      "sexo", "sexual", "transa\\w*", "transei", "punhet\\w*", "masturb\\w*", "boquete\\w*", "nudes?", "pack", "porn\\w*",
      "xvideos", "pornhub", "onlyfans", "goz(ar|ei|ou|ando)", "tesao", "siririca", "putaria", "buceta\\w*", "xoxota",
      "penis", "vagina", "sex", "horny", "blowjob", "handjob", "masturbat\\w*",
    ],
    discussao_pt: "conteúdo sexual explícito em texto: descrever ato sexual, pedir ou oferecer nudes/pack/conteúdo adulto, assédio ou cantada sexual insistente",
    discussao_en: "explicit sexual content in text: describing a sexual act, asking for or offering nudes/adult content, sexual harassment or insistent sexual advances",
  },
};
export const NOMES_TEMAS = Object.keys(TEMAS);
const TEMA_EN = { politics: "politica", religion: "religiao", drugs: "drogas", sex: "sexual", nsfw: "sexual" };
export const temaValido = (x) => {
  const t = semAcento(x);
  const v = TEMA_EN[t] ?? t;
  return TEMAS[v] ? v : null;
};

export function semAcento(s) {
  return String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const borda = (corpo) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${corpo})(?![\\p{L}\\p{N}])`, "iu");
const RE_FABRICA = Object.fromEntries(Object.entries(TEMAS).map(([k, t]) => [k, borda(t.termos.join("|"))]));

// Config deste servidor: { enabled, acoes: {tema: acao}, termos: {tema: [..]}, canaisLiberados, punicao }
export function acaoDoTema(cfg, tema) {
  return acaoValida(cfg?.acoes?.[tema]) ?? "off";
}
export function temasAtivos(cfg) {
  if (!cfg?.enabled) return [];
  return NOMES_TEMAS.filter((t) => acaoDoTema(cfg, t) !== "off");
}

// Qual tema a mensagem toca (só os ativos). [{ tema, termo }]
export function acharAssuntos(texto, cfg) {
  const t = semAcento(texto);
  if (!t.trim()) return [];
  const achados = [];
  for (const tema of temasAtivos(cfg)) {
    const extras = (cfg?.termos?.[tema] ?? []).map((x) => escapar(semAcento(x).trim()).replace(/\s+/g, "\\s+")).filter(Boolean);
    const m = t.match(RE_FABRICA[tema]) ?? (extras.length ? t.match(borda(extras.join("|"))) : null);
    if (m) achados.push({ tema, termo: m[0] });
  }
  return achados;
}

// ── O fio recente de cada canal (o que o modelo lê para julgar) ─────────────
// Próprio, e não o cache da conversa da IA: aquele só existe nos servidores
// com a IA ligada, e este módulo vale em qualquer servidor.
const FIO_MAX = 10, FIO_MS = 15 * 60_000;
const fios = new Map();   // canalId → [{ id, nome, texto, t }]
export function anotar(canalId, { id = null, nome = "alguém", texto = "" } = {}, agora = Date.now()) {
  if (!canalId || !String(texto).trim()) return;
  const arr = (fios.get(canalId) ?? []).filter((m) => agora - m.t < FIO_MS);
  if (id && arr.some((m) => m.id === id)) return;
  arr.push({ id, nome: String(nome).slice(0, 40), texto: String(texto).slice(0, 300), t: agora });
  fios.set(canalId, arr.slice(-FIO_MAX));
  if (fios.size > 2000) fios.delete(fios.keys().next().value);
}
export function fioDoCanal(canalId, { excluirId = null, limite = 8 } = {}) {
  return (fios.get(canalId) ?? []).filter((m) => !excluirId || m.id !== excluirId).slice(-limite)
    .map((m) => `${m.nome}: ${m.texto}`).join("\n");
}

// ── O juiz: o modelo pequeno, em JSON, sem raciocínio ───────────────────────
let avaliarLLM = null;
export function configurar({ avaliar }) { avaliarLLM = avaliar; }

export function promptDoTema(tema, lang = "pt") {
  const T = TEMAS[tema];
  if (lang === "en") return [
    `You moderate a laid-back chat server. Its rules forbid discussing ${T.en}. But people joke a lot, and joking is ALLOWED.`,
    "Read the conversation and decide whether the MESSAGE BEING JUDGED is part of a real discussion of that topic.",
    `It IS when it is: ${T.discussao_en}.`,
    "It is NOT: a joke, banter, meme, irony, comic exaggeration, playful swearing, a passing mention, an everyday expression, a neutral curious question, a news item quoted without debate.",
    "When in doubt, it is a joke.",
    'Reply ONLY with JSON: {"discussao": true|false, "motivo": "one short sentence"}',
  ].join("\n");
  return [
    `Você modera um servidor de conversa descontraído. A regra do servidor proíbe discutir ${T.pt}. Mas o pessoal brinca muito, e brincadeira é PERMITIDA.`,
    "Leia a conversa e decida se a MENSAGEM AVALIADA faz parte de uma discussão de verdade sobre esse tema.",
    `É discussão quando é: ${T.discussao_pt}.`,
    "NÃO é: piada, zoeira, meme, ironia, exagero cômico, xingamento de brincadeira, menção de passagem, expressão do dia a dia, pergunta curiosa e neutra, notícia citada sem debate.",
    "Na dúvida, é brincadeira.",
    'Responda SÓ um JSON: {"discussao": true|false, "motivo": "uma frase curta"}',
  ].join("\n");
}

export function lerVeredito(raw) {
  const txt = String(raw ?? "").replace(/```json|```/g, "");
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const d = o.discussao ?? o.discussion ?? o.viola;
    if (typeof d !== "boolean" && !/^(true|false|sim|n[ãa]o)$/i.test(String(d))) return null;
    return { discussao: d === true || /^(true|sim)$/i.test(String(d)), motivo: String(o.motivo ?? o.reason ?? "").slice(0, 200) };
  } catch { return null; }
}

// Um julgamento por canal e tema a cada 20 s: numa discussão quente, as
// mensagens seguintes usam o mesmo veredito em vez de encher a fila do modelo.
const JULGAR_MS = 20_000;
const vereditos = new Map();   // `${canal}:${tema}` → { t, discussao, motivo }
let ultimoAvisoSemIA = 0;

async function julgar({ tema, canalId, messageId, nome, texto, lang }, agora = Date.now()) {
  const chave = `${canalId}:${tema}`;
  const v = vereditos.get(chave);
  if (v && agora - v.t < JULGAR_MS) return { ...v, cache: true };
  if (!avaliarLLM) {
    if (agora - ultimoAvisoSemIA > 3600_000) { ultimoAvisoSemIA = agora; console.warn("[ASSUNTOS] tema detectado, mas a IA não está ligada — sem o modelo para confirmar, nada é feito"); }
    return null;
  }
  const fio = fioDoCanal(canalId, { excluirId: messageId });
  const corpo = lang === "en"
    ? `RECENT CONVERSATION:\n${fio || "(nothing before)"}\n\nMESSAGE BEING JUDGED (${nome}): ${texto.slice(0, 500)}`
    : `CONVERSA RECENTE:\n${fio || "(nada antes)"}\n\nMENSAGEM AVALIADA (${nome}): ${texto.slice(0, 500)}`;
  let r = null;
  try {
    r = lerVeredito(await avaliarLLM([{ role: "system", content: promptDoTema(tema, lang) }, { role: "user", content: corpo }], { etiqueta: `assunto:${tema}` }));
  } catch (e) {
    console.warn(`[ASSUNTOS] o modelo falhou (${e?.message ?? e}) — nada é feito`);
    return null;   // fail-safe: erro nunca vira punição
  }
  if (!r) return null;
  vereditos.set(chave, { t: agora, ...r });
  if (vereditos.size > 2000) vereditos.delete(vereditos.keys().next().value);
  return r;
}

// Aviso no canal ao apagar: um por canal e tema a cada 2 min (numa discussão
// apagada mensagem a mensagem, o canal não vira um mural de avisos).
const AVISO_MS = 2 * 60_000;
const avisados = new Map();

const PESO = { alertar: 1, apagar: 2, punir: 3 };

// Chamado pelo automod a cada mensagem (sem esperar). Devolve o que fez — os
// testes esperam por isso; o automod não.
export async function verificar({ ctx, server, canal, message, userId, aplicarPunicao }) {
  const am = ctx?.config?.automod ?? {};
  const cfg = am.antiAssuntos;
  if (!temasAtivos(cfg).length) return null;
  if ((cfg.canaisLiberados ?? []).includes(message.channelId)) return null;
  const texto = String(message.content ?? "");
  const achados = acharAssuntos(texto, cfg);
  if (!achados.length) return null;
  // o tema de ação mais forte decide (uma mensagem pode tocar dois)
  const { tema, termo } = achados.sort((a, b) => PESO[acaoDoTema(cfg, b.tema)] - PESO[acaoDoTema(cfg, a.tema)])[0];
  const acao = acaoDoTema(cfg, tema);
  const lang = ctx.config?.language === "en" ? "en" : "pt";
  const nome = message.author?.username ?? message.member?.nickname ?? userId;
  const v = await julgar({ tema, canalId: message.channelId, messageId: message.id, nome, texto, lang });
  const T = TEMAS[tema];
  console.log(`[ASSUNTOS] ${tema} ("${termo}") em ${message.channelId} por ${userId} → ${v ? (v.discussao ? "DISCUSSÃO" : "brincadeira/menção") : "sem veredito"}${v?.cache ? " (veredito recente)" : ""}${v?.motivo ? ` — ${v.motivo}` : ""}`);
  if (!v?.discussao) return { tema, acao: "nada", veredito: v };

  const rotulo = lang === "en" ? T.en : T.pt;
  const motivo = lang === "en" ? `${rotulo} isn't a topic for this server (server rule)` : `${rotulo} não é assunto deste servidor (regra do servidor)`;

  if (acao === "alertar") {
    await alertarStaff(ctx, { userId, canalId: message.channelId, messageId: message.id, tema, texto, motivoIA: v.motivo, lang });
    return { tema, acao, veredito: v };
  }
  if (acao === "apagar") {
    try { await message.delete(); } catch (e) { console.warn(`[ASSUNTOS] não consegui apagar: ${e?.message ?? e}`); }
    const chave = `${message.channelId}:${tema}`, agora = Date.now();
    if (!(agora - (avisados.get(chave) ?? 0) < AVISO_MS)) {
      avisados.set(chave, agora);
      await ctx.sendEmbed?.(canal ?? message.channel, {
        title: `${T.emoji} ${lang === "en" ? "Off-topic for this server" : "Assunto fora das regras"}`,
        description: lang === "en"
          ? `<@${userId}> — ${motivo}. The message was removed; nobody was punished.\n_Joking is fine — this is for real discussions._`
          : `<@${userId}> — ${motivo}. A mensagem foi removida; ninguém foi punido.\n_Brincadeira pode — isto é para discussão de verdade._`,
        colour: ctx.COR?.mod,
      }).catch(() => {});
    }
    await log.registrar(ctx, "punicoes", {
      titulo: `🧹 ${lang === "en" ? "Message removed — topic" : "Mensagem removida — assunto"}: ${rotulo}`,
      descricao: `<@${userId}> em <#${message.channelId}>\n**${lang === "en" ? "Why the model saw a discussion" : "Por que o modelo viu discussão"}:** ${v.motivo || "—"}\n> ${texto.replace(/\n+/g, " ").slice(0, 300)}`,
    });
    return { tema, acao, veredito: v };
  }
  // punir: apaga e aplica a punição do módulo (padrão: a escada do `acumular`)
  const pol = cfg.punicao?.modo ? cfg.punicao : { modo: "acumular" };
  await aplicarPunicao?.({ server, channel: canal ?? message.channel, message, userId, pol, motivo });
  return { tema, acao, veredito: v };
}

async function alertarStaff(ctx, { userId, canalId, messageId, tema, texto, motivoIA, lang }) {
  const T = TEMAS[tema];
  const en = lang === "en";
  const destinoId = ctx.config?.automod?.antiScam?.alertChannelId || ctx.config?.log?.canalId || null;
  const destino = destinoId ? await Promise.resolve(ctx.client?.channels?.get?.(destinoId) ?? ctx.client?.channels?.fetch?.(destinoId)).catch(() => null) : null;
  if (!destino) { console.warn(`[ASSUNTOS] alerta NÃO entregue: servidor ${ctx.serverId} sem canal de alerta do sentinela nem de log`); return; }
  const staff = (ctx.config?.acesso?.cargosStaff ?? []).map((id) => `<%${id}>`).join(" ");
  await ctx.sendEmbed(destino, {
    title: `${T.emoji} ${en ? "Forbidden topic" : "Assunto proibido"}: ${en ? T.en : T.pt}`,
    description: [
      staff || null,
      `<@${userId}> · <#${canalId}>${messageId ? ` · \`${messageId}\`` : ""}`,
      `**${en ? "Why the model saw a discussion" : "Por que o modelo viu discussão"}:** ${motivoIA || "—"}`,
      `> ${String(texto).replace(/\n+/g, " ").slice(0, 400)}`,
      "",
      en ? "_Alert only: the message stayed. Change it with `&automod sentinela assuntos`._"
         : "_Só alerta: a mensagem ficou. Mude com `&automod sentinela assuntos`._",
    ].filter((x) => x !== null).join("\n"),
    colour: ctx.COR?.aviso,
  });
}

// Só para testes
export function _zerar() { fios.clear(); vereditos.clear(); avisados.clear(); }
