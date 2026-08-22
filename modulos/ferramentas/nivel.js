// ══════════════════════════════════════════════════════════
//  nivel.js — sistema de XP e níveis (&xp)
//
//  Cada mensagem dá XP (com cooldown p/ não farmar por spam). Ao juntar XP
//  suficiente, o usuário sobe de nível. A cada N níveis, pode ganhar um cargo.
//
//  ⚠️ XP por tempo em call NÃO é suportado: a SDK do Stoat não emite eventos
//     de voz (join/leave), então não há como cronometrar call de forma
//     confiável. Todo o XP vem de mensagens.
//
//  Comandos:
//   &xp                    → seu nível, XP e progresso
//   &xp rank [@usuário]     → idem, de outra pessoa
//   &xp top                 → leaderboard (ranking + XP + nível)
//   &xp setup               → assistente de configuração
//   &xp cargos              → lista os cargos de nível
//   &xp criarcargos         → cria os cargos automaticamente
//   &xp reset               → zera o XP do servidor (cuidado!)
//   &xp on | off            → liga/desliga o sistema
//
//  Config (via &xp setup): multiplicador de dificuldade, nível máximo,
//  intervalo de cargos (5 ou 10), canal de anúncio.
//
//  ── Segurança de hierarquia ──
//  Todos os cargos criados aqui são ordenados ABAIXO do cargo de silêncio
//  (mute), se existir, para que ninguém possa usar um cargo de nível para
//  escapar do mute.
// ══════════════════════════════════════════════════════════

import * as db from "../core/db.js";
import { limparId, ULID, resolverUsuario } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";
import * as log from "../core/log.js";


// ── Fórmula de progressão ──────────────────────────────────
// XP total necessário para ATINGIR um nível N.
// Cresce de forma polinomial pelo multiplicador (dificuldade).
// nível 1 = base; cada nível seguinte exige mais, escalado por `mult`.
//
// MEMOIZAÇÃO: xpParaNivel somava de 1..N a cada chamada, e nivelPorXp a
// chamava em série — O(n²) com Math.pow, EM TODA MENSAGEM (via aoMensagem).
// A curva só depende de (base, mult), que são config e quase nunca mudam:
// a tabela acumulada é calculada uma vez por combinação e reutilizada.
const _tabelasXp = new Map();   // `${base}|${mult}` → number[] (acumulado por nível)
function tabelaXp(base, mult, ateNivel) {
  const k = `${base}|${mult}`;
  let tab = _tabelasXp.get(k);
  if (!tab) { tab = [0]; _tabelasXp.set(k, tab); if (_tabelasXp.size > 64) _tabelasXp.clear(); }
  while (tab.length <= ateNivel) {
    const i = tab.length;
    tab.push(tab[i - 1] + Math.floor(base * Math.pow(i, mult)));
  }
  return tab;
}

function xpParaNivel(nivel, base = 100, mult = 1.5) {
  if (nivel <= 0) return 0;
  return tabelaXp(base, mult, nivel)[nivel];
}

// Dado um XP total, calcula o nível atingido (respeitando o teto).
// Busca binária na tabela acumulada: O(log n) em vez do O(n²) antigo.
function nivelPorXp(xp, mult = 1.5, nivelMax = 100, base = 100) {
  const tab = tabelaXp(base, mult, nivelMax);
  let lo = 0, hi = nivelMax;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xp >= tab[mid]) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// Progresso dentro do nível atual (para a barra): {atual, necessario, pct}
function progresso(xp, nivel, mult, base = 100) {
  const inicioNivel = xpParaNivel(nivel, base, mult);
  const fimNivel = xpParaNivel(nivel + 1, base, mult);
  const atual = xp - inicioNivel;
  const necessario = Math.max(1, fimNivel - inicioNivel);
  return { atual, necessario, pct: Math.min(100, Math.round((atual / necessario) * 100)) };
}

function barra(pct, tam = 12) {
  const cheio = Math.round((pct / 100) * tam);
  return "▰".repeat(cheio) + "▱".repeat(tam - cheio);
}

// ── Descobre o cargo de mute (silêncio) do servidor ────────
// Aceita o cargo salvo na config (cargoMudo) e/ou detecta por nome.
function acharCargoMute(server, config) {
  const salvo = config?.cargoMudoId ?? config?.automod?.punicao?.silenceRoleId ?? null;
  if (salvo && server.roles?.get?.(salvo)) return server.roles.get(salvo);
  // fallback: procura por nome
  for (const [id, role] of server.roles ?? []) {
    if (/mud[oa]|mute|silenc|silêncio/i.test(role.name || "")) return role;
  }
  return null;
}

// ── Reordena os cargos para ficarem ABAIXO do mute ─────────
// No Stoat, rank menor = mais alto. "Abaixo do mute" = rank MAIOR que o do mute.
async function ordenarAbaixoDoMute(server, config, idsCargosNivel) {
  const mute = acharCargoMute(server, config);
  if (!mute) return { ok: true, semMute: true };

  try {
    // pega a ordem atual (orderedRoles: mais alto → mais baixo)
    const ordenados = server.orderedRoles ?? [];
    const ids = ordenados.map((r) => r.id ?? r.role?.id).filter(Boolean);

    // remove os cargos de nível da lista e reinsere logo DEPOIS do mute
    const semNiveis = ids.filter((id) => !idsCargosNivel.includes(id));
    const posMute = semNiveis.indexOf(mute.id);
    if (posMute === -1) return { ok: false, motivo: "mute não está na ordenação" };

    const nova = [
      ...semNiveis.slice(0, posMute + 1),   // tudo até o mute (inclusive)
      ...idsCargosNivel,                     // cargos de nível logo abaixo
      ...semNiveis.slice(posMute + 1),       // o resto
    ];
    await server.setRoleOrdering(nova);
    return { ok: true };
  } catch (e) {
    console.error("[GAME][ordenar]", e.message);
    return { ok: false, motivo: e.message };
  }
}

// ── Concede o cargo do nível (e remove o do nível anterior, opcional) ──
async function aplicarCargoNivel(server, member, serverId, nivel, config) {
  const roleId = db.cargoDoNivel(serverId, nivel);
  if (!roleId) return null;
  try {
    const atuais = new Set(member.roles ?? []);
    atuais.add(roleId);
    await member.edit({ roles: [...atuais] });
    return roleId;
  } catch (e) {
    console.error("[GAME][cargo]", e.message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
//  Sincronizar TODOS os cargos que o nível atual já mereceu
//
//  O cargo era concedido só no instante do level up. Quem sai do servidor
//  — por vontade própria, kick ou ban — perde os cargos, e o XP fica no
//  banco. Ao voltar, a pessoa reaparece sem nada: o XP diz nível 14, mas os
//  cargos só voltariam quando ela chegasse ao 15, o que pode levar semanas.
//  Do ponto de vista dela, o progresso simplesmente sumiu.
//
//  Esta função reconcilia: dá tudo que o nível atual já garante. Também
//  cobre o caso de quem pula vários marcos de uma vez (multiplicador alto,
//  ou XP dado pelo admin) e o de cargos criados DEPOIS de a pessoa já ter
//  passado do nível.
//
//  Devolve { concedidos: [roleId], nivel } — ou null se não havia o que fazer.
// ──────────────────────────────────────────────────────────
export async function sincronizarCargos(server, member, serverId, { nivel = null } = {}) {
  if (!server || !member || !serverId) return null;
  const userId = member?.id?.user ?? member?.user?.id ?? member?.id;
  if (!userId) return null;

  const nivelAtual = nivel ?? db.getXp(serverId, userId)?.nivel ?? 0;
  if (nivelAtual < 1) return null;

  const marcos = db.listarCargosNivel(serverId).filter((c) => c.nivel <= nivelAtual);
  if (!marcos.length) return null;

  const atuais = new Set((member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean));
  // Só cargos que ainda EXISTEM no servidor: um cargo apagado à mão continua
  // no banco, e mandar um id morto no edit() faz a chamada inteira falhar.
  const existe = (id) => {
    try { return !!(server.roles?.get?.(id) ?? server.roles?.[id]); } catch { return true; }
  };
  const faltando = marcos.map((c) => c.roleId).filter((id) => id && !atuais.has(id) && existe(id));
  if (!faltando.length) return { concedidos: [], nivel: nivelAtual };

  try {
    await member.edit({ roles: [...atuais, ...faltando] });
    console.log(`[XP] cargos sincronizados para ${userId} em ${serverId}: +${faltando.length} (nível ${nivelAtual})`);
    return { concedidos: faltando, nivel: nivelAtual };
  } catch (e) {
    console.error("[XP][sincronizar]", e?.message ?? e);
    return { concedidos: [], nivel: nivelAtual, erro: e?.message ?? String(e) };
  }
}

// Chamado quando alguém ENTRA no servidor: devolve os cargos de nível que a
// pessoa já tinha conquistado. É o conserto do "voltei e perdi tudo".
export async function aoEntrar(member, ctx) {
  try {
    const serverId = member?.id?.server ?? ctx?.serverId;
    if (!serverId || !ctx?.config?.xp?.enabled) return null;
    const server = member.server
      ?? ctx.client?.servers?.get?.(serverId)
      ?? await ctx.client?.servers?.fetch?.(serverId).catch(() => null);
    if (!server) return null;
    const r = await sincronizarCargos(server, member, serverId);
    if (r?.concedidos?.length) {
      await log.registrar(ctx, "cargos", {
        titulo: "🎖 Cargos de nível devolvidos",
        descricao: `<@${member?.id?.user}> voltou e recuperou **${r.concedidos.length}** cargo(s) de nível (nível ${r.nivel}).`,
      });
    }
    return r;
  } catch (e) {
    console.error("[XP][aoEntrar]", e?.message ?? e);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
//  Handler de mensagem — concede XP
// ──────────────────────────────────────────────────────────
export async function aoMensagem(message, ctx) {
  const { config, serverId } = ctx;
  const g = config.xp;
  const DBG = process.env.XP_DEBUG === "1";
  if (!g?.enabled) { if (DBG) console.log(`[XP] pulado: sistema desligado (serverId=${serverId})`); return; }
  if (!serverId) { if (DBG) console.log("[XP] pulado: serverId nulo"); return; }

  const userId = message.authorId;
  if (!userId) { if (DBG) console.log("[XP] pulado: authorId nulo"); return; }

  const agora = Date.now();
  const atual = db.getXp(serverId, userId);

  // cooldown: só ganha XP a cada g.cooldownMs
  if (atual.ultimaMsg && agora - new Date(atual.ultimaMsg).getTime() < g.cooldownMs) {
    if (DBG) console.log(`[XP] pulado: cooldown (faltam ${Math.round((g.cooldownMs - (agora - new Date(atual.ultimaMsg).getTime()))/1000)}s) user=${userId}`);
    return;
  }

  const ganho = Math.floor(g.xpMin + Math.random() * (g.xpMax - g.xpMin + 1));
  const novoXp = atual.xp + ganho;
  const novoNivel = nivelPorXp(novoXp, g.multiplicador, g.nivelMaximo);

  db.setXp(serverId, userId, novoXp, novoNivel, new Date(agora).toISOString());
  if (DBG) console.log(`[XP] +${ganho} para ${userId} → ${novoXp} XP (nível ${novoNivel}) em ${serverId}`);

  // subiu de nível?
  if (novoNivel > atual.nivel) {
    let ganhouCargo = null;
    try {
      const server = await ctx.getServer(message);
      const member = await server.fetchMember(userId).catch(() => null);
      if (member) {
        // Concede o cargo do nível novo E qualquer marco anterior que esteja
        // faltando — quem pula dois níveis de uma vez não deixa um cargo para trás.
        const r = await sincronizarCargos(server, member, serverId, { nivel: novoNivel });
        ganhouCargo = r?.concedidos?.length
          ? r.concedidos[r.concedidos.length - 1]
          : await aplicarCargoNivel(server, member, serverId, novoNivel, config);
      }
    } catch (e) { console.error("[GAME][levelup]", e.message); }

    if (g.anunciarLevelUp) {
      const canal = g.canalAnuncio
        ? (ctx.client?.channels?.get?.(g.canalAnuncio) ?? message.channel)
        : message.channel;
      const lvLang = lingua(ctx);
      const extra = ganhouCargo
        ? (lvLang === "en" ? `\n🎖 You earned a new role!` : `\n🎖 Você ganhou um novo cargo!`) : "";
      try {
        await canal.sendMessage({ embeds: [{
          title: "🎉 Level Up!",
          description: lvLang === "en"
            ? `<@${userId}> reached **level ${novoNivel}**!${extra}`
            : `<@${userId}> subiu para o **nível ${novoNivel}**!${extra}`,
          colour: "#FFD700",
        }] });
      } catch (e) { console.error("[GAME][anuncio]", e.message); }
    }
  }
}

// ──────────────────────────────────────────────────────────
//  Comando &xp
// ──────────────────────────────────────────────────────────
export async function cmdXp(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config, serverId, getServer, membroTemPermissao } = ctx;
  const g = config.xp;
  const lang = lingua(ctx);
  const sub = args[0]?.toLowerCase();

  // Aviso: se o sistema está desligado, quase nada faz sentido. Avisa (exceto
  // para 'on', 'setup' e 'criarcargos', que são justamente para configurá-lo).
  if (!g?.enabled && !["on", "setup", "config", "configurar", "criarcargos", "criar"].includes(sub)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "💤 Sistema de níveis desligado",
      description: `O sistema de XP está **desativado** neste servidor, por isso ninguém está ganhando XP.\n\nPara ativar: \`${PREFIXO}xp on\` *(precisa de ManagePermissions)*.\nDepois, configure com \`${PREFIXO}xp setup\` se quiser.`,
      colour: COR.aviso,
    }, {
      title: "💤 Leveling system off",
      description: `The XP system is **disabled** on this server, so nobody is earning XP.\n\nTo enable it: \`${PREFIXO}xp on\` *(needs ManagePermissions)*.\nThen configure it with \`${PREFIXO}xp setup\` if you like.`,
      colour: COR.aviso,
    }));
  }

  // ── top / leaderboard ──
  if (sub === "top" || sub === "leaderboard" || sub === "ranking") {
    const top = db.topXp(serverId, 10);
    if (!top.length)
      return sendEmbed(message.channel, tr(ctx,
        { title: "🏆 Ranking", description: "Ainda não há ninguém com XP.", colour: COR.mod },
        { title: "🏆 Ranking", description: "Nobody has XP yet.", colour: COR.mod }));
    const linhas = top.map((e, i) => {
      const medalha = ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;
      return lang === "en"
        ? `${medalha} <@${e.userId}> — level **${e.nivel}** · ${e.xp} XP`
        : `${medalha} <@${e.userId}> — nível **${e.nivel}** · ${e.xp} XP`;
    });
    // nota: só XP de texto (call não é suportado pela plataforma)
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🏆 Level ranking" : "🏆 Ranking de níveis",
      description: linhas.join("\n") + (lang === "en"
        ? "\n\n_XP is earned from messages (Stoat can't measure call time)._"
        : "\n\n_XP é ganho por mensagens (o Stoat não permite medir tempo em call)._"),
      colour: COR.info,
    });
  }

  // ── setup ──
  // ── sincronizar: devolve os cargos que o nível já garante ──
  //
  // Conserta de uma vez quem perdeu os cargos ao sair/ser banido antes de o
  // bot passar a devolvê-los na entrada. Sem argumento, varre o servidor.
  if (["sincronizar", "sync", "recargos", "resync", "reaplicar"].includes(sub)) {
    if (!(await podeConfigurar(message, ctx))) return;
    const server = await getServer(message);
    const alvoTexto = args.slice(1).join(" ").trim();

    // Uma pessoa só
    if (alvoTexto && !["todos", "all", "servidor", "server"].includes(alvoTexto.toLowerCase())) {
      const alvoId = await resolverUsuario(alvoTexto, { message, server, client: ctx.client });
      if (!alvoId) return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não achei essa pessoa",
          description: `\`${PREFIXO}xp sincronizar [@pessoa|todos]\`\n\nAceito menção, ID ou nome.`, colour: COR.erro },
        { title: "❌ Couldn't find that person",
          description: `\`${PREFIXO}xp sincronizar [@user|todos]\`\n\nI accept a mention, ID or name.`, colour: COR.erro }));

      const membro = await server.fetchMember(alvoId).catch(() => null);
      if (!membro) return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não está no servidor",
          description: `<@${alvoId}> precisa estar aqui para receber os cargos. O XP dela continua guardado — assim que voltar, eu devolvo sozinho.`, colour: COR.aviso },
        { title: "❌ Not in the server",
          description: `<@${alvoId}> has to be here to receive the roles. Their XP is still stored — as soon as they return, I hand the roles back on my own.`, colour: COR.aviso }));

      const r = await sincronizarCargos(server, membro, serverId);
      if (!r) return sendEmbed(message.channel, tr(ctx,
        { title: "🤷 Nada a fazer", description: `<@${alvoId}> ainda não alcançou nenhum cargo de nível.`, colour: COR.info },
        { title: "🤷 Nothing to do", description: `<@${alvoId}> hasn't reached any level role yet.`, colour: COR.info }));

      return sendEmbed(message.channel, tr(ctx, {
        title: r.concedidos.length ? "🎖 Cargos devolvidos" : "✅ Já estava em dia",
        description: r.concedidos.length
          ? `<@${alvoId}> (nível **${r.nivel}**) recebeu **${r.concedidos.length}** cargo(s):\n${r.concedidos.map((id) => `<@&${id}>`).join(" ")}`
          : `<@${alvoId}> (nível **${r.nivel}**) já tinha todos os cargos do nível dela.`,
        colour: r.concedidos.length ? COR.sucesso : COR.info,
      }, {
        title: r.concedidos.length ? "🎖 Roles restored" : "✅ Already up to date",
        description: r.concedidos.length
          ? `<@${alvoId}> (level **${r.nivel}**) received **${r.concedidos.length}** role(s):\n${r.concedidos.map((id) => `<@&${id}>`).join(" ")}`
          : `<@${alvoId}> (level **${r.nivel}**) already had every role for their level.`,
        colour: r.concedidos.length ? COR.sucesso : COR.info,
      }));
    }

    // O servidor inteiro
    if (!db.listarCargosNivel(serverId).length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não há cargos de nível", description: `Crie-os primeiro com \`${PREFIXO}xp criarcargos\`.`, colour: COR.erro },
        { title: "❌ No level roles", description: `Create them first with \`${PREFIXO}xp criarcargos\`.`, colour: COR.erro }));
    }
    await sendEmbed(message.channel, tr(ctx,
      { title: "⏳ Conferindo todo mundo…", description: "Vou devolver os cargos que cada pessoa já conquistou. Pode levar um instante.", colour: COR.info },
      { title: "⏳ Checking everyone…", description: "I'll hand back the roles each person already earned. This may take a moment.", colour: COR.info }));

    let membros = [];
    try {
      const r = await server.fetchMembers();
      membros = r?.members ?? r ?? [];
    } catch (e) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não consegui listar os membros", description: `${e?.message ?? e}`, colour: COR.erro },
        { title: "❌ Couldn't list the members", description: `${e?.message ?? e}`, colour: COR.erro }));
    }

    const arrumados = [];
    let falhas = 0;
    for (const m of membros) {
      const uid = m?.id?.user ?? m?.user?.id;
      if (!uid) continue;
      const r = await sincronizarCargos(server, m, serverId);
      if (r?.erro) { falhas++; continue; }
      if (r?.concedidos?.length) arrumados.push({ uid, n: r.concedidos.length, nivel: r.nivel });
    }

    const lista = arrumados.slice(0, 20)
      .map((a) => `• <@${a.uid}> — nível ${a.nivel}, +${a.n} cargo(s)`).join("\n");
    return sendEmbed(message.channel, tr(ctx, {
      title: `🎖 ${arrumados.length} pessoa(s) atualizada(s)`,
      description: [
        `Conferi **${membros.length}** membro(s).`,
        arrumados.length ? "\n" + lista : "\n_Todo mundo já estava com os cargos certos._",
        arrumados.length > 20 ? `\n_… e mais ${arrumados.length - 20}._` : "",
        falhas ? `\n⚠️ **${falhas}** falha(s) — o cargo do bot precisa de **AssignRoles** e estar **acima** dos cargos de nível.` : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas ? COR.aviso : COR.sucesso,
    }, {
      title: `🎖 ${arrumados.length} person(s) updated`,
      description: [
        `I checked **${membros.length}** member(s).`,
        arrumados.length ? "\n" + lista : "\n_Everyone already had the right roles._",
        arrumados.length > 20 ? `\n_… and ${arrumados.length - 20} more._` : "",
        falhas ? `\n⚠️ **${falhas}** failure(s) — the bot's role needs **AssignRoles** and must sit **above** the level roles.` : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas ? COR.aviso : COR.sucesso,
    }));
  }

  if (sub === "setup" || sub === "config" || sub === "configurar") {
    return setupGame(message, args.slice(1), ctx);
  }

  // ── on / off ──
  if (sub === "on" || sub === "off") {
    if (!(await podeConfigurar(message, ctx))) return;
    config.xp.enabled = (sub === "on");
    ctx.salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🎮 Sistema de níveis",
        description: `Sistema **${sub === "on" ? "ativado 🟢" : "desativado 🔴"}**.`, colour: COR.mod },
      { title: "🎮 Leveling system",
        description: `System **${sub === "on" ? "enabled 🟢" : "disabled 🔴"}**.`, colour: COR.mod }));
  }

  // ── cargos (lista) ──
  if (sub === "cargos") {
    const cargos = db.listarCargosNivel(serverId);
    if (!cargos.length)
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎖 Cargos de nível",
          description: `Nenhum cargo configurado. Use \`${PREFIXO}xp criarcargos\` para criar automaticamente.`, colour: COR.mod },
        { title: "🎖 Level roles",
          description: `No roles configured. Use \`${PREFIXO}xp criarcargos\` to create them automatically.`, colour: COR.mod }));
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🎖 Level roles" : "🎖 Cargos de nível",
      description: cargos.map((c) => (lang === "en" ? `Level **${c.nivel}** → <@&${c.roleId}>` : `Nível **${c.nivel}** → <@&${c.roleId}>`)).join("\n"), colour: COR.mod });
  }

  // ── criarcargos ──
  if (sub === "criarcargos" || sub === "criar") {
    return criarCargos(message, ctx);
  }

  // ── reset ──
  if (sub === "reset" || sub === "zerar") {
    if (!(await podeConfigurar(message, ctx))) return;
    if (args[1] !== "confirmar")
      return sendEmbed(message.channel, tr(ctx,
        { title: "⚠️ Confirmar reset",
          description: `Isso apaga TODO o XP do servidor. Para confirmar: \`${PREFIXO}xp reset confirmar\``, colour: COR.aviso },
        { title: "⚠️ Confirm reset",
          description: `This erases ALL the server's XP. To confirm: \`${PREFIXO}xp reset confirmar\``, colour: COR.aviso }));
    const n = db.resetXp(serverId);
    return sendEmbed(message.channel, tr(ctx,
      { title: "🧹 XP zerado", description: `Removido o XP de ${n} usuário(s).`, colour: COR.sucesso },
      { title: "🧹 XP reset", description: `Removed the XP of ${n} user(s).`, colour: COR.sucesso }));
  }

  // ── rank [@usuário] ou perfil próprio (padrão) ──
  let alvoId = message.authorId;
  if (sub === "rank" && args[1]) {
    const bruto = limparId(args[1]);
    if (ULID.test(bruto)) alvoId = bruto;
  }

  const dados = db.getXp(serverId, alvoId);
  const pos = db.posicaoXp(serverId, alvoId);
  const p = progresso(dados.xp, dados.nivel, g.multiplicador);
  return sendEmbed(message.channel, {
    title: lang === "en" ? "📊 Level profile" : "📊 Perfil de nível",
    description: (lang === "en" ? [
      `<@${alvoId}>`,
      `**Level:** ${dados.nivel}${dados.nivel >= g.nivelMaximo ? " (max!)" : ""}`,
      `**XP:** ${dados.xp}`,
      pos ? `**Ranking:** #${pos}` : "",
      "",
      `${barra(p.pct)} ${p.pct}%`,
      `${p.atual} / ${p.necessario} XP to the next level`,
    ] : [
      `<@${alvoId}>`,
      `**Nível:** ${dados.nivel}${dados.nivel >= g.nivelMaximo ? " (máximo!)" : ""}`,
      `**XP:** ${dados.xp}`,
      pos ? `**Ranking:** #${pos}` : "",
      "",
      `${barra(p.pct)} ${p.pct}%`,
      `${p.atual} / ${p.necessario} XP para o próximo nível`,
    ]).filter(Boolean).join("\n"),
    colour: COR.info,
  });
}

// ── Verificação de permissão para configurar ───────────────
async function podeConfigurar(message, ctx) {
  const { getServer, membroTemPermissao, sendEmbed, COR } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    await sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para isso.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** for that.", colour: COR.erro }));
    return false;
  }
  return true;
}

// ──────────────────────────────────────────────────────────
//  Setup do XP
// ──────────────────────────────────────────────────────────
async function setupGame(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config } = ctx;
  if (!(await podeConfigurar(message, ctx))) return;

  const param = args[0]?.toLowerCase();
  const valor = args[1];

  if (!param) {
    const g = config.xp;
    const sl = lingua(ctx);
    return sendEmbed(message.channel, sl === "en" ? {
      title: "🎮 Leveling system configuration",
      description: [
        `**Enabled:** ${g.enabled ? "🟢 yes" : "🔴 no"}`,
        `**XP per message:** ${g.xpMin}–${g.xpMax}`,
        `**Cooldown:** ${Math.round(g.cooldownMs / 1000)}s`,
        `**Multiplier (difficulty):** ${g.multiplicador}`,
        `**Level cap:** ${g.nivelMaximo}`,
        `**Roles every:** ${g.intervaloCargos} levels`,
        `**Level-up announcement:** ${g.anunciarLevelUp ? "yes" : "no"}${g.canalAnuncio ? ` (channel set)` : ""}`,
        "",
        "**Adjust:**",
        `\`${PREFIXO}xp setup multiplicador <number>\` (e.g. 1.5)`,
        `\`${PREFIXO}xp setup nivelmaximo <number>\``,
        `\`${PREFIXO}xp setup intervalo <5|10>\``,
        `\`${PREFIXO}xp setup xp <min> <max>\``,
        `\`${PREFIXO}xp setup cooldown <seconds>\``,
        `\`${PREFIXO}xp setup canal <aqui|off>\``,
        `\`${PREFIXO}xp setup anuncio <on|off>\``,
        "",
        `Then: \`${PREFIXO}xp criarcargos\` and \`${PREFIXO}xp on\`.`,
      ].join("\n"),
      colour: COR.mod,
    } : {
      title: "🎮 Configuração do sistema de níveis",
      description: [
        `**Ativo:** ${g.enabled ? "🟢 sim" : "🔴 não"}`,
        `**XP por mensagem:** ${g.xpMin}–${g.xpMax}`,
        `**Cooldown:** ${Math.round(g.cooldownMs / 1000)}s`,
        `**Multiplicador (dificuldade):** ${g.multiplicador}`,
        `**Nível máximo:** ${g.nivelMaximo}`,
        `**Cargos a cada:** ${g.intervaloCargos} níveis`,
        `**Anúncio de level up:** ${g.anunciarLevelUp ? "sim" : "não"}${g.canalAnuncio ? ` (canal definido)` : ""}`,
        "",
        "**Ajustar:**",
        `\`${PREFIXO}xp setup multiplicador <número>\` (ex.: 1.5)`,
        `\`${PREFIXO}xp setup nivelmaximo <número>\``,
        `\`${PREFIXO}xp setup intervalo <5|10>\``,
        `\`${PREFIXO}xp setup xp <min> <max>\``,
        `\`${PREFIXO}xp setup cooldown <segundos>\``,
        `\`${PREFIXO}xp setup canal <aqui|off>\``,
        `\`${PREFIXO}xp setup anuncio <on|off>\``,
        "",
        `Depois: \`${PREFIXO}xp criarcargos\` e \`${PREFIXO}xp on\`.`,
      ].join("\n"),
      colour: COR.mod,
    });
  }

  const g = config.xp;
  const num = Number(valor);
  switch (param) {
    case "multiplicador": case "mult":
      if (!(num >= 1 && num <= 5)) return erro(ctx, message, tr(ctx, "Multiplicador deve ser entre 1 e 5 (ex.: 1.5).", "The multiplier must be between 1 and 5 (e.g. 1.5)."));
      g.multiplicador = num; break;
    case "nivelmaximo": case "nivelmax": case "max":
      if (!(num >= 5 && num <= 1000)) return erro(ctx, message, tr(ctx, "Nível máximo deve ser entre 5 e 1000.", "The level cap must be between 5 and 1000."));
      g.nivelMaximo = Math.floor(num); break;
    case "intervalo":
      if (num !== 5 && num !== 10) return erro(ctx, message, tr(ctx, "Intervalo deve ser 5 ou 10.", "The interval must be 5 or 10."));
      g.intervaloCargos = num; break;
    case "xp":
      { const mn = Number(args[1]), mx = Number(args[2]);
        if (!(mn > 0 && mx >= mn)) return erro(ctx, message, tr(ctx, "Uso: `xp setup xp <min> <max>` (max ≥ min).", "Usage: `xp setup xp <min> <max>` (max ≥ min)."));
        g.xpMin = Math.floor(mn); g.xpMax = Math.floor(mx); } break;
    case "cooldown":
      if (!(num >= 0)) return erro(ctx, message, tr(ctx, "Cooldown em segundos (número positivo).", "Cooldown in seconds (a positive number)."));
      g.cooldownMs = Math.floor(num * 1000); break;
    case "canal":
      if ((valor || "").toLowerCase() === "off") g.canalAnuncio = null;
      else g.canalAnuncio = message.channelId;
      break;
    case "anuncio": case "anúncio":
      g.anunciarLevelUp = (valor || "").toLowerCase() === "on"; break;
    default:
      return erro(ctx, message, tr(ctx, `Parâmetro desconhecido: \`${param}\`.`, `Unknown parameter: \`${param}\`.`));
  }
  ctx.salvarConfig();
  return sendEmbed(message.channel, tr(ctx,
    { title: "✅ Configuração salva", description: `\`${param}\` atualizado.`, colour: COR.sucesso },
    { title: "✅ Configuration saved", description: `\`${param}\` updated.`, colour: COR.sucesso }));
}

function erro(ctx, message, texto) {
  return ctx.sendEmbed(message.channel, {
    title: lingua(ctx) === "en" ? "❌ Invalid value" : "❌ Valor inválido",
    description: texto, colour: ctx.COR.erro });
}

// ──────────────────────────────────────────────────────────
//  Criar cargos automaticamente (a cada N níveis)
// ──────────────────────────────────────────────────────────
export async function criarCargos(message, ctx) {
  const { sendEmbed, COR, config, serverId } = ctx;
  if (!(await podeConfigurar(message, ctx))) return;

  const g = config.xp;
  const server = await ctx.getServer(message);
  const intervalo = g.intervaloCargos;
  const niveis = [];
  for (let n = intervalo; n <= g.nivelMaximo; n += intervalo) niveis.push(n);

  if (!niveis.length)
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Nada a criar", description: "Verifique o nível máximo e o intervalo.", colour: COR.erro },
      { title: "❌ Nothing to create", description: "Check the level cap and the interval.", colour: COR.erro }));

  await sendEmbed(message.channel, tr(ctx,
    { title: "⏳ Criando cargos…",
      description: `Vou criar ${niveis.length} cargo(s), um a cada ${intervalo} níveis. Isso pode levar um instante.`, colour: COR.info },
    { title: "⏳ Creating roles…",
      description: `I'll create ${niveis.length} role(s), one every ${intervalo} levels. This may take a moment.`, colour: COR.info }));

  const criados = [];
  for (const nivel of niveis) {
    // se já existe cargo para este nível, pula
    if (db.cargoDoNivel(serverId, nivel)) continue;
    try {
      const { id } = await server.createRole(lingua(ctx) === "en" ? `Level ${nivel}` : `Nível ${nivel}`);
      db.setCargoNivel(serverId, nivel, id);
      criados.push(id);
    } catch (e) { console.error("[GAME][criarCargo]", e.message); }
  }

  // ⚠️ Segurança: ordena TODOS os cargos de nível abaixo do mute
  const todosIds = db.listarCargosNivel(serverId).map((c) => c.roleId);
  const ord = await ordenarAbaixoDoMute(server, config, todosIds);

  const ccLang = lingua(ctx);
  const notaMute = ccLang === "en"
    ? (ord.semMute
      ? "\n\n⚠️ No mute role detected — once you create/set one, run `&xp criarcargos` again to reorder."
      : ord.ok
        ? "\n\n🔒 All the level roles were positioned **below** the mute role."
        : `\n\n⚠️ I couldn't reorder below the mute role (${ord.motivo}). Adjust it manually.`)
    : (ord.semMute
      ? "\n\n⚠️ Nenhum cargo de mute detectado — quando você criar/definir um, rode `&xp criarcargos` de novo para reordenar."
      : ord.ok
        ? "\n\n🔒 Todos os cargos de nível foram posicionados **abaixo** do cargo de mute."
        : `\n\n⚠️ Não consegui reordenar abaixo do mute (${ord.motivo}). Ajuste manualmente.`);

  return sendEmbed(message.channel, ccLang === "en" ? {
    title: "🎖 Level roles created",
    description: `${criados.length} new role(s) created, one every ${intervalo} levels (up to level ${g.nivelMaximo}).${notaMute}`,
    colour: COR.sucesso,
  } : {
    title: "🎖 Cargos de nível criados",
    description: `${criados.length} novo(s) cargo(s) criado(s), a cada ${intervalo} níveis (até o nível ${g.nivelMaximo}).${notaMute}`,
    colour: COR.sucesso,
  });
}

// Exportado para testes
export const _interno = { xpParaNivel, nivelPorXp, progresso, acharCargoMute };
