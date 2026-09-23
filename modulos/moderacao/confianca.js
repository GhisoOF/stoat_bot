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
  padraoDano.delete(chave(serverId, userId));
}

// ─── Padrão de dano a pessoas, somado ao longo das horas ────────────────────
//
// Quem recruta para comunidades de "desafio" e humilhação raramente escreve
// uma frase que condene sozinha. O caso real que motivou isto: em ~7 horas a
// mesma pessoa divulgou outra comunidade, falou de gente se cortando, de
// gostar de ver alguém "passando vergonha", de desafios "no extremo" e de
// mandar alguém "comer merda". Cada mensagem tirou 0 a 2,5 no sentinela —
// nenhuma chegava perto de alertar. A conversa inteira, sim.
//
// Aqui cada pessoa acumula o peso dos sinais de dano (PESO_DANO no
// scorecard). O alerta exige TRÊS coisas ao mesmo tempo, para não virar ruído
// nem acusar quem está mal:
//   • soma acima do limiar;
//   • sinais de pelo menos DUAS categorias diferentes;
//   • pelo menos um sinal do lado de quem AGRIDE — falar só de se machucar
//     nunca dispara isto: essa pessoa precisa de ajuda, não de suspeita.
//
// Nunca pune. Só chama a staff, com as mensagens que motivaram o alerta.

const DANO_JANELA_MS = Number(process.env.SENTINELA_DANO_JANELA_MS || 12 * 3600_000);
const DANO_LIMIAR = Number(process.env.SENTINELA_DANO_LIMIAR || 4);
const DANO_RECARGA_MS = Number(process.env.SENTINELA_DANO_RECARGA_MS || 6 * 3600_000);
const padraoDano = new Map();   // chave → { eventos: [{ t, soma, categorias, agressor, trecho }], avisadoEm }

setInterval(() => {
  const agora = Date.now();
  for (const [k, p] of padraoDano) {
    p.eventos = p.eventos.filter((e) => agora - e.t < DANO_JANELA_MS);
    if (!p.eventos.length && agora - p.avisadoEm > DANO_RECARGA_MS) padraoDano.delete(k);
  }
}, 30 * 60_000).unref?.();

export function registrarDano(serverId, userId, dano, texto = "", agora = Date.now()) {
  if (!dano || !(dano.soma > 0)) return { alertar: false };
  const k = chave(serverId, userId);
  const p = padraoDano.get(k) ?? { eventos: [], avisadoEm: 0 };
  p.eventos = p.eventos.filter((e) => agora - e.t < DANO_JANELA_MS);
  p.eventos.push({
    t: agora, soma: dano.soma, categorias: dano.categorias, agressor: dano.agressor,
    trecho: String(texto).replace(/\s+/g, " ").slice(0, 140),
  });
  padraoDano.set(k, p);

  const soma = p.eventos.reduce((a, e) => a + e.soma, 0);
  const categorias = new Set(p.eventos.flatMap((e) => e.categorias));
  const agressor = p.eventos.some((e) => e.agressor);

  const pronto = soma >= DANO_LIMIAR && categorias.size >= 2 && agressor;
  if (!pronto || agora - p.avisadoEm < DANO_RECARGA_MS) {
    return { alertar: false, soma, categorias: [...categorias] };
  }
  p.avisadoEm = agora;
  return {
    alertar: true, soma, categorias: [...categorias],
    mensagens: p.eventos.length,
    horas: Math.max(1, Math.round((agora - p.eventos[0].t) / 3600_000)),
    trechos: p.eventos.slice(-6).map((e) => e.trecho),
  };
}

