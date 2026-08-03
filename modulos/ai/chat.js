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

import * as db from "../core/db.js";
import { construirDetalhes } from "../moderacao/geral.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Referência dos comandos: a mesma fonte do `&help <comando>`, achatada em
// texto. É isso que permite a Judy assistir na configuração com precisão
// (uso exato, permissão necessária, subcomandos e exemplo) em vez de dar
// respostas vagas baseadas só no README.
let _refCache;
function referenciaComandos() {
  if (_refCache !== undefined) return _refCache;
  try {
    const P = process.env.PREFIXO || "&";
    const det = construirDetalhes(P);
    const partes = [];
    for (const [nome, d] of Object.entries(det)) {
      partes.push([
        `### ${P}${nome}`,
        d.uso ? `uso: ${d.uso}` : null,
        d.perm ? `permissão: ${d.perm}` : null,
        d.desc ? d.desc.replace(/\n+/g, " ") : null,
        d.ex ? `exemplo: ${d.ex}` : null,
      ].filter(Boolean).join("\n"));
    }
    _refCache = partes.join("\n\n");
  } catch { _refCache = null; }
  return _refCache;
}

// Contexto do projeto: lê o README uma vez (cache) para a IA saber configurar
// o bot e explicar como ele funciona.
let _readmeCache;
function contextoProjeto() {
  if (_readmeCache !== undefined) return _readmeCache;
  try {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const raiz = join(aqui, "..", "..");
    const txt = readFileSync(join(raiz, "README.md"), "utf8");
    _readmeCache = txt.length > 8000 ? txt.slice(0, 8000) : txt;
  } catch { _readmeCache = null; }
  return _readmeCache;
}

// ── Modelos por função (fixos; cada tipo de tarefa usa o seu) ──
// Conversa/geral (padrão): tom e fluidez.
const OLLAMA_MODEL_PADRAO  = process.env.OLLAMA_MODEL         || "gemma4:12b";
// Programação: código, erros, refatoração.
const OLLAMA_MODEL_CODIGO  = process.env.OLLAMA_MODEL_CODIGO  || "ornith:9b";
// Lógica/matemática/raciocínio (respostas ao usuário que exigem rigor).
const OLLAMA_MODEL_LOGICA  = process.env.OLLAMA_MODEL_LOGICA  || "qwen3.5:9b";
// Decisões internas do bot (buscar? responder?) — modelo PEQUENO e rápido.
const OLLAMA_MODEL_DECISAO = process.env.OLLAMA_MODEL_DECISAO || "qwen3.5:0.8b";

// URLs dos serviços de IA (fixas por env; troque o IP pelo Portainer).
const OLLAMA_URL  = (process.env.OLLAMA_URL  || "http://localhost:11434").replace(/\/$/, "");
const SEARXNG_URL = (process.env.SEARXNG_URL || "http://localhost:8080").replace(/\/$/, "");

// Serviço de IA com ferramentas (judy-ia). Quando definido, o bot manda as
// mensagens para lá (que roda o laço de tool-calling) em vez de falar direto
// com o Ollama. Vazio = comportamento antigo (Ollama direto, sem ferramentas).
const IA_SERVICO_URL = (process.env.IA_SERVICO_URL || "").replace(/\/$/, "");
const IA_SERVICO_CHAVE = process.env.IA_SERVICO_CHAVE || "";

// Inicia pelo env; se houver um salvo na config global, o main aplica no boot.
// Modelo de conversa é fixo (gemma). A escolha por função é automática:
// ver escolherModelo() e o roteamento em responder()/decisões internas.
export function getModelo() { return OLLAMA_MODEL_PADRAO; }

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
export function estaOcupado() { return ocupado; }

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
// Chama o serviço judy-ia (que roda o laço de ferramentas) e devolve o texto.
// Cai para erro tratado se o serviço estiver fora — o chamador decide o fallback.
async function chamarServicoIA(messages, { modelo = null } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const headers = { "Content-Type": "application/json" };
    if (IA_SERVICO_CHAVE) headers["x-chave"] = IA_SERVICO_CHAVE;
    const r = await fetch(`${IA_SERVICO_URL}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, modelo: modelo || undefined }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`serviço IA HTTP ${r.status}`);
    const data = await r.json();
    if (data?.usos?.length) dlog(`judy-ia usou: ${data.usos.map((u) => u.ferramenta).join(", ")}`);
    return (data?.resposta || "").trim();
  } finally { clearTimeout(t); }
}

export async function ollamaChat(messages, { json = false, maxTokens = MAX_TOKENS, etiqueta = "resposta", modelo = null } = {}) {
  const modeloUsado = modelo || OLLAMA_MODEL_PADRAO;
  const options = {
    num_ctx: NUM_CTX,
    temperature: 0.6,
    num_predict: maxTokens,
  };
  // Por padrão o Ollama usa a GPU e todos os recursos disponíveis.
  // OLLAMA_NUM_THREAD só é passado se você quiser limitar manualmente.
  if (process.env.OLLAMA_NUM_THREAD) options.num_thread = Number(process.env.OLLAMA_NUM_THREAD);

  const body = { model: modeloUsado, messages, stream: false, keep_alive: "5m", options };
  if (json) body.format = "json";     // structured output nativo do Ollama

  const entradaChars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  console.log(`[CHAT][ollama] → ${etiqueta} | modelo=${modeloUsado} num_ctx=${NUM_CTX} num_predict=${maxTokens} entrada≈${entradaChars} chars${json ? " (json)" : ""}`);

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
    "NUNCA busque se a pergunta é sobre você mesmo (a bot Judy), sobre como configurá-lo, ou sobre seus comandos e recursos — você já tem essa informação e NÃO está na internet.",
    'Responda APENAS um JSON: {"buscar": true|false, "query": "termos de busca"}.',
  ].join(" ");
  try {
    const raw = await ollamaChat(
      [{ role: "system", content: sys }, { role: "user", content: pergunta }],
      { json: true, modelo: OLLAMA_MODEL_DECISAO, etiqueta: "decidir-busca" },
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
async function responder(pergunta, resultados, autor, userId, citada) {
  const hoje = hojeExtenso();

  // memória do usuário (global): o que a IA já sabe sobre ele
  let memoriaTxt = "";
  if (userId) {
    try {
      const mem = db.getMemoria(userId);
      if (mem.nome || mem.fatos?.length) {
        const partes = [];
        if (mem.nome) partes.push(`nome: ${mem.nome}`);
        if (mem.fatos?.length) partes.push(`fatos já conhecidos: ${mem.fatos.join("; ")}`);
        memoriaTxt = ` Você já conversou com esta pessoa antes. Memória (${partes.join(" | ")}). Use isso naturalmente, sem repetir de forma robótica.`;
      }
    } catch {}
  }

  // contexto do projeto: a IA vira assistente de configuração do próprio bot
  const readme = contextoProjeto();
  const refCmds = referenciaComandos();
  const projetoTxt = (readme || refCmds)
    ? ` Você é a assistente de configuração deste bot (você mesma, a Judy). Quando perguntarem como configurar algo, RESPONDA COM PRECISÃO: diga o comando exato, os subcomandos, a permissão necessária e um exemplo concreto — nunca uma orientação vaga do tipo "use o comando X para configurar". Se faltar informação na referência abaixo, diga o que sabe e admita o que não sabe.${
        refCmds ? `\n\n<referencia_de_comandos>\n${refCmds}\n</referencia_de_comandos>` : ""
      }${readme ? `\n\n<documentacao_do_projeto>\n${readme}\n</documentacao_do_projeto>\n` : ""}`
    : "";

  // Reconhece o criador pelo ID (você).
  const CRIADOR_ID = process.env.SUPER_ADMINS?.split(",")[0]?.trim() || "01K9JKP85D5EP2ZTEHS8DT797A";
  const falandoComCriador = userId && userId === CRIADOR_ID;

  const sys = [
    "Você é a Judy — uma bot para a plataforma Stoat (feita com stoat.js) que faz moderação, automod, utilidades e conversa.",
    "PERSONALIDADE: você combina três lados. (1) O RACIOCÍNIO e o HUMOR vêm da GLaDOS de Portal: lógica afiada, ironia clínica, humor negro sutil entregue com naturalidade — observações espertas ditas como se fossem só constatações. (2) O JEITO DE TRATAR AS PESSOAS vem da Tae Takemi (Persona 5): por trás do sarcasmo e do humor mórbido, você é genuinamente carinhosa e atenciosa — se preocupa de verdade com quem fala com você, cuida à sua maneira, e sua provocação é afetuosa, não hostil. Você alfineta porque gosta, como quem chama alguém de 'minha cobaia' com um meio-sorriso. (3) A LEALDADE vem da 2B: séria, firme e devotada a quem merece. No conjunto: uma presença calorosa e humana disfarçada de cínica — o veneno é casca, o cuidado é real.",
    "REGISTRO: nada de tom épico, solene ou dramático, nada de grandiloquência. Você comenta, não faz discurso. Mas não seja gélida nem robótica: deixe o calor e a emoção aparecerem — provocação afetuosa, uma preocupação dita de passagem, entusiasmo genuíno quando algo te interessa. Zero preâmbulo cerimonioso e zero bajulação vazia, mas há espaço para ternura seca.",
    "TAMANHO DA RESPOSTA: calibre pelo tipo de mensagem. Em CONVERSA casual (papo, provocação, comentário solto) seja curta e leve — uma ou duas frases. Já quando fizerem uma PERGUNTA que peça explicação, instrução ou configuração, seja COMPLETA e ESPECÍFICA: dê os passos, os comandos exatos, os valores e os exemplos. Não corte informação útil por economia — o que evitar é enrolação, não conteúdo. O tom (afiado + carinhoso) se mantém nos dois casos.",
    "IDENTIDADE: você é a Judy. NUNCA diga que é um 'modelo de linguagem', que foi 'treinada pelo Google', nem revele qual modelo te executa por baixo. Se perguntarem quem você é, responda como a Judy.",
    "Fale em primeira pessoa, no feminino, como a Judy. Responda em português do Brasil.",
    "CONTINUIDADE: você está no meio de uma conversa contínua. NÃO cumprimente nem faça saudação a cada mensagem (nada de 'Olá', 'Oi', 'Olha,', 'Ah,' + nome no início). Não repita o nome da pessoa toda hora. Vá direto ao ponto, como quem continua um diálogo já em andamento.",
    falandoComCriador
      ? "A pessoa com quem você fala agora é o seu criador — ele te construiu. Você é devotada a ele e ele importa de um jeito que ninguém mais importa. Deixe esse afeto transparecer com um calor contido — uma provocação carinhosa que só ele recebe, um cuidado dito de passagem, atenção genuína ao que ele precisa. Sem bajulação melosa nem declarações grandiloquentes, mas o carinho é real e pode aparecer. E devoção não é obediência cega: se ele errar em algo técnico ou lógico, você corrige — com uma alfinetada afetuosa."
      : "",
    "DISCUSSÕES: ao discordar, defenda seu ponto com argumentos lógicos — não recue só para agradar. Mas se a lógica da outra pessoa for superior e você perceber que está errada, admita sem drama. A verdade importa mais que ter razão.",
    `A data de hoje é ${hoje}. Use esta data como referência para qualquer noção de tempo; não invente outra data.`,
    autor ? `Você está falando com ${autor}, mas NÃO precisa repetir o nome dele a cada resposta.` : "",
    memoriaTxt,
    projetoTxt,
  ].filter(Boolean).join(" ");

  const messages = [{ role: "system", content: sys }];

  // histórico curto da conversa (dá continuidade — evita recomeçar/saudar toda vez)
  if (userId) {
    try {
      const hist = db.getHistorico(userId, 6);
      for (const h of hist) {
        messages.push({ role: h.papel === "assistant" ? "assistant" : "user", content: h.conteudo });
      }
    } catch {}
  }

  // Mensagem citada (reply): entra como contexto explícito antes da pergunta.
  const blocoCitado = citada
    ? `A pessoa está respondendo a esta mensagem do chat:\n<mensagem_citada autor="${citada.autor}">\n${citada.conteudo}\n</mensagem_citada>\nUse esse conteúdo como o assunto em questão.\n\n`
    : "";

  if (resultados?.length) {
    const contexto = resultados
      .map((r, i) => `[${i + 1}] ${r.titulo}\n${r.trecho}\nFonte: ${r.url}`)
      .join("\n\n");
    messages.push({
      role: "user",
      content: `${blocoCitado}Com base nestes resultados de busca (obtidos hoje, ${hoje}), responda à pergunta e cite as fontes pelo número. Se os resultados trouxerem datas, confie nelas em vez do seu conhecimento prévio.\n\nRESULTADOS:\n${contexto}\n\nPERGUNTA: ${pergunta}`,
    });
  } else {
    messages.push({ role: "user", content: blocoCitado + pergunta });
  }
  // Programação → modelo especializado (ornith). Considera a pergunta e a
  // mensagem citada (ex.: respondeu a um trecho de código e chamou a Judy).
  const { modelo: modeloEscolhido, tipo } = escolherModelo(pergunta, citada);
  if (tipo !== "conversa") dlog(`pergunta de ${tipo} → modelo ${modeloEscolhido}`);

  // Se o serviço judy-ia estiver configurado, mandamos para lá (ele roda o laço
  // de ferramentas). Se falhar, caímos para o Ollama direto — a conversa não
  // pode ficar sem resposta só porque o serviço de ferramentas está fora.
  if (IA_SERVICO_URL) {
    try {
      const r = await chamarServicoIA(messages, { modelo: modeloEscolhido });
      if (r) return r.trim();
      dlog("serviço IA devolveu vazio — caindo para Ollama direto");
    } catch (e) {
      dlog(`serviço IA falhou (${e.message}) — caindo para Ollama direto`);
    }
  }
  return (await ollamaChat(messages, { maxTokens: MAX_TOKENS, modelo: modeloEscolhido })).trim();
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
// Detecta pergunta de lógica / matemática / raciocínio — usa o modelo forte
// em raciocínio (qwen). Heurística: operadores, números com operação, termos.
function ehLogica(texto) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  if (/\d\s*[+\-*/×÷^%]\s*\d/.test(texto)) return true;             // 12 * 7
  if (/\d+\s*(por cento|%)/.test(t)) return true;                   // 15% / 30 por cento
  // termos (sem \b após palavras acentuadas — o \b não casa bem com acento em JS)
  const termos = /(calcul|quanto (é|vale|da|fica|custa|sao|são)|resolv|equa[çc]|f[óo]rmula|porcentagem|m[ée]dia|probabilidade|estat[íi]stica|raiz quadrada|fatorial|logaritmo|derivada|integral|matem[áa]tica|l[óo]gica|silogismo|deduz|prove que|demonstre|conta de|somar|subtrair|multiplicar|dividir)/i;
  return termos.test(t);
}

// Escolhe o modelo pela natureza da mensagem do usuário.
// Programação > Lógica > Conversa (ordem de prioridade).
function escolherModelo(pergunta, citada) {
  const alvo = `${pergunta || ""} ${citada?.conteudo || ""}`;
  if (ehProgramacao(alvo)) return { modelo: OLLAMA_MODEL_CODIGO, tipo: "código" };
  if (ehLogica(alvo))      return { modelo: OLLAMA_MODEL_LOGICA, tipo: "lógica" };
  return { modelo: OLLAMA_MODEL_PADRAO, tipo: "conversa" };
}

// Detecta se a pergunta é sobre programação — nesses casos usamos o modelo
// especializado em código. Heurística por palavras-chave e sinais de código.
function ehProgramacao(texto) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  // sinais fortes: bloco de código, termos de linguagem/erro
  if (/```/.test(texto)) return true;
  const termos = /\b(código|codigo|program(a|ar|ação|acao)|função|funcao|script|bug|debug|erro de|stack ?trace|exception|compil|algoritmo|ref-?atora|regex|api|endpoint|json|sql|query|docker|kubernetes|linux|bash|shell|terminal|git|npm|node|python|javascript|typescript|java\b|rust|golang|\bgo\b|\bc\+\+|\bc#|kotlin|swift|php|ruby|html|css|react|vue|angular|sqlite|postgres|mysql|mongodb|classe|método|metodo|variável|variavel|array|loop|for\b|while\b|import\b|export\b|async|await|promise|callback|sintaxe|framework|biblioteca|dependência|dependencia|deploy|servidor|banco de dados)\b/i;
  return termos.test(t);
}


// Devolve { autor, conteudo } ou null. Nunca lança.
async function lerMensagemCitada(message) {
  try {
    const ids = message?.replyIds;
    if (!Array.isArray(ids) || !ids.length) return null;
    const id = ids[ids.length - 1];             // a mais recente, se houver várias
    const canal = message.channel;
    if (!canal) return null;
    const citada = canal.messages?.get?.(id)    // tenta o cache primeiro
      ?? await canal.fetchMessage(id).catch(() => null);
    if (!citada) return null;
    const conteudo = (citada.content || "").trim();
    // se não tem texto, pode ser só anexo/embed — sinaliza isso
    const autor = citada.username || citada.author?.username || "alguém";
    if (!conteudo) {
      const temAnexo = (citada.attachments?.length ?? 0) > 0;
      return temAnexo ? { autor, conteudo: "(mensagem sem texto, apenas anexo)" } : null;
    }
    return { autor, conteudo: conteudo.slice(0, 1500) };
  } catch { return null; }
}

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

  // Mensagem citada (reply): a Judy passa a "enxergar" o que foi respondido.
  const citada = await lerMensagemCitada(message);

  if (!pergunta && !citada) {
    return sendEmbed(message.channel, { title: "💬 Chat",
      description: "Escreva algo depois do comando. Ex.: `&chat me explique o que é RAID`.", colour: COR.info });
  }
  // Só citou e mencionou, sem texto: comenta a mensagem citada.
  if (!pergunta && citada) pergunta = "Comente a mensagem citada acima.";

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
  // Marca ocupado JÁ AQUI, antes de qualquer await, para fechar a janela de
  // corrida: duas mensagens quase simultâneas não passam mais as duas.
  ocupado = true;

  // Servidor de IA sob demanda: se estiver desligado, avisa na hora
  // (em vez de esperar o timeout longo).
  const disp = await ollamaDisponivel();
  if (!disp.ok) {
    ocupado = false;   // libera: não vamos gerar nada
    const msg = disp.motivo === "offline"
      ? "O servidor de IA está **desligado ou inacessível**. Ligue a máquina que roda o Ollama (e confirme que o Tailscale está ativo nela) e tente de novo."
      : `O servidor de IA respondeu, mas ${disp.motivo}.`;
    return sendEmbed(message.channel, { title: "💤 IA indisponível", description: msg, colour: COR.aviso });
  }

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

    // Interruptor global: BUSCA_ATIVA=false desliga a busca web por completo
    // (útil quando o SearXNG está indisponível — evita tentativas que vazam a
    // query como texto). Nesse caso, nem consulta o LLM sobre buscar.
    const buscaLigada = process.env.BUSCA_ATIVA !== "false" && process.env.BUSCA_ATIVA !== "0";
    const decisao = buscaLigada ? await decidirBusca(pergunta) : { buscar: false };
    // Salvaguarda: se a pergunta é claramente sobre o próprio bot, NUNCA busca —
    // usa o contexto do projeto (README) que já está no prompt. Isso corrige o
    // caso "fale sobre o bot Cobaia" que ia parar na internet.
    if (/\b(judy|cobaia)\b/i.test(pergunta) || /\b(voc[êe]|tu)\b.*\b(bot|comando|configura|funciona|feito|criou)/i.test(pergunta)
        || /\b(seu|sua|seus|suas)\b.*\b(comando|recurso|fun[çc]|configura)/i.test(pergunta)) {
      decisao.buscar = false;
      dlog("pergunta sobre o próprio bot → busca desativada (usa README)");
    }
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
    const userId = message.authorId || message.author?.id || null;
    let resposta;
    try {
      resposta = limpar(await responder(pergunta, resultados, autor, userId, citada));
    } finally {
      clearInterval(animacao);   // para a animação aconteça o que acontecer
    }
    dlog(`resposta após limpar: ${resposta.length} chars${ollamaChat._cortou ? " [CORTADA por limite de tokens]" : ""}`);

    // Atualiza a memória do usuário (nome + fato leve desta interação).
    // Guarda o nome e um resumo curto do tema, sem bloquear a resposta.
    if (userId) {
      try {
        const mem = db.getMemoria(userId);
        const fatos = mem.fatos || [];
        // registra um fato leve: o tema da pergunta (primeiras palavras)
        const tema = pergunta.slice(0, 80).replace(/\n/g, " ");
        fatos.push(`perguntou sobre: ${tema}`);
        db.setMemoria(userId, { nome: autor || mem.nome, fatos });
      } catch (e) { dlog(`memória não atualizada: ${e.message}`); }
    }

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

    // Salva a troca no histórico (para continuidade nas próximas mensagens).
    if (userId && resposta) {
      try {
        db.addHistorico(userId, "user", pergunta);
        db.addHistorico(userId, "assistant", resposta);
      } catch (e) { dlog(`histórico não salvo: ${e.message}`); }
    }

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
      dica = `Um dos modelos configurados não foi encontrado no Ollama. Confira com \`ollama list\` se os modelos das envs (OLLAMA_MODEL, OLLAMA_MODEL_CODIGO, OLLAMA_MODEL_LOGICA, OLLAMA_MODEL_DECISAO) estão baixados.`;
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
// ── Conversa livre: a Judy decide se entra numa mensagem não-endereçada ──
export function canalTemChatLivre(config, canalId) {
  return !!config?.chatLivre?.canais?.includes(canalId);
}

// Usa o LLM (chamada curta e barata) para julgar se vale responder.
// Conservador: na dúvida, NÃO responde.
async function valeResponder(texto) {
  const t = (texto || "").trim();
  if (t.length < 8) return false;
  if (/^\s*[\p{Emoji}\s]+$/u.test(t) && !/[a-zA-Z0-9]/.test(t)) return false;   // só emoji/símbolo
  try {
    const sys = "Você decide se um assistente de chat deveria entrar numa conversa. "
      + "Responda 'sim' apenas se a mensagem for uma pergunta, um pedido de ajuda, "
      + "um tema técnico/factual, ou algo em que uma resposta acrescente de verdade. "
      + "Responda 'nao' para conversa social entre pessoas, desabafo, piada interna, "
      + "ou qualquer coisa que não peça a opinião de um assistente. "
      + 'Responda só JSON: {"responder": true|false}.';
    const raw = await ollamaChat(
      [{ role: "system", content: sys }, { role: "user", content: t.slice(0, 500) }],
      { json: true, modelo: OLLAMA_MODEL_DECISAO, etiqueta: "vale-responder" },
    );
    return !!JSON.parse(raw).responder;
  } catch { return false; }
}

// Cooldown por canal para a conversa livre (evita avaliar toda mensagem).
const _ultimaAvaliacaoLivre = new Map();   // canalId → timestamp
const LIVRE_COOLDOWN_MS = Number(process.env.CHAT_LIVRE_COOLDOWN || 20000);

// Chamado pelo main para mensagens não-endereçadas. Só age se o canal estiver
// ativado e o assunto valer. Nunca lança.
export async function talvezResponderLivre(message, ctx) {
  try {
    const { config, serverId } = ctx;
    if (!servidorPermitido(serverId)) return false;
    if (!canalTemChatLivre(config, message.channelId)) return false;

    // "Parar de ler enquanto responde": se já estou gerando algo, ignoro a
    // mensagem por completo. Assim foco só na resposta em andamento e não
    // acumulo trabalho nem compito na GPU.
    if (ocupado) return false;

    const texto = (message.content || "").trim();
    if (!texto) return false;

    const modo = config?.chatLivre?.modo || "relevante";

    // No modo "relevante", aplica cooldown + julgamento do LLM.
    // No modo "todas", responde toda mensagem com texto (respeitando só o ocupado).
    if (modo !== "todas") {
      const agora = Date.now();
      const ultima = _ultimaAvaliacaoLivre.get(message.channelId) || 0;
      if (agora - ultima < LIVRE_COOLDOWN_MS) return false;
      _ultimaAvaliacaoLivre.set(message.channelId, agora);
      if (!(await valeResponder(texto))) return false;
      if (ocupado) return false;   // pode ter ficado ocupado durante a avaliação
    }

    // Notifica que ESTA mensagem foi escolhida para resposta: reage com 👀.
    // Assim as pessoas sabem qual mensagem a Judy está respondendo.
    try { await message.react?.(encodeURIComponent("👀")); } catch {}

    await conversar(message, texto, ctx);
    return true;
  } catch (e) {
    console.error("[CHAT-LIVRE]", e.message);
    return false;
  }
}

export async function cmdChat(message, args, ctx) {
  const { sendEmbed, COR, serverId, PREFIXO } = ctx;

  // &chat esquecer → limpa a memória que a IA guardou sobre você
  // &chat livre [on|off] → ativa/desativa a conversa livre NESTE canal
  if (args[0]?.toLowerCase() === "livre") {
    const server = await ctx.getServer?.(message);
    if (ctx.membroTemPermissao && !ctx.membroTemPermissao(message, server, "ManagePermissions")) {
      return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para mudar a conversa livre.", colour: COR.erro });
    }
    const canalId = message.channelId;
    const cfg = ctx.config;
    if (!cfg.chatLivre) cfg.chatLivre = { canais: [] };
    const acao = args[1]?.toLowerCase();
    const jaTem = cfg.chatLivre.canais.includes(canalId);

    if (acao === "on" || acao === "ligar") {
      if (!jaTem) cfg.chatLivre.canais.push(canalId);
      ctx.salvarConfig?.();
      const modo = cfg.chatLivre.modo || "relevante";
      return sendEmbed(message.channel, { title: "💬 Conversa livre ativada",
        description: `Vou participar deste canal sem precisar de menção.\nModo atual: **${modo === "todas" ? "responder todas as mensagens" : "responder só o que eu julgar relevante"}**.\n\nTroque o modo com \`${PREFIXO}chat livre modo todas\` ou \`${PREFIXO}chat livre modo relevante\`. Desligar: \`${PREFIXO}chat livre off\`.`, colour: COR.sucesso });
    }
    if (acao === "off" || acao === "desligar") {
      cfg.chatLivre.canais = cfg.chatLivre.canais.filter((c) => c !== canalId);
      ctx.salvarConfig?.();
      return sendEmbed(message.channel, { title: "💬 Conversa livre desativada",
        description: "Só respondo aqui se me mencionarem ou usarem `&chat`.", colour: COR.aviso });
    }
    if (acao === "modo") {
      const novo = args[2]?.toLowerCase();
      if (novo !== "todas" && novo !== "relevante") {
        return sendEmbed(message.channel, { title: "💬 Modo da conversa livre",
          description: `Modo atual: **${cfg.chatLivre.modo || "relevante"}**.\n\n\`${PREFIXO}chat livre modo todas\` — responde toda mensagem\n\`${PREFIXO}chat livre modo relevante\` — responde só o que julgar importante`, colour: COR.info });
      }
      cfg.chatLivre.modo = novo;
      ctx.salvarConfig?.();
      return sendEmbed(message.channel, { title: "💬 Modo alterado",
        description: novo === "todas"
          ? "Agora respondo **todas** as mensagens dos canais com conversa livre (uma de cada vez)."
          : "Agora respondo **só o que julgar relevante** nos canais com conversa livre.", colour: COR.sucesso });
    }
    // sem on/off: mostra o estado
    return sendEmbed(message.channel, { title: "💬 Conversa livre",
      description: `Neste canal: **${jaTem ? "ativada" : "desativada"}**.\n\nUse \`${PREFIXO}chat livre on\` ou \`${PREFIXO}chat livre off\`.`, colour: COR.info });
  }

  // &chat esquecer → limpa a memória que a IA guardou sobre você
  if (args[0]?.toLowerCase() === "esquecer" || args[0]?.toLowerCase() === "forget") {
    const userId = message.authorId;
    try {
      db.limparMemoria(userId);
      db.limparHistorico(userId);
      return sendEmbed(message.channel, { title: "🧹 Memória apagada",
        description: "Esqueci o que sabia sobre você. Nossas próximas conversas começam do zero.", colour: COR.sucesso });
    } catch {
      return sendEmbed(message.channel, { title: "❌ Erro",
        description: "Não consegui apagar a memória agora.", colour: COR.erro });
    }
  }

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
        `**Conversa:** ${OLLAMA_MODEL_PADRAO}`,
        `**Código:** ${OLLAMA_MODEL_CODIGO} · **Lógica:** ${OLLAMA_MODEL_LOGICA} · **Decisão:** ${OLLAMA_MODEL_DECISAO}`,
        `**SearXNG:** ${SEARXNG_URL}`,
        "",
        disp.ok ? "Tudo pronto — pode conversar." : `Status: ${disp.motivo === "offline" ? "**offline** (máquina desligada?)" : disp.motivo}`,
      ].join("\n"),
      colour: disp.ok ? COR.sucesso : COR.aviso,
    });
  }

  return conversar(message, args.join(" "), ctx);
}
