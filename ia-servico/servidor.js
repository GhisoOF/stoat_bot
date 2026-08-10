// ══════════════════════════════════════════════════════════
//  servidor.js — Serviço de IA da Judy (container separado)
//
//  O bot (stoat.js) continua igual: ele só passa a mandar as
//  mensagens para cá em vez de falar direto com o Ollama.
//  Aqui é onde vivem as FERRAMENTAS e o laço de tool-calling.
//
//  Rotas:
//    GET  /saude        → diagnóstico (Ollama alcançável? ferramentas ativas?)
//    GET  /ferramentas  → lista das ferramentas disponíveis
//    POST /chat         → { messages, modelo?, ferramentas? } → { resposta, usos }
//
//  Formato do Ollama verificado na documentação oficial:
//   pedido : tools:[{type:"function",function:{name,description,parameters}}]
//   volta  : message.tool_calls:[{function:{name,arguments}}]
//   retorno: {role:"tool", tool_name:"...", content:"..."}
// ══════════════════════════════════════════════════════════

import { createServer } from "node:http";
import * as ferramentas from "./ferramentas/index.js";

const PORTA        = Number(process.env.PORTA || 8090);
const OLLAMA_URL   = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const MODELO_PADRAO= process.env.OLLAMA_MODEL || "qwen3.5:9b";
const NUM_CTX      = Number(process.env.NUM_CTX || 16384);
const MAX_TOKENS   = Number(process.env.MAX_TOKENS || 4096);
const MAX_VOLTAS   = Number(process.env.MAX_VOLTAS_FERRAMENTA || 5);
const TIMEOUT_MS   = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);
const CHAVE        = process.env.IA_CHAVE || "";   // opcional: exige header x-chave

const log = (...a) => console.log("[IA]", ...a);

// ── Chamada ao Ollama ──────────────────────────────────────
async function ollama(messages, { modelo, comFerramentas = true } = {}) {
  const corpo = {
    model: modelo || MODELO_PADRAO,
    messages,
    stream: false,
    keep_alive: "5m",
    options: { num_ctx: NUM_CTX, num_predict: MAX_TOKENS, temperature: 0.6 },
  };
  if (comFerramentas) corpo.tools = ferramentas.definicoes();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ── Laço de ferramentas ────────────────────────────────────
// Enquanto o modelo pedir ferramentas, executamos e devolvemos
// o resultado, até ele responder em texto (ou bater o limite).
async function conversarComFerramentas(messages, { modelo, usarFerramentas = true } = {}) {
  const hist = [...messages];
  const usos = [];

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const data = await ollama(hist, { modelo, comFerramentas: usarFerramentas });
    const msg = data?.message ?? {};
    const chamadas = msg.tool_calls || [];

    if (!chamadas.length) {
      return { resposta: (msg.content || "").trim(), usos };
    }

    hist.push(msg);   // registra o pedido de ferramenta do modelo

    for (const c of chamadas) {
      const nome = c?.function?.name;
      let args = c?.function?.arguments ?? {};
      if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }

      log(`ferramenta: ${nome}`, JSON.stringify(args).slice(0, 200));
      const inicio = Date.now();
      const resultado = await ferramentas.executar(nome, args);
      usos.push({ ferramenta: nome, ms: Date.now() - inicio, erro: !!resultado?.erro });

      hist.push({
        role: "tool",
        tool_name: nome,
        content: JSON.stringify(resultado).slice(0, 20000),
      });
    }
  }

  // Estourou o limite de voltas: pede uma resposta final sem ferramentas.
  const final = await ollama(
    [...hist, { role: "user", content: "Responda agora com o que já tem, sem usar mais ferramentas." }],
    { modelo, comFerramentas: false },
  );
  return { resposta: (final?.message?.content || "").trim(), usos, limite: true };
}

// ── HTTP ───────────────────────────────────────────────────
const json = (res, code, obj) => {
  const corpo = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(corpo) });
  res.end(corpo);
};

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = "";
    req.on("data", (c) => {
      dados += c;
      if (dados.length > 2_000_000) { reject(new Error("corpo grande demais")); req.destroy(); }
    });
    req.on("end", () => { try { resolve(dados ? JSON.parse(dados) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

const servidor = createServer(async (req, res) => {
  // Chave opcional — protege o serviço se a porta ficar exposta.
  if (CHAVE && req.headers["x-chave"] !== CHAVE) return json(res, 401, { erro: "não autorizado" });

  try {
    if (req.method === "GET" && req.url === "/saude") {
      let ollamaOk = false, modelos = [];
      try {
        const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) { ollamaOk = true; modelos = (await r.json()).models?.map((m) => m.model) ?? []; }
      } catch {}
      return json(res, 200, {
        ok: true, ollama: { url: OLLAMA_URL, alcancavel: ollamaOk, modelos },
        modelo_padrao: MODELO_PADRAO, ferramentas: ferramentas.nomes(),
      });
    }

    if (req.method === "GET" && req.url === "/ferramentas") {
      return json(res, 200, { ferramentas: ferramentas.definicoes() });
    }

    if (req.method === "POST" && req.url === "/chat") {
      const corpo = await lerCorpo(req);
      const messages = corpo.messages;
      if (!Array.isArray(messages) || !messages.length) {
        return json(res, 400, { erro: "envie 'messages' (array no formato do Ollama)" });
      }
      const t0 = Date.now();
      const r = await conversarComFerramentas(messages, {
        modelo: corpo.modelo,
        usarFerramentas: corpo.ferramentas !== false,
      });
      log(`chat ok em ${Date.now() - t0}ms | ferramentas: ${r.usos.map((u) => u.ferramenta).join(",") || "nenhuma"}`);
      return json(res, 200, r);
    }

    json(res, 404, { erro: "rota desconhecida" });
  } catch (e) {
    log("erro:", e?.message ?? e);
    json(res, 500, { erro: (e?.message ?? String(e)).slice(0, 400) });
  }
});

servidor.listen(PORTA, () => {
  log(`serviço de IA na porta ${PORTA}`);
  log(`Ollama: ${OLLAMA_URL} | modelo padrão: ${MODELO_PADRAO}`);
  log(`ferramentas: ${ferramentas.nomes().join(", ") || "(nenhuma)"}`);
});
