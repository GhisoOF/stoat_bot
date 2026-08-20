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
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

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

// ══════════════════════════════════════════════════════════
//  Efeitos de voz — o timbre "GLaDOS" sem um modelo GLaDOS
//
//  Não existe voz GLaDOS treinada em português: os modelos prontos vêm das
//  falas do Portal, em inglês, e usar um deles com texto em português daria
//  pronúncia inglesa ("não" viraria "nay-oh").
//
//  Mas o que define aquele timbre não é a voz da atriz — é o PROCESSAMENTO:
//  banda estreita de alto-falante, ressonância metálica, leve câmara e um
//  deslocamento de tom. Tudo isso é filtro de áudio, e se aplica a qualquer
//  voz — inclusive a feminina em português.
//
//  O ffmpeg vem embutido no revoice (ffmpeg-static), então não depende do
//  sistema. Cada efeito custa poucos milissegundos sobre uma fala curta.
// ══════════════════════════════════════════════════════════

// Deslocar o tom mantendo a velocidade: acelera a taxa de amostragem,
// reamostra de volta e compensa o tempo. Fixamos 48k antes para a conta não
// depender da voz (o Piper sai em 22.05k; o dii pode ser outro).
const tom = (k) => `aresample=48000,asetrate=${Math.round(48000 * k)},aresample=48000,atempo=${(1 / k).toFixed(4)}`;

// ── Dois eixos independentes: TOM e CARÁTER ───────────────
//
// A primeira versão misturava os dois e o resultado foi ruim: o `glados`
// subia o tom porque eu assumi voz masculina de base. Aplicado à `dii`, que
// já é feminina, virou criança robotizada.
//
// Agora são separados:
//   TOM     — quanto subir/descer a voz (`&tts tom 1.10`). Sobe formantes
//             junto, então uma voz masculina vira feminina de verdade em vez
//             de "homem falando fino". Numa voz já feminina, deixe em 1.0.
//   CARÁTER — a textura (`&tts efeito glados`). Não mexe no tom, então
//             funciona igual sobre qualquer voz base.
//
// O `rubberband` vem embutido no ffmpeg-static: nada a instalar.

// Desloca o tom levando os formantes junto — o que separa "voz de mulher"
// de "homem acelerado".
export const cadeiaTom = (t) =>
  `rubberband=pitch=${t}:formant=shifted`;

export const EFEITOS = {
  nenhum: null,

  // ── CARÁTER (não mexem no tom) ──
  //
  // GLaDOS não é uma voz aguda: é grave, plana e fria. O que a define é o
  // processamento — banda de alto-falante, ressonância metálica e câmara.
  // Por isso aqui não há deslocamento de tom nenhum; se quiser mais grave,
  // use `&tts tom 0.95` por cima.
  glados: `highpass=f=220,lowpass=f=6200,` +
          `aphaser=type=t:speed=1.1:decay=0.5:delay=2.0,` +
          `aecho=0.85:0.75:38:0.30,` +
          `acompressor=threshold=0.10:ratio=6:attack=5:release=140,` +
          `equalizer=f=1800:t=q:w=1.5:g=2.5,volume=1.3`,

  robo: `highpass=f=200,lowpass=f=5000,` +
        `flanger=delay=4:depth=3:speed=1.1,` +
        `acompressor=threshold=0.12:ratio=6,volume=1.25`,

  radio: `highpass=f=400,lowpass=f=3400,acompressor=threshold=0.1:ratio=6,volume=1.4`,

  // Íntima/aveludada: sem mexer no tom. Corta o peito, dá corpo nos médios,
  // acrescenta "ar" nos agudos e uma câmara curta de microfone perto.
  sedutora: `atempo=0.94,` +
            `equalizer=f=200:t=q:w=1.0:g=-3,` +
            `equalizer=f=900:t=q:w=1.2:g=2,` +
            `equalizer=f=5000:t=q:w=2.0:g=2.5,` +
            `aexciter=amount=2,` +
            `acompressor=threshold=0.10:ratio=5:attack=25:release=250,` +
            `aecho=0.9:0.35:18:0.12,volume=1.15`,

  // Clareza e brilho, sem alterar o tom.
  suave: `equalizer=f=260:t=q:w=1.2:g=-2,equalizer=f=4000:t=q:w=2:g=2,volume=1.1`,

  sussurro: `highpass=f=500,lowpass=f=7500,acompressor=threshold=0.08:ratio=8,volume=0.9`,
};

function ffmpegBin() {
  try { return require_("ffmpeg-static"); } catch { return "ffmpeg"; }
}

/**
 * Aplica um efeito a um WAV. Devolve o caminho do novo arquivo.
 * Se o efeito falhar por qualquer motivo, devolve o ORIGINAL — perder o
 * efeito é irritante, perder a fala é pior.
 */
export async function aplicarEfeito(arquivo, nome, tom = null) {
  // Tom e caráter são independentes: qualquer combinação é válida, inclusive
  // só um dos dois. O tom vem primeiro para o resto da cadeia trabalhar já
  // sobre a voz na altura final.
  const partes = [];
  const t = Number(tom);
  if (Number.isFinite(t) && t > 0 && Math.abs(t - 1) > 0.001) {
    partes.push(cadeiaTom(Math.min(2, Math.max(0.5, t))));
  }
  if (nome && EFEITOS[nome]) partes.push(EFEITOS[nome]);
  if (!partes.length) return arquivo;
  const cadeia = partes.join(",");

  const saida = arquivo.replace(/\.wav$/, "") + `-fx.wav`;
  try {
    await new Promise((res, rej) => {
      const p = spawn(ffmpegBin(), [
        "-hide_banner", "-loglevel", "error",
        "-i", arquivo, "-af", cadeia,
        "-ar", "48000", "-ac", "1", "-y", saida,
      ]);
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      p.on("error", rej);
      p.on("close", (c) => (c === 0 ? res() : rej(new Error(err.trim().slice(0, 200) || `ffmpeg saiu com ${c}`))));
      setTimeout(() => { try { p.kill("SIGKILL"); } catch {} rej(new Error("efeito demorou demais")); }, 20_000);
    });
    if (fs.existsSync(saida) && fs.statSync(saida).size > 100) {
      try { fs.unlinkSync(arquivo); } catch {}
      return saida;
    }
    return arquivo;
  } catch (e) {
    console.error(`[VOZ] efeito "${nome ?? ""}"/tom ${tom ?? 1} falhou (falando sem ele): ${e.message}`);
    try { fs.unlinkSync(saida); } catch {}
    return arquivo;
  }
}
