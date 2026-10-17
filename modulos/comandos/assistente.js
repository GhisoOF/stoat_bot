// &assistente — configuração guiada, por perguntas

export default {
  id: "assistente",
  modulo: "../moderacao/assistente.js",
  funcao: "cmdAssistente",
  nomes: { en: "wizard" },
  apelidos: ["wizard", "assistant", "setup", "configure", "configurar"],
  subcomandos: {
    rapido: ["quick", "fast"], completo: ["full", "complete"], canais: "channels",
    protecao: ["protection", "protect"], cancelar: ["cancel", "stop"],
  },
  gerenciavel: true,
  qualquerCanal: true,
};
