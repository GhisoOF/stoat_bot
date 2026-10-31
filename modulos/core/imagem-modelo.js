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

// O gerador de imagem só existe com IMAGEM=1 no .env (31 out 2026, P2): vazio é
// desligado — nada de baixar ~6–13 GB num volume novo sem ninguém ter pedido. Um
// lugar só para o boot (download), o ia-servico (a ferramenta) e o bot.
const DESLIGADO = new Set(["0", "false", "nao", "não", "off", "no"]);
export function imagemPedida(env = process.env) {
  const v = String(env.IMAGEM ?? "").trim().toLowerCase();
  return !!v && !DESLIGADO.has(v);
}

export const URLS_PADRAO = {
  "z-image": {
    difusao: "https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf",
    vae:     "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors",
    llm:     "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
  },
  "qwen-image": {
    // (22 out 2026) os pesos oficiais — antes era o "Uncensored" (abenzerps)
    difusao: "https://huggingface.co/unsloth/Qwen-Image-2.1-GGUF/resolve/main/qwen-image-2.1-Q8_0.gguf",
    vae:     "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors",
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

// (31 out 2026, R10) URL de modelo só do Hugging Face, por https, no formato
// usuario/repo/resolve/<ref>/<arquivo>. Regex fechada (sem grupo aninhado), sem
// "..", sem query: o .env não aponta o download para outro lugar da rede.
const URL_HF = /^(?!.*\.\.)https:\/\/huggingface\.co\/[A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95}\/resolve\/[\w.-]{1,64}\/[\w.\/-]{1,300}$/;
export const urlDeModeloValida = (url) => typeof url === "string" && URL_HF.test(url);

// O que baixar no arranque: [rótulo, url]. URL fora do padrão lança erro.
export function arquivosParaBaixar(env = process.env) {
  const u = urlsDoModelo(env);
  const lista = u.modelo ? [["modelo de imagem", u.modelo]]
    : [["modelo de difusão", u.difusao], ["VAE", u.vae], ["LLM do prompt", u.llm]];
  for (const [rotulo, url] of lista) {
    if (!urlDeModeloValida(url)) throw new Error(`${rotulo}: a URL tem de ser https://huggingface.co/<usuario>/<repo>/resolve/<ref>/<arquivo>`);
  }
  return lista;
}

export const ehTurbo = (env = process.env) => tipoDoModelo(env) !== "qwen-image" || /turbo/i.test(urlsDoModelo(env).difusao ?? "");

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
