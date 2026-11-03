// texto-sinais.js — o extrator de sinais de texto (P5, 3 nov 2026; contrato 1 do BRIEF-P5).
//
// Uma mensagem vira um vetor ESPARSO de números: pedaços de palavra (n-gramas de 3 a 5
// caracteres), palavras e pares de palavras, cada um passado por hash (FNV-1a 32 bits) para
// uma de DIMENSOES posições, com o sinal (+/−) tirado do próprio hash ("feature hashing com
// sinal"), e o vetor normalizado (comprimento 1, L2). É o que o classificador de texto lê
// (classificador-texto.js) e o que fica guardado nas impressões de treino. Menções, links,
// IDs e NÚMEROS (telefone, valor, documento) viram marcadores antes de tudo.
// (3 nov 2026, P5 revisão) ATENÇÃO — antes este comentário dizia "do vetor não se reconstrói a
// mensagem". É falso: o hash não tem chave e os n-gramas se sobrepõem, então quem tem o vetor
// testa pedaços candidatos e remonta o texto (a revisão remontou mensagens inteiras em
// milissegundos). Por isso o vetor é tratado COMO O PRÓPRIO TEXTO: fica o mesmo prazo do
// trecho (7 dias depois do registro) e sai com o `&privacidade apagar` (treino.js, db.js). O
// que dura é o modelo treinado (pesos somados de muitos casos), sem garantia formal de anonimato.
//
// Puro e determinístico: a mesma mensagem dá o mesmo vetor aqui, na bateria (que importa
// este arquivo do JUDY_REPO) e daqui a um ano. O que muda o vetor muda a VERSAO_SINAIS, e
// modelo ou impressão de outra versão são ignorados.
//
// A normalização contra disfarces (leet, letras separadas por ponto ou espaço, cirílico só onde
// é disfarce — o russo de verdade fica russo —, letras "fancy", invisíveis) é a MESMA do sentinela (scorecard.normalizarParaAnalise —
// DRY: um lugar só); aqui ela só ganha o que o vetor precisa a mais: marcadores, minúsculas,
// sem acento, letras esticadas juntas, espaços colapsados.

import { normalizarParaAnalise } from "./scorecard.js";

export const DIMENSOES = 2 ** 18;
export const TETO = 2000;                       // entradas por mensagem, no máximo
const MASCARA = DIMENSOES - 1;
const MAX_TEXTO = 4000;                         // o Stoat corta em 2000; aqui é só um teto de CPU (R11)

// ─── Normalização ──────────────────────────────────────────────────────────────
// Marcadores: só letras (a normalização do sentinela não os mexe — leet e "letras
// separadas" só agem em palavra com número ou letra solta), e longe de palavra comum.
// (3 nov 2026, P5 revisão) + numero: o que sobra de número depois da normalização (o leet já virou letra)
export const MARCADORES = Object.freeze({ mencao: "qqmencao", cargo: "qqcargo", canal: "qqcanal", link: "qqlink", id: "qqid", emoji: "qqemoji", numero: "qqnumero" });
const RE_MENCAO = /<@!?[0-9A-Za-z]{1,64}>/g;
const RE_CARGO = /<%[0-9A-Za-z]{1,64}>/g;
const RE_CANAL = /<#[0-9A-Za-z]{1,64}>/g;
const RE_EMOJI = /:[0-9A-Za-z_+-]{2,64}:/g;            // :nome: e :ID: do Stoat
const RE_LINK = /\b(?:https?:\/\/|www\.)[^\s<>]{1,400}/gi;
// o link que o sentinela "desdisfarça" (bit[.]ly → bit.ly) vira link de novo: domínio.tld/…
const RE_LINK_NU = /\b[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,62})*\.(?:com|net|org|ly|gg|io|me|br|link|xyz|site|app|ru|tk|ml|ga|cf|gq|top|click|online|shop|live|gift|icu|cyou|chat|co|info|biz|to)(?:\/[^\s<>]{0,400})?(?![a-z0-9])/gi;
const RE_ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/gi;
const RE_ESTICADA = /(\p{L})\1{2,}/gu;                  // "griiiátis" → "gratis" (o mesmo do sentinela)
// (P6, 3 nov 2026) árabe: o conteúdo em qualquer escrita entra no vetor, e no árabe a mesma palavra
// se escreve de vários jeitos. Sai o tatweel (U+0640, o traço que estica a palavra: é LETRA para o
// Unicode e não sairia com as marcas); as formas do alef (أ إ آ ٱ) viram ا; ى e ی (persa) viram ي; ک
// (persa) vira ك; ة vira ه. Os harakat (vogais) já saem com as marcas (\p{M}) e os dígitos
// arábicos (٠-٩) já viram o marcador de número (\p{N}).
const RE_TATWEEL = /\u0640/g;
const ARABE = Object.freeze({ "\u0623": "\u0627", "\u0625": "\u0627", "\u0622": "\u0627", "\u0671": "\u0627",
  "\u0649": "\u064a", "\u06cc": "\u064a", "\u06a9": "\u0643", "\u0629": "\u0647" });
const RE_ARABE = /[\u0623\u0625\u0622\u0671\u0649\u06cc\u06a9\u0629]/g;

export function normalizar(texto) {
  let t = String(texto ?? "");
  if (t.length > MAX_TEXTO) t = t.slice(0, MAX_TEXTO);
  // antes da normalização do sentinela: um ULID tem letra e número e viraria "leet"
  t = t.replace(RE_MENCAO, ` ${MARCADORES.mencao} `).replace(RE_CARGO, ` ${MARCADORES.cargo} `)
    .replace(RE_CANAL, ` ${MARCADORES.canal} `).replace(RE_EMOJI, ` ${MARCADORES.emoji} `)
    .replace(RE_LINK, ` ${MARCADORES.link} `).replace(RE_ULID, ` ${MARCADORES.id} `);
  t = normalizarParaAnalise(t);
  t = t.replace(RE_LINK, ` ${MARCADORES.link} `).replace(RE_LINK_NU, ` ${MARCADORES.link} `);
  t = t.replace(RE_TATWEEL, "").replace(RE_ARABE, (c) => ARABE[c]);
  t = t.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").replace(RE_ESTICADA, "$1");
  // (3 nov 2026, P5 revisão) número que sobrou (telefone, valor, documento) vira marcador: não entra no vetor
  t = t.replace(/\p{N}+/gu, ` ${MARCADORES.numero} `);
  // o que não é letra nem número separa palavras (pontuação, emoji, símbolo)
  return t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// ─── Hash ──────────────────────────────────────────────────────────────────────
// FNV-1a 32 bits sobre os bytes UTF-8 do texto, sem alocar (o UTF-8 sai na hora).
const FNV_BASE = 0x811c9dc5, FNV_PRIMO = 0x01000193;
const passo = (h, b) => Math.imul(h ^ b, FNV_PRIMO);
export function fnv1a(texto) {
  let h = FNV_BASE;
  const s = String(texto);
  for (let i = 0; i < s.length; i++) {
    let c = s.codePointAt(i);
    if (c > 0xffff) i++;
    if (c < 0x80) h = passo(h, c);
    else if (c < 0x800) { h = passo(h, 0xc0 | (c >> 6)); h = passo(h, 0x80 | (c & 63)); }
    else if (c < 0x10000) { h = passo(h, 0xe0 | (c >> 12)); h = passo(h, 0x80 | ((c >> 6) & 63)); h = passo(h, 0x80 | (c & 63)); }
    else { h = passo(h, 0xf0 | (c >> 18)); h = passo(h, 0x80 | ((c >> 12) & 63)); h = passo(h, 0x80 | ((c >> 6) & 63)); h = passo(h, 0x80 | (c & 63)); }
  }
  return h >>> 0;
}

// Cada tipo de sinal tem o seu prefixo: a palavra "pix" e o n-grama "pix" não caem juntos.
function somar(acc, chave) {
  const h = fnv1a(chave);
  const i = h & MASCARA;
  acc.set(i, (acc.get(i) ?? 0) + ((h >>> 31) ? -1 : 1));   // o bit mais alto dá o sinal (o índice usa os 18 de baixo)
}

const arred = (x) => Math.round(x * 1e6) / 1e6;

// sinais(texto) → [[indice, valor], …], ordenado por índice, no máximo TETO entradas, L2 = 1.
// Texto vazio (ou só pontuação) → [].
export function sinais(texto) {
  const t = normalizar(texto);
  if (!t) return [];
  const acc = new Map();
  const comBorda = ` ${t} `;
  for (let n = 3; n <= 5; n++) {
    for (let i = 0; i + n <= comBorda.length; i++) somar(acc, `c${n}:${comBorda.slice(i, i + n)}`);
  }
  const palavras = t.split(" ");
  for (let i = 0; i < palavras.length; i++) {
    somar(acc, `w:${palavras[i]}`);
    if (i + 1 < palavras.length) somar(acc, `b:${palavras[i]} ${palavras[i + 1]}`);
  }
  let itens = [];
  for (const [i, v] of acc) if (v !== 0) itens.push([i, v]);   // colisões que se anulam saem
  if (itens.length > TETO) {
    // os mais fortes ficam; empate pelo índice (determinístico)
    itens.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0] - b[0]);
    itens = itens.slice(0, TETO);
  }
  let soma = 0;
  for (const [, v] of itens) soma += v * v;
  const norma = Math.sqrt(soma);
  if (!norma) return [];
  itens.sort((a, b) => a[0] - b[0]);
  for (const x of itens) x[1] = arred(x[1] / norma);
  return itens.filter((x) => x[1] !== 0);
}

// ─── Versão ────────────────────────────────────────────────────────────────────
// A versão é a do formato ("1") mais a impressão do extrator sobre uma sonda fixa: se a
// normalização do sentinela mudar (ou este arquivo), a impressão muda sozinha e o modelo
// e as impressões antigas deixam de valer — nada de vetor incompatível passando calado.
const SONDA = [
  "G4NH3 D1NH31R0 fácil!!! chama no zap <@01ARZ3NDEKTSV4RRFFQ69G5FAV> https://bit.ly/x",
  "g.a.n.h.e  g a n h e  gаnhе 𝐠𝐚𝐧𝐡𝐞 ｇａｎｈｅ griiiátis bit[.]ly/abc 01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "If you don't pay by Friday I'll leak your address · Si no pagas, filtro tu dirección · <#C1> <%R1> :emoji:",
  // (3 nov 2026, P5 revisão) com número: o marcador de número entra na versão (o vetor de antes não vale mais)
  "me liga 11 98765-4321 ou paga R$ 10.000 até 05/11",
  // (P6, 3 nov 2026) qualquer escrita: o cirílico de verdade fica cirílico (só o disfarce vira
  // latino) e o árabe é unificado — o vetor de antes não vale mais
  "\u0443\u0431\u044c\u044e \u0442\u0435\u0431\u044f \u0437\u0430\u0432\u0442\u0440\u0430 \u00b7 \u0440\u0430\u0443\u0440\u0430l \u0441\u043e\u0441\u043e",
  "\u0623\u0646\u062a \u0633\u062a\u062f\u0641\u0639 \u0627\u0644\u0622\u0646 \u0640\u0640\u0645\u0631\u062d\u0628\u0627 \u0645\u064e\u062f\u0631\u0633\u0629 \u0639\u0644\u0649 \u0661\u0662\u0663",
];
export const VERSAO_SINAIS = `1.${fnv1a(SONDA.map((s) => `${normalizar(s)}|${sinais(s).map((x) => x.join(":")).join(",")}`).join("\n")).toString(16).padStart(8, "0")}`;
