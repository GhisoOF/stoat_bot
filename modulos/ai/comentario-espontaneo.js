
const COOLDOWN_MS = Number(process.env.COMENTARIO_COOLDOWN_MS || 45 * 60 * 1000); // 45 min
const CHANCE      = Number(process.env.COMENTARIO_CHANCE || 0.25);   // 25% quando elegível
const JANELA_MSGS = 12;    // quantas mensagens recentes considerar como contexto
const log = (...a) => { if (process.env.CHAT_DEBUG) console.log("[COMENTARIO]", ...a); };

// Estado por canal: buffer de mensagens recentes + contadores dos freios.
const estado = new Map();

function estadoDe(canalId) {
  let e = estado.get(canalId);
  if (!e) { e = { msgs: [], ultimoComentario: 0, hojeData: "", hojeContagem: 0, msgsDesdeComentario: 0 }; estado.set(canalId, e); }
  return e;
}

const hoje = () => new Date().toISOString().slice(0, 10);

// Injeção: o bot passa como gerar o comentário (usa o pipeline do chat).
let gerarComentario = null;   // (contexto:string) => Promise<string>
let enviarNoCanal = null;     // (canalId, texto) => Promise<void>
export function configurar({ gerar, enviar }) { gerarComentario = gerar; enviarNoCanal = enviar; }

export async function observar(message, ctx) {
  try {
    const cfg = ctx?.config?.comentarioEspontaneo;
    if (!cfg?.canalId) return;                        // desligado
    if (message.channelId !== cfg.canalId) return;    // canal errado
    if (!gerarComentario || !enviarNoCanal) return;

    const texto = (message.content || "").trim();
    if (!texto) return;

    const e = estadoDe(cfg.canalId);
    e.msgs.push({ nome: message.author?.username ?? "alguém", texto });
    if (e.msgs.length > JANELA_MSGS) e.msgs.shift();
    e.msgsDesdeComentario++;

    // ── FREIOS ──
    const agora = Date.now();
    // reseta contador diário
    if (e.hojeData !== hoje()) { e.hojeData = hoje(); e.hojeContagem = 0; }

    const porDia = cfg.porDia ?? 4;
    const minMsgs = cfg.minParaFalar ?? 4;

    if (e.hojeContagem >= porDia) return;                       // teto diário
    if (agora - e.ultimoComentario < COOLDOWN_MS) return;       // cooldown
    if (e.msgsDesdeComentario < minMsgs) return;                // precisa de conversa nova desde o último
    if (e.msgs.length < minMsgs) return;                        // pouca conversa acumulada
    if (Math.random() > CHANCE) return;                         // chance baixa (não é toda janela)

    // ── Elegível: gera o comentário sobre a conversa recente ──
    const contexto = e.msgs.map((m) => `${m.nome}: ${m.texto}`).join("\n");
    let comentario;
    const sid = message.serverId ?? message.server?.id ?? null;
    try { comentario = await gerarComentario(contexto, sid); }
    catch (err) { log("geração falhou:", err.message); return; }

    if (!comentario || !comentario.trim()) return;

    // marca os freios ANTES de enviar (evita corrida)
    e.ultimoComentario = agora;
    e.hojeContagem++;
    e.msgsDesdeComentario = 0;

    try {
      await enviarNoCanal(cfg.canalId, comentario.trim());
      log(`comentou em ${cfg.canalId} (${e.hojeContagem}/${porDia} hoje)`);
    } catch (err) { log("envio falhou:", err.message); }
  } catch (e) {
    log("erro:", e.message);
  }
}
