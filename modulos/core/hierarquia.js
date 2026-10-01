// A hierarquia de cargos do Stoat, num lugar só (antes havia uma cópia no
// nivel.js e outra no debug). Regra do backend: rank MENOR = cargo mais ALTO;
// o bot só edita quem está abaixo do cargo mais alto dele, e só dá cargos que
// também estão abaixo (crates/delta/src/routes/servers/member_edit.rs).

export const idsDeCargos = (membro) => (membro?.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);

export function cargoDe(server, id) {
  try { return server?.roles?.get?.(id) ?? server?.roles?.[id] ?? null; } catch { return null; }
}

// rank de um cargo, ou null se o cargo não existe / não tem rank
export function rankDoCargo(server, id) {
  const r = cargoDe(server, id);
  return Number.isFinite(r?.rank) ? r.rank : null;
}

// o cargo mais alto de um membro (Infinity = sem cargo nenhum, o mais baixo)
export function rankDoMembro(server, membro) {
  const ranks = idsDeCargos(membro).map((id) => rankDoCargo(server, id)).filter((r) => r !== null);
  return ranks.length ? Math.min(...ranks) : Infinity;
}
