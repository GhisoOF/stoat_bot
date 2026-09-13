// Testes do motor de dados (rng injetável = determinístico) e das partes
// puras dos tickets (transcrição e fatiamento). O que precisa de servidor
// real (criar canal/cargo) fica para o teste ao vivo.
let pass = 0, fail = 0;
const ok = (cond, rotulo) => { cond ? pass++ : fail++; console.log(`  ${cond ? "✅" : "❌"} ${rotulo}`); };

const d = await import("./modulos/ferramentas/dados-rpg.js");
const rngFixo = (seq) => { let i = 0; return () => seq[i++ % seq.length]; };

console.log("── básico e aritmética ──");
{
  const r = d.rolarExpressao("2d6+3", rngFixo([4, 5]));
  ok(r.repeticoes[0].total === 12, "★ 2d6+3 com dados [4,5] = 12");
  ok(r.repeticoes[0].detalhe.includes("[4, 5]") && r.repeticoes[0].detalhe.includes("+3"),
    "  → detalhe mostra os dados e a constante");
  ok(d.rolarExpressao("1d20-2", rngFixo([10])).repeticoes[0].total === 8, "  → subtração funciona");
  ok(d.rolarExpressao("5", rngFixo([1])).repeticoes[0].total === 5, "  → constante pura vale");
}

console.log("\n── manter maiores/menores (kh/kl) ──");
{
  const r = d.rolarExpressao("4d6kh3", rngFixo([1, 4, 5, 6]));
  ok(r.repeticoes[0].total === 15, "★ 4d6kh3 com [1,4,5,6] descarta o 1 → 15");
  ok(r.repeticoes[0].detalhe.includes("~~1~~"), "  → o descartado sai riscado");
  ok(d.rolarExpressao("2d20kl1", rngFixo([15, 7])).repeticoes[0].total === 7,
    "  → kl1 fica com o menor (desvantagem)");
  ok(d.rolarExpressao("adv", rngFixo([8, 17])).repeticoes[0].total === 17,
    "  → `adv` vira 2d20kh1");
  ok(d.rolarExpressao("des", rngFixo([8, 17])).repeticoes[0].total === 8,
    "  → `des` vira 2d20kl1");
}

console.log("\n── explosão, sucessos, % e Fate ──");
{
  const r = d.rolarExpressao("1d6!", rngFixo([6, 6, 2]));
  ok(r.repeticoes[0].total === 14, "★ 1d6! explode duas vezes: 6+6+2 = 14");
  ok(r.repeticoes[0].detalhe.includes("💥"), "  → explosão marcada no detalhe");
  const s = d.rolarExpressao("5d10>=7", rngFixo([9, 3, 7, 10, 1]));
  ok(s.repeticoes[0].total === 3 && s.repeticoes[0].sucessos, "★ 5d10>=7 com [9,3,7,10,1] = 3 sucessos");
  ok(d.rolarExpressao("d%", rngFixo([42])).repeticoes[0].total === 42, "  → d% rola 1-100");
  const f = d.rolarExpressao("4dF", rngFixo([3, 1, 2, 3]));   // rng(3)-2 → +1,-1,0,+1
  ok(f.repeticoes[0].total === 1, "  → 4dF Fate: +1-1+0+1 = 1");
}

console.log("\n── repetição, rótulo, moeda e crítico ──");
{
  const r = d.rolarExpressao("3x(1d6)", rngFixo([2, 4, 6]));
  ok(r.repeticoes.length === 3 && r.repeticoes.map((x) => x.total).join() === "2,4,6",
    "★ 3x(1d6) devolve três resultados");
  ok(d.rolarExpressao("1d20+7 # Percepção", rngFixo([10])).rotulo === "Percepção",
    "  → rótulo com # capturado");
  const m = d.rolarExpressao("moeda", rngFixo([2]));
  ok(m.moeda && m.repeticoes[0].texto.includes("cara"), "  → moeda com rng=2 dá cara");
  ok(d.rolarExpressao("1d20", rngFixo([20])).repeticoes[0].detalhe.includes("🎯"),
    "  → 20 natural ganha 🎯");
  ok(d.rolarExpressao("1d20", rngFixo([1])).repeticoes[0].detalhe.includes("💀"),
    "  → 1 natural ganha 💀");
}

console.log("\n── limites e erros com mensagem ──");
ok(!!d.rolarExpressao("").erro, "★ vazio explica o formato");
ok(!!d.rolarExpressao("2d1").erro, "  → d1 recusado (lados ≥ 2)");
ok(!!d.rolarExpressao("banana").erro, "  → lixo recusado com exemplo na mensagem");
ok(d.rolarExpressao("9999d6", rngFixo([1])).repeticoes[0].detalhe.split(",").length <= 100,
  "  → quantidade de dados tetada em 100");

console.log("\n── formatação da saída ──");
{
  const txt = d.formatarResultado(d.rolarExpressao("2d6 # Ataque", rngFixo([3, 4])));
  ok(txt.includes("**Ataque**") && txt.includes("⇒ **7**"), "★ rótulo em negrito + total destacado");
  ok(d.formatarResultado({ erro: "x" }).startsWith("⚠️"), "  → erro sai com aviso");
}

console.log("\n── iniciativa ──");
{
  const st = d.iniciativaDe("canal-rpg");
  st.ordem.push({ nome: "Goblin", valor: 12 }, { nome: "Elfa", valor: 18 });
  st.ordem.sort((a, b) => b.valor - a.valor);
  ok(st.ordem[0].nome === "Elfa", "★ ordem decrescente por valor");
  d.limparIniciativa("canal-rpg");
  ok(d.iniciativaDe("canal-rpg").ordem.length === 0, "  → limpar zera o canal");
}

console.log("\n── tickets: transcrição e fatiamento (puros) ──");
{
  const t = await import("./modulos/ferramentas/tickets.js");
  const txt = t.formatarTranscricao([
    { autor: "Ghiso", quando: "2026-09-13T12:00:00Z", texto: "não consigo entrar na call", anexos: 0 },
    { autor: "Staff", quando: "2026-09-13T12:01:00Z", texto: "", anexos: 2 },
  ], { nomeCanal: "ticket-0001" });
  ok(txt.includes("Transcrição de #ticket-0001"), "★ cabeçalho com o nome do canal");
  ok(txt.includes("[2026-09-13 12:00] Ghiso: não consigo entrar na call"), "  → linha com hora, autor e texto");
  ok(txt.includes("Staff: (2 anexo(s))"), "  → mensagem só de anexos vira contagem");

  const grande = Array.from({ length: 200 }, (_, i) => `linha ${i} com algum texto para encher`).join("\n");
  const fatias = t.fatiarTranscricao(grande, 500);
  ok(fatias.every((f) => f.length <= 500), "★ nenhuma fatia passa do teto");
  ok(fatias.join("\n") === grande, "  → juntar as fatias reconstrói o texto inteiro");
}

console.log(`\nRPG+TICKETS: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
