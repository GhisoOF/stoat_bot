// &ban — bane alguém (e alimenta a lista global)

export default {
  id: "ban",
  modulo: "../moderacao/punir.js",
  funcao: "cmdBan",
  es: { nome: "ban" },
  gerenciavel: true,
  ajuda: {
    grupo: "proteger",
    perm: "BanMembers",
    uso: { pt: "{&ban} <@pessoa|id|nome> [motivo]", en: "{&ban} <@user|id|name> [reason]", es: "{&ban} <@usuario|id|nombre> [motivo]" },
    desc: {
      pt: "Bane alguém (vale o ID de quem já saiu). O ban entra na lista global.\nRespondendo a uma mensagem, `{&ban}` sozinho bane o autor dela.\nDesfazer: `{&unban}` ou ↩️ na mensagem do ban.\n\n_Só vale sobre quem tem cargo **abaixo** do seu._",
      en: "Bans someone (the ID of someone who already left works). The ban goes on the global list.\nReplying to a message, `{&ban}` alone bans its author.\nUndo: `{&unban}` or ↩️ on the ban message.\n\n_Only works on people whose roles are **below** yours._",
      es: "Banea a alguien (vale el ID de quien ya salió). El ban entra en la lista global.\nRespondiendo a un mensaje, `{&ban}` solo banea a su autor.\nDeshacer: `{&unban}` o ↩️ en el mensaje del ban.\n\n_Solo funciona con quien tiene roles **por debajo** de los tuyos._",
    },
    ex: { pt: "{&ban} @fulano divulgação", en: "{&ban} @someone advertising", es: "{&ban} @alguien publicidad" },
  },
};
