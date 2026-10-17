// &log — canal e eventos do registro de moderação

export default {
  id: "log",
  modulo: "../core/log.js",
  funcao: "cmdLog",
  nomes: { en: "log" },
  apelidos: ["logs"],
  subcomandos: {
    here: "here", off: "off", canal: "channel", punicoes: "punishments", membros: "members",
    mensagens: "messages", cargos: "roles", comandos: "commands", eventos: "events",
  },
  naTela: { aqui: "here" },
  gerenciavel: true,
};
