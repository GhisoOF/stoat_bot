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
import * as ECO from "./economia.js";
import { rodarTesteGeral } from "./teste-geral.js";

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

// A cada quantos níveis TODOS os atributos sobem 1 sozinhos.
// A distribuição é híbrida (§2 do design): a base garante que ninguém fique
// inviável, e os pontos livres é que fazem a build.
const NIVEIS_POR_BASE = 2;

// Quanto de base o personagem já deveria ter no nível dado.
export function baseDoNivel(nivel) {
  return Math.floor((Math.max(1, nivel) - 1) / NIVEIS_POR_BASE);
}

// Aplica o XP ganho, subindo de nível quantas vezes for preciso.
export function aplicarXp(p, xpGanho) {
  let xp = (p.xp ?? 0) + Math.max(0, Math.round(xpGanho));
  const nivelAntes = p.nivel ?? 1;
  let nivel = nivelAntes;
  let pontos = p.pontos ?? 0;
  let niveisGanhos = 0;

  while (xp >= xpParaNivel(nivel + 1)) {
    xp -= xpParaNivel(nivel + 1);
    nivel++;
    niveisGanhos++;
    pontos += pontosPorNivel(p.inteligencia, p.sorte);
    if (niveisGanhos > 500) break;   // trava contra laço infinito
  }

  // Crescimento automático da base: o que faltou desde o nível anterior.
  const ganhoBase = baseDoNivel(nivel) - baseDoNivel(nivelAntes);

  return {
    xp, nivel, pontos: Math.round(pontos * 100) / 100,
    niveisGanhos, subiu: niveisGanhos > 0, ganhoBase,
  };
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

// ── Economia ──────────────────────────────────────────────
// Garante que o servidor tenha ao menos a moeda padrão.
export function garantirMoeda(serverId) {
  let m = db.moedaPadrao(serverId);
  if (!m) {
    m = db.upsertMoeda(serverId, { id: "ouro", nome: "Ouro", simbolo: "🪙",
      finita: true, mercado: 10000, padrao: true });
  }
  return m;
}

// P atual (recalculado) e o P suavizado que as fórmulas usam.
export function pDaMoeda(serverId, moeda) {
  const comPlayers = db.totalNasCarteiras(serverId, moeda.id);
  const pAgora = ECO.calcularP(comPlayers, moeda.mercado);
  const pSuave = ECO.suavizar(moeda.pSuave, pAgora);
  db.salvarMoeda(serverId, moeda.id, { pSuave, pEm: Date.now() });
  return { pAgora, pSuave, comPlayers };
}

// Transfere do mercado para o jogador (recompensa) e vice-versa (compra).
function pagarAoJogador(serverId, userId, moeda, qtd) {
  const disponivel = moeda.finita ? Math.min(qtd, moeda.mercado) : qtd;
  if (disponivel <= 0) return 0;
  if (moeda.finita) db.salvarMoeda(serverId, moeda.id, { mercado: moeda.mercado - disponivel });
  db.creditar(serverId, userId, moeda.id, disponivel);
  return disponivel;
}

function jogadorPaga(serverId, userId, moeda, qtd) {
  const pago = db.debitar(serverId, userId, moeda.id, qtd);
  const atual = db.getMoeda(serverId, moeda.id);
  db.salvarMoeda(serverId, moeda.id, { mercado: (atual?.mercado ?? 0) + pago });
  return pago;
}

function fmt(n) { return Math.round(n).toLocaleString("pt-BR"); }

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

  // ── admin (só o dono do bot) ──
  //
  // Existe para testar e depurar sem precisar jogar horas: dar item,
  // moeda, follower, forçar nível e inspecionar os números da economia.
  if (["admin", "debug"].includes(sub)) {
    if (!ctx.ehSuperAdmin?.(eu)) {
      return sendEmbed(message.channel, { title: "🚫 Comando restrito",
        description: "Só o dono do bot usa o modo admin.", colour: COR.erro });
    }
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2);
    const alvoId = message.mentionIds?.[0] ?? eu;
    // A menção <@id> aparece vazia no cliente quando é o próprio autor.
    // Dizer "você" é mais claro do que uma menção que não renderiza.
    const quem = alvoId === eu ? "você" : `<@${alvoId}>`;

    if (!acao || acao === "ajuda") {
      return sendEmbed(message.channel, { title: "🔧 Admin do RPG",
        description: [
          `\`${P}game admin dar <qtd> [@pessoa]\` — credita moeda`,
          `\`${P}game admin item <nome> [@pessoa]\` — dá um item`,
          `\`${P}game admin follower <nome> [nível] [@pessoa]\` — dá um companheiro`,
          `\`${P}game admin nivel <n> [@pessoa]\` — força o nível`,
          `\`${P}game admin pontos <n> [@pessoa]\` — dá pontos livres`,
          `\`${P}game admin energia [@pessoa]\` — enche a energia dos companheiros`,
          `\`${P}game admin cooldown [@pessoa]\` — zera cooldown e recuperação`,
          `\`${P}game admin moeda\` — **cria e configura as moedas** do servidor`,
          `\`${P}game admin teste\` — roda o jogo inteiro e diz o que funcionou`,
          `\`${P}game admin eco\` — números da economia`,
          `\`${P}game admin simular <missao> [n]\` — roda a missão n vezes sem efeito`,
          `\`${P}game admin dungeon <qtd>\` — põe moeda no pote da dungeon`,
          `\`${P}game admin zerar confirmar\` — apaga TODO o RPG deste servidor`,
        ].join("\n"), colour: COR.mod });
    }

    // `admin dar <qtd>` credita moeda. Mantemos `admin moeda <número>` por
    // compatibilidade — mas `admin moeda` sem número abre a configuração.
    if (acao === "dar" || (acao === "moeda" && /^\d+$/.test(resto[0] ?? ""))) {
      const qtd = parseInt(resto[0], 10);
      if (!Number.isFinite(qtd)) return sendEmbed(message.channel, { title: "❌ Quanto?",
        description: `\`${P}game admin moeda 1000\``, colour: COR.erro });
      const m = garantirMoeda(serverId);
      db.creditar(serverId, alvoId, m.id, qtd);
      return sendEmbed(message.channel, { title: "🔧 Moeda creditada",
        description: `${m.simbolo} ${fmt(qtd)} para ${quem} · saldo: ${fmt(db.getSaldo(serverId, alvoId, m.id))}`,
        colour: COR.mod });
    }

    if (acao === "item") {
      const nome = resto.filter((x) => !/^<[@%#]/.test(x)).join(" ");
      const item = db.acharItemPorNome(nome);
      if (!item) return sendEmbed(message.channel, { title: "❌ Item desconhecido",
        description: `Não achei **${nome}**.`, colour: COR.erro });
      db.darItem(serverId, alvoId, item.id);
      return sendEmbed(message.channel, { title: "🔧 Item entregue",
        description: `**${item.nome}** para ${quem}`, colour: COR.mod });
    }

    if (acao === "follower") {
      const argsLimpos = resto.filter((x) => !/^<[@%#]/.test(x));
      const nivel = /^\d+$/.test(argsLimpos[argsLimpos.length - 1] ?? "")
        ? parseInt(argsLimpos.pop(), 10) : 1;
      const cat = db.acharFollowerCatalogo(argsLimpos.join(" "));
      if (!cat) return sendEmbed(message.channel, { title: "❌ Follower desconhecido",
        description: `Não achei **${argsLimpos.join(" ")}**.`, colour: COR.erro });
      db.recrutarFollower(serverId, alvoId, cat.id, nivel);
      return sendEmbed(message.channel, { title: "🔧 Companheiro entregue",
        description: `**${cat.nome}** (nv ${nivel}) para ${quem}`, colour: COR.mod });
    }

    if (acao === "nivel" || acao === "pontos") {
      const n = parseInt(resto[0], 10);
      if (!Number.isFinite(n)) return sendEmbed(message.channel, { title: "❌ Quanto?",
        description: `\`${P}game admin ${acao} 10\``, colour: COR.erro });
      const alvo = db.getPersonagem(serverId, alvoId);
      if (!alvo) return sendEmbed(message.channel, { title: "❌ Sem personagem",
        description: `${quem === "você" ? "Você" : quem} não tem personagem.`, colour: COR.erro });
      db.salvarPersonagem(serverId, alvoId, acao === "nivel" ? { nivel: n, xp: 0 } : { pontos: (alvo.pontos ?? 0) + n });
      return sendEmbed(message.channel, { title: "🔧 Ajustado",
        description: `${quem === "você" ? "Você" : quem}: ${acao} → ${n}`, colour: COR.mod });
    }

    if (acao === "energia") {
      const meus = db.listarFollowersDe(serverId, alvoId);
      for (const f of meus) db.salvarFollower(f.id, { energia: 5, energiaEm: Date.now() });
      return sendEmbed(message.channel, { title: "🔧 Energia cheia",
        description: `${meus.length} companheiro(s) de ${quem}`, colour: COR.mod });
    }

    // Rodar a missão de verdade ignorando cooldown — o que você tentou fazer
    // duas vezes no teste. Zerar o cooldown e repetir o comando funcionava,
    // mas eram dois passos para algo que é de teste.
    if (acao === "missao" || acao === "missão") {
      db.salvarPersonagem(serverId, alvoId, { ultimaMissao: 0, recuperandoAte: 0 });
      // reentra no próprio comando, agora sem cooldown
      return cmdGame(message, ["missao", ...resto], ctx);
    }

    if (acao === "cooldown") {
      db.salvarPersonagem(serverId, alvoId, { ultimaMissao: 0, recuperandoAte: 0 });
      return sendEmbed(message.channel, { title: "🔧 Cooldown zerado",
        description: `${quem === "você" ? "Você pode" : quem + " pode"} partir agora.`, colour: COR.mod });
    }

    if (acao === "dungeon") {
      const qtd = parseInt(resto[0], 10) || 0;
      const m = garantirMoeda(serverId);
      db.salvarMoeda(serverId, m.id, { dungeon: (m.dungeon ?? 0) + qtd });
      const atual = db.getMoeda(serverId, m.id);
      return sendEmbed(message.channel, { title: "🔧 Pote da dungeon",
        description: `Agora tem ${m.simbolo}${fmt(atual.dungeon)} · prêmio seria ${fmt(ECO.premioDungeon(atual.dungeon))}`,
        colour: COR.mod });
    }

    // ── teste geral: roda o jogo inteiro num personagem descartável ──
    if (["teste", "smoke", "testar"].includes(acao)) {
      await sendEmbed(message.channel, { title: "🧪 Rodando o teste geral…",
        description: "Criando um personagem de teste e passando por tudo. Alguns segundos.",
        colour: COR.mod });

      const r = await rodarTesteGeral(ctx, serverId, eu, {
        db,
        G: { garantirMoeda, pDaMoeda, bonusEquipados, atributosComEquipamento,
             atributosDaParty, aplicarXp, bonusXp, baseDoNivel, energiaAtual },
        MISS, FOL, ECO,
      });

      const cabecalho = r.falhas === 0
        ? `✅ **${r.ok} verificações, tudo passou.**`
        : `⚠️ **${r.ok} passaram, ${r.falhas} falharam.**`;

      return enviarLista(sendEmbed, message.channel, {
        titulo: r.falhas === 0 ? "🧪 Teste geral — tudo certo" : "🧪 Teste geral — com falhas",
        linhas: [cabecalho, "", ...r.linhas],
        rodape: `_Personagem de teste apagado${r.devolvido ? ` · ${fmt(r.devolvido)} devolvido(s) ao mercado` : ""}._`,
        colour: r.falhas === 0 ? COR.sucesso : COR.erro,
      });
    }

    // ── programar moedas ──
    if (["moeda", "moedas"].includes(acao)) {
      const op = resto[0]?.toLowerCase();
      const args2 = resto.slice(1);

      if (!op || op === "listar") {
        // se ainda não há moeda, cria a padrão e já mostra a lista —
        // pedir para rodar de novo seria um passo à toa
        if (!db.listarMoedas(serverId).length) garantirMoeda(serverId);
        const lista = db.listarMoedas(serverId);
        const linhas = lista.map((m) => {
          const { pSuave } = pDaMoeda(serverId, m);
          return [
            `${m.simbolo} **${m.nome}** \`${m.id}\`${m.padrao ? " ⭐ _padrão_" : ""}`,
            `   ${m.finita ? "finita" : "infinita"} · dificuldade ${m.dificuldade} · a partir do nível ${m.nivelMin}`,
            `   mercado ${fmt(m.mercado)} · dungeon ${fmt(m.dungeon)} · P ${(pSuave * 100).toFixed(0)}%`,
          ].join("\n");
        });
        linhas.push("", "**Criar / configurar**",
          `\`${P}game admin moeda criar <id> <nome> <símbolo>\``,
          `\`${P}game admin moeda set <id> <campo> <valor>\``,
          `   campos: \`nome\` \`simbolo\` \`finita\` \`dificuldade\` \`nivelMin\` \`mercado\` \`suprimentoBase\``,
          `\`${P}game admin moeda padrao <id>\` — define a principal`,
          `\`${P}game admin moeda remover <id> confirmar\``,
          "",
          "_**dificuldade**: 1 = comum. Maior = aparece menos em missão e rende menos unidades._",
          "_**nivelMin**: só cai em missões desse nível para cima._");
        return enviarLista(sendEmbed, message.channel, { titulo: "🪙 Moedas do servidor", linhas, colour: COR.mod });
      }

      if (op === "criar") {
        const [id, nome, simbolo] = args2;
        if (!id || !nome) {
          return sendEmbed(message.channel, { title: "❌ Uso",
            description: `\`${P}game admin moeda criar <id> <nome> [símbolo]\`\n\nEx.: \`${P}game admin moeda criar prata Prata 🥈\``,
            colour: COR.erro });
        }
        const chave = id.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (!chave) return sendEmbed(message.channel, { title: "❌ ID inválido",
          description: "Use letras e números, sem espaço. Ex.: `prata`, `cristal_negro`.", colour: COR.erro });
        if (db.getMoeda(serverId, chave)) {
          return sendEmbed(message.channel, { title: "❌ Já existe",
            description: `Já há uma moeda \`${chave}\`. Ajuste com \`${P}game admin moeda set\`.`, colour: COR.erro });
        }
        const primeira = db.listarMoedas(serverId).length === 0;
        const m = db.upsertMoeda(serverId, { id: chave, nome, simbolo: simbolo ?? "🪙",
          finita: true, suprimentoBase: 10000, dificuldade: 1, nivelMin: 1, padrao: primeira });
        return sendEmbed(message.channel, { title: "🪙 Moeda criada",
          description: [
            `${m.simbolo} **${m.nome}** \`${m.id}\`${primeira ? " ⭐ _(virou a padrão)_" : ""}`,
            `finita · suprimento ${fmt(m.mercado)} · dificuldade 1 · nível mínimo 1`,
            "",
            `_Ajuste com \`${P}game admin moeda set ${m.id} dificuldade 4\`._`,
          ].join("\n"), colour: COR.sucesso });
      }

      if (op === "set" || op === "editar") {
        const [idM, campo, ...valores] = args2;
        const m = db.acharMoeda(serverId, idM);
        if (!m) return sendEmbed(message.channel, { title: "❌ Moeda desconhecida",
          description: `\`${P}game admin moeda\` lista as existentes.`, colour: COR.erro });
        const valor = valores.join(" ");
        const campos = { nome: "texto", simbolo: "texto", finita: "bool",
          dificuldade: "num", nivelMin: "int", mercado: "num", suprimentoBase: "num" };
        if (!campos[campo]) {
          return sendEmbed(message.channel, { title: "❌ Campo desconhecido",
            description: `Campos: ${Object.keys(campos).map((c) => `\`${c}\``).join(", ")}`, colour: COR.erro });
        }
        let v = valor;
        if (campos[campo] === "num") v = Number(valor);
        if (campos[campo] === "int") v = parseInt(valor, 10);
        if (campos[campo] === "bool") v = ["sim", "true", "1", "finita"].includes(valor.toLowerCase()) ? 1 : 0;
        if ((campos[campo] === "num" || campos[campo] === "int") && !Number.isFinite(v)) {
          return sendEmbed(message.channel, { title: "❌ Valor inválido",
            description: `**${campo}** precisa de um número.`, colour: COR.erro });
        }
        db.salvarMoeda(serverId, m.id, { [campo]: v });
        const atual = db.getMoeda(serverId, m.id);
        return sendEmbed(message.channel, { title: "🪙 Moeda ajustada",
          description: `${atual.simbolo} **${atual.nome}**: \`${campo}\` → **${v}**`, colour: COR.mod });
      }

      if (op === "padrao" || op === "padrão") {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: "❌ Moeda desconhecida", description: "-", colour: COR.erro });
        for (const x of db.listarMoedas(serverId)) db.salvarMoeda(serverId, x.id, { padrao: x.id === m.id ? 1 : 0 });
        return sendEmbed(message.channel, { title: "⭐ Moeda padrão",
          description: `${m.simbolo} **${m.nome}** é a principal do servidor.`, colour: COR.mod });
      }

      if (op === "remover") {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: "❌ Moeda desconhecida", description: "-", colour: COR.erro });
        if (args2[1]?.toLowerCase() !== "confirmar") {
          const total = db.totalNasCarteiras(serverId, m.id);
          return sendEmbed(message.channel, { title: "⚠️ Apaga a moeda e os saldos",
            description: [
              `${m.simbolo} **${m.nome}** — há ${fmt(total)} nas carteiras dos jogadores.`,
              "Tudo isso será **perdido**.",
              "",
              `\`${P}game admin moeda remover ${m.id} confirmar\``,
            ].join("\n"), colour: COR.aviso });
        }
        if (m.padrao && db.listarMoedas(serverId).length > 1) {
          return sendEmbed(message.channel, { title: "❌ É a moeda padrão",
            description: `Defina outra como padrão antes: \`${P}game admin moeda padrao <id>\`.`, colour: COR.erro });
        }
        db.removerMoeda(serverId, m.id);
        return sendEmbed(message.channel, { title: "🗑️ Moeda removida",
          description: `${m.simbolo} **${m.nome}** e todos os saldos dela.`, colour: COR.mod });
      }

      return sendEmbed(message.channel, { title: "❓ Operação desconhecida",
        description: `\`${P}game admin moeda\` lista o que dá para fazer.`, colour: COR.erro });
    }

    if (acao === "eco") {
      const m = garantirMoeda(serverId);
      const { pAgora, pSuave, comPlayers } = pDaMoeda(serverId, m);
      const exemplo = db.listarItens({ raridade: "comum" })[0];
      const linhas = [
        `**${m.nome}** ${m.simbolo} ${m.finita ? "(finita)" : "(infinita)"}`,
        `Carteiras: ${fmt(comPlayers)} · Mercado: ${fmt(m.mercado)} · Dungeon: ${fmt(m.dungeon)}`,
        `P agora: ${(pAgora * 100).toFixed(1)}% · P suavizado: ${(pSuave * 100).toFixed(1)}%`,
        "",
        `mult(P) = **${ECO.mult(pSuave).toFixed(3)}**`,
        `perda(P) = **${(ECO.perda(pSuave) * 100).toFixed(1)}%** do que se carrega`,
        `fração da dungeon = ${(ECO.fracaoDungeon(m.dungeon) * 100).toFixed(1)}% → prêmio ${fmt(ECO.premioDungeon(m.dungeon))}`,
        "",
        exemplo ? `Ex.: **${exemplo.nome}** custa ${fmt(ECO.precoDeVenda(exemplo, db.getEstoque(serverId, exemplo.id), pSuave))}` : "",
        exemplo ? `   recompra com carisma 0: ${fmt(ECO.precoDeRecompra(ECO.precoDeVenda(exemplo, null, pSuave), 0))}` : "",
        exemplo ? `   recompra com carisma 50: ${fmt(ECO.precoDeRecompra(ECO.precoDeVenda(exemplo, null, pSuave), 50))}` : "",
      ].filter(Boolean);
      return sendEmbed(message.channel, { title: "🔧 Economia",
        description: linhas.join("\n"), colour: COR.mod });
    }

    if (acao === "simular") {
      const nomeM = resto.filter((x) => !/^\d+$/.test(x)).join(" ");
      const vezes = Math.min(1000, parseInt(resto.find((x) => /^\d+$/.test(x)) ?? "100", 10));
      const missao = MISS.acharMissao(nomeM);
      if (!missao) return sendEmbed(message.channel, { title: "❌ Missão desconhecida",
        description: `\`${P}game admin simular <missao> [vezes]\``, colour: COR.erro });
      const alvo = db.getPersonagem(serverId, alvoId);
      if (!alvo) return sendEmbed(message.channel, { title: "❌ Sem personagem", description: "-", colour: COR.erro });
      const { attr, magias, tamanhoParty } = atributosDaParty(alvo, serverId, alvoId);
      let ok = 0, falha = 0, caiu = 0, xpTotal = 0, loot = 0;
      for (let i = 0; i < vezes; i++) {
        const r = MISS.resolver(attr, missao, Math.random, magias, tamanhoParty);
        if (r.desfecho === "sucesso") ok++; else if (r.desfecho === "falha") falha++; else caiu++;
        xpTotal += r.xp;
        if (r.exito && r.sobreviveu && MISS.sortearRaridade(missao, attr.sorte, Math.random, tamanhoParty)) loot++;
      }
      const prev = MISS.previsao(attr, missao, magias, tamanhoParty);
      return sendEmbed(message.channel, { title: `🔧 Simulação — ${missao.nome}`,
        description: [
          `**${vezes}** tentativas${tamanhoParty ? ` · party de ${tamanhoParty}` : " · solo"}`,
          "",
          `✅ Sucesso: **${(ok / vezes * 100).toFixed(1)}%** _(previsto ${(prev.exito * prev.sobrevivencia * 100).toFixed(1)}%)_`,
          `😐 Falhou vivo: ${(falha / vezes * 100).toFixed(1)}%`,
          `💀 Caiu: **${(caiu / vezes * 100).toFixed(1)}%**`,
          `🎁 Loot: ${(loot / vezes * 100).toFixed(1)}% das tentativas`,
          `✨ XP médio: ${(xpTotal / vezes).toFixed(0)}`,
          "",
          `_Poder ${prev.poder.toFixed(1)} vs ${(missao.poder * prev.escala).toFixed(1)} · Resiliência ${prev.resil.toFixed(1)} vs ${(missao.risco * prev.escala).toFixed(1)}_`,
        ].join("\n"), colour: COR.mod });
    }

    if (acao === "zerar") {
      if (resto[0]?.toLowerCase() !== "confirmar") {
        return sendEmbed(message.channel, { title: "⚠️ Apaga TUDO",
          description: `Personagens, itens, followers e moedas deste servidor.\n\n\`${P}game admin zerar confirmar\``,
          colour: COR.aviso });
      }
      const d = db.getDb();
      for (const t of ["rpg_personagem", "rpg_inventario", "rpg_equipado", "rpg_followers", "rpg_carteira", "rpg_estoque", "rpg_moedas"]) {
        try { d.prepare(`DELETE FROM ${t} WHERE serverId = ?`).run(serverId); } catch {}
      }
      return sendEmbed(message.channel, { title: "🔧 RPG zerado",
        description: "Tudo apagado neste servidor. O catálogo (itens/followers) continua.", colour: COR.mod });
    }

    return sendEmbed(message.channel, { title: "❓ Ação desconhecida",
      description: `\`${P}game admin\` lista o que dá para fazer.`, colour: COR.erro });
  }

  // ── carteira / economia ──
  if (["carteira", "saldo", "moedas", "economia"].includes(sub)) {
    const moeda = garantirMoeda(serverId);
    const { pAgora, pSuave, comPlayers } = pDaMoeda(serverId, moeda);
    const saldo = db.getSaldo(serverId, eu, moeda.id);
    const linhas = [
      `${moeda.simbolo} **${fmt(saldo)} ${moeda.nome}**`,
      "",
      "**Estado da economia**",
      `Com os jogadores: ${fmt(comPlayers)} · No mercado: ${fmt(moeda.mercado)}`,
      `Concentração (P): **${(pSuave * 100).toFixed(0)}%**`,
      `Preços estão **${ECO.mult(pSuave) > 1.5 ? "altos" : ECO.mult(pSuave) > 1 ? "médios" : "baixos"}** (×${ECO.mult(pSuave).toFixed(2)})`,
      `Cair custa **${(ECO.perda(pSuave) * 100).toFixed(0)}%** do que você carrega`,
      "",
      `🕳️ Na dungeon: ${fmt(moeda.dungeon)} ${moeda.simbolo}`,
      moeda.dungeon > 0 ? `_Vencer a dungeon devolve ~${fmt(ECO.premioDungeon(moeda.dungeon))}._` : "",
      "",
      `_P alto = players ricos → itens baratos, morrer caro._`,
      `_P baixo = mercado cheio → itens caros, morrer barato._`,
    ].filter(Boolean);
    return sendEmbed(message.channel, { title: "💰 Sua carteira",
      description: linhas.join("\n"), colour: COR.info });
  }

  // ── mercado entre jogadores ──
  //
  // Três formas, todas com CUSTÓDIA: o que está em jogo sai da carteira de
  // quem anuncia e fica com o bot até fechar ou cancelar. Sem isso, qualquer
  // uma delas vira golpe na primeira semana.
  if (["mercado", "bazar", "p2p"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: "🎭 Sem personagem",
      description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });

    const moeda = garantirMoeda(serverId);
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2);

    // ── anunciar item por moeda ──
    if (["vender", "anunciar"].includes(acao)) {
      const preco = parseInt(resto[resto.length - 1], 10);
      const nomeItem = resto.slice(0, -1).join(" ").trim();
      if (!nomeItem || !Number.isFinite(preco) || preco < 1) {
        return sendEmbed(message.channel, { title: "❌ Uso",
          description: `\`${P}game mercado vender <item> <preço>\`\n\nEx.: \`${P}game mercado vender Espada de Ferro 250\``,
          colour: COR.erro });
      }
      const item = db.acharItemPorNome(nomeItem);
      if (!item || !db.temItem(serverId, eu, item.id)) {
        return sendEmbed(message.channel, { title: "❌ Você não tem isso",
          description: `**${nomeItem}** não está na sua mochila.`, colour: COR.erro });
      }
      // custódia: o item sai agora
      const slot = db.slotDoItem(serverId, eu, item.id);
      if (slot) db.desequipar(serverId, eu, slot);
      db.tirarItem(serverId, eu, item.id, 1);
      const of = db.criarOferta({ serverId, tipo: "venda", autorId: eu,
        itemOferecido: item.id, moedaPedida: moeda.id, qtdPedida: preco });
      return sendEmbed(message.channel, { title: "🏷️ Anunciado",
        description: [
          `**${item.nome}** por ${moeda.simbolo}${fmt(preco)}`,
          `_O item ficou em custódia comigo até alguém comprar ou você cancelar._`,
          "",
          `Oferta **#${of.id}** · cancelar: \`${P}game mercado cancelar ${of.id}\``,
        ].join("\n"), colour: COR.sucesso });
    }

    // ── comprar ──
    if (["comprar", "aceitar"].includes(acao)) {
      const id = parseInt(resto[0], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      if (!of || of.serverId !== serverId || of.estado !== "aberta") {
        return sendEmbed(message.channel, { title: "❌ Oferta indisponível",
          description: `Veja as abertas com \`${P}game mercado\`.`, colour: COR.erro });
      }
      if (of.autorId === eu) {
        return sendEmbed(message.channel, { title: "🤔 É sua",
          description: `Para tirar do ar: \`${P}game mercado cancelar ${of.id}\`.`, colour: COR.aviso });
      }

      const volume = db.volumeRecente(serverId);
      const { pct, valor: taxa } = ECO.calcularTaxa(of.qtdPedida, volume);
      const total = of.qtdPedida;
      const saldo = db.getSaldo(serverId, eu, of.moedaPedida ?? moeda.id);
      if (saldo < total) {
        return sendEmbed(message.channel, { title: "💸 Saldo insuficiente",
          description: `Precisa de ${moeda.simbolo}${fmt(total)} — você tem ${moeda.simbolo}${fmt(saldo)}.`,
          colour: COR.erro });
      }

      // troca: comprador paga, vendedor recebe menos a taxa, taxa vai ao mercado
      db.debitar(serverId, eu, of.moedaPedida, total);
      db.creditar(serverId, of.autorId, of.moedaPedida, total - taxa);
      const m = db.getMoeda(serverId, of.moedaPedida);
      if (m) db.salvarMoeda(serverId, of.moedaPedida, { mercado: (m.mercado ?? 0) + taxa });

      if (of.tipo === "cambio") {
        db.creditar(serverId, eu, of.moedaOferecida, of.qtdOferecida);
      } else {
        db.darItem(serverId, eu, of.itemOferecido);
      }
      db.fecharOferta(of.id, "fechada", total);

      const oQue = of.tipo === "cambio"
        ? `${fmt(of.qtdOferecida)} ${db.getMoeda(serverId, of.moedaOferecida)?.simbolo ?? ""}`
        : `**${db.getItem(of.itemOferecido)?.nome ?? "?"}**`;
      return sendEmbed(message.channel, { title: "🤝 Negócio fechado",
        description: [
          `Você levou ${oQue} por ${moeda.simbolo}${fmt(total)}.`,
          `_Taxa do mercado: ${moeda.simbolo}${fmt(taxa)} (${(pct * 100).toFixed(2)}%)_`,
        ].join("\n"), colour: COR.sucesso });
    }

    // ── cancelar (devolve a custódia) ──
    if (["cancelar", "retirar"].includes(acao)) {
      const id = parseInt(resto[0], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      if (!of || of.autorId !== eu || of.estado !== "aberta") {
        return sendEmbed(message.channel, { title: "❌ Não dá para cancelar",
          description: "A oferta não existe, não é sua, ou já fechou.", colour: COR.erro });
      }
      if (of.itemOferecido) db.darItem(serverId, eu, of.itemOferecido);
      if (of.moedaOferecida) db.creditar(serverId, eu, of.moedaOferecida, of.qtdOferecida);
      db.fecharOferta(of.id, "cancelada");
      return sendEmbed(message.channel, { title: "↩️ Cancelada",
        description: "O que estava em custódia voltou para você.", colour: COR.mod });
    }

    // ── listar (padrão) ──
    const ofertas = db.listarOfertas(serverId);
    if (!ofertas.length) {
      return sendEmbed(message.channel, { title: "🏪 Bazar vazio",
        description: [
          "Ninguém está vendendo nada agora.",
          "",
          `\`${P}game mercado vender <item> <preço>\` — anuncie o seu`,
          `\`${P}game cambio <qtd> <moeda> por <qtd> <moeda>\` — troca de moedas`,
          `\`${P}game trocar @pessoa <seu item> por <item dela>\` — escambo`,
        ].join("\n"), colour: COR.info });
    }
    const volume = db.volumeRecente(serverId);
    const linhas = ofertas.map((o) => {
      const dono = o.autorId === eu ? " _(sua)_" : "";
      if (o.tipo === "cambio") {
        const de = db.getMoeda(serverId, o.moedaOferecida);
        return `\`#${o.id}\` 💱 ${fmt(o.qtdOferecida)} ${de?.simbolo ?? ""} por ${moeda.simbolo}${fmt(o.qtdPedida)}${dono}`;
      }
      const it = db.getItem(o.itemOferecido);
      const r = RARIDADE_INFO[it?.raridade] ?? {};
      return `\`#${o.id}\` ${r.emoji ?? ""} **${it?.nome ?? "?"}** — ${moeda.simbolo}${fmt(o.qtdPedida)}${dono}`;
    });
    linhas.push("", `_\`${P}game mercado comprar <#>\` · taxa atual: **${(ECO.taxaMercado(volume) * 100).toFixed(2)}%**_`);
    return enviarLista(sendEmbed, message.channel, { titulo: "🏪 Bazar dos jogadores", linhas, colour: COR.info });
  }

  // ── câmbio entre jogadores ──
  if (["cambio", "câmbio"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: "🎭 Sem personagem",
      description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });

    const moedas = db.listarMoedas(serverId);
    const texto = args.slice(1).join(" ");
    const m = texto.match(/^(\d+)\s+(\S+)\s+por\s+(\d+)\s+(\S+)$/i);
    if (!m) {
      const padrao = garantirMoeda(serverId);
      const { pSuave } = pDaMoeda(serverId, padrao);
      const linhas = [
        `\`${P}game cambio <qtd> <moeda> por <qtd> <moeda>\``,
        `Ex.: \`${P}game cambio 100 ouro por 5 prata\``,
        "",
        "**Moedas do servidor:**",
        ...moedas.map((x) => `${x.simbolo} **${x.nome}** — você tem ${fmt(db.getSaldo(serverId, eu, x.id))}`),
        "",
        `_Taxa de referência do sistema: spread de ${(ECO.CFG.spread * 100).toFixed(0)}%._`,
        `_No balcão você define a taxa que quiser; quem aceitar, aceita._`,
      ];
      if (moedas.length < 2) linhas.push("", "_Só há uma moeda aqui — o câmbio precisa de pelo menos duas._");
      return enviarLista(sendEmbed, message.channel, { titulo: "💱 Balcão de câmbio", linhas, colour: COR.info });
    }

    const [, qtdDe, nomeDe, qtdPara, nomePara] = m;
    const de = db.acharMoeda(serverId, nomeDe);
    const para = db.acharMoeda(serverId, nomePara);
    if (!de || !para || de.id === para.id) {
      return sendEmbed(message.channel, { title: "❌ Moedas inválidas",
        description: "Precisam ser duas moedas diferentes deste servidor.", colour: COR.erro });
    }
    const saldo = db.getSaldo(serverId, eu, de.id);
    if (saldo < Number(qtdDe)) {
      return sendEmbed(message.channel, { title: "💸 Saldo insuficiente",
        description: `Você tem ${de.simbolo}${fmt(saldo)}.`, colour: COR.erro });
    }
    // custódia
    db.debitar(serverId, eu, de.id, Number(qtdDe));
    const of = db.criarOferta({ serverId, tipo: "cambio", autorId: eu,
      moedaOferecida: de.id, qtdOferecida: Number(qtdDe),
      moedaPedida: para.id, qtdPedida: Number(qtdPara) });

    // compara com a taxa do sistema, para quem aceitar saber se é bom negócio
    const pDe = pDaMoeda(serverId, de).pSuave, pPara = pDaMoeda(serverId, para).pSuave;
    const ref = ECO.converter(Number(qtdDe), pDe, pPara);
    return sendEmbed(message.channel, { title: "💱 Oferta publicada",
      description: [
        `Oferece **${fmt(qtdDe)} ${de.nome}** ${de.simbolo} por **${fmt(qtdPara)} ${para.nome}** ${para.simbolo}`,
        `_O sistema pagaria ~${fmt(ref.recebe)} — a sua taxa é ${Number(qtdPara) < ref.recebe ? "melhor para quem aceitar" : "pior para quem aceitar"}._`,
        "",
        `Oferta **#${of.id}** · o valor ficou em custódia comigo.`,
      ].join("\n"), colour: COR.sucesso });
  }

  // ── escambo: item por item ──
  if (["trocar", "escambo", "permuta"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: "🎭 Sem personagem",
      description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });

    const acao = args[1]?.toLowerCase();

    // aceitar uma proposta
    if (["aceitar", "aceito"].includes(acao)) {
      const id = parseInt(args[2], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      if (!of || of.tipo !== "troca" || of.estado !== "aberta" || of.serverId !== serverId) {
        return sendEmbed(message.channel, { title: "❌ Proposta indisponível",
          description: `Veja as suas com \`${P}game trocar\`.`, colour: COR.erro });
      }
      if (of.alvoId && of.alvoId !== eu) {
        return sendEmbed(message.channel, { title: "❌ Não é para você",
          description: "Essa proposta foi feita a outra pessoa.", colour: COR.erro });
      }
      if (!db.temItem(serverId, eu, of.itemPedido)) {
        const pedido = db.getItem(of.itemPedido);
        return sendEmbed(message.channel, { title: "❌ Você não tem o que ele quer",
          description: `A proposta pede **${pedido?.nome ?? "?"}**.`, colour: COR.erro });
      }
      // troca atômica: o item dele já está em custódia
      const slot = db.slotDoItem(serverId, eu, of.itemPedido);
      if (slot) db.desequipar(serverId, eu, slot);
      db.tirarItem(serverId, eu, of.itemPedido, 1);
      db.darItem(serverId, eu, of.itemOferecido);
      db.darItem(serverId, of.autorId, of.itemPedido);
      db.fecharOferta(of.id, "fechada", 0);
      return sendEmbed(message.channel, { title: "🔄 Trocado",
        description: [
          `Você deu **${db.getItem(of.itemPedido)?.nome}** e levou **${db.getItem(of.itemOferecido)?.nome}**.`,
          `_<@${of.autorId}> recebeu o seu._`,
        ].join("\n"), colour: COR.sucesso });
    }

    // propor: &game trocar @pessoa <meu item> por <item dela>
    const texto = args.slice(1).join(" ");
    const mm = texto.match(/^(.*?)\s+por\s+(.*)$/i);
    if (!mm) {
      const minhas = db.listarOfertas(serverId, { tipo: "troca" })
        .filter((o) => o.autorId === eu || !o.alvoId || o.alvoId === eu);
      const linhas = minhas.length ? minhas.map((o) => {
        const ofe = db.getItem(o.itemOferecido), ped = db.getItem(o.itemPedido);
        const quem = o.autorId === eu ? "você oferece" : "oferecem a você";
        return `\`#${o.id}\` ${quem}: **${ofe?.nome}** por **${ped?.nome}**`;
      }) : ["_Nenhuma proposta aberta._"];
      linhas.push("", `\`${P}game trocar [@pessoa] <seu item> por <item dela>\``,
        `\`${P}game trocar aceitar <#>\` — fecha a troca`);
      return enviarLista(sendEmbed, message.channel, { titulo: "🔄 Escambo", linhas, colour: COR.info });
    }

    const alvoId = message.mentionIds?.[0] ?? null;
    const meuNome = mm[1].replace(/<[@%#][^>]*>/g, "").trim();
    const item = db.acharItemPorNome(meuNome);
    const quer = db.acharItemPorNome(mm[2].trim());
    if (!item || !quer) {
      return sendEmbed(message.channel, { title: "❌ Item desconhecido",
        description: `Não achei ${!item ? `**${meuNome}**` : `**${mm[2].trim()}**`}.`, colour: COR.erro });
    }
    if (!db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: "❌ Você não tem isso",
        description: `**${item.nome}** não está na sua mochila.`, colour: COR.erro });
    }
    // custódia do lado de quem propõe
    const slot = db.slotDoItem(serverId, eu, item.id);
    if (slot) db.desequipar(serverId, eu, slot);
    db.tirarItem(serverId, eu, item.id, 1);
    const of = db.criarOferta({ serverId, tipo: "troca", autorId: eu, alvoId,
      itemOferecido: item.id, itemPedido: quer.id });
    return sendEmbed(message.channel, { title: "🔄 Proposta feita",
      description: [
        `Oferece **${item.nome}** por **${quer.nome}**${alvoId ? ` a <@${alvoId}>` : " (aberta a qualquer um)"}`,
        `_Seu item ficou em custódia comigo._`,
        "",
        `Proposta **#${of.id}** · quem aceitar: \`${P}game trocar aceitar ${of.id}\``,
        `Cancelar: \`${P}game mercado cancelar ${of.id}\``,
      ].join("\n"), colour: COR.sucesso });
  }

  // ── loja: comprar e vender ──
  if (["comprar", "loja"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: "🎭 Sem personagem",
      description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });

    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const busca = args.slice(1).join(" ").trim();

    if (!busca) {
      const itens = db.listarItens().slice(0, 40);
      const linhas = itens.map((i) => {
        const est = db.getEstoque(serverId, i.id);
        const preco = ECO.precoDeVenda(i, est, pSuave);
        const qtd = i.infinito ? "♾️" : `${est?.quantidade ?? est?.base ?? 10}un`;
        const r = RARIDADE_INFO[i.raridade] ?? {};
        return `${r.emoji ?? ""} **${i.nome}** — ${moeda.simbolo}${fmt(preco)} _(${qtd})_`;
      });
      linhas.push("", `_\`${P}game comprar <item>\` · seu saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}_`);
      return enviarLista(sendEmbed, message.channel, { titulo: "🏪 Mercado", linhas, colour: COR.info });
    }

    const item = db.acharItemPorNome(busca);
    if (!item) return sendEmbed(message.channel, { title: "❌ Item desconhecido",
      description: `Não achei **${busca}** no mercado.`, colour: COR.erro });

    const est = db.getEstoque(serverId, item.id);
    if (!item.infinito && (est?.quantidade ?? est?.base ?? 10) <= 0) {
      return sendEmbed(message.channel, { title: "📦 Esgotado",
        description: `**${item.nome}** acabou no mercado. Itens finitos voltam quando alguém vende.`, colour: COR.aviso });
    }
    const preco = ECO.precoDeVenda(item, est, pSuave);
    const saldo = db.getSaldo(serverId, eu, moeda.id);
    if (saldo < preco) {
      return sendEmbed(message.channel, { title: "💸 Saldo insuficiente",
        description: `**${item.nome}** custa ${moeda.simbolo}${fmt(preco)} — você tem ${moeda.simbolo}${fmt(saldo)}.`,
        colour: COR.erro });
    }
    jogadorPaga(serverId, eu, moeda, preco);
    db.darItem(serverId, eu, item.id);
    if (!item.infinito) db.ajustarEstoque(serverId, item.id, -1);
    return sendEmbed(message.channel, { title: "🛒 Comprado",
      description: [
        `${RARIDADE_INFO[item.raridade]?.emoji ?? ""} **${item.nome}** — ${descreverBonus(item.bonus)}`,
        `Pagou ${moeda.simbolo}${fmt(preco)} · resta ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}`,
        "",
        `_Equipe com \`${P}game equipar ${item.nome}\`._`,
      ].join("\n"), colour: COR.sucesso });
  }

  if (["vender"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: "🎭 Sem personagem",
      description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    const busca = args.slice(1).join(" ").trim();
    if (!busca) return sendEmbed(message.channel, { title: "❌ Vender o quê?",
      description: `\`${P}game vender <item>\`\n\nO mercado paga **abaixo** do preço de venda — seu ✨Carisma melhora a oferta.`,
      colour: COR.erro });

    const item = db.acharItemPorNome(busca);
    if (!item || !db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: "❌ Você não tem isso",
        description: `**${busca}** não está na sua mochila.`, colour: COR.erro });
    }
    const slot = db.slotDoItem(serverId, eu, item.id);
    if (slot) db.desequipar(serverId, eu, slot);

    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const attr = atributosComEquipamento(p, serverId, eu);
    const precoVenda = ECO.precoDeVenda(item, db.getEstoque(serverId, item.id), pSuave);
    const recebe = ECO.precoDeRecompra(precoVenda, attr.carisma);

    db.tirarItem(serverId, eu, item.id, 1);
    if (!item.infinito) db.ajustarEstoque(serverId, item.id, +1);
    const pago = pagarAoJogador(serverId, eu, db.getMoeda(serverId, moeda.id), recebe);

    return sendEmbed(message.channel, { title: "💵 Vendido",
      description: [
        `**${item.nome}** → ${moeda.simbolo}${fmt(pago)}`,
        `_O mercado vende por ${moeda.simbolo}${fmt(precoVenda)}; com seu Carisma (${attr.carisma}) você tirou ${(ECO.fatorRecompra(attr.carisma) * 100).toFixed(0)}%._`,
        slot ? "\n_Estava equipado — foi desequipado._" : "",
      ].filter(Boolean).join("\n"), colour: COR.sucesso });
  }

  // ── contratar mercenário ──
  if (["contratar", "recrutar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: "🎭 Sem personagem",
      description: `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    const busca = args.slice(1).join(" ").trim();
    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const attr = atributosComEquipamento(p, serverId, eu);
    // Carisma reduz o preço do mercenário (§2 do design)
    const desconto = 1 - 0.30 * (Math.sqrt(Math.max(0, attr.carisma)) / (Math.sqrt(Math.max(0, attr.carisma)) + 8));

    if (!busca) {
      const lista = db.listarFollowersCatalogo({ soVendidos: true });
      const linhas = lista.map((f) => {
        const cls = FOL.CLASSES[f.classe] ?? {};
        const r = RARIDADE_INFO[f.raridade] ?? {};
        const preco = Math.round(f.preco * ECO.mult(pSuave) * desconto);
        return `${r.emoji ?? ""}${cls.emoji ?? ""} **${f.nome}** _(${cls.rotulo})_ — ${moeda.simbolo}${fmt(preco)}`;
      });
      linhas.push("", `_Seu Carisma (${attr.carisma}) dá **${((1 - desconto) * 100).toFixed(0)}%** de desconto._`,
        `_Saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))} · \`${P}game contratar <nome>\`_`);
      return enviarLista(sendEmbed, message.channel, { titulo: "🤝 Mercenários disponíveis", linhas, colour: COR.info });
    }

    const cat = db.acharFollowerCatalogo(busca);
    if (!cat) return sendEmbed(message.channel, { title: "❌ Não conheço",
      description: `Não achei **${busca}**.`, colour: COR.erro });
    if (cat.soDungeon || !cat.preco) {
      return sendEmbed(message.channel, { title: "🗝️ Não está à venda",
        description: `**${cat.nome}** só aparece como loot de dungeon.`, colour: COR.aviso });
    }
    const preco = Math.round(cat.preco * ECO.mult(pSuave) * desconto);
    const saldo = db.getSaldo(serverId, eu, moeda.id);
    if (saldo < preco) {
      return sendEmbed(message.channel, { title: "💸 Saldo insuficiente",
        description: `**${cat.nome}** custa ${moeda.simbolo}${fmt(preco)} — você tem ${moeda.simbolo}${fmt(saldo)}.`,
        colour: COR.erro });
    }
    jogadorPaga(serverId, eu, moeda, preco);
    const novo = db.recrutarFollower(serverId, eu, cat.id, 1);
    const cls = FOL.CLASSES[cat.classe] ?? {};
    return sendEmbed(message.channel, { title: "🤝 Contratado",
      description: [
        `${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotulo}, nv 1)_ entrou para o seu grupo.`,
        `Pagou ${moeda.simbolo}${fmt(preco)} · resta ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}`,
        "",
        `_Leve com \`${P}game follower levar ${cat.nome}\`._`,
      ].join("\n"), colour: COR.sucesso });
  }

  // ── descanso pago ──
  if (["descansar", "descanso"].includes(sub)) {
    const meus = db.listarFollowersDe(serverId, eu);
    const cansados = meus.filter((f) => energiaAtual(f) < 5);
    if (!cansados.length) {
      return sendEmbed(message.channel, { title: "😌 Todos descansados",
        description: "Ninguém precisa de descanso agora.", colour: COR.info });
    }
    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const faltando = cansados.reduce((acc, f) => acc + (5 - energiaAtual(f)), 0);
    const custo = Math.max(1, Math.round(faltando * 25 * ECO.mult(pSuave)));
    const saldo = db.getSaldo(serverId, eu, moeda.id);

    if (args[1]?.toLowerCase() !== "confirmar") {
      return sendEmbed(message.channel, { title: "🛏️ Descanso pago",
        description: [
          `Restaurar **${faltando}** ponto(s) de energia de **${cansados.length}** companheiro(s).`,
          `Custo: ${moeda.simbolo}${fmt(custo)} · seu saldo: ${moeda.simbolo}${fmt(saldo)}`,
          "",
          `Confirme com \`${P}game descansar confirmar\`.`,
          "_A energia também volta sozinha: 1 por hora._",
        ].join("\n"), colour: COR.aviso });
    }
    if (saldo < custo) {
      return sendEmbed(message.channel, { title: "💸 Saldo insuficiente",
        description: `Precisa de ${moeda.simbolo}${fmt(custo)}.`, colour: COR.erro });
    }
    jogadorPaga(serverId, eu, moeda, custo);
    for (const f of cansados) db.salvarFollower(f.id, { energia: 5, energiaEm: Date.now() });
    return sendEmbed(message.channel, { title: "🛏️ Descansaram",
      description: `**${cansados.length}** companheiro(s) com energia cheia. Pagou ${moeda.simbolo}${fmt(custo)}.`,
      colour: COR.sucesso });
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
    // base sobe sozinha com o nível (§2 do design)
    if (depois.ganhoBase > 0) {
      for (const a of db.ATRIBUTOS) campos[a] = (p[a] ?? 1) + depois.ganhoBase;
    }
    if (r.desfecho === "caiu") campos.recuperandoAte = agora + 30 * 60_000;
    db.salvarPersonagem(serverId, eu, campos);

    // ── moeda ──
    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    let moedaGanha = 0, moedaPerdida = 0;

    let moedaSorteada = moeda;
    if (r.exito && r.sobreviveu) {
      // Qual moeda cai depende da dificuldade configurada em cada uma
      const sorteada = ECO.sortearMoeda(db.listarMoedas(serverId), missao);
      if (sorteada) moedaSorteada = sorteada;
      const bruto = ECO.moedaDaMissao(missao, pSuave, attr.sorte, moedaSorteada.dificuldade ?? 1);
      const meu = tamanhoParty ? Math.round(bruto / (1 + 0.30 * tamanhoParty)) : bruto;
      moedaGanha = pagarAoJogador(serverId, eu, db.getMoeda(serverId, moedaSorteada.id), meu);
    } else if (r.desfecho === "caiu") {
      // perde uma fração do que carrega — e vai para a DUNGEON
      const carrega = db.getSaldo(serverId, eu, moeda.id);
      moedaPerdida = Math.floor(carrega * ECO.perda(pSuave));
      if (moedaPerdida > 0) {
        db.debitar(serverId, eu, moeda.id, moedaPerdida);
        const m = db.getMoeda(serverId, moeda.id);
        db.salvarMoeda(serverId, moeda.id, { dungeon: (m?.dungeon ?? 0) + moedaPerdida });
      }
    }

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
    if (moedaGanha > 0) linhas.push(`${moedaSorteada.simbolo} **+${fmt(moedaGanha)} ${moedaSorteada.nome}**`);
    if (moedaPerdida > 0) {
      linhas.push(`${moeda.simbolo} **−${fmt(moedaPerdida)}** _(${(ECO.perda(pSuave) * 100).toFixed(0)}% do que carregava, foi para a dungeon)_`);
    }
    if (depois.subiu) {
      linhas.push(`🎉 **Subiu para o nível ${depois.nivel}!** (+${(depois.pontos - (p.pontos ?? 0)).toFixed(2)} ponto(s))`);
      if (depois.ganhoBase > 0) linhas.push(`   _+${depois.ganhoBase} em **todos** os atributos (crescimento natural)_`);
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
