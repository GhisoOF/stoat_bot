
import * as db  from "../core/db.js";
import { citar, citarInterno } from "../core/aliases.js";
import * as log from "../core/log.js";
import { idValido, descreverProblemaDeId, resolverMensagem } from "../core/ids.js";
import { editarCargos, cargoDe, podeUsarCargo } from "../core/hierarquia.js";
import { canalDeOutroServidor } from "../moderacao/pertence.js";

// o cargo no log: menção + nome (o log mostrava só o ID — 14 out 2026)
const cargoNoLog = (server, id) => { const n = cargoDe(server, id)?.name; return n ? `<%${id}> **${n}**` : `<%${id}>`; };
import { tr, lingua } from "../core/i18n.js";
import { normalizarErro } from "../core/erros.js";
import { chamarApi } from "../core/stoat-api.js";

// Reexporta o resolvedor central, para quem já importava daqui.

// Normaliza emoji recebido (pode vir URL-encoded / com seletor de variação)
export function normalizarEmoji(e) {
  if (!e) return "";
  let v = e;
  try { v = decodeURIComponent(e); } catch {}
  return v.replace(/\uFE0F/g, "");   // remove o "variation selector"
}

function descreverErro(e) {
  if (!e) return "erro desconhecido";
  if (typeof e === "string") return e;
  const partes = [];
  if (e.message) partes.push(e.message);
  if (e.type) partes.push(`type=${e.type}`);
  if (e.error) partes.push(`error=${typeof e.error === "string" ? e.error : JSON.stringify(e.error)}`);
  if (e.status ?? e.statusCode) partes.push(`status=${e.status ?? e.statusCode}`);
  if (e.response?.status) partes.push(`http=${e.response.status}`);
  if (e.permission) partes.push(`permissão=${e.permission}`);
  if (!partes.length) {
    try { partes.push(JSON.stringify(e).slice(0, 300)); } catch { partes.push(String(e)); }
  }
  return partes.join(" | ");
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
    console.error(`[REACTIONROLE] não consegui tirar a reação ${emoji} de ${userId}: ${descreverErro(e)}`);
    return false;
  }
}

const PAUSA_MS = Number(process.env.RR_PAUSA_MS || 750);   // 15 por 10s = 1 a cada 667ms
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
      if (/InvalidOperation/.test(descreverErro(e))) {
        return "o Stoat recusou: ou a mensagem chegou ao teto de reações, ou é um emoji personalizado que eu não posso usar";
      }
      return descreverErro(e);
    }
  }
  return "não consegui depois de várias tentativas";
}

let tetoCache = null;
async function tetoDeReacoes() {
  if (tetoCache) return tetoCache;
  const r = await chamarApi("/", { ms: 8000 });
  const n = r.json?.features?.limits?.global?.message_reactions;
  if (Number.isFinite(n)) tetoCache = n;   // sem resposta: seguimos sem o aviso
  return tetoCache;
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

    const alvo = db.getReactionRole(messageId, normalizarEmoji(emoji));
    if (!alvo) return false;

    const serverId = alvo.serverId;
    const server = await ctx.client.servers.fetch(serverId).catch((e) => {
      console.error(`[REACTIONROLE] não consegui carregar o servidor ${serverId}:`, descreverErro(e)); return null;
    });
    if (!server) return false;
    const member = await server.fetchMember(userId).catch((e) => {
      console.error(`[REACTIONROLE] não consegui carregar o membro ${userId}:`, descreverErro(e)); return null;
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
      console.error(`[REACTIONROLE] ❌ falhei ao dar o cargo ${alvo.roleId} para ${userId}: ${descreverErro(e)}`);
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
    console.error("[REACTIONROLE] erro inesperado:", descreverErro(err));
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
      console.error(`[REACTIONROLE] ❌ falhei ao remover o cargo ${alvo.roleId} de ${userId}: ${descreverErro(e)}`);
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
    console.error("[REACTIONROLE][desreagir]", descreverErro(err));
    return false;
  }
}

export async function precarregarMensagens(client) {
  let ok = 0, perdidas = 0, repostos = 0;
  const falhas = [];
  const registros = db.mensagensComReactionRole();
  if (!registros.length) return { ok, perdidas, repostos, falhas, total: 0 };

  for (const reg of registros) {
    let msg = null;
    try {
      if (reg.channelId) {
        const canal = client.channels.get(reg.channelId)
          ?? await client.channels.fetch(reg.channelId).catch(() => null);
        if (canal) msg = await canal.fetchMessage(reg.messageId).catch(() => null);
      }
      if (!msg && reg.serverId) {
        // sem canal gravado: procura e memoriza para não repetir a busca
        const server = await client.servers.fetch(reg.serverId).catch(() => null);
        for (const ch of server?.channels ?? []) {
          const canal = typeof ch === "string"
            ? (client.channels.get(ch) ?? await client.channels.fetch(ch).catch(() => null))
            : ch;
          if (!canal?.fetchMessage) continue;
          msg = await canal.fetchMessage(reg.messageId).catch(() => null);
          if (msg) { db.setReactionRoleCanal(reg.messageId, canal.id ?? canal._id); break; }
        }
      }
    } catch (e) {
      console.error(`[REACTIONROLE][boot] ${reg.messageId}:`, e?.message);
    }
    if (msg) {
      ok++;
      const r = await reporReacoesQueFaltam(msg, client).catch(() => ({ repostos: [], falhas: [] }));
      repostos += r.repostos.length;
      falhas.push(...(r.falhas ?? []));
    } else { perdidas++; console.log(`[REACTIONROLE][boot] não achei a mensagem ${reg.messageId} (canal apagado ou sem acesso?)`); }
  }
  console.log(`[REACTIONROLE] ${ok} mensagem(ns) recarregada(s)${perdidas ? `, ${perdidas} não encontrada(s)` : ""}${repostos ? `, ${repostos} reação(ões) reposta(s)` : ""}`);
  return { ok, perdidas, repostos, falhas, total: registros.length };
}

export async function cmdReactionRole(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId, client } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageRole")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageRole** para configurar cargos por reação.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageRole** to configure reaction roles.", colour: COR.erro },
      { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManageRole** para configurar roles por reacción.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();

  // ── A mensagem é DESTE servidor? (15 out 2026) ──
  // As regras eram achadas só pelo ID da mensagem: um admin do servidor A
  // podia apagar, trocar o modo, reordenar (limpando as reações) ou
  // sobrescrever as regras de uma mensagem do servidor B.
  const MEXEM_NA_MENSAGEM = ["exclusivo", "exclusive", "unico", "único", "ordem", "order", "reordenar", "remove", "remover", "add", "adicionar"];
  if (MEXEM_NA_MENSAGEM.includes(sub)) {
    const midAlvo = resolverMensagem(args[1] ?? "").id;
    const dono = midAlvo ? db.servidorDoReactionRole(midAlvo) : null;
    if (dono && dono !== serverId) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Mensagem de outro servidor", description: "Essa mensagem é de outro servidor — aqui só dá para mexer nas mensagens deste.", colour: COR.erro },
        { title: "🚫 Message from another server", description: "That message belongs to another server — here you can only change this server's messages.", colour: COR.erro },
        { title: "🚫 Mensaje de otro servidor", description: "Ese mensaje es de otro servidor — aquí solo puedes tocar los mensajes de este.", colour: COR.erro }));
    }
  }

  // ── list ──
  if (sub === "list" || sub === "lista") {
    const linhas = db.listReactionRolesServidor(serverId);
    if (!linhas.length)
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Cargos por reação", description: "_Nenhum configurado neste servidor._", colour: COR.mod },
        { title: "🎭 Reaction roles", description: "_None configured on this server._", colour: COR.mod },
        { title: "🎭 Roles por reacción", description: "_Ninguno configurado en este servidor._", colour: COR.mod }));
    const porMsg = {};
    for (const l of linhas) (porMsg[l.messageId] ??= []).push(`${l.emoji} → \`${l.roleId}\``);
    return sendEmbed(message.channel, {
      title: tr(ctx, "🎭 Cargos por reação", "🎭 Reaction roles", "🎭 Roles por reacción"),
      description: Object.entries(porMsg)
        .map(([mid, arr]) => {
          const modo = db.isReactionRoleExclusivo(mid)
            ? tr(ctx, " — 🎯 _exclusivo (troca o cargo)_", " — 🎯 _exclusive (swaps the role)_", " — 🎯 _exclusivo (cambia el rol)_") : "";
          return tr(ctx, `**Mensagem \`${mid}\`**`, `**Message \`${mid}\`**`, `**Mensaje \`${mid}\`**`) + `${modo}\n${arr.join("\n")}`;
        }).join("\n\n")
        + tr(ctx,
          `\n\n_Use \`${citarInterno("reactionrole.exclusivo", PREFIXO)} <mensagem> on\` para que a escolha troque o cargo anterior._`,
          `\n\n_Use \`${citarInterno("reactionrole.exclusivo", PREFIXO)} <message> on\` so that picking one swaps the previous role._`,
          `\n\n_Usa \`${citar("reactionrole.exclusivo", "es", PREFIXO)} <mensaje> on\` para que elegir uno cambie el rol anterior._`),
      colour: COR.mod,
    });
  }

  // ── exclusivo <mensagem> on|off ──
  if (["exclusivo", "exclusive", "unico", "único"].includes(sub)) {
    const mid = resolverMensagem(args[1]).id;
    if (!mid) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: [
          `\`${citarInterno("reactionrole.exclusivo", PREFIXO)} <mensagem> on|off\``,
          "",
          "**on** — escolher um emoji **troca** o cargo anterior (ex.: escolha sua cor)",
          "**off** — os cargos **acumulam** (ex.: escolha seus interesses)",
          "",
          "A mensagem pode ser o **ID** ou o **link**.",
        ].join("\n"), colour: COR.erro,
      }, {
        title: "❌ Wrong usage",
        description: [
          `\`${citarInterno("reactionrole.exclusivo", PREFIXO)} <message> on|off\``,
          "",
          "**on** — picking an emoji **swaps** the previous role (e.g. pick your color)",
          "**off** — roles **stack** (e.g. pick your interests)",
          "",
          "The message can be its **ID** or its **link**.",
        ].join("\n"), colour: COR.erro,
      }, {
        title: "❌ Uso incorrecto",
        description: [
          `\`${citar("reactionrole.exclusivo", "es", PREFIXO)} <mensaje> on|off\``,
          "",
          "**on** — elegir un emoji **cambia** el rol anterior (ej.: elige tu color)",
          "**off** — los roles se **acumulan** (ej.: elige tus intereses)",
          "",
          "El mensaje puede ser el **ID** o el **enlace**.",
        ].join("\n"), colour: COR.erro,
      }));
    }
    const regras = db.listReactionRoles(mid);
    if (!regras.length) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Sem regras nessa mensagem",
        description: `Não há cargos por reação registrados em \`${mid}\`. Adicione com \`${citarInterno("reactionrole.add", PREFIXO)}\` primeiro.`,
        colour: COR.erro,
      }, {
        title: "❌ No rules on that message",
        description: `There are no reaction roles registered on \`${mid}\`. Add one with \`${citarInterno("reactionrole.add", PREFIXO)}\` first.`,
        colour: COR.erro,
      }, {
        title: "❌ No hay reglas en ese mensaje",
        description: `No hay roles por reacción registrados en \`${mid}\`. Añade uno con \`${citar("reactionrole.add", "es", PREFIXO)}\` primero.`,
        colour: COR.erro,
      }));
    }
    const estado = (args[2] ?? "on").toLowerCase();
    const ligar = !["off", "nao", "não", "0"].includes(estado);
    db.setReactionRoleExclusivo(mid, ligar);
    return sendEmbed(message.channel, tr(ctx, {
      title: ligar ? "🎯 Modo exclusivo ligado" : "➕ Modo acumulativo",
      description: ligar
        ? `Nessa mensagem (**${regras.length}** opções), escolher um emoji **remove** o cargo escolhido antes. Bom para cor, idade, time — coisas em que só uma vale.`
        : `Nessa mensagem, a pessoa pode ter **vários** cargos ao mesmo tempo.`,
      colour: COR.sucesso }, {
      title: ligar ? "🎯 Exclusive mode on" : "➕ Stacking mode",
      description: ligar
        ? `On that message (**${regras.length}** options), picking an emoji **removes** the previously chosen role. Good for color, age, team — things where only one applies.`
        : `On that message, a person can hold **several** roles at once.`,
      colour: COR.sucesso,
    }, {
      title: ligar ? "🎯 Modo exclusivo activado" : "➕ Modo acumulativo",
      description: ligar
        ? `En ese mensaje (**${regras.length}** opciones), elegir un emoji **quita** el rol elegido antes. Ideal para color, edad, equipo — cosas en las que solo vale una.`
        : `En ese mensaje, una persona puede tener **varios** roles a la vez.`,
      colour: COR.sucesso,
    }));
  }

  if (["ordem", "order", "reordenar"].includes(sub)) {
    const mid = resolverMensagem(args[1]).id;
    const regras = mid ? db.listReactionRoles(mid) : [];
    if (!mid || !regras.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Mensagem sem cargos por reação",
          description: `\`${citarInterno("reactionrole.ordem", PREFIXO)} <mensagem> confirmar\`\n\nAceito o **ID** ou o **link**. \`${citarInterno("reactionrole.list", PREFIXO)}\` mostra as configuradas.`, colour: COR.erro },
        { title: "❌ No reaction roles on that message",
          description: `\`${citarInterno("reactionrole", PREFIXO)} order <message> confirm\`\n\nI accept the **ID** or the **link**. \`${citarInterno("reactionrole.list", PREFIXO)}\` shows the configured ones.`, colour: COR.erro },
        { title: "❌ Mensaje sin roles por reacción",
          description: `\`${citar("reactionrole.ordem", "es", PREFIXO)} <mensaje> confirm\`\n\nAcepto el **ID** o el **enlace**. \`${citar("reactionrole.list", "es", PREFIXO)}\` muestra los configurados.`, colour: COR.erro }));
    }
    const ordem = regras.map((r) => r.emoji);
    if (!["confirmar", "confirm", "sim", "yes"].includes((args[2] ?? "").toLowerCase())) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "⚠️ Isto apaga as marcações de todo mundo",
        description: [
          `Vou limpar **todas** as reações de \`${mid}\` e reagir de novo nesta ordem:`,
          "",
          ordem.map((e, i) => `${i + 1}. ${e}`).join("  "),
          "",
          "**Os cargos que as pessoas já têm continuam** — só o ✓ na mensagem some, e cada uma reage de novo quando quiser.",
          "",
          `Se você só quer de volta um emoji que sumiu, \`${citarInterno("reactionrole.recarregar", PREFIXO)}\` faz isso sem apagar nada (ele entra no fim da fila).`,
          "",
          `Confirma? \`${citarInterno("reactionrole.ordem", PREFIXO)} ${mid} confirmar\``,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "⚠️ This wipes everyone's ticks",
        description: [
          `I'll clear **every** reaction on \`${mid}\` and react again in this order:`,
          "",
          ordem.map((e, i) => `${i + 1}. ${e}`).join("  "),
          "",
          "**People keep the roles they already have** — only the ✓ on the message goes away, and each person can react again whenever they like.",
          "",
          `If you just want a vanished emoji back, \`${citarInterno("reactionrole.recarregar", PREFIXO)}\` does that without wiping anything (it goes to the end of the row).`,
          "",
          `Confirm? \`${citarInterno("reactionrole", PREFIXO)} order ${mid} confirm\``,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "⚠️ Esto borra las marcas de todo el mundo",
        description: [
          `Voy a quitar **todas** las reacciones de \`${mid}\` y reaccionar de nuevo en este orden:`,
          "",
          ordem.map((e, i) => `${i + 1}. ${e}`).join("  "),
          "",
          "**Los roles que la gente ya tiene se mantienen** — solo desaparece el ✓ del mensaje, y cada uno reacciona de nuevo cuando quiera.",
          "",
          `Si solo quieres recuperar un emoji que desapareció, \`${citar("reactionrole.recarregar", "es", PREFIXO)}\` lo hace sin borrar nada (entra al final de la fila).`,
          "",
          `¿Confirmas? \`${citar("reactionrole.ordem", "es", PREFIXO)} ${mid} confirm\``,
        ].join("\n"), colour: COR.aviso,
      }));
    }

    const reg = db.mensagensComReactionRole().find((r) => r.messageId === mid);
    let msg = null;
    if (reg?.channelId) {
      const canal = client.channels.get(reg.channelId) ?? await client.channels.fetch(reg.channelId).catch(() => null);
      if (canal) msg = await canal.fetchMessage(mid).catch(() => null);
    }
    msg ??= await message.channel.fetchMessage(mid).catch(() => null) ?? await buscarEmCanais(server, client, mid);
    if (!msg) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Mensagem não encontrada", description: `Não achei \`${mid}\` num canal que eu enxergue.`, colour: COR.erro },
        { title: "❌ Message not found", description: `I couldn't find \`${mid}\` in a channel I can see.`, colour: COR.erro },
        { title: "❌ Mensaje no encontrado", description: `No encontré \`${mid}\` en ningún canal que yo vea.`, colour: COR.erro }));
    }

    try {
      await msg.clearReactions();
    } catch (e) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não consegui limpar as reações",
          description: `\`${descreverErro(e)}\`\n\nLimpar reações dos outros exige **ManageMessages** no canal.`, colour: COR.erro },
        { title: "❌ Couldn't clear the reactions",
          description: `\`${descreverErro(e)}\`\n\nClearing other people's reactions needs **ManageMessages** in the channel.`, colour: COR.erro },
        { title: "❌ No pude quitar las reacciones",
          description: `\`${descreverErro(e)}\`\n\nQuitar las reacciones de otros requiere **ManageMessages** en el canal.`, colour: COR.erro }));
    }
    const segundos = Math.ceil((ordem.length * PAUSA_MS) / 1000);
    if (ordem.length > 8) {
      await sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Recompondo o painel", description: `São **${ordem.length}** emojis, um a cada ~${(PAUSA_MS / 1000).toFixed(1)}s para não estourar o limite do Stoat. Leva uns **${segundos}s**.`, colour: COR.info },
        { title: "⏳ Rebuilding the panel", description: `**${ordem.length}** emojis, one every ~${(PAUSA_MS / 1000).toFixed(1)}s to stay under Stoat's limit. About **${segundos}s**.`, colour: COR.info },
        { title: "⏳ Rehaciendo el panel", description: `Son **${ordem.length}** emojis, uno cada ~${(PAUSA_MS / 1000).toFixed(1)}s para no superar el límite de Stoat. Tarda unos **${segundos}s**.`, colour: COR.info })).catch(() => {});
    }
    const falhas = [];
    for (const [i, emoji] of ordem.entries()) {
      if (i) await dormir(PAUSA_MS);
      const r = await reagirComPaciencia(msg, emoji);
      if (r !== true) {
        falhas.push({ emoji, motivo: r });
        console.error(`[REACTIONROLE][ordem] ${emoji}: ${r}`);
      }
    }
    const teto = await tetoDeReacoes();
    const estourouTeto = teto && ordem.length > teto;
    return sendEmbed(message.channel, tr(ctx, {
      title: falhas.length ? "⚠️ Painel refeito, com falhas" : "✅ Painel na ordem original",
      description: [
        `**${ordem.length - falhas.length}** de **${ordem.length}** emojis, na ordem configurada.`,
        falhas.length ? "\n**Não entraram:**\n" + falhas.map((f) => `${f.emoji} — ${f.motivo}`).join("\n") : "",
        estourouTeto
          ? `\n⚠️ Esta mensagem tem **${ordem.length}** regras, mas o Stoat aceita no máximo **${teto}** reações por mensagem. As que sobram nunca vão caber — divida o painel em duas mensagens.`
          : "",
        "",
        "_Quem já tinha cargo continua com ele._",
      ].filter(Boolean).join("\n"), colour: falhas.length ? COR.aviso : COR.sucesso,
    }, {
      title: falhas.length ? "⚠️ Panel rebuilt, with failures" : "✅ Panel back in its original order",
      description: [
        `**${ordem.length - falhas.length}** of **${ordem.length}** emojis, in the configured order.`,
        falhas.length ? "\n**Didn't make it:**\n" + falhas.map((f) => `${f.emoji} — ${f.motivo}`).join("\n") : "",
        estourouTeto
          ? `\n⚠️ This message has **${ordem.length}** rules, but Stoat allows at most **${teto}** reactions per message. The extras will never fit — split the panel into two messages.`
          : "",
        "",
        "_Anyone who already had a role keeps it._",
      ].filter(Boolean).join("\n"), colour: falhas.length ? COR.aviso : COR.sucesso,
    }, {
      title: falhas.length ? "⚠️ Panel rehecho, con fallos" : "✅ Panel en el orden original",
      description: [
        `**${ordem.length - falhas.length}** de **${ordem.length}** emojis, en el orden configurado.`,
        falhas.length ? "\n**No entraron:**\n" + falhas.map((f) => `${f.emoji} — ${f.motivo}`).join("\n") : "",
        estourouTeto
          ? `\n⚠️ Este mensaje tiene **${ordem.length}** reglas, pero Stoat acepta como máximo **${teto}** reacciones por mensaje. Las que sobran nunca van a caber — divide el panel en dos mensajes.`
          : "",
        "",
        "_Quien ya tenía un rol lo mantiene._",
      ].filter(Boolean).join("\n"), colour: falhas.length ? COR.aviso : COR.sucesso,
    }));
  }

  // ── recarregar: força a re-leitura das mensagens (diagnóstico) ──
  if (["recarregar", "reload", "reparar"].includes(sub)) {
    await sendEmbed(message.channel, tr(ctx,
      { title: "🔄 Recarregando…",
        description: "Buscando as mensagens de cargos por reação para voltarem ao cache.", colour: COR.info },
      { title: "🔄 Reloading…",
        description: "Fetching the reaction-role messages so they return to the cache.", colour: COR.info },
      { title: "🔄 Recargando…",
        description: "Buscando los mensajes de roles por reacción para que vuelvan a la caché.", colour: COR.info }));
    const r = await precarregarMensagens(client);
    const motivos = [...new Set((r.falhas ?? []).map((f) => `${f.emoji} — ${f.motivo}`))].slice(0, 6);
    return sendEmbed(message.channel, tr(ctx, {
      title: r.perdidas ? "⚠️ Recarregado com pendências" : "✅ Recarregado",
      description: [
        `**${r.ok}** de **${r.total}** mensagem(ns) voltaram ao cache.`,
        r.repostos ? `**${r.repostos}** reação(ões) que tinham sumido foram repostas (entram no fim da fila — \`${citarInterno("reactionrole.ordem", PREFIXO)} <mensagem>\` devolve a ordem original).` : "",
        motivos.length ? `\n**Não consegui repor:**\n${motivos.join("\n")}` : "",
        r.perdidas ? `**${r.perdidas}** não foram encontradas — o canal pode ter sido apagado, ou falta \`ViewChannel\`/\`ReadMessageHistory\` para o bot.` : "",
        "",
        "_Isso é feito sozinho a cada reinício do bot._",
      ].filter(Boolean).join("\n"),
      colour: r.perdidas ? COR.aviso : COR.sucesso }, {
      title: r.perdidas ? "⚠️ Reloaded with issues" : "✅ Reloaded",
      description: [
        `**${r.ok}** of **${r.total}** message(s) returned to the cache.`,
        r.repostos ? `**${r.repostos}** missing reaction(s) put back (they go to the end of the row — \`${citarInterno("reactionrole.ordem", PREFIXO)} <message>\` restores the original order).` : "",
        motivos.length ? `\n**Couldn't put back:**\n${motivos.join("\n")}` : "",
        r.perdidas ? `**${r.perdidas}** weren't found — the channel may have been deleted, or the bot lacks \`ViewChannel\`/\`ReadMessageHistory\`.` : "",
        "",
        "_This runs automatically on every bot restart._",
      ].filter(Boolean).join("\n"),
      colour: r.perdidas ? COR.aviso : COR.sucesso,
    }, {
      title: r.perdidas ? "⚠️ Recargado con pendientes" : "✅ Recargado",
      description: [
        `**${r.ok}** de **${r.total}** mensaje(s) volvieron a la caché.`,
        r.repostos ? `Se repusieron **${r.repostos}** reacción(es) que habían desaparecido (entran al final de la fila — \`${citar("reactionrole.ordem", "es", PREFIXO)} <mensaje>\` devuelve el orden original).` : "",
        motivos.length ? `\n**No pude reponer:**\n${motivos.join("\n")}` : "",
        r.perdidas ? `**${r.perdidas}** no se encontraron — puede que el canal se haya borrado, o que al bot le falte \`ViewChannel\`/\`ReadMessageHistory\`.` : "",
        "",
        "_Esto se hace solo en cada reinicio del bot._",
      ].filter(Boolean).join("\n"),
      colour: r.perdidas ? COR.aviso : COR.sucesso,
    }));
  }

  if (sub === "remove" || sub === "remover") {
    const mid = resolverMensagem(args[1]).id;
    if (!mid)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto",
          description: `\`${citarInterno("reactionrole.remove", PREFIXO)} <mensagem>\`\n\nAceito o **ID** ou o **link** da mensagem.`, colour: COR.erro },
        { title: "❌ Wrong usage",
          description: `\`${citarInterno("reactionrole.remove", PREFIXO)} <message>\`\n\nI accept the message's **ID** or **link**.`, colour: COR.erro },
        { title: "❌ Uso incorrecto",
          description: `\`${citar("reactionrole.remove", "es", PREFIXO)} <mensaje>\`\n\nAcepto el **ID** o el **enlace** del mensaje.`, colour: COR.erro }));
    const n = db.removeReactionRolesMensagem(mid);
    return sendEmbed(message.channel, tr(ctx, {
      title: "🎭 Removido",
      description: n ? `Removidos **${n}** vínculo(s) da mensagem \`${mid}\`.` : "Nada encontrado para essa mensagem.",
      colour: COR.sucesso }, {
      title: "🎭 Removed",
      description: n ? `Removed **${n}** link(s) from message \`${mid}\`.` : "Nothing found for that message.",
      colour: COR.sucesso,
    }, {
      title: "🎭 Quitado",
      description: n ? `Se quitaron **${n}** vínculo(s) del mensaje \`${mid}\`.` : "No se encontró nada para ese mensaje.",
      colour: COR.sucesso,
    }));
  }

  // ── add <idMensagem|link> <emoji> <idCargo> ──
  if (sub === "add" || sub === "adicionar") {
    const ref   = resolverMensagem(args[1]);
    const mid   = ref.id;
    const emoji = normalizarEmoji(args[2]);
    const role  = idValido(args[3]);

    if (!mid || !emoji || !role) {
      // aponta exatamente o que está errado, em vez de repetir a sintaxe seca
      const problemas = [];
      if (!mid) {
        problemas.push(tr(ctx,
          (ref.canalId
            ? "• o link aponta para o **canal**, não para uma mensagem — abra o menu \`...\` da mensagem e use *Copiar link*"
            : "• não achei o **ID da mensagem** (aceito o ID puro ou o **link** da mensagem)"),
          (ref.canalId
            ? "• the link points to the **channel**, not to a message — open the message's `...` menu and use *Copy link*"
            : "• I couldn't find the **message ID** (I accept the raw ID or the message's **link**)"),
          (ref.canalId
            ? "• el enlace apunta al **canal**, no a un mensaje — abre el menú `...` del mensaje y usa *Copiar enlace*"
            : "• no encontré el **ID del mensaje** (acepto el ID solo o el **enlace** del mensaje)")));
      }
      if (!emoji) problemas.push(tr(ctx, "• faltou o **emoji**", "• the **emoji** is missing", "• falta el **emoji**"));
      if (!role) problemas.push(tr(ctx,
        `• o **cargo**: ${descreverProblemaDeId(args[3], "cargo")} — mencione o cargo ou cole o ID (Configurações → Cargos → *Copy role ID*)`,
        `• the **role**: ${descreverProblemaDeId(args[3], "cargo", "en")} — mention the role or paste its ID (Settings → Roles → *Copy role ID*)`,
        `• el **rol**: ${descreverProblemaDeId(args[3], "cargo", "es")} — menciona el rol o pega su ID (Ajustes → Roles → *Copy role ID*)`));

      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: [
          `\`${citarInterno("reactionrole.add", PREFIXO)} <mensagem> <emoji> <idCargo>\``,
          "",
          problemas.join("\n"),
          "",
          "**A mensagem** pode ser o ID **ou o link** — os dois funcionam:",
          "```",
          `${citarInterno("reactionrole.add", PREFIXO)} https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
          `${citarInterno("reactionrole.add", PREFIXO)} 01ABC... 🎮 01XYZ...`,
          "```",
        ].join("\n"), colour: COR.erro }, {
        title: "❌ Wrong usage",
        description: [
          `\`${citarInterno("reactionrole.add", PREFIXO)} <message> <emoji> <roleId>\``,
          "",
          problemas.join("\n"),
          "",
          "**The message** can be the ID **or the link** — both work:",
          "```",
          `${citarInterno("reactionrole.add", PREFIXO)} https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
          `${citarInterno("reactionrole.add", PREFIXO)} 01ABC... 🎮 01XYZ...`,
          "```",
        ].join("\n"), colour: COR.erro,
      }, {
        title: "❌ Uso incorrecto",
        description: [
          `\`${citar("reactionrole.add", "es", PREFIXO)} <mensaje> <emoji> <idRol>\``,
          "",
          problemas.join("\n"),
          "",
          "**El mensaje** puede ser el ID **o el enlace** — los dos funcionan:",
          "```",
          `${citar("reactionrole.add", "es", PREFIXO)} https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
          `${citar("reactionrole.add", "es", PREFIXO)} 01ABC... 🎮 01XYZ...`,
          "```",
        ].join("\n"), colour: COR.erro,
      }));
    }

    try {
      let msg = null;
      if (ref.canalId) {
        const canal = client.channels.get(ref.canalId)
          ?? await client.channels.fetch(ref.canalId).catch(() => null);
        if (canal) msg = await canal.fetchMessage(mid).catch(() => null);
      }
      msg ??= await message.channel.fetchMessage(mid).catch(() => null)
        ?? await buscarEmCanais(server, client, mid);
      const canalAchado = msg ? (msg.channel ?? client.channels.get(msg.channelId) ?? null) : null;
      if (msg && canalDeOutroServidor(canalAchado, serverId)) msg = null;   // mensagem de outro servidor: como se não existisse
      if (msg) {
        // quem pede precisa estar ACIMA do cargo (antes só a Judy precisava)
        const pode = await podeUsarCargo(server, message, role, ctx);
        if (!pode.ok) {
          return sendEmbed(message.channel, tr(ctx,
            { title: "🚫 Cargo acima do seu", description: `${pode.pt}.`, colour: COR.erro },
            { title: "🚫 Role above yours", description: `${pode.en}.`, colour: COR.erro },
            { title: "🚫 Rol por encima del tuyo", description: `${pode.es ?? pode.en}.`, colour: COR.erro }));
        }
      }
      if (!msg) {
        return sendEmbed(message.channel, tr(ctx, {
          title: "❌ Mensagem não encontrada",
          description: `Não achei a mensagem \`${mid}\`. Ela precisa estar num canal onde o bot tem acesso (ViewChannel + ReadMessageHistory).`,
          colour: COR.erro,
        }, {
          title: "❌ Message not found",
          description: `I couldn't find the message \`${mid}\`. It must be in a channel the bot can access (ViewChannel + ReadMessageHistory).`,
          colour: COR.erro,
        }, {
          title: "❌ Mensaje no encontrado",
          description: `No encontré el mensaje \`${mid}\`. Tiene que estar en un canal al que el bot tenga acceso (ViewChannel + ReadMessageHistory).`,
          colour: COR.erro,
        }));
      }

      // grava o canal junto: é o que permite recarregar a mensagem no boot
      const canalDaMsg = ref.canalId ?? msg?.channelId ?? msg?.channel?.id ?? null;
      db.addReactionRole(serverId, mid, emoji, role, canalDaMsg);
      try { await msg.react(encodeURIComponent(emoji)); } catch (e) {
        console.error("[REACTIONROLE][react]", e?.message);
      }

      await log.registrar(ctx, "cargos", { titulo: "🎭 Cargo por reação configurado",
        descricao: `<@${message.authorId}> vinculou ${emoji} → <%${role}> na mensagem \`${mid}\`.`,
        en: { titulo: "🎭 Reaction role set up", descricao: `<@${message.authorId}> linked ${emoji} → <%${role}> on message \`${mid}\`.` },
        es: { titulo: "🎭 Rol por reacción configurado", descricao: `<@${message.authorId}> vinculó ${emoji} → <%${role}> en el mensaje \`${mid}\`.` } });

      return sendEmbed(message.channel, tr(ctx, {
        title: "🎭 Cargo por reação configurado",
        description: [
          `**Mensagem:** \`${mid}\``,
          `**Emoji:** ${emoji}`,
          `**Cargo:** \`${role}\``,
          "",
          "Quem clicar no emoji nessa mensagem recebe o cargo. ✅",
        ].join("\n"),
        colour: COR.sucesso,
      }, {
        title: "🎭 Reaction role configured",
        description: [
          `**Message:** \`${mid}\``,
          `**Emoji:** ${emoji}`,
          `**Role:** \`${role}\``,
          "",
          "Anyone who clicks the emoji on that message gets the role. ✅",
        ].join("\n"),
        colour: COR.sucesso,
      }, {
        title: "🎭 Rol por reacción configurado",
        description: [
          `**Mensaje:** \`${mid}\``,
          `**Emoji:** ${emoji}`,
          `**Rol:** \`${role}\``,
          "",
          "Quien haga clic en el emoji de ese mensaje recibe el rol. ✅",
        ].join("\n"),
        colour: COR.sucesso,
      }));
    } catch (err) {
      console.error("[REACTIONROLE][add]", descreverErro(err));
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Falha",
          description: `**Erro:** ${descreverErro(err)}\n\n_O bot precisa de **React**, **ManageRole** e **AssignRoles**._`, colour: COR.erro },
        { title: "❌ Failure",
          description: `**Error:** ${descreverErro(err)}\n\n_The bot needs **React**, **ManageRole** and **AssignRoles**._`, colour: COR.erro },
        { title: "❌ Fallo",
          description: `**Error:** ${descreverErro(err)}\n\n_El bot necesita **React**, **ManageRole** y **AssignRoles**._`, colour: COR.erro }));
    }
  }

  // ── ajuda ──
  return sendEmbed(message.channel, tr(ctx, {
    title: "🎭 Cargos por reação",
    description: [
      `\`${citarInterno("reactionrole.add", PREFIXO)} <idMensagem> <emoji> <idCargo>\``,
      `\`${citarInterno("reactionrole.remove", PREFIXO)} <idMensagem>\``,
      `\`${citarInterno("reactionrole.list", PREFIXO)}\``,
      "",
      `💡 _Dica: crie a mensagem-painel com_ \`${citar("embed", "pt", PREFIXO)}\` _e depois vincule os emojis a ela._`,
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "🎭 Reaction roles",
    description: [
      `\`${citarInterno("reactionrole.add", PREFIXO)} <messageId> <emoji> <roleId>\``,
      `\`${citarInterno("reactionrole.remove", PREFIXO)} <messageId>\``,
      `\`${citarInterno("reactionrole.list", PREFIXO)}\``,
      "",
      `💡 _Tip: create the panel message with_ \`${citar("embed", "en", PREFIXO)}\` _and then link the emojis to it._`,
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "🎭 Roles por reacción",
    description: [
      `\`${citar("reactionrole.add", "es", PREFIXO)} <idMensaje> <emoji> <idRol>\``,
      `\`${citar("reactionrole.remove", "es", PREFIXO)} <idMensaje>\``,
      `\`${citar("reactionrole.list", "es", PREFIXO)}\``,
      "",
      `💡 _Consejo: crea el mensaje-panel con_ \`${citar("embed", "es", PREFIXO)}\` _y después vincula los emojis a él._`,
    ].join("\n"),
    colour: COR.info,
  }));
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
