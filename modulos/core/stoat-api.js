// Um lugar só para falar HTTP com a API do Stoat.
//
// Antes, seis arquivos repetiam a MESMA linha para descobrir o endereço:
//   const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(...)
// e cada um montava o `fetch` com o header do bot à mão, com timeouts
// diferentes (ou nenhum). Trocar o endereço, o header ou o tratamento de erro
// exigia caçar as seis cópias — e uma delas sempre ficava para trás.
//
// Aqui: `API` é o endereço, `chamarApi` é a chamada. Nada mais.

export const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");

/**
 * Uma chamada à API do Stoat, com token do bot e tempo limite.
 *
 * NUNCA lança: devolve sempre o mesmo formato, e quem chamou decide o que
 * fazer. Rota de rede que lança no meio de um comando derruba o comando
 * inteiro — foi assim que diagnósticos de voz morriam sem dizer onde pararam.
 *
 * @returns {Promise<{ok, status, ms, texto, json, ehHtml, erro}>}
 *   ok     — a resposta veio com status 2xx
 *   json   — o corpo já convertido, ou null se não era JSON
 *   ehHtml — quem respondeu foi um proxy/CDN, não a API (pista de rede)
 *   erro   — só quando nem houve resposta (rede, DNS, tempo esgotado)
 */
export async function chamarApi(rota, { metodo = "GET", corpo = null, token = null, ms = 10_000 } = {}) {
  const t = Date.now();
  const autenticacao = token ?? process.env.BOT_TOKEN ?? "";
  try {
    const r = await fetch(`${API}${rota}`, {
      method: metodo,
      headers: {
        ...(autenticacao ? { "X-Bot-Token": autenticacao } : {}),
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      signal: AbortSignal.timeout(ms),
    });
    const texto = await r.text().catch(() => "");
    let json = null;
    try { json = JSON.parse(texto); } catch { /* nem toda resposta é JSON */ }
    return {
      ok: r.ok, status: r.status, ms: Date.now() - t, texto, json,
      ehHtml: /^\s*<(!doctype|html)/i.test(texto),
    };
  } catch (e) {
    const erro = /timeout|abort/i.test(e?.name ?? "")
      ? `${ms / 1000}s sem resposta de ${rota}`
      : (e?.cause?.code ?? e?.message ?? String(e));
    return { ok: false, status: 0, ms: Date.now() - t, texto: "", json: null, ehHtml: false, erro };
  }
}
