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
  idioma: "language",
  limpar: "purge",
  log: "log",
  punicao: "punishment",
  servidores: "servers",
  sobre: "about",
  tutorial: "tutorial",
  warn: "warn",
  xp: "xp",
  game: "game",
};

// ── Aliases de comando que precisam EXISTIR como rota ──
// Tudo que COMANDO_EN mostra tem que funcionar quando digitado. Estes
// são os que ainda não estavam no CANONICO do main.
export const COMANDO_EXTRA = {
  access: "acesso",
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
};

// ── Tokens de SUBCOMANDO, por comando canônico ──
// Formato: { inglês: português }. O que já é aceito em inglês pelo
// próprio módulo (list, mode, channel, on, off…) não precisa estar aqui,
// mas repetir não faz mal — a normalização é idempotente.
const SUB = {
  help: {
    moderation: "moderacao", settings: "config", configuration: "config",
    tools: "ferramentas", general: "geral", levels: "xp", character: "game",
  },
  tutorial: {
    moderation: "moderacao", punishment: "punicao", roles: "cargos",
    access: "acesso", levels: "xp", start: "inicio", index: "indice",
  },
  game: {
    create: "criar", new: "novo", delete: "apagar", erase: "apagar",
    points: "pontos", spend: "pontos",
    items: "itens", inventory: "inventario", bag: "mochila",
    equip: "equipar", unequip: "desequipar", wear: "vestir",
    catalog: "catalogo", shop: "loja",
    wallet: "carteira", balance: "saldo", economy: "economia",
    market: "mercado", exchange: "cambio", trade: "trocar", barter: "escambo",
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
    currency: "moeda", coin: "moeda", test: "teste", simulate: "simular",
    eco: "eco", reset: "reset", server: "servidor", all: "tudo",
    confirm: "confirmar", model: "modelo", view: "ver", info: "detalhe",
    remove: "remover", default: "padrao", main: "padrao",
    world: "mundo", fantasy: "fantasia", simple: "simples",
    take: "levar", add: "adicionar", drop: "tirar", dismiss: "dispensar",
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
    import: "importar", forget: "esquecer", history: "historico",
    warn: "avisar", ban: "banir", off: "off",
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
  log: {
    here: "here", off: "off",
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
  },
  whitelist: { add: "add", remove: "remove", list: "list" },
  scam: {
    sensitivity: "sensitivity", channel: "channel", test: "test",
    simulate: "simulate", ban: "ban", dismiss: "dismiss",
    config: "config", status: "status",
    low: "baixa", medium: "media", high: "alta",
  },
  comando: { disable: "disable", enable: "enable", list: "list" },
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
    "antiinvite", "antimassmention", "anticaps", "antilink", "antiscam",
    "anticaracteres", "antirepeticao"]),
  banglobal: new Set(["varrer", "revisar", "scan"]),
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
  if (canonico === "help" || canonico === "tutorial") {
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

// Traduz UM trecho de comando, já sem as crases. Ex.: "&game criar [nome]".
function traduzirTrecho(trecho, prefixo, CANONICO) {
  const partes = trecho.trim().split(/\s+/);
  if (!partes.length || !partes[0].startsWith(prefixo)) return trecho;

  const nomeBruto = partes[0].slice(prefixo.length).toLowerCase();
  const canonico = canonicoDe(nomeBruto, CANONICO);
  const nomeEN = COMANDO_EN[canonico] ?? canonico;
  const rev = SUB_REVERSO[canonico] ?? {};

  const traduzidas = partes.map((tok, i) => {
    if (i === 0) return prefixo + nomeEN;
    // Placeholders (<nome>, [quantos]) e valores literais ficam como estão.
    if (/^[<[(]/.test(tok)) return tok;
    const limpo = tok.toLowerCase();
    return rev[limpo] ?? tok;
  });
  return traduzidas.join(" ");
}

// Passa um texto de ajuda inteiro pela tradução, mexendo só no que está
// entre crases simples. Blocos ``` ficam intactos: ali costuma haver
// exemplo com texto livre, que não deve ser mexido.
export function exibir(texto, lang, prefixo = "&", CANONICO = {}) {
  if (lang !== "en" || typeof texto !== "string") return texto;

  const linhas = texto.split("\n");
  let dentroDeBloco = false;
  return linhas.map((linha) => {
    if (linha.trim().startsWith("```")) { dentroDeBloco = !dentroDeBloco; return linha; }
    if (dentroDeBloco) return linha;
    return linha.replace(/`([^`\n]+)`/g, (todo, dentro) => {
      if (!dentro.includes(prefixo)) return todo;
      return "`" + traduzirTrecho(dentro, prefixo, CANONICO) + "`";
    });
  }).join("\n");
}

// Nome de exibição de um comando isolado (sem prefixo, sem argumentos).
export function nomeExibido(canonico, lang) {
  if (lang !== "en") return canonico;
  return COMANDO_EN[canonico] ?? canonico;
}
