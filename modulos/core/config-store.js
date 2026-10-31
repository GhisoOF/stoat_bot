
import { readFileSync } from "node:fs";
import * as db from "./db.js";
import { limparMolde } from "./molde.js";

// ── Template de configuração POR SERVIDOR ──
// O idioma OFICIAL do bot é o inglês (13 out 2026, pedido de Ghieh): servidor
// novo (e o &reset) nasce em inglês. IDIOMA_PADRAO=pt no .env muda isso.
// Servidores que já existem não mudam: config salva sem idioma era português.
export const idiomaPadrao = () => ((process.env.IDIOMA_PADRAO || "en").trim().toLowerCase() === "pt" ? "pt" : "en");

export const padraoServidor = {
  language: "en",                  // en | pt (definido pelo admin com &idioma) — o padrão é idiomaPadrao()
  idiomaPerguntado: false,         // já sugerimos a escolha de idioma uma vez?
  automod: {
    antiSpam:        { enabled: true,  maxMessages: 5,  windowMs: 4000, punicao: null },
    antiMassSpam:    { enabled: true,  maxMessages: 12, windowMs: 8000, punicao: null },
    antiInvite:      { enabled: true,  punicao: null, canaisLiberados: [] },   // canaisLiberados: onde convites podem (divulgação)
    antiMassMention: { enabled: true,  maxMentions: 5, punicao: null },
    antiCaps:        { enabled: true,  minLength: 15, threshold: 0.70, punicao: null },
    antiLink:        { enabled: false, punicao: null },
    antiCaracteres:  { enabled: true, limiteZalgo: 0.6, punicao: null },
    antiRepeticao:   { enabled: false, maxRepeticao: 15, ignorar: "k", punicao: null },
    // (2 out 2026) o que o ataque de imagens e emoji mostrou que faltava:
    antiOdio:        { enabled: true,  termos: [], punicao: null },                 // insulto racial/homofóbico
    antiEmoji:       { enabled: true,  maxEmojis: 20, punicao: null },              // enxurrada de emoji
    antiMidia:       { enabled: true,  maxPorMinuto: 8, maxNovato: 3, punicao: null }, // rajada de anexos
    // Mesma mensagem repetida VÁRIAS VEZES (o anti-spam só vê velocidade).
    antiDuplicata:   { enabled: true,  maxRepetidas: 3, windowMs: 120000, punicao: null },
    // Imagens descritas pelo modelo de visão e pontuadas (só avisa a staff).
    // `todos: false` = só conta nova (ou < 7 dias numa onda de raid).
    antiImagem:      { enabled: true,  todos: false },
    // (13 out 2026) temas proibidos pela regra: cada tema com sua ação
    // (off · alertar · apagar · punir); nota por peso + a IA confirma.
    antiAssuntos: {
      enabled: false,
      acoes: { politica: "off", religiao: "off", drogas: "off", sexual: "off" },
      termos: {}, canaisLiberados: [], punicao: null,
      sensibilidade: "media",   // limiar da nota: baixa 6 · media 4,5 · alta 3,5
      ia: true,                 // a IA confirma (off = a nota decide sozinha)
    },
    // (13 out 2026) foto de perfil ao entrar/trocar, vista pelo modelo de visão.
    // acao: alertar · silenciar · expulsar · banir (a staff é sempre avisada).
    antiAvatar:      { enabled: true,  acao: "silenciar", tempo: "24h" },
    antiScam: {
      enabled: false, sensitivity: "media", alertChannelId: null, punicao: null,
      porAntiguidade: true,   // limiar acompanha o nível do membro
      alertarAdmin: true,     // marca a staff diante de um padrão suspeito
    },
    // `escada`: os degraus do modo `acumular`, em ordem. Ver automod-engine.
    punicao: {
      modo: "avisar", warnsParaBan: 3, silenceRoleId: null,
      escada: "aviso,5m,1h,ban",
    },
    isentarStaff: true,       // (P2: já era lido como `!== false`) a staff passa pelos filtros sem punição
  },
  // (P2, 31 out 2026) `moderacaoIA` saiu do padrão com o &modia (temas por IA: `automod.antiAssuntos`).
  // A chave que já está gravada nos servidores fica no banco (nunca se apaga dado); ninguém a lê.
  inviteWhitelist:      [],   // códigos de convite do Stoat (anti-invite)
  dominiosPermitidos:   [],   // domínios que o anti-link nunca bloqueia
  // ── Chat de logs (configurável com &log) ──
  log: {
    canalId: null,            // null = desativado
    eventos: {                // cada categoria pode ser ligada/desligada
      punicoes:  true,
      membros:   true,
      mensagens: true,
      cargos:    true,
      comandos:  false,       // ruidoso: começa desligado
      // (P2) `atualizacoes` saiu: as novidades da Judy vão SEMPRE ao canal de log
      // (o valor antigo, se gravado, fica no banco e não é lido)
    },
  },
  acesso: {
    cargosStaff: [],
    canais: { modo: "todos", lista: [] },
    // Staff escapa da restrição de canal (para moderar de qualquer lugar).
    staffIgnoraCanais: true,
    livres: [],               // comandos que valem em qualquer canal (`&config acesso livre <cmd> on`)
  },
  // ── Lista global de banimentos (&banglobal) ──
  banGlobal: {
    modo: "off",              // off | avisar | banir  (padrão: nada automático)
    isentos: [],
  },
  // ── Comandos desativados neste servidor (nomes canônicos) ──
  comandosDesativados: [],
  // ── O servidor manda ao dono da Judy um relatório ANÔNIMO de ataques? (P4) ──
  relatorioDono: false,
  // ── Curadoria RSS ──
  rss: { canalId: null, horario: "21:00", urgentes: [] },   // (P2, ferramentas) o telejornal: hora local e os termos urgentes
  autorole: { roleId: null },   // cargo dado automaticamente a quem entra
  chatLivre: { canais: [], modo: "relevante" },    // "relevante" = só o que julgar importante; "todas" = toda mensagem
  comentarioEspontaneo: {
    canalId:    null,     // canal único onde ela comenta (null = desligado)
    porDia:     4,        // teto de comentários espontâneos por dia
    minParaFalar: 4,      // quantas mensagens de conversa antes de considerar comentar
  },
  // ── (P2, 31 out 2026) o que os módulos já gravavam e o padrão não declarava ──
  // Declarado aqui para a tela do &config sair inteira deste molde (nenhuma chave fora).
  // Os valores são os mesmos que cada módulo já assumia quando faltava a chave.
  ia: { chat: null, imagem: null },   // a escolha do servidor (null = o padrão do .env); `&assistente ia|imagem`
  tts: {
    ativo: false, canalVoz: null, canalTexto: null, voz: null, cooldown: null, anunciarNome: true,
    dicionario: {}, expandir: true, efeito: null, tom: null, filtro: true, porMinuto: null,
  },
  servidorInfo: { regrasCanal: null, regrasTexto: null, faq: [] },
  staff: { titulos: {} },              // roleId → rótulo no &staff
  corPainel: { cargos: [] },           // cargos criados pelo painel de cores
  fusos: { lista: [], principal: null, formato24: true },
  tickets: { painel: null, logCanal: null, cargoEquipe: null, categorias: null, contador: 0 },
  // boas-vindas, despedida e economia: o padrão depende do idioma do servidor (o módulo
  // preenche na primeira vez); aqui só a chave, para a tela
  boasVindas: {},
  adeus: {},
  economia: {},
  // ── Game (sistema de níveis por XP de mensagem) ──
  xp: {
    enabled: false,
    xpMin: 15, xpMax: 25,        // XP ganho por mensagem (aleatório na faixa)
    cooldownMs: 60000,           // 1 min entre ganhos (evita farm por spam)
    multiplicador: 1.5,          // dificuldade: XP p/ subir de nível cresce por isso
    nivelMaximo: 100,
    intervaloCargos: 10,         // cria/dá cargo a cada N níveis (5 ou 10)
    canalAnuncio: null,          // canal onde anuncia level up (null = no próprio canal)
    anunciarLevelUp: true,
  },
};

// ── Config GLOBAL (compartilhada por todos os servidores) ──
export const padraoGlobal = {
  debug:                false,   // (31 out 2026) o debug do automod grava o fluxo de toda mensagem: só ligado de propósito
  linkBlocklistSources: [],   // recurso pesado (milhões de domínios) — compartilhado
  linkBlocklistManual:  [],
};

let templateServidor = structuredClone(padraoServidor);
let cfgGlobal        = structuredClone(padraoGlobal);
const cacheConfig    = new Map();   // serverId → config (por servidor)

// Mescla config salva com o template (preenche campos novos de updates)
// Um servidor que DESLIGOU todos os filtros não ganha filtro novo ligado só
// porque a Judy foi atualizada (15 out 2026: o antiAvatar nasceu ligado e
// silenciava gente em servidor com "automod off" — já tinha acontecido em
// 2 out com antiOdio/antiEmoji/antiMidia/antiDuplicata/antiImagem).
function tudoDesligadoNoSalvo(s) {
  const mods = Object.entries(s ?? {}).filter(([k, v]) => /^anti[A-Z]/.test(k) && v && typeof v === "object" && "enabled" in v);
  return mods.length >= 3 && mods.every(([, v]) => v.enabled === false);
}

function mesclarServidor(salvo, tpl) {
  const cfg = mesclarServidorBruto(salvo, tpl);
  const s = salvo.automod ?? {};
  if (tudoDesligadoNoSalvo(s)) {
    for (const [k, v] of Object.entries(cfg.automod)) {
      if (/^anti[A-Z]/.test(k) && v && typeof v === "object" && !(k in s)) v.enabled = false;
    }
  }
  return cfg;
}

function mesclarServidorBruto(salvo, tpl) {
  const am = tpl.automod;
  const s  = salvo.automod ?? {};
  const lg = salvo.log ?? {};
  return {
    ...structuredClone(tpl),
    ...salvo,
    log: {
      ...tpl.log, ...lg,
      eventos: { ...tpl.log.eventos, ...(lg.eventos ?? {}) },
    },
    banGlobal: {
      ...tpl.banGlobal, ...(salvo.banGlobal ?? {}),
      isentos: [...(salvo.banGlobal?.isentos ?? [])],
    },
    comandosDesativados: [...(salvo.comandosDesativados ?? tpl.comandosDesativados)],
    rss: { ...tpl.rss, ...(salvo.rss ?? {}) },
    autorole: { ...tpl.autorole, ...(salvo.autorole ?? {}) },
    chatLivre: { ...tpl.chatLivre, ...(salvo.chatLivre ?? {}) },
    acesso: {
      ...tpl.acesso,
      ...(salvo.acesso ?? {}),
      canais: { ...tpl.acesso.canais, ...(salvo.acesso?.canais ?? {}) },
    },
    xp: { ...tpl.xp, ...(salvo.xp ?? salvo.game ?? {}) },
    automod: {
      ...am, ...s,
      antiSpam:        { ...am.antiSpam,        ...(s.antiSpam ?? {}) },
      antiMassSpam:    { ...am.antiMassSpam,    ...(s.antiMassSpam ?? {}) },
      antiInvite:      { ...am.antiInvite,      ...(s.antiInvite ?? {}), canaisLiberados: [...(s.antiInvite?.canaisLiberados ?? [])] },
      antiMassMention: { ...am.antiMassMention, ...(s.antiMassMention ?? {}) },
      antiCaps:        { ...am.antiCaps,        ...(s.antiCaps ?? {}) },
      antiLink:        { ...am.antiLink,        ...(s.antiLink ?? {}) },
      antiCaracteres:  { ...am.antiCaracteres,  ...(s.antiCaracteres ?? {}) },
      antiRepeticao:   { ...am.antiRepeticao,   ...(s.antiRepeticao ?? {}) },
      antiDuplicata:   { ...am.antiDuplicata,   ...(s.antiDuplicata ?? {}) },
      antiImagem:      { ...am.antiImagem,      ...(s.antiImagem ?? {}) },
      antiAssuntos:    { ...am.antiAssuntos,    ...(s.antiAssuntos ?? {}),
        acoes: { ...am.antiAssuntos.acoes, ...(s.antiAssuntos?.acoes ?? {}) },
        termos: { ...(s.antiAssuntos?.termos ?? {}) },
        canaisLiberados: [...(s.antiAssuntos?.canaisLiberados ?? [])] },
      antiAvatar:      { ...am.antiAvatar,      ...(s.antiAvatar ?? {}) },
      antiScam:        { ...am.antiScam,        ...(s.antiScam ?? {}) },
      punicao:         { ...am.punicao,         ...(s.punicao ?? {}) },
    },
  };
}

// Servidor NOVO nasce com o automod inteiro desligado (pedido de Ghieh, 12 out
// 2026): quem chega escolhe o que ligar (`&automod on`, `&automod antispam on`
// ou o `&assistente`), em vez de descobrir o filtro punindo alguém. Os
// parâmetros ficam (ligar depois volta com os números de fábrica). Servidores
// que já existem não mudam: a config deles é decisão de quem já configurou.
export function desligarAutomod(cfg) {
  for (const [k, v] of Object.entries(cfg?.automod ?? {})) {
    if (k !== "punicao" && v && typeof v === "object") v.enabled = false;
  }
  return cfg;
}

// (Privacidade P3, 20 out 2026, pedido do Ghieh) Servidor novo nasce com TODOS os
// módulos desligados — não só o automod —, mesmo que o molde salvo no banco
// (`__default__`, de antes) diga outra coisa. Os comandos continuam ligados.
export function desligarModulos(cfg) {
  desligarAutomod(cfg);
  if (cfg.xp) cfg.xp.enabled = false;
  if (cfg.moderacaoIA) cfg.moderacaoIA.ativa = false;
  if (cfg.banGlobal) cfg.banGlobal.modo = "off";
  if (cfg.chatLivre) cfg.chatLivre.canais = [];
  if (cfg.comentarioEspontaneo) cfg.comentarioEspontaneo.canalId = null;
  if (cfg.log) cfg.log.canalId = null;
  if (cfg.rss) cfg.rss.canalId = null;
  if (cfg.autorole) cfg.autorole.roleId = null;
  cfg.relatorioDono = false;
  for (const k of ["boasVindas", "adeus", "tts"]) if (cfg[k] && typeof cfg[k] === "object") cfg[k].ativo = false;
  return cfg;
}

// Config de um servidor (cache → banco → template)
// A `&automod whitelist` guardava TUDO como código de convite. Um link comum
// (`https://linksta.cc/@x`) ia parar ali e não servia para nada: quem bloqueia
// link comum é o anti-link, que nunca olhou essa lista. Aqui, o que parece
// endereço sai da lista de convites e vira domínio permitido.
function hostDe(valor) {
  const v = String(valor ?? "").trim().toLowerCase();
  if (!/[./]/.test(v)) return null;                       // código de convite puro
  const host = v.replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}
export { hostDe };

function migrarWhitelist(cfg) {
  cfg.dominiosPermitidos ??= [];
  let mudou = false;
  cfg.inviteWhitelist = (cfg.inviteWhitelist ?? []).filter((item) => {
    const host = hostDe(item);
    if (!host || host === "stt.gg") return true;          // convite do Stoat: fica
    if (!cfg.dominiosPermitidos.includes(host)) cfg.dominiosPermitidos.push(host);
    mudou = true;
    return false;
  });
  return mudou;
}

export function configDoServidor(serverId) {
  if (!serverId) return { ...structuredClone(templateServidor), language: idiomaPadrao() };
  if (cacheConfig.has(serverId)) return cacheConfig.get(serverId);
  let cfg = db.lerConfig(serverId);
  if (!cfg) {
    cfg = structuredClone(templateServidor);
    desligarModulos(cfg);
    cfg.language = idiomaPadrao();
    db.gravarConfig(serverId, cfg);
    console.info(`[CONFIG] Novo servidor ${serverId} — config criada do padrão.`);
  } else {
    // config antiga sem idioma salvo: era o padrão de então (português)
    if (cfg.language == null) cfg.language = "pt";
    cfg = mesclarServidor(cfg, templateServidor);
    if (migrarWhitelist(cfg)) db.gravarConfig(serverId, cfg);
  }
  cacheConfig.set(serverId, cfg);
  return cfg;
}

// &reset: a configuração de FÁBRICA (o padrão do código, não o molde antigo),
// como um servidor novo — automod desligado, idioma padrão.
export function configDeFabrica() {
  const cfg = structuredClone(padraoServidor);
  desligarModulos(cfg);
  cfg.language = idiomaPadrao();
  return cfg;
}
// Depois de gravar uma config direto no banco: a próxima leitura vem de lá.
export function recarregarServidor(serverId) { cacheConfig.delete(serverId); }

export function salvarConfigServidor(serverId) {
  const cfg = cacheConfig.get(serverId);
  if (serverId && cfg) db.gravarConfig(serverId, cfg);
}

export function getGlobal() { return cfgGlobal; }
export function salvarGlobal() { db.gravarConfig("__global__", cfgGlobal); }

// Abre o banco e migra o automod-config.json legado (uma vez)
export function inicializar(configPathLegado, dbPath) {
  db.abrirBanco(dbPath);

  const gSalvo   = db.lerConfig("__global__");
  const tplSalvo = db.lerConfig("__default__");

  if (gSalvo && tplSalvo) {
    cfgGlobal        = { ...structuredClone(padraoGlobal), ...gSalvo };
    // (31 out 2026, R9) o debug nasceu ligado e ficou gravado assim no banco: o log
    // copiava trecho de toda mensagem. Uma vez só, volta ao padrão novo (desligado);
    // quem quiser o liga de novo pelo &automod debug on.
    if (!cfgGlobal.debugRevisto31out) {
      cfgGlobal.debug = false;
      cfgGlobal.debugRevisto31out = true;
      db.gravarConfig("__global__", cfgGlobal);
    }
    // O molde salvo pode trazer IDs do servidor da era antiga (cargo de
    // silêncio, canal de avisos…): servidor novo não herda ID nenhum.
    templateServidor = limparMolde(mesclarServidor(tplSalvo, padraoServidor));
    db.gravarConfig("__default__", templateServidor);
    console.info("[CONFIG] Configuração carregada do banco.");
    return;
  }

  let legado = null;
  try {
    if (configPathLegado) {
      legado = JSON.parse(readFileSync(configPathLegado, "utf-8"));
      console.info("[CONFIG] Migrando automod-config.json para o banco…");
    }
  } catch { /* sem arquivo legado */ }

  if (legado) {
    cfgGlobal = {
      debug:                legado.debug ?? padraoGlobal.debug,
      linkBlocklistSources: legado.linkBlocklistSources ?? [],
      linkBlocklistManual:  legado.linkBlocklistManual ?? [],
    };
    templateServidor = limparMolde(mesclarServidor({
      language:        "pt",
      automod:         legado.automod ?? {},
      inviteWhitelist: legado.inviteWhitelist ?? [],
    }, padraoServidor));
  } else {
    console.info("[CONFIG] Sem config anterior — usando padrões.");
  }

  cfgGlobal.debugRevisto31out = true;   // instalação nova já nasce no padrão novo
  db.gravarConfig("__global__", cfgGlobal);
  db.gravarConfig("__default__", templateServidor);
}

// Só para testes: limpa o cache em memória
export function _limparCache() { cacheConfig.clear(); }
