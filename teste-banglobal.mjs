
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

console.log("\n── revisar não bane (o acidente) ──");

const banidosNoStoat = [];
const desbanidosNoStoat = [];
const MEMBROS = [
  { id: { user: "01JBANA000000000000000000A" }, user: { username: "Ana" } },    // na lista (SA)
  { id: { user: "01JBANC000000000000000000C" }, user: { username: "Caio" } },   // na lista (SB)
  { id: { user: "01JLIMP000000000000000000L" }, user: { username: "Lia" } },    // limpa
];
const servD = mkServer("SD", "Servidor D", []);
servD.fetchMembers = async () => ({ members: MEMBROS });
servD.banUser = async (uid) => { banidosNoStoat.push(uid); };
servD.unbanUser = async (uid) => { desbanidosNoStoat.push(uid); };
c.servers.set("SD", servD);

const dizD = async (t) => { await say(t, servD); };
await dizD("&banglobal banir");        // o modo mais perigoso, de propósito

env.length = 0; banidosNoStoat.length = 0;
await dizD("&banglobal revisar");
ok(banidosNoStoat.length === 0, "★ `&banglobal revisar` NÃO baniu ninguém");
ok(ult().includes("Ana") || ult().includes("01JBANA"), "  → mas mostra quem consta na lista");
ok(ult().includes("nada foi feito") || ult().includes("Revisão"), "  → e diz claramente que nada foi feito");

env.length = 0; banidosNoStoat.length = 0;
await dizD("&banglobal varrer");
ok(banidosNoStoat.length === 0, "★ `&banglobal varrer` sozinho também NÃO bane — pede confirmação");
ok(ult().includes("Confirmar") || ult().includes("confirmar"), "  → mostra a lista e pede `varrer confirmar`");

env.length = 0; banidosNoStoat.length = 0;
await dizD("&banglobal varrer confirmar");
ok(banidosNoStoat.length === 2, `★ só \`varrer confirmar\` bane de verdade (${banidosNoStoat.length})`);
ok(!banidosNoStoat.includes("01JLIMP000000000000000000L"), "  → e não toca em quem não está na lista");

// ── 9. Desfazer: o conserto do acidente ──
console.log("\n── desfazer ──");
env.length = 0; desbanidosNoStoat.length = 0;
await dizD("&banglobal desfazer");
ok(desbanidosNoStoat.length === 0, "`&banglobal desfazer` sozinho não age — mostra o que reverteria");
ok(ult().includes("Desfazer") || ult().includes("desfazer"), "  → e pede confirmação");

env.length = 0; desbanidosNoStoat.length = 0;
await dizD("&banglobal desfazer confirmar");
ok(desbanidosNoStoat.length === 2, `★ desfaz os bans que a LISTA aplicou (${desbanidosNoStoat.length})`);
const cfgD = (await import("./modulos/core/config-store.js")).configDoServidor("SD");
ok((cfgD.banGlobal.isentos ?? []).length === 2, "  → e isenta as pessoas, senão a próxima varredura banaria de novo");

// desfazer não mexe em ban manual/automod
db.registrarBanGlobal("01JMANUAL0000000000000000M", "SD", "briga", "manual");
env.length = 0; desbanidosNoStoat.length = 0;
await dizD("&banglobal desfazer");
ok(!ult().includes("01JMANUAL"), "★ desfazer NÃO oferece reverter ban manual (não é papel dele)");

// ── 10. Isenção: aceitar alguém apesar da lista ──
console.log("\n── isentar (o bypass) ──");
env.length = 0;
await dizD("&banglobal isentar remover 01JBANA000000000000000000A");
await dizD("&banglobal isentar remover 01JBANC000000000000000000C");
env.length = 0; banidosNoStoat.length = 0;
await dizD("&banglobal isentar 01JBANA000000000000000000A");
ok(ult().includes("Isento") || ult().includes("isento"), "&banglobal isentar → confirma a isenção");
env.length = 0;
await dizD("&banglobal revisar");
ok(ult().includes("Isentos") || ult().includes("isento"), "  → a revisão passa a marcar quem está isento");

env.length = 0; banidosNoStoat.length = 0;
await dizD("&banglobal varrer confirmar");
ok(!banidosNoStoat.includes("01JBANA000000000000000000A"), "★ a varredura NÃO bane quem está isento");
ok(banidosNoStoat.includes("01JBANC000000000000000000C"), "  → mas continua agindo sobre os demais");

// entrada de membro isento
const bgMod = await import("./modulos/moderacao/ban-global.js");
const ctxD = { serverId: "SD", client: c, config: cfgD, sendEmbed: async () => {}, configDoServidor: () => cfgD };
banidosNoStoat.length = 0;
await bgMod.verificarEntrada({ id: { server: "SD", user: "01JBANA000000000000000000A" }, server: servD }, ctxD);
ok(banidosNoStoat.length === 0, "★ quem está isento ENTRA no servidor sem ser banido");
await bgMod.verificarEntrada({ id: { server: "SD", user: "01JBANB000000000000000000B" }, server: servD }, ctxD);
ok(banidosNoStoat.includes("01JBANB000000000000000000B"), "  → e quem não está isento continua sendo barrado");

env.length = 0;
await dizD("&banglobal isentos");
ok(ult().includes("01JBANA"), "&banglobal isentos lista quem está isento");

// ── 11. Listar todos os banidos ──
console.log("\n── lista ──");
env.length = 0;
await dizD("&banglobal lista");
const listaTxt = ult();
ok(listaTxt.includes("01JBANA") && listaTxt.includes("01JBANC"), "★ `&banglobal lista` mostra todo mundo da lista global");
ok(listaTxt.includes("🛡"), "  → marca quem está isento aqui");
env.length = 0;
await dizD("&banglobal lista servidor");
ok(ult().includes("01JMANUAL") || ult().includes("este servidor") || ult().includes("Banidos por este servidor"),
  "`&banglobal lista servidor` mostra só os banidos por este servidor");

// ── 12. Paridade EN dos comandos novos ──
console.log("\n── EN ──");
await dizD("&idioma en");
env.length = 0; await dizD("&globalban review");
ok(ult().includes("Review") || ult().includes("review"), "EN: `&globalban review` só revisa");
env.length = 0; await dizD("&globalban list");
ok(ult().includes("global list") || ult().includes("Everyone"), "EN: `&globalban list`");
env.length = 0; await dizD("&globalban exempted");
ok(ult().includes("Exempt") || ult().includes("exempt"), "EN: `&globalban exempted`");
await dizD("&idioma pt");

console.log("\n── formas de indicar uma pessoa ──");

const BOT_ID = "01JBTA0000000000000000000B";
const HUM_ID = "01JHRN0000000000000000000H";
const HUM2_ID = "01JHRN2000000000000000000H";
const servE = mkServer("SE", "Servidor E", []);
servE.fetchMembers = async () => ({ members: [
  { id: { user: HUM_ID }, user: { username: "Renan", discriminator: "0042" }, nickname: "Rê" },
  { id: { user: HUM2_ID }, user: { username: "Renata", discriminator: "0777" } },
]});
servE.fetchBans = async () => [
  { id: { user: BOT_ID }, user: { username: "AutoMod", discriminator: "0800", bot: { owner: "z" } }, reason: "teste" },
];
c.servers.set("SE", servE);
c.users.set(HUM_ID, { id: HUM_ID, username: "Renan" });
c.users.set(BOT_ID, { id: BOT_ID, username: "AutoMod", bot: { owner: "z" } });
const dizE = async (t) => { await say(t, servE); };

// planta um registro para ter o que esquecer
db.registrarBanGlobal(HUM_ID, "SZ", "confusão", "manual", { nome: "Renan" });

for (const forma of ["Renan", "renan", "Renan#0042", "Rê", `<@${HUM_ID}>`, HUM_ID, `https://stoat.chat/@${HUM_ID}`]) {
  env.length = 0;
  await dizE(`&banglobal historico ${forma}`);
  ok(ult().includes("banido em") || ult().includes("SZ"), `acha a pessoa por: ${forma}`);
}

env.length = 0;
await dizE("&banglobal historico Ren");
ok(ult().includes("mais de uma") || ult().includes("Mais de uma"), "★ nome ambíguo (`Ren`) NÃO chuta — lista os candidatos");
ok(ult().includes("Renan") && ult().includes("Renata"), "  → e mostra quem são, com os IDs");

env.length = 0;
await dizE("&banglobal esquecer Renan");
ok(ult().includes("Removido") || ult().includes("registro"), "★ `&banglobal esquecer <nome>` funciona (era o bug)");
ok(!ult().includes("<@Renan"), "  → e não trata o nome como se fosse um ID");

env.length = 0;
await dizE("&banglobal esquecer NinguemComEsseNome");
ok(ult().includes("Não achei") || ult().includes("achei"), "nome inexistente → erro claro, não um 'não constava' enganoso");

console.log("\n── bots não entram na lista ──");
const antesBot = db.contarBansGlobais(BOT_ID);
await bg.sincronizarServidor(servE, (sid) => ({ serverId: sid, config: {}, client: c, sendEmbed: async () => {} }));
ok(db.contarBansGlobais(BOT_ID) === antesBot, "★ importação PULA bots (ninguém adiciona um bot sem querer)");

await bg.registrar({ serverId: "SE", client: c }, BOT_ID, "teste", "manual");
ok(db.contarBansGlobais(BOT_ID) === 0, "★ registrar() recusa bot");
ok(db.estaIgnoradoGlobal(BOT_ID), "  → e o marca, para não precisar redescobrir a cada ban");

const cfgE = (await import("./modulos/core/config-store.js")).configDoServidor("SE");
cfgE.banGlobal = { modo: "banir", isentos: [] };
// Registro ANTIGO, de antes da regra: por isso a marca é levantada aqui.
db.deixarDeIgnorarGlobal(BOT_ID);
db.registrarBanGlobal(BOT_ID, "SZ", "banido noutro lugar", "manual", { nome: "AutoMod" });
const banidosE = [];
servE.banUser = async (uid) => { banidosE.push(uid); };
await bg.verificarEntrada({ id: { server: "SE", user: BOT_ID }, server: servE, user: { bot: { owner: "z" } } },
  { serverId: "SE", client: c, config: cfgE, sendEmbed: async () => {}, configDoServidor: () => cfgE });
ok(banidosE.length === 0, "★ bot que entra NÃO é banido pela lista, mesmo constando nela");

env.length = 0;
await dizE("&banglobal bots");
ok(ult().includes("AutoMod"), "&banglobal bots encontra os bots que já estavam na lista");
env.length = 0;
await dizE("&banglobal bots confirmar");
ok(db.contarBansGlobais(BOT_ID) === 0, "★ `&banglobal bots confirmar` limpa os bots antigos da lista");

console.log("\n── nomes na listagem ──");
db.registrarBanGlobal("01JSMDA00000000000000000S", "SZ", "spam", "automod", { nome: "Fulano" });
ok(db.nomeDeBanido("01JSMDA00000000000000000S") === "Fulano", "o nome é guardado junto do ban");
env.length = 0;
await dizE("&banglobal lista");
const txtLista = ult();
ok(txtLista.includes("Fulano"), "★ a listagem mostra o NOME de quem já saiu (em vez de `<@id>` → 'Unknown User')");
ok(txtLista.includes("01JSMDA00000000000000000S"), "  → e o ID junto, que é o que os comandos aceitam");
ok(!txtLista.includes("<@01JSUMIU"), "  → sem menção crua, que o cliente não resolveria");

console.log("\n── esquecer resiste aos bans seguintes ──");
{
  const ALVO = "01JESQ2CD90000000000000AAA";
  db.deixarDeIgnorarGlobal(ALVO);
  db.registrarBanGlobal(ALVO, "SZ", "briga", "manual", { nome: "Fulano" });
  ok(db.contarBansGlobais(ALVO) === 1, "o usuário está na lista");

  env.length = 0;
  await dizE(`&banglobal esquecer ${ALVO}`);
  ok(db.contarBansGlobais(ALVO) === 0, "`esquecer` tira da lista");
  ok(db.estaIgnoradoGlobal(ALVO), "  → e o marca para não voltar");

  // O ban de outra pessoa, em outro servidor: era isto que o trazia de volta.
  await bg.registrar({ serverId: "SOUTRO", client: c }, ALVO, "banido por outra pessoa", "manual");
  ok(db.contarBansGlobais(ALVO) === 0, "★ um ban NOVO não o traz de volta");
  ok(db.registrarBanGlobal(ALVO, "SX", "importado", "importado") === false
     && db.contarBansGlobais(ALVO) === 0, "★ nem a importação automática de outro servidor");

  env.length = 0;
  await dizE("&banglobal ignorados");
  ok(ult().includes(ALVO) || ult().includes("Fulano"), "`ignorados` lista quem está fora");

  env.length = 0;
  await dizE(`&banglobal lembrar ${ALVO}`);
  ok(!db.estaIgnoradoGlobal(ALVO), "`lembrar` desfaz a marca");
  ok(db.registrarBanGlobal(ALVO, "SX", "de novo", "manual") === true, "  → e a porta reabre para bans futuros");
  ok(db.contarBansGlobais(ALVO) === 1, "  → sem ressuscitar os registros antigos, só o novo");
}

console.log("\n── bot detectado sem servidor em comum ──");
const clienteVazio = { users: { get: () => null, fetch: async () => null }, servers: new Map() };
process.env.BOT_TOKEN = process.env.BOT_TOKEN || "tok";
const fetchOriginal = globalThis.fetch;
const simularApi = ({ publicos = [], discover = [], erroDiscover = false }) => {
  const pedidos = [];
  globalThis.fetch = async (url) => {
    const u = String(url); pedidos.push(u);
    if (u.includes("/discover")) {
      if (erroDiscover) throw new Error("página fora do ar");
      return { ok: true, status: 200, text: async () => discover.map((i) => `<a href="/bot/${i}">`).join("\n") };
    }
    const alvo = u.split("/").filter(Boolean).pop().replace("invite", "").replace(/\/$/, "");
    if (u.includes("/bots/")) {
      const id = u.match(/\/bots\/([^/]+)\/invite/)?.[1];
      return publicos.includes(id)
        ? { ok: true, status: 200, json: async () => ({ _id: id, username: "PublicBot" }) }
        : { ok: false, status: 404, json: async () => ({ type: "NotFound" }) };
    }
    if (u.includes("/users/")) return { ok: false, status: 403, json: async () => ({ type: "NotFound" }) };
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  };
  return pedidos;
};
{
  const BOT2 = "01JB9TDESCNHCD000000000AAA";
  const pedidos = simularApi({ publicos: [BOT2] });
  await bg.registrar({ serverId: "SE", client: clienteVazio }, BOT2, "banido", "manual");
  globalThis.fetch = fetchOriginal;
  ok(pedidos.some((u) => u.includes(`/bots/${BOT2}/invite`)), "★ pergunta à vitrine pública de bots, que não exige servidor em comum");
  ok(db.contarBansGlobais(BOT2) === 0, "  → o bot não entra na lista");
  ok(db.estaIgnoradoGlobal(BOT2), "  → e fica marcado, para o próximo ban não perguntar de novo");
}
{
  const BOT3 = "01JB9TPRVAD0000000000000AA";
  const pedidos = simularApi({ publicos: [], discover: [BOT3] });
  await bg.idsDoDiscover({ forcar: true });   // a vitrine é lida uma vez a cada 6h
  await bg.registrar({ serverId: "SE", client: clienteVazio }, BOT3, "banido", "manual");
  globalThis.fetch = fetchOriginal;
  ok(pedidos.some((u) => u.includes("/discover")), "★ e recorre ao discover quando a vitrine não responde");
  ok(db.estaIgnoradoGlobal(BOT3), "  → achando lá o bot que as outras rotas não alcançam");
}
{
  // Gente de verdade não pode ser confundida com bot por causa disso.
  const HUMANO = "01JH9MAN0DEVERDADE00000AAA";
  simularApi({ publicos: [], discover: ["01J99TR9B9T0000000000000AA"] });
  await bg.idsDoDiscover({ forcar: true });
  await bg.registrar({ serverId: "SE", client: clienteVazio }, HUMANO, "briga", "manual");
  globalThis.fetch = fetchOriginal;
  ok(!db.estaIgnoradoGlobal(HUMANO), "★ quem não aparece em nenhum sinal NÃO é tratado como bot");
  ok(db.contarBansGlobais(HUMANO) === 1, "  → e entra na lista normalmente");
}
{
  // Discover fora do ar não pode virar "é bot" nem travar o registro.
  const HUMANO2 = "01JH9MAN0D99SDEVERDADE0AAA";
  simularApi({ publicos: [], erroDiscover: true });
  await bg.idsDoDiscover({ forcar: true });
  await bg.registrar({ serverId: "SE", client: clienteVazio }, HUMANO2, "briga", "manual");
  globalThis.fetch = fetchOriginal;
  ok(db.contarBansGlobais(HUMANO2) === 1, "discover fora do ar não impede o registro de gente de verdade");
}

console.log(`\nBANGLOBAL: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
