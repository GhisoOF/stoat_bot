// &webhook — ganchos que publicam GitHub, Crafty, Discord-like… num canal

export default {
  id: "webhook",
  modulo: "../ferramentas/webhooks.js",
  funcao: "cmdWebhook",
  apelidos: ["webhooks", "gancho", "wh"],
  subcomandos: {
    criar: "create", lista: "list", remover: "remove", testar: "test", eventos: "events",
    canal: "channel",
  },
  gerenciavel: true,
  textoLivre: true,
};
