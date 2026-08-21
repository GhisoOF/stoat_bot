// ══════════════════════════════════════════════════════════
//  teste-help-tutorial.mjs — &help por intenção, &tutorial em páginas,
//  &assistente guiado, paridade PT/EN e o limite do embed.
// ══════════════════════════════════════════════════════════

process.env.BOT_TOKEN = "tok";
process.env.DB_PATH = "/tmp/help-teste.db";
process.env.CONFIG_PATH = "/tmp/help-teste-cfg.json";
import fs from "node:fs";
for (const f of ["/tmp/help-teste.db", "/tmp/help-teste.db-wal", "/tmp/help-teste.db-shm",
                 "/tmp/help-teste-cfg.json", "/tmp/blocklist-cache.bin"]) fs.rmSync(f, { force: true });

await import("./main.js");
const c = globalThis.__client;
await c.emitAll("ready");

import * as paginas from "./modulos/core/paginas.js";
import { parametros } from "./modulos/moderacao/help-parametros.js";
import { grupos, ORDEM } from "./modulos/moderacao/help-grupos.js";
import { sessoesAtivas } from "./modulos/moderacao/assistente.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ── Cenário ──
const CARGO_ADM = "01JADM00000000000000000000";
const CARGO_MOD = "01JMDR00000000000000000000";
const roles = new Map([[CARGO_ADM, { name: "Admin" }], [CARGO_MOD, { name: "Moderador" }]]);
const CANAL = "01JCHN00000000000000000000", LOGC = "01JXGX00000000000000000000";

let seq = 0;
const enviados = [];            // { id, payload, edits:[], reacoes:[] }
function fazerCanal(id, name) {
  return {
    id, name, type: "TextChannel",
    sendMessage: async (p) => {
      const m = { id: `M${++seq}`.padEnd(26, "0"), payload: p, edits: [], reacoes: [],
        react: async (e) => { m.reacoes.push(decodeURIComponent(e)); },
        edit: async (p2) => { m.edits.push(p2); } };
      enviados.push(m); return m;
    },
  };
}
const canal = fazerCanal(CANAL, "geral"), logCanal = fazerCanal(LOGC, "log");
c.channels.set(CANAL, canal); c.channels.set(LOGC, logCanal);
const server = { id: "S1", ownerId: "U1", name: "Teste", memberCount: 3, roles, channels: [canal, logCanal],
  fetchMember: async () => null, fetchMembers: async () => ({ members: [] }),
  createRole: async (name) => { const id = "01JSXX00000000000000000000"; roles.set(id, { name }); return { id, name }; },
  setPermissions: async () => {} };
c.servers.set("S1", server);

const mk = (t, autor = "U1") => ({ authorId: autor, content: t, serverId: "S1", server, channel: canal, channelId: CANAL,
  mentionIds: [], createdAt: new Date(), author: { username: "Ghieh" }, member: { roles: [] } });
const say = async (t, autor) => { await c.emitAll("messageCreate", mk(t, autor)); return enviados[enviados.length - 1]; };
const texto = (m) => JSON.stringify(m?.payload ?? {});
const desc = (m) => (m?.edits.length ? m.edits[m.edits.length - 1] : m?.payload)?.embeds?.[0]?.description ?? "";
const titulo = (m) => (m?.edits.length ? m.edits[m.edits.length - 1] : m?.payload)?.embeds?.[0]?.title ?? "";
const reagir = (m, e, quem = "U1") => c.emitAll("messageReactionAdd", { id: m.id }, quem, encodeURIComponent(e));
const desreagir = (m, e, quem = "U1") => c.emitAll("messageReactionRemove", { id: m.id }, quem, encodeURIComponent(e));

// ══ &help ══
console.log("\n── &help (índice por intenção) ──");
let m = await say("&help");
ok(titulo(m).includes("Central de Ajuda"), "&help abre o índice");
for (const g of ["comecar", "proteger", "personalizar", "diversao", "rpg", "diagnostico"])
  ok(desc(m).includes(`&help ${g}`), `  → índice lista o grupo ${g}`);
ok(!desc(m).includes("&help dono"), "  → grupo 'dono' não aparece para quem não é o dono do bot");
ok(desc(m).includes("Página **1/"), "  → é paginado (rodapé 1/N)");
ok(m.reacoes.includes("◀") && m.reacoes.includes("▶"), "  → o bot reagiu com ◀ ▶");
ok(desc(m).includes("&assistente"), "  → aponta o assistente para servidor novo");

await reagir(m, "▶");
ok(m.edits.length === 1 && titulo(m).includes("Começar"), "▶ (adicionar reação) vira para a página 2 = Começar");
await desreagir(m, "▶");
ok(m.edits.length === 2 && titulo(m).includes("Proteger"), "▶ (tirar a reação) vira de novo = Proteger");
await reagir(m, "◀");
ok(titulo(m).includes("Começar"), "◀ volta uma página");
await reagir(m, "▶", "OUTRA");
ok(titulo(m).includes("Começar"), "reação de outra pessoa não vira a página");
await reagir(m, "🎉");
ok(titulo(m).includes("Começar"), "emoji sem função é ignorado");

m = await say("&help 3");
ok(titulo(m).includes("Proteger"), "&help 3 abre direto a página 3 (texto puro, sem reação)");
m = await say("&help moderacao");
ok(titulo(m).includes("Proteger"), "nome antigo `moderacao` leva ao grupo Proteger");
m = await say("&help config");
ok(titulo(m).includes("Personalizar"), "nome antigo `config` leva ao grupo Personalizar");
m = await say("&help proteger");
ok(desc(m).includes("&sentinela") && !desc(m).includes("automod antiscam"), "Proteger fala em `sentinela` (não mais em antiscam como comando)");
ok(desc(m).includes("&help <comando>") || desc(m).includes("&help <command>"), "  → página de grupo aponta o detalhe por comando");

// limite do embed em TODAS as páginas/grupos/idiomas
for (const lang of ["pt", "en"]) {
  const G = grupos("&", lang);
  ok(ORDEM.every((k) => G[k]), `grupos(${lang}): todos os grupos de ORDEM existem`);
  ok(Object.keys(G).every((k) => G[k].linhas.join("\n").length < 2800), `grupos(${lang}): nenhum grupo maior que 2 páginas`);
}

// ══ &help <comando> com parâmetros ══
console.log("\n── &help <comando>: parâmetros explicados ──");
m = await say("&help boasvindas");
const todasPgs = (mm) => [mm.payload, ...mm.edits].map((p) => p?.embeds?.[0]?.description ?? "").join("\n");
// pode estar paginado: vira as páginas para juntar tudo
for (let i = 0; i < 3; i++) await reagir(m, "▶");
const tudoBV = todasPgs(m);
ok(tudoBV.includes("Parâmetros"), "&help boasvindas tem a seção Parâmetros");
ok(tudoBV.includes("{membros}") && tudoBV.includes("{usuario}"), "  → explica os marcadores");
ok(tudoBV.includes("`imagem`") && tudoBV.includes("visivel"), "  → explica imagem visível/oculta");
ok(tudoBV.includes("`testar`"), "  → explica `testar`");
m = await say("&help automod");
for (let i = 0; i < 3; i++) await reagir(m, "▶");
ok(todasPgs(m).includes("sentinela") && !todasPgs(m).includes("antilink, antiscam."), "&help automod lista `sentinela` em vez de antiscam");
m = await say("&help assistente");
ok(texto(m).includes("rapido") && texto(m).includes("canais"), "&help assistente existe e lista os roteiros");
m = await say("&help tutorial");
ok(texto(m).includes("canais"), "&help tutorial menciona a área `canais`");

// paridade PT/EN da tabela de parâmetros
const PT = parametros("&", "pt"), EN = parametros("&", "en");
ok(Object.keys(PT).length === Object.keys(EN).length, `parametros: mesmos comandos em PT e EN (${Object.keys(PT).length})`);
for (const k of Object.keys(PT)) {
  ok(EN[k] && EN[k].length === PT[k].length, `  → ${k}: ${PT[k].length} parâmetro(s) nos dois idiomas`);
}
ok(["boasvindas", "adeus", "automod", "punicao", "sentinela", "log", "acesso", "xp", "assistente", "tutorial"].every((k) => PT[k]),
  "parametros cobre os comandos de configuração principais");

// ══ &tutorial ══
console.log("\n── &tutorial em páginas ──");
m = await say("&tutorial");
ok(titulo(m).includes("Antes de tudo"), "&tutorial abre a página 'Antes de tudo'");
ok(desc(m).includes("Página **1/6**"), "  → 6 páginas");
ok(m.reacoes.length === 2, "  → reagiu ◀ ▶");
await reagir(m, "▶");
ok(titulo(m).includes("Canais") && desc(m).includes("Só staff vê") && desc(m).includes("Só staff escreve"), "página 2 = Canais, com os 3 tipos");
ok(desc(m).includes("permissão do canal vence"), "  → enuncia a regra canal > cargo");
for (let i = 0; i < 4; i++) await reagir(m, "▶");
ok(titulo(m).includes("Checklist"), "página 6 = Checklist");
await reagir(m, "▶");
ok(titulo(m).includes("Antes de tudo"), "  → depois da última volta para a primeira (circular)");
m = await say("&tutorial 3");
ok(titulo(m).includes("Proteção") && desc(m).includes("&sentinela on"), "&tutorial 3 abre Proteção e ensina &sentinela on");
m = await say("&tutorial canais");
ok(titulo(m).includes("Canais: os 3 tipos"), "&tutorial canais: área de aprofundamento existe");
ok(desc(m).includes("Padrão") && desc(m).includes("Ver canal"), "  → diz o que clicar (Padrão → Ver canal)");
m = await say("&tutorial tipos");
ok(titulo(m).includes("Canais"), "apelido `tipos` leva à área canais");
m = await say("&tutorial moderacao");
ok(titulo(m).includes("Moderação automática"), "áreas antigas continuam (&tutorial moderacao)");
ok(desc(m).length <= 1500, "  → área longa cabe no embed (paginada, não cortada)");

// todas as páginas do guia cabem no embed, nos dois idiomas
const { cmdTutorial } = await import("./modulos/moderacao/tutorial.js");
for (const lang of ["pt", "en"]) {
  const caps = [];
  const ctxFake = { sendEmbed: async (_c, e) => { caps.push(e); return { id: "x", react: async () => {}, edit: async (p) => caps.push(p.embeds[0]) }; },
    COR: { info: "#fff", aviso: "#fff" }, PREFIXO: "&", config: { language: lang }, serverId: "S1", exibir: (t) => t };
  await cmdTutorial({ channel: {}, authorId: "U1" }, [], ctxFake);
  ok(caps[0]?.description?.length <= 1500, `guia(${lang}): página 1 ≤ 1500`);
  ok((lang === "en") === caps[0]?.title?.includes("Getting started"), `guia(${lang}): no idioma certo`);
}

// ══ &sentinela on e &automod status ══
console.log("\n── sentinela (antigo antiscam) ──");
m = await say("&sentinela on");
ok(texto(m).includes("ativado"), "&sentinela on liga o filtro");
m = await say("&automod status");
ok(texto(m).includes("**sentinela**") && !texto(m).includes("**antiscam**"), "&automod status lista `sentinela`, não `antiscam`");
m = await say("&automod antiscam");
ok(titulo(m).includes("sentinela"), "&automod antiscam ainda funciona (redireciona)");

// ══ &assistente ══
console.log("\n── &assistente rapido ──");
m = await say("&assistente");
ok(texto(m).includes("rapido") && texto(m).includes("canais") && texto(m).includes("protecao"), "&assistente mostra o menu");
ok(sessoesAtivas() === 0, "  → o menu não abre sessão");

await say("&assistente rapido");
m = enviados[enviados.length - 1];
ok(sessoesAtivas() === 1, "&assistente rapido abre a sessão");
ok(desc(m).includes("Idioma") && titulo(m).includes("1/5"), "  → pergunta 1/5: idioma");

m = await say("blá");
ok(titulo(m).includes("Não entendi") && desc(m).includes("Idioma"), "resposta inválida repete a pergunta");
m = await say("1");
ok(titulo(m).includes("2/5") && desc(m).includes("Staff"), "'1' → pergunta 2: staff");
m = await say("Admin, Moderador, Inexistente");
ok(texto(enviados[enviados.length - 2]).includes("Inexistente"), "cargo que não existe é avisado");
ok(titulo(m).includes("3/5") && desc(m).includes("Registro"), "  → pergunta 3: log");
m = await say("voltar");
ok(titulo(m).includes("2/5"), "`voltar` volta uma pergunta");
m = await say(`<%${CARGO_ADM}>`);
ok(titulo(m).includes("3/5"), "menção de cargo é aceita");
m = await say(`<#${LOGC}>`);
ok(titulo(m).includes("4/5") && desc(m).includes("Proteção"), "menção de canal → pergunta 4: proteção");
m = await say("2");
ok(titulo(m).includes("5/5") && desc(m).includes("Boas-vindas"), "'2' (médio) → pergunta 5: boas-vindas");
m = await say("pular");
ok(titulo(m).includes("Resumo"), "`pular` na última leva ao resumo");
ok(desc(m).includes("&acesso cargo add") && desc(m).includes("&log canal") && desc(m).includes("&sentinela on") && desc(m).includes("&punicao modo acumular"),
  "  → resumo mostra os comandos equivalentes");
ok(desc(m).includes("&cargomudo"), "  → sem cargo de silêncio, inclui &cargomudo antes da escada");
ok(desc(m).includes("boasvindas** — _(pulado)_"), "  → marca o que foi pulado");
ok(!desc(m).includes("&boasvindas"), "  → e não roda comando para o que foi pulado");

m = await say("confirmar");
ok(sessoesAtivas() === 0, "`confirmar` fecha a sessão");
ok(titulo(m).includes("Pronto"), "  → relatório final");
const rel = desc(m);
ok(rel.includes("✅ `&acesso cargo add"), "  → acesso aplicado");
ok(rel.includes("✅ `&log canal"), "  → log aplicado");
ok(rel.includes("✅ `&automod antispam on"), "  → automod aplicado");
ok(rel.includes("✅ `&sentinela on"), "  → sentinela aplicado");
ok(!rel.includes("❌"), "  → nada falhou: " + (rel.match(/❌.*/g) ?? []).join(" | "));
m = await say("&config");
ok(texto(m).includes(LOGC), "&config mostra o canal de log configurado pelo assistente");
m = await say("&staff");
ok(texto(m).includes("Admin"), "&staff lista o cargo que o assistente adicionou");

// texto normal depois do assistente não é capturado
const antes = enviados.length;
await say("oi gente");
ok(enviados.length === antes, "mensagem normal depois do fim não gera resposta do assistente");

// cancelar e permissão
await say("&assistente protecao");
ok(sessoesAtivas() === 1, "&assistente protecao abre sessão");
m = await say("cancelar");
ok(sessoesAtivas() === 0 && texto(m).includes("Cancelado"), "`cancelar` encerra sem aplicar");
m = await say("&assistente rapido", "01JZZY00000000000000000000");
ok(texto(m).includes("Permissão insuficiente") && sessoesAtivas() === 0, "sem permissão não abre sessão");

// roteiro canais
console.log("\n── &assistente canais ──");
await say("&assistente canais");
m = await say("log");
ok(titulo(m).includes("2/2"), "canal por nome aceito → pergunta 2");
m = await say("pular");
ok(titulo(m).includes("Seus canais") && desc(m).includes("#log"), "gera o guia com o canal informado");
ok(desc(m).includes("Padrão") && desc(m).includes("negar"), "  → instruções clique-a-clique");
ok(desc(m).includes("Admin"), "  → cita os cargos de staff atuais");
ok(sessoesAtivas() === 0, "  → sessão fechada (não há o que aplicar)");

// ══ EN ══
console.log("\n── EN ──");
await say("&idioma en");
m = await say("&help");
ok(titulo(m).includes("Help Center") && desc(m).includes("Page **1/"), "&help em EN: índice e rodapé em inglês");
m = await say("&help protect");
ok(titulo(m).includes("Protect"), "&help protect (alias EN) → Protect");
m = await say("&help welcome");
for (let i = 0; i < 3; i++) await reagir(m, "▶");
ok(todasPgs(m).includes("Parameters") && todasPgs(m).includes("{membros}"), "&help welcome em EN tem Parameters com marcadores");
m = await say("&tutorial");
ok(titulo(m).includes("Getting started"), "&tutorial em EN");
m = await say("&tutorial channels");
ok(titulo(m).includes("Channels: the 3 types"), "&tutorial channels (EN) → área canais");
m = await say("&wizard");
ok(titulo(m).includes("Setup wizard"), "&wizard (EN) abre o menu do assistente em inglês");
await say("&wizard quick");
m = enviados[enviados.length - 1];
ok(desc(m).includes("Language"), "&wizard quick pergunta em inglês");
await say("cancelar");

console.log(`\nHELP/TUTORIAL/ASSISTENTE: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
