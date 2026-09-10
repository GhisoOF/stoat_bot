
import Parser from "rss-parser";

const parser = new Parser({ timeout: 15000 });
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
          description: "URLs dos feeds. Se omitido, usa os feeds configurados no servidor.",
        },
        maximo: { type: "number", description: `Quantos itens no total (padrão ${MAX_ITENS}).` },
      },
    },
  },
};

export async function executar({ urls, maximo } = {}) {
  const alvos = (Array.isArray(urls) && urls.length ? urls : feedsPadrao());
  if (!alvos.length) return { erro: "Nenhum feed informado nem configurado (RSS_FEEDS)." };

  const limite = Math.min(Number(maximo) || MAX_ITENS, 30);
  const itens = [];
  const falhas = [];

  for (const url of alvos.slice(0, 10)) {
    try {
      const feed = await parser.parseURL(url);
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
