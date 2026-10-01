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

export async function buscarSearx(consulta, { fetcher = fetch, n = N_POR_CONSULTA() } = {}) {
  const base = SEARXNG_URL();
  if (!base) throw new Error("SEARXNG_URL não configurado");
  const idioma = process.env.SEARXNG_IDIOMA || (pareceOutroIdioma(consulta) ? "en" : "pt-BR");
  const url = `${base}/search?q=${encodeURIComponent(consulta)}&format=json&language=${encodeURIComponent(idioma)}`;
  const r = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT()) });
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

export async function lerPagina(url, termos, { fetcher = fetch } = {}) {
  try {
    const r = await fetcher(url, {
      signal: AbortSignal.timeout(6000), redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; JudyBot/1.0)", accept: "text/html,application/xhtml+xml" },
    });
    if (!r.ok) return null;
    if (!/text\/html|xhtml/i.test(r.headers?.get?.("content-type") ?? "text/html")) return null;
    const html = (await r.text()).slice(0, 600_000);
    const t = melhoresTrechos(textoDoHtml(html), termos);
    return t.length >= 80 ? t : null;
  } catch { return null; }
}

// ─── O fluxo inteiro ─────────────────────────────────────────────────────────

export async function pesquisar(pergunta, { chamarJson = null, hoje = "", fetcher = fetch, log = () => {} } = {}) {
  const { consultas, origem } = await decidirConsultas(pergunta, { chamarJson, hoje });
  log(`consultas (${origem}): ${consultas.map((q) => `"${q}"`).join(" · ")}`);
  const lotes = await Promise.all(consultas.map((q) => buscarSearx(q, { fetcher }).catch((e) => { log(`busca "${q}" falhou: ${e.message}`); return { erro: e }; })));
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
  let resultados = pontuados.filter((r) => r.nota >= 1).slice(0, 5);
  const fracos = !resultados.length;
  if (fracos) resultados = pontuados.slice(0, 3);
  log(`${todos.length} resultado(s), ${resultados.length} relevante(s)${fracos ? " (nenhum bate com o pedido)" : ""}`);

  const nLer = Math.min(LER_PAGINAS(), resultados.length);
  if (nLer > 0) {
    const textos = await Promise.all(resultados.slice(0, nLer).map((r) => lerPagina(r.url, termos, { fetcher })));
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
  const cabec = lang === "en" ? `_🔎 I searched: ${q}_` : `_🔎 busquei: ${q}_`;
  return fontes.length
    ? `\n\n${cabec}\n${lang === "en" ? "**Sources:**" : "**Fontes:**"} ${fontes.join(" · ")}`
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
