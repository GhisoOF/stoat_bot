// ══════════════════════════════════════════════════════════
//  setup-servidor.js — Setup GERAL e CONTÍNUO do servidor
//
//  &setup servidor → um único comando que monta o servidor inteiro:
//   1. Cria o cargo do BOT (Judy) e dá esse cargo a ela mesma
//   2. Cria o cargo Staff (moderação)
//   3. Cria as categorias na ordem: Staff → Principal → Geral
//      (transforma o canal inicial "General" no #staff)
//   4. Encadeia automaticamente, com padrões seguros:
//      automod · autorole (cria cargo Membro) · RSS · log (no #log) ·
//      XP · reaction-roles (instruções no #registro)
//
//  Roda tudo de uma vez. O usuário pode ajustar/pular cada etapa depois.
//  Não duplica o que já existe.
// ══════════════════════════════════════════════════════════

import { Permission } from "stoat.js";

const P = {
  ViewChannel:    Permission.ViewChannel,
  SendMessage:    Permission.SendMessage,
  React:          Permission.React,
  Connect:        Permission.Connect,
  Speak:          Permission.Speak,
  ManageChannel:  Permission.ManageChannel,
  ManageMessages: Permission.ManageMessages,
  KickMembers:    Permission.KickMembers,
  BanMembers:     Permission.BanMembers,
  ManageRole:     Permission.ManageRole,
  AssignRoles:    Permission.AssignRoles,
  TimeoutMembers: Permission.TimeoutMembers,
  MuteMembers:    Permission.MuteMembers,
  DeafenMembers:  Permission.DeafenMembers,
  MoveMembers:    Permission.MoveMembers,
};
const somar = (...bits) => bits.reduce((a, b) => a | b, 0n);

// Cargo do BOT: ler/escrever/reagir em tudo + gerir para moderar.
const PERMS_BOT = somar(
  P.ViewChannel, P.SendMessage, P.React, P.Connect, P.Speak,
  P.ManageMessages, P.ManageChannel, P.ManageRole, P.AssignRoles,
  P.KickMembers, P.BanMembers, P.TimeoutMembers,
  P.MuteMembers, P.DeafenMembers, P.MoveMembers,
);
// Cargo Staff: moderação, sem administração do servidor.
const PERMS_STAFF = somar(
  P.ViewChannel, P.SendMessage, P.React, P.Connect, P.Speak,
  P.ManageMessages, P.KickMembers, P.BanMembers,
  P.TimeoutMembers, P.AssignRoles, P.MuteMembers, P.DeafenMembers, P.MoveMembers,
);
const PERMS_LER_ESCREVER = somar(P.ViewChannel, P.SendMessage, P.React);

// Estrutura: ordem Staff → Principal → Geral.
const ESTRUTURA = [
  {
    categoria: "Staff",
    somenteStaff: true,
    canais: [
      { nome: "staff",      tipo: "Text",  desc: "Conversa da equipe", ehStaffPrincipal: true },
      { nome: "log",        tipo: "Text",  desc: "Logs do bot", ehLog: true },
      { nome: "Call Staff", tipo: "Voice", desc: "Voz da equipe" },
    ],
  },
  {
    categoria: "Principal",
    somenteLeitura: true,
    canais: [
      { nome: "avisos",   tipo: "Text", desc: "Avisos da administração" },
      { nome: "regras",   tipo: "Text", desc: "Regras do servidor" },
      { nome: "registro", tipo: "Text", desc: "Registre-se aqui", ehRegistro: true },
    ],
  },
  {
    categoria: "Geral",
    canais: [
      { nome: "geral",      tipo: "Text",  desc: "Conversa geral" },
      { nome: "midia",      tipo: "Text",  desc: "Imagens e vídeos" },
      { nome: "comandos",   tipo: "Text",  desc: "Use os comandos do bot aqui" },
      { nome: "Call Geral", tipo: "Voice", desc: "Voz para todos" },
    ],
  },
];

// ── Entrada: &setup servidor ───────────────────────────────
export async function iniciarSetupServidor(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, estado } = ctx;

  const server = await getServer(message);
  if (!server) {
    return sendEmbed(message.channel, { title: "❌ Fora de um servidor",
      description: "Este comando só funciona dentro de um servidor.", colour: COR.erro });
  }
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManagePermissions** para o setup do servidor.", colour: COR.erro });
  }

  // Atalho sem reação: `&setup servidor confirmar` executa direto.
  // Útil quando as reações não chegam (cliente/plataforma) ou para automatizar.
  if (args.some((a) => ["confirmar", "ja", "já", "agora", "-y"].includes(String(a).toLowerCase()))) {
    const sessao = { userId: message.authorId, serverId: ctx.serverId, channelId: message.channelId, etapa: "confirmar" };
    try {
      await executarTudo(sessao, ctx);
    } catch (e) {
      console.error("[SETUP-SERVIDOR]", e);
      return sendEmbed(message.channel, { title: "❌ O setup falhou",
        description: `Quebrou no meio:\n\`\`\`\n${(e?.message ?? e).toString().slice(0, 400)}\n\`\`\`\nO que já foi criado permanece. Rode de novo — não duplico o que já existe.`,
        colour: COR.erro });
    }
    return;
  }

  const msg = await message.channel.sendMessage({ embeds: [{
    title: "🏗️ Setup completo do servidor",
    description: [
      "Vou montar o servidor inteiro de uma vez:",
      "• cargo da **Judy** (eu) e o cargo **Staff**",
      "• categorias **Staff → Principal → Geral** com canais e permissões",
      "• e configuro sozinha, com padrões seguros: **automod, autorole, RSS, log, XP e reaction-roles**.",
      "",
      "Tudo é ajustável depois — nada fica trancado.",
      "",
      "**Antes:** deixe o meu cargo o mais **alto** possível em Configurações → Cargos, senão não consigo gerir os outros cargos.",
      "",
      "✅ — **Começar tudo**   ·   ❌ — **Cancelar**",
      "",
      `_Se as reações não funcionarem no seu cliente, use:_ \`${ctx.PREFIXO}setup servidor confirmar\``,
    ].join("\n"),
    colour: COR.mod,
  }] });

  if (!estado.setupServidorSessions) estado.setupServidorSessions = new Map();
  estado.setupServidorSessions.set(msg.id, {
    userId: message.authorId, serverId: ctx.serverId, channelId: message.channelId, etapa: "confirmar",
  });
  console.log(`[SETUP-SERVIDOR] sessão criada na mensagem ${msg.id} para ${message.authorId}`);
  try { await msg.react(encodeURIComponent("✅")); await msg.react(encodeURIComponent("❌")); } catch (e) {
    console.error("[SETUP-SERVIDOR] falha ao reagir:", e?.message || e);
  }
}

// ── Reações ────────────────────────────────────────────────
export async function handleReaction(messageId, userId, emoji, ctx) {
  const sessoes = ctx.estado.setupServidorSessions;
  if (!sessoes?.has(messageId)) {
    // Diagnóstico: ajuda a descobrir descasamento de ID entre a mensagem
    // enviada e o evento de reação (causa clássica de "cliquei e nada aconteceu").
    if (process.env.SETUP_DEBUG || sessoes?.size) {
      console.log(`[SETUP-SERVIDOR][debug] reação em ${messageId} sem sessão. Sessões abertas: [${[...(sessoes?.keys() ?? [])].join(", ")}]`);
    }
    return false;
  }
  const sessao = sessoes.get(messageId);
  if (sessao.userId !== userId) {
    console.log(`[SETUP-SERVIDOR][debug] reação de ${userId}, mas a sessão é de ${sessao.userId} — ignorando.`);
    return true;
  }

  const decoded = (() => { try { return decodeURIComponent(emoji); } catch { return emoji; } })();
  console.log(`[SETUP-SERVIDOR] reação "${decoded}" aceita de ${userId} — etapa=${sessao.etapa}`);
  sessoes.delete(messageId);

  if (sessao.etapa === "confirmar") {
    const canal = ctx.client.channels.get(sessao.channelId);
    if (decoded === "✅") {
      try {
        await executarTudo(sessao, ctx);
      } catch (e) {
        console.error("[SETUP-SERVIDOR]", e);
        if (canal) await ctx.sendEmbed(canal, { title: "❌ O setup falhou",
          description: `Quebrou no meio:\n\`\`\`\n${(e?.message ?? e).toString().slice(0, 400)}\n\`\`\`\nO que já foi criado permanece. Rode \`${ctx.PREFIXO}setup servidor\` de novo — não duplico o que já existe.`,
          colour: ctx.COR.erro });
      }
    } else if (canal) {
      await ctx.sendEmbed(canal, { title: "🏗️ Cancelado", description: "Nada foi alterado.", colour: ctx.COR.aviso });
    }
    return true;
  }
  return true;
}

// Envio resiliente: tenta o canal preferido; se falhar (bot sem permissão de
// escrever ali, ex.: o canal virou restrito no meio do setup), cai para
// alternativas que o bot controla. Nunca deixa o setup "sumir".
async function enviarResiliente(ctx, canaisPreferidos, embed) {
  for (const ch of canaisPreferidos) {
    if (!ch) continue;
    try { await ch.sendMessage({ embeds: [embed] }); return true; }
    catch { /* tenta o próximo */ }
  }
  // último recurso: manda no privado de quem iniciou (se a SDK permitir)
  console.error("[SETUP-SERVIDOR] não consegui enviar:", embed.title);
  return false;
}


function listarCanais(ctx, serverId) {
  const col = ctx.client?.channels;
  if (!col) return [];
  const arr = typeof col.toList === "function" ? col.toList()
            : typeof col.values === "function" ? [...col.values()] : [];
  return arr.filter((ch) => ch?.serverId === serverId && ch?.name);
}

// ── Execução completa ──────────────────────────────────────
async function executarTudo(sessao, ctx) {
  const canal = ctx.client.channels.get(sessao.channelId);
  const enviar = (embed) => ctx.sendEmbed(canal, embed);
  const rel = [];

  let server;
  try { server = await ctx.client.servers.fetch(sessao.serverId); }
  catch { return enviar({ title: "❌ Erro", description: "Não consegui acessar o servidor.", colour: ctx.COR.erro }); }

  await enviar({ title: "🏗️ Montando tudo…",
    description: "Criando cargos, canais e configurando os módulos. Aguarde alguns segundos.", colour: ctx.COR.info });

  // 1. Cargo do BOT (Judy) + dar a si mesma
  let botRoleId = null;
  for (const [id, role] of server.roles ?? []) if (/^judy$/i.test(role.name || "")) { botRoleId = id; break; }
  if (!botRoleId) {
    try { const { id } = await server.createRole("Judy"); botRoleId = id; rel.push("🤖 Cargo **Judy** criado."); }
    catch (e) { rel.push(`⚠️ Cargo Judy: ${e?.message ?? e}`); }
  } else rel.push("🤖 Cargo **Judy** já existia.");
  if (botRoleId) {
    try { await server.setPermissions(botRoleId, { allow: Number(PERMS_BOT), deny: 0 }); } catch (e) { rel.push(`⚠️ Permissões do bot: ${e?.message ?? e}`); }
    try {
      const eu = server.member;
      if (eu) {
        const atuais = new Set(eu.roles ?? []);
        if (!atuais.has(botRoleId)) { atuais.add(botRoleId); await eu.edit({ roles: [...atuais] }); rel.push("🤖 Dei o cargo Judy a mim mesma."); }
      }
    } catch (e) { rel.push(`⚠️ Auto-cargo: ${e?.message ?? e}`); }
  }

  // 2. Cargo Staff
  let staffRoleId = null;
  for (const [id, role] of server.roles ?? []) if (/^staff$/i.test(role.name || "")) { staffRoleId = id; break; }
  if (!staffRoleId) {
    try { const { id } = await server.createRole("Staff"); staffRoleId = id; rel.push("👥 Cargo **Staff** criado."); }
    catch (e) { rel.push(`⚠️ Cargo Staff: ${e?.message ?? e}`); }
  } else rel.push("👥 Cargo **Staff** já existia.");
  if (staffRoleId) {
    try { await server.setPermissions(staffRoleId, { allow: Number(PERMS_STAFF), deny: 0 }); } catch (e) { rel.push(`⚠️ Permissões do Staff: ${e?.message ?? e}`); }
  }

  try { if (botRoleId && staffRoleId) await server.setRoleOrdering([botRoleId, staffRoleId]); } catch {}

  // 3. Canais e categorias (Staff → Principal → Geral)
  const existentes = new Map();
  for (const ch of listarCanais(ctx, sessao.serverId)) existentes.set(ch.name.toLowerCase(), ch);
  const general = existentes.get("general");
  const refs = {};

  const categoriasNovas = [];
  for (const bloco of ESTRUTURA) {
    const ids = [];
    for (const c of bloco.canais) {
      let ch = existentes.get(c.nome.toLowerCase());
      if (!ch && c.ehStaffPrincipal && general) {
        try { await general.edit?.({ name: c.nome, description: c.desc }); ch = general; existentes.set(c.nome.toLowerCase(), ch); rel.push("♻️ Canal inicial **General** virou **#staff**."); }
        catch {}
      }
      if (!ch) {
        try { ch = await server.createChannel({ type: c.tipo, name: c.nome, description: c.desc }); rel.push(`📁 Canal **${c.nome}** criado.`); }
        catch (e) { rel.push(`⚠️ Canal ${c.nome}: ${e?.message ?? e}`); continue; }
      } else if (!c.ehStaffPrincipal) rel.push(`📁 Canal **${c.nome}** já existia.`);
      ids.push(ch.id);
      if (c.ehStaffPrincipal) refs.staffId = ch.id;
      if (c.ehLog) refs.logId = ch.id;
      if (c.ehRegistro) refs.registroId = ch.id;

      try {
        if (bloco.somenteStaff) {
          await ch.setPermissions(undefined, { allow: 0, deny: Number(P.ViewChannel) });
          if (staffRoleId) await ch.setPermissions(staffRoleId, { allow: Number(somar(P.ViewChannel, P.SendMessage, P.React, P.Connect, P.Speak)), deny: 0 });
          if (botRoleId)   await ch.setPermissions(botRoleId,   { allow: Number(PERMS_LER_ESCREVER), deny: 0 });
        } else if (bloco.somenteLeitura) {
          await ch.setPermissions(undefined, { allow: Number(somar(P.ViewChannel, P.React)), deny: Number(P.SendMessage) });
          if (staffRoleId) await ch.setPermissions(staffRoleId, { allow: Number(somar(P.ViewChannel, P.SendMessage, P.React)), deny: 0 });
          if (botRoleId)   await ch.setPermissions(botRoleId,   { allow: Number(PERMS_LER_ESCREVER), deny: 0 });
        }
      } catch (e) { rel.push(`⚠️ Permissões de ${c.nome}: ${e?.message ?? e}`); }
    }
    if (ids.length) categoriasNovas.push({ id: bloco.categoria.toLowerCase(), title: bloco.categoria, channels: ids });
  }

  try {
    const nossas = new Set(categoriasNovas.map((c) => c.title.toLowerCase()));
    const preservadas = (server.categories ?? []).filter((c) => !nossas.has((c.title || "").toLowerCase()));
    await server.edit({ categories: [...preservadas, ...categoriasNovas] });
    rel.push("🗂️ Categorias organizadas: **Staff → Principal → Geral**.");
  } catch (e) { rel.push(`⚠️ Categorias: ${e?.message ?? e}`); }

  // "Estrutura pronta" vem DEPOIS de aplicar as permissões restritivas, então
  // o canal do comando pode ter ficado sem escrita — usa envio resiliente.
  const canaisRelatorio = [canal, refs.staffId ? ctx.client.channels.get(refs.staffId) : null, refs.logId ? ctx.client.channels.get(refs.logId) : null];
  await enviarResiliente(ctx, canaisRelatorio, { title: "✅ Estrutura pronta", description: rel.join("\n").slice(0, 1800), colour: ctx.COR.sucesso });

  // 4. Configuração contínua dos módulos
  await configurarModulos(server, sessao, ctx, refs, staffRoleId);
}

async function configurarModulos(server, sessao, ctx, refs, staffRoleId) {
  const canalCmd = ctx.client.channels.get(sessao.channelId);
  const canalStaff = refs.staffId ? ctx.client.channels.get(refs.staffId) : null;
  const canalLog = refs.logId ? ctx.client.channels.get(refs.logId) : null;
  // ordem de preferência para os relatórios: onde o comando foi dado →
  // #staff → #log. Assim, se o canal do comando ficou restrito, cai para um
  // canal que o bot controla e não perde o relatório.
  const preferidos = [canalCmd, canalStaff, canalLog];
  const enviar = (embed) => enviarResiliente(ctx, preferidos, embed);
  const feito = [];
  const cfg = ctx.configDoServidor ? ctx.configDoServidor(sessao.serverId) : ctx.config;
  const salvar = () => (ctx.salvarConfigServidor ? ctx.salvarConfigServidor(sessao.serverId) : ctx.salvarConfig?.());

  // 4a. Automod em modo seguro "avisar"
  try { if (cfg.automod?.punicao) { cfg.automod.punicao.modo = "avisar"; feito.push("🛡️ **Automod** em modo *avisar* (não pune sozinho — ajuste com `&setup`)."); } } catch {}

  // 4b. Autorole: cria cargo Membro
  try {
    let membroId = null;
    for (const [id, role] of server.roles ?? []) if (/^membro$/i.test(role.name || "")) { membroId = id; break; }
    if (!membroId) { const { id } = await server.createRole("Membro"); membroId = id; }
    if (membroId) { if (!cfg.autorole) cfg.autorole = {}; cfg.autorole.roleId = membroId; feito.push("🎭 **Autorole**: cargo *Membro* criado e dado a quem entra."); }
  } catch (e) { feito.push(`⚠️ Autorole: ${e?.message ?? e}`); }

  // 4c. Log no #log
  try { if (refs.logId) { if (!cfg.log) cfg.log = {}; cfg.log.canalId = refs.logId; cfg.log.eventos = cfg.log.eventos ?? { membros: true, mensagens: true, moderacao: true }; feito.push("📋 **Log** configurado em **#log**."); } } catch {}

  // 4d. XP ligado
  try { if (cfg.game) { cfg.game.enabled = true; feito.push("🎮 **XP/níveis** ativado (os cargos de nível eu ofereço a seguir)."); } } catch {}

  // 4e. RSS pronto
  feito.push("📰 **RSS** pronto (configuro o canal e o feed a seguir).");

  salvar();

  // 4f. Reaction-roles: instruções COMPLETAS no #registro
  try {
    if (refs.registroId) {
      const chReg = ctx.client.channels.get(refs.registroId);
      if (chReg) {
        const P0 = ctx.PREFIXO;
        await chReg.sendMessage({ embeds: [{
          title: "📝 Como configurar o registro por reação (passo a passo)",
          description: [
            "Este é o canal de registro. A ideia: a pessoa reage numa mensagem e ganha um cargo automaticamente. Te guio:",
            "",
            "**Passo 1 — tenha os cargos prontos.**",
            "Crie em Configurações → Cargos os cargos que quer dar (ex.: *Jogos*, *Avisos*), ou use cargos que já existem.",
            "",
            "**Passo 2 — publique a mensagem de registro.**",
            `Use \`${P0}embed\` e escreva o texto, por exemplo:`,
            "> Reaja abaixo para pegar seus cargos:",
            "> 🎮 — Jogos   ·   📢 — Avisos",
            "",
            "**Passo 3 — ligue cada emoji a um cargo.**",
            "Na mensagem que você publicou, use:",
            `\`${P0}reactionrole add <id-da-mensagem> 🎮 @Jogos\``,
            `\`${P0}reactionrole add <id-da-mensagem> 📢 @Avisos\``,
            `(veja o formato exato com \`${P0}help reactionrole\`)`,
            "",
            "**Pronto.** Quem reagir com 🎮 ganha o cargo Jogos. Ajuste quando quiser com `reactionrole add/remove/list`.",
            "",
            "Travou em algo? Me chame aqui neste canal que eu explico o passo em que você está.",
          ].join("\n"),
          colour: ctx.COR?.mod ?? "#5865F2",
        }] });
        feito.push("🎯 **Reaction-roles**: guia completo publicado em **#registro**.");
      }
    }
  } catch (e) { feito.push(`⚠️ Reaction-roles: ${e?.message ?? e}`); }

  await enviar({ title: "🧭 Estrutura criada", description: feito.join("\n").slice(0, 1800), colour: ctx.COR.sucesso });

  // Em vez de mandar o usuário decorar comandos, seguimos direto no assistente:
  // ele configura punição, automod, log, XP, RSS, IA e moderação por aqui mesmo.
  try {
    const wizard = await import("./wizard.js");
    const msgFalsa = {
      channel: ctx.client.channels.get(sessao.channelId),
      channelId: sessao.channelId,
      authorId: sessao.userId,
      serverId: sessao.serverId,
    };
    if (msgFalsa.channel) {
      await enviar({ title: "🔧 Agora vamos ajustar o resto",
        description: "Vou te perguntar item a item (punição, automod, logs, XP, notícias, IA…).\nPode **pular** qualquer etapa digitando `pular`, ou sair com `sair`.",
        colour: ctx.COR.mod });
      return wizard.iniciar(msgFalsa, ["completo"], ctx);
    }
  } catch (e) {
    console.error("[SETUP-SERVIDOR] não consegui abrir o assistente:", e?.message ?? e);
  }

  await enviar({ title: "🔧 Ajustes finos",
    description: `Rode \`${ctx.PREFIXO}setup\` para configurar punição, automod, logs, XP, notícias e IA — tudo por lá, passo a passo.`,
    colour: ctx.COR.mod });
}
