
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

// 3) o registro de comandos: cada entrada aponta (`modulo` + `funcao`) para um
//    arquivo que existe e um export que existe nele, e todo arquivo da pasta está
//    no index.js (17 out 2026 — antes era a tabela `rotas` do main.js)
{
  const dir = join(RAIZ, "modulos", "comandos");
  if (!existsSync(join(dir, "index.js"))) falha("modulos/comandos/index.js não existe");
  else {
    const indice = readFileSync(join(dir, "index.js"), "utf8");
    const ruins = [];
    let n = 0;
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "index.js")) {
      if (!indice.includes(`from "./${arq}"`)) ruins.push(`${arq} não está no index.js (o comando não existiria)`);
      const src = readFileSync(join(dir, arq), "utf8");
      const locais = new Set([...src.matchAll(/function\s+(\w+)/g)].map((m) => m[1]));
      for (const m of src.matchAll(/modulo:\s*"([^"]+)",\s*\n\s*funcao:\s*"([\w$]+)"/g)) {
        n++;
        const [, mod, exp] = m;
        const alvo = resolve(dir, mod);
        if (!existsSync(alvo)) { ruins.push(`${arq}: "${mod}" não existe`); continue; }
        if (!new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${exp}\\b`).test(readFileSync(alvo, "utf8")))
          ruins.push(`${arq}: "${exp}" não é exportado por ${alvo.slice(RAIZ.length + 1)}`);
      }
      for (const m of src.matchAll(/funcao:\s*([A-Za-z_$][\w$]*),/g)) {
        n++;
        if (!locais.has(m[1])) ruins.push(`${arq}: funcao aponta para "${m[1]}", que não existe no arquivo`);
      }
    }
    for (const r of ruins) falha(`registro de comandos: ${r}`);
    if (!ruins.length) console.log(`  ✓ registro de comandos consistente (${n} handlers)`);
  }
}

// 4) as citações por referência (fase 3): todo `citar("cmd.sub")` do código e todo
//    `{&cmd.sub}` dos textos do registro apontam para um comando e um subcomando
//    que existem — referência quebrada para o build, não sai torta na tela
{
  const { citar } = await import(join(RAIZ, "modulos", "core", "aliases.js"));
  const { detalhesDoRegistro, parametrosDoRegistro } = await import(join(RAIZ, "modulos", "core", "ajuda-registro.js"));
  const ruins = [];
  let n = 0;
  const lerJs = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lerJs(join(d, e.name)) : e.name.endsWith(".js") ? [join(d, e.name)] : []));
  for (const arq of [...lerJs(join(RAIZ, "modulos")), join(RAIZ, "main.js")]) {
    // `citar("cmd.sub", …)` e as marcas `{&cmd.sub}` que passam por citarNoTexto
    for (const m of readFileSync(arq, "utf8").matchAll(/\bcitar\(\s*"([^"]+)"|\{&([a-z0-9.]+)\}/g)) {
      n++;
      try { citar(m[1] ?? m[2]); } catch (e) { ruins.push(`${arq.slice(RAIZ.length + 1)}: ${e.message}`); }
    }
  }
  for (const lang of ["pt", "en"]) {
    try { detalhesDoRegistro("&", lang); parametrosDoRegistro("&", lang); } catch (e) { ruins.push(`ajuda do registro (${lang}): ${e.message}`); }
  }
  for (const r of ruins) falha(`citação: ${r}`);
  if (!ruins.length) console.log(`  ✓ citações por referência resolvem (${n} no código, mais as da ajuda do registro)`);
}

if (erros) {
  console.error(`\nBUILD ABORTADO: ${erros} problema(s) de integridade. O repositório está incompleto ou inconsistente.`);
  process.exit(1);
}
console.log("✓ Build íntegro: main.js e modulos/ consistentes.");
