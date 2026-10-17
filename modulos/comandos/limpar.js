// &limpar — apaga mensagens em lote

export default {
  id: "limpar",
  modulo: "../moderacao/limpar.js",
  funcao: "cmdLimpar",
  nomes: { en: "purge" },
  apelidos: ["clear", "purge", "limpiar"],
  // `confirmar` era só da tela (naTela) e o handler aceitava as duas palavras; desde
  // a fase 3 o `confirm` é traduzido na entrada e o handler só conhece o nome interno
  subcomandos: { tudo: ["all", "everything"], confirmar: "confirm" },
  gerenciavel: true,
  ajuda: {
    perm: "ManageMessages",
    uso: { pt: "{&limpar} <quantidade> [@usuário] | tudo", en: "{&limpar} <amount> [@user] | all" },
    desc: {
      pt: "Apaga as últimas mensagens do canal (1–100). Com um usuário, apaga só as mensagens dele. Também responde a `clear` e `purge`. A confirmação some sozinha após alguns segundos.\n\n`{&limpar.tudo}` — esvazia o canal INTEIRO. Só o **dono do servidor**, e com confirmação por código de 4 caracteres que expira em 60s. Não há como desfazer.",
      en: "Deletes the channel's latest messages (1–100). With a user, deletes only theirs. Also answers to `clear` and `purge`. The confirmation deletes itself after a few seconds.\n\n`{&limpar.tudo}` — empties the WHOLE channel. **Server owner only**, with a 4-character confirmation code that expires in 60s. There is no undo.",
    },
    ex: "{&limpar} 10",
    parametros: [
      { nome: "<n>", desc: { pt: "quantas mensagens apagar (as últimas)", en: "how many messages to delete (the latest)" } },
      { nome: { pt: "[@pessoa]", en: "[@user]" }, desc: { pt: "só as mensagens dessa pessoa, dentro das últimas n", en: "only that person's messages, within the latest n" } },
    ],
  },
};
