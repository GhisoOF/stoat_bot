// &tutorial — o mini guia: por onde começar e os conceitos que atravessam os comandos
// (P2, 31 out 2026).

export default {
  id: "tutorial",
  modulo: "../moderacao/tutorial.js",
  funcao: "cmdTutorial",
  nomes: { en: "tutorial" },
  apelidos: ["guia", "comecar", "inicio", "guide", "start"],
  es: { nome: "tutorial", subcomandos: { permissoes: "permisos", canais: "canales", protecao: "proteccion", moderacao: "moderacion", cargos: "roles", ia: "ia", noticias: "noticias", mensagens: "mensajes", economia: "economia", ajustes: "ajustes" } },
  subcomandos: {
    permissoes: "permissions", ids: "ids", canais: "channels", protecao: ["protection", "protect"],
    // as áreas antigas que só repetiam um comando: levam ao `&help` dele
    moderacao: "moderation", cargos: "roles", ia: "ai", noticias: "news", mensagens: "messages",
    economia: "economy", ajustes: "settings",
  },
  gerenciavel: true,
  qualquerCanal: true,
  ajuda: {
    grupo: "comecar",
    perm: null,
    uso: { pt: "{&tutorial} [página|conceito]", en: "{&tutorial} [page|concept]", es: "{&tutorial} [página|concepto]" },
    resumo: { pt: "por onde começar e os conceitos", en: "where to start and the concepts", es: "por dónde empezar y los conceptos" },
    desc: {
      pt: "O mini guia: o que dá para fazer e por onde começar, em páginas (reaja ◀ ▶).\n\n`{&tutorial.permissoes}` · `{&tutorial.ids}` · `{&tutorial.canais}` · `{&tutorial.protecao}` — o que vale para vários comandos\n\nCada comando se explica no `{&help}`.",
      en: "The mini guide: what you can do and where to start, in pages (react ◀ ▶).\n\n`{&tutorial.permissoes}` · `{&tutorial.ids}` · `{&tutorial.canais}` · `{&tutorial.protecao}` — what applies to many commands\n\nEach command is explained in `{&help}`.",
      es: "La miniguía: lo que puedes hacer y por dónde empezar, en páginas (reacciona ◀ ▶).\n\n`{&tutorial.permissoes}` · `{&tutorial.ids}` · `{&tutorial.canais}` · `{&tutorial.protecao}` — lo que vale para varios comandos\n\nCada comando se explica en `{&help}`.",
    },
    ex: "{&tutorial.canais}",
  },
};
