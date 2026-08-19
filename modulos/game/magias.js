// ══════════════════════════════════════════════════════════
//  magias.js — magias que o JOGADOR aprende
//
//  Antes, magia só existia via follower: a classe do companheiro trazia
//  uma, e pronto. Quem jogava sozinho, ou preferia party pequena, não
//  tinha como investir em Mana — o atributo existia sem ter no que gastar.
//
//  Aqui a magia vira algo que se compra e se carrega. As regras são as
//  mesmas das magias de follower (custo em Mana, poder, ataque/suporte),
//  de propósito: o motor de missão já sabe lidar com elas, e duas
//  mecânicas paralelas para a mesma coisa só confundiriam.
//
//  O limite continua sendo a **Mana total da party**. Aprender dez magias
//  não ajuda se você só tem Mana para duas — as mais fortes entram, o
//  resto fica no grimório. É o que faz Mana valer a pena como atributo.
// ══════════════════════════════════════════════════════════

// ── Escolas ───────────────────────────────────────────────
// Só um agrupamento para a lista ficar legível e o preço fazer sentido.
export const ESCOLAS = {
  ataque:  { rotulo: "Ataque",  rotuloEN: "Attack",  emoji: "🔥" },
  suporte: { rotulo: "Suporte", rotuloEN: "Support", emoji: "✨" },
};

// ── Catálogo ──────────────────────────────────────────────
// `custo` é em Mana, `poder` é a fração que a magia soma no cálculo da
// missão, e `preco` é em moeda padrão. A escada é intencional: dobrar o
// poder custa bem mais que o dobro, para não existir "a magia certa".
export const CATALOGO = [
  // Ataque — sobem o êxito da missão
  { id: "m_faisca",        nome: "Faísca",            tipo: "ataque",  custo: 1, poder: 0.15, preco: 150,   nivelMin: 1,  raridade: "comum" },
  { id: "m_flecha_igneca", nome: "Flecha Ígnea",      tipo: "ataque",  custo: 2, poder: 0.28, preco: 500,   nivelMin: 3,  raridade: "incomum" },
  { id: "m_lanca_gelo",    nome: "Lança de Gelo",     tipo: "ataque",  custo: 3, poder: 0.42, preco: 1400,  nivelMin: 6,  raridade: "raro" },
  { id: "m_tempestade",    nome: "Tempestade",        tipo: "ataque",  custo: 5, poder: 0.62, preco: 4200,  nivelMin: 12, raridade: "epico" },
  { id: "m_juizo",         nome: "Juízo Final",       tipo: "ataque",  custo: 8, poder: 0.85, preco: 14000, nivelMin: 20, raridade: "lendario" },
  // Suporte — sobem a sobrevivência
  { id: "m_escudo",        nome: "Escudo Menor",      tipo: "suporte", custo: 1, poder: 0.18, preco: 180,   nivelMin: 1,  raridade: "comum" },
  { id: "m_cura",          nome: "Cura",              tipo: "suporte", custo: 2, poder: 0.30, preco: 550,   nivelMin: 3,  raridade: "incomum" },
  { id: "m_barreira",      nome: "Barreira Arcana",   tipo: "suporte", custo: 3, poder: 0.45, preco: 1500,  nivelMin: 6,  raridade: "raro" },
  { id: "m_regeneracao",   nome: "Regeneração",       tipo: "suporte", custo: 5, poder: 0.65, preco: 4500,  nivelMin: 12, raridade: "epico" },
  { id: "m_intervencao",   nome: "Intervenção Divina", tipo: "suporte", custo: 8, poder: 0.88, preco: 15000, nivelMin: 20, raridade: "lendario" },
];

export function getMagia(id) {
  return CATALOGO.find((m) => m.id === id) ?? null;
}

// Busca tolerante: id, nome exato, ou pedaço do nome. Sem acento dos dois
// lados — ninguém digita "Regeneração" com acento no meio de um comando.
export function acharMagia(texto) {
  const limpo = (x) => String(x ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const alvo = limpo(texto);
  if (!alvo) return null;
  return CATALOGO.find((m) => limpo(m.id) === alvo)
      ?? CATALOGO.find((m) => limpo(m.nome) === alvo)
      ?? CATALOGO.find((m) => limpo(m.nome).includes(alvo))
      ?? CATALOGO.find((m) => limpo(m.id).includes(alvo))
      ?? null;
}

// ── Quais magias cabem na Mana disponível ─────────────────
// Recebe as magias do jogador MAIS as dos followers e devolve as que
// entram, da mais forte para a mais fraca. O jogador não escolhe: a
// party usa o que tem de melhor e cabe — decidir isso a cada missão
// seria um clique a mais sem escolha real por trás.
export function magiasAtivas(todas, manaTotal) {
  let livre = Math.max(0, manaTotal ?? 0);
  const usadas = [];
  for (const m of [...todas].sort((a, b) => b.poder - a.poder)) {
    if (livre >= m.custo) { livre -= m.custo; usadas.push(m); }
  }
  return { usadas, manaLivre: livre, manaGasta: Math.max(0, (manaTotal ?? 0) - livre) };
}

// Preço com o desconto de Carisma, igual ao dos mercenários: quem negocia
// bem paga menos, e o atributo vale nos dois lugares.
export function precoComCarisma(preco, carisma = 0) {
  const desconto = Math.max(0.6, 1 - 0.02 * Math.sqrt(Math.max(0, carisma)));
  return Math.max(1, Math.ceil(preco * desconto));
}
