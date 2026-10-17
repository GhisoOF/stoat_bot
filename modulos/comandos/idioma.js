// &idioma — idioma do bot neste servidor

export default {
  id: "idioma",
  modulo: "../core/i18n.js",
  funcao: "cmdIdioma",
  nomes: { en: "language" },
  apelidos: ["language", "lang"],
  subcomandos: { portugues: "portuguese", english: "english", status: "status" },
  essencial: true,
  qualquerCanal: true,
  ajuda: {
    perm: { pt: "ManagePermissions (para mudar)", en: "ManagePermissions (to change)" },
    uso: "{&idioma} [pt|en]",
    desc: {
      pt: "Define o idioma em que o bot responde **neste servidor**: Português ou Inglês. Sem argumento, mostra o idioma atual. Também responde por `language` e `lang`. O idioma oficial do bot é o **inglês**: servidor novo começa nele.",
      en: "Sets the language the bot replies in **on this server**: Portuguese or English. Without an argument, shows the current language. Also answers to `idioma` and `lang`. The bot's official language is **English**: new servers start in it.",
    },
    ex: "{&idioma} pt",
    parametros: [
      { nome: "pt | en",
        desc: { pt: "idioma das respostas e dos nomes de comando exibidos neste servidor", en: "language of the replies and of the command names shown on this server" } },
      { nome: "status", desc: { pt: "o idioma atual", en: "the current language" } },
    ],
  },
};
