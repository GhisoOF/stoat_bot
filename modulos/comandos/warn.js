// &warn — avisos manuais (lista, limpar)

export default {
  id: "warn",
  modulo: "../moderacao/warn.js",
  funcao: "cmdWarn",
  nomes: { en: "warn" },
  apelidos: ["avisar"],
  subcomandos: { lista: "list", limpar: "clear" },
  naTela: { acumular: "stack" },
  gerenciavel: true,
};
