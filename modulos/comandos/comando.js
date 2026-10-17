// &comando — liga e desliga comandos neste servidor

export default {
  id: "comando",
  modulo: "../moderacao/comandos-admin.js",
  funcao: "cmdComando",
  nomes: { en: "command" },
  apelidos: ["command", "comandos"],
  subcomandos: {
    desativar: ["disable", "off"], ativar: ["enable", "on"], list: "list", gerenciar: "manage",
  },
  essencial: true,
  ajuda: {
    perm: "ManagePermissions",
    uso: { pt: "{&comando} [disable|enable <nome>]", en: "{&comando} [disable|enable <name>]" },
    desc: {
      pt: "Ativa ou desativa comandos do bot neste servidor. `{&comando}` sozinho lista o estado de cada um. Ex.: `{&comando.desativar} ban`. Os comandos `help` e `comando` não podem ser desativados.\n\n_Aceita as duas línguas: `desativar`/`disable`, `ativar`/`enable`._",
      en: "Enables or disables bot commands on this server. `{&comando}` alone lists each one's state. E.g.: `{&comando.desativar} ban`. The `help` and `command` commands can't be disabled.",
    },
    ex: "{&comando.desativar} repete",
    parametros: [
      { nome: { pt: "<nome> on|off", en: "<name> on|off" },
        desc: { pt: "liga/desliga um comando neste servidor (todos os apelidos dele juntos)", en: "toggles a command on this server (all its aliases together)" } },
      { nome: "list", desc: { pt: "o que está desligado", en: "what's off" } },
      { nome: { pt: "Essenciais", en: "Essentials" },
        desc: { pt: "`help`, `comando`, `debug` e `idioma` nunca desligam — senão o admin se tranca fora", en: "`help`, `command`, `debug` and `language` never turn off — otherwise the admin locks themselves out" } },
    ],
  },
};
