// &reactionrole — cargos por reação

export default {
  id: "reactionrole",
  modulo: "../ferramentas/reaction-roles.js",
  funcao: "cmdReactionRole",
  apelidos: ["rr", "reactionroles"],
  es: { nome: "reactionrole" },   // espanhol (etapa 4)
  subcomandos: {
    exclusivo: "exclusive", unico: "unique", add: "add", remove: "remove", list: "list",
    recarregar: "reload", reparar: "repair",
  },
  aninhados: ["exclusivo", "unico"],
  naTela: { ordem: "order" },   // o handler já aceita `order` e `reordenar`
  gerenciavel: true,
  ajuda: {
    perm: "ManageRole",
    uso: "{&reactionrole} <add|remove|list>",
    desc: { pt: "Cargos por reação: quem reagir com o emoji ganha o cargo; quem tirar a reação perde.\n\n`{&reactionrole.add} <mensagem> <emoji> <idCargo>`\n`{&reactionrole.remove} <mensagem>` — remove as regras daquela mensagem\n`{&reactionrole.exclusivo} <mensagem> on|off` — **on**: escolher um emoji troca o cargo anterior (ex.: cor); **off**: acumula (ex.: interesses)\n`{&reactionrole.recarregar}` — se os cargos pararem de ser entregues após um restart\n`{&reactionrole.list}` — regras deste servidor\n\n**A mensagem** pode ser o **ID** ou o **link** dela (menu `...` → *Copiar link*) — os dois funcionam.\n**O cargo** pode ser **mencionado** (`<%Cargo>`) ou o ID (Configurações → Cargos → *Copy role ID*).\n\nO bot precisa de `React`, `ViewChannel`, `ReadMessageHistory` e **AssignRoles**, e o cargo dele deve estar acima do cargo entregue.", en: "Reaction roles: whoever reacts with the emoji gets the role; removing the reaction removes the role.\n\n`{&reactionrole.add} <message> <emoji> <roleId>`\n`{&reactionrole.remove} <message>` — removes that message's rules\n`{&reactionrole.exclusivo} <message> on|off` — **on**: picking one emoji swaps out the previous role (e.g. colors); **off**: they stack (e.g. interests)\n`{&reactionrole.recarregar}` — if roles stop being handed out after a restart\n`{&reactionrole.list}` — this server's rules\n\n**The message** can be its **ID** or its **link** (`...` menu → *Copy link*) — both work.\n**The role** can be **mentioned** (`<%Role>`) or given by ID (Settings → Roles → *Copy role ID*).\n\nThe bot needs `React`, `ViewChannel`, `ReadMessageHistory` and **AssignRoles**, and its role must be above the role being handed out.", es: "Roles por reacción: quien reaccione con el emoji recibe el rol; quien quite la reacción lo pierde.\n\n`{&reactionrole.add} <mensaje> <emoji> <idDelRol>`\n`{&reactionrole.remove} <mensaje>` — elimina las reglas de ese mensaje\n`{&reactionrole.exclusivo} <mensaje> on|off` — **on**: elegir un emoji cambia el rol anterior (p. ej., colores); **off**: se acumulan (p. ej., intereses)\n`{&reactionrole.recarregar}` — si los roles dejan de entregarse tras un reinicio\n`{&reactionrole.list}` — reglas de este servidor\n\n**El mensaje** puede ser su **ID** o su **enlace** (menú `...` → *Copiar enlace*) — los dos funcionan.\n**El rol** puede **mencionarse** (`<%Rol>`) o indicarse por ID (Configuración → Roles → *Copy role ID*).\n\nEl bot necesita `React`, `ViewChannel`, `ReadMessageHistory` y **AssignRoles**, y su rol debe estar por encima del rol que entrega." },
    ex: "{&reactionrole.add} https://stoat.chat/server/.../01ABC... 🎮 01XYZ...",
    parametros: [
      { nome: "add", valor: { pt: "<mensagem> <emoji> <cargo>", en: "<message> <emoji> <role>", es: "<mensaje> <emoji> <rol>" }, desc: { pt: "liga emoji → cargo. A mensagem pode ser o **link** (`...` → Copiar link) ou o ID", en: "wires emoji → role. The message can be the **link** (`...` → Copy link) or the ID", es: "vincula emoji → rol. El mensaje puede ser el **enlace** (`...` → Copiar enlace) o el ID" } },
      { nome: "remove", valor: { pt: "<mensagem> <emoji>", en: "<message> <emoji>", es: "<mensaje> <emoji>" }, desc: { pt: "desfaz uma ligação", en: "undoes a wiring", es: "deshace un vínculo" } },
      { nome: "list", desc: { pt: "tudo que está ligado neste servidor", en: "everything wired on this server", es: "todo lo que está vinculado en este servidor" } },
      { nome: { pt: "exclusivo", en: "exclusive", es: "exclusive" }, valor: { pt: "<mensagem> on|off", en: "<message> on|off", es: "<mensaje> on|off" }, desc: { pt: "nessa mensagem só vale um cargo por vez (cor, time): escolher um troca o anterior", en: "only one role at a time on that message (color, team): picking one swaps the previous", es: "en ese mensaje solo vale un rol a la vez (color, equipo): elegir uno cambia el anterior" } },
      { nome: { pt: "recarregar", en: "reload", es: "reload" }, desc: { pt: "se os cargos pararam de ser dados depois de um reinício. Também **repõe** emojis que sumiram do painel (entram no fim da fila)", en: "if roles stopped being handed out after a restart. It also **puts back** emojis that vanished from the panel (they go to the end of the row)", es: "si los roles dejaron de entregarse tras un reinicio. También **repone** los emojis que desaparecieron del panel (entran al final de la fila)" } },
      { nome: { pt: "ordem", en: "order", es: "order" }, valor: { pt: "<mensagem> confirmar", en: "<message> confirm", es: "<mensaje> confirm" }, desc: { pt: "recompõe o painel na ordem configurada. Limpa as reações de todos e reage de novo, uma a uma — os cargos ficam, só o ✓ some. Painel grande leva ~1s por emoji: o Stoat só aceita 15 requisições por janela", en: "rebuilds the panel in the configured order. Clears everyone's reactions and reacts again one by one — roles stay, only the ✓ goes. A big panel takes ~1s per emoji: Stoat only accepts 15 requests per window", es: "rehace el panel en el orden configurado. Borra las reacciones de todos y vuelve a reaccionar una a una — los roles se mantienen, solo desaparece el ✓. Un panel grande tarda ~1 s por emoji: Stoat solo acepta 15 peticiones por ventana" } },
    ],
  },
};
