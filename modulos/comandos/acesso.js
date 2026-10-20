// &acesso — quem usa os comandos de moderação e onde

export default {
  id: "acesso",
  modulo: "../moderacao/acesso.js",
  funcao: "cmdAcesso",
  nomes: { en: "access" },
  apelidos: ["access"],
  es: { nome: "acceso", subcomandos: { livre: "libre" } },   // espanhol (etapa 4)
  subcomandos: {
    cargo: "role", cargos: "roles", staff: "staff", canal: "channel", canais: "channels",
    todos: "all", somente: "only", exceto: "except", add: "add", remove: "remove",
    limpar: "clear", staffignora: ["staffignores", "staffbypass"], status: "status",
    livre: "free",   // um comando que vale fora dos canais designados (P7, 20 out 2026)
  },
  aninhados: ["cargo", "cargos", "staff", "canal", "canais"],
  gerenciavel: true,
  qualquerCanal: true,
};
