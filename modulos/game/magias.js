// O grimório (RPG v4, D10): 10 magias de ataque e 10 de suporte, da comum à
// suprema, mais as únicas das missões especiais (que só saem como pergaminho).
// Sem nível mínimo: cada uma pede Inteligência ≥ 5 × dificuldade − 4. A Mana
// decide quantas cabem; o preço, quando dá para comprar.

import * as R from "./regras.js";
import { MAGIAS } from "./conteudo.js";

export const ESCOLAS = {
  ataque:  { rotulo: "Ataque",  rotuloEN: "Attack",  emoji: "🔥" },
  suporte: { rotulo: "Suporte", rotuloEN: "Support", emoji: "✨" },
};

export const CATALOGO = MAGIAS;

export function getMagia(id) {
  return CATALOGO.find((m) => m.id === id) ?? null;
}

export function acharMagia(texto) {
  const limpo = (x) => String(x ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  const alvo = limpo(texto);
  if (!alvo) return null;
  return CATALOGO.find((m) => limpo(m.id) === alvo)
      ?? CATALOGO.find((m) => limpo(m.nome) === alvo || limpo(m.nomeEN) === alvo)
      ?? CATALOGO.find((m) => limpo(m.nome).includes(alvo) || limpo(m.nomeEN).includes(alvo))
      ?? CATALOGO.find((m) => limpo(m.id).includes(alvo))
      ?? null;
}

export const magiasAtivas = R.magiasAtivas;

export function precoComCarisma(preco, carisma = 0) {
  const desconto = Math.max(0.6, 1 - 0.02 * Math.sqrt(Math.max(0, carisma)));
  return Math.max(1, Math.ceil(preco * desconto));
}
