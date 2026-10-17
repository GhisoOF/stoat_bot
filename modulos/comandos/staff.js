// &staff — a equipe do servidor (mesma lista de cargos do &acesso)
import * as staff from "../moderacao/staff.js";

export default {
  id: "staff",
  funcao: () => staff.cmdStaff,
  nomes: { en: "staff" },
  apelidos: ["equipe", "team"],
  gerenciavel: true,
};
