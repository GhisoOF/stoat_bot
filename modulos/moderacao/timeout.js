// Timeout nativo do Stoat — o silêncio da Judy (manual e do automod).
//
// Substitui o cargo de silêncio (decisão de Ghieh, 1 out 2026). O cargo dependia
// de três coisas que falhavam caladas: existir neste servidor, estar acima do
// autorole e de todo cargo de membro, e negar em CADA canal (canal com
// permissão própria furava). O timeout é um campo do membro: o próprio Stoat
// deixa a pessoa só VER o servidor até a hora marcada e o tira sozinho
// (crates/core/permissions: are_we_timed_out). Precisa de TimeoutMembers; quem
// tem TimeoutMembers não pode levar timeout (IsElevated); a pessoa precisa
// estar abaixo do cargo do bot (NotElevated).

export const MAX_TIMEOUT_MS = 28 * 24 * 3600e3;

// Silêncio do modo `confirmar`: dura até a staff decidir, com teto — o cargo
// antigo não tinha prazo, e um alerta esquecido prendia a pessoa para sempre.
export const CONFIRMAR_MS = () => Math.min(MAX_TIMEOUT_MS, Number(process.env.AUTOMOD_CONFIRMAR_HORAS || 24) * 3600e3);

export async function aplicarTimeout(server, userId, ms) {
  const member = await server.fetchMember(userId);
  if (!member) throw new Error("membro não encontrado no servidor");
  const ate = new Date(Date.now() + Math.max(1000, Math.min(ms, MAX_TIMEOUT_MS)));
  await member.edit({ timeout: ate.toISOString() });
  return ate;
}

// { saiu } se a pessoa não está mais no servidor; { removido } no mais.
export async function tirarTimeout(server, userId) {
  let member = null;
  try { member = await server.fetchMember(userId); } catch { member = null; }
  if (!member) return { saiu: true };
  const t = member.timeout ? new Date(member.timeout).getTime() : 0;
  if (t && t <= Date.now()) return { jaVencido: true };
  await member.edit({ remove: ["Timeout"] });
  return { removido: true };
}
