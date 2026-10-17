// &game — o RPG
import * as rpg from "../game/game.js";

export default {
  id: "game",
  funcao: () => rpg.cmdGame,
  nomes: { en: "game" },
  apelidos: ["rpg", "personagem", "character"],
  gerenciavel: true,
};
