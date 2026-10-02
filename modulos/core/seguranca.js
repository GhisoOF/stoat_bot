// Proteções contra abuso (revisão de segurança de 1 out 2026).
//
//  • semPingEmMassa — o texto da IA sai como mensagem COMUM (não embed), e
//    menção em mensagem comum notifica. Bastava pedir "repita: @everyone" (ou
//    colar 30 menções) para a Judy pingar o servidor inteiro. Aqui saem
//    @everyone/@online/@here, menções a cargo e a enxurrada de menções a gente.
//  • buscarSeguro — a IA lê as páginas dos resultados de busca e o RSS lê o
//    endereço que a staff deu. Sem filtro, um link (ou um redirect) para
//    127.0.0.1, 192.168.x ou 100.x (a rede Tailscale) fazia o bot buscar os
//    serviços internos (SSRF). Agora só sai para a internet pública, e cada
//    redirect é conferido de novo.

import dns from "node:dns/promises";
import net from "node:net";

const ZWSP = "\u200b";
export function semPingEmMassa(texto, { maxMencoes = 3 } = {}) {
  if (typeof texto !== "string" || !texto) return texto;
  let t = texto.replace(/@(everyone|online|here|todos|all)\b/gi, `@${ZWSP}$1`);
  t = t.replace(/<%([A-Za-z0-9]{20,32})>/g, "@cargo");
  const vistos = new Set();
  t = t.replace(/<@!?([A-Za-z0-9]{20,32})>/g, (m, id) => {
    if (vistos.has(id) || vistos.size < maxMencoes) { vistos.add(id); return m; }
    return "@alguém";
  });
  return t;
}

// ── Endereços: só internet pública ─────────────────────────────────────────
function ipv4Privado(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)   // CGNAT — inclui a Tailscale
    || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
export function ipPrivado(ip) {
  if (net.isIPv4(ip)) return ipv4Privado(ip);
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const v4 = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return ipv4Privado(v4[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);   // ULA, link-local, multicast
  }
  return true;   // não é IP válido: não arrisca
}

export async function urlPublica(url, { resolver = (h) => dns.lookup(h, { all: true }) } = {}) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, motivo: "endereço inválido" }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, motivo: `protocolo ${u.protocol} não é permitido` };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|ts\.net)$/.test(host)) return { ok: false, motivo: "endereço interno" };
  if (net.isIP(host)) return ipPrivado(host) ? { ok: false, motivo: "endereço interno" } : { ok: true };
  try {
    const ends = await resolver(host);
    if (!ends?.length) return { ok: false, motivo: "o domínio não resolve" };
    if (ends.some((e) => ipPrivado(e.address ?? e))) return { ok: false, motivo: "o domínio aponta para um endereço interno" };
  } catch { return { ok: false, motivo: "o domínio não resolve" }; }
  return { ok: true };
}

// fetch que só fala com a internet pública e confere cada redirect
export async function buscarSeguro(url, opcoes = {}, { maxSaltos = 3, fetcher = fetch, resolver } = {}) {
  let alvo = url;
  for (let salto = 0; salto <= maxSaltos; salto++) {
    const v = await urlPublica(alvo, resolver ? { resolver } : {});
    if (!v.ok) throw new Error(`bloqueado: ${v.motivo} (${alvo.slice(0, 80)})`);
    const r = await fetcher(alvo, { ...opcoes, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(r.status)) return r;
    const destino = r.headers?.get?.("location");
    if (!destino) return r;
    alvo = new URL(destino, alvo).href;
  }
  throw new Error("redirects demais");
}

// Quantias digitadas: inteiro positivo e com teto (1e300 virava "Infinity" no saldo)
export const QUANTIA_MAX = 1_000_000_000_000;
export function quantiaValida(n) {
  return Number.isSafeInteger(n) && n > 0 && n <= QUANTIA_MAX;
}
