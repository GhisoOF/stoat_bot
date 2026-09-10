import { rebuildBlocklist, DOMINIO_VALIDO, simularDeteccao, removerCargoSilence } from "./automod-engine.js";
import * as engine from "./automod-engine.js";
import * as db  from "../core/db.js";
import { limparId } from "../core/ids.js";
import * as log from "../core/log.js";
import { analisarConteudo } from "./scorecard.js";
import { tr, lingua } from "../core/i18n.js";

// %warnings [@usuário]
export async function cmdWarnings(message, args, ctx) {
  const { config, sendEmbed, COR, serverId } = ctx;
  const lang = lingua(ctx);
  const targetId = message.mentionIds?.[0] ?? message.authorId;
  const count  = db.contarAvisos(serverId, targetId);
  const limite = config.automod.punicao.warnsParaBan ?? 3;
  const silenciado = db.estaSilenciado(serverId, targetId);
  const linhas = [lang === "en"
    ? `<@${targetId}> has **${count}/${limite}** warning(s).`
    : `<@${targetId}> tem **${count}/${limite}** aviso(s).`];
  if (silenciado) linhas.push(lang === "en"
    ? "🔇 They are **silenced** (the role is re-applied if they leave and come back)."
    : "🔇 Está **silenciado** (o cargo é reaplicado se sair e voltar).");
  await sendEmbed(message.channel, {
    title: lang === "en" ? "📋 Warnings" : "📋 Avisos",
    description: linhas.join("\n"),
    colour: COR.info,
  });
}

// %clearwarnings @usuário   (ManagePermissions)
export async function cmdClearwarnings(message, args, ctx) {
  const { estado, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const targetId = message.mentionIds?.[0];
  if (!targetId)
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso incorreto", description: `\`${PREFIXO}clearwarnings @usuário\``, colour: COR.erro },
      { title: "❌ Wrong usage", description: `\`${PREFIXO}clearwarnings @user\``, colour: COR.erro }));

  db.limparPunicao(ctx.serverId, targetId);
  await sendEmbed(message.channel, tr(ctx,
    { title: "✅ Avisos limpos", description: `Os avisos de <@${targetId}> foram zerados.`, colour: COR.sucesso },
    { title: "✅ Warnings cleared", description: `<@${targetId}>'s warnings were reset.`, colour: COR.sucesso }));
  await log.registrar(ctx, "punicoes", { titulo: "🧹 Avisos limpos",
    descricao: `<@${targetId}> teve os avisos zerados por <@${message.authorId}>.` });
}

// %automod status | %automod <módulo> <on|off> | %automod debug <on|off>   (ManagePermissions)
export async function cmdAutomod(message, args, ctx) {
  const { config, cfgGlobal, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, salvarGlobal, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  let sub = args[0]?.toLowerCase();

  // %automod debug <on|off> — liga/desliga os logs (GLOBAL, todos os servidores)
  if (sub === "debug") {
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off")
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${PREFIXO}automod debug <on|off>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${PREFIXO}automod debug <on|off>\``, colour: COR.erro }));
    cfgGlobal.debug = (v === "on");
    salvarGlobal();
    return sendEmbed(message.channel, { title: "🐛 Debug",
      description: lang === "en"
        ? `Debug logs **${cfgGlobal.debug ? "enabled 🟢" : "disabled 🔴"}** (global).`
        : `Logs de depuração **${cfgGlobal.debug ? "ativados 🟢" : "desativados 🔴"}** (global).`,
      colour: COR.mod });
  }

  const modulos = {
    antispam:        "antiSpam",
    antimassspam:    "antiMassSpam",
    antiinvite:      "antiInvite",
    antimassmention: "antiMassMention",
    anticaps:        "antiCaps",
    antilink:        "antiLink",
    sentinela:       "antiScam",
    anticaracteres:  "antiCaracteres",
    antirepeticao:   "antiRepeticao",
  };

  // `antiscam` → `sentinela`: mesmo filtro, nome novo.
  if (sub === "antiscam") sub = "sentinela";

  if (!sub || sub === "status") {
    const linhas = Object.entries(modulos).map(([nome, chave]) => {
      const on = config.automod[chave]?.enabled;
      return lang === "en"
        ? `${on ? "🟢" : "🔴"} **${nome}** — ${on ? "enabled" : "disabled"}`
        : `${on ? "🟢" : "🔴"} **${nome}** — ${on ? "ativado" : "desativado"}`;
    });
    linhas.push(lang === "en"
      ? `${cfgGlobal.debug !== false ? "🟢" : "🔴"} **debug (global)** — ${cfgGlobal.debug !== false ? "enabled" : "disabled"}`
      : `${cfgGlobal.debug !== false ? "🟢" : "🔴"} **debug (global)** — ${cfgGlobal.debug !== false ? "ativado" : "desativado"}`);
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🛡 AutoMod status" : "🛡 Status do AutoMod",
      description: linhas.join("\n"), colour: COR.mod });
  }

  const chave = modulos[sub];
  if (!chave)
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Módulo desconhecido",
      description: `Módulos: ${Object.keys(modulos).map((m) => `\`${m}\``).join(", ")}, \`debug\``,
      colour: COR.erro,
    }, {
      title: "❌ Unknown module",
      description: `Modules: ${Object.keys(modulos).map((m) => `\`${m}\``).join(", ")}, \`debug\``,
      colour: COR.erro,
    }));

  const mod = config.automod[chave];
  const acao = args[1]?.toLowerCase();

  // Parâmetros configuráveis por módulo (nome do arg → chave interna + validação)
  const PARAMS = {
    antispam:        { mensagens: "maxMessages", tempo: "windowMs" },
    antimassspam:    { mensagens: "maxMessages", tempo: "windowMs" },
    antimassmention: { mencoes: "maxMentions" },
    anticaps:        { tamanho: "minLength", limiar: "threshold" },
    anticaracteres:  { zalgo: "limiteZalgo" },
    antirepeticao:   { repeticao: "maxRepeticao", ignorar: "ignorar" },
  };
  const MODOS_PUN = ["avisar", "apagar", "confirmar", "acumular", "banir"];

  // ── &automod <módulo>  → detalhes do módulo ──
  if (!acao) {
    const params = PARAMS[sub];
    const linhas = [lang === "en"
      ? `${mod.enabled ? "🟢 enabled" : "🔴 disabled"}`
      : `${mod.enabled ? "🟢 ativado" : "🔴 desativado"}`];
    if (params) {
      linhas.push("", lang === "en" ? "**Parameters:**" : "**Parâmetros:**");
      for (const [nome, ck] of Object.entries(params)) linhas.push(`• \`${nome}\` = ${mod[ck]}`);
    }
    const pm = mod.punicao?.modo;
    linhas.push("", lang === "en"
      ? `**Punishment:** ${pm ? `\`${pm}\` (its own)` : "_inherits the global one_ (`" + (config.automod.punicao?.modo ?? "avisar") + "`)"}`
      : `**Punição:** ${pm ? `\`${pm}\` (própria)` : "_herda a global_ (`" + (config.automod.punicao?.modo ?? "avisar") + "`)"}`);
    linhas.push("", lang === "en" ? "**How to configure:**" : "**Como configurar:**",
      `\`${PREFIXO}automod ${sub} <on|off>\``,
      params ? `\`${PREFIXO}automod ${sub} set <${lang === "en" ? "parameter" : "parâmetro"}> <${lang === "en" ? "value" : "valor"}>\`` : null,
      `\`${PREFIXO}automod ${sub} punicao <${MODOS_PUN.join("|")}|herdar>\``,
    );
    return sendEmbed(message.channel, { title: `🛡 ${sub}`,
      description: linhas.filter((l) => l !== null).join("\n"), colour: COR.mod });
  }

  // ── set <parâmetro> <valor> ──
  if (acao === "set") {
    const params = PARAMS[sub];
    if (!params)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Sem parâmetros", description: `O módulo \`${sub}\` não tem parâmetros ajustáveis.`, colour: COR.erro },
        { title: "❌ No parameters", description: `The \`${sub}\` module has no adjustable parameters.`, colour: COR.erro }));
    const nome = args[2]?.toLowerCase();
    const bruto = args[3];
    const ck = params[nome];
    if (!ck || bruto === undefined)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${PREFIXO}automod ${sub} set <${Object.keys(params).join("|")}> <valor>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${PREFIXO}automod ${sub} set <${Object.keys(params).join("|")}> <value>\``, colour: COR.erro }));
    // 'ignorar' é texto (letras a ignorar, ex.: "k"); os demais são numéricos.
    if (ck === "ignorar") {
      mod[ck] = String(bruto).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
      salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🛡 Parâmetro atualizado",
          description: `\`${sub}.${nome}\` = **"${mod[ck]}"** (letras ignoradas na repetição)`, colour: COR.sucesso },
        { title: "🛡 Parameter updated",
          description: `\`${sub}.${nome}\` = **"${mod[ck]}"** (letters ignored in repetition)`, colour: COR.sucesso }));
    }
    let valor = Number(bruto);
    if (Number.isNaN(valor) || valor < 0)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Valor inválido", description: "O valor precisa ser um número positivo.", colour: COR.erro },
        { title: "❌ Invalid value", description: "The value must be a positive number.", colour: COR.erro }));
    // limiar/zalgo aceitam 0–1 (fração) ou 0–100 (porcentagem)
    if ((ck === "threshold" || ck === "limiteZalgo") && valor > 1) valor = valor / 100;
    mod[ck] = valor;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛡 Parâmetro atualizado", description: `\`${sub}.${nome}\` = **${valor}**`, colour: COR.sucesso },
      { title: "🛡 Parameter updated", description: `\`${sub}.${nome}\` = **${valor}**`, colour: COR.sucesso }));
  }

  // ── punicao <modo|herdar> ──
  if (acao === "punicao" || acao === "punição") {
    const modo = args[2]?.toLowerCase();
    if (modo === "herdar" || modo === "global" || modo === "null") {
      mod.punicao = null; salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🛡 Punição do módulo",
          description: `\`${sub}\` agora **herda a punição global** do servidor.`, colour: COR.sucesso },
        { title: "🛡 Module punishment",
          description: `\`${sub}\` now **inherits the server's global punishment**.`, colour: COR.sucesso }));
    }
    if (!MODOS_PUN.includes(modo))
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Modo inválido",
        description: `Modos: ${MODOS_PUN.map((m) => `\`${m}\``).join(", ")}, ou \`herdar\`.\n\n`
          + "• `avisar` — só avisa\n• `apagar` — só remove a mensagem\n• `confirmar` — silencia e espera mod\n• `acumular` — soma avisos até banir\n• `banir` — ban imediato",
        colour: COR.erro,
      }, {
        title: "❌ Invalid mode",
        description: `Modes: ${MODOS_PUN.map((m) => `\`${m}\``).join(", ")}, or \`herdar\` (inherit).\n\n`
          + "• `avisar` — warn only\n• `apagar` — remove the message only\n• `confirmar` — silence and wait for a mod\n• `acumular` — stack warnings until a ban\n• `banir` — instant ban",
        colour: COR.erro,
      }));
    mod.punicao = { ...(mod.punicao ?? {}), modo };
    if (modo === "acumular" && !mod.punicao.warnsParaBan) mod.punicao.warnsParaBan = 3;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛡 Punição do módulo",
        description: `\`${sub}\` agora usa a punição **\`${modo}\`** (própria, independente da global).`,
        colour: COR.sucesso },
      { title: "🛡 Module punishment",
        description: `\`${sub}\` now uses the **\`${modo}\`** punishment (its own, independent of the global one).`,
        colour: COR.sucesso }));
  }

  // ── on | off ──
  const novoEstado = acao;
  if (novoEstado !== "on" && novoEstado !== "off")
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Uso incorreto",
      description: [
        `\`${PREFIXO}automod ${sub} <on|off>\``,
        PARAMS[sub] ? `\`${PREFIXO}automod ${sub} set <parâmetro> <valor>\`` : null,
        `\`${PREFIXO}automod ${sub} punicao <modo>\``,
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: [
        `\`${PREFIXO}automod ${sub} <on|off>\``,
        PARAMS[sub] ? `\`${PREFIXO}automod ${sub} set <parameter> <value>\`` : null,
        `\`${PREFIXO}automod ${sub} punicao <mode>\``,
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }));

  config.automod[chave].enabled = (novoEstado === "on");
  salvarConfig();
  return sendEmbed(message.channel, tr(ctx,
    { title: "🛡 AutoMod atualizado",
      description: `**${sub}** foi **${novoEstado === "on" ? "ativado 🟢" : "desativado 🔴"}**.`, colour: COR.mod },
    { title: "🛡 AutoMod updated",
      description: `**${sub}** was **${novoEstado === "on" ? "enabled 🟢" : "disabled 🔴"}**.`, colour: COR.mod }));
}

// %whitelist <add|remove|list> [convite]   (ManagePermissions)
export async function cmdWhitelist(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const sub = args[0]?.toLowerCase();
  const raw = args[1] ?? "";
  const codigo = (raw.match(/stt\.gg\/([A-Za-z0-9]+)/)?.[1] ?? raw).toLowerCase();

  if (sub === "add") {
    if (!codigo)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${PREFIXO}whitelist add <link ou código>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${PREFIXO}whitelist add <link or code>\``, colour: COR.erro }));
    if (!config.inviteWhitelist.includes(codigo)) {
      config.inviteWhitelist.push(codigo);
      salvarConfig();
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Convite liberado", description: `O convite \`${codigo}\` agora é permitido.`, colour: COR.sucesso },
      { title: "✅ Invite allowed", description: `The \`${codigo}\` invite is now allowed.`, colour: COR.sucesso }));
  }

  if (sub === "remove") {
    config.inviteWhitelist = config.inviteWhitelist.filter((c) => c !== codigo);
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Removido", description: `O convite \`${codigo}\` não está mais na whitelist.`, colour: COR.sucesso },
      { title: "✅ Removed", description: `The \`${codigo}\` invite is no longer whitelisted.`, colour: COR.sucesso }));
  }

  if (sub === "list") {
    const lang = lingua(ctx);
    const lista = config.inviteWhitelist.length
      ? config.inviteWhitelist.map((c) => `• \`${c}\``).join("\n")
      : (lang === "en" ? "_No invites in the whitelist._" : "_Nenhum convite na whitelist._");
    return sendEmbed(message.channel, {
      title: lang === "en" ? "📃 Allowed invites" : "📃 Convites permitidos",
      description: lista, colour: COR.info });
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "❌ Uso incorreto", description: `\`${PREFIXO}whitelist <add|remove|list> [convite]\``, colour: COR.erro },
    { title: "❌ Wrong usage", description: `\`${PREFIXO}whitelist <add|remove|list> [invite]\``, colour: COR.erro }));
}

// %blocklist <add|remove|adddomain|removedomain|list|clear|reload> [url|domínio]
// (ManagePermissions)
export async function cmdBlocklist(message, args, ctx) {
  const { cfgGlobal, estado, sendEmbed, COR, getServer, membroTemPermissao, salvarGlobal, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const sub = args[0]?.toLowerCase();
  const arg = args[1];

  // ── Adicionar uma FONTE (URL de lista Pi-hole) ──
  if (sub === "add") {
    if (!arg || !/^https?:\/\//.test(arg))
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: `\`${PREFIXO}blocklist add <url>\`\nPara um único domínio use \`${PREFIXO}blocklist adddomain <domínio>\``,
        colour: COR.erro,
      }, {
        title: "❌ Wrong usage",
        description: `\`${PREFIXO}blocklist add <url>\`\nFor a single domain use \`${PREFIXO}blocklist adddomain <domain>\``,
        colour: COR.erro,
      }));
    if (cfgGlobal.linkBlocklistSources.includes(arg))
      return sendEmbed(message.channel, tr(ctx,
        { description: "Essa lista já foi adicionada.", colour: COR.aviso },
        { description: "That list was already added.", colour: COR.aviso }));

    await sendEmbed(message.channel, tr(ctx,
      { description: "⏳ Baixando lista, aguarde…", colour: COR.info },
      { description: "⏳ Downloading the list, hold on…", colour: COR.info }));
    cfgGlobal.linkBlocklistSources.push(arg);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Lista adicionada",
        description: `Fonte adicionada. Total de domínios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "✅ List added",
        description: `Source added. Total blocked domains: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  // ── Adicionar um ÚNICO domínio manualmente ──
  if (sub === "adddomain") {
    const dominio = (arg ?? "")
      .replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "").toLowerCase();
    if (!dominio || !DOMINIO_VALIDO.test(dominio))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Domínio inválido", description: `Ex.: \`${PREFIXO}blocklist adddomain 02giga.link\``, colour: COR.erro },
        { title: "❌ Invalid domain", description: `E.g.: \`${PREFIXO}blocklist adddomain 02giga.link\``, colour: COR.erro }));
    if (!cfgGlobal.linkBlocklistManual.includes(dominio)) {
      cfgGlobal.linkBlocklistManual.push(dominio);
      salvarGlobal();
      await rebuildBlocklist(ctx);
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Domínio bloqueado",
        description: `\`${dominio}\` foi adicionado. Total: **${estado.blockedDomains.size}** domínio(s).`, colour: COR.sucesso },
      { title: "✅ Domain blocked",
        description: `\`${dominio}\` was added. Total: **${estado.blockedDomains.size}** domain(s).`, colour: COR.sucesso }));
  }

  // ── Remover um único domínio manual ──
  if (sub === "removedomain") {
    const dominio = (arg ?? "").toLowerCase();
    cfgGlobal.linkBlocklistManual = cfgGlobal.linkBlocklistManual.filter((d) => d !== dominio);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Domínio removido",
        description: `\`${dominio}\` foi removido. Total: **${estado.blockedDomains.size}** domínio(s).`, colour: COR.sucesso },
      { title: "✅ Domain removed",
        description: `\`${dominio}\` was removed. Total: **${estado.blockedDomains.size}** domain(s).`, colour: COR.sucesso }));
  }

  // ── Remover uma fonte (URL) ──
  if (sub === "remove") {
    if (!arg)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${PREFIXO}blocklist remove <url>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${PREFIXO}blocklist remove <url>\``, colour: COR.erro }));
    cfgGlobal.linkBlocklistSources = cfgGlobal.linkBlocklistSources.filter((u) => u !== arg);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Lista removida",
        description: `Total de domínios bloqueados agora: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "✅ List removed",
        description: `Total blocked domains now: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  if (sub === "list") {
    const fontes = cfgGlobal.linkBlocklistSources.length
      ? cfgGlobal.linkBlocklistSources.map((u) => `• ${u}`).join("\n")
      : (lang === "en" ? "_No sources (URLs) added._" : "_Nenhuma fonte (URL) adicionada._");
    const manuais = cfgGlobal.linkBlocklistManual.length
      ? cfgGlobal.linkBlocklistManual.map((d) => `• \`${d}\``).join("\n")
      : (lang === "en" ? "_No manual domains._" : "_Nenhum domínio manual._");
    return sendEmbed(message.channel, lang === "en" ? {
      title: "📃 Anti-link blocks",
      description: `**Sources (URLs):**\n${fontes}\n\n**Manual domains:**\n${manuais}\n\n**Total loaded:** ${estado.blockedDomains.size}`,
      colour: COR.info,
    } : {
      title: "📃 Bloqueios anti-link",
      description: `**Fontes (URLs):**\n${fontes}\n\n**Domínios manuais:**\n${manuais}\n\n**Total carregado:** ${estado.blockedDomains.size}`,
      colour: COR.info,
    });
  }

  if (sub === "clear") {
    cfgGlobal.linkBlocklistSources = [];
    cfgGlobal.linkBlocklistManual = [];
    salvarGlobal();
    estado.blockedDomains = engine.criarIndiceVazio();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🗑 Listas limpas", description: "Todas as fontes e domínios foram removidos.", colour: COR.sucesso },
      { title: "🗑 Lists cleared", description: "All sources and domains were removed.", colour: COR.sucesso }));
  }

  if (sub === "reload") {
    await sendEmbed(message.channel, tr(ctx,
      { description: "⏳ Recarregando listas…", colour: COR.info },
      { description: "⏳ Reloading the lists…", colour: COR.info }));
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔄 Listas recarregadas",
        description: `Total de domínios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "🔄 Lists reloaded",
        description: `Total blocked domains: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  return sendEmbed(message.channel, tr(ctx, {
    title: "❌ Uso incorreto",
    description: [
      `\`${PREFIXO}blocklist add <url>\` — adiciona lista Pi-hole`,
      `\`${PREFIXO}blocklist adddomain <domínio>\` — bloqueia 1 domínio`,
      `\`${PREFIXO}blocklist removedomain <domínio>\``,
      `\`${PREFIXO}blocklist remove <url>\``,
      `\`${PREFIXO}blocklist list | clear | reload\``,
    ].join("\n"),
    colour: COR.erro,
  }, {
    title: "❌ Wrong usage",
    description: [
      `\`${PREFIXO}blocklist add <url>\` — adds a Pi-hole list`,
      `\`${PREFIXO}blocklist adddomain <domain>\` — blocks 1 domain`,
      `\`${PREFIXO}blocklist removedomain <domain>\``,
      `\`${PREFIXO}blocklist remove <url>\``,
      `\`${PREFIXO}blocklist list | clear | reload\``,
    ].join("\n"),
    colour: COR.erro,
  }));
}

export async function cmdScam(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const cfg = config.automod.antiScam;
  const pol = config.automod.punicao;
  const sub = args[0]?.toLowerCase();
  const val = args[1];
  const limiarDe = (sens) => ({ baixa: 7, media: 6, alta: 5 })[sens] ?? 6;

  if (!sub || sub === "config" || sub === "status") {
    return sendEmbed(message.channel, lang === "en" ? {
      title: "🛡 Sentinel — judgement-based moderation",
      colour: COR.mod,
      description: [
        "Weighs the *content* and gives it a suspicion score. Unlike the other",
        "modules — which measure exact things like caps or message rate — this one",
        "**judges**, so it adapts to who is writing.",
        "",
        `**Enabled:** ${cfg.enabled ? "🟢 yes" : "🔴 no"}  (enable with \`${PREFIXO}sentinela on\`)`,
        `**Sensitivity:** ${cfg.sensitivity}  (base threshold: ${limiarDe(cfg.sensitivity)}/10)`,
        `**Stricter with newcomers:** ${cfg.porAntiguidade !== false ? "🟢 on" : "🔴 off"} — threshold moves with the member's level`,
        `**Alert the staff:** ${cfg.alertarAdmin !== false ? "🟢 on" : "🔴 off"} — pings staff on a suspicious *pattern*, before punishing`,
        `**Alert channel:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(uses the message's channel)_"}`,
        `**Punishment:** set with \`${PREFIXO}punicao\` (current mode: **${pol.modo}**) — applies to all automods`,
        "",
        "**Commands:**",
        `\`${PREFIXO}sentinela sensitivity <baixa|media|alta>\``,
        `\`${PREFIXO}sentinela antiguidade on|off\` · \`${PREFIXO}sentinela alerta on|off\``,
        `\`${PREFIXO}sentinela channel <id|aqui>\``,
        `\`${PREFIXO}sentinela test <text>\` · \`${PREFIXO}sentinela simulate <text>\``,
        `\`${PREFIXO}sentinela ban <userId>\` · \`${PREFIXO}sentinela dismiss <userId>\``,
        "",
        `_\`${PREFIXO}scam\` still works — it's the old name._`,
      ].join("\n"),
    } : {
      title: "🛡 Sentinela — moderação por julgamento",
      colour: COR.mod,
      description: [
        "Pesa o *conteúdo* e dá uma nota de suspeita. Diferente dos outros",
        "módulos — que medem coisas exatas, como caixa alta ou ritmo de mensagem —",
        "este **julga**, e por isso se adapta a quem está escrevendo.",
        "",
        `**Ativado:** ${cfg.enabled ? "🟢 sim" : "🔴 não"}  (ligue com \`${PREFIXO}sentinela on\`)`,
        `**Sensibilidade:** ${cfg.sensitivity}  (limiar base: ${limiarDe(cfg.sensitivity)}/10)`,
        `**Mais rígido com quem chegou agora:** ${cfg.porAntiguidade !== false ? "🟢 ligado" : "🔴 desligado"} — o limiar acompanha o nível do membro`,
        `**Avisar a staff:** ${cfg.alertarAdmin !== false ? "🟢 ligado" : "🔴 desligado"} — marca a staff diante de um *padrão* suspeito, antes de punir`,
        `**Canal de aviso:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(usa o canal da mensagem)_"}`,
        `**Punição:** definida em \`${PREFIXO}punicao\` (modo atual: **${pol.modo}**) — vale para todos os automods`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}sentinela sensitivity <baixa|media|alta>\``,
        `\`${PREFIXO}sentinela antiguidade on|off\` · \`${PREFIXO}sentinela alerta on|off\``,
        `\`${PREFIXO}sentinela channel <id|aqui>\``,
        `\`${PREFIXO}sentinela test <texto>\` · \`${PREFIXO}sentinela simulate <texto>\``,
        `\`${PREFIXO}sentinela ban <userId>\` · \`${PREFIXO}sentinela dismiss <userId>\``,
        "",
        `_\`${PREFIXO}scam\` continua funcionando — é o nome antigo._`,
      ].join("\n"),
    });
  }

  if (["on", "off", "ligar", "desligar", "enable", "disable"].includes(sub)) {
    const ligar = ["on", "ligar", "enable"].includes(sub);
    cfg.enabled = ligar;
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛡 Sentinela", description: `O Sentinela foi **${ligar ? "ativado 🟢" : "desativado 🔴"}**.${ligar ? `\n\nSensibilidade: \`${cfg.sensitivity ?? "media"}\` · punição: a do \`${PREFIXO}punicao\`.` : ""}`, colour: COR.mod },
      { title: "🛡 Sentinel", description: `The Sentinel was **${ligar ? "enabled 🟢" : "disabled 🔴"}**.${ligar ? `\n\nSensitivity: \`${cfg.sensitivity ?? "media"}\` · punishment: the one from \`${PREFIXO}punicao\`.` : ""}`, colour: COR.mod }));
  }

  if (["antiguidade", "tenure", "novatos"].includes(sub)) {
    const on = ["on", "sim", "yes", "true"].includes(String(val ?? "").toLowerCase());
    const off = ["off", "nao", "não", "no", "false"].includes(String(val ?? "").toLowerCase());
    if (!on && !off) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}sentinela antiguidade on|off\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}sentinela antiguidade on|off\``, colour: COR.erro }));
    }
    cfg.porAntiguidade = on; salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: on ? "🟢 Rigor por antiguidade ligado" : "🔴 Rigor por antiguidade desligado",
      description: on
        ? "Quem chegou agora é olhado de perto; quem já convive no servidor ganha margem.\nA medida de convívio é o **nível de XP** — ele só sobe conversando, ao longo do tempo."
        : "O limiar volta a ser igual para todo mundo, independente de há quanto tempo a pessoa está aqui.",
      colour: on ? COR.sucesso : COR.aviso,
    }, {
      title: on ? "🟢 Stricter with newcomers: on" : "🔴 Stricter with newcomers: off",
      description: on
        ? "Newcomers get a closer look; people who already belong here get slack.\nTenure is measured by **XP level** — it only grows by talking, over time."
        : "The threshold is the same for everyone again, regardless of how long they've been here.",
      colour: on ? COR.sucesso : COR.aviso,
    }));
  }

  if (["alerta", "alertar", "alert", "staff"].includes(sub)) {
    const on = ["on", "sim", "yes", "true"].includes(String(val ?? "").toLowerCase());
    const off = ["off", "nao", "não", "no", "false"].includes(String(val ?? "").toLowerCase());
    if (!on && !off) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}sentinela alerta on|off\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}sentinela alert on|off\``, colour: COR.erro }));
    }
    cfg.alertarAdmin = on; salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: on ? "🟢 Alerta à staff ligado" : "🔴 Alerta à staff desligado",
      description: on
        ? `A staff é marcada quando alguém levanta suspeita **repetidas vezes** em pouco tempo — mesmo sem chegar ao limiar de punição.\nUm sinal isolado é ruído; um padrão merece olho humano.\nCargos marcados: os de \`${PREFIXO}acesso cargo\`.`
        : "Nada de marcações. As punições continuam normalmente; só o aviso preventivo sai de cena.",
      colour: on ? COR.sucesso : COR.aviso,
    }, {
      title: on ? "🟢 Staff alerts on" : "🔴 Staff alerts off",
      description: on
        ? `Staff gets pinged when someone raises suspicion **repeatedly** in a short window — even below the punishment threshold.\nOne signal is noise; a pattern deserves human eyes.\nRoles pinged: the ones in \`${PREFIXO}acesso cargo\`.`
        : "No pings. Punishments still work; only the preventive heads-up goes away.",
      colour: on ? COR.sucesso : COR.aviso,
    }));
  }

  if (sub === "sensitivity") {
    const opc = ["baixa", "media", "alta"];
    if (!opc.includes(val))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}sentinela sensitivity <${opc.join("|")}>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}sentinela sensitivity <${opc.join("|")}>\``, colour: COR.erro }));
    cfg.sensitivity = val; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Sensibilidade", description: `Sensibilidade: **${val}** (limiar ${limiarDe(val)}/10).`, colour: COR.sucesso },
      { title: "✅ Sensitivity", description: `Sensitivity: **${val}** (threshold ${limiarDe(val)}/10).`, colour: COR.sucesso }));
  }

  if (sub === "channel") {
    if (!val) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}scam channel <id|aqui>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}scam channel <id|here>\``, colour: COR.erro }));
    cfg.alertChannelId = (val.toLowerCase() === "aqui" || val.toLowerCase() === "here")
      ? message.channelId : val.replace(/[<#>]/g, "");
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Canal de aviso", description: `Avisos irão para \`${cfg.alertChannelId}\`.`, colour: COR.sucesso },
      { title: "✅ Alert channel", description: `Alerts will go to \`${cfg.alertChannelId}\`.`, colour: COR.sucesso }));
  }

  if (sub === "ban") {
    const uid = (val ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}scam ban <userId>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}scam ban <userId>\``, colour: COR.erro }));
    try {
      await server.banUser(uid, { reason: "[AutoMod] Confirmado por moderador" });
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔨 Banido", description: `<@${uid}> foi banido (confirmado).`, colour: COR.erro },
        { title: "🔨 Banned", description: `<@${uid}> was banned (confirmed).`, colour: COR.erro }));
    } catch (err) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Erro", description: `Não foi possível banir: ${err.message}`, colour: COR.erro },
        { title: "❌ Error", description: `Couldn't ban: ${err.message}`, colour: COR.erro }));
    }
  }

  if (sub === "dismiss") {
    const uid = (val ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}scam dismiss <userId>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}scam dismiss <userId>\``, colour: COR.erro }));
    try {
      if (pol.silenceRoleId) await removerCargoSilence(server, uid, pol.silenceRoleId, ctx);
      db.limparPunicao(ctx.serverId, uid);   // some do banco: não reaplica ao reentrar
      await log.registrar(ctx, "punicoes", { titulo: "✅ Punição removida",
        descricao: `<@${uid}> foi liberado por <@${message.authorId}>.` });
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Liberado", description: `Punição de <@${uid}> removida.`, colour: COR.sucesso },
        { title: "✅ Released", description: `<@${uid}>'s punishment was removed.`, colour: COR.sucesso }));
    } catch (err) {
      // A API do Stoat lança objetos, não Error: `err.message` virava "undefined".
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Erro", description: `Não foi possível liberar: ${engine.descreverErro(err, "pt")}`, colour: COR.erro },
        { title: "❌ Error", description: `Couldn't release: ${engine.descreverErro(err, "en")}`, colour: COR.erro }));
    }
  }

  if (sub === "test") {
    const texto = args.slice(1).join(" ");
    if (!texto) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}scam test <texto>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}scam test <text>\``, colour: COR.erro }));
    const r = analisarConteudo(texto, { rate: 1 });
    const limiar = limiarDe(cfg.sensitivity);
    const flag = r.nota >= limiar;

    console.log(`[SCAM TEST] nota=${r.nota.toFixed(1)}/${limiar} flag=${flag} grave=${r.grave} sinais=[${r.sinais.join(", ") || "nenhum"}]`);

    const acaoTxt = lang === "en"
      ? (!cfg.enabled
        ? `module **DISABLED** (enable with \`${PREFIXO}sentinela on\`)`
        : `it would apply the global policy **${pol.modo}** (see \`${PREFIXO}punicao\`)`)
      : (!cfg.enabled
        ? `módulo **DESATIVADO** (ative com \`${PREFIXO}automod antiscam on\`)`
        : `aplicaria a política global **${pol.modo}** (veja \`${PREFIXO}punicao\`)`);

    return sendEmbed(message.channel, lang === "en" ? {
      title: flag ? `🛑 WOULD be flagged (score ${r.nota.toFixed(1)}/10)` : `✅ Would NOT be flagged (score ${r.nota.toFixed(1)}/10)`,
      description: [
        `**Module:** ${cfg.enabled ? "🟢 enabled" : "🔴 disabled"}  •  **Sensitivity:** ${cfg.sensitivity} (threshold ${limiar})`,
        `**Score:** ${r.nota.toFixed(1)} / 10`,
        `**Serious?** ${r.grave ? "yes ⚠️" : "no"}`,
        `**Signals:** ${r.sinais.join(", ") || "none"}`,
        flag ? `**What it would do:** ${acaoTxt}` : null,
        "",
        `💡 Real flow in the alert channel: \`${PREFIXO}scam simulate <text>\``,
      ].filter(Boolean).join("\n"),
      colour: flag ? COR.erro : COR.sucesso,
    } : {
      title: flag ? `🛑 SERIA sinalizado (nota ${r.nota.toFixed(1)}/10)` : `✅ NÃO seria sinalizado (nota ${r.nota.toFixed(1)}/10)`,
      description: [
        `**Módulo:** ${cfg.enabled ? "🟢 ativado" : "🔴 desativado"}  •  **Sensibilidade:** ${cfg.sensitivity} (limiar ${limiar})`,
        `**Nota:** ${r.nota.toFixed(1)} / 10`,
        `**Grave?** ${r.grave ? "sim ⚠️" : "não"}`,
        `**Sinais:** ${r.sinais.join(", ") || "nenhum"}`,
        flag ? `**O que faria:** ${acaoTxt}` : null,
        "",
        `💡 Fluxo real no canal de avisos: \`${PREFIXO}scam simulate <texto>\``,
      ].filter(Boolean).join("\n"),
      colour: flag ? COR.erro : COR.sucesso,
    });
  }

  if (sub === "simulate" || sub === "simular") {
    const texto = args.slice(1).join(" ");
    if (!texto) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}scam simulate <texto>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}scam simulate <text>\``, colour: COR.erro }));
    await simularDeteccao(texto, ctx, message.channel);
    return sendEmbed(message.channel, tr(ctx, {
      title: "🧪 Simulação enviada",
      description: `Resultado enviado ao canal de avisos${cfg.alertChannelId ? ` (\`${cfg.alertChannelId}\`)` : " (este canal)"}. Nada foi punido.`,
      colour: COR.info,
    }, {
      title: "🧪 Simulation sent",
      description: `Result sent to the alert channel${cfg.alertChannelId ? ` (\`${cfg.alertChannelId}\`)` : " (this channel)"}. Nothing was punished.`,
      colour: COR.info,
    }));
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "❌ Subcomando desconhecido", description: `Use \`${PREFIXO}scam config\` para ver as opções.`, colour: COR.erro },
    { title: "❌ Unknown subcommand", description: `Use \`${PREFIXO}scam config\` to see the options.`, colour: COR.erro }));
}

export async function cmdPunicao(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const pol = config.automod.punicao;
  const sub = args[0]?.toLowerCase();
  const val = args[1];

  const rotulo = (m) => lang === "en"
    ? (m === "banir"     ? "instant ban"
     : m === "acumular"  ? `stacked warnings → ban at ${pol.warnsParaBan}`
     : m === "confirmar" ? "confirm (silences and waits for a moderator)"
     :                     "warning only (doesn't delete or punish)")
    : (m === "banir"     ? "banimento imediato"
     : m === "acumular"  ? `avisos acumulados → ban em ${pol.warnsParaBan}`
     : m === "confirmar" ? "confirmar (silencia e espera moderador)"
     :                     "apenas aviso (não apaga nem pune)");

  if (!sub || sub === "status" || sub === "config") {
    return sendEmbed(message.channel, lang === "en" ? {
      title: "⚖️ Punishment policy — applies to ALL automods",
      colour: COR.mod,
      description: [
        `**Mode:** ${pol.modo} — ${rotulo(pol.modo)}`,
        `**Warnings until ban (acumular mode):** ${pol.warnsParaBan}`,
        `**Silence role:** ${pol.silenceRoleId ? `\`${pol.silenceRoleId}\`` : "_(not set)_"}`,
        "",
        "**Aggressiveness levels:**",
        "• `avisar` — warn only, doesn't remove or punish",
        "• `apagar` — removes the message without punishing the person",
        "• `confirmar` — removes, silences and waits for a moderator's confirmation",
        "• `acumular` — issues warnings; at the limit, bans",
        "• `banir` — bans on the spot",
        "",
        `_Not sure where to start? \`${PREFIXO}tutorial moderacao\` explains the path._`,
        "",
        "**Commands:**",
        `\`${PREFIXO}punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
        `\`${PREFIXO}punicao escada [aviso,5m,1h,ban]\` — the steps of \`acumular\` mode`,
        `\`${PREFIXO}punicao warns <number>\``,
        `\`${PREFIXO}punicao silencerole <id>\``,
        "",
        `_To try a text out, that's the filter's job: \`${PREFIXO}sentinela test <text>\`. This command only decides what **happens** afterwards._`,
      ].join("\n"),
    } : {
      title: "⚖️ Política de punição — vale para TODOS os automods",
      colour: COR.mod,
      description: [
        `**Modo:** ${pol.modo} — ${rotulo(pol.modo)}`,
        `**Avisos p/ ban (modo acumular):** ${pol.warnsParaBan}`,
        `**Cargo de silêncio:** ${pol.silenceRoleId ? `\`${pol.silenceRoleId}\`` : "_(não definido)_"}`,
        "",
        "**Níveis de agressividade:**",
        "• `avisar` — só avisa, não remove nem pune",
        "• `apagar` — remove a mensagem, sem punir a pessoa",
        "• `confirmar` — remove, silencia e espera um moderador confirmar",
        "• `acumular` — dá avisos; ao atingir o limite, bane",
        "• `banir` — bane na hora",
        "",
        `_Não sabe por onde começar? \`${PREFIXO}tutorial moderacao\` explica o caminho._`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
        `\`${PREFIXO}punicao escada [aviso,5m,1h,ban]\` — os degraus do modo \`acumular\``,
        `\`${PREFIXO}punicao warns <número>\``,
        `\`${PREFIXO}punicao silencerole <id>\``,
        "",
        `_Para experimentar um texto, quem faz isso é o filtro: \`${PREFIXO}sentinela test <texto>\`. Este comando só decide o que **acontece** depois._`,
      ].join("\n"),
    });
  }

  if (sub === "modo" || sub === "mode") {
    if (!["avisar", "apagar", "confirmar", "acumular", "banir"].includes(val))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}punicao modo <avisar|apagar|confirmar|acumular|banir>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}punicao modo <avisar|apagar|confirmar|acumular|banir>\``, colour: COR.erro }));
    pol.modo = val; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Modo de punição atualizado", description: `Agora: **${val}** — ${rotulo(val)}.`, colour: COR.sucesso },
      { title: "✅ Punishment mode updated", description: `Now: **${val}** — ${rotulo(val)}.`, colour: COR.sucesso }));
  }

  // ── Os degraus do modo acumular ──
  if (["escada", "degraus", "ladder", "steps"].includes(sub)) {
    const bruto = args.slice(1).join(" ").trim();
    if (!bruto) {
      const atual = engine.escadaDePunicao(pol);
      return sendEmbed(message.channel, tr(ctx, {
        title: "🪜 Escada de punição",
        description: [
          "No modo `acumular`, cada reincidência sobe um degrau:",
          "",
          ...atual.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "pt")}`),
          "",
          "Quem para no primeiro degrau nunca chega ao último.",
          "",
          `\`${PREFIXO}punicao escada aviso,5m,1h,ban\` — o padrão`,
          `\`${PREFIXO}punicao escada aviso,10m,1h,12h,ban\` — mais degraus`,
          "",
          "_Aceita `aviso`, `ban` e prazos como `30s`, `10m`, `2h`, `1d`._",
          "_O ban é sempre o último degrau, mesmo que você não escreva._",
        ].join("\n"), colour: COR.mod,
      }, {
        title: "🪜 Punishment ladder",
        description: [
          "In `acumular` mode, each repeat offence climbs a step:",
          "",
          ...atual.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "en")}`),
          "",
          "Whoever stops at the first step never reaches the last.",
          "",
          `\`${PREFIXO}punicao escada aviso,5m,1h,ban\` — the default`,
          `\`${PREFIXO}punicao escada aviso,10m,1h,12h,ban\` — more steps`,
          "",
          "_Accepts `aviso`, `ban` and durations like `30s`, `10m`, `2h`, `1d`._",
          "_A ban is always the last step, even if you don't write it._",
        ].join("\n"), colour: COR.mod,
      }));
    }
    const teste = engine.escadaDePunicao({ escada: bruto }, { estrito: true });
    if (teste.length < 2) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Escada inválida", description: `Não entendi \`${bruto}\`.\n\nEx.: \`aviso,5m,1h,ban\``, colour: COR.erro },
        { title: "❌ Invalid ladder", description: `I didn't understand \`${bruto}\`.\n\nE.g.: \`aviso,5m,1h,ban\``, colour: COR.erro }));
    }
    pol.escada = bruto; salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: "🪜 Escada atualizada",
      description: teste.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "pt")}`).join("\n"),
      colour: COR.sucesso,
    }, {
      title: "🪜 Ladder updated",
      description: teste.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "en")}`).join("\n"),
      colour: COR.sucesso,
    }));
  }

  if (sub === "warns" || sub === "warnsparaban") {
    const n = parseInt(val, 10);
    if (!Number.isInteger(n) || n < 1 || n > 20)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}punicao warns <1-20>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}punicao warns <1-20>\``, colour: COR.erro }));
    pol.warnsParaBan = n; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Avisos para ban", description: `No modo \`acumular\`, o ban ocorre em **${n}** avisos.`, colour: COR.sucesso },
      { title: "✅ Warnings until ban", description: `In \`acumular\` mode, the ban happens at **${n}** warnings.`, colour: COR.sucesso }));
  }

  if (sub === "silencerole" || sub === "cargo") {
    if (!val) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}punicao silencerole <id>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}punicao silencerole <id>\``, colour: COR.erro }));
    pol.silenceRoleId = limparId(val); salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Cargo de silêncio",
        description: `Cargo para silenciar: \`${pol.silenceRoleId}\` (usado no modo \`confirmar\`).`, colour: COR.sucesso },
      { title: "✅ Silence role",
        description: `Role used to silence: \`${pol.silenceRoleId}\` (used in \`confirmar\` mode).`, colour: COR.sucesso }));
  }

  const NOUTRO_COMANDO = {
    test: "sentinela", testar: "sentinela", simulate: "sentinela", simular: "sentinela",
    sensitivity: "sentinela", sensibilidade: "sentinela", limiar: "sentinela",
    channel: "sentinela", canal: "sentinela", alerta: "sentinela", antiguidade: "sentinela",
    warn: "warn", avisar: "warn", warnings: "warnings", avisos: "warnings",
    clearwarnings: "clearwarnings", cargomudo: "cargomudo",
  };
  const destino = NOUTRO_COMANDO[sub];
  if (destino) {
    const restante = args.slice(1).join(" ");
    const cmd = `${PREFIXO}${destino} ${sub === destino ? "" : `${sub} `}${restante}`.replace(/\s+/g, " ").trim();
    return sendEmbed(message.channel, tr(ctx, {
      title: `↪️ Isso é do \`${PREFIXO}${destino}\``,
      description: [
        `\`${PREFIXO}punicao\` decide **o que acontece** com quem infringe — ele não analisa textos nem pune ninguém sozinho.`,
        "",
        `Você quis dizer:`,
        `\`${cmd}\``,
      ].join("\n"), colour: COR.aviso,
    }, {
      title: `↪️ That belongs to \`${PREFIXO}${destino}\``,
      description: [
        `\`${PREFIXO}punicao\` decides **what happens** to whoever breaks a rule — it doesn't analyse text or punish anyone on its own.`,
        "",
        `You probably meant:`,
        `\`${cmd}\``,
      ].join("\n"), colour: COR.aviso,
    }));
  }

  return sendEmbed(message.channel, tr(ctx, {
    title: "❌ Subcomando desconhecido",
    description: [
      `\`${sub}\` não é um subcomando do \`${PREFIXO}punicao\`.`,
      "",
      `\`modo\` · \`escada\` · \`warns\` · \`silencerole\` · \`status\``,
      "",
      `_\`${PREFIXO}punicao status\` mostra o que cada um faz._`,
    ].join("\n"), colour: COR.erro,
  }, {
    title: "❌ Unknown subcommand",
    description: [
      `\`${sub}\` isn't a \`${PREFIXO}punicao\` subcommand.`,
      "",
      `\`modo\` · \`escada\` · \`warns\` · \`silencerole\` · \`status\``,
      "",
      `_\`${PREFIXO}punicao status\` shows what each one does._`,
    ].join("\n"), colour: COR.erro,
  }));
}

function negarPermissao(ctx, channel, permName) {
  return ctx.sendEmbed(channel, tr(ctx, {
    title: "🚫 Permissão insuficiente",
    description: `Você precisa da permissão **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  }, {
    title: "🚫 Missing permission",
    description: `You need the **${permName}** permission to use this command.`,
    colour: ctx.COR.erro,
  }));
}
