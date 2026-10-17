// &autorole — cargo automático na entrada
import * as autorole from "../ferramentas/autorole.js";

export default {
  id: "autorole",
  funcao: () => autorole.cmdAutorole,
  gerenciavel: true,
};
