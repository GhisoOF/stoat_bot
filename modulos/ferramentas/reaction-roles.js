
import * as db  from "../core/db.js";
import * as log from "../core/log.js";
import { resolverMensagem, resolverCargo } from "../core/ids.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";
import { erroDeUso, semPermissao } from "../moderacao/punir.js";
import { editarCargos, cargoDe, podeUsarCargo } from "../core/hierarquia.js";
import { canalDeOutroServidor } from "../moderacao/pertence.js";

// o cargo no log: menção + nome (o log mostrava só o ID — 14 out 2026)
const cargoNoLog = (server, id) => { const n = cargoDe(server, id)?.name; return n ? `<%${id}> **${n}**` : `<%${id}>`; };
import { tr } from "../core/i18n.js";
import { normalizarErro, descreverErro, registrarErro, tipoDoErro } from "../core/erros.js";
import { numero } from "../core/env.js";

// Reexporta o resolvedor central, para quem já importava daqui.

// Normaliza emoji recebido (pode vir URL-encoded / com seletor de variação)
export function normalizarEmoji(e) {
  if (!e) return "";
  let v = e;
  try { v = decodeURIComponent(e); } catch {}
  return v.replace(/\uFE0F/g, "");   // remove o "variation selector"
}

async function tirarReacaoDe(message, emoji, userId, client) {
  const canalId = message?.channelId ?? message?.channel?.id ?? message?.channel?._id;
  const msgId = message?.id ?? message?._id;
  if (!canalId || !msgId) return false;
  try {
    await client.api.delete(
      `/channels/${canalId}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`,
      { user_id: userId },
    );
    return true;
  } catch (e) {
    registrarErro("REACTIONROLE", e);
    return false;
  }
}

const PAUSA_MS = numero("RR_PAUSA_MS", 750, { min: 0, inteiro: true });   // 15 por 10s = 1 a cada 667ms
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Devolve `true`, ou o motivo da falha em texto.
async function reagirComPaciencia(message, emoji, { tentativas = 3 } = {}) {
  for (let i = 0; i < tentativas; i++) {
    try {
      await message.react(encodeURIComponent(emoji));
      return true;
    } catch (e) {
      // A SDK lança o CORPO CRU da resposta (uma string JSON), não um Error nem
      // um objeto: sem normalizar, `e.retry_after` é sempre undefined e a espera
      // do 429 nunca acontecia. normalizarErro entende string, objeto e Error.
      const err = normalizarErro(e);
      const espera = Number(err?.retry_after ?? err?.data?.retry_after ?? 0);
      if (espera > 0 && i < tentativas - 1) {
        await dormir(espera + 250);       // margem: o relógio deles não é o nosso
        continue;
      }
      if (espera > 0) return `limite de requisições (retry_after ${espera}ms)`;
      if (tipoDoErro(e) === "InvalidOperation") {
        return "o Stoat recusou: ou a mensagem chegou ao teto de reações, ou é um emoji personalizado que eu não posso usar";
      }
      return descreverErro(e);
    }
  }
  return "não consegui depois de várias tentativas";
}

// Quem reagiu com este emoji, segundo o cache da mensagem.
function quemReagiu(message, emoji) {
  const mapa = message?.reactions;
  if (!mapa) return null;                       // sem informação
  const chave = [...(mapa.keys?.() ?? [])].find((k) => normalizarEmoji(k) === normalizarEmoji(emoji));
  if (chave === undefined) return new Set();    // ninguém
  const v = mapa.get?.(chave);
  return new Set(v ? [...v] : []);
}

export async function reporReacoesQueFaltam(message, client, { forcar = false } = {}) {
  const messageId = message?.id ?? message?._id;
  if (!messageId) return { repostos: [], falhas: [], conferidos: 0 };
  const meuId = client?.user?.id;
  const regras = db.listReactionRoles(messageId);
  const repostos = [];
  const falhas = [];
  for (const r of regras) {
    const reagiram = quemReagiu(message, r.emoji);
    const falta = reagiram === null ? forcar : (reagiram.size === 0 || (forcar && !reagiram.has(meuId)));
    if (!falta) continue;
    if (repostos.length) await dormir(PAUSA_MS);
    const r2 = await reagirComPaciencia(message, r.emoji);
    if (r2 === true) repostos.push(r.emoji);
    else {
      falhas.push({ emoji: r.emoji, motivo: r2 });
      console.error(`[REACTIONROLE] não consegui repor ${r.emoji} em ${messageId}: ${r2}`);
    }
  }
  if (repostos.length) console.log(`[REACTIONROLE] repus ${repostos.length} reação(ões) em ${messageId}: ${repostos.join(" ")}`);
  return { repostos, falhas, conferidos: regras.length };
}

export async function aoReagir(message, userId, emoji, ctx) {
  try {
    const messageId = message?.id ?? message?._id;
    if (!messageId || !userId) return false;
    if (userId === ctx.client.user?.id) return false;   // ignora o próprio bot
    // (P2) ↩️ na mensagem de um ban/silêncio desfaz a punição (punir.js). Mora aqui
    // porque este é o último handler de reação do main.js; ver notas/moderacao.md.
    if (await (await import("../moderacao/punir.js")).aoReagirDesfazer(message, userId, emoji, ctx)) return true;

    const alvo = db.getReactionRole(messageId, normalizarEmoji(emoji));
    if (!alvo) return false;

    const serverId = alvo.serverId;
    const server = await ctx.client.servers.fetch(serverId).catch((e) => {
      registrarErro("REACTIONROLE", e); return null;
    });
    if (!server) return false;
    const member = await server.fetchMember(userId).catch((e) => {
      registrarErro("REACTIONROLE", e); return null;
    });
    if (!member) { console.log(`[REACTIONROLE] membro ${userId} não encontrado no servidor`); return false; }

    const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    if (atuais.includes(alvo.roleId)) return false;  // já tem o cargo

    let removidos = [];
    let novos = atuais;
    // exclusivo: vale a mensagem e as outras do mesmo grupo (o painel de cores em duas mensagens)
    const doGrupo = db.isReactionRoleExclusivo(messageId) ? db.regrasDoGrupo(messageId) : [];
    if (doGrupo.length) {
      const daMensagem = doGrupo.map((r) => r.roleId).filter((id) => id !== alvo.roleId);
      removidos = atuais.filter((id) => daMensagem.includes(id));
      novos = atuais.filter((id) => !daMensagem.includes(id));
    }
    novos = [...novos, alvo.roleId];
    try {
      await editarCargos(server, member, (a) => novos.filter((id) => a.includes(id) || id === alvo.roleId));
    } catch (e) {
      registrarErro("REACTIONROLE", e);
      console.error("[REACTIONROLE]    → confira: o bot tem **AssignRoles**? o cargo dele está ACIMA de <@&" + alvo.roleId + "> na lista de cargos?");
      return false;
    }

    if (removidos.length) {
      try {
        const paraTirar = doGrupo.filter((r) => removidos.includes(r.roleId));
        for (const r of paraTirar) {
          // a reação antiga pode estar em outra mensagem do grupo
          const daqui = r.messageId === messageId ? (message?.channelId ?? message?.channel?.id ?? message?.channel?._id) : null;
          const onde = { id: r.messageId, channelId: daqui ?? r.channelId };
          await tirarReacaoDe(onde, r.emoji, userId, ctx.client);
        }
      } catch (e) { console.log("[REACTIONROLE] não consegui limpar as reações antigas:", e?.message); }
    }

    console.log(`[REACTIONROLE] +cargo ${alvo.roleId} para ${userId} (msg ${messageId})${removidos.length ? ` | trocou ${removidos.length} cargo(s)` : ""}`);
    const rctx = { ...ctx, serverId, config: ctx.configDoServidor?.(serverId) ?? ctx.config };
    await log.registrar(rctx, "cargos", {
      titulo: "🎭 Cargo por reação",
      descricao: `<@${userId}> recebeu o cargo ${cargoNoLog(server, alvo.roleId)} ao reagir.`
        + (removidos.length ? `\n_Modo exclusivo: perdeu ${removidos.map((r) => cargoNoLog(server, r)).join(", ")}._` : ""),
      en: { titulo: "🎭 Reaction role",
        descricao: `<@${userId}> got the role ${cargoNoLog(server, alvo.roleId)} by reacting.`
          + (removidos.length ? `\n_Exclusive mode: lost ${removidos.map((r) => cargoNoLog(server, r)).join(", ")}._` : "") },
      es: { titulo: "🎭 Rol por reacción",
        descricao: `<@${userId}> recibió el rol ${cargoNoLog(server, alvo.roleId)} al reaccionar.`
          + (removidos.length ? `\n_Modo exclusivo: perdió ${removidos.map((r) => cargoNoLog(server, r)).join(", ")}._` : "") },
    });
    return true;
  } catch (err) {
    registrarErro("REACTIONROLE", err);
    if (err?.stack) console.error(err.stack.split("\n").slice(0, 3).join("\n"));
    return false;
  }
}

// Chamado quando alguém TIRA a reação: remove o cargo correspondente.
export async function aoDesreagir(message, userId, emoji, ctx) {
  try {
    const messageId = message?.id ?? message?._id;
    if (!messageId || !userId) return false;
    if (userId === ctx.client?.user?.id) return false;

    const alvo = db.getReactionRole(messageId, normalizarEmoji(emoji));
    if (!alvo) return false;

    const server = await ctx.client.servers.fetch(alvo.serverId).catch(() => null);
    if (!server) return false;
    const member = await server.fetchMember(userId).catch(() => null);
    if (!member) return false;

    const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    if (!atuais.includes(alvo.roleId)) return false;   // já não tem
    try {
      await editarCargos(server, member, (a) => a.filter((id) => id !== alvo.roleId));
    } catch (e) {
      registrarErro("REACTIONROLE", e);
      return false;
    }
    console.log(`[REACTIONROLE] -cargo ${alvo.roleId} de ${userId} (msg ${messageId})`);
    await reporReacoesQueFaltam(message, ctx.client).catch(() => {});
    const rctx = { ...ctx, serverId: alvo.serverId, config: ctx.configDoServidor?.(alvo.serverId) ?? ctx.config };
    await log.registrar(rctx, "cargos", {
      titulo: "🎭 Cargo por reação",
      descricao: `<@${userId}> perdeu o cargo ${cargoNoLog(server, alvo.roleId)} ao tirar a reação.`,
      en: { titulo: "🎭 Reaction role", descricao: `<@${userId}> lost the role ${cargoNoLog(server, alvo.roleId)} by removing the reaction.` },
      es: { titulo: "🎭 Rol por reacción", descricao: `<@${userId}> perdió el rol ${cargoNoLog(server, alvo.roleId)} al quitar la reacción.` },
    });
    return true;
  } catch (err) {
    registrarErro("REACTIONROLE", err);
    return false;
  }
}

// No boot: carrega cada mensagem com cargo por reação e repõe o que faltar.
// (31 out 2026, R11) O registro cuja mensagem SUMIU (a API responde NotFound
// para a mensagem ou para o canal) é apagado — antes ficava para sempre e, sem
// canal gravado, o boot varria todos os canais do servidor atrás dela, toda vez.
// Erro que não é "não existe" (rede, permissão) não apaga nada.
const sumiu = (e) => tipoDoErro(e) === "NotFound" || e?.status === 404 || e?.response?.status === 404;
async function buscar(fn) {
  try { return { obj: await fn() ?? null }; } catch (e) { return { obj: null, sumiu: sumiu(e), erro: e }; }
}
// `serverId`: só as deste servidor (o `recarregar` de um servidor não mexe nem conta os outros)
export async function precarregarMensagens(client, { serverId = null } = {}) {
  let ok = 0, perdidas = 0, repostos = 0, apagadas = 0;
  const falhas = [];
  const registros = db.mensagensComReactionRole().filter((r) => !serverId || r.serverId === serverId);
  if (!registros.length) return { ok, perdidas, repostos, falhas, apagadas, total: 0 };

  for (const reg of registros) {
    let msg = null, naoExiste = false;
    try {
      if (reg.channelId) {
        const c = client.channels.get(reg.channelId) ? { obj: client.channels.get(reg.channelId) } : await buscar(() => client.channels.fetch(reg.channelId));
        if (c.obj) {
          const m = await buscar(() => c.obj.fetchMessage(reg.messageId));
          msg = m.obj; naoExiste = !msg && m.sumiu;
        } else naoExiste = c.sumiu;
      } else if (reg.serverId) {
        // registro antigo, sem canal gravado: procura UMA vez; achou, grava o canal;
        // todos os canais disseram "não existe", o registro sai (não varre de novo)
        const server = await client.servers.fetch(reg.serverId).catch(() => null);
        // (31 out 2026) só apaga com certeza: lista de canais vazia, canal que não
        // carregou ou erro de rede/permissão mantêm o registro
        const lista = server?.channels ?? [];
        let todosNaoTem = !!server && lista.length > 0;
        for (const ch of lista) {
          let canal = ch;
          if (typeof ch === "string") {
            canal = client.channels.get(ch) ?? null;
            if (!canal) { const c = await buscar(() => client.channels.fetch(ch)); canal = c.obj; if (!canal && !c.sumiu) todosNaoTem = false; }
          }
          if (!canal?.fetchMessage) continue;
          const m = await buscar(() => canal.fetchMessage(reg.messageId));
          if (m.obj) { msg = m.obj; db.setReactionRoleCanal(reg.messageId, canal.id ?? canal._id); break; }
          if (!m.sumiu) todosNaoTem = false;
        }
        naoExiste = !msg && todosNaoTem;
      }
    } catch (e) {
      registrarErro("REACTIONROLE", e);
    }
    if (msg) {
      ok++;
      const r = await reporReacoesQueFaltam(msg, client).catch((e) => { registrarErro("REACTIONROLE", e); return { repostos: [], falhas: [] }; });
      repostos += r.repostos.length;
      falhas.push(...(r.falhas ?? []));
    } else if (naoExiste) {
      apagadas += db.removeReactionRolesMensagem(reg.messageId) ? 1 : 0;
    } else { perdidas++; console.log(`[REACTIONROLE][boot] não achei a mensagem ${reg.messageId} (sem acesso agora?) — o registro fica`); }
  }
  console.log(`[REACTIONROLE] ${ok} mensagem(ns) recarregada(s)${perdidas ? `, ${perdidas} não encontrada(s)` : ""}${apagadas ? `, ${apagadas} registro(s) de mensagem apagada removido(s)` : ""}${repostos ? `, ${repostos} reação(ões) reposta(s)` : ""}`);
  return { ok, perdidas, repostos, falhas, apagadas, total: registros.length };
}

// &reactionrole (&rr) — P2: `add`, `remove`, `list`, `exclusivo`. O conserto
// (recarregar) é automático no boot; `recarregar`/`ordem` ficam como apelidos
// silenciosos que só repõem o que faltar. Saída mínima (R1/R2).
export async function cmdReactionRole(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, serverId, client } = ctx;
  const canal = message.channel;
  const linha = (cor, pt, en, es) => sendEmbed(canal, { description: tr(ctx, pt, en, es), colour: cor });
  const erroUso = (pt, en, es) => erroDeUso(ctx, canal, "reactionrole", pt, en, es);

  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "ManageRole")) return semPermissao(ctx, canal, "ManageRole");
  const sub = args[0]?.toLowerCase();

  // A mensagem é DESTE servidor? (15 out 2026: as regras eram achadas só pelo ID)
  if (["exclusivo", "remove", "add"].includes(sub)) {
    const midAlvo = resolverMensagem(args[1] ?? "").id;
    const dono = midAlvo ? db.servidorDoReactionRole(midAlvo) : null;
    if (dono && dono !== serverId) return linha(COR.erro, "🚫 Essa mensagem é de outro servidor.", "🚫 That message belongs to another server.", "🚫 Ese mensaje es de otro servidor.");
  }

  // ── list (e o `&rr` sozinho: o estado) ──
  if (!sub || sub === "list") {
    const regras = db.listReactionRolesServidor(serverId);
    if (!regras.length) return linha(COR.info, "🎭 Nenhum cargo por reação aqui.", "🎭 No reaction roles here.", "🎭 Ningún rol por reacción aquí.");
    const porMsg = new Map();
    for (const r of regras) { if (!porMsg.has(r.messageId)) porMsg.set(r.messageId, []); porMsg.get(r.messageId).push(`${r.emoji} <%${r.roleId}>`); }
    const linhas = [...porMsg].map(([mid, itens]) => `\`${mid}\`${db.isReactionRoleExclusivo(mid) ? " 🎯" : ""}\n${itens.join(" · ")}`);
    return enviarPaginado(ctx, canal, { paginas: paginarLinhas(linhas, { titulo: tr(ctx, "🎭 Cargos por reação", "🎭 Reaction roles", "🎭 Roles por reacción") }), autorId: message.authorId, colour: COR.mod });
  }

  // ── recarregar / ordem (apelidos silenciosos do conserto automático) ──
  if (sub === "recarregar" || sub === "ordem") {
    const r = await precarregarMensagens(client, { serverId });
    return linha(r.perdidas ? COR.aviso : COR.sucesso,
      `🔄 ${r.ok}/${r.total} mensagem(ns)${r.repostos ? ` · ${r.repostos} reação(ões) reposta(s)` : ""}${r.perdidas ? ` · ${r.perdidas} não encontrada(s)` : ""}.`,
      `🔄 ${r.ok}/${r.total} message(s)${r.repostos ? ` · ${r.repostos} reaction(s) restored` : ""}${r.perdidas ? ` · ${r.perdidas} not found` : ""}.`,
      `🔄 ${r.ok}/${r.total} mensaje(s)${r.repostos ? ` · ${r.repostos} reacción(es) repuesta(s)` : ""}${r.perdidas ? ` · ${r.perdidas} no encontrado(s)` : ""}.`);
  }

  // ── exclusivo <mensagem> [on|off] ──
  if (sub === "exclusivo") {
    const mid = resolverMensagem(args[1] ?? "").id;
    if (!mid) return erroUso("Qual mensagem? (ID ou link)", "Which message? (ID or link)", "¿Qué mensaje? (ID o enlace)");
    if (!db.listReactionRoles(mid).length) return linha(COR.erro, `❌ \`${mid}\` não tem cargos por reação.`, `❌ \`${mid}\` has no reaction roles.`, `❌ \`${mid}\` no tiene roles por reacción.`);
    const ligar = !["off", "nao", "não", "0"].includes(String(args[2] ?? "on").toLowerCase());
    db.setReactionRoleExclusivo(mid, ligar);
    return ligar
      ? linha(COR.sucesso, `🎯 \`${mid}\`: um cargo por vez.`, `🎯 \`${mid}\`: one role at a time.`, `🎯 \`${mid}\`: un rol a la vez.`)
      : linha(COR.sucesso, `➕ \`${mid}\`: os cargos acumulam.`, `➕ \`${mid}\`: roles stack.`, `➕ \`${mid}\`: los roles se acumulan.`);
  }

  // ── remove <mensagem> [emoji] ──
  if (sub === "remove") {
    const mid = resolverMensagem(args[1] ?? "").id;
    if (!mid) return erroUso("Qual mensagem? (ID ou link)", "Which message? (ID or link)", "¿Qué mensaje? (ID o enlace)");
    const emoji = args[2] ? normalizarEmoji(args[2]) : null;
    const n = emoji ? db.removerReactionRoleEmoji(mid, emoji) : db.removeReactionRolesMensagem(mid);
    if (!n) return linha(COR.aviso, "🤷 Nada ligado aí.", "🤷 Nothing wired there.", "🤷 No hay nada vinculado ahí.");
    await log.registrar(ctx, "cargos", { titulo: "🎭 Cargo por reação removido", descricao: `<@${message.authorId}>: \`${mid}\`${emoji ? ` ${emoji}` : ""}`,
      en: { titulo: "🎭 Reaction role removed", descricao: `<@${message.authorId}>: \`${mid}\`${emoji ? ` ${emoji}` : ""}` },
      es: { titulo: "🎭 Rol por reacción quitado", descricao: `<@${message.authorId}>: \`${mid}\`${emoji ? ` ${emoji}` : ""}` } });
    return linha(COR.sucesso, `🎭 ${n} ligação(ões) removida(s).`, `🎭 ${n} link(s) removed.`, `🎭 ${n} vínculo(s) quitado(s).`);
  }

  // ── add <mensagem> <emoji> <cargo> ──
  if (sub === "add") {
    const ref = resolverMensagem(args[1] ?? "");
    const mid = ref.id;
    const emoji = normalizarEmoji(args[2]);
    const cargo = args.length > 3 ? resolverCargo(args.slice(3).join(" "), server) : null;
    if (!mid) return erroUso(ref.canalId ? "O link é do canal, não da mensagem" : "Qual mensagem? (ID ou link)", ref.canalId ? "That link is the channel's, not the message's" : "Which message? (ID or link)", ref.canalId ? "Ese enlace es del canal, no del mensaje" : "¿Qué mensaje? (ID o enlace)");
    if (!emoji) return erroUso("Qual emoji?", "Which emoji?", "¿Qué emoji?");
    if (!cargo?.id) return erroUso("Qual cargo?", "Which role?", "¿Qué rol?");
    const role = cargo.id;
    try {
      let msg = null;
      if (ref.canalId) {
        const c = client.channels.get(ref.canalId) ?? await client.channels.fetch(ref.canalId).catch(() => null);
        if (c) msg = await c.fetchMessage(mid).catch(() => null);
      }
      msg ??= await canal.fetchMessage?.(mid)?.catch?.(() => null) ?? await buscarEmCanais(server, client, mid);
      const canalAchado = msg ? (msg.channel ?? client.channels.get(msg.channelId) ?? null) : null;
      if (msg && canalDeOutroServidor(canalAchado, serverId)) msg = null;   // mensagem de outro servidor: como se não existisse
      if (!msg) return linha(COR.erro, `❌ Não achei a mensagem \`${mid}\` aqui.`, `❌ Couldn't find message \`${mid}\` here.`, `❌ No encontré el mensaje \`${mid}\` aquí.`);
      // quem pede precisa estar ACIMA do cargo
      const pode = await podeUsarCargo(server, message, role, ctx);
      if (!pode.ok) return linha(COR.erro, `🚫 Acima de você: ${pode.pt}.`, `🚫 Above you: ${pode.en}.`, `🚫 Por encima de ti: ${pode.es ?? pode.en}.`);
      // grava o canal junto: é o que permite recarregar a mensagem no boot
      db.addReactionRole(serverId, mid, emoji, role, ref.canalId ?? msg?.channelId ?? msg?.channel?.id ?? null);
      const reagiu = await reagirComPaciencia(msg, emoji);
      await log.registrar(ctx, "cargos", { titulo: "🎭 Cargo por reação configurado",
        descricao: `<@${message.authorId}> vinculou ${emoji} → <%${role}> na mensagem \`${mid}\`.`,
        en: { titulo: "🎭 Reaction role set up", descricao: `<@${message.authorId}> linked ${emoji} → <%${role}> on message \`${mid}\`.` },
        es: { titulo: "🎭 Rol por reacción configurado", descricao: `<@${message.authorId}> vinculó ${emoji} → <%${role}> en el mensaje \`${mid}\`.` } });
      const aviso = reagiu === true ? "" : `\n⚠️ ${reagiu}`;
      return linha(reagiu === true ? COR.sucesso : COR.aviso, `🎭 ${emoji} → <%${role}>${aviso}`, `🎭 ${emoji} → <%${role}>${aviso}`, `🎭 ${emoji} → <%${role}>${aviso}`);
    } catch (err) {
      registrarErro("REACTIONROLE", err);
      return linha(COR.erro, `❌ ${descreverErro(err, "pt")}`, `❌ ${descreverErro(err, "en")}`, `❌ ${descreverErro(err, "es")}`);
    }
  }

  return erroUso(`\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` não existe`, `\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` doesn't exist`, `\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` no existe`);
}

// Tenta achar a mensagem varrendo os canais de texto (fallback quando não está
// no canal do comando).
async function buscarEmCanais(server, client, mid) {
  const canais = (server.channels ?? []).filter((c) => c?.type === "TextChannel");
  for (const canal of canais) {
    const m = await canal.fetchMessage(mid).catch(() => null);
    if (m) return m;
  }
  return null;
}
