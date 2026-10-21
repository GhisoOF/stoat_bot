// &personalidade — a persona da IA neste servidor

export default {
  id: "personalidade",
  modulo: "../ai/persona.js",
  funcao: "cmdPersonalidade",
  apelidos: ["personality"],
  es: { nome: "personalidad", subcomandos: { ver: "ver", definir: "definir", resetar: "restablecer" } },   // espanhol (etapa 4)
  // (21 out 2026, fim da fase 3) o handler só conhece o nome interno: `set`, `view`,
  // `reset` chegam traduzidos daqui
  subcomandos: { ver: ["view", "show"], definir: "set", resetar: "reset", padrao: "default" },
  // (sem soIA, como antes: marcar mudaria o comportamento — recusar o comando nos servidores
  // sem IA, onde a persona não tem efeito. Decisão pendente do Ghieh, anotada na REFATORACAO.)
  textoLivre: true,
  ajuda: {
    perm: { pt: "ManageServer (para mudar)", en: "ManageServer (to change)", es: "ManageServer (para cambiar)" },
    uso: {
      pt: "{&personalidade} [ver | definir <texto> | resetar]",
      en: "{&personalidade} [view | set <text> | reset]",
      es: "{&personalidade} [ver | definir <texto> | restablecer]",
    },
    desc: {
      pt: "O **prompt de personalidade** da IA, por servidor: o jeito da Judy falar aqui.\n\n`{&personalidade}` — mostra a atual (personalizada ou o padrão)\n`{&personalidade.definir} <texto>` — define a deste servidor (até 2000 caracteres)\n`{&personalidade.resetar}` — volta ao padrão embutido\n\n_O texto troca só a **personalidade**: as regras de segurança, formato e idioma continuam valendo. Quem criou a Judy também fica — não sai com a persona._",
      en: "The AI's **personality prompt**, per server: how Judy talks here.\n\n`{&personalidade}` — shows the current one (custom or the default)\n`{&personalidade.definir} <text>` — sets this server's (up to 2000 characters)\n`{&personalidade.resetar}` — back to the built-in default\n\n_The text only replaces the **personality**: safety, format and language rules still apply. Who created Judy stays too — it doesn't go with the persona._",
      es: "El **prompt de personalidad** de la IA, por servidor: cómo habla Judy aquí.\n\n`{&personalidade}` — muestra la actual (personalizada o la predeterminada)\n`{&personalidade.definir} <texto>` — define la de este servidor (hasta 2000 caracteres)\n`{&personalidade.resetar}` — vuelve a la predeterminada\n\n_El texto cambia solo la **personalidad**: las reglas de seguridad, formato e idioma siguen valiendo. Quién creó a Judy también se queda — no se va con la persona._",
    },
    ex: { pt: "{&personalidade.definir} fala como uma pirata educada", en: "{&personalidade.definir} talk like a polite pirate", es: "{&personalidade.definir} habla como una pirata educada" },
    parametros: [
      { nome: { pt: "ver", en: "view", es: "ver" }, desc: { pt: "a personalidade atual (o padrão, se ninguém definiu)", en: "the current personality (the default, if nobody set one)", es: "la personalidad actual (la predeterminada, si nadie la definió)" } },
      { nome: { pt: "definir", en: "set", es: "definir" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" }, desc: { pt: "o prompt deste servidor; exige **ManageServer**", en: "this server's prompt; needs **ManageServer**", es: "el prompt de este servidor; requiere **ManageServer**" } },
      { nome: { pt: "resetar", en: "reset", es: "restablecer" }, desc: { pt: "apaga a deste servidor e volta ao padrão; exige **ManageServer**", en: "erases this server's and goes back to the default; needs **ManageServer**", es: "borra la de este servidor y vuelve a la predeterminada; requiere **ManageServer**" } },
    ],
  },
};
