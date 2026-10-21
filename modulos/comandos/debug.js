// &debug — diagnóstico de permissões, canais e voz

export default {
  id: "debug",
  modulo: "../moderacao/debug-comando.js",
  funcao: "cmdDebug",
  apelidos: ["diagnostico", "diagnóstico"],
  es: { nome: "debug" },   // espanhol (etapa 4)
  subcomandos: {
    canais: "channels", permissoes: "permissions", cru: "raw", silence: "silence", mudo: "mute",
    ler: "read",
  },
  aninhados: ["canais", "permissoes", "silence", "mudo"],
  essencial: true,
  qualquerCanal: true,
  ajuda: {
    perm: "ManagePermissions",
    uso: { pt: "{&debug} [@pessoa | #canal]", en: "{&debug} [@user | #channel]", es: "{&debug} [@usuario | #canal]" },
    desc: { pt: "O diagnóstico do bot neste servidor, numa mensagem só.\n\n`{&debug}` — **o relatório completo**: primeiro o que está quebrado e como resolver; depois permissões do bot, hierarquia de cargos, canais configurados, todos os canais, moderação, voz e IA (e os erros recentes, para o dono do bot)\n`{&debug} @pessoa` — o que o bot consegue fazer com essa pessoa: punir, silenciar, dar os cargos de nível\n`{&debug} #canal` — a conta de permissão do bot nesse canal, cargo por cargo (aceita o nome do canal)\n\n`{&help} debug ler` explica os ícones.", en: "The bot's diagnostics on this server, in one message.\n\n`{&debug}` — **the full report**: first what's broken and how to fix it; then the bot's permissions, role hierarchy, configured channels, every channel, moderation, voice and AI (and recent errors, for the bot owner)\n`{&debug} @user` — what the bot can do with that person: punish, time out, give level roles\n`{&debug} #channel` — the bot's permission math in that channel, role by role (the channel name works too)\n\n`{&help} debug read` explains the icons.", es: "El diagnóstico del bot en este servidor, en un solo mensaje.\n\n`{&debug}` — **el informe completo**: primero lo que está roto y cómo arreglarlo; después los permisos del bot, la jerarquía de roles, los canales configurados, todos los canales, moderación, voz e IA (y los errores recientes, para el dueño del bot)\n`{&debug} @usuario` — lo que el bot puede hacer con esa persona: sancionar, silenciar, dar los roles de nivel\n`{&debug} #canal` — la cuenta de permisos del bot en ese canal, rol por rol (acepta el nombre del canal)\n\n`{&help} debug read` explica los íconos." },
    ex: "{&debug}",
    parametros: [
      { nome: { pt: "(nada)", en: "(nothing)", es: "(nada)" }, desc: { pt: "o relatório completo: o que está quebrado primeiro, depois cada área", en: "the full report: what's broken first, then each area", es: "el informe completo: primero lo que está roto, después cada área" } },
      { nome: { pt: "@pessoa", en: "@user", es: "@usuario" }, desc: { pt: "o que o bot consegue fazer com essa pessoa", en: "what the bot can do with that person", es: "lo que el bot puede hacer con esa persona" } },
      { nome: { pt: "#canal", en: "#channel", es: "#canal" }, desc: { pt: "a conta de permissão do bot nesse canal (aceita o nome)", en: "the bot's permission math in that channel (the name works too)", es: "la cuenta de permisos del bot en ese canal (acepta el nombre)" } },
    ],
  },
};
