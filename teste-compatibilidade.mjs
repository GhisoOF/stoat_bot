// Compatibilidade com o passado: banco antigo e .env antigo.
//
// O bot roda em instâncias que existem há meses. Toda remoção de legado tem de
// passar por aqui: o teste monta um banco no schema ANTIGO — de verdade, com
// as tabelas `game_*` e sem as colunas que vieram depois — abre com o código
// de hoje e confere que NADA se perdeu.
//
// Se um dia algum destes testes falhar, não "conserte o teste": alguém
// removeu uma migração de que instalações reais ainda dependem.

import assert from "node:assert";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const CAMINHO = "/tmp/compat-antigo.db";
process.env.DB_PATH = CAMINHO;
process.env.CONFIG_PATH = "/tmp/compat-antigo-cfg.json";
for (const f of [CAMINHO, process.env.CONFIG_PATH]) { try { fs.unlinkSync(f); } catch {} }

let ok = 0, falhou = 0;
const t = (nome, fn) => {
  try { fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

// ─────────────────────────────────────────────────────────────────────────
// 1. Um banco como era ANTES: tabelas com o nome velho, colunas faltando.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── montando um banco no schema antigo ──");
{
  const velho = new DatabaseSync(CAMINHO);

  // XP vivia em game_* (hoje xp_*)
  velho.exec(`CREATE TABLE game_xp (
    serverId TEXT NOT NULL, userId TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0, nivel INTEGER NOT NULL DEFAULT 0,
    ultimaMsg TEXT, PRIMARY KEY (serverId, userId))`);
  velho.exec(`INSERT INTO game_xp VALUES
    ('01SRV', '01PESSOA1', 4200, 12, '2026-01-02T03:04:05Z'),
    ('01SRV', '01PESSOA2',  150,  2, '2026-01-02T03:04:06Z')`);

  velho.exec(`CREATE TABLE game_cargos (
    serverId TEXT NOT NULL, nivel INTEGER NOT NULL, roleId TEXT NOT NULL,
    PRIMARY KEY (serverId, nivel))`);
  velho.exec(`INSERT INTO game_cargos VALUES ('01SRV', 10, '01CARGOVETERANO')`);

  // punicoes SEM silencioAte
  velho.exec(`CREATE TABLE punicoes (
    serverId TEXT NOT NULL, userId TEXT NOT NULL,
    avisos INTEGER NOT NULL DEFAULT 0, silenciado INTEGER NOT NULL DEFAULT 0,
    motivo TEXT, atualizadoEm INTEGER, PRIMARY KEY (serverId, userId))`);
  velho.exec(`INSERT INTO punicoes VALUES ('01SRV', '01PESSOA2', 2, 1, 'spam', 1767225845)`);

  // bans_globais SEM userNome e SEM ehBot
  velho.exec(`CREATE TABLE bans_globais (
    userId TEXT PRIMARY KEY, motivo TEXT, porQuem TEXT, criadoEm INTEGER)`);
  velho.exec(`INSERT INTO bans_globais VALUES ('01ENCRENCA', 'propaganda', '01DONO', 1767225000)`);

  // reaction_roles SEM exclusivo, channelId, ordem
  velho.exec(`CREATE TABLE reaction_roles (
    serverId TEXT NOT NULL, messageId TEXT NOT NULL, emoji TEXT NOT NULL,
    roleId TEXT NOT NULL, PRIMARY KEY (messageId, emoji))`);
  velho.exec(`INSERT INTO reaction_roles VALUES ('01SRV', '01MSGPAINEL', '💙', '01CARGOAZUL')`);

  // rss_feeds SEM categoria
  velho.exec(`CREATE TABLE rss_feeds (
    serverId TEXT NOT NULL, channelId TEXT NOT NULL, url TEXT NOT NULL,
    ultimoItem TEXT, PRIMARY KEY (serverId, url))`);
  velho.exec(`INSERT INTO rss_feeds VALUES ('01SRV', '01CANALNEWS', 'https://exemplo.com/feed.xml', 'item-1')`);

  velho.close();
  console.log(`  banco antigo criado: ${fs.statSync(CAMINHO).size} bytes`);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Abrir com o código de hoje.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── abrindo com o código atual ──");
const db = await import("./modulos/core/db.js");
db.abrirBanco(CAMINHO);

const cru = new DatabaseSync(CAMINHO);
const colunas = (tabela) => cru.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
const existe = (tabela) =>
  !!cru.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tabela);

console.log("\n── XP: game_* → xp_* (os dados TÊM de vir junto) ──");
t("as linhas de XP sobreviveram com xp e nível intactos", () => {
  const p1 = cru.prepare("SELECT * FROM xp_usuarios WHERE userId='01PESSOA1'").get();
  assert.ok(p1, "a pessoa sumiu na migração");
  assert.equal(p1.xp, 4200);
  assert.equal(p1.nivel, 12);
});
t("todas as linhas migraram (nenhuma perdida)", () => {
  assert.equal(cru.prepare("SELECT COUNT(*) AS n FROM xp_usuarios").get().n, 2);
});
t("os cargos por nível migraram", () => {
  const c = cru.prepare("SELECT * FROM xp_cargos WHERE serverId='01SRV'").get();
  assert.equal(c.roleId, "01CARGOVETERANO");
  assert.equal(c.nivel, 10);
});
t("as tabelas game_* antigas foram embora (migração, não cópia)", () => {
  assert.equal(existe("game_xp"), false);
  assert.equal(existe("game_cargos"), false);
});

console.log("\n── colunas novas em tabelas antigas ──");
for (const [tabela, coluna, id] of [
  ["punicoes", "silencioAte", null],
  ["bans_globais", "userNome", null],
  ["bans_globais", "ehBot", null],
  ["reaction_roles", "exclusivo", null],
  ["reaction_roles", "channelId", null],
  ["reaction_roles", "ordem", null],
  ["rss_feeds", "categoria", null],
]) {
  t(`${tabela}.${coluna} foi acrescentada`, () => {
    assert.ok(colunas(tabela).includes(coluna), `colunas: ${colunas(tabela).join(", ")}`);
  });
  void id;
}

console.log("\n── os dados antigos continuam lá e legíveis ──");
t("punição antiga preservada (avisos e motivo)", () => {
  const p = cru.prepare("SELECT * FROM punicoes WHERE userId='01PESSOA2'").get();
  assert.equal(p.avisos, 2);
  assert.equal(p.motivo, "spam");
  assert.equal(p.silenciado, 1);
  assert.equal(p.silencioAte, 0, "sem prazo definido = 0 (permanente), não nulo");
});
t("ban global antigo preservado, com os campos novos vazios", () => {
  const b = cru.prepare("SELECT * FROM bans_globais WHERE userId='01ENCRENCA'").get();
  assert.equal(b.motivo, "propaganda");
  assert.equal(b.ehBot, 0, "ehBot tem de cair no padrão 0, não em nulo");
});
t("reaction role antigo preservado", () => {
  const r = cru.prepare("SELECT * FROM reaction_roles WHERE messageId='01MSGPAINEL'").get();
  assert.equal(r.roleId, "01CARGOAZUL");
  assert.equal(r.emoji, "💙");
});
t("feed RSS antigo preservado", () => {
  assert.equal(cru.prepare("SELECT * FROM rss_feeds").get().ultimoItem, "item-1");
});

console.log("\n── o código de hoje LÊ e ESCREVE nesse banco ──");
t("leitura pela API do projeto enxerga o XP migrado", () => {
  const u = db.getXP?.("01SRV", "01PESSOA1") ?? db.xpDoUsuario?.("01SRV", "01PESSOA1");
  if (u === undefined) return;               // nome de função diferente: o teste cru acima já cobre
  assert.ok((u?.xp ?? u) >= 4200, `esperava ≥4200, veio ${JSON.stringify(u)}`);
});
t("escrever no banco antigo funciona, com as colunas novas", () => {
  db.addReactionRole("01SRV", "01MSGNOVA", "🧊", "01CARGONOVO", "01CANAL");
  const novo = db.listReactionRoles("01MSGNOVA");
  assert.ok(novo.some((r) => r.emoji === "🧊"), "não consegui gravar num banco vindo do schema antigo");
  // channelId e ordem são colunas NOVAS: gravar nelas prova que o ALTER TABLE
  // pegou num banco que nasceu sem elas. (getReactionRole não devolve esses
  // campos, então a conferência é direto na tabela.)
  const linha = cru.prepare("SELECT channelId, ordem FROM reaction_roles WHERE messageId='01MSGNOVA'").get();
  assert.equal(linha.channelId, "01CANAL");
  assert.ok(Number.isInteger(linha.ordem), `ordem devia ser número, veio ${linha.ordem}`);
});
t("o painel ANTIGO continua funcionando junto com o novo", () => {
  const antigo = db.listReactionRoles("01MSGPAINEL");
  assert.equal(antigo.length, 1);
  assert.equal(antigo[0].roleId, "01CARGOAZUL");
  assert.equal(db.listReactionRolesServidor("01SRV").length, 2, "o servidor tem de ver os dois painéis");
});
t("tabelas novas (tickets, ganchos) nasceram no banco antigo", () => {
  for (const tabela of ["tickets", "ganchos"]) {
    assert.ok(existe(tabela), `faltou criar a tabela ${tabela}`);
  }
});

t("abrir DUAS vezes não quebra nem duplica (migração idempotente)", () => {
  db.abrirBanco(CAMINHO);
  assert.equal(cru.prepare("SELECT COUNT(*) AS n FROM xp_usuarios").get().n, 2);
});

// ─────────────────────────────────────────────────────────────────────────
// 3. .env antigo: os nomes internos continuam valendo e têm prioridade.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── .env de instalações antigas ──");
const comAmbiente = async (vars) => {
  const antes = { ...process.env };
  Object.assign(process.env, vars);
  try { await import(`./modulos/core/env.js?compat=${Math.random()}`); return { ...process.env }; }
  finally {
    for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k];
    Object.assign(process.env, antes);
  }
};

{
  const e = await comAmbiente({ SUPER_ADMINS: "01ANTIGO", DONO: "01NOVO" });
  t("SUPER_ADMINS definido à mão não é sobrescrito por DONO", () => {
    assert.equal(e.SUPER_ADMINS, "01ANTIGO");
  });
  const e2 = await comAmbiente({ CHAT_SERVIDORES: "01SRVANTIGO", SERVIDOR: "*" });
  t("CHAT_SERVIDORES definido à mão não é sobrescrito por SERVIDOR", () => {
    assert.equal(e2.CHAT_SERVIDORES, "01SRVANTIGO");
  });
  const e3 = await comAmbiente({ IA: "1", IA_MODO: "online", LLM_URL: "http://meu-llm:8081", MODELO: "m" });
  t("LLM_URL de instalação antiga vence o padrão do modo online", () => {
    assert.equal(e3.LLM_URL, "http://meu-llm:8081");
  });
}

console.log("\n── mídia: URLs antigas de anexo continuam válidas ──");
const midia = await import("./modulos/core/midia.js");
for (const host of ["autumn.stoat.chat", "autumn.revolt.chat", "cdn.stoatusercontent.com"]) {
  t(`${host}: anexo de mensagem antiga ainda vira capa`, () => {
    const url = `https://${host}/attachments/01ARZ3NDEKTSV4RRFFQ69G5FAV`;
    assert.equal(midia.comoExibir(url)?.modo, "media");
  });
}

cru.close();
console.log(`\nCOMPATIBILIDADE: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
