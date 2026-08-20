// ══════════════════════════════════════════════════════════
//  teste-automod-caps.mjs — falsos positivos do anti-caps
//
//  O incidente: menções no Stoat são `<@ULID>` — 26 caracteres SEMPRE
//  maiúsculos. Quem marcava duas pessoas era punido por "CAIXA ALTA".
//  Estes testes travam a correção e garantem que grito de verdade
//  continua sendo pego.
// ══════════════════════════════════════════════════════════

import { textoHumano, razaoDeCaixaAlta } from "./modulos/moderacao/caracteres.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// Replica a regra do engine sobre o texto já sanitizado.
function seriaPunido(conteudo, limite = 0.7, minLength = 10) {
  const t = textoHumano(conteudo);
  if (t.length < minLength) return false;
  const r = razaoDeCaixaAlta(t);
  return r !== null && r >= limite;
}

// ── NÃO devem ser punidos ──
console.log("── falsos positivos (não podem punir) ──");
const inocentes = [
  ["<@01ARZ3NDEKTSV4RRFFQ69G5FAV> <@01BX5ZZKBKACTAV9WEVGEMMVRZ> vamos jogar", "★ duas menções + frase curta (o caso do incidente)"],
  ["<@01ARZ3NDEKTSV4RRFFQ69G5FAV> oi", "menção + saudação"],
  ["<@01ARZ3NDEKTSV4RRFFQ69G5FAV><@01BX5ZZKBKACTAV9WEVGEMMVRZ><@01CX5ZZKBKACTAV9WEVGEMMVRZ>", "só menções, sem texto"],
  ["olha isso https://YouTube.com/watch?v=ABC123XYZ", "link com maiúsculas"],
  [":KEKW: :PogChamp: :LULW: kkkk", "emojis nomeados"],
  ["<#01JPRT00000000000000000000> vejam ali", "menção de canal"],
  ["<%01JADM00000000000000000000> confere isso", "menção de cargo"],
  ["```JSON\nCONST X = TRUE;\n```", "bloco de código"],
  ["o `SELECT * FROM USERS` retorna tudo", "código em linha"],
  ["ok", "mensagem curtíssima"],
  ["PDF ou RPG?", "siglas soltas"],
  ["Bom dia pessoal, tudo certo por aí?", "frase normal"],
  ["ID: 01ARZ3NDEKTSV4RRFFQ69G5FAV", "ULID colado solto"],
];
for (const [msg, oque] of inocentes) ok(!seriaPunido(msg), oque);

// ── DEVEM ser punidos ──
console.log("\n── gritos de verdade (têm de punir) ──");
const gritos = [
  ["PARA DE GRITAR AGORA MESMO POR FAVOR", "frase inteira em caixa alta"],
  ["ENTREM TODOS NO MEU SERVIDOR AGORA", "divulgação gritada"],
  ["<@01ARZ3NDEKTSV4RRFFQ69G5FAV> OLHA ISSO AQUI SEU MOLEQUE", "★ menção + grito de verdade ainda pega"],
  ["SOCORRO ALGUEM ME AJUDA POR FAVOR", "grito com acento"],
];
for (const [msg, oque] of gritos) ok(seriaPunido(msg), oque);

// ── O sanitizador preserva o que interessa ──
console.log("\n── sanitizador ──");
ok(textoHumano("<@01ARZ3NDEKTSV4RRFFQ69G5FAV> vamos jogar") === "vamos jogar", "remove menção, preserva o texto");
ok(textoHumano("veja https://x.com/AAA agora") === "veja agora", "remove link");
ok(textoHumano("oi") === "oi", "texto simples intacto");
ok(textoHumano(null) === "", "null não explode");
ok(textoHumano("GRITO") === "GRITO", "não altera a caixa do que sobra");
ok(seriaPunido("PDF ou RPG?") === false, "★ siglas em mensagem curta não punem");
ok(razaoDeCaixaAlta("oi") === null, "pouco texto → null (sem conclusão)");
ok(razaoDeCaixaAlta("PDF ou RPG?") === null, "  → \"PDF ou RPG?\" fica abaixo do mínimo de letras");
ok(razaoDeCaixaAlta("GRITARIA TOTAL AQUI") === 1, "grito puro → 100%");
ok(seriaPunido("meu PDF do RPG não abre, alguém me ajuda?") === false, "siglas no meio de frase normal não punem");

// ── NFD (clientes Apple) ──
console.log("\n── unicode NFD ──");
{
  const { analisarCaracteres } = await import("./modulos/moderacao/caracteres.js");
  // Simula o que o engine faz agora: normaliza para NFC antes de analisar.
  const nfc = (t) => t.normalize("NFC");
  const acentosNfd = "áéíóú àèìòù âêîôû ãõ ç".normalize("NFD");
  ok(analisarCaracteres(nfc(acentosNfd)) === null,
    "★ mensagem só de acentos vinda de um iPhone (NFD) não é zalgo após NFC");
  // zalgo real: base + marcas empilhadas — NFC não recompõe, continua pego
  const zalgo = "z" + "\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308".repeat(2);
  ok(analisarCaracteres(nfc(zalgo))?.tipo === "zalgo",
    "★ zalgo de verdade continua detectado mesmo após NFC");
}

console.log(`\nANTI-CAPS: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
