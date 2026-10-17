// &servidores — painel do dono do bot (relatório horário, servidores +18) — fora do &help
import * as servidoresCmd from "../moderacao/servidores.js";

export default {
  id: "servidores",
  funcao: () => servidoresCmd.cmdServidores,
  nomes: { en: "servers" },
  apelidos: ["servers"],
};
