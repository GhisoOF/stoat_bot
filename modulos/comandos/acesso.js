// &acesso — quem usa os comandos de moderação e onde
import * as acessoMod from "../moderacao/acesso.js";

export default {
  id: "acesso",
  funcao: () => acessoMod.cmdAcesso,
  nomes: { en: "access" },
  apelidos: ["access"],
  gerenciavel: true,
  qualquerCanal: true,
};
