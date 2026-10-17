// &ping — latência do bot
import * as geral from "../moderacao/geral.js";

export default {
  id: "ping",
  funcao: () => geral.cmdPing,
  gerenciavel: true,
};
