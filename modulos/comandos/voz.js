// &tts · &entrar · &sair — a voz nas calls: leitura em voz (TTS), entrar e sair
import * as tts from "../ferramentas/tts.js";

// `&entrar`/`&sair` são a forma canônica de entrar e sair da call; o &tts faz o
// trabalho, mas só aceita "entrar"/"sair" vindos daqui (`&tts entrar` deixou de existir).
function entrar(msg, args, ctx) { return tts.cmdTts(msg, ["entrar", ...args], { ...ctx, viaAtalhoVoz: true }); }
function sair(msg, args, ctx) { return tts.cmdTts(msg, ["sair", ...args], { ...ctx, viaAtalhoVoz: true }); }

export default [
  {
    id: "tts",
    funcao: () => tts.cmdTts,
    apelidos: ["voz", "falar", "speak"],
    gerenciavel: true,
    voz: true,
    textoLivre: true,
  },
  {
    id: "entrar",
    funcao: () => entrar,
    nomes: { en: "join" },
    apelidos: ["join", "call"],
    voz: true,
  },
  {
    id: "sair",
    funcao: () => sair,
    nomes: { en: "leave" },
    apelidos: ["leave", "sairdacall"],
    voz: true,
  },
];
