// &reactionrole — cargos por reação

export default {
  id: "reactionrole",
  modulo: "../ferramentas/reaction-roles.js",
  funcao: "cmdReactionRole",
  apelidos: ["rr", "reactionroles"],
  es: { nome: "reactionrole" },   // espanhol (etapa 4)
  subcomandos: {
    exclusivo: "exclusive", unico: "unique", add: "add", remove: "remove", list: "list",
    recarregar: "reload", reparar: "repair",
  },
  aninhados: ["exclusivo", "unico"],
  naTela: { ordem: "order" },   // o handler já aceita `order` e `reordenar`
  gerenciavel: true,
};
