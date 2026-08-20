// ══════════════════════════════════════════════════════════
//  servidor.js — judy-voz: o bot fala nas calls do Stoat
//
//  Roda NATIVO no Gentoo, ao lado do judy-ia — não em Docker.
//  Dois motivos:
//   1. O revoice.js depende de @livekit/rtc-node, que traz binários
//      nativos. Colocar isso na imagem do bot significaria arriscar o
//      build inteiro da moderação por causa de um recurso opcional.
//   2. Se a voz travar ou vazar memória, ela cai sozinha. A moderação
//      de 3200 membros continua de pé.
//
//  Rotas:
//    GET  /saude       → diagnóstico completo da cadeia
//    POST /entrar      → { canalVoz } entra numa call
//    POST /sair        → { canalVoz? } sai (sem canal = sai de todas)
//    POST /falar       → { canalVoz, texto, voz? } fala na call
//    GET  /estado      → onde está conectado e o que há na fila
//
//  Segurança: só responde a quem apresenta o header `x-chave` igual a
//  VOZ_CHAVE. O serviço fica exposto na Tailscale, e sem isso qualquer
//  coisa na rede poderia fazer o bot falar.
// ══════════════════════════════════════════════════════════

import "dotenv/config";
import { createServer } from "node:http";
import * as tts from "./tts.js";
import * as voz from "./voz.js";

const PORTA   = Number(process.env.VOZ_PORTA || 8091);
const CHAVE   = process.env.VOZ_CHAVE || "";
const DEBUG   = process.env.VOZ_DEBUG === "1";

export const log = (...a) => console.log(new Date().toISOString(), "[VOZ]", ...a);
export const dbg = (...a) => { if (DEBUG) console.log(new Date().toISOString(), "[VOZ][debug]", ...a); };
const erro = (...a) => console.error(new Date().toISOString(), "[VOZ][erro]", ...a);

function responder(res, status, corpo) {
  const txt = JSON.stringify(corpo);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(txt);
}

function lerCorpo(req) {
  return new Promise((res, rej) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
      if (d.length > 64_000) { rej(new Error("corpo grande demais")); req.destroy(); }
    });
    req.on("end", () => { try { res(d ? JSON.parse(d) : {}); } catch (e) { rej(e); } });
    req.on("error", rej);
  });
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const rota = url.pathname;

  // A chave protege tudo menos o /saude, que precisa ser alcançável
  // por um curl simples quando algo dá errado.
  if (CHAVE && rota !== "/saude" && req.headers["x-chave"] !== CHAVE) {
    dbg(`recusado ${rota}: chave inválida`);
    return responder(res, 401, { erro: "chave inválida" });
  }

  try {
    if (rota === "/saude") {
      const [piper, conexoes] = await Promise.all([tts.diagnostico(), voz.estado()]);
      const ok = piper.ok;
      return responder(res, ok ? 200 : 503, {
        ok,
        versao: "1.0",
        piper,
        voz: conexoes,
        chaveExigida: !!CHAVE,
        debug: DEBUG,
      });
    }

    if (rota === "/estado") {
      return responder(res, 200, await voz.estado());
    }

    if (req.method !== "POST") return responder(res, 404, { erro: "rota desconhecida" });
    const corpo = await lerCorpo(req);

    if (rota === "/entrar") {
      const { canalVoz } = corpo;
      if (!canalVoz) return responder(res, 400, { erro: "falta canalVoz" });
      const r = await voz.entrar(canalVoz);
      return responder(res, r.ok ? 200 : 502, r);
    }

    if (rota === "/sair") {
      const r = await voz.sair(corpo.canalVoz ?? null);
      return responder(res, 200, r);
    }

    if (rota === "/falar") {
      const { canalVoz, texto, voz: vozNome } = corpo;
      if (!canalVoz) return responder(res, 400, { erro: "falta canalVoz" });
      if (!texto || !String(texto).trim()) return responder(res, 400, { erro: "falta texto" });

      const t0 = Date.now();
      const r = await voz.falar(canalVoz, String(texto), vozNome);
      dbg(`falar em ${canalVoz}: ${Date.now() - t0}ms — ${r.ok ? "ok" : r.erro}`);
      return responder(res, r.ok ? 200 : 502, { ...r, ms: Date.now() - t0 });
    }

    return responder(res, 404, { erro: "rota desconhecida" });
  } catch (e) {
    erro(rota, e?.message ?? e);
    return responder(res, 500, { erro: e?.message ?? String(e) });
  }
});

servidor.listen(PORTA, () => {
  log(`judy-voz ouvindo na porta ${PORTA}`);
  log(`chave exigida: ${CHAVE ? "sim" : "NÃO (defina VOZ_CHAVE!)"}`);
  if (!CHAVE) {
    erro("sem VOZ_CHAVE: qualquer coisa na rede pode fazer o bot falar. Defina no .env.");
  }
  tts.diagnostico().then((d) => {
    log(`Piper: ${d.ok ? `ok — voz ${d.vozAtual}` : `INDISPONÍVEL — ${d.erro}`}`);
    if (!d.ok) log("   rode: bash scripts/instalar-piper.sh");
  });
  voz.iniciar().then((r) => log(`revoice: ${r.ok ? "pronto" : `INDISPONÍVEL — ${r.erro}`}`));
});

// Sair limpo: deixar o bot pendurado numa call depois do serviço morrer
// é o tipo de coisa que só se descobre quando alguém reclama.
for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, async () => {
    log(`recebido ${sinal} — saindo das calls`);
    try { await voz.sair(null); } catch {}
    process.exit(0);
  });
}
