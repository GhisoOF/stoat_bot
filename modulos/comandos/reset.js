// &reset — configuração de fábrica do servidor (dono do servidor e dono do bot)

export default {
  id: "reset",
  modulo: "../moderacao/reset.js",
  funcao: "cmdReset",
  apelidos: ["resetar", "redefinir", "factoryreset", "fabrica"],
  es: { nome: "reset" },   // espanhol (etapa 4)
  ajuda: {
    perm: { pt: "dono do servidor (ou o dono do bot)", en: "server owner (or the bot owner)", es: "el dueño del servidor (o el dueño del bot)" },
    uso: {
      pt: "{&reset} · {&reset} confirm <código> · {&reset} undo",
      en: "{&reset} · {&reset} confirm <code> · {&reset} undo",
      es: "{&reset} · {&reset} confirm <código> · {&reset} undo",
    },
    desc: {
      pt: "Volta a Judy à **configuração de fábrica** neste servidor: automod (tudo desligado), punição, canal de log, boas-vindas/adeus, cargo automático, staff e acesso, comandos desativados, ajustes de XP/TTS/tickets/IA, regras e FAQ, e o idioma (inglês).\n\n**Fica:** níveis de XP, avisos, saldos, personagens do RPG, cargos por reação, webhooks, feeds RSS, tickets abertos e a lista global de bans.\n\nEm três passos: `{&reset}` mostra o que muda e dá um código; `{&reset} confirm <código>` (em até 2 min, a mesma pessoa) aplica; `{&reset} undo` desfaz por 24 h.",
      en: "Puts Judy back to **factory settings** on this server: automod (all off), punishment, log channel, welcome/goodbye, autorole, staff and access, disabled commands, XP/TTS/ticket/AI settings, rules and FAQ, and the language (English).\n\n**Stays:** members' XP levels, warnings, balances, RPG characters, reaction roles, webhooks, RSS feeds, open tickets and the global ban list.\n\nThree steps: `{&reset}` shows what changes and gives a code; `{&reset} confirm <code>` (within 2 min, same person) applies it; `{&reset} undo` reverts it for 24 h.",
      es: "Devuelve a Judy a la **configuración de fábrica** en este servidor: automod (todo apagado), sanciones, canal de log, bienvenida/despedida, rol automático, staff y acceso, comandos desactivados, ajustes de XP/TTS/tickets/IA, reglas y FAQ, y el idioma (inglés).\n\n**Se mantiene:** los niveles de XP, las advertencias, los saldos, los personajes de rol, los roles por reacción, los webhooks, los feeds RSS, los tickets abiertos y la lista global de bans.\n\nEn tres pasos: `{&reset}` muestra lo que cambia y da un código; `{&reset} confirm <código>` (en menos de 2 min, la misma persona) lo aplica; `{&reset} undo` lo deshace durante 24 h.",
    },
    ex: "{&reset}",
  },
};
