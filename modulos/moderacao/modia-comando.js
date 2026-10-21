
import { tr, lingua } from "../core/i18n.js";
import { citar, citarInterno } from "../core/aliases.js";

export async function cmdModIA(message, args, ctx) {
  const { sendEmbed, COR, config, getServer, membroTemPermissao } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";

  const server = await getServer?.(message);
  const podeGerir = !membroTemPermissao || membroTemPermissao(message, server, "ManageServer");
  const sub = args[0]?.toLowerCase();

  config.moderacaoIA ??= { ativa: false, criterios: "", canais: [] };
  const m = config.moderacaoIA;

  // Sem subcomando → status
  if (!sub || sub === "status") {
    const canais = m.canais?.length ? m.canais.map((c) => `<#${c}>`).join(", ") : tr(ctx, "todos os canais", "all channels", "todos los canales");
    return sendEmbed(message.channel, tr(ctx, {
      title: "🤖 Moderação por IA",
      description: [
        `**Estado:** ${m.ativa ? "🟢 ativa" : "🔴 desativada"}`,
        `**Canais:** ${canais}`,
        "",
        "**Critérios atuais:**",
        m.criterios?.trim() ? `\`\`\`\n${m.criterios}\n\`\`\`` : "_(nenhum — defina com `" + citarInterno("modia.criterios") + " ...`)_",
        "",
        "A Judy avalia cada mensagem; se violar, **apaga e marca o dono** no #log com as opções. Ela nunca bane sozinha.",
        "",
        `\`${ctx.PREFIXO}modia on|off\` · \`${ctx.PREFIXO}modia criterios <texto>\` · \`${ctx.PREFIXO}modia canal add|remove\` · \`${ctx.PREFIXO}modia limpar\``,
      ].join("\n"),
      colour: COR.info,
    }, {
      title: "🤖 AI moderation",
      description: [
        `**State:** ${m.ativa ? "🟢 active" : "🔴 off"}`,
        `**Channels:** ${canais}`,
        "",
        "**Current criteria:**",
        m.criterios?.trim() ? `\`\`\`\n${m.criterios}\n\`\`\`` : "_(none — set them with `" + citarInterno("modia.criterios") + " ...`)_",
        "",
        "Judy evaluates each message; if it violates the rules, she **deletes it and pings the owner** in the #log with the options. She never bans on her own.",
        "",
        `\`${ctx.PREFIXO}modia on|off\` · \`${ctx.PREFIXO}modia criterios <text>\` · \`${ctx.PREFIXO}modia canal add|remove\` · \`${ctx.PREFIXO}modia limpar\``,
      ].join("\n"),
      colour: COR.info,
    }, {
      title: "🤖 Moderación por IA",
      description: [
        `**Estado:** ${m.ativa ? "🟢 activa" : "🔴 desactivada"}`,
        `**Canales:** ${canais}`,
        "",
        "**Criterios actuales:**",
        m.criterios?.trim() ? `\`\`\`\n${m.criterios}\n\`\`\`` : "_(ninguno — defínelos con `" + citar("modia.criterios", "es", ctx.PREFIXO) + " ...`)_",
        "",
        "Judy evalúa cada mensaje; si viola los criterios, **lo borra y menciona al dueño** en el #log con las opciones. Nunca banea por su cuenta.",
        "",
        `\`${citar("modia", "es", ctx.PREFIXO)} on|off\` · \`${citar("modia.criterios", "es", ctx.PREFIXO)} <texto>\` · \`${citar("modia.canal", "es", ctx.PREFIXO)} add|remove\` · \`${citar("modia.limpar", "es", ctx.PREFIXO)}\``,
      ].join("\n"),
      colour: COR.info,
    }));
  }

  if (!podeGerir) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageServer** para configurar a moderação por IA.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageServer** to configure AI moderation.", colour: COR.erro },
      { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManageServer** para configurar la moderación por IA.", colour: COR.erro }));
  }

  if (sub === "on" || sub === "off") {
    if (sub === "on" && !m.criterios?.trim()) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "⚠️ Defina os critérios primeiro",
        description: `Antes de ligar, diga o que moderar:\n\`${ctx.PREFIXO}modia criterios não permitir spam de divulgação nem ataques pessoais\``, colour: COR.aviso,
      }, {
        title: "⚠️ Set the criteria first",
        description: `Before enabling, tell me what to moderate:\n\`${ctx.PREFIXO}modia criterios don't allow promo spam or personal attacks\``, colour: COR.aviso,
      }, {
        title: "⚠️ Define los criterios primero",
        description: `Antes de activarla, dime qué moderar:\n\`${citar("modia.criterios", "es", ctx.PREFIXO)} no permitir spam de publicidad ni ataques personales\``, colour: COR.aviso,
      }));
    }
    m.ativa = sub === "on";
    ctx.salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx, {
      title: m.ativa ? "🟢 Moderação por IA ativada" : "🔴 Moderação por IA desativada",
      description: m.ativa ? "A Judy passa a avaliar as mensagens pelos critérios definidos." : "A Judy parou de moderar a conversa.", colour: m.ativa ? COR.sucesso : COR.aviso }, {
      title: m.ativa ? "🟢 AI moderation enabled" : "🔴 AI moderation disabled",
      description: m.ativa ? "Judy will now evaluate messages using the defined criteria." : "Judy stopped moderating the conversation.", colour: m.ativa ? COR.sucesso : COR.aviso,
    }, {
      title: m.ativa ? "🟢 Moderación por IA activada" : "🔴 Moderación por IA desactivada",
      description: m.ativa ? "Desde ahora Judy evalúa los mensajes según los criterios definidos." : "Judy dejó de moderar la conversación.", colour: m.ativa ? COR.sucesso : COR.aviso }));
  }

  if (sub === "criterios" || sub === "critérios") {
    const texto = args.slice(1).join(" ").trim();
    if (!texto) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "📝 Como definir critérios",
        description: [
          "Escreva em linguagem natural o que a Judy deve moderar. Exemplos:",
          "",
          `\`${ctx.PREFIXO}modia criterios Apague divulgação de outros servidores, venda de contas e ataques pessoais diretos. Não modere palavrão leve nem discussão acalorada.\``,
          "",
          "Quanto mais claro e específico, melhor ela acerta.",
        ].join("\n"), colour: COR.info,
      }, {
        title: "📝 How to set criteria",
        description: [
          "Write in natural language what Judy should moderate. Examples:",
          "",
          `\`${ctx.PREFIXO}modia criterios Delete promos for other servers, account selling and direct personal attacks. Don't moderate mild swearing or heated discussion.\``,
          "",
          "The clearer and more specific, the better she gets it right.",
        ].join("\n"), colour: COR.info,
      }, {
        title: "📝 Cómo definir los criterios",
        description: [
          "Escribe en lenguaje natural lo que Judy debe moderar. Ejemplos:",
          "",
          `\`${citar("modia.criterios", "es", ctx.PREFIXO)} Borra la publicidad de otros servidores, la venta de cuentas y los ataques personales directos. No moderes palabrotas leves ni discusiones acaloradas.\``,
          "",
          "Cuanto más claro y específico, mejor acierta.",
        ].join("\n"), colour: COR.info,
      }));
    }
    m.criterios = texto.slice(0, 2000);
    ctx.salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx, {
      title: "📝 Critérios atualizados",
      description: `A Judy vai moderar com base em:\n\`\`\`\n${m.criterios}\n\`\`\`${m.ativa ? "" : `\n\nAtive com \`${ctx.PREFIXO}modia on\`.`}`, colour: COR.sucesso,
    }, {
      title: "📝 Criteria updated",
      description: `Judy will moderate based on:\n\`\`\`\n${m.criterios}\n\`\`\`${m.ativa ? "" : `\n\nEnable with \`${ctx.PREFIXO}modia on\`.`}`, colour: COR.sucesso,
    }, {
      title: "📝 Criterios actualizados",
      description: `Judy moderará según:\n\`\`\`\n${m.criterios}\n\`\`\`${m.ativa ? "" : `\n\nActívala con \`${citar("modia", "es", ctx.PREFIXO)} on\`.`}`, colour: COR.sucesso,
    }));
  }

  if (sub === "canal") {
    const acao = args[1]?.toLowerCase();
    const canalId = message.channelId;
    m.canais ??= [];
    if (acao === "add") {
      if (!m.canais.includes(canalId)) m.canais.push(canalId);
      ctx.salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "📍 Canal adicionado",
          description: `A Judy vigia este canal. (Sem canais na lista, ela vigia todos.)`, colour: COR.sucesso },
        { title: "📍 Channel added",
          description: `Judy watches this channel. (With no channels listed, she watches all of them.)`, colour: COR.sucesso },
        { title: "📍 Canal añadido",
          description: `Judy vigila este canal. (Sin canales en la lista, los vigila todos.)`, colour: COR.sucesso }));
    }
    if (acao === "remove") {
      m.canais = m.canais.filter((c) => c !== canalId);
      ctx.salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "📍 Canal removido",
          description: "A Judy não vigia mais este canal especificamente.", colour: COR.aviso },
        { title: "📍 Channel removed",
          description: "Judy no longer watches this channel specifically.", colour: COR.aviso },
        { title: "📍 Canal quitado",
          description: "Judy ya no vigila este canal en concreto.", colour: COR.aviso }));
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "Uso",
        description: `\`${ctx.PREFIXO}modia canal add\` ou \`${ctx.PREFIXO}modia canal remove\` (no canal desejado).`, colour: COR.info },
      { title: "Usage",
        description: `\`${ctx.PREFIXO}modia canal add\` or \`${ctx.PREFIXO}modia canal remove\` (in the desired channel).`, colour: COR.info },
      { title: "Uso",
        description: `\`${citar("modia.canal.add", "es", ctx.PREFIXO)}\` o \`${citar("modia.canal.remove", "es", ctx.PREFIXO)}\` (en el canal que quieras).`, colour: COR.info }));
  }

  if (sub === "limpar") {
    m.criterios = ""; m.ativa = false; m.canais = [];
    ctx.salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🧹 Moderação por IA zerada",
        description: "Critérios apagados e moderação desligada.", colour: COR.aviso },
      { title: "🧹 AI moderation reset",
        description: "Criteria erased and moderation turned off.", colour: COR.aviso },
      { title: "🧹 Moderación por IA reiniciada",
        description: "Criterios borrados y moderación desactivada.", colour: COR.aviso }));
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "❓ Subcomando desconhecido",
      description: `Use: \`on\`, \`off\`, \`criterios\`, \`canal\`, \`limpar\` ou \`status\`.`, colour: COR.erro },
    { title: "❓ Unknown subcommand",
      description: `Use: \`on\`, \`off\`, \`criteria\`, \`channel\`, \`clear\` or \`status\`.`, colour: COR.erro },
    { title: "❓ Subcomando desconocido",
      description: `Usa: \`on\`, \`off\`, \`criteria\`, \`channel\`, \`clear\` o \`status\`.`, colour: COR.erro }));
}
