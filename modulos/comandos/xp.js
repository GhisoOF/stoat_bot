// &xp — níveis por mensagem

export default {
  id: "xp",
  modulo: "../ferramentas/nivel.js",
  funcao: "cmdXp",
  nomes: { en: "xp" },
  apelidos: ["nivel", "level", "levels"],
  es: { nome: "xp", subcomandos: { sair: "salir", entrar: "entrar", cargo: "rol", canal: "canal", configurar: "configurar", cargos: "roles", criarcargos: "crearroles", criar: "crear", zerar: "reiniciar", multiplicador: "multiplicador", nivelmaximo: "nivelmaximo", intervalo: "intervalo", anuncio: "anuncio", sincronizar: "sincronizar", todos: "todos", voltar: "volver", aqui: "aqui" } },   // espanhol (etapa 4)
  subcomandos: {
    setup: "setup", config: "config", configurar: "configure", cargos: "roles",
    criarcargos: "createroles", criar: "create", reset: "reset", zerar: "wipe", top: "top",
    ranking: "ranking", rank: "rank", leaderboard: "leaderboard", multiplicador: "multiplier",
    nivelmaximo: "maxlevel", intervalo: "interval", canal: "channel",
    anuncio: ["announce", "announcement"], sincronizar: ["sync", "resync", "restore"],
    todos: "all",
    sair: ["leave", "optout", "opt-out"], entrar: "join",   // privacidade P3: cada membro escolhe se o XP conta
    cargo: "role", voltar: "back",   // P2 (31 out 2026)
  },
  aninhados: ["setup", "config", "configurar", "sincronizar"],
  naTela: { aqui: "here" },
  gerenciavel: true,
  // P2 (31 out 2026): na ajuda, só `&xp`, `top`, `cargo`, `canal`. O resto (setup,
  // cargos, criarcargos, sincronizar, reset, rank, sair/entrar, on/off) continua
  // funcionando como apelido; ligar e desligar mora no `&config`, sair e voltar no `&privacidade`.
  ajuda: {
    grupo: "diversao",
    perm: { pt: "todo mundo (cargo e canal: ManagePermissions)", en: "everyone (role and channel: ManagePermissions)", es: "todos (rol y canal: ManagePermissions)" },
    uso: { pt: "{&xp} [@pessoa|top] | cargo <nível> <@cargo|off> | canal <#canal|aqui|off>", en: "{&xp} [@user|top] | role <level> <@role|off> | channel <#channel|here|off>", es: "{&xp} [@usuario|top] | rol <nivel> <@rol|off> | canal <#canal|aquí|off>" },
    desc: {
      pt: "Níveis por mensagem, **de cada servidor**. Cada mensagem dá XP (com espera entre uma e outra); juntando XP, sobe de nível.\n\n`{&xp}` — o seu nível · `{&xp} @pessoa` — o de alguém · `{&xp.top}` — o ranking\n\n**Staff** *(ManagePermissions)*: `{&xp.cargo} 10 @Veterano` — quem chega ao nível 10 ganha o cargo (os cargos se acumulam) · `{&xp.canal} #níveis` — onde anunciar quem sobe.\n\nLigar e desligar: `{&config}`. Sair do XP (apaga o seu): `{&privacidade}`.",
      en: "Message-based levels, **per server**. Each message gives XP (with a wait between them); enough XP levels you up.\n\n`{&xp}` — your level · `{&xp} @user` — someone else's · `{&xp.top}` — the ranking\n\n**Staff** *(ManagePermissions)*: `{&xp.cargo} 10 @Veteran` — reaching level 10 grants the role (roles stack) · `{&xp.canal} #levels` — where level-ups are announced.\n\nTurning it on and off: `{&config}`. Leaving XP (erases yours): `{&privacidade}`.",
      es: "Niveles por mensaje, **de cada servidor**. Cada mensaje da XP (con espera entre uno y otro); juntando XP, subes de nivel.\n\n`{&xp}` — tu nivel · `{&xp} @usuario` — el de alguien · `{&xp.top}` — el ranking\n\n**Staff** *(ManagePermissions)*: `{&xp.cargo} 10 @Veterano` — quien llega al nivel 10 gana el rol (los roles se acumulan) · `{&xp.canal} #niveles` — dónde anunciar quién sube.\n\nActivar y desactivar: `{&config}`. Salir del XP (borra el tuyo): `{&privacidade}`.",
    },
    ex: "{&xp.top}",
    parametros: [
      { nome: { pt: "(nada)", en: "(nothing)", es: "(nada)" }, valor: { pt: "[@pessoa]", en: "[@user]", es: "[@usuario]" }, desc: { pt: "nível, XP e progresso", en: "level, XP and progress", es: "nivel, XP y progreso" } },
      { nome: "top", desc: { pt: "ranking do servidor", en: "server ranking", es: "ranking del servidor" } },
      { nome: { pt: "cargo", en: "role", es: "rol" }, valor: { pt: "<nível> <@cargo|off>", en: "<level> <@role|off>", es: "<nivel> <@rol|off>" }, desc: { pt: "o cargo de um nível; sem nada, a lista *(ManagePermissions)*", en: "a level's role; with nothing, the list *(ManagePermissions)*", es: "el rol de un nivel; sin nada, la lista *(ManagePermissions)*" } },
      { nome: { pt: "canal", en: "channel", es: "canal" }, valor: { pt: "<#canal|aqui|off>", en: "<#channel|here|off>", es: "<#canal|aquí|off>" }, desc: { pt: "onde anunciar quem sobe de nível *(ManagePermissions)*", en: "where to announce level-ups *(ManagePermissions)*", es: "dónde anunciar quién sube de nivel *(ManagePermissions)*" } },
    ],
  },
};
