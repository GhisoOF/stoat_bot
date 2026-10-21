
import { idEscrito, resolverUsuario } from "../core/ids.js";
import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";
import { citar, JA_TRADUZIDO, FIM_PRONTO } from "../core/aliases.js";

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
    }, {
      title: "🚫 Permiso insuficiente",
      description: "Necesitas el permiso **ManageMessages** para limpiar el chat.",
      colour: COR.erro,
    }));
  }

  // ── &limpar tudo / &limpar confirmar <código> ──
  // Os nomes já chegam traduzidos (`all`, `confirm` → `tudo`, `confirmar`): o motor
  // traduz pelo registro (fase 3); o handler só conhece o nome interno.
  const sub = (args[0] ?? "").toLowerCase();

  if (sub === "confirmar") {
    const p = pendentes.get(message.channelId);
    if (!p || Date.now() > p.expira) {
      pendentes.delete(message.channelId);
      return sendEmbed(message.channel, tr(ctx,
        { title: "⌛ Nada a confirmar",
          description: `Nenhum pedido pendente neste canal (ou já expirou).\n\nComece com \`${citar("limpar.tudo", "pt", PREFIXO)}\`.`,
          colour: COR.aviso },
        { title: "⌛ Nothing to confirm",
          description: `No pending request in this channel (or it expired).\n\nStart with \`${citar("limpar.tudo", "en", PREFIXO)}\`.`,
          colour: COR.aviso },
        { title: "⌛ Nada que confirmar",
          description: `No hay ninguna solicitud pendiente en este canal (o ya expiró).\n\nEmpieza con \`${citar("limpar.tudo", "es", PREFIXO)}\`.`,
          colour: COR.aviso }));
    }
    if (message.authorId !== p.autorId) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Não é seu pedido",
          description: "Só quem pediu a limpeza pode confirmá-la.", colour: COR.erro },
        { title: "🚫 Not your request",
          description: "Only whoever requested the purge can confirm it.", colour: COR.erro },
        { title: "🚫 No es tu solicitud",
          description: "Solo quien pidió la limpieza puede confirmarla.", colour: COR.erro }));
    }
    if ((args[1] ?? "").toUpperCase() !== p.codigo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Código errado",
          description: `Digite \`${citar("limpar.confirmar", "pt", PREFIXO)} ${p.codigo}\` exatamente como está.`, colour: COR.erro },
        { title: "❌ Wrong code",
          description: `Type \`${citar("limpar.confirmar", "en", PREFIXO)} ${p.codigo}\` exactly as shown.`, colour: COR.erro },
        { title: "❌ Código incorrecto",
          description: `Escribe \`${citar("limpar.confirmar", "es", PREFIXO)} ${p.codigo}\` exactamente como aparece.`, colour: COR.erro }));
    }

    pendentes.delete(message.channelId);
    const aviso = await sendEmbedRetornando(ctx, message.channel, tr(ctx,
      { title: "🧹 Esvaziando o canal…", description: "Isso pode levar alguns instantes.", colour: COR.mod },
      { title: "🧹 Emptying the channel…", description: "This may take a moment.", colour: COR.mod },
      { title: "🧹 Vaciando el canal…", description: "Esto puede tardar unos instantes.", colour: COR.mod }));

    try {
      const total = await apagarTudo(message.channel, message.id);
      await sendEmbed(message.channel, tr(ctx,
        { title: "🧹 Canal esvaziado",
          description: `**${total}** mensagem(ns) apagada(s) em <#${message.channelId}>.\n**Por:** <@${message.authorId}>`,
          colour: COR.sucesso },
        { title: "🧹 Channel emptied",
          description: `**${total}** message(s) deleted in <#${message.channelId}>.\n**By:** <@${message.authorId}>`,
          colour: COR.sucesso },
        { title: "🧹 Canal vaciado",
          description: `**${total}** mensaje(s) borrado(s) en <#${message.channelId}>.\n**Por:** <@${message.authorId}>`,
          colour: COR.sucesso }));

      await log.registrar(ctx, "mensagens", {
        titulo: "🧹 LIMPEZA TOTAL do canal",
        descricao: `<@${message.authorId}> esvaziou <#${message.channelId}> — **${total}** mensagem(ns) apagada(s).`,
        en: { titulo: "🧹 Channel FULLY cleared", descricao: `<@${message.authorId}> emptied <#${message.channelId}> — **${total}** message(s) deleted.` },
        es: { titulo: "🧹 LIMPIEZA TOTAL del canal", descricao: `<@${message.authorId}> vació <#${message.channelId}> — **${total}** mensaje(s) borrado(s).` },
      });
      console.log(`[LIMPAR][TUDO] ${message.authorId} esvaziou ${message.channelId}: ${total} msg`);
    } catch (err) {
      console.error("[LIMPAR][TUDO]", err?.message ?? err);
      await sendEmbed(message.channel, tr(ctx,
        { title: "❌ A limpeza parou no meio",
          description: `\`${err?.message ?? err}\`\n\nParte das mensagens pode ter sido apagada.`, colour: COR.erro },
        { title: "❌ The purge stopped midway",
          description: `\`${err?.message ?? err}\`\n\nSome messages may already be gone.`, colour: COR.erro },
        { title: "❌ La limpieza se detuvo a medias",
          description: `\`${err?.message ?? err}\`\n\nEs posible que parte de los mensajes ya se haya borrado.`, colour: COR.erro }));
    } finally {
      try { await aviso?.delete?.(); } catch {}
    }
    return;
  }

  if (sub === "tudo") {
    const ehDono = (server?.ownerId ?? server?.owner) === message.authorId
      || ctx.ehSuperAdmin?.(message.authorId);
    if (!ehDono) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Só o dono do servidor",
          description: `Esvaziar um canal inteiro é irreversível, então só o **dono** pode.\n\nPara apagar em quantidade: \`${citar("limpar", "pt", PREFIXO)} 100\`.`,
          colour: COR.erro },
        { title: "🚫 Server owner only",
          description: `Emptying a whole channel is irreversible, so only the **owner** can do it.\n\nTo delete in bulk: \`${citar("limpar", "en", PREFIXO)} 100\`.`,
          colour: COR.erro },
        { title: "🚫 Solo el dueño del servidor",
          description: `Vaciar un canal entero es irreversible, así que solo el **dueño** puede hacerlo.\n\nPara borrar en cantidad: \`${citar("limpar", "es", PREFIXO)} 100\`.`,
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
        `\`${citar("limpar.confirmar", "pt", PREFIXO)} ${codigo}\``,
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
        `\`${citar("limpar.confirmar", "en", PREFIXO)} ${codigo}\``,
        "",
        "_The request expires in 60 seconds. Ignore this message to cancel._",
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "⚠️ ¿Borrar TODO en este canal?",
      description: [
        `Esto borra **todos** los mensajes de <#${message.channelId}>.`,
        "**No se puede deshacer.**",
        "",
        `Para confirmar, escribe:`,
        `\`${citar("limpar.confirmar", "es", PREFIXO)} ${codigo}\``,
        "",
        "_La solicitud expira en 60 segundos. Ignora este mensaje para cancelar._",
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
        `\`${citar("limpar", "pt", PREFIXO)} <quantidade>\` — apaga as últimas mensagens (1–${MAX})`,
        `\`${citar("limpar", "pt", PREFIXO)} <quantidade> @usuário\` — apaga só as desse usuário`,
        `\`${citar("limpar.tudo", "pt", PREFIXO)}\` — esvazia o canal inteiro _(só o dono, com confirmação)_`,
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: [
        `\`${citar("limpar", "en", PREFIXO)} <amount>\` — deletes the latest messages (1–${MAX})`,
        `\`${citar("limpar", "en", PREFIXO)} <amount> @user\` — deletes only that user's`,
        `\`${citar("limpar.tudo", "en", PREFIXO)}\` — empties the whole channel _(owner only, with confirmation)_`,
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "❌ Uso incorrecto",
      description: [
        `\`${citar("limpar", "es", PREFIXO)} <cantidad>\` — borra los últimos mensajes (1–${MAX})`,
        `\`${citar("limpar", "es", PREFIXO)} <cantidad> @usuario\` — borra solo los de ese usuario`,
        `\`${citar("limpar.tudo", "es", PREFIXO)}\` — vacía el canal entero _(solo el dueño, con confirmación)_`,
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
    }, {
      title: "❌ Límite superado",
      description: `El máximo es **${MAX}** mensajes a la vez (por seguridad y por el límite de la plataforma).`,
      colour: COR.erro,
    }));
  }

  // Filtro opcional por usuário (menção ou ID)
  // (o ID escrito vem antes do mentionIds: numa resposta, ele traz o autor
  // da mensagem respondida — e "&limpar 50" respondendo filtrava por ele)
  const textoAlvo = args.slice(1).join(" ").trim();
  let alvo = null;
  if (textoAlvo) {
    const server = await ctx.getServer?.(message).catch?.(() => null);
    alvo = idEscrito(textoAlvo)
      ?? await resolverUsuario(textoAlvo, { message, server, client: ctx.client }).catch(() => null);
    // Pediu para filtrar e não achou a pessoa: NÃO apaga as de todo mundo.
    if (!alvo) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não achei essa pessoa", description: `Não encontrei \`${textoAlvo.slice(0, 60)}\` — nada foi apagado.\n\`${citar("limpar", "pt", PREFIXO)} <quantidade> <@pessoa|id|nome>\``, colour: COR.erro },
      { title: "❌ Couldn't find that person", description: `I couldn't find \`${textoAlvo.slice(0, 60)}\` — nothing was deleted.\n\`${citar("limpar", "en", PREFIXO)} <amount> <@user|id|name>\``, colour: COR.erro },
      { title: "❌ No encontré a esa persona", description: `No encontré \`${textoAlvo.slice(0, 60)}\` — no se borró nada.\n\`${citar("limpar", "es", PREFIXO)} <cantidad> <@usuario|id|nombre>\``, colour: COR.erro }));
  }

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
      }, {
        title: "🧹 Nada que borrar",
        description: alvo ? `No encontré mensajes recientes de <@${alvo}>.` : "No encontré mensajes para borrar.",
        colour: COR.mod,
      }));
    }

    // Apaga em massa (deleteMessages aceita vários IDs de uma vez)
    await message.channel.deleteMessages(ids);

    // Descrição EXATA da ação
    const conf = await sendEmbedRetornando(ctx, message.channel, tr(ctx, {
      title: "🧹 Ação executada: LIMPEZA",
      description: [
        `**Apagadas:** ${ids.length} mensagem(ns)`,
        alvo ? `**Filtro:** apenas de <@${alvo}>` : `**Filtro:** nenhum (todas as recentes)`,
        `**Canal:** <#${message.channelId}>`,
        `**Por:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: "🧹 Action executed: PURGE",
      description: [
        `**Deleted:** ${ids.length} message(s)`,
        alvo ? `**Filter:** only from <@${alvo}>` : `**Filter:** none (all recent)`,
        `**Channel:** <#${message.channelId}>`,
        `**By:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: "🧹 Acción ejecutada: LIMPIEZA",
      description: [
        `**Borrados:** ${ids.length} mensaje(s)`,
        alvo ? `**Filtro:** solo de <@${alvo}>` : `**Filtro:** ninguno (todos los recientes)`,
        `**Canal:** <#${message.channelId}>`,
        `**Por:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    }));

    await log.registrar(ctx, "mensagens", {
      titulo: "🧹 Limpeza de chat",
      descricao: `<@${message.authorId}> apagou **${ids.length}** mensagem(ns) em <#${message.channelId}>`
               + (alvo ? ` (só de <@${alvo}>).` : "."),
      en: { titulo: "🧹 Chat cleanup", descricao: `<@${message.authorId}> deleted **${ids.length}** message(s) in <#${message.channelId}>`
               + (alvo ? ` (only from <@${alvo}>).` : ".") },
      es: { titulo: "🧹 Limpieza de chat", descricao: `<@${message.authorId}> borró **${ids.length}** mensaje(s) en <#${message.channelId}>`
               + (alvo ? ` (solo de <@${alvo}>).` : ".") },
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
    }, {
      title: "❌ No se pudo limpiar",
      description: `**Error:** ${err.message}\n\n_Comprueba que el bot tenga **ManageMessages** en este canal._`,
      colour: COR.erro,
    }));
  }
}

// Envia um embed e devolve o objeto da mensagem (para podermos apagá-la depois).
// (etapa 4b) o envio direto não passa pela tradução da tela: tira as marcas do
// espanhol pronto (`tr`) — no pt e no en elas não existem, o texto fica igual.
const semMarcas = (t) => (typeof t === "string" ? t.replaceAll(JA_TRADUZIDO, "").replaceAll(FIM_PRONTO, "") : t);
async function sendEmbedRetornando(ctx, channel, embed) {
  try {
    return await channel.sendMessage({
      embeds: [{
        title: semMarcas(embed.title),
        description: semMarcas(embed.description),
        colour: embed.colour,
      }],
    });
  } catch {
    // fallback: usa o helper padrão (não retorna a msg, mas não quebra)
    await ctx.sendEmbed(channel, embed);
    return null;
  }
}
