import { ORDEM as ORDEM_GRUPOS } from "../moderacao/help-grupos.js";   // os grupos que o índice do &help promete
import { EN_PARA_PT } from "./nomes-automod.js";

// O nome de cada comando na tela em inglês e os apelidos vêm do registro de
// comandos (modulos/comandos/) desde 17 out 2026 — não declarar aqui.
// Só usados dentro de funções: o registro importa os handlers, e os handlers
// importam este arquivo (ciclo que o ESM resolve, desde que ninguém leia estas
// tabelas no carregamento).
import { COMANDO_EN, COMANDO_EXTRA } from "../comandos/index.js";
export { COMANDO_EN, COMANDO_EXTRA };

export const SUB = {
  servidor: {
    rules: "regras", roles: "cargos", channels: "canais", about: "info",
  },
  entretenimento: {
    fight: "briga", choose: "escolher", pick: "escolher", rate: "nota",
    fortune: "sorte", mock: "zoeira", reverse: "inverter", "8ball": "bola8",
  },
  help: {
    moderation: "moderacao", settings: "config", configuration: "config",
    tools: "ferramentas", general: "geral", levels: "xp", character: "game",
    // grupos novos
    start: "comecar", protect: "proteger", protection: "proteger",
    customize: "personalizar", customise: "personalizar", fun: "diversao",
    diagnostics: "diagnostico", troubleshooting: "diagnostico", owner: "dono",
  },
  silenciar: {
    remove: "tirar", undo: "tirar", lift: "tirar", off: "tirar",
  },
  assistente: {
    quick: "rapido", fast: "rapido", full: "completo", complete: "completo",
    channels: "canais", protection: "protecao", protect: "protecao",
    cancel: "cancelar", stop: "cancelar",
  },
  tutorial: {
    moderation: "moderacao", roles: "cargos", levels: "xp",
    character: "rpg", adventure: "aventura", market: "rpg", economy: "economia",
    game: "rpg", wiki: "rpg", permissions: "permissoes", logging: "logs",
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
    wallet: "carteira", balance: "saldo",
    market: "mercado", exchange: "cambio", trade: "trocar", barter: "escambo", rates: "taxas", bank: "banco",
    buy: "comprar", sell: "vender", hire: "contratar", recruit: "recrutar",
    rest: "descansar",
    companion: "follower", companions: "followers", party: "party",
    recruits: "recrutas", mercenaries: "mercenarios",
    mission: "missao", missions: "missoes", quest: "quest",
    contract: "contrato", contracts: "contratos", job: "bico", jobs: "bicos",
    special: "especial", specials: "especiais", boss: "chefe", bosses: "chefes",
    dungeon: "dungeon", dungeons: "dungeons", rescue: "resgatar",
    class: "classe", evolve: "evoluir", use: "usar", story: "historia", preview: "prever", redo: "refazer",
    top: "top", ranking: "ranking",
    sheet: "ficha", profile: "perfil",
    help: "ajuda", commands: "comandos", join: "entrar", leave: "sair",
    // dentro de `game admin` e `game follower`
    give: "dar", item: "item", level: "nivel", energy: "energia",
    admin: "admin", eco: "eco", status: "status", top: "top",
    currency: "moeda", coin: "moeda", test: "teste", simulate: "simular",
    eco: "eco", reset: "reset", server: "servidor", all: "tudo",
    confirm: "confirmar", model: "modelo", view: "ver", info: "detalhe",
    remove: "remover", default: "padrao", main: "padrao",
    world: "mundo", fantasy: "fantasia", simple: "simples",
    take: "levar", add: "adicionar", drop: "tirar", dismiss: "dispensar",
    sheet: "ficha", status: "status", give: "dar", retrieve: "pegar",
    bag: "mochila", inventory: "inventario",
    photos: "fotos", album: "album", image: "imagem", picture: "imagem",
    cancel: "cancelar", accept: "aceitar", announce: "anunciar",
  },
  xp: {
    setup: "setup", config: "config", configure: "configurar",
    roles: "cargos", createroles: "criarcargos", create: "criar",
    reset: "reset", wipe: "zerar", top: "top", ranking: "ranking",
    rank: "rank", leaderboard: "leaderboard",
    multiplier: "multiplicador", maxlevel: "nivelmaximo", interval: "intervalo",
    channel: "canal", announce: "anuncio", announcement: "anuncio",
    sync: "sincronizar", resync: "sincronizar", restore: "sincronizar", all: "todos",
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
    forget: "esquecer", history: "historico", bots: "bots",
    server: "servidor", remove: "remover", people: "pessoas", contribution: "contribuicao",
    forget: "esquecer", history: "historico",
    warn: "avisar", ban: "banir", off: "off",
    instant: "imediato", consensus: "consenso",   // os dois modos de ban automático (15 out 2026)
    import: "importar", auto: "auto", automatic: "auto", autoimport: "auto",
    contribution: "contribuicao",
  },
  punicao: {
    mode: "modo", ladder: "escada", steps: "escada", warns: "warns", role: "cargo",
    status: "status", config: "config",
    warn: "avisar", delete: "apagar", confirm: "confirmar",
    stack: "acumular", ban: "banir",
  },
  automod: {
    // os grupos em inglês (13 out 2026) — as partes ficam na família de cada um
    ...EN_PARA_PT.grupos, antinoise: "antiruido",
    punishment: "punicao", inherit: "herdar", global: "global",
    set: "set", status: "status", debug: "debug",
    warn: "avisar", delete: "apagar", confirm: "confirmar",
    stack: "acumular", ban: "banir",
    messages: "mensagens", time: "tempo", mentions: "mencoes",
    size: "tamanho", threshold: "limiar", ignore: "ignorar",
    repetition: "repeticao",
  },
  // ── Famílias dentro do &automod (13 out 2026): `&automod sentinel topics
  // politics delete` vira `&automod sentinela assuntos politica apagar`. Cada
  // nível usa o vocabulário do nível de cima (ver traduzirCaminho).
  "automod.antispam": {
    speed: "velocidade", burst: "rajada", repeat: "repeticao", media: "midia", mentions: "mencoes",
    messages: "mensagens", time: "tempo", minute: "minuto", newcomer: "novato", newcomers: "novato", times: "vezes",
  },
  "automod.antiruido": {
    characters: "caracteres", letters: "letras",
    size: "tamanho", threshold: "limiar", repetition: "repeticao", ignore: "ignorar",
  },
  "automod.antilink": { domains: "dominios", invites: "convites" },
  "automod.sentinela": {
    content: "conteudo", hate: "odio", images: "imagens", topics: "assuntos", subjects: "assuntos", avatar: "avatar", pfp: "avatar",
    // 17 out 2026: o painel do sentinela passou a falar português; o inglês vira o nome PT
    sensitivity: "sensibilidade", channel: "canal", test: "testar", simulate: "simular", ban: "banir", dismiss: "liberar",
    config: "config", status: "status", tenure: "antiguidade", alerts: "alerta", alert: "alerta",
    low: "baixa", medium: "media", high: "alta",
  },
  "automod.odio": { add: "add", remove: "remover", list: "lista" },
  "automod.assuntos": {
    ...EN_PARA_PT.temas, ...EN_PARA_PT.acoesTema, ...EN_PARA_PT.sens,
    sensitivity: "sensibilidade", allow: "liberar", watch: "vigiar", ai: "ia", test: "test",
    add: "add", remove: "remover",
  },
  "automod.avatar": { action: "acao", time: "tempo", check: "checar", ...EN_PARA_PT.acoesAvatar },
  warn: { list: "lista", clear: "limpar" },
  ticket: { panel: "painel", list: "lista", delete: "apagar", categories: "categorias", team: "equipe" },
  webhook: { create: "criar", list: "lista", remove: "remover", test: "testar", events: "eventos", channel: "canal" },
  economia: {
    shop: "loja", buy: "comprar", mine: "minerar", balance: "saldo", pay: "pagar", give: "dar", take: "tirar",
    reset: "zerar", interval: "intervalo", remove: "remover", confirm: "confirmar",
    name: "nome", symbol: "simbolo", gain: "ganho",
  },
  servidores: {
    report: "relatorio", channel: "canal", now: "agora", subjects: "assuntos", topics: "assuntos", empty: "vazias", here: "aqui",
  },
  rolar: { coin: "moeda" },
  iniciativa: { list: "lista", remove: "remover", clear: "limpar" },
  limpar: { all: "tudo", everything: "tudo" },
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
    channel: "canal", now: "agora", test: "testar", off: "off", category: "categoria",
  },
  staff: {
    add: "add", remove: "remove", list: "lista", clear: "limpar",
    title: "titulo", label: "titulo", team: "equipe",
  },
  boasvindas: {
    channel: "canal", title: "titulo", text: "texto", message: "texto",
    colour: "cor", color: "cor", image: "imagem", test: "testar",
    default: "padrao", status: "status", clear: "limpar", here: "aqui",
    hidden: "oculto", hide: "oculto", visible: "visivel", show: "visivel", messages: "mensagens",
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
    join: "entrar", read: "ler", start: "entrar", stop: "sair",
    unstick: "destravar", unlock: "destravar",
    rescue: "resgatar", resgate: "resgatar",
    perminute: "porminuto", cap: "porminuto",
    join: "entrar", leave: "sair", voice: "voz", status: "estado",
    names: "nomes", cooldown: "cooldown",
    effect: "efeito", pitch: "tom", tone: "tom", dictionary: "dicionario",
  },
  fuso: {
    add: "add", remove: "remove", list: "lista", clear: "limpar",
    search: "buscar", find: "buscar", now: "ver", time: "ver", check: "ver",
    label: "apelido", name: "apelido", alias: "apelido",
    main: "principal", reference: "principal", format: "formato", cities: "cidades",
  },
  log: {
    here: "here", off: "off", channel: "canal",
    punishments: "punicoes", members: "membros", messages: "mensagens",
    roles: "cargos", commands: "comandos", events: "eventos",
  },
  chat: {
    free: "livre", forget: "esquecer", all: "tudo",
    profile: "perfil", map: "mapear", care: "cuidado", gentle: "gentil",
    comment: "comentar", perday: "pordia", status: "status", here: "aqui",
    mode: "modo", relevant: "relevante", every: "todas",
  },
  modia: {
    criteria: "criterios", channel: "canal", clear: "limpar",
    status: "status", add: "add", remove: "remove",
  },
  debug: {
    channels: "canais", permissions: "permissoes", raw: "cru",
    silence: "silence", mute: "mudo", read: "ler",
  },
  blocklist: {
    add: "add", remove: "remove", list: "list", clear: "clear",
    reload: "reload", adddomain: "adddomain", removedomain: "removedomain",
    domains: "dominios",
  },
  embed: { fields: "campos", colors: "cores" },
  whitelist: { add: "add", remove: "remove", list: "list" },
  sentinela: {
    sensitivity: "sensibilidade", channel: "canal", test: "testar",
    simulate: "simular", ban: "banir", dismiss: "liberar",
    config: "config", status: "status", tenure: "antiguidade",
    low: "baixa", medium: "media", high: "alta",
  },
  scam: {
    sensitivity: "sensibilidade", channel: "canal", test: "testar",
    simulate: "simular", ban: "banir", dismiss: "liberar",
    config: "config", status: "status",
    low: "baixa", medium: "media", high: "alta",
  },
  comando: {
    disable: "desativar", off: "desativar",
    enable: "ativar", on: "ativar",
    list: "list", manage: "gerenciar",
  },
  autorole: { set: "set", off: "off", disable: "desativar", remove: "remover" },
  // áreas do &tutorial (16 out 2026): a entrada já aceita os nomes em inglês
  // (APELIDOS do tutorial.js); isto é para a TELA em inglês não mostrar
  // `&tutorial permissoes`
  tutorial: {
    permissions: "permissoes", channels: "canais", moderation: "moderacao", roles: "cargos",
    ai: "ia", news: "noticias", messages: "mensagens", economy: "economia",
    adventure: "aventura", settings: "ajustes",
  },
  idioma: {
    portuguese: "portugues", english: "english", status: "status",
  },
};

const ANINHADOS = {
  game: new Set(["admin", "moeda", "mercado", "follower", "followers", "coop",
    "trocar", "escambo", "party", "equipe", "reset"]),
  acesso: new Set(["cargo", "cargos", "staff", "canal", "canais"]),
  xp: new Set(["setup", "config", "configurar", "sincronizar"]),
  automod: new Set([...Object.keys(SUB.automod), "antispam", "antimassspam",
    "antiinvite", "antimassmention", "anticaps", "antilink", "antiscam", "sentinela",
    "anticaracteres", "antirepeticao"]),
  banglobal: new Set(["varrer", "revisar", "scan", "isentar", "lista", "desfazer", "bots"]),
  cor: new Set(["painel", "criar", "gerar"]),
  reactionrole: new Set(["exclusivo", "unico"]),
  chat: new Set(["livre", "comentar", "esquecer", "cuidado", "gentil"]),
  modia: new Set(["canal", "criterios"]),
  debug: new Set(["canais", "permissoes", "silence", "mudo"]),
  punicao: new Set(["modo", "mode"]),
  economia: new Set(["zerar", "loja", "config"]),
  servidores: new Set(["relatorio"]),
  log: new Set([]),
};

// Só para a TELA: palavras que o comando aceita nos dois idiomas, mas que a
// ajuda escreve em português (`&log channel aqui`).
const SO_EXIBIR = {
  automod: { aviso: "warn" },
  warn: { acumular: "stack" }, xp: { aqui: "here" }, tts: { aqui: "here", padrao: "default" },
  log: { aqui: "here" }, rss: { aqui: "here" }, chat: { aqui: "here" },
  "automod.sentinela": { assuntos: "topics", aqui: "here" }, "automod.antispam": { repeticao: "repeat" },
  // 17 out 2026 (inventário de comandos): palavras que o comando já aceitava em
  // inglês, mas a tela em inglês mostrava em português
  "automod.punicao": { aviso: "warn", validade: "expiry" }, punicao: { aviso: "warn", validade: "expiry" },
  game: { abrir: "open", partir: "go", com: "with", por: "for", mao1: "hand1", mao2: "hand2" },
  ticket: { abrir: "open", fechar: "close" },
  banglobal: { ignorados: "ignored", lembrar: "remember" },
  limpar: { confirmar: "confirm" },
  musica: { pausar: "pause", retomar: "resume", fila: "queue", parar: "stop", faixa: "track", nao: "off" },
};
const SUB_REVERSO = {};
for (const [cmd, mapa] of Object.entries(SUB)) {
  SUB_REVERSO[cmd] = { ...(SO_EXIBIR[cmd] ?? {}) };
  for (const [en, pt] of Object.entries(mapa)) {
    // O primeiro inglês encontrado para cada token PT é o preferido na tela.
    if (!SUB_REVERSO[cmd][pt]) SUB_REVERSO[cmd][pt] = en;
  }
}
for (const [cmd, mapa] of Object.entries(SO_EXIBIR)) SUB_REVERSO[cmd] ??= { ...mapa };
// A família de um token dentro de um comando: `automod` + `sentinela` →
// "automod.sentinela"; sem família própria, o mapa com o nome do token
// (`punicao` dentro do automod usa o do &punicao).
const familia = (tabela, canonico, token) => {
  const a = tabela[token], b = tabela[`${canonico}.${token}`];
  return a || b ? { ...(a ?? {}), ...(b ?? {}) } : null;
};

// Traduz um CAMINHO de subcomandos (inglês → interno), descendo pelas famílias.
function traduzirCaminho(canonico, args, inicio = 0, max = 4) {
  const saida = [...args];
  let mapa = SUB[canonico] ?? {};
  for (let i = inicio; i < Math.min(saida.length, inicio + max); i++) {
    if (typeof saida[i] !== "string") break;
    const pt = mapa[saida[i].toLowerCase()];
    if (pt) saida[i] = pt;
    const prox = familia(SUB, canonico, String(saida[i]).toLowerCase());
    if (prox) mapa = { ...(SUB[canonico] ?? {}), ...prox };
  }
  return saida;
}
const FAMILIAS_EM_CAMINHO = new Set(["automod"]);

export function normalizarArgs(canonico, args, CANONICO = {}) {
  if (!Array.isArray(args) || !args.length) return args;

  if (canonico === "tutorial") return args;

  if (canonico === "help") {
    const saida = [...args];
    const bruto = String(saida[0] ?? "").toLowerCase();
    // categoria/área (moderation → moderacao) ou nome de comando (color → cor)
    // Nome de GRUPO da ajuda vence apelido de comando: "comecar" é o grupo
    // "Começar" do índice e também apelido do &tutorial — o índice promete o
    // grupo, então `&help comecar` abria a ajuda do &tutorial por engano.
    const grupos = new Set([...ORDEM_GRUPOS, ...Object.values(SUB.help ?? {})]);
    saida[0] = SUB[canonico]?.[bruto] ?? (grupos.has(bruto) ? bruto : null) ?? CANONICO[bruto] ?? COMANDO_EXTRA[bruto] ?? bruto;
    if (FAMILIAS_EM_CAMINHO.has(saida[0])) return traduzirCaminho(saida[0], saida, 1, 3);
    const doAlvo = SUB[saida[0]];
    if (doAlvo && saida[1]) {
      const t = String(saida[1]).toLowerCase();
      if (doAlvo[t]) saida[1] = doAlvo[t];
    }
    return saida;
  }

  if (FAMILIAS_EM_CAMINHO.has(canonico)) return traduzirCaminho(canonico, args);
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

// Canônico do comando a partir de qualquer alias conhecido.
function canonicoDe(nome, CANONICO = {}) {
  const n = String(nome ?? "").toLowerCase();
  return CANONICO[n] ?? COMANDO_EXTRA[n] ?? n;
}

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
  nota: "note", termo: "term", tema: "topic", parte: "part", grupo: "group", modo: "mode", tempo: "time",
  "ação": "action", acao: "action", "descrição": "description", descricao: "description",
  // (16 out 2026, "deixar global o bot") os moldes que ainda saíam em português
  pergunta: "question", coisa: "thing", bicho: "critter", pensa: "think", cidade: "city",
  categoria: "category", comando: "command", atributo: "attribute", alvo: "target", quantia: "amount",
  evento: "event", pedido: "request", "domínio": "domain", dominio: "domain", "título": "title", titulo: "title",
  contrato: "contract", "área": "area", area: "area", "módulo": "module", modulo: "module",
  "código": "code", codigo: "code", vaga: "slot", frase: "phrase", "expressão": "expression", expressao: "expression",
  convite: "invite", algo: "something", vezes: "times", palavra: "word", filtro: "filter", cor: "color", cores: "colors",
  classe: "class", tipo: "type", rolagem: "roll", pergaminho: "scroll", "máquina": "machine", maquina: "machine",
  "id-do-canal": "channel-id", "id-do-cargo": "role-id", "url-do-feed": "feed-url", quem: "who", onde: "where",
};

function traduzirLista(dentro, rev) {
  return dentro.split("|").map((parte) => {
    const t = parte.trim().toLowerCase();
    if (t.includes(",")) return parte.split(",").map((x) => rev[x.trim().toLowerCase()] ?? x).join(",");
    // `<@pessoa|id|nome>`: o @/# da menção fica, o miolo é traduzido (17 out 2026)
    const sig = t.match(/^([@#%]+)(.+)$/);
    if (sig && !rev[t] && PLACEHOLDER_EN[sig[2]]) return sig[1] + PLACEHOLDER_EN[sig[2]];
    return rev[t] ?? PLACEHOLDER_EN[t] ?? parte;
  }).join("|");
}

function traduzirToken(tok, rev) {
  // placeholder: preserva os delimitadores e traduz o miolo
  // ‹…› também: o protegerMarcadores troca <…> por ‹…› e o texto pode chegar já trocado
  const m = tok.match(/^([<[(‹])(.+)([>\])›])$/);
  if (m) return m[1] + traduzirLista(m[2], rev) + m[3];
  if (tok.includes("|")) return traduzirLista(tok, rev);
  // "aviso,5m,1h,ban" → "warn,5m,1h,ban"
  if (tok.includes(",") && !/\s/.test(tok)) return tok.split(",").map((x) => rev[x.toLowerCase()] ?? x).join(",");
  return rev[tok.toLowerCase()] ?? tok;
}

function traduzirTrecho(trecho, prefixo, CANONICO) {
  const partes = trecho.trim().split(/\s+/);
  if (!partes.length || !partes[0].startsWith(prefixo)) return { texto: trecho, comando: null };

  const nomeBruto = partes[0].slice(prefixo.length).toLowerCase();
  const canonico = canonicoDe(nomeBruto, CANONICO);
  const nomeEN = COMANDO_EN[canonico] ?? canonico;

  if ((canonico === "help" || canonico === "tutorial") && partes.length > 1) {
    const alvoBruto = String(partes[1]).toLowerCase();
    const revProprio = SUB_REVERSO[canonico] ?? {};
    if (canonico === "tutorial") {
      return { texto: [prefixo + nomeEN, revProprio[alvoBruto] ?? partes[1], ...partes.slice(2)].join(" "),
        comando: null };
    }
    if (revProprio[alvoBruto]) {
      const canonAlvo = canonicoDe(alvoBruto, CANONICO);
      const revAlvo = SUB_REVERSO[canonAlvo] ?? {};
      const saida = [prefixo + nomeEN, revProprio[alvoBruto],
        ...partes.slice(2).map((t) => traduzirToken(t, revAlvo))];
      return { texto: saida.join(" "), comando: canonAlvo };
    }
    const alvoCanon = SUB[canonico]?.[alvoBruto] ?? canonicoDe(alvoBruto, CANONICO);
    const saida = [prefixo + nomeEN, COMANDO_EN[alvoCanon] ?? alvoCanon, ...traduzirResto(partes.slice(2), alvoCanon)];
    return { texto: saida.join(" "), comando: alvoCanon };
  }

  return { texto: [prefixo + nomeEN, ...traduzirResto(partes.slice(1), canonico)].join(" "), comando: canonico };
}

// Os argumentos de um comando, na tela em inglês. Família: `&automod punicao
// modo` — depois de "punicao", vale o vocabulário DELE ("modo" → "mode"). Antes
// a ajuda em inglês saía "&automod punishment modo"; e agora desce quantos
// níveis houver: `&automod sentinela assuntos politica apagar` →
// `&automod sentinel topics politics delete`.
function traduzirResto(tokens, canonico) {
  let rev = SUB_REVERSO[canonico] ?? {};
  let acabaramOsSubcomandos = false;
  return tokens.map((tok, j) => {
    if (/^[<[(‹]/.test(tok)) return traduzirToken(tok, rev);   // placeholder: sempre
    if (acabaramOsSubcomandos) return tok;
    if (tok.includes("|") || tok.includes(",")) return traduzirToken(tok, rev);
    const baixo = tok.toLowerCase();
    const t = rev[baixo];
    const prox = baixo !== canonico ? familia(SUB_REVERSO, canonico, baixo) : null;
    if (t === undefined && !prox) {
      if (j > 0) acabaramOsSubcomandos = true;
      return tok;
    }
    if (prox) rev = { ...rev, ...prox };
    return t ?? tok;
  });
}

// Código solto (`velocidade`, `religiao`) depois de um comando: o vocabulário
// do comando E de todas as famílias dele.
const revCache = new Map();
function revDoContexto(contexto) {
  if (!revCache.has(contexto)) {
    const fams = Object.keys(SUB_REVERSO).filter((k) => k.startsWith(`${contexto}.`)).map((k) => SUB_REVERSO[k]);
    revCache.set(contexto, Object.assign({}, ...fams, SUB_REVERSO[contexto] ?? {}));
  }
  return revCache.get(contexto);
}

// `dica`: um texto maior de onde tirar o comando de contexto (as outras
// páginas de uma ajuda paginada).
export function exibir(texto, lang, prefixo = "&", CANONICO = {}, dica = null) {
  if (lang !== "en" || typeof texto !== "string") return texto;

  const linhas = texto.split("\n");
  let dentroDeBloco = false;
  // O código solto ANTES do primeiro comando (`acumular` numa lista de modos
  // que só depois mostra `&automod punicao modo …`) também é daquele comando.
  // Vale o comando que MAIS aparece (um "veja `&tutorial`" no meio não manda).
  const contagem = new Map();
  for (const m of String(dica ?? texto).matchAll(new RegExp("`" + prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([a-zçãéíóú]+)", "gi"))) {
    const c = canonicoDe(m[1], CANONICO);
    if (c !== "help") contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }
  const porFrequencia = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  let contexto = porFrequencia[0] ?? null;
  // código solto: primeiro o comando da linha/acima; o que faltar, os outros do texto
  const revSolto = (ctx) => Object.assign({}, ...porFrequencia.slice().reverse().map(revDoContexto), revDoContexto(ctx));

  // Fora das crases (16 out 2026): o título "Help — &entretenimento › briga"
  // e o "&acesso" solto na prosa saíam em português. Um comando conhecido
  // (com nome em inglês) é traduzido, com a trilha de subcomandos junto.
  const esc = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reSolto = new RegExp(`(^|[\\s(—*_])${esc}([a-zçãéíóú]+)((?: › [a-zçãéíóú0-9-]+)*)`, "gi");
  const marcadores = (trecho) => trecho
    .replace(/\{(usuario|usuário)\}/gi, "{user}").replace(/\{nome\}/gi, "{name}")
    .replace(/\{servidor\}/gi, "{server}").replace(/\{(membros|contagem)\}/gi, "{members}");
  const foraDasCrases = (trecho) => trecho
    .replace(reSolto, (todo, antes, cmd, trilha) => {
      const canonico = canonicoDe(cmd, CANONICO);
      if (!COMANDO_EN[canonico] && !trilha) return todo;
      const passos = trilha ? trilha.split(" › ").filter(Boolean) : [];
      const r = traduzirTrecho([prefixo + cmd, ...passos].join(" "), prefixo, CANONICO);
      const [c0, ...resto] = r.texto.split(" ");
      return antes + [c0, ...resto].join(" › ");
    })
    // marcadores das boas-vindas: o texto em inglês ensina os nomes em inglês
    .replace(/\{(usuario|usuário)\}/gi, "{user}").replace(/\{nome\}/gi, "{name}")
    .replace(/\{servidor\}/gi, "{server}").replace(/\{(membros|contagem)\}/gi, "{members}");

  return linhas.map((linha) => {
    if (linha.trim().startsWith("```")) { dentroDeBloco = !dentroDeBloco; return linha; }
    if (dentroDeBloco) return linha;
    return linha.split(/(`[^`\n]+`)/).map((pedaco, i) => (i % 2 ? marcadores(pedaco) : foraDasCrases(pedaco))).join("")
      .replace(/`([^`\n]+)`/g, (todo, dentro) => {
      if (/^\{[a-zçãéíóú]+\}$/i.test(dentro)) return "`" + foraDasCrases(dentro) + "`";
      if (dentro.includes(prefixo)) {
        const r = traduzirTrecho(dentro, prefixo, CANONICO);
        if (r.comando) contexto = r.comando;
        return "`" + r.texto + "`";
      }
      if (!contexto) return todo;
      const rev = revSolto(contexto);
      const traduzido = dentro.trim().split(/\s+/).map((t) => traduzirToken(t, rev)).join(" ");
      return "`" + traduzido + "`";
    });
  }).join("\n");
}

// Nome de exibição de um comando isolado (sem prefixo, sem argumentos).
export function nomeExibido(canonico, lang) {
  if (lang !== "en") return canonico;
  return COMANDO_EN[canonico] ?? canonico;
}
