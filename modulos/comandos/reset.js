// &reset — configuração de fábrica do servidor (dono do servidor e dono do bot)

export default {
  id: "reset",
  modulo: "../moderacao/reset.js",
  funcao: "cmdReset",
  apelidos: ["resetar", "redefinir", "factoryreset", "fabrica"],
  ajuda: {
    perm: { pt: "dono do servidor (ou o dono do bot)", en: "server owner (or the bot owner)" },
    uso: {
      pt: "{&reset} · {&reset} confirm <código> · {&reset} undo",
      en: "{&reset} · {&reset} confirm <code> · {&reset} undo",
    },
    desc: {
      pt: "Volta a Judy à **configuração de fábrica** neste servidor: automod (tudo desligado), punição, canal de log, boas-vindas/adeus, cargo automático, staff e acesso, comandos desativados, ajustes de XP/TTS/tickets/IA, regras e FAQ, e o idioma (inglês).\n\n**Fica:** níveis de XP, avisos, saldos, personagens do RPG, cargos por reação, webhooks, feeds RSS, tickets abertos e a lista global de bans.\n\nEm três passos: `{&reset}` mostra o que muda e dá um código; `{&reset} confirm <código>` (em até 2 min, a mesma pessoa) aplica; `{&reset} undo` desfaz por 24 h.",
      en: "Puts Judy back to **factory settings** on this server: automod (all off), punishment, log channel, welcome/goodbye, autorole, staff and access, disabled commands, XP/TTS/ticket/AI settings, rules and FAQ, and the language (English).\n\n**Stays:** members' XP levels, warnings, balances, RPG characters, reaction roles, webhooks, RSS feeds, open tickets and the global ban list.\n\nThree steps: `{&reset}` shows what changes and gives a code; `{&reset} confirm <code>` (within 2 min, same person) applies it; `{&reset} undo` reverts it for 24 h.",
    },
    ex: "{&reset}",
  },
};
