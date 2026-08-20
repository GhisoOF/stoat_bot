// ══════════════════════════════════════════════════════════
//  tts.js — texto → áudio, offline, com Piper
//
//  Por que Piper e não um modelo maior (XTTS, Kokoro):
//   • roda em CPU, então evita toda a dor de ROCm com a RX 9060 XT
//   • gera bem mais rápido que tempo real — aqui LATÊNCIA é o que
//     importa: alguém digita e espera a fala sair. Um modelo que
//     produz áudio lindo em 8s é pior, neste uso, que um decente
//     em 0,3s
//   • vozes pt-BR prontas, sem treino
//
//  Se um dia quiser voz clonada com a personalidade da Judy, só este
//  arquivo muda — o resto do sistema fala com `sintetizar()` e não
//  sabe o que tem por baixo.
//
//  Saída: WAV 22.05kHz mono (o que o Piper produz). O revoice/ffmpeg
//  reamostra para 48k estéreo na hora de publicar.
// ══════════════════════════════════════════════════════════

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const execFileP = promisify(execFile);

const PIPER      = process.env.PIPER_BIN || path.join(os.homedir(), ".local/share/piper/piper");
const VOZES_DIR  = process.env.PIPER_VOZES || path.join(os.homedir(), ".local/share/piper/vozes");
const VOZ_PADRAO = process.env.PIPER_VOZ || "pt_BR-faber-medium";
const MAX_CHARS  = Number(process.env.TTS_MAX_CHARS || 400);
const TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 30_000);
const TMP        = path.join(os.tmpdir(), "judy-voz");

fs.mkdirSync(TMP, { recursive: true });

const caminhoVoz = (nome) => path.join(VOZES_DIR, `${nome}.onnx`);

export function vozesDisponiveis() {
  try {
    return fs.readdirSync(VOZES_DIR)
      .filter((f) => f.endsWith(".onnx"))
      .map((f) => f.replace(/\.onnx$/, ""));
  } catch { return []; }
}

export async function diagnostico() {
  if (!fs.existsSync(PIPER)) {
    return { ok: false, erro: `binário do Piper não encontrado em ${PIPER}`, vozes: [] };
  }
  const vozes = vozesDisponiveis();
  if (!vozes.length) {
    return { ok: false, erro: `nenhuma voz .onnx em ${VOZES_DIR}`, vozes: [] };
  }
  const vozAtual = vozes.includes(VOZ_PADRAO) ? VOZ_PADRAO : vozes[0];
  return { ok: true, binario: PIPER, vozesDir: VOZES_DIR, vozAtual, vozes, maxChars: MAX_CHARS };
}

// Limpa o texto ANTES de virar áudio. Não é só estética: um link colado
// numa call vira trinta segundos de "agá tê tê pê dois pontos barra barra"
// e ninguém merece isso.
export function prepararTexto(bruto) {
  let t = String(bruto ?? "")
    .replace(/```[\s\S]*?```/g, " bloco de código ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/https?:\/\/\S+/gi, " link ")
    .replace(/<@[^>]+>/g, " alguém ")
    .replace(/<#[^>]+>/g, " um canal ")
    .replace(/<%[^>]+>/g, " um cargo ")
    .replace(/:[a-z0-9_+-]{2,64}:/gi, " ")
    .replace(/[*_~|>#]/g, "")
    // emojis viram silêncio em vez de leitura literal do nome
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > MAX_CHARS) t = t.slice(0, MAX_CHARS) + "…";
  return t;
}

/**
 * Sintetiza texto em um arquivo WAV e devolve o caminho.
 * Quem chama é responsável por apagar (ou usar `limparAntigos`).
 */
export async function sintetizar(texto, vozNome = null) {
  const diag = await diagnostico();
  if (!diag.ok) throw new Error(`Piper indisponível: ${diag.erro}`);

  const limpo = prepararTexto(texto);
  if (!limpo) throw new Error("nada para falar depois de limpar o texto");

  const voz = vozNome && diag.vozes.includes(vozNome) ? vozNome : diag.vozAtual;
  const modelo = caminhoVoz(voz);
  const saida = path.join(TMP, `${crypto.randomUUID()}.wav`);

  // O Piper lê o texto pelo stdin e escreve o WAV no caminho dado.
  await execFileP(PIPER, ["--model", modelo, "--output_file", saida], {
    input: limpo,
    timeout: TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (!fs.existsSync(saida) || fs.statSync(saida).size < 100) {
    throw new Error("o Piper terminou mas não produziu áudio utilizável");
  }
  return { arquivo: saida, voz, texto: limpo, bytes: fs.statSync(saida).size };
}

// Higiene do /tmp: sem isto, cada fala deixa um WAV para trás e o disco
// enche devagar até alguém perceber meses depois.
export function limparAntigos(idadeMs = 5 * 60_000) {
  try {
    const agora = Date.now();
    for (const f of fs.readdirSync(TMP)) {
      const p = path.join(TMP, f);
      try {
        if (agora - fs.statSync(p).mtimeMs > idadeMs) fs.unlinkSync(p);
      } catch {}
    }
  } catch {}
}

setInterval(() => limparAntigos(), 5 * 60_000).unref?.();
