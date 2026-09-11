// Música nas calls: YouTube, SoundCloud e Spotify, com fila por canal e
// ducking automático (a música abaixa enquanto o TTS fala e volta depois).
//
// Arquitetura (aprendida do remix-bot, o player de referência do Stoat):
// - o áudio vem do yt-dlp em streaming (`-f bestaudio -o -`) direto para um
//   SEGUNDO MediaPlayer pendurado na MESMA conexão revoice do TTS — LiveKit
//   é multi-trilha, então voz e música coexistem;
// - YouTube e SoundCloud (links, playlists e busca por texto) passam pelo
//   yt-dlp; Spotify não entrega áudio, então: faixa avulsa resolve SEM chave
//   pelo endpoint público oEmbed (título + artista → busca no YouTube), e
//   playlist/álbum usa a API oficial com SPOTIFY_ID/SPOTIFY_SECRET (.env);
// - o fim de faixa (`finish`/`end` do MediaPlayer) puxa a próxima da fila.

import { spawn } from "node:child_process";
import * as voz from "./voz.js";

const YTDLP = process.env.YTDLP_BIN || "yt-dlp";
// O YouTube devolve 403 para o cliente web do yt-dlp; os clientes android/tv
// passam (mesma manobra do remix-bot). Ajustável por env se o YouTube mudar.
const CLIENTES_YT = ["--extractor-args", `youtube:player_client=${process.env.MUSICA_YT_CLIENTES || "android,tv"}`];
const DUCK = Math.min(1, Math.max(0.05, Number(process.env.MUSICA_DUCK || 0.2)));
const MAX_FILA = Number(process.env.MUSICA_MAX_FILA || 200);
const SPOTIFY_ID = process.env.SPOTIFY_ID || "";
const SPOTIFY_SECRET = process.env.SPOTIFY_SECRET || "";
const DEBUG = process.env.VOZ_DEBUG === "1";
const log = (...a) => console.log(new Date().toISOString(), "[MUSICA]", ...a);
const dbg = (...a) => { if (DEBUG) log(...a); };

// canalVoz → { fila:[], atual, volume, loop:"nao"|"faixa"|"fila", proc, trocando }
const estados = new Map();

function estadoDe(canalVoz) {
  if (!estados.has(canalVoz)) {
    estados.set(canalVoz, { fila: [], atual: null, volume: 1, loop: "nao", proc: null, trocando: false });
  }
  return estados.get(canalVoz);
}

// ── Classificação da consulta (puro, testável) ──────────────────────────────
export function classificar(consulta) {
  const t = String(consulta ?? "").trim();
  if (!t) return { tipo: "vazio" };
  const sp = spotifyInfoDeUrl(t);
  if (sp) return { tipo: `spotify-${sp.tipo}`, id: sp.id };
  if (/^https?:\/\//i.test(t)) return { tipo: "url", url: t };
  return { tipo: "busca", busca: t };
}

export function spotifyInfoDeUrl(url) {
  const m = String(url ?? "").match(
    /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album)\/([A-Za-z0-9]+)/i,
  );
  return m ? { tipo: m[1].toLowerCase(), id: m[2] } : null;
}

export function montarBusca(nome, artistas) {
  const arts = Array.isArray(artistas) ? artistas.filter(Boolean).join(" ") : String(artistas ?? "");
  return `${String(nome ?? "").trim()} ${arts.trim()}`.trim();
}

// ── yt-dlp: metadados e stream ──────────────────────────────────────────────
function ytdlpJson(alvo, { playlistOk = true } = {}) {
  return new Promise((res, rej) => {
    const args = ["-J", "--no-warnings", ...CLIENTES_YT, playlistOk ? "--flat-playlist" : "--no-playlist", alvo];
    const p = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    let fora = "", erro = "";
    p.stdout.on("data", (d) => (fora += d));
    p.stderr.on("data", (d) => (erro += d));
    p.on("error", (e) => rej(new Error(`yt-dlp indisponível (${e.message}) — a imagem tem o binário; confira YTDLP_BIN`)));
    p.on("close", (c) => {
      if (c !== 0) return rej(new Error(erro.trim().split("\n").pop() || `yt-dlp saiu com ${c}`));
      try { res(JSON.parse(fora)); } catch { rej(new Error("resposta do yt-dlp não é JSON")); }
    });
  });
}

function itemDeEntrada(e) {
  return {
    titulo: e.title || e.fulltitle || "(sem título)",
    url: e.webpage_url || e.url || null,
    duracao: Number(e.duration) || null,
    fonte: /soundcloud/i.test(e.extractor || e.ie_key || "") ? "soundcloud" : "youtube",
  };
}

async function resolverParaItens(consulta) {
  const c = classificar(consulta);
  if (c.tipo === "vazio") throw new Error("me diga um link (YouTube, SoundCloud, Spotify) ou o nome da música.");

  if (c.tipo === "spotify-track") {
    const busca = await spotifyFaixaSemChave(consulta);
    const j = await ytdlpJson(`ytsearch1:${busca}`);
    const e = j.entries?.[0];
    if (!e) throw new Error(`não achei "${busca}" no YouTube.`);
    return { itens: [{ ...itemDeEntrada(e), origem: "spotify" }], rotulo: null };
  }

  if (c.tipo === "spotify-playlist" || c.tipo === "spotify-album") {
    const { nome, faixas } = await spotifyColecao(c.tipo.replace("spotify-", ""), c.id);
    // resolução preguiçosa: cada faixa vira busca e só resolve na hora de tocar
    const itens = faixas.map((f) => ({ titulo: f.busca, url: null, busca: f.busca, duracao: f.duracao, fonte: "youtube", origem: "spotify" }));
    return { itens, rotulo: nome };
  }

  if (c.tipo === "url") {
    const j = await ytdlpJson(c.url);
    if (j._type === "playlist" && Array.isArray(j.entries)) {
      return { itens: j.entries.filter(Boolean).map(itemDeEntrada), rotulo: j.title || "playlist" };
    }
    return { itens: [itemDeEntrada(j)], rotulo: null };
  }

  const j = await ytdlpJson(`ytsearch1:${c.busca}`);
  const e = j.entries?.[0];
  if (!e) throw new Error(`não achei nada para "${c.busca}".`);
  return { itens: [itemDeEntrada(e)], rotulo: null };
}

// ── Spotify ─────────────────────────────────────────────────────────────────
async function spotifyFaixaSemChave(url) {
  // oEmbed é público e dispensa chave: devolve "Nome da faixa" + autor.
  const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`o Spotify não respondeu pelo link (HTTP ${r.status}).`);
  const j = await r.json();
  const busca = montarBusca(j.title, j.author_name);
  if (!busca) throw new Error("não consegui ler o título dessa faixa do Spotify.");
  return busca;
}

let tokenSpotify = { valor: null, expira: 0 };
async function spotifyToken() {
  if (!SPOTIFY_ID || !SPOTIFY_SECRET) {
    throw new Error("playlists/álbuns do Spotify precisam de SPOTIFY_ID e SPOTIFY_SECRET no .env (app grátis em developer.spotify.com). Faixas avulsas funcionam sem chave.");
  }
  if (tokenSpotify.valor && Date.now() < tokenSpotify.expira - 30_000) return tokenSpotify.valor;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`o Spotify recusou as credenciais (HTTP ${r.status}) — confira SPOTIFY_ID/SPOTIFY_SECRET.`);
  const j = await r.json();
  tokenSpotify = { valor: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenSpotify.valor;
}

async function spotifyColecao(tipo, id) {
  const token = await spotifyToken();
  const cab = { Authorization: `Bearer ${token}` };
  const base = "https://api.spotify.com/v1";
  const meta = await (await fetch(`${base}/${tipo}s/${id}`, { headers: cab })).json();
  const nome = meta.name || tipo;
  const faixas = [];
  let prox = `${base}/${tipo}s/${id}/tracks?limit=100`;
  while (prox && faixas.length < MAX_FILA) {
    const r = await fetch(prox, { headers: cab });
    if (!r.ok) throw new Error(`o Spotify recusou a leitura da ${tipo} (HTTP ${r.status}).`);
    const j = await r.json();
    for (const it of j.items ?? []) {
      const f = tipo === "playlist" ? it.track : it;   // playlist embrulha em .track
      if (!f?.name) continue;
      faixas.push({
        busca: montarBusca(f.name, (f.artists ?? []).map((a) => a.name)),
        duracao: f.duration_ms ? Math.round(f.duration_ms / 1000) : null,
      });
    }
    prox = j.next;
  }
  if (!faixas.length) throw new Error(`a ${tipo} veio vazia (privada?).`);
  return { nome, faixas };
}

// ── Player ──────────────────────────────────────────────────────────────────
async function garantirPlayer(canalVoz) {
  const media = await voz.criarPlayerExtra(canalVoz, "musica");
  return media;
}

async function tocarProxima(canalVoz) {
  const st = estadoDe(canalVoz);
  if (st.trocando) return;
  st.trocando = true;
  try {
    let item = null;
    if (st.loop === "faixa" && st.atual) item = st.atual;
    else {
      if (st.loop === "fila" && st.atual) st.fila.push(st.atual);
      item = st.fila.shift() ?? null;
    }
    st.atual = item;
    if (!item) { dbg(`${canalVoz}: fila acabou`); pararStream(st); return; }

    if (!item.url && item.busca) {   // faixa do Spotify resolvida na hora
      try {
        const j = await ytdlpJson(`ytsearch1:${item.busca}`);
        const e = j.entries?.[0];
        if (!e) throw new Error("sem resultado");
        Object.assign(item, itemDeEntrada(e), { titulo: item.titulo });
      } catch (e) {
        log(`não resolvi "${item.busca}" (${e.message}) — pulando`);
        st.trocando = false;
        return tocarProxima(canalVoz);
      }
    }

    const media = await garantirPlayer(canalVoz);
    pararStream(st);
    const proc = spawn(YTDLP, ["-f", "bestaudio/best", ...CLIENTES_YT, "--no-playlist", "-o", "-", "--quiet", "--no-warnings", item.url],
      { stdio: ["ignore", "pipe", "pipe"] });
    st.proc = proc;
    let erroTxt = "";
    proc.stderr.on("data", (d) => (erroTxt += d));
    proc.on("error", (e) => log(`yt-dlp falhou: ${e.message}`));

    let fimDisparado = false;
    const fim = () => {
      if (fimDisparado) return;
      fimDisparado = true;
      dbg(`${canalVoz}: fim de "${item.titulo}"`);
      st.trocando = false;
      tocarProxima(canalVoz).catch((e) => log(`próxima falhou: ${e.message}`));
    };
    media.once?.("finish", fim);
    media.once?.("end", fim);
    proc.on("close", (c) => {
      if (c !== 0 && !fimDisparado) {
        log(`stream de "${item.titulo}" caiu (${erroTxt.trim().split("\n").pop() || c}) — pulando`);
        setTimeout(fim, 500);
      }
    });

    try { media.setVolume?.(st.volume); } catch {}
    media.playStream(proc.stdout);
    log(`${canalVoz}: ▶ ${item.titulo}`);
  } finally {
    st.trocando = false;
  }
}

function pararStream(st) {
  try { st.proc?.kill?.("SIGKILL"); } catch {}
  st.proc = null;
}

// ── API (usada pelas rotas do servidor) ─────────────────────────────────────
export async function tocar(canalVoz, consulta) {
  const st = estadoDe(canalVoz);
  const { itens, rotulo } = await resolverParaItens(consulta);
  const sobra = Math.max(0, MAX_FILA - st.fila.length);
  const entram = itens.slice(0, sobra);
  st.fila.push(...entram);
  const tocandoAgora = !st.atual;
  if (tocandoAgora) await tocarProxima(canalVoz);
  if (rotulo) return { mensagem: `${entram.length} faixa(s) de **${rotulo}** na fila${tocandoAgora ? " — começando" : ""}.`, itens: entram.length };
  const it = entram[0];
  return {
    mensagem: tocandoAgora
      ? `▶ Tocando **${it.titulo}**${duracaoTxt(it.duracao)}.`
      : `➕ **${it.titulo}**${duracaoTxt(it.duracao)} na fila (posição ${st.fila.length}).`,
    itens: entram.length,
  };
}

function duracaoTxt(s) {
  if (!s) return "";
  const m = Math.floor(s / 60), r = String(Math.floor(s % 60)).padStart(2, "0");
  return ` (${m}:${r})`;
}

export async function pausar(canalVoz) {
  const media = voz.playerExtraDe(canalVoz, "musica");
  if (!media || !estadoDe(canalVoz).atual) return { erro: "não há nada tocando." };
  media.pause?.();
  return { mensagem: "⏸ Pausado." };
}

export async function retomar(canalVoz) {
  const media = voz.playerExtraDe(canalVoz, "musica");
  if (!media || !estadoDe(canalVoz).atual) return { erro: "não há nada pausado." };
  media.resume?.();
  return { mensagem: "▶ Voltando." };
}

export async function pular(canalVoz) {
  const st = estadoDe(canalVoz);
  if (!st.atual) return { erro: "não há nada tocando." };
  const era = st.atual.titulo;
  if (st.loop === "faixa") st.loop = "nao";   // pular vence o loop de faixa
  st.atual = null;
  pararStream(st);
  await tocarProxima(canalVoz);
  return { mensagem: `⏭ Pulei **${era}**.${st.atual ? ` Agora: **${st.atual.titulo}**.` : " Fila vazia."}` };
}

export async function parar(canalVoz) {
  const st = estadoDe(canalVoz);
  const tinha = !!(st.atual || st.fila.length);
  st.fila = []; st.atual = null; st.loop = "nao";
  pararStream(st);
  try { voz.playerExtraDe(canalVoz, "musica")?.stop?.(); } catch {}
  return { mensagem: tinha ? "⏹ Parei e limpei a fila." : "já estava tudo parado." };
}

export function fila(canalVoz) {
  const st = estadoDe(canalVoz);
  return {
    atual: st.atual ? { titulo: st.atual.titulo, duracao: st.atual.duracao } : null,
    fila: st.fila.slice(0, 15).map((i, n) => ({ n: n + 1, titulo: i.titulo, duracao: i.duracao })),
    total: st.fila.length,
    loop: st.loop,
    volume: st.volume,
  };
}

export async function volume(canalVoz, v) {
  const st = estadoDe(canalVoz);
  const alvo = Math.min(2, Math.max(0, Number(v)));
  if (!Number.isFinite(alvo)) return { erro: "volume entre 0 e 200 (em %)." };
  st.volume = alvo;
  try { voz.playerExtraDe(canalVoz, "musica")?.setVolume?.(alvo); } catch {}
  return { mensagem: `🔊 Volume em ${Math.round(alvo * 100)}%.` };
}

export function loop(canalVoz, modo) {
  const st = estadoDe(canalVoz);
  const m = { nao: "nao", off: "nao", faixa: "faixa", musica: "faixa", fila: "fila", queue: "fila" }[String(modo ?? "").toLowerCase()];
  if (!m) return { erro: "modos: `nao`, `faixa` ou `fila`." };
  st.loop = m;
  return { mensagem: m === "nao" ? "🔁 Loop desligado." : `🔁 Loop de ${m} ligado.` };
}

export function canalAtivo() {
  for (const [canal, st] of estados) if (st.atual || st.fila.length) return canal;
  return voz.canaisConectados()[0] ?? null;
}

export function limparCanal(canalVoz) {
  const st = estados.get(canalVoz);
  if (st) pararStream(st);
  estados.delete(canalVoz);
}

// ── Ducking: registrado nos ganchos de fala do voz.js ───────────────────────
voz.ganchosDeFala.antes = (canalVoz) => {
  const st = estados.get(canalVoz);
  if (!st?.atual) return;
  try { voz.playerExtraDe(canalVoz, "musica")?.setVolume?.(st.volume * DUCK); dbg(`${canalVoz}: 🔉 duck`); } catch {}
};
voz.ganchosDeFala.depois = (canalVoz) => {
  const st = estados.get(canalVoz);
  if (!st?.atual) return;
  try { voz.playerExtraDe(canalVoz, "musica")?.setVolume?.(st.volume); dbg(`${canalVoz}: 🔊 volta`); } catch {}
};
