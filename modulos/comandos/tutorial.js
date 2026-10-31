// &tutorial — o mini guia: por onde começar, os conceitos que atravessam os comandos
// e a wiki do RPG (gerada dos dados do jogo). P2, 31 out 2026.

export default {
  id: "tutorial",
  modulo: "../moderacao/tutorial.js",
  funcao: "cmdTutorial",
  nomes: { en: "tutorial" },
  apelidos: ["guia", "comecar", "inicio", "guide", "start"],
  es: { nome: "tutorial", subcomandos: { permissoes: "permisos", canais: "canales", protecao: "proteccion", rpg: "rpg", moderacao: "moderacion", cargos: "roles", ia: "ia", noticias: "noticias", mensagens: "mensajes", economia: "economia", aventura: "aventura", ajustes: "ajustes" } },
  subcomandos: {
    permissoes: "permissions", ids: "ids", canais: "channels", protecao: ["protection", "protect"], rpg: ["wiki"],
    // as áreas antigas que só repetiam um comando: levam ao `&help` dele
    moderacao: "moderation", cargos: "roles", ia: "ai", noticias: "news", mensagens: "messages",
    economia: "economy", aventura: "adventure", ajustes: "settings",
  },
  gerenciavel: true,
  qualquerCanal: true,
  ajuda: {
    grupo: "comecar",
    perm: null,
    uso: { pt: "{&tutorial} [página|conceito|rpg]", en: "{&tutorial} [page|concept|rpg]", es: "{&tutorial} [página|concepto|rpg]" },
    resumo: { pt: "por onde começar, os conceitos e a wiki do RPG", en: "where to start, the concepts and the RPG wiki", es: "por dónde empezar, los conceptos y la wiki del RPG" },
    desc: {
      pt: "O mini guia: o que dá para fazer e por onde começar, em páginas (reaja ◀ ▶).\n\n`{&tutorial.permissoes}` · `{&tutorial.ids}` · `{&tutorial.canais}` · `{&tutorial.protecao}` — o que vale para vários comandos\n`{&tutorial.rpg}` — a wiki do RPG\n\nCada comando se explica no `{&help}`.",
      en: "The mini guide: what you can do and where to start, in pages (react ◀ ▶).\n\n`{&tutorial.permissoes}` · `{&tutorial.ids}` · `{&tutorial.canais}` · `{&tutorial.protecao}` — what applies to many commands\n`{&tutorial.rpg}` — the RPG wiki\n\nEach command is explained in `{&help}`.",
      es: "La miniguía: lo que puedes hacer y por dónde empezar, en páginas (reacciona ◀ ▶).\n\n`{&tutorial.permissoes}` · `{&tutorial.ids}` · `{&tutorial.canais}` · `{&tutorial.protecao}` — lo que vale para varios comandos\n`{&tutorial.rpg}` — la wiki del RPG\n\nCada comando se explica en `{&help}`.",
    },
    ex: "{&tutorial.canais}",
  },
};
