// &debug — diagnóstico do bot neste servidor

export default {
  id: "debug",
  modulo: "../moderacao/debug-comando.js",
  funcao: "cmdDebug",
  apelidos: ["diagnostico", "diagnóstico"],
  es: { nome: "debug", subcomandos: { canais: "canales", permissoes: "permisos", cru: "crudo", mudo: "mudo", ler: "leer" } },
  // os nomes antigos (canais, permissoes, silence…) caem no relatório completo
  subcomandos: {
    canais: "channels", permissoes: "permissions", cru: "raw", silence: "silence", mudo: "mute",
    ler: "read",
  },
  aninhados: ["canais", "permissoes", "silence", "mudo"],
  essencial: true,
  qualquerCanal: true,
  ajuda: {
    grupo: "diagnostico",
    perm: "ManagePermissions",
    uso: { pt: "{&debug} [@pessoa | #canal]", en: "{&debug} [@user | #channel]", es: "{&debug} [@usuario | #canal]" },
    desc: {
      pt: "O diagnóstico do bot neste servidor.\n\n`{&debug}` — o relatório: primeiro o que está quebrado e como resolver; depois permissões, hierarquia, canais configurados, moderação, a punição de cada módulo (falta de TimeoutMembers/KickMembers/BanMembers), webhooks, RSS, RPG, voz e IA.\n`{&debug} @pessoa` — o que o bot consegue fazer com essa pessoa\n`{&debug} #canal` — a conta de permissão do bot nesse canal",
      en: "The bot's diagnostics on this server.\n\n`{&debug}` — the report: first what's broken and how to fix it; then permissions, hierarchy, configured channels, moderation, each module's punishment (missing TimeoutMembers/KickMembers/BanMembers), webhooks, RSS, RPG, voice and AI.\n`{&debug} @user` — what the bot can do with that person\n`{&debug} #channel` — the bot's permission math in that channel",
      es: "El diagnóstico del bot en este servidor.\n\n`{&debug}` — el informe: primero lo que está roto y cómo arreglarlo; después permisos, jerarquía, canales configurados, moderación, el castigo de cada módulo (falta de TimeoutMembers/KickMembers/BanMembers), webhooks, RSS, RPG, voz e IA.\n`{&debug} @usuario` — lo que el bot puede hacer con esa persona\n`{&debug} #canal` — la cuenta de permisos del bot en ese canal",
    },
    ex: "{&debug}",
    paginas: {
      ler: {
        titulo: { pt: "debug ler", en: "debug read", es: "debug leer" },
        texto: {
          pt: "🔴 **problema** — algo em uso que não funciona; aparece no topo, com o que fazer\n🟡 **aviso** — funciona, mas vale olhar\n🟢 **ok** · ▫️ **informação**",
          en: "🔴 **problem** — something in use that doesn't work; listed at the top, with what to do\n🟡 **warning** — works, but worth a look\n🟢 **ok** · ▫️ **info**",
          es: "🔴 **problema** — algo en uso que no funciona; aparece arriba, con qué hacer\n🟡 **aviso** — funciona, pero vale la pena mirarlo\n🟢 **ok** · ▫️ **info**",
        },
      },
    },
  },
};
