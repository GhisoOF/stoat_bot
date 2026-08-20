// ══════════════════════════════════════════════════════════
//  voz.js — entrar em calls e publicar áudio (revoice.js / LiveKit)
//
//  ── Descobertas ao inspecionar o revoice.js (v0.2.1696) ──
//
//  1. `connection.play(media)` tem de vir ANTES de `media.playFile()`.
//     Ao contrário, o áudio simplesmente não sai — e sem erro nenhum.
//     É o tipo de bug que custa uma tarde.
//
//  2. No Node 21.1+ é OBRIGATÓRIO rodar com
//     `--no-experimental-global-navigator`. Sem a flag, entrar em voz
//     falha com "device not supported", que não sugere a causa.
//     Verificamos isso no boot e recusamos subir, para o erro aparecer
//     no lugar certo em vez de na primeira tentativa de falar.
//
//  3. A lib força `LIVEKIT_LOG_LEVEL='debug'` ao ser importada. Isso
//     enche o log e esconde o que interessa; sobrescrevemos antes.
//
//  4. O ffmpeg vem embutido (`ffmpeg-static`) — não depende do sistema.
//
//  5. `join()` chama POST /channels/{id}/join_call e conecta ao LiveKit
//     com autoSubscribe:false — o bot PUBLICA áudio mas não assina o dos
//     outros. Por isso o caminho inverso (ouvir e transcrever) não é
//     possível por aqui: recepção de áudio não está implementada.
//
//  ── Fila ──
//  Uma fala por vez POR CANAL. Sem isso, duas mensagens quase
//  simultâneas viram duas vozes sobrepostas e ninguém entende nada.
// ══════════════════════════════════════════════════════════

process.env.LIVEKIT_LOG_LEVEL = process.env.LIVEKIT_LOG_LEVEL || "warn";

// O revoice imprime o comando inteiro do ffmpeg a CADA fala, com um
// console.log fixo que não dá para desligar por configuração. Numa call
// movimentada isso soterra o log justamente quando ele importa. Filtramos
// só essas duas linhas; qualquer outra coisa passa normalmente.
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

let Revoice = null, MediaPlayer = null, revoice = null, erroCarga = null;
const conexoes = new Map();   // canalVoz → { connection, entrouEm, falas, fila:[], ocupado }

export async function iniciar() {
  // A flag do Node é pré-requisito duro: sem ela o join falha com uma
  // mensagem enganosa. Melhor recusar aqui, onde a causa é óbvia.
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

// `isConnected` mudou de função para propriedade entre versões do
// @livekit/rtc-node. Esta função aceita as duas formas e nunca lança —
// um detalhe de biblioteca não pode derrubar a chamada inteira.
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

export async function entrar(canalVoz) {
  if (erroCarga) return { ok: false, erro: erroCarga };
  if (conexoes.has(canalVoz)) return { ok: true, jaEstava: true, canalVoz };

  try {
    dbg(`entrando em ${canalVoz}…`);
    const connection = await revoice.join(canalVoz);

    // O join resolve antes de a sala estar de fato conectada; o evento
    // "join" é que marca o ponto em que dá para publicar áudio.
    await new Promise((res, rej) => {
      const t = setTimeout(
        () => rej(new Error(`${ESPERA_JOIN_MS / 1000}s sem conectar à sala (firewall UDP? permissão?)`)),
        ESPERA_JOIN_MS
      );
      // NÃO chamar connection.isConnected() aqui: no @livekit/rtc-node atual
      // `room.isConnected` é uma PROPRIEDADE, mas o revoice a invoca como
      // função — daí o "this.room.isConnected is not a function". Esperamos
      // só pelo evento, que é confiável. O try/catch protege caso a lib mude
      // de novo.
      try {
        if (jaConectado(connection)) { clearTimeout(t); return res(); }
      } catch { /* segue esperando o evento */ }
      connection.once("join", () => { clearTimeout(t); res(); });
      connection.once("error", (e) => { clearTimeout(t); rej(e); });
    });

    // ── UM player por conexão, publicado UMA vez ──
    // Antes eu criava um MediaPlayer novo a cada fala e chamava play() de
    // novo — ou seja, publicava uma FAIXA nova na sala a cada frase. O
    // LiveKit roteia a primeira e as seguintes viram faixas órfãs: o
    // microfone aparece aberto, o áudio é gerado, e ninguém ouve nada.
    // É assim que os bots de música fazem: um player por conexão, e cada
    // faixa nova só troca o arquivo tocado.
    const media = new MediaPlayer();
    await connection.play(media);
    await esperarPublicacao(connection, media);

    conexoes.set(canalVoz, {
      connection, media, entrouEm: Date.now(), falas: 0, fila: [], ocupado: false,
    });
    log(`entrou na call ${canalVoz} (faixa de áudio publicada)`);
    return { ok: true, canalVoz };
  } catch (e) {
    const erro = explicar(e);
    log(`falha ao entrar em ${canalVoz}: ${erro}`);
    // Limpeza: uma conexão que falhou no meio não pode ficar registrada,
    // senão a tentativa seguinte reusa um objeto quebrado e falha de um
    // jeito diferente — mascarando a causa original.
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
    try { c.media?.destroy?.(); } catch {}
    try { c.connection.leave?.(); } catch {}
    conexoes.delete(id);
    saiu.push(id);
    log(`saiu da call ${id}`);
  }
  return { ok: true, saiu };
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

// Espera a faixa de áudio ficar realmente publicada na sala.
// Sem isto o áudio sai antes da publicação e se perde. O limite existe
// porque a API do LiveKit muda de forma entre versões: se não conseguirmos
// confirmar, seguimos assim mesmo depois de um instante — melhor arriscar
// tocar do que travar a fila para sempre.
async function esperarPublicacao(connection, media, limiteMs = 4000) {
  const inicio = Date.now();
  const trackId = media?.track?.sid ?? media?.track?.name ?? null;

  while (Date.now() - inicio < limiteMs) {
    try {
      const pubs = connection?.room?.localParticipant?.trackPublications;
      if (pubs) {
        const lista = typeof pubs.values === "function" ? [...pubs.values()] : Object.values(pubs);
        if (lista.length > 0) {
          // achou alguma publicação: se soubermos o id, conferimos; se não,
          // a simples existência já indica que a faixa subiu
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

// ── Fila: uma fala por vez, por canal ─────────────────────
async function processarFila(canalVoz) {
  let c = conexoes.get(canalVoz);
  if (!c || c.ocupado) return;
  const item = c.fila.shift();
  if (!item) return;

  c.ocupado = true;
  try {
    const { arquivo, voz } = await tts.sintetizar(item.texto, item.voz);
    dbg(`falando em ${canalVoz} (voz ${voz}): "${item.texto.slice(0, 60)}"`);

    // Se a sala caiu entre uma fala e outra (rede, timeout do LiveKit), a
    // publicação vai para o vazio: o bot aparece na call mas sai mudo.
    // Reconectar aqui é mais barato que deixar a pessoa achando que falou.
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

    // Instrumentação: sem isto, "não ouvi nada" é indistinguível de
    // "o áudio nem foi gerado". Estes eventos dizem exatamente até onde a
    // fala chegou — e o quanto de áudio de fato saiu.
    const t0 = Date.now();
    let comecou = false, quadros = 0;
    media.on?.("startplay", () => { comecou = true; dbg(`  ▶ começou a tocar em ${Date.now() - t0}ms`); });
    media.on?.("buffer", () => dbg("  ⏳ bufferizando"));
    media.on?.("error", (e) => log(`  ✗ erro no player: ${e?.message ?? e}`));

    media.playFile(arquivo);

    // Espera o fim para não sobrepor a próxima fala. `finish` é o
    // caminho normal; o timeout é a rede de segurança para o caso de o
    // evento não vir (o que deixaria a fila travada para sempre).
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
      // Sinal claro: o player nunca emitiu "startplay". O áudio existe no
      // disco mas não chegou a ser tocado — problema no ffmpeg ou no
      // formato, não na geração nem na publicação.
      log(`  ⚠ a fala terminou sem nunca começar a tocar (${dur}ms) — áudio gerado mas não reproduzido`);
    } else {
      dbg(`  ✓ fala concluída em ${dur}ms (${quadros} amostras)`);
    }

    // NÃO destruir o media aqui: ele pertence à conexão e será reusado na
    // próxima fala. Destruí-lo despublicaria a faixa e a fala seguinte
    // sairia muda de novo.
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

export async function falar(canalVoz, texto, vozNome = null) {
  if (erroCarga) return { ok: false, erro: erroCarga };

  // Entra sozinho se ainda não estiver na call — é o que a pessoa espera
  // ao mandar o bot falar.
  if (!conexoes.has(canalVoz)) {
    const r = await entrar(canalVoz);
    if (!r.ok) return r;
  }

  const c = conexoes.get(canalVoz);
  const MAX_FILA = Number(process.env.VOZ_MAX_FILA || 5);
  if (c.fila.length >= MAX_FILA) {
    return { ok: false, erro: `fila cheia (${MAX_FILA}) — espere as falas anteriores terminarem` };
  }

  c.fila.push({ texto, voz: vozNome });
  processarFila(canalVoz);
  return { ok: true, naFila: c.fila.length, falando: c.ocupado };
}
