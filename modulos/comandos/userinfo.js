// &userinfo — ID, entrada e cargos de alguém
import * as geral from "../moderacao/geral.js";

export default {
  id: "userinfo",
  funcao: () => geral.cmdUserinfo,
  gerenciavel: true,
};
