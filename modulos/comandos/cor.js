// &cor — cores e gradientes de cargo, painel de cores
import * as corCargo from "../moderacao/cor-cargo.js";

export default {
  id: "cor",
  funcao: () => corCargo.cmdCor,
  nomes: { en: "color" },
  apelidos: ["cores", "cargocor", "color", "colour"],
  gerenciavel: true,
};
