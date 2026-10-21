// Busca na web da IA — do pedido à lista de fontes.
//
// O que estava errado (30/09, "r/enhitification, quais são as recentes coisas
// do google"):
//   • a consulta era a MENSAGEM inteira menos as palavras-gatilho — e o
//     gatilho `googl(e)` apagava a própria palavra "google": a busca saiu
//     "r/enhitification, quais são as recentes coisas do"; no pedido seguinte,
//     `", dentro do subreddit …"` com a vírgula na frente;
//   • 4 resultados, trechos de 300 caracteres, idioma fixo pt-BR, e nenhuma
//     página lida: o modelo só via manchetes e respondia descrevendo-as
//     ("o texto [1] detalha…, o portal G1 cobre…") em vez de responder;
//   • as fontes iam como links comuns e o Stoat gerava uma prévia (embed)
//     para cada uma.
//
// Agora: o modelo reescreve o pedido em até 2 consultas curtas (com
// correção de digitação e subreddit), os resultados são filtrados por
// relevância, as melhores páginas são lidas, e as fontes saem como
// [domínio](<url>) — o Stoat não gera prévia para link entre < >
// (crates/core/database/src/tasks/process_embeds.rs, RE_IGNORED).

import { pareceOutroIdioma } from "../core/idioma.js";
import { buscarSeguro, lerTexto } from "../core/seguranca.js";

const SEARXNG_URL = () => (process.env.SEARXNG_URL || "").replace(/\/$/, "");
const N_POR_CONSULTA = () => Number(process.env.BUSCA_RESULTADOS || 8);
const LER_PAGINAS = () => Number(process.env.BUSCA_LER_PAGINAS ?? 3);
const TIMEOUT = () => Number(process.env.BUSCA_TIMEOUT_MS || 8000);

// ─── Consulta ────────────────────────────────────────────────────────────────

const PALAVRAS_VAZIAS = new Set(("a o as os um uma uns umas de da do das dos em na no nas nos por para pra pro com sem que qual quais quem como "
  + "e ou se me te lhe mim voce você vc judy é eh foi ser são sao esta está isso isto esse essa aquilo sobre dentro entre mais muito "
  + "the of and to in on at for with is are be what which who how why do does from by about").split(" "));

// Verbos de pedido e enchimento — NUNCA o nome de um serviço (a palavra
// "google" é assunto; "googla"/"googlar" é verbo).
const ENCHIMENTO = [
  /<@[^>]+>/g,
  // "busca" sozinho é também substantivo ("a busca do Google") — só sai no começo.
  /\b(pesquis(?:e|a|ar|ando|ou|em)|busqu(?:e|em)|buscar|procur(?:e|a|ar|ando|em)|googl(?:a|ar|ando|ou)|search|searx(?:ng)?)\b/gi,
  /^\s*busca\b/i,
  /\b(d[aáê] uma olhada|consult[ae]r?|verifi(?:que|car))\b/gi,
  /\b(na|em|pela) (internet|web|rede)\b/gi,
  /\b(para mim|pra mim|por favor|pfv|pls|please)\b/gi,
  /\b(me (diga|fala|fale|conta|conte|mostra|mostre)|quero saber|gostaria de saber|voc[êe] (sabe|pode|consegue))\b/gi,
  /\b(us[ae]r? (a |o )?(tool|ferramenta)( de busca)?)\b/gi,
  /\b(judy|cobaia)\b/gi,
];

export function limparConsulta(texto) {
  let q = String(texto ?? "");
  for (const re of ENCHIMENTO) q = q.replace(re, " ");
  q = q.replace(/\b(dentro|d?entro) d[oa]s? subreddit\b/gi, " ")
    .replace(/\bsubreddit\b/gi, " ")
    .replace(/[“”"«»]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s,.;:!?\-–—'"]+|[\s,.;:!?\-–—'"]+$/g, "")
    .trim();
  return q.slice(0, 160);
}

export function subredditsDe(texto) {
  return [...new Set([...String(texto ?? "").matchAll(/(?:^|[\s(/])r\/([A-Za-z0-9_]{2,21})\b/g)].map((m) => m[1]))];
}

// Sem o modelo: a consulta limpa, e para subreddit uma 2ª consulta no reddit.
export function consultasDeterministicas(pergunta) {
  const base = limparConsulta(pergunta);
  const subs = subredditsDe(pergunta);
  const out = [];
  if (base) out.push(base);
  for (const s of subs.slice(0, 1)) {
    const assunto = limparConsulta(base.replace(new RegExp(`\\br/${s}\\b`, "i"), " "))
      .split(" ").filter((w) => !PALAVRAS_VAZIAS.has(w.toLowerCase())).join(" ");
    out.push(`site:reddit.com/r/${s} ${assunto}`.trim());
  }
  return [...new Set(out)].slice(0, 2);
}

// Consulta boa = palavras-chave, curta, sem pergunta embutida.
export function consultaValida(q) {
  const t = String(q ?? "").trim();
  if (t.length < 2 || t.length > 160) return false;
  if (/^[,.;:!?'"\-–—]/.test(t)) return false;
  return t.split(/\s+/).length <= 14;
}

export function promptReformular(hoje, ano) {
  return [
    `Hoje é ${hoje}.`,
    "Você transforma o pedido de alguém em consultas para um buscador de internet.",
    'Responda APENAS um JSON: {"consultas": ["...", "..."]}.',
    "Regras: 1 ou 2 consultas, cada uma com 2 a 8 palavras-chave — nada de \"pesquise\", \"por favor\", \"quais são\", pontuação ou a pergunta inteira.",
    "Corrija erros de digitação em nomes e termos conhecidos. Mantenha nomes próprios, marcas e siglas.",
    "Se o pedido cita um subreddit (r/Nome), uma das consultas DEVE ser `site:reddit.com/r/Nome <assunto>`.",
    `Se pede algo recente ou atual, inclua o ano ${ano} numa das consultas.`,
    "Escreva a consulta no idioma em que o assunto é mais discutido na internet (tecnologia e assuntos internacionais costumam render mais em inglês); se usar inglês numa, faça a outra em português.",
  ].join(" ");
}

// `chamarJson(messages)` → texto JSON do modelo. Falhou → determinístico.
export async function decidirConsultas(pergunta, { chamarJson = null, hoje = "", ano = new Date().getFullYear() } = {}) {
  const fallback = consultasDeterministicas(pergunta);
  if (typeof chamarJson !== "function") return { consultas: fallback, origem: "codigo" };
  try {
    const raw = await chamarJson([
      { role: "system", content: promptReformular(hoje, ano) },
      { role: "user", content: String(pergunta).slice(0, 1500) },
    ]);
    const obj = JSON.parse(String(raw).replace(/```json|```/g, "").trim());
    let cs = (Array.isArray(obj?.consultas) ? obj.consultas : [obj?.consulta ?? obj?.query])
      .map((q) => String(q ?? "").replace(/\s+/g, " ").trim()).filter(consultaValida);
    // O subreddit pedido não pode se perder na reescrita.
    const subs = subredditsDe(pergunta);
    if (subs.length && !cs.some((q) => q.toLowerCase().includes(`r/${subs[0].toLowerCase()}`))) {
      const det = fallback.find((q) => q.startsWith("site:reddit.com"));
      if (det) cs = [cs[0], det].filter(Boolean);
    }
    cs = [...new Set(cs)].slice(0, 2);
    return cs.length ? { consultas: cs, origem: "modelo" } : { consultas: fallback, origem: "codigo" };
  } catch {
    return { consultas: fallback, origem: "codigo" };
  }
}

// ─── Busca e relevância ──────────────────────────────────────────────────────

const normalizar = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function termosDe(...textos) {
  const t = normalizar(textos.join(" ")).replace(/site:\S+/g, " ").replace(/[^\p{L}\p{N}/]+/gu, " ");
  return [...new Set(t.split(/\s+/).filter((w) => w.length >= 3 && !PALAVRAS_VAZIAS.has(w)))];
}

// Quantos termos do pedido aparecem no título+trecho (+ bônus de subreddit).
export function pontuar(r, termos, subs = []) {
  const alvo = normalizar(`${r.titulo} ${r.trecho} ${r.url}`);
  let p = termos.reduce((n, w) => n + (alvo.includes(w) ? 1 : 0), 0);
  for (const s of subs) if (normalizar(r.url).includes(`/r/${normalizar(s)}`)) p += 3;
  return p;
}

export async function buscarSearx(consulta, { fetcher = fetch, n = N_POR_CONSULTA(), timeoutMs = TIMEOUT() } = {}) {
  const base = SEARXNG_URL();
  if (!base) throw new Error("SEARXNG_URL não configurado");
  const idioma = process.env.SEARXNG_IDIOMA || (pareceOutroIdioma(consulta) ? "en" : "pt-BR");
  const url = `${base}/search?q=${encodeURIComponent(consulta)}&format=json&language=${encodeURIComponent(idioma)}`;
  const r = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`SearXNG HTTP ${r.status}`);
  const data = await r.json();
  return (data.results ?? []).slice(0, n).map((x) => ({
    titulo: String(x.title ?? "").trim(), url: x.url,
    trecho: String(x.content ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
    data: x.publishedDate ?? null,
  })).filter((x) => x.url);
}

// ─── Leitura da página ───────────────────────────────────────────────────────

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function textoDoHtml(html) {
  return String(html ?? "")
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (ENTIDADES[e.toLowerCase()]) return ENTIDADES[e.toLowerCase()];
      if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (/^#\d/.test(e)) return String.fromCodePoint(Number(e.slice(1)));
      return m;
    })
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length >= 40).join("\n");
}

// Os parágrafos da página que mais falam do pedido, até `max` caracteres.
export function melhoresTrechos(texto, termos, max = 1200) {
  const pars = String(texto).split("\n");
  const pont = pars.map((p, i) => ({ p, i, s: termos.reduce((n, w) => n + (normalizar(p).includes(w) ? 1 : 0), 0) }));
  const escolhidos = pont.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
  const usar = (escolhidos.length ? escolhidos : pont.slice(0, 3));
  const out = [];
  let tam = 0;
  for (const x of usar) {
    const p = x.p.length > 600 ? `${x.p.slice(0, 600)}…` : x.p;
    if (tam + p.length > max) break;
    out.push(x); tam += p.length + 1;
  }
  return out.sort((a, b) => a.i - b.i).map((x) => (x.p.length > 600 ? `${x.p.slice(0, 600)}…` : x.p)).join("\n");
}

export async function lerPagina(url, termos, { fetcher = null, resolver } = {}) {
  try {
    // só internet pública, redirect conferido a cada salto (ver core/seguranca.js)
    const r = await buscarSeguro(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; JudyBot/1.0)", accept: "text/html,application/xhtml+xml" },
    }, { fetcher, resolver });
    if (!r.ok) return null;
    if (!/text\/html|xhtml/i.test(r.headers?.get?.("content-type") ?? "text/html")) return null;
    const html = (await lerTexto(r, 2 * 1024 * 1024)).slice(0, 600_000);
    const t = melhoresTrechos(textoDoHtml(html), termos);
    return t.length >= 80 ? t : null;
  } catch { return null; }
}

// ─── O fluxo inteiro ─────────────────────────────────────────────────────────

// `notaMinima`: quantos termos do pedido um resultado precisa ter para contar
// como relevante (a busca de fundo pede 2 — ver valeBuscarDeFundo).
export async function pesquisar(pergunta, { chamarJson = null, hoje = "", fetcher = fetch, resolver, log = () => {}, notaMinima = 1, lerPaginas = LER_PAGINAS(), timeoutMs = TIMEOUT() } = {}) {
  const { consultas, origem } = await decidirConsultas(pergunta, { chamarJson, hoje });
  log(`consultas (${origem}): ${consultas.map((q) => `"${q}"`).join(" · ")}`);
  const lotes = await Promise.all(consultas.map((q) => buscarSearx(q, { fetcher, timeoutMs }).catch((e) => { log(`busca "${q}" falhou: ${e.message}`); return { erro: e }; })));
  if (lotes.every((l) => l?.erro)) throw lotes[0].erro;

  const vistos = new Set();
  const todos = [];
  for (const l of lotes) for (const r of (Array.isArray(l) ? l : [])) {
    const chave = String(r.url).replace(/[#?].*$/, "").replace(/\/$/, "");
    if (vistos.has(chave)) continue;
    vistos.add(chave); todos.push(r);
  }
  const subs = subredditsDe(pergunta);
  const termos = termosDe(pergunta, ...consultas);
  const pontuados = todos.map((r, ordem) => ({ ...r, nota: pontuar(r, termos, subs), ordem }))
    .sort((a, b) => b.nota - a.nota || a.ordem - b.ordem);
  let resultados = pontuados.filter((r) => r.nota >= notaMinima).slice(0, 5);
  const fracos = !resultados.length;
  if (fracos) resultados = pontuados.slice(0, 3);
  log(`${todos.length} resultado(s), ${resultados.length} relevante(s)${fracos ? " (nenhum bate com o pedido)" : ""}`);

  const nLer = Math.min(lerPaginas ?? LER_PAGINAS(), resultados.length);
  if (nLer > 0) {
    const textos = await Promise.all(resultados.slice(0, nLer).map((r) => lerPagina(r.url, termos, { fetcher, resolver })));
    textos.forEach((t, i) => { if (t) resultados[i].texto = t; });
    log(`páginas lidas: ${textos.filter(Boolean).length}/${nLer}`);
  }
  return { consultas, resultados: resultados.map(({ nota, ordem, ...r }) => r), fracos };
}

// ─── Prompt e entrega ────────────────────────────────────────────────────────

const dominioDe = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };

export function blocoResultados(resultados) {
  return resultados.map((r, i) => [
    `[${i + 1}] ${r.titulo}${r.data ? ` (${String(r.data).slice(0, 10)})` : ""} — ${dominioDe(r.url) ?? r.url}`,
    r.trecho ? `Resumo do buscador: ${r.trecho}` : null,
    r.texto ? `Trecho da página:\n${r.texto}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");
}

export function instrucaoResposta(lang = "pt", fracos = false) {
  return lang === "en"
    ? "Answer the QUESTION directly, using only what the results say. Don't describe the results one by one (never \"text [1] talks about…\") — answer. Cite [n] only for results you actually used. "
      + (fracos ? "The results barely match the question: say plainly you didn't find a direct answer, then give the closest thing you found. " : "If the results don't answer it, say so in one sentence and give the closest thing you found. ")
      + "Never put links or URLs in the text — the sources are added below automatically."
    : "Responda à PERGUNTA diretamente, usando só o que os resultados dizem. Não descreva os resultados um por um (nunca \"o texto [1] fala de…\") — responda. Cite [n] só dos resultados que você usou de fato. "
      + (fracos ? "Os resultados quase não batem com a pergunta: diga com franqueza que não achou uma resposta direta e conte o que encontrou de mais próximo. " : "Se os resultados não respondem, diga isso numa frase e conte o que encontrou de mais próximo. ")
      + "Não coloque links nem URLs no texto — as fontes são acrescentadas embaixo, sozinhas.";
}

// ─── Busca de fundo (12 out 2026) ────────────────────────────────────────────
// Pedido de Ghieh: a Judy pesquisa SEMPRE, não só quando alguém pede — e os
// links aparecem só quando a pessoa pediu a busca (PEDIDO_EXPLICITO /
// PEDIDO_DE_BUSCA no chat.js). Sem pedido, a busca é silenciosa: os resultados
// entram no prompt para ela errar menos (modelo pequeno erra fato de memória),
// mas a resposta sai como conversa — sem [n], sem "Fontes", sem link.
//
// "Sempre" tem bom senso: mensagem só social ("oi", "valeu", "kkkk"), conta,
// imagem anexada e mensagem sem assunto não vão ao buscador — não há o que
// procurar, e resultado aleatório no prompt atrapalha mais do que ajuda.
const SOCIAL = new Set(("oi ola opa eae eai salve hey hello hii bom boa dia tarde noite tudo bem beleza blz obrigado obrigada brigado brigada "
  + "valeu vlw thanks thx tchau falou bye sim nao ok okay certo entendi legal top show massa quanto quanta tambem ainda agora "
  + "aqui ali isso tipo cara mano mana gente pessoal vamos bora acho achei acha sei sabe gosto gosta quero queria fala fale diz diga conte "
  + "kkk haha rsrs lol").split(" "));
const NOME_PROPRIO = /(?:^|[\s(])(?!Judy\b|Stoat\b|Eu\b|Você\b|Voce\b|Oi\b|Ola\b|Olá\b)[A-ZÀ-Þ][a-zà-þ]{2,}/;

export function termosDeAssunto(texto) {
  const limpo = String(texto ?? "").replace(/<@[^>]+>/g, " ").replace(/https?:\/\/\S+/g, " ");
  return termosDe(limpo).filter((w) => !SOCIAL.has(w) && !/^k{2,}$|^(?:ha){2,}h?$|^(?:rs){2,}$|^\d+$/.test(w));
}

// 12 out 2026, 2ª rodada — "está misturando a pesquisa com a conversa":
// "como está o servidor atualmente?" foi ao buscador, voltou notícia de
// reajuste de SERVIDOR PÚBLICO e a Judy contou isso como estado do servidor do
// Stoat. A busca de fundo agora só vai quando a mensagem PEDE informação do
// mundo: pergunta (? ou interrogativo) que não é sobre a própria conversa
// (servidor, canal, você, a gente…) — ou que cita um nome próprio, ano ou
// termo entre aspas. Afirmação ("eu gosto de minecraft"), pedido ("dá boa
// noite") e papo ("tudo bem?") respondem sem busca.
const PEDE_INFO = /\?|\b(quem|qual|quais|quando|onde|quant[oa]s?|por ?que|o que (?:é|e|foi|significa|aconteceu)|como funciona|existe|é verdade|what|who|when|where|which|how (?:many|much|does))\b/i;
const SOBRE_A_CONVERSA = /\b(servidor|server|chat|canal|grupo|aqui|a[ií]|voc[eê]s?|vcs?|tu|teu|tua|seu|sua|judy|gente|galera|pessoal|n[oó]s|eu|meu|minha|comigo|contigo|you|your|we|our|here)\b/i;
const PAPO = /\b(tudo (?:bem|bom|certo|tranquilo)|como (?:vai|vc|voc[eê]|tu)|e a[ií]|beleza|blz|bom dia|boa (?:tarde|noite)|how are you|what'?s up)\b/i;
const ENTIDADE = new RegExp(`${NOME_PROPRIO.source}|\\b(1[89]|20)\\d\\d\\b|["“][^"”]{2,40}["”]`);

export function valeBuscarDeFundo(pergunta) {
  const t = String(pergunta ?? "").replace(/<@[^>]+>/g, " ").replace(/^\s*judy\b[,:]?\s*/i, "");
  if (!t.trim()) return false;
  if (/\[(imagem\(ns\) anexada|attached image)/i.test(t)) return false;
  if (PAPO.test(t)) return false;
  if (!PEDE_INFO.test(t)) return false;                 // afirmação ou pedido: nada a procurar
  const termos = termosDeAssunto(t);
  if (!termos.length) return false;
  if (SOBRE_A_CONVERSA.test(t) && !ENTIDADE.test(t)) return false;   // "como está o servidor?"
  return termos.length >= 2 || ENTIDADE.test(t) || /\b(quem|qual|o que|who|what)\b/i.test(t);
}

// Busca de fundo entra como NOTAS no system, longe da fala da pessoa, sem
// número, domínio nem a palavra "resultado" — com "RESULTADOS: [1]…" colado na
// mensagem, o modelo pequeno respondia "os resultados de busca mostram…".
export function blocoReferencia(resultados, max = 3) {
  return (resultados ?? []).slice(0, max)
    .map((r) => `- ${r.titulo}${r.data ? ` (${String(r.data).slice(0, 10)})` : ""}: ${r.trecho || ""}`.trim())
    .join("\n");
}

// Frases que contam da busca ("os resultados de busca mostram que…",
// "segundo a pesquisa,", "pesquisei e…") saem; o fato fica.
export function semMencaoDaBusca(texto) {
  let t = foraDoCodigo(texto, (x) => x
    .replace(/\b(?:e |mas )?(?:os|pelos|nos|segundo os|de acordo com os|conforme os|pelo que vi n[oa]s)\s+(?:resultados?|links?|sites?|fontes?)(?:\s+d[ae]\s+(?:busca|pesquisa|internet))?(?:\s+(?:que\s+)?(?:encontrei|achei|vi))?(?:\s+(?:mostram|indicam|sugerem|apontam|trazem|dizem|falam(?: de)?|citam|mencionam))?(?:\s+que)?\s*[,:]?\s*/gi, (m) => (/^(?:e|mas) /i.test(m) ? m.match(/^(?:e|mas) /i)[0] : ""))
    .replace(/\b(?:segundo|de acordo com|conforme|pelo que vi n)(?:\s+(?:a|minha|uma|essa))?\s+(?:busca|pesquisa)(?:\s+r[aá]pida)?\s*[,:]?\s*/gi, "")
    .replace(/\b(?:pesquisei|busquei|procurei|dei uma olhada)(?:\s+(?:aqui|rapidinho|na internet|na web|online))*(?:\s+e)?\s*[,:]?\s*/gi, "")
    .replace(/\b(?:according to (?:the |my )?(?:search )?(?:results|search)|(?:the )?search results (?:show|suggest|indicate|say)(?: that)?|I (?:searched|looked it up)(?: and)?)\s*[,:]?\s*/gi, ""));
  // começo de frase que ficou em minúscula volta a ser maiúscula
  t = t.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase());
  return t.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

// Instrução da busca de fundo: ajuda se servir, some se não servir.
export function instrucaoFundo(lang = "pt", hoje = "") {
  return lang === "en"
    ? `REFERENCE NOTES (background knowledge${hoje ? ` as of ${hoje}` : ""}; may be unrelated to the conversation). Use a note only if the person is asking about exactly that subject; otherwise ignore them completely. Never mention notes, results, searches, sources or sites — talk as if you simply knew it.`
    : `NOTAS DE REFERÊNCIA (conhecimento de apoio${hoje ? ` de ${hoje}` : ""}; podem não ter relação com a conversa). Use uma nota só se a pessoa estiver perguntando exatamente sobre aquele assunto; senão ignore todas. Nunca fale de notas, resultados, busca, pesquisa, fontes ou sites — fale como quem simplesmente sabe.`;
}

// Protege blocos de código enquanto `fn` mexe no texto.
function foraDoCodigo(texto, fn) {
  const blocos = [];
  let t = String(texto ?? "").replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => { blocos.push(m); return `\u0000${blocos.length - 1}\u0000`; });
  t = fn(t);
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => blocos[Number(i)]);
}

// "[1]", "[1][3]", "[1, 2]" saem — sem rodapé, a citação aponta para o nada.
export function semCitacoes(texto) {
  return foraDoCodigo(texto, (t) => t
    .replace(/[ \t]*\[\d{1,2}(?:\s*[,;–-]\s*\d{1,2})*\](?!\()/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1"));
}

// Sem pedido de busca, link que veio dos resultados não vai para o chat:
// [texto](link) vira só o texto, link solto some. Link que a própria pessoa
// mandou (ou de site que a busca não trouxe) fica.
export function semLinksDaBusca(texto, urls = []) {
  const hosts = new Set(urls.map((u) => dominioDe(u)).filter(Boolean));
  if (!hosts.size) return String(texto ?? "");
  const daBusca = (u) => hosts.has(dominioDe(u));
  return foraDoCodigo(texto, (t) => t
    .replace(/\[([^\]\n]*)\]\(<?(https?:\/\/[^)>\s]+)>?\)/g, (m, rotulo, u) => (!daBusca(u) ? m : /^\s*(?:\[?\d{1,2}\]?|[\w-]+(?:\.[\w-]+)+)\s*$/.test(rotulo) ? "" : rotulo))   // rótulo que é só domínio ou número some junto
    .replace(/\(?<?(https?:\/\/[^\s<>)\]]+[^\s<>)\].,;:!?'"])>?\)?/g, (m, u) => (daBusca(u) ? "" : m))
    .replace(/\(\s*\)|<\s*>/g, "")
    // a frase que só apresentava o link ("Mais em  e .") vai embora com ele
    .replace(/[ \t]*\b(?:mais (?:informa\S* )?(?:em|no|na)|veja (?:mais )?(?:em|no|na)?|saiba mais(?: em| no| na)?|leia mais(?: em| no| na)?|confira(?: em| no| na)?|more (?:at|on|info at)|see)\b(?:[ \t,;:]|\be\b|\bou\b|\band\b|\bor\b)*([.!?]|$)/gim, (m, fim, off, tudo) => (off > 0 && /[.!?]\s*$/.test(tudo.slice(0, off)) ? "" : fim))
    .replace(/^[ \t]*(?:fontes?|sources?|links?|saiba mais)[ \t]*:[ \t·|,;–-]*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " "));
}

// URLs que o modelo viu: resultados da busca e as da ferramenta buscar_web
// (o caminho com ferramentas traz a sua própria lista na evidência).
export function urlsVistas(resultados = [], evidencia = "") {
  const daEvidencia = [...String(evidencia ?? "").matchAll(/"url"\s*:\s*"(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  return [...(resultados ?? []).map((r) => r.url), ...daEvidencia].filter(Boolean);
}

// "Fontes:" + lista que o PRÓPRIO modelo escreveu (o rodapé é do código). Sai
// o cabeçalho e as linhas de lista logo abaixo dele; o resto fica.
export function semFontesDoModelo(texto) {
  const linhas = String(texto ?? "").split("\n");
  const cab = /^\s*(?:\*\*|__)?\s*(?:fontes?|sources?|refer[êe]ncias?|references?)\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*$/i;
  const item = /^\s*(?:\[\d{1,2}\]|[-*•]|\d{1,2}[.)])\s*\S/;
  const saida = [];
  for (let i = 0; i < linhas.length; i++) {
    if (cab.test(linhas[i])) {
      let j = i + 1;
      while (j < linhas.length && (item.test(linhas[j]) || !linhas[j].trim())) j++;
      if (j > i + 1 || i === linhas.length - 1) { i = j - 1; continue; }
    }
    saida.push(linhas[i]);
  }
  return saida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Só as fontes citadas na resposta (máx. `max`); sem citação, as 2 primeiras.
export function rodapeFontes(resposta, resultados, consultas, { lang = "pt", max = Number(process.env.CHAT_FONTES_MAX || 3) } = {}) {
  if (!resultados?.length) return "";
  const citados = [...new Set([...String(resposta ?? "").matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))]
    .filter((n) => n >= 1 && n <= resultados.length);
  const nums = (citados.length ? citados : [1, 2].filter((n) => n <= resultados.length)).slice(0, max);
  const fontes = nums.map((n) => {
    const r = resultados[n - 1];
    const d = dominioDe(r.url);
    return d ? `[${n}] [${d}](<${r.url}>)` : null;
  }).filter(Boolean);
  const q = (consultas ?? []).map((x) => `"${x}"`).join(" · ");
  const cabec = lang === "es" ? `_🔎 busqué: ${q}_` : lang === "en" ? `_🔎 I searched: ${q}_` : `_🔎 busquei: ${q}_`;
  return fontes.length
    ? `\n\n${cabec}\n${lang === "es" ? "**Fuentes:**" : lang === "en" ? "**Sources:**" : "**Fontes:**"} ${fontes.join(" · ")}`
    : `\n\n${cabec}`;
}

// Link solto na resposta vira <link>; [texto](link) vira [texto](<link>):
// continuam clicáveis, mas o Stoat não gera prévia (o embed que incomodava).
export function semPreviaDeLinks(texto) {
  if (/^(1|true|sim)$/i.test(process.env.CHAT_PREVIA_LINKS ?? "")) return String(texto ?? "");
  const blocos = [];
  let t = String(texto ?? "").replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => { blocos.push(m); return `\u0000${blocos.length - 1}\u0000`; });
  t = t.replace(/\]\((https?:\/\/[^)\s]+)\)/g, "](<$1>)");
  t = t.replace(/(^|[^<(\w])(https?:\/\/[^\s<>)\]]+[^\s<>)\].,;:!?'"])/g, "$1<$2>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => blocos[Number(i)]);
}
