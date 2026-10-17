// &boasvindas — embed de boas-vindas

export default {
  id: "boasvindas",
  modulo: "../ferramentas/boas-vindas.js",
  funcao: "cmdBoasVindas",
  nomes: { en: "welcome" },
  apelidos: ["boas-vindas", "welcome", "greeting", "bemvindo"],
  subcomandos: {
    canal: "channel", titulo: "title", texto: ["text", "message"], cor: ["colour", "color"],
    imagem: "image", testar: "test", padrao: "default", status: "status", limpar: "clear",
    aqui: "here", oculto: ["hidden", "hide"], visivel: ["visible", "show"],
    mensagens: "messages",
  },
  gerenciavel: true,
  textoLivre: true,
};
