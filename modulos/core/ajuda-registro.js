// A ajuda que mora no registro de comandos — a ÚNICA fonte desde o P2 (31 out 2026).
//
// Cada comando declara no próprio arquivo de `modulos/comandos/` o bloco `ajuda`:
//   grupo, resumo?, perm, uso, desc, ex, parametros, paginas: { <chave>: { titulo?, texto, paginas? } }
// (formato em _notas/registro-ajuda.md). Daqui saem: o índice e os grupos do `&help`,
// a página de cada comando e de cada parte, a lista de páginas (testes, README) e a
// tabela de comandos do README. A árvore escrita à mão (help-arvore*.js) e a tabela
// de parâmetros à parte (help-parametros.js) foram apagadas.
//
// Só funções puras (texto pronto para a tela); quem envia e filtra por quem vê é o
// handler (modulos/moderacao/ajuda.js).

import { REGISTRO } from "../comandos/index.js";
import { citarNoTexto, citar, SUB, NOME_PARA_ID_TELA, COMANDO_EXTRA, resolverAtalho, nomeExibido, subExibido } from "./aliases.js";
import { GRUPOS, ORDEM, grupoDoNome } from "../moderacao/help-grupos.js";

const LANGS = ["pt", "en", "es"];
export const entrada = (id) => REGISTRO.find((c) => c.id === id) ?? null;

// `{ pt, en, es }` → o do idioma; texto solto vale para todos. Sem o idioma, o inglês (ou o
// português) e `pronto: false`: a tradução da tela troca os nomes de comando.
export function doIdioma(v, lang) {
  if (v == null || typeof v !== "object") return { t: v, pronto: true };
  if (typeof v[lang] === "string") return { t: v[lang], pronto: true };
  return { t: v.en ?? v.pt, pronto: false };
}
const texto = (v, lang, P) => { const d = doIdioma(v, lang); return d.t == null ? d.t : citarNoTexto(d.t, lang, P); };
// só o espanhol sai pronto: o inglês ainda passa pela tradução da tela (há texto de registro em
// inglês com palavra de subcomando em português, que ela corrige)
const ehPronto = (vs, lang) => lang !== "es" || vs.every((v) => doIdioma(v, lang).pronto);

// ── Grupos ──
// (integração P2) todo comando traz `ajuda.grupo` no registro; o mapa de transição saiu
export const grupoDe = (c) => c?.ajuda?.grupo ?? null;
export const COMANDOS_SEM_GRUPO_NO_REGISTRO = () => REGISTRO.filter((c) => !c.ajuda?.grupo).map((c) => c.id);

// A linha de um comando no grupo: o `resumo` ou a 1ª frase do `desc`
export function resumoDe(c, lang = "pt", P = "&") {
  const r = c?.ajuda?.resumo ? texto(c.ajuda.resumo, lang, P) : String(texto(c?.ajuda?.desc, lang, P) ?? "").split("\n")[0].split(/(?<=[.!?])\s/)[0];
  return String(r ?? "").replace(/\*\*/g, "").replace(/[.:]$/, "").slice(0, 110);
}

// id → os comandos de cada grupo, na ordem do índice
export function comandosPorGrupo() {
  const m = Object.fromEntries(ORDEM.map((g) => [g, []]));
  for (const c of REGISTRO) { const g = grupoDe(c); if (g && m[g]) m[g].push(c.id); }
  return m;
}
export const tituloDoGrupo = (g, lang = "pt") => `${GRUPOS[g]?.emoji ?? ""} ${GRUPOS[g]?.titulo?.[lang] ?? g}`.trim();

// ── Páginas ──
// O nó de uma página: a raiz (`ajuda` do comando) ou um de `paginas`, pelo caminho de chaves
export function noDaPagina(id, caminho = []) {
  let no = entrada(id)?.ajuda ?? null;
  for (const k of caminho) { no = no?.paginas?.[k] ?? null; if (!no) return null; }
  return no;
}

// As palavras digitadas depois do comando → o caminho de chaves de `paginas` (nome interno,
// inglês ou espanhol, pelas tabelas do próprio comando). `resto`: o que não virou página.
// `inicio`: o caminho de onde partir (a parte achada sozinha: `&help punishment ladder` desce
// de `automod › punicao` com o vocabulário da punição — antes partia da raiz e o `ladder` sobrava).
export function resolverCaminho(id, palavras = [], inicio = []) {
  const caminho = [...inicio];
  let no = inicio.length ? noDaPagina(id, inicio) : (entrada(id)?.ajuda ?? null), i = 0;
  let tabela = [...inicio].reverse().map((k) => `${id}.${k}`).find((t) => SUB[t]) ?? id;
  for (; i < palavras.length; i++) {
    const w = String(palavras[i] ?? "").toLowerCase();
    const interno = SUB[tabela]?.[w] ?? SUB[id]?.[w] ?? w;
    const prox = no?.paginas?.[interno] ?? no?.paginas?.[w];
    if (!prox) break;
    caminho.push(no.paginas[interno] ? interno : w);
    no = prox;
    if (SUB[`${id}.${interno}`]) tabela = `${id}.${interno}`;
  }
  return { caminho, resto: palavras.slice(i), no };
}

// Uma palavra solta que é PARTE de um comando com níveis (`&help punishment` → automod punicao).
// Só nomes de PARTE/FAMÍLIA (os que têm vocabulário próprio): o nome pode vir do topo ou de
// dentro de outra família (`topics` → `sentinela assuntos`); palavra comum de dentro de uma
// família (`canal`) não vira página. Família sem página própria (`antispam`) → a do comando.
export function parteSolta(palavra) {
  const w = String(palavra ?? "").toLowerCase();
  for (const c of REGISTRO) {
    const nomes = new Set([...Object.keys(c.familias ?? {}), ...Object.keys(c.partes ?? {})]);
    if (!nomes.size || !c.ajuda?.paginas) continue;
    const de = { ...Object.fromEntries([...nomes].map((n) => [n, n])) };
    const tabelas = [c.id, ...[...nomes].map((n) => `${c.id}.${n}`)];
    for (const t of tabelas) for (const [en, pt] of Object.entries(SUB[t] ?? {})) if (nomes.has(pt)) de[en] ??= pt;
    for (const [n, p] of Object.entries(c.partes ?? {})) if (p.en) de[p.en] = n;
    const interno = de[w];
    if (!interno) continue;
    const achar = (no, cam) => {
      for (const [k, v] of Object.entries(no?.paginas ?? {})) {
        if (k === interno) return [...cam, k];
        const f = achar(v, [...cam, k]);
        if (f) return f;
      }
      return null;
    };
    const cam = achar(c.ajuda, []);
    return { id: c.id, caminho: cam ?? [] };
  }
  return null;
}

// Palavra solta que abre uma página de dentro (`apelidos` no nó da página): `&help chat` → `config › ia`
export const APELIDOS_DE_PAGINA = (() => {
  const m = {};
  const descer = (id, no, cam) => { for (const [k, v] of Object.entries(no?.paginas ?? {})) { for (const a of v.apelidos ?? []) m[String(a).toLowerCase()] ??= { id, caminho: [...cam, k] }; descer(id, v, [...cam, k]); } };
  for (const c of REGISTRO) descer(c.id, c.ajuda, []);
  return m;
})();

// O que a pessoa pediu ao &help: o índice, um grupo, um comando (com o caminho), ou nada
export function resolverPedido(args = []) {
  const palavras = args.map((a) => String(a ?? ""));
  const w = (palavras[0] ?? "").toLowerCase();
  if (!w || /^\d+$/.test(w)) return { tipo: "indice" };
  // 1) o nome do comando (id ou nome de tela) — `&help xp`, `&help game`, `&help automod`
  //    (P2: antes o grupo vencia e o `&help xp` abria o grupo Diversão)
  // 2) um atalho de mais de uma palavra vence o comando vivo (`&help chat sair`)
  const at = resolverAtalho(palavras);
  if (at && (at.atalho.posicoes.length > 1 || !NOME_PARA_ID_TELA[w])) {
    const r = resolverCaminho(at.comando, at.args);
    return { tipo: "comando", id: at.comando, ...r };
  }
  if (NOME_PARA_ID_TELA[w]) return { tipo: "comando", id: NOME_PARA_ID_TELA[w], ...resolverCaminho(NOME_PARA_ID_TELA[w], palavras.slice(1)) };
  // 3) o grupo do índice
  const g = grupoDoNome(w);
  if (g) return { tipo: "grupo", grupo: g };
  // 4) um apelido
  if (COMANDO_EXTRA[w]) return { tipo: "comando", id: COMANDO_EXTRA[w], ...resolverCaminho(COMANDO_EXTRA[w], palavras.slice(1)) };
  // 5) uma palavra que é apelido de uma página de dentro (`&help chat` → `config › ia`)
  const ap = APELIDOS_DE_PAGINA[w];
  if (ap) return { tipo: "comando", id: ap.id, ...resolverCaminho(ap.id, palavras.slice(1), ap.caminho) };
  // 6) uma parte de um comando com níveis, pedida sozinha
  const p = parteSolta(w);
  if (p) return { tipo: "comando", id: p.id, ...resolverCaminho(p.id, palavras.slice(1), p.caminho) };
  return { tipo: "nada", palavra: w };
}

// Os parâmetros de um comando (a seção do fim da página)
export function secaoParametros(c, lang = "pt", P = "&") {
  const lista = c?.ajuda?.parametros ?? [];
  if (!lista.length) return [];
  const titulo = { pt: "Parâmetros", en: "Parameters", es: "Parámetros" }[lang];
  return [`**${titulo}**`, ...lista.map((p) => {
    const nome = texto(p.nome, lang, P), valor = p.valor ? texto(p.valor, lang, P) : null;
    return `• ${valor ? `\`${nome}\` ${valor}` : `\`${nome}\``} — ${texto(p.desc, lang, P)}`;
  })];
}

// A página: { titulo, linhas, filhos, pronto } — `pronto` = sai no idioma sem a tradução da tela
export function pagina(id, caminho = [], lang = "pt", P = "&") {
  const c = entrada(id);
  const no = noDaPagina(id, caminho);
  if (!c || !no) return null;
  const rot = { uso: { pt: "Uso", en: "Usage", es: "Uso" }, perm: { pt: "Permissão", en: "Permission", es: "Permiso" }, ex: { pt: "Exemplo", en: "Example", es: "Ejemplo" } };
  const nomeCmd = nomeExibido(id, lang);
  const trilha = [nomeCmd, ...caminho.map((k, i) => subExibido(i ? `${id}.${caminho[i - 1]}` : id, k, lang))];
  const titulo = `📖 ${{ pt: "Ajuda", en: "Help", es: "Ayuda" }[lang]} — ${P}${trilha.join(" › ")}`;
  const linhas = [];
  const usados = [];
  if (!caminho.length) {
    const a = c.ajuda;
    usados.push(a.uso, a.desc, a.ex, a.perm, ...(a.parametros ?? []).flatMap((p) => [p.nome, p.valor, p.desc]));
    linhas.push(`**${rot.uso[lang]}:** \`${texto(a.uso, lang, P)}\``);
    const perm = doIdioma(a.perm, lang).t;
    if (perm) linhas.push(`**${rot.perm[lang]}:** ${perm}`);
    linhas.push("", ...String(texto(a.desc, lang, P) ?? "").split("\n"));
    if (a.ex) linhas.push("", `**${rot.ex[lang]}:** \`${texto(a.ex, lang, P)}\``);
    const params = secaoParametros(c, lang, P);
    if (params.length) linhas.push("", ...params);
  } else {
    usados.push(no.texto, no.titulo);
    linhas.push(...String(texto(no.texto, lang, P) ?? "").split("\n"));
  }
  const filhos = Object.keys(no.paginas ?? {});
  return { titulo, linhas, filhos, pronto: ehPronto(usados.filter((v) => v != null), lang) };
}

// Todas as páginas que existem: [[id], [id, chave], [id, chave, chave2]…] (testes, README)
export function todasAsPaginas() {
  const out = [];
  const descer = (id, no, cam) => { for (const [k, v] of Object.entries(no?.paginas ?? {})) { out.push([id, ...cam, k]); descer(id, v, [...cam, k]); } };
  for (const c of REGISTRO) if (c.ajuda) { out.push([c.id]); descer(c.id, c.ajuda, []); }
  return out;
}

// Os textos de ajuda de um comando que faltam em algum idioma (vazio = completo nos 3)
export function faltasDeIdioma(c) {
  const faltas = [];
  const a = c?.ajuda;
  if (!a) return ["(sem ajuda)"];
  const conferir = (v, onde, obrigatorio = false) => {
    if (v == null) { if (obrigatorio) faltas.push(`${onde}: falta`); return; }
    if (typeof v === "string") return;
    for (const l of LANGS) if (typeof v[l] !== "string" || !v[l].trim()) faltas.push(`${onde}.${l}`);
  };
  conferir(a.uso, "uso", true); conferir(a.desc, "desc", true); conferir(a.ex, "ex"); conferir(a.resumo, "resumo");
  if (a.perm && typeof a.perm === "object") conferir(a.perm, "perm");
  (a.parametros ?? []).forEach((p, i) => { conferir(p.nome, `parametros.${i}.nome`, true); conferir(p.valor, `parametros.${i}.valor`); conferir(p.desc, `parametros.${i}.desc`, true); });
  const descer = (no, cam) => { for (const [k, v] of Object.entries(no?.paginas ?? {})) { conferir(v.texto, `paginas.${[...cam, k].join(".")}.texto`, true); conferir(v.titulo, `paginas.${[...cam, k].join(".")}.titulo`); descer(v, [...cam, k]); } };
  descer(a, []);
  return faltas;
}

// ── Compatibilidade: o formato antigo (detalhes por id), para quem ainda lê assim ──
export const COMANDOS_COM_AJUDA = REGISTRO.filter((c) => c.ajuda).map((c) => c.id);
export function detalhesDoRegistro(P = "&", lang = "pt") {
  return Object.fromEntries(REGISTRO.filter((c) => c.ajuda).map((c) => {
    const a = c.ajuda;
    const d = { uso: texto(a.uso, lang, P), desc: texto(a.desc, lang, P) };
    if (a.perm !== undefined) d.perm = doIdioma(a.perm, lang).t;
    if (a.ex) d.ex = texto(a.ex, lang, P);
    return [c.id, d];
  }));
}
export function parametrosDoRegistro(P = "&", lang = "pt") {
  return Object.fromEntries(REGISTRO.filter((c) => c.ajuda?.parametros?.length).map((c) => [c.id,
    c.ajuda.parametros.map((p) => {
      const o = { nome: texto(p.nome, lang, P) };
      if (p.valor) o.valor = texto(p.valor, lang, P);
      o.desc = texto(p.desc, lang, P);
      return o;
    })]));
}

// A tabela de comandos do README (Geração): uma linha por comando, por grupo
export function tabelaDeComandos(lang = "en", P = "&") {
  const cab = { pt: ["Comando", "O que faz"], en: ["Command", "What it does"], es: ["Comando", "Qué hace"] }[lang];
  const linhas = [];
  const porGrupo = comandosPorGrupo();
  for (const g of ORDEM) {
    if (!porGrupo[g]?.length) continue;
    linhas.push("", `**${tituloDoGrupo(g, lang)}**`, "", `| ${cab[0]} | ${cab[1]} |`, "|---|---|");
    for (const id of porGrupo[g]) {
      const c = entrada(id);
      linhas.push(`| \`${citar(id, lang, P)}\` | ${resumoDe(c, lang, P).replace(/\|/g, "\\|").replace(/`\{&[^}]+\}`/g, "")} |`);
    }
  }
  return linhas.join("\n").trim();
}
