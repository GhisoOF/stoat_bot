// &comando — liga e desliga comandos neste servidor
import * as admin from "../moderacao/comandos-admin.js";

export default {
  id: "comando",
  funcao: () => admin.cmdComando,
  nomes: { en: "command" },
  apelidos: ["command", "comandos"],
  essencial: true,
};
