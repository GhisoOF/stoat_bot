// &embed — publica um embed montado pela staff
import * as embedCmd from "../moderacao/embed.js";

export default {
  id: "embed",
  funcao: () => embedCmd.cmdEmbed,
  gerenciavel: true,
  textoLivre: true,
};
