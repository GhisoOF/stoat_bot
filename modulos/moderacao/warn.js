// ══════════════════════════════════════════════════════════
//  warn.js — &warn: aviso manual dado pelo staff
//
//  Usa o MESMO contador do automod (tabela punicoes), então um aviso
//  dado à mão conta para o modo "acumular" — se a política é banir com
//  3 avisos, o terceiro aviso manual bane igual.
//
//  O bot nunca bane sozinho por aviso manual sem avisar: quando o
//  limite é atingido, ele executa a política configurada e diz o que fez.
// ══════════════════════════════════════════════════════════

import * as db from "../core/db.js";
import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";
import { limparId, ULID, resolverUsuario } from "../core/ids.js";


export async function cmdWarn(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config, serverId, getServer, membroTemPermissao } = ctx;
  const lang = lingua(ctx);

  const server = await getServer(message);
  if (!server) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Fora de um servidor",
        description: "Este comando só funciona dentro de um servidor.", colour: COR.erro },
      { title: "❌ Outside a server",
        description: "This command only works inside a server.", colour: COR.erro }));
  }

  // GATE DE PERMISSÃO — estava FALTANDO. O &warn escreve na mesma tabela de
  // punições do automod, então um aviso manual conta para o modo "acumular":
  // sem esta checagem, qualquer membro podia advertir qualquer outro e, no
  // limite, forçar o ban automático de terceiros. Exige ManageMessages, o
  // mesmo nível dos outros comandos de moderação leve.
  if (!membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageMessages** (ou um cargo de staff) para advertir alguém.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageMessages** (or a staff role) to warn someone.", colour: COR.erro }));
  }

  const alvoId = await resolverUsuario(args[0], { message, server });
  if (!alvoId) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Quem devo avisar?",
        description: [
          `\`${P}warn <@pessoa|id|nome> [motivo]\``,
          "",
          `Ex.: \`${P}warn @Fulano spam no chat de arte\``,
          "",
          `Para ver os avisos de alguém: \`${P}warnings @pessoa\``,
          `Para zerar: \`${P}clearwarnings @pessoa\``,
        ].join("\n"), colour: COR.erro },
      { title: "❌ Who should I warn?",
        description: [
          `\`${P}warn <@user|id|name> [reason]\``,
          "",
          `E.g.: \`${P}warn @Someone spamming the art channel\``,
          "",
          `To see someone's warnings: \`${P}warnings @user\``,
          `To reset them: \`${P}clearwarnings @user\``,
        ].join("\n"), colour: COR.erro }));
    }

  // não avisa a si mesmo nem ao bot
  if (alvoId === message.authorId) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🤔 Sério?",
        description: "Você não pode dar um aviso a si mesmo.", colour: COR.aviso },
      { title: "🤔 Really?",
        description: "You can't give yourself a warning.", colour: COR.aviso }));
  }
  if (alvoId === ctx.client?.user?.id) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🤖 Não",
        description: "Não vou dar um aviso a mim mesmo.", colour: COR.aviso },
      { title: "🤖 No",
        description: "I'm not going to warn myself.", colour: COR.aviso }));
  }

  // O motivo é o resto da mensagem. O primeiro argumento é descartado quando
  // ele é o próprio alvo (menção, ID ou nome) — e não quando já é o motivo.
  const primeiro = args[0] ?? "";
  const primeiroEhAlvo = limparId(primeiro) === alvoId
    || ULID.test(limparId(primeiro))
    || /^<[%@#]/.test(primeiro);
  const motivo = args.slice(primeiroEhAlvo ? 1 : 0).join(" ").trim()
    || (lang === "en" ? "no reason given" : "sem motivo informado");

  const total = db.somarAviso(serverId, alvoId, motivo);
  const pol = config?.automod?.punicao ?? { modo: "avisar", warnsParaBan: 3 };
  const limite = pol.warnsParaBan ?? 3;

  const linhas = lang === "en" ? [
    `<@${alvoId}> received a warning.`,
    `**Reason:** ${motivo}`,
    `**Total warnings:** ${total}${pol.modo === "acumular" ? ` of ${limite}` : ""}`,
  ] : [
    `<@${alvoId}> recebeu um aviso.`,
    `**Motivo:** ${motivo}`,
    `**Total de avisos:** ${total}${pol.modo === "acumular" ? ` de ${limite}` : ""}`,
  ];

  // No modo acumular, o aviso manual conta para o ban — cumprimos a política.
  let banido = false;
  if (pol.modo === "acumular" && total >= limite) {
    try {
      await server.banUser(alvoId, { reason: lang === "en"
        ? `Reached the limit of ${limite} warnings — last one: ${motivo}`
        : `Limite de ${limite} avisos atingido — último: ${motivo}` });
      banido = true;
      db.limparPunicao(serverId, alvoId);
      linhas.push("", lang === "en"
        ? `🔨 **Limit reached — user banned.**`
        : `🔨 **Limite atingido — usuário banido.**`);
    } catch (e) {
      if (lang === "en") {
        linhas.push("", `⚠️ Limit reached, but **I couldn't ban**: ${e?.message ?? e}`);
        linhas.push("_The bot needs **BanMembers** and its role must sit above the person's._");
      } else {
        linhas.push("", `⚠️ Limite atingido, mas **não consegui banir**: ${e?.message ?? e}`);
        linhas.push("_O bot precisa de **BanMembers** e estar acima do cargo da pessoa._");
      }
    }
  } else if (pol.modo === "acumular") {
    linhas.push(lang === "en"
      ? `_**${limite - total}** more until the automatic ban._`
      : `_Faltam **${limite - total}** para o ban automático._`);
  }

  await log.registrar(ctx, "punicoes", {
    titulo: banido ? "🔨 Ban por acúmulo de avisos" : "⚠️ Aviso manual",
    descricao: `<@${alvoId}> — ${motivo}\n**Por:** <@${message.authorId}>\n**Total:** ${total}`,
  });

  console.log(`[WARN] ${message.authorId} avisou ${alvoId} (${total} aviso(s))${banido ? " → BANIDO" : ""}`);

  return sendEmbed(message.channel, {
    title: banido
      ? (lang === "en" ? "🔨 Warning applied — and limit reached" : "🔨 Aviso aplicado — e limite atingido")
      : (lang === "en" ? "⚠️ Warning applied" : "⚠️ Aviso aplicado"),
    description: linhas.join("\n"),
    colour: banido ? COR.erro : COR.aviso,
  });
}
