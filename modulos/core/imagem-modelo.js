// Qual modelo de imagem o gerador embutido (stable-diffusion.cpp) usa — num
// lugar só, para o gerador (ia-servico), o pré-download do arranque
// (iniciar.js) e o tempo que o chat espera (chat.js) nunca discordarem.
//
//   SD_MODELO_TIPO=z-image     (padrão) Z-Image-Turbo: difusão + VAE + Qwen3-4B
//   SD_MODELO_TIPO=qwen-image  Qwen-Image 2.1: difusão + VAE + Qwen3-VL-8B
//                              (15 out 2026, pedido de Ghieh). Arquivo com
//                              "turbo" no nome = 8 passos e cfg 1 (destilado);
//                              sem "turbo" = o modelo base, ~20 passos.
//   SD_MODELO_TIPO=sd          SD-Turbo clássico (um arquivo só)

export const URLS_PADRAO = {
  "z-image": {
    difusao: "https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf",
    vae:     "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors",
    llm:     "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
  },
  "qwen-image": {
    difusao: "https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-Quantized/resolve/main/qwen-image-2.1-UC-Q8_0.gguf",
    vae:     "https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-Quantized/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors",
    llm:     "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3VL-8B-Instruct-Q4_K_M.gguf",
  },
  sd: { modelo: "https://huggingface.co/stabilityai/sd-turbo/resolve/main/sd_turbo.safetensors" },
};

// O sigma do checkpoint Turbo (model_index.json do Qwen-Image-2.1-Turbo; o
// sd.cpp fixado no Dockerfile ainda não tem o preset, então vai por --sigmas).
export const SIGMAS_QWEN_TURBO = "1.0,0.978453,0.95418,0.926626,0.89508,0.845148,0.704534,0.414568,0.0";

export function tipoDoModelo(env = process.env) {
  const t = String(env.SD_MODELO_TIPO || "z-image").trim().toLowerCase();
  if (/^qwen/.test(t)) return "qwen-image";
  if (t === "sd" || t === "sd-turbo") return "sd";
  return "z-image";
}

// As URLs em uso (o .env manda; sem ele, as de fábrica do tipo)
export function urlsDoModelo(env = process.env) {
  const tipo = tipoDoModelo(env);
  const p = URLS_PADRAO[tipo];
  if (tipo === "z-image") return { difusao: env.SD_Z_DIFUSAO_URL || p.difusao, vae: env.SD_Z_VAE_URL || p.vae, llm: env.SD_Z_LLM_URL || p.llm };
  if (tipo === "qwen-image") return { difusao: env.SD_Q_DIFUSAO_URL || p.difusao, vae: env.SD_Q_VAE_URL || p.vae, llm: env.SD_Q_LLM_URL || p.llm };
  return { modelo: env.SD_MODELO_URL || p.modelo };
}

// O que baixar no arranque: [rótulo, url]
export function arquivosParaBaixar(env = process.env) {
  const u = urlsDoModelo(env);
  if (u.modelo) return [["modelo de imagem", u.modelo]];
  return [["modelo de difusão", u.difusao], ["VAE", u.vae], ["LLM do prompt", u.llm]];
}

export const ehTurbo = (env = process.env) => tipoDoModelo(env) !== "qwen-image" || /turbo/i.test(urlsDoModelo(env).difusao ?? "");

// Modelo sem o filtro de segurança do fabricante ("uncensored", "-UC-"): toda
// imagem passa pela visão antes de sair, em qualquer servidor.
export function modeloSemFiltro(env = process.env) {
  if (String(env.IMAGEM_SEM_FILTRO ?? "").trim() === "1") return true;
  const u = urlsDoModelo(env);
  return /uncensored|abliterat|[-_]uc[-_.]/i.test(u.difusao ?? u.modelo ?? "");
}

// Quanto o gerador pode levar. O Qwen-Image base (20 passos) numa iGPU leva
// minutos: ~4 min a 512² no MiniPC (Radeon 780M), ~20 min a 1024².
export function tempoDeGeracaoMs(env = process.env) {
  const definido = Number(env.IMAGEM_GERACAO_TIMEOUT_MS);
  if (definido > 0) return definido;
  if (tipoDoModelo(env) === "qwen-image") return ehTurbo(env) ? 600_000 : 1_200_000;
  return 420_000;
}

// Lado máximo da imagem (px). Base do Qwen: 512 por padrão (o tempo cresce
// com a área); os Turbo: 768.
export function ladoMaximo(env = process.env) {
  const definido = Number(env.IMAGEM_LADO_GERACAO);
  if (definido > 0) return definido;
  return tipoDoModelo(env) === "qwen-image" && !ehTurbo(env) ? 512 : 768;
}
