// O RPG é um MUNDO SÓ (decisão de Ghieh, 1 out 2026).
//
// Antes cada servidor tinha o seu jogo: personagem, mochila, companheiros,
// moedas e mercado próprios — e o dono configurava quantas moedas quisesse
// (12 perfis prontos, modelos "mundo real", "fantasia"…). Agora:
//   • um personagem por PESSOA, o mesmo em qualquer servidor onde a Judy está;
//   • um mercado, uma dungeon e um câmbio para todos;
//   • só DUAS moedas: uma infinita (o dinheiro do dia a dia, sem teto) e uma
//     finita (suprimento fixo — quando o banco esgota, só circula entre
//     jogadores).
// Por baixo, as tabelas continuam com a coluna serverId: o mundo é o
// "servidor" MUNDO. Assim a lógica do jogo não precisou ser reescrita.

import * as db from "../core/db.js";

export const MUNDO = "mundo";

// As duas moedas. Nome e símbolo podem mudar (&game admin moeda set); o tipo,
// não — é o que define o mundo.
export const MOEDAS_DO_MUNDO = [
  { id: "ouro", nome: "Ouro", simbolo: "🪙", finita: false, padrao: true,
    dificuldade: 1, nivelMin: 1, suprimentoBase: 200000 },   // infinita: o suprimento é só a referência do P
  // Cristal: 40× mais raro nas missões e com suprimento 40× menor — então
  // 1 Cristal vale ~40 Ouro no câmbio do banco (que segue a razão das reservas).
  { id: "cristal", nome: "Cristal", simbolo: "💎", finita: true, padrao: false,
    dificuldade: 40, nivelMin: 5, suprimentoBase: 5000 },    // finita: existe só isso, para sempre
];
export const IDS_MOEDAS = new Set(MOEDAS_DO_MUNDO.map((m) => m.id));

// Garante as duas moedas (sem desfazer nome/símbolo que o dono trocou) e
// apaga qualquer outra que tenha sobrado.
export function garantirMoedasDoMundo() {
  const atuais = db.listarMoedas(MUNDO);
  for (const base of MOEDAS_DO_MUNDO) {
    const ja = atuais.find((m) => m.id === base.id);
    if (!ja) {
      db.upsertMoeda(MUNDO, { ...base, mercado: base.suprimentoBase });
      continue;
    }
    // o tipo e a posição de padrão são fixos
    const fix = {};
    if (!!ja.finita !== base.finita) fix.finita = base.finita ? 1 : 0;
    if (!!ja.padrao !== base.padrao) fix.padrao = base.padrao ? 1 : 0;
    if (Object.keys(fix).length) db.salvarMoeda(MUNDO, base.id, fix);
  }
  for (const m of db.listarMoedas(MUNDO)) if (!IDS_MOEDAS.has(m.id)) db.removerMoeda(MUNDO, m.id);
  return db.moedaPadrao(MUNDO);
}

// Progresso do jogo (todas as linhas, de todos os servidores). O catálogo de
// itens e companheiros — a curadoria do dono — fica.
export const TABELAS_DE_PROGRESSO = ["rpg_personagem", "rpg_inventario", "rpg_equipado", "rpg_follower_itens",
  "rpg_magias", "rpg_followers", "rpg_moedas", "rpg_carteira", "rpg_estoque", "rpg_ofertas"];

const MARCA = "__rpg_mundo__";
export const VERSAO_MUNDO = 1;

// Na primeira subida com o mundo global, o jogo de cada servidor é zerado
// (pedido de Ghieh: "reseta o game nos servidores"). Só uma vez — a marca
// fica na tabela de config.
export function prepararMundo({ log = console.log } = {}) {
  const marca = db.lerConfig(MARCA);
  if ((marca?.versao ?? 0) < VERSAO_MUNDO) {
    const d = db.getDb();
    const apagados = {};
    for (const t of TABELAS_DE_PROGRESSO) {
      try { apagados[t] = d.prepare(`DELETE FROM ${t}`).run().changes ?? 0; }
      catch (e) { log(`[RPG][mundo] ${t}: ${e.message}`); }
    }
    db.gravarConfig(MARCA, { versao: VERSAO_MUNDO, resetEm: Date.now(), apagados });
    log(`[RPG] mundo global criado — jogo dos servidores zerado: ${Object.entries(apagados).filter(([, n]) => n).map(([t, n]) => `${t}=${n}`).join(" ") || "nada a apagar"}`);
  }
  return garantirMoedasDoMundo();
}
