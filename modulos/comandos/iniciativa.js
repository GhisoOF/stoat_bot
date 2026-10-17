// &iniciativa — ordem de combate de RPG de mesa
import * as dadosRpg from "../ferramentas/dados-rpg.js";

export default {
  id: "iniciativa",
  funcao: () => dadosRpg.cmdIniciativa,
  apelidos: ["init", "initiative"],
  gerenciavel: true,
};
