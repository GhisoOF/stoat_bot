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
  ajuda: {
    perm: "ManagePermissions",
    uso: {
      pt: "{&log} [here | <idDoCanal> | off | <evento> <on|off>]",
      en: "{&log} [here | <channelId> | off | <event> <on|off>]",
    },
    desc: {
      pt: "Chat de logs do servidor. `here` usa o canal atual; `<idDoCanal>` define por ID; `off` desativa. Eventos: `punicoes`, `membros`, `mensagens`, `cargos`, `comandos` — cada um pode ser ligado/desligado. O log sai no idioma do servidor (`{&idioma}`).",
      en: "The server's log channel. `here` uses the current channel; `<channelId>` sets it by ID; `off` disables it. Events: `punishments`, `members`, `messages`, `roles`, `commands` — each can be toggled. The log follows the server's language (`{&idioma}`).",
    },
    ex: "{&log.here}",
    parametros: [
      { nome: { pt: "canal", en: "channel" }, valor: { pt: "<#canal|aqui|id>", en: "<#channel|here|id>" },
        desc: { pt: "onde o bot escreve o que aconteceu (um canal que só a staff vê)", en: "where the bot writes down what happened (a staff-only channel)" } },
      { nome: "off", desc: { pt: "desliga o registro", en: "turns logging off" } },
      { nome: { pt: "<evento> on|off", en: "<event> on|off" },
        desc: { pt: "`punicoes` · `membros` (entrou/saiu) · `mensagens` (apagadas/editadas) · `cargos` · `comandos` (barulhento, começa desligado)", en: "`punishments` · `members` (joined/left) · `messages` (deleted/edited) · `roles` · `commands` (noisy, starts off)" } },
    ],
  },
};
