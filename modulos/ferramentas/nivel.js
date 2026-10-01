
import * as db from "../core/db.js";
import { limparId, ULID, resolverUsuario } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";
import * as log from "../core/log.js";
import { descreverErro, tipoDoErro } from "../core/erros.js";

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

// ── Hierarquia do Stoat (crates/delta/src/routes/servers/member_edit.rs) ──
// O bot só edita quem está ABAIXO do cargo mais alto dele, e só dá cargos que
// também estão abaixo dele; cargo apagado vira InvalidRole. A sincronização
// mandava todos os cargos que faltavam numa edição só: UM cargo acima do bot
// derrubava a edição inteira com NotElevated, e a pessoa ficava sem nenhum —
// para sempre, porque só se tentava de novo no próximo nível.
const rankDoCargo = (server, id) => {
  try { const r = server?.roles?.get?.(id) ?? server?.roles?.[id]; return Number.isFinite(r?.rank) ? r.rank : null; }
  catch { return null; }
};
const idsDeCargos = (m) => (m?.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
function rankDoMembro(server, member) {
  const ranks = idsDeCargos(member).map((id) => rankDoCargo(server, id)).filter((r) => r !== null);
  return ranks.length ? Math.min(...ranks) : Infinity;   // sem cargo = o mais baixo
}

// Divide os cargos que faltam entre os que o bot consegue dar e os que não.
// Sem saber quem é o bot (testes, cache vazio), não bloqueia nada: tenta.
export function planejarCargos({ server, botMember, member, faltando }) {
  if (!botMember) return { dar: [...faltando], acimaDoBot: [], membroAcima: false, botSemCargo: false };
  const topo = rankDoMembro(server, botMember);
  if (topo === Infinity) return { dar: [], acimaDoBot: [], membroAcima: false, botSemCargo: true };
  const membroAcima = rankDoMembro(server, member) <= topo;
  const acimaDoBot = faltando.filter((id) => { const r = rankDoCargo(server, id); return r !== null && r <= topo; });
  const dar = membroAcima ? [] : faltando.filter((id) => !acimaDoBot.includes(id));
  return { dar, acimaDoBot, membroAcima, botSemCargo: false };
}

function botDoServidor(server, botMember) {
  if (botMember) return botMember;
  try { return server?.member ?? null; } catch { return null; }   // stoat.js: o membro do próprio bot
}

// Falha de configuração (cargo acima do bot, falta de AssignRoles) se repete a
// cada mensagem; no log e no relatório ela entra UMA vez a cada 6 h por servidor.
const avisados = new Map();
const AVISO_MS = 6 * 3600e3;
function avisarUmaVez(chave, ...msg) {
  const t = avisados.get(chave) ?? 0;
  if (Date.now() - t < AVISO_MS) return;
  avisados.set(chave, Date.now());
  console.warn(...msg);
}
const nomeServ = (server) => `"${server?.name ?? server?.id ?? "?"}"`;

export async function sincronizarCargos(server, member, serverId, { nivel = null, botMember = null } = {}) {
  if (!server || !member || !serverId) return null;
  const userId = member?.id?.user ?? member?.user?.id ?? member?.id;
  if (!userId) return null;

  const nivelAtual = nivel ?? db.getXp(serverId, userId)?.nivel ?? 0;
  if (nivelAtual < 1) return null;

  const marcos = db.listarCargosNivel(serverId).filter((c) => c.nivel <= nivelAtual);
  if (!marcos.length) return null;

  const atuais = new Set(idsDeCargos(member));
  const existe = (id) => {
    try { return !!(server.roles?.get?.(id) ?? server.roles?.[id]); } catch { return true; }
  };
  const apagados = marcos.map((c) => c.roleId).filter((id) => id && !existe(id));
  if (apagados.length) avisarUmaVez(`apagado:${serverId}`, `[XP][sincronizar] servidor ${nomeServ(server)}: ${apagados.length} cargo(s) de nível foram apagados do servidor — recrie com &xp criarcargos`);
  const faltando = marcos.map((c) => c.roleId).filter((id) => id && !atuais.has(id) && existe(id));
  if (!faltando.length) return { concedidos: [], nivel: nivelAtual, bloqueados: null };

  const plano = planejarCargos({ server, botMember: botDoServidor(server, botMember), member, faltando });
  const bloqueados = (plano.membroAcima || plano.acimaDoBot.length || plano.botSemCargo)
    ? { membroAcima: plano.membroAcima, acimaDoBot: plano.acimaDoBot, botSemCargo: plano.botSemCargo } : null;
  if (plano.botSemCargo) avisarUmaVez(`semcargo:${serverId}`, `[XP][sincronizar] servidor ${nomeServ(server)}: o bot não tem nenhum cargo — o Stoat não deixa ele dar cargos a ninguém; dê um cargo ao bot acima dos cargos de nível`);
  if (plano.acimaDoBot.length) avisarUmaVez(`acima:${serverId}`, `[XP][sincronizar] servidor ${nomeServ(server)}: ${plano.acimaDoBot.length} cargo(s) de nível acima do cargo do bot — suba o cargo do bot (&xp cargos mostra quais)`);
  if (plano.membroAcima) console.log(`[XP] ${userId} em ${serverId} está acima do bot na hierarquia — cargos de nível não podem ser dados`);
  if (!plano.dar.length) return { concedidos: [], nivel: nivelAtual, bloqueados };

  const editar = (ids) => member.edit({ roles: [...new Set([...idsDeCargos(member), ...ids])] });
  try {
    await editar(plano.dar);
    console.log(`[XP] cargos sincronizados para ${userId} em ${serverId}: +${plano.dar.length} (nível ${nivelAtual})`);
    return { concedidos: plano.dar, nivel: nivelAtual, bloqueados };
  } catch (e) {
    const tipo = tipoDoErro(e);
    if (tipo === "MissingPermission") {
      avisarUmaVez(`perm:${serverId}`, `[XP][sincronizar] servidor ${nomeServ(server)}: falta a permissão AssignRoles ao bot — sem ela nenhum cargo de nível é dado`);
      return { concedidos: [], nivel: nivelAtual, bloqueados, erro: descreverErro(e) };
    }
    // Cache desatualizado (alguém mexeu na ordem agora): tenta um a um, para
    // que o cargo problemático não leve os outros junto.
    const dados = [];
    let ultimoErro = e;
    for (const id of plano.dar) {
      try { await editar([...dados, id]); dados.push(id); }
      catch (e2) { ultimoErro = e2; }
    }
    if (dados.length) {
      console.log(`[XP] cargos sincronizados (um a um) para ${userId} em ${serverId}: +${dados.length} de ${plano.dar.length}`);
      return { concedidos: dados, nivel: nivelAtual, bloqueados };
    }
    avisarUmaVez(`erro:${serverId}:${tipoDoErro(ultimoErro)}`, `[XP][sincronizar] servidor ${nomeServ(server)}: ${descreverErro(ultimoErro)}`);
    return { concedidos: [], nivel: nivelAtual, bloqueados, erro: descreverErro(ultimoErro) };
  }
}

// Quem já tinha o nível quando os cargos foram criados, ou falhou uma vez,
// nunca era tentado de novo (só no próximo nível ou ao reentrar). Agora, ao
// ganhar XP, confere de novo — no máximo a cada 6 h por pessoa.
const conferidos = new Map();
const RECONFERIR_MS = Number(process.env.XP_RECONFERIR_MS || 6 * 3600e3);
export function deveReconferir(serverId, userId, agora = Date.now()) {
  const k = `${serverId}:${userId}`;
  if (conferidos.has(k) && agora - conferidos.get(k) < RECONFERIR_MS) return false;
  conferidos.set(k, agora);
  if (conferidos.size > 20000) conferidos.clear();
  return true;
}

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

  // não subiu, mas pode estar devendo cargo (cargos criados depois, falha antiga)
  if (novoNivel <= atual.nivel && novoNivel >= 1 && deveReconferir(serverId, userId)) {
    try {
      if (db.listarCargosNivel(serverId).some((c) => c.nivel <= novoNivel)) {
        const server = await ctx.getServer(message);
        const member = message.member?.roles ? message.member : await server.fetchMember(userId).catch(() => null);
        if (member) {
          const r = await sincronizarCargos(server, member, serverId, { nivel: novoNivel });
          if (r?.concedidos?.length) {
            await log.registrar(ctx, "cargos", { titulo: "🎖 Cargos de nível acertados",
              descricao: `<@${userId}> (nível ${novoNivel}) recebeu **${r.concedidos.length}** cargo(s) de nível que estavam faltando.` });
          }
        }
      }
    } catch (e) { console.error("[XP][reconferir]", descreverErro(e)); }
  }

  // subiu de nível?
  if (novoNivel > atual.nivel) {
    let ganhouCargo = null;
    try {
      const server = await ctx.getServer(message);
      const member = await server.fetchMember(userId).catch(() => null);
      if (member) {
        const r = await sincronizarCargos(server, member, serverId, { nivel: novoNivel });
        // (o sincronizar já cobre o cargo deste nível; o caminho antigo
        // tentava de novo e repetia o mesmo NotElevated no log)
        ganhouCargo = r?.concedidos?.length ? r.concedidos[r.concedidos.length - 1] : null;
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

export function explicarBloqueio(r, lang = "pt") {
  const b = r?.bloqueados;
  if (!b) return "";
  const en = lang === "en";
  const L = [];
  if (b.botSemCargo) L.push(en ? "⚠️ The bot has **no role** — the Stoat doesn't let it give roles to anyone. Give it a role above the level roles."
    : "⚠️ O bot **não tem nenhum cargo** — o Stoat não deixa ele dar cargos a ninguém. Dê a ele um cargo acima dos cargos de nível.");
  if (b.acimaDoBot?.length) L.push(en
    ? `⚠️ ${b.acimaDoBot.map((id) => `<@&${id}>`).join(" ")} ${b.acimaDoBot.length > 1 ? "are" : "is"} **above the bot's role** — move the bot's role up.`
    : `⚠️ ${b.acimaDoBot.map((id) => `<@&${id}>`).join(" ")} ${b.acimaDoBot.length > 1 ? "estão" : "está"} **acima do cargo do bot** — suba o cargo do bot.`);
  if (b.membroAcima) L.push(en
    ? `ℹ️ ${r.membrosAcima ? `**${r.membrosAcima}** person(s) have` : "This person has"} a role at or above the bot's (usually staff) — the Stoat doesn't let the bot edit them.`
    : `ℹ️ ${r.membrosAcima ? `**${r.membrosAcima}** pessoa(s) têm` : "Essa pessoa tem"} um cargo na altura do bot ou acima (normalmente staff) — o Stoat não deixa o bot editá-la(s).`);
  return L.join("\n");
}

export async function cmdXp(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config, serverId, getServer, membroTemPermissao } = ctx;
  const g = config.xp;
  const lang = lingua(ctx);
  const sub = args[0]?.toLowerCase();

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

      const pend = explicarBloqueio(r, lang);
      return sendEmbed(message.channel, tr(ctx, {
        title: r.concedidos.length ? "🎖 Cargos devolvidos" : (pend || r.erro ? "⚠️ Não consegui dar os cargos" : "✅ Já estava em dia"),
        description: (r.concedidos.length
          ? `<@${alvoId}> (nível **${r.nivel}**) recebeu **${r.concedidos.length}** cargo(s):\n${r.concedidos.map((id) => `<@&${id}>`).join(" ")}`
          : (pend || r.erro ? `<@${alvoId}> (nível **${r.nivel}**) está sem cargo(s) do nível dela.` : `<@${alvoId}> (nível **${r.nivel}**) já tinha todos os cargos do nível dela.`))
          + (pend ? `\n\n${pend}` : "") + (r.erro ? `\n\n**Erro:** ${r.erro}` : ""),
        colour: r.concedidos.length ? COR.sucesso : (pend || r.erro ? COR.aviso : COR.info),
      }, {
        title: r.concedidos.length ? "🎖 Roles restored" : (pend || r.erro ? "⚠️ Couldn't give the roles" : "✅ Already up to date"),
        description: (r.concedidos.length
          ? `<@${alvoId}> (level **${r.nivel}**) received **${r.concedidos.length}** role(s):\n${r.concedidos.map((id) => `<@&${id}>`).join(" ")}`
          : (pend || r.erro ? `<@${alvoId}> (level **${r.nivel}**) is missing level role(s).` : `<@${alvoId}> (level **${r.nivel}**) already had every role for their level.`))
          + (pend ? `\n\n${pend}` : "") + (r.erro ? `\n\n**Error:** ${r.erro}` : ""),
        colour: r.concedidos.length ? COR.sucesso : (pend || r.erro ? COR.aviso : COR.info),
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
    let falhas = 0, acimaDoBot = new Set(), membrosAcima = 0, botSemCargo = false;
    const erros = new Set();
    for (const m of membros) {
      const uid = m?.id?.user ?? m?.user?.id;
      if (!uid) continue;
      const r = await sincronizarCargos(server, m, serverId);
      if (r?.bloqueados) {
        r.bloqueados.acimaDoBot.forEach((id) => acimaDoBot.add(id));
        if (r.bloqueados.membroAcima) membrosAcima++;
        if (r.bloqueados.botSemCargo) botSemCargo = true;
      }
      if (r?.erro) { falhas++; erros.add(r.erro); }
      if (r?.concedidos?.length) arrumados.push({ uid, n: r.concedidos.length, nivel: r.nivel });
    }
    const pendencias = explicarBloqueio({ bloqueados: { acimaDoBot: [...acimaDoBot], membroAcima: membrosAcima > 0, botSemCargo }, membrosAcima }, lang);

    const lista = arrumados.slice(0, 20)
      .map((a) => `• <@${a.uid}> — nível ${a.nivel}, +${a.n} cargo(s)`).join("\n");
    return sendEmbed(message.channel, tr(ctx, {
      title: `🎖 ${arrumados.length} pessoa(s) atualizada(s)`,
      description: [
        `Conferi **${membros.length}** membro(s).`,
        arrumados.length ? "\n" + lista : "\n_Todo mundo já estava com os cargos certos._",
        arrumados.length > 20 ? `\n_… e mais ${arrumados.length - 20}._` : "",
        pendencias ? `\n${pendencias}` : "",
        falhas ? `\n⚠️ **${falhas}** falha(s): ${[...erros].slice(0, 2).join(" · ")}` : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas || pendencias ? COR.aviso : COR.sucesso,
    }, {
      title: `🎖 ${arrumados.length} person(s) updated`,
      description: [
        `I checked **${membros.length}** member(s).`,
        arrumados.length ? "\n" + lista : "\n_Everyone already had the right roles._",
        arrumados.length > 20 ? `\n_… and ${arrumados.length - 20} more._` : "",
        pendencias ? `\n${pendencias}` : "",
        falhas ? `\n⚠️ **${falhas}** failure(s): ${[...erros].slice(0, 2).join(" · ")}` : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas || pendencias ? COR.aviso : COR.sucesso,
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
    const srv = await getServer(message).catch(() => null);
    const bot = botDoServidor(srv, null);
    const topo = bot ? rankDoMembro(srv, bot) : null;
    const marca = (id) => {
      if (!srv) return "";
      const existe = !!(srv.roles?.get?.(id) ?? srv.roles?.[id]);
      if (!existe) return lang === "en" ? " ⚠️ _deleted from the server_" : " ⚠️ _apagado do servidor_";
      const r = rankDoCargo(srv, id);
      if (topo !== null && r !== null && r <= topo) return lang === "en" ? " ⚠️ _above the bot — it can't give this one_" : " ⚠️ _acima do bot — ele não consegue dar_";
      return "";
    };
    const linhas = cargos.map((c) => (lang === "en" ? `Level **${c.nivel}** → <@&${c.roleId}>` : `Nível **${c.nivel}** → <@&${c.roleId}>`) + marca(c.roleId));
    const algum = linhas.some((l) => l.includes("⚠️"));
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🎖 Level roles" : "🎖 Cargos de nível",
      description: linhas.join("\n") + (algum ? (lang === "en"
        ? "\n\n_Move the bot's role above the marked roles (or recreate the deleted ones with `&xp criarcargos`), then run `&xp sincronizar todos`._"
        : "\n\n_Suba o cargo do bot acima dos marcados (ou recrie os apagados com `&xp criarcargos`) e rode `&xp sincronizar todos`._") : ""),
      colour: algum ? COR.aviso : COR.mod });
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

  // Cargo novo nasce no fim da lista — abaixo do bot e de todo cargo de membro.
  // O silêncio é o timeout nativo, então não há cargo de mute para ordenar.
  const ccLang = lingua(ctx);
  const notaMute = ccLang === "en"
    ? `\n\n_New roles are born at the bottom of the list, below the bot. Already-reached levels are handed out as people talk, or now with \`${ctx.PREFIXO ?? "&"}xp sincronizar todos\`._`
    : `\n\n_Cargos novos nascem no fim da lista, abaixo do bot. Os níveis já alcançados são entregues conforme as pessoas conversam, ou agora com \`${ctx.PREFIXO ?? "&"}xp sincronizar todos\`._`;

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
export const _interno = { xpParaNivel, nivelPorXp, progresso };
