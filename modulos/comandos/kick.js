// &kick — expulsa alguém

export default {
  id: "kick",
  modulo: "../moderacao/geral.js",
  funcao: "cmdKick",
  gerenciavel: true,
  ajuda: {
    perm: "KickMembers",
    uso: { pt: "{&kick} @usuário [motivo]", en: "{&kick} @user [reason]" },
    desc: {
      pt: "Expulsa o usuário mencionado. Ele pode voltar com um novo convite.\n\n_Só vale sobre quem tem cargo **abaixo** do seu (o dono do servidor passa sempre)._",
      en: "Kicks the mentioned user. They can come back with a new invite.\n\n_Only works on people whose roles are **below** yours (the server owner always can)._",
    },
    ex: { pt: "{&kick} @fulano spam", en: "{&kick} @someone spam" },
  },
};
