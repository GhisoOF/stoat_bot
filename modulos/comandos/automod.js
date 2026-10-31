// &automod — os filtros automáticos: antispam, antiruido, antilink, sentinela

export default {
  id: "automod",
  modulo: "../moderacao/automod-comandos.js",
  funcao: "cmdAutomod",
  es: { nome: "automod", subcomandos: { antiruido: "antiruido", sentinela: "centinela", punicao: "castigo", herdar: "heredar", avisar: "advertir", apagar: "borrar", confirmar: "confirmar", acumular: "acumular", banir: "banear", mensagens: "mensajes", tempo: "tiempo", mencoes: "menciones", tamanho: "tamaño", limiar: "umbral", ignorar: "ignorar", repeticao: "repeticion", filtro: "filtro", aviso: "advertencia" } },   // espanhol (etapa 4)
  subcomandos: {
    antiruido: ["antinoise", "noise"], sentinela: "sentinel", punicao: "punishment",
    herdar: "inherit", global: "global", set: "set", status: "status", debug: "debug",
    avisar: "warn", apagar: "delete", confirmar: "confirm", acumular: "stack", banir: "ban",
    mensagens: "messages", tempo: "time", mencoes: "mentions", tamanho: "size",
    limiar: "threshold", ignorar: "ignore", repeticao: "repetition",
    // (P2) os termos próprios do servidor (eram `antiodio add|remover|lista`)
    filtro: ["filter", "filters", "words", "termos"],
  },
  // o nível seguinte também é traduzido depois destas palavras (as do &automod em inglês e
  // os nomes antigos dos filtros, que ainda funcionam)
  aninhados: [
    "anticaps", "anticaracteres", "antiinvite", "antilink", "antimassmention",
    "antimassspam", "antinoise", "antirepeticao", "antiscam", "antispam", "ban",
    "confirm", "debug", "delete", "global", "ignore", "inherit", "mentions", "messages",
    "noise", "punishment", "repetition", "sentinel", "sentinela", "set", "size", "stack",
    "status", "threshold", "time", "warn",
  ],
  naTela: { aviso: "warn" },
  // os níveis dentro do &automod (`&automod sentinela assuntos …`): cada um com o seu vocabulário
  familias: {
    antispam: {
      es: { subcomandos: { velocidade: "velocidad", rajada: "rafaga", repeticao: "repeticion", midia: "multimedia", mencoes: "menciones", mensagens: "mensajes", tempo: "tiempo", minuto: "minuto", novato: "novato", vezes: "veces" } },
      subcomandos: {
        velocidade: "speed", rajada: "burst", repeticao: "repeat", midia: "media",
        mencoes: "mentions", mensagens: "messages", tempo: "time", minuto: "minute",
        novato: ["newcomer", "newcomers"], vezes: "times",
      },
      naTela: { repeticao: "repeat" },
    },
    antiruido: {
      es: { subcomandos: { caracteres: "caracteres", letras: "letras", tamanho: "tamaño", limiar: "umbral", repeticao: "repeticion", ignorar: "ignorar" } },
      subcomandos: {
        caracteres: "characters", letras: "letters", tamanho: "size", limiar: "threshold",
        repeticao: "repetition", ignorar: "ignore",
      },
    },
    antilink: {
      es: { subcomandos: { dominios: "dominios", convites: "invitaciones" } },
      subcomandos: { dominios: "domains", convites: "invites" },
    },
    sentinela: {
      es: { subcomandos: { conteudo: "contenido", odio: "odio", imagens: "imagenes", assuntos: "temas", sensibilidade: "sensibilidad", canal: "canal", testar: "probar", banir: "banear", liberar: "liberar", antiguidade: "antiguedad", alerta: "alertas", baixa: "baja", media: "media", alta: "alta", aqui: "aqui" } },
      subcomandos: {
        conteudo: "content", odio: "hate", imagens: "images",
        assuntos: ["topics", "subjects"], avatar: ["avatar", "pfp"],
        sensibilidade: "sensitivity", canal: "channel", testar: ["test", "simulate", "simular"],
        banir: "ban", liberar: "dismiss", config: "config", status: "status",
        antiguidade: "tenure", alerta: ["alerts", "alert"], baixa: "low", media: "medium",
        alta: "high",
      },
      naTela: { assuntos: "topics", aqui: "here" },
    },
    odio: {
      es: { subcomandos: { remover: "quitar", lista: "lista" } },
      subcomandos: { add: "add", remover: "remove", lista: "list" },
    },
    filtro: {
      es: { subcomandos: { remover: "quitar", lista: "lista" } },
      subcomandos: { add: "add", remover: ["remove", "tirar", "quitar"], lista: ["list", "ver"] },
    },
    assuntos: {
      es: { subcomandos: { politica: "politica", religiao: "religion", drogas: "drogas", alertar: "alertar", apagar: "borrar", punir: "castigar", baixa: "baja", media: "media", alta: "alta", sensibilidade: "sensibilidad", liberar: "permitir", vigiar: "vigilar", ia: "ia", remover: "quitar" } },
      subcomandos: {
        politica: "politics", religiao: "religion", drogas: "drugs", alertar: "alert",
        apagar: "delete", punir: "punish", baixa: "low", media: "medium", alta: "high",
        sensibilidade: "sensitivity", liberar: "allow", vigiar: "watch", ia: "ai",
        test: "test", add: "add", remover: "remove",
      },
    },
    avatar: {
      es: { subcomandos: { acao: "accion", tempo: "tiempo", checar: "revisar", alertar: "alertar", silenciar: "silenciar", expulsar: "expulsar", banir: "banear" } },
      subcomandos: {
        acao: "action", tempo: "time", checar: "check", alertar: "alert",
        silenciar: ["silence", "mute", "timeout"], expulsar: "kick", banir: "ban",
      },
    },
    punicao: {
      es: { subcomandos: { modo: "modo", escada: "escalera", aviso: "advertencia", validade: "validez" } },
      subcomandos: { modo: "mode", escada: ["ladder", "steps"] },
      naTela: { aviso: "warn", validade: "expiry" },
    },
  },
  gerenciavel: true,
  // as partes que também têm tabela própria, com o vocabulário de cada uma. Valem em
  // dois lugares: dentro do &automod, somadas à família de mesmo nome (`familia()` no
  // aliases.js); e no 2º termo de `&help <parte> …` (`&help punishment ladder`).
  // `&help punishment` sozinho abre a página da parte (o cmdHelp redireciona).
  // Não são comandos: `&punicao` e `&blocklist` respondem "comando desconhecido".
  partes: {
    punicao: {
      es: { subcomandos: { modo: "modo", escada: "escalera", cargo: "rol", avisar: "advertir", apagar: "borrar", confirmar: "confirmar", acumular: "acumular", banir: "banear", aviso: "advertencia", validade: "validez" } },
      en: "punishment",
      subcomandos: {
        modo: "mode", escada: ["ladder", "steps"], warns: "warns", cargo: "role",
        status: "status", config: "config", avisar: "warn", apagar: "delete",
        confirmar: "confirm", acumular: "stack", banir: "ban",
      },
      aninhados: ["mode", "modo"],
      naTela: { aviso: "warn", validade: "expiry" },
    },
    sentinela: {
      es: { subcomandos: { sensibilidade: "sensibilidad", canal: "canal", testar: "probar", banir: "banear", liberar: "liberar", antiguidade: "antiguedad", baixa: "baja", media: "media", alta: "alta" } },
      en: "sentinel",
      subcomandos: {
        sensibilidade: "sensitivity", canal: "channel", testar: ["test", "simulate", "simular"],
        banir: "ban", liberar: "dismiss", config: "config", status: "status",
        antiguidade: "tenure", baixa: "low", media: "medium", alta: "high",
      },
    },
    blocklist: {
      es: { subcomandos: { dominios: "dominios" } },
      subcomandos: {
        add: "add", remove: "remove", list: "list", clear: "clear", reload: "reload",
        adddomain: "adddomain", removedomain: "removedomain", dominios: "domains",
      },
    },
    whitelist: {
      subcomandos: { add: "add", remove: "remove", list: "list" },
    },
    scam: {
      es: { subcomandos: { sensibilidade: "sensibilidad", canal: "canal", testar: "probar", banir: "banear", liberar: "liberar", baixa: "baja", media: "media", alta: "alta" } },
      subcomandos: {
        sensibilidade: "sensitivity", canal: "channel", testar: ["test", "simulate", "simular"],
        banir: "ban", liberar: "dismiss", config: "config", status: "status", baixa: "low",
        media: "medium", alta: "high",
      },
    },
  },
  textoLivre: true,
  // (P2) os nomes antigos dos filtros e o &modia (saiu) levam ao caminho de hoje
  atalhos: {
    "automod antiodio": "automod sentinela odio", "automod antiemoji": "automod antiruido emoji",
    "automod antimidia": "automod antispam midia", "automod antimassspam": "automod antispam velocidade",
    "automod antiinvite": "automod antilink convites", "automod antimassmention": "automod antispam mencoes",
    "automod anticaps": "automod antiruido caps", "automod anticaracteres": "automod antiruido caracteres",
    "automod antiduplicata": "automod antispam repeticao", "automod antiimagem": "automod sentinela imagens",
    "automod antirepeticao": "automod antiruido letras", "automod antiassuntos": "automod sentinela assuntos",
    "automod antiavatar": "automod sentinela avatar", "automod antiscam": "automod sentinela conteudo",
    "modia|moderacaoia": "automod sentinela assuntos",
  },
  ajuda: {
    grupo: "proteger",
    perm: "ManagePermissions",
    uso: { pt: "{&automod} [on|off] | <grupo> [parte] on|off | filtro add <termo>", en: "{&automod} [on|off] | <group> [part] on|off | filter add <term>", es: "{&automod} [on|off] | <grupo> [parte] on|off | filter add <término>" },
    desc: {
      pt: "A moderação automática em quatro grupos, cada um com partes:\n\n🌊 `antispam` — `velocidade`, `repeticao`, `midia`, `mencoes`\n🔊 `antiruido` — `caps`, `caracteres`, `letras`, `emoji`\n🔗 `antilink` — `dominios`, `convites`\n🛡️ `sentinela` — `conteudo`, `odio`, `imagens`, `assuntos`, `avatar`\n\n`{&automod}` — o estado · `{&automod} on|off` — tudo\n`{&automod} <grupo> [parte] on|off` · `{&automod} <grupo> set <parâmetro> <valor>` · `{&automod} <grupo> punicao <modo|herdar>`\n`{&automod.filtro} add <termo>` · `{&automod.filtro.remover} <termo>` · `{&automod.filtro}` — os termos deste servidor (até 20, de 3 a 40 letras)\n`{&automod.punicao}` — a punição geral (avisar, apagar, confirmar, acumular, banir)",
      en: "Automatic moderation in four groups, each with parts:\n\n🌊 `antispam` — `velocidade`, `repeticao`, `midia`, `mencoes`\n🔊 `antiruido` — `caps`, `caracteres`, `letras`, `emoji`\n🔗 `antilink` — `dominios`, `convites`\n🛡️ `sentinela` — `conteudo`, `odio`, `imagens`, `assuntos`, `avatar`\n\n`{&automod}` — the state · `{&automod} on|off` — everything\n`{&automod} <group> [part] on|off` · `{&automod} <group> set <parameter> <value>` · `{&automod} <group> punicao <mode|inherit>`\n`{&automod.filtro} add <term>` · `{&automod.filtro.remover} <term>` · `{&automod.filtro}` — this server's terms (up to 20, 3 to 40 letters)\n`{&automod.punicao}` — the general punishment (warn, delete, confirm, stack, ban)",
      es: "La moderación automática en cuatro grupos, cada uno con partes:\n\n🌊 `antispam` — `velocidade`, `repeticao`, `midia`, `mencoes`\n🔊 `antiruido` — `caps`, `caracteres`, `letras`, `emoji`\n🔗 `antilink` — `dominios`, `convites`\n🛡️ `sentinela` — `conteudo`, `odio`, `imagens`, `assuntos`, `avatar`\n\n`{&automod}` — el estado · `{&automod} on|off` — todo\n`{&automod} <grupo> [parte] on|off` · `{&automod} <grupo> set <parámetro> <valor>` · `{&automod} <grupo> punicao <modo|inherit>`\n`{&automod.filtro} add <término>` · `{&automod.filtro.remover} <término>` · `{&automod.filtro}` — los términos de este servidor (hasta 20, de 3 a 40 letras)\n`{&automod.punicao}` — el castigo general (warn, delete, confirm, stack, ban)",
    },
    ex: { pt: "{&automod.filtro} add palavrao", en: "{&automod.filtro} add badword", es: "{&automod.filtro} add groseria" },
    paginas: {
      filtro: {
        titulo: {
          pt: "automod filtro",
          en: "automod filter",
          es: "automod filter",
        },
        texto: {
          pt: "`{&automod.filtro} add <termo>` · `{&automod.filtro.remover} <termo>` · `{&automod.filtro}` — a lista\n\nO termo casa como palavra inteira, sem diferenciar maiúscula, acento ou letra esticada (`otaaario` pega `otário`). No máximo 20 termos de 3 a 40 letras. Quem escreve um termo da lista recebe a punição do `odio`.",
          en: "`{&automod.filtro} add <term>` · `{&automod.filtro.remover} <term>` · `{&automod.filtro}` — the list\n\nThe term matches as a whole word, ignoring case, accents and stretched letters. At most 20 terms of 3 to 40 letters. Whoever writes a listed term gets the `odio` (hate) punishment.",
          es: "`{&automod.filtro} add <término>` · `{&automod.filtro.remover} <término>` · `{&automod.filtro}` — la lista\n\nEl término coincide como palabra entera, sin distinguir mayúsculas, tildes ni letras estiradas. Como máximo 20 términos de 3 a 40 letras. Quien escribe un término de la lista recibe el castigo de `odio` (hate).",
        },
      },
      sentinela: {
        titulo: {
          pt: "automod sentinela",
          en: "automod sentinel",
          es: "automod sentinel",
        },
        texto: {
          pt: "O grupo que **julga** o conteúdo (golpe, ódio, imagens, temas proibidos, perfil) com uma nota de 0 a 10, em vez de medir.\n\n`{&automod.sentinela}` — o estado\n`{&automod.sentinela.sensibilidade} baixa|media|alta` · `{&automod.sentinela.antiguidade} on|off` · `{&automod.sentinela.alerta} on|off` · `{&automod.sentinela.canal} <#canal>`\n`{&automod.sentinela.testar} <texto>` — a nota, sem punir\n`{&automod.sentinela.banir} <@pessoa>` = `{&ban}` · `{&automod.sentinela.liberar} <@pessoa>`\n`{&automod.sentinela.assuntos} <tema> off|alertar|apagar|punir` — política, religião, drogas, sexual\n`{&automod.sentinela.avatar} acao alertar|silenciar|expulsar|banir` — o perfil (foto, banner, bio, nome, status)",
          en: "The group that **judges** content (scams, hate, images, forbidden topics, profiles) with a 0–10 score instead of measuring.\n\n`{&automod.sentinela}` — the state\n`{&automod.sentinela.sensibilidade} low|medium|high` · `{&automod.sentinela.antiguidade} on|off` · `{&automod.sentinela.alerta} on|off` · `{&automod.sentinela.canal} <#channel>`\n`{&automod.sentinela.testar} <text>` — the score, without punishing\n`{&automod.sentinela.banir} <@user>` = `{&ban}` · `{&automod.sentinela.liberar} <@user>`\n`{&automod.sentinela.assuntos} <topic> off|alert|delete|punish` — politics, religion, drugs, sexual\n`{&automod.sentinela.avatar} action alert|silence|kick|ban` — the profile (picture, banner, bio, name, status)",
          es: "El grupo que **juzga** el contenido (estafas, odio, imágenes, temas prohibidos, perfil) con una nota de 0 a 10, en lugar de medir.\n\n`{&automod.sentinela}` — el estado\n`{&automod.sentinela.sensibilidade} low|medium|high` · `{&automod.sentinela.antiguidade} on|off` · `{&automod.sentinela.alerta} on|off` · `{&automod.sentinela.canal} <#canal>`\n`{&automod.sentinela.testar} <texto>` — la nota, sin castigar\n`{&automod.sentinela.banir} <@usuario>` = `{&ban}` · `{&automod.sentinela.liberar} <@usuario>`\n`{&automod.sentinela.assuntos} <tema> off|alert|delete|punish` — política, religión, drogas, sexual\n`{&automod.sentinela.avatar} action alert|silence|kick|ban` — el perfil (foto, banner, bio, nombre, estado)",
        },
        paginas: {
          sensibilidade: {
            titulo: {
              pt: "sentinela sensibilidade",
              en: "sentinel sensitivity",
              es: "sentinel sensitivity",
            },
            texto: {
              pt: "**Uso:** `{&automod.sentinela.sensibilidade} <baixa|media|alta>`\n\nDefine a partir de qual **nota (0–10)** o bot age sobre conteúdo suspeito:\n• 🟢 **baixa** (limiar 7,5) — só o que é quase certo; menos falsos positivos.\n• 🟡 **media** (limiar 6,5) — equilíbrio recomendado.\n• 🔴 **alta** (limiar 5,5) — pega indícios leves; protege mais, erra mais.",
              en: "**Usage:** `{&automod.sentinela.sensibilidade} <low|medium|high>`\n\nSets from which **score (0–10)** the bot acts on suspicious content:\n• 🟢 **low** (threshold 7.5) — only near-certain cases; fewer false positives.\n• 🟡 **medium** (threshold 6.5) — recommended balance.\n• 🔴 **high** (threshold 5.5) — catches faint signs; protects more, errs more.",
              es: "**Uso:** `{&automod.sentinela.sensibilidade} <low|medium|high>`\n\nDefine a partir de qué **nota (0–10)** el bot actúa sobre contenido sospechoso:\n• 🟢 **low** (umbral 7.5) — solo lo casi seguro; menos falsos positivos.\n• 🟡 **medium** (umbral 6.5) — el equilibrio recomendado.\n• 🔴 **high** (umbral 5.5) — capta indicios leves; protege más, se equivoca más.",
            },
          },
          testar: {
            titulo: {
              pt: "sentinela testar",
              en: "sentinel test",
              es: "sentinel test",
            },
            texto: {
              pt: "**Uso:** `{&automod.sentinela.testar} <texto>`\n\nSimula a análise de um texto e mostra a nota (0–10) e os sinais detectados, sem punir ninguém. Útil para calibrar a sensibilidade.",
              en: "**Usage:** `{&automod.sentinela.testar} <text>`\n\nSimulates analyzing a text and shows the score (0–10) and detected signals, without punishing anyone. Useful for calibrating the sensitivity.",
              es: "**Uso:** `{&automod.sentinela.testar} <texto>`\n\nSimula el análisis de un texto y muestra la nota (0–10) y las señales detectadas, sin castigar a nadie. Útil para calibrar la sensibilidad.",
            },
          },
          canal: {
            titulo: {
              pt: "sentinela canal",
              en: "sentinel channel",
              es: "sentinel channel",
            },
            texto: {
              pt: "**Uso:** `{&automod.sentinela.canal} <#canal|aqui|off>`\n\nDefine para qual canal vão os alertas de conteúdo suspeito. `off` volta a avisar no canal de logs (ou no próprio canal da mensagem).",
              en: "**Usage:** `{&automod.sentinela.canal} <#channel|here|off>`\n\nSets which channel receives the suspicious-content alerts. `off` goes back to the log channel (or the message's own channel).",
              es: "**Uso:** `{&automod.sentinela.canal} <#canal|here|off>`\n\nDefine a qué canal van las alertas de contenido sospechoso. `off` vuelve a avisar en el canal de registro (o en el propio canal del mensaje).",
            },
          },
          antiguidade: {
            titulo: {
              pt: "sentinela antiguidade",
              en: "sentinela antiguidade",
              es: "sentinel tenure",
            },
            texto: {
              pt: "O sentinela é o único módulo que **julga** em vez de medir — e por isso\né o único que muda de rigor conforme quem escreve.\n\n**A ideia**\nConta criada agora, que chega mandando link e falando de venda, é o\npadrão clássico de golpe. A mesma frase vinda de quem está no servidor\nhá semanas quase sempre é brincadeira que o detector não entende.\n\n**A medida de convívio**\nCom o **XP ligado**, é o nível: ele só sobe conversando, ao longo do\ntempo. Com o **XP desligado**, é o **tempo no servidor** (a data de\nentrada); sem essa data, a pessoa fica neutra. (Antes, sem XP, todo\nmundo era tratado como recém-chegado para sempre — rigor demais.)\n\n| nível de XP | tempo no servidor | faixa | limiar (média 6,5) |\n|---|---|---|---|\n| 0 | menos de 1 dia | recém-chegado | 5,75 |\n| 1–2 | — | conhecido | 6,0 |\n| 3–5 | 1 a 7 dias | frequente | 6,25 |\n| 6–10 | 7 a 30 dias (ou desconhecido) | estabelecido | 6,5 |\n| 11+ | mais de 30 dias | veterano | 7,0 |\n\nConta criada há menos de 1 h perde mais 2,5; criada hoje, mais 1.\n\nHá piso e teto: nem o veterano fica imune, nem o novato é punido por\nqualquer bobagem.\n\n`{&automod.sentinela.antiguidade} on|off`\n\n_Vale SÓ para o sentinela. Spam, caps, links, menções, repetição e_\n_caracteres medem coisas exatas — lá o limite é igual para todo mundo._",
              en: "The sentinel is the only module that **judges** instead of measuring —\nand so the only one whose strictness changes with who is writing.\n\n**The idea**\nAn account created minutes ago that arrives posting links and talking\nabout sales is the classic scam pattern. The same sentence from someone\nwho's been here for weeks is almost always a joke the detector misses.\n\n**How tenure is measured**\nWith **XP on**, it's the level: it only grows by talking, over time.\nWith **XP off**, it's **time in the server** (the join date); without\nthat date, the person stays neutral. (Before, with XP off, everyone was\na newcomer forever — far too strict.)\n\n| XP level | time in server | band | threshold (medium 6.5) |\n|---|---|---|---|\n| 0 | under 1 day | newcomer | 5.75 |\n| 1–2 | — | getting known | 6.0 |\n| 3–5 | 1 to 7 days | regular | 6.25 |\n| 6–10 | 7 to 30 days (or unknown) | established | 6.5 |\n| 11+ | over 30 days | veteran | 7.0 |\n\nAn account created under 1 h ago loses another 2.5; created today, 1.\n\nThere's a floor and a ceiling: no veteran is immune, and no newcomer\ngets punished over nothing.\n\n`{&automod.sentinela.antiguidade} on|off`\n\n_Applies ONLY to the sentinel. Spam, caps, links, mentions, repetition_\n_and characters measure exact things — there the limit is the same for all._",
              es: "El sentinel es el único módulo que **juzga** en lugar de medir,\ny por eso el único cuyo rigor cambia según quién escribe.\n\n**La idea**\nUna cuenta creada hace minutos que llega mandando enlaces y hablando\nde ventas es el patrón clásico de estafa. La misma frase de alguien\nque lleva semanas aquí casi siempre es una broma que el detector no capta.\n\n**Cómo se mide la antigüedad**\nCon el **XP activado**, es el nivel: solo sube conversando, con el tiempo.\nCon el **XP desactivado**, es el **tiempo en el servidor** (la fecha de entrada);\nsin esa fecha, la persona queda neutral. (Antes, sin XP, todo el mundo era\nrecién llegado para siempre: demasiado estricto.)\n\n| nivel de XP | tiempo en el servidor | franja | umbral (medium 6.5) |\n|---|---|---|---|\n| 0 | menos de 1 día | recién llegado | 5.75 |\n| 1–2 | — | conocido | 6.0 |\n| 3–5 | de 1 a 7 días | habitual | 6.25 |\n| 6–10 | de 7 a 30 días (o desconocido) | establecido | 6.5 |\n| 11+ | más de 30 días | veterano | 7.0 |\n\nUna cuenta creada hace menos de 1 h pierde otros 2.5; creada hoy, 1.\n\nHay un suelo y un techo: ningún veterano es inmune, y ningún recién llegado\nrecibe un castigo por cualquier tontería.\n\n`{&automod.sentinela.antiguidade} on|off`\n\n_Vale SOLO para el sentinel. Spam, mayúsculas, enlaces, menciones, repetición_\n_y caracteres miden cosas exactas: ahí el límite es igual para todos._",
            },
          },
          alerta: {
            titulo: {
              pt: "sentinela alerta",
              en: "sentinela alerta",
              es: "sentinel alerts",
            },
            texto: {
              pt: "Marca a staff quando alguém levanta suspeita **repetidas vezes** em\npouco tempo — mesmo sem chegar ao limiar de punição.\n\n**Por que separado da punição**\nNem todo padrão suspeito merece punir, mas todo padrão suspeito merece\num par de olhos humanos **enquanto está acontecendo**. É justamente o\ncaso duvidoso — nota alta mas não alta o bastante — que a moderação\nprecisa ver antes de o bot decidir sozinho.\n\n**Como dispara**\n3 sinais em 10 minutos da mesma pessoa. Um sinal isolado é ruído.\nDepois de avisar, fica 30 min em silêncio sobre aquela pessoa: alerta\nque se repete vira ruído e a staff para de ler.\n\n**O que o aviso traz**\nQuem é, quantas vezes, o perfil (recém-chegado/veterano e o nível), a\nmaior nota, os sinais que apareceram e os comandos de ação.\n\n`{&automod.sentinela.alerta} on|off`\n`{&automod.sentinela.canal} <#canal|aqui>` — onde avisar (senão usa o canal de logs)\n_Marca os cargos de `{&config.acesso.cargo}`._",
              en: "Pings the staff when someone raises suspicion **repeatedly** in a short\nwindow — even without reaching the punishment threshold.\n\n**Why it's separate from punishing**\nNot every suspicious pattern deserves a punishment, but every suspicious\npattern deserves human eyes **while it's happening**. It's exactly the\nborderline case — high score, but not high enough — that moderation\nneeds to see before the bot decides on its own.\n\n**How it triggers**\n3 signals in 10 minutes from the same person. One signal is noise.\nAfter alerting, it stays quiet about that person for 30 min: an alert\nthat repeats becomes noise and staff stop reading it.\n\n**What the alert carries**\nWho, how many times, the profile (newcomer/veteran and level), the\nhighest score, the signals seen, and the action commands.\n\n`{&automod.sentinela.alerta} on|off`\n`{&automod.sentinela.canal} <#channel|here>` — where to alert (falls back to the log channel)\n_Pings the roles from `{&config.acesso.cargo}`._",
              es: "Avisa al staff cuando alguien levanta sospechas **repetidas veces** en poco\ntiempo, aunque no llegue al umbral de castigo.\n\n**Por qué va aparte del castigo**\nNo todo patrón sospechoso merece un castigo, pero todo patrón sospechoso\nmerece ojos humanos **mientras está ocurriendo**. Es justo el caso\ndudoso (nota alta, pero no lo bastante) el que la moderación\nnecesita ver antes de que el bot decida por su cuenta.\n\n**Cómo se dispara**\n3 señales en 10 minutos de la misma persona. Una señal suelta es ruido.\nTras avisar, guarda silencio sobre esa persona durante 30 min: una alerta\nque se repite se vuelve ruido y el staff deja de leerla.\n\n**Qué trae la alerta**\nQuién es, cuántas veces, el perfil (recién llegado/veterano y nivel), la\nnota más alta, las señales vistas y los comandos de acción.\n\n`{&automod.sentinela.alerta} on|off`\n`{&automod.sentinela.canal} <#canal|here>` — dónde avisar (si no, usa el canal de registro)\n_Menciona a los roles de `{&config.acesso.cargo}`._",
            },
          },
          assuntos: {
            titulo: {
              pt: "sentinela assuntos",
              en: "sentinela assuntos",
              es: "sentinel topics",
            },
            texto: {
              pt: "Para o servidor cuja regra diz \"aqui não se discute política, religião…\"\n— mas onde o pessoal zoa com esses temas, e zoar pode.\n\n**Como decide: nota de 0 a 10, como o sentinela**\n• **sobem:** termos com peso — forte (\"bolsonarista\", \"petralha\", \"maconha\") 3,\n  nomes (políticos, partidos) 2,5, ideias (\"direita\", \"comunismo\", \"igreja\") 2,\n  genérico (\"governo\", \"eleição\") 1 —, sinais de debate (\"vocês não sabem\",\n  \"os fatos\", \"quem vota\"), ataque (\"burro\", \"idiota\"), mensagem longa e\n  o **contexto**: o tema voltando no canal, com outras pessoas\n• **amenizam:** \"kkkk\"/\"haha\", emoji de riso, \"zoeira\"/\"to zoando\", mensagem\n  curta, pergunta neutra, e o canal todo rindo\n• **não contam:** \"meu deus\", \"que droga\", \"vira à direita\"; disfarces\n  (\"b0ls0n4ro\") são desfeitos antes\nPassou do limiar (média 4,5; alta 3,5; baixa 6) → a IA lê o fio e classifica:\n• **fora do tema** — nada · **zoeira** — nunca pune (na dúvida, zoeira)\n• **discussão** — a ação do tema, só nos temas ligados aqui\n• **ataque** (ofender alguém por causa do tema) — sempre conta (`punir`),\n  em qualquer um dos 4 temas\nCaso duvidoso não pune: vai para a revisão do dono do bot. Com `ia off`, a\nnota decide sozinha (só nos temas ligados).\n\n**Os temas e a ação de cada um**\n`politica` · `religiao` · `drogas` · `sexual` (texto) — cada um com:\n• `off` — desligado (o padrão)\n• `alertar` — chama a staff; a mensagem fica\n• `apagar` — só tira a mensagem (avisa no canal, sem punir)\n• `punir` — apaga e conta na escada (`acumular`; mude com `punicao`)\n\n`{&automod.sentinela.assuntos}` — o painel\n`{&automod.sentinela.assuntos.politica.apagar}`\n`{&automod.sentinela.assuntos.religiao.alertar}`\n`{&automod.sentinela.assuntos.drogas.add} <termo>` — palavra a mais (peso de nome)\n`{&automod.sentinela.assuntos.test} <texto>` — a nota de cada tema, sem punir\n`{&automod.sentinela.assuntos.sensibilidade} <baixa|media|alta>` · `ia on|off`\n`{&automod.sentinela.assuntos.liberar} #debate` · `vigiar #debate` — um canal onde pode\n`{&automod.sentinela.assuntos} punicao <modo>` — o que o `punir` faz\n\n_Erro do modelo nunca vira punição. A staff não é moderada (mas a fala dela entra no contexto)._\n_Roda em segundo plano: a mensagem não espera o modelo._",
              en: "For servers whose rules say \"no politics, religion… here\" — but where\npeople joke about those topics, and joking is fine.\n\n**How it decides: a 0–10 score, like the sentinel**\n• **raise it:** weighted terms — strong (partisan slurs, \"weed\") 3, names\n  (politicians, parties) 2.5, ideas (\"right wing\", \"communism\", \"church\") 2,\n  generic (\"government\", \"election\") 1 —, debate signals (\"you don't know\",\n  \"the fact is\"), attacks (\"stupid\", \"idiot\"), long messages and the\n  **context**: the topic coming back in the channel, with other people\n• **soften it:** \"lol\"/\"haha\"/\"kkkk\", laughing emoji, \"just kidding\",\n  short messages, neutral questions, and the whole channel laughing\n• **don't count:** \"oh my god\", \"turn right\"; disguises are undone first\nAbove the threshold (medium 4.5; high 3.5; low 6) → the AI reads the thread\nand classifies it:\n• **off-topic** — nothing · **joke** — never punished (when in doubt, a joke)\n• **discussion** — the topic's action, only for topics turned on here\n• **attack** (insulting someone over the topic) — always counts (`punir`),\n  in any of the 4 topics\nDoubtful cases aren't punished: they go to the bot owner's review. With\n`ia off`, the score decides alone (only for topics turned on).\n\n**The topics and each one's action**\n`politica` · `religiao` · `drogas` · `sexual` (text) — each with:\n• `off` — disabled (the default)\n• `alertar` — calls the staff; the message stays\n• `apagar` — just removes the message (notes it in the channel, no punishment)\n• `punir` — deletes and counts on the ladder (`acumular`; change it with `punishment`)\n\n`{&automod.sentinela.assuntos}` — the panel\n`{&automod.sentinela.assuntos.politica.apagar}`\n`{&automod.sentinela.assuntos.religiao.alertar}`\n`{&automod.sentinela.assuntos.drogas.add} <term>` — an extra word (name weight)\n`{&automod.sentinela.assuntos.test} <text>` — each topic's score, without punishing\n`{&automod.sentinela.assuntos.sensibilidade} <low|medium|high>` · `ia on|off`\n`{&automod.sentinela.assuntos.liberar} #debate` · `vigiar #debate` — a channel where it's fine\n`{&automod.sentinela.assuntos} punishment <mode>` — what `punir` does\n\n_A model error never becomes a punishment. Staff aren't moderated (but what they say is context)._\n_Runs in the background: the message doesn't wait for the model._",
              es: "Para servidores cuyas reglas dicen \"aquí no se habla de política, religión…\",\npero donde la gente bromea con esos temas, y bromear está bien.\n\n**Cómo decide: una nota de 0 a 10, como el sentinel**\n• **la suben:** términos con peso: fuertes (insultos partidistas, \"porro\") 3, nombres\n  (políticos, partidos) 2.5, ideas (\"derecha\", \"comunismo\", \"iglesia\") 2,\n  genéricos (\"gobierno\", \"elecciones\") 1; señales de debate (\"no tienes ni idea\",\n  \"el hecho es\"), ataques (\"estúpido\", \"idiota\"), mensajes largos y el\n  **contexto**: el tema que vuelve al canal, con otras personas\n• **la suavizan:** \"lol\"/\"haha\"/\"kkkk\", emojis de risa, \"es broma\",\n  mensajes cortos, preguntas neutrales y todo el canal riéndose\n• **no cuentan:** \"Dios mío\", \"gira a la derecha\"; los disfraces se deshacen antes\nSi pasa el umbral (medium 4.5; high 3.5; low 6) → la IA lee el hilo\ny lo clasifica:\n• **fuera de tema** — nada · **broma** — nunca se castiga (en la duda, broma)\n• **discusión** — la acción del tema, solo en los temas activados aquí\n• **ataque** (ofender a alguien por el tema) — siempre cuenta (`punish`),\n  en cualquiera de los 4 temas\nLos casos dudosos no se castigan: van a la revisión del dueño del bot. Con\n`ai off`, la nota decide sola (solo en los temas activados).\n\n**Los temas y la acción de cada uno**\n`politics` · `religion` · `drugs` · `sexual` (texto) — cada uno con:\n• `off` — desactivado (el valor por defecto)\n• `alert` — llama al staff; el mensaje se queda\n• `delete` — solo quita el mensaje (lo avisa en el canal, sin castigo)\n• `punish` — borra y cuenta en la escalera (`stack`; cámbialo con `punishment`)\n\n`{&automod.sentinela.assuntos}` — el panel\n`{&automod.sentinela.assuntos.politica.apagar}`\n`{&automod.sentinela.assuntos.religiao.alertar}`\n`{&automod.sentinela.assuntos.drogas.add} <término>` — una palabra extra (peso de nombre)\n`{&automod.sentinela.assuntos.test} <texto>` — la nota de cada tema, sin castigar\n`{&automod.sentinela.assuntos.sensibilidade} <low|medium|high>` · `ai on|off`\n`{&automod.sentinela.assuntos.liberar} #debate` · `watch #debate` — un canal donde está permitido\n`{&automod.sentinela.assuntos} punishment <modo>` — qué hace `punish`\n\n_Un error del modelo nunca se convierte en castigo. El staff no es moderado (pero lo que dice cuenta como contexto)._\n_Funciona en segundo plano: el mensaje no espera al modelo._",
            },
          },
          avatar: {
            titulo: {
              pt: "sentinela avatar",
              en: "sentinela avatar",
              es: "sentinel avatar",
            },
            texto: {
              pt: "O **perfil inteiro** de quem **entra** e de quem **troca**: foto (a do perfil e a de servidor), banner, bio, nome, apelido e status. Foto e banner passam pelo modelo de visão; o texto, pelo sentinela e pela checagem de **desenho feito de caracteres** (braille, blocos). Nada é republicado.\n\n**Certeza**\nAlta (genitália ou ato sexual descritos com o voto de risco do modelo, símbolo de ódio com o voto, ou algo que o dono do bot já confirmou) → a ação abaixo.\nMédia e baixa → ninguém é punido: o caso vai para a revisão do dono do bot.\n\n**A ação** (a staff é sempre avisada)\n• `silenciar` — timeout nativo **até a pessoa trocar** o que apitou (no máximo 28 dias) — **o padrão**\n• `alertar` — só avisa\n• `expulsar` · `banir`\n\n`{&automod.sentinela.avatar}` — o painel\n`{&automod.sentinela.avatar.acao} <alertar|silenciar|expulsar|banir>`\n`{&automod.sentinela.avatar.checar} @pessoa` — analisa a foto agora, sem punir\n`{&automod.sentinela.liberar} <@pessoa|id>` — libera quem foi silenciado\n\n_Staff, dono e bots não passam pela checagem. Precisa de **TimeoutMembers**_\n_(silenciar), **KickMembers** ou **BanMembers** conforme a ação._",
              en: "The **whole profile** of whoever **joins** or **changes** it: picture (profile and server), banner, bio, name, nickname and status. Picture and banner go through the vision model; the text through the sentinel and the **character-art** check (braille, blocks). Nothing is reposted.\n\n**Certainty**\nHigh (genitals or sex acts described with the model's risk vote, a hate symbol with the vote, or something the bot owner already confirmed) → the action below.\nMedium and low → nobody is punished: the case goes to the bot owner's review.\n\n**The action** (the staff is always alerted)\n• `silenciar` — native timeout **until the person changes** what was flagged (28 days at most) — **the default**\n• `alertar` — alert only\n• `expulsar` (kick) · `banir` (ban)\n\n`{&automod.sentinela.avatar}` — the panel\n`{&automod.sentinela.avatar.acao} <alertar|silenciar|expulsar|banir>`\n`{&automod.sentinela.avatar.checar} @person` — analyses the picture now, without punishing\n`{&automod.sentinela.liberar} <@user|id>` — releases someone who was silenced\n\n_Staff, owner and bots are skipped. Needs **TimeoutMembers** (silence),_\n_**KickMembers** or **BanMembers** depending on the action._",
              es: "El **perfil entero** de quien **entra** o lo **cambia**: foto (la del perfil y la del servidor), banner, bio, nombre, apodo y estado. La foto y el banner pasan por el modelo de visión; el texto, por el centinela y por la revisión de **dibujos hechos con caracteres** (braille, bloques). Nada se vuelve a publicar.\n\n**Certeza**\nAlta (genitales o actos sexuales descritos con el voto de riesgo del modelo, un símbolo de odio con el voto, o algo que el dueño del bot ya confirmó) → la acción de abajo.\nMedia y baja → nadie es sancionado: el caso va a la revisión del dueño del bot.\n\n**La acción** (el staff siempre recibe aviso)\n• `silence` — timeout nativo **hasta que la persona cambie** lo detectado (28 días como máximo) — **el valor por defecto**\n• `alert` — solo avisa\n• `kick` (expulsar) · `ban` (banear)\n\n`{&automod.sentinela.avatar}` — el panel\n`{&automod.sentinela.avatar.acao} <alert|silence|kick|ban>`\n`{&automod.sentinela.avatar.checar} @persona` — analiza la foto ahora, sin castigar\n`{&automod.sentinela.liberar} <@usuario|id>` — libera a quien fue silenciado\n\n_El staff, el dueño y los bots no pasan por la revisión. Necesita **TimeoutMembers** (silenciar),_\n_**KickMembers** o **BanMembers** según la acción._",
            },
          },
        },
      },
      punicao: {
        titulo: {
          pt: "automod punicao",
          en: "automod punicao",
          es: "automod punishment",
        },
        texto: {
          pt: "**Uso:** `{&automod} <módulo> punicao <modo|herdar>`\n\nDá a um módulo uma punição **própria**, independente da global:\n• `avisar` — só avisa\n• `apagar` — só remove a mensagem\n• `confirmar` — silencia e espera um mod\n• `acumular` — soma avisos até banir\n• `banir` — ban imediato\n• `herdar` — volta a usar a punição global\n\nEx.: `{&automod} antilink punicao apagar`",
          en: "**Usage:** `{&automod} <module> punicao <mode|herdar>`\n\nGives a module its **own** punishment, independent of the global one:\n• `avisar` — warn only\n• `apagar` — remove the message only\n• `confirmar` — silence and wait for a mod\n• `acumular` — stack warnings until a ban\n• `banir` — instant ban\n• `herdar` — inherit the global punishment again\n\nE.g.: `{&automod} antilink punicao apagar`",
          es: "**Uso:** `{&automod} <módulo> punishment <modo|inherit>`\n\nDa a un módulo un castigo **propio**, independiente del global:\n• `warn` — solo avisa\n• `delete` — solo quita el mensaje\n• `confirm` — silencia y espera a un mod\n• `stack` — suma advertencias hasta el ban\n• `ban` — ban inmediato\n• `inherit` — vuelve a usar el castigo global\n\nEj.: `{&automod} antilink punishment delete`",
        },
        paginas: {
          modo: {
            titulo: {
              pt: "punicao modo",
              en: "punicao modo",
              es: "punishment mode",
            },
            texto: {
              pt: "**Uso:** `{&automod.punicao.modo} <avisar|apagar|confirmar|acumular|banir>`\n\nDefine a punição **global** (vale para todos os módulos que não têm punição própria):\n• `avisar` — só avisa, não remove\n• `apagar` — só remove a mensagem\n• `confirmar` — remove, silencia (timeout nativo) e espera um mod aprovar\n• `acumular` — soma avisos e bane ao atingir o limite\n• `banir` — ban imediato",
              en: "**Usage:** `{&automod.punicao.modo} <avisar|apagar|confirmar|acumular|banir>`\n\nSets the **global** punishment (applies to every module without its own):\n• `avisar` — warn only, don't remove\n• `apagar` — remove the message only\n• `confirmar` — remove, silence (native timeout) and wait for a mod's approval\n• `acumular` — stack warnings and ban at the limit\n• `banir` — instant ban",
              es: "**Uso:** `{&automod.punicao} mode <warn|delete|confirm|stack|ban>`\n\nDefine el castigo **global** (vale para todos los módulos sin castigo propio):\n• `warn` — solo avisa, no quita nada\n• `delete` — solo quita el mensaje\n• `confirm` — quita, silencia (timeout nativo) y espera la aprobación de un mod\n• `stack` — suma advertencias y banea al llegar al límite\n• `ban` — ban inmediato",
            },
          },
          escada: {
            titulo: {
              pt: "punicao escada",
              en: "punicao escada",
              es: "punishment ladder",
            },
            texto: {
              pt: "No modo `acumular`, cada reincidência sobe um degrau. O padrão:\n\n**1.** aviso\n**2.** silêncio de 5 min\n**3.** silêncio de 1 h\n**4.** ban\n\n**Por que uma escada e não um contador**\nAntes eram N avisos e, no limite, ban — sem nada no meio. Isso punia\nigual quem escorregou uma vez e quem está atacando o servidor, e dava\nao membro comum um susto desproporcional na única punição que ele via.\nA escada dá peso crescente e, principalmente, dá **chance**: quem para\nno primeiro degrau nunca chega ao último.\n\n**Mudar**\n`{&automod.punicao.escada}` — mostra a escada atual\n`{&automod.punicao.escada} aviso,10m,2h,ban` — mais tempo em cada degrau\n`{&automod.punicao.escada} aviso,ban` — só um aviso antes do ban\n\nAceita `aviso`, `ban` e prazos como `30s`, `10m`, `2h`, `1d`.\nO ban é sempre o último degrau, mesmo que você não escreva.\n\n_Os degraus de silêncio usam o **timeout nativo** do Stoat: o bot precisa de **TimeoutMembers**._\n_O prazo fica no banco, então um mute de 1 h sobrevive a reinício do bot._",
              en: "In `acumular` mode, each repeat offence climbs a step. The default:\n\n**1.** warning\n**2.** 5 min silence\n**3.** 1 h silence\n**4.** ban\n\n**Why a ladder and not a counter**\nIt used to be N warnings and then a ban, with nothing in between. That\npunished a one-off slip the same as a deliberate attack, and gave an\nordinary member a wildly disproportionate scare on the only punishment\nthey ever saw. The ladder adds weight gradually and, above all, gives a\n**chance**: whoever stops at the first step never reaches the last.\n\n**Changing it**\n`{&automod.punicao.escada}` — shows the current ladder\n`{&automod.punicao.escada} warn,10m,2h,ban` — longer at each step\n`{&automod.punicao.escada} warn,ban` — a single warning before the ban\n\nAccepts `warn`, `ban` and durations like `30s`, `10m`, `2h`, `1d`.\nA ban is always the last step, even if you don't write it.\n\n_Silence steps use the Stoat's **native timeout**: the bot needs **TimeoutMembers**._\n_The deadline lives in the database, so a 1 h mute survives a bot restart._",
              es: "En el modo `stack`, cada reincidencia sube un peldaño. Por defecto:\n\n**1.** advertencia\n**2.** silencio de 5 min\n**3.** silencio de 1 h\n**4.** ban\n\n**Por qué una escalera y no un contador**\nAntes eran N advertencias y luego ban, sin nada en medio. Eso\ncastigaba igual un desliz puntual que un ataque deliberado, y le daba\na un miembro corriente un susto desproporcionado con el único castigo\nque llegaba a ver. La escalera suma peso poco a poco y, sobre todo, da\nuna **oportunidad**: quien para en el primer peldaño nunca llega al último.\n\n**Cambiarla**\n`{&automod.punicao} ladder` — muestra la escalera actual\n`{&automod.punicao} ladder warn,10m,2h,ban` — más tiempo en cada peldaño\n`{&automod.punicao} ladder warn,ban` — una sola advertencia antes del ban\n\nAcepta `warn`, `ban` y duraciones como `30s`, `10m`, `2h`, `1d`.\nEl ban es siempre el último peldaño, aunque no lo escribas.\n\n_Los peldaños de silencio usan el **timeout nativo** de Stoat: el bot necesita **TimeoutMembers**._\n_El plazo se guarda en la base de datos, así que un silencio de 1 h sobrevive a un reinicio del bot._",
            },
          },
        },
      },
      set: {
        titulo: {
          pt: "automod set",
          en: "automod set",
          es: "automod set",
        },
        texto: {
          pt: "**Uso:** `{&automod} <grupo> set <parâmetro> <valor>`\n\nAjusta um parâmetro de um módulo. Parâmetros por módulo:\n• `antispam`: `mensagens`, `tempo` (duração: `8s`, `1m`) — velocidade · `vezes` — repetição · `minuto`, `novato` — mídia · `mencoes`\n• `antiruido`: `tamanho`, `limiar` (0–1 ou %) — caps · `zalgo` — caracteres · `repeticao`, `ignorar` — letras · `emojis` — emoji\n  _A medição ignora menções, links, emojis nomeados e código — só conta o texto digitado._\n\nEx.: `{&automod} antispam set mensagens 3` · `{&automod} antispam set tempo 10s`",
          en: "**Usage:** `{&automod} <group> set <parameter> <value>`\n\nAdjusts a module's parameter. Parameters per module:\n• `antispam`: `mensagens`, `tempo` (duration: `8s`, `1m`) — speed · `vezes` — repetition · `minuto`, `novato` — media · `mencoes`\n• `antiruido`: `tamanho`, `limiar` (0–1 or %) — caps · `zalgo` — characters · `repeticao`, `ignorar` — letters · `emojis` — emoji\n  _Measurement ignores mentions, links, named emojis and code — only typed text counts._\n\nE.g.: `{&automod} antispam set mensagens 3` · `{&automod} antispam set tempo 10s`",
          es: "**Uso:** `{&automod} <grupo> set <parámetro> <valor>`\n\nAjusta un parámetro de un módulo. Parámetros por módulo:\n• `antispam`: `messages`, `time` (duración: `8s`, `1m`) — velocidad · `times` — repetición · `minute`, `newcomer` — multimedia · `mentions`\n• `antinoise`: `size`, `threshold` (0–1 o %) — mayúsculas · `zalgo` — caracteres · `repetition`, `ignore` — letras · `emojis` — emoji\n  _La medición ignora menciones, enlaces, emojis con nombre y código: solo cuenta el texto escrito._\n\nEj.: `{&automod} antispam set messages 3` · `{&automod} antispam set time 10s`",
        },
      },
      antirepeticao: {
        titulo: {
          pt: "automod antirepeticao",
          en: "automod antirepeticao",
          es: "automod antirepeticao",
        },
        texto: {
          pt: "**Anti-repetição** — bloqueia a mesma letra repetida muitas vezes numa mensagem (ex.: `aaaaaaaaaa`).\n\nVem **desligado** por padrão, porque em servidores BR o `kkkkk` (risada) é legítimo — e por isso o `k` é ignorado por padrão.\n\n`{&automod} antirepeticao on` — ativa\n`{&automod} antirepeticao set repeticao 15` — limite de repetições\n`{&automod} antirepeticao set ignorar k` — letras a ignorar (risada)\n`{&automod} antirepeticao punicao apagar` — punição própria",
          en: "**Anti-repetition** — blocks the same letter repeated many times in one message (e.g. `aaaaaaaaaa`).\n\nIt ships **disabled** by default, because in Brazilian servers `kkkkk` (laughter) is legitimate — which is also why `k` is ignored by default.\n\n`{&automod} antirepeticao on` — enables it\n`{&automod} antirepeticao set repeticao 15` — repetition limit\n`{&automod} antirepeticao set ignorar k` — letters to ignore (laughter)\n`{&automod} antirepeticao punicao apagar` — its own punishment",
          es: "**Antirrepetición** — bloquea la misma letra repetida muchas veces en un mensaje (p. ej. `aaaaaaaaaa`).\n\nViene **desactivado** por defecto, porque en los servidores brasileños `kkkkk` (risa) es legítimo; por eso también la `k` se ignora por defecto.\n\n`{&automod} antirepeticao on` — lo activa\n`{&automod} antirepeticao set repetition 15` — límite de repeticiones\n`{&automod} antirepeticao set ignore k` — letras que ignorar (risa)\n`{&automod} antirepeticao punishment delete` — castigo propio",
        },
      },
      blocklist: {
        titulo: { pt: "automod blocklist", en: "automod blocklist", es: "automod blocklist" },
        texto: {
          pt: "A lista de domínios que o `antilink` bloqueia: listas prontas (fontes) e domínios avulsos. É **global** ao bot: mudar é só do dono do bot; a staff vê com `{&automod} blocklist list` e libera um site só aqui com `{&automod} whitelist add <link>`.",
          en: "The list of domains the `antilink` blocks: ready-made lists (sources) and single domains. It's **global** to the bot: only the bot owner changes it; staff see it with `{&automod} blocklist list` and allow a site here only with `{&automod} whitelist add <link>`.",
          es: "La lista de dominios que bloquea el `antilink`: listas ya hechas (fuentes) y dominios sueltos. Es **global** para el bot: solo el dueño del bot la cambia; el staff la ve con `{&automod} blocklist list` y permite un sitio solo aquí con `{&automod} whitelist add <enlace>`.",
        },
        paginas: {
          dominios: {
            titulo: {
              pt: "blocklist adddomain",
              en: "blocklist adddomain",
              es: "blocklist adddomain",
            },
            texto: {
              pt: "Duas coisas diferentes convivem aqui: **fontes** (listas Pi-hole inteiras,\ncom milhões de domínios) e **domínios manuais** (um a um, seus).\n\n**Fontes**\n`{&automod} blocklist add <url>` — baixa e incorpora uma lista\n`{&automod} blocklist remove <url>` — remove a fonte\n\n**Manuais**\n`{&automod} blocklist adddomain 02giga.link`\n`{&automod} blocklist removedomain 02giga.link`\n\n**Manutenção**\n`{&automod} blocklist list` — fontes, manuais e o total carregado\n`{&automod} blocklist reload` — rebaixa tudo\n`{&automod} blocklist clear` — zera fontes e manuais\n\n_A lista é **global** ao bot, não por servidor: uma vez baixada, vale para todos — por isso **mudar** nela (add, remove, adddomain, removedomain, clear, reload) é só do **dono do bot**; a staff de cada servidor vê com `list` e libera um site **só aqui** com `{&automod} whitelist add <link>`._\n_O índice pronto fica cacheado em disco: após reiniciar, o anti-link já nasce armado._\n_Se uma fonte falhar no `reload`, a lista atual é mantida — ela nunca encolhe por queda de rede._",
              en: "Two different things live here: **sources** (whole Pi-hole lists, with millions\nof domains) and **manual domains** (one by one, yours).\n\n**Sources**\n`{&automod} blocklist add <url>` — downloads and incorporates a list\n`{&automod} blocklist remove <url>` — removes the source\n\n**Manual**\n`{&automod} blocklist adddomain 02giga.link`\n`{&automod} blocklist removedomain 02giga.link`\n\n**Maintenance**\n`{&automod} blocklist list` — sources, manual entries and the total loaded\n`{&automod} blocklist reload` — re-downloads everything\n`{&automod} blocklist clear` — wipes sources and manual entries\n\n_The list is **global** to the bot, not per server: once downloaded, it applies to all — that's why **changing** it (add, remove, adddomain, removedomain, clear, reload) is **bot owner only**; each server's staff sees it with `list` and allows a site **here only** with `{&automod} whitelist add <link>`._\n_The finished index is cached on disk: after a restart, the anti-link wakes up already armed._\n_If a source fails during `reload`, the current list is kept — it never shrinks because of a network hiccup._",
              es: "Aquí conviven dos cosas distintas: **fuentes** (listas Pi-hole enteras, con millones\nde dominios) y **dominios manuales** (uno a uno, los tuyos).\n\n**Fuentes**\n`{&automod} blocklist add <url>` — descarga e incorpora una lista\n`{&automod} blocklist remove <url>` — quita la fuente\n\n**Manuales**\n`{&automod} blocklist adddomain 02giga.link`\n`{&automod} blocklist removedomain 02giga.link`\n\n**Mantenimiento**\n`{&automod} blocklist list` — fuentes, entradas manuales y el total cargado\n`{&automod} blocklist reload` — vuelve a descargarlo todo\n`{&automod} blocklist clear` — borra fuentes y entradas manuales\n\n_La lista es **global** para el bot, no por servidor: una vez descargada, vale para todos; por eso **cambiarla** (add, remove, adddomain, removedomain, clear, reload) es **solo del dueño del bot**; el staff de cada servidor la ve con `list` y permite un sitio **solo aquí** con `{&automod} whitelist add <enlace>`._\n_El índice listo queda en caché en disco: tras un reinicio, el antienlaces arranca ya armado._\n_Si una fuente falla durante el `reload`, se mantiene la lista actual: nunca se encoge por un fallo de red._",
            },
          },
        },
      },
      whitelist: {
        titulo: {
          pt: "whitelist",
          en: "whitelist",
          es: "whitelist",
        },
        texto: {
          pt: "O que sempre passa, mesmo quando um filtro bloquearia. Cole o link e o bot descobre em que lista ele entra:\n• **um site** (`https://linksta.cc/@voce`) → o domínio fica liberado no **anti-link**, com os subdomínios\n• **um convite do Stoat** (`stt.gg/abc`) → o convite fica liberado no **anti-invite**\n• **um canal** (`#divulgacao`) → **qualquer** convite pode ser postado lá — o canal de divulgação. Anti-link, Sentinela e antispam continuam valendo\n\n`{&automod} whitelist add <link>` · `{&automod} whitelist remove <link>` · `{&automod} whitelist` — vê as duas listas\n\nA staff (o dono do servidor e os cargos do `{&staff}`) **nunca** passa pelo automod — não é preciso liberar os próprios links.",
          en: "What always passes, even when a filter would block it. Paste a link and the bot figures out which list it belongs to:\n• **a site** (`https://linksta.cc/@you`) → the domain is allowed in **anti-link**, subdomains included\n• **a Stoat invite** (`stt.gg/abc`) → the invite is allowed in **anti-invite**\n• **a channel** (`#promo`) → **any** invite can be posted there — the advertising channel. Anti-link, Sentinel and antispam still apply\n\n`{&automod} whitelist add <link>` · `{&automod} whitelist remove <link>` · `{&automod} whitelist` — see both lists\n\nStaff (the server owner and the `{&staff}` roles) **never** goes through the automod — no need to whitelist your own links.",
          es: "Lo que siempre pasa, aunque un filtro lo bloquearía. Pega un enlace y el bot averigua en qué lista va:\n• **un sitio** (`https://linksta.cc/@tu`) → el dominio queda permitido en el **antienlaces**, subdominios incluidos\n• **una invitación de Stoat** (`stt.gg/abc`) → la invitación queda permitida en el **antiinvitaciones**\n• **un canal** (`#promocion`) → ahí se puede publicar **cualquier** invitación — el canal de promoción. El antienlaces, el Centinela y el antispam siguen aplicándose\n\n`{&automod} whitelist add <enlace>` · `{&automod} whitelist remove <enlace>` · `{&automod} whitelist` — ver ambas listas\n\nEl staff (el dueño del servidor y los roles de `{&staff}`) **nunca** pasa por el automod: no hace falta permitir tus propios enlaces.",
        },
      },
    },
  },
};
