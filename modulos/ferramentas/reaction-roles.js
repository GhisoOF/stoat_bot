// ══════════════════════════════════════════════════════════
//  reaction-roles.js — emoji numa mensagem dá/tira um cargo
//
//  &reactionrole add <idMensagem> <emoji> <idCargo>
//        → o bot reage na mensagem; quem clicar ganha o cargo
//  &reactionrole remove <idMensagem>
//        → remove todos os vínculos daquela mensagem
//  &reactionrole list
//        → lista os vínculos do servidor
//
//  Alias: &rr
//  Exige ManageRole (para o bot poder atribuir cargos).
// ══════════════════════════════════════════════════════════

import * as db  from "../core/db.js";
import * as log from "../core/log.js";
import { idValido, descreverProblemaDeId, resolverMensagem, resolverCargo } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// Reexporta o resolvedor central, para quem já importava daqui.
export { resolverMensagem as extrairIdMensagem } from "../core/ids.js";

// Normaliza emoji recebido (pode vir URL-encoded / com seletor de variação)
export function normalizarEmoji(e) {
  if (!e) return "";
  let v = e;
  try { v = decodeURIComponent(e); } catch {}
  return v.replace(/\uFE0F/g, "");   // remove o "variation selector"
}

// ──────────────────────────────────────────────────────────
//  Handler: chamado no messageReactionAdd
//  Dá o cargo se a (mensagem, emoji) estiver registrada.
// ──────────────────────────────────────────────────────────
// A lib às vezes lança OBJETOS (resposta HTTP), não Error — aí `err.message`
// é undefined e o log fica inútil ("[REACTIONROLE] undefined"). Isto extrai
// alguma coisa legível de qualquer formato.
function descreverErro(e) {
  if (!e) return "erro desconhecido";
  if (typeof e === "string") return e;
  const partes = [];
  if (e.message) partes.push(e.message);
  if (e.type) partes.push(`type=${e.type}`);
  if (e.error) partes.push(`error=${typeof e.error === "string" ? e.error : JSON.stringify(e.error)}`);
  if (e.status ?? e.statusCode) partes.push(`status=${e.status ?? e.statusCode}`);
  if (e.response?.status) partes.push(`http=${e.response.status}`);
  if (e.permission) partes.push(`permissão=${e.permission}`);
  if (!partes.length) {
    try { partes.push(JSON.stringify(e).slice(0, 300)); } catch { partes.push(String(e)); }
  }
  return partes.join(" | ");
}

export async function aoReagir(message, userId, emoji, ctx) {
  try {
    const messageId = message?.id ?? message?._id;
    if (!messageId || !userId) return false;
    if (userId === ctx.client.user?.id) return false;   // ignora o próprio bot

    const alvo = db.getReactionRole(messageId, normalizarEmoji(emoji));
    if (!alvo) return false;

    const serverId = alvo.serverId;
    const server = await ctx.client.servers.fetch(serverId).catch((e) => {
      console.error(`[REACTIONROLE] não consegui carregar o servidor ${serverId}:`, descreverErro(e)); return null;
    });
    if (!server) return false;
    const member = await server.fetchMember(userId).catch((e) => {
      console.error(`[REACTIONROLE] não consegui carregar o membro ${userId}:`, descreverErro(e)); return null;
    });
    if (!member) { console.log(`[REACTIONROLE] membro ${userId} não encontrado no servidor`); return false; }

    const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    if (atuais.includes(alvo.roleId)) return false;  // já tem o cargo

    // MODO EXCLUSIVO: escolher um emoji desta mensagem TROCA o cargo anterior
    // (para "escolha sua cor"), em vez de acumular ("escolha seus interesses").
    let removidos = [];
    let novos = atuais;
    if (db.isReactionRoleExclusivo(messageId)) {
      const daMensagem = db.listReactionRoles(messageId)
        .map((r) => r.roleId)
        .filter((id) => id !== alvo.roleId);
      removidos = atuais.filter((id) => daMensagem.includes(id));
      novos = atuais.filter((id) => !daMensagem.includes(id));
    }
    novos = [...novos, alvo.roleId];
    try {
      await member.edit({ roles: novos });
    } catch (e) {
      console.error(`[REACTIONROLE] ❌ falhei ao dar o cargo ${alvo.roleId} para ${userId}: ${descreverErro(e)}`);
      console.error("[REACTIONROLE]    → confira: o bot tem **AssignRoles**? o cargo dele está ACIMA de <@&" + alvo.roleId + "> na lista de cargos?");
      return false;
    }

    // Tira as reações antigas da pessoa, para o painel refletir a escolha.
    // Se a lib/permissão não permitir, o cargo já foi trocado — não é crítico.
    if (removidos.length) {
      try {
        const paraTirar = db.listReactionRoles(messageId)
          .filter((r) => removidos.includes(r.roleId))
          .map((r) => r.emoji);
        for (const e of paraTirar) {
          await message.unreact?.(encodeURIComponent(e), userId).catch(() => {});
        }
      } catch (e) { console.log("[REACTIONROLE] não consegui limpar as reações antigas:", e?.message); }
    }

    console.log(`[REACTIONROLE] +cargo ${alvo.roleId} para ${userId} (msg ${messageId})${removidos.length ? ` | trocou ${removidos.length} cargo(s)` : ""}`);
    const rctx = { ...ctx, serverId, config: ctx.configDoServidor?.(serverId) ?? ctx.config };
    await log.registrar(rctx, "cargos", {
      titulo: "🎭 Cargo por reação",
      descricao: `<@${userId}> recebeu o cargo \`${alvo.roleId}\` ao reagir.`
        + (removidos.length ? `\n_Modo exclusivo: perdeu ${removidos.map((r) => `\`${r}\``).join(", ")}._` : ""),
    });
    return true;
  } catch (err) {
    console.error("[REACTIONROLE] erro inesperado:", descreverErro(err));
    if (err?.stack) console.error(err.stack.split("\n").slice(0, 3).join("\n"));
    return false;
  }
}

// Chamado quando alguém TIRA a reação: remove o cargo correspondente.
export async function aoDesreagir(message, userId, emoji, ctx) {
  try {
    const messageId = message?.id ?? message?._id;
    if (!messageId || !userId) return false;
    if (userId === ctx.client?.user?.id) return false;

    const alvo = db.getReactionRole(messageId, normalizarEmoji(emoji));
    if (!alvo) return false;

    const server = await ctx.client.servers.fetch(alvo.serverId).catch(() => null);
    if (!server) return false;
    const member = await server.fetchMember(userId).catch(() => null);
    if (!member) return false;

    const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    if (!atuais.includes(alvo.roleId)) return false;   // já não tem
    try {
      await member.edit({ roles: atuais.filter((id) => id !== alvo.roleId) });
    } catch (e) {
      console.error(`[REACTIONROLE] ❌ falhei ao remover o cargo ${alvo.roleId} de ${userId}: ${descreverErro(e)}`);
      return false;
    }
    console.log(`[REACTIONROLE] -cargo ${alvo.roleId} de ${userId} (msg ${messageId})`);
    const rctx = { ...ctx, serverId: alvo.serverId, config: ctx.configDoServidor?.(alvo.serverId) ?? ctx.config };
    await log.registrar(rctx, "cargos", {
      titulo: "🎭 Cargo por reação",
      descricao: `<@${userId}> perdeu o cargo \`${alvo.roleId}\` ao tirar a reação.`,
    });
    return true;
  } catch (err) {
    console.error("[REACTIONROLE][desreagir]", descreverErro(err));
    return false;
  }
}

// ──────────────────────────────────────────────────────────
//  Pré-carga no boot
//
//  Sintoma clássico: "funcionava, o bot reiniciou, parou de entregar
//  cargos — mas os emojis continuam lá". A causa é que a lib só emite
//  o evento de reação para mensagens que ela conhece; depois de um
//  restart, as mensagens antigas não estão em cache e a reação passa
//  em branco.
//
//  Aqui buscamos cada mensagem com reaction role uma vez, no boot,
//  para que voltem ao cache. Quando o canal não está gravado (regras
//  antigas), procuramos nos canais do servidor e gravamos para a
//  próxima vez.
// ──────────────────────────────────────────────────────────
export async function precarregarMensagens(client) {
  let ok = 0, perdidas = 0;
  const registros = db.mensagensComReactionRole();
  if (!registros.length) return { ok, perdidas, total: 0 };

  for (const reg of registros) {
    let msg = null;
    try {
      if (reg.channelId) {
        const canal = client.channels.get(reg.channelId)
          ?? await client.channels.fetch(reg.channelId).catch(() => null);
        if (canal) msg = await canal.fetchMessage(reg.messageId).catch(() => null);
      }
      if (!msg && reg.serverId) {
        // sem canal gravado: procura e memoriza para não repetir a busca
        const server = await client.servers.fetch(reg.serverId).catch(() => null);
        for (const ch of server?.channels ?? []) {
          const canal = typeof ch === "string"
            ? (client.channels.get(ch) ?? await client.channels.fetch(ch).catch(() => null))
            : ch;
          if (!canal?.fetchMessage) continue;
          msg = await canal.fetchMessage(reg.messageId).catch(() => null);
          if (msg) { db.setReactionRoleCanal(reg.messageId, canal.id ?? canal._id); break; }
        }
      }
    } catch (e) {
      console.error(`[REACTIONROLE][boot] ${reg.messageId}:`, e?.message);
    }
    if (msg) ok++; else { perdidas++; console.log(`[REACTIONROLE][boot] não achei a mensagem ${reg.messageId} (canal apagado ou sem acesso?)`); }
  }
  console.log(`[REACTIONROLE] ${ok} mensagem(ns) recarregada(s)${perdidas ? `, ${perdidas} não encontrada(s)` : ""}`);
  return { ok, perdidas, total: registros.length };
}

// ──────────────────────────────────────────────────────────
//  Comando &reactionrole
// ──────────────────────────────────────────────────────────
export async function cmdReactionRole(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId, client } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageRole")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageRole** para configurar cargos por reação.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageRole** to configure reaction roles.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();

  // ── list ──
  if (sub === "list" || sub === "lista") {
    const linhas = db.listReactionRolesServidor(serverId);
    if (!linhas.length)
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Cargos por reação", description: "_Nenhum configurado neste servidor._", colour: COR.mod },
        { title: "🎭 Reaction roles", description: "_None configured on this server._", colour: COR.mod }));
    const porMsg = {};
    for (const l of linhas) (porMsg[l.messageId] ??= []).push(`${l.emoji} → \`${l.roleId}\``);
    return sendEmbed(message.channel, {
      title: en ? "🎭 Reaction roles" : "🎭 Cargos por reação",
      description: Object.entries(porMsg)
        .map(([mid, arr]) => {
          const modo = db.isReactionRoleExclusivo(mid)
            ? (en ? " — 🎯 _exclusive (swaps the role)_" : " — 🎯 _exclusivo (troca o cargo)_") : "";
          return (en ? `**Message \`${mid}\`**` : `**Mensagem \`${mid}\`**`) + `${modo}\n${arr.join("\n")}`;
        }).join("\n\n")
        + (en
          ? `\n\n_Use \`${PREFIXO}reactionrole exclusivo <message> on\` so that picking one swaps the previous role._`
          : `\n\n_Use \`${PREFIXO}reactionrole exclusivo <mensagem> on\` para que a escolha troque o cargo anterior._`),
      colour: COR.mod,
    });
  }

  // ── exclusivo <mensagem> on|off ──
  if (["exclusivo", "exclusive", "unico", "único"].includes(sub)) {
    const mid = resolverMensagem(args[1]).id;
    if (!mid) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: [
          `\`${PREFIXO}reactionrole exclusivo <mensagem> on|off\``,
          "",
          "**on** — escolher um emoji **troca** o cargo anterior (ex.: escolha sua cor)",
          "**off** — os cargos **acumulam** (ex.: escolha seus interesses)",
          "",
          "A mensagem pode ser o **ID** ou o **link**.",
        ].join("\n"), colour: COR.erro,
      }, {
        title: "❌ Wrong usage",
        description: [
          `\`${PREFIXO}reactionrole exclusivo <message> on|off\``,
          "",
          "**on** — picking an emoji **swaps** the previous role (e.g. pick your color)",
          "**off** — roles **stack** (e.g. pick your interests)",
          "",
          "The message can be its **ID** or its **link**.",
        ].join("\n"), colour: COR.erro,
      }));
    }
    const regras = db.listReactionRoles(mid);
    if (!regras.length) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Sem regras nessa mensagem",
        description: `Não há cargos por reação registrados em \`${mid}\`. Adicione com \`${PREFIXO}reactionrole add\` primeiro.`,
        colour: COR.erro,
      }, {
        title: "❌ No rules on that message",
        description: `There are no reaction roles registered on \`${mid}\`. Add one with \`${PREFIXO}reactionrole add\` first.`,
        colour: COR.erro,
      }));
    }
    const estado = (args[2] ?? "on").toLowerCase();
    const ligar = !["off", "nao", "não", "0"].includes(estado);
    db.setReactionRoleExclusivo(mid, ligar);
    return sendEmbed(message.channel, en ? {
      title: ligar ? "🎯 Exclusive mode on" : "➕ Stacking mode",
      description: ligar
        ? `On that message (**${regras.length}** options), picking an emoji **removes** the previously chosen role. Good for color, age, team — things where only one applies.`
        : `On that message, a person can hold **several** roles at once.`,
      colour: COR.sucesso,
    } : {
      title: ligar ? "🎯 Modo exclusivo ligado" : "➕ Modo acumulativo",
      description: ligar
        ? `Nessa mensagem (**${regras.length}** opções), escolher um emoji **remove** o cargo escolhido antes. Bom para cor, idade, time — coisas em que só uma vale.`
        : `Nessa mensagem, a pessoa pode ter **vários** cargos ao mesmo tempo.`,
      colour: COR.sucesso });
  }

  // ── recarregar: força a re-leitura das mensagens (diagnóstico) ──
  if (["recarregar", "reload", "reparar"].includes(sub)) {
    await sendEmbed(message.channel, tr(ctx,
      { title: "🔄 Recarregando…",
        description: "Buscando as mensagens de cargos por reação para voltarem ao cache.", colour: COR.info },
      { title: "🔄 Reloading…",
        description: "Fetching the reaction-role messages so they return to the cache.", colour: COR.info }));
    const r = await precarregarMensagens(client);
    return sendEmbed(message.channel, en ? {
      title: r.perdidas ? "⚠️ Reloaded with issues" : "✅ Reloaded",
      description: [
        `**${r.ok}** of **${r.total}** message(s) returned to the cache.`,
        r.perdidas ? `**${r.perdidas}** weren't found — the channel may have been deleted, or the bot lacks \`ViewChannel\`/\`ReadMessageHistory\`.` : "",
        "",
        "_This runs automatically on every bot restart._",
      ].filter(Boolean).join("\n"),
      colour: r.perdidas ? COR.aviso : COR.sucesso,
    } : {
      title: r.perdidas ? "⚠️ Recarregado com pendências" : "✅ Recarregado",
      description: [
        `**${r.ok}** de **${r.total}** mensagem(ns) voltaram ao cache.`,
        r.perdidas ? `**${r.perdidas}** não foram encontradas — o canal pode ter sido apagado, ou falta \`ViewChannel\`/\`ReadMessageHistory\` para o bot.` : "",
        "",
        "_Isso é feito sozinho a cada reinício do bot._",
      ].filter(Boolean).join("\n"),
      colour: r.perdidas ? COR.aviso : COR.sucesso });
  }

  if (sub === "remove" || sub === "remover") {
    const mid = resolverMensagem(args[1]).id;
    if (!mid)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto",
          description: `\`${PREFIXO}reactionrole remove <mensagem>\`\n\nAceito o **ID** ou o **link** da mensagem.`, colour: COR.erro },
        { title: "❌ Wrong usage",
          description: `\`${PREFIXO}reactionrole remove <message>\`\n\nI accept the message's **ID** or **link**.`, colour: COR.erro }));
    const n = db.removeReactionRolesMensagem(mid);
    return sendEmbed(message.channel, en ? {
      title: "🎭 Removed",
      description: n ? `Removed **${n}** link(s) from message \`${mid}\`.` : "Nothing found for that message.",
      colour: COR.sucesso,
    } : {
      title: "🎭 Removido",
      description: n ? `Removidos **${n}** vínculo(s) da mensagem \`${mid}\`.` : "Nada encontrado para essa mensagem.",
      colour: COR.sucesso });
  }

  // ── add <idMensagem|link> <emoji> <idCargo> ──
  if (sub === "add" || sub === "adicionar") {
    const ref   = resolverMensagem(args[1]);
    const mid   = ref.id;
    const emoji = normalizarEmoji(args[2]);
    const role  = idValido(args[3]);

    if (!mid || !emoji || !role) {
      // aponta exatamente o que está errado, em vez de repetir a sintaxe seca
      const problemas = [];
      if (!mid) {
        problemas.push(en
          ? (ref.canalId
            ? "• the link points to the **channel**, not to a message — open the message's `...` menu and use *Copy link*"
            : "• I couldn't find the **message ID** (I accept the raw ID or the message's **link**)")
          : (ref.canalId
            ? "• o link aponta para o **canal**, não para uma mensagem — abra o menu \`...\` da mensagem e use *Copiar link*"
            : "• não achei o **ID da mensagem** (aceito o ID puro ou o **link** da mensagem)"));
      }
      if (!emoji) problemas.push(en ? "• the **emoji** is missing" : "• faltou o **emoji**");
      if (!role) problemas.push(en
        ? `• the **role**: ${descreverProblemaDeId(args[3], "cargo")} — mention the role or paste its ID (Settings → Roles → *Copy role ID*)`
        : `• o **cargo**: ${descreverProblemaDeId(args[3], "cargo")} — mencione o cargo ou cole o ID (Configurações → Cargos → *Copy role ID*)`);

      return sendEmbed(message.channel, en ? {
        title: "❌ Wrong usage",
        description: [
          `\`${PREFIXO}reactionrole add <message> <emoji> <roleId>\``,
          "",
          problemas.join("\n"),
          "",
          "**The message** can be the ID **or the link** — both work:",
          "```",
          `${PREFIXO}reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
          `${PREFIXO}reactionrole add 01ABC... 🎮 01XYZ...`,
          "```",
        ].join("\n"), colour: COR.erro,
      } : {
        title: "❌ Uso incorreto",
        description: [
          `\`${PREFIXO}reactionrole add <mensagem> <emoji> <idCargo>\``,
          "",
          problemas.join("\n"),
          "",
          "**A mensagem** pode ser o ID **ou o link** — os dois funcionam:",
          "```",
          `${PREFIXO}reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
          `${PREFIXO}reactionrole add 01ABC... 🎮 01XYZ...`,
          "```",
        ].join("\n"), colour: COR.erro });
    }

    // Confirma que a mensagem existe e faz o bot reagir nela.
    // Se o link trouxe o canal, vamos direto nele — mais rápido e confiável
    // do que varrer todos os canais do servidor.
    try {
      let msg = null;
      if (ref.canalId) {
        const canal = client.channels.get(ref.canalId)
          ?? await client.channels.fetch(ref.canalId).catch(() => null);
        if (canal) msg = await canal.fetchMessage(mid).catch(() => null);
      }
      msg ??= await message.channel.fetchMessage(mid).catch(() => null)
        ?? await buscarEmCanais(server, client, mid);
      if (!msg) {
        return sendEmbed(message.channel, tr(ctx, {
          title: "❌ Mensagem não encontrada",
          description: `Não achei a mensagem \`${mid}\`. Ela precisa estar num canal onde o bot tem acesso (ViewChannel + ReadMessageHistory).`,
          colour: COR.erro,
        }, {
          title: "❌ Message not found",
          description: `I couldn't find the message \`${mid}\`. It must be in a channel the bot can access (ViewChannel + ReadMessageHistory).`,
          colour: COR.erro,
        }));
      }

      // grava o canal junto: é o que permite recarregar a mensagem no boot
      const canalDaMsg = ref.canalId ?? msg?.channelId ?? msg?.channel?.id ?? null;
      db.addReactionRole(serverId, mid, emoji, role, canalDaMsg);
      try { await msg.react(encodeURIComponent(emoji)); } catch (e) {
        console.error("[REACTIONROLE][react]", e?.message);
      }

      await log.registrar(ctx, "cargos", { titulo: "🎭 Cargo por reação configurado",
        descricao: `<@${message.authorId}> vinculou ${emoji} → \`${role}\` na mensagem \`${mid}\`.` });

      return sendEmbed(message.channel, en ? {
        title: "🎭 Reaction role configured",
        description: [
          `**Message:** \`${mid}\``,
          `**Emoji:** ${emoji}`,
          `**Role:** \`${role}\``,
          "",
          "Anyone who clicks the emoji on that message gets the role. ✅",
        ].join("\n"),
        colour: COR.sucesso,
      } : {
        title: "🎭 Cargo por reação configurado",
        description: [
          `**Mensagem:** \`${mid}\``,
          `**Emoji:** ${emoji}`,
          `**Cargo:** \`${role}\``,
          "",
          "Quem clicar no emoji nessa mensagem recebe o cargo. ✅",
        ].join("\n"),
        colour: COR.sucesso,
      });
    } catch (err) {
      console.error("[REACTIONROLE][add]", descreverErro(err));
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Falha",
          description: `**Erro:** ${descreverErro(err)}\n\n_O bot precisa de **React**, **ManageRole** e **AssignRoles**._`, colour: COR.erro },
        { title: "❌ Failure",
          description: `**Error:** ${descreverErro(err)}\n\n_The bot needs **React**, **ManageRole** and **AssignRoles**._`, colour: COR.erro }));
    }
  }

  // ── ajuda ──
  return sendEmbed(message.channel, tr(ctx, {
    title: "🎭 Cargos por reação",
    description: [
      `\`${PREFIXO}reactionrole add <idMensagem> <emoji> <idCargo>\``,
      `\`${PREFIXO}reactionrole remove <idMensagem>\``,
      `\`${PREFIXO}reactionrole list\``,
      "",
      "💡 _Dica: crie a mensagem-painel com_ `&embed` _e depois vincule os emojis a ela._",
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "🎭 Reaction roles",
    description: [
      `\`${PREFIXO}reactionrole add <messageId> <emoji> <roleId>\``,
      `\`${PREFIXO}reactionrole remove <messageId>\``,
      `\`${PREFIXO}reactionrole list\``,
      "",
      "💡 _Tip: create the panel message with_ `&embed` _and then link the emojis to it._",
    ].join("\n"),
    colour: COR.info,
  }));
}

// Tenta achar a mensagem varrendo os canais de texto (fallback quando não está
// no canal do comando).
async function buscarEmCanais(server, client, mid) {
  const canais = (server.channels ?? []).filter((c) => c?.type === "TextChannel");
  for (const canal of canais) {
    const m = await canal.fetchMessage(mid).catch(() => null);
    if (m) return m;
  }
  return null;
}
