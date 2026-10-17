// &debug — diagnóstico de permissões, canais e voz
import * as debugCmd from "../moderacao/debug-comando.js";

export default {
  id: "debug",
  funcao: () => debugCmd.cmdDebug,
  apelidos: ["diagnostico", "diagnóstico"],
  essencial: true,
  qualquerCanal: true,
};
