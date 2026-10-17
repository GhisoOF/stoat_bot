// &limpar — apaga mensagens em lote
import * as limpar from "../moderacao/limpar.js";

export default {
  id: "limpar",
  funcao: () => limpar.cmdLimpar,
  nomes: { en: "purge" },
  apelidos: ["clear", "purge", "limpiar"],
  gerenciavel: true,
};
