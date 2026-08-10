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

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// Aceita ID puro ou o LINK da mensagem. No Stoat o link é
// https://stoat.chat/server/<sid>/channel/<cid>/<messageId>
// — pegar o ID pelo cliente nem sempre é possível, mas copiar o link é.
// Devolve { id, canalId } (canalId só quando veio do link).
export function extrairIdMensagem(txt) {
  const bruto = String(txt ?? "").trim().replace(/[<>]/g, "");
  if (!bruto) return { id: "" };
  if (ULID.test(bruto)) return { id: bruto };

  // link completo: pega o último segmento que for um ULID, e o canal se houver
  if (/^https?:\/\//i.test(bruto) || bruto.includes("/channel/")) {
    const partes = bruto.split(/[/?#]/).filter(Boolean);
    const ulids = partes.filter((p) => ULID.test(p));
    if (ulids.length) {
      const id = ulids[ulids.length - 1];
      const iCanal = partes.indexOf("channel");
      const canalId = iCanal !== -1 && ULID.test(partes[iCanal + 1] ?? "") ? partes[iCanal + 1] : null;
      // se o último ULID for o próprio canal, não temos o ID da mensagem
      if (canalId && id === canalId) return { id: "", canalId };
      return { id, canalId };
    }
  }
  return { id: "" };
}

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
export async function aoReagir(message, userId, emoji, ctx) {
  try {
    const messageId = message?.id ?? message?._id;
    if (!messageId || !userId) return false;
    if (userId === ctx.client.user?.id) return false;   // ignora o próprio bot

    const alvo = db.getReactionRole(messageId, normalizarEmoji(emoji));
    if (!alvo) return false;

    const serverId = alvo.serverId;
    const server = await ctx.client.servers.fetch(serverId).catch(() => null);
    if (!server) return false;
    const member = await server.fetchMember(userId).catch(() => null);
    if (!member) return false;

    const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    if (atuais.includes(alvo.roleId)) return false;  // já tem o cargo
    atuais.push(alvo.roleId);
    await member.edit({ roles: atuais });

    console.log(`[REACTIONROLE] +cargo ${alvo.roleId} para ${userId} (msg ${messageId})`);
    const rctx = { ...ctx, serverId, config: ctx.configDoServidor?.(serverId) ?? ctx.config };
    await log.registrar(rctx, "cargos", {
      titulo: "🎭 Cargo por reação",
      descricao: `<@${userId}> recebeu o cargo \`${alvo.roleId}\` ao reagir.`,
    });
    return true;
  } catch (err) {
    console.error("[REACTIONROLE]", err?.message);
    return false;
  }
}

// ──────────────────────────────────────────────────────────
//  Comando &reactionrole
// ──────────────────────────────────────────────────────────
export async function cmdReactionRole(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId, client } = ctx;

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageRole")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManageRole** para configurar cargos por reação.", colour: COR.erro });
  }

  const sub = args[0]?.toLowerCase();

  // ── list ──
  if (sub === "list" || sub === "lista") {
    const linhas = db.listReactionRolesServidor(serverId);
    if (!linhas.length)
      return sendEmbed(message.channel, { title: "🎭 Cargos por reação",
        description: "_Nenhum configurado neste servidor._", colour: COR.mod });
    const porMsg = {};
    for (const l of linhas) (porMsg[l.messageId] ??= []).push(`${l.emoji} → \`${l.roleId}\``);
    return sendEmbed(message.channel, {
      title: "🎭 Cargos por reação",
      description: Object.entries(porMsg)
        .map(([mid, arr]) => `**Mensagem \`${mid}\`**\n${arr.join("\n")}`).join("\n\n"),
      colour: COR.mod,
    });
  }

  // ── remove <idMensagem> ──
  if (sub === "remove" || sub === "remover") {
    const mid = extrairIdMensagem(args[1]).id;
    if (!mid)
      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}reactionrole remove <mensagem>\`\n\nAceito o **ID** ou o **link** da mensagem.`, colour: COR.erro });
    const n = db.removeReactionRolesMensagem(mid);
    return sendEmbed(message.channel, { title: "🎭 Removido",
      description: n ? `Removidos **${n}** vínculo(s) da mensagem \`${mid}\`.` : "Nada encontrado para essa mensagem.",
      colour: COR.sucesso });
  }

  // ── add <idMensagem|link> <emoji> <idCargo> ──
  if (sub === "add" || sub === "adicionar") {
    const ref   = extrairIdMensagem(args[1]);
    const mid   = ref.id;
    const emoji = normalizarEmoji(args[2]);
    const role  = (args[3] ?? "").replace(/[<@#>]/g, "");

    if (!mid || !emoji || !ULID.test(role)) {
      // aponta exatamente o que está errado, em vez de repetir a sintaxe seca
      const problemas = [];
      if (!mid) {
        problemas.push(ref.canalId
          ? "• o link aponta para o **canal**, não para uma mensagem — abra o menu `...` da mensagem e use *Copiar link*"
          : "• não achei o **ID da mensagem** (aceito o ID puro ou o **link** da mensagem)");
      }
      if (!emoji) problemas.push("• faltou o **emoji**");
      if (!ULID.test(role)) problemas.push(`• o **ID do cargo** está inválido${args[3] ? ` (\`${args[3]}\`)` : ""} — pegue em Configurações → Cargos → *Copy role ID*`);

      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
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
        return sendEmbed(message.channel, { title: "❌ Mensagem não encontrada",
          description: `Não achei a mensagem \`${mid}\`. Ela precisa estar num canal onde o bot tem acesso (ViewChannel + ReadMessageHistory).`,
          colour: COR.erro });
      }

      db.addReactionRole(serverId, mid, emoji, role);
      try { await msg.react(encodeURIComponent(emoji)); } catch (e) {
        console.error("[REACTIONROLE][react]", e?.message);
      }

      await log.registrar(ctx, "cargos", { titulo: "🎭 Cargo por reação configurado",
        descricao: `<@${message.authorId}> vinculou ${emoji} → \`${role}\` na mensagem \`${mid}\`.` });

      return sendEmbed(message.channel, {
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
      console.error("[REACTIONROLE][add]", err.message);
      return sendEmbed(message.channel, { title: "❌ Falha",
        description: `**Erro:** ${err.message}\n\n_O bot precisa de **React** e **ManageRole**._`, colour: COR.erro });
    }
  }

  // ── ajuda ──
  return sendEmbed(message.channel, {
    title: "🎭 Cargos por reação",
    description: [
      `\`${PREFIXO}reactionrole add <idMensagem> <emoji> <idCargo>\``,
      `\`${PREFIXO}reactionrole remove <idMensagem>\``,
      `\`${PREFIXO}reactionrole list\``,
      "",
      "💡 _Dica: crie a mensagem-painel com_ `&embed` _e depois vincule os emojis a ela._",
    ].join("\n"),
    colour: COR.info,
  });
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
