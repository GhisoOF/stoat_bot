// Canais +18 do servidor da casa (15–16 out 2026, pedidos de Ghieh).
//
// A geração de imagem desenhava +18 em qualquer servidor. Depois veio a
// lista do dono (`&servidores adulto add`); desde 16 out 2026 a IA só roda no
// servidor dele ("agora só ficará no meu server") e a lista saiu: o servidor
// que está PELO ID em `SERVIDOR`/`CHAT_SERVIDORES` é o da casa, e os canais
// marcados como **NSFW** no Stoat são os liberados. O "*" não conta —
// liberar tudo para todos não é escolher um servidor. Os canais comuns da
// casa continuam limpos.
//
// Em lugar nenhum saem menores em cena sexual nem pessoa real identificável
// (deepfake): o gerador recusa sempre, o chat confere a pergunta e a
// resposta, e a imagem pronta passa pelo modelo de visão antes de ir para o
// canal.

const nsfwDoCanal = new Map();   // canalId → o canal está marcado como NSFW?
const conferido = new Map();     // canalId → ms da última confirmação na API

export function servidorDaCasa(serverId) {
  const lista = (process.env.CHAT_SERVIDORES || process.env.SERVIDOR || "")
    .split(",").map((x) => x.trim()).filter((x) => x && x !== "*");
  return !!serverId && lista.includes(serverId);
}

// O chat anota o canal a cada conversa (a flag `nsfw` vem do Stoat). Um
// servidor inteiro marcado como NSFW no Stoat conta para todos os canais dele.
export function lembrarCanal(canal) {
  const id = canal?.id ?? canal?._id;
  if (id) nsfwDoCanal.set(id, canal?.nsfw === true || canal?.server?.nsfw === true);
}
export function canalNsfw(canalId) { return nsfwDoCanal.get(canalId) === true; }

// O cache da stoat.js pode estar velho (canal marcado como NSFW depois do
// boot sem o evento chegar, ou canal que nem estava no cache). No servidor da
// casa, um canal que o cache diz "não NSFW" é conferido direto na API — no
// máximo 1× por minuto por canal. Devolve o valor final.
export async function confirmarNsfw(client, canalId, { agora = Date.now(), forcar = false } = {}) {
  if (!canalId || canalNsfw(canalId)) return canalNsfw(canalId);
  if (!forcar && agora - (conferido.get(canalId) ?? 0) < 60_000) return false;
  conferido.set(canalId, agora);
  if (conferido.size > 2000) conferido.clear();
  try {
    const bruto = await client?.api?.get?.(`/channels/${canalId}`);
    if (bruto && typeof bruto === "object") nsfwDoCanal.set(canalId, bruto.nsfw === true);
  } catch {}
  return canalNsfw(canalId);
}

// Liberado AQUI = servidor da casa E canal NSFW.
export function liberadaAqui(serverId, canalId) {
  return servidorDaCasa(serverId) && canalNsfw(canalId);
}

// As últimas recusas (para o `&servidores adulto` mostrar o PORQUÊ).
const recusas = [];
export function registrarRecusa(canalId, motivo) {
  recusas.unshift({ quando: Date.now(), canalId, motivo: String(motivo ?? "").slice(0, 300) });
  recusas.length = Math.min(recusas.length, 5);
}
export function ultimasRecusas(canalId = null) {
  return recusas.filter((r) => !canalId || r.canalId === canalId);
}
