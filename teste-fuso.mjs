// ══════════════════════════════════════════════════════════
//  teste-fuso.mjs — &fuso e o resolvedor de cidades
// ══════════════════════════════════════════════════════════

process.env.BOT_TOKEN = "tok";
process.env.DB_PATH = "/tmp/fuso-teste.db";
process.env.CONFIG_PATH = "/tmp/fuso-teste-cfg.json";
import fs from "node:fs";
for (const f of ["/tmp/fuso-teste.db", "/tmp/fuso-teste.db-wal", "/tmp/fuso-teste.db-shm",
                 "/tmp/fuso-teste-cfg.json", "/tmp/blocklist-cache.bin"]) fs.rmSync(f, { force: true });

const { buscarFuso, agoraEm, diferenca, cidadeDoFuso, fusoValido } =
  await import("./modulos/core/fusos.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ── 1. Resolvedor de cidades ──
console.log("── resolvedor ──");
const casos = [
  ["São Paulo", "America/Sao_Paulo", "com acento"],
  ["sao paulo", "America/Sao_Paulo", "sem acento"],
  ["SAO PAULO", "America/Sao_Paulo", "caixa alta"],
  ["Madrid", "Europe/Madrid", "cidade simples"],
  ["Madrid/Europa", "Europe/Madrid", "★ formato Cidade/País (o do pedido)"],
  ["São Paulo/Brasil", "America/Sao_Paulo", "★ formato Cidade/País com acento"],
  ["Tokyo, Japan", "Asia/Tokyo", "separado por vírgula"],
  ["America/Sao_Paulo", "America/Sao_Paulo", "ID IANA completo"],
  ["nova york", "America/New_York", "apelido em português"],
  ["toquio", "Asia/Tokyo", "apelido sem acento"],
  ["londres", "Europe/London", "apelido"],
  ["sp", "America/Sao_Paulo", "sigla"],
  ["utc", "UTC", "UTC"],
];
for (const [entrada, esperado, oque] of casos) {
  ok(buscarFuso(entrada).exato === esperado, `${oque}: "${entrada}" → ${esperado}`);
}
ok(buscarFuso("cidadequenaoexiste").exato === null, "cidade inexistente → sem resultado");
ok(buscarFuso("").exato === null, "termo vazio não explode");

// ── 2. Formatação e diferenças ──
console.log("\n── horas ──");
const quando = new Date("2026-08-20T12:00:00Z");
const sp = agoraEm("America/Sao_Paulo", { quando });
const md = agoraEm("Europe/Madrid", { quando });
ok(sp.hora === "09:00", `São Paulo às 12:00 UTC → ${sp.hora} (UTC-3)`);
ok(md.hora === "14:00", `Madrid às 12:00 UTC → ${md.hora} (UTC+2 no verão)`);
ok(sp.offset === "UTC-03:00", `offset de SP: ${sp.offset}`);
ok(md.offset === "UTC+02:00", `offset de Madrid: ${md.offset}`);
ok(diferenca("Europe/Madrid", "America/Sao_Paulo", "pt", quando) === "5h à frente",
  "★ diferença: Madrid está 5h à frente de São Paulo");
ok(diferenca("America/Sao_Paulo", "Europe/Madrid", "pt", quando) === "5h atrás",
  "★ e São Paulo, 5h atrás de Madrid");
ok(diferenca("UTC", "UTC", "pt", quando) === "mesma hora", "mesmo fuso → \"mesma hora\"");
ok(diferenca("Europe/Madrid", "America/Sao_Paulo", "en", quando) === "5h ahead", "EN: \"5h ahead\"");
ok(agoraEm("Asia/Kolkata", { quando }).offset === "UTC+05:30", "fuso com meia hora (Índia) formata certo");
ok(agoraEm("America/Sao_Paulo", { quando, formato24: false }).hora.includes("AM"), "formato 12h");
ok(fusoValido("Europe/Madrid") && !fusoValido("Nao/Existe"), "fusoValido separa o joio do trigo");
ok(cidadeDoFuso("America/Argentina/Buenos_Aires") === "Buenos Aires", "nome legível de fuso aninhado");

// ── 3. Comando ──
console.log("\n── comando ──");
await import("./main.js");
const c = globalThis.__client;
await c.emitAll("ready");

const env = [];
const server = {
  id: "S1", ownerId: "U1", name: "Resenhudos", roles: new Map(), channels: [],
  fetchMember: async () => null, fetchMembers: async () => ({ members: [] }), fetchBans: async () => [],
};
c.servers.set("S1", server);
c.channels.set("C1", { id: "C1", sendMessage: async () => {} });
const mk = (t) => ({
  authorId: "U1", content: t, serverId: "S1", server,
  channel: { id: "C1", sendMessage: async (p) => env.push(p) }, channelId: "C1",
  mentionIds: [], createdAt: new Date(), author: { username: "Ghieh" }, member: { roles: [] },
});
const say = async (t) => { await c.emitAll("messageCreate", mk(t)); };
const ult = () => JSON.stringify(env[env.length - 1] ?? {});

await say("&fuso");
ok(ult().includes("Nenhuma cidade"), "&fuso vazio explica como começar");

await say("&fuso add São Paulo");
ok(ult().includes("adicionada") && ult().includes("Sao Paulo"), "★ &fuso add São Paulo");
await say("&fuso add Madrid/Europa");
ok(ult().includes("adicionada"), "★ &fuso add Madrid/Europa (formato do pedido)");
await say("&fuso add Tokyo");
ok(ult().includes("adicionada"), "&fuso add Tokyo");

await say("&fuso");
const lista = ult();
ok(lista.includes("Sao Paulo") && lista.includes("Madrid") && lista.includes("Tokyo"), "&fuso lista as três");
ok(lista.indexOf("Sao Paulo") < lista.indexOf("Madrid") && lista.indexOf("Madrid") < lista.indexOf("Tokyo"),
  "★ ordenado por fuso (SP → Madrid → Tokyo), não por ordem de adição");
ok(lista.includes("referência"), "  → marca a cidade de referência");
ok(lista.includes("à frente"), "  → mostra as diferenças");

await say("&fuso add São Paulo");
ok(ult().includes("Já está"), "não duplica cidade");

await say("&fuso apelido Madrid Europa");
ok(ult().includes("Europa"), "★ &fuso apelido Madrid Europa");
await say("&fuso");
ok(ult().includes("Europa"), "  → a lista usa o apelido");

await say("&fuso principal Madrid");
ok(ult().includes("Referência"), "&fuso principal Madrid");
await say("&fuso");
ok(ult().includes("atrás"), "  → diferenças recalculadas a partir de Madrid");

await say("&fuso ver Lisboa");
ok(ult().includes("Lisbon"), "&fuso ver <cidade> sem configurar");
await say("&fuso Lisboa");
ok(ult().includes("Lisbon"), "★ atalho: &fuso <cidade> funciona como \"ver\"");

await say("&fuso buscar york");
ok(ult().includes("New York"), "&fuso buscar <termo>");

await say("&fuso ver cidadeinexistente");
ok(ult().includes("não encontrada"), "cidade inexistente → mensagem clara");
await say("&fuso add porto");
ok(ult().includes("Porto") || ult().includes("adicionada") || ult().includes("quis dizer"),
  "termo ambíguo → resolve ou sugere");

await say("&fuso formato 12");
ok(ult().includes("Formato"), "&fuso formato 12");
await say("&fuso formato 24");
ok(ult().includes("Formato"), "&fuso formato 24");

await say("&fuso remove Tokyo");
ok(ult().includes("removida"), "&fuso remove");
await say("&fuso");
ok(!ult().includes("Tokyo"), "  → sumiu da lista");

// ── 4. Inglês ──
console.log("\n── inglês ──");
await say("&idioma en");
env.length = 0;
await say("&fuso");
ok(ult().includes("Timezones") || ult().includes("reference"), "EN: &fuso");
await say("&timezone add Berlin");
ok(ult().includes("added"), "EN: &timezone add (alias)");
await say("&fuso search tokyo");
ok(ult().includes("Tokyo"), "EN: &fuso search (subcomando traduzido)");
await say("&fuso label Berlin Germany");
ok(ult().includes("Germany"), "EN: &fuso label");
await say("&fuso clear");
ok(ult().includes("cleared"), "EN: &fuso clear");

console.log(`\nFUSO: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
