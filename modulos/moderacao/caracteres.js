
// Marcas combinantes (Unicode) — é o que empilha para formar "zalgo".
const COMBINANTES = /[\u0300-\u036F\u0483-\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

const INVISIVEIS_GRAVES = /[\u202A-\u202E\u2066-\u206F\u2028\u2029]/g;

const INVISIVEIS_LEVES = /[\u200B-\u200F\u2060-\u2064\uFEFF]/g;

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

  const marcas = (texto.match(COMBINANTES) || []).length;
  const base = texto.replace(COMBINANTES, "").length || 1;
  if (marcas >= 8 && marcas / base >= limiteZalgo) {
    return { motivo: "texto com caracteres 'zalgo' (acentos empilhados) que quebram o chat", tipo: "zalgo", razao: +(marcas / base).toFixed(2) };
  }

  const emoticon = pareceEmoticon(texto);

  if (!emoticon) {
    const leves = (texto.match(INVISIVEIS_LEVES) || []).length;
    if (leves > 2) {
      return { motivo: "uso de caracteres invisíveis ou de controle de texto", tipo: "invisiveis", qtd: leves };
    }
  }

  return null;
}

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

const MAIUSCULAS = /[A-ZÀÁÂÃÄÉÊÍÓÔÕÚÜÇ]/g;
const SO_LETRAS  = /[^a-zA-ZÀ-ÿ]/g;
const MIN_LETRAS = 12;   // abaixo disso a conta é ruído (siglas, "OK OK OK")

export function razaoDeCaixaAlta(texto) {
  const letras = String(texto ?? "").replace(SO_LETRAS, "");
  if (letras.length < MIN_LETRAS) return null;
  const maius = (letras.match(MAIUSCULAS) ?? []).length;
  return maius / letras.length;
}
