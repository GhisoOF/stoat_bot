// &staff — a equipe do servidor (mesma lista de cargos do &acesso)

export default {
  id: "staff",
  modulo: "../moderacao/staff.js",
  funcao: "cmdStaff",
  nomes: { en: "staff" },
  apelidos: ["equipe", "team"],
  es: { nome: "staff" },   // espanhol (etapa 4)
  subcomandos: {
    add: "add", remove: "remove", lista: "list", limpar: "clear", titulo: ["title", "label"],
    equipe: "team",
  },
  gerenciavel: true,
  ajuda: {
    perm: "ManagePermissions",
    uso: { pt: "{&staff} [add|remove|titulo|limpar]", en: "{&staff} [add|remove|title|clear]", es: "{&staff} [add|remove|title|clear]" },
    desc: { pt: "Mostra a **equipe do servidor**: o dono, os cargos marcados aqui, o cargo de equipe dos tickets e os cargos com permissão de moderar (banir, expulsar, silenciar, apagar mensagens, gerenciar o servidor) — com quem tem cada um, sem bots.\n\nOs cargos marcados não têm cadastro próprio: são os mesmos do `{&acesso.cargo}`. Então adicionar aqui **também dá acesso aos comandos de moderação** — e remover tira os dois de uma vez, sem o quadro de avisos discordar da permissão real.\n\n`{&staff.add} <@cargo>` · `{&staff.remove} <@cargo>` · `{&staff.limpar}`\n`{&staff.titulo} <@cargo> <texto>` — rótulo exibido no lugar do nome do cargo\n\n_Consultar é público; mexer exige ManagePermissions._", en: "Shows the **server's staff**: the owner, the roles marked here, the ticket team role and the roles allowed to moderate (ban, kick, timeout, delete messages, manage the server) — with who holds each one, no bots.\n\nThe marked roles have no separate registry: they're the very same as `{&acesso.cargo}`. So adding here **also grants access to the moderation commands** — and removing drops both at once, so the notice board can never disagree with the actual permission.\n\n`{&staff.add} <@role>` · `{&staff.remove} <@role>` · `{&staff.limpar}`\n`{&staff.titulo} <@role> <text>` — label shown instead of the role's name\n\n_Viewing is public; changing requires ManagePermissions._", es: "Muestra el **staff del servidor**: el dueño, los roles marcados aquí, el rol de equipo de los tickets y los roles con permiso para moderar (banear, expulsar, silenciar, borrar mensajes, gestionar el servidor) — con quién tiene cada uno, sin bots.\n\nLos roles marcados no tienen registro propio: son los mismos de `{&acesso.cargo}`. Así que añadir aquí **también da acceso a los comandos de moderación** — y quitar retira las dos cosas a la vez, sin que el panel contradiga el permiso real.\n\n`{&staff.add} <@rol>` · `{&staff.remove} <@rol>` · `{&staff.limpar}`\n`{&staff.titulo} <@rol> <texto>` — etiqueta que se muestra en lugar del nombre del rol\n\n_Consultar es público; cambiarlo requiere ManagePermissions._" },
    ex: { pt: "{&staff.add} Moderador", en: "{&staff.add} Moderator", es: "{&staff.add} Moderador" },
    parametros: [
      { nome: { pt: "(nada)", en: "(nothing)", es: "(nada)" }, desc: { pt: "a equipe: cada cargo de staff e quem o tem", en: "the team: each staff role and who has it", es: "el staff: cada rol de staff y quién lo tiene" } },
      { nome: "add | remove", valor: { pt: "<@cargo|nome>", en: "<@role|name>", es: "<@rol|nombre>" }, desc: { pt: "mesma lista do `{&acesso.cargo}` — quem está aqui pode usar os comandos de moderação", en: "same list as `{&acesso.cargo}` — whoever is here can use moderation commands", es: "la misma lista de `{&acesso.cargo}` — quien está aquí puede usar los comandos de moderación" } },
      { nome: { pt: "titulo", en: "title", es: "title" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" }, desc: { pt: "o título do painel", en: "the panel title", es: "el título del panel" } },
    ],
  },
};
