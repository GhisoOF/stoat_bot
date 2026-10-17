// &log — canal e eventos do registro de moderação
import * as log from "../core/log.js";

export default {
  id: "log",
  funcao: () => log.cmdLog,
  nomes: { en: "log" },
  apelidos: ["logs"],
  gerenciavel: true,
};
