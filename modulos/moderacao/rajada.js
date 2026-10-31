// Filtros que faltaram no ataque de 2 out 2026 (#RSS, #Comando, #Midia):
//
//  • enxurrada de emoji — ~170 emojis + "@Judy" + ofensa racial, colado
//    várias vezes. Nenhum filtro olhava emoji (o anticaps e o antirepeticao
//    não pegam: não é maiúscula nem a mesma letra repetida);
//  • termos de ódio — a ofensa passou: o sentinela pontua golpe, +18, gore,
//    ilícito e abuso, não ódio;
//  • a MESMA imagem repostada por uma conta de 2 minutos em vários canais: o
//    anti-duplicata só comparava TEXTO (mensagem só com imagem não tem texto),
//    e o modelo de visão engasgou (74 imagens "fila cheia").
// Funções puras aqui; o automod-engine decide o que fazer.

// ── Emoji ──────────────────────────────────────────────────────────────────
const RE_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/gu;
const RE_CUSTOM = /:[A-Za-z0-9_]{2,32}:|<a?:\w+:\w+>/g;   // emoji personalizado do Stoat (:nome: / :id:)
export function contarEmojis(texto) {
  const t = String(texto ?? "");
  return (t.match(RE_EMOJI) ?? []).length + (t.match(RE_CUSTOM) ?? []).length;
}
export function enxurradaDeEmoji(texto, { max = 20, minimo = 10, proporcao = 0.7 } = {}) {
  const n = contarEmojis(texto);
  if (n >= max) return { n, motivo: "muitos" };
  const letras = (String(texto ?? "").replace(RE_EMOJI, "").replace(RE_CUSTOM, "").match(/\p{L}|\p{N}/gu) ?? []).length;
  if (n >= minimo && n / (n + letras) >= proporcao) return { n, motivo: "quase só emoji" };
  return null;
}

// ── Termos de ódio ─────────────────────────────────────────────────────────
// Só os inequívocos (insulto racial/homofóbico/transfóbico, PT e EN). Palavras
// que também são uso comum ("macaco", "bicha", "viado" entre amigos) ficam de
// fora do padrão — a staff acrescenta com `&automod sentinela odio add <termo>`.
//
// 9 out 2026 — falsos positivos tirados da lista de fábrica:
//  • "coon": "Falandooo con la pared" foi punido. A comparação "colapsava" as
//    letras repetidas também no TERMO ("coon" → "con"), e "con" é palavra
//    comum em espanhol e português ("cones" também caía, pelo sufixo). Além
//    disso "Maine Coon" é raça de gato;
//  • "kike": apelido comum de Enrique em espanhol;
//  • "chink": "a chink in the armor" é expressão do inglês;
//  • "fagot"/"niga": grafias que colidem com palavras/nomes ("fagote", "Niga");
//  • "lugar de preto": "lugar de preto é onde ele quiser" é lema ANTIrracista.
export const TERMOS_ODIO = [
  "nigger", "nigga", "negger", "faggot", "tranny", "spic", "wetback",
  "crioulo imundo", "preto imundo", "macaco imundo", "volta pra senzala",
];
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", "$": "s", "!": "i", "|": "i" };
// Normaliza o TEXTO: minúsculas, sem acento, leet desfeito, menções fora,
// letras soltas juntadas ("n i g g a", "n.i.g.g.a"). Corta em MAX_TEXTO_ODIO:
// ofensa não precisa de 20 mil caracteres para ser achada.
const MAX_TEXTO_ODIO = 4000;
export function normalizarOdio(texto) {
  return String(texto ?? "").slice(0, MAX_TEXTO_ODIO)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/<[@#%][^>]+>/g, " ")
    // "!" e "|" no fim da palavra são pontuação ("imundo!!"), não um "i"
    .replace(/[!|]+(?![a-z0-9@$!|])/g, " ")
    .replace(/[0134578@$!|]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z\s]/g, " ")
    // "n i g g a" e "n.i.g.g.a" — 4+ letras soltas viram uma palavra
    // (com 3, "e o a"/"a e i" da conversa comum se juntavam à toa)
    .replace(/\b(?:[a-z]\s+){3,}[a-z]\b/g, (m) => m.replace(/\s+/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

// ── Letra esticada sem regex por letra (31 out 2026, R10) ────────────────────
// Antes cada letra do termo virava `c+` ("kkkkkk" → /k+k+k+k+k+k+/): um admin
// punha esse termo no `antiodio add` e uma mensagem de 61 caracteres travava o
// bot por 94 s em todos os servidores (ReDoS medido). Agora quem é "esticada"
// é a MENSAGEM: cada sequência de letras iguais vira UMA letra, e guardamos
// quantas eram. O termo passa pelo mesmo processo e vira um padrão LITERAL
// escapado (sem quantificador nenhum). Casou no texto colapsado? Confere se
// cada letra veio pelo menos tantas vezes quanto no termo: "niiiigga" pega
// "nigga", mas "con" não pega "coon" (o "o" duplo do termo não pode sumir).
export function colapsar(texto) {
  const t = String(texto ?? "");
  let letras = "";
  const cont = [];
  for (let i = 0; i < t.length; i++) {
    if (i > 0 && t[i] === t[i - 1]) cont[cont.length - 1]++;
    else { letras += t[i]; cont.push(1); }
  }
  return { letras, cont };
}
const escaparRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Um termo (já limpo) → o padrão literal sobre o texto colapsado + as contagens
// mínimas. Palavra inteira, sufixo opcional (plural, diminutivo).
const SUFIXOS = "(?:s|z|es|inha|inho|ao)?";
const CACHE_MAX = 500;
const cachePadrao = new Map();   // termo → { re, cont } | null   (com teto: R11)
export const _tamanhoCachePadrao = () => cachePadrao.size;
function padraoDoTermo(termo) {
  const chave = String(termo);
  if (cachePadrao.has(chave)) return cachePadrao.get(chave);
  const limpo = String(termo ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, TERMO_MAX);
  let p = null;
  if (limpo.length >= 3) {
    const { letras, cont } = colapsar(limpo);
    p = { re: new RegExp(`(?<![a-z])${escaparRegex(letras)}${SUFIXOS}(?![a-z])`, "g"), cont };
  }
  if (cachePadrao.size >= CACHE_MAX) cachePadrao.delete(cachePadrao.keys().next().value);
  cachePadrao.set(chave, p);
  return p;
}
function casaTermo(p, alvo) {
  p.re.lastIndex = 0;
  for (const m of alvo.letras.matchAll(p.re)) {
    if (p.cont.every((n, i) => alvo.cont[m.index + i] >= n)) return true;
  }
  return false;
}
// Teto dos termos que a staff acrescenta (`&automod antiodio add`): 20 × 40.
export const TERMOS_MAX = 20, TERMO_MAX = 40;
export function acharOdio(texto, extras = []) {
  const norm = normalizarOdio(texto);
  if (!norm) return null;
  const alvo = colapsar(norm);
  for (const termo of [...TERMOS_ODIO, ...(extras ?? []).slice(0, TERMOS_MAX)]) {
    const p = padraoDoTermo(termo);
    if (p && casaTermo(p, alvo)) return termo;
  }
  return null;
}

// ── Mídia ──────────────────────────────────────────────────────────────────
// A digital de uma imagem: tamanho + dimensões. Repostar a mesma imagem dá a
// mesma digital (o id do anexo muda a cada envio; o arquivo, não).
export function digitalMidia(message) {
  const anexos = message?.attachments ?? [];
  if (!anexos.length) return null;
  // Sem o tamanho não há digital: "?:?x?" seria IGUAL para qualquer arquivo
  // sem metadados, e fotos diferentes contariam como a mesma repetida.
  if (anexos.some((a) => !(Number(a?.size) > 0))) return null;
  const partes = anexos.map((a) => {
    const m = a?.metadata ?? {};
    return `${a?.size ?? "?"}:${m.width ?? "?"}x${m.height ?? "?"}`;
  }).sort();
  return `midia:${partes.join("|")}`;
}

// Quantos anexos esta pessoa mandou na janela (todos os canais juntos).
export function contarMidias(mapa, chave, qtd, { agora = Date.now(), janelaMs = 60_000 } = {}) {
  const lista = (mapa.get(chave) ?? []).filter((x) => agora - x.t < janelaMs);
  for (let i = 0; i < qtd; i++) lista.push({ t: agora });
  mapa.set(chave, lista.slice(-50));
  return lista.length;
}
