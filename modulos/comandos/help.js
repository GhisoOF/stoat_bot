// &help — a ajuda: índice, grupos, página de cada comando e a árvore de subtópicos
import * as geral from "../moderacao/geral.js";

export default {
  id: "help",
  funcao: () => geral.cmdHelp,
  essencial: true,
  qualquerCanal: true,
};
