// &modia — moderação por IA

export default {
  id: "modia",
  modulo: "../moderacao/modia-comando.js",
  funcao: "cmdModIA",
  apelidos: ["moderacaoia"],
  es: { nome: "modia" },   // espanhol (etapa 4)
  subcomandos: {
    criterios: "criteria", canal: "channel", limpar: "clear", status: "status", add: "add",
    remove: "remove",
  },
  aninhados: ["canal", "criterios"],
  soIA: true,
  textoLivre: true,
  ajuda: {
    perm: "ManageServer",
    uso: { pt: "{&modia} <on|off|criterios|canal|status|limpar>", en: "{&modia} <on|off|criteria|channel|status|clear>", es: "{&modia} <on|off|criteria|channel|status|clear>" },
    desc: { pt: "Moderação por IA na conversa. Você escreve os CRITÉRIOS em texto livre e a Judy avalia cada mensagem; se violar, ela APAGA e te marca no #log com o conteúdo e as opções (avisar/silenciar/banir) já com o comando pronto. Ela nunca bane sozinha — a decisão é sua. O dono do bot é imune.\n\n`{&modia.criterios} <texto>` — define o que moderar\n`{&modia} on|off` — liga/desliga\n`{&modia.canal.add}|remove` — limita a canais (sem isso, vale em todos)\n`{&modia.limpar}` — zera tudo", en: "AI moderation of the conversation. You write the CRITERIA in free text and Judy evaluates each message; if it violates them, she DELETES it and pings you in #log with the content and the options (warn/silence/ban) with the command ready to paste. She never bans on her own — the decision is yours. The bot owner is immune.\n\n`{&modia.criterios} <text>` — defines what to moderate\n`{&modia} on|off` — toggles it\n`{&modia.canal.add}|remove` — limits it to channels (otherwise applies to all)\n`{&modia.limpar}` — resets everything", es: "Moderación por IA en la conversación. Escribes los CRITERIOS en texto libre y Judy evalúa cada mensaje; si alguno los viola, lo BORRA y te menciona en #log con el contenido y las opciones (avisar/silenciar/banear) con el comando ya listo. Nunca banea por su cuenta — la decisión es tuya. El dueño del bot es inmune.\n\n`{&modia.criterios} <texto>` — define qué moderar\n`{&modia} on|off` — lo activa/desactiva\n`{&modia.canal.add}|remove` — lo limita a ciertos canales (sin esto, vale en todos)\n`{&modia.limpar}` — lo reinicia todo" },
    ex: { pt: "{&modia.criterios} Apague divulgacao de outros servidores e ataques pessoais", en: "{&modia.criterios} Delete ads for other servers and personal attacks", es: "{&modia.criterios} Borra la publicidad de otros servidores y los ataques personales" },
  },
};
