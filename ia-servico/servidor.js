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
import { garantirDNS, estaInstalado, servidoresUsados } from "./dns-fallback.js";
import * as ferramentas from "./ferramentas/index.js";

const PORTA        = Number(process.env.PORTA || 8090);
// ── Backend de LLM ────────────────────────────────────────
//
//  Falamos o formato OpenAI (`/v1/chat/completions`) em vez do formato
//  próprio do Ollama. Motivo: é o formato que o llama.cpp (`llama-server`),
//  o llama-swap E o próprio Ollama servem — então trocar de backend vira
//  trocar uma URL, não reescrever este arquivo. O llama.cpp gasta menos
//  (uma engine, contexto alocado uma vez no boot, GGUF direto do disco), e
//  o llama-swap devolve o "vários modelos por nome" que o Ollama dava:
//  o campo `model` do pedido escolhe qual sobe, com TTL para descarregar.
//
//  O que muda de dialeto:
//    num_predict → max_tokens · format:"json" → response_format
//    done_reason → choices[0].finish_reason · num_ctx/keep_alive → do servidor
const LLM_URL      = (process.env.LLM_URL || process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_URL   = LLM_URL;   // rotas antigas de diagnóstico ainda usam o nome
const MODELO_PADRAO= process.env.LLM_MODEL || process.env.OLLAMA_MODEL || "qwen3.5:9b";
const NUM_CTX      = Number(process.env.NUM_CTX || 16384);
const MAX_TOKENS   = Number(process.env.MAX_TOKENS || 4096);
const MAX_VOLTAS   = Number(process.env.MAX_VOLTAS_FERRAMENTA || 5);
const TIMEOUT_MS   = Number(process.env.LLM_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || 300000);
const CONTINUAR_MAX= Number(process.env.CONTINUAR_MAX || 2);   // emendas automáticas em resposta cortada
const CHAVE        = process.env.IA_CHAVE || "";   // opcional: exige header x-chave

const log = (...a) => console.log("[IA]", ...a);

function limparRaciocinio(texto) {
  return String(texto ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();
}

// ── Chamada ao LLM (formato OpenAI) ────────────────────────
async function llm(messages, { modelo, comFerramentas = true, maxTokens = MAX_TOKENS } = {}) {
  const corpo = {
    model: modelo || MODELO_PADRAO,
    messages,
    stream: false,
    max_tokens: maxTokens,
    temperature: 0.6,
  };
  if (comFerramentas) corpo.tools = ferramentas.definicoes();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const escolha = j?.choices?.[0] ?? {};
    const msg = { ...(escolha.message ?? {}) };
    // O raciocínio nunca vai para o chat: com --reasoning-budget 0 sobra o
    // par vazio "<think></think>" no content, e nos modelos que pensam o
    // bloco às vezes vaza para dentro dele. Some ao registro em debug.
    if (msg.reasoning_content) log(`raciocínio (${msg.reasoning_content.length} chars, descartado): ${msg.reasoning_content.slice(0, 200)}`);
    if (typeof msg.content === "string") msg.content = limparRaciocinio(msg.content);
    // Mesmo formato interno de antes, para o resto do arquivo não mudar.
    return { message: msg, done_reason: escolha.finish_reason ?? "?" };
  } finally { clearTimeout(t); }
}
const ollama = llm;   // nome antigo, mesmos chamadores

// ── Laço de ferramentas ────────────────────────────────────
// Enquanto o modelo pedir ferramentas, executamos e devolvemos
// o resultado, até ele responder em texto (ou bater o limite).
// Lembrete de idioma, reinjetado depois das ferramentas.
//
// O resultado de uma ferramenta é um JSON grande — nomes de arquivo, código,
// chaves em inglês. Isso empurra o modelo para o inglês, e a instrução do
// system fica longe demais no histórico para competir. O sintoma é o usuário
// perguntar em português e receber a resposta inteira em inglês.
//
// Repetir a instrução logo antes da resposta final resolve, e custa uma linha.
function lembreteDeIdioma(idioma) {
  return idioma === "en"
    ? "Answer in English, regardless of the language of the tool results."
    : "Responda em português do Brasil, independentemente do idioma dos resultados das ferramentas.";
}

async function conversarComFerramentas(messages, { modelo, usarFerramentas = true, idioma = "pt" } = {}) {
  const hist = [...messages];
  const usos = [];
  const anexos = [];
  let usouFerramenta = false;

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const data = await ollama(hist, { modelo, comFerramentas: usarFerramentas });
    const msg = data?.message ?? {};
    const chamadas = msg.tool_calls || [];

    if (!chamadas.length) {
      // ── Resposta cortada no limite? Continua sozinha. ──
      // "…e aí, quer que eu continue?" era o modelo batendo em max_tokens.
      // Quem pergunta é porque parou; quem parou não precisa perguntar —
      // pedimos a continuação aqui mesmo, e o usuário recebe o texto inteiro.
      let texto = (msg.content || "").trim();
      let cortes = 0;
      let motivo = data?.done_reason;
      while (motivo === "length" && cortes < CONTINUAR_MAX) {
        cortes++;
        log(`resposta cortada (length) — continuando (${cortes}/${CONTINUAR_MAX})`);
        const mais = await ollama([
          ...hist,
          { role: "assistant", content: texto },
          { role: "user", content: idioma === "en"
              ? "Continue EXACTLY from where you stopped. Do not repeat anything, do not summarise, do not greet."
              : "Continue EXATAMENTE de onde parou. Não repita nada, não resuma, não cumprimente." },
        ], { modelo, comFerramentas: false });
        texto += (mais?.message?.content || "");
        motivo = mais?.done_reason;
      }
      return { resposta: texto.trim(), usos, anexos };
    }

    hist.push(msg);   // registra o pedido de ferramenta do modelo
    usouFerramenta = true;

    for (const c of chamadas) {
      const nome = c?.function?.name;
      let args = c?.function?.arguments ?? {};
      if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }

      log(`ferramenta: ${nome}`, JSON.stringify(args).slice(0, 200));
      const inicio = Date.now();
      const resultado = await ferramentas.executar(nome, args);
      usos.push({ ferramenta: nome, ms: Date.now() - inicio, erro: !!resultado?.erro });

      // Ferramenta que produz IMAGEM: o binário não vai para o modelo (base64
      // no contexto é caro e inútil) — fica de lado e sai na resposta HTTP,
      // para o bot anexar na mensagem. O modelo recebe só a confirmação.
      if (resultado?.anexo_base64) {
        anexos.push({ base64: resultado.anexo_base64, mime: resultado.anexo_mime || "image/jpeg", nome: resultado.anexo_nome || "imagem.jpg" });
        delete resultado.anexo_base64;
        resultado.anexo = "gerado e pronto para envio junto da resposta";
      }
      hist.push({
        role: "tool",
        // OpenAI amarra o resultado à chamada pelo id; Ollama aceita e ignora.
        tool_call_id: c?.id ?? undefined,
        tool_name: nome,
        content: JSON.stringify(resultado).slice(0, 20000),
      });
    }

    // Logo depois do JSON da ferramenta, enquanto ainda é a última coisa lida.
    hist.push({ role: "system", content: lembreteDeIdioma(idioma) });
  }

  // Estourou o limite de voltas: pede uma resposta final sem ferramentas.
  const final = await ollama(
    [...hist, {
      role: "user",
      content: idioma === "en"
        ? "Answer now with what you already have, without using more tools."
        : "Responda agora com o que já tem, sem usar mais ferramentas.",
    }],
    { modelo, comFerramentas: false },
  );
  return { resposta: (final?.message?.content || "").trim(), usos, anexos, limite: true };
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
        // `/v1/models` (padrão OpenAI): llama-swap, llama-server e Ollama
        // respondem. O `/api/tags` de antes era só do Ollama e virava 404.
        const r = await fetch(`${LLM_URL}/v1/models`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          ollamaOk = true;
          modelos = (d.data ?? d.models ?? []).map((m) => m.id || m.model || m.name).filter(Boolean);
        }
      } catch {}
      return json(res, 200, {
        ok: true, ollama: { url: OLLAMA_URL, alcancavel: ollamaOk, modelos },
        modelo_padrao: MODELO_PADRAO, ferramentas: ferramentas.nomes(),
      });
    }

    // Diagnóstico sob demanda — sem precisar reiniciar para ver o estado.
    // `curl localhost:8090/diagnostico` responde o mesmo que o boot.
    if (req.method === "GET" && req.url === "/dns") {
      // Rota curta para conferir só o DNS, sem rodar o diagnóstico inteiro.
      const info = await garantirDNS();
      return json(res, 200, {
        fallbackAtivo: estaInstalado(),
        servidores: servidoresUsados(),
        estado: info.motivo,
      });
    }

    if (req.method === "GET" && req.url === "/diagnostico") {
      const problemas = await diagnosticoDeBoot();
      return json(res, 200, { ok: problemas.length === 0, problemas });
    }

    // Executa uma ferramenta DIRETO, sem passar pelo modelo.
    //
    // Existe porque modelos pequenos às vezes respondem "não consigo ler o
    // arquivo" em vez de chamar a ferramenta — sobretudo quando o pedido vem
    // na forma de pergunta ("consegue ler o X?"). Quando o bot já sabe que o
    // pedido exige a ferramenta, ele chama por aqui e entrega o conteúdo
    // pronto ao modelo. Determinístico, sem depender de o modelo decidir.
    if (req.method === "POST" && req.url === "/ferramenta") {
      const body = await lerCorpo(req);
      const { nome, args } = body ?? {};
      if (!nome) return json(res, 400, { erro: "informe { nome, args }" });
      try {
        const resultado = await ferramentas.executar(nome, args ?? {});
        log(`ferramenta direta: ${nome} ${JSON.stringify(args ?? {}).slice(0, 120)}`);
        return json(res, 200, { ok: !resultado?.erro, resultado });
      } catch (e) {
        return json(res, 200, { ok: false, resultado: { erro: e?.message ?? String(e) } });
      }
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
        // Quem chama diz o idioma; sem isso, assumimos português (o padrão
        // dos servidores onde a Judy roda).
        idioma: corpo.idioma === "en" ? "en" : "pt",
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

// ══════════════════════════════════════════════════════════
//  Autodiagnóstico de boot
//
//  Já perdemos horas caçando "a Judy não lê o repositório" que eram, na
//  verdade, DNS quebrado ou token ausente. Testar isso no boot e gritar no
//  log troca uma investigação inteira por uma linha visível no log do serviço.
//
//  Nada aqui derruba o serviço: são avisos. O bot funciona sem GitHub e sem
//  busca web — só perde essas capacidades.
// ══════════════════════════════════════════════════════════
async function diagnosticoDeBoot() {
  const problemas = [];

  // 1. DNS — a falha mais comum, e a mais confusa quando acontece.
  //
  // Antes de acusar, tentamos consertar: se o resolvedor do sistema não
  // responde (resolv.conf sem `nameserver`, o caso clássico), o serviço passa
  // a resolver por conta própria com servidores públicos. Assim a Judy volta
  // a funcionar imediatamente, e o aviso vira "está funcionando POR CIMA de um
  // problema" em vez de "está tudo parado".
  const dnsInfo = await garantirDNS();
  if (!dnsInfo.trocou) {
    if (dnsInfo.motivo.includes("resolvendo")) {
      log("✓ DNS resolvendo");
    } else {
      problemas.push(
        `DNS NÃO resolve e o fallback está indisponível (${dnsInfo.motivo}).`,
        "   → confira /etc/resolv.conf DENTRO do container:",
        "     cat /etc/resolv.conf",
        "   → precisa ter uma linha 'nameserver'. Se só tiver comentários,",
        "     precisa ter uma linha 'nameserver'; se não tiver, o DNS do sistema está quebrado",
      );
    }
  } else if (dnsInfo.funciona) {
    log(`⚠ DNS do sistema quebrado — usando ${dnsInfo.servidores.join(", ")} por dentro`);
    problemas.push(
      "O /etc/resolv.conf do container não tem 'nameserver' — o DNS do sistema não funciona.",
      `   → contornado: resolvendo por ${dnsInfo.servidores.join(", ")} dentro do processo.`,
      "   → a Judy funciona assim, mas nomes locais/Tailscale não resolvem.",
      "   → conserto de verdade: arrume o /etc/resolv.conf da máquina",
      "     (e confira o /etc/resolv.conf do HOST, que é de onde o container copia)",
    );
  } else {
    problemas.push(
      "DNS NÃO resolve, nem pelo sistema nem pelos servidores de fallback.",
      "   → o container parece estar sem saída para a internet (firewall/rota).",
      "     Teste: curl -s -o /dev/null -w '%{http_code}' https://1.1.1.1",
    );
  }

  // 2. Alcance real à internet (DNS pode resolver e a rota estar bloqueada)
  try {
    const r = await fetch("https://api.github.com", {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "judy-ia" },
    });
    log(`✓ GitHub alcançável (HTTP ${r.status})`);
  } catch (e) {
    const causa = e?.cause?.code ?? e?.message ?? "?";
    if (!problemas.length) {
      problemas.push(
        `Sem acesso à internet (${causa}), mesmo com DNS ok.`,
        "   → firewall ou rota bloqueando saída?",
      );
    }
  }

  // 3. Token do GitHub — sem ele, repositório privado devolve 404
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token) {
    problemas.push(
      "GITHUB_TOKEN ausente — a leitura de código vai falhar com 404 em repo privado.",
      "   → defina no .env do diretório do judy-ia",
    );
  } else if (!problemas.length && repo) {
    // só testa o token se a rede estiver de pé, senão o erro seria enganoso
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "judy-ia" },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) log(`✓ GitHub autenticado (${repo})`);
      else if (r.status === 401) problemas.push(`GITHUB_TOKEN inválido ou expirado (HTTP 401).`);
      else if (r.status === 404) problemas.push(
        `Repositório ${repo} não encontrado (HTTP 404).`,
        "   → o token existe mas não tem acesso a ele, ou expirou.",
      );
      else problemas.push(`GitHub respondeu HTTP ${r.status} para ${repo}.`);
    } catch (e) {
      problemas.push(`Falha ao validar o token: ${e?.message ?? e}`);
    }
  }

  // 4. O servidor de LLM — sem ele o serviço não responde nada
  try {
    const r = await fetch(`${LLM_URL}/v1/models`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 404 ? " (a URL não serve /v1/models — llama-swap na porta certa?)" : ""}`);
    const d = await r.json().catch(() => ({}));
    const nomes = (d.data ?? d.models ?? []).map((m) => m.id || m.model || m.name).filter(Boolean);
    log(`✓ LLM respondendo em ${LLM_URL} (${nomes.length} modelo(s): ${nomes.join(", ") || "—"})`);
    if (nomes.length && !nomes.includes(MODELO_PADRAO)) {
      problemas.push(
        `O modelo padrão "${MODELO_PADRAO}" não está na lista do servidor.`,
        `   → disponíveis: ${nomes.join(", ")}. Confira LLM_MODEL.`,
      );
    }
  } catch (e) {
    problemas.push(
      `Servidor de LLM inacessível em ${LLM_URL} (${e?.cause?.code ?? e?.message}).`,
      "   → o serviço de IA não vai conseguir responder nada.",
    );
  }

  if (problemas.length) {
    console.error("");
    console.error("[IA] ═══════════════════════════════════════════");
    console.error("[IA] ⚠️  PROBLEMAS DETECTADOS NO BOOT");
    for (const p of problemas) console.error(`[IA] ${p}`);
    console.error("[IA] ═══════════════════════════════════════════");
    console.error("");
  } else {
    log("✓ diagnóstico de boot: tudo certo");
  }
  return problemas;
}

servidor.listen(PORTA, () => {
  log(`serviço de IA na porta ${PORTA}`);
  log(`Ollama: ${OLLAMA_URL} | modelo padrão: ${MODELO_PADRAO}`);
  log(`ferramentas: ${ferramentas.nomes().join(", ") || "(nenhuma)"}`);
  // roda depois de subir: um problema de rede não deve impedir o serviço
  diagnosticoDeBoot().catch((e) => console.error("[IA] diagnóstico falhou:", e?.message));
});
