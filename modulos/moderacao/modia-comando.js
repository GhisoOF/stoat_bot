
import { tr, lingua } from "../core/i18n.js";

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
    const canais = m.canais?.length ? m.canais.map((c) => `<#${c}>`).join(", ") : (en ? "all channels" : "todos os canais");
    return sendEmbed(message.channel, en ? {
      title: "🤖 AI moderation",
      description: [
        `**State:** ${m.ativa ? "🟢 active" : "🔴 off"}`,
        `**Channels:** ${canais}`,
        "",
        "**Current criteria:**",
        m.criterios?.trim() ? `\`\`\`\n${m.criterios}\n\`\`\`` : "_(none — set them with `&modia criterios ...`)_",
        "",
        "Judy evaluates each message; if it violates the rules, she **deletes it and pings the owner** in the #log with the options. She never bans on her own.",
        "",
        `\`${ctx.PREFIXO}modia on|off\` · \`${ctx.PREFIXO}modia criterios <text>\` · \`${ctx.PREFIXO}modia canal add|remove\` · \`${ctx.PREFIXO}modia limpar\``,
      ].join("\n"),
      colour: COR.info,
    } : {
      title: "🤖 Moderação por IA",
      description: [
        `**Estado:** ${m.ativa ? "🟢 ativa" : "🔴 desativada"}`,
        `**Canais:** ${canais}`,
        "",
        "**Critérios atuais:**",
        m.criterios?.trim() ? `\`\`\`\n${m.criterios}\n\`\`\`` : "_(nenhum — defina com `&modia criterios ...`)_",
        "",
        "A Judy avalia cada mensagem; se violar, **apaga e marca o dono** no #log com as opções. Ela nunca bane sozinha.",
        "",
        `\`${ctx.PREFIXO}modia on|off\` · \`${ctx.PREFIXO}modia criterios <texto>\` · \`${ctx.PREFIXO}modia canal add|remove\` · \`${ctx.PREFIXO}modia limpar\``,
      ].join("\n"),
      colour: COR.info,
    });
  }

  if (!podeGerir) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageServer** para configurar a moderação por IA.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageServer** to configure AI moderation.", colour: COR.erro }));
  }

  if (sub === "on" || sub === "off") {
    if (sub === "on" && !m.criterios?.trim()) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "⚠️ Defina os critérios primeiro",
        description: `Antes de ligar, diga o que moderar:\n\`${ctx.PREFIXO}modia criterios não permitir spam de divulgação nem ataques pessoais\``, colour: COR.aviso,
      }, {
        title: "⚠️ Set the criteria first",
        description: `Before enabling, tell me what to moderate:\n\`${ctx.PREFIXO}modia criterios don't allow promo spam or personal attacks\``, colour: COR.aviso,
      }));
    }
    m.ativa = sub === "on";
    ctx.salvarConfig?.();
    return sendEmbed(message.channel, en ? {
      title: m.ativa ? "🟢 AI moderation enabled" : "🔴 AI moderation disabled",
      description: m.ativa ? "Judy will now evaluate messages using the defined criteria." : "Judy stopped moderating the conversation.", colour: m.ativa ? COR.sucesso : COR.aviso,
    } : {
      title: m.ativa ? "🟢 Moderação por IA ativada" : "🔴 Moderação por IA desativada",
      description: m.ativa ? "A Judy passa a avaliar as mensagens pelos critérios definidos." : "A Judy parou de moderar a conversa.", colour: m.ativa ? COR.sucesso : COR.aviso });
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
          description: `Judy watches this channel. (With no channels listed, she watches all of them.)`, colour: COR.sucesso }));
    }
    if (acao === "remove") {
      m.canais = m.canais.filter((c) => c !== canalId);
      ctx.salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "📍 Canal removido",
          description: "A Judy não vigia mais este canal especificamente.", colour: COR.aviso },
        { title: "📍 Channel removed",
          description: "Judy no longer watches this channel specifically.", colour: COR.aviso }));
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "Uso",
        description: `\`${ctx.PREFIXO}modia canal add\` ou \`${ctx.PREFIXO}modia canal remove\` (no canal desejado).`, colour: COR.info },
      { title: "Usage",
        description: `\`${ctx.PREFIXO}modia canal add\` or \`${ctx.PREFIXO}modia canal remove\` (in the desired channel).`, colour: COR.info }));
  }

  if (sub === "limpar") {
    m.criterios = ""; m.ativa = false; m.canais = [];
    ctx.salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🧹 Moderação por IA zerada",
        description: "Critérios apagados e moderação desligada.", colour: COR.aviso },
      { title: "🧹 AI moderation reset",
        description: "Criteria erased and moderation turned off.", colour: COR.aviso }));
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "❓ Subcomando desconhecido",
      description: `Use: \`on\`, \`off\`, \`criterios\`, \`canal\`, \`limpar\` ou \`status\`.`, colour: COR.erro },
    { title: "❓ Unknown subcommand",
      description: `Use: \`on\`, \`off\`, \`criterios\`, \`canal\`, \`limpar\` or \`status\`.`, colour: COR.erro }));
}
