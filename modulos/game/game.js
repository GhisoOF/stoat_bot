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
import { semear as semearItens } from "./itens-genericos.js";

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

// ── Itens ─────────────────────────────────────────────────
const RARIDADE_INFO = {
  comum:    { emoji: "⚪", rotulo: "Comum" },
  incomum:  { emoji: "🟢", rotulo: "Incomum" },
  raro:     { emoji: "🔵", rotulo: "Raro" },
  epico:    { emoji: "🟣", rotulo: "Épico" },
  lendario: { emoji: "🟠", rotulo: "Lendário" },
};
const SLOT_INFO = {
  arma:       { emoji: "⚔️", rotulo: "Arma" },
  capacete:   { emoji: "🪖", rotulo: "Capacete" },
  armadura:   { emoji: "🛡️", rotulo: "Armadura" },
  acessorio1: { emoji: "💍", rotulo: "Acessório 1" },
  acessorio2: { emoji: "💍", rotulo: "Acessório 2" },
  acessorio3: { emoji: "💍", rotulo: "Acessório 3" },
};

// Semeia o catálogo genérico uma vez por boot.
let semeado = false;
export function iniciarCatalogo() {
  if (semeado) return;
  try {
    const n = semearItens(db);
    semeado = true;
    console.log(`[RPG] catálogo genérico pronto (${n} item(ns))`);
  } catch (e) { console.error("[RPG] falha ao semear itens:", e?.message ?? e); }
}

function descreverBonus(bonus) {
  const partes = Object.entries(bonus ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${ATRIB[k]?.emoji ?? ""}${ATRIB[k]?.rotulo ?? k} +${v}`);
  return partes.length ? partes.join(" · ") : "_sem bônus_";
}

// Soma os bônus de tudo que está equipado.
export function bonusEquipados(serverId, userId) {
  const eq = db.getEquipado(serverId, userId);
  const total = {};
  for (const item of Object.values(eq)) {
    for (const [k, v] of Object.entries(item.bonus ?? {})) {
      total[k] = (total[k] ?? 0) + v;
    }
  }
  return total;
}

// Em qual slot este item cabe? Acessório tem 3 vagas — usa a primeira livre,
// ou a indicada pelo usuário.
function slotParaEquipar(serverId, userId, item, pedido) {
  if (item.slot !== "acessorio") return item.slot;
  if (pedido && /^acessorio[123]$/.test(pedido)) return pedido;
  const eq = db.getEquipado(serverId, userId);
  for (const s of ["acessorio1", "acessorio2", "acessorio3"]) {
    if (!eq[s]) return s;
  }
  return "acessorio1";   // todas cheias: troca a primeira
}

// ── Ficha ─────────────────────────────────────────────────
function barraProgresso(atual, total, largura = 12) {
  const pct = Math.max(0, Math.min(1, total ? atual / total : 0));
  const cheias = Math.round(pct * largura);
  return "▰".repeat(cheias) + "▱".repeat(largura - cheias);
}

function montarFicha(p, nomeExibido, P, serverId, userId) {
  const proximo = xpParaNivel((p.nivel ?? 1) + 1);
  const linhas = [
    `**Nível ${p.nivel}** · ${p.xp} / ${proximo} XP`,
    `${barraProgresso(p.xp, proximo)}`,
    "",
  ];

  // O que o equipamento acrescenta — mostrado ao lado do valor base.
  const extra = (serverId && userId) ? bonusEquipados(serverId, userId) : {};
  const cols = Object.entries(ATRIB).map(([chave, info]) => {
    const bonus = extra[chave] ?? 0;
    return `${info.emoji} **${info.rotulo}** ${p[chave]}${bonus ? ` _(+${bonus})_` : ""}`;
  });
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

  if (serverId && userId) {
    const eq = db.getEquipado(serverId, userId);
    const usados = Object.entries(eq);
    linhas.push("");
    if (usados.length) {
      linhas.push("**Equipado:**");
      for (const s of db.SLOTS) {
        if (!eq[s]) continue;
        const item = eq[s];
        const r = RARIDADE_INFO[item.raridade] ?? {};
        linhas.push(`${SLOT_INFO[s]?.emoji ?? "•"} ${r.emoji ?? ""} **${item.nome}** — ${descreverBonus(item.bonus)}`);
      }
    } else {
      linhas.push(`_Nada equipado._ Veja o que você tem com \`${P}game itens\`.`);
    }
  }
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
        montarFicha(p, nome, P, serverId, eu),
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

  // ── itens / inventário ──
  if (["itens", "inventario", "inventário", "mochila", "bag"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, { title: "🎭 Você não tem personagem",
        description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    }
    const inv = db.getInventario(serverId, eu);
    if (!inv.length) {
      return sendEmbed(message.channel, { title: "🎒 Mochila vazia",
        description: `Você ainda não tem itens. Eles vêm de missões e do mercado.\n\n_Veja o que existe no jogo com \`${P}game catalogo\`._`,
        colour: COR.info });
    }
    const porRaridade = {};
    for (const i of inv) (porRaridade[i.raridade] ??= []).push(i);

    const linhas = [];
    for (const r of db.RARIDADES.slice().reverse()) {
      const lista = porRaridade[r];
      if (!lista?.length) continue;
      const info = RARIDADE_INFO[r] ?? {};
      linhas.push(`${info.emoji} **${info.rotulo}**`);
      for (const i of lista) {
        const equipadoEm = db.slotDoItem(serverId, eu, i.id);
        const marca = equipadoEm ? " ✅" : "";
        const qtd = i.quantidade > 1 ? ` ×${i.quantidade}` : "";
        linhas.push(`   ${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}**${qtd}${marca} — ${descreverBonus(i.bonus)}`);
      }
    }
    linhas.push("", `_✅ = equipado · \`${P}game equipar <item>\` para usar._`);
    return sendEmbed(message.channel, { title: "🎒 Sua mochila",
      description: linhas.join("\n").slice(0, 1950), colour: COR.info });
  }

  // ── equipar ──
  if (["equipar", "usar", "vestir"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, { title: "🎭 Você não tem personagem",
        description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    }
    const busca = args.slice(1).filter((a) => !/^acessorio[123]$/i.test(a)).join(" ").trim();
    const slotPedido = args.find((a) => /^acessorio[123]$/i.test(a))?.toLowerCase();
    if (!busca) {
      return sendEmbed(message.channel, { title: "❌ Equipar o quê?",
        description: `\`${P}game equipar <nome do item>\`\n\nVeja o que você tem com \`${P}game itens\`.`,
        colour: COR.erro });
    }
    const item = db.acharItemPorNome(busca);
    if (!item) {
      return sendEmbed(message.channel, { title: "❌ Item desconhecido",
        description: `Não achei nenhum item chamado **${busca}**.`, colour: COR.erro });
    }
    if (!db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: "❌ Você não tem esse item",
        description: `**${item.nome}** não está na sua mochila.`, colour: COR.erro });
    }
    const jaEm = db.slotDoItem(serverId, eu, item.id);
    if (jaEm) {
      return sendEmbed(message.channel, { title: "✅ Já está equipado",
        description: `**${item.nome}** já está em ${SLOT_INFO[jaEm]?.rotulo ?? jaEm}.`, colour: COR.aviso });
    }

    const slot = slotParaEquipar(serverId, eu, item, slotPedido);
    const anterior = db.getEquipado(serverId, eu)[slot];
    db.equipar(serverId, eu, slot, item.id);

    const linhas = [
      `${SLOT_INFO[slot]?.emoji ?? "•"} **${SLOT_INFO[slot]?.rotulo ?? slot}**: ${item.nome}`,
      descreverBonus(item.bonus),
    ];
    if (anterior) linhas.push("", `_${anterior.nome} voltou para a mochila._`);
    return sendEmbed(message.channel, { title: "⚔️ Equipado",
      description: linhas.join("\n"), colour: COR.sucesso });
  }

  // ── desequipar ──
  if (["desequipar", "tirar", "remover"].includes(sub)) {
    const alvo = (args[1] ?? "").toLowerCase();
    const eq = db.getEquipado(serverId, eu);
    let slot = db.SLOTS.includes(alvo) ? alvo : null;
    if (!slot && alvo) {
      const item = db.acharItemPorNome(args.slice(1).join(" "));
      if (item) slot = db.slotDoItem(serverId, eu, item.id);
    }
    if (!slot) {
      return sendEmbed(message.channel, { title: "❌ Tirar o quê?",
        description: [
          `\`${P}game desequipar <slot ou item>\``,
          "",
          `**Slots:** ${db.SLOTS.join(", ")}`,
        ].join("\n"), colour: COR.erro });
    }
    if (!eq[slot]) {
      return sendEmbed(message.channel, { title: "🔸 Nada nesse slot",
        description: `Não há nada equipado em **${SLOT_INFO[slot]?.rotulo ?? slot}**.`, colour: COR.aviso });
    }
    const nome = eq[slot].nome;
    db.desequipar(serverId, eu, slot);
    return sendEmbed(message.channel, { title: "🎒 Desequipado",
      description: `**${nome}** voltou para a mochila.`, colour: COR.mod });
  }

  // ── catálogo ──
  if (["catalogo", "catálogo", "itens-jogo", "loja"].includes(sub)) {
    const filtroRaridade = db.RARIDADES.find((r) => r === args[1]?.toLowerCase());
    const lista = db.listarItens({ raridade: filtroRaridade });
    if (!lista.length) {
      return sendEmbed(message.channel, { title: "📖 Catálogo",
        description: "Nenhum item cadastrado ainda.", colour: COR.aviso });
    }
    const porRaridade = {};
    for (const i of lista) (porRaridade[i.raridade] ??= []).push(i);
    const linhas = [];
    for (const r of db.RARIDADES) {
      const itens = porRaridade[r];
      if (!itens?.length) continue;
      const info = RARIDADE_INFO[r] ?? {};
      linhas.push(`${info.emoji} **${info.rotulo}** (${itens.length})`);
      for (const i of itens.slice(0, 8)) {
        linhas.push(`   ${SLOT_INFO[i.slot]?.emoji ?? "•"} ${i.nome}${i.infinito ? " ♾️" : ""} — ${descreverBonus(i.bonus)}`);
      }
      if (itens.length > 8) linhas.push(`   _… e mais ${itens.length - 8}_`);
    }
    linhas.push("", "_♾️ = sempre disponível no mercado (estoque infinito)_");
    if (!filtroRaridade) linhas.push(`_Filtre por raridade: \`${P}game catalogo raro\`_`);
    return sendEmbed(message.channel, { title: "📖 Itens do jogo",
      description: linhas.join("\n").slice(0, 1950), colour: COR.info });
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
        `\`${P}game itens\` — sua mochila`,
        `\`${P}game equipar <item>\` · \`${P}game desequipar <slot>\``,
        `\`${P}game catalogo [raridade]\` — todos os itens do jogo`,
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
    description: montarFicha(p, p.nome, P, serverId, id),
    colour: COR.info });
}
