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

// ── Editar os cargos de alguém sem tropeçar em cargo apagado ─────────────────
// O backend recusa (InvalidRole) qualquer cargo que esteja SENDO ADICIONADO e
// não exista. A lista de cargos que a stoat.js guarda do membro pode ter um
// cargo que já foi apagado (o servidor apagou, o cache não soube): ao reenviar
// a lista inteira, esse id conta como "adicionado" e a edição toda morre.
// Foi o "Não consegui abrir o ticket: cargo inválido ou apagado" de 2 out 2026.
// Aqui: os cargos atuais passam pelo cache do SERVIDOR (que sabe o que existe),
// e um cargo recém-criado que o servidor ainda não enxerga ganha mais uma chance.
export function semCargosApagados(server, ids) {
  const lista = server?.roles;
  const conhecido = typeof lista?.get === "function" ? lista.size > 0 : (lista && Object.keys(lista).length > 0);
  if (!conhecido) return [...ids];   // sem a lista de cargos, não dá para julgar
  return ids.filter((id) => !!cargoDe(server, id));
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// `calcular(atuais)` devolve a lista nova de cargos (ex.: atuais + 1, atuais − 1)
export async function editarCargos(server, membro, calcular, { tentativas = 3, esperaMs = 600 } = {}) {
  for (let t = 1; ; t++) {
    const atuais = semCargosApagados(server, idsDeCargos(membro));
    try {
      return await membro.edit({ roles: [...new Set(calcular(atuais))] });
    } catch (e) {
      const corpo = typeof e === "string" ? e : (e?.message ?? JSON.stringify(e?.response?.data ?? e ?? ""));
      if (!/InvalidRole/.test(corpo) || t >= tentativas) throw e;
      await dormir(esperaMs * t);   // o cargo acabou de nascer e o servidor ainda não o vê
    }
  }
}
