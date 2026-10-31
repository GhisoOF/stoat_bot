// &unban — desfaz um ban (e tira o registro deste servidor da lista global)

export default {
  id: "unban",
  modulo: "../moderacao/punir.js",
  funcao: "cmdUnban",
  apelidos: ["desbanir", "desbanear", "pardon"],
  es: { nome: "desbanear" },
  gerenciavel: true,
  ajuda: {
    grupo: "proteger",
    perm: "BanMembers",
    uso: { pt: "{&unban} [número|@pessoa|id|nome]", en: "{&unban} [number|@user|id|name]", es: "{&unban} [número|@usuario|id|nombre]" },
    desc: {
      pt: "Sem nada, lista os banidos com um número; `{&unban} 3` desbane o 3º. Também aceita menção, ID, nome, resposta à mensagem do ban, ou ↩️ nela.\nTira o registro deste servidor da lista global; se a pessoa ainda consta por outros servidores e o modo daqui bane, ela fica isenta aqui.",
      en: "With nothing, lists the banned users with a number; `{&unban} 3` unbans the 3rd. Also takes a mention, ID, name, a reply to the ban message, or ↩️ on it.\nRemoves this server's record from the global list; if they're still listed by other servers and this server's mode bans, they become exempt here.",
      es: "Sin nada, lista a los baneados con un número; `{&unban} 3` desbanea al 3.º. También acepta mención, ID, nombre, una respuesta al mensaje del ban, o ↩️ en él.\nQuita el registro de este servidor de la lista global; si la persona aún figura por otros servidores y el modo de aquí banea, queda exenta aquí.",
    },
    ex: { pt: "{&unban} 3", en: "{&unban} 3", es: "{&unban} 3" },
  },
};
