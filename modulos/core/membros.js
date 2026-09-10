
const CACHE_MS = Number(process.env.MEMBROS_CACHE_MS || 10 * 60_000);   // 10 min
const TIMEOUT_MS = 8000;

const cache = new Map();   // serverId → { lista, n, quando }

// Campos que às vezes já vêm preenchidos — grátis, sem chamada de rede.
function contarDireto(server) {
  const direto = server?.memberCount ?? server?.member_count
    ?? server?.approximate_member_count ?? server?.approximateMemberCount;
  if (typeof direto === "number") return direto;
  try {
    const m = server?.members;
    if (typeof m?.size === "number" && m.size > 0) return m.size;
    if (Array.isArray(m) && m.length) return m.length;
  } catch { /* objeto sem members acessível */ }
  return null;
}

// Busca a lista de membros (com cache). Devolve array ou null.
export async function listarMembros(server) {
  const id = server?.id ?? server?._id;
  if (!id) return null;

  const c = cache.get(id);
  if (c && Date.now() - c.quando < CACHE_MS && c.lista) return c.lista;

  // 1) cache local do cliente, quando o objeto já tiver a coleção
  try {
    const m = server?.members;
    if (m && typeof m.values === "function") {
      const lista = [...m.values()];
      if (lista.length) { cache.set(id, { lista, n: lista.length, quando: Date.now() }); return lista; }
    } else if (Array.isArray(m) && m.length) {
      cache.set(id, { lista: m, n: m.length, quando: Date.now() });
      return m;
    }
  } catch { /* segue para o fetch */ }

  // 2) busca na API
  if (typeof server?.fetchMembers !== "function") return null;
  try {
    const r = await Promise.race([
      server.fetchMembers(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const bruto = r?.members ?? r?.users ?? r ?? [];
    const lista = Array.isArray(bruto) ? bruto : (typeof bruto?.values === "function" ? [...bruto.values()] : null);
    if (lista) { cache.set(id, { lista, n: lista.length, quando: Date.now() }); return lista; }
  } catch (e) {
    console.log(`[MEMBROS] não consegui listar os membros de ${id}: ${e?.message ?? e}`);
  }
  return null;
}

export async function contarMembros(server) {
  const direto = contarDireto(server);
  if (typeof direto === "number") return direto;

  const id = server?.id ?? server?._id;
  const c = id ? cache.get(id) : null;
  if (c && Date.now() - c.quando < CACHE_MS && typeof c.n === "number") return c.n;

  const lista = await listarMembros(server);
  return lista ? lista.length : null;
}

export function invalidar(serverId = null) {
  if (serverId) cache.delete(serverId);
  else cache.clear();
}
