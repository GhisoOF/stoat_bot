// prioridade.js — quem passa na frente quando a Judy está no limite (13 out 2026).
//
// Pedido de Ghieh: com a Judy em vários servidores, quando ela estiver no
// máximo (fila de conversas cheia, músicas demais tocando ao mesmo tempo), o
// dono do bot e o servidor dele vêm primeiro.
//
//   2 — o dono do bot (DONO / SUPER_ADMINS), em qualquer servidor
//   1 — o servidor do dono: o que ele criou (ownerId é um SUPER_ADMIN), os de
//       PRIORIDADE_SERVIDORES (ids separados por vírgula) e o RELATORIO_SERVIDOR
//   0 — o resto
// Fora do limite nada muda: todo mundo é atendido igual.

export function donosDoBot() {
  return new Set(String(process.env.SUPER_ADMINS || process.env.DONO || "").split(",").map((x) => x.trim()).filter(Boolean));
}

export function servidorPrioritario(serverId, server = null) {
  if (!serverId && !server) return false;
  const id = serverId ?? server?.id ?? server?._id;
  const lista = String(process.env.PRIORIDADE_SERVIDORES || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (id && lista.includes(id)) return true;
  if (id && process.env.RELATORIO_SERVIDOR && process.env.RELATORIO_SERVIDOR.trim() === id) return true;
  const dono = server?.ownerId ?? server?.owner?.id ?? null;
  return !!dono && donosDoBot().has(dono);
}

export function nivelDePrioridade({ userId = null, serverId = null, server = null } = {}) {
  if (userId && donosDoBot().has(userId)) return 2;
  return servidorPrioritario(serverId, server) ? 1 : 0;
}
