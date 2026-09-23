// Trava as correções da rodada de refatoração/segurança.
//
// Cada teste aqui nasceu de um bug real que passou despercebido porque NADA
// o cobria. O ponto principal: a SDK do Stoat lança o CORPO CRU da resposta
// (uma string JSON), e as fixtures antigas lançavam objetos — formato que a
// biblioteca nunca produz. Por isso um teste podia passar com o código errado.

import assert from "node:assert";
import http from "node:http";
import fs from "node:fs";

// Banco e config isolados, antes de qualquer import do projeto.
process.env.DB_PATH = "/tmp/refat-teste.db";
process.env.CONFIG_PATH = "/tmp/refat-teste-cfg.json";
for (const f of [process.env.DB_PATH, process.env.CONFIG_PATH]) { try { fs.unlinkSync(f); } catch {} }

// A API fica num servidor local: assim dá para testar resposta boa, erro
// tipado e host morto sem depender da internet.
const servidorFalso = http.createServer((req, res) => {
  if (req.url === "/ok") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"features":{"limits":{"global":{"message_reactions":32}}}}'); }
  if (req.url === "/html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><html>proxy</html>"); }
  res.writeHead(403, { "Content-Type": "application/json" });
  res.end('{"type":"MissingPermission"}');
});
await new Promise((r) => servidorFalso.listen(0, "127.0.0.1", r));
process.env.STOAT_API = `http://127.0.0.1:${servidorFalso.address().port}`;

let ok = 0, falhou = 0;
const t = (nome, fn) => {
  try { fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};
const tAsync = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

// ── 1. Erros da API: a SDK lança STRING, não Error nem objeto ──────────────
console.log("\n── erros da API do Stoat ──");
const { normalizarErro, tipoDoErro, descreverErro } = await import("./modulos/core/erros.js");

// Como a stoat-api realmente rejeita: `throw data`, com data = await res.text()
const comoASdkLanca = (obj) => JSON.stringify(obj);

t("string JSON do 429 vira objeto com retry_after", () => {
  assert.equal(normalizarErro(comoASdkLanca({ retry_after: 8270 })).retry_after, 8270);
});
t("string JSON de erro tipado preserva o type", () => {
  assert.equal(tipoDoErro(comoASdkLanca({ type: "MissingPermission" })), "MissingPermission");
});
t("erro tipado NUNCA vira a palavra 'undefined'", () => {
  // O bug dos tickets: `new Error(e.message)` com e sendo string/objeto.
  for (const e of [comoASdkLanca({ type: "MissingPermission" }), { type: "MissingPermission" }]) {
    assert.ok(!/undefined/.test(descreverErro(e)), `descreverErro devolveu "${descreverErro(e)}"`);
  }
});
t("objeto continua funcionando (fixtures antigas)", () => {
  assert.equal(normalizarErro({ retry_after: 500 }).retry_after, 500);
});

// ── 2. A espera do 429 acontece de verdade ────────────────────────────────
console.log("\n── rate limit: a espera do 429 roda? ──");
process.env.RR_PAUSA_MS = "1";
const db = await import("./modulos/core/db.js");
db.abrirBanco(process.env.DB_PATH);
const rr = await import("./modulos/ferramentas/reaction-roles.js");

await tAsync("reagir espera o retry_after e entra na 2ª tentativa", async () => {
  const SERVER = "01SRVREFAT0000000000000000", MSG = "01MSGREFAT0000000000000000";
  const CANAL = "01CANREFAT0000000000000000", CARGO = "01CARREFAT0000000000000000";
  db.addReactionRole(SERVER, MSG, "🧊", CARGO, CANAL);

  let tentativas = 0;
  const reagidos = [];
  const msg = {
    id: MSG, channelId: CANAL, reactions: new Map(),
    async react(e) {
      tentativas++;
      // 1ª chamada: estourou o bucket. Exatamente como a SDK devolve.
      if (tentativas === 1) throw JSON.stringify({ retry_after: 5 });
      reagidos.push(decodeURIComponent(e));
      this.reactions.set(decodeURIComponent(e), new Set(["01BOT00000000000000000000"]));
    },
  };
  const client = { user: { id: "01BOT00000000000000000000" } };

  const r = await rr.reporReacoesQueFaltam(msg, client);
  assert.equal(tentativas, 2, `devia tentar 2x (tentou ${tentativas}) — a espera do 429 não rodou`);
  assert.deepEqual(r.repostos, ["🧊"], "o emoji tinha de entrar na 2ª tentativa");
  assert.equal(r.falhas.length, 0, `nenhuma falha esperada, veio: ${JSON.stringify(r.falhas)}`);
});

// ── 3. Anexo do CDN atual vira capa de embed ──────────────────────────────
console.log("\n── mídia: o CDN atual do Stoat ──");
const midia = await import("./modulos/core/midia.js");
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

for (const host of ["cdn.stoatusercontent.com", "autumn.stoat.chat", "autumn.revolt.chat"]) {
  const url = `https://${host}/attachments/${ID}`;
  t(`${host}: id extraído e vira capa (media)`, () => {
    assert.equal(midia.extrairAnexoStoat(url), ID);
    assert.equal(midia.comoExibir(url)?.modo, "media");
  });
  t(`${host}: sem o aviso falso de "site de terceiros"`, () => {
    const v = midia.validarUrlImagem(url);
    assert.equal(v.noStoat, true);
    assert.ok(!/terceiros/.test(v.aviso ?? ""), "avisou terceiros para um host do próprio Stoat");
  });
}
t("host de fora continua sendo link, com o aviso", () => {
  const v = midia.validarUrlImagem("https://exemplo.com/foto.png");
  assert.equal(midia.comoExibir("https://exemplo.com/foto.png").modo, "link");
  assert.equal(v.noStoat, false);
  assert.ok(/terceiros/.test(v.aviso ?? ""));
});
t("SSRF: rede interna continua bloqueada", () => {
  for (const u of ["http://127.0.0.1/a.png", "https://100.100.100.100/a.png", "http://umbrel.local/a.png"]) {
    assert.equal(midia.validarUrlImagem(u).ok, false, `deixou passar ${u}`);
  }
});

// ── 4. O cliente HTTP único da API ────────────────────────────────────────
console.log("\n── modulos/core/stoat-api.js ──");
const api = await import("./modulos/core/stoat-api.js");

t("respeita STOAT_API e tira a barra do fim", () => {
  assert.ok(/^https?:\/\/[^/]+$/.test(api.API), `API = ${api.API}`);
});
await tAsync("resposta boa: ok + json já convertido", async () => {
  const r = await api.chamarApi("/ok");
  assert.equal(r.ok, true);
  assert.equal(r.json.features.limits.global.message_reactions, 32);
});
await tAsync("erro tipado: ok=false, status e json, sem lançar", async () => {
  const r = await api.chamarApi("/nao-pode");
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.json.type, "MissingPermission");
  assert.ok(!r.erro, "403 é resposta, não falha de rede");
});
await tAsync("resposta em HTML é sinalizada (proxy/CDN no caminho)", async () => {
  assert.equal((await api.chamarApi("/html")).ehHtml, true);
});
await tAsync("host morto NUNCA lança: vira { ok:false, erro }", async () => {
  // Outro endereço (porta fechada) exige reimportar: API é lida na carga.
  const antes = process.env.STOAT_API;
  process.env.STOAT_API = "http://127.0.0.1:1";
  try {
    const morta = await import(`./modulos/core/stoat-api.js?morto=${Date.now()}`);
    const r = await morta.chamarApi("/x", { ms: 2000 });
    assert.equal(r.ok, false);
    assert.ok(r.erro, "falha de rede tem de aparecer em `erro`");
    assert.equal(r.status, 0, "sem resposta, não há status HTTP");
    assert.equal(typeof r.ms, "number");
  } finally { process.env.STOAT_API = antes; }
});

// ── 5. Permissões: bigint, e nome inválido não vira `false` silencioso ────
console.log("\n── permissões (stoat.js 7 = bigint) ──");
const { Permission } = await import("stoat.js");

t("as permissões são bigint, não number", () => {
  assert.equal(typeof Permission.BanMembers, "bigint");
});
t("todos os nomes usados pelo bot existem no enum", () => {
  for (const n of ["BanMembers", "KickMembers", "ManageMessages", "ManagePermissions", "ManageRole", "ManageServer", "AssignRoles", "ManageChannel"]) {
    assert.ok(n in Permission, `"${n}" não existe na stoat.js`);
  }
});
t("o erro clássico (plural, estilo Discord) NÃO existe — por isso é checado", () => {
  for (const n of ["ManageRoles", "SendMessages", "ManageChannels"]) {
    assert.ok(!(n in Permission), `"${n}" existe? o guard do main.js precisa mudar`);
  }
});

// ── 6. Visão: MODELO_VISAO precisa ligar a ferramenta ─────────────────────
console.log("\n── gate da ferramenta de visão ──");
await tAsync("MODELO_VISAO vira LLM_MODEL_VISAO (modo online)", async () => {
  const antes = { ...process.env };
  try {
    delete process.env.LLM_MODEL_VISAO;
    process.env.IA = "1"; process.env.IA_MODO = "online";
    process.env.MODELO_VISAO = "algum/modelo-multimodal";
    await import(`./modulos/core/env.js?refat=${Date.now()}`);
    assert.equal(process.env.LLM_MODEL_VISAO, "algum/modelo-multimodal");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k];
    Object.assign(process.env, antes);
  }
});

servidorFalso.close();
console.log(`\nREFATORAÇÃO: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
