// ══════════════════════════════════════════════════════════
//  config-comando.js — &config
//  Mostra, num só lugar, TODAS as configurações atuais:
//  automod (módulo a módulo), política de punição, chat de
//  logs, whitelist de convites e os ajustes globais.
//
//  Cuidado deliberado: a blocklist tem milhões de domínios,
//  então mostramos apenas a CONTAGEM, nunca a lista inteira.
// ══════════════════════════════════════════════════════════

import * as db from "../core/db.js";
import { EVENTOS } from "../core/log.js";
import { MODOS as MODOS_BG } from "./ban-global.js";

const on  = (v) => (v ? "🟢" : "🔴");
const sim = (v) => (v ? "sim" : "não");

// Rótulos legíveis dos modos de punição
const MODOS = {
  avisar:    "apenas avisa (não remove nem pune)",
  confirmar: "remove, silencia e espera um moderador",
  acumular:  "soma avisos até banir",
  banir:     "ban imediato",
};

const SENSIBILIDADE = { baixa: "baixa (limiar 8/10)", media: "média (limiar 6/10)", alta: "alta (limiar 4/10)" };

export async function cmdConfig(message, args, ctx) {
  const { config, cfgGlobal, estado, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId } = ctx;

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **ManagePermissions** para ver as configurações.",
      colour: COR.erro,
    });
  }

  const am  = config.automod;
  const pol = am.punicao;
  const lg  = config.log ?? { canalId: null, eventos: {} };

  // ── Módulos do automod ──
  const modulos = [
    `${on(am.antiSpam.enabled)} **antispam** — ${am.antiSpam.maxMessages} msg / ${am.antiSpam.windowMs}ms`,
    `${on(am.antiMassSpam.enabled)} **antimassspam** — ${am.antiMassSpam.maxMessages} msg / ${am.antiMassSpam.windowMs}ms`,
    `${on(am.antiInvite.enabled)} **antiinvite** — bloqueia convites`,
    `${on(am.antiMassMention.enabled)} **antimassmention** — máx. ${am.antiMassMention.maxMentions} menções`,
    `${on(am.antiCaps.enabled)} **anticaps** — ≥${am.antiCaps.minLength} chars e ${Math.round(am.antiCaps.threshold * 100)}% maiúsculas`,
    `${on(am.antiLink.enabled)} **antilink** — ${estado.blockedDomains.size.toLocaleString("pt-BR")} domínio(s) na lista`,
    `${on(am.antiScam.enabled)} **antiscam** — sensibilidade ${SENSIBILIDADE[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`,
  ];

  // ── Punição ──
  const punicao = [
    `**Modo:** \`${pol.modo}\` — ${MODOS[pol.modo] ?? "?"}`,
    pol.modo === "acumular" ? `**Avisos até o ban:** ${pol.warnsParaBan}` : null,
    `**Cargo de silêncio:** ${pol.silenceRoleId ? `\`${pol.silenceRoleId}\`` : "_(não definido)_"}`,
    `**Canal de avisos:** ${am.antiScam.alertChannelId ? `<#${am.antiScam.alertChannelId}>` : "_(canal da própria mensagem)_"}`,
  ].filter(Boolean);

  // ── Chat de logs ──
  const logs = [
    `**Canal:** ${lg.canalId ? `<#${lg.canalId}>` : "_(desativado)_"}`,
    ...Object.keys(EVENTOS).map((k) => `${on(lg.eventos?.[k] !== false)} ${k}`),
  ];

  // ── Punições ativas neste servidor (do banco) ──
  let ativas = "_(nenhuma)_";
  try {
    const linhas = db.getDb()
      .prepare("SELECT userId, avisos, silenciado FROM punicoes WHERE serverId = ? ORDER BY avisos DESC LIMIT 5")
      .all(serverId);
    if (linhas.length) {
      ativas = linhas.map((p) =>
        `• <@${p.userId}> — ${p.avisos} aviso(s)${p.silenciado ? " · 🔇 silenciado" : ""}`).join("\n");
    }
  } catch { /* banco indisponível: segue sem essa seção */ }

  // ── Whitelist de convites ──
  const wl = config.inviteWhitelist?.length
    ? config.inviteWhitelist.map((c) => `\`${c}\``).join(", ")
    : "_(vazia)_";

  await sendEmbed(message.channel, {
    title: "⚙️ Configurações deste servidor",
    description: [
      "**🛡 Módulos do AutoMod**",
      ...modulos,
      "",
      "**⚖️ Punição** *(vale para todos os módulos)*",
      ...punicao,
      "",
      "**📜 Chat de logs**",
      ...logs,
      "",
      "**✅ Convites permitidos**",
      wl,
      "",
      "**🌐 Lista global de banimentos**",
      `**Modo:** \`${config.banGlobal?.modo ?? "off"}\` — ${MODOS_BG[config.banGlobal?.modo ?? "off"]}`,
      `**Na lista:** ${db.usuariosBanidosDistintos()} usuário(s) em ${db.totalBansGlobais()} registro(s)`,
      "",
      "**🎛 Comandos desativados**",
      (config.comandosDesativados?.length ? config.comandosDesativados.map(c=>`\`${c}\``).join(", ") : "_(nenhum)_"),
      "",
      "**🚨 Punições ativas** *(top 5)*",
      ativas,
      "",
      "**🌐 Global** *(compartilhado entre servidores)*",
      `Debug: ${sim(cfgGlobal.debug !== false)} · Listas anti-link: ${cfgGlobal.linkBlocklistSources.length} fonte(s), ${cfgGlobal.linkBlocklistManual.length} domínio(s) manual(is)`,
      "",
      `💡 Ajuste com \`${PREFIXO}automod\`, \`${PREFIXO}punicao\`, \`${PREFIXO}log\`, \`${PREFIXO}scam\` — ou \`${PREFIXO}setup\` para o assistente.`,
    ].join("\n"),
    colour: COR.info,
  });
}
