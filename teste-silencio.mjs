// O cargo de silêncio tem de calar MESMO quem tem o cargo automático.
//
// No Stoat, os cargos de um membro são aplicados do de posição mais baixa ao
// mais alto e o último vence (stoat.js, permissions/calculator.js). Cargo
// novo nasce EMBAIXO de todos — então um silêncio recém-criado perde para o
// autorole que libera fala. Este teste monta esse cenário.
import assert from "node:assert";
import fs from "node:fs";
process.env.DB_PATH = "/tmp/silencio.db";
try { fs.unlinkSync("/tmp/silencio.db"); } catch {}
const sil = await import("./modulos/moderacao/silencio.js");
const { BITS } = await import("./modulos/moderacao/permissoes.js");
const { cargoSilencioValido } = await import("./modulos/moderacao/pertence.js");
const SEND = BITS.SendMessage;

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

function servidor({ botComCargo = true } = {}) {
  const roles = new Map([
    ["ADM", { name: "Admin", rank: 0, permissions: { a: 0, d: 0 } }],       // acima do bot: intocável
    ["BOT", { name: "Judy", rank: 1, permissions: { a: 0, d: 0 } }],
    ["STAFF", { name: "Staff", rank: 2, permissions: { a: 0, d: 0 } }],
    ["AUTO", { name: "Membro", rank: 3, permissions: { a: SEND, d: 0 } }],  // o cargo automático libera fala
    ["VIP", { name: "VIP", rank: 4, permissions: { a: SEND, d: 0 } }],
  ]);
  const canal = (id, name, type, rp = {}) => ({ id, name, type, rolePermissions: rp,
    async setPermissions(roleId, { allow, deny }) { this.rolePermissions[roleId] = { a: allow, d: deny }; } });
  const channels = [
    canal("C1", "geral", "TextChannel"),
    canal("C2", "memes", "TextChannel", { AUTO: { a: SEND, d: 0 } }),     // permissão PRÓPRIA do autorole no canal
    canal("V1", "call", "VoiceChannel"),
  ];
  const s = {
    id: "S", roles, channels, channelIds: new Set(channels.map((c) => c.id)), defaultPermissions: 0,
    ordens: [],
    async createRole(name) {
      const id = `R${roles.size}`;
      roles.set(id, { name, rank: Math.max(...[...roles.values()].map((r) => r.rank)) + 1, permissions: { a: 0, d: 0 } });
      return { id };
    },
    async setPermissions(id, { allow, deny }) { roles.get(id).permissions = { a: allow, d: deny }; },
    async setRoleOrdering(ids) { s.ordens.push(ids); ids.forEach((id, i) => { roles.get(id).rank = i; }); },
  };
  const client = { user: { id: "BOTUSER" }, serverMembers: { getByKey: () => ({ roles: botComCargo ? ["BOT"] : [] }) } };
  return { s, client };
}
const { calcularPermissoes } = await import("./modulos/moderacao/permissoes.js");
const falaEm = (s, canalId, roles) => !!(Number(calcularPermissoes(s, s.channels.find((c) => c.id === canalId), { id: "x", roles }).valor) & SEND);

console.log("\n── o problema: cargo novo nasce embaixo e perde para o autorole ──");
await t("silêncio do jeito antigo (sem posicionar): FURA onde o autorole tem permissão própria no canal", async () => {
  const { s } = servidor();
  const { criarCargoMudo } = await import("./modulos/moderacao/comandos-admin.js");
  const { id } = await criarCargoMudo(s, "Silenciado", true);   // o &cargomudo antigo: nega tudo, mas não posiciona
  // #geral: nenhum cargo tem permissão própria → a negação por canal segura
  assert.equal(falaEm(s, "C1", ["AUTO", id]), false);
  // #memes: o autorole libera fala NO CANAL e está acima do silêncio → fura
  assert.ok(falaEm(s, "C2", ["AUTO", id]), "esperava o furo no #memes");
  const c = sil.conferir(s, id, { botMember: { roles: ["BOT"] }, autoroleId: "AUTO" });
  assert.equal(c.ok, false);
  assert.ok(c.problemas.some((p) => /cargo automático.*acima do silêncio/.test(p)), "a conferência tem de apontar o autorole");
  assert.ok(c.problemas.some((p) => /ainda consegue falar em: #memes$/.test(p)), `e o canal furado: ${c.problemas.join(" | ")}`);
});

console.log("\n── a correção: criar, negar, posicionar e conferir ──");
await t("depois do preparar: silenciado com autorole não fala em NENHUM canal", async () => {
  const { s, client } = servidor();
  const r = await sil.preparar(s, client, { nome: "Silenciado", autoroleId: "AUTO" });
  for (const canal of ["C1", "C2", "V1"]) assert.equal(falaEm(s, canal, ["AUTO", "VIP", r.id]), false, `ainda fala em ${canal}`);
  assert.equal(r.conferencia.ok, true, r.conferencia.problemas.join(" | "));
  assert.equal(r.canais.ok, 3);
});
await t("posição: logo abaixo do bot; os cargos acima do bot não saem do lugar", async () => {
  const { s, client } = servidor();
  const r = await sil.preparar(s, client, { nome: "Silenciado", autoroleId: "AUTO" });
  const ordem = [...s.roles.entries()].sort((a, b) => a[1].rank - b[1].rank).map(([id]) => id);
  assert.deepEqual(ordem, ["ADM", "BOT", r.id, "STAFF", "AUTO", "VIP"]);
});
await t("o silenciado sem autorole também não fala (caso básico)", async () => {
  const { s, client } = servidor();
  const r = await sil.preparar(s, client, {});
  assert.equal(falaEm(s, "C1", [r.id]), false);
});
await t("&cargomudo usar: adota um cargo existente e deixa ele certo", async () => {
  const { s, client } = servidor();
  s.roles.set("MUTE", { name: "Mute", rank: 9, permissions: { a: 0, d: 0 } });   // criado à mão, lá embaixo
  const r = await sil.preparar(s, client, { roleId: "MUTE", autoroleId: "AUTO" });
  assert.equal(r.criado, false); assert.equal(r.id, "MUTE");
  assert.equal(r.conferencia.ok, true, r.conferencia.problemas.join(" | "));
  assert.equal(falaEm(s, "C2", ["AUTO", "MUTE"]), false);
});
await t("já na posição certa: não reordena de novo", async () => {
  const { s, client } = servidor();
  const r = await sil.preparar(s, client, {});
  const n = s.ordens.length;
  await sil.preparar(s, client, { roleId: r.id });
  assert.equal(s.ordens.length, n);
});

console.log("\n── o que a conferência precisa pegar ──");
await t("bot sem cargo: não dá para posicionar — e isso é dito", async () => {
  const { s, client } = servidor({ botComCargo: false });
  const r = await sil.preparar(s, client, {});
  assert.equal(r.posicao.ok, false);
  assert.ok(r.conferencia.problemas.some((p) => /bot não tem cargo/.test(p)));
});
await t("silêncio acima do bot: o bot não consegue dar o cargo — e isso é dito", () => {
  const { s } = servidor();
  s.roles.set("MUTE", { name: "Mute", rank: 0.5, permissions: { a: 0, d: 0 } });
  const c = sil.conferir(s, "MUTE", { botMember: { roles: ["BOT"] } });
  assert.ok(c.problemas.some((p) => /ACIMA do cargo do bot/.test(p)));
});

console.log("\n── na hora da punição: só usa, não cria ──");
await t("cargo de outro servidor → null, sem criar nada", () => {
  const { s } = servidor();
  let criados = 0; s.createRole = async () => { criados++; return { id: "X" }; };
  const id = cargoSilencioValido(s, { config: { automod: { punicao: { silenceRoleId: "DE_OUTRO_SERVIDOR" } } }, PREFIXO: "&" });
  assert.equal(id, null); assert.equal(criados, 0);
});
await t("cargo deste servidor → usado", () => {
  const { s } = servidor();
  assert.equal(cargoSilencioValido(s, { config: { automod: { punicao: { silenceRoleId: "STAFF" } } } }), "STAFF");
});
await t("motor: sem cargo válido, a punição cai na quarentena", () => {
  const e = fs.readFileSync("./modulos/moderacao/automod-engine.js", "utf8");
  assert.equal((e.match(/sem cargo de silêncio configurado — em quarentena por 30 min/g) ?? []).length, 2, "nos dois modos que silenciam");
  assert.doesNotMatch(e, /garantirCargoSilencio/);
});

console.log(`\nSILÊNCIO: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
