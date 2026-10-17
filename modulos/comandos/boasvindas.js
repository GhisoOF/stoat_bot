// &boasvindas — embed de boas-vindas
import * as bemvindo from "../ferramentas/boas-vindas.js";

export default {
  id: "boasvindas",
  funcao: () => bemvindo.cmdBoasVindas,
  nomes: { en: "welcome" },
  apelidos: ["boas-vindas", "welcome", "greeting", "bemvindo"],
  gerenciavel: true,
  textoLivre: true,
};
