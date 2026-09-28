// Tirar alguém da lista global (29/09): `&banglobal desfazer MiguelRobes`
// respondia "nada a desfazer" — o desfazer ignorava a pessoa e não dizia que
// estar NA LISTA é diferente de ter sido BANIDO AQUI pela lista. O comando
// certo (esquecer) já existia, mas estava aberto a QUALQUER admin com
// BanMembers — que apagaria alguém da lista de todos os servidores.
import assert from "node:assert";
import fs from "node:fs";
for (const f of ["/tmp/bg-rem.db", "/tmp/bg-rem.db-wal", "/tmp/bg-rem.db-shm"]) { try { fs.unlinkSync(f); } catch {} }
process.env.DB_PATH = "/tmp/bg-rem.db";
const db = await import("./modulos/core/db.js"); db.abrirBanco("/tmp/bg-rem.db");
const bg = await import("./modulos/moderacao/ban-global.js");

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

const MIGUEL = "01KMBX60MHVS8F0P0CJ0VK3326", AQUI = "S_AQUI", OUTRO = "S_OUTRO", DONO = "U_DONO", ADMIN = "U_ADMIN";
function montar({ autor }) {
  const enviados = [], desbanidos = [];
  const server = { id: AQUI, roles: new Map(), members: [], async unbanUser(u) { desbanidos.push(u); } };
  const config = { language: "pt", banGlobal: { modo: "banir", isentos: [] }, log: {} };
  const ctx = {
    config, serverId: AQUI, PREFIXO: "&",
    COR: { sucesso: 1, erro: 2, aviso: 3, info: 4, mod: 5 },
    sendEmbed: async (_c, e) => { enviados.push(e); return { id: "m" }; },
    getServer: async () => server,
    membroTemPermissao: () => true,                       // os dois têm BanMembers
    salvarConfig: () => {},
    ehSuperAdmin: (id) => id === DONO,
    client: { users: { get: () => null, fetch: async (id) => ({ id, username: id === MIGUEL ? "MiguelRobes" : id }) }, servers: { get: () => null } },
  };
  const message = { authorId: autor, channel: { id: "C" }, content: "", mentionIds: [] };
  return { ctx, message, enviados, desbanidos, config };
}
const rodar = async (autor, ...args) => { const m = montar({ autor }); await bg.cmdBanGlobal(m.message, args, m.ctx); return m; };

// MiguelRobes foi banido em OUTRO servidor (é assim que ele está na lista)
db.registrarBanGlobal(MIGUEL, OUTRO, "raid", "manual", { nome: "MiguelRobes" });

console.log("\n── o caso da captura: desfazer <pessoa> que a lista não baniu aqui ──");
await t("explica a diferença em vez de 'nada a desfazer'", async () => {
  const { enviados, desbanidos } = await rodar(DONO, "desfazer", MIGUEL);
  const e = enviados.at(-1);
  assert.match(e.title, /não baniu essa pessoa aqui/);
  assert.match(e.description, /está \*\*na lista global\*\* \(banido em 1 servidor/);
  assert.match(e.description, /banglobal isentar 01KMBX/);
  assert.match(e.description, /banglobal esquecer 01KMBX/, "o dono vê o caminho para tirar da lista");
  assert.equal(desbanidos.length, 0);
});
await t("pelo NOME também (MiguelRobes)", async () => {
  const { enviados } = await rodar(DONO, "desfazer", "MiguelRobes");
  assert.match(enviados.at(-1).title, /não baniu essa pessoa aqui/);
});
await t("para quem não é dono, o caminho do esquecer não é oferecido", async () => {
  const { enviados } = await rodar(ADMIN, "desfazer", MIGUEL);
  assert.doesNotMatch(enviados.at(-1).description, /banglobal esquecer/);
  assert.match(enviados.at(-1).description, /só o dono do bot/);
});

console.log("\n── desfazer <pessoa> quando a lista baniu aqui ──");
await t("desbane SÓ essa pessoa e a isenta aqui", async () => {
  const OUTRA = "01KOUTRAPESSOA000000000000";
  db.registrarBanGlobal(MIGUEL, AQUI, "lista", "banglobal", { nome: "MiguelRobes" });
  db.registrarBanGlobal(OUTRA, AQUI, "lista", "banglobal", { nome: "Outra" });
  const { enviados, desbanidos, config } = await rodar(DONO, "desfazer", MIGUEL);
  assert.match(enviados.at(-1).title, /Ban desfeito/);
  assert.deepEqual(desbanidos, [MIGUEL], "só ela");
  assert.ok(config.banGlobal.isentos.includes(MIGUEL));
  assert.ok(db.bansGlobaisPorOrigem(AQUI, ["banglobal"]).some((b) => b.userId === OUTRA), "a outra continua");
});

console.log("\n── esquecer: tira da lista de TODOS os servidores ──");
await t("admin de servidor (BanMembers) NÃO pode — a lista é de todos", async () => {
  const { enviados } = await rodar(ADMIN, "esquecer", MIGUEL);
  assert.match(enviados.at(-1).title, /Só o dono do bot/);
  assert.match(enviados.at(-1).description, /banglobal isentar/, "e mostra o que ele pode fazer");
  assert.ok(db.historicoBans(MIGUEL).length > 0, "a lista não foi mexida");
  assert.equal(db.estaIgnoradoGlobal(MIGUEL), false);
});
await t("o apelido 'remover' também é barrado para o admin", async () => {
  const { enviados } = await rodar(ADMIN, "remover", MIGUEL);
  assert.match(enviados.at(-1).title, /Só o dono do bot/);
});
await t("o dono do bot tira — e ele não volta", async () => {
  await rodar(DONO, "esquecer", MIGUEL);
  assert.equal(db.historicoBans(MIGUEL).length, 0);
  assert.equal(db.estaIgnoradoGlobal(MIGUEL), true, "marcado para ficar fora (a sincronização de 6h não traz de volta)");
});
await t("'lembrar' (desfazer o esquecer) também é só do dono", async () => {
  const { enviados } = await rodar(ADMIN, "lembrar", MIGUEL);
  assert.match(enviados.at(-1).title, /Só o dono do bot/);
  assert.equal(db.estaIgnoradoGlobal(MIGUEL), true);
});

console.log(`\nBANGLOBAL (remover): ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
