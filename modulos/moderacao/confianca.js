// ══════════════════════════════════════════════════════════
//  confianca.js — quanto o servidor já conhece esta pessoa
//
//  A moderação por JULGAMENTO (o antigo antiscam, hoje "sentinela")
//  não é uma métrica exata: ela dá uma nota de suspeita ao conteúdo.
//  E o mesmo conteúdo merece resposta diferente conforme quem escreve.
//
//  Uma conta criada agora, que chega mandando link e falando de venda,
//  é o padrão clássico de golpe. A mesma frase vinda de quem está no
//  servidor há semanas quase sempre é brincadeira ou contexto que o
//  detector não enxerga.
//
//  Então o limiar se ajusta: apertado para quem chegou agora, folgado
//  para quem já provou que fica. Como o Stoat não expõe de forma
//  confiável a data de entrada no servidor, o **nível de XP** serve de
//  medida de convívio — ele só sobe conversando, ao longo do tempo, e
//  é justamente isso que se quer medir.
//
//  IMPORTANTE: isto vale SÓ para o sentinela. Os módulos de métrica
//  exata (spam, caps, links, menções, repetição, caracteres) não usam
//  nada disto — lá o limite é objetivo e vale igual para todo mundo.
// ══════════════════════════════════════════════════════════
import * as db from "../core/db.js";

// Faixas de convívio. O ajuste é no limiar da nota de suspeita: quanto
// MAIS negativo, mais fácil de disparar (o limiar cai).
//
// Os números são deliberadamente suaves. Um novato não deve ser punido
// por qualquer coisa — ele deve ser olhado mais de perto.
export const FAIXAS = [
  { ate: 0,  ajuste: -1.5, id: "novato",     rotulo: "recém-chegado", rotuloEN: "newcomer" },
  { ate: 2,  ajuste: -1.0, id: "conhecido",  rotulo: "conhecido",     rotuloEN: "getting known" },
  { ate: 5,  ajuste: -0.5, id: "frequente",  rotulo: "frequente",     rotuloEN: "regular" },
  { ate: 10, ajuste: 0,    id: "estabelecido", rotulo: "estabelecido", rotuloEN: "established" },
  { ate: Infinity, ajuste: +0.5, id: "veterano", rotulo: "veterano",  rotuloEN: "veteran" },
];

// Nível de XP como medida de convívio. Sem XP ligado no servidor, todo
// mundo fica em nível 0 — e aí o sistema trata todos como novatos, que é
// o lado seguro de errar.
export function nivelDe(serverId, userId) {
  try { return db.getXp(serverId, userId)?.nivel ?? 0; } catch { return 0; }
}

export function faixaDe(nivel) {
  return FAIXAS.find((f) => nivel <= f.ate) ?? FAIXAS[FAIXAS.length - 1];
}

// Limiar efetivo para esta pessoa. `base` vem da sensibilidade escolhida
// pelo admin (baixa/media/alta); a faixa só desloca esse ponto.
export function limiarPara(serverId, userId, base, { ativo = true } = {}) {
  if (!ativo) return { limiar: base, faixa: null, nivel: null };
  const nivel = nivelDe(serverId, userId);
  const faixa = faixaDe(nivel);
  // Piso e teto: mesmo o veterano mais antigo não fica imune, e nem o
  // novato mais novo é punido por qualquer bobagem.
  const limiar = Math.max(3.5, Math.min(9, base + faixa.ajuste));
  return { limiar, faixa, nivel };
}

// ── Alerta à administração ────────────────────────────────
//
// Quando algo suspeito começa, quem precisa saber é a moderação humana —
// e precisa saber ENQUANTO está acontecendo, não no relatório de depois.
// O alerta é separado da punição de propósito: nem todo sinal merece
// punir, mas todo padrão suspeito merece um par de olhos.

// Quantas vezes a mesma pessoa precisa levantar suspeita, na mesma
// janela, para virar alerta. Um sinal isolado é ruído; três em poucos
// minutos é padrão.
const JANELA_MS = Number(process.env.SENTINELA_JANELA_MS || 10 * 60_000);
const MIN_SINAIS = Number(process.env.SENTINELA_MIN_SINAIS || 3);
const RECARGA_MS = Number(process.env.SENTINELA_RECARGA_MS || 30 * 60_000);

const historico = new Map();   // chave → { marcas: [ts], avisadoEm }

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

  // Já avisamos há pouco? Não vale repetir — alerta que se repete vira
  // ruído e a moderação para de ler.
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
