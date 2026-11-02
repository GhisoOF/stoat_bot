// env.js — nomes amigáveis do .env → variáveis internas.
// Importado logo no início (main.js, iniciar.js), é idempotente.
//
//   DONO       → SUPER_ADMINS        (ID do perfil do dono)
//   IA         → 0/1                 (liga/desliga a IA da moderação)
//   IA_MODO    → local                (llama.cpp embutido). O modo online foi
//                REMOVIDO em 31 out 2026 (R9: nada da moderação nem das imagens
//                sai da máquina). Sem GPU, use IA=0.
//   MODELO     → -hf do llama (local): o juiz da moderação
//   MODELO_MODERACAO → o juiz, se for outro modelo (vence o MODELO)
//   MODELO_VISAO → LLM_MODEL_VISAO    (liga a visão das imagens)
//
// (2 nov 2026, P4) O chat IA saiu: a IA ficou SÓ na moderação (modulos/moderacao/
// modelo.js). SERVIDOR/CHAT_SERVIDORES, CHAT_PADRAO, CONVERSA, IMAGEM, PROMPT, a
// busca (SEARXNG_*, BUSCA_*), o GitHub da IA e o gerador de imagem (SD_*) não
// existem mais: se ainda estiverem no .env, o boot avisa no log (VARIAVEIS_QUE_SAIRAM).
//
// Modelos por papel: LLM_MODEL_JUIZ (o juiz; sem ele, o LLM_MODEL) e
// LLM_MODEL_VISAO. Os antigos LLM_MODEL_LEVE/CODIGO/LOGICA/DECISAO/RELATORIO valem
// como sinônimo do LLM_MODEL, e o LLM_MODEL_MODERACAO (moderação de imagem) do
// LLM_MODEL_VISAO (o boot avisa no log; nada quebra).
//
// Os nomes internos continuam valendo e têm prioridade se definidos.

const e = process.env;
const DESLIGADO = new Set(["0", "false", "nao", "não", "off", "no"]);

if (e.DONO && !e.SUPER_ADMINS) e.SUPER_ADMINS = e.DONO;

// Os nomes de modelo que saíram (P2) e para quem eles vão
export const MODELOS_ANTIGOS = { LLM_MODEL_LEVE: "LLM_MODEL", LLM_MODEL_DECISAO: "LLM_MODEL", LLM_MODEL_LOGICA: "LLM_MODEL",
  LLM_MODEL_CODIGO: "LLM_MODEL", LLM_MODEL_RELATORIO: "LLM_MODEL", LLM_MODEL_MODERACAO: "LLM_MODEL_VISAO" };
// (o LLM_MODEL_MODERACAO era o modelo da moderação de IMAGEM — por padrão o da visão;
// no modo local os nomes são os do llama-swap, que o iniciar.js define: ali não se copia)
export function modelosAntigos(env = e) {
  for (const [antigo, novo] of Object.entries(MODELOS_ANTIGOS)) {
    const v = (env[antigo] ?? "").trim();
    if (novo === "LLM_MODEL_VISAO" && String(env.IA_MODO ?? "").trim().toLowerCase() === "local") continue;
    if (v && !(env[novo] ?? "").trim()) env[novo] = v;
  }
  return Object.keys(MODELOS_ANTIGOS).filter((k) => (env[k] ?? "").trim());
}
modelosAntigos();

export function iaLigada() {
  return !DESLIGADO.has((e.IA ?? "1").trim().toLowerCase());
}

export function modoIA() {
  const m = (e.IA_MODO || "").trim().toLowerCase();
  return m === "local" ? m : "";
}

// Liga/desliga lido do jeito que o .env escreve ("0", "off", "false", "não"…).
// Antes, seis lugares testavam `!== "0"` e IMAGEM=off deixava a imagem ligada.
export function ligado(nome, padrao = true) {
  const v = (e[nome] ?? "").trim().toLowerCase();
  if (!v) return padrao;
  return !DESLIGADO.has(v);
}

// Número do .env: vazio → padrão; inválido ou fora da faixa → erro (o boot para,
// Regra do Reparo). Antes, `Number("30/min")` virava NaN e desligava tetos calado.
export function numero(nome, padrao, { min = -Infinity, max = Infinity, inteiro = false } = {}) {
  const bruto = (e[nome] ?? "").trim();
  if (!bruto) return padrao;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < min || n > max || (inteiro && !Number.isInteger(n))) {
    throw new Error(`.env: ${nome}=${JSON.stringify(bruto)} é inválido (esperado ${inteiro ? "inteiro" : "número"} entre ${min} e ${max})`);
  }
  return n;
}

// Conferência do .env no boot (main.js e iniciar.js). Devolve a lista de
// problemas; quem chama para o boot se ela não estiver vazia.
const BOOLEANOS = ["IA", "VOZ_ATIVA"];
const VALIDOS = new Set([...DESLIGADO, "1", "true", "sim", "on", "yes", "si", "sí"]);
export function problemasDoEnv() {
  const p = [];
  const modo = (e.IA_MODO || "").trim().toLowerCase();
  if (modo === "online") p.push("IA_MODO=online foi removido (31 out 2026): use IA_MODO=local, ou IA=0 sem GPU");
  else if (modo && modo !== "local") p.push(`IA_MODO=${JSON.stringify(e.IA_MODO)} é inválido (use local, ou deixe vazio)`);
  for (const b of BOOLEANOS) {
    const v = (e[b] ?? "").trim().toLowerCase();
    if (v && !VALIDOS.has(v)) p.push(`${b}=${JSON.stringify(e[b])} é inválido (use 0 ou 1)`);
  }
  return p;
}

// Avisos que não param o boot: um ID errado numa lista só faz aquela entrada não
// valer para ninguém (falha fechada), então basta avisar no log.
const LISTAS_DE_ID = ["SUPER_ADMINS", "TTS_SERVIDORES", "RSS_SERVIDORES", "WEBHOOK_SERVIDORES"];
// (2 nov 2026, P4) as variáveis do chat IA, da busca, do GitHub da IA e do gerador de
// imagem: não fazem mais nada. Não param o boot (nada quebra sem elas), mas o log
// avisa — quem hospeda tira do .env. "X_*" = toda variável que começa com "X_".
export const VARIAVEIS_QUE_SAIRAM = ["SERVIDOR", "CHAT_*", "CONVERSA", "PROMPT", "PERSONA_MAX_CHARS", "SOBRE_CRIADOR",
  "PENSAR", "PENSAR_DECISOES", "CACHE_CANAL_MSGS", "FICHA_MAX_SERVIDORES", "COMENTARIO_*",
  "MEMORIA_AGENTE", "MEMORIA_DEBOUNCE_MS", "MEMORIA_MAX_LOTE", "MEMORIA_MAX_TOKENS", "MEMORIA_MIN_CHARS",
  // (GITHUB_* por nome: GITHUB_TOKEN, GITHUB_SHA… existem fora do bot, no CI e no shell)
  "SEARXNG_*", "BUSCA_*", "GITHUB_REPO", "GITHUB_REPO_ROTULO", "GITHUB_BRANCH", "GITHUB_TIMEOUT_MS", "CODIGO_*", "RSS_FEEDS", "CALC_TIMEOUT_MS", "FERRAMENTAS_OFF",
  "MAX_VOLTAS_FERRAMENTA", "NUM_CTX", "MAX_TOKENS", "CONTINUAR_MAX", "LLM_CTX", "LLM_PING_MS", "LLM_FILA_FUNDO",
  "IMAGEM", "IMAGEM_CFG", "IMAGEM_GERACAO_TIMEOUT_MS", "IMAGEM_LADO_GERACAO", "IMAGEM_LIBERAR_GPU", "IMAGEM_OFFLOAD",
  "IMAGEM_PASSOS", "IMAGEM_PASSOS_MAX", "IMAGEM_POR_DIA", "IMAGEM_SAMPLER", "IMAGEM_TETO_ARQUIVO", "IMAGEM_TE_GPU", "SD_*"];
export function variaveisQueSairam(env = e) {
  const casa = (k) => VARIAVEIS_QUE_SAIRAM.some((r) => (r.endsWith("*") ? k.startsWith(r.slice(0, -1)) : k === r));
  return Object.keys(env).filter((k) => casa(k) && String(env[k] ?? "").trim()).sort();
}
export function avisosDoEnv() {
  const p = [];
  for (const v of LISTAS_DE_ID) {
    const itens = (e[v] || "").split(",").map((x) => x.trim()).filter(Boolean);
    const ruins = itens.filter((x) => x !== "*" && !/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(x));
    if (ruins.length) p.push(`${v}: ${ruins.length} item(ns) não é ID do Stoat (26 caracteres) nem "*" — ignorado(s)`);
  }
  for (const k of modelosAntigos()) p.push(`${k} saiu (P2): vale como ${MODELOS_ANTIGOS[k]} — troque o nome no .env`);
  const sairam = variaveisQueSairam();
  if (sairam.length) p.push(`${sairam.join(", ")}: saiu com o chat IA (P4) e não faz mais nada — pode tirar do .env`);
  return p;
}

// Modelo padrão do modo local: pequeno o bastante para CPU, bom o bastante
// para julgar. Formato -hf do llama.cpp: usuario/repositorio:quantizacao.
export const MODELO_LOCAL_PADRAO = "bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M";

if (iaLigada()) {
  if (modoIA() === "local") {
    // O llama-server embutido (iniciar.js) escuta em 8082.
    if (!e.LLM_URL) e.LLM_URL = "http://127.0.0.1:8082";
  }
  // A visão (a rota /moderar-imagem do ia-servico) só existe quando LLM_MODEL_VISAO existe
  // (no modo local com llama-swap o iniciar.js já define "visao").
  if (e.MODELO_VISAO && !e.LLM_MODEL_VISAO) e.LLM_MODEL_VISAO = e.MODELO_VISAO;

  // Só moderação (o antigo modo enxuto, CONVERSA=0, virou o único): o modelo sai da memória
  // depois de 5 min parado (os pedidos são esporádicos). (P4, revisão) O LLAMA_CTX não é mais
  // baixado para 4096 aqui: vale o padrão do iniciar.js (8192) — a visão precisa de contexto
  // para a imagem, e o juiz que quiser menos usa o LLAMA_CTX_MODERACAO.
  if (!e.IA_TTL) e.IA_TTL = "300";
}

// "Este servidor está na lista?" para as variáveis de lista (TTS_SERVIDORES,
// RSS_SERVIDORES…): ids separados por vírgula, "*" = todos. Lido na hora —
// antes cada módulo tinha a sua cópia desta conta.
export function servidorNaLista(variavel, serverId) {
  const lista = (process.env[variavel] || "").split(",").map((x) => x.trim()).filter(Boolean);
  return lista.includes("*") || (!!serverId && lista.includes(serverId));
}
