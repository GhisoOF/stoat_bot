// &caso — a amostra diária do dono do bot (P3a, 31 out 2026). Só o dono, só na DM com a
// Judy (revisão P3a: num servidor, nem o do dono, ele mostra nada da fila). A fila mora em modulos/moderacao/revisao.js; o handler, em revisao-comando.js.
// (31 out 2026, P3a, staff — R13) saíram `perdeu` e `servidor` (com `rigido`/`padrao`): os casos
// e a regra de cada servidor são da staff dele.
// (3 nov 2026, P5) a ajuda conta a segunda análise (🔁) e que o veredito do dono também treina.

export default {
  id: "caso",
  modulo: "../moderacao/revisao-comando.js",
  funcao: "cmdCaso",
  nomes: { en: "case" },
  apelidos: ["case"],
  es: { nome: "caso", subcomandos: { certo: "acierto", errou: "fallo", exportar: "exportar" } },
  // `certo|errou` vem depois do código (`&caso K7FQ2 certo`): o handler traduz essa palavra pela mesma tabela
  subcomandos: { certo: ["right", "correct"], errou: "wrong", exportar: "export" },
  ajuda: {
    grupo: "dono",
    resumo: { pt: "a amostra diária da moderação (por DM)", en: "the daily moderation sample (by DM)", es: "la muestra diaria de la moderación (por DM)" },
    perm: { pt: "dono do bot", en: "bot owner", es: "dueño del bot" },
    uso: {
      pt: "{&caso} [‹código› [certo|errou] | exportar]",
      en: "{&caso} [‹code› [right|wrong] | export]",
      es: "{&caso} [‹código› [acierto|fallo] | exportar]",
    },
    desc: {
      pt: "**Só o dono do bot, só na DM com a Judy.** A amostra diária da moderação: até `REVISAO_POR_DIA` casos por dia chegam na sua DM, sorteados de todos os servidores (um por servidor). Reaja ✅ (o bot acertou) ou ❌ (errou): a mensagem do caso fica verde ou vermelha com ✔️ assim que o veredito é gravado. O seu veredito mede o acerto (o resumo diário), calibra o limiar global de cada categoria toda noite e treina o classificador de texto (só os pedaços de palavra por hash, sem texto nem pessoa) — nunca age sobre ninguém. Os casos duvidosos de cada servidor são da staff dele.\n\n🔁 **Segunda análise** — à parte da amostra, até `REVISAO_PROBLEMAS_POR_DIA` casos por dia que deram problema (a staff desfez uma punição automática, marcou ❌ num alerta, os detectores discordaram ou a punição falhou), com o mesmo ✅/❌. Esse veredito só treina: não entra no acerto nem no limiar, e não desfaz nada.\n\n`{&caso}` — os próximos casos agora (até o teto do dia)\n`{&caso} ‹código›` — mostra o caso de novo\n`{&caso} ‹código› certo|errou` — o mesmo que ✅ ou ❌\n`{&caso.exportar}` — os casos julgados num arquivo, sem nome nem ID (imagem só como hash)",
      en: "**Bot owner only, only in your DM with Judy.** The daily moderation sample: up to `REVISAO_POR_DIA` cases a day arrive in your DMs, drawn from every server (one per server). React ✅ (the bot was right) or ❌ (wrong): the case message turns green or red with ✔️ as soon as the verdict is saved. Your verdict measures accuracy (the daily summary), calibrates each category's global threshold every night and trains the text classifier (only hashed word pieces, no text or person) — it never acts on anyone. Each server's doubtful cases belong to its staff.\n\n🔁 **Second review** — apart from the sample, up to `REVISAO_PROBLEMAS_POR_DIA` cases a day that went wrong (the staff undid an automatic punishment, marked ❌ on an alert, the detectors disagreed or the punishment failed), with the same ✅/❌. That verdict only trains: it doesn't count toward accuracy or the threshold, and undoes nothing.\n\n`{&caso}` — the next cases now (up to the daily cap)\n`{&caso} ‹code›` — shows the case again\n`{&caso} ‹code› right|wrong` — same as ✅ or ❌\n`{&caso.exportar}` — the judged cases in a file, with no names or IDs (images only as a hash)",
      es: "**Solo el dueño del bot, solo por DM con Judy.** La muestra diaria de la moderación: hasta `REVISAO_POR_DIA` casos al día llegan a tu DM, sorteados de todos los servidores (uno por servidor). Reacciona ✅ (el bot acertó) o ❌ (falló): el mensaje del caso se pone verde o rojo con ✔️ en cuanto se guarda el veredicto. Tu veredicto mide el acierto (el resumen diario), calibra el umbral global de cada categoría cada noche y entrena el clasificador de texto (solo trozos de palabra por hash, sin texto ni persona) — nunca actúa sobre nadie. Los casos dudosos de cada servidor son de su staff.\n\n🔁 **Segundo análisis** — aparte de la muestra, hasta `REVISAO_PROBLEMAS_POR_DIA` casos al día que salieron mal (el staff deshizo un castigo automático, marcó ❌ en una alerta, los detectores discreparon o el castigo falló), con el mismo ✅/❌. Ese veredicto solo entrena: no cuenta para el acierto ni el umbral, y no deshace nada.\n\n`{&caso}` — los próximos casos ahora (hasta el tope del día)\n`{&caso} ‹código›` — muestra el caso otra vez\n`{&caso} ‹código› acierto|fallo` — lo mismo que ✅ o ❌\n`{&caso.exportar}` — los casos juzgados en un archivo, sin nombres ni IDs (imágenes solo como hash)",
    },
    ex: "{&caso}",
  },
};
