// &idioma — idioma do bot neste servidor

export default {
  id: "idioma",
  modulo: "../core/i18n.js",
  funcao: "cmdIdioma",
  nomes: { en: "language" },
  apelidos: ["language", "lang"],
  es: { nome: "idioma", subcomandos: { portugues: "portugues", english: "ingles", status: "estado" } },   // espanhol (etapa 4)
  subcomandos: { portugues: "portuguese", english: "english", status: "status" },
  essencial: true,
  qualquerCanal: true,
  ajuda: {
    perm: { pt: "ManagePermissions (para mudar)", en: "ManagePermissions (to change)", es: "ManagePermissions (para cambiarlo)" },
    uso: "{&idioma} [pt|en|es]",
    desc: {
      pt: "Define o idioma em que o bot responde **neste servidor**: Português, Inglês ou Espanhol (no espanhol, por enquanto, só os nomes dos comandos e parte da ajuda; o resto sai em inglês). Sem argumento, mostra o idioma atual. Também responde por `language` e `lang`. O idioma oficial do bot é o **inglês**: servidor novo começa nele.",
      en: "Sets the language the bot replies in **on this server**: Portuguese, English or Spanish (in Spanish, for now, only the command names and part of the help; the rest comes out in English). Without an argument, shows the current language. Also answers to `idioma` and `lang`. The bot's official language is **English**: new servers start in it.",
      es: "Define el idioma en que responde el bot **en este servidor**: portugués, inglés o español. Sin argumento, muestra el idioma actual. También responde a `language` y `lang`. En español, los nombres de los comandos ya salen en español; las respuestas se van traduciendo poco a poco, y lo que falta sale en inglés. El idioma oficial del bot es el **inglés**: un servidor nuevo empieza en él.",
    },
    ex: "{&idioma} pt",
    parametros: [
      { nome: "pt | en | es",
        desc: { pt: "idioma das respostas e dos nomes de comando exibidos neste servidor", en: "language of the replies and of the command names shown on this server", es: "el idioma de las respuestas y de los nombres de comandos que se muestran en este servidor" } },
      { nome: { pt: "status", en: "status", es: "estado" }, desc: { pt: "o idioma atual", en: "the current language", es: "el idioma actual" } },
    ],
  },
};
