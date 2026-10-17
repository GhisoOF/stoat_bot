// &xp — níveis por mensagem
import * as nivel from "../ferramentas/nivel.js";

export default {
  id: "xp",
  funcao: () => nivel.cmdXp,
  nomes: { en: "xp" },
  apelidos: ["nivel", "level", "levels"],
  gerenciavel: true,
};
