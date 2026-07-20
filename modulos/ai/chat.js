// ══════════════════════════════════════════════════════════
//  chat.js — conversa com LLM local (Ollama) + busca local (SearXNG)
//
//  &chat <mensagem>     → conversa; se precisar, busca na internet
//  @menção do bot       → mesmo comportamento (tratado no main.js)
//
//  100% local: fala com o Ollama e o SearXNG na própria rede Docker.
//  Nenhuma chave/API externa.
//
//  Fluxo (padrão agente para modelos pequenos):
//   1) pergunta ao modelo, em JSON, se precisa buscar e qual a query
//   2) se sim, consulta o SearXNG e pega os primeiros resultados
//   3) devolve os resultados ao modelo para a resposta final
//
//  Config por variáveis de ambiente (com padrões sensatos):
//   OLLAMA_URL     (padrão http://localhost:11434)
//   OLLAMA_MODEL   (padrão gemma4:12b)
//   SEARXNG_URL    (padrão http://localhost:8080)
//   CHAT_NUM_CTX   (padrão 16384)  — contexto amplo (GPU com boa VRAM)
//   CHAT_MAX_TOKENS(padrão 4096)   — teto de resposta (código longo cabe)
//   CHAT_TIMEOUT   (padrão 300000) — ms; geração de código demora
// ══════════════════════════════════════════════════════════

const OLLAMA_URL   = (process.env.OLLAMA_URL   || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL_PADRAO = process.env.OLLAMA_MODEL || "gemma4:12b";
const SEARXNG_URL  = (process.env.SEARXNG_URL  || "http://localhost:8080").replace(/\/$/, "");

// Modelo ativo — pode ser trocado em tempo de execução por &chat modelo <nome>.
// Inicia pelo env; se houver um salvo na config global, o main aplica no boot.
let modeloAtivo = OLLAMA_MODEL_PADRAO;
export function getModelo() { return modeloAtivo; }
export function setModelo(nome) { modeloAtivo = String(nome).trim(); return modeloAtivo; }

// Lista os modelos baixados no Ollama (via /api/tags).
export async function listarModelos() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}`, modelos: [] };
    const data = await r.json().catch(() => ({}));
    // o campo varia entre versões do Ollama: name ou model
    const modelos = (data.models ?? [])
      .map((m) => m.name || m.model)
      .filter(Boolean)
      .sort();
    return { ok: true, modelos };
  } catch {
    return { ok: false, motivo: "offline", modelos: [] };
  } finally {
    clearTimeout(t);
  }
}
const NUM_CTX      = Number(process.env.CHAT_NUM_CTX  || 16384);
const MAX_TOKENS   = Number(process.env.CHAT_MAX_TOKENS || 4096);
const TIMEOUT      = Number(process.env.CHAT_TIMEOUT  || 300000);

// Servidor(es) onde o &chat pode funcionar. Por padrão, só o servidor abaixo.
// Pode ser sobrescrito por env (CHAT_SERVIDORES = ids separados por vírgula),
// ou "*" para liberar em todos.
const SERVIDORES_PERMITIDOS = (process.env.CHAT_SERVIDORES || "01KH9SJYWVD7XAHJ28TP0YP4Q0")
  .split(",").map((s) => s.trim()).filter(Boolean);

export function servidorPermitido(serverId) {
  if (SERVIDORES_PERMITIDOS.includes("*")) return true;
  return !!serverId && SERVIDORES_PERMITIDOS.includes(serverId);
}

// Fila simples: 1 conversa por vez. Não é sobre hardware fraco — a GPU
// processa uma inferência por vez, e servir duas ao mesmo tempo brigaria
// pela VRAM. Mantém as respostas rápidas e previsíveis.
let ocupado = false;

// ── HTTP helper com timeout ────────────────────────────────
async function pedir(url, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      // O Ollama costuma explicar o erro no corpo (ex.: modelo não encontrado)
      const corpo = await r.text().catch(() => "");
      const detalhe = corpo.replace(/\s+/g, " ").slice(0, 200);
      throw new Error(`HTTP ${r.status}${detalhe ? ` — ${detalhe}` : ""}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// Verifica rapidamente se o Ollama está no ar (a máquina pode estar desligada).
// Timeout curto: não faz sentido esperar 2 min se o host nem responde.
// NÃO valida o modelo aqui — o campo do /api/tags varia entre versões do Ollama
// (name vs model) e causava falso negativo. Se o modelo não existir, o próprio
// /api/chat devolve erro, que tratamos ao conversar.
async function ollamaDisponivel() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    if (!r.ok) return { ok: false, motivo: `respondeu HTTP ${r.status}` };
    return { ok: true };
  } catch {
    return { ok: false, motivo: "offline" };   // host desligado / inalcançável
  } finally {
    clearTimeout(t);
  }
}

// ── Chamada ao Ollama (/api/chat, stream desligado) ────────
export async function ollamaChat(messages, { json = false, maxTokens = MAX_TOKENS, etiqueta = "resposta" } = {}) {
  const options = {
    num_ctx: NUM_CTX,
    temperature: 0.6,
    num_predict: maxTokens,
  };
  // Por padrão o Ollama usa a GPU e todos os recursos disponíveis.
  // OLLAMA_NUM_THREAD só é passado se você quiser limitar manualmente.
  if (process.env.OLLAMA_NUM_THREAD) options.num_thread = Number(process.env.OLLAMA_NUM_THREAD);

  const body = { model: modeloAtivo, messages, stream: false, keep_alive: "5m", options };
  if (json) body.format = "json";     // structured output nativo do Ollama

  const entradaChars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  console.log(`[CHAT][ollama] → ${etiqueta} | modelo=${modeloAtivo} num_ctx=${NUM_CTX} num_predict=${maxTokens} entrada≈${entradaChars} chars${json ? " (json)" : ""}`);

  const t0 = Date.now();
  const data = await pedir(`${OLLAMA_URL}/api/chat`, body);
  const dur = ((Date.now() - t0) / 1000).toFixed(1);

  const conteudo = data?.message?.content ?? "";
  const doneReason = data?.done_reason ?? "?";
  ollamaChat._cortou = doneReason === "length";

  // Métricas que o Ollama devolve (contagem de tokens e tempos internos)
  const pt = data?.prompt_eval_count ?? "?";       // tokens do prompt
  const gt = data?.eval_count ?? "?";              // tokens gerados
  const tps = (data?.eval_count && data?.eval_duration)
    ? (data.eval_count / (data.eval_duration / 1e9)).toFixed(1) : "?";
  console.log(`[CHAT][ollama] ← ${etiqueta} | done=${doneReason} tokens_prompt=${pt} tokens_gerados=${gt} veloc=${tps} tok/s saída=${conteudo.length} chars tempo=${dur}s`);
  if (doneReason === "length")
    console.warn(`[CHAT][ollama] ⚠️ CORTADO por limite de tokens (num_predict=${maxTokens}). Aumente CHAT_MAX_TOKENS para respostas mais longas.`);

  return conteudo;
}

// ── Busca no SearXNG (JSON) ────────────────────────────────
async function buscar(query, n = 4) {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&language=pt-BR`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`SearXNG HTTP ${r.status}`);
    const data = await r.json();
    return (data.results ?? []).slice(0, n).map((x) => ({
      titulo: x.title, url: x.url, trecho: (x.content || "").slice(0, 300),
    }));
  } finally {
    clearTimeout(t);
  }
}

// ── Etapa 1: o modelo decide se precisa buscar ─────────────
async function decidirBusca(pergunta) {
  const sys = [
    `Hoje é ${hojeExtenso()}.`,
    "Você decide se uma pergunta precisa de busca na internet para ser respondida com precisão.",
    "Precisa buscar se envolve fatos atuais, notícias, preços, datas recentes, ou algo que muda com o tempo.",
    "NÃO precisa buscar se é conversa, opinião, criatividade ou conhecimento geral estável.",
    'Responda APENAS um JSON: {"buscar": true|false, "query": "termos de busca"}.',
  ].join(" ");
  try {
    const raw = await ollamaChat(
      [{ role: "system", content: sys }, { role: "user", content: pergunta }],
      { json: true },
    );
    const obj = JSON.parse(raw);
    return { buscar: !!obj.buscar, query: String(obj.query || pergunta).slice(0, 200) };
  } catch {
    return { buscar: false, query: pergunta };   // na dúvida, não busca
  }
}

// Data de hoje por extenso, no fuso configurado (para o modelo não "chutar").
function hojeExtenso() {
  const tz = process.env.TZ || "UTC";
  try {
    return new Date().toLocaleDateString("pt-BR", {
      timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ── Resposta final ─────────────────────────────────────────
async function responder(pergunta, resultados, autor) {
  const hoje = hojeExtenso();
  const sys = [
    "Você é um assistente prestativo e conciso. Responda em português do Brasil.",
    `A data de hoje é ${hoje}. Use esta data como referência para qualquer noção de tempo; não invente outra data.`,
    autor ? `Você está conversando com ${autor}. Se fizer sentido, dirija-se a essa pessoa pelo nome.` : "",
  ].filter(Boolean).join(" ");

  const messages = [{ role: "system", content: sys }];
  if (resultados?.length) {
    const contexto = resultados
      .map((r, i) => `[${i + 1}] ${r.titulo}\n${r.trecho}\nFonte: ${r.url}`)
      .join("\n\n");
    messages.push({
      role: "user",
      content: `Com base nestes resultados de busca (obtidos hoje, ${hoje}), responda à pergunta de forma breve e cite as fontes pelo número. Se os resultados trouxerem datas, confie nelas em vez do seu conhecimento prévio.\n\nRESULTADOS:\n${contexto}\n\nPERGUNTA: ${pergunta}`,
    });
  } else {
    messages.push({ role: "user", content: pergunta });
  }
  return (await ollamaChat(messages, { maxTokens: MAX_TOKENS })).trim();
}

// Remove blocos de "pensamento" que alguns modelos (Qwen/Gemma) emitem.
// Trata também o caso do <think> que ficou SEM fechar (resposta cortada dentro
// do raciocínio) — nesse caso, remove do <think> até o fim.
export function limpar(texto) {
  if (!texto) return "";
  let t = texto.replace(/<think>[\s\S]*?<\/think>/gi, "");   // blocos completos
  t = t.replace(/<think>[\s\S]*$/i, "");                     // think sem fechar
  t = t.replace(/^\s*<\/think>/i, "");                       // fechamento órfão
  return t.trim();
}

// ──────────────────────────────────────────────────────────
//  Ponto de entrada — usado pelo &chat e pela menção
// ──────────────────────────────────────────────────────────
// ── Pré-filtro (antes de chamar a IA) ──────────────────────
// Barra mensagens que não valem uma resposta da IA, por regras simples — sem
// gastar a inferência do modelo. Devolve um motivo (string) se deve BARRAR, ou null se ok.
export function preFiltrar(texto) {
  const t = (texto || "").trim();

  // 1) vazio ou curtíssimo
  if (t.length < 2) return "muito curta";

  // 2) sem nenhuma letra (só pontuação/números/emoji/símbolos)
  if (!/\p{L}/u.test(t)) return "sem texto compreensível";

  // 3) uma "palavra" curta e repetitiva (ex.: "a", "aa", "kkk", "hmmm")
  const semEspaco = t.replace(/\s/g, "");
  const letrasUnicas = new Set(semEspaco.toLowerCase().replace(/[^\p{L}]/gu, "")).size;
  if (t.length <= 5 && letrasUnicas <= 1) return "sem conteúdo (caractere repetido)";

  // 4) texto curto com pouquíssima letra (ex.: "??", ".!?", "12")
  const letras = (t.match(/\p{L}/gu) || []).length;
  if (t.length <= 8 && letras / t.length < 0.4) return "pouco conteúdo textual";

  // 5) uma só palavra com <=2 letras sem contexto (ex.: "oi" passa; "aa" não)
  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length === 1 && palavras[0].replace(/[^\p{L}]/gu, "").length <= 1)
    return "palavra única sem contexto";

  return null;   // passou — vale a pena responder
}

// Quebra um texto longo em pedaços de até `max` caracteres, tentando cortar em
// quebras de linha e sem partir blocos de código (```) ao meio.
function fragmentar(texto, max = 1900) {
  if (texto.length <= max) return [texto];

  // Primeiro, garante que nenhuma LINHA sozinha passe de `max`.
  // Linhas gigantes (código minificado, URLs, base64) são quebradas à força.
  const linhasBrutas = texto.split("\n");
  const linhas = [];
  for (const l of linhasBrutas) {
    if (l.length <= max) { linhas.push(l); continue; }
    // quebra a linha longa em pedaços de até `max`
    for (let i = 0; i < l.length; i += max) linhas.push(l.slice(i, i + max));
  }

  const partes = [];
  let atual = "";
  let emCodigo = false;
  let fenceLang = "";
  const empurra = (bloco) => { if (bloco && bloco.length) partes.push(bloco.slice(0, max)); };

  for (const linha of linhas) {
    const abre = linha.trim().startsWith("```");
    if ((atual + "\n" + linha).length > max && atual) {
      let bloco = atual;
      if (emCodigo && (bloco + "\n```").length <= max) bloco += "\n```";  // fecha fence se couber
      empurra(bloco);
      atual = emCodigo ? "```" + fenceLang : "";
    }
    atual = atual ? atual + "\n" + linha : linha;
    // se mesmo assim estourou (linha reabrindo fence, etc.), corta duro
    if (atual.length > max) { empurra(atual.slice(0, max)); atual = atual.slice(max); }
    if (abre) { emCodigo = !emCodigo; fenceLang = emCodigo ? linha.trim().slice(3) : ""; }
  }
  if (atual.trim()) empurra(atual);
  return partes.length ? partes : [texto.slice(0, max)];
}

// ── Debug detalhado (CHAT_DEBUG=1 para ver tudo no log do Portainer) ──
const DEBUG = process.env.CHAT_DEBUG === "1" || process.env.CHAT_DEBUG === "true";
function dlog(...args) { if (DEBUG) console.log("[CHAT][debug]", ...args); }

// ──────────────────────────────────────────────────────────
//  Ponto de entrada — usado pelo &chat e pela menção
// ──────────────────────────────────────────────────────────
export async function conversar(message, pergunta, ctx) {
  const { sendEmbed, COR, serverId } = ctx;

  // Limitação: só funciona no(s) servidor(es) permitido(s)
  if (!servidorPermitido(serverId)) {
    console.log(`[CHAT] bloqueado no servidor ${serverId ?? "?"} (não permitido)`);
    return sendEmbed(message.channel, {
      title: "🚫 Indisponível aqui",
      description: "O chat com IA não está habilitado neste servidor.",
      colour: COR.aviso,
    });
  }

  pergunta = (pergunta || "").trim();
  if (!pergunta) {
    return sendEmbed(message.channel, { title: "💬 Chat",
      description: "Escreva algo depois do comando. Ex.: `&chat me explique o que é RAID`.", colour: COR.info });
  }

  dlog(`══════ nova conversa ══════`);
  dlog(`autor=${message.username || "?"} | pergunta (${pergunta.length} chars): ${JSON.stringify(pergunta.slice(0, 120))}`);
  const tInicio = Date.now();

  // Pré-filtro: barra mensagens sem sentido ANTES de gastar a IA
  const motivo = preFiltrar(pergunta);
  if (motivo) {
    console.log(`[CHAT] pré-filtro barrou (${motivo}): ${JSON.stringify(pergunta).slice(0, 40)}`);
    return sendEmbed(message.channel, { title: "🤔 Não entendi",
      description: "Manda uma pergunta ou mensagem com um pouco mais de conteúdo que eu te respondo.",
      colour: COR.aviso });
  }

  if (ocupado) {
    return sendEmbed(message.channel, { title: "⏳ Um momento",
      description: "Estou processando outra conversa agora. Tente de novo em alguns segundos.", colour: COR.aviso });
  }

  // Servidor de IA sob demanda: se estiver desligado, avisa na hora
  // (em vez de esperar o timeout longo).
  const disp = await ollamaDisponivel();
  if (!disp.ok) {
    const msg = disp.motivo === "offline"
      ? "O servidor de IA está **desligado ou inacessível**. Ligue a máquina que roda o Ollama (e confirme que o Tailscale está ativo nela) e tente de novo."
      : `O servidor de IA respondeu, mas ${disp.motivo}.`;
    return sendEmbed(message.channel, { title: "💤 IA indisponível", description: msg, colour: COR.aviso });
  }

  ocupado = true;

  // Mensagem de status única, que vamos EDITANDO conforme o progresso.
  // Assim o usuário vê o andamento e nunca fica sem retorno.
  let statusMsg = null;
  let statusQuebrado = false;   // se uma edição falhar (ex.: rate limit), paramos de insistir
  const editarStatus = async (texto) => {
    if (statusQuebrado) return;
    try {
      if (statusMsg) await statusMsg.edit({ content: texto, embeds: [] });
      else statusMsg = await message.channel.sendMessage(texto);
    } catch (e) {
      console.error("[CHAT][status]", e.message);
      statusQuebrado = true;   // não tenta mais editar o status (evita spam de erros)
    }
  };
  const mostrarEmbed = async (embed) => {
    // Trunca a descrição ao limite do Stoat (~2000) antes de qualquer envio.
    const seguro = { ...embed };
    if ((seguro.description?.length ?? 0) > 1500) seguro.description = seguro.description.slice(0, 1495) + "…";
    // O resultado final é SEMPRE entregue. Tenta editar a msg de status;
    // se não der (rate limit, msg perdida, tamanho), envia via sendEmbed.
    // NÃO manda content:"" — o Stoat rejeita string vazia. Usa um espaço.
    if (statusMsg && !statusQuebrado) {
      try { await statusMsg.edit({ content: " ", embeds: [seguro] }); return; }
      catch (e) { console.error("[CHAT][edit-final]", e?.message ?? JSON.stringify(e) ?? "erro"); }
    }
    await sendEmbed(message.channel, seguro);
  };

  try {
    await editarStatus("💭 Analisando sua pergunta…");

    const decisao = await decidirBusca(pergunta);
    dlog(`decisão de busca: buscar=${decisao.buscar}${decisao.buscar ? ` query="${decisao.query}"` : ""}`);
    let resultados = null;
    if (decisao.buscar) {
      await editarStatus(`🔎 Buscando: "${decisao.query}"…`);
      try {
        resultados = await buscar(decisao.query);
        dlog(`busca retornou ${resultados?.length ?? 0} resultado(s)`);
      }
      catch (e) { console.error("[CHAT][busca]", e.message); dlog(`busca FALHOU: ${e.message}`); }
    }

    await editarStatus(resultados?.length ? "✍️ Gerando resposta com as fontes…" : "✍️ Gerando resposta…");

    // Indicador "vivo": enquanto o modelo gera, atualiza os pontinhos e mostra
    // há quanto tempo está gerando (assim o usuário sabe que não travou).
    const inicio = Date.now();
    const frames = ["✍️ Gerando resposta", "✍️ Gerando resposta.", "✍️ Gerando resposta..", "✍️ Gerando resposta..."];
    let fi = 0;
    const animacao = setInterval(() => {
      const seg = Math.round((Date.now() - inicio) / 1000);
      dlog(`ainda gerando… ${seg}s decorridos`);
      editarStatus(`${frames[fi++ % frames.length]} _(${seg}s)_`);
    }, 8000);

    const autor = message.username || message.author?.username || null;
    let resposta;
    try {
      resposta = limpar(await responder(pergunta, resultados, autor));
    } finally {
      clearInterval(animacao);   // para a animação aconteça o que acontecer
    }
    dlog(`resposta após limpar: ${resposta.length} chars${ollamaChat._cortou ? " [CORTADA por limite de tokens]" : ""}`);

    // Se a limpeza esvaziou tudo (modelo gastou os tokens no raciocínio),
    // tenta de novo pedindo resposta direta, sem "pensar".
    if (!resposta) {
      console.log("[CHAT] resposta vazia após limpar — tentando resposta direta");
      dlog("resposta vazia → fallback de resposta direta");
      await editarStatus("✍️ Refinando a resposta…");
      const direto = await ollamaChat([
        { role: "system", content: `Hoje é ${hojeExtenso()}. Responda em português do Brasil, de forma direta e objetiva, SEM explicar seu raciocínio.` },
        { role: "user", content: pergunta },
      ], { maxTokens: MAX_TOKENS });
      resposta = limpar(direto);
      dlog(`fallback retornou ${resposta.length} chars`);
    }

    const rodape = resultados?.length
      ? `\n\n_🔎 busquei: "${decisao.query}"_`
      : "";
    const avisoCorte = ollamaChat._cortou
      ? "\n\n_✂️ resposta longa — cortei no limite. Peça 'continue' para o resto._"
      : "";
    const textoFinal = (resposta || "_Não consegui formular uma resposta. Tente reformular a pergunta._") + avisoCorte + rodape;

    // Embeds no Stoat/Revolt têm limite de ~2000 caracteres na descrição.
    // Fragmentamos em pedaços de 1900 (com folga), preservando blocos de código.
    const partes = fragmentar(textoFinal, 1500);
    dlog(`entregando resposta em ${partes.length} parte(s) | total ${textoFinal.length} chars | tempo total ${((Date.now() - tInicio) / 1000).toFixed(1)}s`);
    await mostrarEmbed({
      title: partes.length > 1 ? "💬 Resposta (1/" + partes.length + ")" : "💬 Resposta",
      description: partes[0],
      colour: COR.info,
    });
    for (let i = 1; i < partes.length; i++) {
      try {
        await sendEmbed(message.channel, {
          title: `💬 Resposta (${i + 1}/${partes.length})`,
          description: partes[i], colour: COR.info,
        });
      } catch (e) { console.error("[CHAT][parte]", e.message); }
    }
    dlog(`══════ conversa concluída ══════`);
  } catch (err) {
    console.error("[CHAT]", err.message);
    dlog(`ERRO no fluxo: ${err.stack || err.message}`);
    let dica;
    if (/HTTP 404|not found|no such model|try pulling/i.test(err.message)) {
      dica = `O modelo \`${modeloAtivo}\` não foi encontrado no Ollama. Veja os disponíveis com \`${ctx.PREFIXO}chat modelo\` e escolha um.`;
    } else if (/aborted|The operation was aborted|timeout/i.test(err.message)) {
      dica = "A IA demorou demais e o tempo esgotou. O modelo pode ser grande demais para a máquina, ou a pergunta pediu uma resposta muito longa. Tente algo mais curto, ou um modelo menor.";
    } else if (/fetch failed|ECONNREFUSED|HTTP 5/.test(err.message)) {
      dica = "O serviço de IA (Ollama) não respondeu. A máquina pode estar sobrecarregada ou o serviço caiu no meio da geração.";
    } else {
      dica = `Ocorreu um erro ao gerar a resposta: ${err.message}`;
    }
    // SEMPRE mostra algo — nunca deixa o usuário sem retorno.
    await mostrarEmbed({ title: "❌ Falha no chat", description: dica, colour: COR.erro });
  } finally {
    ocupado = false;
  }
}

// Exportada para o RSS/diagnóstico saberem se a IA está no ar.
export { ollamaDisponivel };

// Comando &chat
export async function cmdChat(message, args, ctx) {
  const { sendEmbed, COR, serverId, PREFIXO } = ctx;

  // &chat status → testa a conexão com o servidor de IA
  if (args[0]?.toLowerCase() === "status") {
    if (!servidorPermitido(serverId))
      return sendEmbed(message.channel, { title: "🚫 Indisponível aqui",
        description: "O chat com IA não está habilitado neste servidor.", colour: COR.aviso });
    const disp = await ollamaDisponivel();
    return sendEmbed(message.channel, {
      title: disp.ok ? "🟢 IA disponível" : "🔴 IA indisponível",
      description: [
        `**Ollama:** ${OLLAMA_URL}`,
        `**Modelo:** ${modeloAtivo}`,
        `**SearXNG:** ${SEARXNG_URL}`,
        "",
        disp.ok ? "Tudo pronto — pode conversar." : `Status: ${disp.motivo === "offline" ? "**offline** (máquina desligada?)" : disp.motivo}`,
      ].join("\n"),
      colour: disp.ok ? COR.sucesso : COR.aviso,
    });
  }

  // &chat modelo [nome|número] → lista os modelos e permite escolher
  if (["modelo", "model", "modelos"].includes(args[0]?.toLowerCase())) {
    if (!servidorPermitido(serverId))
      return sendEmbed(message.channel, { title: "🚫 Indisponível aqui",
        description: "O chat com IA não está habilitado neste servidor.", colour: COR.aviso });

    const membroPode = ctx.membroTemPermissao
      ? ctx.membroTemPermissao(message, await ctx.getServer?.(message), "ManagePermissions")
      : true;

    const { ok, modelos, motivo } = await listarModelos();
    if (!ok)
      return sendEmbed(message.channel, { title: "🔴 IA indisponível",
        description: motivo === "offline"
          ? "O servidor de IA está desligado — não consigo listar os modelos."
          : `Não consegui listar os modelos (${motivo}).`, colour: COR.aviso });
    if (!modelos.length)
      return sendEmbed(message.channel, { title: "📦 Nenhum modelo",
        description: "Nenhum modelo baixado no Ollama. Baixe um com `ollama pull <nome>` na máquina do Ollama.", colour: COR.aviso });

    const escolha = args[1];
    // sem escolha → lista (marca o ativo)
    if (!escolha) {
      const lista = modelos.map((m, i) => `${m === modeloAtivo ? "▶️" : `\`${i + 1}\``} ${m}${m === modeloAtivo ? " *(ativo)*" : ""}`);
      return sendEmbed(message.channel, {
        title: "📦 Modelos disponíveis",
        description: [
          lista.join("\n"),
          "",
          membroPode
            ? `Para trocar: \`${PREFIXO}chat modelo <número|nome>\``
            : "_(só quem tem ManagePermissions pode trocar o modelo)_",
        ].join("\n"),
        colour: COR.mod,
      });
    }

    // trocar exige permissão
    if (!membroPode)
      return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para trocar o modelo.", colour: COR.erro });

    // resolve por número ou nome (exato, prefixo, ou trecho em qualquer posição)
    let alvo = null;
    if (/^\d+$/.test(escolha)) alvo = modelos[Number(escolha) - 1] ?? null;
    else {
      const e = escolha.toLowerCase();
      alvo = modelos.find((m) => m === escolha)
          ?? modelos.find((m) => m.toLowerCase() === e)
          ?? modelos.find((m) => m.toLowerCase().startsWith(e))
          ?? modelos.find((m) => m.toLowerCase().includes(e));
      // se o trecho casar com mais de um, é ambíguo — pede para ser específico
      if (!/^\d+$/.test(escolha)) {
        const casam = modelos.filter((m) => m.toLowerCase().includes(e));
        if (casam.length > 1 && !modelos.some((m) => m.toLowerCase() === e)) {
          return sendEmbed(message.channel, { title: "🤔 Vários modelos casam",
            description: `\`${escolha}\` casa com: ${casam.map((m) => `\`${m}\``).join(", ")}.\nSeja mais específico ou use o número.`,
            colour: COR.aviso });
        }
      }
    }

    if (!alvo)
      return sendEmbed(message.channel, { title: "❌ Modelo não encontrado",
        description: `\`${escolha}\` não está na lista. Use \`${PREFIXO}chat modelo\` para ver os disponíveis.`, colour: COR.erro });

    setModelo(alvo);
    // persiste na config global para sobreviver a restart
    try {
      if (ctx.cfgGlobal && ctx.salvarGlobal) { ctx.cfgGlobal.chatModelo = alvo; ctx.salvarGlobal(); }
    } catch (e) { console.error("[CHAT][modelo] persist:", e.message); }

    console.log(`[CHAT] modelo trocado para ${alvo} por ${message.authorId}`);
    return sendEmbed(message.channel, { title: "✅ Modelo alterado",
      description: `Agora usando **${alvo}**.`, colour: COR.sucesso });
  }

  return conversar(message, args.join(" "), ctx);
}
