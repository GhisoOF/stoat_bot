// &privacidade — o que a Judy guarda sobre você, e o seu consentimento (20 out 2026)

export default {
  id: "privacidade",
  modulo: "../ferramentas/privacidade.js",
  funcao: "cmdPrivacidade",
  nomes: { en: "privacy" },
  apelidos: ["privacy"],
  es: { nome: "privacidad", subcomandos: { memoria: "memoria", fio: "hilo", canal: "canal", status: "estado", apagar: "borrar", confirmar: "confirmar" } },   // espanhol (etapa 4)
  subcomandos: { memoria: "memory", fio: "thread", canal: "channel", status: "status", apagar: "delete", confirmar: "confirm" },
  aninhados: ["fio", "apagar"],   // `&privacy thread channel`, `&privacy delete confirm`
  essencial: true,             // ninguém desliga o direito de ver e apagar os próprios dados
  qualquerCanal: true,
  ajuda: {
    perm: { pt: "todo mundo", en: "everyone", es: "todos" },
    uso: {
      pt: "{&privacidade} · {&privacidade.memoria} on|off · {&privacidade.fio} global|canal · {&privacidade.apagar}",
      en: "{&privacidade} · {&privacidade.memoria} on|off · {&privacidade.fio} global|channel · {&privacidade.apagar}",
      es: "{&privacidade} · {&privacidade.memoria} on|off · {&privacidade.fio} global|canal · {&privacidade.apagar}",
    },
    desc: {
      pt: "Mostra o que a Judy guarda sobre **você** e o seu consentimento.\n\nA memória da conversa é **opt-in**: a Judy só lembra de quem aceitou. Ela pergunta uma vez, na primeira conversa, e a resposta vale em todos os servidores. Desligar apaga tudo o que ela sabia de você.\n\nO histórico da conversa (para ela não perder o fio) é apagado depois de 24 h, aceitando ou não.\n\n`{&privacidade.apagar}` apaga **tudo** o que é seu (memória da IA, XP, saldo, personagem do RPG), com confirmação. Ficam só os registros de moderação dos servidores (avisos, punições, bans). A política completa está no link do `{&privacidade}`.",
      en: "Shows what Judy keeps about **you** and your consent.\n\nConversation memory is **opt-in**: Judy only remembers people who agreed. She asks once, in your first conversation, and the answer applies on every server. Turning it off erases everything she knew about you.\n\nThe conversation history (so she doesn't lose the thread) is deleted after 24 h, whether you agreed or not.\n\n`{&privacidade.apagar}` erases **everything** that's yours (AI memory, XP, balance, RPG character), with a confirmation. Only the servers' moderation records stay (warnings, punishments, bans). The full policy is linked from `{&privacidade}`.",
      es: "Muestra lo que Judy guarda sobre **ti** y tu consentimiento.\n\nLa memoria de la conversación es **opt-in**: Judy solo recuerda a quien aceptó. Lo pregunta una vez, en la primera conversación, y la respuesta vale en todos los servidores. Desactivarla borra todo lo que sabía de ti.\n\nEl historial de la conversación (para que no pierda el hilo) se borra a las 24 h, aceptes o no.\n\n`{&privacidade.apagar}` borra **todo** lo tuyo (memoria de la IA, XP, saldo, personaje del RPG), con confirmación. Solo quedan los registros de moderación de los servidores (advertencias, sanciones, bans). La política completa está en el enlace de `{&privacidade}`.",
    },
    ex: { pt: "{&privacidade.memoria} on", en: "{&privacidade.memoria} on", es: "{&privacidade.memoria} on" },
    parametros: [
      { nome: { pt: "memoria on|off", en: "memory on|off", es: "memoria on|off" },
        desc: { pt: "a Judy lembra (ou deixa de lembrar) de você; `off` apaga o que ela sabia", en: "Judy remembers you (or stops); `off` erases what she knew", es: "Judy te recuerda (o deja de hacerlo); `off` borra lo que sabía" } },
      { nome: { pt: "fio global|canal", en: "thread global|channel", es: "hilo global|canal" },
        desc: { pt: "`global`: a conversa continua de um servidor para outro; `canal` (padrão): cada canal tem a sua", en: "`global`: the conversation carries over between servers; `channel` (default): each channel has its own", es: "`global`: la conversación sigue de un servidor a otro; `canal` (predeterminado): cada canal tiene la suya" } },
      { nome: { pt: "apagar", en: "delete", es: "borrar" },
        desc: { pt: "mostra o que será apagado e dá um código; `apagar confirmar` + o código apaga", en: "shows what will be erased and gives a code; `delete confirm` + the code erases it", es: "muestra lo que se va a borrar y da un código; `borrar confirmar` + el código lo borra" } },
    ],
  },
};
