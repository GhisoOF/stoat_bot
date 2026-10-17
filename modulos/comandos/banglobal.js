// &banglobal — ban global entre os servidores da Judy
import * as banGlobal from "../moderacao/ban-global.js";

export default {
  id: "banglobal",
  funcao: () => banGlobal.cmdBanGlobal,
  nomes: { en: "globalban" },
  apelidos: ["globalban"],
  gerenciavel: true,
};
