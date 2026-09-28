
import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";
import * as silencio from "./silencio.js";
import { descreverErro } from "../core/erros.js";

export const GRANT_ALL_SAFE = 0x000fffffffffffffn;

export async function cmdComando(message, args, ctx) {
  const { config, estado, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para gerenciar comandos.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to manage commands.", colour: COR.erro }));

  config.comandosDesativados ??= [];
  const geren = estado.comandosGerenciaveisDe?.(ctx.serverId) ?? estado.COMANDOS_GERENCIAVEIS ?? [];
  const canon = (nome) => (estado.CANONICO?.[nome] ?? nome);

  const sub = args[0]?.toLowerCase();

  // ── &comando → status ──
  if (!sub) {
    const linhas = geren.map((c) => {
      const off = config.comandosDesativados.includes(c);
      return `${off ? "🔴" : "🟢"} \`${c}\``;
    });
    return sendEmbed(message.channel, lang === "en" ? {
      title: "🎛 Server commands",
      description: [
        "🟢 active · 🔴 disabled",
        "",
        linhas.join("  "),
        "",
        "**Usage:**",
        `\`${PREFIXO}comando disable <name>\` — disables`,
        `\`${PREFIXO}comando enable <name>\` — re-enables`,
        "",
        "_`help` and `comando` can't be disabled (so you can't lock yourself out)._",
      ].join("\n"),
      colour: COR.mod,
    } : {
      title: "🎛 Comandos do servidor",
      description: [
        "🟢 ativo · 🔴 desativado",
        "",
        linhas.join("  "),
        "",
        "**Uso:**",
        `\`${PREFIXO}comando desativar <nome>\` — desativa`,
        `\`${PREFIXO}comando ativar <nome>\` — reativa`,
        "",
        "_`help` e `comando` não podem ser desativados (para você não se trancar para fora)._",
      ].join("\n"),
      colour: COR.mod,
    });
  }

  const DESLIGA = new Set(["disable", "off", "desativar", "desligar", "desabilitar"]);
  const LIGA    = new Set(["enable", "on", "ativar", "ligar", "habilitar", "reativar"]);
  if (!DESLIGA.has(sub) && !LIGA.has(sub)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso incorreto", description: `\`${PREFIXO}comando <desativar|ativar> <nome>\``, colour: COR.erro },
      { title: "❌ Wrong usage", description: `\`${PREFIXO}comando <disable|enable> <name>\``, colour: COR.erro }));
  }

  const alvo = canon(args[1]?.toLowerCase());
  if (!alvo)
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Falta o comando",
        description: `Diga qual comando. Ex.: \`${PREFIXO}comando desativar ban\``, colour: COR.erro },
      { title: "❌ Missing the command",
        description: `Tell me which command. E.g.: \`${PREFIXO}comando disable ban\``, colour: COR.erro }));

  if (!geren.includes(alvo)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Comando inválido",
      description: `\`${alvo}\` não pode ser gerenciado.\nGerenciáveis: ${geren.map((c) => `\`${c}\``).join(", ")}`,
      colour: COR.erro,
    }, {
      title: "❌ Invalid command",
      description: `\`${alvo}\` can't be managed.\nManageable: ${geren.map((c) => `\`${c}\``).join(", ")}`,
      colour: COR.erro,
    }));
  }

  const desativar = DESLIGA.has(sub);
  const jaDesativado = config.comandosDesativados.includes(alvo);

  if (desativar && !jaDesativado) config.comandosDesativados.push(alvo);
  if (!desativar && jaDesativado)
    config.comandosDesativados = config.comandosDesativados.filter((c) => c !== alvo);
  salvarConfig();

  await log.registrar(ctx, "comandos", {
    titulo: desativar ? "🔴 Comando desativado" : "🟢 Comando reativado",
    descricao: `<@${message.authorId}> ${desativar ? "desativou" : "reativou"} \`${PREFIXO}${alvo}\`.`,
  });

  return sendEmbed(message.channel, lang === "en" ? {
    title: desativar ? "🔴 Command disabled" : "🟢 Command re-enabled",
    description: `\`${PREFIXO}${alvo}\` is now **${desativar ? "disabled" : "active"}** on this server.`,
    colour: COR.mod,
  } : {
    title: desativar ? "🔴 Comando desativado" : "🟢 Comando reativado",
    description: `\`${PREFIXO}${alvo}\` agora está **${desativar ? "desativado" : "ativo"}** neste servidor.`,
    colour: COR.mod,
  });
}

export async function negarEmTodosOsCanais(server, roleId) {
  const deny = Number(GRANT_ALL_SAFE);
  let ok = 0, falhas = 0;
  const canais = server.channels ?? [];
  const alvo = canais.filter((c) => c && (c.type === "TextChannel" || c.type === "VoiceChannel"));
  for (const canal of alvo) {
    try {
      await canal.setPermissions(roleId, { allow: 0, deny });
      ok++;
    } catch (err) {
      falhas++;
      console.error(`[CARGOMUDO][CANAL ${canal.id}]`, err?.message);
    }
  }
  return { ok, falhas, total: alvo.length };
}

export async function criarCargoMudo(server, nome = "Silenciado", porCanal = false) {
  // 1) cria o cargo
  const criado = await server.createRole(nome);
  const roleId = criado?.id ?? criado?.role?._id ?? criado?.role?.id;
  if (!roleId) throw new Error("a API não retornou o ID do cargo criado");

  // 2) nega TODAS as permissões no nível do SERVIDOR (allow 0, deny tudo)
  await server.setPermissions(roleId, { allow: 0, deny: Number(GRANT_ALL_SAFE) });

  // 3) opcional: nega também em cada canal (cobre canais com permissões próprias)
  let canais = null;
  if (porCanal) canais = await negarEmTodosOsCanais(server, roleId);

  return { id: roleId, nome, canais };
}

export async function cmdCargoMudo(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para criar cargos.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to create roles.", colour: COR.erro }));

  // ── &cargomudo canais → reaplica a negação em todos os canais no cargo JÁ definido ──
  if (args[0]?.toLowerCase() === "canais") {
    const roleId = config.automod?.punicao?.silenceRoleId;
    if (!roleId)
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Sem cargo de silêncio",
        description: `Nenhum cargo de silêncio definido. Crie um com \`${PREFIXO}cargomudo\` ou defina com \`${PREFIXO}automod punicao silencerole <id>\`.`,
        colour: COR.erro,
      }, {
        title: "❌ No silence role",
        description: `No silence role set. Create one with \`${PREFIXO}cargomudo\` or set one with \`${PREFIXO}automod punicao silencerole <id>\`.`,
        colour: COR.erro,
      }));
    try {
      const r = await negarEmTodosOsCanais(server, roleId);
      await log.registrar(ctx, "cargos", { titulo: "🔇 Silêncio aplicado nos canais",
        descricao: `<@${message.authorId}> reaplicou o cargo de silêncio em ${r.ok}/${r.total} canal(is).` });
      return sendEmbed(message.channel, lang === "en" ? {
        title: "🔇 Silence applied to the channels",
        description: [
          `**Role:** \`${roleId}\``,
          `**Channels blocked:** ${r.ok}/${r.total}`,
          r.falhas ? `**Failures:** ${r.falhas} (channels where the bot has no access)` : null,
        ].filter(Boolean).join("\n"),
        colour: COR.sucesso,
      } : {
        title: "🔇 Silêncio aplicado nos canais",
        description: [
          `**Cargo:** \`${roleId}\``,
          `**Canais bloqueados:** ${r.ok}/${r.total}`,
          r.falhas ? `**Falhas:** ${r.falhas} (canais onde o bot não tem acesso)` : null,
        ].filter(Boolean).join("\n"),
        colour: COR.sucesso });
    } catch (err) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Falha", description: err.message, colour: COR.erro },
        { title: "❌ Failure", description: err.message, colour: COR.erro }));
    }
  }

  // ── &cargomudo verificar → só confere o cargo atual ──
  const sub = args[0]?.toLowerCase();
  const autoroleId = config.autorole?.roleId ?? null;
  if (sub === "verificar" || sub === "check") {
    const roleId = config.automod?.punicao?.silenceRoleId;
    if (!roleId) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Sem cargo de silêncio", description: `Crie um com \`${PREFIXO}cargomudo\` ou adote um existente com \`${PREFIXO}cargomudo usar @cargo\`.`, colour: COR.erro },
      { title: "❌ No silence role", description: `Create one with \`${PREFIXO}cargomudo\` or adopt one with \`${PREFIXO}cargomudo usar @role\`.`, colour: COR.erro }));
    const botMember = await silencio.membroDoBot(server, ctx.client);
    const c = silencio.conferir(server, roleId, { botMember, autoroleId, lang });
    return sendEmbed(message.channel, relatorioSilencio({ id: roleId, conferencia: c }, { lang, P: PREFIXO, COR, soConferencia: true }));
  }

  // ── &cargomudo usar <@cargo|id> → adota um cargo que já existe ──
  let roleId = null;
  if (sub === "usar" || sub === "use") {
    roleId = String(args[1] ?? "").replace(/[<%@&>]/g, "").trim() || null;
    if (!roleId || !silencio.cargoExiste(server, roleId)) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Cargo não encontrado", description: `Use \`${PREFIXO}cargomudo usar @cargo\` com um cargo **deste** servidor.`, colour: COR.erro },
      { title: "❌ Role not found", description: `Use \`${PREFIXO}cargomudo usar @role\` with a role from **this** server.`, colour: COR.erro }));
  }
  const nome = roleId ? null : (args.join(" ").trim() || (lang === "en" ? "Silenced" : "Silenciado"));

  try {
    // Cria (ou adota), nega no servidor e em cada canal, põe logo abaixo do
    // cargo do bot e CONFERE simulando alguém com o cargo automático.
    const r = await silencio.preparar(server, ctx.client, { roleId, nome: nome ?? undefined, autoroleId, lang });
    config.automod ??= {};
    config.automod.punicao ??= {};
    config.automod.punicao.silenceRoleId = r.id;
    salvarConfig();
    await log.registrar(ctx, "cargos", {
      titulo: r.criado ? "🔇 Cargo de silêncio criado" : "🔇 Cargo de silêncio configurado",
      descricao: `<@${message.authorId}> ${r.criado ? "criou" : "configurou"} o cargo de silêncio <%${r.id}> — canais ${r.canais.ok}/${r.canais.total}, `
        + (r.conferencia.ok ? "conferência ok." : `${r.conferencia.problemas.length} pendência(s).`),
    });
    return sendEmbed(message.channel, relatorioSilencio(r, { lang, P: PREFIXO, COR }));
  } catch (err) {
    const msg = descreverErro(err, lang);
    console.error("[CARGOMUDO]", msg);
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível preparar o cargo",
      description: `**Erro:** ${msg}\n\n_O bot precisa de **ManageRole** (criar e posicionar), **ManagePermissions** (negar nos canais) e **AssignRoles** (dar o cargo)._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't prepare the role",
      description: `**Error:** ${msg}\n\n_The bot needs **ManageRole** (create and position), **ManagePermissions** (deny in channels) and **AssignRoles** (give the role)._`,
      colour: COR.erro,
    }));
  }
}


// O relatório do cargo de silêncio: o que foi feito e a conferência.
function relatorioSilencio(r, { lang = "pt", P = "&", COR, soConferencia = false }) {
  const en = lang === "en";
  const c = r.conferencia;
  const linhas = [`**${en ? "Role" : "Cargo"}:** <%${r.id}> (\`${r.id}\`)`];
  if (!soConferencia) {
    linhas.push(`**${en ? "Channels denied" : "Canais negados"}:** ${r.canais.ok}/${r.canais.total}${r.canais.falhas ? (en ? ` — ${r.canais.falhas} without bot access` : ` — ${r.canais.falhas} sem acesso do bot`) : ""}`);
    linhas.push(`**${en ? "Position" : "Posição"}:** ${r.posicao?.ok
      ? (en ? "right below the bot's role ✅" : "logo abaixo do cargo do bot ✅")
      : `❌ ${r.posicao?.motivo ?? "?"}`}`);
  }
  linhas.push("");
  if (c.ok) {
    linhas.push(en
      ? `✅ **Checked:** a silenced member — **even with the auto role** — can't talk in any of the ${c.canais.total} channel(s).`
      : `✅ **Conferido:** um silenciado — **mesmo com o cargo automático** — não fala em nenhum dos ${c.canais.total} canal(is).`);
  } else {
    linhas.push(en ? "⚠️ **Check found problems:**" : "⚠️ **A conferência achou problemas:**", ...c.problemas.map((x) => `• ${x}`), "");
    linhas.push(en
      ? `**How to fix:** in Server settings → Roles, drag the **bot's role** to the top (above every member role), then run \`${P}cargomudo usar <%${r.id}>\` again.`
      : `**Como resolver:** em Configurações do servidor → Cargos, arraste o **cargo do bot** para o topo (acima de todo cargo de membro) e rode \`${P}cargomudo usar <%${r.id}>\` de novo.`);
  }
  linhas.push("", en
    ? `💡 _New channels later? \`${P}cargomudo canais\` · check anytime: \`${P}cargomudo verificar\`_`
    : `💡 _Canais novos depois? \`${P}cargomudo canais\` · conferir a qualquer hora: \`${P}cargomudo verificar\`_`);
  return {
    title: c.ok ? (en ? "🔇 Silence role ready" : "🔇 Cargo de silêncio pronto") : (en ? "⚠️ Silence role — needs attention" : "⚠️ Cargo de silêncio — precisa de ajuste"),
    description: linhas.join("\n"),
    colour: c.ok ? COR.sucesso : COR.aviso,
  };
}
