// Relatório horário do dono do bot (&servidores relatorio).
import assert from "node:assert";
import fs from "node:fs";

process.env.DB_PATH = "/tmp/rel.db"; process.env.CONFIG_PATH = "/tmp/rel.json";
process.env.LLM_URL = "http://llm.test"; process.env.LLM_MODEL = "conversa";
process.env.SUPER_ADMINS = "01K9JKP85D5EP2ZTEHS8DT797A";
for (const f of ["/tmp/rel.db", "/tmp/rel.json"]) { try { fs.unlinkSync(f); } catch {} }
const db = await import("./modulos/core/db.js"); db.abrirBanco("/tmp/rel.db");
const rel = await import("./modulos/ferramentas/relatorio.js");
const log = await import("./modulos/core/log.js");

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};
const HORA = 3600_000;
const ate = Math.floor(Date.now() / HORA) * HORA + HORA;   // fim da hora atual
const MEU = { id: "01KH9SJYWVD7XAHJ28TP0YP4Q0", name: "Vapor Nexus", ownerId: "01K9JKP85D5EP2ZTEHS8DT797A" };
const ALHEIO = { id: "01KQ55ZPRP8C5THN5B28DN6AB2", name: "Servidor de outra pessoa", ownerId: "01OUTRODONO0000000000000000" };
const client = { servers: { values: () => [MEU, ALHEIO].values() } };

console.log("\n── coleta ──");
await t("o log.registrar alimenta o relatório MESMO sem canal de log", async () => {
  await log.registrar({ serverId: ALHEIO.id, config: {} }, "punicoes", { titulo: "🔨 Membro banido", descricao: "x" });
  const ev = db.eventosRelatorio(ate - HORA, ate);
  assert.ok(ev.some((e) => e.serverId === ALHEIO.id && e.titulo === "Membro banido"), JSON.stringify(ev));
});
await t("erros do log real de 27/09 se agrupam por padrão", () => {
  const reais = [
    "[RSS] falha ao ler https://nitter.net/fernandoulrich/rss: connect ECONNREFUSED 185.246.188.105:443",
    "[RSS] falha ao ler https://nitter.net/bitdov/rss: connect ECONNREFUSED 185.246.188.105:443",
    "[RSS] falha ao ler https://nitter.net/AkitaOnRails/rss: connect ECONNREFUSED 185.246.188.105:443",
    "[BANGLOBAL] auto: falha em teste: o bot não tem a permissão **AssignRoles** (ou o cargo de silêncio está acima do cargo dele)",
    "[BANGLOBAL] auto: falha em teste: o bot não tem a permissão **AssignRoles** (ou o cargo de silêncio está acima do cargo dele)",
  ];
  const padroes = new Set(reais.map(rel.normalizarErro));
  assert.equal(padroes.size, 2, [...padroes].join(" | "));
});
await t("mensagens: conta ritmo; amostra só onde tem assunto; ignora bot e comando", () => {
  rel.esvaziarAtividade();
  rel.mensagem(MEU.id, "alguém viu o jogo ontem? foi incrível", { autorId: "A", comAssunto: true });
  rel.mensagem(MEU.id, "&help automod", { autorId: "B", comAssunto: true });
  rel.mensagem(MEU.id, "mensagem de bot aqui qualquer", { autorId: "BOT", ehBot: true, comAssunto: true });
  rel.mensagem(ALHEIO.id, "conversa privada da outra comunidade", { autorId: "C", comAssunto: false });
  const a = rel.copiaAtividade();
  assert.equal(a.get(MEU.id).msgs, 2, "bot não conta");
  assert.deepEqual(a.get(MEU.id).amostras, ["alguém viu o jogo ontem? foi incrível"], "comando não vira assunto");
  assert.equal(a.get(ALHEIO.id).msgs, 1);
  assert.deepEqual(a.get(ALHEIO.id).amostras, [], "servidor alheio: só conta, não guarda texto");
});

console.log("\n── quem tem assunto ──");
await t("sem lista: só os servidores de que um dono do bot é dono", () => {
  assert.equal(rel.temAssunto(MEU, {}), true);
  assert.equal(rel.temAssunto(ALHEIO, {}), false);
});
await t("com lista: vale a lista", () => {
  assert.equal(rel.temAssunto(ALHEIO, { assuntos: [ALHEIO.id] }), true);
  assert.equal(rel.temAssunto(MEU, { assuntos: [ALHEIO.id] }), false);
});

console.log("\n── a hora inteira ──");
let promptVisto = null;
const llmBom = async (_u, opts) => {
  promptVisto = JSON.parse(opts.body).messages[0].content;
  return { ok: true, json: async () => ({ choices: [{ message: { content: "<think>pensando</think>**Destaques**\nUm ban no servidor de outra pessoa." } }] }) };
};
await t("relatório completo: prosa do modelo + números do código", async () => {
  rel.evento(null, "boot", "bot iniciou", ate - HORA / 2);
  const r = await rel.gerar({ client, cfg: {}, ate, fetcher: llmBom, esvaziar: false });
  assert.match(r.description, /\*\*Destaques\*\*/);
  assert.match(r.description, /Servidor de outra pessoa/);
  assert.match(r.description, /Membro banido/);
  assert.match(r.description, /reiniciou 1×/);
  assert.doesNotMatch(r.description, /<think>|pensando/, "o raciocínio do modelo não pode vazar");
});
await t("PRIVACIDADE: texto de servidor alheio nunca chega ao modelo", () => {
  assert.ok(promptVisto, "o modelo nem foi chamado");
  assert.doesNotMatch(promptVisto, /conversa privada da outra comunidade/);
  assert.match(promptVisto, /alguém viu o jogo ontem/, "o servidor do dono tem de ir");
});
await t("modelo fora do ar: o relatório sai com os números mesmo assim", async () => {
  const r = await rel.gerar({ client, cfg: {}, ate, fetcher: async () => { throw new Error("offline"); }, esvaziar: false });
  assert.match(r.description, /Membro banido/);
  assert.match(r.description, /modelo não respondeu/);
});
await t("'relatorio agora' não rouba a contagem da hora", async () => {
  await rel.gerar({ client, cfg: {}, ate, fetcher: llmBom, esvaziar: false });
  assert.ok(rel.copiaAtividade().get(MEU.id)?.msgs >= 1);
});
await t("o relatório das :00 esvazia a contagem (a próxima hora começa do zero)", async () => {
  await rel.gerar({ client, cfg: {}, ate, fetcher: llmBom, esvaziar: true });
  assert.equal(rel.copiaAtividade().size, 0);
});
await t("hora tranquila: marcada como vazia, sem chamar o modelo", async () => {
  let chamou = false;
  const r = await rel.gerar({ client, cfg: {}, ate: ate + 5 * HORA, fetcher: async () => { chamou = true; }, esvaziar: true });
  assert.equal(r.vazio, true); assert.equal(chamou, false);
  assert.match(r.description, /Hora tranquila/);
});
await t("poda: o banco guarda só 48h", async () => {
  rel.evento("X", "punicoes", "velho", ate - 72 * HORA);
  await rel.gerar({ client, cfg: {}, ate, fetcher: llmBom });
  assert.equal(db.eventosRelatorio(ate - 100 * HORA, ate - 49 * HORA).length, 0);
});
await t("teto de erros por hora (um laço de erro não enche o banco)", () => {
  const h0 = ate + 20 * HORA;
  for (let i = 0; i < 1000; i++) rel.erro(`falha ${i}`, h0 + i);
  assert.ok(db.eventosRelatorio(h0, h0 + HORA).length <= 300);
});

console.log(`\nRELATÓRIO: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
