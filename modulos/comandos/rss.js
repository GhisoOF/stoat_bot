// &rss — notícias por RSS: o telejornal do servidor
//
// P2 (31 out 2026): um resumo por dia no horário do servidor (`horario`); urgência só por
// regra (CVE crítica, termos do `urgente`, mesmo assunto em 3+ fontes), na hora. `agora`
// virou apelido de `testar`; `canal`, `categoria` e `off` continuam, fora da ajuda.

export default {
  id: "rss",
  modulo: "../ferramentas/rss.js",
  funcao: "cmdRss",
  apelidos: ["feed"],
  es: { nome: "rss", subcomandos: { horario: "horario", urgente: "urgente", testar: "probar", canal: "canal", agora: "ahora", categoria: "categoria", aqui: "aqui" } },   // espanhol (etapa 4)
  subcomandos: {
    add: "add", remove: "remove", list: "list", canal: "channel", agora: "now", testar: "test",
    off: "off", categoria: "category", horario: "time", urgente: "urgent",
  },
  naTela: { aqui: "here" },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    grupo: "personalizar",
    perm: "ManagePermissions",
    uso: { pt: "{&rss} add <url> [#canal] | remove <id> | list | testar | horario <hh:mm> [cidade] | urgente [termo]", en: "{&rss} add <url> [#channel] | remove <id> | list | test | time <hh:mm> [city] | urgent [term]", es: "{&rss} add <url> [#canal] | remove <id> | list | probar | horario <hh:mm> [ciudad] | urgente [término]" },
    desc: {
      pt: "O **telejornal** do servidor: as notícias dos feeds saem num resumo por dia, no horário do servidor. O que é urgente sai na hora — **CVE crítica**, um **termo** da sua lista, ou o **mesmo assunto em 3+ fontes**.\n\n`{&rss.add} <url> [#canal]` — acompanha um feed (sem canal: este)\n`{&rss.remove} <id>` · `{&rss.list}` — os feeds, com o último erro de cada um\n`{&rss.horario} 21:00 [cidade]` — a hora do resumo, na cidade dita (sem cidade: a do servidor; padrão 21:00)\n`{&rss.urgente} <termo>` — liga/desliga um termo urgente (sem termo, a lista)\n`{&rss.testar}` — lê os feeds e publica o resumo agora (no máximo um a cada 5 min)",
      en: "The server's **news digest**: stories from the feeds come out in one summary a day, at the server's time. What's urgent comes out right away — a **critical CVE**, a **term** from your list, or the **same story in 3+ sources**.\n\n`{&rss.add} <url> [#channel]` — follows a feed (no channel: this one)\n`{&rss.remove} <id>` · `{&rss.list}` — the feeds, with each one's last error\n`{&rss.horario} 21:00 [city]` — the digest time, in that city (no city: the server's; default 21:00)\n`{&rss.urgente} <term>` — toggles an urgent term (no term: the list)\n`{&rss.testar}` — reads the feeds and posts the digest now (at most once every 5 min)",
      es: "El **telediario** del servidor: las noticias de los feeds salen en un resumen al día, a la hora del servidor. Lo urgente sale al momento — una **CVE crítica**, un **término** de tu lista o el **mismo tema en 3+ fuentes**.\n\n`{&rss.add} <url> [#canal]` — sigue un feed (sin canal: este)\n`{&rss.remove} <id>` · `{&rss.list}` — los feeds, con el último error de cada uno\n`{&rss.horario} 21:00 [ciudad]` — la hora del resumen, en esa ciudad (sin ciudad: la del servidor; por defecto 21:00)\n`{&rss.urgente} <término>` — activa/desactiva un término urgente (sin término, la lista)\n`{&rss.testar}` — lee los feeds y publica el resumen ahora (como máximo uno cada 5 min)",
    },
    ex: { pt: "{&rss.add} https://exemplo.com/feed.xml", en: "{&rss.add} https://example.com/feed.xml", es: "{&rss.add} https://example.com/feed.xml" },
    parametros: [
      { nome: "add", valor: { pt: "<url> [#canal]", en: "<url> [#channel]", es: "<url> [#canal]" }, desc: { pt: "acompanha um feed; o canal é onde o RSS publica", en: "follows a feed; the channel is where RSS posts", es: "sigue un feed; el canal es donde publica el RSS" } },
      { nome: "remove", valor: { pt: "<id|url>", en: "<id|url>", es: "<id|url>" }, desc: { pt: "para de acompanhar", en: "stops following", es: "deja de seguirlo" } },
      { nome: "list", desc: { pt: "os feeds, com o último erro de cada um", en: "the feeds, with each one's last error", es: "los feeds, con el último error de cada uno" } },
      { nome: { pt: "horario", en: "time", es: "horario" }, valor: "<hh:mm> [cidade]", desc: { pt: "a hora do resumo do dia, na cidade dita (ex.: `21:00 Madrid`); sem cidade, a do servidor", en: "the daily digest time, in that city (e.g. `21:00 Madrid`); no city, the server's", es: "la hora del resumen del día, en esa ciudad (ej.: `21:00 Madrid`); sin ciudad, la del servidor" } },
      { nome: { pt: "urgente", en: "urgent", es: "urgente" }, valor: { pt: "[termo]", en: "[term]", es: "[término]" }, desc: { pt: "termo literal (até 40 caracteres, 20 termos) que faz a notícia sair na hora", en: "literal term (up to 40 characters, 20 terms) that makes a story come out right away", es: "término literal (hasta 40 caracteres, 20 términos) que hace que la noticia salga al momento" } },
      { nome: { pt: "testar", en: "test", es: "probar" }, desc: { pt: "publica o resumo agora", en: "posts the digest now", es: "publica el resumen ahora" } },
    ],
  },
};
