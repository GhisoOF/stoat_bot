// ══════════════════════════════════════════════════════════
//  wizard.js — assistente ÚNICO de configuração (&setup)
//
//  Objetivos deste módulo:
//   • Configurar TUDO por aqui dentro — sem mandar o usuário
//     rodar outros comandos depois.
//   • Toda etapa é PULÁVEL (⏭️ ou digitando "pular").
//   • Dois caminhos: PERFIL pronto (rápido) ou COMPLETO (passo a passo).
//   • Cada passo aceita REAÇÃO **ou** TEXTO digitado (o número da
//     opção, a palavra, ou o valor pedido). Isso é essencial: quando
//     o Stoat falha em adicionar as reações, o wizard continua usável.
//
//  Estado em ctx.estado.wizardSessions:
//    Map(messageId → sessao)          → para reações
//    Map("canal:usuario" → sessao)    → para respostas em texto
// ══════════════════════════════════════════════════════════

import { criarCargoMudo } from "./comandos-admin.js";
import { criarCargos as criarCargosNivel } from "../ferramentas/nivel.js";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const log = (...a) => console.log("[WIZARD]", ...a);

// ── Utilidades de estado ──────────────────────────────────
function mapas(ctx) {
  ctx.estado.wizardSessions ??= new Map();     // messageId → sessao
  ctx.estado.wizardPorUsuario ??= new Map();   // "canal:user" → sessao
  return { porMsg: ctx.estado.wizardSessions, porUser: ctx.estado.wizardPorUsuario };
}
const chaveUser = (canalId, userId) => `${canalId}:${userId}`;

function encerrar(ctx, sessao) {
  const { porMsg, porUser } = mapas(ctx);
  if (sessao?.msgId) porMsg.delete(sessao.msgId);
  if (sessao) porUser.delete(chaveUser(sessao.channelId, sessao.userId));
}

// Compara emojis ignorando variações (️, %E2%9C%85 etc.)
function casaEmoji(recebido, alvo) {
  if (!recebido) return false;
  let r = String(recebido);
  try { r = decodeURIComponent(r); } catch {}
  const limpa = (s) => String(s).replace(/\uFE0F/g, "").trim();
  return limpa(r) === limpa(alvo);
}

// ══════════════════════════════════════════════════════════
//  PASSOS — cada um se aplica sozinho na config
// ══════════════════════════════════════════════════════════
const PASSOS = {
  // ── PUNIÇÃO ────────────────────────────────────────────
  punicao_modo: {
    titulo: "⚖️ Política de punição",
    ajuda: "**Como punir quem quebra as regras?**\nVale para todos os automods.",
    opcoes: [
      { emoji: "👁️", rotulo: "Só avisar", valor: "avisar", nota: "não remove nada — bom para testar" },
      { emoji: "🧹", rotulo: "Só apagar", valor: "apagar", nota: "remove a mensagem, não pune a pessoa" },
      { emoji: "⚠️", rotulo: "Confirmar", valor: "confirmar", nota: "apaga, silencia e chama um moderador" },
      { emoji: "📊", rotulo: "Acumular avisos", valor: "acumular", nota: "bane ao atingir o limite" },
      { emoji: "🔨", rotulo: "Banir na hora", valor: "banir", nota: "sem segunda chance" },
    ],
    aplicar: (v, ctx) => { ctx.config.automod.punicao.modo = v; return `punição: **${v}**`; },
  },

  punicao_warns: {
    titulo: "🔢 Avisos até o ban",
    quando: (r) => r.punicao_modo === "acumular",
    opcoes: [
      { emoji: "3️⃣", rotulo: "3 avisos", valor: 3 },
      { emoji: "5️⃣", rotulo: "5 avisos", valor: 5 },
      { emoji: "🔟", rotulo: "10 avisos", valor: 10 },
    ],
    aplicar: (v, ctx) => { ctx.config.automod.punicao.warnsParaBan = v; return `banir com **${v}** avisos`; },
  },

  punicao_cargomudo: {
    titulo: "🔇 Cargo de silêncio",
    ajuda: "**Criar o cargo de silêncio agora?**\nÉ o cargo que cala alguém sem banir. Necessário para o modo Confirmar e para o `&silence`. Eu crio com todas as permissões negadas.",
    opcoes: [
      { emoji: "🆕", rotulo: "Criar agora", valor: "criar" },
      { emoji: "⏭️", rotulo: "Pular", valor: "pular" },
    ],
    aplicar: async (v, ctx, sessao) => {
      if (v !== "criar") return null;
      try {
        const server = await ctx.client.servers.fetch(sessao.serverId);
        const { id, canais } = await criarCargoMudo(server, "Silenciado", true);
        ctx.config.automod.punicao.silenceRoleId = id;
        return `cargo de silêncio criado${canais ? ` (bloqueado em ${canais.ok}/${canais.total} canais)` : ""}`;
      } catch (e) {
        return `⚠️ não consegui criar o cargo de silêncio (${e?.message ?? e})`;
      }
    },
  },

  // ── AUTOMOD ────────────────────────────────────────────
  automod_pacote: {
    titulo: "🛡️ Automod",
    ajuda: "**Quão rígido deve ser o automod?**\nLiga/desliga os filtros de uma vez. Dá para ajustar cada um depois com `&automod`.",
    opcoes: [
      { emoji: "🕊️", rotulo: "Leve", valor: "leve", nota: "só convites e spam pesado" },
      { emoji: "⚖️", rotulo: "Equilibrado", valor: "equilibrado", nota: "recomendado" },
      { emoji: "🛡️", rotulo: "Rígido", valor: "rigido", nota: "tudo ligado, inclusive links" },
    ],
    aplicar: (v, ctx) => {
      const a = ctx.config.automod;
      const set = (mod, on) => { if (a[mod]) a[mod].enabled = on; };
      if (v === "leve") {
        set("antiInvite", true); set("antiMassSpam", true); set("antiSpam", true);
        set("antiCaps", false); set("antiLink", false); set("antiMassMention", true);
        set("antiCaracteres", false); set("antiRepeticao", false);
      } else if (v === "equilibrado") {
        set("antiInvite", true); set("antiMassSpam", true); set("antiSpam", true);
        set("antiCaps", true); set("antiLink", false); set("antiMassMention", true);
        set("antiCaracteres", true); set("antiRepeticao", false);
      } else {
        set("antiInvite", true); set("antiMassSpam", true); set("antiSpam", true);
        set("antiCaps", true); set("antiLink", true); set("antiMassMention", true);
        set("antiCaracteres", true); set("antiRepeticao", true);
      }
      return `automod **${v}**`;
    },
  },

  conteudo_ativar: {
    titulo: "🔍 Detecção de conteúdo",
    ajuda: "**Ativar a detecção de conteúdo proibido?**\nAnalisa o texto em busca de golpes, divulgação e conteúdo grave — por pontuação, não por palavra solta.",
    opcoes: [
      { emoji: "✅", rotulo: "Ativar", valor: true },
      { emoji: "❌", rotulo: "Não", valor: false },
    ],
    aplicar: (v, ctx) => { ctx.config.automod.antiScam.enabled = !!v; return `detecção de conteúdo: **${v ? "ligada" : "desligada"}**`; },
  },

  conteudo_sensibilidade: {
    titulo: "🎚️ Sensibilidade da detecção",
    quando: (r) => r.conteudo_ativar === true,
    opcoes: [
      { emoji: "🟢", rotulo: "Baixa", valor: "baixa", nota: "só o óbvio" },
      { emoji: "🟡", rotulo: "Média", valor: "media", nota: "recomendado" },
      { emoji: "🔴", rotulo: "Alta", valor: "alta", nota: "pega mais, erra mais" },
    ],
    aplicar: (v, ctx) => { ctx.config.automod.antiScam.sensitivity = v; return `sensibilidade **${v}**`; },
  },

  // ── LOG ────────────────────────────────────────────────
  log_canal: {
    titulo: "📋 Canal de logs",
    ajuda: "**Onde eu registro punições, entradas/saídas e mudanças?**",
    textoLivre: true,
    dicaTexto: "o ID de outro canal",
    opcoes: [
      { emoji: "🆕", rotulo: "Criar um canal #log", valor: "criar" },
      { emoji: "📍", rotulo: "Usar este canal", valor: "aqui" },
      { emoji: "⏭️", rotulo: "Pular", valor: "pular" },
    ],
    aplicar: async (v, ctx, sessao) => {
      if (v === "pular") return null;
      let id = null;
      if (v === "criar") {
        try {
          const server = await ctx.client.servers.fetch(sessao.serverId);
          const canal = await server.createChannel({ type: "Text", name: "log" });
          id = canal?.id ?? canal?._id;
          if (!id) return "⚠️ criei o canal mas não obtive o ID — configure com `&log canal`";
        } catch (e) {
          return `⚠️ não consegui criar o canal (${e?.message ?? e}) — falta ManageChannel?`;
        }
      } else {
        id = v === "aqui" ? sessao.channelId : String(v).replace(/[<#>]/g, "").trim();
      }
      if (!ULID.test(id)) return "⚠️ canal inválido — log não configurado";
      ctx.config.log ??= { canalId: null, eventos: {} };
      ctx.config.log.canalId = id;
      return `logs em <#${id}>${v === "criar" ? " (canal criado)" : ""}`;
    },
  },

  // ── AUTOROLE ───────────────────────────────────────────
  autorole_cargo: {
    titulo: "🎭 Cargo automático",
    ajuda: "**Quem entrar no servidor recebe este cargo.**",
    textoLivre: true,
    dicaTexto: "o número do cargo (ou o ID)",
    // Lista os cargos do servidor numerados — ninguém precisa caçar ID.
    opcoesDinamicas: async (ctx, sessao) => {
      const ops = [];
      try {
        const server = await ctx.client.servers.fetch(sessao.serverId);
        const roles = server?.roles;
        if (roles) {
          const lista = typeof roles.entries === "function" ? [...roles.entries()] : Object.entries(roles);
          for (const [id, role] of lista.slice(0, 15)) {
            const nome = role?.name ?? role?.nome ?? id;
            ops.push({ emoji: null, rotulo: nome, valor: id });
          }
        }
      } catch (e) { log("não consegui listar cargos:", e?.message ?? e); }
      ops.push({ emoji: "⏭️", rotulo: "Pular", valor: "pular" });
      return ops;
    },
    opcoes: [{ emoji: "⏭️", rotulo: "Pular", valor: "pular" }],
    aplicar: (v, ctx) => {
      if (v === "pular") return null;
      const id = String(v).replace(/[<@&>]/g, "").trim();
      if (!ULID.test(id)) return "⚠️ cargo inválido — autorole não configurado";
      ctx.config.autorole ??= { roleId: null };
      ctx.config.autorole.roleId = id;
      return `autorole: <@&${id}>`;
    },
  },

  // ── XP / NÍVEIS ────────────────────────────────────────
  game_ativar: {
    titulo: "🎮 XP e níveis",
    ajuda: "**Ativar o sistema de XP e níveis?**\nAs pessoas ganham XP conversando e sobem de nível.",
    opcoes: [
      { emoji: "✅", rotulo: "Ativar", valor: true },
      { emoji: "❌", rotulo: "Não", valor: false },
    ],
    aplicar: (v, ctx) => { ctx.config.game ??= {}; ctx.config.game.enabled = !!v; return `XP: **${v ? "ligado" : "desligado"}**`; },
  },

  game_cargos: {
    titulo: "🏅 Cargos de nível",
    quando: (r) => r.game_ativar === true,
    ajuda: "Crio um cargo a cada 10 níveis e já ligo a entrega automática.",
    opcoes: [
      { emoji: "🆕", rotulo: "Criar agora", valor: "criar" },
      { emoji: "⏭️", rotulo: "Depois", valor: "pular" },
    ],
    aplicar: async (v, ctx, sessao) => {
      if (v !== "criar") return null;
      try {
        const msgFalsa = { channel: sessao.canalObj, authorId: sessao.userId, serverId: sessao.serverId, member: sessao.member };
        await criarCargosNivel(msgFalsa, ctx);
        return "cargos de nível criados";
      } catch (e) {
        return `⚠️ falha ao criar cargos de nível (${e?.message ?? e})`;
      }
    },
  },

  // ── RSS ────────────────────────────────────────────────
  rss_canal: {
    titulo: "📰 Canal de notícias (RSS)",
    ajuda: "**Onde eu posto o resumo das notícias?**",
    textoLivre: true,
    dicaTexto: "o ID de outro canal",
    opcoes: [
      { emoji: "🆕", rotulo: "Criar um canal #noticias", valor: "criar" },
      { emoji: "📍", rotulo: "Usar este canal", valor: "aqui" },
      { emoji: "⏭️", rotulo: "Pular", valor: "pular" },
    ],
    aplicar: async (v, ctx, sessao) => {
      if (v === "pular") return null;
      let id = null;
      if (v === "criar") {
        try {
          const server = await ctx.client.servers.fetch(sessao.serverId);
          const canal = await server.createChannel({ type: "Text", name: "noticias" });
          id = canal?.id ?? canal?._id;
          if (!id) return "⚠️ criei o canal mas não obtive o ID — configure com `&rss canal`";
        } catch (e) {
          return `⚠️ não consegui criar o canal (${e?.message ?? e}) — falta ManageChannel?`;
        }
      } else {
        id = v === "aqui" ? sessao.channelId : String(v).replace(/[<#>]/g, "").trim();
      }
      if (!ULID.test(id)) return "⚠️ canal inválido — RSS não configurado";
      ctx.config.rss ??= { canalId: null };
      ctx.config.rss.canalId = id;
      return `RSS em <#${id}>${v === "criar" ? " (canal criado)" : ""}`;
    },
  },

  rss_feed: {
    titulo: "🔗 Feed de notícias",
    quando: (r) => r.rss_canal && r.rss_canal !== "pular",
    ajuda: "**Cole a URL** de um feed RSS (ex.: `https://g1.globo.com/rss/g1/`) ou pule.",
    textoLivre: true,
    dicaTexto: "URL do feed",
    opcoes: [{ emoji: "⏭️", rotulo: "Pular", valor: "pular" }],
    aplicar: async (v, ctx, sessao) => {
      if (v === "pular") return null;
      const url = String(v).trim();
      if (!/^https?:\/\//i.test(url)) return "⚠️ URL inválida — feed não adicionado";
      try {
        const db = await import("../core/db.js");
        db.addFeed(sessao.serverId, url, null);
        return `feed adicionado: ${url.slice(0, 60)}`;
      } catch (e) { return `⚠️ não consegui salvar o feed (${e?.message ?? e})`; }
    },
  },

  // ── IA / JUDY ──────────────────────────────────────────
  ia_livre: {
    titulo: "💬 Conversa livre da Judy",
    ajuda: "**A Judy pode participar das conversas deste canal?**\nEla entra sozinha quando o assunto vale a pena, sem precisar ser chamada.",
    opcoes: [
      { emoji: "🎯", rotulo: "Sim, só o relevante", valor: "relevante" },
      { emoji: "💬", rotulo: "Sim, responder tudo", valor: "todas" },
      { emoji: "❌", rotulo: "Não", valor: "off" },
    ],
    aplicar: (v, ctx, sessao) => {
      ctx.config.chatLivre ??= { canais: [], modo: "relevante" };
      const c = ctx.config.chatLivre;
      c.canais = Array.isArray(c.canais) ? c.canais : [];
      if (v === "off") {
        c.canais = c.canais.filter((x) => x !== sessao.channelId);
        return "conversa livre desligada aqui";
      }
      if (!c.canais.includes(sessao.channelId)) c.canais.push(sessao.channelId);
      c.modo = v;
      return `conversa livre ligada (**${v}**) em <#${sessao.channelId}>`;
    },
  },

  ia_comentar: {
    titulo: "🗨️ Comentários espontâneos",
    ajuda: "**A Judy pode comentar por iniciativa neste canal?**\nDe vez em quando ela solta um comentário sobre o que está rolando (com limite diário e cooldown).",
    opcoes: [
      { emoji: "✅", rotulo: "Sim, aqui", valor: "aqui" },
      { emoji: "❌", rotulo: "Não", valor: "off" },
    ],
    aplicar: (v, ctx, sessao) => {
      ctx.config.comentarioEspontaneo ??= { canalId: null, porDia: 4, minParaFalar: 4 };
      ctx.config.comentarioEspontaneo.canalId = v === "aqui" ? sessao.channelId : null;
      return v === "aqui" ? `comentários espontâneos em <#${sessao.channelId}>` : "comentários espontâneos desligados";
    },
  },

  // ── MODERAÇÃO POR IA ───────────────────────────────────
  modia_ativar: {
    titulo: "🤖 Moderação por IA",
    ajuda: "**Ativar a moderação por IA?**\nVocê escreve os critérios e a Judy apaga o que violar, marcando o dono no log. Ela nunca bane sozinha.",
    opcoes: [
      { emoji: "✅", rotulo: "Ativar", valor: true },
      { emoji: "❌", rotulo: "Não", valor: false },
    ],
    aplicar: (v, ctx) => {
      ctx.config.moderacaoIA ??= { ativa: false, criterios: "", canais: [] };
      ctx.config.moderacaoIA.ativa = !!v;
      return v ? "moderação por IA ligada" : null;
    },
  },

  modia_criterios: {
    titulo: "📝 O que a Judy deve moderar?",
    quando: (r) => r.modia_ativar === true,
    ajuda: "**Escreva com suas palavras.** Ex.: _Apague divulgação de outros servidores e ataques pessoais. Ignore palavrão leve._",
    textoLivre: true,
    dicaTexto: "os critérios, em texto livre",
    opcoes: [{ emoji: "⏭️", rotulo: "Pular", valor: "pular" }],
    aplicar: (v, ctx) => {
      if (v === "pular") { ctx.config.moderacaoIA.ativa = false; return "sem critérios — moderação por IA ficou desligada"; }
      ctx.config.moderacaoIA.criterios = String(v).slice(0, 2000);
      return "critérios de moderação salvos";
    },
  },

  // ── BAN GLOBAL ─────────────────────────────────────────
  banglobal_modo: {
    titulo: "🌐 Lista global de banimentos",
    ajuda: "Quando alguém banido em outro servidor que uso entra aqui.",
    opcoes: [
      { emoji: "❌", rotulo: "Ignorar", valor: "off" },
      { emoji: "👁️", rotulo: "Só avisar", valor: "avisar" },
      { emoji: "🔨", rotulo: "Banir", valor: "banir" },
    ],
    aplicar: (v, ctx) => { ctx.config.banGlobal ??= { modo: "off" }; ctx.config.banGlobal.modo = v; return `ban global: **${v}**`; },
  },
};

// Ordem do caminho COMPLETO
const TRILHA_COMPLETA = [
  "punicao_modo", "punicao_warns", "punicao_cargomudo",
  "automod_pacote", "conteudo_ativar", "conteudo_sensibilidade",
  "log_canal", "autorole_cargo",
  "game_ativar", "game_cargos",
  "rss_canal", "rss_feed",
  "ia_livre", "ia_comentar",
  "modia_ativar", "modia_criterios",
  "banglobal_modo",
];

// ── PERFIS prontos (caminho rápido) ───────────────────────
const PERFIS = {
  tranquilo: {
    rotulo: "🕊️ Tranquilo", desc: "comunidade pequena e de confiança",
    aplicar: (ctx) => {
      const a = ctx.config.automod;
      a.punicao.modo = "avisar";
      a.antiInvite.enabled = true; a.antiSpam.enabled = true; a.antiMassSpam.enabled = true;
      a.antiCaps.enabled = false; a.antiLink.enabled = false; a.antiCaracteres.enabled = false;
      a.antiRepeticao.enabled = false; a.antiMassMention.enabled = true;
      a.antiScam.enabled = true; a.antiScam.sensitivity = "baixa";
      ctx.config.banGlobal = { modo: "avisar" };
      return ["punição: só avisar", "automod leve", "detecção baixa", "ban global: avisar"];
    },
  },
  equilibrado: {
    rotulo: "⚖️ Equilibrado", desc: "o recomendado para a maioria",
    aplicar: (ctx) => {
      const a = ctx.config.automod;
      a.punicao.modo = "apagar";
      a.antiInvite.enabled = true; a.antiSpam.enabled = true; a.antiMassSpam.enabled = true;
      a.antiCaps.enabled = true; a.antiLink.enabled = false; a.antiCaracteres.enabled = true;
      a.antiRepeticao.enabled = false; a.antiMassMention.enabled = true;
      a.antiScam.enabled = true; a.antiScam.sensitivity = "media";
      ctx.config.banGlobal = { modo: "avisar" };
      ctx.config.game ??= {}; ctx.config.game.enabled = true;
      return ["punição: só apagar", "automod equilibrado", "detecção média", "XP ligado", "ban global: avisar"];
    },
  },
  rigido: {
    rotulo: "🛡️ Rígido", desc: "servidor grande ou sob ataque",
    aplicar: (ctx) => {
      const a = ctx.config.automod;
      a.punicao.modo = "acumular"; a.punicao.warnsParaBan = 3;
      for (const m of ["antiInvite", "antiSpam", "antiMassSpam", "antiCaps", "antiLink", "antiCaracteres", "antiRepeticao", "antiMassMention"]) {
        if (a[m]) a[m].enabled = true;
      }
      a.antiScam.enabled = true; a.antiScam.sensitivity = "alta";
      ctx.config.banGlobal = { modo: "banir" };
      return ["punição: acumular (ban em 3)", "todos os filtros ligados", "detecção alta", "ban global: banir"];
    },
  },
};

// ══════════════════════════════════════════════════════════
//  Renderização
// ══════════════════════════════════════════════════════════
function montarEmbed(passo, sessao, ctx, opcoes) {
  const linhas = [];
  if (passo.ajuda) linhas.push(passo.ajuda, "");
  opcoes.forEach((o, i) => {
    const marca = o.emoji ? `${o.emoji} ` : "";
    linhas.push(`${marca}**${i + 1}. ${o.rotulo}**${o.nota ? ` — _${o.nota}_` : ""}`);
  });
  if (passo.textoLivre) {
    linhas.push("", `✍️ ou **digite** ${passo.dicaTexto ?? "sua resposta"}.`);
  }
  linhas.push("", `_Reaja ou digite o número. \`pular\` salta a etapa · \`sair\` encerra._`);
  const pos = sessao.trilha.length > 1 ? ` (${sessao.idx + 1}/${sessao.trilha.length})` : "";
  return { title: `${passo.titulo}${pos}`.slice(0, 90), description: linhas.join("\n"), colour: ctx.COR?.mod ?? "#5865F2" };
}

async function enviarPasso(ctx, sessao) {
  const { porMsg, porUser } = mapas(ctx);
  const chave = sessao.trilha[sessao.idx];
  const passo = PASSOS[chave];
  if (!passo) return finalizar(ctx, sessao);

  // pula passos cuja condição não bate
  if (passo.quando && !passo.quando(sessao.respostas)) {
    sessao.idx++;
    return sessao.idx >= sessao.trilha.length ? finalizar(ctx, sessao) : enviarPasso(ctx, sessao);
  }

  // opções podem ser dinâmicas (ex.: lista de cargos do servidor)
  let opcoes = passo.opcoes;
  if (passo.opcoesDinamicas) {
    try { opcoes = await passo.opcoesDinamicas(ctx, sessao); }
    catch (e) { log("opções dinâmicas falharam:", e?.message ?? e); }
  }
  sessao.opcoesAtuais = opcoes;

  const canal = sessao.canalObj;
  const msg = await canal.sendMessage({ embeds: [montarEmbed(passo, sessao, ctx, opcoes)] });

  if (sessao.msgId) porMsg.delete(sessao.msgId);
  sessao.msgId = msg.id;
  porMsg.set(msg.id, sessao);
  porUser.set(chaveUser(sessao.channelId, sessao.userId), sessao);

  // Reações são um CONFORTO, não um requisito: se falharem, o texto resolve.
  for (const o of opcoes) {
    if (!o.emoji) continue;   // opções numeradas (cargos) são só por texto
    try { await msg.react(encodeURIComponent(o.emoji)); }
    catch (e) { log(`não consegui reagir com ${o.emoji}: ${e?.message ?? e}`); }
  }
}

// ══════════════════════════════════════════════════════════
//  Avanço
// ══════════════════════════════════════════════════════════
async function aplicarEAvancar(ctx, sessao, valor) {
  const chave = sessao.trilha[sessao.idx];
  const passo = PASSOS[chave];
  sessao.respostas[chave] = valor;

  if (valor !== "__pular__") {
    try {
      const r = await passo.aplicar(valor, ctx, sessao);
      if (r) sessao.resumo.push(r);
    } catch (e) {
      log(`erro ao aplicar ${chave}:`, e?.message ?? e);
      sessao.resumo.push(`⚠️ ${chave}: ${e?.message ?? e}`);
    }
    try { ctx.salvarConfig?.(); } catch {}
  } else {
    sessao.pulados.push(passo.titulo.replace(/^[^\s]+\s/, ""));
  }

  sessao.idx++;
  if (sessao.idx >= sessao.trilha.length) return finalizar(ctx, sessao);
  return enviarPasso(ctx, sessao);
}

async function finalizar(ctx, sessao) {
  encerrar(ctx, sessao);
  try { ctx.salvarConfig?.(); } catch {}
  const linhas = [];
  if (sessao.resumo.length) {
    linhas.push("**Configurado:**");
    for (const r of sessao.resumo) linhas.push(`• ${r}`);
  }
  if (sessao.pulados.length) {
    linhas.push("", `**Pulado:** ${sessao.pulados.join(", ")}`);
    linhas.push(`_Rode \`${ctx.PREFIXO}setup\` de novo quando quiser configurar._`);
  }
  if (!linhas.length) linhas.push("Nada foi alterado.");
  await sessao.canalObj.sendMessage({ embeds: [{
    title: "✅ Pronto!",
    description: linhas.join("\n").slice(0, 1900),
    colour: ctx.COR?.sucesso ?? "#57F287",
  }] });
  log(`concluído para ${sessao.userId}: ${sessao.resumo.length} aplicados, ${sessao.pulados.length} pulados`);
}

// ══════════════════════════════════════════════════════════
//  Menu inicial
// ══════════════════════════════════════════════════════════
const MENU = {
  titulo: "🧭 Configuração do bot",
  opcoes: [
    { emoji: "🚀", rotulo: "Rápido (perfil pronto)", valor: "rapido", nota: "escolho tudo por você" },
    { emoji: "🧭", rotulo: "Completo (passo a passo)", valor: "completo", nota: "passa por todas as áreas" },
    { emoji: "🏗️", rotulo: "Estrutura do servidor", valor: "estrutura", nota: "cria canais e cargos" },
    { emoji: "❌", rotulo: "Sair", valor: "sair" },
  ],
};

const MENU_PERFIL = {
  titulo: "🚀 Escolha um perfil",
  opcoes: [
    { emoji: "🕊️", rotulo: PERFIS.tranquilo.rotulo, valor: "tranquilo", nota: PERFIS.tranquilo.desc },
    { emoji: "⚖️", rotulo: PERFIS.equilibrado.rotulo, valor: "equilibrado", nota: PERFIS.equilibrado.desc },
    { emoji: "🛡️", rotulo: PERFIS.rigido.rotulo, valor: "rigido", nota: PERFIS.rigido.desc },
  ],
};

async function enviarMenu(ctx, sessao, menu, etapa) {
  const { porMsg, porUser } = mapas(ctx);
  const linhas = menu.opcoes.map((o, i) =>
    `${o.emoji} **${i + 1}. ${o.rotulo}**${o.nota ? ` — _${o.nota}_` : ""}`);
  linhas.push("", "_Reaja ou digite o número._");
  const msg = await sessao.canalObj.sendMessage({ embeds: [{
    title: menu.titulo, description: linhas.join("\n"), colour: ctx.COR?.mod ?? "#5865F2",
  }] });
  if (sessao.msgId) porMsg.delete(sessao.msgId);
  sessao.msgId = msg.id;
  sessao.etapa = etapa;
  sessao.menu = menu;
  porMsg.set(msg.id, sessao);
  porUser.set(chaveUser(sessao.channelId, sessao.userId), sessao);
  for (const o of menu.opcoes) {
    try { await msg.react(encodeURIComponent(o.emoji)); } catch {}
  }
}

// ══════════════════════════════════════════════════════════
//  Entrada: &setup
// ══════════════════════════════════════════════════════════
export async function iniciar(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao } = ctx;

  const server = await getServer(message);
  if (!server) {
    return sendEmbed(message.channel, { title: "❌ Fora de um servidor",
      description: "Este comando só funciona dentro de um servidor.", colour: COR.erro });
  }
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManagePermissions** para configurar o bot.", colour: COR.erro });
  }

  const sessao = {
    userId: message.authorId,
    channelId: message.channelId,
    serverId: ctx.serverId ?? message.serverId ?? null,
    canalObj: message.channel,
    member: message.member,
    trilha: [], idx: 0, respostas: {}, resumo: [], pulados: [],
    etapa: "menu", msgId: null,
  };

  // Atalhos diretos: &setup completo | rapido | estrutura
  const atalho = args[0]?.toLowerCase();
  if (["completo", "tudo", "full"].includes(atalho)) {
    sessao.trilha = [...TRILHA_COMPLETA]; sessao.etapa = "passos";
    log(`iniciado (completo) por ${sessao.userId}`);
    return enviarPasso(ctx, sessao);
  }
  if (["rapido", "rápido", "perfil"].includes(atalho)) {
    return enviarMenu(ctx, sessao, MENU_PERFIL, "perfil");
  }
  if (["servidor", "estrutura"].includes(atalho)) {
    const setupServidor = await import("./setup-servidor.js");
    return setupServidor.iniciarSetupServidor(message, ["servidor", ...args.slice(1)], ctx);
  }

  log(`menu aberto por ${sessao.userId}`);
  return enviarMenu(ctx, sessao, MENU, "menu");
}

// ── Escolha no menu ───────────────────────────────────────
async function escolherNoMenu(ctx, sessao, valor, message) {
  if (sessao.etapa === "menu") {
    if (valor === "sair") { encerrar(ctx, sessao); return sessao.canalObj.sendMessage({ embeds: [{ title: "Saí do assistente", description: "Nada foi alterado.", colour: ctx.COR?.aviso ?? "#FEE75C" }] }); }
    if (valor === "completo") {
      sessao.trilha = [...TRILHA_COMPLETA]; sessao.etapa = "passos"; sessao.idx = 0;
      return enviarPasso(ctx, sessao);
    }
    if (valor === "rapido") return enviarMenu(ctx, sessao, MENU_PERFIL, "perfil");
    if (valor === "estrutura") {
      encerrar(ctx, sessao);
      const setupServidor = await import("./setup-servidor.js");
      const msgFalsa = message ?? { channel: sessao.canalObj, authorId: sessao.userId, channelId: sessao.channelId, member: sessao.member, serverId: sessao.serverId };
      return setupServidor.iniciarSetupServidor(msgFalsa, ["servidor"], ctx);
    }
  }
  if (sessao.etapa === "perfil") {
    const perfil = PERFIS[valor];
    if (!perfil) return;
    encerrar(ctx, sessao);
    const aplicados = perfil.aplicar(ctx);
    try { ctx.salvarConfig?.(); } catch {}
    log(`perfil ${valor} aplicado por ${sessao.userId}`);
    return sessao.canalObj.sendMessage({ embeds: [{
      title: `✅ Perfil ${perfil.rotulo} aplicado`,
      description: aplicados.map((x) => `• ${x}`).join("\n")
        + `\n\n_Quer ajustar item a item? Rode \`${ctx.PREFIXO}setup completo\`._`,
      colour: ctx.COR?.sucesso ?? "#57F287",
    }] });
  }
}

// ══════════════════════════════════════════════════════════
//  Reações
// ══════════════════════════════════════════════════════════
export async function handleReaction(messageId, userId, emoji, ctx) {
  if (!messageId || !userId) return false;
  const { porMsg } = mapas(ctx);
  const sessao = porMsg.get(messageId);
  if (!sessao) return false;
  if (sessao.userId !== userId) return true;

  if (sessao.etapa === "menu" || sessao.etapa === "perfil") {
    const op = sessao.menu.opcoes.find((o) => casaEmoji(emoji, o.emoji));
    if (!op) return true;
    return escolherNoMenu(ctx, sessao, op.valor);
  }

  const passo = PASSOS[sessao.trilha[sessao.idx]];
  if (!passo) return true;
  const op = (sessao.opcoesAtuais ?? passo.opcoes).find((o) => o.emoji && casaEmoji(emoji, o.emoji));
  if (!op) return true;
  const valor = op.valor === "pular" ? "__pular__" : op.valor;
  return aplicarEAvancar(ctx, sessao, valor);
}

// ══════════════════════════════════════════════════════════
//  Respostas em TEXTO (número, palavra, ou valor livre)
//  Retorna true se a mensagem foi consumida pelo wizard.
// ══════════════════════════════════════════════════════════
export async function handleMensagem(message, ctx) {
  const { porUser } = mapas(ctx);
  const sessao = porUser.get(chaveUser(message.channelId, message.authorId));
  if (!sessao) return false;

  const txt = (message.content ?? "").trim();
  if (!txt) return false;

  // sair a qualquer momento
  if (/^(sair|cancelar|parar)$/i.test(txt)) {
    encerrar(ctx, sessao);
    await sessao.canalObj.sendMessage({ embeds: [{ title: "Saí do assistente",
      description: "O que já foi configurado permanece.", colour: ctx.COR?.aviso ?? "#FEE75C" }] });
    return true;
  }

  // menus
  if (sessao.etapa === "menu" || sessao.etapa === "perfil") {
    const soDigitos = /^\d{1,2}$/.test(txt);
    const n = soDigitos ? parseInt(txt, 10) : NaN;
    let op = null;
    if (!isNaN(n) && sessao.menu.opcoes[n - 1]) op = sessao.menu.opcoes[n - 1];
    else op = sessao.menu.opcoes.find((o) => o.rotulo.toLowerCase().includes(txt.toLowerCase()) || String(o.valor).toLowerCase() === txt.toLowerCase());
    if (!op) return false;   // não era resposta ao wizard
    await escolherNoMenu(ctx, sessao, op.valor, message);
    return true;
  }

  const passo = PASSOS[sessao.trilha[sessao.idx]];
  if (!passo) return false;

  // pular
  if (/^(pular|skip|-)$/i.test(txt)) { await aplicarEAvancar(ctx, sessao, "__pular__"); return true; }

  // número da opção — SÓ se a resposta for apenas dígitos (um ULID como
  // "01ABC..." começa com número e não pode ser confundido com "opção 1").
  const opcoes = sessao.opcoesAtuais ?? passo.opcoes;
  const n = /^\d{1,2}$/.test(txt) ? parseInt(txt, 10) : NaN;
  if (!isNaN(n) && opcoes[n - 1]) {
    const v = opcoes[n - 1].valor;
    await aplicarEAvancar(ctx, sessao, v === "pular" ? "__pular__" : v);
    return true;
  }
  // palavra da opção
  const porPalavra = opcoes.find((o) =>
    String(o.valor).toLowerCase() === txt.toLowerCase() ||
    o.rotulo.toLowerCase() === txt.toLowerCase());
  if (porPalavra) {
    await aplicarEAvancar(ctx, sessao, porPalavra.valor === "pular" ? "__pular__" : porPalavra.valor);
    return true;
  }
  // valor livre (URL, ID, critérios…)
  if (passo.textoLivre) { await aplicarEAvancar(ctx, sessao, txt); return true; }

  return false;   // não entendi: deixa a mensagem seguir o fluxo normal
}
