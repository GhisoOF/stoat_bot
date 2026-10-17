// &sobre — informações sobre o bot (créditos, números, links)

export default {
  id: "sobre",
  modulo: "../moderacao/geral.js",
  funcao: "cmdSobre",
  nomes: { en: "about" },
  apelidos: ["info", "about"],
  ajuda: {
    perm: null,
    uso: "{&sobre}",
    desc: {
      pt: "Mostra informações resumidas do bot: recursos, número de comandos e há quanto tempo está no ar.",
      en: "Shows a summary of the bot: features, number of commands and how long it has been up.",
    },
    ex: "{&sobre}",
  },
};
