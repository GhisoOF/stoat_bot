// &adeus — embed de despedida

export default {
  id: "adeus",
  modulo: "../ferramentas/boas-vindas.js",
  funcao: "cmdAdeus",
  nomes: { en: "goodbye" },
  apelidos: ["goodbye", "despedida", "farewell"],
  subcomandos: {
    canal: "channel", titulo: "title", texto: ["text", "message"], cor: ["colour", "color"],
    imagem: "image", testar: "test", padrao: "default", status: "status", limpar: "clear",
    aqui: "here", oculto: ["hidden", "hide"], visivel: ["visible", "show"],
  },
  gerenciavel: true,
  textoLivre: true,
};
