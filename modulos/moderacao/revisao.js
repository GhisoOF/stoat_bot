// revisao.js — a fila de revisão do dono do bot (P3a, 31 out 2026).
//
// Os detectores (perfil, assuntos, imagens) e a ação manual da staff registram aqui
// cada caso (`registrarCaso`). A fila decide sozinha o que chega ao dono:
//   - entram: certeza média e baixa, discordância entre detectores, ação manual da
//     staff (só como SINAL: a fila nunca pune nada) e uma amostra aleatória de todos
//     os servidores (o que os detectores não puniram + o que puniram com certeza alta);
//   - por dia, no máximo REVISAO_POR_DIA (10) casos, por DM com a Judy — nunca num
//     canal: primeiro os de mais dúvida (nota perto do limiar), depois a amostra;
//   - o dono responde ✅ (o bot acertou) ou ❌ (errou) reagindo, ou com `&caso`.
// O que o dono julga treina a moderação, sem modelo novo:
//   1. na hora: caso novo muito parecido com um julgado herda o veredito (imagem:
//      dHash com distância de Hamming ≤ 6; texto: MinHash de trigramas, Jaccard ≥ 0,8);
//   2. toda noite (a rodada diária): o limiar de cada categoria é recalculado para a
//      faixa de certeza alta manter precisão ≥ 95% nos casos julgados; o resumo ao
//      dono mostra o acerto medido por categoria.
// Retenção (PRIVACIDADE.md): trecho e link somem em 7 dias; caso julgado fica só
// com hash/impressão + veredito (sem pessoa nem servidor, nem o pseudônimo); caso não
// julgado some em 14 dias; caso herdado (só impressão + veredito) some em 30 dias; a
// amostra que a escolha do dia não pegou é apagada na hora. A mensagem na DM do dono
// de um caso que perdeu o trecho/link é editada para uma versão curta, sem eles.
// (31 out 2026, P3a, revisão) Com a fila desligada (sem `configurar`, ou `REVISAO_*`
// inválido) nada é gravado — a retenção não teria timer —, mas a retenção do que já
// existe roda no boot do mesmo jeito.
//
// Um timer só, e só ligado quando há caso esperando (`armar`).

import { createHash } from "node:crypto";
import * as db from "../core/db.js";
import * as store from "../core/config-store.js";
import { numero } from "../core/env.js";
import { pseudonimo } from "../core/pseudonimo.js";
import { textoDeFora } from "../core/seguranca.js";
import { registrarErro } from "../core/erros.js";
import { tr } from "../core/i18n.js";

// ── vocabulário da interface (BRIEF-P3a) ──
export const TIPOS = new Set(["perfil-imagem", "perfil-texto", "assunto", "imagem", "staff"]);
export const ORIGENS = new Set(["detector", "staff", "amostra", "discordancia"]);   // + "dono" (`&caso perdeu`), interno
export const CERTEZAS = new Set(["alta", "media", "baixa"]);
export const ACOES = new Set(["punido", "alertado", "nenhuma"]);
const CATEGORIA = /^[a-z0-9][a-z0-9:_-]{0,39}$/;

// ── números ──
export const MIN_JULGADOS = 20;          // antes disso, limiar() devolve o padrão
export const MIN_NA_FAIXA = 10;          // casos na faixa alta para confiar na precisão medida
export const PRECISAO_ALVO = 0.95;
export const LIMIAR_MIN = 0.5, LIMIAR_MAX = 0.98;   // nunca fora disso
export const PASSO_MAX = 0.05;           // quanto o limiar anda por noite, no máximo
export const RIGIDO_DESCONTO = 0.1;      // `&caso servidor <id> rigido`: o limiar desce isto
export const HAMMING_MAX = 6;            // dHash 64 bits: até 6 bits diferentes = a mesma imagem
export const JACCARD_MIN = 0.8;          // impressão de texto: 80% dos trigramas em comum
export const AMOSTRA_TETO_SERVIDOR = 3;  // amostras guardadas por servidor por dia
export const AMOSTRA_TETO_DIA = 40;      // amostras guardadas por dia, somando todos
export const STAFF_POR_DIA = 3;          // (revisão P3a) sinais da staff na escolha do dia, no máximo
export const TRECHO_MAX = 300;
const DIA = 86400e3;

export const porDia = () => numero("REVISAO_POR_DIA", 10, { min: 1, max: 100, inteiro: true });
export const horaDaRodada = () => numero("REVISAO_HORA", 21, { min: 0, max: 23, inteiro: true });
export const fracaoDaAmostra = () => numero("REVISAO_AMOSTRA", 0.002, { min: 0, max: 0.1 });

export const inicioDoDia = (agora = Date.now()) => Math.floor(agora / DIA) * DIA;   // UTC
export const donos = () => (process.env.SUPER_ADMINS || "").split(",").map((x) => x.trim()).filter(Boolean);
export const ehDono = (id) => !!id && donos().includes(String(id));

// O idioma do que a fila escreve na DM: o do servidor do dono (RELATORIO_SERVIDOR), senão o padrão do bot.
export function idiomaDoDono() {
  const sid = (process.env.RELATORIO_SERVIDOR || "").trim() || null;
  try { return store.configDoServidor(sid)?.language ?? store.configDoServidor(null)?.language ?? "en"; }
  catch { return "en"; }
}
const ctxDono = () => ({ config: { language: idiomaDoDono() } });

// ── o código do caso: 5 caracteres, letra-dígito-letra-letra-dígito (ex.: K7FQ2) ──
// Sem dado pessoal, sem vogal (nenhuma palavra), com dígito (nunca confunde com um subcomando).
const LETRAS = "BCDFGHJKLMNPQRSTVWXZ", DIGITOS = "23456789";
export const CODIGO = /^[B-DF-HJ-NP-TV-XZ][2-9][B-DF-HJ-NP-TV-XZ]{2}[2-9]$/;
export function ehCodigo(txt) { return CODIGO.test(String(txt ?? "").toUpperCase()); }
function novoCodigo(sorteio = Math.random) {
  const l = () => LETRAS[Math.floor(sorteio() * LETRAS.length)], d = () => DIGITOS[Math.floor(sorteio() * DIGITOS.length)];
  for (let i = 0; i < 50; i++) {
    const c = `${l()}${d()}${l()}${l()}${d()}`;
    if (!db.filaExiste(c)) return c;
  }
  throw new Error("sem código livre para o caso");
}

// ── as impressões ──
// Texto → MinHash de trigramas (64 × 32 bits). Duas impressões dão a semelhança de
// Jaccard dos trigramas sem guardar o texto (não dá para reconstruí-lo).
const N_MINHASH = 64;
const SEMENTES = Array.from({ length: N_MINHASH }, (_, i) => (Math.imul(i + 1, 0x9E3779B1) ^ 0x85EBCA6B) >>> 0);
function fnv1a(s) {
  let h = 0x811C9DC5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function misturar(h) {   // fmix32 do MurmurHash3
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
  return h >>> 0;
}
// (31 out 2026, P3a, revisão) a gravação e a consulta passam pelo mesmo caminho: menção
// (pessoa, canal, cargo — crua, ou já trocada pelo `trechoDoCaso`/`textoDeFora`) vira "@",
// e os invisíveis que o `textoDeFora`/`tr` põem saem — a mesma frase dá a mesma impressão.
const MENCAO = /<[@%#]!?[0-9A-Za-z]{1,40}>|@…|@alguém|@cargo/g;
export function normalizarTexto(texto) {
  return String(texto ?? "").replace(MENCAO, "@").normalize("NFKD").replace(/[\u0300-\u036f\u200b-\u200f\u2060-\u2064\ufeff]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
export function impressaoDeTexto(texto) {
  const t = normalizarTexto(texto);
  if (t.length < 3) return null;
  const tri = new Set();
  for (let i = 0; i + 3 <= t.length && tri.size < 20000; i++) tri.add(t.slice(i, i + 3));
  const minimos = new Array(N_MINHASH).fill(0xFFFFFFFF);
  for (const x of tri) {
    const h = fnv1a(x);
    for (let k = 0; k < N_MINHASH; k++) { const v = misturar(h ^ SEMENTES[k]); if (v < minimos[k]) minimos[k] = v; }
  }
  return "m1:" + minimos.map((v) => v.toString(16).padStart(8, "0")).join("");
}
const IMPRESSAO_M1 = /^m1:[0-9a-f]{512}$/;
export function semelhancaTexto(a, b) {
  if (!a || !b) return 0;
  if (!IMPRESSAO_M1.test(a) || !IMPRESSAO_M1.test(b)) return a === b ? 1 : 0;   // formato de outra área: só igual
  let iguais = 0;
  for (let k = 0; k < N_MINHASH; k++) if (a.substr(3 + k * 8, 8) === b.substr(3 + k * 8, 8)) iguais++;
  return iguais / N_MINHASH;
}
// dHash (16 hex = 64 bits): bits diferentes. Outro tamanho (sha256…): 0 se igual, Infinity se não.
export function distanciaHash(a, b) {
  if (!a || !b) return Infinity;
  if (a.length === 16 && b.length === 16) {
    let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0;
    while (x) { n += Number(x & 1n); x >>= 1n; }
    return n;
  }
  return a === b ? 0 : Infinity;
}
const limparHash = (h) => { const s = String(h ?? "").trim().toLowerCase(); return /^[0-9a-f]{8,128}$/.test(s) ? s : null; };
// A impressão fica para sempre (sobrevive à retenção e sai no `&caso exportar`). Só os formatos
// que não levam a ninguém ficam como vieram: `m1:` (MinHash do texto), `dhash:<16 hex>` e o
// próprio `h1:`. Todo o resto — ex.: `arquivo:<id do anexo>`, a do perfil quando a imagem não
// tem hash, seja qual for o formato do ID — vira um resumo sha256 (`h1:`; só casa igual).
// (31 out 2026, P3a, revisão) antes só virava resumo o que parecia um ULID.
const IMPRESSAO_CRUA = /^(m1:[0-9a-f]{512}|dhash:[0-9a-f]{16}|h1:[0-9a-f]{32})$/;
const limparImpressao = (i) => {
  const s = String(i ?? "").trim();
  if (!s || s.length > 600 || !/^[\w:+/=.-]+$/.test(s)) return null;
  if (IMPRESSAO_CRUA.test(s)) return s;
  return "h1:" + createHash("sha256").update(s).digest("hex").slice(0, 32);
};
// Só link https do Stoat (o CDN de origem): o dono abre na origem; nada é copiado nem reenviado.
export function linkDeOrigem(link) {
  let u;
  try { u = new URL(String(link ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || String(link).length > 512) return null;
  return /(^|\.)(stoatusercontent\.com|stoat\.chat|revoltusercontent\.com|revolt\.chat)$/i.test(u.hostname) ? u.href : null;
}

// ── a herança ──
let referencias = new Map();   // categoria → linhas (cache; zera a cada veredito)
function refsDe(categoria) {
  if (!referencias.has(categoria)) {
    if (referencias.size > 200) referencias = new Map();
    referencias.set(categoria, db.filaReferencias(categoria));
  }
  return referencias.get(categoria);
}
// `"certo"` = o dono já disse que algo assim é violação; `"errou"` = que não é; null = nada parecido
export function vereditoParecido({ tipo = null, categoria, hash = null, impressao = null, texto = null } = {}) {
  const cat = String(categoria ?? "").toLowerCase();
  if (!CATEGORIA.test(cat)) return null;
  const h = limparHash(hash);
  const imp = limparImpressao(impressao) ?? (texto ? impressaoDeTexto(texto) : null);
  if (!h && !imp) return null;
  let melhor = null, nota = 0;
  for (const r of refsDe(cat)) {   // mais recentes primeiro: no empate, vale o veredito mais novo
    let s = 0;
    if (h && r.hash) { const d = distanciaHash(h, r.hash); if (d <= HAMMING_MAX) s = 1 - d / 64; }
    if (imp && r.impressao) { const j = semelhancaTexto(imp, r.impressao); if (j >= JACCARD_MIN) s = Math.max(s, j); }
    if (s > nota) { nota = s; melhor = r; }
  }
  return melhor ? (melhor.violacao ? "certo" : "errou") : null;
}

// ── a amostra ──
// O detector chama para o que NÃO puniu; com true, registra o caso com `origem: "amostra"`.
// A certeza alta do detector passa pelo mesmo sorteio e pelos mesmos tetos dentro do
// `registrarCaso` (sorteado = reserva da amostra, para medir a faixa alta; o resto não é guardado).
let sortear = Math.random;
export function amostrar({ serverId } = {}, { agora = Date.now(), sorteio = sortear } = {}) {
  try {
    if (!cfg || !serverId || sorteio() >= fracaoDaAmostra()) return false;   // fila desligada: nada
    return cabeAmostra(serverId, agora);
  } catch (e) { registrarErro("REVISAO:amostrar", e); return false; }   // o detector nunca quebra por causa da fila
}
function cabeAmostra(serverId, agora) {
  const hoje = inicioDoDia(agora);
  return db.filaAmostrasDesde(hoje) < AMOSTRA_TETO_DIA && db.filaAmostrasDesde(hoje, serverId) < AMOSTRA_TETO_SERVIDOR;
}

// ── os limiares ──
const padroes = new Map();      // categoria → o padrão que o detector usa (para a 1ª calibração)
const limiaresCache = new Map();
let rigidos = null;
export function limiar(categoria, padrao, { serverId = null } = {}) {
  const cat = String(categoria ?? "").toLowerCase();
  if (typeof padrao === "number" && Number.isFinite(padrao) && !padroes.has(cat)) padroes.set(cat, padrao);
  return limiarDe(cat, padrao, serverId);
}
// o mesmo, sem anotar o padrão (a fila consulta com o que o detector anotou)
const limiarAtual = (cat) => limiarDe(cat, padroes.get(cat) ?? db.filaLimiar(cat)?.padrao ?? null, null);
function limiarDe(cat, padrao, serverId) {
  if (!limiaresCache.has(cat)) {
    let r = null;
    try { r = db.filaLimiar(cat); } catch (e) { registrarErro("REVISAO:limiar", e); }
    limiaresCache.set(cat, r && r.casos >= MIN_JULGADOS ? r.limiar : null);
  }
  let v = limiaresCache.get(cat) ?? padrao;
  if (serverId && typeof v === "number") {
    try { rigidos ??= new Set(db.filaServidoresRigidos()); } catch (e) { registrarErro("REVISAO:rigidos", e); rigidos = new Set(); }
    // rígido = max(0,5; normal − 0,1) — e nunca acima do normal (um padrão abaixo de 0,5 fica como está)
    if (rigidos.has(String(serverId))) v = Math.min(v, Math.max(LIMIAR_MIN, Math.round((v - RIGIDO_DESCONTO) * 1000) / 1000));
  }
  return v;
}
// A conta da noite, pura: o menor limiar t (entre as notas julgadas) em que os casos com
// nota ≥ t são violação em ≥ 95% — com pelo menos MIN_NA_FAIXA casos na faixa. Sem t
// que sirva, o máximo seguro. Depois, no máximo PASSO_MAX de distância do anterior.
export function calcularLimiar(casos, { anterior = null, padrao = null } = {}) {
  const v = casos.filter((c) => typeof c.nota === "number" && Number.isFinite(c.nota)).sort((a, b) => b.nota - a.nota);
  if (v.length < MIN_JULGADOS) return null;
  let alvo = LIMIAR_MAX, tp = 0;
  for (let i = 0; i < v.length; i++) {
    tp += v[i].violacao ? 1 : 0;
    if (i + 1 < v.length && v[i + 1].nota === v[i].nota) continue;   // empate: a faixa inclui todos os iguais
    if (i + 1 >= MIN_NA_FAIXA && tp / (i + 1) >= PRECISAO_ALVO) alvo = v[i].nota;
  }
  alvo = Math.min(LIMIAR_MAX, Math.max(LIMIAR_MIN, alvo));
  const base = anterior ?? padrao ?? alvo;
  const novo = Math.round(Math.min(LIMIAR_MAX, Math.max(LIMIAR_MIN, base + Math.max(-PASSO_MAX, Math.min(PASSO_MAX, alvo - base)))) * 1000) / 1000;
  return { limiar: novo, alvo, casos: v.length, precisao: precisaoNaFaixa(v, novo) };
}
export function precisaoNaFaixa(casos, t) {
  const f = casos.filter((c) => typeof c.nota === "number" && c.nota >= t);
  return f.length ? f.filter((c) => c.violacao).length / f.length : null;
}
export function recalcularLimiares(agora = Date.now()) {
  const porCat = new Map();
  for (const c of db.filaJulgados({ limite: 20000 })) {
    if (c.origem === "dono" || typeof c.nota !== "number") continue;
    const l = porCat.get(c.categoria) ?? [];
    if (l.length < 500) l.push(c);   // os 500 mais recentes de cada categoria
    porCat.set(c.categoria, l);
  }
  const mudou = [];
  for (const [cat, casos] of porCat) {
    const antes = db.filaLimiar(cat);
    const anterior = antes && antes.casos >= MIN_JULGADOS ? antes.limiar : null;
    const padrao = padroes.get(cat) ?? antes?.padrao ?? null;
    const r = calcularLimiar(casos, { anterior, padrao });
    if (!r) continue;
    db.filaSalvarLimiar(cat, { limiar: r.limiar, padrao, casos: r.casos, precisao: r.precisao, calculadoEm: agora });
    if (anterior === null || anterior !== r.limiar) mudou.push({ categoria: cat, de: anterior ?? padrao, para: r.limiar });
  }
  limiaresCache.clear();
  return mudou;
}

// ── registrar ──
// (31 out 2026, P3a, revisão) Fila desligada (cfg null) → nada é gravado. Certeza alta do
// detector → só o que o sorteio da amostra pegar (com os tetos dela); o resto não é guardado.
// Nos dois casos o `herdado` é calculado do mesmo jeito (o detector usa).
export function registrarCaso(dados = {}, { agora = Date.now(), sorteio = sortear } = {}) {
  try {
    const c = normalizar(dados);
    if (!c) return { codigo: null, herdado: null };
    const herdado = vereditoParecido({ categoria: c.categoria, hash: c.hash, impressao: c.impressao });
    if (!cfg) return { codigo: null, herdado };
    const alta = c.origem === "detector" && c.certeza === "alta";
    if (alta && (!c.serverId || sorteio() >= fracaoDaAmostra() || !cabeAmostra(c.serverId, agora))) return { codigo: null, herdado };
    let estado;
    if (herdado) estado = "herdado";
    else if (c.origem === "amostra") {
      if (!cabeAmostra(c.serverId, agora)) return { codigo: null, herdado: null };
      estado = "amostra";
    } else if (alta) estado = "registro";
    else estado = "candidato";
    const codigo = novoCodigo();
    const linha = { ...c, codigo, criadoEm: agora, estado };
    if (herdado) {
      // herdado: o detector já sabe o que fazer; nada que identifique alguém fica guardado (nem o pseudônimo)
      Object.assign(linha, { veredito: herdado, violacao: herdado === "certo" ? 1 : 0, julgadoEm: agora, limpoEm: agora,
        serverId: null, servidor: null, userId: null, canalId: null, msgId: null, link: null, trecho: null });
    }
    db.filaInserir(linha);
    if (!herdado) armar(agora);
    return { codigo, herdado };
  } catch (e) {
    registrarErro("REVISAO:registrar", e);
    return { codigo: null, herdado: null };
  }
}
function normalizar(d) {
  const tipo = String(d.tipo ?? ""), origem = String(d.origem ?? ""), categoria = String(d.categoria ?? "").toLowerCase();
  const certeza = d.certeza == null ? null : String(d.certeza);
  const acao = d.acao == null ? "nenhuma" : String(d.acao);
  const ruim = !TIPOS.has(tipo) ? `tipo "${tipo.slice(0, 20)}"` : !ORIGENS.has(origem) ? `origem "${origem.slice(0, 20)}"`
    : !CATEGORIA.test(categoria) ? `categoria "${categoria.slice(0, 40)}"` : certeza !== null && !CERTEZAS.has(certeza) ? `certeza "${certeza.slice(0, 20)}"`
      : !ACOES.has(acao) ? `acao "${acao.slice(0, 20)}"` : null;
  if (ruim) { console.error(`[REVISAO] caso recusado: ${ruim} inválido`); return null; }
  const nota = typeof d.nota === "number" && Number.isFinite(d.nota) ? Math.min(1, Math.max(0, d.nota)) : null;
  const ev = d.evidencia ?? {};
  const trecho = ev.trecho ? textoDeFora(ev.trecho, { max: TRECHO_MAX }) || null : null;
  const id = (x) => (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(String(x ?? "")) ? String(x).toUpperCase() : null);
  const serverId = id(d.serverId);
  return {
    tipo, categoria, origem, certeza, nota, acao,
    detector: d.detector ? String(d.detector).replace(/[^\w:.-]/g, "").slice(0, 40) || null : null,
    serverId, servidor: serverId ? pseudonimo(serverId) : null,
    userId: id(d.userId), canalId: id(d.canalId), msgId: id(d.msgId),
    link: linkDeOrigem(ev.link), trecho,
    hash: limparHash(ev.hash),
    impressao: limparImpressao(ev.impressao) ?? impressaoDeTexto(ev.texto ?? ev.trecho ?? "") ?? null,
  };
}

// ── julgar ──
const ganchos = new Set();
export function quandoJulgado(fn) { if (typeof fn === "function") ganchos.add(fn); return () => ganchos.delete(fn); }
async function avisarGanchos(caso) {
  const info = {
    codigo: caso.codigo, tipo: caso.tipo, categoria: caso.categoria, serverId: caso.serverId, userId: caso.userId,
    canalId: caso.canalId, msgId: caso.msgId, origem: caso.origem, certeza: caso.certeza, nota: caso.nota, acao: caso.acao, detector: caso.detector ?? null,
    veredito: caso.veredito, violacao: !!caso.violacao, evidencia: { link: caso.link, hash: caso.hash, impressao: caso.impressao },
  };
  for (const fn of ganchos) {
    try { await fn(info); } catch (e) { registrarErro("REVISAO:gancho", e); }
  }
}
// O bot "alegou violação" em todo caso, menos na amostra do que ele não puniu.
// violação = (o dono disse "certo") === (o bot alegou)
export const alegou = (caso) => caso.origem !== "amostra" || (caso.acao ?? "nenhuma") !== "nenhuma";
export async function julgar(codigo, veredito, { agora = Date.now() } = {}) {
  if (veredito !== "certo" && veredito !== "errou") return null;
  const caso = db.filaCaso(codigo);
  if (!caso) return null;
  const violacao = (veredito === "certo") === alegou(caso) ? 1 : 0;
  db.filaAtualizar(caso.codigo, { veredito, violacao, julgadoEm: agora, estado: "julgado" });
  referencias = new Map();
  const novo = { ...caso, veredito, violacao, julgadoEm: agora, estado: "julgado" };
  await avisarGanchos(novo);
  armar(agora);
  return novo;
}
// `&caso perdeu …`: o dono aponta o que o bot deixou passar. Vira um caso julgado (violação),
// que vale para a herança em qualquer categoria; os ganchos decidem se punem.
export async function registrarPerdido({ tipo, categoria = "perdeu", serverId = null, userId = null, canalId = null, msgId = null, evidencia = {} }, { agora = Date.now() } = {}) {
  const c = normalizar({ tipo, categoria, serverId, userId, canalId, msgId, origem: "staff", certeza: null, nota: null, acao: "nenhuma", evidencia, detector: "dono" });
  if (!c || !cfg) return null;   // fila desligada: nada é gravado (a retenção não teria timer)
  if (!c.hash && !c.impressao && !c.link) return null;
  const linha = { ...c, origem: "dono", codigo: novoCodigo(), criadoEm: agora, estado: "julgado", veredito: "certo", violacao: 1, julgadoEm: agora };
  db.filaInserir(linha);
  referencias = new Map();
  await avisarGanchos(linha);
  armar(agora);   // (revisão P3a) o caso tem trecho/IDs: a retenção de 7 dias precisa do timer
  return linha;
}
export function definirModoServidor(serverId, modo, agora = Date.now()) {
  if (modo !== "rigido" && modo !== "padrao") return false;
  db.filaDefinirModoServidor(serverId, modo, agora);
  rigidos = null;
  return true;
}
export const modoDoServidor = (serverId) => db.filaModoServidor(serverId);

// ── a escolha do dia ──
// Primeiro os de mais dúvida (nota mais perto do limiar da categoria; staff e discordância
// sem nota contam como dúvida máxima), mais antigos primeiro no empate; depois a amostra
// (sorteada, um por servidor). A amostra tem vagas reservadas (1/5 do teto, mínimo 1),
// senão nunca entraria — e a precisão da faixa alta nunca seria medida.
export function duvida(caso) {
  if (typeof caso.nota !== "number") return 0;
  const t = limiarAtual(caso.categoria);
  return Math.abs(caso.nota - (typeof t === "number" ? t : 0.5));
}
export function escolherDoDia({ agora = Date.now(), vagas = null, sorteio = Math.random } = {}) {
  const livres = vagas ?? Math.max(0, porDia() - db.filaEnviadosDesde(inicioDoDia(agora)));
  if (livres <= 0) return [];
  const desde = agora - db.FILA_DIAS_PENDENTE * DIA;
  // (revisão P3a) no máximo STAFF_POR_DIA sinais da staff por dia (contando os já enviados hoje);
  // o resto espera na fila como os outros, até o prazo de 14 dias
  let vagasStaff = Math.max(0, STAFF_POR_DIA - db.filaEnviadosDesde(inicioDoDia(agora), { origem: "staff" }));
  const candidatos = db.filaPorEstado("candidato", desde).sort((a, b) => duvida(a) - duvida(b) || a.criadoEm - b.criadoEm)
    .filter((c) => c.origem !== "staff" || vagasStaff-- > 0);
  const pool = db.filaPorEstado(["amostra", "registro"], desde);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(sorteio() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const vistos = new Set(), amostra = [];
  for (const c of pool) { const k = c.serverId ?? c.codigo; if (vistos.has(k)) continue; vistos.add(k); amostra.push(c); }
  const reserva = Math.min(amostra.length, Math.max(1, Math.round(porDia() / 5)), livres);
  const escolhidos = candidatos.slice(0, livres - reserva);
  for (const c of amostra) { if (escolhidos.length >= livres) break; escolhidos.push(c); }
  for (const c of candidatos.slice(livres - reserva)) { if (escolhidos.length >= livres) break; if (!escolhidos.includes(c)) escolhidos.push(c); }
  return escolhidos;
}

// ── a DM ──
let cfg = null;    // { client, enviar(canal, embed) → mensagem, editar(canalId, msgId, embed) }; null = fila desligada
let timer = null;
let dmCache = null;
// Os números do .env são conferidos aqui (o main.js chama no boot): inválido → erro alto e a fila
// fica DESLIGADA: nenhum caso novo é gravado (`registrarCaso` devolve código null, `amostrar` false).
// A retenção do que já está no banco (e a edição das DMs que perderam o trecho) roda do mesmo jeito.
export function conferirEnv() { porDia(); horaDaRodada(); fracaoDaAmostra(); }
export function configurar({ client, enviar, editar = null } = {}) {
  desligar();
  let erroEnv = null;
  try { conferirEnv(); } catch (e) { erroEnv = e; }
  const editor = editar ?? editorPadrao(client);
  // a retenção no boot, ligada ou não (se houver linhas)
  try {
    if (db.filaTemLinhas()) {
      reter();
      limparDms({ editar: editor }).then(() => reter()).catch((e) => registrarErro("REVISAO:dm-limpar", e));
    }
  } catch (e) { registrarErro("REVISAO:reter", e); }
  if (erroEnv) throw erroEnv;
  cfg = { client, enviar, editar: editor };
  armar();
}
export function desligar() { if (timer) clearTimeout(timer); timer = null; cfg = null; dmCache = null; }
async function dmDoDono() {
  if (dmCache) return dmCache;
  const id = donos()[0];
  if (!id || !cfg?.client) return null;
  const user = cfg.client.users?.get?.(id) ?? await cfg.client.users?.fetch?.(id).catch(() => null);
  const dm = await user?.openDM?.();
  if (dm) dmCache = dm;
  return dm ?? null;
}
const NOME_TIPO = {
  "perfil-imagem": ["perfil (imagem)", "profile (image)", "perfil (imagen)"], "perfil-texto": ["perfil (texto)", "profile (text)", "perfil (texto)"],
  assunto: ["assunto", "topic", "tema"], imagem: ["imagem", "image", "imagen"], staff: ["staff", "staff", "staff"],
};
const NOME_CERTEZA = { alta: ["alta", "high", "alta"], media: ["média", "medium", "media"], baixa: ["baixa", "low", "baja"] };
const NOME_ORIGEM = { detector: ["detector", "detector", "detector"], staff: ["staff (sinal)", "staff (signal)", "staff (señal)"],
  amostra: ["amostra", "sample", "muestra"], discordancia: ["discordância", "disagreement", "discrepancia"], dono: ["você", "you", "tú"] };
const NOME_ACAO = { punido: ["punido", "punished", "castigado"], alertado: ["alertado", "alerted", "alertado"], nenhuma: ["nenhuma", "none", "ninguna"] };
const nome = (tab, k, ctx) => { const x = tab[k]; return x ? tr(ctx, x[0], x[1], x[2]) : String(k ?? "—"); };
const num = (n) => (typeof n === "number" ? n.toFixed(2) : "—");
// O embed de um caso, como a DM mostra (nada de ID, nome de servidor nem cópia de imagem)
export function embedDoCaso(caso, ctx = ctxDono()) {
  const t = typeof caso.nota === "number" ? limiarAtual(caso.categoria) : null;
  const linhas = [
    `**${tr(ctx, "Nota", "Score", "Nota")}** ${num(caso.nota)}${typeof t === "number" ? ` · **${tr(ctx, "limiar", "threshold", "umbral")}** ${num(t)}` : ""}${caso.certeza ? ` · **${tr(ctx, "certeza", "certainty", "certeza")}** ${nome(NOME_CERTEZA, caso.certeza, ctx)}` : ""}`,
    `**${tr(ctx, "Origem", "Source", "Origen")}** ${nome(NOME_ORIGEM, caso.origem, ctx)}${caso.detector && caso.detector !== "dono" ? ` (${caso.detector})` : ""} · **${tr(ctx, "ação do bot", "bot action", "acción del bot")}** ${nome(NOME_ACAO, caso.acao, ctx)}`,
  ];
  if (caso.servidor) linhas.push(`**${tr(ctx, "Servidor", "Server", "Servidor")}** \`${caso.servidor}\``);
  if (caso.link) linhas.push(`**${tr(ctx, "Na origem", "At the source", "En el origen")}** [${tr(ctx, "abrir", "open", "abrir")}](${caso.link})`);
  if (caso.trecho) linhas.push("", ...textoDeFora(caso.trecho, { max: TRECHO_MAX }).split("\n").slice(0, 12).map((l) => `> ${l}`));
  if (caso.veredito) linhas.push("", `**${tr(ctx, "Veredito", "Verdict", "Veredicto")}** ${caso.veredito === "certo" ? "✅" : "❌"}`);
  else linhas.push("", tr(ctx, "✅ o bot acertou · ❌ errou", "✅ the bot was right · ❌ wrong", "✅ el bot acertó · ❌ falló"));
  return { title: `🔎 ${caso.codigo} · ${nome(NOME_TIPO, caso.tipo, ctx)} · ${caso.categoria}`, description: linhas.join("\n"), colour: "#9B59B6" };
}
// Manda os casos escolhidos (ou os dados) para a DM do dono; devolve os códigos enviados.
export async function enviarCasos(casos, { agora = Date.now() } = {}) {
  const enviados = [];
  if (!casos.length || !cfg?.enviar) return enviados;
  const dm = await dmDoDono();
  if (!dm) { console.warn("[REVISAO] sem DM com o dono do bot (SUPER_ADMINS) — fila não enviada"); return enviados; }
  for (const c of casos) {
    let msg = null;
    try { msg = await cfg.enviar(dm, embedDoCaso(c)); }
    catch (e) { registrarErro("REVISAO:enviar", e); }
    if (!msg?.id) break;   // a DM falhou: o resto fica para depois
    db.filaAtualizar(c.codigo, { estado: c.estado === "julgado" || c.estado === "herdado" ? c.estado : "enviado", enviadoEm: agora, dmCanalId: dm.id ?? null, dmMsgId: msg.id });
    enviados.push(c.codigo);
    for (const e of ["✅", "❌"]) {
      try { await msg.react?.(encodeURIComponent(e)); } catch (err) { registrarErro("REVISAO:react", err); break; }
    }
  }
  return enviados;
}

// ── a reação na DM ──
// true = a mensagem era um caso da fila (a reação foi tratada ou ignorada de propósito)
export async function aoReagir(msgId, userId, emoji, { canalId = null, agora = Date.now() } = {}) {
  const caso = msgId ? db.filaCasoPorDm(msgId) : null;
  if (!caso) return false;
  let e = String(emoji ?? "");
  try { e = decodeURIComponent(e); } catch { /* emoji já decodificado */ }
  e = e.replace(/️/g, "");
  if (e !== "✅" && e !== "❌") return true;
  if (!ehDono(userId)) return true;                                        // só o dono do bot
  if (canalId && caso.dmCanalId && canalId !== caso.dmCanalId) return true; // só na DM em que o caso foi
  await julgar(caso.codigo, e === "✅" ? "certo" : "errou", { agora });
  return true;
}

// ── a rodada diária e o resumo ──
export function reter(agora = Date.now()) {
  const r = db.filaReter(agora);
  if (r.trecho || r.limpos || r.apagados) console.info(`[REVISAO] retenção: ${r.trecho} trecho(s) apagado(s), ${r.limpos} caso(s) julgado(s) sem identificação, ${r.apagados} caso(s) apagado(s)`);
  return r;
}
// (31 out 2026, P3a, revisão) A DM do dono também perde o trecho e o link: todo caso que já
// perdeu os dois (pelo prazo de 7 dias ou pelo `&privacidade apagar`) e ainda aponta para a
// mensagem na DM tem a mensagem editada para uma linha curta, sem trecho nem link nem
// servidor; depois os IDs da mensagem saem do banco. Falhou (a mensagem sumiu etc.): os IDs
// saem mesmo assim, e o log diz só o código do caso. A reação numa mensagem que já não está
// no banco simplesmente não casa com caso nenhum.
export function embedCurto(caso, ctx = ctxDono()) {
  const v = caso.veredito === "certo" ? "✅" : caso.veredito === "errou" ? "❌" : tr(ctx, "sem resposta", "no answer", "sin respuesta");
  return { description: `🔒 ${caso.codigo} · ${caso.categoria} · ${v} — ${tr(ctx, "trecho apagado", "excerpt deleted", "fragmento borrado")}`, colour: "#9B59B6" };
}
const semMarcas = (x) => (typeof x === "string" ? x.replace(/[\u2063\u2064]/g, "") : x);
function editorPadrao(client) {
  if (!client) return null;
  return async (canalId, msgId, emb) => {
    const payload = { embeds: [{ ...(emb.title ? { title: semMarcas(emb.title) } : {}), description: semMarcas(emb.description), colour: emb.colour }] };
    const m = client.messages?.get?.(msgId);
    if (typeof m?.edit === "function") return m.edit(payload);
    if (typeof client.api?.patch !== "function") throw new Error("sem como editar a mensagem");
    return client.api.patch(`/channels/${encodeURIComponent(canalId)}/messages/${encodeURIComponent(msgId)}`, payload);
  };
}
export async function limparDms({ agora = Date.now(), editar = cfg?.editar ?? null } = {}) {
  if (typeof editar !== "function") return { editadas: 0, falhas: 0 };   // sem cliente: fica para a próxima rodada
  let editadas = 0, falhas = 0;
  for (const c of db.filaDmsParaLimpar(agora - db.FILA_DIAS_TRECHO * DIA)) {
    try {
      if (!c.dmCanalId) throw new Error("sem canal");
      await editar(c.dmCanalId, c.dmMsgId, embedCurto(c));
      editadas++;
    } catch (e) {
      falhas++;
      console.warn(`[REVISAO] a DM do caso ${c.codigo} não foi editada (${String(e?.type ?? e?.name ?? "erro").slice(0, 40)}) — os IDs da mensagem saem mesmo assim`);
    }
    db.filaAtualizar(c.codigo, { dmCanalId: null, dmMsgId: null, dmLimpar: null });
  }
  if (editadas || falhas) console.info(`[REVISAO] retenção: ${editadas} mensagem(ns) da DM editada(s) sem o trecho${falhas ? `, ${falhas} não editada(s)` : ""}`);
  return { editadas, falhas };
}
// O acerto medido por categoria (últimos 30 dias de casos julgados pelo dono)
export function acertoPorCategoria(agora = Date.now()) {
  const m = new Map();
  for (const c of db.filaJulgados({ desde: agora - 30 * DIA })) {
    if (c.origem === "dono") continue;
    const x = m.get(c.categoria) ?? { categoria: c.categoria, julgados: 0, certos: 0 };
    x.julgados++; if (c.veredito === "certo") x.certos++;
    m.set(c.categoria, x);
  }
  const lim = new Map(db.filaLimiares().map((l) => [l.categoria, l]));
  return [...m.values()].sort((a, b) => a.categoria.localeCompare(b.categoria)).map((x) => ({
    ...x, acerto: x.certos / x.julgados, limiar: lim.get(x.categoria)?.casos >= MIN_JULGADOS ? lim.get(x.categoria).limiar : null,
    precisaoAlta: lim.get(x.categoria)?.precisao ?? null,
  }));
}
export function resumoDoDia({ agora = Date.now(), mudancas = [], ctx = ctxDono() } = {}) {
  const ultima = Number(db.filaEstado("ultimaRodada") ?? 0) || inicioDoDia(agora) - DIA;
  const julgadosDesde = db.filaJulgados({ desde: ultima }).filter((c) => c.origem !== "dono").length;
  const pendentes = db.filaContar(["candidato", "enviado"], agora - db.FILA_DIAS_PENDENTE * DIA);
  const herdados = db.filaContarHerdados(ultima);
  const pct = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
  const linhas = [
    `${tr(ctx, "Julgados", "Judged", "Juzgados")} **${julgadosDesde}** · ${tr(ctx, "herdados", "inherited", "heredados")} **${herdados}** · ${tr(ctx, "esperando", "waiting", "esperando")} **${pendentes}**`,
  ];
  const cats = acertoPorCategoria(agora);
  if (cats.length) {
    linhas.push("", `**${tr(ctx, "Acerto (30 dias)", "Accuracy (30 days)", "Acierto (30 días)")}**`);
    for (const c of cats) linhas.push(`\`${c.categoria}\` ${pct(c.acerto)} (${c.certos}/${c.julgados}) · ${tr(ctx, "faixa alta", "high band", "franja alta")} ${pct(c.precisaoAlta)} · ${tr(ctx, "limiar", "threshold", "umbral")} ${c.limiar === null ? tr(ctx, "padrão", "default", "predeterminado") : num(c.limiar)}`);
  }
  for (const m of mudancas) linhas.push(`↕ \`${m.categoria}\` ${num(m.de)} → ${num(m.para)}`);
  return { title: tr(ctx, "📋 Fila de revisão", "📋 Review queue", "📋 Cola de revisión"), description: linhas.join("\n"), colour: "#5865F2", julgadosDesde, pendentes, herdados };
}
export async function rodadaDiaria({ agora = Date.now() } = {}) {
  reter(agora);
  try { await limparDms({ agora }); reter(agora); }   // a DM sem o trecho; o que esperava a edição pode sair
  catch (e) { registrarErro("REVISAO:dm-limpar", e); }
  const mudancas = recalcularLimiares(agora);
  const resumo = resumoDoDia({ agora, mudancas });
  const casos = escolherDoDia({ agora });
  if (cfg?.enviar && (resumo.julgadosDesde || resumo.pendentes || casos.length || mudancas.length)) {
    const dm = await dmDoDono();
    if (dm) {
      try { await cfg.enviar(dm, { title: resumo.title, description: resumo.description, colour: resumo.colour }); }
      catch (e) { registrarErro("REVISAO:resumo", e); }
    }
  }
  const enviados = await enviarCasos(casos, { agora });
  const descartados = db.filaDescartarNaoEscolhidos(agora);
  db.filaDefinirEstado("ultimaRodada", agora);
  return { enviados, descartados, mudancas };
}
// Para o `&caso` sem DM ou sem caso novo: quantos esperam e quantos já foram hoje
export function situacao(agora = Date.now()) {
  return { esperando: db.filaContar(["candidato", "enviado"], agora - db.FILA_DIAS_PENDENTE * DIA), hoje: db.filaEnviadosDesde(inicioDoDia(agora)), teto: porDia() };
}
// `&caso` sozinho: os próximos da fila agora (até completar o teto do dia)
export async function enviarAgora({ agora = Date.now() } = {}) {
  return enviarCasos(escolherDoDia({ agora }), { agora });
}

// ── o timer: um só, ligado só quando há o que fazer ──
export function proximaRodada(agora, ultima = 0, hora = horaDaRodada()) {
  const hoje = inicioDoDia(agora) + hora * 3600e3;
  if (agora < hoje) return ultima >= hoje - DIA ? hoje : agora + 60e3;   // a de ontem não rodou: logo
  if (ultima < hoje) return agora + 60e3;                                   // a de hoje passou sem rodar (bot desligado)
  return hoje + DIA;
}
// Há o que fazer na rodada: caso ainda com identificação (fila, amostra, enviado sem resposta,
// julgado há menos de 7 dias — a retenção precisa passar), mensagem da DM ainda por editar,
// caso herdado (some em 30 dias) ou veredito novo para o resumo.
export function temTrabalho(agora = Date.now()) {
  if (db.filaTemVivos()) return true;
  const ultima = Number(db.filaEstado("ultimaRodada") ?? 0);
  return db.filaJulgados({ desde: ultima + 1, limite: 1 }).length > 0;
}
export function armar(agora = Date.now()) {
  if (!cfg || cfg.semTimer || timer) return false;
  let quando;
  try {
    if (!temTrabalho(agora)) return false;
    quando = proximaRodada(agora, Number(db.filaEstado("ultimaRodada") ?? 0));
  } catch (e) { registrarErro("REVISAO:armar", e); return false; }
  timer = setTimeout(async () => {
    timer = null;
    try { await rodadaDiaria(); } catch (e) { registrarErro("REVISAO:rodada", e); }
    armar();
  }, Math.max(1000, quando - agora));
  timer.unref?.();
  return true;
}
export const timerLigado = () => !!timer;

// ── o export (`&caso exportar`): sem nome, sem ID de pessoa nem de servidor; imagem só como hash ──
export function exportar(agora = Date.now()) {
  const casos = db.filaJulgados({ limite: 100000 }).map((c) => ({
    tipo: c.tipo, categoria: c.categoria, origem: c.origem, certeza: c.certeza, nota: c.nota, acao: c.acao,
    veredito: c.veredito, violacao: !!c.violacao, hash: c.hash, impressao: c.impressao,
    dia: new Date(c.julgadoEm ?? c.criadoEm).toISOString().slice(0, 10),
  }));
  return { versao: 1, geradoEm: new Date(agora).toISOString().slice(0, 10), limiares: db.filaLimiares().map((l) => ({ categoria: l.categoria, limiar: l.limiar, casos: l.casos, precisao: l.precisao })), casos };
}

// ── `&caso perdeu`: a evidência do perfil vem da área perfil (hash), quando ela se registra ──
let perfil = {};
export function configurarPerfil({ evidenciaDoPerfil = null, evidenciaDoLink = null } = {}) { perfil = { evidenciaDoPerfil, evidenciaDoLink }; }
export const ganchosDoPerfil = () => perfil;

// testes
export function _zerar() { referencias = new Map(); limiaresCache.clear(); padroes.clear(); rigidos = null; ganchos.clear(); perfil = {}; sortear = Math.random; desligar(); }
// Só para testes: a fila ligada (grava casos), sem cliente e sem o timer da rodada.
export function _ligarParaTestes({ editar = null } = {}) { desligar(); cfg = { client: null, enviar: null, editar, semTimer: true }; }
// Só para testes: o sorteio da amostra (inclusive o da certeza alta dentro do `registrarCaso`).
export function _trocarSorteio(fn) { const antes = sortear; sortear = typeof fn === "function" ? fn : Math.random; return antes; }
