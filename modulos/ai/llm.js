// llm.js — o cliente único do servidor de modelos e do ia-servico, no bot (31 out 2026, P2).
//
// Antes, o chat.js (3.488 linhas) tinha o cliente dentro dele, e o relatorio.js
// tinha outro (o próprio fetch, sem fila, sem 429, sem o corte do raciocínio).
// Agora todo pedido ao modelo sai daqui: `llmChat` (com a fila de prioridade, as
// esperas do 429, o reenvio com o contexto cortado e as emendas do texto cortado)
// e `pedirServicoIA` (o ia-servico, com a chave).
//
// Modelos por papel — três (P2): LLM_MODEL (a conversa e tudo o que não é
// moderação nem visão), LLM_MODEL_JUIZ (o juiz da moderação; sem ele, o LLM_MODEL)
// e LLM_MODEL_VISAO (as imagens). Os antigos LLM_MODEL_LEVE/CODIGO/LOGICA/DECISAO
// caíam todos no LLM_MODEL em toda instalação real; o env.js ainda os aceita como
// sinônimo do LLM_MODEL (e o LLM_MODEL_MODERACAO do JUIZ), sem quebrar o boot.
import { chaveServicoIA } from "./servicos.js";

// Lidos na hora (o env.js e o iniciar.js definem os nomes no boot; os testes trocam).
export const modeloConversa = () => process.env.LLM_MODEL || "";
export const modeloJuiz = () => process.env.LLM_MODEL_JUIZ || modeloConversa();
export const modeloVisao = () => process.env.LLM_MODEL_VISAO || "";

// URLs dos serviços de IA (fixas por env).
// (lidas na hora: os testes e o iniciar.js definem depois do import)
export const llmUrl = () => (process.env.LLM_URL || "").replace(/\/$/, "");
export const iaServicoUrl = () => (process.env.IA_SERVICO_URL || "").replace(/\/$/, "");
const CONTINUAR_MAX = Number(process.env.CONTINUAR_MAX || 2);

const DEBUG = process.env.CHAT_DEBUG === "1" || process.env.CHAT_DEBUG === "true";
function dlog(...args) { if (DEBUG) console.log("[CHAT][debug]", ...args); }

// 1500, não 700: com o raciocínio (thinking) ligado, os tokens de pensamento
// saem do MESMO orçamento — com 700, sobravam ~200 para a resposta e ela era
// cortada no meio da palavra (e a emenda automática às vezes continuava do
// assunto errado). Subir o teto resolve na raiz.
export const MAX_TOKENS   = Number(process.env.CHAT_MAX_TOKENS || 1500);
// 600 cortava a extração de memória (fim=length 3× num quarto de hora, 27/09):
// o raciocínio do Gemma come o orçamento antes do JSON.
const DECISAO_TOKENS = Number(process.env.CHAT_DECISAO_TOKENS || 1200);   // piso das decisões json (ver llmChat)
export const TIMEOUT      = Number(process.env.CHAT_TIMEOUT  || 300000);

export async function listarModelos() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`${llmUrl()}/v1/models`, { signal: ctrl.signal });
    if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}`, modelos: [] };
    const data = await r.json().catch(() => ({}));
    const modelos = (data.data ?? data.models ?? [])
      .map((m) => m.id || m.name || m.model)
      .filter(Boolean)
      .sort();
    return { ok: true, modelos };
  } catch {
    return { ok: false, motivo: "offline", modelos: [] };
  } finally {
    clearTimeout(t);
  }
}

// Os modelos que o bot pede (conversa, juiz, visão) e o servidor de modelos não tem
// — para o dono do bot ver no diagnóstico (antes era o painel do `&chat status`).
// [] = tudo certo ou o servidor não respondeu (aí quem avisa é o llmDisponivel).
export async function modelosAusentes({ listar = listarModelos } = {}) {
  const { ok, modelos = [] } = await listar().catch(() => ({ ok: false }));
  if (!ok || !modelos.length) return [];
  return [...new Set([modeloConversa(), modeloJuiz(), modeloVisao()].filter(Boolean))].filter((m) => !modelos.includes(m));
}

export function limparRaciocinio(texto, { aparar = true } = {}) {
  const limpo = String(texto ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")   // bloco completo, com ou sem conteúdo
    .replace(/^[\s\S]*?<\/think>/i, "");         // abertura perdida no começo
  return aparar ? limpo.trim() : limpo;
}

// 429 (llama-swap cheio: "concurrency_limit") é passageiro — espera e repete
// em vez de mostrar o JSON do erro no chat (12 out 2026).
const ESPERAS_429 = () => String(process.env.LLM_ESPERAS_429 ?? "2000,5000,10000").split(",").map(Number).filter((n) => n >= 0);
async function pedir(url, body, fetcher = fetch) {
  const esperas = ESPERAS_429();
  for (let tentativa = 0; ; tentativa++) {
    try { return await pedirUmaVez(url, body, fetcher); }
    catch (e) {
      if (!e?.lotado || tentativa >= esperas.length) throw e;
      console.warn(`[CHAT][llm] servidor de IA lotado (429) — tentando de novo em ${esperas[tentativa] / 1000}s`);
      await new Promise((ok) => setTimeout(ok, esperas[tentativa]));
    }
  }
}
async function pedirUmaVez(url, body, fetcher = fetch) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      // O servidor costuma explicar o erro no corpo (ex.: modelo não encontrado)
      const corpo = await r.text().catch(() => "");
      const detalhe = corpo.replace(/\s+/g, " ").slice(0, 200);
      if (r.status === 400 && /exceed_context_size|exceeds the available context/i.test(corpo)) {
        const e = new Error(`contexto estourado`);
        e.contextoEstourado = true;
        e.nCtx = Number(corpo.match(/"n_ctx"\s*:\s*(\d+)/)?.[1]) || null;
        throw e;
      }
      const e = new Error(`HTTP ${r.status}${detalhe ? ` — ${detalhe}` : ""}`);
      if (r.status === 429) e.lotado = true;
      throw e;
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function llmDisponivel() {
  const ctrl = new AbortController();
  const limite = Number(process.env.LLM_PING_MS || 8000);
  const t = setTimeout(() => ctrl.abort(), limite);
  const t0 = Date.now();
  try {
    const r = await fetch(`${llmUrl()}/v1/models`, { signal: ctrl.signal });
    if (!r.ok) {
      return { ok: false, causa: "http",
        motivo: r.status === 404
          ? `respondeu HTTP 404 — a URL aponta para algo que não serve /v1/models (llama-swap? porta certa?)`
          : `respondeu HTTP ${r.status}` };
    }
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    const codigo = e?.cause?.code ?? e?.code ?? "";
    const abortou = /abort/i.test(e?.name ?? "");
    if (codigo === "ECONNREFUSED") {
      return { ok: false, causa: "recusou", motivo: "conexão recusada", codigo };
    }
    if (codigo === "EHOSTUNREACH" || codigo === "ENETUNREACH") {
      return { ok: false, causa: "sem-rota", motivo: "sem rota até o host", codigo };
    }
    if (abortou || codigo === "ETIMEDOUT" || codigo === "UND_ERR_CONNECT_TIMEOUT") {
      return { ok: false, causa: "lento", motivo: `sem resposta em ${limite}ms`, codigo: codigo || "timeout" };
    }
    return { ok: false, causa: "offline", motivo: codigo || "inalcançável", codigo };
  } finally {
    clearTimeout(t);
  }
}

// (31 out 2026, P1) Um cliente só do ia-servico no bot: POST com a chave (lida num
// lugar só — IA_SERVICO_CHAVE ou IA_CHAVE) e o teto de tempo. Erro HTTP vira exceção.
export async function pedirServicoIA(rota, corpo, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${iaServicoUrl()}${rota}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-chave": chaveServicoIA() },
      body: JSON.stringify(corpo), signal: ctrl.signal,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`serviço IA HTTP ${r.status} — ${txt.slice(0, 200)}`);
    }
    return await r.json();
  } finally { clearTimeout(t); }
}


export async function executarFerramenta(nome, args, { timeoutMs = 20000, contexto = {} } = {}) {
  if (!iaServicoUrl()) return null;
  try {
    const d = await pedirServicoIA("/ferramenta", { nome, args, contexto }, timeoutMs);
    return d?.resultado ?? null;
  } catch (e) {
    dlog(`ferramenta direta falhou: ${e?.message ?? e}`);
    return null;
  }
}


// A "continuação" que na verdade é a resposta de novo, com outras palavras
// (1 out 2026: "A beleza da dualidade reside…" seguido de "O conceito de
// dualidade é fundamentalmente complexo…", dois começos na mesma mensagem).
// Sinal: o texto já tinha terminado uma frase, o pedaço abre outra do zero, e
// o começo dos dois fala das mesmas coisas.
const PALAVRA_VAZIA = new Set("sobre entre pelas pelos porque quando onde como mais menos muito muita ainda apenas sempre nunca também essa esse isso esta este isto aquele aquela outra outro outras outros todos todas cada sendo seria serão estão estava tinha temos podem pode fazer feito their there which about would could should these those".split(" "));
const radicais = (t) => new Set(String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .split(/[^a-z]+/).filter((w) => w.length >= 5 && !PALAVRA_VAZIA.has(w)).map((w) => w.slice(0, 6)));
export function pareceRecomeco(a, b) {
  const A = String(a ?? "").trim(), B = String(b ?? "").trim();
  if (A.length < 120 || B.length < 120) return false;
  if (!/[.!?…]["')\]]?$/.test(A) || !/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(B)) return false;
  const ra = radicais(A.slice(0, 300)), rb = radicais(B.slice(0, 300));
  let comuns = 0;
  for (const w of rb) if (ra.has(w)) comuns++;
  return comuns >= 4 && comuns / Math.min(ra.size, rb.size) >= 0.25;
}

export function costurar(texto, pedaco) {
  const a = String(texto ?? "");
  let b = String(pedaco ?? "");
  if (!b.trim()) return a;
  if (pareceRecomeco(a, b)) return null;   // recomeçou a resposta: fica a primeira

  // 1. Repetição em bloco: o começo do pedaço (80 chars) já aparece no texto?
  const inicio = b.trim().slice(0, 80);
  if (inicio.length >= 40 && a.includes(inicio)) {
    // Descarta tudo até o fim do trecho repetido; o que sobrar é novo.
    const pos = a.indexOf(inicio);
    const jaDito = a.slice(pos);
    const novo = b.trim().startsWith(jaDito.trim().slice(0, Math.min(jaDito.length, b.length)))
      ? b.trim().slice(jaDito.trim().length).trim()
      : "";
    if (!novo) return null;
    b = novo;
  }

  // 2. Sobreposição parcial: o maior sufixo de `a` que é prefixo de `b`.
  const max = Math.min(300, a.length, b.length);
  for (let n = max; n >= 12; n--) {
    if (a.endsWith(b.slice(0, n))) { b = b.slice(n); break; }
  }
  if (!b.trim()) return null;

  let base = a;
  const ultimoPonto = Math.max(a.lastIndexOf(". "), a.lastIndexOf(".\n"), a.lastIndexOf("!"), a.lastIndexOf("?"), a.lastIndexOf(":\n"));
  const pendurado = a.slice(ultimoPonto + 1);
  if (ultimoPonto > 0 && pendurado.trim().length > 0 && pendurado.trim().length < 60
      && !/[.!?:]\s*$/.test(a) && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(b.trim())) {
    base = a.slice(0, ultimoPonto + 1);
    b = b.trim();
  }

  // 4. Separador: letra colada em letra vira "vocêMeu".
  const fimA = base.slice(-1), comecoB = b[0];
  const precisaEspaco = /[\p{L}\p{N},;:]/u.test(fimA) && /[\p{L}\p{N}]/u.test(comecoB);
  const precisaQuebra = /[.!?]/.test(fimA) && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(b) && !base.endsWith("\n");
  return base + (precisaQuebra ? "\n\n" : precisaEspaco ? " " : "") + b;
}

export function normalizarMensagens(messages) {
  const lista = Array.isArray(messages) ? messages : [];
  const sistemas = [], resto = [];
  for (const m of lista) {
    if (m?.role === "system") sistemas.push(String(m.content ?? "").trim());
    else resto.push(m);
  }
  const juntos = sistemas.filter(Boolean).join("\n\n");
  return juntos ? [{ role: "system", content: juntos }, ...resto] : resto;
}

const CONTEXTO_MODELO = Number(process.env.LLM_CTX || 8192);
const CHARS_POR_TOKEN = 3.5;   // português com acentos fica perto disso

export function caberNoContexto(messages, { ctxTokens = CONTEXTO_MODELO, reservarSaida = 0 } = {}) {
  const teto = Math.max(1000, (ctxTokens - reservarSaida - 200)) * CHARS_POR_TOKEN;
  const tamanho = (ms) => ms.reduce((t, m) => t + String(m?.content ?? "").length + 8, 0);
  if (tamanho(messages) <= teto) return messages;

  const sistema = messages.filter((m) => m.role === "system");
  const resto = messages.filter((m) => m.role !== "system");
  const ultima = resto.length ? [resto[resto.length - 1]] : [];
  let meio = resto.slice(0, -1);

  // Descarta o histórico do mais antigo para o mais novo.
  while (meio.length && tamanho([...sistema, ...meio, ...ultima]) > teto) meio.shift();
  let saida = [...sistema, ...meio, ...ultima];

  if (tamanho(saida) > teto && sistema.length) {
    const sobra = teto - tamanho([...meio, ...ultima]);
    const s0 = String(sistema[0].content ?? "");
    if (sobra > 800 && s0.length > sobra) {
      const metade = Math.floor((sobra - 60) / 2);
      saida = [{ role: "system", content: `${s0.slice(0, metade)}\n[…]\n${s0.slice(-metade)}` }, ...meio, ...ultima];
    }
  }
  console.warn(`[CHAT] prompt de ${Math.round(tamanho(messages) / CHARS_POR_TOKEN)} tokens não cabia em ${ctxTokens}; enviando ${Math.round(tamanho(saida) / CHARS_POR_TOKEN)}`);
  return saida;
}

// ─── Ritmo da IA (12 out 2026) ──────────────────────────────────────────────
// "Ela empaca": 40–80 s por resposta e "HTTP 429 concurrency_limit" do
// llama-swap. Com a Judy em muitos servidores, cada pessoa que conversa
// dispara a extração de memória (JSON, até 2400 tokens), a moderação por IA
// avalia mensagens, o comentário espontâneo e o verificador rodam — tudo
// COM raciocínio e tudo ao mesmo tempo. Os pedidos se empilhavam no
// llama-server, a resposta do chat dividia a GPU com eles e, passando de 10
// pedidos simultâneos, o llama-swap recusava com 429.
//
// Agora todo pedido do bot passa por uma fila só:
//   • no máximo LLM_PARALELO (padrão 2) pedidos no llama-server de cada vez;
//   • chat, moderação e RSS furam a fila; memória, comentário espontâneo,
//     verificador e o "vale responder?" são "de fundo" e só rodam com o
//     llama-server VAZIO;
//   • fila de fundo cheia (LLM_FILA_FUNDO, padrão 6) → a tarefa é descartada
//     (perder uma extração de memória é melhor que atrasar todas as respostas);
//   • decisão em JSON e tarefa de fundo vão SEM raciocínio (PENSAR_DECISOES=1
//     devolve); 429 que escapar é repetido com espera, não vira "Falha no chat".
// (RSS fica fora: é pedido por comando ou tem hora marcada, e não pode ser descartado)
const FUNDO = new Set(["memoria", "comentario-espontaneo", "vale-responder"]);   // (P2: o verificador saiu)
const LLM_PARALELO = () => Math.max(1, Number(process.env.LLM_PARALELO || 2));
const LLM_FILA_FUNDO = () => Math.max(0, Number(process.env.LLM_FILA_FUNDO ?? 6));
const fila429 = { emVoo: 0, chat: [], fundo: [], pausaFundo: 0 };
// Enquanto uma imagem é desenhada, o LLM foi descarregado da GPU para dar
// lugar ao sd.cpp: uma tarefa de fundo (memória, comentário) recarregaria o
// modelo no meio do desenho e a memória faltaria de novo. Elas esperam.
export function pausarFundo() { fila429.pausaFundo++; }
export function retomarFundo() { fila429.pausaFundo = Math.max(0, fila429.pausaFundo - 1); proximaVaga(); }
export function estadoFilaLLM() { return { emVoo: fila429.emVoo, chat: fila429.chat.length, fundo: fila429.fundo.length }; }
function proximaVaga() {
  while (fila429.emVoo < LLM_PARALELO() && fila429.chat.length) { fila429.emVoo++; fila429.chat.shift()(); }
  // fundo só com o llama-server vazio: não divide a GPU com uma resposta
  if (fila429.emVoo === 0 && !fila429.pausaFundo && !fila429.chat.length && fila429.fundo.length) { fila429.emVoo++; fila429.fundo.shift()(); }
}
async function pegarVaga(deFundo, etiqueta) {
  if (!deFundo && fila429.emVoo < LLM_PARALELO() && !fila429.chat.length) { fila429.emVoo++; return; }
  if (deFundo && fila429.emVoo === 0 && !fila429.pausaFundo && !fila429.chat.length && !fila429.fundo.length) { fila429.emVoo++; return; }
  if (deFundo && fila429.fundo.length >= LLM_FILA_FUNDO()) {
    const e = new Error(`fila da IA cheia — ${etiqueta} (tarefa de fundo) descartada`);
    e.filaCheia = true;
    throw e;
  }
  await new Promise((ok) => (deFundo ? fila429.fundo : fila429.chat).push(ok));
}
function soltarVaga() { fila429.emVoo = Math.max(0, fila429.emVoo - 1); proximaVaga(); }

// `pensar`: true/false força; null decide — decisão em JSON e tarefa de fundo
// vão sem raciocínio, o resto deixa o servidor decidir (ligado). O servidor é
// sempre o llama.cpp local (aceita `chat_template_kwargs` por pedido).
// `fundo`: força a prioridade (por padrão vem da etiqueta, ver FUNDO).
export async function llmChat(messages, opcoes = {}) {
  const etiqueta = opcoes.etiqueta ?? "resposta";
  const deFundo = opcoes.fundo ?? FUNDO.has(etiqueta);
  await pegarVaga(deFundo, etiqueta);
  try {
    return await llmChatDireto(messages, { ...opcoes, etiqueta, deFundo });
  } finally {
    soltarVaga();
  }
}

async function llmChatDireto(messages, { json = false, maxTokens = MAX_TOKENS, jsonTokens = null, etiqueta = "resposta", modelo = null, ctx = null, manter = null, continuarMax = null, pensar = null, deFundo = false, fetcher = fetch, temperatura = null } = {}) {
  messages = normalizarMensagens(messages);
  if (pensar === null && (json || deFundo) && !/^(1|true|sim|on)$/i.test(process.env.PENSAR_DECISOES ?? "")) pensar = false;
  const modeloUsado = modelo || modeloConversa();
  const limiteTokens = json ? (jsonTokens ?? DECISAO_TOKENS) : maxTokens;

  const body = {
    model: modeloUsado,
    messages,
    stream: false,
    max_tokens: limiteTokens,
    temperature: temperatura ?? (json ? 0 : 0.6),   // decisão determinística; conversa criativa
  };
  if (json) body.response_format = { type: "json_object" };
  if (pensar === false) body.chat_template_kwargs = { enable_thinking: false };

  const entradaChars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  console.log(`[CHAT][llm] → ${etiqueta} | modelo=${modeloUsado} max_tokens=${limiteTokens} entrada≈${entradaChars} chars${json ? " (json)" : ""}${body.chat_template_kwargs ? " (sem raciocínio)" : ""}`);

  const t0 = Date.now();
  let data;
  try {
    data = await pedir(`${llmUrl()}/v1/chat/completions`, body, fetcher);
  } catch (e) {
    if (!e?.contextoEstourado) throw e;
    const teto = e.nCtx || Math.floor(CONTEXTO_MODELO / 2);
    console.warn(`[CHAT] contexto real do modelo é ${teto} tokens — reenviando cortado`);
    body.messages = caberNoContexto(messages, { ctxTokens: teto, reservarSaida: limiteTokens });
    data = await pedir(`${llmUrl()}/v1/chat/completions`, body, fetcher);
  }
  let escolha = data?.choices?.[0] ?? {};
  let conteudo = limparRaciocinio(escolha?.message?.content ?? "", { aparar: false });
  let motivo = escolha?.finish_reason ?? "?";
  if (escolha?.message?.reasoning_content) {
    dlog(`raciocínio (${escolha.message.reasoning_content.length} chars, não vai para o chat): ${escolha.message.reasoning_content.slice(0, 300)}`);
  }

  if (!conteudo.trim() && motivo === "length") {
    console.warn(`[CHAT][llm] ⚠️ ${etiqueta}: o modelo consumiu ${limiteTokens} tokens raciocinando e não respondeu — refazendo com o dobro`);
    data = await pedir(`${llmUrl()}/v1/chat/completions`, { ...body, max_tokens: limiteTokens * 2 }, fetcher);
    escolha = data?.choices?.[0] ?? {};
    conteudo = limparRaciocinio(escolha?.message?.content ?? "", { aparar: false });
    motivo = escolha?.finish_reason ?? "?";
  }

  let emendas = 0;
  const tetoEmendas = continuarMax ?? CONTINUAR_MAX;
  while (!json && motivo === "length" && emendas < tetoEmendas) {
    emendas++;
    console.log(`[CHAT][llm] ✂️ cortada no limite — continuando sozinha (${emendas}/${CONTINUAR_MAX})`);
    data = await pedir(`${llmUrl()}/v1/chat/completions`, {
      ...body,
      messages: [
        ...messages,
        { role: "assistant", content: conteudo },
        { role: "user", content: "Continue EXATAMENTE de onde parou — a partir da última palavra, no mesmo idioma do texto acima. NÃO recomece a resposta, NÃO repita parágrafos já escritos, NÃO resuma, NÃO cumprimente, NÃO mude de idioma. / Continue EXACTLY from the last word, in the same language as the text above. Do NOT restart, repeat, summarise, greet or switch language." },
      ],
    }, fetcher);
    escolha = data?.choices?.[0] ?? {};
    const pedaco = limparRaciocinio(escolha?.message?.content ?? "", { aparar: false });
    motivo = escolha?.finish_reason ?? "?";
    const costurado = costurar(conteudo, pedaco);
    if (costurado === null) {
      console.log(`[CHAT][llm] emenda ${emendas} veio repetida — parando aqui`);
      motivo = "stop";
      break;
    }
    conteudo = costurado;
  }

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  llmChat._cortou = motivo === "length";   // ainda cortada DEPOIS das emendas

  const uso = data?.usage ?? {};
  console.log(`[CHAT][llm] ← ${etiqueta} | fim=${motivo}${emendas ? ` (+${emendas} emenda(s))` : ""} tokens_prompt=${uso.prompt_tokens ?? "?"} tokens_gerados=${uso.completion_tokens ?? "?"} saída=${conteudo.length} chars tempo=${dur}s`);
  if (llmChat._cortou)
    console.warn(`[CHAT][llm] ${etiqueta}: ainda cortada após ${emendas} emenda(s) (max_tokens=${limiteTokens}) — aumente CHAT_MAX_TOKENS ou CONTINUAR_MAX.`);

  return conteudo.trim();
}
