// Simulador do automod: conversas perigosas, tentativas de burla e conversa
// normal, com a nota que cada uma recebe.
//
//   node scripts/simular-automod.mjs            → relatório no terminal
//   node scripts/simular-automod.mjs --md       → o mesmo, em Markdown
//
// Não conecta em nada: roda as MESMAS funções que o automod usa ao vivo
// (`analisarConteudo`, `analisarCaracteres`, `digital`) sobre textos fixos.
// Serve para medir antes de mexer: toda mudança no sentinela deve rodar isto
// de novo e comparar as notas.

import { analisarConteudo } from "../modulos/moderacao/scorecard.js";
import { analisarCaracteres } from "../modulos/moderacao/caracteres.js";
import { registrarDano, esquecerSinais } from "../modulos/moderacao/confianca.js";

const LIMIAR = 6;          // sensibilidade "media" (o padrão)
const ALERTA = 4;          // a partir daqui o sentinela avisa a staff

// Cada caso: [grupo, rótulo, texto, esperado]
//   esperado: "bloquear" | "alertar" | "passar"
export const CASOS = [
  // ── A. O conteúdo perigoso, escrito "normalmente" ───────────────────────
  ["base", "golpe de investimento", "ganhe dinheiro fácil com investimento garantido, chama no whats agora", "bloquear"],
  ["base", "nitro grátis + link", "free nitro aqui, clique aqui https://bit.ly/nitro-free", "bloquear"],
  ["base", "venda de +18", "vendo pack de nudes, chama no pv, pix", "bloquear"],
  ["base", "gore com link", "video de morte sem censura, conteúdo chocante https://gofile.io/d/abc", "bloquear"],
  ["base", "mula de conta", "preciso de alguém com conta no banco pra receber um pix, divido o lucro 50%", "bloquear"],

  // ── B. O MESMO conteúdo, disfarçado ─────────────────────────────────────
  ["burla", "leetspeak", "g4nh3 d1nh31r0 f4c1l c0m 1nv3st1m3nt0 g4r4nt1d0, ch4m4 n0 wh4ts", "bloquear"],
  ["burla", "letras espaçadas", "g a n h e  d i n h e i r o  f á c i l, chama no whats", "bloquear"],
  ["burla", "pontos entre letras", "g.a.n.h.e d.i.n.h.e.i.r.o f.á.c.i.l, chama no w.h.a.t.s", "bloquear"],
  ["burla", "caractere invisível", "gan\u200Bhe dinhei\u200Bro fácil com inves\u200Btimento garantido, chama no wha\u200Bts", "bloquear"],
  ["burla", "letras cirílicas", "gаnhe dinheirо fácil cоm investimentо gаrаntidо, chаmа nо whаts", "bloquear"],
  ["burla", "letras 'fancy'", "𝐠𝐚𝐧𝐡𝐞 𝐝𝐢𝐧𝐡𝐞𝐢𝐫𝐨 𝐟𝐚́𝐜𝐢𝐥 𝐜𝐨𝐦 𝐢𝐧𝐯𝐞𝐬𝐭𝐢𝐦𝐞𝐧𝐭𝐨, 𝐜𝐡𝐚𝐦𝐚 𝐧𝐨 𝐰𝐡𝐚𝐭𝐬", "bloquear"],
  ["burla", "link com [.]", "nitro grátis aqui: bit[.]ly/nitro-free", "bloquear"],
  ["burla", "link com espaço", "nitro grátis aqui: bit . ly / nitro-free", "bloquear"],
  ["burla", "link mascarado", "olha que legal [meu perfil](https://bit.ly/nitro-free) free nitro", "bloquear"],
  ["burla", "nudes com pontuação", "vendo p.a.c.k de n.u.d.e.s, chama no p.v", "bloquear"],

  // ── C. Recrutamento para comunidade de dano ─────────────────────────────
  // O caso real: alguém que chega, divulga outra comunidade, fala de desafios
  // "no extremo", de gente se cortando e de humilhar os outros. Cada frase
  // sozinha parece conversa; o padrão é o que importa.
  ["dano", "divulga outra comunidade", "https://stt.gg/319sds85", "passar"],
  ["dano", "fala de se cortar", "tipo essas putaria de ficar se cortando prozoto não", "passar"],
  ["dano", "gosta de ver humilhação", "mas sempre e bom ver um imbecil passando vergonha", "passar"],
  ["dano", "desafio no extremo", "aqls q pede desafio e fica fazendo as coisa no extremo", "alertar"],
  ["dano", "manda desafio humilhante", "mande desafio eu vou mandar ele comer merda", "alertar"],
  ["dano", "desafio de se cortar", "manda desafio pra ela se cortar e mandar foto", "bloquear"],
  ["dano", "doxxing", "tenho o endereço e o cpf dele, vou vazar tudo no grupo", "bloquear"],
  ["dano", "extorsão", "se não fizer o que eu mandar vou vazar suas fotos pra todo mundo", "bloquear"],

  // ── D. Conversa normal — NADA disto pode ser punido ─────────────────────
  ["normal", "bom dia", "bom dia a todos. ontem fiquei feliz", "passar"],
  ["normal", "desafio de jogo", "te desafio numa partida de xadrez hoje à noite", "passar"],
  ["normal", "alertando golpe", "cuidado gente, tão mandando golpe de nitro grátis, não cliquem", "passar"],
  ["normal", "pedindo ajuda", "tô mal, às vezes penso em me cortar, alguém pode conversar comigo?", "passar"],
  ["normal", "falando de investimento", "alguém entende de investimento? queria começar a guardar dinheiro", "passar"],
  ["normal", "link de vídeo", "olha esse vídeo https://youtube.com/watch?v=abc", "passar"],
  ["normal", "caps de empolgação", "GANHEI O CAMPEONATO", "passar"],
];


// ─── Conversas inteiras: o padrão que nenhuma frase sozinha mostra ─────────
// [rótulo, esperado ("alertar"|"passar"), mensagens da MESMA pessoa, minutos entre elas]
export const CONVERSAS = [
  ["o caso real (recrutador de comunidade de dano)", "alertar", [
    "opa povo", "https://stt.gg/319sds85", "c sabe de alguma outra comunidade BR?",
    "tava querendo achar uma mais da. zuera", "tipo panelinha", "Discord foi banido",
    "depende boy", "tipo essas putaria de ficar se cortando prozoto não",
    "mas sempre e bom ver um imbecil passando vergonha", "aqls q pede desafio",
    "e fica fazendo as coisa no. extremo", "tipo o cara deixa lá", "mande desafio",
    "eu vou mandar ele comer merda", "OS DOENTES MENTAIS",
  ], 25],
  ["alguém pedindo ajuda (NÃO pode virar suspeito)", "passar", [
    "oi gente", "tô meio mal esses dias", "às vezes penso em me cortar",
    "já me cortei antes e não queria voltar a isso", "alguém pode conversar comigo?",
    "obrigado por me ouvirem",
  ], 10],
  ["gamers se desafiando", "passar", [
    "te desafio no xadrez hoje", "aceito o desafio", "perdeu kkk passou vergonha",
    "revanche amanhã", "desafio aceito de novo", "dessa vez eu ganho",
  ], 15],
  ["discussão acalorada, sem padrão de dano", "passar", [
    "vc tá falando besteira", "que imbecil essa opinião", "nada a ver cara",
    "vou nem responder", "tanto faz",
  ], 5],
];

export function simularConversa(msgs, minutos) {
  const uid = `sim-${Math.random().toString(36).slice(2)}`;
  let t = Date.now(), resultado = { alertar: false }, soma = 0, categorias = [];
  for (const m of msgs) {
    const r = analisarConteudo(m, { rate: 1, repetidas: 1 });
    const p = registrarDano("sim", uid, r.dano, m, t);
    if (p.soma != null) { soma = p.soma; categorias = p.categorias ?? categorias; }
    if (p.alertar) { resultado = p; soma = p.soma; categorias = p.categorias; }
    t += minutos * 60_000;
  }
  esquecerSinais("sim", uid);
  return { alertou: resultado.alertar, soma, categorias };
}

export function avaliar(texto) {
  const r = analisarConteudo(texto, { rate: 1, repetidas: 1 });
  const car = analisarCaracteres(texto);
  const veredito = r.nota >= LIMIAR || r.grave ? "bloquear" : r.nota >= ALERTA ? "alertar" : "passar";
  return { nota: r.nota, grave: r.grave, sinais: r.sinais, caracteres: car?.motivo ?? null, veredito };
}

// Um veredito só é FALHA quando erra para o lado errado:
//   perigoso que passou (brecha)  ·  normal que foi bloqueado (falso positivo)
// Alertar em vez de bloquear, ou o contrário, é imprecisão, não falha grave.
export function classificar(esperado, obtido) {
  if (esperado === obtido) return "ok";
  if (esperado !== "passar" && obtido === "passar") return "BRECHA";
  if (esperado === "passar" && obtido === "bloquear") return "FALSO POSITIVO";
  return "impreciso";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const md = process.argv.includes("--md");
  const linhas = [];
  const cont = { ok: 0, BRECHA: 0, "FALSO POSITIVO": 0, impreciso: 0 };
  for (const [grupo, rotulo, texto, esperado] of CASOS) {
    const a = avaliar(texto);
    const c = classificar(esperado, a.veredito);
    cont[c]++;
    linhas.push({ grupo, rotulo, nota: a.nota.toFixed(1), esperado, obtido: a.veredito, c, sinais: a.sinais.join(" ") });
  }
  if (md) {
    console.log("| Grupo | Caso | Nota | Esperado | Obtido | Resultado | Sinais |");
    console.log("|---|---|---|---|---|---|---|");
    for (const l of linhas) {
      console.log(`| ${l.grupo} | ${l.rotulo} | ${l.nota} | ${l.esperado} | ${l.obtido} | ${l.c === "ok" ? "✅" : l.c === "impreciso" ? "🟡 impreciso" : "❌ " + l.c} | ${l.sinais || "—"} |`);
    }
  } else {
    for (const l of linhas) {
      const marca = l.c === "ok" ? "✅" : l.c === "impreciso" ? "🟡" : "❌";
      console.log(`${marca} ${l.nota.padStart(4)}  ${l.grupo.padEnd(6)} ${l.rotulo.padEnd(28)} esperado=${l.esperado.padEnd(8)} obtido=${l.obtido.padEnd(8)} ${l.c !== "ok" ? l.c : ""}`);
    }
  }
  console.log(`\n${cont.ok} ok · ${cont.BRECHA} brecha(s) · ${cont["FALSO POSITIVO"]} falso(s) positivo(s) · ${cont.impreciso} impreciso(s)`);

  console.log("\n── conversas inteiras (padrão acumulado por pessoa) ──");
  for (const [rotulo, esperado, msgs, min] of CONVERSAS) {
    const r = simularConversa(msgs, min);
    const obtido = r.alertou ? "alertar" : "passar";
    const ok = obtido === esperado;
    console.log(`${ok ? "✅" : "❌"} soma ${r.soma.toFixed(1).padStart(4)}  ${rotulo.padEnd(48)} esperado=${esperado.padEnd(7)} obtido=${obtido}  [${r.categorias.join(", ")}]`);
  }
}
