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

// Em operação normal o LiveKit é silenciado (ele fala DEMAIS e esconde o
// resto). Mas com VOZ_DEBUG=1 queremos exatamente o contrário: quando a
// entrada trava, o log dele é a única janela para o que acontece nos 20s.
process.env.LIVEKIT_LOG_LEVEL = process.env.LIVEKIT_LOG_LEVEL
  || (process.env.VOZ_DEBUG === "1" ? "debug" : "warn");

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
// Teto DURO para a entrada inteira, incluindo o `revoice.join()`.
// O ESPERA_JOIN_MS acima só cobre a espera pelo evento "join" — ou seja,
// o que acontece DEPOIS de o join() resolver. Quando o próprio join()
// pendura (o POST /channels/{id}/join_call do Stoat sem resposta, típico
// quando o servidor ainda acha que o bot está na call), não havia limite
// nenhum: a requisição do bot ficava presa até o timeout dele, 40s, e o
// erro que chegava ao chat era "aborted due to timeout" — que não diz
// nada sobre onde travou.
const ENTRAR_MAX_MS = Number(process.env.VOZ_ENTRAR_TIMEOUT_MS || 20_000);

let Revoice = null, MediaPlayer = null, revoice = null, erroCarga = null;
const conexoes = new Map();   // canalVoz → { connection, entrouEm, falas, fila:[], ocupado }

// Entradas EM ANDAMENTO, por canal. Sem isto, N pedidos simultâneos para o
// mesmo canal viravam N `revoice.join()` paralelos: `conexoes.set()` só
// acontece no FIM de uma entrada bem-sucedida, então nenhum dos pedidos via
// os outros. Foi assim que uma rajada de mensagens no canal de transmissão
// disparou sete joins ao mesmo tempo e travou a entrada de vez — cada um
// abrindo uma sala que o seguinte não sabia que existia.
const entrando = new Map();   // canalVoz → Promise<{ ok, … }>
// Canais em que já tentamos o destrave automático nesta rodada — sem isto,
// um AlreadyConnected persistente viraria recursão infinita.
const jaTentouDestravar = new Set();

// Corrida entre uma promessa e um timeout, com mensagem que diz ONDE parou.
//
// ATENÇÃO: desistir de ESPERAR não CANCELA o que está rodando. O
// `revoice.join()` continua seu caminho depois do timeout e pode completar
// meio minuto mais tarde — deixando uma sala aberta que ninguém registrou.
// Do lado do Stoat o bot passa a estar na call; do nosso, não. A tentativa
// seguinte então falha porque "já está na call", e cada nova tentativa
// piora: era isso que fazia o problema não passar sozinho, nem depois do
// reinício. Quem chama precisa varrer a órfã — daí o `aoChegarTarde`.
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

export async function entrar(canalVoz, serverId = null, servidores = null) {
  ultimoServidor = serverId ?? ultimoServidor;
  if (Array.isArray(servidores) && servidores.length) servidoresConhecidos = servidores;
  if (erroCarga) return { ok: false, erro: erroCarga };
  if (conexoes.has(canalVoz)) return { ok: true, jaEstava: true, canalVoz };

  // Já há uma entrada em voo para este canal: espera a MESMA, em vez de
  // abrir outra. Todos os pedidos recebem o mesmo resultado.
  const emVoo = entrando.get(canalVoz);
  if (emVoo) { dbg(`entrada em ${canalVoz} já em andamento — aguardando a mesma`); return emVoo; }

  const tarefa = entrarDeFato(canalVoz, serverId).finally(() => entrando.delete(canalVoz));
  entrando.set(canalVoz, tarefa);
  return tarefa;
}

async function entrarDeFato(canalVoz, serverId = null) {
  const t0 = Date.now();
  const marcos = [];
  const marco = (nome) => { marcos.push({ nome, ms: Date.now() - t0 }); dbg(`  ⏱ ${nome} em ${Date.now() - t0}ms`); };
  ultimosMarcos = marcos;
  try {
    dbg(`entrando em ${canalVoz}…`);
    marco("inicio");

    // ── Já estou em outra call? Então "entrar" quer dizer MOVER ──
    //
    // Chamar alguém para a sua call enquanto ele está em outra é o pedido
    // mais natural do mundo, e antes dava `AlreadyConnected` — um erro
    // técnico sobre um estado interno, para quem só queria a Judy ali.
    const outras = [...conexoes.keys()].filter((id) => id !== canalVoz);
    if (outras.length) {
      log(`já estou em ${outras.join(", ")} — saindo antes de entrar em ${canalVoz}`);
      await sair(null);
      marco("saiu-da-call-anterior");
    }
    // O join() é a parte que pendura. Com limite, um Stoat que não responde
    // vira um erro claro em 20s em vez de uma requisição pendurada.
    marco("chamando-revoice.join");
    const connection = await comLimite(
      revoice.join(canalVoz),
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

    // O join resolve antes de a sala estar de fato conectada; o evento
    // "join" é que marca o ponto em que dá para publicar áudio.
    await new Promise((res, rej) => {
      const t = setTimeout(
        () => rej(new Error(`${ESPERA_JOIN_MS / 1000}s sem a sala confirmar a entrada (etapa: sala)`)),
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

    marco("sala-confirmada");

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

    // AlreadyConnected: o Stoat acha que já estamos na call. Destrava e
    // tenta UMA vez — quem pediu para entrar não deve precisar aprender a
    // existência de um estado preso do outro lado para conseguir entrar.
    if (/AlreadyConnected/i.test(String(e?.message ?? e)) && !jaTentouDestravar.has(canalVoz)) {
      jaTentouDestravar.add(canalVoz);
      const sid = serverId ?? ultimoServidor;

      // 1ª tentativa: MOVER. Se o Stoat me registra em alguma call deste
      // servidor, mover é mais barato e mais direto que sair e voltar.
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
    // Descarta a fila ANTES de derrubar a conexão: o que estava esperando
    // para ser falado não deve ressuscitar a sala pelo caminho da
    // reconexão automática do processarFila.
    c.fila.length = 0;
    try { c.media?.destroy?.(); } catch {}
    try { c.connection.leave?.(); } catch {}
    // O `leave()` do revoice nem sempre desconecta a sala do LiveKit —
    // e uma sala meio-viva é exatamente o que faz a entrada seguinte
    // pendurar. Fechamos por baixo também, se a API deixar.
    try { await c.connection?.room?.disconnect?.(); } catch {}
    conexoes.delete(id);
    saiu.push(id);
    log(`saiu da call ${id}`);
  }
  return { ok: true, saiu };
}

// ── Sair pela API, sem depender do estado local ───────────
//
//  O `AlreadyConnected` do Stoat vem do banco DELE: o servidor guarda que
//  este bot está numa call, e recusa qualquer entrada nova enquanto esse
//  registro existir. Normalmente ele some quando a sala do LiveKit
//  desconecta — mas se a nossa entrada travou no meio, ou o processo morreu
//  com a sala meio aberta, o registro fica preso e NADA que a gente faça
//  localmente o remove: reiniciar o serviço não adianta, porque o estado
//  não é nosso.
//
//  Como a rota de saída não é a mesma em toda versão do Stoat, tentamos as
//  candidatas em ordem e relatamos o que cada uma respondeu. A que existir
//  resolve; o relatório serve para descobrir qual é, sem chutar de novo.
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
      // `corpo` é cortado porque vai para um embed; `json` é o texto INTEIRO
      // já convertido. Fazer o parse do texto cortado era garantia de falhar
      // em qualquer resposta com mais de 160 caracteres — e o /users/@me tem.
      return { metodo, rota, ok: r.ok, status: r.status, ms: Date.now() - t, corpo: txt.slice(0, 160), json };
    } catch (e) {
      return { metodo, rota, ok: false, ms: Date.now() - t, erro: e?.message ?? String(e) };
    }
  };

  // ── O jeito certo, achado no código do Stoat ──
  //
  // Não existe rota de "sair da call": as únicas rotas de voz são
  // `join_call` e `stop_ring` (crates/delta/src/routes/channels/mod.rs). A
  // saída normal acontece quando o LiveKit avisa que o participante caiu — e
  // é justamente esse aviso que nunca chega quando a entrada trava no meio,
  // deixando o registro presoem `vc:{userId}` no Redis deles.
  //
  // O `join_call` aceita `force_disconnect`, que limparia tudo… mas:
  //     if user.bot.is_some() && force_disconnect == Some(true) { IsBot }
  // bots são explicitamente proibidos de usar.
  //
  // Sobra um caminho: `PATCH /servers/{s}/members/{u}` com
  // `remove: ["VoiceChannel"]`, que chama `voice_client.remove_user(...)`. Ele
  // exige a permissão MoveMembers — EXCETO quando o alvo é quem pede:
  //     if member.id.user != user.id { throw_if_lacking(MoveMembers) }
  // Ou seja: o bot pode desconectar a si mesmo, sem permissão nenhuma.
  const meuId = await meuIdDeBot(bater, passos);

  // O registro preso pode estar num canal de OUTRO servidor: o `remove` só
  // acha a call se ela estiver no servidor da requisição. Por isso tentamos
  // em todos os servidores que o bot conhece, começando pelo mais provável.
  const alvos = [serverId, ...servidores].filter((x, i, a) => x && a.indexOf(x) === i);
  if (!meuId) {
    passos.push({ rota: "(auto-desconexão)", ok: false, erro: "não descobri meu próprio id" });
    return { ok: false, passos };
  }
  if (!alvos.length) {
    passos.push({ rota: "(auto-desconexão)", ok: false, erro: "o serviço não recebeu nenhum serverId" });
    return { ok: false, passos };
  }

  for (const sid of alvos) {
    const r = await bater("PATCH", `/servers/${sid}/members/${meuId}`, { remove: ["VoiceChannel"] });
    passos.push(r);
    if (!r.ok) continue;

    // ── HTTP 200 NÃO significa destravado ──
    //
    // Essa rota só manda o LiveKit remover o participante; quem apaga o
    // registro do Stoat (`delete_voice_state`) é o webhook que o LiveKit
    // dispara depois. Quando o participante já não existe lá — queda de
    // energia, processo morto — o LiveKit responde "ok" sem fazer nada,
    // webhook nenhum é disparado, e o registro continua exatamente onde
    // estava. Foi assim que reportei "destravado" para um estado que não
    // tinha mudado. A única prova é tentar entrar.
    const teste = await bater("POST", `/channels/${canalVoz}/join_call`, {});
    passos.push({ ...teste, rota: "(verificação: join_call)" });
    if (teste.ok) {
      log(`destravado de verdade em ${sid}`);
      return { ok: true, via: "PATCH members remove VoiceChannel", passos, verificado: true };
    }
    if (!/AlreadyConnected/i.test(teste.corpo ?? "")) {
      // Outro erro qualquer: o registro saiu, o problema agora é outro.
      return { ok: true, via: "PATCH members remove VoiceChannel", passos, verificado: true };
    }
  }
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

// ── Mover-se para outra call ──
//
//  A mesma rota que desconecta também MOVE: `voice_channel: <novo>` em vez de
//  `remove: ["VoiceChannel"]`. E vale a mesma dispensa de permissão — mover a
//  si mesmo não exige MoveMembers. É o que faz `&tts entrar` numa call
//  diferente funcionar como "vem para cá" em vez de dar AlreadyConnected.
//
//  Limite do Stoat: `get_user_voice_channel_in_server` só encontra a call de
//  origem se ela estiver NO MESMO servidor. Entre servidores, o caminho é
//  desconectar e entrar de novo — que é o fallback de quem chama.
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

// ── Reinício a quente ─────────────────────────────────────
// Quando o estado do lado do Stoat/LiveKit fica inconsistente ("entrei mas
// ninguém ouve", "não consigo mais entrar"), a saída era reiniciar o
// serviço à mão no Gentoo — o que só o dono consegue fazer, e só quando
// está perto de um terminal. Isto recria o cliente do zero sem derrubar o
// processo: mesmo efeito, alcançável de dentro do chat.
export async function reiniciar() {
  log("reinício a quente pedido");
  try { await sair(null); } catch {}
  entrando.clear();
  // Derruba o que ainda estiver de pé ANTES de esquecer as referências —
  // senão as conexões viram exatamente as órfãs que queremos evitar.
  for (const c of conexoes.values()) await derrubar(c.connection);
  conexoes.clear();
  ultimaFalha = null;
  revoice = null;
  erroCarga = null;
  const r = await iniciar();
  log(`reinício: ${r.ok ? "ok" : `falhou — ${r.erro}`}`);
  return r;
}

// A última falha de entrada, para o diagnóstico não depender de reproduzir
// o problema na hora de investigar.
let ultimaFalha = null;
// Marcos da última tentativa de entrada. O `revoice.join()` é uma caixa
// preta de 20s; sem cronometrar o que acontece em volta dele, "travou no
// join" é tudo que dá para dizer — e não é suficiente para consertar nada.
let ultimosMarcos = null;
// Último servidor informado pelo bot — o destrave precisa dele, e a chamada
// que falha nem sempre o traz.
let ultimoServidor = null;
// Servidores que o bot conhece, informados por ele. O registro preso pode
// estar num canal de OUTRO servidor, e o `remove` só encontra a call se
// procurar no servidor certo.
let servidoresConhecidos = [];

// ── Diagnóstico em ETAPAS ─────────────────────────────────
//
// "Não consigo entrar" tem duas causas completamente diferentes e o mesmo
// sintoma. Entrar numa call é:
//
//   1. HTTP  — POST /channels/{id}/join_call na API do Stoat, que devolve
//              o token e o endereço do LiveKit;
//   2. WebRTC — conectar ao LiveKit com esse token e publicar áudio.
//
// A etapa 1 falha por token, permissão ou estado (o Stoat achar que o bot
// já está na call). A etapa 2 falha por rede: UDP bloqueado, MTU da
// Tailscale, firewall. O remédio de uma não serve para a outra, e sem
// separá-las a investigação vira tentativa e erro.
//
// Esta função faz a etapa 1 CRUA, sem o revoice, e testa o alcance da
// etapa 2 — sem entrar na call de verdade.
export async function diagnosticar(canalVoz) {
  const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
  const etapas = [];

  // Toda chamada usa o MESMO formato: `X-Bot-Token` e, nos POST, um corpo
  // JSON de verdade. A primeira versão disto mandava POST com
  // `content-type: application/json` e SEM corpo — e levou um 400 em HTML,
  // de um proxy, antes de chegar à API. Eu li aquele 400 como "o Stoat
  // recusou o join" e mandei investigar permissão de canal: culpado errado,
  // com uma confiança que o dado não sustentava. Um 400 sem JSON não é a
  // API falando; é sinal de que a requisição nem chegou lá.
  const bater = async (rota, metodo = "GET") => {
    const t = Date.now();
    try {
      const r = await comLimite(fetch(`${API}${rota}`, {
        method: metodo,
        headers: {
          "X-Bot-Token": TOKEN,
          ...(metodo === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(metodo === "POST" ? { body: "{}" } : {}),
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

  // ── 1. O token vale e a API responde? ──
  // Sem isto, qualquer falha adiante fica ambígua. `/users/@me` é a chamada
  // mais barata que exige autenticação.
  const me = await bater("/users/@me");
  etapas.push({
    etapa: "api+token", ok: me.ok, ms: me.ms, status: me.status,
    detalhe: me.ok ? `autenticado como ${me.json?.username ?? "?"}` : descrever(me),
  });

  // ── 2. O ID é mesmo de um canal de VOZ? ──
  // Um ID de canal de texto no lugar do de voz dá exatamente o mesmo
  // sintoma e não aparece em lugar nenhum até alguém conferir.
  const ch = await bater(`/channels/${canalVoz}`);
  const tipo = ch.json?.channel_type ?? ch.json?.type ?? null;
  // ATENÇÃO: no Stoat um canal de call é um `TextChannel` com voz habilitada —
  // não existe "VoiceChannel" separado como eu supus. Marcar ❌ por causa do
  // tipo apontava um culpado inexistente e mandava a pessoa reconfigurar um
  // canal que estava certo. Aqui só interessa se o canal é LEGÍVEL.
  etapas.push({
    etapa: "canal", ok: ch.ok, ms: ch.ms, status: ch.status,
    detalhe: ch.ok ? `${ch.json?.name ?? "?"} · tipo ${tipo ?? "(não informado)"}` : descrever(ch),
  });

  // ── 3. O join_call ──
  const jc = await bater(`/channels/${canalVoz}/join_call`, "POST");
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
    let { arquivo, voz } = await tts.sintetizar(item.texto, item.voz);
    // Tom e efeito são independentes — aplicar juntos numa passada só de
    // ffmpeg, em vez de duas (que dobraria a perda de qualidade).
    const temEfeito = item.efeito && item.efeito !== "nenhum";
    const temTom = Number.isFinite(Number(item.tom)) && Math.abs(Number(item.tom) - 1) > 0.001;
    if (temEfeito || temTom) {
      arquivo = await tts.aplicarEfeito(arquivo, temEfeito ? item.efeito : null, item.tom);
    }
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

    // ── BUG DA BIBLIOTECA: playFile() está quebrado em ESM ──
    // O Media.js do revoice usa `fs.createReadStream(path)` mas NUNCA importa
    // o `fs`. Ele só funciona por acidente quando alguma dependência vaza um
    // `fs` global — o que ocorre em CommonJS e NÃO ocorre em ESM. Como este
    // serviço é ESM, playFile() lançava "fs is not defined" em toda fala.
    // (Verificado: em CJS `globalThis.fs` existe; em ESM é undefined.)
    // Ninguém tinha notado porque o uso comum — bots de música — manda
    // streams de rede, não arquivos locais.
    // Abrimos o arquivo aqui e usamos playStream(), que é implementado
    // corretamente e é exatamente para onde o playFile apontaria.
    media.playStream(fs.createReadStream(arquivo));

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

export async function falar(canalVoz, texto, vozNome = null, efeito = null, tom = null, autoEntrar = true) {
  if (erroCarga) return { ok: false, erro: erroCarga };

  // Entra sozinho se ainda não estiver na call — é o que a pessoa espera ao
  // mandar o bot falar com `&tts <texto>`.
  //
  // Mas NÃO quando a fala veio da transmissão automática (autoEntrar=false).
  // Antes, quem mandasse `&tts sair` via o bot voltar na mensagem seguinte
  // de qualquer pessoa: o pedido explícito de sair era desfeito por quem nem
  // sabia que ele tinha sido feito. Pior, com o join pendurado cada mensagem
  // acumulava uma tentativa nova.
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
