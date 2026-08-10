// ══════════════════════════════════════════════════════════
//  ids.js — normaliza IDs colados/mencionados pelo usuário
//
//  No Stoat as menções têm formatos próprios, e nem sempre iguais
//  aos do Discord:
//    <%01ABC…>  → CARGO      (é `%`, não `&` como no Discord)
//    <@01ABC…>  → usuário
//    <#01ABC…>  → canal
//
//  Ninguém deveria precisar saber disso: se a pessoa menciona o
//  cargo, o comando tem que entender. Estas funções aceitam menção
//  (em qualquer um dos formatos), ID puro, ou o ID com lixo em volta.
// ══════════════════════════════════════════════════════════

export const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// Remove a "casca" de qualquer menção e devolve só o ID.
// Aceita <%id>, <@id>, <@&id>, <#id>, "id" e id.
export function limparId(entrada) {
  let t = String(entrada ?? "").trim();
  if (!t) return "";
  t = t.replace(/^["'`]+|["'`]+$/g, "");        // aspas
  const m = t.match(/^<\s*[%@#&]{1,2}\s*([^>\s]+)\s*>$/);
  if (m) return m[1].trim();
  return t.replace(/[<>%@&#]/g, "").trim();     // formatos parciais/quebrados
}

// Igual a limparId, mas só devolve se for um ULID válido.
export function idValido(entrada) {
  const id = limparId(entrada);
  return ULID.test(id) ? id : "";
}

// Explica o que veio errado — mensagens de erro que ajudam de verdade.
export function descreverProblemaDeId(entrada, tipo = "cargo") {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return `faltou o ID do ${tipo}`;
  const limpo = limparId(bruto);
  if (!limpo) return `não consegui ler um ID em \`${bruto}\``;
  if (limpo.length !== 26) return `\`${limpo}\` tem ${limpo.length} caracteres (um ID tem 26)`;
  return `\`${limpo}\` não parece um ID válido`;
}
