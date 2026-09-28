// IDs de outro servidor: o molde não carrega, e servidor afetado se cura.
// Caso real (28/09): servidor novo herdou o cargo de silêncio 01KNT8… e o canal
// de avisos de outro servidor — o bot não criava o cargo e o sentinela
// apontava alertas para o #log de outra comunidade.
import assert from "node:assert";
import fs from "node:fs";
process.env.DB_PATH = "/tmp/pertence.db";
try { fs.unlinkSync("/tmp/pertence.db"); } catch {}
const { curarIds, cargoDoServidor, canalDoServidor, limparMolde } = await import("./modulos/moderacao/pertence.js");

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};
const ALHEIO_CARGO = "01KNT8KJ58F4QJZFQBHYQ1Z5P0", ALHEIO_CANAL = "01KHALOGDEOUTROSERVIDOR00";
const NOVO = { id: "S_NOVO", roles: new Map([["R_STAFF", {}]]), channelIds: new Set(["C_LOG"]), channels: [] };

await t("molde: nenhum ID de servidor sobrevive", () => {
  const molde = limparMolde({
    language: "pt",
    automod: { punicao: { modo: "confirmar", silenceRoleId: ALHEIO_CARGO }, antiScam: { enabled: true, alertChannelId: ALHEIO_CANAL, canais: ["X"] } },
    log: { canalId: ALHEIO_CANAL, cargos: true }, autorole: { roleId: "R" }, inviteWhitelist: ["abc"], dominiosPermitidos: ["a.com"],
    acesso: { canais: { modo: "todos", lista: ["C"] } },
  });
  assert.equal(molde.automod.punicao.silenceRoleId, null);
  assert.equal(molde.automod.antiScam.alertChannelId, null);
  assert.deepEqual(molde.automod.antiScam.canais, []);
  assert.equal(molde.log.canalId, null); assert.equal(molde.autorole.roleId, null);
  assert.deepEqual(molde.inviteWhitelist, []); assert.deepEqual(molde.dominiosPermitidos, []);
  assert.deepEqual(molde.acesso.canais.lista, []);
  // o que não é ID fica
  assert.equal(molde.automod.punicao.modo, "confirmar"); assert.equal(molde.log.cargos, true); assert.equal(molde.acesso.canais.modo, "todos");
});
await t("servidor afetado: cargo e canal de fora são descartados", () => {
  const cfg = { automod: { punicao: { silenceRoleId: ALHEIO_CARGO }, antiScam: { alertChannelId: ALHEIO_CANAL } }, log: { canalId: "C_LOG" }, acesso: { cargosStaff: ["R_STAFF", ALHEIO_CARGO] } };
  const mudou = curarIds(cfg, NOVO);
  assert.equal(cfg.automod.punicao.silenceRoleId, null);
  assert.equal(cfg.automod.antiScam.alertChannelId, null);
  assert.equal(cfg.log.canalId, "C_LOG", "o canal DESTE servidor fica");
  assert.deepEqual(cfg.acesso.cargosStaff, ["R_STAFF"]);
  assert.ok(mudou.includes("silenceRoleId") && mudou.includes("alertChannelId"));
});
await t("servidor sem cache de cargos/canais: não mexe em nada (não dá para afirmar)", () => {
  const cfg = { automod: { punicao: { silenceRoleId: "QUALQUER" } } };
  assert.deepEqual(curarIds(cfg, { id: "S", roles: new Map(), channelIds: new Set() }), []);
  assert.equal(cfg.automod.punicao.silenceRoleId, "QUALQUER");
});
await t("cargos como objeto simples (formato cru) também funcionam", () => {
  assert.equal(cargoDoServidor({ roles: { R1: {} } }, "R1"), true);
  assert.equal(canalDoServidor({ channelIds: new Set(["C1"]) }, "C2"), false);
});

// (o cargo de silêncio — criar, posicionar, conferir — está em teste-silencio.mjs)

console.log(`\nPERTENCE: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
