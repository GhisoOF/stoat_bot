
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
  // (etapa 4b) `lang` também pode ser "es"
  const L = (pt, en, es) => (lang === "es" ? es : lang === "en" ? en : pt);
  const TRADUCAO = {
    // o Stoat diz QUAL permissão faltou (campo `permission`) — antes a mensagem
    // listava sempre "AssignRoles, TimeoutMembers…", mesmo quando era outra
    MissingPermission: e?.permission
      ? L(`falta ao bot a permissão **${e.permission}** aqui`, `the bot lacks the **${e.permission}** permission here`, `al bot le falta el permiso **${e.permission}** aquí`)
      : L("falta ao bot uma permissão necessária", "the bot lacks a required permission", "al bot le falta un permiso necesario"),
    NotElevated: L(
      "o cargo do bot está abaixo do cargo da pessoa — suba o cargo do bot",
      "the bot's role is below the target's — move the bot's role up",
      "el rol del bot está por debajo del de la persona — sube el rol del bot"),
    NotFound: L("membro ou cargo não encontrado", "member or role not found", "miembro o rol no encontrado"),
    InvalidRole: L("cargo inválido ou apagado", "invalid or deleted role", "rol inválido o eliminado"),
    InvalidOperation: L("o Stoat recusou a operação", "the Stoat refused the operation", "Stoat rechazó la operación"),
    MissingUserPermission: L("falta ao bot uma permissão de usuário", "the bot lacks a required user permission", "al bot le falta un permiso de usuario"),
    DatabaseError: L("o banco de dados do Stoat recusou a operação (DatabaseError)", "the Stoat's database refused the operation (DatabaseError)", "la base de datos de Stoat rechazó la operación (DatabaseError)"),
    IsElevated: L("a pessoa tem a permissão TimeoutMembers — o Stoat não deixa ninguém silenciá-la", "the person has the TimeoutMembers permission — the Stoat doesn't let anyone time them out", "la persona tiene el permiso TimeoutMembers — Stoat no deja que nadie la silencie"),
    CannotTimeoutYourself: L("o bot não pode silenciar a si mesmo", "the bot can't time itself out", "el bot no puede silenciarse a sí mismo"),
  };
  if (tipo && TRADUCAO[tipo]) return TRADUCAO[tipo];
  if (typeof e?.message === "string" && e.message) return e.message;
  if (tipo) return String(tipo);
  try { const j = JSON.stringify(e); if (j && j !== "{}") return j.slice(0, 120); } catch {}
  return L("erro desconhecido", "unknown error", "error desconocido");
}
