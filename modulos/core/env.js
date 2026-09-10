// env.js — nomes amigáveis do .env → variáveis internas.
// Importado logo no início (main.js, iniciar.js, chat.js), é idempotente.
//
//   DONO       → SUPER_ADMINS        (ID do perfil do dono)
//   SERVIDOR   → CHAT_SERVIDORES     (onde a IA roda; "*" = em todos)
//   IA         → 0/1                 (liga/desliga todos os módulos de IA)
//   IA_MODO    → local | online      (llama.cpp embutido | plataforma com token)
//   MODELO     → -hf do llama (local) ou LLM_MODEL (online)
//   TOKEN_IA   → Authorization no LLM online
//   PROMPT     → personalidade padrão da IA (o &personalidade por servidor vence)
//
// Os nomes internos continuam valendo e têm prioridade se definidos.

const e = process.env;
const DESLIGADO = new Set(["0", "false", "nao", "não", "off", "no"]);

if (e.DONO && !e.SUPER_ADMINS) e.SUPER_ADMINS = e.DONO;
if (e.SERVIDOR && !e.CHAT_SERVIDORES) e.CHAT_SERVIDORES = e.SERVIDOR;

export function iaLigada() {
  return !DESLIGADO.has((e.IA ?? "1").trim().toLowerCase());
}

export function modoIA() {
  const m = (e.IA_MODO || "").trim().toLowerCase();
  return m === "local" || m === "online" ? m : "";
}

// Modelo padrão do modo local: pequeno o bastante para CPU, bom o bastante
// para conversar. Formato -hf do llama.cpp: usuario/repositorio:quantizacao.
export const MODELO_LOCAL_PADRAO = "bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M";

if (iaLigada()) {
  if (modoIA() === "local") {
    // O llama-server embutido (iniciar.js) escuta em 8082.
    if (!e.LLM_URL) e.LLM_URL = "http://127.0.0.1:8082";
  } else if (modoIA() === "online") {
    if (!e.LLM_URL) e.LLM_URL = "https://openrouter.ai/api";
    if (e.MODELO && !e.LLM_MODEL) e.LLM_MODEL = e.MODELO;
  }
}
