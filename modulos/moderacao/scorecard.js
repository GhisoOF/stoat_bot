
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

// A conta/identidade tem de ser a da vítima
const LEX_CONTA_ALHEIA = [
  /\b(usar|utilizar|usando|use|using|through|via)\s+(a\s+|o\s+|sua\s+|seu\s+|your\s+|the\s+)*\b(conta|account|perfil|profile|cadastro|identidade|identity)\b/i,
  /\b(sua|seu|your)\s+(conta|account|perfil|profile)\s+(do|de|no|na|of|on)?\s*(linkedin|upwork|fiverr|freelancer|paypal|wise|payoneer|binance|revolut|banc\w+|bank)/i,
  /\b(linkedin|upwork|fiverr|freelancer|payoneer|binance)\s+(account|conta|profile|perfil)\b/i,
  /\b(empresta\w*|alug\w+|ced[ae]r?|ceder)\s+(a\s+|o\s+|sua\s+|seu\s+)?(conta|perfil|cart[ãa]o|documento|cpf)/i,
  /\b(em|no)\s+(seu|teu)\s+nome\b/i, /\bin\s+your\s+name\b/i,
  /\byour\s+(identity|documents?|id|credentials?)\b/i,
  /\b(seus?|suas?)\s+(documentos?|dados\s+banc\w+)\b/i,
];

// Divisão de lucro/receita
const LEX_DIVISAO_LUCRO = [
  /\b(divid\w+|split|share|sharing|reparti\w+|rachar)\s+(os\s+|o\s+|a\s+|the\s+|resulting\s+)*\b(lucro|ganho|receita|revenue|profit|earnings|income|comiss[ãa]o)/i,
  /\b(lucro|ganho|receita|revenue|profit|earnings|income)s?\b[^.\n]{0,40}\b(divid|split|shar|50\s*%|meio\s+a\s+meio)/i,
  /\b(50\/50|60\/40|70\/30|80\/20|40\/60|30\/70)\b/,
  /\b\d{1,3}\s*%\s*(do|dos|da|de|of|the)?\s*(lucro|ganho|receita|revenue|profit|earnings)/i,
  /\b(lucro|receita|revenue|profit|earnings)[^.\n]{0,30}\b\d{1,3}\s*%/i,
  /\b(te\s+dou|te\s+passo|fic\w+\s+com|voc[êe]\s+ganha|you\s+(get|keep|receive))\s*\d{1,3}\s*%/i,
  /\b\d{1,3}\s*%\s*(pra|para|for)\s+(voc[êe]|you|ti|si)(?![a-z])/i,
];

// Mula: o dinheiro passa pela conta da vítima
const LEX_MULA = [
  /\b(depositad\w+|deposited|transferid\w+|transferred|enviad\w+|sent|pago|paid|cai|cair[áa]?|entra|vai)\b[^.\n]{0,30}\b(na|no|para|pra|em|into|to)\s+(a\s+|sua|seu|your)\s*(conta|account)/i,
  /\b(recebe?r?|receive)\b[^.\n]{0,30}\b(pagamentos?|payments?|transfer\w+|dep[óo]sitos?)\b[^.\n]{0,25}\b(na\s+sua|em\s+sua|your)\s*(conta|account)/i,
  /\b(voc[êe]|you)\s+(vai|ir[áa]|will)?\s*(handle|gerenc\w+|administr\w+|cuidar?\w*|receb\w+|manage)\b[^.\n]{0,25}\b(o\s+)?(dinheiro|money|pagamento|payment|funds?)/i,
  /\b(money|dinheiro)\s*(management|handling|gest[ãa]o)\b/i,
  /\b(receb\w+\s+e\s+(repass|transfer|envi)\w+|receive\s+and\s+(forward|send|transfer|wire))/i,
  /\b(retir\w+|saque|withdraw)\b[^.\n]{0,25}\b(e\s+)?(envi|repass|transfer|send)/i,
  /\b(conta|account)\b[^.\n]{0,20}\b(pra|para|to)\s+(receber|recebimento|receive|collect)\b/i,
];

// Recrutamento sem barreira de entrada
const LEX_RECRUTAMENTO = [
  /\b(no|sem|nenhum\w*)\s+(technical\s+|prior\s+|pr[ée]via\s+)*(skills?|experience|experi[êe]ncia|conhecimento)\b[^.\n]{0,25}\b(required|needed|necess[áa]ri\w+|exigid\w+)?/i,
  /\b(looking\s+for|procur\w+|busc\w+|preciso\s+de|need)\b[^.\n]{0,25}\b(collaborator|partner|parceir\w+|colaborador\w*|s[óo]ci\w+|representante|agent|freelancer)/i,
  /\b(vaga|oportunidade|opportunity)\s+(de\s+)?(emprego|trabalho|home\s*office|remote|remoto)/i,
  /\b(trabalh\w+|work|renda)\s+(de\s+|em\s+|from\s+)?(casa|home|remoto|remote|meio\s+per[íi]odo|part[\s-]?time)\b/i,
  /\b(collaboration|colabora[çc][ãa]o)\s+(method|m[ée]todo|proposta)\b/i,
];

const LEX_PRETEXTO_CONTA = [
  /\b(the\s+)?reason\s+for\s+using\s+your\b/i,
  /\b(motivo|raz[ãa]o)\s+(de|para|por)\s+(usar|utilizar)\s+(a\s+)?sua\b/i,
  /\b(minha|my)\s+(conta|account|card|cart[ãa]o)\b[^.\n]{0,30}\b(bloquead|restrit|banid|suspens|limited|restricted|blocked|suspended|banned)/i,
  /\b(n[ãa]o\s+posso\s+usar\s+(a\s+)?minha|can'?t\s+use\s+my\s+own)\b/i,
  /\b(sal[áa]ri\w+|salaries|salary|pagamentos?|rates?)\b[^.\n]{0,40}\b(sua\s+regi[ãa]o|seu\s+pa[íi]s|your\s+region|your\s+country|higher\s+than)/i,
  /\b(in|na|no|em)\s+(your|sua|seu)\s+(region|regi[ãa]o|country|pa[íi]s)\b/i,
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

export const PESOS = {
  vies:            0,
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

  recrutamento:    1,
  conta_alheia:    1.5,
  divisao_lucro:   1.5,
  mula:            1.5,
  pretexto_conta:  1.5,
  conj_emprego_conta: 3,  // recrutamento/lucro + a conta tem de ser a SUA
  conj_mula_conta:    3,  // a conta é sua E o dinheiro passa por ela
  conj_pretexto_ganho: 3,  // "não posso usar a minha" + divisão/dinheiro
  conj_mula_ganho:     3,  // o dinheiro passa por você E é dividido
};

const contar = (txt, lista, cap = 99) => {
  let n = 0;
  for (const re of lista) if (re.test(txt)) n++;
  return Math.min(n, cap);
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

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
  f.recrutamento   = contar(t, LEX_RECRUTAMENTO, 2);
  f.conta_alheia   = contar(t, LEX_CONTA_ALHEIA, 2);
  f.divisao_lucro  = contar(t, LEX_DIVISAO_LUCRO, 2);
  f.mula           = contar(t, LEX_MULA, 2);
  f.pretexto_conta = contar(t, LEX_PRETEXTO_CONTA, 2);

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

  if (f.conta_alheia > 0 && (f.recrutamento > 0 || f.divisao_lucro > 0)) f.conj_emprego_conta = 1;
  if (f.conta_alheia > 0 && (f.mula > 0 || f.pretexto_conta > 0)) f.conj_mula_conta = 1;
  if (f.pretexto_conta > 0 && (f.divisao_lucro > 0 || f.mula > 0)) f.conj_pretexto_ganho = 1;
  if (f.mula > 0 && f.divisao_lucro > 0) f.conj_mula_ganho = 1;

  return f;
}

export function pontuar(features, pesos = PESOS) {
  let s = pesos.vies ?? 0;
  for (const [k, v] of Object.entries(features)) s += (pesos[k] ?? 0) * v;
  return clamp(s, 0, 10);
}

export function analisarConteudo(texto, opts = {}) {
  const f = extrairFeatures(texto, opts);
  const nota = pontuar(f);
  const grave = (f.conj_grave_oferta > 0) || (f.conj_grave_contexto > 0);
  const sinais = Object.entries(f)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}${v > 1 ? "×" + v : ""}`);
  return { nota, grave, sinais, features: f };
}
