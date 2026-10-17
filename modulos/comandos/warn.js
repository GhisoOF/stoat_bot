// &warn — avisos manuais (lista, limpar)
import * as warnMod from "../moderacao/warn.js";

export default {
  id: "warn",
  funcao: () => warnMod.cmdWarn,
  nomes: { en: "warn" },
  apelidos: ["avisar"],
  gerenciavel: true,
};
