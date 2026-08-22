// ══════════════════════════════════════════════════════════
//  teste-tts.mjs — a peneira da transmissão e o entra/sai
//
//  Os casos "barulho" abaixo são mensagens REAIS do servidor, na noite
//  em que a call travou. Se algum dia uma mudança na heurística voltar
//  a deixá-las passar, este teste avisa antes do próximo &tts sair que
//  não funciona.
// ══════════════════════════════════════════════════════════

process.env.BOT_TOKEN = "tok";
process.env.DB_PATH = "/tmp/tts-teste.db";
process.env.CONFIG_PATH = "/tmp/tts-teste-cfg.json";
process.env.TTS_SERVIDORES = "S1";
process.env.VOZ_SERVICO_URL = "http://voz-de-teste.invalido";
import fs from "node:fs";
for (const f of ["/tmp/tts-teste.db", "/tmp/tts-teste.db-wal", "/tmp/tts-teste.db-shm",
                 "/tmp/tts-teste-cfg.json", "/tmp/blocklist-cache.bin"]) fs.rmSync(f, { force: true });

import * as filtro from "./modulos/ferramentas/tts-filtro.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ══ 1. A peneira: barulho ══
console.log("\n── mensagens reais que travaram a call ──");
const BARULHO = [
  ["9?99?999?9999?99999?9999999?999999999?", "pouca-variedade"],
  ["Õõõõõõõõõõõõõõõõõõõõ Õõõõõõõõõõõõõõõõõõõõ ÕõõõõõõõõõõõõõõõõõõõÕõõõõõõõõõõõõõõõõõõõ", "pouca-variedade"],
  ["やきそばやきそばやきそばやきそばやきそばやきそばやきそばやきそばやきそばやきそば(nin gaewan turiwan)", "bloco-repetido"],
  ["Wiwiwiwiwiwiwiwwiwiwiwiiwiwiwiwiwiwiwiwiwiwiwiwiwiwiwquiququqiiquqqiuquqiqquuququq", "bloco-repetido"],
  ["Nnnnnnnn", "pouca-variedade"],
  ["Lalalalalalalalalalalalalalalalalalalalalalalalalalalalalalallalalalalalalalalalallalalalalallalalalalalalalallalalaoaiakdonsianajlalalalalalalalla", "bloco-repetido"],
  ["Ooooppoooooooooooooooooooooohhhhhhhhhhhhhhhhhhheoepopoorieoepalalalalalalal", "caractere-repetido"],
  ["Oooopooooooooooooooooooooooooooooooooo Ooooopooooooooooooooooooooooooooooooooo", "pouca-variedade"],
  ["renaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaannnnaanananaaaaaaaaaaaaaaaaaaaaaaato santos", "caractere-repetido"],
  ["Renaaaaaaaaaaaaaaaaaaaaaaaaaaaanananananananannanananananananaaaaaaaaa sanananananatosososososososososssoooooooooooossss", "caractere-repetido"],
  ["A", "curto-demais"],
  ["b", "curto-demais"],
  ["あ", "curto-demais"],
  ["で", "curto-demais"],
  ["...", "sem-texto"],
  ["🥀🥀🥀", "sem-texto"],
  ["", "vazio"],
];
for (const [txt, motivo] of BARULHO) {
  const r = filtro.avaliar(txt);
  ok(!r.falar && r.motivo === motivo,
    `🔇 ${JSON.stringify(txt.slice(0, 34))} → ${r.motivo}${r.motivo === motivo ? "" : ` (esperava ${motivo})`}`);
}
// parede de texto: a de 2000 chars do servidor
ok(filtro.avaliar("Lalala ".repeat(300)).motivo === "parede", "🔇 parede de 2000+ caracteres");

// ══ 2. A peneira: fala legítima (o mais importante) ══
console.log("\n── nada disso pode ser calado ──");
const FALA = [
  "ola", "teste", "prato", "paralelepípedo", "ok", "aa", "hm",
  "病院 = hospital", "カヤロ", "borhgaraszatinamanoh", "mêatÎ",
  "oi gente tudo bem?", "vamos jogar valorant hoje a noite?",
  "não to conseguindo entrar na call, alguém ajuda?",
  "amanhã mal vou ficar online 🥀", "tenho viagem", "its over pra judy",
  "Alguém bane o miguel", "Renan Santos", "AAAA que legal",
  "kkkkkkkkkk", "rsrsrsrs", "hahahaha", "kkkk mano para",
  "vc n vai vir hj pq?",
  "<@01ARZ3NDEKTSV4RRFFQ69G5FAV> olha isso https://exemplo.com/pagina",
];
for (const txt of FALA) {
  const r = filtro.avaliar(txt);
  ok(r.falar, `🔊 ${JSON.stringify(txt.slice(0, 40))}${r.falar ? "" : ` → CALADO por ${r.motivo}`}`);
}

// ══ 3. Teto por canal ══
console.log("\n── teto por canal (o freio coletivo) ──");
filtro.limpar();
const t0 = 1_000_000;
let permitidas = 0, avisos = 0;
for (let i = 0; i < 12; i++) {
  const r = filtro.registrarFala("C1", t0 + i * 1000);
  if (r.permitido) permitidas++;
  if (r.estreando) avisos++;
}
ok(permitidas === filtro.PADROES.porMinuto, `deixa passar ${filtro.PADROES.porMinuto} falas por minuto (passaram ${permitidas})`);
ok(avisos === 1, "avisa UMA vez quando o silêncio começa (não a cada mensagem)");
ok(filtro.emEnxurrada("C1", t0 + 12_000).silenciado, "canal fica em silêncio depois de estourar");
ok(!filtro.emEnxurrada("C2", t0 + 12_000).silenciado, "  → o silêncio é por canal, não global");
ok(!filtro.emEnxurrada("C1", t0 + 12_000 + filtro.PADROES.silencioMs).silenciado, "  → e passa sozinho");
filtro.limpar("C1");
ok(!filtro.emEnxurrada("C1", t0 + 13_000).silenciado, "&tts entrar limpa o silêncio do canal");
// teto configurável por servidor
filtro.limpar();
let p2 = 0;
for (let i = 0; i < 10; i++) if (filtro.registrarFala("C3", t0 + i * 1000, { porMinuto: 2 }).permitido) p2++;
ok(p2 === 2, "teto por minuto é configurável (&tts filtro porminuto)");

// ══ 4. Integração: aoMensagem não chama o serviço quando é barulho ══
console.log("\n── integração com a transmissão ──");
await import("./main.js");
const c = globalThis.__client;
await c.emitAll("ready");
const tts = await import("./modulos/ferramentas/tts.js");

const chamadas = [];
globalThis.fetch = async (url, opcoes) => {
  chamadas.push({ url: String(url), corpo: JSON.parse(opcoes?.body ?? "{}") });
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

const CANAL_TEXTO = "01JTXT00000000000000000000";
const CANAL_VOZ = "01JVOZ00000000000000000000";
const enviados = [];
const canal = { id: CANAL_TEXTO, name: "call", sendMessage: async (p) => { enviados.push(p); return { id: "M1" }; } };
const ctx = {
  serverId: "S1", PREFIXO: "&", COR: { info: "#fff", aviso: "#fff", erro: "#fff", sucesso: "#fff" },
  cfgGlobal: { debug: false },
  config: { language: "pt", tts: { ativo: true, canalVoz: CANAL_VOZ, canalTexto: CANAL_TEXTO, filtro: true, anunciarNome: true, cooldown: 0 } },
  sendEmbed: async (_c, e) => { enviados.push(e); return { id: "M2" }; },
};
const msg = (texto, autor = "U1") => ({ channelId: CANAL_TEXTO, authorId: autor, content: texto, author: { username: "Ghieh" } });

filtro.limpar();
await tts.aoMensagem(msg("Lalalalalalalalalalalalalalalalala"), ctx);
ok(chamadas.length === 0, "barulho NÃO vira requisição ao serviço de voz");

await tts.aoMensagem(msg("oi pessoal, tudo certo?"), ctx);
ok(chamadas.length === 1 && chamadas[0].url.endsWith("/falar"), "fala legítima chega ao serviço");
ok(chamadas[0].corpo.autoEntrar === false, "  → e pede para NÃO entrar na call sozinha");
ok(chamadas[0].corpo.texto.includes("Ghieh disse:"), "  → anuncia quem falou");

// serviço responde "fora da call" → não insiste
chamadas.length = 0;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: false, erro: "fora da call", foraDaCall: true }) });
const r = await tts.aoMensagem(msg("estou aqui de novo", "U2"), ctx);
ok(r === false, "com o bot fora da call, a transmissão não é considerada entregue");

// filtro desligado deixa passar tudo
globalThis.fetch = async (url, opcoes) => { chamadas.push({ url: String(url), corpo: JSON.parse(opcoes?.body ?? "{}") }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
chamadas.length = 0; filtro.limpar();
ctx.config.tts.filtro = false;
await tts.aoMensagem(msg("Lalalalalalalalalalalalalalalalala", "U3"), ctx);
ok(chamadas.length === 1, "&tts filtro off volta a falar tudo (quem desliga sabe o que faz)");
ctx.config.tts.filtro = true;

// teto: a 7ª mensagem legítima em um minuto cala o canal e avisa uma vez
chamadas.length = 0; enviados.length = 0; filtro.limpar();
for (let i = 0; i < 10; i++) await tts.aoMensagem(msg(`mensagem numero ${i} do teste`, `U${i}`), ctx);
ok(chamadas.length === filtro.PADROES.porMinuto, `teto por canal corta em ${filtro.PADROES.porMinuto} falas (foram ${chamadas.length})`);
const avisou = enviados.filter((e) => String(e.title ?? "").includes("Muita coisa"));
ok(avisou.length === 1, "avisa uma única vez no chat que vai ficar quieta");

// ══ 5. Diagnóstico em etapas (voz-servico) ══
console.log("\n── diagnóstico do serviço de voz ──");
process.env.STOAT_API = "https://api.stoat.invalido";
const voz = await import("./voz-servico/voz.js");

// Respostas por rota, para montar cada cenário.
const responder = (mapa) => async (url) => {
  const u = String(url);
  const chave = u.includes("join_call") ? "join_call" : u.includes("/users/@me") ? "me" : "canal";
  const r = mapa[chave] ?? { ok: true, status: 200, corpo: "{}" };
  return { ok: r.ok !== false, status: r.status ?? 200, text: async () => r.corpo };
};

// Cenário do servidor: um 400 em HTML no join_call. Um proxy respondeu,
// não a API — e o veredito NÃO pode acusar permissão de canal por isso.
globalThis.fetch = responder({
  me: { ok: true, status: 200, corpo: '{"username":"Judy"}' },
  canal: { ok: true, status: 200, corpo: '{"channel_type":"VoiceChannel","name":"Call"}' },
  join_call: { ok: false, status: 400, corpo: '<!DOCTYPE html><html lang="en"><head><title>400 Bad Request</title></head><body>' },
});
let d = await voz.diagnosticar("01JVOZ00000000000000000000");
const et = (n) => d.etapas.find((e) => e.etapa === n);
ok(et("api+token")?.ok === true, "token válido aparece como etapa própria (some a ambiguidade)");
ok(et("api+token")?.detalhe.includes("Judy"), "  → e diz como quem autenticou");
ok(et("canal")?.ok === true, "confere que o ID é mesmo de um canal de VOZ");
ok(et("join_call")?.ok === false && et("join_call")?.detalhe.includes("proxy"),
  "400 em HTML é identificado como proxy/CDN, NÃO como recusa da API");

// Recusa de verdade: JSON com o tipo do erro.
globalThis.fetch = responder({
  me: { ok: true, status: 200, corpo: '{"username":"Judy"}' },
  canal: { ok: true, status: 200, corpo: '{"channel_type":"VoiceChannel","name":"Call"}' },
  join_call: { ok: false, status: 403, corpo: '{"type":"MissingPermission","permission":"Speak"}' },
});
d = await voz.diagnosticar("01JVOZ00000000000000000000");
ok(et("join_call")?.detalhe.includes("MissingPermission"), "recusa real (JSON) mostra o tipo do erro do Stoat");
ok(!et("join_call")?.detalhe.includes("proxy"), "  → e NÃO é confundida com proxy");

// Token inválido: a falha aparece na primeira etapa, não no join.
globalThis.fetch = responder({ me: { ok: false, status: 401, corpo: '{"type":"InvalidSession"}' } });
d = await voz.diagnosticar("01JVOZ00000000000000000000");
ok(et("api+token")?.ok === false, "token inválido falha logo na etapa 1");

// Um canal de call no Stoat É um TextChannel: a etapa "canal" só verifica se
// dá para LER o canal. Julgar o tipo aqui apontava um culpado inexistente e
// mandava reconfigurar um canal que estava certo.
globalThis.fetch = responder({
  me: { ok: true, status: 200, corpo: '{"username":"Judy"}' },
  canal: { ok: true, status: 200, corpo: '{"channel_type":"TextChannel","name":"Call"}' },
  join_call: { ok: true, status: 200, corpo: '{"token":"x","url":"wss://lk.invalido:7880"}' },
});
d = await voz.diagnosticar("01JVOZ00000000000000000000");
ok(et("canal")?.ok === true, "★ TextChannel com call NÃO é marcado como erro (é o normal no Stoat)");

// Canal que o bot não consegue ler: aí sim é problema.
globalThis.fetch = responder({
  me: { ok: true, status: 200, corpo: '{"username":"Judy"}' },
  canal: { ok: false, status: 404, corpo: '{"type":"NotFound"}' },
});
d = await voz.diagnosticar("01JVOZ00000000000000000000");
ok(et("canal")?.ok === false, "canal ilegível/inexistente é apontado");

// AlreadyConnected reconhecido no diagnóstico
globalThis.fetch = responder({
  me: { ok: true, status: 200, corpo: '{"username":"Judy"}' },
  canal: { ok: true, status: 200, corpo: '{"channel_type":"TextChannel","name":"Call"}' },
  join_call: { ok: false, status: 400, corpo: '{"type":"AlreadyConnected","location":"crates/core/database/src/voice/mod.rs:40:24"}' },
});
d = await voz.diagnosticar("01JVOZ00000000000000000000");
ok(String(et("join_call")?.detalhe).includes("AlreadyConnected"), "★ o diagnóstico mostra o AlreadyConnected literal");

// Caminho feliz: o token do LiveKit nunca sai no resultado.
globalThis.fetch = responder({
  me: { ok: true, status: 200, corpo: '{"username":"Judy"}' },
  canal: { ok: true, status: 200, corpo: '{"channel_type":"VoiceChannel","name":"Call"}' },
  join_call: { ok: true, status: 200, corpo: JSON.stringify({ token: "SEGREDO-QUE-NAO-PODE-VAZAR", url: "wss://livekit.invalido:7880" }) },
});
d = await voz.diagnosticar("01JVOZ00000000000000000000");
ok(et("join_call")?.ok === true, "join_call autorizado é reportado como sucesso");
ok(!JSON.stringify(d).includes("SEGREDO-QUE-NAO-PODE-VAZAR"), "  → o token do LiveKit NUNCA vai para o resultado (isto vai parar num chat)");
ok(et("join_call")?.detalhe.includes("token") && et("join_call")?.detalhe.includes("url"), "  → mas os CAMPOS recebidos são mostrados");
ok(et("livekit-tcp")?.ok === false, "  → e o alcance do LiveKit é testado de verdade");
// Este teste roda SEM a flag (é o Node padrão), então o diagnóstico deve
// acusar a falta — que é justamente o comportamento útil no serviço real.
ok(d.flagNode === (typeof globalThis.navigator === "undefined" ? "ok" : "FALTA --no-experimental-global-navigator"),
  `confere a flag do Node e reporta o que encontrou (${d.flagNode})`);

// ══ 6. Erro de digitação não vira fala ══
console.log("\n── &tts <palavra errada> ──");
const CANAL_VOZ2 = "01JVOZ00000000000000000000";
const respostas = [];
const ctxCmd = {
  serverId: "S1", PREFIXO: "&", COR: { info: "#1", aviso: "#2", erro: "#3", sucesso: "#4", mod: "#5" },
  cfgGlobal: { debug: false },
  config: { language: "pt", tts: { ativo: true, canalVoz: CANAL_VOZ2, canalTexto: null, filtro: true, cooldown: 0 } },
  sendEmbed: async (_c, e) => { respostas.push(e); return { id: "M9" }; },
  getServer: async () => ({ id: "S1", channels: [] }),
  membroTemPermissao: () => true,
  salvarConfig: () => {},
};
const msgCmd = { channelId: "C9", authorId: "U1", channel: { id: "C9" }, author: { username: "Ghieh" } };
let chamou = 0;
globalThis.fetch = async () => { chamou++; return { ok: true, status: 200, json: async () => ({ ok: true }) }; };

// `diagnosticar` agora É um subcomando (foi o que ele digitou de verdade):
// tem de RODAR o diagnóstico, não virar fala nem sugestão.
respostas.length = 0; chamou = 0;
await tts.cmdTts(msgCmd, ["diagnosticar"], ctxCmd);
ok(chamou === 1, "`&tts diagnosticar` roda o diagnóstico (não fala a palavra)");
ok(!String(respostas.at(-1)?.title).includes("Não consegui falar"), "  → e não tenta entrar na call para isso");

// Um typo de verdade cai na sugestão, com o subcomando certo apontado.
respostas.length = 0; chamou = 0;
await tts.cmdTts(msgCmd, ["transmitr"], ctxCmd);
ok(String(respostas.at(-1)?.title).includes("quis dizer"), "typo (`transmitr`) sugere o subcomando em vez de falar a palavra");
ok(chamou === 0, "  → e não gasta uma tentativa de entrar na call para isso");
ok(String(respostas.at(-1)?.description).includes("transmitir"), "  → aponta o subcomando certo");

respostas.length = 0; chamou = 0;
await tts.cmdTts(msgCmd, ["reinicar"], ctxCmd);
ok(String(respostas.at(-1)?.title).includes("quis dizer"), "pega erro de digitação com letra faltando (`reinicar`)");

respostas.length = 0; chamou = 0;
await tts.cmdTts(msgCmd, ["falar", "diagnosticar"], ctxCmd);
ok(chamou === 1, "`&tts falar <palavra>` força a fala mesmo parecendo comando");

respostas.length = 0; chamou = 0;
await tts.cmdTts(msgCmd, ["entrar", "na", "call", "agora"], ctxCmd);
ok(chamou === 1, "frase que começa com um subcomando continua sendo fala (`&tts entrar na call agora`)");

for (const frase of [["oi"], ["teste"], ["bom", "dia"], ["paralelepípedo"]]) {
  respostas.length = 0; chamou = 0;
  await tts.cmdTts(msgCmd, frase, ctxCmd);
  ok(chamou === 1, `fala legítima não é confundida: ${JSON.stringify(frase.join(" "))}`);
}

// ══ 7. Um comando só: entrar já lê a call ══
//
//  Antes eram quatro, na ordem certa: `tts on`, `tts canal aqui`,
//  `tts transmitir aqui`, `tts entrar`. Errar a ordem dava um erro que
//  falava de outro comando.
console.log("\n── &tts entrar faz tudo ──");
const CALL = "01JCALL0000000000000000AA";
const rotas = [];
globalThis.fetch = async (url, op) => { rotas.push({ url: String(url), corpo: JSON.parse(op?.body ?? "{}") }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };

const respE = [];
const canalCall = { id: CALL, name: "Call", type: "VoiceChannel", sendMessage: async () => ({ id: "m" }) };
const cfgZero = { language: "pt", tts: { ativo: false, canalVoz: null, canalTexto: null, filtro: true, cooldown: 0 } };
const ctxE = {
  serverId: "S1", PREFIXO: "&", COR: { info: "#1", aviso: "#2", erro: "#3", sucesso: "#4", mod: "#5" },
  cfgGlobal: { debug: false }, config: cfgZero,
  sendEmbed: async (_c, e) => { respE.push(e); return { id: "M" }; },
  getServer: async () => ({ id: "S1", channels: [canalCall] }),
  membroTemPermissao: () => true, salvarConfig: () => {}, client: { channels: new Map([[CALL, canalCall]]) },
};
const msgNaCall = { channelId: CALL, authorId: "U1", channel: canalCall, author: { username: "Ghieh" } };

await tts.cmdTts(msgNaCall, ["entrar"], ctxE);
ok(rotas.some((r) => r.url.endsWith("/entrar")), "★ `&tts entrar` sozinho já entra na call — sem configurar nada antes");
ok(cfgZero.tts.canalVoz === CALL, "  → descobriu a call pelo canal onde o comando foi dado");
ok(cfgZero.tts.canalTexto === CALL, "  → e ligou a leitura desse canal");
ok(cfgZero.tts.ativo === true, "  → e ligou o sistema (que estava desligado)");
ok(String(respE.at(-1)?.description).includes("falo tudo que for escrito"), "  → a resposta diz que ela já está lendo");
ok(String(respE.at(-1)?.description).includes("tts on"), "  → e mostra os comandos equivalentes, para quem quiser aprender");

// a leitura funciona logo em seguida
rotas.length = 0; filtro.limpar();
await tts.aoMensagem({ channelId: CALL, authorId: "U2", content: "oi pessoal", author: { username: "Alguem" } }, ctxE);
ok(rotas.some((r) => r.url.endsWith("/falar")), "★ logo depois do entrar, o que é escrito na call já vira fala");

// sair para de ler também
rotas.length = 0;
await tts.cmdTts(msgNaCall, ["sair"], ctxE);
ok(cfgZero.tts.canalTexto === null, "★ `&tts sair` também PARA de ler (ninguém quer ler para uma call vazia)");
rotas.length = 0;
await tts.aoMensagem({ channelId: CALL, authorId: "U2", content: "ainda tem alguem?", author: { username: "Alguem" } }, ctxE);
ok(rotas.length === 0, "  → e nada mais é enviado ao serviço");

// A call é a do canal onde a pessoa digitou — inclusive em canal de texto,
// porque no Stoat qualquer canal pode ter uma call. Se não houver call ali,
// o join_call falha com uma mensagem clara; melhor do que adivinhar em
// silêncio e entrar na call errada, que foi o que aconteceu no servidor.
respE.length = 0; rotas.length = 0;
const canalTexto = { id: "01JTXT0000000000000000AAAA", name: "geral", type: "TextChannel", sendMessage: async () => ({ id: "m" }) };
const msgNoTexto = { channelId: canalTexto.id, authorId: "U1", channel: canalTexto, author: { username: "G" } };
const ctxT = { ...ctxE, config: { language: "pt", tts: { ativo: false, canalVoz: null, canalTexto: null, filtro: true, cooldown: 0 } },
  getServer: async () => ({ id: "S1", channels: [canalCall, canalTexto] }) };
await tts.cmdTts(msgNoTexto, ["entrar"], ctxT);
ok(ctxT.config.tts.canalVoz === canalTexto.id, "★ entra na call DO CANAL onde o comando foi dado");
ok(rotas.some((r) => r.corpo.canalVoz === canalTexto.id), "  → e é esse canal que vai para o serviço");

// Sem canal utilizável (DM, categoria), aí sim pergunta.
respE.length = 0; rotas.length = 0;
const categoria = { id: "01JCAT0000000000000000AAAA", name: "categoria", type: "Category", sendMessage: async () => ({ id: "m" }) };
const ctxC = { ...ctxE, config: { language: "pt", tts: { ativo: false, canalVoz: null, canalTexto: null, filtro: true, cooldown: 0 } },
  getServer: async () => ({ id: "S1", channels: [canalCall, categoria] }) };
await tts.cmdTts({ channelId: categoria.id, authorId: "U1", channel: categoria, author: { username: "G" } }, ["entrar"], ctxC);
ok(ctxC.config.tts.canalVoz === canalCall.id, "de um canal que não comporta call, cai para a única que existe");

// ══ 8. AlreadyConnected — a causa real do servidor ══
//
//  O diagnóstico no servidor devolveu:
//    join_call → HTTP 400 · AlreadyConnected (crates/core/database/src/voice)
//  O Stoat guarda que o bot está numa call e recusa toda entrada nova. Não é
//  permissão nem rede: é registro preso do lado dele.
console.log("\n── AlreadyConnected ──");

// O canal de call do Stoat é um TextChannel com voz — não um "VoiceChannel".
// Supor o contrário fazia `entrar` recusar justamente o canal certo.
const callReal = { id: "01JCALLR000000000000000AA", name: "Call", type: "TextChannel", sendMessage: async () => ({ id: "m" }) };
const respA = [];
const cfgA = { language: "pt", tts: { ativo: false, canalVoz: "01JVELHO000000000000000AA", canalTexto: null, filtro: true, cooldown: 0 } };
const ctxA = {
  serverId: "S1", PREFIXO: "&", COR: { info: "#1", aviso: "#2", erro: "#3", sucesso: "#4", mod: "#5" },
  cfgGlobal: { debug: false }, config: cfgA,
  sendEmbed: async (_c, e) => { respA.push(e); return { id: "M" }; },
  getServer: async () => ({ id: "S1", channels: [callReal] }),
  membroTemPermissao: () => true, salvarConfig: () => {}, client: { channels: new Map([[callReal.id, callReal]]) },
};
const msgNaCallReal = { channelId: callReal.id, authorId: "U1", channel: callReal, author: { username: "Ghieh" } };

globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
await tts.cmdTts(msgNaCallReal, ["entrar"], ctxA);
ok(cfgA.tts.canalVoz === callReal.id,
  "★ um canal `TextChannel` com call É aceito (no Stoat não existe VoiceChannel separado)");
ok(cfgA.tts.canalVoz !== "01JVELHO000000000000000AA", "  → e a configuração antiga não sequestra o comando");

// entrar quando o Stoat recusa com AlreadyConnected
respA.length = 0;
globalThis.fetch = async () => ({ ok: false, status: 502,
  json: async () => ({ erro: 'AlreadyConnected {"type":"AlreadyConnected"}' }),
  text: async () => '{"erro":"AlreadyConnected"}' });
await tts.cmdTts(msgNaCallReal, ["entrar"], ctxA);
const t = String(respA.at(-1)?.title ?? "") + String(respA.at(-1)?.description ?? "");
ok(t.includes("já estou numa call") || t.includes("destravar"),
  "★ AlreadyConnected vira explicação própria, não um timeout genérico");
ok(!t.includes("tts canal aqui"), "  → e NÃO manda usar o comando de configuração antigo");

// &tts destravar
respA.length = 0;
const urlsDestravar = [];
globalThis.fetch = async (url, op) => {
  urlsDestravar.push(String(url));
  return { ok: true, status: 200, json: async () => ({ ok: true, via: { metodo: "POST", rota: "/leave_call" },
    resultados: [{ metodo: "POST", rota: `/channels/${callReal.id}/leave_call`, ok: true, status: 200 }] }) };
};
await tts.cmdTts(msgNaCallReal, ["destravar"], ctxA);
ok(urlsDestravar.some((u) => u.includes("/destravar")), "`&tts destravar` chama o serviço");
ok(String(respA.at(-1)?.title).includes("Destravado"), "  → e relata o resultado de cada rota tentada");

console.log(`\nTTS: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
