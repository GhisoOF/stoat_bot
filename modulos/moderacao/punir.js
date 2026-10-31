// punir.js — as punições manuais num handler só (P2, 31 out 2026).
//
// &warn, &timeout (id `silenciar`), &kick e &ban seguem o mesmo caminho:
//   resolverAlvo → podeAgirSobre → ação → log → resposta de uma linha.
// &unban e &untimeout desfazem, com as mesmas formas de apontar a pessoa e mais
// duas: o número da lista que eles mostram sem argumento, e a reação ↩️ na
// mensagem da punição (só quem tem a permissão e está acima do alvo).
//
// O alvo é SEMPRE o primeiro argumento (menção, ID, link ou nome). Respondendo a
// uma mensagem, o alvo é o autor dela só quando nada foi escrito no lugar do alvo:
// `&warn`, `&kick`, `&ban` sozinhos, ou `&timeout 10m`. Um nome que não bate com
// ninguém é erro — nunca cai no autor da mensagem respondida (o erro de 31 out).

import * as db from "../core/db.js";
import * as log from "../core/log.js";
import { tr, idiomaDe } from "../core/i18n.js";
import { resolverUsuarioDetalhado } from "../core/ids.js";
import { descreverErro, registrarErro, tipoDoErro } from "../core/erros.js";
import { podeAgirSobre } from "../core/hierarquia.js";
import { banir } from "../core/banir.js";
import { lerDuracao, duracaoTexto } from "../core/duracao.js";
import { carimbo } from "../core/tempo.js";
import { MAX_TIMEOUT_MS, aplicarTimeout, tirarTimeout } from "./timeout.js";
import { liberarQuarentena } from "./confianca.js";
import { escadaDePunicao, validadeDosAvisos, sinalDaStaff } from "./automod-engine.js";
import * as banGlobal from "./ban-global.js";

// ── Textos curtos, nos três idiomas ──────────────────────────────────────────
const X3 = (l, pt, en, es) => (l === "es" ? es : l === "en" ? en : pt);
const idioma = (ctx) => idiomaDe(ctx);

// (P2, 31 out 2026) os textos curtos de erro moram no core (uma fonte só, também para as ferramentas)
import { dicaDeAjuda, erroDeUso, semPermissao } from "../core/saida.js";
export { dicaDeAjuda, erroDeUso, semPermissao };
const linha = (ctx, canal, cor, pt, en, es) => ctx.sendEmbed(canal, { description: tr(ctx, pt, en, es), colour: cor });
// quem pede não está acima do alvo (o texto vem do podeAgirSobre)
export const acimaDeVoce = (ctx, canal, pode) => linha(ctx, canal, ctx.COR.erro,
  `🚫 Acima de você: ${pode.pt}.`, `🚫 Above you: ${pode.en}.`, `🚫 Por encima de ti: ${pode.es ?? pode.en}.`);

// ── Quem é o alvo ────────────────────────────────────────────────────────────
// O autor da mensagem respondida (ou o alvo da punição, se a resposta é à
// mensagem da própria punição — `&unban` respondendo ao "🔨 banido").
async function autorDaResposta(message, ctx) {
  const rid = message?.replyIds?.[0];
  if (!rid) return null;
  const registrada = mensagensDePunicao.get(rid);
  if (registrada && registrada.serverId === (ctx?.serverId ?? message?.serverId)) return registrada.alvoId;
  let m = null;
  try { m = ctx?.client?.messages?.get?.(rid) ?? null; } catch (e) { registrarErro("PUNIR:resposta", e); }
  if (!m && typeof message?.channel?.fetchMessage === "function") {
    m = await message.channel.fetchMessage(rid).catch((e) => { registrarErro("PUNIR:resposta", e); return null; });
  }
  const autor = m?.authorId ?? m?.author?.id ?? null;
  return autor && autor !== ctx?.client?.user?.id ? autor : null;
}

// → { id, resto, porResposta } | { erro: "vazio" | "nao-encontrado" | "ambiguo", candidatos, entrada }
// `livre(token)`: o primeiro argumento NÃO é um alvo (o tempo do &timeout), então a
// resposta pode valer.
export async function resolverAlvo(message, args, server, ctx, { livre = () => false } = {}) {
  const a0 = String(args?.[0] ?? "").trim();
  if (!a0 || livre(a0)) {
    const doReply = await autorDaResposta(message, ctx);
    if (doReply) return { id: String(doReply).toUpperCase(), resto: args ?? [], porResposta: true };
    return { erro: "vazio" };
  }
  // sem `message`: o mentionIds (que numa resposta traz o autor respondido) não entra
  const r = await resolverUsuarioDetalhado(a0, { server, client: ctx?.client }).catch((e) => { registrarErro("PUNIR:alvo", e); return null; });
  if (r?.id) return { id: String(r.id).toUpperCase(), resto: args.slice(1), porResposta: false };
  if (r?.ambiguo) return { erro: "ambiguo", candidatos: r.candidatos ?? [], entrada: a0 };
  return { erro: "nao-encontrado", entrada: a0 };
}

// A resposta a um alvo que não deu certo (vazio, não achado, ambíguo).
export function responderAlvoRuim(ctx, canal, cmd, r) {
  if (r.erro === "ambiguo") {
    const nomes = r.candidatos.slice(0, 5).map((c) => `**${String(c.nome ?? "?").slice(0, 32)}** \`${c.id}\``).join(", ");
    return erroDeUso(ctx, canal, cmd, `Mais de uma pessoa: ${nomes} — use o ID`, `More than one person: ${nomes} — use the ID`, `Más de una persona: ${nomes} — usa el ID`);
  }
  if (r.erro === "nao-encontrado") {
    const e = String(r.entrada ?? "").slice(0, 40).replace(/`/g, "");
    return erroDeUso(ctx, canal, cmd, `Não achei \`${e}\``, `Couldn't find \`${e}\``, `No encontré \`${e}\``);
  }
  return erroDeUso(ctx, canal, cmd, "Quem?", "Who?", "¿Quién?", "❓");
}

// ── As mensagens de punição (para o ↩️) ──────────────────────────────────────
// msgId → { serverId, alvoId, tipo: "ban"|"timeout", canalId, quando }. Só na
// memória, com teto: depois de um reinício, o ↩️ das mensagens antigas não vale
// (o &unban e o &untimeout continuam).
export const EMOJI_DESFAZER = "↩️";
const MAX_MENSAGENS = 500;
const VALIDADE_REACAO_MS = 7 * 86_400_000;
const mensagensDePunicao = new Map();
export function lembrarPunicao(msg, { serverId, alvoId, tipo, canalId = null }) {
  const id = msg?.id ?? msg?._id;
  if (!id || !serverId || !alvoId) return;
  mensagensDePunicao.set(id, { serverId, alvoId, tipo, canalId: canalId ?? msg?.channelId ?? null, quando: Date.now() });
  while (mensagensDePunicao.size > MAX_MENSAGENS) mensagensDePunicao.delete(mensagensDePunicao.keys().next().value);
}
export const punicaoDaMensagem = (msgId) => {
  const p = mensagensDePunicao.get(msgId);
  if (p && Date.now() - p.quando > VALIDADE_REACAO_MS) { mensagensDePunicao.delete(msgId); return null; }
  return p ?? null;
};
async function oferecerDesfazer(msg, dados) {
  if (!msg) return;
  lembrarPunicao(msg, dados);
  try { await msg.react?.(encodeURIComponent(EMOJI_DESFAZER)); }
  catch (e) { registrarErro("PUNIR:reagir", e); }
}

// ── As quatro punições ───────────────────────────────────────────────────────
const PERM = { warn: "ManageMessages", timeout: "TimeoutMembers", kick: "KickMembers", ban: "BanMembers" };
const CMD = { warn: "warn", timeout: "silenciar", kick: "kick", ban: "ban" };

async function punir(tipo, message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, client } = ctx;
  const canal = message.channel;
  const cmd = CMD[tipo];
  const server = await getServer(message).catch(() => null);
  if (!server) return linha(ctx, canal, COR.erro, "❌ Só dentro de um servidor.", "❌ Only inside a server.", "❌ Solo dentro de un servidor.");
  if (!membroTemPermissao(message, server, PERM[tipo])) return semPermissao(ctx, canal, PERM[tipo]);

  const alvo = await resolverAlvo(message, args, server, ctx, { livre: tipo === "timeout" ? (t) => lerDuracao(t) !== null : () => false });
  if (!alvo.id) return responderAlvoRuim(ctx, canal, cmd, alvo);
  const alvoId = alvo.id;

  if (alvoId === client?.user?.id) return linha(ctx, canal, COR.aviso, "🤖 Não em mim.", "🤖 Not on me.", "🤖 Conmigo no.");
  if (alvoId === message.authorId) return linha(ctx, canal, COR.aviso, "🤔 Não em você mesmo.", "🤔 Not on yourself.", "🤔 Contigo mismo no.");
  if (alvoId === server.ownerId || ctx.ehSuperAdmin?.(alvoId)) {
    return linha(ctx, canal, COR.erro, `🚫 <@${alvoId}> é dono do servidor ou do bot.`, `🚫 <@${alvoId}> owns the server or the bot.`, `🚫 <@${alvoId}> es dueño del servidor o del bot.`);
  }
  const membro = await server.fetchMember?.(alvoId)?.catch?.(() => null) ?? null;
  if (!membro && tipo !== "ban") {
    return linha(ctx, canal, COR.erro, `❌ Não está no servidor: <@${alvoId}>.`, `❌ Not in the server: <@${alvoId}>.`, `❌ No está en el servidor: <@${alvoId}>.`);
  }
  const pode = await podeAgirSobre(server, message, alvoId, ctx);
  if (!pode.ok) return acimaDeVoce(ctx, canal, pode);

  let resto = alvo.resto;
  let ms = 0;
  if (tipo === "timeout") {
    ms = lerDuracao(resto[0]);
    if (!ms) return erroDeUso(ctx, canal, cmd, "Por quanto tempo? (ex.: `10m`, `2h`, `1d`)", "For how long? (e.g. `10m`, `2h`, `1d`)", "¿Por cuánto tiempo? (ej.: `10m`, `2h`, `1d`)");
    resto = resto.slice(1);
  }
  const motivo = resto.join(" ").trim().slice(0, 300);
  const motivoLog = motivo || X3(idioma(ctx), "sem motivo", "no reason", "sin motivo");
  const sufixo = motivo ? ` — ${motivo}` : "";
  // (31 out 2026, P3a) a decisão da staff vira um SINAL na fila do dono do bot (nunca pune nada por si).
  // (revisão P3a) só depois que a punição deu certo: cada ação chama `sinal()` no ponto de sucesso.
  const sinal = () => {
    sinalDaStaff(ctx, { tipo, alvoId, canalId: message.channelId ?? null, msgId: alvo.porResposta ? (message.replyIds?.[0] ?? null) : null, motivo })
      .catch((e) => registrarErro("PUNIR:sinal", e));
  };
  const ctxAcao = { ctx, server, message, alvoId, motivo, motivoLog, sufixo, membro, sinal };

  if (tipo === "warn") return avisar(ctxAcao);
  if (tipo === "timeout") return silenciar(ctxAcao, ms);
  if (tipo === "kick") return expulsar(ctxAcao);
  return banirManual(ctxAcao);
}

function falhou(ctx, canal, e, pt, en, es) {
  registrarErro("PUNIR", e);
  return linha(ctx, canal, ctx.COR.erro, `❌ ${pt}: ${descreverErro(e, "pt")}`, `❌ ${en}: ${descreverErro(e, "en")}`, `❌ ${es}: ${descreverErro(e, "es")}`);
}

async function registrarNoLog(ctx, titulo, descricao) {
  await log.registrar(ctx, "punicoes", { titulo: titulo[0], descricao: descricao[0],
    en: { titulo: titulo[1], descricao: descricao[1] }, es: { titulo: titulo[2], descricao: descricao[2] } });
}

async function expulsar({ ctx, server, message, alvoId, motivoLog, sufixo, sinal }) {
  try { await server.kickUser(alvoId); }
  catch (e) { return falhou(ctx, message.channel, e, "Não consegui expulsar", "Couldn't kick", "No pude expulsar"); }
  sinal?.();
  await registrarNoLog(ctx, ["👢 Expulso (manual)", "👢 Kicked (manual)", "👢 Expulsado (manual)"], [
    `<@${alvoId}> por <@${message.authorId}> — ${motivoLog}`, `<@${alvoId}> by <@${message.authorId}> — ${motivoLog}`, `<@${alvoId}> por <@${message.authorId}> — ${motivoLog}`]);
  console.log(`[KICK] ${message.authorId} -> ${alvoId}`);
  return linha(ctx, message.channel, ctx.COR.sucesso, `👢 <@${alvoId}> expulso${sufixo}`, `👢 <@${alvoId}> kicked${sufixo}`, `👢 <@${alvoId}> expulsado${sufixo}`);
}

async function banirManual({ ctx, server, message, alvoId, motivoLog, sufixo, sinal }) {
  let jaEstava = false;
  try { ({ jaEstava } = await banir(server, alvoId, { reason: motivoLog })); }
  catch (e) { return falhou(ctx, message.channel, e, "Não consegui banir", "Couldn't ban", "No pude banear"); }
  sinal?.();
  // alimenta a lista global (origem "manual": decisão humana, mesmo que o motivo diga "[AutoMod]")
  await banGlobal.registrar(ctx, alvoId, motivoLog, "manual", { nome: ctx.client?.users?.get?.(alvoId)?.username ?? null });
  if (jaEstava) return linha(ctx, message.channel, ctx.COR.info, `🔨 <@${alvoId}> já estava banido.`, `🔨 <@${alvoId}> was already banned.`, `🔨 <@${alvoId}> ya estaba baneado.`);
  await registrarNoLog(ctx, ["🔨 Banido (manual)", "🔨 Banned (manual)", "🔨 Baneado (manual)"], [
    `<@${alvoId}> por <@${message.authorId}> — ${motivoLog}`, `<@${alvoId}> by <@${message.authorId}> — ${motivoLog}`, `<@${alvoId}> por <@${message.authorId}> — ${motivoLog}`]);
  console.log(`[BAN] ${message.authorId} -> ${alvoId}`);
  const msg = await linha(ctx, message.channel, ctx.COR.erro, `🔨 <@${alvoId}> banido${sufixo}`, `🔨 <@${alvoId}> banned${sufixo}`, `🔨 <@${alvoId}> baneado${sufixo}`);
  await oferecerDesfazer(msg, { serverId: ctx.serverId ?? server.id, alvoId, tipo: "ban", canalId: message.channelId });
  return msg;
}

async function silenciar({ ctx, server, message, alvoId, motivoLog, sufixo, sinal }, ms) {
  const dur = Math.min(ms, MAX_TIMEOUT_MS);
  let ate;
  try { ate = await aplicarTimeout(server, alvoId, dur); }
  catch (e) {
    if (tipoDoErro(e) === "IsElevated") return linha(ctx, message.channel, ctx.COR.erro, `❌ ${descreverErro(e, "pt")}.`, `❌ ${descreverErro(e, "en")}.`, `❌ ${descreverErro(e, "es")}.`);
    return falhou(ctx, message.channel, e, "Não consegui silenciar", "Couldn't time out", "No pude silenciar");
  }
  sinal?.();
  // registra para reaplicar se a pessoa sair e voltar; sem o registro, a resposta diz
  let semRegistro = false;
  try { db.silenciarAte(ctx.serverId ?? server.id, alvoId, ate.getTime(), motivoLog); }
  catch (e) { semRegistro = true; registrarErro("PUNIR:silencio-banco", e); }
  const quando = carimbo(ate, "f");
  await registrarNoLog(ctx, ["🔇 Silenciado (manual)", "🔇 Timed out (manual)", "🔇 Silenciado (manual)"], [
    `<@${alvoId}> por <@${message.authorId}> até ${quando} — ${motivoLog}`, `<@${alvoId}> by <@${message.authorId}> until ${quando} — ${motivoLog}`, `<@${alvoId}> por <@${message.authorId}> hasta ${quando} — ${motivoLog}`]);
  console.log(`[SILENCIAR] ${message.authorId} -> ${alvoId} | ${duracaoTexto(dur)}`);
  const aviso = semRegistro ? X3(idioma(ctx), "\n⚠️ Não consegui gravar o silêncio: sair e voltar o tira.", "\n⚠️ Couldn't save the timeout: leaving and rejoining lifts it.", "\n⚠️ No pude guardar el silencio: salir y volver lo quita.") : "";
  const msg = await linha(ctx, message.channel, ctx.COR.mod,
    `🔇 <@${alvoId}> silenciado até ${quando}${sufixo}${aviso}`, `🔇 <@${alvoId}> timed out until ${quando}${sufixo}${aviso}`, `🔇 <@${alvoId}> silenciado hasta ${quando}${sufixo}${aviso}`);
  await oferecerDesfazer(msg, { serverId: ctx.serverId ?? server.id, alvoId, tipo: "timeout", canalId: message.channelId });
  return msg;
}

// O aviso segue a MESMA escada do automod (`&automod punicao`). O degrau só roda
// se quem pediu pode fazer aquilo por conta própria (ban com BanMembers, silêncio
// com TimeoutMembers); senão o aviso fica registrado e a resposta diz que não rodou.
async function avisar({ ctx, server, message, alvoId, motivoLog, sufixo, sinal }) {
  const l = idioma(ctx);
  const serverId = ctx.serverId ?? server.id;
  const pol = ctx.config?.automod?.punicao ?? { modo: "avisar" };
  const total = db.somarAviso(serverId, alvoId, motivoLog, { validadeMs: validadeDosAvisos(pol) });
  sinal?.();   // o aviso ficou registrado (o degrau da escada é outra coisa)
  const degraus = escadaDePunicao(pol);
  const acumular = pol.modo === "acumular";
  const degrau = acumular ? degraus[Math.min(total, degraus.length) - 1] : { tipo: "aviso" };
  const conta = acumular ? ` (${total}/${degraus.length})` : ` (${total})`;
  const perm = degrau.tipo === "ban" ? "BanMembers" : degrau.tipo === "mute" ? "TimeoutMembers" : null;

  let extra = "", tipoFeito = null, cor = ctx.COR.aviso, banido = false;
  if (perm && !ctx.membroTemPermissao(message, server, perm)) {
    extra = X3(l, ` — o degrau não foi aplicado: falta **${perm}** a você`, ` — the step wasn't applied: you lack **${perm}**`, ` — el escalón no se aplicó: te falta **${perm}**`);
  } else if (degrau.tipo === "ban") {
    try {
      await banir(server, alvoId, { reason: X3(l, `Limite de avisos — ${motivoLog}`, `Warning limit — ${motivoLog}`, `Límite de avisos — ${motivoLog}`) });
      db.limparPunicao(serverId, alvoId);
      extra = X3(l, " e **banido**", " and **banned**", " y **baneado**"); tipoFeito = "ban"; cor = ctx.COR.erro; banido = true;
    } catch (e) {
      registrarErro("PUNIR:aviso-ban", e);
      extra = X3(l, ` — não consegui banir: ${descreverErro(e, "pt")}`, ` — couldn't ban: ${descreverErro(e, "en")}`, ` — no pude banear: ${descreverErro(e, "es")}`);
    }
  } else if (degrau.tipo === "mute") {
    try {
      const ate = await aplicarTimeout(server, alvoId, degrau.ms);
      db.silenciarAte(serverId, alvoId, ate.getTime(), motivoLog);
      extra = X3(l, ` e silenciado até ${carimbo(ate, "f")}`, ` and timed out until ${carimbo(ate, "f")}`, ` y silenciado hasta ${carimbo(ate, "f")}`); tipoFeito = "timeout";
    } catch (e) {
      registrarErro("PUNIR:aviso-silencio", e);
      extra = X3(l, ` — não consegui silenciar: ${descreverErro(e, "pt")}`, ` — couldn't time out: ${descreverErro(e, "en")}`, ` — no pude silenciar: ${descreverErro(e, "es")}`);
    }
  }

  await registrarNoLog(ctx,
    banido ? ["🔨 Ban por acúmulo de avisos", "🔨 Ban for too many warnings", "🔨 Ban por acumulación de avisos"] : ["⚠️ Aviso manual", "⚠️ Manual warning", "⚠️ Aviso manual"],
    [`<@${alvoId}> por <@${message.authorId}>${conta} — ${motivoLog}`, `<@${alvoId}> by <@${message.authorId}>${conta} — ${motivoLog}`, `<@${alvoId}> por <@${message.authorId}>${conta} — ${motivoLog}`]);
  console.log(`[WARN] ${message.authorId} avisou ${alvoId} (${total})${banido ? " → BANIDO" : ""}`);
  const msg = await ctx.sendEmbed(message.channel, { description: tr(ctx,
    `⚠️ <@${alvoId}> avisado${conta}${extra}${sufixo}`, `⚠️ <@${alvoId}> warned${conta}${extra}${sufixo}`, `⚠️ <@${alvoId}> advertido${conta}${extra}${sufixo}`), colour: cor });
  if (tipoFeito) await oferecerDesfazer(msg, { serverId, alvoId, tipo: tipoFeito, canalId: message.channelId });
  return msg;
}

// ── Os handlers do registro ──────────────────────────────────────────────────
export async function cmdWarn(message, args, ctx) {
  // `&warn lista` e `&warn limpar` (o `list`/`clear` chegam traduzidos pelo registro)
  const sub = String(args[0] ?? "").toLowerCase();
  if (sub === "lista") return (await import("./automod-comandos.js")).cmdWarnings(message, args.slice(1), ctx);
  if (sub === "limpar") return (await import("./automod-comandos.js")).cmdClearwarnings(message, args.slice(1), ctx);
  return punir("warn", message, args, ctx);
}
export async function cmdTimeout(message, args, ctx) {
  // `&timeout tirar @pessoa` (o nome antigo do &untimeout) continua valendo
  if (String(args[0] ?? "").toLowerCase() === "tirar") return cmdUntimeout(message, args.slice(1), ctx);
  return punir("timeout", message, args, ctx);
}
export const cmdKick = (message, args, ctx) => punir("kick", message, args, ctx);
export const cmdBan = (message, args, ctx) => punir("ban", message, args, ctx);

// ── Desfazer: &unban e &untimeout ────────────────────────────────────────────
// A última lista mostrada de cada servidor (`&unban 3` = o 3º dela), por 15 min.
const LISTA_MS = 15 * 60_000;
const listasMostradas = new Map();   // `${serverId}:${tipo}` → { ids, quando }
function guardarLista(serverId, tipo, ids) {
  listasMostradas.set(`${serverId}:${tipo}`, { ids, quando: Date.now() });
  if (listasMostradas.size > 200) listasMostradas.delete(listasMostradas.keys().next().value);
}
export function idDaLista(serverId, tipo, n) {
  const l = listasMostradas.get(`${serverId}:${tipo}`);
  if (!l || Date.now() - l.quando > LISTA_MS) return null;
  return l.ids[n - 1] ?? null;
}

const idDoBan = (b) => b?.id?.user ?? b?.user?.id ?? b?._id?.user ?? (typeof b?.id === "string" ? b.id : null);
async function bansDoServidor(server) {
  const r = await server.fetchBans();
  const lista = r?.bans ?? r ?? [];
  const nomes = new Map((r?.users ?? []).map((u) => [u?.id ?? u?._id, u?.username]));
  return lista.map((b) => ({ id: idDoBan(b), nome: b?.user?.username ?? nomes.get(idDoBan(b)) ?? null, motivo: b?.reason ?? null })).filter((b) => b.id);
}
async function silenciadosDoServidor(server) {
  const r = await server.fetchMembers();
  const agora = Date.now();
  return (r?.members ?? r ?? [])
    .filter((m) => m?.timeout && new Date(m.timeout).getTime() > agora)
    .map((m) => ({ id: m?.id?.user ?? m?.user?.id, nome: m?.user?.username ?? m?.nickname ?? null, ate: new Date(m.timeout).getTime() }))
    .filter((m) => m.id);
}

// O núcleo do &unban (comando e reação): desbane, tira o registro DESTE servidor
// da lista global (senão a pessoa segue banida nos servidores em modo `imediato`)
// e, se ela ainda consta por outros servidores e o modo daqui bane, a isenta aqui
// (senão voltar ao servidor a baniria de novo).
export async function desfazerBan(ctx, server, alvoId, porId) {
  const serverId = ctx.serverId ?? server?.id;
  const r = await banGlobal.desbanir(server, serverId, alvoId, idioma(ctx));
  if (!r.ok) return r;
  let saiuDaLista = false, isentado = false;
  try {
    saiuDaLista = db.historicoBans(alvoId).some((b) => b.serverId === serverId);
    db.removerBanGlobal(alvoId, serverId);
    const resta = db.historicoBans(alvoId).length > 0;
    if (resta && banGlobal.modoBane(banGlobal.modoDe(ctx.config)) && !banGlobal.estaIsento(ctx.config, alvoId)) {
      ctx.config.banGlobal = { ...(ctx.config.banGlobal ?? {}), isentos: [...(ctx.config.banGlobal?.isentos ?? []), alvoId] };
      ctx.salvarConfig?.();
      isentado = true;
    }
  } catch (e) { registrarErro("PUNIR:unban-lista", e); }
  const nota = [saiuDaLista ? ["registro deste servidor tirado da lista global", "this server's record removed from the global list", "registro de este servidor quitado de la lista global"] : null,
    isentado ? ["isento da lista aqui", "exempt from the list here", "exento de la lista aquí"] : null].filter(Boolean);
  const junta = (i) => (nota.length ? `\n_${nota.map((n) => n[i]).join(" · ")}_` : "");
  await registrarNoLog(ctx, ["✅ Ban retirado", "✅ Unbanned", "✅ Ban retirado"], [
    `<@${alvoId}> por <@${porId}>${junta(0)}`, `<@${alvoId}> by <@${porId}>${junta(1)}`, `<@${alvoId}> por <@${porId}>${junta(2)}`]);
  console.log(`[UNBAN] ${porId} -> ${alvoId}${saiuDaLista ? " (saiu da lista global)" : ""}`);
  return { ok: true, saiuDaLista, isentado };
}

export async function desfazerTimeout(ctx, server, alvoId, porId) {
  const serverId = ctx.serverId ?? server?.id;
  let r;
  try { r = await tirarTimeout(server, alvoId); }
  catch (e) { registrarErro("PUNIR:untimeout", e); return { ok: false, erro: descreverErro(e, idioma(ctx)) }; }
  if (r.saiu) return { ok: false, erro: X3(idioma(ctx), "não é membro daqui", "not a member here", "no es miembro de aquí") };
  try { db.silenciarAte(serverId, alvoId, 0); db.definirSilenciado(serverId, alvoId, false); }
  catch (e) { registrarErro("PUNIR:untimeout-banco", e); }
  liberarQuarentena(serverId, alvoId);
  await registrarNoLog(ctx, ["🔊 Silêncio retirado", "🔊 Timeout lifted", "🔊 Silencio retirado"], [
    `<@${alvoId}> por <@${porId}>`, `<@${alvoId}> by <@${porId}>`, `<@${alvoId}> por <@${porId}>`]);
  console.log(`[UNTIMEOUT] ${porId} -> ${alvoId}`);
  return { ok: true, jaVencido: !!r.jaVencido };
}

const UNDO = {
  ban: { cmd: "unban", perm: "BanMembers", listar: bansDoServidor, desfazer: desfazerBan,
    vazia: ["✅ Ninguém banido.", "✅ Nobody is banned.", "✅ Nadie está baneado."],
    titulo: ["🔨 Banidos", "🔨 Banned", "🔨 Baneados"],
    feito: (id) => [`✅ <@${id}> desbanido.`, `✅ <@${id}> unbanned.`, `✅ <@${id}> desbaneado.`],
    naoEsta: (id) => [`❌ <@${id}> não está banido.`, `❌ <@${id}> isn't banned.`, `❌ <@${id}> no está baneado.`],
    item: (b) => `${b.nome ? `**${String(b.nome).slice(0, 32)}** ` : ""}\`${b.id}\`` },
  timeout: { cmd: "untimeout", perm: "TimeoutMembers", listar: silenciadosDoServidor, desfazer: desfazerTimeout,
    vazia: ["✅ Ninguém silenciado.", "✅ Nobody is timed out.", "✅ Nadie está silenciado."],
    titulo: ["🔇 Silenciados", "🔇 Timed out", "🔇 Silenciados"],
    feito: (id) => [`🔊 <@${id}> pode falar de novo.`, `🔊 <@${id}> can talk again.`, `🔊 <@${id}> puede hablar de nuevo.`],
    naoEsta: (id) => [`❌ <@${id}> não está silenciado.`, `❌ <@${id}> isn't timed out.`, `❌ <@${id}> no está silenciado.`],
    item: (m) => `<@${m.id}> — ${carimbo(m.ate, "R")}` },
};

async function desfazerPorComando(tipo, message, args, ctx) {
  const u = UNDO[tipo];
  const { COR, getServer, membroTemPermissao } = ctx;
  const canal = message.channel;
  const server = await getServer(message).catch(() => null);
  if (!server) return linha(ctx, canal, COR.erro, "❌ Só dentro de um servidor.", "❌ Only inside a server.", "❌ Solo dentro de un servidor.");
  if (!membroTemPermissao(message, server, u.perm)) return semPermissao(ctx, canal, u.perm);
  const serverId = ctx.serverId ?? server.id;

  let lista;
  const carregar = async () => {
    try { lista ??= await u.listar(server); }
    catch (e) { registrarErro(`PUNIR:${u.cmd}-lista`, e); lista = null; }
    return lista;
  };

  // `&unban 3`: o número da última lista mostrada
  const a0 = String(args[0] ?? "").trim();
  let alvoId = null;
  if (/^\d{1,3}$/.test(a0)) {
    alvoId = idDaLista(serverId, tipo, Number(a0));
    if (!alvoId) {
      const l = await carregar();
      alvoId = l?.[Number(a0) - 1]?.id ?? null;
    }
    if (!alvoId) return erroDeUso(ctx, canal, u.cmd, `Não há o número ${a0} na lista`, `There's no number ${a0} on the list`, `No hay el número ${a0} en la lista`);
  } else {
    const r = await resolverAlvo(message, args, server, ctx);
    if (r.id) alvoId = r.id;
    else if (r.erro !== "vazio") return responderAlvoRuim(ctx, canal, u.cmd, r);
  }

  // sem ninguém: a lista numerada
  if (!alvoId) {
    const l = await carregar();
    if (!l) return linha(ctx, canal, COR.erro, "❌ Não consegui ler a lista.", "❌ Couldn't read the list.", "❌ No pude leer la lista.");
    if (!l.length) return linha(ctx, canal, COR.sucesso, ...u.vazia);
    guardarLista(serverId, tipo, l.map((x) => x.id));
    const linhas = l.slice(0, 50).map((x, i) => `**${i + 1}.** ${u.item(x)}`);
    if (l.length > 50) linhas.push(X3(idioma(ctx), `… e mais ${l.length - 50}`, `… and ${l.length - 50} more`, `… y ${l.length - 50} más`));
    return ctx.sendEmbed(canal, { title: tr(ctx, ...u.titulo), description: linhas.join("\n"), colour: COR.info });
  }

  // está mesmo banido / silenciado? (o silêncio também pelo banco: o cache de membros
  // do Stoat pode não ter visto o timeout que acabou de ser dado)
  const l = await carregar();
  const noBanco = tipo === "timeout" && db.estaSilenciado(serverId, alvoId);
  if (l && !l.some((x) => x.id === alvoId) && !noBanco) return linha(ctx, canal, COR.aviso, ...u.naoEsta(alvoId));
  const pode = await podeAgirSobre(server, message, alvoId, ctx);
  if (!pode.ok) return acimaDeVoce(ctx, canal, pode);
  const r = await u.desfazer(ctx, server, alvoId, message.authorId);
  if (!r.ok) return linha(ctx, canal, COR.erro, `❌ ${r.erro}`, `❌ ${r.erro}`, `❌ ${r.erro}`);
  return linha(ctx, canal, COR.sucesso, ...u.feito(alvoId));
}
export const cmdUnban = (message, args, ctx) => desfazerPorComando("ban", message, args, ctx);
export const cmdUntimeout = (message, args, ctx) => desfazerPorComando("timeout", message, args, ctx);

// A reação ↩️ na mensagem da punição. `ctxBase` é um contexto sem servidor (o do
// evento de reação); devolve true se a reação era um "desfazer" (feito ou recusado).
const semVariacao = (e) => { let v = String(e ?? ""); try { v = decodeURIComponent(v); } catch { /* emoji cru */ } return v.replace(/️/g, ""); };
export async function aoReagirDesfazer(msg, userId, emoji, ctxBase) {
  if (semVariacao(emoji) !== semVariacao(EMOJI_DESFAZER)) return false;
  const msgId = msg?.id ?? msg?._id;
  const p = msgId ? punicaoDaMensagem(msgId) : null;
  if (!p || !userId || userId === ctxBase?.client?.user?.id) return false;
  const ctx = ctxBase.criarContexto ? ctxBase.criarContexto(p.serverId) : ctxBase;
  const client = ctx.client ?? ctxBase.client;
  const server = client?.servers?.get?.(p.serverId) ?? await client?.servers?.fetch?.(p.serverId)?.catch?.(() => null);
  if (!server) return true;
  const membro = await server.fetchMember?.(userId)?.catch?.(() => null) ?? null;
  const quem = { authorId: userId, member: membro, serverId: p.serverId, server };
  const u = UNDO[p.tipo];
  if (!u || !ctx.membroTemPermissao?.(quem, server, u.perm)) return true;   // reação de quem não pode: ignorada
  const pode = await podeAgirSobre(server, quem, p.alvoId, ctx);
  if (!pode.ok) return true;
  const r = await u.desfazer(ctx, server, p.alvoId, userId);
  const canal = client?.channels?.get?.(p.canalId) ?? msg?.channel ?? null;
  if (canal) {
    if (r.ok) await linha(ctx, canal, ctx.COR.sucesso, ...u.feito(p.alvoId));
    else await linha(ctx, canal, ctx.COR.erro, `❌ ${r.erro}`, `❌ ${r.erro}`, `❌ ${r.erro}`);
  }
  if (r.ok) mensagensDePunicao.delete(msgId);
  return true;
}
