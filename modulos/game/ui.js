// Pedaços de tela do RPG que o game.js e o aventura.js usam: rótulos de
// atributo, raridade e vaga; números; listas em vários embeds; a descrição de
// um item (dano, defesa, bônus, implante).

import * as R from "./regras.js";
import { citarInterno, citar, trechoPronto } from "../core/aliases.js";
import * as CB from "./combate.js";

export const ATRIB = {
  forca:        { rotulo: "Força", rotuloEN: "Strength",        abrev: "For", abrevEN: "Str", rotuloES: "Fuerza", abrevES: "Fue", emoji: "💪", aliases: ["forca", "força", "for", "str", "strength"] },
  destreza:     { rotulo: "Destreza", rotuloEN: "Dexterity",    abrev: "Des", abrevEN: "Dex", rotuloES: "Destreza", abrevES: "Des", emoji: "🎯", aliases: ["destreza", "des", "dex", "dexterity"] },
  resistencia:  { rotulo: "Resistência", rotuloEN: "Resistance", abrev: "Res", abrevEN: "Res", rotuloES: "Resistencia", abrevES: "Res", emoji: "🛡️", aliases: ["resistencia", "resistência", "res", "def", "resistance"] },
  agilidade:    { rotulo: "Agilidade", rotuloEN: "Agility",     abrev: "Agi", abrevEN: "Agi", rotuloES: "Agilidad", abrevES: "Agi", emoji: "💨", aliases: ["agilidade", "agi", "agl", "agility"] },
  vida:         { rotulo: "Vida", rotuloEN: "Health",           abrev: "Vida", abrevEN: "HP", rotuloES: "Vida", abrevES: "Vida", emoji: "❤️", aliases: ["vida", "hp", "vit", "health"] },
  mana:         { rotulo: "Mana", rotuloEN: "Mana",             abrev: "Mana", abrevEN: "Mana", rotuloES: "Maná", abrevES: "Maná", emoji: "🔷", aliases: ["mana", "mp"] },
  inteligencia: { rotulo: "Inteligência", rotuloEN: "Intelligence", abrev: "Int", abrevEN: "Int", rotuloES: "Inteligencia", abrevES: "Int", emoji: "🧠", aliases: ["inteligencia", "inteligência", "int", "intelligence"] },
  sorte:        { rotulo: "Sorte", rotuloEN: "Luck",            abrev: "Sor", abrevEN: "Lck", rotuloES: "Suerte", abrevES: "Sue", emoji: "🍀", aliases: ["sorte", "sor", "luk", "luck"] },
  carisma:      { rotulo: "Carisma", rotuloEN: "Charisma",      abrev: "Car", abrevEN: "Cha", rotuloES: "Carisma", abrevES: "Car", emoji: "✨", aliases: ["carisma", "car", "cha", "charisma"] },
};
export function acharAtributo(txt) {
  const t = String(txt ?? "").toLowerCase().trim();
  if (!t) return null;
  for (const [chave, info] of Object.entries(ATRIB)) if (info.aliases.includes(t)) return chave;
  for (const chave of Object.keys(ATRIB)) if (chave.startsWith(t) && t.length >= 3) return chave;
  return null;
}

export const RARIDADE_INFO = {
  comum:      { emoji: "⚪", rotulo: "Comum", rotuloEN: "Common", rotuloES: "Común" },
  incomum:    { emoji: "🟢", rotulo: "Incomum", rotuloEN: "Uncommon", rotuloES: "Poco común" },
  raro:       { emoji: "🔵", rotulo: "Raro", rotuloEN: "Rare", rotuloES: "Raro" },
  epico:      { emoji: "🟣", rotulo: "Épico", rotuloEN: "Epic", rotuloES: "Épico" },
  lendario:   { emoji: "🟠", rotulo: "Lendário", rotuloEN: "Legendary", rotuloES: "Legendario" },
  mitico:     { emoji: "🔴", rotulo: "Mítico", rotuloEN: "Mythic", rotuloES: "Mítico" },
  celestial:  { emoji: "🌟", rotulo: "Celestial", rotuloEN: "Celestial", rotuloES: "Celestial" },
  divino:     { emoji: "💠", rotulo: "Divino", rotuloEN: "Divine", rotuloES: "Divino" },
  primordial: { emoji: "🌌", rotulo: "Primordial", rotuloEN: "Primordial", rotuloES: "Primordial" },
  supremo:    { emoji: "👑", rotulo: "Supremo", rotuloEN: "Supreme", rotuloES: "Supremo" },
};
export const SLOT_INFO = {
  // slots do CATÁLOGO
  mao:        { emoji: "⚔️", rotulo: "Mão", rotuloEN: "Hand", rotuloES: "Mano" },
  capacete:   { emoji: "🪖", rotulo: "Cabeça", rotuloEN: "Head", rotuloES: "Cabeza" },
  armadura:   { emoji: "🛡️", rotulo: "Corpo", rotuloEN: "Body", rotuloES: "Cuerpo" },
  acessorio:  { emoji: "💍", rotulo: "Acessório", rotuloEN: "Accessory", rotuloES: "Accesorio" },
  implante:   { emoji: "🧬", rotulo: "Implante", rotuloEN: "Implant", rotuloES: "Implante" },
  contrato:   { emoji: "📜", rotulo: "Contrato", rotuloEN: "Contract", rotuloES: "Contrato" },
  pergaminho: { emoji: "📖", rotulo: "Pergaminho", rotuloEN: "Scroll", rotuloES: "Pergamino" },
  // vagas equipáveis
  mao1:       { emoji: "⚔️", rotulo: "Mão principal", rotuloEN: "Main hand", rotuloES: "Mano principal" },
  mao2:       { emoji: "🗡️", rotulo: "Mão secundária", rotuloEN: "Off hand", rotuloES: "Mano secundaria" },
  acessorio1: { emoji: "💍", rotulo: "Acessório 1", rotuloEN: "Accessory 1", rotuloES: "Accesorio 1" },
  acessorio2: { emoji: "💍", rotulo: "Acessório 2", rotuloEN: "Accessory 2", rotuloES: "Accesorio 2" },
  acessorio3: { emoji: "💍", rotulo: "Acessório 3", rotuloEN: "Accessory 3", rotuloES: "Accesorio 3" },
  bio1:       { emoji: "🧬", rotulo: "Bioware 1", rotuloEN: "Bioware 1", rotuloES: "Bioware 1" },
  bio2:       { emoji: "🧬", rotulo: "Bioware 2", rotuloEN: "Bioware 2", rotuloES: "Bioware 2" },
  bio3:       { emoji: "🧬", rotulo: "Bioware 3", rotuloEN: "Bioware 3", rotuloES: "Bioware 3" },
  ciber1:     { emoji: "🦾", rotulo: "Cyberware 1", rotuloEN: "Cyberware 1", rotuloES: "Cyberware 1" },
  ciber2:     { emoji: "🦾", rotulo: "Cyberware 2", rotuloEN: "Cyberware 2", rotuloES: "Cyberware 2" },
  ciber3:     { emoji: "🦾", rotulo: "Cyberware 3", rotuloEN: "Cyberware 3", rotuloES: "Cyberware 3" },
};
// ── Tipos de item (para listar separado dentro da raridade) ─────────────────
// Mais fino que a vaga: arma corpo a corpo / de fogo / mágica, escudo, foco,
// cabeça, corpo, acessório, bioware, cyberware (e contrato, pergaminho).
export const TIPOS_ITEM = {
  melee:      { emoji: "⚔️", rotulo: "Armas corpo a corpo", rotuloEN: "Melee weapons", rotuloES: "Armas cuerpo a cuerpo" },
  fogo:       { emoji: "🔫", rotulo: "Armas de fogo", rotuloEN: "Firearms", rotuloES: "Armas de fuego" },
  magica:     { emoji: "🪄", rotulo: "Armas mágicas", rotuloEN: "Magic weapons", rotuloES: "Armas mágicas" },
  escudo:     { emoji: "🔰", rotulo: "Escudos", rotuloEN: "Shields", rotuloES: "Escudos" },
  foco:       { emoji: "🔮", rotulo: "Focos", rotuloEN: "Foci", rotuloES: "Focos" },
  capacete:   { emoji: "🪖", rotulo: "Cabeça", rotuloEN: "Head", rotuloES: "Cabeza" },
  armadura:   { emoji: "🛡️", rotulo: "Corpo", rotuloEN: "Body", rotuloES: "Cuerpo" },
  acessorio:  { emoji: "💍", rotulo: "Acessórios", rotuloEN: "Accessories", rotuloES: "Accesorios" },
  bioware:    { emoji: "🧬", rotulo: "Bioware", rotuloEN: "Bioware", rotuloES: "Bioware" },
  cyberware:  { emoji: "🦾", rotulo: "Cyberware", rotuloEN: "Cyberware", rotuloES: "Cyberware" },
  contrato:   { emoji: "📜", rotulo: "Contratos", rotuloEN: "Contracts", rotuloES: "Contratos" },
  pergaminho: { emoji: "📖", rotulo: "Pergaminhos", rotuloEN: "Scrolls", rotuloES: "Pergaminos" },
};
// a palavra que o jogo sugere nos comandos ("&game catalogo epico fogo")
export const PALAVRA_TIPO = { melee: "corpo-a-corpo", fogo: "fogo", magica: "magica", escudo: "escudo", foco: "foco", capacete: "cabeca",
  armadura: "armadura", acessorio: "acessorio", bioware: "bioware", cyberware: "cyberware", contrato: "contrato", pergaminho: "pergaminho" };
const PALAVRA_TIPO_EN = { melee: "melee", fogo: "firearms", magica: "magic", escudo: "shield", foco: "focus", capacete: "head",
  armadura: "armor", acessorio: "accessory", bioware: "bioware", cyberware: "cyberware", contrato: "contract", pergaminho: "scroll" };
export const palavraTipo = (t, en) => (en ? PALAVRA_TIPO_EN[t] : PALAVRA_TIPO[t]) ?? t;
export const palavraRaridade = (r, en) => (en ? RARIDADE_INFO[r]?.rotuloEN.toLowerCase() : r) ?? r;
// `en` aqui (e nos rótulos abaixo): true/false, ou "es" — o espanhol sai pronto
const esPronto = (t) => (t == null ? t : trechoPronto(t));
export const rotuloTipo = (t, en) => (en === "es" ? esPronto(TIPOS_ITEM[t]?.rotuloES) : en ? TIPOS_ITEM[t]?.rotuloEN : TIPOS_ITEM[t]?.rotulo) ?? t;
export function tipoDoItem(i) {
  const d = i?.dados ?? {};
  if (d.tipo === "arma") return d.foco ? "foco" : d.arma?.tipo === "fogo" ? "fogo" : d.arma?.tipo === "magica" ? "magica" : "melee";
  if (d.tipo === "escudo") return "escudo";
  if (d.tipo === "implante") return d.familia === "bio" ? "bioware" : "cyberware";
  if (TIPOS_ITEM[i?.slot]) return i.slot;   // capacete, armadura, acessorio, contrato, pergaminho
  return "acessorio";
}
// Palavra digitada → os tipos que ela cobre ("armas" = os cinco de mão)
const ALIAS_TIPO = {
  melee: ["corpo a corpo", "corpo-a-corpo", "corpoacorpo", "branca", "brancas", "melee", "espada", "espadas", "lamina", "laminas"],
  fogo: ["fogo", "armas de fogo", "arma de fogo", "distancia", "ranged", "firearm", "firearms", "gun", "guns", "tiro", "pistola", "pistolas", "rifle", "rifles"],
  magica: ["magica", "magicas", "armas magicas", "magic", "cajado", "cajados", "varinha", "varinhas", "staff"],
  escudo: ["escudo", "escudos", "shield", "shields"],
  foco: ["foco", "focos", "focus", "foci"],
  capacete: ["capacete", "capacetes", "cabeca", "elmo", "elmos", "head", "helmet", "helmets"],
  armadura: ["armadura", "armaduras", "corpo", "body", "armor", "armour", "roupa", "roupas"],
  acessorio: ["acessorio", "acessorios", "accessory", "accessories", "anel", "aneis", "amuleto", "amuletos"],
  bioware: ["bio", "bioware"],
  cyberware: ["ciber", "cyber", "cyberware", "ciberware"],
  contrato: ["contrato", "contratos", "contract", "contracts"],
  pergaminho: ["pergaminho", "pergaminhos", "scroll", "scrolls"],
};
const GRUPOS_TIPO = { armas: ["melee", "fogo", "magica", "escudo", "foco"], arma: ["melee", "fogo", "magica", "escudo", "foco"],
  weapon: ["melee", "fogo", "magica", "escudo", "foco"], weapons: ["melee", "fogo", "magica", "escudo", "foco"], mao: ["melee", "fogo", "magica", "escudo", "foco"],
  implante: ["bioware", "cyberware"], implantes: ["bioware", "cyberware"], implant: ["bioware", "cyberware"], implants: ["bioware", "cyberware"] };
export function acharTipo(txt) {
  const t = String(txt ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (GRUPOS_TIPO[t]) return GRUPOS_TIPO[t];
  const k = Object.keys(ALIAS_TIPO).find((x) => x === t || ALIAS_TIPO[x].includes(t));
  return k ? [k] : null;
}
// Itens agrupados por tipo, na ordem de TIPOS_ITEM: [[tipo, itens], …]
export function agruparPorTipo(itens) {
  const g = new Map(Object.keys(TIPOS_ITEM).map((k) => [k, []]));
  for (const i of itens) g.get(tipoDoItem(i))?.push(i);
  return [...g].filter(([, l]) => l.length);
}
// Lê "<raridade> <tipo>" em qualquer ordem; o que sobra volta em `resto`
export function lerFiltroDeItens(txt) {
  const palavras = String(txt ?? "").trim().split(/\s+/).filter(Boolean);
  let raridade = null, tipos = null;
  const sobra = [];
  for (let k = 0; k < palavras.length; k++) {
    const dupla = palavras.slice(k, k + 3).join(" "), dupla2 = palavras.slice(k, k + 2).join(" ");
    if (!tipos && acharTipo(dupla) && palavras.length - k >= 3) { tipos = acharTipo(dupla); k += 2; continue; }
    if (!tipos && acharTipo(dupla2) && palavras.length - k >= 2) { tipos = acharTipo(dupla2); k += 1; continue; }
    if (!raridade && acharRaridade(palavras[k])) { raridade = acharRaridade(palavras[k]); continue; }
    if (!tipos && acharTipo(palavras[k])) { tipos = acharTipo(palavras[k]); continue; }
    sobra.push(palavras[k]);
  }
  return { raridade, tipos, resto: sobra.join(" ") };
}

export const rotuloSlot = (s, en) => (en === "es" ? esPronto(SLOT_INFO[s]?.rotuloES) : en ? SLOT_INFO[s]?.rotuloEN : SLOT_INFO[s]?.rotulo) ?? s;
export const rotuloRaridade = (r, en) => (en === "es" ? esPronto(RARIDADE_INFO[r]?.rotuloES) : en ? RARIDADE_INFO[r]?.rotuloEN : RARIDADE_INFO[r]?.rotulo) ?? r;
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
  if (en === "es") return trechoPronto(bonusEs(bonus));
  const partes = Object.entries(bonus ?? {}).filter(([, v]) => v)
    .map(([k, v]) => `${ATRIB[k]?.emoji ?? ""}${(en ? ATRIB[k]?.rotuloEN : ATRIB[k]?.rotulo) ?? k} +${v}`);
  return partes.length ? partes.join(" · ") : (en ? "_no bonus_" : "_sem bônus_");
}
function bonusEs(bonus) {
  const partes = Object.entries(bonus ?? {}).filter(([, v]) => v)
    .map(([k, v]) => `${ATRIB[k]?.emoji ?? ""}${ATRIB[k]?.rotuloES ?? k} +${v}`);
  return partes.length ? partes.join(" · ") : "_sin bonus_";
}
// [pt, en, es]
const TIPO_ARMA = { branca: ["branca", "melee", "blanca"], fogo: ["de fogo", "ranged", "de fuego"], magica: ["mágica", "magic", "mágica"] };
const PORTE = { leve: ["leve", "light", "ligera"], medio: ["média", "medium", "media"], pesado: ["pesada", "heavy", "pesada"], colossal: ["colossal", "colossal", "colosal"] };
const ALVO = { melee: ["ataque corpo a corpo", "melee attack", "ataque cuerpo a cuerpo"], ranged: ["ataque à distância", "ranged attack", "ataque a distancia"], magia: ["ataque mágico", "magic attack", "ataque mágico"],
  ataque: ["todo o ataque", "all attack", "todo el ataque"], defesa: ["defesa", "defense", "defensa"] };
// as regiões do cyberware (R.REGIOES tem só pt e en)
const REGIOES_ES = { bracos: "brazos", sistema: "sistema operativo", esqueleto: "esqueleto", pele: "piel", nervoso: "sistema nervioso", pernas: "piernas",
  olhos: "ojos", cortex: "córtex", circulatorio: "circulatorio", musculos: "músculos", maos: "manos", imunologico: "inmunológico" };
const intervalo = ([a, b], f = (x) => fmt(Math.round(x))) => (Math.abs(a - b) < 0.5 ? f(a) : `${f(a)}–${f(b)}`);
// Uma linha que diz o que o item faz.
export function descreverItem(item, en = false) {
  if (en === "es") return trechoPronto(itemEs(item));
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
  if (s.tipo === "contrato") return en ? "contract — becomes the companion (`" + citarInterno("game.usar") + " <contract>`)" : "contrato — vira o companheiro (`" + citarInterno("game.usar") + " <contrato>`)";
  if (s.tipo === "pergaminho") return en ? "scroll — teaches the spell (`" + citarInterno("game.usar") + " <scroll>`)" : "pergaminho — ensina a magia (`" + citarInterno("game.usar") + " <pergaminho>`)";
  return descreverBonus(item?.bonus, en);
}
function itemEs(item) {
  const s = CB.statsItem(item);
  const A = (k) => ATRIB[k]?.abrevES ?? k;
  const esc = (e) => Object.entries(e ?? {}).map(([k, L]) => `${A(k)} ${L}`).join(" · ");
  const unico = item?.especial ? " · ✦ único" : "";
  if (s.tipo === "arma") {
    const t = TIPO_ARMA[s.tipoDano] ?? ["?", "?", "?"], p = PORTE[s.porte] ?? ["?", "?", "?"];
    const req = [`${A("forca")} ${s.reqFor1}/${s.reqFor2}`, s.reqDes ? `${A("destreza")} ${s.reqDes}` : null, s.reqInt ? `${A("inteligencia")} ${s.reqInt}` : null].filter(Boolean).join(" · ");
    return `${s.foco ? "foco · " : ""}${t[2]} ${p[2]} · **daño ${fmt(s.dano)}** · escala ${esc(s.esc)} · pide ${req} _(1 mano/2 manos)_${unico}`;
  }
  if (s.tipo === "escudo") return `escudo · **defensa ${fmt(s.defesa)}** · +${Math.round(s.reforco * 100)}% de defensa${unico}`;
  if (s.tipo === "defesa") return `**defensa ${fmt(s.defesa)}**${unico}`;
  if (s.tipo === "acessorio") return bonusEs(item.bonus) + unico;
  if (s.tipo === "implante") {
    const fam = s.familia === "bio" ? `🧬 bioware ${R.COR_BIO[s.cor]?.emoji ?? ""}` : `🦾 cyberware (${REGIOES_ES[s.regiao] ?? R.REGIOES[s.regiao]?.[1] ?? s.regiao})`;
    const req = `${A(s.reqAtr)} ${s.req}`;
    let efeito;
    if (s.papel === "ofensivo") efeito = `daño ${intervalo(s.valor)} (${ALVO[s.alvo]?.[2].replace("ataque ", "")})`;
    else if (s.papel === "defensivo") efeito = `defensa ${intervalo(s.valor)}`;
    else if (s.papel === "reforco") efeito = `+${intervalo(s.pct.map((x) => x * 100), (x) => x.toFixed(1).replace(".", ","))}% en ${ALVO[s.alvo]?.[2]}`;
    else efeito = s.atributos.map((k) => `+${intervalo(s.pontos.map((x) => x / s.atributos.length))} ${A(k)}`).join(", ");
    const resson = s.bio ? " · escala con el color y resuena" : "";
    return `${fam} · ${efeito} · pide ${req}${resson}${unico}`;
  }
  if (s.tipo === "contrato") return "contrato — se convierte en el compañero (`" + citar("game.usar", "es") + " <contrato>`)";
  if (s.tipo === "pergaminho") return "pergamino — enseña el hechizo (`" + citar("game.usar", "es") + " <pergamino>`)";
  return bonusEs(item?.bonus);
}
