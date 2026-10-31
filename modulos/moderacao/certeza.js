// certeza.js — de uma nota (0–1) a uma decisão (31 out 2026, P3a).
//
// Certeza ALTA → o bot age sozinho (a ação do módulo). MÉDIA e BAIXA → ninguém é punido:
// (31 out 2026, P3a, staff — R13) a STAFF do servidor recebe um alerta com ✅/❌
// (casos-staff.js) — antes ia para a fila do dono do bot. O limiar da "alta" é o do
// servidor (calibrado pelos vereditos da staff dele) ou, enquanto ele não tem casos
// suficientes, o global (calibrado pela amostra do dono, revisao.js), ou o padrão daqui.
// Nada disso é configurável à mão.
//
// O que a staff DESTE servidor já julgou vale antes da nota: um caso muito parecido com um
// que ela marcou ❌ nunca vira alerta nem punição; com um que ela marcou ✅, age na hora.
//
// A amostra do dono (revisao.js) e os casos da staff (casos-staff.js) são carregados sob
// demanda: sem eles (ou se falharem), o detector segue — nada estoura.

import { registrarErro } from "../core/erros.js";

export const PADRAO = Object.freeze({ alta: 0.9, media: 0.5, baixa: 0.3 });
// o intervalo em que os limiares são calibrados (revisao.js: LIMIAR_MIN/LIMIAR_MAX)
export const LIMIAR_MIN = 0.5, LIMIAR_MAX = 0.98;
export const CERTEZAS = ["alta", "media", "baixa"];
export const VEREDITOS = ["certo", "errou"];

// ── Os módulos carregados sob demanda ───────────────────────────────────────
// undefined = ainda não tentou; null = não há
let filaMod, staffMod;
async function carregar(caminho, etiqueta) {
  try { return await import(caminho); }
  catch (e) {
    // só "o arquivo não existe" é esperado; o resto é erro de verdade
    if (e?.code !== "ERR_MODULE_NOT_FOUND") registrarErro(etiqueta, e);
    return null;
  }
}
// A amostra do dono (registrarCaso, amostrar)
export async function fila() {
  if (filaMod === undefined) filaMod = await carregar("./revisao.js", "PERFIL:fila");
  return filaMod;
}
// Os casos da staff de cada servidor (vereditoParecido, limiar, alertar)
export async function staff() {
  if (staffMod === undefined) staffMod = await carregar("./casos-staff.js", "PERFIL:staff");
  return staffMod;
}
// Só para testes: põe um dublê no lugar (null = não há).
export function _trocarFila(duble) { const antes = filaMod; filaMod = duble; return antes; }
export function _trocarStaff(duble) { const antes = staffMod; staffMod = duble; return antes; }

const veredito = (v) => (VEREDITOS.includes(v) ? v : null);

// O limiar da faixa alta para a categoria NESTE servidor: o calibrado pela staff dele, o
// global, ou o padrão. (31 out 2026, P3a, staff) antes: o global, com o `&caso servidor rigido`.
export async function limiarAlta(categoria, padrao = PADRAO.alta, serverId = null) {
  const s = await staff();
  if (typeof s?.limiar !== "function") return padrao;
  try {
    const v = Number(await s.limiar(categoria, padrao, { serverId }));
    // a faixa alta fica no intervalo calibrável, [0,5; 0,98] (um limiar torto não vira punição em massa)
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
// O que a staff deste servidor já confirmou ("certo") pune em qualquer categoria; o que ela
// disse que não é ("errou") nunca pune nem vira alerta. Média/baixa (ou alta não punível) →
// "staff": o alerta com ✅/❌. (31 out 2026, P3a, staff) antes: "fila" (a do dono).
export function decidir({ certeza, herdado = null, punivel = true }) {
  if (herdado === "errou") return "nada";
  if (herdado === "certo") return "punir";
  if (certeza === "alta") return punivel ? "punir" : "staff";
  if (certeza === "media" || certeza === "baixa") return "staff";
  return "nada";
}

// A staff DESTE servidor já julgou algo muito parecido? (só consulta; `q.serverId` é obrigatório)
export async function vereditoParecido(q) {
  const s = await staff();
  if (typeof s?.vereditoParecido !== "function") return null;
  try { return veredito(await s.vereditoParecido(q)); }
  catch (e) { registrarErro("PERFIL:vereditoParecido", e); return null; }
}

// O alerta do caso duvidoso à staff (casos-staff.alertar). null = não foi (sem canal, sem módulo).
export async function alertarStaff(args) {
  const s = await staff();
  if (typeof s?.alertar !== "function") return null;
  try { return (await s.alertar(args)) ?? null; }
  catch (e) { registrarErro("PERFIL:alertarStaff", e); return null; }
}

// A amostra do dono: registra o caso (a fila sorteia se ele fica). null = não há fila (ou falhou).
export async function registrar(caso) {
  const f = await fila();
  if (typeof f?.registrarCaso !== "function") return null;
  try {
    const r = await f.registrarCaso(caso);
    return { codigo: r?.codigo ?? null };
  } catch (e) { registrarErro("PERFIL:registrarCaso", e); return null; }
}

// A amostra aleatória (a fila decide se este caso não punido entra).
export async function amostrar(q) {
  const f = await fila();
  if (typeof f?.amostrar !== "function") return false;
  try { return (await f.amostrar(q)) === true; }
  catch (e) { registrarErro("PERFIL:amostrar", e); return false; }
}
