// ══════════════════════════════════════════════════════════
//  scorecard.js — Pontuação aditiva única (0–10)
//
//  Modelo: scanners de feature → soma ponderada → nota 0–10.
//  UMA categoria só ("conteúdo proibido"): +18, gore, golpe,
//  apologia a ilícito e CSAM convivem aqui, distinguidos apenas
//  por PESO (os indicadores graves pesam o suficiente para,
//  sozinhos, chegarem perto do topo). Sem treino: os pesos são
//  definidos à mão e ficam todos em PESOS, fáceis de calibrar.
//
//  A nota é a soma das features × pesos, limitada a [0, 10].
// ══════════════════════════════════════════════════════════

// ── Léxicos (dados) ───────────────────────────────────────
// Iscas de golpe — promessa de ganho fácil / brinde premium
const LEX_SCAM = [
  /\bfree\s*(nitro|robux|vbucks|gift|steam|skins?)\b/i,
  /\b(nitro|robux|vbucks|skins?)\s*(gr[áa]tis|free)\b/i,
  /\bgift\s*cards?\b/i,
  /\b(lucro|retorno|renda|ganho)s?\s+(garantid\w+|extra|f[áa]cil|di[áa]ri\w+)/i,
  /\bdobr\w+\s+(o\s+|seu\s+)?dinheiro/i,
  /\bganh\w+\s+(dinheiro|muito|r\$|\$|\d)/i,
  /\b(investimento|invista|trader|trading|sinais?\s+de\s+trade)\b/i,
  /\bdouble\s+your\s+(money|crypto|bitcoin|btc)\b/i,
  /\b(renda\s+extra|dinheiro\s+r[áa]pido|money\s+fast|quick\s+cash)\b/i,
];

// CTA / contato fora da plataforma / pagamento / phishing
const LEX_CTA = [
  /\b(whats\s*app|telegram|t\.me\/|wa\.me\/)\b/i,
  /\bcham\w+\s+(no|na)\s+(whats|zap|telegram|dm|pv|inbox|priv)/i,
  /\b(me\s+)?(chama|chame|cham|chamar)\s+(na\s+)?(dm|pv|inbox|priv)/i,
  /\b(dm|inbox|pm)\s+me\b/i,
  /\bpix\b/i,
  /\b(deposit\w*|transfir\w*|envie?\s*(r\$|\$|\d))/i,
  /\bverifi\w+\s+(sua\s+)?conta\b/i,
  /\bsua\s+conta\s+(foi|ser[áa]|est[áa])\b/i,
  /\bconta\s+(suspens|bloquead|banid)/i,
  /\b(clique|click)\s+(aqui|here|para|to)\b/i,
  /\b(login|senha|password|verify\s+your\s+account)\b/i,
];

// Urgência
const LEX_URGENCIA = [
  /\b(vagas\s+limitadas|[úu]ltim\w+\s+(vagas|chance)|por\s+tempo\s+limitado|promo[çc][ãa]o\s+rel[âa]mpago)\b/i,
  /\b(limited\s+time|act\s+now|hurry|s[óo]\s+hoje|agora\s+mesmo|corre)\b/i,
];

// Marcadores de DISCUSSÃO/ALERTA/NEGAÇÃO — empurram a nota PARA BAIXO
const LEX_NEGACAO = [
  /\b(golpe|scam|fraude|phishing|f[áa]ke|estelionato|picaretagem)\b/i,
  /\b(cuidado|cuidem|denunci\w+|report\w*|alerta|aviso|be\s+careful|warning|suspeit\w+)\b/i,
  /\b(n[ãa]o\s+ca[íi]a|n[ãa]o\s+caiam|fui\s+v[íi]tima|quase\s+ca[íi]|tentaram\s+me|me\s+enganaram)\b/i,
  /\b(n[ãa]o\s+(comprem|cliquem|acessem|enviem)|evitem?|fujam?)\b/i,
];

// +18 (pornografia)
const LEX_ADULTO = [
  /\bporn/i, /\b(xvideos|xnxx|hentai|onlyfans)\b/i,
  /\bnudes?\b/i, /\bnsfw\b/i, /\bpacks?\s+de\s+nudes?\b/i,
  /\b(conte[úu]do\s+adulto|\+18|18\+|putaria|novinha|camgirl)\b/i,
  /\b(free\s+porn|leaked?\s+nudes?|vazad[ao]s?)\b/i,
];

// Gore
const LEX_GORE = [
  /\b(gore|snuff|decapita\w+|esfaquea\w+|imagens\s+fortes|conte[úu]do\s+chocante)\b/i,
  /\bv[íi]deo\s+de\s+morte\b/i,
];

// Indicadores GRAVES (abuso infantil / categorias ilícitas).
// Folded into "adulto": pesam alto o bastante para destacar sozinhos.
const LEX_GRAVE = [
  /\ball\s+ages\b/i,
  /\b(little|young|under-?age|pre-?teens?)\s+(girls?|boys?|kids?|ones?|teens?)\b/i,
  /\b(underage|jailbait|lolit[ao]|loli|shota|preteen|cunny|toddlercon|lolicon|shotacon)\b/i,
  /\b(cp|c[\W_]?p|childp)\b/i,
  /\b(brother|bro)\s*(and|&|\/|\+)\s*sister\b/i,
  /\b(mom|mother)\s*(and|&|\/|\+)\s*son\b/i,
  /\b(dad|father)\s*(and|&|\/|\+)\s*(daughter|son)\b/i,
  /\bincest\b/i,
  /\b(rape|estupro|abuso\s+(infantil|de\s+menor)|pedofil|pedô|pedo)\b/i,
  /\bfamily\s+(fun|content|vids?|videos?|collection)\b/i,
];

// Oferta de material (vende/troca/arquivos/provas)
const LEX_OFERTA = [
  /\b(selling|for\s+sale|buy|trade|trading|vendo|à?\s*venda)\b/i,
  /\b(files?|packs?|vids?|videos?|collection|folder|mega|proofs?|legit)\b/i,
  /\bhigh\s+quality\b/i, /\ball\s+kinds\b/i,
];

// Links por tipo (avaliados em ordem de prioridade)
const LINK_FILEHOST   = /\b(mega(\.nz)?|anonfiles|gofile|pixeldrain|mediafire|\w+\.pages\.dev|\w+\.(tk|ml|ga|cf|gq))\b/i;
const LINK_ENCURTADOR = /\b(bit\.ly|tinyurl|cutt\.ly|is\.gd|rb\.gy|t\.me|wa\.me|encurta|grabify|iplogger)\b/i;
const LINK_CONVITE    = /https?:\/\/stt\.gg\/[A-Za-z0-9]+/i;
const LINK_SIMPLES    = /\bhttps?:\/\/|\bwww\./i;

// Afirmação/imperativo (verbo de oferta/ação) — sobe a nota
const AFIRMACAO = /\b(vendo|selling|sell|compre|buy|acesse|access|baixe|download|assine|subscribe|clique|click|entre|join)\b/i;
const PERGUNTA  = /\?/;

// ── Pesos (à mão; calibráveis) ────────────────────────────
export const PESOS = {
  vies:            0,
  // Palavra sensível SOZINHA pesa pouco (evita punir "loli"/"cunny" numa
  // conversa casual). Ela só vira grave de verdade quando acompanhada de
  // contexto de oferta/link/venda — ver conj_grave_* abaixo.
  grave:           1.5,
  adulto:          1.5,
  gore:            2.5,
  scam:            1.5,
  oferta:          2,
  cta:             2,
  urgencia:        1,
  link_filehost:   2.5,
  link_encurtador: 2,
  link_convite:    1,
  link_simples:    0.5,
  mass_ping:       2.5,
  afirmacao:       1,
  pergunta:       -3,
  negacao:        -4,
  taxa_alta:       1.5,
  conj_grave_oferta:   6,  // grave + oferta = anúncio de material → topo
  conj_grave_contexto: 5,  // grave + link/cta/venda = contexto suspeito → alerta
  conj_topico_cta:     2,  // tópico proibido + contato = divulgação
};

const contar = (txt, lista, cap = 99) => {
  let n = 0;
  for (const re of lista) if (re.test(txt)) n++;
  return Math.min(n, cap);
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ── Scanners → features ───────────────────────────────────
function extrairFeatures(texto, opts = {}) {
  const t = texto ?? "";
  const f = {};

  f.grave   = contar(t, LEX_GRAVE, 2);
  f.adulto  = contar(t, LEX_ADULTO, 3);
  f.gore    = contar(t, LEX_GORE, 3);
  f.scam    = contar(t, LEX_SCAM, 3);
  f.oferta  = contar(t, LEX_OFERTA, 3);
  f.cta     = contar(t, LEX_CTA, 3);
  f.urgencia = contar(t, LEX_URGENCIA, 2);

  // Tipo de link (apenas o de maior prioridade conta)
  if (LINK_FILEHOST.test(t))        f.link_filehost = 1;
  else if (LINK_ENCURTADOR.test(t)) f.link_encurtador = 1;
  else if (LINK_CONVITE.test(t))    f.link_convite = 1;
  else if (LINK_SIMPLES.test(t))    f.link_simples = 1;

  // Menção em massa + link = divulgação
  if (/@everyone|@here|@online/i.test(t) && LINK_SIMPLES.test(t)) f.mass_ping = 1;

  // Ato de fala
  const negacao = contar(t, LEX_NEGACAO) > 0;
  if (negacao) f.negacao = 1;
  if (PERGUNTA.test(t)) f.pergunta = 1;
  if (AFIRMACAO.test(t) || f.oferta > 0 || f.cta > 0) f.afirmacao = 1;

  // Taxa (mensagens/seg) — passada de fora
  if ((opts.rate ?? 1) >= 3) f.taxa_alta = 1;

  // Conjunções (o "E" que o somatório linear sozinho não captura)
  const temContexto = (f.oferta > 0 || f.cta > 0 || f.link_filehost || f.link_encurtador || f.link_convite || f.link_simples || f.afirmacao > 0);
  if (f.grave > 0 && f.oferta > 0) f.conj_grave_oferta = 1;
  else if (f.grave > 0 && temContexto) f.conj_grave_contexto = 1;
  if ((f.adulto > 0 || f.gore > 0 || f.scam > 0) && (f.cta > 0 || f.oferta > 0)) f.conj_topico_cta = 1;

  return f;
}

// ── Função de pontuação ÚNICA ─────────────────────────────
export function pontuar(features, pesos = PESOS) {
  let s = pesos.vies ?? 0;
  for (const [k, v] of Object.entries(features)) s += (pesos[k] ?? 0) * v;
  return clamp(s, 0, 10);
}

// Analisa um conteúdo e devolve a nota 0–10 + os sinais que somaram.
//  opts.rate = mensagens por segundo daquele autor (opcional)
export function analisarConteudo(texto, opts = {}) {
  const f = extrairFeatures(texto, opts);
  const nota = pontuar(f);
  // "grave" (que aciona ação forte) agora exige CONTEXTO: palavra sensível
  // sozinha não é mais tratada como grave — só quando vem com oferta/link/cta.
  const grave = (f.conj_grave_oferta > 0) || (f.conj_grave_contexto > 0);
  const sinais = Object.entries(f)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}${v > 1 ? "×" + v : ""}`);
  return { nota, grave, sinais, features: f };
}
