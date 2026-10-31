// &caso — a fila de revisão do dono do bot (P3a, 31 out 2026). Só o dono, só na DM com a
// Judy (revisão P3a: num servidor, nem o do dono, ele mostra nada da fila). A fila mora em modulos/moderacao/revisao.js; o handler, em revisao-comando.js.

export default {
  id: "caso",
  modulo: "../moderacao/revisao-comando.js",
  funcao: "cmdCaso",
  nomes: { en: "case" },
  apelidos: ["case"],
  es: { nome: "caso", subcomandos: { certo: "acierto", errou: "fallo", perdeu: "perdio", servidor: "servidor", exportar: "exportar", rigido: "estricto", padrao: "predeterminado" } },
  // `certo|errou` vem depois do código (`&caso K7FQ2 certo`): o handler traduz essa palavra pela mesma tabela
  subcomandos: { certo: ["right", "correct"], errou: "wrong", perdeu: "missed", servidor: "server", exportar: "export", rigido: "strict", padrao: "default" },
  aninhados: ["servidor"],
  ajuda: {
    grupo: "dono",
    resumo: { pt: "a fila de revisão da moderação (por DM)", en: "the moderation review queue (by DM)", es: "la cola de revisión de la moderación (por DM)" },
    perm: { pt: "dono do bot", en: "bot owner", es: "dueño del bot" },
    uso: {
      pt: "{&caso} [‹código› [certo|errou] | perdeu … | servidor … | exportar]",
      en: "{&caso} [‹code› [right|wrong] | missed … | server … | export]",
      es: "{&caso} [‹código› [acierto|fallo] | perdio … | servidor … | exportar]",
    },
    desc: {
      pt: "**Só o dono do bot, só na DM com a Judy.** A fila de revisão da moderação: até `REVISAO_POR_DIA` casos por dia chegam na sua DM — primeiro os de mais dúvida, depois uma amostra de todos os servidores. Reaja ✅ (o bot acertou) ou ❌ (errou). O que você julga ensina o bot: caso parecido herda o veredito, e o limiar de cada categoria é recalculado toda noite.\n\n`{&caso}` — os próximos casos agora (até o teto do dia)\n`{&caso} ‹código›` — mostra o caso de novo\n`{&caso} ‹código› certo|errou` — o mesmo que ✅ ou ❌\n`{&caso.perdeu} @pessoa avatar|banner|bio` — o que o bot deixou passar num perfil\n`{&caso.perdeu} ‹link›` — uma mensagem ou imagem que ele deixou passar\n`{&caso.servidor} ‹id› rigido|padrao` — um servidor com limiar mais baixo (ou de volta ao padrão)\n`{&caso.exportar}` — os casos julgados num arquivo, sem nome nem ID (imagem só como hash)",
      en: "**Bot owner only, only in your DM with Judy.** The moderation review queue: up to `REVISAO_POR_DIA` cases a day arrive in your DMs — the most doubtful first, then a sample from every server. React ✅ (the bot was right) or ❌ (wrong). What you judge teaches the bot: a similar case inherits the verdict, and each category's threshold is recalculated every night.\n\n`{&caso}` — the next cases now (up to the daily cap)\n`{&caso} ‹code›` — shows the case again\n`{&caso} ‹code› right|wrong` — same as ✅ or ❌\n`{&caso.perdeu} @user avatar|banner|bio` — what the bot let through on a profile\n`{&caso.perdeu} ‹link›` — a message or image it let through\n`{&caso.servidor} ‹id› strict|default` — a server with a lower threshold (or back to the default)\n`{&caso.exportar}` — the judged cases in a file, with no names or IDs (images only as a hash)",
      es: "**Solo el dueño del bot, solo por DM con Judy.** La cola de revisión de la moderación: hasta `REVISAO_POR_DIA` casos al día llegan a tu DM — primero los más dudosos, después una muestra de todos los servidores. Reacciona ✅ (el bot acertó) o ❌ (falló). Lo que juzgas le enseña al bot: un caso parecido hereda el veredicto, y el umbral de cada categoría se recalcula cada noche.\n\n`{&caso}` — los próximos casos ahora (hasta el tope del día)\n`{&caso} ‹código›` — muestra el caso otra vez\n`{&caso} ‹código› acierto|fallo` — lo mismo que ✅ o ❌\n`{&caso.perdeu} @usuario avatar|banner|bio` — lo que el bot dejó pasar en un perfil\n`{&caso.perdeu} ‹enlace›` — un mensaje o imagen que dejó pasar\n`{&caso.servidor} ‹id› estricto|predeterminado` — un servidor con umbral más bajo (o de vuelta al predeterminado)\n`{&caso.exportar}` — los casos juzgados en un archivo, sin nombres ni IDs (imágenes solo como hash)",
    },
    ex: "{&caso}",
  },
};
