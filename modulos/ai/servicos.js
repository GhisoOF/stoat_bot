// servicos.js — o que o bot, o ia-servico e o voz-servico dividem (31 out 2026, P1).
//
// • A chave do ia-servico é lida num lugar só: IA_SERVICO_CHAVE ou IA_CHAVE (antes o
//   serviço aceitava as duas e o bot só a primeira — com IA_CHAVE no .env, o bot
//   batia sem chave e levava 401).
// • Cada processo filho (Piper, ffmpeg, yt-dlp, sd.cpp, curl) recebe só o ambiente de
//   que precisa para rodar: nada de BOT_TOKEN, GITHUB_TOKEN, SPOTIFY_SECRET ou as
//   chaves dos serviços no ambiente de um programa de fora (R10).

export const chaveServicoIA = () => process.env.IA_SERVICO_CHAVE || process.env.IA_CHAVE || "";

// O que um binário comum precisa para achar a si mesmo, as bibliotecas e a GPU.
const BASICAS = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "LD_LIBRARY_PATH"];
// Ajustes de GPU (Vulkan/ROCm/CUDA) que quem hospeda põe no .env para o sd.cpp e o
// llama — não são segredo e o binário precisa deles.
const PREFIXOS_GPU = /^(GGML_|VK_|HSA_|ROC|HIP_|CUDA_|AMD_|MESA_|RADV_)/;

export function ambienteMinimo(extra = {}, { gpu = false } = {}) {
  const env = {};
  for (const k of BASICAS) if (process.env[k] != null) env[k] = process.env[k];
  if (gpu) for (const [k, v] of Object.entries(process.env)) if (PREFIXOS_GPU.test(k)) env[k] = v;
  return { ...env, ...extra };
}
