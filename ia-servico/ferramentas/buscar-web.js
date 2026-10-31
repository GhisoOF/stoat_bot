
import { buscar, explicarErroDeRede } from "./rede.js";
import { buscarNoSearxng, urlDoSearxng } from "../../modulos/ai/searxng.js";

// (P2) o pedido é o do cliente único (modulos/ai/searxng.js, o mesmo do bot)
const MAX_RESULT  = Number(process.env.SEARXNG_MAX || 5);

export const definicao = {
  type: "function",
  function: {
    name: "buscar_web",
    description: "Busca na internet informação ATUAL: notícias, eventos recentes, preços, versões de software, dados que mudam com o tempo, ou qualquer fato que você não tenha certeza de saber. Devolve resultados (título, link, trecho) para você resumir e responder com suas palavras.",
    parameters: {
      type: "object",
      required: ["consulta"],
      properties: {
        consulta: { type: "string", description: "O que buscar. Seja específico e curto, como numa busca real." },
        maximo: { type: "number", description: `Quantos resultados (padrão ${MAX_RESULT}, máximo 8).` },
      },
    },
  },
};

export async function executar({ consulta, maximo } = {}) {
  const q = String(consulta || "").trim();
  if (!q) return { erro: "Nenhuma consulta informada." };

  const n = Math.min(Number(maximo) || MAX_RESULT, 8);
  try {
    const itens = (await buscarNoSearxng(q, { n, fetcher: buscar, tamanhoTrecho: 300 }))
      .map(({ titulo, url, trecho }) => ({ titulo, url, trecho }));
    if (!itens.length) return { consulta: q, total: 0, nota: "Nenhum resultado encontrado." };
    return { consulta: q, total: itens.length, resultados: itens };
  } catch (e) {
    if (e?.status) return { erro: e.message };
    // Erro de rede tem explicação específica; o resto vai cru mesmo.
    const codigo = e?.cause?.code ?? e?.code ?? "";
    if (codigo || /fetch failed/i.test(e?.message ?? "")) {
      return { erro: explicarErroDeRede(e, `o SearXNG (${urlDoSearxng() || "sem SEARXNG_URL"})`) };
    }
    const msg = (e?.message ?? String(e)).slice(0, 200);
    return { erro: `Busca falhou: ${msg}. Confira se o SearXNG está no ar em ${urlDoSearxng() || "(sem SEARXNG_URL)"}.` };
  }
}
