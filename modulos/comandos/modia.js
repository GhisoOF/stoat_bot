// &modia — moderação por IA

export default {
  id: "modia",
  modulo: "../moderacao/modia-comando.js",
  funcao: "cmdModIA",
  apelidos: ["moderacaoia"],
  subcomandos: {
    criterios: "criteria", canal: "channel", limpar: "clear", status: "status", add: "add",
    remove: "remove",
  },
  aninhados: ["canal", "criterios"],
  soIA: true,
  textoLivre: true,
};
