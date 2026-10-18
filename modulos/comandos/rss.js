// &rss — notícias por RSS

export default {
  id: "rss",
  modulo: "../ferramentas/rss.js",
  funcao: "cmdRss",
  apelidos: ["feed"],
  es: { nome: "rss" },   // espanhol (etapa 4)
  subcomandos: {
    add: "add", remove: "remove", list: "list", canal: "channel", agora: "now", testar: "test",
    off: "off", categoria: "category",
  },
  naTela: { aqui: "here" },
  gerenciavel: true,
  textoLivre: true,
};
