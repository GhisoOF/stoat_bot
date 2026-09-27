// Resposta longa vira páginas — e NADA se perde.
//
// O sendEmbed cortava em silêncio toda descrição acima de 1500 caracteres: o
// `&config` em português (1717) perdia o final. Agora o envio pagina sozinho,
// com o mesmo ◀ ▶ do &help. A propriedade cobrada aqui não é só "cabe": é que
// juntar as páginas devolve EXATAMENTE o texto original.

import assert from "node:assert";
import fs from "node:fs";

process.env.DB_PATH = "/tmp/pag.db"; process.env.CONFIG_PATH = "/tmp/pag.json";
for (const f of ["/tmp/pag.db", "/tmp/pag.json"]) { try { fs.unlinkSync(f); } catch {} }
const db = await import("./modulos/core/db.js"); db.abrirBanco("/tmp/pag.db");
const store = await import("./modulos/core/config-store.js");
const pg = await import("./modulos/core/paginas.js");

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

const RODAPE = /\n\n📖 (Página|Page) \*\*\d+\/\d+\*\*.*$/s;
async function paginar(embed, lang = "pt") {
  const enviados = [];
  const enviar = async (_c, e) => { enviados.push(e); return { id: "m1", react: async () => {} }; };
  await pg.enviarEmPaginas(enviar, {}, embed, { lang, COR: { info: 1 } });
  return enviados;
}
// Reconstrói todas as páginas a partir da sessão (só a 1ª é enviada; as
// outras aparecem ao reagir — aqui lemos direto do paginador).
function todasAsPaginas(texto, titulo) {
  return pg.paginarLinhas(String(texto).split("\n"), { titulo });
}

// A saída REAL do &config
async function saidaConfig(lang) {
  const { cmdConfig } = await import("./modulos/moderacao/config-comando.js");
  const config = store.configDoServidor("01SRV"); config.language = lang;
  let embed = null;
  const ctx = {
    config, serverId: "01SRV", PREFIXO: "&", COR: { info: 1, aviso: 2, erro: 3, sucesso: 4 },
    estado: { blockedDomains: { size: 0, tamanho: 0 }, blocklistStatus: {} },
    sendEmbed: async (_c, e) => { embed = e; return { id: "m" }; },
    membroTemPermissao: () => true, ehSuperAdmin: () => true, salvarConfig: () => {},
    getServer: async () => ({ id: "01SRV", roles: new Map(), channels: [] }),
    cfgGlobal: store.getGlobal(),
    client: { channels: { get: () => null } },
  };
  await cmdConfig({ channel: { id: "c" }, authorId: "u", content: "", member: { roles: [] } }, [], ctx);
  return embed;
}

console.log("\n── o caso real: &config ──");
for (const lang of ["pt", "en"]) {
  const embed = await saidaConfig(lang);
  const tam = embed.description.length;
  await t(`[${lang}] &config (${tam} caracteres): ${tam > 1500 ? "pagina" : "cabe numa só"}`, () => {
    assert.equal(pg.precisaPaginar(embed), tam > pg.LIMITE_EMBED);
  });
  await t(`[${lang}] juntando as páginas, o texto é IDÊNTICO ao original`, () => {
    const paginas = todasAsPaginas(embed.description, embed.title);
    const junto = paginas.map((p) => p.description).join("\n");
    assert.equal(junto, embed.description, "alguma parte do &config se perdeu na paginação");
  });
  await t(`[${lang}] cada página, com o rodapé ◀ ▶, cabe no limite e sem "…"`, async () => {
    const enviados = await paginar(embed, lang);
    for (const e of enviados) {
      assert.ok(e.description.length <= pg.LIMITE_EMBED, `página com ${e.description.length}`);
      assert.ok(!e.description.replace(RODAPE, "").endsWith("…"), "página cortada com …");
    }
  });
}

console.log("\n── os casos-limite ──");
await t("texto até o limite NÃO pagina (resposta curta fica como era)", () => {
  assert.equal(pg.precisaPaginar({ description: "x".repeat(1500) }), false);
  assert.equal(pg.precisaPaginar({ description: "x".repeat(1501) }), true);
});
await t("uma LINHA sozinha maior que a página é quebrada, não cortada", () => {
  const linha = Array.from({ length: 600 }, (_, i) => `palavra${i}`).join(" ");  // ~5 mil caracteres
  const paginas = todasAsPaginas(linha, "x");
  assert.ok(paginas.length >= 3, `devia virar várias páginas, virou ${paginas.length}`);
  for (const p of paginas) assert.ok(p.description.length <= 1350, `página com ${p.description.length}`);
  // quebra em espaço: juntando com espaço volta ao original
  assert.equal(paginas.map((p) => p.description).join(" "), linha);
});
await t("lista enorme (ex.: 300 domínios na whitelist) vira páginas sem perder item", () => {
  const itens = Array.from({ length: 300 }, (_, i) => `• \`dominio-${i}.example.com\``);
  const texto = `**Domínios**\n${itens.join("\n")}`;
  const junto = todasAsPaginas(texto, "x").map((p) => p.description).join("\n");
  for (const i of itens) assert.ok(junto.includes(i), `sumiu: ${i}`);
});
await t("com imagem ou anexo NÃO pagina (a mídia só iria na 1ª página)", () => {
  const longo = "x".repeat(3000);
  assert.equal(pg.precisaPaginar({ description: longo, imagem: "https://a/b.png" }), false);
  assert.equal(pg.precisaPaginar({ description: longo, anexos: ["id"] }), false);
});
await t("a 1ª página já vai com o rodapé de navegação", async () => {
  const [primeira] = await paginar({ title: "T", description: "linha\n".repeat(400), colour: 1 });
  assert.match(primeira.description, /Página \*\*1\/\d+\*\*/);
});

console.log(`\nPAGINAÇÃO: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
