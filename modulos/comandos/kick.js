// &kick — expulsa alguém

export default {
  id: "kick",
  modulo: "../moderacao/punir.js",
  funcao: "cmdKick",
  es: { nome: "expulsar" },
  gerenciavel: true,
  ajuda: {
    grupo: "proteger",
    perm: "KickMembers",
    uso: { pt: "{&kick} <@pessoa|id|nome> [motivo]", en: "{&kick} <@user|id|name> [reason]", es: "{&kick} <@usuario|id|nombre> [motivo]" },
    desc: {
      pt: "Expulsa alguém. A pessoa pode voltar com um novo convite.\nRespondendo a uma mensagem, `{&kick}` sozinho expulsa o autor dela.\n\n_Só vale sobre quem tem cargo **abaixo** do seu._",
      en: "Kicks someone. They can come back with a new invite.\nReplying to a message, `{&kick}` alone kicks its author.\n\n_Only works on people whose roles are **below** yours._",
      es: "Expulsa a alguien. Puede volver con una invitación nueva.\nRespondiendo a un mensaje, `{&kick}` solo expulsa a su autor.\n\n_Solo funciona con quien tiene roles **por debajo** de los tuyos._",
    },
    ex: { pt: "{&kick} @fulano spam", en: "{&kick} @someone spam", es: "{&kick} @alguien spam" },
  },
};
