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
};
