// &silenciar — silêncio manual com o TIMEOUT NATIVO do Stoat.
//
// Antes não existia silêncio manual (só &kick, &ban e &warn); o silêncio por
// cargo só acontecia como punição do automod. O Stoat tem timeout próprio:
// PATCH /servers/:id/members/:user com { timeout: <ISO> }, permissão
// TimeoutMembers. Quem está em timeout só consegue VER o servidor — o próprio
// Stoat bloqueia o resto (crates/core/permissions: are_we_timed_out), sem
// depender de cargo, de posição de cargo nem de permissão de canal.
//
// Regras do backend (crates/delta/src/routes/servers/member_edit.rs):
//   • quem tem TimeoutMembers não pode levar timeout  → IsElevated
//   • a pessoa precisa estar ABAIXO do cargo mais alto do bot → NotElevated
//   • tirar o timeout = remove: ["Timeout"]

import * as log from "../core/log.js";
import { tr } from "../core/i18n.js";
import { descreverErro, tipoDoErro } from "../core/erros.js";
import { resolverUsuario } from "../core/ids.js";
import { lerDuracao, duracaoTexto } from "../core/duracao.js";
import { MAX_TIMEOUT_MS as MAX_MS } from "./timeout.js";
import * as db from "../core/db.js";

const TIRAR = new Set(["tirar", "remover", "desfazer", "off", "remove", "undo", "fim", "liberar"]);

function ajuda(ctx) {
  const { PREFIXO: P, COR } = ctx;
  return tr(ctx, {
    title: "🔇 Silenciar",
    description: [
      `\`${P}silenciar @pessoa <tempo> [motivo]\` — silencia por um tempo (ex.: \`10m\`, \`2h\`, \`1d\`; máximo 28 dias).`,
      `\`${P}silenciar tirar @pessoa\` — devolve a voz antes da hora.`,
      "",
      "Usa o **silêncio nativo do Stoat**: a pessoa só consegue ver o servidor até o tempo acabar — não depende de cargo.",
      "_O bot precisa de **TimeoutMembers** e estar acima da pessoa. Quem tem TimeoutMembers não pode ser silenciado._",
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "🔇 Silence",
    description: [
      `\`${P}silenciar @user <time> [reason]\` — times someone out (e.g. \`10m\`, \`2h\`, \`1d\`; up to 28 days).`,
      `\`${P}silenciar tirar @user\` — lifts it early.`,
      "",
      "Uses the **Stoat's native timeout**: the person can only view the server until it ends — no role involved.",
      "_The bot needs **TimeoutMembers** and must sit above the person. Whoever has TimeoutMembers can't be timed out._",
    ].join("\n"),
    colour: COR.info,
  });
}

export async function cmdSilenciar(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, client } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "TimeoutMembers")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente", description: "Você precisa da permissão **TimeoutMembers** para usar este comando.", colour: COR.erro },
      { title: "🚫 Missing permission", description: "You need the **TimeoutMembers** permission to use this command.", colour: COR.erro }));
  }
  if (!args.length || ["ajuda", "help", "?"].includes(args[0]?.toLowerCase())) return sendEmbed(message.channel, ajuda(ctx));

  const tirar = TIRAR.has(args[0].toLowerCase());
  const resto = tirar ? args.slice(1) : args;

  // alvo: menção, ID ou nome — o primeiro argumento
  const alvoId = message.mentionIds?.[0]
    ?? await resolverUsuario(String(resto[0] ?? ""), { message, server, client }).catch(() => null);
  if (!alvoId) return sendEmbed(message.channel, ajuda(ctx));
  if (alvoId === client?.user?.id) {
    return sendEmbed(message.channel, tr(ctx,
      { description: "❌ Não posso silenciar a mim mesma!", colour: COR.erro },
      { description: "❌ I can't time myself out!", colour: COR.erro }));
  }

  const membro = await server.fetchMember(alvoId).catch(() => null);
  if (!membro) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não está no servidor", description: `<@${alvoId}> não é membro daqui — não há o que silenciar.`, colour: COR.erro },
      { title: "❌ Not in the server", description: `<@${alvoId}> isn't a member here — nothing to time out.`, colour: COR.erro }));
  }

  if (tirar) {
    try {
      await membro.edit({ remove: ["Timeout"] });
      try { db.silenciarAte(ctx.serverId ?? server?.id, alvoId, 0); db.definirSilenciado(ctx.serverId ?? server?.id, alvoId, false); } catch {}
      await log.registrar(ctx, "punicoes", { titulo: "🔊 Silêncio retirado (manual)",
        descricao: `<@${alvoId}> teve o silêncio retirado por <@${message.authorId}>.` });
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔊 Silêncio retirado", description: `<@${alvoId}> pode falar de novo.`, colour: COR.sucesso },
        { title: "🔊 Timeout lifted", description: `<@${alvoId}> can talk again.`, colour: COR.sucesso }));
    } catch (e) {
      console.error("[SILENCIAR][tirar]", descreverErro(e));
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não consegui tirar o silêncio", description: `**Erro:** ${descreverErro(e)}`, colour: COR.erro },
        { title: "❌ Couldn't lift the timeout", description: `**Error:** ${descreverErro(e, "en")}`, colour: COR.erro }));
    }
  }

  const ms = lerDuracao(resto[1]);
  if (!ms) return sendEmbed(message.channel, ajuda(ctx));
  const dur = Math.min(ms, MAX_MS);
  const motivo = resto.slice(2).join(" ").trim();
  const ate = new Date(Date.now() + dur);

  try {
    await membro.edit({ timeout: ate.toISOString() });
    // registra para reaplicar se a pessoa sair e voltar (o timeout é do membro)
    try { db.silenciarAte(ctx.serverId ?? server?.id, alvoId, ate.getTime(), motivo || "silêncio manual"); } catch {}
  } catch (e) {
    const tipo = tipoDoErro(e);
    console.error("[SILENCIAR]", descreverErro(e));
    const dica = tipo === "MissingPermission"
      ? ["_Dê a permissão **TimeoutMembers** ao cargo do bot._", "_Give the bot's role the **TimeoutMembers** permission._"]
      : ["_Confira se o cargo do bot está acima do cargo da pessoa._", "_Check that the bot's role sits above the person's._"];
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não consegui silenciar", description: `**Usuário:** <@${alvoId}>\n**Erro:** ${descreverErro(e)}\n\n${dica[0]}`, colour: COR.erro },
      { title: "❌ Couldn't time out", description: `**User:** <@${alvoId}>\n**Error:** ${descreverErro(e, "en")}\n\n${dica[1]}`, colour: COR.erro }));
  }

  const quando = (lang) => { try { return ate.toLocaleString(lang === "en" ? "en-GB" : "pt-BR", { timeZone: process.env.TZ || "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + ` (${process.env.TZ || "UTC"})`; } catch { return ate.toISOString(); } };
  await log.registrar(ctx, "punicoes", { titulo: "🔇 Silenciado (manual)",
    descricao: `<@${alvoId}> silenciado por <@${message.authorId}> por **${duracaoTexto(dur)}**.\n**Motivo:** ${motivo || "_(nenhum)_"}` });
  console.log(`[SILENCIAR] ${message.authorId} -> ${alvoId} | ${duracaoTexto(dur)} | ${motivo}`);
  return sendEmbed(message.channel, tr(ctx, {
    title: "🔇 Ação executada: SILÊNCIO",
    description: [
      `**Usuário:** <@${alvoId}> \`${alvoId}\``,
      `**Tempo:** ${duracaoTexto(dur)}${ms > MAX_MS ? " _(o máximo)_" : ""} — até ${quando("pt")}`,
      `**Motivo:** ${motivo || "_(nenhum informado)_"}`,
      `**Por:** <@${message.authorId}>`,
    ].join("\n"),
    colour: COR.mod,
  }, {
    title: "🔇 Action executed: TIMEOUT",
    description: [
      `**User:** <@${alvoId}> \`${alvoId}\``,
      `**Time:** ${duracaoTexto(dur, "en")}${ms > MAX_MS ? " _(the maximum)_" : ""} — until ${quando("en")}`,
      `**Reason:** ${motivo || "_(none given)_"}`,
      `**By:** <@${message.authorId}>`,
    ].join("\n"),
    colour: COR.mod,
  }));
}
