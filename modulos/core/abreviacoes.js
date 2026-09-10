
export const PADRAO = {
  q: "que", n: "não", vc: "você", vcs: "vocês", voce: "você",
  tb: "também", tbm: "também", tmb: "também", tbem: "também",
  pq: "porque", pqp: "puta que pariu",
  blz: "beleza", vlw: "valeu", flw: "falou", falow: "falou",
  hj: "hoje", ontem: "ontem", amanha: "amanhã", amnh: "amanhã",
  msg: "mensagem", msgs: "mensagens",
  obg: "obrigado", obgd: "obrigado", vlws: "valeus",
  pfv: "por favor", pff: "por favor", pfvr: "por favor",
  cmg: "comigo", ctg: "contigo", nois: "nós",
  mds: "meu deus", sla: "sei lá", slk: "se liga",
  dps: "depois", agr: "agora", ent: "então", entao: "então",
  mt: "muito", mto: "muito", mta: "muita", mts: "muitos",
  ta: "está", tá: "está", tao: "estão", tão: "estão",
  td: "tudo", tds: "todos", tdo: "tudo",
  qnd: "quando", qdo: "quando", qm: "quem", qq: "qualquer",
  nd: "nada", vdd: "verdade", vsf: "vá se ferrar",
  cx: "caixa", fds: "fim de semana", finde: "fim de semana",
  add: "adicionar", nn: "não", naum: "não", num: "não",
  eh: "é", neh: "né", ne: "né",
  bj: "beijo", bjs: "beijos", abs: "abraços",
  rlx: "relaxa", bora: "bora", tmj: "tamo junto",
  gnt: "gente", pple: "pessoal", pssl: "pessoal",
  ss: "sim", sim: "sim", n1: "nice one",
  vamo: "vamos", to: "estou", tô: "estou", tou: "estou",
  cê: "você", ce: "você",
  msm: "mesmo", mesm: "mesmo",
  pra: "para", pro: "para o", pras: "para as", pros: "para os",
  hrs: "horas", min: "minutos", seg: "segundos",
  jogo: "jogo", jgo: "jogo",
  dnv: "de novo", axo: "acho", acho: "acho",
  sdd: "saudade", sdds: "saudades",
  vdds: "verdades", crl: "caralho",
  glr: "galera", brc: "brincadeira", brincs: "brincadeira",
  smp: "sempre", nnc: "nunca", pcp: "principalmente",
  aki: "aqui", ai: "aí", ae: "aí",
  oq: "o que", pqp2: "puta que pariu",
  rt: "retuíte", dm: "mensagem direta",
};

// Risadas: qualquer sequência de 3+ k/h/rs vira uma risada curta.
const RISADA = /\b(?:k{3,}|(?:ha){2,}h?|(?:rs){2,}|hue{2,}|hehe+)\b/giu;

const LETRA = "0-9A-Za-zÀ-ÖØ-öø-ÿ";

function escapar(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Aplica a capitalização da forma original à expansão.
function comCaixa(original, expansao) {
  if (original === original.toUpperCase() && original.length > 1) {
    return expansao.toUpperCase();          // "VC" → "VOCÊ" (grito)
  }
  if (original[0] === original[0]?.toUpperCase()) {
    return expansao[0].toUpperCase() + expansao.slice(1);   // "Vc" → "Você"
  }
  return expansao;
}

/**
 * Expande abreviações num texto.
 * @param {string} texto
 * @param {Object} extra dicionário do servidor (tem prioridade)
 * @param {boolean} usarPadrao inclui o dicionário embutido
 */
export function expandir(texto, extra = {}, usarPadrao = true) {
  let t = String(texto ?? "");
  if (!t.trim()) return t;

  // risadas primeiro: senão o "kkk" seria soletrado letra a letra
  t = t.replace(RISADA, "kkk");

  const mapa = usarPadrao ? { ...PADRAO, ...extra } : { ...extra };
  const chaves = Object.keys(mapa)
    .filter((k) => k && mapa[k])
    .sort((a, b) => b.length - a.length);   // mais longas primeiro ("tbm" antes de "tb")
  if (!chaves.length) return t;

  const re = new RegExp(
    `(?<![${LETRA}])(${chaves.map(escapar).join("|")})(?![${LETRA}])`,
    "giu"
  );

  return t.replace(re, (achado) => {
    const chave = Object.keys(mapa).find((k) => k.toLowerCase() === achado.toLowerCase());
    return chave ? comCaixa(achado, mapa[chave]) : achado;
  });
}

/** Quantas entradas o dicionário efetivo tem. */
export function total(extra = {}, usarPadrao = true) {
  return Object.keys(usarPadrao ? { ...PADRAO, ...extra } : extra).length;
}
