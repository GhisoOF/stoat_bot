// &entretenimento — a família das brincadeiras (pedido de Ghieh, 12 out 2026).
//
//   ship      quanto duas pessoas (ou coisas) combinam — sempre o MESMO % para
//             o mesmo par, em qualquer ordem: dá para discutir, não para rolar
//             de novo até sair 100%
//   briga     quem ganha numa briga: rodadas narradas, com crítico e erro
//   cowsay    um bicho em ASCII falando (ou pensando) o seu texto
//   bola8     a bola mágica responde sim/não
//   escolher  escolhe uma entre as opções
//   nota      nota de 0 a 10 para qualquer coisa (fixa, como o ship)
//   sorte     a sorte do dia — muda à meia-noite (UTC), igual o dia todo
//   zoeira    tExTo De ZoEiRa
//   inverter  o texto de trás para frente
//   campominado  campo minado em spoilers (P7, 20 out 2026 — ver jogos.js)
//   velha     jogo da velha por reação, contra alguém ou contra a Judy
//
// Os subcomandos só existem DENTRO da família (regra da árvore de comandos):
// `&ship` responde "você quis dizer `&entretenimento ship`?".
// Nada aqui menciona ninguém: os nomes saem em texto (sem ping em massa), e
// menções dentro do texto viram @nome antes de qualquer transformação.

import { lingua, idiomaDe, tr } from "../core/i18n.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import * as jogos from "./jogos.js";

// ── Utilidades puras ────────────────────────────────────────────────────────
// FNV-1a de 32 bits: barato, estável entre versões do Node, bom o bastante
// para espalhar pares de IDs por 0–100.
export function hash32(texto) {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(String(texto), "utf8")) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const normalizar = (t) => String(t ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// nome que vai para o embed: sem markdown que quebre a formatação, uma linha só
const nomeSeguro = (t) => String(t ?? "").replace(/[*_~`|\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) || "?";
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const idDaMencao = (t) => {
  const s = String(t ?? "").trim();
  const m = s.match(/^<@!?([0-9A-HJKMNP-TV-Z]{26})>$/i) ?? s.match(/(?:\/user\/|\/@)([0-9A-HJKMNP-TV-Z]{26})/i);
  if (m) return m[1].toUpperCase();
  return ULID.test(s) ? s.toUpperCase() : null;
};
const rngPadrao = () => Math.random();
const sortear = (lista, rng = rngPadrao) => lista[Math.floor(rng() * lista.length) % lista.length];
const barra = (valor, max, cheio, vazio, n = 10) => {
  const k = Math.max(0, Math.min(n, Math.round((valor / max) * n)));
  return cheio.repeat(k) + vazio.repeat(n - k);
};

// Separa "A e B", "A x B", "A | B", "A vs B" (ou dois termos soltos) em itens.
export function separarDois(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return [];
  for (const sep of [/\s*\|\s*/, /\s+(?:x|vs\.?|versus|contra)\s+/i, /\s+(?:e|and|&)\s+/i]) {
    const partes = t.split(sep).map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 2) return partes.slice(0, 2);
  }
  const tokens = t.split(/\s+/);
  if (tokens.length <= 2) return tokens;
  // várias palavras sem separador: só dá para separar se forem menções
  const mencoes = tokens.filter((x) => idDaMencao(x));
  if (mencoes.length >= 2) return mencoes.slice(0, 2);
  if (mencoes.length === 1) return [mencoes[0], tokens.filter((x) => x !== mencoes[0]).join(" ")];
  return [t];   // uma coisa só, com espaços ("Darth Vader")
}

// Opções do `escolher`: "a | b | c", "a, b ou c", "a or b".
export function separarOpcoes(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return [];
  const sep = t.includes("|") ? /\s*\|\s*/ : /\s*,\s*|\s+(?:ou|or)\s+/i;
  const vistas = new Set(), saida = [];
  for (const p of t.split(sep).map((x) => x.trim()).filter(Boolean)) {
    const k = normalizar(p);
    if (!vistas.has(k)) { vistas.add(k); saida.push(p.slice(0, 100)); }
  }
  return saida.slice(0, 20);
}

// ── Ship ────────────────────────────────────────────────────────────────────
// `chave` identifica o item (id de usuário ou texto normalizado); a ordem não
// importa: A×B = B×A.
export function porcentagemShip(chaveA, chaveB) {
  if (chaveA === chaveB) return 100;
  const [x, y] = [chaveA, chaveB].sort();
  return hash32(`ship:${x}:${y}`) % 101;
}

// "Ana" + "Bruno" → "Anuno": a primeira metade de um, a segunda do outro.
export function nomeDoCasal(a, b) {
  const limpo = (t) => Array.from(String(t ?? "").replace(/[^\p{L}\p{N}]/gu, ""));
  const x = limpo(a), y = limpo(b);
  if (!x.length || !y.length) return [...x, ...y].join("") || "?";
  const parte = x.slice(0, Math.ceil(x.length / 2)).join("") + y.slice(Math.floor(y.length / 2)).join("");
  return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase();
}

const VEREDITOS_SHIP = [
  { ate: 10,  pt: "Nem com reza braba. Melhor cada um no seu canto.", en: "Not even with prayers. Better stay in separate corners.", es: "Ni rezando. Mejor cada uno en su rincón." },
  { ate: 30,  pt: "Amizade colorida? Só se for em preto e branco.", en: "Friends at best — and even that's a stretch.", es: "Amigos, como mucho — y ya es mucho decir." },
  { ate: 50,  pt: "Tem uma faísca… pequena. Bem pequena.", en: "There's a spark… a small one. A very small one.", es: "Hay una chispa… pequeña. Muy pequeña." },
  { ate: 70,  pt: "Dá jogo! Falta só alguém tomar a iniciativa.", en: "This could work! Someone just has to make the first move.", es: "¡Esto puede funcionar! Solo falta que alguien dé el primer paso." },
  { ate: 90,  pt: "Química forte. Já dá para escolher o nome do pet.", en: "Strong chemistry. Time to pick a name for the pet.", es: "Química fuerte. Ya pueden elegir el nombre de la mascota." },
  { ate: 99,  pt: "Casal do ano. O servidor inteiro já sabia.", en: "Couple of the year. The whole server already knew.", es: "La pareja del año. Todo el servidor ya lo sabía." },
  { ate: 100, pt: "Almas gêmeas. Os astros se alinharam.", en: "Soulmates. The stars have aligned.", es: "Almas gemelas. Los astros se alinearon." },
];
// `en`: true (inglês), false (português) ou "es" (espanhol, já pronto para a tela)
export const vereditoShip = (pct, en = false) => {
  const v = VEREDITOS_SHIP.find((x) => pct <= x.ate) ?? VEREDITOS_SHIP.at(-1);
  if (en === "es") return trechoPronto(v.es);
  return en ? v.en : v.pt;
};

// ── Briga ───────────────────────────────────────────────────────────────────
const GOLPES = [
  { pt: "{a} acerta um soco no queixo de {d}", en: "{a} lands a punch on {d}'s chin", es: "{a} le da un puñetazo en la barbilla a {d}" },
  { pt: "{a} dá uma voadora em {d}", en: "{a} hits {d} with a flying kick", es: "{a} le lanza una patada voladora a {d}" },
  { pt: "{a} aplica uma rasteira em {d}", en: "{a} sweeps {d} off their feet", es: "{a} le hace una zancadilla a {d}" },
  { pt: "{a} arremessa uma cadeira de plástico em {d}", en: "{a} throws a plastic chair at {d}", es: "{a} le tira una silla de plástico a {d}" },
  { pt: "{a} acerta {d} com o chinelo voador da mãe", en: "{a} nails {d} with mom's flying slipper", es: "{a} le da a {d} con la chancla voladora de mamá" },
  { pt: "{a} encaixa um mata-leão em {d}", en: "{a} locks {d} in a chokehold", es: "{a} le hace un mataleón a {d}" },
  { pt: "{a} bate em {d} com um livro de 600 páginas", en: "{a} smacks {d} with a 600-page book", es: "{a} golpea a {d} con un libro de 600 páginas" },
  { pt: "{a} solta um golpe de capoeira em {d}", en: "{a} pulls a capoeira move on {d}", es: "{a} le suelta un golpe de capoeira a {d}" },
  { pt: "{a} dá uma cabeçada em {d}", en: "{a} headbutts {d}", es: "{a} le da un cabezazo a {d}" },
  { pt: "{a} joga um teclado mecânico em {d}", en: "{a} throws a mechanical keyboard at {d}", es: "{a} le tira un teclado mecánico a {d}" },
  { pt: "{a} faz {d} pisar numa peça de Lego", en: "{a} makes {d} step on a Lego brick", es: "{a} hace que {d} pise una pieza de Lego" },
  { pt: "{a} acerta {d} com uma frigideira", en: "{a} bonks {d} with a frying pan", es: "{a} le da a {d} con una sartén" },
];
const ERROS = [
  { pt: "{a} tenta um chute giratório e cai sozinho", en: "{a} tries a spinning kick and falls over", es: "{a} intenta una patada giratoria y se cae solo" },
  { pt: "{d} desvia de {a} em câmera lenta", en: "{d} dodges {a} in slow motion", es: "{d} esquiva a {a} a cámara lenta" },
  { pt: "{a} erra o soco e acerta a parede", en: "{a} misses and punches the wall", es: "{a} falla el puñetazo y le da a la pared" },
  { pt: "{a} para no meio do golpe para ver o celular", en: "{a} stops mid-attack to check their phone", es: "{a} se para a mitad del golpe para mirar el móvil" },
  { pt: "{d} se esconde atrás do sofá e {a} não acha", en: "{d} hides behind the couch and {a} can't find them", es: "{d} se esconde detrás del sofá y {a} no lo encuentra" },
];

// rng injetável → testes determinísticos. Devolve as rodadas e quem venceu.
export function simularBriga(nomeA, nomeB, rng = rngPadrao, { maxRodadas = 8 } = {}) {
  const hp = [100, 100];
  const rodadas = [];
  let vez = rng() < 0.5 ? 0 : 1;
  for (let i = 0; i < maxRodadas && hp[0] > 0 && hp[1] > 0; i++) {
    const a = vez, d = 1 - vez;
    const sorteio = rng();
    let tipo = "acerto", dano = 10 + Math.floor(rng() * 26);   // 10–35
    let molde;
    if (sorteio < 0.15) { tipo = "erro"; dano = 0; molde = ERROS[Math.floor(rng() * ERROS.length) % ERROS.length]; }
    else {
      if (sorteio > 0.88) { tipo = "critico"; dano *= 2; }
      molde = GOLPES[Math.floor(rng() * GOLPES.length) % GOLPES.length];
    }
    hp[d] = Math.max(0, hp[d] - dano);
    rodadas.push({ atacante: a, defensor: d, tipo, dano, molde, hp: [...hp] });
    vez = d;
  }
  let vencedor;
  if (hp[0] !== hp[1]) vencedor = hp[0] > hp[1] ? 0 : 1;
  else vencedor = rng() < 0.5 ? 0 : 1;   // empate técnico: decide no cara ou coroa
  return { rodadas, hp, vencedor, nocaute: hp[0] === 0 || hp[1] === 0, nomes: [nomeA, nomeB] };
}

export function narrarRodada(r, nomes, en = false) {
  if (en === "es") {
    const t = r.molde.es.replace("{a}", `**${nomes[r.atacante]}**`).replace("{d}", `**${nomes[r.defensor]}**`);
    return trechoPronto(r.tipo === "erro" ? `💨 ${t}` : `${r.tipo === "critico" ? "💥 **¡CRÍTICO!** " : "👊 "}${t} — **−${r.dano}**`);
  }
  const txt = (en ? r.molde.en : r.molde.pt).replace("{a}", `**${nomes[r.atacante]}**`).replace("{d}", `**${nomes[r.defensor]}**`);
  if (r.tipo === "erro") return `💨 ${txt}`;
  return `${r.tipo === "critico" ? (en ? "💥 **CRITICAL!** " : "💥 **CRÍTICO!** ") : "👊 "}${txt} — **−${r.dano}**`;
}

// ── Cowsay ──────────────────────────────────────────────────────────────────
// Desenhos próprios (não os do cowsay original). `{c}` é o fio do balão:
// "\" falando, "o" pensando.
// Nenhum desenho pode ter "<algo>" numa linha: o cliente do Stoat esconde
// isso como tag HTML, até dentro de bloco de código (ver core/marcadores.js).
export const FIGURAS = {
  vaca: [
    " {c}",
    "  {c}    (__)",
    "   {c}   (oo)________",
    "        (__)        )\\",
    "          ||-------|| *",
    "          ||       ||",
  ],
  pinguim: [
    " {c}",
    "  {c}    .---.",
    "   {c}  ( o o )",
    "       /  V  \\",
    "      / (   ) \\",
    "       \\_/ \\_/",
    "        ^^ ^^",
  ],
  gato: [
    " {c}",
    "  {c}  /\\_/\\",
    "   {c}( o.o )",
    "      > ^ <",
    "     /     \\",
    "    (_|   |_)",
  ],
  dragao: [
    " {c}",
    "  {c}      __/\\__",
    "   {c}  __/ o    \\__~~",
    "      (__  \\/\\/\\/  _)",
    "         \\______/ \\",
    "          |  |  |  \\_",
    "          ^  ^  ^",
  ],
  robo: [
    " {c}",
    "  {c}   [=====]",
    "   {c}  [ o o ]",
    "       [  -  ]",
    "      /|_____|\\",
    "       |_| |_|",
  ],
  fantasma: [
    " {c}",
    "  {c}   .-\"-.",
    "   {c} / o o \\",
    "      |   O   |",
    "      |       |",
    "      '~^~^~^~'",
  ],
};
const NOMES_FIGURA = {
  vaca: "vaca", cow: "vaca",
  pinguim: "pinguim", penguin: "pinguim", tux: "pinguim",
  gato: "gato", cat: "gato",
  dragao: "dragao", dragão: "dragao", dragon: "dragao",
  robo: "robo", robô: "robo", robot: "robo",
  fantasma: "fantasma", ghost: "fantasma",
};
export const NOMES_EN_FIGURA = { vaca: "cow", pinguim: "penguin", gato: "cat", dragao: "dragon", robo: "robot", fantasma: "ghost" };
export const figuraDe = (nome) => NOMES_FIGURA[normalizar(nome)] ?? NOMES_FIGURA[String(nome ?? "").toLowerCase()] ?? null;

const LARGURA = 38, MAX_LINHAS_BALAO = 12;
export const MAX_TEXTO_COWSAY = 300;

export function quebrarLinhas(texto, largura = LARGURA) {
  const linhas = [];
  for (const paragrafo of String(texto ?? "").split("\n")) {
    let atual = "";
    for (let palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      while (Array.from(palavra).length > largura) {             // palavra gigante: corta
        if (atual) { linhas.push(atual); atual = ""; }
        const ch = Array.from(palavra);
        linhas.push(ch.slice(0, largura).join(""));
        palavra = ch.slice(largura).join("");
      }
      if (!atual) atual = palavra;
      else if (Array.from(atual).length + 1 + Array.from(palavra).length <= largura) atual += " " + palavra;
      else { linhas.push(atual); atual = palavra; }
    }
    linhas.push(atual);
  }
  while (linhas.length > 1 && !linhas.at(-1)) linhas.pop();
  return linhas;
}

export function cowsay(texto, { figura = "vaca", pensando = false } = {}) {
  // ``` dentro do texto fecharia o bloco de código no meio
  const limpo = String(texto ?? "").replace(/`/g, "ˋ").slice(0, MAX_TEXTO_COWSAY);
  let linhas = quebrarLinhas(limpo);
  if (linhas.length > MAX_LINHAS_BALAO) linhas = [...linhas.slice(0, MAX_LINHAS_BALAO - 1), "…"];
  const w = Math.max(1, ...linhas.map((l) => Array.from(l).length));
  const pad = (l) => l + " ".repeat(w - Array.from(l).length);
  const saida = [" " + "_".repeat(w + 2)];
  if (pensando) for (const l of linhas) saida.push(`( ${pad(l)} )`);
  else if (linhas.length === 1) saida.push(`< ${pad(linhas[0])} >`);
  else linhas.forEach((l, i) => {
    const [e, d] = i === 0 ? ["/", "\\"] : i === linhas.length - 1 ? ["\\", "/"] : ["|", "|"];
    saida.push(`${e} ${pad(l)} ${d}`);
  });
  saida.push(" " + "-".repeat(w + 2));
  for (const l of FIGURAS[figura] ?? FIGURAS.vaca) saida.push(l.replaceAll("{c}", pensando ? "o" : "\\"));
  return saida.join("\n");
}

// ── Zoeira e inverter ───────────────────────────────────────────────────────
export function zoeira(texto) {
  let i = 0;
  return Array.from(String(texto ?? "")).map((c) => {
    if (c.toLowerCase() === c.toUpperCase()) return c;   // não é letra: não conta
    return (i++ % 2 === 0) ? c.toLowerCase() : c.toUpperCase();
  }).join("");
}

export function inverter(texto) {
  const t = String(texto ?? "");
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });   // emoji composto não se parte
    return [...seg.segment(t)].map((s) => s.segment).reverse().join("");
  } catch { return Array.from(t).reverse().join(""); }
}

// ── Nota e sorte ────────────────────────────────────────────────────────────
export const notaDe = (chave) => hash32(`nota:${chave}`) % 11;
const COMENTARIOS_NOTA = [
  { pt: "Nem a mãe aprova.", en: "Not even its mother approves.", es: "Ni su madre lo aprueba." },
  { pt: "Precisa melhorar. Muito.", en: "Needs work. A lot of it.", es: "Necesita mejorar. Mucho." },
  { pt: "Já vi piores. Não muitos.", en: "I've seen worse. Not many.", es: "He visto peores. No muchos." },
  { pt: "Mediano, mas com esforço.", en: "Average, but trying.", es: "Del montón, pero se esfuerza." },
  { pt: "Bom! Dá para recomendar sem vergonha.", en: "Good! Recommendable without shame.", es: "¡Bueno! Se puede recomendar sin vergüenza." },
  { pt: "Muito bom. Quase perfeito.", en: "Very good. Almost perfect.", es: "Muy bueno. Casi perfecto." },
  { pt: "Perfeito. Não mexa em nada.", en: "Perfect. Don't change a thing.", es: "Perfecto. No toques nada." },
];
export const comentarioNota = (n, en = false) => {
  const c = COMENTARIOS_NOTA[n <= 1 ? 0 : n <= 3 ? 1 : n === 4 ? 2 : n <= 6 ? 3 : n === 7 ? 4 : n <= 9 ? 5 : 6];
  if (en === "es") return trechoPronto(c.es);
  return en ? c.en : c.pt;
};

const SORTES = [
  { pt: "Uma mensagem inesperada vai melhorar o seu dia.", en: "An unexpected message will brighten your day.", es: "Un mensaje inesperado te va a alegrar el día." },
  { pt: "Hoje é um bom dia para terminar o que você começou.", en: "Today is a good day to finish what you started.", es: "Hoy es un buen día para terminar lo que empezaste." },
  { pt: "Alguém aqui no servidor pensa bem de você.", en: "Someone on this server thinks highly of you.", es: "Alguien en este servidor piensa bien de ti." },
  { pt: "O bug que te persegue vai se revelar sozinho.", en: "The bug haunting you will reveal itself.", es: "El bug que te persigue se va a revelar solo." },
  { pt: "Beba água. A sorte também é hidratada.", en: "Drink water. Luck likes being hydrated too.", es: "Bebe agua. La suerte también se hidrata." },
  { pt: "Uma ideia boa chega no banho. Anote depois.", en: "A good idea will come in the shower. Write it down after.", es: "Una buena idea te llegará en la ducha. Apúntala después." },
  { pt: "Evite discussões sobre abacaxi na pizza hoje.", en: "Avoid pineapple-on-pizza debates today.", es: "Evita hoy las discusiones sobre la piña en la pizza." },
  { pt: "Você vai achar algo que perdeu faz tempo.", en: "You'll find something you lost a long time ago.", es: "Vas a encontrar algo que perdiste hace tiempo." },
  { pt: "A paciência vai render mais do que a pressa.", en: "Patience will pay better than haste today.", es: "La paciencia va a rendir más que las prisas." },
  { pt: "Um pequeno gesto seu vai fazer diferença para alguém.", en: "A small gesture of yours will matter to someone.", es: "Un pequeño gesto tuyo va a marcar la diferencia para alguien." },
  { pt: "Cuidado com o primeiro plano que parece perfeito.", en: "Beware the first plan that looks perfect.", es: "Cuidado con el primer plan que parece perfecto." },
  { pt: "Hoje o café está do seu lado.", en: "Today, coffee is on your side.", es: "Hoy el café está de tu lado." },
  { pt: "Uma conversa boba vai virar uma lembrança boa.", en: "A silly chat will turn into a good memory.", es: "Una charla tonta se convertirá en un buen recuerdo." },
  { pt: "Seu próximo commit passa no CI de primeira.", en: "Your next commit passes CI on the first try.", es: "Tu próximo commit pasa el CI a la primera." },
  { pt: "Diga sim para o convite que você ia recusar.", en: "Say yes to the invite you were about to decline.", es: "Di que sí a la invitación que ibas a rechazar." },
  { pt: "O dia começa devagar e termina bem.", en: "The day starts slow and ends well.", es: "El día empieza despacio y termina bien." },
  { pt: "A resposta que você procura está numa pergunta melhor.", en: "The answer you seek is in a better question.", es: "La respuesta que buscas está en una pregunta mejor." },
  { pt: "Arrume uma coisa pequena e o resto parece mais leve.", en: "Fix one small thing and the rest feels lighter.", es: "Arregla una cosa pequeña y el resto parecerá más ligero." },
  { pt: "Sorte grande em jogo de dados. Ou não. Teste.", en: "Big luck with dice today. Or not. Try it.", es: "Mucha suerte con los dados hoy. O no. Pruébalo." },
  { pt: "Alguém vai rir de uma piada sua que nem era piada.", en: "Someone will laugh at a joke that wasn't even a joke.", es: "Alguien se va a reír de un chiste tuyo que ni siquiera era un chiste." },
];
export function sorteDoDia(userId, data = new Date()) {
  const dia = data.toISOString().slice(0, 10);
  const h = hash32(`sorte:${userId}:${dia}`);
  return { frase: SORTES[h % SORTES.length], numero: ((h >>> 8) % 99) + 1, dia };
}

// ── Bola 8 ──────────────────────────────────────────────────────────────────
export const RESPOSTAS_BOLA8 = [
  { tom: "sim", pt: "Com certeza.", en: "Definitely.", es: "Con toda seguridad." },
  { tom: "sim", pt: "Sem dúvida nenhuma.", en: "Without a doubt.", es: "Sin ninguna duda." },
  { tom: "sim", pt: "Pode apostar.", en: "You can bet on it.", es: "Puedes apostar por ello." },
  { tom: "sim", pt: "Os sinais dizem que sim.", en: "Signs point to yes.", es: "Las señales dicen que sí." },
  { tom: "sim", pt: "Muito provavelmente.", en: "Most likely.", es: "Muy probablemente." },
  { tom: "sim", pt: "Sim — e não pergunte de novo.", en: "Yes — and don't ask again.", es: "Sí — y no vuelvas a preguntar." },
  { tom: "sim", pt: "Do jeito que eu vejo, sim.", en: "As I see it, yes.", es: "Tal como yo lo veo, sí." },
  { tom: "sim", pt: "Pode contar com isso.", en: "You may rely on it.", es: "Puedes contar con ello." },
  { tom: "sim", pt: "Tudo indica que sim.", en: "Everything says yes.", es: "Todo indica que sí." },
  { tom: "sim", pt: "Sim, mas não conta pra ninguém.", en: "Yes, but don't tell anyone.", es: "Sí, pero no se lo cuentes a nadie." },
  { tom: "talvez", pt: "Pergunte de novo mais tarde.", en: "Ask again later.", es: "Vuelve a preguntar más tarde." },
  { tom: "talvez", pt: "Melhor não te contar agora.", en: "Better not tell you now.", es: "Mejor no decírtelo ahora." },
  { tom: "talvez", pt: "Não dá para prever agora.", en: "Can't predict that now.", es: "No se puede predecir ahora." },
  { tom: "talvez", pt: "Concentre-se e pergunte de novo.", en: "Concentrate and ask again.", es: "Concéntrate y vuelve a preguntar." },
  { tom: "talvez", pt: "Depende do café de hoje.", en: "Depends on today's coffee.", es: "Depende del café de hoy." },
  { tom: "nao", pt: "Nem pensar.", en: "Don't count on it.", es: "Ni lo sueñes." },
  { tom: "nao", pt: "Minha resposta é não.", en: "My reply is no.", es: "Mi respuesta es no." },
  { tom: "nao", pt: "Minhas fontes dizem que não.", en: "My sources say no.", es: "Mis fuentes dicen que no." },
  { tom: "nao", pt: "As perspectivas não são boas.", en: "Outlook not so good.", es: "Las perspectivas no son buenas." },
  { tom: "nao", pt: "Muito duvidoso.", en: "Very doubtful.", es: "Muy dudoso." },
];

// ── Subcomandos e apelidos (só os desta família) ────────────────────────────
const SUB = {
  ship: "ship", shipar: "ship", casal: "ship",
  briga: "briga", luta: "briga", fight: "briga", vs: "briga",
  cowsay: "cowsay", cowthink: "cowsay",
  bola8: "bola8", "8ball": "bola8", bola: "bola8",
  escolher: "escolher", escolha: "escolher", choose: "escolher", pick: "escolher",
  nota: "nota", avaliar: "nota", rate: "nota",
  sorte: "sorte", fortune: "sorte", biscoito: "sorte",
  zoeira: "zoeira", mock: "zoeira",
  inverter: "inverter", reverse: "inverter", reverso: "inverter",
  campominado: "campominado", minado: "campominado", minas: "campominado", minesweeper: "campominado", mines: "campominado", buscaminas: "campominado",
  velha: "velha", jogodavelha: "velha", tictactoe: "velha", ttt: "velha", tateti: "velha", "tres-en-raya": "velha",
  ajuda: "menu", help: "menu", menu: "menu",
};
export const SUBCOMANDOS = ["ship", "briga", "cowsay", "bola8", "escolher", "nota", "sorte", "zoeira", "inverter", "campominado", "velha"];
// Para a dica do main.js: `&ship` não existe solto, mora aqui.
export const subcomandoDe = (nome) => {
  const s = SUB[String(nome ?? "").toLowerCase()];
  return s && s !== "menu" ? s : null;
};

// ── Quem é quem ─────────────────────────────────────────────────────────────
async function nomeDoUsuario(id, { ctx, server }) {
  try {
    const m = await server?.fetchMember?.(id);
    const n = m?.displayName ?? m?.nickname ?? m?.user?.displayName ?? m?.user?.username;
    if (n) return n;
  } catch {}
  try {
    const u = ctx.client?.users?.get?.(id) ?? await ctx.client?.users?.fetch?.(id);
    if (u) return u.displayName ?? u.username;
  } catch {}
  return null;
}

// Um item de ship/briga/nota: pessoa (menção/ID/link) ou texto livre.
async function item(texto, { ctx, server }) {
  const id = idDaMencao(texto);
  if (id) {
    const nome = await nomeDoUsuario(id, { ctx, server });
    return { chave: `u:${id}`, nome: nomeSeguro(nome ?? id.slice(-6)), id };
  }
  const t = nomeSeguro(texto);
  return { chave: `t:${normalizar(t)}`, nome: t };
}

async function autorComoItem(message, { ctx, server }) {
  const id = message.authorId ?? message.author?.id;
  const nome = message.member?.displayName ?? message.member?.nickname ?? message.author?.displayName ?? message.author?.username
    ?? await nomeDoUsuario(id, { ctx, server });
  return { chave: `u:${id}`, nome: nomeSeguro(nome ?? "?"), id };
}

// Menções no meio de um texto livre viram @nome (zoeira/inverter quebrariam o
// <@ID>, e no cowsay ele apareceria cru).
async function trocarMencoes(texto, { ctx, server }) {
  let saida = String(texto ?? "");
  for (const m of [...saida.matchAll(/<@!?([0-9A-HJKMNP-TV-Z]{26})>/gi)]) {
    const nome = await nomeDoUsuario(m[1].toUpperCase(), { ctx, server });
    saida = saida.replace(m[0], `@${nomeSeguro(nome ?? m[1].slice(-6))}`);
  }
  return saida;
}

// ── O comando ───────────────────────────────────────────────────────────────
export async function cmdEntretenimento(message, args, ctx, { rng = rngPadrao, agora = () => new Date() } = {}) {
  const { sendEmbed, COR, PREFIXO: P = "&" } = ctx;
  const en = lingua(ctx) === "en";
  const es = idiomaDe(ctx) === "es";
  const L = es ? "es" : en;   // para as funções acima (veredito, narração, comentário)
  const T = (pt, eng, esp) => tr(ctx, pt, eng, esp);
  const sub = SUB[String(args[0] ?? "").toLowerCase()] ?? (args[0] ? null : "menu");
  const resto = args.slice(1).join(" ").trim();
  const server = await ctx.getServer?.(message).catch(() => null) ?? null;
  const enviar = (title, description, colour = COR.info) => sendEmbed(message.channel, { title, description, colour });
  const raiz = `${citarInterno("entretenimento", P)}`;
  // espanhol: o nome do comando (e do subcomando, quando o registro tem) vem do citar
  const raizEs = citar("entretenimento", "es", P);
  const subEs = (s) => (["ship", "cowsay"].includes(s) ? `${raizEs} ${s}` : citar(`entretenimento.${s}`, "es", P));
  const uso = (linha, linhaEs) => enviar("🎪", T(`Uso: \`${raiz} ${linha.pt ?? linha}\``, `Usage: \`${raiz} ${linha.en ?? linha}\``, `Uso: \`${linhaEs}\``), COR.aviso);
  const U = (pt, eng) => ({ pt, en: eng });

  if (sub === "menu" || !sub) {
    const desconhecido = !sub ? `${T("Não conheço", "I don't know", "No conozco")} \`${String(args[0]).slice(0, 30)}\`.\n\n` : "";
    // cada linha: o código e a explicação; no espanhol, a linha inteira sai pronta
    const linha = (cod, pt, eng, codEs, esp) => T(`\`${raiz} ${cod.pt ?? cod}\` — ${pt}`, `\`${raiz} ${cod.en ?? cod}\` — ${eng}`, `\`${codEs}\` — ${esp}`);
    return enviar(T("🎪 Entretenimento", "🎪 Fun", "🎪 Entretenimiento"), desconhecido + [
      linha("ship @a @b", "quantos % duas pessoas (ou coisas) combinam", "how many % two people (or things) match", `${subEs("ship")} @a @b`, "qué % combinan dos personas (o cosas)"),
      linha("briga @a @b", "quem ganha numa briga, rodada por rodada", "who wins a fight, round by round", `${subEs("briga")} @a @b`, "quién gana una pelea, ronda a ronda"),
      linha("cowsay [bicho] [pensa] <texto>", "um bicho em ASCII falando o seu texto", "an ASCII critter saying your text", `${subEs("cowsay")} [bicho] [think] <texto>`, "un bicho en ASCII diciendo tu texto"),
      linha("bola8 <pergunta>", "a bola mágica responde", "the magic ball answers", `${subEs("bola8")} <pregunta>`, "la bola mágica responde"),
      linha("escolher a | b | c", "eu escolho por você", "I pick for you", `${subEs("escolher")} a | b | c`, "yo elijo por ti"),
      linha("nota <coisa>", "nota de 0 a 10 para qualquer coisa", "a 0–10 rating for anything", `${subEs("nota")} <cosa>`, "nota de 0 a 10 para cualquier cosa"),
      linha("sorte", "a sua sorte de hoje", "your fortune for today", subEs("sorte"), "tu suerte de hoy"),
      T(`\`${raiz} zoeira <texto>\` · \`${raiz} inverter <texto>\` — tExTo De ZoEiRa · texto ao contrário`,
        `\`${raiz} zoeira <texto>\` · \`${raiz} inverter <texto>\` — mOcKiNg TeXt · text backwards`,
        `\`${subEs("zoeira")} <texto>\` · \`${subEs("inverter")} <texto>\` — tExTo De BuRlA · texto al revés`),
      linha(U("campominado [facil|medio|dificil]", "campominado [easy|medium|hard]"), "campo minado: clique nos quadrados", "minesweeper: click the squares", `${subEs("campominado")} [easy|medium|hard]`, "buscaminas: haz clic en las casillas"),
      linha(U("velha [@pessoa]", "velha [@user]"), "jogo da velha por reação — sem ninguém, contra mim", "tic-tac-toe by reaction — with nobody, against me", `${subEs("velha")} [@usuario]`, "tres en raya por reacción — sin nadie, contra mí"),
      "",
      T(`_Com uma pessoa só, o outro lado é você: \`${raiz} ship @alguém\`. \`${P}help entretenimento <sub>\` explica cada um._`,
        `_With just one person, the other side is you: \`${raiz} ship @someone\`. \`${P}help entretenimento <sub>\` explains each one._`,
        `_Con una sola persona, el otro lado eres tú: \`${subEs("ship")} @alguien\`. \`${citar("help", "es", P)} ${citar("entretenimento", "es", "")} <sub>\` explica cada uno._`),
    ].join("\n"), desconhecido ? COR.aviso : COR.info);
  }

  // ── ship ──
  if (sub === "ship") {
    const partes = separarDois(resto);
    if (!partes.length) return uso(U("ship @pessoa [@outra]  ·  ship pizza e abacaxi", "ship @user [@other]  ·  ship pizza and pineapple"), `${subEs("ship")} @usuario [@otro]  ·  ship pizza x piña`);
    const itens = await Promise.all(partes.map((p) => item(p, { ctx, server })));
    if (itens.length === 1) itens.unshift(await autorComoItem(message, { ctx, server }));
    const [a, b] = itens;
    const pct = porcentagemShip(a.chave, b.chave);
    const mesmo = a.chave === b.chave;
    return enviar(`💘 ${a.nome} × ${b.nome}`, [
      `**${pct}%** ${barra(pct, 100, "❤️", "🤍")}`,
      "",
      mesmo
        ? T("Amor-próprio em dia. Ninguém combina mais com você do que você.", "Self-love on point. Nobody matches you better than you.", "Amor propio al día. Nadie combina mejor contigo que tú.")
        : vereditoShip(pct, L),
      mesmo ? "" : `\n${T("Nome do casal", "Ship name", "Nombre de la pareja")}: **${nomeDoCasal(a.nome, b.nome)}**`,
    ].join("\n").trim(), pct >= 70 ? COR.sucesso : pct >= 40 ? COR.info : COR.aviso);
  }

  // ── briga ──
  if (sub === "briga") {
    const partes = separarDois(resto);
    if (!partes.length) return uso(U("briga @pessoa [@outra]  ·  briga Goku x Superman", "fight @user [@other]  ·  fight Goku x Superman"), `${subEs("briga")} @usuario [@otro]  ·  fight Goku x Superman`);
    const itens = await Promise.all(partes.map((p) => item(p, { ctx, server })));
    if (itens.length === 1) itens.unshift(await autorComoItem(message, { ctx, server }));
    const [a, b] = itens;
    if (a.chave === b.chave) {
      return enviar(`⚔️ ${a.nome} × ${a.nome}`, T(
        `**${a.nome}** briga consigo mesmo por 10 minutos e… perde. E ganha. Ninguém entendeu.`,
        `**${a.nome}** fights themselves for 10 minutes and… loses. And wins. Nobody understood.`,
        `**${a.nome}** pelea consigo mismo durante 10 minutos y… pierde. Y gana. Nadie entendió nada.`), COR.info);
    }
    const nomes = [a.nome, b.nome];
    const r = simularBriga(a.nome, b.nome, rng);
    const linhas = r.rodadas.map((x, i) => `\`${i + 1}.\` ${narrarRodada(x, nomes, L)}`);
    const v = nomes[r.vencedor];
    linhas.push("",
      `${nomes[0]} \`${barra(r.hp[0], 100, "▰", "▱")}\` ${r.hp[0]}`,
      `${nomes[1]} \`${barra(r.hp[1], 100, "▰", "▱")}\` ${r.hp[1]}`,
      "",
      r.nocaute
        ? T(`🏆 **${v}** venceu por nocaute!`, `🏆 **${v}** wins by knockout!`, `🏆 ¡**${v}** gana por nocaut!`)
        : T(`🏆 **${v}** venceu nos pontos.`, `🏆 **${v}** wins on points.`, `🏆 **${v}** gana por puntos.`));
    return enviar(`⚔️ ${a.nome} × ${b.nome}`, linhas.join("\n"), COR.info);
  }

  // ── cowsay ──
  if (sub === "cowsay") {
    const tokens = resto.split(/\s+/).filter(Boolean);
    if (tokens[0] && ["figuras", "bichos", "figures", "list", "lista"].includes(tokens[0].toLowerCase())) {
      return enviar("🐮 cowsay", T("Bichos: ", "Critters: ", "Bichos: ")
        + Object.keys(FIGURAS).map((f) => `\`${en ? NOMES_EN_FIGURA[f] : f}\``).join(" · ")
        + T(`\n\n\`${raiz} cowsay gato pensa oi\` — o \`pensa\` troca a fala por pensamento.`,
            `\n\n\`${raiz} cowsay cat think hi\` — \`think\` turns speech into a thought.`,
            `\n\n\`${subEs("cowsay")} cat think hola\` — \`think\` cambia el habla por un pensamiento.`), COR.info);
    }
    let figura = "vaca", pensando = String(args[0] ?? "").toLowerCase() === "cowthink";
    for (let i = 0; i < 2 && tokens.length; i++) {
      const tk = tokens[0].toLowerCase();
      const f = figuraDe(tk);
      if (f) { figura = f; tokens.shift(); continue; }
      if (["pensa", "pensando", "think", "thinking"].includes(tk)) { pensando = true; tokens.shift(); continue; }
      break;
    }
    if (!tokens.length) return uso(U("cowsay [bicho] [pensa] <texto>  ·  cowsay figuras", "cowsay [critter] [think] <text>  ·  cowsay figures"), `${subEs("cowsay")} [bicho] [think] <texto>  ·  cowsay figures`);
    const texto = await trocarMencoes(tokens.join(" "), { ctx, server });
    const corte = Array.from(texto).length > MAX_TEXTO_COWSAY;
    const desenho = cowsay(texto, { figura, pensando });
    return enviar(pensando ? "💭" : "🐮", "```\n" + desenho + "\n```" + (corte ? T(`\n_(cortei em ${MAX_TEXTO_COWSAY} caracteres)_`, `\n_(trimmed to ${MAX_TEXTO_COWSAY} characters)_`, `\n_(recortado a ${MAX_TEXTO_COWSAY} caracteres)_`) : ""), COR.info);
  }

  // ── bola8 ──
  if (sub === "bola8") {
    if (!resto) return uso(U("bola8 <pergunta>", "8ball <question>"), `${subEs("bola8")} <pregunta>`);
    const r = sortear(RESPOSTAS_BOLA8, rng);
    const pergunta = (await trocarMencoes(resto, { ctx, server })).replace(/`/g, "ˋ").slice(0, 200);
    return enviar("🎱", `> ${pergunta}\n\n**${es ? trechoPronto(r.es) : en ? r.en : r.pt}**`,
      r.tom === "sim" ? COR.sucesso : r.tom === "nao" ? COR.erro : COR.info);
  }

  // ── escolher ──
  if (sub === "escolher") {
    const opcoes = separarOpcoes(await trocarMencoes(resto, { ctx, server }));
    if (opcoes.length < 2) return uso(U("escolher pizza | hambúrguer | sushi  ·  escolher pizza ou sushi", "choose pizza | burger | sushi  ·  choose pizza or sushi"), `${subEs("escolher")} pizza | hamburguesa | sushi  ·  choose pizza, sushi`);
    const escolhida = sortear(opcoes, rng);
    return enviar("🤔", T(
      `Entre ${opcoes.length} opções, eu fico com: **${nomeSeguro(escolhida)}**`,
      `Out of ${opcoes.length} options, I'll go with: **${nomeSeguro(escolhida)}**`,
      `Entre ${opcoes.length} opciones, me quedo con: **${nomeSeguro(escolhida)}**`), COR.info);
  }

  // ── nota ──
  if (sub === "nota") {
    if (!resto) return uso(U("nota <coisa ou @pessoa>", "rate <thing or @user>"), `${subEs("nota")} <cosa o @usuario>`);
    const it = await item(resto, { ctx, server });
    const n = notaDe(it.chave);
    return enviar(`📝 ${it.nome}`, `**${n}/10** ${barra(n, 10, "⭐", "▫️")}\n\n${comentarioNota(n, L)}`,
      n >= 7 ? COR.sucesso : n >= 4 ? COR.info : COR.aviso);
  }

  // ── sorte ──
  if (sub === "sorte") {
    const autor = await autorComoItem(message, { ctx, server });
    const s = sorteDoDia(autor.id, agora());
    return enviar(T(`🥠 A sorte de ${autor.nome} hoje`, `🥠 ${autor.nome}'s fortune today`, `🥠 La suerte de ${autor.nome} hoy`),
      `*${es ? trechoPronto(s.frase.es) : en ? s.frase.en : s.frase.pt}*\n\n${T("Número da sorte", "Lucky number", "Número de la suerte")}: **${s.numero}**\n_${T("Volta a mudar amanhã.", "It changes again tomorrow.", "Vuelve a cambiar mañana.")}_`, COR.info);
  }

  // ── zoeira / inverter ──
  if (sub === "zoeira" || sub === "inverter") {
    if (!resto) return uso(U(`${sub} <texto>`, `${sub} <text>`), `${subEs(sub)} <texto>`);
    const texto = (await trocarMencoes(resto, { ctx, server })).slice(0, 500);
    const saida = sub === "zoeira" ? zoeira(texto) : inverter(texto);
    return enviar(sub === "zoeira" ? "🤪" : "🔁", saida.replace(/`/g, "ˋ"), COR.info);
  }

  // ── campo minado ──
  if (sub === "campominado") {
    const nome = jogos.nivelDe(args[1]) ?? (args[1] ? null : "medio");
    if (!nome) return uso(U("campominado [facil|medio|dificil]", "minesweeper [easy|medium|hard]"), `${subEs("campominado")} [easy|medium|hard]`);
    const nivel = jogos.NIVEIS[nome];
    const campo = jogos.gerarCampo(nivel, rng);
    // o cabeçalho vai como texto puro (sendMessage, sem a tradução da tela): o espanhol
    // entra sem a marca de pronto
    const T0 = (pt, eng, esp) => (es ? esp : en ? eng : pt);
    const NOME = { facil: T0("fácil", "easy", "fácil"), medio: T0("médio", "medium", "medio"), dificil: T0("difícil", "hard", "difícil") }[nome];
    const cabeca = T0(
      `💣 **Campo minado** (${NOME}) — ${nivel.linhas}×${nivel.colunas}, **${nivel.minas}** minas. Clique nos quadrados para abrir; a casa aberta é um começo seguro.`,
      `💣 **Minesweeper** (${NOME}) — ${nivel.linhas}×${nivel.colunas}, **${nivel.minas}** mines. Click the squares to open them; the open one is a safe start.`,
      `💣 **Buscaminas** (${NOME}) — ${nivel.linhas}×${nivel.colunas}, **${nivel.minas}** minas. Haz clic en las casillas para abrirlas; la que ya está abierta es un comienzo seguro.`);
    // texto, não embed: o spoiler (`!!…!!`) é do texto da mensagem
    try { return await message.channel.sendMessage(`${cabeca}\n\n${jogos.textoCampo(campo)}`); }
    catch (e) { return enviar("💣", T(`Não consegui mandar o campo: ${e?.message ?? e}`, `I couldn't send the board: ${e?.message ?? e}`, `No pude enviar el tablero: ${e?.message ?? e}`), COR.erro); }
  }

  // ── jogo da velha ──
  if (sub === "velha") {
    const autor = await autorComoItem(message, { ctx, server });
    const botId = ctx.client?.user?.id;
    let rival = null;
    if (resto && !["judy", "bot", "voce", "você", "you"].includes(normalizar(resto))) {
      const id = idDaMencao(resto);
      if (!id) return uso(U("velha [@pessoa]  ·  velha (contra mim)", "tictactoe [@user]  ·  tictactoe (against me)"), `${subEs("velha")} [@usuario]  ·  ${subEs("velha")} (contra mí)`);
      if (id !== botId) rival = await item(resto, { ctx, server });
    }
    if (rival && rival.id === autor.id) return enviar("🎮", T("Contra você mesmo não dá — chame alguém, ou jogue comigo: " + `\`${raiz} velha\``, "You can't play yourself — call someone, or play me: " + `\`${raiz} velha\``, "Contra ti mismo no se puede — llama a alguien o juega conmigo: " + `\`${subEs("velha")}\``), COR.aviso);
    const r = await jogos.iniciarVelha({
      ctx, canal: message.channel, rng, lang: idiomaDe(ctx),
      jogadores: [autor.id, rival?.id ?? jogos.JUDY],
      nomes: [autor.nome, rival?.nome ?? "Judy"],
    });
    return r?.partida?.msg;
  }

  return enviar("🎪", `\`${raiz}\``, COR.aviso);
}
