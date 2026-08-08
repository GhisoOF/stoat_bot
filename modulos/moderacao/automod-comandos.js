// ══════════════════════════════════════════════════════════
//  automod-comandos.js — LÓGICA LEVE do AutoMod
//  Apenas os comandos de configuração (respostas em embed e
//  ajustes na config). A análise pesada fica no automod-engine.js.
// ══════════════════════════════════════════════════════════
import { rebuildBlocklist, DOMINIO_VALIDO, simularDeteccao, removerCargoSilence } from "./automod-engine.js";
import * as db  from "../core/db.js";
import * as log from "../core/log.js";
import { analisarConteudo } from "./scorecard.js";

// ══════════════════════════════════════════════════════════
//  COMANDOS
// ══════════════════════════════════════════════════════════

// %warnings [@usuário]
export async function cmdWarnings(message, args, ctx) {
  const { config, sendEmbed, COR, serverId } = ctx;
  const targetId = message.mentionIds?.[0] ?? message.authorId;
  const count  = db.contarAvisos(serverId, targetId);
  const limite = config.automod.punicao.warnsParaBan ?? 3;
  const silenciado = db.estaSilenciado(serverId, targetId);
  const linhas = [`<@${targetId}> tem **${count}/${limite}** aviso(s).`];
  if (silenciado) linhas.push("🔇 Está **silenciado** (o cargo é reaplicado se sair e voltar).");
  await sendEmbed(message.channel, {
    title: "📋 Avisos",
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
    return sendEmbed(message.channel, { title: "❌ Uso incorreto",
      description: `\`${PREFIXO}clearwarnings @usuário\``, colour: COR.erro });

  db.limparPunicao(ctx.serverId, targetId);
  await sendEmbed(message.channel, { title: "✅ Avisos limpos",
    description: `Os avisos de <@${targetId}> foram zerados.`, colour: COR.sucesso });
  await log.registrar(ctx, "punicoes", { titulo: "🧹 Avisos limpos",
    descricao: `<@${targetId}> teve os avisos zerados por <@${message.authorId}>.` });
}

// %automod status | %automod <módulo> <on|off> | %automod debug <on|off>   (ManagePermissions)
export async function cmdAutomod(message, args, ctx) {
  const { config, cfgGlobal, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, salvarGlobal, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const sub = args[0]?.toLowerCase();

  // %automod debug <on|off> — liga/desliga os logs (GLOBAL, todos os servidores)
  if (sub === "debug") {
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off")
      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}automod debug <on|off>\``, colour: COR.erro });
    cfgGlobal.debug = (v === "on");
    salvarGlobal();
    return sendEmbed(message.channel, { title: "🐛 Debug",
      description: `Logs de depuração **${cfgGlobal.debug ? "ativados 🟢" : "desativados 🔴"}** (global).`,
      colour: COR.mod });
  }

  const modulos = {
    antispam:        "antiSpam",
    antimassspam:    "antiMassSpam",
    antiinvite:      "antiInvite",
    antimassmention: "antiMassMention",
    anticaps:        "antiCaps",
    antilink:        "antiLink",
    antiscam:        "antiScam",
    anticaracteres:  "antiCaracteres",
    antirepeticao:   "antiRepeticao",
  };

  if (!sub || sub === "status") {
    const linhas = Object.entries(modulos).map(([nome, chave]) => {
      const on = config.automod[chave]?.enabled;
      return `${on ? "🟢" : "🔴"} **${nome}** — ${on ? "ativado" : "desativado"}`;
    });
    linhas.push(`${cfgGlobal.debug !== false ? "🟢" : "🔴"} **debug (global)** — ${cfgGlobal.debug !== false ? "ativado" : "desativado"}`);
    return sendEmbed(message.channel, { title: "🛡 Status do AutoMod",
      description: linhas.join("\n"), colour: COR.mod });
  }

  const chave = modulos[sub];
  if (!chave)
    return sendEmbed(message.channel, { title: "❌ Módulo desconhecido",
      description: `Módulos: ${Object.keys(modulos).map((m) => `\`${m}\``).join(", ")}, \`debug\``,
      colour: COR.erro });

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
    const linhas = [`${mod.enabled ? "🟢 ativado" : "🔴 desativado"}`];
    if (params) {
      linhas.push("", "**Parâmetros:**");
      for (const [nome, ck] of Object.entries(params)) linhas.push(`• \`${nome}\` = ${mod[ck]}`);
    }
    const pm = mod.punicao?.modo;
    linhas.push("", `**Punição:** ${pm ? `\`${pm}\` (própria)` : "_herda a global_ (`" + (config.automod.punicao?.modo ?? "avisar") + "`)"}`);
    linhas.push("", "**Como configurar:**",
      `\`${PREFIXO}automod ${sub} <on|off>\``,
      params ? `\`${PREFIXO}automod ${sub} set <parâmetro> <valor>\`` : null,
      `\`${PREFIXO}automod ${sub} punicao <${MODOS_PUN.join("|")}|herdar>\``,
    );
    return sendEmbed(message.channel, { title: `🛡 ${sub}`,
      description: linhas.filter((l) => l !== null).join("\n"), colour: COR.mod });
  }

  // ── set <parâmetro> <valor> ──
  if (acao === "set") {
    const params = PARAMS[sub];
    if (!params)
      return sendEmbed(message.channel, { title: "❌ Sem parâmetros",
        description: `O módulo \`${sub}\` não tem parâmetros ajustáveis.`, colour: COR.erro });
    const nome = args[2]?.toLowerCase();
    const bruto = args[3];
    const ck = params[nome];
    if (!ck || bruto === undefined)
      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}automod ${sub} set <${Object.keys(params).join("|")}> <valor>\``, colour: COR.erro });
    // 'ignorar' é texto (letras a ignorar, ex.: "k"); os demais são numéricos.
    if (ck === "ignorar") {
      mod[ck] = String(bruto).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
      salvarConfig();
      return sendEmbed(message.channel, { title: "🛡 Parâmetro atualizado",
        description: `\`${sub}.${nome}\` = **"${mod[ck]}"** (letras ignoradas na repetição)`, colour: COR.sucesso });
    }
    let valor = Number(bruto);
    if (Number.isNaN(valor) || valor < 0)
      return sendEmbed(message.channel, { title: "❌ Valor inválido",
        description: "O valor precisa ser um número positivo.", colour: COR.erro });
    // limiar/zalgo aceitam 0–1 (fração) ou 0–100 (porcentagem)
    if ((ck === "threshold" || ck === "limiteZalgo") && valor > 1) valor = valor / 100;
    mod[ck] = valor;
    salvarConfig();
    return sendEmbed(message.channel, { title: "🛡 Parâmetro atualizado",
      description: `\`${sub}.${nome}\` = **${valor}**`, colour: COR.sucesso });
  }

  // ── punicao <modo|herdar> ──
  if (acao === "punicao" || acao === "punição") {
    const modo = args[2]?.toLowerCase();
    if (modo === "herdar" || modo === "global" || modo === "null") {
      mod.punicao = null; salvarConfig();
      return sendEmbed(message.channel, { title: "🛡 Punição do módulo",
        description: `\`${sub}\` agora **herda a punição global** do servidor.`, colour: COR.sucesso });
    }
    if (!MODOS_PUN.includes(modo))
      return sendEmbed(message.channel, { title: "❌ Modo inválido",
        description: `Modos: ${MODOS_PUN.map((m) => `\`${m}\``).join(", ")}, ou \`herdar\`.\n\n`
          + "• `avisar` — só avisa\n• `apagar` — só remove a mensagem\n• `confirmar` — silencia e espera mod\n• `acumular` — soma avisos até banir\n• `banir` — ban imediato",
        colour: COR.erro });
    mod.punicao = { ...(mod.punicao ?? {}), modo };
    if (modo === "acumular" && !mod.punicao.warnsParaBan) mod.punicao.warnsParaBan = 3;
    salvarConfig();
    return sendEmbed(message.channel, { title: "🛡 Punição do módulo",
      description: `\`${sub}\` agora usa a punição **\`${modo}\`** (própria, independente da global).`,
      colour: COR.sucesso });
  }

  // ── on | off ──
  const novoEstado = acao;
  if (novoEstado !== "on" && novoEstado !== "off")
    return sendEmbed(message.channel, { title: "❌ Uso incorreto",
      description: [
        `\`${PREFIXO}automod ${sub} <on|off>\``,
        PARAMS[sub] ? `\`${PREFIXO}automod ${sub} set <parâmetro> <valor>\`` : null,
        `\`${PREFIXO}automod ${sub} punicao <modo>\``,
      ].filter(Boolean).join("\n"), colour: COR.erro });

  config.automod[chave].enabled = (novoEstado === "on");
  salvarConfig();
  return sendEmbed(message.channel, { title: "🛡 AutoMod atualizado",
    description: `**${sub}** foi **${novoEstado === "on" ? "ativado 🟢" : "desativado 🔴"}**.`,
    colour: COR.mod });
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
      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}whitelist add <link ou código>\``, colour: COR.erro });
    if (!config.inviteWhitelist.includes(codigo)) {
      config.inviteWhitelist.push(codigo);
      salvarConfig();
    }
    return sendEmbed(message.channel, { title: "✅ Convite liberado",
      description: `O convite \`${codigo}\` agora é permitido.`, colour: COR.sucesso });
  }

  if (sub === "remove") {
    config.inviteWhitelist = config.inviteWhitelist.filter((c) => c !== codigo);
    salvarConfig();
    return sendEmbed(message.channel, { title: "✅ Removido",
      description: `O convite \`${codigo}\` não está mais na whitelist.`, colour: COR.sucesso });
  }

  if (sub === "list") {
    const lista = config.inviteWhitelist.length
      ? config.inviteWhitelist.map((c) => `• \`${c}\``).join("\n")
      : "_Nenhum convite na whitelist._";
    return sendEmbed(message.channel, { title: "📃 Convites permitidos",
      description: lista, colour: COR.info });
  }

  return sendEmbed(message.channel, { title: "❌ Uso incorreto",
    description: `\`${PREFIXO}whitelist <add|remove|list> [convite]\``, colour: COR.erro });
}

// %blocklist <add|remove|adddomain|removedomain|list|clear|reload> [url|domínio]
// (ManagePermissions)
export async function cmdBlocklist(message, args, ctx) {
  const { cfgGlobal, estado, sendEmbed, COR, getServer, membroTemPermissao, salvarGlobal, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const sub = args[0]?.toLowerCase();
  const arg = args[1];

  // ── Adicionar uma FONTE (URL de lista Pi-hole) ──
  if (sub === "add") {
    if (!arg || !/^https?:\/\//.test(arg))
      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}blocklist add <url>\`\nPara um único domínio use \`${PREFIXO}blocklist adddomain <domínio>\``,
        colour: COR.erro });
    if (cfgGlobal.linkBlocklistSources.includes(arg))
      return sendEmbed(message.channel, { description: "Essa lista já foi adicionada.", colour: COR.aviso });

    await sendEmbed(message.channel, { description: "⏳ Baixando lista, aguarde…", colour: COR.info });
    cfgGlobal.linkBlocklistSources.push(arg);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, { title: "✅ Lista adicionada",
      description: `Fonte adicionada. Total de domínios bloqueados: **${estado.blockedDomains.size}**.`,
      colour: COR.sucesso });
  }

  // ── Adicionar um ÚNICO domínio manualmente ──
  if (sub === "adddomain") {
    const dominio = (arg ?? "")
      .replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "").toLowerCase();
    if (!dominio || !DOMINIO_VALIDO.test(dominio))
      return sendEmbed(message.channel, { title: "❌ Domínio inválido",
        description: `Ex.: \`${PREFIXO}blocklist adddomain 02giga.link\``, colour: COR.erro });
    if (!cfgGlobal.linkBlocklistManual.includes(dominio)) {
      cfgGlobal.linkBlocklistManual.push(dominio);
      salvarGlobal();
      await rebuildBlocklist(ctx);
    }
    return sendEmbed(message.channel, { title: "✅ Domínio bloqueado",
      description: `\`${dominio}\` foi adicionado. Total: **${estado.blockedDomains.size}** domínio(s).`,
      colour: COR.sucesso });
  }

  // ── Remover um único domínio manual ──
  if (sub === "removedomain") {
    const dominio = (arg ?? "").toLowerCase();
    cfgGlobal.linkBlocklistManual = cfgGlobal.linkBlocklistManual.filter((d) => d !== dominio);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, { title: "✅ Domínio removido",
      description: `\`${dominio}\` foi removido. Total: **${estado.blockedDomains.size}** domínio(s).`,
      colour: COR.sucesso });
  }

  // ── Remover uma fonte (URL) ──
  if (sub === "remove") {
    if (!arg)
      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}blocklist remove <url>\``, colour: COR.erro });
    cfgGlobal.linkBlocklistSources = cfgGlobal.linkBlocklistSources.filter((u) => u !== arg);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, { title: "✅ Lista removida",
      description: `Total de domínios bloqueados agora: **${estado.blockedDomains.size}**.`,
      colour: COR.sucesso });
  }

  if (sub === "list") {
    const fontes = cfgGlobal.linkBlocklistSources.length
      ? cfgGlobal.linkBlocklistSources.map((u) => `• ${u}`).join("\n")
      : "_Nenhuma fonte (URL) adicionada._";
    const manuais = cfgGlobal.linkBlocklistManual.length
      ? cfgGlobal.linkBlocklistManual.map((d) => `• \`${d}\``).join("\n")
      : "_Nenhum domínio manual._";
    return sendEmbed(message.channel, { title: "📃 Bloqueios anti-link",
      description: `**Fontes (URLs):**\n${fontes}\n\n**Domínios manuais:**\n${manuais}\n\n**Total carregado:** ${estado.blockedDomains.size}`,
      colour: COR.info });
  }

  if (sub === "clear") {
    cfgGlobal.linkBlocklistSources = [];
    cfgGlobal.linkBlocklistManual = [];
    salvarGlobal();
    estado.blockedDomains = new Set();
    return sendEmbed(message.channel, { title: "🗑 Listas limpas",
      description: "Todas as fontes e domínios foram removidos.", colour: COR.sucesso });
  }

  if (sub === "reload") {
    await sendEmbed(message.channel, { description: "⏳ Recarregando listas…", colour: COR.info });
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, { title: "🔄 Listas recarregadas",
      description: `Total de domínios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso });
  }

  return sendEmbed(message.channel, { title: "❌ Uso incorreto",
    description: [
      `\`${PREFIXO}blocklist add <url>\` — adiciona lista Pi-hole`,
      `\`${PREFIXO}blocklist adddomain <domínio>\` — bloqueia 1 domínio`,
      `\`${PREFIXO}blocklist removedomain <domínio>\``,
      `\`${PREFIXO}blocklist remove <url>\``,
      `\`${PREFIXO}blocklist list | clear | reload\``,
    ].join("\n"),
    colour: COR.erro });
}

// %scam <config|mode|punishment|sensitivity|channel|silencerole|ban|dismiss|test>
// (ManagePermissions)
export async function cmdScam(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const cfg = config.automod.antiScam;
  const pol = config.automod.punicao;
  const sub = args[0]?.toLowerCase();
  const val = args[1];
  const limiarDe = (sens) => ({ baixa: 7, media: 6, alta: 5 })[sens] ?? 6;

  if (!sub || sub === "config" || sub === "status") {
    return sendEmbed(message.channel, {
      title: "🛡 Conteúdo proibido (scorecard único)",
      colour: COR.mod,
      description: [
        `**Ativado:** ${cfg.enabled ? "🟢 sim" : "🔴 não"}  (ligue com \`${PREFIXO}automod antiscam on\`)`,
        `**Sensibilidade:** ${cfg.sensitivity}  (limiar da nota: ${limiarDe(cfg.sensitivity)}/10)`,
        `**Canal de aviso:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(usa o canal da mensagem)_"}`,
        `**Punição:** definida em \`${PREFIXO}punicao\` (modo atual: **${pol.modo}**) — vale para todos os automods`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}scam sensitivity <baixa|media|alta>\``,
        `\`${PREFIXO}scam channel <id|aqui>\``,
        `\`${PREFIXO}scam test <texto>\` · \`${PREFIXO}scam simulate <texto>\``,
        `\`${PREFIXO}scam ban <userId>\` · \`${PREFIXO}scam dismiss <userId>\``,
      ].join("\n"),
    });
  }

  if (sub === "sensitivity") {
    const opc = ["baixa", "media", "alta"];
    if (!opc.includes(val))
      return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}scam sensitivity <${opc.join("|")}>\``, colour: COR.erro });
    cfg.sensitivity = val; salvarConfig();
    return sendEmbed(message.channel, { title: "✅ Sensibilidade", description: `Sensibilidade: **${val}** (limiar ${limiarDe(val)}/10).`, colour: COR.sucesso });
  }

  if (sub === "channel") {
    if (!val) return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}scam channel <id|aqui>\``, colour: COR.erro });
    cfg.alertChannelId = (val.toLowerCase() === "aqui" || val.toLowerCase() === "here")
      ? message.channelId : val.replace(/[<#>]/g, "");
    salvarConfig();
    return sendEmbed(message.channel, { title: "✅ Canal de aviso",
      description: `Avisos irão para \`${cfg.alertChannelId}\`.`, colour: COR.sucesso });
  }

  if (sub === "ban") {
    const uid = (val ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}scam ban <userId>\``, colour: COR.erro });
    try {
      await server.banUser(uid, { reason: "[AutoMod] Confirmado por moderador" });
      return sendEmbed(message.channel, { title: "🔨 Banido", description: `<@${uid}> foi banido (confirmado).`, colour: COR.erro });
    } catch (err) {
      return sendEmbed(message.channel, { title: "❌ Erro", description: `Não foi possível banir: ${err.message}`, colour: COR.erro });
    }
  }

  if (sub === "dismiss") {
    const uid = (val ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}scam dismiss <userId>\``, colour: COR.erro });
    try {
      if (pol.silenceRoleId) await removerCargoSilence(server, uid, pol.silenceRoleId, ctx);
      db.limparPunicao(ctx.serverId, uid);   // some do banco: não reaplica ao reentrar
      await log.registrar(ctx, "punicoes", { titulo: "✅ Punição removida",
        descricao: `<@${uid}> foi liberado por <@${message.authorId}>.` });
      return sendEmbed(message.channel, { title: "✅ Liberado", description: `Punição de <@${uid}> removida.`, colour: COR.sucesso });
    } catch (err) {
      return sendEmbed(message.channel, { title: "❌ Erro", description: `Não foi possível liberar: ${err.message}`, colour: COR.erro });
    }
  }

  if (sub === "test") {
    const texto = args.slice(1).join(" ");
    if (!texto) return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}scam test <texto>\``, colour: COR.erro });
    const r = analisarConteudo(texto, { rate: 1 });
    const limiar = limiarDe(cfg.sensitivity);
    const flag = r.nota >= limiar;

    console.log(`[SCAM TEST] nota=${r.nota.toFixed(1)}/${limiar} flag=${flag} grave=${r.grave} sinais=[${r.sinais.join(", ") || "nenhum"}]`);

    const acaoTxt = !cfg.enabled
      ? `módulo **DESATIVADO** (ative com \`${PREFIXO}automod antiscam on\`)`
      : `aplicaria a política global **${pol.modo}** (veja \`${PREFIXO}punicao\`)`;

    return sendEmbed(message.channel, {
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
    if (!texto) return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}scam simulate <texto>\``, colour: COR.erro });
    await simularDeteccao(texto, ctx, message.channel);
    return sendEmbed(message.channel, { title: "🧪 Simulação enviada",
      description: `Resultado enviado ao canal de avisos${cfg.alertChannelId ? ` (\`${cfg.alertChannelId}\`)` : " (este canal)"}. Nada foi punido.`,
      colour: COR.info });
  }

  return sendEmbed(message.channel, { title: "❌ Subcomando desconhecido",
    description: `Use \`${PREFIXO}scam config\` para ver as opções.`, colour: COR.erro });
}

// ══════════════════════════════════════════════════════════
//  &punicao — política de punição GLOBAL (todos os automods)
// ══════════════════════════════════════════════════════════
export async function cmdPunicao(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const pol = config.automod.punicao;
  const sub = args[0]?.toLowerCase();
  const val = args[1];

  const rotulo = (m) =>
      m === "banir"     ? "banimento imediato"
    : m === "acumular"  ? `avisos acumulados → ban em ${pol.warnsParaBan}`
    : m === "confirmar" ? "confirmar (silencia e espera moderador)"
    :                     "apenas aviso (não apaga nem pune)";

  if (!sub || sub === "status" || sub === "config") {
    return sendEmbed(message.channel, {
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
        `_Prefere um assistente? \`${PREFIXO}setup\` configura isso e o resto._`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
        `\`${PREFIXO}punicao warns <número>\``,
        `\`${PREFIXO}punicao silencerole <id>\``,
      ].join("\n"),
    });
  }

  if (sub === "modo" || sub === "mode") {
    if (!["avisar", "apagar", "confirmar", "acumular", "banir"].includes(val))
      return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}punicao modo <avisar|apagar|confirmar|acumular|banir>\``, colour: COR.erro });
    pol.modo = val; salvarConfig();
    return sendEmbed(message.channel, { title: "✅ Modo de punição atualizado",
      description: `Agora: **${val}** — ${rotulo(val)}.`, colour: COR.sucesso });
  }

  if (sub === "warns" || sub === "warnsparaban") {
    const n = parseInt(val, 10);
    if (!Number.isInteger(n) || n < 1 || n > 20)
      return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}punicao warns <1-20>\``, colour: COR.erro });
    pol.warnsParaBan = n; salvarConfig();
    return sendEmbed(message.channel, { title: "✅ Avisos para ban",
      description: `No modo \`acumular\`, o ban ocorre em **${n}** avisos.`, colour: COR.sucesso });
  }

  if (sub === "silencerole" || sub === "cargo") {
    if (!val) return sendEmbed(message.channel, { title: "❌ Uso", description: `\`${PREFIXO}punicao silencerole <id>\``, colour: COR.erro });
    pol.silenceRoleId = val.replace(/[<@&>]/g, ""); salvarConfig();
    return sendEmbed(message.channel, { title: "✅ Cargo de silêncio",
      description: `Cargo para silenciar: \`${pol.silenceRoleId}\` (usado no modo \`confirmar\`).`, colour: COR.sucesso });
  }

  return sendEmbed(message.channel, { title: "❌ Subcomando desconhecido",
    description: `Use \`${PREFIXO}punicao status\` para ver as opções.`, colour: COR.erro });
}

// ── Helper interno de negação de permissão ─────────────────
function negarPermissao(ctx, channel, permName) {
  return ctx.sendEmbed(channel, {
    title: "🚫 Permissão insuficiente",
    description: `Você precisa da permissão **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  });
}
