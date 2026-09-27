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

console.log("\n── o relatório REAL de 27/09 (14:30–15:30) ──");
// O texto que o modelo escreveu, como apareceu no canal. Só o Vapor Nexus
// tinha amostras: os outros dois entraram na lista DEPOIS das mensagens.
const PROSA_REAL = [
  "**Destaques**",
  "O bot reiniciou 3 vezes durante o período, indicando instabilidade na execução dos processos.",
  "",
  "**Assuntos**",
  "**Vapor Nexus**",
  "*   Discussão sobre recomendações de conteúdo (\"oloco achei daora\").",
  "*   Planejamento de transmissões ao vivo (lives) futuras.",
  "",
  "**🎃 Queremos acordar tarde!**",
  "*   Foco na temática do despertar tardio como ponto central da conversa.",
  "",
  "**Brasil ClJS**",
  "*   Baixa atividade, com um único registro de interação.",
  "",
  "**Erros**",
  "Falhas de permissão (AssignRoles) em vários servidores.",
].join("\n");
const VAPOR = "01KH9SJYWVD7XAHJ28TP0YP4Q0", QUEREMOS = "01KQ55ZPRP8C5THN5B28DN6AB2", CLJS = "01KZKFDGS0SANQEN4CJZ6MAN42";
const nomes27 = new Map([[VAPOR, "Vapor Nexus"], [QUEREMOS, "🎃 Queremos acordar tarde!"], [CLJS, "Brasil ClJS"]]);
const amostras27 = new Map([
  [VAPOR, { msgs: 21, autores: new Set(), amostras: ["oloco achei daora", "quer call?  To pensando em fazer live hj dnv"] }],
  [QUEREMOS, { msgs: 19, autores: new Set(), amostras: [] }],
  [CLJS, { msgs: 1, autores: new Set(), amostras: [] }],
]);
const limpo = rel.limparAssuntos(PROSA_REAL, amostras27, nomes27);
await t("assunto inventado pelo NOME do servidor sai", () => {
  assert.doesNotMatch(limpo, /despertar tardio/);
  assert.doesNotMatch(limpo, /Queremos acordar tarde/);
});
await t("servidor sem amostra não ganha 'assunto' nenhum", () => assert.doesNotMatch(limpo, /Brasil ClJS/));
await t("o servidor COM amostra fica, com os assuntos", () => {
  assert.match(limpo, /Vapor Nexus/); assert.match(limpo, /Planejamento de transmissões/);
});
await t("frase copiada de um membro sai; o assunto fica", () => {
  assert.doesNotMatch(limpo, /oloco achei daora/);
  assert.match(limpo, /recomendações de conteúdo/);
});
await t("Destaques e Erros não são tocados", () => {
  assert.match(limpo, /\*\*Destaques\*\*/); assert.match(limpo, /\*\*Erros\*\*\nFalhas de permissão/);
});
await t("se nenhum servidor tinha amostra, a seção Assuntos some inteira", () => {
  const nada = rel.limparAssuntos(PROSA_REAL, new Map([[QUEREMOS, { amostras: [] }]]), nomes27);
  assert.doesNotMatch(nada, /Assuntos/); assert.match(nada, /\*\*Erros\*\*/);
});

console.log("\n── reinícios: manutenção não é instabilidade ──");
await t("3 reinícios por deploy/restart aparecem como tal", () => {
  const h0 = 1_000 * HORA;
  const ev = [
    { t: h0 - 60_000, tipo: "desligar", titulo: "deploy/restart" }, { t: h0 + 60_000, tipo: "boot", titulo: "x" },
    { t: h0 + 9e5, tipo: "desligar", titulo: "deploy/restart" },    { t: h0 + 1e6, tipo: "boot", titulo: "x" },
    { t: h0 + 2e6, tipo: "desligar", titulo: "watchdog" },          { t: h0 + 2.1e6, tipo: "boot", titulo: "x" },
    { t: h0 + 3e6, tipo: "boot", titulo: "x" },
  ];
  const g = rel.agrupar(ev, { desde: h0 });
  assert.equal(g.reinicios, 4);
  assert.deepEqual(Object.fromEntries(g.causas), { "deploy/restart": 2, watchdog: 1, "queda sem aviso": 1 });
  const n = rel.montarNumeros({ grupos: g, atividade: new Map(), nomes: new Map(), desde: h0, ate: h0 + HORA });
  assert.match(n.texto, /2× deploy\/restart · 1× watchdog · 1× queda sem aviso/);
});
await t("o 'desligar' pode vir da hora anterior (boot logo depois das :00)", () => {
  const h0 = 2_000 * HORA;
  const g = rel.agrupar([{ t: h0 - 30_000, tipo: "desligar", titulo: "deploy/restart" }, { t: h0 + 90_000, tipo: "boot", titulo: "x" }], { desde: h0 });
  assert.deepEqual(g.causas, [["deploy/restart", 1]]);
});
await t("linha de erro cortada em palavra, não no meio dela", () => {
  const c = rel.cortar("[BANGLOBAL] auto: falha em teste: o bot não tem a permissão **AssignRoles** (ou o cargo de silêncio está acima do cargo dele)", 110);
  assert.ok(c.endsWith("…")); assert.doesNotMatch(c, /\s…$/); assert.ok(c.length <= 110);
});

console.log("\n── o relatório REAL de 27/09 (16:00–17:00) ──");
await t("assuntos sem nome de servidor ganham o nome (só um tinha amostras)", () => {
  const prosa = ["**Assuntos**", "*   Discussão sobre o Discord versus alternativas.", "*   Banimentos do Discord por país.", "", "**Erros**", "x"].join("\n");
  const Q = "01KQ55ZPRP8C5THN5B28DN6AB2";
  const out = rel.limparAssuntos(prosa, new Map([[Q, { amostras: ["tambem tem tanto clone de discord sendo feito no momento"] }]]),
    new Map([[Q, "🎃 Queremos acordar tarde!"]]));
  assert.match(out, /\*\*Assuntos\*\*\n\*\*🎃 Queremos acordar tarde!\*\*\n\*   Discussão/);
});
await t("erro do dia inteiro é marcado como persistente, não 'temporário'", () => {
  const nitter = rel.normalizarErro("[RSS] falha ao ler https://nitter.net/bitdov/rss: connect ECONNREFUSED 185.246.188.105:443");
  const ate = 3_000 * HORA;
  const ev = [];
  for (let h = 0; h < 20; h++) ev.push({ t: ate - h * HORA - 60_000, tipo: "erro", titulo: nitter });   // 1× por hora, 20 horas
  ev.push({ t: ate - 60_000, tipo: "erro", titulo: "erro novo desta hora" });
  const p = rel.persistenciaDosErros(ev, ate);
  assert.equal(p.get(nitter), 20);
  assert.equal(p.get("erro novo desta hora"), 1);
  const g = rel.agrupar(ev.filter((e) => e.t >= ate - HORA), { desde: ate - HORA });
  g.persistencia = p;
  const n = rel.montarNumeros({ grupos: g, atividade: new Map(), nomes: new Map(), desde: ate - HORA, ate });
  assert.match(n.texto, /em 20 das últimas 24 h/);
  assert.match(n.texto, /primeira vez nas últimas 24 h/);
});
await t("imagem: o evento aponta quem e onde, e a descrição fica no log", async () => {
  const src = (await import("node:fs")).readFileSync("./modulos/moderacao/imagem.js", "utf8");
  assert.match(src, /— <@\$\{userId\}> em <#\$\{canalId\}>/, "o relatório precisa dizer quem e onde");
  assert.match(src, /\[IMAGEM\] descrição/, "a descrição do modelo tem de ir para o log");
  assert.match(src, /alerta NÃO entregue/, "sem canal, o alerta não pode sumir calado");
});

console.log(`\nRELATÓRIO: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
