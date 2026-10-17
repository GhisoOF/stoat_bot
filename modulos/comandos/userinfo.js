// &userinfo — ID, entrada e cargos de alguém

export default {
  id: "userinfo",
  modulo: "../moderacao/geral.js",
  funcao: "cmdUserinfo",
  gerenciavel: true,
  ajuda: {
    uso: { pt: "{&userinfo} [@usuário]", en: "{&userinfo} [@user]" },
    desc: {
      pt: "Mostra ID, data de criação da conta, entrada no servidor e cargos. Sem menção, mostra você.",
      en: "Shows ID, account creation date, server join date and roles. Without a mention, shows you.",
    },
    ex: { pt: "{&userinfo} @fulano", en: "{&userinfo} @someone" },
  },
};
