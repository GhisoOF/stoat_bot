// Gera as tabelas dos READMEs (P2, 31 out 2026) — Regra da Geração: nada copiado à mão.
//
//   node scripts/gerar-readme.js            → reescreve as tabelas dentro dos marcadores
//   node scripts/gerar-readme.js --conferir → só confere (sai com 1 se alguma estiver velha)
//
// Em cada README (README.md em inglês, README.pt-BR.md, README.es.md) o texto entre
//   <!-- gerado:comandos --> … <!-- /gerado:comandos -->   sai do registro de comandos
//   <!-- gerado:variaveis --> … <!-- /gerado:variaveis --> sai do .env.example
// O resto do README é escrito à mão. O scripts/verificar-build.js chama `conferir()`.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const READMES = [
  { arquivo: "README.md", lang: "en" },
  { arquivo: "README.pt-BR.md", lang: "pt" },
  { arquivo: "README.es.md", lang: "es" },
];

// As variáveis do .env.example: [{ nome, valor, desc, secao }] (a 1ª frase do comentário logo acima)
export function variaveisDoEnv(texto) {
  const out = [];
  const vistos = new Set();
  let comentario = [], secao = "";
  for (const linha of String(texto).split("\n")) {
    const l = linha.trim();
    if (!l) { comentario = []; continue; }
    const sec = l.match(/^#\s*──\s*(.+?)\s*──/);
    if (sec) { secao = sec[1]; comentario = []; continue; }
    if (/^#\s*[═=]{3,}/.test(l)) { comentario = []; continue; }
    const v = l.match(/^(#?)(\s*)([A-Z][A-Z0-9_]+)=(.*)$/);
    // linha comentada é variável (opcional, desligada) só se o valor não tem espaço — ou se o `#`
    // cola no nome (`#PROMPT=Você é…`). `# IMAGEM=1 liga (…)` é texto de comentário, não variável.
    const ehVariavel = v && (!v[1] || !v[2] || !/\s/.test(v[4].trim()));
    if (ehVariavel) {
      const [, , , nome, valor] = v;
      if (!vistos.has(nome)) {
        vistos.add(nome);
        const frase = comentario.join(" ").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
        out.push({ nome, valor: valor.trim(), desc: frase, secao });
      }
      // o comentário é da variável logo abaixo dele: a seguinte, sem comentário próprio, fica sem descrição
      comentario = [];
      continue;
    }
    if (l.startsWith("#")) comentario.push(l.replace(/^#+\s?/, ""));
  }
  return out;
}

const celula = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

export function tabelaDeVariaveis(texto, lang = "en") {
  const cab = {
    en: "| Variable | Example | Description (from `.env.example`, in Portuguese) |",
    pt: "| Variável | Exemplo | Descrição (do `.env.example`) |",
    es: "| Variable | Ejemplo | Descripción (del `.env.example`, en portugués) |",
  }[lang];
  const linhas = [cab, "|---|---|---|"];
  for (const v of variaveisDoEnv(texto)) linhas.push(`| \`${v.nome}\` | ${v.valor ? `\`${celula(v.valor).replace(/`/g, "'")}\`` : "—"} | ${celula(v.desc).slice(0, 160) || "—"} |`);
  return linhas.join("\n");
}

const raizPadrao = () => process.cwd();

// { arquivo → { comandos, variaveis } } — o que deveria estar entre os marcadores
export async function gerarTabelas(raiz = raizPadrao()) {
  const { tabelaDeComandos } = await import(pathToFileURL(join(raiz, "modulos", "core", "ajuda-registro.js")).href);
  const env = readFileSync(join(raiz, ".env.example"), "utf8");
  const out = {};
  for (const { arquivo, lang } of READMES) out[arquivo] = { comandos: tabelaDeComandos(lang, "&"), variaveis: tabelaDeVariaveis(env, lang) };
  return out;
}

// O texto com cada bloco trocado pelo gerado (marcador ausente é erro)
export function substituir(texto, bloco, conteudo) {
  const ini = `<!-- gerado:${bloco} -->`, fim = `<!-- /gerado:${bloco} -->`;
  const a = texto.indexOf(ini), b = texto.indexOf(fim);
  if (a < 0 || b < a) throw new Error(`marcador <!-- gerado:${bloco} --> ausente`);
  return texto.slice(0, a + ini.length) + "\n" + conteudo + "\n" + texto.slice(b);
}

// Os problemas (vazio = os três READMEs em dia)
export async function conferir(raiz = raizPadrao()) {
  const problemas = [];
  const tabelas = await gerarTabelas(raiz);
  for (const { arquivo } of READMES) {
    const p = join(raiz, arquivo);
    if (!existsSync(p)) { problemas.push(`${arquivo} não existe`); continue; }
    const atual = readFileSync(p, "utf8");
    try {
      let novo = atual;
      for (const bloco of ["comandos", "variaveis"]) novo = substituir(novo, bloco, tabelas[arquivo][bloco]);
      if (novo !== atual) problemas.push(`${arquivo}: a tabela gerada está velha — rode \`node scripts/gerar-readme.js\``);
    } catch (e) { problemas.push(`${arquivo}: ${e.message}`); }
  }
  return problemas;
}

export async function escrever(raiz = raizPadrao()) {
  const tabelas = await gerarTabelas(raiz);
  for (const { arquivo } of READMES) {
    const p = join(raiz, arquivo);
    let t = readFileSync(p, "utf8");
    for (const bloco of ["comandos", "variaveis"]) t = substituir(t, bloco, tabelas[arquivo][bloco]);
    writeFileSync(p, t);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv.includes("--conferir")) {
    const p = await conferir();
    for (const x of p) console.error("  ✗ " + x);
    process.exit(p.length ? 1 : 0);
  }
  await escrever();
  console.log("✓ READMEs: tabelas de comandos e variáveis geradas");
}
