import { servidorPermitido as temIA } from "../ai/chat.js";

import * as db from "../core/db.js";
import { EVENTOS } from "../core/log.js";
import { MODOS as MODOS_BG, MODOS_EN as MODOS_BG_EN } from "./ban-global.js";
import { escadaDePunicao, rotuloDegrau, GRUPOS_AUTOMOD, estadoDoGrupo } from "./automod-engine.js";
import { tr, lingua } from "../core/i18n.js";
import { servidorNaLista } from "../core/env.js";
import { loja as ecoLoja, totalEmCirculacao as ecoCirc, configDe as ecoConfigDe } from "../ferramentas/economia.js";

const on  = (v) => (v ? "🟢" : "🔴");
const sim = (v) => (v ? "sim" : "não");

// Rótulos legíveis dos modos de punição
const MODOS = {
  avisar:    "apenas avisa (não remove nem pune)",
  apagar:    "remove a mensagem, não pune a pessoa",
  confirmar: "remove, silencia e espera um moderador",
  acumular:  "soma avisos até banir",
  banir:     "ban imediato",
};
const MODOS_EN = {
  avisar:    "warn only (doesn't remove or punish)",
  apagar:    "removes the message, doesn't punish the person",
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

  // Os dois idiomas lado a lado, linha por linha: com duas cópias separadas, o
  // inglês tinha perdido a seção de tickets/webhooks/voz.
  const T = (pt, enTxt) => (en ? enTxt : pt);
  const seg = (ms) => `${Math.round((ms ?? 0) / 100) / 10}s`;


  // Os quatro grupos, cada um com as partes (o detalhe de cada parte é o do filtro de antes)
  const modulos = Object.entries(GRUPOS_AUTOMOD).flatMap(([grupo, def]) => {
    const st = estadoDoGrupo(am, grupo);
    return [
      `${st.ligadas === st.total ? "🟢" : st.ligadas ? "🟡" : "🔴"} **${grupo}** — ${T(def.pt, def.en)} · ${st.ligadas}/${st.total}`,
      // as partes numa linha só (o detalhe de cada uma fica no `&automod <grupo>`)
      `   ${st.partes.map((x) => `${x.ligada ? "✓" : "✗"} \`${x.parte}\``).join(" · ")}`,
    ];
  });

  // ── Punição ──
  const punicao = [
    `${T("**Modo:**", "**Mode:**")} \`${pol.modo}\` — ${L_MODOS[pol.modo] ?? "?"}`,
    pol.modo === "acumular"
      ? `${T("**Escada:**", "**Ladder:**")} ${escadaDePunicao(pol).map((d) => rotuloDegrau(d, lang)).join(" → ")}`
      : null,
    T("**Silêncio:** timeout nativo (precisa de **TimeoutMembers**)", "**Silence:** native timeout (needs **TimeoutMembers**)"),
    `${T("**Sentinela — mais rígido com novatos:**", "**Sentinel — stricter with newcomers:**")} ${am.antiScam.porAntiguidade !== false ? T("🟢 ligado", "🟢 on") : T("🔴 desligado", "🔴 off")}`,
    `${T("**Sentinela — alerta à staff:**", "**Sentinel — staff alerts:**")} ${am.antiScam.alertarAdmin !== false ? T("🟢 ligado", "🟢 on") : T("🔴 desligado", "🔴 off")}`,
    `${T("**Canal de avisos:**", "**Alert channel:**")} ${am.antiScam.alertChannelId ? `<#${am.antiScam.alertChannelId}>` : T("_(canal da própria mensagem)_", "_(the message's own channel)_")}`,
  ].filter(Boolean);

  // ── Canal de log ──
  const logs = [
    `${T("**Canal:**", "**Channel:**")} ${lg.canalId ? `<#${lg.canalId}>` : T("_(desativado)_", "_(disabled)_")}`,
    // o nome da categoria é o que se digita em `&log <categoria> on|off` — vai como código
    Object.keys(EVENTOS).map((k) => `${on(lg.eventos?.[k] !== false)} \`${k}\``).join(" · "),
  ];

  // (2 out 2026) O RPG saiu do &config: ele é um mundo só, configurado pelo dono
  // do bot — nada ali é ajuste deste servidor. Onde se joga é o &acesso; quem
  // quer tirar o jogo daqui usa `&comando desativar game` (aparece nos comandos).
  let ativas = T("_(nenhuma)_", "_(none)_");
  try {
    // Só quem tem aviso ou está silenciado AGORA (o registro antigo de quem
    // já cumpriu o silêncio ficava aparecendo como "silenciado").
    const agora = Date.now();
    const linhas = db.getDb()
      .prepare("SELECT userId, avisos, silenciado, silencioAte FROM punicoes WHERE serverId = ? AND (avisos > 0 OR silenciado = 1) ORDER BY avisos DESC LIMIT 5")
      .all(serverId);
    const vivas = linhas.map((p) => ({ ...p, calado: p.silenciado && (!p.silencioAte || p.silencioAte > agora) }))
      .filter((p) => p.avisos > 0 || p.calado);
    if (vivas.length) {
      ativas = vivas.map((p) => `• <@${p.userId}> — ${p.avisos} ${T("aviso(s)", "warning(s)")}${p.calado ? T(" · 🔇 silenciado", " · 🔇 silenced") : ""}`).join("\n");
    }
  } catch { /* banco indisponível: segue sem essa seção */ }

  // ── Lista de permitidos: domínios (anti-link) e convites (anti-invite) ──
  const wlItens = [
    ...(config.dominiosPermitidos ?? []).map((d) => `\`${d}\``),
    ...(config.inviteWhitelist ?? []).map((cv) => `\`stt.gg/${cv}\``),
  ];
  const wl = wlItens.length ? wlItens.join(", ") : T("_(vazia)_", "_(empty)_");

  // ── O resto que o servidor configura (antes não aparecia aqui) ──
  const nCargosNivel = (() => { try { return db.listarCargosNivel(serverId).length; } catch { return 0; } })();
  const nFeeds = (() => { try { return db.listarFeeds(serverId).length; } catch { return 0; } })();
  const nReacoes = (() => { try { return db.listReactionRolesServidor(serverId).length; } catch { return 0; } })();
  const nFusos = config.fusos?.lista?.length ?? 0;
  const vozAqui = servidorNaLista("TTS_SERVIDORES", serverId);
  const nTickets = (() => { try { return db.listarTickets(serverId).length; } catch { return 0; } })();
  const nGanchos = (() => { try { return db.listarGanchos(serverId).length; } catch { return 0; } })();

  const recursos = [
    `${T("**Idioma:**", "**Language:**")} ${en ? "English" : "Português"} — \`${PREFIXO}idioma\``,
    `${on(config.xp?.enabled)} ${T("**Níveis (XP)**", "**Levels (XP)**")} — ${nCargosNivel} ${T("cargo(s) de nível", "level role(s)")}${config.xp?.canalAnuncio ? ` · ${T("anúncio em", "announced in")} <#${config.xp.canalAnuncio}>` : ""}`,
    `${on(config.autorole?.roleId)} ${T("**Cargo automático**", "**Auto role**")} — ${config.autorole?.roleId ? `<%${config.autorole.roleId}>` : T("_(nenhum)_", "_(none)_")}`,
    `${on(nReacoes)} ${T("**Cargos por reação**", "**Reaction roles**")} — ${nReacoes} ${T("regra(s)", "rule(s)")}`,
    `${on(config.rss?.canalId && nFeeds)} **RSS** — ${nFeeds} feed(s)${config.rss?.canalId ? ` → <#${config.rss.canalId}>` : T(" _(sem canal)_", " _(no channel)_")}`,
    `${on(nFusos)} ${T("**Fusos horários**", "**Time zones**")} — ${nFusos}`,
    (() => {
      let nLoja = 0, circ = { t: 0, n: 0 };
      try { nLoja = ecoLoja(serverId).length; circ = ecoCirc(serverId); } catch {}
      const e = ecoConfigDe(config);
      return `${on(circ.n || nLoja)} ${T("**Economia**", "**Economy**")} — ${e.simbolo} ${e.nome} · ${circ.n} ${T("carteira(s)", "wallet(s)")} · ${nLoja} ${T("cargo(s) na loja", "role(s) in the shop")}`;
    })(),
  ];
  const tickVoz = [
    `${T("**Tickets:**", "**Tickets:**")} ${config.tickets?.painel?.canalId ? `${T("painel", "panel")} <#${config.tickets.painel.canalId}> · ` : ""}${config.tickets?.logCanal ? `log <#${config.tickets.logCanal}> · ${nTickets} ${T("aberto(s)", "open")}` : T(`_(não configurado — \`${PREFIXO}ticket log #canal\`)_`, `_(not set up — \`${PREFIXO}ticket log #channel\`)_`)}`,
    `**Webhooks:** ${nGanchos} ${T("gancho(s)", "hook(s)")} — \`${PREFIXO}webhook lista\``,
    `${T("**Voz e música:**", "**Voice and music:**")} ${!vozAqui
      ? T("_indisponível neste servidor (o dono do bot libera em `TTS_SERVIDORES`)_", "_not available on this server (the bot owner enables it in `TTS_SERVIDORES`)_")
      : config.tts?.ativo && config.tts?.canalVoz ? `🟢 <#${config.tts.canalVoz}>` : T(`🔴 fora da call — \`${PREFIXO}entrar\``, `🔴 not in a call — \`${PREFIXO}entrar\``)}`,
  ];

  await sendEmbed(message.channel, {
    title: T("⚙️ Configurações deste servidor", "⚙️ This server's settings"),
    description: [
      T("**🛡 Módulos do AutoMod**", "**🛡 AutoMod modules**"),
      ...modulos,
      "",
      T("**⚖️ Punição** *(vale para todos os módulos)*", "**⚖️ Punishment** *(applies to every module)*"),
      ...punicao,
      "",
      T("**📜 Canal de log**", "**📜 Log channel**"),
      ...logs,
      "",
      `${T("**✅ Lista de permitidos**", "**✅ Allow list**")} _(\`${PREFIXO}automod whitelist\`)_`,
      wl,
      "",
      T("**🌐 Lista global de banimentos**", "**🌐 Global ban list**"),
      `${T("**Modo:**", "**Mode:**")} \`${config.banGlobal?.modo ?? "off"}\` — ${L_BG[config.banGlobal?.modo ?? "off"]}`,
      `${T("**Na lista:**", "**Listed:**")} ${db.usuariosBanidosDistintos()} ${T("usuário(s) em", "user(s) in")} ${db.totalBansGlobais()} ${T("registro(s)", "record(s)")}`,
      "",
      T("**🎛 Comandos desativados**", "**🎛 Disabled commands**"),
      (config.comandosDesativados?.length ? config.comandosDesativados.map((c) => `\`${c}\``).join(", ") : T("_(nenhum)_", "_(none)_")),
      "",
      T("**🚨 Punições ativas** *(top 5)*", "**🚨 Active punishments** *(top 5)*"),
      ativas,
      "",
      T("**🔐 Acesso aos comandos**", "**🔐 Command access**"),
      `${T("Cargos de staff:", "Staff roles:")} ${config.acesso?.cargosStaff?.length ? config.acesso.cargosStaff.map((r) => `<%${r}>`).join(" ") : T("_(só permissões nativas)_", "_(native permissions only)_")}`,
      `${T("Canais:", "Channels:")} ${(config.acesso?.canais?.modo ?? "todos") === "todos" ? T("qualquer um", "any") : `\`${config.acesso.canais.modo}\` ${config.acesso.canais.lista?.length ? config.acesso.canais.lista.map((c) => `<#${c}>`).join(", ") : T("_(lista vazia)_", "_(empty list)_")}`}`,
      "",
      T("**👋 Entrada e saída**", "**👋 Join and leave**"),
      `${T("Boas-vindas:", "Welcome:")} ${config.boasVindas?.ativo && config.boasVindas?.canalId ? `🟢 <#${config.boasVindas.canalId}>` : T("🔴 desligadas", "🔴 off")}`,
      `${T("Despedida:", "Farewell:")} ${config.adeus?.ativo && config.adeus?.canalId ? `🟢 <#${config.adeus.canalId}>` : T("🔴 desligada", "🔴 off")}`,
      "",
      T("**🧩 Recursos**", "**🧩 Features**"),
      ...recursos,
      "",
      T("**🎫 Tickets · 🪝 Webhooks · 🔊 Voz**", "**🎫 Tickets · 🪝 Webhooks · 🔊 Voice**"),
      ...tickVoz,
      "",
      ...(temIA(serverId) ? [
        T("**🤖 IA (Judy)**", "**🤖 AI (Judy)**"),
        `${T("Conversa livre:", "Free chat:")} ${config.chatLivre?.canais?.length ? config.chatLivre.canais.map((c) => `<#${c}>`).join(", ") + ` (${T("modo", "mode")} \`${config.chatLivre.modo ?? "relevante"}\`)` : T("_(desligada)_", "_(off)_")}`,
        `${T("Comentários espontâneos:", "Spontaneous comments:")} ${config.comentarioEspontaneo?.canalId ? `<#${config.comentarioEspontaneo.canalId}> (${T("até", "up to")} ${config.comentarioEspontaneo.porDia ?? 4}/${T("dia", "day")})` : T("_(desligados)_", "_(off)_")}`,
        `${T("Moderação por IA:", "AI moderation:")} ${config.moderacaoIA?.ativa ? T("🟢 ativa", "🟢 active") : T("🔴 desligada", "🔴 off")}${config.moderacaoIA?.criterios ? "" : T(" _(sem critérios)_", " _(no criteria)_")}`,
        "",
      ] : []),
      T("**🌐 Global** *(compartilhado entre servidores)*", "**🌐 Global** *(shared across servers)*"),
      `Debug: ${simL(cfgGlobal.debug !== false)} · ${T("Listas anti-link:", "Anti-link lists:")} ${cfgGlobal.linkBlocklistSources.length} ${T("fonte(s)", "source(s)")}, ${cfgGlobal.linkBlocklistManual.length} ${T("domínio(s) manual(is)", "manual domain(s)")}`,
      "",
      T(`💡 Ajuste com \`${PREFIXO}automod\` (que reúne blocklist, whitelist, sentinela e punicao) e \`${PREFIXO}log\` — \`${PREFIXO}tutorial\` mostra o caminho, \`${PREFIXO}assistente\` percorre com você.`,
        `💡 Adjust with \`${PREFIXO}automod\` (holds blocklist, whitelist, sentinela and punicao) and \`${PREFIXO}log\` — \`${PREFIXO}tutorial\` shows the path, \`${PREFIXO}assistente\` walks it with you.`),
    ].join("\n"),
    colour: COR.info,
  });
}


// O que cada parte do automod faz, com os números DESTE servidor — usado no
// painel `&automod <grupo>` (no &config as partes saem só pelo nome).
export function descreverFiltro(am, chave, lang = "pt", estado = {}) {
  const en = lang === "en";
  const L_SENS = en ? SENSIBILIDADE_EN : SENSIBILIDADE;
  const T = (pt, enTxt) => (en ? enTxt : pt);
  const seg = (ms) => `${Math.round((ms ?? 0) / 100) / 10}s`;
  const detalhe = {
    antiSpam:        () => T(`${am.antiSpam.maxMessages} msg em ${seg(am.antiSpam.windowMs)}`, `${am.antiSpam.maxMessages} msg in ${seg(am.antiSpam.windowMs)}`),
    antiMassSpam:    () => T(`${am.antiMassSpam.maxMessages} msg em ${seg(am.antiMassSpam.windowMs)}`, `${am.antiMassSpam.maxMessages} msg in ${seg(am.antiMassSpam.windowMs)}`),
    antiDuplicata:   () => T(`${am.antiDuplicata?.maxRepetidas ?? 3}× a mesma mensagem em ${seg(am.antiDuplicata?.windowMs ?? 120000)}`, `${am.antiDuplicata?.maxRepetidas ?? 3}× the same message in ${seg(am.antiDuplicata?.windowMs ?? 120000)}`),
    antiImagem:      () => T("imagens de contas novas descritas pelo modelo de visão; avisa a staff", "images from new accounts described by the vision model; alerts staff"),
    antiInvite:      () => T("bloqueia convites", "blocks invites"),
    antiMassMention: () => T(`máx. ${am.antiMassMention.maxMentions} menções`, `max ${am.antiMassMention.maxMentions} mentions`),
    antiCaps:        () => T(`≥${am.antiCaps.minLength} caracteres e ${Math.round(am.antiCaps.threshold * 100)}% maiúsculas`, `≥${am.antiCaps.minLength} chars and ${Math.round(am.antiCaps.threshold * 100)}% uppercase`),
    antiLink:        () => T(`${(estado?.blockedDomains?.size ?? 0).toLocaleString("pt-BR")} domínio(s) na lista`, `${(estado?.blockedDomains?.size ?? 0).toLocaleString("en-US")} domain(s) listed`),
    antiScam:        () => T(`sensibilidade ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`, `sensitivity ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`),
    antiCaracteres:  () => T("texto distorcido (zalgo) e caracteres invisíveis", "distorted (zalgo) text and invisible characters"),
    antiOdio:        () => T(`ofensas raciais/homofóbicas (de fábrica${am.antiOdio?.termos?.length ? ` + ${am.antiOdio.termos.length}` : ""})`, `racial/homophobic slurs (built-in${am.antiOdio?.termos?.length ? ` + ${am.antiOdio.termos.length}` : ""})`),
    antiEmoji:       () => T(`${am.antiEmoji?.maxEmojis ?? 20}+ emojis numa mensagem`, `${am.antiEmoji?.maxEmojis ?? 20}+ emojis in one message`),
    antiMidia:       () => T(`mais de ${am.antiMidia?.maxPorMinuto ?? 8} anexos/min (conta nova: ${am.antiMidia?.maxNovato ?? 3})`, `over ${am.antiMidia?.maxPorMinuto ?? 8} attachments/min (new account: ${am.antiMidia?.maxNovato ?? 3})`),
    antiRepeticao:   () => T(`mais de ${am.antiRepeticao?.maxRepeticao ?? 15} caracteres repetidos${am.antiRepeticao?.ignorar ? ` (ignora \`${am.antiRepeticao.ignorar}\`)` : ""}`, `over ${am.antiRepeticao?.maxRepeticao ?? 15} repeated characters${am.antiRepeticao?.ignorar ? ` (ignores \`${am.antiRepeticao.ignorar}\`)` : ""}`),
  };  return detalhe[chave]?.() ?? "";
}
