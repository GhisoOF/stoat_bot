// &untimeout — tira o silêncio antes da hora

export default {
  id: "untimeout",
  modulo: "../moderacao/punir.js",
  funcao: "cmdUntimeout",
  apelidos: ["unmute", "unsilence", "dessilenciar"],
  es: { nome: "untimeout" },
  gerenciavel: true,
  ajuda: {
    grupo: "proteger",
    perm: "TimeoutMembers",
    uso: { pt: "{&untimeout} [número|@pessoa|id|nome]", en: "{&untimeout} [number|@user|id|name]", es: "{&untimeout} [número|@usuario|id|nombre]" },
    desc: {
      pt: "Sem nada, lista quem está silenciado com um número; `{&untimeout} 2` devolve a voz ao 2º. Também aceita menção, ID, nome, resposta à mensagem do silêncio, ou ↩️ nela.",
      en: "With nothing, lists who is timed out with a number; `{&untimeout} 2` lifts the 2nd. Also takes a mention, ID, name, a reply to the timeout message, or ↩️ on it.",
      es: "Sin nada, lista a quien está silenciado con un número; `{&untimeout} 2` le devuelve la voz al 2.º. También acepta mención, ID, nombre, una respuesta al mensaje del silencio, o ↩️ en él.",
    },
    ex: { pt: "{&untimeout} @fulano", en: "{&untimeout} @someone", es: "{&untimeout} @alguien" },
  },
};
