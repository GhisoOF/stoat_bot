// &automod — os filtros automáticos: antispam, antiruido, antilink, sentinela

export default {
  id: "automod",
  modulo: "../moderacao/automod-comandos.js",
  funcao: "cmdAutomod",
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
  // as partes que também aparecem sozinhas — `&help punicao`, `&help blocklist add`,
  // texto antigo com `&punicao` — com o vocabulário que vale quando citadas assim.
  // Dentro do &automod, o vocabulário da parte se soma ao da família de mesmo nome.
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
};
