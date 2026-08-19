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
//  manual), guardando servidor de origem e motivo.
//
//  ── Contribuição: sempre ligada, sem configuração ──
//  Todo servidor onde o bot está CONTRIBUI para a lista, sempre:
//  os bans que já existiam entram sozinhos (cerca de 1 min após o
//  boot e depois a cada 6h, BANGLOBAL_IMPORT_MS) e os bans novos
//  são registrados no momento em que acontecem. Não há comando
//  para ligar, desligar nem forçar isso — é o alicerce da lista.
//
//  A ÚNICA escolha de cada servidor é o lado do consumo: se ele
//  se aproveita da lista (`avisar`, `banir`) ou a ignora (`off`).
//  Ou seja, dá para não usar a lista, mas não dá para usá-la sem
//  alimentá-la — o que mantém a lista honesta: quem se protege
//  com o trabalho dos outros também contribui com o seu.
//
//  Consequência a ter em mente: o histórico de bans de qualquer
//  servidor onde o bot entrar passa a valer para os demais. Em
//  servidores onde o bot é convidado, o critério de moderação de
//  lá vira critério daqui — por isso o `&banglobal esquecer`
//  existe, para tirar da lista um registro específico que não se
//  sustente.
// ══════════════════════════════════════════════════════════

import * as db  from "../core/db.js";
import * as log from "../core/log.js";
import { resolverUsuario as resolverUser } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";

export const MODOS = {
  off:    "ignora a lista global",
  avisar: "alerta os moderadores quando um banido entra",
  banir:  "bane automaticamente quem está na lista",
};
export const MODOS_EN = {
  off:    "ignores the global list",
  avisar: "alerts the moderators when a banned user joins",
  banir:  "automatically bans anyone on the list",
};

// Formata uma data legível a partir de um timestamp
const data = (ms) => new Date(ms).toISOString().slice(0, 10);

// ──────────────────────────────────────────────────────────
//  Importação: lê os bans que já existem NO SERVIDOR e os
//  registra na lista global. Usada tanto pelo `&banglobal
//  importar` (manual) quanto pela sincronização automática.
//
//  Devolve { total, novos } ou lança — quem chama decide o que
//  fazer com o erro (o comando avisa, o agendador só loga).
// ──────────────────────────────────────────────────────────
export async function importarBansDoServidor(server, serverId) {
  const bans = await server.fetchBans();
  let novos = 0;
  for (const b of bans ?? []) {
    const uid = b?.id?.user ?? b?.user?.id;
    if (!uid) continue;
    if (db.registrarBanGlobal(uid, serverId, b?.reason ?? "importado do servidor", "importado")) novos++;
  }
  return { total: bans?.length ?? 0, novos };
}

// ──────────────────────────────────────────────────────────
//  Sincronização AUTOMÁTICA
//
//  Roda no boot e de tempos em tempos, em TODOS os servidores
//  onde o bot está. Sem exceção e sem chave para desligar: a
//  contribuição é a contrapartida de existir uma lista.
// ──────────────────────────────────────────────────────────
const INTERVALO_MS = Number(process.env.BANGLOBAL_IMPORT_MS || 6 * 60 * 60_000);   // 6h
const ATRASO_BOOT_MS = Number(process.env.BANGLOBAL_IMPORT_BOOT_MS || 60_000);     // 1min após o boot
const ESPACO_MS = Number(process.env.BANGLOBAL_ESPACO_MS || 3000);   // respiro entre servidores, para não estourar rate limit

async function sincronizarTodos(client, criarContexto) {
  const servidores = [...(client.servers?.values?.() ?? [])];
  if (!servidores.length) return;

  let somaNovos = 0, tocados = 0;
  for (const server of servidores) {
    const sid = server?.id ?? server?._id;
    if (!sid) continue;
    let ctx;
    try { ctx = criarContexto(sid); } catch { continue; }
    if (typeof server.fetchBans !== "function") continue;

    try {
      const { total, novos } = await importarBansDoServidor(server, sid);
      tocados++;
      if (novos > 0) {
        somaNovos += novos;
        console.info(`[BANGLOBAL] auto: ${novos} novo(s) de ${total} ban(s) em ${server.name ?? sid}`);
        // Só registra no log do servidor quando há novidade — sincronização
        // silenciosa a cada 6 horas viraria ruído no canal de logs.
        await log.registrar(ctx, "punicoes", {
          titulo: "🌐 Bans importados automaticamente",
          descricao: `**${novos}** ban(s) deste servidor entraram na lista global.`,
        });
      }
    } catch (err) {
      console.error(`[BANGLOBAL] auto: falha em ${server?.name ?? sid}:`, err?.message);
    }
    await new Promise((r) => setTimeout(r, ESPACO_MS));
  }
  if (tocados) {
    console.info(`[BANGLOBAL] auto: ${tocados} servidor(es) sincronizado(s), ${somaNovos} registro(s) novo(s).`);
  }
}

// Sincroniza UM servidor. Usado quando o bot entra num servidor novo: sem
// isto, o histórico de lá só entraria na lista na próxima rodada de 6h.
export async function sincronizarServidor(server, criarContexto) {
  const sid = server?.id ?? server?._id;
  if (!sid || typeof server?.fetchBans !== "function") return;
  try {
    const ctx = criarContexto(sid);
    const { total, novos } = await importarBansDoServidor(server, sid);
    if (novos > 0) {
      console.info(`[BANGLOBAL] servidor novo ${server.name ?? sid}: ${novos} de ${total} ban(s) importado(s).`);
      await log.registrar(ctx, "punicoes", {
        titulo: "🌐 Bans importados automaticamente",
        descricao: `**${novos}** ban(s) deste servidor entraram na lista global.`,
      });
    }
  } catch (err) {
    console.error(`[BANGLOBAL] servidor novo ${sid}:`, err?.message);
  }
}

export function iniciarAutoImportacao(client, criarContexto) {
  const rodar = () => sincronizarTodos(client, criarContexto)
    .catch((e) => console.error("[BANGLOBAL] auto:", e?.message));

  // O boot já tem trabalho demais (blocklist, RSS, status): a primeira
  // sincronização espera o bot assentar.
  setTimeout(rodar, ATRASO_BOOT_MS).unref?.();
  setInterval(rodar, INTERVALO_MS).unref?.();
  console.info(`[BANGLOBAL] Contribuição automática ativa (sincroniza a cada ${Math.round(INTERVALO_MS / 3600000)}h; não é desligável).`);
}

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

// ──────────────────────────────────────────────────────────
//  Varredura: confere os membros que JÁ ESTÃO no servidor.
//
//  O verificarEntrada() só age quando alguém entra. Quem já estava aqui
//  quando foi banido em outro servidor passava despercebido — este é o
//  ponto cego que a varredura fecha.
// ──────────────────────────────────────────────────────────
export async function varrer(ctx, message, { aplicar = true } = {}) {
  const serverId = ctx.serverId;
  const modo = ctx.config?.banGlobal?.modo ?? "off";
  const server = await ctx.getServer?.(message);
  if (!server) return { erro: "não consegui acessar o servidor" };

  let membros = [];
  try {
    const r = await server.fetchMembers();
    membros = r?.members ?? r ?? [];
  } catch (e) {
    return { erro: `não consegui listar os membros (${e?.message ?? e})` };
  }

  const achados = [];
  for (const m of membros) {
    const uid = m?.id?.user ?? m?.user?.id ?? m?.id;
    if (!uid) continue;
    const hist = db.historicoBans(uid).filter((b) => b.serverId !== serverId);
    if (!hist.length) continue;
    const nome = m?.user?.username ?? m?.nickname ?? uid;
    achados.push({ uid, nome, n: hist.length, membro: m });
  }

  if (!aplicar || modo !== "banir") return { total: membros.length, achados, aplicados: [], modo };

  const aplicados = [];
  for (const a of achados) {
    try {
      await server.banUser(a.uid, { reason: `[Ban global] banido em ${a.n} outro(s) servidor(es)` });
      db.registrarBanGlobal(a.uid, serverId, `ban global (${a.n} servidores, varredura)`, "banglobal");
      aplicados.push({ ...a, ok: true });
      console.log(`[BANGLOBAL] 🔨 ${a.uid} banido na varredura de ${serverId}`);
    } catch (e) {
      aplicados.push({ ...a, ok: false, erro: e?.message ?? String(e) });
      console.error(`[BANGLOBAL][varredura] falha em ${a.uid}:`, e?.message);
    }
  }
  if (aplicados.length) {
    await log.registrar(ctx, "punicoes", {
      titulo: "🔨 Varredura da lista global",
      descricao: aplicados.map((a) => `${a.ok ? "🔨" : "❌"} <@${a.uid}> (${a.nome}) — ${a.n} servidor(es)${a.ok ? "" : ` — erro: ${a.erro}`}`).join("\n").slice(0, 1800),
    });
  }
  return { total: membros.length, achados, aplicados, modo };
}

export async function cmdBanGlobal(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO, serverId } = ctx;
  const lang = lingua(ctx);
  const L_MODOS = lang === "en" ? MODOS_EN : MODOS;

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "BanMembers")) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **BanMembers** para usar este comando.",
      colour: COR.erro,
    }, {
      title: "🚫 Missing permission",
      description: "You need the **BanMembers** permission to use this command.",
      colour: COR.erro,
    }));
  }

  config.banGlobal ??= { modo: "off" };
  const sub = args[0]?.toLowerCase();

  // ── &banglobal → status ──
  if (!sub) {
    const modo = config.banGlobal.modo ?? "off";
    if (lang === "en") return sendEmbed(message.channel, {
      title: "🌐 Global ban list",
      description: [
        `**Current mode:** \`${modo}\` — ${L_MODOS[modo]}`,
        "",
        "**Available modes:**",
        ...Object.entries(L_MODOS).map(([k, v]) => `\`${k}\` — ${v}`),
        "",
        `**Listed:** ${db.usuariosBanidosDistintos()} user(s), ${db.totalBansGlobais()} record(s) — ${db.bansGlobaisDoServidor(serverId)} from this server.`,
        "",
        "**Commands:**",
        `\`${PREFIXO}banglobal <off|avisar|banir>\` — sets the mode`,
        `\`${PREFIXO}banglobal historico <@user|id>\` — a user's history`,
        `\`${PREFIXO}banglobal varrer\` — **checks who is ALREADY in the server** and acts`,
        `\`${PREFIXO}banglobal varrer ver\` — only shows, without banning anyone`,
        `\`${PREFIXO}banglobal esquecer <@user|id>\` — removes a user from the list`,
        "",
        `**Contribution:** 🟢 always on — this server's bans (old and new) feed the list on their own. There's nothing to configure and no command to run.`,
        "",
        "_The mode above only decides whether this server **benefits** from the list. You can opt out of using it, but not out of feeding it._",
        "",
        "⚠️ _The `banir` mode acts on its own based on bans from **other** servers. Use it only if you trust the sources._",
      ].join("\n"),
      colour: COR.mod,
    });
    return sendEmbed(message.channel, {
      title: "🌐 Lista global de banimentos",
      description: [
        `**Modo atual:** \`${modo}\` — ${L_MODOS[modo]}`,
        "",
        "**Modos disponíveis:**",
        ...Object.entries(L_MODOS).map(([k, v]) => `\`${k}\` — ${v}`),
        "",
        `**Na lista:** ${db.usuariosBanidosDistintos()} usuário(s), ${db.totalBansGlobais()} registro(s) — ${db.bansGlobaisDoServidor(serverId)} deste servidor.`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}banglobal <off|avisar|banir>\` — define o modo`,
        `\`${PREFIXO}banglobal historico <@usuário|id>\` — histórico de um usuário`,
        `\`${PREFIXO}banglobal varrer\` — **confere quem JÁ está no servidor** e age`,
        `\`${PREFIXO}banglobal varrer ver\` — só mostra, sem banir ninguém`,
        `\`${PREFIXO}banglobal esquecer <@usuário|id>\` — remove um usuário da lista`,
        "",
        `**Contribuição:** 🟢 sempre ligada — os bans deste servidor (antigos e novos) alimentam a lista sozinhos. Não há o que configurar nem comando a rodar.`,
        "",
        "_O modo acima decide só se este servidor **se aproveita** da lista. Dá para não usar a lista, mas não dá para usá-la sem alimentá-la._",
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
      ? (lang === "en"
        ? "\n\n⚠️ _From now on, anyone on the list will be **automatically banned** on joining._"
        : "\n\n⚠️ _A partir de agora, quem consta na lista será **banido automaticamente** ao entrar._")
      : "";
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Ban global reconfigurado",
      descricao: `Modo alterado para **${sub}** por <@${message.authorId}>.`,
    });
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🌐 Global ban updated" : "🌐 Ban global atualizado",
      description: lang === "en"
        ? `**Mode:** \`${sub}\` — ${L_MODOS[sub]}.${extra}`
        : `**Modo:** \`${sub}\` — ${L_MODOS[sub]}.${extra}`,
      colour: COR.mod,
    });
  }

  // ── &banglobal historico <usuário> ──
  if (sub === "historico" || sub === "histórico") {
    const server = await ctx.getServer?.(message);
    const uid = await resolverUser(args[1], { message, server });
    if (!uid) return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não achei esse usuário",
      description: [
        `\`${PREFIXO}banglobal historico <@usuário|id|nome>\``,
        "",
        args[1] ? `Procurei por **${args[1]}** entre os membros e não encontrei.` : "",
        "Aceito uma **menção**, o **ID** ou o **nome** de alguém que esteja no servidor.",
        "_Se a pessoa já saiu, só o ID funciona._",
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }, {
      title: "❌ Couldn't find that user",
      description: [
        `\`${PREFIXO}banglobal historico <@user|id|name>\``,
        "",
        args[1] ? `I looked for **${args[1]}** among the members and found nobody.` : "",
        "I accept a **mention**, the **ID** or the **name** of someone in the server.",
        "_If the person already left, only the ID works._",
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }));

    const hist = db.historicoBans(uid);
    if (!hist.length) return sendEmbed(message.channel, tr(ctx,
      { title: "🌐 Histórico global",
        description: `<@${uid}> **não consta** na lista global de banimentos.`, colour: COR.sucesso },
      { title: "🌐 Global history",
        description: `<@${uid}> is **not** on the global ban list.`, colour: COR.sucesso }));

    return sendEmbed(message.channel, lang === "en" ? {
      title: "🌐 Global history",
      description: [
        `<@${uid}> — banned on **${hist.length}** server(s):`,
        "",
        ...hist.slice(0, 10).map((b) =>
          `• \`${b.serverId}\` — ${b.motivo ?? "_no reason_"} _(${data(b.criadoEm)}, ${b.origem})_`),
        hist.length > 10 ? `\n_… and ${hist.length - 10} more._` : "",
      ].filter(Boolean).join("\n"),
      colour: COR.aviso,
    } : {
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

  // ── varrer: confere quem JÁ está no servidor ──
  if (["varrer", "varredura", "revisar", "scan"].includes(sub)) {
    const soVer = ["ver", "listar", "simular", "dry"].includes((args[1] ?? "").toLowerCase());
    const modo = config?.banGlobal?.modo ?? "off";

    if (modo === "off" && !soVer) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "🌐 Lista global desligada",
        description: `O modo está \`off\`. Ligue com \`${PREFIXO}banglobal avisar\` ou \`${PREFIXO}banglobal banir\` antes de varrer — ou use \`${PREFIXO}banglobal varrer ver\` só para conferir quem apareceria.`,
        colour: COR.aviso,
      }, {
        title: "🌐 Global list off",
        description: `The mode is \`off\`. Enable it with \`${PREFIXO}banglobal avisar\` or \`${PREFIXO}banglobal banir\` before sweeping — or use \`${PREFIXO}banglobal varrer ver\` just to see who would show up.`,
        colour: COR.aviso,
      }));
    }

    await sendEmbed(message.channel, tr(ctx,
      { title: "🔎 Varrendo os membros…",
        description: "Conferindo quem já está no servidor contra a lista global. Pode levar um instante.", colour: COR.info },
      { title: "🔎 Sweeping the members…",
        description: "Checking everyone already in the server against the global list. This may take a moment.", colour: COR.info }));

    const r = await varrer(ctx, message, { aplicar: !soVer });
    if (r.erro) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Varredura falhou",
          description: `${r.erro}\n\n_O bot precisa de permissão para ver os membros._`, colour: COR.erro },
        { title: "❌ Sweep failed",
          description: `${r.erro}\n\n_The bot needs permission to see the members._`, colour: COR.erro }));
    }

    if (!r.achados.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nenhum encontrado",
          description: `Conferi **${r.total}** membro(s) e ninguém consta na lista global.`, colour: COR.sucesso },
        { title: "✅ Nobody found",
          description: `I checked **${r.total}** member(s) and nobody is on the global list.`, colour: COR.sucesso }));
    }

    const lista = r.achados.slice(0, 15)
      .map((a) => lang === "en"
        ? `• <@${a.uid}> (**${a.nome}**) — banned on ${a.n} server(s)`
        : `• <@${a.uid}> (**${a.nome}**) — banido em ${a.n} servidor(es)`).join("\n");
    const extra = r.achados.length > 15
      ? (lang === "en" ? `\n_… and ${r.achados.length - 15} more._` : `\n_… e mais ${r.achados.length - 15}._`) : "";

    if (soVer || modo !== "banir") {
      return sendEmbed(message.channel, lang === "en" ? {
        title: `🔎 ${r.achados.length} on the global list`,
        description: [
          `Out of **${r.total}** server member(s):`, "", lista + extra, "",
          soVer ? `_Simulation: nothing was done. Run \`${PREFIXO}banglobal varrer\` to act._`
                : `_Mode **${modo}**: no automatic action. Use \`${PREFIXO}banglobal banir\` and sweep again to ban._`,
        ].join("\n").slice(0, 1900), colour: COR.aviso,
      } : {
        title: `🔎 ${r.achados.length} na lista global`,
        description: [
          `De **${r.total}** membro(s) do servidor:`, "", lista + extra, "",
          soVer ? `_Simulação: nada foi feito. Rode \`${PREFIXO}banglobal varrer\` para agir._`
                : `_Modo **${modo}**: nenhuma ação automática. Use \`${PREFIXO}banglobal banir\` e varra de novo para banir._`,
        ].join("\n").slice(0, 1900), colour: COR.aviso });
    }

    const ok = r.aplicados.filter((a) => a.ok).length;
    const falhas = r.aplicados.filter((a) => !a.ok);
    return sendEmbed(message.channel, lang === "en" ? {
      title: `🔨 Sweep finished — ${ok} banned`,
      description: [
        `I checked **${r.total}** member(s); **${r.achados.length}** were on the list.`, "",
        lista + extra,
        falhas.length ? `\n**Failures (${falhas.length}):**\n` + falhas.slice(0, 5).map((f) => `• ${f.nome}: ${f.erro}`).join("\n") : "",
        falhas.length ? "_Common failure: the bot's role needs **BanMembers** and must sit above the person's role._" : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso,
    } : {
      title: `🔨 Varredura concluída — ${ok} banido(s)`,
      description: [
        `Conferi **${r.total}** membro(s); **${r.achados.length}** constavam na lista.`, "",
        lista + extra,
        falhas.length ? `\n**Falhas (${falhas.length}):**\n` + falhas.slice(0, 5).map((f) => `• ${f.nome}: ${f.erro}`).join("\n") : "",
        falhas.length ? "_Falha comum: o cargo do bot precisa de **BanMembers** e estar acima do cargo da pessoa._" : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso });
  }

  // ── &banglobal auto / importar ──
  //
  // Os dois deixaram de ser configuração: a contribuição é incondicional e a
  // importação roda sozinha. Em vez de responder "subcomando desconhecido" a
  // quem tinha o hábito de rodá-los, explicamos o que mudou e mostramos o
  // estado real da lista — o comando some, a informação não.
  if (["auto", "automatico", "automático", "automatic", "autoimport",
       "importar", "import", "sincronizar", "sync"].includes(sub)) {
    const registros = db.bansGlobaisDoServidor?.(serverId) ?? null;
    const linhaServidor = registros === null
      ? null
      : (lang === "en"
        ? `**From this server:** ${registros} record(s) already in the list.`
        : `**Deste servidor:** ${registros} registro(s) já na lista.`);

    return sendEmbed(message.channel, tr(ctx, {
      title: "🌐 Importação: agora é automática e permanente",
      description: [
        "Não existe mais o que ligar, desligar ou importar à mão.",
        "",
        "**Como funciona hoje**",
        "• Os bans **novos** entram na lista no instante em que acontecem.",
        "• Os bans **antigos** deste servidor são sincronizados sozinhos: logo após o bot subir e a cada 6 horas.",
        ...(linhaServidor ? ["", linhaServidor] : []),
        "",
        `A única escolha deste servidor é se ele **se aproveita** da lista: \`${PREFIXO}banglobal <off|avisar|banir>\`.`,
        "",
        `_Um registro específico que não se sustente pode sair com \`${PREFIXO}banglobal esquecer <@usuário>\`._`,
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "🌐 Importing: now automatic and permanent",
      description: [
        "There's nothing left to enable, disable or import by hand.",
        "",
        "**How it works now**",
        "• **New** bans join the list the moment they happen.",
        "• This server's **old** bans sync on their own: shortly after the bot boots and every 6 hours.",
        ...(linhaServidor ? ["", linhaServidor] : []),
        "",
        `This server's only choice is whether it **benefits** from the list: \`${PREFIXO}banglobal <off|avisar|banir>\`.`,
        "",
        `_A specific record that doesn't hold up can be dropped with \`${PREFIXO}banglobal esquecer <@user>\`._`,
      ].join("\n"),
      colour: COR.mod,
    }));
  }

  // ── &banglobal esquecer <usuário> ──
  if (sub === "esquecer") {
    const uid = (args[1] ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}banglobal esquecer <@usuário|id>\``, colour: COR.erro },
      { title: "❌ Wrong usage",
        description: `\`${PREFIXO}banglobal esquecer <@user|id>\``, colour: COR.erro }));

    const n = db.esquecerUsuario(uid);
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Usuário removido da lista global",
      descricao: `<@${message.authorId}> removeu <@${uid}> da lista global (**${n}** registro(s)).`,
    });
    return sendEmbed(message.channel, lang === "en" ? {
      title: "🌐 Removed from the global list",
      description: n
        ? `<@${uid}> was removed: **${n}** record(s) deleted.`
        : `<@${uid}> wasn't on the list.`,
      colour: COR.sucesso,
    } : {
      title: "🌐 Removido da lista global",
      description: n
        ? `<@${uid}> foi removido: **${n}** registro(s) apagado(s).`
        : `<@${uid}> não constava na lista.`,
      colour: COR.sucesso,
    });
  }

  return sendEmbed(message.channel, tr(ctx, {
    title: "❌ Subcomando desconhecido",
    description: `Use \`${PREFIXO}banglobal\` para ver as opções.`,
    colour: COR.erro,
  }, {
    title: "❌ Unknown subcommand",
    description: `Use \`${PREFIXO}banglobal\` to see the options.`,
    colour: COR.erro,
  }));
}
