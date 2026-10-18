// &help — a ajuda: índice, grupos, página de cada comando e a árvore de subtópicos

export default {
  id: "help",
  modulo: "../moderacao/geral.js",
  funcao: "cmdHelp",
  es: { nome: "ayuda", subcomandos: { diversao: "diversion", comecar: "empezar" } },   // espanhol (etapa 4)
  subcomandos: {
    moderacao: "moderation", config: ["settings", "configuration"], ferramentas: "tools",
    geral: "general", xp: "levels", game: "character", comecar: "start",
    proteger: ["protect", "protection"], personalizar: ["customize", "customise"],
    diversao: "fun", diagnostico: ["diagnostics", "troubleshooting"], dono: "owner",
  },
  essencial: true,
  qualquerCanal: true,
};
