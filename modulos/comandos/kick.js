// &kick — expulsa alguém

export default {
  id: "kick",
  modulo: "../moderacao/geral.js",
  funcao: "cmdKick",
  es: { nome: "expulsar" },   // espanhol (etapa 4)
  gerenciavel: true,
  ajuda: {
    perm: "KickMembers",
    uso: { pt: "{&kick} @usuário [motivo]", en: "{&kick} @user [reason]", es: "{&kick} @usuario [motivo]" },
    desc: {
      pt: "Expulsa o usuário mencionado. Ele pode voltar com um novo convite.\n\n_Só vale sobre quem tem cargo **abaixo** do seu (o dono do servidor passa sempre)._",
      en: "Kicks the mentioned user. They can come back with a new invite.\n\n_Only works on people whose roles are **below** yours (the server owner always can)._",
      es: "Expulsa al usuario mencionado. Puede volver con una invitación nueva.\n\n_Solo funciona con quien tiene roles **por debajo** de los tuyos (el dueño del servidor siempre puede)._",
    },
    ex: { pt: "{&kick} @fulano spam", en: "{&kick} @someone spam", es: "{&kick} @alguien spam" },
  },
};
