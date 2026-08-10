// ══════════════════════════════════════════════════════════
//  ban-global.js — Lista compartilhada de banimentos
//
//  Cada servidor escolhe o que fazer quando um usuário que
//  consta na lista ENTRA no servidor:
//    off     — ignora a lista (PADRÃO: nada automático)
//    avisar  — alerta os moderadores com motivo e contagem
//    banir   — bane automaticamente
//
//  A lista é alimentada por TODOS os bans (automod + &ban
//  manual), guardando servidor de origem e motivo. O histórico
//  de bans já existente no servidor pode ser importado com
//  `&banglobal importar` — deliberadamente MANUAL: importar o
//  passado de um servidor afeta os demais, então é uma decisão
//  consciente, nunca automática.
// ══════════════════════════════════════════════════════════

import * as db  from "../core/db.js";
import * as log from "../core/log.js";

export const MODOS = {
  off:    "ignora a lista global",
  avisar: "alerta os moderadores quando um banido entra",
  banir:  "bane automaticamente quem está na lista",
};

// Formata uma data legível a partir de um timestamp
const data = (ms) => new Date(ms).toISOString().slice(0, 10);

// ──────────────────────────────────────────────────────────
//  Registro: chamado sempre que um ban acontece
// ──────────────────────────────────────────────────────────
export function registrar(ctx, userId, motivo, origem = "manual") {
  const serverId = ctx?.serverId;
  if (!serverId || !userId) return;
  try {
    db.registrarBanGlobal(userId, serverId, motivo, origem);
  } catch (err) {
    console.error("[BANGLOBAL] Falha ao registrar:", err?.message);
  }
}

// ──────────────────────────────────────────────────────────
//  Verificação na ENTRADA de um membro
//  Retorna true se o usuário foi banido automaticamente.
// ──────────────────────────────────────────────────────────
export async function verificarEntrada(member, ctx) {
  const serverId = member?.id?.server;
  const userId   = member?.id?.user;
  if (!serverId || !userId) return false;

  const modo = ctx.config?.banGlobal?.modo ?? "off";
  if (modo === "off") return false;

  const historico = db.historicoBans(userId)
    .filter((b) => b.serverId !== serverId);   // bans deste próprio servidor não contam
  if (!historico.length) return false;

  const n = historico.length;
  const motivos = historico.slice(0, 3)
    .map((b) => `• \`${b.serverId}\` — ${b.motivo ?? "_sem motivo_"} _(${data(b.criadoEm)})_`)
    .join("\n");
  const resumo = `<@${userId}> consta na lista global: banido em **${n}** servidor(es).\n${motivos}`
    + (n > 3 ? `\n_… e mais ${n - 3}._` : "");

  // ── modo avisar: só alerta, não age ──
  if (modo === "avisar") {
    await log.registrar(ctx, "punicoes", {
      titulo: "⚠️ Usuário da lista global entrou",
      descricao: `${resumo}\n\n_Modo **avisar**: nenhuma ação automática foi tomada._`,
    });
    console.log(`[BANGLOBAL] ⚠️ ${userId} (na lista, ${n} servidor(es)) entrou em ${serverId} — só aviso`);
    return false;
  }

  // ── modo banir: bane automaticamente ──
  if (modo === "banir") {
    try {
      const server = member.server ?? await ctx.client.servers.fetch(serverId);
      await server.banUser(userId, { reason: `[Ban global] banido em ${n} outro(s) servidor(es)` });
      db.registrarBanGlobal(userId, serverId, `ban global (${n} servidores)`, "banglobal");
      await log.registrar(ctx, "punicoes", {
        titulo: "🔨 Ban automático (lista global)",
        descricao: `${resumo}\n\n_Modo **banir**: usuário banido automaticamente._`,
      });
      console.log(`[BANGLOBAL] 🔨 ${userId} banido automaticamente em ${serverId}`);
      return true;
    } catch (err) {
      console.error("[BANGLOBAL][BAN]", err?.message);
      await log.registrar(ctx, "punicoes", {
        titulo: "❌ Falha no ban automático",
        descricao: `${resumo}\n\n**Erro:** ${err?.message}`,
      });
      return false;
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────
//  Comando &banglobal
// ──────────────────────────────────────────────────────────
export async function cmdBanGlobal(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO, serverId } = ctx;

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "BanMembers")) {
    return sendEmbed(message.channel, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **BanMembers** para usar este comando.",
      colour: COR.erro,
    });
  }

  config.banGlobal ??= { modo: "off" };
  const sub = args[0]?.toLowerCase();

  // ── &banglobal → status ──
  if (!sub) {
    const modo = config.banGlobal.modo ?? "off";
    return sendEmbed(message.channel, {
      title: "🌐 Lista global de banimentos",
      description: [
        `**Modo atual:** \`${modo}\` — ${MODOS[modo]}`,
        "",
        "**Modos disponíveis:**",
        ...Object.entries(MODOS).map(([k, v]) => `\`${k}\` — ${v}`),
        "",
        `**Na lista:** ${db.usuariosBanidosDistintos()} usuário(s), ${db.totalBansGlobais()} registro(s).`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}banglobal <off|avisar|banir>\` — define o modo`,
        `\`${PREFIXO}banglobal historico <@usuário|id>\` — histórico de um usuário`,
        `\`${PREFIXO}banglobal importar\` — importa os bans já existentes deste servidor`,
        `\`${PREFIXO}banglobal esquecer <@usuário|id>\` — remove um usuário da lista`,
        "",
        "⚠️ _O modo `banir` age sozinho com base em bans de **outros** servidores. Use com confiança na origem._",
      ].join("\n"),
      colour: COR.mod,
    });
  }

  // ── &banglobal <off|avisar|banir> ──
  if (Object.hasOwn(MODOS, sub)) {
    config.banGlobal.modo = sub;
    salvarConfig();
    const extra = sub === "banir"
      ? "\n\n⚠️ _A partir de agora, quem consta na lista será **banido automaticamente** ao entrar._"
      : "";
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Ban global reconfigurado",
      descricao: `Modo alterado para **${sub}** por <@${message.authorId}>.`,
    });
    return sendEmbed(message.channel, {
      title: "🌐 Ban global atualizado",
      description: `**Modo:** \`${sub}\` — ${MODOS[sub]}.${extra}`,
      colour: COR.mod,
    });
  }

  // ── &banglobal historico <usuário> ──
  if (sub === "historico" || sub === "histórico") {
    const uid = (args[1] ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, { title: "❌ Uso incorreto",
      description: `\`${PREFIXO}banglobal historico <@usuário|id>\``, colour: COR.erro });

    const hist = db.historicoBans(uid);
    if (!hist.length) return sendEmbed(message.channel, { title: "🌐 Histórico global",
      description: `<@${uid}> **não consta** na lista global de banimentos.`, colour: COR.sucesso });

    return sendEmbed(message.channel, {
      title: "🌐 Histórico global",
      description: [
        `<@${uid}> — banido em **${hist.length}** servidor(es):`,
        "",
        ...hist.slice(0, 10).map((b) =>
          `• \`${b.serverId}\` — ${b.motivo ?? "_sem motivo_"} _(${data(b.criadoEm)}, ${b.origem})_`),
        hist.length > 10 ? `\n_… e mais ${hist.length - 10}._` : "",
      ].filter(Boolean).join("\n"),
      colour: COR.aviso,
    });
  }

  // ── &banglobal importar ──
  // Traz os bans JÁ EXISTENTES deste servidor para a lista global.
  if (sub === "importar") {
    try {
      const bans = await server.fetchBans();
      let novos = 0;
      for (const b of bans) {
        const uid = b?.id?.user ?? b?.user?.id;
        if (!uid) continue;
        if (db.registrarBanGlobal(uid, serverId, b?.reason ?? "importado do servidor", "importado")) novos++;
      }
      await log.registrar(ctx, "punicoes", {
        titulo: "🌐 Bans importados",
        descricao: `<@${message.authorId}> importou **${novos}** ban(s) deste servidor para a lista global.`,
      });
      return sendEmbed(message.channel, {
        title: "🌐 Importação concluída",
        description: [
          `Encontrados **${bans.length}** ban(s) neste servidor.`,
          `**${novos}** novo(s) registro(s) adicionado(s) à lista global.`,
          "",
          "_Os demais já constavam._",
        ].join("\n"),
        colour: COR.sucesso,
      });
    } catch (err) {
      return sendEmbed(message.channel, { title: "❌ Falha ao importar",
        description: `Não consegui ler os bans do servidor: ${err?.message}`, colour: COR.erro });
    }
  }

  // ── &banglobal esquecer <usuário> ──
  if (sub === "esquecer") {
    const uid = (args[1] ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, { title: "❌ Uso incorreto",
      description: `\`${PREFIXO}banglobal esquecer <@usuário|id>\``, colour: COR.erro });

    const n = db.esquecerUsuario(uid);
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Usuário removido da lista global",
      descricao: `<@${message.authorId}> removeu <@${uid}> da lista global (**${n}** registro(s)).`,
    });
    return sendEmbed(message.channel, {
      title: "🌐 Removido da lista global",
      description: n
        ? `<@${uid}> foi removido: **${n}** registro(s) apagado(s).`
        : `<@${uid}> não constava na lista.`,
      colour: COR.sucesso,
    });
  }

  return sendEmbed(message.channel, {
    title: "❌ Subcomando desconhecido",
    description: `Use \`${PREFIXO}banglobal\` para ver as opções.`,
    colour: COR.erro,
  });
}
