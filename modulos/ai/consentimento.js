// O consentimento para a memória da IA (privacidade, 20 out 2026).
//
// As regras do Stoat proíbem juntar dado pessoal sem consentimento de quem é
// dono dele, e as políticas novas para bots pedem opt-in. A Judy só lembra de
// quem aceitou — e pede como uma usuária pediria: na primeira conversa, depois
// de responder, pergunta se pode guardar o que a pessoa conta. A resposta é um
// "sim" ou "não" comum, no mesmo canal (com ou sem mencioná-la). Vale em todos
// os servidores. Mudar de ideia: `&privacidade memoria on|off`.

import * as db from "../core/db.js";
import { citar } from "../core/aliases.js";
import { idiomaDe } from "../core/i18n.js";

const SIM = new Set(["sim", "s", "pode", "claro", "ok", "okay", "beleza", "bora", "aceito", "quero", "pode sim", "claro que sim",
  "yes", "y", "yeah", "yep", "sure", "of course", "go ahead", "si", "sí", "vale", "dale", "por supuesto", "claro que si", "claro que sí"]);
const NAO = new Set(["não", "nao", "n", "nem", "prefiro não", "prefiro nao", "melhor não", "melhor nao", "não quero", "nao quero",
  "no", "nope", "nah", "no thanks", "no thank you", "rather not", "no gracias", "mejor no", "prefiero que no"]);

// "Sim!", "não 🙂", "<@Judy> sim" → true / false; qualquer outra coisa → null
export function lerResposta(texto) {
  const t = String(texto ?? "").replace(/<@[^>]+>/g, " ").toLowerCase()
    .replace(/[!?.,;:…"'`*_~()\[\]]/g, " ").replace(/\p{Extended_Pictographic}|️/gu, " ")
    .replace(/\s+/g, " ").trim();
  if (SIM.has(t)) return true;
  if (NAO.has(t)) return false;
  return null;
}

// Quem foi perguntado e onde: a resposta vale por 30 min, no mesmo canal.
const PRAZO_MS = 30 * 60_000;
const REPERGUNTAR_DIAS = 7;   // ficou sem responder: pergunta de novo só depois de uma semana
const pendentes = new Map();  // userId → { canalId, ate }

export function precisaPerguntar(userId, agora = Date.now()) {
  if (!userId) return false;
  const c = db.getConsentimento(userId);
  if (!c) return true;
  if (c.respondidoEm) return false;
  return !c.perguntadoEm || agora - Date.parse(c.perguntadoEm) > REPERGUNTAR_DIAS * 86_400_000;
}

export function textoPergunta(idioma, P = "&") {
  const cmd = citar("privacidade", idioma, P);
  if (idioma === "es") return `Ah, una cosa: ¿puedo guardar lo que me cuentas para acordarme de ti en las próximas conversaciones? Vale en cualquier servidor donde yo esté. Respóndeme **sí** o **no** — y puedes cambiarlo cuando quieras con \`${cmd}\`.`;
  if (idioma === "en") return `Oh, one thing: can I keep what you tell me so I remember you next time we talk? It applies on every server I'm in. Just answer **yes** or **no** — you can change it anytime with \`${cmd}\`.`;
  return `Ah, uma coisa: posso guardar o que você me conta pra lembrar de você nas próximas conversas? Vale em qualquer servidor onde eu estiver. Me responde **sim** ou **não** — e dá pra mudar quando quiser com \`${cmd}\`.`;
}

export function textoConfirmacao(idioma, aceitou, P = "&") {
  const status = `\`${citar("privacidade", idioma, P)}\``;
  const off = `\`${citar("privacidade.memoria", idioma, P)} off\``, on = `\`${citar("privacidade.memoria", idioma, P)} on\``;
  if (idioma === "es") return aceitou
    ? `¡Hecho! Me voy a acordar de ti. 😊 ${status} muestra lo que sé, y ${off} lo borra todo.`
    : `Está bien, no guardo nada. Si cambias de idea: ${on}.`;
  if (idioma === "en") return aceitou
    ? `Deal! I'll remember you. 😊 ${status} shows what I know, and ${off} erases it all.`
    : `All right, I won't keep anything. If you change your mind: ${on}.`;
  return aceitou
    ? `Combinado! Vou lembrar de você. 😊 ${status} mostra o que eu sei, e ${off} apaga tudo.`
    : `Tudo bem, não guardo nada. Se mudar de ideia: ${on}.`;
}

// Depois de responder alguém que nunca respondeu à pergunta: pergunta (uma vez).
export async function talvezPerguntar(message, ctx, agora = Date.now()) {
  const userId = message.authorId;
  if (!precisaPerguntar(userId, agora)) return false;
  db.setConsentimento(userId, { perguntado: true });
  pendentes.set(userId, { canalId: message.channelId, ate: agora + PRAZO_MS });
  try { await message.channel.sendMessage(textoPergunta(idiomaDe(ctx), ctx.PREFIXO ?? "&")); } catch {}
  return true;
}

// Um "sim"/"não" logo depois da pergunta, no mesmo canal: é a resposta.
export async function tratarResposta(message, ctx, agora = Date.now()) {
  const p = pendentes.get(message.authorId);
  if (!p) return false;
  if (p.ate < agora) { pendentes.delete(message.authorId); return false; }
  if (p.canalId !== message.channelId) return false;
  const r = lerResposta(message.content);
  if (r === null) return false;
  pendentes.delete(message.authorId);
  db.setConsentimento(message.authorId, { memoria: r, respondido: true });
  if (!r) db.apagarMemoriaDaPessoaGlobal(message.authorId);
  try { await message.channel.sendMessage(textoConfirmacao(idiomaDe(ctx), r, ctx.PREFIXO ?? "&")); } catch {}
  return true;
}
