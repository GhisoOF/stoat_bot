import * as db from "../core/db.js";

export const FAIXAS = [
  { ate: 0,  ajuste: -1.5, id: "novato",     rotulo: "recém-chegado", rotuloEN: "newcomer" },
  { ate: 2,  ajuste: -1.0, id: "conhecido",  rotulo: "conhecido",     rotuloEN: "getting known" },
  { ate: 5,  ajuste: -0.5, id: "frequente",  rotulo: "frequente",     rotuloEN: "regular" },
  { ate: 10, ajuste: 0,    id: "estabelecido", rotulo: "estabelecido", rotuloEN: "established" },
  { ate: Infinity, ajuste: +0.5, id: "veterano", rotulo: "veterano",  rotuloEN: "veteran" },
];

export function nivelDe(serverId, userId) {
  try { return db.getXp(serverId, userId)?.nivel ?? 0; } catch { return 0; }
}

export function faixaDe(nivel) {
  return FAIXAS.find((f) => nivel <= f.ate) ?? FAIXAS[FAIXAS.length - 1];
}

export function limiarPara(serverId, userId, base, { ativo = true } = {}) {
  if (!ativo) return { limiar: base, faixa: null, nivel: null };
  const nivel = nivelDe(serverId, userId);
  const faixa = faixaDe(nivel);
  const limiar = Math.max(3.5, Math.min(9, base + faixa.ajuste));
  return { limiar, faixa, nivel };
}

const JANELA_MS = Number(process.env.SENTINELA_JANELA_MS || 10 * 60_000);
const MIN_SINAIS = Number(process.env.SENTINELA_MIN_SINAIS || 3);
const RECARGA_MS = Number(process.env.SENTINELA_RECARGA_MS || 30 * 60_000);

const historico = new Map();   // chave → { marcas: [ts], avisadoEm }

setInterval(() => {
  const agora = Date.now();
  for (const [k, h] of historico) {
    const ultimoSinal = h.marcas.length ? h.marcas[h.marcas.length - 1] : 0;
    if (agora - ultimoSinal > JANELA_MS && agora - h.avisadoEm > RECARGA_MS) {
      historico.delete(k);
    }
  }
}, 30 * 60_000).unref?.();

const chave = (s, u) => `${s}:${u}`;

// Registra um sinal e diz se é hora de chamar a administração.
export function registrarSinal(serverId, userId, { nota, sinais = [] } = {}) {
  const k = chave(serverId, userId);
  const agora = Date.now();
  const h = historico.get(k) ?? { marcas: [], avisadoEm: 0, sinais: new Set() };
  h.marcas = h.marcas.filter((t) => agora - t < JANELA_MS);
  h.marcas.push(agora);
  for (const x of sinais) h.sinais.add(x);
  historico.set(k, h);

  if (agora - h.avisadoEm < RECARGA_MS) return { alertar: false, vezes: h.marcas.length };
  if (h.marcas.length < MIN_SINAIS) return { alertar: false, vezes: h.marcas.length };

  h.avisadoEm = agora;
  const lista = [...h.sinais];
  h.sinais = new Set();
  return { alertar: true, vezes: h.marcas.length, janelaMin: Math.round(JANELA_MS / 60000), sinais: lista, nota };
}

export function esquecerSinais(serverId, userId) {
  historico.delete(chave(serverId, userId));
}
