
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { iaLigada, conversaLigada, imagemLigada, modoIA, numero, problemasDoEnv, avisosDoEnv, MODELO_LOCAL_PADRAO } from "./modulos/core/env.js";
import { avisoSemTrava } from "./modulos/core/modelos-sem-trava.js";
import { montarConfigSwap, flagsDoLlama, modeloValido } from "./modulos/core/llama-swap-config.js";
import { arquivosParaBaixar, tipoDoModelo, imagemPedida } from "./modulos/core/imagem-modelo.js";

const LLAMA_BIN = process.env.LLAMA_BIN || "/usr/local/bin/llama-server";
const SWAP_BIN = process.env.SWAP_BIN || "/usr/local/bin/llama-swap";

// ── O ambiente de cada processo filho (31 out 2026, R10) ──────────────────
// Antes, todo filho herdava o .env inteiro: o llama-server, o curl e o
// serviço de IA (que lê páginas da web) levavam o BOT_TOKEN junto. Agora cada
// um recebe só o que usa. "X_*" = toda variável que começa com "X_"; "X*"
// inclui a própria X. Variável nova lida por um serviço entra na lista dele
// (o teste p1-infra confere a do ia-servico e a do voz-servico).
const ENV_BASE = ["PATH", "HOME", "LANG", "LC_ALL", "TZ", "TMPDIR", "NODE_ENV",
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR", "LD_LIBRARY_PATH"];
// os ajustes de GPU que quem hospeda põe no .env (Vulkan, ROCm, CUDA): não são
// segredo, e o llama e o sd.cpp precisam deles (mesma lista do modulos/ai/servicos.js)
const GPU = ["GGML_*", "VK_*", "MESA_*", "RADV_*", "HSA_*", "ROC*", "HIP_*", "CUDA_*", "AMD_*"];
export const ENV_FILHO = {
  // llama-server e llama-swap (que repassa o seu ambiente ao llama-server)
  llama: ["LLAMA_CACHE", "HF_TOKEN", ...GPU],
  curl: [],
  iaServico: ["IA_CHAVE", "IA_SERVICO_CHAVE", "IMAGEM*", "SD_*", "LLM_*", "SEARXNG_*", "GITHUB_*", "CODIGO_*",
    "RSS_*", "REDE_*", "CALC_TIMEOUT_MS", "CDN_URL", "CONTINUAR_MAX", "DNS_FALLBACK", "FERRAMENTAS_OFF",
    "MAX_TOKENS", "MAX_VOLTAS_FERRAMENTA", "NUM_CTX", ...GPU],
  // o voz-servico entra na call com a conta do bot: é o único que leva o BOT_TOKEN
  vozServico: ["BOT_TOKEN", "VOZ_*", "TTS_*", "PIPER_*", "MUSICA_*", "SPOTIFY_*", "LIVEKIT_*", "STOAT_API", "YTDLP_BIN"],
};

export function envDoFilho(nomes = [], extra = {}, fonte = process.env) {
  const regras = [...ENV_BASE, ...nomes];
  const passa = (k) => regras.some((r) => (r.endsWith("*") ? k.startsWith(r.slice(0, -1)) : k === r));
  const env = {};
  for (const [k, v] of Object.entries(fonte)) if (v !== undefined && passa(k)) env[k] = v;
  return { ...env, ...extra };
}

// curl só por https (também nos redirecionamentos), com teto de tempo e de tamanho
const curlSeguro = (segundos, bytes) => ["-fL", "--retry", "2", "--proto", "=https", "--proto-redir", "=https",
  "--connect-timeout", "30", "--max-time", String(segundos), "--max-filesize", String(bytes)];

// Vozes do catálogo do Piper: idioma[_REGIAO]-pessoa-qualidade. Fechada: nada
// de ".", "/" ou "..", então o nome não sai da pasta das vozes nem da URL.
const VOZ = /^([a-z]{2,3})(?:_([A-Za-z]{2,4}))?-([A-Za-z0-9_]{1,64})-([a-z_]{1,16})$/;
export function urlDaVoz(nome) {
  const m = VOZ.exec(nome);
  if (!m) return null;
  const [, lang, regiao, pessoa, qualidade] = m;
  const pasta = regiao ? `${lang}_${regiao}` : lang;
  return `https://huggingface.co/rhasspy/piper-voices/resolve/main/${lang}/${pasta}/${pessoa}/${qualidade}/${nome}.onnx`;
}
const vozesPedidas = () => (process.env.VOZES || "pt_BR-faber-medium").split(",").map((v) => v.trim()).filter(Boolean);

// O que o boot confere antes de subir qualquer coisa: o problemasDoEnv() e o
// que entra na linha de comando dos filhos. Lista vazia = pode subir.
export function problemasDoBoot() {
  const p = [...problemasDoEnv()];
  const tentar = (fn) => { try { fn(); } catch (e) { p.push(e.message.replace(/^\.env: /, "")); } };
  tentar(() => flagsDoLlama(process.env.LLAMA_FLAGS));
  tentar(() => numero("LLAMA_NGL", 999, { min: 0, max: 9999, inteiro: true }));
  for (const v of ["LLAMA_CTX", "LLAMA_CTX_MODERACAO"]) tentar(() => numero(v, 4096, { min: 256, max: 4_194_304, inteiro: true }));
  for (const v of ["LLAMA_PORTA", "IA_PORTA", "VOZ_PORTA"]) tentar(() => numero(v, 8082, { min: 1024, max: 65535, inteiro: true }));
  tentar(() => numero("IA_TTL", 3600, { min: 1, max: 604_800, inteiro: true }));
  if (!/^\/[\w.\/-]+$/.test(LLAMA_BIN)) p.push("LLAMA_BIN tem de ser um caminho absoluto simples");
  if (iaLigada() && modoIA() === "local") {
    // os mesmos valores que o boot passa ao -hf e ao YAML do llama-swap
    const modelos = { MODELO: process.env.MODELO, MODELO_VISAO: process.env.MODELO_VISAO || process.env.LLM_MODEL_VISAO, MODELO_MODERACAO: process.env.MODELO_MODERACAO };
    for (const [v, m] of Object.entries(modelos)) {
      if (m && !modeloValido(m)) p.push(`${v}: use usuario/repositorio:quantizacao do Hugging Face (ex.: ${MODELO_LOCAL_PADRAO})`);
    }
    if (imagemLigada() && imagemPedida()) tentar(() => arquivosParaBaixar());
  }
  if (process.env.VOZ_ATIVA === "1") {
    const ruins = [...vozesPedidas(), ...(process.env.PIPER_VOZ ? [process.env.PIPER_VOZ] : [])].filter((n) => !urlDaVoz(n));
    if (ruins.length) p.push(`VOZES/PIPER_VOZ: "${ruins.join(", ").slice(0, 80)}" fora do padrão idioma_REGIAO-pessoa-qualidade (ex.: pt_BR-faber-medium)`);
  }
  return p;
}

// ── A IA local: o plano (31 out 2026, P2) ─────────────────────────────────
// O que sobe e com que nomes. null = nada de IA local (IA=0, sem IA_MODO=local ou
// IA_EMBUTIDA=0 com LLM_URL externo). Os nomes são o que o bot pede ao llama-swap
// ("conversa", "visao", "moderacao"); com o llama-server direto (sem llama-swap na
// imagem) só existe um modelo, e todo papel cai nele.
export function planoDaIA(env = process.env, { swapBin = SWAP_BIN, existe = existsSync } = {}) {
  if (!iaLigada() || modoIA() !== "local") return null;
  const conversa = env.MODELO || MODELO_LOCAL_PADRAO;
  const visao = env.MODELO_VISAO || env.LLM_MODEL_VISAO || null;
  const moderacao = (env.MODELO_MODERACAO || "").trim() || null;
  const temSwap = existe(swapBin);
  const nomes = temSwap
    ? { conversa: "conversa", visao: "visao", moderacao: "moderacao" }
    : { conversa: env.LLM_MODEL || "conversa", visao: env.LLM_MODEL || "conversa", moderacao: env.LLM_MODEL || "conversa" };
  return {
    conversa, visao: temSwap ? visao : null, moderacao: temSwap ? moderacao : null, swap: temSwap, nomes,
    cache: env.LLAMA_CACHE || "/data/modelos",
    imagem: imagemLigada() && imagemPedida(env),
    ttl: numero("IA_TTL", 3600),
  };
}

// Soma os bytes já em disco de um diretório (recursivo) — é o medidor honesto do
// download: o progresso do llama usa \r e o docker logs engole.
function tamanhoDir(d) {
  let total = 0;
  try {
    for (const f of readdirSync(d, { recursive: true, withFileTypes: true })) {
      if (f.isFile()) { try { total += statSync(join(f.parentPath ?? f.path, f.name)).size; } catch { /* sumiu no meio da conta: não soma */ } }
    }
  } catch { /* o diretório ainda não existe: 0 */ }
  return total;
}

// Baixa um modelo do Hugging Face com o próprio llama-server (-hf) numa porta só
// dele, até o /health responder; um marcador no cache evita repetir nos boots seguintes.
function baixarModelo(m, cache) {
  return new Promise((res) => {
    const marca = `${cache}/.pronto-${m.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    if (existsSync(marca)) return res(true);
    console.info(`[INICIAR] baixando modelo ${m} (o bot já está no ar; a IA responde quando terminar)…`);
    const dirModelo = join(cache, `models--${m.split(":")[0].replaceAll("/", "--")}`);
    let bytesAntes = tamanhoDir(dirModelo);
    let quando = Date.now();
    const progresso = setInterval(() => {
      const agora = tamanhoDir(dirModelo);
      const vel = Math.max(0, (agora - bytesAntes) / ((Date.now() - quando) / 1000));
      console.info(`[INICIAR] download: ${(agora / 1e9).toFixed(2)} GB no disco (${(vel / 1e6).toFixed(1)} MB/s)`);
      bytesAntes = agora; quando = Date.now();
    }, 10_000);
    progresso.unref?.();
    const p = spawn(LLAMA_BIN,
      ["-hf", m, "--host", "127.0.0.1", "--port", "8199", "-c", "256", "-ngl", "0"],
      { env: envDoFilho(ENV_FILHO.llama, { LLAMA_CACHE: cache }), stdio: ["ignore", "inherit", "inherit"] });
    filhos.add(p);
    let vivo = true;
    const fim = (ok) => { if (!vivo) return; vivo = false; clearInterval(progresso); clearInterval(espera); filhos.delete(p); res(ok); };
    p.on("error", (e) => { console.error(`[INICIAR] download de ${m}: ${e.message}`); fim(false); });
    p.on("exit", (c) => { if (vivo) console.error(`[INICIAR] download de ${m} falhou (saída ${c}) — o llama-swap tenta de novo sob demanda.`); fim(false); });
    const espera = setInterval(async () => {
      if (!vivo) return;
      const r = await fetch("http://127.0.0.1:8199/health").catch(() => null);
      if (r?.ok && vivo) {
        try { writeFileSync(marca, new Date().toISOString()); } catch (e) { console.warn(`[INICIAR] marcador de ${m}: ${e.message}`); }
        console.info(`[INICIAR] modelo pronto no disco: ${m}`);
        fim(true);
        try { p.kill("SIGTERM"); } catch { /* já saiu */ }
      }
    }, 3000);
  });
}

// Os arquivos do gerador de imagem (só com IMAGEM=1): as URLs saem do mesmo lugar
// que o gerador usa (modulos/core/imagem-modelo.js), já conferidas no problemasDoBoot.
function baixarArquivoSD(rotulo, url, SD_DIR) {
  return new Promise((res) => {
    let nome; try { nome = url.split("/").pop().split("?")[0]; } catch { nome = "modelo"; }
    const destino = join(SD_DIR, nome);
    const marca = `${SD_DIR}/.pronto-${nome.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    if (existsSync(destino) && existsSync(marca)) return res(true);
    try { mkdirSync(SD_DIR, { recursive: true }); } catch { /* já existe; o curl acusa se não der */ }
    console.info(`[INICIAR] baixando ${rotulo} (${nome})…`);
    const tmp = `${destino}.baixando`;
    // até 20 GiB e 6 h por arquivo (o maior hoje, a difusão Q8 do Qwen, tem 7,6 GB)
    const p = spawn("curl", [...curlSeguro(6 * 3600, 20 * 1024 ** 3), url, "-o", tmp],
      { stdio: ["ignore", "ignore", "inherit"], env: envDoFilho(ENV_FILHO.curl) });
    filhos.add(p);
    let bytesAntes = 0, quando = Date.now();
    const progresso = setInterval(() => {
      let agora = 0; try { agora = statSync(tmp).size; } catch { /* o curl ainda não criou o arquivo */ }
      const vel = Math.max(0, (agora - bytesAntes) / ((Date.now() - quando) / 1000));
      console.info(`[INICIAR] ${rotulo}: ${(agora / 1e9).toFixed(2)} GB no disco (${(vel / 1e6).toFixed(1)} MB/s)`);
      bytesAntes = agora; quando = Date.now();
    }, 10_000);
    progresso.unref?.();
    p.on("error", (e) => { clearInterval(progresso); filhos.delete(p); console.error(`[INICIAR] ${rotulo}: ${e.message}`); res(false); });
    p.on("exit", (c) => {
      clearInterval(progresso); filhos.delete(p);
      if (c === 0) {
        try { renameSync(tmp, destino); writeFileSync(marca, new Date().toISOString()); } catch (e) { console.warn(`[INICIAR] ${rotulo}: ${e.message}`); }
        console.info(`[INICIAR] ${rotulo} pronto no disco.`);
        res(true);
      } else {
        try { unlinkSync(tmp); } catch { /* não chegou a criar */ }
        console.error(`[INICIAR] download de ${rotulo} falhou (saída ${c}) — a ferramenta gerar_imagem tentará de novo sob demanda.`);
        res(false);
      }
    });
  });
}

// Depois do bot: os downloads e o servidor de modelos.
async function subirIA(plano) {
  const ngl = String(numero("LLAMA_NGL", 999));
  const ctx = String(numero("LLAMA_CTX", 8192));
  const portaLlama = String(numero("LLAMA_PORTA", 8082));
  const flagsExtra = flagsDoLlama(process.env.LLAMA_FLAGS);  // ex.: "--temp 1.0 --top-p 0.95 --top-k 64" (Gemma) — cada família tem o seu
  if (!existsSync(LLAMA_BIN)) {
    console.error(`[INICIAR] IA_MODO=local mas ${LLAMA_BIN} não existe nesta imagem — a IA vai falhar. Aponte LLM_URL para um servidor externo, ou use IA=0.`);
    return;
  }
  const { cache } = plano;
  try { mkdirSync(cache, { recursive: true }); } catch { /* já existe; o llama acusa se não der */ }

  if (!plano.swap) {
    // Sem llama-swap na imagem: o llama-server direto (baixa o modelo no primeiro
    // arranque pelo -hf; fica carregado — sem TTL).
    console.warn(`[INICIAR] ${SWAP_BIN} não existe nesta imagem — llama-server direto, um modelo só, sem TTL (sem visão nem modelo de moderação).`);
    console.info(`[INICIAR] IA local: ${plano.conversa} (primeiro arranque baixa o modelo — pode demorar)`);
    // -ngl: camadas na GPU. 999 = "tudo o que couber"; sem GPU, ele cai para CPU sozinho.
    subirBin("llama", LLAMA_BIN,
      ["-hf", plano.conversa, "--host", "127.0.0.1", "--port", portaLlama, "-c", ctx, "-ngl", ngl, "--jinja", ...flagsExtra],
      envDoFilho(ENV_FILHO.llama, { LLAMA_CACHE: cache }));
    return;
  }

  // ── Download dos modelos (o bot já está no ar) ──
  // Antes, o download era refém do primeiro pedido: o llama-swap só ligava o
  // servidor sob demanda, o pedido estourava o timeout, o swap matava o servidor
  // e o download morria junto. Aqui cada modelo baixa até o fim, com progresso.
  const { conversa, visao, moderacao } = plano;
  for (const m of [...new Set([conversa, visao, moderacao].filter(Boolean))]) {
    if (encerrando) return;
    await baixarModelo(m, cache);
  }

  // ── O gerador de imagem: só com IMAGEM=1 ──
  if (plano.imagem && !encerrando) {
    const SD_DIR = process.env.SD_MODELOS_DIR || "/data/modelos-sd";
    console.info(`[INICIAR] gerador de imagem: ${tipoDoModelo()}`);
    for (const [rotulo, url] of arquivosParaBaixar()) {
      if (encerrando) return;
      await baixarArquivoSD(rotulo, url, SD_DIR);
    }
  }
  if (encerrando) return;

  // ── O llama-swap: um modelo ou três, sempre com o TTL de verdade ──
  const cfg = process.env.LLAMA_SWAP_YAML || "/data/llama-swap.yaml";
  const extra = flagsExtra.join(" ");
  const comando = (m, c = ctx) => `${LLAMA_BIN} -hf ${m} --host 127.0.0.1 --port \${PORT} -c ${c} -ngl ${ngl} --jinja${extra ? " " + extra : ""}`;
  // IA_TTL: quanto tempo o modelo fica na memória sem uso (s). Padrão 1 h; no modo
  // enxuto (CONVERSA=0) 5 min — a RAM/GPU volta para o resto da máquina.
  const ttl = plano.ttl;
  writeFileSync(cfg, montarConfigSwap({ conversa, visao, moderacao, comando, ttlConversa: ttl, ttlVisao: Math.min(600, ttl), ctxModeracao: process.env.LLAMA_CTX_MODERACAO || "4096" }));
  console.info(`[INICIAR] IA local (llama-swap, ttl ${ttl}s): conversa=${conversa} · visão=${!visao ? "nenhuma" : visao === conversa ? "o mesmo modelo (apelido, sem 2ª cópia)" : visao}${moderacao ? ` · moderação=${moderacao === conversa ? "o mesmo modelo" : `${moderacao} (fica carregado junto)`}` : ""}`);
  subirBin("llama-swap", SWAP_BIN, ["-config", cfg, "-listen", `127.0.0.1:${portaLlama}`],
    envDoFilho(ENV_FILHO.llama, { LLAMA_CACHE: cache }));
}

const filhos = new Set();
let encerrando = false;

// `ambiente`: a lista do ENV_FILHO; null = o ambiente inteiro (só o bot).
function subir(nome, cwd, arquivo, { reiniciar = true, env = {}, flags = [], ambiente = null } = {}) {
  if (!existsSync(`${cwd}/${arquivo}`)) {
    console.warn(`[INICIAR] ${nome}: ${cwd}/${arquivo} não existe — pulando.`);
    return;
  }
  let tentativas = 0;
  const lancar = () => {
    const p = spawn(process.execPath, [...flags, arquivo], {
      cwd, stdio: "inherit",
      // SERVICO_HOST: os serviços embutidos ouvem só em 127.0.0.1 — o bot fala com
      // eles por ali, e ninguém mais na rede (nem outro contêiner) alcança. Fixo
      // DEPOIS do ambiente: um SERVICO_HOST no .env não abre os serviços.
      env: { ...(ambiente ? envDoFilho(ambiente) : process.env), ...env, SERVICO_HOST: "127.0.0.1" },
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

function subirBin(nome, bin, args, env) {
  let tentativas = 0;
  const lancar = () => {
    const p = spawn(bin, args, { stdio: "inherit", env });
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

// Importado (pelos testes), o arquivo só expõe as funções acima; o boot roda
// quando ele é o programa (node iniciar.js).
const PRINCIPAL = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (PRINCIPAL) {
  const problemas = problemasDoBoot();
  if (problemas.length) {
    console.error(`[INICIAR] O .env tem ${problemas.length} problema(s) — nada foi iniciado:\n${problemas.map((x) => `  - ${x}`).join("\n")}`);
    process.exit(1);
  }
  process.on("SIGTERM", () => encerrar(0));
  process.on("SIGINT", () => encerrar(0));

  const IA_EMBUTIDA = iaLigada() && process.env.IA_EMBUTIDA !== "0";
  const VOZ_ATIVA = process.env.VOZ_ATIVA === "1";

  // Padrões de localhost quando os serviços estão embutidos.
  if (IA_EMBUTIDA && !process.env.IA_SERVICO_URL) process.env.IA_SERVICO_URL = "http://127.0.0.1:8090";
  if (VOZ_ATIVA && !process.env.VOZ_SERVICO_URL) process.env.VOZ_SERVICO_URL = "http://127.0.0.1:8091";

  // Chave dos serviços internos (15 out 2026): sem VOZ_CHAVE/IA_SERVICO_CHAVE no
  // .env, qualquer processo que alcançasse 127.0.0.1:8090/8091 mandava a Judy
  // falar ou rodar ferramentas. Embutidos, bot e serviços são filhos DESTE
  // processo: uma chave aleatória por boot basta, e ninguém precisa configurar.
  if (IA_EMBUTIDA && !process.env.IA_SERVICO_CHAVE && !process.env.IA_CHAVE) process.env.IA_SERVICO_CHAVE = randomBytes(24).toString("hex");
  if (VOZ_ATIVA && !process.env.VOZ_CHAVE) process.env.VOZ_CHAVE = randomBytes(24).toString("hex");

  // ler_codigo de fábrica: o código do próprio bot já está na imagem (este
  // diretório, só leitura). Quem definir GITHUB_REPO ou CODIGO_DIR no .env
  // continua mandando. O ler_codigo já ignora dotfiles e bloqueia .env/token/.db.
  if (!process.env.CODIGO_DIR && !process.env.GITHUB_REPO) {
    process.env.CODIGO_DIR = process.cwd();
    console.info(`[INICIAR] ler_codigo: lendo o próprio código em ${process.cwd()} (defina GITHUB_REPO ou CODIGO_DIR para mudar).`);
  }

  if (iaLigada() && !conversaLigada()) {
    console.info(`[INICIAR] CONVERSA=0 — modo enxuto: IA só para moderação, relatório e RSS (sem chat, sem gerar imagem; contexto ${process.env.LLAMA_CTX}, modelo sai da memória após ${process.env.IA_TTL}s parado).`);
  }
  // (22 out 2026) sem modo +18: avisa se o .env aponta para um modelo sem trava
  if (iaLigada()) { const aviso = avisoSemTrava(); if (aviso) console.warn(aviso); }
  // (P2) nomes de modelo que saíram: valem como sinônimo, com aviso
  for (const a of avisosDoEnv()) console.warn(`[INICIAR] .env: ${a}`);

  // ── A IA local (31 out 2026, P2, R11) ────────────────────────────────────
  // Antes: o bot só conectava ao Stoat depois de baixar TODOS os modelos — num
  // volume novo, a moderação ficava horas fora do ar esperando gigabytes. E com
  // um modelo só, o llama-server subia direto (sem llama-swap): carregado para
  // sempre, o IA_TTL não valia. Agora:
  //   1. os nomes que o bot usa (LLM_MODEL=conversa, visao, moderacao) são
  //      decididos AQUI, antes de o bot subir;
  //   2. o bot sobe e conecta;
  //   3. os modelos baixam em seguida (o bot já está no ar; a IA responde
  //      quando o llama-swap subir);
  //   4. sempre o llama-swap (com o TTL de verdade), mesmo com um modelo só; o
  //      llama-server direto só quando a imagem não tem o llama-swap;
  //   5. o gerador de imagem só baixa com IMAGEM=1.
  const plano = planoDaIA();
  if (plano) {
    process.env.LLM_MODEL = plano.nomes.conversa;
    if (plano.visao) process.env.LLM_MODEL_VISAO = plano.nomes.visao;
    if (plano.moderacao) process.env.LLM_MODEL_JUIZ = plano.nomes.moderacao;
  }

  if (IA_EMBUTIDA) subir("ia-servico", "./ia-servico", "servidor.js", { ambiente: ENV_FILHO.iaServico, env: { PORTA: process.env.IA_PORTA || "8090" } });
  // O bot é o processo principal: se ele sair, tudo sai. Ele leva o ambiente
  // inteiro (é quem usa o .env), com as chaves dos serviços que este boot gerou.
  // Sobe ANTES dos downloads (P2): a moderação não espera os modelos.
  subir("bot", ".", "main.js", { reiniciar: false });

  if (VOZ_ATIVA) {
    const vozesDir = process.env.PIPER_VOZES || "/data/vozes";
    try { mkdirSync(vozesDir, { recursive: true }); } catch {}
    // Quais vozes baixar: a env VOZES lista nomes do catálogo oficial do Piper
    // (https://huggingface.co/rhasspy/piper-voices), separados por vírgula.
    // O nome carrega o caminho: pt_BR-faber-medium → pt/pt_BR/faber/medium/.
    // (os nomes já passaram pela regex fechada no problemasDoBoot)
    const pedidos = vozesPedidas();
    const jaTem = new Set(existsSync(vozesDir) ? readdirSync(vozesDir) : []);
    for (const nome of pedidos) {
      if (jaTem.has(`${nome}.onnx`) && jaTem.has(`${nome}.onnx.json`)) continue;
      const url = urlDaVoz(nome);
      console.info(`[INICIAR] voz: baixando ${nome} (uma vez, fica no volume)…`);
      for (const suf of [".onnx", ".onnx.json"]) {
        // uma voz "high" tem ~110 MB: teto de 200 MiB e 10 min por arquivo
        const r = spawnSync("curl", [...curlSeguro(600, 200 * 1024 ** 2), `${url.replace(/\.onnx$/, "")}${suf}`, "-o", `${vozesDir}/${nome}${suf}`],
          { stdio: "inherit", env: envDoFilho(ENV_FILHO.curl) });
        if (r.status !== 0) console.error(`[INICIAR] voz: download de ${nome}${suf} falhou — confira o nome no catálogo rhasspy/piper-voices.`);
      }
    }
    subir("voz-servico", "./voz-servico", "servidor.js", {
      // O revoice/werift quebra com o navigator global do Node 22+.
      flags: ["--no-experimental-global-navigator"],
      ambiente: ENV_FILHO.vozServico,
      env: {
        VOZ_PORTA: process.env.VOZ_PORTA || "8091",
        // A primeira voz da lista vira a padrão, salvo PIPER_VOZ explícito.
        PIPER_VOZ: process.env.PIPER_VOZ || pedidos[0] || "pt_BR-faber-medium",
      },
    });
  }


  if (plano) await subirIA(plano);
}
