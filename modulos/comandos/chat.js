// &chat — conversa com a IA (só nos servidores com IA)
import * as chat from "../ai/chat.js";

export default {
  id: "chat",
  funcao: () => chat.cmdChat,
  apelidos: ["ia"],
  gerenciavel: true,
  soIA: true,
  textoLivre: true,
};
