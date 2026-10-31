// conhecidos.js — impressões de conteúdo proibido já confirmado pelo dono do
// bot (31 out 2026, P3a). SÓ impressões: o repositório é público, e o conteúdo
// original nunca entra aqui (nem em teste, nem em comentário).
//
// Casar com uma entrada daqui = certeza ALTA (punição automática). Os casos que
// o dono julga pela fila (`&caso`, ✅/❌) NÃO entram nesta lista: ficam no banco
// da fila (modulos/moderacao/revisao.js) e chegam pelo `vereditoParecido`.
//
// Campos: `sha256` — do texto normalizado (regra em arte-texto.js:
// `impressoesDoTexto`); `dhash` — dHash 8×8 do bitmap (hash.js). `dhashExterno`
// marca o dHash calculado por OUTRA implementação: não dá para garantir que
// bata bit a bit com o nosso (o cinza do ponto, a redução), então ele vale só
// como referência e é comparado também com o "negativo" (o ponto claro ou escuro).

export const CONHECIDOS = Object.freeze([
  Object.freeze({
    id: "caso-1",
    // bio com arte em braille NSFW — 30 out 2026, conta banida pelo dono do bot.
    // 51 linhas não vazias (50 de arte, dois desenhos empilhados), bitmap 60×200.
    tipo: "perfil-texto", categoria: "sexual",
    sha256: Object.freeze(["a2213b462b39303f3aba0c4fbcd9beca06c10aaf6e3a75e335cce1bd9083ccdc"]),
    dhash: Object.freeze(["c37379279f3d6633"]),
    dhashExterno: true,
  }),
]);
