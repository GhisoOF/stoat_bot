// &tts · &entrar · &sair — a voz nas calls: leitura em voz (TTS), entrar e sair

// `&entrar`/`&sair` são a forma canônica de entrar e sair da call; o &tts faz o
// trabalho, mas só aceita "entrar"/"sair" vindos daqui (`&tts entrar` deixou de existir).
// (o import é na hora do uso: o registro não carrega handler nenhum — ver o index.js)
async function entrar(msg, args, ctx) {
  const tts = await import("../ferramentas/tts.js");
  return tts.cmdTts(msg, ["entrar", ...args], { ...ctx, viaAtalhoVoz: true });
}
async function sair(msg, args, ctx) {
  const tts = await import("../ferramentas/tts.js");
  return tts.cmdTts(msg, ["sair", ...args], { ...ctx, viaAtalhoVoz: true });
}

export default [
  {
    id: "tts",
    modulo: "../ferramentas/tts.js",
    funcao: "cmdTts",
    apelidos: ["voz", "falar", "speak"],
    es: { nome: "tts", subcomandos: { canal: "canal", aqui: "aqui", transmitir: "transmitir", filtro: "filtro", reiniciar: "reiniciar", teste: "prueba", diagnostico: "diagnostico", estado: "estado", entrar: "entrar", ler: "leer", sair: "salir", destravar: "destrabar", resgatar: "rescatar", porminuto: "porminuto", voz: "voz", nomes: "nombres", efeito: "efecto", tom: "tono", dicionario: "diccionario", padrao: "predeterminado" } },   // espanhol (etapa 4)
    subcomandos: {
      canal: "channel", aqui: "here", transmitir: "broadcast", filtro: ["filter", "sieve"],
      reiniciar: "restart", teste: "test", diagnostico: ["diagnose", "diagnostics"],
      estado: ["health", "status"], entrar: ["join", "start"], ler: "read",
      sair: ["stop", "leave"], destravar: ["unstick", "unlock"], resgatar: ["rescue", "resgate"],
      porminuto: ["perminute", "cap"], voz: "voice", nomes: "names", cooldown: "cooldown",
      efeito: "effect", tom: ["pitch", "tone"], dicionario: "dictionary",
    },
    naTela: { aqui: "here", padrao: "default" },
    gerenciavel: true,
    voz: true,
    textoLivre: true,
    // P2 (31 out 2026): na ajuda, só falar, `voz`, `estado` e `reiniciar`. O resto
    // (filtro, dicionario, efeito, tom, nomes, cooldown, canal, transmitir…) continua
    // funcionando fora dela; `diagnostico`, `destravar` e `resgatar` também (o `&entrar`
    // já resgata sozinho quando o Stoat acusa a call presa).
    ajuda: {
      grupo: "diversao",
      perm: { pt: "todo mundo (voz e reiniciar: ManageMessages)", en: "everyone (voice and restart: ManageMessages)", es: "todos (voice y restart: ManageMessages)" },
      uso: { pt: "{&tts} <texto> | voz <nome> | estado | reiniciar", en: "{&tts} <text> | voice <name> | health | restart", es: "{&tts} <texto> | voice <nombre> | health | restart" },
      desc: {
        pt: "A Judy **fala nas calls**. `{&entrar}` a traz para a sua call, e ela lê em voz alta tudo que for escrito no canal onde você digitou; `{&sair}` a tira.\n\n`{&tts} <texto>` — fala uma frase agora\n`{&tts.voz} <nome>` — troca a voz (sem nome, a lista) *(ManageMessages)*\n`{&tts.estado}` — o serviço de voz e as calls deste servidor\n`{&tts.reiniciar}` — recria a conexão de voz quando entrar dá erro *(ManageMessages)*",
        en: "Judy **speaks in calls**. `{&entrar}` brings her to your call, and she reads aloud everything written in the channel where you typed it; `{&sair}` takes her out.\n\n`{&tts} <text>` — say a sentence now\n`{&tts.voz} <name>` — change the voice (no name: the list) *(ManageMessages)*\n`{&tts.estado}` — the voice service and this server's calls\n`{&tts.reiniciar}` — rebuild the voice connection when joining fails *(ManageMessages)*",
        es: "Judy **habla en las llamadas**. `{&entrar}` la trae a tu llamada, y lee en voz alta todo lo que se escriba en el canal donde lo escribiste; `{&sair}` la saca.\n\n`{&tts} <texto>` — dice una frase ahora\n`{&tts.voz} <nombre>` — cambia la voz (sin nombre, la lista) *(ManageMessages)*\n`{&tts.estado}` — el servicio de voz y las llamadas de este servidor\n`{&tts.reiniciar}` — recrea la conexión de voz cuando entrar da error *(ManageMessages)*",
      },
      ex: "{&entrar}",
      parametros: [
        { nome: { pt: "<texto>", en: "<text>", es: "<texto>" }, desc: { pt: "a Judy fala isso na call agora", en: "Judy says it in the call right now", es: "Judy lo dice en la llamada ahora mismo" } },
        { nome: { pt: "voz", en: "voice", es: "voice" }, valor: { pt: "[nome]", en: "[name]", es: "[nombre]" }, desc: { pt: "qual voz usar; sem nome, a lista *(ManageMessages)*", en: "which voice to use; no name, the list *(ManageMessages)*", es: "qué voz usar; sin nombre, la lista *(ManageMessages)*" } },
        { nome: { pt: "estado", en: "health", es: "health" }, desc: { pt: "o serviço de voz e as calls deste servidor", en: "the voice service and this server's calls", es: "el servicio de voz y las llamadas de este servidor" } },
        { nome: { pt: "reiniciar", en: "restart", es: "restart" }, desc: { pt: "recria a conexão de voz *(ManageMessages)*", en: "rebuilds the voice connection *(ManageMessages)*", es: "recrea la conexión de voz *(ManageMessages)*" } },
      ],
    },
  },
  {
    id: "entrar",
    funcao: entrar,
    nomes: { en: "join" },
    apelidos: ["join", "call"],
    es: { nome: "entrar" },
    voz: true,
    ajuda: {
      grupo: "diversao",
      uso: "{&entrar}",
      desc: { pt: "Traz a Judy para a call e ela passa a falar **tudo que for escrito ali**. Lá dentro, **o leitor (TTS) e a música usam a mesma conexão**: dá para mandar `{&musica}` e ela continua lendo o chat.\n\n**Vários servidores ao mesmo tempo:** ela fica numa call por servidor — chamar em outro servidor não a tira desta. No mesmo servidor, `{&entrar}` em outra call troca de call.\n\n**Como ela escolhe a call**\n1. o canal onde você digitou, se for uma call _(o caso normal)_\n2. a que já estiver configurada\n3. a única call do servidor, se houver só uma\n\nHavendo mais de uma e nenhuma pista, ela **pergunta** em vez de chutar. Estando em outra call, sai de lá e vem para a sua.\n\nVale para **todo mundo**, não só para a equipe. Ajustes da fala: `{&help} tts`.", en: "Brings Judy into the call and she starts speaking **everything written there**. Inside, **the reader (TTS) and the music share the same connection**: `{&musica}` works while she keeps reading the chat.\n\n**Several servers at once:** she stays in one call per server — being called on another server doesn't pull her out of this one. On the same server, `{&entrar}` in another call switches calls.\n\n**How she picks the call**\n1. the channel you typed in, if it's a call _(the usual case)_\n2. the one already configured\n3. the server's only call, if there's just one\n\nWith more than one and no clue, she **asks** instead of guessing. If she's in another call, she leaves it and comes to yours.\n\nWorks for **everyone**, not just staff. Voice settings: `{&help} tts`.", es: "Trae a Judy a la llamada y empieza a leer **todo lo que se escriba ahí**. Dentro, **el lector (TTS) y la música usan la misma conexión**: puedes usar `{&musica}` y ella sigue leyendo el chat.\n\n**Varios servidores a la vez:** se queda en una llamada por servidor — llamarla en otro servidor no la saca de esta. En el mismo servidor, `{&entrar}` en otra llamada la cambia de llamada.\n\n**Cómo elige la llamada**\n1. el canal donde escribiste, si es una llamada _(el caso normal)_\n2. la que ya esté configurada\n3. la única llamada del servidor, si solo hay una\n\nSi hay más de una y ninguna pista, **pregunta** en lugar de adivinar. Si está en otra llamada, sale de ahí y viene a la tuya.\n\nVale para **todos**, no solo para el staff. Ajustes de la voz: `{&help} tts`." },
      ex: "{&entrar}",
    },
  },
  {
    id: "sair",
    funcao: sair,
    nomes: { en: "leave" },
    apelidos: ["leave", "sairdacall"],
    es: { nome: "salir" },
    voz: true,
    ajuda: {
      grupo: "diversao",
      uso: "{&sair}",
      desc: { pt: "Tira a Judy da call: para de ler o chat e para a música.", en: "Takes Judy out of the call: she stops reading the chat and stops the music.", es: "Saca a Judy de la llamada: deja de leer el chat y detiene la música." },
      ex: "{&sair}",
    },
  },
];
