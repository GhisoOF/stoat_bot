// Todo comando que o assistente monta tem de EXISTIR.
//
// 28/09: o &assistente protecao executou `&sentinela on`, `&punicao modo
// acumular`… — comandos removidos do topo na reforma da árvore. 6 de 12
// passos falharam com "comando não encontrado" num servidor novo. O teste da
// ajuda renderizada não pegou porque o assistente não é ajuda: gera comandos.
import assert from "node:assert";
import fs from "node:fs";
process.env.DB_PATH = "/tmp/assist.db";
for (const f of ["/tmp/assist.db"]) { try { fs.unlinkSync(f); } catch {} }
const { PASSOS, ROTEIROS } = await import("./modulos/moderacao/assistente.js");

let ok = 0, falhou = 0;
const t = (nome, fn) => {
  try { fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

const main = fs.readFileSync("./main.js", "utf8");
const bloco = main.match(/const rotas\s*=\s*\{([\s\S]*?)\n\};/)[1];
const ROTAS = new Set([...bloco.matchAll(/^\s*"?([\wá-ú-]+)"?\s*:/gm)].map((m) => m[1]));
const am = fs.readFileSync("./modulos/moderacao/automod-comandos.js", "utf8");
const MODULOS = new Set([...am.match(/const modulos = \{([\s\S]*?)\};/)[1].matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]));
const FAMILIA_AUTOMOD = new Set(["blocklist", "whitelist", "sentinela", "punicao"]);

// Valores de exemplo para cada passo (todas as opções de cada escolha)
const EXEMPLOS = {
  idioma: ["pt", "en"], staff: [[{ id: "R1" }]], log: ["C1"], protecao: [1, 2, 3],
  boasvindas: ["C1"], escada: ["aviso,5m,1h,ban"], banglobal: ["off", "avisar", "banir"],
  xp: ["on"], autorole: ["R1"], canaisVer: [[]], canaisEscrever: [[]],
};
const todos = new Set(Object.values(ROTEIROS).flat());
for (const passo of todos) {
  t(`passo "${passo}": todo comando gerado existe`, () => {
    for (const v of EXEMPLOS[passo] ?? [null]) {
      for (const semCargo of [true, false]) {
        const config = { automod: { punicao: { silenceRoleId: semCargo ? null : "X" } } };
        for (const args of PASSOS[passo].comandos(v, { config })) {
          assert.ok(ROTAS.has(args[0]), `&${args.join(" ")} — "${args[0]}" não é rota`);
          if (args[0] === "automod") {
            assert.ok(FAMILIA_AUTOMOD.has(args[1]) || MODULOS.has(args[1]),
              `&${args.join(" ")} — "${args[1]}" não existe dentro do &automod`);
          }
        }
      }
    }
  });
}
t("o silêncio é o timeout nativo: nenhum roteiro tem passo de cargo de silêncio", () => {
  for (const r of Object.values(ROTEIROS)) assert.ok(!r.includes("silencio"));
  assert.equal(PASSOS.silencio, undefined);
});
t("nenhum passo gera &cargomudo (aposentado)", () => {
  for (const passo of todos) for (const v of EXEMPLOS[passo] ?? [null])
    assert.ok(!PASSOS[passo].comandos(v, { config: { automod: { punicao: {} } } }).some((c) => c[0] === "cargomudo"), passo);
});
t("o passo de proteção não cria mais cargo escondido", () => {
  const cmds = PASSOS.protecao.comandos(2, { config: { automod: { punicao: { silenceRoleId: null } } } });
  assert.ok(!cmds.some((c) => c[0] === "cargomudo"));
});

console.log(`\nASSISTENTE: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
