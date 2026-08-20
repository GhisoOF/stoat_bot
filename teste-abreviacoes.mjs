// ══════════════════════════════════════════════════════════
//  teste-abreviacoes.mjs — expansão de escrita de chat para fala
//
//  O risco aqui não é falhar em expandir: é expandir DEMAIS. Trocar um "n"
//  dentro de "banana" destrói a palavra e ninguém entende a fala. Estes
//  testes travam a fronteira de palavra, que é o que protege isso.
// ══════════════════════════════════════════════════════════

import { expandir, PADRAO, total } from "./modulos/core/abreviacoes.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };
const eq = (a, b, msg) => ok(a === b, `${msg}${a === b ? "" : `\n     esperado: "${b}"\n     obtido:   "${a}"`}`);

// ── 1. Expansões básicas ──
console.log("── expansões ──");
eq(expandir("vc n vai vir hj pq?"), "você não vai vir hoje porque?", "frase típica de chat");
eq(expandir("blz tmj flw"), "beleza tamo junto falou", "várias abreviações seguidas");
eq(expandir("tbm acho q sim"), "também acho que sim", "tbm/q");
eq(expandir("ta mt lento"), "está muito lento", "ta/mt");

// ── 2. ★ Fronteira de palavra — o que não pode quebrar ──
console.log("\n── palavras que NÃO podem ser tocadas ──");
const intactas = [
  ["a banana não é uma nota", "★ 'n' dentro de banana/nota fica intacto"],
  ["que quantidade quente", "'q' dentro de outras palavras"],
  ["tabela tampa tanque", "'ta' no começo de outras palavras"],
  ["muito montanha", "'mt' não existe solto aqui"],
  ["então entendo entrada", "'ent' dentro de palavras"],
  ["pequeno porque porta", "'pq' e 'q' dentro de palavras"],
];
for (const [frase, oque] of intactas) eq(expandir(frase), frase, oque);

// acentos contam como letra na fronteira
eq(expandir("não"), "não", "★ 'n' de 'não' não é palavra inteira (acento conta como letra)");
eq(expandir("você tá aí"), "você está aí", "só o que é palavra inteira muda");

// ── 3. Capitalização ──
console.log("\n── capitalização ──");
eq(expandir("Vc viu?"), "Você viu?", "inicial maiúscula é preservada");
eq(expandir("VC VIU"), "VOCÊ VIU", "★ grito continua grito");
eq(expandir("vc viu"), "você viu", "minúscula fica minúscula");

// ── 4. Risadas ──
console.log("\n── risadas ──");
eq(expandir("kkkkkkkkkk"), "kkk", "★ risada longa vira curta (não soletra 10 letras)");
eq(expandir("hahahaha"), "kkk", "haha vira risada");
eq(expandir("rsrsrs"), "kkk", "rsrs vira risada");
ok(expandir("kk") === "kk", "duas letras não são risada (fica como está)");

// ── 5. Dicionário do servidor ──
console.log("\n── dicionário do servidor ──");
eq(expandir("o rt foi bom", { rt: "retuíte" }), "o retuíte foi bom", "entrada própria funciona");
eq(expandir("vc é top", { top: "muito bom" }), "você é muito bom", "própria + embutida juntas");
eq(expandir("n sei", { n: "ene" }), "ene sei", "★ o servidor sobrepõe o embutido");
eq(expandir("vc n sei", {}, false), "vc n sei", "★ 'padrao off' desliga o embutido");
eq(expandir("vc n sei", { vc: "você" }, false), "você n sei", "com padrão off, só o do servidor vale");

// ── 6. Robustez ──
console.log("\n── robustez ──");
eq(expandir(""), "", "texto vazio");
eq(expandir(null), "", "null não explode");
eq(expandir("texto normal sem abreviação"), "texto normal sem abreviação", "texto sem nada a trocar");
ok(expandir("vc", { "a.*b": "regex" }) === "você", "chave com caracteres de regex não quebra");
ok(total() === Object.keys(PADRAO).length, `dicionário embutido tem ${Object.keys(PADRAO).length} entradas`);

// ordem: a mais longa vence
eq(expandir("tbm"), "também", "★ 'tbm' não vira 'tb'+'m' (mais longa primeiro)");

console.log(`\nABREVIAÇÕES: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
