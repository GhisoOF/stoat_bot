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
import { idValido, descreverProblemaDeId } from "../core/ids.js";

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
    await member.edit({ roles: novos });

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
        .map(([mid, arr]) => {
          const modo = db.isReactionRoleExclusivo(mid) ? " — 🎯 _exclusivo (troca o cargo)_" : "";
          return `**Mensagem \`${mid}\`**${modo}\n${arr.join("\n")}`;
        }).join("\n\n")
        + `\n\n_Use \`${PREFIXO}reactionrole exclusivo <mensagem> on\` para que a escolha troque o cargo anterior._`,
      colour: COR.mod,
    });
  }

  // ── exclusivo <mensagem> on|off ──
  if (["exclusivo", "exclusive", "unico", "único"].includes(sub)) {
    const mid = extrairIdMensagem(args[1]).id;
    if (!mid) {
      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
        description: [
          `\`${PREFIXO}reactionrole exclusivo <mensagem> on|off\``,
          "",
          "**on** — escolher um emoji **troca** o cargo anterior (ex.: escolha sua cor)",
          "**off** — os cargos **acumulam** (ex.: escolha seus interesses)",
          "",
          "A mensagem pode ser o **ID** ou o **link**.",
        ].join("\n"), colour: COR.erro });
    }
    const regras = db.listReactionRoles(mid);
    if (!regras.length) {
      return sendEmbed(message.channel, { title: "❌ Sem regras nessa mensagem",
        description: `Não há cargos por reação registrados em \`${mid}\`. Adicione com \`${PREFIXO}reactionrole add\` primeiro.`,
        colour: COR.erro });
    }
    const estado = (args[2] ?? "on").toLowerCase();
    const ligar = !["off", "nao", "não", "0"].includes(estado);
    db.setReactionRoleExclusivo(mid, ligar);
    return sendEmbed(message.channel, {
      title: ligar ? "🎯 Modo exclusivo ligado" : "➕ Modo acumulativo",
      description: ligar
        ? `Nessa mensagem (**${regras.length}** opções), escolher um emoji **remove** o cargo escolhido antes. Bom para cor, idade, time — coisas em que só uma vale.`
        : `Nessa mensagem, a pessoa pode ter **vários** cargos ao mesmo tempo.`,
      colour: COR.sucesso });
  }

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
    const role  = idValido(args[3]);

    if (!mid || !emoji || !role) {
      // aponta exatamente o que está errado, em vez de repetir a sintaxe seca
      const problemas = [];
      if (!mid) {
        problemas.push(ref.canalId
          ? "• o link aponta para o **canal**, não para uma mensagem — abra o menu `...` da mensagem e use *Copiar link*"
          : "• não achei o **ID da mensagem** (aceito o ID puro ou o **link** da mensagem)");
      }
      if (!emoji) problemas.push("• faltou o **emoji**");
      if (!role) problemas.push(`• o **cargo**: ${descreverProblemaDeId(args[3], "cargo")} — mencione o cargo ou cole o ID (Configurações → Cargos → *Copy role ID*)`);

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
