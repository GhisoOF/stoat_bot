// &entretenimento — ship, briga, cowsay, bola8…

export default {
  id: "entretenimento",
  modulo: "../ferramentas/entretenimento.js",
  funcao: "cmdEntretenimento",
  nomes: { en: "entertainment" },
  apelidos: ["entertainment", "fun", "ent", "entreterimento"],
  subcomandos: {
    briga: "fight", escolher: ["choose", "pick"], nota: "rate", sorte: "fortune", zoeira: "mock",
    inverter: "reverse", bola8: "8ball",
  },
  gerenciavel: true,
  textoLivre: true,
};
