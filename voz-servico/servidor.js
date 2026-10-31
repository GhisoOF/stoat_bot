
import "dotenv/config";
import { createServer } from "node:http";
import * as tts from "./tts.js";
import * as voz from "./voz.js";
import * as musica from "./musica.js";

export const API_VERSAO = 11;  // 11: /entrar-com-token (resgate do AlreadyConnected via mover)

const PORTA   = Number(process.env.VOZ_PORTA || 8091);
const CHAVE   = process.env.VOZ_CHAVE || "";
const DEBUG   = process.env.VOZ_DEBUG === "1";

export const log = (...a) => console.log(new Date().toISOString(), "[VOZ]", ...a);
export const dbg = (...a) => { if (DEBUG) console.log(new Date().toISOString(), "[VOZ][debug]", ...a); };
const erro = (...a) => console.error(new Date().toISOString(), "[VOZ][erro]", ...a);

// (31 out 2026, P1) Sem chave, o serviço não sobe: qualquer processo que alcançasse a
// porta fazia o bot falar nas calls. Embutido, o iniciar.js gera uma por boot.
if (!CHAVE) {
  erro("sem VOZ_CHAVE no ambiente: o serviço de voz não sobe sem chave (qualquer coisa na rede faria o bot falar). Defina a mesma VOZ_CHAVE no .env do bot e do serviço.");
  process.exit(1);
}

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

  // (31 out 2026, P1) toda rota exige a chave — o /saude também (ele dizia em quais
  // calls o bot está e rodava uma síntese a cada pedido)
  if (req.headers["x-chave"] !== CHAVE) {
    dbg(`recusado ${rota}: chave inválida`);
    return responder(res, 401, { erro: "chave inválida" });
  }

  try {
    if (rota === "/saude") {
      // o diagnóstico do Piper é o do boot (ou o refeito por `?forcar=1`, que o
      // `&tts estado` pede) — o /saude comum não roda síntese nenhuma
      const forcar = url.searchParams.get("forcar") === "1";
      const [piper, conexoes] = await Promise.all([tts.diagnostico({ forcar }), voz.estado()]);
      const ok = piper.ok;
      return responder(res, ok ? 200 : 503, {
        ok,
        versao: API_VERSAO,
        piper,
        efeitos: Object.keys(tts.EFEITOS),
        voz: conexoes,
        chaveExigida: !!CHAVE,
        debug: DEBUG,
      });
    }

    if (rota === "/efeitos") {
      return responder(res, 200, tts.EFEITOS);
    }

    if (rota === "/estado") {
      return responder(res, 200, await voz.estado());
    }

    if (rota === "/musica/fila") {
      const canal = url.searchParams.get("canal") || musica.canalAtivo();
      if (!canal) return responder(res, 200, { atual: null, fila: [], total: 0 });
      return responder(res, 200, { canal, ...musica.fila(canal) });
    }

    if (req.method !== "POST") return responder(res, 404, { erro: "rota desconhecida" });
    const corpo = await lerCorpo(req);

    if (rota.startsWith("/musica/")) {
      const canal = corpo.canal || musica.canalAtivo();
      if (!canal) return responder(res, 400, { erro: "não estou em nenhuma call — entre numa call e use `&entrar` primeiro." });
      const acao = rota.slice("/musica/".length);
      let r;
      if (acao === "tocar") r = await musica.tocar(canal, corpo.consulta, { prioridade: Number(corpo.prioridade) || 0 });
      else if (acao === "pausar") r = await musica.pausar(canal);
      else if (acao === "retomar") r = await musica.retomar(canal);
      else if (acao === "pular") r = await musica.pular(canal);
      else if (acao === "parar") r = await musica.parar(canal);
      else if (acao === "volume") r = await musica.volume(canal, corpo.valor);
      else if (acao === "loop") r = musica.loop(canal, corpo.modo);
      else return responder(res, 404, { erro: "ação de música desconhecida" });
      return responder(res, r?.erro ? 400 : 200, { canal, ...r });
    }

    if (rota === "/entrar") {
      const { canalVoz, serverId, servidores } = corpo;
      if (!canalVoz) return responder(res, 400, { erro: "falta canalVoz" });
      const r = await voz.entrar(canalVoz, serverId ?? null, servidores ?? null);
      return responder(res, r.ok ? 200 : 502, r);
    }

    if (rota === "/entrar-com-token") {
      const { canalVoz, token, node, url, serverId } = corpo;
      if (!canalVoz) return responder(res, 400, { erro: "falta canalVoz" });
      if (!token) return responder(res, 400, { erro: "falta token" });
      const r = await voz.entrarComToken(canalVoz, { token, node: node ?? null, url: url ?? null, serverId: serverId ?? null });
      return responder(res, r.ok ? 200 : 502, r);
    }

    if (rota === "/diagnostico") {
      const { canalVoz } = corpo;
      if (!canalVoz) return responder(res, 400, { erro: "falta canalVoz" });
      return responder(res, 200, await voz.diagnosticar(canalVoz));
    }

    if (rota === "/destravar") {
      const { canalVoz, serverId, servidores } = corpo;
      if (!canalVoz) return responder(res, 400, { erro: "falta canalVoz" });
      const r = await voz.forcarSaida(canalVoz, serverId ?? null, servidores ?? []);
      return responder(res, 200, r);
    }

    if (rota === "/reiniciar") {
      const r = await voz.reiniciar();
      return responder(res, r.ok ? 200 : 502, r);
    }

    if (rota === "/sair") {
      const r = await voz.sair(corpo.canalVoz ?? null);
      return responder(res, 200, r);
    }

    if (rota === "/falar") {
      const { canalVoz, texto, voz: vozNome, efeito, tom, autoEntrar } = corpo;
      if (!canalVoz) return responder(res, 400, { erro: "falta canalVoz" });
      if (!texto || !String(texto).trim()) return responder(res, 400, { erro: "falta texto" });

      const t0 = Date.now();
      const r = await voz.falar(canalVoz, String(texto), vozNome, efeito, tom, autoEntrar !== false);
      dbg(`falar em ${canalVoz}: ${Date.now() - t0}ms — ${r.ok ? "ok" : r.erro}`);
      return responder(res, r.ok ? 200 : 502, { ...r, ms: Date.now() - t0 });
    }

    return responder(res, 404, { erro: "rota desconhecida" });
  } catch (e) {
    erro(rota, e?.message ?? e);
    // só a frase escrita para o usuário (e.publico) sai; o resto fica no log
    return responder(res, 500, { erro: e?.publico ? e.message : "erro interno do serviço de voz" });
  }
});

// 127.0.0.1 por padrão; a voz noutra máquina diz o endereço em SERVICO_HOST
servidor.listen(PORTA, process.env.SERVICO_HOST || "127.0.0.1", () => {
  log(`judy-voz ouvindo na porta ${PORTA} (chave exigida)`);
  tts.diagnostico({ forcar: true }).then((d) => {
    log(`Piper: ${d.ok ? `ok — voz ${d.vozAtual}` : `INDISPONÍVEL — ${d.erro}`}`);
    if (!d.ok) log("   rode: bash scripts/instalar-piper.sh");
  });
  voz.iniciar().then((r) => log(`revoice: ${r.ok ? "pronto" : `INDISPONÍVEL — ${r.erro}`}`));
});

// (31 out 2026, P1, Regra do Reparo) Exceção não tratada deixa o processo num estado
// que ninguém conhece (uma call meio aberta, um player sem dono): registra e SAI — o
// iniciar.js (ou o systemd, na máquina de fora) relança limpo.
process.on("uncaughtException", (e) => {
  erro("exceção não tratada — saindo para o iniciar.js relançar:", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  erro("promessa rejeitada sem tratamento (o serviço CONTINUA de pé):", e?.message ?? e);
  if (DEBUG) console.error(e);
});

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, async () => {
    log(`recebido ${sinal} — saindo das calls`);
    try { await voz.sair(null); } catch {}
    process.exit(0);
  });
}
