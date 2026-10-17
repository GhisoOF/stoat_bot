// &personalidade — a persona da IA neste servidor
import * as persona from "../ai/persona.js";

export default {
  id: "personalidade",
  funcao: () => persona.cmdPersonalidade,
  apelidos: ["personality"],
  textoLivre: true,
};
