// &comando — liga e desliga comandos neste servidor

export default {
  id: "comando",
  modulo: "../moderacao/comandos-admin.js",
  funcao: "cmdComando",
  nomes: { en: "command" },
  apelidos: ["command", "comandos"],
  es: { nome: "comando", subcomandos: { desativar: "desactivar", ativar: "activar", list: "lista", gerenciar: "gestionar" } },   // espanhol (etapa 4)
  subcomandos: {
    desativar: ["disable", "off"], ativar: ["enable", "on"], list: "list", gerenciar: "manage",
  },
  essencial: true,
  ajuda: {
    perm: "ManagePermissions",
    uso: { pt: "{&comando} [desativar|ativar <nome>]", en: "{&comando} [disable|enable <name>]", es: "{&comando} [desactivar|activar <nombre>]" },
    desc: {
      pt: "Ativa ou desativa comandos do bot neste servidor. `{&comando}` sozinho lista o estado de cada um. Ex.: `{&comando.desativar} ban`. Os comandos `help` e `comando` não podem ser desativados.\n\n_Aceita as duas línguas: `desativar`/`disable`, `ativar`/`enable`._",
      en: "Enables or disables bot commands on this server. `{&comando}` alone lists each one's state. E.g.: `{&comando.desativar} ban`. The `help` and `command` commands can't be disabled.",
      es: "Activa o desactiva comandos del bot en este servidor. `{&comando}` solo lista el estado de cada uno. Ej.: `{&comando.desativar} ban`. Los comandos `ayuda` y `comando` no se pueden desactivar.",
    },
    ex: { pt: "{&comando.desativar} repete", en: "{&comando.desativar} repete", es: "{&comando.desativar} repetir" },
    parametros: [
      { nome: { pt: "<nome> on|off", en: "<name> on|off", es: "<nombre> on|off" },
        desc: { pt: "liga/desliga um comando neste servidor (todos os apelidos dele juntos)", en: "toggles a command on this server (all its aliases together)", es: "activa o desactiva un comando en este servidor (todos sus alias juntos)" } },
      { nome: { pt: "list", en: "list", es: "lista" }, desc: { pt: "o que está desligado", en: "what's off", es: "lo que está desactivado" } },
      { nome: { pt: "Essenciais", en: "Essentials", es: "Esenciales" },
        desc: { pt: "`help`, `comando`, `debug` e `idioma` nunca desligam — senão o admin se tranca fora", en: "`help`, `command`, `debug` and `language` never turn off — otherwise the admin locks themselves out", es: "`ayuda`, `comando`, `debug` e `idioma` nunca se desactivan — si no, el admin se quedaría afuera" } },
    ],
  },
};
