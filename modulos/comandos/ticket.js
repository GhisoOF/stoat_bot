// &ticket — tickets de suporte

export default {
  id: "ticket",
  modulo: "../ferramentas/tickets.js",
  funcao: "cmdTicket",
  apelidos: ["tickets", "suporte"],
  subcomandos: {
    painel: "panel", lista: "list", apagar: "delete", categorias: "categories", equipe: "team",
  },
  naTela: { abrir: "open", fechar: "close" },
  gerenciavel: true,
};
