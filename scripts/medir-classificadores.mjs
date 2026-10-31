#!/usr/bin/env node
// medir-classificadores.mjs — quanto custam, NA CPU, os classificadores de imagem
// candidatos do P3b (31 out 2026, P3a). Roda dentro de um container descartável,
// chamado por scripts/medir-classificadores.sh — não é dependência do bot e não
// entra na imagem dele.
//
// Os candidatos (versão fixa: o commit do repositório e o SHA256 do arquivo):
//   • nsfw-vit — ViT de nudez (normal × nsfw), conversão ONNX do
//     Falconsai/nsfw_image_detection (Apache-2.0), quantizado (int8).
//   • clip-b32 — o lado da IMAGEM do CLIP ViT-B/32 (OpenAI, MIT), quantizado:
//     a base do zero-shot de símbolos de ódio (as frases do texto viram vetores
//     uma vez só, na carga — não entram no tempo por imagem).
// O runtime é o onnxruntime-node (MIT) com versão fixa e a integridade do npm
// (SHA512) conferida; só os dois pacotes de que ele precisa para rodar (os do
// script de instalação, que baixa CUDA, ficam de fora).
//
// Subcomandos:
//   baixar <dir>                — baixa e confere (a única fase com rede)
//   medir <dir> [threads…]      — cada modelo × threads num processo próprio
//                                 (RAM de pico separada); imprime a tabela
//   uma <dir> <modelo> <threads> — (interno) uma medição → uma linha JSON
//
// As imagens são SINTÉTICAS, geradas aqui (gradiente, ruído, xadrez, formas,
// cor sólida) — nunca uma imagem real.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";

// ── O que é baixado (versão fixa; um hash que não confere para tudo) ─────────
export const CANDIDATOS = [
  {
    id: "nsfw-vit", uso: "nudez (normal × nsfw)",
    repo: "onnx-community/nsfw_image_detection-ONNX", rev: "1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5",
    arquivo: "onnx/model_quantized.onnx", tamanho: 87333629,
    sha256: "d9afb1e057104e6cc8616d174f0f6a8b8b0389c839eea7d5efa4bdf1a77efd27",
    licenca: "Apache-2.0 (base: Falconsai/nsfw_image_detection)",
    lado: 224, media: [0.5, 0.5, 0.5], desvio: [0.5, 0.5, 0.5],
  },
  {
    id: "clip-b32", uso: "zero-shot (símbolos de ódio) — só a imagem",
    repo: "Xenova/clip-vit-base-patch32", rev: "6b7c523703ae26e39be4b03774966f8571c7f523",
    arquivo: "onnx/vision_model_quantized.onnx", tamanho: 89117001,
    sha256: "583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299",
    licenca: "MIT (OpenAI CLIP)",
    lado: 224, media: [0.48145466, 0.4578275, 0.40821073], desvio: [0.26862954, 0.26130258, 0.27577711],
  },
];
export const RUNTIME = [
  { nome: "onnxruntime-common", versao: "1.31.1",
    integridade: "sha512-F+nnYNiQtmNJ95V6R/isBJqiVpdANCrsMEg1OaF+Bkbl3GAtzWLR7Ng17Ld0QtYtYJyotOHPJzOQn1Y6PLZjpg==",
    extrair: () => ["package"] },
  { nome: "onnxruntime-node", versao: "1.31.1",
    integridade: "sha512-ijnSghbDHVWaQ2nDPmVccPlCHI8kH1Mx1aJ4a/qzRP16bBcVs4E3EqZQKZCkhWnbqN1tuQWxagimFtDpbPYYQw==",
    // só o que roda nesta máquina (linux + a arquitetura dela)
    extrair: (arch = process.arch) => ["package/package.json", "package/dist", `package/bin/napi-v6/linux/${arch}`] },
];
export const urlDoModelo = (c) => `https://huggingface.co/${c.repo}/resolve/${c.rev}/${c.arquivo}`;
export const urlDoPacote = (p) => `https://registry.npmjs.org/${p.nome}/-/${p.nome}-${p.versao}.tgz`;
export const arquivoDoModelo = (dir, c) => join(dir, "modelos", `${c.id}.onnx`);
export const arquivoDoPacote = (dir, p) => join(dir, "pacotes", `${p.nome}-${p.versao}.tgz`);

// ── Conferir ─────────────────────────────────────────────────────────────────
// O hash de um arquivo, em streaming (os modelos têm ~90 MB)
export async function hashDoArquivo(caminho, algoritmo = "sha256", formato = "hex") {
  const h = createHash(algoritmo);
  await pipeline(createReadStream(caminho), h);
  return h.digest(formato);
}
// SHA256 (hex) ou integridade do npm ("sha512-<base64>") → true/false
export async function conferir(caminho, esperado) {
  if (!existsSync(caminho)) return false;
  const m = String(esperado).match(/^(sha256|sha384|sha512)-(.+)$/);
  if (m) return (await hashDoArquivo(caminho, m[1], "base64")) === m[2];
  if (!/^[0-9a-f]{64}$/.test(String(esperado))) throw new Error(`hash esperado inválido: ${esperado}`);
  return (await hashDoArquivo(caminho, "sha256", "hex")) === esperado;
}

// Baixa para <destino>.parcial e só renomeia se o hash conferir. Já baixado e
// conferido: não baixa de novo.
export async function baixarConferido(url, destino, esperado, tamanho = null) {
  mkdirSync(dirname(destino), { recursive: true });
  if (await conferir(destino, esperado)) return "já estava";
  const parcial = `${destino}.parcial`;
  rmSync(parcial, { force: true });
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} em ${url}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(parcial));
  if (tamanho !== null && statSync(parcial).size !== tamanho) { rmSync(parcial, { force: true }); throw new Error(`tamanho não confere: ${url}`); }
  if (!(await conferir(parcial, esperado))) { rmSync(parcial, { force: true }); throw new Error(`HASH NÃO CONFERE — arquivo descartado: ${url}`); }
  renameSync(parcial, destino);
  return "baixado";
}

export async function baixar(dir) {
  for (const c of CANDIDATOS) {
    const r = await baixarConferido(urlDoModelo(c), arquivoDoModelo(dir, c), c.sha256, c.tamanho);
    console.log(`  ✓ ${c.id}: ${r} (SHA256 conferido)`);
  }
  for (const p of RUNTIME) {
    const tgz = arquivoDoPacote(dir, p);
    const r = await baixarConferido(urlDoPacote(p), tgz, p.integridade);
    const alvo = join(dir, "node_modules", p.nome);
    rmSync(alvo, { recursive: true, force: true });
    mkdirSync(alvo, { recursive: true });
    const t = spawnSync("tar", ["-xzf", tgz, "-C", alvo, "--strip-components=1", ...p.extrair()], { stdio: "inherit" });
    if (t.status !== 0) throw new Error(`não consegui extrair ${p.nome}`);
    console.log(`  ✓ ${p.nome}@${p.versao}: ${r} (SHA512 conferido)`);
  }
}

// ── Imagens sintéticas ───────────────────────────────────────────────────────
export const TIPOS_SINTETICOS = ["gradiente", "ruido", "xadrez", "formas", "solida"];
const rng = (s) => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
// → { largura, altura, dados: Uint8Array RGB }
export function imagemSintetica(i, largura = 768, altura = 768) {
  const dados = new Uint8Array(largura * altura * 3);
  const tipo = TIPOS_SINTETICOS[i % TIPOS_SINTETICOS.length], r = rng(1000 + i);
  const cor = [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)];
  const formas = Array.from({ length: 6 }, () => ({ x: r() * largura, y: r() * altura, raio: 20 + r() * largura / 4, c: [r() * 256, r() * 256, r() * 256] }));
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) {
    const k = (y * largura + x) * 3;
    let px;
    if (tipo === "gradiente") px = [255 * x / largura, 255 * y / altura, 255 * (1 - x / largura)];
    else if (tipo === "ruido") px = [r() * 256, r() * 256, r() * 256];
    else if (tipo === "xadrez") px = ((x >> 5) + (y >> 5)) % 2 ? cor : [255 - cor[0], 255 - cor[1], 255 - cor[2]];
    else if (tipo === "formas") { const f = formas.find((f) => (x - f.x) ** 2 + (y - f.y) ** 2 < f.raio ** 2); px = f ? f.c : [240, 240, 240]; }
    else px = cor;
    dados[k] = px[0]; dados[k + 1] = px[1]; dados[k + 2] = px[2];
  }
  return { largura, altura, dados };
}
// Redimensiona (bilinear) para lado × lado e normaliza → Float32Array CHW
export function preparar(img, { lado, media, desvio }) {
  const { largura: W, altura: H, dados } = img;
  const out = new Float32Array(3 * lado * lado);
  const sx = W / lado, sy = H / lado;
  for (let y = 0; y < lado; y++) {
    const fy = Math.min(H - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), dy = fy - y0;
    for (let x = 0; x < lado; x++) {
      const fx = Math.min(W - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), dx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const p = (yy, xx) => dados[(yy * W + xx) * 3 + c];
        const v = (p(y0, x0) * (1 - dx) + p(y0, x1) * dx) * (1 - dy) + (p(y1, x0) * (1 - dx) + p(y1, x1) * dx) * dy;
        out[c * lado * lado + y * lado + x] = (v / 255 - media[c]) / desvio[c];
      }
    }
  }
  return out;
}

// ── Números ──────────────────────────────────────────────────────────────────
export function percentil(xs, p) {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return NaN;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1));
  return v[i];
}
export const mediana = (xs) => percentil(xs, 0.5);
const MB = (b) => Math.round(b / 1048576);
const ms = (x) => (Number.isFinite(x) ? (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) : "—");

// Uma medição (um processo só para ela: a RAM de pico é a deste modelo)
export async function medirUm(dir, id, threads, { aquecer = 3, n = 30 } = {}) {
  const c = CANDIDATOS.find((x) => x.id === id);
  if (!c) throw new Error(`modelo desconhecido: ${id}`);
  const require = createRequire(join(dir, "node_modules", "_.js"));
  const rssAntes = process.memoryUsage().rss;
  const ort = require("onnxruntime-node");
  const t0 = performance.now();
  const sessao = await ort.InferenceSession.create(arquivoDoModelo(dir, c), {
    executionProviders: ["cpu"], intraOpNumThreads: threads, interOpNumThreads: 1, graphOptimizationLevel: "all",
  });
  const cargaMs = performance.now() - t0;
  const rssCarregado = process.memoryUsage().rss;
  const entrada = sessao.inputNames[0];
  const rodar = async (i) => {
    const img = imagemSintetica(i);
    const a = performance.now();
    const tensor = new ort.Tensor("float32", preparar(img, c), [1, 3, c.lado, c.lado]);
    const b = performance.now();
    const saida = await sessao.run({ [entrada]: tensor });
    const d = performance.now();
    return { pre: b - a, inf: d - b, dims: saida[sessao.outputNames[0]]?.dims ?? [] };
  };
  for (let i = 0; i < aquecer; i++) await rodar(100 + i);
  const pre = [], inf = [];
  let dims = [];
  for (let i = 0; i < n; i++) { const r = await rodar(i); pre.push(r.pre); inf.push(r.inf); dims = r.dims; }
  await sessao.release?.();
  return {
    id, threads, n, cargaMs, saida: dims.join("×"),
    rssAntesMB: MB(rssAntes), rssCarregadoMB: MB(rssCarregado), rssPicoMB: MB(process.resourceUsage().maxRSS * 1024),
    preMs: mediana(pre), infMs: mediana(inf), infP95Ms: percentil(inf, 0.95),
    imgPorSeg: 1000 / (mediana(pre) + mediana(inf)),
  };
}

// A tabela curta (o que o dono manda de volta)
export function tabela(linhas) {
  const cab = ["modelo", "thr", "carga ms", "RAM MB (antes→carregado→pico)", "pré ms", "inferência ms (mediana/p95)", "img/s", "saída"];
  const rows = linhas.map((r) => r.erro
    ? [r.id, String(r.threads), "ERRO", String(r.erro).slice(0, 60), "", "", "", ""]
    : [r.id, String(r.threads), String(ms(r.cargaMs)), `${r.rssAntesMB}→${r.rssCarregadoMB}→${r.rssPicoMB}`, String(ms(r.preMs)),
      `${ms(r.infMs)} / ${ms(r.infP95Ms)}`, String(Math.round(r.imgPorSeg * 10) / 10), r.saida]);
  const larg = cab.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const lin = (cs) => cs.map((x, i) => x.padEnd(larg[i])).join(" | ").trimEnd();
  return [lin(cab), larg.map((l) => "-".repeat(l)).join("-|-"), ...rows.map(lin)].join("\n");
}

export async function medir(dir, threads = [1, 4]) {
  const eu = fileURLToPath(import.meta.url);
  const linhas = [];
  for (const c of CANDIDATOS) {
    if (!(await conferir(arquivoDoModelo(dir, c), c.sha256))) { linhas.push({ id: c.id, threads: "-", erro: "modelo ausente ou hash não confere" }); continue; }
    for (const t of threads) {
      const r = spawnSync(process.execPath, [eu, "uma", dir, c.id, String(t)], { encoding: "utf8", maxBuffer: 1 << 20 });
      const json = (r.stdout ?? "").split("\n").filter((l) => l.startsWith("{")).at(-1);
      try { linhas.push(json ? JSON.parse(json) : { id: c.id, threads: t, erro: (r.stderr || `saiu com ${r.status}`).trim().split("\n").at(-1) }); }
      catch (e) { linhas.push({ id: c.id, threads: t, erro: e.message }); }
    }
  }
  const cpu = os.cpus();
  console.log(`CPU: ${cpu[0]?.model ?? "?"} · ${cpu.length} threads · RAM ${MB(os.totalmem())} MB · Node ${process.version} · onnxruntime-node ${RUNTIME.find((p) => p.nome === "onnxruntime-node").versao}`);
  console.log(`Imagens: sintéticas 768×768 (${TIPOS_SINTETICOS.join(", ")}), redimensionadas para 224×224; mediana de 30 depois de 3 de aquecimento.\n`);
  console.log(tabela(linhas));
  for (const c of CANDIDATOS) console.log(`\n${c.id}: ${c.uso} — ${c.repo}@${c.rev.slice(0, 12)} ${c.arquivo} — ${c.licenca}`);
  return linhas;
}

// ── Linha de comando (só quando executado; importar não roda nada) ───────────
const executado = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executado) {
  const [cmd, dir, ...resto] = process.argv.slice(2);
  try {
    if (!dir) throw new Error("uso: medir-classificadores.mjs baixar|medir|uma <dir> …");
    if (cmd === "baixar") await baixar(dir);
    else if (cmd === "medir") await medir(dir, resto.length ? resto.map(Number).filter((n) => n > 0) : [1, 4]);
    else if (cmd === "uma") console.log(JSON.stringify(await medirUm(dir, resto[0], Math.max(1, Number(resto[1]) || 1))));
    else throw new Error(`subcomando desconhecido: ${cmd}`);
  } catch (e) {
    console.error(`✗ ${e?.message ?? e}`);
    process.exit(1);
  }
}
