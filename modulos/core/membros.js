// ══════════════════════════════════════════════════════════
//  membros.js — contar e listar membros de um servidor
//
//  Existe porque o objeto de servidor do Stoat quase nunca traz o total
//  de membros: `memberCount` costuma vir indefinido e é preciso buscar a
//  lista para saber o número. Três módulos precisavam disso — `&servidores`,
//  `&staff` e as boas-vindas — e cada um tinha (ou ia ter) sua própria
//  cópia, com seu próprio cache e seus próprios bugs. O de boas-vindas
//  lia só o campo direto e por isso mostrava `?` no lugar de `{membros}`.
//
//  Aqui a busca é uma só, com um cache só: buscar membros é caro e o
//  número não muda a cada segundo.
// ══════════════════════════════════════════════════════════

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

// Total de membros. Devolve número ou null — NUNCA 0 por falha, porque um
// servidor "com 0 membros" numa mensagem de boas-vindas é pior que um "?".
export async function contarMembros(server) {
  const direto = contarDireto(server);
  if (typeof direto === "number") return direto;

  const id = server?.id ?? server?._id;
  const c = id ? cache.get(id) : null;
  if (c && Date.now() - c.quando < CACHE_MS && typeof c.n === "number") return c.n;

  const lista = await listarMembros(server);
  return lista ? lista.length : null;
}

// Descarta o cache de um servidor (ou de todos). Usado quando alguém entra
// ou sai: sem isto, a mensagem de boas-vindas mostraria o total de até
// 10 minutos atrás — e "somos 1971" logo depois de alguém chegar está errado
// exatamente no momento em que a pessoa está lendo.
export function invalidar(serverId = null) {
  if (serverId) cache.delete(serverId);
  else cache.clear();
}
