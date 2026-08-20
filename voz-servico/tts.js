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

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// ── Executar o Piper passando texto pelo stdin ────────────
//
// ARMADILHA QUE CUSTOU UMA TARDE: a opção `input` do `execFile` só existe na
// versão SÍNCRONA (`execFileSync`). Na assíncrona ela é ignorada sem aviso —
// o Piper ficava esperando um texto que nunca chegava e morria no timeout,
// exatamente 30s depois. O sintoma ("Command failed") apontava para o Piper,
// que estava perfeito: rodando à mão ele sintetizava em 0,03s.
//
// Aqui o stdin é escrito e FECHADO de verdade. O fechamento é o que sinaliza
// ao Piper que o texto acabou; sem ele, o processo espera para sempre.
function rodarPiper(bin, args, texto, timeoutMs) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let saida = "", erros = "";
    let terminou = false;

    const t = setTimeout(() => {
      if (terminou) return;
      terminou = true;
      try { p.kill("SIGKILL"); } catch {}
      rej(new Error(`o Piper não respondeu em ${timeoutMs / 1000}s`));
    }, timeoutMs);

    p.stdout.on("data", (d) => { saida += d; });
    p.stderr.on("data", (d) => { erros += d; });

    p.on("error", (e) => {
      if (terminou) return;
      terminou = true; clearTimeout(t);
      rej(new Error(e.code === "ENOENT" ? `binário não encontrado: ${bin}` : e.message));
    });

    p.on("close", (codigo) => {
      if (terminou) return;
      terminou = true; clearTimeout(t);
      if (codigo === 0) return res({ saida, erros });
      const e = new Error(`o Piper saiu com código ${codigo}`);
      e.stderr = erros;
      rej(e);
    });

    p.stdin.on("error", () => { /* processo pode ter morrido antes */ });
    p.stdin.write(texto);
    p.stdin.end();          // ← o fechamento é o que faz o Piper trabalhar
  });
}

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

  // Existir não é funcionar. O diagnóstico dizia "Piper pronto" enquanto ele
  // falhava em toda síntese — porque só conferia se o arquivo estava no
  // lugar. Agora sintetizamos uma palavra de verdade.
  if (!fs.existsSync(`${caminhoVoz(vozAtual)}.json`)) {
    return { ok: false, erro: `falta ${vozAtual}.onnx.json ao lado do .onnx (o Piper precisa dos dois)`, vozes };
  }
  try {
    const prova = path.join(TMP, "prova.wav");
    await rodarPiper(PIPER, ["--model", caminhoVoz(vozAtual), "--output_file", prova],
      "teste", 15_000);
    const bytes = fs.existsSync(prova) ? fs.statSync(prova).size : 0;
    try { fs.unlinkSync(prova); } catch {}
    if (bytes < 100) return { ok: false, erro: "o Piper rodou mas gerou um WAV vazio", vozes };
  } catch (e) {
    const detalhe = (e?.stderr || "").toString().trim().split("\n").slice(-2).join(" | ")
      || e?.message || String(e);
    return { ok: false, erro: `a síntese de teste falhou: ${detalhe}`, vozes };
  }

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
  //
  // O stderr é ESSENCIAL aqui: quando o Piper falha, o `execFile` só diz
  // "Command failed" e a mensagem de verdade (modelo corrompido, espeak-ng
  // ausente, voz incompatível) fica no stderr. Sem repassá-la, o diagnóstico
  // vira adivinhação — foi exatamente o que aconteceu na primeira vez.
  try {
    await rodarPiper(PIPER, ["--model", modelo, "--output_file", saida], limpo, TIMEOUT_MS);
  } catch (e) {
    const detalhe = (e?.stderr || "").toString().trim().split("\n").slice(-4).join(" | ")
      || e?.message || String(e);
    let dica = "";
    if (/espeak|phonem/i.test(detalhe)) {
      dica = " → falta o espeak-ng (o Piper usa ele para converter texto em fonemas). No Gentoo: sudo emerge app-accessibility/espeak-ng";
    } else if (/onnx|model|load/i.test(detalhe)) {
      dica = " → o modelo da voz pode estar corrompido ou faltando o .onnx.json ao lado. Rode: bash scripts/instalar-piper.sh";
    } else if (/permission|denied/i.test(detalhe)) {
      dica = " → sem permissão de execução ou de escrita em /tmp/judy-voz";
    } else if (/ENOENT/i.test(detalhe)) {
      dica = " → binário do Piper não encontrado no caminho configurado (PIPER_BIN)";
    }
    throw new Error(`Piper falhou: ${detalhe}${dica}`);
  }

  if (!fs.existsSync(saida) || fs.statSync(saida).size < 100) {
    throw new Error("o Piper terminou sem erro mas não produziu áudio utilizável — confira se o arquivo .onnx.json está ao lado do .onnx");
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
