
import { resolverCargo } from "../core/ids.js";
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
    const T = (pt, eng) => (en ? eng : pt);
    const e = await equipe(server, config, { client: [ctx.client, message.client].find((c) => typeof c?.users?.get === "function") ?? null });
    const blocos = [];
    if (e.donoId) blocos.push(`👑 **${T("Dono do servidor", "Server owner")}** — <@${e.donoId}>`);
    for (const b of e.blocos) {
      const origem = b.origem === "permissao" ? T(" _(pode moderar)_", " _(can moderate)_")
        : b.origem === "tickets" ? T(" _(equipe dos tickets)_", " _(ticket team)_") : "";
      if (!b.pessoas) { blocos.push(`**${b.nome}**${origem} — <%${b.roleId}>`); continue; }
      const pessoas = b.pessoas.length
        ? b.pessoas.slice(0, 15).map((p) => `<@${p.id}>`).join(" · ") +
          (b.pessoas.length > 15 ? T(` _+${b.pessoas.length - 15}_`, ` _+${b.pessoas.length - 15} more_`) : "")
        : T("_ninguém com este cargo_", "_nobody with this role_");
      blocos.push(`**${b.nome}** (${b.pessoas.length})${origem}\n${pessoas}`);
    }
    const semMarcados = !config.acesso.cargosStaff.length;
    const orientacao = semMarcados ? [
      T("Nenhum cargo de staff foi marcado ainda.", "No staff role has been marked yet."),
      T(`Quem tem **ManagePermissions** pode montar a lista com \`${PREFIXO}staff add <@cargo>\`.`, `Anyone with **ManagePermissions** can build the list with \`${PREFIXO}staff add <@role>\`.`),
      T(`_Os mesmos cargos passam a valer para os comandos de moderação (\`${PREFIXO}acesso\`)._`, `_The same roles then count for the moderation commands (\`${PREFIXO}acesso\`)._`),
    ] : [];
    const rodape = e.membrosLidos ? null
      : T("_Não consegui ler a lista de membros, então mostro só os cargos._", "_I couldn't read the member list, so I'm showing the roles only._");
    return sendEmbed(message.channel, {
      title: T("👥 Equipe", "👥 Staff"),
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
        description: "You need **ManagePermissions** to change the staff list.", colour: COR.erro }));
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
    }));
  }

  // ── &staff titulo <@cargo> <texto|limpar> ──
  if (["titulo", "título", "title", "rotulo", "rótulo", "label"].includes(sub)) {
    const alvo = resolverCargo(args[1], server);
    if (!alvo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cargo não encontrado",
          description: `Uso: \`${PREFIXO}staff titulo <@cargo> <texto>\`\nPara voltar ao nome do cargo: \`${PREFIXO}staff titulo <@cargo> limpar\``,
          colour: COR.erro },
        { title: "❌ Role not found",
          description: `Usage: \`${PREFIXO}staff title <@role> <text>\`\nTo go back to the role's name: \`${PREFIXO}staff title <@role> clear\``,
          colour: COR.erro }));
    }
    if (!a.cargosStaff.includes(alvo.id)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não é um cargo de staff",
          description: `**${alvo.nome}** não está na equipe. Adicione primeiro: \`${PREFIXO}staff add <@cargo>\`.`,
          colour: COR.erro },
        { title: "❌ Not a staff role",
          description: `**${alvo.nome}** isn't on the staff list. Add it first: \`${PREFIXO}staff add <@role>\`.`,
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
          description: `**${alvo.nome}** goes back to showing the role's own name.`, colour: COR.mod }));
    }

    config.staff.titulos[alvo.id] = texto.slice(0, 60);
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "👥 Título definido",
        description: `O cargo **${alvo.nome}** aparece como **${config.staff.titulos[alvo.id]}** em \`${PREFIXO}staff\`.`,
        colour: COR.mod },
      { title: "👥 Title set",
        description: `The **${alvo.nome}** role now shows as **${config.staff.titulos[alvo.id]}** in \`${PREFIXO}staff\`.`,
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
            pedido ? `Não identifiquei um cargo em \`${pedido}\`.` : `\`${PREFIXO}staff ${removendo ? "remove" : "add"} <@cargo|id|nome>\``,
            "",
            `Aceito **menção**, **ID** ou o **nome** do cargo.`,
            `Ex.: \`${PREFIXO}staff ${removendo ? "remove" : "add"} Moderador\``,
          ].join("\n"),
          colour: COR.erro },
        { title: pedido ? "❌ Role not found" : "❓ Which role?",
          description: [
            pedido ? `I couldn't identify a role in \`${pedido}\`.` : `\`${PREFIXO}staff ${removendo ? "remove" : "add"} <@role|id|name>\``,
            "",
            `I accept a **mention**, an **ID** or the role's **name**.`,
            `E.g.: \`${PREFIXO}staff ${removendo ? "remove" : "add"} Moderator\``,
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
      }));
    }

    if (a.cargosStaff.includes(alvo.id)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "👥 Já está na equipe",
          description: `**${alvo.nome}** já conta como staff.`, colour: COR.aviso },
        { title: "👥 Already on the staff list",
          description: `**${alvo.nome}** already counts as staff.`, colour: COR.aviso }));
    }

    a.cargosStaff.push(alvo.id);
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx, {
      title: "👥 Cargo adicionado à equipe",
      description: [
        `**${alvo.nome}** agora aparece em \`${PREFIXO}staff\`.`,
        "",
        `⚠️ Isto **dá acesso aos comandos de moderação** a quem tiver o cargo, mesmo sem a permissão nativa do Stoat — é a mesma lista do \`${PREFIXO}acesso cargo\`.`,
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "👥 Role added to staff",
      description: [
        `**${alvo.nome}** now shows up in \`${PREFIXO}staff\`.`,
        "",
        `⚠️ This **grants access to the moderation commands** to anyone with that role, even without Stoat's native permission — it's the same list as \`${PREFIXO}acesso cargo\`.`,
      ].join("\n"),
      colour: COR.mod,
    }));
  }

  // ── subcomando desconhecido ──
  return sendEmbed(message.channel, tr(ctx, {
    title: "👥 Equipe",
    description: [
      `\`${PREFIXO}staff\` — mostra a equipe`,
      `\`${PREFIXO}staff add <@cargo>\` — marca um cargo como staff`,
      `\`${PREFIXO}staff remove <@cargo>\` — desmarca`,
      `\`${PREFIXO}staff titulo <@cargo> <texto>\` — rótulo exibido no lugar do nome`,
      `\`${PREFIXO}staff limpar\` — esvazia a lista`,
      "",
      `_A ordem é a de adição. É a mesma lista do \`${PREFIXO}acesso cargo\`: quem entra aqui também passa a usar os comandos de moderação._`,
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "👥 Staff",
    description: [
      `\`${PREFIXO}staff\` — show the team`,
      `\`${PREFIXO}staff add <@role>\` — mark a role as staff`,
      `\`${PREFIXO}staff remove <@role>\` — unmark it`,
      `\`${PREFIXO}staff title <@role> <text>\` — label shown instead of the role name`,
      `\`${PREFIXO}staff clear\` — empty the list`,
      "",
      `_Order follows insertion. It's the same list as \`${PREFIXO}acesso cargo\`: whoever joins here also gets to use the moderation commands._`,
    ].join("\n"),
    colour: COR.info,
  }));
}
