// &autorole — cargo automático na entrada

export default {
  id: "autorole",
  modulo: "../ferramentas/autorole.js",
  funcao: "cmdAutorole",
  subcomandos: { set: "set", off: "off", desativar: "disable", remover: "remove" },
  gerenciavel: true,
};
