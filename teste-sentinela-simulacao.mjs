// Trava o resultado de scripts/simular-automod.mjs.
//
// O simulador mede; este teste impede que alguém "melhore" o sentinela e
// reabra uma brecha ou crie um falso positivo sem perceber. Se um caso novo
// entrar no simulador, ele passa a ser cobrado aqui automaticamente.

import { CASOS, CONVERSAS, avaliar, classificar, simularConversa } from "./scripts/simular-automod.mjs";

let ok = 0, falhou = 0;
const falha = (msg) => { console.log(`  ❌ ${msg}`); falhou++; };

console.log("\n── mensagens isoladas ──");
for (const [grupo, rotulo, texto, esperado] of CASOS) {
  const a = avaliar(texto);
  const c = classificar(esperado, a.veredito);
  if (c === "BRECHA" || c === "FALSO POSITIVO") {
    falha(`${grupo}/${rotulo}: ${c} (nota ${a.nota.toFixed(1)}, esperado ${esperado}, obtido ${a.veredito})`);
  } else { ok++; }
}
console.log(`  ${ok} de ${CASOS.length} sem brecha nem falso positivo`);

console.log("\n── conversas inteiras ──");
for (const [rotulo, esperado, msgs, min] of CONVERSAS) {
  const r = simularConversa(msgs, min);
  const obtido = r.alertou ? "alertar" : "passar";
  if (obtido !== esperado) falha(`${rotulo}: esperado ${esperado}, obtido ${obtido} (soma ${r.soma.toFixed(1)})`);
  else { console.log(`  ✅ ${rotulo}`); ok++; }
}

console.log(`\nSIMULAÇÃO DO SENTINELA: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
