// Conteúdo do RPG v4 — lê modulos/game/conteudo/*.json e monta os catálogos
// (itens, companheiros, magias, contratos, especiais, dungeons e chefes) com os
// números das regras (regras.js). O JSON só guarda nome, molde e texto; dano,
// defesa, bônus, preço e a força das missões saem das fórmulas.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "./regras.js";

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), "conteudo");
const ler = (nome) => JSON.parse(fs.readFileSync(path.join(PASTA, nome), "utf8"));

const GEN = ler("genericos.json");
const W40K = ler("wh40k.json");
const IMPL = ler("implantes.json");
const ESP = ler("especiais.json");
const OBRAS = ["skyrim.json", "tokyo-ghoul.json", "bomb-rush.json"].map(ler);
export const HISTORIAS = ler("historias.json");

const rarDaDif = (d) => R.faixaDaDif(d).raridade;
const txt = (x) => (typeof x === "string" ? { pt: x, en: x } : x ?? { pt: "", en: "" });

// ── Itens ────────────────────────────────────────────────────────────────────
// dados.tipo: arma · escudo · defesa · acessorio · implante · contrato · pergaminho
export const ITENS = new Map();
function addItem(it) {
  if (ITENS.has(it.id)) throw new Error(`[RPG] item repetido no conteúdo: ${it.id}`);
  ITENS.set(it.id, it);
}
function itemDe(def, { origem = "generico", obra = null } = {}) {
  const dif = def.dif, raridade = rarDaDif(dif), especial = !!def.especial, mult = especial ? R.UNICO : 1;
  const nome = txt(def.nome), base = { id: def.id, nome: nome.pt, nomeEN: nome.en, raridade, dif, origem, obra: def.obra ?? obra,
    especial, descricao: def.descricao ?? def.lore ?? null, infinito: dif === 1 && !especial };
  let slot, dados, bonus = {}, pesoSlot;
  const molde = def.molde;
  if (def.implante || def.base) {
    const b = def.implante ?? def.base, d = R.IMPLANTES[b];
    if (!d) throw new Error(`[RPG] implante sem base conhecida: ${def.id} (${b})`);
    slot = "implante"; pesoSlot = R.PESO_SLOT.acessorio;
    dados = { tipo: "implante", base: b, familia: d.fam, papel: d.papel, regiao: d.regiao ?? null, cor: d.cor ?? null, mult };
  } else if (def.arma || def.porte) {
    const a = def.arma ?? { porte: def.porte, tipo: def.tipo, esc: def.esc, req: def.req };
    // conteúdo das obras traz o dano da tabela: o traço é o que sobra da fórmula
    if (def.dano && !a.base) a.base = Math.round(def.dano / (8 * R.RARIDADES[raridade].item * R.PORTE[a.porte].base) * 1000) / 1000;
    slot = "mao"; pesoSlot = R.PESO_SLOT[R.PORTE_SLOT[a.porte]];
    dados = { tipo: "arma", arma: { ...a, mult }, mult };
  } else if (molde && R.ARMAS[molde]) {
    slot = "mao"; pesoSlot = R.PESO_SLOT[R.SLOT_DA_ARMA[molde]];
    dados = { tipo: "arma", molde, arma: { ...R.ARMAS[molde], mult }, foco: molde === "foco", mult };
  } else if (molde === "escudo") {
    slot = "mao"; pesoSlot = R.PESO_SLOT.secundaria;
    dados = { tipo: "escudo", mult };
  } else if (molde === "capacete" || molde === "armadura" || def.slot === "armadura" || def.slot === "capacete") {
    const peso = molde ?? def.slot;
    slot = peso; pesoSlot = R.PESO_SLOT[peso];
    dados = { tipo: "defesa", peso, mult };
  } else if ((molde && R.MOLDES[molde]?.slot === "acessorio") || def.slot === "acessorio") {
    slot = "acessorio"; pesoSlot = R.PESO_SLOT.acessorio;
    bonus = def.bonus ?? R.itemGenerico(molde, raridade, mult).bonus;
    dados = { tipo: "acessorio", molde: molde ?? null, mult };
  } else throw new Error(`[RPG] item sem molde reconhecido: ${def.id}`);
  addItem({ ...base, slot, bonus, dados, precoBase: R.precoDoSlot(raridade, pesoSlot) });
}
for (const i of GEN.itens) itemDe(i);
for (const i of IMPL) itemDe(i);
for (const a of W40K.armas) itemDe(a, { origem: "conteudo", obra: W40K.obra });
for (const o of W40K.outros) itemDe(o, { origem: "conteudo", obra: W40K.obra });
for (const o of W40K.itens ?? []) itemDe(o, { origem: "conteudo", obra: W40K.obra });
for (const o of ESP.itens) itemDe(o, { origem: "conteudo" });
for (const ob of OBRAS) for (const o of ob.itens ?? []) itemDe(o, { origem: "conteudo", obra: ob.obra });

// ── Magias (D10: pedem Inteligência, não nível) ─────────────────────────────
const MAGIA_EN = { "Faísca": "Spark", "Flecha Ígnea": "Fire Arrow", "Lança de Gelo": "Ice Lance", "Tempestade": "Storm",
  "Juízo Final": "Final Judgment", "Escudo Menor": "Lesser Shield", "Cura": "Heal", "Barreira Arcana": "Arcane Barrier",
  "Regeneração": "Regeneration", "Intervenção Divina": "Divine Intervention", "Chuva de Cometas": "Comet Rain",
  "Égide Planetária": "Planetary Aegis", "Supernova": "Supernova", "Véu da Nebulosa": "Nebula Veil",
  "Colapso Galáctico": "Galactic Collapse", "Eternidade": "Eternity", "Ruptura entre Mundos": "Rift Between Worlds",
  "Âncora da Realidade": "Reality Anchor", "Verbo Primeiro": "First Word", "Fim das Narrativas": "End of Narratives" };
export const MAGIAS = [
  ...R.GRIMORIO.map((m) => ({ ...m, nomeEN: MAGIA_EN[m.nome] ?? m.nome, unica: false })),
  ...ESP.magias.map((m) => { const k = m.dif - 1; return { id: m.id, nome: m.nome.pt, nomeEN: m.nome.en, tipo: m.tipo, custo: m.custo, poder: m.poder,
    raridade: R.ORDEM[k], nivelMin: R.FAIXAS[k].niveis[0], reqAtr: "inteligencia", req: 5 * (k + 1) - 4, preco: 0, unica: true }; }),
];

// ── Companheiros ─────────────────────────────────────────────────────────────
// Genéricos: mercenário até raro (120 / 400 / 1 400 Ouro); épico para cima só
// na dungeon, na missão da faixa ou no chefe. Com nome: só como contrato.
const PRECO_MERC = { 1: 120, 2: 400, 3: 1400 };
export const COMPANHEIROS = new Map();
for (const c of GEN.companheiros) {
  const n = txt(c.nome);
  COMPANHEIROS.set(c.id, { id: c.id, nome: n.pt, classe: c.classe, raridade: rarDaDif(c.dif), preco: PRECO_MERC[c.dif] ?? 0,
    soDungeon: c.dif >= 4, origem: "generico", dados: { nomeEN: n.en, dif: c.dif } });
}
function addNomeado(c, obra) {
  const n = txt(c.nome);
  let classe = c.classe, raridade, dif;
  if (c.tier) { const f = R.faixaDoTier(c.tier); if (!f) throw new Error(`[RPG] tier desconhecido: ${c.tier} (${c.id})`);
    raridade = f.raridade; dif = f.n; classe = classe ?? R.fichaPersonagem(c.tier, c.estrelas, f.nivel).classe; }
  else { dif = c.dif; raridade = rarDaDif(dif); }
  const magia = c.magia ? { nome: txt(c.magia.nome).pt, nomeEN: txt(c.magia.nome).en, tipo: c.magia.tipo } : null;
  COMPANHEIROS.set(c.id, { id: c.id, nome: n.pt, classe, raridade, preco: 0, soDungeon: true, origem: "conteudo",
    dados: { nomeEN: n.en, dif, tier: c.tier ?? null, estrelas: c.estrelas ?? null, classeForcada: c.classe ?? null, magia,
      obra: c.obra ?? obra ?? null, unico: true, mult: c.mult ?? 1, obtencao: c.obtencao ?? null, descricao: c.descricao ?? null,
      vsb: c.vsb ?? null, wiki: c.wiki ?? null } });
  // o contrato: um item negociável que vira o companheiro (ESPECIAIS §1.2)
  addItem({ id: `c_${c.id}`, nome: `Contrato: ${n.pt}`, nomeEN: `Contract: ${n.en}`, slot: "contrato", raridade, dif,
    origem: "conteudo", obra: c.obra ?? obra ?? null, especial: true, infinito: false, bonus: {}, precoBase: 0,
    dados: { tipo: "contrato", companheiro: c.id }, descricao: c.descricao ?? null });
}
for (const ob of OBRAS) for (const c of ob.companheiros ?? []) addNomeado(c, ob.obra);
for (const c of ESP.companheiros) addNomeado(c, null);
// pergaminhos das magias únicas
for (const m of MAGIAS.filter((x) => x.unica)) {
  addItem({ id: `p_${m.id}`, nome: `Pergaminho: ${m.nome}`, nomeEN: `Scroll: ${m.nomeEN}`, slot: "pergaminho", raridade: m.raridade,
    dif: R.ORDEM.indexOf(m.raridade) + 1, origem: "conteudo", obra: null, especial: true, infinito: false, bonus: {}, precoBase: 0,
    dados: { tipo: "pergaminho", magia: m.id }, descricao: null });
}

// ── Missões: contratos (a guilda), bicos (sem risco), especiais ──────────────
const missaoDe = (m, tipo) => ({ id: m.id, tipo, nome: txt(m.nome).pt, nomeEN: txt(m.nome).en, nivel: m.nivel ?? null,
  perigo: m.perigo ?? "normal", descricao: txt(m.descricao), historia: m.historia ?? null, falas: m.falas ?? null,
  recompensa: m.recompensa ?? null, requer: m.requer ?? null });
export const CONTRATOS = GEN.contratos.map((m) => missaoDe(m, "contrato"));
export const BICOS = GEN.bicos.map((m) => missaoDe(m, "bico"));
export const ESPECIAIS = [...ESP.especiais, ...OBRAS.flatMap((o) => o.especiais ?? [])].map((m) => missaoDe(m, "especial"));

// ── Chefes ───────────────────────────────────────────────────────────────────
// Genérico: no fim da dungeon da dificuldade (último nível da faixa). Com nome:
// no nível do tier; atos em sequência (requer).
export const CHEFES = new Map();
for (const c of GEN.chefes) CHEFES.set(c.id, { ...missaoDe(c, "chefe"), nivel: c.nivel ?? c.dif * 10, dungeon: null, obra: null, generico: true });
for (const ob of [W40K, ...OBRAS]) for (const c of ob.chefes ?? []) {
  const f = c.tier ? R.faixaDoTier(c.tier) : null;
  CHEFES.set(c.id, { ...missaoDe(c, "chefe"), nivel: c.nivel ?? f?.nivel, tier: c.tier ?? null, dungeon: c.dungeon ?? null,
    obra: c.obra ?? ob.obra, generico: false });
}

// ── Dungeons (D8): o tesouro delas paga; loot do tema (70%) ──────────────────
export const DUNGEONS = new Map();
const itensGenericosDaDif = (d) => [...ITENS.values()].filter((i) => i.dif === d && !i.obra && !i.especial && ["mao", "capacete", "armadura", "acessorio", "implante"].includes(i.slot)).map((i) => i.id);
for (const d of GEN.dungeons) {
  const chefe = CHEFES.get(d.chefe); if (chefe) chefe.dungeon = d.id;
  DUNGEONS.set(d.id, { id: d.id, nome: txt(d.nome).pt, nomeEN: txt(d.nome).en, difs: [d.dif, d.dif], descricao: txt(d.descricao),
    generos: d.generos ?? [], areas: [{ dif: d.dif, nome: txt(d.nome), inimigos: d.inimigos }], chefe: d.chefe, obra: null,
    tema: itensGenericosDaDif(d.dif) });
}
{
  const d = W40K.dungeon;
  DUNGEONS.set(d.id, { id: d.id, nome: txt(d.nome).pt, nomeEN: txt(d.nome).en, difs: d.difs, descricao: txt(d.descricao),
    generos: d.generos ?? ["scifi"], areas: d.areas, chefe: d.chefe, obra: W40K.obra,
    tema: [...W40K.armas, ...W40K.outros].map((a) => a.id) });
}
for (const ob of OBRAS) for (const d of ob.dungeons ?? []) {
  DUNGEONS.set(d.id, { id: d.id, nome: txt(d.nome).pt, nomeEN: txt(d.nome).en, difs: d.difs, descricao: txt(d.descricao),
    generos: d.generos ?? [], areas: d.areas, chefe: d.chefe, obra: ob.obra,
    tema: d.tema ?? itensGenericosDaDif(d.difs[1]) });
}
for (const d of DUNGEONS.values()) d.niveis = [R.faixaDaDif(d.difs[0]).niveis[0], R.faixaDaDif(d.difs[1]).niveis[1]];

// ── Imagens (imagens.js) ─────────────────────────────────────────────────────
// Um objeto do conteúdo pode trazer "imagem": "<link>". O padrão é NÃO pôr no
// JSON (repositório público): o dono define pelo bot (&game admin imagem), e o
// link fica só no banco. Isto lê os que vierem no JSON, se alguém preferir.
export const IMAGENS_DO_CONTEUDO = new Map();
{
  const andar = (x) => {
    if (Array.isArray(x)) { for (const y of x) andar(y); return; }
    if (!x || typeof x !== "object") return;
    if (typeof x.id === "string" && typeof x.imagem === "string" && /^https?:\/\//.test(x.imagem)) IMAGENS_DO_CONTEUDO.set(x.id, x.imagem);
    for (const v of Object.values(x)) if (v && typeof v === "object") andar(v);
  };
  for (const j of [GEN, W40K, IMPL, ESP, ...OBRAS]) andar(j);
}

// ── Inglês (traducao.js) ─────────────────────────────────────────────────────
export function dicionarioEN() {
  const en = {};
  const par = (pt, e) => { if (pt && e && pt !== e) en[pt] = e; };
  for (const i of ITENS.values()) { par(i.nome, i.nomeEN); if (i.descricao) par(txt(i.descricao).pt, txt(i.descricao).en); }
  for (const c of COMPANHEIROS.values()) { par(c.nome, c.dados.nomeEN); if (c.dados.magia) par(c.dados.magia.nome, c.dados.magia.nomeEN); if (c.dados.descricao) par(c.dados.descricao.pt, c.dados.descricao.en); }
  for (const m of MAGIAS) par(m.nome, m.nomeEN);
  for (const m of [...CONTRATOS, ...BICOS, ...ESPECIAIS, ...CHEFES.values()]) { par(m.nome, m.nomeEN); par(m.descricao?.pt, m.descricao?.en); }
  for (const d of DUNGEONS.values()) { par(d.nome, d.nomeEN); par(d.descricao?.pt, d.descricao?.en); for (const a of d.areas) par(txt(a.nome).pt, txt(a.nome).en); }
  for (const f of R.FAIXAS) par(f.nome, f.nomeEN);
  return en;
}

// Semeia o catálogo no banco (idempotente; não sobrescreve o que o dono curou).
export function semear(db) {
  let ni = 0, nf = 0;
  for (const it of ITENS.values()) {
    const ex = db.getItem(it.id);
    if (ex && !["generico", "conteudo"].includes(ex.origem)) continue;
    db.upsertItem(it); ni++;
  }
  for (const c of COMPANHEIROS.values()) {
    const ex = db.getFollowerCatalogo(c.id);
    if (ex && !["generico", "conteudo"].includes(ex.origem)) continue;
    db.upsertFollowerCatalogo(c); nf++;
  }
  return { itens: ni, companheiros: nf };
}
