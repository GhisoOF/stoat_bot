// Renderiza TODAS as páginas de ajuda como o usuário as vê e procura comando
// que não existe mais.
//
// Por que existe: varrer o código-fonte com regex deixou passar legado três
// vezes seguidas — `&warnings` escrito com o `&` fixo, `&tts entrar` dentro de
// uma string longa, o título de um nó vindo do nome antigo. O que importa é o
// texto FINAL que chega ao chat, então é ele que este teste lê.
//
// Também pega: página que não envia nada (o bug do enviarPaginado), página
// que falta para um comando que existe (o &help entrar), e `titulo`/`texto`
// aparecendo como se fossem subtópicos.

import assert from "node:assert";
import fs from "node:fs";

process.env.DB_PATH = "/tmp/help-render.db";
process.env.CONFIG_PATH = "/tmp/help-render.json";
for (const f of [process.env.DB_PATH, process.env.CONFIG_PATH]) { try { fs.unlinkSync(f); } catch {} }

const geral = await import("./modulos/moderacao/geral.js");
const { arvoreSubtopicos } = await import("./modulos/moderacao/help-arvore.js");
const { grupos } = await import("./modulos/moderacao/help-grupos.js");

const COR = { info: 1, aviso: 2, erro: 3, sucesso: 4 };
async function render(args, lang) {
  const saidas = [];
  const pega = async (m) => { saidas.push(m); return { id: "m", react: async () => {} }; };
  const canal = { id: "c", sendMessage: pega };
  const ctx = {
    config: { language: lang, comandosDesativados: [] }, COR, PREFIXO: "&", serverId: "s",
    estado: { CANONICO: {}, COMANDOS_SO_IA: new Set(), COMANDOS_GERENCIAVEIS: [] },
    sendEmbed: async (_c, e) => pega({ embeds: [e] }),
    membroTemPermissao: () => true, ehSuperAdmin: () => true, getServer: async () => ({ id: "s" }),
  };
  await geral.cmdHelp({ channel: canal, authorId: "u", content: "" }, args, ctx);
  return saidas.map((m) => { const e = m?.embeds?.[0] ?? m; return `${e?.title ?? ""}\n${e?.description ?? ""}`; }).join("\n");
}

// Comandos que NÃO existem mais soltos. Um `&X` no texto só é legal se vier
// logo depois do dono da família (`&automod blocklist`, `&warn lista`).
const MORTOS = ["blocklist", "whitelist", "sentinela", "punicao", "warnings", "clearwarnings", "scam", "antiscam"];
const MORTOS_TTS = /&tts\s+(entrar|sair)\b/;
function comandosMortos(texto) {
  const achados = [];
  for (const m of MORTOS) {
    // `&blocklist` solto: & seguido do nome, sem "automod " ou "warn " antes
    const re = new RegExp(`&${m}\\b`, "g");
    if (re.test(texto)) achados.push(`&${m}`);
  }
  if (MORTOS_TTS.test(texto)) achados.push(texto.match(MORTOS_TTS)[0]);
  return achados;
}

let ok = 0, falhou = 0;
const problemas = [];
async function checar(args, lang, { deveExistir = true } = {}) {
  let txt;
  try { txt = await render(args, lang); }
  catch (e) { problemas.push(`[${lang}] &help ${args.join(" ")}: LANÇOU ${e.message}`); falhou++; return; }
  const onde = `[${lang}] &help ${args.join(" ")}`;
  const erros = [];
  if (!txt.trim()) erros.push("não enviou nada");
  if (deveExistir && /Não encontrado|Not found|Subtópico desconhecido|Unknown subtopic/.test(txt)) erros.push("página não encontrada");
  const mortos = comandosMortos(txt);
  if (mortos.length) erros.push(`cita comando removido: ${[...new Set(mortos)].join(", ")}`);
  if (/&help \S+ (titulo|texto)\b/.test(txt)) erros.push("lista `titulo`/`texto` como subtópico");
  if (erros.length) { problemas.push(`${onde}: ${erros.join("; ")}`); falhou++; } else ok++;
}

const METADADOS = new Set(["titulo", "texto"]);
const filhos = (no) => Object.keys(no ?? {}).filter((k) => !METADADOS.has(k) && no[k] && typeof no[k] === "object");

for (const lang of ["pt", "en"]) {
  await checar([], lang);                                     // o índice
  for (const g of Object.keys(grupos(lang === "en" ? "en" : "pt", "&") ?? {})) await checar([g], lang);
  const detalhes = geral.construirDetalhes?.("&", lang) ?? {};
  for (const cmd of Object.keys(detalhes)) await checar([cmd], lang);
  // cada caminho da árvore, em qualquer profundidade
  const arvore = arvoreSubtopicos("&", lang);
  const descer = async (no, caminho) => {
    for (const k of filhos(no)) { await checar([...caminho, k], lang); await descer(no[k], [...caminho, k]); }
  };
  for (const raiz of Object.keys(arvore)) await descer(arvore[raiz], [raiz]);
}

// Todo comando que EXISTE tem de ter página própria.
for (const cmd of ["entrar", "sair", "warn", "automod", "tts", "musica"]) await checar([cmd], "pt");

for (const p of problemas) console.log(`  ❌ ${p}`);
console.log(`\nHELP RENDERIZADO: ${ok} página(s) ok, ${falhou} com problema`);
process.exit(falhou ? 1 : 0);
