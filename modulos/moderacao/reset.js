// reset.js — &reset: a Judy volta à configuração de fábrica NESTE servidor
// (13 out 2026, pedido de Ghieh).
//
// Só o DONO do servidor e o dono do bot (SUPER_ADMINS) — nem staff com
// ManageServer: é a única ação que desfaz tudo o que a staff configurou.
//
// Em três passos, para ninguém resetar sem querer:
//   1. `&reset`             → mostra o que volta ao padrão e o que fica, e um código
//   2. `&reset confirm <c>` → em até 2 min, pela MESMA pessoa: aplica
//   3. `&reset undo`        → em até 24 h: volta a configuração de antes
//
// O que volta ao padrão é a CONFIGURAÇÃO do servidor (um objeto só no banco):
// automod (tudo desligado, como servidor novo), punição, log, boas-vindas e
// adeus, cargo automático, staff e acesso, comandos desativados, ajustes do
// XP, do TTS, dos tickets, da IA, regras/FAQ e o idioma (o padrão do bot).
// Os DADOS ficam: níveis de XP, avisos, saldos, personagens do RPG, cargos por
// reação, webhooks, feeds RSS, tickets abertos e a lista global de bans —
// apagar isso não tem volta, e cada um tem o próprio comando.

import * as store from "../core/config-store.js";
import * as db from "../core/db.js";
import * as log from "../core/log.js";
import { lingua } from "../core/i18n.js";

const CONFIRMAR_MS = 2 * 60_000;
const DESFAZER_MS = 24 * 3600_000;
const pedidos = new Map();   // `${serverId}:${userId}` → { codigo, ate }
const chaveBackup = (sid) => `__reset__:${sid}`;

export function podeResetar(message, server, ctx) {
  if (ctx.ehSuperAdmin?.(message.authorId)) return true;
  return !!server?.ownerId && server.ownerId === message.authorId;
}

const novoCodigo = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export async function cmdReset(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  const en = lingua(ctx) === "en";
  const T = (pt, e) => (en ? e : pt);
  const server = await Promise.resolve(ctx.getServer?.(message)).catch(() => null);
  const sid = ctx.serverId ?? server?.id;
  if (!sid) return sendEmbed(message.channel, { title: "❌", description: T("Isto só funciona dentro de um servidor.", "This only works inside a server."), colour: COR.erro });
  if (!podeResetar(message, server, ctx)) {
    return sendEmbed(message.channel, { title: T("🔒 Só o dono do servidor", "🔒 Server owner only"), colour: COR.erro,
      description: T("O `&reset` apaga toda a configuração da Judy neste servidor — só o **dono do servidor** (ou o dono do bot) pode usar.",
        "`&reset` wipes all of Judy's settings on this server — only the **server owner** (or the bot owner) can use it.") });
  }

  const sub = String(args[0] ?? "").toLowerCase();
  const chave = `${sid}:${message.authorId}`;

  // ── desfazer ──
  if (["undo", "desfazer", "voltar", "restore", "restaurar"].includes(sub)) {
    const b = db.lerConfig(chaveBackup(sid));
    if (!b?.config || b.usado || Date.now() - (b.quando ?? 0) > DESFAZER_MS) {
      return sendEmbed(message.channel, { title: T("↩️ Nada para desfazer", "↩️ Nothing to undo"), colour: COR.aviso,
        description: T("Não há reset nas últimas 24 h neste servidor.", "There's no reset from the last 24 h on this server.") });
    }
    db.gravarConfig(sid, b.config);
    store.recarregarServidor(sid);
    db.gravarConfig(chaveBackup(sid), { ...b, usado: true });
    await log.registrar({ ...ctx, config: store.configDoServidor(sid) }, "comandos", {
      titulo: "↩️ Reset desfeito", descricao: `<@${message.authorId}> desfez o reset — a configuração anterior voltou.` });
    const enDepois = store.configDoServidor(sid).language === "en";
    return sendEmbed(message.channel, { title: enDepois ? "↩️ Reset undone" : "↩️ Reset desfeito", colour: COR.sucesso,
      description: enDepois ? "The previous configuration is back, exactly as it was." : "A configuração anterior voltou, exatamente como estava." });
  }

  // ── confirmar ──
  if (["confirm", "confirmar", "sim", "yes"].includes(sub)) {
    const p = pedidos.get(chave);
    const codigo = String(args[1] ?? "").toUpperCase();
    if (!p || Date.now() > p.ate) {
      pedidos.delete(chave);
      return sendEmbed(message.channel, { title: T("⌛ Pedido vencido", "⌛ Request expired"), colour: COR.aviso,
        description: T(`Comece de novo com \`${P}reset\` (o código vale 2 min).`, `Start again with \`${P}reset\` (the code is valid for 2 min).`) });
    }
    if (codigo !== p.codigo) {
      return sendEmbed(message.channel, { title: T("❌ Código errado", "❌ Wrong code"), colour: COR.erro,
        description: T(`Use \`${P}reset confirm ${p.codigo}\`.`, `Use \`${P}reset confirm ${p.codigo}\`.`) });
    }
    pedidos.delete(chave);
    const antes = structuredClone(store.configDoServidor(sid));
    db.gravarConfig(chaveBackup(sid), { quando: Date.now(), por: message.authorId, config: antes });
    db.gravarConfig(sid, store.configDeFabrica());
    store.recarregarServidor(sid);
    const depois = store.configDoServidor(sid);
    console.log(`[RESET] servidor ${sid} voltou à configuração de fábrica (por ${message.authorId})`);
    // o log de antes ainda recebe o aviso (o canal de log também foi zerado)
    await log.registrar({ ...ctx, config: antes }, "comandos", {
      titulo: "🏭 Configuração de fábrica", descricao: `<@${message.authorId}> resetou a Judy neste servidor. \`${P}reset undo\` desfaz por 24 h.` });
    const enDepois = depois.language === "en";
    return sendEmbed(message.channel, { title: enDepois ? "🏭 Factory settings restored" : "🏭 Configuração de fábrica", colour: COR.sucesso,
      description: (enDepois ? [
        "Judy is back to factory settings on this server: automod off, no log channel, no staff roles, default language (English).",
        "",
        `Set it up again: \`${P}wizard\` · Changed your mind? \`${P}reset undo\` (within 24 h).`,
      ] : [
        "A Judy voltou à configuração de fábrica neste servidor: automod desligado, sem canal de log, sem cargos de staff, idioma padrão (inglês).",
        "",
        `Configurar de novo: \`${P}assistente\` · Arrependeu? \`${P}reset undo\` (em até 24 h).`,
      ]).join("\n") });
  }

  // ── o aviso, com o código ──
  const codigo = novoCodigo();
  pedidos.set(chave, { codigo, ate: Date.now() + CONFIRMAR_MS });
  return sendEmbed(message.channel, { title: T("🏭 Reset para a configuração de fábrica", "🏭 Reset to factory settings"), colour: COR.aviso,
    description: (en ? [
      "**Goes back to default:** every setting of Judy on this server —",
      "automod (all off), punishment, log channel, welcome/goodbye, autorole, staff roles and access,",
      "disabled commands, XP/TTS/ticket/AI settings, rules and FAQ, and the language (English).",
      "",
      "**Stays:** members' XP levels, warnings, balances, RPG characters, reaction roles, webhooks,",
      "RSS feeds, open tickets and the global ban list.",
      "",
      `To confirm, within 2 min: \`${P}reset confirm ${codigo}\``,
      `_You can undo it for 24 h with \`${P}reset undo\`._`,
    ] : [
      "**Volta ao padrão:** toda a configuração da Judy neste servidor —",
      "automod (tudo desligado), punição, canal de log, boas-vindas/adeus, cargo automático, staff e acesso,",
      "comandos desativados, ajustes de XP/TTS/tickets/IA, regras e FAQ, e o idioma (inglês).",
      "",
      "**Fica:** níveis de XP, avisos, saldos, personagens do RPG, cargos por reação, webhooks,",
      "feeds RSS, tickets abertos e a lista global de bans.",
      "",
      `Para confirmar, em até 2 min: \`${P}reset confirm ${codigo}\``,
      `_Dá para desfazer por 24 h com \`${P}reset undo\`._`,
    ]).join("\n") });
}

// Só para testes
export function _zerar() { pedidos.clear(); }
