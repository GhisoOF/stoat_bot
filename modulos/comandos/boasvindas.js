// &boasvindas — embed de boas-vindas

export default {
  id: "boasvindas",
  modulo: "../ferramentas/boas-vindas.js",
  funcao: "cmdBoasVindas",
  nomes: { en: "welcome" },
  apelidos: ["boas-vindas", "welcome", "greeting", "bemvindo"],
  es: { nome: "bienvenida", subcomandos: { canal: "canal", titulo: "titulo", texto: "texto", cor: "color", imagem: "imagen", testar: "probar", padrao: "predeterminado", status: "estado", limpar: "borrar", aqui: "aqui", oculto: "oculto", visivel: "visible", mensagens: "mensajes" } },   // espanhol (etapa 4)
  subcomandos: {
    canal: "channel", titulo: "title", texto: ["text", "message"], cor: ["colour", "color"],
    imagem: "image", testar: "test", padrao: "default", status: "status", limpar: "clear",
    aqui: "here", oculto: ["hidden", "hide"], visivel: ["visible", "show"],
    mensagens: "messages",
  },
  gerenciavel: true,
  textoLivre: true,
};
