import { ORDEM as ORDEM_GRUPOS } from "../moderacao/help-grupos.js";   // os grupos que o índice do &help promete
import { maisParecido } from "./parecido.js";

// O nome de cada comando na tela em inglês, os apelidos e (fase 2) os
// subcomandos vêm do registro de comandos (modulos/comandos/) — não declarar
// aqui. O registro não importa handler nenhum, então lê-lo no carregamento é seguro.
import { COMANDO_EN, COMANDO_EXTRA, REGISTRO } from "../comandos/index.js";
export { COMANDO_EN, COMANDO_EXTRA };


// O que vem do registro: `subcomandos` (nome interno → inglês) vira a tabela de
// entrada (inglês → interno); `aninhados` e `naTela` como estão.
const DO_REGISTRO = { sub: {}, aninhados: {}, naTela: {} };
for (const c of REGISTRO) {
  if (c.subcomandos) {
    const m = {};
    for (const [pt, en] of Object.entries(c.subcomandos)) for (const e of [].concat(en)) m[e] = pt;
    DO_REGISTRO.sub[c.id] = m;
  }
  if (c.aninhados?.length) DO_REGISTRO.aninhados[c.id] = new Set(c.aninhados);
  if (c.naTela) DO_REGISTRO.naTela[c.id] = c.naTela;
  // os níveis dentro do comando (`automod.sentinela`) e as partes citadas sozinhas (`punicao`)
  for (const [nome, f] of [...Object.entries(c.familias ?? {}).map(([n, f]) => [`${c.id}.${n}`, f]), ...Object.entries(c.partes ?? {})]) {
    if (f.subcomandos) {
      const m = {};
      for (const [pt, en] of Object.entries(f.subcomandos)) for (const e of [].concat(en)) m[e] = pt;
      DO_REGISTRO.sub[nome] = m;
    }
    if (f.aninhados?.length) DO_REGISTRO.aninhados[nome] = new Set(f.aninhados);
    if (f.naTela) DO_REGISTRO.naTela[nome] = f.naTela;
  }
}
// Subcomandos inglês → nome interno, de todas as famílias (o registro é a única fonte
// desde 17 out 2026 — fase 2).
export const SUB = DO_REGISTRO.sub;

const ANINHADOS = DO_REGISTRO.aninhados;

// Só para a TELA: palavras que o comando aceita nos dois idiomas, mas que a
// ajuda escreve em português (`&log channel aqui`).
const SO_EXIBIR = DO_REGISTRO.naTela;
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
// (`punicao` dentro do automod soma a tabela da parte `punicao` à da família).
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

// O nome de um subcomando na tela (`log` + `mensagens` → `messages` em inglês).
// Para o handler que monta a tela com o nome interno fora de `&comando …`, onde
// a tradução da tela não alcança (o `&log` listava `mensagens` em inglês).
export function subExibido(canonico, interno, lang) {
  if (lang !== "en") return interno;
  return SUB_REVERSO[canonico]?.[interno] ?? interno;
}

// Os subcomandos que um comando conhece (nos dois idiomas), pelas tabelas do
// registro. Serve ao "você quis dizer" — não é a lista completa do que o handler
// aceita: o parse ainda mora em cada handler, e há palavras que só ele conhece.
export function subcomandosDe(canonico) {
  const c = String(canonico ?? "");
  return new Set([
    ...Object.keys(SUB[c] ?? {}), ...Object.values(SUB[c] ?? {}),
    ...(ANINHADOS[c] ?? []), ...Object.keys(SO_EXIBIR[c] ?? {}), ...Object.values(SO_EXIBIR[c] ?? {}),
  ].map((x) => String(x).toLowerCase()));
}

// `destivar` → `desativar`: o subcomando conhecido mais perto, ou null se a
// palavra já é conhecida, não parece subcomando (número, menção, link) ou não
// há nenhum perto o bastante (17 out 2026).
export function corrigirSubcomando(canonico, token) {
  const t = String(token ?? "").toLowerCase();
  if (!/^[a-zçãáéíóúâêôõ]{3,}$/.test(t)) return null;
  const conhecidos = subcomandosDe(canonico);
  if (!conhecidos.size || conhecidos.has(t)) return null;
  return maisParecido(t, conhecidos);
}

// As tabelas de tradução como ficaram montadas (para o inventário de comandos:
// a tela em inglês de cada palavra e os níveis aninhados não podem mudar sem querer).
export function tabelasDeTraducao() {
  const ord = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return {
    sub: ord(Object.fromEntries(Object.entries(SUB).map(([c, m]) => [c, ord(m)]))),
    tela: ord(Object.fromEntries(Object.entries(SUB_REVERSO).map(([c, m]) => [c, ord(m)]))),
    aninhados: ord(Object.fromEntries(Object.entries(ANINHADOS).filter(([, s]) => s.size).map(([c, s]) => [c, [...s].sort()]))),
  };
}
