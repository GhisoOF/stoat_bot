// Regras do RPG v4 — a FONTE ÚNICA das fórmulas (9 out 2026).
//
// Tudo o que é número no jogo sai daqui: faixas e raridades, armas e defesa,
// implantes, sinergia, companheiros, a party de referência, a força das
// missões e chefes, a recompensa, a folga e o pagamento em moeda. O jogo
// (game.js e companhia) e o script de balanceamento (scripts/balanceamento-rpg.mjs)
// importam DAQUI — se uma regra muda, muda nos dois.
//
// Planejamento e decisões (D1–D28): docs/rpg/PLANO-RPG-CONTEUDO.md.
// Sem dependência de banco: só funções puras e tabelas.

export const ATR = ["forca", "destreza", "resistencia", "agilidade", "vida", "mana", "inteligencia", "sorte", "carisma"];
const r2 = (x) => Math.round(x * 100) / 100;
const soma = (xs, f) => xs.reduce((s, x) => s + f(x), 0);

// ── 1. Escala: tiers do VS Battles → 10 faixas (D3) ──────────────────────────
export const TIERS = ["10-C","10-B","10-A","9-C","9-B","9-A","8-C","High 8-C","8-B","8-A",
  "Low 7-C","7-C","High 7-C","Low 7-B","7-B","7-A","High 7-A",
  "6-C","High 6-C","Low 6-B","6-B","High 6-B","6-A","High 6-A",
  "5-C","Low 5-B","5-B","5-A","High 5-A","Low 4-C","4-C","High 4-C","4-B","4-A",
  "3-C","3-B","3-A","High 3-A","Low 2-C","2-C","2-B","2-A",
  "Low 1-C","1-C","High 1-C","1-B","High 1-B","Low 1-A","1-A","High 1-A","0"];
export const FAIXAS = [
  { n: 1,  nome: "Humano",       nomeEN: "Human",        de: "10-C",     ate: "10-A",     raridade: "comum" },
  { n: 2,  nome: "Sobre-humano", nomeEN: "Superhuman",   de: "9-C",      ate: "9-A",      raridade: "incomum" },
  { n: 3,  nome: "Urbano",       nomeEN: "Urban",        de: "8-C",      ate: "8-A",      raridade: "raro" },
  { n: 4,  nome: "Nuclear",      nomeEN: "Nuclear",      de: "Low 7-C",  ate: "High 7-A", raridade: "epico" },
  { n: 5,  nome: "Tectônico",    nomeEN: "Tectonic",     de: "6-C",      ate: "High 6-A", raridade: "lendario" },
  { n: 6,  nome: "Planetário",   nomeEN: "Planetary",    de: "5-C",      ate: "High 5-A", raridade: "mitico" },
  { n: 7,  nome: "Estelar",      nomeEN: "Stellar",      de: "Low 4-C",  ate: "4-A",      raridade: "celestial" },
  { n: 8,  nome: "Cósmico",      nomeEN: "Cosmic",       de: "3-C",      ate: "High 3-A", raridade: "divino" },
  { n: 9,  nome: "Multiversal",  nomeEN: "Multiversal",  de: "Low 2-C",  ate: "2-A",      raridade: "primordial" },
  { n: 10, nome: "Hiperversal",  nomeEN: "Hyperversal",  de: "Low 1-C",  ate: "0",        raridade: "supremo" },
].map((f) => ({ ...f, niveis: [10 * (f.n - 1) + 1, 10 * f.n] }));
export const faixaDoNivel = (nv) => FAIXAS[Math.min(9, Math.max(0, Math.ceil(Math.max(1, nv) / 10) - 1))];
export const faixaDaDif = (d) => FAIXAS[Math.min(9, Math.max(0, d - 1))];
export function faixaDoTier(t) {
  const g = TIERS.indexOf(t);
  if (g < 0) return null;
  for (const f of FAIXAS) {
    const a = TIERS.indexOf(f.de), b = TIERS.indexOf(f.ate);
    if (g >= a && g <= b) {
      const pos = b > a ? (g - a) / (b - a) : 0;
      return { ...f, grau: g, pos, nivel: Math.round(f.niveis[0] + pos * 9), destaque: 1 + 0.2 * pos };
    }
  }
  return null;
}

// ── 2. Raridades (uma por faixa) ─────────────────────────────────────────────
// mult: companheiros · item: orçamento de bônus · preco: item na loja (×3,75
// por raridade depois do lendário — D12)
export const RARIDADES = {
  comum:      { mult: 1.00, item: 2,   preco: 14 },
  incomum:    { mult: 1.25, item: 5,   preco: 55 },
  raro:       { mult: 1.60, item: 9,   preco: 200 },
  epico:      { mult: 2.10, item: 15,  preco: 760 },
  lendario:   { mult: 2.80, item: 25,  preco: 2850 },
  mitico:     { mult: 3.80, item: 40,  preco: 10700 },
  celestial:  { mult: 5.10, item: 64,  preco: 40000 },
  divino:     { mult: 6.90, item: 102, preco: 150000 },
  primordial: { mult: 9.30, item: 164, preco: 563000 },
  supremo:    { mult: 12.6, item: 262, preco: 2110000 },
};
export const ORDEM = Object.keys(RARIDADES);
export const difDaRaridade = (r) => ORDEM.indexOf(r) + 1;
// Item único (missão especial, chefe): ×1,2 no que ele dá.
export const UNICO = 1.2;
// Duas mãos (D14): as mãos somam 1,0 — duas mãos = 1,0; uma mão = 0,6 na
// principal; na secundária qualquer item rende 0,4.
export const PESO_SLOT = { duas_maos: 1.0, uma_mao: 0.6, secundaria: 0.4, armadura: 0.85, capacete: 0.7, acessorio: 0.55 };
// Moldes (frações do orçamento). Armas e armaduras não dão mais atributo (v4) —
// os moldes delas só servem para o preço; os acessórios continuam dando atributo.
export const MOLDES = {
  branca_2m:   { slot: "duas_maos",  tipo: "branca", bonus: { forca: 0.57, destreza: 0.29, agilidade: 0.14 } },
  branca_1m:   { slot: "uma_mao",    tipo: "branca", bonus: { forca: 0.6, destreza: 0.25, agilidade: 0.15 } },
  fogo_2m:     { slot: "duas_maos",  tipo: "fogo",   bonus: { forca: 0.5, destreza: 0.4, agilidade: 0.1 } },
  fogo_1m:     { slot: "uma_mao",    tipo: "fogo",   bonus: { forca: 0.45, destreza: 0.45, agilidade: 0.1 } },
  magica_2m:   { slot: "duas_maos",  tipo: "magica", bonus: { inteligencia: 0.67, mana: 0.33 } },
  magica_1m:   { slot: "uma_mao",    tipo: "magica", bonus: { inteligencia: 0.6, mana: 0.3, destreza: 0.1 } },
  escudo:      { slot: "secundaria", tipo: "escudo", bonus: { resistencia: 0.6, vida: 0.4 } },
  foco:        { slot: "secundaria", tipo: "foco",   bonus: { inteligencia: 0.4, mana: 0.6 } },
  capacete:    { slot: "capacete",   bonus: { resistencia: 0.47, vida: 0.35, forca: 0.18 } },
  armadura:    { slot: "armadura",   bonus: { resistencia: 0.67, vida: 0.33 } },
  acess_sorte: { slot: "acessorio",  bonus: { sorte: 0.57, carisma: 0.43 } },
  acess_vigor: { slot: "acessorio",  bonus: { vida: 0.5, resistencia: 0.25, mana: 0.25 } },
  // (acessório de mobilidade — o Boostpack Reserva do Tryce)
  acess_mobilidade: { slot: "acessorio", bonus: { agilidade: 0.67, destreza: 0.33 } },
};
export function precoDoSlot(raridade, pesoSlot) {
  return Math.round(RARIDADES[raridade].preco * (0.85 + 0.15 * Math.min(1, pesoSlot)) / 5) * 5;
}
export function itemGenerico(molde, raridade, mult = 1) {
  const m = MOLDES[molde], R = RARIDADES[raridade];
  const pts = R.item * PESO_SLOT[m.slot] * mult;
  const bonus = {};
  for (const [k, f] of Object.entries(m.bonus)) bonus[k] = Math.max(1, Math.round(pts * f));
  return { slot: m.slot, tipo: m.tipo, bonus, pts: r2(pts), preco: precoDoSlot(raridade, PESO_SLOT[m.slot]) };
}

// ── 3. Magias do grimório (10 de ataque + 10 de suporte) ─────────────────────
export const GRIMORIO = [
  ["m_faisca","Faísca","ataque",1,0.15,"comum"],["m_escudo","Escudo Menor","suporte",1,0.18,"comum"],
  ["m_flecha_igneca","Flecha Ígnea","ataque",2,0.28,"incomum"],["m_cura","Cura","suporte",2,0.30,"incomum"],
  ["m_lanca_gelo","Lança de Gelo","ataque",3,0.42,"raro"],["m_barreira","Barreira Arcana","suporte",3,0.45,"raro"],
  ["m_tempestade","Tempestade","ataque",5,0.62,"epico"],["m_regeneracao","Regeneração","suporte",5,0.65,"epico"],
  ["m_juizo","Juízo Final","ataque",8,0.85,"lendario"],["m_intervencao","Intervenção Divina","suporte",8,0.88,"lendario"],
  ["m_cometa","Chuva de Cometas","ataque",12,1.10,"mitico"],["m_egide","Égide Planetária","suporte",12,1.13,"mitico"],
  ["m_supernova","Supernova","ataque",17,1.38,"celestial"],["m_nebulosa","Véu da Nebulosa","suporte",17,1.42,"celestial"],
  ["m_colapso","Colapso Galáctico","ataque",23,1.68,"divino"],["m_eternidade","Eternidade","suporte",23,1.73,"divino"],
  ["m_ruptura","Ruptura entre Mundos","ataque",30,2.00,"primordial"],["m_ancora","Âncora da Realidade","suporte",30,2.06,"primordial"],
  ["m_verbo","Verbo Primeiro","ataque",38,2.35,"supremo"],["m_fim","Fim das Narrativas","suporte",38,2.42,"supremo"],
].map(([id, nome, tipo, custo, poder, raridade]) => {
  const f = FAIXAS[ORDEM.indexOf(raridade)];
  // Preço: os de antes ficam; os novos sobem ×3,75 por raridade a partir do lendário (D12).
  const HOJE = { comum: [150, 180], incomum: [500, 550], raro: [1400, 1500], epico: [4200, 4500], lendario: [14000, 15000] };
  const k = ORDEM.indexOf(raridade);
  const preco = HOJE[raridade] ? HOJE[raridade][tipo === "ataque" ? 0 : 1] : Math.round(HOJE.lendario[tipo === "ataque" ? 0 : 1] * Math.pow(3.75, k - 4) / 1000) * 1000;
  // D10 (8 out): sem nível mínimo — Inteligência ≥ 5 × dificuldade − 4 (1, 6, 11 … 46).
  const reqAtr = "inteligencia", req = 5 * (k + 1) - 4;
  return { id, nome, tipo, custo, poder, raridade, nivelMin: f.niveis[0], reqAtr, req, preco };
});
// Magias custam mana: entram da mais forte para a mais fraca, enquanto a mana durar.
export function magiasAtivas(todas, manaTotal) {
  let livre = Math.max(0, manaTotal ?? 0);
  const usadas = [];
  for (const m of [...todas].sort((a, b) => b.poder - a.poder)) {
    if (livre >= m.custo) { livre -= m.custo; usadas.push(m); }
  }
  return { usadas, manaLivre: livre, manaGasta: Math.max(0, (manaTotal ?? 0) - livre) };
}
export const podeUsarMagia = (m, attr) => !m.reqAtr || (attr?.[m.reqAtr] ?? 0) >= (m.req ?? 0);

// ── 4. Companheiros (D2, D23) ─────────────────────────────────────────────────
// Companheiro não usa equipamento: o kit da classe entra no ganho por nível,
// calibrado (modo "calibrar-kit") para que, na média das composições, o jogador
// faça ~34% da party e cada companheiro ~33%.
export const CLASSES = {
  combatente: { rotulo: "Combatente", rotuloEN: "Fighter", emoji: "⚔️", desc: "dano físico", descEN: "physical damage",
    ganho: { forca: 3, vida: 2, destreza: 1, resistencia: 1 },
    magia: { nome: "Golpe Certeiro", tipo: "ataque", custo: 2, poder: 0.35 } },
  tank: { rotulo: "Tank", rotuloEN: "Tank", emoji: "🛡️", desc: "resistência", descEN: "toughness",
    ganho: { resistencia: 3, vida: 3, agilidade: 1 },
    magia: { nome: "Muralha", tipo: "suporte", custo: 2, poder: 0.40 } },
  mago: { rotulo: "Mago", rotuloEN: "Mage", emoji: "🔮", desc: "dano mágico", descEN: "magic damage",
    ganho: { inteligencia: 3, mana: 2, destreza: 1 },
    magia: { nome: "Lança Arcana", tipo: "ataque", custo: 3, poder: 0.45 } },
  suporte: { rotulo: "Suporte", rotuloEN: "Support", emoji: "✨", desc: "sorte e carisma", descEN: "luck and charisma",
    ganho: { sorte: 2, carisma: 2, mana: 1, vida: 1 },
    magia: { nome: "Bênção", tipo: "suporte", custo: 2, poder: 0.30 } },
};
export const KIT = { combatente: 4.37, mago: 11.32, tank: 7.77, suporte: 9.44 };
export function atributosCompanheiro(classe, raridade, nivel) {
  const cls = CLASSES[classe], mult = RARIDADES[raridade].mult * KIT[classe], n = Math.max(1, nivel);
  const a = Object.fromEntries(ATR.map((k) => [k, 0]));
  for (const [k, v] of Object.entries(cls.ganho)) a[k] = Math.round(v * n * mult);
  a.vida = Math.max(a.vida, Math.round(2 * n * mult));
  a.carisma = Math.max(a.carisma, 1);
  return a;
}
export const magiaCompanheiro = (classe, raridade) => ({ ...CLASSES[classe].magia, poder: r2(CLASSES[classe].magia.poder * RARIDADES[raridade].mult) });
export function orcamentoDaClasse(classe) {
  const g = CLASSES[classe].ganho;
  return ATR.reduce((t, a) => t + (a === "vida" ? Math.max(g.vida ?? 0, 2) : (g[a] ?? 0)), 0);
}
const GRUPOS = { combatente: ["forca","destreza"], mago: ["inteligencia","mana"], tank: ["resistencia","vida"], suporte: ["sorte","carisma"] };
// Personagem com nome: orçamento do genérico da MESMA classe × raridade × kit ×
// destaque; o piso de Vida sai antes; o resto vai pelas estrelas (peso = estrelas²).
export function fichaPersonagem(tier, estrelas, nivel, classeForcada = null, bonus = 1) {
  const f = faixaDoTier(tier); if (!f) return null;
  const mult = RARIDADES[f.raridade].mult;
  const peso = Object.fromEntries(Object.entries(estrelas).map(([k, v]) => [k, v * v]));
  const total = Object.values(peso).reduce((a, b) => a + b, 0);
  const classe = classeForcada ?? Object.entries(GRUPOS).map(([c, g]) => [c, g.reduce((s, a) => s + (estrelas[a] ?? 0), 0)]).sort((a, b) => b[1] - a[1])[0][0];
  const porNivel = orcamentoDaClasse(classe) * mult * KIT[classe] * f.destaque * bonus, piso = 2 * mult * KIT[classe], resto = porNivel - piso;
  const attr = Object.fromEntries(ATR.map((a) => [a, Math.round(resto * nivel * (peso[a] ?? 0) / total)]));
  attr.vida += Math.round(piso * nivel); attr.carisma = Math.max(attr.carisma, 1);
  const mg = magiaCompanheiro(classe, f.raridade);
  return { faixa: f, mult, porNivel, classe, magia: { ...mg, poder: r2(mg.poder * f.destaque * bonus) }, attr, soma: ATR.reduce((s, a) => s + attr[a], 0) };
}

// ── 5. Resiliência (D1: soma efetiva) ─────────────────────────────────────────
export function somaEfetiva(a) { const f = (x) => 1 + (x ?? 0) / 12; return 36 * (Math.cbrt(f(a.vida) * f(a.resistencia) * f(a.agilidade)) - 1); }

// ── 5b. Combate v4: armas com dano próprio e escala (D14, D20, D27) ──────────
export const LETRA = { E: 0.15, D: 0.35, C: 0.6, B: 0.9, A: 1.25, S: 1.6 };
// porte: base = fração do dano; for = requisito de Força em UMA mão, × dificuldade
export const PORTE = { leve: { base: 0.5, for: 2 }, medio: { base: 0.6, for: 4 }, pesado: { base: 1.0, for: 7 }, colossal: { base: 1.15, for: 12 } };
export const PESO_DEF = { armadura: 0.85, capacete: 0.7, escudo: 1.0 };
export const ARMA_UNICA = { bonus: 0.8, duasMaos: true };
export const ESCUDO = { reforco: 0.10 };
export const curvaEscala = (x, R) => x / (x + 2 * R);          // retorno decrescente, sem teto
export const precisao = (d) => 0.7 + 0.3 * d / (d + 10);
export const PENALIDADE = 0.4;                                   // abaixo do requisito: rende 40%
// arma: { porte, tipo, esc: { forca: "B" }, reqFor, reqDes, reqInt (× dificuldade),
//         req: { for1, des, int } (absoluto — conteúdo das obras), base (traço), mult (único) }
export function statsArma(arma, raridade) {
  const b = ORDEM.indexOf(raridade) + 1, P = PORTE[arma.porte];
  const reqFor1 = arma.req ? Math.max(1, arma.req.for1 ?? 1) : Math.max(1, Math.ceil(P.for * b * (arma.reqFor ?? 1)));
  return { b, dano: Math.round(8 * RARIDADES[raridade].item * P.base * (arma.base ?? 1) * (arma.mult ?? 1)),
    reqFor1, reqFor2: Math.ceil(reqFor1 / 2),
    reqDes: arma.req ? (arma.req.des ?? 0) : Math.ceil((arma.reqDes ?? 0) * b),
    reqInt: arma.req ? (arma.req.int ?? 0) : Math.ceil((arma.reqInt ?? 0) * b) };
}
// modo "1m" (uma mão) ou "2m" (as duas mãos na mesma arma: Força ×1,5 na escala
// e o requisito de Força cai à metade).
export function ataqueArma(arma, raridade, m, modo = "1m") {
  const st = statsArma(arma, raridade);
  const forEf = (m.forca ?? 0) * (modo === "2m" ? 1.5 : 1);
  const reqF = modo === "2m" ? st.reqFor2 : st.reqFor1;
  const ok = forEf >= reqF && (m.destreza ?? 0) >= st.reqDes && (m.inteligencia ?? 0) >= st.reqInt;
  let esc = 0;
  for (const [a, L] of Object.entries(arma.esc ?? {})) {
    const x = a === "forca" ? forEf : (m[a] ?? 0);
    const R = Math.max(1, ({ forca: reqF, destreza: st.reqDes, inteligencia: st.reqInt })[a] || 3 * st.b);
    esc += LETRA[L] * curvaEscala(x, R);
  }
  return { ...st, ar: st.dano * (ok ? 1 : PENALIDADE) * (1 + esc), ok };
}
export const defesaItem = (tipo, raridade, mult = 1) => Math.round(8 * RARIDADES[raridade].item * PESO_DEF[tipo] * mult);
// Armas genéricas por molde (o catálogo usa os mesmos moldes)
export const ARMAS = {
  branca_leve:   { porte: "leve",   tipo: "branca", esc: { forca: "D", destreza: "B" }, reqDes: 3 },
  branca_media:  { porte: "medio",  tipo: "branca", esc: { forca: "C", destreza: "C" }, reqDes: 2 },
  branca_pesada: { porte: "pesado", tipo: "branca", esc: { forca: "B", destreza: "D" }, reqDes: 1 },
  impacto:       { porte: "pesado", tipo: "branca", esc: { forca: "A" }, reqDes: 1 },
  fogo_leve:     { porte: "leve",   tipo: "fogo",   esc: { destreza: "B", forca: "E" }, reqDes: 3, reqFor: 0.5 },
  fogo_pesada:   { porte: "pesado", tipo: "fogo",   esc: { destreza: "A", forca: "E" }, reqDes: 4, reqFor: 0.5 },
  magica_leve:   { porte: "leve",   tipo: "magica", esc: { inteligencia: "B", destreza: "E" }, reqInt: 3, reqFor: 0.5 },
  magica_pesada: { porte: "pesado", tipo: "magica", esc: { inteligencia: "A" }, reqInt: 4, reqFor: 0.4 },
  arma_forca:    { porte: "medio",  tipo: "branca", esc: { forca: "D", inteligencia: "S" }, reqDes: 1, reqInt: 4 },
};
ARMAS.foco = ARMAS.magica_leve;   // o foco é uma arma mágica leve na mão secundária (tira o bônus de arma única)
// Peso do slot de cada molde de arma, para o preço
export const SLOT_DA_ARMA = { branca_leve: "uma_mao", branca_media: "uma_mao", branca_pesada: "duas_maos", impacto: "duas_maos",
  fogo_leve: "uma_mao", fogo_pesada: "duas_maos", magica_leve: "uma_mao", magica_pesada: "duas_maos", arma_forca: "uma_mao", foco: "secundaria" };
export const PORTE_SLOT = { leve: "uma_mao", medio: "uma_mao", pesado: "duas_maos", colossal: "duas_maos" };

// ── 5c. Bioware e cyberware (D23, D25) — 3 + 3 vagas, só no jogador ─────────
export const COR_BIO = {
  rubro:   { atr: "forca",        tipo: "melee",  emoji: "🔴", rotulo: "rubro", rotuloEN: "crimson" },
  ambar:   { atr: "destreza",     tipo: "ranged", emoji: "🟡", rotulo: "âmbar", rotuloEN: "amber" },
  ceruleo: { atr: "inteligencia", tipo: "magia",  emoji: "🔵", rotulo: "cerúleo", rotuloEN: "cerulean" },
  verde:   { atr: "vida",         tipo: "defesa", emoji: "🟢", rotulo: "verde", rotuloEN: "green" },
};
export const IMPLANTES = {
  c_lamina:      { fam: "ciber", regiao: "bracos",       papel: "ofensivo",  alvo: "melee" },
  c_lancador:    { fam: "ciber", regiao: "bracos",       papel: "ofensivo",  alvo: "ranged" },
  c_deck:        { fam: "ciber", regiao: "sistema",      papel: "ofensivo",  alvo: "magia" },
  c_sandevistan: { fam: "ciber", regiao: "sistema",      papel: "reforco",   alvo: "ataque" },
  c_esqueleto:   { fam: "ciber", regiao: "esqueleto",    papel: "defensivo" },
  c_pele:        { fam: "ciber", regiao: "pele",         papel: "defensivo" },
  c_reflexos:    { fam: "ciber", regiao: "nervoso",      papel: "reforco",   alvo: "defesa" },
  c_pernas:      { fam: "ciber", regiao: "pernas",       papel: "reforco",   alvo: "melee" },
  c_optico:      { fam: "ciber", regiao: "olhos",        papel: "reforco",   alvo: "ranged" },
  c_cortex:      { fam: "ciber", regiao: "cortex",       papel: "reforco",   alvo: "magia" },
  c_coracao:     { fam: "ciber", regiao: "circulatorio", papel: "reforco",   alvo: "defesa" },
  c_int:         { fam: "ciber", regiao: "cortex",       papel: "atributo",  atr: ["inteligencia"] },
  c_for:         { fam: "ciber", regiao: "musculos",     papel: "atributo",  atr: ["forca"] },
  c_des:         { fam: "ciber", regiao: "maos",         papel: "atributo",  atr: ["destreza"] },
  c_vida:        { fam: "ciber", regiao: "imunologico",  papel: "atributo",  atr: ["vida", "resistencia"] },
  b_rubro_of:    { fam: "bio", cor: "rubro",   papel: "ofensivo" },
  b_ambar_of:    { fam: "bio", cor: "ambar",   papel: "ofensivo" },
  b_ceruleo_of:  { fam: "bio", cor: "ceruleo", papel: "ofensivo" },
  b_verde_def:   { fam: "bio", cor: "verde",   papel: "defensivo" },
  b_rubro_mut:   { fam: "bio", cor: "rubro",   papel: "reforco" },
  b_ambar_mut:   { fam: "bio", cor: "ambar",   papel: "reforco" },
  b_ceruleo_mut: { fam: "bio", cor: "ceruleo", papel: "reforco" },
  b_verde_mut:   { fam: "bio", cor: "verde",   papel: "reforco" },
  b_rubro_atr:   { fam: "bio", cor: "rubro",   papel: "atributo" },
  b_ambar_atr:   { fam: "bio", cor: "ambar",   papel: "atributo" },
  b_ceruleo_atr: { fam: "bio", cor: "ceruleo", papel: "atributo" },
  b_verde_atr:   { fam: "bio", cor: "verde",   papel: "atributo" },
};
export const REGIOES = { bracos: ["braços", "arms"], sistema: ["sistema", "operating system"], esqueleto: ["esqueleto", "skeleton"], pele: ["pele", "skin"],
  nervoso: ["sistema nervoso", "nervous system"], pernas: ["pernas", "legs"], olhos: ["olhos", "eyes"], cortex: ["córtex", "cortex"],
  circulatorio: ["circulatório", "circulatory"], musculos: ["músculos", "muscles"], maos: ["mãos", "hands"], imunologico: ["imunológico", "immune"] };
export const ATR_DA_COR = { rubro: ["forca"], ambar: ["destreza"], ceruleo: ["inteligencia"], verde: ["vida", "resistencia"] };
export const IMPL = { potencia: 4, reforco: (b) => 0.04 + 0.008 * b, atributo: 1.0, bio: 0.7, escBio: LETRA.B, resson: 0.25, req: 5 };
// Um implante equipado: { id: <base em IMPLANTES>, raridade, mult (único: 1,2) }
export function efeitosImplantes(mb) {
  const a = mb.attr, lista = mb.implantes ?? [];
  const fontes = [], mult = { melee: 0, ranged: 0, magia: 0, ataque: 0, defesa: 0 }, extra = {};
  let def = 0;
  const porCor = {};
  for (const i of lista) { const d = IMPLANTES[i.id]; if (d?.fam === "bio") porCor[d.cor] = (porCor[d.cor] ?? 0) + 1; }
  for (const i of lista) {
    const d = IMPLANTES[i.id]; if (!d) continue;
    const b = ORDEM.indexOf(i.raridade) + 1, orc = RARIDADES[i.raridade].item * (i.mult ?? 1);
    const req = IMPL.req * b, ok = (d.fam === "ciber" ? (a.resistencia ?? 0) : (a.vida ?? 0)) >= req, pen = ok ? 1 : PENALIDADE;
    let k = 1, alvo = d.alvo;
    if (d.fam === "bio") { const c = COR_BIO[d.cor]; alvo = c.tipo;
      k = IMPL.bio * (1 + IMPL.escBio * curvaEscala(a[c.atr] ?? 0, req)) * (1 + IMPL.resson * (porCor[d.cor] - 1)); }
    if (d.papel === "ofensivo") fontes.push({ tipo: alvo, ar: IMPL.potencia * orc * k * pen });
    else if (d.papel === "defensivo") def += IMPL.potencia * orc * k * pen;
    else if (d.papel === "atributo") { const atrs = d.atr ?? ATR_DA_COR[d.cor], pts = IMPL.atributo * orc * k * pen;
      for (const x of atrs) extra[x] = (extra[x] ?? 0) + Math.max(1, Math.round(pts / atrs.length)); }
    else mult[alvo] += IMPL.reforco(b) * (i.mult ?? 1) * k * pen;
  }
  return { fontes, def, mult, extra };
}
// Atributos efetivos = os do membro + os dos implantes de atributo (os requisitos
// dos implantes olham os atributos sem implante, para não haver círculo).
export const attrEf = (mb) => { const e = efeitosImplantes(mb).extra; if (!Object.keys(e).length) return mb.attr; const a = { ...mb.attr }; for (const k in e) a[k] = (a[k] ?? 0) + e[k]; return a; };

// ── Membro da party ─────────────────────────────────────────────────────────
// membro: { attr, nivel, maos: [{ arma, raridade, modo }], defesa: [{ tipo, raridade, mult }], implantes: [...] }
export function poderMembro(mb) { const p = partesMembro(mb); return p.melee + p.ranged + p.magia; }
export function defesaMembro(mb) {
  const ef = efeitosImplantes(mb);
  const def = (mb.defesa ?? []).reduce((s, d) => s + (d.valor ?? defesaItem(d.tipo, d.raridade, d.mult ?? 1)), 0) + ef.def;
  const esc = (mb.defesa ?? []).some((d) => d.tipo === "escudo") ? ESCUDO.reforco : 0;
  return (def + 0.6 * somaEfetiva(attrEf(mb))) * (1 + mb.nivel / 100) * (1 + ef.mult.defesa + esc);
}
// ── Sinergia (D22): bônus por misturar corpo a corpo, à distância e mágico ──
export const TIPO_DANO = { branca: "melee", fogo: "ranged", magica: "magia" };
export const SINERGIA = { base: 0.25, limiar: 0.10 };
export function partesMembro(mb) {
  const ef = efeitosImplantes(mb), a = attrEf(mb), k = precisao(a.destreza ?? 0) * (1 + mb.nivel / 100);
  const o = { melee: a.forca ?? 0, ranged: 0, magia: 0.7 * (a.inteligencia ?? 0) };
  // Arma única (D27): uma arma só — numa mão, nas duas, ou com escudo — rende +80%.
  const unica = (mb.maos ?? []).length === 1 && (ARMA_UNICA.duasMaos || mb.maos[0].modo !== "2m") ? 1 + ARMA_UNICA.bonus : 1;
  const o0 = { ...o };
  for (const h of mb.maos ?? []) {
    const st = statsArma(h.arma, h.raridade), at = ataqueArma(h.arma, h.raridade, a, h.modo), pen = at.ok ? 1 : PENALIDADE;
    const forEf = (a.forca ?? 0) * (h.modo === "2m" ? 1.5 : 1), reqF = h.modo === "2m" ? st.reqFor2 : st.reqFor1;
    o[TIPO_DANO[h.arma.tipo]] += st.dano * pen;
    for (const [atr, L] of Object.entries(h.arma.esc ?? {})) {
      const x = atr === "forca" ? forEf : (a[atr] ?? 0);
      const R = Math.max(1, ({ forca: reqF, destreza: st.reqDes, inteligencia: st.reqInt })[atr] || 3 * st.b);
      const t = atr === "inteligencia" ? "magia" : atr === "forca" ? "melee" : (h.arma.tipo === "fogo" ? "ranged" : TIPO_DANO[h.arma.tipo]);
      o[t] += st.dano * pen * LETRA[L] * curvaEscala(x, R);
    }
  }
  if (unica !== 1) for (const t in o) o[t] = o0[t] + (o[t] - o0[t]) * unica;
  for (const f of ef.fontes) o[f.tipo] += f.ar;   // implante ofensivo: fonte de dano do tipo dele
  for (const t in o) o[t] *= k * (1 + ef.mult[t] + ef.mult.ataque);   // reforços
  return o;
}
// Sem teto (8 out): 25% × diversidade² × (1 + ln(fontes/3)).
export function sinergia(membros) {
  const tot = { melee: 0, ranged: 0, magia: 0 };
  let fontes = 0;
  for (const mb of membros) { const p = partesMembro(mb), s = p.melee + p.ranged + p.magia;
    for (const t in tot) { tot[t] += p[t]; if (s > 0 && p[t] / s >= SINERGIA.limiar) fontes++; } }
  const S = tot.melee + tot.ranged + tot.magia || 1, s = Object.values(tot).map((x) => x / S);
  const D = Math.max(0, (1 - s.reduce((q, x) => q + x * x, 0)) / (2 / 3));
  const mult = 1 + Math.log(Math.max(1, fontes / 3));
  return { partes: s, D, fontes, mult, bonus: SINERGIA.base * D * D * mult };
}
// As missões são calibradas SEM o bônus de sinergia: ela é vantagem por cima.
export function poderParty(membros, magias = [], { comSinergia = false } = {}) {
  const bonus = magias.filter((m) => m.tipo === "ataque").reduce((s, m) => s + m.poder, 0);
  const sg = comSinergia ? sinergia(membros).bonus : 0;
  return (soma(membros, poderMembro) + 0.3 * soma(membros, (m) => attrEf(m).carisma ?? 0)) * (1 + bonus) * (1 + sg);
}
export function resilParty(membros, magias = []) {
  const bonus = magias.filter((m) => m.tipo === "suporte").reduce((s, m) => s + m.poder, 0);
  return (3 + soma(membros, defesaMembro) + 0.6 * soma(membros, (m) => attrEf(m).sorte ?? 0)) * (1 + bonus);
}
// Cada membro a mais na party (companheiro ou jogador do co-op) pesa 18%.
export const escalaPorParty = (tamanho) => 1 + 0.18 * Math.max(0, tamanho);
// Carisma do jogador amplifica o que os companheiros dele trazem.
export const buffCarisma = (carisma) => 1 + 0.05 * Math.sqrt(Math.max(0, carisma ?? 0));

// ── 6. Pontos do jogador e a party de referência ─────────────────────────────
// Pontos por nível: 1 + 0,25 × √(Int + Sorte); a base de todos os atributos
// sobe 1 a cada 2 níveis.
export const pontosPorNivel = (int, sorte) => 1 + 0.25 * Math.sqrt(Math.max(0, (int ?? 0) + (sorte ?? 0)));
export const baseDoNivel = (nivel) => Math.floor((Math.max(1, nivel) - 1) / 2);
// Jogador da referência: 50% Força / 20% Resistência / 15% Vida / resto Mana,
// montante (branca pesada) nas duas mãos, cabeça e corpo da raridade da faixa,
// 1 acessório de sorte e 2 de vigor, seis implantes; combatente + tank no nível
// do dono; magias que a Inteligência libera, até onde a Mana paga.
export const IMPLANTES_REF = ["c_lamina", "c_esqueleto", "c_reflexos", "b_rubro_of", "b_rubro_mut", "b_verde_def"];
export function pontosAte(n) { const base = 1 + Math.floor((n - 1) / 2); let pts = 0; for (let k = 2; k <= n; k++) pts += 1 + 0.25 * Math.sqrt(2 * base); return { base, pts: Math.floor(pts) }; }
export function party(n, { companheiros = 2, raridade = null, arma = "branca_pesada", modo = "2m", implantes = IMPLANTES_REF } = {}) {
  const base = 1 + Math.floor((n - 1) / 2);
  const p = Object.fromEntries(ATR.map((a) => [a, base]));
  let pts = 0; for (let k = 2; k <= n; k++) pts += 1 + 0.25 * Math.sqrt(2 * base);
  pts = Math.floor(pts);
  const f = Math.round(pts * .5), r = Math.round(pts * .2), v = Math.round(pts * .15);
  p.forca += f; p.resistencia += r; p.vida += v; p.mana += pts - f - r - v;
  const rar = raridade ?? faixaDoNivel(n).raridade;
  for (const m of ["acess_sorte", "acess_vigor", "acess_vigor"])
    for (const [k, x] of Object.entries(itemGenerico(m, rar).bonus)) p[k] += x;
  const jogador = { attr: p, nivel: n, maos: [{ arma: ARMAS[arma], raridade: rar, modo }], defesa: [{ tipo: "capacete", raridade: rar }, { tipo: "armadura", raridade: rar }],
    implantes: (implantes ?? []).map((id) => ({ id, raridade: rar })) };
  const membros = [jogador], mags = [];
  const buff = buffCarisma(p.carisma);
  for (const c of ["combatente", "tank"].slice(0, companheiros)) {
    const at = atributosCompanheiro(c, rar, n);
    membros.push({ attr: Object.fromEntries(ATR.map((a) => [a, Math.round(at[a] * buff)])), nivel: n, classe: c });
    mags.push(magiaCompanheiro(c, rar));
  }
  const manaTotal = soma(membros, (m) => attrEf(m).mana ?? 0);
  const aj = attrEf(jogador);
  for (const m of GRIMORIO) if ((aj[m.reqAtr] ?? 0) >= m.req) mags.push(m);
  const { usadas } = magiasAtivas(mags, manaTotal);
  return { membros, magias: usadas, tam: companheiros, attr: Object.fromEntries(ATR.map((a) => [a, soma(membros, (m) => m.attr[a] ?? 0)])) };
}
export function ref(n, o) { const r = party(n, o); return { ...r, poder: poderParty(r.membros, r.magias), resil: resilParty(r.membros, r.magias) }; }
const _memo = new Map();
const refMemo = (n) => { if (!_memo.has(n)) _memo.set(n, ref(n)); return _memo.get(n); };
export function curvas() { return { poder: { f: (n) => refMemo(n).poder }, resil: { f: (n) => refMemo(n).resil } }; }

// ── 7. Missões e chefes ───────────────────────────────────────────────────────
// Toda missão é justa no próprio nível: 40% de êxito e 70% de sobrevivência
// para a party de referência daquele nível. Especial: 30/60. Chefe: 35/60 com
// 4 jogadores.
export const ESC2 = escalaPorParty(2);
export const MISSAO = { exito: .40, sobrev: .70, xp: 40, espera: 45, exitoVale: 0.8 };
export const BASE = { normal: { exito: .40, sobrev: .70 }, especial: { exito: .30, sobrev: .60 }, chefe: { exito: .35, sobrev: .60 } };
const _missao = new Map();
export function missao(nivel, base = BASE.normal) {
  const n = Math.max(1, Math.round(nivel)), k = `${n}:${base.exito}:${base.sobrev}`;
  if (!_missao.has(k)) {
    const c = curvas();
    _missao.set(k, { nivel: n, dificuldade: faixaDoNivel(n).n, poder: Math.round(c.poder.f(n) * (1 / base.exito - 1) / ESC2), risco: Math.round(c.resil.f(n) * (1 / base.sobrev - 1) / ESC2) });
  }
  return _missao.get(k);
}
// D6 (8 out): a missão paga a força dela, igual para todos.
//   XP da missão = o poder dela · custo do nível n = o poder de uma missão do
//   nível n ÷ 0,80 → no seu nível, um êxito = 80% de um nível · falhar não paga nada.
export const custoForca = (n) => missao(n).poder / MISSAO.exitoVale;
export function recompensa(nj, poderMissao) {
  const r = poderMissao / missao(nj).poder;
  return { r, mult: r, nivel: MISSAO.exitoVale * r };
}
export const fatorTentativa = (ex) => ex;
// soma XP (pontos de força) ao progresso (0 a 1) do nível
export function subirForca(nivel, progresso, xp, teto = 1000) { let n = nivel, x = xp + progresso * custoForca(n);
  while (x >= custoForca(n) && n < teto) { x -= custoForca(n); n++; } return { nivel: n, progresso: Math.min(0.999999, x / custoForca(n)) }; }
// Loot: relativo à raridade da faixa (b); b+1 e b+2 sobem com a posição na faixa.
export function loot(nivel) {
  const f = faixaDoNivel(nivel), pos = Math.min(9, nivel - f.niveis[0]), i = f.n - 1;
  const t = [[-1, .25], [0, .38], [1, .06 + .01 * pos], [2, pos >= 7 ? .01 * (pos - 6) : 0]];
  const out = {};
  for (const [d, c] of t) { if (!c || i + d > 9) continue; const r = ORDEM[Math.max(0, i + d)]; out[r] = r2((out[r] ?? 0) + c); }
  return out;
}
export function sortearLoot(nivel, aleatorio = Math.random) {
  let x = aleatorio();
  for (const [rar, c] of Object.entries(loot(nivel))) { if (x < c) return rar; x -= c; }
  return null;
}
// Chefe: 35% com 4 jogadores do nível (co-op), ~10% sozinho.
const _chefe = new Map();
export function chefeDungeon(nivel) {
  const n = Math.max(1, Math.round(nivel));
  if (_chefe.has(n)) return _chefe.get(n);
  const grupo = (k) => {
    const ps = Array.from({ length: k }, () => party(n));
    const membros = ps.flatMap((x) => x.membros), mags = ps.flatMap((x) => x.magias);
    return { poder: poderParty(membros, mags), resil: resilParty(membros, mags), esc: escalaPorParty((k - 1) + 2 * k) };
  };
  const g4 = grupo(4);
  const poder = g4.poder * (1 / .35 - 1) / g4.esc, risco = g4.resil * (1 / .60 - 1) / g4.esc;
  const ch = (k) => { const g = grupo(k); return [g.poder / (g.poder + poder * g.esc), g.resil / (g.resil + risco * g.esc)]; };
  const out = { nivel: n, dificuldade: faixaDoNivel(n).n, poder: Math.round(poder), risco: Math.round(risco), chances: [1, 2, 3, 4].map(ch) };
  _chefe.set(n, out);
  return out;
}

// ── Folga pela força (D26) e perigo ───────────────────────────────────────────
// Toda missão é feita para uma força: o poder e o risco dela dão a chance-base
// para quem tem exatamente essa força. q = a SUA força ÷ essa força; acima de
// 1, fecha (q − 1)/2 do que falta para 100%; com 3×, garantido. Nunca pelo nível.
export const FOLGA = { garantida: 3 };
export function chanceComFolga(meu, exigidoX, base) {
  if (exigidoX <= 0) return 1;
  const c = meu / (meu + exigidoX);
  const q = (meu / exigidoX) / (base / (1 - base));
  const f = Math.min(1, Math.max(0, (q - 1) / (FOLGA.garantida - 1)));
  return c + (1 - c) * f;
}
// perigo da missão: baixo (colher, entregar, investigar), normal, alto
export const PERIGO = { baixo: { risco: 0.25, recompensa: 0.92 }, normal: { risco: 1, recompensa: 1 }, alto: { risco: 1.5, recompensa: 1.03 } };

// Previsão de uma luta: poder e resiliência da party contra os números da missão.
//   alvo: { poder, risco, base: BASE.x, perigo }
export function preverLuta(membros, magias, alvo) {
  const P = poderParty(membros, magias, { comSinergia: true }), R = resilParty(membros, magias);
  const esc = escalaPorParty(membros.length - 1);
  const pg = PERIGO[alvo.perigo ?? "normal"] ?? PERIGO.normal, base = alvo.base ?? BASE.normal;
  const exP = (alvo.poder ?? 0) * esc, exR = (alvo.risco ?? 0) * pg.risco * esc;
  return { poder: P, resil: R, escala: esc, exigidoPoder: exP, exigidoRisco: exR, sinergia: sinergia(membros),
    exito: chanceComFolga(P, exP, base.exito), sobrevivencia: exR > 0 ? chanceComFolga(R, exR, base.sobrev) : 1 };
}
export function resolverLuta(prev, aleatorio = Math.random) {
  const rolagens = { exito: aleatorio(), sobrev: aleatorio() };
  const exito = rolagens.exito < prev.exito;
  const sobreviveu = rolagens.sobrev < prev.sobrevivencia;
  return { exito, sobreviveu, rolagens, desfecho: !sobreviveu ? "caiu" : exito ? "sucesso" : "falha", previsao: prev };
}

// ── 8. Moeda: quem paga e quanto (D8, D12) ───────────────────────────────────
// CONTRATO paga do BANCO (não cria moeda); DUNGEON paga do TESOURO dela, que se
// renova — a única fonte de moeda nova. pago = alvo × f(x), x = estoque ÷ (alvo × K).
export const ECO = { kBanco: 400, kDungeon: 50, valorCristal: 40, fracCristal: 0.25,
  regenPorJogador: 3, capacidade: 1.5, gastoOuro: 0.8, gastoCristal: 0.3, voltaAoBanco: 0.5 };
export const alvoOuro = (n) => 60 * Math.pow(1.141, Math.max(1, n) - 1);
export const alvoCristal = (n) => alvoOuro(n) * ECO.fracCristal / ECO.valorCristal;
export const fEstoque = (x) => 2 * x / (1 + x);
export function pagamento(alvo, estoque, K) { if (!(estoque > 0) || !(alvo > 0)) return 0; const x = estoque / Math.max(1e-9, alvo * K); return Math.min(estoque, alvo * fEstoque(x)); }
export const kDungeon = (ativos) => ECO.kDungeon * (1 + Math.max(0, ativos) / 10);
