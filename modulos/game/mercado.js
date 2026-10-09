// As contas do mercado do RPG (preço, P, câmbio, dungeon) — só do jogo.

export const CFG = {
  // perda ao cair, em fração do que carrega
  perdaPiso: 0.05, perdaA: 0.10, perdaB: 3, perdaC: 0.015, perdaD: 3.2,
  // multiplicador de preço
  multMin: 0.5, multMax: 2.5,
  // recompra do NPC — rMax PRECISA ser < 1 (ver abaixo)
  rMin: 0.35, rMax: 0.70,
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

// (4 out 2026) Dinheiro do jogo é SEMPRE inteiro: o que o jogador recebe
// arredonda para baixo, o que ele paga arredonda para cima. Antes sobravam
// frações ("0,1849 Ouro", "4,02 Cristal") que não compravam nada.
export function precoDeRecompra(precoVenda, carisma) {
  return Math.max(1, Math.floor(precoVenda * fatorRecompra(carisma)));
}
// Um preço na moeda principal convertido para outra moeda: arredonda para CIMA
// (quem paga não paga fração — e nunca menos que 1).
export function custoEm(preco, moedaPreco, moedaPaga) {
  if (moedaPreco?.id === moedaPaga?.id) return Math.ceil(preco);
  return Math.max(1, Math.ceil(preco / Math.max(1e-9, taxaCambio(moedaPaga, moedaPreco))));
}

export const CASAS = 0;   // moedas inteiras (4 out 2026)
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

// Câmbio com o banco, em unidades INTEIRAS: recebe o máximo de unidades
// inteiras que a quantidade compra, e `gasta` é só o necessário para elas —
// o resto fica com o jogador (antes ele gastava tudo e recebia "4,02").
export function converter(quantidade, de, para) {
  const Rin = reservaDe(de), Rout = reservaDe(para);
  const q = Math.max(0, Math.floor(quantidade ?? 0));
  const s = CFG.spread;
  const liquido = ((Rout * q) / (Rin + q)) * (1 - s);
  const recebe = Math.max(0, Math.floor(liquido + 1e-9));
  if (!recebe) return { recebe: 0, gasta: 0, taxa: 0 };
  // quanto de `de` compra exatamente `recebe` unidades (resolve a fórmula de cima)
  const precisa = Math.min(q, Math.ceil((recebe * Rin) / (Rout * (1 - s) - recebe) - 1e-9));
  const bruto = (Rout * precisa) / (Rin + precisa);
  return { recebe, gasta: Math.max(1, precisa), taxa: Math.max(0, Math.round(bruto * s)) };
}

export const TAXA_BASE = 0.005;   // 0,5%
export const VOLUME_REF = 20000;
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
