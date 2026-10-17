// &sobre — informações sobre o bot (créditos, números, links)
import * as geral from "../moderacao/geral.js";

export default {
  id: "sobre",
  funcao: () => geral.cmdSobre,
  nomes: { en: "about" },
  apelidos: ["info", "about"],
};
