// &ban — bane alguém
import * as geral from "../moderacao/geral.js";

export default {
  id: "ban",
  funcao: () => geral.cmdBan,
  gerenciavel: true,
};
