// ══════════════════════════════════════════════════════════
//  game.js — &game (RPG)
//
//  Fase A: personagem, 9 atributos, XP/nível e distribuição de
//  pontos. Missões, itens e economia vêm nas fases seguintes.
//
//  Regras que vêm do design (DESIGN-rpg-economia.md):
//    xpParaNivel(n)  = 100 × 1,5^(n−1)
//    pontosPorNivel  = 1 + 0,25 × √(INT + SORTE)
//  Sem tetos: Inteligência e Sorte sempre rendem mais, com
//  retorno decrescente.
// ══════════════════════════════════════════════════════════

import * as db from "../core/db.js";
import { resolverUsuario } from "../core/ids.js";

const XP_BASE = 100;
const CRESCIMENTO = 1.5;

// Nomes bonitos e apelidos aceitos na hora de distribuir pontos.
const ATRIB = {
  forca:        { rotulo: "Força",        emoji: "💪", aliases: ["forca", "força", "for", "str"] },
  destreza:     { rotulo: "Destreza",     emoji: "🎯", aliases: ["destreza", "des", "dex"] },
  resistencia:  { rotulo: "Resistência",  emoji: "🛡️", aliases: ["resistencia", "resistência", "res", "def"] },
  agilidade:    { rotulo: "Agilidade",    emoji: "💨", aliases: ["agilidade", "agi", "agl"] },
  vida:         { rotulo: "Vida",         emoji: "❤️", aliases: ["vida", "hp", "vit"] },
  mana:         { rotulo: "Mana",         emoji: "🔷", aliases: ["mana", "mp"] },
  inteligencia: { rotulo: "Inteligência", emoji: "🧠", aliases: ["inteligencia", "inteligência", "int"] },
  sorte:        { rotulo: "Sorte",        emoji: "🍀", aliases: ["sorte", "sor", "luk"] },
  carisma:      { rotulo: "Carisma",      emoji: "✨", aliases: ["carisma", "car", "cha"] },
};

function acharAtributo(txt) {
  const t = String(txt ?? "").toLowerCase().trim();
  if (!t) return null;
  for (const [chave, info] of Object.entries(ATRIB)) {
    if (info.aliases.includes(t)) return chave;
  }
  for (const [chave, info] of Object.entries(ATRIB)) {   // prefixo
    if (chave.startsWith(t) && t.length >= 3) return chave;
  }
  return null;
}

// ── Progressão ────────────────────────────────────────────
// XP para ALCANÇAR o nível n. O nível 2 custa a base (100); cada nível
// seguinte custa 1,5× o anterior.
export function xpParaNivel(n) {
  const alvo = Math.max(2, n);
  return Math.round(XP_BASE * Math.pow(CRESCIMENTO, alvo - 2));
}

export function pontosPorNivel(int, sorte) {
  return 1 + 0.25 * Math.sqrt(Math.max(0, (int ?? 0) + (sorte ?? 0)));
}

export function bonusXp(int, sorte) {
  return 1 + 0.02 * Math.sqrt(Math.max(0, (int ?? 0) + (sorte ?? 0)));
}

// Aplica o XP ganho, subindo de nível quantas vezes for preciso.
// Devolve { subiu, niveisGanhos, pontosGanhos }.
export function aplicarXp(p, xpGanho) {
  let xp = (p.xp ?? 0) + Math.max(0, Math.round(xpGanho));
  let nivel = p.nivel ?? 1;
  let pontos = p.pontos ?? 0;
  let niveisGanhos = 0;

  while (xp >= xpParaNivel(nivel + 1)) {
    xp -= xpParaNivel(nivel + 1);
    nivel++;
    niveisGanhos++;
    pontos += pontosPorNivel(p.inteligencia, p.sorte);
    if (niveisGanhos > 500) break;   // trava de segurança contra laço infinito
  }
  return { xp, nivel, pontos: Math.round(pontos * 100) / 100, niveisGanhos, subiu: niveisGanhos > 0 };
}

// ── Ficha ─────────────────────────────────────────────────
function barraProgresso(atual, total, largura = 12) {
  const pct = Math.max(0, Math.min(1, total ? atual / total : 0));
  const cheias = Math.round(pct * largura);
  return "▰".repeat(cheias) + "▱".repeat(largura - cheias);
}

function montarFicha(p, nomeExibido, P) {
  const proximo = xpParaNivel((p.nivel ?? 1) + 1);
  const linhas = [
    `**Nível ${p.nivel}** · ${p.xp} / ${proximo} XP`,
    `${barraProgresso(p.xp, proximo)}`,
    "",
  ];

  const cols = Object.entries(ATRIB).map(([chave, info]) =>
    `${info.emoji} **${info.rotulo}** ${p[chave]}`);
  // três por linha, para caber bem no embed
  for (let i = 0; i < cols.length; i += 3) linhas.push(cols.slice(i, i + 3).join(" · "));

  const pontos = Math.floor(p.pontos ?? 0);
  linhas.push("");
  if (pontos > 0) {
    linhas.push(`🔹 **${pontos} ponto(s) para distribuir** — \`${P}game pontos <atributo> <quantos>\``);
  } else {
    const falta = (1 - ((p.pontos ?? 0) % 1)).toFixed(2);
    linhas.push(`_Sem pontos livres. Próximo ponto: mais ${falta} (sobe de nível para ganhar)._`);
  }
  linhas.push(`_Ganho por nível: **${pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}** ponto(s) · XP +${((bonusXp(p.inteligencia, p.sorte) - 1) * 100).toFixed(0)}%_`);
  return linhas.join("\n");
}

// ══════════════════════════════════════════════════════════
export async function cmdGame(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId, getServer } = ctx;

  if (!serverId) {
    return sendEmbed(message.channel, { title: "❌ Fora de um servidor",
      description: "O RPG funciona dentro de um servidor — cada um tem o seu personagem.", colour: COR.erro });
  }

  const sub = args[0]?.toLowerCase();
  const eu = message.authorId;

  // ── criar ──
  if (["criar", "novo", "start", "começar", "comecar"].includes(sub)) {
    if (db.getPersonagem(serverId, eu)) {
      return sendEmbed(message.channel, { title: "🎭 Você já tem personagem",
        description: `Veja com \`${P}game\`. Para recomeçar do zero: \`${P}game apagar\`.`, colour: COR.aviso });
    }
    const nome = args.slice(1).join(" ").trim().slice(0, 40)
      || message.author?.username || "Aventureiro";
    const p = db.criarPersonagem(serverId, eu, nome);
    return sendEmbed(message.channel, {
      title: "🎉 Personagem criado",
      description: [
        `**${nome}** entrou no mundo.`,
        "",
        montarFicha(p, nome, P),
        "",
        `Comece distribuindo pontos: \`${P}game pontos forca 1\``,
      ].join("\n"), colour: COR.sucesso });
  }

  // ── apagar ──
  if (["apagar", "deletar", "resetar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, { title: "🎭 Você não tem personagem",
        description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    }
    if (args[1]?.toLowerCase() !== "confirmar") {
      return sendEmbed(message.channel, { title: "⚠️ Isso apaga tudo",
        description: [
          `**${p.nome}** — nível ${p.nivel}, ${p.xp} XP — será perdido para sempre.`,
          "",
          `Se tem certeza: \`${P}game apagar confirmar\``,
        ].join("\n"), colour: COR.aviso });
    }
    db.apagarPersonagem(serverId, eu);
    return sendEmbed(message.channel, { title: "🗑️ Personagem apagado",
      description: `Crie outro quando quiser com \`${P}game criar\`.`, colour: COR.mod });
  }

  // ── pontos ──
  if (["pontos", "ponto", "distribuir", "upar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, { title: "🎭 Você não tem personagem",
        description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    }

    const atributo = acharAtributo(args[1]);
    if (!atributo) {
      const lista = Object.values(ATRIB).map((a) => `${a.emoji} ${a.rotulo}`).join(" · ");
      return sendEmbed(message.channel, { title: "❌ Qual atributo?",
        description: [
          `\`${P}game pontos <atributo> [quantos]\``,
          "",
          lista,
          "",
          `Ex.: \`${P}game pontos int 3\` · aceito abreviações (for, des, res, agi, int, sor…).`,
        ].join("\n"), colour: COR.erro });
    }

    const disponiveis = Math.floor(p.pontos ?? 0);
    const pedido = args[2] ? parseInt(args[2], 10) : 1;
    if (!Number.isFinite(pedido) || pedido < 1) {
      return sendEmbed(message.channel, { title: "❌ Quantidade inválida",
        description: `Use um número: \`${P}game pontos ${args[1]} 2\``, colour: COR.erro });
    }
    if (disponiveis < 1) {
      return sendEmbed(message.channel, { title: "🔸 Sem pontos livres",
        description: `Suba de nível para ganhar pontos. Você ganha **${pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}** por nível.`,
        colour: COR.aviso });
    }
    const usar = Math.min(pedido, disponiveis);

    const antes = p[atributo];
    const atualizado = db.salvarPersonagem(serverId, eu, {
      [atributo]: antes + usar,
      pontos: (p.pontos ?? 0) - usar,
    });

    const info = ATRIB[atributo];
    const linhas = [`${info.emoji} **${info.rotulo}**: ${antes} → **${antes + usar}**`];
    if (usar < pedido) linhas.push(`_Você pediu ${pedido}, mas só tinha ${disponiveis}._`);
    if (atributo === "inteligencia" || atributo === "sorte") {
      linhas.push("", `_Ganho por nível agora: **${pontosPorNivel(atualizado.inteligencia, atualizado.sorte).toFixed(2)}** ponto(s)._`);
    }
    linhas.push("", `Restam **${Math.floor(atualizado.pontos)}** ponto(s).`);
    return sendEmbed(message.channel, { title: "📈 Atributo aumentado",
      description: linhas.join("\n"), colour: COR.sucesso });
  }

  // ── ranking ──
  if (["top", "ranking", "rank"].includes(sub)) {
    const lista = db.listarPersonagens(serverId, 10);
    if (!lista.length) {
      return sendEmbed(message.channel, { title: "🏆 Ranking",
        description: `Ninguém criou personagem ainda. Seja o primeiro: \`${P}game criar\`.`, colour: COR.info });
    }
    const medalha = ["🥇", "🥈", "🥉"];
    const linhas = lista.map((x, i) =>
      `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — nível ${x.nivel} (${x.xp} XP)`);
    return sendEmbed(message.channel, { title: "🏆 Aventureiros do servidor",
      description: linhas.join("\n"), colour: COR.info });
  }

  // ── ajuda ──
  if (["ajuda", "help", "comandos"].includes(sub)) {
    return sendEmbed(message.channel, { title: "🎲 RPG — comandos",
      description: [
        `\`${P}game criar [nome]\` — cria seu personagem`,
        `\`${P}game\` — sua ficha`,
        `\`${P}game ficha @pessoa\` — a ficha de outro`,
        `\`${P}game pontos <atributo> [quantos]\` — distribui pontos`,
        `\`${P}game top\` — ranking do servidor`,
        `\`${P}game apagar confirmar\` — recomeça do zero`,
        "",
        "**Atributos:** " + Object.values(ATRIB).map((a) => a.rotulo).join(", "),
        "",
        "_Inteligência e Sorte aumentam o XP que você ganha e quantos pontos recebe por nível — com retorno decrescente, então nunca param de valer._",
      ].join("\n"), colour: COR.info });
  }

  // ── ficha (padrão) ──
  const server = await getServer?.(message).catch(() => null);
  const alvoId = (sub && !["ficha", "perfil", "status"].includes(sub))
    ? await resolverUsuario(args[0], { message, server })
    : (args[1] ? await resolverUsuario(args[1], { message, server }) : eu);

  const id = alvoId ?? eu;
  const p = db.getPersonagem(serverId, id);
  if (!p) {
    const proprio = id === eu;
    return sendEmbed(message.channel, {
      title: proprio ? "🎭 Você ainda não tem personagem" : "🎭 Sem personagem",
      description: proprio
        ? `Crie o seu com \`${P}game criar [nome]\` e comece a jogar.`
        : `Essa pessoa ainda não criou um personagem.`,
      colour: COR.aviso });
  }

  return sendEmbed(message.channel, {
    title: `🎭 ${p.nome ?? "Aventureiro"}`,
    description: montarFicha(p, p.nome, P),
    colour: COR.info });
}
