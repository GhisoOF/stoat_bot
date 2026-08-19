// ══════════════════════════════════════════════════════════
//  teste-banglobal.mjs — contribuição sempre ligada
//
//  A regra nova: TODO servidor alimenta a lista, sem configuração.
//  A única escolha é o modo (off/avisar/banir), que trata só do
//  consumo. Estes testes travam essa regra para que ela não seja
//  desfeita sem querer numa refatoração futura.
// ══════════════════════════════════════════════════════════

process.env.BOT_TOKEN = "tok";
process.env.DB_PATH = "/tmp/bg-teste.db";
process.env.CONFIG_PATH = "/tmp/bg-teste-cfg.json";
process.env.BANGLOBAL_IMPORT_BOOT_MS = "50";     // não esperar 1 min no teste
process.env.BANGLOBAL_ESPACO_MS = "10";          // respiro entre servidores: 10ms no teste
import fs from "node:fs";
for (const f of ["/tmp/bg-teste.db", "/tmp/bg-teste.db-wal", "/tmp/bg-teste.db-shm",
                 "/tmp/bg-teste-cfg.json", "/tmp/blocklist-cache.bin"]) fs.rmSync(f, { force: true });

await import("./main.js");
const c = globalThis.__client;

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ── Dois servidores, cada um com bans próprios já existentes ──
const bansA = [
  { id: { user: "01JBANA000000000000000000A" }, reason: "golpe" },
  { id: { user: "01JBANB000000000000000000B" }, reason: "spam" },
];
const bansB = [{ id: { user: "01JBANC000000000000000000C" }, reason: "raid" }];

const env = [];
const canal = { id: "C1", sendMessage: async (p) => env.push(p) };
const mkServer = (id, nome, bans) => ({
  id, ownerId: "U1", name: nome, memberCount: 10, roles: new Map(), channels: [canal],
  fetchMember: async () => null, fetchMembers: async () => ({ members: [] }),
  fetchBans: async () => bans,
  banUser: async () => {},
});
const servA = mkServer("SA", "Servidor A", bansA);
const servB = mkServer("SB", "Servidor B", bansB);
c.servers.set("SA", servA);
c.servers.set("SB", servB);
c.channels.set("C1", canal);

const mk = (t, server = servA) => ({
  authorId: "U1", content: t, serverId: server.id, server,
  channel: canal, channelId: "C1", mentionIds: [], createdAt: new Date(),
  author: { username: "Ghieh" }, member: { roles: [] },
});
const say = async (t, server) => { await c.emitAll("messageCreate", mk(t, server)); };
const ult = () => JSON.stringify(env[env.length - 1] ?? {});

await c.emitAll("ready");

const db = await import("./modulos/core/db.js");

// ── 1. Sincronização automática no boot, sem comando nenhum ──
await new Promise((r) => setTimeout(r, 600));   // deixa a rodada de boot correr (todos os servidores)
ok(db.totalBansGlobais() >= 3, `★ boot sincronizou sozinho: ${db.totalBansGlobais()} registro(s), sem nenhum comando`);
ok(db.bansGlobaisDoServidor("SA") === 2, "  → 2 registros vieram do Servidor A");
ok(db.bansGlobaisDoServidor("SB") === 1, "  → 1 registro veio do Servidor B");

// ── 2. Não existe mais chave para desligar a contribuição ──
const bg = await import("./modulos/moderacao/ban-global.js");
ok(typeof bg.autoImportacaoLigada === "undefined",
  "★ a função que permitia desligar a contribuição deixou de existir");

env.length = 0; await say("&banglobal auto off");
ok(ult().includes("automática") || ult().includes("permanente"),
  "&banglobal auto off → explica que agora é permanente (não desliga nada)");
ok(!ult().includes("desligada"), "  → não sugere que ficou desligado");

// mesmo depois de tentar desligar, uma nova sincronização ainda importa
const antes = db.totalBansGlobais();
servA.fetchBans = async () => [...bansA, { id: { user: "01JBAND000000000000000000D" }, reason: "novo" }];
await bg.sincronizarServidor(servA, (sid) => {
  const ctx = { serverId: sid, config: {}, client: c, sendEmbed: async () => {} };
  return ctx;
});
ok(db.totalBansGlobais() === antes + 1,
  "★ após tentar desligar, a sincronização AINDA importa (contribuição incondicional)");

env.length = 0; await say("&banglobal importar");
ok(ult().includes("automática") || ult().includes("permanente"),
  "&banglobal importar → explica que já acontece sozinho");

// ── 3. O modo continua sendo escolha do servidor ──
env.length = 0; await say("&banglobal avisar");
ok(ult().includes("avisar"), "&banglobal avisar → modo alterado");
await say("&banglobal off");
ok(ult().includes("off"), "&banglobal off → modo alterado (deixa de se aproveitar)");

// ...e desligar o modo NÃO para a contribuição
const antes2 = db.totalBansGlobais();
servB.fetchBans = async () => [...bansB, { id: { user: "01JBANE000000000000000000E" }, reason: "outro" }];
await bg.sincronizarServidor(servB, (sid) => ({ serverId: sid, config: {}, client: c, sendEmbed: async () => {} }));
ok(db.totalBansGlobais() === antes2 + 1,
  "★ servidor em modo `off` continua ALIMENTANDO a lista (só não se aproveita)");

// ── 4. Status mostra a contribuição, sem prometer botão nenhum ──
env.length = 0; await say("&banglobal");
const status = ult();
ok(status.includes("Contribuição") && status.includes("sempre"), "status: contribuição sempre ligada");
ok(status.includes("deste servidor"), "  → mostra quantos registros vieram daqui");
ok(!status.includes("banglobal auto <on|off>"), "  → não oferece mais o comando `auto`");
ok(!status.includes("banglobal importar —"), "  → não oferece mais o comando `importar`");

// ── 5. Servidor novo entra com o histórico na hora ──
const servC = mkServer("SC", "Servidor C", [{ id: { user: "01JBANF000000000000000000F" }, reason: "convite" }]);
c.servers.set("SC", servC);
const antes3 = db.totalBansGlobais();
await c.emitAll("serverCreate", servC);
ok(db.totalBansGlobais() === antes3 + 1, "★ bot entrou em servidor novo → histórico importado na hora");

// ── 6. Paridade EN ──
await say("&idioma en");
env.length = 0; await say("&banglobal auto on");
ok(ult().includes("automatic") || ult().includes("permanent"), "EN: &banglobal auto → explicação em inglês");
env.length = 0; await say("&banglobal");
ok(ult().includes("Contribution") && ult().includes("always"), "EN: status mostra a contribuição");
ok(ult().includes("from this server"), "  → contagem própria em inglês");

// ── 7. Ajuda nos dois idiomas ──
env.length = 0; await say("&help banglobal contribution");
ok(ult().length > 80, "EN: &help banglobal contribution responde");
await say("&idioma pt");
env.length = 0; await say("&help banglobal contribuicao");
ok(ult().includes("Sempre") || ult().includes("sempre"), "PT: &help banglobal contribuicao responde");

console.log(`\nBANGLOBAL: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
