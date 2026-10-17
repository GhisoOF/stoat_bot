// &ticket — tickets de suporte
import * as tickets from "../ferramentas/tickets.js";

export default {
  id: "ticket",
  funcao: () => tickets.cmdTicket,
  apelidos: ["tickets", "suporte"],
  gerenciavel: true,
};
