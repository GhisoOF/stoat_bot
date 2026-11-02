// &privacidade — o centro de privacidade: o que a Judy guarda sobre você, e o que fazer
// com isso (20 out 2026; P2, 31 out 2026: recebe o sair/voltar do XP).
// (P4, 2 nov 2026) O chat IA saiu: com ele, a memória, o fio, o sair/voltar da conversa,
// o perfil, o mapear, a gentileza extra e o esquecer. Ficam o status, o XP e o apagar.

export default {
  id: "privacidade",
  modulo: "../ferramentas/privacidade.js",
  funcao: "cmdPrivacidade",
  nomes: { en: "privacy" },
  apelidos: ["privacy"],
  es: {
    nome: "privacidad",
    subcomandos: { status: "estado", apagar: "borrar", confirmar: "confirmar", sair: "salir", voltar: "volver", xp: "xp" },
  },
  subcomandos: {
    status: "status", apagar: "delete", confirmar: "confirm",
    // (P2) o sair/entrar do &xp
    sair: ["leave", "optout"], voltar: ["back", "rejoin", "optin", "join"], xp: "xp",
  },
  aninhados: ["apagar", "xp"],
  essencial: true,             // ninguém desliga o direito de ver e apagar os próprios dados
  qualquerCanal: true,
  // (P2) o sair/entrar do &xp vem para cá
  atalhos: {
    "xp sair|leave|optout|opt-out|salir": "privacidade xp sair",
    "xp entrar|join": "privacidade xp voltar",
  },
  ajuda: {
    grupo: "comecar",
    perm: { pt: "todo mundo", en: "everyone", es: "todos" },
    uso: {
      pt: "{&privacidade} [xp sair|voltar | apagar]",
      en: "{&privacidade} [xp leave|back | delete]",
      es: "{&privacidade} [xp salir|volver | borrar]",
    },
    resumo: { pt: "o que a Judy guarda sobre você, e apagar", en: "what Judy keeps about you, and erasing it", es: "lo que Judy guarda sobre ti, y borrarlo" },
    desc: {
      pt: "Mostra o que a Judy guarda sobre **você**.\n\n`{&privacidade.xp.sair}` — o seu XP neste servidor é apagado e para de contar (`{&privacidade.xp.voltar}` desfaz)\n`{&privacidade.apagar}` — apaga **tudo** o que é seu, em todos os servidores, com confirmação. Ficam só os registros de moderação dos servidores.",
      en: "Shows what Judy keeps about **you**.\n\n`{&privacidade.xp.sair}` — your XP on this server is erased and stops counting (`{&privacidade.xp.voltar}` undoes it)\n`{&privacidade.apagar}` — erases **everything** that's yours, on every server, with a confirmation. Only the servers' moderation records stay.",
      es: "Muestra lo que Judy guarda sobre **ti**.\n\n`{&privacidade.xp.sair}` — tu XP en este servidor se borra y deja de contar (`{&privacidade.xp.voltar}` lo deshace)\n`{&privacidade.apagar}` — borra **todo** lo tuyo, en todos los servidores, con confirmación. Solo quedan los registros de moderación de los servidores.",
    },
    ex: { pt: "{&privacidade.apagar}", en: "{&privacidade.apagar}", es: "{&privacidade.apagar}" },
    parametros: [
      { nome: { pt: "xp sair|voltar", en: "xp leave|back", es: "xp salir|volver" },
        desc: { pt: "o seu XP neste servidor: `sair` apaga e para de contar; `voltar` recomeça do zero", en: "your XP on this server: `leave` erases it and stops counting; `back` starts again from zero", es: "tu XP en este servidor: `salir` lo borra y deja de contar; `volver` empieza de cero" } },
      { nome: { pt: "apagar", en: "delete", es: "borrar" },
        desc: { pt: "mostra o que será apagado e dá um código; `apagar confirmar` + o código apaga", en: "shows what will be erased and gives a code; `delete confirm` + the code erases it", es: "muestra lo que se va a borrar y da un código; `borrar confirmar` + el código lo borra" } },
    ],
    paginas: {
      apagar: {
        texto: {
          pt: "`{&privacidade.apagar}` mostra quantos registros seus existem e dá um código de 4 letras. Em até 2 minutos, `{&privacidade.apagar.confirmar} <código>` apaga, em **todos os servidores** e sem volta: o XP, o saldo da economia e os seus casos que esperam a staff.\n\nFicam os avisos, as punições e a lista global de bans: são registros de moderação dos servidores.",
          en: "`{&privacidade.apagar}` shows how many records of yours exist and gives a 4-letter code. Within 2 minutes, `{&privacidade.apagar.confirmar} <code>` erases, on **every server** and for good: XP, economy balance and your cases waiting for the staff.\n\nWarnings, punishments and the global ban list stay: they're the servers' moderation records.",
          es: "`{&privacidade.apagar}` muestra cuántos registros tuyos existen y da un código de 4 letras. En 2 minutos, `{&privacidade.apagar.confirmar} <código>` borra, en **todos los servidores** y sin vuelta atrás: el XP, el saldo de la economía y tus casos que esperan al staff.\n\nQuedan las advertencias, las sanciones y la lista global de bans: son registros de moderación de los servidores.",
        },
      },
    },
  },
};
