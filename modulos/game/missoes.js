// ══════════════════════════════════════════════════════════
//  missoes.js — catálogo e resolução
//
//  Dois tipos, como no design:
//
//   • MERCADO — sem risco de morte. Paga pouco e em valor FIXO,
//     que não escala com o nível. É a rede de segurança de quem
//     tem medo de perder o que carrega, e deixa de compensar
//     sozinha conforme a curva de XP cresce. Nenhuma trava
//     artificial precisa existir para isso.
//
//   • DUNGEON — 3 dificuldades, com risco real. O XP acompanha a
//     curva de 1,5× por nível da missão, então subir de nível leva
//     mais ou menos o mesmo tempo a vida inteira.
//
//  O combate é resolvido por cálculo, de uma vez, sem turnos.
// ══════════════════════════════════════════════════════════

export const TIPOS = { mercado: "mercado", dungeon: "dungeon" };

// ── Catálogo ──────────────────────────────────────────────
// `nivel` alimenta a escala de XP; `poder` e `risco` são a
// dificuldade contra a qual o personagem é comparado.
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

// Tabela de loot por dificuldade: chance de cada raridade sair.
// O que sobra até 1 é "nada" — nem toda missão dá item.
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

// ── Poder e Resiliência (§5 do design) ────────────────────
//
// As três defesas se MULTIPLICAM de propósito: espalhar rende mais
// que empilhar, sem precisar de regra proibindo nada.

const precisao = (destreza) => 0.70 + 0.30 * (destreza / (destreza + 10));
const reducao  = (resistencia) => resistencia / (resistencia + 20);   // < 1 sempre
const evasao   = (agilidade) => agilidade / (agilidade + 25);

export function calcularPoder(attr) {
  const base = (attr.forca ?? 0) * 1.00 + (attr.inteligencia ?? 0) * 0.70;
  return base * precisao(attr.destreza ?? 0) + (attr.carisma ?? 0) * 0.30;
}

export function calcularResiliencia(attr) {
  // As três defesas se MULTIPLICAM. Para que "espalhar renda mais que empilhar"
  // (§2.1 do design), nenhuma delas pode ser linear: se a Vida entrasse direto,
  // despejar tudo nela venceria sempre, e Resistência/Agilidade virariam
  // decoração. Com a Vida também sob raiz, 10/10/10 supera 30/0/0.
  // Cada defesa vira um FATOR na mesma escala. O produto de fatores é máximo
  // quando eles são parecidos entre si — é isso que faz 10/10/10 vencer 30/0/0,
  // sem nenhuma regra dizendo "não empilhe".
  const fVida  = 1 + (attr.vida ?? 0) / 12;
  const fResis = 1 + (attr.resistencia ?? 0) / 12;
  const fAgil  = 1 + (attr.agilidade ?? 0) / 12;
  return 3 * fVida * fResis * fAgil + (attr.sorte ?? 0) * 0.60;
}

// Probabilidade no formato "poder próprio contra a exigência":
// iguais = 50%. Nunca chega a 0% nem 100% — sempre há sorte envolvida.
const chance = (meu, exigido) => (exigido <= 0 ? 1 : meu / (meu + exigido));

export function previsao(attr, missao) {
  const poder = calcularPoder(attr);
  const resil = calcularResiliencia(attr);
  return {
    poder, resil,
    exito: chance(poder, missao.poder),
    sobrevivencia: missao.risco > 0 ? chance(resil, missao.risco) : 1,
  };
}

// ── Resolução ─────────────────────────────────────────────
export function resolver(attr, missao, aleatorio = Math.random) {
  const p = previsao(attr, missao);
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
export function sortearRaridade(missao, sorte = 0, aleatorio = Math.random) {
  if (missao.tipo === "mercado") return null;   // mercado não dá item
  const tabela = LOOT[missao.dificuldade] ?? {};
  // Sorte melhora um pouco a chance de sair algo, com retorno decrescente
  const bonus = 1 + 0.03 * Math.sqrt(Math.max(0, sorte));
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
