// Migração para o RPG v4 (D13 e §9 do plano) — roda uma vez, na subida.
//
//   • nível novo = 2 × antigo − 1 (cada um continua na mesma faixa: o 22 vira
//     43); o progresso dentro do nível continua (D11); os pontos dos níveis
//     novos entram como pontos livres e a base sobe com o nível, como sempre;
//   • a vaga "arma" vira "mão principal" (mao1) — D14;
//   • companheiro não usa mais item (D23): o que estava com eles volta para a
//     mochila do dono;
//   • o pote da dungeon de antes é dividido entre os tesouros das dungeons (D8).
// Nada é apagado.

import * as db from "../core/db.js";
import * as R from "./regras.js";
import { MUNDO } from "./mundo.js";
import { dividirPoteAntigo } from "./tesouro.js";

const MARCA = "__rpg_v4__";
export const VERSAO = 1;
const xpParaNivelAntigo = (n) => Math.round(100 * Math.pow(1.5, Math.max(2, n) - 2));

export function migrarPersonagem(p) {
  const n = Math.max(1, p.nivel ?? 1), novo = 2 * n - 1;
  const progresso = Math.max(0, Math.min(0.999, (p.xp ?? 0) / xpParaNivelAntigo(n + 1)));
  const ganhoBase = R.baseDoNivel(novo) - R.baseDoNivel(n);
  let pontos = p.pontos ?? 0;
  for (let k = n + 1; k <= novo; k++) pontos += R.pontosPorNivel(p.inteligencia, p.sorte);
  const campos = { nivel: novo, progresso, xp: 0, pontos: Math.round(pontos * 100) / 100 };
  if (ganhoBase > 0) for (const a of R.ATR) campos[a] = (p[a] ?? 1) + ganhoBase;
  return campos;
}

// Tudo numa transação só — personagens, vagas, itens, pote E a marca. Se o
// processo cair no meio, nada fica gravado e a próxima subida refaz do zero;
// nunca migra duas vezes (a marca é conferida de novo dentro da transação).
export function migrarParaV4({ log = console.log } = {}) {
  if ((db.lerConfig(MARCA)?.versao ?? 0) >= VERSAO) return null;
  const d = db.getDb();
  const feito = { personagens: 0, armas: 0, itensDeCompanheiro: 0, pote: null };
  const tx = () => {
    for (const p of d.prepare("SELECT * FROM rpg_personagem WHERE serverId = ?").all(MUNDO)) {
      db.salvarPersonagem(MUNDO, p.userId, migrarPersonagem(p));
      feito.personagens++;
    }
    feito.armas = d.prepare("UPDATE OR IGNORE rpg_equipado SET slot = 'mao1' WHERE slot = 'arma'").run().changes ?? 0;
    d.prepare("DELETE FROM rpg_equipado WHERE slot = 'arma'").run();
    // (o capturado está sem dono: o item volta para quem era o dono dele)
    for (const l of d.prepare(`SELECT fi.followerId, fi.itemId, COALESCE(f.donoId, f.donoOriginal) AS donoId, f.serverId FROM rpg_follower_itens fi
      JOIN rpg_followers f ON f.id = fi.followerId`).all()) {
      if (l.donoId) { db.darItem(l.serverId, l.donoId, l.itemId); feito.itensDeCompanheiro++; }
    }
    d.prepare("DELETE FROM rpg_follower_itens").run();
    // o nível guardado do companheiro passa a ser só informativo: ele sobe com o dono
    d.prepare(`UPDATE rpg_followers SET nivel = COALESCE((SELECT nivel FROM rpg_personagem p
      WHERE p.serverId = rpg_followers.serverId AND p.userId = rpg_followers.donoId), nivel)`).run();
  };
  d.exec("BEGIN IMMEDIATE");
  try {
    if ((db.lerConfig(MARCA)?.versao ?? 0) >= VERSAO) { d.exec("ROLLBACK"); return null; }
    tx();
    feito.pote = dividirPoteAntigo();
    db.gravarConfig(MARCA, { versao: VERSAO, em: Date.now(), ...feito });
    d.exec("COMMIT");
  } catch (e) { try { d.exec("ROLLBACK"); } catch { /* já desfeita */ } throw e; }
  if (feito.personagens || feito.armas || feito.itensDeCompanheiro) {
    log(`[RPG] v4: ${feito.personagens} personagem(ns) migrado(s) (nível ×2 − 1), ${feito.armas} arma(s) para a mão principal, ${feito.itensDeCompanheiro} item(ns) de companheiro de volta à mochila`);
  }
  return feito;
}
