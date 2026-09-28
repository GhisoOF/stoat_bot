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

console.log("\n── relatório por categoria (notícias reais de 28/09, 03:56) ──");
const CVES_0356 = [
  "CVE-2026-100892 - aligungr UERANSIM nr-gnb handler.cpp ULInformationTransfer memory corruption",
  "CVE-2026-100891 - Trusted Domain Project OpenDMARC Internationalized Domain Name opendmarc_policy.c opendmarc_policy_query_dmarc encoding error",
  "CVE-2026-100890 - Trusted Domain Project OpenDMARC SPF Parser opendmarc_spf.c opendmarc_spf_ipv6_explode null pointer dereference",
  "CVE-2026-100895 - Trusted Domain Project OpenARC libopenarc arc-canon.c arc_parse_canon_t null pointer dereference",
  "CVE-2026-100894 - mathurvishal CloudClassroom-PHP-Project updateguest.php sql injection",
].map((titulo) => ({ feedTitulo: "Latest Vulnerabilities", titulo, link: "https://cvefeed.io/vuln/detail/x", resumo: "" }));
const HN_0356 = [
  { feedTitulo: "Hacker News", titulo: "Self-parking car using genetic algorithm (2021)", link: "https://trekhleb.dev/blog/2021/self-parking-car-evolution/", resumo: "Comments" },
  { feedTitulo: "Hacker News", titulo: "Every Household in This Rural Town Receives $10k If a Data Center Gets Built", link: "https://www.wsj.com/real-estate/every-household-in-this-rural-town-receives-10-000-if-a-data-center-gets-built-86554cb7", resumo: "Comments" },
];
t("CVE vira a categoria Vulnerabilidades, venha do feed que vier", () => {
  assert.equal(rss.categoriaDoItem(CVES_0356[0], "Tecnologia"), "Vulnerabilidades");
  assert.equal(rss.categoriaDoItem(HN_0356[0], "Tecnologia"), "Tecnologia");
});
t("o link dá sentido ao título (Coltrane) e perde o id do fim (WSJ)", () => {
  assert.equal(rss.pistaDoLink("https://www.tabletmag.com/sections/arts-letters/articles/coltranes-shadow-tiberi-tapes"), "coltranes shadow tiberi tapes");
  assert.doesNotMatch(rss.pistaDoLink(HN_0356[1].link), /86554cb7/);
});
t("relatório de CVE: a esquecida volta, a inventada sai, cada uma aparece 1 vez", () => {
  // o modelo esqueceu a OpenARC (como no resumo real), inventou uma e repetiu outra
  const resposta = [
    "CVE-2026-100892 | UERANSIM | corrupção de memória em handler.cpp",
    "CVE-2026-100891 | OpenDMARC | erro de codificação em opendmarc_policy.c",
    "CVE-2026-100890 | OpenDMARC | ponteiro nulo no parser SPF",
    "CVE-2026-100890 | OpenDMARC | repetida",
    "CVE-2026-999999 | Inventado | não existe",
    "CVE-2026-100894 | CloudClassroom-PHP-Project | SQL injection em updateguest.php",
  ].join("\n");
  const r = rss.montarRelatorioCVE(resposta, CVES_0356);
  for (const it of CVES_0356) {
    const id = it.titulo.match(/CVE-\d{4}-\d+/)[0];
    assert.equal(r.split(id).length - 1, 1, `${id} aparece ${r.split(id).length - 1}×`);
  }
  assert.doesNotMatch(r, /999999|Inventado|repetida/);
  assert.match(r, /\*\*OpenDMARC\*\*\n• erro de codificação.*\n• ponteiro nulo/, "agrupa por produto");
  assert.match(r, /\*\*Outros\*\*\n• Trusted Domain Project OpenARC/, "a esquecida volta pelo título");
});
t("relatório de CVE sem o modelo: sai todo pelos títulos", () => {
  const r = rss.montarRelatorioCVE("", CVES_0356);
  assert.equal((r.match(/CVE-2026-\d+/g) ?? []).length, CVES_0356.length);
});
t("resumo de notícias: uma linha por item; falta volta pelo título; número inventado também", () => {
  const r = rss.montarResumoNoticias("1 | Um post de 2021 sobre carros que se estacionam com algoritmo genético.\n2 | Cada casa de uma cidade recebe US$ 25 mil se um data center for construído.", HN_0356);
  const linhas = r.split("\n");
  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /de 2021/);
  assert.equal(linhas[1], `• ${HN_0356[1].titulo}`, "US$ 25 mil não está na notícia: volta o título");
});
t("resumo de notícias: número que ESTÁ na notícia fica ($10k)", () => {
  const r = rss.montarResumoNoticias("2 | Cada casa de uma cidade rural recebe US$ 10 mil se um data center for construído.", HN_0356);
  assert.match(r.split("\n")[1], /Cada casa .* 10 mil/);
});
t("blocos: lista longa é dividida sem cortar linha", () => {
  const texto = Array.from({ length: 80 }, (_, i) => `• falha número ${i} em algum arquivo.php (CVE-2026-${100000 + i})`).join("\n");
  const b = rss.blocosDe(texto, 1900);
  assert.ok(b.length > 1); assert.ok(b.every((x) => x.length <= 1900));
  assert.equal(b.join("\n"), texto);
});

console.log("\n── publicação de ponta a ponta ──");
{
  const enviados = [];
  rss.configurarRelatorio({
    linhas: async (_m, { modo }) => (modo === "cve" ? "" : "1 | Um post de 2021 sobre carros autônomos que aprendem a estacionar."),
    comentario: async () => "A nuvem agora paga cashback.",
  });
  await rss.publicarRelatorio({ sendMessage: async (m) => enviados.push(m.embeds[0]) },
    [...CVES_0356.map((x) => ({ ...x, categoria: "Vulnerabilidades" })), HN_0356[0]], { agora: "x" });
  t("ordem: relatório de CVE, resumo, comentário da Judy no fim", () => {
    assert.match(enviados[0].title, /Relatório de vulnerabilidades/);
    assert.match(enviados[1].title, /Resumo · Geral/);
    assert.match(enviados.at(-1).title, /A Judy comenta/);
  });
  t("modelo sem resposta para as CVEs: nenhuma se perde", () =>
    assert.equal((enviados[0].description.match(/CVE-2026-\d+/g) ?? []).length, CVES_0356.length));
}

console.log(`\nRSS (precisão): ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
