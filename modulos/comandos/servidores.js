// &servidores — painel do dono do bot (servidores, relatório horário) — fora do &help

export default {
  id: "servidores",
  modulo: "../moderacao/servidores.js",
  funcao: "cmdServidores",
  nomes: { en: "servers" },
  apelidos: ["servers"],
  es: { nome: "servidores" },   // espanhol (etapa 4)
  subcomandos: {
    relatorio: "report", canal: "channel", agora: "now", assuntos: ["subjects", "topics"],
    vazias: "empty", aqui: "here", pseudonimo: "pseudonym",
  },
  aninhados: ["relatorio"],
  ajuda: {
    perm: null,
    uso: { pt: "{&servidores} [relatorio …]", en: "{&servidores} [report …]", es: "{&servidores} [report …]" },
    desc: { pt: "**Só o dono do bot** (fora do índice). Duas coisas:\n\n`{&servidores}` — onde o bot está: cada servidor com membros e ritmo de mensagens por minuto.\n\n`{&servidores.relatorio}` — um **relatório por hora** num canal seu: o que o log de moderação registrou em todos os servidores, raids, imagens, reinícios (com a causa), erros agrupados e os assuntos mais comentados. Números vêm do código; o modelo só escreve destaques, assuntos e a leitura dos erros. Detalhes: `{&help} servidores relatorio`.", en: "**Bot owner only** (not in the index). Two things:\n\n`{&servidores}` — where the bot is: each server with members and message rate per minute.\n\n`{&servidores.relatorio}` — an **hourly report** in a channel of yours: what the moderation log recorded across all servers, raids, images, restarts (with the cause), grouped errors and the most discussed topics. Numbers come from the code; the model only writes highlights, topics and the reading of the errors. Details: `{&help} servers report`.", es: "**Solo el dueño del bot** (fuera del índice). Dos cosas:\n\n`{&servidores}` — dónde está el bot: cada servidor con sus miembros y el ritmo de mensajes por minuto.\n\n`{&servidores.relatorio}` — un **informe por hora** en un canal tuyo: lo que registró el log de moderación en todos los servidores, raids, imágenes, reinicios (con la causa), errores agrupados y los temas más comentados. Los números vienen del código; el modelo solo escribe los destacados, los temas y la lectura de los errores. Detalles: `{&help} servidores report`." },
    ex: "{&servidores.relatorio.canal.aqui}",
  },
};
