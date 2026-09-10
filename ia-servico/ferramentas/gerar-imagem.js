
const SD_URL       = (process.env.SD_URL || "").replace(/\/$/, "");
// Gerador embutido (stable-diffusion.cpp): usado quando não há SD_URL.
const SD_BIN       = process.env.SD_BIN || "/usr/local/bin/sd-cpp";
const SD_DIR       = process.env.SD_MODELOS_DIR || "/data/modelos-sd";
const SD_MODELO_URL = process.env.SD_MODELO_URL
  || "https://huggingface.co/stabilityai/sd-turbo/resolve/main/sd_turbo.safetensors";
const IMAGEM_LIGADA = (process.env.IMAGEM ?? "1").trim() !== "0";

import { existsSync, mkdirSync, readFileSync, unlinkSync, renameSync } from "node:fs";
import { spawn as spawnProc, spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
const LADO_MAX     = Number(process.env.IMAGEM_LADO_GERACAO || 768);
const PASSOS_MAX   = Number(process.env.IMAGEM_PASSOS_MAX || 30);
const TIMEOUT_MS   = Number(process.env.IMAGEM_GERACAO_TIMEOUT_MS || 180_000);
const MAX_PIXELS   = Number(process.env.IMAGEM_MAX_PIXELS || 32_000_000);

// Reusa a reescrita do ver-imagem (mesma política, mesmo código).
import * as visao from "./ver-imagem.js";

let sharpMod = null;
async function sharp() {
  if (sharpMod) return sharpMod;
  sharpMod = (await import("sharp")).default;
  return sharpMod;
}

const MENOR   = /\b(crian[çc]a|menor(?:es)?|adolescente|teen|loli|shota|infantil|kid|child|underage|1[0-7]\s*(anos|years?|yo)\b)/i;
const SEXUAL  = /\b(nu[aá]?s?|nude?s?|naked|pelad[ao]s?|sem\s+roupa|nsfw|sexual\w*|er[óo]tic\w*|sensual\w*|lingerie|fetiche|fetish|hentai|porn\w*|explicit\w*|seminu\w*)\b/i;
const PESSOA_REAL = /\b(da|do|de)\s+[A-ZÀ-Ú][a-zà-ú]+\s+[A-ZÀ-Ú][a-zà-ú]+|celebridade|celebrity|famos[ao]/;
const GORE    = /\b(gore|decapita\w+|desmembr\w+|mutila\w+|v[íi]sceras|entranhas|tortura(?:ndo|r)?\b.*\b(real|pessoa)|corpo\s+esquartejado)\b/i;
const ODIO    = /\b(su[áa]stica|swastika|nazi\w*|kkk\b|supremac\w+)\b/i;

export function prompProibido(prompt) {
  const p = String(prompt ?? "");
  if (MENOR.test(p) && SEXUAL.test(p)) {
    return "esse pedido combina menores com conteúdo sexualizado — recusado, sem exceção, e fica registrado no log.";
  }
  if (SEXUAL.test(p) && PESSOA_REAL.test(p)) {
    return "nudez ou conteúdo sexual de pessoa real identificável é deepfake — recusado.";
  }
  if (GORE.test(p)) return "gore explícito não — posso fazer algo sombrio ou sinistro sem vísceras.";
  if (ODIO.test(p)) return "símbolos de ódio não saem daqui.";
  return null;
}

const NEGATIVO_FIXO = "nsfw, nude, naked, child, loli, underage, gore, dismemberment, watermark, text, low quality, deformed";

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

// ── Backend embutido (sd.cpp + SD-Turbo) ──
function baixarModeloSD() {
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

function gerarEmbutido({ texto, width, height }) {
  return new Promise((res, rej) => {
    let modelo;
    try { modelo = baixarModeloSD(); } catch (e) { return rej(e); }
    const saida = join(tmpdir(), `sd-${Date.now()}.png`);
    // SD-Turbo: pouquíssimos passos e cfg 1.0 — é o que o torna leve em CPU.
    const passos = String(Math.min(PASSOS_MAX, Number(process.env.IMAGEM_PASSOS || 4)));
    const finalArgs = ["-M", "txt2img", "-m", modelo, "-p", texto, "-n", NEGATIVO_FIXO,
      "-W", String(width), "-H", String(height), "--steps", passos,
      "--cfg-scale", process.env.IMAGEM_CFG || "1.0", "--type", "q8_0", "-o", saida];
    const p = spawnProc(SD_BIN, finalArgs, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, TIMEOUT_MS);
    p.on("error", (e) => { clearTimeout(t); rej(new Error(`sd.cpp: ${e.message}`)); });
    p.on("close", (c) => {
      clearTimeout(t);
      if (c !== 0 || !existsSync(saida)) return rej(new Error(`sd.cpp saiu com ${c}: ${err.trim().slice(-200)}`));
      const png = readFileSync(saida);
      try { unlinkSync(saida); } catch {}
      res(png);
    });
  });
}

export async function executar({ prompt, largura, altura }) {
  const embutidoDisponivel = IMAGEM_LIGADA && existsSync(SD_BIN);
  if (!SD_URL && !embutidoDisponivel) {
    return { erro: "geração de imagem indisponível: o binário embutido (sd.cpp) não está nesta imagem e não há SD_URL apontando para um servidor A1111 (Forge/SD.Next) — ver ia-servico/README." };
  }
  const texto = String(prompt ?? "").trim();
  if (!texto) return { erro: "descreva o que desenhar." };
  const recusa = prompProibido(texto);
  if (recusa) {
    console.warn(`[IA][gerar_imagem] RECUSADO: ${texto.slice(0, 160)}`);
    return { erro: `recusado: ${recusa}` };
  }

  const corpo = {
    prompt: texto.slice(0, 1500),
    negative_prompt: NEGATIVO_FIXO,
    width: multiploDe64(Number(largura) || LADO_MAX),
    height: multiploDe64(Number(altura) || LADO_MAX),
    steps: Math.min(PASSOS_MAX, Number(process.env.IMAGEM_PASSOS || 22)),
    cfg_scale: 6.5,
    sampler_name: process.env.IMAGEM_SAMPLER || "Euler a",
  };

  if (!SD_URL) {
    try {
      const png = await gerarEmbutido({ texto, width: corpo.width, height: corpo.height });
      const s2 = await sharp();
      const limpa = await s2(png, { limitInputPixels: MAX_PIXELS })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
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
