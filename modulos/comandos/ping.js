// &ping — latência do bot

export default {
  id: "ping",
  modulo: "../moderacao/geral.js",
  funcao: "cmdPing",
  es: { nome: "ping" },   // espanhol (etapa 4)
  gerenciavel: true,
  ajuda: {
    uso: "{&ping}",
    desc: {
      pt: "Mostra a latência entre o envio da mensagem e o processamento do bot.",
      en: "Shows the latency between the message being sent and the bot processing it.",
      es: "Muestra la latencia entre el envío del mensaje y el procesamiento del bot.",
    },
  },
};
