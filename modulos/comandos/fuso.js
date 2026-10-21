// &fuso — relógio com vários fusos

export default {
  id: "fuso",
  modulo: "../ferramentas/fuso.js",
  funcao: "cmdFuso",
  nomes: { en: "timezone" },
  apelidos: ["fusos", "hora", "timezone", "timezones", "tz", "clock"],
  es: { nome: "huso" },   // espanhol (etapa 4)
  subcomandos: {
    add: "add", remove: "remove", lista: "list", limpar: "clear", buscar: ["search", "find"],
    ver: ["now", "time", "check"], apelido: ["label", "name", "alias"],
    principal: ["main", "reference"], formato: "format", cidades: "cities",
  },
  gerenciavel: true,
  ajuda: {
    perm: { pt: "ManageMessages (só para configurar)", en: "ManageMessages (configuration only)", es: "ManageMessages (solo para configurar)" },
    uso: { pt: "{&fuso} [ver|buscar|add|remove|apelido|principal|formato|limpar]", en: "{&fuso} [now|search|add|remove|label|main|format|clear]", es: "{&fuso} [now|search|add|remove|label|main|format|clear]" },
    desc: { pt: "Relógio do servidor com **várias cidades ao mesmo tempo** — útil quando a galera está espalhada (São Paulo, Madrid, Tóquio…).\n\n`{&fuso}` mostra a hora agora em cada cidade configurada, ordenada do fuso mais atrasado ao mais adiantado, com a diferença em relação à cidade de referência.\n\n`{&fuso.ver} <cidade>` — hora de qualquer cidade, sem configurar\n`{&fuso.buscar} <termo>` — procura cidades disponíveis\n`{&fuso.add}/remove <cidade>` — monta a lista _(ManageMessages)_\n`{&fuso.apelido} <cidade> <texto>` — ex.: Madrid aparecendo como \"Europa\"\n`{&fuso.principal} <cidade>` — de quem as diferenças são contadas\n`{&fuso.formato} <12|24>`\n\n_Aceita acentos e o formato Cidade/País: `São Paulo`, `Madrid/Europa`, `Tokyo`._", en: "A server clock showing **several cities at once** — handy when people are spread out (São Paulo, Madrid, Tokyo…).\n\n`{&fuso}` shows the current time in each configured city, sorted from the earliest offset to the latest, with the difference from the reference city.\n\n`{&fuso.ver} <city>` — any city's time, no setup needed\n`{&fuso.buscar} <term>` — search available cities\n`{&fuso.add}/remove <city>` — build the list _(ManageMessages)_\n`{&fuso.apelido} <city> <text>` — e.g. Madrid showing as \"Europe\"\n`{&fuso.principal} <city>` — which city the differences count from\n`{&fuso.formato} <12|24>`\n\n_Accents and the City/Country format work: `São Paulo`, `Madrid/Europa`, `Tokyo`._", es: "Reloj del servidor con **varias ciudades a la vez** — útil cuando la gente está repartida (São Paulo, Madrid, Tokio…).\n\n`{&fuso}` muestra la hora actual en cada ciudad configurada, ordenadas del huso horario más atrasado al más adelantado, con la diferencia respecto a la ciudad de referencia.\n\n`{&fuso.ver} <ciudad>` — la hora de cualquier ciudad, sin configurar nada\n`{&fuso.buscar} <término>` — busca ciudades disponibles\n`{&fuso.add}/remove <ciudad>` — arma la lista _(ManageMessages)_\n`{&fuso.apelido} <ciudad> <texto>` — p. ej., Madrid mostrándose como \"Europa\"\n`{&fuso.principal} <ciudad>` — desde cuál se cuentan las diferencias\n`{&fuso.formato} <12|24>`\n\n_Acepta tildes y el formato Ciudad/País: `São Paulo`, `Madrid/Europa`, `Tokyo`._" },
    ex: { pt: "{&fuso.add} São Paulo", en: "{&fuso.add} Madrid", es: "{&fuso.add} São Paulo" },
    parametros: [
      { nome: { pt: "(nada) | lista", en: "(nothing) | list", es: "(nada) | list" }, desc: { pt: "a hora em todas as cidades configuradas", en: "the time in every configured city", es: "la hora en todas las ciudades configuradas" } },
      { nome: "add", valor: { pt: "<cidade>", en: "<city>", es: "<ciudad>" }, desc: { pt: "aceita nome, `Cidade/País` e apelidos (`sp`, `toquio`)", en: "accepts a name, `City/Country` and nicknames (`sp`, `tokyo`)", es: "acepta el nombre, `Ciudad/País` y apodos (`sp`, `tokyo`)" } },
      { nome: "remove", valor: { pt: "<cidade>", en: "<city>", es: "<ciudad>" }, desc: { pt: "tira da lista", en: "removes from the list", es: "la quita de la lista" } },
      { nome: { pt: "ver", en: "now", es: "now" }, valor: { pt: "<cidade>", en: "<city>", es: "<ciudad>" }, desc: { pt: "a hora de uma cidade sem adicioná-la", en: "one city's time without adding it", es: "la hora de una ciudad sin añadirla" } },
      { nome: { pt: "buscar", en: "search", es: "search" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" }, desc: { pt: "encontra o nome certo", en: "finds the right name", es: "encuentra el nombre correcto" } },
      { nome: { pt: "apelido", en: "label", es: "label" }, valor: { pt: "<cidade> <nome>", en: "<city> <name>", es: "<ciudad> <nombre>" }, desc: { pt: "como a cidade aparece (\"Casa\", \"Escritório\")", en: "how the city is labelled (\"Home\", \"Office\")", es: "cómo aparece la ciudad (\"Casa\", \"Oficina\")" } },
      { nome: { pt: "principal", en: "main", es: "main" }, valor: { pt: "<cidade>", en: "<city>", es: "<ciudad>" }, desc: { pt: "a referência de onde se conta a diferença", en: "the reference the difference is counted from", es: "la referencia desde la que se cuenta la diferencia" } },
      { nome: { pt: "formato", en: "format", es: "format" }, valor: "12 | 24", desc: { pt: "formato da hora", en: "time format", es: "formato de la hora" } },
    ],
  },
};
