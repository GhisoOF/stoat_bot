// ══════════════════════════════════════════════════════════
//  erros.js — ler o que a API do Stoat realmente disse
//
//  A lib nem sempre rejeita com um `Error`. Ela rejeita, dependendo do
//  caminho, com:
//
//    • um objeto:  { type: "MissingPermission" }
//    • uma STRING contendo JSON:  '{"type":"NotFound","location":"crates/…"}'
//    • um Error cujo `message` é esse JSON
//
//  Ler `.message` direto dá `undefined` nos dois primeiros casos — foi assim
//  que nasceram o `[PUNIÇÃO][vigia] …: undefined` e o `[BANGLOBAL] auto:
//  falha em X: undefined`. E o caso da string é mais traiçoeiro que parece:
//  quem testava `e.type === "NotFound"` também não via nada, porque o `type`
//  estava dentro do texto, não no objeto. O vigia repetiu o mesmo erro a cada
//  minuto por isso — a condição que o encerraria estava a um JSON.parse de
//  distância.
//
//  Este módulo vive em `core/` de propósito: `automod-engine`, `ban-global` e
//  quem mais precisar importam daqui, sem um depender do outro.
// ══════════════════════════════════════════════════════════

// Devolve SEMPRE um objeto, venha o erro em que formato vier.
export function normalizarErro(e) {
  if (typeof e === "string") {
    const t = e.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try { return JSON.parse(t); } catch { return { message: e }; }
    }
    return { message: e };
  }
  // Alguns caminhos embrulham o JSON dentro de `message`.
  if (typeof e?.message === "string" && e.message.trim().startsWith("{") && !e.type) {
    try { return { ...JSON.parse(e.message), _original: e }; } catch { return e; }
  }
  return e ?? {};
}

// O tipo da falha ("NotFound", "MissingPermission"…), em qualquer formato.
export function tipoDoErro(e) {
  const o = normalizarErro(e);
  return o?.type ?? o?.error ?? o?.code ?? null;
}

// Erros da API do Stoat raramente são `Error`: costumam vir como objetos
// `{ type: "MissingPermission" }` ou como a string JSON acima. Ler `.message`
// dava `undefined` — foi o que apareceu para o moderador como "falha ao
// silenciar (undefined)", uma mensagem que não ajuda ninguém a consertar nada.
export function descreverErro(e, lang = "pt") {
  e = normalizarErro(e);
  const tipo = e?.type ?? e?.error ?? e?.code;
  const TRADUCAO = {
    MissingPermission: lang === "en"
      ? "the bot lacks the **AssignRoles** permission (or the silence role is above the bot's)"
      : "o bot não tem a permissão **AssignRoles** (ou o cargo de silêncio está acima do cargo dele)",
    NotElevated: lang === "en"
      ? "the bot's role is below the target's — move the bot's role up"
      : "o cargo do bot está abaixo do cargo da pessoa — suba o cargo do bot",
    NotFound: lang === "en" ? "member or role not found" : "membro ou cargo não encontrado",
    InvalidRole: lang === "en" ? "invalid silence role" : "cargo de silêncio inválido",
    InvalidOperation: lang === "en" ? "the Stoat refused the operation" : "o Stoat recusou a operação",
    MissingUserPermission: lang === "en" ? "the bot lacks a required user permission" : "falta ao bot uma permissão de usuário",
  };
  if (tipo && TRADUCAO[tipo]) return TRADUCAO[tipo];
  if (typeof e?.message === "string" && e.message) return e.message;
  if (tipo) return String(tipo);
  try { const j = JSON.stringify(e); if (j && j !== "{}") return j.slice(0, 120); } catch {}
  return lang === "en" ? "unknown error" : "erro desconhecido";
}
