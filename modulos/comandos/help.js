// &help — a ajuda: índice por grupo, página de cada comando e de cada subcomando.
// Tudo sai do registro (P2, 31 out 2026): o `ajuda` de cada comando é a única fonte.

export default {
  id: "help",
  modulo: "../moderacao/ajuda.js",
  funcao: "cmdHelp",
  nomes: { en: "help" },
  apelidos: ["ajuda"],
  es: { nome: "ayuda" },
  essencial: true,
  qualquerCanal: true,
  ajuda: {
    grupo: "comecar",
    perm: null,
    uso: { pt: "{&help} [comando|grupo] [subcomando]", en: "{&help} [command|group] [subcommand]", es: "{&help} [comando|grupo] [subcomando]" },
    resumo: { pt: "esta ajuda: o índice, um grupo ou um comando", en: "this help: the index, a group or a command", es: "esta ayuda: el índice, un grupo o un comando" },
    desc: {
      pt: "Sozinho, o índice: os comandos por grupo.\n\n`{&help} <comando>` — uso, permissão, cada parâmetro e um exemplo\n`{&help} <comando> <subcomando>` — a página de uma parte\n`{&help} <grupo>` — os comandos de um grupo, com uma linha cada\n\nAceita o nome em português, inglês ou espanhol. Vários comandos de uma vez: um por linha na mesma mensagem (até 10).",
      en: "On its own, the index: the commands by group.\n\n`{&help} <command>` — usage, permission, every parameter and an example\n`{&help} <command> <subcommand>` — the page of one part\n`{&help} <group>` — a group's commands, one line each\n\nTakes the name in English, Portuguese or Spanish. Several commands at once: one per line in the same message (up to 10).",
      es: "Solo, el índice: los comandos por grupo.\n\n`{&help} <comando>` — uso, permiso, cada parámetro y un ejemplo\n`{&help} <comando> <subcomando>` — la página de una parte\n`{&help} <grupo>` — los comandos de un grupo, con una línea cada uno\n\nAcepta el nombre en español, inglés o portugués. Varios comandos a la vez: uno por línea en el mismo mensaje (hasta 10).",
    },
    ex: "{&help} warn",
  },
};
