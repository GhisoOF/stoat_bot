import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CONFIG_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "blk-")), "cfg.json");
process.env.DB_PATH = path.join(path.dirname(process.env.CONFIG_PATH), "t.db");

const {
  IndiceDominios, ConstrutorIndice, criarIndiceVazio, hashDominio,
  salvarCache, carregarCache, caminhoCache,
} = await import("./modulos/moderacao/indice-dominios.js");
const engine = await import("./modulos/moderacao/automod-engine.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ── 1. Índice básico ──
{
  const c = new ConstrutorIndice();
  for (const d of ["02giga.link", "golpe.com", "sub.golpe.com", "golpe.com"]) c.adicionar(d);
  const idx = c.construir();
  ok(idx.size === 3, "dedupe: 4 inserções (1 repetida) → size 3");
  ok(idx.has("02giga.link"), "has() acha domínio presente");
  ok(idx.has("sub.golpe.com"), "has() acha subdomínio listado");
  ok(!idx.has("inocente.com.br"), "has() nega domínio ausente");
  ok(!idx.has(""), "has('') é falso, não explode");
  ok(criarIndiceVazio().size === 0 && !criarIndiceVazio().has("x.com"), "índice vazio se comporta");
  ok(typeof idx.size === "number" && idx.size.toLocaleString("en-US") === "3", ".size é número (toLocaleString ok — usado no &config PT e EN)");
}

// ── 2. Hash estável e sem colisão nos casos óbvios ──
{
  ok(hashDominio("a.com") === hashDominio("a.com"), "hash determinístico");
  ok(hashDominio("a.com") !== hashDominio("b.com"), "domínios diferentes → hashes diferentes");
}

// ── 3. Escala: 300k domínios, memória e velocidade ──
{
  const c = new ConstrutorIndice();
  for (let i = 0; i < 300_000; i++) c.adicionar(`dominio-${i}.example`);
  const t0 = performance.now();
  const idx = c.construir();
  const tBuild = performance.now() - t0;
  const t1 = performance.now();
  let acertos = 0;
  for (let i = 0; i < 50_000; i++) if (idx.has(`dominio-${(i * 6) % 300_000}.example`)) acertos++;
  const tLookup = performance.now() - t1;
  ok(idx.size === 300_000, `300k domínios indexados (build ${tBuild.toFixed(0)}ms)`);
  ok(acertos === 50_000, `50k buscas positivas, todas acertaram (${tLookup.toFixed(0)}ms ≈ ${(tLookup / 50).toFixed(3)}µs cada)`);
  ok(!idx.has("nao-existe.example"), "busca negativa em índice grande");
}

// ── 4. Compatibilidade: parseBlocklist antigo continua igual ──
{
  const texto = [
    "# comentário", "! adblock", "[secao]",
    "0.0.0.0 host1.com", "127.0.0.1 host2.com",
    "||adblock1.com^", "*.wild.com", "puro.com", "inv@lido", "",
  ].join("\n");
  const doms = engine.parseBlocklist(texto);
  ok(JSON.stringify(doms) === JSON.stringify(["host1.com", "host2.com", "adblock1.com", "wild.com", "puro.com"]),
    "parseBlocklist: hosts, AdBlock, curinga e domínio puro (comentários/ inválidos fora)");
}

// ── 5. rebuild com streaming + downgrade + cache ──
{
  // servidor HTTP local servindo uma lista estilo hosts
  const lista = Array.from({ length: 5000 }, (_, i) => `0.0.0.0 site-${i}.mal`).join("\n");
  let servirErro = false;
  const srv = http.createServer((req, res) => {
    if (servirErro) { res.destroy(); return; }
    res.writeHead(200); res.end(lista);
  });
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}/lista.txt`;

  const cfgGlobal = {
    linkBlocklistManual: ["manual.mal"],
    linkBlocklistSources: [url],
    debug: false,
  };
  const ctx = { cfgGlobal, estado: { blockedDomains: criarIndiceVazio() } };

  await engine.rebuildBlocklist(ctx);
  ok(ctx.estado.blockedDomains.size === 5001, "rebuild: 5000 da fonte + 1 manual = 5001");
  ok(ctx.estado.blockedDomains.has("site-4999.mal"), "última linha da fonte entrou (streaming não perdeu o rabo)");
  ok(ctx.estado.blockedDomains.has("manual.mal"), "domínio manual entrou");

  // downgrade: fonte cai → índice atual é MANTIDO
  servirErro = true;
  await engine.rebuildBlocklist(ctx);
  ok(ctx.estado.blockedDomains.size === 5001, "★ fonte caiu → índice antigo mantido (sem downgrade silencioso)");
  servirErro = false;

  // cache em disco: espera o salvarCache assíncrono e recarrega
  await new Promise((r) => setTimeout(r, 300));
  ok(fs.existsSync(caminhoCache()), "cache salvo em disco após rebuild");
  const doDisco = carregarCache(cfgGlobal);
  ok(doDisco && doDisco.size === 5001 && doDisco.has("site-123.mal"), "cache recarregado bate com o índice original");

  // cache invalida quando a config muda
  const outraCfg = { ...cfgGlobal, linkBlocklistManual: [] };
  ok(carregarCache(outraCfg) === null, "cache ignorado se as fontes/manuais mudaram (ex.: &blocklist clear)");

  // carregarBlocklistCache popula o estado no boot
  const ctx2 = { cfgGlobal, estado: { blockedDomains: criarIndiceVazio() } };
  ok(engine.carregarBlocklistCache(ctx2) === true && ctx2.estado.blockedDomains.size === 5001,
    "boot: carregarBlocklistCache arma o anti-link direto do disco");

  srv.close();
}

// ── 6. salvar/carregar direto (roundtrip binário) ──
{
  const c = new ConstrutorIndice();
  for (const d of ["a.com", "b.com", "c.com"]) c.adicionar(d);
  const idx = c.construir();
  const cfg = { linkBlocklistSources: ["x"], linkBlocklistManual: [] };
  await salvarCache(idx, cfg);
  const volta = carregarCache(cfg);
  ok(volta.size === 3 && volta.has("b.com") && !volta.has("d.com"), "roundtrip binário do cache preserva o índice");
}

console.log(`\nBLOCKLIST: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
