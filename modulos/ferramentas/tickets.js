// &ticket — suporte com canal privado por pedido, comandado por REAÇÕES
// (pedido de Ghieh, 1 out 2026).
//
//   painel  → a staff escolhe um canal e o bot posta lá uma mensagem com uma
//             reação por categoria (🎫 Suporte, 🚨 Denúncia, 💡 Sugestão…).
//             Reagiu = abriu um ticket daquela categoria.
//   ticket  → canal privado (quem abriu + staff) com uma mensagem de controle:
//             🔒 fecha — só a staff.
//   fechar  → a conversa TRAVA (quem abriu continua vendo, não escreve mais),
//             o registro inteiro vai para o canal de log como um arquivo .txt,
//             e o canal ganha um 🗑️ para a staff apagar quando quiser.
// Os comandos (&ticket abrir/fechar/apagar) continuam valendo para quem
// prefere digitar. Permissões no servidor: ManageChannel, ManageRole,
// AssignRoles, ManagePermissions — e ManageMessages para limpar as reações.

import * as db from "../core/db.js";
import { tr, lingua } from "../core/i18n.js";
import { descreverErro } from "../core/erros.js";
import { subirAnexo } from "../core/anexos.js";
import { chamarApi } from "../core/stoat-api.js";

const DENY_TUDO = 0x000fffffffffffffn;            // mesmo GRANT_ALL_SAFE do resto do bot
const VER_E_LER = (1n << 20n) | (1n << 21n);      // ViewChannel + ReadMessageHistory
const MAX_MSGS_TRANSCRICAO = Number(process.env.TICKET_MAX_MSGS || 1000);
export const E_FECHAR = "🔒";
export const E_APAGAR = "🗑️";
export const CATEGORIAS_PADRAO = [
  { emoji: "🎫", nome: "Suporte" },
  { emoji: "🚨", nome: "Denúncia" },
  { emoji: "💡", nome: "Sugestão" },
];
export const CATEGORIAS_PADRAO_EN = [
  { emoji: "🎫", nome: "Support" },
  { emoji: "🚨", nome: "Report" },
  { emoji: "💡", nome: "Suggestion" },
];

const semVS = (e) => { let v = String(e ?? ""); try { v = decodeURIComponent(v); } catch {} return v.replace(/\uFE0F/g, ""); };
const mesmoEmoji = (a, b) => semVS(a) === semVS(b);
const num4 = (n) => String(n).padStart(4, "0");

function garantirCfg(config) {
  config.tickets ??= {};
  const c = config.tickets;
  c.contador ??= 0;
  c.logCanal ??= null;
  // os assuntos padrão no idioma do servidor (e trocam junto se ninguém mexeu neles)
  const en = config.language === "en";
  const padrao = (en ? CATEGORIAS_PADRAO_EN : CATEGORIAS_PADRAO).map((x) => ({ ...x }));
  const ehPadrao = (lista) => JSON.stringify(lista) === JSON.stringify(CATEGORIAS_PADRAO) || JSON.stringify(lista) === JSON.stringify(CATEGORIAS_PADRAO_EN);
  if (!c.categorias || ehPadrao(c.categorias)) c.categorias = padrao;
  c.painel ??= null;   // { canalId, msgId }
  return c;
}

// ── Transcrição (puro, testável) ────────────────────────────────────────────
export function formatarTranscricao(mensagens, { nomeCanal = "ticket", en = false, cabecalho = [] } = {}) {
  // mensagens: [{autor, quando, texto, anexos, embeds}] em ordem cronológica
  const linhas = [en ? `Transcript of #${nomeCanal}` : `Transcrição de #${nomeCanal}`, ...cabecalho, "─".repeat(40)];
  for (const m of mensagens) {
    const hora = m.quando ? new Date(m.quando).toISOString().replace("T", " ").slice(0, 19) : "??";
    const partes = [];
    const texto = String(m.texto ?? "").trim();
    if (texto) partes.push(texto);
    for (const e of m.embeds ?? []) {
      const t = [e.title, e.description].filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
      if (t) partes.push(`[embed] ${t}`);
    }
    if (m.anexos) partes.push(en ? `(${m.anexos} attachment(s))` : `(${m.anexos} anexo(s))`);
    linhas.push(`[${hora}] ${m.autor}: ${partes.join(" ") || (en ? "(empty)" : "(vazio)")}`);
  }
  return linhas.join("\n");
}

export function fatiarTranscricao(texto, tamanho = 1800) {
  const fatias = [];
  let atual = "";
  for (const l of String(texto ?? "").split("\n")) {
    if ((atual + "\n" + l).length > tamanho && atual) { fatias.push(atual); atual = l; }
    else atual = atual ? atual + "\n" + l : l;
  }
  if (atual) fatias.push(atual);
  return fatias;
}

async function coletarHistorico(canal) {
  const todas = [];
  let antes;
  while (todas.length < MAX_MSGS_TRANSCRICAO) {
    const lote = await canal.fetchMessages?.({ limit: 100, ...(antes ? { before: antes } : {}) }).catch(() => null);
    if (!lote?.length) break;
    todas.push(...lote);
    if (lote.length < 100) break;
    antes = lote[lote.length - 1].id;
  }
  return todas.slice(0, MAX_MSGS_TRANSCRICAO).reverse().map((m) => ({
    autor: m.member?.nickname ?? m.author?.username ?? m.authorId ?? "?",
    quando: m.createdAt ?? m.created_at ?? null,
    texto: m.content ?? "",
    anexos: m.attachments?.length ?? 0,
    embeds: (m.embeds ?? []).map((e) => ({ title: e.title ?? null, description: e.description ?? null })),
  }));
}

// ── Quem é staff (para 🔒 e 🗑️) ─────────────────────────────────────────────
export async function ehStaff(server, userId, config) {
  if (!server || !userId) return false;
  if (server.ownerId === userId) return true;
  const membro = await server.fetchMember?.(userId).catch(() => null);
  if (!membro) return false;
  const cargos = (membro.roles ?? []).map((r) => r?.id ?? r);
  if ((config?.acesso?.cargosStaff ?? []).some((r) => cargos.includes(r))) return true;
  try { return !!membro.hasPermission?.(server, "ManageChannel"); } catch { return false; }
}

const canalPorId = async (client, id) => client?.channels?.get?.(id) ?? await client?.channels?.fetch?.(id).catch(() => null) ?? null;

// Tira a reação da pessoa (para a mensagem não acumular e dar para reagir de novo).
async function tirarReacao(canalId, msgId, emoji, userId) {
  await chamarApi(`/channels/${canalId}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}?user_id=${userId}`, { metodo: "DELETE" });
}

// ── Painel ───────────────────────────────────────────────────────────────────
export async function publicarPainel({ ctx, canal }) {
  const cfg = garantirCfg(ctx.config);
  const en = lingua(ctx) === "en";
  // o painel antigo deixa de valer
  if (cfg.painel?.msgId) {
    db.esquecerMsgTicket(cfg.painel.msgId);
    const velho = await canalPorId(ctx.client, cfg.painel.canalId);
    await velho?.fetchMessage?.(cfg.painel.msgId).then((m) => m?.delete?.()).catch(() => {});
  }
  const msg = await ctx.sendEmbed(canal, {
    title: en ? "🎫 Open a ticket" : "🎫 Abrir um ticket",
    description: [
      en ? "React with the topic and I'll open a **private channel** between you and the staff:" : "Reaja com o assunto e eu abro um **canal privado** entre você e a staff:",
      "",
      ...cfg.categorias.map((c) => `${c.emoji} — **${c.nome}**`),
      "",
      en ? "_One open ticket per person at a time._" : "_Um ticket aberto por pessoa de cada vez._",
    ].join("\n"),
    colour: ctx.COR.info,
  });
  if (!msg?.id) throw new Error(en ? "I couldn't post in that channel" : "não consegui postar nesse canal");
  for (const c of cfg.categorias) await msg.react?.(encodeURIComponent(c.emoji)).catch(() => msg.react?.(c.emoji).catch(() => {}));
  db.registrarMsgTicket(msg.id, ctx.serverId, canal.id ?? canal._id, "painel");
  cfg.painel = { canalId: canal.id ?? canal._id, msgId: msg.id };
  ctx.salvarConfig?.();
  return msg;
}

// ── Abrir ────────────────────────────────────────────────────────────────────
export async function abrirTicket({ ctx, server, userId, motivo = "", categoria = null }) {
  const cfg = garantirCfg(ctx.config);
  const en = lingua(ctx) === "en";
  const lang = en ? "en" : "pt";
  const jaTem = db.listarTickets(ctx.serverId).find((t) => t.autorId === userId);
  if (jaTem) return { jaTem: jaTem.canalId };
  if (!cfg.logCanal) return { semLog: true };

  const numero = ++cfg.contador;
  ctx.salvarConfig?.();
  const nome = `ticket-${num4(numero)}`;
  let roleId = null, canal = null;
  try {
    const criado = await server.createRole(nome);
    roleId = criado?.id ?? criado?.role?._id ?? criado?.role?.id;
    if (!roleId) throw new Error(en ? "the API didn't return the role id (missing ManageRole?)" : "a API não devolveu o id do cargo (falta ManageRole?)");
    // o cargo vai para quem abriu E para o bot (senão o bot se tranca fora)
    for (const uid of [userId, ctx.client?.user?.id].filter(Boolean)) {
      const membro = await server.fetchMember(uid).catch(() => null);
      if (!membro) continue;
      const atuais = new Set((membro.roles ?? []).map((r) => r?.id ?? r).filter(Boolean));
      atuais.add(roleId);
      await membro.edit({ roles: [...atuais] }).catch((e) => { throw new Error(descreverErro(e, lang)); });
    }
    const descricao = [categoria?.nome, motivo].filter(Boolean).join(" — ") || (en ? "Support ticket" : "Ticket de suporte");
    canal = await server.createChannel({ type: "Text", name: nome, description: descricao.slice(0, 1000) });
    if (!canal?.id) throw new Error(en ? "the API didn't return the channel (missing ManageChannel?)" : "a API não devolveu o canal (falta ManageChannel?)");
    await canal.setPermissions("default", { allow: 0, deny: Number(DENY_TUDO) }).catch((e) => { throw new Error(descreverErro(e, lang)); });
    await canal.setPermissions(roleId, { allow: Number(DENY_TUDO), deny: 0 }).catch((e) => { throw new Error(descreverErro(e, lang)); });
    for (const staffRole of ctx.config?.acesso?.cargosStaff ?? []) {
      await canal.setPermissions(staffRole, { allow: Number(DENY_TUDO), deny: 0 }).catch(() => {});
    }
  } catch (e) {
    try { if (canal?.delete) await canal.delete(); } catch {}
    try { if (roleId) await server.deleteRole?.(roleId); } catch {}
    return { erro: e instanceof Error ? e.message : descreverErro(e, lang) };
  }

  const ticketId = db.criarTicket(ctx.serverId, numero, canal.id, roleId, userId, motivo, categoria?.nome ?? null);
  const controle = await ctx.sendEmbed(canal, tr(ctx, {
    title: `${categoria?.emoji ?? "🎫"} Ticket #${numero}${categoria ? ` — ${categoria.nome}` : ""}`,
    description: [
      `Aberto por <@${userId}>${motivo ? `\n**Motivo:** ${motivo}` : ""}`,
      "",
      "Só você e a staff enxergam este canal. Conte o que precisa.",
      "",
      `${E_FECHAR} — **a staff fecha o ticket**: a conversa trava e o registro vai para o log.`,
    ].join("\n"),
    colour: ctx.COR.sucesso,
  }, {
    title: `${categoria?.emoji ?? "🎫"} Ticket #${numero}${categoria ? ` — ${categoria.nome}` : ""}`,
    description: [
      `Opened by <@${userId}>${motivo ? `\n**Reason:** ${motivo}` : ""}`,
      "",
      "Only you and staff can see this channel. Tell us what you need.",
      "",
      `${E_FECHAR} — **staff closes the ticket**: the conversation locks and the record goes to the log.`,
    ].join("\n"),
    colour: ctx.COR.sucesso,
  }));
  if (controle?.id) {
    await controle.react?.(encodeURIComponent(E_FECHAR)).catch(() => {});
    db.registrarMsgTicket(controle.id, ctx.serverId, canal.id, "controle", ticketId);
  }
  return { ok: true, canal, numero, ticketId };
}

// ── Fechar ───────────────────────────────────────────────────────────────────
export async function fecharTicket({ ctx, server, ticket, porId, nota = "" }) {
  const cfg = garantirCfg(ctx.config);
  const en = lingua(ctx) === "en";
  const canal = await canalPorId(ctx.client, ticket.canalId);
  const nome = `ticket-${num4(ticket.numero)}`;
  const msgs = canal ? await coletarHistorico(canal) : [];
  const dur = ticket.abertoEm ? Math.round((Date.now() - new Date(ticket.abertoEm).getTime()) / 60000) : null;
  const agoraIso = new Date().toISOString().replace("T", " ").slice(0, 19);
  const texto = formatarTranscricao(msgs, { nomeCanal: nome, en, cabecalho: [
    `${en ? "Category" : "Categoria"}: ${ticket.categoria ?? "—"}`,
    `${en ? "Opened by" : "Aberto por"}: ${ticket.autorId} · ${ticket.abertoEm?.replace("T", " ").slice(0, 19) ?? "?"} UTC`,
    `${en ? "Closed by" : "Fechado por"}: ${porId} · ${agoraIso} UTC`,
    ticket.motivo ? `${en ? "Reason" : "Motivo"}: ${ticket.motivo}` : null,
    nota ? `${en ? "Closing note" : "Nota de fechamento"}: ${nota}` : null,
  ].filter(Boolean) });

  // 1) trava: quem abriu continua vendo, mas não escreve, não reage, não envia nada
  let travou = false;
  if (canal && ticket.roleId) {
    try {
      await canal.setPermissions(ticket.roleId, { allow: Number(VER_E_LER), deny: Number(DENY_TUDO & ~VER_E_LER) });
      travou = true;
    } catch (e) { console.error(`[TICKET] não travei ${nome}: ${descreverErro(e)}`); }
  }

  // 2) o registro vai para o log como .txt (e, se o upload falhar, em blocos de texto)
  const logCanal = cfg.logCanal ? await canalPorId(ctx.client, cfg.logCanal) : null;
  let arquivo = false;
  if (logCanal) {
    let anexoId = null;
    try {
      anexoId = await subirAnexo({ base64: Buffer.from(texto, "utf8").toString("base64"), mime: "text/plain", nome: `${nome}.txt` }, ctx.client);
    } catch (e) { console.error(`[TICKET] upload do .txt falhou: ${e?.message ?? e}`); }
    await ctx.sendEmbed(logCanal, {
      title: `🗂️ Ticket #${ticket.numero} ${en ? "closed" : "fechado"}`,
      description: [
        `${en ? "Opened by" : "Aberto por"} <@${ticket.autorId}> · ${en ? "closed by" : "fechado por"} <@${porId}>`,
        ticket.categoria ? `**${en ? "Category" : "Categoria"}:** ${ticket.categoria}` : null,
        ticket.motivo ? `**${en ? "Reason" : "Motivo"}:** ${ticket.motivo}` : null,
        nota ? `**${en ? "Closing note" : "Nota de fechamento"}:** ${nota}` : null,
        `${msgs.length} ${en ? "message(s)" : "mensagem(ns)"}${dur != null ? ` · ${dur} min` : ""} · <#${ticket.canalId}>`,
        anexoId ? (en ? "📎 Full record attached." : "📎 Registro completo no arquivo anexo.") : null,
      ].filter(Boolean).join("\n"),
      colour: ctx.COR.mod ?? ctx.COR.info,
      anexos: anexoId ? [anexoId] : null,
    });
    if (anexoId) arquivo = true;
    else for (const fatia of fatiarTranscricao(texto)) {
      await logCanal.sendMessage?.({ content: "```text\n" + fatia + "\n```" }).catch(() => {});
    }
  }

  db.marcarTicketFechado(ticket.id, porId);
  for (const m of db.getDb().prepare("SELECT msgId FROM ticket_mensagens WHERE ticketId = ? AND tipo = 'controle'").all(ticket.id)) db.esquecerMsgTicket(m.msgId);

  // 3) aviso no próprio canal, com o 🗑️ para a staff apagar depois
  if (canal) {
    const aviso = await ctx.sendEmbed(canal, tr(ctx, {
      title: `${E_FECHAR} Ticket fechado`,
      description: [
        `Fechado por <@${porId}>.${nota ? `\n**Nota:** ${nota}` : ""}`,
        travou ? "A conversa está travada: dá para ler, não dá para escrever." : "⚠️ Não consegui travar o canal (falta ManagePermissions?).",
        logCanal ? `O registro completo foi para <#${cfg.logCanal}>.` : "⚠️ Sem canal de log configurado — o registro não foi guardado.",
        "",
        `${E_APAGAR} — a staff apaga este canal.`,
      ].join("\n"),
      colour: ctx.COR.aviso,
    }, {
      title: `${E_FECHAR} Ticket closed`,
      description: [
        `Closed by <@${porId}>.${nota ? `\n**Note:** ${nota}` : ""}`,
        travou ? "The conversation is locked: it can be read, not written." : "⚠️ I couldn't lock the channel (missing ManagePermissions?).",
        logCanal ? `The full record went to <#${cfg.logCanal}>.` : "⚠️ No log channel set — the record wasn't kept.",
        "",
        `${E_APAGAR} — staff deletes this channel.`,
      ].join("\n"),
      colour: ctx.COR.aviso,
    })).catch(() => null);
    if (aviso?.id) {
      await aviso.react?.(encodeURIComponent(E_APAGAR)).catch(() => {});
      db.registrarMsgTicket(aviso.id, ctx.serverId, ticket.canalId, "fechado", ticket.id);
    }
  }
  return { ok: true, travou, arquivo, mensagens: msgs.length };
}

// ── Apagar (depois de fechado) ───────────────────────────────────────────────
export async function apagarTicket({ ctx, server, ticket }) {
  const canal = await canalPorId(ctx.client, ticket.canalId);
  try { if (ticket.roleId) await server?.deleteRole?.(ticket.roleId); } catch {}
  try { await canal?.delete?.(); } catch (e) { return { erro: descreverErro(e) }; }
  db.marcarTicketApagado(ticket.id);
  for (const m of db.getDb().prepare("SELECT msgId FROM ticket_mensagens WHERE ticketId = ?").all(ticket.id)) db.esquecerMsgTicket(m.msgId);
  return { ok: true };
}

// ── Reações (painel 🎫, controle 🔒, fechado 🗑️) ─────────────────────────────
// `criarContexto(serverId)` vem do main: a reação chega sem servidor.
export async function aoReagir(msgObj, userId, emoji, { client, criarContexto }) {
  const msgId = msgObj?.id ?? msgObj?._id ?? msgObj;
  const reg = msgId ? db.msgTicket(msgId) : null;
  if (!reg || !userId || userId === client?.user?.id) return false;
  const ctx = { ...criarContexto(reg.serverId), client };
  const server = await client.servers.fetch(reg.serverId).catch(() => null);
  if (!server) return true;
  const avisar = async (txtPt, txtEn) => {
    const canal = await canalPorId(client, reg.canalId);
    const m = await ctx.sendEmbed(canal, tr(ctx, { description: txtPt, colour: ctx.COR.aviso }, { description: txtEn, colour: ctx.COR.aviso })).catch(() => null);
    if (m?.delete) setTimeout(() => m.delete().catch(() => {}), 15_000);
  };

  if (reg.tipo === "painel") {
    const cfg = garantirCfg(ctx.config);
    const categoria = cfg.categorias.find((c) => mesmoEmoji(c.emoji, emoji));
    if (!categoria) return true;
    await tirarReacao(reg.canalId, msgId, emoji, userId);
    const r = await abrirTicket({ ctx, server, userId, categoria });
    if (r.jaTem) await avisar(`<@${userId}>, você já tem um ticket aberto: <#${r.jaTem}>`, `<@${userId}>, you already have an open ticket: <#${r.jaTem}>`);
    else if (r.semLog) await avisar("A staff ainda não definiu o canal de log dos tickets (`&ticket log #canal`).", "Staff hasn't set the tickets' log channel yet (`&ticket log #channel`).");
    else if (r.erro) { console.error(`[TICKET] abrir falhou: ${r.erro}`); await avisar(`Não consegui abrir o ticket: ${r.erro}`, `I couldn't open the ticket: ${r.erro}`); }
    return true;
  }

  const ticket = reg.ticketId ? db.ticketPorId(reg.ticketId) : null;
  if (!ticket) return true;
  if (reg.tipo === "controle" && mesmoEmoji(emoji, E_FECHAR)) {
    if (!(await ehStaff(server, userId, ctx.config))) {
      await tirarReacao(reg.canalId, msgId, emoji, userId);
      await avisar(`<@${userId}>, só a staff fecha o ticket.`, `<@${userId}>, only staff can close the ticket.`);
      return true;
    }
    if (ticket.status === "aberto") await fecharTicket({ ctx, server, ticket, porId: userId });
    return true;
  }
  if (reg.tipo === "fechado" && mesmoEmoji(emoji, E_APAGAR)) {
    if (!(await ehStaff(server, userId, ctx.config))) { await tirarReacao(reg.canalId, msgId, emoji, userId); return true; }
    await apagarTicket({ ctx, server, ticket });
    return true;
  }
  return true;
}

// ── Comando ─────────────────────────────────────────────────────────────────
export async function cmdTicket(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId, config, salvarConfig, getServer, membroTemPermissao } = ctx;
  const en = lingua(ctx) === "en";
  const sub = String(args[0] ?? "").toLowerCase();
  const server = await getServer(message).catch(() => null);
  const staff = ctx.temCargoStaff?.(message, config) || membroTemPermissao(message, server, "ManageChannel");
  const cfg = garantirCfg(config);
  const enviar = (title, description, colour = COR.info) => sendEmbed(message.channel, { title, description, colour });
  const semPermissao = () => enviar(en ? "🔒 No permission" : "🔒 Sem permissão", en ? "Staff only." : "Só a staff.", COR.aviso);

  if (!sub || ["ajuda", "help"].includes(sub)) {
    return enviar(en ? "🎫 Support tickets" : "🎫 Tickets de suporte", (en ? [
      `\`${P}ticket painel #channel\` — posts the panel: people **react** with a topic to open a ticket (staff)`,
      `\`${P}ticket categorias\` — the panel's topics · \`${P}ticket categorias 🎫 Support | 🚨 Report\` changes them (staff)`,
      `\`${P}ticket log #channel\` — where the **.txt record** of each closed ticket goes (staff)`,
      `\`${P}ticket lista\` — open tickets (staff)`,
      "",
      `Inside the ticket: ${E_FECHAR} closes it (staff) — the chat locks and the record goes to the log; then ${E_APAGAR} deletes the channel.`,
      `_Typing works too: \`${P}ticket abrir [reason]\` · \`${P}ticket fechar [note]\` · \`${P}ticket apagar\`._`,
    ] : [
      `\`${P}ticket painel #canal\` — posta o painel: as pessoas **reagem** com o assunto para abrir um ticket (staff)`,
      `\`${P}ticket categorias\` — os assuntos do painel · \`${P}ticket categorias 🎫 Suporte | 🚨 Denúncia\` troca (staff)`,
      `\`${P}ticket log #canal\` — para onde vai o **registro .txt** de cada ticket fechado (staff)`,
      `\`${P}ticket lista\` — tickets abertos (staff)`,
      "",
      `Dentro do ticket: ${E_FECHAR} fecha (staff) — o chat trava e o registro vai para o log; depois ${E_APAGAR} apaga o canal.`,
      `_Também dá para digitar: \`${P}ticket abrir [motivo]\` · \`${P}ticket fechar [nota]\` · \`${P}ticket apagar\`._`,
    ]).join("\n"));
  }

  if (sub === "painel" || sub === "panel") {
    if (!staff) return semPermissao();
    const id = String(args[1] ?? "").replace(/[<#>]/g, "") || message.channelId;
    const canal = await canalPorId(ctx.client, id);
    if (!canal) return enviar("🎫", en ? "I couldn't find that channel." : "Não achei esse canal.", COR.aviso);
    try { await publicarPainel({ ctx, canal }); }
    catch (e) { return enviar("🎫", `${en ? "I couldn't post the panel" : "Não consegui postar o painel"}: ${e?.message ?? descreverErro(e)}`, COR.aviso); }
    const avisoLog = cfg.logCanal ? "" : (en ? `\n\n⚠️ Set the log first: \`${P}ticket log #channel\` — without it nobody can open a ticket.` : `\n\n⚠️ Defina o log antes: \`${P}ticket log #canal\` — sem ele ninguém consegue abrir ticket.`);
    return enviar("🎫", (en ? `Panel posted in <#${canal.id}>.` : `Painel postado em <#${canal.id}>.`) + avisoLog, avisoLog ? COR.aviso : COR.sucesso);
  }

  if (sub === "categorias" || sub === "categories") {
    const resto = args.slice(1).join(" ").trim();
    if (resto) {
      if (!staff) return semPermissao();
      const novas = resto.split("|").map((x) => x.trim()).filter(Boolean).map((x) => {
        const [emoji, ...nome] = x.split(/\s+/);
        return { emoji, nome: nome.join(" ").slice(0, 40) };
      }).filter((c) => c.emoji && c.nome);
      if (!novas.length || novas.length > 10) return enviar("❌", en ? `\`${P}ticket categorias 🎫 Support | 🚨 Report\` (1 to 10)` : `\`${P}ticket categorias 🎫 Suporte | 🚨 Denúncia\` (de 1 a 10)`, COR.erro);
      cfg.categorias = novas;
      salvarConfig();
    }
    return enviar(en ? "🎫 Panel topics" : "🎫 Assuntos do painel",
      cfg.categorias.map((c) => `${c.emoji} — ${c.nome}`).join("\n")
      + (resto ? (en ? `\n\n_Repost the panel to apply: \`${P}ticket painel #channel\`._` : `\n\n_Poste o painel de novo para valer: \`${P}ticket painel #canal\`._`) : ""), resto ? COR.sucesso : COR.info);
  }

  if (sub === "log") {
    if (!staff) return semPermissao();
    const canalId = ctx.limparId?.(args[1]) || String(args[1] ?? "").replace(/[<#>]/g, "");
    if (!canalId) return enviar("🎫", en ? "Which channel?" : "Qual canal?", COR.aviso);
    cfg.logCanal = canalId;
    salvarConfig();
    return enviar("🎫", (en ? "The .txt record of each closed ticket goes to " : "O registro .txt de cada ticket fechado vai para ") + `<#${canalId}>.`, COR.sucesso);
  }

  if (sub === "lista" || sub === "list") {
    if (!staff) return semPermissao();
    const abertos = db.listarTickets(serverId);
    return enviar(en ? "🎫 Open tickets" : "🎫 Tickets abertos", abertos.length
      ? abertos.map((t) => `**#${t.numero}** <#${t.canalId}> — <@${t.autorId}>${t.categoria ? ` · ${t.categoria}` : ""}${t.motivo ? ` · _${t.motivo.slice(0, 60)}_` : ""}`).join("\n")
      : (en ? "None." : "Nenhum."));
  }

  if (["abrir", "open", "novo"].includes(sub)) {
    if (!server) return enviar("🎫", "⚠️", COR.aviso);
    const r = await abrirTicket({ ctx: { ...ctx, client: ctx.client }, server, userId: message.authorId, motivo: args.slice(1).join(" ").trim().slice(0, 200) });
    if (r.jaTem) return enviar("🎫", (en ? "You already have an open ticket: " : "Você já tem um ticket aberto: ") + `<#${r.jaTem}>`, COR.aviso);
    if (r.semLog) return enviar(en ? "🎫 Setup needed" : "🎫 Falta configurar", en ? `Staff must first set where records go: \`${P}ticket log #channel\`.` : `Antes do primeiro ticket, a staff define para onde vão os registros: \`${P}ticket log #canal\`.`, COR.aviso);
    if (r.erro) return enviar("🎫", (en ? "I couldn't open the ticket: " : "Não consegui abrir o ticket: ") + r.erro + "\n" + (en
      ? "The bot needs **ManageChannel, ManageRole, AssignRoles, ManagePermissions** — and its role must be ABOVE the roles it creates."
      : "O bot precisa de **ManageChannel, ManageRole, AssignRoles, ManagePermissions** — e o cargo dele precisa estar ACIMA dos cargos que ele cria."), COR.aviso);
    return enviar("🎫", (en ? "Ticket open: " : "Ticket aberto: ") + `<#${r.canal.id}>`, COR.sucesso);
  }

  if (["fechar", "close", "encerrar"].includes(sub)) {
    const ticket = db.ticketPorCanal(message.channelId);
    if (!ticket) return enviar("🎫", en ? "This isn't an open ticket channel." : "Este canal não é de um ticket aberto.", COR.aviso);
    if (!staff) return semPermissao();
    await fecharTicket({ ctx, server, ticket, porId: message.authorId, nota: args.slice(1).join(" ").trim().slice(0, 200) });
    return;
  }

  if (["apagar", "delete", "excluir"].includes(sub)) {
    const ticket = db.ticketDoCanal(message.channelId);
    if (!ticket || ticket.status === "apagado") return enviar("🎫", en ? "This isn't a ticket channel." : "Este canal não é de um ticket.", COR.aviso);
    if (!staff) return semPermissao();
    if (ticket.status === "aberto") return enviar("🎫", en ? `Close it first (${E_FECHAR} or \`${P}ticket fechar\`) — that's what saves the record.` : `Feche antes (${E_FECHAR} ou \`${P}ticket fechar\`) — é o fechar que guarda o registro.`, COR.aviso);
    const r = await apagarTicket({ ctx, server, ticket });
    if (r.erro) return enviar("🎫", (en ? "I couldn't delete the channel: " : "Não consegui apagar o canal: ") + r.erro, COR.aviso);
    return;
  }

  return enviar("🎫", en ? `Unknown subcommand — \`${P}ticket\`.` : `Subcomando desconhecido — \`${P}ticket\`.`, COR.aviso);
}
