
// Devolve SEMPRE um objeto, venha o erro em que formato vier.
export function normalizarErro(e) {
  if (typeof e === "string") {
    const t = e.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try { return JSON.parse(t); } catch { return { message: e }; }
    }
    return { message: e };
  }
  // Erro de HTTP com o corpo da API em `response.data` (o Stoat responde
  // {"type":"NotElevated",…}): o tipo está lá, não no `message`.
  if (!e?.type && e?.response?.data && typeof e.response.data === "object" && e.response.data.type) {
    return { ...e.response.data, _original: e };
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

export function descreverErro(e, lang = "pt") {
  e = normalizarErro(e);
  const tipo = e?.type ?? e?.error ?? e?.code;
  const TRADUCAO = {
    // o Stoat diz QUAL permissão faltou (campo `permission`) — antes a mensagem
    // listava sempre "AssignRoles, TimeoutMembers…", mesmo quando era outra
    MissingPermission: e?.permission
      ? (lang === "en" ? `the bot lacks the **${e.permission}** permission here` : `falta ao bot a permissão **${e.permission}** aqui`)
      : (lang === "en" ? "the bot lacks a required permission" : "falta ao bot uma permissão necessária"),
    NotElevated: lang === "en"
      ? "the bot's role is below the target's — move the bot's role up"
      : "o cargo do bot está abaixo do cargo da pessoa — suba o cargo do bot",
    NotFound: lang === "en" ? "member or role not found" : "membro ou cargo não encontrado",
    InvalidRole: lang === "en" ? "invalid or deleted role" : "cargo inválido ou apagado",
    InvalidOperation: lang === "en" ? "the Stoat refused the operation" : "o Stoat recusou a operação",
    MissingUserPermission: lang === "en" ? "the bot lacks a required user permission" : "falta ao bot uma permissão de usuário",
    DatabaseError: lang === "en" ? "the Stoat's database refused the operation (DatabaseError)" : "o banco de dados do Stoat recusou a operação (DatabaseError)",
    IsElevated: lang === "en" ? "the person has the TimeoutMembers permission — the Stoat doesn't let anyone time them out" : "a pessoa tem a permissão TimeoutMembers — o Stoat não deixa ninguém silenciá-la",
    CannotTimeoutYourself: lang === "en" ? "the bot can't time itself out" : "o bot não pode silenciar a si mesmo",
  };
  if (tipo && TRADUCAO[tipo]) return TRADUCAO[tipo];
  if (typeof e?.message === "string" && e.message) return e.message;
  if (tipo) return String(tipo);
  try { const j = JSON.stringify(e); if (j && j !== "{}") return j.slice(0, 120); } catch {}
  return lang === "en" ? "unknown error" : "erro desconhecido";
}
