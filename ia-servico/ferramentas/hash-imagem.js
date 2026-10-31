// hash-imagem.js — o dHash 8×8 de uma imagem do CDN do Stoat (31 out 2026, P3a).
//
// Não é ferramenta da IA (não está no ferramentas/index.js): é a rota
// /hash-imagem, que o bot chama ANTES do modelo de visão na moderação do perfil
// (o que o dono já julgou não gasta GPU). Baixa com os mesmos limites do
// ver_imagem (só o CDN do Stoat, teto de bytes e de pixels, só formato de foto),
// reduz a 9×8 em tons de cinza e compara com a MESMA conta do bot
// (modulos/moderacao/hash.js). Nada é guardado: os bytes morrem aqui.

import { hostPermitido, baixarLimitado, sharp, FORMATOS, MAX_PIXELS } from "./ver-imagem.js";
import { dhash, LARGURA, ALTURA } from "../../modulos/moderacao/hash.js";

// A conta, a partir dos bytes (separada para testar sem rede).
export async function hashDoBuffer(buffer) {
  const s = await sharp();
  const meta = await s(buffer, { limitInputPixels: MAX_PIXELS }).metadata().catch(() => null);
  if (!meta || !FORMATOS.has(meta.format)) return { erro: `formato de imagem não aceito (${meta?.format ?? "desconhecido"})` };
  const { data, info } = await s(buffer, { limitInputPixels: MAX_PIXELS, animated: false })
    .rotate()
    .flatten({ background: "#111111" })   // transparência vira fundo escuro (o mesmo do ver_imagem)
    .greyscale()
    .resize(LARGURA, ALTURA, { fit: "fill" })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== LARGURA || info.height !== ALTURA || info.channels !== 1) return { erro: "redução inesperada da imagem" };
  return { dhash: dhash(data, LARGURA, ALTURA) };
}

export async function hashImagem({ url }) {
  const v = hostPermitido(String(url ?? ""));
  if (!v.ok) return { erro: v.motivo };
  try {
    return await hashDoBuffer(await baixarLimitado(url));
  } catch (e) {
    return { erro: `não consegui calcular o hash: ${e?.message ?? e}` };
  }
}
