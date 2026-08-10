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
import * as modIA      from "./modulos/moderacao/moderacao-ia.js";
import * as modiaCmd   from "./modulos/moderacao/modia-comando.js";
import * as debugCmd  from "./modulos/moderacao/debug-comando.js";
import * as chat      from "./modulos/ai/chat.js";
import * as rss       from "./modulos/ferramentas/rss.js";
import * as nivel     from "./modulos/ferramentas/nivel.js";

const PREFIXO     = "&";
const CONFIG_PATH = process.env.CONFIG_PATH || "./automod-config.json";
const client      = new Client({ autoReconnect: true });

// ══════════════════════════════════════════════════════════
//  OBSERVABILIDADE E AUTO-RECUPERAÇÃO
//  Objetivo: nunca ficar "vivo mas surdo". Se a conexão morrer de um
//  jeito que a reconexão automática não resolve, reiniciamos o processo
//  (o Docker `restart: unless-stopped` sobe um novo, limpo).
// ══════════════════════════════════════════════════════════

let ultimoEvento = Date.now();       // quando recebemos o último evento do Stoat
let jaReiniciando = false;

// Reinício controlado: encerra o processo para o Docker subir de novo.
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
  return {
    client, config, cfgGlobal, COR, PERM, PREFIXO,
    sendEmbed, getServer, membroTemPermissao, ehSuperAdmin,
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
  warnings:      automodCmd.cmdWarnings,
  clearwarnings: automodCmd.cmdClearwarnings,
  automod:       automodCmd.cmdAutomod,
  whitelist:     automodCmd.cmdWhitelist,
  blocklist:     automodCmd.cmdBlocklist,
  scam:          automodCmd.cmdScam,
  punicao:       automodCmd.cmdPunicao,
  punição:       automodCmd.cmdPunicao,
  tutorial:      tutorial.cmdTutorial,
  guia:          tutorial.cmdTutorial,
  comecar:       tutorial.cmdTutorial,
  configurar:    cmdSetupRouter,
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
  game:          nivel.cmdGame,
  nivel:         nivel.cmdGame,
  level:         nivel.cmdGame,
};

// Aliases → nome canônico (para desativar um comando desativa todos os apelidos).
const CANONICO = {
  guia: "tutorial",
  comecar: "tutorial",
  inicio: "tutorial",
  logs: "log",
  clear: "limpar", purge: "limpar", limpiar: "limpar",
  punição: "punicao",
  globalban: "banglobal",
  configuracoes: "config", configurações: "config",
  diagnostico: "debug", "diagnóstico": "debug",
};

// Comandos que o admin pode ligar/desligar (nomes canônicos, sem os essenciais).
const COMANDOS_GERENCIAVEIS = [
  "ping", "repete", "userinfo", "kick", "ban", "limpar",
  "warnings", "clearwarnings", "automod", "whitelist", "blocklist",
  "scam", "punicao", "tutorial", "log", "banglobal", "embed", "reactionrole", "chat", "rss", "game", "autorole",
];
// exportado via ctx para o comando &comando consultar
estado.CANONICO = CANONICO;
estado.COMANDOS_GERENCIAVEIS = COMANDOS_GERENCIAVEIS;
estado.rotas = rotas;

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
    await sendEmbed(message.channel, {
      title: "❓ Comando desconhecido",
      description: `Use \`${PREFIXO}help\` para ver os comandos disponíveis.`,
      colour: COR.aviso,
    });
    return;
  }

  if (cfgGlobal.debug !== false) console.log(`[CMD] Executando "${command}" (args: ${JSON.stringify(args)})`);

  // ── Comandos desativados neste servidor ──
  // O nome canônico agrupa aliases (clear/purge → limpar). Comandos essenciais
  // (help e o próprio gerenciador) NUNCA podem ser desativados, para o admin
  // não se trancar para fora.
  const ESSENCIAIS = new Set(["help", "comando", "comandos", "command", "debug", "diagnostico", "diagnóstico"]);
  const canonico = CANONICO[command] ?? command;
  if (!ESSENCIAIS.has(canonico) && (ctx.config.comandosDesativados ?? []).includes(canonico)) {
    await log.registrar(ctx, "comandos", {
      titulo: "🚫 Comando desativado",
      descricao: `<@${message.authorId}> tentou usar \`${PREFIXO}${command}\`, que está desativado neste servidor.`,
    });
    return sendEmbed(message.channel, {
      title: "🚫 Comando desativado",
      description: `O comando \`${PREFIXO}${canonico}\` está desativado neste servidor.`,
      colour: COR.aviso,
    });
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

  try {
    await handler(message, args, ctx);
    // Conversar com a IA via comando (&chat) também conta XP — é interação.
    if ((CANONICO[command] ?? command) === "chat") {
      try { await nivel.aoMensagem(message, { ...ctx, client }); }
      catch (e) { console.error("[NIVEL]", e.message); }
    }
  } catch (err) {
    console.error(`[CMD:${command}] Erro:`, err);
    await sendEmbed(message.channel, {
      title: "❌ Erro inesperado",
      description: "Algo deu errado ao executar o comando.",
      colour: COR.erro,
    });
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
  console.error("   • Docker (compose): campo 'environment' → BOT_TOKEN=...");
  console.error("   • Portainer/Dockge: adicione a variável BOT_TOKEN na stack.");
  console.error("   • Local: crie um arquivo .env com  BOT_TOKEN=seu_token");
  console.error("══════════════════════════════════════════════════════════\n");
  process.exit(1);
}
client.loginBot(TOKEN);
