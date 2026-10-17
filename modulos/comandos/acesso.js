// &acesso — quem usa os comandos de moderação e onde

export default {
  id: "acesso",
  modulo: "../moderacao/acesso.js",
  funcao: "cmdAcesso",
  nomes: { en: "access" },
  apelidos: ["access"],
  subcomandos: {
    cargo: "role", cargos: "roles", staff: "staff", canal: "channel", canais: "channels",
    todos: "all", somente: "only", exceto: "except", add: "add", remove: "remove",
    limpar: "clear", staffignora: ["staffignores", "staffbypass"], status: "status",
  },
  aninhados: ["cargo", "cargos", "staff", "canal", "canais"],
  gerenciavel: true,
  qualquerCanal: true,
};
