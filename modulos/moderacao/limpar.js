// ══════════════════════════════════════════════════════════
//  limpar.js — &limpar (também &clear / &purge)
//
//  &limpar <n>            → apaga as últimas <n> mensagens (1–100)
//  &limpar <n> @usuário   → apaga as <n> últimas DAQUELE usuário
//
//  Salvaguardas:
//   • exige ManageMessages
//   • limite de 100 por vez (evita acidentes e limites da API)
//   • confirma exatamente quantas apagou (e quantas falharam)
//   • a própria mensagem de confirmação some sozinha após alguns segundos
// ══════════════════════════════════════════════════════════

import * as log from "../core/log.js";

const MAX = 100;

export async function cmdLimpar(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, client } = ctx;

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **ManageMessages** para limpar o chat.",
      colour: COR.erro,
    });
  }

  // Quantidade
  const n = parseInt(args[0], 10);
  if (!Number.isInteger(n) || n < 1) {
    return sendEmbed(message.channel, {
      title: "❌ Uso incorreto",
      description: [
        `\`${PREFIXO}limpar <quantidade>\` — apaga as últimas mensagens (1–${MAX})`,
        `\`${PREFIXO}limpar <quantidade> @usuário\` — apaga só as desse usuário`,
      ].join("\n"),
      colour: COR.erro,
    });
  }
  if (n > MAX) {
    return sendEmbed(message.channel, {
      title: "❌ Limite excedido",
      description: `O máximo é **${MAX}** mensagens por vez (por segurança e limite da plataforma).`,
      colour: COR.erro,
    });
  }

  // Filtro opcional por usuário (menção ou ID)
  const alvo = message.mentionIds?.[0]
    ?? (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test((args[1] ?? "").replace(/[<@>]/g, ""))
        ? args[1].replace(/[<@>]/g, "") : null);

  try {
    // Busca um pouco mais que n para conseguir filtrar por usuário
    const buscar = alvo ? Math.min(MAX, n * 4) : n;
    const mensagens = await message.channel.fetchMessages({ limit: buscar });

    // Não apaga o próprio comando duas vezes nem mensagens do sistema
    let candidatas = mensagens.filter((m) => (m.id ?? m._id) !== message.id);
    if (alvo) candidatas = candidatas.filter((m) => (m.authorId ?? m.author?.id) === alvo);
    const ids = candidatas.slice(0, n).map((m) => m.id ?? m._id).filter(Boolean);

    if (!ids.length) {
      return sendEmbed(message.channel, {
        title: "🧹 Nada para apagar",
        description: alvo ? `Não encontrei mensagens recentes de <@${alvo}>.` : "Não encontrei mensagens para apagar.",
        colour: COR.mod,
      });
    }

    // Apaga em massa (deleteMessages aceita vários IDs de uma vez)
    await message.channel.deleteMessages(ids);

    // Descrição EXATA da ação
    const conf = await sendEmbedRetornando(ctx, message.channel, {
      title: "🧹 Ação executada: LIMPEZA",
      description: [
        `**Apagadas:** ${ids.length} mensagem(ns)`,
        alvo ? `**Filtro:** apenas de <@${alvo}>` : `**Filtro:** nenhum (todas as recentes)`,
        `**Canal:** <#${message.channelId}>`,
        `**Por:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    });

    await log.registrar(ctx, "mensagens", {
      titulo: "🧹 Limpeza de chat",
      descricao: `<@${message.authorId}> apagou **${ids.length}** mensagem(ns) em <#${message.channelId}>`
               + (alvo ? ` (só de <@${alvo}>).` : "."),
    });

    console.log(`[LIMPAR] ${message.authorId} apagou ${ids.length} msg em ${message.channelId}${alvo ? ` (alvo ${alvo})` : ""}`);

    // A confirmação some sozinha depois de 6s (não deixa lixo no chat)
    if (conf) {
      setTimeout(() => { conf.delete?.().catch(() => {}); }, 6000);
    }
  } catch (err) {
    console.error("[LIMPAR]", err.message);
    await sendEmbed(message.channel, {
      title: "❌ Não foi possível limpar",
      description: `**Erro:** ${err.message}\n\n_Verifique se o bot tem **ManageMessages** neste canal._`,
      colour: COR.erro,
    });
  }
}

// Envia um embed e devolve o objeto da mensagem (para podermos apagá-la depois).
async function sendEmbedRetornando(ctx, channel, embed) {
  try {
    return await channel.sendMessage({
      embeds: [{
        title: embed.title,
        description: embed.description,
        colour: embed.colour,
      }],
    });
  } catch {
    // fallback: usa o helper padrão (não retorna a msg, mas não quebra)
    await ctx.sendEmbed(channel, embed);
    return null;
  }
}
