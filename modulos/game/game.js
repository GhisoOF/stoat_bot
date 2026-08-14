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
import { tr, lingua } from "../core/i18n.js";
import { semear as semearItens } from "./itens-genericos.js";
import * as MISS from "./missoes.js";
import * as FOL from "./followers.js";
import * as MAG from "./magias.js";
import { semear as semearFollowers } from "./followers.js";
import * as ECO from "./economia.js";
import { rodarTesteGeral } from "./teste-geral.js";

const XP_BASE = 100;
const CRESCIMENTO = 1.5;

// Nomes bonitos e apelidos aceitos na hora de distribuir pontos.
const ATRIB = {
  forca:        { rotulo: "Força", rotuloEN: "Strength",        emoji: "💪", aliases: ["forca", "força", "for", "str"] },
  destreza:     { rotulo: "Destreza", rotuloEN: "Dexterity",     emoji: "🎯", aliases: ["destreza", "des", "dex"] },
  resistencia:  { rotulo: "Resistência", rotuloEN: "Resistance",  emoji: "🛡️", aliases: ["resistencia", "resistência", "res", "def"] },
  agilidade:    { rotulo: "Agilidade", rotuloEN: "Agility",    emoji: "💨", aliases: ["agilidade", "agi", "agl"] },
  vida:         { rotulo: "Vida", rotuloEN: "Health",         emoji: "❤️", aliases: ["vida", "hp", "vit"] },
  mana:         { rotulo: "Mana", rotuloEN: "Mana",         emoji: "🔷", aliases: ["mana", "mp"] },
  inteligencia: { rotulo: "Inteligência", rotuloEN: "Intelligence", emoji: "🧠", aliases: ["inteligencia", "inteligência", "int"] },
  sorte:        { rotulo: "Sorte", rotuloEN: "Luck",        emoji: "🍀", aliases: ["sorte", "sor", "luk"] },
  carisma:      { rotulo: "Carisma", rotuloEN: "Charisma",      emoji: "✨", aliases: ["carisma", "car", "cha"] },
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
  acessorio:  { emoji: "💍", rotulo: "Acessório",   rotuloEN: "Accessory" },
  arma:       { emoji: "⚔️", rotulo: "Arma",        rotuloEN: "Weapon" },
  capacete:   { emoji: "🪖", rotulo: "Capacete",    rotuloEN: "Helmet" },
  armadura:   { emoji: "🛡️", rotulo: "Armadura",    rotuloEN: "Armor" },
  acessorio1: { emoji: "💍", rotulo: "Acessório 1", rotuloEN: "Accessory 1" },
  acessorio2: { emoji: "💍", rotulo: "Acessório 2", rotuloEN: "Accessory 2" },
  acessorio3: { emoji: "💍", rotulo: "Acessório 3", rotuloEN: "Accessory 3" },
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

// Com qual moeda a pessoa vai pagar?
//
// Os preços são cotados na moeda padrão, mas ninguém deveria ficar impedido de
// comprar por ter ganhado Dólar em vez de Real. Se falta saldo na padrão,
// procuramos outra que cubra — convertendo pela taxa das duas.
export function moedaParaPagar(serverId, userId, custoNaPadrao) {
  const padrao = garantirMoeda(serverId);
  if (db.getSaldo(serverId, userId, padrao.id) >= custoNaPadrao) {
    return { moeda: padrao, custo: custoNaPadrao, convertido: false };
  }
  for (const m of db.listarMoedas(serverId)) {
    if (m.id === padrao.id) continue;
    // Quanto dessa moeda equivale ao custo cotado na padrão. Usa a mesma taxa
    // do balcão, para não haver duas cotações diferentes na mesma economia.
    const equivalente = Math.ceil(custoNaPadrao / Math.max(0.01, ECO.taxaCambio(m, padrao)));
    if (db.getSaldo(serverId, userId, m.id) >= equivalente) {
      return { moeda: m, custo: equivalente, convertido: true, padrao };
    }
  }
  return { moeda: padrao, custo: custoNaPadrao, convertido: false, semSaldo: true };
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

// Atributos do companheiro somados aos itens que ele carrega. Fica junto do
// resto do cálculo para o que a ficha mostra ser exatamente o que a missão usa.
export function atributosDoFollowerComItens(f) {
  const cat = db.getFollowerCatalogo(f.catalogoId);
  const base = FOL.atributosDoFollower(cat, f.nivel);
  const itens = db.itensDoFollower(f.id);
  const extra = {};
  for (const it of itens) {
    let b = it.bonus;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    for (const [k, v] of Object.entries(b ?? {})) extra[k] = (extra[k] ?? 0) + v;
  }
  const total = { ...base };
  for (const [k, v] of Object.entries(extra)) total[k] = (total[k] ?? 0) + v;
  return { base, extra, total, itens };
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
    const attr = atributosDoFollowerComItens(f).total;
    // Carisma do líder amplifica o que os followers trazem (retorno decrescente)
    const buff = 1 + 0.05 * Math.sqrt(Math.max(0, meus.carisma ?? 0));
    for (const a of db.ATRIBUTOS) total[a] = (total[a] ?? 0) + Math.round((attr[a] ?? 0) * buff);
    const m = FOL.magiaDo(cat);
    if (m) magias.push(m);
  }

  // As magias que o próprio jogador aprendeu entram na mesma disputa que as
  // dos followers: quem paga o custo em Mana é a party, não o dono da magia.
  const doGrimorio = db.listarMagias(serverId, userId)
    .map((x) => MAG.getMagia(x.magiaId)).filter(Boolean);
  const todas = [...magias, ...doGrimorio];

  // Magias custam mana: só entram as que cabem no total de Mana da party.
  const { usadas, manaLivre, manaGasta } = MAG.magiasAtivas(todas, total.mana ?? 0);
  return {
    attr: total, magias: usadas, tamanhoParty: party.length,
    // O que a ficha precisa para mostrar quanto da Mana está em uso.
    manaTotal: total.mana ?? 0, manaGasta, manaLivre,
    magiasConhecidas: todas.length, magiasDoGrimorio: doGrimorio.length,
  };
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

function montarFicha(p, nomeExibido, P, serverId, userId, lang = "pt") {
  const en = lang === "en";
  const proximo = xpParaNivel((p.nivel ?? 1) + 1);
  const linhas = [
    en ? `**Level ${p.nivel}** · ${p.xp} / ${proximo} XP` : `**Nível ${p.nivel}** · ${p.xp} / ${proximo} XP`,
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
    linhas.push(en
      ? `🔹 **${pontos} point(s) to spend** — \`${P}game pontos <attribute> <how many>\``
      : `🔹 **${pontos} ponto(s) para distribuir** — \`${P}game pontos <atributo> <quantos>\``);
  } else {
    const falta = (1 - ((p.pontos ?? 0) % 1)).toFixed(2);
    linhas.push(en
      ? `_No free points. Next point: ${falta} more (level up to earn)._`
      : `_Sem pontos livres. Próximo ponto: mais ${falta} (sobe de nível para ganhar)._`);
  }
  linhas.push(en
    ? `_Gain per level: **${pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}** point(s) · XP +${((bonusXp(p.inteligencia, p.sorte) - 1) * 100).toFixed(0)}%_`
    : `_Ganho por nível: **${pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}** ponto(s) · XP +${((bonusXp(p.inteligencia, p.sorte) - 1) * 100).toFixed(0)}%_`);

  if (serverId && userId) {
    // ── Slots ──
    // Mostrar só o que está equipado esconde a informação que importa: os
    // buracos. Listar os seis, vazios inclusive, transforma a ficha num
    // checklist do que ainda dá para melhorar.
    const eq = db.getEquipado(serverId, userId);
    const ocupados = db.SLOTS.filter((s) => eq[s]).length;
    linhas.push("");
    linhas.push(en
      ? `**Slots — ${ocupados}/${db.SLOTS.length} filled**`
      : `**Slots — ${ocupados}/${db.SLOTS.length} preenchidos**`);
    for (const slot of db.SLOTS) {
      const info = SLOT_INFO[slot] ?? {};
      const rotulo = en ? (info.rotuloEN ?? info.rotulo ?? slot) : (info.rotulo ?? slot);
      const item = eq[slot];
      if (item) {
        const r = RARIDADE_INFO[item.raridade] ?? {};
        linhas.push(`${info.emoji ?? "•"} **${rotulo}:** ${r.emoji ?? ""} ${item.nome} — ${descreverBonus(item.bonus)}`);
      } else {
        linhas.push(`${info.emoji ?? "•"} **${rotulo}:** ${en ? "_empty_" : "_vazio_"}`);
      }
    }
    if (ocupados < db.SLOTS.length) {
      linhas.push(en
        ? `_${db.SLOTS.length - ocupados} free slot(s) — \`${P}game itens\` shows what you can equip._`
        : `_${db.SLOTS.length - ocupados} slot(s) livre(s) — \`${P}game itens\` mostra o que dá para equipar._`);
    }

    // ── Magia ──
    // Mana sem contexto é só um número. Aqui ela vira "quanto do meu poder
    // está em uso", que é a pergunta de quem decide se investe mais nela.
    const mag = atributosDaParty(p, serverId, userId);
    linhas.push("");
    linhas.push(en
      ? `**Magic — ${mag.manaGasta}/${mag.manaTotal} mana in use**`
      : `**Magia — ${mag.manaGasta}/${mag.manaTotal} de mana em uso**`);
    if (mag.magias.length) {
      for (const m of mag.magias) {
        const esc = MAG.ESCOLAS[m.tipo] ?? {};
        linhas.push(`${esc.emoji ?? "✦"} **${m.nome}** — ${en ? (esc.rotuloEN ?? m.tipo) : (esc.rotulo ?? m.tipo)} · ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}%`);
      }
    } else {
      linhas.push(en
        ? `_No active spell._ Learn one with \`${P}game magias\`.`
        : `_Nenhuma magia ativa._ Aprenda uma com \`${P}game magias\`.`);
    }
    // Magia conhecida mas sem Mana para pagar é frustração silenciosa — melhor dizer.
    const dormentes = mag.magiasConhecidas - mag.magias.length;
    if (dormentes > 0) {
      linhas.push(en
        ? `_${dormentes} known spell(s) don't fit in your mana — raise Mana to use them._`
        : `_${dormentes} magia(s) conhecida(s) não cabem na sua mana — suba Mana para usá-las._`);
    }
  }
  return linhas.join("\n");
}

// ══════════════════════════════════════════════════════════
export async function cmdGame(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId, getServer } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";

  if (!serverId) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Fora de um servidor",
        description: en ? "The RPG works inside a server — each one has its own character." : "O RPG funciona dentro de um servidor — cada um tem o seu personagem.", colour: COR.erro },
      { title: "❌ Outside a server",
        description: "The RPG works inside a server — each one has its own character.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();
  const eu = message.authorId;

  // ── criar ──
  if (["criar", "novo", "start", "começar", "comecar"].includes(sub)) {
    if (db.getPersonagem(serverId, eu)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você já tem personagem",
          description: `Veja com \`${P}game\`. Para recomeçar do zero: \`${P}game apagar\`.`, colour: COR.aviso },
        { title: "🎭 You already have a character",
          description: `See it with \`${P}game\`. To start over: \`${P}game apagar\`.`, colour: COR.aviso }));
    }
    const nome = args.slice(1).join(" ").trim().slice(0, 40)
      || message.author?.username || "Aventureiro";
    const p = db.criarPersonagem(serverId, eu, nome);
    return sendEmbed(message.channel, en ? {
      title: "🎉 Character created",
      description: [
        `**${nome}** entered the world.`,
        "",
        montarFicha(p, nome, P, serverId, eu, lang),
        "",
        `Start by spending points: \`${P}game pontos forca 1\``,
      ].join("\n"), colour: COR.sucesso,
    } : {
      title: "🎉 Personagem criado",
      description: [
        `**${nome}** entrou no mundo.`,
        "",
        montarFicha(p, nome, P, serverId, eu, lang),
        "",
        `Comece distribuindo pontos: \`${P}game pontos forca 1\``,
      ].join("\n"), colour: COR.sucesso });
  }

  // ── apagar ──
  if (["apagar", "deletar", "resetar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${P}game criar\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${P}game criar\`.`, colour: COR.aviso }));
    }
    if (args[1]?.toLowerCase() !== "confirmar") {
      return sendEmbed(message.channel, tr(ctx, {
        title: "⚠️ Isso apaga tudo",
        description: [
          `**${p.nome}** — nível ${p.nivel}, ${p.xp} XP — será perdido para sempre.`,
          "",
          `Se tem certeza: \`${P}game apagar confirmar\``,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "⚠️ This erases everything",
        description: [
          `**${p.nome}** — level ${p.nivel}, ${p.xp} XP — will be lost forever.`,
          "",
          `If you're sure: \`${P}game apagar confirmar\``,
        ].join("\n"), colour: COR.aviso,
      }));
    }
    db.apagarPersonagem(serverId, eu);
    db.limparMagias(serverId, eu);   // o grimório vai junto: recomeçar é recomeçar
    return sendEmbed(message.channel, tr(ctx,
      { title: "🗑️ Personagem apagado",
        description: `Crie outro quando quiser com \`${P}game criar\`.`, colour: COR.mod },
      { title: "🗑️ Character deleted",
        description: `Create another whenever you like with \`${P}game criar\`.`, colour: COR.mod }));
  }

  // ── pontos ──
  if (["pontos", "ponto", "distribuir", "upar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${P}game criar\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${P}game criar\`.`, colour: COR.aviso }));
    }

    const atributo = acharAtributo(args[1]);
    if (!atributo) {
      const lista = Object.values(ATRIB).map((a) => `${a.emoji} ${a.rotulo}`).join(" · ");
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Qual atributo?",
        description: [
          `\`${P}game pontos <atributo> [quantos]\``,
          "",
          lista,
          "",
          `Ex.: \`${P}game pontos int 3\` · aceito abreviações (for, des, res, agi, int, sor…).`,
        ].join("\n"), colour: COR.erro,
      }, {
        title: "❌ Which attribute?",
        description: [
          `\`${P}game pontos <attribute> [how many]\``,
          "",
          lista,
          "",
          `E.g.: \`${P}game pontos int 3\` · I accept abbreviations (for, des, res, agi, int, sor…).`,
        ].join("\n"), colour: COR.erro,
      }));
    }

    const disponiveis = Math.floor(p.pontos ?? 0);
    const pedido = args[2] ? parseInt(args[2], 10) : 1;
    if (!Number.isFinite(pedido) || pedido < 1) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Quantidade inválida",
          description: `Use um número: \`${P}game pontos ${args[1]} 2\``, colour: COR.erro },
        { title: "❌ Invalid amount",
          description: `Use a number: \`${P}game pontos ${args[1]} 2\``, colour: COR.erro }));
    }
    if (disponiveis < 1) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "🔸 Sem pontos livres",
        description: `Suba de nível para ganhar pontos. Você ganha **${pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}** por nível.`,
        colour: COR.aviso,
      }, {
        title: "🔸 No free points",
        description: `Level up to earn points. You gain **${pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}** per level.`,
        colour: COR.aviso,
      }));
    }
    const usar = Math.min(pedido, disponiveis);

    const antes = p[atributo];
    const atualizado = db.salvarPersonagem(serverId, eu, {
      [atributo]: antes + usar,
      pontos: (p.pontos ?? 0) - usar,
    });

    const info = ATRIB[atributo];
    const linhas = [`${info.emoji} **${info.rotulo}**: ${antes} → **${antes + usar}**`];
    if (usar < pedido) linhas.push(en ? `_You asked for ${pedido}, but only had ${disponiveis}._` : `_Você pediu ${pedido}, mas só tinha ${disponiveis}._`);
    if (atributo === "inteligencia" || atributo === "sorte") {
      linhas.push("", en
        ? `_Gain per level now: **${pontosPorNivel(atualizado.inteligencia, atualizado.sorte).toFixed(2)}** point(s)._`
        : `_Ganho por nível agora: **${pontosPorNivel(atualizado.inteligencia, atualizado.sorte).toFixed(2)}** ponto(s)._`);
    }
    linhas.push("", en ? `**${Math.floor(atualizado.pontos)}** point(s) left.` : `Restam **${Math.floor(atualizado.pontos)}** ponto(s).`);
    return sendEmbed(message.channel, {
      title: en ? "📈 Attribute increased" : "📈 Atributo aumentado",
      description: linhas.join("\n"), colour: COR.sucesso });
  }

  // ── itens / inventário ──
  if (["itens", "inventario", "inventário", "mochila", "bag"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${P}game criar\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${P}game criar\`.`, colour: COR.aviso }));
    }
    const inv = db.getInventario(serverId, eu);
    if (!inv.length) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "🎒 Mochila vazia",
        description: `Você ainda não tem itens. Eles vêm de missões e do mercado.\n\n_Veja o que existe no jogo com \`${P}game catalogo\`._`,
        colour: COR.info,
      }, {
        title: "🎒 Empty bag",
        description: `You don't have items yet. They come from missions and the market.\n\n_See what exists in the game with \`${P}game catalogo\`._`,
        colour: COR.info,
      }));
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
      titulo: en ? "🎒 Your bag" : "🎒 Sua mochila",
      linhas,
      rodape: en
        ? `_✅ = equipped · \`${P}game equipar <item>\` to use._`
        : `_✅ = equipado · \`${P}game equipar <item>\` para usar._`,
      colour: COR.info,
    });
  }

  // ── equipar ──
  if (["equipar", "usar", "vestir"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${P}game criar\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${P}game criar\`.`, colour: COR.aviso }));
    }
    const busca = args.slice(1).filter((a) => !/^acessorio[123]$/i.test(a)).join(" ").trim();
    const slotPedido = args.find((a) => /^acessorio[123]$/i.test(a))?.toLowerCase();
    if (!busca) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Equipar o quê?",
        description: `\`${P}game equipar <nome do item>\`\n\nVeja o que você tem com \`${P}game itens\`.`,
        colour: COR.erro,
      }, {
        title: "❌ Equip what?",
        description: `\`${P}game equipar <item name>\`\n\nSee what you have with \`${P}game itens\`.`,
        colour: COR.erro,
      }));
    }
    const item = db.acharItemPorNome(busca);
    if (!item) {
      return sendEmbed(message.channel, tr(ctx, { title: en ? "❌ Unknown item" : "❌ Item desconhecido",
        description: en ? `I couldn't find any item called **${busca}**.` : `Não achei nenhum item chamado **${busca}**.`, colour: COR.erro },
      { title: "❌ Unknown item",
        description: `I couldn't find any item called **${busca}**.`, colour: COR.erro }));
    }
    if (!db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, tr(ctx, { title: "❌ Você não tem esse item",
        description: en ? `**${item.nome}** isn't in your bag.` : `**${item.nome}** não está na sua mochila.`, colour: COR.erro },
      { title: "❌ You don't have that item",
        description: `**${item.nome}** isn't in your bag.`, colour: COR.erro }));
    }
    const jaEm = db.slotDoItem(serverId, eu, item.id);
    if (jaEm) {
      return sendEmbed(message.channel, { title: en ? "✅ Already equipped" : "✅ Já está equipado",
        description: en ? `**${item.nome}** is already in ${SLOT_INFO[jaEm]?.rotulo ?? jaEm}.` : `**${item.nome}** já está em ${SLOT_INFO[jaEm]?.rotulo ?? jaEm}.`, colour: COR.aviso });
    }

    const slot = slotParaEquipar(serverId, eu, item, slotPedido);
    const anterior = db.getEquipado(serverId, eu)[slot];
    db.equipar(serverId, eu, slot, item.id);

    const linhas = [
      `${SLOT_INFO[slot]?.emoji ?? "•"} **${SLOT_INFO[slot]?.rotulo ?? slot}**: ${item.nome}`,
      descreverBonus(item.bonus),
    ];
    if (anterior) linhas.push("", `_${anterior.nome} voltou para a mochila._`);
    return sendEmbed(message.channel, { title: en ? "⚔️ Equipped" : "⚔️ Equipado",
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
      return sendEmbed(message.channel, { title: en ? "❌ Unequip what?" : "❌ Tirar o quê?",
        description: (en ? [
          `\`${P}game desequipar <slot or item>\``,
          "",
          `**Slots:** ${db.SLOTS.join(", ")}`,
        ] : [
          `\`${P}game desequipar <slot ou item>\``,
          "",
          `**Slots:** ${db.SLOTS.join(", ")}`,
        ]).join("\n"), colour: COR.erro });
    }
    if (!eq[slot]) {
      return sendEmbed(message.channel, { title: en ? "🔸 Nothing in that slot" : "🔸 Nada nesse slot",
        description: en ? `Nothing is equipped in **${SLOT_INFO[slot]?.rotulo ?? slot}**.` : `Não há nada equipado em **${SLOT_INFO[slot]?.rotulo ?? slot}**.`, colour: COR.aviso });
    }
    const nome = eq[slot].nome;
    db.desequipar(serverId, eu, slot);
    return sendEmbed(message.channel, { title: en ? "🎒 Unequipped" : "🎒 Desequipado",
      description: en ? `**${nome}** went back to the bag.` : `**${nome}** voltou para a mochila.`, colour: COR.mod });
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
      return sendEmbed(message.channel, { title: en ? "📖 Catalog" : "📖 Catálogo",
        description: en
          ? (filtro
            ? `Nothing found for **${filtro}**.\n\nRarities: ${db.RARIDADES.join(", ")}\nSlots: arma, capacete, armadura, acessorio`
            : "No items registered yet.")
          : (filtro
            ? `Nada encontrado para **${filtro}**.\n\nRaridades: ${db.RARIDADES.join(", ")}\nSlots: arma, capacete, armadura, acessorio`
            : "Nenhum item cadastrado ainda."),
        colour: COR.aviso });
    }

    // Filtro que não bate em nada: avisa, em vez de cair no resumo como se
    // a pessoa não tivesse pedido nada.
    if (filtro && !raridade && !slotFiltro) {
      return sendEmbed(message.channel, { title: en ? "❌ Unknown filter" : "❌ Filtro desconhecido",
        description: (en ? [
          `I don't know **${filtro}**.`,
          "",
          `**Rarities:** ${db.RARIDADES.join(" · ")}`,
          "**Slots:** arma · capacete · armadura · acessorio",
          "",
          `With no filter, \`${P}game catalogo\` shows the summary.`,
        ] : [
          `Não conheço **${filtro}**.`,
          "",
          `**Raridades:** ${db.RARIDADES.join(" · ")}`,
          "**Slots:** arma · capacete · armadura · acessorio",
          "",
          `Sem filtro, \`${P}game catalogo\` mostra o resumo.`,
        ]).join("\n"), colour: COR.erro });
    }

    // Sem filtro: resumo (cabe sempre)
    if (!raridade && !slotFiltro) {
      const porRaridade = {};
      for (const i of lista) (porRaridade[i.raridade] ??= []).push(i);
      const linhas = [en ? `**${lista.length}** items in the game:` : `**${lista.length}** itens no jogo:`, ""];
      for (const r of db.RARIDADES) {
        const itens = porRaridade[r] ?? [];
        if (!itens.length) continue;
        const info = RARIDADE_INFO[r] ?? {};
        const infinitos = itens.filter((i) => i.infinito).length;
        linhas.push(en
          ? `${info.emoji} **${info.rotulo}** — ${itens.length} item(s)${infinitos ? ` · ${infinitos} ♾️` : ""}`
          : `${info.emoji} **${info.rotulo}** — ${itens.length} item(ns)${infinitos ? ` · ${infinitos} ♾️` : ""}`);
        linhas.push(`   _${itens.slice(0, 4).map((i) => i.nome).join(", ")}${itens.length > 4 ? "…" : ""}_`);
        linhas.push(`   \`${P}game catalogo ${r}\``);
      }
      linhas.push("", en
        ? "_♾️ = infinite stock (always buyable)_"
        : "_♾️ = estoque infinito (sempre dá para comprar)_");
      linhas.push(en
        ? `_Filter by slot:_ \`${P}game catalogo arma\` · _price and details:_ \`${P}game item <name>\``
        : `_Filtra por slot:_ \`${P}game catalogo arma\` · _preço e detalhes:_ \`${P}game item <nome>\``);
      return sendEmbed(message.channel, { title: en ? "📖 Game items" : "📖 Itens do jogo",
        description: linhas.join("\n").slice(0, 1950), colour: COR.info });
    }

    // Com filtro: lista completa, quebrada em blocos se precisar
    const info = raridade ? (RARIDADE_INFO[raridade] ?? {}) : (SLOT_INFO[slotFiltro] ?? {});
    const titulo = en
      ? `${info.emoji ?? "📖"} ${info.rotulo ?? filtro} — ${lista.length} item(s)`
      : `${info.emoji ?? "📖"} ${info.rotulo ?? filtro} — ${lista.length} item(ns)`;
    const linhas = lista.map((i) =>
      `${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}**${i.infinito ? " ♾️" : ""}\n   ${descreverBonus(i.bonus)}`);

    return enviarLista(sendEmbed, message.channel, {
      titulo, linhas,
      rodape: en
        ? `_♾️ = infinite stock · price and details:_ \`${P}game item <name>\``
        : `_♾️ = estoque infinito · preço e detalhes:_ \`${P}game item <nome>\``,
      colour: COR.info,
    });
  }

  // ── admin (só o dono do bot) ──
  //
  // Existe para testar e depurar sem precisar jogar horas: dar item,
  // moeda, follower, forçar nível e inspecionar os números da economia.
  if (["admin", "debug"].includes(sub)) {
    if (!ctx.ehSuperAdmin?.(eu)) {
      return sendEmbed(message.channel, { title: en ? "🚫 Restricted command" : "🚫 Comando restrito",
        description: en ? "Only the bot owner can use admin mode." : "Só o dono do bot usa o modo admin.", colour: COR.erro });
    }
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2);
    const alvoId = message.mentionIds?.[0] ?? eu;
    // A menção <@id> aparece vazia no cliente quando é o próprio autor.
    // Dizer "você" é mais claro do que uma menção que não renderiza.
    const quem = alvoId === eu ? "você" : `<@${alvoId}>`;

    if (!acao || acao === "ajuda") {
      return sendEmbed(message.channel, { title: en ? "🔧 RPG admin" : "🔧 Admin do RPG",
        description: (en ? [
          `\`${P}game admin dar <qty> [@person]\` — credits currency`,
          `\`${P}game admin item <name> [@person]\` — grants an item`,
          `\`${P}game admin follower <name> [level] [@person]\` — grants a companion`,
          `\`${P}game admin nivel <n> [@person]\` — forces the level`,
          `\`${P}game admin pontos <n> [@person]\` — grants free points`,
          `\`${P}game admin energia [@person]\` — refills companions' energy`,
          `\`${P}game admin cooldown [@person]\` — clears cooldown and recovery`,
          `\`${P}game admin moeda\` — **creates and configures the server's currencies**`,
          `\`${P}game admin teste\` — runs the whole game and reports what worked`,
          `\`${P}game admin eco\` — economy numbers`,
          `\`${P}game admin simular <mission> [n]\` — runs the mission n times with no effect`,
          `\`${P}game admin dungeon <qty>\` — puts currency in the dungeon pot`,
          `\`${P}game admin reset <servidor|catalogo|tudo>\` — starts over`,
        ] : [
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
          `\`${P}game admin reset <servidor|catalogo|tudo>\` — recomeça do zero`,
        ]).join("\n"), colour: COR.mod });
    }

    // `admin dar <qtd>` credita moeda. Mantemos `admin moeda <número>` por
    // compatibilidade — mas `admin moeda` sem número abre a configuração.
    if (acao === "dar" || (acao === "moeda" && /^\d+$/.test(resto[0] ?? ""))) {
      const qtd = parseInt(resto[0], 10);
      if (!Number.isFinite(qtd)) return sendEmbed(message.channel, { title: en ? "❌ How much?" : "❌ Quanto?",
        description: `\`${P}game admin moeda 1000\``, colour: COR.erro });
      const m = garantirMoeda(serverId);
      db.creditar(serverId, alvoId, m.id, qtd);
      return sendEmbed(message.channel, { title: en ? "🔧 Currency credited" : "🔧 Moeda creditada",
        description: en ? `${m.simbolo} ${fmt(qtd)} to ${quem} · balance: ${fmt(db.getSaldo(serverId, alvoId, m.id))}` : `${m.simbolo} ${fmt(qtd)} para ${quem} · saldo: ${fmt(db.getSaldo(serverId, alvoId, m.id))}`,
        colour: COR.mod });
    }

    if (acao === "item") {
      const nome = resto.filter((x) => !/^<[@%#]/.test(x)).join(" ");
      const item = db.acharItemPorNome(nome);
      if (!item) return sendEmbed(message.channel, { title: en ? "❌ Unknown item" : "❌ Item desconhecido",
        description: en ? `I couldn't find **${nome}**.` : `Não achei **${nome}**.`, colour: COR.erro });
      db.darItem(serverId, alvoId, item.id);
      return sendEmbed(message.channel, { title: en ? "🔧 Item delivered" : "🔧 Item entregue",
        description: en ? `**${item.nome}** to ${quem}` : `**${item.nome}** para ${quem}`, colour: COR.mod });
    }

    if (acao === "follower") {
      const argsLimpos = resto.filter((x) => !/^<[@%#]/.test(x));
      const nivel = /^\d+$/.test(argsLimpos[argsLimpos.length - 1] ?? "")
        ? parseInt(argsLimpos.pop(), 10) : 1;
      const cat = db.acharFollowerCatalogo(argsLimpos.join(" "));
      if (!cat) return sendEmbed(message.channel, { title: en ? "❌ Unknown follower" : "❌ Follower desconhecido",
        description: en ? `I couldn't find **${argsLimpos.join(" ")}**.` : `Não achei **${argsLimpos.join(" ")}**.`, colour: COR.erro });
      db.recrutarFollower(serverId, alvoId, cat.id, nivel);
      return sendEmbed(message.channel, { title: en ? "🔧 Companion delivered" : "🔧 Companheiro entregue",
        description: en ? `**${cat.nome}** (lv ${nivel}) to ${quem}` : `**${cat.nome}** (nv ${nivel}) para ${quem}`, colour: COR.mod });
    }

    if (acao === "nivel" || acao === "pontos") {
      const n = parseInt(resto[0], 10);
      if (!Number.isFinite(n)) return sendEmbed(message.channel, { title: en ? "❌ How much?" : "❌ Quanto?",
        description: `\`${P}game admin ${acao} 10\``, colour: COR.erro });
      const alvo = db.getPersonagem(serverId, alvoId);
      if (!alvo) return sendEmbed(message.channel, { title: en ? "❌ No character" : "❌ Sem personagem",
        description: en ? `${quem === "você" ? "You" : quem} ${quem === "você" ? "don't" : "doesn't"} have a character.` : `${quem === "você" ? "Você" : quem} não tem personagem.`, colour: COR.erro });
      db.salvarPersonagem(serverId, alvoId, acao === "nivel" ? { nivel: n, xp: 0 } : { pontos: (alvo.pontos ?? 0) + n });
      return sendEmbed(message.channel, { title: en ? "🔧 Adjusted" : "🔧 Ajustado",
        description: en ? `${quem === "você" ? "You" : quem}: ${acao} → ${n}` : `${quem === "você" ? "Você" : quem}: ${acao} → ${n}`, colour: COR.mod });
    }

    if (acao === "energia") {
      const meus = db.listarFollowersDe(serverId, alvoId);
      for (const f of meus) db.salvarFollower(f.id, { energia: 5, energiaEm: Date.now() });
      return sendEmbed(message.channel, { title: en ? "🔧 Energy full" : "🔧 Energia cheia",
        description: en ? `${meus.length} companion(s) of ${quem}` : `${meus.length} companheiro(s) de ${quem}`, colour: COR.mod });
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
      return sendEmbed(message.channel, { title: en ? "🔧 Cooldown cleared" : "🔧 Cooldown zerado",
        description: en ? `${quem === "você" ? "You can" : quem + " can"} set out now.` : `${quem === "você" ? "Você pode" : quem + " pode"} partir agora.`, colour: COR.mod });
    }

    if (acao === "dungeon") {
      const qtd = parseInt(resto[0], 10) || 0;
      const m = garantirMoeda(serverId);
      db.salvarMoeda(serverId, m.id, { dungeon: (m.dungeon ?? 0) + qtd });
      const atual = db.getMoeda(serverId, m.id);
      return sendEmbed(message.channel, { title: en ? "🔧 Dungeon pot" : "🔧 Pote da dungeon",
        description: en ? `Now holds ${m.simbolo}${fmt(atual.dungeon)} · the prize would be ${fmt(ECO.premioDungeon(atual.dungeon))}` : `Agora tem ${m.simbolo}${fmt(atual.dungeon)} · prêmio seria ${fmt(ECO.premioDungeon(atual.dungeon))}`,
        colour: COR.mod });
    }

    // ── teste geral: roda o jogo inteiro num personagem descartável ──
    if (["teste", "smoke", "testar"].includes(acao)) {
      await sendEmbed(message.channel, { title: en ? "🧪 Running the full test…" : "🧪 Rodando o teste geral…",
        description: en ? "Creating a test character and running through everything. A few seconds." : "Criando um personagem de teste e passando por tudo. Alguns segundos.",
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
    if (acao === "eco") {
      const m = garantirMoeda(serverId);
      const { pAgora, pSuave, comPlayers } = pDaMoeda(serverId, m);
      const exemplo = db.listarItens({ raridade: "comum" })[0];
      const linhas = [
        `**${m.nome}** ${m.simbolo} ${m.finita ? "🔒 finita" : "♾️ infinita"}`,
        `Carteiras: ${fmt(comPlayers)} · ${m.finita ? "Mercado" : "Referência"}: ${fmt(m.mercado)} · Dungeon: ${fmt(m.dungeon)}`,
        `P agora: ${(pAgora * 100).toFixed(1)}% · P suavizado: ${(pSuave * 100).toFixed(1)}%`,
        "",
        `mult(P) = **${ECO.mult(pSuave).toFixed(3)}**`,
        `perda(P) = **${(ECO.perda(pSuave) * 100).toFixed(1)}%** do que se carrega`,
        `fração da dungeon = ${(ECO.fracaoDungeon(m.dungeon) * 100).toFixed(1)}% → prêmio ${fmt(ECO.premioDungeon(m.dungeon))}`,
        `taxa do bazar = ${(ECO.taxaMercado(db.volumeRecente(serverId)) * 100).toFixed(2)}%`,
        "",
        exemplo ? `Ex.: **${exemplo.nome}** custa ${fmt(ECO.precoDeVenda(exemplo, db.getEstoque(serverId, exemplo.id), pSuave))}` : "",
        exemplo ? `   recompra com carisma 0: ${fmt(ECO.precoDeRecompra(ECO.precoDeVenda(exemplo, null, pSuave), 0))}` : "",
        exemplo ? `   recompra com carisma 50: ${fmt(ECO.precoDeRecompra(ECO.precoDeVenda(exemplo, null, pSuave), 50))}` : "",
        "",
        db.listarMoedas(serverId).length > 1
          ? `_${db.listarMoedas(serverId).length} moedas no servidor — \`${P}game admin moeda\` vê todas._` : "",
      ].filter(Boolean);
      return sendEmbed(message.channel, { title: en ? "🔧 Economy" : "🔧 Economia",
        description: linhas.join("\n"), colour: COR.mod });
    }

    if (acao === "simular") {
      const nomeM = resto.filter((x) => !/^\d+$/.test(x)).join(" ");
      const vezes = Math.min(1000, parseInt(resto.find((x) => /^\d+$/.test(x)) ?? "100", 10));
      const missao = MISS.acharMissao(nomeM);
      if (!missao) return sendEmbed(message.channel, { title: en ? "❌ Unknown mission" : "❌ Missão desconhecida",
        description: `\`${P}game admin simular <missao> [vezes]\`\n\nVeja os nomes com \`${P}game missao\`.`, colour: COR.erro });
      const alvo = db.getPersonagem(serverId, alvoId);
      if (!alvo) return sendEmbed(message.channel, { title: en ? "❌ No character" : "❌ Sem personagem",
        description: en ? `${quem === "você" ? "You" : quem} ${quem === "você" ? "don't" : "doesn't"} have a character.` : `${quem === "você" ? "Você" : quem} não tem personagem.`, colour: COR.erro });
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

    if (["moeda", "moedas"].includes(acao)) {
      const op = resto[0]?.toLowerCase();
      const args2 = resto.slice(1);

      // Campos configuráveis, com explicação — usada tanto na ajuda quanto
      // nas mensagens de erro, para não haver duas versões da verdade.
      const CAMPOS = {
        nome:           { tipo: "texto", desc: "como aparece nas mensagens" },
        simbolo:        { tipo: "texto", desc: "emoji ou símbolo (🪙, $, ₿)" },
        dificuldade:    { tipo: "num",   desc: "1 = comum. Maior → aparece menos e rende menos unidades" },
        nivelMin:       { tipo: "int",   desc: "só cai em missões desse nível para cima" },
        suprimentoBase: { tipo: "num",   desc: "quanto existe no total (limita o que pode ser pago)" },
        mercado:        { tipo: "num",   desc: "quanto o mercado tem AGORA" },
        finita:         { tipo: "bool",  desc: "sim = o estoque do mercado se esgota; nao = nunca acaba (a geração é limitada só pela dificuldade)" },
      };
      const APELIDOS_CAMPO = { nivel: "nivelMin", dif: "dificuldade", suprimento: "suprimentoBase",
        simbolo: "simbolo", "símbolo": "simbolo", estoque: "mercado" };

      // Compara sem diferenciar maiúsculas: `nivelMin`, `nivelmin` e `NivelMin`
      // devem funcionar igual — quem digita não deve precisar acertar o camelCase.
      const normalizarCampo = (c) => {
        const k = String(c ?? "").toLowerCase();
        const exato = Object.keys(CAMPOS).find((x) => x.toLowerCase() === k);
        return exato ?? APELIDOS_CAMPO[k] ?? null;
      };
      const converter = (campo, valor) => {
        const t = CAMPOS[campo]?.tipo;
        if (t === "num") return Number(String(valor).replace(/[._]/g, ""));
        if (t === "int") return parseInt(valor, 10);
        if (t === "bool") return ["sim", "true", "1", "finita", "s"].includes(String(valor).toLowerCase()) ? 1 : 0;
        return String(valor);
      };

      // Aceita `campo=valor` soltos em qualquer ordem, para criar e configurar
      // numa linha só em vez de cinco comandos.
      const extrairPares = (lista) => {
        const pares = {}, sobra = [];
        for (const a of lista) {
          const m = String(a).match(/^([\wíáéó]+)[=:](.+)$/);
          const campo = m ? normalizarCampo(m[1]) : null;
          if (campo) pares[campo] = converter(campo, m[2]);
          else sobra.push(a);
        }
        return { pares, sobra };
      };

      const fichaDaMoeda = (m) => {
        const { pSuave } = pDaMoeda(serverId, m);
        // Em moeda infinita o "mercado" não é estoque que acaba — é o volume de
        // referência que o P usa para medir concentração. Chamar de estoque
        // confundiria: parece que vai esgotar, e não vai.
        const volume = m.finita
          ? `mercado ${fmt(m.mercado)}`
          : `referência ${fmt(m.mercado)}`;
        const ritmo = m.dificuldade <= 2 ? "geração alta"
          : m.dificuldade <= 20 ? "geração média"
          : m.dificuldade <= 100 ? "geração baixa" : "geração raríssima";
        return [
          `${m.simbolo} **${m.nome}** \`${m.id}\`${m.padrao ? " ⭐ padrão" : ""}`,
          `   ${m.finita ? "🔒 finita" : "♾️ infinita"} · **${ritmo}** (dificuldade ${m.dificuldade}) · nível ${m.nivelMin}+`,
          `   ${volume} · com jogadores ${fmt(db.totalNasCarteiras(serverId, m.id))} · dungeon ${fmt(m.dungeon)}`,
          `   P ${(pSuave * 100).toFixed(0)}% → preços ×${ECO.mult(pSuave).toFixed(2)}`,
        ].join("\n");
      };

      // ── ajuda / guia ──
      if (op === "ajuda" || op === "guia" || op === "help") {
        return enviarLista(sendEmbed, message.channel, {
          titulo: "🪙 Guia — moedas",
          linhas: [
            "**Criar uma moeda**",
            `\`${P}game admin moeda criar <id> <nome> [símbolo] [campo=valor …]\``,
            "```",
            `${P}game admin moeda criar prata Prata 🥈 dificuldade=20 nivel=5 suprimento=8000`,
            "```",
            "_O `id` é o nome curto usado nos comandos (sem espaço). Os campos podem_",
            "_vir em qualquer ordem, e o que você não passar usa o padrão._",
            "",
            "**Mudar depois**",
            `\`${P}game admin moeda set <id> <campo> <valor>\``,
            `\`${P}game admin moeda set <id> dificuldade=8 nivel=12\`  ← vários de uma vez`,
            "",
            "**Os campos**",
            ...Object.entries(CAMPOS).map(([k, v]) => `\`${k}\` — ${v.desc}`),
            "_Apelidos aceitos: `nivel`, `dif`, `suprimento`, `estoque`._",
            "",
            "**Como a dificuldade funciona**",
            "É o que separa uma moeda comum de uma rara. Ela controla duas coisas",
            "ao mesmo tempo: a chance de a moeda cair numa missão **e** quantas",
            "unidades saem. Dificuldade 20 aparece ~20× menos que a 1, e rende",
            "~20× menos por vez — então cada unidade vale muito mais.",
            "",
            "**Conjuntos prontos**",
            `\`${P}game admin moeda modelo\` — cria um conjunto inteiro de uma vez`,
            "",
            "**Outros**",
            `\`${P}game admin moeda\` — lista o que existe`,
            `\`${P}game admin moeda ver <id>\` — ficha de uma moeda`,
            `\`${P}game admin moeda padrao <id>\` — define a principal`,
            `\`${P}game admin moeda remover <id> confirmar\``,
          ],
          colour: COR.mod,
        });
      }

      // ── modelos prontos ──
      if (["modelo", "modelos", "preset"].includes(op)) {
        const MODELOS = {
          mundo: {
            rotulo: "Mundo real", desc: "Real, Dólar, Euro, Prata, Ouro e Bitcoin",
            // Fiat e metais são INFINITOS: banco central imprime, e ninguém sabe
            // quanto ouro ainda há no subsolo. O que os separa não é estoque, é
            // a VELOCIDADE de geração — controlada pela dificuldade.
            // O Bitcoin é a exceção: tem teto real de 21 milhões, então é a
            // única finita de verdade aqui.
            moedas: [
              { id: "brl", nome: "Real",     simbolo: "🇧🇷", dificuldade: 1,   nivelMin: 1,  suprimentoBase: 200000, finita: false, padrao: true },
              { id: "usd", nome: "Dólar",    simbolo: "💵", dificuldade: 5,   nivelMin: 1,  suprimentoBase: 40000,  finita: false },
              { id: "eur", nome: "Euro",     simbolo: "💶", dificuldade: 6,   nivelMin: 3,  suprimentoBase: 30000,  finita: false },
              { id: "xag", nome: "Prata",    simbolo: "🥈", dificuldade: 45,  nivelMin: 5,  suprimentoBase: 9000,   finita: false },
              { id: "xau", nome: "Ouro",     simbolo: "🥇", dificuldade: 200, nivelMin: 12, suprimentoBase: 2000,   finita: false },
              { id: "btc", nome: "Bitcoin",  simbolo: "₿",  dificuldade: 400, nivelMin: 18, suprimentoBase: 210,    finita: true },
            ],
          },
          fantasia: {
            rotulo: "Fantasia", desc: "Cobre, Prata, Ouro e Cristal Arcano",
            // Todas infinitas; o que muda é o ritmo de geração.
            moedas: [
              { id: "cobre",   nome: "Cobre",          simbolo: "🟤", dificuldade: 1,   nivelMin: 1,  suprimentoBase: 150000, finita: false, padrao: true },
              { id: "prata",   nome: "Prata",          simbolo: "⚪", dificuldade: 15,  nivelMin: 4,  suprimentoBase: 20000,  finita: false },
              { id: "ouro",    nome: "Ouro",           simbolo: "🟡", dificuldade: 70,  nivelMin: 10, suprimentoBase: 4000,   finita: false },
              { id: "cristal", nome: "Cristal Arcano", simbolo: "💠", dificuldade: 300, nivelMin: 16, suprimentoBase: 600,    finita: true },
            ],
          },
          simples: {
            rotulo: "Simples", desc: "uma moeda só — o mínimo para jogar",
            moedas: [
              { id: "ouro", nome: "Ouro", simbolo: "🪙", dificuldade: 1, nivelMin: 1, suprimentoBase: 100000, finita: false, padrao: true },
            ],
          },
        };
        const escolha = args2[0]?.toLowerCase();
        const mod = MODELOS[escolha];

        if (!mod) {
          return enviarLista(sendEmbed, message.channel, {
            titulo: "🪙 Conjuntos prontos",
            linhas: [
              "Criam várias moedas já balanceadas, de uma vez.",
              "",
              ...Object.entries(MODELOS).flatMap(([k, v]) => [
                `**${v.rotulo}** \`${k}\` — ${v.desc}`,
                `   ${v.moedas.map((x) => `${x.simbolo}${x.nome}`).join(" · ")}`,
                `   \`${P}game admin moeda modelo ${k}\``,
                "",
              ]),
              "_As moedas existentes NÃO são apagadas — o conjunto é acrescentado._",
              `_Para começar limpo: \`${P}game admin reset servidor confirmar\` antes._`,
            ],
            colour: COR.mod });
        }

        const criadas = [], existentes = [];
        for (const m of mod.moedas) {
          if (db.getMoeda(serverId, m.id)) { existentes.push(m.nome); continue; }
          db.upsertMoeda(serverId, { ...m, finita: m.finita !== false, mercado: m.suprimentoBase });
          criadas.push(m);
        }
        if (criadas.some((m) => m.padrao)) {
          const padraoId = criadas.find((m) => m.padrao).id;
          for (const x of db.listarMoedas(serverId)) db.salvarMoeda(serverId, x.id, { padrao: x.id === padraoId ? 1 : 0 });
        }
        return sendEmbed(message.channel, { title: `🪙 Conjunto "${mod.rotulo}" aplicado`,
          description: [
            criadas.length ? `**Criadas (${criadas.length}):**\n` + criadas.map((m) =>
              `${m.simbolo} **${m.nome}** — dificuldade ${m.dificuldade}, nível ${m.nivelMin}+, suprimento ${fmt(m.suprimentoBase)}`).join("\n") : "",
            existentes.length ? `\n_Já existiam e foram mantidas: ${existentes.join(", ")}_` : "",
            "",
            `_Veja com \`${P}game admin moeda\` · ajuste com \`${P}game admin moeda set\`._`,
          ].filter(Boolean).join("\n").slice(0, 1900),
          colour: COR.sucesso });
      }

      // ── ficha de uma moeda ──
      if (["ver", "detalhe", "info"].includes(op)) {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: en ? "❌ Unknown currency" : "❌ Moeda desconhecida",
          description: `\`${P}game admin moeda\` lista as existentes.`, colour: COR.erro });
        const exemploNv = [3, 10, 20].map((nv) =>
          `   nível ${String(nv).padStart(2)}: ~${fmt(ECO.moedaDaMissao({ tipo: "dungeon", dificuldade: "medio", nivel: nv }, 0.5, 0, m.dificuldade))} por missão`);
        return sendEmbed(message.channel, { title: `${m.simbolo} ${m.nome}`,
          description: [
            fichaDaMoeda(m),
            "",
            "**Quanto rende**",
            ...exemploNv,
            m.nivelMin > 1 ? `   _(não aparece abaixo do nível ${m.nivelMin})_` : "",
            "",
            `_Mudar: \`${P}game admin moeda set ${m.id} <campo> <valor>\`_`,
            `_Campos: ${Object.keys(CAMPOS).join(", ")}_`,
          ].filter(Boolean).join("\n"), colour: COR.mod });
      }

      // ── criar ──
      if (["criar", "nova", "add"].includes(op)) {
        const { pares, sobra } = extrairPares(args2);
        const [id, nome, simbolo] = sobra;
        if (!id || !nome) {
          return sendEmbed(message.channel, { title: en ? "❌ Missing the basics" : "❌ Faltou o básico",
            description: [
              `\`${P}game admin moeda criar <id> <nome> [símbolo] [campo=valor …]\``,
              "",
              "**Exemplos**",
              `\`${P}game admin moeda criar prata Prata 🥈\``,
              `\`${P}game admin moeda criar btc Bitcoin ₿ dificuldade=400 nivel=18 suprimento=210\``,
              "",
              `_Não quer configurar à mão? \`${P}game admin moeda modelo\` tem conjuntos prontos._`,
              `_Explicação dos campos: \`${P}game admin moeda ajuda\`._`,
            ].join("\n"), colour: COR.erro });
        }
        const chave = id.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (!chave) return sendEmbed(message.channel, { title: en ? "❌ Invalid ID" : "❌ ID inválido",
          description: en ? "The `id` is the short name used in commands: letters and numbers, no spaces.\nE.g.: `prata`, `btc`, `cristal_negro`." : "O `id` é o nome curto usado nos comandos: letras e números, sem espaço.\nEx.: `prata`, `btc`, `cristal_negro`.", colour: COR.erro });
        if (db.getMoeda(serverId, chave)) {
          return sendEmbed(message.channel, { title: en ? "❌ Already exists" : "❌ Já existe",
            description: en
          ? `There's already a \`${chave}\` currency.\nAdjust it with \`${P}game admin moeda set ${chave} <field> <value>\`.`
          : `Já há uma moeda \`${chave}\`.\nAjuste com \`${P}game admin moeda set ${chave} <campo> <valor>\`.`, colour: COR.erro });
        }
        const primeira = db.listarMoedas(serverId).length === 0;
        const base = { id: chave, nome, simbolo: simbolo ?? "🪙", finita: true,
          suprimentoBase: 10000, dificuldade: 1, nivelMin: 1, padrao: primeira, ...pares };
        base.mercado = pares.mercado ?? base.suprimentoBase;
        const m = db.upsertMoeda(serverId, base);
        const ajustados = Object.keys(pares);
        return sendEmbed(message.channel, { title: en ? "🪙 Currency created" : "🪙 Moeda criada",
          description: [
            fichaDaMoeda(m),
            primeira ? "\n_Virou a moeda padrão do servidor._" : "",
            ajustados.length ? `\n_Aplicado: ${ajustados.join(", ")}_` : `\n_Nos padrões. Ajuste com \`${P}game admin moeda set ${chave} dificuldade=5\`._`,
          ].filter(Boolean).join("\n"), colour: COR.sucesso });
      }

      // ── set ──
      if (["set", "editar", "config"].includes(op)) {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: en ? "❌ Which currency?" : "❌ Qual moeda?",
          description: `\`${P}game admin moeda set <id> <campo> <valor>\`\n\n\`${P}game admin moeda\` lista as existentes.`, colour: COR.erro });

        const { pares, sobra } = extrairPares(args2.slice(1));
        // formato antigo: `set <id> <campo> <valor>`
        if (!Object.keys(pares).length && sobra.length >= 2) {
          const campo = normalizarCampo(sobra[0]);
          if (!campo) {
            return sendEmbed(message.channel, { title: en ? "❌ Unknown field" : "❌ Campo desconhecido",
              description: ["**Campos:**", ...Object.entries(CAMPOS).map(([k, v]) => `\`${k}\` — ${v.desc}`)].join("\n"),
              colour: COR.erro });
          }
          pares[campo] = converter(campo, sobra.slice(1).join(" "));
        }
        if (!Object.keys(pares).length) {
          return sendEmbed(message.channel, { title: en ? "❌ Change what?" : "❌ Mudar o quê?",
            description: [
              `\`${P}game admin moeda set ${m.id} dificuldade 20\``,
              `\`${P}game admin moeda set ${m.id} dificuldade=20 nivel=5\`  ← vários de uma vez`,
              "",
              "**Campos:**",
              ...Object.entries(CAMPOS).map(([k, v]) => `\`${k}\` — ${v.desc}`),
            ].join("\n"), colour: COR.erro });
        }
        const invalidos = Object.entries(pares).filter(([, v]) => typeof v === "number" && !Number.isFinite(v));
        if (invalidos.length) {
          return sendEmbed(message.channel, { title: en ? "❌ Invalid value" : "❌ Valor inválido",
            description: en ? `**${invalidos.map(([k]) => k).join(", ")}** need(s) a number.` : `**${invalidos.map(([k]) => k).join(", ")}** precisa(m) de número.`, colour: COR.erro });
        }
        db.salvarMoeda(serverId, m.id, pares);
        const atual = db.getMoeda(serverId, m.id);
        // Referência baixa demais numa moeda infinita empurra o P para o teto
        // e trava os preços no extremo — vale avisar antes de a economia azedar.
        const avisos = [];
        if (!atual.finita && atual.mercado < 100) {
          avisos.push(`⚠️ A referência (${fmt(atual.mercado)}) está muito baixa para uma moeda infinita — o P vai ficar perto de 100% e os preços travam no mínimo. Use algo próximo do total que os jogadores devem acumular.`);
        }
        return sendEmbed(message.channel, { title: en ? "🪙 Adjusted" : "🪙 Ajustado",
          description: [
            Object.entries(pares).map(([k, v]) => `\`${k}\` → **${v}**`).join(" · "),
            "",
            fichaDaMoeda(atual),
            ...(avisos.length ? ["", ...avisos] : []),
          ].join("\n"), colour: avisos.length ? COR.aviso : COR.mod });
      }

      if (["padrao", "padrão", "principal"].includes(op)) {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: en ? "❌ Unknown currency" : "❌ Moeda desconhecida",
          description: `\`${P}game admin moeda\` lista as existentes.`, colour: COR.erro });
        for (const x of db.listarMoedas(serverId)) db.salvarMoeda(serverId, x.id, { padrao: x.id === m.id ? 1 : 0 });
        return sendEmbed(message.channel, { title: en ? "⭐ Default currency" : "⭐ Moeda padrão",
          description: en ? `${m.simbolo} **${m.nome}** is the main one — market prices are shown in it.` : `${m.simbolo} **${m.nome}** é a principal — é nela que os preços do mercado aparecem.`, colour: COR.mod });
      }

      if (["remover", "apagar", "deletar"].includes(op)) {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: en ? "❌ Unknown currency" : "❌ Moeda desconhecida",
          description: `\`${P}game admin moeda\` lista as existentes.`, colour: COR.erro });
        if (!args2.includes("confirmar")) {
          return sendEmbed(message.channel, { title: en ? "⚠️ This deletes the currency and its balances" : "⚠️ Apaga a moeda e os saldos",
            description: [
              `${m.simbolo} **${m.nome}** — ${fmt(db.totalNasCarteiras(serverId, m.id))} nas carteiras dos jogadores.`,
              "Tudo isso será **perdido**.",
              "",
              `\`${P}game admin moeda remover ${m.id} confirmar\``,
            ].join("\n"), colour: COR.aviso });
        }
        if (m.padrao && db.listarMoedas(serverId).length > 1) {
          return sendEmbed(message.channel, { title: en ? "❌ That's the default currency" : "❌ É a moeda padrão",
            description: `Escolha outra antes: \`${P}game admin moeda padrao <id>\`.`, colour: COR.erro });
        }
        db.removerMoeda(serverId, m.id);
        return sendEmbed(message.channel, { title: en ? "🗑️ Removed" : "🗑️ Removida",
          description: en ? `${m.simbolo} **${m.nome}** and all its balances.` : `${m.simbolo} **${m.nome}** e todos os saldos dela.`, colour: COR.mod });
      }

      // ── painel (padrão) ──
      if (!db.listarMoedas(serverId).length) garantirMoeda(serverId);
      const lista = db.listarMoedas(serverId);
      return enviarLista(sendEmbed, message.channel, {
        titulo: `🪙 Moedas do servidor (${lista.length})`,
        linhas: [
          ...lista.map(fichaDaMoeda),
          "",
          "**O que dá para fazer**",
          `\`${P}game admin moeda ajuda\` — 📖 o que cada campo significa`,
          `\`${P}game admin moeda modelo\` — ⚡ conjuntos prontos (mundo real, fantasia…)`,
          `\`${P}game admin moeda criar <id> <nome> [símbolo] [campo=valor]\``,
          `\`${P}game admin moeda set <id> <campo> <valor>\``,
          `\`${P}game admin moeda ver <id>\` · \`padrao <id>\` · \`remover <id> confirmar\``,
        ],
        colour: COR.mod });
    }

    // ── reset ──
    //
    // Três escopos, porque "apagar tudo" significa coisas diferentes:
    //   servidor — progresso das pessoas (personagens, itens, moedas, ofertas)
    //   catalogo — o que EXISTE no jogo (volta só aos genéricos)
    //   tudo     — os dois
    if (["zerar", "reset", "resetar"].includes(acao)) {
      const escopo = (resto[0] ?? "servidor").toLowerCase();
      const confirmou = resto.includes("confirmar");
      const escopos = { servidor: 1, catalogo: 1, "catálogo": 1, tudo: 1 };
      if (!escopos[escopo]) {
        return sendEmbed(message.channel, { title: en ? "❓ Reset what?" : "❓ Resetar o quê?",
          description: (en ? [
            `\`${P}game admin reset servidor confirmar\``,
            "   erases **progress**: characters, bags, followers, currencies and offers",
            "",
            `\`${P}game admin reset catalogo confirmar\``,
            "   erases what you **curated**, back to the generic items/followers only",
            "",
            `\`${P}game admin reset tudo confirmar\``,
            "   both — the game returns to a freshly installed state",
          ] : [
            `\`${P}game admin reset servidor confirmar\``,
            "   apaga o **progresso**: personagens, mochilas, followers, moedas e ofertas",
            "",
            `\`${P}game admin reset catalogo confirmar\``,
            "   apaga o que você **curou**, voltando só aos itens/followers genéricos",
            "",
            `\`${P}game admin reset tudo confirmar\``,
            "   os dois — o jogo volta ao estado de recém-instalado",
          ]).join("\n"), colour: COR.info });
      }

      const d = db.getDb();
      const conta = (sql, ...p) => { try { return d.prepare(sql).get(...p)?.n ?? 0; } catch { return 0; } };

      // prévia do estrago, para a confirmação ser informada
      const nPers = conta("SELECT COUNT(*) n FROM rpg_personagem WHERE serverId=?", serverId);
      const nFol  = conta("SELECT COUNT(*) n FROM rpg_followers WHERE serverId=?", serverId);
      const nOfe  = conta("SELECT COUNT(*) n FROM rpg_ofertas WHERE serverId=? AND estado='aberta'", serverId);
      const nMoe  = conta("SELECT COUNT(*) n FROM rpg_moedas WHERE serverId=?", serverId);
      const nCur  = conta("SELECT COUNT(*) n FROM rpg_itens WHERE origem != 'generico'")
                  + conta("SELECT COUNT(*) n FROM rpg_followers_catalogo WHERE origem != 'generico'");

      if (!confirmou) {
        const linhas = ["**Isso não tem volta.**", ""];
        if (escopo !== "catalogo" && escopo !== "catálogo") {
          linhas.push("**Progresso que será apagado:**",
            `• ${nPers} personagem(ns) — nível, atributos e XP`,
            `• ${nFol} companheiro(s) recrutado(s)`,
            `• ${nMoe} moeda(s) e **todos os saldos**`,
            `• ${nOfe} oferta(s) aberta(s) no mercado`,
            "• mochilas, equipamentos e o pote da dungeon", "");
        }
        if (escopo === "catalogo" || escopo === "catálogo" || escopo === "tudo") {
          linhas.push("**Catálogo:**",
            nCur ? `• ${nCur} item(ns)/follower(s) **curados por você** serão removidos`
                 : "• nada curado ainda — só os genéricos, que serão recriados",
            "");
        }
        linhas.push(`Confirme com \`${P}game admin reset ${escopo} confirmar\`.`);
        return sendEmbed(message.channel, { title: `⚠️ Resetar: ${escopo}`,
          description: linhas.join("\n"), colour: COR.aviso });
      }

      // Nome de tabela não diz nada a quem lê — e chega a parecer comando.
      const ROTULO = {
        rpg_personagem: "personagem(ns)",
        rpg_inventario: "item(ns) em mochilas",
        rpg_equipado: "equipamento(s)",
        rpg_carteira: "carteira(s)",
        rpg_estoque: "linha(s) de estoque",
        rpg_moedas: "moeda(s)",
        rpg_ofertas: "oferta(s) do mercado",
        rpg_followers: "companheiro(s)",
        rpg_itens: "item(ns) do catálogo",
        rpg_followers_catalogo: "companheiro(s) do catálogo",
        rpg_magias: "magia(s) aprendida(s)",
      };
      const apagados = [];
      const apagar = (tabela, where, ...p) => {
        try {
          const n = d.prepare(`DELETE FROM ${tabela} WHERE ${where}`).run(...p).changes ?? 0;
          if (n) apagados.push(`**${n}** ${ROTULO[tabela] ?? tabela}`);
        } catch (e) { console.error(`[RPG][reset] ${tabela}:`, e.message); }
      };

      if (escopo !== "catalogo" && escopo !== "catálogo") {
        // progresso do servidor — inclui as OFERTAS, que ficariam órfãs
        // segurando itens que já não existem
        for (const t of ["rpg_personagem", "rpg_inventario", "rpg_equipado",
                         "rpg_carteira", "rpg_estoque", "rpg_moedas", "rpg_ofertas",
                         "rpg_magias"]) {
          apagar(t, "serverId = ?", serverId);
        }
        apagar("rpg_followers", "serverId = ?", serverId);
      }

      if (escopo === "catalogo" || escopo === "catálogo" || escopo === "tudo") {
        // remove tudo do catálogo: os genéricos são recriados logo abaixo
        apagar("rpg_itens", "1 = 1");
        apagar("rpg_followers_catalogo", "1 = 1");
        semeado = false;
        iniciarCatalogo();
      }

      // A moeda padrão NÃO é recriada aqui de propósito.
      //
      // Quem reseta normalmente quer aplicar um conjunto de moedas em seguida
      // (`moeda modelo mundo`), e uma "Ouro" criada automaticamente ficaria
      // sobrando ao lado das novas — confundindo e bagunçando a economia.
      // Se ninguém escolher nada, ela nasce sozinha no primeiro uso do jogo.
      const mexeuNoCatalogo = ["catalogo", "catálogo", "tudo"].includes(escopo);

      return sendEmbed(message.channel, {
        title: en ? "🔄 Reset done" : "🔄 Reset concluído",
        description: (en ? [
          `**Scope:** ${escopo}`,
          "",
          apagados.length ? "**Erased:**\n" + apagados.map((x) => `• ${x}`).join("\n") : "_There was nothing to erase._",
          mexeuNoCatalogo
            ? `\n✅ Generic catalog recreated: ${db.listarItens().length} items, ${db.listarFollowersCatalogo().length} companions` : "",
          "",
          "**Next step — pick the currencies:**",
          `\`${P}game admin moeda modelo mundo\` — Real, Dollar, Euro, Silver, Gold, Bitcoin`,
          `\`${P}game admin moeda modelo fantasia\` — Copper, Silver, Gold, Crystal`,
          `\`${P}game admin moeda modelo simples\` — a single currency`,
          "",
          `_If you don't pick, a default currency is born on its own when someone plays._`,
          `_After that, just \`${P}game criar\`._`,
        ] : [
          `**Escopo:** ${escopo}`,
          "",
          apagados.length ? "**Apagado:**\n" + apagados.map((x) => `• ${x}`).join("\n") : "_Nada havia para apagar._",
          mexeuNoCatalogo
            ? `\n✅ Catálogo genérico recriado: ${db.listarItens().length} itens, ${db.listarFollowersCatalogo().length} companheiros` : "",
          "",
          "**Próximo passo — escolha as moedas:**",
          `\`${P}game admin moeda modelo mundo\` — Real, Dólar, Euro, Prata, Ouro, Bitcoin`,
          `\`${P}game admin moeda modelo fantasia\` — Cobre, Prata, Ouro, Cristal`,
          `\`${P}game admin moeda modelo simples\` — uma moeda só`,
          "",
          `_Se você não escolher, uma moeda padrão nasce sozinha quando alguém jogar._`,
          `_Depois é só \`${P}game criar\`._`,
        ]).filter(Boolean).join("\n"),
        colour: COR.sucesso });
    }

    return sendEmbed(message.channel, { title: en ? "❓ Unknown action" : "❓ Ação desconhecida",
      description: en ? `\`${P}game admin\` lists what you can do.` : `\`${P}game admin\` lista o que dá para fazer.`, colour: COR.erro });
  }

  // ── carteira / economia ──
  if (["carteira", "saldo", "moedas", "economia"].includes(sub)) {
    garantirMoeda(serverId);
    const moedas = db.listarMoedas(serverId);
    const padrao = db.moedaPadrao(serverId);

    // Mostra TODAS as moedas — antes só a padrão aparecia, e quem ganhasse
    // Dólar numa missão via a carteira dizer que tinha só Real.
    const linhas = [];
    let temAlgo = false;
    for (const m of moedas) {
      const saldo = db.getSaldo(serverId, eu, m.id);
      if (saldo > 0) temAlgo = true;
      const marca = saldo > 0 ? "**" : "";
      linhas.push(`${m.simbolo} ${marca}${fmt(saldo)} ${m.nome}${marca}${m.padrao ? " ⭐" : ""}`);
    }
    if (!temAlgo) linhas.push("", en ? "_Your wallet is empty — missions pay in currency._" : "_Sua carteira está vazia — missões pagam em moeda._");

    // O estado da economia é da moeda padrão: é nela que os preços aparecem.
    if (padrao) {
      const { pSuave, comPlayers } = pDaMoeda(serverId, padrao);
      linhas.push("",
        en ? `**Economy — ${padrao.simbolo} ${padrao.nome}**` : `**Economia — ${padrao.simbolo} ${padrao.nome}**`,
        en
          ? `With the players: ${fmt(comPlayers)} · ${padrao.finita ? "Market" : "Reference"}: ${fmt(padrao.mercado)}`
          : `Com os jogadores: ${fmt(comPlayers)} · ${padrao.finita ? "Mercado" : "Referência"}: ${fmt(padrao.mercado)}`,
        en ? `Concentration (P): **${(pSuave * 100).toFixed(0)}%**` : `Concentração (P): **${(pSuave * 100).toFixed(0)}%**`,
        en
          ? `Prices are **${ECO.mult(pSuave) > 1.5 ? "high" : ECO.mult(pSuave) > 1 ? "medium" : "low"}** (×${ECO.mult(pSuave).toFixed(2)})`
          : `Preços estão **${ECO.mult(pSuave) > 1.5 ? "altos" : ECO.mult(pSuave) > 1 ? "médios" : "baixos"}** (×${ECO.mult(pSuave).toFixed(2)})`,
        en
          ? `Falling costs **${(ECO.perda(pSuave) * 100).toFixed(0)}%** of what you carry`
          : `Cair custa **${(ECO.perda(pSuave) * 100).toFixed(0)}%** do que você carrega`,
      );
      if (padrao.dungeon > 0) {
        linhas.push("", en ? `🕳️ In the dungeon: ${fmt(padrao.dungeon)} ${padrao.simbolo}` : `🕳️ Na dungeon: ${fmt(padrao.dungeon)} ${padrao.simbolo}`,
          en ? `_Beating the dungeon returns ~${fmt(ECO.premioDungeon(padrao.dungeon))}._` : `_Vencer a dungeon devolve ~${fmt(ECO.premioDungeon(padrao.dungeon))}._`);
      }
    }

    if (moedas.length > 1) {
      linhas.push("", en
        ? `_Each currency has its own P. See everything with \`${P}game admin moeda\`._`
        : `_Cada moeda tem seu próprio P. Veja tudo com \`${P}game admin moeda\`._`);
      linhas.push(en
        ? `_Exchange with the bank: \`${P}game cambio <qty> <currency> para <currency>\` · rates: \`${P}game cambio taxas\`_`
        : `_Trocar com o banco: \`${P}game cambio <qtd> <moeda> para <moeda>\` · taxas: \`${P}game cambio taxas\`_`);
    }

    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "💰 Your wallet" : "💰 Sua carteira", linhas, colour: COR.info });
  }

  // ── mercado entre jogadores ──
  //
  // Três formas, todas com CUSTÓDIA: o que está em jogo sai da carteira de
  // quem anuncia e fica com o bot até fechar ou cancelar. Sem isso, qualquer
  // uma delas vira golpe na primeira semana.
  if (["mercado", "bazar", "p2p"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem",
      description: en ? `Create one with \`${P}game criar\`.` : `Crie com \`${P}game criar\`.`, colour: COR.aviso });

    const moeda = garantirMoeda(serverId);
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2);

    if (["vender", "anunciar"].includes(acao)) {
      const preco = parseInt(resto[resto.length - 1], 10);
      const nomeItem = resto.slice(0, -1).join(" ").trim();
      if (!nomeItem || !Number.isFinite(preco) || preco < 1) {
        return sendEmbed(message.channel, { title: en ? "❌ Usage" : "❌ Uso",
          description: en
            ? `\`${P}game mercado vender <item> <price>\`\n\nE.g.: \`${P}game mercado vender Espada de Ferro 250\``
            : `\`${P}game mercado vender <item> <preço>\`\n\nEx.: \`${P}game mercado vender Espada de Ferro 250\``,
          colour: COR.erro });
      }
      const item = db.acharItemPorNome(nomeItem);
      if (!item || !db.temItem(serverId, eu, item.id)) {
        return sendEmbed(message.channel, { title: en ? "❌ You don't have that" : "❌ Você não tem isso",
          description: en ? `**${nomeItem}** isn't in your bag.` : `**${nomeItem}** não está na sua mochila.`, colour: COR.erro });
      }
      const slot = db.slotDoItem(serverId, eu, item.id);
      if (slot) db.desequipar(serverId, eu, slot);
      db.tirarItem(serverId, eu, item.id, 1);
      const of = db.criarOferta({ serverId, tipo: "venda", autorId: eu,
        itemOferecido: item.id, moedaPedida: moeda.id, qtdPedida: preco });
      return sendEmbed(message.channel, { title: en ? "🏷️ Listed" : "🏷️ Anunciado",
        description: (en ? [
          `**${item.nome}** for ${moeda.simbolo}${fmt(preco)}`,
          "_The item is held in escrow with me until someone buys it or you cancel._",
          "",
          `Offer **#${of.id}** · cancel: \`${P}game mercado cancelar ${of.id}\``,
        ] : [
          `**${item.nome}** por ${moeda.simbolo}${fmt(preco)}`,
          "_O item ficou em custódia comigo até alguém comprar ou você cancelar._",
          "",
          `Oferta **#${of.id}** · cancelar: \`${P}game mercado cancelar ${of.id}\``,
        ]).join("\n"), colour: COR.sucesso });
    }

    if (["comprar", "aceitar"].includes(acao)) {
      const id = parseInt(resto[0], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      if (!of || of.serverId !== serverId || of.estado !== "aberta") {
        return sendEmbed(message.channel, { title: en ? "❌ Offer unavailable" : "❌ Oferta indisponível",
          description: en ? `See the open ones with \`${P}game mercado\`.` : `Veja as abertas com \`${P}game mercado\`.`, colour: COR.erro });
      }
      if (of.autorId === eu) {
        return sendEmbed(message.channel, { title: en ? "🤔 It's yours" : "🤔 É sua",
          description: en ? `To take it down: \`${P}game mercado cancelar ${of.id}\`.` : `Para tirar do ar: \`${P}game mercado cancelar ${of.id}\`.`, colour: COR.aviso });
      }
      const volume = db.volumeRecente(serverId);
      const { pct, valor: taxa } = ECO.calcularTaxa(of.qtdPedida, volume);
      const total = of.qtdPedida;
      const saldo = db.getSaldo(serverId, eu, of.moedaPedida ?? moeda.id);
      if (saldo < total) {
        return sendEmbed(message.channel, { title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
          description: en ? `You need ${moeda.simbolo}${fmt(total)} — you have ${moeda.simbolo}${fmt(saldo)}.` : `Precisa de ${moeda.simbolo}${fmt(total)} — você tem ${moeda.simbolo}${fmt(saldo)}.`,
          colour: COR.erro });
      }
      db.debitar(serverId, eu, of.moedaPedida, total);
      db.creditar(serverId, of.autorId, of.moedaPedida, total - taxa);
      const m = db.getMoeda(serverId, of.moedaPedida);
      if (m) db.salvarMoeda(serverId, of.moedaPedida, { mercado: (m.mercado ?? 0) + taxa });
      if (of.tipo === "cambio") db.creditar(serverId, eu, of.moedaOferecida, of.qtdOferecida);
      else db.darItem(serverId, eu, of.itemOferecido);
      db.fecharOferta(of.id, "fechada", total);

      const oQue = of.tipo === "cambio"
        ? `${fmt(of.qtdOferecida)} ${db.getMoeda(serverId, of.moedaOferecida)?.simbolo ?? ""}`
        : `**${db.getItem(of.itemOferecido)?.nome ?? "?"}**`;
      return sendEmbed(message.channel, { title: en ? "🤝 Deal closed" : "🤝 Negócio fechado",
        description: (en ? [
          `You took ${oQue} for ${moeda.simbolo}${fmt(total)}.`,
          `_Market fee: ${moeda.simbolo}${fmt(taxa)} (${(pct * 100).toFixed(2)}%)_`,
        ] : [
          `Você levou ${oQue} por ${moeda.simbolo}${fmt(total)}.`,
          `_Taxa do mercado: ${moeda.simbolo}${fmt(taxa)} (${(pct * 100).toFixed(2)}%)_`,
        ]).join("\n"), colour: COR.sucesso });
    }

    if (["cancelar", "retirar"].includes(acao)) {
      const id = parseInt(resto[0], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      if (!of || of.autorId !== eu || of.estado !== "aberta") {
        return sendEmbed(message.channel, { title: en ? "❌ Can't cancel" : "❌ Não dá para cancelar",
          description: en ? "The offer doesn't exist, isn't yours, or already closed." : "A oferta não existe, não é sua, ou já fechou.", colour: COR.erro });
      }
      if (of.itemOferecido) db.darItem(serverId, eu, of.itemOferecido);
      if (of.moedaOferecida) db.creditar(serverId, eu, of.moedaOferecida, of.qtdOferecida);
      db.fecharOferta(of.id, "cancelada");
      return sendEmbed(message.channel, { title: en ? "↩️ Cancelled" : "↩️ Cancelada",
        description: en ? "What was held in escrow came back to you." : "O que estava em custódia voltou para você.", colour: COR.mod });
    }

    const ofertas = db.listarOfertas(serverId);
    if (!ofertas.length) {
      return sendEmbed(message.channel, { title: en ? "🏪 Empty bazaar" : "🏪 Bazar vazio",
        description: (en ? [
          "Nobody is selling anything right now.",
          "",
          `\`${P}game mercado vender <item> <price>\` — list yours`,
          `\`${P}game cambio <qty> <currency> para <currency>\` — exchange with the bank`,
          `\`${P}game cambio <qty> <currency> por <qty> <currency>\` — offer to another player`,
          `\`${P}game trocar @person <your item> por <their item>\` — barter`,
        ] : [
          "Ninguém está vendendo nada agora.",
          "",
          `\`${P}game mercado vender <item> <preço>\` — anuncie o seu`,
          `\`${P}game cambio <qtd> <moeda> para <moeda>\` — troca com o banco`,
          `\`${P}game cambio <qtd> <moeda> por <qtd> <moeda>\` — oferta a outro jogador`,
          `\`${P}game trocar @pessoa <seu item> por <item dela>\` — escambo`,
        ]).join("\n"), colour: COR.info });
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
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem",
      description: en ? `Create one with \`${P}game criar\`.` : `Crie com \`${P}game criar\`.`, colour: COR.aviso });

    const moedas = db.listarMoedas(serverId);
    const texto = args.slice(1).join(" ");

    // ── &game cambio taxas — quanto o banco paga hoje, de cada uma para cada ──
    if (/^(taxas?|rates?|tabela|table)$/i.test(texto.trim())) {
      if (moedas.length < 2) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "💱 Taxas do banco",
            description: "Só há uma moeda aqui — o câmbio precisa de pelo menos duas.", colour: COR.aviso },
          { title: "💱 Bank rates",
            description: "There's only one currency here — exchange needs at least two.", colour: COR.aviso }));
      }
      // O P de cada moeda é o que define o valor dela: quanto mais concentrada
      // (P alto), menos vale — é a escassez que dá preço, não um número fixo.
      const linhas = [];
      for (const de of moedas) {
        const partes = moedas.filter((x) => x.id !== de.id).map((para) => {
          const r = ECO.converter(100, de, para);
          return `${para.simbolo}${fmt(r.recebe)} ${para.id}`;
        });
        linhas.push(`${de.simbolo} **100 ${de.nome}** → ${partes.join(" · ")}`);
      }
      linhas.push("", en
        ? `_Spread: ${(ECO.CFG.spread * 100).toFixed(0)}% — it's what keeps A→B→A from paying off._`
        : `_Spread: ${(ECO.CFG.spread * 100).toFixed(0)}% — é o que impede o A→B→A dar lucro._`);
      linhas.push(en
        ? `_The rate is the ratio between the bank's stocks — big trades move it against you._`
        : `_A taxa é a razão entre os estoques do banco — trocas grandes a movem contra você._`);
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "💱 Bank rates" : "💱 Taxas do banco", linhas, colour: COR.info });
    }

    // ── &game cambio <qtd> <moeda> para <moeda> — troca com o BANCO ──
    // Sem contraparte e sem espera: é o que faltava para quem só quer trocar.
    const mb = texto.match(/^(\d+)\s+(\S+)\s+(?:para|to|por|→|->)\s+(\S+)$/i);
    if (mb) {
      const [, qtdTxt, nomeDe, nomePara] = mb;
      const de = db.acharMoeda(serverId, nomeDe);
      const para = db.acharMoeda(serverId, nomePara);
      if (!de || !para || de.id === para.id) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Moedas inválidas",
            description: "Precisam ser duas moedas diferentes deste servidor.", colour: COR.erro },
          { title: "❌ Invalid currencies",
            description: "They must be two different currencies from this server.", colour: COR.erro }));
      }
      const qtd = Number(qtdTxt);
      const saldo = db.getSaldo(serverId, eu, de.id);
      if (qtd <= 0 || saldo < qtd) {
        return sendEmbed(message.channel, {
          title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
          description: en ? `You have ${de.simbolo}${fmt(saldo)}.` : `Você tem ${de.simbolo}${fmt(saldo)}.`,
          colour: COR.erro });
      }

      const r = ECO.converter(qtd, de, para);
      if (r.recebe <= 0) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "💱 Valor pequeno demais",
            description: `${fmt(qtd)} ${de.nome} não chega a 1 ${para.nome} pela taxa de hoje.`, colour: COR.aviso },
          { title: "💱 Amount too small",
            description: `${fmt(qtd)} ${de.nome} doesn't reach 1 ${para.nome} at today's rate.`, colour: COR.aviso }));
      }

      // Moeda finita tem estoque: o banco não pode pagar o que não tem.
      const atualPara = db.getMoeda(serverId, para.id);
      if (atualPara?.finita && (atualPara.mercado ?? 0) < r.recebe) {
        return sendEmbed(message.channel, {
          title: en ? "🏦 The bank is short" : "🏦 O banco não tem tanto",
          description: en
            ? `The bank only holds ${para.simbolo}${fmt(atualPara.mercado ?? 0)} of **${para.nome}** right now.\n\n_Finite currencies come back to the bank as people spend them. Try a smaller amount, or the counter: \`${P}game cambio ${qtd} ${de.id} por <qty> ${para.id}\`._`
            : `O banco só tem ${para.simbolo}${fmt(atualPara.mercado ?? 0)} de **${para.nome}** agora.\n\n_Moedas finitas voltam ao banco conforme as pessoas gastam. Tente um valor menor, ou use o balcão: \`${P}game cambio ${qtd} ${de.id} por <qtd> ${para.id}\`._`,
          colour: COR.aviso });
      }

      // A troca move as DUAS reservas, sempre: é o deslocamento delas que faz o
      // preço reagir. `pagarAoJogador` só desconta o estoque de moeda finita —
      // aqui o banco é o balcão do câmbio, então o débito vale para as duas.
      db.debitar(serverId, eu, de.id, qtd);
      db.salvarMoeda(serverId, de.id, { mercado: (db.getMoeda(serverId, de.id)?.mercado ?? 0) + qtd });
      const recebido = r.recebe;
      db.creditar(serverId, eu, para.id, recebido);
      db.salvarMoeda(serverId, para.id, {
        mercado: Math.max(1, (db.getMoeda(serverId, para.id)?.mercado ?? 0) - recebido) });

      const carteira = db.listarMoedas(serverId)
        .map((x) => `${x.simbolo}${fmt(db.getSaldo(serverId, eu, x.id))}`).join(" · ");
      return sendEmbed(message.channel, {
        title: en ? "💱 Exchanged" : "💱 Trocado",
        description: (en ? [
          `${de.simbolo}**${fmt(qtd)} ${de.nome}** → ${para.simbolo}**${fmt(recebido)} ${para.nome}**`,
          `_Rate: 1 ${de.nome} = ${ECO.taxaCambio(de, para).toFixed(4)} ${para.nome} · spread ${para.simbolo}${fmt(r.taxa)}_`,
          "",
          `**Your wallet:** ${carteira}`,
        ] : [
          `${de.simbolo}**${fmt(qtd)} ${de.nome}** → ${para.simbolo}**${fmt(recebido)} ${para.nome}**`,
          `_Taxa: 1 ${de.nome} = ${ECO.taxaCambio(de, para).toFixed(4)} ${para.nome} · spread ${para.simbolo}${fmt(r.taxa)}_`,
          "",
          `**Sua carteira:** ${carteira}`,
        ]).join("\n"), colour: COR.sucesso });
    }

    const m = texto.match(/^(\d+)\s+(\S+)\s+por\s+(\d+)\s+(\S+)$/i);
    if (!m) {
      const linhas = en ? [
        "**Two ways to exchange**",
        `\`${P}game cambio <qty> <currency> para <currency>\` — **with the bank**, instantly`,
        `   e.g. \`${P}game cambio 100 real para dolar\``,
        `\`${P}game cambio <qty> <currency> por <qty> <currency>\` — offer to **another player**`,
        `   e.g. \`${P}game cambio 100 real por 5 dolar\``,
        "",
        "**Server currencies:**",
        ...moedas.map((x) => `${x.simbolo} **${x.nome}** \`${x.id}\` — you have ${fmt(db.getSaldo(serverId, eu, x.id))}`),
        "",
        `\`${P}game cambio taxas\` — the bank's current rates`,
        `_The bank always trades, at the rate of the day and a ${(ECO.CFG.spread * 100).toFixed(0)}% spread._`,
        "_At the counter you set whatever rate you like; whoever accepts, accepts._",
      ] : [
        "**Duas formas de trocar**",
        `\`${P}game cambio <qtd> <moeda> para <moeda>\` — **com o banco**, na hora`,
        `   ex.: \`${P}game cambio 100 real para dolar\``,
        `\`${P}game cambio <qtd> <moeda> por <qtd> <moeda>\` — oferta a **outro jogador**`,
        `   ex.: \`${P}game cambio 100 real por 5 dolar\``,
        "",
        "**Moedas do servidor:**",
        ...moedas.map((x) => `${x.simbolo} **${x.nome}** \`${x.id}\` — você tem ${fmt(db.getSaldo(serverId, eu, x.id))}`),
        "",
        `\`${P}game cambio taxas\` — as taxas do banco agora`,
        `_O banco sempre troca, pela taxa do dia e um spread de ${(ECO.CFG.spread * 100).toFixed(0)}%._`,
        "_No balcão você define a taxa que quiser; quem aceitar, aceita._",
      ];
      if (moedas.length < 2) linhas.push("", en
        ? "_There's only one currency here — exchange needs at least two._"
        : "_Só há uma moeda aqui — o câmbio precisa de pelo menos duas._");
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "💱 Exchange counter" : "💱 Balcão de câmbio", linhas, colour: COR.info });
    }

    const [, qtdDe, nomeDe, qtdPara, nomePara] = m;
    const de = db.acharMoeda(serverId, nomeDe);
    const para = db.acharMoeda(serverId, nomePara);
    if (!de || !para || de.id === para.id) {
      return sendEmbed(message.channel, { title: en ? "❌ Invalid currencies" : "❌ Moedas inválidas",
        description: en ? "They must be two different currencies from this server." : "Precisam ser duas moedas diferentes deste servidor.", colour: COR.erro });
    }
    const saldo = db.getSaldo(serverId, eu, de.id);
    if (saldo < Number(qtdDe)) {
      return sendEmbed(message.channel, { title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
        description: en ? `You have ${de.simbolo}${fmt(saldo)}.` : `Você tem ${de.simbolo}${fmt(saldo)}.`, colour: COR.erro });
    }
    db.debitar(serverId, eu, de.id, Number(qtdDe));
    const of = db.criarOferta({ serverId, tipo: "cambio", autorId: eu,
      moedaOferecida: de.id, qtdOferecida: Number(qtdDe),
      moedaPedida: para.id, qtdPedida: Number(qtdPara) });

    const ref = ECO.converter(Number(qtdDe), de, para);
    return sendEmbed(message.channel, { title: en ? "💱 Offer published" : "💱 Oferta publicada",
      description: (en ? [
        `Offering **${fmt(qtdDe)} ${de.nome}** ${de.simbolo} for **${fmt(qtdPara)} ${para.nome}** ${para.simbolo}`,
        `_The system would pay ~${fmt(ref.recebe)} — your rate is ${Number(qtdPara) < ref.recebe ? "better" : "worse"} for whoever accepts._`,
        "",
        `Offer **#${of.id}** · the amount is held in escrow with me.`,
      ] : [
        `Oferece **${fmt(qtdDe)} ${de.nome}** ${de.simbolo} por **${fmt(qtdPara)} ${para.nome}** ${para.simbolo}`,
        `_O sistema pagaria ~${fmt(ref.recebe)} — a sua taxa é ${Number(qtdPara) < ref.recebe ? "melhor" : "pior"} para quem aceitar._`,
        "",
        `Oferta **#${of.id}** · o valor ficou em custódia comigo.`,
      ]).join("\n"), colour: COR.sucesso });
  }

  // ── escambo: item por item ──
  if (["trocar", "escambo", "permuta"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem",
      description: en ? `Create one with \`${P}game criar\`.` : `Crie com \`${P}game criar\`.`, colour: COR.aviso });

    const acao = args[1]?.toLowerCase();

    if (["aceitar", "aceito"].includes(acao)) {
      const id = parseInt(args[2], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      if (!of || of.tipo !== "troca" || of.estado !== "aberta" || of.serverId !== serverId) {
        return sendEmbed(message.channel, { title: en ? "❌ Proposal unavailable" : "❌ Proposta indisponível",
          description: en ? `See yours with \`${P}game trocar\`.` : `Veja as suas com \`${P}game trocar\`.`, colour: COR.erro });
      }
      if (of.alvoId && of.alvoId !== eu) {
        return sendEmbed(message.channel, { title: en ? "❌ Not for you" : "❌ Não é para você",
          description: en ? "That proposal was made to someone else." : "Essa proposta foi feita a outra pessoa.", colour: COR.erro });
      }
      if (!db.temItem(serverId, eu, of.itemPedido)) {
        const pedido = db.getItem(of.itemPedido);
        return sendEmbed(message.channel, { title: en ? "❌ You don't have what they want" : "❌ Você não tem o que ele quer",
          description: en ? `The proposal asks for **${pedido?.nome ?? "?"}**.` : `A proposta pede **${pedido?.nome ?? "?"}**.`, colour: COR.erro });
      }
      const slot = db.slotDoItem(serverId, eu, of.itemPedido);
      if (slot) db.desequipar(serverId, eu, slot);
      db.tirarItem(serverId, eu, of.itemPedido, 1);
      db.darItem(serverId, eu, of.itemOferecido);
      db.darItem(serverId, of.autorId, of.itemPedido);
      db.fecharOferta(of.id, "fechada", 0);
      return sendEmbed(message.channel, { title: en ? "🔄 Traded" : "🔄 Trocado",
        description: en ? `You gave **${db.getItem(of.itemPedido)?.nome}** and took **${db.getItem(of.itemOferecido)?.nome}**.` : `Você deu **${db.getItem(of.itemPedido)?.nome}** e levou **${db.getItem(of.itemOferecido)?.nome}**.`,
        colour: COR.sucesso });
    }

    const texto = args.slice(1).join(" ");
    const mm = texto.match(/^(.*?)\s+por\s+(.*)$/i);
    if (!mm) {
      const minhas = db.listarOfertas(serverId, { tipo: "troca" })
        .filter((o) => o.autorId === eu || !o.alvoId || o.alvoId === eu);
      const linhas = minhas.length ? minhas.map((o) => {
        const ofe = db.getItem(o.itemOferecido), ped = db.getItem(o.itemPedido);
        const quem = o.autorId === eu
          ? (en ? "you offer" : "você oferece")
          : (en ? "offered to you" : "oferecem a você");
        return en
          ? `\`#${o.id}\` ${quem}: **${ofe?.nome}** for **${ped?.nome}**`
          : `\`#${o.id}\` ${quem}: **${ofe?.nome}** por **${ped?.nome}**`;
      }) : [en ? "_No open proposals._" : "_Nenhuma proposta aberta._"];
      linhas.push("", en ? `\`${P}game trocar [@person] <your item> por <their item>\`` : `\`${P}game trocar [@pessoa] <seu item> por <item dela>\``,
        en ? `\`${P}game trocar aceitar <#>\` — closes the trade` : `\`${P}game trocar aceitar <#>\` — fecha a troca`);
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "🔄 Barter" : "🔄 Escambo", linhas, colour: COR.info });
    }

    const alvoId = message.mentionIds?.[0] ?? null;
    const meuNome = mm[1].replace(/<[@%#][^>]*>/g, "").trim();
    const item = db.acharItemPorNome(meuNome);
    const quer = db.acharItemPorNome(mm[2].trim());
    if (!item || !quer) {
      return sendEmbed(message.channel, { title: en ? "❌ Unknown item" : "❌ Item desconhecido",
        description: en
          ? `I couldn't find ${!item ? `**${meuNome}**` : `**${mm[2].trim()}**`}.`
          : `Não achei ${!item ? `**${meuNome}**` : `**${mm[2].trim()}**`}.`, colour: COR.erro });
    }
    if (!db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: en ? "❌ You don't have that" : "❌ Você não tem isso",
        description: en ? `**${item.nome}** isn't in your bag.` : `**${item.nome}** não está na sua mochila.`, colour: COR.erro });
    }
    const slot = db.slotDoItem(serverId, eu, item.id);
    if (slot) db.desequipar(serverId, eu, slot);
    db.tirarItem(serverId, eu, item.id, 1);
    const of = db.criarOferta({ serverId, tipo: "troca", autorId: eu, alvoId,
      itemOferecido: item.id, itemPedido: quer.id });
    return sendEmbed(message.channel, { title: en ? "🔄 Proposal sent" : "🔄 Proposta feita",
      description: [
        `Oferece **${item.nome}** por **${quer.nome}**${alvoId ? ` a <@${alvoId}>` : " (aberta a qualquer um)"}`,
        "_Seu item ficou em custódia comigo._",
        "",
        `Proposta **#${of.id}** · quem aceitar: \`${P}game trocar aceitar ${of.id}\``,
      ].join("\n"), colour: COR.sucesso });
  }

  // ── loja: comprar e vender ──
  // ── &game item <nome> — a ficha de UM item, com preço ──
  // O catálogo lista dezenas de itens; ver o preço de cada um obrigava a
  // abrir o mercado inteiro e procurar. Aqui é uma consulta direta.
  if (["item", "ficha-item", "preco", "preço", "price"].includes(sub)) {
    const busca = args.slice(1).join(" ").trim();
    if (!busca) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Qual item?",
        description: `\`${P}game item <nome>\`\n\nEx.: \`${P}game item Espada de Ferro\`\nVeja a lista com \`${P}game catalogo\`.`,
        colour: COR.erro,
      }, {
        title: "❌ Which item?",
        description: `\`${P}game item <name>\`\n\nE.g.: \`${P}game item Espada de Ferro\`\nSee the list with \`${P}game catalogo\`.`,
        colour: COR.erro,
      }));
    }
    const item = db.acharItemPorNome(busca);
    if (!item) {
      return sendEmbed(message.channel, {
        title: en ? "❌ Unknown item" : "❌ Item desconhecido",
        description: en ? `I couldn't find any item called **${busca}**.` : `Não achei nenhum item chamado **${busca}**.`,
        colour: COR.erro });
    }

    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const est = db.getEstoque(serverId, item.id);
    const estoque = item.infinito ? null : (est?.quantidade ?? est?.base ?? 0);
    const preco = ECO.precoDeVenda(item, est, pSuave);
    const p = db.getPersonagem(serverId, eu);
    const carisma = p ? atributosComEquipamento(p, serverId, eu).carisma : 0;
    const recompra = ECO.precoDeRecompra(preco, carisma);
    const r = RARIDADE_INFO[item.raridade] ?? {};
    const si = SLOT_INFO[item.slot] ?? {};
    const temNaMochila = p ? (db.getInventario(serverId, eu).find((x) => x.id === item.id)?.quantidade ?? 0) : 0;

    // Quanto custa em CADA moeda: é a pergunta natural de quem tem carteira
    // variada, e evita ter de fazer a conta do câmbio na mão.
    const emCadaMoeda = db.listarMoedas(serverId).map((m) => {
      const c = m.id === moeda.id ? preco : Math.ceil(preco / Math.max(0.000001, ECO.taxaCambio(m, moeda)));
      const seu = db.getSaldo(serverId, eu, m.id);
      return `${m.simbolo} ${fmt(c)} ${m.id}${seu >= c ? " ✅" : ""}`;
    });

    const linhas = en ? [
      `${r.emoji ?? ""} **${item.nome}** — ${r.rotulo ?? item.raridade}`,
      `${si.emoji ?? "•"} **Slot:** ${si.rotuloEN ?? si.rotulo ?? item.slot}`,
      `**Bonus:** ${descreverBonus(item.bonus)}`,
      "",
      `**Price:** ${moeda.simbolo}${fmt(preco)}`,
      `**The market pays you:** ${moeda.simbolo}${fmt(recompra)} _(your Charisma ${carisma})_`,
      `**Stock:** ${item.infinito ? "♾️ infinite" : `${fmt(estoque)} left`}`,
      temNaMochila ? `**In your bag:** ${temNaMochila}` : null,
      "",
      "**In each currency** _(✅ = you can afford it)_",
      ...emCadaMoeda,
      "",
      `\`${P}game comprar ${item.nome}\` · \`${P}game comprar ${item.nome} com <currency>\``,
    ] : [
      `${r.emoji ?? ""} **${item.nome}** — ${r.rotulo ?? item.raridade}`,
      `${si.emoji ?? "•"} **Slot:** ${si.rotulo ?? item.slot}`,
      `**Bônus:** ${descreverBonus(item.bonus)}`,
      "",
      `**Preço:** ${moeda.simbolo}${fmt(preco)}`,
      `**O mercado te paga:** ${moeda.simbolo}${fmt(recompra)} _(seu Carisma ${carisma})_`,
      `**Estoque:** ${item.infinito ? "♾️ infinito" : `${fmt(estoque)} restante(s)`}`,
      temNaMochila ? `**Na sua mochila:** ${temNaMochila}` : null,
      "",
      "**Em cada moeda** _(✅ = dá para pagar)_",
      ...emCadaMoeda,
      "",
      `\`${P}game comprar ${item.nome}\` · \`${P}game comprar ${item.nome} com <moeda>\``,
    ];
    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "📦 Item" : "📦 Item", linhas: linhas.filter(Boolean), colour: COR.info });
  }

  // ── &game magias / magia / aprender — o grimório ──
  if (["magias", "magia", "grimorio", "grimório", "aprender", "spells", "spell", "learn"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, tr(ctx,
      { title: "🎭 Sem personagem", description: `Crie o seu com \`${P}game criar\`.`, colour: COR.aviso },
      { title: "🎭 No character", description: `Create yours with \`${P}game criar\`.`, colour: COR.aviso }));

    const aprender = ["aprender", "learn"].includes(sub) || ["aprender", "learn", "comprar", "buy"].includes(String(args[1] ?? "").toLowerCase());
    const restoBruto = ["aprender", "learn"].includes(sub)
      ? args.slice(1).join(" ").trim()
      : args.slice(["aprender", "learn", "comprar", "buy"].includes(String(args[1] ?? "").toLowerCase()) ? 2 : 1).join(" ").trim();

    const moedaPadrao = garantirMoeda(serverId);
    const attr = atributosComEquipamento(p, serverId, eu);
    const conhecidas = new Set(db.listarMagias(serverId, eu).map((x) => x.magiaId));

    // ── aprender uma magia ──
    if (aprender && restoBruto) {
      // aceita "... com <moeda>", igual à compra de item
      let alvo = restoBruto, moedaEscolhida = null;
      const mm = alvo.match(/^(.*?)\s+(?:com|with|em|in)\s+(\S+)$/i);
      if (mm) {
        const achada = db.acharMoeda(serverId, mm[2]);
        if (achada) { alvo = mm[1].trim(); moedaEscolhida = achada; }
      }
      const magia = MAG.acharMagia(alvo);
      if (!magia) {
        return sendEmbed(message.channel, {
          title: en ? "❌ Unknown spell" : "❌ Magia desconhecida",
          description: en
            ? `I couldn't find **${alvo}**. See the list with \`${P}game magias\`.`
            : `Não achei **${alvo}**. Veja a lista com \`${P}game magias\`.`,
          colour: COR.erro });
      }
      if (conhecidas.has(magia.id)) {
        return sendEmbed(message.channel, {
          title: en ? "📖 Already known" : "📖 Você já conhece",
          description: en
            ? `**${magia.nome}** is already in your grimoire.`
            : `**${magia.nome}** já está no seu grimório.`,
          colour: COR.aviso });
      }
      if (p.nivel < magia.nivelMin) {
        return sendEmbed(message.channel, {
          title: en ? "🔒 Level too low" : "🔒 Nível insuficiente",
          description: en
            ? `**${magia.nome}** requires level **${magia.nivelMin}** — you're level ${p.nivel}.`
            : `**${magia.nome}** exige nível **${magia.nivelMin}** — você está no ${p.nivel}.`,
          colour: COR.aviso });
      }

      const preco = MAG.precoComCarisma(magia.preco, attr.carisma);
      const pag = moedaEscolhida
        ? (() => {
          const custo = moedaEscolhida.id === moedaPadrao.id
            ? preco
            : Math.ceil(preco / Math.max(0.000001, ECO.taxaCambio(moedaEscolhida, moedaPadrao)));
          return { moeda: moedaEscolhida, custo, convertido: moedaEscolhida.id !== moedaPadrao.id,
            semSaldo: db.getSaldo(serverId, eu, moedaEscolhida.id) < custo, escolhida: true };
        })()
        : moedaParaPagar(serverId, eu, preco);
      if (pag.semSaldo) {
        return sendEmbed(message.channel, {
          title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
          description: en
            ? `**${magia.nome}** costs ${pag.moeda.simbolo}${fmt(pag.custo)} — you have ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`
            : `**${magia.nome}** custa ${pag.moeda.simbolo}${fmt(pag.custo)} — você tem ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`,
          colour: COR.erro });
      }

      jogadorPaga(serverId, eu, pag.moeda, pag.custo);
      db.aprenderMagia(serverId, eu, magia.id);

      // Aprender sem Mana para lançar é o erro clássico — o aviso vem junto.
      const depois = atributosDaParty(db.getPersonagem(serverId, eu), serverId, eu);
      const ativa = depois.magias.some((x) => x.id === magia.id || x.nome === magia.nome);
      const esc = MAG.ESCOLAS[magia.tipo] ?? {};
      return sendEmbed(message.channel, {
        title: en ? "📖 Spell learned" : "📖 Magia aprendida",
        description: (en ? [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotuloEN ?? magia.tipo} · ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%`,
          `Paid ${pag.moeda.simbolo}${fmt(pag.custo)}${pag.convertido ? ` _(price was ${moedaPadrao.simbolo}${fmt(preco)})_` : ""}`,
          "",
          ativa
            ? `✅ Active now — mana in use: ${depois.manaGasta}/${depois.manaTotal}`
            : `⚠️ It doesn't fit in your mana yet (${depois.manaGasta}/${depois.manaTotal} in use). Raise **Mana** with \`${P}game pontos mana\`.`,
        ] : [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotulo ?? magia.tipo} · ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%`,
          `Pagou ${pag.moeda.simbolo}${fmt(pag.custo)}${pag.convertido ? ` _(preço era ${moedaPadrao.simbolo}${fmt(preco)})_` : ""}`,
          "",
          ativa
            ? `✅ Já está ativa — mana em uso: ${depois.manaGasta}/${depois.manaTotal}`
            : `⚠️ Ainda não cabe na sua mana (${depois.manaGasta}/${depois.manaTotal} em uso). Suba **Mana** com \`${P}game pontos mana\`.`,
        ]).join("\n"), colour: COR.sucesso });
    }

    // ── ficha de UMA magia ──
    if (!aprender && restoBruto) {
      const magia = MAG.acharMagia(restoBruto);
      if (magia) {
        const esc = MAG.ESCOLAS[magia.tipo] ?? {};
        const preco = MAG.precoComCarisma(magia.preco, attr.carisma);
        const emCada = db.listarMoedas(serverId).map((m) => {
          const c = m.id === moedaPadrao.id ? preco : Math.ceil(preco / Math.max(0.000001, ECO.taxaCambio(m, moedaPadrao)));
          return `${m.simbolo} ${fmt(c)} ${m.id}${db.getSaldo(serverId, eu, m.id) >= c ? " ✅" : ""}`;
        });
        const linhas = en ? [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotuloEN ?? magia.tipo}`,
          `**Mana cost:** ${magia.custo} 🔷  ·  **Power:** +${(magia.poder * 100).toFixed(0)}%`,
          `**Required level:** ${magia.nivelMin}  ·  **Rarity:** ${RARIDADE_INFO[magia.raridade]?.rotulo ?? magia.raridade}`,
          `**Price:** ${moedaPadrao.simbolo}${fmt(preco)} _(your Charisma ${attr.carisma} is already applied)_`,
          conhecidas.has(magia.id) ? "📖 **You already know this one.**" : null,
          "",
          "**In each currency** _(✅ = you can afford it)_",
          ...emCada,
          "",
          `\`${P}game aprender ${magia.nome}\` · \`${P}game aprender ${magia.nome} com <currency>\``,
        ] : [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotulo ?? magia.tipo}`,
          `**Custo de mana:** ${magia.custo} 🔷  ·  **Poder:** +${(magia.poder * 100).toFixed(0)}%`,
          `**Nível exigido:** ${magia.nivelMin}  ·  **Raridade:** ${RARIDADE_INFO[magia.raridade]?.rotulo ?? magia.raridade}`,
          `**Preço:** ${moedaPadrao.simbolo}${fmt(preco)} _(já com o seu Carisma ${attr.carisma})_`,
          conhecidas.has(magia.id) ? "📖 **Você já conhece esta.**" : null,
          "",
          "**Em cada moeda** _(✅ = dá para pagar)_",
          ...emCada,
          "",
          `\`${P}game aprender ${magia.nome}\` · \`${P}game aprender ${magia.nome} com <moeda>\``,
        ];
        return enviarLista(sendEmbed, message.channel, {
          titulo: en ? "✦ Spell" : "✦ Magia", linhas: linhas.filter(Boolean), colour: COR.info });
      }
      // Pediu uma magia que não existe. Cair na lista inteira sem dizer nada
      // faria parecer que o comando ignorou o argumento.
      return sendEmbed(message.channel, {
        title: en ? "❌ Unknown spell" : "❌ Magia desconhecida",
        description: en
          ? `I couldn't find **${restoBruto}**. See the whole catalog with \`${P}game magias\`.`
          : `Não achei **${restoBruto}**. Veja o catálogo inteiro com \`${P}game magias\`.`,
        colour: COR.erro });
    }

    // ── a lista ──
    const estado = atributosDaParty(p, serverId, eu);
    const ativas = new Set(estado.magias.map((m) => m.nome));
    const linhas = [];
    linhas.push(en
      ? `**Mana in use: ${estado.manaGasta}/${estado.manaTotal}** — spells enter from the strongest down, while the mana lasts.`
      : `**Mana em uso: ${estado.manaGasta}/${estado.manaTotal}** — as magias entram da mais forte para a mais fraca, enquanto a mana durar.`);
    linhas.push("");

    for (const tipo of ["ataque", "suporte"]) {
      const esc = MAG.ESCOLAS[tipo];
      linhas.push(`${esc.emoji} **${en ? esc.rotuloEN : esc.rotulo}**`);
      for (const m of MAG.CATALOGO.filter((x) => x.tipo === tipo)) {
        const tem = conhecidas.has(m.id);
        const marca = tem ? (ativas.has(m.nome) ? " ✅" : " 💤") : "";
        const preco = MAG.precoComCarisma(m.preco, attr.carisma);
        const trava = p.nivel < m.nivelMin ? ` 🔒${en ? "lv" : "nv"} ${m.nivelMin}` : "";
        linhas.push(tem
          ? `   **${m.nome}**${marca} — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}%`
          : `   **${m.nome}**${trava} — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}% · ${moedaPadrao.simbolo}${fmt(preco)}`);
      }
      linhas.push("");
    }
    linhas.push(en
      ? "_✅ active · 💤 known but doesn't fit in your mana · 🔒 level required_"
      : "_✅ ativa · 💤 conhecida mas não cabe na mana · 🔒 nível exigido_");
    linhas.push(en
      ? `\`${P}game magia <name>\` — details · \`${P}game aprender <name> [com <currency>]\``
      : `\`${P}game magia <nome>\` — detalhes · \`${P}game aprender <nome> [com <moeda>]\``);
    if (estado.magiasDoGrimorio === 0) {
      linhas.push(en
        ? "_Followers also bring their own spells — they share the same mana pool._"
        : "_Os followers também trazem magias — dividem a mesma mana._");
    }
    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "✦ Grimoire" : "✦ Grimório", linhas, colour: COR.info });
  }

  if (["comprar", "loja"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem",
      description: en ? `Create one with \`${P}game criar\`.` : `Crie com \`${P}game criar\`.`, colour: COR.aviso });

    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    let busca = args.slice(1).join(" ").trim();

    // `... com <moeda>` / `... with <currency>`: escolher com que moeda pagar.
    // Antes, o bot escolhia sozinho a primeira que desse — o que é péssimo
    // quando você está guardando uma moeda rara e ele resolve gastá-la.
    let moedaEscolhida = null;
    const mComMoeda = busca.match(/^(.*?)\s+(?:com|with|em|in)\s+(\S+)$/i);
    if (mComMoeda) {
      const achada = db.acharMoeda(serverId, mComMoeda[2]);
      if (achada) { busca = mComMoeda[1].trim(); moedaEscolhida = achada; }
    }

    if (!busca) {
      const itens = db.listarItens().slice(0, 40);
      const linhas = itens.map((i) => {
        const est = db.getEstoque(serverId, i.id);
        const preco = ECO.precoDeVenda(i, est, pSuave);
        const qtd = i.infinito ? "♾️" : `${est?.quantidade ?? est?.base ?? 10}un`;
        const r = RARIDADE_INFO[i.raridade] ?? {};
        return `${r.emoji ?? ""} **${i.nome}** — ${moeda.simbolo}${fmt(preco)} _(${qtd})_`;
      });
      linhas.push("", en
        ? `_\`${P}game comprar <item>\` · your balance: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}_`
        : `_\`${P}game comprar <item>\` · seu saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}_`);
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "🏪 Market" : "🏪 Mercado", linhas, colour: COR.info });
    }

    const item = db.acharItemPorNome(busca);
    if (!item) return sendEmbed(message.channel, { title: en ? "❌ Unknown item" : "❌ Item desconhecido",
      description: en ? `I couldn't find **${busca}** in the market.` : `Não achei **${busca}** no mercado.`, colour: COR.erro });

    const est = db.getEstoque(serverId, item.id);
    if (!item.infinito && (est?.quantidade ?? est?.base ?? 10) <= 0) {
      return sendEmbed(message.channel, { title: en ? "📦 Sold out" : "📦 Esgotado",
        description: en ? `**${item.nome}** ran out in the market. Finite items return when someone sells.` : `**${item.nome}** acabou no mercado. Itens finitos voltam quando alguém vende.`, colour: COR.aviso });
    }
    const preco = ECO.precoDeVenda(item, est, pSuave);
    // Com moeda escolhida, o preço é convertido para ela pela taxa do balcão —
    // a mesma do &game cambio, para não haver duas cotações na mesma economia.
    const pag = moedaEscolhida
      ? (() => {
        const custo = moedaEscolhida.id === moeda.id
          ? preco
          : Math.ceil(preco / Math.max(0.000001, ECO.taxaCambio(moedaEscolhida, moeda)));
        const temSaldo = db.getSaldo(serverId, eu, moedaEscolhida.id) >= custo;
        return { moeda: moedaEscolhida, custo, convertido: moedaEscolhida.id !== moeda.id,
          padrao: moeda, semSaldo: !temSaldo, escolhida: true };
      })()
      : moedaParaPagar(serverId, eu, preco);
    if (pag.semSaldo) {
      const carteira = db.carteiraDe(serverId, eu)
        .map((c) => { const m = db.getMoeda(serverId, c.moedaId); return `${m?.simbolo ?? ""}${fmt(c.quantidade)}`; })
        .join(" · ") || "nada";
      const emMoeda = pag.escolhida
        ? (en
          ? `\nIn ${pag.moeda.nome} that's ${pag.moeda.simbolo}${fmt(pag.custo)} — you have ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`
          : `\nEm ${pag.moeda.nome} dá ${pag.moeda.simbolo}${fmt(pag.custo)} — você tem ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`)
        : "";
      return sendEmbed(message.channel, { title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
        description: (en ? `**${item.nome}** costs ${moeda.simbolo}${fmt(preco)}.${emMoeda}\nYou have: ${carteira}.` : `**${item.nome}** custa ${moeda.simbolo}${fmt(preco)}.${emMoeda}\nVocê tem: ${carteira}.`),
        colour: COR.erro });
    }
    jogadorPaga(serverId, eu, pag.moeda, pag.custo);
    db.darItem(serverId, eu, item.id);
    if (!item.infinito) db.ajustarEstoque(serverId, item.id, -1);
    return sendEmbed(message.channel, { title: en ? "🛒 Purchased" : "🛒 Comprado",
      description: (en ? [
        `${RARIDADE_INFO[item.raridade]?.emoji ?? ""} **${item.nome}** — ${descreverBonus(item.bonus)}`,
        `Paid ${pag.moeda.simbolo}${fmt(pag.custo)} · ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))} left`,
        pag.convertido ? `_(the price was ${moeda.simbolo}${fmt(preco)}; paid in ${pag.moeda.nome} at today's rate)_` : "",
        "",
        `_Equip it with \`${P}game equipar ${item.nome}\`._`,
      ] : [
        `${RARIDADE_INFO[item.raridade]?.emoji ?? ""} **${item.nome}** — ${descreverBonus(item.bonus)}`,
        `Pagou ${pag.moeda.simbolo}${fmt(pag.custo)} · resta ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}`,
        pag.convertido ? `_(preço era ${moeda.simbolo}${fmt(preco)}; pagou em ${pag.moeda.nome} pela taxa do dia)_` : "",
        "",
        `_Equipe com \`${P}game equipar ${item.nome}\`._`,
      ]).join("\n"), colour: COR.sucesso });
  }

  if (["vender"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem",
      description: en ? `Create one with \`${P}game criar\`.` : `Crie com \`${P}game criar\`.`, colour: COR.aviso });
    const busca = args.slice(1).join(" ").trim();
    if (!busca) return sendEmbed(message.channel, { title: en ? "❌ Sell what?" : "❌ Vender o quê?",
      description: en
        ? `\`${P}game vender <item>\`\n\nThe market pays **below** the sale price — your ✨Charisma improves the offer.`
        : `\`${P}game vender <item>\`\n\nO mercado paga **abaixo** do preço de venda — seu ✨Carisma melhora a oferta.`,
      colour: COR.erro });

    const item = db.acharItemPorNome(busca);
    if (!item || !db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: en ? "❌ You don't have that" : "❌ Você não tem isso",
        description: en ? `**${busca}** isn't in your bag.` : `**${busca}** não está na sua mochila.`, colour: COR.erro });
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

    return sendEmbed(message.channel, { title: en ? "💵 Sold" : "💵 Vendido",
      description: (en ? [
        `**${item.nome}** → ${moeda.simbolo}${fmt(pago)}`,
        `_The market sells for ${moeda.simbolo}${fmt(precoVenda)}; with your Charisma (${attr.carisma}) you got ${(ECO.fatorRecompra(attr.carisma) * 100).toFixed(0)}%._`,
        slot ? "\n_It was equipped — I unequipped it._" : "",
      ] : [
        `**${item.nome}** → ${moeda.simbolo}${fmt(pago)}`,
        `_O mercado vende por ${moeda.simbolo}${fmt(precoVenda)}; com seu Carisma (${attr.carisma}) você tirou ${(ECO.fatorRecompra(attr.carisma) * 100).toFixed(0)}%._`,
        slot ? "\n_Estava equipado — foi desequipado._" : "",
      ]).filter(Boolean).join("\n"), colour: COR.sucesso });
  }

  // ── contratar mercenário ──
  if (["contratar", "recrutar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem",
      description: en ? `Create one with \`${P}game criar\`.` : `Crie com \`${P}game criar\`.`, colour: COR.aviso });
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
      linhas.push("", en
        ? `_Your Charisma (${attr.carisma}) gives a **${((1 - desconto) * 100).toFixed(0)}%** discount._`
        : `_Seu Carisma (${attr.carisma}) dá **${((1 - desconto) * 100).toFixed(0)}%** de desconto._`,
        en
          ? `_Balance: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))} · \`${P}game contratar <name>\`_`
          : `_Saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))} · \`${P}game contratar <nome>\`_`);
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "🤝 Mercenaries available" : "🤝 Mercenários disponíveis", linhas, colour: COR.info });
    }

    const cat = db.acharFollowerCatalogo(busca);
    if (!cat) return sendEmbed(message.channel, { title: en ? "❌ I don't know that" : "❌ Não conheço",
      description: en ? `I couldn't find **${busca}**.` : `Não achei **${busca}**.`, colour: COR.erro });
    if (cat.soDungeon || !cat.preco) {
      return sendEmbed(message.channel, { title: en ? "🗝️ Not for sale" : "🗝️ Não está à venda",
        description: en ? `**${cat.nome}** only shows up as dungeon loot.` : `**${cat.nome}** só aparece como loot de dungeon.`, colour: COR.aviso });
    }
    const preco = Math.round(cat.preco * ECO.mult(pSuave) * desconto);
    const pag = moedaParaPagar(serverId, eu, preco);
    if (pag.semSaldo) {
      const carteira = db.carteiraDe(serverId, eu)
        .map((c) => { const m = db.getMoeda(serverId, c.moedaId); return `${m?.simbolo ?? ""}${fmt(c.quantidade)}`; })
        .join(" · ") || "nada";
      return sendEmbed(message.channel, { title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
        description: en ? `**${cat.nome}** costs ${moeda.simbolo}${fmt(preco)}.\nYou have: ${carteira}.` : `**${cat.nome}** custa ${moeda.simbolo}${fmt(preco)}.\nVocê tem: ${carteira}.`, colour: COR.erro });
    }
    jogadorPaga(serverId, eu, pag.moeda, pag.custo);
    const novo = db.recrutarFollower(serverId, eu, cat.id, 1);
    const cls = FOL.CLASSES[cat.classe] ?? {};
    return sendEmbed(message.channel, { title: en ? "🤝 Hired" : "🤝 Contratado",
      description: (en ? [
        `${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotulo}, lv 1)_ joined your group.`,
        `Paid ${pag.moeda.simbolo}${fmt(pag.custo)} · ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))} left`,
        pag.convertido ? `_(the price was ${moeda.simbolo}${fmt(preco)}; paid in ${pag.moeda.nome})_` : "",
        "",
        `_Take them along with \`${P}game follower levar ${cat.nome}\`._`,
      ] : [
        `${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotulo}, nv 1)_ entrou para o seu grupo.`,
        `Pagou ${pag.moeda.simbolo}${fmt(pag.custo)} · resta ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}`,
        pag.convertido ? `_(preço era ${moeda.simbolo}${fmt(preco)}; pagou em ${pag.moeda.nome})_` : "",
        "",
        `_Leve com \`${P}game follower levar ${cat.nome}\`._`,
      ]).join("\n"), colour: COR.sucesso });
  }

  // ── descanso pago ──
  if (["descansar", "descanso"].includes(sub)) {
    const meus = db.listarFollowersDe(serverId, eu);
    const cansados = meus.filter((f) => energiaAtual(f) < 5);
    if (!cansados.length) {
      return sendEmbed(message.channel, { title: en ? "😌 Everyone rested" : "😌 Todos descansados",
        description: en ? "Nobody needs rest right now." : "Ninguém precisa de descanso agora.", colour: COR.info });
    }
    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const faltando = cansados.reduce((acc, f) => acc + (5 - energiaAtual(f)), 0);
    const custo = Math.max(1, Math.round(faltando * 25 * ECO.mult(pSuave)));
    const saldo = db.getSaldo(serverId, eu, moeda.id);

    if (args[1]?.toLowerCase() !== "confirmar") {
      return sendEmbed(message.channel, { title: en ? "🛏️ Rest paid" : "🛏️ Descanso pago",
        description: (en ? [
          `Restore **${faltando}** energy point(s) for **${cansados.length}** companion(s).`,
          `Cost: ${moeda.simbolo}${fmt(custo)} · your balance: ${moeda.simbolo}${fmt(saldo)}`,
          "",
          `Confirm with \`${P}game descansar confirmar\`.`,
          "_Energy also comes back on its own: 1 per hour._",
        ] : [
          `Restaurar **${faltando}** ponto(s) de energia de **${cansados.length}** companheiro(s).`,
          `Custo: ${moeda.simbolo}${fmt(custo)} · seu saldo: ${moeda.simbolo}${fmt(saldo)}`,
          "",
          `Confirme com \`${P}game descansar confirmar\`.`,
          "_A energia também volta sozinha: 1 por hora._",
        ]).join("\n"), colour: COR.aviso });
    }
    const pag = moedaParaPagar(serverId, eu, custo);
    if (pag.semSaldo) {
      return sendEmbed(message.channel, { title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
        description: en ? `You need ${moeda.simbolo}${fmt(custo)} (or the equivalent in another currency).` : `Precisa de ${moeda.simbolo}${fmt(custo)} (ou equivalente em outra moeda).`, colour: COR.erro });
    }
    jogadorPaga(serverId, eu, pag.moeda, pag.custo);
    for (const f of cansados) db.salvarFollower(f.id, { energia: 5, energiaEm: Date.now() });
    return sendEmbed(message.channel, { title: en ? "🛏️ They rested" : "🛏️ Descansaram",
      description: en ? `**${cansados.length}** companion(s) at full energy. You paid ${pag.moeda.simbolo}${fmt(pag.custo)}.` : `**${cansados.length}** companheiro(s) com energia cheia. Pagou ${pag.moeda.simbolo}${fmt(pag.custo)}.`,
      colour: COR.sucesso });
  }

  // ── followers ──
  if (["follower", "followers", "companheiro", "companheiros", "party", "equipe"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${P}game criar\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${P}game criar\`.`, colour: COR.aviso }));
    }
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2).join(" ").trim();

    // Acha um companheiro SEU pelo nome. Usado por quase todos os subcomandos.
    const acharMeu = (texto) => {
      const alvoTxt = String(texto ?? "").trim().toLowerCase();
      if (!alvoTxt) return null;
      const meus = db.listarFollowersDe(serverId, eu);
      return meus.find((f) => {
        const c = db.getFollowerCatalogo(f.catalogoId);
        return c && c.nome.toLowerCase().includes(alvoTxt);
      }) ?? null;
    };
    // "Curandeira Errante Espada Temperada" tem nome composto dos DOIS lados,
    // e não existe separador. Quebrar no primeiro espaço (o que se fazia antes)
    // dava "Curandeira" + "Errante Espada Temperada" e falhava.
    //
    // A saída é testar TODAS as quebras possíveis e ficar com a única em que os
    // dois lados resolvem para algo real. Entre várias válidas, ganha a que
    // acerta o nome inteiro em vez de um pedaço.
    const separarNomes = (texto, acharDireita) => {
      const bruto = String(texto ?? "").trim();
      if (!bruto) return null;

      // Separador explícito, para quando a ambiguidade for genuína.
      if (bruto.includes("|")) {
        const [e, d] = bruto.split("|");
        const f = acharMeu((e ?? "").trim());
        const it = acharDireita((d ?? "").trim());
        return f && it ? { f, it } : null;
      }

      const limpo = (x) => String(x ?? "").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const partes = bruto.split(/\s+/);
      const opcoes = [];
      for (let i = 1; i < partes.length; i++) {
        const esq = partes.slice(0, i).join(" ");
        const dir = partes.slice(i).join(" ");
        const f = acharMeu(esq);
        if (!f) continue;
        const it = acharDireita(dir);
        if (!it) continue;
        const cat = db.getFollowerCatalogo(f.catalogoId);
        opcoes.push({
          f, it, esq, dir,
          // quem escreveu o nome inteiro (dos dois lados) tem prioridade
          exatoF: limpo(cat?.nome) === limpo(esq) ? 1 : 0,
          exatoI: limpo(it.nome) === limpo(dir) ? 1 : 0,
        });
      }
      if (!opcoes.length) return null;
      opcoes.sort((a, b) =>
        (b.exatoF + b.exatoI) - (a.exatoF + a.exatoI)
        || b.esq.length - a.esq.length);
      return opcoes[0];
    };

    // Explica QUAL dos dois lados falhou, em vez de culpar sempre o item.
    const naoSeparou = (texto, acao) => {
      const partes = String(texto ?? "").trim().split(/\s+/);
      const algumFollower = partes.some((_, i) => acharMeu(partes.slice(0, i + 1).join(" ")));
      return sendEmbed(message.channel, en ? {
        title: "❌ I couldn't tell the two names apart",
        description: [
          algumFollower
            ? `I found the companion, but not the item in **${texto}**.`
            : `I couldn't find a companion of yours in **${texto}**.`,
          "",
          `\`${P}game follower ${acao} <companion> <item>\``,
          `Both names can have spaces — I try every split until both sides match.`,
          "",
          `If it stays ambiguous, separate them with \`|\`:`,
          `\`${P}game follower ${acao} Curandeira Errante | Espada Temperada\``,
        ].join("\n"), colour: COR.erro,
      } : {
        title: "❌ Não consegui separar os dois nomes",
        description: [
          algumFollower
            ? `Achei o companheiro, mas não o item em **${texto}**.`
            : `Não achei nenhum companheiro seu em **${texto}**.`,
          "",
          `\`${P}game follower ${acao} <companheiro> <item>\``,
          `Os dois nomes podem ter espaço — eu testo todas as quebras até os dois baterem.`,
          "",
          `Se continuar ambíguo, separe com \`|\`:`,
          `\`${P}game follower ${acao} Curandeira Errante | Espada Temperada\``,
        ].join("\n"), colour: COR.erro,
      });
    };

    const semEsse = (texto) => sendEmbed(message.channel, {
      title: en ? "❌ Not among yours" : "❌ Não é um dos seus",
      description: en
        ? `I couldn't find **${texto}** among your companions. See them with \`${P}game followers\`.`
        : `Não achei **${texto}** entre os seus companheiros. Veja com \`${P}game followers\`.`,
      colour: COR.erro });

    // ── ficha / status de UM companheiro ──
    // A lista mostra nome, nível e energia; quem decide quem levar precisa dos
    // atributos e da magia, que é o que de fato muda a chance da missão.
    if (["ficha", "status", "ver", "sheet", "info"].includes(acao)) {
      if (!resto) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Qual companheiro?",
            description: `\`${P}game follower ficha <nome>\`\n\nVeja os seus com \`${P}game followers\`.`, colour: COR.erro },
          { title: "❌ Which companion?",
            description: `\`${P}game follower ficha <name>\`\n\nSee yours with \`${P}game followers\`.`, colour: COR.erro }));
      }
      const f = acharMeu(resto);
      if (!f) return semEsse(resto);

      const cat = db.getFollowerCatalogo(f.catalogoId);
      const cls = FOL.CLASSES[cat?.classe] ?? {};
      const rar = RARIDADE_INFO[cat?.raridade] ?? {};
      const { base, extra, total, itens } = atributosDoFollowerComItens(f);
      const magia = FOL.magiaDo(cat);
      const energia = energiaAtual(f);

      // Só os atributos que ele realmente tem: listar nove zeros seria ruído.
      const linhasAttr = db.ATRIBUTOS
        .filter((a) => (total[a] ?? 0) > 0)
        .map((a) => {
          const info = ATRIB[a] ?? {};
          const bonus = extra[a] ? ` (+${extra[a]})` : "";
          return `${info.emoji ?? "•"} **${en ? (info.rotuloEN ?? info.rotulo) : info.rotulo}** ${base[a] ?? 0}${bonus}`;
        });

      const linhas = en ? [
        `${rar.emoji ?? ""}${cls.emoji ?? ""} **${cat?.nome ?? "?"}** — ${cls.rotulo ?? cat?.classe} · level ${f.nivel}`,
        `${rar.emoji ?? ""} ${rar.rotulo ?? cat?.raridade} · ${cls.desc ?? ""}`,
        "",
        `⚡ **Energy:** ${energia}/${ENERGIA_MAX}${energia < ENERGIA_MAX ? " _(+1 per hour)_" : ""}`,
        `🎒 **In the party:** ${f.naParty ? "yes" : "no"}`,
        magia ? `✦ **Spell:** ${magia.nome} — ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%` : null,
        "",
        "**Attributes** _(base and, in parentheses, what the bag adds)_",
        ...linhasAttr,
        "",
        `🎒 **Bag — ${itens.length}/${db.FOLLOWER_MOCHILA}**`,
        ...(itens.length
          ? itens.map((i) => `${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}** — ${descreverBonus(i.bonus)}`)
          : ["_empty_"]),
        "",
        `\`${P}game follower dar ${cat?.nome} <item>\` · \`${P}game follower pegar ${cat?.nome} <item>\``,
      ] : [
        `${rar.emoji ?? ""}${cls.emoji ?? ""} **${cat?.nome ?? "?"}** — ${cls.rotulo ?? cat?.classe} · nível ${f.nivel}`,
        `${rar.emoji ?? ""} ${rar.rotulo ?? cat?.raridade} · ${cls.desc ?? ""}`,
        "",
        `⚡ **Energia:** ${energia}/${ENERGIA_MAX}${energia < ENERGIA_MAX ? " _(+1 por hora)_" : ""}`,
        `🎒 **Na party:** ${f.naParty ? "sim" : "não"}`,
        magia ? `✦ **Magia:** ${magia.nome} — ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%` : null,
        "",
        "**Atributos** _(base e, entre parênteses, o que a mochila soma)_",
        ...linhasAttr,
        "",
        `🎒 **Mochila — ${itens.length}/${db.FOLLOWER_MOCHILA}**`,
        ...(itens.length
          ? itens.map((i) => `${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}** — ${descreverBonus(i.bonus)}`)
          : ["_vazia_"]),
        "",
        `\`${P}game follower dar ${cat?.nome} <item>\` · \`${P}game follower pegar ${cat?.nome} <item>\``,
      ];
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "👤 Companion" : "👤 Companheiro", linhas: linhas.filter(Boolean), colour: COR.info });
    }

    // ── mochila: dar e pegar de volta ──
    if (["dar", "equipar", "give", "equip", "mochila", "inventario", "inventário", "bag"].includes(acao)) {
      // `mochila <nome>` é só a consulta — e "dar <nome>" sem item também,
      // já que aí não há o que entregar.
      const eConsulta = ["mochila", "inventario", "inventário", "bag"].includes(acao);
      const par = separarNomes(resto, (t) => db.acharItemPorNome(t));
      if (eConsulta || !par) {
        const f = acharMeu(resto);
        // Se o texto inteiro é um companheiro seu, a pessoa só quis ver a mochila.
        if (!f && !eConsulta && /\s/.test(resto.trim())) return naoSeparou(resto, "dar");
        if (!f) {
          return sendEmbed(message.channel, tr(ctx,
            { title: "❌ Uso incorreto",
              description: `\`${P}game follower dar <companheiro> <item>\`\n\nEx.: \`${P}game follower dar Aprendiz Espada de Ferro\``, colour: COR.erro },
            { title: "❌ Wrong usage",
              description: `\`${P}game follower dar <companion> <item>\`\n\nE.g.: \`${P}game follower dar Aprendiz Espada de Ferro\``, colour: COR.erro }));
        }
        const itens = db.itensDoFollower(f.id);
        const cat = db.getFollowerCatalogo(f.catalogoId);
        return sendEmbed(message.channel, {
          title: en ? `🎒 ${cat?.nome}'s bag` : `🎒 Mochila de ${cat?.nome}`,
          description: (itens.length
            ? itens.map((i) => `${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}** — ${descreverBonus(i.bonus)}`).join("\n")
            : (en ? "_Empty._" : "_Vazia._"))
            + `\n\n${itens.length}/${db.FOLLOWER_MOCHILA}`,
          colour: COR.info });
      }

      const { f, it: item } = par;
      const naMochila = db.getInventario(serverId, eu).find((x) => x.id === item.id);
      if (!naMochila) {
        return sendEmbed(message.channel, {
          title: en ? "❌ You don't have that item" : "❌ Você não tem esse item",
          description: en ? `**${item.nome}** isn't in your bag.` : `**${item.nome}** não está na sua mochila.`,
          colour: COR.erro });
      }
      const atuais = db.itensDoFollower(f.id);
      const cat = db.getFollowerCatalogo(f.catalogoId);
      if (atuais.length >= db.FOLLOWER_MOCHILA) {
        return sendEmbed(message.channel, {
          title: en ? "🎒 Bag full" : "🎒 Mochila cheia",
          description: en
            ? `**${cat?.nome}** already carries ${db.FOLLOWER_MOCHILA} item(s). Take one back with \`${P}game follower pegar ${cat?.nome} <item>\`.`
            : `**${cat?.nome}** já carrega ${db.FOLLOWER_MOCHILA} item(ns). Pegue um de volta com \`${P}game follower pegar ${cat?.nome} <item>\`.`,
          colour: COR.aviso });
      }
      if (atuais.some((x) => x.id === item.id)) {
        return sendEmbed(message.channel, {
          title: en ? "🎒 Already carrying it" : "🎒 Ele já carrega esse",
          description: en ? `**${cat?.nome}** already has **${item.nome}**.` : `**${cat?.nome}** já tem **${item.nome}**.`,
          colour: COR.aviso });
      }

      // Sai da SUA mochila: o item está com ele, não em dois lugares ao mesmo tempo.
      db.tirarItem(serverId, eu, item.id, 1);
      db.darItemAoFollower(f.id, item.id);
      const depois = atributosDoFollowerComItens(f);
      return sendEmbed(message.channel, {
        title: en ? "🎒 Handed over" : "🎒 Entregue",
        description: (en ? [
          `**${cat?.nome}** is now carrying ${SLOT_INFO[item.slot]?.emoji ?? ""} **${item.nome}** — ${descreverBonus(item.bonus)}`,
          `_Bag: ${atuais.length + 1}/${db.FOLLOWER_MOCHILA} · it counts on missions right away._`,
          "",
          `\`${P}game follower ficha ${cat?.nome}\` shows the full sheet.`,
        ] : [
          `**${cat?.nome}** agora carrega ${SLOT_INFO[item.slot]?.emoji ?? ""} **${item.nome}** — ${descreverBonus(item.bonus)}`,
          `_Mochila: ${atuais.length + 1}/${db.FOLLOWER_MOCHILA} · já conta nas missões._`,
          "",
          `\`${P}game follower ficha ${cat?.nome}\` mostra a ficha completa.`,
        ]).join("\n"), colour: COR.sucesso });
    }

    if (["pegar", "retomar", "take", "desequipar"].includes(acao)) {
      if (!resto || !/\s/.test(resto.trim())) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Uso incorreto",
            description: `\`${P}game follower pegar <companheiro> <item>\``, colour: COR.erro },
          { title: "❌ Wrong usage",
            description: `\`${P}game follower pegar <companion> <item>\``, colour: COR.erro }));
      }
      // Aqui a busca da direita é entre os itens QUE ELE CARREGA, não o
      // catálogo inteiro — senão daria para "pegar" algo que ele nunca teve.
      const limparTxt = (x) => String(x ?? "").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const par = separarNomes(resto, (t) => {
        const alvo = limparTxt(t);
        if (!alvo) return null;
        for (const cand of db.listarFollowersDe(serverId, eu)) {
          const achado = db.itensDoFollower(cand.id)
            .find((x) => limparTxt(x.nome).includes(alvo));
          if (achado) return achado;
        }
        return null;
      });
      if (!par) return naoSeparou(resto, "pegar");
      const { f } = par;
      const cat = db.getFollowerCatalogo(f.catalogoId);
      // Confere que é ESTE companheiro que carrega o item encontrado.
      const item = db.itensDoFollower(f.id).find((x) => x.id === par.it.id);
      if (!item) {
        return sendEmbed(message.channel, {
          title: en ? "❌ They aren't carrying that" : "❌ Ele não carrega isso",
          description: en
            ? `**${cat?.nome}** isn't carrying **${par.it.nome}**.`
            : `**${cat?.nome}** não está com **${par.it.nome}**.`,
          colour: COR.erro });
      }
      db.tirarItemDoFollower(f.id, item.id);
      db.darItem(serverId, eu, item.id);
      return sendEmbed(message.channel, {
        title: en ? "🎒 Taken back" : "🎒 De volta com você",
        description: en
          ? `**${item.nome}** left ${cat?.nome}'s bag and returned to yours.`
          : `**${item.nome}** saiu da mochila de ${cat?.nome} e voltou para a sua.`,
        colour: COR.sucesso });
    }

    // ── levar / tirar da party ──
    if (["levar", "adicionar", "party+"].includes(acao)) {
      const meus = db.listarFollowersDe(serverId, eu);
      const alvo = meus.find((f) => {
        const c = db.getFollowerCatalogo(f.catalogoId);
        return c && c.nome.toLowerCase().includes(resto.toLowerCase());
      });
      if (!resto || !alvo) {
        return sendEmbed(message.channel, { title: en ? "❌ Take who?" : "❌ Levar quem?",
          description: en
            ? `\`${P}game follower levar <name>\`\n\nSee yours with \`${P}game followers\`.`
            : `\`${P}game follower levar <nome>\`\n\nVeja os seus com \`${P}game followers\`.`, colour: COR.erro });
      }
      if (alvo.naParty) {
        return sendEmbed(message.channel, { title: en ? "🎒 Already in the party" : "🎒 Já está na party",
          description: descreverFollower(alvo), colour: COR.aviso });
      }
      const naParty = db.getParty(serverId, eu);
      if (naParty.length >= 2) {
        return sendEmbed(message.channel, { title: en ? "🎒 Party full" : "🎒 Party cheia",
          description: en
            ? `You can take up to **2** followers.\n\nRemove someone with \`${P}game follower tirar <name>\`.`
            : `Você pode levar até **2** followers.\n\nTire alguém com \`${P}game follower tirar <nome>\`.`,
          colour: COR.aviso });
      }
      if (energiaAtual(alvo) < 1) {
        return sendEmbed(message.channel, { title: en ? "😴 Out of energy" : "😴 Sem energia",
          description: en ? `${descreverFollower(alvo)}\n\nThey need rest — energy returns over time (1 per hour).` : `${descreverFollower(alvo)}\n\nPrecisa descansar — a energia volta com o tempo (1 por hora).`,
          colour: COR.aviso });
      }
      db.salvarFollower(alvo.id, { naParty: 1 });
      return sendEmbed(message.channel, { title: en ? "🎒 Joined the party" : "🎒 Entrou na party",
        description: en ? `${descreverFollower(db.getFollower(alvo.id))}\n\n_They spend 1 energy per dungeon mission._` : `${descreverFollower(db.getFollower(alvo.id))}\n\n_Ele gasta 1 de energia por missão de dungeon._`,
        colour: COR.sucesso });
    }

    if (["tirar", "remover", "party-"].includes(acao)) {
      const naParty = db.getParty(serverId, eu);
      const alvo = naParty.find((f) => {
        const c = db.getFollowerCatalogo(f.catalogoId);
        return c && c.nome.toLowerCase().includes((resto || "").toLowerCase());
      }) ?? (naParty.length === 1 && !resto ? naParty[0] : null);
      if (!alvo) {
        return sendEmbed(message.channel, { title: en ? "❌ Remove who?" : "❌ Tirar quem?",
          description: naParty.length
            ? (en ? `\`${P}game follower tirar <name>\`` : `\`${P}game follower tirar <nome>\``)
            : (en ? "Your party is empty." : "Sua party está vazia."),
          colour: COR.erro });
      }
      db.salvarFollower(alvo.id, { naParty: 0 });
      return sendEmbed(message.channel, { title: en ? "👋 Left the party" : "👋 Saiu da party",
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
        return sendEmbed(message.channel, { title: en ? "❌ Dismiss who?" : "❌ Dispensar quem?",
          description: en ? `\`${P}game follower dispensar <name>\`` : `\`${P}game follower dispensar <nome>\``, colour: COR.erro });
      }
      const nome = db.getFollowerCatalogo(alvo.catalogoId)?.nome ?? "?";
      db.dispensarFollower(alvo.id);
      return sendEmbed(message.channel, { title: en ? "👋 Dismissed" : "👋 Dispensado",
        description: en ? `**${nome}** went their own way.` : `**${nome}** seguiu seu caminho.`, colour: COR.mod });
    }

    // ── fotos ──
    if (["fotos", "foto", "album", "álbum"].includes(acao)) {
      const cat = db.acharFollowerCatalogo(resto);
      if (!cat) {
        return sendEmbed(message.channel, { title: en ? "❌ Who?" : "❌ Quem?",
          description: en ? `\`${P}game follower fotos <name>\`` : `\`${P}game follower fotos <nome>\``, colour: COR.erro });
      }
      if (!cat.fotos.length) {
        return sendEmbed(message.channel, { title: `📷 ${cat.nome}`,
          description: en ? "_No photos yet._" : "_Ainda não tem fotos._", colour: COR.info });
      }
      return sendEmbed(message.channel, { title: `📷 ${cat.nome} (1/${cat.fotos.length})`,
        description: cat.fotos.length > 1
          ? (en ? `_${cat.fotos.length} photos in the album._` : `_${cat.fotos.length} fotos no álbum._`) : "",
        image: cat.fotos[0], colour: COR.info });
    }

    // ── lista (padrão) ──
    const meus = db.listarFollowersDe(serverId, eu);
    const naParty = meus.filter((f) => f.naParty);
    if (!meus.length) {
      return sendEmbed(message.channel, { title: en ? "👥 No companions" : "👥 Nenhum companheiro",
        description: (en ? [
          "You don't have followers yet.",
          "",
          "They show up as **dungeon loot** — and can also be hired",
          "as mercenaries.",
          "",
          `_See who exists with \`${P}game recrutas\`._`,
        ] : [
          "Você ainda não tem followers.",
          "",
          "Eles aparecem como **loot de dungeon** — e, quando a economia chegar,",
          "também poderão ser contratados como mercenários.",
          "",
          `_Veja quem existe com \`${P}game recrutas\`._`,
        ]).join("\n"), colour: COR.info });
    }
    const linhas = [];
    if (naParty.length) {
      linhas.push(en ? `🎒 **In the party (${naParty.length}/2)**` : `🎒 **Na party (${naParty.length}/2)**`);
      for (const f of naParty) linhas.push(`   ${descreverFollower(f)}`);
      linhas.push("");
    }
    const fora = meus.filter((f) => !f.naParty);
    if (fora.length) {
      linhas.push(en ? "**Available**" : "**Disponíveis**");
      for (const f of fora) linhas.push(`   ${descreverFollower(f)}`);
    }
    linhas.push("", en
      ? `_\`${P}game follower ficha <name>\` — attributes, spell and bag_`
      : `_\`${P}game follower ficha <nome>\` — atributos, magia e mochila_`,
      en
        ? `_\`${P}game follower levar <name>\` to add to the party · ⚡ = energy_`
        : `_\`${P}game follower levar <nome>\` para colocar na party · ⚡ = energia_`);
    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "👥 Your companions" : "👥 Seus companheiros", linhas, colour: COR.info });
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
        const onde = f.soDungeon ? (en ? "🗝️ dungeon only" : "🗝️ só em dungeon") : `💰 ${f.preco}`;
        linhas.push(`   ${r.emoji ?? ""} ${f.nome} — ${onde}`);
      }
      linhas.push("");
    }
    linhas.push(en
      ? "_🗝️ = shows up as loot · 💰 = hireable_"
      : "_🗝️ = aparece como loot · 💰 = contratável quando a economia chegar_");
    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "📜 Companions that exist" : "📜 Companheiros que existem", linhas, colour: COR.info });
  }

  // ── missões ──
  if (["missao", "missão", "missoes", "missões", "quest"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${P}game criar\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${P}game criar\`.`, colour: COR.aviso }));
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
        linhas.push(en
          ? `🩹 **You're recovering.** Nothing is available for ~${min} min.`
          : `🩹 **Você está se recuperando.** Nada fica disponível por ~${min} min.`, "");
      }

      // Espera de cada missão, já somando recuperação e cooldown. Sem isso, a
      // lista mostrava chances de missões que a pessoa nem podia começar.
      const esperaDe = (m) => {
        const liberaEm = Math.max(p.recuperandoAte ?? 0, (p.ultimaMissao ?? 0) + MISS.cooldownMs(m));
        return liberaEm > agora ? Math.ceil((liberaEm - agora) / 60000) : 0;
      };
      const marcaEspera = (m) => {
        const min = esperaDe(m);
        return min ? (en ? ` ⏳ _${min} min_` : ` ⏳ _${min} min_`) : "";
      };

      const porTipo = { mercado: [], facil: [], medio: [], dificil: [] };
      for (const m of MISS.MISSOES) {
        (porTipo[m.tipo === "mercado" ? "mercado" : m.dificuldade] ??= []).push(m);
      }

      linhas.push(en ? "🏪 **Market** — no risk, pays little" : "🏪 **Mercado** — sem risco, paga pouco");
      for (const m of porTipo.mercado.slice(0, 4)) linhas.push(`   • **${m.nome}**${marcaEspera(m)}`);

      for (const d of ["facil", "medio", "dificil"]) {
        const info = MISS.DIFICULDADE_INFO[d];
        linhas.push("", `${info.emoji} **${info.rotulo}**`);
        for (const m of porTipo[d] ?? []) {
          const v = MISS.previsao(attr, m, magias, tamanhoParty);
          // As duas chances se MULTIPLICAM: 53% de êxito com 75% de sobrevivência
          // dá só 40% de missão cumprida. Mostrar as duas soltas engana — quem lê
          // acha que vence 53% das vezes.
          const completa = v.exito * v.sobrevivencia;
          linhas.push(en
            ? `   • **${m.nome}** — 🏆 **${(completa * 100).toFixed(0)}%** _(success ${(v.exito * 100).toFixed(0)}% × survival ${(v.sobrevivencia * 100).toFixed(0)}%)_${marcaEspera(m)}`
            : `   • **${m.nome}** — 🏆 **${(completa * 100).toFixed(0)}%** _(êxito ${(v.exito * 100).toFixed(0)}% × sobrevive ${(v.sobrevivencia * 100).toFixed(0)}%)_${marcaEspera(m)}`);
        }
      }
      linhas.push("", en
        ? "_🏆 = chance to complete AND come back alive. The two chances multiply._"
        : "_🏆 = chance de cumprir E voltar vivo. As duas chances se multiplicam._");
      if (MISS.MISSOES.some((m) => esperaDe(m) > 0)) {
        linhas.push(en
          ? "_⏳ = still on cooldown. Lighter missions come back sooner._"
          : "_⏳ = ainda em espera. As missões mais leves liberam antes._");
      }
      linhas.push("", en
        ? (tamanhoParty
          ? `_Chances already account for gear and your party of ${tamanhoParty}._`
          : `_Chances account for your gear. Bringing companions changes everything: \`${P}game followers\`._`)
        : (tamanhoParty
          ? `_Chances já contam equipamento e sua party de ${tamanhoParty}._`
          : `_Chances contam seu equipamento. Levar companheiros muda tudo: \`${P}game followers\`._`));
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "🗺️ Available missions" : "🗺️ Missões disponíveis", linhas, colour: COR.info });
    }

    const missao = MISS.acharMissao(acao);
    if (!missao) {
      return sendEmbed(message.channel, { title: en ? "❌ Unknown mission" : "❌ Missão desconhecida",
        description: en
          ? `I couldn't find **${acao}**. See the list with \`${P}game missao\`.`
          : `Não achei **${acao}**. Veja a lista com \`${P}game missao\`.`, colour: COR.erro });
    }

    // ── cooldown e recuperação ──
    // As duas esperas correm em PARALELO, a partir da mesma missão. Checá-las
    // em sequência mostrava a mais curta primeiro: você esperava a recuperação
    // achando que ia partir, e só então descobria o cooldown. Agora a conta é
    // uma só — o prazo que vale é o mais distante dos dois, e a mensagem diz
    // o porquê de cada um.
    const agora = Date.now();
    const prontoEm = (p.ultimaMissao ?? 0) + MISS.cooldownMs(missao);
    const liberaEm = Math.max(p.recuperandoAte ?? 0, prontoEm);
    if (liberaEm > agora) {
      const min = Math.ceil((liberaEm - agora) / 60000);
      const recuperando = (p.recuperandoAte ?? 0) > agora;
      const emCooldown = prontoEm > agora;

      // Missões mais leves têm cooldown menor: se alguma já estiver liberada,
      // vale dizer — é a diferença entre esperar e jogar agora.
      const jaLiberadas = MISS.MISSOES.filter((m) =>
        (p.ultimaMissao ?? 0) + MISS.cooldownMs(m) <= agora
        && (p.recuperandoAte ?? 0) <= agora);
      const dica = jaLiberadas.length
        ? (en
          ? `\n\n_Already available:_ ${jaLiberadas.slice(0, 3).map((m) => `**${m.nome}**`).join(" · ")}`
          : `\n\n_Já liberadas:_ ${jaLiberadas.slice(0, 3).map((m) => `**${m.nome}**`).join(" · ")}`)
        : "";

      const motivo = en
        ? [
          recuperando ? `🩹 You fell on your last mission and are still recovering.` : null,
          emCooldown ? `⏳ **${missao.nome}** has a ${Math.round(MISS.cooldownMs(missao) / 60000)} min cooldown between attempts.` : null,
        ].filter(Boolean).join("\n")
        : [
          recuperando ? `🩹 Você caiu na última missão e ainda está se recuperando.` : null,
          emCooldown ? `⏳ **${missao.nome}** tem ${Math.round(MISS.cooldownMs(missao) / 60000)} min de espera entre tentativas.` : null,
        ].filter(Boolean).join("\n");

      return sendEmbed(message.channel, {
        title: en ? `⏳ Available in ~${min} min` : `⏳ Liberada em ~${min} min`,
        description: motivo
          + (recuperando && emCooldown
            ? (en
              ? `\n\n_The two waits run together — what counts is the longer one._`
              : `\n\n_As duas esperas correm juntas — vale a mais longa._`)
            : "")
          + dica,
        colour: COR.aviso });
    }

    // ── resolve ──
    const { attr, magias, tamanhoParty } = atributosDaParty(p, serverId, eu);
    const party = db.getParty(serverId, eu);

    // followers sem energia não vão (dungeon só)
    if (missao.tipo !== "mercado") {
      const cansados = party.filter((f) => energiaAtual(f) < 1);
      if (cansados.length) {
        return sendEmbed(message.channel, { title: en ? "😴 Companion out of energy" : "😴 Companheiro sem energia",
          description: cansados.map((f) => descreverFollower(f)).join("\n")
            + (en
              ? `\n\nRemove them from the party or wait for energy to return (1 per hour).`
              : `\n\nTire da party ou espere a energia voltar (1 por hora).`),
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

    // ── resgate automático ──
    // Antes o resgate era um comando à parte, e ficava estranho: você "ia
    // à dungeon" sem sair do lugar, num comando que só rolava um dado. Agora
    // ele acontece onde faz sentido — indo à missão você passa por lá.
    //
    // Só uma tentativa por missão, e só se você voltou: quem caiu não estava
    // em condição de tirar ninguém de lá.
    const resgatados = [];
    if (r.desfecho !== "caiu") {
      const presos = db.listarCapturados(serverId);
      const meus = presos.filter((f) => f.donoOriginal === eu);
      // Fora da janela do dono, qualquer um pode trazer qualquer um de volta.
      const livres = presos.filter((f) => f.donoOriginal !== eu
        && (Date.now() - (f.capturadoEm ?? 0)) / 3600000 >= JANELA_DONO_H);
      const candidato = meus[0] ?? livres[0] ?? null;
      if (candidato) {
        const ehDono = candidato.donoOriginal === eu;
        // Missão cumprida dá a chance cheia; ter voltado sem cumprir dá metade.
        const chance = CHANCE_RESGATE * (ehDono ? BONUS_DONO : 1) * (r.exito ? 1 : 0.5);
        if (Math.random() < Math.min(0.95, chance)) {
          db.resgatarFollower(candidato.id, eu);
          const cat = db.getFollowerCatalogo(candidato.catalogoId);
          resgatados.push({ nome: cat?.nome ?? "?", ehDono });
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
    const titulo = (en
      ? { sucesso: "🏆 Mission complete", falha: "😐 Didn't work out", caiu: "💀 You fell" }
      : { sucesso: "🏆 Missão cumprida", falha: "😐 Não deu certo", caiu: "💀 Você caiu" })[r.desfecho];
    const cor = { sucesso: COR.sucesso, falha: COR.aviso, caiu: COR.erro }[r.desfecho];
    const linhas = [`**${missao.nome}**`, `_${missao.descricao}_`, ""];

    if (r.desfecho === "sucesso") linhas.push(en ? "You won and came back in one piece." : "Você venceu e voltou inteiro.");
    else if (r.desfecho === "falha") linhas.push(en ? "You couldn't finish it, but came back alive — and more experienced." : "Não conseguiu completar, mas voltou vivo — e mais experiente.");
    else linhas.push(en ? "You didn't hold out. You came back empty-handed, but **whole**: no level or gear is lost." : "Você não aguentou. Voltou de mãos vazias, mas **inteiro**: nada de nível ou equipamento se perde.");

    linhas.push("", `✨ **+${xpFinal} XP**`);
    if (moedaGanha > 0) linhas.push(`${moedaSorteada.simbolo} **+${fmt(moedaGanha)} ${moedaSorteada.nome}**`);
    if (moedaPerdida > 0) {
      linhas.push(en
        ? `${moeda.simbolo} **−${fmt(moedaPerdida)}** _(${(ECO.perda(pSuave) * 100).toFixed(0)}% of what you carried, it went to the dungeon)_`
        : `${moeda.simbolo} **−${fmt(moedaPerdida)}** _(${(ECO.perda(pSuave) * 100).toFixed(0)}% do que carregava, foi para a dungeon)_`);
    }
    if (depois.subiu) {
      linhas.push(en
        ? `🎉 **Reached level ${depois.nivel}!** (+${(depois.pontos - (p.pontos ?? 0)).toFixed(2)} point(s))`
        : `🎉 **Subiu para o nível ${depois.nivel}!** (+${(depois.pontos - (p.pontos ?? 0)).toFixed(2)} ponto(s))`);
      if (depois.ganhoBase > 0) linhas.push(en
        ? `   _+${depois.ganhoBase} to **all** attributes (natural growth)_`
        : `   _+${depois.ganhoBase} em **todos** os atributos (crescimento natural)_`);
    }
    if (ganhou) {
      const ri = RARIDADE_INFO[ganhou.raridade] ?? {};
      linhas.push("", `🎁 **Loot:** ${ri.emoji ?? ""} **${ganhou.nome}** — ${descreverBonus(ganhou.bonus)}`);
    } else if (r.desfecho === "sucesso" && missao.tipo !== "mercado") {
      linhas.push("", en ? "_No item this time._" : "_Nenhum item desta vez._");
    }
    if (ganhouFollower) {
      const cls = FOL.CLASSES[ganhouFollower.cat.classe] ?? {};
      linhas.push(en
        ? `👥 **${ganhouFollower.cat.nome}** (${cls.rotulo}, lv ${ganhouFollower.nivel}) joined you!`
        : `👥 **${ganhouFollower.cat.nome}** (${cls.rotulo}, nv ${ganhouFollower.nivel}) se juntou a você!`);
    }
    if (tamanhoParty) {
      linhas.push("", en
        ? `_Party of ${tamanhoParty}: the mission was harder, and part of the loot stayed with them._`
        : `_Party de ${tamanhoParty}: a missão foi mais difícil, e parte do loot ficou com eles._`);
    }
    if (resgatados.length) {
      for (const rg of resgatados) {
        linhas.push("", en
          ? `🔓 **Rescued on the way:** ${rg.nome}${rg.ehDono ? " — back home." : " — they weren't yours, but they are now."}`
          : `🔓 **Resgatado no caminho:** ${rg.nome}${rg.ehDono ? " — de volta para casa." : " — não era seu, mas agora é."}`);
      }
      linhas.push(en
        ? `_They come back with little energy — \`${P}game followers\`._`
        : `_Volta com pouca energia — \`${P}game followers\`._`);
    }
    if (capturados.length) {
      linhas.push("", en
        ? `⛓️ **Captured in the dungeon:** ${capturados.join(", ")}`
        : `⛓️ **Capturado(s) na dungeon:** ${capturados.join(", ")}`,
        en
          ? `_Every mission you come back from is a chance to pull them out — you have priority in the first ${JANELA_DONO_H}h._`
          : `_Toda missão de que você volta é uma chance de tirá-los de lá — você tem prioridade nas primeiras ${JANELA_DONO_H}h._`);
    }
    if (r.desfecho === "caiu") linhas.push("", en ? "_You need ~30 min to recover._" : "_Você precisa de ~30 min para se recuperar._");

    return sendEmbed(message.channel, { title: titulo, description: linhas.join("\n"), colour: cor });
  }

  // ── dungeon: resgatar followers capturados ──
  if (["dungeon", "resgate", "resgatar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${P}game criar\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${P}game criar\`.`, colour: COR.aviso }));
    }
    const presos = db.listarCapturados(serverId);

    if (!presos.length) {
      return sendEmbed(message.channel, {
        title: en ? "🕳️ The dungeon is quiet" : "🕳️ A dungeon está quieta",
        description: en ? "No companions captured around here." : "Nenhum companheiro capturado por aqui.",
        colour: COR.info });
    }

    // Esta tela é só o painel de quem está lá dentro. O resgate em si acontece
    // nas missões: rolar um dado num comando parado nunca foi uma decisão —
    // era só repetir até dar certo. Agora ir à missão É a tentativa.
    const linhas = presos.map((f) => {
      const cat = db.getFollowerCatalogo(f.catalogoId);
      const cls = FOL.CLASSES[cat?.classe] ?? {};
      const r = RARIDADE_INFO[cat?.raridade] ?? {};
      const meu = f.donoOriginal === eu;
      const horas = (Date.now() - (f.capturadoEm ?? 0)) / 3600000;
      const janela = horas < JANELA_DONO_H;
      const marca = meu
        ? (en ? " 👤 _yours_" : " 👤 _seu_")
        : janela
          ? (en ? ` ⏳ _owner's window (~${Math.ceil(JANELA_DONO_H - horas)}h)_` : ` ⏳ _janela do dono (~${Math.ceil(JANELA_DONO_H - horas)}h)_`)
          : (en ? " 🔓 _anyone can bring them back_" : " 🔓 _qualquer um pode trazer_");
      return `${r.emoji ?? ""}${cls.emoji ?? ""} **${cat?.nome ?? "?"}** (${en ? "lv" : "nv"} ${f.nivel})${marca}`;
    });

    const meusPresos = presos.filter((f) => f.donoOriginal === eu).length;
    linhas.push("", en
      ? "**The rescue is automatic.** Every mission you come back from is one attempt — the mission being completed doubles the odds."
      : "**O resgate é automático.** Toda missão de que você volta é uma tentativa — cumprir a missão dobra a chance.");
    linhas.push(en
      ? `_You have priority over yours in the first ${JANELA_DONO_H}h; after that, anyone's mission can free them._`
      : `_Você tem prioridade sobre os seus nas primeiras ${JANELA_DONO_H}h; depois, a missão de qualquer um pode soltá-los._`);
    if (meusPresos) {
      linhas.push("", en
        ? `➡️ **${meusPresos === 1 ? "One of them is yours" : `${meusPresos} of them are yours`}.** Go on a mission: \`${P}game missao\``
        : `➡️ **${meusPresos === 1 ? "Um deles é seu" : `${meusPresos} deles são seus`}.** Parta para uma missão: \`${P}game missao\``);
    }

    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? `⛓️ Captured in the dungeon (${presos.length})` : `⛓️ Capturados na dungeon (${presos.length})`,
      linhas, colour: COR.aviso });
  }

  // ── ranking ──
  if (["top", "ranking", "rank"].includes(sub)) {
    const lista = db.listarPersonagens(serverId, 10);
    if (!lista.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🏆 Ranking",
          description: `Ninguém criou personagem ainda. Seja o primeiro: \`${P}game criar\`.`, colour: COR.info },
        { title: "🏆 Ranking",
          description: `Nobody created a character yet. Be the first: \`${P}game criar\`.`, colour: COR.info }));
    }
    const medalha = ["🥇", "🥈", "🥉"];
    const linhas = lista.map((x, i) => en
      ? `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — level ${x.nivel} (${x.xp} XP)`
      : `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — nível ${x.nivel} (${x.xp} XP)`);
    return sendEmbed(message.channel, {
      title: en ? "🏆 Server adventurers" : "🏆 Aventureiros do servidor",
      description: linhas.join("\n"), colour: COR.info });
  }

  // ── ajuda ──
  if (["ajuda", "help", "comandos"].includes(sub)) {
    return sendEmbed(message.channel, en ? {
      title: "🎲 RPG — commands",
      description: [
        `\`${P}game criar [name]\` — creates your character`,
        `\`${P}game\` — your sheet`,
        `\`${P}game ficha @person\` — someone else's sheet`,
        `\`${P}game pontos <attribute> [how many]\` — spends points`,
        `\`${P}game itens\` · \`${P}game equipar <item>\` · \`${P}game desequipar <slot>\``,
        `\`${P}game catalogo [rarity]\` · \`${P}game item <name>\` — price and details`,
        `\`${P}game magias\` · \`${P}game aprender <name>\` — the grimoire`,
        `\`${P}game followers\` · \`${P}game follower ficha <name>\` — sheet and bag`,
        `\`${P}game top\` — server ranking`,
        `\`${P}game apagar confirmar\` — starts over`,
        "",
        "**Attributes:** " + Object.values(ATRIB).map((a) => a.rotulo).join(", "),
        "",
        "_Intelligence and Luck increase the XP you earn and the points you get per level — with diminishing returns, so they never stop mattering._",
      ].join("\n"), colour: COR.info,
    } : {
      title: "🎲 RPG — comandos",
      description: [
        `\`${P}game criar [nome]\` — cria seu personagem`,
        `\`${P}game\` — sua ficha`,
        `\`${P}game ficha @pessoa\` — a ficha de outro`,
        `\`${P}game pontos <atributo> [quantos]\` — distribui pontos`,
        `\`${P}game itens\` · \`${P}game equipar <item>\` · \`${P}game desequipar <slot>\``,
        `\`${P}game catalogo [raridade]\` · \`${P}game item <nome>\` — preço e detalhes`,
        `\`${P}game magias\` · \`${P}game aprender <nome>\` — o grimório`,
        `\`${P}game followers\` · \`${P}game follower ficha <nome>\` — ficha e mochila`,
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
    return sendEmbed(message.channel, en ? {
      title: proprio ? "🎭 You don't have a character yet" : "🎭 No character",
      description: proprio
        ? `Create yours with \`${P}game criar [name]\` and start playing.`
        : `That person hasn't created a character yet.`,
      colour: COR.aviso,
    } : {
      title: proprio ? "🎭 Você ainda não tem personagem" : "🎭 Sem personagem",
      description: proprio
        ? `Crie o seu com \`${P}game criar [nome]\` e comece a jogar.`
        : `Essa pessoa ainda não criou um personagem.`,
      colour: COR.aviso });
  }

  return sendEmbed(message.channel, {
    title: `🎭 ${p.nome ?? "Aventureiro"}`,
    description: montarFicha(p, p.nome, P, serverId, id, lang),
    colour: COR.info });
}
