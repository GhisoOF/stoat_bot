
import { DatabaseSync } from "node:sqlite";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

let db = null;

const _stmts = new Map();
const _STMTS_MAX = 512;   // teto de segurança: os SQLs "dinâmicos" (SET de
function prep(sql) {
  let s = _stmts.get(sql);
  if (!s) {
    s = db.prepare(sql);
    if (_stmts.size < _STMTS_MAX) _stmts.set(sql, s);
  }
  return s;
}

export function abrirBanco(caminho) {
  const DB_PATH = caminho || process.env.DB_PATH || "./stoat.db";
  _stmts.clear();   // statements antigos pertencem à conexão anterior
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
      silencioAte INTEGER NOT NULL DEFAULT 0,   -- 0 = sem prazo (permanente)
      motivo    TEXT,
      atualizadoEm INTEGER,
      PRIMARY KEY (serverId, userId)
    )
  `);

  try {
    const cols = prep("PRAGMA table_info(punicoes)").all().map((c) => c.name);
    if (!cols.includes("silencioAte")) {
      db.exec("ALTER TABLE punicoes ADD COLUMN silencioAte INTEGER NOT NULL DEFAULT 0");
      console.info("[DB] punicoes: coluna silencioAte adicionada");
    }
  } catch (e) { console.error("[DB] migração punicoes:", e.message); }

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

  try {
    const cols = prep("PRAGMA table_info(bans_globais)").all().map((c) => c.name);
    if (!cols.includes("userNome")) {
      db.exec("ALTER TABLE bans_globais ADD COLUMN userNome TEXT");
      console.info("[DB] bans_globais: coluna userNome adicionada");
    }
    if (!cols.includes("ehBot")) {
      db.exec("ALTER TABLE bans_globais ADD COLUMN ehBot INTEGER NOT NULL DEFAULT 0");
      console.info("[DB] bans_globais: coluna ehBot adicionada");
    }
  } catch (e) { console.error("[DB] migração bans_globais:", e.message); }

  db.exec(`
    CREATE TABLE IF NOT EXISTS banglobal_ignorados (
      userId    TEXT PRIMARY KEY,
      nome      TEXT,
      motivo    TEXT,
      porQuem   TEXT,
      criadoEm  INTEGER NOT NULL
    )
  `);

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
  try {
    const cols = prep("PRAGMA table_info(reaction_roles)").all().map((c) => c.name);
    if (!cols.includes("exclusivo")) {
      db.exec("ALTER TABLE reaction_roles ADD COLUMN exclusivo INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.includes("channelId")) {
      db.exec("ALTER TABLE reaction_roles ADD COLUMN channelId TEXT");
    }
    if (!cols.includes("ordem")) {
      db.exec("ALTER TABLE reaction_roles ADD COLUMN ordem INTEGER");
      db.exec("UPDATE reaction_roles SET ordem = rowid WHERE ordem IS NULL");
    }
    // (P6, 20 out 2026) mensagens que valem como UMA no modo exclusivo: o painel de
    // cores tem mais de 20 cores (o limite de reações do Stoat) e sai em duas mensagens
    if (!cols.includes("grupo")) {
      db.exec("ALTER TABLE reaction_roles ADD COLUMN grupo TEXT");
    }
  } catch (e) { console.error("[DB] migração reaction_roles:", e.message); }

  // (Curadoria RSS) feeds cadastrados por servidor
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId  TEXT NOT NULL,
      numero    INTEGER NOT NULL,
      canalId   TEXT NOT NULL,
      roleId    TEXT,
      autorId   TEXT NOT NULL,
      motivo    TEXT DEFAULT '',
      status    TEXT DEFAULT 'aberto',
      abertoEm  TEXT NOT NULL,
      fechadoEm TEXT
    );
    -- Mensagens do bot que respondem a reação nos tickets: o painel (abrir
    -- por categoria), o controle dentro do ticket (🔒 fechar) e o aviso de
    -- fechado (🗑️ apagar). A reação chega sem servidor — é daqui que ele vem.
    CREATE TABLE IF NOT EXISTS ticket_mensagens (
      msgId    TEXT PRIMARY KEY,
      serverId TEXT NOT NULL,
      canalId  TEXT NOT NULL,
      tipo     TEXT NOT NULL,          -- painel | controle | fechado
      ticketId INTEGER
    );
    -- Relatório horário do dono do bot: o que aconteceu, por servidor.
    -- No banco (e não em memória) para uma hora sobreviver a um reinício.
    -- Poda automática: só as últimas 48h.
    CREATE TABLE IF NOT EXISTS relatorio_eventos (
      t        INTEGER NOT NULL,
      serverId TEXT,
      tipo     TEXT NOT NULL,
      titulo   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS relatorio_eventos_t ON relatorio_eventos (t);
    -- Mensagens paginadas (◀ ▶): a sessão vivia só na memória, por 15 min, e
    -- sumia a cada reinício — o relatório das 3h não virava mais de página de
    -- manhã. Fica aqui por alguns dias (poda automática).
    CREATE TABLE IF NOT EXISTS paginas_sessoes (
      msgId  TEXT PRIMARY KEY,
      dados  TEXT NOT NULL,
      expira INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ganchos (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId  TEXT NOT NULL,
      nome      TEXT NOT NULL,
      canalId   TEXT NOT NULL,
      token     TEXT NOT NULL,
      eventos   TEXT DEFAULT '',
      usos      INTEGER DEFAULT 0,
      criadoEm  TEXT NOT NULL,
      UNIQUE (serverId, nome)
    );
    CREATE TABLE IF NOT EXISTS rss_feeds (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId  TEXT NOT NULL,
      url       TEXT NOT NULL,
      titulo    TEXT,
      criadoEm  TEXT NOT NULL,
      UNIQUE (serverId, url)
    )
  `);
  try {
    const colsRss = prep("PRAGMA table_info(rss_feeds)").all().map((c) => c.name);
    if (!colsRss.includes("categoria")) {
      db.exec("ALTER TABLE rss_feeds ADD COLUMN categoria TEXT");
    }
  } catch (e) { console.error("[DB] migração rss categoria:", e.message); }

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
    CREATE TABLE IF NOT EXISTS xp_usuarios (
      serverId  TEXT NOT NULL,
      userId    TEXT NOT NULL,
      xp        INTEGER NOT NULL DEFAULT 0,
      nivel     INTEGER NOT NULL DEFAULT 0,
      ultimaMsg TEXT,
      PRIMARY KEY (serverId, userId)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_xp_rank ON xp_usuarios (serverId, xp DESC)`);
  // (Privacidade P3, 20 out 2026) Quem saiu do XP neste servidor (`&xp sair`):
  // o XP dela é apagado e não volta a contar até `&xp entrar`.
  db.exec(`CREATE TABLE IF NOT EXISTS xp_fora (serverId TEXT NOT NULL, userId TEXT NOT NULL, em TEXT NOT NULL, PRIMARY KEY (serverId, userId))`);
  // (Privacidade P2, 20 out 2026) Servidores de onde a Judy saiu: os dados deles
  // somem 30 dias depois (se ela voltar antes, nada é apagado).
  db.exec(`CREATE TABLE IF NOT EXISTS servidores_saida (serverId TEXT PRIMARY KEY, saiuEm TEXT NOT NULL)`);
  // Migrações que rodavam UMA vez por banco (o nome fica gravado aqui). (P4) a única
  // (a da memória da IA) saiu com o chat; a tabela fica com as marcas antigas.
  db.exec(`CREATE TABLE IF NOT EXISTS migracoes (nome TEXT PRIMARY KEY, em TEXT NOT NULL)`);
  // (Game) cargos de nível: qual cargo dar em qual nível
  db.exec(`
    CREATE TABLE IF NOT EXISTS xp_cargos (
      serverId  TEXT NOT NULL,
      nivel     INTEGER NOT NULL,
      roleId    TEXT NOT NULL,
      PRIMARY KEY (serverId, nivel)
    )
  `);

  // Tickets: categoria e quem fechou. Na ABERTURA do banco — um SELECT * já
  // preparado antes do ALTER TABLE não enxerga a coluna nova.
  try { colunasTicket(); } catch (e) { console.error("[DB] migração tickets:", e.message); }

  migrarTabelasGame();   // XP: game_* → xp_* (preserva os dados)
  removerRpg();          // (P4, 2 nov 2026) o RPG saiu: as tabelas rpg_* e as marcas __rpg_*__
  removerChatIA();       // (P4, 2 nov 2026) o chat IA saiu: as tabelas ia_* (memória, histórico, consentimento…)
  removerTetoDeImagens(DB_PATH);   // (P4, revisão) e a contagem do teto de imagens geradas, ao lado do banco

  console.info("[DB] Banco aberto em", DB_PATH);
  return db;
}

export function lerConfig(serverId) {
  const row = prep("SELECT json FROM config WHERE serverId = ?").get(serverId);
  if (!row) return null;
  try { return JSON.parse(row.json); } catch { return null; }
}

export function gravarConfig(serverId, obj) {
  prep("INSERT OR REPLACE INTO config (serverId, json) VALUES (?, ?)")
    .run(serverId, JSON.stringify(obj));
}

export function lerPunicao(serverId, userId) {
  return prep(
    "SELECT avisos, silenciado, silencioAte, motivo, atualizadoEm FROM punicoes WHERE serverId = ? AND userId = ?"
  ).get(serverId, userId) ?? null;
}

// Grava (cria ou atualiza) o estado de punição do usuário
export function gravarPunicao(serverId, userId, { avisos = 0, silenciado = 0, motivo = null, silencioAte = null }) {
  const anterior = silencioAte === null
    ? (prep("SELECT silencioAte FROM punicoes WHERE serverId = ? AND userId = ?")
        .get(serverId, userId)?.silencioAte ?? 0)
    : silencioAte;
  prep(`
    INSERT INTO punicoes (serverId, userId, avisos, silenciado, silencioAte, motivo, atualizadoEm)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(serverId, userId) DO UPDATE SET
      avisos = excluded.avisos,
      silenciado = excluded.silenciado,
      silencioAte = excluded.silencioAte,
      motivo = excluded.motivo,
      atualizadoEm = excluded.atualizadoEm
  `).run(serverId, userId, avisos, silenciado ? 1 : 0, anterior, motivo, Date.now());
}

// Avisos VENCEM (9 out 2026): sem nenhuma punição nova por `validadeMs`, o
// contador volta a zero — antes três deslizes em meses diferentes davam o
// mesmo resultado que três numa tarde. 0 = nunca vencem.
export function avisosVigentes(reg, validadeMs = 0, agora = Date.now()) {
  if (!reg) return 0;
  const n = reg.avisos ?? 0;
  if (n > 0 && validadeMs > 0 && reg.atualizadoEm && agora - reg.atualizadoEm > validadeMs) return 0;
  return n;
}

// Soma 1 aviso e devolve o total atualizado
export function somarAviso(serverId, userId, motivo = null, { validadeMs = 0 } = {}) {
  const atual = lerPunicao(serverId, userId);
  const avisos = avisosVigentes(atual, validadeMs) + 1;
  gravarPunicao(serverId, userId, { avisos, silenciado: atual?.silenciado ?? 0, motivo });
  return avisos;
}

export function contarAvisos(serverId, userId, { validadeMs = 0 } = {}) {
  return avisosVigentes(lerPunicao(serverId, userId), validadeMs);
}

// `&warn limpar`: zera só os AVISOS. O silêncio em curso continua registrado
// (é ele que reaplica o timeout se a pessoa sair e voltar).
export function zerarAvisos(serverId, userId) {
  const atual = lerPunicao(serverId, userId);
  if (!atual) return 0;
  if (!atual.silenciado) { limparPunicao(serverId, userId); return atual.avisos ?? 0; }
  prep("UPDATE punicoes SET avisos = 0, atualizadoEm = ? WHERE serverId = ? AND userId = ?").run(Date.now(), serverId, userId);
  return atual.avisos ?? 0;
}

export function limparPunicao(serverId, userId) {
  prep("DELETE FROM punicoes WHERE serverId = ? AND userId = ?").run(serverId, userId);
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

export function silenciarAte(serverId, userId, ate, motivo = null) {
  const atual = lerPunicao(serverId, userId);
  gravarPunicao(serverId, userId, {
    avisos: atual?.avisos ?? 0,
    silenciado: ate > 0 ? 1 : (atual?.silenciado ?? 0),
    motivo: motivo ?? atual?.motivo ?? null,
    silencioAte: ate ?? 0,
  });
}

// Quem já cumpriu a pena — chamado periodicamente para devolver a voz.
export function silenciosVencidos(agora = Date.now()) {
  return prep(`SELECT serverId, userId, motivo FROM punicoes
    WHERE silenciado = 1 AND silencioAte > 0 AND silencioAte <= ?`).all(agora);
}

export function registrarBanGlobal(userId, serverId, motivo, origem = "manual", { nome = null, ehBot = false } = {}) {
  if (estaIgnoradoGlobal(userId)) return false;
  // evita duplicar o mesmo (usuário, servidor)
  const existe = prep(
    "SELECT id, userNome FROM bans_globais WHERE userId = ? AND serverId = ?"
  ).get(userId, serverId);
  if (existe) {
    prep("UPDATE bans_globais SET motivo = ?, origem = ?, criadoEm = ?, userNome = ?, ehBot = ? WHERE id = ?")
      .run(motivo ?? null, origem, Date.now(), nome ?? existe.userNome ?? null, ehBot ? 1 : 0, existe.id);
    return false;  // já constava
  }
  prep(
    "INSERT INTO bans_globais (userId, serverId, motivo, origem, criadoEm, userNome, ehBot) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(userId, serverId, motivo ?? null, origem, Date.now(), nome ?? null, ehBot ? 1 : 0);
  return true;     // novo registro
}

// O nome conhecido de alguém na lista (o mais recente que registramos).
export function nomeDeBanido(userId) {
  return prep(
    "SELECT userNome FROM bans_globais WHERE userId = ? AND userNome IS NOT NULL ORDER BY criadoEm DESC LIMIT 1"
  ).get(userId)?.userNome ?? null;
}

// Todos os IDs da lista, para varreduras de manutenção.
export function idsBanidosGlobais() {
  return prep("SELECT DISTINCT userId FROM bans_globais").all().map((r) => r.userId);
}

// Marca alguém como bot e devolve quantos registros saíram.
export function removerBotsDaLista(bots = []) {
  const lista = bots.map((b) => (typeof b === "string" ? { id: b, nome: null } : b)).filter((b) => b?.id);
  if (!lista.length) return 0;
  const marcas = lista.map(() => "?").join(",");
  const r = prep(`DELETE FROM bans_globais WHERE userId IN (${marcas})`).run(...lista.map((b) => b.id));
  for (const b of lista) ignorarNaListaGlobal(b.id, { nome: b.nome ?? null, motivo: "é um bot" });
  return r.changes ?? 0;
}

export function buscarBanidosPorNome(termo) {
  const t = `%${String(termo ?? "").toLowerCase()}%`;
  return prep(
    `SELECT userId, MAX(userNome) AS nome FROM bans_globais
     WHERE userNome IS NOT NULL AND LOWER(userNome) LIKE ?
     GROUP BY userId LIMIT 25`
  ).all(t);
}

// Histórico completo de um usuário (em quais servidores foi banido e por quê)
export function historicoBans(userId) {
  return prep(
    "SELECT serverId, motivo, origem, criadoEm, userNome FROM bans_globais WHERE userId = ? ORDER BY criadoEm DESC"
  ).all(userId);
}

// Em quantos servidores este usuário está banido
export function contarBansGlobais(userId) {
  return prep("SELECT COUNT(*) AS n FROM bans_globais WHERE userId = ?").get(userId)?.n ?? 0;
}

// Remove o registro de um servidor (usado ao dar unban)
export function removerBanGlobal(userId, serverId) {
  prep("DELETE FROM bans_globais WHERE userId = ? AND serverId = ?").run(userId, serverId);
}

// Apaga TODO o histórico de um usuário na lista global
export function esquecerUsuario(userId, { nome = null, motivo = null, porQuem = null, permanente = true } = {}) {
  const r = prep("DELETE FROM bans_globais WHERE userId = ?").run(userId);
  if (permanente) ignorarNaListaGlobal(userId, { nome, motivo, porQuem });
  return r.changes ?? 0;
}

// ── A lista de "nunca liste esta pessoa" ──
export function ignorarNaListaGlobal(userId, { nome = null, motivo = null, porQuem = null } = {}) {
  if (!userId) return false;
  const antes = prep("SELECT userId, nome FROM banglobal_ignorados WHERE userId = ?").get(userId);
  prep(`INSERT INTO banglobal_ignorados (userId, nome, motivo, porQuem, criadoEm)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
          nome = COALESCE(excluded.nome, nome),
          motivo = COALESCE(excluded.motivo, motivo),
          porQuem = COALESCE(excluded.porQuem, porQuem)`)
    .run(userId, nome ?? null, motivo ?? null, porQuem ?? null, Date.now());
  return !antes;   // true = entrou agora
}

export function estaIgnoradoGlobal(userId) {
  if (!userId) return false;
  return !!prep("SELECT 1 FROM banglobal_ignorados WHERE userId = ?").get(userId);
}

export function deixarDeIgnorarGlobal(userId) {
  return prep("DELETE FROM banglobal_ignorados WHERE userId = ?").run(userId).changes ?? 0;
}

export function listarIgnoradosGlobais() {
  return prep("SELECT userId, nome, motivo, porQuem, criadoEm FROM banglobal_ignorados ORDER BY criadoEm DESC").all();
}

export function totalBansGlobais() {
  return prep("SELECT COUNT(*) AS n FROM bans_globais").get()?.n ?? 0;
}

export function usuariosBanidosDistintos() {
  return prep("SELECT COUNT(DISTINCT userId) AS n FROM bans_globais").get()?.n ?? 0;
}

export function bansGlobaisPorOrigem(serverId, origens = ["banglobal"]) {
  if (!serverId) return [];
  const marcas = origens.map(() => "?").join(",");
  return prep(
    `SELECT userId, motivo, origem, criadoEm, userNome FROM bans_globais
     WHERE serverId = ? AND origem IN (${marcas}) ORDER BY criadoEm DESC`
  ).all(serverId, ...origens);
}

export function listarBanidosGlobais({ limite = 500, serverId = null } = {}) {
  if (serverId) {
    return prep(
      `SELECT userId, COUNT(*) AS servidores, MAX(criadoEm) AS ultimo,
              MAX(motivo) AS motivo, MAX(origem) AS origem, MAX(userNome) AS nome
       FROM bans_globais WHERE serverId = ?
       GROUP BY userId ORDER BY ultimo DESC LIMIT ?`
    ).all(serverId, limite);
  }
  return prep(
    `SELECT userId, COUNT(*) AS servidores, MAX(criadoEm) AS ultimo,
            MAX(motivo) AS motivo, MAX(origem) AS origem, MAX(userNome) AS nome
     FROM bans_globais GROUP BY userId ORDER BY servidores DESC, ultimo DESC LIMIT ?`
  ).all(limite);
}

export function bansGlobaisDoServidor(serverId) {
  if (!serverId) return 0;
  return prep("SELECT COUNT(*) AS n FROM bans_globais WHERE serverId = ?").get(serverId)?.n ?? 0;
}

export function addReactionRole(serverId, messageId, emoji, roleId, channelId = null) {
  // herda o modo e o canal já definidos para esta mensagem
  const atual = prep("SELECT exclusivo, channelId, grupo FROM reaction_roles WHERE messageId = ? LIMIT 1").get(messageId);
  const exclusivo = atual?.exclusivo ?? 0;
  const canal = channelId ?? atual?.channelId ?? null;
  const posicao = prep("SELECT ordem FROM reaction_roles WHERE messageId = ? AND emoji = ?").get(messageId, emoji)?.ordem
    ?? ((prep("SELECT MAX(ordem) AS m FROM reaction_roles WHERE messageId = ?").get(messageId)?.m ?? 0) + 1);
  prep(`INSERT OR REPLACE INTO reaction_roles (serverId, messageId, emoji, roleId, exclusivo, channelId, ordem, grupo)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(serverId, messageId, emoji, roleId, exclusivo, canal, posicao, atual?.grupo ?? null);
}

// Grava/atualiza o canal de uma mensagem já registrada.
export function setReactionRoleCanal(messageId, channelId) {
  return prep("UPDATE reaction_roles SET channelId = ? WHERE messageId = ?")
    .run(channelId, messageId).changes ?? 0;
}

// Mensagens distintas com reaction role (para recarregar no boot).
export function mensagensComReactionRole() {
  return prep("SELECT DISTINCT messageId, serverId, channelId FROM reaction_roles").all();
}

// Liga/desliga o modo exclusivo de uma mensagem inteira.
export function setReactionRoleExclusivo(messageId, ligado) {
  const r = prep("UPDATE reaction_roles SET exclusivo = ? WHERE messageId = ?")
    .run(ligado ? 1 : 0, messageId);
  return r.changes ?? 0;
}

// Junta mensagens num grupo: no modo exclusivo, escolher numa tira o cargo das outras.
export function setReactionRoleGrupo(messageIds, grupo) {
  let n = 0;
  for (const id of messageIds) n += prep("UPDATE reaction_roles SET grupo = ? WHERE messageId = ?").run(grupo ?? null, id).changes ?? 0;
  return n;
}

// As regras que contam no modo exclusivo: as da mensagem e as das outras do grupo dela.
export function regrasDoGrupo(messageId) {
  const g = prep("SELECT grupo FROM reaction_roles WHERE messageId = ? LIMIT 1").get(messageId)?.grupo;
  return g
    ? prep("SELECT messageId, emoji, roleId, channelId FROM reaction_roles WHERE grupo = ? ORDER BY messageId, ordem, rowid").all(g)
    : prep("SELECT messageId, emoji, roleId, channelId FROM reaction_roles WHERE messageId = ? ORDER BY ordem, rowid").all(messageId);
}

export function isReactionRoleExclusivo(messageId) {
  const r = prep("SELECT exclusivo FROM reaction_roles WHERE messageId = ? LIMIT 1").get(messageId);
  return !!r?.exclusivo;
}

export function getReactionRole(messageId, emoji) {
  return prep("SELECT roleId, serverId FROM reaction_roles WHERE messageId = ? AND emoji = ?")
    .get(messageId, emoji) ?? null;
}

export function listReactionRoles(messageId) {
  return prep("SELECT emoji, roleId, exclusivo FROM reaction_roles WHERE messageId = ? ORDER BY ordem, rowid").all(messageId);
}

export function listReactionRolesServidor(serverId) {
  return prep("SELECT messageId, emoji, roleId FROM reaction_roles WHERE serverId = ? ORDER BY messageId, ordem, rowid")
    .all(serverId);
}

// De que servidor é a mensagem com cargo por reação? (null = nenhuma regra)
export function servidorDoReactionRole(messageId) {
  return prep("SELECT serverId FROM reaction_roles WHERE messageId = ? LIMIT 1").get(messageId)?.serverId ?? null;
}

export function removeReactionRolesMensagem(messageId) {
  const r = prep("DELETE FROM reaction_roles WHERE messageId = ?").run(messageId);
  return r.changes ?? 0;
}

export function addFeed(serverId, url, titulo, categoria = null) {
  const r = prep(`INSERT OR IGNORE INTO rss_feeds (serverId, url, titulo, criadoEm, categoria)
                        VALUES (?, ?, ?, ?, ?)`).run(serverId, url, titulo ?? null, new Date().toISOString(), categoria ?? null);
  if (r.changes === 0) {
    // Já existia: atualiza o que veio preenchido, sem apagar o que não veio.
    if (titulo) prep("UPDATE rss_feeds SET titulo = ? WHERE serverId = ? AND url = ?").run(titulo, serverId, url);
    if (categoria) prep("UPDATE rss_feeds SET categoria = ? WHERE serverId = ? AND url = ?").run(categoria, serverId, url);
  }
  return r.changes > 0;   // false se já existia
}

export function setCategoriaFeed(serverId, idOuUrl, categoria) {
  const porId = /^\d+$/.test(String(idOuUrl));
  const r = porId
    ? prep("UPDATE rss_feeds SET categoria = ? WHERE serverId = ? AND id = ?").run(categoria ?? null, serverId, Number(idOuUrl))
    : prep("UPDATE rss_feeds SET categoria = ? WHERE serverId = ? AND url = ?").run(categoria ?? null, serverId, String(idOuUrl));
  return r.changes ?? 0;
}

export function removeFeed(serverId, idOuUrl) {
  // aceita id numérico ou a própria URL
  const porId = /^\d+$/.test(String(idOuUrl));
  const r = porId
    ? prep("DELETE FROM rss_feeds WHERE serverId = ? AND id = ?").run(serverId, Number(idOuUrl))
    : prep("DELETE FROM rss_feeds WHERE serverId = ? AND url = ?").run(serverId, idOuUrl);
  return r.changes ?? 0;
}

export function listarFeeds(serverId) {
  return prep("SELECT id, url, titulo, categoria FROM rss_feeds WHERE serverId = ? ORDER BY id").all(serverId);
}

export function todosOsFeeds() {
  return prep("SELECT id, serverId, url, titulo FROM rss_feeds ORDER BY serverId, id").all();
}

// Marca um guid como visto; devolve true se era NOVO (não estava lá).
export function marcarVisto(feedId, guid) {
  const r = prep(`INSERT OR IGNORE INTO rss_vistos (feedId, guid, vistoEm)
                        VALUES (?, ?, ?)`).run(feedId, guid, new Date().toISOString());
  return r.changes > 0;
}

// Limpeza opcional: remove itens vistos com mais de N dias (evita crescer sem fim)
export function limparVistosAntigos(dias = 30) {
  const limite = new Date(Date.now() - dias * 864e5).toISOString();
  const r = prep("DELETE FROM rss_vistos WHERE vistoEm < ?").run(limite);
  return r.changes ?? 0;
}

export function getXp(serverId, userId) {
  return prep("SELECT xp, nivel, ultimaMsg FROM xp_usuarios WHERE serverId = ? AND userId = ?")
           .get(serverId, userId) ?? { xp: 0, nivel: 0, ultimaMsg: null };
}

export function setXp(serverId, userId, xp, nivel, ultimaMsg) {
  prep(`INSERT INTO xp_usuarios (serverId, userId, xp, nivel, ultimaMsg)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(serverId, userId) DO UPDATE SET xp = ?, nivel = ?, ultimaMsg = ?`)
    .run(serverId, userId, xp, nivel, ultimaMsg, xp, nivel, ultimaMsg);
}

export function topXp(serverId, limite = 10) {
  return prep("SELECT userId, xp, nivel FROM xp_usuarios WHERE serverId = ? ORDER BY xp DESC LIMIT ?")
           .all(serverId, limite);
}

export function posicaoXp(serverId, userId) {
  const r = prep(`SELECT COUNT(*) + 1 AS pos FROM xp_usuarios
    WHERE serverId = ? AND xp > (SELECT xp FROM xp_usuarios WHERE serverId = ? AND userId = ?)`)
    .get(serverId, serverId, userId);
  return r?.pos ?? null;
}

export const xpFora = (serverId, userId) => !!prep("SELECT 1 FROM xp_fora WHERE serverId = ? AND userId = ?").get(String(serverId), String(userId));
// fora = true: sai (o XP é apagado); false: volta a contar do zero
export function setXpFora(serverId, userId, fora) {
  const s = String(serverId), u = String(userId);
  if (!fora) return prep("DELETE FROM xp_fora WHERE serverId = ? AND userId = ?").run(s, u).changes ?? 0;
  prep("INSERT OR IGNORE INTO xp_fora (serverId, userId, em) VALUES (?, ?, ?)").run(s, u, new Date().toISOString());
  return prep("DELETE FROM xp_usuarios WHERE serverId = ? AND userId = ?").run(s, u).changes ?? 0;
}

export function resetXp(serverId) {
  return prep("DELETE FROM xp_usuarios WHERE serverId = ?").run(serverId).changes ?? 0;
}

// cargos de nível
export function setCargoNivel(serverId, nivel, roleId) {
  prep(`INSERT INTO xp_cargos (serverId, nivel, roleId) VALUES (?, ?, ?)
              ON CONFLICT(serverId, nivel) DO UPDATE SET roleId = ?`)
    .run(serverId, nivel, roleId, roleId);
}

export function listarCargosNivel(serverId) {
  return prep("SELECT nivel, roleId FROM xp_cargos WHERE serverId = ? ORDER BY nivel").all(serverId);
}

export function cargoDoNivel(serverId, nivel) {
  return prep("SELECT roleId FROM xp_cargos WHERE serverId = ? AND nivel = ?").get(serverId, nivel)?.roleId ?? null;
}

function migrarTabelasGame() {
  for (const [antiga, nova] of [["game_xp", "xp_usuarios"], ["game_cargos", "xp_cargos"]]) {
    try {
      const existe = prep(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(antiga);
      if (!existe) continue;
      const linhas = prep(`SELECT COUNT(*) AS n FROM ${antiga}`).get()?.n ?? 0;
      if (linhas) {
        db.exec(`INSERT OR IGNORE INTO ${nova} SELECT * FROM ${antiga}`);
        console.log(`[DB] migrados ${linhas} registro(s) de ${antiga} → ${nova}`);
      }
      db.exec(`DROP TABLE ${antiga}`);
    } catch (e) { console.error(`[DB] migração ${antiga}:`, e.message); }
  }
}

export function getDb() {
  return db;
}

// ── Webhooks (ganchos) ──────────────────────────────────────────────────────
export function criarGancho(serverId, nome, canalId, token) {
  const r = prep("INSERT INTO ganchos (serverId, nome, canalId, token, criadoEm) VALUES (?,?,?,?,?)")
    .run(serverId, nome, canalId, token, new Date().toISOString());
  return ganchoPorId(Number(r.lastInsertRowid));
}
export function listarGanchos(serverId) {
  return prep("SELECT * FROM ganchos WHERE serverId = ? ORDER BY nome").all(serverId);
}
export function ganchoPorId(id) {
  return prep("SELECT * FROM ganchos WHERE id = ?").get(id) ?? null;
}
export function atualizarGancho(id, campos) {
  if (campos.canalId != null) prep("UPDATE ganchos SET canalId = ? WHERE id = ?").run(campos.canalId, id);
  if (campos.eventos != null) prep("UPDATE ganchos SET eventos = ? WHERE id = ?").run(campos.eventos, id);
}
export function removerGancho(id) {
  return prep("DELETE FROM ganchos WHERE id = ?").run(id).changes;
}
export function registrarUsoGancho(id) {
  prep("UPDATE ganchos SET usos = usos + 1 WHERE id = ?").run(id);
}

// ── Tickets ─────────────────────────────────────────────────────────────────
function colunasTicket() {
  const cols = prep("PRAGMA table_info(tickets)").all().map((c) => c.name);
  if (!cols.includes("categoria")) db.exec("ALTER TABLE tickets ADD COLUMN categoria TEXT");
  if (!cols.includes("fechadoPor")) db.exec("ALTER TABLE tickets ADD COLUMN fechadoPor TEXT");
}
export function criarTicket(serverId, numero, canalId, roleId, autorId, motivo, categoria = null) {
  colunasTicket();
  return prep("INSERT INTO tickets (serverId, numero, canalId, roleId, autorId, motivo, abertoEm, categoria) VALUES (?,?,?,?,?,?,?,?)")
    .run(serverId, numero, canalId, roleId, autorId, motivo ?? "", new Date().toISOString(), categoria).lastInsertRowid;
}
export function ticketPorId(id) {
  colunasTicket();
  return prep("SELECT * FROM tickets WHERE id = ?").get(id) ?? null;
}
export function ticketDoCanal(canalId) {   // aberto OU fechado (o canal fechado continua lá, travado)
  colunasTicket();
  return prep("SELECT * FROM tickets WHERE canalId = ? ORDER BY id DESC LIMIT 1").get(canalId) ?? null;
}
export function marcarTicketFechado(id, porId) {
  colunasTicket();
  prep("UPDATE tickets SET status = 'fechado', fechadoEm = ?, fechadoPor = ? WHERE id = ?").run(new Date().toISOString(), porId ?? null, id);
}
export function marcarTicketApagado(id) {
  prep("UPDATE tickets SET status = 'apagado' WHERE id = ?").run(id);
}
export function registrarMsgTicket(msgId, serverId, canalId, tipo, ticketId = null) {
  prep("INSERT OR REPLACE INTO ticket_mensagens (msgId, serverId, canalId, tipo, ticketId) VALUES (?,?,?,?,?)").run(msgId, serverId, canalId, tipo, ticketId);
}
export function msgTicket(msgId) {
  return prep("SELECT * FROM ticket_mensagens WHERE msgId = ?").get(msgId) ?? null;
}
export function esquecerMsgTicket(msgId) {
  prep("DELETE FROM ticket_mensagens WHERE msgId = ?").run(msgId);
}
export function listarTickets(serverId) {
  return prep("SELECT * FROM tickets WHERE serverId = ? AND status = 'aberto' ORDER BY numero").all(serverId);
}
export function ticketPorCanal(canalId) {
  return prep("SELECT * FROM tickets WHERE canalId = ? AND status = 'aberto'").get(canalId) ?? null;
}
export function fecharTicket(id) {
  prep("UPDATE tickets SET status = 'fechado', fechadoEm = ? WHERE id = ?").run(new Date().toISOString(), id);
}

// ─── Relatório horário ──────────────────────────────────────────────────────
export function registrarEventoRelatorio(t, serverId, tipo, titulo) {
  prep("INSERT INTO relatorio_eventos (t, serverId, tipo, titulo) VALUES (?, ?, ?, ?)")
    .run(t, serverId ?? null, tipo, String(titulo ?? "").slice(0, 200));
}
export function eventosRelatorio(desde, ate) {
  return prep("SELECT t, serverId, tipo, titulo FROM relatorio_eventos WHERE t >= ? AND t < ? ORDER BY t").all(desde, ate);
}
export function salvarSessaoPaginas(msgId, dados, expira) {
  prep("INSERT OR REPLACE INTO paginas_sessoes (msgId, dados, expira) VALUES (?, ?, ?)").run(msgId, JSON.stringify(dados), expira);
}
export function carregarSessaoPaginas(msgId, agora = Date.now()) {
  const r = prep("SELECT dados FROM paginas_sessoes WHERE msgId = ? AND expira >= ?").get(msgId, agora);
  if (!r) return null;
  try { return JSON.parse(r.dados); } catch { return null; }
}
export function podarSessoesPaginas(agora = Date.now()) {
  return prep("DELETE FROM paginas_sessoes WHERE expira < ?").run(agora).changes;
}
export function podarRelatorio(antesDe) {
  return prep("DELETE FROM relatorio_eventos WHERE t < ?").run(antesDe).changes;
}

// ── P2 ferramentas ──
// (31 out 2026) RSS: o último erro de cada feed (o `&rss list` mostra) e a fila do
// telejornal (as notícias do dia esperam o horário do servidor). Tabelas novas,
// criadas na primeira vez que a conexão aberta as usa; nada antigo muda.
let _p2FerramentasDb = null;
function prepararP2Ferramentas() {
  if (_p2FerramentasDb === db) return;
  db.exec(`CREATE TABLE IF NOT EXISTS rss_estado (
    feedId INTEGER PRIMARY KEY,
    erro   TEXT,
    erroEm INTEGER
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS rss_pendentes (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    serverId TEXT NOT NULL,
    feedId   INTEGER NOT NULL,
    dados    TEXT NOT NULL,
    criadoEm INTEGER NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_rss_pendentes_srv ON rss_pendentes (serverId, id)");
  _p2FerramentasDb = db;
}
// o erro guardado é curto e sem endereço (quem chama passa o motivo já limpo)
export function rssGuardarErro(feedId, erro, quando = Date.now()) {
  prepararP2Ferramentas();
  prep("INSERT INTO rss_estado (feedId, erro, erroEm) VALUES (?, ?, ?) ON CONFLICT(feedId) DO UPDATE SET erro = excluded.erro, erroEm = excluded.erroEm")
    .run(Number(feedId), String(erro ?? "").slice(0, 120), quando);
}
export function rssLimparErro(feedId) {
  prepararP2Ferramentas();
  prep("UPDATE rss_estado SET erro = NULL, erroEm = NULL WHERE feedId = ?").run(Number(feedId));
}
// feedId → { erro, erroEm } dos feeds deste servidor que têm erro guardado
export function rssErros(serverId) {
  prepararP2Ferramentas();
  const linhas = prep(`SELECT e.feedId, e.erro, e.erroEm FROM rss_estado e JOIN rss_feeds f ON f.id = e.feedId
    WHERE f.serverId = ? AND e.erro IS NOT NULL`).all(serverId);
  return new Map(linhas.map((l) => [l.feedId, { erro: l.erro, erroEm: l.erroEm }]));
}
// Fila do telejornal. `teto`: além disso o item novo não entra (devolve false).
export function rssEnfileirar(serverId, feedId, item, teto = 200, quando = Date.now()) {
  prepararP2Ferramentas();
  const n = prep("SELECT COUNT(*) AS n FROM rss_pendentes WHERE serverId = ?").get(serverId).n;
  if (n >= teto) return false;
  prep("INSERT INTO rss_pendentes (serverId, feedId, dados, criadoEm) VALUES (?, ?, ?, ?)")
    .run(serverId, Number(feedId), JSON.stringify(item), quando);
  return true;
}
export function rssPendentes(serverId) {
  prepararP2Ferramentas();
  return prep("SELECT id, feedId, dados, criadoEm FROM rss_pendentes WHERE serverId = ? ORDER BY id").all(serverId)
    .map((l) => { try { return { ...JSON.parse(l.dados), _id: l.id, feedId: l.feedId }; } catch { return null; } })
    .filter(Boolean);
}
// tira da fila o que já foi publicado (só as linhas dadas, deste servidor)
export function rssTirarPendentes(serverId, ids) {
  prepararP2Ferramentas();
  let n = 0;
  for (const id of ids ?? []) n += prep("DELETE FROM rss_pendentes WHERE serverId = ? AND id = ?").run(serverId, Number(id)).changes;
  return n;
}
// (31 out 2026) `&xp cargo <nível> off`: o nível deixa de dar cargo (só a regra desse
// nível, deste servidor; o XP de ninguém muda)
export function xpTirarCargoNivel(serverId, nivel) {
  return prep("DELETE FROM xp_cargos WHERE serverId = ? AND nivel = ?").run(String(serverId), Number(nivel)).changes ?? 0;
}

// ── P4 rpg ──
// (2 nov 2026, decisão do Ghieh: "pode remover tudo relacionado, desde no banco")
// O RPG saiu por completo. Na abertura do banco somem as tabelas dele (as
// 16 que o jogo já criou, de todas as eras) e as marcas de config `__rpg_*__`
// (imagens, mundo, versões). Idempotente: o que já não existe não entra no log, e
// nenhuma outra tabela é tocada. XP (xp_*) e economia (eco_*) não têm ligação.
export const TABELAS_RPG = Object.freeze(["rpg_personagem", "rpg_itens", "rpg_inventario", "rpg_equipado",
  "rpg_follower_itens", "rpg_magias", "rpg_followers_catalogo", "rpg_followers", "rpg_moedas", "rpg_carteira",
  "rpg_estoque", "rpg_ofertas", "rpg_unicos", "rpg_espera", "rpg_dungeons", "rpg_dungeon_ativos"]);
function removerRpg() {
  for (const t of TABELAS_RPG) {
    try {
      if (!prep("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)) continue;
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n ?? 0;
      db.exec(`DROP TABLE IF EXISTS ${t}`);
      console.log(`[DB] P4: tabela ${t} removida (${n} linhas)`);
    } catch (e) { console.error(`[DB] P4: remover ${t}:`, e.message); }
  }
  try {
    const n = prep("DELETE FROM config WHERE serverId LIKE '\\_\\_rpg\\_%' ESCAPE '\\'").run().changes ?? 0;
    if (n) console.log(`[DB] P4: marcas __rpg_*__ removidas da config (${n} linhas)`);
  } catch (e) { console.error("[DB] P4: marcas __rpg_*__:", e.message); }
}

// ── P4 ia ──
// (2 nov 2026, decisão do Ghieh: "pode remover tudo relacionado, desde no banco")
// O chat IA saiu por completo e a IA ficou só na moderação, que não guarda nada nestas
// tabelas (os casos e limiares dela são staff_*, revisao_*, perfil_silencio). Na
// abertura do banco somem as 7 tabelas da conversa: a memória (fatos de pessoa e de
// servidor, perfil mapeado, memória curta), o histórico, o consentimento e o "não fale
// comigo". Idempotente: o que já não existe não entra no log; nenhuma outra tabela é tocada.
export const TABELAS_CHAT_IA = Object.freeze(["ia_memoria", "ia_historico", "ia_fatos_pessoa", "ia_fatos_servidor",
  "ia_perfil", "ia_consentimento", "ia_silencio"]);
function removerChatIA() {
  for (const t of TABELAS_CHAT_IA) {
    try {
      if (!prep("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)) continue;
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n ?? 0;
      db.exec(`DROP TABLE IF EXISTS ${t}`);
      console.log(`[DB] P4: tabela ${t} removida (${n} linhas)`);
    } catch (e) { console.error(`[DB] P4: remover ${t}:`, e.message); }
  }
}

// (P4, 2 nov 2026, revisão) O gerador de imagem saiu com o chat; a contagem do teto diário dele ficava
// num arquivo ao lado do banco (/data/imagem-teto.json: o dia, IDs de servidor e quantas). Dado de
// funcionalidade removida, autorizado pelo dono: some na subida, uma linha no log; sem o arquivo,
// nada (idempotente). Só esse nome, só na pasta do banco — nunca um caminho vindo do .env. (A pasta
// dos modelos do gerador e o volume do SearXNG são grandes: ficam como instrução manual ao dono.)
const ARQUIVO_TETO_IMAGENS = "imagem-teto.json";
function removerTetoDeImagens(dbPath) {
  if (!dbPath || String(dbPath).startsWith(":memory:")) return;   // banco em memória: não há pasta do banco
  const arq = join(dirname(String(dbPath)), ARQUIVO_TETO_IMAGENS);
  try {
    if (!existsSync(arq)) return;
    rmSync(arq, { force: true });
    console.log(`[DB] P4: ${ARQUIVO_TETO_IMAGENS} removido (a contagem do teto de imagens geradas, que saiu)`);
  } catch (e) { console.error(`[DB] P4: remover ${ARQUIVO_TETO_IMAGENS}:`, e.message); }
}

// ── P2 moderacao ──
// A origem gravada do registro (pessoa, servidor) na lista global, ou null. A
// importação e a propagação não sobrescrevem uma origem automática (automod/avatar):
// é ela que decide se o ban só alerta nos outros servidores (ban-global.js).
export function origemDoBanGlobal(userId, serverId) {
  return prep("SELECT origem FROM bans_globais WHERE userId = ? AND serverId = ?").get(userId, serverId)?.origem ?? null;
}
// Desliga UM emoji de uma mensagem de cargos por reação (`&rr remove <mensagem> <emoji>`).
export function removerReactionRoleEmoji(messageId, emoji) {
  return prep("DELETE FROM reaction_roles WHERE messageId = ? AND emoji = ?").run(messageId, emoji).changes ?? 0;
}

// ── P2 registro-ajuda ──
// O bot cresce pelo uso (31 out 2026): as palavras que tentaram como comando e não
// existem, por servidor e mês, e quantas vezes cada comando foi usado (para achar os
// nunca usados). Só a palavra normalizada (sem o resto da mensagem, sem quem digitou),
// no máximo PALAVRAS_TETO distintas por servidor e mês, e cada uma some 30 dias depois
// da última vez (PRIVACIDADE.md). Visível só ao dono do bot (`&servidores palavras`).
export const PALAVRAS_TETO = 200;
export const PALAVRAS_DIAS = 30;
const _palavrasProntas = new WeakSet();
function prepararPalavras() {
  if (_palavrasProntas.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS palavras_tentadas (
    serverId TEXT NOT NULL, mes TEXT NOT NULL, palavra TEXT NOT NULL,
    vezes INTEGER NOT NULL DEFAULT 1, ultima INTEGER NOT NULL,
    PRIMARY KEY (serverId, mes, palavra))`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_palavras_ultima ON palavras_tentadas (ultima)");
  db.exec(`CREATE TABLE IF NOT EXISTS uso_comandos (
    comando TEXT PRIMARY KEY, vezes INTEGER NOT NULL DEFAULT 0, ultimo INTEGER NOT NULL)`);
  _palavrasProntas.add(db);
}
// `Ban!` → `ban`, `Configuração` → `configuracao`. Número, ID, menção, link e palavra
// comprida não entram (podem ser dado de alguém): só o que parece nome de comando.
export function normalizarPalavra(palavra) {
  if (/[:/.<>@#%]/.test(String(palavra ?? ""))) return null;   // link, menção, canal, domínio
  const p = String(palavra ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return /^[a-z][a-z-]{1,23}$/.test(p) ? p : null;
}
const mesDe = (agora) => new Date(agora).toISOString().slice(0, 7);
let _ultimaLimpeza = 0;
// Apaga o que passou do prazo (no máximo uma vez por hora)
export function limparPalavrasVencidas(agora = Date.now(), { forcar = false } = {}) {
  prepararPalavras();
  if (!forcar && agora - _ultimaLimpeza < 3600e3) return 0;
  _ultimaLimpeza = agora;
  return prep("DELETE FROM palavras_tentadas WHERE ultima < ?").run(agora - PALAVRAS_DIAS * 86400e3).changes ?? 0;
}
// true se contou (palavra válida, servidor abaixo do teto ou palavra já contada)
export function contarPalavraTentada(serverId, palavra, agora = Date.now()) {
  if (!serverId) return false;
  const p = normalizarPalavra(palavra);
  if (!p) return false;
  prepararPalavras();
  limparPalavrasVencidas(agora);
  const mes = mesDe(agora);
  const ja = prep("UPDATE palavras_tentadas SET vezes = vezes + 1, ultima = ? WHERE serverId = ? AND mes = ? AND palavra = ?").run(agora, serverId, mes, p).changes ?? 0;
  if (ja) return true;
  const n = prep("SELECT COUNT(*) AS n FROM palavras_tentadas WHERE serverId = ? AND mes = ?").get(serverId, mes)?.n ?? 0;
  if (n >= PALAVRAS_TETO) return false;
  prep("INSERT INTO palavras_tentadas (serverId, mes, palavra, vezes, ultima) VALUES (?, ?, ?, 1, ?)").run(serverId, mes, p, agora);
  return true;
}
// [{ serverId, mes, palavra, vezes }] dentro do prazo, as mais tentadas primeiro
export function palavrasTentadas({ serverId = null, agora = Date.now(), limite = 50 } = {}) {
  prepararPalavras();
  const desde = agora - PALAVRAS_DIAS * 86400e3;
  return serverId
    ? prep("SELECT serverId, mes, palavra, vezes FROM palavras_tentadas WHERE serverId = ? AND ultima >= ? ORDER BY vezes DESC, palavra LIMIT ?").all(serverId, desde, limite)
    : prep("SELECT palavra, SUM(vezes) AS vezes, COUNT(DISTINCT serverId) AS servidores FROM palavras_tentadas WHERE ultima >= ? GROUP BY palavra ORDER BY servidores DESC, vezes DESC, palavra LIMIT ?").all(desde, limite);
}
export function contarUsoComando(comando, agora = Date.now()) {
  if (!comando) return;
  prepararPalavras();
  prep("INSERT INTO uso_comandos (comando, vezes, ultimo) VALUES (?, 1, ?) ON CONFLICT(comando) DO UPDATE SET vezes = vezes + 1, ultimo = excluded.ultimo").run(String(comando).slice(0, 40), agora);
}
// comando → vezes
export function usoDeComandos() {
  prepararPalavras();
  return Object.fromEntries(prep("SELECT comando, vezes FROM uso_comandos").all().map((r) => [r.comando, r.vezes]));
}

// ── P3a fila ──
// (31 out 2026, P3a) A fila de revisão do dono do bot (modulos/moderacao/revisao.js).
// Um caso por linha. Os campos que identificam alguém (userId, canalId, msgId,
// serverId), o trecho e o link existem só enquanto o caso está vivo: o trecho e o
// link somem em 7 dias; caso julgado fica só com hash/impressão + veredito — sem o
// pseudônimo do servidor (revisão P3a); caso não julgado some em 14 dias (FILA_* abaixo).
// (31 out 2026, P3a, staff) A fila do dono é só a AMOSTRA diária: não há mais caso
// "candidato" (dúvida), "herdado" nem sinal da staff — os casos duvidosos são da staff
// de cada servidor (bloco "P3a staff", abaixo). As linhas antigas continuam legíveis.
export const FILA_DIAS_TRECHO = 7;
export const FILA_DIAS_PENDENTE = 14;
let _filaDb = null;
function prepararFila() {
  if (_filaDb === db) return;
  db.exec(`CREATE TABLE IF NOT EXISTS revisao_casos (
    codigo     TEXT PRIMARY KEY,
    criadoEm   INTEGER NOT NULL,
    tipo       TEXT NOT NULL,
    categoria  TEXT NOT NULL,
    origem     TEXT NOT NULL,
    certeza    TEXT,
    nota       REAL,
    acao       TEXT,
    detector   TEXT,
    serverId   TEXT,
    servidor   TEXT,          -- pseudônimo do servidor (pseudonimo.js), o que a DM mostra
    userId     TEXT,
    canalId    TEXT,
    msgId      TEXT,
    link       TEXT,
    trecho     TEXT,
    hash       TEXT,
    impressao  TEXT,
    estado     TEXT NOT NULL, -- amostra | registro | enviado | julgado
    enviadoEm  INTEGER,
    dmCanalId  TEXT,
    dmMsgId    TEXT,
    veredito   TEXT,          -- certo | errou
    violacao   INTEGER,       -- 1 = o dono disse que é violação
    julgadoEm  INTEGER,
    limpoEm    INTEGER,       -- quando os campos de identificação foram apagados
    dmLimpar   INTEGER        -- 1 = a mensagem na DM ainda mostra o que a pessoa pediu para apagar
  )`);
  // (revisão P3a) coluna nova num banco que já tinha a tabela: acrescenta, sem perder linhas
  if (!db.prepare("PRAGMA table_info(revisao_casos)").all().some((c) => c.name === "dmLimpar")) db.exec("ALTER TABLE revisao_casos ADD COLUMN dmLimpar INTEGER");
  db.exec("CREATE INDEX IF NOT EXISTS idx_revisao_estado ON revisao_casos (estado, criadoEm)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_revisao_dm ON revisao_casos (dmMsgId)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_revisao_julgados ON revisao_casos (categoria, julgadoEm)");
  // (revisão P3a) as consultas da rodada e dos tetos sem varrer a tabela
  db.exec("CREATE INDEX IF NOT EXISTS idx_revisao_origem ON revisao_casos (origem, criadoEm)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_revisao_enviado ON revisao_casos (enviadoEm)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_revisao_limpo ON revisao_casos (limpoEm)");
  db.exec(`CREATE TABLE IF NOT EXISTS revisao_limiares (
    categoria TEXT PRIMARY KEY, limiar REAL NOT NULL, padrao REAL, casos INTEGER NOT NULL DEFAULT 0,
    precisao REAL, calculadoEm INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS revisao_estado (chave TEXT PRIMARY KEY, valor TEXT)`);
  _filaDb = db;
}
const FILA_COLUNAS = new Set(["criadoEm", "tipo", "categoria", "origem", "certeza", "nota", "acao", "detector", "serverId", "servidor",
  "userId", "canalId", "msgId", "link", "trecho", "hash", "impressao", "estado", "enviadoEm", "dmCanalId", "dmMsgId",
  "veredito", "violacao", "julgadoEm", "limpoEm", "dmLimpar"]);
export function filaExiste(codigo) {
  prepararFila();
  return !!prep("SELECT 1 FROM revisao_casos WHERE codigo = ?").get(String(codigo));
}
export function filaInserir(caso) {
  prepararFila();
  const cols = ["codigo", ...Object.keys(caso).filter((k) => FILA_COLUNAS.has(k))];
  const vals = cols.map((k) => (k === "codigo" ? caso.codigo : caso[k] ?? null));
  prep(`INSERT INTO revisao_casos (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...vals);
}
export function filaAtualizar(codigo, campos) {
  prepararFila();
  const ks = Object.keys(campos).filter((k) => FILA_COLUNAS.has(k));
  if (!ks.length) return 0;
  return prep(`UPDATE revisao_casos SET ${ks.map((k) => `${k} = ?`).join(", ")} WHERE codigo = ?`).run(...ks.map((k) => campos[k] ?? null), String(codigo)).changes ?? 0;
}
export function filaCaso(codigo) {
  prepararFila();
  return prep("SELECT * FROM revisao_casos WHERE codigo = ?").get(String(codigo).toUpperCase()) ?? null;
}
export function filaCasoPorDm(msgId) {
  prepararFila();
  return msgId ? prep("SELECT * FROM revisao_casos WHERE dmMsgId = ?").get(String(msgId)) ?? null : null;
}
// Os casos em certos estados criados desde `desde` (mais antigos primeiro)
export function filaPorEstado(estados, desde = 0) {
  prepararFila();
  const lista = [].concat(estados).map(String);
  return prep(`SELECT * FROM revisao_casos WHERE estado IN (${lista.map(() => "?").join(", ")}) AND criadoEm >= ? ORDER BY criadoEm`).all(...lista, desde);
}
export function filaContar(estados, desde = 0) {
  prepararFila();
  const lista = [].concat(estados).map(String);
  return prep(`SELECT COUNT(*) AS n FROM revisao_casos WHERE estado IN (${lista.map(() => "?").join(", ")}) AND criadoEm >= ?`).get(...lista, desde)?.n ?? 0;
}
export function filaEnviadosDesde(desde) {
  prepararFila();
  return prep("SELECT COUNT(*) AS n FROM revisao_casos WHERE enviadoEm >= ?").get(desde)?.n ?? 0;
}
// A amostra guardada desde `desde`: a de `origem: "amostra"` (o que o detector não puniu) e a
// das decisões dos detectores (punidas, alertadas à staff) — as duas dividem os mesmos tetos.
// (31 out 2026, P3a, staff) antes: só a certeza alta do detector entrava aqui; agora toda decisão.
const FILA_AMOSTRA = "origem IN ('amostra', 'detector', 'discordancia') AND estado <> 'herdado'";
export function filaAmostrasDesde(desde, serverId = null) {
  prepararFila();
  return serverId
    ? prep(`SELECT COUNT(*) AS n FROM revisao_casos WHERE ${FILA_AMOSTRA} AND criadoEm >= ? AND serverId = ?`).get(desde, String(serverId))?.n ?? 0
    : prep(`SELECT COUNT(*) AS n FROM revisao_casos WHERE ${FILA_AMOSTRA} AND criadoEm >= ?`).get(desde)?.n ?? 0;
}
// Julgados pelo dono, os mais recentes primeiro
export function filaJulgados({ categoria = null, desde = 0, limite = 5000 } = {}) {
  prepararFila();
  return categoria
    ? prep("SELECT * FROM revisao_casos WHERE estado = 'julgado' AND categoria = ? AND julgadoEm >= ? ORDER BY julgadoEm DESC LIMIT ?").all(String(categoria), desde, limite)
    : prep("SELECT * FROM revisao_casos WHERE estado = 'julgado' AND julgadoEm >= ? ORDER BY julgadoEm DESC LIMIT ?").all(desde, limite);
}
// Há caso ainda com identificação (trecho, link ou IDs) ou mensagem da DM por editar?
// Enquanto houver, a retenção tem trabalho.
export function filaTemVivos() {
  prepararFila();
  return !!(prep("SELECT 1 FROM revisao_casos WHERE limpoEm IS NULL LIMIT 1").get()
    || prep("SELECT 1 FROM revisao_casos WHERE dmMsgId IS NOT NULL LIMIT 1").get());
}
// Há alguma linha? (a retenção do boot só roda se houver)
export function filaTemLinhas() {
  prepararFila();
  return !!prep("SELECT 1 FROM revisao_casos LIMIT 1").get();
}
// As mensagens da DM que ainda mostram o que já foi apagado: caso com mais de 7 dias
// (`ate` = agora − 7 dias) ou marcado pelo `&privacidade apagar` (dmLimpar)
export function filaDmsParaLimpar(ate, limite = 500) {
  prepararFila();
  return prep(`SELECT codigo, categoria, veredito, dmCanalId, dmMsgId FROM revisao_casos
    WHERE dmMsgId IS NOT NULL AND (criadoEm < ? OR dmLimpar = 1) LIMIT ?`).all(ate, limite);
}
// Retenção. Devolve quantos casos perderam o trecho/os IDs e quantos foram apagados.
//  - trecho e link: 7 dias depois de criado (qualquer estado)
//  - julgado: com 7 dias, fica só hash/impressão + veredito (sem IDs nem o pseudônimo)
//  - não julgado (enviado sem resposta, amostra, registro): apagado com 14 dias
// (31 out 2026, P3a, staff) as linhas "herdado"/"candidato" de antes seguem as mesmas regras.
// A linha que ainda aponta para uma mensagem na DM do dono só sai depois que a mensagem foi
// editada (revisao.limparDms zera os IDs; a próxima passada apaga) — senão a DM ficaria com o trecho.
export function filaReter(agora = Date.now()) {
  prepararFila();
  const dia = 86400e3;
  const trecho = prep("UPDATE revisao_casos SET trecho = NULL, link = NULL WHERE criadoEm < ? AND (trecho IS NOT NULL OR link IS NOT NULL)").run(agora - FILA_DIAS_TRECHO * dia).changes ?? 0;
  const limpos = prep(`UPDATE revisao_casos SET serverId = NULL, servidor = NULL, userId = NULL, canalId = NULL, msgId = NULL, trecho = NULL, link = NULL, limpoEm = ?
    WHERE estado IN ('julgado', 'herdado') AND limpoEm IS NULL AND criadoEm < ?`).run(agora, agora - FILA_DIAS_TRECHO * dia).changes ?? 0;
  // o herdado já nasce sem pseudônimo; o antigo (de antes da revisão) perde agora
  prep("UPDATE revisao_casos SET servidor = NULL WHERE estado IN ('julgado', 'herdado') AND limpoEm IS NOT NULL AND servidor IS NOT NULL").run();
  const apagados = prep("DELETE FROM revisao_casos WHERE estado <> 'julgado' AND criadoEm < ? AND dmMsgId IS NULL").run(agora - FILA_DIAS_PENDENTE * dia).changes ?? 0;
  return { trecho, limpos, apagados };
}
// A amostra e o registro (certeza alta) que a escolha do dia não pegou: apagados logo (privacidade)
export function filaDescartarNaoEscolhidos(ate) {
  prepararFila();
  return prep("DELETE FROM revisao_casos WHERE estado IN ('amostra', 'registro') AND criadoEm < ?").run(ate).changes ?? 0;
}
// `&privacidade` / pedido de apagar: a pessoa some dos casos (o caso fica, sem ela nem o
// pseudônimo do servidor); a mensagem na DM do dono, se houver, é editada na próxima rodada (dmLimpar)
export function filaEsquecerUsuario(userId) {
  prepararFila();
  return prep(`UPDATE revisao_casos SET userId = NULL, canalId = NULL, msgId = NULL, trecho = NULL, link = NULL, servidor = NULL,
    dmLimpar = CASE WHEN dmMsgId IS NOT NULL THEN 1 ELSE dmLimpar END WHERE userId = ?`).run(String(userId)).changes ?? 0;
}
export function filaLimiar(categoria) {
  prepararFila();
  return prep("SELECT * FROM revisao_limiares WHERE categoria = ?").get(String(categoria)) ?? null;
}
export function filaLimiares() {
  prepararFila();
  return prep("SELECT * FROM revisao_limiares ORDER BY categoria").all();
}
export function filaSalvarLimiar(categoria, { limiar, padrao = null, casos = 0, precisao = null, calculadoEm = Date.now() }) {
  prepararFila();
  prep(`INSERT INTO revisao_limiares (categoria, limiar, padrao, casos, precisao, calculadoEm) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(categoria) DO UPDATE SET limiar = excluded.limiar, padrao = COALESCE(excluded.padrao, padrao), casos = excluded.casos,
    precisao = excluded.precisao, calculadoEm = excluded.calculadoEm`).run(String(categoria), limiar, padrao, casos, precisao, calculadoEm);
}
export function filaEstado(chave) {
  prepararFila();
  return prep("SELECT valor FROM revisao_estado WHERE chave = ?").get(String(chave))?.valor ?? null;
}
export function filaDefinirEstado(chave, valor) {
  prepararFila();
  prep("INSERT INTO revisao_estado (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(String(chave), valor == null ? null : String(valor));
}

// ── P3a perfil ──
// (31 out 2026, P3a) Quem a moderação do perfil silenciou ATÉ TROCAR, e por quais
// partes do perfil (`campos`: "bio", "avatar", "banner"…). Quando a pessoa troca a
// parte que apitou e ela passa limpa, o silêncio acaba e a linha sai (uma por vez,
// como o `limparPunicao`). Só os nomes das partes e o motivo — nada do conteúdo.
// (revisão P3a) `fimAplicado`: quando acaba o timeout que o PERFIL aplicou — a voz só é
// devolvida se o timeout atual do membro ainda é esse (a staff pode ter silenciado depois).
const _perfilPronto = new WeakSet();
function prepararPerfil() {
  if (_perfilPronto.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS perfil_silencio (
    serverId TEXT NOT NULL, userId TEXT NOT NULL, campos TEXT NOT NULL,
    motivo TEXT, criadoEm INTEGER NOT NULL, fimAplicado INTEGER,
    PRIMARY KEY (serverId, userId))`);
  // coluna nova num banco que já tinha a tabela: acrescenta, sem perder linhas
  if (!db.prepare("PRAGMA table_info(perfil_silencio)").all().some((c) => c.name === "fimAplicado")) db.exec("ALTER TABLE perfil_silencio ADD COLUMN fimAplicado INTEGER");
  db.exec("CREATE INDEX IF NOT EXISTS idx_perfil_silencio_criado ON perfil_silencio (criadoEm)");
  _perfilPronto.add(db);
}
const CAMPO_PERFIL = /^[a-zA-Z]{1,20}$/;
// `fim`: o fim do timeout aplicado agora (null = o mesmo de antes, numa troca parcial)
export function perfilSilencioGravar(serverId, userId, campos, motivo = null, agora = Date.now(), fim = null) {
  prepararPerfil();
  const lista = [...new Set((campos ?? []).map(String).filter((c) => CAMPO_PERFIL.test(c)))];
  if (!serverId || !userId || !lista.length) return false;
  const f = Number.isFinite(Number(fim)) && fim !== null ? Math.round(Number(fim)) : null;
  prep(`INSERT INTO perfil_silencio (serverId, userId, campos, motivo, criadoEm, fimAplicado) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(serverId, userId) DO UPDATE SET campos = excluded.campos, motivo = COALESCE(excluded.motivo, motivo), criadoEm = excluded.criadoEm,
    fimAplicado = COALESCE(excluded.fimAplicado, fimAplicado)`)
    .run(String(serverId), String(userId), lista.join(","), motivo == null ? null : String(motivo).slice(0, 300), agora, f);
  return true;
}
// O silêncio do perfil dura no máximo o teto do timeout do Stoat (28 dias): passou
// disso sem a pessoa trocar nada, o registro venceu e sai na leitura — e na limpeza
// periódica (`perfilSilencioLimparVencidos`, a cada 6 h e no boot: retencao.limparVencidos).
export const PERFIL_SILENCIO_MAX_MS = 28 * 86400e3;
export function perfilSilencioLer(serverId, userId, agora = Date.now()) {
  prepararPerfil();
  const r = prep("SELECT campos, motivo, criadoEm, fimAplicado FROM perfil_silencio WHERE serverId = ? AND userId = ?").get(String(serverId), String(userId));
  if (r && agora - r.criadoEm > PERFIL_SILENCIO_MAX_MS) { perfilSilencioTirar(serverId, userId); return null; }
  return r ? { campos: String(r.campos).split(",").filter(Boolean), motivo: r.motivo ?? null, criadoEm: r.criadoEm, fimAplicado: r.fimAplicado ?? null } : null;
}
// Os servidores em que a pessoa está silenciada pelo perfil (a troca de perfil revê esses mesmo fora do cache)
export function perfilSilencioServidores(userId, agora = Date.now()) {
  prepararPerfil();
  return prep("SELECT serverId FROM perfil_silencio WHERE userId = ? AND criadoEm >= ?").all(String(userId), agora - PERFIL_SILENCIO_MAX_MS).map((r) => r.serverId);
}
export function perfilSilencioLimparVencidos(agora = Date.now()) {
  prepararPerfil();
  return prep("DELETE FROM perfil_silencio WHERE criadoEm < ?").run(agora - PERFIL_SILENCIO_MAX_MS).changes ?? 0;
}
export function perfilSilencioTirar(serverId, userId) {
  prepararPerfil();
  return prep("DELETE FROM perfil_silencio WHERE serverId = ? AND userId = ?").run(String(serverId), String(userId)).changes ?? 0;
}

// ── P3a staff ──
// (31 out 2026, P3a, staff) Os casos duvidosos de cada servidor (casos-staff.js): a
// moderação automática ficou em dúvida e a staff DAQUELE servidor recebeu um alerta com
// ✅/❌. Enquanto o caso espera a reação, guarda só o necessário para executar a ação
// (servidor, pessoa, canal, mensagem, categoria, nota, parte do perfil) e a mensagem do
// alerta — no máximo 14 dias. Julgado, perde a pessoa, o canal, a mensagem e o alerta na
// hora: fica a impressão/hash, a categoria, a nota, o veredito e o servidor (é a herança e
// o limiar DAQUELE servidor) — até a Judy sair do servidor (a limpeza de 30 dias pega pelo
// `serverId`). `&privacidade apagar` tira a pessoa dos casos que esperam.
export const STAFF_DIAS_PENDENTE = 14;
const _staffPronto = new WeakSet();
function prepararStaff() {
  if (_staffPronto.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS staff_casos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    serverId      TEXT NOT NULL,
    tipo          TEXT NOT NULL,      -- assunto | perfil-imagem | perfil-texto
    categoria     TEXT NOT NULL,
    nota          REAL,
    parte         TEXT,               -- perfil: a parte (bio, avatar…); assunto: ataque | discussao
    userId        TEXT,
    canalId       TEXT,
    msgId         TEXT,
    alertaCanalId TEXT,
    alertaMsgId   TEXT,
    hash          TEXT,
    impressao     TEXT,
    criadoEm      INTEGER NOT NULL,
    veredito      TEXT,               -- certo (✅ a staff aplicou) | errou (❌ não era)
    julgadoEm     INTEGER,
    ensina        INTEGER             -- 0 = o ✅ valeu só para o caso (quem decidiu não tinha a permissão mais forte do módulo)
  )`);
  // coluna nova num banco que já tinha a tabela: acrescenta, sem perder linhas
  if (!db.prepare("PRAGMA table_info(staff_casos)").all().some((c) => c.name === "ensina")) db.exec("ALTER TABLE staff_casos ADD COLUMN ensina INTEGER");
  db.exec("CREATE INDEX IF NOT EXISTS idx_staff_alerta ON staff_casos (alertaMsgId)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_staff_servidor ON staff_casos (serverId, categoria, julgadoEm)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_staff_criado ON staff_casos (criadoEm)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_staff_pessoa ON staff_casos (userId)");
  db.exec(`CREATE TABLE IF NOT EXISTS staff_limiares (
    serverId TEXT NOT NULL, categoria TEXT NOT NULL, limiar REAL NOT NULL, casos INTEGER NOT NULL DEFAULT 0,
    precisao REAL, calculadoEm INTEGER NOT NULL, PRIMARY KEY (serverId, categoria))`);
  _staffPronto.add(db);
}
const STAFF_COLUNAS = ["serverId", "tipo", "categoria", "nota", "parte", "userId", "canalId", "msgId", "alertaCanalId", "alertaMsgId", "hash", "impressao", "criadoEm"];
export function staffInserir(caso) {
  prepararStaff();
  return Number(prep(`INSERT INTO staff_casos (${STAFF_COLUNAS.join(", ")}) VALUES (${STAFF_COLUNAS.map(() => "?").join(", ")})`)
    .run(...STAFF_COLUNAS.map((k) => caso[k] ?? null)).lastInsertRowid);
}
// O caso que espera reação, pela mensagem do alerta (o julgado já não tem a mensagem)
export function staffPorAlerta(alertaMsgId) {
  prepararStaff();
  return alertaMsgId ? prep("SELECT * FROM staff_casos WHERE alertaMsgId = ? AND veredito IS NULL").get(String(alertaMsgId)) ?? null : null;
}
export function staffCaso(id) {
  prepararStaff();
  return prep("SELECT * FROM staff_casos WHERE id = ?").get(Number(id)) ?? null;
}
// Julgado: a pessoa, o canal, a mensagem, o alerta e a parte saem na hora. `ensina: false` = o ✅ vale
// só para este caso (não entra na herança nem no limiar do servidor).
export function staffJulgar(id, veredito, agora = Date.now(), { ensina = true } = {}) {
  prepararStaff();
  return prep(`UPDATE staff_casos SET veredito = ?, julgadoEm = ?, ensina = ?, userId = NULL, canalId = NULL, msgId = NULL,
    alertaCanalId = NULL, alertaMsgId = NULL, parte = NULL WHERE id = ? AND veredito IS NULL`).run(String(veredito), agora, ensina ? 1 : 0, Number(id)).changes ?? 0;
}
// O ✅ não pôde agir agora (ex.: não deu para ler o perfil): o caso volta a esperar, como era
export function staffReabrir(caso) {
  prepararStaff();
  return prep(`UPDATE staff_casos SET veredito = NULL, julgadoEm = NULL, ensina = NULL, userId = ?, canalId = ?, msgId = ?,
    alertaCanalId = ?, alertaMsgId = ?, parte = ? WHERE id = ?`).run(caso.userId ?? null, caso.canalId ?? null, caso.msgId ?? null,
    caso.alertaCanalId ?? null, caso.alertaMsgId ?? null, caso.parte ?? null, Number(caso.id)).changes ?? 0;
}
// Para a herança: os julgados DESTE servidor nesta categoria, com hash ou impressão
export function staffReferencias(serverId, categoria, limite = 1000) {
  prepararStaff();
  return prep(`SELECT id, hash, impressao, veredito, julgadoEm FROM staff_casos
    WHERE serverId = ? AND categoria = ? AND veredito IS NOT NULL AND ensina IS NOT 0 AND (hash IS NOT NULL OR impressao IS NOT NULL)
    ORDER BY julgadoEm DESC, id DESC LIMIT ?`).all(String(serverId), String(categoria), limite);
}
// Para o limiar de cada servidor: os julgados com nota que ensinam, os `porGrupo` mais recentes de CADA
// servidor e categoria (antes: um teto global, que um servidor grande enchia sozinho)
export const STAFF_JULGADOS_POR_GRUPO = 500;
export function staffJulgadosComNota(porGrupo = STAFF_JULGADOS_POR_GRUPO) {
  prepararStaff();
  return prep(`SELECT serverId, categoria, nota, veredito FROM (
    SELECT serverId, categoria, nota, veredito, julgadoEm, id, ROW_NUMBER() OVER (PARTITION BY serverId, categoria ORDER BY julgadoEm DESC, id DESC) AS rn
    FROM staff_casos WHERE veredito IS NOT NULL AND nota IS NOT NULL AND ensina IS NOT 0) WHERE rn <= ? ORDER BY julgadoEm DESC, id DESC`).all(porGrupo);
}
// Quantos casos a staff deste servidor já julgou (o painel do sentinela). `tipo`: prefixo (ex.: "perfil-")
export function staffContarJulgados(serverId, tipo = "") {
  prepararStaff();
  return prep("SELECT COUNT(*) AS n FROM staff_casos WHERE serverId = ? AND veredito IS NOT NULL AND tipo LIKE ?").get(String(serverId), `${String(tipo)}%`)?.n ?? 0;
}
export function staffLimiar(serverId, categoria) {
  prepararStaff();
  return prep("SELECT * FROM staff_limiares WHERE serverId = ? AND categoria = ?").get(String(serverId), String(categoria)) ?? null;
}
export function staffSalvarLimiar(serverId, categoria, { limiar, casos = 0, precisao = null, calculadoEm = Date.now() }) {
  prepararStaff();
  prep(`INSERT INTO staff_limiares (serverId, categoria, limiar, casos, precisao, calculadoEm) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(serverId, categoria) DO UPDATE SET limiar = excluded.limiar, casos = excluded.casos, precisao = excluded.precisao,
    calculadoEm = excluded.calculadoEm`).run(String(serverId), String(categoria), limiar, casos, precisao, calculadoEm);
}
// Retenção (a cada 6 h e no boot: retencao.limparVencidos): o caso que esperou 14 dias sem
// reação sai inteiro (não foi julgado: não ensina nada, e tem a pessoa).
// (revisão staff) E dos julgados (já sem pessoa) ficam só os 500 mais recentes de cada servidor e categoria.
export function staffReter(agora = Date.now()) {
  prepararStaff();
  const pendentes = prep("DELETE FROM staff_casos WHERE veredito IS NULL AND criadoEm < ?").run(agora - STAFF_DIAS_PENDENTE * 86400e3).changes ?? 0;
  const antigos = prep(`DELETE FROM staff_casos WHERE id IN (SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY serverId, categoria ORDER BY julgadoEm DESC, id DESC) AS rn FROM staff_casos WHERE veredito IS NOT NULL) WHERE rn > ?)`)
    .run(STAFF_JULGADOS_POR_GRUPO).changes ?? 0;
  return { pendentes, antigos };
}
// O estado de punição de antes (o aviso que a punição somou e desfez: o ✅ de quem não tinha a permissão do degrau)
export function restaurarPunicao(serverId, userId, anterior) {
  if (!anterior) return limparPunicao(serverId, userId);
  prep(`UPDATE punicoes SET avisos = ?, silenciado = ?, silencioAte = ?, motivo = ?, atualizadoEm = ? WHERE serverId = ? AND userId = ?`)
    .run(anterior.avisos ?? 0, anterior.silenciado ? 1 : 0, anterior.silencioAte ?? 0, anterior.motivo ?? null, anterior.atualizadoEm ?? null, serverId, userId);
}
// `&privacidade apagar`: os casos que esperam reação e são da pessoa saem (o julgado já não a tem)
export function staffDaPessoa(userId, { apagar = false } = {}) {
  prepararStaff();
  return apagar
    ? prep("DELETE FROM staff_casos WHERE userId = ? AND veredito IS NULL").run(String(userId)).changes ?? 0
    : prep("SELECT COUNT(*) AS n FROM staff_casos WHERE userId = ? AND veredito IS NULL").get(String(userId))?.n ?? 0;
}
