
export const ESCOLAS = {
  ataque:  { rotulo: "Ataque",  rotuloEN: "Attack",  emoji: "🔥" },
  suporte: { rotulo: "Suporte", rotuloEN: "Support", emoji: "✨" },
};

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

export function magiasAtivas(todas, manaTotal) {
  let livre = Math.max(0, manaTotal ?? 0);
  const usadas = [];
  for (const m of [...todas].sort((a, b) => b.poder - a.poder)) {
    if (livre >= m.custo) { livre -= m.custo; usadas.push(m); }
  }
  return { usadas, manaLivre: livre, manaGasta: Math.max(0, (manaTotal ?? 0) - livre) };
}

export function precoComCarisma(preco, carisma = 0) {
  const desconto = Math.max(0.6, 1 - 0.02 * Math.sqrt(Math.max(0, carisma)));
  return Math.max(1, Math.ceil(preco * desconto));
}
