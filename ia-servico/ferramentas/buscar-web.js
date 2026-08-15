// ══════════════════════════════════════════════════════════
//  buscar-web.js — busca na internet via SearXNG
//
//  A Judy usa quando precisa de informação atual (notícias, dados
//  recentes, fatos que ela não teria de cabeça). Devolve os
//  resultados crus (título, url, trecho) e ela escreve a resposta.
//
//  SEARXNG_URL aponta para a instância de busca. O formato JSON
//  precisa estar habilitado no settings.yml do SearXNG.
// ══════════════════════════════════════════════════════════

import { buscar, explicarErroDeRede } from "./rede.js";

const SEARXNG_URL = (process.env.SEARXNG_URL || "http://localhost:8080").replace(/\/$/, "");
const IDIOMA      = process.env.SEARXNG_IDIOMA || "pt-BR";
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
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(q)}&format=json&language=${encodeURIComponent(IDIOMA)}`;

  try {
    const r = await buscar(url, { signal: AbortSignal.timeout(20000) });
    if (r.status === 403) return { erro: "SearXNG recusou (formato JSON pode estar desabilitado no settings.yml)." };
    if (!r.ok) return { erro: `SearXNG HTTP ${r.status}` };
    const data = await r.json();
    const itens = (data.results ?? []).slice(0, n).map((x) => ({
      titulo: x.title,
      url: x.url,
      trecho: (x.content || "").replace(/\s+/g, " ").slice(0, 300),
    }));
    if (!itens.length) return { consulta: q, total: 0, nota: "Nenhum resultado encontrado." };
    return { consulta: q, total: itens.length, resultados: itens };
  } catch (e) {
    // Erro de rede tem explicação específica; o resto vai cru mesmo.
    const codigo = e?.cause?.code ?? e?.code ?? "";
    if (codigo || /fetch failed/i.test(e?.message ?? "")) {
      return { erro: explicarErroDeRede(e, `o SearXNG (${SEARXNG_URL})`) };
    }
    const msg = (e?.message ?? String(e)).slice(0, 200);
    return { erro: `Busca falhou: ${msg}. Confira se o SearXNG está no ar em ${SEARXNG_URL}.` };
  }
}
