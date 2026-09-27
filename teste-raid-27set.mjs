// O raid de 27/09/2026, reproduzido com os IDs, horários e frases do log real.
//
// O que aconteceu: 7 contas criadas 2–7 min antes de entrar, uma a cada ban,
// pulando entre 3 servidores onde a Judy estava. Injúria racial, suásticas em
// massa, "estuprar e matar". Tudo passou pelo sentinela; o anti-duplicata
// pegou as suásticas, mas o silêncio FALHOU (faltava AssignRoles) e o autor
// seguiu postando. De madrugada, o watchdog ainda reiniciou o bot 8 vezes,
// zerando a memória do automod.

import assert from "node:assert";
import { analisarConteudo } from "./modulos/moderacao/scorecard.js";
import * as confianca from "./modulos/moderacao/confianca.js";
import { vigiarConexao } from "./modulos/core/vida.js";

let ok = 0, falhou = 0;
const t = (nome, fn) => {
  try { fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};
const T = (iso) => Date.parse(iso);
const SRV = "01KZKFDGS0SANQEN4CJZ6MAN42";

// Limiar do sentinela para esta conta, neste instante (base = sensibilidade media)
const limiar = (userId, quando) => confianca.limiarPara(SRV, userId, 6, { agora: quando }).limiar;
const pune = (texto, userId, quando) => {
  const r = analisarConteudo(texto, { rate: 1, repetidas: 1 });
  return { nota: r.nota, limiar: limiar(userId, quando), bloqueia: r.nota >= limiar(userId, quando) };
};

console.log("\n── as frases do raid, com o autor e o horário reais ──");
const RAID = [
  ["01M3BE5EPYKQY1J6RJ9VD8J1EP", "2026-09-27T02:33:30Z", "bando de negrinho mesmo"],
  ["01M3BE5EPYKQY1J6RJ9VD8J1EP", "2026-09-27T02:33:47Z", "tem q voltar pra senzala um povo desse"],
  ["01M3GBJR3H29DE1EEBREZPG8AA", "2026-09-27T02:39:47Z", "se da negroide msm"],
  ["01M3GBJR3H29DE1EEBREZPG8AA", "2026-09-27T02:40:17Z", "vsf negros"],
  ["01M3GCETEYEBC1KT3DPTK8PAT9", "2026-09-27T02:55:34Z", "Bando de negro filha da puta msm"],
  ["01M3GBZ82MYV8MGW8F5M5WRG0S", "2026-09-27T02:59:20Z", "calom filhos da puta"],
  ["01M3GBZ82MYV8MGW8F5M5WRG0S", "2026-09-27T02:59:24Z", "ciganos de merda"],
  ["01M3GBZ82MYV8MGW8F5M5WRG0S", "2026-09-27T03:00:02Z", "vc é um ciganinho né?"],
  ["01M3BE5EPYKQY1J6RJ9VD8J1EP", "2026-09-27T03:13:01Z", "卐 卐 卐 卐 卐 卐 卐卐 卐 卐 卐 卐 卐 卐卐 卐 卐 卐"],
  ["01M3BE5EPYKQY1J6RJ9VD8J1EP", "2026-09-27T03:13:06Z", "ESTRUPAR E MATAR"],
  ["01M3GBJR3H29DE1EEBREZPG8AA", "2026-09-27T03:14:42Z", "vai se fuder viadinho"],
];
for (const [u, q, txt] of RAID) {
  t(`bloqueia: ${JSON.stringify(txt.slice(0, 40))}`, () => {
    const r = pune(txt, u, T(q));
    assert.ok(r.bloqueia, `nota ${r.nota} < limiar ${r.limiar}`);
  });
}

console.log("\n── quem NÃO pode ser punido (mesma madrugada) ──");
// 01M3FXT8…: conta criada às 22:36 da véspera (4h de vida) — ganha o rigor de
// conta nova, e mesmo assim nada do que escreveu é ódio.
const NORMAL = [
  ["01M3FXT8RJ09NEWW25HRZMPVBA", "2026-09-27T02:40:22Z", "Alguém call?"],
  ["01M3FXT8RJ09NEWW25HRZMPVBA", "2026-09-27T02:38:37Z", "Tenho nd pra fzr"],
  ["01M3FXT8RJ09NEWW25HRZMPVBA", "2026-09-27T03:17:29Z", "Eu tava num grupo aqui no status e do nada o cara manda fig paia de um"],
  ["01M3FXT8RJ09NEWW25HRZMPVBA", "2026-09-27T03:17:43Z", "Sai com trauma"],
  ["01M3FXT8RJ09NEWW25HRZMPVBA", "2026-09-27T03:38:42Z", "Guys vou dormir"],
  ["01KZE9V8CGHSBM2XZJ3QX07JSG", "2026-09-27T05:40:00Z", "um grupo de racistas e preconceituosos fizeram baderna"],
  ["01KZE9V8CGHSBM2XZJ3QX07JSG", "2026-09-27T05:40:00Z", "a população negra no brasil sofre com desigualdade"],
  ["01KZE9V8CGHSBM2XZJ3QX07JSG", "2026-09-27T05:40:00Z", "os ciganos têm uma cultura muito rica"],
  ["01KZE9V8CGHSBM2XZJ3QX07JSG", "2026-09-27T05:40:00Z", "o caso de estupro saiu no jornal hoje"],
  ["01KZE9V8CGHSBM2XZJ3QX07JSG", "2026-09-27T05:40:00Z", "fui num templo budista, tinha um 卍 na porta"],
  ["01KZE9V8CGHSBM2XZJ3QX07JSG", "2026-09-27T05:40:00Z", "sou gay e tenho orgulho"],
  ["01KZE9V8CGHSBM2XZJ3QX07JSG", "2026-09-27T05:40:00Z", "vou te matar kkkk perdeu a aposta"],
];
for (const [u, q, txt] of NORMAL) {
  t(`passa: ${JSON.stringify(txt.slice(0, 44))}`, () => {
    const r = pune(txt, u, T(q));
    assert.ok(!r.bloqueia, `nota ${r.nota} ≥ limiar ${r.limiar} — falso positivo`);
  });
}

console.log("\n── idade da conta, direto do ID ──");
t("01M3GBJR… foi criada 2 min antes de entrar (bate com o log)", () => {
  const min = confianca.idadeDaConta("01M3GBJR3H29DE1EEBREZPG8AA", T("2026-09-27T02:39:37Z")) / 60000;
  assert.ok(min > 1 && min < 3, `${min} min`);
});
t("conta criada agora tem o limiar no piso (3.5)", () =>
  assert.equal(limiar("01M3GBJR3H29DE1EEBREZPG8AA", T("2026-09-27T02:40:00Z")), 3.5));
t("conta de meses NÃO ganha rigor extra por idade", () =>
  assert.ok(limiar("01KZE9V8CGHSBM2XZJ3QX07JSG", T("2026-09-27T02:40:00Z")) >= 4.5));
t("ID inválido não quebra nada", () => assert.equal(confianca.idadeDaConta("nao-e-id"), null));

console.log("\n── a onda de contas novas ──");
const ONDA = "01SRVONDA0000000000000000";
const joins = [
  ["01M3GBJR3H29DE1EEBREZPG8AA", "2026-09-27T02:39:37Z"],
  ["01KPV6WTW40MNWHHTJBAXFHK4P", "2026-09-27T02:45:00Z"],   // conta de abril: não conta
  ["01M3GBZ82MYV8MGW8F5M5WRG0S", "2026-09-27T02:47:08Z"],
  ["01M3GCETEYEBC1KT3DPTK8PAT9", "2026-09-27T02:55:19Z"],
  ["01M3GCGFX8NQZYZ3V303NAHZYD", "2026-09-27T02:57:51Z"],
];
const res = joins.map(([u, q]) => confianca.registrarEntrada(ONDA, u, T(q)));
t("conta antiga entrando não conta para a onda", () => assert.equal(res[1].raid, false));
t("3 contas novas em 15 min liga a proteção (na 4ª entrada, às 02:57)", () => {
  assert.equal(res[3].raid, false, "02:39 já saiu da janela às 02:55 — só 2 na conta");
  assert.equal(res[4].raid, true);
  assert.equal(res[4].iniciou, true, "tem de avisar a staff UMA vez");
});
t("o aviso não se repete enquanto a proteção dura", () => {
  const r = confianca.registrarEntrada(ONDA, "01M3GDY4M1VC3QG923CCGGAMVN", T("2026-09-27T03:05:00Z"));
  assert.equal(r.raid, true); assert.equal(r.iniciou, false);
});
t("a proteção expira sozinha (30 min)", () =>
  assert.equal(confianca.emModoRaid(ONDA, T("2026-09-27T04:00:00Z")), false));
t("na onda, conta de < 7 dias também ganha rigor", () => {
  // 01M3BE5E… foi criada 2 dias antes
  assert.equal(confianca.contaNova(ONDA, "01M3BE5EPYKQY1J6RJ9VD8J1EP", T("2026-09-27T03:00:00Z")), true);
  assert.equal(confianca.contaNova("01OUTRO000000000000000000", "01M3BE5EPYKQY1J6RJ9VD8J1EP", T("2026-09-27T03:00:00Z")), false);
});

console.log("\n── quarentena quando a punição falha ──");
t("quem não pôde ser silenciado fica em quarentena por 30 min", () => {
  const q0 = T("2026-09-27T03:13:36Z");
  confianca.quarentenar(SRV, "01M3GBJR3H29DE1EEBREZPG8AA", q0);
  assert.equal(confianca.emQuarentena(SRV, "01M3GBJR3H29DE1EEBREZPG8AA", q0 + 60_000), true);
  assert.equal(confianca.emQuarentena(SRV, "01M3GBJR3H29DE1EEBREZPG8AA", q0 + 31 * 60_000), false);
  assert.equal(confianca.emQuarentena("01OUTROSRV00000000000000000", "01M3GBJR3H29DE1EEBREZPG8AA", q0 + 60_000), false);
});

console.log("\n── o watchdog mede a conexão, não o chat ──");
t("o Pong do heartbeat conta como sinal de vida", () => {
  let sinais = 0; const recebidos = [];
  const eventos = { handle(f) { recebidos.push(f.type); } };
  vigiarConexao(eventos, () => sinais++);
  eventos.handle({ type: "Pong", data: 1 });
  eventos.handle({ type: "Message" });
  assert.equal(sinais, 2);
  assert.deepEqual(recebidos, ["Pong", "Message"], "o frame tem de continuar chegando ao stoat.js");
});
t("vigiar duas vezes não duplica, e um erro no vigia não derruba a conexão", () => {
  let sinais = 0; let chegou = 0;
  const eventos = { handle() { chegou++; } };
  vigiarConexao(eventos, () => { sinais++; throw new Error("x"); });
  assert.equal(vigiarConexao(eventos, () => sinais++), false);
  eventos.handle({ type: "Pong" });
  assert.equal(chegou, 1); assert.equal(sinais, 1);
});

console.log(`\nRAID 27/09: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
