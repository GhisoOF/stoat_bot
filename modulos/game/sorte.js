// A Sorte em todo sorteio do RPG (P2, 31 out 2026 — decisão de Ghieh: "a Sorte
// influencia o drop de itens, os companheiros e o RNG em geral").
//
// Um ponto só: `rolar(chance, sorte)`. `sorte` é a sorte RELATIVA — a do
// personagem dividida pela média do nível dele (1 = na média). Na média a
// chance não muda; acima, sobe com a raiz (4× a média → 2× a chance) até o
// TETO; abaixo, desce até o PISO; e nunca passa de 1.
//
// A luta (regras.resolverLuta) fica FORA: as missões são calibradas em 40% de
// êxito e 70% de sobrevivência, e a Sorte já entra lá como atributo (resiliência).
// O duelo também fica fora (é luta).

import * as R from "./regras.js";

export const SORTE = { teto: 2, piso: 0.5 };

const entre01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

// Quanto a sorte multiplica uma chance (1 na média)
export function fatorSorte(sorte = 1) {
  if (!(sorte > 0) || !Number.isFinite(sorte)) return sorte === Infinity ? SORTE.teto : SORTE.piso;
  return Math.min(SORTE.teto, Math.max(SORTE.piso, Math.sqrt(sorte)));
}
export const chanceComSorte = (chance, sorte = 1) => Math.min(1, entre01(chance) * fatorSorte(sorte));
export const rolar = (chance, sorte = 1, aleatorio = Math.random) => aleatorio() < chanceComSorte(chance, sorte);

// A sorte média de um nível: a base de todos os atributos mais os pontos do
// nível (os da party de referência, regras.pontosAte) divididos pelos nove.
export function sorteMedia(nivel = 1) {
  const { base, pts } = R.pontosAte(Math.max(1, Math.round(nivel)));
  return base + pts / R.ATR.length;
}
export const sorteRelativa = (sorteDoPersonagem, nivel) => Math.max(0, sorteDoPersonagem ?? 0) / sorteMedia(nivel);

// Um sorteio entre várias saídas ({ chave: chance }, da mais comum para a mais
// rara; o que sobra de 1 é "nada"). Cada chance passa pela sorte; se a soma
// passar de 1, quem cede é o começo da tabela (o mais comum) — a sorte alta
// traz mais item E item mais raro. Na sorte média é o mesmo sorteio de sempre.
export function sortear(tabela, sorte = 1, aleatorio = Math.random) {
  const ent = Object.entries(tabela).map(([k, c]) => [k, chanceComSorte(c, sorte)]);
  let livre = 1;
  for (let i = ent.length - 1; i >= 0; i--) { ent[i][1] = Math.min(ent[i][1], livre); livre -= ent[i][1]; }
  let x = aleatorio();
  for (const [chave, c] of ent) { if (x < c) return chave; x -= c; }
  return null;
}
