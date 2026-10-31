// Evolucionador (D24, G2c; P2 31 out 2026): a build é a escolha do jogador; os
// pontos, o equipamento e as magias saem dela, sozinhos. Testa configurações
// reais com as fórmulas do combate (regras.js) numa missão do nível dele, com
// os aliados e a sinergia.
//
// Quanto custa (P2): cada configuração testada é uma "avaliação" (~30 µs). Antes,
// uma mochila grande chegava a 5.698 avaliações numa chamada (153 ms síncronos).
// Agora:
//   • item novo (loot ou compra) compara só com a VAGA dele (até 4 avaliações);
//   • subir de nível só distribui os pontos (nenhuma avaliação de equipamento);
//   • a busca completa roda só ao trocar de build, com `topo()` nas armas (as 6
//     melhores sozinhas antes de combinar) e um TETO de avaliações por chamada.

import * as db from "../core/db.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import { MAGIAS } from "./conteudo.js";
import { BUILDS, buildDe } from "./builds.js";
import { ERA } from "./era.js";

export const TETO_AVALIACOES = 400;

// ── (1) Pontos: requisitos do estilo primeiro, depois o atributo mais atrasado ─
const baseDe = (nivel) => 1 + R.baseDoNivel(nivel ?? 1);
export function distribuirPontos(p, build) {
  const b = typeof build === "string" ? BUILDS[build] : build;
  if (!b) return { attr: null, gastos: {} };
  const base = baseDe(p.nivel), rar = R.faixaDoNivel(p.nivel ?? 1).raridade;
  const a = Object.fromEntries(R.ATR.map((k) => [k, p[k] ?? base]));
  const gasto = Object.fromEntries(R.ATR.map((k) => [k, Math.max(0, a[k] - base)]));
  let livre = Math.max(0, Math.floor(p.pontos ?? 0));
  const total = Object.values(gasto).reduce((s, x) => s + x, 0) + livre;
  const gastos = {};
  const por = (k, n) => { a[k] += n; gasto[k] += n; gastos[k] = (gastos[k] ?? 0) + n; livre -= n; };
  for (const [mold, modo] of b.estilo ?? []) {
    if (mold === "escudo") continue;
    const st = R.statsArma(R.ARMAS[mold], rar), alvo = { forca: Math.ceil(modo === "2m" ? st.reqFor2 / 1.5 : st.reqFor1), destreza: st.reqDes, inteligencia: st.reqInt };
    for (const [k, v] of Object.entries(alvo)) { const falta = Math.max(0, Math.min(livre, v - a[k])); if (falta) por(k, falta); }
  }
  for (const k of ["resistencia", "vida"]) { const falta = Math.max(0, Math.min(livre, R.IMPL.req * R.difDaRaridade(rar) - a[k])); if (falta) por(k, falta); }
  while (livre > 0) {
    let melhor = null, d0 = -Infinity;
    for (const [k, f] of Object.entries(b.dist)) { const d = f * total - gasto[k]; if (d > d0) { d0 = d; melhor = k; } }
    por(melhor, 1);
  }
  return { attr: a, gastos, sobra: (p.pontos ?? 0) - Math.floor(p.pontos ?? 0) };
}
// Todos os pontos gastos voltam (os atributos à base do nível) — a troca de build
export function devolverPontos(p) {
  const base = baseDe(p.nivel);
  const gasto = R.ATR.reduce((s, k) => s + Math.max(0, (p[k] ?? base) - base), 0);
  return { ...Object.fromEntries(R.ATR.map((k) => [k, base])), pontos: Math.round(((p.pontos ?? 0) + gasto) * 100) / 100 };
}

// ── (2) A nota de uma configuração ──────────────────────────────────────────
export function avaliar(p, attr, eq, companheiros, magiasCompanheiros, conhecidas, peso) {
  const jog = CB.membroJogador({ ...p, ...attr }, eq);
  const aj = R.attrEf(jog);
  const membros = [jog, ...companheiros];
  const mana = membros.reduce((s, m) => s + (R.attrEf(m).mana ?? 0), 0);
  const { usadas } = R.magiasAtivas([...magiasCompanheiros, ...conhecidas.filter((m) => R.podeUsarMagia(m, aj))], mana);
  const pv = R.preverLuta(membros, usadas, { ...R.missao(p.nivel ?? 1), base: R.BASE.normal });
  // sem a folga: a nota compara configurações na chance-base
  const ex = pv.poder / (pv.poder + pv.exigidoPoder), sb = pv.resil / (pv.resil + pv.exigidoRisco);
  return { ex, sb, nota: Math.pow(ex, peso) * Math.pow(sb, 1 - peso), exitoReal: pv.exito, sobrevReal: pv.sobrevivencia };
}
// Um avaliador com contador e teto: passado o teto, toda configuração nova vale -∞
// (fica a melhor achada até ali)
export function avaliador(p, attr, party, build, teto = TETO_AVALIACOES) {
  const comps = party.companheiros.map((c) => c.membro), magC = party.companheiros.map((c) => c.magia).filter(Boolean);
  const r = { n: 0, teto, nota: (eq) => { if (r.n >= teto) return -Infinity; r.n++; return avaliar(p, attr, eq, comps, magC, party.conhecidas, build.peso).nota; } };
  return r;
}

// ── Que item a build usa ─────────────────────────────────────────────────────
export function permitida(build, item) {
  const a = item?.dados?.arma, mold = item?.dados?.molde;
  if (item?.dados?.tipo !== "arma" || !a) return false;
  return build.armas.some((t) => t === a.tipo || t === mold || t === `${a.tipo}_${a.porte}` || (t.endsWith("_leve") && a.porte === "leve" && t.startsWith(a.tipo)));
}
// As vagas onde um item pode entrar, para esta build e este equipamento
export function vagasDoItem(build, item, eq = {}) {
  const d = item?.dados ?? {};
  if (d.tipo === "arma") return permitida(build, item) ? ["mao1", "mao2"] : [];
  if (d.tipo === "escudo") return build.escudo ? ["mao2"] : [];
  if (d.tipo === "defesa") return [item.slot];
  if (d.tipo === "acessorio") return ["acessorio1", "acessorio2", "acessorio3"];
  if (d.tipo === "implante") {
    if (d.familia === "bio") return ["bio1", "bio2", "bio3"];
    // cyberware: uma peça por região do corpo — a da mesma região é a única vaga
    const mesma = ["ciber1", "ciber2", "ciber3"].find((s) => eq[s]?.dados?.regiao === d.regiao);
    return mesma ? [mesma] : ["ciber1", "ciber2", "ciber3"];
  }
  return [];
}

// ── Item novo: compara só com a vaga dele ───────────────────────────────────
// → { melhora, slot, saiu, ganho (quanto a nota sobe), avaliacoes }
export function compararNaVaga(p, attr, eq, party, build, item) {
  const vagas = vagasDoItem(build, item, eq);
  if (!vagas.length) return { melhora: false, slot: null, saiu: null, ganho: 0, avaliacoes: 0 };
  const av = avaliador(p, attr, party, build, vagas.length + 1);
  const n0 = av.nota(eq);
  let melhor = null, nb = n0;
  for (const s of vagas) {
    const novo = { ...eq, [s]: item };
    const n = av.nota(novo);
    if (n > nb + 1e-9) { nb = n; melhor = s; }
  }
  return { melhora: !!melhor, slot: melhor, saiu: melhor ? eq[melhor] ?? null : null, ganho: nb - n0, avaliacoes: av.n };
}

// ── Busca completa (só ao trocar de build) ──────────────────────────────────
function combos(xs, k, ok = () => true, ini = 0, acc = [], out = []) {
  if (acc.length === k) { if (ok(acc)) out.push([...acc]); return out; }
  for (let i = ini; i < xs.length; i++) { acc.push(xs[i]); combos(xs, k, ok, i + 1, acc, out); acc.pop(); }
  return out;
}
// Itens da mochila, um por unidade (dois iguais podem ir um em cada mão)
function unidades(inv) {
  const out = [];
  for (const it of inv) for (let i = 0; i < Math.min(2, it.quantidade ?? 1); i++) out.push({ ...it, _u: `${it.id}#${i}` });
  return out;
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
export function melhorEquipamento(p, attr, inv, party, build, { teto = TETO_AVALIACOES } = {}) {
  const us = unidades(inv);
  const av = avaliador(p, attr, party, build, teto);
  const def = (it) => (it ? R.defesaItem(it.dados.peso, it.raridade, it.dados.mult ?? 1) : 0);
  const maisDefesa = (lista) => lista.reduce((b, x) => (def(x) > def(b) ? x : b), null);
  const atual = { mao: { m1: null, m2: null }, cap: maisDefesa(us.filter((i) => i.slot === "capacete")), arm: maisDefesa(us.filter((i) => i.slot === "armadura")), acess: [], ciber: [], bio: [] };
  const nota = (s) => av.nota(montar(s));
  // topo(): as n melhores de um grupo, uma de cada vez sobre a configuração atual
  const topo = (lista, campo, n = 6, como = (x) => [x]) => lista.map((x) => [x, nota({ ...atual, [campo]: como(x) })]).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
  const armas = topo(us.filter((i) => permitida(build, i)), "mao", 6, (x) => ({ m1: x, m2: null }));
  const escudos = build.escudo ? us.filter((i) => i.dados?.tipo === "escudo").sort((a, b) => def(b) - def(a)).slice(0, 3) : [];
  const opMaos = [{ m1: null, m2: null }, ...armas.map((w) => ({ m1: w, m2: null })),
    ...combos(armas, 2).map(([a, b]) => ({ m1: a, m2: b })), ...armas.flatMap((w) => escudos.map((e) => ({ m1: w, m2: e })))];
  const melhorDe = (campo, ops) => { let best = atual[campo], nb = nota(atual); for (const o of ops) { const r = nota({ ...atual, [campo]: o }); if (r > nb + 1e-12) { nb = r; best = o; } } atual[campo] = best; };
  melhorDe("mao", opMaos);
  const grupo = (lista, campo, ok) => { const t = topo(lista, campo); const c = combos(t, Math.min(3, t.length), ok); return c.length ? c : (t.length ? t.map((x) => [x]) : [[]]); };
  const opCi = grupo(us.filter((i) => i.dados?.tipo === "implante" && i.dados.familia === "ciber"), "ciber", (xs) => new Set(xs.map((x) => x.dados.regiao)).size === xs.length);
  const opBi = grupo(us.filter((i) => i.dados?.tipo === "implante" && i.dados.familia === "bio"), "bio");
  const opAc = grupo(us.filter((i) => i.slot === "acessorio"), "acess");
  for (let volta = 0; volta < 2; volta++) { melhorDe("ciber", opCi); melhorDe("bio", opBi); melhorDe("acess", opAc); melhorDe("mao", opMaos); }
  return { eq: montar(atual), avaliacoes: av.n };
}

// ── (3) Magias: as das escolas da build que a Inteligência libera ──────────
export function magiasDaBuild(build, attr) {
  return MAGIAS.filter((m) => !m.unica && build.magias.includes(m.tipo) && R.podeUsarMagia(m, attr));
}
// Sincroniza o grimório desta era: as da build entram; as de outras escolas saem;
// as únicas (pergaminho de missão especial) ficam sempre
function sincronizarMagias(uid, build, attr) {
  const unicas = new Set(MAGIAS.filter((m) => m.unica).map((m) => m.id));
  const tem = db.listarMagias(ERA, uid).map((x) => x.magiaId);
  const querer = new Set([...tem.filter((id) => unicas.has(id)), ...magiasDaBuild(build, attr).map((m) => m.id)]);
  if (tem.some((id) => !querer.has(id))) db.limparMagias(ERA, uid);
  const agora = new Set(db.listarMagias(ERA, uid).map((x) => x.magiaId));
  const novas = [...querer].filter((id) => !agora.has(id));
  for (const id of novas) db.aprenderMagia(ERA, uid, id);
  return novas.filter((id) => !tem.includes(id));
}

// ── (4) No banco ────────────────────────────────────────────────────────────
function gravarEquipamento(uid, eqAntes, eq) {
  for (const s of db.SLOTS) {
    const a = eqAntes[s]?.id ?? null, b = eq[s]?.id ?? null;
    if (a === b) continue;
    if (b) db.equipar(ERA, uid, s, b); else db.desequipar(ERA, uid, s);
  }
}
// Os pontos livres (e as magias que eles liberam) — a cada nível novo
export function aplicarPontos(uid) {
  const p = db.getPersonagem(ERA, uid);
  if (!p) return null;
  const build = buildDe(p), dist = distribuirPontos(p, build);
  const gasto = Object.values(dist.gastos).reduce((s, x) => s + x, 0);
  if (gasto) db.salvarPersonagem(ERA, uid, { ...Object.fromEntries(Object.keys(dist.gastos).map((k) => [k, dist.attr[k]])), pontos: (p.pontos ?? 0) - gasto });
  const party = CB.partyDe(ERA, uid);
  return { gastos: dist.gastos, magias: sincronizarMagias(uid, build, party.attr) };
}
// Trocar de build: os pontos voltam e se redistribuem, a busca completa equipa e
// o grimório se refaz. → { build, avaliacoes, trocas }
export function trocarBuild(uid, buildId, { teto = TETO_AVALIACOES } = {}) {
  const build = BUILDS[buildId];
  let p = db.getPersonagem(ERA, uid);
  if (!p || !build) return null;
  p = db.salvarPersonagem(ERA, uid, { classe: build.id, ...devolverPontos(p) });
  const dist = distribuirPontos(p, build);
  const gasto = Object.values(dist.gastos).reduce((s, x) => s + x, 0);
  p = db.salvarPersonagem(ERA, uid, { ...dist.attr, pontos: (p.pontos ?? 0) - gasto });
  const eqAntes = db.getEquipado(ERA, uid);
  const party = CB.partyDe(ERA, uid, p);
  const inv = db.getInventario(ERA, uid).filter((i) => !["contrato", "pergaminho"].includes(i.slot));
  const { eq, avaliacoes } = melhorEquipamento(p, dist.attr, inv, party, build, { teto });
  gravarEquipamento(uid, eqAntes, eq);
  const magias = sincronizarMagias(uid, build, CB.partyDe(ERA, uid).attr);
  const trocas = db.SLOTS.filter((s) => (eqAntes[s]?.id ?? null) !== (eq[s]?.id ?? null)).length;
  return { build, avaliacoes, trocas, magias };
}
// Um item que chegou (loot, compra, recompensa): melhor na vaga dele → equipa
// (o que sai fica na mochila, para outra build); pior → não fica. A mochila
// recebe o item antes; `vender(item)` decide o que vira ouro.
// → { equipou: slot | null, saiu, avaliacoes }
export function receberItem(uid, item) {
  const p = db.getPersonagem(ERA, uid);
  if (!p || !item) return { equipou: null, saiu: null, avaliacoes: 0 };
  const build = buildDe(p), eq = db.getEquipado(ERA, uid), party = CB.partyDe(ERA, uid, p);
  const attr = Object.fromEntries(R.ATR.map((k) => [k, p[k]]));
  const c = compararNaVaga(p, attr, eq, party, build, item);
  if (!c.melhora) return { equipou: null, saiu: null, avaliacoes: c.avaliacoes };
  db.equipar(ERA, uid, c.slot, item.id);
  return { equipou: c.slot, saiu: c.saiu, avaliacoes: c.avaliacoes };
}
