
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { iaLigada, modoIA, MODELO_LOCAL_PADRAO } from "./modulos/core/env.js";

const IA_EMBUTIDA = iaLigada() && process.env.IA_EMBUTIDA !== "0";
const VOZ_ATIVA = process.env.VOZ_ATIVA === "1";
const LLAMA_BIN = process.env.LLAMA_BIN || "/usr/local/bin/llama-server";

// Padrões de localhost quando os serviços estão embutidos.
if (IA_EMBUTIDA && !process.env.IA_SERVICO_URL) process.env.IA_SERVICO_URL = "http://127.0.0.1:8090";
if (VOZ_ATIVA && !process.env.VOZ_SERVICO_URL) process.env.VOZ_SERVICO_URL = "http://127.0.0.1:8091";

const filhos = new Set();
let encerrando = false;

function subir(nome, cwd, arquivo, { reiniciar = true, env = {}, flags = [] } = {}) {
  if (!existsSync(`${cwd}/${arquivo}`)) {
    console.warn(`[INICIAR] ${nome}: ${cwd}/${arquivo} não existe — pulando.`);
    return;
  }
  let tentativas = 0;
  const lancar = () => {
    const p = spawn(process.execPath, [...flags, arquivo], {
      cwd, stdio: "inherit",
      env: { ...process.env, ...env },
    });
    filhos.add(p);
    console.info(`[INICIAR] ${nome} de pé (pid ${p.pid}).`);
    p.on("exit", (code) => {
      filhos.delete(p);
      if (encerrando) return;
      if (!reiniciar) { console.error(`[INICIAR] ${nome} saiu (${code}); encerrando o container.`); return encerrar(code ?? 1); }
      const espera = Math.min(30_000, 1000 * 2 ** Math.min(tentativas++, 5));
      console.error(`[INICIAR] ${nome} caiu (${code}); volta em ${espera / 1000}s.`);
      setTimeout(lancar, espera);
    });
  };
  lancar();
}

function subirBin(nome, bin, args, env = {}) {
  let tentativas = 0;
  const lancar = () => {
    const p = spawn(bin, args, { stdio: "inherit", env: { ...process.env, ...env } });
    filhos.add(p);
    console.info(`[INICIAR] ${nome} de pé (pid ${p.pid}).`);
    p.on("error", (err) => console.error(`[INICIAR] ${nome}: ${err.message}`));
    p.on("exit", (code) => {
      filhos.delete(p);
      if (encerrando) return;
      const espera = Math.min(60_000, 2000 * 2 ** Math.min(tentativas++, 5));
      console.error(`[INICIAR] ${nome} caiu (${code}); volta em ${espera / 1000}s.`);
      setTimeout(lancar, espera);
    });
  };
  lancar();
}

function encerrar(code = 0) {
  encerrando = true;
  for (const p of filhos) { try { p.kill("SIGTERM"); } catch {} }
  setTimeout(() => process.exit(code), 3000).unref();
}
process.on("SIGTERM", () => encerrar(0));
process.on("SIGINT", () => encerrar(0));

if (!iaLigada()) {
  console.info("[INICIAR] IA=0 — módulos de IA desligados (nem serviço, nem modelo).");
} else if (modoIA() === "local") {
  // Modo local: llama-server embutido baixa o modelo do Hugging Face no
  // primeiro arranque (flag -hf) e guarda em /data/modelos — o download de
  // gigabytes acontece uma vez, sobrevive a rebuilds e não incha a imagem.
  if (existsSync(LLAMA_BIN)) {
    const modelo = process.env.MODELO || MODELO_LOCAL_PADRAO;
    const cache = process.env.LLAMA_CACHE || "/data/modelos";
    try { mkdirSync(cache, { recursive: true }); } catch {}
    console.info(`[INICIAR] IA local: ${modelo} (primeiro arranque baixa o modelo — pode demorar)`);
    // -ngl: camadas na GPU. O build é Vulkan, mas sem esta flag o llama.cpp
    // carrega tudo na CPU mesmo com adaptador disponível. 999 = "tudo o que
    // couber"; sem GPU exposta ao container, ele cai para CPU sozinho.
    const ngl = process.env.LLAMA_NGL || "999";
    subirBin("llama", LLAMA_BIN,
      ["-hf", modelo, "--host", "127.0.0.1", "--port", process.env.LLAMA_PORTA || "8082",
       "-c", process.env.LLAMA_CTX || "8192", "-ngl", ngl, "--jinja"],
      { LLAMA_CACHE: cache });
  } else {
    console.error(`[INICIAR] IA_MODO=local mas ${LLAMA_BIN} não existe nesta imagem — a IA vai falhar. Use IA_MODO=online ou aponte LLM_URL para um servidor externo.`);
  }
} else if (modoIA() === "online" && !(process.env.TOKEN_IA || process.env.LLM_TOKEN)) {
  console.warn("[INICIAR] IA_MODO=online sem TOKEN_IA — a maioria das plataformas vai recusar as chamadas.");
}

if (IA_EMBUTIDA) subir("ia-servico", "./ia-servico", "servidor.js", { env: { PORTA: process.env.IA_PORTA || "8090" } });
if (VOZ_ATIVA) {
  const vozesDir = process.env.PIPER_VOZES || "/data/vozes";
  try { mkdirSync(vozesDir, { recursive: true }); } catch {}
  // Quais vozes baixar: a env VOZES lista nomes do catálogo oficial do Piper
  // (https://huggingface.co/rhasspy/piper-voices), separados por vírgula.
  // O nome carrega o caminho: pt_BR-faber-medium → pt/pt_BR/faber/medium/.
  const pedidos = (process.env.VOZES || "pt_BR-faber-medium")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const urlDaVoz = (nome) => {
    const m = /^([a-z]{2,3})(?:_([A-Za-z]+))?-(.+)-([a-z_]+)$/.exec(nome);
    if (!m) return null;
    const [, lang, regiao, pessoa, qualidade] = m;
    const pasta = regiao ? `${lang}_${regiao}` : lang;
    return `https://huggingface.co/rhasspy/piper-voices/resolve/main/${lang}/${pasta}/${pessoa}/${qualidade}/${nome}.onnx`;
  };
  const jaTem = new Set(existsSync(vozesDir) ? readdirSync(vozesDir) : []);
  for (const nome of pedidos) {
    if (jaTem.has(`${nome}.onnx`) && jaTem.has(`${nome}.onnx.json`)) continue;
    const url = urlDaVoz(nome);
    if (!url) { console.error(`[INICIAR] voz: nome "${nome}" fora do padrão idioma_REGIAO-pessoa-qualidade (ex.: pt_BR-faber-medium) — pulando.`); continue; }
    console.info(`[INICIAR] voz: baixando ${nome} (uma vez, fica no volume)…`);
    for (const suf of [".onnx", ".onnx.json"]) {
      const r = spawnSync("curl", ["-fL", "--retry", "2", `${url.replace(/\.onnx$/, "")}${suf}`, "-o", `${vozesDir}/${nome}${suf}`], { stdio: "inherit" });
      if (r.status !== 0) console.error(`[INICIAR] voz: download de ${nome}${suf} falhou — confira o nome no catálogo rhasspy/piper-voices.`);
    }
  }
  subir("voz-servico", "./voz-servico", "servidor.js", {
    // O revoice/werift quebra com o navigator global do Node 22+.
    flags: ["--no-experimental-global-navigator"],
    env: {
      VOZ_PORTA: process.env.VOZ_PORTA || "8091",
      // A primeira voz da lista vira a padrão, salvo PIPER_VOZ explícito.
      PIPER_VOZ: process.env.PIPER_VOZ || pedidos[0] || "pt_BR-faber-medium",
    },
  });
}

// O bot é o processo principal: se ele sair, tudo sai.
subir("bot", ".", "main.js", { reiniciar: false });
