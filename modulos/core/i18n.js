
export const IDIOMAS = ["pt", "en"];

// Idioma efetivo do servidor deste ctx. Qualquer valor desconhecido → pt.
export function lingua(ctx) {
  return ctx?.config?.language === "en" ? "en" : "pt";
}

// Escolhe entre dois valores (strings, objetos de embed, arrays…).
export function tr(ctx, pt, en) {
  return lingua(ctx) === "en" ? en : pt;
}

// ── &idioma / &language — o admin define o idioma do servidor ──
export async function cmdIdioma(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config, salvarConfig, membroTemPermissao, getServer } = ctx;

  const pedido = (args[0] ?? "").toLowerCase();
  const mapa = {
    pt: "pt", "pt-br": "pt", portugues: "pt", "português": "pt", portuguese: "pt",
    en: "en", "en-us": "en", ingles: "en", "inglês": "en", english: "en",
  };
  const alvo = mapa[pedido] ?? null;

  // Sem argumento (ou argumento inválido) → mostra o estado, bilíngue.
  if (!alvo) {
    const atual = lingua(ctx);
    return sendEmbed(message.channel, {
      title: "🌐 Idioma / Language",
      colour: COR.info,
      description: [
        `**🇧🇷 Idioma atual:** ${atual === "en" ? "Inglês" : "Português"}`,
        `Para mudar (staff): \`${P}idioma pt\` ou \`${P}idioma en\``,
        "",
        `**🇺🇸 Current language:** ${atual === "en" ? "English" : "Portuguese"}`,
        `To change it (staff): \`${P}language en\` or \`${P}language pt\``,
      ].join("\n"),
    });
  }

  const server = await getServer(message).catch(() => null);
  const podeMudar = membroTemPermissao(message, server, "ManagePermissions");
  if (!podeMudar) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Permissão insuficiente",
      description: "Só quem tem **ManagePermissions** pode mudar o idioma do servidor.",
      colour: COR.erro,
    }, {
      title: "🚫 Missing permission",
      description: "Only members with **ManagePermissions** can change the server language.",
      colour: COR.erro,
    }));
  }

  config.language = alvo;
  config.idiomaPerguntado = true;   // não precisa mais sugerir
  salvarConfig();

  return sendEmbed(message.channel, alvo === "en" ? {
    title: "🌐 Language set: English 🇺🇸",
    colour: COR.sucesso,
    description: [
      "From now on I will reply in **English** on this server.",
      `Change it back anytime with \`${P}language pt\`.`,
      "",
      `Start here: \`${P}help\` · \`${P}tutorial\``,
    ].join("\n"),
  } : {
    title: "🌐 Idioma definido: Português 🇧🇷",
    colour: COR.sucesso,
    description: [
      "A partir de agora respondo em **Português** neste servidor.",
      `Para trocar: \`${P}idioma en\`.`,
      "",
      `Comece por: \`${P}help\` · \`${P}tutorial\``,
    ].join("\n"),
  });
}

export async function talvezSugerirIdioma(message, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config, salvarConfig, serverId } = ctx;
  if (!serverId) return;                    // fora de servidor não faz sentido
  if (config.idiomaPerguntado) return;      // já perguntamos (ou já escolheram)

  config.idiomaPerguntado = true;
  salvarConfig();

  await sendEmbed(message.channel, {
    title: "🌐 Escolha o idioma / Choose the language",
    colour: COR.info,
    description: [
      "🇧🇷 **Português** — este servidor ainda não escolheu um idioma. Quem tem",
      `**ManagePermissions** define com: \`${P}idioma pt\``,
      "",
      "🇺🇸 **English** — this server hasn't picked a language yet. Anyone with",
      `**ManagePermissions** can set it with: \`${P}language en\``,
      "",
      "_Enquanto ninguém escolher, respondo em Português. / Until someone picks, I reply in Portuguese._",
    ].join("\n"),
  });
}
