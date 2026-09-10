
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

export function calcularP(comPlayers, noMercado) {
  const referencia = Math.max(1, noMercado ?? 0);
  const total = (comPlayers ?? 0) + referencia;
  if (total <= 0) return 0.5;
  return Math.max(0, Math.min(1, (comPlayers ?? 0) / total));
}

export function suavizar(pAntigo, pNovo, alfa = CFG.alfaP) {
  if (pAntigo == null || !Number.isFinite(pAntigo)) return pNovo;
  return pAntigo * (1 - alfa) + pNovo * alfa;
}

export function perda(P) {
  const { perdaPiso: piso, perdaA: a, perdaB: b, perdaC: c, perdaD: d } = CFG;
  const v = piso + a * Math.log(1 + b * P) + c * (Math.exp(d * P) - 1);
  return Math.max(0, Math.min(0.95, v));
}

export function mult(P) {
  const { multMin: MIN, multMax: MAX } = CFG;
  return MIN + (MAX - MIN) * (1 - perda(P));
}

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

export function fatorRecompra(carisma) {
  const rMax = Math.min(0.95, CFG.rMax);   // trava dura, mesmo se mal configurado
  const norm = Math.sqrt(Math.max(0, carisma)) / (Math.sqrt(Math.max(0, carisma)) + 6);
  return CFG.rMin + (rMax - CFG.rMin) * norm;
}

export function precoDeRecompra(precoVenda, carisma) {
  return Math.max(0.000001, arredondar(precoVenda * fatorRecompra(carisma)));
}

export function fracaoDungeon(R) {
  const { fMin, fMax, rRef } = CFG;
  const razao = Math.min(1, Math.max(0, (R ?? 0) / rRef));
  return fMin + (fMax - fMin) * Math.sqrt(razao);
}

export function premioDungeon(R) {
  return arredondar((R ?? 0) * fracaoDungeon(R));
}

export const CASAS = 6;
export function arredondar(n, casas = CASAS) {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, casas);
  return Math.round(n * f) / f;
}

export function reservaDe(moeda) {
  return Math.max(1, moeda?.mercado ?? moeda?.suprimentoBase ?? 1);
}

export function taxaCambio(de, para) {
  return reservaDe(para) / reservaDe(de);
}

export function converter(quantidade, de, para) {
  const Rin = reservaDe(de), Rout = reservaDe(para);
  const q = Math.max(0, quantidade ?? 0);
  const bruto = (Rout * q) / (Rin + q);
  const taxa = bruto * CFG.spread;
  // Sem piso: o que sobra em fração continua sendo dinheiro do jogador.
  return {
    recebe: Math.max(0, arredondar(bruto - taxa)),
    taxa: arredondar(taxa),
  };
}

export const TAXA_BASE = 0.005;   // 0,5%
export const VOLUME_REF = 20000;
export const TAXA_K = 1.5;

export const TAXA_TETO = 0.08;   // 8%

export function taxaMercado(volumeRecente = 0) {
  const razao = Math.max(0, volumeRecente) / VOLUME_REF;
  const cresc = Math.sqrt(razao) / (Math.sqrt(razao) + 3);   // 0 → 1, nunca chega a 1
  return TAXA_BASE + (TAXA_TETO - TAXA_BASE) * cresc;
}

export function calcularTaxa(valor, volumeRecente = 0) {
  const pct = taxaMercado(volumeRecente);
  return { pct, valor: Math.max(0, arredondar(valor * pct)) };
}

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
