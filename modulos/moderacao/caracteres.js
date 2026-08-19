// ══════════════════════════════════════════════════════════
//  caracteres.js — Detecção de caracteres que travam front-ends
//
//  Cobre:
//   • Zalgo — excesso de "marcas combinantes" (acentos empilhados)
//   • Caracteres invisíveis / de controle de direção (RTL/LTR override,
//     zero-width, etc.) usados para quebrar layout ou esconder texto
//   • Repetição absurda do MESMO caractere (flood visual)
//
//  Emoticons ASCII / kaomoji (ex.: ( ͡° ͜ʖ ͡°), ༎ຶ‿༎ຶ, ¯\_(ツ)_/¯) são
//  legítimos e NÃO devem ser punidos, mesmo quando trazem marcas combinantes
//  ou joiners de espaçamento. A lógica abaixo os poupa.
//
//  Não depende de nada externo — regex + contagem.
// ══════════════════════════════════════════════════════════

// Marcas combinantes (Unicode) — é o que empilha para formar "zalgo".
const COMBINANTES = /[\u0300-\u036F\u0483-\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

// Invisíveis PERIGOSOS DE VERDADE: controles de direção bidirecional (invertem
// ou ocultam texto) e separadores de linha/parágrafo. NÃO há uso legítimo
// desses em conversa — qualquer ocorrência é bloqueio direto.
const INVISIVEIS_GRAVES = /[\u202A-\u202E\u2066-\u206F\u2028\u2029]/g;

// Invisíveis "leves" de espaçamento/junção: zero-width space/joiner/non-joiner,
// word joiner, BOM, marcas LTR/RTL simples. Aparecem em kaomoji do EmojiDB
// (recheados de U+2060) e em emojis compostos (U+200D). Sozinhos, em texto
// normal, ainda são suspeitos; mas toleramos poucos, e ignoramos quando o
// texto é predominantemente um emoticon (poucos caracteres "de palavra").
const INVISIVEIS_LEVES = /[\u200B-\u200F\u2060-\u2064\uFEFF]/g;

// Kaomoji / emoticons: muitos símbolos, poucas letras. Se o texto tem alta
// proporção de símbolos (parênteses, katakana, marcas), é um emoticon e não
// uma tentativa de ocultar texto — poupa-se dos filtros de invisível.
// As marcas combinantes são descontadas do cálculo para um zalgo (base + muitas
// combinantes) não se disfarçar de emoticon.
const CHAR_PALAVRA = /[\p{L}\p{N}]/gu;
function pareceEmoticon(texto) {
  const semCombinantes = texto.replace(COMBINANTES, "");
  const semEspaco = semCombinantes.replace(/\s/g, "");
  if (semEspaco.length === 0) return false;
  const letras = (semCombinantes.match(CHAR_PALAVRA) || []).length;
  return letras / semEspaco.length < 0.4;
}

// Analisa um texto e devolve o motivo do bloqueio, ou null se estiver ok.
export function analisarCaracteres(texto, opcoes = {}) {
  const { limiteZalgo = 0.6 } = opcoes;
  if (!texto) return null;

  // 1) Invisíveis GRAVES (direção bidirecional) — bloqueio direto, sempre.
  const graves = (texto.match(INVISIVEIS_GRAVES) || []).length;
  if (graves > 0) {
    return { motivo: "uso de caracteres invisíveis ou de controle de texto", tipo: "invisiveis", qtd: graves };
  }

  // 2) Zalgo — muitas marcas combinantes. Verificado ANTES da poupança de
  // emoticon, porque um zalgo tem poucas letras e se disfarçaria de emoticon.
  // Emoticons legítimos (lenny face) têm poucas combinantes e não atingem o
  // limiar de 8, então passam mesmo com esta verificação vindo primeiro.
  const marcas = (texto.match(COMBINANTES) || []).length;
  const base = texto.replace(COMBINANTES, "").length || 1;
  if (marcas >= 8 && marcas / base >= limiteZalgo) {
    return { motivo: "texto com caracteres 'zalgo' (acentos empilhados) que quebram o chat", tipo: "zalgo", razao: +(marcas / base).toFixed(2) };
  }

  const emoticon = pareceEmoticon(texto);

  // 3) Invisíveis LEVES (zero-width, word joiner) — tolerados em emoticons
  // (kaomoji do EmojiDB vêm recheados de U+2060). Em texto normal, mais de 2
  // é suspeito (esconder/dividir palavras).
  if (!emoticon) {
    const leves = (texto.match(INVISIVEIS_LEVES) || []).length;
    if (leves > 2) {
      return { motivo: "uso de caracteres invisíveis ou de controle de texto", tipo: "invisiveis", qtd: leves };
    }
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

  const escapado = ignorar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const classe = escapado ? `[^${escapado}]` : ".";
  const re = new RegExp(`(${classe})\\1{${maxRepeticao},}`, "iu");
  if (re.test(texto)) {
    return { motivo: "repetição excessiva do mesmo caractere", tipo: "repeticao" };
  }
  return null;
}

// ══════════════════════════════════════════════════════════
//  Texto "humano" — o que a pessoa realmente ESCREVEU
//
//  Menções no Stoat são `<@01ARZ3NDEKTSV4RRFFQ69G5FAV>`: um ULID de 26
//  caracteres SEMPRE em maiúsculas. Analisar o conteúdo cru fazia o
//  anti-caps punir quem só marcou duas pessoas — duas menções e três
//  palavras dão 80% de maiúsculas sem ninguém ter gritado. O mesmo valia,
//  em menor grau, para links, emojis nomeados e blocos de código.
//
//  Esta função devolve o texto sem essas partes, para que as análises de
//  ESTILO (caixa alta, repetição) julguem apenas o que foi digitado.
//  Atenção: NÃO usar isto em análises de CONTEÚDO (anti-link, scam), que
//  precisam justamente ver as URLs.
// ══════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════
//  Proporção de CAIXA ALTA de um texto já sanitizado
//
//  A conta é direta — maiúsculas sobre o total de letras — mas só vale a
//  partir de um mínimo de texto. Esse mínimo é o que protege a escrita
//  normal: "PDF ou RPG?" tem 8 letras e 75% de maiúsculas por causa das
//  siglas, e puni-lo seria absurdo.
//
//  Tentei antes ignorar "siglas" (palavras curtas todas em maiúsculas), e
//  foi pior: em português, OLHA, ISSO, AQUI e SEU têm 3–4 letras, então um
//  grito legítimo virava invisível. Exigir volume de texto separa os dois
//  casos sem precisar adivinhar o que é sigla.
//
//  Devolve `null` quando não há texto suficiente para uma conclusão honesta.
// ══════════════════════════════════════════════════════════
const MAIUSCULAS = /[A-ZÀÁÂÃÄÉÊÍÓÔÕÚÜÇ]/g;
const SO_LETRAS  = /[^a-zA-ZÀ-ÿ]/g;
const MIN_LETRAS = 12;   // abaixo disso a conta é ruído (siglas, "OK OK OK")

export function razaoDeCaixaAlta(texto) {
  const letras = String(texto ?? "").replace(SO_LETRAS, "");
  if (letras.length < MIN_LETRAS) return null;
  const maius = (letras.match(MAIUSCULAS) ?? []).length;
  return maius / letras.length;
}
