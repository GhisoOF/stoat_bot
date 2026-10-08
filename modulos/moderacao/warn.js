
import * as db from "../core/db.js";
import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";
import { resolverUsuario } from "../core/ids.js";
import * as automodCmd from "./automod-comandos.js";
import { escadaDePunicao, rotuloDegrau, validadeDosAvisos } from "./automod-engine.js";
import { aplicarTimeout } from "./timeout.js";
import { banir } from "../core/banir.js";
import { descreverErro } from "../core/erros.js";

export async function cmdWarn(message, args, ctx) {
  // ── A família dos avisos mora aqui dentro ──
  // `&warn lista` = `&warnings`; `&warn limpar` = `&clearwarnings`.
  const subAviso = args[0]?.toLowerCase();
  if (["lista", "list", "ver", "avisos"].includes(subAviso)) {
    return automodCmd.cmdWarnings(message, args.slice(1), ctx);
  }
  if (["limpar", "clear", "zerar", "apagar"].includes(subAviso)) {
    return automodCmd.cmdClearwarnings(message, args.slice(1), ctx);
  }

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
          `Para ver os avisos de alguém: \`${P}warn lista @pessoa\``,
          `Para zerar: \`${P}warn limpar @pessoa\``,
        ].join("\n"), colour: COR.erro },
      { title: "❌ Who should I warn?",
        description: [
          `\`${P}warn <@user|id|name> [reason]\``,
          "",
          `E.g.: \`${P}warn @Someone spamming the art channel\``,
          "",
          `To see someone's warnings: \`${P}warn lista @user\``,
          `To reset them: \`${P}warn limpar @user\``,
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

  // O alvo saiu SEMPRE do primeiro argumento (menção, ID ou nome), então o
  // motivo é o resto. Antes o nome digitado ("&warn Fulano spam") ia parar
  // dentro do motivo.
  const motivo = args.slice(1).join(" ").trim()
    || (lang === "en" ? "no reason given" : "sem motivo informado");

  // Dono do servidor e dono do bot não recebem aviso (no modo acumular, o
  // aviso levaria a uma tentativa de ban que o Stoat recusa no meio do caminho).
  if (alvoId === server.ownerId || ctx.ehSuperAdmin?.(alvoId)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Não dá", description: `<@${alvoId}> é dono do servidor (ou do bot) — não recebe avisos.`, colour: COR.aviso },
      { title: "🚫 Can't do that", description: `<@${alvoId}> owns the server (or the bot) — they can't be warned.`, colour: COR.aviso }));
  }

  const pol = config?.automod?.punicao ?? { modo: "avisar" };
  const total = db.somarAviso(serverId, alvoId, motivo, { validadeMs: validadeDosAvisos(pol) });
  // O aviso manual segue a MESMA escada do automod (antes: ban no
  // `warnsParaBan`, enquanto o automod silenciava — dois limites diferentes).
  const degraus = escadaDePunicao(pol);
  const limite = degraus.length;
  const acumular = pol.modo === "acumular";
  const degrau = acumular ? degraus[Math.min(total, limite) - 1] : { tipo: "aviso" };
  const en = lang === "en";

  const linhas = en ? [
    `<@${alvoId}> received a warning.`,
    `**Reason:** ${motivo}`,
    `**Total warnings:** ${total}${acumular ? ` of ${limite}` : ""}`,
  ] : [
    `<@${alvoId}> recebeu um aviso.`,
    `**Motivo:** ${motivo}`,
    `**Total de avisos:** ${total}${acumular ? ` de ${limite}` : ""}`,
  ];

  let banido = false;
  if (degrau.tipo === "ban") {
    try {
      await banir(server, alvoId, { reason: en
        ? `Reached the limit of ${limite} warnings — last one: ${motivo}`
        : `Limite de ${limite} avisos atingido — último: ${motivo}` });
      banido = true;
      db.limparPunicao(serverId, alvoId);
      linhas.push("", en ? "🔨 **Limit reached — user banned.**" : "🔨 **Limite atingido — usuário banido.**");
    } catch (e) {
      if (en) {
        linhas.push("", `⚠️ Limit reached, but **I couldn't ban**: ${descreverErro(e, "en")}`);
        linhas.push("_The bot needs **BanMembers** and its role must sit above the person's._");
      } else {
        linhas.push("", `⚠️ Limite atingido, mas **não consegui banir**: ${descreverErro(e)}`);
        linhas.push("_O bot precisa de **BanMembers** e estar acima do cargo da pessoa._");
      }
    }
  } else if (degrau.tipo === "mute") {
    try {
      await aplicarTimeout(server, alvoId, degrau.ms);
      db.silenciarAte(serverId, alvoId, Date.now() + degrau.ms, motivo);
      linhas.push(en ? `🔇 Silenced for **${degrau.rotulo}** (step ${total} of the ladder).` : `🔇 Silenciado por **${degrau.rotulo}** (degrau ${total} da escada).`);
    } catch (e) {
      linhas.push(en ? `⚠️ This step silences for ${degrau.rotulo}, but **I couldn't**: ${descreverErro(e, "en")}`
                     : `⚠️ Este degrau silencia por ${degrau.rotulo}, mas **não consegui**: ${descreverErro(e)}`);
    }
  }
  if (acumular && !banido && degraus[total]) {
    linhas.push(en ? `_Next step: ${rotuloDegrau(degraus[total], "en")}._` : `_Próximo passo: ${rotuloDegrau(degraus[total], "pt")}._`);
  }
  const dias = Math.round(validadeDosAvisos(pol) / 86_400_000);
  if (dias && !banido) linhas.push(en ? `_Warnings reset after ${dias} days without a new one._` : `_Os avisos zeram depois de ${dias} dias sem um novo._`);

  await log.registrar(ctx, "punicoes", {
    titulo: banido ? "🔨 Ban por acúmulo de avisos" : "⚠️ Aviso manual",
    descricao: `<@${alvoId}> — ${motivo}\n**Por:** <@${message.authorId}>\n**Total:** ${total}`,
  });

  console.log(`[WARN] ${message.authorId} avisou ${alvoId} (${total} aviso(s))${banido ? " → BANIDO" : ""}`);

  return sendEmbed(message.channel, {
    title: banido
      ? (en ? "🔨 Warning applied — and limit reached" : "🔨 Aviso aplicado — e limite atingido")
      : (en ? "⚠️ Warning applied" : "⚠️ Aviso aplicado"),
    description: linhas.join("\n"),
    colour: banido ? COR.erro : COR.aviso,
  });
}
