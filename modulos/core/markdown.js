// markdown.js — escape de texto para dentro de uma célula de tabela markdown (2 nov 2026, P4.1,
// CodeQL "incomplete string escaping"). Fonte única: a tabela de comandos do README
// (ajuda-registro.js) e a de variáveis (scripts/gerar-readme.js) passam por aqui.
//
// A ordem importa: a barra invertida PRIMEIRO (senão um `\` do texto, colado no `\|` que o escape
// põe, vira `\\|` — barra escapada + `|` solto, que quebra a célula); depois o `|`; a quebra de
// linha vira espaço (uma linha da tabela é uma linha do arquivo).
export function celulaDeTabela(texto) {
  return String(texto ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, " ");
}
