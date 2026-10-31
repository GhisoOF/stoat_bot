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
//
// (31 out 2026, P3a) QUATRO categorias, decididas pelo dono (ele relatou que a
// zoeira era lida como séria — zoar o Estado, "eu sou bolsotron"):
//   • fora do tema → nada · • zoeira → NUNCA pune
//   • discussão → só onde a staff ligou aquele tema (a ação dele)
//   • ataque (ofender alguém por causa do tema) → SEMPRE conta (punir), em
//     qualquer um dos 4 temas, desde que o módulo esteja ligado no servidor.
// A nota continua na frente (determinístico primeiro, R11): só passa ao modelo
// o que passou do portão (a sensibilidade); tema que a staff NÃO ligou só vai
// ao modelo com sinal de ataque. Cada decisão vai para a fila do dono
// (`revisao.js`, área fila): certeza ALTA age; MÉDIA e BAIXA vão para a fila
// sem punir. A faixa alta é do dono (limiar calibrado pelos casos julgados),
// nunca da staff; um caso parecido já julgado pelo dono (`herdado`) decide.

import * as log from "../core/log.js";
import { registrarErro } from "../core/erros.js";
import { citar, citarInterno } from "../core/aliases.js";
import { textoDoIdioma, idiomaDe, tr } from "../core/i18n.js";
import { normalizarParaAnalise } from "./scorecard.js";
import { canalDaStaff } from "./pertence.js";

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
    emoji: "🏛️", pt: "política", en: "politics", es: "política",
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
    emoji: "⛪", pt: "religião", en: "religion", es: "religión",
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
    emoji: "💊", pt: "drogas", en: "drugs", es: "drogas",
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
    emoji: "🔞", pt: "conteúdo sexual", en: "sexual content", es: "contenido sexual",
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
const fios = new Map();   // canalId → [{ id, autor, texto, t }]
// (o nome de quem escreveu não é guardado: o fio só precisa saber QUEM é quem — o id)
export function anotar(canalId, { id = null, autor = null, texto = "" } = {}, agora = Date.now()) {
  if (!canalId || !String(texto).trim()) return;
  const arr = (fios.get(canalId) ?? []).filter((m) => agora - m.t < FIO_MS);
  if (id && arr.some((m) => m.id === id)) return;
  arr.push({ id, autor, texto: String(texto).slice(0, 300), t: agora });
  fios.set(canalId, arr.slice(-FIO_MAX));
  if (fios.size > 2000) fios.delete(fios.keys().next().value);
}
// (31 out 2026, R9) o que vai ao MODELO não leva nome de ninguém: cada pessoa do
// fio vira um rótulo (A:, B:, …) — o modelo só precisa saber quem é quem na
// conversa. `autor` (opcional) é quem escreveu a mensagem avaliada: devolve o
// rótulo dela também (o mesmo, se ela já falou no fio).
export function fioDoCanal(canalId, { excluirId = null, limite = 8, autor = null } = {}) {
  const msgs = (fios.get(canalId) ?? []).filter((m) => !excluirId || m.id !== excluirId).slice(-limite);
  const rotulos = new Map();
  const rotular = (quem) => {
    const k = quem ?? "?";
    if (!rotulos.has(k)) { const i = rotulos.size; rotulos.set(k, i < 26 ? String.fromCharCode(65 + i) : `P${i + 1}`); }
    return rotulos.get(k);
  };
  const texto = msgs.map((m) => `${rotular(m.autor)}: ${m.texto}`).join("\n");
  return autor === null ? texto : { texto, rotulo: rotular(autor) };
}

// ── O juiz: o modelo pequeno, em JSON, sem raciocínio ───────────────────────
let avaliarLLM = null;
export function configurar({ avaliar }) { avaliarLLM = avaliar; }

// (31 out 2026, P3a) o modelo CLASSIFICA em quatro categorias (antes: só
// "discussão sim/não"). Os exemplos de zoeira são os casos que o dono relatou.
export const CATEGORIAS = ["fora", "zoeira", "discussao", "ataque"];
export function promptDoTema(tema, lang = "pt") {
  const T = TEMAS[tema];
  if (lang === "en") return [
    `You moderate a laid-back chat server. Its rules forbid discussing ${T.en}. But people joke a lot, and joking is ALLOWED.`,
    "Read the conversation and put the MESSAGE BEING JUDGED in ONE category:",
    `- "fora": it isn't about ${T.en} (or only uses a word of the topic in another sense).`,
    `- "zoeira": a joke, banter, meme, irony, comic exaggeration, playful swearing, mocking the government, the State, taxes or politicians in general, jokingly declaring a side ("I'm a bolsotron"), a passing mention, an everyday expression, a neutral curious question, a news item quoted without debate.`,
    `- "discussao": ${T.discussao_en}.`,
    `- "ataque": insulting, humiliating or threatening a person or a group because of ${T.en} (e.g. calling people who vote for someone stupid, cursing at the followers of a religion).`,
    "When in doubt, it is a joke (between a joke and a discussion, a joke). It is an attack only when someone is really being insulted.",
    'Reply ONLY with JSON: {"categoria": "fora"|"zoeira"|"discussao"|"ataque", "motivo": "one short sentence"}',
  ].join("\n");
  return [
    `Você modera um servidor de conversa descontraído. A regra do servidor proíbe discutir ${T.pt}. Mas o pessoal brinca muito, e brincadeira é PERMITIDA.`,
    "Leia a conversa e classifique a MENSAGEM AVALIADA em UMA categoria:",
    `- "fora": não fala de ${T.pt} (ou só usa uma palavra do tema em outro sentido).`,
    `- "zoeira": piada, meme, ironia, exagero cômico, xingamento de brincadeira, zoar o governo, o Estado, os impostos ou os políticos em geral, se declarar de um lado de brincadeira ("eu sou bolsotron"), menção de passagem, expressão do dia a dia, pergunta curiosa e neutra, notícia citada sem debate.`,
    `- "discussao": ${T.discussao_pt}.`,
    `- "ataque": ofender, humilhar ou ameaçar uma pessoa ou um grupo por causa de ${T.pt} (ex.: chamar de burro quem vota em alguém, xingar quem segue uma religião).`,
    "Na dúvida, é brincadeira (entre zoeira e discussão, zoeira). Ataque é só quando alguém é ofendido de verdade.",
    'Responda SÓ um JSON: {"categoria": "fora"|"zoeira"|"discussao"|"ataque", "motivo": "uma frase curta"}',
  ].join("\n");
}

// A categoria em pt/en/es (o modelo pequeno às vezes responde no idioma da conversa)
const CATEGORIA_SIN = {
  fora: "fora", "fora do tema": "fora", "off-topic": "fora", off_topic: "fora", offtopic: "fora", "off topic": "fora", none: "fora", nada: "fora",
  zoeira: "zoeira", piada: "zoeira", brincadeira: "zoeira", joke: "zoeira", banter: "zoeira", broma: "zoeira", humor: "zoeira",
  discussao: "discussao", discussion: "discussao", debate: "discussao", discusion: "discussao",
  ataque: "ataque", attack: "ataque", insulto: "ataque", insult: "ataque", ofensa: "ataque", agresion: "ataque",
};
// → { categoria, discussao (a categoria é séria: discussão ou ataque), motivo } | null
// Ainda aceita o formato antigo {"discussao": true|false} (true → discussão; false → zoeira).
export function lerVeredito(raw) {
  const txt = String(raw ?? "").replace(/```json|```/g, "");
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[0]); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  let categoria = null;
  const bruto = o.categoria ?? o.category ?? o.classe ?? null;
  if (bruto !== null && bruto !== undefined) categoria = CATEGORIA_SIN[semAcento(bruto).trim()] ?? null;
  if (!categoria) {
    const d = o.discussao ?? o.discussion ?? o.viola;
    if (typeof d !== "boolean" && !/^(true|false|sim|n[ãa]o)$/i.test(String(d))) return null;
    categoria = d === true || /^(true|sim)$/i.test(String(d)) ? "discussao" : "zoeira";
  }
  return { categoria, discussao: categoria === "discussao" || categoria === "ataque", motivo: String(o.motivo ?? o.reason ?? "").slice(0, 200) };
}

// ── A fila do dono (área fila: revisao.js) ──────────────────────────────────
// Carregada sob demanda, na primeira decisão (R11). Sem a fila (ainda não
// instalada, ou quebrada): o limiar é o padrão, nada é herdado e nenhum caso é
// registrado — a moderação segue igual. `usarFila(dublê)` é para os testes.
let fila = null, filaPronta = false;
export function usarFila(f) { fila = f ?? null; filaPronta = true; }
export async function filaDeRevisao() {
  if (filaPronta) return fila;
  filaPronta = true;
  try { fila = await import("./revisao.js"); }
  catch (e) { fila = null; registrarErro("ASSUNTOS:fila", e); }
  return fila;
}
// Cada chamada à fila é protegida: erro dela nunca muda nem trava a moderação.
export const registrarNaFila = (caso) => naFila("registrarCaso", null, caso);
async function naFila(nome, padrao, ...args) {
  const F = await filaDeRevisao();
  if (typeof F?.[nome] !== "function") return padrao;
  try { return (await F[nome](...args)) ?? padrao; }
  catch (e) { registrarErro(`ASSUNTOS:fila:${nome}`, e); return padrao; }
}

// A faixa "certeza alta" é GLOBAL e do dono (decisão de 31 out: nada depende da
// staff): o padrão é o limiar da sensibilidade média, e não o que a staff
// escolheu; a sensibilidade da staff só decide o que vai ao modelo (o portão).
export const LIMIAR_ALTA_PADRAO = LIMIAR_ASSUNTO.media / 10;   // nota de 0 a 1
// Sem o modelo (`ia off`) é um detector só: a certeza alta pede 2 pontos a mais
export const MARGEM_SEM_IA = 2;
// Os casos julgados se dividem pelo que o bot AFIRMOU: "assunto:<tema>" = era
// sério (discussão/ataque); "assunto:<tema>:zoeira" = não era. Assim o ✅/❌ do
// dono num caso parecido tem um sentido só.
export const categoriaDoCaso = (tema, seria) => `assunto:${tema}${seria ? "" : ":zoeira"}`;
// O que o dono já disse de um caso muito parecido → "seria" | "nao" | null.
// Na fila, "certo" = o que o bot alegou naquela categoria se confirmou: em
// "assunto:<tema>" é sério; em "assunto:<tema>:zoeira" é zoeira.
export async function heranca(tema, texto) {
  const q = (seria) => naFila("vereditoParecido", null, { tipo: "assunto", categoria: categoriaDoCaso(tema, seria), texto });
  const s = await q(true);
  if (s === "certo") return "seria";
  if (s === "errou") return "nao";
  const z = await q(false);
  if (z === "certo") return "nao";
  if (z === "errou") return "seria";
  return null;
}

// Sinais de que o próprio texto (ou o canal) está brincando
const SINAIS_ZOEIRA = /^−(risada|emoji de riso|zoeira|canal rindo)/;
export const temZoeira = (sinais) => (sinais ?? []).some((s) => SINAIS_ZOEIRA.test(s));
export const temAtaque = (sinais) => (sinais ?? []).some((s) => /^ataque:/.test(s));

// A certeza de uma decisão (pura — os testes a exercitam direto).
//   categoria: a do juiz · nota: 0–10 · limiarAlta: 0–1 (o da fila) ·
//   semIA: a nota decidiu sozinha · zoeira: o texto/canal está rindo ·
//   herdado: "seria" | "nao" | null
// → { certeza: "alta"|"media"|"baixa", origem: "detector"|"discordancia" }
export function certezaDe({ categoria, nota, limiarAlta = LIMIAR_ALTA_PADRAO, semIA = false, zoeira = false, herdado = null }) {
  const seria = categoria === "discussao" || categoria === "ataque";
  const corte = 10 * limiarAlta + (semIA ? MARGEM_SEM_IA : 0);
  if (herdado === "seria" && seria) return { certeza: "alta", origem: "detector" };
  if (herdado === "nao" && !seria) return { certeza: "alta", origem: "detector" };
  if (herdado) return { certeza: "baixa", origem: "discordancia" };   // o dono já disse o contrário de um parecido
  if (!seria) {
    // o juiz disse que não é sério; a nota alta diz que é: os detectores discordam
    return nota >= corte + MARGEM_SEM_IA && !zoeira ? { certeza: "baixa", origem: "discordancia" } : { certeza: "alta", origem: "detector" };
  }
  if (zoeira) return { certeza: "baixa", origem: "discordancia" };   // o juiz diz sério, o texto está rindo
  return { certeza: nota >= corte ? "alta" : "media", origem: "detector" };
}

// O trecho que vai para a fila do dono: sem menção a ninguém (R9), até 300 car.
export const trechoDoCaso = (texto) => String(texto ?? "").replace(/<[@%#]!?[0-9A-Za-z]{1,40}>/g, "@…").replace(/\s+/g, " ").trim().slice(0, 300);

// O veredito vale por MENSAGEM (31 out 2026, R9): antes valia por canal e tema
// por 20 s, e a mensagem de OUTRA pessoa era apagada/punida pelo veredito da
// anterior, sem o modelo ter lido o que ela escreveu. (Com teto: R11.)
const JULGAR_MS = 10 * 60_000;
const vereditos = new Map();   // `${mensagem}:${tema}` → { t, discussao, motivo }
let ultimoAvisoSemIA = 0;

async function julgar({ tema, canalId, messageId, autor = null, texto, lang, serverId = null }, agora = Date.now()) {
  const chave = messageId ? `${messageId}:${tema}` : null;
  const v = chave ? vereditos.get(chave) : null;
  if (v && agora - v.t < JULGAR_MS) return { ...v, cache: true };
  if (!avaliarLLM) {
    if (agora - ultimoAvisoSemIA > 3600_000) { ultimoAvisoSemIA = agora; console.warn("[ASSUNTOS] nota passou do limiar, mas a IA não está ligada — sem o modelo para confirmar, nada é feito (`" + citarInterno("automod.sentinela.assuntos.ia") + " off` deixa a nota decidir sozinha)"); }
    return null;
  }
  const { texto: fio, rotulo } = fioDoCanal(canalId, { excluirId: messageId, autor: autor ?? "?" });
  const corpo = lang === "en"
    ? `RECENT CONVERSATION:\n${fio || "(nothing before)"}\n\nMESSAGE BEING JUDGED (${rotulo}): ${texto.slice(0, 500)}`
    : `CONVERSA RECENTE:\n${fio || "(nada antes)"}\n\nMENSAGEM AVALIADA (${rotulo}): ${texto.slice(0, 500)}`;
  let r = null;
  try {
    r = lerVeredito(await avaliarLLM([{ role: "system", content: promptDoTema(tema, lang) }, { role: "user", content: corpo }], { etiqueta: `assunto:${tema}`, serverId }));
  } catch (e) {
    console.warn(`[ASSUNTOS] o modelo falhou (${e?.message ?? e}) — nada é feito`);
    return null;   // fail-safe: erro nunca vira punição
  }
  if (!r) return null;
  if (chave) {
    vereditos.set(chave, { t: agora, ...r });
    if (vereditos.size > 2000) vereditos.delete(vereditos.keys().next().value);
  }
  return r;
}

// Aviso no canal ao apagar: um por canal e tema a cada 2 min (numa discussão
// apagada mensagem a mensagem, o canal não vira um mural de avisos).
const AVISO_MS = 2 * 60_000;
const avisados = new Map();

const PESO_ACAO = { alertar: 1, apagar: 2, punir: 3 };
const ACAO_DO_CASO = { alertar: "alertado", apagar: "punido", punir: "punido" };
const ROTULO_CATEGORIA = {
  fora: ["fora do tema", "off-topic", "fuera de tema"], zoeira: ["zoeira", "joke", "broma"],
  discussao: ["discussão", "discussion", "discusión"], ataque: ["ataque", "attack", "ataque"],
};
export const rotuloCategoria = (c, i = 0) => (ROTULO_CATEGORIA[c] ?? ["—", "—", "—"])[i];

// Chamado pelo automod a cada mensagem (sem esperar). Devolve o que fez — os
// testes esperam por isso; o automod não.
//   → null (nada passou do portão) | { tema, nota, acao: "nada"|"alertar"|"apagar"|"punir",
//        veredito, categoria, certeza, origem, herdado, codigo }
export async function verificar({ ctx, server, canal, message, userId, aplicarPunicao }) {
  const am = ctx?.config?.automod ?? {};
  const cfg = am.antiAssuntos;
  if (!temasAtivos(cfg).length) return null;
  if ((cfg.canaisLiberados ?? []).includes(message.channelId)) return null;
  const texto = String(message.content ?? "");
  // os 4 temas: discussão só nos que a staff ligou; ataque em qualquer um
  const notas = analisarAssuntos(texto, cfg, { canalId: message.channelId, excluirId: message.id, autor: userId, todos: true })
    .map((n) => ({ ...n, ligado: acaoDoTema(cfg, n.tema) !== "off" }));
  // (sem o modelo, `ia off`, só os temas ligados: o ataque em tema desligado
  // precisa do juiz — a palavra "burro" sozinha não diz quem foi ofendido)
  const semIA = cfg.ia === false;
  const passaram = notas.filter((n) => n.passou && (n.ligado || (!semIA && temAtaque(n.sinais))));
  if (!passaram.length) return null;
  // o tema que a staff ligou vem antes; entre eles, o de ação mais forte (uma
  // mensagem pode tocar dois); empate: a maior nota
  const peso = (n) => (n.ligado ? PESO_ACAO[acaoDoTema(cfg, n.tema)] : 0);
  const { tema, nota, sinais, limiar, ligado } = passaram.sort((a, b) => (peso(b) - peso(a)) || (b.nota - a.nota))[0];
  const lang = textoDoIdioma(ctx.config?.language);
  const es = idiomaDe(ctx) === "es";
  // `ia off`: a nota decide sozinha (a ação do tema, como antes; o texto rindo é zoeira)
  const v = semIA
    ? { categoria: temZoeira(sinais) ? "zoeira" : "discussao",
        motivo: es ? `nota ${nota} ≥ ${limiar}` : lang === "en" ? `score ${nota} ≥ ${limiar}` : `nota ${nota} ≥ ${limiar}`, semIA: true }
    : await julgar({ tema, canalId: message.channelId, messageId: message.id, autor: userId, texto, lang, serverId: ctx?.serverId ?? null });
  const T = TEMAS[tema];
  if (!v) {   // erro ou modelo fora: nada (erro nunca vira punição) e nenhum caso
    console.log(`[ASSUNTOS] ${tema} nota ${nota}/${limiar} [${sinais.join(", ")}] em ${message.channelId} por ${userId} → sem veredito`);
    return { tema, nota, acao: "nada", veredito: null };
  }
  const categoria = v.categoria ?? (v.discussao ? "discussao" : "zoeira");
  const seria = categoria === "ataque" || (categoria === "discussao" && ligado);

  // a fila do dono: o limiar calibrado (no lugar do fixo) e o que ele já julgou
  const limiarAlta = Number(await naFila("limiar", LIMIAR_ALTA_PADRAO, categoriaDoCaso(tema, true), LIMIAR_ALTA_PADRAO));
  const herdado = await heranca(tema, texto);
  const { certeza, origem } = certezaDe({ categoria: seria ? categoria : (categoria === "discussao" ? "fora" : categoria),
    nota, limiarAlta: Number.isFinite(limiarAlta) ? limiarAlta : LIMIAR_ALTA_PADRAO, semIA, zoeira: temZoeira(sinais), herdado });
  // zoeira nunca pune; fora do tema não faz nada; discussão de tema desligado não
  // faz nada; o que o dono já disse que é engano não pune; média/baixa → só a fila
  const acao = seria && herdado !== "nao" && certeza === "alta" ? (categoria === "ataque" ? "punir" : acaoDoTema(cfg, tema)) : "nada";

  console.log(`[ASSUNTOS] ${tema} nota ${nota}/${limiar} [${sinais.join(", ")}] em ${message.channelId} por ${userId} → ${categoria.toUpperCase()}${ligado ? "" : " (tema desligado)"} · certeza ${certeza}${herdado ? ` · herdado: ${herdado}` : ""} → ${acao}${v.cache ? " (veredito recente)" : ""}${v.semIA ? " (sem IA: só a nota)" : ""}${v.motivo ? ` — ${v.motivo}` : ""}`);

  // discussão de um tema que a staff não ligou não é decisão nenhuma (não vai à fila)
  let codigo = null;
  if (seria || categoria === "zoeira" || categoria === "fora") {
    const caso = await naFila("registrarCaso", null, {
      tipo: "assunto", categoria: categoriaDoCaso(tema, seria), serverId: ctx?.serverId ?? null, userId,
      canalId: message.channelId, msgId: message.id ?? null, origem, certeza, nota: Math.round(nota * 10) / 100,
      // (31 out 2026, P3a, revisão) o texto inteiro vai só para a impressão (não é guardado):
      // a gravação e a consulta da herança (`heranca(tema, texto)`) usam o MESMO texto
      acao: ACAO_DO_CASO[acao] ?? "nenhuma", evidencia: { trecho: trechoDoCaso(texto), texto },
      detector: `assuntos:${categoria}${semIA ? ":sem-ia" : ""}`,
    });
    codigo = caso?.codigo ?? null;
  }
  const res = { tema, nota, acao, veredito: v, categoria, certeza, origem, herdado, codigo };
  if (acao === "nada") return res;

  const rotulo = es ? T.es : lang === "en" ? T.en : T.pt;
  const motivo = categoria === "ataque"
    ? (es ? `atacar a alguien por ${rotulo} (regla del servidor)` : lang === "en" ? `attacking someone over ${rotulo} (server rule)` : `atacar alguém por causa de ${rotulo} (regra do servidor)`)
    : (es ? `${rotulo} no es tema de este servidor (regla del servidor)` : lang === "en" ? `${rotulo} isn't a topic for this server (server rule)` : `${rotulo} não é assunto deste servidor (regra do servidor)`);

  if (acao === "alertar") {
    await alertarStaff(ctx, { userId, canalId: message.channelId, messageId: message.id, tema, texto, motivoIA: v.motivo, nota, sinais, lang, categoria });
    return res;
  }
  if (acao === "apagar") {
    try { await message.delete(); } catch (e) { console.warn(`[ASSUNTOS] não consegui apagar: ${e?.message ?? e}`); }
    const chave = `${message.channelId}:${tema}`, agora = Date.now();
    if (!(agora - (avisados.get(chave) ?? 0) < AVISO_MS)) {
      avisados.set(chave, agora);
      await ctx.sendEmbed?.(canal ?? message.channel, {
        ...tr(ctx, {
          title: `${T.emoji} Assunto fora das regras`,
          description: `<@${userId}> — ${motivo}. A mensagem foi removida; ninguém foi punido.\n_Brincadeira pode — isto é para discussão de verdade._`,
        }, {
          title: `${T.emoji} Off-topic for this server`,
          description: `<@${userId}> — ${motivo}. The message was removed; nobody was punished.\n_Joking is fine — this is for real discussions._`,
        }, {
          title: `${T.emoji} Tema fuera de las reglas`,
          description: `<@${userId}> — ${motivo}. El mensaje fue eliminado; nadie fue sancionado.\n_Bromear se puede — esto es para discusiones de verdad._`,
        }),
        colour: ctx.COR?.mod,
      }).catch(() => {});
    }
    await log.registrar(ctx, "punicoes", {
      titulo: `🧹 ${lang === "en" ? "Message removed — topic" : "Mensagem removida — assunto"}: ${rotulo}`,
      descricao: `<@${userId}> ${lang === "en" ? "in" : "em"} <#${message.channelId}> · **${lang === "en" ? "Score" : "Nota"}:** ${nota}/10 · ${rotuloCategoria(categoria, lang === "en" ? 1 : 0)}\n**${lang === "en" ? "Why" : "Por quê"}:** ${v.motivo || "—"}\n> ${texto.replace(/\n+/g, " ").slice(0, 300)}`,
      es: { titulo: `🧹 Mensaje eliminado — tema: ${rotulo}`,
        descricao: `<@${userId}> en <#${message.channelId}> · **Nota:** ${nota}/10 · ${rotuloCategoria(categoria, 2)}\n**Por qué:** ${v.motivo || "—"}\n> ${texto.replace(/\n+/g, " ").slice(0, 300)}` },
    });
    return res;
  }
  // punir: apaga e aplica a punição do módulo (padrão: a escada do `acumular`)
  const pol = cfg.punicao?.modo ? cfg.punicao : { modo: "acumular" };
  await aplicarPunicao?.({ server, channel: canal ?? message.channel, message, userId, pol, motivo, nota });
  return res;
}

async function alertarStaff(ctx, { userId, canalId, messageId, tema, texto, motivoIA, nota, sinais, lang, categoria = "discussao" }) {
  const T = TEMAS[tema];
  const en = lang === "en";
  const destino = await canalDaStaff(ctx);   // só canal da staff DESTE servidor
  if (!destino) { console.warn(`[ASSUNTOS] alerta NÃO entregue: servidor ${ctx.serverId} sem canal de alerta do sentinela nem de log`); return; }
  const staff = (ctx.config?.acesso?.cargosStaff ?? []).map((id) => `<%${id}>`).join(" ");
  const cabeca = [
    staff || null,
    `<@${userId}> · <#${canalId}>${messageId ? ` · \`${messageId}\`` : ""}`,
  ];
  const trecho = `> ${String(texto).replace(/\n+/g, " ").slice(0, 400)}`;
  const alerta = {   // pt ou en (pelo `lang`, como antes)
    title: `${T.emoji} ${en ? "Forbidden topic" : "Assunto proibido"}: ${en ? T.en : T.pt}`,
    description: [
      ...cabeca,
      `**${en ? "Score" : "Nota"}:** ${nota}/10 · ${rotuloCategoria(categoria, en ? 1 : 0)} · **${en ? "Signals" : "Sinais"}:** ${(sinais ?? []).join(", ") || "—"}`,
      `**${en ? "Why" : "Por quê"}:** ${motivoIA || "—"}`,
      trecho,
      "",
      en ? "_Alert only: the message stayed. Change it with `" + citarInterno("automod.sentinela.assuntos") + "`._"
         : "_Só alerta: a mensagem ficou. Mude com `" + citarInterno("automod.sentinela.assuntos") + "`._",
    ].filter((x) => x !== null).join("\n"),
  };
  await ctx.sendEmbed(destino, {
    ...tr(ctx, alerta, alerta, {
      title: `${T.emoji} Tema prohibido: ${T.es}`,
      description: [
        ...cabeca,
        `**Nota:** ${nota}/10 · ${rotuloCategoria(categoria, 2)} · **Señales:** ${(sinais ?? []).join(", ") || "—"}`,
        `**Por qué:** ${motivoIA || "—"}`,
        trecho,
        "",
        "_Solo es una alerta: el mensaje se quedó. Cámbialo con `" + citar("automod.sentinela.assuntos", "es", ctx.PREFIXO ?? "&") + "`._",
      ].filter((x) => x !== null).join("\n"),
    }),
    colour: ctx.COR?.aviso,
  });
}

// Só para testes
export function _zerar() { fios.clear(); vereditos.clear(); avisados.clear(); }
// Só para testes: volta a carregar a fila de verdade (revisao.js) na próxima decisão
export function _filaReal() { fila = null; filaPronta = false; }
