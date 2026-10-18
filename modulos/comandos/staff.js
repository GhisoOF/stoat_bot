// &staff — a equipe do servidor (mesma lista de cargos do &acesso)

export default {
  id: "staff",
  modulo: "../moderacao/staff.js",
  funcao: "cmdStaff",
  nomes: { en: "staff" },
  apelidos: ["equipe", "team"],
  es: { nome: "staff" },   // espanhol (etapa 4)
  subcomandos: {
    add: "add", remove: "remove", lista: "list", limpar: "clear", titulo: ["title", "label"],
    equipe: "team",
  },
  gerenciavel: true,
};
