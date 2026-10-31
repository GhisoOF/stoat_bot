// searxng.js — o cliente único do SearXNG (31 out 2026, P2).
//
// Eram dois: o do bot (busca.js — a busca de fundo e a pedida) e o do ia-servico
// (a ferramenta buscar_web), cada um montando a URL, o idioma e o formato do
// resultado do seu jeito. Aqui: a URL (SEARXNG_URL), o idioma (SEARXNG_IDIOMA, ou
// o que quem chama passa), o teto de tempo e o resultado já normalizado.
export const urlDoSearxng = () => (process.env.SEARXNG_URL || "").replace(/\/$/, "");

// → [{ titulo, url, trecho, data }]. Erro: `.status` (HTTP) ou o erro de rede cru.
export async function buscarNoSearxng(consulta, { n = 5, idioma = null, timeoutMs = 20000, fetcher = fetch, tamanhoTrecho = 400 } = {}) {
  const base = urlDoSearxng();
  if (!base) throw new Error("SEARXNG_URL não configurado");
  const lingua = idioma || process.env.SEARXNG_IDIOMA || "pt-BR";
  const url = `${base}/search?q=${encodeURIComponent(consulta)}&format=json&language=${encodeURIComponent(lingua)}`;
  const r = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw Object.assign(new Error(r.status === 403
    ? "SearXNG recusou (formato JSON pode estar desabilitado no settings.yml)"
    : `SearXNG HTTP ${r.status}`), { status: r.status });
  const data = await r.json();
  return (data.results ?? []).slice(0, n).map((x) => ({
    titulo: String(x.title ?? "").trim(), url: x.url,
    trecho: String(x.content ?? "").replace(/\s+/g, " ").trim().slice(0, tamanhoTrecho),
    data: x.publishedDate ?? null,
  })).filter((x) => x.url);
}
