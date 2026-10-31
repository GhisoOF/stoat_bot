// De onde sai o ouro (D8; P2 31 out 2026: uma moeda só, o Ouro):
//   • CONTRATO e missão especial pagam do BANCO — o banco não cria ouro: enche com
//     metade do que se gasta no NPC e com o que se perde ao cair;
//   • DUNGEON paga do TESOURO dela, que se renova sozinho no ritmo de quem joga
//     nela — a única fonte de ouro novo do jogo.
// Quanto paga: alvo do nível × f(x), x = estoque ÷ (alvo × K) — cheio paga mais,
// vazio paga menos, e nunca chega a zero de vez.
// Os tesouros e quem joga em cada dungeon são desta era (chave `v5:<dungeon>`).

import * as db from "../core/db.js";
import * as R from "./regras.js";
import { ERA, chave } from "./era.js";
import { DUNGEONS } from "./conteudo.js";

const HORA = 3600_000;
export const MOEDA = "ouro";
// O Ouro desta era (o banco começa com o suprimento de referência)
export const OURO = { id: MOEDA, nome: "Ouro", simbolo: "🪙", finita: false, padrao: true, dificuldade: 1, nivelMin: 1, suprimentoBase: 200000 };
export function garantirOuro() {
  return db.getMoeda(ERA, MOEDA) ?? db.upsertMoeda(ERA, { ...OURO, mercado: OURO.suprimentoBase }) ?? db.getMoeda(ERA, MOEDA);
}
export const saldo = (uid) => Math.floor(db.getSaldo(ERA, uid, MOEDA));
const banco = () => garantirOuro()?.mercado ?? 0;
const mexerNoBanco = (delta) => db.salvarMoeda(ERA, MOEDA, { mercado: Math.max(0, banco() + delta) });

// Banco → jogador (até o que o banco tem). mult: perigo e o que mais multiplicar.
export function pagarDoBanco(uid, nivel, { mult = 1 } = {}) {
  const tem = Math.floor(banco());
  const q = Math.min(tem, Math.floor(R.pagamento(R.alvoOuro(nivel) * mult, tem, R.ECO.kBanco)));
  if (q < 1) return 0;
  mexerNoBanco(-q);
  db.creditar(ERA, uid, MOEDA, q);
  return q;
}
// O NPC paga um valor fixo (o item pior que vira ouro) — também do banco
export function pagarFixo(uid, qtd) {
  const q = Math.min(Math.floor(banco()), Math.max(0, Math.floor(qtd)));
  if (q < 1) return 0;
  mexerNoBanco(-q);
  db.creditar(ERA, uid, MOEDA, q);
  return q;
}
// Jogador → NPC: metade volta ao banco, a outra metade o NPC consome (o ralo).
// Devolve false sem saldo (nada muda).
export function cobrar(uid, qtd) {
  const q = Math.ceil(qtd);
  if (!(q > 0) || saldo(uid) < q) return false;
  db.debitar(ERA, uid, MOEDA, q);
  mexerNoBanco(Math.floor(q * R.ECO.voltaAoBanco));
  return true;
}

// ── Tesouro da dungeon ───────────────────────────────────────────────────────
const idT = (dungeonId) => chave(dungeonId);
export const ativos = (dungeonId, agora = Date.now()) => db.ativosDungeon(idT(dungeonId), agora - 24 * HORA);
export const marcarAtivo = (dungeonId, uid, nivel) => db.marcarAtivoDungeon(idT(dungeonId), uid, nivel);
export const tesouro = (dungeonId) => db.getDungeon(idT(dungeonId))?.ouro ?? 0;
export const porNoTesouro = (dungeonId, q) => db.salvarDungeon(idT(dungeonId), { ouro: tesouro(dungeonId) + q, renovadoEm: db.getDungeon(idT(dungeonId))?.renovadoEm || Date.now() });
// Capacidade = K pagamentos do nível médio de quem está lá
export function capacidade(dungeonId, at = null) {
  at ??= ativos(dungeonId);
  const K = R.kDungeon(at.length);
  const nivelMedio = at.length ? at.reduce((s, j) => s + j.nivel, 0) / at.length : (DUNGEONS.get(dungeonId)?.niveis?.[1] ?? 1);
  return { ouro: R.alvoOuro(nivelMedio) * K, K, ativos: at.length, nivelMedio };
}
// Renova de hora em hora: cada jogador das últimas 24 h traz 3 pagamentos do
// nível dele por dia; não passa de 1,5 × a capacidade.
export function renovar(dungeonId, agora = Date.now()) {
  const d = db.getDungeon(idT(dungeonId)) ?? db.salvarDungeon(idT(dungeonId), { renovadoEm: agora });
  const horas = (agora - (d.renovadoEm || agora)) / HORA;
  if (horas < 1 / 60) return d;
  const at = ativos(dungeonId, agora);
  if (!at.length) return db.salvarDungeon(idT(dungeonId), { renovadoEm: agora });
  const cap = capacidade(dungeonId, at);
  const ganho = at.reduce((s, j) => s + R.alvoOuro(j.nivel), 0) * R.ECO.regenPorJogador * Math.min(horas, 24) / 24;
  return db.salvarDungeon(idT(dungeonId), { ouro: d.ouro + Math.max(0, Math.min(cap.ouro * R.ECO.capacidade - d.ouro, ganho)), renovadoEm: agora });
}
export function pagarDaDungeon(dungeonId, uid, nivel, { mult = 1 } = {}) {
  const d = renovar(dungeonId);
  const est = d.ouro ?? 0, K = R.kDungeon(ativos(dungeonId).length);
  const q = Math.min(Math.floor(est), Math.floor(R.pagamento(R.alvoOuro(nivel) * mult, est, K)));
  if (q < 1) return 0;
  db.salvarDungeon(idT(dungeonId), { ouro: est - q });
  db.creditar(ERA, uid, MOEDA, q);
  return q;
}

// ── Cair: perde uma fração do ouro que carrega ──────────────────────────────
// Num contrato vai para o banco; numa dungeon, para o tesouro dela.
export function cair(uid, dungeonId = null) {
  const q = Math.floor(saldo(uid) * R.ECO.perdaAoCair);
  if (q < 1) return 0;
  db.debitar(ERA, uid, MOEDA, q);
  if (dungeonId) porNoTesouro(dungeonId, q); else mexerNoBanco(q);
  return q;
}
