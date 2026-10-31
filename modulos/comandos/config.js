// &config — tudo o que o servidor configura num lugar só (P2, 31 out 2026).
//
// Absorveu quatro comandos, que viraram PARTES dele (e os nomes antigos, atalhos):
//   &config log …      (era &log)       · &config idioma …  (era &idioma)
//   &config acesso …   (era &acesso)    · &config comando … (era &comando)
// `&log canal #x` continua valendo: é o atalho de `&config log canal #x`.
// A tela do `&config` sozinho sai do `padraoServidor` (config-store.js), chave por chave.

export default {
  id: "config",
  modulo: "../moderacao/config-comando.js",
  funcao: "cmdConfig",
  nomes: { en: "config" },
  apelidos: ["configuracoes", "configurações", "settings", "configuracion", "configuración", "ajustes"],
  es: { nome: "config", subcomandos: { log: "log", idioma: "idioma", acesso: "acceso", comando: "comando", ia: "ia" } },
  subcomandos: { log: "log", idioma: ["language", "lang"], acesso: "access", comando: ["command", "commands"], ia: ["ai"] },
  familias: {
    log: {
      subcomandos: {
        here: "here", off: "off", canal: "channel", punicoes: "punishments", membros: "members",
        mensagens: "messages", cargos: "roles", comandos: "commands", eventos: "events",
        relatorio: "report",
        atualizacoes: "updates",   // (P2) não liga nem desliga mais nada: as novidades vão sempre ao log
      },
      naTela: { aqui: "here" },
      es: { subcomandos: { here: "aqui", canal: "canal", punicoes: "sanciones", membros: "miembros", mensagens: "mensajes", cargos: "roles", comandos: "comandos", off: "off", eventos: "eventos", relatorio: "informe", atualizacoes: "actualizaciones", aqui: "aqui" } },
    },
    idioma: {
      subcomandos: { portugues: "portuguese", english: "english", status: "status" },
      es: { subcomandos: { portugues: "portugues", english: "ingles", status: "estado" } },
    },
    acesso: {
      subcomandos: {
        cargo: "role", cargos: "roles", staff: "staff", canal: "channel", canais: "channels",
        todos: "all", somente: "only", exceto: "except", add: "add", remove: "remove",
        limpar: "clear", staffignora: ["staffignores", "staffbypass"], status: "status",
        livre: "free",
      },
      aninhados: ["cargo", "cargos", "staff", "canal", "canais"],
      es: { subcomandos: { livre: "libre", cargo: "rol", cargos: "roles", canal: "canal", canais: "canales", todos: "todos", somente: "solo", exceto: "excepto", limpar: "limpiar", status: "estado", staffignora: "staffignora", add: "add", remove: "remove" } },
    },
    // (P2, área da IA) a Judy neste servidor: o handler é o cmdConfigIA (modulos/ai/conversa-config.js)
    ia: {
      subcomandos: { chat: "chat", imagem: ["image", "images"], livre: "free", modo: "mode", todas: ["every", "all"], relevante: "relevant", comentar: "comment", aqui: "here", pordia: "perday", status: "status" },
      es: { subcomandos: { chat: "chat", imagem: "imagen", livre: "libre", modo: "modo", todas: "todas", relevante: "relevante", comentar: "comentar", aqui: "aquí", pordia: "pordía", status: "estado" } },
    },
    comando: {
      // (P2) `on`/`off` não entram aqui: no &config eles são valor (`relatorio on`); o handler já aceita os dois
      subcomandos: { desativar: "disable", ativar: "enable", list: "list", gerenciar: "manage" },
      es: { subcomandos: { desativar: "desactivar", ativar: "activar", list: "lista", gerenciar: "gestionar" } },
    },
  },
  // os comandos que viraram partes: o nome antigo leva à parte (com o que vier depois)
  atalhos: {
    "log|logs": "config log",
    "idioma|language|lang": "config idioma",
    "acesso|access|acceso": "config acesso",
    "comando|command|comandos|commands": "config comando",
    // o liga/desliga da IA que morava no &chat (pedido da área da IA)
    "chat|ia on|ligar|activar|enable": "config ia chat on",
    "chat|ia off|desligar|desactivar|disable": "config ia chat off",
    "chat|ia imagem|image|imagen": "config ia imagem",
    "chat|ia livre|free|libre": "config ia livre",
    "chat|ia comentar|comment|comentario|comentário|espontaneo|espontâneo": "config ia comentar",
  },
  // ninguém se tranca fora: o &config (e o idioma, o acesso e o liga/desliga de comandos
  // que moram nele) nunca é desligado e vale em qualquer canal
  essencial: true,
  qualquerCanal: true,
  ajuda: {
    grupo: "comecar",
    perm: { pt: "ManagePermissions (para mudar; o idioma qualquer um vê)", en: "ManagePermissions (to change; anyone can see the language)", es: "ManagePermissions (para cambiar; el idioma lo ve cualquiera)" },
    uso: { pt: "{&config} [log|idioma|acesso|comando|ia …]", en: "{&config} [log|language|access|command|ai …]", es: "{&config} [log|idioma|acceso|comando|ia …]" },
    resumo: { pt: "tudo o que este servidor configura, num lugar só", en: "everything this server configures, in one place", es: "todo lo que configura este servidor, en un solo lugar" },
    desc: {
      pt: "Sozinho, mostra **todas** as configurações do servidor, uma por linha.\n\n`{&config.log}` — o canal de log e os eventos\n`{&config.idioma} pt|en|es` — o idioma do bot aqui\n`{&config.acesso}` — onde os comandos funcionam\n`{&config.comando}` — liga e desliga comandos\n`{&config.ia}` — a Judy neste servidor: conversa, imagem, conversa livre, comentários",
      en: "On its own, shows **all** of the server's settings, one per line.\n\n`{&config.log}` — the log channel and its events\n`{&config.idioma} pt|en|es` — the bot's language here\n`{&config.acesso}` — where commands work\n`{&config.comando}` — turns commands on and off\n`{&config.ia}` — Judy on this server: chat, images, free chat, comments",
      es: "Solo, muestra **toda** la configuración del servidor, una por línea.\n\n`{&config.log}` — el canal de registro y sus eventos\n`{&config.idioma} pt|en|es` — el idioma del bot aquí\n`{&config.acesso}` — dónde funcionan los comandos\n`{&config.comando}` — activa y desactiva comandos\n`{&config.ia}` — Judy en este servidor: conversación, imágenes, conversación libre, comentarios",
    },
    ex: "{&config.log.canal} #logs",
    paginas: {
      log: {
        titulo: { pt: "config log", en: "config log", es: "config log" },
        texto: {
          pt: "O canal onde o bot registra o que aconteceu (um canal que só a staff vê).\n\n`{&config.log.canal} <#canal|aqui|id>` — define o canal\n`{&config.log.off}` — desliga o registro\n`{&config.log} <evento> on|off` — liga ou desliga um evento\n`{&config.log.relatorio} on|off` — relatório **anônimo** de ataques ao dono da Judy (começa desligado)\n\n**Eventos:** `punicoes` · `membros` (entrou/saiu) · `mensagens` (apagadas/editadas) · `cargos` · `comandos` (barulhento, começa desligado).\nAs **novidades da Judy** vão sempre a este canal.",
          en: "The channel where the bot records what happened (a staff-only channel).\n\n`{&config.log.canal} <#channel|here|id>` — sets the channel\n`{&config.log.off}` — turns logging off\n`{&config.log} <event> on|off` — toggles one event\n`{&config.log.relatorio} on|off` — an **anonymous** attack report to Judy's owner (starts off)\n\n**Events:** `punishments` · `members` (joined/left) · `messages` (deleted/edited) · `roles` · `commands` (noisy, starts off).\n**Judy's news** always goes to this channel.",
          es: "El canal donde el bot registra lo que pasó (un canal que solo ve el staff).\n\n`{&config.log.canal} <#canal|aqui|id>` — define el canal\n`{&config.log.off}` — apaga el registro\n`{&config.log} <evento> on|off` — activa o desactiva un evento\n`{&config.log.relatorio} on|off` — informe **anónimo** de ataques al dueño de Judy (empieza desactivado)\n\n**Eventos:** `sanciones` · `miembros` (entradas/salidas) · `mensajes` (borrados/editados) · `roles` · `comandos` (ruidoso, empieza apagado).\nLas **novedades de Judy** van siempre a este canal.",
        },
      },
      idioma: {
        titulo: { pt: "config idioma", en: "config language", es: "config idioma" },
        texto: {
          pt: "O idioma em que o bot responde **neste servidor**: `pt`, `en` ou `es`. Sozinho, mostra o atual (qualquer um vê; mudar pede ManagePermissions).\n\n`{&config.idioma} pt` · `{&config.idioma} en` · `{&config.idioma} es`\n\nServidor novo começa em inglês.",
          en: "The language the bot replies in **on this server**: `pt`, `en` or `es`. On its own, shows the current one (anyone can see it; changing needs ManagePermissions).\n\n`{&config.idioma} en` · `{&config.idioma} pt` · `{&config.idioma} es`\n\nA new server starts in English.",
          es: "El idioma en que responde el bot **en este servidor**: `pt`, `en` o `es`. Solo, muestra el actual (cualquiera lo ve; cambiarlo requiere ManagePermissions).\n\n`{&config.idioma} es` · `{&config.idioma} en` · `{&config.idioma} pt`\n\nUn servidor nuevo empieza en inglés.",
        },
      },
      acesso: {
        titulo: { pt: "config acesso", en: "config access", es: "config acceso" },
        texto: {
          pt: "**Onde** os comandos funcionam. Quem é staff se define no `{&staff}`.\n\n`{&config.acesso.canal.todos}` — em qualquer canal (padrão)\n`{&config.acesso.canal.somente}` — **todos** os comandos de quem não é staff, só nos canais da lista\n`{&config.acesso.canal.exceto}` — em todos, menos os da lista\n`{&config.acesso.canal.add} [#canal]` · `{&config.acesso.canal.remove} [#canal]` · `{&config.acesso.canal.limpar}` — a lista\n`{&config.acesso.staffignora} on|off` — a staff escapa da restrição (padrão: sim)\n`{&config.acesso.livre} <comando> on|off` — um comando vale em qualquer canal (ex.: `entretenimento`)\n\n`{&help}`, `{&config}`, `{&debug}`, `{&tutorial}` e `{&privacidade}` funcionam sempre.",
          en: "**Where** commands work. Who is staff is set in `{&staff}`.\n\n`{&config.acesso.canal.todos}` — in any channel (default)\n`{&config.acesso.canal.somente}` — **every** command of non-staff, only in the listed channels\n`{&config.acesso.canal.exceto}` — everywhere except the listed ones\n`{&config.acesso.canal.add} [#channel]` · `{&config.acesso.canal.remove} [#channel]` · `{&config.acesso.canal.limpar}` — the list\n`{&config.acesso.staffignora} on|off` — staff bypasses the restriction (default: yes)\n`{&config.acesso.livre} <command> on|off` — one command works in any channel (e.g. `entertainment`)\n\n`{&help}`, `{&config}`, `{&debug}`, `{&tutorial}` and `{&privacidade}` always work.",
          es: "**Dónde** funcionan los comandos. Quién es staff se define en `{&staff}`.\n\n`{&config.acesso.canal.todos}` — en cualquier canal (predeterminado)\n`{&config.acesso.canal.somente}` — **todos** los comandos de quien no es staff, solo en los canales de la lista\n`{&config.acesso.canal.exceto}` — en todos, menos los de la lista\n`{&config.acesso.canal.add} [#canal]` · `{&config.acesso.canal.remove} [#canal]` · `{&config.acesso.canal.limpar}` — la lista\n`{&config.acesso.staffignora} on|off` — el staff se salta la restricción (predeterminado: sí)\n`{&config.acesso.livre} <comando> on|off` — un comando vale en cualquier canal (ej.: `entretenimiento`)\n\n`{&help}`, `{&config}`, `{&debug}`, `{&tutorial}` y `{&privacidade}` funcionan siempre.",
        },
      },
      ia: {
        titulo: { pt: "config ia", en: "config ai", es: "config ia" },
        // `&help chat` / `&help ia` (o &chat saiu): abrem esta página (ela cita o &privacidade para quem não é staff)
        apelidos: ["chat", "ia", "ai"],
        recurso: "ia",   // onde a IA não roda, a ajuda não mostra esta página (nem pelo `&help chat`)
        texto: {
          pt: "A Judy neste servidor (onde quem hospeda o bot liberou a IA). Começa desligada.\n\n`{&config.ia.chat} on|off` — ela conversa quando mencionada\n`{&config.ia.imagem} on|off` — gera imagens quando pedem\n`{&config.ia.livre} on|off|todas|relevante` — entra sozinha na conversa deste canal\n`{&config.ia.comentar} aqui|off|<1-20>` — comentários por iniciativa própria, até N por dia\n\nCada pessoa pode pedir que ela não fale com ela: `{&privacidade}`.",
          en: "Judy on this server (where whoever hosts the bot enabled the AI). Starts off.\n\n`{&config.ia.chat} on|off` — she chats when mentioned\n`{&config.ia.imagem} on|off` — generates images when asked\n`{&config.ia.livre} on|off|all|relevant` — joins this channel's conversation on her own\n`{&config.ia.comentar} here|off|<1-20>` — comments on her own initiative, up to N a day\n\nAnyone can ask her not to talk to them: `{&privacidade}`.",
          es: "Judy en este servidor (donde quien aloja el bot habilitó la IA). Empieza desactivada.\n\n`{&config.ia.chat} on|off` — conversa cuando la mencionan\n`{&config.ia.imagem} on|off` — genera imágenes cuando se lo piden\n`{&config.ia.livre} on|off|todas|relevante` — entra sola en la conversación de este canal\n`{&config.ia.comentar} aquí|off|<1-20>` — comentarios por iniciativa propia, hasta N por día\n\nCada persona puede pedir que no hable con ella: `{&privacidade}`.",
        },
      },
      comando: {
        titulo: { pt: "config comando", en: "config command", es: "config comando" },
        texto: {
          pt: "Liga e desliga comandos **neste servidor** (todos os apelidos juntos). Sozinho, lista o estado de cada um.\n\n`{&config.comando.desativar} <nome>` · `{&config.comando.ativar} <nome>`\n\n`help`, `config`, `debug` e `privacidade` nunca desligam.",
          en: "Turns commands on and off **on this server** (all their aliases together). On its own, lists each one's state.\n\n`{&config.comando.desativar} <name>` · `{&config.comando.ativar} <name>`\n\n`help`, `config`, `debug` and `privacy` never turn off.",
          es: "Activa y desactiva comandos **en este servidor** (todos sus alias juntos). Solo, lista el estado de cada uno.\n\n`{&config.comando.desativar} <nombre>` · `{&config.comando.ativar} <nombre>`\n\n`ayuda`, `config`, `debug` y `privacidad` nunca se desactivan.",
        },
      },
    },
  },
};
