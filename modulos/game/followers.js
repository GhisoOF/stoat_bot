// Companheiros (D2, D23 — RPG v4): sobem com o dono, não usam equipamento (o kit
// da classe já está no ganho por nível) e, os que têm nome, saem pela ficha de
// estrelas. As classes, o kit e as fórmulas estão em regras.js; o catálogo
// (60 genéricos + os das obras) em conteudo/*.json.

import * as R from "./regras.js";
import { magiaDoCompanheiro } from "./combate.js";

export const CLASSES = R.CLASSES;
export const magiaDo = (catalogo) => magiaDoCompanheiro(catalogo);
