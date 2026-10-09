// De onde sai a moeda (D8 — docs/rpg, "contrato e dungeon"):
//   • CONTRATO (missão da guilda) paga do BANCO — o mercado das duas moedas. O
//     banco não cria moeda: enche com metade do que se gasta no NPC, com o que
//     se perde ao cair num contrato, com o câmbio e a taxa do bazar.
//   • DUNGEON paga do TESOURO dela, que se renova sozinho no ritmo de quem joga
//     nela — a única fonte de moeda nova do jogo.
// Quanto paga: alvo do nível da missão × f(x), x = estoque ÷ (alvo × K) — banco
// cheio paga mais, vazio paga menos, e nunca chega a zero de vez.

import * as db from "../core/db.js";
import * as R from "./regras.js";
import { MUNDO } from "./mundo.js";
import { DUNGEONS } from "./conteudo.js";

const HORA = 3600_000;

function alvos(nivel, mult) {
  return { ouro: R.alvoOuro(nivel) * mult, cristal: R.alvoCristal(nivel) * mult };
}
// Cristal pequeno arredonda pela sorte: 0,38 vira 1 com 38% de chance.
const inteiroPelaSorte = (x, aleatorio) => Math.floor(x + aleatorio());

// Banco → jogador. mult: perigo (D26) e o que mais multiplicar a recompensa.
export function pagarDoBanco(uid, nivel, { mult = 1, cristal = true, aleatorio = Math.random } = {}) {
  const a = alvos(nivel, mult), pago = { ouro: 0, cristal: 0 };
  for (const id of cristal ? ["ouro", "cristal"] : ["ouro"]) {
    const m = db.getMoeda(MUNDO, id); if (!m) continue;
    const bruto = R.pagamento(a[id], m.mercado ?? 0, R.ECO.kBanco);
    const q = Math.min(Math.floor(m.mercado ?? 0), id === "cristal" ? inteiroPelaSorte(bruto, aleatorio) : Math.floor(bruto));
    if (q < 1) continue;
    db.salvarMoeda(MUNDO, id, { mercado: (m.mercado ?? 0) - q });
    db.creditar(MUNDO, uid, id, q);
    pago[id] = q;
  }
  return pago;
}

// ── Tesouro da dungeon ───────────────────────────────────────────────────────
export function ativos(dungeonId, agora = Date.now()) {
  return db.ativosDungeon(dungeonId, agora - 24 * HORA);
}
// Renova de hora em hora: cada jogador que jogou nela nas últimas 24 h traz 3
// pagamentos do nível dele por dia; não passa de 1,5 × a capacidade.
export function renovar(dungeonId, agora = Date.now()) {
  const d = db.getDungeon(dungeonId) ?? db.salvarDungeon(dungeonId, { renovadoEm: agora });
  const horas = (agora - (d.renovadoEm || agora)) / HORA;
  if (horas < 1 / 60) return d;
  const at = ativos(dungeonId, agora);
  if (!at.length) return db.salvarDungeon(dungeonId, { renovadoEm: agora });
  const cap = capacidade(dungeonId, at);
  const ganho = { ouro: 0, cristal: 0 };
  for (const j of at) { ganho.ouro += R.alvoOuro(j.nivel); ganho.cristal += R.alvoCristal(j.nivel); }
  const f = R.ECO.regenPorJogador * Math.min(horas, 24) / 24;
  return db.salvarDungeon(dungeonId, {
    ouro: d.ouro + Math.max(0, Math.min(cap.ouro * R.ECO.capacidade - d.ouro, ganho.ouro * f)),
    cristal: d.cristal + Math.max(0, Math.min(cap.cristal * R.ECO.capacidade - d.cristal, ganho.cristal * f)),
    renovadoEm: agora });
}
// Capacidade = K pagamentos do nível médio de quem está lá, × (1 + ativos/10).
export function capacidade(dungeonId, at = null) {
  at ??= ativos(dungeonId);
  const n = Math.max(1, at.length), K = R.kDungeon(at.length);
  const nivelMedio = at.length ? at.reduce((s, j) => s + j.nivel, 0) / at.length : (DUNGEONS.get(dungeonId)?.niveis?.[1] ?? 1);
  return { ouro: R.alvoOuro(nivelMedio) * K, cristal: R.alvoCristal(nivelMedio) * K, K, ativos: at.length, nivelMedio, n };
}
export function pagarDaDungeon(dungeonId, uid, nivel, { mult = 1, aleatorio = Math.random } = {}) {
  const d = renovar(dungeonId);
  const K = R.kDungeon(ativos(dungeonId).length);
  const a = alvos(nivel, mult), pago = { ouro: 0, cristal: 0 }, campos = {};
  for (const id of ["ouro", "cristal"]) {
    const est = d[id] ?? 0;
    const bruto = R.pagamento(a[id], est, K);
    const q = Math.min(Math.floor(est), id === "cristal" ? inteiroPelaSorte(bruto, aleatorio) : Math.floor(bruto));
    if (q < 1) continue;
    campos[id] = est - q;
    db.creditar(MUNDO, uid, id, q);
    pago[id] = q;
  }
  if (Object.keys(campos).length) db.salvarDungeon(dungeonId, campos);
  return pago;
}
// "cheio", "na média", "quase vazio" — o que a lista de dungeons mostra
export function estadoDoTesouro(dungeonId, nivel) {
  const d = renovar(dungeonId), K = R.kDungeon(ativos(dungeonId).length);
  const x = (d.ouro ?? 0) / Math.max(1e-9, R.alvoOuro(nivel) * K);
  return { x, ouro: d.ouro ?? 0, cristal: d.cristal ?? 0, rotulo: x >= 1.5 ? "cheio" : x >= 0.5 ? "na média" : x > 0.05 ? "quase vazio" : "vazio",
    rotuloEN: x >= 1.5 ? "full" : x >= 0.5 ? "average" : x > 0.05 ? "nearly empty" : "empty", f: R.fEstoque(x) };
}

// ── Cair: perde uma fração do que carrega (das duas moedas) ─────────────────
// Num contrato vai para o banco; numa dungeon, para o tesouro dela.
export function cair(uid, fracao, dungeonId = null) {
  const perdido = { ouro: 0, cristal: 0 };
  for (const id of ["ouro", "cristal"]) {
    const q = Math.floor(db.getSaldo(MUNDO, uid, id) * fracao);
    if (q < 1) continue;
    db.debitar(MUNDO, uid, id, q);
    perdido[id] = q;
    if (dungeonId) { const d = db.getDungeon(dungeonId) ?? db.salvarDungeon(dungeonId, { renovadoEm: Date.now() }); db.salvarDungeon(dungeonId, { [id]: (d[id] ?? 0) + q }); }
    else { const m = db.getMoeda(MUNDO, id); if (m) db.salvarMoeda(MUNDO, id, { mercado: (m.mercado ?? 0) + q }); }
  }
  return perdido;
}

// ── O NPC consome metade do que se gasta nele (o ralo) ──────────────────────
export function npcRecebe(moedaId, qtd) {
  const m = db.getMoeda(MUNDO, moedaId);
  if (!m || !(qtd > 0)) return 0;
  const volta = Math.floor(qtd * R.ECO.voltaAoBanco);
  db.salvarMoeda(MUNDO, moedaId, { mercado: (m.mercado ?? 0) + volta });
  return volta;
}

// Migração (D8): o pote da dungeon de antes é dividido entre os tesouros das
// dungeons genéricas.
export function dividirPoteAntigo() {
  const genericas = [...DUNGEONS.values()].filter((d) => !d.obra);
  const feito = { ouro: 0, cristal: 0 };
  for (const id of ["ouro", "cristal"]) {
    const m = db.getMoeda(MUNDO, id);
    const pote = Math.floor(m?.dungeon ?? 0);
    if (!pote || !genericas.length) continue;
    const parte = Math.floor(pote / genericas.length), resto = pote - parte * genericas.length;
    genericas.forEach((d, k) => {   // o resto da divisão vai para a primeira — nada se perde
      const t = db.getDungeon(d.id) ?? db.salvarDungeon(d.id, { renovadoEm: Date.now() });
      db.salvarDungeon(d.id, { [id]: (t[id] ?? 0) + parte + (k === 0 ? resto : 0) });
    });
    db.salvarMoeda(MUNDO, id, { dungeon: 0 });
    feito[id] = pote;
  }
  return feito;
}
