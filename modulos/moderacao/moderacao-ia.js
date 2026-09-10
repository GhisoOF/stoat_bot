
import * as db from "../core/db.js";
import * as log from "../core/log.js";

const CRIADOR_ID = process.env.SUPER_ADMINS?.split(",")[0]?.trim() || "";
const MIN_CHARS  = Number(process.env.MODIA_MIN_CHARS || 3);
const dlog = (...a) => { if (process.env.CHAT_DEBUG) console.log("[MOD-IA]", ...a); };

// Injeção do LLM (o bot passa uma função que chama o modelo pequeno em JSON).
let avaliarLLM = null;
export function configurar({ avaliar }) { avaliarLLM = avaliar; }

function ativaAqui(cfg, canalId) {
  const m = cfg?.moderacaoIA;
  if (!m?.ativa || !m.criterios?.trim()) return false;
  if (Array.isArray(m.canais) && m.canais.length && !m.canais.includes(canalId)) return false;
  return true;
}

const PROMPT = (criterios) => `Você é um moderador. Avalie se a MENSAGEM viola algum destes critérios definidos pelo dono do servidor:

<criterios>
${criterios}
</criterios>

Responda SÓ um JSON: {"viola": true|false, "motivo": "curto, qual critério e por quê"}
- "viola": true apenas se a mensagem claramente bate um dos critérios acima.
- Na dúvida, ou se for conversa normal, responda {"viola": false}.
- Não invente critérios que não estão na lista. Seja conservador: é melhor deixar passar do que apagar à toa.`;

// Avalia uma mensagem. Retorna {viola, motivo} ou null (não avaliou/erro).
async function avaliar(cfg, texto) {
  if (!avaliarLLM) return null;
  const criterios = cfg.moderacaoIA.criterios.trim();
  try {
    const raw = await avaliarLLM([
      { role: "system", content: PROMPT(criterios) },
      { role: "user", content: texto.slice(0, 800) },
    ]);
    const obj = JSON.parse(String(raw).replace(/```json|```/g, "").trim());
    return { viola: !!obj.viola, motivo: String(obj.motivo || "").slice(0, 200) };
  } catch (e) {
    dlog("avaliação falhou (fail-safe: não faz nada):", e.message);
    return null;   // fail-safe: erro nunca vira punição
  }
}

export async function moderar(message, ctx) {
  const cfg = ctx?.config;
  const canalId = message.channelId;
  if (!ativaAqui(cfg, canalId)) return false;

  const autorId = message.authorId;
  if (autorId === CRIADOR_ID) return false;          // criador é imune

  const texto = (message.content || "").trim();
  if (texto.length < MIN_CHARS) return false;

  const veredito = await avaliar(cfg, texto);
  if (!veredito || !veredito.viola) return false;

  // ── APAGA ──
  let apagou = false;
  try { await message.delete(); apagou = true; }
  catch (e) { dlog("falha ao apagar:", e.message); }

  // ── Marca o criador no log com as opções ──
  const nome = message.author?.username ?? autorId;
  const trecho = texto.length > 300 ? texto.slice(0, 300) + "…" : texto;
  const descricao = [
    `<@${CRIADOR_ID}> — a Judy sinalizou uma mensagem por critério de moderação.`,
    "",
    `**Autor:** ${nome} (\`${autorId}\`)`,
    `**Canal:** <#${canalId}>`,
    `**Motivo:** ${veredito.motivo || "(sem detalhe)"}`,
    `**Ação tomada:** ${apagou ? "mensagem apagada" : "⚠️ não consegui apagar (falta permissão?)"}`,
    "",
    "**Conteúdo removido:**",
    `> ${trecho.replace(/\n/g, "\n> ")}`,
    "",
    "**O que você pode fazer** (copie o comando):",
    "• Ignorar — não faça nada.",
    `• Avisar — \`&warn ${autorId} <motivo>\``,
    `• Silenciar — \`&silence ${autorId} <tempo>\``,
    `• Banir — \`&ban ${autorId} <motivo>\``,
  ].join("\n");

  try {
    await log.registrar(ctx, "punicoes", { titulo: "🤖 Moderação por IA — sinalizado", descricao });
  } catch (e) { dlog("falha ao logar:", e.message); }

  dlog(`sinalizou msg de ${nome}: ${veredito.motivo}`);
  return apagou;
}
