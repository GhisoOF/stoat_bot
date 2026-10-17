// &tutorial — guia em páginas (permissões, canais, proteção…)
import * as tutorial from "../moderacao/tutorial.js";

export default {
  id: "tutorial",
  funcao: () => tutorial.cmdTutorial,
  nomes: { en: "tutorial" },
  apelidos: ["guia", "comecar", "inicio", "guide", "start"],
  gerenciavel: true,
  qualquerCanal: true,
};
