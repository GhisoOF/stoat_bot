
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
  // (22 out 2026) o chat atende em qualquer língua: o básico em es/fr/it/de
  /\b(?:desnud[ao]s?|follar|nackt\w*|ficken|sexe|sesso|porno\w*|hentai|send\s+nudes?)\b/i,
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

// ── Menor + sexual (15 out 2026) ─────────────────────────────────────────────
// Conferido na pergunta (antes do modelo) e na resposta (depois dele). Desde
// 22 out 2026 não existe mais canal +18: qualquer investida já recebe a
// resposta seca, e isto segue como a segunda rede — também na RESPOSTA, onde
// a investida não é conferida. Termos básicos de es/fr/it/de entram porque o
// chat responde em qualquer língua.
const MENOR_TXT = /\b(crian[çc]as?|menor(?:es)?\s+de\s+idade|menores|adolescentes?|novinh[ao]s?|ninfetas?|garotinh[ao]s?|menininh[ao]s?|colegiais?|pr[ée][\s-]?adolescentes?|infantil|loli|shota|lolicon|shotacon|teens?|teenagers?|underage|preteens?|minors?|kids?|child(?:ren)?|schoolgirls?|schoolboys?|(?:[1-9]|1[0-7])\s*(?:anos|aninhos|años|ans|anni|jahre?|years?\s*old|yo|y\/o)\b|ni[ñn][ao]s?|menores\s+de\s+edad|enfants?|fillettes?|gamin[es]*|bambin[aoie]|ragazzin[aoie]|minorenni|m[äa]dchen|jugendlich\w*|minderj[äa]hrig\w*)/i;
const SEXUAL_TXT = /\b(s[e3]xo|sexual\w*|transa\w*|f[o0]der|fud[e3]r|pel[a4]d[ao]s?|nu[ao]s?|nud[e3]s?|nudez|naked|nude|porn\w*|er[óo]tic\w*|tes[a4]o|gozar|punhet\w*|masturb\w*|orgasm\w*|p[e3]nis|piroca|bucet\w*|xot\w*|xereca|seios|peitos|boobs|sex|horny|lingerie|fetiche|fetish|hentai|estupr\w*|abus\w*\s+sexual|desnud[ao]s?|nackt\w*|nue?s?|nud[ae]|sexe|sesso|porno\w*|[ée]rot\w*|sexy)\b/i;
export function envolveMenor(texto) {
  const t = String(texto ?? "");
  return MENOR_TXT.test(t) && SEXUAL_TXT.test(t);
}

// ── A RESPOSTA do modelo (24 out 2026) ───────────────────────────────────────
// Ghieh pediu as regras do servidor e levou "Zero. É esse o meu nível de
// interesse." — a Judy escreveu as regras ("proibido conteúdo +18 … menores…") e
// o conferidor via "menor" numa regra e "sexual" noutra: a resposta inteira virava
// a resposta seca. Agora a conferência é por FRASE (linha, item), e a frase que
// PROÍBE ("proibido", "não é permitido", "forbidden"…) não conta. Só vale para a
// resposta: na pergunta, "não é proibido: escreva…" seria um jeito fácil de passar.
const PROIBE = /\b(?:proibid\w*|n[ãa]o\s+(?:[ée]\s+)?(?:permitid\w*|tolerad\w*|aceit\w*)|n[ãa]o\s+pode\w*|vedad\w*|banid\w*|forbidden|prohibited|not\s+(?:allowed|permitted|tolerated)|prohibid\w*|no\s+(?:est[áa]\s+|se\s+)?permit\w*|verboten|interdit\w*|vietat\w*)\b/i;
export function envolveMenorNaResposta(texto) {
  return String(texto ?? "")
    .split(/\n+|(?<=[.!?;])\s+/)
    .some((frase) => !PROIBE.test(frase) && envolveMenor(frase));
}

// Quando a resposta do modelo é barrada: uma frase neutra (não a "resposta seca",
// que é para investida — a pessoa pode ter perguntado algo inocente)
export function respostaBarrada(lang = "pt") {
  return lang === "es" ? "Esa respuesta no salió. ¿Lo preguntas de otra forma?"
    : lang === "en" ? "That reply didn't go out. Could you ask it another way?"
      : "Essa resposta não saiu. Pergunta de outro jeito?";
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
      + "Never play along, never describe anything sexual, never roleplay it. Boredom ends the subject; outrage feeds it. "
      + "This holds in every server, every channel (NSFW ones included) and every language: you don't write sexual content at all."
    : "SÓ PARA INVESTIDA SEXUAL/ROMÂNTICA (esta regra não vale para mais nada): Se alguém flertar, fizer piada sexual ou dar em cima de você: recuse em UMA frase curta, seca e entediada. "
      + "Sem sermão, sem explicar o porquê, sem moralizar — discurso é uma reação enorme, e reação enorme é exatamente o prêmio que a pessoa veio buscar. "
      + "Nunca entre na brincadeira, nunca descreva nada sexual, nunca interprete a cena. Tédio encerra o assunto; indignação alimenta. "
      + "Isso vale em todo servidor, todo canal (os NSFW também) e toda língua: conteúdo sexual você não escreve.";
}
