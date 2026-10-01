// Rodada de 1 out 2026 — o que os prints de 27/09–01/10 mostraram:
//   ban de quem já estava banido dava "Erro: DatabaseError"; não havia silêncio
//   manual e o do automod dependia de cargo; cargos de nível não chegavam a
//   todos; os ◀ ▶ morriam depois de 15 min (e de qualquer reinício); resumo de
//   RSS em inglês; a busca apagava a palavra "google" da consulta e as fontes
//   geravam prévias.
// Cada bloco reproduz o caso real e falha com o código antigo.

import assert from "node:assert";
import fs from "node:fs";

process.env.DB_PATH = "/tmp/t01out.db"; process.env.CONFIG_PATH = "/tmp/t01out.json";
for (const f of ["/tmp/t01out.db", "/tmp/t01out.db-wal", "/tmp/t01out.db-shm", "/tmp/t01out.json"]) { try { fs.unlinkSync(f); } catch {} }
const db = await import("./modulos/core/db.js"); db.abrirBanco("/tmp/t01out.db");

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};
const silencio = (fn) => async (...a) => { const o = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return await fn(...a); } finally { [console.log, console.warn, console.error] = o; } };

// ─── Ban ─────────────────────────────────────────────────────────────────────
console.log("\n── ban de quem já está banido ──");
const { banir, pareceBanDuplicado } = await import("./modulos/core/banir.js");
// A SDK rejeita com o corpo CRU como string (ver learnings) — o fixture também.
const CORPO_DUP = '{"type":"DatabaseError","operation":"insert_one","collection":"server_bans"}';
const ALVO = "01M3BE5EPYKQY1J6RJ9VD8J1EP";
await t("DatabaseError ao banir quem está na lista de bans → \"já estava\", sem erro", silencio(async () => {
  const srv = { id: "S", banUser: async () => { throw CORPO_DUP; }, fetchBans: async () => [{ id: { server: "S", user: ALVO } }] };
  assert.deepEqual(await banir(srv, ALVO, { reason: "x" }), { ok: true, jaEstava: true });
}));
await t("DatabaseError com a pessoa FORA da lista continua sendo erro (não engole falha real)", silencio(async () => {
  const srv = { id: "S", banUser: async () => { throw CORPO_DUP; }, fetchBans: async () => [] };
  await assert.rejects(() => banir(srv, ALVO));
}));
await t("outros erros passam direto (NotElevated não vira sucesso)", silencio(async () => {
  const srv = { id: "S", banUser: async () => { throw '{"type":"NotElevated"}'; }, fetchBans: async () => [{ id: { user: ALVO } }] };
  await assert.rejects(() => banir(srv, ALVO));
  assert.equal(pareceBanDuplicado('{"type":"DatabaseError","collection":"server_members"}'), false);
}));
await t("descreverErro não devolve mais \"undefined\" para o corpo da SDK", async () => {
  const { descreverErro } = await import("./modulos/core/erros.js");
  assert.match(descreverErro(CORPO_DUP), /DatabaseError/);
  assert.notEqual(descreverErro("{}"), "undefined");
});

// ─── Silêncio = timeout nativo ───────────────────────────────────────────────
console.log("\n── silêncio pelo timeout nativo ──");
const { lerDuracao, duracaoTexto } = await import("./modulos/moderacao/silenciar.js");
await t("durações: 30s, 10m, 2h, 1d, 1w, 1h30m, número = minutos; lixo = null", () => {
  assert.equal(lerDuracao("30s"), 30e3); assert.equal(lerDuracao("10m"), 600e3);
  assert.equal(lerDuracao("2h"), 7200e3); assert.equal(lerDuracao("1d"), 86400e3);
  assert.equal(lerDuracao("1w"), 7 * 86400e3); assert.equal(lerDuracao("1h30m"), 5400e3);
  assert.equal(lerDuracao("15"), 900e3); assert.equal(lerDuracao("abc"), null); assert.equal(lerDuracao("10x"), null);
  assert.equal(duracaoTexto(5400e3), "1 h 30 min");
});

const engine = await import("./modulos/moderacao/automod-engine.js");
const confianca = await import("./modulos/moderacao/confianca.js");
function cenario({ editFalha = null } = {}) {
  const edicoes = [];
  const membro = { id: { server: "S1", user: "U1" }, roles: ["AUTO"], edit: async (d) => { if (editFalha) throw editFalha; edicoes.push(d); } };
  const server = { id: "S1", roles: new Map(), fetchMember: async () => membro, channels: [] };
  const enviados = [];
  const ctx = {
    serverId: "S1", PREFIXO: "&", COR: { erro: 1, aviso: 2, mod: 3, sucesso: 4, info: 5 },
    config: { language: "pt", automod: { punicao: { modo: "acumular", escada: "5m,ban", silenceRoleId: "CARGO_VELHO" } }, log: {} },
    sendEmbed: async (_c, e) => { enviados.push(e); return { id: "m" }; },
  };
  return { edicoes, membro, server, ctx, enviados };
}
await t("mute da escada: timeout de ~5 min, e NENHUM cargo é dado", silencio(async () => {
  const c = cenario();
  const antes = Date.now();
  await engine._aplicarPunicao(c.ctx, { server: c.server, channel: {}, message: null, userId: "U1", motivo: "spam", apagar: false });
  assert.equal(c.edicoes.length, 1, "uma edição");
  assert.ok(!("roles" in c.edicoes[0]), "não mexe em cargos");
  const ms = new Date(c.edicoes[0].timeout).getTime() - antes;
  assert.ok(ms > 290e3 && ms < 310e3, `timeout de ~5 min (${ms})`);
  assert.ok(db.lerPunicao("S1", "U1")?.silencioAte > antes, "prazo no banco (para reaplicar se sair e voltar)");
}));
await t("modo confirmar: timeout com teto (24 h), não cargo eterno", silencio(async () => {
  const c = cenario(); c.ctx.config.automod.punicao.modo = "confirmar";
  await engine._aplicarPunicao(c.ctx, { server: c.server, channel: {}, message: null, userId: "U2", motivo: "golpe", apagar: false });
  const ms = new Date(c.edicoes[0].timeout).getTime() - Date.now();
  assert.ok(ms > 23.9 * 3600e3 && ms <= 24 * 3600e3, `~24 h (${ms})`);
}));
await t("timeout recusado (IsElevated) → quarentena, e a ação diz por quê", silencio(async () => {
  const c = cenario({ editFalha: '{"type":"IsElevated"}' });
  await engine._aplicarPunicao(c.ctx, { server: c.server, channel: {}, message: null, userId: "U3", motivo: "spam", apagar: false });
  assert.ok(confianca.emQuarentena("S1", "U3"), "em quarentena");
  assert.match(c.enviados.at(-1).description, /TimeoutMembers/);
}));
await t("&cargomudo e o passo do assistente aposentados (só um aviso)", async () => {
  const { cmdCargoMudo } = await import("./modulos/moderacao/comandos-admin.js");
  let e = null;
  await cmdCargoMudo({}, [], { PREFIXO: "&", COR: { info: 1 }, config: { language: "pt", automod: { punicao: {} } }, sendEmbed: async (_c, x) => { e = x; } });
  assert.match(e.title, /aposentado/);
  const { ROTEIROS } = await import("./modulos/moderacao/assistente.js");
  assert.ok(Object.values(ROTEIROS).every((r) => !r.includes("silencio")));
});

// ─── Cargos de nível ─────────────────────────────────────────────────────────
console.log("\n── cargos de nível e a hierarquia do Stoat ──");
const nivel = await import("./modulos/ferramentas/nivel.js");
const roles = new Map([["BOT", { rank: 2 }], ["STAFF", { rank: 1 }], ["N5", { rank: 5 }], ["N10", { rank: 6 }], ["N_ALTO", { rank: 0 }]]);
const srvX = { id: "SX", name: "Servidor X", roles };
const bot = { roles: ["BOT"] };
await t("um cargo acima do bot não derruba os outros (antes: tudo numa edição → NotElevated)", () => {
  const p = nivel.planejarCargos({ server: srvX, botMember: bot, member: { roles: [] }, faltando: ["N5", "N_ALTO", "N10"] });
  assert.deepEqual(p.dar, ["N5", "N10"]); assert.deepEqual(p.acimaDoBot, ["N_ALTO"]);
});
await t("pessoa acima do bot (staff): nada é tentado, e o motivo é registrado", () => {
  const p = nivel.planejarCargos({ server: srvX, botMember: bot, member: { roles: ["STAFF"] }, faltando: ["N5"] });
  assert.deepEqual(p.dar, []); assert.equal(p.membroAcima, true);
});
await t("bot sem cargo nenhum: o Stoat não deixa dar cargo a ninguém", () => {
  assert.equal(nivel.planejarCargos({ server: srvX, botMember: { roles: [] }, member: { roles: [] }, faltando: ["N5"] }).botSemCargo, true);
});
await t("sincronizar dá o que pode e devolve o bloqueio explicado", silencio(async () => {
  db.setCargoNivel("SX", 5, "N5"); db.setCargoNivel("SX", 10, "N_ALTO");
  db.setXp("SX", "P1", 99999, 12, new Date().toISOString());
  let cargos = [];
  const membro = { id: { server: "SX", user: "P1" }, get roles() { return cargos; }, edit: async ({ roles: r }) => { cargos = [...r]; } };
  const r = await nivel.sincronizarCargos(srvX, membro, "SX", { botMember: bot });
  assert.deepEqual(r.concedidos, ["N5"]); assert.deepEqual(cargos, ["N5"]);
  assert.match(nivel.explicarBloqueio(r, "pt"), /acima do cargo do bot/);
}));
await t("quem já tinha o nível é reconferido ao ganhar XP — no máximo a cada 6 h", () => {
  assert.equal(nivel.deveReconferir("SX", "P9", 1_000_000), true);
  assert.equal(nivel.deveReconferir("SX", "P9", 1_000_000 + 3600e3), false);
  assert.equal(nivel.deveReconferir("SX", "P9", 1_000_000 + 7 * 3600e3), true);
});

// ─── Paginação ───────────────────────────────────────────────────────────────
console.log("\n── ◀ ▶ depois de reiniciar ──");
await t("a sessão sobrevive à memória: reação numa mensagem antiga ainda vira a página", async () => {
  const pg = await import("./modulos/core/paginas.js");
  const ctx = { sendEmbed: async () => ({ id: "MSG_REL", react: async () => {} }), COR: { info: 1 }, config: { language: "pt" } };
  await pg.enviarPaginado(ctx, {}, { paginas: [{ title: "Rel", description: "página um" }, { title: "Rel", description: "página dois" }], autorId: null });
  // simula o reinício: a sessão some da memória, fica só o banco
  const salva = db.carregarSessaoPaginas("MSG_REL");
  assert.ok(salva?.paginas?.length === 2, "gravada no banco");
  const mod = await import(`./modulos/core/paginas.js?reinicio=${Date.now()}`);
  let editado = null;
  const tratou = await mod.aoReagir("MSG_REL", "QUALQUER", "▶", { edit: async (d) => { editado = d; } });
  assert.equal(tratou, true);
  assert.match(editado.embeds[0].description, /página dois/);
  assert.equal(db.carregarSessaoPaginas("MSG_REL").idx, 1, "a página atual também fica no banco");
});

// ─── RSS em português ────────────────────────────────────────────────────────
console.log("\n── resumo de RSS em português ──");
const rss = await import("./modulos/ferramentas/rss.js");
await t("títulos em inglês de 01/10 são detectados; os em português não", () => {
  for (const x of ["Miracle on FlyDubai", "A Closer Look at Australopithecus Africanus", "[$] LWN.net Weekly Edition for October 1, 2026",
    "\"Extraction is Still a Major Part of Marathon\" – Marathon Game Director Reassures Fans"]) assert.ok(rss.pareceOutroIdioma(x), x);
  for (const x of ["Apple terá Home Hub com Photo Face semelhante ao StandBy do iPhone", "Bitcoin sobe 5%", "Nintendo Switch 2"]) assert.ok(!rss.pareceOutroIdioma(x), x);
});
await t("item sem frase do modelo ganha 2ª tentativa; o que sobrar em inglês é traduzido", silencio(async () => {
  const itens = [
    { titulo: "Apple terá Home Hub com Photo Face", resumo: "", link: "https://x.com/a" },
    { titulo: "Miracle on FlyDubai", resumo: "", link: "https://x.com/b" },
    { titulo: "A Closer Look at Australopithecus Africanus", resumo: "", link: "https://x.com/c" },
  ];
  let chamadas = 0;
  const enviados = [];
  rss.configurarRelatorio({
    linhas: async (_m, { quantidade }) => { chamadas++; return chamadas === 1 ? "1 | A Apple prepara um Home Hub com recurso Photo Face." : (quantidade === 2 ? "**3** | Um olhar sobre o Australopithecus africanus." : ""); },
    comentario: async () => "",
    traduzir: async (m) => m.split("\n").map((l) => l.replace("Miracle on FlyDubai", "Milagre na FlyDubai")).join("\n"),
  });
  await rss.publicarRelatorio({ sendMessage: async (x) => enviados.push(x.embeds[0]) }, itens, { agora: "x" });
  const d = enviados[0].description;
  assert.equal(chamadas, 2, "uma 2ª tentativa só para os que faltaram");
  assert.match(d, /Australopithecus africanus\./); assert.match(d, /Milagre na FlyDubai/);
  assert.doesNotMatch(d, /Miracle on/);
}));

// ─── Busca ───────────────────────────────────────────────────────────────────
console.log("\n── busca ──");
const busca = await import("./modulos/ai/busca.js");
await t("a palavra \"google\" fica na consulta (o gatilho antigo a apagava)", () => {
  const q = busca.limparConsulta("r/enhitification, quais são as recentes coisas do google");
  assert.match(q, /google/); assert.doesNotMatch(q, /^[,"]/);
});
await t("subreddit vira consulta no reddit; nada de vírgula ou aspas na frente", () => {
  const cs = busca.consultasDeterministicas('pesquise, dentro do subreddit r/enhification sobre as mudanças recentes do Google');
  assert.ok(cs.some((q) => q.startsWith("site:reddit.com/r/enhification")), cs.join(" | "));
  assert.ok(cs.every((q) => !/^[,'"]/.test(q)), cs.join(" | "));
  assert.match(cs[0], /Google/);
});
await t("a reescrita do modelo não pode perder o subreddit pedido", async () => {
  const r = await busca.decidirConsultas("o que falam em r/linux sobre o kernel 6.12", { chamarJson: async () => '{"consultas":["kernel 6.12 novidades"]}' });
  assert.ok(r.consultas.some((q) => q.includes("site:reddit.com/r/linux")), r.consultas.join(" | "));
});
await t("resultado que não fala do pedido fica de fora; página lida entra no contexto", async () => {
  const fetcher = async (url) => {
    if (url.includes("/search?")) return { ok: true, json: async () => ({ results: [
      { title: "G1 — últimas notícias", url: "https://g1.globo.com/", content: "Tudo sobre política e futebol" },
      { title: "Enshittification of Google Search", url: "https://blog.ex/enshit", content: "How Google search got worse" },
    ] }) };
    return { ok: true, headers: { get: () => "text/html" }, text: async () => "<html><script>x</script><p>Google search enshittification: ads first, results later, AI overviews pushing links down the page.</p></html>" };
  };
  process.env.SEARXNG_URL = "http://searx";
  const r = await busca.pesquisar("enshittification do google", { fetcher, chamarJson: async () => '{"consultas":["google enshittification"]}' });
  assert.equal(r.resultados.length, 1); assert.match(r.resultados[0].url, /enshit/);
  assert.match(r.resultados[0].texto, /ads first/); assert.doesNotMatch(r.resultados[0].texto, /<script>|x<\/script>/);
});
await t("fontes como [domínio](<url>) — o Stoat não gera prévia para link entre < >", () => {
  const rod = busca.rodapeFontes("Segundo [1], a busca piorou.", [{ titulo: "a", url: "https://fasdainternet.com.br/x" }], ["google busca"]);
  assert.match(rod, /\[1\] \[fasdainternet\.com\.br\]\(<https:\/\/fasdainternet\.com\.br\/x>\)/);
});
await t("link solto na resposta vira <link>; código e link já protegido ficam como estão", () => {
  assert.equal(busca.semPreviaDeLinks("veja https://ex.com/a."), "veja <https://ex.com/a>.");
  assert.equal(busca.semPreviaDeLinks("[aqui](https://ex.com)"), "[aqui](<https://ex.com>)");
  assert.equal(busca.semPreviaDeLinks("`curl https://ex.com`"), "`curl https://ex.com`");
  assert.equal(busca.semPreviaDeLinks("<https://ex.com>"), "<https://ex.com>");
});

// ─── Relatório só no servidor do dono ────────────────────────────────────────
console.log("\n── relatório só no servidor do dono ──");
const rel = await import("./modulos/ferramentas/relatorio.js");
await t("RELATORIO_SERVIDOR: só ele tem assuntos, mesmo com outros na lista ou de dono do bot", () => {
  process.env.RELATORIO_SERVIDOR = "MEU";
  const cfg = { assuntos: ["OUTRO"] };
  assert.equal(rel.temAssunto({ id: "MEU" }, cfg), true);
  assert.equal(rel.temAssunto({ id: "OUTRO" }, cfg), false);
  assert.equal(rel.temAssunto({ id: "DO_DONO", ownerId: "EU" }, {}, ["EU"]), false);
  delete process.env.RELATORIO_SERVIDOR;
  assert.equal(rel.temAssunto({ id: "OUTRO" }, cfg), true, "sem a variável, vale a lista como antes");
});
await t("&servidores fora do servidor do dono não abre o painel", async () => {
  process.env.RELATORIO_SERVIDOR = "MEU";
  const { cmdServidores } = await import("./modulos/moderacao/servidores.js");
  let e = null;
  await cmdServidores({ authorId: "EU", serverId: "OUTRO", channel: {} }, ["relatorio"], {
    COR: { erro: 1, info: 2 }, client: { servers: new Map() }, ehSuperAdmin: () => true, sendEmbed: async (_c, x) => { e = x; } });
  assert.match(e.title, /Aqui não/);
  delete process.env.RELATORIO_SERVIDOR;
});

console.log(`\nRODADA 01/10: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
