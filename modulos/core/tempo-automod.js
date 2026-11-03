// tempo-automod.js — quanto o automod leva por mensagem (P5, 3 nov 2026; R11: medir antes de otimizar).
//
// Contadores em memória, por hora cheia (UTC): para cada etapa, quantas mensagens, o maior tempo e
// um histograma em faixas que crescem ×√2 (de 0,01 ms a ~2 min) — p50 e p95 saem do histograma,
// sem guardar amostra nenhuma. Nada de usuário, servidor, canal ou texto: só tempos. Guarda as
// últimas HORAS_GUARDADAS horas e esquece o resto; um reinício zera (é medida, não registro).
//
// Quem lê: o painel `&servidores` (DM do dono) e o relatório por hora (relatorio.js).

export const HORA = 3600_000;
export const HORAS_GUARDADAS = 3;
const FAIXAS = 48;                     // limite da faixa k = 0,01 ms × √2^k (k = 47 → ~118 s)
const BASE_MS = 0.01;
const MAX_ETAPAS = 16;                 // teto por hora (as etapas são fixas no código; isto é só uma trava)
const limiteDa = (k) => BASE_MS * Math.SQRT2 ** k;

// As etapas medidas e o nome delas na tela.
export const ETAPAS = Object.freeze({
  total: { pt: "por mensagem", en: "per message", es: "por mensaje" },
  sentinela: { pt: "sentinela", en: "sentinel", es: "centinela" },
  classificador: { pt: "classificador", en: "classifier", es: "clasificador" },
});

const horas = new Map();               // hora (número) → Map(etapa → { n, max, faixas: Uint32Array })
export const horaDe = (t = Date.now()) => Math.floor(t / HORA);

function faixaDe(ms) {
  if (!(ms > BASE_MS)) return 0;
  const k = Math.ceil(Math.log(ms / BASE_MS) / Math.log(Math.SQRT2));
  return Math.min(FAIXAS - 1, Math.max(0, k));
}

export function registrar(etapa, ms, agora = Date.now()) {
  if (typeof etapa !== "string" || !Number.isFinite(ms) || ms < 0) return;
  const h = horaDe(agora);
  let mapa = horas.get(h);
  if (!mapa) {
    mapa = new Map(); horas.set(h, mapa);
    for (const k of horas.keys()) if (k <= h - HORAS_GUARDADAS) horas.delete(k);
  }
  let c = mapa.get(etapa);
  if (!c) {
    if (mapa.size >= MAX_ETAPAS) return;
    c = { n: 0, max: 0, faixas: new Uint32Array(FAIXAS) };
    mapa.set(etapa, c);
  }
  c.n++;
  if (ms > c.max) c.max = ms;
  c.faixas[faixaDe(ms)]++;
}

// O percentil (0–1) pelo histograma: o limite de cima da faixa onde ele cai (nunca acima do máximo visto).
function percentil(c, q) {
  const alvo = Math.ceil(q * c.n);
  let soma = 0;
  for (let k = 0; k < FAIXAS; k++) {
    soma += c.faixas[k];
    if (soma >= alvo) return Math.min(limiteDa(k), c.max);
  }
  return c.max;
}

// { etapa: { n, p50, p95, max } } de uma hora (padrão: a atual). Hora sem nada → {}.
export function resumo(hora = horaDe()) {
  const mapa = horas.get(hora);
  const r = {};
  if (!mapa) return r;
  for (const [etapa, c] of mapa) r[etapa] = { n: c.n, p50: percentil(c, 0.5), p95: percentil(c, 0.95), max: c.max };
  return r;
}

export function zerar() { horas.clear(); }

export const ms = (x) => `${x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : Math.round(x)} ms`;

// Uma linha legível de um resumo, no idioma pedido (pt | en | es). Sem dado → null.
export function descrever(r, idioma = "pt") {
  const l = idioma === "en" || idioma === "es" ? idioma : "pt";
  const tot = r?.total;
  if (!tot?.n) return null;
  const partes = [`${tot.n} msg · p50 ${ms(tot.p50)} · p95 ${ms(tot.p95)} · ${{ pt: "máx", en: "max", es: "máx" }[l]} ${ms(tot.max)}`];
  for (const etapa of Object.keys(ETAPAS)) {
    if (etapa === "total" || !r[etapa]?.n) continue;
    partes.push(`${ETAPAS[etapa][l]} p50 ${ms(r[etapa].p50)} · p95 ${ms(r[etapa].p95)}`);
  }
  return partes.join(" — ");
}
