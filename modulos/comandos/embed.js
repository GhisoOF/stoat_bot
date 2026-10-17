// &embed — publica um embed montado pela staff

export default {
  id: "embed",
  modulo: "../moderacao/embed.js",
  funcao: "cmdEmbed",
  subcomandos: { campos: "fields", cores: "colors" },
  gerenciavel: true,
  textoLivre: true,
};
