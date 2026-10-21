// &tutorial — guia em páginas (permissões, canais, proteção…)

export default {
  id: "tutorial",
  modulo: "../moderacao/tutorial.js",
  funcao: "cmdTutorial",
  nomes: { en: "tutorial" },
  apelidos: ["guia", "comecar", "inicio", "guide", "start"],
  es: { nome: "tutorial" },   // espanhol (etapa 4)
  subcomandos: {
    permissoes: "permissions", canais: "channels", moderacao: "moderation", cargos: "roles",
    ia: "ai", noticias: "news", mensagens: "messages", economia: "economy",
    aventura: "adventure", ajustes: "settings",
  },
  gerenciavel: true,
  qualquerCanal: true,
  ajuda: {
    perm: null,
    uso: { pt: "{&tutorial} [página|área]", en: "{&tutorial} [page|area]", es: "{&tutorial} [página|área]" },
    desc: { pt: "Guia de primeiros passos **em páginas** — reaja ◀ ▶ para virar. Não altera nada sozinho: mostra o caminho e o comando exato de cada passo.\n\n`{&tutorial}` — o guia (6 páginas): permissões → canais → proteção → boas-vindas e cargos → XP e RPG → checklist\n`{&tutorial} 2` — abre direto a página 2\n`{&tutorial} <área>` — aprofunda um assunto (ex.: `{&tutorial.canais}`, `{&tutorial} game`)\n\nPrefere que o bot pergunte e configure por você? `{&assistente}`.\n\nTambém responde por `&guia` e `&comecar`.", en: "First-steps guide **in pages** — react ◀ ▶ to turn. It changes nothing by itself: it shows the path and the exact command for each step.\n\n`{&tutorial}` — the guide (6 pages): permissions → channels → protection → welcome and roles → XP and RPG → checklist\n`{&tutorial} 2` — opens page 2 directly\n`{&tutorial} <area>` — goes deeper on one subject (e.g. `{&tutorial.canais}`, `{&tutorial} game`)\n\nWould you rather have the bot ask and configure for you? `{&assistente}`.\n\nAlso answers to **guide** and **start**.", es: "Guía de primeros pasos **en páginas** — reacciona ◀ ▶ para pasar. No cambia nada por sí sola: muestra el camino y el comando exacto de cada paso.\n\n`{&tutorial}` — la guía (6 páginas): permisos → canales → protección → bienvenida y roles → XP y RPG → checklist\n`{&tutorial} 2` — abre directamente la página 2\n`{&tutorial} <área>` — profundiza en un tema (p. ej., `{&tutorial.canais}`, `{&tutorial} game`)\n\n¿Prefieres que el bot pregunte y lo configure por ti? `{&assistente}`.\n\nTambién responde a **guia** y **inicio**." },
    ex: "{&tutorial.canais}",
    parametros: [
      { nome: { pt: "(nada)", en: "(nothing)", es: "(nada)" }, desc: { pt: "o guia em páginas, na ordem: permissões → canais → proteção → boas-vindas e cargos → XP e RPG → checklist", en: "the paged guide, in order: permissions → channels → protection → welcome and roles → XP and RPG → checklist", es: "la guía en páginas, en orden: permisos → canales → protección → bienvenida y roles → XP y RPG → checklist" } },
      { nome: { pt: "<número>", en: "<number>", es: "<número>" }, desc: { pt: "abre direto aquela página (para celular ou quando não dá para reagir)", en: "opens that page directly (for mobile or when you can't react)", es: "abre directamente esa página (para el móvil o cuando no puedes reaccionar)" } },
      { nome: { pt: "<área>", en: "<area>", es: "<área>" }, desc: { pt: "aprofunda um assunto: `canais`, `permissoes`, `moderacao`, `logs`, `cargos`, `xp`, `mensagens`, `noticias`, `rpg`, `aventura`, `economia`, `ajustes`", en: "goes deeper on one subject: `channels`, `permissions`, `moderation`, `logs`, `roles`, `xp`, `messages`, `news`, `rpg`, `adventure`, `economy`, `settings`", es: "profundiza en un tema: `channels`, `permissions`, `moderation`, `logs`, `roles`, `xp`, `messages`, `news`, `rpg`, `adventure`, `economy`, `settings`" } },
    ],
  },
};
