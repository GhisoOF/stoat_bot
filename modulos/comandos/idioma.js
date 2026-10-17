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
};
