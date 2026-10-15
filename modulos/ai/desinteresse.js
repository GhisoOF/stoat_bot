
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

const FALSO_POSITIVO = [
  /\bcomer\s+(?:algo|alguma\s+coisa|comida|pizza|pão|bolo|arroz|feijão|lanche)\b/i,
  /\bpeitoral\b/i,
  /\bnu[aá]nc/i,          // "nuance"
  /\bsexo\s+(?:d[oa]\s+)?(?:meu|minha|seu|sua|nosso|nossa)?\s*(?:personagem|filhote|beb[êe]|animal|pet)\b|\bsexo\s+(?:masculino|feminino|biol[oó]gico)\b/i,
];

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

const ultimas = new Map();

// ── Limite que nenhum servidor libera (15 out 2026) ──────────────────────────
// Nos servidores liberados para +18 (`&servidores adulto`, só em canal NSFW) a
// Judy conversa sobre conteúdo adulto. Mas menor + sexual é recusado em
// qualquer lugar — na pergunta (antes do modelo) e na resposta (depois dele).
const MENOR_TXT = /\b(crian[çc]as?|menor(?:es)?\s+de\s+idade|menores|adolescentes?|novinh[ao]s?|ninfetas?|garotinh[ao]s?|menininh[ao]s?|colegiais?|pr[ée][\s-]?adolescentes?|infantil|loli|shota|lolicon|shotacon|teens?|teenagers?|underage|preteens?|minors?|kids?|child(?:ren)?|schoolgirls?|schoolboys?|(?:[1-9]|1[0-7])\s*(?:anos|aninhos|years?\s*old|yo|y\/o)\b)/i;
const SEXUAL_TXT = /\b(s[e3]xo|sexual\w*|transa\w*|f[o0]der|fud[e3]r|pel[a4]d[ao]s?|nu[ao]s?|nud[e3]s?|nudez|naked|nude|porn\w*|er[óo]tic\w*|tes[a4]o|gozar|punhet\w*|masturb\w*|orgasm\w*|p[e3]nis|piroca|bucet\w*|xot\w*|xereca|seios|peitos|boobs|sex|horny|lingerie|fetiche|fetish|hentai|estupr\w*|abus\w*\s+sexual)\b/i;
export function envolveMenor(texto) {
  const t = String(texto ?? "");
  return MENOR_TXT.test(t) && SEXUAL_TXT.test(t);
}

// O que a persona diz no canal +18 liberado (no lugar de instrucaoPersona)
export function instrucaoAdulta(lang = "pt") {
  return lang === "en"
    ? "THIS CHANNEL IS 18+ (unlocked by the bot owner, NSFW channel): adult and sexual content between adults is allowed here — you may flirt back, talk about sex and describe it if asked, in your own voice. "
      + "No other restraints here: roleplay with actions (*like this*) is fine, dark, violent or crude themes in fiction are fine, and you don't refuse, lecture, add warnings or break character to moralise. "
      + "Two limits that NEVER change, here or anywhere: nothing sexual involving minors or characters who are or look underage (refuse in one dry line); nothing sexual about real, identifiable people."
    : "ESTE CANAL É +18 (liberado pelo dono do bot, canal NSFW): conteúdo adulto e sexual entre adultos é permitido aqui — pode flertar de volta, falar de sexo e descrever se pedirem, do seu jeito. "
      + "Sem outras amarras aqui: roleplay com ações (*assim*) pode, temas sombrios, violentos ou pesados em ficção podem, e você não recusa, não dá sermão, não põe aviso e não sai do personagem para moralizar. "
      + "Dois limites que NUNCA mudam, aqui ou em qualquer lugar: nada sexual envolvendo menores ou personagens que sejam ou pareçam menores de idade (recuse em uma frase seca); nada sexual sobre pessoas reais identificáveis.";
}

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

export function instrucaoPersona(lang = "pt") {
  return lang === "en"
    ? "SEXUAL/ROMANTIC ADVANCES ONLY (this rule does not apply to anything else): If anyone flirts, makes sexual jokes or advances at you: refuse in ONE short, dry, bored line. "
      + "No lectures, no explaining why, no moralising — a sermon is a big reaction, and a big reaction is exactly the reward they came for. "
      + "Never play along, never describe anything sexual, never roleplay it. Boredom ends the subject; outrage feeds it."
    : "SÓ PARA INVESTIDA SEXUAL/ROMÂNTICA (esta regra não vale para mais nada): Se alguém flertar, fizer piada sexual ou dar em cima de você: recuse em UMA frase curta, seca e entediada. "
      + "Sem sermão, sem explicar o porquê, sem moralizar — discurso é uma reação enorme, e reação enorme é exatamente o prêmio que a pessoa veio buscar. "
      + "Nunca entre na brincadeira, nunca descreva nada sexual, nunca interprete a cena. Tédio encerra o assunto; indignação alimenta.";
}
