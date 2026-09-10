
import { createServer } from "node:http";
import { garantirDNS, estaInstalado, servidoresUsados } from "./dns-fallback.js";
import * as ferramentas from "./ferramentas/index.js";

const PORTA        = Number(process.env.PORTA || 8090);
const LLM_URL      = (process.env.LLM_URL || "").replace(/\/$/, "");
const TOKEN_LLM = process.env.TOKEN_IA || process.env.LLM_TOKEN || "";
const cabecalhosLLM = () => TOKEN_LLM
  ? { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN_LLM}` }
  : { "Content-Type": "application/json" };
const MODELO_PADRAO= process.env.LLM_MODEL || "";
const NUM_CTX      = Number(process.env.NUM_CTX || 16384);
const MAX_TOKENS   = Number(process.env.MAX_TOKENS || 4096);
const MAX_VOLTAS   = Number(process.env.MAX_VOLTAS_FERRAMENTA || 6);
const TIMEOUT_MS   = Number(process.env.LLM_TIMEOUT_MS || 300000);
const CONTINUAR_MAX= Number(process.env.CONTINUAR_MAX || 2);   // emendas automáticas em resposta cortada
const CHAVE        = process.env.IA_CHAVE || "";   // opcional: exige header x-chave

const log = (...a) => console.log("[IA]", ...a);

function limparRaciocinio(texto) {
  return String(texto ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();
}

function umSystemNaFrente(messages) {
  const lista = Array.isArray(messages) ? messages : [];
  const sistemas = [], resto = [];
  for (const m of lista) {
    if (m?.role === "system") sistemas.push(String(m.content ?? "").trim());
    else resto.push(m);
  }
  const juntos = sistemas.filter(Boolean).join("\n\n");
  return juntos ? [{ role: "system", content: juntos }, ...resto] : resto;
}

async function llm(messages, { modelo, comFerramentas = true, maxTokens = MAX_TOKENS } = {}) {
  const corpo = {
    model: modelo || MODELO_PADRAO,
    messages: umSystemNaFrente(messages),
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
      headers: cabecalhosLLM(),
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const escolha = j?.choices?.[0] ?? {};
    const msg = { ...(escolha.message ?? {}) };
    if (msg.reasoning_content) log(`raciocínio (${msg.reasoning_content.length} chars, descartado): ${msg.reasoning_content.slice(0, 200)}`);
    if (typeof msg.content === "string") msg.content = limparRaciocinio(msg.content);
    // Mesmo formato interno de antes, para o resto do arquivo não mudar.
    return { message: msg, done_reason: escolha.finish_reason ?? "?" };
  } finally { clearTimeout(t); }
}
const ollama = llm;   // nome antigo, mesmos chamadores

function lembreteDeIdioma(idioma) {
  return idioma === "en"
    ? "Answer in English, regardless of the language of the tool results."
    : "Responda em português do Brasil, independentemente do idioma dos resultados das ferramentas.";
}

function chamadasEmTexto(texto) {
  const t = String(texto ?? "").trim();
  if (!t.includes("\"name\"") && !t.includes("\"function\"")) return [];
  const achadas = [];
  const nomesValidos = new Set(ferramentas.nomes());

  // Candidatos: blocos ```json, e objetos de primeiro nível no texto.
  const candidatos = [];
  for (const m of t.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) candidatos.push(m[1].trim());
  // Varredura por chaves balanceadas — regex não fecha objeto aninhado.
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "{") continue;
    let nivel = 0, dentroTexto = false, escapa = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (escapa) { escapa = false; continue; }
      if (ch === "\\") { escapa = true; continue; }
      if (ch === "\"") { dentroTexto = !dentroTexto; continue; }
      if (dentroTexto) continue;
      if (ch === "{") nivel++;
      else if (ch === "}") {
        nivel--;
        if (nivel === 0) { candidatos.push(t.slice(i, j + 1)); i = j; break; }
      }
    }
  }

  for (const bruto of candidatos) {
    let o;
    try { o = JSON.parse(bruto); } catch { continue; }
    // Dois formatos vistos: {name, arguments} e {function:{name, arguments}}
    const nome = o?.name ?? o?.function?.name;
    let args = o?.arguments ?? o?.parameters ?? o?.function?.arguments ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
    if (!nome || !nomesValidos.has(nome)) continue;
    if (achadas.some((c) => c.function.name === nome && JSON.stringify(c.function.arguments) === JSON.stringify(args))) continue;
    achadas.push({ id: undefined, function: { name: nome, arguments: args } });
  }
  return achadas;
}

async function conversarComFerramentas(messages, { modelo, usarFerramentas = true, idioma = "pt" } = {}) {
  const hist = [...messages];
  const usos = [];
  const anexos = [];
  const evidencias = [];
  const EVID_ITEM_MAX = 4000, EVID_TOTAL_MAX = 12000;
  let usouFerramenta = false;
  let usouLeitura = false;   // leu código? então a resposta é explicação, não cópia
  let usouEstrutura = false; // pediu o MAPA? então não sabe o interior das funções
  let usouBusca = false;     // chamou 'buscar'…
  let leuConteudo = false;   // …e chegou a abrir algum arquivo depois?
  let cobrouLeitura = false; // já cobramos uma vez; não insistimos para sempre
  let buscaTrouxeMapa = false; // a busca já veio com o mapa do melhor candidato?

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const data = await ollama(hist, { modelo, comFerramentas: usarFerramentas });
    const msg = data?.message ?? {};
    let chamadas = msg.tool_calls || [];

    if (!chamadas.length && usarFerramentas) {
      const noTexto = chamadasEmTexto(msg.content);
      if (noTexto.length) {
        log(`chamada de ferramenta veio como TEXTO (template do modelo) — executando: ${noTexto.map((c) => c.function.name).join(", ")}`);
        chamadas = noTexto;
        // O texto não vai para o histórico: era a chamada, não uma resposta.
        msg.content = "";
      }
    }

    if (!chamadas.length) {
      if (usouBusca && !leuConteudo && !buscaTrouxeMapa && !cobrouLeitura && volta < MAX_VOLTAS - 1) {
        cobrouLeitura = true;
        log("buscou mas não leu — exigindo estrutura/ler antes da resposta");
        hist.push({ role: "system", content: idioma === "en"
          ? "STOP. You called ler_codigo 'buscar', which returns only a LIST OF FILE PATHS — you have NOT read any code yet. Everything you are about to say about how it works would be a guess. Call ler_codigo again NOW: acao='estrutura' with the path you picked (for how the file works as a whole), or acao='ler' (for a specific part). Only then answer."
          : "PARE. Você chamou ler_codigo 'buscar', que devolve apenas uma LISTA DE CAMINHOS — você ainda NÃO leu código nenhum. Tudo que você fosse dizer agora sobre o funcionamento seria chute. Chame ler_codigo de novo AGORA: acao='estrutura' com o caminho que você escolheu (para o funcionamento do arquivo como um todo), ou acao='ler' (para um ponto específico). Só depois responda." });
        continue;
      }

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
      return { resposta: texto.trim(), usos, anexos, evidencia: evidencias.join("\n").slice(0, EVID_TOTAL_MAX) };
    }

    hist.push(msg);   // registra o pedido de ferramenta do modelo
    usouFerramenta = true;

    for (const c of chamadas) {
      const nome = c?.function?.name;
      if (nome === "ler_codigo") {
        usouLeitura = true;
        const acao = (typeof c?.function?.arguments === "string"
          ? (() => { try { return JSON.parse(c.function.arguments); } catch { return {}; } })()
          : c?.function?.arguments ?? {})?.acao;
        usouEstrutura = acao === "estrutura";
        if (acao === "buscar") usouBusca = true;
        if (acao === "ler" || acao === "estrutura") leuConteudo = true;
      }
      let args = c?.function?.arguments ?? {};
      if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }

      log(`ferramenta: ${nome}`, JSON.stringify(args).slice(0, 200));
      const inicio = Date.now();
      const resultado = await ferramentas.executar(nome, args);
      usos.push({ ferramenta: nome, ms: Date.now() - inicio, erro: !!resultado?.erro });

      if (nome === "ler_codigo" && resultado?.estrutura_do_melhor) { buscaTrouxeMapa = true; usouEstrutura = true; }

      if (resultado?.anexo_base64) {
        anexos.push({ base64: resultado.anexo_base64, mime: resultado.anexo_mime || "image/jpeg", nome: resultado.anexo_nome || "imagem.jpg" });
        delete resultado.anexo_base64;
        resultado.anexo = "gerado e pronto para envio junto da resposta";
      }
      try {
        const txt = typeof resultado === "string" ? resultado : JSON.stringify(resultado);
        evidencias.push(`[${nome}]\n${txt.slice(0, EVID_ITEM_MAX)}`);
      } catch { /* evidência é melhor-esforço; nunca derruba o laço */ }
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

    if (usouLeitura) {
      const regras = idioma === "en"
        ? [
          "You now have real material from the repository. Answer the question with it, in your own words — explain, don't paste the file (quote 3-5 short lines only when a specific line IS the point), and name the path you read.",
          usouEstrutura
            ? "What you received is a MAP: either of one file (sections, functions and exports with line numbers) or of the repository (folders, files and what each one exposes). It covers the whole scope asked for, so describe the architecture confidently — do not say information is missing or that you need to read more. For what happens INSIDE a function, then call ler_codigo acao='ler' at the line the map shows."
            : "If you got part of a file, that part is real code — describe it freely. Just don't present what you haven't seen as if you had: for the whole file use acao='estrutura', for another part use linha_inicial.",
          "One boundary: a function or file that never appeared in what you read does not exist — don't name it. And if what you read is about the wrong subject, say so and search again instead of guessing.",
        ]
        : [
          "Você agora tem material real do repositório. Responda a pergunta com ele, com as SUAS palavras — explique, não cole o arquivo (cite 3-5 linhas curtas só quando uma linha específica FOR o ponto) e diga o caminho que leu.",
          usouEstrutura
            ? "O que você recebeu é um MAPA: de um arquivo (seções, funções e exports com a linha de cada um) ou do repositório (pastas, arquivos e o que cada um expõe). Ele cobre TODO o escopo pedido, então descreva a arquitetura com segurança — não diga que falta informação nem que precisa ler mais para responder. Para o que acontece DENTRO de uma função, aí sim chame ler_codigo acao='ler' com a linha que o mapa indica."
            : "Se você recebeu parte de um arquivo, essa parte é código real — descreva à vontade. Só não apresente como visto o que você não viu: para o arquivo inteiro use acao='estrutura', para outro trecho use linha_inicial.",
          "Um limite só: função ou arquivo que não apareceu no que você leu não existe — não cite. E se o que você leu é sobre outro assunto, diga isso e busque de novo em vez de chutar.",
        ];
      hist.push({ role: "system", content: regras.join(" ") });
    }
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
  return { resposta: (final?.message?.content || "").trim(), usos, anexos, limite: true, evidencia: evidencias.join("\n").slice(0, EVID_TOTAL_MAX) };
}

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
        const r = await fetch(`${LLM_URL}/v1/models`, { headers: cabecalhosLLM(), signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          ollamaOk = true;
          modelos = (d.data ?? d.models ?? []).map((m) => m.id || m.model || m.name).filter(Boolean);
        }
      } catch {}
      return json(res, 200, {
        ok: true, llm: { url: LLM_URL, alcancavel: ollamaOk, modelos }, ollama: { url: LLM_URL, alcancavel: ollamaOk, modelos },
        modelo_padrao: MODELO_PADRAO, ferramentas: ferramentas.nomes(),
      });
    }

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

async function diagnosticoDeBoot() {
  const problemas = [];

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
    const r = await fetch(`${LLM_URL}/v1/models`, { headers: cabecalhosLLM(), signal: AbortSignal.timeout(5000) });
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
  log(`LLM: ${LLM_URL || "⚠️ NENHUM (IA_MODO/LLM_URL)"} | modelo: ${MODELO_PADRAO || "(o carregado no servidor)"}`);
  log(`ferramentas: ${ferramentas.nomes().join(", ") || "(nenhuma)"}`);
  // roda depois de subir: um problema de rede não deve impedir o serviço
  diagnosticoDeBoot().catch((e) => console.error("[IA] diagnóstico falhou:", e?.message));
});
