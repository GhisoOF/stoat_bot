// &servidor — regras, cargos, canais e FAQ do servidor
import * as servidorInfo from "../ferramentas/servidor-info.js";

export default {
  id: "servidor",
  funcao: () => servidorInfo.cmdServidor,
  nomes: { en: "server" },
  apelidos: ["server", "serverinfo", "servidorinfo"],
  gerenciavel: true,
  textoLivre: true,
};
