// ══════════════════════════════════════════════════════════
//  verificar-build.js — sanidade do build (roda no Docker build)
//
//  Garante que a imagem só é construída se:
//   1. Todos os imports locais do main.js existem no disco
//   2. Todos os .js de modulos/ têm sintaxe válida e seus
//      imports relativos também existem
//
//  Se o repositório estiver incompleto (ex.: pasta modulos/
//  faltando após uma atualização malfeita), o build FALHA aqui,
//  em vez de gerar um container que morre em crash-loop.
// ══════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = process.cwd();
let erros = 0;
const falha = (msg) => { console.error("  ✗ " + msg); erros++; };

// extrai caminhos de import relativos de um arquivo
function importsLocais(caminho) {
  const src = readFileSync(caminho, "utf8");
  const re = /from\s+["'](\.\.?\/[^"']+)["']/g;
  const achados = [];
  let m;
  while ((m = re.exec(src))) achados.push(m[1]);
  return achados;
}

// 1) main.js existe e seus imports resolvem
const mainPath = join(RAIZ, "main.js");
if (!existsSync(mainPath)) {
  falha("main.js não existe na raiz!");
} else {
  for (const imp of importsLocais(mainPath)) {
    const alvo = resolve(RAIZ, imp);
    if (!existsSync(alvo)) falha(`main.js importa "${imp}" mas o arquivo não existe`);
  }
}

// 2) todos os .js de modulos/: sintaxe + imports relativos
function listarJs(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const item of readdirSync(dir)) {
    const p = join(dir, item);
    if (statSync(p).isDirectory()) out.push(...listarJs(p));
    else if (item.endsWith(".js")) out.push(p);
  }
  return out;
}

const modulosDir = join(RAIZ, "modulos");
if (!existsSync(modulosDir)) {
  falha("a pasta modulos/ não existe!");
} else {
  const arquivos = listarJs(modulosDir);
  if (arquivos.length < 10) falha(`modulos/ tem só ${arquivos.length} arquivo(s) .js — estrutura incompleta?`);
  for (const f of arquivos) {
    try {
      execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
    } catch (e) {
      falha(`sintaxe inválida em ${f}: ${e.stderr?.toString().split("\n")[0] ?? e.message}`);
      continue;
    }
    for (const imp of importsLocais(f)) {
      const alvo = resolve(dirname(f), imp);
      if (!existsSync(alvo)) falha(`${f} importa "${imp}" mas o arquivo não existe`);
    }
  }
  console.log(`  ✓ ${arquivos.length} módulos verificados`);
}

// ── Rotas: cada comando aponta para algo que existe? ──────
// `node --check` só valida sintaxe; uma rota apontando para uma função
// removida (ex.: `configurar: cmdSetupRouter` depois de apagar o setup) só
// explode em runtime, no boot. Esta checagem pega isso antes do deploy.
{
  const src = readFileSync(resolve(RAIZ, "main.js"), "utf8");
  const conhecidos = new Set();
  for (const m of src.matchAll(/import\s+\*\s+as\s+(\w+)\s+from/g)) conhecidos.add(m[1]);
  for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from/g))
    m[1].split(",").forEach((x) => conhecidos.add(x.trim().split(/\s+as\s+/).pop()));
  for (const m of src.matchAll(/import\s+(\w+)\s+from/g)) conhecidos.add(m[1]);
  for (const m of src.matchAll(/(?:async\s+)?function\s+(\w+)/g)) conhecidos.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)) conhecidos.add(m[1]);

  const ini = src.indexOf("const rotas");
  const fim = src.indexOf("// Aliases");
  if (ini !== -1 && fim > ini) {
    const bloco = src.slice(ini, fim);
    const ruins = new Set();
    for (const m of bloco.matchAll(/^\s*[\wáéíóúâêôãõç]+:\s*([A-Za-z_$][\w$]*)(?:\.\w+)?\s*,/gm)) {
      if (!conhecidos.has(m[1])) ruins.add(m[1]);
    }
    for (const r of ruins) falha(`main.js: rota aponta para "${r}", que não existe (import removido?)`);
    if (!ruins.size) console.log("  ✓ rotas de comandos consistentes");
  }
}

if (erros) {
  console.error(`\nBUILD ABORTADO: ${erros} problema(s) de integridade. O repositório está incompleto ou inconsistente.`);
  process.exit(1);
}
console.log("✓ Build íntegro: main.js e modulos/ consistentes.");
