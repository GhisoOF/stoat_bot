// llm.js — o único cliente do servidor de modelos (llama.cpp/llama-swap) dentro do
// ia-servico (31 out 2026, P1). Antes eram dois (o laço de ferramentas e a visão),
// cada um com o seu timeout e o seu tratamento de erro — e o do laço ainda mandava
// `Authorization` para um provedor online, que foi removido: o modelo é sempre o
// local, e nada da conversa, das ferramentas ou das imagens sai da máquina.

export const LLM_URL = (process.env.LLM_URL || "").replace(/\/$/, "");

// POST /v1/chat/completions; devolve o JSON. Erro HTTP vira exceção com o status
// e o começo do corpo (vai para o log do serviço, não para a tela).
export async function pedirLLM(corpo, { timeoutMs = 300_000, fetcher = fetch } = {}) {
  if (!LLM_URL) throw new Error("sem servidor de modelos (LLM_URL vazio)");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetcher(`${LLM_URL}/v1/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo), signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status} — ${(await r.text().catch(() => "")).slice(0, 200)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// GET /v1/models → nomes dos modelos carregáveis (o /diagnostico do boot usa).
export async function modelosDoLLM({ timeoutMs = 5000, fetcher = fetch } = {}) {
  const r = await fetcher(`${LLM_URL}/v1/models`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 404 ? " (a URL não serve /v1/models — llama-swap na porta certa?)" : ""}`);
  const d = await r.json().catch(() => ({}));
  return (d.data ?? d.models ?? []).map((m) => m.id || m.model || m.name).filter(Boolean);
}
