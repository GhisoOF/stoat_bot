// &userinfo — ID, entrada e cargos de alguém

export default {
  id: "userinfo",
  modulo: "../moderacao/geral.js",
  funcao: "cmdUserinfo",
  es: { nome: "userinfo" },   // espanhol (etapa 4)
  gerenciavel: true,
  ajuda: {
    uso: { pt: "{&userinfo} [@usuário]", en: "{&userinfo} [@user]", es: "{&userinfo} [@usuario]" },
    desc: {
      pt: "Mostra ID, data de criação da conta, entrada no servidor e cargos. Sem menção, mostra você.",
      en: "Shows ID, account creation date, server join date and roles. Without a mention, shows you.",
      es: "Muestra el ID, la fecha de creación de la cuenta, la entrada al servidor y los roles. Sin mención, te muestra a ti.",
    },
    ex: { pt: "{&userinfo} @fulano", en: "{&userinfo} @someone", es: "{&userinfo} @alguien" },
  },
};
