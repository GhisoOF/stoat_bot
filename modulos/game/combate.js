// Combate v4 no jogo (9 out 2026): monta os membros da party a partir do banco
// — o jogador com as duas mãos, cabeça, corpo, acessórios e implantes; os
// companheiros com o kit da classe no nível do dono — e chama as fórmulas de
// regras.js. Cada membro calcula o próprio ataque e a própria defesa (D20).

import * as db from "../core/db.js";
import * as R from "./regras.js";
import { MAGIAS } from "./conteudo.js";

export const getMagia = (id) => MAGIAS.find((m) => m.id === id) ?? null;

// ── Itens → peças do combate ────────────────────────────────────────────────
export function armaDoItem(item) {
  if (item?.dados?.tipo !== "arma") return null;
  return { ...item.dados.arma, mult: item.dados.mult ?? 1 };
}
export const ehArma = (item) => item?.dados?.tipo === "arma";
export const ehEscudo = (item) => item?.dados?.tipo === "escudo";
export const multDe = (item) => item?.dados?.mult ?? 1;

// ── Jogador ───────────────────────────────────────────────────────────────────
// Atributos do personagem + o que os acessórios dão (armas e armaduras não dão
// mais atributo — v4). Implantes de atributo entram por attrEf (regras.js).
export function atributosBase(p, eq) {
  const a = Object.fromEntries(R.ATR.map((k) => [k, p?.[k] ?? 0]));
  for (const [slot, item] of Object.entries(eq ?? {})) {
    if (!/^acessorio/.test(slot)) continue;
    for (const [k, v] of Object.entries(item.bonus ?? {})) a[k] = (a[k] ?? 0) + v;
  }
  return a;
}
// Como as mãos estão: arma sozinha numa mão com a outra vazia vai nas duas
// mãos (Força ×1,5 na escala, requisito pela metade); escudo não é arma.
export function maosDe(eq) {
  const m1 = eq?.mao1 ?? null, m2 = eq?.mao2 ?? null;
  const armas = [m1, m2].filter((x) => ehArma(x));
  const escudo = [m1, m2].find((x) => ehEscudo(x)) ?? null;
  const maos = [];
  if (armas.length === 1 && !escudo && (!m1 || !m2)) maos.push({ item: armas[0], arma: armaDoItem(armas[0]), raridade: armas[0].raridade, modo: "2m" });
  else for (const a of armas) maos.push({ item: a, arma: armaDoItem(a), raridade: a.raridade, modo: "1m" });
  return { maos, escudo };
}
export function membroJogador(p, eq) {
  const attr = atributosBase(p, eq);
  const { maos, escudo } = maosDe(eq);
  const defesa = [];
  if (eq?.capacete) defesa.push({ tipo: "capacete", raridade: eq.capacete.raridade, mult: multDe(eq.capacete) });
  if (eq?.armadura) defesa.push({ tipo: "armadura", raridade: eq.armadura.raridade, mult: multDe(eq.armadura) });
  if (escudo) defesa.push({ tipo: "escudo", raridade: escudo.raridade, mult: multDe(escudo) });
  const implantes = [];
  for (const s of ["bio1", "bio2", "bio3", "ciber1", "ciber2", "ciber3"]) {
    const it = eq?.[s];
    if (it?.dados?.tipo === "implante") implantes.push({ id: it.dados.base, raridade: it.raridade, mult: multDe(it) });
  }
  return { attr, nivel: p?.nivel ?? 1, maos: maos.map(({ arma, raridade, modo }) => ({ arma, raridade, modo })), defesa, implantes, maosItens: maos, escudo };
}

// ── Companheiros (D2, D23) ───────────────────────────────────────────────────
// Sobem com o dono (o nível dele), sem equipamento: o kit da classe já está no
// ganho por nível. Com nome: a ficha pelas estrelas (fichaPersonagem).
export function atributosDoCompanheiro(cat, nivel) {
  if (!cat) return Object.fromEntries(R.ATR.map((k) => [k, 0]));
  const d = cat.dados ?? {};
  if (d.tier && d.estrelas) return R.fichaPersonagem(d.tier, d.estrelas, Math.max(1, nivel), d.classeForcada ?? null)?.attr;
  const a = R.atributosCompanheiro(cat.classe, cat.raridade, Math.max(1, nivel));
  if ((d.mult ?? 1) !== 1) for (const k of R.ATR) a[k] = Math.round(a[k] * d.mult);
  return a;
}
export function magiaDoCompanheiro(cat) {
  if (!cat || !R.CLASSES[cat.classe]) return null;
  const d = cat.dados ?? {};
  const cls = R.CLASSES[cat.classe].magia;
  if (d.tier && d.estrelas) {
    const f = R.fichaPersonagem(d.tier, d.estrelas, 1, d.classeForcada ?? null);
    const tipo = d.magia?.tipo ?? R.CLASSES[f.classe].magia.tipo;
    return { nome: d.magia?.nome ?? R.CLASSES[f.classe].magia.nome, nomeEN: d.magia?.nomeEN, tipo, custo: R.CLASSES[f.classe].magia.custo, poder: f.magia.poder, companheiro: cat.id };
  }
  const m = R.magiaCompanheiro(cat.classe, cat.raridade);
  return { ...m, nome: d.magia?.nome ?? m.nome, nomeEN: d.magia?.nomeEN, poder: Math.round(m.poder * (d.mult ?? 1) * 100) / 100, companheiro: cat.id };
}
export function membroCompanheiro(cat, nivel, buff = 1) {
  const a = atributosDoCompanheiro(cat, nivel);
  return { attr: Object.fromEntries(R.ATR.map((k) => [k, Math.round((a[k] ?? 0) * buff)])), nivel: Math.max(1, nivel), classe: cat?.classe ?? null, catId: cat?.id };
}

// ── A party de um jogador ────────────────────────────────────────────────────
//   { p, jogador (membro), companheiros: [{ f, cat, membro, magia }], magiasConhecidas, attr }
export function partyDe(serverId, uid, p = null) {
  p ??= db.getPersonagem(serverId, uid);
  if (!p) return null;
  const eq = db.getEquipado(serverId, uid);
  const jogador = membroJogador(p, eq);
  const attrJ = R.attrEf(jogador);
  const buff = R.buffCarisma(attrJ.carisma);
  const companheiros = db.getParty(serverId, uid).map((f) => {
    const cat = db.getFollowerCatalogo(f.catalogoId);
    return { f, cat, membro: membroCompanheiro(cat, p.nivel, buff), magia: magiaDoCompanheiro(cat) };
  }).filter((c) => c.cat);
  // magias do grimório: só as que a Inteligência do jogador libera (D10)
  const conhecidas = db.listarMagias(serverId, uid).map((x) => getMagia(x.magiaId)).filter(Boolean);
  const doGrimorio = conhecidas.filter((m) => R.podeUsarMagia(m, attrJ));
  return { p, eq, uid, jogador, attr: attrJ, companheiros, conhecidas, doGrimorio,
    semAtributo: conhecidas.filter((m) => !R.podeUsarMagia(m, attrJ)),
    membros: [jogador, ...companheiros.map((c) => c.membro)],
    magiasProprias: [...companheiros.map((c) => c.magia).filter(Boolean), ...doGrimorio] };
}
// Junta várias parties (co-op): membros e magias somam; a mana é de todos.
export function juntar(parties) {
  const membros = parties.flatMap((x) => x.membros);
  const todas = parties.flatMap((x) => x.magiasProprias);
  const mana = membros.reduce((s, m) => s + (R.attrEf(m).mana ?? 0), 0);
  const { usadas, manaGasta, manaLivre } = R.magiasAtivas(todas, mana);
  return { membros, magias: usadas, todas, mana, manaGasta, manaLivre };
}
// (31 out 2026, P3a) com a ajuda do começo pelo nível do grupo (a média, como
// em lutas.lutar): nos primeiros níveis ninguém cai — regras.comInicio
export function prever(parties, alvo) {
  const j = juntar(parties);
  const nivel = Math.round(parties.reduce((s, x) => s + (x?.p?.nivel ?? 1), 0) / Math.max(1, parties.length));
  return { ...R.comInicio(R.preverLuta(j.membros, j.magias, alvo), nivel), ...j };
}
