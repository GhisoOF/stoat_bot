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
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";

const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");

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
//  Isenção por servidor
//
//  A lista global é feita do critério de moderação de OUTROS servidores.
//  Às vezes ele simplesmente não é o seu: a pessoa levou ban num servidor
//  de jogo por bater boca, e aqui ela é bem-vinda. Sem uma forma de dizer
//  isso, a única saída era `esquecer` — que apaga o registro para TODO
//  MUNDO, impondo a decisão deste servidor aos demais. A isenção resolve
//  no lugar certo: vale só aqui, e não mexe na lista dos outros.
// ──────────────────────────────────────────────────────────
export function estaIsento(config, userId) {
  return (config?.banGlobal?.isentos ?? []).includes(userId);
}

// Desbana de verdade, pela API. A stoat.js não expõe isso de forma estável
// entre versões, então tentamos o método da lib e caímos no REST — o mesmo
// caminho que o `&cor` já usa.
async function desbanir(server, serverId, userId) {
  try {
    if (typeof server?.unbanUser === "function") { await server.unbanUser(userId); return { ok: true }; }
  } catch (e) { /* cai no REST */ }
  const token = process.env.BOT_TOKEN;
  if (!token) return { ok: false, erro: "sem BOT_TOKEN para falar com a API" };
  try {
    const r = await fetch(`${API}/servers/${serverId}/bans/${userId}`, {
      method: "DELETE", headers: { "X-Bot-Token": token },
    });
    if (!r.ok && r.status !== 404) {
      const corpo = await r.text().catch(() => "");
      return { ok: false, erro: `HTTP ${r.status} ${corpo.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e?.message ?? String(e) };
  }
}

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

  // Isento: este servidor já decidiu que aceita esta pessoa.
  if (estaIsento(ctx.config, userId)) {
    console.log(`[BANGLOBAL] ${userId} entrou em ${serverId} e está ISENTO — nada a fazer`);
    return false;
  }

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
  const isentos = [];
  for (const m of membros) {
    const uid = m?.id?.user ?? m?.user?.id ?? m?.id;
    if (!uid) continue;
    const hist = db.historicoBans(uid).filter((b) => b.serverId !== serverId);
    if (!hist.length) continue;
    const nome = m?.user?.username ?? m?.nickname ?? uid;
    if (estaIsento(ctx.config, uid)) { isentos.push({ uid, nome, n: hist.length }); continue; }
    achados.push({ uid, nome, n: hist.length, membro: m });
  }

  if (!aplicar || modo !== "banir") return { total: membros.length, achados, isentos, aplicados: [], modo };

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
  return { total: membros.length, achados, isentos, aplicados, modo };
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
        `**Exempt here:** ${(config.banGlobal.isentos ?? []).length} person(s) this server accepts despite the list.`,
        "",
        "**Commands:**",
        `\`${PREFIXO}banglobal <off|avisar|banir>\` — sets the mode`,
        `\`${PREFIXO}banglobal lista\` — **everyone on the list** · \`lista servidor\` for this server's only`,
        `\`${PREFIXO}banglobal historico <@user|id>\` — one user's history`,
        `\`${PREFIXO}banglobal revisar\` — checks who's already here. **Shows only, never acts**`,
        `\`${PREFIXO}banglobal varrer confirmar\` — ⚠️ actually **bans** the ones found`,
        `\`${PREFIXO}banglobal isentar <@user>\` — accept someone despite the list _(and unban them here)_`,
        `\`${PREFIXO}banglobal isentos\` — who is exempt here`,
        `\`${PREFIXO}banglobal desfazer\` — ↩️ reverts the bans the list applied here`,
        `\`${PREFIXO}banglobal esquecer <@user|id>\` — removes a user from the list **for everyone**`,
        "",
        `**Contribution:** 🟢 always on — this server's bans (old and new) feed the list on their own. There's nothing to configure and no command to run.`,
        "",
        "_The mode above only decides whether this server **benefits** from the list. You can opt out of using it, but not out of feeding it._",
        "",
        "⚠️ _The `banir` mode acts on its own based on bans from **other** servers. Use it only if you trust the sources._",
        "",
        "_`revisar` **looks**; `varrer confirmar` **bans**. They used to be the same thing and that already caused accidental bans — now they're separate commands, and the sweep always shows the list first._",
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
        `**Isentos aqui:** ${(config.banGlobal.isentos ?? []).length} pessoa(s) que este servidor aceita apesar da lista.`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}banglobal <off|avisar|banir>\` — define o modo`,
        `\`${PREFIXO}banglobal lista\` — **todos os banidos** · \`lista servidor\` só os deste servidor`,
        `\`${PREFIXO}banglobal historico <@usuário|id>\` — histórico de uma pessoa`,
        `\`${PREFIXO}banglobal revisar\` — confere quem já está aqui. **Só mostra, nunca age**`,
        `\`${PREFIXO}banglobal varrer confirmar\` — ⚠️ **bane** de verdade quem for encontrado`,
        `\`${PREFIXO}banglobal isentar <@pessoa>\` — aceitar alguém apesar da lista _(e desbanir aqui)_`,
        `\`${PREFIXO}banglobal isentos\` — quem está isento neste servidor`,
        `\`${PREFIXO}banglobal desfazer\` — ↩️ reverte os bans que a lista aplicou aqui`,
        `\`${PREFIXO}banglobal esquecer <@usuário|id>\` — tira alguém da lista **para todos os servidores**`,
        "",
        `**Contribuição:** 🟢 sempre ligada — os bans deste servidor (antigos e novos) alimentam a lista sozinhos. Não há o que configurar nem comando a rodar.`,
        "",
        "_O modo acima decide só se este servidor **se aproveita** da lista. Dá para não usar a lista, mas não dá para usá-la sem alimentá-la._",
        "",
        "⚠️ _O modo `banir` age sozinho com base em bans de **outros** servidores. Use com confiança na origem._",
        "",
        "_`revisar` **olha**; `varrer confirmar` **bane**. Os dois eram a mesma coisa e isso já custou bans por engano — agora são comandos separados, e a varredura sempre mostra a lista antes._",
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

  // ── revisar: SÓ OLHA. Nunca age. ──
  //
  // `revisar` era apelido de `varrer`, e `varrer` banir. Uma palavra que
  // significa "conferir" executava a ação irreversível — e foi assim que
  // quatro pessoas foram banidas por engano num servidor. Agora as duas
  // ideias têm nomes distintos e comportamentos distintos: `revisar` mostra,
  // `varrer` age (e ainda pede confirmação).
  if (["revisar", "review", "conferir", "checar", "ver"].includes(sub)) {
    await sendEmbed(message.channel, tr(ctx,
      { title: "🔎 Revisando…", description: "Conferindo os membros contra a lista global. Nada será feito.", colour: COR.info },
      { title: "🔎 Reviewing…", description: "Checking members against the global list. Nothing will be done.", colour: COR.info }));

    const r = await varrer(ctx, message, { aplicar: false });
    if (r.erro) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Revisão falhou", description: `${r.erro}\n\n_O bot precisa de permissão para ver os membros._`, colour: COR.erro },
        { title: "❌ Review failed", description: `${r.erro}\n\n_The bot needs permission to see the members._`, colour: COR.erro }));
    }
    if (!r.achados.length && !r.isentos.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nenhum encontrado", description: `Conferi **${r.total}** membro(s) e ninguém consta na lista global.`, colour: COR.sucesso },
        { title: "✅ Nobody found", description: `I checked **${r.total}** member(s) and nobody is on the global list.`, colour: COR.sucesso }));
    }

    const linhas = [
      tr(ctx, `De **${r.total}** membro(s) do servidor:`, `Out of **${r.total}** server member(s):`), "",
      ...r.achados.map((a) => tr(ctx,
        `• <@${a.uid}> (**${a.nome}**) — banido em ${a.n} servidor(es)`,
        `• <@${a.uid}> (**${a.nome}**) — banned on ${a.n} server(s)`)),
    ];
    if (r.isentos.length) {
      linhas.push("", tr(ctx, `**Isentos** _(este servidor já decidiu aceitar)_`, `**Exempt** _(this server already chose to accept them)_`),
        ...r.isentos.map((a) => `• <@${a.uid}> (**${a.nome}**) — ${a.n}`));
    }
    linhas.push("", tr(ctx,
      `_Revisão: **nada foi feito**._\n\`${PREFIXO}banglobal isentar <@pessoa>\` — aceitar alguém apesar da lista\n\`${PREFIXO}banglobal historico <@pessoa>\` — ver por que ela está lá\n\`${PREFIXO}banglobal varrer\` — se você realmente quiser **banir** os de cima`,
      `_Review: **nothing was done**._\n\`${PREFIXO}banglobal isentar <@user>\` — accept someone despite the list\n\`${PREFIXO}banglobal historico <@user>\` — see why they're on it\n\`${PREFIXO}banglobal varrer\` — if you really want to **ban** the ones above`));

    const paginas = paginarLinhas(linhas, {
      titulo: tr(ctx, `🔎 Revisão — ${r.achados.length} na lista global`, `🔎 Review — ${r.achados.length} on the global list`),
      limite: 1300,
    });
    return enviarPaginado(ctx, message.channel, { paginas, autorId: message.authorId, colour: COR.aviso });
  }

  // ── varrer: age, mas só depois de você ver a lista e confirmar ──
  if (["varrer", "varredura", "scan", "sweep"].includes(sub)) {
    const arg1 = (args[1] ?? "").toLowerCase();
    const confirmou = ["confirmar", "confirm", "sim", "yes"].includes(arg1);
    const modo = config?.banGlobal?.modo ?? "off";

    if (modo !== "banir") {
      return sendEmbed(message.channel, tr(ctx, {
        title: "🌐 A varredura só bane no modo `banir`",
        description: [
          `O modo atual é \`${modo}\`.`,
          "",
          `Para **só conferir**, use \`${PREFIXO}banglobal revisar\` — ele mostra quem consta na lista e não faz nada.`,
          `Para banir, mude o modo com \`${PREFIXO}banglobal banir\` e varra de novo.`,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "🌐 The sweep only bans in `banir` mode",
        description: [
          `The current mode is \`${modo}\`.`,
          "",
          `To **just check**, use \`${PREFIXO}banglobal revisar\` — it shows who's on the list and does nothing.`,
          `To ban, switch with \`${PREFIXO}banglobal banir\` and sweep again.`,
        ].join("\n"), colour: COR.aviso,
      }));
    }

    await sendEmbed(message.channel, tr(ctx,
      { title: "🔎 Varrendo os membros…", description: "Conferindo quem já está no servidor contra a lista global.", colour: COR.info },
      { title: "🔎 Sweeping the members…", description: "Checking everyone already in the server against the global list.", colour: COR.info }));

    // Sempre lista ANTES de agir. Mesmo com o modo `banir` ligado, banir
    // gente sem mostrar quem é primeiro foi exatamente o erro que custou
    // quatro pessoas.
    const previa = await varrer(ctx, message, { aplicar: false });
    if (previa.erro) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Varredura falhou", description: `${previa.erro}\n\n_O bot precisa de permissão para ver os membros._`, colour: COR.erro },
        { title: "❌ Sweep failed", description: `${previa.erro}\n\n_The bot needs permission to see the members._`, colour: COR.erro }));
    }
    if (!previa.achados.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nenhum encontrado", description: `Conferi **${previa.total}** membro(s) e ninguém a banir.`, colour: COR.sucesso },
        { title: "✅ Nobody found", description: `I checked **${previa.total}** member(s) and there's nobody to ban.`, colour: COR.sucesso }));
    }

    const lista = previa.achados.slice(0, 15)
      .map((a) => tr(ctx, `• <@${a.uid}> (**${a.nome}**) — ${a.n} servidor(es)`, `• <@${a.uid}> (**${a.nome}**) — ${a.n} server(s)`)).join("\n");
    const extra = previa.achados.length > 15
      ? tr(ctx, `\n_… e mais ${previa.achados.length - 15}._`, `\n_… and ${previa.achados.length - 15} more._`) : "";

    if (!confirmou) {
      return sendEmbed(message.channel, tr(ctx, {
        title: `⚠️ Confirmar: banir ${previa.achados.length} pessoa(s)?`,
        description: [
          `De **${previa.total}** membro(s), estas constam na lista global:`, "", lista + extra, "",
          "**Nada foi feito ainda.**",
          "",
          `Para banir todas: \`${PREFIXO}banglobal varrer confirmar\``,
          `Para poupar alguém antes: \`${PREFIXO}banglobal isentar <@pessoa>\``,
          `Para entender um caso: \`${PREFIXO}banglobal historico <@pessoa>\``,
          "",
          "_Banir é irreversível pelo lado de quem levou o ban: ela precisa de convite novo para voltar._",
        ].join("\n").slice(0, 1900), colour: COR.aviso,
      }, {
        title: `⚠️ Confirm: ban ${previa.achados.length} people?`,
        description: [
          `Out of **${previa.total}** member(s), these are on the global list:`, "", lista + extra, "",
          "**Nothing has been done yet.**",
          "",
          `To ban them all: \`${PREFIXO}banglobal varrer confirmar\``,
          `To spare someone first: \`${PREFIXO}banglobal isentar <@user>\``,
          `To understand a case: \`${PREFIXO}banglobal historico <@user>\``,
          "",
          "_A ban is irreversible from the other side: they need a fresh invite to come back._",
        ].join("\n").slice(0, 1900), colour: COR.aviso,
      }));
    }

    const r = await varrer(ctx, message, { aplicar: true });
    const ok = r.aplicados.filter((a) => a.ok).length;
    const falhas = r.aplicados.filter((a) => !a.ok);
    return sendEmbed(message.channel, tr(ctx, {
      title: `🔨 Varredura concluída — ${ok} banido(s)`,
      description: [
        `Conferi **${r.total}** membro(s); **${r.achados.length}** constavam na lista.`, "", lista + extra,
        falhas.length ? `\n**Falhas (${falhas.length}):**\n` + falhas.slice(0, 5).map((f) => `• ${f.nome}: ${f.erro}`).join("\n") : "",
        falhas.length ? "_Falha comum: o cargo do bot precisa de **BanMembers** e estar acima do cargo da pessoa._" : "",
        "",
        `_Errou? \`${PREFIXO}banglobal desfazer\` reverte os bans que EU apliquei aqui._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso,
    }, {
      title: `🔨 Sweep finished — ${ok} banned`,
      description: [
        `I checked **${r.total}** member(s); **${r.achados.length}** were on the list.`, "", lista + extra,
        falhas.length ? `\n**Failures (${falhas.length}):**\n` + falhas.slice(0, 5).map((f) => `• ${f.nome}: ${f.erro}`).join("\n") : "",
        falhas.length ? "_Common failure: the bot's role needs **BanMembers** and must sit above the person's role._" : "",
        "",
        `_Wrong call? \`${PREFIXO}banglobal desfazer\` reverts the bans I applied here._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso,
    }));
  }

  // ── desfazer: reverte os bans que a LISTA aplicou neste servidor ──
  //
  // Só os que o bot aplicou por causa da lista global (origem `banglobal`).
  // Bans manuais e do automod ficam de fora: desfazer o trabalho da
  // moderação daqui não é papel deste comando.
  if (["desfazer", "undo", "reverter", "revert"].includes(sub)) {
    const confirmou = ["confirmar", "confirm", "sim", "yes"].includes((args[1] ?? "").toLowerCase());
    const aplicados = db.bansGlobaisPorOrigem(serverId, ["banglobal"]);
    if (!aplicados.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nada a desfazer", description: "Não há ban aplicado pela lista global neste servidor.", colour: COR.sucesso },
        { title: "✅ Nothing to undo", description: "There's no ban applied by the global list on this server.", colour: COR.sucesso }));
    }

    const lista = aplicados.slice(0, 20).map((b) => `• <@${b.userId}> _(${data(b.criadoEm)})_`).join("\n");
    if (!confirmou) {
      return sendEmbed(message.channel, tr(ctx, {
        title: `↩️ Desfazer ${aplicados.length} ban(s) da lista global?`,
        description: [
          "Estes bans foram aplicados **pelo bot**, por causa da lista global:", "", lista,
          aplicados.length > 20 ? `\n_… e mais ${aplicados.length - 20}._` : "", "",
          "Ao desfazer, cada pessoa é **desbanida** e passa a ficar **isenta** aqui — senão a próxima varredura banaria de novo.",
          "",
          `Confirme com \`${PREFIXO}banglobal desfazer confirmar\`.`,
          "",
          "_Bans manuais e do automod não são tocados._",
        ].filter(Boolean).join("\n").slice(0, 1900), colour: COR.aviso,
      }, {
        title: `↩️ Undo ${aplicados.length} global-list ban(s)?`,
        description: [
          "These bans were applied **by the bot**, because of the global list:", "", lista,
          aplicados.length > 20 ? `\n_… and ${aplicados.length - 20} more._` : "", "",
          "Undoing unbans each person and marks them **exempt** here — otherwise the next sweep would ban them again.",
          "",
          `Confirm with \`${PREFIXO}banglobal desfazer confirmar\`.`,
          "",
          "_Manual and automod bans are left alone._",
        ].filter(Boolean).join("\n").slice(0, 1900), colour: COR.aviso,
      }));
    }

    config.banGlobal.isentos ??= [];
    const feitos = [], falhou = [];
    for (const b of aplicados) {
      const r = await desbanir(server, serverId, b.userId);
      if (r.ok) {
        db.removerBanGlobal(b.userId, serverId);
        if (!config.banGlobal.isentos.includes(b.userId)) config.banGlobal.isentos.push(b.userId);
        feitos.push(b.userId);
      } else {
        falhou.push({ uid: b.userId, erro: r.erro });
      }
    }
    salvarConfig();
    await log.registrar(ctx, "punicoes", {
      titulo: "↩️ Bans da lista global desfeitos",
      descricao: `<@${message.authorId}> reverteu **${feitos.length}** ban(s) aplicado(s) pela lista global.`,
    });
    return sendEmbed(message.channel, tr(ctx, {
      title: `↩️ ${feitos.length} ban(s) desfeito(s)`,
      description: [
        feitos.length ? feitos.map((u) => `✅ <@${u}> — desbanido e isento aqui`).join("\n") : "",
        falhou.length ? `\n**Não consegui (${falhou.length}):**\n` + falhou.slice(0, 5).map((f) => `❌ <@${f.uid}> — ${f.erro}`).join("\n") : "",
        "",
        "As pessoas precisam de um **convite novo** para voltar: o desban só remove o impedimento.",
        `_Ver quem está isento: \`${PREFIXO}banglobal isentos\`._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhou.length ? COR.aviso : COR.sucesso,
    }, {
      title: `↩️ ${feitos.length} ban(s) undone`,
      description: [
        feitos.length ? feitos.map((u) => `✅ <@${u}> — unbanned and exempt here`).join("\n") : "",
        falhou.length ? `\n**Couldn't do (${falhou.length}):**\n` + falhou.slice(0, 5).map((f) => `❌ <@${f.uid}> — ${f.erro}`).join("\n") : "",
        "",
        "They need a **fresh invite** to come back: unbanning only removes the block.",
        `_See who's exempt: \`${PREFIXO}banglobal isentos\`._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhou.length ? COR.aviso : COR.sucesso,
    }));
  }

  // ── isentar / isentos: o bypass deste servidor ──
  if (["isentar", "isento", "isentos", "exempt", "permitir", "aceitar", "allow", "bypass"].includes(sub)) {
    const acao = (args[1] ?? "").toLowerCase();
    const listar = ["isentos", "exempt"].includes(sub) || ["lista", "list", "ver"].includes(acao) || !args[1];
    config.banGlobal.isentos ??= [];

    if (listar) {
      const ids = config.banGlobal.isentos;
      return sendEmbed(message.channel, tr(ctx, {
        title: `🛡️ Isentos da lista global — ${ids.length}`,
        description: [
          ids.length
            ? ids.map((u) => `• <@${u}> _(${db.contarBansGlobais(u)} servidor(es) na lista)_`).join("\n")
            : "_Ninguém._",
          "",
          "Quem está aqui **entra e fica**, mesmo constando na lista global. A lista dos outros servidores não é apagada — só deixa de valer aqui.",
          "",
          `\`${PREFIXO}banglobal isentar <@pessoa|id>\` — aceitar alguém`,
          `\`${PREFIXO}banglobal isentar remover <@pessoa|id>\` — voltar atrás`,
        ].join("\n").slice(0, 1900), colour: COR.info,
      }, {
        title: `🛡️ Exempt from the global list — ${ids.length}`,
        description: [
          ids.length
            ? ids.map((u) => `• <@${u}> _(${db.contarBansGlobais(u)} server(s) on the list)_`).join("\n")
            : "_Nobody._",
          "",
          "People here **join and stay**, even if they're on the global list. Other servers' records aren't deleted — they just stop applying here.",
          "",
          `\`${PREFIXO}banglobal isentar <@user|id>\` — accept someone`,
          `\`${PREFIXO}banglobal isentar remover <@user|id>\` — take it back`,
        ].join("\n").slice(0, 1900), colour: COR.info,
      }));
    }

    const removendo = ["remover", "remove", "tirar", "off"].includes(acao);
    const alvo = removendo ? args[2] : args[1];
    const uid = await resolverUser(alvo, { message, server }) ?? (alvo ?? "").replace(/[<@>]/g, "");
    if (!uid) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não achei essa pessoa",
        description: `\`${PREFIXO}banglobal isentar <@pessoa|id>\`\n\n_Se ela já foi banida e não está no servidor, use o **ID**._`, colour: COR.erro },
      { title: "❌ Couldn't find that person",
        description: `\`${PREFIXO}banglobal isentar <@user|id>\`\n\n_If they're already banned and not in the server, use the **ID**._`, colour: COR.erro }));

    if (removendo) {
      const antes = config.banGlobal.isentos.length;
      config.banGlobal.isentos = config.banGlobal.isentos.filter((u) => u !== uid);
      salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: antes === config.banGlobal.isentos.length ? "🤷 Não estava isento" : "🛡️ Isenção removida",
          description: `<@${uid}> volta a ser tratado pela lista global neste servidor.`, colour: COR.mod },
        { title: antes === config.banGlobal.isentos.length ? "🤷 Wasn't exempt" : "🛡️ Exemption removed",
          description: `<@${uid}> is subject to the global list again on this server.`, colour: COR.mod }));
    }

    if (!config.banGlobal.isentos.includes(uid)) config.banGlobal.isentos.push(uid);
    salvarConfig();

    // Se a pessoa já está banida AQUI, isentar sem desbanir seria meia
    // ajuda: ela continuaria de fora. Desfazemos o ban se ele foi nosso.
    const nossoBan = db.bansGlobaisPorOrigem(serverId, ["banglobal"]).some((b) => b.userId === uid);
    let desbanida = false, erroDesban = null;
    if (nossoBan) {
      const r = await desbanir(server, serverId, uid);
      if (r.ok) { db.removerBanGlobal(uid, serverId); desbanida = true; } else erroDesban = r.erro;
    }
    await log.registrar(ctx, "punicoes", {
      titulo: "🛡️ Isenção da lista global",
      descricao: `<@${message.authorId}> isentou <@${uid}>${desbanida ? " (e desfez o ban aplicado pela lista)" : ""}.`,
    });
    const n = db.contarBansGlobais(uid);
    return sendEmbed(message.channel, tr(ctx, {
      title: "🛡️ Isento aqui",
      description: [
        `<@${uid}> é aceito neste servidor, mesmo constando na lista global${n ? ` (**${n}** servidor(es))` : ""}.`,
        desbanida ? "\n✅ O ban que a lista tinha aplicado aqui foi **desfeito** — mande um convite novo para a pessoa voltar." : "",
        erroDesban ? `\n⚠️ Não consegui desfazer o ban: \`${erroDesban}\`` : "",
        "",
        "_A lista dos outros servidores continua intacta: a isenção vale só aqui._",
      ].filter(Boolean).join("\n"), colour: COR.sucesso,
    }, {
      title: "🛡️ Exempt here",
      description: [
        `<@${uid}> is accepted on this server, even though they're on the global list${n ? ` (**${n}** server(s))` : ""}.`,
        desbanida ? "\n✅ The ban the list had applied here was **undone** — send them a fresh invite to come back." : "",
        erroDesban ? `\n⚠️ Couldn't undo the ban: \`${erroDesban}\`` : "",
        "",
        "_Other servers' records stay intact: the exemption applies here only._",
      ].filter(Boolean).join("\n"), colour: COR.sucesso,
    }));
  }

  // ── lista: TODO MUNDO que consta na lista global ──
  if (["lista", "list", "banidos", "banned", "todos", "all"].includes(sub)) {
    const soDaqui = ["servidor", "server", "aqui", "here", "daqui"].includes((args[1] ?? "").toLowerCase());
    const linhas0 = db.listarBanidosGlobais({ limite: 500, serverId: soDaqui ? serverId : null });
    if (!linhas0.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🌐 Lista vazia", description: "Ninguém na lista global ainda.", colour: COR.info },
        { title: "🌐 Empty list", description: "Nobody on the global list yet.", colour: COR.info }));
    }
    const isentos = config.banGlobal?.isentos ?? [];
    const linhas = [
      soDaqui
        ? tr(ctx, `**${linhas0.length}** pessoa(s) banida(s) **por este servidor**:`, `**${linhas0.length}** person(s) banned **by this server**:`)
        : tr(ctx, `**${linhas0.length}** pessoa(s) na lista global (todos os servidores):`, `**${linhas0.length}** person(s) on the global list (all servers):`),
      "",
      ...linhas0.map((b) => {
        const marca = isentos.includes(b.userId) ? "🛡️ " : "";
        const motivo = (b.motivo ?? "").slice(0, 60);
        return soDaqui
          ? `${marca}<@${b.userId}> — ${motivo || tr(ctx, "_sem motivo_", "_no reason_")} _(${data(b.ultimo)}, ${b.origem})_`
          : `${marca}<@${b.userId}> — ${b.servidores} ${tr(ctx, "servidor(es)", "server(s)")} _(${data(b.ultimo)})_`;
      }),
      "",
      tr(ctx,
        `🛡️ = isento aqui · \`${PREFIXO}banglobal historico <@pessoa>\` mostra o porquê de cada caso\n\`${PREFIXO}banglobal lista servidor\` — só os banidos por este servidor`,
        `🛡️ = exempt here · \`${PREFIXO}banglobal historico <@user>\` shows the reason for each case\n\`${PREFIXO}banglobal lista servidor\` — only those banned by this server`),
    ];
    const paginas = paginarLinhas(linhas, {
      titulo: soDaqui
        ? tr(ctx, "🌐 Banidos por este servidor", "🌐 Banned by this server")
        : tr(ctx, "🌐 Todos na lista global", "🌐 Everyone on the global list"),
      limite: 1300,
    });
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, comandoPagina: `${PREFIXO}banglobal lista`, colour: COR.mod,
    });
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
