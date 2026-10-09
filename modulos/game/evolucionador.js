// Evolucionador automático (D24, G2c): o jogador escolhe uma classe — só um
// perfil, sem bônus — e o `&game evoluir` gasta os pontos livres e equipa o
// melhor da mochila por ele, testando combinações reais com as fórmulas do
// combate (regras.js) numa missão do nível dele, com os companheiros da party e
// a sinergia. Nunca vende nem descarta: o que sai volta para a mochila.

import * as db from "../core/db.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import { MUNDO } from "./mundo.js";

export const CLASSES_JOGADOR = {
  guerreiro: { rotulo: "Guerreiro", rotuloEN: "Warrior",  emoji: "⚔️", dist: { forca: .5, resistencia: .2, vida: .15, mana: .15 }, peso: .6, armas: ["branca"], escudo: true, estilo: [["branca_pesada", "2m"]] },
  duelista:  { rotulo: "Duelista",  rotuloEN: "Duelist",  emoji: "🤺", dist: { forca: .3, destreza: .3, resistencia: .15, vida: .15, agilidade: .1 }, peso: .6, armas: ["branca", "fogo_leve"], escudo: false, estilo: [["branca_media", "1m"], ["branca_leve", "1m"]] },
  atirador:  { rotulo: "Atirador",  rotuloEN: "Gunslinger", emoji: "🎯", dist: { destreza: .5, resistencia: .15, vida: .15, agilidade: .1, mana: .1 }, peso: .6, armas: ["fogo", "branca_leve"], escudo: false, estilo: [["fogo_pesada", "2m"]] },
  mago:      { rotulo: "Mago",      rotuloEN: "Mage",     emoji: "🔮", dist: { inteligencia: .5, mana: .2, vida: .15, resistencia: .15 }, peso: .6, armas: ["magica"], escudo: false, estilo: [["magica_pesada", "2m"]] },
  guardiao:  { rotulo: "Guardião",  rotuloEN: "Guardian", emoji: "🛡️", dist: { resistencia: .35, vida: .3, forca: .2, agilidade: .15 }, peso: .35, armas: ["branca"], escudo: true, estilo: [["branca_media", "1m"], ["escudo"]] },
  templario: { rotulo: "Templário", rotuloEN: "Templar",  emoji: "✝️", dist: { forca: .3, inteligencia: .3, resistencia: .15, vida: .15, mana: .1 }, peso: .6, armas: ["branca", "magica"], escudo: true, estilo: [["arma_forca", "2m"]] },
  andarilho: { rotulo: "Andarilho", rotuloEN: "Wanderer", emoji: "🌀", dist: { forca: .2, destreza: .2, inteligencia: .25, vida: .15, resistencia: .1, mana: .1 }, peso: .6, armas: ["branca", "fogo", "magica"], escudo: true, estilo: [["arma_forca", "1m"], ["fogo_leve", "1m"]] },
  bardo:     { rotulo: "Bardo",     rotuloEN: "Bard",     emoji: "🎻", dist: { carisma: .25, sorte: .25, mana: .2, inteligencia: .1, vida: .1, resistencia: .1 }, peso: .4, armas: ["magica_leve", "branca_leve", "fogo_leve"], escudo: true, estilo: [["magica_leve", "1m"], ["escudo"]] },
};
const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export function acharClasse(txt) {
  const a = semAcento(txt);
  if (!a) return null;
  return Object.keys(CLASSES_JOGADOR).find((k) => k === a || semAcento(CLASSES_JOGADOR[k].rotulo) === a || semAcento(CLASSES_JOGADOR[k].rotuloEN) === a)
      ?? Object.keys(CLASSES_JOGADOR).find((k) => k.startsWith(a) || semAcento(CLASSES_JOGADOR[k].rotuloEN).startsWith(a)) ?? null;
}

// ── (1) Pontos: requisitos do estilo primeiro, depois o atributo mais atrasado ─
export function distribuirPontos(p, classe) {
  const cls = CLASSES_JOGADOR[classe]; if (!cls) return { attr: null, gastos: {} };
  const base = 1 + R.baseDoNivel(p.nivel ?? 1), rar = R.faixaDoNivel(p.nivel ?? 1).raridade;
  const a = Object.fromEntries(R.ATR.map((k) => [k, p[k] ?? base]));
  const gasto = Object.fromEntries(R.ATR.map((k) => [k, Math.max(0, a[k] - base)]));
  let livre = Math.floor(p.pontos ?? 0);
  const total = Object.values(gasto).reduce((s, x) => s + x, 0) + livre;
  const gastos = {};
  const por = (k, n) => { a[k] += n; gasto[k] += n; gastos[k] = (gastos[k] ?? 0) + n; livre -= n; };
  for (const [mold, modo] of cls.estilo) {
    if (mold === "escudo") continue;
    const st = R.statsArma(R.ARMAS[mold], rar), alvo = { forca: Math.ceil(modo === "2m" ? st.reqFor2 / 1.5 : st.reqFor1), destreza: st.reqDes, inteligencia: st.reqInt };
    for (const [k, v] of Object.entries(alvo)) { const falta = Math.max(0, Math.min(livre, v - a[k])); if (falta) por(k, falta); }
  }
  for (const k of ["resistencia", "vida"]) { const falta = Math.max(0, Math.min(livre, R.IMPL.req * R.difDaRaridade(rar) - a[k])); if (falta) por(k, falta); }
  while (livre > 0) {
    let melhor = null, d0 = -Infinity;
    for (const [k, f] of Object.entries(cls.dist)) { const d = f * total - gasto[k]; if (d > d0) { d0 = d; melhor = k; } }
    por(melhor, 1);
  }
  return { attr: a, gastos, sobra: (p.pontos ?? 0) - Math.floor(p.pontos ?? 0) };
}

// ── (2) Equipamento ─────────────────────────────────────────────────────────
function combos(xs, k, ok = () => true, ini = 0, acc = [], out = []) {
  if (acc.length === k) { if (ok(acc)) out.push([...acc]); return out; }
  for (let i = ini; i < xs.length; i++) { acc.push(xs[i]); combos(xs, k, ok, i + 1, acc, out); acc.pop(); }
  return out;
}
const permitida = (cls, item) => {
  const a = item.dados.arma, mold = item.dados.molde;
  return cls.armas.some((t) => t === a.tipo || t === mold || t === `${a.tipo}_${a.porte}` || (t.endsWith("_leve") && a.porte === "leve" && t.startsWith(a.tipo)));
};
// Itens da mochila, um por unidade (dois iguais podem ir um em cada mão)
function unidades(inv) {
  const out = [];
  for (const it of inv) for (let i = 0; i < Math.min(3, it.quantidade ?? 1); i++) out.push({ ...it, _u: `${it.id}#${i}` });
  return out;
}
export function avaliar(p, attr, eq, companheiros, magiasCompanheiros, conhecidas, peso) {
  const jog = CB.membroJogador({ ...p, ...attr }, eq);
  const aj = R.attrEf(jog);
  const membros = [jog, ...companheiros];
  const mana = membros.reduce((s, m) => s + (R.attrEf(m).mana ?? 0), 0);
  const { usadas } = R.magiasAtivas([...magiasCompanheiros, ...conhecidas.filter((m) => R.podeUsarMagia(m, aj))], mana);
  const alvo = { ...R.missao(p.nivel ?? 1), base: R.BASE.normal };
  const pv = R.preverLuta(membros, usadas, alvo);
  // sem a folga: a nota compara configurações na chance-base
  const ex = pv.poder / (pv.poder + pv.exigidoPoder), sb = pv.resil / (pv.resil + pv.exigidoRisco);
  return { ex, sb, nota: Math.pow(ex, peso) * Math.pow(sb, 1 - peso), sinergia: pv.sinergia.bonus, exitoReal: pv.exito, sobrevReal: pv.sobrevivencia };
}
export function melhorEquipamento(p, attr, inv, party, classe, eqAtual = {}) {
  const cls = CLASSES_JOGADOR[classe];
  const us = unidades(inv);
  const armas = us.filter((i) => i.dados?.tipo === "arma" && permitida(cls, i));
  const escudos = us.filter((i) => i.dados?.tipo === "escudo");
  const cap = us.filter((i) => i.slot === "capacete"), arm = us.filter((i) => i.slot === "armadura");
  const acess = us.filter((i) => i.slot === "acessorio");
  const ciber = us.filter((i) => i.dados?.tipo === "implante" && i.dados.familia === "ciber");
  const bio = us.filter((i) => i.dados?.tipo === "implante" && i.dados.familia === "bio");
  const comps = party.companheiros.map((c) => c.membro), magC = party.companheiros.map((c) => c.magia).filter(Boolean);
  const nota = (s) => avaliar(p, attr, montar(s), comps, magC, party.conhecidas, cls.peso).nota;
  const def = (it) => it ? R.defesaItem(it.dados.peso, it.raridade, it.dados.mult ?? 1) : 0;
  const melhor = (lista) => lista.reduce((b, x) => (def(x) > def(b) ? x : b), null);
  const opMaos = [{ m1: null, m2: null }];
  if (cls.escudo !== "sempre") {
    for (const w of armas) opMaos.push({ m1: w, m2: null });
    for (const [a, b] of combos(armas, 2, ([x, y]) => x.id !== y.id || x._u !== y._u)) opMaos.push({ m1: a, m2: b });
  }
  if (cls.escudo) for (const w of armas) for (const e of escudos.slice(0, 3)) opMaos.push({ m1: w, m2: e });
  const atual = {
    mao: opMaos.find((o) => o.m1?.id === eqAtual.mao1?.id && o.m2?.id === eqAtual.mao2?.id) ?? opMaos[0],
    cap: melhor(cap), arm: melhor(arm), acess: [], ciber: [], bio: [],
  };
  // pré-seleção: os 6 melhores de cada grupo, um de cada vez sobre o atual
  const topo = (lista, campo, n = 6) => lista.map((x) => [x, nota({ ...atual, [campo]: [x] })]).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
  const opAc = (() => { const t = topo(acess, "acess"); const c = combos(t, Math.min(3, t.length)); return c.length ? c : [[]]; })();
  const opCi = (() => { const t = topo(ciber, "ciber"); const c = combos(t, Math.min(3, t.length), (xs) => new Set(xs.map((x) => x.dados.regiao)).size === xs.length);
    return c.length ? c : (t.length ? t.map((x) => [x]) : [[]]); })();
  const opBi = (() => { const t = topo(bio, "bio"); const c = combos(t, Math.min(3, t.length)); return c.length ? c : [[]]; })();
  const melhorDe = (campo, ops) => { let best = atual[campo], nb = nota(atual); for (const o of ops) { const s = { ...atual, [campo]: o }, r = nota(s); if (r > nb + 1e-12) { nb = r; best = o; } } atual[campo] = best; };
  for (let volta = 0; volta < 2; volta++) { melhorDe("mao", opMaos); melhorDe("ciber", opCi); melhorDe("bio", opBi); melhorDe("acess", opAc); }
  return { escolha: atual, eq: montar(atual) };
}
export function montar(s) {
  const eq = {};
  if (s.mao?.m1) eq.mao1 = s.mao.m1;
  if (s.mao?.m2) eq.mao2 = s.mao.m2;
  if (s.cap) eq.capacete = s.cap;
  if (s.arm) eq.armadura = s.arm;
  (s.acess ?? []).forEach((x, i) => { eq[`acessorio${i + 1}`] = x; });
  (s.ciber ?? []).forEach((x, i) => { eq[`ciber${i + 1}`] = x; });
  (s.bio ?? []).forEach((x, i) => { eq[`bio${i + 1}`] = x; });
  return eq;
}

// ── (3) Tudo junto ───────────────────────────────────────────────────────────
// opts: { pontos = true, equipar = true, gravar = true }
export function evoluir(uid, { pontos = true, equipar = true, gravar = true } = {}) {
  const p = db.getPersonagem(MUNDO, uid);
  if (!p) return { erro: "sem-personagem" };
  const classe = p.classe;
  if (!classe || !CLASSES_JOGADOR[classe]) return { erro: "sem-classe" };
  const cls = CLASSES_JOGADOR[classe];
  const party = CB.partyDe(MUNDO, uid, p);
  const eqAntes = db.getEquipado(MUNDO, uid);
  const attrAntes = Object.fromEntries(R.ATR.map((k) => [k, p[k]]));
  const comps = party.companheiros.map((c) => c.membro), magC = party.companheiros.map((c) => c.magia).filter(Boolean);
  const antes = avaliar(p, attrAntes, eqAntes, comps, magC, party.conhecidas, cls.peso);

  const dist = pontos ? distribuirPontos(p, classe) : { attr: attrAntes, gastos: {}, sobra: p.pontos ?? 0 };
  const attr = dist.attr;
  let eq = eqAntes;
  if (equipar) eq = melhorEquipamento(p, attr, db.getInventario(MUNDO, uid), party, classe, eqAntes).eq;
  const depois = avaliar(p, attr, eq, comps, magC, party.conhecidas, cls.peso);
  // não piora: se a configuração nova não ganha da antiga, fica a antiga
  if (equipar && depois.nota + 1e-12 < avaliar(p, attr, eqAntes, comps, magC, party.conhecidas, cls.peso).nota) eq = eqAntes;

  const trocas = [];
  for (const s of db.SLOTS) {
    const a = eqAntes[s]?.id ?? null, b = eq[s]?.id ?? null;
    if (a !== b) trocas.push({ slot: s, saiu: eqAntes[s] ?? null, entrou: eq[s] ?? null });
  }
  if (gravar) {
    if (pontos && Object.keys(dist.gastos).length) {
      const gasto = Object.values(dist.gastos).reduce((s, x) => s + x, 0);
      db.salvarPersonagem(MUNDO, uid, { ...Object.fromEntries(Object.keys(dist.gastos).map((k) => [k, attr[k]])), pontos: (p.pontos ?? 0) - gasto });
    }
    if (equipar) for (const t of trocas) { if (t.entrou) db.equipar(MUNDO, uid, t.slot, t.entrou.id); else db.desequipar(MUNDO, uid, t.slot); }
  }
  const final = avaliar(p, attr, eq, comps, magC, party.conhecidas, cls.peso);
  return { classe, cls, gastos: dist.gastos, attrAntes, attr, trocas, antes, depois: final };
}
