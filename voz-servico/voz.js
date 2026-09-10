
process.env.LIVEKIT_LOG_LEVEL = process.env.LIVEKIT_LOG_LEVEL
  || (process.env.VOZ_DEBUG === "1" ? "debug" : "warn");

{
  const original = console.log;
  const RUIDO = /^(Ffmpeg process started:|ffmpeg finished)/;
  console.log = (...a) => {
    if (process.env.VOZ_DEBUG !== "1" && typeof a[0] === "string" && RUIDO.test(a[0])) return;
    original(...a);
  };
}

import { createRequire } from "node:module";
import fs from "node:fs";
import * as tts from "./tts.js";

const require = createRequire(import.meta.url);
const DEBUG = process.env.VOZ_DEBUG === "1";
const dbg = (...a) => { if (DEBUG) console.log(new Date().toISOString(), "[VOZ][debug]", ...a); };
const log = (...a) => console.log(new Date().toISOString(), "[VOZ]", ...a);

const TOKEN = process.env.BOT_TOKEN || "";
const ESPERA_JOIN_MS = Number(process.env.VOZ_JOIN_TIMEOUT_MS || 25_000);
const ENTRAR_MAX_MS = Number(process.env.VOZ_ENTRAR_TIMEOUT_MS || 20_000);

let Revoice = null, MediaPlayer = null, revoice = null, erroCarga = null;
const conexoes = new Map();   // canalVoz → { connection, entrouEm, falas, fila:[], ocupado }

const entrando = new Map();   // canalVoz → Promise<{ ok, … }>
const jaTentouDestravar = new Set();

function comLimite(promessa, ms, ondeParou, aoChegarTarde = null) {
  let t, estourou = false;
  const p = Promise.resolve(promessa);
  if (aoChegarTarde) {
    p.then((v) => { if (estourou) aoChegarTarde(v); },
           () => { /* falhou tarde: nada a limpar */ });
  }
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise((_, rej) => {
      t = setTimeout(() => { estourou = true; rej(new Error(ondeParou)); }, ms);
    }),
  ]);
}

// Derruba uma conexão de qualquer jeito que a lib permitir.
async function derrubar(connection) {
  try { connection?.leave?.(); } catch {}
  try { await connection?.room?.disconnect?.(); } catch {}
}

export async function iniciar() {
  if (typeof globalThis.navigator !== "undefined") {
    erroCarga = "rode o serviço com --no-experimental-global-navigator (Node 21.1+); sem a flag o join falha com \"device not supported\"";
    log(`ERRO: ${erroCarga}`);
    return { ok: false, erro: erroCarga };
  }
  if (!TOKEN) {
    erroCarga = "falta BOT_TOKEN no .env do voz-servico";
    return { ok: false, erro: erroCarga };
  }
  try {
    ({ Revoice, MediaPlayer } = require("revoice.js"));
    revoice = new Revoice(TOKEN);
    erroCarga = null;
    return { ok: true };
  } catch (e) {
    erroCarga = `revoice.js não carregou: ${e?.message ?? e}`;
    log(`ERRO: ${erroCarga}`);
    return { ok: false, erro: erroCarga };
  }
}

function jaConectado(connection) {
  try {
    const room = connection?.room;
    if (!room) return false;
    const v = room.isConnected;
    return typeof v === "function" ? !!v.call(room) : !!v;
  } catch { return false; }
}

// Traduz o erro da API do Stoat em algo que aponta a solução.
function explicar(e) {
  const st = e?.response?.status;
  const msg = e?.response?.data?.type ?? e?.message ?? String(e);
  if (st === 401) return "token do bot inválido ou expirado (401)";
  if (st === 403) return "o bot não tem permissão nesse canal (403) — precisa de Connect e Speak";
  if (st === 404) return "canal não encontrado (404) — confira o ID e se o bot está no servidor";
  if (st === 400) return "o Stoat recusou (400) — o ID pode ser de um canal de TEXTO, não de voz";
  if (/device not supported/i.test(msg)) return "falta a flag --no-experimental-global-navigator no Node";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(msg)) return `sem acesso de rede à API do Stoat (${msg})`;
  return msg;
}

export async function entrar(canalVoz, serverId = null, servidores = null, credenciais = null) {
  ultimoServidor = serverId ?? ultimoServidor;
  if (Array.isArray(servidores) && servidores.length) servidoresConhecidos = servidores;
  if (erroCarga) return { ok: false, erro: erroCarga };
  if (conexoes.has(canalVoz)) return { ok: true, jaEstava: true, canalVoz };

  const emVoo = entrando.get(canalVoz);
  if (emVoo) { dbg(`entrada em ${canalVoz} já em andamento — aguardando a mesma`); return emVoo; }

  const tarefa = entrarDeFato(canalVoz, serverId, credenciais).finally(() => entrando.delete(canalVoz));
  entrando.set(canalVoz, tarefa);
  return tarefa;
}

export async function entrarComToken(canalVoz, { token, node = null, url = null, serverId = null } = {}) {
  if (!token) return { ok: false, erro: "falta o token" };
  const destino = url || await urlDoNode(node);
  if (!destino) return { ok: false, erro: `não sei a URL do node ${node ?? "(nenhum)"} — a API não o anunciou em features.livekit.nodes` };
  return entrar(canalVoz, serverId, null, { token, url: destino, node });
}

async function entrarDeFato(canalVoz, serverId = null, credenciais = null) {
  const t0 = Date.now();
  const marcos = [];
  const marco = (nome) => { marcos.push({ nome, ms: Date.now() - t0 }); dbg(`  ⏱ ${nome} em ${Date.now() - t0}ms`); };
  ultimosMarcos = marcos;
  try {
    dbg(`entrando em ${canalVoz}…`);
    marco("inicio");

    if (!credenciais && !conexoes.size && (serverId ?? ultimoServidor)) {
      const previa = await forcarSaida(canalVoz, serverId ?? ultimoServidor, servidoresConhecidos).catch(() => null);
      marco(previa?.ok ? "residuo-limpo" : "sem-residuo");
    }

    const outras = [...conexoes.keys()].filter((id) => id !== canalVoz);
    if (outras.length) {
      log(`já estou em ${outras.join(", ")} — saindo antes de entrar em ${canalVoz}`);
      await sair(null);
      marco("saiu-da-call-anterior");
    }
    const abriu = credenciais ? null : await abrirSalaSePreciso(canalVoz);
    if (abriu?.node) marco(`sala-aberta(${abriu.node})`);
    if (abriu?.recusa === "AlreadyConnected") {
      marco("sala-recusou(AlreadyConnected)");
      throw new Error("AlreadyConnected: o Stoat me registra como já estando nesta call");
    }

    marco(credenciais ? `chamando-revoice.join(token-do-mover:${credenciais.node ?? "?"})` : "chamando-revoice.join");
    const connection = await comLimite(
      credenciais ? joinComCredenciais(canalVoz, credenciais) : revoice.join(canalVoz),
      ENTRAR_MAX_MS,
      `${ENTRAR_MAX_MS / 1000}s sem resposta ao pedido de entrar na call (etapa: join)`,
      (tardia) => {
        marco("join-chegou-tarde");
        // Chegou depois de eu desistir: fecha, senão vira sala fantasma.
        log(`entrada em ${canalVoz} chegou TARDE — derrubando a conexão órfã`);
        derrubar(tardia);
      },
    );

    marco("join-retornou");

    await new Promise((res, rej) => {
      const t = setTimeout(
        () => rej(new Error(`${ESPERA_JOIN_MS / 1000}s sem a sala confirmar a entrada (etapa: sala)`)),
        ESPERA_JOIN_MS
      );
      try {
        if (jaConectado(connection)) { clearTimeout(t); return res(); }
      } catch { /* segue esperando o evento */ }
      connection.once("join", () => { clearTimeout(t); res(); });
      connection.once("error", (e) => { clearTimeout(t); rej(e); });
    });

    marco("sala-confirmada");

    const media = new MediaPlayer();
    await connection.play(media);
    await esperarPublicacao(connection, media);

    marco("faixa-publicada");
    conexoes.set(canalVoz, {
      connection, media, entrouEm: Date.now(), falas: 0, fila: [], ocupado: false,
    });
    log(`entrou na call ${canalVoz} (faixa de áudio publicada)`);
    return { ok: true, canalVoz };
  } catch (e) {
    const erro = explicar(e);
    log(`falha ao entrar em ${canalVoz}: ${erro}`);
    marcos.push({ nome: "falhou", ms: Date.now() - t0 });
    ultimaFalha = { canalVoz, erro, quando: Date.now(), marcos: [...marcos] };

    if (/sem resposta ao pedido de entrar/i.test(String(e?.message ?? e))) {
      log(`entrada travou em ${canalVoz} — limpando o registro que ela deixou`);
      const limpeza = await forcarSaida(canalVoz, serverId ?? ultimoServidor, servidoresConhecidos);
      marcos.push({ nome: limpeza.ok ? "registro-limpo" : "limpeza-falhou", ms: Date.now() - t0 });
      ultimaFalha.marcos = [...marcos];
    }

    if (/AlreadyConnected/i.test(String(e?.message ?? e)) && !jaTentouDestravar.has(canalVoz)) {
      jaTentouDestravar.add(canalVoz);
      const sid = serverId ?? ultimoServidor;

      log(`AlreadyConnected em ${canalVoz} — tentando me mover para lá`);
      const m = await moverPara(canalVoz, sid);
      marcos.push({ nome: m.ok ? "movida" : "mover-falhou", ms: Date.now() - t0 });

      // 2ª: desconectar de vez e entrar do zero (funciona entre servidores).
      const f = m.ok ? { ok: true } : await forcarSaida(canalVoz, sid, servidoresConhecidos);
      if (!m.ok) marcos.push({ nome: f.ok ? "destravado" : "destravar-falhou", ms: Date.now() - t0 });

      if (f.ok) {
        const r2 = await entrarDeFato(canalVoz, sid);
        jaTentouDestravar.delete(canalVoz);
        return r2;
      }
    }
    jaTentouDestravar.delete(canalVoz);
    try { conexoes.get(canalVoz)?.connection?.leave?.(); } catch {}
    conexoes.delete(canalVoz);
    return { ok: false, erro };
  }
}

export async function sair(canalVoz = null) {
  const alvos = canalVoz ? [canalVoz] : [...conexoes.keys()];
  const saiu = [];
  for (const id of alvos) {
    const c = conexoes.get(id);
    if (!c) continue;
    c.fila.length = 0;
    try { c.media?.destroy?.(); } catch {}
    try { c.connection.leave?.(); } catch {}
    try { await c.connection?.room?.disconnect?.(); } catch {}
    conexoes.delete(id);
    saiu.push(id);
    log(`saiu da call ${id}`);
  }
  return { ok: true, saiu };
}

function joinComCredenciais(canalVoz, { token, url }) {
  const api = revoice.api;
  const original = api.post;
  const alvo = `/channels/${canalVoz}/join_call`;
  api.post = async function (rota, ...resto) {
    if (rota === alvo) { api.post = original; return { token, url }; }
    return original.call(this, rota, ...resto);
  };
  return revoice.join(canalVoz).finally(() => { if (api.post !== original) api.post = original; });
}

// URL pública de um node, pelo nome (`features.livekit.nodes[].public_url`).
async function urlDoNode(node) {
  if (!node) return process.env.VOZ_LIVEKIT_URL || null;
  const lista = await nodesDisponiveis(true);
  return lista.find((n) => n.name === node)?.public_url
    ?? process.env.VOZ_LIVEKIT_URL ?? null;
}

let nodesCache = null;   // [{ name, public_url }]
async function nodesDisponiveis(completo = false) {
  const entregar = (l) => completo ? l : l.map((n) => n.name);
  if (nodesCache?.length) return entregar(nodesCache);
  const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
  try {
    const r = await comLimite(fetch(`${API}/`), 8000, "8s sem resposta da raiz da API");
    const j = await r.json().catch(() => null);
    const lista = (j?.features?.livekit?.nodes ?? [])
      .filter((n) => n?.name)
      .map((n) => ({ name: n.name, public_url: n.public_url ?? n.url ?? null }));
    if (lista.length) nodesCache = lista;
    log(`nodes de voz disponíveis: ${lista.map((n) => n.name).join(", ") || "(nenhum)"}`);
    return entregar(lista);
  } catch (e) {
    console.warn("[VOZ] não consegui listar os nodes:", e?.message ?? e);
    return [];
  }
}

// O node preferido: o que o .env mandar, senão o primeiro anunciado pela API.
export async function nodePreferido() {
  if (process.env.VOZ_NODE_LIVEKIT) return process.env.VOZ_NODE_LIVEKIT;
  const lista = await nodesDisponiveis();
  return lista[0] ?? null;
}

export async function forcarSaida(canalVoz, serverId = null, servidores = []) {
  const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
  const passos = [];
  const bater = async (metodo, rota, corpo = null) => {
    const t = Date.now();
    try {
      const r = await comLimite(fetch(`${API}${rota}`, {
        method: metodo,
        headers: { "X-Bot-Token": TOKEN, ...(corpo ? { "Content-Type": "application/json" } : {}) },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      }), 8000, `8s sem resposta de ${rota}`);
      const txt = await r.text().catch(() => "");
      let json = null;
      try { json = JSON.parse(txt); } catch {}
      return { metodo, rota, ok: r.ok, status: r.status, ms: Date.now() - t, corpo: txt.slice(0, 160), json };
    } catch (e) {
      return { metodo, rota, ok: false, ms: Date.now() - t, erro: e?.message ?? String(e) };
    }
  };

  const meuId = await meuIdDeBot(bater, passos);

  const alvos = [serverId, ...servidores].filter((x, i, a) => x && a.indexOf(x) === i);
  if (!meuId) {
    passos.push({ rota: "(auto-desconexão)", ok: false, erro: "não descobri meu próprio id" });
    return { ok: false, passos };
  }
  if (!alvos.length) {
    passos.push({ rota: "(auto-desconexão)", ok: false, erro: "o serviço não recebeu nenhum serverId" });
    return { ok: false, passos };
  }

  let aceitos = 0;
  for (const sid of alvos) {
    const r = await bater("PATCH", `/servers/${sid}/members/${meuId}`, { remove: ["VoiceChannel"] });
    passos.push(r);
    if (!r.ok) continue;
    aceitos++;
    log(`pedido de desconexão aceito em ${sid}`);

  }
  if (aceitos) return { ok: true, via: "PATCH members remove VoiceChannel", passos, aceitos };
  return { ok: false, passos, aindaPreso: true };
}

// O próprio id do bot, descoberto uma vez e lembrado.
let meuIdCache = null;
async function meuIdDeBot(bater, passos) {
  if (meuIdCache) return meuIdCache;
  const me = await bater("GET", "/users/@me");
  passos.push({ ...me, json: undefined });
  meuIdCache = me.json?._id ?? me.json?.id ?? null;
  return meuIdCache;
}

export async function moverPara(canalVoz, serverId) {
  const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
  const passos = [];
  const bater = async (metodo, rota, corpo = null) => {
    const t = Date.now();
    try {
      const r = await comLimite(fetch(`${API}${rota}`, {
        method: metodo,
        headers: { "X-Bot-Token": TOKEN, ...(corpo ? { "Content-Type": "application/json" } : {}) },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      }), 8000, `8s sem resposta de ${rota}`);
      const txt = await r.text().catch(() => "");
      let json = null; try { json = JSON.parse(txt); } catch {}
      return { metodo, rota, ok: r.ok, status: r.status, ms: Date.now() - t, corpo: txt.slice(0, 160), json };
    } catch (e) {
      return { metodo, rota, ok: false, ms: Date.now() - t, erro: e?.message ?? String(e) };
    }
  };
  const meuId = await meuIdDeBot(bater, passos);
  if (!meuId || !serverId) return { ok: false, passos };
  const r = await bater("PATCH", `/servers/${serverId}/members/${meuId}`, { voice_channel: canalVoz });
  passos.push(r);
  if (r.ok) log(`movida para a call ${canalVoz}`);
  return { ok: r.ok, passos };
}

async function abrirSalaSePreciso(canalVoz) {
  const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
  const node = await nodePreferido();
  if (!node) return null;
  try {
    const r = await comLimite(fetch(`${API}/channels/${canalVoz}/join_call`, {
      method: "POST",
      headers: { "X-Bot-Token": TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ node }),
    }), 10_000, "10s sem resposta ao abrir a sala");
    if (r.ok) { dbg(`sala aberta no node ${node}`); return { node }; }
    const txt = await r.text().catch(() => "");
    dbg(`abrir sala: HTTP ${r.status} ${txt.slice(0, 120)}`);
    return { recusa: /AlreadyConnected/.test(txt) ? "AlreadyConnected" : (txt.match(/"type"\s*:\s*"(\w+)"/)?.[1] ?? `HTTP ${r.status}`) };
  } catch (e) {
    console.warn("[VOZ] falha ao abrir a sala:", e?.message ?? e);
    return null;
  }
}

export async function reiniciar() {
  log("reinício a quente pedido");
  try { await sair(null); } catch {}
  entrando.clear();
  for (const c of conexoes.values()) await derrubar(c.connection);
  conexoes.clear();
  ultimaFalha = null;
  revoice = null;
  erroCarga = null;
  const r = await iniciar();
  log(`reinício: ${r.ok ? "ok" : `falhou — ${r.erro}`}`);
  return r;
}

let ultimaFalha = null;
let ultimosMarcos = null;
let ultimoServidor = null;
let servidoresConhecidos = [];

export async function diagnosticar(canalVoz) {
  const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
  const etapas = [];

  const bater = async (rota, metodo = "GET", payload = null) => {
    const t = Date.now();
    try {
      const r = await comLimite(fetch(`${API}${rota}`, {
        method: metodo,
        headers: {
          "X-Bot-Token": TOKEN,
          ...(metodo === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(metodo === "POST" ? { body: JSON.stringify(payload ?? {}) } : {}),
      }), 10_000, `10s sem resposta de ${rota}`);
      const corpo = await r.text().catch(() => "");
      let json = null;
      try { json = JSON.parse(corpo); } catch {}
      const ehHtml = /^\s*<(!doctype|html)/i.test(corpo);
      return { ok: r.ok, ms: Date.now() - t, status: r.status, json, corpo, ehHtml };
    } catch (e) {
      return { ok: false, ms: Date.now() - t, erro: e?.message ?? String(e) };
    }
  };

  const descrever = (r) => {
    if (r.erro) return r.erro;
    if (r.ehHtml) return "resposta em HTML, não JSON — quem respondeu foi um proxy/CDN, não a API";
    if (r.json && !r.ok) return `${r.json.type ?? ""} ${JSON.stringify(r.json).slice(0, 120)}`.trim();
    return r.corpo ? r.corpo.slice(0, 150) : "(vazio)";
  };

  const me = await bater("/users/@me");
  etapas.push({
    etapa: "api+token", ok: me.ok, ms: me.ms, status: me.status,
    detalhe: me.ok ? `autenticado como ${me.json?.username ?? "?"}` : descrever(me),
  });

  const ch = await bater(`/channels/${canalVoz}`);
  const tipo = ch.json?.channel_type ?? ch.json?.type ?? null;
  etapas.push({
    etapa: "canal", ok: ch.ok, ms: ch.ms, status: ch.status,
    detalhe: ch.ok ? `${ch.json?.name ?? "?"} · tipo ${tipo ?? "(não informado)"}` : descrever(ch),
  });

  const node = await nodePreferido();
  etapas.push({ etapa: "node", ok: !!node, ms: 0,
    detalhe: node ? `usando \`${node}\`` : "a API não anunciou nenhum node de voz" });
  const jc = await bater(`/channels/${canalVoz}/join_call`, "POST", node ? { node } : null);
  etapas.push({
    etapa: "join_call", ok: jc.ok, ms: jc.ms, status: jc.status,
    // NUNCA devolver o token de voz: isto vai parar num chat.
    detalhe: jc.ok ? `campos: ${Object.keys(jc.json ?? {}).join(", ") || "(vazio)"}` : descrever(jc),
  });

  // ── 4. Alcance do LiveKit ──
  const urlLk = jc.json?.url ?? jc.json?.livekit?.url ?? jc.json?.node ?? null;
  if (urlLk) {
    const t1 = Date.now();
    try {
      const u = new URL(String(urlLk).replace(/^ws/, "http"));
      const porta = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
      const net = await import("node:net");
      await new Promise((res, rej) => {
        const sock = net.connect({ host: u.hostname, port: porta });
        const t = setTimeout(() => { sock.destroy(); rej(new Error("8s sem abrir o TCP")); }, 8000);
        sock.once("connect", () => { clearTimeout(t); sock.end(); res(); });
        sock.once("error", (err) => { clearTimeout(t); rej(err); });
      });
      etapas.push({ etapa: "livekit-tcp", ok: true, ms: Date.now() - t1, detalhe: `${u.hostname}:${porta} alcançável` });
    } catch (e) {
      etapas.push({ etapa: "livekit-tcp", ok: false, ms: Date.now() - t1, detalhe: e?.message ?? String(e) });
    }
  } else {
    etapas.push({ etapa: "livekit-tcp", ok: null, ms: 0, detalhe: "o join_call não devolveu endereço do LiveKit" });
  }

  return {
    ok: etapas.every((e) => e.ok !== false),
    canalVoz,
    etapas,
    naCall: conexoes.has(canalVoz),
    entrandoAgora: entrando.has(canalVoz),
    ultimaFalha,
    marcos: ultimosMarcos,
    flagNode: typeof globalThis.navigator === "undefined" ? "ok" : "FALTA --no-experimental-global-navigator",
    debug: process.env.VOZ_DEBUG === "1",
  };
}

export async function estado() {
  return {
    pronto: !erroCarga,
    erro: erroCarga,
    conexoes: [...conexoes.entries()].map(([id, c]) => ({
      canalVoz: id,
      haMs: Date.now() - c.entrouEm,
      falas: c.falas,
      naFila: c.fila.length,
      falando: c.ocupado,
    })),
  };
}

async function esperarPublicacao(connection, media, limiteMs = 4000) {
  const inicio = Date.now();
  const trackId = media?.track?.sid ?? media?.track?.name ?? null;

  while (Date.now() - inicio < limiteMs) {
    try {
      const pubs = connection?.room?.localParticipant?.trackPublications;
      if (pubs) {
        const lista = typeof pubs.values === "function" ? [...pubs.values()] : Object.values(pubs);
        if (lista.length > 0) {
          if (!trackId || lista.some((p) => p?.sid === trackId || p?.name === trackId || p?.track === media.track)) {
            dbg(`faixa publicada em ${Date.now() - inicio}ms`);
            return true;
          }
        }
      }
    } catch { /* forma da API mudou — cai no tempo mínimo abaixo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  dbg("não confirmei a publicação da faixa; tocando mesmo assim");
  return false;
}

async function processarFila(canalVoz) {
  let c = conexoes.get(canalVoz);
  if (!c || c.ocupado) return;
  const item = c.fila.shift();
  if (!item) return;

  c.ocupado = true;
  try {
    let { arquivo, voz } = await tts.sintetizar(item.texto, item.voz);
    const temEfeito = item.efeito && item.efeito !== "nenhum";
    const temTom = Number.isFinite(Number(item.tom)) && Math.abs(Number(item.tom) - 1) > 0.001;
    if (temEfeito || temTom) {
      arquivo = await tts.aplicarEfeito(arquivo, temEfeito ? item.efeito : null, item.tom);
    }
    dbg(`falando em ${canalVoz} (voz ${voz}): "${item.texto.slice(0, 60)}"`);

    if (!jaConectado(c.connection)) {
      log(`sala de ${canalVoz} caiu — reconectando antes de falar`);
      conexoes.delete(canalVoz);
      const r = await entrar(canalVoz);
      if (!r.ok) throw new Error(`reconexão falhou: ${r.erro}`);
      const novo = conexoes.get(canalVoz);   // já vem com player publicado
      novo.fila = c.fila; novo.falas = c.falas;
      c = novo;
    }

    // Reusa o player já publicado no join: só troca o arquivo tocado.
    const media = c.media;
    if (!media) throw new Error("conexão sem player publicado — reentre na call");

    const t0 = Date.now();
    let comecou = false, quadros = 0;
    media.on?.("startplay", () => { comecou = true; dbg(`  ▶ começou a tocar em ${Date.now() - t0}ms`); });
    media.on?.("buffer", () => dbg("  ⏳ bufferizando"));
    media.on?.("error", (e) => log(`  ✗ erro no player: ${e?.message ?? e}`));

    media.playStream(fs.createReadStream(arquivo));

    await new Promise((res) => {
      let pronto = false;
      const fim = () => { if (!pronto) { pronto = true; res(); } };
      media.once?.("finish", fim);
      media.once?.("end", fim);
      setTimeout(fim, Number(process.env.VOZ_FALA_MAX_MS || 45_000));
    });

    quadros = media.playedOutSamples ?? 0;
    const dur = Date.now() - t0;
    if (!comecou) {
      log(`  ⚠ a fala terminou sem nunca começar a tocar (${dur}ms) — áudio gerado mas não reproduzido`);
    } else {
      dbg(`  ✓ fala concluída em ${dur}ms (${quadros} amostras)`);
    }

    try { media.stop?.(); } catch {}
    try { fs.unlinkSync(arquivo); } catch {}
    c.falas++;
  } catch (e) {
    log(`erro ao falar em ${canalVoz}: ${e?.message ?? e}`);
    item.reject?.(e);
  } finally {
    c.ocupado = false;
    if (c.fila.length) setImmediate(() => processarFila(canalVoz));
  }
}

export async function falar(canalVoz, texto, vozNome = null, efeito = null, tom = null, autoEntrar = true) {
  if (erroCarga) return { ok: false, erro: erroCarga };

  if (!conexoes.has(canalVoz)) {
    if (!autoEntrar) return { ok: false, erro: "fora da call", foraDaCall: true };
    const r = await entrar(canalVoz);
    if (!r.ok) return r;
  }

  const c = conexoes.get(canalVoz);
  const MAX_FILA = Number(process.env.VOZ_MAX_FILA || 5);
  if (c.fila.length >= MAX_FILA) {
    return { ok: false, erro: `fila cheia (${MAX_FILA}) — espere as falas anteriores terminarem` };
  }

  c.fila.push({ texto, voz: vozNome, efeito, tom });
  processarFila(canalVoz);
  return { ok: true, naFila: c.fila.length, falando: c.ocupado };
}

let saindo = false;
async function desligarLimpo(sinal) {
  if (saindo) return;
  saindo = true;
  log(`${sinal}: saindo das calls antes de encerrar…`);
  try { await Promise.race([sair(null), new Promise((r) => setTimeout(r, 4000))]); } catch {}
  log("encerrado");
  process.exit(0);
}
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => { desligarLimpo(sinal); });
}
