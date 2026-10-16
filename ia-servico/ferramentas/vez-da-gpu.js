// A vez da GPU (16 out 2026). Enquanto o sd.cpp desenha, a GPU (a iGPU do
// MiniPC, ~14,5 GB) é dele: uma imagem a moderar de OUTRO servidor chamava o
// modelo de visão (o Gemma, ~6 GB) no meio do desenho e o sd.cpp morria com
// "failed during weight preparation". Agora a visão espera o desenho acabar.
let desenho = null;   // Promise do desenho em curso

export async function desenhando(fn) {
  while (desenho) await desenho.catch(() => {});
  let fim;
  desenho = new Promise((r) => { fim = r; });
  try { return await fn(); }
  finally { const d = desenho; desenho = null; fim(); void d; }
}

// Quem precisa do modelo de visão espera (no máximo `maxMs`).
export async function esperarDesenho(maxMs = 10 * 60_000) {
  if (!desenho) return true;
  const limite = new Promise((r) => setTimeout(() => r(false), maxMs).unref?.());
  const ok = await Promise.race([desenho.then(() => true, () => true), limite]);
  return ok;
}
export const desenhoEmCurso = () => !!desenho;
