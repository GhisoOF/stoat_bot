// &log — canal e eventos do registro de moderação

export default {
  id: "log",
  modulo: "../core/log.js",
  funcao: "cmdLog",
  nomes: { en: "log" },
  apelidos: ["logs"],
  es: { nome: "log", subcomandos: { here: "aqui", canal: "canal", punicoes: "sanciones", membros: "miembros", mensagens: "mensajes", cargos: "roles", comandos: "comandos", off: "off", eventos: "eventos", relatorio: "informe", atualizacoes: "actualizaciones" } },   // espanhol (etapa 4)
  subcomandos: {
    here: "here", off: "off", canal: "channel", punicoes: "punishments", membros: "members",
    mensagens: "messages", cargos: "roles", comandos: "commands", eventos: "events",
    relatorio: "report",   // P4: relatório anônimo de ataques ao dono da Judy
    atualizacoes: "updates",   // P5: as novidades da Judy a cada pacote novo
  },
  naTela: { aqui: "here" },
  gerenciavel: true,
  ajuda: {
    perm: "ManagePermissions",
    uso: {
      pt: "{&log} [here | <idDoCanal> | off | <evento> <on|off>]",
      en: "{&log} [here | <channelId> | off | <event> <on|off>]",
      es: "{&log} [aqui | <idDelCanal> | off | <evento> <on|off>]",
    },
    desc: {
      pt: "Chat de logs do servidor. `here` usa o canal atual; `<idDoCanal>` define por ID; `off` desativa. Eventos: `punicoes`, `membros`, `mensagens`, `cargos`, `comandos` — cada um pode ser ligado/desligado. O log sai no idioma do servidor (`{&idioma}`).",
      en: "The server's log channel. `here` uses the current channel; `<channelId>` sets it by ID; `off` disables it. Events: `punishments`, `members`, `messages`, `roles`, `commands` — each can be toggled. The log follows the server's language (`{&idioma}`).",
      es: "Canal de logs del servidor. `aqui` usa el canal actual; `<idDelCanal>` lo define por ID; `off` lo desactiva. Eventos: `sanciones`, `miembros`, `mensajes`, `roles`, `comandos` — cada uno se puede activar o desactivar. El log sale en el idioma del servidor (`{&idioma}`); en español, por ahora, sale en inglés.",
    },
    ex: "{&log.here}",
    parametros: [
      { nome: { pt: "canal", en: "channel", es: "canal" }, valor: { pt: "<#canal|aqui|id>", en: "<#channel|here|id>", es: "<#canal|aqui|id>" },
        desc: { pt: "onde o bot escreve o que aconteceu (um canal que só a staff vê)", en: "where the bot writes down what happened (a staff-only channel)", es: "dónde anota el bot lo que pasó (un canal que solo ve el staff)" } },
      { nome: "off", desc: { pt: "desliga o registro", en: "turns logging off", es: "apaga el registro" } },
      { nome: { pt: "relatorio on|off", en: "report on|off", es: "informe on|off" },
        desc: { pt: "manda ao dono da Judy um relatório **anônimo** de ataques (bans, raids, golpes): sem nomes, sem IDs, e o servidor vira um código. Começa desligado", en: "sends Judy's owner an **anonymous** attack report (bans, raids, scams): no names, no IDs, and the server becomes a code. Starts off", es: "envía al dueño de Judy un informe **anónimo** de ataques (bans, raids, estafas): sin nombres, sin IDs, y el servidor se vuelve un código. Empieza desactivado" } },
      { nome: { pt: "<evento> on|off", en: "<event> on|off", es: "<evento> on|off" },
        desc: { pt: "`punicoes` · `membros` (entrou/saiu) · `mensagens` (apagadas/editadas) · `cargos` · `comandos` (barulhento, começa desligado) · `atualizacoes` (as novidades da Judy a cada atualização, começa desligado)", en: "`punishments` · `members` (joined/left) · `messages` (deleted/edited) · `roles` · `commands` (noisy, starts off) · `updates` (Judy's news on every update, starts off)", es: "`sanciones` · `miembros` (entradas/salidas) · `mensajes` (borrados/editados) · `roles` · `comandos` (ruidoso, empieza apagado) · `actualizaciones` (las novedades de Judy en cada actualización, empieza apagado)" } },
    ],
  },
};
