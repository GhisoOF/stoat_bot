// &entretenimento — ship, briga, cowsay, bola8…
import * as entretenimento from "../ferramentas/entretenimento.js";

export default {
  id: "entretenimento",
  funcao: () => entretenimento.cmdEntretenimento,
  nomes: { en: "entertainment" },
  apelidos: ["entertainment", "fun", "ent", "entreterimento"],
  gerenciavel: true,
  textoLivre: true,
};
