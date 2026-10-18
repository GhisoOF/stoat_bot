// &sobre — informações sobre o bot (créditos, números, links)

export default {
  id: "sobre",
  modulo: "../moderacao/geral.js",
  funcao: "cmdSobre",
  nomes: { en: "about" },
  apelidos: ["info", "about"],
  es: { nome: "acerca" },   // espanhol (etapa 4)
  ajuda: {
    perm: null,
    uso: "{&sobre}",
    desc: {
      pt: "Mostra informações resumidas do bot: recursos, número de comandos e há quanto tempo está no ar.",
      en: "Shows a summary of the bot: features, number of commands and how long it has been up.",
      es: "Muestra un resumen del bot: funciones, número de comandos y cuánto tiempo lleva en línea.",
    },
    ex: "{&sobre}",
  },
};
