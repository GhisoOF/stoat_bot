// &assistente — configuração guiada, por perguntas
import * as assistente from "../moderacao/assistente.js";

export default {
  id: "assistente",
  funcao: () => assistente.cmdAssistente,
  nomes: { en: "wizard" },
  apelidos: ["wizard", "assistant", "setup", "configure", "configurar"],
  gerenciavel: true,
  qualquerCanal: true,
};
