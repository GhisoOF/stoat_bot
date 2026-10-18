// &repete — o bot repete um texto (anúncios rápidos)

export default {
  id: "repete",
  modulo: "../moderacao/geral.js",
  funcao: "cmdRepete",
  nomes: { en: "repeat" },
  apelidos: ["repeat"],
  es: { nome: "repetir" },   // espanhol (etapa 4)
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    perm: "ManageMessages",
    uso: { pt: "{&repete} <texto>", en: "{&repete} <text>", es: "{&repete} <texto>" },
    desc: {
      pt: "O bot repete exatamente o texto informado. Útil para anúncios.",
      en: "The bot repeats the given text verbatim. Useful for announcements.",
      es: "El bot repite exactamente el texto indicado. Útil para anuncios.",
    },
    ex: { pt: "{&repete} Bem-vindos ao servidor!", en: "{&repete} Welcome to the server!", es: "{&repete} ¡Bienvenidos al servidor!" },
  },
};
