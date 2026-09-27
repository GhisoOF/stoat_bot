// Precisão do resumo de RSS, com as notícias reais de 27/09 (21:55 e 22:55).
import assert from "node:assert";
import fs from "node:fs";
process.env.DB_PATH = "/tmp/rss-prec.db"; process.env.CONFIG_PATH = "/tmp/rss-prec.json";
for (const f of ["/tmp/rss-prec.db", "/tmp/rss-prec.json"]) { try { fs.unlinkSync(f); } catch {} }
const rss = await import("./modulos/ferramentas/rss.js");

let ok = 0, falhou = 0;
const t = (nome, fn) => {
  try { fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

const ITENS_2155 = [
  { feedTitulo: "Mises Brasil", titulo: "Deseja a formação de mais famílias? Acabe com a inflação", resumo: "" },
  { feedTitulo: "The Latest Articles from IGN", titulo: "Avengers: Endgame Encore Collects $86 Million in Theaters as New Scenes Help MCU Fans Prep for Doomsday", resumo: "" },
  { feedTitulo: "The Latest Articles from IGN", titulo: "Philips Multigroom 7000 Series Is Nearly Half Price at Amazon UK Ahead of Prime Big Deal Days", resumo: "" },
  { feedTitulo: "Latest Vulnerabilities", titulo: "CVE-2026-100875 - mathurvishal CloudClassroom-PHP-Project updatedetailsfromfaculty.php sql injection", resumo: "" },
  { feedTitulo: "Hacker News", titulo: "The state of SIMD in Rust in 2026", resumo: "Comments" },
];

console.log("\n── o que o modelo recebe ──");
t("o 'Comments' do Hacker News não conta como texto da notícia", () => assert.equal(rss.textoDoItem("Comments", "x"), ""));
t("as linhas de metadados do hnrss também não", () =>
  assert.equal(rss.textoDoItem("Article URL: https://a.b/c Comments URL: https://news.ycombinator.com/item?id=1 Points: 120 # Comments: 45", "x"), ""));
t("descrição que só repete o título também não", () =>
  assert.equal(rss.textoDoItem("The state of SIMD in Rust in 2026", "The state of SIMD in Rust in 2026"), ""));
t("texto de verdade continua", () => {
  const d = "Um economista argumenta que a inflação alta adia casamentos e filhos, e que estabilidade de preços favorece a formação de famílias.";
  assert.equal(rss.textoDoItem(d, "Deseja a formação de mais famílias?"), d);
});
t("o material marca a notícia só com título (o modelo precisa saber)", () => {
  const src = fs.readFileSync("./modulos/ferramentas/rss.js", "utf8");
  assert.match(src, /só o título; não há texto da notícia/);
});

console.log("\n── números inventados ──");
t("número que está na notícia fica ($86, 7000, 2026)", () => {
  const txt = "Os Avengers arrecadaram $86 milhões. O Multigroom 7000 está quase pela metade. Rust mostra o SIMD em 2026.";
  assert.equal(rss.tirarNumerosInventados(txt, ITENS_2155), txt);
});
t("número que não está em nenhuma notícia derruba a frase inteira", () => {
  const txt = "Os Avengers arrecadaram $120 milhões no fim de semana. O Multigroom 7000 está quase pela metade.";
  const r = rss.tirarNumerosInventados(txt, ITENS_2155);
  assert.doesNotMatch(r, /120/); assert.match(r, /Multigroom 7000/);
});

console.log("\n── o corte ──");
t("corta na última frase completa, nunca em 'A m'", () => {
  const longo = "Uma frase completa sobre as notícias. ".repeat(60) + "A m";
  const r = rss.cortarEmFrase(longo, 1900);
  assert.ok(r.length <= 1900); assert.ok(r.endsWith("."), `terminou em: ${JSON.stringify(r.slice(-12))}`);
});
t("texto que cabe não é mexido", () => assert.equal(rss.cortarEmFrase("Curto. Fim.", 1900), "Curto. Fim."));
t("fecharResumo preserva os parágrafos", () => {
  const r = rss.fecharResumo("Primeiro parágrafo sobre Rust em 2026.\n\nSegundo, sobre os $86 milhões.", ITENS_2155);
  assert.match(r, /2026\.\n\nSegundo/);
});

console.log(`\nRSS (precisão): ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
