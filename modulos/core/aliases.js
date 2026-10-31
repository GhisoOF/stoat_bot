import { maisParecido } from "./parecido.js";
import { grupoDoNome, nomeDoGrupo } from "../moderacao/help-grupos.js";   // só dados (sem ciclo)

// O nome de cada comando na tela em inglês, os apelidos e (fase 2) os
// subcomandos vêm do registro de comandos (modulos/comandos/) — não declarar
// aqui. O registro não importa handler nenhum, então lê-lo no carregamento é seguro.
import { COMANDO_EN, COMANDO_ES, COMANDO_EXTRA, REGISTRO } from "../comandos/index.js";
export { COMANDO_EN, COMANDO_ES, COMANDO_EXTRA };


// O que vem do registro: `subcomandos` (nome interno → inglês) vira a tabela de
// entrada (inglês → interno); `aninhados` e `naTela` como estão.
const DO_REGISTRO = { sub: {}, aninhados: {}, naTela: {} };
// nome interno → nome na tela em espanhol, por comando (sem nome em espanhol, vale o inglês)
const SUB_ES_REVERSO = {};
for (const c of REGISTRO) {
  if (c.subcomandos) {
    const m = {};
    for (const [pt, en] of Object.entries(c.subcomandos)) for (const e of [].concat(en)) m[e] = pt;
    DO_REGISTRO.sub[c.id] = m;
  }
  // espanhol (etapa 4): a palavra em espanhol também é digitável, em qualquer servidor.
  // Palavra que já é de OUTRO subcomando não entra (o teste da comandos-17out reprova).
  if (c.es?.subcomandos) {
    const m = (DO_REGISTRO.sub[c.id] ??= {});
    SUB_ES_REVERSO[c.id] = {};
    for (const [interno, es] of Object.entries(c.es.subcomandos)) {
      for (const e of [].concat(es)) if (e !== interno && !(e in m)) m[e] = interno;
      SUB_ES_REVERSO[c.id][interno] = [].concat(es)[0];
    }
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
    // (P2) o espanhol dos níveis de dentro (`&config log sanciones off`), como no comando
    if (f.es?.subcomandos) {
      const m = (DO_REGISTRO.sub[nome] ??= {});
      SUB_ES_REVERSO[nome] = {};
      for (const [interno, es] of Object.entries(f.es.subcomandos)) {
        for (const e of [].concat(es)) if (e !== interno && !(e in m)) m[e] = interno;
        SUB_ES_REVERSO[nome][interno] = [].concat(es)[0];
      }
    }
  }
}
// id e nomes de tela (inglês e espanhol) → id; sem os apelidos (o &help resolve nesta ordem)
export const NOME_PARA_ID_TELA = (() => {
  const m = {};
  for (const c of REGISTRO) m[c.id] = c.id;
  for (const c of REGISTRO) for (const n of [c.nomes?.en, c.es?.nome]) if (n && !(n in m)) m[n] = c.id;
  return m;
})();

// Subcomandos inglês → nome interno, de todas as famílias (o registro é a única fonte
// desde 17 out 2026 — fase 2).
export const SUB = DO_REGISTRO.sub;

// ── Atalhos (P2, 31 out 2026): apelido que aponta para DENTRO de outra família ──
// Declarados no comando de destino (`atalhos: { "chat sair|leave": "privacidade chat sair" }`):
// cada posição da chave aceita alternativas com `|`; o valor é o id + subcomandos internos.
// Vence a chave mais longa. Ver `_notas/registro-ajuda.md` (Formato de redirecionamento).
export const ATALHOS = REGISTRO.flatMap((c) => Object.entries(c.atalhos ?? {}).map(([chave, destino]) => ({
  chave, dono: c.id,
  posicoes: chave.trim().split(/\s+/).map((p) => new Set(p.split("|").map((x) => x.trim().toLowerCase()).filter(Boolean))),
  destino: String(destino).trim().split(/\s+/),
}))).sort((a, b) => b.posicoes.length - a.posicoes.length);

// As palavras digitadas (`["chat", "sair", "agora"]`) → o caminho de destino com o resto
// (`{ comando: "privacidade", args: ["chat", "sair", "agora"], atalho }`), ou null.
export function resolverAtalho(palavras) {
  const ps = (palavras ?? []).map((p) => String(p ?? "").toLowerCase());
  if (!ps.length || !ps[0]) return null;
  for (const a of ATALHOS) {
    if (ps.length < a.posicoes.length) continue;
    if (a.posicoes.every((alts, i) => alts.has(ps[i]))) {
      const [comando, ...subs] = a.destino;
      return { comando, args: [...subs, ...(palavras ?? []).slice(a.posicoes.length)], atalho: a };
    }
  }
  return null;
}
// O primeiro nome de cada atalho (os que levam a algum lugar sozinhos ou com mais palavras)
export const NOMES_DE_ATALHO = new Set(ATALHOS.flatMap((a) => [...a.posicoes[0]]));

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
  // a tabela solta com o nome do token (as `partes`, como `punicao`) só existe no &automod;
  // nas outras famílias (`config.log`) um token com nome de comando (`staff`) não pega a tabela dele
  const a = canonico === "automod" ? tabela[token] : undefined, b = tabela[`${canonico}.${token}`];
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
// os comandos com níveis dentro (`familias` no registro): o &automod e o &config (P2)
const FAMILIAS_EM_CAMINHO = new Set(REGISTRO.filter((c) => c.familias && Object.keys(c.familias).length).map((c) => c.id));

export function normalizarArgs(canonico, args, CANONICO = {}) {
  if (!Array.isArray(args) || !args.length) return args;

  if (canonico === "tutorial") return args;

  // (P2) o &help resolve o caminho sozinho, pelo registro (ajuda-registro.js): comando,
  // atalho, grupo — com as palavras como a pessoa digitou
  if (canonico === "help") return args;

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
  if (tok.includes(",") && !/\s/.test(tok)) return tok.split(",").map((x) => (ehConstante(x) ? x : rev[x.toLowerCase()] ?? x)).join(",");
  // (21 out 2026) nome em MAIÚSCULAS é variável de ambiente (`SERVIDOR`, `DONO_ID`), não
  // palavra: a tela em inglês mostrava `server` no lugar de `SERVIDOR` na ajuda do dono
  if (ehConstante(tok)) return tok;
  return rev[tok.toLowerCase()] ?? tok;
}
function ehConstante(t) { return /^[A-Z][A-Z0-9_]+$/.test(t); }

function traduzirTrecho(trecho, prefixo, CANONICO) {
  let partes = trecho.trim().split(/\s+/);
  if (!partes.length || !partes[0].startsWith(prefixo)) return { texto: trecho, comando: null };
  // (P2) `&log canal aqui` escrito à mão: o atalho leva ao caminho novo (`&config log channel here`)
  // (o nome antigo sozinho, `&log`, também: a tela mostra só o caminho principal)
  const at = resolverAtalho([partes[0].slice(prefixo.length), ...partes.slice(1)]);
  if (at) partes = [prefixo + at.comando, ...at.args];

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

// ── Espanhol (etapa 4, 18 out 2026) ──
// Enquanto os textos não têm versão em espanhol, o servidor em espanhol recebe o texto
// em inglês, e esta passada troca o que é nome: o comando (`&purge` → `&limpiar`), os
// subcomandos que têm nome em espanhol e as palavras dos moldes (`‹user›` → `‹usuario›`).
const MOLDE_ES = {
  name: "nombre", names: "nombres", user: "usuario", person: "persona", reason: "motivo", time: "tiempo",
  channel: "canal", channels: "canales", role: "rol", roles: "roles", text: "texto", amount: "cantidad",
  message: "mensaje", event: "evento", roll: "tirada", number: "número", value: "valor", title: "título",
  description: "descripción", days: "días", word: "palabra", city: "ciudad", command: "comando",
  expression: "expresión", term: "término", topic: "tema", mode: "modo", seconds: "segundos", field: "campo",
  color: "color", colors: "colores", question: "pregunta", category: "categoría", option: "opción", who: "quién",
  part: "parte", group: "grupo",
};
function moldeEs(tok) {
  const m = tok.match(/^([<[(‹])(.+)([>\])›])$/);
  if (!m) return tok;
  const miolo = m[2].split("|").map((p) => { const s = p.match(/^([@#%]*)(.*)$/); return s[1] + (MOLDE_ES[s[2].toLowerCase()] ?? s[2]); }).join("|");
  return m[1] + miolo + m[3];
}
function trechoEs(dentro, prefixo, CANONICO) {
  let partes = dentro.trim().split(/\s+/);
  { const at = resolverAtalho([partes[0].slice(prefixo.length), ...partes.slice(1)]); if (at) partes = [prefixo + at.comando, ...at.args]; }
  const nome = partes[0].slice(prefixo.length).toLowerCase();
  const cmd = canonicoDe(nome, CANONICO);
  if (!REGISTRO.some((c) => c.id === cmd)) return dentro;
  const saida = [prefixo + (COMANDO_ES[cmd] ?? partes[0].slice(prefixo.length))];
  let tabela = cmd, nosSubcomandos = true;
  // `&help purge`: depois do &help vem o nome de um comando — ou de um GRUPO, que
  // vence o apelido como no normalizarArgs (`&help fun` é o grupo diversao, não o
  // apelido `fun` do &entretenimento; virava `&ayuda entretenimiento`)
  if (cmd === "help" && partes[1]) {
    // (P2) a mesma ordem do &help: id ou nome de tela de comando, depois grupo, depois apelido
    const bruto = partes[1].toLowerCase();
    const direto = NOME_PARA_ID_TELA[bruto];
    const grupo = direto ? null : grupoDoNome(bruto);
    const alvo = direto ?? (grupo ? null : canonicoDe(bruto, CANONICO));
    if (grupo) { saida.push(nomeDoGrupo(grupo, "es")); partes.splice(1, 1); nosSubcomandos = false; }
    else if (COMANDO_ES[alvo]) { saida.push(COMANDO_ES[alvo]); partes.splice(1, 1); tabela = alvo; }
  }
  const umaPalavra = (tok) => {
    const baixo = tok.toLowerCase();
    const interno = SUB[tabela]?.[baixo] ?? (SUB_REVERSO[tabela]?.[baixo] !== undefined ? baixo : null);
    return interno ? { interno, es: SUB_ES_REVERSO[tabela]?.[interno] ?? tok } : null;
  };
  for (const tok of partes.slice(1)) {
    if (/^[<[(‹]/.test(tok)) { saida.push(moldeEs(tok)); continue; }
    if (/^[@#]/.test(tok)) { saida.push(tok[0] + (MOLDE_ES[tok.slice(1).toLowerCase()] ?? tok.slice(1))); continue; }
    if (tok === "|" || tok === "·") { saida.push(tok); continue; }
    if (!nosSubcomandos) { saida.push(tok); continue; }
    if (tok.includes("|")) { saida.push(tok.split("|").map((p) => umaPalavra(p)?.es ?? p).join("|")); continue; }
    const w = umaPalavra(tok);
    if (!w) { nosSubcomandos = false; saida.push(tok); continue; }
    saida.push(w.es);
    if (SUB[`${cmd}.${w.interno}`] || SUB_REVERSO[`${cmd}.${w.interno}`]) tabela = `${cmd}.${w.interno}`;
  }
  return saida.join(" ");
}
function paraEspanhol(texto, prefixo = "&", CANONICO = {}) {
  if (typeof texto !== "string") return texto;
  const esc = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reSolto = new RegExp(`(^|[\\s(—*_])${esc}([a-zçãéíóú]+)\\b`, "gi");
  let dentroDeBloco = false;
  return texto.split("\n").map((linha) => {
    if (linha.trim().startsWith("```")) { dentroDeBloco = !dentroDeBloco; return linha; }
    if (dentroDeBloco) return linha;
    return linha.split(/(`[^`\n]+`)/).map((pedaco, i) => {
      if (i % 2) {
        const dentro = pedaco.slice(1, -1);
        return dentro.startsWith(prefixo) ? "`" + trechoEs(dentro, prefixo, CANONICO) + "`" : pedaco;
      }
      return pedaco.replace(reSolto, (todo, antes, nome) => {
        const atS = !CANONICO[nome.toLowerCase()] && !COMANDO_EXTRA[nome.toLowerCase()] ? resolverAtalho([nome]) : null;
        if (atS) { try { return antes + citar([atS.comando, ...atS.args].join("."), "es", prefixo); } catch (e) { void e; return todo; } }
        const cmd = canonicoDe(nome.toLowerCase(), CANONICO);
        return COMANDO_ES[cmd] ? antes + prefixo + COMANDO_ES[cmd] : todo;
      });
    }).join("");
  }).join("\n");
}

// Texto que já sai pronto no idioma da tela (etapa 4): a página `&ayuda` que vem
// do registro em espanhol. A tradução da tela não passa por ele — ela trata o
// texto como inglês, e o `aqui` / `comandos` / `[motivo]` escritos em espanhol
// viravam `here` / `commands` / `[reason]`. A marca é um caractere invisível no
// início, e o exibir a tira (em qualquer idioma, para nunca chegar à tela).
export const JA_TRADUZIDO = "\u2063";
export const marcarTraduzido = (t) => (t == null || String(t).startsWith(JA_TRADUZIDO) ? t : JA_TRADUZIDO + t);
// (etapa 4b) o trecho pronto, com começo e fim: pode ir no meio de outro texto
export const FIM_PRONTO = "\u2064";
const TRECHO_PRONTO = /\u2063([\s\S]*?)\u2064/g;
export const trechoPronto = (t) => (t == null ? t : JA_TRADUZIDO + String(t).replaceAll(JA_TRADUZIDO, "").replaceAll(FIM_PRONTO, "") + FIM_PRONTO);

// O id de um comando pelo nome que aparece na tela, em qualquer idioma
// (`roll`, `dados`, `advertir` → rolar, rolar, warn). O id vence: um nome em
// inglês nunca toma o lugar do id de outro comando.
const NOME_PARA_ID = (() => {
  const m = {};
  for (const c of REGISTRO) m[c.id] = c.id;
  for (const c of REGISTRO) {
    for (const n of [...Object.values(c.nomes ?? {}), ...(c.apelidos ?? []), c.es?.nome, ...(c.es?.apelidos ?? [])]) {
      if (n && !(n in m)) m[n] = c.id;
    }
  }
  return m;
})();
export const idDoNome = (nome) => { const n = String(nome ?? "").toLowerCase(); return NOME_PARA_ID[n] ?? COMANDO_EXTRA[n] ?? n; };

// `dica`: um texto maior de onde tirar o comando de contexto (as outras
// páginas de uma ajuda paginada).
export function exibir(texto, lang, prefixo = "&", CANONICO = {}, dica = null) {
  // (etapa 4b) trechos prontos (o espanhol de um `tr`, entre as marcas de começo e
  // fim): ficam de fora da tradução; o resto do texto passa por ela como sempre
  if (typeof texto === "string" && texto.includes(FIM_PRONTO)) {
    const guardados = [];
    const resto = texto.replace(TRECHO_PRONTO, (_, t) => `\uE000${guardados.push(t.replaceAll(JA_TRADUZIDO, "")) - 1}\uE000`);
    return exibir(resto.replaceAll(JA_TRADUZIDO, "").replaceAll(FIM_PRONTO, ""), lang, prefixo, CANONICO, dica)
      .replace(/\uE000(\d+)\uE000/g, (_, i) => guardados[Number(i)]);
  }
  // a página inteira já pronta (a ajuda do registro em espanhol: só a marca de começo)
  if (typeof texto === "string" && texto.startsWith(JA_TRADUZIDO)) return texto.slice(JA_TRADUZIDO.length).replaceAll(JA_TRADUZIDO, "");
  // espanhol (etapa 4): o texto ainda sai em inglês; os nomes de comando, em espanhol
  if (lang === "es") return paraEspanhol(exibir(texto, "en", prefixo, CANONICO, dica), prefixo, CANONICO);
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
      // (P2) o nome antigo que virou atalho (`&acesso`): o caminho principal (`&config access`)
      const atS = !trilha && !CANONICO[cmd.toLowerCase()] && !COMANDO_EXTRA[cmd.toLowerCase()] ? resolverAtalho([cmd]) : null;
      if (atS) { try { return antes + citar([atS.comando, ...atS.args].join("."), "en", prefixo); } catch (e) { void e; return todo; } }
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
  if (lang === "es") return COMANDO_ES[canonico] ?? COMANDO_EN[canonico] ?? canonico;
  if (lang !== "en") return canonico;
  return COMANDO_EN[canonico] ?? canonico;
}

// Citação por referência (fase 3): `citar("autorole.set", "en")` → `&autorole set`.
// O texto não escreve mais o nome do comando à mão: o nome em cada idioma vem do
// registro. Referência que não existe (comando ou subcomando) é ERRO na hora — o
// texto quebrado não chega à tela em silêncio, como o `${P}…` escrito à mão chegava.
export function citar(ref, lang = "pt", prefixo = "&") {
  // (P2) caminho que virou atalho (`log.canal` → `config.log.canal`, `chat.sair` →
  // `privacidade.chat.sair`): o texto antigo continua valendo e mostra o caminho novo
  const at = resolverAtalho(String(ref ?? "").split("."));
  if (at) {
    // o destino pode trazer um valor (`chat.on` → `assistente ia on`): o que não é
    // subcomando vai no fim, como está
    const cam = [at.comando, ...at.args];
    for (let n = cam.length; n >= 1; n--) {
      try { return [citar(cam.slice(0, n).join("."), lang, prefixo), ...cam.slice(n)].join(" "); }
      catch (e) { if (n === 1) throw e; }
    }
  }
  const [cmd, ...subs] = String(ref ?? "").split(".");
  const entrada = REGISTRO.find((c) => c.id === cmd);
  if (!entrada) throw new Error(`citar: o comando "${cmd}" não existe no registro (${ref})`);
  const nomeDoComando = lang === "en" ? (COMANDO_EN[cmd] ?? cmd) : lang === "es" ? (COMANDO_ES[cmd] ?? COMANDO_EN[cmd] ?? cmd) : cmd;
  const partes = [nomeDoComando];
  let tabela = cmd;
  for (const s of subs) {
    const conhecidos = new Set([...Object.values(SUB[tabela] ?? {}), ...Object.keys(SUB_REVERSO[tabela] ?? {})]);
    if (!conhecidos.has(s)) throw new Error(`citar: "${s}" não é subcomando de ${tabela} no registro (${ref})`);
    partes.push(lang === "en" ? (SUB_REVERSO[tabela]?.[s] ?? s)
      : lang === "es" ? (SUB_ES_REVERSO[tabela]?.[s] ?? SUB_REVERSO[tabela]?.[s] ?? s) : s);
    // o nível seguinte: a família (`automod.sentinela`) ou a parte com tabela própria
    if (SUB[`${cmd}.${s}`] || SUB_REVERSO[`${cmd}.${s}`]) tabela = `${cmd}.${s}`;
    else if (SUB[s] && cmd === "automod") tabela = s;
  }
  return prefixo + partes.join(" ");
}

// O código que cita um comando (21 out 2026, fim da fase 3): o nome INTERNO, exatamente
// o que o `${P}cor painel aqui` escrito à mão dava — e que a tradução da tela leva ao
// inglês e ao espanhol, como sempre. O que muda é que a referência é conferida: no
// build (verificar-build.js) e na hora (lança, como o citar). Não é a marca de citação
// do registro porque há código que LÊ o texto antes da tela (o visao.js filtra as
// linhas da ajuda pelo comando citado; o tutorial acha o `&fuso add` no texto).
export const citarInterno = (ref, prefixo = "&") => citar(ref, "pt", prefixo);

// Troca as marcas `{&autorole.set}` de um texto pela citação no idioma (os textos
// que moram no registro não podem chamar função: o registro é só dados).
export function citarNoTexto(texto, lang = "pt", prefixo = "&") {
  return String(texto ?? "").replace(/\{&([a-z0-9.]+)\}/g, (_, ref) => citar(ref, lang, prefixo));
}

// O nome de um subcomando na tela (`log` + `mensagens` → `messages` em inglês).
// Para o handler que monta a tela com o nome interno fora de `&comando …`, onde
// a tradução da tela não alcança (o `&log` listava `mensagens` em inglês).
export function subExibido(canonico, interno, lang) {
  if (lang === "es") return SUB_ES_REVERSO[canonico]?.[interno] ?? SUB_REVERSO[canonico]?.[interno] ?? interno;
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
    telaEs: ord(Object.fromEntries(Object.entries(SUB_ES_REVERSO).map(([c, m]) => [c, ord(m)]))),
    aninhados: ord(Object.fromEntries(Object.entries(ANINHADOS).filter(([, s]) => s.size).map(([c, s]) => [c, [...s].sort()]))),
  };
}

// ── Comandos desativados salvos com nome antigo (revisão P2, 31 out 2026) ──
// `comandosDesativados` guarda o nome que valia quando a staff desativou (`repete`, `iniciativa`…).
// O nome antigo vale pelo destino de hoje, sem regravar o banco: o id do registro, o apelido
// (`repete` → `embed`) ou o atalho de uma palavra (`iniciativa` → `rolar init`, só a parte).
// Nome que não leva a lugar nenhum (`modia`, `cargomudo`) não desativa nada; o `chat` é lido
// pelo gating da IA.
export function caminhoDoDesativado(nome) {
  const n = String(nome ?? "").toLowerCase();
  if (REGISTRO.some((c) => c.id === n)) return [n];
  if (COMANDO_EXTRA[n]) return [COMANDO_EXTRA[n]];
  const at = resolverAtalho([n]);
  if (at && at.atalho.posicoes.length === 1) return [at.comando, ...at.args];
  return null;
}
// O comando (com os args já no nome interno) cai num dos desativados?
export function estaDesativado(lista, canonico, argsInternos = []) {
  const a = (argsInternos ?? []).map((x) => String(x ?? "").toLowerCase());
  return (lista ?? []).some((nome) => {
    const cam = caminhoDoDesativado(nome);
    return !!cam && cam[0] === canonico && cam.slice(1).every((w, i) => a[i] === w);
  });
}
// O comando inteiro está desativado (para a lista do `&config comando`)?
export const comandoInteiroDesativado = (lista, canonico) =>
  (lista ?? []).some((nome) => { const cam = caminhoDoDesativado(nome); return cam?.length === 1 && cam[0] === canonico; });
