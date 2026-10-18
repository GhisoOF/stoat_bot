// &ban — bane alguém

export default {
  id: "ban",
  modulo: "../moderacao/geral.js",
  funcao: "cmdBan",
  es: { nome: "ban" },   // espanhol (etapa 4)
  gerenciavel: true,
  ajuda: {
    perm: "BanMembers",
    uso: { pt: "{&ban} @usuário [motivo]", en: "{&ban} @user [reason]", es: "{&ban} @usuario [motivo]" },
    desc: {
      pt: "Bane permanentemente o usuário mencionado.\n\n_Só vale sobre quem tem cargo **abaixo** do seu (o dono do servidor passa sempre)._",
      en: "Permanently bans the mentioned user.\n\n_Only works on people whose roles are **below** yours (the server owner always can)._",
      es: "Banea de forma permanente al usuario mencionado.\n\n_Solo funciona con quien tiene roles **por debajo** de los tuyos (el dueño del servidor siempre puede)._",
    },
    ex: { pt: "{&ban} @fulano divulgação", en: "{&ban} @someone advertising", es: "{&ban} @alguien publicidad" },
  },
};
