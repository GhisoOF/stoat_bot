// assuntos.js — temas proibidos pela regra do servidor (13 out 2026).
//
// Pedido de Ghieh: há servidores com regra de "aqui não se discute política,
// religião…", mas o pessoal ZOA com esses temas e isso é OK. Cada tema é um
// módulo que o servidor liga com a ação que quiser.
//
// Como decide (2ª versão, mesmo dia — "algoritmo de peso, como os outros"):
//   1. NOTA de 0 a 10 por tema, como o sentinela: termos com peso por camada
//      (forte · nomes · ideias · genérico), marcadores de debate e de ataque,
//      tamanho — e o que AMENIZA: "kkkk", emoji de risada, "zoeira", mensagem
//      curta, pergunta neutra. O CONTEXTO também pesa: o tema voltando no fio do
//      canal, com mais gente, sobe; o canal rindo, desce.
//   2. Passou do limiar da sensibilidade → o modelo lê o fio e confirma se é
//      discussão de verdade (na dúvida, brincadeira). Com `ia off`, a nota
//      decide sozinha.
//   3. A ação do tema: `alertar` (chama a staff, a mensagem fica), `apagar` (só
//      tira a mensagem) ou `punir` (apaga e conta na escada).
//
// Roda em segundo plano: a mensagem não espera. Erro do modelo nunca vira
// punição. Staff, como no resto do automod, não é moderada.

import * as log from "../core/log.js";
import { normalizarParaAnalise } from "./scorecard.js";

export const ACOES = ["off", "alertar", "apagar", "punir"];
const ACAO_EN = { alert: "alertar", delete: "apagar", punish: "punir", desligar: "off", desligado: "off", nada: "off", remover: "apagar", excluir: "apagar" };
export const acaoValida = (x) => {
  const a = String(x ?? "").toLowerCase();
  const v = ACAO_EN[a] ?? a;
  return ACOES.includes(v) ? v : null;
};

// Nota a partir da qual o tema age (como o LIMIAR_BASE do sentinela).
export const LIMIAR_ASSUNTO = { baixa: 6, media: 4.5, alta: 3.5 };
const SENS_EN = { low: "baixa", medium: "media", média: "media", high: "alta" };
export const sensibilidadeValida = (x) => {
  const s = String(x ?? "").toLowerCase();
  const v = SENS_EN[s] ?? s;
  return LIMIAR_ASSUNTO[v] ? v : null;
};
export const limiarDoAssunto = (cfg) => LIMIAR_ASSUNTO[sensibilidadeValida(cfg?.sensibilidade) ?? "media"];

// ── Os léxicos ──────────────────────────────────────────────────────────────
// Tudo SEM acento e minúsculo: o texto é normalizado igual (disfarces como
// "b0ls0naro" e letras separadas são desfeitos antes, como no sentinela).
// Camadas: forte (o termo já é partidário/explícito) · nomes (pessoas,
// partidos) · ideias (ideologias, instituições do tema) · generico (o tema
// aparece, mas é comum em conversa normal). `expressoes` saem do texto ANTES
// de pontuar ("meu deus" não é religião). `marcadores` são os sinais de que a
// conversa é debate/oferta/assédio — só contam se o tema apareceu.
const W = { forte: 3, nomes: 2.5, ideias: 2, generico: 1 };

export const TEMAS = {
  politica: {
    emoji: "🏛️", pt: "política", en: "politics",
    forte: [
      "bolsonarist\\w*", "bolsominion\\w*", "lulist\\w*", "petist\\w*", "petralh\\w*", "esquerdopat\\w*", "esquerdalh\\w*",
      "direitopat\\w*", "comunist\\w*", "fascist\\w*", "golpist\\w*", "extrema[- ]?(direita|esquerda)", "ultradireita",
      "isentao", "isentoes", "pt nunca mais", "lula ladrao", "genocida", "libtard\\w*", "trumpist\\w*", "far[- ]right",
      "far[- ]left", "commies?",
    ],
    nomes: [
      "lula", "bolsonaro\\w*", "dilma", "michel temer", "haddad", "ciro gomes", "tarcisio", "alexandre de moraes", "moraes",
      "xandao", "marcal", "boulos", "nikolas ferreira", "damares", "janja", "alckmin", "sergio moro", "dallagnol", "zema",
      "caiado", "gleisi", "arthur lira", "trump", "biden", "kamala", "obama", "milei", "putin", "zelensk\\w*", "netanyahu",
      "nicolas maduro", "chavez", "fidel", "che guevara", "stalin", "mao tse\\w*", "karl marx", "marx", "pedro sanchez",
      "feijoo", "ayuso", "abascal", "vox", "psol", "psdb", "mdb", "pcdob", "mbl", "partido dos trabalhadores",
      "partido liberal", "(o|do|no|pelo|ao|contra o) pt", "(o|do|no|pelo|ao|contra o) pl",
    ],
    ideias: [
      "comunismo", "socialis\\w*", "capitalis\\w*", "fascismo", "liberalismo", "neoliberal\\w*", "conservador\\w*",
      "progressist\\w*", "anarquis\\w*", "marxis\\w*", "nazismo", "bolsonarismo", "lulismo", "petismo", "lacra\\w*",
      "woke", "centrao", "direita", "esquerda", "liberais", "communism", "socialism", "capitalism", "leftists?",
      "right[- ]wing", "left[- ]wing", "the (left|right)", "lefties", "right[- ]wingers?", "liberals?", "conservatives?", "democrats?", "republicans?",
    ],
    generico: [
      "politic\\w*", "governo", "presidente", "eleicao", "eleicoes", "eleitor\\w*", "vota\\w*", "voto", "votou", "urnas?",
      "stf", "congresso", "senado", "senador\\w*", "deputad\\w*", "ministro\\w*", "prefeit\\w*", "governador\\w*",
      "impeachment", "cpi", "manifestac\\w*", "protesto\\w*", "imposto\\w*", "ditadura", "democracia", "constituicao",
      "election\\w*", "government", "president", "senate", "congress", "parliament", "parlamento",
    ],
    expressoes: [],
    marcadores: [
      "vai votar", "quem vota", "votar n[oa]", "eleitor d[eo]", "(pior|melhor) presidente", "fora (lula|bolsonaro|pt)",
      "gado", "minions?", "mamata", "corrupt\\w*", "rouba\\w*", "ladra[ao]\\w*", "lavagem cerebral", "fake news",
      "destrui\\w*", "(o|nosso|esse) pais",
      // inglês (13 out 2026)
      "vote for", "who votes?", "voting for", "rigged", "stolen", "brainwash\\w*", "sheep", "ruin(ed|ing)? (the|this|our) country",
    ],
    discussao_pt: "debate ou briga de opinião sobre política, políticos, partidos, eleições ou governo; defender ou atacar um lado; campanha ou propaganda política; tentar convencer alguém a votar",
    discussao_en: "a debate or argument about politics, politicians, parties, elections or government; defending or attacking a side; campaigning or political propaganda; trying to convince someone how to vote",
  },
  religiao: {
    emoji: "⛪", pt: "religião", en: "religion",
    forte: [
      "ateis\\w*", "deus nao existe", "existe deus", "deus existe", "acredit\\w* em deus", "herege\\w*", "heresia",
      "blasfem\\w*", "convert\\w* (ao|a|para o) (cristianismo|islam\\w*|catolicismo|evangelho)", "evangeliz\\w*", "pregac\\w*", "pregar", "pregando", "aceita jesus", "aceite jesus",
      "vai (pro|para o) inferno", "queimar no inferno", "a biblia diz", "palavra de deus", "atheis\\w*",
      "god (doesn'?t |does not )?exists?", "god is (fake|dead)", "blasphem\\w*", "accept jesus",
    ],
    nomes: [
      "jesus", "cristo", "maome", "muhammad", "buda", "papa francisco", "papa leao", "malafaia", "edir macedo",
      "valdemiro", "universal do reino", "allah", "christ", "buddha", "pope",
    ],
    ideias: [
      "religi\\w*", "igrejas?", "evangelic\\w*", "crentes?", "catolic\\w*", "protestant\\w*", "biblias?", "biblic\\w*",
      "umbanda", "candomble", "espirit(a|as|ismo)", "macumb\\w*", "islam\\w*", "isla", "muculman\\w*", "alcorao",
      "judaismo", "budis\\w*", "hindu\\w*", "satanis\\w*", "cristianismo", "cristaos?", "cristas?", "ateus?", "ateia",
      "agnostic\\w*", "church\\w*", "christian\\w*", "catholic\\w*", "muslims?", "bible", "quran", "judaism",
      "buddhis\\w*", "atheists?",
    ],
    generico: [
      "deus", "deuses", "pastor(es)?", "padres?", "missa", "culto", "oracao", "rezar", "pecado\\w*", "salvacao", "fe",
      "god", "pray\\w*", "sins?",
    ],
    expressoes: [
      "meu deus", "gracas a deus", "deus me livre", "deus o livre", "vai com deus", "fica com deus", "se deus quiser",
      "pelo amor de deus", "deus me perdoe", "ai jesus", "jesus amado", "nossa senhora", "oh my god", "omg",
      "thank god", "god damn", "goddamn", "for god'?s sake",
    ],
    marcadores: [
      "sua religiao", "minha religiao", "farsa", "mentira", "lavagem cerebral", "fanatic\\w*", "esta escrito",
      "religiao e", "crente e", "ateu e", "voce (vai|precisa|deveria)", "seita",
      "your religion", "my religion", "fake", "brainwash\\w*", "cult", "you('ll| will) burn", "repent",
    ],
    discussao_pt: "debate ou briga sobre religião ou crença; atacar ou defender uma religião; pregação ou tentar converter alguém",
    discussao_en: "a debate or argument about religion or belief; attacking or defending a religion; preaching or trying to convert someone",
  },
  drogas: {
    emoji: "💊", pt: "drogas", en: "drugs",
    forte: [
      "maconha", "cocaina", "crack", "heroina", "metanfetamina", "lsd", "ecstasy", "ecstasi", "mdma", "ketamina", "cetamina",
      "lanca[- ]perfume", "lolo", "haxixe", "skunk", "cogumelos? magicos?", "psilocibina", "traficante\\w*", "trafico",
      "boca de fumo", "biqueira", "fumar um", "dichava\\w*", "bolar um", "baseado", "beck", "fentanil", "weed", "cocaine",
      "heroin", "meth", "molly", "shrooms", "fentanyl",
    ],
    nomes: ["cannabis", "marijuana", "ganja", "thc"],
    ideias: ["erva", "legaliza\\w*", "descriminaliz\\w*", "entorpecente\\w*"],
    generico: ["drogas?", "chapad\\w*", "brisad\\w*", "noia", "viciad\\w*", "cheirar", "doidao", "stoned", "drugs?"],
    expressoes: ["que droga", "droga de", "porra de droga", "drogaria", "chapad\\w* de sono"],
    marcadores: [
      "vend[eo]\\w*", "compr[oa]\\w*", "quem tem", "onde (compro|consigo|acho|arrumo)", "chama no (pv|privado|dm|zap|whats)",
      "entrego", "delivery", "\\d+ ?(g|gramas?)", "doses?", "como (usar|fazer|plantar|cultivar)", "plantar", "cultivar",
      "preco", "quanto (custa|e)", "pix", "experimenta\\w*", "vale a pena",
      "selling", "sell", "buy(ing)?", "dm me", "hmu", "plug", "grams?", "how (to|do i) (get|grow|make|use)", "price", "cashapp", "venmo",
    ],
    pesoForte: 3.5,
    discussao_pt: "oferecer, vender ou pedir drogas ilícitas; ensinar a conseguir, preparar ou usar; incentivar o uso",
    discussao_en: "offering, selling or asking for illegal drugs; teaching how to get, prepare or use them; encouraging their use",
  },
  sexual: {
    emoji: "🔞", pt: "conteúdo sexual", en: "sexual content",
    forte: [
      "putaria", "punhet\\w*", "boquete\\w*", "siririca", "xvideos", "pornhub", "onlyfans", "buceta\\w*", "xoxota",
      "transar com", "manda nudes?", "nudes", "porn\\w*", "sexo (oral|anal)", "vend\\w* (meu |minha )?(pack|nudes?|fotos? intimas?|conteudo)",
      "pack do pezinho", "te comer", "me come", "blowjob", "handjob", "send nudes", "horny",
    ],
    nomes: [],
    ideias: ["sexo", "sexual", "transa\\w*", "transei", "masturb\\w*", "tesao", "gozar", "gozei", "gozou", "penis", "vagina", "sex", "masturbat\\w*"],
    generico: ["pack", "nude", "\\+18", "nsfw", "conteudo adulto", "safad\\w*", "peitos", "bunda"],
    expressoes: [],
    marcadores: [
      "vend[eo]\\w*", "manda", "me manda", "quer ver", "chama no (pv|privado|dm)", "quanto (custa|e)", "pix",
      "gostosa", "delicia", "com voce", "em voce",
      "selling", "send( me)?", "dm me", "wanna see", "sexy", "hot",
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

// Sinais de debate e ataque, de qualquer tema
const DEBATE = [
  "voces? (nao )?sabe\\w*", "argumento\\w*", "fatos?", "concordo", "discordo", "na verdade", "a verdade e", "o problema e",
  "defend\\w*", "culpa d[eoa]", "por causa d[eoa]", "comprovad\\w*", "pesquisa", "estudos?", "absurdo", "vergonha",
  "nao tem como", "e obvio", "acorda", "abre o olho", "you('re| are) wrong", "the fact is",
  "you (don'?t|do not) (know|understand)", "wake up", "facts?", "obviously", "educate yourself", "do your research",
  "the problem is", "because of (them|him|her)", "shame",
];
const AGRESSAO = [
  "burr[oa]s?", "idiotas?", "imbecis?", "imbecil", "otari[oa]s?", "ignorantes?", "lixos?", "ridicul\\w*", "babaca\\w*",
  "alienad\\w*", "escrot\\w*", "vagabund\\w*", "cala a boca", "stupid", "idiots?", "morons?",
  "dumb(ass)?", "clowns?", "brain ?dead", "shut up", "retards?", "pathetic",
];
// O que ameniza
const RE_RISADA = /(?<![\p{L}\p{N}])(k{3,}|(?:ha){2,}h?|(?:he){2,}h?|(?:rs){2,}|lol|lmao|kek|ksks\w*|huehue\w*|kakak\w*|aushau\w*|ahsuah\w*|kkj\w*|kk)(?![\p{L}\p{N}])/iu;
const RE_EMOJI_RISO = /[😂🤣💀😹😆😅🤭🙃]/u;
const RE_EMOJI = /\p{Extended_Pictographic}/u;
const RE_ZOEIRA = /(?<![\p{L}\p{N}])(zoeira|zuera|zoando|zuando|zoa(ndo)?|brincadeira|brincando|piada|meme|ironia|ironico|\/s|to de boa|joking|just kidding|jk)(?![\p{L}\p{N}])/iu;
const RE_PERGUNTA_NEUTRA = /(?<![\p{L}\p{N}])(o que (e|significa|quer dizer)|quem (e|foi)|what (is|does)|who is)(?![\p{L}\p{N}])/iu;
// "vira à direita", "mão esquerda", "canto esquerdo da tela" não são política
const RE_LADO = /(?<![\p{L}\p{N}])(na|pra|para a|lado|mao|olho|pe|perna|braco|canto|tela|seta|vira|vire|virar|dobra|curva|coluna|parte|faixa|pista|ponta)\s+(?:a\s+)?(direita|esquerda)(?![\p{L}\p{N}])/giu;

export function semAcento(s) {
  return String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const borda = (corpo, flags = "iu") => new RegExp(`(?<![\\p{L}\\p{N}])(?:${corpo})(?![\\p{L}\\p{N}])`, flags);
const lista = (arr) => arr.map((x) => borda(x));
const COMPILADO = Object.fromEntries(Object.entries(TEMAS).map(([k, t]) => [k, {
  forte: lista(t.forte), nomes: lista(t.nomes), ideias: lista(t.ideias), generico: lista(t.generico),
  marcadores: lista(t.marcadores), expressoes: t.expressoes.length ? borda(t.expressoes.join("|"), "giu") : null,
}]));
const RE_DEBATE = lista(DEBATE), RE_AGRESSAO = lista(AGRESSAO);
const achados = (txt, res, cap) => { const r = []; for (const re of res) { const m = txt.match(re); if (m) r.push(m[0]); if (r.length >= cap) break; } return r; };

// O texto como o algoritmo lê: disfarces desfeitos, sem acento, minúsculo.
export function textoDeAnalise(texto) {
  // "à direita" (com crase) é direção; "a direita" é o lado político — decidido
  // ANTES de tirar o acento, que apaga a diferença
  const t = normalizarParaAnalise(texto).replace(/(?<![\p{L}\p{N}])à\s+(direita|esquerda)(?![\p{L}\p{N}])/giu, " ");
  return semAcento(t).replace(/\s+/g, " ").trim();
}

// Só os termos do tema (sem marcadores nem contexto) — usado no fio também.
function pesoDosTermos(t, tema, extras = []) {
  const C = COMPILADO[tema], T = TEMAS[tema];
  let limpo = C.expressoes ? t.replace(C.expressoes, " ") : t;
  if (tema === "politica") limpo = limpo.replace(RE_LADO, " ");
  const sinais = [];
  let soma = 0;
  const camadas = [["forte", T.pesoForte ?? W.forte], ["nomes", W.nomes], ["ideias", W.ideias], ["generico", W.generico]];
  for (const [camada, peso] of camadas) {
    const m = achados(limpo, C[camada], 2);   // no máximo 2 por camada
    if (m.length) { soma += peso * m.length; sinais.push(`${camada}:${m.join("/")}`); }
  }
  const ext = extras.map((x) => escapar(semAcento(x).trim()).replace(/\s+/g, "\\s+")).filter(Boolean);
  if (ext.length) {
    const m = limpo.match(borda(ext.join("|")));
    if (m) { soma += W.nomes; sinais.push(`do servidor:${m[0]}`); }
  }
  return { soma: Math.min(soma, 7), sinais, limpo };
}

// Nota de 0 a 10 de UMA mensagem para UM tema. `fio`: [{ autor, texto, t }]
// das mensagens anteriores do canal (o contexto).
export function pontuarAssunto(texto, tema, { extras = [], fio = [], autor = null, agora = Date.now() } = {}) {
  const t = textoDeAnalise(texto);
  const { soma: termos, sinais, limpo } = pesoDosTermos(t, tema, extras);
  if (termos <= 0) return { nota: 0, sinais: [] };
  const C = COMPILADO[tema];
  let nota = termos;

  const marc = achados(limpo, [...C.marcadores, ...RE_DEBATE], 3);
  if (marc.length) { nota += marc.length; sinais.push(`debate:${marc.join("/")}`); }
  const agr = achados(limpo, RE_AGRESSAO, 2);
  if (agr.length) { nota += 1.5 * agr.length; sinais.push(`ataque:${agr.join("/")}`); }
  const cru = String(texto ?? "");
  if (cru.length >= 250) { nota += 1; sinais.push("longa"); } else if (cru.length >= 120) { nota += 0.5; sinais.push("média"); }
  const letras = cru.replace(/[^\p{L}]/gu, "");
  if (/!{2,}/.test(cru) || (letras.length >= 15 && letras.replace(/\P{Lu}/gu, "").length / letras.length > 0.6)) { nota += 0.5; sinais.push("ênfase"); }

  // o que ameniza (até −4)
  let menos = 0;
  if (RE_RISADA.test(t)) { menos += 2; sinais.push("−risada"); }
  if (RE_EMOJI_RISO.test(cru)) { menos += 1.5; sinais.push("−emoji de riso"); }
  else if (RE_EMOJI.test(cru)) { menos += 0.5; sinais.push("−emoji"); }
  if (RE_ZOEIRA.test(t)) { menos += 2.5; sinais.push("−zoeira"); }
  if (cru.includes("?") && RE_PERGUNTA_NEUTRA.test(t) && !agr.length) { menos += 1; sinais.push("−pergunta"); }
  if (cru.trim().length < 25 && !marc.length) { menos += 1; sinais.push("−curta"); }
  nota -= Math.min(menos, 4);

  // o contexto: o tema voltando no canal (com outras pessoas) sobe; o canal rindo, desce
  const recentes = fio.filter((m) => agora - (m.t ?? agora) < 5 * 60_000).slice(-8);
  if (recentes.length) {
    const noTema = recentes.filter((m) => pesoDosTermos(textoDeAnalise(m.texto), tema, extras).soma > 0);
    const outros = new Set(noTema.map((m) => m.autor).filter((a) => a && a !== autor));
    const k = noTema.length;
    const mais = (k >= 5 ? 2 : k >= 3 ? 1.5 : k >= 1 ? 0.5 : 0) + (outros.size >= 1 && k >= 2 ? 1 : 0);
    if (mais) { nota += mais; sinais.push(`contexto:+${mais} (${k} msg no tema, ${outros.size} outra(s) pessoa(s))`); }
    const rindo = recentes.slice(-6).filter((m) => RE_RISADA.test(textoDeAnalise(m.texto)) || RE_EMOJI_RISO.test(m.texto)).length;
    if (rindo >= 3 && rindo / Math.min(6, recentes.length) >= 0.5) { nota -= 1.5; sinais.push("−canal rindo"); }
  }
  return { nota: Math.max(0, Math.min(10, Math.round(nota * 10) / 10)), sinais };
}

// Config deste servidor: { enabled, acoes, termos, canaisLiberados, punicao, sensibilidade, ia }
export function acaoDoTema(cfg, tema) {
  return acaoValida(cfg?.acoes?.[tema]) ?? "off";
}
export function temasAtivos(cfg) {
  if (!cfg?.enabled) return [];
  return NOMES_TEMAS.filter((t) => acaoDoTema(cfg, t) !== "off");
}

// A nota de cada tema ATIVO. `todos: true` pontua os 4 (para o `test`).
export function analisarAssuntos(texto, cfg, { canalId = null, excluirId = null, autor = null, todos = false } = {}) {
  const fio = canalId ? (fios.get(canalId) ?? []).filter((m) => !excluirId || m.id !== excluirId) : [];
  const limiar = limiarDoAssunto(cfg);
  return (todos ? NOMES_TEMAS : temasAtivos(cfg)).map((tema) => {
    const r = pontuarAssunto(texto, tema, { extras: cfg?.termos?.[tema] ?? [], fio, autor });
    return { tema, ...r, limiar, passou: r.nota >= limiar };
  });
}

// ── O fio recente de cada canal (o contexto da nota e o que o modelo lê) ────
// Próprio, e não o cache da conversa da IA: aquele só existe nos servidores
// com a IA ligada, e este módulo vale em qualquer servidor.
const FIO_MAX = 12, FIO_MS = 15 * 60_000;
const fios = new Map();   // canalId → [{ id, autor, nome, texto, t }]
export function anotar(canalId, { id = null, autor = null, nome = "alguém", texto = "" } = {}, agora = Date.now()) {
  if (!canalId || !String(texto).trim()) return;
  const arr = (fios.get(canalId) ?? []).filter((m) => agora - m.t < FIO_MS);
  if (id && arr.some((m) => m.id === id)) return;
  arr.push({ id, autor, nome: String(nome).slice(0, 40), texto: String(texto).slice(0, 300), t: agora });
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

async function julgar({ tema, canalId, messageId, nome, texto, lang, serverId = null }, agora = Date.now()) {
  const chave = `${canalId}:${tema}`;
  const v = vereditos.get(chave);
  if (v && agora - v.t < JULGAR_MS) return { ...v, cache: true };
  if (!avaliarLLM) {
    if (agora - ultimoAvisoSemIA > 3600_000) { ultimoAvisoSemIA = agora; console.warn("[ASSUNTOS] nota passou do limiar, mas a IA não está ligada — sem o modelo para confirmar, nada é feito (`&automod sentinela assuntos ia off` deixa a nota decidir sozinha)"); }
    return null;
  }
  const fio = fioDoCanal(canalId, { excluirId: messageId });
  const corpo = lang === "en"
    ? `RECENT CONVERSATION:\n${fio || "(nothing before)"}\n\nMESSAGE BEING JUDGED (${nome}): ${texto.slice(0, 500)}`
    : `CONVERSA RECENTE:\n${fio || "(nada antes)"}\n\nMENSAGEM AVALIADA (${nome}): ${texto.slice(0, 500)}`;
  let r = null;
  try {
    r = lerVeredito(await avaliarLLM([{ role: "system", content: promptDoTema(tema, lang) }, { role: "user", content: corpo }], { etiqueta: `assunto:${tema}`, serverId }));
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

const PESO_ACAO = { alertar: 1, apagar: 2, punir: 3 };

// Chamado pelo automod a cada mensagem (sem esperar). Devolve o que fez — os
// testes esperam por isso; o automod não.
export async function verificar({ ctx, server, canal, message, userId, aplicarPunicao }) {
  const am = ctx?.config?.automod ?? {};
  const cfg = am.antiAssuntos;
  if (!temasAtivos(cfg).length) return null;
  if ((cfg.canaisLiberados ?? []).includes(message.channelId)) return null;
  const texto = String(message.content ?? "");
  const notas = analisarAssuntos(texto, cfg, { canalId: message.channelId, excluirId: message.id, autor: userId });
  const passaram = notas.filter((n) => n.passou);
  if (!passaram.length) return null;
  // o tema de ação mais forte decide (uma mensagem pode tocar dois); empate: a maior nota
  const { tema, nota, sinais, limiar } = passaram.sort((a, b) =>
    (PESO_ACAO[acaoDoTema(cfg, b.tema)] - PESO_ACAO[acaoDoTema(cfg, a.tema)]) || (b.nota - a.nota))[0];
  const acao = acaoDoTema(cfg, tema);
  const lang = ctx.config?.language === "en" ? "en" : "pt";
  const nome = message.author?.username ?? message.member?.nickname ?? userId;
  // `ia off`: a nota decide sozinha
  const v = cfg.ia === false
    ? { discussao: true, motivo: lang === "en" ? `score ${nota} ≥ ${limiar}` : `nota ${nota} ≥ ${limiar}`, semIA: true }
    : await julgar({ tema, canalId: message.channelId, messageId: message.id, nome, texto, lang, serverId: ctx?.serverId ?? null });
  const T = TEMAS[tema];
  console.log(`[ASSUNTOS] ${tema} nota ${nota}/${limiar} [${sinais.join(", ")}] em ${message.channelId} por ${userId} → ${v ? (v.discussao ? "DISCUSSÃO" : "brincadeira/menção") : "sem veredito"}${v?.cache ? " (veredito recente)" : ""}${v?.semIA ? " (sem IA: só a nota)" : ""}${v?.motivo ? ` — ${v.motivo}` : ""}`);
  if (!v?.discussao) return { tema, nota, acao: "nada", veredito: v };

  const rotulo = lang === "en" ? T.en : T.pt;
  const motivo = lang === "en" ? `${rotulo} isn't a topic for this server (server rule)` : `${rotulo} não é assunto deste servidor (regra do servidor)`;

  if (acao === "alertar") {
    await alertarStaff(ctx, { userId, canalId: message.channelId, messageId: message.id, tema, texto, motivoIA: v.motivo, nota, sinais, lang });
    return { tema, nota, acao, veredito: v };
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
      descricao: `<@${userId}> ${lang === "en" ? "in" : "em"} <#${message.channelId}> · **${lang === "en" ? "Score" : "Nota"}:** ${nota}/10\n**${lang === "en" ? "Why" : "Por quê"}:** ${v.motivo || "—"}\n> ${texto.replace(/\n+/g, " ").slice(0, 300)}`,
    });
    return { tema, nota, acao, veredito: v };
  }
  // punir: apaga e aplica a punição do módulo (padrão: a escada do `acumular`)
  const pol = cfg.punicao?.modo ? cfg.punicao : { modo: "acumular" };
  await aplicarPunicao?.({ server, channel: canal ?? message.channel, message, userId, pol, motivo, nota });
  return { tema, nota, acao, veredito: v };
}

async function alertarStaff(ctx, { userId, canalId, messageId, tema, texto, motivoIA, nota, sinais, lang }) {
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
      `**${en ? "Score" : "Nota"}:** ${nota}/10 · **${en ? "Signals" : "Sinais"}:** ${(sinais ?? []).join(", ") || "—"}`,
      `**${en ? "Why" : "Por quê"}:** ${motivoIA || "—"}`,
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
