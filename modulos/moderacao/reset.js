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
import { citar, citarInterno } from "../core/aliases.js";
import * as db from "../core/db.js";
import * as log from "../core/log.js";
import { tr } from "../core/i18n.js";

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
  const T = (pt, e, es) => tr(ctx, pt, e, es);
  const server = await Promise.resolve(ctx.getServer?.(message)).catch(() => null);
  const sid = ctx.serverId ?? server?.id;
  if (!sid) return sendEmbed(message.channel, { title: "❌", description: T("Isto só funciona dentro de um servidor.", "This only works inside a server.", "Esto solo funciona dentro de un servidor."), colour: COR.erro });
  if (!podeResetar(message, server, ctx)) {
    return sendEmbed(message.channel, { title: T("🔒 Só o dono do servidor", "🔒 Server owner only", "🔒 Solo el dueño del servidor"), colour: COR.erro,
      description: T(`O \`${citar("reset", "pt", P)}\` apaga toda a configuração da Judy neste servidor — só o **dono do servidor** (ou o dono do bot) pode usar.`,
        `\`${citar("reset", "en", P)}\` wipes all of Judy's settings on this server — only the **server owner** (or the bot owner) can use it.`,
        `\`${citar("reset", "es", P)}\` borra toda la configuración de Judy en este servidor — solo el **dueño del servidor** (o el dueño del bot) puede usarlo.`) });
  }

  const sub = String(args[0] ?? "").toLowerCase();
  const chave = `${sid}:${message.authorId}`;

  // ── desfazer ──
  if (["undo", "desfazer", "voltar", "restore", "restaurar"].includes(sub)) {
    const b = db.lerConfig(chaveBackup(sid));
    if (!b?.config || b.usado || Date.now() - (b.quando ?? 0) > DESFAZER_MS) {
      return sendEmbed(message.channel, { title: T("↩️ Nada para desfazer", "↩️ Nothing to undo", "↩️ Nada que deshacer"), colour: COR.aviso,
        description: T("Não há reset nas últimas 24 h neste servidor.", "There's no reset from the last 24 h on this server.", "No hay ningún reset en las últimas 24 h en este servidor.") });
    }
    db.gravarConfig(sid, b.config);
    store.recarregarServidor(sid);
    db.gravarConfig(chaveBackup(sid), { ...b, usado: true });
    await log.registrar({ ...ctx, config: store.configDoServidor(sid) }, "comandos", {
      titulo: "↩️ Reset desfeito", descricao: `<@${message.authorId}> desfez o reset — a configuração anterior voltou.`,
      en: { titulo: "↩️ Reset undone", descricao: `<@${message.authorId}> undid the reset — the previous configuration is back.` },
      es: { titulo: "↩️ Reset deshecho", descricao: `<@${message.authorId}> deshizo el reset — la configuración anterior ha vuelto.` } });
    const ctxDepois = { config: store.configDoServidor(sid) };
    return sendEmbed(message.channel, { title: tr(ctxDepois, "↩️ Reset desfeito", "↩️ Reset undone", "↩️ Reset deshecho"), colour: COR.sucesso,
      description: tr(ctxDepois, "A configuração anterior voltou, exatamente como estava.", "The previous configuration is back, exactly as it was.", "La configuración anterior ha vuelto, tal como estaba.") });
  }

  // ── confirmar ──
  if (["confirm", "confirmar", "sim", "yes"].includes(sub)) {
    const p = pedidos.get(chave);
    const codigo = String(args[1] ?? "").toUpperCase();
    if (!p || Date.now() > p.ate) {
      pedidos.delete(chave);
      return sendEmbed(message.channel, { title: T("⌛ Pedido vencido", "⌛ Request expired", "⌛ Solicitud vencida"), colour: COR.aviso,
        description: T(`Comece de novo com \`${citar("reset", "pt", P)}\` (o código vale 2 min).`, `Start again with \`${citar("reset", "en", P)}\` (the code is valid for 2 min).`,
          `Empieza de nuevo con \`${citar("reset", "es", P)}\` (el código vale 2 min).`) });
    }
    if (codigo !== p.codigo) {
      return sendEmbed(message.channel, { title: T("❌ Código errado", "❌ Wrong code", "❌ Código incorrecto"), colour: COR.erro,
        description: T(`Use \`${citar("reset", "pt", P)} confirm ${p.codigo}\`.`, `Use \`${citar("reset", "en", P)} confirm ${p.codigo}\`.`, `Usa \`${citar("reset", "es", P)} confirm ${p.codigo}\`.`) });
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
      titulo: "🏭 Configuração de fábrica", descricao: `<@${message.authorId}> resetou a Judy neste servidor. \`${citar("reset", "pt", P)} undo\` desfaz por 24 h.`,
      en: { titulo: "🏭 Factory settings", descricao: `<@${message.authorId}> reset Judy on this server. \`${citar("reset", "en", P)} undo\` undoes it for 24 h.` },
      es: { titulo: "🏭 Configuración de fábrica", descricao: `<@${message.authorId}> reseteó a Judy en este servidor. \`${citar("reset", "es", P)} undo\` lo deshace durante 24 h.` } });
    const ctxDepois = { config: depois };
    return sendEmbed(message.channel, { title: tr(ctxDepois, "🏭 Configuração de fábrica", "🏭 Factory settings restored", "🏭 Configuración de fábrica restaurada"), colour: COR.sucesso,
      description: tr(ctxDepois, [
        "A Judy voltou à configuração de fábrica neste servidor: automod desligado, sem canal de log, sem cargos de staff, idioma padrão (inglês).",
        "",
        `Configurar de novo: \`${citarInterno("assistente", P)}\` · Arrependeu? \`${citar("reset", "pt", P)} undo\` (em até 24 h).`,
      ], [
        "Judy is back to factory settings on this server: automod off, no log channel, no staff roles, default language (English).",
        "",
        `Set it up again: \`${citarInterno("assistente", P)}\` · Changed your mind? \`${citar("reset", "en", P)} undo\` (within 24 h).`,
      ], [
        "Judy volvió a la configuración de fábrica en este servidor: automod desactivado, sin canal de registro, sin roles de staff, idioma predeterminado (inglés).",
        "",
        `Configúrala de nuevo: \`${citar("assistente", "es", P)}\` · ¿Te arrepientes? \`${citar("reset", "es", P)} undo\` (en un plazo de 24 h).`,
      ]).join("\n") });
  }

  // ── o aviso, com o código ──
  const codigo = novoCodigo();
  pedidos.set(chave, { codigo, ate: Date.now() + CONFIRMAR_MS });
  return sendEmbed(message.channel, { title: T("🏭 Reset para a configuração de fábrica", "🏭 Reset to factory settings", "🏭 Reset a la configuración de fábrica"), colour: COR.aviso,
    description: T([
      "**Volta ao padrão:** toda a configuração da Judy neste servidor —",
      "automod (tudo desligado), punição, canal de log, boas-vindas/adeus, cargo automático, staff e acesso,",
      "comandos desativados, ajustes de XP/TTS/tickets/IA, regras e FAQ, e o idioma (inglês).",
      "",
      "**Fica:** níveis de XP, avisos, saldos, personagens do RPG, cargos por reação, webhooks,",
      "feeds RSS, tickets abertos e a lista global de bans.",
      "",
      `Para confirmar, em até 2 min: \`${citar("reset", "pt", P)} confirm ${codigo}\``,
      `_Dá para desfazer por 24 h com \`${citar("reset", "pt", P)} undo\`._`,
    ], [
      "**Goes back to default:** every setting of Judy on this server —",
      "automod (all off), punishment, log channel, welcome/goodbye, autorole, staff roles and access,",
      "disabled commands, XP/TTS/ticket/AI settings, rules and FAQ, and the language (English).",
      "",
      "**Stays:** members' XP levels, warnings, balances, RPG characters, reaction roles, webhooks,",
      "RSS feeds, open tickets and the global ban list.",
      "",
      `To confirm, within 2 min: \`${citar("reset", "en", P)} confirm ${codigo}\``,
      `_You can undo it for 24 h with \`${citar("reset", "en", P)} undo\`._`,
    ], [
      "**Vuelve a lo predeterminado:** toda la configuración de Judy en este servidor —",
      "automod (todo desactivado), castigo, canal de registro, bienvenida/despedida, rol automático, staff y acceso,",
      "comandos desactivados, ajustes de XP/TTS/tickets/IA, reglas y FAQ, y el idioma (inglés).",
      "",
      "**Se queda:** niveles de XP, avisos, saldos, personajes del RPG, roles por reacción, webhooks,",
      "feeds RSS, tickets abiertos y la lista global de bans.",
      "",
      `Para confirmar, en un plazo de 2 min: \`${citar("reset", "es", P)} confirm ${codigo}\``,
      `_Puedes deshacerlo durante 24 h con \`${citar("reset", "es", P)} undo\`._`,
    ]).join("\n") });
}

// Só para testes
export function _zerar() { pedidos.clear(); }
