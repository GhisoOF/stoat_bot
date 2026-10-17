// &ping — latência do bot

export default {
  id: "ping",
  modulo: "../moderacao/geral.js",
  funcao: "cmdPing",
  gerenciavel: true,
  ajuda: {
    uso: "{&ping}",
    desc: {
      pt: "Mostra a latência entre o envio da mensagem e o processamento do bot.",
      en: "Shows the latency between the message being sent and the bot processing it.",
    },
  },
};
