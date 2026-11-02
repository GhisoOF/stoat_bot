// modelo.js — TODA a IA que sobrou no bot, num lugar só (2 nov 2026, P4).
//
// Decisão do dono (P4): o chat IA saiu por completo; a IA fica SÓ na moderação, e
// ele quer poder tirá-la também no futuro mexendo num lugar só. Este módulo é esse
// lugar: nenhum outro arquivo do bot fala com o servidor de modelos nem com o
// ia-servico. Quem usa:
//   • o juiz dos temas proibidos (assuntos.js) — `julgar`, ligado pelo main.js;
//   • a visão das imagens (imagem.js) e do perfil (avatar.js/perfil.js) —
//     `descreverImagem` (rota /moderar-imagem) e `hashImagem` (rota /hash-imagem);
//   • o `&debug` — `saude` e os nomes dos modelos.
// Para tirar a IA da moderação: apagar este arquivo e os pontos que o importam (o
// grep por "modelo.js" lista todos), e o ia-servico/llama do iniciar.js.
//
// Por que em moderacao/ e não em core/: core/ é o que vários módulos dividem; a IA,
// agora, é só da moderação. (A leitura da chave e dos endereços mora no modelo-enderecos.js,
// sem dependências: o ia-servico a importa de lá sem carregar o core/env.js — R10/DRY.)
//
// Sem estado de conversa, sem fila de prioridade, sem emenda de resposta cortada:
// o juiz pede JSON curto, sem raciocínio, temperatura 0. O que fica do cliente
// antigo (llm.js): a espera no 429 do llama-swap, o corte do <think>, o "refaz com
// o dobro" quando o raciocínio comeu os tokens, e um teto de pedidos simultâneos.

import { numero, iaLigada } from "../core/env.js";
import { chaveServicoIA, servicoUrl, llmUrl } from "./modelo-enderecos.js";

// ── Configuração (lida na hora: o iniciar.js define os nomes no boot; os testes trocam) ──
export { chaveServicoIA, servicoUrl, llmUrl };
// O juiz: LLM_MODEL_JUIZ (no modo local, o iniciar.js põe o nome do llama-swap); sem
// ele, o LLM_MODEL (quem aponta para um servidor de modelos de fora).
export const modeloJuiz = () => process.env.LLM_MODEL_JUIZ || process.env.LLM_MODEL || "";
export const modeloVisao = () => process.env.LLM_MODEL_VISAO || "";
// A IA da moderação existe? (IA=0 desliga; sem o serviço não há visão nem hash)
export const ligada = () => iaLigada();
export const temServico = () => ligada() && !!servicoUrl();
export const temJuiz = () => ligada() && !!llmUrl();

const cabecalhos = () => ({ "Content-Type": "application/json", ...(chaveServicoIA() ? { "x-chave": chaveServicoIA() } : {}) });

// ── O juiz (o servidor de modelos, formato OpenAI) ──────────────────────────
export function limparRaciocinio(texto) {
  return String(texto ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")   // bloco completo
    .replace(/^[\s\S]*?<\/think>/i, "")          // abertura perdida no começo
    .replace(/<think>[\s\S]*$/i, "")             // sem fechamento: o raciocínio foi cortado (max_tokens)
    .trim();
}

// 429 (llama-swap cheio: "concurrency_limit") é passageiro: espera e repete.
const esperas429 = () => String(process.env.LLM_ESPERAS_429 ?? "2000,5000,10000").split(",").map(Number).filter((n) => Number.isFinite(n) && n >= 0);
async function pedirUmaVez(url, corpo, { fetcher, timeoutMs }) {
  const r = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) {
    const e = new Error(`modelo HTTP ${r.status} — ${(await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200)}`);
    if (r.status === 429) e.lotado = true;
    throw e;
  }
  return r.json();
}
async function pedir(url, corpo, opcoes) {
  const esperas = esperas429();
  for (let tentativa = 0; ; tentativa++) {
    try { return await pedirUmaVez(url, corpo, opcoes); }
    catch (e) {
      if (!e?.lotado || tentativa >= esperas.length) throw e;
      console.warn(`[MODELO] servidor de modelos lotado (429) — de novo em ${esperas[tentativa] / 1000}s`);
      await new Promise((ok) => setTimeout(ok, esperas[tentativa]));
    }
  }
}

// No máximo LLM_PARALELO pedidos do juiz no servidor de modelos de cada vez (R11).
let emVoo = 0;
const esperando = [];
async function vaga() {
  const max = numero("LLM_PARALELO", 2, { min: 1, max: 64, inteiro: true });
  if (emVoo < max) { emVoo++; return; }
  await new Promise((ok) => esperando.push(ok));
  emVoo++;
}
function soltar() { emVoo = Math.max(0, emVoo - 1); esperando.shift()?.(); }

const TOKENS_JUIZ = 1200;   // o raciocínio de alguns modelos come o orçamento antes do JSON

// `messages`: [{ role, content }]. Devolve o TEXTO da resposta (o JSON que o modelo
// escreveu); quem chama interpreta. Erro (rede, HTTP) vira exceção — nunca punição.
export async function julgar(messages, { etiqueta = "juiz", fetcher = fetch } = {}) {
  if (!llmUrl()) throw new Error("sem servidor de modelos (LLM_URL)");
  const sistemas = [], resto = [];
  for (const m of Array.isArray(messages) ? messages : []) (m?.role === "system" ? sistemas : resto).push(m);
  const juntos = sistemas.map((m) => String(m.content ?? "").trim()).filter(Boolean).join("\n\n");
  const corpo = {
    model: modeloJuiz(),
    messages: juntos ? [{ role: "system", content: juntos }, ...resto] : resto,
    stream: false, max_tokens: TOKENS_JUIZ, temperature: 0,
    response_format: { type: "json_object" },
    chat_template_kwargs: { enable_thinking: false },
  };
  const opcoes = { fetcher, timeoutMs: numero("LLM_TIMEOUT_MS", 300_000, { min: 1000, max: 3_600_000, inteiro: true }) };
  const url = `${llmUrl()}/v1/chat/completions`;
  await vaga();
  try {
    const t0 = Date.now();
    let d = await pedir(url, corpo, opcoes);
    let escolha = d?.choices?.[0] ?? {};
    let texto = limparRaciocinio(escolha.message?.content);
    if (!texto && escolha.finish_reason === "length") {
      console.warn(`[MODELO] ${etiqueta}: o raciocínio comeu ${TOKENS_JUIZ} tokens sem resposta — refazendo com o dobro`);
      d = await pedir(url, { ...corpo, max_tokens: TOKENS_JUIZ * 2 }, opcoes);
      escolha = d?.choices?.[0] ?? {};
      texto = limparRaciocinio(escolha.message?.content);
    }
    console.log(`[MODELO] ${etiqueta} | modelo=${corpo.model || "?"} fim=${escolha.finish_reason ?? "?"} ${Date.now() - t0}ms`);
    return texto;
  } finally { soltar(); }
}

// ── O ia-servico (a visão e o hash das imagens) ─────────────────────────────
async function noServico(rota, corpo, { timeoutMs, fetcher = fetch }) {
  const r = await fetcher(`${servicoUrl()}${rota}`, { method: "POST", headers: cabecalhos(), body: JSON.stringify(corpo), signal: AbortSignal.timeout(timeoutMs) });
  return r.json().catch(() => ({}));
}
// → { descricao, riscoModelo, recusou } | { erro }
export const descreverImagem = (url, { timeoutMs = 120_000, fetcher } = {}) => noServico("/moderar-imagem", { url }, { timeoutMs, fetcher });
// → { dhash } | { erro } — sem modelo (o dHash 8×8 da imagem do CDN)
export const hashImagem = (url, { timeoutMs = 30_000, fetcher } = {}) => noServico("/hash-imagem", { url }, { timeoutMs, fetcher });

// O &debug: o serviço responde? o servidor de modelos está de pé? → { alcancavel, modelos } (lança se o serviço não responde)
export async function saude({ timeoutMs = 6000, fetcher = fetch } = {}) {
  const r = await fetcher(`${servicoUrl()}/saude`, { signal: AbortSignal.timeout(timeoutMs), headers: chaveServicoIA() ? { "x-chave": chaveServicoIA() } : {} });
  const s = await r.json();
  return { ok: r.ok, alcancavel: !!s?.llm?.alcancavel, modelos: Array.isArray(s?.llm?.modelos) ? s.llm.modelos : [] };
}
