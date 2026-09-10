
process.env.BOT_TOKEN = "tok";
process.env.DB_PATH = "/tmp/xpc-teste.db";
process.env.CONFIG_PATH = "/tmp/xpc-teste-cfg.json";
import fs from "node:fs";
for (const f of ["/tmp/xpc-teste.db", "/tmp/xpc-teste.db-wal", "/tmp/xpc-teste.db-shm",
                 "/tmp/xpc-teste-cfg.json", "/tmp/blocklist-cache.bin"]) fs.rmSync(f, { force: true });

await import("./main.js");
const c = globalThis.__client;
await c.emitAll("ready");
const db = await import("./modulos/core/db.js");
const nivel = await import("./modulos/ferramentas/nivel.js");
const store = await import("./modulos/core/config-store.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ── Cenário: cargos a cada 5 níveis, alguém no nível 14 ──
const SID = "SX";
const R5 = "01JR05000000000000000000R5";
const R10 = "01JR10000000000000000000RA";
const R15 = "01JR15000000000000000000RF";
const ALVO = "01JPESSA00000000000000AAAA";
const roles = new Map([[R5, { name: "Nível 5" }], [R10, { name: "Nível 10" }], [R15, { name: "Nível 15" }]]);
db.setCargoNivel(SID, 5, R5);
db.setCargoNivel(SID, 10, R10);
db.setCargoNivel(SID, 15, R15);
db.setXp(SID, ALVO, 99999, 14, new Date().toISOString());

const env = [];
const canal = { id: "C1", sendMessage: async (p) => { env.push(p); return { id: "M1" }; } };
let cargosDoMembro = [];
const membro = {
  id: { server: SID, user: ALVO }, user: { username: "Fulana" },
  get roles() { return cargosDoMembro; },
  edit: async ({ roles: novos }) => { cargosDoMembro = [...novos]; },
};
const server = {
  id: SID, ownerId: "U1", name: "Servidor X", roles, channels: [canal],
  fetchMember: async (uid) => (uid === ALVO ? membro : null),
  fetchMembers: async () => ({ members: [membro] }),
  fetchBans: async () => [], banUser: async () => {},
};
c.servers.set(SID, server);
c.channels.set("C1", canal);
const cfg = store.configDoServidor(SID);
cfg.xp = { ...cfg.xp, enabled: true };

const mk = (t) => ({ authorId: "U1", content: t, serverId: SID, server, channel: canal, channelId: "C1",
  mentionIds: [], createdAt: new Date(), author: { username: "Ghieh" }, member: { roles: [] } });
const say = async (t) => { env.length = 0; await c.emitAll("messageCreate", mk(t)); };
const ult = () => JSON.stringify(env[env.length - 1] ?? {});

// ── 1. O XP sobrevive, os cargos não ──
console.log("\n── quem sai e volta ──");
ok(db.getXp(SID, ALVO).nivel === 14, "o XP e o nível continuam no banco depois do ban");
ok(cargosDoMembro.length === 0, "  → mas a pessoa voltou sem nenhum cargo (é o Stoat que os retira)");

// ── 2. Entrar devolve os cargos sozinho ──
await c.emitAll("serverMemberJoin", membro);
ok(cargosDoMembro.includes(R5) && cargosDoMembro.includes(R10),
  "★ ao ENTRAR, os cargos dos níveis já alcançados voltam sozinhos");
ok(!cargosDoMembro.includes(R15), "  → e nenhum cargo de nível que ela ainda NÃO alcançou (14 < 15)");

// ── 3. Sincronizar de novo não duplica nada ──
const antes = [...cargosDoMembro];
const r2 = await nivel.sincronizarCargos(server, membro, SID);
ok(r2.concedidos.length === 0 && cargosDoMembro.length === antes.length,
  "sincronizar de novo não faz nada (idempotente)");

// ── 4. O comando, para quem já tinha voltado antes ──
console.log("\n── &xp sincronizar ──");
cargosDoMembro = [];
await say(`&xp sincronizar <@${ALVO}>`);
ok(cargosDoMembro.includes(R5) && cargosDoMembro.includes(R10), "★ `&xp sincronizar @pessoa` devolve os cargos");
ok(ult().includes("2"), "  → e diz quantos foram");

cargosDoMembro = [];
await say("&xp sincronizar");
ok(cargosDoMembro.includes(R10), "★ `&xp sincronizar` sem alvo varre o servidor inteiro");
ok(ult().includes("Fulana") || ult().includes(ALVO), "  → e lista quem foi atualizado");

await say("&xp sincronizar");
ok(ult().includes("0 pessoa") || ult().includes("já estava"), "rodar de novo: ninguém a atualizar");

// ── 5. Cargo apagado à mão não quebra a chamada ──
console.log("\n── casos de borda ──");
roles.delete(R10);
cargosDoMembro = [];
const r3 = await nivel.sincronizarCargos(server, membro, SID);
ok(!r3.concedidos.includes(R10), "★ cargo apagado no servidor é ignorado (um id morto derrubaria o edit inteiro)");
ok(r3.concedidos.includes(R5), "  → e os que existem continuam sendo aplicados");
roles.set(R10, { name: "Nível 10" });

// nível 0 / sem cargos configurados
const NOVATO = "01JNVAT000000000000000AAAA";
db.setXp(SID, NOVATO, 5, 0, new Date().toISOString());
const membroNovato = { id: { server: SID, user: NOVATO }, roles: [], edit: async () => {} };
ok(await nivel.sincronizarCargos(server, membroNovato, SID) === null, "quem está no nível 0 não recebe nada");

// XP desligado: a entrada não mexe em cargo nenhum
cfg.xp.enabled = false;
cargosDoMembro = [];
await c.emitAll("serverMemberJoin", membro);
ok(cargosDoMembro.length === 0, "com o sistema de XP desligado, a entrada não dá cargo");
cfg.xp.enabled = true;

// ── 6. Subir de nível não deixa marco para trás ──
console.log("\n── level up ──");
cargosDoMembro = [];
db.setXp(SID, ALVO, 0, 0, null);
cfg.xp = { ...cfg.xp, enabled: true, cooldownMs: 0, xpMin: 100000, xpMax: 100000, multiplicador: 1, nivelMaximo: 50, anunciarLevelUp: false };
await c.emitAll("messageCreate", { ...mk("oi"), authorId: ALVO });
const n = db.getXp(SID, ALVO).nivel;
ok(n >= 10, `um salto grande de XP levou ao nível ${n}`);
ok(cargosDoMembro.includes(R5) && cargosDoMembro.includes(R10),
  "★ pular vários níveis de uma vez concede TODOS os marcos, não só o último");

// ── 7. EN ──
console.log("\n── EN ──");
await say("&idioma en");
cargosDoMembro = [];
await say(`&xp sync <@${ALVO}>`);
ok(ult().includes("Roles restored") || ult().includes("up to date"), "EN: `&xp sync` responde em inglês");

console.log(`\nXP CARGOS: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
