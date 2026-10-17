// &iniciativa — ordem de combate de RPG de mesa

export default {
  id: "iniciativa",
  modulo: "../ferramentas/dados-rpg.js",
  funcao: "cmdIniciativa",
  apelidos: ["init", "initiative"],
  subcomandos: { lista: "list", remover: "remove", limpar: "clear" },
  gerenciavel: true,
};
