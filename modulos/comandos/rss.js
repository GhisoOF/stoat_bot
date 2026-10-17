// &rss — notícias por RSS
import * as rss from "../ferramentas/rss.js";

export default {
  id: "rss",
  funcao: () => rss.cmdRss,
  apelidos: ["feed"],
  gerenciavel: true,
  textoLivre: true,
};
