// Missões do RPG v4 (G3, D6, D8, D26): contratos da guilda (pagos pelo banco),
// bicos sem risco, missões especiais (recompensa única, uma vez por pessoa),
// encontros de dungeon (pagos pelo tesouro dela) e chefes. A luta é uma só
// para todos — regras.preverLuta — e a força de cada uma sai de regras.missao.
//
// Os números de antes (fácil/médio/difícil, folga de nível, XP ×1,5 por nível)
// saíram: docs/rpg/PLANO-RPG-CONTEUDO.md §1.

import * as R from "./regras.js";
import { CONTRATOS, BICOS, ESPECIAIS, DUNGEONS, CHEFES } from "./conteudo.js";

export { CONTRATOS, BICOS, ESPECIAIS, DUNGEONS, CHEFES };
// bico: sem risco e paga 10% — com 30 min de espera rende metade de um contrato
// por hora (com 10 min rendia mais que o contrato, e esvaziava o banco)
export const ESPERA_MIN = { contrato: R.MISSAO.espera, dungeon: R.MISSAO.espera, especial: R.MISSAO.espera, bico: 30 };
// quantos níveis uma vitória pode dar, no máximo (o nível 1 carregado no co-op
// por um chefe do nível 60 não pula para o 51)
export const NIVEIS_POR_LUTA = 2;
export const ESPECIAL_PRIMEIRA_H = 2;   // até o primeiro êxito de uma especial
export const CHEFE_ESPERA_H = 24;      // D19: por pessoa, por chefe
export const CAPTURA = 0.20;           // só na dungeon (§6.4)
export const COMPANHEIRO_LOOT = 0.07;  // por êxito, da faixa ou uma abaixo
export const LOOT_TEMA = 0.70;         // na dungeon, 70% do loot é do tema

// Sem acento e sem caixa: "cacar o lobo branco" acha "Caçar o Lobo Branco".
const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function achar(lista, txt) {
  const alvo = semAcento(txt);
  if (!alvo) return null;
  return lista.find((m) => m.id === alvo)
      ?? lista.find((m) => semAcento(m.nome) === alvo || semAcento(m.nomeEN) === alvo)
      ?? lista.find((m) => semAcento(m.nome).includes(alvo) || semAcento(m.nomeEN).includes(alvo))
      ?? null;
}
export const acharContrato = (t) => achar([...CONTRATOS, ...BICOS], t);
export const acharEspecial = (t) => achar(ESPECIAIS, t);
export const acharDungeon = (t) => achar([...DUNGEONS.values()], t);
export const acharChefe = (t) => achar([...CHEFES.values()], t);
// (compatibilidade: o co-op e o admin acham missões pelo nome)

// ── A força de cada luta ─────────────────────────────────────────────────────
// alvo: { poder, risco, base, perigo, nivel, dificuldade }
export function alvoDe(missao, nivelJogador = 1) {
  if (missao.tipo === "bico") return { poder: 0, risco: 0, base: R.BASE.normal, perigo: "baixo", nivel: Math.max(1, nivelJogador), dificuldade: R.faixaDoNivel(nivelJogador).n };
  if (missao.tipo === "chefe") { const c = R.chefeDungeon(missao.nivel); return { ...c, base: R.BASE.chefe, perigo: missao.perigo ?? "normal" }; }
  if (missao.tipo === "especial") return { ...R.missao(missao.nivel, R.BASE.especial), base: R.BASE.especial, perigo: missao.perigo ?? "normal" };
  return { ...R.missao(missao.nivel), base: R.BASE.normal, perigo: missao.perigo ?? "normal" };
}
// O encontro da dungeon: o nível de quem joga, dentro dos níveis da dungeon.
export function nivelDoEncontro(dungeon, nivelJogador) {
  return Math.max(dungeon.niveis[0], Math.min(dungeon.niveis[1], Math.round(nivelJogador)));
}
export function areaDoNivel(dungeon, nivel) {
  const dif = R.faixaDoNivel(nivel).n;
  return dungeon.areas.find((a) => a.dif === dif) ?? dungeon.areas.at(-1);
}
export function encontro(dungeon, nivelJogador, aleatorio = Math.random) {
  const nivel = nivelDoEncontro(dungeon, nivelJogador);
  const area = areaDoNivel(dungeon, nivel);
  const ini = area.inimigos[Math.floor(aleatorio() * area.inimigos.length)] ?? area.inimigos[0];
  const nomeArea = area.nome?.pt ?? dungeon.nome;
  return { id: `${dungeon.id}:${nivel}`, tipo: "dungeon", dungeon: dungeon.id, nome: dungeon.nome, nomeEN: dungeon.nomeEN, nivel, perigo: dungeon.perigo ?? "normal",
    descricao: dungeon.descricao, area,
    historia: { generos: dungeon.generos, local: [{ pt: nomeArea, art: "", en: area.nome?.en ?? dungeon.nomeEN }], inimigo: [ini] }, inimigo: ini };
}

// ── Recompensa (D6): a força da missão, igual para todos ────────────────────
// XP = o poder da missão (× perigo); o custo do nível acompanha a força.
export function xpDa(missao, alvo, nivelJogador) {
  const pg = R.PERIGO[alvo.perigo ?? "normal"] ?? R.PERIGO.normal;
  if (missao.tipo === "bico") return R.missao(nivelJogador).poder * 0.1;   // 10% de um êxito no seu nível
  return alvo.poder * pg.recompensa;
}
export const multRecompensa = (alvo) => (R.PERIGO[alvo.perigo ?? "normal"] ?? R.PERIGO.normal).recompensa;
export const nivelPago = (missao, alvo, nivelJogador) => (missao.tipo === "bico" ? nivelJogador : alvo.nivel);

// Previsão rápida para listas (só números): quanto um êxito vale em nível.
export function valeNiveis(xp, nivel, progresso = 0) {
  const s = R.subirForca(nivel, progresso, xp);
  return (s.nivel - nivel) + (s.progresso - progresso);
}
