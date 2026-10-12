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
//
// O skip (11 out 2026 — "o skip da música não está funcionando"): o pular só
// matava o yt-dlp, mas o MediaPlayer do revoice (src/Media.js) decodifica com
// o ffmpeg MAIS RÁPIDO que o tempo real e guarda o áudio pronto em `chunks`.
// A faixa velha seguia tocando do buffer; a nova era só ENFILEIRADA atrás dela
// (o `playStream` não para o que já tocava). E quando o buffer velho acabava,
// o `finish` dele — e o `close` do yt-dlp morto — puxavam OUTRA faixa: o
// segundo skip fantasma. Agora cada faixa tem uma geração (eventos de faixa
// velha não fazem nada), e trocar de faixa corta o ffmpeg velho e esvazia o
// buffer (`stop()`) antes de tocar a próxima.

import { spawn } from "node:child_process";
import fs from "node:fs";
import * as voz from "./voz.js";

const YTDLP = process.env.YTDLP_BIN || "yt-dlp";
// O YouTube devolve 403 para o cliente web do yt-dlp; os clientes android/tv
// passam (mesma manobra do remix-bot). Ajustável por env se o YouTube mudar.
const CLIENTES_YT = ["--extractor-args", `youtube:player_client=${process.env.MUSICA_YT_CLIENTES || "android,tv"}`];
// Sem o extrator genérico: mesmo um link do YouTube que redirecione para
// fora (youtube.com/redirect?q=…) não faz o yt-dlp baixar outro site.
const SEM_GENERICO = ["--ies", "default,-generic"];
// Vídeo com restrição de idade só toca logado: o YouTube responde "Sign in to
// confirm your age". Com um cookies.txt de uma conta (de preferência uma
// conta só para isso) em MUSICA_COOKIES, o yt-dlp entra logado. Sem ele, a
// Judy procura outra versão da mesma música (12 out 2026).
const COOKIES = process.env.MUSICA_COOKIES || "";
const comCookies = () => (COOKIES && fs.existsSync(COOKIES) ? ["--cookies", COOKIES] : []);
const DUCK = Math.min(1, Math.max(0.05, Number(process.env.MUSICA_DUCK || 0.2)));
const MAX_FILA = Number(process.env.MUSICA_MAX_FILA || 200);
const SPOTIFY_ID = process.env.SPOTIFY_ID || "";
const SPOTIFY_SECRET = process.env.SPOTIFY_SECRET || "";
const DEBUG = process.env.VOZ_DEBUG === "1";
const log = (...a) => console.log(new Date().toISOString(), "[MUSICA]", ...a);
const dbg = (...a) => { if (DEBUG) log(...a); };

// canalVoz → { fila:[], atual, volume, loop:"nao"|"faixa"|"fila", proc, trocando, geracao, soltar }
const estados = new Map();

// O que vem de fora (processo e player) passa por aqui — os testes trocam por
// versões de mentira que imitam o revoice de verdade.
const deps = {
  spawn,
  criarPlayer: (canalVoz) => voz.criarPlayerExtra(canalVoz, "musica"),
  playerDe: (canalVoz) => voz.playerExtraDe(canalVoz, "musica"),
  esperaCorteMs: 1500,
  esperaInicioMs: Number(process.env.MUSICA_ESPERA_INICIO_MS || 20_000),   // até o áudio começar
};
export function _trocarDependencias(novas) { Object.assign(deps, novas); }

function estadoDe(canalVoz) {
  if (!estados.has(canalVoz)) {
    estados.set(canalVoz, { fila: [], atual: null, volume: 1, loop: "nao", proc: null, trocando: false, geracao: 0, soltar: null });
  }
  return estados.get(canalVoz);
}

// ── Classificação da consulta (puro, testável) ──────────────────────────────
// Link só de onde a música vem (12 out 2026). O yt-dlp tem um extrator
// "genérico" que baixa QUALQUER endereço: `&musica http://192.168.1.1/`
// fazia a máquina do bot sondar a rede de casa (e mostrava o <title> da
// página), e `&musica https://site-de-alguem/x.mp3` entregava o IP da casa
// a quem quisesse. Busca por texto continua livre (vai para o YouTube).
const HOSTS_MUSICA = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
  "soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "on.soundcloud.com",
  "open.spotify.com",
  ...(process.env.MUSICA_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
]);
export function hostDeMusica(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password && !u.port && HOSTS_MUSICA.has(u.hostname.toLowerCase());
  } catch { return false; }
}

export function classificar(consulta) {
  const t = String(consulta ?? "").trim();
  if (!t) return { tipo: "vazio" };
  const sp = spotifyInfoDeUrl(t);
  if (sp && hostDeMusica(t)) return { tipo: `spotify-${sp.tipo}`, id: sp.id };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return hostDeMusica(t) ? { tipo: "url", url: t } : { tipo: "bloqueado" };
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
    const args = ["-J", "--no-warnings", ...SEM_GENERICO, ...comCookies(), ...CLIENTES_YT, playlistOk ? "--flat-playlist" : "--no-playlist", alvo];
    const p = deps.spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
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
  if (c.tipo === "bloqueado") throw new Error("só toco links do YouTube, SoundCloud e Spotify — para o resto, escreva o nome da música.");

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
// Corta a faixa que está no player: solta os ouvintes dela, mata o yt-dlp,
// mata o ffmpeg do revoice SEM deixar o handler de erro dele chamar `stop()`
// depois (ele pararia a faixa NOVA), espera o ffmpeg sair e só então esvazia o
// buffer — senão o resto do áudio velho já no pipe entraria na faixa nova.
async function cortarFaixa(st, media) {
  try { st.soltar?.(); } catch {}
  st.soltar = null;
  pararStream(st);
  if (!media) return;
  const ff = media.fProc;
  // o áudio que ainda está no pipe do ffmpeg velho não pode cair no buffer novo
  try { (ff?._outputs ?? []).find((o) => o?.target && typeof o.target !== "string")?.target?.removeAllListeners?.("data"); } catch {}
  if (ff && !media.ffmpegFinished) {
    try { ff.removeAllListeners?.("end"); ff.removeAllListeners?.("error"); ff.on?.("error", () => {}); } catch {}
    const saiu = new Promise((r) => {
      const t = setTimeout(r, deps.esperaCorteMs);
      const pronto = () => { clearTimeout(t); r(); };
      try { ff.once?.("error", pronto); ff.once?.("end", pronto); } catch { pronto(); }
    });
    try { ff.kill?.("SIGKILL"); } catch {}
    await saiu;
  }
  try { media.stop?.(); } catch {}   // esvazia o áudio já decodificado (e zera o volume do revoice)
}

// Por que um vídeo não tocou, em português de gente (a última linha do yt-dlp
// é para quem lê log). `outra`: vale procurar outra versão da mesma música.
export function motivoDaFalha(erroTxt) {
  const t = String(erroTxt ?? "");
  if (/confirm your age|age[- ]restricted|inappropriate for some users/i.test(t)) return { id: "idade", texto: "restrição de idade no YouTube" };
  if (/confirm you.?re not a bot/i.test(t)) return { id: "robo", texto: "o YouTube pediu verificação anti-robô" };
  if (/not available in your country|geo.?restrict|blocked it in your country/i.test(t)) return { id: "regiao", texto: "bloqueado na região" };
  if (/video unavailable|private video|has been removed|is not available|members-only|premieres in/i.test(t)) return { id: "indisponivel", texto: "vídeo indisponível" };
  const ultima = t.trim().split("\n").pop()?.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]{6,}:\s*)?/i, "").slice(0, 120);
  return { id: "outro", texto: ultima || "o vídeo não abriu" };
}

// Outras versões da mesma música: os próximos resultados do YouTube com o
// mesmo título (outro upload quase sempre não tem a restrição) e o SoundCloud.
const idDoVideo = (url) => String(url ?? "").match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? url;
async function alternativas(item) {
  const termo = item.busca || item.titulo;
  const lista = [];
  try {
    const j = await ytdlpJson(`ytsearch5:${termo}`);
    for (const e of j.entries ?? []) {
      const it = itemDeEntrada(e);
      if (it.url && idDoVideo(it.url) !== idDoVideo(item.url) && !lista.some((x) => idDoVideo(x.url) === idDoVideo(it.url))) lista.push(it);
    }
  } catch (e) { dbg(`alternativas no YouTube falharam: ${e.message}`); }
  lista.splice(2);
  try {
    const j = await ytdlpJson(`scsearch1:${termo}`);
    const e = j.entries?.[0];
    if (e) lista.push(itemDeEntrada(e));
  } catch (e) { dbg(`alternativa no SoundCloud falhou: ${e.message}`); }
  return lista;
}

// Toca UM item e espera o áudio começar DE VERDADE (o "startplay" do revoice)
// ou o yt-dlp morrer. Antes a Judy dizia "▶ Tocando" assim que o processo
// nascia; quando o YouTube recusava o vídeo, ela pulava calada e a call
// ficava muda.
function tentarTocar(canalVoz, st, g, media, item) {
  return new Promise((resolver) => {
    let fase = "esperando";   // → "tocando" | "acabou"
    let fimDisparado = false;
    let erroTxt = "";
    const proc = deps.spawn(YTDLP, ["-f", "bestaudio/best", ...SEM_GENERICO, ...comCookies(), ...CLIENTES_YT, "--no-playlist", "-o", "-", "--quiet", "--no-warnings", item.url],
      { stdio: ["ignore", "pipe", "pipe"] });
    st.proc = proc;
    const desfecho = (r) => {
      if (fase !== "esperando") return;
      fase = r.ok ? "tocando" : "acabou";
      clearTimeout(timer);
      media.off?.("startplay", comecou);
      if (r.ok) log(`${canalVoz}: ▶ ${item.titulo}`);
      resolver(r);
    };
    const comecou = () => desfecho({ ok: true });
    // demora sem erro (download lento): assume que vai tocar
    const timer = setTimeout(() => desfecho({ ok: true }), deps.esperaInicioMs);
    proc.stderr?.on?.("data", (d) => (erroTxt += d));
    proc.on("error", (e) => { erroTxt += `\n${e.message}`; desfecho({ ok: false, erro: erroTxt }); });

    const fim = () => {
      if (g !== st.geracao) return desfecho({ ok: false, cortada: true });
      if (fase === "esperando") return desfecho({ ok: false, erro: erroTxt });   // acabou antes de começar
      if (fase !== "tocando" || fimDisparado) return;   // tentativa que já falhou não puxa nada
      fimDisparado = true;
      dbg(`${canalVoz}: fim de "${item.titulo}"`);
      tocarProxima(canalVoz).catch((e) => log(`próxima falhou: ${e.message}`));
    };
    media.on?.("finish", fim);
    media.on?.("end", fim);
    media.once?.("startplay", comecou);
    st.soltar = () => {
      media.off?.("finish", fim); media.off?.("end", fim); media.off?.("startplay", comecou);
      desfecho({ ok: false, cortada: true });
    };
    proc.on("close", (c) => {
      if (g !== st.geracao) return desfecho({ ok: false, cortada: true });
      if (c === 0) return;
      if (fase === "esperando") return desfecho({ ok: false, erro: erroTxt || `yt-dlp saiu com ${c}` });
      if (fase === "tocando" && !fimDisparado) {
        log(`stream de "${item.titulo}" caiu (${motivoDaFalha(erroTxt).texto}) — pulando`);
        setTimeout(fim, 500);
      }
    });

    try { media.setVolume?.(st.volume); } catch {}   // depois do corte: o stop() do revoice zera o volume
    media.playStream(proc.stdout);
  });
}

// Devolve o que aconteceu, para a resposta do comando:
// { item } tocando · { trocada: {de, motivo} } outra versão · { falhou: {titulo, motivo}, depois } não deu
async function tocarProxima(canalVoz) {
  const st = estadoDe(canalVoz);
  if (st.trocando) return { ocupado: true };
  st.trocando = true;
  const g = ++st.geracao;
  const saida = { item: null };
  try {
    let item = null;
    if (st.loop === "faixa" && st.atual && !st.atual.falhou) item = st.atual;
    else {
      if (st.loop === "fila" && st.atual && !st.atual.falhou) st.fila.push(st.atual);
      item = st.fila.shift() ?? null;
    }
    st.atual = item;
    if (!item) {
      dbg(`${canalVoz}: fila acabou`);
      await cortarFaixa(st, deps.playerDe(canalVoz));
      return saida;
    }

    if (!item.url && item.busca) {   // faixa do Spotify resolvida na hora
      try {
        const j = await ytdlpJson(`ytsearch1:${item.busca}`);
        const e = j.entries?.[0];
        if (!e) throw new Error("sem resultado");
        Object.assign(item, itemDeEntrada(e), { titulo: item.titulo });
      } catch (e) {
        log(`não resolvi "${item.busca}" (${e.message}) — pulando`);
        item.falhou = true;
        st.trocando = false;
        return { falhou: { titulo: item.titulo, motivo: "não achei no YouTube" }, depois: await tocarProxima(canalVoz) };
      }
    }

    const media = await deps.criarPlayer(canalVoz);
    await cortarFaixa(st, media);
    if (g !== st.geracao) return saida;   // outro skip/parar chegou enquanto cortava

    let r = await tentarTocar(canalVoz, st, g, media, item);
    if (!r.ok && !r.cortada && g === st.geracao) {
      const motivo = motivoDaFalha(r.erro);
      log(`"${item.titulo}" não tocou (${motivo.texto}) — procurando outra versão`);
      for (const alt of await alternativas(item)) {
        if (g !== st.geracao) return saida;
        await cortarFaixa(st, media);
        r = await tentarTocar(canalVoz, st, g, media, alt);
        if (r.ok) {
          saida.trocada = { de: item.titulo, motivo: motivo.texto };
          Object.assign(item, { url: alt.url, titulo: alt.titulo, duracao: alt.duracao ?? item.duracao, fonte: alt.fonte });
          break;
        }
        if (r.cortada) return saida;
      }
      if (!r.ok && !r.cortada) {
        item.falhou = true;
        st.ultimoAviso = { titulo: item.titulo, motivo: motivo.texto, idade: motivo.id === "idade", quando: Date.now() };
        log(`"${item.titulo}" não tocou em nenhuma versão (${motivo.texto})`);
        await cortarFaixa(st, media);
        st.trocando = false;
        return { falhou: { titulo: item.titulo, motivo: motivo.texto, idade: motivo.id === "idade" }, depois: await tocarProxima(canalVoz) };
      }
    }
    saida.item = r.ok ? item : null;
    return saida;
  } finally {
    st.trocando = false;
  }
}

// Frase para a resposta do comando a partir do que o tocarProxima devolveu.
function resumo(r, st) {
  const partes = [];
  let x = r;
  while (x?.falhou) {
    partes.push(`⚠️ Não consegui tocar **${x.falhou.titulo}** — ${x.falhou.motivo}, e nenhuma outra versão funcionou.`
      + (x.falhou.idade && !comCookies().length ? " _(vídeo com restrição de idade só toca com `MUSICA_COOKIES` configurado)_" : ""));
    x = x.depois;
  }
  if (x?.trocada) partes.push(`▶ Tocando **${st.atual?.titulo}**${duracaoTxt(st.atual?.duracao)} — a versão pedida (**${x.trocada.de}**) tem ${x.trocada.motivo}, então achei outra.`);
  else if (st.atual && x?.item) partes.push(`▶ Tocando **${st.atual.titulo}**${duracaoTxt(st.atual.duracao)}.`);
  return { texto: partes.join("\n"), tocando: !!(st.atual && (x?.item || x?.trocada)), falhou: partes.length > 0 && !(st.atual && (x?.item || x?.trocada)) };
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
  const r = tocandoAgora ? resumo(await tocarProxima(canalVoz), st) : null;
  if (rotulo) return { mensagem: `${entram.length} faixa(s) de **${rotulo}** na fila.${r?.texto ? `\n${r.texto}` : ""}`, itens: entram.length };
  const it = entram[0];
  if (!tocandoAgora) return { mensagem: `➕ **${it.titulo}**${duracaoTxt(it.duracao)} na fila (posição ${st.fila.length}).`, itens: entram.length };
  // nada tocou (nem esta, nem outra versão, nem o resto da fila): é erro, não "tocando"
  if (r.falhou) return { erro: r.texto.replace(/^⚠️ /, ""), itens: entram.length };
  return { mensagem: r.texto, itens: entram.length };
}

function duracaoTxt(s) {
  if (!s) return "";
  const m = Math.floor(s / 60), r = String(Math.floor(s % 60)).padStart(2, "0");
  return ` (${m}:${r})`;
}

export async function pausar(canalVoz) {
  const media = deps.playerDe(canalVoz);
  if (!media || !estadoDe(canalVoz).atual) return { erro: "não há nada tocando." };
  media.pause?.();
  return { mensagem: "⏸ Pausado." };
}

export async function retomar(canalVoz) {
  const media = deps.playerDe(canalVoz);
  if (!media || !estadoDe(canalVoz).atual) return { erro: "não há nada pausado." };
  media.resume?.();
  return { mensagem: "▶ Voltando." };
}

export async function pular(canalVoz) {
  const st = estadoDe(canalVoz);
  if (!st.atual) return { erro: "não há nada tocando." };
  const era = st.atual.titulo;
  if (st.loop === "faixa") st.loop = "nao";   // pular vence o loop de faixa
  // no loop de fila a faixa pulada volta para o fim (o tocarProxima a recoloca)
  if (st.loop !== "fila") st.atual = null;
  // um skip no meio de uma troca (ex.: resolvendo faixa do Spotify) espera ela acabar
  for (let i = 0; st.trocando && i < 100; i++) await new Promise((r) => setTimeout(r, 50));
  const r = resumo(await tocarProxima(canalVoz), st);
  const agora = r.tocando ? `\n${r.texto}` : `${r.texto ? `\n${r.texto}` : ""}\nFila vazia.`;
  return { mensagem: `⏭ Pulei **${era}**.${agora}` };
}

export async function parar(canalVoz) {
  const st = estadoDe(canalVoz);
  const tinha = !!(st.atual || st.fila.length);
  st.fila = []; st.atual = null; st.loop = "nao";
  st.geracao++;
  await cortarFaixa(st, deps.playerDe(canalVoz));
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
    // a última que não tocou (nos últimos 15 min): quem pede `&musica fila` vê o porquê
    ultimoAviso: st.ultimoAviso && Date.now() - st.ultimoAviso.quando < 15 * 60_000
      ? { titulo: st.ultimoAviso.titulo, motivo: st.ultimoAviso.motivo } : null,
  };
}

export async function volume(canalVoz, v) {
  const st = estadoDe(canalVoz);
  const alvo = Math.min(2, Math.max(0, Number(v)));
  if (!Number.isFinite(alvo)) return { erro: "volume entre 0 e 200 (em %)." };
  st.volume = alvo;
  try { deps.playerDe(canalVoz)?.setVolume?.(alvo); } catch {}
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
  if (st) { st.geracao++; try { st.soltar?.(); } catch {} st.soltar = null; pararStream(st); }
  estados.delete(canalVoz);
}

// ── Ducking: registrado nos ganchos de fala do voz.js ───────────────────────
voz.ganchosDeFala.antes = (canalVoz) => {
  const st = estados.get(canalVoz);
  if (!st?.atual) return;
  try { deps.playerDe(canalVoz)?.setVolume?.(st.volume * DUCK); dbg(`${canalVoz}: 🔉 duck`); } catch {}
};
voz.ganchosDeFala.depois = (canalVoz) => {
  const st = estados.get(canalVoz);
  if (!st?.atual) return;
  try { deps.playerDe(canalVoz)?.setVolume?.(st.volume); dbg(`${canalVoz}: 🔊 volta`); } catch {}
};
