// &kick — expulsa alguém
import * as geral from "../moderacao/geral.js";

export default {
  id: "kick",
  funcao: () => geral.cmdKick,
  gerenciavel: true,
};
