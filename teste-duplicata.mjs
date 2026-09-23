// O spam que passou: a MESMA mensagem longa, repetida várias vezes, num
// ritmo calmo (o bot "Stork", 23 set 2026).
//
// Por que passou por tudo:
//   • anti-spam mede VELOCIDADE (5 msg em 4s) — o ritmo era calmo;
//   • anti-repeticao olha DENTRO de uma mensagem (o mesmo caractere seguido);
//   • o sentinela julga o CONTEÚDO — e o texto era inofensivo (falava sobre
//     spam, ironicamente), então a nota nunca chegava perto do limiar.
// Ninguém comparava uma mensagem com a anterior.

import assert from "node:assert";
import { analisarDuplicata, digital } from "./modulos/moderacao/caracteres.js";
import { analisarConteudo } from "./modulos/moderacao/scorecard.js";

let ok = 0, falhou = 0;
const t = (nome, fn) => {
  try { fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

// O texto real, como veio no canal.
const STORK = "Spam can refer to unsolicited junk messages or the iconic canned "
  + "meat. Since your request is broad, here is a quick look at both: 📧 Digital "
  + "Spam (Unsolicited Messages)Digital spam is bulk, unsolicited communication "
  + "sent across email, text messages, or phone calls.The Purpose: Most spam is "
  + "sent by automated bots to advertise products, but dangerous varieties like "
  + "phishing attempt to steal passwords, financial details, or install malware.";

console.log("\n── o caso do Stork ──");
t("a 1ª e a 2ª vez passam (pode ser coincidência)", () => {
  assert.equal(analisarDuplicata(STORK, []), null);
  assert.equal(analisarDuplicata(STORK, [digital(STORK)]), null);
});
t("a 3ª vez é pega", () => {
  const r = analisarDuplicata(STORK, [digital(STORK), digital(STORK)]);
  assert.ok(r, "a 3ª repetição tinha de ser detectada");
  assert.equal(r.tipo, "duplicata");
  assert.equal(r.vezes, 3);
  assert.match(r.motivo, /3 vezes/);
});
t("o limite é configurável", () => {
  assert.ok(analisarDuplicata(STORK, [digital(STORK)], { maxRepetidas: 2 }));
  assert.equal(analisarDuplicata(STORK, [digital(STORK), digital(STORK)], { maxRepetidas: 9 }), null);
});

console.log("\n── disfarces que não funcionam ──");
const anteriores = [digital(STORK), digital(STORK)];
for (const [nome, variante] of [
  ["MAIÚSCULAS", STORK.toUpperCase()],
  ["pontuação trocada", STORK.replace(/[.,:]/g, "!")],
  ["espaços a mais", STORK.replace(/ /g, "  ")],
  ["emoji trocado", STORK.replace("📧", "🍖")],
  ["acento acrescentado", STORK.replace(/a/g, "á")],
]) {
  t(`${nome} continua sendo a mesma mensagem`, () => {
    assert.ok(analisarDuplicata(variante, anteriores), `passou disfarçado de "${nome}"`);
  });
}

console.log("\n── conversa normal NÃO pode ser pega ──");
t('mensagens curtas repetidas ("ok", "kkk") são ignoradas', () => {
  for (const curta of ["ok", "kkkk", "sim", "boa noite", "👍"]) {
    assert.equal(digital(curta), null, `"${curta}" virou digital e vai acusar gente à toa`);
  }
});
t("textos diferentes não acusam", () => {
  const a = "vocês viram o jogo ontem? foi um absurdo o que aconteceu no segundo tempo";
  const b = "acabei de chegar em casa, alguém quer jogar alguma coisa hoje à noite?";
  assert.equal(analisarDuplicata(b, [digital(a), digital(a)]), null);
});
t("repetir DUAS vezes ainda é aceitável (reenvio, correção)", () => {
  const msg = "gente, o link do evento é esse aqui, deem uma olhada quando puderem";
  assert.equal(analisarDuplicata(msg, [digital(msg)]), null);
});

console.log("\n── o sentinela agora enxerga a repetição ──");
t("mensagem inofensiva, sozinha, continua com nota baixa", () => {
  const r = analisarConteudo(STORK, { rate: 1, repetidas: 1 });
  assert.ok(r.nota < 5, `nota ${r.nota} alta demais para texto inofensivo`);
  assert.ok(!r.sinais.includes("duplicata"));
});
t("a mesma mensagem repetida SOBE a nota", () => {
  const sozinha = analisarConteudo(STORK, { rate: 1, repetidas: 1 }).nota;
  const repetida = analisarConteudo(STORK, { rate: 1, repetidas: 4 }).nota;
  assert.ok(repetida > sozinha, `repetida (${repetida}) devia passar de sozinha (${sozinha})`);
});
t("a repetição sozinha NÃO condena um texto limpo", () => {
  // Importante: repetir não é crime. O sinal soma, mas quem condena é o
  // anti-duplicata (determinístico), não o julgamento do sentinela.
  const r = analisarConteudo("bom dia pessoal, tudo certo por aí?", { rate: 1, repetidas: 4 });
  assert.ok(r.nota < 5, `nota ${r.nota} — texto limpo repetido não pode ser tratado como golpe`);
});
t("repetição + conteúdo suspeito pesa mais que cada um sozinho", () => {
  const golpe = "GANHE DINHEIRO AGORA clique aqui http://bit.ly/xxx promoção imperdível últimas vagas";
  const uma = analisarConteudo(golpe, { rate: 1, repetidas: 1 }).nota;
  const varias = analisarConteudo(golpe, { rate: 1, repetidas: 4 }).nota;
  assert.ok(varias >= uma, "repetir um golpe não pode baixar a nota");
});

console.log(`\nANTI-DUPLICATA: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
