// &userinfo — ID, conta, entrada, cargos e foto de perfil

export default {
  id: "userinfo",
  modulo: "../moderacao/userinfo.js",
  funcao: "cmdUserinfo",
  es: { nome: "userinfo" },
  gerenciavel: true,
  ajuda: {
    grupo: "comecar",
    uso: { pt: "{&userinfo} [@pessoa|id]", en: "{&userinfo} [@user|id]", es: "{&userinfo} [@usuario|id]" },
    desc: {
      pt: "Mostra ID, criação da conta, entrada no servidor, cargos e a foto de perfil. Sem ninguém, mostra você.\nA staff (ManageMessages) também vê o histórico de moderação e pode apontar pelo nome ou respondendo.",
      en: "Shows ID, account creation, server join, roles and the profile picture. With nobody, shows you.\nStaff (ManageMessages) also see the moderation history and can point by name or by replying.",
      es: "Muestra el ID, la creación de la cuenta, la entrada al servidor, los roles y la foto de perfil. Sin nadie, te muestra a ti.\nEl staff (ManageMessages) también ve el historial de moderación y puede señalar por nombre o respondiendo.",
    },
    ex: { pt: "{&userinfo} @fulano", en: "{&userinfo} @someone", es: "{&userinfo} @alguien" },
  },
};
