// ══════════════════════════════════════════════════════════
//  memoria-agente.js — agente de memória de longo prazo
//
//  Observa o chat e extrai FATOS para a Judy lembrar depois:
//   • sobre PESSOAS (gostos, quem é, contexto)
//   • sobre o SERVIDOR (piadas internas, eventos, combinados)
//
//  Roda em BACKGROUND (não trava a mensagem) e usa o modelo
//  PEQUENO (decisão) — barato e rápido. Um DEBOUNCE por usuário
//  agrupa rajadas de mensagens numa extração só, para não fritar
//  a GPU quando alguém manda várias linhas seguidas.
//
//  Os fatos vão para ia_fatos_pessoa / ia_fatos_servidor, com
//  nível de confiança: fato repetido sobe, fato isolado fica baixo.
// ══════════════════════════════════════════════════════════

import * as db from "../core/db.js";

const DEBOUNCE_MS   = Number(process.env.MEMORIA_DEBOUNCE_MS || 8000);
const MIN_CHARS     = Number(process.env.MEMORIA_MIN_CHARS || 12);   // ignora "kkk", "oi"
const MAX_LOTE      = Number(process.env.MEMORIA_MAX_LOTE || 10);    // msgs por extração
const LIGADO        = process.env.MEMORIA_AGENTE !== "off";

const log = (...a) => { if (process.env.CHAT_DEBUG) console.log("[MEMÓRIA]", ...a); };

// Buffer por (servidor+usuário): acumula mensagens até o debounce disparar.
const buffers = new Map();   // chave → { msgs:[], timer, nome, canal }
const chave = (serverId, userId) => `${serverId}:${userId}`;

// Injeção de dependência: o bot passa como chamar o LLM (reusa o pipeline dele).
let chamarLLM = null;
export function configurar({ chamarModelo }) { chamarLLM = chamarModelo; }

// Chamado pelo bot a cada mensagem "normal" (não-comando) do chat.
export function observar({ serverId, userId, nome, texto, ehBot }) {
  if (!LIGADO || ehBot || !chamarLLM) return;
  if (!serverId || !userId) return;
  const t = String(texto || "").trim();
  if (t.length < MIN_CHARS) return;   // muito curto p/ conter fato

  const k = chave(serverId, userId);
  let buf = buffers.get(k);
  if (!buf) { buf = { msgs: [], timer: null, nome, serverId, userId }; buffers.set(k, buf); }
  buf.nome = nome || buf.nome;
  buf.msgs.push(t);
  if (buf.msgs.length > MAX_LOTE) buf.msgs.shift();

  // reinicia o debounce: só extrai quando a pessoa "parar" de escrever
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => { processar(k).catch((e) => log("erro:", e.message)); }, DEBOUNCE_MS);
}

const PROMPT_EXTRACAO = `Você extrai fatos duráveis de mensagens de chat para a memória de um bot.
Leia as mensagens de UM usuário e devolva SÓ um JSON:
{"pessoa": ["fato curto", ...], "servidor": ["fato curto", ...]}

REGRAS:
- "pessoa": fatos sobre QUEM ESCREVEU (gostos, profissão, onde mora, o que faz, preferências). Frases curtas em 3ª pessoa: "gosta de X", "trabalha com Y", "mora em Z".
- "servidor": fatos gerais úteis à comunidade (piadas internas, eventos combinados, apelidos, regras informais). NÃO sobre a pessoa.
- Só fatos DURÁVEIS. Ignore conversa passageira, saudações, reações, o clima do momento.
- Se não houver nada que valha lembrar, devolva {"pessoa": [], "servidor": []}.
- Máximo 3 fatos por categoria. Em português. Nada além do JSON.`;

async function processar(k) {
  const buf = buffers.get(k);
  if (!buf || !buf.msgs.length) return;
  buffers.delete(k);

  const { serverId, userId, nome, msgs } = buf;
  const conteudo = `Usuário: ${nome || userId}\nMensagens:\n${msgs.map((m) => `- ${m}`).join("\n")}`;

  let raw;
  try {
    raw = await chamarLLM([
      { role: "system", content: PROMPT_EXTRACAO },
      { role: "user", content: conteudo },
    ]);
  } catch (e) { log("LLM falhou:", e.message); return; }

  let obj;
  try {
    const limpo = String(raw).replace(/```json|```/g, "").trim();
    obj = JSON.parse(limpo);
  } catch { log("JSON inválido do extrator; ignorando"); return; }

  const pessoa = Array.isArray(obj?.pessoa) ? obj.pessoa : [];
  const servidor = Array.isArray(obj?.servidor) ? obj.servidor : [];

  for (const f of pessoa.slice(0, 3)) {
    if (typeof f === "string" && f.trim()) db.addFatoPessoa(serverId, userId, f.trim());
  }
  for (const f of servidor.slice(0, 3)) {
    if (typeof f === "string" && f.trim()) db.addFatoServidor(serverId, f.trim());
  }
  if (pessoa.length || servidor.length) {
    log(`extraiu p/ ${nome}: ${pessoa.length} pessoais, ${servidor.length} de servidor`);
  }
}

// Monta o bloco de memória para injetar no prompt da Judy ao conversar.
export function contextoMemoria(serverId, userId) {
  if (!serverId) return "";
  const pessoa = db.getFatosPessoa(serverId, userId, { limite: 10, minConf: 0.4 });
  const servidor = db.getFatosServidor(serverId, { limite: 12, minConf: 0.45 });
  if (!pessoa.length && !servidor.length) return "";

  const linhas = [];
  if (pessoa.length) {
    linhas.push("Sobre esta pessoa (do que você já observou):");
    for (const f of pessoa) linhas.push(`- ${f.fato}`);
  }
  if (servidor.length) {
    linhas.push("Sobre este servidor:");
    for (const f of servidor) linhas.push(`- ${f.fato}`);
  }
  linhas.push("(Use isso com naturalidade; não recite. Pode estar desatualizado.)");
  return linhas.join("\n");
}

// Para o &chat esquecer: apaga os fatos daquela pessoa.
export function esquecerPessoa(serverId, userId) {
  return db.limparFatosPessoa(serverId, userId);
}
