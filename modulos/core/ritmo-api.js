// O ritmo da API do Stoat (22 out 2026).
//
// Ghieh: o `&cor painel aqui` criava 1 ou 2 cores e as outras 28 "não entravam".
// O Stoat limita cada grupo de rotas a uma janela de 10 s — `/servers` (criar e
// pintar cargo, criar canal, permissões, kick, ban) aceita só **5** pedidos por
// janela — e responde 429 com `retry_after` (ms) no corpo e
// `X-RateLimit-Reset-After` no cabeçalho. Nada no bot esperava: o 6º pedido
// falhava, e o painel (2 pedidos por cor) parava na 3ª. O wizard de servidor
// (`&assistente servidor`) e o `&xp criarcargos` tinham o mesmo teto.
//
// Aqui, um só lugar para todas as chamadas — as da stoat.js e as do `chamarApi`
// usam o `fetch` global:
//   • antes do pedido: se o grupo de rotas esgotou (`X-RateLimit-Remaining: 0`),
//     espera a janela abrir;
//   • 429: espera o `retry_after` e tenta de novo (até 4 vezes).
// Só rotas do endereço da API (`API`); o resto passa direto.
import { API } from "./stoat-api.js";

const TENTATIVAS = 4;
const ESPERA_MAX = 20_000;      // um 429 com espera maior que isso volta como está
const FOLGA = 250;              // margem depois da janela abrir
const fechadoAte = new Map();   // grupo de rotas → ms em que a janela reabre

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// O grupo de rotas (o "bucket" do Stoat), pelo 1º pedaço do caminho:
// /servers/…, /channels/…, /users/…; mensagens têm o seu.
export function grupoDaRota(url) {
  let caminho = "";
  try { caminho = new URL(String(url)).pathname; } catch { caminho = String(url); }
  // a stoat.js fala com https://stoat.chat/api/…; o chamarApi, com https://api.stoat.chat/…
  caminho = caminho.replace(/^\/api(?=\/)/, "");
  const [, primeiro = "", , terceiro = ""] = caminho.split("/");
  if (primeiro === "channels" && terceiro === "messages") return "channels/messages";
  return primeiro || "/";
}

// Quantos ms esperar, a partir de uma resposta 429 (cabeçalho ou corpo)
export function esperaDe(cabecalhos, corpo) {
  const bruto = cabecalhos?.get?.("x-ratelimit-reset-after");
  const h = bruto == null || bruto === "" ? NaN : Number(bruto);   // (Number(null) é 0: sem o cabeçalho, vale o corpo)
  if (Number.isFinite(h) && h >= 0) return h;
  try {
    const j = typeof corpo === "string" ? JSON.parse(corpo) : corpo;
    const ms = Number(j?.retry_after);
    if (Number.isFinite(ms) && ms >= 0) return ms;
  } catch {}
  return 2_000;
}

// Os dois endereços da API: o do `chamarApi` (STOAT_API) e o padrão da stoat.js
const BASES = [...new Set([API, "https://stoat.chat/api", "https://api.stoat.chat"])];
const ehDaApi = (url) => {
  try { const u = String(url?.url ?? url); return BASES.some((b) => u === b || u.startsWith(b + "/")); } catch { return false; }
};

export function comRitmo(fetchOriginal) {
  if (fetchOriginal?.__comRitmo) return fetchOriginal;
  const embrulhado = async (url, opcoes) => {
    if (!ehDaApi(url)) return fetchOriginal(url, opcoes);
    const grupo = grupoDaRota(url?.url ?? url);
    for (let tentativa = 1; ; tentativa++) {
      const falta = (fechadoAte.get(grupo) ?? 0) - Date.now();
      if (falta > 0) await dormir(Math.min(falta, ESPERA_MAX));
      const r = await fetchOriginal(url, opcoes);
      // anota a janela: sem pedidos sobrando, o próximo espera ela reabrir
      const restamBruto = r.headers?.get?.("x-ratelimit-remaining");
      const restam = restamBruto == null || restamBruto === "" ? NaN : Number(restamBruto);
      const reabreBruto = r.headers?.get?.("x-ratelimit-reset-after");
      const reabre = reabreBruto == null || reabreBruto === "" ? NaN : Number(reabreBruto);
      if (restam === 0 && Number.isFinite(reabre)) fechadoAte.set(grupo, Date.now() + reabre + FOLGA);
      if (r.status !== 429 || tentativa >= TENTATIVAS || opcoes?.signal?.aborted) return r;
      const corpo = await r.clone().text().catch(() => "");
      const espera = esperaDe(r.headers, corpo);
      if (espera > ESPERA_MAX) return r;
      fechadoAte.set(grupo, Date.now() + espera + FOLGA);
      console.warn(`[API] limite do Stoat em /${grupo} — esperando ${Math.round(espera / 100) / 10}s (tentativa ${tentativa + 1}/${TENTATIVAS})`);
    }
  };
  embrulhado.__comRitmo = true;
  return embrulhado;
}

export function instalar() {
  if (typeof globalThis.fetch === "function") globalThis.fetch = comRitmo(globalThis.fetch);
}

// Para avisar quanto um lote vai levar: pedidos ao grupo /servers (5 a cada 10 s)
export function segundosPara(pedidos, porJanela = 5) {
  return Math.max(0, Math.ceil(pedidos / porJanela) - 1) * 10;
}

export function _zerar() { fechadoAte.clear(); }
