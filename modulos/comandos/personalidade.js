// &personalidade — a persona da Judy, a mesma em todo lugar (P2, 31 out 2026: só o
// dono do bot muda; antes cada servidor tinha a sua)

export default {
  id: "personalidade",
  modulo: "../ai/persona.js",
  funcao: "cmdPersonalidade",
  apelidos: ["personality"],
  es: { nome: "personalidad", subcomandos: { ver: "ver", definir: "definir", resetar: "restablecer", padrao: "predeterminado" } },   // espanhol (etapa 4)
  // (21 out 2026, fim da fase 3) o handler só conhece o nome interno: `set`, `view`,
  // `reset` chegam traduzidos daqui
  subcomandos: { ver: ["view", "show"], definir: "set", resetar: "reset", padrao: "default" },
  textoLivre: true,
  ajuda: {
    grupo: "dono",
    resumo: { pt: "a personalidade da Judy (a mesma em todo servidor)", en: "Judy's personality (the same on every server)", es: "la personalidad de Judy (la misma en todo servidor)" },
    perm: { pt: "dono do bot", en: "bot owner", es: "dueño del bot" },
    uso: {
      pt: "{&personalidade} [ver | definir <texto> | resetar]",
      en: "{&personalidade} [view | set <text> | reset]",
      es: "{&personalidade} [ver | definir <texto> | restablecer]",
    },
    desc: {
      pt: "**Só o dono do bot.** O prompt de personalidade da Judy — o mesmo em todos os servidores.\n\n`{&personalidade}` — a atual (ou o padrão)\n`{&personalidade.definir} <texto>` — troca (até 2000 caracteres)\n`{&personalidade.resetar}` — volta ao padrão\n\n_O texto troca só a **personalidade**: as regras de segurança, formato e idioma continuam valendo, e quem criou a Judy também fica._",
      en: "**Bot owner only.** Judy's personality prompt — the same on every server.\n\n`{&personalidade}` — the current one (or the default)\n`{&personalidade.definir} <text>` — changes it (up to 2000 characters)\n`{&personalidade.resetar}` — back to the default\n\n_The text only replaces the **personality**: safety, format and language rules still apply, and who created Judy stays too._",
      es: "**Solo el dueño del bot.** El prompt de personalidad de Judy — el mismo en todos los servidores.\n\n`{&personalidade}` — la actual (o la predeterminada)\n`{&personalidade.definir} <texto>` — la cambia (hasta 2000 caracteres)\n`{&personalidade.resetar}` — vuelve a la predeterminada\n\n_El texto cambia solo la **personalidad**: las reglas de seguridad, formato e idioma siguen valiendo, y quién creó a Judy también se queda._",
    },
    ex: { pt: "{&personalidade.definir} fala como uma pirata educada", en: "{&personalidade.definir} talk like a polite pirate", es: "{&personalidade.definir} habla como una pirata educada" },
    parametros: [
      { nome: { pt: "ver", en: "view", es: "ver" }, desc: { pt: "a personalidade atual (o padrão, se ninguém definiu)", en: "the current personality (the default, if nobody set one)", es: "la personalidad actual (la predeterminada, si nadie la definió)" } },
      { nome: { pt: "definir", en: "set", es: "definir" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" }, desc: { pt: "a personalidade de todos os servidores", en: "the personality for every server", es: "la personalidad de todos los servidores" } },
      { nome: { pt: "resetar", en: "reset", es: "restablecer" }, desc: { pt: "volta ao padrão embutido", en: "back to the built-in default", es: "vuelve a la predeterminada" } },
    ],
  },
};
