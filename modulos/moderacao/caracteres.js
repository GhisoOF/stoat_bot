
// (P5, 3 nov 2026) os motivos vêm do motivos.js, pela chave: o `motivo` aqui é o português (o
// que sempre foi); quem pune usa a `chave` para dar o motivo no idioma do servidor.
import { textoDoMotivo } from "./motivos.js";
// (P6, 3 nov 2026) qualquer escrita: os detectores de COMPORTAMENTO daqui (repetição, duplicata,
// caixa alta, risada) valem para cirílico, árabe, grego, CJK… — antes vários só enxergavam a-z.
// O `textoHumano` mudou para o escrita.js (a escrita se conta nele) e segue exportado daqui.
import { escritaDoTexto, SEM_ESPACO, textoHumano } from "./escrita.js";
export { textoHumano };

// Marcas combinantes (Unicode) — é o que empilha para formar "zalgo".
const COMBINANTES = /[\u0300-\u036F\u0483-\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

const INVISIVEIS_GRAVES = /[\u202A-\u202E\u2066-\u206F\u2028\u2029]/g;

const INVISIVEIS_LEVES = /[\u200B-\u200F\u2060-\u2064\uFEFF]/g;

// (P6, 3 nov 2026) qualquer escrita: alguns "invisíveis" são parte da escrita de verdade, e o persa,
// o hindi e o árabe/hebraico caíam como "caracteres invisíveis" (bloqueio de cara, no caso dos graves)
// só por estarem nessas escritas. Deixam de contar:
//   • o não-juntador/juntador (U+200C/U+200D) ENTRE letras das escritas que os usam — árabe (persa:
//     "می\u200cخواهم"), siríaco e as índicas (devanágari, bengali…), com marcas no meio. Entre letras
//     latinas segue contando;
//   • a marca de direção (U+200E/U+200F) e os encaixes/isolamentos (U+202A-U+202C, U+2066-U+2069)
//     VIZINHOS de letra árabe ou hebraica (pulando espaço, marca e outros controles), que o teclado
//     põe ao misturar as direções. (revisão do P6) Antes, uma letra árabe em qualquer lugar do texto
//     desligava a conta no texto inteiro ("o\u200ei\u200et\u200eu\u200ed\u200eo ب" passava).
// A INVERSÃO (U+202D/U+202E, a que vira o texto de trás para a frente na tela) segue grave sempre.
// (revisão do P6, R10) Varredura LINEAR, dois passes, sem regex de lookbehind: a primeira versão
// (lookbehind com \p{M}*) levava ~350 ms numa mensagem de 4000 marcas (zalgo) — em toda mensagem.
const RE_TEM_CONTROLE = /[\u200C-\u200F\u202A-\u202C\u2066-\u2069]/;
const RE_ESCRITA_COM_JUNTADOR = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}]/u;
const RE_LETRA_RTL = /(?=\p{L})[\p{Script=Arabic}\p{Script=Hebrew}]/u;
// o tipo de cada caractere, num passe só (o comum — ASCII — sem regex nenhuma)
const LETRA = 0, MARCA = 1, JUNTADOR = 2, DIRECAO = 3, PULAVEL = 4;
const RE_MARCA = /\p{M}/u, RE_ESPACO = /\s/u;
function tipoDe(c) {
  const x = c.codePointAt(0);
  if (x < 0x80) return x <= 0x20 ? PULAVEL : LETRA;
  if (x === 0x200C || x === 0x200D) return JUNTADOR;
  if (x === 0x200E || x === 0x200F || (x >= 0x202A && x <= 0x202C) || (x >= 0x2066 && x <= 0x2069)) return DIRECAO;
  if (x === 0x200B || x === 0x202D || x === 0x202E || (x >= 0x2060 && x <= 0x2065) || x === 0xFEFF) return PULAVEL;
  if (x >= 0x300 && RE_MARCA.test(c)) return MARCA;
  return RE_ESPACO.test(c) ? PULAVEL : LETRA;
}
// o índice do caractere "de verdade" mais próximo antes/depois de cada posição (-1 = nenhum),
// pulando os tipos de `pula`
function vizinhos(tipos, pula) {
  const n = tipos.length, antes = new Int32Array(n), depois = new Int32Array(n);
  let ult = -1;
  for (let i = 0; i < n; i++) { antes[i] = ult; if (!pula[tipos[i]]) ult = i; }
  ult = -1;
  for (let i = n - 1; i >= 0; i--) { depois[i] = ult; if (!pula[tipos[i]]) ult = i; }
  return [antes, depois];
}
//                    LETRA  MARCA  JUNT.  DIREÇÃO PULÁVEL
const PULA_JUNTADOR = [false, true,  true,  false,  false];   // entre a letra e o juntador, só marca
const PULA_DIRECAO  = [false, true,  true,  true,   true];    // a direção olha além de espaço e controle
function semControlesDaEscrita(texto) {
  if (!RE_TEM_CONTROLE.test(texto)) return texto;   // o caso comum: nada a fazer
  const cps = [...texto];
  const tipos = cps.map(tipoDe);
  const [jAntes, jDepois] = vizinhos(tipos, PULA_JUNTADOR);
  const [dAntes, dDepois] = vizinhos(tipos, PULA_DIRECAO);
  const daEscrita = (i) => i >= 0 && RE_ESCRITA_COM_JUNTADOR.test(cps[i]);
  const rtl = (i) => i >= 0 && RE_LETRA_RTL.test(cps[i]);
  const out = [];
  for (let i = 0; i < cps.length; i++) {
    if (tipos[i] === JUNTADOR && daEscrita(jAntes[i]) && daEscrita(jDepois[i])) continue;
    if (tipos[i] === DIRECAO && (rtl(dAntes[i]) || rtl(dDepois[i]))) continue;
    out.push(cps[i]);
  }
  return out.join("");
}

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
  texto = semControlesDaEscrita(texto);   // (P6) o que é da própria escrita não conta

  // 1) Invisíveis GRAVES (direção bidirecional) — bloqueio direto, sempre.
  const graves = (texto.match(INVISIVEIS_GRAVES) || []).length;
  if (graves > 0) {
    return { motivo: textoDoMotivo("invisiveis"), chave: "invisiveis", tipo: "invisiveis", qtd: graves };
  }

  const marcas = (texto.match(COMBINANTES) || []).length;
  const base = texto.replace(COMBINANTES, "").length || 1;
  if (marcas >= 8 && marcas / base >= limiteZalgo) {
    return { motivo: textoDoMotivo("zalgo"), chave: "zalgo", tipo: "zalgo", razao: +(marcas / base).toFixed(2) };
  }

  const emoticon = pareceEmoticon(texto);

  if (!emoticon) {
    // O "juntador" (ZWJ, U+200D) é PARTE de emojis compostos — 👨‍👩‍👧‍👦, 🏳️‍🌈,
    // 🧑🏽‍💻, ❤️‍🔥. Entre dois emojis ele não é invisível suspeito (9 out 2026:
    // "Família 👨‍👩‍👧‍👦 reunida" caía como "caracteres invisíveis").
    const semJuntaEmoji = texto.replace(/(?<=[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F])\u200D(?=\p{Extended_Pictographic})/gu, "");
    const leves = (semJuntaEmoji.match(INVISIVEIS_LEVES) || []).length;
    if (leves > 2) {
      return { motivo: textoDoMotivo("invisiveis"), chave: "invisiveis", tipo: "invisiveis", qtd: leves };
    }
  }

  return null;
}

// As letras que o anti-repetição ignora (a risada: o "k" do BR), como ficam guardadas: minúsculas,
// só letra e número, até 10. (P6) Qualquer escrita — antes só a-z0-9, e o "ㅋ" coreano ou o "ه"
// árabe da risada nem podiam ser configurados. Letra e número não têm metacaractere de regex.
export function letrasIgnoradas(bruto) {
  return [...String(bruto ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")].slice(0, 10).join("");
}

export function analisarRepeticao(texto, opcoes = {}) {
  const {
    maxRepeticao = 15,          // mesmo caractere repetido seguidamente
    ignorar = "k",              // caracteres a ignorar (risada BR); "" desativa
  } = opcoes;

  if (!texto) return null;

  // (31 out 2026, R10) o valor vem do banco: `1.5` ou "abc" gerava regex
  // inválida e cada mensagem do servidor lançava exceção. Fora da faixa → padrão.
  const n = Number.isInteger(maxRepeticao) && maxRepeticao >= 2 && maxRepeticao <= 200 ? maxRepeticao : 15;
  const letras = letrasIgnoradas(ignorar);
  const classe = letras ? `[^${letras}]` : ".";
  const re = new RegExp(`(${classe})\\1{${n},}`, "iu");
  if (re.test(texto)) {
    return { motivo: textoDoMotivo("repeticao"), chave: "repeticao", tipo: "repeticao" };
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
// (P6, 3 nov 2026) qualquer escrita: antes o `[^a-z0-9]` apagava cirílico, árabe, grego, CJK…
// inteiros — a digital ficava vazia (ou só com os números) e o spam repetido nessas escritas
// nunca era pego. Agora fica toda letra e número; saem só os diacríticos (U+0300–036F: o acento
// latino, o do cirílico "й", o tonos grego), os harakat árabes (U+064B–065F, U+0670) e o tatweel
// (U+0640, que só estica a palavra); o NFKD desfaz as letras "fancy" (ｇａｎｈｅ = ganhe) e o NFC
// no fim junta de novo as sílabas do coreano. (revisão do P6) As OUTRAS marcas ficam: a vogal do
// devanágari e das índicas é parte da palavra ("खेलेंगे" ≠ "खेलोगे"; tirar \p{M} inteiro fazia
// frases diferentes virarem a mesma digital). O mínimo de 12 caracteres vale para toda escrita:
// em CJK, 12 caracteres já são uma frase (e o `ehCurta` dá a folga até 25).
// os diacríticos (e os blocos estendidos deles, de onde vem o zalgo), o seletor de variação do emoji,
// os harakat e o tatweel
const RE_DIACRITICO = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f\ufe00-\ufe0f\u064b-\u065f\u0670\u0640]+/g;
export function digital(conteudo) {
  const t = textoHumano(conteudo)
    .normalize("NFKD").replace(RE_DIACRITICO, "")         // tira acento, harakat e tatweel
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, "")             // pontuação e emoji fora (a vogal índica fica)
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
// (P6) Escrita sem espaço entre as palavras (chinês, japonês, tailandês): contar palavras por
// espaço dava sempre "≤ 3" e todo spam nelas ganhava a folga — lá vale só o tamanho.
export function ehCurta(d) {
  const t = String(d ?? "");
  if (t.length < 25) return true;
  if (SEM_ESPACO.has(escritaDoTexto(t).dominante)) return false;
  return t.split(" ").length <= 3;
}
export function analisarDuplicata(conteudo, anteriores = [], opcoes = {}) {
  const { maxRepetidas = 3 } = opcoes;
  const d = digital(conteudo);
  if (!d) return null;

  const limite = maxRepetidas + (ehCurta(d) ? FOLGA_CURTA : 0);
  const iguais = anteriores.filter((x) => x === d).length + 1;   // +1 = esta
  if (iguais < limite) return null;
  return {
    motivo: textoDoMotivo("duplicata", { n: iguais }),
    chave: "duplicata",
    tipo: "duplicata",
    vezes: iguais,
  };
}

// (P6, 3 nov 2026) qualquer escrita: antes só A-Z e alguns acentos — ПРИВЕТ ВСЕМ ДРУЗЬЯ em CAIXA
// ALTA não contava. Agora a maiúscula (\p{Lu}) conta SÓ nas escritas em que a caixa alta é escolha de
// quem escreve — latina, cirílica, grega e armênia (decisão do dono, revisão do P6). Nas outras ela
// nunca conta: o cherokee escrito normalmente já sai em maiúsculas ("ᏣᎳᎩ ᎦᏬᏂᎯᏍᏗ" era punido), e o
// mtavruli georgiano é título. As letras de toda escrita (\p{L}) entram no total: árabe, hebraico, CJK
// e cherokee nunca são "caixa alta".
const MAIUSCULAS = /(?=\p{Lu})[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}]/gu;
const SO_LETRAS  = /\P{L}/gu;
const MIN_LETRAS = 12;   // abaixo disso a conta é ruído (siglas, "OK OK OK")

// Risada e grito de uma letra só não são "caixa alta" (9 out 2026): "KKKKKKK",
// "HAHAHAHA", "KSKSKS", "JAJAJA", "RSRS", "HUAHUA", "AAAAAAH" — tudo vinha
// 100% maiúsculo e virava aviso.
// (P6) e a risada em cirílico ("ХАХАХА", "хехе", "хихи") e grego ("χαχαχα"); a de uma letra só
// (ㅋㅋㅋㅋ, ههههه, 哈哈哈哈, חחחח) já era pega pelo `(\p{L})\1{3,}`.
const RISADA = /^(?:k{3,}|[kj]{4,}|[ha]{4,}|[he]{4,}|[hi]{4,}|[ks]{4,}|[ja]{4,}|[je]{4,}|[rs]{4,}|[ka]{4,}|[hua]{5,}|[hue]{5,}|[sh]{4,}|[\u0445\u0430]{4,}|[\u0445\u0435]{4,}|[\u0445\u0438]{4,}|[\u03c7\u03b1]{4,}|(\p{L})\1{3,})$/iu;
export function semRisada(texto) {
  return String(texto ?? "").split(/\s+/).filter((p) => !RISADA.test(p.replace(/[^\p{L}]/gu, ""))).join(" ");
}

// (1 nov 2026, P3a.1) a mensagem é SÓ risada ("KKKKKKK", "hahaha kkkk")? Uma risada é
// conversa; três seguidas da mesma pessoa em 1 minuto contam como repetição (anti-duplicata).
export function ehSoRisada(conteudo) {
  const t = textoHumano(conteudo).replace(/^\s{0,3}#{1,6}\s+/gm, " ");
  if ((t.match(/\p{L}/gu) ?? []).length < 3) return false;
  return !/\p{L}/u.test(semRisada(t));
}
export const RISADA_SEGUIDA = { vezes: 3, janelaMs: 60_000 };

// (1 nov 2026, P3a.1) título do markdown ("# texto", letra gigante): só com risada ou em
// CAIXA ALTA é grito, mesmo curto ("# VAI LEVAR BAN", "# KKKKKK"). Título normal
// ("# Regras do servidor") e sigla ("# FAQ") passam.
export const TITULO_MIN_LETRAS = 4;
export function tituloComGrito(conteudo, limiar = 0.7) {
  const titulos = String(conteudo ?? "").matchAll(/^ {0,3}#{1,6}[ \t]+(.+)$/gm);
  for (const [, resto] of titulos) {
    const t = textoHumano(resto);
    if (ehSoRisada(t)) return { tipo: "risada" };
    const letras = semRisada(t).replace(SO_LETRAS, "");
    if (letras.length < TITULO_MIN_LETRAS) continue;
    const maius = (letras.match(MAIUSCULAS) ?? []).length;
    if (maius / letras.length >= limiar) return { tipo: "caps" };
  }
  return null;
}

export function razaoDeCaixaAlta(texto) {
  const letras = semRisada(texto).replace(SO_LETRAS, "");
  if (letras.length < MIN_LETRAS) return null;
  const maius = (letras.match(MAIUSCULAS) ?? []).length;
  return maius / letras.length;
}
