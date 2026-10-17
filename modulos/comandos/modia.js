// &modia — moderação por IA
import * as modiaCmd from "../moderacao/modia-comando.js";

export default {
  id: "modia",
  funcao: () => modiaCmd.cmdModIA,
  apelidos: ["moderacaoia"],
  soIA: true,
  textoLivre: true,
};
