// &automod — os filtros automáticos: antispam, antiruido, antilink, sentinela

export default {
  id: "automod",
  modulo: "../moderacao/automod-comandos.js",
  funcao: "cmdAutomod",
  es: { nome: "automod" },   // espanhol (etapa 4)
  subcomandos: {
    antiruido: ["antinoise", "noise"], sentinela: "sentinel", punicao: "punishment",
    herdar: "inherit", global: "global", set: "set", status: "status", debug: "debug",
    avisar: "warn", apagar: "delete", confirmar: "confirm", acumular: "stack", banir: "ban",
    mensagens: "messages", tempo: "time", mencoes: "mentions", tamanho: "size",
    limiar: "threshold", ignorar: "ignore", repeticao: "repetition",
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
      subcomandos: {
        velocidade: "speed", rajada: "burst", repeticao: "repeat", midia: "media",
        mencoes: "mentions", mensagens: "messages", tempo: "time", minuto: "minute",
        novato: ["newcomer", "newcomers"], vezes: "times",
      },
      naTela: { repeticao: "repeat" },
    },
    antiruido: {
      subcomandos: {
        caracteres: "characters", letras: "letters", tamanho: "size", limiar: "threshold",
        repeticao: "repetition", ignorar: "ignore",
      },
    },
    antilink: {
      subcomandos: { dominios: "domains", convites: "invites" },
    },
    sentinela: {
      subcomandos: {
        conteudo: "content", odio: "hate", imagens: "images",
        assuntos: ["topics", "subjects"], avatar: ["avatar", "pfp"],
        sensibilidade: "sensitivity", canal: "channel", testar: "test", simular: "simulate",
        banir: "ban", liberar: "dismiss", config: "config", status: "status",
        antiguidade: "tenure", alerta: ["alerts", "alert"], baixa: "low", media: "medium",
        alta: "high",
      },
      naTela: { assuntos: "topics", aqui: "here" },
    },
    odio: {
      subcomandos: { add: "add", remover: "remove", lista: "list" },
    },
    assuntos: {
      subcomandos: {
        politica: "politics", religiao: "religion", drogas: "drugs", alertar: "alert",
        apagar: "delete", punir: "punish", baixa: "low", media: "medium", alta: "high",
        sensibilidade: "sensitivity", liberar: "allow", vigiar: "watch", ia: "ai",
        test: "test", add: "add", remover: "remove",
      },
    },
    avatar: {
      subcomandos: {
        acao: "action", tempo: "time", checar: "check", alertar: "alert",
        silenciar: ["silence", "mute", "timeout"], expulsar: "kick", banir: "ban",
      },
    },
    punicao: {
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
      en: "sentinel",
      subcomandos: {
        sensibilidade: "sensitivity", canal: "channel", testar: "test", simular: "simulate",
        banir: "ban", liberar: "dismiss", config: "config", status: "status",
        antiguidade: "tenure", baixa: "low", media: "medium", alta: "high",
      },
    },
    blocklist: {
      subcomandos: {
        add: "add", remove: "remove", list: "list", clear: "clear", reload: "reload",
        adddomain: "adddomain", removedomain: "removedomain", dominios: "domains",
      },
    },
    whitelist: {
      subcomandos: { add: "add", remove: "remove", list: "list" },
    },
    scam: {
      subcomandos: {
        sensibilidade: "sensitivity", canal: "channel", testar: "test", simular: "simulate",
        banir: "ban", liberar: "dismiss", config: "config", status: "status", baixa: "low",
        media: "medium", alta: "high",
      },
    },
  },
  textoLivre: true,
  ajuda: {
    perm: "ManagePermissions",
    uso: { pt: "{&automod} [status] | {&automod} on|off | {&automod} <grupo> [parte] <on|off> | {&automod} <grupo> punicao <modo>", en: "{&automod} [status] | {&automod} on|off | {&automod} <group> [part] <on|off> | {&automod} <group> punicao <mode>", es: "{&automod} [status] | {&automod} on|off | {&automod} <grupo> [parte] <on|off> | {&automod} <grupo> punicao <modo>" },
    desc: { pt: "A moderação automática em **quatro grupos**, cada um com partes que dá para ajustar uma a uma:\n\n🌊 `antispam` — enxurrada: `velocidade`, `rajada`, `repeticao` (a mesma mensagem ou imagem), `midia` (anexos por minuto), `mencoes`\n🔊 `antiruido` — texto poluído: `caps`, `caracteres` (zalgo, invisíveis), `letras` (kkkkkk…), `emoji`\n🔗 `antilink` — `dominios` (lista de bloqueio) e `convites`\n🛡️ `sentinela` — conteúdo nocivo: `conteudo` (golpe, +18, gore, ilícito), `odio` (ofensas), `imagens` (modelo de visão)\n\n**Exemplos prontos:** `{&automod} off` desliga **tudo** · `{&automod} antispam on` liga um grupo · `{&automod.antiruido} caps off` desliga só uma parte. _Servidor novo começa com tudo desligado._\n\n`{&automod} <grupo>` mostra as partes e os números · `{&automod} <grupo> on|off` liga/desliga o grupo · `{&automod} <grupo> <parte> on|off` só uma parte · `{&automod} <grupo> set <parâmetro> <valor>` · `{&automod} <grupo> punicao <modo>`\n\nTambém: `{&automod} blocklist`, `{&automod} whitelist`, `{&automod.punicao}` (a escada geral). Os nomes antigos (`anticaps`, `antiinvite`…) continuam valendo.", en: "Automatic moderation in **four groups**, each with parts you can tune one by one:\n\n🌊 `antispam` — floods: `speed`, `burst`, `repetition` (the same message or image), `media` (attachments per minute), `mentions`\n🔊 `antinoise` — noisy text: `caps`, `characters` (zalgo, invisible), `letters` (dragged-out letters), `emoji`\n🔗 `antilink` — `domains` (blocklist) and `invites`\n🛡️ `sentinel` — harmful content: `content` (scams, NSFW, gore, illicit), `hate` (slurs), `images` (vision model)\n\n**Ready-made examples:** `{&automod} off` turns **everything** off · `{&automod} antispam on` turns a group on · `{&automod.antiruido} caps off` turns off just one part. _A new server starts with everything off._\n\n`{&automod} <group>` shows the parts and numbers · `{&automod} <group> on|off` toggles the group · `{&automod} <group> <part> on|off` one part only · `{&automod} <group> set <parameter> <value>` · `{&automod} <group> punishment <mode>`\n\nAlso: `{&automod} blocklist`, `{&automod} whitelist`, `{&automod.punicao}` (the overall ladder). The old names (`anticaps`, `antiinvite`…) still work.", es: "Moderación automática en **cuatro grupos**, cada uno con partes que puedes ajustar una a una:\n\n🌊 `antispam` — inundación: `speed`, `burst`, `repetition` (el mismo mensaje o imagen), `media` (adjuntos por minuto), `mentions`\n🔊 `antinoise` — texto contaminado: `caps`, `characters` (zalgo, invisibles), `letters` (jajajaja…), `emoji`\n🔗 `antilink` — `domains` (lista de bloqueo) y `invites`\n🛡️ `sentinel` — contenido dañino: `content` (estafas, +18, gore, ilícito), `hate` (insultos), `images` (modelo de visión)\n\n**Ejemplos listos:** `{&automod} off` apaga **todo** · `{&automod} antispam on` activa un grupo · `{&automod.antiruido} caps off` apaga solo una parte. _Un servidor nuevo empieza con todo apagado._\n\n`{&automod} <grupo>` muestra las partes y los números · `{&automod} <grupo> on|off` activa/apaga el grupo · `{&automod} <grupo> <parte> on|off` solo una parte · `{&automod} <grupo> set <parámetro> <valor>` · `{&automod} <grupo> punishment <modo>`\n\nTambién: `{&automod} blocklist`, `{&automod} whitelist`, `{&automod.punicao}` (la escala general). Los nombres antiguos (`anticaps`, `antiinvite`…) siguen funcionando." },
    ex: "{&automod} antispam",
    parametros: [
      { nome: "off | on", desc: { pt: "desliga ou liga o automod inteiro de uma vez (servidor novo começa desligado)", en: "turns the whole automod off or on at once (a new server starts off)", es: "apaga o activa todo el automod de una vez (un servidor nuevo empieza apagado)" } },
      { nome: { pt: "<grupo>", en: "<group>", es: "<grupo>" }, desc: { pt: "só o nome: mostra as partes, os números e a punição do grupo", en: "name only: shows the group's parts, numbers and punishment", es: "solo el nombre: muestra las partes, los números y la sanción del grupo" } },
      { nome: { pt: "<grupo> on|off", en: "<group> on|off", es: "<grupo> on|off" }, desc: { pt: "liga/desliga o grupo inteiro: `antispam`, `antiruido`, `antilink`, `sentinela`", en: "toggles the whole group: `antispam`, `antinoise`, `antilink`, `sentinel`", es: "activa/apaga el grupo entero: `antispam`, `antinoise`, `antilink`, `sentinel`" } },
      { nome: { pt: "<grupo> <parte> on|off", en: "<group> <part> on|off", es: "<grupo> <parte> on|off" }, desc: { pt: "só uma parte (ex.: `antiruido caps off`, `antispam midia on`) — `{&automod} <grupo>` lista as partes", en: "one part only (e.g. `antinoise caps off`, `antispam medium on`) — `{&automod} <group>` lists the parts", es: "solo una parte (p. ej.: `antinoise caps off`, `antispam media on`) — `{&automod} <grupo>` lista las partes" } },
      { nome: { pt: "<grupo> set", en: "<group> set", es: "<grupo> set" }, valor: { pt: "<parâmetro> <valor>", en: "<parameter> <value>", es: "<parámetro> <valor>" }, desc: { pt: "ajusta um número: `antispam set mensagens 5`, `antiruido set limiar 0.7` — `{&automod} <grupo>` mostra os parâmetros", en: "tunes a number: `antispam set messages 5`, `antinoise set threshold 0.7` — `{&automod} <group>` shows the parameters", es: "ajusta un número: `antispam set messages 5`, `antinoise set threshold 0.7` — `{&automod} <grupo>` muestra los parámetros" } },
      { nome: { pt: "<grupo> punicao", en: "<group> punishment", es: "<grupo> punishment" }, valor: { pt: "<modo|herdar>", en: "<mode|inherit>", es: "<modo|inherit>" }, desc: { pt: "punição só desse grupo; `herdar` volta a usar a de `{&automod.punicao}`", en: "punishment for that group only; `inherit` goes back to the one from `{&automod.punicao}`", es: "sanción solo para ese grupo; `inherit` vuelve a usar la de `{&automod.punicao}`" } },
      { nome: "debug on|off", desc: { pt: "log detalhado no console (global, só o dono)", en: "verbose console log (global, owner only)", es: "log detallado en la consola (global, solo el dueño)" } },
    ],
  },
};
