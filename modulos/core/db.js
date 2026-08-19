// ══════════════════════════════════════════════════════════
//  db.js — Persistência com SQLite embutido (node:sqlite)
//  Zero dependências nativas: o SQLite vem dentro do Node.
//  Arquivo do banco em DB_PATH (padrão ./stoat.db; no container,
//  /data/stoat.db, dentro do volume persistente).
//
//  Fase 1: tabela `config` (por servidor + linhas especiais
//  __global__ e __default__). Fases 2/3 acrescentam `punicoes`
//  e `bans_globais` — já deixo as tabelas criadas.
// ══════════════════════════════════════════════════════════

import { DatabaseSync } from "node:sqlite";

let db = null;

// ── Cache de prepared statements ──
// prep() COMPILA o SQL toda vez que é chamado. Este arquivo tem ~140
// consultas, várias no caminho quente (getXp roda em TODA mensagem) — antes,
// cada mensagem recompilava as mesmas consultas de novo e de novo. Aqui cada
// SQL é compilado UMA vez e o statement é reutilizado dali em diante: menos
// CPU, menos lixo para o GC, mesma semântica (.get/.all/.run materializam o
// resultado, nada fica com cursor aberto entre chamadas).
const _stmts = new Map();
const _STMTS_MAX = 512;   // teto de segurança: os SQLs "dinâmicos" (SET de
                          // colunas variáveis do RPG) vêm de conjuntos finitos,
                          // mas com o teto o cache é limitado POR CONSTRUÇÃO.
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

  // Migração: `silencioAte` chegou depois da escada de punição progressiva.
  // Bases criadas antes não têm a coluna, e sem ela todo mute vira permanente.
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
    const cols = prep("PRAGMA table_info(reaction_roles)").all().map((c) => c.name);
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
    const cols = prep("PRAGMA table_info(ia_fatos_pessoa)").all().map((c) => c.name);
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
    CREATE TABLE IF NOT EXISTS xp_cargos (
      serverId  TEXT NOT NULL,
      nivel     INTEGER NOT NULL,
      roleId    TEXT NOT NULL,
      PRIMARY KEY (serverId, nivel)
    )
  `);

  // ── RPG: personagem (por servidor) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_personagem (
      serverId    TEXT NOT NULL,
      userId      TEXT NOT NULL,
      nome        TEXT,
      nivel       INTEGER NOT NULL DEFAULT 1,
      xp          INTEGER NOT NULL DEFAULT 0,
      pontos      REAL    NOT NULL DEFAULT 0,   -- livres para distribuir
      forca       INTEGER NOT NULL DEFAULT 1,
      destreza    INTEGER NOT NULL DEFAULT 1,
      resistencia INTEGER NOT NULL DEFAULT 1,
      agilidade   INTEGER NOT NULL DEFAULT 1,
      vida        INTEGER NOT NULL DEFAULT 1,
      mana        INTEGER NOT NULL DEFAULT 1,
      inteligencia INTEGER NOT NULL DEFAULT 1,
      sorte       INTEGER NOT NULL DEFAULT 1,
      carisma     INTEGER NOT NULL DEFAULT 1,
      criadoEm    INTEGER NOT NULL,
      PRIMARY KEY (serverId, userId)
    )
  `);

  // ── RPG: catálogo de itens (global — a curadoria é do dono do bot) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_itens (
      id        TEXT PRIMARY KEY,
      nome      TEXT NOT NULL,
      slot      TEXT NOT NULL,        -- arma | capacete | armadura | acessorio
      raridade  TEXT NOT NULL,        -- comum | incomum | raro | epico | lendario
      bonus     TEXT NOT NULL,        -- JSON: { atributo: valor }
      origem    TEXT NOT NULL DEFAULT 'generico',
      infinito  INTEGER NOT NULL DEFAULT 0,
      precoBase INTEGER NOT NULL DEFAULT 10,
      ativo     INTEGER NOT NULL DEFAULT 1   -- 0 = descontinuado (some do drop, quem tem mantém)
    )
  `);
  // ── RPG: inventário e equipamento (por servidor) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_inventario (
      serverId   TEXT NOT NULL,
      userId     TEXT NOT NULL,
      itemId     TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (serverId, userId, itemId)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_equipado (
      serverId TEXT NOT NULL,
      userId   TEXT NOT NULL,
      slot     TEXT NOT NULL,          -- arma, capacete, armadura, acessorio1..3
      itemId   TEXT NOT NULL,
      PRIMARY KEY (serverId, userId, slot)
    )
  `);

  // ── RPG: mochila do companheiro ──
  // O follower carrega os próprios itens, que somam nos atributos DELE. É o
  // que faz um companheiro comum virar útil sem precisar de mais níveis, e dá
  // destino para o equipamento que você já superou em vez de ir tudo revendido.
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_follower_itens (
      followerId INTEGER NOT NULL,
      itemId     TEXT NOT NULL,
      criadoEm   INTEGER NOT NULL,
      PRIMARY KEY (followerId, itemId)
    )
  `);

  // ── RPG: magias aprendidas pelo jogador ──
  // O catálogo em si vive no código (magias.js): é conteúdo do jogo, não
  // dado do servidor. Aqui fica só quem aprendeu o quê.
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_magias (
      serverId  TEXT NOT NULL,
      userId    TEXT NOT NULL,
      magiaId   TEXT NOT NULL,
      criadoEm  INTEGER NOT NULL,
      PRIMARY KEY (serverId, userId, magiaId)
    )
  `);

  // ── RPG: followers ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_followers_catalogo (
      id        TEXT PRIMARY KEY,
      nome      TEXT NOT NULL,
      classe    TEXT NOT NULL,
      raridade  TEXT NOT NULL,
      preco     INTEGER NOT NULL DEFAULT 0,     -- 0 = não vendido (só dungeon)
      soDungeon INTEGER NOT NULL DEFAULT 0,
      fotos     TEXT NOT NULL DEFAULT '[]',     -- JSON: [url, ...]
      origem    TEXT NOT NULL DEFAULT 'generico',
      ativo     INTEGER NOT NULL DEFAULT 1
    )
  `);
  // Instâncias: cada follower recrutado é uma linha própria (tem nível e energia)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_followers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId    TEXT NOT NULL,
      donoId      TEXT,                          -- null = está na dungeon, sem dono
      catalogoId  TEXT NOT NULL,
      nivel       INTEGER NOT NULL DEFAULT 1,
      energia     REAL    NOT NULL DEFAULT 5,
      energiaEm   INTEGER NOT NULL DEFAULT 0,    -- quando a energia foi atualizada
      naParty     INTEGER NOT NULL DEFAULT 0,
      capturado   INTEGER NOT NULL DEFAULT 0,    -- 1 = caiu e está na dungeon
      donoOriginal TEXT,                         -- para a chance maior no resgate
      capturadoEm INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_folw_dono ON rpg_followers (serverId, donoId)`);

  // ── RPG: economia ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_moedas (
      serverId   TEXT NOT NULL,
      id         TEXT NOT NULL,
      nome       TEXT NOT NULL,
      simbolo    TEXT NOT NULL DEFAULT '🪙',
      finita     INTEGER NOT NULL DEFAULT 1,
      mercado    REAL NOT NULL DEFAULT 10000,   -- quanto o mercado tem agora
      dungeon    REAL NOT NULL DEFAULT 0,       -- o pote acumulado
      pSuave     REAL NOT NULL DEFAULT 0.5,     -- P suavizado (média móvel)
      pEm        INTEGER NOT NULL DEFAULT 0,
      padrao     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (serverId, id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_carteira (
      serverId   TEXT NOT NULL,
      userId     TEXT NOT NULL,
      moedaId    TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (serverId, userId, moedaId)
    )
  `);
  // Estoque de itens FINITOS no mercado (os infinitos nem entram aqui)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_estoque (
      serverId   TEXT NOT NULL,
      itemId     TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 0,
      base       INTEGER NOT NULL DEFAULT 10,
      PRIMARY KEY (serverId, itemId)
    )
  `);

  // ── RPG: mercado entre jogadores ──
  //
  // Toda oferta guarda o que está em jogo em CUSTÓDIA: o item/moeda sai da
  // carteira de quem anuncia e só volta se cancelar. Sem isso, dá para
  // anunciar o que não se tem e dar calote.
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpg_ofertas (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      serverId      TEXT NOT NULL,
      tipo          TEXT NOT NULL,          -- venda | cambio | troca
      autorId       TEXT NOT NULL,
      alvoId        TEXT,                   -- troca direcionada a alguém
      itemOferecido TEXT,
      moedaOferecida TEXT,
      qtdOferecida  REAL NOT NULL DEFAULT 0,
      itemPedido    TEXT,
      moedaPedida   TEXT,
      qtdPedida     REAL NOT NULL DEFAULT 0,
      estado        TEXT NOT NULL DEFAULT 'aberta',
      valorFinal    REAL NOT NULL DEFAULT 0,
      criadoEm      INTEGER NOT NULL,
      fechadoEm     INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ofertas_srv ON rpg_ofertas (serverId, estado)`);

  // Campos de configuração da moeda (migração: adiciona se faltar)
  try {
    const cols = prep("PRAGMA table_info(rpg_moedas)").all().map((c) => c.name);
    if (!cols.includes("dificuldade"))   db.exec("ALTER TABLE rpg_moedas ADD COLUMN dificuldade REAL NOT NULL DEFAULT 1");
    if (!cols.includes("suprimentoBase")) db.exec("ALTER TABLE rpg_moedas ADD COLUMN suprimentoBase REAL NOT NULL DEFAULT 10000");
    if (!cols.includes("nivelMin"))      db.exec("ALTER TABLE rpg_moedas ADD COLUMN nivelMin INTEGER NOT NULL DEFAULT 1");
  } catch (e) { console.error("[DB] migração moedas:", e.message); }

  // Colunas de missão no personagem (migração: adiciona se faltar)
  try {
    const cols = prep("PRAGMA table_info(rpg_personagem)").all().map((c) => c.name);
    if (!cols.includes("ultimaMissao"))   db.exec("ALTER TABLE rpg_personagem ADD COLUMN ultimaMissao INTEGER NOT NULL DEFAULT 0");
    if (!cols.includes("recuperandoAte")) db.exec("ALTER TABLE rpg_personagem ADD COLUMN recuperandoAte INTEGER NOT NULL DEFAULT 0");
    if (!cols.includes("missoesFeitas"))  db.exec("ALTER TABLE rpg_personagem ADD COLUMN missoesFeitas INTEGER NOT NULL DEFAULT 0");
  } catch (e) { console.error("[DB] migração missões:", e.message); }

  migrarTabelasGame();   // XP: game_* → xp_* (preserva os dados)

  console.info("[DB] Banco aberto em", DB_PATH);
  return db;
}

// ── Config (JSON por chave) ────────────────────────────────
export function lerConfig(serverId) {
  const row = prep("SELECT json FROM config WHERE serverId = ?").get(serverId);
  if (!row) return null;
  try { return JSON.parse(row.json); } catch { return null; }
}

export function gravarConfig(serverId, obj) {
  prep("INSERT OR REPLACE INTO config (serverId, json) VALUES (?, ?)")
    .run(serverId, JSON.stringify(obj));
}

export function listarServidoresConfig() {
  return prep("SELECT serverId FROM config").all().map((r) => r.serverId);
}

// ── Punições persistentes por (servidor, usuário) ──────────
// Sobrevivem a restart do bot E a sair/reentrar no servidor.

export function lerPunicao(serverId, userId) {
  return prep(
    "SELECT avisos, silenciado, silencioAte, motivo FROM punicoes WHERE serverId = ? AND userId = ?"
  ).get(serverId, userId) ?? null;
}

// Grava (cria ou atualiza) o estado de punição do usuário
export function gravarPunicao(serverId, userId, { avisos = 0, silenciado = 0, motivo = null, silencioAte = null }) {
  // `silencioAte` null preserva o valor que já estava lá: quem chama para
  // somar um aviso não deve, sem querer, apagar o prazo de um mute em curso.
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

// ── Silêncio com PRAZO ────────────────────────────────────
// A escada de punição precisa de mute temporário (5 min, 1 h). Guardar o
// vencimento no banco — e não num timer em memória — é o que faz o prazo
// sobreviver a reinício do bot: um mute de 1 hora não pode virar permanente
// só porque o processo caiu no meio.
export function silenciarAte(serverId, userId, ate, motivo = null) {
  const atual = lerPunicao(serverId, userId);
  gravarPunicao(serverId, userId, {
    avisos: atual?.avisos ?? 0,
    // Prazo 0 significa "sem prazo": aí o silêncio é permanente e a linha
    // não deve ficar marcada como silenciada por engano.
    silenciado: ate > 0 ? 1 : (atual?.silenciado ?? 0),
    motivo: motivo ?? atual?.motivo ?? null,
    silencioAte: ate ?? 0,
  });
}

export function silencioExpiraEm(serverId, userId) {
  return lerPunicao(serverId, userId)?.silencioAte ?? 0;
}

// Quem já cumpriu a pena — chamado periodicamente para devolver a voz.
export function silenciosVencidos(agora = Date.now()) {
  return prep(`SELECT serverId, userId, motivo FROM punicoes
    WHERE silenciado = 1 AND silencioAte > 0 AND silencioAte <= ?`).all(agora);
}

// ── Lista GLOBAL de banimentos (Fase 3) ────────────────────
// Cada linha é um ban num servidor. O mesmo usuário pode
// aparecer várias vezes (banido em vários servidores).
// `origem`: "automod" | "manual" | "importado"

export function registrarBanGlobal(userId, serverId, motivo, origem = "manual") {
  // evita duplicar o mesmo (usuário, servidor)
  const existe = prep(
    "SELECT id FROM bans_globais WHERE userId = ? AND serverId = ?"
  ).get(userId, serverId);
  if (existe) {
    prep("UPDATE bans_globais SET motivo = ?, origem = ?, criadoEm = ? WHERE id = ?")
      .run(motivo ?? null, origem, Date.now(), existe.id);
    return false;  // já constava
  }
  prep(
    "INSERT INTO bans_globais (userId, serverId, motivo, origem, criadoEm) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, serverId, motivo ?? null, origem, Date.now());
  return true;     // novo registro
}

// Histórico completo de um usuário (em quais servidores foi banido e por quê)
export function historicoBans(userId) {
  return prep(
    "SELECT serverId, motivo, origem, criadoEm FROM bans_globais WHERE userId = ? ORDER BY criadoEm DESC"
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
export function esquecerUsuario(userId) {
  const r = prep("DELETE FROM bans_globais WHERE userId = ?").run(userId);
  return r.changes ?? 0;
}

export function totalBansGlobais() {
  return prep("SELECT COUNT(*) AS n FROM bans_globais").get()?.n ?? 0;
}

export function usuariosBanidosDistintos() {
  return prep("SELECT COUNT(DISTINCT userId) AS n FROM bans_globais").get()?.n ?? 0;
}

// Quantos registros da lista global vieram DESTE servidor — usado pelo
// `&banglobal` para mostrar a contribuição do servidor sem precisar de
// nenhum comando de importação.
export function bansGlobaisDoServidor(serverId) {
  if (!serverId) return 0;
  return prep("SELECT COUNT(*) AS n FROM bans_globais WHERE serverId = ?").get(serverId)?.n ?? 0;
}

// ── Reaction roles ─────────────────────────────────────────
export function addReactionRole(serverId, messageId, emoji, roleId, channelId = null) {
  // herda o modo e o canal já definidos para esta mensagem
  const atual = prep("SELECT exclusivo, channelId FROM reaction_roles WHERE messageId = ? LIMIT 1").get(messageId);
  const exclusivo = atual?.exclusivo ?? 0;
  const canal = channelId ?? atual?.channelId ?? null;
  prep(`INSERT OR REPLACE INTO reaction_roles (serverId, messageId, emoji, roleId, exclusivo, channelId)
              VALUES (?, ?, ?, ?, ?, ?)`).run(serverId, messageId, emoji, roleId, exclusivo, canal);
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

export function isReactionRoleExclusivo(messageId) {
  const r = prep("SELECT exclusivo FROM reaction_roles WHERE messageId = ? LIMIT 1").get(messageId);
  return !!r?.exclusivo;
}

export function getReactionRole(messageId, emoji) {
  return prep("SELECT roleId, serverId FROM reaction_roles WHERE messageId = ? AND emoji = ?")
    .get(messageId, emoji) ?? null;
}

export function listReactionRoles(messageId) {
  return prep("SELECT emoji, roleId, exclusivo FROM reaction_roles WHERE messageId = ?").all(messageId);
}

export function listReactionRolesServidor(serverId) {
  return prep("SELECT messageId, emoji, roleId FROM reaction_roles WHERE serverId = ? ORDER BY messageId")
    .all(serverId);
}

export function removeReactionRolesMensagem(messageId) {
  const r = prep("DELETE FROM reaction_roles WHERE messageId = ?").run(messageId);
  return r.changes ?? 0;
}

// ── Curadoria RSS ──────────────────────────────────────────
export function addFeed(serverId, url, titulo) {
  const r = prep(`INSERT OR IGNORE INTO rss_feeds (serverId, url, titulo, criadoEm)
                        VALUES (?, ?, ?, ?)`).run(serverId, url, titulo ?? null, new Date().toISOString());
  return r.changes > 0;   // false se já existia
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
  return prep("SELECT id, url, titulo FROM rss_feeds WHERE serverId = ? ORDER BY id").all(serverId);
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

export function jaVisto(feedId, guid) {
  return !!prep("SELECT 1 FROM rss_vistos WHERE feedId = ? AND guid = ?").get(feedId, guid);
}

// Limpeza opcional: remove itens vistos com mais de N dias (evita crescer sem fim)
export function limparVistosAntigos(dias = 30) {
  const limite = new Date(Date.now() - dias * 864e5).toISOString();
  const r = prep("DELETE FROM rss_vistos WHERE vistoEm < ?").run(limite);
  return r.changes ?? 0;
}

// ── Game (XP / níveis) ─────────────────────────────────────
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

export function limparCargosNivel(serverId) {
  return prep("DELETE FROM xp_cargos WHERE serverId = ?").run(serverId).changes ?? 0;
}

// ── IA: memória por usuário (global) ───────────────────────
export function getMemoria(userId) {
  const r = prep("SELECT nome, fatos, atualizado FROM ia_memoria WHERE userId = ?").get(userId);
  if (!r) return { nome: null, fatos: [], atualizado: null };
  let fatos = [];
  try { fatos = JSON.parse(r.fatos || "[]"); } catch {}
  return { nome: r.nome, fatos, atualizado: r.atualizado };
}

export function setMemoria(userId, { nome, fatos }) {
  const fatosJson = JSON.stringify((fatos || []).slice(-20));  // guarda os últimos 20 fatos
  prep(`INSERT INTO ia_memoria (userId, nome, fatos, atualizado)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(userId) DO UPDATE SET nome = COALESCE(?, nome), fatos = ?, atualizado = ?`)
    .run(userId, nome ?? null, fatosJson, new Date().toISOString(), nome ?? null, fatosJson, new Date().toISOString());
}

export function limparMemoria(userId) {
  return prep("DELETE FROM ia_memoria WHERE userId = ?").run(userId).changes ?? 0;
}

// ── IA: histórico curto de conversa (continuidade) ─────────
export function addHistorico(userId, papel, conteudo) {
  prep("INSERT INTO ia_historico (userId, papel, conteudo, momento) VALUES (?, ?, ?, ?)")
    .run(userId, papel, conteudo.slice(0, 2000), new Date().toISOString());
  // mantém só as últimas 12 entradas (6 trocas) por usuário
  prep(`DELETE FROM ia_historico WHERE userId = ? AND rowid NOT IN (
    SELECT rowid FROM ia_historico WHERE userId = ? ORDER BY momento DESC LIMIT 12
  )`).run(userId, userId);
}

export function getHistorico(userId, limite = 6) {
  const linhas = prep(
    "SELECT papel, conteudo FROM ia_historico WHERE userId = ? ORDER BY momento DESC LIMIT ?"
  ).all(userId, limite * 2);
  return linhas.reverse();   // cronológico (mais antigo primeiro)
}

export function limparHistorico(userId) {
  return prep("DELETE FROM ia_historico WHERE userId = ?").run(userId).changes ?? 0;
}

// ── Memória de longo prazo: FATOS sobre pessoas ────────────
// Registra um fato observado. Se um fato muito parecido já existe (mesmo
// começo), reforça (sobe confiança, incrementa vezes) em vez de duplicar.
export function addFatoPessoa(serverId, userId, fato, confianca = 0.5, categoria = "geral") {
  const f = String(fato || "").trim();
  if (!f) return;
  const existentes = prep(
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
    prep("UPDATE ia_fatos_pessoa SET confianca = ?, vezes = vezes + 1, momento = ? WHERE id = ?")
      .run(novaConf, agora, parecido.id);
  } else {
    prep("INSERT INTO ia_fatos_pessoa (serverId, userId, fato, confianca, vezes, momento, categoria) VALUES (?, ?, ?, ?, 1, ?, ?)")
      .run(serverId, userId, f, confianca, agora, categoria);
  }
}

// Fatos de uma pessoa, dos mais confiáveis para os menos. `minConf` filtra ruído.
export function getFatosPessoa(serverId, userId, { limite = 12, minConf = 0.4 } = {}) {
  return prep(
    `SELECT fato, confianca, vezes, categoria, momento FROM ia_fatos_pessoa
     WHERE serverId = ? AND userId = ? AND confianca >= ?
     ORDER BY confianca DESC, vezes DESC, momento DESC LIMIT ?`
  ).all(serverId, userId, minConf, limite);
}

export function limparFatosPessoa(serverId, userId) {
  return prep("DELETE FROM ia_fatos_pessoa WHERE serverId = ? AND userId = ?")
    .run(serverId, userId).changes ?? 0;
}

// ── Perfil do usuário (cartão: bio, grupos, jogos, status + flag de cuidado) ──
export function getPerfil(serverId, userId) {
  return prep("SELECT * FROM ia_perfil WHERE serverId = ? AND userId = ?").get(serverId, userId) || null;
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
  prep(`INSERT INTO ia_perfil (serverId, userId, nome, bio, grupos, jogos, status, entrou, cuidado, atualizado)
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
  const f = prep("DELETE FROM ia_fatos_pessoa WHERE serverId = ? AND userId = ?").run(serverId, userId).changes ?? 0;
  const p = prep("DELETE FROM ia_perfil WHERE serverId = ? AND userId = ?").run(serverId, userId).changes ?? 0;
  let h = 0, m = 0;
  try { h = prep("DELETE FROM ia_historico WHERE userId = ?").run(userId).changes ?? 0; } catch {}
  try { m = prep("DELETE FROM ia_memoria WHERE userId = ?").run(userId).changes ?? 0; } catch {}
  return { fatos: f, perfil: p, historico: h, memoria: m };
}

// Apaga TODA a memória da IA no servidor (fatos de pessoas, de servidor, perfis).
export function apagarMemoriaServidor(serverId) {
  const fp = prep("DELETE FROM ia_fatos_pessoa WHERE serverId = ?").run(serverId).changes ?? 0;
  const fs = prep("DELETE FROM ia_fatos_servidor WHERE serverId = ?").run(serverId).changes ?? 0;
  const pf = prep("DELETE FROM ia_perfil WHERE serverId = ?").run(serverId).changes ?? 0;
  return { fatosPessoa: fp, fatosServidor: fs, perfis: pf };
}

// ── Memória de longo prazo: FATOS sobre o servidor ─────────
export function addFatoServidor(serverId, fato, confianca = 0.5) {
  const f = String(fato || "").trim();
  if (!f) return;
  const existentes = prep(
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
    prep("UPDATE ia_fatos_servidor SET confianca = ?, vezes = vezes + 1, momento = ? WHERE id = ?")
      .run(novaConf, agora, parecido.id);
  } else {
    prep("INSERT INTO ia_fatos_servidor (serverId, fato, confianca, vezes, momento) VALUES (?, ?, ?, 1, ?)")
      .run(serverId, f, confianca, agora);
  }
}

export function getFatosServidor(serverId, { limite = 15, minConf = 0.4 } = {}) {
  return prep(
    `SELECT fato, confianca, vezes FROM ia_fatos_servidor
     WHERE serverId = ? AND confianca >= ?
     ORDER BY confianca DESC, vezes DESC, momento DESC LIMIT ?`
  ).all(serverId, minConf, limite);
}


// Migração: as tabelas de XP se chamavam game_* (o nome "game" passou a ser do
// RPG). Renomeamos preservando os dados — ninguém perde o XP acumulado.
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

// ══════════════════════════════════════════════════════════
//  RPG — personagem
// ══════════════════════════════════════════════════════════
export const ATRIBUTOS = ["forca", "destreza", "resistencia", "agilidade",
  "vida", "mana", "inteligencia", "sorte", "carisma"];

export function getPersonagem(serverId, userId) {
  return prep("SELECT * FROM rpg_personagem WHERE serverId = ? AND userId = ?")
    .get(serverId, userId) ?? null;
}

export function criarPersonagem(serverId, userId, nome) {
  prep(`INSERT INTO rpg_personagem (serverId, userId, nome, criadoEm)
              VALUES (?, ?, ?, ?)`).run(serverId, userId, nome ?? null, Date.now());
  return getPersonagem(serverId, userId);
}

// Grava campos avulsos. Só aceita colunas conhecidas — nada de SQL montado
// com nome vindo do usuário.
const COLUNAS_OK = new Set([...ATRIBUTOS, "nome", "nivel", "xp", "pontos",
  "ultimaMissao", "recuperandoAte", "missoesFeitas"]);
export function salvarPersonagem(serverId, userId, campos = {}) {
  const entradas = Object.entries(campos).filter(([k]) => COLUNAS_OK.has(k));
  if (!entradas.length) return getPersonagem(serverId, userId);
  const sets = entradas.map(([k]) => `${k} = ?`).join(", ");
  prep(`UPDATE rpg_personagem SET ${sets} WHERE serverId = ? AND userId = ?`)
    .run(...entradas.map(([, v]) => v), serverId, userId);
  return getPersonagem(serverId, userId);
}

export function apagarPersonagem(serverId, userId) {
  return prep("DELETE FROM rpg_personagem WHERE serverId = ? AND userId = ?")
    .run(serverId, userId).changes ?? 0;
}

export function listarPersonagens(serverId, limite = 10) {
  return prep(`SELECT userId, nome, nivel, xp FROM rpg_personagem
    WHERE serverId = ? ORDER BY nivel DESC, xp DESC LIMIT ?`).all(serverId, limite);
}

// ══════════════════════════════════════════════════════════
//  RPG — itens, inventário e equipamento
// ══════════════════════════════════════════════════════════
export const SLOTS = ["arma", "capacete", "armadura", "acessorio1", "acessorio2", "acessorio3"];

// ── Mochila do companheiro ────────────────────────────────
// Capacidade pequena de propósito: escolher o que dar é a decisão
// interessante; carregar tudo não seria.
export const FOLLOWER_MOCHILA = 2;

export function itensDoFollower(followerId) {
  const linhas = prep(`SELECT itemId FROM rpg_follower_itens
    WHERE followerId = ? ORDER BY criadoEm`).all(followerId);
  return linhas.map((l) => getItem(l.itemId)).filter(Boolean);
}
export function darItemAoFollower(followerId, itemId) {
  prep(`INSERT OR IGNORE INTO rpg_follower_itens (followerId, itemId, criadoEm)
    VALUES (?, ?, ?)`).run(followerId, itemId, Date.now());
  return true;
}
export function tirarItemDoFollower(followerId, itemId) {
  return prep(`DELETE FROM rpg_follower_itens WHERE followerId = ? AND itemId = ?`)
    .run(followerId, itemId).changes;
}
export function limparItensDoFollower(followerId) {
  return prep(`DELETE FROM rpg_follower_itens WHERE followerId = ?`).run(followerId).changes;
}

// ── Magias do jogador ─────────────────────────────────────
export function aprenderMagia(serverId, userId, magiaId) {
  prep(`INSERT OR IGNORE INTO rpg_magias (serverId, userId, magiaId, criadoEm)
    VALUES (?, ?, ?, ?)`).run(serverId, userId, magiaId, Date.now());
  return true;
}
export function listarMagias(serverId, userId) {
  return prep(`SELECT magiaId, criadoEm FROM rpg_magias
    WHERE serverId = ? AND userId = ? ORDER BY criadoEm`).all(serverId, userId);
}
export function temMagia(serverId, userId, magiaId) {
  return !!prep(`SELECT 1 FROM rpg_magias WHERE serverId = ? AND userId = ? AND magiaId = ?`)
    .get(serverId, userId, magiaId);
}
export function esquecerMagia(serverId, userId, magiaId) {
  return prep(`DELETE FROM rpg_magias WHERE serverId = ? AND userId = ? AND magiaId = ?`)
    .run(serverId, userId, magiaId).changes;
}
export function limparMagias(serverId, userId = null) {
  return userId
    ? prep(`DELETE FROM rpg_magias WHERE serverId = ? AND userId = ?`).run(serverId, userId).changes
    : prep(`DELETE FROM rpg_magias WHERE serverId = ?`).run(serverId).changes;
}
export const RARIDADES = ["comum", "incomum", "raro", "epico", "lendario"];

// ── Catálogo ──
export function upsertItem(item) {
  prep(`INSERT INTO rpg_itens (id, nome, slot, raridade, bonus, origem, infinito, precoBase, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      nome=excluded.nome, slot=excluded.slot, raridade=excluded.raridade,
      bonus=excluded.bonus, origem=excluded.origem,
      infinito=excluded.infinito, precoBase=excluded.precoBase`)
    .run(item.id, item.nome, item.slot, item.raridade,
         JSON.stringify(item.bonus ?? {}), item.origem ?? "generico",
         item.infinito ? 1 : 0, item.precoBase ?? 10);
}

function hidratarItem(r) {
  if (!r) return null;
  let bonus = {};
  try { bonus = JSON.parse(r.bonus ?? "{}"); } catch {}
  return { ...r, bonus, infinito: !!r.infinito, ativo: !!r.ativo };
}

export function getItem(id) {
  return hidratarItem(prep("SELECT * FROM rpg_itens WHERE id = ?").get(id));
}

export function acharItemPorNome(txt) {
  const alvo = String(txt ?? "").trim().toLowerCase();
  if (!alvo) return null;
  const todos = prep("SELECT * FROM rpg_itens").all().map(hidratarItem);
  return todos.find((i) => i.nome.toLowerCase() === alvo)
      ?? todos.find((i) => i.nome.toLowerCase().includes(alvo))
      ?? null;
}

export function listarItens({ slot = null, raridade = null, apenasAtivos = true } = {}) {
  let sql = "SELECT * FROM rpg_itens WHERE 1=1";
  const p = [];
  if (apenasAtivos) sql += " AND ativo = 1";
  if (slot) { sql += " AND slot = ?"; p.push(slot); }
  if (raridade) { sql += " AND raridade = ?"; p.push(raridade); }
  sql += " ORDER BY raridade, nome";
  return prep(sql).all(...p).map(hidratarItem);
}

// Descontinuar em vez de apagar: quem já tem, continua tendo.
export function descontinuarItem(id) {
  return prep("UPDATE rpg_itens SET ativo = 0 WHERE id = ?").run(id).changes ?? 0;
}

// ── Inventário ──
export function darItem(serverId, userId, itemId, qtd = 1) {
  prep(`INSERT INTO rpg_inventario (serverId, userId, itemId, quantidade)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(serverId, userId, itemId) DO UPDATE SET quantidade = quantidade + excluded.quantidade`)
    .run(serverId, userId, itemId, qtd);
}

export function tirarItem(serverId, userId, itemId, qtd = 1) {
  const atual = prep("SELECT quantidade FROM rpg_inventario WHERE serverId=? AND userId=? AND itemId=?")
    .get(serverId, userId, itemId)?.quantidade ?? 0;
  if (atual <= qtd) {
    prep("DELETE FROM rpg_inventario WHERE serverId=? AND userId=? AND itemId=?")
      .run(serverId, userId, itemId);
    return atual;
  }
  prep("UPDATE rpg_inventario SET quantidade = quantidade - ? WHERE serverId=? AND userId=? AND itemId=?")
    .run(qtd, serverId, userId, itemId);
  return qtd;
}

export function getInventario(serverId, userId) {
  const linhas = prep("SELECT itemId, quantidade FROM rpg_inventario WHERE serverId=? AND userId=?")
    .all(serverId, userId);
  return linhas.map((l) => ({ ...getItem(l.itemId), quantidade: l.quantidade }))
    .filter((x) => x.id);
}

export function temItem(serverId, userId, itemId) {
  return (prep("SELECT quantidade FROM rpg_inventario WHERE serverId=? AND userId=? AND itemId=?")
    .get(serverId, userId, itemId)?.quantidade ?? 0) > 0;
}

// ── Equipamento ──
export function equipar(serverId, userId, slot, itemId) {
  prep(`INSERT INTO rpg_equipado (serverId, userId, slot, itemId) VALUES (?, ?, ?, ?)
    ON CONFLICT(serverId, userId, slot) DO UPDATE SET itemId = excluded.itemId`)
    .run(serverId, userId, slot, itemId);
}

export function desequipar(serverId, userId, slot) {
  return prep("DELETE FROM rpg_equipado WHERE serverId=? AND userId=? AND slot=?")
    .run(serverId, userId, slot).changes ?? 0;
}

export function getEquipado(serverId, userId) {
  const linhas = prep("SELECT slot, itemId FROM rpg_equipado WHERE serverId=? AND userId=?")
    .all(serverId, userId);
  const out = {};
  for (const l of linhas) {
    const item = getItem(l.itemId);
    if (item) out[l.slot] = item;
  }
  return out;
}

// Onde este item está equipado (se estiver)
export function slotDoItem(serverId, userId, itemId) {
  return prep("SELECT slot FROM rpg_equipado WHERE serverId=? AND userId=? AND itemId=?")
    .get(serverId, userId, itemId)?.slot ?? null;
}

// ══════════════════════════════════════════════════════════
//  RPG — followers
// ══════════════════════════════════════════════════════════
export function upsertFollowerCatalogo(f) {
  prep(`INSERT INTO rpg_followers_catalogo (id, nome, classe, raridade, preco, soDungeon, fotos, origem, ativo)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT fotos FROM rpg_followers_catalogo WHERE id = ?), '[]'), ?, 1)
    ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, classe=excluded.classe,
      raridade=excluded.raridade, preco=excluded.preco, soDungeon=excluded.soDungeon,
      origem=excluded.origem`)
    .run(f.id, f.nome, f.classe, f.raridade, f.preco ?? 0, f.soDungeon ? 1 : 0, f.id, f.origem ?? "generico");
}

function hidratarFollower(r) {
  if (!r) return null;
  let fotos = [];
  try { fotos = JSON.parse(r.fotos ?? "[]"); } catch {}
  return { ...r, fotos, soDungeon: !!r.soDungeon, ativo: !!r.ativo };
}

export function getFollowerCatalogo(id) {
  return hidratarFollower(prep("SELECT * FROM rpg_followers_catalogo WHERE id = ?").get(id));
}

export function acharFollowerCatalogo(txt) {
  const alvo = String(txt ?? "").trim().toLowerCase();
  if (!alvo) return null;
  const todos = prep("SELECT * FROM rpg_followers_catalogo WHERE ativo = 1").all().map(hidratarFollower);
  return todos.find((f) => f.id === alvo)
      ?? todos.find((f) => f.nome.toLowerCase() === alvo)
      ?? todos.find((f) => f.nome.toLowerCase().includes(alvo))
      ?? null;
}

export function listarFollowersCatalogo({ soVendidos = false } = {}) {
  let sql = "SELECT * FROM rpg_followers_catalogo WHERE ativo = 1";
  if (soVendidos) sql += " AND soDungeon = 0 AND preco > 0";
  return prep(sql + " ORDER BY raridade, nome").all().map(hidratarFollower);
}

// ── Fotos (álbum) ──
export function setFotosFollower(catalogoId, fotos) {
  return prep("UPDATE rpg_followers_catalogo SET fotos = ? WHERE id = ?")
    .run(JSON.stringify(fotos ?? []), catalogoId).changes ?? 0;
}

export function addFotoFollower(catalogoId, url) {
  const f = getFollowerCatalogo(catalogoId);
  if (!f) return 0;
  const fotos = [...f.fotos, url];
  return setFotosFollower(catalogoId, fotos);
}

// ── Instâncias ──
export function recrutarFollower(serverId, donoId, catalogoId, nivel = 1) {
  const r = prep(`INSERT INTO rpg_followers (serverId, donoId, catalogoId, nivel, energia, energiaEm, donoOriginal)
    VALUES (?, ?, ?, ?, 5, ?, ?)`).run(serverId, donoId, catalogoId, nivel, Date.now(), donoId);
  return getFollower(r.lastInsertRowid);
}

export function getFollower(id) {
  return prep("SELECT * FROM rpg_followers WHERE id = ?").get(id) ?? null;
}

export function listarFollowersDe(serverId, donoId) {
  return prep("SELECT * FROM rpg_followers WHERE serverId=? AND donoId=? AND capturado=0 ORDER BY naParty DESC, nivel DESC")
    .all(serverId, donoId);
}

export function getParty(serverId, donoId) {
  return prep("SELECT * FROM rpg_followers WHERE serverId=? AND donoId=? AND naParty=1 AND capturado=0")
    .all(serverId, donoId);
}

const CAMPOS_FOLLOWER = new Set(["nivel", "energia", "energiaEm", "naParty", "capturado", "donoId", "capturadoEm"]);
export function salvarFollower(id, campos = {}) {
  const e = Object.entries(campos).filter(([k]) => CAMPOS_FOLLOWER.has(k));
  if (!e.length) return getFollower(id);
  prep(`UPDATE rpg_followers SET ${e.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...e.map(([, v]) => v), id);
  return getFollower(id);
}

export function dispensarFollower(id) {
  return prep("DELETE FROM rpg_followers WHERE id = ?").run(id).changes ?? 0;
}

// ── Dungeon: followers capturados ──
export function capturarFollower(id) {
  const f = getFollower(id);
  if (!f) return null;
  prep("UPDATE rpg_followers SET capturado=1, naParty=0, donoId=NULL, capturadoEm=? WHERE id=?")
    .run(Date.now(), id);
  return getFollower(id);
}

export function listarCapturados(serverId) {
  return prep("SELECT * FROM rpg_followers WHERE serverId=? AND capturado=1 ORDER BY capturadoEm")
    .all(serverId);
}

export function resgatarFollower(id, novoDono) {
  prep("UPDATE rpg_followers SET capturado=0, donoId=?, capturadoEm=0, energia=1, energiaEm=? WHERE id=?")
    .run(novoDono, Date.now(), id);
  return getFollower(id);
}

// ══════════════════════════════════════════════════════════
//  RPG — economia
// ══════════════════════════════════════════════════════════
export function upsertMoeda(serverId, m) {
  prep(`INSERT INTO rpg_moedas
    (serverId, id, nome, simbolo, finita, mercado, dungeon, pSuave, pEm, padrao,
     dificuldade, suprimentoBase, nivelMin)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0.5, ?, ?, ?, ?, ?)
    ON CONFLICT(serverId, id) DO UPDATE SET nome=excluded.nome, simbolo=excluded.simbolo,
      finita=excluded.finita, padrao=excluded.padrao, dificuldade=excluded.dificuldade,
      suprimentoBase=excluded.suprimentoBase, nivelMin=excluded.nivelMin`)
    .run(serverId, m.id, m.nome, m.simbolo ?? "🪙", m.finita === false ? 0 : 1,
         m.mercado ?? m.suprimentoBase ?? 10000, Date.now(), m.padrao ? 1 : 0,
         m.dificuldade ?? 1, m.suprimentoBase ?? 10000, m.nivelMin ?? 1);
  return getMoeda(serverId, m.id);
}

export function removerMoeda(serverId, id) {
  prep("DELETE FROM rpg_carteira WHERE serverId=? AND moedaId=?").run(serverId, id);
  return prep("DELETE FROM rpg_moedas WHERE serverId=? AND id=?").run(serverId, id).changes ?? 0;
}

export function getMoeda(serverId, id) {
  return prep("SELECT * FROM rpg_moedas WHERE serverId=? AND id=?").get(serverId, id) ?? null;
}

export function listarMoedas(serverId) {
  return prep("SELECT * FROM rpg_moedas WHERE serverId=? ORDER BY padrao DESC, nome").all(serverId);
}

export function moedaPadrao(serverId) {
  return prep("SELECT * FROM rpg_moedas WHERE serverId=? ORDER BY padrao DESC LIMIT 1").get(serverId) ?? null;
}

export function acharMoeda(serverId, txt) {
  // Sem acento e em minúsculas dos dois lados: ninguém digita "Dólar" com
  // acento no meio de um comando, e errar por isso seria só atrito.
  const semAcento = (x) => String(x ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const alvo = semAcento(txt);
  if (!alvo) return moedaPadrao(serverId);
  const todas = listarMoedas(serverId);
  return todas.find((m) => semAcento(m.id) === alvo)
      ?? todas.find((m) => semAcento(m.nome) === alvo)
      ?? todas.find((m) => semAcento(m.nome).includes(alvo))
      ?? null;
}

const CAMPOS_MOEDA = new Set(["mercado", "dungeon", "pSuave", "pEm", "nome", "simbolo",
  "finita", "padrao", "dificuldade", "suprimentoBase", "nivelMin"]);
// ── Moedas duplicadas ─────────────────────────────────────
// Dois conjuntos prontos podem trazer a MESMA moeda com ids diferentes
// (`mundo` traz Prata como `xag`, `fantasia` como `prata`). Sem colisão de
// id, as duas eram criadas e a carteira mostrava "Prata" duas vezes.
//
// A fusão é a operação segura: em vez de apagar uma e sumir com o saldo de
// quem já tinha, os saldos são somados na que fica e os estoques também.
export function moedasDuplicadas(serverId) {
  const semAcento = (x) => String(x ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const porNome = new Map();
  for (const m of listarMoedas(serverId)) {
    const chave = semAcento(m.nome);
    if (!porNome.has(chave)) porNome.set(chave, []);
    porNome.get(chave).push(m);
  }
  const grupos = [];
  for (const [, lista] of porNome) {
    if (lista.length < 2) continue;
    // Quem fica: a padrão primeiro (é a que precifica tudo); depois a que as
    // pessoas mais têm na carteira — manter a moeda em uso significa menos
    // referências para reescrever e menos estranheza para quem joga. O
    // suprimento só desempata quando ninguém tem nenhuma das duas.
    const ordenada = [...lista].sort((a, b) =>
      (b.padrao ? 1 : 0) - (a.padrao ? 1 : 0)
      || totalNasCarteiras(serverId, b.id) - totalNasCarteiras(serverId, a.id)
      || (b.suprimentoBase ?? 0) - (a.suprimentoBase ?? 0));
    grupos.push({ fica: ordenada[0], some: ordenada.slice(1) });
  }
  return grupos;
}

// Executa a fusão. Devolve o relatório do que foi feito.
export function fundirMoedasDuplicadas(serverId) {
  const grupos = moedasDuplicadas(serverId);
  const feitos = [];
  for (const g of grupos) {
    let saldosMovidos = 0, usuarios = 0;
    for (const velha of g.some) {
      const linhas = prep(`SELECT userId, quantidade FROM rpg_carteira
        WHERE serverId = ? AND moedaId = ? AND quantidade > 0`).all(serverId, velha.id);
      for (const l of linhas) {
        creditar(serverId, l.userId, g.fica.id, l.quantidade);
        saldosMovidos += l.quantidade;
        usuarios++;
      }
      // O estoque do banco e o pote da dungeon também se somam: são valor
      // que existe no servidor e não pode evaporar.
      salvarMoeda(serverId, g.fica.id, {
        mercado: (getMoeda(serverId, g.fica.id)?.mercado ?? 0) + (velha.mercado ?? 0),
        dungeon: (getMoeda(serverId, g.fica.id)?.dungeon ?? 0) + (velha.dungeon ?? 0),
      });
      // Ofertas abertas apontam para a moeda que fica, em vez de serem
      // apagadas: elas guardam valor em CUSTÓDIA, e apagá-las sumiria com o
      // que já saiu da carteira de quem anunciou.
      prep(`UPDATE rpg_ofertas SET moedaOferecida = ?
        WHERE serverId = ? AND moedaOferecida = ?`).run(g.fica.id, serverId, velha.id);
      prep(`UPDATE rpg_ofertas SET moedaPedida = ?
        WHERE serverId = ? AND moedaPedida = ?`).run(g.fica.id, serverId, velha.id);
      removerMoeda(serverId, velha.id);
    }
    feitos.push({
      nome: g.fica.nome, ficou: g.fica.id,
      sumiram: g.some.map((x) => x.id), saldosMovidos, usuarios,
    });
  }
  return feitos;
}

// Servidores que têm alguma moeda — o universo que a fusão precisa varrer.
export function servidoresComMoeda() {
  return prep("SELECT DISTINCT serverId FROM rpg_moedas").all().map((r) => r.serverId);
}

// Já existe uma moeda com esse NOME? (a checagem que faltava)
export function acharMoedaPorNome(serverId, nome) {
  const semAcento = (x) => String(x ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const alvo = semAcento(nome);
  return listarMoedas(serverId).find((m) => semAcento(m.nome) === alvo) ?? null;
}

export function salvarMoeda(serverId, id, campos = {}) {
  const e = Object.entries(campos).filter(([k]) => CAMPOS_MOEDA.has(k));
  if (!e.length) return getMoeda(serverId, id);
  prep(`UPDATE rpg_moedas SET ${e.map(([k]) => `${k} = ?`).join(", ")} WHERE serverId=? AND id=?`)
    .run(...e.map(([, v]) => v), serverId, id);
  return getMoeda(serverId, id);
}

// ── Carteira ──
export function getSaldo(serverId, userId, moedaId) {
  return prep("SELECT quantidade FROM rpg_carteira WHERE serverId=? AND userId=? AND moedaId=?")
    .get(serverId, userId, moedaId)?.quantidade ?? 0;
}

export function creditar(serverId, userId, moedaId, qtd) {
  prep(`INSERT INTO rpg_carteira (serverId, userId, moedaId, quantidade) VALUES (?, ?, ?, ?)
    ON CONFLICT(serverId, userId, moedaId) DO UPDATE SET quantidade = quantidade + excluded.quantidade`)
    .run(serverId, userId, moedaId, qtd);
  return getSaldo(serverId, userId, moedaId);
}

export function debitar(serverId, userId, moedaId, qtd) {
  const atual = getSaldo(serverId, userId, moedaId);
  const tirar = Math.min(atual, qtd);
  if (tirar <= 0) return 0;
  prep("UPDATE rpg_carteira SET quantidade = quantidade - ? WHERE serverId=? AND userId=? AND moedaId=?")
    .run(tirar, serverId, userId, moedaId);
  return tirar;
}

export function carteiraDe(serverId, userId) {
  return prep("SELECT moedaId, quantidade FROM rpg_carteira WHERE serverId=? AND userId=? AND quantidade > 0")
    .all(serverId, userId);
}

// Quanto TODOS os jogadores têm dessa moeda — numerador do P.
export function totalNasCarteiras(serverId, moedaId) {
  return prep("SELECT COALESCE(SUM(quantidade),0) AS t FROM rpg_carteira WHERE serverId=? AND moedaId=?")
    .get(serverId, moedaId)?.t ?? 0;
}

// ── Estoque de itens no mercado ──
export function getEstoque(serverId, itemId) {
  return prep("SELECT * FROM rpg_estoque WHERE serverId=? AND itemId=?").get(serverId, itemId) ?? null;
}

export function setEstoque(serverId, itemId, quantidade, base = null) {
  const atual = getEstoque(serverId, itemId);
  prep(`INSERT INTO rpg_estoque (serverId, itemId, quantidade, base) VALUES (?, ?, ?, ?)
    ON CONFLICT(serverId, itemId) DO UPDATE SET quantidade=excluded.quantidade, base=excluded.base`)
    .run(serverId, itemId, Math.max(0, quantidade), base ?? atual?.base ?? 10);
  return getEstoque(serverId, itemId);
}

export function ajustarEstoque(serverId, itemId, delta) {
  const e = getEstoque(serverId, itemId);
  const base = e?.base ?? 10;
  return setEstoque(serverId, itemId, Math.max(0, (e?.quantidade ?? base) + delta), base);
}

// ══════════════════════════════════════════════════════════
//  RPG — ofertas do mercado entre jogadores
// ══════════════════════════════════════════════════════════
export function criarOferta(o) {
  const r = prep(`INSERT INTO rpg_ofertas
    (serverId, tipo, autorId, alvoId, itemOferecido, moedaOferecida, qtdOferecida,
     itemPedido, moedaPedida, qtdPedida, estado, criadoEm)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?)`)
    .run(o.serverId, o.tipo, o.autorId, o.alvoId ?? null,
         o.itemOferecido ?? null, o.moedaOferecida ?? null, o.qtdOferecida ?? 0,
         o.itemPedido ?? null, o.moedaPedida ?? null, o.qtdPedida ?? 0, Date.now());
  return getOferta(r.lastInsertRowid);
}

export function getOferta(id) {
  return prep("SELECT * FROM rpg_ofertas WHERE id = ?").get(id) ?? null;
}

export function listarOfertas(serverId, { tipo = null, autorId = null, alvoId = null } = {}) {
  let sql = "SELECT * FROM rpg_ofertas WHERE serverId=? AND estado='aberta'";
  const p = [serverId];
  if (tipo) { sql += " AND tipo=?"; p.push(tipo); }
  if (autorId) { sql += " AND autorId=?"; p.push(autorId); }
  if (alvoId) { sql += " AND (alvoId=? OR alvoId IS NULL)"; p.push(alvoId); }
  return prep(sql + " ORDER BY id DESC LIMIT 50").all(...p);
}

export function fecharOferta(id, estado = "fechada", valorFinal = 0) {
  prep("UPDATE rpg_ofertas SET estado=?, valorFinal=?, fechadoEm=? WHERE id=?")
    .run(estado, valorFinal, Date.now(), id);
  return getOferta(id);
}

// Volume negociado na última hora — alimenta a taxa dinâmica.
export function volumeRecente(serverId, janelaMs = 3600_000) {
  return prep(`SELECT COALESCE(SUM(valorFinal),0) AS v FROM rpg_ofertas
    WHERE serverId=? AND estado='fechada' AND fechadoEm > ?`)
    .get(serverId, Date.now() - janelaMs)?.v ?? 0;
}

// ── Acesso cru ─────────────────────────────────────────────
export function getDb() {
  return db;
}
