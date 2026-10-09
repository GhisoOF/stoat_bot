// Pedaços de tela do RPG que o game.js e o aventura.js usam: rótulos de
// atributo, raridade e vaga; números; listas em vários embeds; a descrição de
// um item (dano, defesa, bônus, implante).

import * as R from "./regras.js";
import * as CB from "./combate.js";

export const ATRIB = {
  forca:        { rotulo: "Força", rotuloEN: "Strength",        abrev: "For", abrevEN: "Str", emoji: "💪", aliases: ["forca", "força", "for", "str", "strength"] },
  destreza:     { rotulo: "Destreza", rotuloEN: "Dexterity",    abrev: "Des", abrevEN: "Dex", emoji: "🎯", aliases: ["destreza", "des", "dex", "dexterity"] },
  resistencia:  { rotulo: "Resistência", rotuloEN: "Resistance", abrev: "Res", abrevEN: "Res", emoji: "🛡️", aliases: ["resistencia", "resistência", "res", "def", "resistance"] },
  agilidade:    { rotulo: "Agilidade", rotuloEN: "Agility",     abrev: "Agi", abrevEN: "Agi", emoji: "💨", aliases: ["agilidade", "agi", "agl", "agility"] },
  vida:         { rotulo: "Vida", rotuloEN: "Health",           abrev: "Vida", abrevEN: "HP", emoji: "❤️", aliases: ["vida", "hp", "vit", "health"] },
  mana:         { rotulo: "Mana", rotuloEN: "Mana",             abrev: "Mana", abrevEN: "Mana", emoji: "🔷", aliases: ["mana", "mp"] },
  inteligencia: { rotulo: "Inteligência", rotuloEN: "Intelligence", abrev: "Int", abrevEN: "Int", emoji: "🧠", aliases: ["inteligencia", "inteligência", "int", "intelligence"] },
  sorte:        { rotulo: "Sorte", rotuloEN: "Luck",            abrev: "Sor", abrevEN: "Lck", emoji: "🍀", aliases: ["sorte", "sor", "luk", "luck"] },
  carisma:      { rotulo: "Carisma", rotuloEN: "Charisma",      abrev: "Car", abrevEN: "Cha", emoji: "✨", aliases: ["carisma", "car", "cha", "charisma"] },
};
export function acharAtributo(txt) {
  const t = String(txt ?? "").toLowerCase().trim();
  if (!t) return null;
  for (const [chave, info] of Object.entries(ATRIB)) if (info.aliases.includes(t)) return chave;
  for (const chave of Object.keys(ATRIB)) if (chave.startsWith(t) && t.length >= 3) return chave;
  return null;
}

export const RARIDADE_INFO = {
  comum:      { emoji: "⚪", rotulo: "Comum", rotuloEN: "Common" },
  incomum:    { emoji: "🟢", rotulo: "Incomum", rotuloEN: "Uncommon" },
  raro:       { emoji: "🔵", rotulo: "Raro", rotuloEN: "Rare" },
  epico:      { emoji: "🟣", rotulo: "Épico", rotuloEN: "Epic" },
  lendario:   { emoji: "🟠", rotulo: "Lendário", rotuloEN: "Legendary" },
  mitico:     { emoji: "🔴", rotulo: "Mítico", rotuloEN: "Mythic" },
  celestial:  { emoji: "🌟", rotulo: "Celestial", rotuloEN: "Celestial" },
  divino:     { emoji: "💠", rotulo: "Divino", rotuloEN: "Divine" },
  primordial: { emoji: "🌌", rotulo: "Primordial", rotuloEN: "Primordial" },
  supremo:    { emoji: "👑", rotulo: "Supremo", rotuloEN: "Supreme" },
};
export const SLOT_INFO = {
  // slots do CATÁLOGO
  mao:        { emoji: "⚔️", rotulo: "Mão", rotuloEN: "Hand" },
  capacete:   { emoji: "🪖", rotulo: "Cabeça", rotuloEN: "Head" },
  armadura:   { emoji: "🛡️", rotulo: "Corpo", rotuloEN: "Body" },
  acessorio:  { emoji: "💍", rotulo: "Acessório", rotuloEN: "Accessory" },
  implante:   { emoji: "🧬", rotulo: "Implante", rotuloEN: "Implant" },
  contrato:   { emoji: "📜", rotulo: "Contrato", rotuloEN: "Contract" },
  pergaminho: { emoji: "📖", rotulo: "Pergaminho", rotuloEN: "Scroll" },
  // vagas equipáveis
  mao1:       { emoji: "⚔️", rotulo: "Mão principal", rotuloEN: "Main hand" },
  mao2:       { emoji: "🗡️", rotulo: "Mão secundária", rotuloEN: "Off hand" },
  acessorio1: { emoji: "💍", rotulo: "Acessório 1", rotuloEN: "Accessory 1" },
  acessorio2: { emoji: "💍", rotulo: "Acessório 2", rotuloEN: "Accessory 2" },
  acessorio3: { emoji: "💍", rotulo: "Acessório 3", rotuloEN: "Accessory 3" },
  bio1:       { emoji: "🧬", rotulo: "Bioware 1", rotuloEN: "Bioware 1" },
  bio2:       { emoji: "🧬", rotulo: "Bioware 2", rotuloEN: "Bioware 2" },
  bio3:       { emoji: "🧬", rotulo: "Bioware 3", rotuloEN: "Bioware 3" },
  ciber1:     { emoji: "🦾", rotulo: "Cyberware 1", rotuloEN: "Cyberware 1" },
  ciber2:     { emoji: "🦾", rotulo: "Cyberware 2", rotuloEN: "Cyberware 2" },
  ciber3:     { emoji: "🦾", rotulo: "Cyberware 3", rotuloEN: "Cyberware 3" },
};
export const rotuloSlot = (s, en) => (en ? SLOT_INFO[s]?.rotuloEN : SLOT_INFO[s]?.rotulo) ?? s;
export const rotuloRaridade = (r, en) => (en ? RARIDADE_INFO[r]?.rotuloEN : RARIDADE_INFO[r]?.rotulo) ?? r;
export function acharRaridade(txt) {
  const t = String(txt ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!t) return null;
  return R.ORDEM.find((r) => r === t || RARIDADE_INFO[r].rotuloEN.toLowerCase() === t)
      ?? R.ORDEM.find((r) => t.length >= 3 && (r.startsWith(t) || RARIDADE_INFO[r].rotuloEN.toLowerCase().startsWith(t))) ?? null;
}

export function fmt(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 100 || Number.isInteger(v)) return Math.round(v).toLocaleString("pt-BR");
  const casas = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}
export const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
export const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export function numeroDigitado(txt) {
  const t = String(txt ?? "").trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}
export function barraProgresso(fracao, largura = 12) {
  const v = Math.max(0, Math.min(1, fracao || 0));
  const cheias = Math.round(v * largura);
  return "▰".repeat(cheias) + "▱".repeat(largura - cheias);
}

export async function enviarLista(sendEmbed, canal, { titulo, linhas, rodape = "", colour, imagem = null }) {
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
      ...(imagem && i === 0 ? { imagem } : {}),
    });
  }
}

export function descreverBonus(bonus, en = false) {
  const partes = Object.entries(bonus ?? {}).filter(([, v]) => v)
    .map(([k, v]) => `${ATRIB[k]?.emoji ?? ""}${(en ? ATRIB[k]?.rotuloEN : ATRIB[k]?.rotulo) ?? k} +${v}`);
  return partes.length ? partes.join(" · ") : (en ? "_no bonus_" : "_sem bônus_");
}
const TIPO_ARMA = { branca: ["branca", "melee"], fogo: ["de fogo", "ranged"], magica: ["mágica", "magic"] };
const PORTE = { leve: ["leve", "light"], medio: ["média", "medium"], pesado: ["pesada", "heavy"], colossal: ["colossal", "colossal"] };
const ALVO = { melee: ["ataque corpo a corpo", "melee attack"], ranged: ["ataque à distância", "ranged attack"], magia: ["ataque mágico", "magic attack"],
  ataque: ["todo o ataque", "all attack"], defesa: ["defesa", "defense"] };
const intervalo = ([a, b], f = (x) => fmt(Math.round(x))) => (Math.abs(a - b) < 0.5 ? f(a) : `${f(a)}–${f(b)}`);
// Uma linha que diz o que o item faz.
export function descreverItem(item, en = false) {
  const s = CB.statsItem(item);
  const A = (k) => (en ? ATRIB[k]?.abrevEN : ATRIB[k]?.abrev) ?? k;
  const esc = (e) => Object.entries(e ?? {}).map(([k, L]) => `${A(k)} ${L}`).join(" · ");
  const unico = item?.especial ? (en ? " · ✦ unique" : " · ✦ único") : "";
  if (s.tipo === "arma") {
    const t = TIPO_ARMA[s.tipoDano] ?? ["?", "?"], p = PORTE[s.porte] ?? ["?", "?"];
    const req = [`${A("forca")} ${s.reqFor1}/${s.reqFor2}`, s.reqDes ? `${A("destreza")} ${s.reqDes}` : null, s.reqInt ? `${A("inteligencia")} ${s.reqInt}` : null].filter(Boolean).join(" · ");
    return en ? `${s.foco ? "focus · " : ""}${p[1]} ${t[1]} · **damage ${fmt(s.dano)}** · scales ${esc(s.esc)} · needs ${req} _(1 hand/2 hands)_${unico}`
      : `${s.foco ? "foco · " : ""}${t[0]} ${p[0]} · **dano ${fmt(s.dano)}** · escala ${esc(s.esc)} · pede ${req} _(1 mão/2 mãos)_${unico}`;
  }
  if (s.tipo === "escudo") return en ? `shield · **defense ${fmt(s.defesa)}** · +${Math.round(s.reforco * 100)}% defense${unico}` : `escudo · **defesa ${fmt(s.defesa)}** · +${Math.round(s.reforco * 100)}% de defesa${unico}`;
  if (s.tipo === "defesa") return en ? `**defense ${fmt(s.defesa)}**${unico}` : `**defesa ${fmt(s.defesa)}**${unico}`;
  if (s.tipo === "acessorio") return descreverBonus(item.bonus, en) + unico;
  if (s.tipo === "implante") {
    const fam = s.familia === "bio" ? (en ? `🧬 bioware ${R.COR_BIO[s.cor]?.emoji ?? ""}` : `🧬 bioware ${R.COR_BIO[s.cor]?.emoji ?? ""}`) : (en ? `🦾 cyberware (${R.REGIOES[s.regiao]?.[1] ?? s.regiao})` : `🦾 cyberware (${R.REGIOES[s.regiao]?.[0] ?? s.regiao})`);
    const req = `${A(s.reqAtr)} ${s.req}`;
    let efeito;
    if (s.papel === "ofensivo") efeito = en ? `damage ${intervalo(s.valor)} (${ALVO[s.alvo]?.[1].replace(" attack", "")})` : `dano ${intervalo(s.valor)} (${ALVO[s.alvo]?.[0].replace("ataque ", "")})`;
    else if (s.papel === "defensivo") efeito = en ? `defense ${intervalo(s.valor)}` : `defesa ${intervalo(s.valor)}`;
    else if (s.papel === "reforco") efeito = `+${intervalo(s.pct.map((x) => x * 100), (x) => x.toFixed(1).replace(".", en ? "." : ","))}% ${en ? "on" : "em"} ${ALVO[s.alvo]?.[en ? 1 : 0]}`;
    else efeito = s.atributos.map((k) => `+${intervalo(s.pontos.map((x) => x / s.atributos.length))} ${A(k)}`).join(", ");
    const resson = s.bio ? (en ? " · scales with its color and resonates" : " · escala com a cor e ressoa") : "";
    return `${fam} · ${efeito} · ${en ? "needs" : "pede"} ${req}${resson}${unico}`;
  }
  if (s.tipo === "contrato") return en ? "contract — becomes the companion (`&game usar <contract>`)" : "contrato — vira o companheiro (`&game usar <contrato>`)";
  if (s.tipo === "pergaminho") return en ? "scroll — teaches the spell (`&game usar <scroll>`)" : "pergaminho — ensina a magia (`&game usar <pergaminho>`)";
  return descreverBonus(item?.bonus, en);
}
