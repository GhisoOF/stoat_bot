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
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { Readable } from "node:stream";

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

// Texto que vem DE FORA (webhook, RSS, transcrição, título de feed, motivo
// digitado): um neutralizador só (DRY). Tira o ping em massa, desmascara link
// ("[github.com](http://outro)" vira "github.com (http://outro)"), tira o
// caractere de controle e corta no tamanho.
export function textoDeFora(texto, { max = 2000, maxMencoes = 3 } = {}) {
  if (texto == null) return "";
  let t = String(texto).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  t = t.replace(/\[([^\]\n]{0,200})\]\((\S{1,500}?)\)/g, (_m, rotulo, url) => `${rotulo} (${url})`);
  t = semPingEmMassa(t, { maxMencoes });
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// ── Endereços: só internet pública ─────────────────────────────────────────
function ipv4Privado(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)   // CGNAT — inclui a Tailscale
    || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
// IPv6 que não é internet pública. O `new URL` escreve o IPv4 embutido em hex
// (`[::ffff:127.0.0.1]` vira `::ffff:7f00:1`), e o teste antigo só via a forma
// com pontos — o 127.0.0.1 passava como "público" (15 out 2026). Aqui é por
// faixa (net.BlockList entende todas as grafias), e as faixas que EMBUTEM um
// IPv4 (mapeado, compatível, NAT64, 6to4, Teredo) ficam todas de fora.
const FAIXAS_V6 = new net.BlockList();
for (const [rede, bits] of [
  ["::", 96],            // não especificado, loopback (::1) e IPv4-compatível (::a.b.c.d)
  ["::ffff:0:0", 96],    // IPv4 mapeado
  ["::ffff:0:0:0", 96],  // IPv4 traduzido
  ["64:ff9b::", 96], ["64:ff9b:1::", 48],   // NAT64
  ["100::", 64],         // descarte
  ["2001::", 32],        // Teredo
  ["2001:db8::", 32],    // documentação
  ["2002::", 16],        // 6to4
  ["fc00::", 7],         // ULA
  ["fe80::", 10],        // link-local
  ["fec0::", 10],        // site-local (antigo)
  ["ff00::", 8],         // multicast
]) FAIXAS_V6.addSubnet(rede, bits, "ipv6");

export function ipPrivado(ip) {
  const h = String(ip ?? "").replace(/^\[|\]$/g, "").split("%")[0];
  if (net.isIPv4(h)) return ipv4Privado(h);
  if (net.isIPv6(h)) {
    try { return FAIXAS_V6.check(h, "ipv6"); } catch { return true; }
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

// ── Conexão com o IP FIXADO (12 out 2026) ───────────────────────────────────
// O urlPublica confere o DNS, e depois o fetch resolvia o nome DE NOVO: um
// domínio com TTL zero responde "IP público" na conferência e "127.0.0.1" na
// conexão (DNS rebinding). Aqui a conferência acontece DENTRO da conexão: o
// socket só abre para um endereço que acabou de passar pelo ipPrivado.
// `ehInterno` só muda em teste (para conectar num servidor falso em 127.0.0.1).
export function lookupPublico(resolver = (h) => dns.lookup(h, { all: true }), ehInterno = ipPrivado) {
  return (hostname, opcoes, cb) => {
    if (typeof opcoes === "function") { cb = opcoes; opcoes = {}; }
    const h = String(hostname).replace(/^\[|\]$/g, "");
    const responder = (lista) => {
      if (!lista.length) return cb(Object.assign(new Error("o domínio não resolve"), { code: "ENOTFOUND" }));
      if (lista.some((e) => ehInterno(e.address))) return cb(Object.assign(new Error("endereço interno"), { code: "EBLOQUEADO" }));
      if (opcoes?.all) return cb(null, lista);
      return cb(null, lista[0].address, lista[0].family);
    };
    if (net.isIP(h)) return responder([{ address: h, family: net.isIP(h) }]);
    Promise.resolve(resolver(h)).then((ends) => responder((ends ?? []).map((e) => {
      const address = e?.address ?? e;
      return { address, family: e?.family ?? (net.isIPv6(address) ? 6 : 4) };
    })), (e) => cb(e));
  };
}

// Os erros acima são escritos em português e chegam à tela (o `&rss add` mostra
// "**Error:** …"). Na tela em inglês, as mesmas frases traduzidas; o que não
// for daqui (HTTP 503, erro do Node) passa como está.
const ERROS_EN = [
  [/^bloqueado: /, "blocked: "],
  [/o domínio aponta para um endereço interno/, "the domain points to an internal address"],
  [/o domínio não resolve/, "the domain doesn't resolve"],
  [/endereço inválido/, "invalid address"],
  [/protocolo (\S+) não é permitido/, "protocol $1 isn't allowed"],
  [/endereço interno/, "internal address"],
  [/resposta grande demais \(mais de (\d+) MB\)/, "response too large (over $1 MB)"],
  [/tempo esgotado/, "timed out"],
  [/redirects demais/, "too many redirects"],
];
export function erroEmIngles(texto) {
  let t = String(texto ?? "");
  for (const [re, en] of ERROS_EN) t = t.replace(re, en);
  return t;
}
// (31 out 2026) a tela em espanhol mostrava a frase em inglês
const ERROS_ES = [
  [/^bloqueado: /, "bloqueado: "],
  [/o domínio aponta para um endereço interno/, "el dominio apunta a una dirección interna"],
  [/o domínio não resolve/, "el dominio no se resuelve"],
  [/endereço inválido/, "dirección no válida"],
  [/protocolo (\S+) não é permitido/, "el protocolo $1 no está permitido"],
  [/endereço interno/, "dirección interna"],
  [/resposta grande demais \(mais de (\d+) MB\)/, "respuesta demasiado grande (más de $1 MB)"],
  [/tempo esgotado/, "tiempo agotado"],
  [/redirects demais/, "demasiadas redirecciones"],
];
export function erroEmEspanhol(texto) {
  let t = String(texto ?? "");
  for (const [re, es] of ERROS_ES) t = t.replace(re, es);
  return t;
}

export const MAX_RESPOSTA = Number(process.env.REDE_MAX_BYTES || 5 * 1024 * 1024);

// GET mínimo, com cara de fetch (status, ok, headers.get, text, body) — só o
// que os chamadores usam. `text()` tem teto: um feed infinito não enche a RAM.
function requisitar(url, { headers = {}, signal, resolver, ehInterno, timeoutMs = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, {
      method: "GET", signal, lookup: lookupPublico(resolver ?? undefined, ehInterno ?? ipPrivado), timeout: timeoutMs,
      headers: { "accept-encoding": "gzip, deflate, br", ...headers },
    }, (res) => {
      const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
      const descomprimir = enc === "gzip" ? zlib.createGunzip() : enc === "deflate" ? zlib.createInflate() : enc === "br" ? zlib.createBrotliDecompress() : null;
      const corpo = descomprimir ? res.pipe(descomprimir) : res;
      if (descomprimir) res.on("error", (e) => descomprimir.destroy(e));
      resolve({
        status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300,
        headers: { get: (n) => { const v = res.headers[String(n).toLowerCase()]; return Array.isArray(v) ? v.join(", ") : (v ?? null); } },
        body: corpo,
        async text(max = MAX_RESPOSTA) {
          const partes = []; let total = 0;
          for await (const pedaco of corpo) {
            total += pedaco.length;
            if (total > max) { corpo.destroy(); res.destroy(); throw new Error(`resposta grande demais (mais de ${Math.round(max / 1024 / 1024)} MB)`); }
            partes.push(pedaco);
          }
          return Buffer.concat(partes).toString("utf8");
        },
        descartar() { res.resume(); },
      });
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    req.end();
  });
}

// Busca que só fala com a internet pública: confere o endereço, conecta no IP
// conferido e confere cada redirect de novo. `fetcher` (testes) usa o caminho
// antigo, com a conferência antes da conexão.
export async function buscarSeguro(url, opcoes = {}, { maxSaltos = 3, fetcher = null, resolver, _ehInterno } = {}) {
  let alvo = url;
  for (let salto = 0; salto <= maxSaltos; salto++) {
    const v = _ehInterno ? { ok: true } : await urlPublica(alvo, resolver ? { resolver } : {});
    if (!v.ok) throw new Error(`bloqueado: ${v.motivo} (${alvo.slice(0, 80)})`);
    const r = fetcher
      ? await fetcher(alvo, { ...opcoes, redirect: "manual" })
      : await requisitar(alvo, { headers: opcoes.headers, signal: opcoes.signal, resolver, ehInterno: _ehInterno });
    if (![301, 302, 303, 307, 308].includes(r.status)) return r;
    const destino = r.headers?.get?.("location");
    if (!destino) return r;
    r.descartar?.();
    alvo = new URL(destino, alvo).href;
  }
  throw new Error("redirects demais");
}

// Lê o corpo de qualquer resposta (fetch ou a nossa) com teto de bytes.
export async function lerTexto(r, max = MAX_RESPOSTA) {
  if (typeof r?.descartar === "function") return r.text(max);   // a nossa resposta: já tem teto
  if (!r?.body) return String(await r.text()).slice(0, max);
  const partes = []; let total = 0;
  for await (const pedaco of (r.body instanceof ReadableStream ? Readable.fromWeb(r.body) : r.body)) {
    total += pedaco.length;
    if (total > max) throw new Error(`resposta grande demais (mais de ${Math.round(max / 1024 / 1024)} MB)`);
    partes.push(Buffer.from(pedaco));
  }
  return Buffer.concat(partes).toString("utf8");
}

// Quantias digitadas: inteiro positivo e com teto (1e300 virava "Infinity" no saldo)
export const QUANTIA_MAX = 1_000_000_000_000;
export function quantiaValida(n) {
  return Number.isSafeInteger(n) && n > 0 && n <= QUANTIA_MAX;
}
