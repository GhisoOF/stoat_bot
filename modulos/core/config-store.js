// ══════════════════════════════════════════════════════════
//  config-store.js — Gestão da configuração
//  • Config POR SERVIDOR (automod, punição, whitelist, idioma)
//  • Config GLOBAL compartilhada (debug, blocklist)
//  Persistência via db.js (SQLite). Migra o automod-config.json
//  antigo na primeira execução.
// ══════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import * as db from "./db.js";

// ── Template de configuração POR SERVIDOR ──
export const padraoServidor = {
  language: "pt",                  // pt | en (definido pelo admin com &idioma)
  idiomaPerguntado: false,         // já sugerimos a escolha de idioma uma vez?
  automod: {
    antiSpam:        { enabled: true,  maxMessages: 5,  windowMs: 4000, punicao: null },
    antiMassSpam:    { enabled: true,  maxMessages: 12, windowMs: 8000, punicao: null },
    antiInvite:      { enabled: true,  punicao: null },
    antiMassMention: { enabled: true,  maxMentions: 5, punicao: null },
    antiCaps:        { enabled: true,  minLength: 15, threshold: 0.70, punicao: null },
    antiLink:        { enabled: false, punicao: null },
    antiCaracteres:  { enabled: true, limiteZalgo: 0.6, punicao: null },
    antiRepeticao:   { enabled: false, maxRepeticao: 15, ignorar: "k", punicao: null },
    // O "sentinela" (nome antigo: antiScam) é o único módulo que JULGA em vez
    // de medir — por isso é o único com rigor variável por antiguidade.
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
  },
  // ── Moderação por IA na conversa (a Judy avalia por critérios) ──
  moderacaoIA: {
    ativa:     false,          // liga/desliga (&modia on|off)
    criterios: "",             // texto livre: o que a Judy deve moderar
    canais:    [],             // canais onde vigia ([] = todos os permitidos)
  },
  inviteWhitelist:      [],
  // ── Chat de logs (configurável com &log) ──
  log: {
    canalId: null,            // null = desativado
    eventos: {                // cada categoria pode ser ligada/desligada
      punicoes:  true,
      membros:   true,
      mensagens: true,
      cargos:    true,
      comandos:  false,       // ruidoso: começa desligado
    },
  },
  // ── Acesso aos comandos ────────────────────────────────
  acesso: {
    // Cargos que valem como "staff": quem tiver um deles usa os comandos de
    // moderação mesmo sem a permissão nativa do Stoat. Vazio = só as permissões.
    cargosStaff: [],
    // Onde os comandos funcionam:
    //   "todos"   → em qualquer canal (padrão)
    //   "somente" → só nos canais da lista
    //   "exceto"  → em todos, menos os da lista
    canais: { modo: "todos", lista: [] },
    // Staff escapa da restrição de canal (para moderar de qualquer lugar).
    staffIgnoraCanais: true,
  },
  // ── Lista global de banimentos (&banglobal) ──
  banGlobal: {
    modo: "off",              // off | avisar | banir  (padrão: nada automático)
  },
  // ── Comandos desativados neste servidor (nomes canônicos) ──
  comandosDesativados: [],
  // ── Curadoria RSS ──
  rss: { canalId: null },
  autorole: { roleId: null },   // cargo dado automaticamente a quem entra
  chatLivre: { canais: [], modo: "relevante" },    // "relevante" = só o que julgar importante; "todas" = toda mensagem
  // Comentário espontâneo: a Judy solta um comentário sobre a conversa em
  // andamento, por iniciativa, num canal escolhido. Com freios de frequência.
  comentarioEspontaneo: {
    canalId:    null,     // canal único onde ela comenta (null = desligado)
    porDia:     4,        // teto de comentários espontâneos por dia
    minParaFalar: 4,      // quantas mensagens de conversa antes de considerar comentar
  },
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
  debug:                true,
  linkBlocklistSources: [],   // recurso pesado (milhões de domínios) — compartilhado
  linkBlocklistManual:  [],
};

let templateServidor = structuredClone(padraoServidor);
let cfgGlobal        = structuredClone(padraoGlobal);
const cacheConfig    = new Map();   // serverId → config (por servidor)

// Mescla config salva com o template (preenche campos novos de updates)
function mesclarServidor(salvo, tpl) {
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
    banGlobal: { ...tpl.banGlobal, ...(salvo.banGlobal ?? {}) },
    comandosDesativados: [...(salvo.comandosDesativados ?? tpl.comandosDesativados)],
    rss: { ...tpl.rss, ...(salvo.rss ?? {}) },
    autorole: { ...tpl.autorole, ...(salvo.autorole ?? {}) },
    chatLivre: { ...tpl.chatLivre, ...(salvo.chatLivre ?? {}) },
    acesso: {
      ...tpl.acesso,
      ...(salvo.acesso ?? {}),
      canais: { ...tpl.acesso.canais, ...(salvo.acesso?.canais ?? {}) },
    },
    // A chave era "game"; virou "xp". Aceitamos a antiga para não perder a
    // configuração de quem já usava (migração silenciosa, sem quebrar nada).
    xp: { ...tpl.xp, ...(salvo.xp ?? salvo.game ?? {}) },
    automod: {
      ...am, ...s,
      antiSpam:        { ...am.antiSpam,        ...(s.antiSpam ?? {}) },
      antiMassSpam:    { ...am.antiMassSpam,    ...(s.antiMassSpam ?? {}) },
      antiInvite:      { ...am.antiInvite,      ...(s.antiInvite ?? {}) },
      antiMassMention: { ...am.antiMassMention, ...(s.antiMassMention ?? {}) },
      antiCaps:        { ...am.antiCaps,        ...(s.antiCaps ?? {}) },
      antiLink:        { ...am.antiLink,        ...(s.antiLink ?? {}) },
      antiCaracteres:  { ...am.antiCaracteres,  ...(s.antiCaracteres ?? {}) },
      antiRepeticao:   { ...am.antiRepeticao,   ...(s.antiRepeticao ?? {}) },
      antiScam:        { ...am.antiScam,        ...(s.antiScam ?? {}) },
      punicao:         { ...am.punicao,         ...(s.punicao ?? {}) },
    },
  };
}

// Config de um servidor (cache → banco → template)
export function configDoServidor(serverId) {
  if (!serverId) return structuredClone(templateServidor);
  if (cacheConfig.has(serverId)) return cacheConfig.get(serverId);
  let cfg = db.lerConfig(serverId);
  if (!cfg) {
    cfg = structuredClone(templateServidor);
    db.gravarConfig(serverId, cfg);
    console.info(`[CONFIG] Novo servidor ${serverId} — config criada do padrão.`);
  } else {
    cfg = mesclarServidor(cfg, templateServidor);
  }
  cacheConfig.set(serverId, cfg);
  return cfg;
}

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
    templateServidor = mesclarServidor(tplSalvo, padraoServidor);
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
    templateServidor = mesclarServidor({
      language:        "pt",
      automod:         legado.automod ?? {},
      inviteWhitelist: legado.inviteWhitelist ?? [],
    }, padraoServidor);
  } else {
    console.info("[CONFIG] Sem config anterior — usando padrões.");
  }

  db.gravarConfig("__global__", cfgGlobal);
  db.gravarConfig("__default__", templateServidor);
}

// Só para testes: limpa o cache em memória
export function _limparCache() { cacheConfig.clear(); }
