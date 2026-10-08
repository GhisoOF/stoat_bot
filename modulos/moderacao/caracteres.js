
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
    // O "juntador" (ZWJ, U+200D) é PARTE de emojis compostos — 👨‍👩‍👧‍👦, 🏳️‍🌈,
    // 🧑🏽‍💻, ❤️‍🔥. Entre dois emojis ele não é invisível suspeito (9 out 2026:
    // "Família 👨‍👩‍👧‍👦 reunida" caía como "caracteres invisíveis").
    const semJuntaEmoji = texto.replace(/(?<=[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F])\u200D(?=\p{Extended_Pictographic})/gu, "");
    const leves = (semJuntaEmoji.match(INVISIVEIS_LEVES) || []).length;
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

// Impressão digital de uma mensagem, para comparar uma com a outra.
//
// O buraco que isto fecha: `analisarRepeticao` olha DENTRO de uma mensagem
// (o mesmo caractere repetido) e o anti-spam conta VELOCIDADE. Quem repete o
// MESMO texto longo várias vezes, num ritmo tranquilo, passava pelos dois —
// que é exatamente como um bot de propaganda se comporta.
//
// Normaliza para que variações bobas (maiúsculas, acento, pontuação, espaço,
// emoji trocado) não sirvam de disfarce.
export function digital(conteudo) {
  const t = textoHumano(conteudo)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // tira acento
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")                        // pontuação e emoji fora
    .replace(/\s+/g, " ")
    .trim();
  return t.length < 12 ? null : t;   // texto curto repete à toa ("ok", "kk")
}

// Quantas vezes esta mensagem já apareceu igual, na janela.
//
// `anteriores` é a lista de digitais recentes daquele autor. Devolve null
// quando está tudo bem — o mesmo contrato das outras funções deste arquivo.
// Mensagem CURTA (até 3 palavras ou menos de 25 letras) tem folga de +2:
// "Miguel miguel" três vezes chamando um amigo é conversa, não propaganda
// (9 out 2026). Bot de spam repete texto longo — esse segue no limite normal.
export const FOLGA_CURTA = 2;
export function ehCurta(d) {
  return String(d ?? "").length < 25 || String(d ?? "").split(" ").length <= 3;
}
export function analisarDuplicata(conteudo, anteriores = [], opcoes = {}) {
  const { maxRepetidas = 3 } = opcoes;
  const d = digital(conteudo);
  if (!d) return null;

  const limite = maxRepetidas + (ehCurta(d) ? FOLGA_CURTA : 0);
  const iguais = anteriores.filter((x) => x === d).length + 1;   // +1 = esta
  if (iguais < limite) return null;
  return {
    motivo: `você repetiu a mesma mensagem ${iguais} vezes`,
    tipo: "duplicata",
    vezes: iguais,
  };
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

// Risada e grito de uma letra só não são "caixa alta" (9 out 2026): "KKKKKKK",
// "HAHAHAHA", "KSKSKS", "JAJAJA", "RSRS", "HUAHUA", "AAAAAAH" — tudo vinha
// 100% maiúsculo e virava aviso.
const RISADA = /^(?:k{3,}|[kj]{4,}|[ha]{4,}|[he]{4,}|[hi]{4,}|[ks]{4,}|[ja]{4,}|[je]{4,}|[rs]{4,}|[ka]{4,}|[hua]{5,}|[hue]{5,}|[sh]{4,}|(\p{L})\1{3,})$/iu;
export function semRisada(texto) {
  return String(texto ?? "").split(/\s+/).filter((p) => !RISADA.test(p.replace(/[^\p{L}]/gu, ""))).join(" ");
}

export function razaoDeCaixaAlta(texto) {
  const letras = semRisada(texto).replace(SO_LETRAS, "");
  if (letras.length < MIN_LETRAS) return null;
  const maius = (letras.match(MAIUSCULAS) ?? []).length;
  return maius / letras.length;
}
