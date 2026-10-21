// &chat — conversa com a IA (só nos servidores com IA)

export default {
  id: "chat",
  modulo: "../ai/chat.js",
  funcao: "cmdChat",
  apelidos: ["ia"],
  es: { nome: "chat", subcomandos: { esquecer: "olvidar", tudo: "todo", perfil: "perfil", mapear: "mapear", cuidado: "cuidado", memoria: "memoria" } },   // espanhol (etapa 4)
  subcomandos: {
    livre: "free", esquecer: "forget", tudo: "all", perfil: "profile", mapear: "map",
    cuidado: "care", gentil: "gentle", comentar: "comment", pordia: "perday", status: "status",
    aqui: "here", modo: "mode", relevante: "relevant", todas: "every",
    memoria: "memory",   // a página `&help chat memoria` (só a ajuda; o &chat não tem esse subcomando)
  },
  aninhados: ["livre", "comentar", "esquecer", "cuidado", "gentil"],
  naTela: { aqui: "here" },
  gerenciavel: true,
  soIA: true,
  textoLivre: true,
  ajuda: {
    perm: null,
    uso: { pt: "{&chat} <mensagem>", en: "{&chat} <message>", es: "{&chat} <mensaje>" },
    desc: { pt: "Conversa com a IA local (a Judy). Quando você pergunta algo do mundo, ela pesquisa na internet antes de responder (os links só aparecem quando você pede a busca: \"pesquisa…\", \"procura na internet…\"), faz contas exatas, lê o próprio código, lembra de quem **aceitou** que ela lembre (ela pergunta na primeira conversa; `{&privacidade}`) e adapta o tom a cada pessoa. Também vê imagens que você anexar.\n\n**Subcomandos:**\n`{&chat.status}` — se o serviço de IA está no ar\n`{&chat.perfil}` — o que a Judy sabe sobre você\n`{&chat.mapear}` — captura a bio/status do seu cartão\n`{&chat.cuidado} [@user] on|off` — trata a pessoa com gentileza extra (opt-in)\n`{&chat.esquecer}` — apaga tudo que a Judy sabe de você\n`{&chat.esquecer.tudo}` — zera a memória do servidor *(ManageServer)*\n`{&chat.livre} on|off|modo` — a Judy participa sozinha do canal *(ManagePermissions)*\n`{&chat.comentar.aqui}|off|pordia <n>` — comentários por iniciativa *(ManagePermissions)*\n\nQuando responde alguém, mantém o papo fluido por um tempo. Se ela já estiver respondendo outra pessoa, você entra na **fila** (vê a posição) e é atendido na ordem. Conta escrita na mensagem (`263857 * 3`) vai sempre para a calculadora, nunca de cabeça.", en: "Talk to the local AI (Judy). When you ask about the world, she searches the web before answering (links only show up when you ask for the search: \"search…\", \"look it up online…\"), does exact math, reads her own code, remembers people who **agreed** to it (she asks in your first conversation; `{&privacidade}`) and adapts her tone to each person. She can also see images you attach.\n\n**Subcommands:**\n`{&chat.status}` — whether the AI service is up\n`{&chat.perfil}` — what Judy knows about you\n`{&chat.mapear}` — captures your profile card bio/status\n`{&chat.cuidado} [@user] on|off` — treats the person with extra kindness (opt-in)\n`{&chat.esquecer}` — erases everything Judy knows about you\n`{&chat.esquecer.tudo}` — wipes the server's memory *(ManageServer)*\n`{&chat.livre} on|off|mode` — Judy joins the channel on her own *(ManagePermissions)*\n`{&chat.comentar.aqui}|off|perday <n>` — comments on her own initiative *(ManagePermissions)*\n\nWhen she replies to someone, she keeps the conversation flowing for a while. If she's already answering someone else you join the **queue** (you'll see your position) and get served in order. Arithmetic written in the message (`263857 * 3`) always goes to the calculator, never done in her head.", es: "Habla con la IA local (Judy). Cuando preguntas algo sobre el mundo, busca en internet antes de responder (los enlaces solo aparecen cuando pides la búsqueda: \"busca…\", \"búscalo en internet…\"), hace cuentas exactas, lee su propio código, recuerda a quien **aceptó** que lo recuerde (lo pregunta en la primera conversación; `{&privacidade}`) y adapta el tono a cada persona. También ve las imágenes que adjuntes.\n\n**Subcomandos:**\n`{&chat.status}` — si el servicio de IA está en línea\n`{&chat.perfil}` — lo que Judy sabe de ti\n`{&chat.mapear}` — captura la bio/estado de tu tarjeta de perfil\n`{&chat.cuidado} [@usuario] on|off` — trata a la persona con amabilidad extra (opt-in)\n`{&chat.esquecer}` — borra todo lo que Judy sabe de ti\n`{&chat.esquecer.tudo}` — borra la memoria del servidor *(ManageServer)*\n`{&chat.livre} on|off|mode` — Judy participa por su cuenta en el canal *(ManagePermissions)*\n`{&chat.comentar.aqui}|off|perday <n>` — comentarios por iniciativa propia *(ManagePermissions)*\n\nCuando responde a alguien, mantiene la conversación fluida por un tiempo. Si ya está respondiendo a otra persona, entras en la **cola** (ves tu posición) y te atiende por orden. Una cuenta escrita en el mensaje (`263857 * 3`) va siempre a la calculadora, nunca de memoria." },
    ex: "{&chat.status}",
  },
};
