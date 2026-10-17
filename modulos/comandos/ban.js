// &ban — bane alguém

export default {
  id: "ban",
  modulo: "../moderacao/geral.js",
  funcao: "cmdBan",
  gerenciavel: true,
  ajuda: {
    perm: "BanMembers",
    uso: { pt: "{&ban} @usuário [motivo]", en: "{&ban} @user [reason]" },
    desc: {
      pt: "Bane permanentemente o usuário mencionado.\n\n_Só vale sobre quem tem cargo **abaixo** do seu (o dono do servidor passa sempre)._",
      en: "Permanently bans the mentioned user.\n\n_Only works on people whose roles are **below** yours (the server owner always can)._",
    },
    ex: { pt: "{&ban} @fulano divulgação", en: "{&ban} @someone advertising" },
  },
};
