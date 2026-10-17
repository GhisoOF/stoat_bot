// &reset — configuração de fábrica do servidor (dono do servidor e dono do bot)
import * as resetMod from "../moderacao/reset.js";

export default {
  id: "reset",
  funcao: () => resetMod.cmdReset,
  apelidos: ["resetar", "redefinir", "factoryreset", "fabrica"],
};
