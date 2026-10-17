// &comando — liga e desliga comandos neste servidor

export default {
  id: "comando",
  modulo: "../moderacao/comandos-admin.js",
  funcao: "cmdComando",
  nomes: { en: "command" },
  apelidos: ["command", "comandos"],
  subcomandos: {
    desativar: ["disable", "off"], ativar: ["enable", "on"], list: "list", gerenciar: "manage",
  },
  essencial: true,
};
