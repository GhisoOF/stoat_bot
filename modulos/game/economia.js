// ══════════════════════════════════════════════════════════
//  economia.js — o mecanismo acoplado
//
//  Tudo gira em torno do P: a concentração da moeda nas mãos dos
//  jogadores.
//
//      P = moeda com os players ÷ (players + mercado)
//
//  A dungeon NÃO entra no cálculo — o que está preso lá saiu de
//  circulação de verdade.
//
//  Duas consequências opostas se equilibram sozinhas:
//   • P alto  (players ricos)  → itens baratos, morrer custa caro
//   • P baixo (mercado cheio)  → itens caros, morrer custa pouco
//
//  Isso empurra gente rica a gastar e gente pobre a arriscar, sem
//  ninguém precisar ajustar nada à mão.
// ══════════════════════════════════════════════════════════

// ── Parâmetros (calibráveis) ──────────────────────────────
export const CFG = {
  // perda ao cair, em fração do que carrega
  perdaPiso: 0.05, perdaA: 0.10, perdaB: 3, perdaC: 0.015, perdaD: 3.2,
  // multiplicador de preço
  multMin: 0.5, multMax: 2.5,
  // recompra do NPC — rMax PRECISA ser < 1 (ver abaixo)
  rMin: 0.35, rMax: 0.70,
  // dungeon
  fMin: 0.05, fMax: 0.20, rRef: 5000,
  // câmbio do sistema
  spread: 0.03,
  // suavização do P (peso do valor novo na média móvel)
  alfaP: 0.15,
};

// ── P ─────────────────────────────────────────────────────
export function calcularP(comPlayers, noMercado) {
  // Em moeda INFINITA o "mercado" é volume de referência, não estoque. Se
  // alguém o zerar, o P travaria em 100% para sempre (denominador = só os
  // jogadores) e os preços/perda ficariam presos no extremo. O piso evita isso.
  const referencia = Math.max(1, noMercado ?? 0);
  const total = (comPlayers ?? 0) + referencia;
  if (total <= 0) return 0.5;
  return Math.max(0, Math.min(1, (comPlayers ?? 0) / total));
}

// P suavizado: média móvel, para uma compra grande não sacudir o
// mercado inteiro de uma vez (§10.4 do design).
export function suavizar(pAntigo, pNovo, alfa = CFG.alfaP) {
  if (pAntigo == null || !Number.isFinite(pAntigo)) return pNovo;
  return pAntigo * (1 - alfa) + pNovo * alfa;
}

// ── Perda ao cair ─────────────────────────────────────────
// Cresce devagar no começo e dispara quando os players estão ricos.
export function perda(P) {
  const { perdaPiso: piso, perdaA: a, perdaB: b, perdaC: c, perdaD: d } = CFG;
  const v = piso + a * Math.log(1 + b * P) + c * (Math.exp(d * P) - 1);
  return Math.max(0, Math.min(0.95, v));
}

// ── Preços ────────────────────────────────────────────────
export function mult(P) {
  const { multMin: MIN, multMax: MAX } = CFG;
  return MIN + (MAX - MIN) * (1 - perda(P));
}

// Item de estoque infinito: sem termo de escassez (o denominador iria a zero).
// Eles funcionam como piso de preço do jogo.
export function precoInfinito(precoBase, P) {
  return Math.max(1, Math.round(precoBase * mult(P)));
}

// Item finito: quanto mais raro no mercado, mais caro.
export function precoFinito(precoBase, quantidadeBase, qtdNoMercado, P) {
  const escassez = quantidadeBase / Math.max(1, qtdNoMercado);
  return Math.max(1, Math.round(precoBase * escassez * mult(P)));
}

export function precoDeVenda(item, estoque, P) {
  if (item.infinito) return precoInfinito(item.precoBase, P);
  const base = estoque?.base ?? 10;
  const qtd = estoque?.quantidade ?? base;
  return precoFinito(item.precoBase, base, qtd, P);
}

// ── Recompra do NPC ───────────────────────────────────────
//
// ⚠️ rMax PRECISA ser estritamente menor que 1.
//
// Com item de estoque infinito, recomprar por ≥ o preço de venda vira
// máquina de dinheiro infinito: compra por X, vende por X, repete para
// sempre. Com 0,70, cada ciclo perde 30% e o loop nunca lucra. Este teto
// não é balanceamento — é o que impede a economia de colapsar.
export function fatorRecompra(carisma) {
  const rMax = Math.min(0.95, CFG.rMax);   // trava dura, mesmo se mal configurado
  const norm = Math.sqrt(Math.max(0, carisma)) / (Math.sqrt(Math.max(0, carisma)) + 6);
  return CFG.rMin + (rMax - CFG.rMin) * norm;
}

export function precoDeRecompra(precoVenda, carisma) {
  return Math.max(1, Math.floor(precoVenda * fatorRecompra(carisma)));
}

// ── Dungeon-reservatório ──────────────────────────────────
// Fração pequena e progressiva: pote cheio devolve mais, pote vazio
// devolve quase nada. A raiz faz crescer rápido no começo e desacelerar.
export function fracaoDungeon(R) {
  const { fMin, fMax, rRef } = CFG;
  const razao = Math.min(1, Math.max(0, (R ?? 0) / rRef));
  return fMin + (fMax - fMin) * Math.sqrt(razao);
}

export function premioDungeon(R) {
  return Math.floor((R ?? 0) * fracaoDungeon(R));
}

// ── Câmbio do sistema (o "banco") ─────────────────────────
// O banco é um par de reservas, e o preço é a razão entre elas — o mesmo
// princípio de uma casa de câmbio automática.
//
// A conta é `saida = Rout × q / (Rin + q)`: quanto maior a troca, pior a taxa
// DENTRO da própria troca. Isso é o que fecha a arbitragem. A versão anterior
// cobrava o preço de antes e só depois movia as reservas, então a volta do
// A→B→A colhia o movimento que a ida tinha causado e sobrava dinheiro — dava
// para imprimir moeda girando o câmbio.
//
// Quem torna uma moeda cara é a reserva pequena: Bitcoin nasce com 210 contra
// 200.000 do Real, e é daí que sai o "1 BTC vale ~950 Reais". `dificuldade` e
// `suprimentoBase` andam juntos (veja o GUIA-moedas), então configurar a
// raridade continua sendo uma coisa só.
export function reservaDe(moeda) {
  return Math.max(1, moeda?.mercado ?? moeda?.suprimentoBase ?? 1);
}

// Taxa marginal — quantas unidades de `para` vale 1 de `de` agora. É a que
// aparece na tela; a troca real usa a fórmula acima e desliza um pouco.
export function taxaCambio(de, para) {
  return reservaDe(para) / reservaDe(de);
}

export function converter(quantidade, de, para) {
  const Rin = reservaDe(de), Rout = reservaDe(para);
  const q = Math.max(0, quantidade ?? 0);
  const bruto = (Rout * q) / (Rin + q);
  const taxa = bruto * CFG.spread;
  return { recebe: Math.max(0, Math.floor(bruto - taxa)), taxa: Math.ceil(taxa) };
}

// ── Taxa do mercado entre jogadores ───────────────────────
// Quase nada em movimento normal; sobe com o volume recente, como custo de
// congestionamento. A raiz faz subir sem nunca inviabilizar negociar.
export const TAXA_BASE = 0.005;   // 0,5%
export const VOLUME_REF = 20000;
export const TAXA_K = 1.5;

// Satura numa fração razoável: mesmo com volume absurdo a taxa se aproxima do
// TAXA_TETO sem passar dele. Sem isso, volume alto o bastante levaria a taxa
// acima de 100% — o vendedor pagaria para vender, o que é sem sentido.
export const TAXA_TETO = 0.08;   // 8%

export function taxaMercado(volumeRecente = 0) {
  const razao = Math.max(0, volumeRecente) / VOLUME_REF;
  const cresc = Math.sqrt(razao) / (Math.sqrt(razao) + 3);   // 0 → 1, nunca chega a 1
  return TAXA_BASE + (TAXA_TETO - TAXA_BASE) * cresc;
}

export function calcularTaxa(valor, volumeRecente = 0) {
  const pct = taxaMercado(volumeRecente);
  return { pct, valor: Math.max(0, Math.floor(valor * pct)) };
}

// ── Recompensa de missão ──────────────────────────────────
// Escala com a dificuldade e com o valor da moeda (P baixo = moeda cara,
// então paga menos unidades).
// Qual moeda sai desta missão.
//
// A `dificuldade` da moeda é o que a torna rara: quanto maior, menor a chance
// de aparecer, e só em missões de nível alto o bastante. A moeda padrão
// (dificuldade 1) é o piso — sempre pode cair, para ninguém ficar sem nada.
export function sortearMoeda(moedas, missao, aleatorio = Math.random) {
  const nivel = missao.nivel ?? 1;
  const elegiveis = (moedas ?? []).filter((m) => (m.nivelMin ?? 1) <= nivel);
  if (!elegiveis.length) return null;

  // peso inversamente proporcional à dificuldade
  const pesos = elegiveis.map((m) => 1 / Math.max(0.1, m.dificuldade ?? 1));
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = aleatorio() * total;
  for (let i = 0; i < elegiveis.length; i++) {
    if (r < pesos[i]) return elegiveis[i];
    r -= pesos[i];
  }
  return elegiveis[0];
}

// Quanto sai. Moeda difícil rende MENOS unidades — ela vale mais.
export function moedaDaMissao(missao, P, sorte = 0, dificuldade = 1) {
  const base = { mercado: 8, facil: 20, medio: 60, dificil: 180 }[
    missao.tipo === "mercado" ? "mercado" : missao.dificuldade] ?? 10;
  const escala = missao.tipo === "mercado" ? 1 : Math.pow(1.35, (missao.nivel ?? 1) - 1);
  const bonusSorte = 1 + 0.04 * Math.sqrt(Math.max(0, sorte));
  const ajusteP = 0.6 + 0.8 * (1 - (P ?? 0.5));
  const ajusteDif = 1 / Math.max(0.1, dificuldade);
  return Math.max(1, Math.round(base * escala * bonusSorte * ajusteP * ajusteDif));
}
