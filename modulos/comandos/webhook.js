// &webhook — ganchos que publicam GitHub, Crafty, Discord-like… num canal
import * as webhooks from "../ferramentas/webhooks.js";

export default {
  id: "webhook",
  funcao: () => webhooks.cmdWebhook,
  apelidos: ["webhooks", "gancho", "wh"],
  gerenciavel: true,
  textoLivre: true,
};
