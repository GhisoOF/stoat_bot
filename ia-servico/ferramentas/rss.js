
import Parser from "rss-parser";
import { buscarSeguro, lerTexto } from "../../modulos/core/seguranca.js";

const parser = new Parser({ timeout: 15000 });
const MAX_FEED_BYTES = 2 * 1024 * 1024;

// O feed passa pela busca que só fala com a internet pública (15 out 2026):
// o parseURL do rss-parser buscava QUALQUER endereço que a IA pedisse —
// localhost, a rede interna, a Tailscale — seguindo redirect e sem teto.
async function lerFeed(url) {
  const r = await buscarSeguro(url, { signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "Mozilla/5.0 (Judy RSS)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parser.parseString(await lerTexto(r, MAX_FEED_BYTES));
}
const MAX_ITENS = Number(process.env.RSS_MAX_ITENS || 12);

const feedsPadrao = () =>
  (process.env.RSS_FEEDS || "").split(",").map((s) => s.trim()).filter(Boolean);

export const definicao = {
  type: "function",
  function: {
    name: "buscar_rss",
    description: "Busca as notícias mais recentes de feeds RSS. Use quando pedirem um resumo de notícias, novidades dos feeds ou 'o que saiu hoje'. Devolve os itens (título, data, link, trecho) para você resumir com suas palavras.",
    parameters: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          description: "Opcional: só para escolher ENTRE os feeds já cadastrados (endereço exato). Feed fora da lista não é lido. Se omitido, usa todos os cadastrados.",
        },
        maximo: { type: "number", description: `Quantos itens no total (padrão ${MAX_ITENS}).` },
      },
    },
  },
};

// (31 out 2026, P1) Só os feeds CADASTRADOS: os de RSS_FEEDS e os que o servidor da
// conversa tem no `&rss` (o bot manda em `contexto.feeds`). Endereço pedido na
// conversa nunca é lido — era o jeito de qualquer um fazer a máquina de casa buscar
// a URL que quisesse (e entregar o IP dela).
export function feedsPermitidos(contexto = {}) {
  const doBot = Array.isArray(contexto?.feeds) ? contexto.feeds : [];
  return [...new Set([...feedsPadrao(), ...doBot].map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u)))].slice(0, 50);
}

export async function executar({ urls, maximo } = {}, contexto = {}) {
  const cadastrados = feedsPermitidos(contexto);
  const pedidos = Array.isArray(urls) ? urls.map((u) => String(u).trim()).filter(Boolean) : [];
  const alvos = pedidos.length ? cadastrados.filter((u) => pedidos.includes(u)) : cadastrados;
  if (!cadastrados.length) return { erro: "Nenhum feed cadastrado neste servidor (o `&rss` cadastra)." };
  if (!alvos.length) return { erro: "Só leio os feeds cadastrados neste servidor — esse endereço não está entre eles." };

  const limite = Math.min(Number(maximo) || MAX_ITENS, 30);
  const itens = [];
  const falhas = [];

  for (const url of alvos.slice(0, 10)) {
    try {
      const feed = await lerFeed(String(url));
      for (const it of (feed.items || []).slice(0, limite)) {
        itens.push({
          feed: feed.title || url,
          titulo: it.title || "(sem título)",
          data: it.isoDate || it.pubDate || null,
          link: it.link || null,
          trecho: (it.contentSnippet || it.summary || "").replace(/\s+/g, " ").slice(0, 300),
        });
      }
    } catch (e) {
      falhas.push({ url, motivo: (e?.message ?? String(e)).slice(0, 120) });
    }
  }

  // mais recentes primeiro
  itens.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));

  return {
    total: itens.length,
    itens: itens.slice(0, limite),
    falhas: falhas.length ? falhas : undefined,
  };
}
