
import * as log from "../core/log.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { nomeExibido, corrigirSubcomando, citar } from "../core/aliases.js";
import { maisParecido } from "../core/parecido.js";

export const GRANT_ALL_SAFE = 0x000fffffffffffffn;

export async function cmdComando(message, args, ctx) {
  const { config, estado, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const telaEn = idiomaDe(ctx) === "es" ? "es" : "en";   // o nome solto na tela (sem &): em espanhol, o espanhol

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para gerenciar comandos.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to manage commands.", colour: COR.erro },
      { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManagePermissions** para gestionar los comandos.", colour: COR.erro }));

  config.comandosDesativados ??= [];
  const geren = estado.comandosGerenciaveisDe?.(ctx.serverId) ?? estado.COMANDOS_GERENCIAVEIS ?? [];
  const canon = (nome) => (estado.CANONICO?.[nome] ?? nome);

  const sub = args[0]?.toLowerCase();

  // ── &comando → status ── (`list` também: a ajuda sempre prometeu `&comando list`,
  // e ele caía no "uso errado" — 18 out 2026)
  if (!sub || sub === "list") {
    const linhas = geren.map((c) => {
      const off = config.comandosDesativados.includes(c);
      return `${off ? "🔴" : "🟢"} \`${nomeExibido(c, lang === "en" ? telaEn : lang)}\``;
    });
    return sendEmbed(message.channel, tr(ctx, {
      title: "🎛 Comandos do servidor",
      description: [
        "🟢 ativo · 🔴 desativado",
        "",
        linhas.join("  "),
        "",
        "**Uso:**",
        `\`${citar("comando.desativar", "pt", PREFIXO)} <nome>\` — desativa`,
        `\`${citar("comando.ativar", "pt", PREFIXO)} <nome>\` — reativa`,
        "",
        "_`help` e `comando` não podem ser desativados (para você não se trancar para fora)._",
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "🎛 Server commands",
      description: [
        "🟢 active · 🔴 disabled",
        "",
        linhas.join("  "),
        "",
        "**Usage:**",
        `\`${citar("comando.desativar", "en", PREFIXO)} <name>\` — disables`,
        `\`${citar("comando.ativar", "en", PREFIXO)} <name>\` — re-enables`,
        "",
        "_`help` and `command` can't be disabled (so you can't lock yourself out)._",
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "🎛 Comandos del servidor",
      description: [
        "🟢 activo · 🔴 desactivado",
        "",
        linhas.join("  "),
        "",
        "**Uso:**",
        `\`${citar("comando.desativar", "es", PREFIXO)} <nombre>\` — lo desactiva`,
        `\`${citar("comando.ativar", "es", PREFIXO)} <nombre>\` — lo reactiva`,
        "",
        `_\`${nomeExibido("help", "es")}\` y \`${nomeExibido("comando", "es")}\` no se pueden desactivar (para que no te quedes fuera)._`,
      ].join("\n"),
      colour: COR.mod,
    }));
  }

  const DESLIGA = new Set(["disable", "off", "desativar", "desligar", "desabilitar"]);
  const LIGA    = new Set(["enable", "on", "ativar", "ligar", "habilitar", "reativar"]);
  if (!DESLIGA.has(sub) && !LIGA.has(sub)) {
    // `destivar` → "você quis dizer `desativar`?" (17 out 2026: só mostrava o uso)
    const certo = corrigirSubcomando("comando", sub);
    const pronto = certo ? `${citar("comando", lingua(ctx), PREFIXO)} ${certo}${args.length > 1 ? " " + args.slice(1).join(" ") : ""}` : null;
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso incorreto", description: [pronto ? `Você quis dizer \`${pronto}\`?\n` : null, `\`${citar("comando", "pt", PREFIXO)} <desativar|ativar> <nome>\``].filter(Boolean).join("\n"), colour: COR.erro },
      { title: "❌ Wrong usage", description: [pronto ? `Did you mean \`${pronto}\`?\n` : null, `\`${citar("comando", "en", PREFIXO)} <disable|enable> <name>\``].filter(Boolean).join("\n"), colour: COR.erro },
      { title: "❌ Uso incorrecto", description: [pronto ? `¿Quisiste decir \`${pronto}\`?\n` : null, `\`${citar("comando", "es", PREFIXO)} <desactivar|activar> <nombre>\``].filter(Boolean).join("\n"), colour: COR.erro }));
  }

  const alvo = canon(args[1]?.toLowerCase());
  if (!alvo)
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Falta o comando",
        description: `Diga qual comando. Ex.: \`${citar("comando.desativar", "pt", PREFIXO)} ban\``, colour: COR.erro },
      { title: "❌ Missing the command",
        description: `Tell me which command. E.g.: \`${citar("comando.desativar", "en", PREFIXO)} ban\``, colour: COR.erro },
      { title: "❌ Falta el comando",
        description: `Dime qué comando. Ej.: \`${citar("comando.desativar", "es", PREFIXO)} ${nomeExibido("ban", "es")}\``, colour: COR.erro }));

  if (!geren.includes(alvo)) {
    // `pnig` → `ping` (o nome do comando ou o apelido, nos dois idiomas)
    const nomesGeren = Object.keys(estado.CANONICO ?? {}).filter((n) => geren.includes(canon(n))).concat(geren, geren.map((c) => nomeExibido(c, "en")), geren.map((c) => nomeExibido(c, "es")));
    const perto = maisParecido(alvo, nomesGeren);
    const pronto = perto ? `${citar("comando", lingua(ctx), PREFIXO)} ${args[0]} ${perto}` : null;
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Comando inválido",
      description: `${pronto ? `Você quis dizer \`${pronto}\`?\n\n` : ""}\`${alvo}\` não pode ser gerenciado.\nGerenciáveis: ${geren.map((c) => `\`${c}\``).join(", ")}`,
      colour: COR.erro,
    }, {
      title: "❌ Invalid command",
      description: `${pronto ? `Did you mean \`${pronto}\`?\n\n` : ""}\`${alvo}\` can't be managed.\nManageable: ${geren.map((c) => `\`${nomeExibido(c, telaEn)}\``).join(", ")}`,
      colour: COR.erro,
    }, {
      title: "❌ Comando inválido",
      description: `${pronto ? `¿Quisiste decir \`${pronto}\`?\n\n` : ""}\`${alvo}\` no se puede gestionar.\nGestionables: ${geren.map((c) => `\`${nomeExibido(c, "es")}\``).join(", ")}`,
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
    en: { titulo: desativar ? "🔴 Command disabled" : "🟢 Command re-enabled",
      descricao: `<@${message.authorId}> ${desativar ? "disabled" : "re-enabled"} \`${PREFIXO}${alvo}\`.` },
    es: { titulo: desativar ? "🔴 Comando desactivado" : "🟢 Comando reactivado",
      descricao: `<@${message.authorId}> ${desativar ? "desactivó" : "reactivó"} \`${PREFIXO}${nomeExibido(alvo, "es")}\`.` },
  });

  return sendEmbed(message.channel, tr(ctx, {
    title: desativar ? "🔴 Comando desativado" : "🟢 Comando reativado",
    description: `\`${PREFIXO}${alvo}\` agora está **${desativar ? "desativado" : "ativo"}** neste servidor.`,
    colour: COR.mod,
  }, {
    title: desativar ? "🔴 Command disabled" : "🟢 Command re-enabled",
    description: `\`${PREFIXO}${alvo}\` is now **${desativar ? "disabled" : "active"}** on this server.`,
    colour: COR.mod,
  }, {
    title: desativar ? "🔴 Comando desactivado" : "🟢 Comando reactivado",
    description: `\`${PREFIXO}${nomeExibido(alvo, "es")}\` ahora está **${desativar ? "desactivado" : "activo"}** en este servidor.`,
    colour: COR.mod,
  }));
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
  }, {
    title: "🔇 El rol de silencio se retiró",
    description: [
      "El silencio ahora es el **timeout nativo de Stoat** — en el mute de la escalera, en el modo `confirmar` y en `" + citar("silenciar", "es", P) + "`. La persona solo puede ver el servidor hasta que termine el plazo, y el propio Stoat la libera.",
      "",
      "No hay que crear ningún rol: basta con que el rol del bot tenga **TimeoutMembers** y esté por encima de las personas a moderar. Quien tiene TimeoutMembers no puede ser silenciado (regla de Stoat).",
      antigo ? `\nEl rol antiguo <%${antigo}> ya no se usa — puedes borrarlo en Ajustes del servidor → Roles.` : "",
    ].join("\n"),
    colour: COR.info,
  }));
}
