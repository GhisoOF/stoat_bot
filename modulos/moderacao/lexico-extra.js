// Vocabulário extra do sentinela — o lugar para acrescentar termos sem mexer
// na lógica do scorecard.
//
// Cada lista aceita:
//   • texto  → frase literal; casa sem diferenciar maiúsculas, palavra
//              inteira ("nitro" não casa dentro de "nitroglicerina");
//   • RegExp → usada como está (para quem precisa de variação: /amea[çc]\w+/i).
//
// O texto analisado já vem sem disfarce (leet, cirílico, letras separadas,
// invisíveis), então escreva a forma normal da palavra.
//
// Como cada lista pesa (ver PESOS em scorecard.js):
//   golpe, contato, pedidoDados, gore, alerta → somam como os sinais de mesmo
//     nome (alerta DESCONTA: é quem avisa sobre o golpe);
//   dadosPessoais, vazar, coercao → as peças do doxxing/extorsão, que só
//     condenam juntas (conj_doxxing, conj_extorsao);
//   grupos + insultos → o ódio por CONJUNÇÃO: um grupo perto de um insulto
//     (a palavra do grupo sozinha é neutra e nunca pune);
//   violentos → ameaça por conjunção ("<violento> e <violento>").
//
// Depois de mexer aqui, rode a bateria (./avaliar.sh na judy-bateria): ela
// mede o efeito no corpus inteiro, inclusive se alguma conversa normal passou
// a ser punida.

export default {
  golpe: [],
  contato: [],
  pedidoDados: [],
  alerta: [],
  gore: [],
  dadosPessoais: [],
  vazar: [],
  coercao: [],
  grupos: [],
  insultos: [],
  violentos: [],
};
