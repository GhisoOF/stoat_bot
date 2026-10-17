// &cor — cores e gradientes de cargo, painel de cores

export default {
  id: "cor",
  modulo: "../moderacao/cor-cargo.js",
  funcao: "cmdCor",
  nomes: { en: "color" },
  apelidos: ["cores", "cargocor", "color", "colour"],
  subcomandos: {
    painel: "panel", criar: "create", gerar: "generate", gradiente: "gradient", preset: "preset",
    presets: "presets", lista: "list", cargos: "roles", remover: "remove", limpar: "clear",
    padrao: "default", aqui: "here", ajuda: "help",
  },
  aninhados: ["painel", "criar", "gerar"],
  gerenciavel: true,
};
