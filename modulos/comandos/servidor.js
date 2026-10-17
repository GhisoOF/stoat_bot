// &servidor — regras, cargos, canais e FAQ do servidor

export default {
  id: "servidor",
  modulo: "../ferramentas/servidor-info.js",
  funcao: "cmdServidor",
  nomes: { en: "server" },
  apelidos: ["server", "serverinfo", "servidorinfo"],
  subcomandos: { regras: "rules", cargos: "roles", canais: "channels", info: "about" },
  gerenciavel: true,
  textoLivre: true,
};
