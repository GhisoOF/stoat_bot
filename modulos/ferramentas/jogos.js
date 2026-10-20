// Jogos do &entretenimento (P7, 20 out 2026): campo minado e jogo da velha.
//
//   campominado [facil|medio|dificil]  um tabuleiro de spoilers (`!!…!!`): cada
//             casa se abre com um clique. Vai como TEXTO, não embed — o spoiler é
//             do texto da mensagem. Uma casa vazia já vem aberta, para começar sem
//             chute.
//   velha [@pessoa]  jogo da velha por reação (1️⃣–9️⃣). Contra a pessoa marcada
//             ou, sem ninguém, contra a Judy. Quem chamou começa (❌). O jogo vive
//             na memória e vence depois de 10 min parado (um reinício também o
//             encerra) — é uma brincadeira, não vale guardar no banco.

// ── Campo minado ────────────────────────────────────────────────────────────
export const NIVEIS = {
  facil:   { linhas: 6, colunas: 6, minas: 5 },
  medio:   { linhas: 8, colunas: 8, minas: 10 },
  dificil: { linhas: 10, colunas: 10, minas: 18 },
};
const NIVEL_DE = {
  facil: "facil", "fácil": "facil", easy: "facil",
  medio: "medio", "médio": "medio", normal: "medio", medium: "medio",
  dificil: "dificil", "difícil": "dificil", hard: "dificil",
};
export const nivelDe = (t) => NIVEL_DE[String(t ?? "").toLowerCase()] ?? null;

const NUMEROS = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];
export const MINA = "💣";
const vizinhos = (l, c, L, C) => {
  const v = [];
  for (let dl = -1; dl <= 1; dl++) for (let dc = -1; dc <= 1; dc++) {
    if (!dl && !dc) continue;
    const a = l + dl, b = c + dc;
    if (a >= 0 && b >= 0 && a < L && b < C) v.push([a, b]);
  }
  return v;
};

// grade[l][c] = -1 (mina) ou quantas minas há em volta. `inicio` = a casa que vem
// aberta: uma vazia (0) ao acaso; se não houver, a casa sem mina com menos minas em volta.
export function gerarCampo({ linhas, colunas, minas }, rng = Math.random) {
  const total = linhas * colunas;
  const posicoes = [...Array(total).keys()];
  for (let i = total - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [posicoes[i], posicoes[j]] = [posicoes[j], posicoes[i]]; }
  const comMina = new Set(posicoes.slice(0, Math.min(minas, total - 1)));
  const grade = Array.from({ length: linhas }, (_, l) => Array.from({ length: colunas }, (_, c) => (comMina.has(l * colunas + c) ? -1 : 0)));
  for (let l = 0; l < linhas; l++) for (let c = 0; c < colunas; c++) {
    if (grade[l][c] < 0) continue;
    grade[l][c] = vizinhos(l, c, linhas, colunas).filter(([a, b]) => grade[a][b] < 0).length;
  }
  const livres = [];
  for (let l = 0; l < linhas; l++) for (let c = 0; c < colunas; c++) if (grade[l][c] >= 0) livres.push([l, c]);
  const menor = Math.min(...livres.map(([l, c]) => grade[l][c]));
  const candidatas = livres.filter(([l, c]) => grade[l][c] === menor);
  const inicio = candidatas[Math.floor(rng() * candidatas.length)];
  return { grade, inicio };
}

export function textoCampo({ grade, inicio }) {
  return grade.map((linha, l) => linha.map((v, c) => {
    const e = v < 0 ? MINA : NUMEROS[v];
    return l === inicio[0] && c === inicio[1] ? e : `!!${e}!!`;
  }).join("")).join("\n");
}

// ── Jogo da velha ───────────────────────────────────────────────────────────
export const CASAS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
const SIMBOLO = ["❌", "⭕"];
export const JUDY = "JUDY";
const LINHAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const TTL_MS = 10 * 60 * 1000;

const limparEmoji = (e) => { let v = String(e ?? ""); try { v = decodeURIComponent(v); } catch {} return v.replace(/️/g, "").trim(); };
const CASA_DO_EMOJI = new Map(CASAS.map((e, i) => [limparEmoji(e), i]));
export const casaDoEmoji = (e) => CASA_DO_EMOJI.get(limparEmoji(e)) ?? null;

// 0 ou 1 = quem fez a linha; "empate"; null = segue
export function resultado(tab) {
  for (const [a, b, c] of LINHAS) if (tab[a] !== null && tab[a] === tab[b] && tab[a] === tab[c]) return tab[a];
  return tab.every((x) => x !== null) ? "empate" : null;
}

// A Judy joga bem, mas dá para ganhar dela: fecha a linha dela, fecha a sua, pega o
// meio, depois um canto, depois o que sobrar. Não enxerga a armadilha de duas
// ameaças ao mesmo tempo.
export function jogadaDaJudy(tab, eu, rng = Math.random) {
  const livres = tab.map((x, i) => (x === null ? i : null)).filter((i) => i !== null);
  const fecha = (quem) => livres.find((i) => LINHAS.some((l) => l.includes(i) && l.filter((j) => j !== i).every((j) => tab[j] === quem)));
  const ganhar = fecha(eu); if (ganhar !== undefined) return ganhar;
  const bloquear = fecha(1 - eu); if (bloquear !== undefined) return bloquear;
  if (tab[4] === null) return 4;
  const cantos = [0, 2, 6, 8].filter((i) => tab[i] === null);
  const opcoes = cantos.length ? cantos : livres;
  return opcoes[Math.floor(rng() * opcoes.length)];
}

const partidas = new Map();   // messageId → partida
function varrer(agora = Date.now()) { for (const [id, p] of partidas) if (p.vence < agora) partidas.delete(id); }

function textos(lang) {
  const en = lang !== "pt";
  return {
    titulo: en ? "🎮 Tic-tac-toe" : "🎮 Jogo da velha",   // (❌ no começo do título parece erro)
    vez: (n, s) => (en ? `**${n}**'s turn (${s}) — react with the square's number.` : `Vez de **${n}** (${s}) — reaja no número da casa.`),
    venceu: (n, s) => (en ? `🏆 **${n}** (${s}) wins!` : `🏆 **${n}** (${s}) venceu!`),
    empate: en ? "🤝 Draw — nobody wins." : "🤝 Deu velha — ninguém venceu.",
  };
}

function montar(p) {
  const T = textos(p.lang);
  const tab = [0, 3, 6].map((i) => [i, i + 1, i + 2].map((j) => (p.tab[j] === null ? CASAS[j] : SIMBOLO[p.tab[j]])).join("")).join("\n");
  const r = resultado(p.tab);
  const fim = r === "empate" ? T.empate : r !== null ? T.venceu(p.nomes[r], SIMBOLO[r]) : T.vez(p.nomes[p.vez], SIMBOLO[p.vez]);
  return { title: T.titulo, description: `**${p.nomes[0]}** ❌ × ⭕ **${p.nomes[1]}**\n\n${tab}\n\n${fim}`, colour: r === null ? p.COR?.info : p.COR?.sucesso };
}

// Abre a partida: manda o tabuleiro e reage com as nove casas.
export async function iniciarVelha({ ctx, canal, jogadores, nomes, rng = Math.random, lang = "pt" }) {
  varrer();
  const p = { jogadores, nomes, tab: Array(9).fill(null), vez: 0, lang, COR: ctx.COR, rng, exibir: ctx.exibir ?? ((t) => t), vence: Date.now() + TTL_MS };
  const msg = await ctx.sendEmbed(canal, montar(p));
  const id = msg?.id ?? msg?._id;
  if (!id) return null;
  p.msg = msg;
  partidas.set(id, p);
  for (const e of CASAS) {
    try { await msg.react?.(encodeURIComponent(e)); } catch (err) { console.warn("[VELHA] não consegui reagir:", err?.message ?? err); break; }
  }
  return { id, partida: p };
}

// Reação numa mensagem: se é de uma partida, joga (ou ignora) e devolve true.
export async function aoReagir(msgId, userId, emoji) {
  varrer();
  const p = partidas.get(msgId);
  if (!p) return false;
  const casa = casaDoEmoji(emoji);
  if (casa === null || p.jogadores[p.vez] !== userId || p.tab[casa] !== null) return true;   // não é a vez, casa ocupada, emoji de fora
  p.tab[casa] = p.vez;
  p.vence = Date.now() + TTL_MS;
  if (resultado(p.tab) === null) {
    p.vez = 1 - p.vez;
    if (p.jogadores[p.vez] === JUDY) {
      p.tab[jogadaDaJudy(p.tab, p.vez, p.rng)] = p.vez;
      if (resultado(p.tab) === null) p.vez = 1 - p.vez;
    }
  }
  if (resultado(p.tab) !== null) partidas.delete(msgId);
  const e = montar(p);
  try { await p.msg.edit({ embeds: [{ ...e, title: p.exibir(e.title), description: p.exibir(e.description) }] }); }
  catch (err) { console.warn("[VELHA] falha ao editar:", err?.message ?? err); }
  return true;
}
