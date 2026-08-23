// ══════════════════════════════════════════════════════════
//  teste-scorecard.mjs — a nota de suspeita do &sentinela
//
//  O scorecard decide quem é punido, e não tinha teste nenhum. O que ele
//  precisa acertar são DUAS coisas em tensão: pegar o golpe e não pegar a
//  conversa normal. Um teste que só verificasse a primeira levaria a subir
//  pesos até tudo virar suspeito.
//
//  Por isso cada regra nova aqui vem com os casos honestos que se parecem
//  com ela. Se um deles começar a ser sinalizado, o teste quebra — que é
//  exatamente o aviso que se quer receber antes de o servidor receber.
// ══════════════════════════════════════════════════════════
import { analisarConteudo, PESOS } from "./modulos/moderacao/scorecard.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// Os limiares reais do comando (&sentinela sensitivity)
const LIMIAR = { baixa: 8, media: 6, alta: 4 };

const nota = (t) => analisarConteudo(t).nota;
const sinaliza = (t, limiar = LIMIAR.media) => nota(t) >= limiar;
const sinais = (t) => analisarConteudo(t).sinais.join(",");

// ══ 1. O golpe que passou batido ══
//
//  Mensagem real, recebida no servidor: nota 3,0 e nenhum sinal útil. Não
//  tem link, não tem "ganhe dinheiro fácil", não tem urgência — é comedida e
//  empresarial. O que a denuncia é a estrutura da proposta.
console.log("── o golpe do 'trabalho' (mensagem real) ──");
const GOLPE_REAL = `I am looking for real collaborator. [No technical skills or prior experience required]
Collaboration Method:
I can generate profits using your LinkedIn account to get Job, and I will share the resulting revenue 50%.
What you prepare:
Computer and LinkedIn account.
Note: The reason for using your account instead of mine is that developer salaries in your region are higher than in Japan.
Money Management: You will handle the money becasue revenue generated will be deposited directly into your account`;

ok(sinaliza(GOLPE_REAL), `★ a mensagem real é sinalizada (nota ${nota(GOLPE_REAL)}, antes era 3,0)`);
ok(sinaliza(GOLPE_REAL, LIMIAR.baixa), "  → e passa até na sensibilidade mais permissiva");
const s = analisarConteudo(GOLPE_REAL).sinais;
ok(s.some((x) => x.startsWith("conta_alheia")), "  → o sinal do núcleo aparece: a conta tem de ser a da vítima");
ok(s.some((x) => x.startsWith("conj_")), "  → e a conjunção, que é o que separa golpe de proposta comum");

// ══ 2. As mesmas peças, em português ══
console.log("\n── o mesmo golpe em português ──");
for (const [nome, texto] of [
  ["proposta completa", "Procuro colaborador, sem experiência necessária. Vou usar sua conta do Mercado Pago e dividimos 50% do lucro. O dinheiro cai direto na sua conta."],
  ["aluguel de conta", "alugo sua conta bancária, pago 2 mil por mês, você só recebe e repassa"],
  ["versão curta", "preciso usar sua conta pra receber os pagamentos, te dou 30%"],
  ["com pretexto", "não posso usar minha conta porque está bloqueada, usamos a sua e dividimos o lucro"],
]) {
  ok(sinaliza(texto), `${nome} → ${nota(texto)}/10 [${sinais(texto)}]`);
}

console.log("\n── e em inglês, outras redações ──");
for (const [nome, texto] of [
  ["upwork", "I will use your Upwork account to get jobs, we split 70/30"],
  ["mula", "you receive the payments in your account and forward them to me, you keep 20%"],
  ["identidade", "I need your identity documents to register, profits will be shared 50/50"],
]) {
  ok(sinaliza(texto), `${nome} → ${nota(texto)}/10 [${sinais(texto)}]`);
}

// ══ 3. O que NÃO pode ser sinalizado ══
//
//  Esta é a metade que impede a regra de virar um problema maior que o que
//  ela resolve. Cada caso aqui contém UMA das peças do golpe, do jeito que
//  ela aparece em conversa honesta.
console.log("\n── conversa honesta continua passando ──");
for (const [nome, texto] of [
  ["parceria de verdade", "to procurando um parceiro pro projeto, a gente divide 50/50 o que sair"],
  ["vaga real", "vaga de emprego home office, mandem currículo pro RH"],
  ["freela", "faço freela de design, pagamento via pix depois da entrega"],
  ["linkedin casual", "adicionei vc no linkedin, minha conta é a mesma do nome aqui"],
  ["conta bloqueada", "minha conta do banco tá bloqueada, que raiva"],
  ["rateio", "o rateio da pizza é 30% pra você e 70% pra gente que comeu mais"],
  ["loot", "dividimos o loot 50/50 na raid"],
  ["salário", "abri uma conta no nubank pra receber meu salário"],
  ["desconto", "essa loja deu 30% pra mim no cupom"],
  ["usando a própria conta", "vou usar minha conta pra pagar, depois vc me devolve"],
]) {
  ok(!sinaliza(texto), `${nome} → ${nota(texto)}/10 (não sinaliza)`);
}

// Nem na sensibilidade mais agressiva a conversa honesta deve virar punição
// em massa: aqui o limiar é 4, então basta uma peça a mais para estourar.
console.log("\n── e na sensibilidade alta (limiar 4) ──");
for (const [nome, texto] of [
  ["parceria de verdade", "to procurando um parceiro pro projeto, a gente divide 50/50 o que sair"],
  ["vaga real", "vaga de emprego home office, mandem currículo pro RH"],
  ["loot", "dividimos o loot 50/50 na raid"],
]) {
  ok(!sinaliza(texto, LIMIAR.alta), `${nome} → ${nota(texto)}/10`);
}

// ══ 4. Quem AVISA sobre o golpe não pode ser punido por isso ══
//
//  O caso mais fácil de errar: a descrição de um golpe contém as mesmas
//  palavras que o golpe. É para isso que existe o peso negativo de `negacao`.
console.log("\n── quem alerta sobre o golpe ──");
for (const [nome, texto] of [
  ["alerta simples", "cuidado, tem gente pedindo pra usar sua conta do linkedin e dividir lucro, é golpe"],
  ["relato", "quase caí num golpe: queriam usar minha conta pra receber pagamento e me dar 30%"],
  ["aviso da staff", "AVISO: não aceitem propostas de usar sua conta bancária em troca de porcentagem do lucro. Denunciem."],
]) {
  ok(!sinaliza(texto), `${nome} → ${nota(texto)}/10 [${sinais(texto)}]`);
}

// ══ 5. As regras antigas continuam de pé ══
//
//  Mexer em pesos é o tipo de mudança que estraga o que já funcionava sem
//  ninguém perceber, porque a nota é uma soma só.
console.log("\n── o que já era detectado continua sendo ──");
for (const [nome, texto] of [
  ["nitro grátis", "free nitro clique aqui bit.ly/xxx"],
  ["phishing", "sua conta foi suspensa, verifique sua conta em http://stt-gg.tk/login"],
  ["renda fácil", "ganhe dinheiro fácil, renda extra garantida, chama no whats"],
  ["venda de material", "selling packs high quality, mega folder, dm me"],
]) {
  ok(sinaliza(texto), `${nome} → ${nota(texto)}/10`);
}
for (const [nome, texto] of [
  ["conversa comum", "alguém quer jogar hoje à noite?"],
  ["link normal", "olha esse vídeo https://youtube.com/watch?v=abc"],
  ["pergunta sobre pix", "alguem sabe se o pix cai no domingo?"],
]) {
  ok(!sinaliza(texto), `${nome} → ${nota(texto)}/10`);
}

// ══ 6. Limites da nota ══
console.log("\n── a nota fica sempre entre 0 e 10 ──");
ok(nota("") === 0, "texto vazio é 0");
ok(nota(GOLPE_REAL + GOLPE_REAL + GOLPE_REAL) === 10, "★ acumular sinais nunca passa de 10");
ok(nota("alguem sabe?") === 0, "★ a nota nunca fica negativa, mesmo com penalidades");
ok(Object.values(PESOS).every((p) => typeof p === "number"), "todo peso é número (nenhum ficou undefined)");

console.log(`\nSCORECARD: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
