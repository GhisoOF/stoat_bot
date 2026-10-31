// arte-texto.js — desenho feito de caracteres (braille, blocos, símbolos) no
// perfil (31 out 2026, P3a).
//
// O caso real (30 out, _notas/casos-perfil.md): uma bio com dois desenhos NSFW
// em braille, 50 linhas. Texto nenhum do sentinela pega isso — não há palavra.
// A regra de forma: ≥ 4 linhas com ≥ 70% de braille/bloco/símbolo é "arte em
// texto" → vai para a fila do dono (não pune sozinha). A impressão: o braille
// vira bitmap (cada caractere são 2×4 pontos) e passa pelo MESMO dHash das
// imagens (hash.js), por desenho e do conjunto — pega a mesma arte com pequenas
// edições. O sha256 do texto normalizado pega a arte idêntica.
//
// Nada da arte é guardado: só as impressões (o repositório é público).

import { dhashDeBitmap, sha256, parecido, distancia, hashUtil } from "./hash.js";
import { CONHECIDOS } from "./conhecidos.js";

export const MIN_LINHAS = 4, PROPORCAO = 0.7, MIN_CARACTERES = 4;
const BRAILLE_VAZIO = 0x2800;

// Braille, desenho de caixa/blocos/formas, símbolos diversos, dingbats e os
// blocos de "computação legada" (sextantes). Emoji não: bio enfeitada de emoji
// é comum demais para ir à fila.
export function ehSimbolo(cp) {
  return (cp >= 0x2800 && cp <= 0x28ff) || (cp >= 0x2500 && cp <= 0x25ff)
    || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x1fb00 && cp <= 0x1fbff);
}
const ehBraille = (cp) => cp >= 0x2800 && cp <= 0x28ff;
const ESPACO = /\s/u;   // U+2800 NÃO é espaço para o JS: conta como braille

// largura "crua": em code points, sem os espaços comuns do fim (o U+2800 do fim fica)
const semFimComum = (l) => String(l).trimEnd();   // linear (o `\s+$` volta atrás em linha longa)
export const larguraCrua = (l) => [...semFimComum(l)].length;

export function linhaDeArte(linha) {
  const cps = [...semFimComum(String(linha ?? ""))].map((c) => c.codePointAt(0));
  const visiveis = cps.filter((cp) => !ESPACO.test(String.fromCodePoint(cp)));
  if (visiveis.length < MIN_CARACTERES) return false;
  return visiveis.filter(ehSimbolo).length / visiveis.length >= PROPORCAO;
}

const linhasDe = (texto) => String(texto ?? "").replace(/\r\n?/g, "\n").split("\n");

// ── O bitmap: 2 colunas × 4 linhas de pontos por caractere ──────────────────
// Braille Unicode: bit 0..7 = pontos 1,2,3,4,5,6,7,8 →
//   (0,0) (0,1) (0,2) (1,0) (1,1) (1,2) (0,3) (1,3)   [coluna, linha]
const PONTO = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3]];
const Q = { UL: [[0, 0], [0, 1]], UR: [[1, 0], [1, 1]], LL: [[0, 2], [0, 3]], LR: [[1, 2], [1, 3]] };
const quad = (...q) => q.flatMap((k) => Q[k]);
const TODOS = [...quad("UL", "UR", "LL", "LR")];
const XADREZ = [[0, 0], [1, 1], [0, 2], [1, 3]];
const BLOCOS = {
  0x2580: quad("UL", "UR"), 0x2584: quad("LL", "LR"), 0x2588: TODOS,
  0x258c: quad("UL", "LL"), 0x2590: quad("UR", "LR"),
  0x2591: [[0, 0], [1, 2]], 0x2592: XADREZ, 0x2593: [...XADREZ, [1, 0], [0, 3]],
  0x2594: [[0, 0], [1, 0]], 0x2595: [[1, 0], [1, 1], [1, 2], [1, 3]],
  0x2596: quad("LL"), 0x2597: quad("LR"), 0x2598: quad("UL"), 0x2599: quad("UL", "LL", "LR"),
  0x259a: quad("UL", "LR"), 0x259b: quad("UL", "UR", "LL"), 0x259c: quad("UL", "UR", "LR"),
  0x259d: quad("UR"), 0x259e: quad("UR", "LL"), 0x259f: quad("UR", "LL", "LR"),
};
function pontosDe(cp) {
  if (cp === BRAILLE_VAZIO || ESPACO.test(String.fromCodePoint(cp))) return [];
  if (ehBraille(cp)) return PONTO.filter((_, i) => (cp - 0x2800) & (1 << i));
  if (BLOCOS[cp]) return BLOCOS[cp];
  if (cp >= 0x2581 && cp <= 0x2587) { const n = Math.round((cp - 0x2580) / 2); return [...Array(n)].flatMap((_, i) => [[0, 3 - i], [1, 3 - i]]); }
  if (cp >= 0x2589 && cp <= 0x258f) return (0x2590 - cp) >= 4 ? [...quad("UL", "LL"), ...((0x2590 - cp) >= 6 ? quad("UR", "LR") : [])] : [[0, 0], [0, 1], [0, 2], [0, 3]];
  return XADREZ;   // outro símbolo ou letra: meia tinta
}

// O ponto é CLARO (255) sobre fundo escuro — como o braille aparece no tema escuro.
export function bitmapDe(linhas) {
  const cps = linhas.map((l) => [...semFimComum(l)].map((c) => c.codePointAt(0)));
  const w = Math.max(1, ...cps.map((l) => l.length)) * 2, h = Math.max(1, linhas.length) * 4;
  const px = new Uint8Array(w * h);
  cps.forEach((linha, y) => linha.forEach((cp, x) => {
    for (const [dx, dy] of pontosDe(cp)) px[(y * 4 + dy) * w + x * 2 + dx] = 255;
  }));
  return { px, w, h };
}

// ── Separar os desenhos ─────────────────────────────────────────────────────
// Um desenho acaba numa linha vazia (ou de texto comum) ou quando a largura
// MUDA E SE FIRMA: as 4 linhas antes têm uma largura, as 4 depois têm outra
// (gerador de arte em braille escreve todas as linhas do mesmo tamanho; uma
// largura que oscila linha a linha é do próprio desenho e não corta nada).
const FIRME = 4;
function cortarPorLargura(bloco) {
  const w = bloco.map((b) => b.largura);
  const partes = [];
  let inicio = 0;
  for (let i = FIRME; i <= w.length - FIRME; i++) {
    if (i - inicio < FIRME || w[i] === w[i - 1]) continue;
    const antes = w.slice(i - FIRME, i), depois = w.slice(i, i + FIRME);
    if (antes.every((x) => x === antes[0]) && depois.every((x) => x === depois[0])) { partes.push(bloco.slice(inicio, i)); inicio = i; }
  }
  partes.push(bloco.slice(inicio));
  return partes;
}

export function separarDesenhos(texto) {
  const corridas = [];
  let atual = [];
  linhasDe(texto).forEach((l, i) => {
    if (linhaDeArte(l)) atual.push({ i, linha: l, largura: larguraCrua(l) });
    else if (atual.length) { corridas.push(atual); atual = []; }
  });
  if (atual.length) corridas.push(atual);
  return corridas.flatMap(cortarPorLargura).filter((b) => b.length >= MIN_LINHAS);
}

// ── Normalização e sha256 ───────────────────────────────────────────────────
// A regra (documentada nas notas do P3a): fim de linha CRLF/CR → LF; U+2800 →
// espaço; sem espaço (de nenhum tipo) no fim de cada linha; linhas unidas por
// "\n"; sem linhas vazias no começo nem no fim. Como não se sabe de que recorte
// o sha256 do caso 1 foi tirado, a impressão é um CONJUNTO: o texto inteiro, o
// texto sem linhas vazias, só as linhas de arte, e cada desenho.
export const normalizarLinha = (l) => String(l ?? "").replace(/\u2800/g, " ").trimEnd();
export function normalizar(linhas) {
  const n = linhas.map(normalizarLinha);
  while (n.length && !n[0]) n.shift();
  while (n.length && !n[n.length - 1]) n.pop();
  return n.join("\n");
}

export function impressoesDoTexto(texto) {
  const linhas = linhasDe(texto);
  const desenhos = separarDesenhos(texto);
  const recortes = [
    linhas,
    linhas.filter((l) => normalizarLinha(l)),
    linhas.filter(linhaDeArte),
    ...desenhos.map((d) => d.map((x) => x.linha)),
  ];
  return [...new Set(recortes.map(normalizar).filter(Boolean).map(sha256))];
}

// ── A detecção ──────────────────────────────────────────────────────────────
// null = não é arte. Senão, só números e impressões (nada do texto da arte):
// as linhas de texto comum (ex. "pt,en") vão em `textoSolto` para o dono
// entender o contexto — nunca a arte.
export function detectarArte(texto) {
  const linhas = linhasDe(texto);
  const daArte = linhas.filter(linhaDeArte);
  if (daArte.length < MIN_LINHAS) return null;
  const desenhos = separarDesenhos(texto).map((d) => {
    const { px, w, h } = bitmapDe(d.map((x) => x.linha));
    return { linhas: d.length, w, h, dhash: dhashDeBitmap(px, w, h) };
  });
  const tudo = bitmapDe(daArte);
  const braille = [...daArte.join("")].filter((c) => ehBraille(c.codePointAt(0))).length;
  return {
    linhasArte: daArte.length,
    desenhos,
    conjunto: { linhas: daArte.length, w: tudo.w, h: tudo.h, dhash: dhashDeBitmap(tudo.px, tudo.w, tudo.h) },
    braille,
    impressoes: impressoesDoTexto(texto),
    textoSolto: linhas.filter((l) => normalizarLinha(l) && !linhaDeArte(l)).map(normalizarLinha).join(" / ").slice(0, 120),
  };
}

// ── O idioma do texto solto (31 out 2026, P3a, revisão) ──────────────────────
// O resumo que vai à fila leva só números e o idioma — nunca texto livre da bio
// (PRIVACIDADE.md). Uma linha só de códigos de idioma ("pt,en", "PT | EN") vale como
// está; senão, o mais provável entre pt/en/es pelas palavras comuns (ou nada).
const CODIGOS_IDIOMA = new Set(["pt", "en", "es", "fr", "de", "it", "ja", "ko", "zh", "ru", "ar", "pl", "nl", "tr"]);
const COMUNS = {
  pt: new Set(["que", "nao", "voce", "com", "uma", "para", "eu", "meu", "minha", "sou", "de", "do", "da", "e", "o", "os", "as", "um", "tambem", "aqui", "muito", "ola", "oi"]),
  en: new Set(["the", "and", "you", "with", "for", "my", "i", "am", "is", "are", "of", "to", "a", "an", "this", "hello", "hi", "not", "me"]),
  es: new Set(["que", "no", "tu", "con", "una", "para", "yo", "mi", "soy", "de", "del", "la", "el", "los", "las", "un", "tambien", "aqui", "muy", "hola", "y"]),
};
export function idiomaDoTexto(texto) {
  const s = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const partes = s.split(/[^a-z]+/).filter(Boolean);
  if (!partes.length) return null;
  if (partes.length <= 6 && partes.every((p) => CODIGOS_IDIOMA.has(p))) return [...new Set(partes)].join(",");
  const pontos = Object.entries(COMUNS).map(([l, set]) => [l, partes.filter((p) => set.has(p)).length]).sort((a, b) => b[1] - a[1]);
  return pontos[0][1] >= 2 && pontos[0][1] > pontos[1][1] ? pontos[0][0] : null;
}

const negativo = (h) => (~BigInt(`0x${h}`) & 0xffffffffffffffffn).toString(16).padStart(16, "0");
// As impressões dHash de uma detecção (cada desenho e o conjunto), úteis.
export const dhashesDe = (arte) => [...new Set([...(arte?.desenhos ?? []).map((d) => d.dhash), arte?.conjunto?.dhash].filter(hashUtil))];

// Casa com um "conhecido proibido"? → a entrada (ou null)
export function conhecido(arte, lista = CONHECIDOS) {
  if (!arte) return null;
  const shas = new Set(arte.impressoes ?? []);
  const meus = dhashesDe(arte);
  for (const c of lista) {
    if ((c.sha256 ?? []).some((s) => shas.has(s))) return { ...c, por: "sha256" };
    for (const ref of c.dhash ?? []) {
      const refs = c.dhashExterno ? [ref, negativo(ref)] : [ref];
      if (meus.some((h) => refs.some((r) => parecido(h, r)))) return { ...c, por: "dhash", distancia: Math.min(...meus.flatMap((h) => refs.map((r) => distancia(h, r)))) };
    }
  }
  return null;
}
