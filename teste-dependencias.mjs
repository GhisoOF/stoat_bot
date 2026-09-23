// As 4 vulnerabilidades sem correção publicada (ip, elliptic, taffydb,
// vue-template-compiler) vinham de código que a Judy NUNCA executa: o caminho
// "Legacy V1" do revoice.js (msc-node → werift) e o gerador de documentação
// (better-docs). Elas saíram trocando esses pacotes por um vazio.
//
// Este teste lê só arquivos — não precisa de npm install nem de rede.

import assert from "node:assert";
import fs from "node:fs";

let ok = 0, falhou = 0;
const t = (nome, fn) => {
  try { fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

const lock = JSON.parse(fs.readFileSync("./voz-servico/package-lock.json", "utf8")).packages;
const pkg = JSON.parse(fs.readFileSync("./voz-servico/package.json", "utf8"));
const voz = fs.readFileSync("./voz-servico/voz.js", "utf8");
const dockerfile = fs.readFileSync("./Dockerfile", "utf8");

t("nenhum pacote vulnerável sem correção está no lockfile", () => {
  for (const p of ["ip", "elliptic", "werift", "vue-template-compiler"]) {
    assert.equal(lock[`node_modules/${p}`], undefined, `${p} voltou ao lockfile`);
  }
});
t("os pacotes que ninguém executa apontam para o vazio", () => {
  for (const p of ["msc-node", "better-docs", "taffydb"]) {
    assert.match(pkg.overrides?.[p] ?? "", /vazio/, `${p} não está no override`);
  }
});
t("o override resolve DENTRO do voz-servico (link não quebrado)", () => {
  // `file:` de override é resolvido a partir do pacote que depende dele
  // (node_modules/revoice.js). Com `file:./vazio` o link apontava para
  // node_modules/revoice.js/vazio — que não existe.
  for (const p of ["msc-node", "better-docs", "taffydb"]) {
    assert.equal(pkg.overrides[p], "file:../../vazio", `${p}: ${pkg.overrides[p]}`);
  }
  assert.ok(fs.existsSync("./voz-servico/vazio/package.json"), "a pasta vazio sumiu");
});
t("a voz importa SÓ o caminho do LiveKit, não o index do revoice.js", () => {
  assert.match(voz, /require\("revoice\.js\/src\/Revoice\.js"\)/);
  assert.match(voz, /require\("revoice\.js\/src\/Media\.js"\)/);
  assert.doesNotMatch(voz, /require\("revoice\.js"\)/, "voltou a importar o index (que carrega o legado)");
});
t("o Dockerfile copia o vazio ANTES do npm install", () => {
  const copia = dockerfile.indexOf("COPY voz-servico/vazio");
  const instala = dockerfile.indexOf("RUN cd voz-servico && (npm install");
  assert.ok(copia > 0, "o Dockerfile não copia voz-servico/vazio");
  assert.ok(copia < instala, "o vazio tem de ser copiado antes do npm install — senão a imagem sobe sem voz");
});

console.log(`\nDEPENDÊNCIAS: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
