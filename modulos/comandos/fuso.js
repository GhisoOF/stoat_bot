// &fuso — conversor de horário (timestamp) e relógio
//
// P2 (31 out 2026): `&fuso 21:30 [cidade]` dá o timestamp (cada pessoa vê no próprio
// fuso). Os subcomandos antigos (`ver`, `buscar`, `apelido`, `principal`, `formato`,
// `limpar`) continuam funcionando, fora da ajuda.

export default {
  id: "fuso",
  modulo: "../ferramentas/fuso.js",
  funcao: "cmdFuso",
  nomes: { en: "timezone" },
  apelidos: ["fusos", "hora", "timezone", "timezones", "tz", "clock"],
  es: { nome: "huso", subcomandos: { lista: "lista", limpar: "limpiar", buscar: "buscar", ver: "ver", apelido: "apodo", principal: "principal", formato: "formato", cidades: "ciudades" } },   // espanhol (etapa 4)
  subcomandos: {
    add: "add", remove: "remove", lista: "list", limpar: "clear", buscar: ["search", "find"],
    ver: ["now", "time", "check"], apelido: ["label", "name", "alias"],
    principal: ["main", "reference"], formato: "format", cidades: "cities",
  },
  gerenciavel: true,
  ajuda: {
    grupo: "personalizar",
    perm: { pt: "todo mundo (a lista: ManageMessages)", en: "everyone (the list: ManageMessages)", es: "todos (la lista: ManageMessages)" },
    uso: { pt: "{&fuso} [hora] [cidade] | add|remove <cidade>", en: "{&fuso} [time] [city] | add|remove <city>", es: "{&fuso} [hora] [ciudad] | add|remove <ciudad>" },
    desc: {
      pt: "Converte um horário em **timestamp**: cada pessoa vê a hora no próprio fuso.\n\n`{&fuso} 21:30` — 21:30 no fuso do servidor · `{&fuso} 21:30 Madrid` — 21:30 em Madrid\n`{&fuso} Tokyo` — a hora agora lá · `{&fuso}` — a lista do servidor (ou a hora no fuso do servidor)\n\nAceita `21:30`, `21h`, `9pm`. **Fuso do servidor:** a primeira cidade da lista; sem lista, o do idioma (português → São Paulo, espanhol → Madrid, inglês → UTC).",
      en: "Turns a time into a **timestamp**: everyone sees it in their own timezone.\n\n`{&fuso} 21:30` — 21:30 in the server's timezone · `{&fuso} 21:30 Madrid` — 21:30 in Madrid\n`{&fuso} Tokyo` — the time there now · `{&fuso}` — the server's list (or the time in the server's timezone)\n\nAccepts `21:30`, `21h`, `9pm`. **Server timezone:** the first city on the list; without a list, the language's (Portuguese → São Paulo, Spanish → Madrid, English → UTC).",
      es: "Convierte una hora en **timestamp**: cada persona la ve en su propio huso horario.\n\n`{&fuso} 21:30` — las 21:30 en el huso del servidor · `{&fuso} 21:30 Madrid` — las 21:30 en Madrid\n`{&fuso} Tokyo` — la hora actual allí · `{&fuso}` — la lista del servidor (o la hora en el huso del servidor)\n\nAcepta `21:30`, `21h`, `9pm`. **Huso del servidor:** la primera ciudad de la lista; sin lista, el del idioma (portugués → São Paulo, español → Madrid, inglés → UTC).",
    },
    ex: { pt: "{&fuso} 21:30 Madrid", en: "{&fuso} 21:30 Madrid", es: "{&fuso} 21:30 Madrid" },
    parametros: [
      { nome: { pt: "<hora> [cidade]", en: "<time> [city]", es: "<hora> [ciudad]" }, desc: { pt: "o timestamp daquele horário", en: "the timestamp for that time", es: "el timestamp de esa hora" } },
      { nome: { pt: "<cidade>", en: "<city>", es: "<ciudad>" }, desc: { pt: "a hora agora lá", en: "the time there now", es: "la hora actual allí" } },
      { nome: "add | remove", valor: { pt: "<cidade>", en: "<city>", es: "<ciudad>" }, desc: { pt: "a lista do `{&fuso}` *(ManageMessages)*", en: "the `{&fuso}` list *(ManageMessages)*", es: "la lista de `{&fuso}` *(ManageMessages)*" } },
    ],
  },
};
