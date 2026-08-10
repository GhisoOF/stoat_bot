// ══════════════════════════════════════════════════════════
//  modia-comando.js — configura a moderação por IA (&modia)
// ══════════════════════════════════════════════════════════

export async function cmdModIA(message, args, ctx) {
  const { sendEmbed, COR, config, getServer, membroTemPermissao } = ctx;

  const server = await getServer?.(message);
  const podeGerir = !membroTemPermissao || membroTemPermissao(message, server, "ManageServer");
  const sub = args[0]?.toLowerCase();

  config.moderacaoIA ??= { ativa: false, criterios: "", canais: [] };
  const m = config.moderacaoIA;

  // Sem subcomando → status
  if (!sub || sub === "status") {
    const canais = m.canais?.length ? m.canais.map((c) => `<#${c}>`).join(", ") : "todos os canais";
    return sendEmbed(message.channel, {
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
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManageServer** para configurar a moderação por IA.", colour: COR.erro });
  }

  if (sub === "on" || sub === "off") {
    if (sub === "on" && !m.criterios?.trim()) {
      return sendEmbed(message.channel, { title: "⚠️ Defina os critérios primeiro",
        description: `Antes de ligar, diga o que moderar:\n\`${ctx.PREFIXO}modia criterios não permitir spam de divulgação nem ataques pessoais\``, colour: COR.aviso });
    }
    m.ativa = sub === "on";
    ctx.salvarConfig?.();
    return sendEmbed(message.channel, { title: m.ativa ? "🟢 Moderação por IA ativada" : "🔴 Moderação por IA desativada",
      description: m.ativa ? "A Judy passa a avaliar as mensagens pelos critérios definidos." : "A Judy parou de moderar a conversa.", colour: m.ativa ? COR.sucesso : COR.aviso });
  }

  if (sub === "criterios" || sub === "critérios") {
    const texto = args.slice(1).join(" ").trim();
    if (!texto) {
      return sendEmbed(message.channel, { title: "📝 Como definir critérios",
        description: [
          "Escreva em linguagem natural o que a Judy deve moderar. Exemplos:",
          "",
          `\`${ctx.PREFIXO}modia criterios Apague divulgação de outros servidores, venda de contas e ataques pessoais diretos. Não modere palavrão leve nem discussão acalorada.\``,
          "",
          "Quanto mais claro e específico, melhor ela acerta.",
        ].join("\n"), colour: COR.info });
    }
    m.criterios = texto.slice(0, 2000);
    ctx.salvarConfig?.();
    return sendEmbed(message.channel, { title: "📝 Critérios atualizados",
      description: `A Judy vai moderar com base em:\n\`\`\`\n${m.criterios}\n\`\`\`${m.ativa ? "" : `\n\nAtive com \`${ctx.PREFIXO}modia on\`.`}`, colour: COR.sucesso });
  }

  if (sub === "canal") {
    const acao = args[1]?.toLowerCase();
    const canalId = message.channelId;
    m.canais ??= [];
    if (acao === "add") {
      if (!m.canais.includes(canalId)) m.canais.push(canalId);
      ctx.salvarConfig?.();
      return sendEmbed(message.channel, { title: "📍 Canal adicionado",
        description: `A Judy vigia este canal. (Sem canais na lista, ela vigia todos.)`, colour: COR.sucesso });
    }
    if (acao === "remove") {
      m.canais = m.canais.filter((c) => c !== canalId);
      ctx.salvarConfig?.();
      return sendEmbed(message.channel, { title: "📍 Canal removido",
        description: "A Judy não vigia mais este canal especificamente.", colour: COR.aviso });
    }
    return sendEmbed(message.channel, { title: "Uso",
      description: `\`${ctx.PREFIXO}modia canal add\` ou \`${ctx.PREFIXO}modia canal remove\` (no canal desejado).`, colour: COR.info });
  }

  if (sub === "limpar") {
    m.criterios = ""; m.ativa = false; m.canais = [];
    ctx.salvarConfig?.();
    return sendEmbed(message.channel, { title: "🧹 Moderação por IA zerada",
      description: "Critérios apagados e moderação desligada.", colour: COR.aviso });
  }

  return sendEmbed(message.channel, { title: "❓ Subcomando desconhecido",
    description: `Use: \`on\`, \`off\`, \`criterios\`, \`canal\`, \`limpar\` ou \`status\`.`, colour: COR.erro });
}
