import { ULID, resolverCargo } from "../core/ids.js";
import { editarCargos, podeUsarCargo } from "../core/hierarquia.js";
import { tr } from "../core/i18n.js";
import { citar } from "../core/aliases.js";

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
        ? `Novos membros recebem automaticamente o cargo <@&${atual}>.\n\nPara trocar: \`${citar("autorole.set", "pt", PREFIXO)} <@cargo>\` · desativar: \`${citar("autorole.off", "pt", PREFIXO)}\``
        : `Nenhum cargo automático definido.\n\nPara ativar: \`${citar("autorole.set", "pt", PREFIXO)} <@cargo>\``,
      colour: COR.mod,
    }, {
      title: "🎭 Autorole",
      description: atual
        ? `New members automatically receive the <@&${atual}> role.\n\nTo change it: \`${citar("autorole.set", "en", PREFIXO)} <@role>\` · disable: \`${citar("autorole.off", "en", PREFIXO)}\``
        : `No automatic role set.\n\nTo enable it: \`${citar("autorole.set", "en", PREFIXO)} <@role>\``,
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

  // `&autorole set <cargo>` — e também `&autorole <cargo>` direto, como o
  // tutorial ensinava (antes caía no "Uso:"). O cargo vale por menção, ID ou nome.
  const direto = !["set", "definir"].includes(sub);
  if (!direto || resolverCargo(args.join(" "), server)) {
    const entrada = direto ? args.join(" ") : args.slice(1).join(" ");
    const roleId = extrairRoleId(entrada) ?? resolverCargo(entrada, server)?.id ?? null;
    if (!roleId)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cargo inválido",
          description: `Informe um cargo. Ex.: \`${citar("autorole.set", "pt", PREFIXO)} <@cargo>\` ou o ID do cargo.`, colour: COR.erro },
        { title: "❌ Invalid role",
          description: `Give me a role. E.g.: \`${citar("autorole.set", "en", PREFIXO)} <@role>\` or the role's ID.`, colour: COR.erro }));

    // confirma que o cargo existe no servidor
    const existe = server.roles?.get?.(roleId);
    if (!existe)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cargo não encontrado",
          description: "Esse cargo não existe neste servidor.", colour: COR.erro },
        { title: "❌ Role not found",
          description: "That role doesn't exist on this server.", colour: COR.erro }));

    // quem configura precisa estar ACIMA do cargo (15 out 2026)
    const pode = await podeUsarCargo(server, message, roleId, ctx);
    if (!pode.ok)
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Cargo acima do seu", description: `${pode.pt}.`, colour: COR.erro },
        { title: "🚫 Role above yours", description: `${pode.en}.`, colour: COR.erro }));

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
      description: `Uso: \`${citar("autorole.set", "pt", PREFIXO)} <@cargo>\` · \`${citar("autorole.off", "pt", PREFIXO)}\``, colour: COR.info },
    { title: "🎭 Autorole",
      description: `Usage: \`${citar("autorole.set", "en", PREFIXO)} <@role>\` · \`${citar("autorole.off", "en", PREFIXO)}\``, colour: COR.info }));
}

export async function aoEntrar(member, ctx) {
  const roleId = ctx.config?.autorole?.roleId;
  if (!roleId) return;
  try {
    const userId = member?.id?.user;
    const server = await ctx.getServer({ serverId: ctx.serverId });
    const alvo = await server.fetchMember(userId).catch(() => null);
    if (!alvo) return;
    if ((alvo.roles ?? []).map((r) => r?.id ?? r).includes(roleId)) return;   // já tem
    await editarCargos(server, alvo, (a) => [...a, roleId]);
    console.log(`[AUTOROLE] cargo ${roleId} dado a ${userId} em ${ctx.serverId}`);
  } catch (e) {
    console.error("[AUTOROLE]", e.message);
  }
}
