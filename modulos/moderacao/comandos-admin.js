
import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";

export const GRANT_ALL_SAFE = 0x000fffffffffffffn;

export async function cmdComando(message, args, ctx) {
  const { config, estado, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para gerenciar comandos.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to manage commands.", colour: COR.erro }));

  config.comandosDesativados ??= [];
  const geren = estado.comandosGerenciaveisDe?.(ctx.serverId) ?? estado.COMANDOS_GERENCIAVEIS ?? [];
  const canon = (nome) => (estado.CANONICO?.[nome] ?? nome);

  const sub = args[0]?.toLowerCase();

  // ── &comando → status ──
  if (!sub) {
    const linhas = geren.map((c) => {
      const off = config.comandosDesativados.includes(c);
      return `${off ? "🔴" : "🟢"} \`${c}\``;
    });
    return sendEmbed(message.channel, lang === "en" ? {
      title: "🎛 Server commands",
      description: [
        "🟢 active · 🔴 disabled",
        "",
        linhas.join("  "),
        "",
        "**Usage:**",
        `\`${PREFIXO}comando disable <name>\` — disables`,
        `\`${PREFIXO}comando enable <name>\` — re-enables`,
        "",
        "_`help` and `comando` can't be disabled (so you can't lock yourself out)._",
      ].join("\n"),
      colour: COR.mod,
    } : {
      title: "🎛 Comandos do servidor",
      description: [
        "🟢 ativo · 🔴 desativado",
        "",
        linhas.join("  "),
        "",
        "**Uso:**",
        `\`${PREFIXO}comando desativar <nome>\` — desativa`,
        `\`${PREFIXO}comando ativar <nome>\` — reativa`,
        "",
        "_`help` e `comando` não podem ser desativados (para você não se trancar para fora)._",
      ].join("\n"),
      colour: COR.mod,
    });
  }

  const DESLIGA = new Set(["disable", "off", "desativar", "desligar", "desabilitar"]);
  const LIGA    = new Set(["enable", "on", "ativar", "ligar", "habilitar", "reativar"]);
  if (!DESLIGA.has(sub) && !LIGA.has(sub)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso incorreto", description: `\`${PREFIXO}comando <desativar|ativar> <nome>\``, colour: COR.erro },
      { title: "❌ Wrong usage", description: `\`${PREFIXO}comando <disable|enable> <name>\``, colour: COR.erro }));
  }

  const alvo = canon(args[1]?.toLowerCase());
  if (!alvo)
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Falta o comando",
        description: `Diga qual comando. Ex.: \`${PREFIXO}comando desativar ban\``, colour: COR.erro },
      { title: "❌ Missing the command",
        description: `Tell me which command. E.g.: \`${PREFIXO}comando disable ban\``, colour: COR.erro }));

  if (!geren.includes(alvo)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Comando inválido",
      description: `\`${alvo}\` não pode ser gerenciado.\nGerenciáveis: ${geren.map((c) => `\`${c}\``).join(", ")}`,
      colour: COR.erro,
    }, {
      title: "❌ Invalid command",
      description: `\`${alvo}\` can't be managed.\nManageable: ${geren.map((c) => `\`${c}\``).join(", ")}`,
      colour: COR.erro,
    }));
  }

  const desativar = DESLIGA.has(sub);
  const jaDesativado = config.comandosDesativados.includes(alvo);

  if (desativar && !jaDesativado) config.comandosDesativados.push(alvo);
  if (!desativar && jaDesativado)
    config.comandosDesativados = config.comandosDesativados.filter((c) => c !== alvo);
  salvarConfig();

  await log.registrar(ctx, "comandos", {
    titulo: desativar ? "🔴 Comando desativado" : "🟢 Comando reativado",
    descricao: `<@${message.authorId}> ${desativar ? "desativou" : "reativou"} \`${PREFIXO}${alvo}\`.`,
  });

  return sendEmbed(message.channel, lang === "en" ? {
    title: desativar ? "🔴 Command disabled" : "🟢 Command re-enabled",
    description: `\`${PREFIXO}${alvo}\` is now **${desativar ? "disabled" : "active"}** on this server.`,
    colour: COR.mod,
  } : {
    title: desativar ? "🔴 Comando desativado" : "🟢 Comando reativado",
    description: `\`${PREFIXO}${alvo}\` agora está **${desativar ? "desativado" : "ativo"}** neste servidor.`,
    colour: COR.mod,
  });
}

// &cargomudo — APOSENTADO (1 out 2026). O silêncio da Judy (manual e do
// automod) passou a ser o timeout nativo do Stoat: não há mais cargo a criar,
// posicionar nem negar canal por canal. O comando fica só para avisar quem o
// digitar (como o `&chat especial`), e quem tinha o cargo antigo perde-o
// sozinho quando o prazo vence (vigia de silêncios).
export async function cmdCargoMudo(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config } = ctx;
  const antigo = config?.automod?.punicao?.silenceRoleId ?? null;
  return sendEmbed(message.channel, tr(ctx, {
    title: "🔇 O cargo de silêncio foi aposentado",
    description: [
      "O silêncio agora é o **timeout nativo do Stoat** — no mute da escada, no modo `confirmar` e no `" + P + "silenciar`. A pessoa só consegue ver o servidor até o prazo acabar, e o próprio Stoat a libera.",
      "",
      "Não há cargo a criar: basta o cargo do bot ter **TimeoutMembers** e estar acima das pessoas a moderar. Quem tem TimeoutMembers não pode ser silenciado (regra do Stoat).",
      antigo ? `\nO cargo antigo <%${antigo}> não é mais usado — pode apagá-lo em Configurações do servidor → Cargos.` : "",
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "🔇 The silence role was retired",
    description: [
      "Silencing is now the **Stoat's native timeout** — in the ladder's mute, the `confirmar` mode and `" + P + "silenciar`. The person can only view the server until it ends, and the Stoat lifts it on its own.",
      "",
      "No role to create: the bot's role just needs **TimeoutMembers** and must sit above the people it moderates. Whoever has TimeoutMembers can't be timed out (Stoat rule).",
      antigo ? `\nThe old role <%${antigo}> isn't used anymore — you can delete it in Server settings → Roles.` : "",
    ].join("\n"),
    colour: COR.info,
  }));
}
