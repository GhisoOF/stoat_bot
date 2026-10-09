// Algoritmo de história (G3, ESPECIAIS-E-HISTORIAS.md §2): conta o que
// aconteceu numa missão DEPOIS do resultado. Não muda nada — só lê o desfecho,
// as rolagens, a party e o que caiu, e escolhe trechos por RNG com semente.
// Mesma semente → mesma história (o `&game historia` reexibe a última).
// Os trechos estão em conteudo/historias.json.

import { HISTORIAS as T } from "./conteudo.js";

// ── RNG com semente (mulberry32) ──────────────────────────────────────────────
export function rng(semente) {
  let a = semente >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function sementeDe(...partes) { let h = 2166136261; for (const c of partes.join("|")) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ── Margem: o quão perto foi ─────────────────────────────────────────────────
export function margem(chance, rolagem, deuCerto) {
  if (deuCerto) { const f = (chance - rolagem) / Math.max(1e-9, chance); return f > 0.66 ? "folgado" : f > 0.25 ? "limpo" : "apertado"; }
  const f = (rolagem - chance) / Math.max(1e-9, 1 - chance); return f < 0.15 ? "quase" : "longe";
}

function escolher(lista, r, { generos = [], quando = [], recentes = [] } = {}) {
  const ok = (lista ?? []).filter((t) => (!t.generos || t.generos.some((g) => generos.includes(g)))
    && (!t.quando || t.quando.every((q) => quando.includes(q))));
  if (!ok.length) return null;
  const frescos = ok.filter((t) => !recentes.includes(t.id));
  const pool = frescos.length ? frescos : ok;
  const pesos = pool.map((t) => (t.generos || t.quando ? 2 : 1));
  let x = r() * pesos.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { if (x < pesos[i]) return pool[i]; x -= pesos[i]; }
  return pool[0];
}
// Ganchos: { pt: "trilha dos lenhadores", art: "a", en: "the woodcutters' trail" }
const CONTR = { de: { o: "do", a: "da", os: "dos", as: "das", "": "de" }, em: { o: "no", a: "na", os: "nos", as: "nas", "": "em" }, a: { o: "ao", a: "à", os: "aos", as: "às", "": "a" } };
function vagasDoGancho(nome, g, en) {
  if (!g) return {};
  if (en) return { [nome]: g.en, [`de_${nome}`]: `of ${g.en}`, [`em_${nome}`]: g.en_em ?? `in ${g.en}`, [`a_${nome}`]: `to ${g.en}` };
  const art = g.art ?? "", sem = g.pt;
  return { [nome]: (art ? art + " " : "") + sem, [`de_${nome}`]: `${CONTR.de[art] ?? "de"} ${sem}`, [`em_${nome}`]: `${CONTR.em[art] ?? "em"} ${sem}`, [`a_${nome}`]: `${CONTR.a[art] ?? "a"} ${sem}` };
}
const maiuscula = (t) => t.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());
export const preencher = (txt, v) => maiuscula(txt
  .replace(/\{n:([^|}]*)\|([^}]*)\}/g, (_, um, varios) => ((v._n ?? 1) > 1 ? varios : um))
  .replace(/\{i:([^|}]*)\|([^}]*)\}/g, (_, um, varios) => (v._iPlural ? varios : um))
  .replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`));
const juntarNomes = (ns, en) => ns.length <= 1 ? ns.join("") : ns.slice(0, -1).join(", ") + (en ? " and " : " e ") + ns.at(-1);

function heroi(ctx, r) {
  const cands = [];
  for (const c of ctx.contribuicoes ?? []) cands.push({ tipo: c.tipo === "jogador" ? (c.nome === ctx.jogador ? "jogador" : "coop") : c.tipo, nome: c.nome, peso: Math.max(0.01, c.peso) });
  if (!cands.length) cands.push({ tipo: "jogador", nome: ctx.jogador, peso: 1 });
  const total = cands.reduce((a, c) => a + c.peso, 0);
  for (const m of ctx.magias ?? []) cands.push({ tipo: "magia", magia: m, peso: total * (m.poder ?? 0.3) * 0.25 });
  let x = r() * cands.reduce((a, c) => a + c.peso, 0);
  for (const c of cands) { if (x < c.peso) return c; x -= c.peso; }
  return cands[0];
}

// ctx: { jogador, missao: { id, nome, historia: { generos, local, inimigo }, falas, tipo },
//        desfecho, chances: { exito, sobrevivencia }, rolagens: { exito, sobrev },
//        contribuicoes, magias, coop: bool, extras: { loot, companheiroNovo, capturados,
//        resgatados, subiu, especial: { nome, jaTinha } }, lingua }
export function contarHistoria(ctx, { semente, recentes = [] } = {}) {
  const r = rng(semente ?? sementeDe(ctx.jogador, ctx.missao?.id, Date.now()));
  const en = ctx.lingua === "en", L = (t) => (en ? t.en : t.pt);
  const h = ctx.missao?.historia ?? {};
  const generos = h.generos ?? [];
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const inimigo = pick(h.inimigo?.length ? h.inimigo : [{ pt: "coisa lá dentro", art: "a", en: "the thing inside" }]);
  const v = {
    jogador: ctx.jogador,
    ...vagasDoGancho("local", pick(h.local?.length ? h.local : [{ pt: "lugar", art: "o", en: "the place" }]), en),
    ...vagasDoGancho("inimigo", inimigo, en),
    _iPlural: ["os", "as"].includes(inimigo?.art),
  };
  const usados = [], frases = [];
  const usar = (t) => { if (!t) return; usados.push(t.id); frases.push(preencher(L(t), v)); };
  const fixo = (chave) => { const f = ctx.missao?.falas?.[chave]; if (f) frases.push(`_“${en ? f.en : f.pt}”_`); return !!f; };

  // bico: sem luta
  if (ctx.missao?.tipo === "bico") {
    usar(escolher(T.bico?.abertura, r, { recentes }));
    usar(escolher(T.bico?.momento, r, { recentes }));
    usar(escolher(T.fecho?.bico, r, { recentes }));
    if (ctx.extras?.subiu) usar(escolher(T.fecho.subiu, r, { recentes }));
    return { texto: frases.join(" "), ids: usados, chave: "bico" };
  }

  const chefe = ctx.missao?.tipo === "chefe";
  const quando = [...(ctx.coop ? ["coop"] : []), ...(chefe ? ["chefe"] : [])];
  if (!fixo("abertura")) usar(escolher(T.abertura, r, { generos, recentes }));
  if (chefe && fixo("inicio")) { /* a fala do chefe entra no lugar do obstáculo */ }
  else usar(escolher(T.obstaculo.filter((t) => !t.quando || t.quando.every((q) => quando.includes(q))), r, { quando, recentes }));

  const hh = heroi(ctx, r);
  if (hh.tipo === "magia") { v.magia = hh.magia.nome; usar(escolher(T.momento.filter((t) => t.magia === hh.magia.tipo), r, { recentes })); }
  else {
    v.heroi = hh.nome;
    const lista = T.momento.filter((t) => t.heroi === hh.tipo);
    usar(escolher(lista.length ? lista : T.momento.filter((t) => t.heroi === "jogador"), r, { recentes }));
  }

  const chave = ctx.desfecho === "caiu" ? "caiu" : margem(ctx.chances.exito, ctx.rolagens.exito, ctx.desfecho === "sucesso");
  usar(escolher(T.virada[chave], r, { recentes }));
  if (chefe && ctx.desfecho === "sucesso") { if (!fixo("derrota")) usar(escolher(T.fecho.chefe, r, { recentes })); }

  const x = ctx.extras ?? {};
  if (x.especial) { v.item = x.especial.nome; if (!(x.especial.jaTinha ? false : fixo("primeira_vez"))) usar(escolher(x.especial.jaTinha ? T.fecho.especialVazio : T.fecho.especial, r, { recentes })); }
  else if (x.loot) { v.item = x.loot.nome; usar(escolher(T.fecho.loot, r, { recentes })); }
  if (x.companheiroNovo) { v.comp = x.companheiroNovo.nome; usar(escolher(T.fecho.companheiro, r, { recentes })); }
  if (x.capturados?.length) { v.nomes = juntarNomes(x.capturados, en); v._n = x.capturados.length; usar(escolher(T.fecho.capturado, r, { recentes })); }
  if (x.resgatados?.length) { v.nomes = juntarNomes(x.resgatados, en); v._n = x.resgatados.length; usar(escolher(T.fecho.resgatado, r, { recentes })); }
  if (x.subiu && frases.length < 6) usar(escolher(T.fecho.subiu, r, { recentes }));

  return { texto: frases.join(" "), ids: usados, chave };
}

// Lista de todos os ids (para os testes e a anti-repetição)
export function todosOsIds() {
  const ids = [];
  const andar = (x) => { if (Array.isArray(x)) for (const t of x) { if (t?.id) ids.push(t.id); } else if (x && typeof x === "object") for (const v of Object.values(x)) andar(v); };
  andar(T);
  return ids;
}
