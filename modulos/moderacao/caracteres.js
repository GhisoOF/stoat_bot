// ══════════════════════════════════════════════════════════
//  caracteres.js — Detecção de caracteres que travam front-ends
//
//  Cobre:
//   • Zalgo — excesso de "marcas combinantes" (acentos empilhados)
//   • Caracteres invisíveis / de controle de direção (RTL/LTR override,
//     zero-width, etc.) usados para quebrar layout ou esconder texto
//   • Repetição absurda do MESMO caractere (flood visual)
//
//  Não depende de nada externo — regex + contagem.
// ══════════════════════════════════════════════════════════

// Marcas combinantes (Unicode) — é o que empilha para formar "zalgo".
// Faixas: Combining Diacritical Marks e suplementos.
const COMBINANTES = /[\u0300-\u036F\u0483-\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

// Caracteres invisíveis / de controle perigosos.
// IMPORTANTE: o ZWJ (\u200D) NÃO está aqui, porque é usado em emojis compostos
// legítimos (👨‍👩‍👧, 👨‍💻, 🏳️‍🌈). Ele é tratado à parte abaixo.
const INVISIVEIS = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u2028\u2029]/g;

// ZWJ suspeito: um zero-width joiner que NÃO está ligando emojis. O uso
// legítimo é emoji‍emoji, possivelmente com variation selector (\uFE0F) no meio
// (ex.: bandeira 🏳️‍🌈 = 🏳 FE0F ZWJ 🌈). Consideramos legítimo quando há um
// caractere de emoji (ou variation selector) de cada lado.
const EMOJI_OU_VS = "\\p{Extended_Pictographic}\\uFE0F";
const ZWJ_SUSPEITO = new RegExp(
  `(?<![${EMOJI_OU_VS}])\\u200D|\\u200D(?![${EMOJI_OU_VS}])`, "gu");

// Kaomoji / emoticons ASCII legítimos (ex.: ¯\_(ツ)_/¯, ლ(ಠ益ಠლ), (╯°□°)╯︵ ┻━┻).
// Eles usam caracteres especiais que podem cair no zalgo por engano. Removemos
// esses padrões ANTES de analisar, para não punir quem só mandou um emoticon.
// Nota: o ZWJ (\u200D) é usado em emojis compostos legítimos (👨‍👩‍👧), então
// ele é tratado à parte e NÃO conta como invisível perigoso.
const KAOMOJI = [
  /¯\\?_?\(ツ\)_?\/?¯/g,                 // ¯\_(ツ)_/¯
  /[\(（][ †ಠ益・ω°□˘、〜^\*\-‿╥ಥ▔≧≦﹏＾ᴗっ˃˂・﹃。◕‿◕。◡﹁　°Д ]*[）\)]/g,  // parênteses de kaomoji
  /[┻━┳┃┏┓┗┛╯╰╭╮︵︶┳]/g,               // "mesa virada" e blocos
  /[ツシ]/g,                             // katakana usado em emoticons
];

// Analisa um texto e devolve o motivo do bloqueio, ou null se estiver ok.
// `limiteZalgo` = média máxima de marcas combinantes por caractere base.
// (A repetição de caractere foi movida para analisarRepeticao — módulo próprio.)
export function analisarCaracteres(texto, opcoes = {}) {
  const {
    limiteZalgo = 0.6,   // acima disso, é zalgo (0.6 = mais de ~1 marca a cada 2 chars)
  } = opcoes;

  if (!texto) return null;

  // 1) Caracteres invisíveis / de controle de direção — bloqueio direto.
  const invis = (texto.match(INVISIVEIS) || []).length
              + (texto.match(ZWJ_SUSPEITO) || []).length;
  if (invis > 0) {
    return { motivo: "uso de caracteres invisíveis ou de controle de texto", tipo: "invisiveis", qtd: invis };
  }

  // 2) Zalgo — muitas marcas combinantes em relação ao texto.
  // ANTES de contar, removemos kaomoji/emoticons ASCII conhecidos, para não
  // punir quem mandou ¯\_(ツ)_/¯ ou (╯°□°)╯︵ ┻━┻.
  let limpo = texto;
  for (const re of KAOMOJI) limpo = limpo.replace(re, " ");

  const marcas = (limpo.match(COMBINANTES) || []).length;
  const base = limpo.replace(COMBINANTES, "").length || 1;
  const razao = marcas / base;
  if (marcas >= 8 && razao >= limiteZalgo) {
    return { motivo: "texto com caracteres 'zalgo' (acentos empilhados) que quebram o chat", tipo: "zalgo", razao: +razao.toFixed(2) };
  }

  return null;
}

// ── Repetição de caractere (módulo próprio: anti-repetição) ──
// Separado do anti-caracteres porque em servidores BR o "kkkkk" (risada) é
// legítimo. Por isso, letras da risada podem ser ignoradas via `ignorar`.
export function analisarRepeticao(texto, opcoes = {}) {
  const {
    maxRepeticao = 15,          // mesmo caractere repetido seguidamente
    ignorar = "k",              // caracteres a ignorar (risada BR); "" desativa
  } = opcoes;

  if (!texto) return null;

  // Monta a regex; se houver caracteres a ignorar, eles não contam como violação.
  const escapado = ignorar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const classe = escapado ? `[^${escapado}]` : ".";
  const re = new RegExp(`(${classe})\\1{${maxRepeticao},}`, "iu");
  if (re.test(texto)) {
    return { motivo: "repetição excessiva do mesmo caractere", tipo: "repeticao" };
  }
  return null;
}
