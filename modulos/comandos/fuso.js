// &fuso — relógio com vários fusos

export default {
  id: "fuso",
  modulo: "../ferramentas/fuso.js",
  funcao: "cmdFuso",
  nomes: { en: "timezone" },
  apelidos: ["fusos", "hora", "timezone", "timezones", "tz", "clock"],
  subcomandos: {
    add: "add", remove: "remove", lista: "list", limpar: "clear", buscar: ["search", "find"],
    ver: ["now", "time", "check"], apelido: ["label", "name", "alias"],
    principal: ["main", "reference"], formato: "format", cidades: "cities",
  },
  gerenciavel: true,
};
