// ══════════════════════════════════════════════════════════
//  main.js — Inicialização do bot e roteamento de comandos
//  stoat.js (compatível com a API do Revolt)
// ══════════════════════════════════════════════════════════
import 'dotenv/config';
import { Client } from "stoat.js";
import { readFileSync, writeFileSync } from "node:fs";

import * as engine   from "./modulos/moderacao/automod-engine.js";
import * as automodCmd from "./modulos/moderacao/automod-comandos.js";
import * as geral   from "./modulos/moderacao/geral.js";
import * as db       from "./modulos/core/db.js";
import * as store    from "./modulos/core/config-store.js";
import * as log      from "./modulos/core/log.js";
import * as cfgCmd   from "./modulos/moderacao/config-comando.js";
import * as banGlobal from "./modulos/moderacao/ban-global.js";
import * as limpar    from "./modulos/moderacao/limpar.js";
import * as admin     from "./modulos/moderacao/comandos-admin.js";
import * as embedCmd  from "./modulos/moderacao/embed.js";
import * as reactionRoles from "./modulos/ferramentas/reaction-roles.js";
import * as autorole  from "./modulos/ferramentas/autorole.js";
import * as tutorial   from "./modulos/moderacao/tutorial.js";
import * as corCargo   from "./modulos/moderacao/cor-cargo.js";
import * as acessoMod  from "./modulos/moderacao/acesso.js";
import * as warnMod    from "./modulos/moderacao/warn.js";
import * as srvStats   from "./modulos/moderacao/servidores.js";
import * as rpg        from "./modulos/game/game.js";
import * as modIA      from "./modulos/moderacao/moderacao-ia.js";
import * as modiaCmd   from "./modulos/moderacao/modia-comando.js";
import * as debugCmd  from "./modulos/moderacao/debug-comando.js";
import * as chat      from "./modulos/ai/chat.js";
import * as rss       from "./modulos/ferramentas/rss.js";
import * as nivel     from "./modulos/ferramentas/nivel.js";
import * as i18n      from "./modulos/core/i18n.js";
import * as aliases   from "./modulos/core/aliases.js";
import { tr }         from "./modulos/core/i18n.js";

const PREFIXO     = "&";
const CONFIG_PATH = process.env.CONFIG_PATH || "./automod-config.json";
const client      = new Client({ autoReconnect: true });

// ══════════════════════════════════════════════════════════
//  OBSERVABILIDADE E AUTO-RECUPERAÇÃO
//  Objetivo: nunca ficar "vivo mas surdo". Se a conexão morrer de um
//  jeito que a reconexão automática não resolve, reiniciamos o processo
//  (o `restart: unless-stopped` do container sobe um novo, limpo).
// ══════════════════════════════════════════════════════════

let ultimoEvento = Date.now();       // quando recebemos o último evento do Stoat
let jaReiniciando = false;

// Reinício controlado: encerra o processo para o supervisor subir de novo.
// Rodando à mão (sem container), o processo simplesmente termina — por isso o
// motivo vai para o log ANTES de sair.
function reiniciar(motivo) {
  if (jaReiniciando) return;
  jaReiniciando = true;
  console.error(`[RECUPERAÇÃO] Reiniciando o processo: ${motivo}`);
  // dá um instante para o log sair antes de sair
  setTimeout(() => process.exit(1), 500);
}

// 1) Erros globais. Erros de SOCKET/CONEXÃO são fatais para o funcionamento —
//    não adianta seguir "vivo": reiniciamos. Outros erros são só logados.
function ehErroDeConexao(txt) {
  return /socket closed|ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|write after end|not opened|WebSocket/i.test(txt || "");
}
process.on("uncaughtException", (err) => {
  const txt = err?.stack || String(err);
  console.error(`[FATAL] Exceção não capturada: ${txt}`);
  if (ehErroDeConexao(txt)) reiniciar("exceção de conexão (socket morto)");
});
process.on("unhandledRejection", (motivo) => {
  const txt = motivo?.stack || String(motivo);
  console.error(`[FATAL] Promessa rejeitada sem catch: ${txt}`);
  if (ehErroDeConexao(txt)) reiniciar("rejeição de conexão (socket morto)");
});

// 2) Eventos de conexão do cliente — visibilidade + marca de atividade.
client.on("error", (e) => {
  const txt = e?.stack || String(e);
  console.error(`[CONN] Erro do cliente: ${txt}`);
  if (ehErroDeConexao(txt)) reiniciar("erro de conexão do cliente");
});
client.on("connecting", () => console.info("[CONN] Conectando ao Stoat…"));
client.on("connected", () => { ultimoEvento = Date.now(); console.info("[CONN] Conectado (WebSocket ativo)."); });
client.on("disconnected", () => console.warn("[CONN] ⚠️ DESCONECTADO do Stoat — aguardando reconexão…"));

// 3) Watchdog por INATIVIDADE (não depende do evento 'disconnected', que pode
//    não disparar quando o socket morre "por baixo"). Se não recebemos NENHUM
//    evento do Stoat por muito tempo, o socket provavelmente está zumbi.
//    Um servidor com atividade normal recebe eventos com frequência; mesmo um
//    servidor calado recebe pings/presença. Silêncio longo = problema.
const INATIVIDADE_MS = Number(process.env.INATIVIDADE_MS || 600000); // 10 min sem eventos → reinicia
setInterval(() => {
  const ocioso = Date.now() - ultimoEvento;
  if (ocioso > INATIVIDADE_MS) {
    reiniciar(`sem eventos do Stoat há ${Math.round(ocioso / 60000)}min (socket provavelmente zumbi)`);
  }
}, 60000);

// 4) Heartbeat: prova de vida. Mostra há quanto tempo sem eventos — se esse
//    número só cresce, o socket está morto mesmo que "conectado" diga true.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 300000); // 5 min
setInterval(() => {
  const ociosoMin = Math.round((Date.now() - ultimoEvento) / 60000);
  const mem = Math.round(process.memoryUsage().rss / 1048576);
  console.info(`[VIVO] bot ativo | RAM ${mem}MB | sem eventos há ${ociosoMin}min`);
}, HEARTBEAT_MS);


// ── Cores semânticas dos embeds ────────────────────────────
const COR = {
  sucesso: "#3BA55D",
  erro:    "#ED4245",
  aviso:   "#FAA61A",
  info:    "#5865F2",
  mod:     "#9B59B6",
};

// ── Bits de permissão do Revolt/Stoat ──────────────────────
const PERM = {
  ManagePermissions: 1 << 2,
  KickMembers:       1 << 6,
  BanMembers:        1 << 7,
};

// ══════════════════════════════════════════════════════════
//  CONFIGURAÇÃO — delegada ao config-store (SQLite por servidor)
// ══════════════════════════════════════════════════════════
// Config POR SERVIDOR: store.configDoServidor(serverId)
// Config GLOBAL (debug, blocklist): store.getGlobal()
// A migração do automod-config.json antigo acontece em store.inicializar().

let cfgGlobal = store.getGlobal();  // atualizado após inicializar()

// ══════════════════════════════════════════════════════════
//  HELPERS COMPARTILHADOS
// ══════════════════════════════════════════════════════════

// Envia uma mensagem SEMPRE como embed (com fallback para texto puro)
async function sendEmbed(channel, { title, description, colour = COR.info }) {
  if (!channel || typeof channel.sendMessage !== "function") {
    console.error("[EMBED] Canal indisponível — mensagem não enviada:", title ?? description);
    return;
  }
  const erroStr = (e) => e?.message ?? e?.type ?? (typeof e === "object" ? JSON.stringify(e) : String(e));
  // Stoat/Revolt limita a descrição do embed. Mantemos folga (1500) porque o
  // limite conta o embed inteiro (título incluso), não só a descrição.
  let desc = description ?? "";
  if (desc.length > 1500) desc = desc.slice(0, 1495) + "…";
  try {
    await channel.sendMessage({ embeds: [{ title, description: desc, colour }] });
  } catch (err) {
    console.error("[EMBED] Falha ao enviar embed:", erroStr(err));
    // fallback: texto puro, ainda mais curto
    try {
      await channel.sendMessage([title, desc].filter(Boolean).join("\n").slice(0, 1500));
    } catch (err2) {
      console.error("[EMBED] Fallback de texto também falhou:", erroStr(err2));
    }
  }
}

// ── Status da conta do bot (texto sob o nome na lista de membros) ──
//  PATCH https://api.stoat.chat/users/@me  { status: { text, presence } }
//  Header: X-Bot-Token (mesmo esquema REST do &cor).
async function definirStatus() {
  const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
  const token = process.env.BOT_TOKEN;
  if (!token) return;
  const texto = process.env.STATUS_TEXT
    || `${PREFIXO}help • ${PREFIXO}tutorial | prefixo/prefix: ${PREFIXO}`;
  const r = await fetch(`${API}/users/@me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Bot-Token": token },
    body: JSON.stringify({ status: { text: texto.slice(0, 128), presence: "Online" } }),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} ${corpo.slice(0, 200)}`);
  }
  console.info(`[STATUS] Definido: "${texto}"`);
}

async function getServer(message) {
  if (message.server)   return message.server;
  if (message.serverId) return await client.servers.fetch(message.serverId);
  throw new Error("Servidor não encontrado.");
}

// ── Super-admin (o dono do bot) ────────────────────────────
// IDs com controle TOTAL em qualquer servidor, ignorando permissões.
// Validado pelo authorId real da mensagem (garantido pelo Stoat, não forjável).
// Configurável por env SUPER_ADMINS (IDs separados por vírgula); o padrão é você.
const SUPER_ADMINS = new Set(
  (process.env.SUPER_ADMINS || "01K9JKP85D5EP2ZTEHS8DT797A")
    .split(",").map((s) => s.trim()).filter(Boolean)
);
function ehSuperAdmin(userId) {
  return !!userId && SUPER_ADMINS.has(userId);
}

// Verifica se o AUTOR da mensagem tem determinada permissão.
// Estratégia defensiva: super-admin sempre passa; dono do servidor sempre passa;
// senão tenta hasPermission() e, por fim, o bitfield de permissões.
function membroTemPermissao(message, server, permName) {
  try {
    const userId = message.authorId;
    if (ehSuperAdmin(userId)) return true;              // dono do bot: controle total
    if (server?.ownerId && server.ownerId === userId) return true;

    // Cargos marcados como STAFF (&acesso cargo add) valem como permissão de
    // moderação. Serve para dar poder de moderar sem entregar permissões reais
    // do Stoat. Não cobre ManageServer, que é administração de verdade.
    if (permName !== "ManageServer") {
      try {
        const serverId = message.serverId ?? message.server?.id ?? null;
        const cfg = serverId ? store.configDoServidor(serverId) : null;
        if (cfg && acessoMod.temCargoStaff(message, cfg)) return true;
      } catch {}
    }

    const member = message.member;
    if (!member) return false;

    if (typeof member.hasPermission === "function") {
      try { if (member.hasPermission(server, permName)) return true; } catch {}
    }

    let perms;
    if (typeof member.getPermissions === "function") perms = member.getPermissions();
    else if (typeof member.permissions === "number")  perms = member.permissions;
    else if (typeof member.permission === "number")   perms = member.permission;

    if (typeof perms === "number" && PERM[permName] != null) {
      if ((perms & PERM[permName]) === PERM[permName]) return true;
    }
    return false;
  } catch (err) {
    console.error("[PERM] Erro ao checar permissão:", err.message);
    return false;
  }
}

// ── Estado compartilhado entre os módulos ──────────────────
const estado = {
  spamData:       new Map(),   // userId → number[]  (timestamps)
  // avisos/silêncios agora ficam no BANCO (tabela punicoes), por (servidor, usuário)
  blockedDomains: new Set(),   // domínios bloqueados (anti-link)
};

// Objeto de contexto entregue a todas as funções dos módulos.
// Evita imports circulares: os módulos nunca importam o main.js.
// `serverId` determina QUAL config por-servidor entra em ctx.config.
function criarContexto(serverId = null) {
  const config = store.configDoServidor(serverId);

  // Num servidor em inglês, todo comando citado num embed sai na forma inglesa
  // (`&game create`, não `&game criar`). Fica aqui, no ponto por onde TODOS os
  // módulos passam, em vez de espalhado em cada texto de ajuda — assim nada
  // fica para trás e o que a pessoa lê é sempre o que funciona ao digitar.
  const enviarTraduzido = (canal, embed = {}) => sendEmbed(canal, {
    ...embed,
    title: aliases.exibir(embed.title, config?.language, PREFIXO, CANONICO),
    description: aliases.exibir(embed.description, config?.language, PREFIXO, CANONICO),
  });

  return {
    client, config, cfgGlobal, COR, PERM, PREFIXO,
    sendEmbed: enviarTraduzido, getServer, membroTemPermissao, ehSuperAdmin,
    salvarConfig: () => store.salvarConfigServidor(serverId),
    salvarGlobal: store.salvarGlobal,
    getGlobal: store.getGlobal,
    configDoServidor: store.configDoServidor,
    estado, serverId,
  };
}

// ── Tabela de roteamento: comando → handler do módulo ──────
const rotas = {
  // Gerais
  help:          geral.cmdHelp,
  ping:          geral.cmdPing,
  sobre:         geral.cmdSobre,
  info:          geral.cmdSobre,
  about:         geral.cmdSobre,
  repete:        geral.cmdRepete,
  userinfo:      geral.cmdUserinfo,
  kick:          geral.cmdKick,
  ban:           geral.cmdBan,
  limpar:        limpar.cmdLimpar,
  clear:         limpar.cmdLimpar,
  purge:         limpar.cmdLimpar,
  limpiar:       limpar.cmdLimpar,
  // AutoMod
  warn:          warnMod.cmdWarn,
  avisar:        warnMod.cmdWarn,
  acesso:        acessoMod.cmdAcesso,
  servidores:    srvStats.cmdServidores,
  servers:       srvStats.cmdServidores,
  warnings:      automodCmd.cmdWarnings,
  clearwarnings: automodCmd.cmdClearwarnings,
  automod:       automodCmd.cmdAutomod,
  whitelist:     automodCmd.cmdWhitelist,
  blocklist:     automodCmd.cmdBlocklist,
  sentinela:     automodCmd.cmdScam,
  punicao:       automodCmd.cmdPunicao,
  punição:       automodCmd.cmdPunicao,
  tutorial:      tutorial.cmdTutorial,
  guia:          tutorial.cmdTutorial,
  comecar:       tutorial.cmdTutorial,
  inicio:        tutorial.cmdTutorial,
  // Logs
  log:           log.cmdLog,
  logs:          log.cmdLog,
  // Panorama de configurações
  config:        cfgCmd.cmdConfig,
  banglobal:     banGlobal.cmdBanGlobal,
  globalban:     banGlobal.cmdBanGlobal,
  configuracoes: cfgCmd.cmdConfig,
  configurações: cfgCmd.cmdConfig,
  // Administração de comandos e cargo de silêncio
  comando:       admin.cmdComando,
  comandos:      admin.cmdComando,
  cargomudo:     admin.cmdCargoMudo,
  cor:           corCargo.cmdCor,
  cores:         corCargo.cmdCor,
  cargocor:      corCargo.cmdCor,
  criarcargomudo: admin.cmdCargoMudo,
  // Embed customizável e cargos por reação
  embed:         embedCmd.cmdEmbed,
  reactionrole:  reactionRoles.cmdReactionRole,
  rr:            reactionRoles.cmdReactionRole,
  // Diagnóstico
  debug:         debugCmd.cmdDebug,
  diagnostico:   debugCmd.cmdDebug,
  diagnóstico:   debugCmd.cmdDebug,
  // Conversa com IA local
  chat:          chat.cmdChat,
  ia:            chat.cmdChat,
  modia:         modiaCmd.cmdModIA,
  moderacaoia:   modiaCmd.cmdModIA,
  rss:           rss.cmdRss,
  feed:          rss.cmdRss,
  autorole:      autorole.cmdAutorole,
  game:          rpg.cmdGame,
  rpg:           rpg.cmdGame,
  personagem:    rpg.cmdGame,
  xp:            nivel.cmdXp,
  nivel:         nivel.cmdXp,
  level:         nivel.cmdXp,
  // Idioma do servidor (pt | en)
  idioma:        i18n.cmdIdioma,
  language:      i18n.cmdIdioma,
  lang:          i18n.cmdIdioma,
};

// Aliases → nome canônico (para desativar um comando desativa todos os apelidos).
const CANONICO = {
  nivel: "xp",
  level: "xp",
  avisar: "warn",
  rpg: "game",
  personagem: "game",
  cores: "cor",
  cargocor: "cor",
  guia: "tutorial",
  comecar: "tutorial",
  inicio: "tutorial",
  logs: "log",
  clear: "limpar", purge: "limpar", limpiar: "limpar",
  punição: "punicao",
  globalban: "banglobal",
  configuracoes: "config", configurações: "config",
  diagnostico: "debug", "diagnóstico": "debug",
  language: "idioma", lang: "idioma",
  // `scam` virou `sentinela`: o módulo deixou de ser só anti-golpe (hoje pesa
  // conteúdo grave, venda, links, padrão de conta nova e rigor por antiguidade).
  // O nome antigo continua valendo — ninguém precisa reaprender um comando.
  scam: "sentinela", antiscam: "sentinela", sentry: "sentinela", guard: "sentinela",
  // Nomes em inglês dos comandos cujo nome PT não é óbvio para quem lê em
  // inglês. Ficam aqui e não espalhados nas rotas para haver um lugar só onde
  // conferir "isto existe nos dois idiomas?".
  ...aliases.COMANDO_EXTRA,
};

// ══════════════════════════════════════════════════════════
//  Comandos exclusivos dos servidores com IA
//
//  A IA roda num servidor de cada vez (a allowlist CHAT_SERVIDORES). Nos demais,
//  esses comandos não existem: não aparecem no help, não entram na lista do
//  &comando, e a rota responde que não está habilitado — em vez de aceitar o
//  comando e falhar lá dentro, que é pior de entender.
// ══════════════════════════════════════════════════════════
const COMANDOS_SO_IA = new Set(["chat", "modia"]);
estado.COMANDOS_SO_IA = COMANDOS_SO_IA;

// Comandos que o admin pode ligar/desligar (nomes canônicos, sem os essenciais).
const COMANDOS_GERENCIAVEIS = [
  "ping", "repete", "userinfo", "kick", "ban", "limpar",
  "warnings", "clearwarnings", "warn", "acesso", "automod", "whitelist", "blocklist",
  "sentinela", "punicao", "tutorial", "cor", "log", "banglobal", "embed", "reactionrole", "chat", "rss", "xp", "game", "autorole",
];
// exportado via ctx para o comando &comando consultar
estado.CANONICO = CANONICO;
estado.COMANDOS_GERENCIAVEIS = COMANDOS_GERENCIAVEIS;
// Versão filtrada por servidor: esconde os comandos de IA onde ela não roda.
estado.comandosGerenciaveisDe = (sid) => {
  const comIA = (() => { try { return chat.servidorPermitido(sid); } catch { return false; } })();
  return comIA ? COMANDOS_GERENCIAVEIS : COMANDOS_GERENCIAVEIS.filter((c) => !COMANDOS_SO_IA.has(c));
};
// Os aliases em inglês viram rotas de verdade: se o help mostra
// `&game create`, digitar isso tem que funcionar.
for (const [alias, canonico] of Object.entries(aliases.COMANDO_EXTRA)) {
  if (!rotas[alias] && rotas[canonico]) rotas[alias] = rotas[canonico];
}
// Os apelidos do CANONICO também precisam existir como rota. Antes só o
// COMANDO_EXTRA virava rota, então renomear `scam` para `sentinela` deixava
// o nome antigo apontando para lugar nenhum — quebrando o comando de quem
// já tinha o hábito.
for (const [alias, canonico] of Object.entries(CANONICO)) {
  if (!rotas[alias] && rotas[canonico]) rotas[alias] = rotas[canonico];
}
estado.rotas = rotas;
estado.CANONICO_COMPLETO = CANONICO;

// ══════════════════════════════════════════════════════════
//  EVENTOS
// ══════════════════════════════════════════════════════════
let jaInicializou = false;
client.on("ready", async () => {
  console.info(`Logged in as ${client.user?.username}!`);
  console.info(`Token loaded: ${!!process.env.BOT_TOKEN}`);
  ultimoEvento = Date.now();

  // O evento 'ready' dispara em TODA reconexão. As tarefas pesadas abaixo
  // (baixar 3M+ domínios da blocklist, agendadores) só devem rodar uma vez.
  if (jaInicializou) {
    console.info("[BOOT] Reconexão — inicialização pesada já feita, pulando.");
    return;
  }
  jaInicializou = true;

  store.inicializar(CONFIG_PATH); // abre o banco e migra o config antigo
  cfgGlobal = store.getGlobal();

  // Status do bot (o texto que aparece embaixo do nome na lista de membros).
  // A stoat.js não expõe isso, então é REST direto — mesmo padrão do &cor.
  // Obs.: o status é GLOBAL da conta; servidores com prefixo padrão veem o certo.
  definirStatus().catch((e) => console.error("[STATUS]", e?.message ?? e));

  // Recarrega as mensagens de reaction role: sem isso, depois de um restart a
  // lib não emite eventos de reação para elas e os cargos param de ser dados.
  reactionRoles.precarregarMensagens(client).catch((e) => console.error("[REACTIONROLE][boot]", e?.message));

  rpg.iniciarCatalogo();   // semeia os itens genéricos (idempotente)

  // Repara bases que já ficaram com moedas repetidas antes da checagem por
  // nome existir (dois conjuntos prontos traziam "Prata" com ids diferentes).
  // Roda em silêncio: é conserto de dado, não novidade para anunciar. Funde,
  // não apaga — os saldos vão para a moeda que fica.
  try {
    for (const sid of db.servidoresComMoeda()) {
      const feitos = db.fundirMoedasDuplicadas(sid);
      if (feitos.length) {
        console.info(`[RPG] ${sid}: ${feitos.length} moeda(s) duplicada(s) fundida(s) — `
          + feitos.map((f) => `${f.nome} → ${f.ficou}`).join(", "));
      }
    }
  } catch (e) {
    console.error("[RPG] Falha ao conferir moedas duplicadas:", e.message);
  }
  srvStats.marcarInicio();
  // Configuração de IA no log: um env perdido aqui só apareceria muito depois,
  // como "Ollama indisponível" — erro que aponta para o lugar errado.
  for (const l of chat.resumoConfigIA()) console.info(l);

  // Devolve a voz a quem cumpriu mute temporário. Precisa rodar sempre: o
  // prazo vive no banco, então sem esta rotina um mute de 1h viraria eterno
  // caso o bot reiniciasse no meio.
  engine.iniciarVigiaDeSilencios(criarContexto());

  chat.iniciarMemoria();          // liga o agente de memória (extração em background)
  chat.iniciarComentario(client); // liga o comentário espontâneo
  modIA.configurar({ avaliar: chat.avaliarModeracao });   // moderação por IA usa o modelo pequeno
  rss.configurarResumo(chat.resumirRSS);   // RSS agendado passa a resumir com o tom da Judy

  const ctx = criarContexto();    // contexto sem servidor (tarefas globais)
  engine.agendarLimpezaSpam(ctx); // limpeza periódica do rastreio de spam
  engine.rebuildBlocklist(ctx);   // baixa as listas anti-link (assíncrono)

  // Curadoria RSS: agendador horário (só age nos servidores permitidos)
  const ctxRss = criarContexto();
  ctxRss.client = client;
  ctxRss.configDoServidor = store.configDoServidor;
  rss.iniciarAgendador(ctxRss);
});

client.on("messageCreate", async (message) => {
  ultimoEvento = Date.now();   // prova de vida: recebemos um evento
  if (message.authorId === client.user.id) return;

  if (cfgGlobal.debug !== false) {
    console.log(`[MSG] ${message.authorId} no canal ${message.channelId}: ${JSON.stringify(message.content)}`);
  }

  // Cada servidor tem sua própria config
  const serverId = message.serverId ?? message.server?.id ?? message.server?._id ?? null;
  srvStats.registrar(serverId);   // métrica de ritmo (memória, janela deslizante)
  const ctx = criarContexto(serverId);

  // Identifica se a mensagem é um COMANDO reconhecido
  let command = null, args = [];
  if (message.content.startsWith(PREFIXO)) {
    const parts = message.content.slice(PREFIXO.length).trim().split(/\s+/);
    command = parts[0]?.toLowerCase();
    args    = parts.slice(1);
  }
  const handler = command ? rotas[command] : null;

  // ── Menção ao bot → conversa com a IA (se o chat estiver ligado) ──
  // Dispara quando não é um comando e o bot foi mencionado.
  if (!command) {
    const meuId = client.user?.id;
    const mencionado =
      (Array.isArray(message.mentionIds) && meuId && message.mentionIds.includes(meuId)) ||
      (meuId && message.content?.includes(`<@${meuId}>`));
    if (mencionado && chat.servidorPermitido(serverId) && !(ctx.config.comandosDesativados ?? []).includes("chat")) {
      const pergunta = (message.content || "").replace(new RegExp(`<@${meuId}>`, "g"), "").trim();
      // conversa com a IA conta XP (é interação legítima)
      try { await nivel.aoMensagem(message, { ...ctx, client }); }
      catch (e) { console.error("[NIVEL]", e.message); }
      await chat.conversar(message, pergunta, ctx);
      return;
    }
  }

  // AutoMod roda em mensagens normais e em "comandos" desconhecidos —
  // mas NÃO em comandos válidos do bot. Assim, por exemplo, o convite
  // que você está adicionando com `&whitelist add <link>` não é apagado
  // pelo anti-invite antes de o comando rodar.
  if (!handler) {
    if (await engine.runAutomod(message, ctx)) return;
    // Moderação por IA (critérios em texto livre). Se apagou, para aqui.
    try {
      if (await modIA.moderar(message, { ...ctx, client })) return;
    } catch (e) { console.error("[MOD-IA]", e.message); }
  }

  // Game: concede XP por mensagem (só em mensagens normais que sobreviveram
  // ao automod; não conta comandos do bot).
  if (!command) {
    try { await nivel.aoMensagem(message, { ...ctx, client }); }
    catch (e) { console.error("[NIVEL]", e.message); }

    // Agente de memória: observa a mensagem (extração roda em background,
    // com debounce; não trava nada aqui). Só onde o chat é permitido.
    if (chat.servidorPermitido(serverId)) {
      const nome = message.author?.username ?? message.member?.nickname ?? message.authorId;
      chat.observarMensagem({
        serverId, userId: message.authorId, nome,
        texto: message.content, ehBot: !!message.author?.bot,
      });
      // Cache do canal: registra o fio da conversa (quem falou, a quem respondeu).
      const respNome = message.reply_ids?.length ? "uma mensagem anterior" : null;
      chat.registrarNoCanal(message.channelId, {
        nome, userId: message.authorId, texto: message.content, respondeuA: respNome,
      });
      // Comentário espontâneo: talvez a Judy dê um pitaco (só no canal escolhido,
      // com freios). Não bloqueia; roda em background.
      if (!message.author?.bot) {
        chat.observarParaComentario(message, { ...ctx, client });
      }
    }
  }

  // Conversa livre: a Judy pode entrar em canais configurados quando o assunto
  // vale (decisão dela). Se chegou aqui, a mensagem não é comando nem menção
  // (menção já teria retornado acima).
  if (!command) {
    chat.talvezResponderLivre(message, { ...ctx, client }).catch(() => {});
  }

  if (!command) return;            // mensagem normal, sem prefixo

  if (!handler) {                  // tinha prefixo, mas o comando não existe
    await sendEmbed(message.channel, tr(ctx, {
      title: "❓ Comando desconhecido",
      description: `Use \`${PREFIXO}help\` para ver os comandos disponíveis.`,
      colour: COR.aviso,
    }, {
      title: "❓ Unknown command",
      description: `Use \`${PREFIXO}help\` to see the available commands.`,
      colour: COR.aviso,
    }));
    return;
  }

  // Primeiro comando num servidor que nunca escolheu idioma → sugere UMA vez
  // (bilíngue, não bloqueia o comando atual).
  try { await i18n.talvezSugerirIdioma(message, ctx); }
  catch (e) { console.error("[I18N]", e?.message); }

  if (cfgGlobal.debug !== false) console.log(`[CMD] Executando "${command}" (args: ${JSON.stringify(args)})`);

  // ── Comandos desativados neste servidor ──
  // O nome canônico agrupa aliases (clear/purge → limpar). Comandos essenciais
  // (help e o próprio gerenciador) NUNCA podem ser desativados, para o admin
  // não se trancar para fora.
  const ESSENCIAIS = new Set(["help", "comando", "comandos", "command", "debug", "diagnostico", "diagnóstico", "idioma"]);
  const canonico = CANONICO[command] ?? command;

  // ── Comandos de IA fora do servidor com IA ──
  // Não é "desativado pelo admin": simplesmente não existe aqui.
  if (COMANDOS_SO_IA.has(canonico) && !chat.servidorPermitido(serverId)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Indisponível aqui",
      description: `\`${PREFIXO}${canonico}\` faz parte dos recursos de IA, que não estão habilitados neste servidor.\n\nVeja o que existe por aqui com \`${PREFIXO}help\`.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Unavailable here",
      description: `\`${PREFIXO}${canonico}\` is part of the AI features, which aren't enabled on this server.\n\nSee what's available here with \`${PREFIXO}help\`.`,
      colour: COR.aviso,
    }));
  }
  if (!ESSENCIAIS.has(canonico) && (ctx.config.comandosDesativados ?? []).includes(canonico)) {
    await log.registrar(ctx, "comandos", {
      titulo: "🚫 Comando desativado",
      descricao: `<@${message.authorId}> tentou usar \`${PREFIXO}${command}\`, que está desativado neste servidor.`,
    });
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Comando desativado",
      description: `O comando \`${PREFIXO}${canonico}\` está desativado neste servidor.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Command disabled",
      description: `The \`${PREFIXO}${canonico}\` command is disabled on this server.`,
      colour: COR.aviso,
    }));
  }

  // ── Restrição por canal ──
  // Quem tem cargo de staff (ou permissão nativa) pode escapar disso, conforme
  // a config. `acesso` e `debug` sempre passam, senão dá para se trancar fora.
  const SEMPRE_LIBERADOS = new Set(["acesso", "debug", "help", "tutorial", "idioma"]);
  if (!SEMPRE_LIBERADOS.has(canonico)) {
    const ehStaff = acessoMod.temCargoStaff(message, ctx.config)
      || membroTemPermissao(message, await getServer(message).catch(() => null), "ManagePermissions");
    const permitido = acessoMod.canalPermitido(message, ctx.config, { ehStaff });
    if (!permitido.ok) {
      console.log(`[ACESSO] ${message.authorId} usou ${canonico} em canal restrito`);
      return sendEmbed(message.channel, tr(ctx, {
        title: "🔐 Aqui não",
        description: `${permitido.motivo.charAt(0).toUpperCase()}${permitido.motivo.slice(1)}.`,
        colour: COR.aviso,
      }, {
        title: "🔐 Not here",
        description: "Commands are restricted in this channel by the server's access settings.",
        colour: COR.aviso,
      }));
    }
  }

  // Log de tentativa de uso de comando (categoria "comandos")
  await log.registrar(ctx, "comandos", {
    titulo: "⌨️ Comando usado",
    descricao: [
      `**Usuário:** <@${message.authorId}>`,
      `**Canal:** <#${message.channelId}>`,
      `**Comando:** \`${PREFIXO}${command}${args.length ? " " + args.join(" ") : ""}\``,
    ].join("\n"),
  });

  // Subcomandos em inglês viram os canônicos em PT antes do dispatch: os
  // módulos comparam com um token só, e quem digita escolhe o idioma.
  const argsFinais = aliases.normalizarArgs(canonico, args, CANONICO);

  try {
    await handler(message, argsFinais, ctx);
    // Conversar com a IA via comando (&chat) também conta XP — é interação.
    if ((CANONICO[command] ?? command) === "chat") {
      try { await nivel.aoMensagem(message, { ...ctx, client }); }
      catch (e) { console.error("[NIVEL]", e.message); }
    }
  } catch (err) {
    console.error(`[CMD:${command}] Erro:`, err);
    await sendEmbed(message.channel, tr(ctx, {
      title: "❌ Erro inesperado",
      description: "Algo deu errado ao executar o comando.",
      colour: COR.erro,
    }, {
      title: "❌ Unexpected error",
      description: "Something went wrong while running the command.",
      colour: COR.erro,
    }));
  }
});

// ── Reações (cargos por reação) ────────────────────────────
// A assinatura exata do evento na stoat.js pode variar; extraímos
// de forma defensiva e logamos os argumentos crus para diagnóstico.
client.on("messageReactionAdd", async (...a) => {
  ultimoEvento = Date.now();
  try {
    if (cfgGlobal.debug !== false) {
      console.log("[REAÇÃO] args:", a.map((x) =>
        (x && typeof x === "object") ? (x.id ?? x._id ?? Object.keys(x)) : x));
    }

    let msgId, userId, emoji;
    const [a0, a1, a2] = a;

    if (typeof a0 === "string") msgId = a0;
    else if (a0 && typeof a0 === "object") {
      msgId  = a0.id ?? a0._id ?? a0.messageId ?? a0.message?.id ?? a0.message?._id;
      userId = a0.userId ?? a0.user_id ?? a0.user?.id;
      emoji  = a0.emoji ?? a0.emojiId ?? a0.emoji_id;
    }
    if (!userId) userId = (typeof a1 === "string") ? a1 : (a1?.id ?? a1?.userId ?? a1?.user_id);
    if (!emoji)  emoji  = (typeof a2 === "string") ? a2 : (a2?.emoji ?? a2?.id ?? a2?.emoji_id)
                        ?? ((typeof a1 === "string") ? a2 : undefined);

    if (userId && client.user && userId === client.user.id) return; // ignora o próprio bot

    // Reaction roles — dá o cargo se a (mensagem, emoji) estiver registrada.
    //    O objeto da mensagem (a0) traz o id; passamos ctx com acesso à config.
    const msgObj = (a0 && typeof a0 === "object") ? a0 : { id: msgId };
    const ctxRR = criarContexto(null);
    ctxRR.configDoServidor = store.configDoServidor;   // p/ o log usar a config certa
    await reactionRoles.aoReagir(msgObj, userId, emoji, ctxRR);
  } catch (err) {
    console.error("[REAÇÃO] erro:", err.message);
  }
});

// Tirar a reação devolve o cargo (espelho do handler acima).
client.on("messageReactionRemove", async (...a) => {
  ultimoEvento = Date.now();
  try {
    if (cfgGlobal.debug !== false) {
      console.log("[REAÇÃO-] args:", a.map((x) =>
        (x && typeof x === "object") ? (x.id ?? x._id ?? Object.keys(x)) : x));
    }

    let msgId, userId, emoji;
    const [a0, a1, a2] = a;

    if (typeof a0 === "string") msgId = a0;
    else if (a0 && typeof a0 === "object") {
      msgId  = a0.id ?? a0._id ?? a0.messageId ?? a0.message?.id ?? a0.message?._id;
      userId = a0.userId ?? a0.user_id ?? a0.user?.id;
      emoji  = a0.emoji ?? a0.emojiId ?? a0.emoji_id;
    }
    if (!userId) userId = (typeof a1 === "string") ? a1 : (a1?.id ?? a1?.userId ?? a1?.user_id);
    if (!emoji)  emoji  = (typeof a2 === "string") ? a2 : (a2?.emoji ?? a2?.id ?? a2?.emoji_id)
                        ?? ((typeof a1 === "string") ? a2 : undefined);

    if (userId && client.user && userId === client.user.id) return; // ignora o próprio bot

    // Reaction roles — dá o cargo se a (mensagem, emoji) estiver registrada.
    //    O objeto da mensagem (a0) traz o id; passamos ctx com acesso à config.
    const msgObj = (a0 && typeof a0 === "object") ? a0 : { id: msgId };
    const ctxRR = criarContexto(null);
    ctxRR.configDoServidor = store.configDoServidor;   // p/ o log usar a config certa
    await reactionRoles.aoDesreagir(msgObj, userId, emoji, ctxRR);
  } catch (err) {
    console.error("[REAÇÃO-] erro:", err.message);
  }
});

// ══════════════════════════════════════════════════════════
//  EVENTOS DE SERVIDOR (punição persistente + chat de logs)
//  Assinaturas conferidas na stoat.js 7.3.6:
//    serverMemberJoin:   [member]          member.id = { server, user }
//    serverMemberLeave:  [member]
//    serverMemberUpdate: [member, anterior]
//    messageDelete:      [message]         ← objeto CRU: só tem channelId!
//    messageUpdate:      [message, anterior]
//    serverRoleUpdate:   [server, roleId, anterior]
//    serverRoleDelete:   [server, roleId, role]
// ══════════════════════════════════════════════════════════

// O payload de messageDelete/messageUpdate é o objeto "hydrated" cru:
// tem channelId, mas NÃO tem serverId. Descobrimos o servidor pelo canal.
async function servidorDoCanal(canalId) {
  if (!canalId) return null;
  try {
    const canal = client.channels.get(canalId)
              ?? await client.channels.fetch(canalId).catch(() => null);
    return canal?.serverId ?? canal?.server?.id ?? null;
  } catch { return null; }
}

// ENTRADA: reaplica punição ativa (fecha o furo do "sair e voltar")
client.on("serverMemberJoin", async (member) => {
  ultimoEvento = Date.now();
  try {
    const serverId = member?.id?.server;
    const userId   = member?.id?.user;
    if (!serverId || !userId) return;

    const ctx = criarContexto(serverId);

    await log.registrar(ctx, "membros", {
      titulo: "📥 Membro entrou",
      descricao: `<@${userId}> entrou no servidor.`,
    });

    // Lista global: pode banir automaticamente (se o servidor optou por isso)
    const banido = await banGlobal.verificarEntrada(member, ctx);
    if (banido) return;   // já foi banido: não faz sentido dar cargo/reaplicar silêncio

    await autorole.aoEntrar(member, ctx);          // ← cargo automático (se configurado)
    await engine.reaplicarPunicao(member, ctx);   // ← reaplica o silêncio, se houver
  } catch (err) { console.error("[EVENTO][JOIN]", err?.message); }
});

// SAÍDA
client.on("serverMemberLeave", async (member, extra) => {
  try {
    // O payload é cru (HydratedServerMember). O id normalmente é {server, user},
    // mas dependendo do evento pode vir de outras formas — tentamos várias.
    const serverId = member?.id?.server ?? member?._id?.server ?? member?.serverId ?? member?.server?.id
                  ?? (typeof member === "string" ? member : null);
    const userId   = member?.id?.user ?? member?._id?.user ?? member?.userId ?? member?.user?.id
                  ?? (typeof extra === "string" ? extra : extra?.user);

    if (cfgGlobal.debug !== false) {
      console.log(`[EVENTO] serverMemberLeave: server=${serverId} user=${userId}`);
    }
    if (!serverId || !userId) {
      if (cfgGlobal.debug !== false) {
        console.log("[EVENTO] serverMemberLeave: id incompleto — payload:",
          JSON.stringify(member)?.slice(0, 200));
      }
      return;
    }
    const ctx = criarContexto(serverId);
    await log.registrar(ctx, "membros", {
      titulo: "📤 Membro saiu",
      descricao: `<@${userId}> saiu do servidor (saída, expulsão ou ban).`,
    });
  } catch (err) { console.error("[EVENTO][LEAVE]", err?.message); }
});

// CARGOS DADOS A UM USUÁRIO (compara a lista antes/depois)
client.on("serverMemberUpdate", async (member, anterior) => {
  try {
    const serverId = member?.id?.server;
    const userId   = member?.id?.user;
    if (!serverId || !userId) return;

    const antes  = (anterior?.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    const agora  = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    const ganhou = agora.filter((r) => !antes.includes(r));
    const perdeu = antes.filter((r) => !agora.includes(r));
    if (!ganhou.length && !perdeu.length) return;

    const ctx = criarContexto(serverId);
    const partes = [];
    if (ganhou.length) partes.push(`**Recebeu:** ${ganhou.map((r) => `\`${r}\``).join(", ")}`);
    if (perdeu.length) partes.push(`**Perdeu:** ${perdeu.map((r) => `\`${r}\``).join(", ")}`);
    await log.registrar(ctx, "cargos", {
      titulo: "🏷 Cargos alterados",
      descricao: `<@${userId}>\n${partes.join("\n")}`,
    });
  } catch (err) { console.error("[EVENTO][MEMBER_UPDATE]", err?.message); }
});

// MENSAGEM APAGADA
// O payload é cru (sem serverId) → derivamos do channelId.
client.on("messageDelete", async (message) => {
  ultimoEvento = Date.now();
  try {
    if (cfgGlobal.debug !== false) {
      console.log(`[EVENTO] messageDelete: canal=${message?.channelId} autor=${message?.authorId}`);
    }
    if (message?.authorId === client.user?.id) return;  // ignora o próprio bot

    const serverId = await servidorDoCanal(message?.channelId);
    if (!serverId) {
      if (cfgGlobal.debug !== false) console.log("[EVENTO] messageDelete: sem servidor (DM?) — ignorado");
      return;
    }
    const ctx = criarContexto(serverId);
    const texto = (message?.content ?? "").slice(0, 500) || "_(sem texto)_";
    const autor = message?.authorId ? `<@${message.authorId}>` : "_desconhecido_";
    await log.registrar(ctx, "mensagens", {
      titulo: "🗑 Mensagem apagada",
      descricao: `**Autor:** ${autor}\n**Canal:** <#${message.channelId}>\n**Conteúdo:** ${texto}`,
    });
  } catch (err) { console.error("[EVENTO][MSG_DELETE]", err?.message); }
});

// MENSAGEM EDITADA
client.on("messageUpdate", async (message, anterior) => {
  ultimoEvento = Date.now();
  try {
    const canalId = message?.channelId ?? anterior?.channelId;
    if (message?.authorId === client.user?.id) return;

    const serverId = await servidorDoCanal(canalId);
    if (!serverId) return;

    const antes = (anterior?.content ?? "").slice(0, 300);
    const agora = (message?.content ?? "").slice(0, 300);
    if (antes === agora) return;   // edições sem mudança de texto (ex.: embeds)

    const ctx = criarContexto(serverId);
    const autor = message?.authorId ?? anterior?.authorId;
    await log.registrar(ctx, "mensagens", {
      titulo: "✏️ Mensagem editada",
      descricao: [
        `**Autor:** ${autor ? `<@${autor}>` : "_desconhecido_"}`,
        `**Canal:** <#${canalId}>`,
        `**Antes:** ${antes || "_(vazio)_"}`,
        `**Depois:** ${agora || "_(vazio)_"}`,
      ].join("\n"),
    });
  } catch (err) { console.error("[EVENTO][MSG_UPDATE]", err?.message); }
});

// APAGADAS EM MASSA (limpeza de canal)
client.on("messageDeleteBulk", async (mensagens, canal) => {
  try {
    const canalId = canal?.id ?? mensagens?.[0]?.channelId;
    const serverId = canal?.serverId ?? await servidorDoCanal(canalId);
    if (!serverId) return;
    const ctx = criarContexto(serverId);
    await log.registrar(ctx, "mensagens", {
      titulo: "🗑 Mensagens apagadas em massa",
      descricao: `**${mensagens?.length ?? 0}** mensagem(ns) removida(s) em <#${canalId}>.`,
    });
  } catch (err) { console.error("[EVENTO][MSG_BULK]", err?.message); }
});

// CARGO CRIADO / ATUALIZADO
client.on("serverRoleUpdate", async (server, roleId) => {
  try {
    const ctx = criarContexto(server?.id);
    await log.registrar(ctx, "cargos", {
      titulo: "🏷 Cargo criado/atualizado",
      descricao: `Cargo \`${roleId}\` foi criado ou modificado.`,
    });
  } catch (err) { console.error("[EVENTO][ROLE_UPDATE]", err?.message); }
});

// CARGO APAGADO
client.on("serverRoleDelete", async (server, roleId) => {
  try {
    const ctx = criarContexto(server?.id);
    await log.registrar(ctx, "cargos", {
      titulo: "🗑 Cargo apagado",
      descricao: `Cargo \`${roleId}\` foi removido do servidor.`,
    });
  } catch (err) { console.error("[EVENTO][ROLE_DELETE]", err?.message); }
});

// ── Login ──────────────────────────────────────────────────
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN || TOKEN.trim() === "" || TOKEN === "cole_seu_token_aqui") {
  console.error("\n══════════════════════════════════════════════════════════");
  console.error("❌ BOT_TOKEN não definido.");
  console.error("   Defina a variável de ambiente BOT_TOKEN com o token do bot.");
  console.error("   • Portainer/Dockge: adicione BOT_TOKEN no bloco 'environment' da stack.");
  console.error("     Depois RECRIE o container — 'restart' não aplica variável nova.");
  console.error("   • Rodando local: crie um .env no diretório de onde você chama o node.");
  console.error("══════════════════════════════════════════════════════════\n");
  process.exit(1);
}
client.loginBot(TOKEN);
