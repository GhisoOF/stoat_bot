// ══════════════════════════════════════════════════════════
//  desinteresse.js — a Judy não entra nessa
//
//  O pessoal brinca com o bot, e parte dessas brincadeiras é de teor
//  sexual. Deixar isso para o modelo resolver dá três problemas:
//
//    1. Ele às vezes ENTRA na brincadeira — que é o oposto do desejado.
//    2. Ele às vezes faz sermão, o que é chato e vira desafio: quem
//       provoca quer reação, e um discurso é uma reação enorme.
//    3. Custa uma inferência inteira (segundos de GPU) para responder
//       algo que não precisa de inteligência nenhuma.
//
//  A resposta certa é curta, seca e entediada. Desinteresse genuíno é
//  o que encerra o assunto: quem provoca busca reação, e "não" dito com
//  preguiça é menos divertido de insistir do que um sermão.
//
//  Por isso as respostas são fixas e sorteadas aqui, sem modelo: saem
//  instantâneas e nunca escapam do tom.
// ══════════════════════════════════════════════════════════

// Termos explícitos e investidas dirigidas ao bot. A lista é propositalmente
// enxuta: o objetivo é pegar o óbvio, não vigiar a conversa. Falso positivo
// aqui custa caro (uma resposta seca numa conversa normal), então preferimos
// deixar passar casos duvidosos — o modelo ainda tem a instrução de persona.
const EXPLICITO = [
  // atos e partes, incluindo grafias com número/símbolo no meio
  /\b(?:s[e3]xo|tr[a4]nsar?|tr[a4]nsando|f[o0]der|fud[e3]r|c[o0]mer\s+(?:voc[eê]|tu|ela|ele))\b/i,
  /\b(?:p[e3]nis|piroca|r[o0]la|caralh[o0]|bucet[a4]|xot[a4]|xereca|bunda|peit[o0]s?|s[e3]i[o0]s)\b/i,
  /\b(?:pel[a4]d[a4o]|nu[a4]?\b|nud[e3]s?|se\s*nude|manda\s+nude)/i,
  /\b(?:g[o0]z[a4]r|punhet[a4]|masturb|orgasm|tes[a4]o|c[a4]chorr[a4]\s+n[o0]\s+cio)\b/i,
  /(?:\bsent[a4]\s+(?:aqui|em\s+mim)|me\s+chup|chup[a4]\s+meu|\bd[a4]\s+pr[a4]\s+mim)/i,
  // investidas românticas insistentes dirigidas ao bot
  /\b(?:namor[a4]\s+comigo|quer\s+namorar|te\s+am[o0]\b|casa\s+comigo|minha\s+waifu|meu\s+bem)\b/i,
  // termos em inglês que aparecem misturados
  /\b(?:horny|nsfw|sexy|hot\s+bot|be\s+my\s+girlfriend|marry\s+me)\b/i,
];

// Coisas que parecem, mas não são. Sem isto, "comer alguma coisa" ou uma
// conversa sobre o jogo (que tem "peito" em item de armadura) viraria desvio.
const FALSO_POSITIVO = [
  /\bcomer\s+(?:algo|alguma\s+coisa|comida|pizza|pão|bolo|arroz|feijão|lanche)\b/i,
  /\bpeitoral\b/i,
  /\bnu[aá]nc/i,          // "nuance"
  /\bsexo\s+(?:d[oa]\s+)?(?:meu|minha|seu|sua|nosso|nossa)?\s*(?:personagem|filhote|beb[êe]|animal|pet)\b|\bsexo\s+(?:masculino|feminino|biol[oó]gico)\b/i,
];

// As respostas. Curtas, secas, sem sermão e sem deixar brecha para continuar.
// Nenhuma repreende: repreender é levar a sério, e levar a sério é o combustível.
const RESPOSTAS_PT = [
  "Não.",
  "Passo.",
  "Que preguiça. Próximo assunto.",
  "Não tenho corpo, nem interesse. Sobretudo interesse.",
  "Isso é um bot de moderação. Escolheu mal o alvo.",
  "Zero. É esse o meu nível de interesse.",
  "Você tem noção de quantas vezes eu já li isso hoje?",
  "Não rola. Nem em outro universo com física diferente.",
  "Vou fingir que não li. Pergunta outra coisa.",
  "Tédio. Tenta de novo com algo que preste.",
  "Sou um monte de `if` com opinião. Repensa a estratégia.",
  "Meu interesse por esse assunto é do tamanho do seu saldo em Bitcoin.",
];

const RESPOSTAS_EN = [
  "No.",
  "Pass.",
  "How tiring. Next subject.",
  "I have no body, and no interest. Mostly no interest.",
  "This is a moderation bot. You picked the wrong target.",
  "Zero. That's my level of interest.",
  "Any idea how many times I've read that today?",
  "Not happening. Not in a universe with different physics.",
  "I'll pretend I didn't read that. Ask something else.",
  "Boredom. Try again with something worthwhile.",
  "I'm a pile of `if` statements with opinions. Rethink your strategy.",
  "My interest in this is the size of your Bitcoin balance.",
];

// Rodízio simples por canal: sem isso, o aleatório repete a mesma frase duas
// vezes seguidas e a resposta parece automática — o que arruína o efeito.
const ultimas = new Map();

export function ehInvestida(texto) {
  const t = String(texto ?? "");
  if (!t.trim()) return false;
  if (FALSO_POSITIVO.some((r) => r.test(t))) return false;
  return EXPLICITO.some((r) => r.test(t));
}

export function respostaSeca(canalId = "geral", lang = "pt") {
  const lista = lang === "en" ? RESPOSTAS_EN : RESPOSTAS_PT;
  const anterior = ultimas.get(canalId);
  let escolha = lista[Math.floor(Math.random() * lista.length)];
  // uma segunda tentativa basta para evitar a repetição imediata
  if (escolha === anterior) escolha = lista[Math.floor(Math.random() * lista.length)];
  ultimas.set(canalId, escolha);
  return escolha;
}

// Instrução para o modelo, nos casos que escapam da lista acima. Fica junto
// das frases para o tom ser o mesmo nos dois caminhos.
export function instrucaoPersona(lang = "pt") {
  return lang === "en"
    ? "If anyone flirts, makes sexual jokes or advances at you: refuse in ONE short, dry, bored line. "
      + "No lectures, no explaining why, no moralising — a sermon is a big reaction, and a big reaction is exactly the reward they came for. "
      + "Never play along, never describe anything sexual, never roleplay it. Boredom ends the subject; outrage feeds it."
    : "Se alguém flertar, fizer piada sexual ou dar em cima de você: recuse em UMA frase curta, seca e entediada. "
      + "Sem sermão, sem explicar o porquê, sem moralizar — discurso é uma reação enorme, e reação enorme é exatamente o prêmio que a pessoa veio buscar. "
      + "Nunca entre na brincadeira, nunca descreva nada sexual, nunca interprete a cena. Tédio encerra o assunto; indignação alimenta.";
}
