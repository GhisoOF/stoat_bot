
import * as db from "../core/db.js";
import { citar, trechoPronto } from "../core/aliases.js";
import * as log from "../core/log.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
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
  // `list` e `clear` chegam traduzidos pelo registro (fase 3)
  if (["lista", "ver", "avisos"].includes(subAviso)) {
    return automodCmd.cmdWarnings(message, args.slice(1), ctx);
  }
  if (["limpar", "zerar", "apagar"].includes(subAviso)) {
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
        description: "This command only works inside a server.", colour: COR.erro },
      { title: "❌ Fuera de un servidor",
        description: "Este comando solo funciona dentro de un servidor.", colour: COR.erro }));
  }

  if (!membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageMessages** (ou um cargo de staff) para advertir alguém.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageMessages** (or a staff role) to warn someone.", colour: COR.erro },
      { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManageMessages** (o un rol de staff) para advertir a alguien.", colour: COR.erro }));
  }

  const alvoId = await resolverUsuario(args[0], { message, server });
  if (!alvoId) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Quem devo avisar?",
        description: [
          `\`${citar("warn", "pt", P)} <@pessoa|id|nome> [motivo]\``,
          "",
          `Ex.: \`${citar("warn", "pt", P)} @Fulano spam no chat de arte\``,
          "",
          `Para ver os avisos de alguém: \`${citar("warn.lista", "pt", P)} @pessoa\``,
          `Para zerar: \`${citar("warn.limpar", "pt", P)} @pessoa\``,
        ].join("\n"), colour: COR.erro },
      { title: "❌ Who should I warn?",
        description: [
          `\`${citar("warn", "en", P)} <@user|id|name> [reason]\``,
          "",
          `E.g.: \`${citar("warn", "en", P)} @Someone spamming the art channel\``,
          "",
          `To see someone's warnings: \`${citar("warn.lista", "en", P)} @user\``,
          `To reset them: \`${citar("warn.limpar", "en", P)} @user\``,
        ].join("\n"), colour: COR.erro },
      { title: "❌ ¿A quién debo advertir?",
        description: [
          `\`${citar("warn", "es", P)} <@usuario|id|nombre> [motivo]\``,
          "",
          `Ej.: \`${citar("warn", "es", P)} @Fulano spam en el canal de arte\``,
          "",
          `Para ver los avisos de alguien: \`${citar("warn.lista", "es", P)} @usuario\``,
          `Para ponerlos a cero: \`${citar("warn.limpar", "es", P)} @usuario\``,
        ].join("\n"), colour: COR.erro }));
    }

  // não avisa a si mesmo nem ao bot
  if (alvoId === message.authorId) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🤔 Sério?",
        description: "Você não pode dar um aviso a si mesmo.", colour: COR.aviso },
      { title: "🤔 Really?",
        description: "You can't give yourself a warning.", colour: COR.aviso },
      { title: "🤔 ¿En serio?",
        description: "No puedes darte un aviso a ti mismo.", colour: COR.aviso }));
  }
  if (alvoId === ctx.client?.user?.id) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🤖 Não",
        description: "Não vou dar um aviso a mim mesmo.", colour: COR.aviso },
      { title: "🤖 No",
        description: "I'm not going to warn myself.", colour: COR.aviso },
      { title: "🤖 No",
        description: "No voy a darme un aviso a mí misma.", colour: COR.aviso }));
  }

  // O alvo saiu SEMPRE do primeiro argumento (menção, ID ou nome), então o
  // motivo é o resto. Antes o nome digitado ("&warn Fulano spam") ia parar
  // dentro do motivo.
  const motivo = args.slice(1).join(" ").trim()
    || (idiomaDe(ctx) === "es" ? "sin motivo indicado" : lang === "en" ? "no reason given" : "sem motivo informado");

  // Dono do servidor e dono do bot não recebem aviso (no modo acumular, o
  // aviso levaria a uma tentativa de ban que o Stoat recusa no meio do caminho).
  if (alvoId === server.ownerId || ctx.ehSuperAdmin?.(alvoId)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Não dá", description: `<@${alvoId}> é dono do servidor (ou do bot) — não recebe avisos.`, colour: COR.aviso },
      { title: "🚫 Can't do that", description: `<@${alvoId}> owns the server (or the bot) — they can't be warned.`, colour: COR.aviso },
      { title: "🚫 No se puede", description: `<@${alvoId}> es dueño del servidor (o del bot) — no recibe avisos.`, colour: COR.aviso }));
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
  const es = idiomaDe(ctx) === "es";

  const linhas = tr(ctx, [
    `<@${alvoId}> recebeu um aviso.`,
    `**Motivo:** ${motivo}`,
    `**Total de avisos:** ${total}${acumular ? ` de ${limite}` : ""}`,
  ], [
    `<@${alvoId}> received a warning.`,
    `**Reason:** ${motivo}`,
    `**Total warnings:** ${total}${acumular ? ` of ${limite}` : ""}`,
  ], [
    `<@${alvoId}> recibió un aviso.`,
    `**Motivo:** ${motivo}`,
    `**Total de avisos:** ${total}${acumular ? ` de ${limite}` : ""}`,
  ]);

  let banido = false;
  if (degrau.tipo === "ban") {
    try {
      await banir(server, alvoId, { reason: es
        ? `Límite de ${limite} avisos alcanzado — último: ${motivo}`
        : en
        ? `Reached the limit of ${limite} warnings — last one: ${motivo}`
        : `Limite de ${limite} avisos atingido — último: ${motivo}` });
      banido = true;
      db.limparPunicao(serverId, alvoId);
      linhas.push("", tr(ctx, "🔨 **Limite atingido — usuário banido.**", "🔨 **Limit reached — user banned.**", "🔨 **Límite alcanzado — usuario baneado.**"));
    } catch (e) {
      if (es) {
        linhas.push("", trechoPronto(`⚠️ Límite alcanzado, pero **no pude banear**: ${descreverErro(e, "es")}`));
        linhas.push(trechoPronto("_El bot necesita **BanMembers** y estar por encima del rol de la persona._"));
      } else if (en) {
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
      linhas.push(tr(ctx, `🔇 Silenciado por **${degrau.rotulo}** (degrau ${total} da escada).`, `🔇 Silenced for **${degrau.rotulo}** (step ${total} of the ladder).`, `🔇 Silenciado durante **${degrau.rotulo}** (escalón ${total} de la escalera).`));
    } catch (e) {
      linhas.push(tr(ctx, `⚠️ Este degrau silencia por ${degrau.rotulo}, mas **não consegui**: ${descreverErro(e)}`,
                     `⚠️ This step silences for ${degrau.rotulo}, but **I couldn't**: ${descreverErro(e, "en")}`,
                     `⚠️ Este escalón silencia durante ${degrau.rotulo}, pero **no pude**: ${descreverErro(e, "es")}`));
    }
  }
  if (acumular && !banido && degraus[total]) {
    linhas.push(tr(ctx, `_Próximo passo: ${rotuloDegrau(degraus[total], "pt")}._`, `_Next step: ${rotuloDegrau(degraus[total], "en")}._`, `_Siguiente paso: ${rotuloDegrau(degraus[total], "es")}._`));
  }
  const dias = Math.round(validadeDosAvisos(pol) / 86_400_000);
  if (dias && !banido) linhas.push(tr(ctx, `_Os avisos zeram depois de ${dias} dias sem um novo._`, `_Warnings reset after ${dias} days without a new one._`, `_Los avisos se reinician tras ${dias} días sin uno nuevo._`));

  await log.registrar(ctx, "punicoes", {
    titulo: banido ? "🔨 Ban por acúmulo de avisos" : "⚠️ Aviso manual",
    descricao: `<@${alvoId}> — ${motivo}\n**Por:** <@${message.authorId}>\n**Total:** ${total}`,
    en: { titulo: banido ? "🔨 Ban for too many warnings" : "⚠️ Manual warning",
      descricao: `<@${alvoId}> — ${motivo}\n**By:** <@${message.authorId}>\n**Total:** ${total}` },
    es: { titulo: banido ? "🔨 Ban por acumulación de avisos" : "⚠️ Aviso manual",
      descricao: `<@${alvoId}> — ${motivo}\n**Por:** <@${message.authorId}>\n**Total:** ${total}` },
  });

  console.log(`[WARN] ${message.authorId} avisou ${alvoId} (${total} aviso(s))${banido ? " → BANIDO" : ""}`);

  return sendEmbed(message.channel, {
    title: banido
      ? tr(ctx, "🔨 Aviso aplicado — e limite atingido", "🔨 Warning applied — and limit reached", "🔨 Aviso aplicado — y límite alcanzado")
      : tr(ctx, "⚠️ Aviso aplicado", "⚠️ Warning applied", "⚠️ Aviso aplicado"),
    description: linhas.join("\n"),
    colour: banido ? COR.erro : COR.aviso,
  });
}
