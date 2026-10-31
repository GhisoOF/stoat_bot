// &privacidade — o centro de privacidade: o que a Judy guarda sobre você, e o que fazer
// com isso (20 out 2026; P2, 31 out 2026: recebe o que era do &chat — sair/voltar da
// conversa, esquecer, perfil, mapear, cuidado — e o sair/voltar do XP).

export default {
  id: "privacidade",
  modulo: "../ferramentas/privacidade.js",
  funcao: "cmdPrivacidade",
  nomes: { en: "privacy" },
  apelidos: ["privacy"],
  es: {
    nome: "privacidad",
    subcomandos: {
      memoria: "memoria", fio: "hilo", canal: "canal", status: "estado", apagar: "borrar", confirmar: "confirmar",
      chat: "chat", sair: "salir", voltar: "volver", esquecer: "olvidar", tudo: "todo", perfil: "perfil",
      mapear: "mapear", cuidado: "cuidado", xp: "xp",
    },
  },
  subcomandos: {
    memoria: "memory", fio: "thread", canal: "channel", status: "status", apagar: "delete", confirmar: "confirm",
    // (P2) o que era do &chat e do &xp
    chat: "chat", sair: ["leave", "optout"], voltar: ["back", "rejoin", "optin", "join"], esquecer: "forget",
    tudo: "all", perfil: "profile", mapear: "map", cuidado: ["care", "gentle"], xp: "xp",
  },
  aninhados: ["fio", "apagar", "chat", "esquecer", "xp", "memoria", "cuidado"],
  essencial: true,             // ninguém desliga o direito de ver e apagar os próprios dados
  qualquerCanal: true,
  // (P2) os caminhos antigos do &chat (e do &ia, o apelido dele) e o sair/entrar do &xp
  // vêm para cá. O que era do servidor (on/off, imagem, livre, comentar) vai para o
  // &config (atalhos no config.js, área do registro).
  atalhos: {
    "chat|ia sair|leave|optout|salir": "privacidade chat sair",
    "chat|ia voltar|rejoin|optin|volver": "privacidade chat voltar",
    "chat|ia esquecer|forget|olvidar": "privacidade esquecer",
    "chat|ia perfil|profile": "privacidade perfil",
    "chat|ia mapear|map": "privacidade mapear",
    "chat|ia cuidado|gentil|care|gentle": "privacidade cuidado",
    "chat|ia memoria|memory": "privacidade memoria",
    "chat|ia status|estado": "privacidade status",
    "xp sair|leave|optout|opt-out|salir": "privacidade xp sair",
    "xp entrar|join": "privacidade xp voltar",
  },
  ajuda: {
    grupo: "comecar",
    perm: { pt: "todo mundo (`esquecer tudo`: ManageServer)", en: "everyone (`forget all`: ManageServer)", es: "todos (`olvidar todo`: ManageServer)" },
    uso: {
      pt: "{&privacidade} [memoria on|off | fio global|canal | chat sair|voltar | xp sair|voltar | perfil | mapear | cuidado on|off | esquecer [tudo] | apagar]",
      en: "{&privacidade} [memory on|off | thread global|channel | chat leave|back | xp leave|back | profile | map | care on|off | forget [all] | delete]",
      es: "{&privacidade} [memoria on|off | hilo global|canal | chat salir|volver | xp salir|volver | perfil | mapear | cuidado on|off | olvidar [todo] | borrar]",
    },
    resumo: { pt: "o que a Judy guarda sobre você, e apagar", en: "what Judy keeps about you, and erasing it", es: "lo que Judy guarda sobre ti, y borrarlo" },
    desc: {
      pt: "Mostra o que a Judy guarda sobre **você** e o que você escolheu.\n\nPara falar com a Judy, chame-a pelo nome, mencione-a ou responda a uma mensagem dela.\n\nA memória da conversa é **opt-in**: a Judy só lembra de quem aceitou (ela pergunta uma vez, na primeira conversa; a resposta vale em todos os servidores). O que ela aprende num servidor só aparece nas conversas daquele servidor. O histórico da conversa é apagado depois de 24 h, aceitando ou não.\n\n`{&privacidade.memoria} on|off` — lembrar de você (`off` apaga o que ela sabia)\n`{&privacidade.fio} global|canal` — a conversa continua de um servidor a outro, ou cada canal tem a sua\n`{&privacidade.chat.sair}` — a Judy não conversa mais com você, em nenhum servidor (`{&privacidade.chat.voltar}` desfaz)\n`{&privacidade.xp.sair}` — o seu XP neste servidor é apagado e para de contar (`{&privacidade.xp.voltar}` desfaz)\n`{&privacidade.perfil}` — o que ela sabe de você neste servidor\n`{&privacidade.mapear}` — ela lê a bio e o status do seu cartão\n`{&privacidade.cuidado} on|off` — gentileza extra com você\n`{&privacidade.esquecer}` — ela esquece o que sabe de você neste servidor\n`{&privacidade.esquecer.tudo}` — ela esquece este servidor inteiro *(ManageServer)*\n`{&privacidade.apagar}` — apaga **tudo** o que é seu, em todos os servidores (memória da IA, XP, saldo, personagens do RPG de todas as eras), com confirmação. Ficam só os registros de moderação dos servidores.",
      en: "Shows what Judy keeps about **you** and what you chose.\n\nTo talk to Judy, call her by name, mention her or reply to one of her messages.\n\nConversation memory is **opt-in**: Judy only remembers people who agreed (she asks once, in your first conversation; the answer applies on every server). What she learns on a server only shows up in that server's conversations. The conversation history is deleted after 24 h, whether you agreed or not.\n\n`{&privacidade.memoria} on|off` — remember you (`off` erases what she knew)\n`{&privacidade.fio} global|channel` — the conversation carries over between servers, or each channel has its own\n`{&privacidade.chat.sair}` — Judy stops chatting with you, on every server (`{&privacidade.chat.voltar}` undoes it)\n`{&privacidade.xp.sair}` — your XP on this server is erased and stops counting (`{&privacidade.xp.voltar}` undoes it)\n`{&privacidade.perfil}` — what she knows about you on this server\n`{&privacidade.mapear}` — she reads your profile card's bio and status\n`{&privacidade.cuidado} on|off` — extra kindness with you\n`{&privacidade.esquecer}` — she forgets what she knows about you on this server\n`{&privacidade.esquecer.tudo}` — she forgets this whole server *(ManageServer)*\n`{&privacidade.apagar}` — erases **everything** that's yours, on every server (AI memory, XP, balance, RPG characters from every era), with a confirmation. Only the servers' moderation records stay.",
      es: "Muestra lo que Judy guarda sobre **ti** y lo que elegiste.\n\nPara hablar con Judy, llámala por su nombre, menciónala o responde a un mensaje suyo.\n\nLa memoria de la conversación es **opt-in**: Judy solo recuerda a quien aceptó (lo pregunta una vez, en la primera conversación; la respuesta vale en todos los servidores). Lo que aprende en un servidor solo aparece en las conversaciones de ese servidor. El historial de la conversación se borra a las 24 h, aceptes o no.\n\n`{&privacidade.memoria} on|off` — recordarte (`off` borra lo que sabía)\n`{&privacidade.fio} global|canal` — la conversación sigue de un servidor a otro, o cada canal tiene la suya\n`{&privacidade.chat.sair}` — Judy deja de conversar contigo, en todos los servidores (`{&privacidade.chat.voltar}` lo deshace)\n`{&privacidade.xp.sair}` — tu XP en este servidor se borra y deja de contar (`{&privacidade.xp.voltar}` lo deshace)\n`{&privacidade.perfil}` — lo que sabe de ti en este servidor\n`{&privacidade.mapear}` — lee la bio y el estado de tu tarjeta\n`{&privacidade.cuidado} on|off` — amabilidad extra contigo\n`{&privacidade.esquecer}` — olvida lo que sabe de ti en este servidor\n`{&privacidade.esquecer.tudo}` — olvida este servidor entero *(ManageServer)*\n`{&privacidade.apagar}` — borra **todo** lo tuyo, en todos los servidores (memoria de la IA, XP, saldo, personajes del RPG de todas las eras), con confirmación. Solo quedan los registros de moderación de los servidores.",
    },
    ex: { pt: "{&privacidade.memoria} on", en: "{&privacidade.memoria} on", es: "{&privacidade.memoria} on" },
    parametros: [
      { nome: { pt: "memoria on|off", en: "memory on|off", es: "memoria on|off" },
        desc: { pt: "a Judy lembra (ou deixa de lembrar) de você; `off` apaga o que ela sabia", en: "Judy remembers you (or stops); `off` erases what she knew", es: "Judy te recuerda (o deja de hacerlo); `off` borra lo que sabía" } },
      { nome: { pt: "fio global|canal", en: "thread global|channel", es: "hilo global|canal" },
        desc: { pt: "`global`: a conversa continua de um servidor para outro; `canal` (padrão): cada canal tem a sua", en: "`global`: the conversation carries over between servers; `channel` (default): each channel has its own", es: "`global`: la conversación sigue de un servidor a otro; `canal` (predeterminado): cada canal tiene la suya" } },
      { nome: { pt: "chat sair|voltar", en: "chat leave|back", es: "chat salir|volver" },
        desc: { pt: "a Judy para (ou volta) de conversar com você; o que você escreve não vai para a IA", en: "Judy stops (or resumes) chatting with you; what you write doesn't go to the AI", es: "Judy deja (o vuelve) de conversar contigo; lo que escribes no va a la IA" } },
      { nome: { pt: "xp sair|voltar", en: "xp leave|back", es: "xp salir|volver" },
        desc: { pt: "o seu XP neste servidor: `sair` apaga e para de contar; `voltar` recomeça do zero", en: "your XP on this server: `leave` erases it and stops counting; `back` starts again from zero", es: "tu XP en este servidor: `salir` lo borra y deja de contar; `volver` empieza de cero" } },
      { nome: { pt: "perfil", en: "profile", es: "perfil" },
        desc: { pt: "o que a Judy sabe de você neste servidor (só o seu)", en: "what Judy knows about you on this server (only yours)", es: "lo que Judy sabe de ti en este servidor (solo el tuyo)" } },
      { nome: { pt: "mapear", en: "map", es: "mapear" },
        desc: { pt: "a Judy lê a bio e o status do SEU cartão de perfil", en: "Judy reads YOUR profile card's bio and status", es: "Judy lee la bio y el estado de TU tarjeta de perfil" } },
      { nome: { pt: "cuidado on|off", en: "care on|off", es: "cuidado on|off" },
        desc: { pt: "gentileza e paciência extra, sem ironia ácida (só para você)", en: "extra kindness and patience, no acid irony (only for you)", es: "amabilidad y paciencia extra, sin ironía ácida (solo para ti)" } },
      { nome: { pt: "esquecer [tudo]", en: "forget [all]", es: "olvidar [todo]" },
        desc: { pt: "apaga o que a Judy sabe de você neste servidor; `tudo`: o servidor inteiro *(ManageServer)*", en: "erases what Judy knows about you on this server; `all`: the whole server *(ManageServer)*", es: "borra lo que Judy sabe de ti en este servidor; `todo`: el servidor entero *(ManageServer)*" } },
      { nome: { pt: "apagar", en: "delete", es: "borrar" },
        desc: { pt: "mostra o que será apagado e dá um código; `apagar confirmar` + o código apaga", en: "shows what will be erased and gives a code; `delete confirm` + the code erases it", es: "muestra lo que se va a borrar y da un código; `borrar confirmar` + el código lo borra" } },
    ],
    paginas: {
      apagar: {
        texto: {
          pt: "`{&privacidade.apagar}` mostra quantos registros seus existem e dá um código de 4 letras. Em até 2 minutos, `{&privacidade.apagar.confirmar} <código>` apaga, em **todos os servidores** e sem volta: a memória da IA (fatos, perfil, conversa), o XP, o saldo da economia e os personagens do RPG de **todas as eras**.\n\nFicam os avisos, as punições e a lista global de bans: são registros de moderação dos servidores.\n\nDepois de apagar, a Judy não pergunta de novo se pode lembrar de você (`{&privacidade.memoria} on`, se mudar de ideia).",
          en: "`{&privacidade.apagar}` shows how many records of yours exist and gives a 4-letter code. Within 2 minutes, `{&privacidade.apagar.confirmar} <code>` erases, on **every server** and for good: the AI memory (facts, profile, conversation), XP, economy balance and RPG characters from **every era**.\n\nWarnings, punishments and the global ban list stay: they're the servers' moderation records.\n\nAfter erasing, Judy won't ask again whether she can remember you (`{&privacidade.memoria} on`, if you change your mind).",
          es: "`{&privacidade.apagar}` muestra cuántos registros tuyos existen y da un código de 4 letras. En 2 minutos, `{&privacidade.apagar.confirmar} <código>` borra, en **todos los servidores** y sin vuelta atrás: la memoria de la IA (datos, perfil, conversación), el XP, el saldo de la economía y los personajes del RPG de **todas las eras**.\n\nQuedan las advertencias, las sanciones y la lista global de bans: son registros de moderación de los servidores.\n\nDespués de borrar, Judy no vuelve a preguntar si puede recordarte (`{&privacidade.memoria} on`, si cambias de idea).",
        },
      },
      chat: {
        texto: {
          pt: "`{&privacidade.chat.sair}` — a Judy deixa de conversar com você em **todos** os servidores: ela ignora as suas menções, não entra nas suas mensagens e o que você escreve não vai para a IA (nem para a memória dela).\n`{&privacidade.chat.voltar}` — desfaz.\n\nLigar ou desligar a conversa no servidor inteiro é da staff: `{&config}`.",
          en: "`{&privacidade.chat.sair}` — Judy stops chatting with you on **every** server: she ignores your mentions, doesn't join your messages, and what you write doesn't go to the AI (or to her memory).\n`{&privacidade.chat.voltar}` — undoes it.\n\nTurning the conversation on or off for the whole server is up to the staff: `{&config}`.",
          es: "`{&privacidade.chat.sair}` — Judy deja de conversar contigo en **todos** los servidores: ignora tus menciones, no entra en tus mensajes y lo que escribes no va a la IA (ni a su memoria).\n`{&privacidade.chat.voltar}` — lo deshace.\n\nActivar o desactivar la conversación en todo el servidor es cosa del staff: `{&config}`.",
        },
      },
      esquecer: {
        texto: {
          pt: "A Judy esquece o que aprendeu nas conversas — sem apagar XP, saldo, RPG nem os registros de moderação.\n\n`{&privacidade.esquecer}` — a Judy esquece o que sabe de **você** neste servidor: os fatos, o perfil, a conversa recente e a memória curta. Os outros servidores não mudam.\n`{&privacidade.esquecer.tudo}` — ela esquece **este servidor** inteiro: o que sabe de cada pessoa daqui, do servidor e o fio dos canais. Pede **ManageServer**.",
          en: "Judy forgets what she learned in conversations — without erasing XP, balance, RPG or moderation records.\n\n`{&privacidade.esquecer}` — Judy forgets what she knows about **you** on this server: facts, profile, recent conversation and short memory. Other servers don't change.\n`{&privacidade.esquecer.tudo}` — she forgets **this whole server**: what she knows about each person here, about the server, and the channels' threads. Needs **ManageServer**.",
          es: "Judy olvida lo que aprendió en las conversaciones — sin borrar XP, saldo, RPG ni los registros de moderación.\n\n`{&privacidade.esquecer}` — Judy olvida lo que sabe de **ti** en este servidor: los datos, el perfil, la conversación reciente y la memoria corta. Los otros servidores no cambian.\n`{&privacidade.esquecer.tudo}` — olvida **este servidor** entero: lo que sabe de cada persona de aquí, del servidor y el hilo de los canales. Requiere **ManageServer**.",
        },
      },
    },
  },
};
