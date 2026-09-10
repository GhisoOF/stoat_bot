
process.env.BOT_TOKEN = "tok";
process.env.DB_PATH = "/tmp/tts-teste.db";
process.env.CONFIG_PATH = "/tmp/tts-teste-cfg.json";
process.env.TTS_SERVIDORES = "S1";
process.env.VOZ_SERVICO_URL = "http://voz-de-teste.invalido";
import fs from "node:fs";
for (const f of ["/tmp/tts-teste.db", "/tmp/tts-teste.db-wal", "/tmp/tts-teste.db-shm",
                 "/tmp/tts-teste-cfg.json", "/tmp/blocklist-cache.bin"]) fs.rmSync(f, { force: true });

import * as filtro from "./modulos/ferramentas/tts-filtro.js";
import * as abrevMod from "./modulos/core/abreviacoes.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

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

console.log("\n── diagnóstico do serviço de voz ──");
process.env.STOAT_API = "https://api.stoat.invalido";
const voz = await import("./voz-servico/voz.js");

// Respostas por rota, para montar cada cenário.
const responder = (mapa) => async (url) => {
  const u = String(url);
  const chave = u.includes("join_call") ? "join_call" : u.includes("/users/@me") ? "me" : "canal";
  const r = mapa[chave] ?? { ok: true, status: 200, corpo: "{}" };
  return { ok: r.ok !== false, status: r.status ?? 200, text: async () => r.corpo,
    json: async () => JSON.parse(r.corpo) };
};

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
ok(d.flagNode === (typeof globalThis.navigator === "undefined" ? "ok" : "FALTA --no-experimental-global-navigator"),
  `confere a flag do Node e reporta o que encontrou (${d.flagNode})`);

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

respostas.length = 0; chamou = 0;
await tts.cmdTts(msgCmd, ["diagnosticar"], ctxCmd);
ok(chamou === 1, "`&tts diagnosticar` roda o diagnóstico (não fala a palavra)");
ok(!String(respostas.at(-1)?.title).includes("Não consegui falar"), "  → e não tenta entrar na call para isso");

// Um typo de verdade cai na sugestão, com o subcomando certo apontado.
respostas.length = 0; chamou = 0;
await tts.cmdTts(msgCmd, ["dicionari"], ctxCmd);
ok(String(respostas.at(-1)?.title).includes("quis dizer"), "typo (`dicionari`) sugere o subcomando em vez de falar a palavra");
ok(chamou === 0, "  → e não gasta uma tentativa de entrar na call para isso");
ok(String(respostas.at(-1)?.description).includes("dicionario"), "  → aponta o subcomando certo");

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
ok(/Escolhi sozinha/.test(String(respE.at(-1)?.description)), "  → e conta o que escolheu sozinha (sem citar comando que não existe)");
ok(!/tts on|tts canal|tts transmitir/.test(String(respE.at(-1)?.description)),
  "  → sem mandar usar `tts on`/`canal`/`transmitir`: não existem, o entrar faz os três");

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

console.log("\n── AlreadyConnected ──");

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
ok(/Não consegui entrar na call|Entrei/.test(String(respA.at(-1)?.title)) && !/20s/.test(t),
  "★ AlreadyConnected dispara o resgate em vez de um timeout genérico");
ok(!t.includes("tts canal aqui"), "  → e NÃO manda usar o comando de configuração antigo");
ok(!/kick/i.test(t), "  → nem manda dar kick");

// &tts destravar
respA.length = 0;
const urlsDestravar = [];
globalThis.fetch = async (url, op) => {
  urlsDestravar.push(String(url));
  return { ok: true, status: 200, json: async () => ({ ok: true, via: "PATCH members remove VoiceChannel",
    passos: [{ metodo: "PATCH", rota: `/servers/S1/members/01JBOTAA00000000000000AAAA`, ok: true, status: 200 }] }) };
};
await tts.cmdTts(msgNaCallReal, ["destravar"], ctxA);
ok(urlsDestravar.some((u) => u.includes("/destravar")), "`&tts destravar` chama o serviço");
ok(String(respA.at(-1)?.description).includes("PATCH"), "  → e mostra o pedido que saiu");

console.log("\n── &tts resgatar ──");
{
  const aux = { id: "01JAUXIL000000000000000AA", name: "Lounge", type: "TextChannel", voice: {}, isVoice: true,
    voiceParticipants: new Map([["01JBOTAA00000000000000AAAA", {}]]) };
  const listeners = [];
  const clientR = {
    user: { id: "01JBOTAA00000000000000AAAA" },
    channels: new Map([[callReal.id, callReal], [aux.id, aux]]),
    servers: new Map([["S1", {}]]),
    events: { on: (_e, f) => listeners.push(f), off: (_e, f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); } },
  };
  const respR = [];
  const cfgR = { language: "pt", tts: { ativo: false, canalVoz: null, canalTexto: null, filtro: true, cooldown: 0 } };
  const ctxR = { ...ctxA, config: cfgR, client: clientR,
    sendEmbed: async (_c, e) => { respR.push(e); return { id: "M" }; },
    getServer: async () => ({ id: "S1", channels: [callReal, aux] }) };
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || "tok";
  const chamadas = [];
  globalThis.fetch = async (url, op) => {
    const u = String(url); const corpo = op?.body ? JSON.parse(op.body) : null;
    chamadas.push({ u, metodo: op?.method, corpo });
    if (u.includes("/members/") && op?.method === "PATCH") {
      // o Stoat manda o token pelo WebSocket, não na resposta do PATCH
      setTimeout(() => listeners.forEach((f) => f({ type: "UserMoveVoiceChannel", node: "eu-west", from: aux.id, to: callReal.id, token: "TOKEN-DO-MOVER" })), 5);
      return { ok: true, status: 200, text: async () => "{}" };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "{}" };
  };
  await tts.cmdTts(msgNaCallReal, ["resgatar"], ctxR);
  const entrouAux = chamadas.find((c) => c.u.endsWith("/entrar"));
  ok(entrouAux?.corpo?.canalVoz === aux.id, "★ resgatar entra primeiro numa call AUXILIAR (outra do servidor)");
  const patch = chamadas.find((c) => c.metodo === "PATCH");
  ok(patch?.corpo?.voice_channel === callReal.id && patch.u.includes("/members/01JBOTAA00000000000000AAAA"),
    "  → depois se MOVE para a call presa pelo PATCH do próprio membro");
  const comToken = chamadas.find((c) => c.u.endsWith("/entrar-com-token"));
  ok(comToken?.corpo?.token === "TOKEN-DO-MOVER" && comToken.corpo.canalVoz === callReal.id && comToken.corpo.node === "eu-west",
    "  → e entrega o token do evento UserMoveVoiceChannel ao serviço");
  ok(listeners.length === 0, "  → e tira o ouvinte do WebSocket ao terminar");
  ok(cfgR.tts.ativo && cfgR.tts.canalVoz === callReal.id, "  → já deixa a leitura ligada na call resgatada");
  ok(/Entrei/.test(String(respR.at(-1)?.title)), `  → e diz que deu certo (${respR.at(-1)?.title})`);
  ok(cfgR.tts.canalTexto === callReal.id, "  → e a leitura passa a ser do canal onde a pessoa digitou");
  const textoR = respR.map((e) => e.description).join(" ");
  ok(!/kick/i.test(textoR), "  → sem mandar dar kick (não resolve: lê a mesma chave)");

  // Sem auxiliar disponível: pede uma em vez de tentar a própria call presa.
  respR.length = 0;
  const ctxS = { ...ctxR, getServer: async () => ({ id: "S1", channels: [callReal] }), client: { ...clientR, channels: new Map([[callReal.id, callReal]]) } };
  await tts.cmdTts(msgNaCallReal, ["resgatar"], ctxS);
  ok(/auxiliar/.test(String(respR.at(-1)?.description)), "sem outra call no servidor, pede a auxiliar");
}

console.log("\n── entrar → resgate automático ──");
{
  const presaB = { id: "01JPRESAB00000000000000AA", name: "Call", type: "TextChannel", voice: {}, isVoice: true, voiceParticipants: new Map() };
  const presaC = { id: "01JPRESAC00000000000000AA", name: "call staff", type: "TextChannel", voice: {}, isVoice: true,
    voiceParticipants: new Map([["U7", {}]]) };   // tem gente → candidata preferida
  const livre = { id: "01JLIVRE000000000000000AA", name: "Call Resenha", type: "TextChannel", voice: {}, isVoice: true,
    voiceParticipants: new Map([["01JBOTAA00000000000000AAAA", {}]]) };
  const listeners = [];
  const clientE = {
    user: { id: "01JBOTAA00000000000000AAAA" },
    channels: new Map([[presaB.id, presaB], [presaC.id, presaC], [livre.id, livre]]),
    servers: new Map([["S1", {}]]),
    events: { on: (_e, f) => listeners.push(f), off: (_e, f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); } },
  };
  const respE = [];
  const cfgE2 = { language: "pt", tts: { ativo: false, canalVoz: null, canalTexto: "01JVELHO000000000000000AA", filtro: true, cooldown: 0 } };
  const ctxE2 = { ...ctxA, config: cfgE2, client: clientE, membroTemPermissao: () => false,   // pessoa comum, sem staff
    sendEmbed: async (_c, e) => { respE.push(e); return { id: "M" }; },
    getServer: async () => ({ id: "S1", channels: [presaB, presaC, livre] }) };
  const chamadasE = [];
  const presas = new Set([presaB.id, presaC.id]);
  globalThis.fetch = async (url, op) => {
    const u = String(url); const corpo = op?.body ? JSON.parse(op.body) : null;
    chamadasE.push({ u, metodo: op?.method, corpo });
    if (u.endsWith("/entrar") && presas.has(corpo?.canalVoz)) {
      return { ok: false, status: 502, json: async () => ({ ok: false, erro: "AlreadyConnected: o Stoat me registra como já estando nesta call" }), text: async () => "" };
    }
    if (u.includes("/members/") && op?.method === "PATCH") {
      setTimeout(() => listeners.forEach((f) => f({ type: "UserMoveVoiceChannel", node: "hel1", from: livre.id, to: presaB.id, token: "TOK" })), 5);
      return { ok: true, status: 200, text: async () => "{}" };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "{}" };
  };
  const msgB = { channelId: presaB.id, authorId: "U9", channel: presaB, author: { username: "Alguém" } };
  await tts.cmdTts(msgB, ["entrar"], ctxE2);
  const entradas = chamadasE.filter((c) => c.u.endsWith("/entrar")).map((c) => c.corpo.canalVoz);
  ok(entradas[0] === presaB.id, "★ entrar tenta a call da pessoa primeiro");
  ok(entradas.includes(presaC.id) && entradas.indexOf(livre.id) > entradas.indexOf(presaC.id),
    "  → presa → tenta a próxima auxiliar; presa também → a seguinte");
  ok(chamadasE.some((c) => c.u.endsWith("/entrar-com-token") && c.corpo.canalVoz === presaB.id && c.corpo.token === "TOK"),
    "  → e entra na call da pessoa com o token do mover");
  ok(/Entrei/.test(String(respE.at(-1)?.title)), `  → sem pedir nada a ninguém (${respE.at(-1)?.title})`);
  ok(String(respE.at(-1)?.description).includes("presa também"), "  → contando que a auxiliar presa foi pulada");
  ok(cfgE2.tts.canalVoz === presaB.id && cfgE2.tts.canalTexto === presaB.id && cfgE2.tts.ativo, "  → e a leitura fica na call da pessoa");
  ok(listeners.length === 0, "  → sem ouvinte sobrando no WebSocket");

  // Erro de digitação COM argumento não vira fala (foi "resgater #Call Resenha")
  respE.length = 0; chamadasE.length = 0;
  await tts.cmdTts(msgB, ["resgater", "<#" + livre.id + ">"], ctxE2);
  ok(/quis dizer/i.test(String(respE.at(-1)?.title)) && !chamadasE.some((c) => c.u.endsWith("/falar")),
    "★ `resgater #call` vira \"você quis dizer resgatar?\", não fala de 20s");
  respE.length = 0; chamadasE.length = 0;
  await tts.cmdTts(msgB, ["entrarr", "agora", "na", "call"], ctxE2);
  ok(chamadasE.some((c) => c.u.endsWith("/falar")), "  → mas uma frase longa com uma palavra parecida continua sendo fala");
}

console.log("\n── ajustes da fala ──");
{
  const respD = [];
  const cfgD = { language: "pt", tts: { ativo: true, canalVoz: "01JCALLR000000000000000AA", canalTexto: "01JCALLR000000000000000AA", filtro: true, cooldown: 0 } };
  const faladas = [];
  globalThis.fetch = async (url, op) => {
    const u = String(url);
    if (u.endsWith("/falar")) faladas.push(JSON.parse(op.body).texto);
    if (u.endsWith("/saude")) return { ok: true, status: 200, json: async () => ({ ok: true, versao: 11, efeitos: ["glados", "radio"], piper: { ok: true, vozAtual: "pt_BR-faber-medium", vozes: ["pt_BR-faber-medium", "pt_BR-dii-medium"] } }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "{}" };
  };
  const ctxD = { ...ctxA, config: cfgD, sendEmbed: async (_c, e) => { respD.push(e); return { id: "M" }; } };
  const msgD = { channelId: callReal.id, authorId: "U1", channel: callReal, author: { username: "Ghieh" } };

  await tts.cmdTts(msgD, ["dicionario", "add", "vish", "vixi"], ctxD);
  ok(cfgD.tts.dicionario?.vish === "vixi", "★ `dicionario add vish vixi` guarda a entrada");
  ok(!faladas.length, "  → e NÃO fala \"dicionario adicionar vish vixi\"");
  ok(abrevMod.expandir("vish que susto", cfgD.tts.dicionario) === "vixi que susto", "  → e a entrada passa a valer na fala");

  respD.length = 0;
  await tts.cmdTts(msgD, ["dicionario"], ctxD);
  ok(String(respD.at(-1)?.description).includes("vish"), "`dicionario` lista o que o servidor tem");

  respD.length = 0;
  await tts.cmdTts(msgD, ["dicionario", "teste", "vish vc n vem hj"], ctxD);
  ok(/vixi você não vem hoje/.test(String(respD.at(-1)?.description)), "`dicionario teste` mostra como sairia falado");

  respD.length = 0;
  await tts.cmdTts(msgD, ["dicionario", "remove", "vish"], ctxD);
  ok(!("vish" in cfgD.tts.dicionario), "`dicionario remove` tira a entrada");

  // Abreviação com espaço nunca casaria (a troca é palavra a palavra).
  respD.length = 0;
  await tts.cmdTts(msgD, ["dicionario", "add", "de", "boa", "tranquilo"], ctxD);
  ok(cfgD.tts.dicionario.de === "boa tranquilo", "a abreviação é a 1ª palavra; o resto é o texto falado");

  // Ver é público; mudar é da equipe.
  const ctxSemStaff = { ...ctxD, membroTemPermissao: () => false };
  respD.length = 0;
  await tts.cmdTts(msgD, ["dicionario"], ctxSemStaff);
  ok(!/Permissão/.test(String(respD.at(-1)?.title)), "ver o dicionário é livre");
  respD.length = 0;
  await tts.cmdTts(msgD, ["dicionario", "add", "x", "y"], ctxSemStaff);
  ok(/Permissão/.test(String(respD.at(-1)?.title)) && !("x" in cfgD.tts.dicionario), "  → mas mudar exige ManageMessages");

  // voz/efeito: as listas vêm do serviço
  respD.length = 0;
  await tts.cmdTts(msgD, ["voz"], ctxD);
  ok(String(respD.at(-1)?.description).includes("pt_BR-dii-medium"), "`voz` lista o que o serviço tem, não uma lista fixa aqui");
  await tts.cmdTts(msgD, ["voz", "pt_BR-dii-medium"], ctxD);
  ok(cfgD.tts.voz === "pt_BR-dii-medium", "  → e trocar a voz funciona");
  respD.length = 0;
  await tts.cmdTts(msgD, ["voz", "inexistente"], ctxD);
  ok(/não tenho essa voz/i.test(String(respD.at(-1)?.title)), "  → voz que não existe é recusada com a lista");
  await tts.cmdTts(msgD, ["efeito", "glados"], ctxD);
  ok(cfgD.tts.efeito === "glados", "`efeito glados` aplica");
  await tts.cmdTts(msgD, ["efeito", "nenhum"], ctxD);
  ok(cfgD.tts.efeito === null, "  → e `efeito nenhum` tira");

  await tts.cmdTts(msgD, ["tom", "1.05"], ctxD);
  ok(cfgD.tts.tom === 1.05, "`tom 1.05` guarda o valor");
  respD.length = 0;
  await tts.cmdTts(msgD, ["tom", "9"], ctxD);
  ok(cfgD.tts.tom === 1.05, "  → e um valor fora da faixa é recusado");

  await tts.cmdTts(msgD, ["cooldown", "5"], ctxD);
  ok(cfgD.tts.cooldown === 5000, "`cooldown 5` vira 5000ms");
  await tts.cmdTts(msgD, ["nomes", "off"], ctxD);
  ok(cfgD.tts.anunciarNome === false, "`nomes off` para de anunciar quem falou");
  await tts.cmdTts(msgD, ["dicionario", "padrao", "off"], ctxD);
  ok(cfgD.tts.expandir === false, "`dicionario padrao off` desliga as embutidas");
}

console.log("\n── destrave por auto-desconexão ──");
const pedidos = [];
globalThis.fetch = async (url, op) => {
  const u = String(url);
  pedidos.push({ url: u, metodo: op?.method, corpo: op?.body ? JSON.parse(op.body) : null });
  if (u.endsWith("/users/@me")) return { ok: true, status: 200, text: async () => '{"_id":"01JBOTAA00000000000000AAAA","username":"Judy"}' };
  return { ok: true, status: 200, text: async () => "{}" };
};
const rDestrave = await voz.forcarSaida("01JCALLR000000000000000AA", "01JSERVER00000000000000AA");
ok(rDestrave.ok === true, "★ o destrave funciona: o bot se remove do canal de voz");
const patch = pedidos.find((p) => p.metodo === "PATCH");
ok(patch && patch.url.includes("/servers/01JSERVER00000000000000AA/members/01JBOTAA00000000000000AAAA"),
  "  → via PATCH no PRÓPRIO membro (é o que dispensa MoveMembers)");
ok(patch?.corpo?.remove?.includes("VoiceChannel"), "  → com remove: [\"VoiceChannel\"]");
ok(pedidos.some((p) => p.url.endsWith("/users/@me")), "  → descobrindo o próprio id antes");

// sem o serverId não dá para tentar — e isso precisa aparecer no relatório
pedidos.length = 0;
const semServidor = await voz.forcarSaida("01JCALLR000000000000000AA", null);
ok(semServidor.ok === false, "sem serverId, não tenta às cegas");
ok(semServidor.passos.some((p) => String(p.erro ?? "").includes("serverId")), "  → e o relatório diz o que faltou");

console.log("\n── id do bot em resposta longa ──");
const perfilLongo = JSON.stringify({
  _id: "01JBOTAA00000000000000AAAA", username: "Judy", discriminator: "0800",
  display_name: "Judy", avatar: { _id: "x".repeat(80), tag: "avatars", size: 12345,
    filename: "avatar-com-nome-bem-comprido.png", content_type: "image/png" },
  badges: 0, status: { text: "cuidando do servidor", presence: "Online" },
  relationship: "None", online: true, bot: { owner: "01JDONO0000000000000000AA" },
});
ok(perfilLongo.length > 160, `o perfil de um bot real passa de 160 caracteres (${perfilLongo.length})`);
const pedidos2 = [];
globalThis.fetch = async (url, op) => {
  const u = String(url);
  pedidos2.push({ url: u, metodo: op?.method, corpo: op?.body ? JSON.parse(op.body) : null });
  if (u.endsWith("/users/@me")) return { ok: true, status: 200, text: async () => perfilLongo };
  return { ok: true, status: 200, text: async () => "{}" };
};
const rLongo = await voz.forcarSaida("01JCALLR000000000000000AA", "01JSERVER00000000000000AA");
ok(rLongo.ok === true, "★ com um perfil longo, o id ainda é descoberto (era o bug do print)");
ok(pedidos2.some((p) => p.metodo === "PATCH" && p.url.includes("01JBOTAA00000000000000AAAA")),
  "  → e o PATCH sai com o id certo");

// procura em vários servidores: a call presa pode ser de outro servidor
pedidos2.length = 0;
globalThis.fetch = async (url, op) => {
  const u = String(url);
  pedidos2.push({ url: u, metodo: op?.method });
  if (u.endsWith("/users/@me")) return { ok: true, status: 200, text: async () => perfilLongo };
  // só o segundo servidor tem a call
  const certo = u.includes("01JSRVB00000000000000000AA");
  return { ok: certo, status: certo ? 200 : 404, text: async () => "{}" };
};
const rVarios = await voz.forcarSaida("01JCALLR000000000000000AA", "01JSRVA00000000000000000AA",
  ["01JSRVA00000000000000000AA", "01JSRVB00000000000000000AA"]);
ok(rVarios.ok === true, "★ procura a call presa em TODOS os servidores conhecidos");

// ── Mover-se de uma call para outra ──
console.log("\n── mover para a call de quem chamou ──");
pedidos2.length = 0;
globalThis.fetch = async (url, op) => {
  const u = String(url);
  pedidos2.push({ url: u, metodo: op?.method, corpo: op?.body ? JSON.parse(op.body) : null });
  if (u.endsWith("/users/@me")) return { ok: true, status: 200, text: async () => perfilLongo };
  return { ok: true, status: 200, text: async () => "{}" };
};
const rMover = await voz.moverPara("01JCALLNOVA00000000000AAA", "01JSERVER00000000000000AA");
ok(rMover.ok === true, "★ mover-se para outra call funciona");
const pm = pedidos2.find((p) => p.metodo === "PATCH");
ok(pm?.corpo?.voice_channel === "01JCALLNOVA00000000000AAA",
  "  → via voice_channel no PRÓPRIO membro (dispensa MoveMembers, como o remove)");
ok(!pm?.corpo?.remove, "  → e sem remover nada: é uma mudança, não uma saída");

console.log("\n── o destrave não pode plantar o problema ──");
const perfil = JSON.stringify({ _id: "01JBOTAA00000000000000AAAA", username: "Judy",
  avatar: { _id: "y".repeat(90), filename: "a.png" }, bot: { owner: "01JDONO0000000000000000AA" } });
const chamadasD = [];
globalThis.fetch = async (url, op) => {
  const u = String(url);
  chamadasD.push({ url: u, metodo: op?.method });
  if (u.endsWith("/users/@me")) return { ok: true, status: 200, text: async () => perfil };
  return { ok: true, status: 200, text: async () => "{}" };
};
const rv = await voz.forcarSaida("01JCALLR000000000000000AA", "01JSERVER00000000000000AA");
ok(rv.ok === true, "o destrave pede a desconexão e relata");
ok(!chamadasD.some((c) => c.url.includes("/join_call")),
  "★ o destrave NUNCA chama join_call (isso criaria a sala e o registro de novo)");

chamadasD.length = 0;
await voz.forcarSaida("01JCALLR000000000000000AA", "01JSRVA00000000000000000AA",
  ["01JSRVA00000000000000000AA", "01JSRVB00000000000000000AA", "01JSRVC00000000000000000AA"]);
const patches = chamadasD.filter((c) => c.metodo === "PATCH");
ok(patches.length === 3, `★ tenta em todos os servidores — 200 não é prova (foram ${patches.length} PATCH, não 1)`);
ok(new Set(patches.map((c) => c.url)).size === 3, "  → um PATCH por servidor, sem repetir");

console.log("\n── UnknownNode (call vazia) ──");
const vistas = [];
globalThis.fetch = async (url, op) => {
  const u = String(url);
  vistas.push({ url: u, metodo: op?.method, corpo: op?.body ? JSON.parse(op.body) : null });
  if (u.match(/\/$/) || u.endsWith("api.stoat.invalido")) {
    return { ok: true, status: 200, text: async () => "{}",
      json: async () => ({ features: { livekit: { enabled: true, nodes: [
        { name: "eu-west", lat: 50, lon: 3, public_url: "wss://lk1" },
        { name: "us-east", lat: 40, lon: -74, public_url: "wss://lk2" }] } } }) };
  }
  if (u.endsWith("/users/@me")) return { ok: true, status: 200, text: async () => perfil };
  if (u.includes("/join_call")) return { ok: true, status: 200,
    text: async () => '{"token":"t","url":"wss://lk1"}', json: async () => ({ token: "t", url: "wss://lk1" }) };
  return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
};
const nodeEscolhido = await voz.nodePreferido();
ok(nodeEscolhido === "eu-west", `★ descobre os nodes de voz pelo GET / da API (${nodeEscolhido})`);

vistas.length = 0;
const d2 = await voz.diagnosticar("01JCALLR000000000000000AA");
const etapaNode = d2.etapas.find((e) => e.etapa === "node");
ok(etapaNode?.ok === true, "o diagnóstico mostra qual node vai usar");
const jcTeste = vistas.find((v) => v.url.includes("/join_call"));
ok(jcTeste?.corpo?.node === "eu-west",
  "★ e manda o node no join_call — sem isso, uma call que não começou acusa UnknownNode à toa");

console.log("\n── serviço: AlreadyConnected na hora ──");
{
  const pedidos = [];
  globalThis.fetch = async (url, op) => {
    const u = String(url); pedidos.push({ u, metodo: op?.method });
    if (u.endsWith("/")) return { ok: true, status: 200, text: async () => "{}", json: async () => ({ features: { livekit: { nodes: [{ name: "hel1", public_url: "wss://hel1" }] } } }) };
    if (u.includes("join_call")) return { ok: false, status: 400, text: async () => '{"type":"AlreadyConnected"}', json: async () => ({ type: "AlreadyConnected" }) };
    if (u.includes("/users/@me")) return { ok: true, status: 200, text: async () => '{"_id":"01JBOTAA00000000000000AAAA"}', json: async () => ({ _id: "01JBOTAA00000000000000AAAA" }) };
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
  };
  const t0 = Date.now();
  const r = await voz.entrar("01JPRESAB00000000000000AA", "01JSERVER00000000000000AA", ["01JSERVER00000000000000AA"]);
  const dt = Date.now() - t0;
  ok(r.ok === false && /AlreadyConnected/.test(String(r.erro)), `★ a entrada devolve AlreadyConnected pelo nome (${r.erro})`);
  ok(dt < 5000, `  → e na hora, sem os 20s do revoice (${dt}ms)`);
  const d = voz.diagnosticar ? await voz.diagnosticar("01JPRESAB00000000000000AA") : null;
  ok(!d || d.marcos?.some?.((m) => /sala-recusou\(AlreadyConnected\)/.test(m.nome)) || JSON.stringify(d).includes("sala-recusou"),
    "  → o marco diz que foi a abertura da sala que recusou");
}

console.log(`\nTTS: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
