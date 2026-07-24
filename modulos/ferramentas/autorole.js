// ══════════════════════════════════════════════════════════
//  autorole.js — cargo automático para quem entra no servidor
//
//  Define UM cargo que é dado a todo novo membro assim que entra.
//  Comandos:
//   &autorole              → mostra o cargo configurado
//   &autorole set <@cargo|id>  → define o cargo
//   &autorole off          → desativa
// ══════════════════════════════════════════════════════════

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// Extrai um ID de cargo de "<@&ID>", "<%ID>" ou ID cru.
function extrairRoleId(txt) {
  if (!txt) return null;
  const limpo = txt.replace(/[<@&%>]/g, "").trim();
  return ULID.test(limpo) ? limpo : null;
}

// ── Comando &autorole ──────────────────────────────────────
export async function cmdAutorole(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config, getServer, membroTemPermissao, salvarConfig } = ctx;
  const sub = args[0]?.toLowerCase();

  // ver estado (não exige permissão)
  if (!sub) {
    const atual = config.autorole?.roleId;
    return sendEmbed(message.channel, {
      title: "🎭 Autorole",
      description: atual
        ? `Novos membros recebem automaticamente o cargo <@&${atual}>.\n\nPara trocar: \`${PREFIXO}autorole set <@cargo>\` · desativar: \`${PREFIXO}autorole off\``
        : `Nenhum cargo automático definido.\n\nPara ativar: \`${PREFIXO}autorole set <@cargo>\``,
      colour: COR.mod,
    });
  }

  // daqui em diante, exige permissão
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageRole")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManageRole** para configurar o autorole.", colour: COR.erro });
  }

  if (sub === "off" || sub === "desativar" || sub === "remover") {
    config.autorole.roleId = null;
    salvarConfig();
    return sendEmbed(message.channel, { title: "🎭 Autorole desativado",
      description: "Novos membros não receberão cargo automático.", colour: COR.sucesso });
  }

  if (sub === "set" || sub === "definir") {
    const roleId = extrairRoleId(args[1]);
    if (!roleId)
      return sendEmbed(message.channel, { title: "❌ Cargo inválido",
        description: `Informe um cargo. Ex.: \`${PREFIXO}autorole set <@cargo>\` ou o ID do cargo.`, colour: COR.erro });

    // confirma que o cargo existe no servidor
    const existe = server.roles?.get?.(roleId);
    if (!existe)
      return sendEmbed(message.channel, { title: "❌ Cargo não encontrado",
        description: "Esse cargo não existe neste servidor.", colour: COR.erro });

    config.autorole.roleId = roleId;
    salvarConfig();
    return sendEmbed(message.channel, { title: "🎭 Autorole definido",
      description: `Novos membros agora recebem <@&${roleId}> automaticamente.`, colour: COR.sucesso });
  }

  return sendEmbed(message.channel, { title: "🎭 Autorole",
    description: `Uso: \`${PREFIXO}autorole set <@cargo>\` · \`${PREFIXO}autorole off\``, colour: COR.info });
}

// ── Aplicação no join ──────────────────────────────────────
// Chamado pelo handler serverMemberJoin do main.
export async function aoEntrar(member, ctx) {
  const roleId = ctx.config?.autorole?.roleId;
  if (!roleId) return;
  try {
    const userId = member?.id?.user;
    const server = await ctx.getServer({ serverId: ctx.serverId });
    const alvo = await server.fetchMember(userId).catch(() => null);
    if (!alvo) return;
    const atuais = new Set(alvo.roles ?? []);
    if (atuais.has(roleId)) return;   // já tem
    atuais.add(roleId);
    await alvo.edit({ roles: [...atuais] });
    console.log(`[AUTOROLE] cargo ${roleId} dado a ${userId} em ${ctx.serverId}`);
  } catch (e) {
    console.error("[AUTOROLE]", e.message);
  }
}
