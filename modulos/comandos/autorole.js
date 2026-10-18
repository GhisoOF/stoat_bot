// &autorole — cargo automático na entrada

export default {
  id: "autorole",
  modulo: "../ferramentas/autorole.js",
  funcao: "cmdAutorole",
  es: { nome: "autorol", subcomandos: { set: "definir", desativar: "desactivar", remover: "quitar", off: "off" } },   // espanhol (etapa 4)
  subcomandos: { set: "set", off: "off", desativar: "disable", remover: "remove" },
  gerenciavel: true,
  // A página `&help autorole` (fase 3): `{&autorole.set}` vira o comando no idioma da tela.
  ajuda: {
    perm: "ManageRole",
    uso: { pt: "{&autorole} [set <@cargo>|off]", en: "{&autorole} [set <@role>|off]", es: "{&autorole} [definir <@rol>|off]" },
    desc: {
      pt: "Dá um cargo automaticamente a todo novo membro que entra no servidor. `set` define o cargo, `off` desativa. Útil para dar um cargo de 'Membro' a todos automaticamente.",
      en: "Automatically gives a role to every new member who joins the server. `set` defines the role, `off` disables it. Useful for handing everyone a 'Member' role automatically.",
      es: "Le da un rol automáticamente a cada miembro nuevo que entra al servidor. `definir` elige el rol, `off` lo desactiva. Útil para darles a todos un rol de 'Miembro' automáticamente.",
    },
    ex: { pt: "{&autorole.set} <@Membro>", en: "{&autorole.set} <@Member>", es: "{&autorole.set} <@Miembro>" },
    parametros: [
      { nome: { pt: "<cargo>", en: "<role>", es: "<rol>" },
        desc: { pt: "cargo entregue a quem entra (nome, menção ou ID)", en: "role handed to whoever joins (name, mention or ID)", es: "el rol que recibe quien entra (nombre, mención o ID)" } },
      { nome: "off", desc: { pt: "desliga", en: "turns it off", es: "lo apaga" } },
    ],
  },
};
