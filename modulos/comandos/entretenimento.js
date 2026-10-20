// &entretenimento — ship, briga, cowsay, bola8… e os jogos (campo minado, velha)

export default {
  id: "entretenimento",
  modulo: "../ferramentas/entretenimento.js",
  funcao: "cmdEntretenimento",
  nomes: { en: "entertainment" },
  apelidos: ["entertainment", "fun", "ent", "entreterimento"],
  es: { nome: "entretenimiento", subcomandos: { campominado: "buscaminas", velha: "tateti" } },   // espanhol (etapa 4)
  subcomandos: {
    briga: "fight", escolher: ["choose", "pick"], nota: "rate", sorte: "fortune", zoeira: "mock",
    inverter: "reverse", bola8: "8ball",
    campominado: "minesweeper", velha: "tictactoe",   // os jogos (P7, 20 out 2026)
  },
  gerenciavel: true,
  textoLivre: true,
};
