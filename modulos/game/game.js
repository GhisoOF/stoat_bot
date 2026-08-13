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
import * as MISS from "./missoes.js";
import * as FOL from "./followers.js";
import { semear as semearFollowers } from "./followers.js";

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
  // "acessorio" é o slot do CATÁLOGO; acessorio1..3 são as vagas equipáveis
  acessorio:  { emoji: "💍", rotulo: "Acessório" },
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
    const nf = semearFollowers(db);
    semeado = true;
    console.log(`[RPG] catálogo genérico pronto (${n} item(ns), ${nf} follower(s))`);
  } catch (e) { console.error("[RPG] falha ao semear itens:", e?.message ?? e); }
}

// Envia uma lista longa em partes, em vez de cortar no limite do embed.
// Cortar é pior que paginar: a pessoa não percebe que faltou conteúdo.
async function enviarLista(sendEmbed, canal, { titulo, linhas, rodape = "", colour }) {
  const blocos = [];
  let atual = [], tam = 0;
  for (const l of linhas) {
    if (tam + l.length > 1700 && atual.length) { blocos.push(atual); atual = []; tam = 0; }
    atual.push(l); tam += l.length + 1;
  }
  if (atual.length) blocos.push(atual);
  if (!blocos.length) blocos.push([]);

  for (let i = 0; i < blocos.length; i++) {
    const ultimo = i === blocos.length - 1;
    await sendEmbed(canal, {
      title: blocos.length > 1 ? `${titulo} (${i + 1}/${blocos.length})` : titulo,
      description: blocos[i].join("\n") + (ultimo && rodape ? `\n\n${rodape}` : ""),
      colour,
    });
  }
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

// ── Followers ─────────────────────────────────────────────
const ENERGIA_MAX = 5;
// Resgate na dungeon: o dono tem vantagem clara, mas não garantia.
const CHANCE_RESGATE = 0.25;
const BONUS_DONO = 3;        // dono ≈ 75%
const JANELA_DONO_H = 6;     // horas em que só o dono pode tentar
const ENERGIA_MS = 60 * 60_000;   // 1 ponto por hora

// Energia regenera por TEMPO, calculada na hora da leitura (timestamp no
// banco, nunca timer em memória — o bot reinicia).
export function energiaAtual(f) {
  const base = f.energia ?? 0;
  const desde = f.energiaEm ?? 0;
  if (!desde) return Math.min(ENERGIA_MAX, base);
  const ganho = Math.floor((Date.now() - desde) / ENERGIA_MS);
  return Math.min(ENERGIA_MAX, base + Math.max(0, ganho));
}

function gastarEnergia(f, quanto = 1) {
  const atual = energiaAtual(f);
  db.salvarFollower(f.id, { energia: Math.max(0, atual - quanto), energiaEm: Date.now() });
}

function descreverFollower(f, comEnergia = true) {
  const cat = db.getFollowerCatalogo(f.catalogoId);
  if (!cat) return `_(follower desconhecido)_`;
  const cls = FOL.CLASSES[cat.classe] ?? {};
  const rar = RARIDADE_INFO[cat.raridade] ?? {};
  const e = comEnergia ? ` · ⚡${energiaAtual(f)}/${ENERGIA_MAX}` : "";
  const naParty = f.naParty ? " 🎒" : "";
  return `${rar.emoji ?? ""}${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotulo ?? cat.classe}, nv ${f.nivel})_${e}${naParty}`;
}

// Atributos efetivos: os do personagem + o que o equipamento acrescenta.
// É isto que vai para o cálculo da missão — equipar tem que importar.
export function atributosComEquipamento(p, serverId, userId) {
  const extra = bonusEquipados(serverId, userId);
  const out = {};
  for (const a of db.ATRIBUTOS) out[a] = (p[a] ?? 0) + (extra[a] ?? 0);
  return out;
}

// Atributos da PARTY inteira: você + followers, com as magias deles.
// Carisma buffa os companheiros (§2 do design), então entra como multiplicador
// sobre a contribuição dos NPCs.
export function atributosDaParty(p, serverId, userId) {
  const meus = atributosComEquipamento(p, serverId, userId);
  const party = db.getParty(serverId, userId);

  const total = { ...meus };
  const magias = [];
  for (const f of party) {
    const cat = db.getFollowerCatalogo(f.catalogoId);
    if (!cat) continue;
    const attr = FOL.atributosDoFollower(cat, f.nivel);
    // Carisma do líder amplifica o que os followers trazem (retorno decrescente)
    const buff = 1 + 0.05 * Math.sqrt(Math.max(0, meus.carisma ?? 0));
    for (const a of db.ATRIBUTOS) total[a] = (total[a] ?? 0) + Math.round((attr[a] ?? 0) * buff);
    const m = FOL.magiaDo(cat);
    if (m) magias.push(m);
  }

  // Magias custam mana: só entram as que cabem no total de Mana da party.
  let manaLivre = total.mana ?? 0;
  const usadas = [];
  for (const m of magias.sort((a, b) => b.poder - a.poder)) {
    if (manaLivre >= m.custo) { manaLivre -= m.custo; usadas.push(m); }
  }
  return { attr: total, magias: usadas, tamanhoParty: party.length };
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
    return enviarLista(sendEmbed, message.channel, {
      titulo: "🎒 Sua mochila",
      linhas,
      rodape: `_✅ = equipado · \`${P}game equipar <item>\` para usar._`,
      colour: COR.info,
    });
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
  //
  // Um embed não cabe o catálogo inteiro. Sem filtro, mostramos um RESUMO por
  // raridade; com filtro, a lista completa daquela raridade. Assim nada é
  // cortado no meio — o que era pior que paginar, porque a pessoa nem via que
  // faltava conteúdo.
  if (["catalogo", "catálogo", "itens-jogo", "loja"].includes(sub)) {
    const filtro = args[1]?.toLowerCase();
    const raridade = db.RARIDADES.find((r) => r === filtro
      || r.startsWith(filtro ?? "\u0000")
      || (filtro === "épico" && r === "epico")
      || (filtro === "lendário" && r === "lendario"));
    const slotFiltro = ["arma", "capacete", "armadura", "acessorio"].find((x) => x === filtro);

    const lista = db.listarItens({ raridade, slot: slotFiltro });
    if (!lista.length) {
      return sendEmbed(message.channel, { title: "📖 Catálogo",
        description: filtro
          ? `Nada encontrado para **${filtro}**.\n\nRaridades: ${db.RARIDADES.join(", ")}\nSlots: arma, capacete, armadura, acessorio`
          : "Nenhum item cadastrado ainda.",
        colour: COR.aviso });
    }

    // Filtro que não bate em nada: avisa, em vez de cair no resumo como se
    // a pessoa não tivesse pedido nada.
    if (filtro && !raridade && !slotFiltro) {
      return sendEmbed(message.channel, { title: "❌ Filtro desconhecido",
        description: [
          `Não conheço **${filtro}**.`,
          "",
          `**Raridades:** ${db.RARIDADES.join(" · ")}`,
          "**Slots:** arma · capacete · armadura · acessorio",
          "",
          `Sem filtro, \`${P}game catalogo\` mostra o resumo.`,
        ].join("\n"), colour: COR.erro });
    }

    // Sem filtro: resumo (cabe sempre)
    if (!raridade && !slotFiltro) {
      const porRaridade = {};
      for (const i of lista) (porRaridade[i.raridade] ??= []).push(i);
      const linhas = [`**${lista.length}** itens no jogo:`, ""];
      for (const r of db.RARIDADES) {
        const itens = porRaridade[r] ?? [];
        if (!itens.length) continue;
        const info = RARIDADE_INFO[r] ?? {};
        const infinitos = itens.filter((i) => i.infinito).length;
        linhas.push(`${info.emoji} **${info.rotulo}** — ${itens.length} item(ns)${infinitos ? ` · ${infinitos} ♾️` : ""}`);
        linhas.push(`   _${itens.slice(0, 4).map((i) => i.nome).join(", ")}${itens.length > 4 ? "…" : ""}_`);
        linhas.push(`   \`${P}game catalogo ${r}\``);
      }
      linhas.push("", "_♾️ = estoque infinito (sempre dá para comprar)_");
      linhas.push(`_Também filtra por slot:_ \`${P}game catalogo arma\``);
      return sendEmbed(message.channel, { title: "📖 Itens do jogo",
        description: linhas.join("\n").slice(0, 1950), colour: COR.info });
    }

    // Com filtro: lista completa, quebrada em blocos se precisar
    const info = raridade ? (RARIDADE_INFO[raridade] ?? {}) : (SLOT_INFO[slotFiltro] ?? {});
    const titulo = `${info.emoji ?? "📖"} ${info.rotulo ?? filtro} — ${lista.length} item(ns)`;
    const linhas = lista.map((i) =>
      `${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}**${i.infinito ? " ♾️" : ""}\n   ${descreverBonus(i.bonus)}`);

    return enviarLista(sendEmbed, message.channel, {
      titulo, linhas,
      rodape: "_♾️ = estoque infinito_",
      colour: COR.info,
    });
  }

  // ── followers ──
  if (["follower", "followers", "companheiro", "companheiros", "party", "equipe"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, { title: "🎭 Você não tem personagem",
        description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    }
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2).join(" ").trim();

    // ── levar / tirar da party ──
    if (["levar", "adicionar", "party+"].includes(acao)) {
      const meus = db.listarFollowersDe(serverId, eu);
      const alvo = meus.find((f) => {
        const c = db.getFollowerCatalogo(f.catalogoId);
        return c && c.nome.toLowerCase().includes(resto.toLowerCase());
      });
      if (!resto || !alvo) {
        return sendEmbed(message.channel, { title: "❌ Levar quem?",
          description: `\`${P}game follower levar <nome>\`\n\nVeja os seus com \`${P}game followers\`.`, colour: COR.erro });
      }
      if (alvo.naParty) {
        return sendEmbed(message.channel, { title: "🎒 Já está na party",
          description: descreverFollower(alvo), colour: COR.aviso });
      }
      const naParty = db.getParty(serverId, eu);
      if (naParty.length >= 2) {
        return sendEmbed(message.channel, { title: "🎒 Party cheia",
          description: `Você pode levar até **2** followers.\n\nTire alguém com \`${P}game follower tirar <nome>\`.`,
          colour: COR.aviso });
      }
      if (energiaAtual(alvo) < 1) {
        return sendEmbed(message.channel, { title: "😴 Sem energia",
          description: `${descreverFollower(alvo)}\n\nPrecisa descansar — a energia volta com o tempo (1 por hora).`,
          colour: COR.aviso });
      }
      db.salvarFollower(alvo.id, { naParty: 1 });
      return sendEmbed(message.channel, { title: "🎒 Entrou na party",
        description: `${descreverFollower(db.getFollower(alvo.id))}\n\n_Ele gasta 1 de energia por missão de dungeon._`,
        colour: COR.sucesso });
    }

    if (["tirar", "remover", "party-"].includes(acao)) {
      const naParty = db.getParty(serverId, eu);
      const alvo = naParty.find((f) => {
        const c = db.getFollowerCatalogo(f.catalogoId);
        return c && c.nome.toLowerCase().includes((resto || "").toLowerCase());
      }) ?? (naParty.length === 1 && !resto ? naParty[0] : null);
      if (!alvo) {
        return sendEmbed(message.channel, { title: "❌ Tirar quem?",
          description: naParty.length ? `\`${P}game follower tirar <nome>\`` : "Sua party está vazia.",
          colour: COR.erro });
      }
      db.salvarFollower(alvo.id, { naParty: 0 });
      return sendEmbed(message.channel, { title: "👋 Saiu da party",
        description: descreverFollower(db.getFollower(alvo.id)), colour: COR.mod });
    }

    // ── dispensar ──
    if (["dispensar", "demitir"].includes(acao)) {
      const meus = db.listarFollowersDe(serverId, eu);
      const alvo = meus.find((f) => {
        const c = db.getFollowerCatalogo(f.catalogoId);
        return c && c.nome.toLowerCase().includes((resto || "").toLowerCase());
      });
      if (!resto || !alvo) {
        return sendEmbed(message.channel, { title: "❌ Dispensar quem?",
          description: `\`${P}game follower dispensar <nome>\``, colour: COR.erro });
      }
      const nome = db.getFollowerCatalogo(alvo.catalogoId)?.nome ?? "?";
      db.dispensarFollower(alvo.id);
      return sendEmbed(message.channel, { title: "👋 Dispensado",
        description: `**${nome}** seguiu seu caminho.`, colour: COR.mod });
    }

    // ── fotos ──
    if (["fotos", "foto", "album", "álbum"].includes(acao)) {
      const cat = db.acharFollowerCatalogo(resto);
      if (!cat) {
        return sendEmbed(message.channel, { title: "❌ Quem?",
          description: `\`${P}game follower fotos <nome>\``, colour: COR.erro });
      }
      if (!cat.fotos.length) {
        return sendEmbed(message.channel, { title: `📷 ${cat.nome}`,
          description: "_Ainda não tem fotos._", colour: COR.info });
      }
      return sendEmbed(message.channel, { title: `📷 ${cat.nome} (1/${cat.fotos.length})`,
        description: cat.fotos.length > 1 ? `_${cat.fotos.length} fotos no álbum._` : "",
        image: cat.fotos[0], colour: COR.info });
    }

    // ── lista (padrão) ──
    const meus = db.listarFollowersDe(serverId, eu);
    const naParty = meus.filter((f) => f.naParty);
    if (!meus.length) {
      return sendEmbed(message.channel, { title: "👥 Nenhum companheiro",
        description: [
          "Você ainda não tem followers.",
          "",
          "Eles aparecem como **loot de dungeon** — e, quando a economia chegar,",
          "também poderão ser contratados como mercenários.",
          "",
          `_Veja quem existe com \`${P}game recrutas\`._`,
        ].join("\n"), colour: COR.info });
    }
    const linhas = [];
    if (naParty.length) {
      linhas.push(`🎒 **Na party (${naParty.length}/2)**`);
      for (const f of naParty) linhas.push(`   ${descreverFollower(f)}`);
      linhas.push("");
    }
    const fora = meus.filter((f) => !f.naParty);
    if (fora.length) {
      linhas.push("**Disponíveis**");
      for (const f of fora) linhas.push(`   ${descreverFollower(f)}`);
    }
    linhas.push("", `_\`${P}game follower levar <nome>\` para colocar na party · ⚡ = energia_`);
    return enviarLista(sendEmbed, message.channel, {
      titulo: "👥 Seus companheiros", linhas, colour: COR.info });
  }

  // ── recrutas (catálogo de followers) ──
  if (["recrutas", "mercenarios", "mercenários"].includes(sub)) {
    const lista = db.listarFollowersCatalogo();
    const linhas = [];
    const porClasse = {};
    for (const f of lista) (porClasse[f.classe] ??= []).push(f);
    for (const [chave, cls] of Object.entries(FOL.CLASSES)) {
      const grupo = porClasse[chave] ?? [];
      if (!grupo.length) continue;
      linhas.push(`${cls.emoji} **${cls.rotulo}** — ${cls.desc} · magia: _${cls.magia.nome}_`);
      for (const f of grupo) {
        const r = RARIDADE_INFO[f.raridade] ?? {};
        const onde = f.soDungeon ? "🗝️ só em dungeon" : `💰 ${f.preco}`;
        linhas.push(`   ${r.emoji ?? ""} ${f.nome} — ${onde}`);
      }
      linhas.push("");
    }
    linhas.push("_🗝️ = aparece como loot · 💰 = contratável quando a economia chegar_");
    return enviarLista(sendEmbed, message.channel, {
      titulo: "📜 Companheiros que existem", linhas, colour: COR.info });
  }

  // ── missões ──
  if (["missao", "missão", "missoes", "missões", "quest"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, { title: "🎭 Você não tem personagem",
        description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    }

    const acao = args.slice(1).join(" ").trim();

    // sem argumento: lista as missões disponíveis com a chance de cada uma
    if (!acao) {
      const { attr, magias, tamanhoParty } = atributosDaParty(p, serverId, eu);
      const agora = Date.now();
      const espera = Math.max(p.ultimaMissao + 0, 0);
      const linhas = [];

      if (p.recuperandoAte > agora) {
        const min = Math.ceil((p.recuperandoAte - agora) / 60000);
        linhas.push(`🩹 **Você está se recuperando.** Volta em ~${min} min.`, "");
      }

      const porTipo = { mercado: [], facil: [], medio: [], dificil: [] };
      for (const m of MISS.MISSOES) {
        (porTipo[m.tipo === "mercado" ? "mercado" : m.dificuldade] ??= []).push(m);
      }

      linhas.push("🏪 **Mercado** — sem risco, paga pouco");
      for (const m of porTipo.mercado.slice(0, 4)) linhas.push(`   • **${m.nome}**`);

      for (const d of ["facil", "medio", "dificil"]) {
        const info = MISS.DIFICULDADE_INFO[d];
        linhas.push("", `${info.emoji} **${info.rotulo}**`);
        for (const m of porTipo[d] ?? []) {
          const v = MISS.previsao(attr, m, magias, tamanhoParty);
          linhas.push(`   • **${m.nome}** — êxito ${(v.exito * 100).toFixed(0)}% · sobrevive ${(v.sobrevivencia * 100).toFixed(0)}%`);
        }
      }
      linhas.push("", tamanhoParty
        ? `_Chances já contam equipamento e sua party de ${tamanhoParty}._`
        : `_Chances contam seu equipamento. Levar companheiros muda tudo: \`${P}game followers\`._`);
      return enviarLista(sendEmbed, message.channel, {
        titulo: "🗺️ Missões disponíveis", linhas, colour: COR.info });
    }

    const missao = MISS.acharMissao(acao);
    if (!missao) {
      return sendEmbed(message.channel, { title: "❌ Missão desconhecida",
        description: `Não achei **${acao}**. Veja a lista com \`${P}game missao\`.`, colour: COR.erro });
    }

    // cooldown e recuperação
    const agora = Date.now();
    if (p.recuperandoAte > agora) {
      const min = Math.ceil((p.recuperandoAte - agora) / 60000);
      return sendEmbed(message.channel, { title: "🩹 Ainda se recuperando",
        description: `Você caiu na última missão. Volte em **~${min} min**.`, colour: COR.aviso });
    }
    const prontoEm = (p.ultimaMissao ?? 0) + MISS.cooldownMs(missao);
    if (prontoEm > agora) {
      const min = Math.ceil((prontoEm - agora) / 60000);
      return sendEmbed(message.channel, { title: "⏳ Descansando",
        description: `Você acabou de voltar de uma missão. Pode partir de novo em **~${min} min**.`, colour: COR.aviso });
    }

    // ── resolve ──
    const { attr, magias, tamanhoParty } = atributosDaParty(p, serverId, eu);
    const party = db.getParty(serverId, eu);

    // followers sem energia não vão (dungeon só)
    if (missao.tipo !== "mercado") {
      const cansados = party.filter((f) => energiaAtual(f) < 1);
      if (cansados.length) {
        return sendEmbed(message.channel, { title: "😴 Companheiro sem energia",
          description: cansados.map((f) => descreverFollower(f)).join("\n")
            + `\n\nTire da party ou espere a energia voltar (1 por hora).`,
          colour: COR.aviso });
      }
    }

    const r = MISS.resolver(attr, missao, Math.random, magias, tamanhoParty);

    // XP com o bônus de INT/Sorte
    const xpFinal = Math.round(r.xp * bonusXp(attr.inteligencia, attr.sorte));
    const depois = aplicarXp(p, xpFinal);

    const campos = {
      xp: depois.xp, nivel: depois.nivel, pontos: depois.pontos,
      ultimaMissao: agora,
      missoesFeitas: (p.missoesFeitas ?? 0) + 1,
    };
    if (r.desfecho === "caiu") campos.recuperandoAte = agora + 30 * 60_000;
    db.salvarPersonagem(serverId, eu, campos);

    // followers gastam energia em dungeon
    if (missao.tipo !== "mercado") for (const f of party) gastarEnergia(f, 1);

    // ── se a party caiu, os followers são CAPTURADOS na dungeon ──
    const capturados = [];
    if (r.desfecho === "caiu") {
      for (const f of party) {
        // em fácil/médio eles só ficam feridos; em difícil, podem ser capturados
        const chanceCaptura = missao.dificuldade === "dificil" ? 0.5
          : missao.dificuldade === "medio" ? 0.2 : 0;
        if (Math.random() < chanceCaptura) {
          const cat = db.getFollowerCatalogo(f.catalogoId);
          db.capturarFollower(f.id);
          capturados.push(cat?.nome ?? "?");
        } else {
          db.salvarFollower(f.id, { naParty: 0, energia: 0, energiaEm: Date.now() });
        }
      }
    }

    // ── loot ──
    let ganhou = null;
    let ganhouFollower = null;
    if (r.exito && r.sobreviveu) {
      const raridade = MISS.sortearRaridade(missao, attr.sorte, Math.random, tamanhoParty);
      if (raridade) {
        const candidatos = db.listarItens({ raridade });
        if (candidatos.length) {
          ganhou = candidatos[Math.floor(Math.random() * candidatos.length)];
          db.darItem(serverId, eu, ganhou.id);
        }
      }
      // chance de um FOLLOWER aparecer como loot (só em dungeon)
      if (missao.tipo !== "mercado") {
        const chanceFol = { facil: 0.04, medio: 0.07, dificil: 0.12 }[missao.dificuldade] ?? 0;
        if (Math.random() < chanceFol) {
          const raridades = { facil: ["comum"], medio: ["comum", "incomum"],
            dificil: ["incomum", "raro", "epico", "lendario"] }[missao.dificuldade] ?? ["comum"];
          const pool = db.listarFollowersCatalogo()
            .filter((f) => raridades.includes(f.raridade));
          if (pool.length) {
            const cat = pool[Math.floor(Math.random() * pool.length)];
            const nv = Math.max(1, Math.round((missao.nivel ?? 1) * 0.6));
            db.recrutarFollower(serverId, eu, cat.id, nv);
            ganhouFollower = { cat, nivel: nv };
          }
        }
      }
    }

    // ── relato ──
    const titulo = { sucesso: "🏆 Missão cumprida", falha: "😐 Não deu certo", caiu: "💀 Você caiu" }[r.desfecho];
    const cor = { sucesso: COR.sucesso, falha: COR.aviso, caiu: COR.erro }[r.desfecho];
    const linhas = [`**${missao.nome}**`, `_${missao.descricao}_`, ""];

    if (r.desfecho === "sucesso") linhas.push("Você venceu e voltou inteiro.");
    else if (r.desfecho === "falha") linhas.push("Não conseguiu completar, mas voltou vivo — e mais experiente.");
    else linhas.push("Você não aguentou. Voltou de mãos vazias, mas **inteiro**: nada de nível ou equipamento se perde.");

    linhas.push("", `✨ **+${xpFinal} XP**`);
    if (depois.subiu) {
      linhas.push(`🎉 **Subiu para o nível ${depois.nivel}!** (+${(depois.pontos - (p.pontos ?? 0)).toFixed(2)} ponto(s))`);
    }
    if (ganhou) {
      const ri = RARIDADE_INFO[ganhou.raridade] ?? {};
      linhas.push("", `🎁 **Loot:** ${ri.emoji ?? ""} **${ganhou.nome}** — ${descreverBonus(ganhou.bonus)}`);
    } else if (r.desfecho === "sucesso" && missao.tipo !== "mercado") {
      linhas.push("", "_Nenhum item desta vez._");
    }
    if (ganhouFollower) {
      const cls = FOL.CLASSES[ganhouFollower.cat.classe] ?? {};
      linhas.push(`👥 **${ganhouFollower.cat.nome}** (${cls.rotulo}, nv ${ganhouFollower.nivel}) se juntou a você!`);
    }
    if (tamanhoParty) {
      linhas.push("", `_Party de ${tamanhoParty}: a missão foi mais difícil, e parte do loot ficou com eles._`);
    }
    if (capturados.length) {
      linhas.push("", `⛓️ **Capturado(s) na dungeon:** ${capturados.join(", ")}`,
        `_Resgate com \`${P}game dungeon\` — você tem prioridade nas primeiras horas._`);
    }
    if (r.desfecho === "caiu") linhas.push("", "_Você precisa de ~30 min para se recuperar._");

    return sendEmbed(message.channel, { title: titulo, description: linhas.join("\n"), colour: cor });
  }

  // ── dungeon: resgatar followers capturados ──
  if (["dungeon", "resgate", "resgatar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, { title: "🎭 Você não tem personagem",
        description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    }
    const presos = db.listarCapturados(serverId);
    const alvoNome = args.slice(1).join(" ").trim();

    if (!alvoNome) {
      if (!presos.length) {
        return sendEmbed(message.channel, { title: "🕳️ A dungeon está quieta",
          description: "Nenhum companheiro capturado por aqui.", colour: COR.info });
      }
      const linhas = presos.map((f) => {
        const cat = db.getFollowerCatalogo(f.catalogoId);
        const cls = FOL.CLASSES[cat?.classe] ?? {};
        const r = RARIDADE_INFO[cat?.raridade] ?? {};
        const meu = f.donoOriginal === eu;
        const horas = (Date.now() - (f.capturadoEm ?? 0)) / 3600000;
        const janela = horas < JANELA_DONO_H;
        const marca = meu ? " 👤 _seu_" : janela ? " ⏳ _janela do dono_" : "";
        return `${r.emoji ?? ""}${cls.emoji ?? ""} **${cat?.nome ?? "?"}** (nv ${f.nivel})${marca}`;
      });
      linhas.push("", `_\`${P}game dungeon <nome>\` para tentar o resgate._`,
        `_O dono original tem chance maior, e prioridade nas primeiras ${JANELA_DONO_H}h._`);
      return enviarLista(sendEmbed, message.channel, {
        titulo: `⛓️ Capturados na dungeon (${presos.length})`, linhas, colour: COR.aviso });
    }

    const alvo = presos.find((f) => {
      const c = db.getFollowerCatalogo(f.catalogoId);
      return c && c.nome.toLowerCase().includes(alvoNome.toLowerCase());
    });
    if (!alvo) {
      return sendEmbed(message.channel, { title: "❌ Não está lá",
        description: `Não achei **${alvoNome}** entre os capturados.`, colour: COR.erro });
    }
    const cat = db.getFollowerCatalogo(alvo.catalogoId);
    const ehDono = alvo.donoOriginal === eu;
    const horas = (Date.now() - (alvo.capturadoEm ?? 0)) / 3600000;

    // Janela exclusiva: nas primeiras horas só o dono tenta.
    if (!ehDono && horas < JANELA_DONO_H) {
      const faltam = Math.ceil(JANELA_DONO_H - horas);
      return sendEmbed(message.channel, { title: "⏳ Ainda não",
        description: `**${cat?.nome}** foi capturado há pouco. Só o dono original pode tentar nas primeiras **${JANELA_DONO_H}h** — faltam ~${faltam}h.`,
        colour: COR.aviso });
    }

    // já tem 2 na party? o resgate ainda funciona, ele só não entra na party
    const chance = CHANCE_RESGATE * (ehDono ? BONUS_DONO : 1);
    if (Math.random() < chance) {
      db.resgatarFollower(alvo.id, eu);
      return sendEmbed(message.channel, { title: "🔓 Resgatado!",
        description: [
          `**${cat?.nome}** saiu da dungeon com você.`,
          ehDono ? "_De volta para casa._" : "_Não era seu, mas agora é._",
          "",
          `_Ele volta com pouca energia — \`${P}game followers\`._`,
        ].join("\n"), colour: COR.sucesso });
    }
    return sendEmbed(message.channel, { title: "🕳️ Não deu",
      description: [
        `Você não conseguiu tirar **${cat?.nome}** de lá desta vez.`,
        `_Chance era de ${(chance * 100).toFixed(0)}%${ehDono ? " (você é o dono)" : ""}. Pode tentar de novo._`,
      ].join("\n"), colour: COR.aviso });
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
