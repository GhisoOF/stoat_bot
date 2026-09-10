
export const CLASSES = {
  combatente: {
    rotulo: "Combatente", emoji: "⚔️", desc: "dano físico",
    ganho: { forca: 3, vida: 2, destreza: 1, resistencia: 1 },
    magia: { nome: "Golpe Certeiro", tipo: "ataque", custo: 2, poder: 0.35 },
  },
  tank: {
    rotulo: "Tank", emoji: "🛡️", desc: "resistência",
    ganho: { resistencia: 3, vida: 3, agilidade: 1 },
    magia: { nome: "Muralha", tipo: "suporte", custo: 2, poder: 0.40 },
  },
  mago: {
    rotulo: "Mago", emoji: "🔮", desc: "dano mágico",
    ganho: { inteligencia: 3, mana: 2, destreza: 1 },
    magia: { nome: "Lança Arcana", tipo: "ataque", custo: 3, poder: 0.45 },
  },
  suporte: {
    rotulo: "Suporte", emoji: "✨", desc: "sorte e carisma",
    ganho: { sorte: 2, carisma: 2, mana: 1, vida: 1 },
    magia: { nome: "Bênção", tipo: "suporte", custo: 2, poder: 0.30 },
  },
};

export const RARIDADE_MULT = {
  comum: 1.0, incomum: 1.25, raro: 1.6, epico: 2.1, lendario: 2.8,
};

export const GENERICOS = [
  // COMUM — dá para contratar cedo
  { id: "f_mercenario_novato",  nome: "Mercenário Novato",   classe: "combatente", raridade: "comum",   preco: 120 },
  { id: "f_aprendiz_magia",     nome: "Aprendiz de Magia",   classe: "mago",       raridade: "comum",   preco: 120 },
  { id: "f_guarda_bisonho",     nome: "Guarda Bisonho",      classe: "tank",       raridade: "comum",   preco: 120 },
  { id: "f_curandeira_errante", nome: "Curandeira Errante",  classe: "suporte",    raridade: "comum",   preco: 120 },

  // INCOMUM
  { id: "f_batedor_silencioso", nome: "Batedor Silencioso",  classe: "combatente", raridade: "incomum", preco: 400 },
  { id: "f_escriba_runico",     nome: "Escriba Rúnico",      classe: "mago",       raridade: "incomum", preco: 400 },
  { id: "f_sentinela_muro",     nome: "Sentinela do Muro",   classe: "tank",       raridade: "incomum", preco: 400 },
  { id: "f_bardo_estrada",      nome: "Bardo de Estrada",    classe: "suporte",    raridade: "incomum", preco: 400 },

  // RARO
  { id: "f_espadachim_cinzas",  nome: "Espadachim das Cinzas", classe: "combatente", raridade: "raro", preco: 1400 },
  { id: "f_vidente_lago",       nome: "Vidente do Lago",       classe: "mago",       raridade: "raro", preco: 1400 },
  { id: "f_couraceiro",         nome: "Couraceiro de Ferro",   classe: "tank",       raridade: "raro", preco: 1400 },
  { id: "f_alquimista",         nome: "Alquimista Viajante",   classe: "suporte",    raridade: "raro", preco: 1400 },

  // ÉPICO — só aparecem em dungeon
  { id: "f_lamina_juramentada", nome: "Lâmina Juramentada", classe: "combatente", raridade: "epico", soDungeon: true },
  { id: "f_arquimago_exilado",  nome: "Arquimago Exilado",  classe: "mago",       raridade: "epico", soDungeon: true },
  { id: "f_baluarte",           nome: "Baluarte Silente",   classe: "tank",       raridade: "epico", soDungeon: true },
  { id: "f_oraculo",            nome: "Oráculo de Bronze",  classe: "suporte",    raridade: "epico", soDungeon: true },

  // LENDÁRIO — raríssimos, só em dungeon difícil
  { id: "f_ceifador",   nome: "Ceifador de Auroras", classe: "combatente", raridade: "lendario", soDungeon: true },
  { id: "f_tecelao",    nome: "Tecelão do Vazio",    classe: "mago",       raridade: "lendario", soDungeon: true },
  { id: "f_inabalavel", nome: "O Inabalável",        classe: "tank",       raridade: "lendario", soDungeon: true },
  { id: "f_estrela",    nome: "Estrela Cadente",     classe: "suporte",    raridade: "lendario", soDungeon: true },
];

// Atributos do follower no nível dado — sobem sozinhos, pela classe.
export function atributosDoFollower(catalogo, nivel = 1) {
  const attr = { forca: 0, destreza: 0, resistencia: 0, agilidade: 0,
                 vida: 0, mana: 0, inteligencia: 0, sorte: 0, carisma: 0 };
  const cls = CLASSES[catalogo?.classe];
  if (!cls) return attr;
  const mult = RARIDADE_MULT[catalogo.raridade] ?? 1;
  for (const [k, v] of Object.entries(cls.ganho)) {
    attr[k] = Math.round(v * Math.max(1, nivel) * mult);
  }
  // piso: todo follower existe fisicamente e conta para o Carisma da party
  attr.vida = Math.max(attr.vida, Math.round(2 * Math.max(1, nivel) * mult));
  attr.carisma = Math.max(attr.carisma, 1);
  return attr;
}

export function magiaDo(catalogo) {
  const cls = CLASSES[catalogo?.classe];
  if (!cls) return null;
  const mult = RARIDADE_MULT[catalogo.raridade] ?? 1;
  return { ...cls.magia, poder: cls.magia.poder * mult };
}

// Semeia o catálogo (idempotente; não sobrescreve o que você curou).
export function semear(db) {
  let n = 0;
  for (const f of GENERICOS) {
    const existente = db.getFollowerCatalogo(f.id);
    if (existente && existente.origem !== "generico") continue;
    db.upsertFollowerCatalogo({ ...f, origem: "generico" });
    n++;
  }
  return n;
}
