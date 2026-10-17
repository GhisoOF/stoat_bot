// &fuso — relógio com vários fusos
import * as fuso from "../ferramentas/fuso.js";

export default {
  id: "fuso",
  funcao: () => fuso.cmdFuso,
  nomes: { en: "timezone" },
  apelidos: ["fusos", "hora", "timezone", "timezones", "tz", "clock"],
  gerenciavel: true,
};
