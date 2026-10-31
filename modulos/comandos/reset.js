// &reset — configuração de fábrica do servidor (dono do servidor e dono do bot)

export default {
  id: "reset",
  modulo: "../moderacao/reset.js",
  funcao: "cmdReset",
  apelidos: ["resetar", "redefinir", "factoryreset", "fabrica"],
  es: { nome: "reset", subcomandos: { confirmar: "confirmar", desfazer: "deshacer" } },   // espanhol (etapa 4)
  // (P2) os dois passos têm nome em cada idioma (antes a tela espanhola e a portuguesa diziam `confirm`/`undo`)
  subcomandos: { confirmar: ["confirm", "yes"], desfazer: ["undo", "restore", "revert"] },
  ajuda: {
    grupo: "comecar",
    perm: { pt: "dono do servidor (ou o dono do bot)", en: "server owner (or the bot owner)", es: "el dueño del servidor (o el dueño del bot)" },
    uso: {
      pt: "{&reset} · {&reset.confirmar} <código> · {&reset.desfazer}",
      en: "{&reset} · {&reset.confirmar} <code> · {&reset.desfazer}",
      es: "{&reset} · {&reset.confirmar} <código> · {&reset.desfazer}",
    },
    desc: {
      pt: "Volta a Judy à **configuração de fábrica** neste servidor: automod (tudo desligado), punição, canal de log, boas-vindas/adeus, cargo automático, staff e acesso, comandos desativados, ajustes de XP/TTS/tickets/IA, regras e FAQ, e o idioma (inglês).\n\n**Fica:** níveis de XP, avisos, saldos, personagens do RPG, cargos por reação, webhooks, feeds RSS, tickets abertos e a lista global de bans.\n\nEm três passos: `{&reset}` mostra o que muda e dá um código; `{&reset.confirmar} <código>` (em até 2 min, a mesma pessoa) aplica; `{&reset.desfazer}` desfaz por 24 h.",
      en: "Puts Judy back to **factory settings** on this server: automod (all off), punishment, log channel, welcome/goodbye, autorole, staff and access, disabled commands, XP/TTS/ticket/AI settings, rules and FAQ, and the language (English).\n\n**Stays:** members' XP levels, warnings, balances, RPG characters, reaction roles, webhooks, RSS feeds, open tickets and the global ban list.\n\nThree steps: `{&reset}` shows what changes and gives a code; `{&reset.confirmar} <code>` (within 2 min, same person) applies it; `{&reset.desfazer}` reverts it for 24 h.",
      es: "Devuelve a Judy a la **configuración de fábrica** en este servidor: automod (todo apagado), sanciones, canal de log, bienvenida/despedida, rol automático, staff y acceso, comandos desactivados, ajustes de XP/TTS/tickets/IA, reglas y FAQ, y el idioma (inglés).\n\n**Se mantiene:** los niveles de XP, las advertencias, los saldos, los personajes de rol, los roles por reacción, los webhooks, los feeds RSS, los tickets abiertos y la lista global de bans.\n\nEn tres pasos: `{&reset}` muestra lo que cambia y da un código; `{&reset.confirmar} <código>` (en menos de 2 min, la misma persona) lo aplica; `{&reset.desfazer}` lo deshace durante 24 h.",
    },
    ex: "{&reset}",
  },
};
