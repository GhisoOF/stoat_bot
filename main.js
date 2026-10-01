import 'dotenv/config';
import './modulos/core/env.js';

// A stoat.js emite "Skipping key X during hydration!" por console.DEBUG (uma
// linha por campo desconhecido de cada objeto: chega a 70% do log). O filtro
// ficava em console.log e por isso nunca funcionou.
// Erros e avisos do bot entram no relatório horário (&servidores relatorio),
// agrupados por padrão. Serviços filhos (ia/voz) escrevem direto no docker log.
for (const canal of ["error", "warn"]) {
  const original = console[canal].bind(console);
  console[canal] = (...args) => {
    original(...args);
    try { relatorioHora.erro(args.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" ")); } catch {}
  };
}
for (const canal of ["debug", "log"]) {
  const original = console[canal].bind(console);
  console[canal] = (...args) => {
    if (typeof args[0] === "string" && /^Skipping key \S+ during hydration!$/.test(args[0])) return;
    original(...args);
  };
}

import { Client, Permission } from "stoat.js";

import * as engine   from "./modulos/moderacao/automod-engine.js";
import * as automodCmd from "./modulos/moderacao/automod-comandos.js";
import * as geral   from "./modulos/moderacao/geral.js";
import * as store    from "./modulos/core/config-store.js";
import * as log      from "./modulos/core/log.js";
import * as cfgCmd   from "./modulos/moderacao/config-comando.js";
import * as banGlobal from "./modulos/moderacao/ban-global.js";
import * as limpar    from "./modulos/moderacao/limpar.js";
import * as admin     from "./modulos/moderacao/comandos-admin.js";
import * as embedCmd  from "./modulos/moderacao/embed.js";
import * as reactionRoles from "./modulos/ferramentas/reaction-roles.js";
import * as midia     from "./modulos/core/midia.js";
import * as autorole  from "./modulos/ferramentas/autorole.js";
import * as bemvindo  from "./modulos/ferramentas/boas-vindas.js";
import * as fuso      from "./modulos/ferramentas/fuso.js";
import * as ttsVoz    from "./modulos/ferramentas/tts.js";
import * as musicaCmd from "./modulos/ferramentas/musica.js";
import * as webhooks  from "./modulos/ferramentas/webhooks.js";
import * as dadosRpg  from "./modulos/ferramentas/dados-rpg.js";
import * as tickets   from "./modulos/ferramentas/tickets.js";
import * as staff     from "./modulos/moderacao/staff.js";
import * as tutorial   from "./modulos/moderacao/tutorial.js";
import * as corCargo   from "./modulos/moderacao/cor-cargo.js";
import * as acessoMod  from "./modulos/moderacao/acesso.js";
import * as warnMod    from "./modulos/moderacao/warn.js";
import * as silenciarMod from "./modulos/moderacao/silenciar.js";
import * as economiaMod from "./modulos/ferramentas/economia.js";
import * as srvStats   from "./modulos/core/metricas.js";
import * as rpg        from "./modulos/game/game.js";
import * as modIA      from "./modulos/moderacao/moderacao-ia.js";
import * as modiaCmd   from "./modulos/moderacao/modia-comando.js";
import * as persona    from "./modulos/ai/persona.js";
import * as debugCmd  from "./modulos/moderacao/debug-comando.js";
import { dirigidoAoBot } from "./modulos/ai/destinatario.js";
import * as chat      from "./modulos/ai/chat.js";
import * as rss       from "./modulos/ferramentas/rss.js";
import * as nivel     from "./modulos/ferramentas/nivel.js";
import * as i18n      from "./modulos/core/i18n.js";
import * as aliases   from "./modulos/core/aliases.js";
import * as paginas   from "./modulos/core/paginas.js";
import * as assistente from "./modulos/moderacao/assistente.js";
import { tr }         from "./modulos/core/i18n.js";
import { chamarApi }  from "./modulos/core/stoat-api.js";
import { vigiarConexao } from "./modulos/core/vida.js";
import { comandosPorLinha, mensagemDaLinha } from "./modulos/core/lote.js";
import * as relatorioHora from "./modulos/ferramentas/relatorio.js";
import * as servidoresCmd from "./modulos/moderacao/servidores.js";
import { descreverErro } from "./modulos/core/erros.js";
import * as confianca from "./modulos/moderacao/confianca.js";

const PREFIXO     = "&";
const CONFIG_PATH = process.env.CONFIG_PATH || "./automod-config.json";
const client      = new Client({ autoReconnect: true });

let ultimoEvento = Date.now();       // quando recebemos o último evento do Stoat
// Vida medida pelo heartbeat do protocolo (Pong a cada 30s), não pelo chat.
// Ver modulos/core/vida.js — o watchdog antigo reiniciava o bot de madrugada.
vigiarConexao(client.events, () => { ultimoEvento = Date.now(); });
let jaConectou = false;              // o login chegou a dar certo alguma vez?
let jaReiniciando = false;

// Desligamento pedido de fora (docker restart, recreate, deploy): o
// iniciar.js repassa o SIGTERM. Fica registrado para o relatório horário não
// chamar manutenção de "instabilidade" (foi o que ele fez em 27/09).
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => {
    relatorioHora.evento(null, "desligar", "deploy/restart");
    process.exit(0);
  });
}

function reiniciar(motivo) {
  if (jaReiniciando) return;
  jaReiniciando = true;
  console.error(`[RECUPERAÇÃO] Reiniciando o processo: ${motivo}`);
  relatorioHora.evento(null, "desligar", "watchdog");
  // dá um instante para o log sair antes de sair
  setTimeout(() => process.exit(1), 500);
}

function ehErroDeConexao(txt) {
  return /socket closed|ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|fetch failed|write after end|not opened|WebSocket|getaddrinfo/i
    .test(txt || "");
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
client.on("connected", () => {
  ultimoEvento = Date.now(); jaConectou = true;
  console.info("[CONN] Conectado (WebSocket ativo).");
});
client.on("disconnected", () => console.warn("[CONN] ⚠️ DESCONECTADO do Stoat — aguardando reconexão…"));

const INATIVIDADE_MS = Number(process.env.INATIVIDADE_MS || 600000); // 10 min sem eventos → reinicia
setInterval(() => {
  const ocioso = Date.now() - ultimoEvento;

  if (!jaConectou && ocioso > 120_000) {
    reiniciar("2min de pé sem nunca ter conectado ao Stoat (login não completou)");
    return;
  }

  if (ocioso > INATIVIDADE_MS) {
    reiniciar(`sem eventos do Stoat há ${Math.round(ocioso / 60000)}min (nem o heartbeat do Stoat respondeu — conexão morta de verdade)`);
  }
}, 60000);

const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 300000); // 5 min
setInterval(() => {
  const ociosoMin = Math.round((Date.now() - ultimoEvento) / 60000);
  const mem = Math.round(process.memoryUsage().rss / 1048576);
  console.info(`[VIVO] bot ${jaConectou ? "ativo" : "AINDA SEM CONECTAR"} | RAM ${mem}MB | sem eventos há ${ociosoMin}min`);
}, HEARTBEAT_MS);

const COR = {
  sucesso: "#3BA55D",
  erro:    "#ED4245",
  aviso:   "#FAA61A",
  info:    "#5865F2",
  mod:     "#9B59B6",
};

let cfgGlobal = store.getGlobal();  // atualizado após inicializar()

// Resposta longa vira páginas (◀ ▶), como no &help — em vez de ser cortada.
// Vale para TODO comando: o corte ficava aqui, então a solução também fica.
async function sendEmbed(channel, embed) {
  if (paginas.precisaPaginar(embed)) {
    let lang = "pt";
    try { lang = store.configDoServidor(channel?.serverId)?.language === "en" ? "en" : "pt"; } catch {}
    return paginas.enviarEmPaginas(enviarEmbedUnico, channel, { colour: COR.info, ...embed }, { lang, COR });
  }
  return enviarEmbedUnico(channel, embed);
}

async function enviarEmbedUnico(channel, { title, description, colour = COR.info, imagem = null, anexos = null, ocultarLink = true }) {
  if (!channel || typeof channel.sendMessage !== "function") {
    console.error("[EMBED] Canal indisponível — mensagem não enviada:", title ?? description);
    return;
  }
  const erroStr = (e) => e?.message ?? e?.type ?? (typeof e === "object" ? JSON.stringify(e) : String(e));
  let desc = description ?? "";
  // Último recurso: só chega aqui texto longo que tem imagem ou anexo junto
  // (esse não dá para paginar). Fica registrado para não passar despercebido.
  if (desc.length > paginas.LIMITE_EMBED) {
    console.warn(`[EMBED] "${title ?? ""}" com mídia e ${desc.length} caracteres — cortado em ${paginas.LIMITE_EMBED}`);
    desc = desc.slice(0, paginas.LIMITE_EMBED - 5) + "…";
  }
  const base = { title, description: desc, colour };
  console.log(`[CMD] ${title ?? "(sem título)"} | ${desc.replace(/\n/g, " ⏎ ").slice(0, 400)}`);
  const exibicao = imagem ? midia.comoExibir(imagem) : null;
  const payload = { embeds: [base] };
  if (exibicao?.modo === "media") payload.embeds = [{ ...base, media: exibicao.id }];
  else if (exibicao?.modo === "link") payload.content = midia.formatarLinkConteudo(exibicao.url, ocultarLink);
  if (Array.isArray(anexos) && anexos.length) payload.attachments = anexos.slice(0, 4);

  try {
    return await channel.sendMessage(payload);
  } catch (err) {
    console.error("[EMBED] Falha ao enviar embed:", erroStr(err));
    if (exibicao) {
      try {
        const m = await channel.sendMessage({ embeds: [base] });
        console.warn("[EMBED] Imagem recusada, enviei sem capa:", String(imagem).slice(0, 120));
        return m;
      } catch (err2) {
        console.error("[EMBED] Sem imagem também falhou:", erroStr(err2));
      }
    }
    // fallback: texto puro, ainda mais curto
    try {
      return await channel.sendMessage([title, desc].filter(Boolean).join("\n").slice(0, 1500));
    } catch (err3) {
      console.error("[EMBED] Fallback de texto também falhou:", erroStr(err3));
    }
  }
}

async function definirStatus() {
  if (!process.env.BOT_TOKEN) return;
  const texto = process.env.STATUS_TEXT
    || `prefix: ${PREFIXO}`;
  const r = await chamarApi("/users/@me", {
    metodo: "PATCH",
    corpo: { status: { text: texto.slice(0, 128), presence: "Online" } },
  });
  if (!r.ok) throw new Error(r.erro ?? `HTTP ${r.status} ${r.texto.slice(0, 200)}`);
  console.info(`[STATUS] Definido: "${texto}"`);
}

async function getServer(message) {
  if (message.server)   return message.server;
  if (message.serverId) return await client.servers.fetch(message.serverId);
  throw new Error("Servidor não encontrado.");
}

const SUPER_ADMINS = new Set(
  (process.env.SUPER_ADMINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean)
);
function ehSuperAdmin(userId) {
  return !!userId && SUPER_ADMINS.has(userId);
}

function membroTemPermissao(message, server, permName) {
  try {
    const userId = message.authorId;
    if (ehSuperAdmin(userId)) return true;              // dono do bot: controle total
    if (server?.ownerId && server.ownerId === userId) return true;

    if (permName !== "ManageServer") {
      try {
        const serverId = message.serverId ?? message.server?.id ?? null;
        const cfg = serverId ? store.configDoServidor(serverId) : null;
        if (cfg && acessoMod.temCargoStaff(message, cfg)) return true;
      } catch {}
    }

    // Só `hasPermission`. O fallback antigo comparava máscaras `number` com o
    // resultado de `getPermissions()`, que na stoat.js 7 é `bigint` e exige um
    // alvo — nunca dava true, era código morto. E um nome fora do enum (o erro
    // clássico: "ManageRoles" no plural) fazia a lib lançar
    // `Cannot mix BigInt and other types`, que o catch engolia virando `false`
    // silencioso; por isso a checagem do nome vem antes, e em voz alta.
    if (!(permName in Permission)) {
      console.error(`[PERM] Permissão desconhecida: "${permName}" — use o nome exato da stoat.js (singular).`);
      return false;
    }
    const member = message.member;
    if (!member) return false;
    return member.hasPermission?.(server, permName) === true;
  } catch (err) {
    console.error("[PERM] Erro ao checar permissão:", err.message);
    return false;
  }
}

const estado = {
  spamData:       new Map(),   // userId → number[]  (timestamps)
  ecoData:        new Map(),   // "server:user" → { d, t }[]  (digitais recentes)
  blockedDomains: engine.criarIndiceVazio(),
};

function criarContexto(serverId = null) {
  const config = store.configDoServidor(serverId);

  const enviarTraduzido = (canal, embed = {}) => sendEmbed(canal, {
    ...embed,
    title: aliases.exibir(embed.title, config?.language, PREFIXO, CANONICO),
    description: aliases.exibir(embed.description, config?.language, PREFIXO, CANONICO),
  });

  return {
    client, config, cfgGlobal, COR, PREFIXO,
    sendEmbed: enviarTraduzido, getServer, membroTemPermissao, ehSuperAdmin,
    // A mesma tradução, para quem EDITA um embed já enviado (páginas).
    exibir: (texto) => aliases.exibir(texto, config?.language, PREFIXO, CANONICO),
    getServerPorId: async (sid) => {
      if (!sid) return null;
      return client.servers.get?.(sid) ?? await client.servers.fetch(sid).catch(() => null);
    },
    salvarConfig: () => store.salvarConfigServidor(serverId),
    salvarGlobal: store.salvarGlobal,
    getGlobal: store.getGlobal,
    configDoServidor: store.configDoServidor,
    estado, serverId,
  };
}

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
  silenciar:     silenciarMod.cmdSilenciar,
  limpar:        limpar.cmdLimpar,
  clear:         limpar.cmdLimpar,
  purge:         limpar.cmdLimpar,
  limpiar:       limpar.cmdLimpar,
  // AutoMod
  warn:          warnMod.cmdWarn,
  avisar:        warnMod.cmdWarn,
  acesso:        acessoMod.cmdAcesso,
  personalidade: persona.cmdPersonalidade,
  personality:   persona.cmdPersonalidade,
  automod:       automodCmd.cmdAutomod,
  tutorial:      tutorial.cmdTutorial,
  assistente:    assistente.cmdAssistente,
  wizard:        assistente.cmdAssistente,
  guia:          tutorial.cmdTutorial,
  comecar:       tutorial.cmdTutorial,
  inicio:        tutorial.cmdTutorial,
  // Logs
  log:           log.cmdLog,
  logs:          log.cmdLog,
  // Panorama de configurações
  config:        cfgCmd.cmdConfig,
  banglobal:     banGlobal.cmdBanGlobal,
  servidores:    servidoresCmd.cmdServidores,   // só SUPER_ADMINS; fora do &help
  servers:       servidoresCmd.cmdServidores,
  globalban:     banGlobal.cmdBanGlobal,
  configuracoes: cfgCmd.cmdConfig,
  configurações: cfgCmd.cmdConfig,
  // Administração de comandos (o &cargomudo só avisa que foi aposentado)
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
  // Equipe do servidor (mesma lista de cargos do &acesso)
  staff:         staff.cmdStaff,
  equipe:        staff.cmdStaff,
  // Voz nas calls (TTS)
  tts:           ttsVoz.cmdTts,
  musica:        musicaCmd.cmdMusica,
  webhook:       webhooks.cmdWebhook,
  rolar:         dadosRpg.cmdRolar,
  iniciativa:    dadosRpg.cmdIniciativa,
  ticket:        tickets.cmdTicket,
  economia:      economiaMod.cmdEconomia,
  // `&entrar`/`&sair` são a forma canônica. O cmdTts ainda faz o trabalho, mas
  // só aceita "entrar"/"sair" vindos daqui — `&tts entrar` deixou de existir.
  entrar:        (msg, args, ctx) => ttsVoz.cmdTts(msg, ["entrar", ...args], { ...ctx, viaAtalhoVoz: true }),
  sair:          (msg, args, ctx) => ttsVoz.cmdTts(msg, ["sair", ...args], { ...ctx, viaAtalhoVoz: true }),
  voz:           ttsVoz.cmdTts,
  falar:         ttsVoz.cmdTts,
  // Relógio com vários fusos
  fuso:          fuso.cmdFuso,
  fusos:         fuso.cmdFuso,
  hora:          fuso.cmdFuso,
  timezone:      fuso.cmdFuso,
  // Mensagens de entrada e saída
  boasvindas:    bemvindo.cmdBoasVindas,
  "boas-vindas": bemvindo.cmdBoasVindas,
  welcome:       bemvindo.cmdBoasVindas,
  adeus:         bemvindo.cmdAdeus,
  goodbye:       bemvindo.cmdAdeus,
  despedida:     bemvindo.cmdAdeus,
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
  mute: "silenciar", timeout: "silenciar", silencio: "silenciar",
  rpg: "game",
  personagem: "game",
  cores: "cor",
  cargocor: "cor",
  guia: "tutorial",
  wizard: "assistente", setup: "assistente", configurar: "assistente",
  comecar: "tutorial",
  inicio: "tutorial",
  logs: "log",
  equipe: "staff",
  fusos: "fuso", hora: "fuso", timezone: "fuso", timezones: "fuso", tz: "fuso",
  voz: "tts", falar: "tts", speak: "tts",
  m: "musica", music: "musica", play: "musica", tocar: "musica",
  join: "entrar", call: "entrar", leave: "sair", sairdacall: "sair",
  webhooks: "webhook", gancho: "webhook", wh: "webhook",
  r: "rolar", roll: "rolar", dado: "rolar", dados: "rolar",
  eco: "economia", economy: "economia",
  init: "iniciativa", initiative: "iniciativa",
  tickets: "ticket", suporte: "ticket",
  "boas-vindas": "boasvindas", welcome: "boasvindas", bemvindo: "boasvindas",
  goodbye: "adeus", despedida: "adeus", farewell: "adeus",
  clear: "limpar", purge: "limpar", limpiar: "limpar",
  globalban: "banglobal",
  configuracoes: "config", configurações: "config",
  diagnostico: "debug", "diagnóstico": "debug",
  language: "idioma", lang: "idioma",
  ...aliases.COMANDO_EXTRA,
};

const COMANDOS_SO_IA = new Set(["chat", "modia"]);
estado.COMANDOS_SO_IA = COMANDOS_SO_IA;

// Comandos que o admin pode ligar/desligar (nomes canônicos, sem os essenciais).
const COMANDOS_GERENCIAVEIS = [
  "ping", "repete", "userinfo", "kick", "ban", "silenciar", "limpar",
  "warn", "acesso", "automod", "tutorial", "assistente", "cor", "log", "banglobal", "embed", "reactionrole", "chat", "rss", "xp", "game", "autorole",
  "staff", "boasvindas", "adeus", "fuso", "tts", "musica", "webhook", "rolar", "iniciativa", "ticket", "economia",
];
// exportado via ctx para o comando &comando consultar
estado.CANONICO = CANONICO;
estado.COMANDOS_GERENCIAVEIS = COMANDOS_GERENCIAVEIS;
// Versão filtrada por servidor: esconde os comandos de IA onde ela não roda.
estado.comandosGerenciaveisDe = (sid) => {
  const comIA = (() => { try { return chat.servidorPermitido(sid); } catch { return false; } })();
  return comIA ? COMANDOS_GERENCIAVEIS : COMANDOS_GERENCIAVEIS.filter((c) => !COMANDOS_SO_IA.has(c));
};
for (const [alias, canonico] of Object.entries(aliases.COMANDO_EXTRA)) {
  if (!rotas[alias] && rotas[canonico]) rotas[alias] = rotas[canonico];
}
for (const [alias, canonico] of Object.entries(CANONICO)) {
  if (!rotas[alias] && rotas[canonico]) rotas[alias] = rotas[canonico];
}
estado.rotas = rotas;
estado.CANONICO_COMPLETO = CANONICO;

let jaInicializou = false;
client.on("ready", async () => {
  console.info(`Logged in as ${client.user?.username}!`);
  console.info(`Token loaded: ${!!process.env.BOT_TOKEN}`);
  ultimoEvento = Date.now();

  if (jaInicializou) {
    console.info("[BOOT] Reconexão — inicialização pesada já feita, pulando.");
    return;
  }
  jaInicializou = true;

  store.inicializar(CONFIG_PATH); // abre o banco e migra o config antigo
  cfgGlobal = store.getGlobal();

  definirStatus().catch((e) => console.error("[STATUS]", e?.message ?? e));

  reactionRoles.precarregarMensagens(client).catch((e) => console.error("[REACTIONROLE][boot]", e?.message));

  rpg.iniciarCatalogo();   // semeia os itens genéricos e prepara o mundo (idempotente)

  srvStats.marcarInicio();
  relatorioHora.evento(null, "boot", "bot iniciou");
  relatorioHora.agendar({
    client,
    getCfg: () => store.getGlobal().relatorio,
    enviar: async (canalId, rel) => {
      const canal = await client.channels.fetch(canalId).catch(() => null);
      if (!canal) return;
      const fixo = relatorioHora.servidorDoRelatorio();
      if (fixo && canal.serverId !== fixo) {
        console.warn(`[RELATORIO] canal ${canalId} não é do servidor do relatório (${fixo}) — não enviado`);
        return;
      }
      await sendEmbed(canal, { title: rel.title, description: rel.description, colour: COR.info });
    },
  });
  for (const l of chat.resumoConfigIA()) console.info(l);

  engine.iniciarVigiaDeSilencios(criarContexto());

  chat.iniciarMemoria();          // liga o agente de memória (extração em background)
  chat.iniciarComentario(client); // liga o comentário espontâneo
  modIA.configurar({ avaliar: chat.avaliarModeracao });   // moderação por IA usa o modelo pequeno
  rss.configurarResumo(chat.resumirRSS);   // RSS agendado passa a resumir com o tom da Judy
  rss.configurarRelatorio({ linhas: chat.linhasRSS, comentario: chat.comentarioRSS, traduzir: chat.traduzirLinhasRSS });   // relatório por categoria + comentário no fim

  const ctx = criarContexto();    // contexto sem servidor (tarefas globais)
  engine.agendarLimpezaSpam(ctx); // limpeza periódica do rastreio de spam
  engine.carregarBlocklistCache(ctx);   // anti-link armado na hora, do disco
  engine.rebuildBlocklist(ctx);         // baixa as listas de verdade (assíncrono)

  // Curadoria RSS: agendador horário (só age nos servidores permitidos)
  const ctxRss = criarContexto();
  ctxRss.client = client;
  ctxRss.configDoServidor = store.configDoServidor;
  rss.iniciarAgendador(ctxRss);

  // Receptor de webhooks (GitHub, Crafty, formato Discord…) — porta própria
  webhooks.iniciarReceptor(ctxRss);

  banGlobal.iniciarAutoImportacao(client, criarContexto);
});

client.on("messageCreate", tratarMensagem);
async function tratarMensagem(message) {
  ultimoEvento = Date.now();   // prova de vida: recebemos um evento
  if (message.authorId === client.user.id) return;

  if (cfgGlobal.debug !== false && process.env.MSG_LOG !== "off") {
    const c = message.content ?? "";
    const resumo = c.length > 120 ? c.slice(0, 120) + `… (+${c.length - 120})` : c;
    console.log(`[MSG] ${message.authorId} no canal ${message.channelId}: ${JSON.stringify(resumo)}`);
  }

  // Cada servidor tem sua própria config
  const serverId = message.serverId ?? message.server?.id ?? message.server?._id ?? null;
  if (!message.__lote) srvStats.registrar(serverId);   // métrica de ritmo (memória, janela deslizante)
  if (!message.__lote) relatorioHora.mensagem(serverId, message.content, {
    autorId: message.authorId, ehBot: !!message.author?.bot,
    comAssunto: relatorioHora.temAssunto(client.servers.get(serverId), store.getGlobal().relatorio),
  });
  const ctx = criarContexto(serverId);

  // ── Vários comandos numa mensagem (um por linha) ──
  // Cada linha percorre o caminho inteiro de um comando — permissão,
  // restrição de canal, comando desativado —, uma depois da outra.
  const lote = message.__lote ? null : comandosPorLinha(message.content, PREFIXO);
  if (lote) {
    for (const linha of lote) {
      try { await tratarMensagem(mensagemDaLinha(message, linha)); }
      catch (e) { console.error(`[LOTE] "${linha.slice(0, 60)}":`, descreverErro(e)); }
    }
    return;
  }

  // Identifica se a mensagem é um COMANDO reconhecido
  let command = null, args = [];
  if (message.content.startsWith(PREFIXO)) {
    const parts = message.content.slice(PREFIXO.length).trim().split(/\s+/);
    command = parts[0]?.toLowerCase();
    args    = parts.slice(1);
  }
  const handler = command ? rotas[command] : null;

  if (!command && assistente.temSessao(message)) {
    try { if (await assistente.aoResponder(message, ctx)) return; }
    catch (e) { console.error("[ASSISTENTE]", e.message); }
  }

  if (!command) {
    const meuId = client.user?.id;
    // Responder a uma mensagem dela com @OutraPessoa no texto é falar com a
    // outra pessoa — o "ping" da resposta não conta (ver destinatario.js).
    const mencionado = dirigidoAoBot({ conteudo: message.content, mentionIds: message.mentionIds, botId: meuId });
    if (mencionado && chat.servidorPermitido(serverId) && !(ctx.config.comandosDesativados ?? []).includes("chat")) {
      const pergunta = (message.content || "").replace(new RegExp(`<@${meuId}>`, "g"), "").trim();
      // A pergunta entra no fio do canal (antes só a RESPOSTA dela entrava, e
      // o modelo via respostas soltas sem saber o que tinham perguntado).
      chat.registrarNoCanal(message.channelId, {
        id: message.id, nome: message.author?.username ?? message.member?.nickname ?? message.authorId,
        userId: message.authorId, texto: message.content, respondeuAId: message.replyIds?.[0] ?? null,
      });
      // conversa com a IA conta XP (é interação legítima)
      try { await nivel.aoMensagem(message, { ...ctx, client }); }
      catch (e) { console.error("[NIVEL]", e.message); }
      await chat.conversar(message, pergunta, ctx);
      return;
    }
  }

  if (!handler) {
    if (await engine.runAutomod(message, ctx)) return;
    // Moderação por IA (critérios em texto livre). Se apagou, para aqui.
    try {
      if (await modIA.moderar(message, { ...ctx, client })) return;
    } catch (e) { console.error("[MOD-IA]", e.message); }
  }

  if (!command) {
    try { await nivel.aoMensagem(message, { ...ctx, client }); }
    catch (e) { console.error("[NIVEL]", e.message); }

    try { await ttsVoz.aoMensagem(message, ctx); }
    catch (e) { console.error("[TTS]", e.message); }

    if (chat.servidorPermitido(serverId)) {
      const nome = message.author?.username ?? message.member?.nickname ?? message.authorId;
      chat.observarMensagem({
        serverId, userId: message.authorId, nome,
        texto: message.content, ehBot: !!message.author?.bot,
      });
      // Cache do canal: registra o fio da conversa (quem falou, a quem respondeu).
      // (era `reply_ids`, que a stoat.js não tem: o "respondendo a" nunca aparecia)
      chat.registrarNoCanal(message.channelId, {
        id: message.id, nome, userId: message.authorId, texto: message.content,
        respondeuAId: message.replyIds?.[0] ?? null, respondeuA: message.replyIds?.length ? "uma mensagem anterior" : null,
      });
      if (!message.author?.bot) {
        chat.observarParaComentario(message, { ...ctx, client });
      }
    }
  }

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

  try { await i18n.talvezSugerirIdioma(message, ctx); }
  catch (e) { console.error("[I18N]", e?.message); }

  if (cfgGlobal.debug !== false) console.log(`[CMD] Executando "${command}" (args: ${JSON.stringify(args)})`);

  const ESSENCIAIS = new Set(["help", "comando", "comandos", "command", "debug", "diagnostico", "diagnóstico", "idioma"]);
  const canonico = CANONICO[command] ?? command;

  if (COMANDOS_SO_IA.has(canonico) && !chat.servidorPermitido(serverId)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Não existe aqui",
      description: `\`${PREFIXO}${canonico}\` não existe neste servidor.\n\nVeja o que existe por aqui com \`${PREFIXO}help\`.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Not a command here",
      description: `\`${PREFIXO}${canonico}\` doesn't exist on this server.\n\nSee what's available here with \`${PREFIXO}help\`.`,
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

  const SEMPRE_LIBERADOS = new Set(["acesso", "debug", "help", "tutorial", "assistente", "idioma"]);

// O canal da mensagem é um canal de voz/call? (para liberar comandos de voz ali)
function ehCanalDeVoz(message) {
  try {
    const c = message.channel;
    const tipo = String(c?.type ?? c?.channelType ?? "").toLowerCase();
    return tipo.includes("voice") || c?.voice != null;
  } catch { return false; }
}

  // Comandos de voz DENTRO da call/canal lido ignoram a restrição de canal:
  // usar `&musica`, `&entrar`/`&sair` ou `&tts` onde o som acontece é o uso
  // natural — mandar a pessoa ir ao #comandos para pausar uma música que
  // está tocando ali é o tipo de burocracia que este bot não faz.
  const cfgTts = ctx.config?.tts;
  const COMANDOS_DE_VOZ = new Set(["tts", "musica", "entrar", "sair"]);
  const naVoz = COMANDOS_DE_VOZ.has(canonico) && (
    (cfgTts?.ativo && (message.channelId === cfgTts.canalVoz || message.channelId === cfgTts.canalTexto))
    || ehCanalDeVoz(message)
  );

  if (!SEMPRE_LIBERADOS.has(canonico) && !naVoz) {
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
}

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

    // Páginas (&help, &tutorial): ◀ ▶ numa mensagem paginada vira a página.
    if (await paginas.aoReagir(msgId, userId, emoji, a0)) return;

    const msgObj = (a0 && typeof a0 === "object") ? a0 : { id: msgId };
    // Tickets: painel (🎫 abre), controle (🔒 fecha), fechado (🗑️ apaga).
    if (await tickets.aoReagir(msgObj, userId, emoji, { client, criarContexto })) return;
    const ctxRR = criarContexto(null);
    ctxRR.configDoServidor = store.configDoServidor;   // p/ o log usar a config certa
    await reactionRoles.aoReagir(msgObj, userId, emoji, ctxRR);
  } catch (err) {
    console.error("[REAÇÃO] erro:", err.message);
  }
});

// Mensagem fora do cache (o bot reiniciou depois de enviá-la): a stoat.js nem
// emite messageReactionAdd/Remove para ela — getOrPartial devolve nada sem
// `partials`. Era a outra metade do "depois de um tempo os emojis não
// funcionam". O evento cru traz o canal, e a página é editada pela API.
client.events.on("event", async (ev) => {
  try {
    if (ev?.type !== "MessageReact" && ev?.type !== "MessageUnreact") return;
    if (!ev.id || client.messages?.has?.(ev.id)) return;      // em cache: o handler normal cuida
    if (client.user && ev.user_id === client.user.id) return;
    const editor = { id: ev.id, channelId: ev.channel_id,
      edit: (data) => client.api.patch(`/channels/${ev.channel_id}/messages/${ev.id}`, data) };
    if (ev.type === "MessageReact" && await tickets.aoReagir({ id: ev.id }, ev.user_id, ev.emoji_id, { client, criarContexto })) return;
    await paginas.aoReagir(ev.id, ev.user_id, ev.emoji_id, editor);
  } catch (err) {
    console.error("[REAÇÃO][fora do cache]", err?.message ?? err);
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

    // Tirar a reação ◀ ▶ também vira a página (assim dá para clicar de novo).
    if (await paginas.aoReagir(msgId, userId, emoji, a0)) return;

    const msgObj = (a0 && typeof a0 === "object") ? a0 : { id: msgId };
    const ctxRR = criarContexto(null);
    ctxRR.configDoServidor = store.configDoServidor;   // p/ o log usar a config certa
    await reactionRoles.aoDesreagir(msgObj, userId, emoji, ctxRR);
  } catch (err) {
    console.error("[REAÇÃO-] erro:", err.message);
  }
});

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

    // Idade da conta vem do próprio ID. No raid de 27/09, cada conta tinha
    // 2 a 7 min de vida ao entrar — isso agora aparece no log de entrada.
    const idade = confianca.idadeDaConta(userId);
    const idadeTxt = idade == null ? "" : idade < 3600_000
      ? ` ⚠️ **conta criada há ${Math.max(1, Math.round(idade / 60_000))} min**`
      : idade < 86_400_000 ? ` · conta criada há ${Math.round(idade / 3600_000)}h` : "";
    await log.registrar(ctx, "membros", {
      titulo: "📥 Membro entrou",
      descricao: `<@${userId}> entrou no servidor.${idadeTxt}`,
    });

    const onda = confianca.registrarEntrada(serverId, userId);
    if (onda.iniciou) {
      console.log(`[ANTIRAID] ${serverId}: ${onda.contas.length} contas novas em pouco tempo — proteção por ${onda.minutos} min`);
      relatorioHora.evento(serverId, "raid", `Possível raid: ${onda.contas.length} contas novas em 15 min`);
      const en = ctx.config?.language === "en";
      const destinoId = ctx.config?.automod?.antiScam?.alertChannelId || ctx.config?.log?.canalId;
      const achado = destinoId ? await client.channels.fetch(destinoId).catch(() => null) : null;
      // canal de outro servidor (herdado do molde antigo) nunca recebe o alerta
      const destino = achado && (achado.serverId ?? achado.server?.id) === serverId ? achado : null;
      if (destino) await sendEmbed(destino, {
        title: en ? "🛡️ Possible raid" : "🛡️ Possível raid",
        description: [
          en ? `**${onda.contas.length} accounts created less than 24h ago** joined in a short time:`
             : `**${onda.contas.length} contas criadas há menos de 24h** entraram em pouco tempo:`,
          onda.contas.map((u) => `<@${u}>`).join(" · "),
          "",
          en ? `For the next **${onda.minutos} min**, new accounts get the strictest automod: lower sentinel threshold and the same message only twice.`
             : `Pelos próximos **${onda.minutos} min**, conta nova passa pelo automod mais rígido: limiar do sentinela mais baixo e a mesma mensagem só 2 vezes.`,
          en ? "Nobody was punished for joining." : "Ninguém foi punido por entrar.",
        ].join("\n"),
        colour: COR.aviso,
      });
    }

    // Lista global: pode banir automaticamente (se o servidor optou por isso)
    const banido = await banGlobal.verificarEntrada(member, ctx);
    if (banido) return;   // já foi banido: não faz sentido dar cargo/reaplicar silêncio

    await autorole.aoEntrar(member, ctx);          // ← cargo automático (se configurado)
    await nivel.aoEntrar(member, ctx);
    await engine.reaplicarPunicao(member, ctx);   // ← reaplica o silêncio, se houver
    await bemvindo.aoEntrar(member, ctx);         // ← embed de boas-vindas (se configurado)
  } catch (err) { console.error("[EVENTO][JOIN]", err?.message); }
});

// SAÍDA
client.on("serverMemberLeave", async (member, extra) => {
  try {
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

    // Foi ban? Então vale na hora para os outros servidores da Judy (não
    // espera a sincronização de 6h). Em segundo plano: não segura o evento.
    banGlobal.propagarSeFoiBan(serverId, userId, { client, criarContexto })
      .then((r) => { if (r.acoes.length) console.log(`[BANGLOBAL] propagado ${userId}:`, JSON.stringify(r.acoes)); })
      .catch((e) => console.error("[BANGLOBAL] propagar:", descreverErro(e)));
    const ctx = criarContexto(serverId);
    await log.registrar(ctx, "membros", {
      titulo: "📤 Membro saiu",
      descricao: `<@${userId}> saiu do servidor (saída, expulsão ou ban).`,
    });
    const nome = member?.user?.username ?? member?.nickname ?? null;
    await bemvindo.aoSair(userId, serverId, ctx, nome);
  } catch (err) { console.error("[EVENTO][LEAVE]", err?.message); }
});

client.on("serverCreate", async (server) => {
  try {
    await banGlobal.sincronizarServidor(server, criarContexto);
  } catch (err) { console.error("[EVENTO][SERVER_CREATE]", err?.message); }
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

    // Mídia apagada volta no log: resgatada do CDN e re-subida.
    const { ids: midias, perdidas } = await log.resgatarMidias(message?.attachments, { subir: chat.subirAnexo });
    const notaMidia =
      (midias.length ? `\n**Mídia:** ${midias.length} anexo(s) resgatado(s) abaixo` : "") +
      (perdidas.length ? `\n**Mídia não recuperável:** ${perdidas.join(", ")}` : "");

    await log.registrar(ctx, "mensagens", {
      titulo: "🗑 Mensagem apagada",
      descricao: `**Autor:** ${autor}\n**Canal:** <#${message.channelId}>\n**Conteúdo:** ${texto}${notaMidia}`,
      anexos: midias.length ? midias : null,
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
async function conectar(tentativa = 1) {
  const MAX = Number(process.env.LOGIN_MAX_TENTATIVAS || 10);
  try {
    await client.loginBot(TOKEN);
    console.info("[CONN] Login aceito pelo Stoat.");
  } catch (err) {
    const txt = err?.message ?? String(err);
    const espera = Math.min(60_000, 3000 * 2 ** (tentativa - 1));   // 3s, 6s, 12s… até 60s

    if (tentativa >= MAX) {
      console.error(`[CONN] Login falhou ${MAX} vezes (${txt}). Encerrando para o supervisor recriar o container.`);
      relatorioHora.evento(null, "desligar", "login falhou");
      process.exit(1);   // sair é melhor que ficar de pé sem conectar
    }

    console.error(`[CONN] Login falhou (${txt}) — tentativa ${tentativa}/${MAX}, nova em ${espera / 1000}s`);
    setTimeout(() => conectar(tentativa + 1), espera);
  }
}

conectar();
