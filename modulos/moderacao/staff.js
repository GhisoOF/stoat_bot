
import { resolverCargo } from "../core/ids.js";
import { citar, citarInterno } from "../core/aliases.js";
import { tr, lingua } from "../core/i18n.js";

// Garante a estrutura em servidores configurados antes desta versão.
function garantirConfig(config) {
  config.acesso ??= { cargosStaff: [], canais: { modo: "todos", lista: [] }, staffIgnoraCanais: true };
  config.acesso.cargosStaff ??= [];
  config.staff ??= {};
  config.staff.titulos ??= {};   // roleId → rótulo personalizado
  return config;
}


import { equipe } from "../ferramentas/servidor-info.js";

export async function cmdStaff(message, args, ctx) {
  const { config, sendEmbed, COR, PREFIXO, getServer, membroTemPermissao, salvarConfig } = ctx;
  const lang = lingua(ctx);
  garantirConfig(config);

  const sub = args[0]?.toLowerCase();
  const server = await getServer(message).catch(() => null);

  // ── &staff → a lista (público: qualquer um pode consultar) ──
  // 12 out 2026: além dos cargos marcados, o dono do servidor, o cargo de
  // equipe dos tickets e os cargos com permissão de moderar (decisão de Ghieh)
  // — o mesmo levantamento que a Judy usa quando perguntam "quem é da staff?".
  if (!sub || sub === "lista" || sub === "list") {
    const en = lang === "en";
    const T = (pt, eng, es) => tr(ctx, pt, eng, es);
    const e = await equipe(server, config, { client: [ctx.client, message.client].find((c) => typeof c?.users?.get === "function") ?? null });
    const blocos = [];
    if (e.donoId) blocos.push(`👑 **${T("Dono do servidor", "Server owner", "Dueño del servidor")}** — <@${e.donoId}>`);
    for (const b of e.blocos) {
      const origem = b.origem === "permissao" ? T(" _(pode moderar)_", " _(can moderate)_", " _(puede moderar)_")
        : b.origem === "tickets" ? T(" _(equipe dos tickets)_", " _(ticket team)_", " _(equipo de tickets)_") : "";
      if (!b.pessoas) { blocos.push(`**${b.nome}**${origem} — <%${b.roleId}>`); continue; }
      const pessoas = b.pessoas.length
        ? b.pessoas.slice(0, 15).map((p) => `<@${p.id}>`).join(" · ") +
          (b.pessoas.length > 15 ? T(` _+${b.pessoas.length - 15}_`, ` _+${b.pessoas.length - 15} more_`, ` _+${b.pessoas.length - 15} más_`) : "")
        : T("_ninguém com este cargo_", "_nobody with this role_", "_nadie con este rol_");
      blocos.push(`**${b.nome}** (${b.pessoas.length})${origem}\n${pessoas}`);
    }
    const semMarcados = !config.acesso.cargosStaff.length;
    const orientacao = semMarcados ? [
      T("Nenhum cargo de staff foi marcado ainda.", "No staff role has been marked yet.", "Todavía no se ha marcado ningún rol de staff."),
      T(`Quem tem **ManagePermissions** pode montar a lista com \`${citarInterno("staff.add", PREFIXO)} <@cargo>\`.`, `Anyone with **ManagePermissions** can build the list with \`${citarInterno("staff.add", PREFIXO)} <@role>\`.`, `Quien tenga **ManagePermissions** puede armar la lista con \`${citar("staff.add", "es", PREFIXO)} <@rol>\`.`),
      T(`_Os mesmos cargos passam a valer para os comandos de moderação (\`${citarInterno("acesso", PREFIXO)}\`)._`, `_The same roles then count for the moderation commands (\`${citarInterno("acesso", PREFIXO)}\`)._`, `_Los mismos roles pasan a valer para los comandos de moderación (\`${citar("acesso", "es", PREFIXO)}\`)._`),
    ] : [];
    const rodape = e.membrosLidos ? null
      : T("_Não consegui ler a lista de membros, então mostro só os cargos._", "_I couldn't read the member list, so I'm showing the roles only._", "_No pude leer la lista de miembros, así que muestro solo los roles._");
    return sendEmbed(message.channel, {
      title: T("👥 Equipe", "👥 Staff", "👥 Staff"),
      description: [blocos.join("\n\n"), orientacao.length ? orientacao.join("\n") : null, rodape].filter(Boolean).join("\n\n"),
      colour: semMarcados && !e.blocos.length ? COR.info : COR.mod,
    });
  }

  // ── daqui em diante: administração (exige permissão) ──
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para mexer na equipe.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to change the staff list.", colour: COR.erro },
      { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManagePermissions** para cambiar el staff.", colour: COR.erro }));
  }

  const a = config.acesso;

  // ── &staff limpar ──
  if (["limpar", "clear", "reset"].includes(sub)) {
    a.cargosStaff = [];
    config.staff.titulos = {};
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx, {
      title: "👥 Equipe esvaziada",
      description: `Nenhum cargo conta mais como staff. Só as permissões nativas do Stoat valem agora.`,
      colour: COR.mod,
    }, {
      title: "👥 Staff list cleared",
      description: `No role counts as staff anymore. Only Stoat's native permissions apply now.`,
      colour: COR.mod,
    }, {
      title: "👥 Staff vaciado",
      description: `Ya ningún rol cuenta como staff. Ahora solo valen los permisos nativos de Stoat.`,
      colour: COR.mod,
    }));
  }

  // ── &staff titulo <@cargo> <texto|limpar> ──
  if (["titulo", "título", "title", "rotulo", "rótulo", "label"].includes(sub)) {
    const alvo = resolverCargo(args[1], server);
    if (!alvo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cargo não encontrado",
          description: `Uso: \`${citarInterno("staff.titulo", PREFIXO)} <@cargo> <texto>\`\nPara voltar ao nome do cargo: \`${citarInterno("staff.titulo", PREFIXO)} <@cargo> limpar\``,
          colour: COR.erro },
        { title: "❌ Role not found",
          description: `Usage: \`${citarInterno("staff.titulo", PREFIXO)} <@role> <text>\`\nTo go back to the role's name: \`${citarInterno("staff.titulo", PREFIXO)} <@role> clear\``,
          colour: COR.erro },
        { title: "❌ Rol no encontrado",
          description: `Uso: \`${citar("staff.titulo", "es", PREFIXO)} <@rol> <texto>\`\nPara volver al nombre del rol: \`${citar("staff.titulo", "es", PREFIXO)} <@rol> clear\``,
          colour: COR.erro }));
    }
    if (!a.cargosStaff.includes(alvo.id)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não é um cargo de staff",
          description: `**${alvo.nome}** não está na equipe. Adicione primeiro: \`${citarInterno("staff.add", PREFIXO)} <@cargo>\`.`,
          colour: COR.erro },
        { title: "❌ Not a staff role",
          description: `**${alvo.nome}** isn't on the staff list. Add it first: \`${citarInterno("staff.add", PREFIXO)} <@role>\`.`,
          colour: COR.erro },
        { title: "❌ No es un rol de staff",
          description: `**${alvo.nome}** no está en el staff. Agrégalo primero: \`${citar("staff.add", "es", PREFIXO)} <@rol>\`.`,
          colour: COR.erro }));
    }

    const texto = args.slice(2).join(" ").trim();
    if (!texto || ["limpar", "clear", "off", "reset"].includes(texto.toLowerCase())) {
      delete config.staff.titulos[alvo.id];
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "👥 Título removido",
          description: `**${alvo.nome}** volta a aparecer com o nome do próprio cargo.`, colour: COR.mod },
        { title: "👥 Title removed",
          description: `**${alvo.nome}** goes back to showing the role's own name.`, colour: COR.mod },
        { title: "👥 Título eliminado",
          description: `**${alvo.nome}** vuelve a mostrarse con el nombre del propio rol.`, colour: COR.mod }));
    }

    config.staff.titulos[alvo.id] = texto.slice(0, 60);
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "👥 Título definido",
        description: `O cargo **${alvo.nome}** aparece como **${config.staff.titulos[alvo.id]}** em \`${citarInterno("staff", PREFIXO)}\`.`,
        colour: COR.mod },
      { title: "👥 Title set",
        description: `The **${alvo.nome}** role now shows as **${config.staff.titulos[alvo.id]}** in \`${citarInterno("staff", PREFIXO)}\`.`,
        colour: COR.mod },
      { title: "👥 Título definido",
        description: `El rol **${alvo.nome}** aparece como **${config.staff.titulos[alvo.id]}** en \`${citar("staff", "es", PREFIXO)}\`.`,
        colour: COR.mod }));
  }

  // ── &staff add / remove <@cargo> ──
  if (["add", "adicionar", "remove", "remover", "rem", "del"].includes(sub)) {
    const removendo = ["remove", "remover", "rem", "del"].includes(sub);
    // o nome inteiro (17 out 2026: "Le Gooby" virava "Le"); sem nada, pergunta em vez de acusar erro
    const pedido = args.slice(1).join(" ").trim();
    const alvo = pedido ? resolverCargo(pedido, server) : null;
    if (!alvo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: pedido ? "❌ Cargo não encontrado" : "❓ Qual cargo?",
          description: [
            pedido ? `Não identifiquei um cargo em \`${pedido}\`.` : `\`${citarInterno("staff", PREFIXO)} ${removendo ? "remove" : "add"} <@cargo|id|nome>\``,
            "",
            `Aceito **menção**, **ID** ou o **nome** do cargo.`,
            `Ex.: \`${citarInterno("staff", PREFIXO)} ${removendo ? "remove" : "add"} Moderador\``,
          ].join("\n"),
          colour: COR.erro },
        { title: pedido ? "❌ Role not found" : "❓ Which role?",
          description: [
            pedido ? `I couldn't identify a role in \`${pedido}\`.` : `\`${citarInterno("staff", PREFIXO)} ${removendo ? "remove" : "add"} <@role|id|name>\``,
            "",
            `I accept a **mention**, an **ID** or the role's **name**.`,
            `E.g.: \`${citarInterno("staff", PREFIXO)} ${removendo ? "remove" : "add"} Moderator\``,
          ].join("\n"),
          colour: COR.erro },
        { title: pedido ? "❌ Rol no encontrado" : "❓ ¿Qué rol?",
          description: [
            pedido ? `No identifiqué un rol en \`${pedido}\`.` : `\`${citar("staff", "es", PREFIXO)} ${removendo ? "remove" : "add"} <@rol|id|nombre>\``,
            "",
            `Acepto **mención**, **ID** o el **nombre** del rol.`,
            `Ej.: \`${citar("staff", "es", PREFIXO)} ${removendo ? "remove" : "add"} Moderador\``,
          ].join("\n"),
          colour: COR.erro }));
    }

    if (removendo) {
      const antes = a.cargosStaff.length;
      a.cargosStaff = a.cargosStaff.filter((r) => r !== alvo.id);
      delete config.staff.titulos[alvo.id];
      salvarConfig?.();
      const saiu = a.cargosStaff.length < antes;
      return sendEmbed(message.channel, tr(ctx, {
        title: saiu ? "👥 Cargo removido da equipe" : "👥 Esse cargo não estava na equipe",
        description: saiu
          ? `**${alvo.nome}** não conta mais como staff — nem na lista, nem nos comandos de moderação.`
          : `**${alvo.nome}** já não constava na lista.`,
        colour: saiu ? COR.mod : COR.aviso,
      }, {
        title: saiu ? "👥 Role removed from staff" : "👥 That role wasn't on the staff list",
        description: saiu
          ? `**${alvo.nome}** no longer counts as staff — neither in the list nor in the moderation commands.`
          : `**${alvo.nome}** wasn't on the list already.`,
        colour: saiu ? COR.mod : COR.aviso,
      }, {
        title: saiu ? "👥 Rol quitado del staff" : "👥 Ese rol no estaba en el staff",
        description: saiu
          ? `**${alvo.nome}** ya no cuenta como staff — ni en la lista ni en los comandos de moderación.`
          : `**${alvo.nome}** ya no figuraba en la lista.`,
        colour: saiu ? COR.mod : COR.aviso,
      }));
    }

    if (a.cargosStaff.includes(alvo.id)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "👥 Já está na equipe",
          description: `**${alvo.nome}** já conta como staff.`, colour: COR.aviso },
        { title: "👥 Already on the staff list",
          description: `**${alvo.nome}** already counts as staff.`, colour: COR.aviso },
        { title: "👥 Ya está en el staff",
          description: `**${alvo.nome}** ya cuenta como staff.`, colour: COR.aviso }));
    }

    a.cargosStaff.push(alvo.id);
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx, {
      title: "👥 Cargo adicionado à equipe",
      description: [
        `**${alvo.nome}** agora aparece em \`${citarInterno("staff", PREFIXO)}\`.`,
        "",
        `⚠️ Isto **dá acesso aos comandos de moderação** a quem tiver o cargo, mesmo sem a permissão nativa do Stoat — é a mesma lista do \`${citarInterno("acesso.cargo", PREFIXO)}\`.`,
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "👥 Role added to staff",
      description: [
        `**${alvo.nome}** now shows up in \`${citarInterno("staff", PREFIXO)}\`.`,
        "",
        `⚠️ This **grants access to the moderation commands** to anyone with that role, even without Stoat's native permission — it's the same list as \`${citarInterno("acesso.cargo", PREFIXO)}\`.`,
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "👥 Rol agregado al staff",
      description: [
        `**${alvo.nome}** ahora aparece en \`${citar("staff", "es", PREFIXO)}\`.`,
        "",
        `⚠️ Esto **da acceso a los comandos de moderación** a quien tenga el rol, aun sin el permiso nativo de Stoat — es la misma lista de \`${citar("acesso.cargo", "es", PREFIXO)}\`.`,
      ].join("\n"),
      colour: COR.mod,
    }));
  }

  // ── subcomando desconhecido ──
  return sendEmbed(message.channel, tr(ctx, {
    title: "👥 Equipe",
    description: [
      `\`${citarInterno("staff", PREFIXO)}\` — mostra a equipe`,
      `\`${citarInterno("staff.add", PREFIXO)} <@cargo>\` — marca um cargo como staff`,
      `\`${citarInterno("staff.remove", PREFIXO)} <@cargo>\` — desmarca`,
      `\`${citarInterno("staff.titulo", PREFIXO)} <@cargo> <texto>\` — rótulo exibido no lugar do nome`,
      `\`${citarInterno("staff.limpar", PREFIXO)}\` — esvazia a lista`,
      "",
      `_A ordem é a de adição. É a mesma lista do \`${citarInterno("acesso.cargo", PREFIXO)}\`: quem entra aqui também passa a usar os comandos de moderação._`,
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "👥 Staff",
    description: [
      `\`${citarInterno("staff", PREFIXO)}\` — show the team`,
      `\`${citarInterno("staff.add", PREFIXO)} <@role>\` — mark a role as staff`,
      `\`${citarInterno("staff.remove", PREFIXO)} <@role>\` — unmark it`,
      `\`${citarInterno("staff.titulo", PREFIXO)} <@role> <text>\` — label shown instead of the role name`,
      `\`${citarInterno("staff.limpar", PREFIXO)}\` — empty the list`,
      "",
      `_Order follows insertion. It's the same list as \`${citarInterno("acesso.cargo", PREFIXO)}\`: whoever joins here also gets to use the moderation commands._`,
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "👥 Staff",
    description: [
      `\`${citar("staff", "es", PREFIXO)}\` — muestra el staff`,
      `\`${citar("staff.add", "es", PREFIXO)} <@rol>\` — marca un rol como staff`,
      `\`${citar("staff.remove", "es", PREFIXO)} <@rol>\` — lo desmarca`,
      `\`${citar("staff.titulo", "es", PREFIXO)} <@rol> <texto>\` — etiqueta que se muestra en lugar del nombre`,
      `\`${citar("staff.limpar", "es", PREFIXO)}\` — vacía la lista`,
      "",
      `_El orden es el de adición. Es la misma lista de \`${citar("acesso.cargo", "es", PREFIXO)}\`: quien entra aquí también pasa a usar los comandos de moderación._`,
    ].join("\n"),
    colour: COR.info,
  }));
}
