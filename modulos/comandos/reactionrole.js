// &reactionrole — cargos por reação
import * as reactionRoles from "../ferramentas/reaction-roles.js";

export default {
  id: "reactionrole",
  funcao: () => reactionRoles.cmdReactionRole,
  apelidos: ["rr", "reactionroles"],
  gerenciavel: true,
};
