// &musica — música na call
import * as musicaCmd from "../ferramentas/musica.js";

export default {
  id: "musica",
  funcao: () => musicaCmd.cmdMusica,
  nomes: { en: "music" },
  apelidos: ["m", "music", "play", "tocar"],
  gerenciavel: true,
  voz: true,
  textoLivre: true,
};
