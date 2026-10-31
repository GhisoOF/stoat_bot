// &ticket — tickets de suporte
//
// P2 (31 out 2026): na ajuda, só `painel` e `lista`. Abre e fecha por reação; a
// equipe entra sozinha (o `painel` confere e cria o cargo de equipe quando precisa);
// o registro vai para o log dos tickets ou, sem ele, para o canal de log do `&config`.
// `abrir`, `fechar`, `apagar`, `categorias`, `equipe` e `log` continuam funcionando fora da ajuda.

export default {
  id: "ticket",
  modulo: "../ferramentas/tickets.js",
  funcao: "cmdTicket",
  apelidos: ["tickets"],   // (P2) "suporte" passou ao &info (o plano: &support leva ao &info)
  es: { nome: "ticket", subcomandos: { painel: "panel", lista: "lista", apagar: "borrar", categorias: "categorias", equipe: "equipo", abrir: "abrir", fechar: "cerrar" } },   // espanhol (etapa 4)
  subcomandos: {
    painel: "panel", lista: "list", apagar: "delete", categorias: "categories", equipe: "team",
  },
  naTela: { abrir: "open", fechar: "close" },
  gerenciavel: true,
  ajuda: {
    grupo: "personalizar",
    perm: { pt: "reagir: todo mundo · painel e lista: staff", en: "react: everyone · panel and list: staff", es: "reaccionar: todos · panel y lista: staff" },
    uso: { pt: "{&ticket} painel <#canal> | lista", en: "{&ticket} panel <#channel> | list", es: "{&ticket} panel <#canal> | list" },
    desc: {
      pt: "Suporte com canal privado, **por reação**.\n\n`{&ticket.painel} #canal` — posta o painel: quem reage com um assunto abre um ticket (um canal que só a pessoa e a staff veem). A staff entra sozinha em todo ticket.\nDentro do ticket, 🔒 **fecha** (staff): a conversa trava e o registro vai para o canal de log como `.txt`; depois 🗑️ apaga o canal.\n`{&ticket.lista}` — os tickets abertos.\n\nO bot precisa de **ManageChannel, ManageRole, AssignRoles, ManagePermissions** e **ManageMessages**.",
      en: "Support with a private channel, **by reaction**.\n\n`{&ticket.painel} #channel` — posts the panel: reacting with a topic opens a ticket (a channel only that person and the staff see). Staff gets into every ticket by itself.\nInside the ticket, 🔒 **closes** it (staff): the chat locks and the record goes to the log channel as a `.txt`; then 🗑️ deletes the channel.\n`{&ticket.lista}` — the open tickets.\n\nThe bot needs **ManageChannel, ManageRole, AssignRoles, ManagePermissions** and **ManageMessages**.",
      es: "Soporte con un canal privado, **por reacción**.\n\n`{&ticket.painel} #canal` — publica el panel: quien reacciona con un tema abre un ticket (un canal que solo esa persona y el staff ven). El staff entra solo en todos los tickets.\nDentro del ticket, 🔒 lo **cierra** (staff): la conversación se bloquea y el registro va al canal de log como `.txt`; después 🗑️ borra el canal.\n`{&ticket.lista}` — los tickets abiertos.\n\nEl bot necesita **ManageChannel, ManageRole, AssignRoles, ManagePermissions** y **ManageMessages**.",
    },
    ex: { pt: "{&ticket.painel} #suporte", en: "{&ticket.painel} #support", es: "{&ticket.painel} #soporte" },
  },
};
