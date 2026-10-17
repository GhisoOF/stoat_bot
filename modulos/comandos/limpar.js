// &limpar — apaga mensagens em lote

export default {
  id: "limpar",
  modulo: "../moderacao/limpar.js",
  funcao: "cmdLimpar",
  nomes: { en: "purge" },
  apelidos: ["clear", "purge", "limpiar"],
  subcomandos: { tudo: ["all", "everything"] },
  naTela: { confirmar: "confirm" },
  gerenciavel: true,
};
