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
  const total = (comPlayers ?? 0) + (noMercado ?? 0);
  if (total <= 0) return 0.5;
  return Math.max(0, Math.min(1, comPlayers / total));
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

// ── Câmbio do sistema ─────────────────────────────────────
// Taxa derivada do P das duas moedas. O spread vai para o mercado e é o
// que impede o loop A→B→A lucrar com a oscilação.
export function taxaCambio(pDe, pPara) {
  const valorDe = 1 / Math.max(0.05, pDe ?? 0.5);
  const valorPara = 1 / Math.max(0.05, pPara ?? 0.5);
  return valorDe / valorPara;
}

export function converter(quantidade, pDe, pPara) {
  const bruto = quantidade * taxaCambio(pDe, pPara);
  const taxa = bruto * CFG.spread;
  return { recebe: Math.max(0, Math.floor(bruto - taxa)), taxa: Math.ceil(taxa) };
}

// ── Recompensa de missão ──────────────────────────────────
// Escala com a dificuldade e com o valor da moeda (P baixo = moeda cara,
// então paga menos unidades).
export function moedaDaMissao(missao, P, sorte = 0) {
  const base = { mercado: 8, facil: 20, medio: 60, dificil: 180 }[
    missao.tipo === "mercado" ? "mercado" : missao.dificuldade] ?? 10;
  const escala = missao.tipo === "mercado" ? 1 : Math.pow(1.35, (missao.nivel ?? 1) - 1);
  const bonusSorte = 1 + 0.04 * Math.sqrt(Math.max(0, sorte));
  const ajusteP = 0.6 + 0.8 * (1 - (P ?? 0.5));   // moeda escassa rende mais unidades? não: menos
  return Math.max(1, Math.round(base * escala * bonusSorte * ajusteP));
}
