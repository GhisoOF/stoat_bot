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

import { lingua } from "../core/i18n.js";
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
  { ate: 10,  pt: "Nem com reza braba. Melhor cada um no seu canto.", en: "Not even with prayers. Better stay in separate corners." },
  { ate: 30,  pt: "Amizade colorida? Só se for em preto e branco.", en: "Friends at best — and even that's a stretch." },
  { ate: 50,  pt: "Tem uma faísca… pequena. Bem pequena.", en: "There's a spark… a small one. A very small one." },
  { ate: 70,  pt: "Dá jogo! Falta só alguém tomar a iniciativa.", en: "This could work! Someone just has to make the first move." },
  { ate: 90,  pt: "Química forte. Já dá para escolher o nome do pet.", en: "Strong chemistry. Time to pick a name for the pet." },
  { ate: 99,  pt: "Casal do ano. O servidor inteiro já sabia.", en: "Couple of the year. The whole server already knew." },
  { ate: 100, pt: "Almas gêmeas. Os astros se alinharam.", en: "Soulmates. The stars have aligned." },
];
export const vereditoShip = (pct, en = false) => {
  const v = VEREDITOS_SHIP.find((x) => pct <= x.ate) ?? VEREDITOS_SHIP.at(-1);
  return en ? v.en : v.pt;
};

// ── Briga ───────────────────────────────────────────────────────────────────
const GOLPES = [
  { pt: "{a} acerta um soco no queixo de {d}", en: "{a} lands a punch on {d}'s chin" },
  { pt: "{a} dá uma voadora em {d}", en: "{a} hits {d} with a flying kick" },
  { pt: "{a} aplica uma rasteira em {d}", en: "{a} sweeps {d} off their feet" },
  { pt: "{a} arremessa uma cadeira de plástico em {d}", en: "{a} throws a plastic chair at {d}" },
  { pt: "{a} acerta {d} com o chinelo voador da mãe", en: "{a} nails {d} with mom's flying slipper" },
  { pt: "{a} encaixa um mata-leão em {d}", en: "{a} locks {d} in a chokehold" },
  { pt: "{a} bate em {d} com um livro de 600 páginas", en: "{a} smacks {d} with a 600-page book" },
  { pt: "{a} solta um golpe de capoeira em {d}", en: "{a} pulls a capoeira move on {d}" },
  { pt: "{a} dá uma cabeçada em {d}", en: "{a} headbutts {d}" },
  { pt: "{a} joga um teclado mecânico em {d}", en: "{a} throws a mechanical keyboard at {d}" },
  { pt: "{a} faz {d} pisar numa peça de Lego", en: "{a} makes {d} step on a Lego brick" },
  { pt: "{a} acerta {d} com uma frigideira", en: "{a} bonks {d} with a frying pan" },
];
const ERROS = [
  { pt: "{a} tenta um chute giratório e cai sozinho", en: "{a} tries a spinning kick and falls over" },
  { pt: "{d} desvia de {a} em câmera lenta", en: "{d} dodges {a} in slow motion" },
  { pt: "{a} erra o soco e acerta a parede", en: "{a} misses and punches the wall" },
  { pt: "{a} para no meio do golpe para ver o celular", en: "{a} stops mid-attack to check their phone" },
  { pt: "{d} se esconde atrás do sofá e {a} não acha", en: "{d} hides behind the couch and {a} can't find them" },
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
  { pt: "Nem a mãe aprova.", en: "Not even its mother approves." },
  { pt: "Precisa melhorar. Muito.", en: "Needs work. A lot of it." },
  { pt: "Já vi piores. Não muitos.", en: "I've seen worse. Not many." },
  { pt: "Mediano, mas com esforço.", en: "Average, but trying." },
  { pt: "Bom! Dá para recomendar sem vergonha.", en: "Good! Recommendable without shame." },
  { pt: "Muito bom. Quase perfeito.", en: "Very good. Almost perfect." },
  { pt: "Perfeito. Não mexa em nada.", en: "Perfect. Don't change a thing." },
];
export const comentarioNota = (n, en = false) => {
  const c = COMENTARIOS_NOTA[n <= 1 ? 0 : n <= 3 ? 1 : n === 4 ? 2 : n <= 6 ? 3 : n === 7 ? 4 : n <= 9 ? 5 : 6];
  return en ? c.en : c.pt;
};

const SORTES = [
  { pt: "Uma mensagem inesperada vai melhorar o seu dia.", en: "An unexpected message will brighten your day." },
  { pt: "Hoje é um bom dia para terminar o que você começou.", en: "Today is a good day to finish what you started." },
  { pt: "Alguém aqui no servidor pensa bem de você.", en: "Someone on this server thinks highly of you." },
  { pt: "O bug que te persegue vai se revelar sozinho.", en: "The bug haunting you will reveal itself." },
  { pt: "Beba água. A sorte também é hidratada.", en: "Drink water. Luck likes being hydrated too." },
  { pt: "Uma ideia boa chega no banho. Anote depois.", en: "A good idea will come in the shower. Write it down after." },
  { pt: "Evite discussões sobre abacaxi na pizza hoje.", en: "Avoid pineapple-on-pizza debates today." },
  { pt: "Você vai achar algo que perdeu faz tempo.", en: "You'll find something you lost a long time ago." },
  { pt: "A paciência vai render mais do que a pressa.", en: "Patience will pay better than haste today." },
  { pt: "Um pequeno gesto seu vai fazer diferença para alguém.", en: "A small gesture of yours will matter to someone." },
  { pt: "Cuidado com o primeiro plano que parece perfeito.", en: "Beware the first plan that looks perfect." },
  { pt: "Hoje o café está do seu lado.", en: "Today, coffee is on your side." },
  { pt: "Uma conversa boba vai virar uma lembrança boa.", en: "A silly chat will turn into a good memory." },
  { pt: "Seu próximo commit passa no CI de primeira.", en: "Your next commit passes CI on the first try." },
  { pt: "Diga sim para o convite que você ia recusar.", en: "Say yes to the invite you were about to decline." },
  { pt: "O dia começa devagar e termina bem.", en: "The day starts slow and ends well." },
  { pt: "A resposta que você procura está numa pergunta melhor.", en: "The answer you seek is in a better question." },
  { pt: "Arrume uma coisa pequena e o resto parece mais leve.", en: "Fix one small thing and the rest feels lighter." },
  { pt: "Sorte grande em jogo de dados. Ou não. Teste.", en: "Big luck with dice today. Or not. Try it." },
  { pt: "Alguém vai rir de uma piada sua que nem era piada.", en: "Someone will laugh at a joke that wasn't even a joke." },
];
export function sorteDoDia(userId, data = new Date()) {
  const dia = data.toISOString().slice(0, 10);
  const h = hash32(`sorte:${userId}:${dia}`);
  return { frase: SORTES[h % SORTES.length], numero: ((h >>> 8) % 99) + 1, dia };
}

// ── Bola 8 ──────────────────────────────────────────────────────────────────
export const RESPOSTAS_BOLA8 = [
  { tom: "sim", pt: "Com certeza.", en: "Definitely." },
  { tom: "sim", pt: "Sem dúvida nenhuma.", en: "Without a doubt." },
  { tom: "sim", pt: "Pode apostar.", en: "You can bet on it." },
  { tom: "sim", pt: "Os sinais dizem que sim.", en: "Signs point to yes." },
  { tom: "sim", pt: "Muito provavelmente.", en: "Most likely." },
  { tom: "sim", pt: "Sim — e não pergunte de novo.", en: "Yes — and don't ask again." },
  { tom: "sim", pt: "Do jeito que eu vejo, sim.", en: "As I see it, yes." },
  { tom: "sim", pt: "Pode contar com isso.", en: "You may rely on it." },
  { tom: "sim", pt: "Tudo indica que sim.", en: "Everything says yes." },
  { tom: "sim", pt: "Sim, mas não conta pra ninguém.", en: "Yes, but don't tell anyone." },
  { tom: "talvez", pt: "Pergunte de novo mais tarde.", en: "Ask again later." },
  { tom: "talvez", pt: "Melhor não te contar agora.", en: "Better not tell you now." },
  { tom: "talvez", pt: "Não dá para prever agora.", en: "Can't predict that now." },
  { tom: "talvez", pt: "Concentre-se e pergunte de novo.", en: "Concentrate and ask again." },
  { tom: "talvez", pt: "Depende do café de hoje.", en: "Depends on today's coffee." },
  { tom: "nao", pt: "Nem pensar.", en: "Don't count on it." },
  { tom: "nao", pt: "Minha resposta é não.", en: "My reply is no." },
  { tom: "nao", pt: "Minhas fontes dizem que não.", en: "My sources say no." },
  { tom: "nao", pt: "As perspectivas não são boas.", en: "Outlook not so good." },
  { tom: "nao", pt: "Muito duvidoso.", en: "Very doubtful." },
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
  const T = (pt, eng) => (en ? eng : pt);
  const sub = SUB[String(args[0] ?? "").toLowerCase()] ?? (args[0] ? null : "menu");
  const resto = args.slice(1).join(" ").trim();
  const server = await ctx.getServer?.(message).catch(() => null) ?? null;
  const enviar = (title, description, colour = COR.info) => sendEmbed(message.channel, { title, description, colour });
  const raiz = `${P}entretenimento`;
  const uso = (linha) => enviar("🎪", `${T("Uso", "Usage")}: \`${raiz} ${linha}\``, COR.aviso);

  if (sub === "menu" || !sub) {
    const desconhecido = !sub ? `${T("Não conheço", "I don't know")} \`${String(args[0]).slice(0, 30)}\`.\n\n` : "";
    return enviar(T("🎪 Entretenimento", "🎪 Fun"), desconhecido + [
      `\`${raiz} ship @a @b\` — ${T("quantos % duas pessoas (ou coisas) combinam", "how many % two people (or things) match")}`,
      `\`${raiz} briga @a @b\` — ${T("quem ganha numa briga, rodada por rodada", "who wins a fight, round by round")}`,
      `\`${raiz} cowsay [bicho] [pensa] <texto>\` — ${T("um bicho em ASCII falando o seu texto", "an ASCII critter saying your text")}`,
      `\`${raiz} bola8 <pergunta>\` — ${T("a bola mágica responde", "the magic ball answers")}`,
      `\`${raiz} escolher a | b | c\` — ${T("eu escolho por você", "I pick for you")}`,
      `\`${raiz} nota <coisa>\` — ${T("nota de 0 a 10 para qualquer coisa", "a 0–10 rating for anything")}`,
      `\`${raiz} sorte\` — ${T("a sua sorte de hoje", "your fortune for today")}`,
      `\`${raiz} zoeira <texto>\` · \`${raiz} inverter <texto>\` — ${T("tExTo De ZoEiRa · texto ao contrário", "mOcKiNg TeXt · text backwards")}`,
      `\`${raiz} campominado ${T("[facil|medio|dificil]", "[easy|medium|hard]")}\` — ${T("campo minado: clique nos quadrados", "minesweeper: click the squares")}`,
      `\`${raiz} velha ${T("[@pessoa]", "[@user]")}\` — ${T("jogo da velha por reação — sem ninguém, contra mim", "tic-tac-toe by reaction — with nobody, against me")}`,
      "",
      T(`_Com uma pessoa só, o outro lado é você: \`${raiz} ship @alguém\`. \`${P}help entretenimento <sub>\` explica cada um._`,
        `_With just one person, the other side is you: \`${raiz} ship @someone\`. \`${P}help entretenimento <sub>\` explains each one._`),
    ].join("\n"), desconhecido ? COR.aviso : COR.info);
  }

  // ── ship ──
  if (sub === "ship") {
    const partes = separarDois(resto);
    if (!partes.length) return uso(T("ship @pessoa [@outra]  ·  ship pizza e abacaxi", "ship @user [@other]  ·  ship pizza and pineapple"));
    const itens = await Promise.all(partes.map((p) => item(p, { ctx, server })));
    if (itens.length === 1) itens.unshift(await autorComoItem(message, { ctx, server }));
    const [a, b] = itens;
    const pct = porcentagemShip(a.chave, b.chave);
    const mesmo = a.chave === b.chave;
    return enviar(`💘 ${a.nome} × ${b.nome}`, [
      `**${pct}%** ${barra(pct, 100, "❤️", "🤍")}`,
      "",
      mesmo
        ? T("Amor-próprio em dia. Ninguém combina mais com você do que você.", "Self-love on point. Nobody matches you better than you.")
        : vereditoShip(pct, en),
      mesmo ? "" : `\n${T("Nome do casal", "Ship name")}: **${nomeDoCasal(a.nome, b.nome)}**`,
    ].join("\n").trim(), pct >= 70 ? COR.sucesso : pct >= 40 ? COR.info : COR.aviso);
  }

  // ── briga ──
  if (sub === "briga") {
    const partes = separarDois(resto);
    if (!partes.length) return uso(T("briga @pessoa [@outra]  ·  briga Goku x Superman", "fight @user [@other]  ·  fight Goku x Superman"));
    const itens = await Promise.all(partes.map((p) => item(p, { ctx, server })));
    if (itens.length === 1) itens.unshift(await autorComoItem(message, { ctx, server }));
    const [a, b] = itens;
    if (a.chave === b.chave) {
      return enviar(`⚔️ ${a.nome} × ${a.nome}`, T(
        `**${a.nome}** briga consigo mesmo por 10 minutos e… perde. E ganha. Ninguém entendeu.`,
        `**${a.nome}** fights themselves for 10 minutes and… loses. And wins. Nobody understood.`), COR.info);
    }
    const nomes = [a.nome, b.nome];
    const r = simularBriga(a.nome, b.nome, rng);
    const linhas = r.rodadas.map((x, i) => `\`${i + 1}.\` ${narrarRodada(x, nomes, en)}`);
    const v = nomes[r.vencedor];
    linhas.push("",
      `${nomes[0]} \`${barra(r.hp[0], 100, "▰", "▱")}\` ${r.hp[0]}`,
      `${nomes[1]} \`${barra(r.hp[1], 100, "▰", "▱")}\` ${r.hp[1]}`,
      "",
      r.nocaute
        ? T(`🏆 **${v}** venceu por nocaute!`, `🏆 **${v}** wins by knockout!`)
        : T(`🏆 **${v}** venceu nos pontos.`, `🏆 **${v}** wins on points.`));
    return enviar(`⚔️ ${a.nome} × ${b.nome}`, linhas.join("\n"), COR.info);
  }

  // ── cowsay ──
  if (sub === "cowsay") {
    const tokens = resto.split(/\s+/).filter(Boolean);
    if (tokens[0] && ["figuras", "bichos", "figures", "list", "lista"].includes(tokens[0].toLowerCase())) {
      return enviar("🐮 cowsay", T("Bichos: ", "Critters: ")
        + Object.keys(FIGURAS).map((f) => `\`${en ? NOMES_EN_FIGURA[f] : f}\``).join(" · ")
        + T(`\n\n\`${raiz} cowsay gato pensa oi\` — o \`pensa\` troca a fala por pensamento.`,
            `\n\n\`${raiz} cowsay cat think hi\` — \`think\` turns speech into a thought.`), COR.info);
    }
    let figura = "vaca", pensando = String(args[0] ?? "").toLowerCase() === "cowthink";
    for (let i = 0; i < 2 && tokens.length; i++) {
      const tk = tokens[0].toLowerCase();
      const f = figuraDe(tk);
      if (f) { figura = f; tokens.shift(); continue; }
      if (["pensa", "pensando", "think", "thinking"].includes(tk)) { pensando = true; tokens.shift(); continue; }
      break;
    }
    if (!tokens.length) return uso(T("cowsay [bicho] [pensa] <texto>  ·  cowsay figuras", "cowsay [critter] [think] <text>  ·  cowsay figures"));
    const texto = await trocarMencoes(tokens.join(" "), { ctx, server });
    const corte = Array.from(texto).length > MAX_TEXTO_COWSAY;
    const desenho = cowsay(texto, { figura, pensando });
    return enviar(pensando ? "💭" : "🐮", "```\n" + desenho + "\n```" + (corte ? T(`\n_(cortei em ${MAX_TEXTO_COWSAY} caracteres)_`, `\n_(trimmed to ${MAX_TEXTO_COWSAY} characters)_`) : ""), COR.info);
  }

  // ── bola8 ──
  if (sub === "bola8") {
    if (!resto) return uso(T("bola8 <pergunta>", "8ball <question>"));
    const r = sortear(RESPOSTAS_BOLA8, rng);
    const pergunta = (await trocarMencoes(resto, { ctx, server })).replace(/`/g, "ˋ").slice(0, 200);
    return enviar("🎱", `> ${pergunta}\n\n**${en ? r.en : r.pt}**`,
      r.tom === "sim" ? COR.sucesso : r.tom === "nao" ? COR.erro : COR.info);
  }

  // ── escolher ──
  if (sub === "escolher") {
    const opcoes = separarOpcoes(await trocarMencoes(resto, { ctx, server }));
    if (opcoes.length < 2) return uso(T("escolher pizza | hambúrguer | sushi  ·  escolher pizza ou sushi", "choose pizza | burger | sushi  ·  choose pizza or sushi"));
    const escolhida = sortear(opcoes, rng);
    return enviar("🤔", T(
      `Entre ${opcoes.length} opções, eu fico com: **${nomeSeguro(escolhida)}**`,
      `Out of ${opcoes.length} options, I'll go with: **${nomeSeguro(escolhida)}**`), COR.info);
  }

  // ── nota ──
  if (sub === "nota") {
    if (!resto) return uso(T("nota <coisa ou @pessoa>", "rate <thing or @user>"));
    const it = await item(resto, { ctx, server });
    const n = notaDe(it.chave);
    return enviar(`📝 ${it.nome}`, `**${n}/10** ${barra(n, 10, "⭐", "▫️")}\n\n${comentarioNota(n, en)}`,
      n >= 7 ? COR.sucesso : n >= 4 ? COR.info : COR.aviso);
  }

  // ── sorte ──
  if (sub === "sorte") {
    const autor = await autorComoItem(message, { ctx, server });
    const s = sorteDoDia(autor.id, agora());
    return enviar(T(`🥠 A sorte de ${autor.nome} hoje`, `🥠 ${autor.nome}'s fortune today`),
      `*${en ? s.frase.en : s.frase.pt}*\n\n${T("Número da sorte", "Lucky number")}: **${s.numero}**\n_${T("Volta a mudar amanhã.", "It changes again tomorrow.")}_`, COR.info);
  }

  // ── zoeira / inverter ──
  if (sub === "zoeira" || sub === "inverter") {
    if (!resto) return uso(`${sub} <${T("texto", "text")}>`);
    const texto = (await trocarMencoes(resto, { ctx, server })).slice(0, 500);
    const saida = sub === "zoeira" ? zoeira(texto) : inverter(texto);
    return enviar(sub === "zoeira" ? "🤪" : "🔁", saida.replace(/`/g, "ˋ"), COR.info);
  }

  // ── campo minado ──
  if (sub === "campominado") {
    const nome = jogos.nivelDe(args[1]) ?? (args[1] ? null : "medio");
    if (!nome) return uso(T("campominado [facil|medio|dificil]", "minesweeper [easy|medium|hard]"));
    const nivel = jogos.NIVEIS[nome];
    const campo = jogos.gerarCampo(nivel, rng);
    const NOME = { facil: T("fácil", "easy"), medio: T("médio", "medium"), dificil: T("difícil", "hard") }[nome];
    const cabeca = T(
      `💣 **Campo minado** (${NOME}) — ${nivel.linhas}×${nivel.colunas}, **${nivel.minas}** minas. Clique nos quadrados para abrir; a casa aberta é um começo seguro.`,
      `💣 **Minesweeper** (${NOME}) — ${nivel.linhas}×${nivel.colunas}, **${nivel.minas}** mines. Click the squares to open them; the open one is a safe start.`);
    // texto, não embed: o spoiler (`!!…!!`) é do texto da mensagem
    try { return await message.channel.sendMessage(`${cabeca}\n\n${jogos.textoCampo(campo)}`); }
    catch (e) { return enviar("💣", T(`Não consegui mandar o campo: ${e?.message ?? e}`, `I couldn't send the board: ${e?.message ?? e}`), COR.erro); }
  }

  // ── jogo da velha ──
  if (sub === "velha") {
    const autor = await autorComoItem(message, { ctx, server });
    const botId = ctx.client?.user?.id;
    let rival = null;
    if (resto && !["judy", "bot", "voce", "você", "you"].includes(normalizar(resto))) {
      const id = idDaMencao(resto);
      if (!id) return uso(T("velha [@pessoa]  ·  velha (contra mim)", "tictactoe [@user]  ·  tictactoe (against me)"));
      if (id !== botId) rival = await item(resto, { ctx, server });
    }
    if (rival && rival.id === autor.id) return enviar("🎮", T("Contra você mesmo não dá — chame alguém, ou jogue comigo: ", "You can't play yourself — call someone, or play me: ") + `\`${raiz} velha\``, COR.aviso);
    const r = await jogos.iniciarVelha({
      ctx, canal: message.channel, rng, lang: en ? "en" : "pt",
      jogadores: [autor.id, rival?.id ?? jogos.JUDY],
      nomes: [autor.nome, rival?.nome ?? "Judy"],
    });
    return r?.partida?.msg;
  }

  return enviar("🎪", `\`${raiz}\``, COR.aviso);
}
