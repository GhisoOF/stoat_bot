// Vários comandos numa mensagem só (um por linha).
import assert from "node:assert";
import fs from "node:fs";
const { comandosPorLinha, mensagemDaLinha, LOTE_MAX } = await import("./modulos/core/lote.js");

let ok = 0, falhou = 0;
const t = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

await t("três comandos, um por linha, viram três", () =>
  assert.deepEqual(comandosPorLinha("&automod antispam on\n&automod anticaps on\n&log canal aqui", "&"),
    ["&automod antispam on", "&automod anticaps on", "&log canal aqui"]));
await t("linhas em branco e espaços não atrapalham", () =>
  assert.equal(comandosPorLinha("  &ping  \n\n\n&help  ", "&").length, 2));
await t("UM comando continua sendo um comando (não é lote)", () => assert.equal(comandosPorLinha("&ping", "&"), null));
await t("comando com texto livre em várias linhas NÃO vira lote (&embed, &chat)", () =>
  assert.equal(comandosPorLinha("&embed Título\nPrimeira linha da descrição\nsegunda linha", "&"), null));
await t("uma linha só com o prefixo não é comando", () => assert.equal(comandosPorLinha("&ping\n&", "&"), null));
await t(`teto de ${LOTE_MAX} comandos por mensagem`, () =>
  assert.equal(comandosPorLinha(Array.from({ length: 25 }, (_, i) => `&ping ${i}`).join("\n"), "&").length, LOTE_MAX));
await t("respeita outro prefixo", () => assert.equal(comandosPorLinha("!a\n!b", "!").length, 2));

// Classe no estilo do stoat.js: campo privado + getters + métodos
class MensagemFalsa {
  #colecao;
  constructor() { this.#colecao = { canal: { id: "C1" }, autor: "U1", texto: "&a\n&b" }; }
  get content() { return this.#colecao.texto; }
  get channel() { return this.#colecao.canal; }
  get authorId() { return this.#colecao.autor; }
  async reply(x) { return `resposta a ${this.#colecao.autor}: ${x}`; }
}
const original = new MensagemFalsa();
const linha = mensagemDaLinha(original, "&a");
await t("a mensagem da linha tem só aquela linha", () => assert.equal(linha.content, "&a"));
await t("getters com campo privado continuam funcionando (canal, autor)", () => {
  assert.equal(linha.channel.id, "C1"); assert.equal(linha.authorId, "U1");
});
await t("métodos também (responder no canal certo)", async () => assert.equal(await linha.reply("oi"), "resposta a U1: oi"));
await t("marcada como parte de um lote (não abre outro lote dentro)", () => {
  assert.equal(linha.__lote, true); assert.equal(original.__lote, undefined);
});
await t("main.js: lote ligado antes do parse, e sem contar a mensagem duas vezes", () => {
  const m = fs.readFileSync("./main.js", "utf8");
  assert.match(m, /client\.on\("messageCreate", tratarMensagem\)/);
  assert.ok(m.indexOf("comandosPorLinha(message.content, PREFIXO)") < m.indexOf("Identifica se a mensagem é um COMANDO"));
  assert.match(m, /if \(!message\.__lote\) srvStats\.registrar/);
  assert.match(m, /if \(!message\.__lote\) relatorioHora\.mensagem/);
});

console.log(`\nLOTE: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
