// &cargomudo — aposentado: só avisa que o silêncio agora é o timeout nativo
import * as admin from "../moderacao/comandos-admin.js";

export default {
  id: "cargomudo",
  funcao: () => admin.cmdCargoMudo,
  nomes: { en: "muterole" },
  apelidos: ["muterole", "mutedrole", "criarcargomudo"],
};
