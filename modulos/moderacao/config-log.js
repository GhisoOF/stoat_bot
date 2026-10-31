// &config log (era &log) — o canal de log e os eventos registrados nele.
// (P2, 31 out 2026) saiu do core/log.js: o core não tem handler de comando. As
// novidades da Judy vão SEMPRE ao canal de log (saiu o `atualizacoes on|off`).

import { tr, idiomaDe } from "../core/i18n.js";
import { citar, subExibido } from "../core/aliases.js";
import { resolverCanal } from "../core/ids.js";
import { EVENTOS, EVENTOS_EN, EVENTOS_ES } from "../core/log.js";
import { canalDeOutroServidor } from "./pertence.js";

const sem = (ctx, pt, en, es) => ({ description: tr(ctx, pt, en, es), colour: ctx.COR.erro });

export async function cmdLog(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO: P } = ctx;
  const idioma = idiomaDe(ctx);
  const ROTULOS = idioma === "es" ? EVENTOS_ES : idioma === "en" ? EVENTOS_EN : EVENTOS;
  const nome = (k) => subExibido("config.log", k, idioma);   // `mensagens` → `messages` / `mensajes`
  const ajuda = (l) => `\`${citar("help", l, P)} ${citar("config.log", l, "").trim()}\``;
  const usoErrado = (pt, en, es) => sendEmbed(message.channel, sem(ctx, `${pt} ${ajuda("pt")}`, `${en} ${ajuda("en")}`, `${es} ${ajuda("es")}`));

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, sem(ctx, "🚫 Precisa de **ManagePermissions**.", "🚫 Needs **ManagePermissions**.", "🚫 Necesita **ManagePermissions**."));
  }

  config.log ??= { canalId: null, eventos: {} };
  config.log.eventos ??= {};
  const sub = args[0]?.toLowerCase();

  // ── sozinho: o estado ──
  if (!sub) {
    const canal = config.log.canalId ? `<#${config.log.canalId}>` : tr(ctx, "_(nenhum)_", "_(none)_", "_(ninguno)_");
    const linhas = Object.keys(EVENTOS).map((k) => `${config.log.eventos[k] !== false ? "🟢" : "🔴"} **${nome(k)}** — ${ROTULOS[k]}`);
    linhas.push(`${config.relatorioDono ? "🟢" : "🔴"} **${nome("relatorio")}** — ${tr(ctx,
      "relatório anônimo de ataques ao dono da Judy",
      "anonymous attack report to Judy's owner",
      "informe anónimo de ataques al dueño de Judy")}`);
    return sendEmbed(message.channel, {
      title: tr(ctx, "📜 Canal de log", "📜 Log channel", "📜 Canal de registro"),
      description: [`${tr(ctx, "**Canal:**", "**Channel:**", "**Canal:**")} ${canal}`, "", ...linhas].join("\n"),
      colour: COR.mod,
    });
  }

  if (sub === "off") {
    config.log.canalId = null;
    salvarConfig();
    return sendEmbed(message.channel, { description: tr(ctx, "📜 Log desligado.", "📜 Log off.", "📜 Registro desactivado."), colour: COR.mod });
  }

  // (P2) as novidades vão sempre ao log: o subcomando antigo só mostra isso
  if (sub === "atualizacoes") {
    return sendEmbed(message.channel, { description: tr(ctx,
      "🆕 As novidades da Judy vão sempre ao canal de log.",
      "🆕 Judy's news always goes to the log channel.",
      "🆕 Las novedades de Judy van siempre al canal de registro."), colour: COR.mod });
  }

  // relatório anônimo de ataques ao dono da Judy (privacidade P4)
  if (sub === "relatorio") {
    const v = args[1]?.toLowerCase();
    if (v && v !== "on" && v !== "off") return usoErrado("❌ Use `on` ou `off`.", "❌ Use `on` or `off`.", "❌ Usa `on` u `off`.");
    if (v) { config.relatorioDono = v === "on"; salvarConfig(); }
    const on = !!config.relatorioDono;
    return sendEmbed(message.channel, { colour: COR.mod, description: tr(ctx,
      `🛰️ Relatório anônimo de ataques: **${on ? "ligado 🟢" : "desligado 🔴"}**`,
      `🛰️ Anonymous attack report: **${on ? "on 🟢" : "off 🔴"}**`,
      `🛰️ Informe anónimo de ataques: **${on ? "activado 🟢" : "desactivado 🔴"}**`) });
  }

  // ── <evento> on|off ──
  if (Object.hasOwn(EVENTOS, sub)) {
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off") return usoErrado("❌ Use `on` ou `off`.", "❌ Use `on` or `off`.", "❌ Usa `on` u `off`.");
    config.log.eventos[sub] = v === "on";
    salvarConfig();
    return sendEmbed(message.channel, { colour: COR.mod, description: `📜 **${nome(sub)}**: ${v === "on" ? "🟢" : "🔴"}` });
  }

  // ── canal: `canal <#x|aqui|id|nome>`, ou o canal direto ──
  let alvoBruto = args[0];
  if (sub === "canal") alvoBruto = args[1] ?? "here";
  const id = ["here", "aqui"].includes(String(alvoBruto).toLowerCase())
    ? message.channelId
    : resolverCanal(alvoBruto, { message, server });
  if (!id) return usoErrado(`❌ Não achei o canal \`${String(alvoBruto).slice(0, 40)}\`.`, `❌ Couldn't find the channel \`${String(alvoBruto).slice(0, 40)}\`.`, `❌ No encontré el canal \`${String(alvoBruto).slice(0, 40)}\`.`);
  const canal = ctx.client.channels.get(id) ?? await ctx.client.channels.fetch(id).catch(() => null);
  if (!canal) return sendEmbed(message.channel, sem(ctx, "❌ Não consigo acessar esse canal.", "❌ I can't access that channel.", "❌ No puedo acceder a ese canal."));
  if (canalDeOutroServidor(canal, ctx.serverId)) return sendEmbed(message.channel, sem(ctx, "🚫 Esse canal é de outro servidor.", "🚫 That channel belongs to another server.", "🚫 Ese canal es de otro servidor."));
  config.log.canalId = id;
  salvarConfig();
  return sendEmbed(message.channel, { colour: COR.mod, description: tr(ctx, `📜 Log em <#${id}>.`, `📜 Log in <#${id}>.`, `📜 Registro en <#${id}>.`) });
}
