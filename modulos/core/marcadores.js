// "<nome>" some no Stoat (4 out 2026).
//
// O cliente do Stoat trata qualquer `<palavra>` como tag HTML e a esconde —
// até dentro de código. A ajuda inteira usa esse jeito de escrever parâmetro
// (`&game pontos <atributo> [quantos]`, `&game cambio <qtd> <moeda> para
// <moeda>`), e na tela aparecia "&game pontos [quantos]" e "&game cambio
// para". Aqui o marcador vira ‹atributo› (aspas angulares simples, que o
// Stoat mostra). Menções (<@id>, <#id>, <%id>), links (<https://…>) e emoji
// personalizado ficam como estão.

const MENCAO = /^[@#%][0-9A-HJKMNP-TV-Z]{26}$/i;
export function protegerMarcadores(texto) {
  if (typeof texto !== "string" || !texto.includes("<")) return texto;
  return texto.replace(/<(?![\s/])([^<>\n]{1,60}?)>/g, (todo, dentro) => {
    // menções (<@id>, <#id>, <%id>) e o que começa como uma: não é tag HTML, o Stoat não esconde
    if (MENCAO.test(dentro) || /^[@#%]/.test(dentro)) return todo;
    if (/^(https?:\/\/|mailto:)/i.test(dentro)) return todo;     // <https://…> (link sem prévia)
    if (/^a?:[\w~-]+:[\w-]+$/.test(dentro)) return todo;         // <:emoji:id>
    if (/^@everyone$|^@online$/i.test(dentro)) return todo;
    return `‹${dentro}›`;
  });
}
