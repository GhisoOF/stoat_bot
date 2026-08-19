// ══════════════════════════════════════════════════════════
//  staff.js — &staff (quem é a equipe do servidor)
//
//  A lista NÃO tem cadastro próprio: ela lê os mesmos cargos que o
//  `&acesso cargo` já usa para decidir quem pode moderar
//  (config.acesso.cargosStaff). Assim não existe a situação clássica de
//  "o quadro de avisos diz uma coisa e a permissão diz outra": promover
//  alguém no `&staff add` é promover de verdade, e tirar é tirar.
//
//  Comandos:
//   &staff                        → a equipe, agrupada por cargo (público)
//   &staff add <@cargo>           → marca o cargo como staff  (ManagePermissions)
//   &staff remove <@cargo>        → desmarca
//   &staff limpar                 → esvazia a lista
//   &staff titulo <@cargo> <texto>→ rótulo exibido no lugar do nome do cargo
//   &staff titulo <@cargo> limpar → volta ao nome do cargo
//
//  A ORDEM da lista é a ordem em que os cargos foram adicionados — o
//  primeiro adicionado aparece no topo. Para reordenar, remova e
//  adicione de novo na ordem desejada.
// ══════════════════════════════════════════════════════════

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

// Nome de exibição de um cargo: o título personalizado, senão o nome real,
// senão o ID (para o admin ao menos conseguir removê-lo).
function rotuloDoCargo(roleId, server, config) {
  const custom = config?.staff?.titulos?.[roleId];
  if (custom) return custom;
  try {
    const r = typeof server?.roles?.get === "function"
      ? server.roles.get(roleId)
      : server?.roles?.[roleId];
    if (r?.name) return r.name;
  } catch { /* servidor sem roles acessível */ }
  return roleId;
}

// ── Quem tem cada cargo ────────────────────────────────────
// A busca de membros (com cache) vive no core, compartilhada com o
// &servidores e as boas-vindas — uma fonte só, um cache só.
import { listarMembros } from "../core/membros.js";

// IDs dos membros que têm um cargo específico.
function quemTem(membros, roleId) {
  const out = [];
  for (const m of membros ?? []) {
    const cargos = (m?.roles ?? []).map((r) => r?.id ?? r);
    if (!cargos.includes(roleId)) continue;
    const uid = m?.id?.user ?? m?._id?.user ?? m?.userId ?? m?.user?.id ?? m?.id;
    if (typeof uid === "string") out.push(uid);
  }
  return out;
}

// ── Comando ────────────────────────────────────────────────
export async function cmdStaff(message, args, ctx) {
  const { config, sendEmbed, COR, PREFIXO, getServer, membroTemPermissao, salvarConfig } = ctx;
  const lang = lingua(ctx);
  garantirConfig(config);

  const sub = args[0]?.toLowerCase();
  const server = await getServer(message).catch(() => null);

  // ── &staff → a lista (público: qualquer um pode consultar) ──
  if (!sub || sub === "lista" || sub === "list") {
    const cargos = config.acesso.cargosStaff;
    if (!cargos.length) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "👥 Equipe",
        description: [
          "Nenhum cargo de staff foi marcado ainda.",
          "",
          `Quem tem **ManagePermissions** pode montar a lista com \`${PREFIXO}staff add <@cargo>\`.`,
          `_Os mesmos cargos passam a valer para os comandos de moderação (\`${PREFIXO}acesso\`)._`,
        ].join("\n"),
        colour: COR.info,
      }, {
        title: "👥 Staff",
        description: [
          "No staff role has been marked yet.",
          "",
          `Anyone with **ManagePermissions** can build the list with \`${PREFIXO}staff add <@role>\`.`,
          `_The same roles then count for the moderation commands (\`${PREFIXO}acesso\`)._`,
        ].join("\n"),
        colour: COR.info,
      }));
    }

    const membros = await listarMembros(server);
    const blocos = [];
    for (const roleId of cargos) {
      const nome = rotuloDoCargo(roleId, server, config);
      if (!membros) {
        // Sem a lista de membros, ainda dá para mostrar a estrutura da equipe.
        blocos.push(`**${nome}** — <%${roleId}>`);
        continue;
      }
      const ids = quemTem(membros, roleId);
      const pessoas = ids.length
        ? ids.slice(0, 15).map((u) => `<@${u}>`).join(" · ") +
          (ids.length > 15 ? (lang === "en" ? ` _+${ids.length - 15} more_` : ` _+${ids.length - 15}_`) : "")
        : (lang === "en" ? "_nobody with this role_" : "_ninguém com este cargo_");
      blocos.push(`**${nome}** (${ids.length})\n${pessoas}`);
    }

    const rodape = membros
      ? null
      : (lang === "en"
        ? "_I couldn't read the member list, so I'm showing the roles only._"
        : "_Não consegui ler a lista de membros, então mostro só os cargos._");

    return sendEmbed(message.channel, {
      title: lang === "en" ? "👥 Staff" : "👥 Equipe",
      description: [...blocos, ...(rodape ? ["", rodape] : [])].join("\n\n"),
      colour: COR.mod,
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
    const alvo = resolverCargo(args[1], server);
    if (!alvo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cargo não encontrado",
          description: [
            `Não identifiquei um cargo em \`${args[1] ?? ""}\`.`,
            "",
            `Aceito **menção**, **ID** ou o **nome** do cargo.`,
            `Ex.: \`${PREFIXO}staff ${removendo ? "remove" : "add"} Moderador\``,
          ].join("\n"),
          colour: COR.erro },
        { title: "❌ Role not found",
          description: [
            `I couldn't identify a role in \`${args[1] ?? ""}\`.`,
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
