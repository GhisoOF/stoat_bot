// &repete — o bot repete um texto (anúncios rápidos)

export default {
  id: "repete",
  modulo: "../moderacao/geral.js",
  funcao: "cmdRepete",
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    perm: "ManageMessages",
    uso: { pt: "{&repete} <texto>", en: "{&repete} <text>" },
    desc: {
      pt: "O bot repete exatamente o texto informado. Útil para anúncios.",
      en: "The bot repeats the given text verbatim. Useful for announcements.",
    },
    ex: { pt: "{&repete} Bem-vindos ao servidor!", en: "{&repete} Welcome to the server!" },
  },
};
