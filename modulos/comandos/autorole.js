// &autorole — cargo automático na entrada

export default {
  id: "autorole",
  modulo: "../ferramentas/autorole.js",
  funcao: "cmdAutorole",
  es: { nome: "autorol", subcomandos: { set: "definir", desativar: "desactivar", remover: "quitar", off: "off" } },
  // `set` (o nome antigo) continua valendo: `&autorole set @cargo` = `&autorole @cargo`
  subcomandos: { set: "set", off: "off", desativar: "disable", remover: "remove" },
  gerenciavel: true,
  ajuda: {
    grupo: "personalizar",
    perm: "ManageRole",
    uso: { pt: "{&autorole} [@cargo | off]", en: "{&autorole} [@role | off]", es: "{&autorole} [@rol | off]" },
    desc: {
      pt: "Todo membro novo recebe esse cargo ao entrar. Sem nada, mostra o cargo de hoje; `off` desliga. O cargo: menção, nome ou ID (abaixo do seu).",
      en: "Every new member gets this role on joining. With nothing, shows today's role; `off` turns it off. The role: mention, name or ID (below yours).",
      es: "Todo miembro nuevo recibe este rol al entrar. Sin nada, muestra el rol actual; `off` lo desactiva. El rol: mención, nombre o ID (por debajo del tuyo).",
    },
    ex: { pt: "{&autorole} @Membro", en: "{&autorole} @Member", es: "{&autorole} @Miembro" },
  },
};
