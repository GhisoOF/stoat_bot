// &silenciar — silêncio manual (timeout nativo do Stoat)
import * as silenciarMod from "../moderacao/silenciar.js";

export default {
  id: "silenciar",
  funcao: () => silenciarMod.cmdSilenciar,
  nomes: { en: "silence" },
  apelidos: ["silence", "mute", "timeout", "silencio"],
  gerenciavel: true,
};
