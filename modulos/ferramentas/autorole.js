import { ULID } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";

// Extrai um ID de cargo de "<@&ID>", "<%ID>" ou ID cru.
function extrairRoleId(txt) {
  if (!txt) return null;
  const limpo = txt.replace(/[<@&%>]/g, "").trim();
  return ULID.test(limpo) ? limpo : null;
}

export async function cmdAutorole(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config, getServer, membroTemPermissao, salvarConfig } = ctx;
  const sub = args[0]?.toLowerCase();

  // ver estado (não exige permissão)
  if (!sub) {
    const atual = config.autorole?.roleId;
    return sendEmbed(message.channel, tr(ctx, {
      title: "🎭 Autorole",
      description: atual
        ? `Novos membros recebem automaticamente o cargo <@&${atual}>.\n\nPara trocar: \`${PREFIXO}autorole set <@cargo>\` · desativar: \`${PREFIXO}autorole off\``
        : `Nenhum cargo automático definido.\n\nPara ativar: \`${PREFIXO}autorole set <@cargo>\``,
      colour: COR.mod,
    }, {
      title: "🎭 Autorole",
      description: atual
        ? `New members automatically receive the <@&${atual}> role.\n\nTo change it: \`${PREFIXO}autorole set <@role>\` · disable: \`${PREFIXO}autorole off\``
        : `No automatic role set.\n\nTo enable it: \`${PREFIXO}autorole set <@role>\``,
      colour: COR.mod,
    }));
  }

  // daqui em diante, exige permissão
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageRole")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageRole** para configurar o autorole.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageRole** to configure autorole.", colour: COR.erro }));
  }

  if (sub === "off" || sub === "desativar" || sub === "remover") {
    config.autorole.roleId = null;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🎭 Autorole desativado",
        description: "Novos membros não receberão cargo automático.", colour: COR.sucesso },
      { title: "🎭 Autorole disabled",
        description: "New members will no longer receive an automatic role.", colour: COR.sucesso }));
  }

  if (sub === "set" || sub === "definir") {
    const roleId = extrairRoleId(args[1]);
    if (!roleId)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cargo inválido",
          description: `Informe um cargo. Ex.: \`${PREFIXO}autorole set <@cargo>\` ou o ID do cargo.`, colour: COR.erro },
        { title: "❌ Invalid role",
          description: `Give me a role. E.g.: \`${PREFIXO}autorole set <@role>\` or the role's ID.`, colour: COR.erro }));

    // confirma que o cargo existe no servidor
    const existe = server.roles?.get?.(roleId);
    if (!existe)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cargo não encontrado",
          description: "Esse cargo não existe neste servidor.", colour: COR.erro },
        { title: "❌ Role not found",
          description: "That role doesn't exist on this server.", colour: COR.erro }));

    config.autorole.roleId = roleId;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🎭 Autorole definido",
        description: `Novos membros agora recebem <@&${roleId}> automaticamente.`, colour: COR.sucesso },
      { title: "🎭 Autorole set",
        description: `New members now receive <@&${roleId}> automatically.`, colour: COR.sucesso }));
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "🎭 Autorole",
      description: `Uso: \`${PREFIXO}autorole set <@cargo>\` · \`${PREFIXO}autorole off\``, colour: COR.info },
    { title: "🎭 Autorole",
      description: `Usage: \`${PREFIXO}autorole set <@role>\` · \`${PREFIXO}autorole off\``, colour: COR.info }));
}

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
