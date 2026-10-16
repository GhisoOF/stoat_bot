
const SD_URL       = (process.env.SD_URL || "").replace(/\/$/, "");
// Gerador embutido (stable-diffusion.cpp): usado quando não há SD_URL.
const SD_BIN       = process.env.SD_BIN || "/usr/local/bin/sd-cpp";
const SD_DIR       = process.env.SD_MODELOS_DIR || "/data/modelos-sd";
// Qual modelo (z-image · qwen-image · sd) e de onde vem: modulos/core/imagem-modelo.js
const SD_TIPO = tipoDoModelo();
const URLS = urlsDoModelo();
const IMAGEM_LIGADA = (process.env.IMAGEM ?? "1").trim() !== "0";

import { existsSync, mkdirSync, readFileSync, unlinkSync, renameSync } from "node:fs";
import { spawn as spawnProc, spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { moderarBuffer, visaoDisponivel } from "./ver-imagem.js";
import { desenhando } from "./vez-da-gpu.js";
import { tipoDoModelo, urlsDoModelo, ehTurbo, modeloSemFiltro, tempoDeGeracaoMs, ladoMaximo, SIGMAS_QWEN_TURBO } from "../../modulos/core/imagem-modelo.js";
const LADO_MAX     = ladoMaximo();
const PASSOS_MAX   = Number(process.env.IMAGEM_PASSOS_MAX || 30);
const TIMEOUT_MS   = tempoDeGeracaoMs();
const MAX_PIXELS   = Number(process.env.IMAGEM_MAX_PIXELS || 32_000_000);

// Reusa a reescrita do ver-imagem (mesma política, mesmo código).

let sharpMod = null;
async function sharp() {
  if (sharpMod) return sharpMod;
  sharpMod = (await import("sharp")).default;
  return sharpMod;
}

const MENOR   = /\b(crian[çc]as?|menor(?:es)?|adolescentes?|teens?|teenagers?|loli|shota|infantil|kids?|child(?:ren)?|underage|preteens?|toddlers?|bab(?:y|ies)|beb[êe]s?|schoolgirls?|schoolboys?|colegiais?|garotinh[ao]s?|menininh[ao]s?|novinh[ao]s?|ninfetas?|young\s+(?:girl|boy)s?|little\s+(?:girl|boy)s?|(?:[1-9]|1[0-7])\s*(anos|years?|yo|y\/o)\b)/i;
const SEXUAL  = /\b(nu[aá]?s?|nude?s?|nudez|nudity|naked|pelad[ao]s?|sem\s+roupa|topless|nsfw|sexo|sex|sexy|sexual\w*|er[óo]tic\w*|sensual\w*|lingerie|fetiche|fetish|hentai|porn\w*|explicit\w*|seminu\w*|seios|boobs?|nipples?|mamilos?|genit\w*|p[êe]nis|vagina|bunda|butt|ass|orgasm\w*|transa\w*|bdsm|bondage)\b/i;
const PESSOA_REAL = /\b(da|do|de)\s+[A-ZÀ-Ú][a-zà-ú]+\s+[A-ZÀ-Ú][a-zà-ú]+|celebridade|celebrity|famos[ao]/;
// Nome próprio logo depois de "estilo/personagem/anime…" é obra de ficção
// (16 out 2026: "no estilo de Final Fantasy" virava "pessoa real").
const OBRA_ANTES = /\b(estilo|style|personagem|personagens|character|characters|universo|universe|anime|mang[áa]|jogo|game|s[ée]rie|series|filme|movie|desenho|cartoon|franquia|franchise|fanart|cosplay)\b/i;
export function pessoaReal(p) {
  const t = String(p ?? "");
  const termo = t.match(/\b(celebridades?|celebrit(?:y|ies)|famos[ao]s?)\b/i);
  if (termo) return termo[0];
  const re = new RegExp(PESSOA_REAL.source, "g");
  for (const m of t.matchAll(re)) {
    if (!/^(da|do|de)\s/i.test(m[0])) return m[0];
    // obra citada nas 3 palavras antes do nome ("personagem nua de Street Fighter")
    if (!OBRA_ANTES.test(t.slice(0, m.index).trim().split(/\s+/).slice(-3).join(" "))) return m[0];
  }
  return null;
}
const GORE    = /\b(gore|decapita\w+|desmembr\w+|mutila\w+|v[íi]sceras|entranhas|tortura(?:ndo|r)?\b.*\b(real|pessoa)|corpo\s+esquartejado)\b/i;
const ODIO    = /\b(su[áa]stica|swastika|nazi\w*|kkk\b|supremac\w+)\b/i;

// `adulto`: o servidor (e o canal) liberaram +18 — quem decide é o bot, nunca
// o modelo (o flag vem do contexto da chamada, não dos argumentos da ferramenta).
// Menor + sexual e pessoa real + sexual continuam recusados EM QUALQUER servidor.
export function prompProibido(prompt, { adulto = false } = {}) {
  const p = String(prompt ?? "");
  if (MENOR.test(p) && SEXUAL.test(p)) {
    return "esse pedido combina menores com conteúdo sexualizado — recusado, sem exceção, e fica registrado no log.";
  }
  if (SEXUAL.test(p) && pessoaReal(p)) {
    return `nudez ou conteúdo sexual de pessoa real identificável é deepfake — recusado (trecho: "${pessoaReal(p)}"). Se for personagem ou estilo de uma obra, diga "personagem de…" ou "estilo de…".`;
  }
  if (GORE.test(p) && pessoaReal(p)) {
    return "violência explícita com pessoa real identificável — recusado.";
  }
  if (SEXUAL.test(p) && !adulto) {
    return "conteúdo +18 não está liberado aqui — só em servidor liberado pelo dono do bot, e só em canal marcado como NSFW.";
  }
  // canal +18 liberado (16 out 2026, "sem amarras"): gore e símbolos saem —
  // ficção sombria é do canal. Os limites acima continuam valendo.
  if (adulto) return null;
  if (GORE.test(p)) return "gore explícito não — posso fazer algo sombrio ou sinistro sem vísceras.";
  if (ODIO.test(p)) return "símbolos de ódio não saem daqui.";
  return null;
}

const NEGATIVO_FIXO = "nsfw, nude, naked, child, loli, underage, gore, dismemberment, watermark, text, low quality, deformed";
// no servidor liberado: tira só o "sem nudez"; criança/menor continua proibido
const NEGATIVO_ADULTO = "child, children, kid, loli, shota, underage, teen, young-looking, petite body, school uniform, watermark, text, low quality, deformed";

// ── A imagem pronta é conferida pelo modelo de visão (15 out 2026) ──────────
// O prompt sozinho não basta: o Z-Image (o padrão) nem usa prompt negativo, e
// às vezes desenha nudez que ninguém pediu. A descrição do modelo é lida como
// no automod de imagens: só vale o que ele AFIRMA ("sem nudez" não conta).
const NEGA = /\b(n[ãa]o|nenhum\w*|sem|nada\s+de|aus[êe]ncia|no|not|none|without|absent)\b/i;
// "sem roupa" / "without clothes" AFIRMAM nudez: viram "nua" antes de o "sem"
// derrubar a frase como negação
const afirmado = (descricao) => String(descricao ?? "")
  .replace(/\bsem\s+(nenhuma\s+)?roupas?\b|\bdespid[ao]s?\b/gi, "nua")
  .replace(/\b(without|no)\s+(any\s+)?cloth(es|ing)\b|\bunclothed\b|\bundressed\b/gi, "naked")
  .split(/[.;!?\n,]|\s+(?:mas|porém|but)\s+/i).filter((c) => !NEGA.test(c)).join(". ");
// Termos que, sozinhos, já indicam criança/adolescente — e os ambíguos
// ("girl", "garota", "menino"), que o modelo de visão usa também para
// adultos: esses só contam quando ele NÃO afirmou "IDADE: adulto".
const MENOR_FORTE = /\b(crian[çc]as?|garotinh[ao]s?|menininh[ao]s?|adolescentes?|infantil|beb[êe]s?|child(?:ren)?|kids?|toddlers?|bab(?:y|ies)|teen(?:ager)?s?|preteens?|minors?|menor(?:es)?\s+de\s+idade|underage|schoolgirls?|schoolboys?|colegiais?|uniforme\s+escolar|school\s+uniform|loli|shota|little\s+(?:girl|boy)s?)\b/i;
const MENOR_AMBIGUO = /\b(menin[ao]s?|garot[ao]s?|boys?|girls?|young)\b/i;
const SEXUAL_DESC = /\b(nu[ao]?s?|nudez|nudity|nude|naked|pelad[ao]s?|topless|seios?|breasts?|mamilos?|nipples?|genit\w*|p[êe]nis|vagina|ato\s+sexual|sexual\w*|sexo|sex|er[óo]tic\w*|pornogr\w*|lingerie|roupa\s+[íi]ntima|underwear)\b/i;
const MENOR_DESC  = /\b(crian[çc]as?|menin[ao]s?|garot[ao]s?|garotinh[ao]s?|adolescentes?|infantil|beb[êe]s?|child(?:ren)?|kids?|toddlers?|bab(?:y|ies)|teen(?:ager)?s?|minors?|boys?|girls?|schoolgirls?|uniforme\s+escolar|school\s+uniform)\b/i;
export function julgarSaida(descricao, { adulto = false, idade = null } = {}) {
  const d = afirmado(descricao);
  const sexual = SEXUAL_DESC.test(d);
  // com o veredito de idade do modelo (canal +18): "menor"/"incerto" descarta,
  // termo forte descarta, e o ambíguo só conta sem "IDADE: adulto"
  const menor = idade === "menor" || idade === "incerto" || MENOR_FORTE.test(d)
    || (idade === "adulto" ? false : (MENOR_AMBIGUO.test(d) || MENOR_DESC.test(d)));
  if (sexual && menor) return "a imagem saiu com alguém que aparenta ser menor numa cena com nudez — descartada";
  if (sexual && !adulto) return "a imagem saiu com nudez — +18 não está liberado aqui, então ela foi descartada";
  return null;
}

// A imagem pronta (JPEG) passa pela visão. No modo +18, sem visão ou com erro
// dela, a imagem NÃO sai (fecha no erro); fora dele, o filtro do prompt já
// barrou o pedido e a visão é uma segunda rede.
// `exigir`: modelo sem filtro do fabricante — sem conferência, nada sai.
export async function conferirSaida(jpeg, { adulto = false, exigir = adulto, moderar = moderarBuffer, temVisao = visaoDisponivel } = {}) {
  if (!temVisao()) return adulto ? "sem modelo de visão para conferir a imagem — +18 fica desligado"
    : exigir ? "sem modelo de visão para conferir a imagem — com este modelo, nada sai sem conferência" : null;
  const r = await moderar(jpeg, { adulta: adulto });
  if (r?.erro) {
    console.warn(`[IA][gerar_imagem] conferência da saída falhou: ${r.erro}`);
    return adulto ? "não consegui conferir a imagem antes de enviar — +18 não sai sem conferência"
      : exigir ? "não consegui conferir a imagem antes de enviar" : null;
  }
  const veredito = julgarSaida(r.descricao, { adulto, idade: r.idade ?? null });
  if (veredito) console.warn(`[IA][gerar_imagem] SAÍDA DESCARTADA (${adulto ? "+18" : "normal"}): ${String(r.descricao).replace(/\s+/g, " ").slice(0, 300)}`);
  return veredito;
}

const multiploDe64 = (n) => Math.max(256, Math.min(LADO_MAX, Math.round(n / 64) * 64));

export const definicao = {
  type: "function",
  function: {
    name: "gerar_imagem",
    description: "Gera uma imagem a partir de uma descrição em texto (Stable Diffusion local). Use quando pedirem para desenhar, criar, gerar ou imaginar uma imagem/arte/ilustração. A imagem sai anexada na sua resposta.",
    parameters: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "Descrição do que desenhar, em inglês de preferência (o modelo entende melhor). Detalhes de estilo ajudam: 'watercolor', 'pixel art', 'photo'…" },
        largura: { type: "number", description: `Largura em px (máx ${LADO_MAX})` },
        altura: { type: "number", description: `Altura em px (máx ${LADO_MAX})` },
      },
    },
  },
};

// ── Backend embutido (sd.cpp; Z-Image-Turbo por padrão, SD-Turbo com SD_MODELO_TIPO=sd) ──
// Baixa um arquivo de modelo pela URL e devolve o caminho local (uma vez só).
function baixarArquivo(url, rotulo) {
  const nome = basename(new URL(url).pathname);
  const destino = join(SD_DIR, nome);
  if (existsSync(destino)) return destino;
  try { mkdirSync(SD_DIR, { recursive: true }); } catch {}
  console.info(`[IA][gerar_imagem] baixando ${rotulo}: ${nome} (uma vez, fica no volume)…`);
  const tmp = `${destino}.baixando`;
  const r = spawnSync("curl", ["-fL", "--retry", "2", url, "-o", tmp], { stdio: "inherit" });
  if (r.status !== 0) {
    try { unlinkSync(tmp); } catch {}
    throw new Error(`download de "${rotulo}" (${nome}) falhou — confira a URL no .env e se o arquivo existe nesse repositório do Hugging Face`);
  }
  renameSync(tmp, destino);
  return destino;
}

function baixarModeloSD() {
  const SD_MODELO_URL = URLS.modelo;
  const nome = basename(new URL(SD_MODELO_URL).pathname);
  const destino = join(SD_DIR, nome);
  if (existsSync(destino)) return destino;
  try { mkdirSync(SD_DIR, { recursive: true }); } catch {}
  console.info(`[IA][gerar_imagem] primeiro uso: baixando ${nome} (uma vez, fica no volume)…`);
  const tmp = `${destino}.baixando`;
  const r = spawnSync("curl", ["-fL", "--retry", "2", SD_MODELO_URL, "-o", tmp], { stdio: "inherit" });
  if (r.status !== 0) { try { unlinkSync(tmp); } catch {} throw new Error("download do modelo de imagem falhou (rede? URL em SD_MODELO_URL?)"); }
  renameSync(tmp, destino);
  return destino;
}

// O sd.cpp usa semente FIXA por padrão: o mesmo prompt devolvia sempre a mesma
// imagem, o que parecia um bug de cache ("ele reenviou a figura de ontem").
const semente = () => Math.floor(Math.random() * 2_147_483_647);

// ─── Memória da GPU (12 out 2026) ────────────────────────────────────────────
// "sd.cpp saiu com 1: [ERROR] ggml_runner.cpp:898 - z_image segment 1/1
// (graph) failed during workspace capacity check": o sd.cpp mede a memória
// livre da GPU antes de rodar o grafo do Z-Image e ela não bastava — o LLM da
// conversa fica carregado na mesma iGPU (o llama-swap o mantém por 1 h), e no
// MiniPC a GPU só enxerga ~14,5 GB da RAM. Agora: antes de desenhar, o LLM é
// descarregado (ele volta sozinho na próxima mensagem, em segundos); se mesmo
// assim faltar memória, uma 2ª tentativa no modo econômico (o LLM do prompt
// na CPU e o VAE em blocos).
const RE_FALTA_MEMORIA = /capacity check|failed during weight preparation|workspace (?:preparation|allocation)|allocated capacity|ALLOC_FAILED|out of (?:device )?memory|OutOfDeviceMemory|failed to allocate|cannot allocate|not enough memory/i;
export const faltouMemoria = (txt) => RE_FALTA_MEMORIA.test(String(txt ?? ""));

const LLM_LOCAL = () => {
  const u = (process.env.LLM_URL || "").replace(/\/$/, "");
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(u) ? u : null;
};
// llama-swap: POST /api/models/unload descarrega os modelos (validado no MiniPC).
export async function liberarGpu({ log = console.info } = {}) {
  if ((process.env.IMAGEM_LIBERAR_GPU ?? "1").trim() === "0") return false;
  const base = LLM_LOCAL();
  if (!base) return false;   // LLM em outra máquina/online: não divide a GPU daqui
  try {
    const r = await fetch(`${base}/api/models/unload`, { method: "POST", signal: AbortSignal.timeout(15_000) });
    log(`[IMAGEM] GPU liberada para o desenho: LLM descarregado (${r.status}); ele volta sozinho na próxima mensagem`);
    return r.ok;
  } catch (e) {
    log(`[IMAGEM] não consegui descarregar o LLM antes de desenhar (${e?.message ?? e}) — sigo assim mesmo`);
    return false;
  }
}

// Desenha; se faltar memória na GPU, libera e tenta de novo no modo econômico.
export async function gerarComFolga(pedido, { gerar = gerarEmbutido, liberar = liberarGpu } = {}) {
  await liberar();
  try {
    return await gerar(pedido);
  } catch (e) {
    if (!faltouMemoria(e?.message)) throw e;
    console.warn(`[IMAGEM] faltou memória na GPU (${String(e.message).slice(0, 160)}) — 2ª tentativa no modo econômico`);
    await liberar();
    try {
      return await gerar({ ...pedido, economico: true });
    } catch (e2) {
      if (faltouMemoria(e2?.message)) {
        throw new Error("a GPU ficou sem memória para desenhar, mesmo com o LLM descarregado e no modo econômico — tenta uma imagem menor ou de novo daqui a pouco (IMAGEM_LADO_GERACAO no .env diminui o tamanho)");
      }
      throw e2;
    }
  }
}

// Os argumentos do sd.cpp para o Qwen-Image 2.1 (puro: testável sem o binário)
export function argsQwenImage({ difusao, vae, llm, texto, width, height, economico = false, negativo = NEGATIVO_FIXO, saida, env = process.env }) {
  const turbo = ehTurbo(env);
  const passos = String(Math.min(PASSOS_MAX, Number(env.IMAGEM_PASSOS || (turbo ? 8 : 20))));
  const cfg = env.IMAGEM_CFG || (turbo ? "1.0" : "6.0");
  const a = ["-M", "img_gen", "--diffusion-model", difusao, "--vae", vae, "--llm", llm,
    "-p", texto, "-W", String(width), "-H", String(height), "--steps", passos,
    "--cfg-scale", cfg, "--sampling-method", "euler", "--diffusion-fa", "--seed", String(semente()), "-o", saida];
  if (turbo) a.push("--sigmas", SIGMAS_QWEN_TURBO);   // destilado: cfg 1, sem prompt negativo
  else a.push("-n", negativo);                          // base: com cfg, o negativo vale
  if ((env.IMAGEM_OFFLOAD ?? "1").trim() !== "0") a.push("--offload-to-cpu");
  // O codificador de texto do Qwen-Image é o Qwen3-VL-8B (~5 GB): com a
  // difusão Q8 (7,6 GB) e o VAE, a iGPU (~14,5 GB) não fechava a conta e o
  // sd.cpp morria em "failed during weight preparation" (16 out 2026). Ele só
  // lê o prompt uma vez: vai para a CPU por padrão (IMAGEM_TE_GPU=1 devolve).
  const teNaGpu = (env.IMAGEM_TE_GPU ?? "0").trim() === "1";
  if (economico || !teNaGpu) a.push("--clip-on-cpu");
  if (economico) a.push("--vae-tiling");
  return a;
}

function gerarEmbutido({ texto, width, height, economico = false, negativo = NEGATIVO_FIXO }) {
  return new Promise((res, rej) => {
    const saida = join(tmpdir(), `sd-${Date.now()}.png`);
    const cfg = process.env.IMAGEM_CFG || "1.0";
    let finalArgs;

    if (SD_TIPO === "z-image") {
      // Z-Image-Turbo: difusão + VAE + LLM, todos em arquivos separados.
      // --diffusion-fa (flash attention) corta muito o uso de memória; sem
      // ele o buffer de computação passa de 2 GB. Os GGUF já vêm quantizados,
      // então NÃO se passa --type (reconverteria à toa).
      let difusao, vae, llm;
      try {
        difusao = baixarArquivo(URLS.difusao, "modelo de difusão");
        vae     = baixarArquivo(URLS.vae, "VAE");
        llm     = baixarArquivo(URLS.llm, "LLM do prompt");
      } catch (e) { return rej(e); }
      const passos = String(Math.min(PASSOS_MAX, Number(process.env.IMAGEM_PASSOS || 8)));
      finalArgs = ["-M", "img_gen", "--diffusion-model", difusao, "--vae", vae, "--llm", llm,
        "-p", texto, "-W", String(width), "-H", String(height), "--steps", passos,
        "--cfg-scale", cfg, "--diffusion-fa", "--seed", String(semente()), "-o", saida];
      // Em GPU com pouca VRAM dedicada (iGPU), descarregar pesos para a RAM
      // evita estourar. Desligue com IMAGEM_OFFLOAD=0 se a GPU tiver folga.
      if ((process.env.IMAGEM_OFFLOAD ?? "1").trim() !== "0") finalArgs.push("--offload-to-cpu");
      // modo econômico: o LLM do prompt (Qwen3-4B, ~2,5 GB) roda na CPU e o
      // VAE decodifica em blocos — sobra GPU para o grafo da difusão
      if (economico) finalArgs.push("--clip-on-cpu", "--vae-tiling");
    } else if (SD_TIPO === "qwen-image") {
      // Qwen-Image 2.1 (15 out 2026): difusão + VAE próprio (o do Qwen-Image
      // 1 e o do Z-Image NÃO servem) + Qwen3-VL-8B como codificador do texto.
      // Turbo (destilado): 8 passos, cfg 1 e o sigma do checkpoint. Base: ~20
      // passos com cfg (aí o prompt negativo vale — inclusive o "sem nudez").
      let difusao, vae, llm;
      try {
        difusao = baixarArquivo(URLS.difusao, "modelo de difusão");
        vae     = baixarArquivo(URLS.vae, "VAE");
        llm     = baixarArquivo(URLS.llm, "LLM do prompt");
      } catch (e) { return rej(e); }
      finalArgs = argsQwenImage({ difusao, vae, llm, texto, width, height, economico, negativo, saida });
    } else {
      let modelo;
      try { modelo = baixarModeloSD(); } catch (e) { return rej(e); }
      // SD-Turbo: pouquíssimos passos e cfg 1.0 — é o que o torna leve em CPU.
      const passos = String(Math.min(PASSOS_MAX, Number(process.env.IMAGEM_PASSOS || 4)));
      finalArgs = ["-M", "img_gen", "-m", modelo, "-p", texto, "-n", negativo,
        "-W", String(width), "-H", String(height), "--steps", passos,
        "--cfg-scale", cfg, "--type", "q8_0", "--seed", String(semente()), "-o", saida];
      if (economico) finalArgs.push("--vae-tiling", "--offload-to-cpu");
    }
    // stdout E stderr: o sd.cpp e o backend Vulkan do ggml espalham o
    // diagnóstico pelos dois (dispositivo, memória, operação não suportada).
    const p = spawnProc(SD_BIN, finalArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    const juntar = (d) => { if (err.length < 400_000) err += d; };
    p.stdout.on("data", juntar);
    p.stderr.on("data", juntar);
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, TIMEOUT_MS);
    p.on("error", (e) => { clearTimeout(t); rej(new Error(`sd.cpp: ${e.message}`)); });
    p.on("close", (c) => {
      clearTimeout(t);
      if (c !== 0 || !existsSync(saida)) {
        // Antes guardava só os ÚLTIMOS 200 caracteres: a causa (memória,
        // operação sem suporte no Vulkan…) vem antes e ficava de fora — o erro
        // chegava cortado em "odel compute failed". Agora o log do servidor
        // leva as linhas que importam e o final da saída; a pessoa recebe a
        // PRIMEIRA linha de erro, que é a causa, não a consequência.
        const linhas = err.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const relevantes = linhas.filter((l) => /error|fail|vulkan|ggml_vk|alloc|out of memory|unsupported|not supported|abort|assert/i.test(l));
        console.error(`[IMAGEM][sd.cpp] saiu com ${c}. Linhas relevantes:\n${relevantes.slice(0, 40).join("\n")}\n── final da saída ──\n${linhas.slice(-25).join("\n")}`);
        const causa = linhas.find((l) => /\[ERROR/.test(l)) ?? relevantes[0] ?? linhas.at(-1) ?? "";
        return rej(new Error(`sd.cpp saiu com ${c}: ${causa.slice(0, 300)}`));
      }
      const png = readFileSync(saida);
      try { unlinkSync(saida); } catch {}
      res(png);
    });
  });
}

export async function executar({ prompt, largura, altura }, contexto = {}) {
  const adulto = contexto?.imagemAdulta === true;
  const embutidoDisponivel = IMAGEM_LIGADA && existsSync(SD_BIN);
  if (!SD_URL && !embutidoDisponivel) {
    return { erro: "geração de imagem indisponível: o binário embutido (sd.cpp) não está nesta imagem e não há SD_URL apontando para um servidor A1111 (Forge/SD.Next) — ver ia-servico/README." };
  }
  const texto = String(prompt ?? "").trim();
  if (!texto) return { erro: "descreva o que desenhar." };
  const exigir = adulto || modeloSemFiltro();
  if (!adulto && exigir && !visaoDisponivel()) {
    return { erro: "geração desligada: o modelo de imagem configurado não tem filtro de segurança, e sem o modelo de visão (LLM_MODEL_VISAO) para conferir cada imagem eu não desenho." };
  }
  if (adulto && !visaoDisponivel()) {
    return { erro: "recusado: +18 precisa do modelo de visão para conferir a imagem antes de enviar, e ele não está configurado (LLM_MODEL_VISAO)." };
  }
  const recusa = prompProibido(texto, { adulto });
  if (recusa) {
    console.warn(`[IA][gerar_imagem] RECUSADO: ${texto.slice(0, 160)}`);
    return { erro: `recusado: ${recusa}` };
  }

  const corpo = {
    prompt: texto.slice(0, 1500),
    negative_prompt: adulto ? NEGATIVO_ADULTO : NEGATIVO_FIXO,
    width: multiploDe64(Number(largura) || LADO_MAX),
    height: multiploDe64(Number(altura) || LADO_MAX),
    steps: Math.min(PASSOS_MAX, Number(process.env.IMAGEM_PASSOS || 22)),
    cfg_scale: 6.5,
    sampler_name: process.env.IMAGEM_SAMPLER || "Euler a",
  };

  if (!SD_URL) {
    try {
      // a GPU é do desenho até ele acabar: a visão (moderação de outros
      // servidores) espera — e a conferência abaixo vem depois, já com a vez
      const png = await desenhando(() => gerarComFolga({ texto, width: corpo.width, height: corpo.height, negativo: corpo.negative_prompt }));
      const s2 = await sharp();
      const limpa = await s2(png, { limitInputPixels: MAX_PIXELS })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
      const barrada = await conferirSaida(limpa, { adulto, exigir });
      if (barrada) return { erro: `recusado: ${barrada}.` };
      return {
        ok: true,
        dimensoes: `${corpo.width}x${corpo.height}`,
        anexo_base64: limpa.toString("base64"),
        anexo_mime: "image/jpeg",
        anexo_nome: "judy-arte.jpg",
      };
    } catch (e) {
      return { erro: `gerador embutido: ${e?.message ?? e}` };
    }
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${SD_URL}/sdapi/v1/txt2img`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo), signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`SD HTTP ${r.status} — ${(await r.text()).slice(0, 150)}`);
    const j = await r.json();
    const b64 = j?.images?.[0];
    if (!b64) return { erro: "o gerador não devolveu imagem" };

    // Reescrita de saída: os bytes do gerador não seguem crus (ver cabeçalho).
    const s = await sharp();
    const limpa = await s(Buffer.from(b64, "base64"), { limitInputPixels: MAX_PIXELS })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    const barrada = await conferirSaida(limpa, { adulto, exigir });
    if (barrada) return { erro: `recusado: ${barrada}.` };

    return {
      ok: true,
      dimensoes: `${corpo.width}x${corpo.height}`,
      anexo_base64: limpa.toString("base64"),
      anexo_mime: "image/jpeg",
      anexo_nome: "judy-arte.jpg",
    };
  } catch (e) {
    return { erro: `gerador de imagem: ${e?.message ?? e}` };
  } finally { clearTimeout(t); }
}
