// &staff — a equipe do servidor; os cargos marcados aqui moderam (P2: o `&acesso cargo …` virou atalho daqui)

export default {
  id: "staff",
  modulo: "../moderacao/staff.js",
  funcao: "cmdStaff",
  nomes: { en: "staff" },
  apelidos: ["equipe", "team"],
  es: { nome: "staff", subcomandos: { lista: "lista", limpar: "limpiar", titulo: "titulo", equipe: "equipo" } },   // espanhol (etapa 4)
  subcomandos: {
    add: "add", remove: "remove", lista: "list", limpar: "clear", titulo: ["title", "label"],
    equipe: "team",
  },
  atalhos: {
    "acesso|access|acceso cargo|cargos|role|roles|rol|staff add": "staff add",
    "acesso|access|acceso cargo|cargos|role|roles|rol|staff remove|remover|quitar": "staff remove",
    "acesso|access|acceso cargo|cargos|role|roles|rol|staff limpar|clear|limpiar": "staff limpar",
  },
  gerenciavel: true,
  ajuda: {
    grupo: "comecar",
    resumo: { pt: "quem é a equipe; marcar os cargos que moderam", en: "who the staff is; mark the roles that moderate", es: "quién es el staff; marcar los roles que moderan" },
    perm: { pt: "ManagePermissions (para mudar; ver é livre)", en: "ManagePermissions (to change; viewing is free)", es: "ManagePermissions (para cambiar; ver es libre)" },
    uso: { pt: "{&staff} [add|remove|titulo|limpar]", en: "{&staff} [add|remove|title|clear]", es: "{&staff} [add|remove|title|clear]" },
    desc: { pt: "Mostra a **equipe do servidor**: o dono, os cargos marcados aqui, o cargo de equipe dos tickets e os cargos com permissão de moderar (banir, expulsar, silenciar, apagar mensagens, gerenciar o servidor) — com quem tem cada um, sem bots.\n\nQuem tem um cargo marcado aqui **usa os comandos de moderação** mesmo sem a permissão nativa do Stoat (a configuração e os cargos continuam pedindo a permissão do Stoat). Remover tira os dois de uma vez.\n\n`{&staff.add} <@cargo>` · `{&staff.remove} <@cargo>` · `{&staff.limpar}`\n`{&staff.titulo} <@cargo> <texto>` — rótulo exibido no lugar do nome do cargo\n\n_Consultar é público; mexer exige ManagePermissions._", en: "Shows the **server's staff**: the owner, the roles marked here, the ticket team role and the roles allowed to moderate (ban, kick, timeout, delete messages, manage the server) — with who holds each one, no bots.\n\nAnyone holding a role marked here **can use the moderation commands** even without Stoat's native permission (configuration and roles still need Stoat's permission). Removing drops both at once.\n\n`{&staff.add} <@role>` · `{&staff.remove} <@role>` · `{&staff.limpar}`\n`{&staff.titulo} <@role> <text>` — label shown instead of the role's name\n\n_Viewing is public; changing requires ManagePermissions._", es: "Muestra el **staff del servidor**: el dueño, los roles marcados aquí, el rol de equipo de los tickets y los roles con permiso para moderar (banear, expulsar, silenciar, borrar mensajes, gestionar el servidor) — con quién tiene cada uno, sin bots.\n\nQuien tenga un rol marcado aquí **usa los comandos de moderación** aunque no tenga el permiso nativo de Stoat (la configuración y los roles siguen pidiendo el permiso de Stoat). Quitarlo retira las dos cosas a la vez.\n\n`{&staff.add} <@rol>` · `{&staff.remove} <@rol>` · `{&staff.limpar}`\n`{&staff.titulo} <@rol> <texto>` — etiqueta que se muestra en lugar del nombre del rol\n\n_Consultar es público; cambiarlo requiere ManagePermissions._" },
    ex: { pt: "{&staff.add} Moderador", en: "{&staff.add} Moderator", es: "{&staff.add} Moderador" },
    parametros: [
      { nome: { pt: "(nada)", en: "(nothing)", es: "(nada)" }, desc: { pt: "a equipe: cada cargo de staff e quem o tem", en: "the team: each staff role and who has it", es: "el staff: cada rol de staff y quién lo tiene" } },
      { nome: "add | remove", valor: { pt: "<@cargo|nome>", en: "<@role|name>", es: "<@rol|nombre>" }, desc: { pt: "quem tem o cargo pode usar os comandos de moderação", en: "whoever has the role can use the moderation commands", es: "quien tiene el rol puede usar los comandos de moderación" } },
      { nome: { pt: "titulo", en: "title", es: "title" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" }, desc: { pt: "o título do painel", en: "the panel title", es: "el título del panel" } },
    ],
  },
};
