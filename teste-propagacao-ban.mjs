// Um ban num servidor da Judy vale NA HORA para os outros.
// (No raid de 27/09 as contas pularam entre 3 servidores da Judy, e o ban só
// chegava aos outros na sincronização de 6h.)

import assert from "node:assert";
import fs from "node:fs";

process.env.DB_PATH = "/tmp/prop.db"; process.env.CONFIG_PATH = "/tmp/prop.json";
for (const f of ["/tmp/prop.db", "/tmp/prop.json"]) { try { fs.unlinkSync(f); } catch {} }
const db = await import("./modulos/core/db.js"); db.abrirBanco("/tmp/prop.db");
const bg = await import("./modulos/moderacao/ban-global.js");

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

const RAIDER = "01M3GBZ82MYV8MGW8F5M5WRG0S";
function montar({ bans = [], fetchBansFalha = false } = {}) {
  const banidos = {};
  const servidor = (id, { membro = true, modo = "off" } = {}) => ({
    id, _modo: modo,
    fetchBans: async () => { if (fetchBansFalha) throw '{"type":"MissingPermission"}'; return { bans, users: [{ _id: RAIDER, username: "raider" }] }; },
    fetchMember: async (u) => { if (!membro) throw '{"type":"NotFound"}'; return { id: { server: id, user: u }, user: { username: "raider" }, server: servidores.get(id) }; },
    banUser: async (u) => { banidos[id] = u; },
  });
  const servidores = new Map([
    ["ORIGEM", servidor("ORIGEM")],
    ["AVISAR", servidor("AVISAR", { modo: "avisar" })],
    ["BANIR",  servidor("BANIR",  { modo: "banir" })],
    ["OFF",    servidor("OFF",    { modo: "off" })],
    ["FORA",   servidor("FORA",   { membro: false, modo: "banir" })],
  ]);
  const client = { servers: { get: (id) => servidores.get(id), values: () => servidores.values(), fetch: async (id) => servidores.get(id) },
                   users: { get: () => null }, channels: { fetch: async () => null } };
  const criarContexto = (sid) => ({
    serverId: sid, client, COR: {}, PREFIXO: "&",
    config: { banGlobal: { modo: servidores.get(sid)._modo, isentos: [] }, log: {} },
    sendEmbed: async () => ({}),
  });
  return { client, criarContexto, banidos };
}
const BAN = [{ id: { server: "ORIGEM", user: RAIDER }, reason: "racismo no chat" }];

await t("ban na origem é registrado na lista global NA HORA", async () => {
  const { client, criarContexto } = montar({ bans: BAN });
  const r = await bg.propagarSeFoiBan("ORIGEM", RAIDER, { client, criarContexto, espera: 0 });
  assert.equal(r.foiBan, true);
  const h = db.historicoBans(RAIDER);
  assert.ok(h.some((b) => b.serverId === "ORIGEM" && b.origem === "propagado"), JSON.stringify(h));
});

await t("cada outro servidor segue o SEU modo (banir · avisar · off)", async () => {
  const { client, criarContexto, banidos } = montar({ bans: BAN });
  const r = await bg.propagarSeFoiBan("ORIGEM", RAIDER, { client, criarContexto, espera: 0 });
  const por = Object.fromEntries(r.acoes.map((a) => [a.serverId, a.acao]));
  assert.equal(por.BANIR, "banido");
  assert.equal(banidos.BANIR, RAIDER, "o modo banir tinha de banir de verdade");
  assert.equal(por.AVISAR, "avisado");
  assert.equal(banidos.AVISAR, undefined, "o modo avisar NÃO pode banir");
  assert.equal(por.OFF, "nada");
  assert.equal(banidos.OFF, undefined);
});

await t("servidor onde a pessoa não está não é tocado", async () => {
  const { client, criarContexto, banidos } = montar({ bans: BAN });
  const r = await bg.propagarSeFoiBan("ORIGEM", RAIDER, { client, criarContexto, espera: 0 });
  assert.ok(!r.acoes.some((a) => a.serverId === "FORA"));
  assert.equal(banidos.FORA, undefined);
});

await t("quem só SAIU (não foi banido) não entra na lista", async () => {
  const { client, criarContexto, banidos } = montar({ bans: [] });
  const outro = "01KZE9V8CGHSBM2XZJ3QX07JSG";
  const r = await bg.propagarSeFoiBan("ORIGEM", outro, { client, criarContexto, espera: 0 });
  assert.equal(r.foiBan, false);
  assert.equal(db.historicoBans(outro).length, 0);
  assert.deepEqual(banidos, {});
});

await t("sem permissão para ler os bans: não quebra, fica para a sincronização", async () => {
  const { client, criarContexto } = montar({ bans: BAN, fetchBansFalha: true });
  const r = await bg.propagarSeFoiBan("ORIGEM", "01M3GCETEYEBC1KT3DPTK8PAT9", { client, criarContexto, espera: 0 });
  assert.equal(r.foiBan, false);
});

console.log(`\nPROPAGAÇÃO DE BAN: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
