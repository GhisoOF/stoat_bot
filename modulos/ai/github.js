// github.js — a Judy sabe o que mudou nela: lê o histórico do próprio
// repositório no GitHub (12 out 2026).
//
// O caso: "poderia dizer os últimos updates feitos em você?" → "os mais
// recentes focaram na inteligência do LLM" (inventado, vago); e "pesquise no
// seu github o commit 0eb26f0…" virou busca na web, que trouxe um gist sobre
// COMO ESCREVER mensagens de commit — e ela comentou o gist. O histórico é
// público e tem API: em vez de chutar ou buscar na web, ela lê os commits.
//
// GITHUB_REPO (padrão GhisoOF/stoat_bot) diz de qual repositório; GITHUB_TOKEN
// é opcional (público funciona sem; com token o limite da API sobe).

import { buscarSeguro, lerTexto } from "../core/seguranca.js";

const API = "https://api.github.com";
const CACHE_MS = 10 * 60_000;
const cache = new Map();   // url → { quando, dados }

export const repo = () => (process.env.GITHUB_REPO || "GhisoOF/stoat_bot").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");

// Para os testes: troca a função que busca (padrão: buscarSeguro).
let buscar = (url, opcoes) => buscarSeguro(url, opcoes);
export function _trocarBusca(fn) { buscar = fn ?? ((url, opcoes) => buscarSeguro(url, opcoes)); cache.clear(); }

// ─── O que a pessoa está pedindo ─────────────────────────────────────────────

// Fronteira de palavra que entende acento (o \b do JS acha que "ú" e "ê" não
// são letra: "\bvocê\b" nunca casava no fim da frase).
const I = "(?<![\\p{L}\\p{N}])", F = "(?![\\p{L}\\p{N}])";
const SOBRE_ELA = new RegExp(`${I}(voc[eê]|vc|ti|te|tu|judy|cobaia|bot|seu|sua|seus|suas|dela|nela)${F}`, "iu");
const MUDANCAS = "(?:updates?|atualiza\\p{L}*|mudan[çc]as?|commits?|features?|novidades?|recursos?|funcionalidades?|vers(?:ão|ao|ões|oes)|melhorias?|changelog|patch ?notes?)";
const PEDE_MUDANCAS = new RegExp([
  `${I}(?:[uú]ltim[oa]s?|recentes?|nov[oa]s?|mais nov[oa]s?)\\s+${MUDANCAS}${F}`,
  `${I}${MUDANCAS}\\s+(?:nov[oa]s?|recentes?|mais recentes?)${F}`,
  `${I}o que (?:mudou|h[aá] de novo|tem de novo|foi (?:adicionad|feit|mudad)\\p{L}*|adicionaram|adicionou|fizeram|fez|atualizaram|atualizou)${F}`,
  `${I}(?:changelog|patch ?notes?|what['’]?s new|recent (?:changes|updates|commits)|latest (?:changes|updates|commits))${F}`,
].join("|"), "iu");

// "últimos updates feitos em você", "o que mudou na Judy", "features novas que
// eu adicionei em você" — precisa falar de mudanças E de você/a Judy.
export function pedeMudancas(texto) {
  const t = String(texto ?? "");
  return PEDE_MUDANCAS.test(t) && SOBRE_ELA.test(t);
}

// Hash de commit: 40 hexadecimais em qualquer lugar, ou 7–39 com a palavra
// commit/hash/sha perto (para não confundir com uma palavra qualquer).
export function hashDeCommit(texto) {
  const t = String(texto ?? "");
  const longo = t.match(/\b[0-9a-f]{40}\b/i);
  if (longo) return longo[0].toLowerCase();
  if (!/\b(commit|hash|sha)\b/i.test(t)) return null;
  const curto = [...t.matchAll(/\b[0-9a-f]{7,39}\b/gi)].map((m) => m[0]).find((h) => /\d/.test(h) && /[a-f]/i.test(h));
  return curto ? curto.toLowerCase() : null;
}

// Período pedido: "semana passada" → 14 dias; "hoje"/"ontem" → 2; "mês" → 31.
export function diasDoPeriodo(texto) {
  const t = String(texto ?? "").toLowerCase();
  if (/(?<![\p{L}])(hoje|ontem|today|yesterday)(?![\p{L}])/u.test(t)) return 2;
  if (/(?<![\p{L}])(semana|week)(?![\p{L}])/u.test(t)) return 14;
  if (/(?<![\p{L}])(m[eê]s|month)(?![\p{L}])/u.test(t)) return 31;
  return null;
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function pedirApi(caminho) {
  const url = `${API}${caminho}`;
  const c = cache.get(url);
  if (c && Date.now() - c.quando < CACHE_MS) return c.dados;
  const headers = { accept: "application/vnd.github+json", "user-agent": "JudyBot (stoat)", "x-github-api-version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await buscar(url, { headers, signal: AbortSignal.timeout(Number(process.env.GITHUB_TIMEOUT_MS || 8000)) });
  if (r.status === 404 || r.status === 422) { const e = new Error("não existe nesse repositório"); e.naoAchou = true; throw e; }
  if (r.status === 401) throw new Error("GITHUB_TOKEN inválido ou vencido (repositório público funciona sem ele)");
  if (r.status === 403 || r.status === 429) throw new Error("limite da API do GitHub atingido (GITHUB_TOKEN aumenta o limite)");
  if (!r.ok) throw new Error(`GitHub respondeu HTTP ${r.status}`);
  const dados = JSON.parse(await lerTexto(r, 3 * 1024 * 1024));   // com teto: resposta da internet
  cache.set(url, { quando: Date.now(), dados });
  return dados;
}

const dataCurta = (iso) => String(iso ?? "").slice(0, 10);
const primeiraLinha = (m) => String(m ?? "").split("\n")[0].trim();

export async function ultimosCommits({ n = 12, dias = null } = {}) {
  const desde = dias ? `&since=${new Date(Date.now() - dias * 86_400_000).toISOString()}` : "";
  const lista = await pedirApi(`/repos/${repo()}/commits?per_page=${Math.min(30, n)}${desde}`);
  return (Array.isArray(lista) ? lista : []).map((c) => ({
    sha: c.sha, curto: String(c.sha).slice(0, 7),
    data: dataCurta(c.commit?.author?.date ?? c.commit?.committer?.date),
    titulo: primeiraLinha(c.commit?.message),
    corpo: String(c.commit?.message ?? "").split("\n").slice(1).join("\n").replace(/^(Co-Authored-By|Claude-Session):.*$/gim, "").trim(),
    url: c.html_url,
  }));
}

export async function commit(sha) {
  const c = await pedirApi(`/repos/${repo()}/commits/${encodeURIComponent(sha)}`);
  return {
    sha: c.sha, curto: String(c.sha).slice(0, 7),
    data: dataCurta(c.commit?.author?.date),
    autor: c.commit?.author?.name ?? c.author?.login ?? "?",
    mensagem: String(c.commit?.message ?? "").replace(/^(Co-Authored-By|Claude-Session):.*$/gim, "").trim(),
    stats: c.stats ?? null,
    arquivos: (c.files ?? []).map((f) => ({ nome: f.filename, status: f.status, mais: f.additions, menos: f.deletions })),
    url: c.html_url,
  };
}

// ─── Material para o prompt ──────────────────────────────────────────────────

const INSTRUCAO = {
  pt: "Responda com base SÓ nisto, em linguagem simples para quem usa o bot (o que muda para as pessoas, não o nome dos arquivos), agrupando o que for parecido. Não cole a lista crua, não invente o que não está escrito, não fale de \"boas práticas de commit\". Datas no formato dia/mês.",
  en: "Answer based ONLY on this, in plain language for people who use the bot (what changes for them, not file names), grouping similar items. Don't paste the raw list, don't invent anything not written here, don't talk about \"commit best practices\". Dates as day/month.",
};

export function materialDeCommits(lista, { lang = "pt", dias = null } = {}) {
  if (!lista?.length) return lang === "en"
    ? `REAL HISTORY of the repository ${repo()} on GitHub, read now: no commits${dias ? ` in the last ${dias} days` : ""}.`
    : `HISTÓRICO REAL do repositório ${repo()} no GitHub, lido agora: nenhum commit${dias ? ` nos últimos ${dias} dias` : ""}.`;
  const linhas = lista.map((c) => `- ${c.data} · ${c.titulo}${c.corpo ? `\n  ${c.corpo.replace(/\s+/g, " ").slice(0, 300)}` : ""}`);
  return (lang === "en"
    ? `REAL HISTORY of the repository ${repo()} on GitHub (your own code), read now — newest first${dias ? `, last ${dias} days` : ""}:\n`
    : `HISTÓRICO REAL do repositório ${repo()} no GitHub (o seu próprio código), lido agora — mais recente primeiro${dias ? `, últimos ${dias} dias` : ""}:\n`)
    + linhas.join("\n").slice(0, 4500) + "\n" + INSTRUCAO[lang === "en" ? "en" : "pt"];
}

export function materialDeCommit(c, { lang = "pt" } = {}) {
  const arquivos = c.arquivos.slice(0, 30).map((f) => `  ${f.status === "added" ? "+" : f.status === "removed" ? "−" : "~"} ${f.nome} (+${f.mais} −${f.menos})`).join("\n");
  return (lang === "en"
    ? `REAL COMMIT ${c.curto} of the repository ${repo()} (your own code), read now from GitHub — ${c.data}, by ${c.autor}${c.stats ? `, +${c.stats.additions} −${c.stats.deletions} lines` : ""}:\nMESSAGE:\n${c.mensagem.slice(0, 2500)}\nFILES (${c.arquivos.length}):\n${arquivos}`
    : `COMMIT REAL ${c.curto} do repositório ${repo()} (o seu próprio código), lido agora do GitHub — ${c.data}, por ${c.autor}${c.stats ? `, +${c.stats.additions} −${c.stats.deletions} linhas` : ""}:\nMENSAGEM:\n${c.mensagem.slice(0, 2500)}\nARQUIVOS (${c.arquivos.length}):\n${arquivos}`)
    + "\n" + INSTRUCAO[lang === "en" ? "en" : "pt"];
}

export function materialDeFalha(erro, { lang = "pt", sha = null } = {}) {
  const alvo = sha ? (lang === "en" ? `commit ${sha.slice(0, 12)}` : `o commit ${sha.slice(0, 12)}`) : (lang === "en" ? "the commit history" : "o histórico de commits");
  return lang === "en"
    ? `READING GITHUB FAILED: I tried to read ${alvo} of ${repo()} and couldn't (${erro}). Say that in one sentence; do NOT guess what changed.`
    : `LEITURA DO GITHUB FALHOU: tentei ler ${alvo} de ${repo()} e não consegui (${erro}). Diga isso em uma frase; NÃO chute o que mudou.`;
}

// Pedido → material pronto (ou null se não é sobre isso).
export async function materialPara(pergunta, { lang = "pt" } = {}) {
  const sha = hashDeCommit(pergunta);
  if (sha) {
    try {
      const c = await commit(sha);
      return { texto: materialDeCommit(c, { lang }), link: c.url, tipo: "commit" };
    } catch (e) {
      return { texto: materialDeFalha(e.naoAchou ? (lang === "en" ? "that hash isn't in this repository" : "esse hash não existe nesse repositório") : e.message, { lang, sha }), tipo: "falha" };
    }
  }
  if (pedeMudancas(pergunta)) {
    const dias = diasDoPeriodo(pergunta);
    try {
      const lista = await ultimosCommits({ n: dias ? 30 : 12, dias });
      return { texto: materialDeCommits(lista, { lang, dias }), tipo: "historico" };
    } catch (e) {
      return { texto: materialDeFalha(e.message, { lang }), tipo: "falha" };
    }
  }
  return null;
}
