// &bateria — as imagens rotuladas da bateria de teste da moderação de imagem (P4.3, 2 nov 2026).
// Só o dono do bot, só na DM com a Judy. O motor (e o contrato do arquivo que a bateria lê):
// modulos/moderacao/bateria.js; o handler: bateria-comando.js. (P4.4) Os avisos da bateria na DM:
// modulos/moderacao/bateria-avisos.js.

export default {
  id: "bateria",
  modulo: "../moderacao/bateria-comando.js",
  funcao: "cmdBateria",
  nomes: { en: "testset" },
  apelidos: ["testset"],
  es: { nome: "bateria", subcomandos: { remover: "quitar", limpar: "vaciar", confirmar: "confirmar", ultima: "ultima", avisos: "avisos" } },
  subcomandos: { remover: ["remove", "delete"], limpar: "clear", confirmar: "confirm", ultima: ["last", "latest"], avisos: "alerts" },
  aninhados: ["remover", "limpar"],
  ajuda: {
    grupo: "dono",
    resumo: { pt: "imagens rotuladas para a bateria de teste da visão (por DM)", en: "labelled images for the vision test set (by DM)", es: "imágenes etiquetadas para la batería de prueba de la visión (por DM)" },
    perm: { pt: "dono do bot", en: "bot owner", es: "dueño del bot" },
    uso: {
      pt: "{&bateria} [‹categoria› + imagens | remover ‹código›|ultima | limpar ‹categoria› | avisos on|off]",
      en: "{&bateria} [‹category› + images | remove ‹code›|last | clear ‹category› | alerts on|off]",
      es: "{&bateria} [‹categoría› + imágenes | quitar ‹código›|ultima | vaciar ‹categoría› | avisos on|off]",
    },
    desc: {
      pt: "**Só o dono do bot, só na DM com a Judy.** Junta imagens rotuladas para a bateria de teste da moderação de imagem (o programa que mede o acerto da visão).\n\n`{&bateria} ‹categoria›` com 1 a 10 imagens anexadas — registra cada uma (ex.: `anime`, `meme`, `praia`, `nudez`, `gore`, `simbolo-odio`; acento e espaço viram hífen). Responde o código de cada uma.\n`{&bateria}` — quantas há em cada categoria e o total (teto: 5000)\n`{&bateria.remover} ‹código›|ultima` — tira um registro\n`{&bateria.limpar} ‹categoria›` — tira todos daquela categoria (pede confirmação)\n`{&bateria.avisos} on|off` — o que a bateria avisa (início, progresso, fim e erro) chega como mensagem na sua DM; ligado por padrão (o `{&bateria}` mostra o estado)\n\n**A Judy nunca baixa nem copia a imagem:** guarda só o link do anexo no Stoat, a categoria e o que o Stoat informa do anexo (nome, tipo, tamanho, largura e altura). A bateria abre a imagem pelo link na hora. Apagar a mensagem da DM pode derrubar o link.",
      en: "**Bot owner only, only in your DM with Judy.** Collects labelled images for the image moderation test set (the program that measures how accurate the vision is).\n\n`{&bateria} ‹category›` with 1 to 10 attached images — records each one (e.g. `anime`, `meme`, `beach`, `nudity`, `gore`, `hate-symbol`; accents and spaces become hyphens). Replies with each one's code.\n`{&bateria}` — how many there are per category and the total (cap: 5000)\n`{&bateria.remover} ‹code›|last` — removes one record\n`{&bateria.limpar} ‹category›` — removes every one in that category (asks for confirmation)\n`{&bateria.avisos} on|off` — what the test set reports (start, progress, done and error) arrives as a message in your DM; on by default (`{&bateria}` shows the state)\n\n**Judy never downloads or copies the image:** she keeps only the attachment's Stoat link, the category and what Stoat reports about the attachment (name, type, size, width and height). The test set opens the image through the link when it runs. Deleting the DM message may break the link.",
      es: "**Solo el dueño del bot, solo por DM con Judy.** Junta imágenes etiquetadas para la batería de prueba de la moderación de imágenes (el programa que mide el acierto de la visión).\n\n`{&bateria} ‹categoría›` con 1 a 10 imágenes adjuntas — registra cada una (p. ej.: `anime`, `meme`, `playa`, `desnudo`, `gore`, `simbolo-odio`; las tildes y los espacios se vuelven guiones). Responde con el código de cada una.\n`{&bateria}` — cuántas hay en cada categoría y el total (tope: 5000)\n`{&bateria.remover} ‹código›|ultima` — quita un registro\n`{&bateria.limpar} ‹categoría›` — quita todas las de esa categoría (pide confirmación)\n`{&bateria.avisos} on|off` — lo que avisa la batería (inicio, progreso, fin y error) llega como mensaje a tu DM; activado por defecto (`{&bateria}` muestra el estado)\n\n**Judy nunca descarga ni copia la imagen:** guarda solo el enlace del adjunto en Stoat, la categoría y lo que Stoat informa del adjunto (nombre, tipo, tamaño, ancho y alto). La batería abre la imagen por el enlace en el momento. Borrar el mensaje del DM puede romper el enlace.",
    },
    ex: { pt: "{&bateria} anime", en: "{&bateria} anime", es: "{&bateria} anime" },
  },
};
