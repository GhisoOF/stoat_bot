
export const TIPOS = { mercado: "mercado", dungeon: "dungeon" };

export const MISSOES = [
  // ── MERCADO (sem risco) ──
  { id: "m_encomendas",  nome: "Entregar Encomendas",        tipo: "mercado", nivel: 1, poder: 0, risco: 0, cooldownMin: 10,
    descricao: "Levar pacotes de um lado a outro do mercado. Ninguém morre carregando caixa." },
  { id: "m_estoque",     nome: "Organizar o Estoque",        tipo: "mercado", nivel: 1, poder: 0, risco: 0, cooldownMin: 10,
    descricao: "O ferreiro perdeu a conta dos lingotes. De novo." },
  { id: "m_taverna",     nome: "Ajudar na Taverna",          tipo: "mercado", nivel: 1, poder: 0, risco: 0, cooldownMin: 10,
    descricao: "Servir, limpar, ouvir histórias repetidas. Pagam em moeda e paciência." },
  { id: "m_estabulo",    nome: "Cuidar dos Cavalos",         tipo: "mercado", nivel: 1, poder: 0, risco: 0, cooldownMin: 10,
    descricao: "Alimentar, escovar, fingir que não pisou onde não devia." },

  // ── DUNGEON — FÁCIL ──
  { id: "d_ratos",   nome: "Limpar os Ratos do Porão",   tipo: "dungeon", dificuldade: "facil", nivel: 2, poder: 2,  risco: 1.5, cooldownMin: 20,
    descricao: "São ratos. Grandes, mas ratos." },
  { id: "d_goblins", nome: "Espantar Goblins da Estrada", tipo: "dungeon", dificuldade: "facil", nivel: 3, poder: 6,  risco: 4,  cooldownMin: 20,
    descricao: "Cobram pedágio numa ponte que nem é deles." },
  { id: "d_ervas",   nome: "Colher Ervas na Mata Rasa",  tipo: "dungeon", dificuldade: "facil", nivel: 4, poder: 12, risco: 9,  cooldownMin: 20,
    descricao: "A mata é rasa. O que vive nela, nem tanto." },

  // ── DUNGEON — MÉDIO ──
  { id: "d_lobo",     nome: "Caçar o Lobo Branco",      tipo: "dungeon", dificuldade: "medio", nivel: 6,  poder: 45,  risco: 35, cooldownMin: 45,
    descricao: "Já levou três rebanhos. E dois caçadores." },
  { id: "d_cripta",   nome: "Explorar a Cripta Submersa", tipo: "dungeon", dificuldade: "medio", nivel: 8, poder: 70,  risco: 55, cooldownMin: 45,
    descricao: "A água subiu, mas o que estava lá dentro não saiu." },
  { id: "d_caravana", nome: "Escoltar a Caravana de Sal", tipo: "dungeon", dificuldade: "medio", nivel: 10, poder: 110, risco: 85, cooldownMin: 45,
    descricao: "Três dias de estrada. Alguém sempre observa." },

  // ── DUNGEON — DIFÍCIL ──
  { id: "d_poco",      nome: "Descer ao Poço sem Fundo",  tipo: "dungeon", dificuldade: "dificil", nivel: 14, poder: 260, risco: 210, cooldownMin: 90,
    descricao: "Tem fundo. Ninguém voltou para confirmar." },
  { id: "d_guardiao",  nome: "Enfrentar o Guardião de Pedra", tipo: "dungeon", dificuldade: "dificil", nivel: 18, poder: 520, risco: 420, cooldownMin: 90,
    descricao: "Não dorme, não come, não negocia." },
  { id: "d_serpente",  nome: "Invadir o Ninho da Serpente", tipo: "dungeon", dificuldade: "dificil", nivel: 22, poder: 950, risco: 780, cooldownMin: 90,
    descricao: "O ninho é quente por um motivo." },
];

export const DIFICULDADE_INFO = {
  facil:   { emoji: "🟢", rotulo: "Fácil" },
  medio:   { emoji: "🟡", rotulo: "Médio" },
  dificil: { emoji: "🔴", rotulo: "Difícil" },
};

const LOOT = {
  facil:   { comum: 0.55, incomum: 0.20 },
  medio:   { comum: 0.25, incomum: 0.38, raro: 0.15 },
  dificil: { incomum: 0.28, raro: 0.32, epico: 0.14, lendario: 0.03 },
};

// XP base por dificuldade (antes da escala por nível da missão).
const XP_BASE = { mercado: 12, facil: 25, medio: 40, dificil: 70 };

export function acharMissao(txt) {
  const alvo = String(txt ?? "").trim().toLowerCase();
  if (!alvo) return null;
  return MISSOES.find((m) => m.id === alvo)
      ?? MISSOES.find((m) => m.nome.toLowerCase() === alvo)
      ?? MISSOES.find((m) => m.nome.toLowerCase().includes(alvo))
      ?? null;
}

const precisao = (destreza) => 0.70 + 0.30 * (destreza / (destreza + 10));
const reducao  = (resistencia) => resistencia / (resistencia + 20);   // < 1 sempre
const evasao   = (agilidade) => agilidade / (agilidade + 25);

export function calcularPoder(attr, magias = []) {
  const base = (attr.forca ?? 0) * 1.00 + (attr.inteligencia ?? 0) * 0.70;
  const bruto = base * precisao(attr.destreza ?? 0) + (attr.carisma ?? 0) * 0.30;
  // Magias de ATAQUE somam por cima, proporcionais ao que a party já tem
  const bonus = magias.filter((m) => m.tipo === "ataque")
    .reduce((acc, m) => acc + m.poder, 0);
  return bruto * (1 + bonus);
}

export function calcularResiliencia(attr, magias = []) {
  const fVida  = 1 + (attr.vida ?? 0) / 12;
  const fResis = 1 + (attr.resistencia ?? 0) / 12;
  const fAgil  = 1 + (attr.agilidade ?? 0) / 12;
  const bruto = 3 * fVida * fResis * fAgil + (attr.sorte ?? 0) * 0.60;
  // Magias de SUPORTE aumentam a sobrevivência
  const bonus = magias.filter((m) => m.tipo === "suporte")
    .reduce((acc, m) => acc + m.poder, 0);
  return bruto * (1 + bonus);
}

const chance = (meu, exigido) => (exigido <= 0 ? 1 : meu / (meu + exigido));

export function escalaPorParty(tamanho) {
  return 1 + 0.18 * Math.max(0, tamanho);
}

export function previsao(attr, missao, magias = [], tamanhoParty = 0) {
  const poder = calcularPoder(attr, magias);
  const resil = calcularResiliencia(attr, magias);
  const esc = escalaPorParty(tamanhoParty);
  const poderExigido = (missao.poder ?? 0) * esc;
  const riscoExigido = (missao.risco ?? 0) * esc;
  return {
    poder, resil, escala: esc,
    exito: chance(poder, poderExigido),
    sobrevivencia: riscoExigido > 0 ? chance(resil, riscoExigido) : 1,
  };
}

export function resolver(attr, missao, aleatorio = Math.random, magias = [], tamanhoParty = 0) {
  const p = previsao(attr, missao, magias, tamanhoParty);
  const exito = aleatorio() < p.exito;
  const sobreviveu = missao.risco <= 0 ? true : aleatorio() < p.sobrevivencia;

  // XP acompanha a curva: missão de nível alto paga exponencialmente mais.
  const base = XP_BASE[missao.tipo === "mercado" ? "mercado" : missao.dificuldade] ?? 20;
  const escala = missao.tipo === "mercado" ? 1 : Math.pow(1.5, (missao.nivel ?? 1) - 1);
  let xp = Math.round(base * escala);
  if (!exito) xp = Math.round(xp * 0.3);        // tentou e falhou ainda ensina algo
  if (!sobreviveu) xp = Math.round(xp * 0.15);  // cair ensina menos

  return {
    exito, sobreviveu, xp,
    desfecho: !sobreviveu ? "caiu" : exito ? "sucesso" : "falha",
    previsao: p,
  };
}

// Sorteia uma raridade de loot; devolve null quando não sai nada.
export function sortearRaridade(missao, sorte = 0, aleatorio = Math.random, tamanhoParty = 0) {
  if (missao.tipo === "mercado") return null;   // mercado não dá item
  const tabela = LOOT[missao.dificuldade] ?? {};
  const divisao = 1 / (1 + 0.30 * Math.max(0, tamanhoParty));
  const bonus = (1 + 0.03 * Math.sqrt(Math.max(0, sorte))) * divisao;
  let r = aleatorio();
  for (const [raridade, chanceBase] of Object.entries(tabela)) {
    const c = chanceBase * bonus;
    if (r < c) return raridade;
    r -= c;
  }
  return null;
}

export function cooldownMs(missao) {
  return (missao.cooldownMin ?? 20) * 60_000;
}
