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
};
