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
  },
  {
    id: "entrar",
    funcao: entrar,
    nomes: { en: "join" },
    apelidos: ["join", "call"],
    voz: true,
  },
  {
    id: "sair",
    funcao: sair,
    nomes: { en: "leave" },
    apelidos: ["leave", "sairdacall"],
    voz: true,
  },
];
