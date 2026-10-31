// &musica — música na call

export default {
  id: "musica",
  modulo: "../ferramentas/musica.js",
  funcao: "cmdMusica",
  nomes: { en: "music" },
  apelidos: ["m", "music", "play", "tocar"],
  es: { nome: "musica", subcomandos: { pausar: "pausar", retomar: "reanudar", fila: "cola", parar: "parar", faixa: "pista", nao: "no" } },   // espanhol (etapa 4)
  naTela: { pausar: "pause", retomar: "resume", fila: "queue", parar: "stop", faixa: "track", nao: "off" },
  gerenciavel: true,
  voz: true,
  textoLivre: true,
  ajuda: {
    grupo: "diversao",
    perm: { pt: "todo mundo", en: "everyone", es: "todos" },
    uso: { pt: "{&musica} <link ou nome> | pausar|play|skip|fila|parar | volume <0-200> | loop <faixa|fila|nao>", en: "{&musica} <link or name> | pause|play|skip|queue|stop | volume <0-200> | loop <track|queue|off>", es: "{&musica} <enlace o nombre> | pause|play|skip|queue|stop | volume <0-200> | loop <track|queue|off>" },
    desc: {
      pt: "Música na call — **YouTube, SoundCloud e Spotify**, com fila. Se a Judy não estiver numa call deste servidor, ela entra na sua. Quando o TTS fala, a música abaixa sozinha.\n\n`{&musica} <link ou nome>` — toca (com algo tocando, entra na fila)\n`{&musica.pausar}` · `{&musica} play` — pausa e retoma\n`{&musica} skip` — a próxima · `{&musica.fila}` — o que está na fila\n`{&musica.parar}` — para e limpa a fila\n`{&musica} volume 80` — de 0 a 200%\n`{&musica} loop faixa|fila|nao`",
      en: "Music in the call — **YouTube, SoundCloud and Spotify**, with a queue. If Judy isn't in a call on this server, she joins yours. While TTS speaks, the music ducks by itself.\n\n`{&musica} <link or name>` — plays (if something is on, it queues)\n`{&musica.pausar}` · `{&musica} play` — pause and resume\n`{&musica} skip` — next · `{&musica.fila}` — what's queued\n`{&musica.parar}` — stop and clear the queue\n`{&musica} volume 80` — 0 to 200%\n`{&musica} loop track|queue|off`",
      es: "Música en la llamada — **YouTube, SoundCloud y Spotify**, con cola. Si Judy no está en una llamada de este servidor, entra en la tuya. Cuando el TTS habla, la música baja sola.\n\n`{&musica} <enlace o nombre>` — reproduce (si ya suena algo, entra en la cola)\n`{&musica.pausar}` · `{&musica} play` — pausa y reanuda\n`{&musica} skip` — la siguiente · `{&musica.fila}` — lo que hay en la cola\n`{&musica.parar}` — detiene y vacía la cola\n`{&musica} volume 80` — de 0 a 200%\n`{&musica} loop track|queue|off`",
    },
    ex: "{&musica} never gonna give you up",
  },
};
