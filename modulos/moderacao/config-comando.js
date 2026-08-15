import { servidorPermitido as temIA } from "../ai/chat.js";
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
import { MODOS as MODOS_BG, MODOS_EN as MODOS_BG_EN } from "./ban-global.js";
import { tr, lingua } from "../core/i18n.js";
import * as MAG from "../game/magias.js";
import * as PERFIS_MOEDA from "../game/moedas-perfis.js";

const on  = (v) => (v ? "🟢" : "🔴");
const sim = (v) => (v ? "sim" : "não");

// Rótulos legíveis dos modos de punição
const MODOS = {
  avisar:    "apenas avisa (não remove nem pune)",
  confirmar: "remove, silencia e espera um moderador",
  acumular:  "soma avisos até banir",
  banir:     "ban imediato",
};
const MODOS_EN = {
  avisar:    "warn only (doesn't remove or punish)",
  confirmar: "removes, silences and waits for a moderator",
  acumular:  "stacks warnings until a ban",
  banir:     "instant ban",
};

const SENSIBILIDADE = { baixa: "baixa (limiar 8/10)", media: "média (limiar 6/10)", alta: "alta (limiar 4/10)" };
const SENSIBILIDADE_EN = { baixa: "low (threshold 8/10)", media: "medium (threshold 6/10)", alta: "high (threshold 4/10)" };

export async function cmdConfig(message, args, ctx) {
  const { config, cfgGlobal, estado, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  const L_MODOS = en ? MODOS_EN : MODOS;
  const L_SENS = en ? SENSIBILIDADE_EN : SENSIBILIDADE;
  const L_BG = en ? MODOS_BG_EN : MODOS_BG;
  const simL = (v) => en ? (v ? "yes" : "no") : (v ? "sim" : "não");

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **ManagePermissions** para ver as configurações.",
      colour: COR.erro,
    }, {
      title: "🚫 Missing permission",
      description: "You need the **ManagePermissions** permission to view the settings.",
      colour: COR.erro,
    }));
  }

  const am  = config.automod;
  const pol = am.punicao;
  const lg  = config.log ?? { canalId: null, eventos: {} };

  // ── Módulos do automod ──
  const modulos = en ? [
    `${on(am.antiSpam.enabled)} **antispam** — ${am.antiSpam.maxMessages} msg / ${am.antiSpam.windowMs}ms`,
    `${on(am.antiMassSpam.enabled)} **antimassspam** — ${am.antiMassSpam.maxMessages} msg / ${am.antiMassSpam.windowMs}ms`,
    `${on(am.antiInvite.enabled)} **antiinvite** — blocks invites`,
    `${on(am.antiMassMention.enabled)} **antimassmention** — max ${am.antiMassMention.maxMentions} mentions`,
    `${on(am.antiCaps.enabled)} **anticaps** — ≥${am.antiCaps.minLength} chars and ${Math.round(am.antiCaps.threshold * 100)}% uppercase`,
    `${on(am.antiLink.enabled)} **antilink** — ${estado.blockedDomains.size.toLocaleString("en-US")} domain(s) listed`,
    `${on(am.antiScam.enabled)} **antiscam** — sensitivity ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`,
  ] : [
    `${on(am.antiSpam.enabled)} **antispam** — ${am.antiSpam.maxMessages} msg / ${am.antiSpam.windowMs}ms`,
    `${on(am.antiMassSpam.enabled)} **antimassspam** — ${am.antiMassSpam.maxMessages} msg / ${am.antiMassSpam.windowMs}ms`,
    `${on(am.antiInvite.enabled)} **antiinvite** — bloqueia convites`,
    `${on(am.antiMassMention.enabled)} **antimassmention** — máx. ${am.antiMassMention.maxMentions} menções`,
    `${on(am.antiCaps.enabled)} **anticaps** — ≥${am.antiCaps.minLength} chars e ${Math.round(am.antiCaps.threshold * 100)}% maiúsculas`,
    `${on(am.antiLink.enabled)} **antilink** — ${estado.blockedDomains.size.toLocaleString("pt-BR")} domínio(s) na lista`,
    `${on(am.antiScam.enabled)} **antiscam** — sensibilidade ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`,
  ];

  // ── Punição ──
  const punicao = (en ? [
    `**Mode:** \`${pol.modo}\` — ${L_MODOS[pol.modo] ?? "?"}`,
    pol.modo === "acumular" ? `**Warnings until ban:** ${pol.warnsParaBan}` : null,
    `**Silence role:** ${pol.silenceRoleId ? `\`${pol.silenceRoleId}\`` : "_(not set)_"}`,
    `**Alert channel:** ${am.antiScam.alertChannelId ? `<#${am.antiScam.alertChannelId}>` : "_(the message's own channel)_"}`,
  ] : [
    `**Modo:** \`${pol.modo}\` — ${L_MODOS[pol.modo] ?? "?"}`,
    pol.modo === "acumular" ? `**Avisos até o ban:** ${pol.warnsParaBan}` : null,
    `**Cargo de silêncio:** ${pol.silenceRoleId ? `\`${pol.silenceRoleId}\`` : "_(não definido)_"}`,
    `**Canal de avisos:** ${am.antiScam.alertChannelId ? `<#${am.antiScam.alertChannelId}>` : "_(canal da própria mensagem)_"}`,
  ]).filter(Boolean);

  // ── Chat de logs ──
  const logs = [
    en
      ? `**Channel:** ${lg.canalId ? `<#${lg.canalId}>` : "_(disabled)_"}`
      : `**Canal:** ${lg.canalId ? `<#${lg.canalId}>` : "_(desativado)_"}`,
    ...Object.keys(EVENTOS).map((k) => `${on(lg.eventos?.[k] !== false)} ${k}`),
  ];

  // ── Punições ativas neste servidor (do banco) ──
  // ── RPG e economia ──
  // Quem administra pergunta "quantas moedas tem, qual é a principal, e o
  // câmbio está de pé?" — antes era preciso sair do &config para descobrir.
  const moedas = (() => { try { return db.listarMoedas(serverId) ?? []; } catch { return []; } })();
  const padraoMoeda = moedas.find((m) => m.padrao) ?? moedas[0] ?? null;
  const nJogadores = (() => { try { return db.listarPersonagens(serverId, 9999)?.length ?? null; } catch { return null; } })();
  const nMagias = MAG.CATALOGO.length;
  const nCapturados = (() => { try { return db.listarCapturados(serverId)?.length ?? 0; } catch { return 0; } })();
  const nFollowers = (() => {
    try {
      return db.listarPersonagens(serverId, 9999)
        .reduce((t, x) => t + (db.listarFollowersDe(serverId, x.userId)?.length ?? 0), 0);
    } catch { return 0; }
  })();
  const economia = moedas.length ? (en ? [
    `**Currencies:** ${moedas.length} — ${moedas.map((m) => `${m.simbolo}${m.id}`).join(" · ")}`,
    `**Main:** ${padraoMoeda ? `${padraoMoeda.simbolo} ${padraoMoeda.nome}` : "_(none)_"}  ·  prices are shown in it`,
    `**Exchange:** ${moedas.length > 1 ? `🟢 on — bank and player counter (\`${PREFIXO}game cambio\`)` : "🔴 needs at least 2 currencies"}`,
    `**Catalog:** ${PERFIS_MOEDA.PERFIS.length} ready-made profiles — add with \`${PREFIXO}game admin moeda perfil\``,
    nJogadores != null ? `**Characters:** ${nJogadores}` : null,
    `**Magic:** ${nMagias} spell(s) in the catalog · learned with \`${PREFIXO}game aprender\``,
    `**Companions:** ${nFollowers} in play${nCapturados ? ` · ${nCapturados} captured (rescued on missions)` : ""}`,
  ] : [
    `**Moedas:** ${moedas.length} — ${moedas.map((m) => `${m.simbolo}${m.id}`).join(" · ")}`,
    `**Principal:** ${padraoMoeda ? `${padraoMoeda.simbolo} ${padraoMoeda.nome}` : "_(nenhuma)_"}  ·  os preços aparecem nela`,
    `**Câmbio:** ${moedas.length > 1 ? `🟢 ativo — banco e balcão (\`${PREFIXO}game cambio\`)` : "🔴 precisa de ao menos 2 moedas"}`,
    `**Catálogo:** ${PERFIS_MOEDA.PERFIS.length} perfis prontos — some com \`${PREFIXO}game admin moeda perfil\``,
    nJogadores != null ? `**Personagens:** ${nJogadores}` : null,
    `**Magia:** ${nMagias} magia(s) no catálogo · aprendidas com \`${PREFIXO}game aprender\``,
    `**Companheiros:** ${nFollowers} em jogo${nCapturados ? ` · ${nCapturados} capturado(s) (resgate nas missões)` : ""}`,
  ]).filter(Boolean) : [en
    ? "_No currency yet — one is born as soon as someone plays._"
    : "_Nenhuma moeda ainda — uma nasce assim que alguém jogar._"];

  let ativas = en ? "_(none)_" : "_(nenhuma)_";
  try {
    const linhas = db.getDb()
      .prepare("SELECT userId, avisos, silenciado FROM punicoes WHERE serverId = ? ORDER BY avisos DESC LIMIT 5")
      .all(serverId);
    if (linhas.length) {
      ativas = linhas.map((p) => en
        ? `• <@${p.userId}> — ${p.avisos} warning(s)${p.silenciado ? " · 🔇 silenced" : ""}`
        : `• <@${p.userId}> — ${p.avisos} aviso(s)${p.silenciado ? " · 🔇 silenciado" : ""}`).join("\n");
    }
  } catch { /* banco indisponível: segue sem essa seção */ }

  // ── Whitelist de convites ──
  const wl = config.inviteWhitelist?.length
    ? config.inviteWhitelist.map((c) => `\`${c}\``).join(", ")
    : (en ? "_(empty)_" : "_(vazia)_");

  await sendEmbed(message.channel, en ? {
    title: "⚙️ This server's settings",
    description: [
      "**🛡 AutoMod modules**",
      ...modulos,
      "",
      "**⚖️ Punishment** *(applies to every module)*",
      ...punicao,
      "",
      "**📜 Log channel**",
      ...logs,
      "",
      "**✅ Allowed invites**",
      wl,
      "",
      "**🌐 Global ban list**",
      `**Mode:** \`${config.banGlobal?.modo ?? "off"}\` — ${L_BG[config.banGlobal?.modo ?? "off"]}`,
      `**Listed:** ${db.usuariosBanidosDistintos()} user(s) in ${db.totalBansGlobais()} record(s)`,
      "",
      "**🎛 Disabled commands**",
      (config.comandosDesativados?.length ? config.comandosDesativados.map(c=>`\`${c}\``).join(", ") : "_(none)_"),
      "",
      "**🚨 Active punishments** *(top 5)*",
      ativas,
      "",
      "**🎲 RPG and economy**",
      ...economia,
      "",
      "**🔐 Command access**",
      `Staff roles: ${config.acesso?.cargosStaff?.length ? config.acesso.cargosStaff.map((r)=>`<%${r}>`).join(" ") : "_(native permissions only)_"}`,
      `Channels: ${(config.acesso?.canais?.modo ?? "todos") === "todos" ? "any" : `\`${config.acesso.canais.modo}\` ${config.acesso.canais.lista?.length ? config.acesso.canais.lista.map((c)=>`<#${c}>`).join(", ") : "_(empty list)_"}`}`,
      "",
      ...(temIA(serverId) ? [
        "**🤖 AI (Judy)**",
        `Free chat: ${config.chatLivre?.canais?.length ? config.chatLivre.canais.map((c)=>`<#${c}>`).join(", ") + ` (mode \`${config.chatLivre.modo ?? "relevante"}\`)` : "_(off)_"}`,
        `Spontaneous comments: ${config.comentarioEspontaneo?.canalId ? `<#${config.comentarioEspontaneo.canalId}> (up to ${config.comentarioEspontaneo.porDia ?? 4}/day)` : "_(off)_"}`,
        `AI moderation: ${config.moderacaoIA?.ativa ? "🟢 active" : "🔴 off"}${config.moderacaoIA?.criterios ? "" : " _(no criteria)_"}`,
        "",
      ] : []),
      "**🌐 Global** *(shared across servers)*",
      `Debug: ${simL(cfgGlobal.debug !== false)} · Anti-link lists: ${cfgGlobal.linkBlocklistSources.length} source(s), ${cfgGlobal.linkBlocklistManual.length} manual domain(s)`,
      "",
      `💡 Adjust with \`${PREFIXO}automod\`, \`${PREFIXO}punicao\`, \`${PREFIXO}log\`, \`${PREFIXO}scam\` — and \`${PREFIXO}tutorial\` shows the full path.`,
    ].join("\n"),
    colour: COR.info,
  } : {
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
      `**Modo:** \`${config.banGlobal?.modo ?? "off"}\` — ${L_BG[config.banGlobal?.modo ?? "off"]}`,
      `**Na lista:** ${db.usuariosBanidosDistintos()} usuário(s) em ${db.totalBansGlobais()} registro(s)`,
      "",
      "**🎛 Comandos desativados**",
      (config.comandosDesativados?.length ? config.comandosDesativados.map(c=>`\`${c}\``).join(", ") : "_(nenhum)_"),
      "",
      "**🚨 Punições ativas** *(top 5)*",
      ativas,
      "",
      "**🎲 RPG e economia**",
      ...economia,
      "",
      "**🔐 Acesso aos comandos**",
      `Cargos de staff: ${config.acesso?.cargosStaff?.length ? config.acesso.cargosStaff.map((r)=>`<%${r}>`).join(" ") : "_(só permissões nativas)_"}`,
      `Canais: ${(config.acesso?.canais?.modo ?? "todos") === "todos" ? "qualquer um" : `\`${config.acesso.canais.modo}\` ${config.acesso.canais.lista?.length ? config.acesso.canais.lista.map((c)=>`<#${c}>`).join(", ") : "_(lista vazia)_"}`}`,
      "",
      ...(temIA(serverId) ? [
        "**🤖 IA (Judy)**",
        `Conversa livre: ${config.chatLivre?.canais?.length ? config.chatLivre.canais.map((c)=>`<#${c}>`).join(", ") + ` (modo \`${config.chatLivre.modo ?? "relevante"}\`)` : "_(desligada)_"}`,
        `Comentários espontâneos: ${config.comentarioEspontaneo?.canalId ? `<#${config.comentarioEspontaneo.canalId}> (até ${config.comentarioEspontaneo.porDia ?? 4}/dia)` : "_(desligados)_"}`,
        `Moderação por IA: ${config.moderacaoIA?.ativa ? "🟢 ativa" : "🔴 desligada"}${config.moderacaoIA?.criterios ? "" : " _(sem critérios)_"}`,
        "",
      ] : []),
      "**🌐 Global** *(compartilhado entre servidores)*",
      `Debug: ${simL(cfgGlobal.debug !== false)} · Listas anti-link: ${cfgGlobal.linkBlocklistSources.length} fonte(s), ${cfgGlobal.linkBlocklistManual.length} domínio(s) manual(is)`,
      "",
      `💡 Ajuste com \`${PREFIXO}automod\`, \`${PREFIXO}punicao\`, \`${PREFIXO}log\`, \`${PREFIXO}scam\` — e \`${PREFIXO}tutorial\` mostra o caminho completo.`,
    ].join("\n"),
    colour: COR.info,
  });
}
