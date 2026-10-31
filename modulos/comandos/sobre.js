// &info (id interno `sobre`) — o bot neste servidor, os créditos e o suporte.
// (P2, 31 out 2026) o nome em inglês passou de `about` a `info`; `about`, `support`,
// `suporte` e `soporte` levam ao mesmo comando.

export default {
  id: "sobre",
  modulo: "../moderacao/info.js",
  funcao: "cmdInfo",
  nomes: { en: "info" },
  apelidos: ["info", "about", "support", "suporte", "soporte", "acerca"],
  es: { nome: "info" },
  ajuda: {
    grupo: "comecar",
    perm: null,
    uso: "{&sobre}",
    resumo: { pt: "o bot neste servidor, os créditos e o suporte", en: "the bot on this server, credits and support", es: "el bot en este servidor, los créditos y el soporte" },
    desc: {
      pt: "O que está ligado neste servidor, números do bot (comandos, tempo no ar), créditos e **suporte**: chame **Ghiso#4419** no privado.",
      en: "What's on in this server, the bot's numbers (commands, uptime), credits and **support**: DM **Ghiso#4419**.",
      es: "Lo que está activado en este servidor, los números del bot (comandos, tiempo en línea), los créditos y el **soporte**: escribe a **Ghiso#4419** por privado.",
    },
    ex: "{&sobre}",
  },
};
