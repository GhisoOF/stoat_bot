// &rolar — dados de RPG de mesa

export default {
  id: "rolar",
  modulo: "../ferramentas/dados-rpg.js",
  funcao: "cmdRolar",
  apelidos: ["r", "roll", "dado", "dados"],
  subcomandos: { moeda: "coin" },
  gerenciavel: true,
  textoLivre: true,
};
