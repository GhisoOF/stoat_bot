// &rolar — dados para RPG de mesa, inspirado no AutoDice e indo além:
//   NdM, +/- e constantes:      2d20+1d4+3
//   vantagem/desvantagem:       adv · des  (= 2d20kh1 / 2d20kl1)
//   manter maiores/menores:     4d6kh3 · 2d20kl1
//   explosão:                   3d6!   (máximo rola de novo, com teto)
//   contagem de sucessos:       8d10>=7  (quantos passaram)
//   porcentagem/Fate/moeda:     d% · 4dF · moeda
//   repetição:                  6x(4d6kh3)   (seis fichas de atributo)
//   rótulo:                     1d20+7 # Percepção
//   secreta (só você vê):       &rolar gm 1d20+3
// E &iniciativa — rastreador de ordem de combate por canal.

import { lingua } from "../core/i18n.js";

const MAX_DADOS = 100, MAX_LADOS = 10_000, MAX_TERMOS = 20, MAX_REPETE = 20, MAX_EXPLODE = 50;

const rngPadrao = (lados) => 1 + Math.floor(Math.random() * lados);

// ── Motor (puro; rng injetável para testes determinísticos) ─────────────────
export function rolarExpressao(entrada, rng = rngPadrao) {
  let texto = String(entrada ?? "").trim();
  if (!texto) return { erro: "me diga o que rolar — ex.: `2d20kh1+5`" };

  // rótulo: "expressão # nome"
  let rotulo = null;
  const hash = texto.indexOf("#");
  if (hash >= 0) { rotulo = texto.slice(hash + 1).trim().slice(0, 60) || null; texto = texto.slice(0, hash).trim(); }

  // repetição: "Nx(expr)" ou "Nx expr"
  let repete = 1;
  const rep = texto.match(/^(\d{1,2})x\s*\(?(.+?)\)?$/i);
  if (rep) { repete = Math.min(Number(rep[1]) || 1, MAX_REPETE); texto = rep[2].trim(); }

  // açúcares
  const t = texto.toLowerCase();
  if (["adv", "vantagem", "advantage"].includes(t)) texto = "2d20kh1";
  else if (["des", "dis", "desvantagem", "disadvantage"].includes(t)) texto = "2d20kl1";
  else if (["moeda", "coin", "cara ou coroa"].includes(t)) {
    const caras = Array.from({ length: repete }, () => rng(2) === 2);
    return { rotulo, repeticoes: caras.map((c) => ({ total: c ? 1 : 0, texto: c ? "🪙 **cara**" : "🪙 **coroa**" })), moeda: true };
  }

  const repeticoes = [];
  for (let r = 0; r < repete; r++) {
    const res = rolarUma(texto, rng);
    if (res.erro) return { erro: res.erro };
    repeticoes.push(res);
  }
  return { rotulo, repeticoes };
}

function rolarUma(texto, rng) {
  // separa termos por +/-, preservando o sinal
  const pedacos = texto.replace(/\s+/g, "").match(/[+-]?[^+-]+/g) ?? [];
  if (!pedacos.length) return { erro: "expressão vazia." };
  if (pedacos.length > MAX_TERMOS) return { erro: `no máximo ${MAX_TERMOS} termos por rolagem.` };

  let total = 0;
  const partes = [];
  let sucessosGlobais = null;

  for (const pedaco of pedacos) {
    const sinal = pedaco.startsWith("-") ? -1 : 1;
    const corpo = pedaco.replace(/^[+-]/, "");

    // constante
    if (/^\d+$/.test(corpo)) {
      const n = Number(corpo);
      total += sinal * n;
      partes.push(`${sinal < 0 ? "−" : "+"}${n}`);
      continue;
    }

    // dado: [N]d(M|%|F) [!] [khX|klX] [>=X|<=X]
    const m = corpo.match(/^(\d*)d(\d+|%|f)(!{1,2})?(?:(kh|kl)(\d+))?(?:(>=|<=)(\d+))?$/i);
    if (!m) return { erro: `não entendi \`${pedaco}\` — ex.: \`2d6\`, \`4d6kh3\`, \`3d6!\`, \`8d10>=7\`, \`d%\`, \`4dF\`.` };

    const qtd = Math.min(Number(m[1] || 1), MAX_DADOS);
    if (qtd < 1) return { erro: "quantidade de dados tem que ser ≥ 1." };
    const fate = /f/i.test(m[2]);
    const lados = fate ? 3 : (m[2] === "%" ? 100 : Number(m[2]));
    if (!fate && (lados < 2 || lados > MAX_LADOS)) return { erro: `lados entre 2 e ${MAX_LADOS}.` };
    const explode = !!m[3] && !fate && lados > 1;
    const manter = m[4] ? { modo: m[4].toLowerCase(), n: Math.min(Number(m[5]), qtd) } : null;
    const alvo = m[6] ? { op: m[6], n: Number(m[7]) } : null;

    // rola
    const dados = [];
    for (let i = 0; i < qtd; i++) {
      let v = fate ? rng(3) - 2 : rng(lados);   // Fate: -1, 0, +1
      let soma = v, estouros = 0;
      while (explode && v === lados && estouros < MAX_EXPLODE) { v = rng(lados); soma += v; estouros++; }
      dados.push({ valor: soma, estouros, fate });
    }

    // manter maiores/menores
    let usados = dados.map((d, i) => ({ ...d, i, fora: false }));
    if (manter) {
      const ordenados = [...usados].sort((a, b) => manter.modo === "kh" ? b.valor - a.valor : a.valor - b.valor);
      const ficam = new Set(ordenados.slice(0, manter.n).map((d) => d.i));
      usados = usados.map((d) => ({ ...d, fora: !ficam.has(d.i) }));
    }

    const vivos = usados.filter((d) => !d.fora);
    const mostrar = usados.map((d) => {
      let s = d.fate ? (d.valor > 0 ? `+${d.valor}` : String(d.valor)) : String(d.valor);
      if (d.estouros) s += "💥";
      if (!d.fate && !manter && !alvo && lados === 20 && qtd >= 1) {
        if (d.valor === 20) s = `**${s}**🎯`;
        else if (d.valor === 1) s = `**${s}**💀`;
      }
      return d.fora ? `~~${s}~~` : s;
    });

    if (alvo) {
      const passa = (v) => alvo.op === ">=" ? v >= alvo.n : v <= alvo.n;
      const sucessos = vivos.filter((d) => passa(d.valor)).length;
      sucessosGlobais = (sucessosGlobais ?? 0) + sinal * sucessos;
      partes.push(`${sinal < 0 ? "−" : "+"}[${mostrar.join(", ")}] ${alvo.op}${alvo.n} → **${sucessos}** sucesso(s)`);
    } else {
      const soma = vivos.reduce((a, d) => a + d.valor, 0);
      total += sinal * soma;
      partes.push(`${sinal < 0 ? "−" : "+"}[${mostrar.join(", ")}]`);
    }
  }

  const detalhe = partes.join(" ").replace(/^\+/, "");
  if (sucessosGlobais != null) return { total: sucessosGlobais, detalhe, sucessos: true };
  return { total, detalhe };
}

export function formatarResultado(res, en = false) {
  if (res.erro) return `⚠️ ${res.erro}`;
  const linhas = [];
  for (const r of res.repeticoes) {
    if (res.moeda) { linhas.push(r.texto); continue; }
    const alvo = r.sucessos ? (en ? "successes" : "sucessos") : "";
    linhas.push(`🎲 ${r.detalhe} ⇒ **${r.total}**${alvo ? ` ${alvo}` : ""}`);
  }
  const cab = res.rotulo ? `**${res.rotulo}**\n` : "";
  return cab + linhas.join("\n");
}

// ── Iniciativa por canal ────────────────────────────────────────────────────
const iniciativas = new Map();   // canalId → { ordem: [{nome, valor}], vez: number }

export function iniciativaDe(canalId) {
  if (!iniciativas.has(canalId)) iniciativas.set(canalId, { ordem: [], vez: -1 });
  return iniciativas.get(canalId);
}
export function limparIniciativa(canalId) { iniciativas.delete(canalId); }

function listaIniciativa(st, en) {
  if (!st.ordem.length) return en ? "_empty — `&iniciativa add <name> <roll>`_" : "_vazia — `&iniciativa add <nome> <rolagem>`_";
  return st.ordem.map((p, i) => `${i === st.vez ? "▶️" : "▫️"} \`${String(p.valor).padStart(2)}\` ${p.nome}`).join("\n");
}

// ── Comandos ────────────────────────────────────────────────────────────────
export async function cmdRolar(message, args, ctx) {
  const en = lingua(ctx) === "en";
  let resto = args.join(" ").trim();

  const secreta = /^(gm|secreto|priv|secret)\b/i.test(resto);
  if (secreta) resto = resto.replace(/^(gm|secreto|priv|secret)\b/i, "").trim();

  if (!resto || ["ajuda", "help"].includes(resto.toLowerCase())) {
    return ctx.sendEmbed(message.channel, {
      title: "🎲 " + (en ? "Dice" : "Dados"),
      description: en
        ? "`&rolar 2d20kh1+5` — keep highest · `4d6kh3` drop lowest die\n`&rolar adv` / `&rolar des` — advantage / disadvantage (d20)\n`&rolar 3d6!` — exploding · `8d10>=7` — count successes\n`&rolar d%` · `4dF` (Fate) · `moeda` (coin)\n`&rolar 6x(4d6kh3)` — repeat · `1d20+7 # Perception` — label\n`&rolar gm 1d20` — secret roll (result only for you)"
        : "`&rolar 2d20kh1+5` — mantém o maior · `4d6kh3` descarta o menor dado\n`&rolar adv` / `&rolar des` — vantagem / desvantagem (d20)\n`&rolar 3d6!` — explosão · `8d10>=7` — conta sucessos\n`&rolar d%` · `4dF` (Fate) · `moeda`\n`&rolar 6x(4d6kh3)` — repete · `1d20+7 # Percepção` — rótulo\n`&rolar gm 1d20` — rolagem secreta (resultado só para você)",
      colour: ctx.COR.info,
    });
  }

  const res = rolarExpressao(resto);
  const corpo = formatarResultado(res, en);
  const embed = {
    title: `🎲 ${message.member?.nickname ?? message.author?.username ?? (en ? "Roll" : "Rolagem")}`,
    description: corpo.slice(0, 1900),
    colour: res.erro ? ctx.COR.aviso : ctx.COR.info,
  };

  if (secreta && !res.erro) {
    try {
      const dm = await message.author?.openDM?.();
      if (!dm) throw new Error("sem DM");
      await ctx.sendEmbed(dm, { ...embed, title: "🎲 " + (en ? "Secret roll" : "Rolagem secreta") });
      try { await message.delete(); } catch {}
      return;
    } catch {
      return ctx.sendEmbed(message.channel, {
        title: "🎲", colour: ctx.COR.aviso,
        description: en ? "I couldn't DM you — is your DM open? Rolling in the open would spoil the secret, so I stopped." : "Não consegui te mandar DM — ela está aberta? Rolar às claras estragaria o segredo, então parei.",
      });
    }
  }
  return ctx.sendEmbed(message.channel, embed);
}

export async function cmdIniciativa(message, args, ctx) {
  const en = lingua(ctx) === "en";
  const st = iniciativaDe(message.channelId);
  const sub = String(args[0] ?? "lista").toLowerCase();

  if (["add", "adicionar"].includes(sub)) {
    const resto = args.slice(1);
    if (!resto.length) return ctx.sendEmbed(message.channel, { title: "⚔️", description: en ? "`&iniciativa add <name> [roll or number]` — default `1d20`" : "`&iniciativa add <nome> [rolagem ou número]` — padrão `1d20`", colour: ctx.COR.aviso });
    // último pedaço é expressão/número? senão rola 1d20
    let expr = "1d20", nome = resto.join(" ");
    const cauda = resto[resto.length - 1];
    if (/^\d+$/.test(cauda) || /\d*d(\d+|%|f)/i.test(cauda)) { expr = cauda; nome = resto.slice(0, -1).join(" ") || (message.member?.nickname ?? message.author?.username ?? "?"); }
    let valor;
    if (/^\d+$/.test(expr)) valor = Number(expr);
    else {
      const r = rolarExpressao(expr);
      if (r.erro) return ctx.sendEmbed(message.channel, { title: "⚔️", description: `⚠️ ${r.erro}`, colour: ctx.COR.aviso });
      valor = r.repeticoes[0].total;
    }
    st.ordem.push({ nome: nome.slice(0, 40), valor });
    st.ordem.sort((a, b) => b.valor - a.valor);
    return ctx.sendEmbed(message.channel, { title: en ? "⚔️ Initiative" : "⚔️ Iniciativa", description: `**${nome}** → \`${valor}\`\n\n${listaIniciativa(st, en)}`, colour: ctx.COR.info });
  }

  if (["next", "proximo", "próximo", "prox"].includes(sub)) {
    if (!st.ordem.length) return ctx.sendEmbed(message.channel, { title: "⚔️", description: listaIniciativa(st, en), colour: ctx.COR.aviso });
    st.vez = (st.vez + 1) % st.ordem.length;
    const rodadaNova = st.vez === 0;
    return ctx.sendEmbed(message.channel, {
      title: en ? "⚔️ Turn" : "⚔️ Vez de",
      description: `${rodadaNova ? (en ? "🔄 **New round!**\n" : "🔄 **Nova rodada!**\n") : ""}▶️ **${st.ordem[st.vez].nome}**\n\n${listaIniciativa(st, en)}`,
      colour: ctx.COR.sucesso,
    });
  }

  if (["remover", "remove", "rm"].includes(sub)) {
    const nome = args.slice(1).join(" ").toLowerCase();
    const i = st.ordem.findIndex((p) => p.nome.toLowerCase() === nome);
    if (i < 0) return ctx.sendEmbed(message.channel, { title: "⚔️", description: en ? `**${nome}** isn't on the list.` : `**${nome}** não está na lista.`, colour: ctx.COR.aviso });
    st.ordem.splice(i, 1);
    if (st.vez >= st.ordem.length) st.vez = st.ordem.length - 1;
    return ctx.sendEmbed(message.channel, { title: en ? "⚔️ Initiative" : "⚔️ Iniciativa", description: listaIniciativa(st, en), colour: ctx.COR.info });
  }

  if (["limpar", "clear", "fim", "end"].includes(sub)) {
    limparIniciativa(message.channelId);
    return ctx.sendEmbed(message.channel, { title: "⚔️", description: en ? "Initiative cleared — combat over." : "Iniciativa limpa — combate encerrado.", colour: ctx.COR.sucesso });
  }

  return ctx.sendEmbed(message.channel, { title: en ? "⚔️ Initiative" : "⚔️ Iniciativa", description: listaIniciativa(st, en), colour: ctx.COR.info });
}
