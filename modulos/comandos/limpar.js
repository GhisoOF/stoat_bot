// &purge (id `limpar`) — apaga mensagens em lote

export default {
  id: "limpar",
  modulo: "../moderacao/limpar.js",
  funcao: "cmdLimpar",
  nomes: { en: "purge" },
  apelidos: ["clear", "purge", "limpiar"],
  es: { nome: "limpiar", subcomandos: { tudo: "todo", confirmar: "confirmar" } },
  subcomandos: { tudo: ["all", "everything"], confirmar: "confirm" },
  gerenciavel: true,
  ajuda: {
    grupo: "proteger",
    perm: "ManageMessages",
    uso: { pt: "{&limpar} [@pessoa] <1–100> | tudo", en: "{&limpar} [@user] <1–100> | all", es: "{&limpar} [@usuario] <1–100> | todo" },
    desc: {
      pt: "Apaga as últimas mensagens do canal (1–100). Com uma pessoa, só as dela (entre as mais recentes).\n\n`{&limpar.tudo}` — esvazia o canal inteiro. Só o **dono do servidor**, com um código de confirmação que vale 60 s. Não há volta.",
      en: "Deletes the channel's latest messages (1–100). With a person, only theirs (among the most recent).\n\n`{&limpar.tudo}` — empties the whole channel. **Server owner only**, with a confirmation code valid for 60 s. There's no undo.",
      es: "Borra los últimos mensajes del canal (1–100). Con una persona, solo los suyos (entre los más recientes).\n\n`{&limpar.tudo}` — vacía el canal entero. Solo el **dueño del servidor**, con un código de confirmación que vale 60 s. No se puede deshacer.",
    },
    ex: { pt: "{&limpar} @fulano 20", en: "{&limpar} @someone 20", es: "{&limpar} @alguien 20" },
    parametros: [
      { nome: "<1–100>", desc: { pt: "quantas mensagens apagar (as últimas)", en: "how many messages to delete (the latest)", es: "cuántos mensajes borrar (los últimos)" } },
      { nome: { pt: "[@pessoa]", en: "[@user]", es: "[@usuario]" },
        desc: { pt: "só as mensagens dessa pessoa", en: "only that person's messages", es: "solo los mensajes de esa persona" } },
    ],
  },
};
