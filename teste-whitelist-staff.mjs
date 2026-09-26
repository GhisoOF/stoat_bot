// O caso real (26 set): o dono do servidor rodou
//   &automod whitelist add https://linksta.cc/@ghiso
// e ainda assim foi silenciado por 2h no próprio servidor ao divulgar esse
// link. Duas causas:
//   1. a whitelist gravava o link como CÓDIGO DE CONVITE, que só o
//      anti-invite olha — quem bloqueou foi o anti-link;
//   2. o automod não isentava ninguém: nem dono, nem staff, nem super admin.
// Este teste passa pelo runAutomod de verdade.

import assert from "node:assert";
import fs from "node:fs";

process.env.DB_PATH = "/tmp/wl-staff.db";
process.env.CONFIG_PATH = "/tmp/wl-staff.json";
for (const f of [process.env.DB_PATH, process.env.CONFIG_PATH]) { try { fs.unlinkSync(f); } catch {} }

const db = await import("./modulos/core/db.js");
db.abrirBanco(process.env.DB_PATH);
const store = await import("./modulos/core/config-store.js");
const engine = await import("./modulos/moderacao/automod-engine.js");
const { ConstrutorIndice } = await import("./modulos/moderacao/indice-dominios.js");

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

// A mensagem que foi apagada, como estava.
const ANUNCIO = "@everyone\n\nOlá a todos.\nEstou em live agora testando e ajustando\n"
  + "Além disso agora tenho todos os meus links centralizados:\n- https://linksta.cc/@ghiso\n\n"
  + "Quem quiser entrar para interagir pode entrar";

// linksta.cc numa das listas de bloqueio (é o que aconteceu)
const construtor = new ConstrutorIndice();
for (const d of ["linksta.cc", "golpe.example"]) construtor.adicionar(d);
const bloqueados = construtor.construir?.() ?? construtor.finalizar?.() ?? construtor;

async function rodar(texto, { staff = false, config }) {
  let apagou = false;
  const message = {
    authorId: "01DONO000000000000000000000", content: texto, channelId: "c",
    channel: { id: "c", sendMessage: async () => ({}) },
    delete: async () => { apagou = true; },
    member: { roles: [] },
  };
  const ctx = {
    config, serverId: "01SRV", COR: { info: 1, aviso: 2, erro: 3, sucesso: 4 }, PREFIXO: "&",
    estado: { blockedDomains: bloqueados, spamData: new Map(), ecoData: new Map(), massSpamData: new Map() },
    getServer: async () => ({ id: "01SRV", fetchMember: async () => ({ edit: async () => {} }) }),
    membroTemPermissao: (_m, _s, perm) => staff && perm === "ManageMessages",
    sendEmbed: async () => ({}), salvarConfig: () => {}, client: { channels: { fetch: async () => ({ sendMessage: async () => ({}) }) } },
  };
  let parou = false;
  let erro = null;
  try { parou = await engine.runAutomod(message, ctx); }
  catch (e) { erro = e; }
  // Só conta como bloqueio se a MENSAGEM foi apagada. Uma exceção não é
  // bloqueio: seria o teste passando por acidente.
  if (erro && !apagou) throw new Error(`runAutomod lançou sem apagar nada: ${erro.message}`);
  return { apagou };
}

console.log("\n── migração do que já foi cadastrado ──");
await t("o link que foi para a lista de convites vira domínio permitido", () => {
  // Simula a config gravada pelo comando antigo
  const cfg = store.configDoServidor("01SRVMIGRA");
  cfg.inviteWhitelist = ["abc123", "https://linksta.cc/@ghiso"];
  db.gravarConfig("01SRVMIGRA", cfg);
  store._limparCache();
  const nova = store.configDoServidor("01SRVMIGRA");
  assert.deepEqual(nova.inviteWhitelist, ["abc123"], "o convite de verdade tinha de ficar");
  assert.deepEqual(nova.dominiosPermitidos, ["linksta.cc"]);
});
await t("migração é idempotente (abrir de novo não duplica)", () => {
  store._limparCache();
  assert.deepEqual(store.configDoServidor("01SRVMIGRA").dominiosPermitidos, ["linksta.cc"]);
});

console.log("\n── o anúncio do dono ──");
const base = () => {
  const c = store.configDoServidor("01SRVTESTE");
  c.automod.antiLink.enabled = true;
  c.automod.antiInvite.enabled = false;
  c.automod.antiScam.enabled = false;
  c.dominiosPermitidos = [];
  return c;
};

await t("SEM whitelist e SEM ser staff: o anti-link bloqueia (a lista funciona)", async () => {
  assert.equal((await rodar(ANUNCIO, { config: base() })).apagou, true);
});
await t("COM o domínio liberado: passa, mesmo para quem não é staff", async () => {
  const c = base(); c.dominiosPermitidos = ["linksta.cc"];
  assert.equal((await rodar(ANUNCIO, { config: c })).apagou, false);
});
await t("liberar o domínio também libera os subdomínios", async () => {
  const c = base(); c.dominiosPermitidos = ["linksta.cc"];
  assert.equal((await rodar("olha https://perfil.linksta.cc/x", { config: c })).apagou, false);
});
await t("liberar um domínio NÃO libera os outros da lista", async () => {
  const c = base(); c.dominiosPermitidos = ["linksta.cc"];
  assert.equal((await rodar("entra aqui https://golpe.example/x", { config: c })).apagou, true);
});
await t("dono/staff passa direto, mesmo SEM whitelist", async () => {
  assert.equal((await rodar(ANUNCIO, { config: base(), staff: true })).apagou, false);
});
await t("staff passa até em spam repetido (quem modera não é moderado)", async () => {
  const c = base(); c.automod.antiDuplicata = { enabled: true, maxRepetidas: 2, windowMs: 60000 };
  const msg = "mensagem de teste bem longa para o anti-duplicata olhar";
  for (let i = 0; i < 3; i++) assert.equal((await rodar(msg, { config: c, staff: true })).apagou, false);
});
await t("isentarStaff: false desliga a isenção (para testar filtros em si mesmo)", async () => {
  const c = base(); c.automod.isentarStaff = false;
  assert.equal((await rodar(ANUNCIO, { config: c, staff: true })).apagou, true);
});

console.log(`\nWHITELIST E STAFF: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
