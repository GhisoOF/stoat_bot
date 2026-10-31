// &reactionrole (&rr) — cargos por reação

export default {
  id: "reactionrole",
  modulo: "../ferramentas/reaction-roles.js",
  funcao: "cmdReactionRole",
  apelidos: ["rr", "reactionroles"],
  es: { nome: "reactionrole", subcomandos: { add: "add", remove: "quitar", list: "lista", exclusivo: "exclusivo", recarregar: "recargar", ordem: "orden" } },
  // (P2) o conserto é automático no boot: `recarregar` e `ordem` ficam só como apelidos silenciosos
  subcomandos: {
    add: ["add", "adicionar"], remove: ["remove", "remover"], list: ["list", "lista"],
    exclusivo: ["exclusive", "unico", "unique"], recarregar: ["reload", "reparar", "repair"], ordem: ["order", "reordenar"],
  },
  aninhados: ["exclusivo"],
  gerenciavel: true,
  ajuda: {
    grupo: "personalizar",
    perm: "ManageRole",
    uso: { pt: "{&reactionrole} add|remove|list|exclusivo", en: "{&reactionrole} add|remove|list|exclusive", es: "{&reactionrole} add|quitar|lista|exclusivo" },
    desc: {
      pt: "Quem reage com o emoji ganha o cargo; quem tira a reação perde.\n\n`{&reactionrole.add} <mensagem> <emoji> <cargo>` — a mensagem pelo link ou ID; o cargo por menção, nome ou ID (abaixo do seu)\n`{&reactionrole.remove} <mensagem> [emoji]`\n`{&reactionrole.list}`\n`{&reactionrole.exclusivo} <mensagem> on|off` — um cargo por vez nessa mensagem (escolher um troca o anterior)",
      en: "Whoever reacts with the emoji gets the role; removing the reaction takes it away.\n\n`{&reactionrole.add} <message> <emoji> <role>` — the message by link or ID; the role by mention, name or ID (below yours)\n`{&reactionrole.remove} <message> [emoji]`\n`{&reactionrole.list}`\n`{&reactionrole.exclusivo} <message> on|off` — one role at a time on that message (picking one swaps the previous)",
      es: "Quien reacciona con el emoji recibe el rol; quien quita la reacción lo pierde.\n\n`{&reactionrole.add} <mensaje> <emoji> <rol>` — el mensaje por enlace o ID; el rol por mención, nombre o ID (por debajo del tuyo)\n`{&reactionrole.remove} <mensaje> [emoji]`\n`{&reactionrole.list}`\n`{&reactionrole.exclusivo} <mensaje> on|off` — un rol a la vez en ese mensaje (elegir uno cambia el anterior)",
    },
    ex: { pt: "{&reactionrole.list}", en: "{&reactionrole.list}", es: "{&reactionrole.list}" },
    paginas: {
      exclusivo: {
        titulo: {
          pt: "reactionrole exclusivo",
          en: "reactionrole exclusivo",
          es: "reactionrole exclusive",
        },
        texto: {
          pt: "Define se a pessoa pode acumular os cargos daquela mensagem ou se escolher\num **troca** o anterior.\n\n`{&reactionrole.exclusivo} <mensagem> on` — troca (cor, idade, time)\n`{&reactionrole.exclusivo} <mensagem> off` — acumula (interesses, jogos)\n\nNo modo exclusivo o bot também **tira a reação antiga** da pessoa, para o\npainel refletir a escolha atual.\n\n_A mensagem pode ser o ID ou o link. Ela precisa já ter regras registradas._",
          en: "Sets whether a person can stack that message's roles or whether picking one\n**swaps** the previous.\n\n`{&reactionrole.exclusivo} <message> on` — swaps (color, age, team)\n`{&reactionrole.exclusivo} <message> off` — stacks (interests, games)\n\nIn exclusive mode the bot also **removes the old reaction**, so the panel\nreflects the current choice.\n\n_The message can be its ID or link. It must already have rules registered._",
          es: "Define si una persona puede acumular los roles de ese mensaje o si elegir uno\n**sustituye** al anterior.\n\n`{&reactionrole.exclusivo} <mensaje> on` — sustituye (color, edad, equipo)\n`{&reactionrole.exclusivo} <mensaje> off` — acumula (intereses, juegos)\n\nEn el modo exclusivo el bot también **quita la reacción antigua**, para que el panel\nrefleje la elección actual.\n\n_El mensaje puede ser su ID o su enlace. Debe tener ya reglas registradas._",
        },
      },
    },
  },
};
