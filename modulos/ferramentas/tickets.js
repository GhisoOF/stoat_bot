// &ticket — suporte com canal privado por pedido:
//   abrir  → cria o cargo "ticket-N", dá pro autor E PRO BOT (senão o bot se
//            tranca fora do próprio canal), cria o canal #ticket-N, esconde
//            de todo mundo (deny geral no default) e libera o cargo do
//            ticket + os cargos de staff (os do &acesso);
//   fechar → baixa o histórico inteiro (paginado), publica a transcrição no
//            canal de log em blocos legíveis, apaga o canal e o cargo.
// Permissões que o bot precisa no servidor: ManageChannel, ManageRole,
// AssignRoles e ManagePermissions — o erro de cada etapa diz qual faltou.

import * as db from "../core/db.js";
import { tr, lingua } from "../core/i18n.js";

const DENY_TUDO = Number(0x000fffffffffffffn);   // mesmo GRANT_ALL_SAFE do cargo mudo
const MAX_MSGS_TRANSCRICAO = Number(process.env.TICKET_MAX_MSGS || 1000);

// ── Transcrição (puro, testável) ────────────────────────────────────────────
export function formatarTranscricao(mensagens, { nomeCanal = "ticket", en = false } = {}) {
  // mensagens: [{autor, quando, texto, anexos}] em ordem cronológica
  const linhas = [en ? `Transcript of #${nomeCanal}` : `Transcrição de #${nomeCanal}`, "─".repeat(30)];
  for (const m of mensagens) {
    const hora = m.quando ? new Date(m.quando).toISOString().replace("T", " ").slice(0, 16) : "??";
    let corpo = String(m.texto ?? "").trim();
    if (!corpo && m.anexos) corpo = en ? `(${m.anexos} attachment(s))` : `(${m.anexos} anexo(s))`;
    if (m.anexos && String(m.texto ?? "").trim()) corpo += en ? ` (+${m.anexos} attachment(s))` : ` (+${m.anexos} anexo(s))`;
    linhas.push(`[${hora}] ${m.autor}: ${corpo || "(vazio)"}`);
  }
  return linhas.join("\n");
}

export function fatiarTranscricao(texto, tamanho = 1800) {
  const fatias = [];
  const linhas = String(texto ?? "").split("\n");
  let atual = "";
  for (const l of linhas) {
    if ((atual + "\n" + l).length > tamanho && atual) { fatias.push(atual); atual = l; }
    else atual = atual ? atual + "\n" + l : l;
  }
  if (atual) fatias.push(atual);
  return fatias;
}

// ── Coleta do histórico (paginada, mais antigo → mais novo) ─────────────────
async function coletarHistorico(canal) {
  const todas = [];
  let antes;
  while (todas.length < MAX_MSGS_TRANSCRICAO) {
    const lote = await canal.fetchMessages({ limit: 100, ...(antes ? { before: antes } : {}) }).catch(() => null);
    if (!lote?.length) break;
    todas.push(...lote);
    if (lote.length < 100) break;
    antes = lote[lote.length - 1].id;
  }
  return todas
    .slice(0, MAX_MSGS_TRANSCRICAO)
    .reverse()
    .map((m) => ({
      autor: m.member?.nickname ?? m.author?.username ?? m.authorId ?? "?",
      quando: m.createdAt ?? m.created_at ?? null,
      texto: m.content ?? "",
      anexos: m.attachments?.length ?? 0,
    }));
}

// ── Comando ─────────────────────────────────────────────────────────────────
export async function cmdTicket(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId, config, salvarConfig, getServer, membroTemPermissao } = ctx;
  const en = lingua(ctx) === "en";
  const sub = String(args[0] ?? "").toLowerCase();
  const ehStaff = ctx.temCargoStaff?.(message, config)
    || membroTemPermissao(message, await getServer(message).catch(() => null), "ManageChannel");

  config.tickets ??= { contador: 0, logCanal: null, abertos: {} };
  const cfg = config.tickets;

  if (!sub || ["ajuda", "help"].includes(sub)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🎫 Tickets de suporte",
      description: [
        `\`${P}ticket abrir [motivo]\` — abre um canal privado seu com a staff`,
        `\`${P}ticket fechar [nota]\` — encerra: a conversa é arquivada no log e o canal some (staff ou quem abriu)`,
        `\`${P}ticket log <#canal>\` — onde as transcrições ficam guardadas (staff)`,
        `\`${P}ticket lista\` — tickets abertos (staff)`,
        "",
        "_O canal do ticket só é visível para quem abriu e para os cargos de staff do `&acesso`._",
      ].join("\n"),
      colour: COR.info,
    }, {
      title: "🎫 Support tickets",
      description: [
        `\`${P}ticket abrir [reason]\` — opens a private channel between you and staff`,
        `\`${P}ticket fechar [note]\` — closes it: the conversation is archived in the log and the channel disappears (staff or the opener)`,
        `\`${P}ticket log <#channel>\` — where transcripts are stored (staff)`,
        `\`${P}ticket lista\` — open tickets (staff)`,
        "",
        "_The ticket channel is visible only to the opener and the staff roles from `&acesso`._",
      ].join("\n"),
      colour: COR.info,
    }));
  }

  if (sub === "log") {
    if (!ehStaff) return semPermissao();
    const canalId = ctx.limparId?.(args[1]) || args[1]?.replace(/[<#>]/g, "");
    if (!canalId) return sendEmbed(message.channel, { title: "🎫", description: en ? "Which channel?" : "Qual canal?", colour: COR.aviso });
    cfg.logCanal = canalId;
    salvarConfig();
    return sendEmbed(message.channel, { title: "🎫", description: (en ? "Transcripts will be archived in " : "As transcrições serão arquivadas em ") + `<#${canalId}>.`, colour: COR.sucesso });
  }

  if (sub === "lista" || sub === "list") {
    if (!ehStaff) return semPermissao();
    const abertos = db.listarTickets(serverId);
    return sendEmbed(message.channel, {
      title: en ? "🎫 Open tickets" : "🎫 Tickets abertos",
      description: abertos.length
        ? abertos.map((t) => `**#${t.numero}** <#${t.canalId}> — <@${t.autorId}>${t.motivo ? ` · _${t.motivo.slice(0, 60)}_` : ""}`).join("\n")
        : (en ? "None." : "Nenhum."),
      colour: COR.info,
    });
  }

  if (["abrir", "open", "novo"].includes(sub)) {
    const motivo = args.slice(1).join(" ").trim().slice(0, 200);
    const jaTem = db.listarTickets(serverId).find((t) => t.autorId === message.authorId);
    if (jaTem) {
      return sendEmbed(message.channel, { title: "🎫", description: (en ? "You already have an open ticket: " : "Você já tem um ticket aberto: ") + `<#${jaTem.canalId}>`, colour: COR.aviso });
    }
    if (!cfg.logCanal) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎫 Falta configurar", description: `Antes do primeiro ticket, a staff define onde as transcrições ficam: \`${P}ticket log <#canal>\` (um canal privado da staff).`, colour: COR.aviso },
        { title: "🎫 Setup needed", description: `Before the first ticket, staff must set where transcripts go: \`${P}ticket log <#channel>\` (a staff-only channel).`, colour: COR.aviso }));
    }
    const server = await getServer(message).catch(() => null);
    if (!server) return sendEmbed(message.channel, { title: "🎫", description: "⚠️ servidor?", colour: COR.aviso });

    const numero = ++cfg.contador;
    salvarConfig();
    const nome = `ticket-${String(numero).padStart(4, "0")}`;
    let roleId = null, canal = null;
    try {
      // 1) cargo do ticket
      const criado = await server.createRole(nome);
      roleId = criado?.id ?? criado?.role?._id ?? criado?.role?.id;
      if (!roleId) throw new Error("a API não devolveu o id do cargo (falta ManageRole?)");

      // 2) cargo no autor E no bot (senão o bot se tranca fora do canal)
      for (const uid of [message.authorId, ctx.client?.user?.id].filter(Boolean)) {
        const membro = await server.fetchMember(uid).catch(() => null);
        if (membro) {
          const atuais = new Set((membro.roles ?? []).map((r) => r?.id ?? r).filter(Boolean));
          atuais.add(roleId);
          await membro.edit({ roles: [...atuais] }).catch((e) => { throw new Error(`atribuir o cargo falhou (${e.message}) — falta AssignRoles?`); });
        }
      }

      // 3) canal
      canal = await server.createChannel({ type: "Text", name: nome, description: motivo || (en ? "Support ticket" : "Ticket de suporte") });
      if (!canal?.id) throw new Error("a API não devolveu o canal (falta ManageChannel?)");

      // 4) permissões: ninguém vê; o cargo do ticket e a staff veem tudo
      await canal.setPermissions("default", { allow: 0, deny: DENY_TUDO });
      await canal.setPermissions(roleId, { allow: DENY_TUDO, deny: 0 });
      for (const staffRole of config?.acesso?.cargosStaff ?? []) {
        await canal.setPermissions(staffRole, { allow: DENY_TUDO, deny: 0 }).catch(() => {});
      }
    } catch (e) {
      // desfaz o que deu tempo de criar
      try { if (canal?.delete) await canal.delete(); } catch {}
      try { if (roleId) await server.deleteRole?.(roleId); } catch {}
      return sendEmbed(message.channel, {
        title: "🎫", colour: COR.aviso,
        description: (en ? "I couldn't open the ticket: " : "Não consegui abrir o ticket: ") + `${e.message}\n` + (en ? "The bot needs **ManageChannel, ManageRole, AssignRoles, ManagePermissions**." : "O bot precisa de **ManageChannel, ManageRole, AssignRoles, ManagePermissions**."),
      });
    }

    db.criarTicket(serverId, numero, canal.id, roleId, message.authorId, motivo);
    await ctx.sendEmbed(canal, tr(ctx, {
      title: `🎫 Ticket #${numero}`,
      description: `Aberto por <@${message.authorId}>${motivo ? `\n**Motivo:** ${motivo}` : ""}\n\nSó você e a staff enxergam este canal. Conte o que precisa — e quando terminar, qualquer um dos lados encerra com \`${P}ticket fechar\` (a conversa fica arquivada com a staff).`,
      colour: COR.sucesso,
    }, {
      title: `🎫 Ticket #${numero}`,
      description: `Opened by <@${message.authorId}>${motivo ? `\n**Reason:** ${motivo}` : ""}\n\nOnly you and staff can see this channel. Tell us what you need — when it's done, either side closes it with \`${P}ticket fechar\` (the conversation is archived with staff).`,
      colour: COR.sucesso,
    }));
    return sendEmbed(message.channel, { title: "🎫", description: (en ? "Ticket open: " : "Ticket aberto: ") + `<#${canal.id}>`, colour: COR.sucesso });
  }

  if (["fechar", "close", "encerrar"].includes(sub)) {
    const ticket = db.ticketPorCanal(message.channelId);
    if (!ticket) return sendEmbed(message.channel, { title: "🎫", description: en ? "This isn't a ticket channel." : "Este canal não é de um ticket.", colour: COR.aviso });
    if (!ehStaff && ticket.autorId !== message.authorId) return semPermissao();

    const nota = args.slice(1).join(" ").trim().slice(0, 200);
    const server = await getServer(message).catch(() => null);
    const msgs = await coletarHistorico(message.channel);
    const transcricao = formatarTranscricao(msgs, { nomeCanal: `ticket-${String(ticket.numero).padStart(4, "0")}`, en });

    // publica no log
    const logCanal = ctx.client?.channels?.get?.(cfg.logCanal) ?? await ctx.client?.channels?.fetch?.(cfg.logCanal).catch(() => null);
    if (logCanal) {
      const dur = ticket.abertoEm ? Math.round((Date.now() - new Date(ticket.abertoEm).getTime()) / 60000) : null;
      await ctx.sendEmbed(logCanal, {
        title: `🗂️ Ticket #${ticket.numero} ${en ? "archived" : "arquivado"}`,
        description: [
          `${en ? "Opened by" : "Aberto por"} <@${ticket.autorId}> · ${en ? "closed by" : "fechado por"} <@${message.authorId}>`,
          ticket.motivo ? `**${en ? "Reason" : "Motivo"}:** ${ticket.motivo}` : null,
          nota ? `**${en ? "Closing note" : "Nota de fechamento"}:** ${nota}` : null,
          `${msgs.length} ${en ? "message(s)" : "mensagem(ns)"}${dur != null ? ` · ${dur} min` : ""}`,
        ].filter(Boolean).join("\n"),
        colour: COR.mod ?? COR.info,
      });
      for (const fatia of fatiarTranscricao(transcricao)) {
        await logCanal.sendMessage?.({ content: "```text\n" + fatia + "\n```" }).catch(async () => {
          await ctx.sendEmbed(logCanal, { title: "…", description: fatia.slice(0, 1900), colour: COR.info });
        });
      }
    }

    db.fecharTicket(ticket.id);
    try { if (ticket.roleId) await server?.deleteRole?.(ticket.roleId); } catch {}
    try { await message.channel.delete?.(); } catch (e) {
      return sendEmbed(message.channel, { title: "🎫", description: (en ? "Archived, but I couldn't delete the channel: " : "Arquivado, mas não consegui apagar o canal: ") + e.message, colour: COR.aviso });
    }
    return;
  }

  return sendEmbed(message.channel, { title: "🎫", description: en ? `Unknown subcommand — \`${P}ticket\`.` : `Subcomando desconhecido — \`${P}ticket\`.`, colour: COR.aviso });

  function semPermissao() {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔒 Sem permissão", description: "Só a staff (ou quem abriu o ticket, no fechar).", colour: COR.aviso },
      { title: "🔒 No permission", description: "Staff only (or the opener, for closing).", colour: COR.aviso }));
  }
}
