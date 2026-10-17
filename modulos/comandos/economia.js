// &economia — a moeda do servidor (minerar, loja de cargos, ranking)
import * as economiaMod from "../ferramentas/economia.js";

export default {
  id: "economia",
  funcao: () => economiaMod.cmdEconomia,
  nomes: { en: "economy" },
  apelidos: ["economy", "eco"],
  gerenciavel: true,
};
