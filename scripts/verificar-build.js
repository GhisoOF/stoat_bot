
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
    if (item === "node_modules" || item.startsWith(".")) continue;
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

// 2b) o iniciar.js e os serviços embutidos (ia-servico, voz-servico): sintaxe
//     (31 out 2026). Antes só modulos/ era conferido, e um erro de sintaxe no
//     iniciar.js ou num serviço passava pelo build e derrubava o container.
{
  const arquivos = [join(RAIZ, "iniciar.js"), ...listarJs(join(RAIZ, "ia-servico")), ...listarJs(join(RAIZ, "voz-servico"))];
  for (const s of ["ia-servico/servidor.js", "voz-servico/servidor.js"]) if (!existsSync(join(RAIZ, s))) falha(`${s} não existe`);
  let n = 0;
  for (const f of arquivos) {
    if (!existsSync(f)) { falha(`${f.slice(RAIZ.length + 1)} não existe`); continue; }
    try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); n++; }
    catch (e) { falha(`sintaxe inválida em ${f.slice(RAIZ.length + 1)}: ${e.stderr?.toString().split("\n")[0] ?? e.message}`); }
  }
  console.log(`  ✓ iniciar.js e serviços: ${n} arquivo(s) com sintaxe válida`);
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
  const { pagina, todasAsPaginas } = await import(join(RAIZ, "modulos", "core", "ajuda-registro.js"));
  const ruins = [];
  let n = 0;
  const lerJs = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lerJs(join(d, e.name)) : e.name.endsWith(".js") ? [join(d, e.name)] : []));
  for (const arq of [...lerJs(join(RAIZ, "modulos")), join(RAIZ, "main.js")]) {
    // `citar("cmd.sub", …)` e as marcas `{&cmd.sub}` que passam por citarNoTexto
    for (const m of readFileSync(arq, "utf8").matchAll(/\bcitar(?:Interno)?\(\s*"([^"]+)"|\{&([a-z0-9.]+)\}/g)) {
      n++;
      try { citar(m[1] ?? m[2]); } catch (e) { ruins.push(`${arq.slice(RAIZ.length + 1)}: ${e.message}`); }
    }
  }
  // (P2) toda página da ajuda (a de cada comando e cada `paginas` de dentro), nos três idiomas
  for (const lang of ["pt", "en", "es"]) {
    for (const [id, ...cam] of todasAsPaginas()) {
      try { if (!pagina(id, cam, lang, "&")) ruins.push(`ajuda ${[id, ...cam].join(" ")} (${lang}): não monta`); }
      catch (e) { ruins.push(`ajuda ${[id, ...cam].join(" ")} (${lang}): ${e.message}`); }
    }
  }
  for (const r of ruins) falha(`citação: ${r}`);
  if (!ruins.length) console.log(`  ✓ citações por referência resolvem (${n} no código, mais as da ajuda do registro)`);
}

// 5) (31 out 2026, Regra do Reparo/Silêncio) `catch {}` vazio engole erro sem
//    rastro. Quem precisa ignorar um erro escreve o motivo: `catch { /* motivo */ }`.
//    scripts/catch-vazio.json guarda quantos vazios cada arquivo ainda tem; a lista
//    só encolhe — arquivo novo começa com zero, e nenhum arquivo ganha um a mais.
//    `node scripts/verificar-build.js --catch-atualizar` regrava a lista (só para baixo).
{
  const LISTA = join(RAIZ, "scripts", "catch-vazio.json");
  const VAZIO = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
  const arquivos = [join(RAIZ, "main.js"), join(RAIZ, "iniciar.js"),
    ...["modulos", "ia-servico", "voz-servico", "scripts"].flatMap((d) => listarJs(join(RAIZ, d)))].filter(existsSync);
  const agora = {};
  for (const a of arquivos) {
    const n = (readFileSync(a, "utf8").match(VAZIO) || []).length;
    if (n) agora[a.slice(RAIZ.length + 1)] = n;
  }
  const atualizar = process.argv.includes("--catch-atualizar");
  // primeira vez (sem a lista): --catch-atualizar fotografa o estado atual como teto
  const teto = existsSync(LISTA) ? JSON.parse(readFileSync(LISTA, "utf8")) : atualizar ? agora : {};
  const piores = Object.entries(agora).filter(([f, n]) => n > (teto[f] ?? 0));
  for (const [f, n] of piores) falha(`${f}: ${n} catch vazio(s), o teto é ${teto[f] ?? 0} — escreva o motivo: catch { /* motivo */ }`);
  if (atualizar && !piores.length) {
    const { writeFileSync } = await import("node:fs");
    const ordenado = Object.fromEntries(Object.keys(agora).sort().map((f) => [f, agora[f]]));
    writeFileSync(LISTA, JSON.stringify(ordenado, null, 2) + "\n");
  }
  if (!piores.length) console.log(`  ✓ catch vazio: ${Object.values(agora).reduce((x, y) => x + y, 0)} no total, nenhum arquivo acima do teto`);
}

// 6) (P2, 31 out 2026, Regra da Geração) as tabelas dos READMEs (comandos e variáveis)
//    saem do registro e do .env.example: tabela velha derruba o build
//    (`node scripts/gerar-readme.js` regera)
//    Dentro do build do Docker (`--imagem`) os READMEs traduzidos e o .env.example não
//    entram (.dockerignore): essa conferência é do repositório, e o CI a faz no job dos testes.
if (process.argv.includes("--imagem")) console.log("  · READMEs: conferidos no repositório (não entram na imagem)");
else {
  const { conferir } = await import(join(RAIZ, "scripts", "gerar-readme.js"));
  const problemas = await conferir(RAIZ).catch((e) => [`gerar-readme: ${e.message}`]);
  for (const p of problemas) falha(`README: ${p}`);
  if (!problemas.length) console.log("  ✓ READMEs: tabelas de comandos e variáveis em dia");
}

// 7) (P2) a trava das NOVIDADES: a entrada do topo é do pacote atual (docs/pacote.json)
//    e não é mais velha que ele — pacote com mudança visível não sobe sem o anúncio
{
  const PACOTE = join(RAIZ, "docs", "pacote.json");
  if (!existsSync(PACOTE)) falha("docs/pacote.json não existe (o pacote atual, para a trava das NOVIDADES)");
  else {
    const pac = JSON.parse(readFileSync(PACOTE, "utf8"));
    const { NOVIDADES, problemaDaTrava } = await import(join(RAIZ, "modulos", "ferramentas", "novidades.js"));
    const p = problemaDaTrava(NOVIDADES, pac);
    if (p) falha(`NOVIDADES: ${p}`);
    else console.log(`  ✓ NOVIDADES: o topo é do pacote ${pac.pacote}`);
  }
}

if (erros) {
  console.error(`\nBUILD ABORTADO: ${erros} problema(s) de integridade. O repositório está incompleto ou inconsistente.`);
  process.exit(1);
}
console.log("✓ Build íntegro: main.js, iniciar.js, modulos/ e serviços consistentes.");
