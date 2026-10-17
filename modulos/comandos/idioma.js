// &idioma — idioma do bot neste servidor
import * as i18n from "../core/i18n.js";

export default {
  id: "idioma",
  funcao: () => i18n.cmdIdioma,
  nomes: { en: "language" },
  apelidos: ["language", "lang"],
  essencial: true,
  qualquerCanal: true,
};
