// escrita.js — de que escrita (alfabeto) é um texto (P6, 3 nov 2026; contrato 1 do BRIEF-P6).
//
// "Tem gente que escreve em árabe ou russo de propósito… não quero bloquear os caracteres,
// apenas o conteúdo interno quero que seja levado em conta" (o dono, 3 nov 2026). Daí:
//   • NUNCA se bloqueia nem se pune uma mensagem por estar em outra escrita;
//   • os léxicos do sentinela (pt/en/es) só leem a escrita latina: numa escrita que eles não
//     cobrem, quem lê o conteúdo é o classificador de n-gramas (scorecard: `escrita_nao_coberta`,
//     a porta dele abre — ainda com o teto 3, abaixo do piso 3,5: sozinho, nunca pune);
//   • os detectores de COMPORTAMENTO (repetição, caixa alta, duplicata) valem para qualquer escrita.
//
// Puro, sem estado, sem I/O. A escrita é calculada na hora e não é guardada em lugar nenhum.
//
// Aqui também mora o `textoHumano` (o que a pessoa digitou: sem código, menção, emoji nomeado,
// link nem ID): a escrita se conta nele — "убью тебя <@01ARZ…>" é cirílico, não as letras do ID.
// O caracteres.js o reexporta (quem já o importava de lá segue igual).

export function textoHumano(conteudo) {
  return String(conteudo ?? "")
    .replace(/```[\s\S]*?```/g, " ")          // blocos de código
    .replace(/`[^`]*`/g, " ")                  // código em linha
    .replace(/<[@#%&!][^>]{0,64}>/g, " ")      // menções de usuário, cargo e canal
    .replace(/:[a-z0-9_+-]{2,64}:/gi, " ")     // emojis nomeados (:PogChamp:)
    .replace(/https?:\/\/\S+/gi, " ")          // links
    .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, " ") // ULIDs soltos (IDs colados)
    .replace(/\s+/g, " ")
    .trim();
}

// As escritas, na ordem do desempate (a primeira ganha). Kana conta como cjk; o que é letra e
// não cai em nenhuma é "outra". O `scx` (Script_Extensions) pega a letra comum a kana e kanji
// (o "ー" do katakana). Só LETRA conta: a vogal do devanágari e do tailandês é marca (\p{M}).
const POR_ESCRITA = [
  ["latina", /\p{Script=Latin}/gu],
  ["cirilica", /\p{Script=Cyrillic}/gu],
  ["grega", /\p{Script=Greek}/gu],
  ["arabe", /\p{Script=Arabic}/gu],
  ["hebraica", /\p{Script=Hebrew}/gu],
  ["cjk", /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]/gu],
  ["coreana", /\p{Script=Hangul}/gu],
  ["devanagari", /\p{Script=Devanagari}/gu],
  ["tailandesa", /\p{Script=Thai}/gu],
];
export const ESCRITAS = Object.freeze([...POR_ESCRITA.map(([e]) => e), "outra"]);
// As escritas que se escrevem sem espaço entre as palavras (contar "palavras" por espaço não vale)
export const SEM_ESPACO = Object.freeze(new Set(["cjk", "tailandesa"]));
export const MIN_LETRAS = 4;           // abaixo disto não há escrita dominante (sigla, "ok", emoji)
const MAX_TEXTO = 4000;                // o Stoat corta em 2000; aqui é só um teto de CPU (R11)
const RE_NAO_LETRA = /\P{L}+/gu;
const RE_SURROGATE = /[\ud800-\udfff]/g;
// quantos code points (e não unidades UTF-16: a letra fora do plano básico conta 1)
const pontos = (s) => s.length - (s.match(RE_SURROGATE)?.length ?? 0) / 2;

// escritaDoTexto(texto) → { dominante, letras, fracoes }
//   dominante: a escrita com mais letras (empate: a primeira de ESCRITAS), ou null com menos de
//              MIN_LETRAS letras; letras: quantas letras contadas; fracoes: { escrita: fração }.
// As letras "fancy" (𝐠𝐚𝐧𝐡𝐞, ｇａｎｈｅ) contam como latinas (NFKC antes).
// (R11, medido) Só as letras ficam, e cada escrita sai de uma vez com um regex nativo: ~0,2 ms
// num texto de 2.000 caracteres (letra a letra eram ~0,5 ms, e o sentinela chama até 3 vezes).
export function escritaDoTexto(texto) {
  let t = textoHumano(texto);
  if (t.length > MAX_TEXTO) t = t.slice(0, MAX_TEXTO);
  let resto = t.normalize("NFKC").replace(RE_NAO_LETRA, "");
  const letras = pontos(resto);
  const contagem = {};
  for (const [e, re] of POR_ESCRITA) {
    if (!resto) break;
    const antes = resto;
    resto = resto.replace(re, "");
    if (resto.length !== antes.length) contagem[e] = pontos(antes) - pontos(resto);
  }
  if (resto) contagem.outra = pontos(resto);
  const fracoes = {};
  let dominante = null;
  for (const e of ESCRITAS) {
    if (!contagem[e]) continue;
    fracoes[e] = contagem[e] / letras;
    if (dominante === null || contagem[e] > contagem[dominante]) dominante = e;
  }
  return { dominante: letras < MIN_LETRAS ? null : dominante, letras, fracoes };
}

// As escritas que os léxicos do sentinela leem (pt/en/es). Fora delas, o conteúdo fica com o
// classificador de texto (que serve para qualquer escrita, se treinado com ela).
export const ESCRITAS_COBERTAS = new Set(["latina"]);

// true se a escrita dominante é coberta pelas regras — ou se não há escrita dominante (texto curto).
export function escritaCoberta(texto) {
  const { dominante } = escritaDoTexto(texto);
  return dominante === null || ESCRITAS_COBERTAS.has(dominante);
}
