// &autorole — cargo automático na entrada

export default {
  id: "autorole",
  modulo: "../ferramentas/autorole.js",
  funcao: "cmdAutorole",
  subcomandos: { set: "set", off: "off", desativar: "disable", remover: "remove" },
  gerenciavel: true,
  // A página `&help autorole` (fase 3): `{&autorole.set}` vira o comando no idioma da tela.
  ajuda: {
    perm: "ManageRole",
    uso: { pt: "{&autorole} [set <@cargo>|off]", en: "{&autorole} [set <@role>|off]" },
    desc: {
      pt: "Dá um cargo automaticamente a todo novo membro que entra no servidor. `set` define o cargo, `off` desativa. Útil para dar um cargo de 'Membro' a todos automaticamente.",
      en: "Automatically gives a role to every new member who joins the server. `set` defines the role, `off` disables it. Useful for handing everyone a 'Member' role automatically.",
    },
    ex: { pt: "{&autorole.set} <@Membro>", en: "{&autorole.set} <@Member>" },
    parametros: [
      { nome: { pt: "<cargo>", en: "<role>" }, desc: { pt: "cargo entregue a quem entra (nome, menção ou ID)", en: "role handed to whoever joins (name, mention or ID)" } },
      { nome: "off", desc: { pt: "desliga", en: "turns it off" } },
    ],
  },
};
