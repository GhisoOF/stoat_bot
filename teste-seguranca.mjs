// ══════════════════════════════════════════════════════════
//  teste-seguranca.mjs — brechas de permissão e injeção
//
//  Trava dois achados da auditoria de segurança:
//   1. &warn exigia permissão (não exigia → qualquer um advertia qualquer um,
//      e o aviso alimenta o ban automático do modo "acumular")
//   2. nome de usuário entrava cru nos embeds de boas-vindas → injeção de
//      menção (@everyone / a um admin) e de link markdown (phishing)
// ══════════════════════════════════════════════════════════

process.env.BOT_TOKEN = "tok";
process.env.DB_PATH = "/tmp/seg-teste.db";
process.env.CONFIG_PATH = "/tmp/seg-teste-cfg.json";
import fs from "node:fs";
for (const f of ["/tmp/seg-teste.db", "/tmp/seg-teste.db-wal", "/tmp/seg-teste.db-shm",
                 "/tmp/seg-teste-cfg.json", "/tmp/blocklist-cache.bin"]) fs.rmSync(f, { force: true });

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ── 1. Injeção via nome de usuário (unitário) ──
console.log("── injeção nos embeds de entrada/saída ──");
{
  const { renderizar } = await import("./modulos/ferramentas/boas-vindas.js");

  const ping = renderizar("Oi {nome}", { userId: "U1", nome: "@everyone", mencionar: false });
  ok(!/(^|[^\u200b])@everyone/.test(ping), "@everyone no nome não vira ping em massa");

  const mencao = renderizar("Oi {nome}", { userId: "U1", nome: "<@01ADMINADMINADMINADMINADMI>", mencionar: false });
  ok(!mencao.includes("<@01ADMINADMINADMINADMINADMI>"), "★ menção embutida no nome é neutralizada (não pinga um admin)");

  const link = renderizar("{nome} entrou", { userId: "U1", nome: "[clique](https://phishing.com)", mencionar: false });
  ok(!link.includes("](https://phishing.com)"), "★ link markdown no nome não vira link clicável");

  const normal = renderizar("{nome}", { userId: "U1", nome: "Zé Ramalhão", mencionar: false });
  ok(normal.includes("Zé Ramalhão"), "nome legítimo com acento passa intacto");

  const mencionaVerificado = renderizar("{usuario}", { userId: "01REAL0000000000000000000A", nome: "irrelevante", mencionar: true });
  ok(mencionaVerificado === "<@01REAL0000000000000000000A>", "★ {usuario} usa o userId VERIFICADO, não o texto do nome");

  const servidorMalicioso = renderizar("bem-vindo a {servidor}", { userId: "U1", nome: "x", servidor: "@everyone [x](http://y)", mencionar: false });
  ok(!servidorMalicioso.includes("](http://y)") && !/(^|[^\u200b])@everyone/.test(servidorMalicioso), "nome de servidor também é sanitizado");
}

// ── 2. Gate de permissão do &warn (integração) ──
console.log("\n── permissão do &warn ──");
await import("./main.js");
const c = globalThis.__client;
await c.emitAll("ready");

const ALVO = "01ALVO00000000000000000000";
const server = {
  id: "S1", ownerId: "01DONO00000000000000000000", name: "S", roles: new Map(), channels: [],
  fetchMember: async () => ({ roles: [] }),
  fetchMembers: async () => ({ members: [{ id: { user: ALVO }, user: { username: "alvo" } }] }),
  fetchBans: async () => [],
};
c.servers.set("S1", server);
const env = [];
const mk = (uid, member, mentions = [ALVO]) => ({
  authorId: uid, content: `&warn <@${ALVO}> motivo`, serverId: "S1", server,
  channel: { id: "C1", sendMessage: async (p) => env.push(p) }, channelId: "C1",
  mentionIds: mentions, createdAt: new Date(), author: { username: "T" }, member,
});
const say = async (uid, member) => { env.length = 0; await c.emitAll("messageCreate", mk(uid, member)); };
const ult = () => JSON.stringify(env[env.length - 1] ?? {});
const negou = () => ult().includes("Permissão insuficiente") || ult().includes("Missing permission");

const semPoder = { roles: [], hasPermission: () => false, getPermissions: () => 0 };
await say("01COMUM0000000000000000000", semPoder);
ok(negou(), "★ membro comum é BARRADO no &warn");

await say("01DONO00000000000000000000", semPoder);
ok(!negou(), "dono do servidor passa");

const comMM = { roles: [], hasPermission: (s, p) => p === "ManageMessages", getPermissions: () => 0 };
await say("01MOD000000000000000000000", comMM);
ok(!negou(), "moderador com ManageMessages passa");

console.log(`\nSEGURANÇA: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
