// certeza.js — de uma nota (0–1) a uma decisão, com a fila do dono no meio
// (31 out 2026, P3a).
//
// Decisão do dono: certeza ALTA → o bot age sozinho; MÉDIA e BAIXA → o caso vai
// para a fila de revisão dele (DM), SEM punição, até o ✅. O limiar da "alta" é
// recalculado toda noite pela fila a partir dos casos julgados
// (`revisao.limiar`); enquanto não há casos suficientes, vale o padrão daqui.
// Nada disso é configurável pela staff.
//
// O que o dono já julgou vale antes do detector: um caso muito parecido com um
// que ele marcou ❌ ("o bot errou") nunca é punido; com um que ele marcou ✅
// ("o bot acertou"), é punido na hora.
//
// A fila (modulos/moderacao/revisao.js, área "fila") é carregada sob demanda:
// sem ela (ou se ela falhar), quem chama segue o caminho antigo (avisar a staff).

import { registrarErro } from "../core/erros.js";

export const PADRAO = Object.freeze({ alta: 0.9, media: 0.5, baixa: 0.3 });
// o intervalo em que a fila calibra o limiar da faixa alta (revisao.js: LIMIAR_MIN/LIMIAR_MAX)
export const LIMIAR_MIN = 0.5, LIMIAR_MAX = 0.98;
export const CERTEZAS = ["alta", "media", "baixa"];
export const VEREDITOS = ["certo", "errou"];

// ── A fila (interface do BRIEF-P3a) ─────────────────────────────────────────
let filaMod;          // undefined = ainda não tentou; null = não há
export async function fila() {
  if (filaMod !== undefined) return filaMod;
  try { filaMod = await import("./revisao.js"); }
  catch (e) {
    // só "o arquivo não existe" é esperado (pacote sem a fila); o resto é erro de verdade
    if (e?.code !== "ERR_MODULE_NOT_FOUND") registrarErro("PERFIL:fila", e);
    filaMod = null;
  }
  return filaMod;
}
// Só para testes: põe um dublê no lugar da fila (null = sem fila).
export function _trocarFila(duble) { const antes = filaMod; filaMod = duble; return antes; }

const veredito = (v) => (VEREDITOS.includes(v) ? v : null);

// O limiar da faixa alta para a categoria: o calibrado pela fila, ou o padrão.
// `serverId`: o servidor que o dono marcou `&caso servidor <id> rigido` tem o limiar mais baixo.
export async function limiarAlta(categoria, padrao = PADRAO.alta, serverId = null) {
  const f = await fila();
  if (typeof f?.limiar !== "function") return padrao;
  try {
    const v = Number(await f.limiar(categoria, padrao, { serverId }));
    // a faixa alta fica no intervalo da fila, [0,5; 0,98] (um limiar torto não vira punição em
    // massa). (31 out 2026, P3a, revisão) antes exigia > 0,5: o 0,5 de um servidor rígido caía
    // no padrão 0,9 — o rígido ficava MAIS permissivo que o normal.
    return Number.isFinite(v) && v >= LIMIAR_MIN && v <= LIMIAR_MAX ? v : padrao;
  } catch (e) { registrarErro("PERFIL:limiar", e); return padrao; }
}

export function certezaDe(nota, alta = PADRAO.alta) {
  const n = Number(nota);
  if (!Number.isFinite(n)) return null;
  if (n >= alta) return "alta";
  if (n >= PADRAO.media) return "media";
  if (n >= PADRAO.baixa) return "baixa";
  return null;
}

// `punivel`: a categoria permite ação automática pela nota (no perfil: sexual, ódio e gore).
// O que o dono já confirmou ("certo") pune em qualquer categoria; o que ele disse que é
// engano ("errou") nunca pune, nem com nota alta.
export function decidir({ certeza, herdado = null, punivel = true }) {
  if (herdado === "errou") return "nada";
  if (herdado === "certo") return "punir";
  if (certeza === "alta") return punivel ? "punir" : "fila";
  if (certeza === "media" || certeza === "baixa") return "fila";
  return "nada";
}

// O dono já julgou algo muito parecido? (só consulta)
export async function vereditoParecido(q) {
  const f = await fila();
  if (typeof f?.vereditoParecido !== "function") return null;
  try { return veredito(await f.vereditoParecido(q)); }
  catch (e) { registrarErro("PERFIL:vereditoParecido", e); return null; }
}

// Registra o caso. null = não há fila (ou ela falhou): quem chama avisa a staff.
export async function registrar(caso) {
  const f = await fila();
  if (typeof f?.registrarCaso !== "function") return null;
  try {
    const r = await f.registrarCaso(caso);
    return { codigo: r?.codigo ?? null, herdado: veredito(r?.herdado) };
  } catch (e) { registrarErro("PERFIL:registrarCaso", e); return null; }
}

// A amostra aleatória (a fila decide se este caso não punido entra).
export async function amostrar(q) {
  const f = await fila();
  if (typeof f?.amostrar !== "function") return false;
  try { return (await f.amostrar(q)) === true; }
  catch (e) { registrarErro("PERFIL:amostrar", e); return false; }
}
