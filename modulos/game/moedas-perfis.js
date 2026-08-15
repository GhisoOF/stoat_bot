// ══════════════════════════════════════════════════════════
//  moedas-perfis.js — moedas prontas para adicionar UMA A UMA
//
//  Os "modelos" (`moeda modelo mundo`) criam um conjunto fechado. Isso
//  resolve quem quer começar rápido, mas não quem quer montar a própria
//  economia — misturar Real com Esmeralda, ou ter só Ouro e Bitcoin.
//
//  Aqui cada moeda é um perfil independente, e todas vivem na MESMA
//  escala de valor. É o que permite adicioná-las em qualquer combinação
//  sem quebrar o câmbio: como a taxa do banco é a razão entre os
//  estoques, o suprimento de cada uma já nasce inversamente proporcional
//  ao seu valor.
//
//      suprimentoBase = 200.000 / valor
//
//  Assim 1 Ouro (valor 200) vale ~200 Reais assim que as duas nascem,
//  sem precisar de tabela de conversão em lugar nenhum. Depois disso a
//  taxa flutua com o que os jogadores fazem, como deve ser.
//
//  Os valores NÃO são a cotação do mundo real: 1 BTC valendo 350 mil
//  Reais deixaria a moeda inalcançável dentro do jogo. São valores de
//  jogo, mantendo a ORDEM e a sensação de raridade de cada uma.
// ══════════════════════════════════════════════════════════

const ESCALA = 200000;   // suprimento da moeda de valor 1

// `valor` é o quanto uma unidade vale em relação à moeda base.
// `finita` marca as que têm teto real de emissão — as outras são
// infinitas: o que as separa é a VELOCIDADE de geração (dificuldade).
const CRU = [
  // ── Fiduciárias ──
  { id: "brl", nome: "Real",            simbolo: "🇧🇷", valor: 1,   nivelMin: 1,  finita: false, grupo: "fiat",
    desc: "a moeda de todo dia — barata, abundante e sempre aceita" },
  { id: "usd", nome: "Dólar",           simbolo: "💵", valor: 5,   nivelMin: 1,  finita: false, grupo: "fiat",
    desc: "referência internacional, estável e fácil de trocar" },
  { id: "eur", nome: "Euro",            simbolo: "💶", valor: 6,   nivelMin: 3,  finita: false, grupo: "fiat",
    desc: "um degrau acima do dólar, e um pouco mais rara" },
  { id: "gbp", nome: "Libra Esterlina", simbolo: "💷", valor: 7,   nivelMin: 5,  finita: false, grupo: "fiat",
    desc: "a mais valorizada entre as fiduciárias" },

  // ── Metais ──
  { id: "cobre", nome: "Cobre",  simbolo: "🟤", valor: 1,   nivelMin: 1,  finita: false, grupo: "metal",
    desc: "o troco do mundo — serve para tudo, não compra nada grande" },
  { id: "xag",   nome: "Prata",  simbolo: "🥈", valor: 45,  nivelMin: 6,  finita: false, grupo: "metal",
    desc: "o primeiro salto de valor: junta bem, gasta devagar" },
  { id: "xau",   nome: "Ouro",   simbolo: "🥇", valor: 200, nivelMin: 12, finita: false, grupo: "metal",
    desc: "reserva clássica de valor, cara de acumular" },

  // ── Gemas ──
  { id: "esmeralda", nome: "Esmeralda", simbolo: "💚", valor: 350, nivelMin: 15, finita: true, grupo: "gema",
    desc: "achada, não cunhada: existe uma quantidade e acabou" },
  { id: "diamante",  nome: "Diamante",  simbolo: "💎", valor: 900, nivelMin: 20, finita: true, grupo: "gema",
    desc: "a mais cara do catálogo — poucas unidades no mundo inteiro" },

  // ── Criptomoedas ──
  { id: "xmr", nome: "Monero",   simbolo: "🔒", valor: 90,  nivelMin: 10, finita: true, grupo: "cripto",
    desc: "cripto discreta, com emissão limitada" },
  { id: "eth", nome: "Ethereum", simbolo: "⧫",  valor: 180, nivelMin: 14, finita: true, grupo: "cripto",
    desc: "cripto de uso amplo, valor alto e teto de emissão" },
  { id: "btc", nome: "Bitcoin",  simbolo: "₿",  valor: 400, nivelMin: 18, finita: true, grupo: "cripto",
    desc: "a cripto original: teto rígido, difícil de conseguir" },
];

export const GRUPOS = {
  fiat:   { rotulo: "Fiduciárias", rotuloEN: "Fiat",           emoji: "💵" },
  metal:  { rotulo: "Metais",      rotuloEN: "Metals",         emoji: "🥇" },
  gema:   { rotulo: "Gemas",       rotuloEN: "Gems",           emoji: "💎" },
  cripto: { rotulo: "Criptos",     rotuloEN: "Cryptocurrency", emoji: "₿" },
};

// A dificuldade acompanha o valor: uma moeda que vale 200× precisa
// aparecer 200× menos nas missões, senão ela mesma se desvaloriza.
export const PERFIS = CRU.map((m) => ({
  ...m,
  dificuldade: m.valor,
  suprimentoBase: Math.max(1, Math.round(ESCALA / m.valor)),
}));

export function getPerfil(id) {
  return PERFIS.find((p) => p.id === id) ?? null;
}

// Busca tolerante: id, nome exato ou pedaço do nome, sem acento.
export function acharPerfil(texto) {
  const limpo = (x) => String(x ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const alvo = limpo(texto);
  if (!alvo) return null;
  return PERFIS.find((p) => limpo(p.id) === alvo)
      ?? PERFIS.find((p) => limpo(p.nome) === alvo)
      ?? PERFIS.find((p) => limpo(p.nome).startsWith(alvo))
      ?? PERFIS.find((p) => limpo(p.nome).includes(alvo))
      ?? null;
}

// O que vai para o banco quando o perfil é adicionado.
export function paraBanco(perfil, { padrao = false } = {}) {
  return {
    id: perfil.id,
    nome: perfil.nome,
    simbolo: perfil.simbolo,
    dificuldade: perfil.dificuldade,
    nivelMin: perfil.nivelMin,
    suprimentoBase: perfil.suprimentoBase,
    mercado: perfil.suprimentoBase,
    finita: perfil.finita,
    padrao,
  };
}
