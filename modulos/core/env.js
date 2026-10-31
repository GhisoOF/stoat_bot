// env.js — nomes amigáveis do .env → variáveis internas.
// Importado logo no início (main.js, iniciar.js, chat.js), é idempotente.
//
//   DONO       → SUPER_ADMINS        (ID do perfil do dono)
//   SERVIDOR   → CHAT_SERVIDORES     (onde a IA roda; "*" = em todos)
//   IA         → 0/1                 (liga/desliga todos os módulos de IA)
//   IA_MODO    → local                (llama.cpp embutido). O modo online foi
//                REMOVIDO em 31 out 2026 (R9: nada da conversa, da moderação, da
//                memória ou das imagens sai da máquina). Sem GPU, use IA=0.
//   MODELO     → -hf do llama (local)
//   MODELO_VISAO → LLM_MODEL_VISAO    (liga a ferramenta de visão)
//   PROMPT     → personalidade padrão da IA (o &personalidade por servidor vence)
//   CONVERSA   → 0 = modo enxuto: a IA fica SÓ para moderação, relatório do
//                log e RSS (sem chat, sem gerar imagem, sem memória/comentários)
//   IMAGEM     → 1 = o gerador de imagem existe (e o boot baixa os modelos dele).
//                (31 out 2026, P2: só com IMAGEM=1 — vazio = desligado)
//
// Modelos por papel (P2): só LLM_MODEL (conversa e o resto), LLM_MODEL_JUIZ
// (moderação) e LLM_MODEL_VISAO. Os antigos LLM_MODEL_LEVE/CODIGO/LOGICA/
// DECISAO/RELATORIO valem como sinônimo do LLM_MODEL, e o LLM_MODEL_MODERACAO
// (moderação de imagem) do LLM_MODEL_VISAO (o boot avisa no log; nada quebra).
//
// Os nomes internos continuam valendo e têm prioridade se definidos.

const e = process.env;
const DESLIGADO = new Set(["0", "false", "nao", "não", "off", "no"]);

if (e.DONO && !e.SUPER_ADMINS) e.SUPER_ADMINS = e.DONO;
if (e.SERVIDOR && !e.CHAT_SERVIDORES) e.CHAT_SERVIDORES = e.SERVIDOR;

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

// A IA de CONVERSA (16 out 2026, pedido de Ghieh: "quero tirar a parte de IA
// por hora, deixar só o justo e necessário para a moderação, o log e o RSS").
// CONVERSA=0 desliga o chat (&chat, menção, chat livre, comentário espontâneo,
// memória), a moderação por IA com critério livre (&modia — ela lê TODA
// mensagem) e a geração de imagem. Ficam: a confirmação dos temas proibidos,
// a visão das imagens/fotos de perfil, o relatório horário e o RSS.
export function conversaLigada() {
  return iaLigada() && !DESLIGADO.has((e.CONVERSA ?? "1").trim().toLowerCase());
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
// (P2) o gerador de imagem só existe com IMAGEM=1 (vazio = desligado: nada de baixar
// ~6–13 GB num volume novo sem ninguém ter pedido)
export const imagemLigada = () => iaLigada() && conversaLigada() && ligado("IMAGEM", false);

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
const BOOLEANOS = ["IA", "CONVERSA", "IMAGEM", "VOZ_ATIVA", "BUSCA_SEMPRE", "IMAGEM_LIBERAR_GPU", "IMAGEM_TE_GPU"];
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
const LISTAS_DE_ID = ["SUPER_ADMINS", "CHAT_SERVIDORES", "TTS_SERVIDORES", "RSS_SERVIDORES", "WEBHOOK_SERVIDORES"];
export function avisosDoEnv() {
  const p = [];
  for (const v of LISTAS_DE_ID) {
    const itens = (e[v] || "").split(",").map((x) => x.trim()).filter(Boolean);
    const ruins = itens.filter((x) => x !== "*" && !/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(x));
    if (ruins.length) p.push(`${v}: ${ruins.length} item(ns) não é ID do Stoat (26 caracteres) nem "*" — ignorado(s)`);
  }
  for (const k of modelosAntigos()) p.push(`${k} saiu (P2): vale como ${MODELOS_ANTIGOS[k]} — troque o nome no .env`);
  return p;
}

// Modelo padrão do modo local: pequeno o bastante para CPU, bom o bastante
// para conversar. Formato -hf do llama.cpp: usuario/repositorio:quantizacao.
export const MODELO_LOCAL_PADRAO = "bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M";

if (iaLigada()) {
  if (modoIA() === "local") {
    // O llama-server embutido (iniciar.js) escuta em 8082.
    if (!e.LLM_URL) e.LLM_URL = "http://127.0.0.1:8082";
  }
  // A ferramenta de visão (ver_imagem) só é registrada quando LLM_MODEL_VISAO
  // existe (no modo local com llama-swap o iniciar.js já define "visao").
  if (e.MODELO_VISAO && !e.LLM_MODEL_VISAO) e.LLM_MODEL_VISAO = e.MODELO_VISAO;

  // Modo enxuto: menos processamento. Sem gerador de imagem (nem o download
  // dos ~6–13 GB dos modelos dele), contexto menor e o modelo sai da memória
  // depois de 5 min parado (os pedidos de moderação são esporádicos).
  if (!conversaLigada()) {
    e.IMAGEM = "0";
    if (!e.LLAMA_CTX) e.LLAMA_CTX = "4096";
    if (!e.IA_TTL) e.IA_TTL = "300";
  }
}

// "Este servidor está na lista?" para as variáveis de lista (TTS_SERVIDORES,
// CHAT_SERVIDORES…): ids separados por vírgula, "*" = todos. Lido na hora —
// antes cada módulo tinha a sua cópia desta conta.
export function servidorNaLista(variavel, serverId) {
  const lista = (process.env[variavel] || "").split(",").map((x) => x.trim()).filter(Boolean);
  return lista.includes("*") || (!!serverId && lista.includes(serverId));
}
