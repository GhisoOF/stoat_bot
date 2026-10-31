// (P2, 31 out 2026) este arquivo esvaziou:
// - a ajuda (&help), o &info (era &sobre) e o &ping foram para
//   modulos/moderacao/ajuda.js e modulos/moderacao/info.js;
// - &kick, &ban e o alvo deles foram para modulos/moderacao/punir.js; o &userinfo,
//   para modulos/moderacao/userinfo.js; o &repete virou apelido do &embed.
// Fica só a compatibilidade: o chat.js (IA) lê os verbetes por aqui — a fonte é o
// registro (pedido à IA nas notas: importar `detalhesDoRegistro` de
// core/ajuda-registro.js; depois disso, este arquivo pode ser apagado).
import { detalhesDoRegistro } from "../core/ajuda-registro.js";
export const construirDetalhes = (P = "&", lang = "pt", idioma = lang) => detalhesDoRegistro(P, idioma);
