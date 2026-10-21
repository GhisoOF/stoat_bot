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
  ajuda: {
    perm: "ManagePermissions",
    uso: { pt: "{&rss} [add|remove|list|canal|agora]", en: "{&rss} [add|remove|list|channel|now]", es: "{&rss} [add|remove|list|channel|now]" },
    desc: { pt: "Curadoria de notícias por RSS, com resumo da Judy. `add <url>` cadastra um feed, `canal aqui` define o destino, `list` mostra os feeds, `remove <url|n>` remove, `agora` força um ciclo. A cada hora a Judy posta um resumo geral no tom dela e depois os itens novos (título, feed, horário, link).", en: "RSS news curation with Judy's summaries. `add <url>` registers a feed, `channel here` sets the destination, `list` shows the feeds, `remove <url|n>` removes one, `now` forces a cycle. Every hour Judy posts an overall summary in her own voice, followed by the new items (title, feed, time, link).", es: "Curaduría de noticias por RSS, con resumen de Judy. `add <url>` registra un feed, `channel here` define el destino, `list` muestra los feeds, `remove <url|n>` elimina uno, `now` fuerza un ciclo. Cada hora Judy publica un resumen general con su propio tono y después los elementos nuevos (título, feed, hora, enlace)." },
    ex: { pt: "{&rss.add} https://exemplo.com/feed.xml", en: "{&rss.add} https://example.com/feed.xml", es: "{&rss.add} https://example.com/feed.xml" },
    parametros: [
      { nome: "add", valor: { pt: "<url> [categoria]", en: "<url> [category]", es: "<url> [categoría]" }, desc: { pt: "acompanha um feed. A categoria agrupa os resumos: cada assunto sai num bloco próprio, em vez de tudo espremido num apanhado só", en: "follows a feed. The category groups the digests: each topic gets its own block instead of everything squeezed into one", es: "sigue un feed. La categoría agrupa los resúmenes: cada tema sale en su propio bloque, en lugar de todo apretado en un solo resumen" } },
      { nome: { pt: "categoria", en: "category", es: "category" }, valor: { pt: "<id|url> <nome|off>", en: "<id|url> <name|off>", es: "<id|url> <nombre|off>" }, desc: { pt: "define ou tira a categoria de um feed já cadastrado (`{&rss.list}` mostra os ids). Sem categoria, o feed resume no bloco **Geral**", en: "sets or clears the category of an existing feed (`{&rss.list}` shows the ids). Without one, the feed digests under **General**", es: "define o quita la categoría de un feed ya registrado (`{&rss.list}` muestra los ids). Sin categoría, el feed se resume en el bloque **General**" } },
      { nome: "remove", valor: { pt: "<url|número>", en: "<url|number>", es: "<url|número>" }, desc: { pt: "para de acompanhar", en: "stops following", es: "deja de seguirlo" } },
      { nome: "list", desc: { pt: "feeds acompanhados", en: "followed feeds", es: "feeds seguidos" } },
      { nome: { pt: "canal", en: "channel", es: "channel" }, valor: { pt: "<#canal|aqui>", en: "<#channel|here>", es: "<#canal|here>" }, desc: { pt: "onde publicar", en: "where to post", es: "dónde publicar" } },
      { nome: { pt: "agora", en: "now", es: "now" }, desc: { pt: "busca e publica agora (teste)", en: "fetches and posts now (test)", es: "busca y publica ahora (prueba)" } },
      { nome: "off", desc: { pt: "desliga", en: "turns it off", es: "lo desactiva" } },
    ],
  },
};
