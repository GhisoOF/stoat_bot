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

// Estatística de um item para mostrar (dano, defesa, bônus, efeito).
export function statsItem(item) {
  const d = item?.dados ?? {}, rar = item?.raridade;
  if (d.tipo === "arma") return { tipo: "arma", ...R.statsArma(armaDoItem(item), rar), esc: d.arma.esc ?? {}, porte: d.arma.porte, tipoDano: d.arma.tipo, foco: !!d.foco };
  if (d.tipo === "escudo") return { tipo: "escudo", defesa: R.defesaItem("escudo", rar, d.mult ?? 1), reforco: R.ESCUDO.reforco };
  if (d.tipo === "defesa") return { tipo: "defesa", defesa: R.defesaItem(d.peso, rar, d.mult ?? 1) };
  if (d.tipo === "implante") {
    const base = R.IMPLANTES[d.base], b = R.difDaRaridade(rar), orc = R.RARIDADES[rar].item * (d.mult ?? 1);
    const req = R.IMPL.req * b, bio = base.fam === "bio", k0 = bio ? R.IMPL.bio : 1, k1 = bio ? R.IMPL.bio * (1 + R.IMPL.escBio) : 1;
    const out = { tipo: "implante", familia: base.fam, papel: base.papel, regiao: base.regiao ?? null, cor: base.cor ?? null,
      alvo: bio ? R.COR_BIO[base.cor].tipo : base.alvo ?? null, req, reqAtr: bio ? "vida" : "resistencia", bio };
    if (base.papel === "ofensivo" || base.papel === "defensivo") Object.assign(out, { valor: [R.IMPL.potencia * orc * k0, R.IMPL.potencia * orc * k1] });
    else if (base.papel === "reforco") Object.assign(out, { pct: [R.IMPL.reforco(b) * (d.mult ?? 1) * k0, R.IMPL.reforco(b) * (d.mult ?? 1) * k1] });
    else Object.assign(out, { atributos: base.atr ?? R.ATR_DA_COR[base.cor], pontos: [R.IMPL.atributo * orc * k0, R.IMPL.atributo * orc * k1] });
    return out;
  }
  if (d.tipo === "acessorio") return { tipo: "acessorio", bonus: item.bonus ?? {} };
  if (d.tipo === "contrato") return { tipo: "contrato", companheiro: d.companheiro };
  if (d.tipo === "pergaminho") return { tipo: "pergaminho", magia: d.magia };
  return { tipo: "?", bonus: item?.bonus ?? {} };
}

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
export function prever(parties, alvo) {
  const j = juntar(parties);
  return { ...R.preverLuta(j.membros, j.magias, alvo), ...j };
}

// Peso de cada um no resultado, para a história ("quem brilhou").
export function contribuicoes(parties) {
  const out = [];
  for (const x of parties) {
    const pm = (m) => R.poderMembro(m) + R.defesaMembro(m) * 0.5;
    out.push({ tipo: "jogador", uid: x.uid, nome: x.p.nome, peso: pm(x.jogador) });
    for (const c of x.companheiros) out.push({ tipo: c.cat.classe, nome: c.cat.nome, peso: pm(c.membro) });
  }
  return out;
}
