// &rolar — dados de RPG de mesa
import * as dadosRpg from "../ferramentas/dados-rpg.js";

export default {
  id: "rolar",
  funcao: () => dadosRpg.cmdRolar,
  apelidos: ["r", "roll", "dado", "dados"],
  gerenciavel: true,
  textoLivre: true,
};
