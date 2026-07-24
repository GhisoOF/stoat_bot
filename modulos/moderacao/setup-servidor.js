// ══════════════════════════════════════════════════════════
//  setup-servidor.js — Setup GERAL do servidor (onboarding)
//
//  &setup servidor → assistente guiado por reações que:
//   1. Instrui como posicionar o cargo do bot (topo da hierarquia)
//   2. Cria o cargo Staff com permissões de moderação
//   3. Cria a estrutura de categorias/canais:
//      • Staff:     #staff, #log, 🔊 Call Staff   (só staff+bot)
//      • Geral:     #geral, #midia, #comandos, 🔊 Call Geral (todos)
//      • Principal: #avisos, #regras, #registro   (todos leem/reagem; só staff escreve)
//   4. Encadeia os demais setups: punição → autorole → level → rss → automod
//
//  Pensado para servidores recém-criados, mas funciona a qualquer momento
//  (pula o que já existe, não duplica).
//
//  Sessões em ctx.estado.setupServidorSessions: Map(messageId → sessão)
// ══════════════════════════════════════════════════════════

import { Permission } from "stoat.js";

// ── Bits de permissão (verificados na SDK stoat.js 7.3.6) ──
const P = {
  ViewChannel:    Permission.ViewChannel,     // 1048576n
  SendMessage:    Permission.SendMessage,     // 4194304n
  React:          Permission.React,           // 536870912n
  Connect:        Permission.Connect,         // 1073741824n
  Speak:          Permission.Speak,           // 2147483648n
  ManageChannel:  Permission.ManageChannel,   // 1n
  ManageMessages: Permission.ManageMessages,  // 8388608n
  KickMembers:    Permission.KickMembers,     // 64n
  BanMembers:     Permission.BanMembers,      // 128n
  ManageRole:     Permission.ManageRole,      // 8n
  AssignRoles:    Permission.AssignRoles,     // 512n
  TimeoutMembers: Permission.TimeoutMembers,  // 256n
  MuteMembers:    Permission.MuteMembers,
  DeafenMembers:  Permission.DeafenMembers,
  MoveMembers:    Permission.MoveMembers,
};
const somar = (...bits) => bits.reduce((a, b) => a | b, 0n);

// Permissões do cargo Staff (moderação completa, sem administração do servidor)
const PERMS_STAFF = somar(
  P.ViewChannel, P.SendMessage, P.React, P.Connect, P.Speak,
  P.ManageMessages, P.KickMembers, P.BanMembers,
  P.TimeoutMembers, P.AssignRoles,
  P.MuteMembers, P.DeafenMembers, P.MoveMembers,
);

// ── A estrutura a criar ────────────────────────────────────
const ESTRUTURA = [
  {
    categoria: "Staff",
    somenteStaff: true,           // só staff (e o bot) vê
    canais: [
      { nome: "staff",    tipo: "Text",  desc: "Conversa da equipe" },
      { nome: "log",      tipo: "Text",  desc: "Logs do bot" },
      { nome: "Call Staff", tipo: "Voice", desc: "Voz da equipe" },
    ],
  },
  {
    categoria: "Geral",
    canais: [
      { nome: "geral",    tipo: "Text",  desc: "Conversa geral" },
      { nome: "midia",    tipo: "Text",  desc: "Imagens e vídeos" },
      { nome: "comandos", tipo: "Text",  desc: "Use os comandos do bot aqui" },
      { nome: "Call Geral", tipo: "Voice", desc: "Voz para todos" },
    ],
  },
  {
    categoria: "Principal",
    somenteLeitura: true,         // todos leem e reagem; só staff escreve
    canais: [
      { nome: "avisos",   tipo: "Text",  desc: "Avisos da administração" },
      { nome: "regras",   tipo: "Text",  desc: "Regras do servidor" },
      { nome: "registro", tipo: "Text",  desc: "Registre-se aqui" },
    ],
  },
];

// ──────────────────────────────────────────────────────────
//  Entrada: &setup servidor
// ──────────────────────────────────────────────────────────
export async function iniciarSetupServidor(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, getServer, membroTemPermissao, estado } = ctx;

  const server = await getServer(message);
  if (!server) {
    return sendEmbed(message.channel, { title: "❌ Fora de um servidor",
      description: "Este comando só funciona dentro de um servidor.", colour: COR.erro });
  }
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManagePermissions** para o setup do servidor.", colour: COR.erro });
  }

  // Passo 0: instrução sobre o cargo do bot + confirmação para começar
  const msg = await message.channel.sendMessage({ embeds: [{
    title: "🏗️ Setup geral do servidor",
    description: [
      "Vou montar a estrutura básica deste servidor: **cargo Staff**, categorias **Staff / Geral / Principal** com seus canais e permissões, e depois te guio pelos outros setups (punição, autorole, level, RSS e automod).",
      "",
      "**Antes de começar — o cargo do bot:**",
      "Para eu conseguir criar cargos e configurar permissões, o meu cargo precisa estar **acima** dos cargos que vou gerenciar. Vá em **Configurações do servidor → Cargos** e arraste o meu cargo para o **topo** da lista (ou o mais alto possível).",
      "",
      "O que já existir com o mesmo nome eu **não duplico** — só completo o que falta.",
      "",
      "✅ — **Começar** (cargo do bot já está posicionado)",
      "❌ — **Cancelar**",
    ].join("\n"),
    colour: COR.mod,
  }] });

  if (!estado.setupServidorSessions) estado.setupServidorSessions = new Map();
  estado.setupServidorSessions.set(msg.id, {
    userId: message.authorId,
    serverId: ctx.serverId,
    channelId: message.channelId,
    etapa: "confirmar",
  });

  try { await msg.react(encodeURIComponent("✅")); await msg.react(encodeURIComponent("❌")); } catch {}
}

// ──────────────────────────────────────────────────────────
//  Reações do assistente
// ──────────────────────────────────────────────────────────
export async function handleReaction(messageId, userId, emoji, ctx) {
  const sessoes = ctx.estado.setupServidorSessions;
  if (!sessoes?.has(messageId)) return false;
  const sessao = sessoes.get(messageId);
  if (sessao.userId !== userId) return true;   // reação de outra pessoa: ignora mas consome

  const decoded = decodeURIComponent(emoji);
  sessoes.delete(messageId);

  if (sessao.etapa === "confirmar") {
    const canal = ctx.client.channels.get(sessao.channelId);
    if (decoded === "✅") {
      try {
        await executarEstrutura(sessao, ctx);
      } catch (e) {
        console.error("[SETUP-SERVIDOR]", e);
        if (canal) await ctx.sendEmbed(canal, {
          title: "❌ O setup falhou",
          description: `Algo quebrou no meio da montagem:\n\`\`\`\n${(e?.message ?? e).toString().slice(0, 400)}\n\`\`\`\nO que já foi criado permanece. Corrija e rode \`${ctx.PREFIXO}setup servidor\` de novo — ele não duplica o que já existe.`,
          colour: ctx.COR.erro,
        });
      }
    } else {
      if (canal) await ctx.sendEmbed(canal, { title: "🏗️ Setup cancelado",
        description: "Nada foi alterado. Rode `&setup servidor` quando quiser.", colour: ctx.COR.aviso });
    }
    return true;
  }
  return true;
}

// ──────────────────────────────────────────────────────────
//  Execução: cargo staff + estrutura + permissões
// ──────────────────────────────────────────────────────────
async function executarEstrutura(sessao, ctx) {
  const canal = ctx.client.channels.get(sessao.channelId);
  const enviar = (embed) => ctx.sendEmbed(canal, embed);
  const relatorio = [];

  let server;
  try {
    server = await ctx.client.servers.fetch(sessao.serverId);
  } catch {
    return enviar({ title: "❌ Erro", description: "Não consegui acessar o servidor.", colour: ctx.COR.erro });
  }

  await enviar({ title: "🏗️ Montando o servidor…",
    description: "Criando cargo, categorias e canais. Isso leva alguns segundos.", colour: ctx.COR.info });

  // ── 1. Cargo Staff (reusa se existir) ──
  let staffRoleId = null;
  for (const [id, role] of server.roles ?? []) {
    if (/^staff$/i.test(role.name || "")) { staffRoleId = id; break; }
  }
  if (staffRoleId) {
    relatorio.push("👥 Cargo **Staff** já existia — reutilizado.");
  } else {
    try {
      const { id } = await server.createRole("Staff");
      staffRoleId = id;
      relatorio.push("👥 Cargo **Staff** criado.");
    } catch (e) {
      relatorio.push(`⚠️ Não consegui criar o cargo Staff: ${e?.message ?? e}`);
    }
  }
  // permissões do cargo staff no servidor
  if (staffRoleId) {
    try {
      await server.setPermissions(staffRoleId, { allow: Number(PERMS_STAFF), deny: 0 });
      relatorio.push("🔑 Permissões de moderação aplicadas ao Staff.");
    } catch (e) {
      relatorio.push(`⚠️ Permissões do Staff: ${e?.message ?? e}`);
    }
  }

  // ── 2. Canais e categorias ──
  // Mapa dos canais existentes por nome (para não duplicar).
  // ATENÇÃO: client.channels é uma ChannelCollection da SDK — ela NÃO é
  // iterável com for...of (não tem Symbol.iterator). Use toList()/filter()/
  // values(). O fallback cobre o caso de vir um Map comum.
  const existentes = new Map();
  const listaCanais = (() => {
    const col = ctx.client?.channels;
    if (!col) return [];
    if (typeof col.toList === "function") return col.toList();
    if (typeof col.values === "function") return [...col.values()];
    if (typeof col[Symbol.iterator] === "function") return [...col].map((x) => (Array.isArray(x) ? x[1] : x));
    return [];
  })();
  for (const ch of listaCanais) {
    if (ch?.serverId === sessao.serverId && ch?.name) existentes.set(ch.name.toLowerCase(), ch);
  }

  const categoriasNovas = [];   // para o server.edit({categories})
  const categoriasAtuais = server.categories ?? [];

  for (const bloco of ESTRUTURA) {
    const idsDaCategoria = [];
    for (const c of bloco.canais) {
      let ch = existentes.get(c.nome.toLowerCase());
      if (!ch) {
        try {
          ch = await server.createChannel({ type: c.tipo, name: c.nome, description: c.desc });
          relatorio.push(`📁 Canal **${c.nome}** criado.`);
        } catch (e) {
          relatorio.push(`⚠️ Canal ${c.nome}: ${e?.message ?? e}`);
          continue;
        }
      } else {
        relatorio.push(`📁 Canal **${c.nome}** já existia — reutilizado.`);
      }
      idsDaCategoria.push(ch.id);

      // permissões do canal
      try {
        if (bloco.somenteStaff) {
          // default: não vê; staff: tudo
          await ch.setPermissions(undefined, { allow: 0, deny: Number(P.ViewChannel) });
          if (staffRoleId) await ch.setPermissions(staffRoleId, { allow: Number(somar(P.ViewChannel, P.SendMessage, P.React, P.Connect, P.Speak)), deny: 0 });
        } else if (bloco.somenteLeitura) {
          // default: vê e reage, não escreve; staff: escreve
          await ch.setPermissions(undefined, { allow: Number(somar(P.ViewChannel, P.React)), deny: Number(P.SendMessage) });
          if (staffRoleId) await ch.setPermissions(staffRoleId, { allow: Number(somar(P.ViewChannel, P.SendMessage, P.React)), deny: 0 });
        }
        // categoria Geral: permissões padrão do servidor (não mexe)
      } catch (e) {
        relatorio.push(`⚠️ Permissões de ${c.nome}: ${e?.message ?? e}`);
      }
    }
    if (idsDaCategoria.length) {
      categoriasNovas.push({ id: bloco.categoria.toLowerCase(), title: bloco.categoria, channels: idsDaCategoria });
    }
  }

  // aplica a estrutura de categorias (preserva categorias existentes que não são nossas)
  try {
    const nossas = new Set(categoriasNovas.map((c) => c.title.toLowerCase()));
    const preservadas = categoriasAtuais.filter((c) => !nossas.has((c.title || "").toLowerCase()));
    await server.edit({ categories: [...preservadas, ...categoriasNovas] });
    relatorio.push("🗂️ Categorias **Staff / Geral / Principal** organizadas.");
  } catch (e) {
    relatorio.push(`⚠️ Categorias: ${e?.message ?? e}`);
  }

  // salva o canal de log para o módulo de logs, se existir
  const canalLog = existentes.get("log") ?? null;

  // ── 3. Relatório + próximo passo ──
  await enviar({
    title: "✅ Estrutura montada",
    description: relatorio.join("\n").slice(0, 1400),
    colour: ctx.COR.sucesso,
  });

  await enviar({
    title: "🧭 Próximos passos (setups guiados)",
    description: [
      "A estrutura está pronta. Agora configure o resto — recomendo nesta ordem:",
      "",
      `1️⃣ \`${ctx.PREFIXO}setup\` — **punição/automod** (assistente por reações)`,
      `2️⃣ \`${ctx.PREFIXO}autorole set <@cargo>\` — cargo automático a quem entra`,
      `3️⃣ \`${ctx.PREFIXO}setup game\` — sistema de níveis (XP)`,
      `4️⃣ \`${ctx.PREFIXO}rss canal\` (no canal desejado) e \`${ctx.PREFIXO}rss add <url>\` — notícias`,
      `5️⃣ \`${ctx.PREFIXO}log aqui\` no canal **#log** — para os registros do bot`,
      "",
      "_Cada um é opcional — configure só o que for usar._",
    ].join("\n"),
    colour: ctx.COR.mod,
  });
}
