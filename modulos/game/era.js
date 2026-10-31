// As eras do RPG (P2, 31 out 2026).
//
// O RPG recomeçou do zero na era `mundo:v5` — decisão de Ghieh ("recomeçar do
// zero, sem converter personagens"). NADA foi apagado: as tabelas do jogo têm a
// coluna `serverId`, e cada era é um "servidor" diferente (o v4 era o "mundo").
// O personagem antigo continua no banco, só que invisível ao jogo; cada pessoa
// recomeça com `&game criar`.
//
// As tabelas sem `serverId` (únicos, esperas, tesouros e quem joga em cada
// dungeon) ganham o prefixo da era na chave (`v5:chefe:b_rei_ratos`).
//
// Purga da era antiga: ver PURGA abaixo — escrita, não executada.

import * as db from "../core/db.js";

export const ERA = "mundo:v5";
export const ERA_TAG = "v5";
// As eras anteriores: só leitura (o `&privacidade apagar` também as apaga)
export const ERAS_ANTIGAS = ["mundo"];

// Prazo da purga da era antiga (o v4, serverId "mundo"): 90 dias depois do
// recomeço. Como seria feita (NÃO roda hoje): um `rodarUmaVez("2027-01-29-purga-rpg-v4")`
// no db.js, numa transação, apagando de rpg_personagem, rpg_inventario,
// rpg_equipado, rpg_magias, rpg_carteira, rpg_followers, rpg_moedas,
// rpg_estoque e rpg_ofertas as linhas com serverId = 'mundo' (e as 'sandbox:%'
// do teste antigo); de rpg_unicos e rpg_espera as chaves SEM prefixo de era
// (`chave NOT LIKE 'v_:%'`); de rpg_dungeons e rpg_dungeon_ativos os ids sem
// prefixo; e as marcas de config `__rpg_mundo__`, `__rpg_v4__`, `__rpg_inteiros__`.
// Até lá, quem pedir `&privacidade apagar` some de todas as eras na hora.
export const PURGA = { era: "mundo", recomeco: "2026-10-31", prazo: "2027-01-29", dias: 90 };

// Chave de único/espera/dungeon desta era
export const chave = (k) => `${ERA_TAG}:${k}`;
export const temUnico = (uid, k) => db.temUnico(uid, chave(k));
export const marcarUnico = (uid, k) => db.marcarUnico(uid, chave(k));
export const esperaAte = (uid, k) => db.esperaAte(uid, chave(k));
export const marcarEspera = (uid, k, ate) => db.marcarEspera(uid, chave(k), ate);

// O `&game apagar`: a pessoa SÓ nesta era (as antigas ficam como estão)
export function apagarDaEra(userId) {
  return db.rpgApagarDaEra(ERA, String(userId), `${ERA_TAG}:%`);
}

// O `&privacidade apagar` (quem chama é a área da IA): a pessoa em TODAS as eras —
// personagens, mochila, ouro, aliados, magias, únicos, esperas, ofertas e duelos.
// Devolve quantas linhas saíram (0 = não havia nada).
export function apagarJogadorTodasAsEras(userId) {
  const u = String(userId ?? "").trim();
  if (!u) return 0;
  return db.rpgApagarJogador(u);
}

// Quantos personagens há em cada era (a atual e as antigas)
export function resumoDasEras() {
  const linhas = db.rpgPersonagensPorEra();
  return {
    atual: linhas.find((l) => l.era === ERA)?.n ?? 0,
    antigas: linhas.filter((l) => l.era !== ERA).map((l) => ({ era: l.era, n: l.n })),
  };
}
