import { iaDisponivel as temIA, comandoIAPermitido, chatLigadoAqui, imagemLigadaAqui } from "../ai/chat.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";

import * as db from "../core/db.js";
import { EVENTOS } from "../core/log.js";
import { nomeGrupo, nomeParte, nomeModo, nomeEventoLog } from "../core/nomes-automod.js";
import { MODOS as MODOS_BG, MODOS_EN as MODOS_BG_EN, modoDe as modoBanGlobal, MINIMO_CONSENSO } from "./ban-global.js";
import { escadaDePunicao, rotuloDegrau, GRUPOS_AUTOMOD, estadoDoGrupo, validadeDosAvisos } from "./automod-engine.js";
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
const MODOS_ES = {
  avisar:    "solo avisa (no borra ni castiga)",
  apagar:    "borra el mensaje, no castiga a la persona",
  confirmar: "borra, silencia y espera a un moderador",
  acumular:  "suma avisos hasta banear",
  banir:     "ban inmediato",
};

const SENSIBILIDADE = { baixa: "baixa (limiar 7,5/10)", media: "média (limiar 6,5/10)", alta: "alta (limiar 5,5/10)" };
const SENSIBILIDADE_EN = { baixa: "low (threshold 7.5/10)", media: "medium (threshold 6.5/10)", alta: "high (threshold 5.5/10)" };
const SENSIBILIDADE_ES = { baixa: "baja (umbral 7,5/10)", media: "media (umbral 6,5/10)", alta: "alta (umbral 5,5/10)" };

// O espanhol do que mora em outros arquivos (a descrição dos grupos do automod e
// os modos da lista global, que só têm pt e en)
const GRUPO_DESC_ES = {
  antispam: "avalancha de mensajes",
  antiruido: "texto contaminado",
  antilink: "enlaces e invitaciones",
  sentinela: "contenido dañino (estafas, +18, gore, odio, imágenes, temas prohibidos, foto de perfil)",
};
const MODOS_BG_ES = {
  off:      "ignora la lista global",
  avisar:   "alerta a los moderadores cuando entra un baneado",
  imediato: "banea a quien fue baneado en **cualquier** otro servidor (basta 1 ban)",
  consenso: `banea solo a quien fue baneado en **${MINIMO_CONSENSO}+ servidores distintos**; con menos, solo avisa al staff`,
};
// um mapa de rótulos com o espanhol marcado como pronto
const prontos = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, trechoPronto(v)]));

export async function cmdConfig(message, args, ctx) {
  const { config, cfgGlobal, estado, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  const L_MODOS = tr(ctx, MODOS, MODOS_EN, prontos(MODOS_ES));
  const L_SENS = en ? SENSIBILIDADE_EN : SENSIBILIDADE;
  const L_BG = tr(ctx, MODOS_BG, MODOS_BG_EN, prontos(MODOS_BG_ES));
  const simL = (v) => tr(ctx, v ? "sim" : "não", v ? "yes" : "no", v ? "sí" : "no");

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
    }, {
      title: "🚫 Permiso insuficiente",
      description: "Necesitas el permiso **ManagePermissions** para ver la configuración.",
      colour: COR.erro,
    }));
  }

  const am  = config.automod;
  const pol = am.punicao;
  const lg  = config.log ?? { canalId: null, eventos: {} };

  // Os dois idiomas lado a lado, linha por linha: com duas cópias separadas, o
  // inglês tinha perdido a seção de tickets/webhooks/voz.
  const T = (pt, enTxt, es) => tr(ctx, pt, enTxt, es);
  const seg = (ms) => `${Math.round((ms ?? 0) / 100) / 10}s`;


  // Os quatro grupos, cada um com as partes (o detalhe de cada parte é o do filtro de antes)
  const modulos = Object.entries(GRUPOS_AUTOMOD).flatMap(([grupo, def]) => {
    const st = estadoDoGrupo(am, grupo);
    return [
      `${st.ligadas === st.total ? "🟢" : st.ligadas ? "🟡" : "🔴"} **${nomeGrupo(grupo, lang)}** — ${T(def.pt, def.en, def.es ?? GRUPO_DESC_ES[grupo])} · ${st.ligadas}/${st.total}`
        // punição própria do grupo (quando alguma parte não herda a geral)
        + (() => { const ms = [...new Set(st.partes.map((x) => am[x.chave]?.punicao?.modo).filter(Boolean))]; return ms.length ? ` · ${T("punição", "punishment", "castigo")} ${ms.map((m) => `\`${nomeModo(m, lang)}\``).join("/")}` : ""; })(),
      // as partes numa linha só (o detalhe de cada uma fica no `&automod <grupo>`)
      `   ${st.partes.map((x) => `${x.ligada ? "✓" : "✗"} \`${nomeParte(x.parte, lang)}\``).join(" · ")}`,
    ];
  });

  // ── Punição ──
  const punicao = [
    `${T("**Modo:**", "**Mode:**", "**Modo:**")} \`${nomeModo(pol.modo, lang)}\` — ${L_MODOS[pol.modo] ?? "?"}`,
    pol.modo === "acumular"
      ? `${T("**Escada:**", "**Ladder:**", "**Escalera:**")} ${escadaDePunicao(pol).map((d) => rotuloDegrau(d, lang)).join(" → ")}`
      : null,
    pol.modo === "acumular"
      ? (validadeDosAvisos(pol)
        ? T(`**Avisos vencem:** ${Math.round(validadeDosAvisos(pol) / 86_400_000)} dias sem um novo · **ruído:** 1º deslize = só um toque`,
            `**Warnings expire:** ${Math.round(validadeDosAvisos(pol) / 86_400_000)} days without a new one · **noise:** 1st slip = just a heads-up`,
            `**Los avisos vencen:** ${Math.round(validadeDosAvisos(pol) / 86_400_000)} días sin uno nuevo · **ruido:** 1.er desliz = solo un toque`)
        : T("**Avisos vencem:** nunca · **ruído:** 1º deslize = só um toque", "**Warnings expire:** never · **noise:** 1st slip = just a heads-up", "**Los avisos vencen:** nunca · **ruido:** 1.er desliz = solo un toque"))
      : null,
    T("**Silêncio:** timeout nativo (precisa de **TimeoutMembers**)", "**Silence:** native timeout (needs **TimeoutMembers**)", "**Silencio:** timeout nativo (necesita **TimeoutMembers**)"),
    `${T("**Sentinela — mais rígido com novatos:**", "**Sentinel — stricter with newcomers:**", "**Centinela — más estricto con los recién llegados:**")} ${am.antiScam.porAntiguidade !== false ? T("🟢 ligado", "🟢 on", "🟢 activado") : T("🔴 desligado", "🔴 off", "🔴 desactivado")}`,
    `${T("**Sentinela — alerta à staff:**", "**Sentinel — staff alerts:**", "**Centinela — alerta al staff:**")} ${am.antiScam.alertarAdmin !== false ? T("🟢 ligado", "🟢 on", "🟢 activado") : T("🔴 desligado", "🔴 off", "🔴 desactivado")}`,
    `${T("**Canal de avisos:**", "**Alert channel:**", "**Canal de alertas:**")} ${am.antiScam.alertChannelId ? `<#${am.antiScam.alertChannelId}>` : T("_(canal da própria mensagem)_", "_(the message's own channel)_", "_(el canal del propio mensaje)_")}`,
  ].filter(Boolean);

  // ── Canal de log ──
  const logs = [
    `${T("**Canal:**", "**Channel:**", "**Canal:**")} ${lg.canalId ? `<#${lg.canalId}>` : T("_(desativado)_", "_(disabled)_", "_(desactivado)_")}`,
    // o nome da categoria é o que se digita em `&log <categoria> on|off` — vai como código
    Object.keys(EVENTOS).map((k) => `${on(lg.eventos?.[k] !== false)} \`${nomeEventoLog(k, lang)}\``).join(" · "),
  ];

  // (2 out 2026) O RPG saiu do &config: ele é um mundo só, configurado pelo dono
  // do bot — nada ali é ajuste deste servidor. Onde se joga é o &acesso; quem
  // quer tirar o jogo daqui usa `&comando desativar game` (aparece nos comandos).
  let ativas = T("_(nenhuma)_", "_(none)_", "_(ninguna)_");
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
      ativas = vivas.map((p) => `• <@${p.userId}> — ${p.avisos} ${T("aviso(s)", "warning(s)", "aviso(s)")}${p.calado ? T(" · 🔇 silenciado", " · 🔇 silenced", " · 🔇 silenciado") : ""}`).join("\n");
    }
  } catch { /* banco indisponível: segue sem essa seção */ }

  // ── Lista de permitidos: domínios (anti-link) e convites (anti-invite) ──
  const wlItens = [
    ...(config.dominiosPermitidos ?? []).map((d) => `\`${d}\``),
    ...(config.inviteWhitelist ?? []).map((cv) => `\`stt.gg/${cv}\``),
    // (21 out 2026) os canais de divulgação: lá, convites podem
    ...(config.automod?.antiInvite?.canaisLiberados ?? []).map((c) => `<#${c}> ${T("_(convites)_", "_(invites)_", "_(invitaciones)_")}`),
  ];
  const wl = wlItens.length ? wlItens.join(", ") : T("_(vazia)_", "_(empty)_", "_(vacía)_");

  // ── O resto que o servidor configura (antes não aparecia aqui) ──
  const nCargosNivel = (() => { try { return db.listarCargosNivel(serverId).length; } catch { return 0; } })();
  const nFeeds = (() => { try { return db.listarFeeds(serverId).length; } catch { return 0; } })();
  const nReacoes = (() => { try { return db.listReactionRolesServidor(serverId).length; } catch { return 0; } })();
  const nFusos = config.fusos?.lista?.length ?? 0;
  const vozAqui = servidorNaLista("TTS_SERVIDORES", serverId);
  const nTickets = (() => { try { return db.listarTickets(serverId).length; } catch { return 0; } })();
  const nGanchos = (() => { try { return db.listarGanchos(serverId).length; } catch { return 0; } })();

  const recursos = [
    `${T("**Idioma:**", "**Language:**", "**Idioma:**")} ${tr(ctx, "Português", "English", "Español")} — \`${citar("idioma", lang, PREFIXO)}\``,
    `${on(config.xp?.enabled)} ${T("**Níveis (XP)**", "**Levels (XP)**", "**Niveles (XP)**")} — ${nCargosNivel} ${T("cargo(s) de nível", "level role(s)", "rol(es) de nivel")}${config.xp?.canalAnuncio ? ` · ${T("anúncio em", "announced in", "anuncio en")} <#${config.xp.canalAnuncio}>` : ""}`,
    `${on(config.autorole?.roleId)} ${T("**Cargo automático**", "**Auto role**", "**Rol automático**")} — ${config.autorole?.roleId ? `<%${config.autorole.roleId}>` : T("_(nenhum)_", "_(none)_", "_(ninguno)_")}`,
    `${on(nReacoes)} ${T("**Cargos por reação**", "**Reaction roles**", "**Roles por reacción**")} — ${nReacoes} ${T("regra(s)", "rule(s)", "regla(s)")}`,
    `${on(config.rss?.canalId && nFeeds)} **RSS** — ${nFeeds} feed(s)${config.rss?.canalId ? ` → <#${config.rss.canalId}>` : T(" _(sem canal)_", " _(no channel)_", " _(sin canal)_")}`,
    `${on(nFusos)} ${T("**Fusos horários**", "**Time zones**", "**Husos horarios**")} — ${nFusos}`,
    (() => {
      let nLoja = 0, circ = { t: 0, n: 0 };
      try { nLoja = ecoLoja(serverId).length; circ = ecoCirc(serverId); } catch {}
      const e = ecoConfigDe(config);
      return `${on(circ.n || nLoja)} ${T("**Economia**", "**Economy**", "**Economía**")} — ${e.simbolo} ${e.nome} · ${circ.n} ${T("carteira(s)", "wallet(s)", "cartera(s)")} · ${nLoja} ${T("cargo(s) na loja", "role(s) in the shop", "rol(es) en la tienda")}`;
    })(),
  ];
  const tickVoz = [
    `${T("**Tickets:**", "**Tickets:**", "**Tickets:**")} ${config.tickets?.painel?.canalId ? `${T("painel", "panel", "panel")} <#${config.tickets.painel.canalId}> · ` : ""}${config.tickets?.logCanal ? `log <#${config.tickets.logCanal}> · ${nTickets} ${T("aberto(s)", "open", "abierto(s)")}${config.tickets?.cargoEquipe ? ` · ${T("equipe", "team", "equipo")} <%${config.tickets.cargoEquipe}>` : ""}` : T(`_(não configurado — \`${citarInterno("ticket", PREFIXO)} log #canal\`)_`, `_(not set up — \`${citarInterno("ticket", PREFIXO)} log #channel\`)_`, `_(sin configurar — \`${citar("ticket", "es", PREFIXO)} log #canal\`)_`)}`,
    `**Webhooks:** ${nGanchos} ${T("gancho(s)", "hook(s)", "gancho(s)")} — \`${citar("webhook.lista", lang, PREFIXO)}\``,
    `${T("**Voz e música:**", "**Voice and music:**", "**Voz y música:**")} ${!vozAqui
      ? T("_indisponível neste servidor (o dono do bot libera em `TTS_SERVIDORES`)_", "_not available on this server (the bot owner enables it in `TTS_SERVIDORES`)_", "_no disponible en este servidor (el dueño del bot lo habilita en `TTS_SERVIDORES`)_")
      : config.tts?.ativo && config.tts?.canalVoz ? `🟢 <#${config.tts.canalVoz}>` : T(`🔴 fora da call — \`${citarInterno("entrar", PREFIXO)}\``, `🔴 not in a call — \`${citarInterno("entrar", PREFIXO)}\``, `🔴 fuera de la llamada — \`${citar("entrar", "es", PREFIXO)}\``)}`,
  ];

  await sendEmbed(message.channel, {
    title: T("⚙️ Configurações deste servidor", "⚙️ This server's settings", "⚙️ Configuración de este servidor"),
    description: [
      T("**🛡 AutoMod — 4 grupos**", "**🛡 AutoMod — 4 groups**", "**🛡 AutoMod — 4 grupos**"),
      ...modulos,
      "",
      T("**⚖️ Punição** *(vale para todos os grupos, se não tiverem a própria)*", "**⚖️ Punishment** *(applies to every group that doesn't have its own)*", "**⚖️ Castigo** *(vale para todos los grupos que no tengan uno propio)*"),
      ...punicao,
      "",
      T("**📜 Canal de log**", "**📜 Log channel**", "**📜 Canal de registro**"),
      ...logs,
      "",
      `${T("**✅ Lista de permitidos**", "**✅ Allow list**", "**✅ Lista de permitidos**")} _(\`${citarInterno("automod", PREFIXO)} whitelist\`)_`,
      wl,
      "",
      T("**🌐 Lista global de banimentos**", "**🌐 Global ban list**", "**🌐 Lista global de bans**"),
      `${T("**Modo:**", "**Mode:**", "**Modo:**")} \`${modoBanGlobal(config)}\` — ${L_BG[modoBanGlobal(config)]}`,
      `${T("**Na lista:**", "**Listed:**", "**En la lista:**")} ${db.usuariosBanidosDistintos()} ${T("usuário(s) em", "user(s) in", "usuario(s) en")} ${db.totalBansGlobais()} ${T("registro(s)", "record(s)", "registro(s)")}`,
      "",
      T("**🎛 Comandos desativados**", "**🎛 Disabled commands**", "**🎛 Comandos desactivados**"),
      (config.comandosDesativados?.length ? config.comandosDesativados.map((c) => `\`${c}\``).join(", ") : T("_(nenhum)_", "_(none)_", "_(ninguno)_")),
      "",
      T("**🚨 Punições ativas** *(top 5)*", "**🚨 Active punishments** *(top 5)*", "**🚨 Castigos activos** *(top 5)*"),
      ativas,
      "",
      T("**🔐 Acesso aos comandos**", "**🔐 Command access**", "**🔐 Acceso a los comandos**"),
      `${T("Cargos de staff:", "Staff roles:", "Roles de staff:")} ${config.acesso?.cargosStaff?.length ? config.acesso.cargosStaff.map((r) => `<%${r}>`).join(" ") : T("_(só permissões nativas)_", "_(native permissions only)_", "_(solo permisos nativos)_")}`,
      `${T("Canais:", "Channels:", "Canales:")} ${(config.acesso?.canais?.modo ?? "todos") === "todos" ? T("qualquer um", "any", "cualquiera") : `\`${config.acesso.canais.modo}\` ${config.acesso.canais.lista?.length ? config.acesso.canais.lista.map((c) => `<#${c}>`).join(", ") : T("_(lista vazia)_", "_(empty list)_", "_(lista vacía)_")}`}`,
      "",
      T("**👋 Entrada e saída**", "**👋 Join and leave**", "**👋 Entrada y salida**"),
      `${T("Boas-vindas:", "Welcome:", "Bienvenida:")} ${config.boasVindas?.ativo && config.boasVindas?.canalId ? `🟢 <#${config.boasVindas.canalId}>` : T("🔴 desligadas", "🔴 off", "🔴 desactivada")}`,
      `${T("Despedida:", "Farewell:", "Despedida:")} ${config.adeus?.ativo && config.adeus?.canalId ? `🟢 <#${config.adeus.canalId}>` : T("🔴 desligada", "🔴 off", "🔴 desactivada")}`,
      "",
      T("**🧩 Recursos**", "**🧩 Features**", "**🧩 Funciones**"),
      ...recursos,
      "",
      T("**🎫 Tickets · 🪝 Webhooks · 🔊 Voz**", "**🎫 Tickets · 🪝 Webhooks · 🔊 Voice**", "**🎫 Tickets · 🪝 Webhooks · 🔊 Voz**"),
      ...tickVoz,
      "",
      ...(temIA(serverId) ? [
        T("**🤖 IA (Judy)**", "**🤖 AI (Judy)**", "**🤖 IA (Judy)**"),
        // (21 out 2026) o servidor escolhe: começam desligados
        `${T("Chat:", "Chat:", "Chat:")} ${chatLigadoAqui(serverId, config) ? T("🟢 ligado", "🟢 on", "🟢 activado") : `${T("🔴 desligado", "🔴 off", "🔴 desactivado")} — \`${T(citarInterno("chat.on", PREFIXO), citarInterno("chat.on", PREFIXO), citar("chat.on", "es", PREFIXO))}\``}`,
        `${T("Geração de imagem:", "Image generation:", "Generación de imágenes:")} ${imagemLigadaAqui(serverId, config) ? T("🟢 ligada", "🟢 on", "🟢 activada") : `${T("🔴 desligada", "🔴 off", "🔴 desactivada")} — \`${T(citarInterno("chat.imagem", PREFIXO), citarInterno("chat.imagem", PREFIXO), citar("chat.imagem", "es", PREFIXO))} on\``}`,
        `${T("Conversa livre:", "Free chat:", "Conversación libre:")} ${config.chatLivre?.canais?.length ? config.chatLivre.canais.map((c) => `<#${c}>`).join(", ") + ` (${T("modo", "mode", "modo")} \`${config.chatLivre.modo ?? "relevante"}\`)` : T("_(desligada)_", "_(off)_", "_(desactivada)_")}`,
        `${T("Comentários espontâneos:", "Spontaneous comments:", "Comentarios espontáneos:")} ${config.comentarioEspontaneo?.canalId ? `<#${config.comentarioEspontaneo.canalId}> (${T("até", "up to", "hasta")} ${config.comentarioEspontaneo.porDia ?? 4}/${T("dia", "day", "día")})` : T("_(desligados)_", "_(off)_", "_(desactivados)_")}`,
        `${T("Moderação por IA:", "AI moderation:", "Moderación por IA:")} ${config.moderacaoIA?.ativa ? T("🟢 ativa", "🟢 active", "🟢 activa") : T("🔴 desligada", "🔴 off", "🔴 desactivada")}${config.moderacaoIA?.criterios ? "" : T(" _(sem critérios)_", " _(no criteria)_", " _(sin criterios)_")}`,
        "",
      ] : comandoIAPermitido("modia", serverId) ? [
        // fora dos servidores da conversa, só a moderação por IA (16 out 2026)
        T("**🤖 Moderação por IA**", "**🤖 AI moderation**", "**🤖 Moderación por IA**"),
        `${T("Moderação por IA:", "AI moderation:", "Moderación por IA:")} ${config.moderacaoIA?.ativa ? T("🟢 ativa", "🟢 active", "🟢 activa") : T("🔴 desligada", "🔴 off", "🔴 desactivada")}${config.moderacaoIA?.criterios ? "" : T(" _(sem critérios)_", " _(no criteria)_", " _(sin criterios)_")}`,
        "",
      ] : []),
      T("**🌐 Global** *(compartilhado entre servidores)*", "**🌐 Global** *(shared across servers)*", "**🌐 Global** *(compartido entre servidores)*"),
      `Debug: ${simL(cfgGlobal.debug !== false)} · ${T("Listas anti-link:", "Anti-link lists:", "Listas anti-link:")} ${cfgGlobal.linkBlocklistSources.length} ${T("fonte(s)", "source(s)", "fuente(s)")}, ${cfgGlobal.linkBlocklistManual.length} ${T("domínio(s) manual(is)", "manual domain(s)", "dominio(s) manual(es)")}`,
      "",
      T(`💡 Ajuste com \`${citarInterno("automod", PREFIXO)}\` (que reúne blocklist, whitelist, sentinela e punicao) e \`${citar("log", "pt", PREFIXO)}\` — \`${citarInterno("tutorial", PREFIXO)}\` mostra o caminho, \`${citarInterno("assistente", PREFIXO)}\` percorre com você.`,
        `💡 Adjust with \`${citarInterno("automod", PREFIXO)}\` (holds blocklist, whitelist, sentinel and punishment) and \`${citar("log", "en", PREFIXO)}\` — \`${citarInterno("tutorial", PREFIXO)}\` shows the path, \`${citarInterno("assistente", PREFIXO)}\` walks it with you.`,
        `💡 Ajusta con \`${citar("automod", "es", PREFIXO)}\` (que reúne blocklist, whitelist, centinela y castigo) y \`${citar("log", "es", PREFIXO)}\` — \`${citar("tutorial", "es", PREFIXO)}\` muestra el camino, \`${citar("assistente", "es", PREFIXO)}\` lo recorre contigo.`),
    ].join("\n"),
    colour: COR.info,
  });
}


// O que cada parte do automod faz, com os números DESTE servidor — usado no
// painel `&automod <grupo>` (no &config as partes saem só pelo nome).
export function descreverFiltro(am, chave, lang = "pt", estado = {}) {
  const en = lang === "en";
  const L_SENS = lang === "es" ? SENSIBILIDADE_ES : en ? SENSIBILIDADE_EN : SENSIBILIDADE;
  const T = (pt, enTxt, es) => (lang === "es" ? trechoPronto(es) : en ? enTxt : pt);
  const seg = (ms) => `${Math.round((ms ?? 0) / 100) / 10}s`;
  const detalhe = {
    antiSpam:        () => T(`${am.antiSpam.maxMessages} msg em ${seg(am.antiSpam.windowMs)}`, `${am.antiSpam.maxMessages} msg in ${seg(am.antiSpam.windowMs)}`, `${am.antiSpam.maxMessages} msg en ${seg(am.antiSpam.windowMs)}`),
    antiMassSpam:    () => T(`${am.antiMassSpam.maxMessages} msg em ${seg(am.antiMassSpam.windowMs)}`, `${am.antiMassSpam.maxMessages} msg in ${seg(am.antiMassSpam.windowMs)}`, `${am.antiMassSpam.maxMessages} msg en ${seg(am.antiMassSpam.windowMs)}`),
    antiDuplicata:   () => T(`${am.antiDuplicata?.maxRepetidas ?? 3}× a mesma mensagem em ${seg(am.antiDuplicata?.windowMs ?? 120000)} (curta: ${(am.antiDuplicata?.maxRepetidas ?? 3) + 2}×)`, `${am.antiDuplicata?.maxRepetidas ?? 3}× the same message in ${seg(am.antiDuplicata?.windowMs ?? 120000)} (short: ${(am.antiDuplicata?.maxRepetidas ?? 3) + 2}×)`, `${am.antiDuplicata?.maxRepetidas ?? 3}× el mismo mensaje en ${seg(am.antiDuplicata?.windowMs ?? 120000)} (corto: ${(am.antiDuplicata?.maxRepetidas ?? 3) + 2}×)`),
    antiImagem:      () => T("imagens de contas novas descritas pelo modelo de visão; avisa a staff", "images from new accounts described by the vision model; alerts staff", "imágenes de cuentas nuevas descritas por el modelo de visión; avisa al staff"),
    antiAssuntos:    () => {
      const ativos = Object.entries(am.antiAssuntos?.acoes ?? {}).filter(([, a]) => a && a !== "off");
      return ativos.length ? ativos.map(([t, a]) => `${t} → ${a}`).join(", ") : T("nenhum tema ligado", "no topic on", "ningún tema activado");
    },
    antiAvatar:      () => T(`ao entrar e ao trocar → ${am.antiAvatar?.acao ?? "silenciar"}`, `on join and on change → ${am.antiAvatar?.acao ?? "silenciar"}`, `al entrar y al cambiarla → ${am.antiAvatar?.acao ?? "silenciar"}`),
    antiInvite:      () => T("bloqueia convites", "blocks invites", "bloquea invitaciones"),
    antiMassMention: () => T(`máx. ${am.antiMassMention.maxMentions} menções`, `max ${am.antiMassMention.maxMentions} mentions`, `máx. ${am.antiMassMention.maxMentions} menciones`),
    antiCaps:        () => T(`≥${am.antiCaps.minLength} caracteres e ${Math.round(am.antiCaps.threshold * 100)}% maiúsculas`, `≥${am.antiCaps.minLength} chars and ${Math.round(am.antiCaps.threshold * 100)}% uppercase`, `≥${am.antiCaps.minLength} caracteres y ${Math.round(am.antiCaps.threshold * 100)}% mayúsculas`),
    antiLink:        () => T(`${(estado?.blockedDomains?.size ?? 0).toLocaleString("pt-BR")} domínio(s) na lista`, `${(estado?.blockedDomains?.size ?? 0).toLocaleString("en-US")} domain(s) listed`, `${(estado?.blockedDomains?.size ?? 0).toLocaleString("es-ES")} dominio(s) en la lista`),
    antiScam:        () => T(`sensibilidade ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`, `sensitivity ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`, `sensibilidad ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`),
    antiCaracteres:  () => T("texto distorcido (zalgo) e caracteres invisíveis", "distorted (zalgo) text and invisible characters", "texto distorsionado (zalgo) y caracteres invisibles"),
    antiOdio:        () => T(`ofensas raciais/homofóbicas (de fábrica${am.antiOdio?.termos?.length ? ` + ${am.antiOdio.termos.length}` : ""})`, `racial/homophobic slurs (built-in${am.antiOdio?.termos?.length ? ` + ${am.antiOdio.termos.length}` : ""})`, `insultos racistas/homófobos (de fábrica${am.antiOdio?.termos?.length ? ` + ${am.antiOdio.termos.length}` : ""})`),
    antiEmoji:       () => T(`${am.antiEmoji?.maxEmojis ?? 20}+ emojis numa mensagem`, `${am.antiEmoji?.maxEmojis ?? 20}+ emojis in one message`, `${am.antiEmoji?.maxEmojis ?? 20}+ emojis en un mensaje`),
    antiMidia:       () => T(`mais de ${am.antiMidia?.maxPorMinuto ?? 8} anexos/min (conta nova: ${am.antiMidia?.maxNovato ?? 3})`, `over ${am.antiMidia?.maxPorMinuto ?? 8} attachments/min (new account: ${am.antiMidia?.maxNovato ?? 3})`, `más de ${am.antiMidia?.maxPorMinuto ?? 8} adjuntos/min (cuenta nueva: ${am.antiMidia?.maxNovato ?? 3})`),
    antiRepeticao:   () => T(`mais de ${am.antiRepeticao?.maxRepeticao ?? 15} caracteres repetidos${am.antiRepeticao?.ignorar ? ` (ignora \`${am.antiRepeticao.ignorar}\`)` : ""}`, `over ${am.antiRepeticao?.maxRepeticao ?? 15} repeated characters${am.antiRepeticao?.ignorar ? ` (ignores \`${am.antiRepeticao.ignorar}\`)` : ""}`, `más de ${am.antiRepeticao?.maxRepeticao ?? 15} caracteres repetidos${am.antiRepeticao?.ignorar ? ` (ignora \`${am.antiRepeticao.ignorar}\`)` : ""}`),
  };  return detalhe[chave]?.() ?? "";
}
