
import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";

const MAX = 100;

const pendentes = new Map();   // canalId → { codigo, autorId, expira, servidor }
const VALIDADE_MS = 60_000;

setInterval(() => {
  const agora = Date.now();
  for (const [k, p] of pendentes) if (agora > p.expira) pendentes.delete(k);
}, 30_000).unref?.();

function novoCodigo() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join("");
}

async function apagarTudo(canal, idComando, aoProgredir) {
  let total = 0;
  const TETO = Number(process.env.LIMPAR_TUDO_MAX || 5000);

  for (let volta = 0; volta < Math.ceil(TETO / 100); volta++) {
    const lote = await canal.fetchMessages({ limit: 100 });
    const ids = (lote ?? [])
      .map((m) => m.id ?? m._id)
      .filter((id) => id && id !== idComando);

    if (!ids.length) break;
    await canal.deleteMessages(ids);
    total += ids.length;
    if (aoProgredir && volta % 5 === 4) await aoProgredir(total);
    if (ids.length < 100) break;         // acabou o histórico
    await new Promise((r) => setTimeout(r, 400));   // respiro para a API
  }
  return total;
}

export async function cmdLimpar(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, client } = ctx;
  const lang = lingua(ctx);

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **ManageMessages** para limpar o chat.",
      colour: COR.erro,
    }, {
      title: "🚫 Missing permission",
      description: "You need the **ManageMessages** permission to purge the chat.",
      colour: COR.erro,
    }));
  }

  // ── &limpar tudo / &limpar confirmar <código> ──
  const sub = (args[0] ?? "").toLowerCase();

  if (["confirmar", "confirm"].includes(sub)) {
    const p = pendentes.get(message.channelId);
    if (!p || Date.now() > p.expira) {
      pendentes.delete(message.channelId);
      return sendEmbed(message.channel, tr(ctx,
        { title: "⌛ Nada a confirmar",
          description: `Nenhum pedido pendente neste canal (ou já expirou).\n\nComece com \`${PREFIXO}limpar tudo\`.`,
          colour: COR.aviso },
        { title: "⌛ Nothing to confirm",
          description: `No pending request in this channel (or it expired).\n\nStart with \`${PREFIXO}limpar tudo\`.`,
          colour: COR.aviso }));
    }
    if (message.authorId !== p.autorId) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Não é seu pedido",
          description: "Só quem pediu a limpeza pode confirmá-la.", colour: COR.erro },
        { title: "🚫 Not your request",
          description: "Only whoever requested the purge can confirm it.", colour: COR.erro }));
    }
    if ((args[1] ?? "").toUpperCase() !== p.codigo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Código errado",
          description: `Digite \`${PREFIXO}limpar confirmar ${p.codigo}\` exatamente como está.`, colour: COR.erro },
        { title: "❌ Wrong code",
          description: `Type \`${PREFIXO}limpar confirmar ${p.codigo}\` exactly as shown.`, colour: COR.erro }));
    }

    pendentes.delete(message.channelId);
    const aviso = await sendEmbedRetornando(ctx, message.channel, tr(ctx,
      { title: "🧹 Esvaziando o canal…", description: "Isso pode levar alguns instantes.", colour: COR.mod },
      { title: "🧹 Emptying the channel…", description: "This may take a moment.", colour: COR.mod }));

    try {
      const total = await apagarTudo(message.channel, message.id);
      await sendEmbed(message.channel, tr(ctx,
        { title: "🧹 Canal esvaziado",
          description: `**${total}** mensagem(ns) apagada(s) em <#${message.channelId}>.\n**Por:** <@${message.authorId}>`,
          colour: COR.sucesso },
        { title: "🧹 Channel emptied",
          description: `**${total}** message(s) deleted in <#${message.channelId}>.\n**By:** <@${message.authorId}>`,
          colour: COR.sucesso }));

      await log.registrar(ctx, "mensagens", {
        titulo: "🧹 LIMPEZA TOTAL do canal",
        descricao: `<@${message.authorId}> esvaziou <#${message.channelId}> — **${total}** mensagem(ns) apagada(s).`,
      });
      console.log(`[LIMPAR][TUDO] ${message.authorId} esvaziou ${message.channelId}: ${total} msg`);
    } catch (err) {
      console.error("[LIMPAR][TUDO]", err?.message ?? err);
      await sendEmbed(message.channel, tr(ctx,
        { title: "❌ A limpeza parou no meio",
          description: `\`${err?.message ?? err}\`\n\nParte das mensagens pode ter sido apagada.`, colour: COR.erro },
        { title: "❌ The purge stopped midway",
          description: `\`${err?.message ?? err}\`\n\nSome messages may already be gone.`, colour: COR.erro }));
    } finally {
      try { await aviso?.delete?.(); } catch {}
    }
    return;
  }

  if (["tudo", "all", "everything"].includes(sub)) {
    const ehDono = (server?.ownerId ?? server?.owner) === message.authorId
      || ctx.ehSuperAdmin?.(message.authorId);
    if (!ehDono) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Só o dono do servidor",
          description: `Esvaziar um canal inteiro é irreversível, então só o **dono** pode.\n\nPara apagar em quantidade: \`${PREFIXO}limpar 100\`.`,
          colour: COR.erro },
        { title: "🚫 Server owner only",
          description: `Emptying a whole channel is irreversible, so only the **owner** can do it.\n\nTo delete in bulk: \`${PREFIXO}limpar 100\`.`,
          colour: COR.erro }));
    }

    const codigo = novoCodigo();
    pendentes.set(message.channelId, {
      codigo, autorId: message.authorId, expira: Date.now() + VALIDADE_MS,
    });

    return sendEmbed(message.channel, tr(ctx, {
      title: "⚠️ Apagar TUDO deste canal?",
      description: [
        `Isto apaga **todas** as mensagens de <#${message.channelId}>.`,
        "**Não há como desfazer.**",
        "",
        `Para confirmar, digite:`,
        `\`${PREFIXO}limpar confirmar ${codigo}\``,
        "",
        "_O pedido expira em 60 segundos. Ignore esta mensagem para cancelar._",
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "⚠️ Delete EVERYTHING in this channel?",
      description: [
        `This deletes **all** messages in <#${message.channelId}>.`,
        "**There is no undo.**",
        "",
        `To confirm, type:`,
        `\`${PREFIXO}limpar confirmar ${codigo}\``,
        "",
        "_The request expires in 60 seconds. Ignore this message to cancel._",
      ].join("\n"),
      colour: COR.erro,
    }));
  }

  // Quantidade
  const n = parseInt(args[0], 10);
  if (!Number.isInteger(n) || n < 1) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Uso incorreto",
      description: [
        `\`${PREFIXO}limpar <quantidade>\` — apaga as últimas mensagens (1–${MAX})`,
        `\`${PREFIXO}limpar <quantidade> @usuário\` — apaga só as desse usuário`,
        `\`${PREFIXO}limpar tudo\` — esvazia o canal inteiro _(só o dono, com confirmação)_`,
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: [
        `\`${PREFIXO}limpar <amount>\` — deletes the latest messages (1–${MAX})`,
        `\`${PREFIXO}limpar <amount> @user\` — deletes only that user's`,
      ].join("\n"),
      colour: COR.erro,
    }));
  }
  if (n > MAX) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Limite excedido",
      description: `O máximo é **${MAX}** mensagens por vez (por segurança e limite da plataforma).`,
      colour: COR.erro,
    }, {
      title: "❌ Limit exceeded",
      description: `The maximum is **${MAX}** messages at a time (for safety and platform limits).`,
      colour: COR.erro,
    }));
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
      return sendEmbed(message.channel, tr(ctx, {
        title: "🧹 Nada para apagar",
        description: alvo ? `Não encontrei mensagens recentes de <@${alvo}>.` : "Não encontrei mensagens para apagar.",
        colour: COR.mod,
      }, {
        title: "🧹 Nothing to delete",
        description: alvo ? `I couldn't find recent messages from <@${alvo}>.` : "I couldn't find messages to delete.",
        colour: COR.mod,
      }));
    }

    // Apaga em massa (deleteMessages aceita vários IDs de uma vez)
    await message.channel.deleteMessages(ids);

    // Descrição EXATA da ação
    const conf = await sendEmbedRetornando(ctx, message.channel, lang === "en" ? {
      title: "🧹 Action executed: PURGE",
      description: [
        `**Deleted:** ${ids.length} message(s)`,
        alvo ? `**Filter:** only from <@${alvo}>` : `**Filter:** none (all recent)`,
        `**Channel:** <#${message.channelId}>`,
        `**By:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    } : {
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
    await sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível limpar",
      description: `**Erro:** ${err.message}\n\n_Verifique se o bot tem **ManageMessages** neste canal._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't purge",
      description: `**Error:** ${err.message}\n\n_Check that the bot has **ManageMessages** in this channel._`,
      colour: COR.erro,
    }));
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
