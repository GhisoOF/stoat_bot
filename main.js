import 'dotenv/config';
import './modulos/core/log-anonimo.js';   // privacidade: IDs do Stoat viram pseudônimo no log
import './modulos/core/env.js';
import { instalar as instalarRitmoDaApi } from './modulos/core/ritmo-api.js';
// (22 out 2026) o limite de pedidos do Stoat (5 a cada 10 s em /servers): espera em vez de falhar
instalarRitmoDaApi();

// A stoat.js emite "Skipping key X during hydration!" por console.DEBUG (uma
// linha por campo desconhecido de cada objeto: chega a 70% do log). O filtro
// ficava em console.log e por isso nunca funcionou.
// Erros e avisos do bot entram no relatório horário (&servidores relatorio),
// agrupados por padrão. Serviços filhos (ia/voz) escrevem direto no docker log.
function etiquetaDoLog(args) {
  const primeiro = typeof args[0] === "string" ? args[0] : "";
  const m = primeiro.match(/^\s*(\[[A-Za-z0-9À-ÿ _:\-]{1,40}\])/);
  return m ? m[1] : "[sem etiqueta]";
}
for (const canal of ["error", "warn"]) {
  const original = console[canal].bind(console);
  console[canal] = (...args) => {
    original(...args);
    // (31 out 2026, R9) o relatório do dono recebe só a ETIQUETA do erro ("[RSS]",
    // "[BANGLOBAL]"…), nunca o texto: ali podia ir nome de servidor que não aderiu,
    // URL de feed ou trecho de mensagem. O texto inteiro fica só no log local.
    try { relatorioHora.erro(etiquetaDoLog(args)); } catch (e) { original("[RELATORIO] falha ao anotar:", e?.message); }
  };
}
for (const canal of ["debug", "log"]) {
  const original = console[canal].bind(console);
  console[canal] = (...args) => {
    if (typeof args[0] === "string" && /^Skipping key \S+ during hydration!$/.test(args[0])) return;
    original(...args);
  };
}

import { Client, Permission, Channel } from "stoat.js";

import * as engine   from "./modulos/moderacao/automod-engine.js";
import * as store    from "./modulos/core/config-store.js";
import * as log      from "./modulos/core/log.js";
import * as banGlobal from "./modulos/moderacao/ban-global.js";
import * as reactionRoles from "./modulos/ferramentas/reaction-roles.js";
import * as midia     from "./modulos/core/midia.js";
import * as autorole  from "./modulos/ferramentas/autorole.js";
import * as bemvindo  from "./modulos/ferramentas/boas-vindas.js";
import * as ttsVoz    from "./modulos/ferramentas/tts.js";
import * as webhooks  from "./modulos/ferramentas/webhooks.js";
import * as tickets   from "./modulos/ferramentas/tickets.js";
import * as acessoMod  from "./modulos/moderacao/acesso.js";
import * as entretenimento from "./modulos/ferramentas/entretenimento.js";
import * as jogos     from "./modulos/ferramentas/jogos.js";
import * as servidorInfo from "./modulos/ferramentas/servidor-info.js";
import * as srvStats   from "./modulos/core/metricas.js";
import * as rpg        from "./modulos/game/game.js";
import * as modIA      from "./modulos/moderacao/moderacao-ia.js";
import * as assuntos   from "./modulos/moderacao/assuntos.js";
import { iaLigada, conversaLigada } from "./modulos/core/env.js";
import * as avatarMod from "./modulos/moderacao/avatar.js";
import { dirigidoAoBot } from "./modulos/ai/destinatario.js";
import { protegerMarcadores } from "./modulos/core/marcadores.js";
import * as chat      from "./modulos/ai/chat.js";
import * as rss       from "./modulos/ferramentas/rss.js";
import * as nivel     from "./modulos/ferramentas/nivel.js";
import * as i18n      from "./modulos/core/i18n.js";
import * as consentimento from "./modulos/ai/consentimento.js";
import * as dbIA     from "./modulos/core/db.js";
import * as retencao from "./modulos/core/retencao.js";
import * as novidades from "./modulos/ferramentas/novidades.js";
import * as aliases   from "./modulos/core/aliases.js";
import * as registroComandos from "./modulos/comandos/index.js";
import { maisParecido } from "./modulos/core/parecido.js";
import { canalDeOutroServidor } from "./modulos/moderacao/pertence.js";
import * as paginas   from "./modulos/core/paginas.js";
import * as assistente from "./modulos/moderacao/assistente.js";
import { tr }         from "./modulos/core/i18n.js";
import { chamarApi }  from "./modulos/core/stoat-api.js";
import * as slowmode from "./modulos/core/slowmode.js";

// Modo lento do canal vale para o bot: toda mensagem espera a vez em vez de
// falhar com InSlowmode (ver core/slowmode.js). O tempo do canal vem da API
// (a stoat.js 7.3.6 não guarda o campo `slowmode`).
slowmode.instalar(Channel, {
  duracaoDo: async (canalId) => (await chamarApi(`/channels/${canalId}`, { ms: 5000 })).json?.slowmode ?? null,
});
import { vigiarConexao } from "./modulos/core/vida.js";
import { comandosPorLinha, mensagemDaLinha } from "./modulos/core/lote.js";
import * as relatorioHora from "./modulos/ferramentas/relatorio.js";
import { descreverErro } from "./modulos/core/erros.js";
import { problemasDoEnv, avisosDoEnv, numero } from "./modulos/core/env.js";
import * as confianca from "./modulos/moderacao/confianca.js";
import { semPingEmMassa } from "./modulos/core/seguranca.js";

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

const INATIVIDADE_MS = numero("INATIVIDADE_MS", 600000, { min: 60000, inteiro: true }); // 10 min sem eventos → reinicia
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

// O histórico de conversa da IA vive 24 h (privacidade, 20 out 2026)
setInterval(() => { try { dbIA.podarHistoricoIA(); } catch (e) { console.error("[DB] poda do histórico:", e.message); } }, 3600_000).unref?.();

const HEARTBEAT_MS = numero("HEARTBEAT_MS", 300000, { min: 10000, inteiro: true }); // 5 min
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
    try { lang = i18n.idiomaDaTela(store.configDoServidor(channel?.serverId)?.language); } catch {}
    return paginas.enviarEmPaginas(enviarEmbedUnico, channel, { colour: COR.info, ...embed }, { lang, COR });
  }
  return enviarEmbedUnico(channel, embed);
}

async function enviarEmbedUnico(channel, { title, description, colour = COR.info, imagem = null, anexos = null, ocultarLink = true }) {
  // "<parâmetro>" some no Stoat: vira ‹parâmetro› (ver core/marcadores.js)
  // a marca de "texto pronto" (i18n.tr no espanhol) nunca chega ao Stoat
  if (typeof title === "string") title = title.replace(/[\u2063\u2064]/g, "");
  if (typeof description === "string") description = description.replace(/[\u2063\u2064]/g, "");
  title = protegerMarcadores(title);
  description = protegerMarcadores(description);
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
  // (31 out 2026, R9) o log não copia o texto da resposta (pode ter dados de alguém)
  if (cfgGlobal.debug === true) console.log(`[CMD] ${String(title ?? "(sem título)").slice(0, 80)} | ${desc.length} caractere(s)`);
  const exibicao = imagem ? midia.comoExibir(imagem) : null;
  const payload = { embeds: [base] };
  if (exibicao?.modo === "media") payload.embeds = [{ ...base, media: exibicao.id }];
  else if (exibicao?.modo === "link") payload.content = midia.formatarLinkConteudo(exibicao.url, ocultarLink);
  if (Array.isArray(anexos) && anexos.length) payload.attachments = anexos.slice(0, 4);

  try {
    return await channel.sendMessage(payload);
  } catch (err) {
    console.error("[EMBED] Falha ao enviar embed:", erroStr(err));
    // Modo lento longo demais para esperar: tentar de novo AGORA (sem capa, em
    // texto) só bate no mesmo muro — era o "Fallback de texto também falhou".
    if (slowmode.esperaDoSlowmode(err) !== null) {
      console.warn("[EMBED] canal em modo lento além da espera máxima (SLOWMODE_ESPERA_MAX_S) — mensagem não enviada");
      return;
    }
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
      // texto comum NOTIFICA menção (embed não): sem @everyone nem cargo (15 out 2026)
      return await channel.sendMessage(semPingEmMassa([title, desc].filter(Boolean).join("\n").slice(0, 1500)));
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

    // (31 out 2026, R9) o cargo de staff vale para moderar, mas não para mexer em
    // cargos/permissões nem no servidor: senão a staff promovia mais cargos a
    // staff, recoloria o cargo de admin e desligava o log.
    if (!["ManageServer", "ManagePermissions", "ManageRole"].includes(permName)) {
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

  // A porta de saída de todo comando de um servidor: o canal tem de ser DELE
  // (ver pertence.js — um admin do servidor A publicava no servidor B).
  const enviarTraduzido = (canal, embed = {}, { dica = null } = {}) => {
    if (canalDeOutroServidor(canal, serverId)) {
      console.warn(`[SEGURANCA] servidor ${serverId} tentou publicar no canal ${canal?.id} do servidor ${canal?.serverId} — bloqueado`);
      return Promise.resolve(null);
    }
    return sendEmbed(canal, {
      ...embed,
      title: aliases.exibir(embed.title, config?.language, PREFIXO, CANONICO, dica),
      description: aliases.exibir(embed.description, config?.language, PREFIXO, CANONICO, dica),
    });
  };

  return {
    client, config, cfgGlobal, COR, PREFIXO,
    sendEmbed: enviarTraduzido, getServer, membroTemPermissao, ehSuperAdmin,
    // A mesma tradução, para quem EDITA um embed já enviado (páginas).
    exibir: (texto, dica = null) => aliases.exibir(texto, config?.language, PREFIXO, CANONICO, dica),
    getServerPorId: async (sid) => {
      if (!sid) return null;
      return client.servers.get?.(sid) ?? await client.servers.fetch(sid).catch(() => null);
    },
    salvarConfig: () => store.salvarConfigServidor(serverId),
    salvarGlobal: store.salvarGlobal,
    getGlobal: store.getGlobal,
    configDoServidor: store.configDoServidor,
    // para o que age em OUTROS servidores (ex.: &banglobal add aplica o modo de cada um)
    criarContexto,
    estado, serverId,
  };
}

// "Você quis dizer": no empate, o nome do comando vence o apelido (ver core/parecido.js)
function comandoParecido(digitado, nomes) {
  return maisParecido(digitado, nomes, { secundario: (n) => !!CANONICO[n] });
}

// Os comandos vêm do registro (modulos/comandos/, 17 out 2026): cada um é
// declarado lá, uma vez, com nome, apelidos e o que ele é. O boot para se o
// registro tiver um nome em dois comandos.
const {
  rotas, CANONICO, COMANDOS_GERENCIAVEIS, COMANDOS_SO_IA, COMANDOS_DE_VOZ, ESSENCIAIS, SEMPRE_LIBERADOS, TEXTO_LIVRE,
} = await registroComandos.montarTabela();
estado.COMANDOS_SO_IA = COMANDOS_SO_IA;
// exportado via ctx para o comando &comando consultar
estado.CANONICO = CANONICO;
estado.COMANDOS_GERENCIAVEIS = COMANDOS_GERENCIAVEIS;
// Versão filtrada por servidor: esconde os comandos de IA onde ela não roda.
estado.comandosGerenciaveisDe = (sid) => {
  const pode = (c) => { try { return chat.comandoIAPermitido(c, sid); } catch { return false; } };
  return COMANDOS_GERENCIAVEIS.filter((c) => !COMANDOS_SO_IA.has(c) || pode(c));
};
estado.rotas = rotas;
estado.CANONICO_COMPLETO = CANONICO;

// A tabela de comandos como o bot a montou (17 out 2026). Quem lê é o
// inventário de comandos (`node testes.mjs comandos-17out`), que confere que
// nenhum nome sumiu nem mudou de destino entre uma versão e outra.
export function tabelaDeComandos() {
  return { rotas, CANONICO, COMANDOS_GERENCIAVEIS, COMANDOS_SO_IA };
}

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

  // Privacidade (P2): servidores de onde a Judy saiu enquanto estava desligada
  // entram na contagem de 30 dias; os que ela voltou saem dela. Os que passaram
  // dos 30 dias são apagados (agora e a cada 6 h).
  try {
    if (client.servers?.size) {
      const r = retencao.conferirSaidas(client.servers.keys());
      if (r.saiu || r.voltou) console.info(`[PRIVACIDADE] saídas: ${r.saiu} servidor(es) novo(s) na contagem de ${retencao.DIAS_APOS_SAIDA} dias, ${r.voltou} voltaram`);
    }
  } catch (e) { console.error("[PRIVACIDADE] conferir saídas:", e?.message); }
  const limparSaidas = () => {
    try {
      // os servidores em que ela está agora nunca são apagados, marcados ou não
      const presentes = client.servers?.size ? [...client.servers.keys()] : null;
      for (const x of retencao.limparServidoresQueSairam(Date.now(), retencao.DIAS_APOS_SAIDA, presentes)) {
        store.recarregarServidor(x.serverId);
        console.info(`[PRIVACIDADE] servidor ${x.serverId}: dados apagados (${x.linhas} registro(s)) — a Judy saiu há mais de ${retencao.DIAS_APOS_SAIDA} dias`);
      }
    } catch (e) { console.error("[PRIVACIDADE] limpeza de servidores:", e?.message); }
  };
  limparSaidas();
  setInterval(limparSaidas, 6 * 3600_000).unref?.();

  definirStatus().catch((e) => console.error("[STATUS]", e?.message ?? e));

  reactionRoles.precarregarMensagens(client).catch((e) => console.error("[REACTIONROLE][boot]", e?.message));

  rpg.iniciarCatalogo();   // semeia os itens genéricos e prepara o mundo (idempotente)

  srvStats.marcarInicio();
  // As novidades deste pacote, nos servidores que ligaram `&log atualizacoes on` (P5)
  novidades.anunciar({ client, global: store.getGlobal(), salvarGlobal: store.salvarGlobal, configDoServidor: store.configDoServidor,
    enviar: (canal, emb) => sendEmbed(canal, emb), P: PREFIXO, COR })
    .then((r) => { if (r.enviados || r.primeira) console.info(`[NOVIDADES] ${r.primeira ? "marca inicial gravada" : `${r.novas} novidade(s) anunciada(s) em ${r.enviados} servidor(es)`}`); })
    .catch((e) => console.error("[NOVIDADES]", e?.message ?? e));
  // Quem entra no relatório do dono (privacidade P4): os servidores dele, completos;
  // os outros só se aderiram (`&log relatorio on`), anônimos; o resto, nada.
  relatorioHora.configurarAdesao((sid) => {
    if (relatorioHora.ehDoDono(client.servers.get(sid) ?? { id: sid })) return "completo";
    return store.configDoServidor(sid)?.relatorioDono ? "anonimo" : null;
  });
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

  // CONVERSA=0 (modo enxuto): nada de IA rodando em segundo plano — memória,
  // comentário espontâneo e o juiz do &modia (que lê TODA mensagem) ficam
  // parados. Ficam: temas proibidos, visão de imagens, relatório e RSS.
  if (conversaLigada()) {
    chat.iniciarMemoria();          // liga o agente de memória (extração em background)
    chat.iniciarComentario(client); // liga o comentário espontâneo
  }
  // &modia: com a conversa ligada, ou no modo enxuto com o juiz dedicado
  // (MODELO_MODERACAO) — ver chat.modIAPermitida
  if (chat.modIAPermitida()) modIA.configurar({ avaliar: chat.avaliarModeracao });
  // temas proibidos: o mesmo juiz (JSON, sem raciocínio, fila da conversa)
  if (iaLigada()) assuntos.configurar({ avaliar: chat.avaliarModeracao });
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
  tickets.iniciarVigia(client, criarContexto);   // 🔒/🗑️ dos tickets, mesmo sem o evento de reação
});

client.on("messageCreate", tratarMensagem);

// Busca na API um canal que não está no cache (a stoat.js guarda o que vem).
// Uma tentativa por canal a cada 60 s: canal sem acesso não vira enxurrada.
const tentouCanal = new Map();   // canalId → ms
async function buscarCanalDesconhecido(canalId) {
  const agora = Date.now();
  if (agora - (tentouCanal.get(canalId) ?? 0) < 60_000) return null;
  tentouCanal.set(canalId, agora);
  if (tentouCanal.size > 2000) tentouCanal.clear();
  try { return await client.channels.fetch(canalId); } catch { return null; }
}

// Depois de mexer em cargo ou canal, os canais do servidor que a Judy ainda
// não tem em cache são buscados (o &debug #canal e a resolução de nomes
// dependem do cache). No máximo uma varredura por servidor a cada 30 s.
const varreuCanais = new Map();   // serverId → ms
async function completarCanais(server) {
  const sid = server?.id;
  if (!sid) return 0;
  const agora = Date.now();
  if (agora - (varreuCanais.get(sid) ?? 0) < 30_000) return 0;
  varreuCanais.set(sid, agora);
  let n = 0;
  for (const id of server.channelIds ?? []) {
    if (client.channels.get?.(id)) continue;
    if (await buscarCanalDesconhecido(id)) n++;
  }
  if (n) console.log(`[CANAL] ${n} canal(is) de ${server.name ?? sid} entraram no cache depois de uma mudança de permissão`);
  return n;
}
client.on("serverUpdate", (server) => { completarCanais(server).catch(() => {}); });
client.on("channelUpdate", (canal) => { completarCanais(canal?.server).catch(() => {}); });
async function tratarMensagem(message) {
  ultimoEvento = Date.now();   // prova de vida: recebemos um evento
  if (message.authorId === client.user.id) return;

  if (cfgGlobal.debug === true && process.env.MSG_LOG !== "off") {
    const c = message.content ?? "";
    const resumo = c.length > 120 ? c.slice(0, 120) + `… (+${c.length - 120})` : c;
    console.log(`[MSG] ${message.authorId} no canal ${message.channelId}: ${JSON.stringify(resumo)}`);
  }

  // ── Canal que a Judy ainda não conhecia (15 out 2026) ──
  // Quando a staff dá a ela a permissão de ver um canal, o Stoat passa a
  // mandar as mensagens dele — mas nem sempre manda o CANAL junto (o servidor
  // de eventos só avisa "canal novo" em alguns casos). Sem o canal no cache da
  // stoat.js, a mensagem chega sem canal e sem servidor, e a Judy ficava muda
  // ali até reiniciar ("garanti a permissão e ela não responde"). Agora ela
  // busca o canal na API na primeira mensagem.
  if (!message.channel && message.channelId) {
    const achado = await buscarCanalDesconhecido(message.channelId);
    if (achado) console.log(`[CANAL] ${message.channelId} não estava no cache (permissão nova?) — buscado na API`);
  }

  // Cada servidor tem sua própria config
  const serverId = message.serverId ?? message.server?.id ?? message.server?._id ?? null;
  if (!message.__lote) srvStats.registrar(serverId);   // métrica de ritmo (memória, janela deslizante)
  if (!message.__lote) relatorioHora.mensagem(serverId, message.content, {
    autorId: message.authorId, ehBot: !!message.author?.bot,
    comAssunto: relatorioHora.temAssunto(client.servers.get(serverId), store.getGlobal().relatorio),
  });
  const ctx = criarContexto(serverId);

  // ── Comando também passa pelo automod (os filtros de CONTEÚDO) ──
  // Antes, qualquer mensagem que começasse com um comando de verdade pulava o
  // automod inteiro: `&ping <convite>`, `&help <12 menções>`, um golpe colado
  // depois de `&rank`… (15 out 2026). A staff continua isenta lá dentro, e os
  // filtros de ritmo ficam de fora (dez comandos seguidos não são flood).
  if (!message.__lote && message.content?.startsWith(PREFIXO)) {
    const primeira = message.content.slice(PREFIXO.length).trim().split(/\s+/)[0]?.toLowerCase();
    if (primeira && rotas[primeira] && await engine.runAutomod(message, ctx, { soConteudo: true })) return;
  }

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
    // A resposta à pergunta da memória ("posso lembrar de você?"): um sim/não logo
    // depois, no mesmo canal, com ou sem mencioná-la (privacidade, 20 out 2026)
    if (chat.servidorPermitido(serverId)) {
      try { if (await consentimento.tratarResposta(message, ctx)) return; }
      catch (e) { console.error("[CONSENTIMENTO]", e.message); }
    }
    const meuId = client.user?.id;
    // Responder a uma mensagem dela com @OutraPessoa no texto é falar com a
    // outra pessoa — o "ping" da resposta não conta (ver destinatario.js).
    const mencionado = dirigidoAoBot({ conteudo: message.content, mentionIds: message.mentionIds, botId: meuId });
    // (21 out 2026) quem pediu "não fale comigo" (`&chat sair`) é ignorado pela IA em silêncio
    if (mencionado && chat.servidorPermitido(serverId) && !chat.naoFalarCom(message.authorId) && !(ctx.config.comandosDesativados ?? []).includes("chat")) {
      // O AUTOMOD VEM ANTES DA IA. Antes, mencionar a Judy pulava a moderação
      // inteira — o ataque de 2 out 2026 colava "@Judy" em cada mensagem de
      // emoji + ofensa racial, e nenhum filtro rodava (e ainda ganhava XP).
      if (await engine.runAutomod(message, ctx)) return;
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

    // o que quem pediu silêncio escreve não vai para a IA (nem memória, nem o fio do canal)
    if (chat.servidorPermitido(serverId) && !chat.naoFalarCom(message.authorId)) {
      const nome = message.author?.username ?? message.member?.nickname ?? message.authorId;
      // (31 out 2026) a memória só aprende do que é dito à Judy: a resposta a uma
      // mensagem dela (mesmo sem o ping) conta. Só o cache local, sem ir à API.
      const respondeAJudy = (message.replyIds ?? []).some((id) => client.messages?.get?.(id)?.authorId === client.user?.id);
      chat.observarMensagem({
        serverId, userId: message.authorId, nome,
        texto: message.content, ehBot: !!message.author?.bot, paraJudy: respondeAJudy,
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
    // "&gams follower ficha" → "você quis dizer &game?" (o mais parecido, até 2 letras de diferença)
    // "&ship @a @b" → "&entretenimento ship @a @b": o subcomando só existe dentro da família
    // "&regras" → "&servidor regras" (idem cargos, canais, faq)
    const daFamilia = entretenimento.subcomandoDe(command) ? `entretenimento ${command}`
      : servidorInfo.subcomandoDe(command) ? `servidor ${command}` : null;
    const parecido = daFamilia ?? comandoParecido(command, Object.keys(rotas));
    // o resto também: `&comado destivar ping` sugeria `&comando destivar ping`,
    // com o erro do subcomando intacto (17 out 2026)
    let resto = message.content.slice(PREFIXO.length + command.length);
    if (parecido && !daFamilia && !TEXTO_LIVRE.has(CANONICO[parecido] ?? parecido)) {
      const [, espaco, primeiro, depois] = resto.match(/^(\s+)(\S+)([\s\S]*)$/) ?? [];
      const certo = primeiro && aliases.corrigirSubcomando(CANONICO[parecido] ?? parecido, primeiro);
      if (certo) resto = `${espaco}${certo}${depois}`;
    }
    const sugestao = parecido ? `${PREFIXO}${parecido}${resto}` : null;
    await sendEmbed(message.channel, tr(ctx, {
      title: "❓ Comando desconhecido",
      description: (sugestao ? `Você quis dizer \`${sugestao.trim().slice(0, 120)}\`?\n\n` : "") + `Use \`${PREFIXO}help\` para ver os comandos disponíveis.`,
      colour: COR.aviso,
    }, {
      title: "❓ Unknown command",
      description: (sugestao ? `Did you mean \`${sugestao.trim().slice(0, 120)}\`?\n\n` : "") + `Use \`${PREFIXO}help\` to see the available commands.`,
      colour: COR.aviso,
    }, {
      title: "❓ Comando desconocido",
      description: (sugestao ? `¿Quisiste decir \`${sugestao.trim().slice(0, 120)}\`?\n\n` : "") + `Usa \`${aliases.citar("help", "es", PREFIXO)}\` para ver los comandos disponibles.`,
      colour: COR.aviso,
    }));
    return;
  }

  try { await i18n.talvezSugerirIdioma(message, ctx); }
  catch (e) { console.error("[I18N]", e?.message); }

  if (cfgGlobal.debug === true) console.log(`[CMD] Executando "${command}" (args: ${JSON.stringify(args)})`);

  const canonico = CANONICO[command] ?? command;

  // &chat só nos servidores da conversa; &modia (moderação) em todos
  if (COMANDOS_SO_IA.has(canonico) && !chat.comandoIAPermitido(canonico, serverId)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Não existe aqui",
      description: `\`${aliases.citar(canonico, "pt", PREFIXO)}\` não existe neste servidor.\n\nVeja o que existe por aqui com \`${aliases.citar("help", "pt", PREFIXO)}\`.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Not a command here",
      description: `\`${aliases.citar(canonico, "en", PREFIXO)}\` doesn't exist on this server.\n\nSee what's available here with \`${aliases.citar("help", "en", PREFIXO)}\`.`,
      colour: COR.aviso,
    }, {
      title: "🚫 No existe aquí",
      description: `\`${aliases.citar(canonico, "es", PREFIXO)}\` no existe en este servidor.\n\nMira lo que hay por aquí con \`${aliases.citar("help", "es", PREFIXO)}\`.`,
      colour: COR.aviso,
    }));
  }
  if (!ESSENCIAIS.has(canonico) && (ctx.config.comandosDesativados ?? []).includes(canonico)) {
    await log.registrar(ctx, "comandos", {
      titulo: "🚫 Comando desativado",
      descricao: `<@${message.authorId}> tentou usar \`${PREFIXO}${command}\`, que está desativado neste servidor.`,
      en: { titulo: "🚫 Disabled command",
        descricao: `<@${message.authorId}> tried to use \`${PREFIXO}${command}\`, which is disabled on this server.` },
      es: { titulo: "🚫 Comando desactivado",
        descricao: `<@${message.authorId}> intentó usar \`${PREFIXO}${command}\`, que está desactivado en este servidor.` },
    });
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Comando desativado",
      description: `O comando \`${aliases.citar(canonico, "pt", PREFIXO)}\` está desativado neste servidor.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Command disabled",
      description: `The \`${aliases.citar(canonico, "en", PREFIXO)}\` command is disabled on this server.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Comando desactivado",
      description: `El comando \`${aliases.citar(canonico, "es", PREFIXO)}\` está desactivado en este servidor.`,
      colour: COR.aviso,
    }));
  }


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
  const naVoz = COMANDOS_DE_VOZ.has(canonico) && (
    (cfgTts?.ativo && (message.channelId === cfgTts.canalVoz || message.channelId === cfgTts.canalTexto))
    || ehCanalDeVoz(message)
  );

  // `&acesso livre <comando> on` (P7, 20 out 2026): o admin solta um comando da
  // restrição de canal — os jogos do &entretenimento em qualquer canal, por exemplo.
  const livre = acessoMod.comandoLivre(ctx.config, canonico);
  if (!SEMPRE_LIBERADOS.has(canonico) && !naVoz && !livre) {
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
      }, {
        title: "🔐 Aquí no",
        description: "Los comandos están restringidos en este canal por la configuración de acceso del servidor.",
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
    en: { titulo: "⌨️ Command used",
      descricao: [
        `**User:** <@${message.authorId}>`,
        `**Channel:** <#${message.channelId}>`,
        `**Command:** \`${PREFIXO}${command}${args.length ? " " + args.join(" ") : ""}\``,
      ].join("\n") },
    es: { titulo: "⌨️ Comando usado",
      descricao: [
        `**Usuario:** <@${message.authorId}>`,
        `**Canal:** <#${message.channelId}>`,
        `**Comando:** \`${PREFIXO}${command}${args.length ? " " + args.join(" ") : ""}\``,
      ].join("\n") },
  });

  // (31 out 2026, decisão do dono) o dono do bot tem controle total em qualquer
  // servidor; quando usa um comando num servidor que não é dele, a staff de lá
  // fica sabendo pelo log (categoria própria, sempre ligada).
  const donoDoServidor = message.server?.ownerId ?? client.servers.get(serverId)?.ownerId ?? null;
  if (serverId && ehSuperAdmin(message.authorId) && donoDoServidor !== message.authorId) {
    const linha = `\`${PREFIXO}${command}${args.length ? " " + args.join(" ") : ""}\``.slice(0, 300);
    await log.registrar(ctx, "dono", {
      titulo: "🛠️ Comando do dono do bot", descricao: `<@${message.authorId}> · <#${message.channelId}>\n${linha}`,
      en: { titulo: "🛠️ Bot owner command", descricao: `<@${message.authorId}> · <#${message.channelId}>\n${linha}` },
      es: { titulo: "🛠️ Comando del dueño del bot", descricao: `<@${message.authorId}> · <#${message.channelId}>\n${linha}` },
    });
  }

  const argsFinais = aliases.normalizarArgs(canonico, args, CANONICO);

  // `<grupo>`, `<@pessoa>`, `‹cargo›` copiados da ajuda ao pé da letra (12 out
  // 2026: "as pessoas não estão sabendo usar o bot"). Comando de texto livre
  // fica de fora (falar de <div> no &chat é legítimo); o &automod tem a cola
  // dele, com os grupos.
  const marcador = TEXTO_LIVRE.has(canonico) ? null
    : args.find((a) => /^[<‹][^<>‹›@#%:]{1,30}[>›]$/.test(a) && !/^<[@#%]/.test(a));
  if (marcador) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "✏️ Troque o ‹…› por um valor",
      description: `\`${marcador}\` na ajuda é um **espaço para preencher** — não é para digitar com os sinais.\n\nEx.: em \`${aliases.citar("warn", "pt", PREFIXO)} <@pessoa>\`, mencione a pessoa: \`${aliases.citar("warn", "pt", PREFIXO)} @Ana\`.\nOs valores que \`${PREFIXO}${canonico}\` aceita: \`${PREFIXO}help ${canonico}\``,
      colour: COR.aviso,
    }, {
      title: "✏️ Replace the ‹…› with a value",
      description: `\`${marcador}\` in the help is a **blank to fill in** — not something to type with the brackets.\n\nE.g.: in \`${aliases.citar("warn", "en", PREFIXO)} <@user>\`, mention the person: \`${aliases.citar("warn", "en", PREFIXO)} @Ana\`.\nThe values \`${PREFIXO}${canonico}\` accepts: \`${PREFIXO}help ${canonico}\``,
      colour: COR.aviso,
    }, {
      title: "✏️ Cambia el ‹…› por un valor",
      description: `\`${marcador}\` en la ayuda es un **espacio para rellenar** — no hay que escribirlo con los signos.\n\nEj.: en \`${aliases.citar("warn", "es", PREFIXO)} <@usuario>\`, menciona a la persona: \`${aliases.citar("warn", "es", PREFIXO)} @Ana\`.\nLos valores que acepta \`${aliases.citar(canonico, "es", PREFIXO)}\`: \`${aliases.citar("help", "es", PREFIXO)} ${aliases.citar(canonico, "es", "")}\``,
      colour: COR.aviso,
    }));
  }

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
    }, {
      title: "❌ Error inesperado",
      description: "Algo salió mal al ejecutar el comando.",
      colour: COR.erro,
    }));
  }
}

client.on("messageReactionAdd", async (...a) => {
  ultimoEvento = Date.now();
  try {
    if (cfgGlobal.debug === true) {
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
    // Jogo da velha (&entretenimento velha): 1️⃣–9️⃣ no tabuleiro é a jogada.
    if (await jogos.aoReagir(msgId, userId, emoji)) return;

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
    if (cfgGlobal.debug === true) {
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
    const idadeTxt = (en, es = false) => idade == null ? "" : idade < 3600_000
      ? (es ? ` ⚠️ **cuenta creada hace ${Math.max(1, Math.round(idade / 60_000))} min**` : en ? ` ⚠️ **account created ${Math.max(1, Math.round(idade / 60_000))} min ago**` : ` ⚠️ **conta criada há ${Math.max(1, Math.round(idade / 60_000))} min**`)
      : idade < 86_400_000 ? (es ? ` · cuenta creada hace ${Math.round(idade / 3600_000)}h` : en ? ` · account created ${Math.round(idade / 3600_000)}h ago` : ` · conta criada há ${Math.round(idade / 3600_000)}h`) : "";
    await log.registrar(ctx, "membros", {
      titulo: "📥 Membro entrou",
      descricao: `<@${userId}> entrou no servidor.${idadeTxt(false)}`,
      en: { titulo: "📥 Member joined", descricao: `<@${userId}> joined the server.${idadeTxt(true)}` },
      es: { titulo: "📥 Miembro entró", descricao: `<@${userId}> entró al servidor.${idadeTxt(true, true)}` },
    });

    const onda = confianca.registrarEntrada(serverId, userId);
    if (onda.iniciou) {
      console.log(`[ANTIRAID] ${serverId}: ${onda.contas.length} contas novas em pouco tempo — proteção por ${onda.minutos} min`);
      relatorioHora.evento(serverId, "raid", `Possível raid: ${onda.contas.length} contas novas em 15 min`);
      const destinoId = ctx.config?.automod?.antiScam?.alertChannelId || ctx.config?.log?.canalId;
      const achado = destinoId ? await client.channels.fetch(destinoId).catch(() => null) : null;
      // canal de outro servidor (herdado do molde antigo) nunca recebe o alerta
      const destino = achado && (achado.serverId ?? achado.server?.id) === serverId ? achado : null;
      const mencoes = onda.contas.map((u) => `<@${u}>`).join(" · ");
      if (destino) await sendEmbed(destino, {
        ...tr(ctx, {
          title: "🛡️ Possível raid",
          description: [
            `**${onda.contas.length} contas criadas há menos de 24h** entraram em pouco tempo:`,
            mencoes,
            "",
            `Pelos próximos **${onda.minutos} min**, conta nova passa pelo automod mais rígido: limiar do sentinela mais baixo e a mesma mensagem só 2 vezes.`,
            "Ninguém foi punido por entrar.",
          ].join("\n"),
        }, {
          title: "🛡️ Possible raid",
          description: [
            `**${onda.contas.length} accounts created less than 24h ago** joined in a short time:`,
            mencoes,
            "",
            `For the next **${onda.minutos} min**, new accounts get the strictest automod: lower sentinel threshold and the same message only twice.`,
            "Nobody was punished for joining.",
          ].join("\n"),
        }, {
          title: "🛡️ Posible raid",
          description: [
            `**${onda.contas.length} cuentas creadas hace menos de 24h** entraron en poco tiempo:`,
            mencoes,
            "",
            `Durante los próximos **${onda.minutos} min**, las cuentas nuevas pasan por el automod más estricto: umbral del centinela más bajo y el mismo mensaje solo 2 veces.`,
            "Nadie fue sancionado por entrar.",
          ].join("\n"),
        }),
        colour: COR.aviso,
      });
    }

    // Lista global: pode banir automaticamente (se o servidor optou por isso)
    const banido = await banGlobal.verificarEntrada(member, ctx);
    if (banido) return;   // já foi banido: não faz sentido dar cargo/reaplicar silêncio

    // Foto de perfil pelo modelo de visão (13 out 2026). Em segundo plano:
    // a análise leva segundos e as boas-vindas não esperam por ela.
    avatarMod.aoEntrar(member, ctx).catch((e) => console.error("[AVATAR] entrada:", descreverErro(e)));

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

    if (cfgGlobal.debug === true) {
      console.log(`[EVENTO] serverMemberLeave: server=${serverId} user=${userId}`);
    }
    if (!serverId || !userId) {
      if (cfgGlobal.debug === true) {
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
      en: { titulo: "📤 Member left", descricao: `<@${userId}> left the server (left, kicked or banned).` },
      es: { titulo: "📤 Miembro salió", descricao: `<@${userId}> salió del servidor (salida, expulsión o ban).` },
    });
    const nome = member?.user?.username ?? member?.nickname ?? null;
    await bemvindo.aoSair(userId, serverId, ctx, nome);
  } catch (err) { console.error("[EVENTO][LEAVE]", err?.message); }
});

// A Judy saiu de um servidor (expulsa, ou ele acabou): os dados dele somem em 30 dias
for (const evento of ["serverLeave", "serverDelete"]) {
  client.on(evento, (server) => {
    try { retencao.marcarSaida(server?.id); console.info(`[PRIVACIDADE] saí do servidor ${server?.id} — dados apagados em ${retencao.DIAS_APOS_SAIDA} dias, se eu não voltar`); }
    catch (e) { console.error("[PRIVACIDADE] saída:", e?.message); }
  });
}

client.on("serverCreate", async (server) => {
  try { if (retencao.desmarcarSaida(server?.id)) console.info(`[PRIVACIDADE] voltei ao servidor ${server?.id} — nada será apagado`); } catch {}
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

    // trocou a foto DESTE servidor? (em segundo plano)
    avatarMod.aoTrocarNoServidor(member, anterior, criarContexto(serverId))
      .catch((e) => console.error("[AVATAR] troca (servidor):", descreverErro(e)));

    const antes  = (anterior?.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    const agora  = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    const ganhou = agora.filter((r) => !antes.includes(r));
    const perdeu = antes.filter((r) => !agora.includes(r));
    if (!ganhou.length && !perdeu.length) return;

    const ctx = criarContexto(serverId);
    // (13 out 2026) os cargos `ticket-NNNN` (o que a Judy dá a si mesma e a
    // quem abriu, para enxergarem o canal) não são notícia — o log do ticket já
    // conta quem abriu e quem fechou; e o cargo aparece pelo NOME, não pelo ID
    const srv = member.server ?? client.servers.get?.(serverId);
    const ehDoTicket = (r) => cargosDeTicket.has(r) || /^ticket-\d+$/.test(nomeDoCargo(srv, r) ?? "");
    if ([...ganhou, ...perdeu].every(ehDoTicket)) return;
    const partes = (en, es = false) => [
      ganhou.length ? `**${es ? "Recibió" : en ? "Received" : "Recebeu"}:** ${ganhou.map((r) => cargoLegivel(srv, r, en, es)).join(", ")}` : null,
      perdeu.length ? `**${es ? "Perdió" : en ? "Lost" : "Perdeu"}:** ${perdeu.map((r) => cargoLegivel(srv, r, en, es)).join(", ")}` : null,
    ].filter(Boolean).join("\n");
    await log.registrar(ctx, "cargos", {
      titulo: "🏷 Cargos alterados",
      descricao: `<@${userId}>\n${partes(false)}`,
      en: { titulo: "🏷 Roles changed", descricao: `<@${userId}>\n${partes(true)}` },
      es: { titulo: "🏷 Roles cambiados", descricao: `<@${userId}>\n${partes(true, true)}` },
    });
  } catch (err) { console.error("[EVENTO][MEMBER_UPDATE]", err?.message); }
});

// TROCOU A FOTO DO PERFIL (vale em todo servidor da Judy onde a pessoa está).
// A presença (online/offline) também chega por aqui — sem foto nova, nada.
client.on("userUpdate", (user, anterior) => {
  avatarMod.aoTrocarPerfil(user, anterior, { client, criarContexto })
    .catch((e) => console.error("[AVATAR] troca (perfil):", descreverErro(e)));
});

// MENSAGEM APAGADA
// O payload é cru (sem serverId) → derivamos do channelId.
client.on("messageDelete", async (message) => {
  ultimoEvento = Date.now();
  try {
    if (cfgGlobal.debug === true) {
      console.log(`[EVENTO] messageDelete: canal=${message?.channelId} autor=${message?.authorId}`);
    }
    if (message?.authorId === client.user?.id) return;  // ignora o próprio bot

    const serverId = await servidorDoCanal(message?.channelId);
    if (!serverId) {
      if (cfgGlobal.debug === true) console.log("[EVENTO] messageDelete: sem servidor (DM?) — ignorado");
      return;
    }
    const ctx = criarContexto(serverId);
    const texto = (message?.content ?? "").slice(0, 500) || "_(sem texto)_";
    const autor = message?.authorId ? `<@${message.authorId}>` : "_desconhecido_";
    const textoEn = (message?.content ?? "").slice(0, 500) || "_(no text)_";
    const autorEn = message?.authorId ? `<@${message.authorId}>` : "_unknown_";

    // Mídia apagada volta no log: resgatada do CDN e re-subida — com freio. No
    // ataque de 2 out, cada bandeira apagada voltava inteira no #log, que virou
    // um segundo canal de spam. Por autor: no máximo 3 resgates a cada 10 min, e
    // a mesma imagem (tamanho + dimensões) só uma vez.
    const anexosApagados = message?.attachments ?? [];
    const freio = log.freioDeResgate(`${serverId}:${message?.authorId}`, anexosApagados);
    const { ids: midias, perdidas } = await log.resgatarMidias(freio.resgatar, { subir: chat.subirAnexo });
    const notaMidia =
      (midias.length ? `\n**Mídia:** ${midias.length} anexo(s) resgatado(s) abaixo` : "") +
      (perdidas.length ? `\n**Mídia não recuperável:** ${perdidas.join(", ")}` : "") +
      (freio.segurados ? `\n**Mídia não reenviada:** ${freio.segurados} anexo(s) — repetido(s) ou rajada do mesmo autor` : "");
    const notaMidiaEn =
      (midias.length ? `\n**Media:** ${midias.length} attachment(s) recovered below` : "") +
      (perdidas.length ? `\n**Media not recoverable:** ${perdidas.join(", ")}` : "") +
      (freio.segurados ? `\n**Media not re-sent:** ${freio.segurados} attachment(s) — repeated or a burst from the same author` : "");
    const textoEs = (message?.content ?? "").slice(0, 500) || "_(sin texto)_";
    const autorEs = message?.authorId ? `<@${message.authorId}>` : "_desconocido_";
    const notaMidiaEs =
      (midias.length ? `\n**Multimedia:** ${midias.length} adjunto(s) recuperado(s) abajo` : "") +
      (perdidas.length ? `\n**Multimedia no recuperable:** ${perdidas.join(", ")}` : "") +
      (freio.segurados ? `\n**Multimedia no reenviada:** ${freio.segurados} adjunto(s) — repetido(s) o ráfaga del mismo autor` : "");

    await log.registrar(ctx, "mensagens", {
      titulo: "🗑 Mensagem apagada",
      descricao: `**Autor:** ${autor}\n**Canal:** <#${message.channelId}>\n**Conteúdo:** ${texto}${notaMidia}`,
      en: { titulo: "🗑 Message deleted",
        descricao: `**Author:** ${autorEn}\n**Channel:** <#${message.channelId}>\n**Content:** ${textoEn}${notaMidiaEn}` },
      es: { titulo: "🗑 Mensaje borrado",
        descricao: `**Autor:** ${autorEs}\n**Canal:** <#${message.channelId}>\n**Contenido:** ${textoEs}${notaMidiaEs}` },
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
    // Editar também passa pelo automod (os filtros de conteúdo): antes, uma
    // mensagem inocente editada para um golpe ou um convite ficava lá.
    if (message?.content && typeof message.delete === "function") {
      engine.runAutomod(message, ctx, { soConteudo: true })
        .catch((e) => console.error("[AUTOMOD][edição]", descreverErro(e)));
    }
    await log.registrar(ctx, "mensagens", {
      titulo: "✏️ Mensagem editada",
      descricao: [
        `**Autor:** ${autor ? `<@${autor}>` : "_desconhecido_"}`,
        `**Canal:** <#${canalId}>`,
        `**Antes:** ${antes || "_(vazio)_"}`,
        `**Depois:** ${agora || "_(vazio)_"}`,
      ].join("\n"),
      en: { titulo: "✏️ Message edited",
        descricao: [
          `**Author:** ${autor ? `<@${autor}>` : "_unknown_"}`,
          `**Channel:** <#${canalId}>`,
          `**Before:** ${antes || "_(empty)_"}`,
          `**After:** ${agora || "_(empty)_"}`,
        ].join("\n") },
      es: { titulo: "✏️ Mensaje editado",
        descricao: [
          `**Autor:** ${autor ? `<@${autor}>` : "_desconocido_"}`,
          `**Canal:** <#${canalId}>`,
          `**Antes:** ${antes || "_(vacío)_"}`,
          `**Después:** ${agora || "_(vacío)_"}`,
        ].join("\n") },
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
      en: { titulo: "🗑 Messages bulk-deleted", descricao: `**${mensagens?.length ?? 0}** message(s) removed in <#${canalId}>.` },
      es: { titulo: "🗑 Mensajes borrados en masa", descricao: `**${mensagens?.length ?? 0}** mensaje(s) eliminado(s) en <#${canalId}>.` },
    });
  } catch (err) { console.error("[EVENTO][MSG_BULK]", err?.message); }
});

// CARGO CRIADO / ATUALIZADO
// O nome do cargo (o log mostrava só o ID: "Cargo `01M4VJX4…` foi criado").
// ids dos cargos `ticket-NNNN` já vistos: quando o ticket fecha, o cargo some
// do servidor antes de o "perdeu o cargo" chegar, e aí não dá mais para ler o nome
const cargosDeTicket = new Set();
function nomeDoCargo(server, roleId) {
  try { return server?.roles?.get?.(roleId)?.name ?? server?.roles?.[roleId]?.name ?? null; } catch { return null; }
}
function cargoLegivel(server, roleId, en = false, es = false) {
  const nome = nomeDoCargo(server, roleId);
  return nome ? `<%${roleId}> **${nome}**${/^ticket-\d+$/.test(nome) ? (es ? " _(rol del ticket)_" : en ? " _(ticket role)_" : " _(cargo do ticket)_") : ""}` : `\`${roleId}\``;
}

client.on("serverRoleUpdate", async (server, roleId, anterior) => {
  completarCanais(server).catch(() => {});   // cargo mudou: pode ter canal novo visível
  try {
    // os cargos `ticket-NNNN` nascem e morrem com cada ticket: o log do ticket já conta
    if (/^ticket-\d+$/.test(nomeDoCargo(server, roleId) ?? "")) { cargosDeTicket.add(roleId); return; }
    // a stoat.js manda `{}` como "anterior" quando o cargo é novo — só um
    // anterior COM nome quer dizer que o cargo já existia
    const jaExistia = !!anterior?.name;
    const atual = server?.roles?.get?.(roleId);
    const mudou = [];   // [pt, en, es]
    if (jaExistia && atual) {
      if (atual.name !== anterior.name) mudou.push([`nome: **${anterior.name}** → **${atual.name}**`, `name: **${anterior.name}** → **${atual.name}**`, `nombre: **${anterior.name}** → **${atual.name}**`]);
      if (String(atual.permissions?.a) !== String(anterior.permissions?.a) || String(atual.permissions?.d) !== String(anterior.permissions?.d)) mudou.push(["permissões", "permissions", "permisos"]);
      if (atual.rank !== anterior.rank) mudou.push(["posição na lista", "position in the list", "posición en la lista"]);
      if ((atual.colour ?? null) !== (anterior.colour ?? null)) mudou.push(["cor", "colour", "color"]);
    }
    const oQue = (i) => (mudou.length ? ` — ${mudou.map((m) => m[i]).join(", ")}.` : ".");
    const ctx = criarContexto(server?.id);
    await log.registrar(ctx, "cargos", {
      titulo: jaExistia ? "🏷 Cargo atualizado" : "🏷 Cargo criado",
      descricao: `${cargoLegivel(server, roleId)} ${jaExistia ? "foi modificado" + oQue(0) : "foi criado."}`,
      en: { titulo: jaExistia ? "🏷 Role updated" : "🏷 Role created",
        descricao: `${cargoLegivel(server, roleId, true)} ${jaExistia ? "was modified" + oQue(1) : "was created."}` },
      es: { titulo: jaExistia ? "🏷 Rol actualizado" : "🏷 Rol creado",
        descricao: `${cargoLegivel(server, roleId, true, true)} ${jaExistia ? "fue modificado" + oQue(2) : "fue creado."}` },
    });
  } catch (err) { console.error("[EVENTO][ROLE_UPDATE]", err?.message); }
});

// CARGO APAGADO
client.on("serverRoleDelete", async (server, roleId, cargo) => {
  try {
    if (/^ticket-\d+$/.test(cargo?.name ?? "")) { cargosDeTicket.add(roleId); return; }   // apagado junto com o ticket
    const ctx = criarContexto(server?.id);
    await log.registrar(ctx, "cargos", {
      titulo: "🗑 Cargo apagado",
      descricao: `${cargo?.name ? `**${cargo.name}**` : "Cargo"} \`${roleId}\` foi removido do servidor.`,
      en: { titulo: "🗑 Role deleted", descricao: `${cargo?.name ? `**${cargo.name}**` : "Role"} \`${roleId}\` was removed from the server.` },
      es: { titulo: "🗑 Rol eliminado", descricao: `${cargo?.name ? `**${cargo.name}**` : "Rol"} \`${roleId}\` fue eliminado del servidor.` },
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
// (31 out 2026, Regra do Reparo) .env inválido para o boot com a lista do que corrigir
{
  const problemas = problemasDoEnv();
  if (problemas.length) {
    console.error(`[ENV] O .env tem ${problemas.length} problema(s):\n  - ${problemas.join("\n  - ")}`);
    process.exit(1);
  }
  for (const a of avisosDoEnv()) console.warn(`[ENV] ${a}`);
}
async function conectar(tentativa = 1) {
  const MAX = numero("LOGIN_MAX_TENTATIVAS", 10, { min: 1, max: 1000, inteiro: true });
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
