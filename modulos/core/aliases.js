// ══════════════════════════════════════════════════════════
//  aliases.js — os comandos falam os dois idiomas
//
//  Duas direções, uma tabela só:
//
//   1. ENTRADA — quem digita `&help moderation` ou `&game create`
//      recebe o mesmo resultado de `&help moderacao` e `&game criar`.
//      Os módulos continuam comparando com o token em PT; a tradução
//      acontece aqui, antes do dispatch, e eles nem ficam sabendo.
//
//   2. EXIBIÇÃO — num servidor em inglês, o help mostra a forma
//      inglesa (`&game create`), não a portuguesa. Como a tabela é a
//      mesma, o que aparece na tela é garantidamente o que funciona.
//
//  Por que não traduzir as chaves dentro de cada módulo: seriam ~40
//  arquivos com duas listas cada, e qualquer novo alias exigiria
//  lembrar de mexer nos dois lados. Aqui é um lugar só.
// ══════════════════════════════════════════════════════════

// ── Nome do COMANDO: canônico (PT) → como exibir em inglês ──
// Só entram os que mudam de verdade. `ping`, `debug`, `automod`,
// `scam`, `embed`, `config` e afins são iguais nos dois idiomas.
export const COMANDO_EN = {
  acesso: "access",
  banglobal: "globalban",
  cargomudo: "muterole",
  comando: "command",
  cor: "color",
  sentinela: "sentinel",
  idioma: "language",
  limpar: "purge",
  log: "log",
  punicao: "punishment",
  servidores: "servers",
  sobre: "about",
  tutorial: "tutorial",
  assistente: "wizard",
  warn: "warn",
  xp: "xp",
  game: "game",
  staff: "staff",
  fuso: "timezone",
  boasvindas: "welcome",
  adeus: "goodbye",
};

// ── Aliases de comando que precisam EXISTIR como rota ──
// Tudo que COMANDO_EN mostra tem que funcionar quando digitado. Estes
// são os que ainda não estavam no CANONICO do main.
export const COMANDO_EXTRA = {
  access: "acesso",
  sentinel: "sentinela", sentry: "sentinela",
  punishment: "punicao",
  color: "cor",
  colour: "cor",
  muterole: "cargomudo",
  mutedrole: "cargomudo",
  command: "comando",
  reactionroles: "reactionrole",
  levels: "xp",
  character: "game",
  guide: "tutorial",
  start: "tutorial",
  wizard: "assistente",
  setup: "assistente",
  configure: "assistente",
  team: "staff",
  timezone: "fuso",
  timezones: "fuso",
  tz: "fuso",
  clock: "fuso",
  welcome: "boasvindas",
  greeting: "boasvindas",
  goodbye: "adeus",
  farewell: "adeus",
};

// ── Tokens de SUBCOMANDO, por comando canônico ──
// Formato: { inglês: português }. O que já é aceito em inglês pelo
// próprio módulo (list, mode, channel, on, off…) não precisa estar aqui,
// mas repetir não faz mal — a normalização é idempotente.
const SUB = {
  help: {
    moderation: "moderacao", settings: "config", configuration: "config",
    tools: "ferramentas", general: "geral", levels: "xp", character: "game",
    // grupos novos
    start: "comecar", protect: "proteger", protection: "proteger",
    customize: "personalizar", customise: "personalizar", fun: "diversao",
    diagnostics: "diagnostico", troubleshooting: "diagnostico", owner: "dono",
  },
  assistente: {
    quick: "rapido", fast: "rapido", full: "completo", complete: "completo",
    channels: "canais", protection: "protecao", protect: "protecao",
    cancel: "cancelar", stop: "cancelar",
  },
  // Áreas do tutorial. O módulo já entende os nomes em inglês sozinho
  // (o mapa APELIDOS dele), então esta tabela é usada só para EXIBIR —
  // normalizarArgs não mexe em `tutorial`, justamente para não atropelar
  // as áreas dele com nomes de comando parecidos (`rpg` é área, não `game`).
  tutorial: {
    moderation: "moderacao", roles: "cargos", levels: "xp",
    character: "rpg", adventure: "aventura", economy: "economia",
    setup: "game", permissions: "permissoes", logging: "logs",
    news: "noticias", messages: "mensagens", settings: "ajustes",
    ai: "ia", channels: "canais",
  },
  game: {
    create: "criar", new: "novo", delete: "apagar", erase: "apagar",
    points: "pontos", spend: "pontos",
    items: "itens", inventory: "inventario", bag: "mochila",
    item: "item", spell: "magia", spells: "magias", learn: "aprender",
    grimoire: "grimorio", magic: "magia",
    equip: "equipar", unequip: "desequipar", wear: "vestir",
    catalog: "catalogo", shop: "loja",
    wallet: "carteira", balance: "saldo", economy: "economia",
    market: "mercado", exchange: "cambio", trade: "trocar", barter: "escambo", rates: "taxas", bank: "banco",
    buy: "comprar", sell: "vender", hire: "contratar", recruit: "recrutar",
    rest: "descansar",
    companion: "follower", companions: "followers", party: "party",
    recruits: "recrutas", mercenaries: "mercenarios",
    mission: "missao", missions: "missoes", quest: "quest",
    dungeon: "dungeon", rescue: "resgatar",
    top: "top", ranking: "ranking",
    sheet: "ficha", profile: "perfil",
    help: "ajuda", commands: "comandos",
    // dentro de `game admin` e `game follower`
    give: "dar", item: "item", level: "nivel", energy: "energia",
    // Iguais nos dois idiomas, mas precisam constar: a tradução para no
    // primeiro token desconhecido, e sem eles a cadeia quebraria no meio.
    admin: "admin", eco: "eco", status: "status", top: "top",
    currency: "moeda", coin: "moeda", test: "teste", simulate: "simular",
    eco: "eco", reset: "reset", server: "servidor", all: "tudo",
    confirm: "confirmar", model: "modelo", view: "ver", info: "detalhe",
    remove: "remover", default: "padrao", main: "padrao",
    world: "mundo", fantasy: "fantasia", simple: "simples",
    take: "levar", add: "adicionar", drop: "tirar", dismiss: "dispensar",
    sheet: "ficha", status: "status", give: "dar", retrieve: "pegar",
    bag: "mochila", inventory: "inventario",
    photos: "fotos", album: "album",
    cancel: "cancelar", accept: "aceitar", announce: "anunciar",
  },
  xp: {
    setup: "setup", config: "config", configure: "configurar",
    roles: "cargos", createroles: "criarcargos", create: "criar",
    reset: "reset", wipe: "zerar", top: "top", ranking: "ranking",
    rank: "rank", leaderboard: "leaderboard",
    multiplier: "multiplicador", maxlevel: "nivelmaximo", interval: "intervalo",
    channel: "canal", announce: "anuncio", announcement: "anuncio",
  },
  acesso: {
    role: "cargo", roles: "cargos", staff: "staff",
    channel: "canal", channels: "canais",
    all: "todos", only: "somente", except: "exceto",
    add: "add", remove: "remove", clear: "limpar",
    staffignores: "staffignora", staffbypass: "staffignora",
    status: "status",
  },
  banglobal: {
    sweep: "varrer", scan: "varrer", review: "revisar", view: "ver",
    list: "lista", banned: "lista", all: "lista",
    exempt: "isentar", allow: "isentar", accept: "isentar", bypass: "isentar",
    exempted: "isentos",
    undo: "desfazer", revert: "desfazer", confirm: "confirmar",
    server: "servidor", remove: "remover",
    forget: "esquecer", history: "historico",
    warn: "avisar", ban: "banir", off: "off",
    // `import`/`auto` deixaram de ser configuração (a contribuição é sempre
    // ligada). Continuam mapeados para que quem os digite receba a explicação
    // do que mudou, em vez de "subcomando desconhecido".
    import: "importar", auto: "auto", automatic: "auto", autoimport: "auto",
    contribution: "contribuicao",
  },
  punicao: {
    mode: "modo", warns: "warns", role: "cargo", silencerole: "silencerole",
    status: "status", config: "config",
    warn: "avisar", delete: "apagar", confirm: "confirmar",
    stack: "acumular", ban: "banir",
  },
  automod: {
    punishment: "punicao", inherit: "herdar", global: "global",
    set: "set", status: "status", debug: "debug",
    warn: "avisar", delete: "apagar", confirm: "confirmar",
    stack: "acumular", ban: "banir",
    messages: "mensagens", time: "tempo", mentions: "mencoes",
    size: "tamanho", threshold: "limiar", ignore: "ignorar",
    repetition: "repeticao",
  },
  cor: {
    panel: "painel", create: "criar", generate: "gerar",
    gradient: "gradiente", preset: "preset", presets: "presets",
    list: "lista", roles: "cargos", remove: "remover", clear: "limpar",
    default: "padrao", here: "aqui", help: "ajuda",
  },
  reactionrole: {
    exclusive: "exclusivo", unique: "unico",
    add: "add", remove: "remove", list: "list",
    reload: "recarregar", repair: "reparar",
  },
  rss: {
    add: "add", remove: "remove", list: "list",
    channel: "canal", now: "agora", test: "testar", off: "off",
  },
  staff: {
    add: "add", remove: "remove", list: "lista", clear: "limpar",
    title: "titulo", label: "titulo",
  },
  boasvindas: {
    channel: "canal", title: "titulo", text: "texto", message: "texto",
    colour: "cor", color: "cor", image: "imagem", test: "testar",
    default: "padrao", status: "status", clear: "limpar", here: "aqui",
    hidden: "oculto", hide: "oculto", visible: "visivel", show: "visivel",
  },
  adeus: {
    channel: "canal", title: "titulo", text: "texto", message: "texto",
    colour: "cor", color: "cor", image: "imagem", test: "testar",
    default: "padrao", status: "status", clear: "limpar", here: "aqui",
    hidden: "oculto", hide: "oculto", visible: "visivel", show: "visivel",
  },
  tts: {
    channel: "canal", here: "aqui", broadcast: "transmitir",
    filter: "filtro", sieve: "filtro", restart: "reiniciar", test: "teste",
    diagnose: "diagnostico", diagnostics: "diagnostico", health: "estado",
    perminute: "porminuto", cap: "porminuto",
    join: "entrar", leave: "sair", voice: "voz", status: "estado",
    names: "nomes", cooldown: "cooldown",
  },
  fuso: {
    add: "add", remove: "remove", list: "lista", clear: "limpar",
    search: "buscar", find: "buscar", now: "ver", time: "ver", check: "ver",
    label: "apelido", name: "apelido", alias: "apelido",
    main: "principal", reference: "principal", format: "formato",
  },
  log: {
    here: "here", off: "off", channel: "canal",
    punishments: "punicoes", members: "membros", messages: "mensagens",
    roles: "cargos", commands: "comandos",
  },
  chat: {
    free: "livre", forget: "esquecer", all: "tudo",
    profile: "perfil", map: "mapear", care: "cuidado", gentle: "gentil",
    comment: "comentar", perday: "pordia", status: "status",
    mode: "modo", relevant: "relevante", every: "todas",
  },
  modia: {
    criteria: "criterios", channel: "canal", clear: "limpar",
    status: "status", add: "add", remove: "remove",
  },
  cargomudo: {
    channels: "canais",
  },
  debug: {
    channels: "canais", permissions: "permissoes", raw: "cru",
    silence: "silence", mute: "mudo",
  },
  blocklist: {
    add: "add", remove: "remove", list: "list", clear: "clear",
    reload: "reload", adddomain: "adddomain", removedomain: "removedomain",
    domains: "dominios",
  },
  embed: { fields: "campos", colors: "cores" },
  whitelist: { add: "add", remove: "remove", list: "list" },
  sentinela: {
    sensitivity: "sensitivity", channel: "channel", test: "test",
    simulate: "simulate", ban: "ban", dismiss: "dismiss",
    config: "config", status: "status", tenure: "antiguidade",
    low: "baixa", medium: "media", high: "alta",
  },
  scam: {
    sensitivity: "sensitivity", channel: "channel", test: "test",
    simulate: "simulate", ban: "ban", dismiss: "dismiss",
    config: "config", status: "status",
    low: "baixa", medium: "media", high: "alta",
  },
  comando: {
    disable: "desativar", off: "desativar",
    enable: "ativar", on: "ativar",
    list: "list", manage: "gerenciar",
  },
  autorole: { set: "set", off: "off", disable: "desativar", remove: "remover" },
  idioma: {
    portuguese: "portugues", english: "english", status: "status",
  },
};

// Comandos cujo args[0] abre um NÍVEL a mais de subcomando. Só neles
// as posições 1 e 2 são normalizadas — do contrário `&game criar create`
// viraria um personagem chamado "criar", o que é exatamente o tipo de
// surpresa que a tradução automática não pode causar.
const ANINHADOS = {
  game: new Set(["admin", "moeda", "mercado", "follower", "followers",
    "trocar", "escambo", "party", "equipe", "reset"]),
  acesso: new Set(["cargo", "cargos", "staff", "canal", "canais"]),
  xp: new Set(["setup", "config", "configurar"]),
  automod: new Set([...Object.keys(SUB.automod), "antispam", "antimassspam",
    "antiinvite", "antimassmention", "anticaps", "antilink", "antiscam", "sentinela",
    "anticaracteres", "antirepeticao"]),
  banglobal: new Set(["varrer", "revisar", "scan", "isentar", "lista", "desfazer"]),
  cor: new Set(["painel", "criar", "gerar"]),
  reactionrole: new Set(["exclusivo", "unico"]),
  chat: new Set(["livre", "comentar", "esquecer", "cuidado", "gentil"]),
  modia: new Set(["canal", "criterios"]),
  debug: new Set(["canais", "permissoes", "silence", "mudo"]),
  punicao: new Set(["modo", "mode"]),
  log: new Set([]),
};

// ── Mapa reverso (PT → EN), para a exibição ────────────────
const SUB_REVERSO = {};
for (const [cmd, mapa] of Object.entries(SUB)) {
  SUB_REVERSO[cmd] = {};
  for (const [en, pt] of Object.entries(mapa)) {
    // O primeiro inglês encontrado para cada token PT é o preferido na tela.
    if (!SUB_REVERSO[cmd][pt]) SUB_REVERSO[cmd][pt] = en;
  }
}

// ══════════════════════════════════════════════════════════
//  ENTRADA: normaliza os argumentos de EN para PT
// ══════════════════════════════════════════════════════════
export function normalizarArgs(canonico, args, CANONICO = {}) {
  if (!Array.isArray(args) || !args.length) return args;

  // `help` e `tutorial` são meta-comandos: o primeiro argumento é o NOME de
  // outro comando, e o segundo é um subcomando DAQUELE comando. Sem tratar
  // isso, `&help game create` normalizaria só o "game" e erraria o resto.
  // `tutorial` resolve as próprias áreas (inclusive em inglês) e algumas delas
  // têm o mesmo nome de um comando — traduzir aqui mandaria `&tutorial rpg`
  // para a página de `game`, que é outra coisa.
  if (canonico === "tutorial") return args;

  if (canonico === "help") {
    const saida = [...args];
    const bruto = String(saida[0] ?? "").toLowerCase();
    // categoria/área (moderation → moderacao) ou nome de comando (color → cor)
    saida[0] = SUB[canonico]?.[bruto] ?? CANONICO[bruto] ?? COMANDO_EXTRA[bruto] ?? bruto;
    const doAlvo = SUB[saida[0]];
    if (doAlvo && saida[1]) {
      const t = String(saida[1]).toLowerCase();
      if (doAlvo[t]) saida[1] = doAlvo[t];
    }
    return saida;
  }

  const mapa = SUB[canonico];
  if (!mapa) return args;

  const saida = [...args];
  const traduz = (i) => {
    const bruto = saida[i];
    if (typeof bruto !== "string") return;
    const pt = mapa[bruto.toLowerCase()];
    if (pt) saida[i] = pt;
  };

  traduz(0);
  // Níveis mais profundos só onde o comando realmente tem subcomando aninhado.
  const aninha = ANINHADOS[canonico];
  if (aninha && aninha.has(String(saida[0] ?? "").toLowerCase())) {
    traduz(1);
    traduz(2);
  }
  return saida;
}

// ══════════════════════════════════════════════════════════
//  EXIBIÇÃO: reescreve `&comando sub …` para a forma inglesa
// ══════════════════════════════════════════════════════════

// Canônico do comando a partir de qualquer alias conhecido.
function canonicoDe(nome, CANONICO = {}) {
  const n = String(nome ?? "").toLowerCase();
  return CANONICO[n] ?? COMANDO_EXTRA[n] ?? n;
}

// Palavras que aparecem dentro de placeholders (`<nome>`, `[quantos]`) em
// qualquer comando. Não são subcomandos, são o rótulo do que se espera ali —
// e ficariam em português mesmo num texto de ajuda inteiro em inglês.
const PLACEHOLDER_EN = {
  nome: "name", nomes: "names", "número": "number", numero: "number",
  quantos: "amount", quantidade: "amount", qtd: "qty", valor: "value",
  texto: "text", mensagem: "message", canal: "channel", canais: "channels",
  cargo: "role", cargos: "roles", "usuário": "user", usuario: "user",
  pessoa: "person", item: "item", itens: "items", "preço": "price",
  preco: "price", segundos: "seconds", campo: "field", "parâmetro": "parameter",
  parametro: "parameter", raridade: "rarity", slot: "slot", moeda: "currency",
  "missão": "mission", missao: "mission", idmensagem: "messageId",
  iddocanal: "channelId", idcargo: "roleId", link: "link", url: "url",
  "símbolo": "symbol", simbolo: "symbol", "nível": "level", nivel: "level",
  "opção": "option", opcao: "option", motivo: "reason", dias: "days",
};

// Traduz uma LISTA de opções, como as de `<off|avisar|banir>`. Cada item vai
// para o mesmo mapa dos subcomandos — é a mesma coisa, só escrita junta.
function traduzirLista(dentro, rev) {
  return dentro.split("|").map((parte) => {
    const t = parte.trim().toLowerCase();
    return rev[t] ?? PLACEHOLDER_EN[t] ?? parte;
  }).join("|");
}

// Um token isolado: pode ser um subcomando (`avisar`), um placeholder
// (`<off|avisar>`) ou algo que não é nem um nem outro (aí volta intacto).
function traduzirToken(tok, rev) {
  // placeholder: preserva os delimitadores e traduz o miolo
  const m = tok.match(/^([<[(])(.+)([>\])])$/);
  if (m) return m[1] + traduzirLista(m[2], rev) + m[3];
  if (tok.includes("|")) return traduzirLista(tok, rev);
  return rev[tok.toLowerCase()] ?? tok;
}

// Traduz UM trecho de comando, já sem as crases. Ex.: "&game criar [nome]".
// Devolve { texto, comando } — o comando volta para virar contexto das
// menções soltas que vierem depois no mesmo texto de ajuda.
function traduzirTrecho(trecho, prefixo, CANONICO) {
  const partes = trecho.trim().split(/\s+/);
  if (!partes.length || !partes[0].startsWith(prefixo)) return { texto: trecho, comando: null };

  const nomeBruto = partes[0].slice(prefixo.length).toLowerCase();
  const canonico = canonicoDe(nomeBruto, CANONICO);
  const nomeEN = COMANDO_EN[canonico] ?? canonico;

  // `help` e `tutorial` falam SOBRE outros comandos: o 2º token é um nome de
  // comando e o 3º é um subcomando dele. Sem isso, `&help banglobal varrer`
  // sairia com o nome e o subcomando ainda em português.
  if ((canonico === "help" || canonico === "tutorial") && partes.length > 1) {
    const alvoBruto = String(partes[1]).toLowerCase();
    const revProprio = SUB_REVERSO[canonico] ?? {};
    // No tutorial o argumento é sempre uma ÁREA. Se não conhecemos o nome
    // inglês dela, deixamos como está — nunca tratamos como nome de comando.
    if (canonico === "tutorial") {
      return { texto: [prefixo + nomeEN, revProprio[alvoBruto] ?? partes[1], ...partes.slice(2)].join(" "),
        comando: null };
    }
    // Categoria/área do próprio help ou tutorial (`&tutorial cargos` → `roles`).
    // Só se não for uma delas é que o token vira nome de outro comando.
    if (revProprio[alvoBruto]) {
      // A área tem nome em inglês; o resto do trecho ainda pertence ao COMANDO
      // correspondente àquela área (`xp` → xp, `rpg` → game), então a cauda usa
      // o mapa dele. Sem isso, `&help xp cargos` viraria `&help levels cargos`.
      const canonAlvo = canonicoDe(alvoBruto, CANONICO);
      const revAlvo = SUB_REVERSO[canonAlvo] ?? {};
      const saida = [prefixo + nomeEN, revProprio[alvoBruto],
        ...partes.slice(2).map((t) => traduzirToken(t, revAlvo))];
      return { texto: saida.join(" "), comando: canonAlvo };
    }
    const alvoCanon = SUB[canonico]?.[alvoBruto] ?? canonicoDe(alvoBruto, CANONICO);
    const revAlvo = SUB_REVERSO[alvoCanon] ?? {};
    const saida = [prefixo + nomeEN, COMANDO_EN[alvoCanon] ?? alvoCanon];
    for (let i = 2; i < partes.length; i++) saida.push(traduzirToken(partes[i], revAlvo));
    return { texto: saida.join(" "), comando: alvoCanon };
  }

  const rev = SUB_REVERSO[canonico] ?? {};
  // Traduz os subcomandos ENQUANTO eles forem subcomandos. No primeiro token
  // que não está na tabela, começou o texto livre — nome de item, de
  // companheiro, de missão — e dali para a frente nada é traduzido.
  //
  // Sem essa parada, `&game follower pegar Aprendiz de Magia <item>` virava
  // `... Aprendiz de spell <item>`: "Magia" bate com um subcomando, mas ali é
  // parte de um nome próprio.
  //
  // Exceção na posição 1: muitos comandos põem o ALVO antes da ação
  // (`&cor VIP gradiente`, `&automod antilink punicao`). Um desconhecido ali
  // é o alvo, não o começo do texto livre — se parássemos, `gradiente` e
  // `punicao` ficariam em português.
  let acabaramOsSubcomandos = false;
  const traduzidas = partes.map((tok, i) => {
    if (i === 0) return prefixo + nomeEN;
    if (/^[<[(]/.test(tok)) return traduzirToken(tok, rev);   // placeholder: sempre
    if (acabaramOsSubcomandos) return tok;
    const t = rev[tok.toLowerCase()];
    if (t === undefined) {
      if (i > 1) acabaramOsSubcomandos = true;
      return tok;
    }
    return t;
  });
  return { texto: traduzidas.join(" "), comando: canonico };
}

// Passa um texto de ajuda inteiro pela tradução, mexendo só no que está
// entre crases simples. Blocos ``` ficam intactos: ali costuma haver
// exemplo com texto livre, que não deve ser mexido.
//
// Guarda o último comando citado como CONTEXTO: depois de `&globalban …`,
// um `\`avisar\`` solto na mesma explicação é o modo daquele comando, e
// vira `\`warn\``. É assim que as legendas de opção também saem em inglês.
export function exibir(texto, lang, prefixo = "&", CANONICO = {}) {
  if (lang !== "en" || typeof texto !== "string") return texto;

  const linhas = texto.split("\n");
  let dentroDeBloco = false;
  let contexto = null;

  return linhas.map((linha) => {
    if (linha.trim().startsWith("```")) { dentroDeBloco = !dentroDeBloco; return linha; }
    if (dentroDeBloco) return linha;
    return linha.replace(/`([^`\n]+)`/g, (todo, dentro) => {
      if (dentro.includes(prefixo)) {
        const r = traduzirTrecho(dentro, prefixo, CANONICO);
        if (r.comando) contexto = r.comando;
        return "`" + r.texto + "`";
      }
      // Sem prefixo: só traduz se já sabemos de qual comando o texto fala.
      // Pode ser um token só (`avisar`) ou uma dupla (`modo avisar`), que é
      // como as legendas costumam citar "subcomando + valor".
      if (!contexto) return todo;
      const rev = SUB_REVERSO[contexto] ?? {};
      const traduzido = dentro.trim().split(/\s+/).map((t) => traduzirToken(t, rev)).join(" ");
      return "`" + traduzido + "`";
    });
  }).join("\n");
}

// Um "comando sub" solto (sem prefixo), como o `titulo` de um subtópico:
// "banglobal varrer" → "globalban sweep". Reaproveita a mesma tradução dos
// trechos, para o cabeçalho nunca divergir do corpo.
export function exibirTitulo(titulo, lang, prefixo = "&", CANONICO = {}) {
  if (lang !== "en" || typeof titulo !== "string") return titulo;
  const r = traduzirTrecho(prefixo + titulo, prefixo, CANONICO);
  return r.texto.startsWith(prefixo) ? r.texto.slice(prefixo.length) : r.texto;
}

// Nome de exibição de um comando isolado (sem prefixo, sem argumentos).
export function nomeExibido(canonico, lang) {
  if (lang !== "en") return canonico;
  return COMANDO_EN[canonico] ?? canonico;
}
