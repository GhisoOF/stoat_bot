// &config — panorama de tudo que está configurado
import * as cfgCmd from "../moderacao/config-comando.js";

export default {
  id: "config",
  funcao: () => cfgCmd.cmdConfig,
  apelidos: ["configuracoes", "configurações"],
};
