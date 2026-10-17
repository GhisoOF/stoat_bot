// &adeus — embed de despedida
import * as bemvindo from "../ferramentas/boas-vindas.js";

export default {
  id: "adeus",
  funcao: () => bemvindo.cmdAdeus,
  nomes: { en: "goodbye" },
  apelidos: ["goodbye", "despedida", "farewell"],
  gerenciavel: true,
  textoLivre: true,
};
