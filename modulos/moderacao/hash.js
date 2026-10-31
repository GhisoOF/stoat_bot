// hash.js — as impressões de imagem e de texto da moderação (31 out 2026, P3a).
//
// Um lugar só para o hash perceptual (dHash) e o sha256: o bot usa para a arte
// em texto (o braille vira bitmap) e o ia-servico usa para as fotos (o `sharp`
// decodifica e reduz; a comparação é esta). Nada de dependência nova (R11).
//
// dHash 8×8 (64 bits): a imagem em tons de cinza é reduzida a 9×8; cada bit diz
// se o pixel da DIREITA é mais claro que o da esquerda (linha por linha, de cima
// para baixo, bit mais alto primeiro). É a convenção do `imagehash` do Python.
// Duas imagens "iguais com pequenas edições" ficam a poucos bits de distância.

import { createHash } from "node:crypto";

export const LARGURA = 9, ALTURA = 8;

// `cinza`: valores 0–255, linha por linha, exatamente 9×8.
export function dhash(cinza, w = LARGURA, h = ALTURA) {
  if (w !== LARGURA || h !== ALTURA || !cinza || cinza.length < w * h) throw new Error("dhash: preciso de uma grade 9×8");
  let bits = 0n;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits = (bits << 1n) | (cinza[y * w + x + 1] > cinza[y * w + x] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

// Redução por média de área (cada pixel de destino é a média ponderada da
// região que cobre na origem). Serve para qualquer tamanho, inclusive menor que 9×8.
export function reduzir(px, w, h, W = LARGURA, H = ALTURA) {
  if (!(w > 0 && h > 0)) throw new Error("reduzir: imagem vazia");
  const out = new Float64Array(W * H);
  const sx = w / W, sy = h / H;
  for (let Y = 0; Y < H; Y++) {
    const y0 = Y * sy, y1 = y0 + sy;
    for (let X = 0; X < W; X++) {
      const x0 = X * sx, x1 = x0 + sx;
      let soma = 0, area = 0;
      for (let y = Math.floor(y0); y < Math.min(h, Math.ceil(y1)); y++) {
        const cy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (cy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.min(w, Math.ceil(x1)); x++) {
          const cx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (cx <= 0) continue;
          soma += px[y * w + x] * cx * cy; area += cx * cy;
        }
      }
      out[Y * W + X] = area ? soma / area : 0;
    }
  }
  return out;
}

export const dhashDeBitmap = (px, w, h) => dhash(reduzir(px, w, h), LARGURA, ALTURA);

const HEX = /^[0-9a-f]{16}$/;
export const hashValido = (h) => HEX.test(String(h ?? ""));

const pop = (n) => { let c = 0; while (n) { n &= n - 1n; c++; } return c; };
export function distancia(a, b) {
  if (!hashValido(a) || !hashValido(b)) return Infinity;
  return pop(BigInt(`0x${a}`) ^ BigInt(`0x${b}`));
}

// Hash "degenerado" (imagem lisa, quase sem bordas: quase tudo 0 ou tudo 1)
// casaria com qualquer outra imagem lisa — não serve de impressão.
export function hashUtil(h) {
  if (!hashValido(h)) return false;
  const n = pop(BigInt(`0x${h}`));
  return n >= 4 && n <= 60;
}

// Mesma imagem com pequenas edições: até 6 bits de 64 (≈ 9%).
export const PARECIDO = 6;
export const parecido = (a, b, max = PARECIDO) => hashUtil(a) && hashUtil(b) && distancia(a, b) <= max;

export const sha256 = (texto) => createHash("sha256").update(String(texto ?? ""), "utf8").digest("hex");
