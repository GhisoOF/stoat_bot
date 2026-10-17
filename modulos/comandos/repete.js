// &repete — o bot repete um texto (anúncios rápidos)
import * as geral from "../moderacao/geral.js";

export default {
  id: "repete",
  funcao: () => geral.cmdRepete,
  gerenciavel: true,
  textoLivre: true,
};
