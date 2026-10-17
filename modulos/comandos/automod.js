// &automod — os filtros automáticos: antispam, antiruido, antilink, sentinela
import * as automodCmd from "../moderacao/automod-comandos.js";

export default {
  id: "automod",
  funcao: () => automodCmd.cmdAutomod,
  gerenciavel: true,
  // nomes que o texto antigo ainda cita sozinhos (`&punicao`); a fase 2 os leva para os subcomandos
  partes: { punicao: { en: "punishment" }, sentinela: { en: "sentinel" } },
  textoLivre: true,
};
