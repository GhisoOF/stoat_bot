// &xp — níveis por mensagem

export default {
  id: "xp",
  modulo: "../ferramentas/nivel.js",
  funcao: "cmdXp",
  nomes: { en: "xp" },
  apelidos: ["nivel", "level", "levels"],
  es: { nome: "xp", subcomandos: { sair: "salir", entrar: "entrar" } },   // espanhol (etapa 4)
  subcomandos: {
    setup: "setup", config: "config", configurar: "configure", cargos: "roles",
    criarcargos: "createroles", criar: "create", reset: "reset", zerar: "wipe", top: "top",
    ranking: "ranking", rank: "rank", leaderboard: "leaderboard", multiplicador: "multiplier",
    nivelmaximo: "maxlevel", intervalo: "interval", canal: "channel",
    anuncio: ["announce", "announcement"], sincronizar: ["sync", "resync", "restore"],
    todos: "all",
    sair: ["leave", "optout", "opt-out"], entrar: "join",   // privacidade P3: cada membro escolhe se o XP conta
  },
  aninhados: ["setup", "config", "configurar", "sincronizar"],
  naTela: { aqui: "here" },
  gerenciavel: true,
  ajuda: {
    perm: { pt: "ManagePermissions (para configurar)", en: "ManagePermissions (to configure)", es: "ManagePermissions (para configurar)" },
    uso: { pt: "{&xp} [rank|top|sair|entrar|setup|cargos|criarcargos|sincronizar|on|off]", en: "{&xp} [rank|top|leave|join|setup|roles|createroles|sync|on|off]", es: "{&xp} [rank|top|salir|entrar|setup|roles|createroles|sync|on|off]" },
    desc: { pt: "Sistema de níveis por XP de mensagens. Cada mensagem dá XP (com cooldown), e ao juntar XP você sobe de nível. A cada N níveis pode ganhar um cargo, e os anteriores continuam — eles se acumulam.\n\n`top` mostra o ranking · `setup` configura dificuldade, nível máximo e intervalo de cargos.\n\n**Cada membro escolhe:** ao ligar o XP, a Judy avisa o servidor; `sair` apaga o seu XP e ele para de contar, `entrar` volta (do zero).\n\n**Quem sai perde os cargos, não o XP.** Cargo é do membro: quem sai deixa de ser membro e o Stoat os retira. O XP fica guardado. Quem **entra** recebe os cargos de volta sozinho; para quem já tinha voltado antes disso, `{&xp.sincronizar} [@pessoa]` devolve tudo que o nível atual garante _(veja `{&help.xp} sincronizar`)_.\n\n(XP por call não é suportado pelo Stoat.)", en: "Message-XP leveling system. Each message grants XP (with a cooldown), and enough XP levels you up. Every N levels you can earn a role, and the earlier ones stay — they stack.\n\n`top` shows the ranking · `setup` configures difficulty, level cap and role interval.\n\n**Each member chooses:** when XP is turned on, Judy tells the server; `leave` erases your XP and it stops counting, `join` brings you back (from zero).\n\n**Leaving costs the roles, not the XP.** A role belongs to the member: leaving means no longer being one, so Stoat removes them. The XP stays. Whoever **joins** gets the roles back automatically; for those who returned before that, `{&xp.sincronizar} [@user]` hands back everything the current level grants _(see `{&help} levels sync`)_.\n\n(Voice-call XP isn't supported by Stoat.)", es: "Sistema de niveles por XP de mensajes. Cada mensaje da XP (con cooldown), y al juntar XP subes de nivel. Cada N niveles puedes ganar un rol, y los anteriores se quedan — se acumulan.\n\n`top` muestra el ranking · `setup` configura la dificultad, el nivel máximo y el intervalo de roles.\n\n**Cada miembro elige:** al activar el XP, Judy avisa al servidor; `salir` borra tu XP y deja de contar, `entrar` te vuelve a incluir (desde cero).\n\n**Quien sale pierde los roles, no el XP.** El rol es del miembro: quien sale deja de ser miembro y Stoat se los quita. El XP queda guardado. Quien **entra** recupera los roles automáticamente; para quien ya había vuelto antes de eso, `{&xp.sincronizar} [@usuario]` devuelve todo lo que garantiza el nivel actual _(mira `{&help.xp} sync`)_.\n\n(Stoat no admite XP por llamada de voz.)" },
    ex: "{&xp.top}",
    parametros: [
      { nome: { pt: "(nada) | rank", en: "(nothing) | rank", es: "(nada) | rank" }, valor: { pt: "[@pessoa]", en: "[@user]", es: "[@usuario]" }, desc: { pt: "nível, XP e progresso", en: "level, XP and progress", es: "nivel, XP y progreso" } },
      { nome: "top", desc: { pt: "ranking do servidor", en: "server ranking", es: "ranking del servidor" } },
      { nome: "on | off", desc: { pt: "liga/desliga o sistema", en: "toggles the system", es: "activa o desactiva el sistema" } },
      { nome: "setup", desc: { pt: "abre a configuração: a cada quantos níveis dá cargo, multiplicador, nível máximo, canal de anúncio", en: "opens the configuration: roles every N levels, multiplier, max level, announcement channel", es: "abre la configuración: cada cuántos niveles se da un rol, multiplicador, nivel máximo, canal de anuncios" } },
      { nome: { pt: "setup multiplicador", en: "setup multiplier", es: "setup multiplier" }, valor: "<n>", desc: { pt: "XP por mensagem × n", en: "XP per message × n", es: "XP por mensaje × n" } },
      { nome: { pt: "setup intervalo", en: "setup interval", es: "setup interval" }, valor: { pt: "<segundos>", en: "<seconds>", es: "<segundos>" }, desc: { pt: "tempo mínimo entre duas mensagens que dão XP (anti-farm)", en: "minimum time between two XP-giving messages (anti-farm)", es: "tiempo mínimo entre dos mensajes que dan XP (anti-farm)" } },
      { nome: { pt: "setup nivelmaximo", en: "setup maxlevel", es: "setup maxlevel" }, valor: "<n>", desc: { pt: "teto de nível", en: "level cap", es: "tope de nivel" } },
      { nome: { pt: "setup anuncio", en: "setup announce", es: "setup announce" }, valor: { pt: "<#canal|aqui|off>", en: "<#channel|here|off>", es: "<#canal|aqui|off>" }, desc: { pt: "onde anunciar quem subiu de nível", en: "where to announce level-ups", es: "dónde anunciar quién subió de nivel" } },
      { nome: { pt: "cargos", en: "roles", es: "roles" }, desc: { pt: "lista os cargos por nível", en: "lists the level roles", es: "lista los roles por nivel" } },
      { nome: { pt: "criarcargos", en: "createroles", es: "createroles" }, desc: { pt: "cria os cargos de nível sozinho", en: "creates the level roles by itself", es: "crea los roles de nivel automáticamente" } },
      { nome: { pt: "sincronizar", en: "sync", es: "sync" }, valor: { pt: "[@pessoa|todos]", en: "[@user|all]", es: "[@usuario|all]" }, desc: { pt: "devolve os cargos que o nível já garante — para quem saiu e voltou, ou quando os cargos foram criados depois *(ManagePermissions)*", en: "hands back the roles the current level already grants — for people who left and came back, or when the roles were created later *(ManagePermissions)*", es: "devuelve los roles que el nivel ya garantiza — para quien salió y volvió, o cuando los roles se crearon después *(ManagePermissions)*" } },
      { nome: "reset", valor: { pt: "confirmar", en: "confirm", es: "confirm" }, desc: { pt: "zera o XP de **todos** do servidor", en: "wipes **everyone's** XP on the server", es: "pone a cero el XP de **todos** en el servidor" } },
    ],
  },
};
