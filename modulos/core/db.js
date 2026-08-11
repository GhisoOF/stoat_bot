// ══════════════════════════════════════════════════════════
//  db.js — Persistência com SQLite embutido (node:sqlite)
//  Zero dependências nativas: o SQLite vem dentro do Node.
//  Arquivo do banco em DB_PATH (padrão ./stoat.db; no Docker,
//  /data/stoat.db, dentro do volume persistente).
//
//  Fase 1: tabela `config` (por servidor + linhas especiais
//  __global__ e __default__). Fases 2/3 acrescentam `punicoes`
//  e `bans_globais` — já deixo as tabelas criadas.
// ══════════════════════════════════════════════════════════

import { DatabaseSync } from "node:sqlite";

let db = null;

export function abrirBanco(caminho) {
  const DB_PATH = caminho || process.env.DB_PATH || "./stoat.db";
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");   // leituras/escritas concorrentes suaves
  db.exec("PRAGMA synchronous = NORMAL"); // bom equilíbrio durabilidade/velocidade

  // Configuração: uma linha por servidor (+ __global__ e __default__)
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      serverId TEXT PRIMARY KEY,
      json     TEXT NOT NULL
    )
  `);

  // (Fase 2) Punições persistentes por (servidor, usuário)
  db.exec(`
    CREATE TABLE IF NOT EXISTS punicoes (
      serverId  TEXT NOT NULL,
      userId    TEXT NOT NULL,
      avisos    INTEGER NOT NULL DEFAULT 0,
      silenciado INTEGER NOT NULL DEFAULT 0,
      motivo    TEXT,
      atualizadoEm INTEGER,
      PRIMARY KEY (serverId, userId)
    )
  `);

  // (Fase 3) Histórico global de banimentos
  db.exec(`
    CREATE TABLE IF NOT EXISTS bans_globais (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    TEXT NOT NULL,
      serverId  TEXT NOT NULL,
      motivo    TEXT,
      origem    TEXT,
      criadoEm  INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bans_user ON bans_globais (userId)`);

  // (Reaction roles) emoji numa mensagem → cargo
  db.exec(`
    CREATE TABLE IF NOT EXISTS reaction_roles (
      serverId  TEXT NOT NULL,
      messageId TEXT NOT NULL,
      emoji     TEXT NOT NULL,
      roleId    TEXT NOT NULL,
      PRIMARY KEY (messageId, emoji)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rr_msg ON reaction_roles (messageId)`);
  // Modo EXCLUSIVO por mensagem: 1 = escolher um emoji troca o cargo anterior
  // (útil para "escolha sua cor"); 0 = acumula (útil para "seus interesses").
  try {
    const cols = db.prepare("PRAGMA table_info(reaction_roles)").all().map((c) => c.name);
    if (!cols.includes("exclusivo")) {
      db.exec("ALTER TABLE reaction_roles ADD COLUMN exclusivo INTEGER NOT NULL DEFAULT 0");
    }
    // Guardar o canal permite recarregar a mensagem no boot: sem ela em cache,
    // a lib não emite o evento de reação e os cargos param de ser entregues.
    if (!cols.includes("channelId")) {
      db.exec("ALTER TABLE reaction_roles ADD COLUMN channelId TEXT");
    }
  } catch (e) { console.error("[DB] migração reaction_roles:", e.message); }

  // (Curadoria RSS) feeds cadastrados por servidor
  db.exec(`
    CREATE TABLE IF NOT EXISTS rss_feeds (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId  TEXT NOT NULL,
      url       TEXT NOT NULL,
      titulo    TEXT,
      criadoEm  TEXT NOT NULL,
      UNIQUE (serverId, url)
    )
  `);
  // itens já processados (para não repetir notícia)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rss_vistos (
      feedId    INTEGER NOT NULL,
      guid      TEXT NOT NULL,
      vistoEm   TEXT NOT NULL,
      PRIMARY KEY (feedId, guid)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rssvistos_feed ON rss_vistos (feedId)`);

  // (Game) XP e nível por usuário/servidor
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_xp (
      serverId  TEXT NOT NULL,
      userId    TEXT NOT NULL,
      xp        INTEGER NOT NULL DEFAULT 0,
      nivel     INTEGER NOT NULL DEFAULT 0,
      ultimaMsg TEXT,
      PRIMARY KEY (serverId, userId)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_gamexp_rank ON game_xp (serverId, xp DESC)`);
  // (IA) memória persistente por usuário (global — vale em qualquer servidor)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_memoria (
      userId     TEXT PRIMARY KEY,
      nome       TEXT,
      fatos      TEXT,           -- JSON: lista de fatos que a IA aprendeu
      atualizado TEXT
    )
  `);
  // (IA) histórico curto de conversa por usuário (para continuidade)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_historico (
      userId    TEXT NOT NULL,
      papel     TEXT NOT NULL,   -- 'user' ou 'assistant'
      conteudo  TEXT NOT NULL,
      momento   TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_iahist_user ON ia_historico (userId, momento)`);
  // (IA) memória de LONGO PRAZO — fatos aprendidos observando o chat.
  // Fatos sobre PESSOAS (por usuário) e sobre o SERVIDOR (piadas internas, eventos).
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_fatos_pessoa (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId  TEXT NOT NULL,
      userId    TEXT NOT NULL,
      fato      TEXT NOT NULL,
      confianca REAL NOT NULL DEFAULT 0.5,   -- 0..1; fatos repetidos sobem
      vezes     INTEGER NOT NULL DEFAULT 1,  -- quantas vezes foi observado
      momento   TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fatospessoa ON ia_fatos_pessoa (serverId, userId)`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_fatos_servidor (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId  TEXT NOT NULL,
      fato      TEXT NOT NULL,
      confianca REAL NOT NULL DEFAULT 0.5,
      vezes     INTEGER NOT NULL DEFAULT 1,
      momento   TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fatosservidor ON ia_fatos_servidor (serverId)`);
  // (IA) categoria nos fatos de pessoa: 'personalidade' | 'gosto' | 'info' | 'geral'.
  // Migração segura: adiciona a coluna se ainda não existir.
  try {
    const cols = db.prepare("PRAGMA table_info(ia_fatos_pessoa)").all().map((c) => c.name);
    if (!cols.includes("categoria")) {
      db.exec("ALTER TABLE ia_fatos_pessoa ADD COLUMN categoria TEXT DEFAULT 'geral'");
    }
  } catch (e) { console.error("[DB] migração categoria:", e.message); }
  // (IA) perfil do usuário: dados do cartão (bio, grupos, jogos, status) + flag
  // opt-in de "tratar com extra cuidado". Um registro por (servidor, usuário).
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_perfil (
      serverId    TEXT NOT NULL,
      userId      TEXT NOT NULL,
      nome        TEXT,
      bio         TEXT,
      grupos      TEXT,
      jogos       TEXT,
      status      TEXT,
      entrou      TEXT,
      cuidado     INTEGER NOT NULL DEFAULT 0,   -- 1 = tratar com gentileza extra (opt-in)
      atualizado  TEXT,
      PRIMARY KEY (serverId, userId)
    )
  `);
  // (Game) cargos de nível: qual cargo dar em qual nível
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_cargos (
      serverId  TEXT NOT NULL,
      nivel     INTEGER NOT NULL,
      roleId    TEXT NOT NULL,
      PRIMARY KEY (serverId, nivel)
    )
  `);

  console.info("[DB] Banco aberto em", DB_PATH);
  return db;
}

// ── Config (JSON por chave) ────────────────────────────────
export function lerConfig(serverId) {
  const row = db.prepare("SELECT json FROM config WHERE serverId = ?").get(serverId);
  if (!row) return null;
  try { return JSON.parse(row.json); } catch { return null; }
}

export function gravarConfig(serverId, obj) {
  db.prepare("INSERT OR REPLACE INTO config (serverId, json) VALUES (?, ?)")
    .run(serverId, JSON.stringify(obj));
}

export function listarServidoresConfig() {
  return db.prepare("SELECT serverId FROM config").all().map((r) => r.serverId);
}

// ── Punições persistentes por (servidor, usuário) ──────────
// Sobrevivem a restart do bot E a sair/reentrar no servidor.

export function lerPunicao(serverId, userId) {
  return db.prepare(
    "SELECT avisos, silenciado, motivo FROM punicoes WHERE serverId = ? AND userId = ?"
  ).get(serverId, userId) ?? null;
}

// Grava (cria ou atualiza) o estado de punição do usuário
export function gravarPunicao(serverId, userId, { avisos = 0, silenciado = 0, motivo = null }) {
  db.prepare(`
    INSERT INTO punicoes (serverId, userId, avisos, silenciado, motivo, atualizadoEm)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(serverId, userId) DO UPDATE SET
      avisos = excluded.avisos,
      silenciado = excluded.silenciado,
      motivo = excluded.motivo,
      atualizadoEm = excluded.atualizadoEm
  `).run(serverId, userId, avisos, silenciado ? 1 : 0, motivo, Date.now());
}

// Soma 1 aviso e devolve o total atualizado
export function somarAviso(serverId, userId, motivo = null) {
  const atual = lerPunicao(serverId, userId);
  const avisos = (atual?.avisos ?? 0) + 1;
  gravarPunicao(serverId, userId, { avisos, silenciado: atual?.silenciado ?? 0, motivo });
  return avisos;
}

export function contarAvisos(serverId, userId) {
  return lerPunicao(serverId, userId)?.avisos ?? 0;
}

export function limparPunicao(serverId, userId) {
  db.prepare("DELETE FROM punicoes WHERE serverId = ? AND userId = ?").run(serverId, userId);
}

// Marca/desmarca o silêncio (usado ao reaplicar em quem sai e volta)
export function definirSilenciado(serverId, userId, silenciado, motivo = null) {
  const atual = lerPunicao(serverId, userId);
  gravarPunicao(serverId, userId, {
    avisos: atual?.avisos ?? 0,
    silenciado: silenciado ? 1 : 0,
    motivo: motivo ?? atual?.motivo ?? null,
  });
}

export function estaSilenciado(serverId, userId) {
  return (lerPunicao(serverId, userId)?.silenciado ?? 0) === 1;
}

// ── Lista GLOBAL de banimentos (Fase 3) ────────────────────
// Cada linha é um ban num servidor. O mesmo usuário pode
// aparecer várias vezes (banido em vários servidores).
// `origem`: "automod" | "manual" | "importado"

export function registrarBanGlobal(userId, serverId, motivo, origem = "manual") {
  // evita duplicar o mesmo (usuário, servidor)
  const existe = db.prepare(
    "SELECT id FROM bans_globais WHERE userId = ? AND serverId = ?"
  ).get(userId, serverId);
  if (existe) {
    db.prepare("UPDATE bans_globais SET motivo = ?, origem = ?, criadoEm = ? WHERE id = ?")
      .run(motivo ?? null, origem, Date.now(), existe.id);
    return false;  // já constava
  }
  db.prepare(
    "INSERT INTO bans_globais (userId, serverId, motivo, origem, criadoEm) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, serverId, motivo ?? null, origem, Date.now());
  return true;     // novo registro
}

// Histórico completo de um usuário (em quais servidores foi banido e por quê)
export function historicoBans(userId) {
  return db.prepare(
    "SELECT serverId, motivo, origem, criadoEm FROM bans_globais WHERE userId = ? ORDER BY criadoEm DESC"
  ).all(userId);
}

// Em quantos servidores este usuário está banido
export function contarBansGlobais(userId) {
  return db.prepare("SELECT COUNT(*) AS n FROM bans_globais WHERE userId = ?").get(userId)?.n ?? 0;
}

// Remove o registro de um servidor (usado ao dar unban)
export function removerBanGlobal(userId, serverId) {
  db.prepare("DELETE FROM bans_globais WHERE userId = ? AND serverId = ?").run(userId, serverId);
}

// Apaga TODO o histórico de um usuário na lista global
export function esquecerUsuario(userId) {
  const r = db.prepare("DELETE FROM bans_globais WHERE userId = ?").run(userId);
  return r.changes ?? 0;
}

export function totalBansGlobais() {
  return db.prepare("SELECT COUNT(*) AS n FROM bans_globais").get()?.n ?? 0;
}

export function usuariosBanidosDistintos() {
  return db.prepare("SELECT COUNT(DISTINCT userId) AS n FROM bans_globais").get()?.n ?? 0;
}

// ── Reaction roles ─────────────────────────────────────────
export function addReactionRole(serverId, messageId, emoji, roleId, channelId = null) {
  // herda o modo e o canal já definidos para esta mensagem
  const atual = db.prepare("SELECT exclusivo, channelId FROM reaction_roles WHERE messageId = ? LIMIT 1").get(messageId);
  const exclusivo = atual?.exclusivo ?? 0;
  const canal = channelId ?? atual?.channelId ?? null;
  db.prepare(`INSERT OR REPLACE INTO reaction_roles (serverId, messageId, emoji, roleId, exclusivo, channelId)
              VALUES (?, ?, ?, ?, ?, ?)`).run(serverId, messageId, emoji, roleId, exclusivo, canal);
}

// Grava/atualiza o canal de uma mensagem já registrada.
export function setReactionRoleCanal(messageId, channelId) {
  return db.prepare("UPDATE reaction_roles SET channelId = ? WHERE messageId = ?")
    .run(channelId, messageId).changes ?? 0;
}

// Mensagens distintas com reaction role (para recarregar no boot).
export function mensagensComReactionRole() {
  return db.prepare("SELECT DISTINCT messageId, serverId, channelId FROM reaction_roles").all();
}

// Liga/desliga o modo exclusivo de uma mensagem inteira.
export function setReactionRoleExclusivo(messageId, ligado) {
  const r = db.prepare("UPDATE reaction_roles SET exclusivo = ? WHERE messageId = ?")
    .run(ligado ? 1 : 0, messageId);
  return r.changes ?? 0;
}

export function isReactionRoleExclusivo(messageId) {
  const r = db.prepare("SELECT exclusivo FROM reaction_roles WHERE messageId = ? LIMIT 1").get(messageId);
  return !!r?.exclusivo;
}

export function getReactionRole(messageId, emoji) {
  return db.prepare("SELECT roleId, serverId FROM reaction_roles WHERE messageId = ? AND emoji = ?")
    .get(messageId, emoji) ?? null;
}

export function listReactionRoles(messageId) {
  return db.prepare("SELECT emoji, roleId, exclusivo FROM reaction_roles WHERE messageId = ?").all(messageId);
}

export function listReactionRolesServidor(serverId) {
  return db.prepare("SELECT messageId, emoji, roleId FROM reaction_roles WHERE serverId = ? ORDER BY messageId")
    .all(serverId);
}

export function removeReactionRolesMensagem(messageId) {
  const r = db.prepare("DELETE FROM reaction_roles WHERE messageId = ?").run(messageId);
  return r.changes ?? 0;
}

// ── Curadoria RSS ──────────────────────────────────────────
export function addFeed(serverId, url, titulo) {
  const r = db.prepare(`INSERT OR IGNORE INTO rss_feeds (serverId, url, titulo, criadoEm)
                        VALUES (?, ?, ?, ?)`).run(serverId, url, titulo ?? null, new Date().toISOString());
  return r.changes > 0;   // false se já existia
}

export function removeFeed(serverId, idOuUrl) {
  // aceita id numérico ou a própria URL
  const porId = /^\d+$/.test(String(idOuUrl));
  const r = porId
    ? db.prepare("DELETE FROM rss_feeds WHERE serverId = ? AND id = ?").run(serverId, Number(idOuUrl))
    : db.prepare("DELETE FROM rss_feeds WHERE serverId = ? AND url = ?").run(serverId, idOuUrl);
  return r.changes ?? 0;
}

export function listarFeeds(serverId) {
  return db.prepare("SELECT id, url, titulo FROM rss_feeds WHERE serverId = ? ORDER BY id").all(serverId);
}

export function todosOsFeeds() {
  return db.prepare("SELECT id, serverId, url, titulo FROM rss_feeds ORDER BY serverId, id").all();
}

// Marca um guid como visto; devolve true se era NOVO (não estava lá).
export function marcarVisto(feedId, guid) {
  const r = db.prepare(`INSERT OR IGNORE INTO rss_vistos (feedId, guid, vistoEm)
                        VALUES (?, ?, ?)`).run(feedId, guid, new Date().toISOString());
  return r.changes > 0;
}

export function jaVisto(feedId, guid) {
  return !!db.prepare("SELECT 1 FROM rss_vistos WHERE feedId = ? AND guid = ?").get(feedId, guid);
}

// Limpeza opcional: remove itens vistos com mais de N dias (evita crescer sem fim)
export function limparVistosAntigos(dias = 30) {
  const limite = new Date(Date.now() - dias * 864e5).toISOString();
  const r = db.prepare("DELETE FROM rss_vistos WHERE vistoEm < ?").run(limite);
  return r.changes ?? 0;
}

// ── Game (XP / níveis) ─────────────────────────────────────
export function getXp(serverId, userId) {
  return db.prepare("SELECT xp, nivel, ultimaMsg FROM game_xp WHERE serverId = ? AND userId = ?")
           .get(serverId, userId) ?? { xp: 0, nivel: 0, ultimaMsg: null };
}

export function setXp(serverId, userId, xp, nivel, ultimaMsg) {
  db.prepare(`INSERT INTO game_xp (serverId, userId, xp, nivel, ultimaMsg)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(serverId, userId) DO UPDATE SET xp = ?, nivel = ?, ultimaMsg = ?`)
    .run(serverId, userId, xp, nivel, ultimaMsg, xp, nivel, ultimaMsg);
}

export function topXp(serverId, limite = 10) {
  return db.prepare("SELECT userId, xp, nivel FROM game_xp WHERE serverId = ? ORDER BY xp DESC LIMIT ?")
           .all(serverId, limite);
}

export function posicaoXp(serverId, userId) {
  const r = db.prepare(`SELECT COUNT(*) + 1 AS pos FROM game_xp
    WHERE serverId = ? AND xp > (SELECT xp FROM game_xp WHERE serverId = ? AND userId = ?)`)
    .get(serverId, serverId, userId);
  return r?.pos ?? null;
}

export function resetXp(serverId) {
  return db.prepare("DELETE FROM game_xp WHERE serverId = ?").run(serverId).changes ?? 0;
}

// cargos de nível
export function setCargoNivel(serverId, nivel, roleId) {
  db.prepare(`INSERT INTO game_cargos (serverId, nivel, roleId) VALUES (?, ?, ?)
              ON CONFLICT(serverId, nivel) DO UPDATE SET roleId = ?`)
    .run(serverId, nivel, roleId, roleId);
}

export function listarCargosNivel(serverId) {
  return db.prepare("SELECT nivel, roleId FROM game_cargos WHERE serverId = ? ORDER BY nivel").all(serverId);
}

export function cargoDoNivel(serverId, nivel) {
  return db.prepare("SELECT roleId FROM game_cargos WHERE serverId = ? AND nivel = ?").get(serverId, nivel)?.roleId ?? null;
}

export function limparCargosNivel(serverId) {
  return db.prepare("DELETE FROM game_cargos WHERE serverId = ?").run(serverId).changes ?? 0;
}

// ── IA: memória por usuário (global) ───────────────────────
export function getMemoria(userId) {
  const r = db.prepare("SELECT nome, fatos, atualizado FROM ia_memoria WHERE userId = ?").get(userId);
  if (!r) return { nome: null, fatos: [], atualizado: null };
  let fatos = [];
  try { fatos = JSON.parse(r.fatos || "[]"); } catch {}
  return { nome: r.nome, fatos, atualizado: r.atualizado };
}

export function setMemoria(userId, { nome, fatos }) {
  const fatosJson = JSON.stringify((fatos || []).slice(-20));  // guarda os últimos 20 fatos
  db.prepare(`INSERT INTO ia_memoria (userId, nome, fatos, atualizado)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(userId) DO UPDATE SET nome = COALESCE(?, nome), fatos = ?, atualizado = ?`)
    .run(userId, nome ?? null, fatosJson, new Date().toISOString(), nome ?? null, fatosJson, new Date().toISOString());
}

export function limparMemoria(userId) {
  return db.prepare("DELETE FROM ia_memoria WHERE userId = ?").run(userId).changes ?? 0;
}

// ── IA: histórico curto de conversa (continuidade) ─────────
export function addHistorico(userId, papel, conteudo) {
  db.prepare("INSERT INTO ia_historico (userId, papel, conteudo, momento) VALUES (?, ?, ?, ?)")
    .run(userId, papel, conteudo.slice(0, 2000), new Date().toISOString());
  // mantém só as últimas 12 entradas (6 trocas) por usuário
  db.prepare(`DELETE FROM ia_historico WHERE userId = ? AND rowid NOT IN (
    SELECT rowid FROM ia_historico WHERE userId = ? ORDER BY momento DESC LIMIT 12
  )`).run(userId, userId);
}

export function getHistorico(userId, limite = 6) {
  const linhas = db.prepare(
    "SELECT papel, conteudo FROM ia_historico WHERE userId = ? ORDER BY momento DESC LIMIT ?"
  ).all(userId, limite * 2);
  return linhas.reverse();   // cronológico (mais antigo primeiro)
}

export function limparHistorico(userId) {
  return db.prepare("DELETE FROM ia_historico WHERE userId = ?").run(userId).changes ?? 0;
}

// ── Memória de longo prazo: FATOS sobre pessoas ────────────
// Registra um fato observado. Se um fato muito parecido já existe (mesmo
// começo), reforça (sobe confiança, incrementa vezes) em vez de duplicar.
export function addFatoPessoa(serverId, userId, fato, confianca = 0.5, categoria = "geral") {
  const f = String(fato || "").trim();
  if (!f) return;
  const existentes = db.prepare(
    "SELECT id, fato, confianca, vezes FROM ia_fatos_pessoa WHERE serverId = ? AND userId = ?"
  ).all(serverId, userId);
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const parecido = existentes.find((e) => {
    const a = norm(e.fato), b = norm(f);
    return a === b || a.includes(b) || b.includes(a);
  });
  const agora = new Date().toISOString();
  if (parecido) {
    const novaConf = Math.min(1, parecido.confianca + 0.15);
    db.prepare("UPDATE ia_fatos_pessoa SET confianca = ?, vezes = vezes + 1, momento = ? WHERE id = ?")
      .run(novaConf, agora, parecido.id);
  } else {
    db.prepare("INSERT INTO ia_fatos_pessoa (serverId, userId, fato, confianca, vezes, momento, categoria) VALUES (?, ?, ?, ?, 1, ?, ?)")
      .run(serverId, userId, f, confianca, agora, categoria);
  }
}

// Fatos de uma pessoa, dos mais confiáveis para os menos. `minConf` filtra ruído.
export function getFatosPessoa(serverId, userId, { limite = 12, minConf = 0.4 } = {}) {
  return db.prepare(
    `SELECT fato, confianca, vezes, categoria, momento FROM ia_fatos_pessoa
     WHERE serverId = ? AND userId = ? AND confianca >= ?
     ORDER BY confianca DESC, vezes DESC, momento DESC LIMIT ?`
  ).all(serverId, userId, minConf, limite);
}

export function limparFatosPessoa(serverId, userId) {
  return db.prepare("DELETE FROM ia_fatos_pessoa WHERE serverId = ? AND userId = ?")
    .run(serverId, userId).changes ?? 0;
}

// ── Perfil do usuário (cartão: bio, grupos, jogos, status + flag de cuidado) ──
export function getPerfil(serverId, userId) {
  return db.prepare("SELECT * FROM ia_perfil WHERE serverId = ? AND userId = ?").get(serverId, userId) || null;
}

export function setPerfil(serverId, userId, dados = {}) {
  const atual = getPerfil(serverId, userId) || {};
  const merge = {
    nome:   dados.nome   ?? atual.nome   ?? null,
    bio:    dados.bio    ?? atual.bio    ?? null,
    grupos: dados.grupos ?? atual.grupos ?? null,
    jogos:  dados.jogos  ?? atual.jogos  ?? null,
    status: dados.status ?? atual.status ?? null,
    entrou: dados.entrou ?? atual.entrou ?? null,
    cuidado: dados.cuidado != null ? (dados.cuidado ? 1 : 0) : (atual.cuidado ?? 0),
  };
  db.prepare(`INSERT INTO ia_perfil (serverId, userId, nome, bio, grupos, jogos, status, entrou, cuidado, atualizado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(serverId, userId) DO UPDATE SET
      nome=excluded.nome, bio=excluded.bio, grupos=excluded.grupos, jogos=excluded.jogos,
      status=excluded.status, entrou=excluded.entrou, cuidado=excluded.cuidado, atualizado=excluded.atualizado`)
    .run(serverId, userId, merge.nome, merge.bio, merge.grupos, merge.jogos, merge.status, merge.entrou, merge.cuidado, new Date().toISOString());
  return getPerfil(serverId, userId);
}

// Flag opt-in "tratar com gentileza extra" (acessibilidade; controlada por comando).
export function setCuidado(serverId, userId, ligado) {
  setPerfil(serverId, userId, { cuidado: ligado ? 1 : 0 });
  return !!ligado;
}

// Apaga TUDO que a IA sabe de uma pessoa (fatos + perfil + histórico).
export function apagarTudoDaPessoa(serverId, userId) {
  const f = db.prepare("DELETE FROM ia_fatos_pessoa WHERE serverId = ? AND userId = ?").run(serverId, userId).changes ?? 0;
  const p = db.prepare("DELETE FROM ia_perfil WHERE serverId = ? AND userId = ?").run(serverId, userId).changes ?? 0;
  let h = 0, m = 0;
  try { h = db.prepare("DELETE FROM ia_historico WHERE userId = ?").run(userId).changes ?? 0; } catch {}
  try { m = db.prepare("DELETE FROM ia_memoria WHERE userId = ?").run(userId).changes ?? 0; } catch {}
  return { fatos: f, perfil: p, historico: h, memoria: m };
}

// Apaga TODA a memória da IA no servidor (fatos de pessoas, de servidor, perfis).
export function apagarMemoriaServidor(serverId) {
  const fp = db.prepare("DELETE FROM ia_fatos_pessoa WHERE serverId = ?").run(serverId).changes ?? 0;
  const fs = db.prepare("DELETE FROM ia_fatos_servidor WHERE serverId = ?").run(serverId).changes ?? 0;
  const pf = db.prepare("DELETE FROM ia_perfil WHERE serverId = ?").run(serverId).changes ?? 0;
  return { fatosPessoa: fp, fatosServidor: fs, perfis: pf };
}

// ── Memória de longo prazo: FATOS sobre o servidor ─────────
export function addFatoServidor(serverId, fato, confianca = 0.5) {
  const f = String(fato || "").trim();
  if (!f) return;
  const existentes = db.prepare(
    "SELECT id, fato, confianca FROM ia_fatos_servidor WHERE serverId = ?"
  ).all(serverId);
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const parecido = existentes.find((e) => {
    const a = norm(e.fato), b = norm(f);
    return a === b || a.includes(b) || b.includes(a);
  });
  const agora = new Date().toISOString();
  if (parecido) {
    const novaConf = Math.min(1, parecido.confianca + 0.15);
    db.prepare("UPDATE ia_fatos_servidor SET confianca = ?, vezes = vezes + 1, momento = ? WHERE id = ?")
      .run(novaConf, agora, parecido.id);
  } else {
    db.prepare("INSERT INTO ia_fatos_servidor (serverId, fato, confianca, vezes, momento) VALUES (?, ?, ?, 1, ?)")
      .run(serverId, f, confianca, agora);
  }
}

export function getFatosServidor(serverId, { limite = 15, minConf = 0.4 } = {}) {
  return db.prepare(
    `SELECT fato, confianca, vezes FROM ia_fatos_servidor
     WHERE serverId = ? AND confianca >= ?
     ORDER BY confianca DESC, vezes DESC, momento DESC LIMIT ?`
  ).all(serverId, minConf, limite);
}

// ── Acesso cru ─────────────────────────────────────────────
export function getDb() {
  return db;
}
