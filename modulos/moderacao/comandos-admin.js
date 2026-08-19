// ══════════════════════════════════════════════════════════
//  comandos-admin.js — &comando e &cargomudo
//
//  &comando                       → lista comandos e seu estado
//  &comando disable <nome>        → desativa um comando neste servidor
//  &comando enable  <nome>        → reativa um comando
//
//  &cargomudo [nome]              → cria um cargo com TODAS as permissões
//                                   negadas (serve para silenciar) e já o
//                                   define como cargo de silêncio do servidor
//
//  Ambos exigem ManagePermissions.
// ══════════════════════════════════════════════════════════

import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";

// Máscara "todas as permissões (segura)" do Stoat — confirmada na SDK:
// Permission.GrantAllSafe = 0x000fffffffffffff
const GRANT_ALL_SAFE = 0x000fffffffffffffn;

// ──────────────────────────────────────────────────────────
//  &comando — ativar/desativar comandos
// ──────────────────────────────────────────────────────────
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
        `\`${PREFIXO}comando disable <nome>\` — desativa`,
        `\`${PREFIXO}comando enable <nome>\` — reativa`,
        "",
        "_`help` e `comando` não podem ser desativados (para você não se trancar para fora)._",
      ].join("\n"),
      colour: COR.mod,
    });
  }

  if (sub !== "disable" && sub !== "enable" && sub !== "on" && sub !== "off") {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso incorreto", description: `\`${PREFIXO}comando <disable|enable> <nome>\``, colour: COR.erro },
      { title: "❌ Wrong usage", description: `\`${PREFIXO}comando <disable|enable> <name>\``, colour: COR.erro }));
  }

  const alvo = canon(args[1]?.toLowerCase());
  if (!alvo)
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Falta o comando",
        description: `Diga qual comando. Ex.: \`${PREFIXO}comando disable ban\``, colour: COR.erro },
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

  const desativar = (sub === "disable" || sub === "off");
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

// Nega o cargo em cada canal de texto/voz do servidor.
// Devolve { ok, falhas, total } — nunca lança (canais podem ter restrições).
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

// ──────────────────────────────────────────────────────────
//  Cria um cargo de silêncio (todas as permissões negadas).
//  Reutilizável pelo &setup. Devolve { id, nome } ou lança.
//  Se `porCanal` for true, também nega em cada canal.
// ──────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────
//  &cargomudo [nome]
// ──────────────────────────────────────────────────────────
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
        description: `Nenhum cargo de silêncio definido. Crie um com \`${PREFIXO}cargomudo\` ou defina com \`${PREFIXO}punicao silencerole <id>\`.`,
        colour: COR.erro,
      }, {
        title: "❌ No silence role",
        description: `No silence role set. Create one with \`${PREFIXO}cargomudo\` or set one with \`${PREFIXO}punicao silencerole <id>\`.`,
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

  const nome = args.join(" ").trim() || (lang === "en" ? "Silenced" : "Silenciado");

  try {
    // cria o cargo E já nega em todos os canais
    const { id, canais } = await criarCargoMudo(server, nome, true);

    // já define como cargo de silêncio da política de punição
    config.automod ??= {};
    config.automod.punicao ??= {};
    config.automod.punicao.silenceRoleId = id;
    salvarConfig();

    await log.registrar(ctx, "cargos", {
      titulo: "🔇 Cargo de silêncio criado",
      descricao: `<@${message.authorId}> criou o cargo **${nome}** (\`${id}\`) com todas as permissões negadas`
               + (canais ? ` e bloqueou ${canais.ok}/${canais.total} canal(is).` : "."),
    });

    return sendEmbed(message.channel, lang === "en" ? {
      title: "🔇 Silence role created",
      description: [
        `**Name:** ${nome}`,
        `**ID:** \`${id}\``,
        `**Permissions:** all denied (server-wide)`,
        canais ? `**Channels blocked:** ${canais.ok}/${canais.total}${canais.falhas ? ` (${canais.falhas} without bot access)` : ""}` : null,
        "",
        "✅ Already set as this server's **silence role**.",
        "",
        `💡 _Created new channels later? Run \`${PREFIXO}cargomudo canais\` to block them too._`,
      ].filter(Boolean).join("\n"),
      colour: COR.sucesso,
    } : {
      title: "🔇 Cargo de silêncio criado",
      description: [
        `**Nome:** ${nome}`,
        `**ID:** \`${id}\``,
        `**Permissões:** todas negadas (no servidor)`,
        canais ? `**Canais bloqueados:** ${canais.ok}/${canais.total}${canais.falhas ? ` (${canais.falhas} sem acesso do bot)` : ""}` : null,
        "",
        "✅ Já definido como **cargo de silêncio** deste servidor.",
        "",
        `💡 _Criou canais novos depois? Rode \`${PREFIXO}cargomudo canais\` para bloqueá-los também._`,
      ].filter(Boolean).join("\n"),
      colour: COR.sucesso,
    });
  } catch (err) {
    console.error("[CARGOMUDO]", err.message);
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível criar o cargo",
      description: `**Erro:** ${err.message}\n\n_Verifique se o bot tem **ManageRole** e **AssignRoles**._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't create the role",
      description: `**Error:** ${err.message}\n\n_Check that the bot has **ManageRole** and **AssignRoles**._`,
      colour: COR.erro,
    }));
  }
}
