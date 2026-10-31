
import * as db from "../core/db.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import { idEscrito } from "../core/ids.js";
import { registrarErro } from "../core/erros.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { semear as semearConteudo } from "./conteudo.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import * as MISS from "./missoes.js";
import * as FOL from "./followers.js";
import * as MAG from "./magias.js";
import * as MERC from "./mercado.js";
import * as TS from "./tesouro.js";
import * as EV from "./evolucionador.js";
import * as AV from "./aventura.js";
import * as DU from "./duelo.js";
import { migrarParaV4 } from "./migracao.js";
import * as IMG from "./imagens.js";
import { validarUrlImagem } from "../core/midia.js";
import { rodarTesteGeral } from "./teste-geral.js";
import { traduzirEmbed, traduzirTexto, argsParaPortugues, EN as DIC_EN } from "./traducao.js";
import { MUNDO, prepararMundo, garantirMoedasDoMundo, MOEDAS_DO_MUNDO } from "./mundo.js";
import { ATRIB, acharAtributo, RARIDADE_INFO, SLOT_INFO, rotuloSlot, rotuloRaridade, fmt, pct, semAcento,
  numeroDigitado, barraProgresso, enviarLista, descreverItem, TIPOS_ITEM, palavraTipo, palavraRaridade, rotuloTipo, tipoDoItem, agruparPorTipo, lerFiltroDeItens } from "./ui.js";
// (etapa 4b) os rótulos do ui.js (raridade, vaga, tipo, item) no idioma da tela: "es" no
// espanhol, o `en` de sempre nos outros — o pt e o en saem iguais
const rotuloLang = (ctx, en) => (en && idiomaDe(ctx) === "es" ? "es" : en);

// ── Progresso (D6, D11 — RPG v4) ─────────────────────────────────────────────
// O nível guarda o progresso dentro dele (0 a 1). A missão paga a força dela
// em "pontos de força"; o custo de um nível acompanha a força daquele nível,
// então um êxito no seu nível vale 80% de um nível.
export const pontosPorNivel = R.pontosPorNivel;
export const baseDoNivel = R.baseDoNivel;
export const energiaAtual = AV.energiaAtual;
const ENERGIA_MAX = AV.ENERGIA_MAX;
const JANELA_DONO_H = AV.JANELA_DONO_H;
// Resetar pontos: Ouro por nível (segue o P do mercado)
const RESPEC_POR_NIVEL = 60;

// Semeia o catálogo uma vez por boot e migra quem já jogava (D13).
const TIPOS_DO_BAZAR = ["venda", "cambio"];   // troca e duelo nunca aparecem nem se compram no bazar
let semeado = false;
let RPG_FECHADO = null;   // a etapa do boot do jogo que falhou (o jogo fica fechado)
export const rpgFechado = () => RPG_FECHADO;
// (31 out 2026, Regra do Reparo) QUALQUER falha no boot do jogo (catálogo, mundo,
// migração) fecha o jogo e vai para o log: antes só a migração fechava, e um
// catálogo ou um mundo pela metade deixava jogar em cima de dados quebrados.
// `<@ID>` ou o ID cru (26 caracteres) — nunca busca por nome
export function mencaoOuId(entrada) {
  const m = String(entrada ?? "").trim().match(/^<@!?([0-9A-HJKMNP-TV-Z]{26})>$|^([0-9A-HJKMNP-TV-Z]{26})$/i);
  return m ? (m[1] ?? m[2]).toUpperCase() : null;
}

// O nome do personagem aparece para todos (ficha, duelo, top de todos os
// servidores). (31 out 2026, R6) Sem menção, @everyone, markdown nem link; até 32
// caracteres; vazio → "Aventureiro".
export const NOME_MAX = 32;
export function nomeDePersonagem(bruto) {
  let t = String(bruto ?? "").normalize("NFKC")
    .replace(/<[@%#][^>]*>/g, " ")                                     // menções
    .split(/\s+/).filter((p) => !/^\W*@|:\/\/|^www\.|\.[a-z]{2,}(\/|$)/i.test(p)).join(" ")   // @alguém, links e domínios
    .replace(/[^\p{L}\p{M}\p{N} '\-]/gu, " ")                          // markdown, @, #, emoji…
    .replace(/\s+/g, " ").trim();
  if (t.length > NOME_MAX) t = t.slice(0, NOME_MAX).trim();
  return t || "Aventureiro";
}

export function iniciarCatalogo() {
  if (semeado && !RPG_FECHADO) return;
  const etapa = (nome, fn) => {
    try { return fn(); }
    catch (e) { RPG_FECHADO ??= nome; registrarErro("RPG", e); console.error(`[RPG] falha em "${nome}" — o jogo fica fechado`); return null; }
  };
  RPG_FECHADO = null;
  const n = etapa("catálogo", () => semearConteudo(db));
  if (n) { semeado = true; console.log(`[RPG] catálogo pronto (${n.itens} item(ns), ${n.companheiros} companheiro(s))`); }
  // o mundo global: zera o jogo dos servidores uma única vez e garante as duas moedas
  etapa("mundo", () => prepararMundo());
  // se a migração falhar, o jogo fica fechado: jogar o v4 em cima dos dados da v3
  // (e migrar depois por cima do que se jogou) estragaria os personagens
  if (!RPG_FECHADO) etapa("migração v4", () => migrarParaV4());
}

// Soma os bônus dos acessórios (v4: armas e armaduras dão dano e defesa, não atributo).
export function bonusEquipados(serverId, userId) {
  const eq = db.getEquipado(serverId, userId);
  const total = {};
  for (const [slot, item] of Object.entries(eq)) {
    if (!/^acessorio/.test(slot)) continue;
    for (const [k, v] of Object.entries(item.bonus ?? {})) total[k] = (total[k] ?? 0) + v;
  }
  return total;
}

export function garantirMoeda(serverId) {
  if (serverId === MUNDO) return garantirMoedasDoMundo();
  let m = db.moedaPadrao(serverId);
  if (!m) m = db.upsertMoeda(serverId, { id: "ouro", nome: "Ouro", simbolo: "🪙", finita: true, mercado: 10000, padrao: true });
  return m;
}

// P atual (recalculado) e o P suavizado que as fórmulas usam.
export function pDaMoeda(serverId, moeda) {
  const comPlayers = db.totalNasCarteiras(serverId, moeda.id);
  const pAgora = MERC.calcularP(comPlayers, moeda.mercado);
  const pSuave = MERC.suavizar(moeda.pSuave, pAgora);
  db.salvarMoeda(serverId, moeda.id, { pSuave, pEm: Date.now() });
  return { pAgora, pSuave, comPlayers };
}

// Banco → jogador (a recompra do NPC).
// O nome DIGITÁVEL da moeda na tela (16 out 2026): o id é português
// ("ouro"); em inglês o jogo aceita "gold" (traducao.argsParaPortugues).
const MOEDA_EN = { ouro: "gold", cristal: "crystal" };
const idDigitavel = (m, en) => (en ? MOEDA_EN[m?.id] ?? m?.id : m?.id);

// (etapa 4b, 21 out 2026) Num servidor em espanhol o catálogo também sai em inglês,
// mas o texto pronto em espanhol (entre U+2063 e U+2064, vindo de `tr`/`trechoPronto`)
// não pode passar inteiro pelo dicionário: "Vida", "Carisma", "nada", "magia", "Raro",
// "Épico"… são palavras do espanhol e viravam inglês. Dentro do trecho pronto só os
// nomes do catálogo mudam, e nunca uma palavra que o português e o espanhol têm em
// comum (essas já estão certas em espanhol). Fora dele, igual ao inglês.
const COMUNS_PT_ES = new Set(["Cura", "Humano", "Urbano", "Estelar", "Cósmico", "Hiperversal", "Fácil", "Difícil",
  "Raro", "Épico", "Mago", "Destreza", "Vida", "Carisma", "nada", "magia", "Mítico", "Divino", "Supremo"]);
let RE_CATALOGO_ES = null;
function catalogoNoEspanhol(texto) {
  if (!RE_CATALOGO_ES) {
    const chaves = Object.keys(DIC_EN).filter((k) => !COMUNS_PT_ES.has(k)).sort((a, b) => b.length - a.length);
    RE_CATALOGO_ES = new RegExp(`(?<![\\p{L}\\p{N}])(?:${chaves.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  }
  // `código` fica como está, como no traduzirTexto
  return texto.split(/(`[^`\n]*`)/).map((p, i) => (i % 2 ? p : p.replace(RE_CATALOGO_ES, (m) => DIC_EN[m] ?? m))).join("");
}
function traduzirTextoEs(texto) {
  if (typeof texto !== "string" || !texto) return texto;
  return texto.split(/(\u2063[\s\S]*?\u2064)/).map((p, i) => (i % 2 ? catalogoNoEspanhol(p) : traduzirTexto(p))).join("");
}
function traduzirEmbedEs(e) {
  if (!e || typeof e !== "object") return e;
  return {
    ...e,
    title: traduzirTextoEs(e.title),
    description: traduzirTextoEs(e.description),
    ...(Array.isArray(e.fields) ? { fields: e.fields.map((f) => ({ ...f, name: traduzirTextoEs(f.name), value: traduzirTextoEs(f.value) })) } : {}),
  };
}

function pagarAoJogador(serverId, userId, moeda, qtd) {
  const disponivel = Math.min(qtd, Math.floor(moeda.mercado ?? 0));
  if (disponivel <= 0) return 0;
  db.salvarMoeda(serverId, moeda.id, { mercado: moeda.mercado - disponivel });
  db.creditar(serverId, userId, moeda.id, disponivel);
  return disponivel;
}
// Jogador → NPC: metade volta ao banco, a outra metade o NPC consome (D8 — o ralo).
function jogadorPaga(serverId, userId, moeda, qtd) {
  const pago = db.debitar(serverId, userId, moeda.id, qtd);
  TS.npcRecebe(moeda.id, pago);
  return pago;
}

export function moedaParaPagar(serverId, userId, custoNaPadrao) {
  const padrao = garantirMoeda(serverId);
  if (db.getSaldo(serverId, userId, padrao.id) + 1e-7 >= custoNaPadrao) {
    return { moeda: padrao, custo: custoNaPadrao, convertido: false };
  }
  for (const m of db.listarMoedas(serverId)) {
    if (m.id === padrao.id) continue;
    const equivalente = MERC.custoEm(custoNaPadrao, padrao, m);
    if (db.getSaldo(serverId, userId, m.id) + 1e-7 >= equivalente) {
      return { moeda: m, custo: equivalente, convertido: true, padrao };
    }
  }
  return { moeda: padrao, custo: custoNaPadrao, convertido: false, semSaldo: true };
}

export function atributosComEquipamento(p, serverId, userId) {
  const extra = bonusEquipados(serverId, userId);
  const out = {};
  for (const a of db.ATRIBUTOS) out[a] = (p[a] ?? 0) + (extra[a] ?? 0);
  return out;
}

// `l`: o idioma da tela (pt | en | es) — o espanhol sai pronto
function descreverFollower(f, en, nivelDono = null, comEnergia = true, l = en ? "en" : "pt") {
  const T = (pt, eng, es) => (l === "es" ? trechoPronto(es) : en ? eng : pt);
  const cat = db.getFollowerCatalogo(f.catalogoId);
  if (!cat) return `_(${T("companheiro desconhecido", "unknown companion", "compañero desconocido")})_`;
  const cls = FOL.CLASSES[cat.classe] ?? {};
  const rar = RARIDADE_INFO[cat.raridade] ?? {};
  const e = comEnergia ? ` · ⚡${energiaAtual(f)}/${ENERGIA_MAX}` : "";
  const naParty = f.naParty ? " 🎒" : "";
  const unico = cat.dados?.unico ? " ✦" : "";
  return `${rar.emoji ?? ""}${cls.emoji ?? ""} **${cat.nome}**${unico} _(${en ? cls.rotuloEN : cls.rotulo}, ${T("nv", "lv", "nv")} ${nivelDono ?? f.nivel})_${e}${naParty}`;
}

// Onde o item entra quando a pessoa não diz: a primeira vaga livre do tipo.
function slotParaEquipar(eq, item, pedido) {
  const d = item.dados ?? {};
  if (item.slot === "mao") {
    if (pedido === "mao1" || pedido === "mao2") return pedido;
    if (d.tipo === "escudo" || d.foco) return "mao2";
    if (!eq.mao1) return "mao1";
    if (!eq.mao2) return "mao2";
    return "mao1";
  }
  if (item.slot === "acessorio") {
    if (pedido && /^acessorio[123]$/.test(pedido)) return pedido;
    return ["acessorio1", "acessorio2", "acessorio3"].find((s) => !eq[s]) ?? "acessorio1";
  }
  if (item.slot === "implante") {
    const fam = d.familia === "bio" ? "bio" : "ciber";
    if (pedido && new RegExp(`^${fam}[123]$`).test(pedido)) return pedido;
    // cyberware: uma peça por região do corpo — a da mesma região sai
    if (fam === "ciber") { const mesma = ["ciber1", "ciber2", "ciber3"].find((s) => eq[s]?.dados?.regiao === d.regiao); if (mesma) return mesma; }
    return [1, 2, 3].map((i) => `${fam}${i}`).find((s) => !eq[s]) ?? `${fam}1`;
  }
  return item.slot;   // capacete, armadura
}

const progressoDoNivel = (p) => Math.max(0, Math.min(1, p.progresso ?? 0));

// Kit inicial (v4): as missões são calibradas para a party de referência —
// jogador com arma, cabeça, corpo, acessórios e dois companheiros (combatente +
// tank). Quem começa do zero, sem nada, teria ~5% numa missão do nível 1. O kit
// é o da referência na raridade comum (sem os implantes, que se compram).
export const KIT_INICIAL = {
  equipar: [["mao1", "g_espada_ferro"], ["capacete", "g_elmo_amassado"], ["armadura", "g_tunica_puida"],
    ["acessorio1", "g_amuleto_opaco"], ["acessorio2", "g_cordao_couro"], ["acessorio3", "g_cordao_couro"]],
  companheiros: ["f_mercenario_novato", "f_guarda_bisonho"],
};
// Uma vez por PESSOA: apagar e criar de novo não dá outro kit (a mochila e os
// companheiros ficam quando o personagem é apagado).
function darKitInicial(serverId, uid) {
  if (db.temUnico(uid, "kit")) return;
  db.marcarUnico(uid, "kit");
  const eq = db.getEquipado(serverId, uid);
  for (const [slot, id] of KIT_INICIAL.equipar) {
    if (!db.getItem(id)) continue;
    db.darItem(serverId, uid, id);
    if (!eq[slot]) db.equipar(serverId, uid, slot, id);
  }
  for (const id of KIT_INICIAL.companheiros) {
    if (!db.getFollowerCatalogo(id)) continue;
    const f = db.recrutarFollower(serverId, uid, id, 1);
    if (db.getParty(serverId, uid).length < 2) db.salvarFollower(f.id, { naParty: 1 });
  }
}

// `l`: o idioma da tela (pt | en | es) — `lang` segue sendo o do texto (pt | en)
function montarFicha(p, P, serverId, userId, lang = "pt", l = lang) {
  const en = lang === "en";
  const T = (pt, eng, es) => (l === "es" ? trechoPronto(es) : en ? eng : pt);
  const party = CB.partyDe(serverId, userId, p);
  const f = R.faixaDoNivel(p.nivel ?? 1);
  const cls = p.classe ? EV.CLASSES_JOGADOR[p.classe] : null;
  const linhas = [
    T(`**Nível ${p.nivel}** · dificuldade ${f.n} (${f.nome}) · ${Math.round(progressoDoNivel(p) * 100)}% para o próximo`,
      `**Level ${p.nivel}** · difficulty ${f.n} (${f.nomeEN}) · ${Math.round(progressoDoNivel(p) * 100)}% to the next`,
      `**Nivel ${p.nivel}** · dificultad ${f.n} (${f.nomeEN}) · ${Math.round(progressoDoNivel(p) * 100)}% para el siguiente`),
    `${barraProgresso(progressoDoNivel(p))}`,
    cls ? `${cls.emoji} ${T("Classe", "Class", "Clase")}: **${en ? cls.rotuloEN : cls.rotulo}**${p.evoluirAuto ? T(" · evoluir automático ligado", " · auto-evolve on", " · evolución automática activada") : ""}` : null,
    "",
  ].filter((x) => x !== null);

  const extra = bonusEquipados(serverId, userId), imp = R.efeitosImplantes(party.jogador).extra;
  const cols = Object.entries(ATRIB).map(([chave, info]) => {
    const bonus = (extra[chave] ?? 0) + (imp[chave] ?? 0);
    return `${info.emoji} **${en ? info.rotuloEN : info.rotulo}** ${p[chave]}${bonus ? ` _(+${bonus})_` : ""}`;
  });
  for (let i = 0; i < cols.length; i += 3) linhas.push(cols.slice(i, i + 3).join(" · "));

  const pontos = Math.floor(p.pontos ?? 0);
  linhas.push("");
  linhas.push(pontos > 0
    ? T(`🔹 **${pontos} ponto(s) para distribuir** — \`${citarInterno("game.pontos", P)} <atributo> <quantos>\` ou \`${citarInterno("game.evoluir", P)}\``,
      `🔹 **${pontos} point(s) to spend** — \`${citarInterno("game.pontos", P)} <attribute> <how many>\` or \`${citarInterno("game.evoluir", P)}\``,
      `🔹 **${pontos} punto(s) por repartir** — \`${citar("game.pontos", "es", P)} <atributo> <cuántos>\` o \`${citar("game.evoluir", "es", P)}\``)
    : T(`_Sem pontos livres. Ganho por nível: **${R.pontosPorNivel(p.inteligencia, p.sorte).toFixed(2).replace(".", ",")}**._`,
      `_No free points. Gain per level: **${R.pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}**._`,
      `_Sin puntos libres. Ganancia por nivel: **${R.pontosPorNivel(p.inteligencia, p.sorte).toFixed(2).replace(".", ",")}**._`));

  // força: o que a party põe contra uma missão do seu nível
  const pv = CB.prever([party], { ...R.missao(p.nivel), base: R.BASE.normal });
  linhas.push("", T(`**Força** — ataque ${fmt(pv.poder)} · defesa ${fmt(pv.resil)}`, `**Strength** — attack ${fmt(pv.poder)} · defense ${fmt(pv.resil)}`,
    `**Fuerza** — ataque ${fmt(pv.poder)} · defensa ${fmt(pv.resil)}`),
    T(`_Um contrato do seu nível: ${pct(pv.exito)} de vencer · ${pct(pv.sobrevivencia)} de sobreviver${pv.sinergia.bonus > 0.005 ? ` · sinergia +${pct(pv.sinergia.bonus)}` : ""}_`,
      `_A contract of your level: ${pct(pv.exito)} to win · ${pct(pv.sobrevivencia)} to survive${pv.sinergia.bonus > 0.005 ? ` · synergy +${pct(pv.sinergia.bonus)}` : ""}_`,
      `_Un contrato de tu nivel: ${pct(pv.exito)} de ganar · ${pct(pv.sobrevivencia)} de sobrevivir${pv.sinergia.bonus > 0.005 ? ` · sinergia +${pct(pv.sinergia.bonus)}` : ""}_`));

  const eq = db.getEquipado(serverId, userId);
  const ocupados = db.SLOTS.filter((s) => eq[s]).length;
  linhas.push("", T(`**Equipamento — ${ocupados}/${db.SLOTS.length} vagas**`, `**Gear — ${ocupados}/${db.SLOTS.length} slots**`, `**Equipo — ${ocupados}/${db.SLOTS.length} espacios**`));
  const { maos, escudo } = CB.maosDe(eq);
  const linhaSlot = (s, extraTxt = "") => {
    const it = eq[s], info = SLOT_INFO[s] ?? {};
    return it ? `${info.emoji} **${rotuloSlot(s, en)}:** ${RARIDADE_INFO[it.raridade]?.emoji ?? ""} ${it.nome}${extraTxt}` : `${info.emoji} **${rotuloSlot(s, en)}:** ${T("_vazio_", "_empty_", "_vacío_")}`;
  };
  const modo = maos.length === 1 && maos[0].modo === "2m" ? T(" _(nas duas mãos)_", " _(both hands)_", " _(a dos manos)_") : "";
  const unica = maos.length === 1 ? T(" · arma única +80%", " · single weapon +80%", " · arma única +80%") : "";
  linhas.push(linhaSlot("mao1", eq.mao1 && CB.ehArma(eq.mao1) ? modo + unica : ""), linhaSlot("mao2", escudo && eq.mao2 === escudo ? T(" · +10% de defesa", " · +10% defense", " · +10% de defensa") : ""));
  for (const s of ["capacete", "armadura", "acessorio1", "acessorio2", "acessorio3"]) linhas.push(linhaSlot(s));
  const implantes = ["bio1", "bio2", "bio3", "ciber1", "ciber2", "ciber3"].filter((s) => eq[s]);
  linhas.push(implantes.length ? `🧬🦾 ${implantes.map((s) => eq[s].nome).join(" · ")}` : T("🧬🦾 _nenhum implante — 3 vagas de bioware e 3 de cyberware_", "🧬🦾 _no implants — 3 bioware and 3 cyberware slots_", "🧬🦾 _ningún implante — 3 espacios de bioware y 3 de cyberware_"));
  if (ocupados < db.SLOTS.length) linhas.push(T(`_\`${citarInterno("game.itens", P)}\` mostra o que dá para equipar._`, `_\`${citarInterno("game.itens", P)}\` shows what you can equip._`, `_\`${citar("game.itens", "es", P)}\` muestra lo que puedes equipar._`));

  const j = CB.juntar([party]);
  linhas.push("", T(`**Magia — ${j.manaGasta}/${j.mana} de mana em uso**`, `**Magic — ${j.manaGasta}/${j.mana} mana in use**`, `**Magia — ${j.manaGasta}/${j.mana} de maná en uso**`));
  if (j.magias.length) for (const m of j.magias) {
    const esc = MAG.ESCOLAS[m.tipo] ?? {};
    linhas.push(`${esc.emoji ?? "✦"} **${en ? (m.nomeEN ?? m.nome) : m.nome}** — ${en ? esc.rotuloEN : esc.rotulo} · ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}%`);
  } else linhas.push(T(`_Nenhuma magia ativa._ Aprenda uma com \`${citarInterno("game.magias", P)}\`.`, `_No active spell._ Learn one with \`${citarInterno("game.magias", P)}\`.`, `_Ningún hechizo activo._ Aprende uno con \`${citar("game.magias", "es", P)}\`.`));
  const dormentes = j.todas.length - j.magias.length;
  if (dormentes > 0) linhas.push(T(`_${dormentes} magia(s) não cabem na mana — suba Mana para usá-las._`, `_${dormentes} spell(s) don't fit in the mana — raise Mana to use them._`, `_${dormentes} hechizo(s) no caben en el maná — sube Mana para usarlos._`));
  if (party.semAtributo.length) linhas.push(T(`_${party.semAtributo.length} magia(s) esperam mais Inteligência._`, `_${party.semAtributo.length} spell(s) wait for more Intelligence._`, `_${party.semAtributo.length} hechizo(s) esperan más Inteligencia._`));
  return linhas.join("\n");
}

export async function cmdGame(message, args, ctx) {
  const { COR, PREFIXO: P, getServer } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  const L = idiomaDe(ctx);   // o idioma da tela (pt | en | es), para as funções sem ctx
  // Num servidor em inglês, o catálogo (missões, itens, magias, companheiros)
  // sai traduzido — todas as mensagens do jogo passam por este sendEmbed.
  // (em espanhol, o texto pronto só troca os nomes do catálogo — traduzirEmbedEs)
  const sendEmbed = en ? (canal, e) => ctx.sendEmbed(canal, (L === "es" ? traduzirEmbedEs : traduzirEmbed)(e)) : ctx.sendEmbed;
  if (en) args = argsParaPortugues(args);   // "buy Iron Sword" acha a "Espada de Ferro"
  // O jogo é um mundo só: o mesmo personagem, mercado e moedas em todo
  // servidor (ver mundo.js). O servidor da mensagem só decide se o comando vale.
  const serverId = MUNDO;
  if (RPG_FECHADO) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛠️ RPG em manutenção", description: "A atualização do jogo não terminou — nada foi perdido. O dono do bot já foi avisado no log.", colour: COR.aviso },
      { title: "🛠️ RPG under maintenance", description: "The game update didn't finish — nothing was lost. The bot owner has been notified in the log.", colour: COR.aviso },
      { title: "🛠️ RPG en mantenimiento", description: "La actualización del juego no terminó — no se perdió ningún dato. El dueño del bot ya fue avisado en el registro.", colour: COR.aviso }));
  }

  if (!ctx.serverId) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Fora de um servidor",
        description: "O RPG funciona dentro de um servidor — e o seu personagem é o mesmo em todos.", colour: COR.erro },
      { title: "❌ Outside a server",
        description: "The RPG works inside a server — and your character is the same in all of them.", colour: COR.erro },
      { title: "❌ Fuera de un servidor",
        description: "El RPG funciona dentro de un servidor — y tu personaje es el mismo en todos.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();
  const eu = message.authorId;

  // (28 out 2026) duelo entre jogadores, com aposta (duelo.js); os desafios
  // vencidos devolvem a aposta a cada &game
  try { DU.expirar(); } catch (e) { console.error("[DUELO] expirar:", e?.message ?? e); }
  if (DU.SUBS.includes(sub)) return DU.cmdDuelo(message, args, ctx, { sendEmbed, en });

  // contratos, bicos, especiais, dungeons, chefes, co-op e história (aventura.js)
  if (AV.SUBS.includes(sub)) {
    const r = await AV.cmdAventura(message, args, ctx, { sendEmbed, en });
    if (r !== null) return r;
  }

  // ── criar ──
  if (["criar", "novo", "start", "começar", "comecar"].includes(sub)) {
    if (db.getPersonagem(serverId, eu)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você já tem personagem",
          description: `Veja com \`${citarInterno("game", P)}\`. Para recomeçar do zero: \`${citarInterno("game.apagar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 You already have a character",
          description: `See it with \`${citarInterno("game", P)}\`. To start over: \`${citarInterno("game.apagar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 Ya tienes personaje",
          description: `Míralo con \`${citar("game", "es", P)}\`. Para empezar de cero: \`${citar("game.apagar", "es", P)}\`.`, colour: COR.aviso }));
    }
    const nome = nomeDePersonagem(args.slice(1).join(" "));
    let p = db.criarPersonagem(serverId, eu, nome);
    darKitInicial(serverId, eu);
    p = db.getPersonagem(serverId, eu);
    return sendEmbed(message.channel, tr(ctx, {
      title: "🎉 Personagem criado",
      description: [
        `**${nome}** entrou no mundo.`,
        "",
        montarFicha(p, P, serverId, eu, lang),
        "",
        `Comece escolhendo uma classe: \`${citarInterno("game.classe", P)}\` — ou distribua à mão: \`${citarInterno("game.pontos", P)} forca 1\``,
      ].join("\n"), colour: COR.sucesso }, {
      title: "🎉 Character created",
      description: [
        `**${nome}** entered the world.`,
        "",
        montarFicha(p, P, serverId, eu, lang),
        "",
        `Start by picking a class: \`${citarInterno("game.classe", P)}\` — or spend points by hand: \`${citarInterno("game.pontos", P)} strength 1\``,
      ].join("\n"), colour: COR.sucesso,
    }, {
      title: "🎉 Personaje creado",
      description: [
        `**${nome}** entró en el mundo.`,
        "",
        montarFicha(p, P, serverId, eu, lang, L),
        "",
        `Empieza eligiendo una clase: \`${citar("game.classe", "es", P)}\` — o reparte a mano: \`${citar("game.pontos", "es", P)} strength 1\``,
      ].join("\n"), colour: COR.sucesso }));
  }

  // ── apagar ──
  // ("resetar pontos" é o respec, mais abaixo — não apaga o personagem)
  if (["apagar", "deletar", "resetar"].includes(sub) && !["pontos", "points", "atributos"].includes(String(args[1] ?? "").toLowerCase())) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 No tienes personaje",
          description: `Crea uno con \`${citar("game.criar", "es", P)}\`.`, colour: COR.aviso }));
    }
    if (!["confirmar", "confirm"].includes(args[1]?.toLowerCase())) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "⚠️ Isso apaga tudo",
        description: [
          `**${p.nome}** — nível ${p.nivel} — será perdido para sempre.`,
          "",
          `Se tem certeza: \`${citarInterno("game.apagar.confirmar", P)}\``,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "⚠️ This erases everything",
        description: [
          `**${p.nome}** — level ${p.nivel} — will be lost forever.`,
          "",
          `If you're sure: \`${citarInterno("game.apagar.confirmar", P)}\``,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "⚠️ Esto lo borra todo",
        description: [
          `**${p.nome}** — nivel ${p.nivel} — se perderá para siempre.`,
          "",
          `Si estás seguro: \`${citar("game.apagar.confirmar", "es", P)}\``,
        ].join("\n"), colour: COR.aviso,
      }));
    }
    db.apagarPersonagem(serverId, eu);
    db.limparMagias(serverId, eu);   // o grimório vai junto: recomeçar é recomeçar
    // as esperas (chefe 24 h, especial) e as recompensas únicas ficam: são por PESSOA,
    // não por personagem — apagar e criar não pode pular a espera do chefe
    return sendEmbed(message.channel, tr(ctx,
      { title: "🗑️ Personagem apagado",
        description: `Crie outro quando quiser com \`${citarInterno("game.criar", P)}\`.`, colour: COR.mod },
      { title: "🗑️ Character deleted",
        description: `Create another whenever you like with \`${citarInterno("game.criar", P)}\`.`, colour: COR.mod },
      { title: "🗑️ Personaje borrado",
        description: `Crea otro cuando quieras con \`${citar("game.criar", "es", P)}\`.`, colour: COR.mod }));
  }

  // ── pontos ──
  if (["pontos", "ponto", "distribuir", "upar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 No tienes personaje",
          description: `Crea uno con \`${citar("game.criar", "es", P)}\`.`, colour: COR.aviso }));
    }

    const atributo = acharAtributo(args[1]);
    if (!atributo) {
      const lista = Object.values(ATRIB).map((a) => `${a.emoji} ${a.rotulo}`).join(" · ");
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Qual atributo?",
        description: [
          `\`${citarInterno("game.pontos", P)} <atributo> [quantos]\``,
          "",
          lista,
          "",
          `Ex.: \`${citarInterno("game.pontos", P)} int 3\` · aceito abreviações (for, des, res, agi, int, sor…).`,
        ].join("\n"), colour: COR.erro,
      }, {
        title: "❌ Which attribute?",
        description: [
          `\`${citarInterno("game.pontos", P)} <attribute> [how many]\``,
          "",
          lista,
          "",
          `E.g.: \`${citarInterno("game.pontos", P)} int 3\` · I accept abbreviations (for, des, res, agi, int, sor…).`,
        ].join("\n"), colour: COR.erro,
      }, {
        title: "❌ ¿Qué atributo?",
        description: [
          `\`${citar("game.pontos", "es", P)} <atributo> [cuántos]\``,
          "",
          Object.values(ATRIB).map((a) => `${a.emoji} ${a.rotuloEN}`).join(" · "),   // (os mesmos rótulos da ficha)
          "",
          `Ej.: \`${citar("game.pontos", "es", P)} int 3\` · acepto abreviaturas (for, des, res, agi, int, sor…).`,
        ].join("\n"), colour: COR.erro,
      }));
    }

    const disponiveis = Math.floor(p.pontos ?? 0);
    const pedido = args[2] ? parseInt(args[2], 10) : 1;
    if (!Number.isFinite(pedido) || pedido < 1) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Quantidade inválida",
          description: `Use um número: \`${citarInterno("game.pontos", P)} ${args[1]} 2\``, colour: COR.erro },
        { title: "❌ Invalid amount",
          description: `Use a number: \`${citarInterno("game.pontos", P)} ${args[1]} 2\``, colour: COR.erro },
        { title: "❌ Cantidad no válida",
          description: `Usa un número: \`${citar("game.pontos", "es", P)} ${args[1]} 2\``, colour: COR.erro }));
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
      }, {
        title: "🔸 Sin puntos libres",
        description: `Sube de nivel para ganar puntos. Ganas **${pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}** por nivel.`,
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
    if (usar < pedido) linhas.push(tr(ctx, `_Você pediu ${pedido}, mas só tinha ${disponiveis}._`, `_You asked for ${pedido}, but only had ${disponiveis}._`, `_Pediste ${pedido}, pero solo tenías ${disponiveis}._`));
    if (atributo === "inteligencia" || atributo === "sorte") {
      linhas.push("", tr(ctx,
        `_Ganho por nível agora: **${pontosPorNivel(atualizado.inteligencia, atualizado.sorte).toFixed(2)}** ponto(s)._`,
        `_Gain per level now: **${pontosPorNivel(atualizado.inteligencia, atualizado.sorte).toFixed(2)}** point(s)._`,
        `_Ganancia por nivel ahora: **${pontosPorNivel(atualizado.inteligencia, atualizado.sorte).toFixed(2)}** punto(s)._`));
    }
    linhas.push("", tr(ctx, `Restam **${Math.floor(atualizado.pontos)}** ponto(s).`, `**${Math.floor(atualizado.pontos)}** point(s) left.`, `Quedan **${Math.floor(atualizado.pontos)}** punto(s).`));
    return sendEmbed(message.channel, {
      title: tr(ctx, "📈 Atributo aumentado", "📈 Attribute increased", "📈 Atributo aumentado"),
      description: linhas.join("\n"), colour: COR.sucesso });
  }

  // ── itens / inventário ──
  if (["itens", "inventario", "inventário", "mochila", "bag", "items", "inventory"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 No tienes personaje",
          description: `Crea uno con \`${citar("game.criar", "es", P)}\`.`, colour: COR.aviso }));
    }
    const inv = db.getInventario(serverId, eu);
    if (!inv.length) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "🎒 Mochila vazia",
        description: `Você ainda não tem itens. Eles vêm de missões e do mercado.\n\n_Veja o que existe no jogo com \`${citarInterno("game.catalogo", P)}\`._`,
        colour: COR.info,
      }, {
        title: "🎒 Empty bag",
        description: `You don't have items yet. They come from missions and the market.\n\n_See what exists in the game with \`${citarInterno("game.catalogo", P)}\`._`,
        colour: COR.info,
      }, {
        title: "🎒 Mochila vacía",
        description: `Todavía no tienes objetos. Salen de las misiones y del mercado.\n\n_Mira lo que existe en el juego con \`${citar("game.catalogo", "es", P)}\`._`,
        colour: COR.info,
      }));
    }
    // v4: separada por tipo (a vaga onde vai), do mais raro para o mais comum;
    // &game itens <tipo|raridade> filtra
    const fInv = lerFiltroDeItens(args.slice(1).join(" "));
    const ordemRar = (r) => -R.ORDEM.indexOf(r);
    const filtrada = inv.filter((i) => (!fInv.raridade || i.raridade === fInv.raridade) && (!fInv.tipos || fInv.tipos.includes(tipoDoItem(i))))
      .sort((a, b) => ordemRar(a.raridade) - ordemRar(b.raridade) || a.nome.localeCompare(b.nome));
    const eq = db.getEquipado(serverId, eu);
    const linhas = [];
    for (const [t, lista] of agruparPorTipo(filtrada)) {
      linhas.push("", `${TIPOS_ITEM[t].emoji} **${rotuloTipo(t, rotuloLang(ctx, en))}** — ${lista.reduce((n, i) => n + (i.quantidade ?? 1), 0)}`);
      for (const i of lista) {
        const marca = db.SLOTS.some((s) => eq[s]?.id === i.id) ? " ✅" : "";
        const qtd = i.quantidade > 1 ? ` ×${i.quantidade}` : "";
        linhas.push(`   ${RARIDADE_INFO[i.raridade]?.emoji ?? ""} **${i.nome}**${qtd}${marca} — ${descreverItem(i, rotuloLang(ctx, en))}`);
      }
    }
    linhas.shift();
    if (!filtrada.length) linhas.push(tr(ctx, "_Nada com esse filtro na sua mochila._", "_Nothing with that filter in your bag._", "_Ningún objeto con ese filtro en tu mochila._"));
    else if (!fInv.raridade && !fInv.tipos && filtrada.length > 12) linhas.unshift(tr(ctx, `_Só um tipo: \`${citarInterno("game.itens", P)} fogo\` · \`${citarInterno("game.itens", P)} bioware\` · \`${citarInterno("game.itens", P)} epico\`_`, `_Just one type: \`${citarInterno("game.itens", P)} firearms\` · \`${citarInterno("game.itens", P)} bioware\` · \`${citarInterno("game.itens", P)} epic\`_`, `_Solo un tipo: \`${citar("game.itens", "es", P)} firearms\` · \`${citar("game.itens", "es", P)} bioware\` · \`${citar("game.itens", "es", P)} epic\`_`), "");
    return enviarLista(sendEmbed, message.channel, {
      titulo: tr(ctx, "🎒 Sua mochila", "🎒 Your bag", "🎒 Tu mochila"),
      linhas,
      rodape: tr(ctx,
        `_✅ = equipado · \`${citarInterno("game.equipar", P)} <item>\` · contratos e pergaminhos: \`${citarInterno("game.usar", P)} <item>\` · ou deixe o \`${citarInterno("game.evoluir", P)}\` escolher._`,
        `_✅ = equipped · \`${citarInterno("game.equipar", P)} <item>\` · contracts and scrolls: \`${citarInterno("game.usar", P)} <item>\` · or let \`${citarInterno("game.evoluir", P)}\` pick._`,
        `_✅ = equipado · \`${citar("game.equipar", "es", P)} <objeto>\` · contratos y pergaminos: \`${citar("game.usar", "es", P)} <objeto>\` · o deja que \`${citar("game.evoluir", "es", P)}\` elija._`),
      colour: COR.info,
    });
  }

  // ── equipar / usar ──
  // v4: duas mãos (D14), escudo e foco na secundária, implantes nas vagas da
  // família (D25: implante é item normal), contrato vira companheiro e
  // pergaminho vira magia (ESPECIAIS §1.2).
  if (["equipar", "usar", "vestir", "use", "equip"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 No tienes personaje",
          description: `Crea uno con \`${citar("game.criar", "es", P)}\`.`, colour: COR.aviso }));
    }
    const VAGAS = { mao1: "mao1", "mão1": "mao1", principal: "mao1", main: "mao1", hand1: "mao1", mao2: "mao2", "mão2": "mao2", secundaria: "mao2", "secundária": "mao2", off: "mao2", hand2: "mao2" };
    const pedidoTxt = args.slice(1).map((a) => a.toLowerCase()).find((a) => VAGAS[a] || /^(acessorio|bio|ciber)[123]$/.test(a));
    const slotPedido = pedidoTxt ? (VAGAS[pedidoTxt] ?? pedidoTxt) : null;
    const busca = args.slice(1).filter((a) => a.toLowerCase() !== pedidoTxt).join(" ").trim();
    if (!busca) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Equipar o quê?",
        description: `\`${citarInterno("game.equipar", P)} <nome do item> [mao1|mao2]\`\n\nVeja o que você tem com \`${citarInterno("game.itens", P)}\`.`,
        colour: COR.erro,
      }, {
        title: "❌ Equip what?",
        description: `\`${citarInterno("game.equipar", P)} <item name> [mao1|mao2]\`\n\nSee what you have with \`${citarInterno("game.itens", P)}\`.`,
        colour: COR.erro,
      }, {
        title: "❌ ¿Equipar qué?",
        description: `\`${citar("game.equipar", "es", P)} <nombre del objeto> [mao1|mao2]\`\n\nMira lo que tienes con \`${citar("game.itens", "es", P)}\`.`,
        colour: COR.erro,
      }));
    }
    const item = db.acharItemPorNome(busca);
    if (!item) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Item desconhecido", "❌ Unknown item", "❌ Objeto desconocido"),
        description: tr(ctx, `Não achei nenhum item chamado **${busca}**.`, `I couldn't find any item called **${busca}**.`, `No encontré ningún objeto llamado **${busca}**.`), colour: COR.erro });
    }
    if (!db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Você não tem esse item", "❌ You don't have that item", "❌ No tienes ese objeto"),
        description: tr(ctx, `**${item.nome}** não está na sua mochila.`, `**${item.nome}** isn't in your bag.`, `**${item.nome}** no está en tu mochila.`), colour: COR.erro });
    }
    // contrato → companheiro (no nível do dono; um de cada único — D17)
    if (item.dados?.tipo === "contrato") {
      const cat = db.getFollowerCatalogo(item.dados.companheiro);
      if (!cat) return sendEmbed(message.channel, { title: "❌", description: tr(ctx, "Esse contrato não aponta para ninguém.", "This contract points to nobody.", "Este contrato no apunta a nadie."), colour: COR.erro });
      if (db.listarFollowersDe(serverId, eu).some((f) => f.catalogoId === cat.id) || db.listarCapturados(serverId).some((f) => f.catalogoId === cat.id && f.donoOriginal === eu)) {
        return sendEmbed(message.channel, { title: tr(ctx, "✦ Você já tem", "✦ You already have them", "✦ Ya lo tienes"), colour: COR.aviso,
          description: tr(ctx, `**${cat.nome}** é único — um por jogador. O contrato ainda vale no mercado: \`${citarInterno("game.mercado.vender", P)} ${item.nome} <preço>\`.`,
            `**${cat.nome}** is unique — one per player. The contract can still go to the market: \`${citarInterno("game.mercado.vender", P)} ${item.nome} <price>\`.`,
            `**${cat.nome}** es único — uno por jugador. El contrato todavía se puede vender en el mercado: \`${citar("game.mercado.vender", "es", P)} ${item.nome} <precio>\`.`) });
      }
      db.tirarItem(serverId, eu, item.id, 1);
      db.recrutarFollower(serverId, eu, cat.id, p.nivel);
      return sendEmbed(message.channel, { title: tr(ctx, "📜 Contrato assinado", "📜 Contract signed", "📜 Contrato firmado"), colour: COR.sucesso,
        description: tr(ctx, `**${cat.nome}** agora está com você, no seu nível (${p.nivel}). Leve na party: \`${citarInterno("game.follower.levar", P)} ${cat.nome}\`.`,
          `**${cat.nome}** is with you now, at your level (${p.nivel}). Take them along: \`${citarInterno("game.follower.levar", P)} ${cat.nome}\`.`,
          `**${cat.nome}** ahora está contigo, en tu nivel (${p.nivel}). Llévalo en el grupo: \`${citar("game.follower.levar", "es", P)} ${cat.nome}\`.`) });
    }
    // pergaminho → magia no grimório
    if (item.dados?.tipo === "pergaminho") {
      const m = MAG.getMagia(item.dados.magia);
      if (!m) return sendEmbed(message.channel, { title: "❌", description: tr(ctx, "Esse pergaminho está em branco.", "This scroll is blank.", "Este pergamino está en blanco."), colour: COR.erro });
      if (db.listarMagias(serverId, eu).some((x) => x.magiaId === m.id)) return sendEmbed(message.channel, { title: tr(ctx, "📖 Você já conhece", "📖 Already known", "📖 Ya lo conoces"), colour: COR.aviso,
        description: tr(ctx, `**${m.nome}** já está no seu grimório — o pergaminho ainda vale para outro jogador.`, `**${m.nomeEN ?? m.nome}** is already in your grimoire — the scroll can still be sold to another player.`, `**${m.nomeEN ?? m.nome}** ya está en tu grimorio — el pergamino todavía se le puede vender a otro jugador.`) });
      db.tirarItem(serverId, eu, item.id, 1);
      db.aprenderMagia(serverId, eu, m.id);
      return sendEmbed(message.channel, { title: tr(ctx, "📖 Magia aprendida", "📖 Spell learned", "📖 Hechizo aprendido"), colour: COR.sucesso,
        description: tr(ctx, `**${m.nome}** — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}% · pede Inteligência ${m.req}.`, `**${m.nomeEN ?? m.nome}** — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}% · needs Intelligence ${m.req}.`, `**${m.nomeEN ?? m.nome}** — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}% · pide Inteligencia ${m.req}.`) });
    }
    if (!["mao", "capacete", "armadura", "acessorio", "implante"].includes(item.slot)) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Isso não se equipa", "❌ Can't equip that", "❌ Eso no se equipa"), colour: COR.erro, description: descreverItem(item, rotuloLang(ctx, en)) });
    }
    const eq = db.getEquipado(serverId, eu);
    const slot = slotParaEquipar(eq, item, slotPedido);
    if (item.slot === "mao" && !["mao1", "mao2"].includes(slot)) return sendEmbed(message.channel, { title: "❌", colour: COR.erro, description: "`mao1` · `mao2`" });
    // o mesmo item em duas vagas pede duas unidades
    const usados = db.SLOTS.filter((s) => s !== slot && eq[s]?.id === item.id).length;
    const tenho = db.getInventario(serverId, eu).find((x) => x.id === item.id)?.quantidade ?? 0;
    if (usados >= tenho) {
      const jaEm = db.SLOTS.find((s) => eq[s]?.id === item.id);
      return sendEmbed(message.channel, { title: tr(ctx, "✅ Já está equipado", "✅ Already equipped", "✅ Ya está equipado"),
        description: tr(ctx, `**${item.nome}** já está em ${rotuloSlot(jaEm, rotuloLang(ctx, en))} (você tem ${tenho}).`, `**${item.nome}** is already in ${rotuloSlot(jaEm, rotuloLang(ctx, en))} (you have ${tenho}).`, `**${item.nome}** ya está en ${rotuloSlot(jaEm, rotuloLang(ctx, en))} (tienes ${tenho}).`), colour: COR.aviso });
    }
    const anterior = eq[slot] ?? null;
    db.equipar(serverId, eu, slot, item.id);
    const depois = db.getEquipado(serverId, eu);
    const { maos } = CB.maosDe(depois);
    const linhas = [`${SLOT_INFO[slot]?.emoji ?? "•"} **${rotuloSlot(slot, rotuloLang(ctx, en))}**: ${item.nome}`, descreverItem(item, rotuloLang(ctx, en))];
    if (item.slot === "mao" && CB.ehArma(item)) {
      const st = CB.statsItem(item), m = maos.find((x) => x.item.id === item.id);
      const req = m?.modo === "2m" ? st.reqFor2 : st.reqFor1, a = CB.atributosBase(p, depois);
      if (a.forca * (m?.modo === "2m" ? 1.5 : 1) < req || a.destreza < st.reqDes || a.inteligencia < st.reqInt)
        linhas.push(tr(ctx, "⚠️ _Abaixo dos requisitos: a arma rende 40% até você chegar lá._", "⚠️ _Below the requirements: the weapon deals 40% until you get there._", "⚠️ _Por debajo de los requisitos: el arma rinde un 40% hasta que llegues._"));
      linhas.push(maos.length === 1 ? tr(ctx, `_Arma única${m?.modo === "2m" ? ", nas duas mãos" : ""}: +80% no dano dela._`, `_A single weapon${m?.modo === "2m" ? ", in both hands" : ""}: +80% on its damage._`, `_Arma única${m?.modo === "2m" ? ", a dos manos" : ""}: +80% a su daño._`)
        : tr(ctx, "_Duas armas: sem o bônus de arma única, mas podem misturar tipos de dano (sinergia)._", "_Two weapons: no single-weapon bonus, but they can mix damage types (synergy)._", "_Dos armas: sin el bono de arma única, pero pueden mezclar tipos de daño (sinergia)._"));
    }
    if (item.slot === "implante") {
      const st = CB.statsItem(item), a = CB.atributosBase(p, depois);
      if ((a[st.reqAtr] ?? 0) < st.req) linhas.push(tr(ctx, `⚠️ _Abaixo do requisito (${st.reqAtr === "vida" ? "Vida" : "Resistência"} ${st.req}): rende 40%._`, `⚠️ _Below the requirement (${st.reqAtr === "vida" ? "Health" : "Resistance"} ${st.req}): it works at 40%._`, `⚠️ _Por debajo del requisito (${st.reqAtr === "vida" ? "Vida" : "Resistencia"} ${st.req}): rinde un 40%._`));
    }
    if (anterior) linhas.push("", tr(ctx, `_${anterior.nome} voltou para a mochila._`, `_${anterior.nome} went back to the bag._`, `_${anterior.nome} volvió a la mochila._`));
    return sendEmbed(message.channel, { title: tr(ctx, "⚔️ Equipado", "⚔️ Equipped", "⚔️ Equipado"),
      description: linhas.join("\n"), colour: COR.sucesso });
  }

  // ── desequipar ──
  if (["desequipar", "tirar", "remover"].includes(sub)) {
    const alvo = (args[1] ?? "").toLowerCase();
    const ALIAS = { arma: "mao1", mao: "mao1", "mão": "mao1", principal: "mao1", hand1: "mao1", main: "mao1", secundaria: "mao2", "secundária": "mao2", escudo: "mao2", hand2: "mao2", cabeca: "capacete", "cabeça": "capacete", elmo: "capacete", corpo: "armadura" };
    const eq = db.getEquipado(serverId, eu);
    let slot = db.SLOTS.includes(alvo) ? alvo : (args.length === 2 ? ALIAS[alvo] : null) ?? null;
    if (!slot && alvo) {
      const item = db.acharItemPorNome(args.slice(1).join(" "));
      if (item) slot = db.SLOTS.find((s) => eq[s]?.id === item.id) ?? null;
    }
    if (!slot) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Tirar o quê?", "❌ Unequip what?", "❌ ¿Quitar qué?"),
        description: tr(ctx, [`\`${citarInterno("game.desequipar", P)} <vaga ou item>\``, "", `**Vagas:** ${db.SLOTS.join(", ")}`],
          [`\`${citarInterno("game.desequipar", P)} <slot or item>\``, "", `**Slots:** ${db.SLOTS.join(", ")}`],
          [`\`${citar("game.desequipar", "es", P)} <espacio u objeto>\``, "", `**Espacios:** ${db.SLOTS.join(", ")}`]).join("\n"), colour: COR.erro });
    }
    if (!eq[slot]) {
      return sendEmbed(message.channel, { title: tr(ctx, "🔸 Nada nessa vaga", "🔸 Nothing in that slot", "🔸 Ese espacio está vacío"),
        description: tr(ctx, `Não há nada equipado em **${rotuloSlot(slot, rotuloLang(ctx, en))}**.`, `Nothing is equipped in **${rotuloSlot(slot, rotuloLang(ctx, en))}**.`, `No tienes ningún objeto equipado en **${rotuloSlot(slot, rotuloLang(ctx, en))}**.`), colour: COR.aviso });
    }
    const nome = eq[slot].nome;
    db.desequipar(serverId, eu, slot);
    return sendEmbed(message.channel, { title: tr(ctx, "🎒 Desequipado", "🎒 Unequipped", "🎒 Desequipado"),
      description: tr(ctx, `**${nome}** voltou para a mochila.`, `**${nome}** went back to the bag.`, `**${nome}** volvió a la mochila.`), colour: COR.mod });
  }

  if (["catalogo", "catálogo", "itens-jogo", "loja"].includes(sub)) {
    // v4: dentro da raridade, separado por tipo (corpo a corpo, fogo, mágica,
    // escudo, foco, cabeça, corpo, acessório, bioware, cyberware) — num lote
    // grande, primeiro o resumo por tipo; o tipo pedido lista inteiro.
    const filtro = args.slice(1).join(" ").trim();
    const f = lerFiltroDeItens(filtro);
    const todos = db.listarItens().filter((i) => !["contrato", "pergaminho"].includes(i.slot));
    const obras = [...new Set(todos.map((i) => i.obra).filter(Boolean))];
    const obraFiltro = f.resto ? obras.find((o) => semAcento(o).includes(semAcento(f.resto))) ?? null : null;
    const tiposEquip = Object.keys(TIPOS_ITEM).filter((t) => !["contrato", "pergaminho"].includes(t));
    const ajudaFiltros = [
      `**${tr(ctx, "Raridades", "Rarities", "Rarezas")}:** ${R.ORDEM.map((r) => rotuloRaridade(r, rotuloLang(ctx, en))).join(" · ")}`,
      `**${tr(ctx, "Tipos", "Types", "Tipos")}:** ${tiposEquip.map((t) => `${TIPOS_ITEM[t].emoji} \`${palavraTipo(t, en)}\``).join(" · ")} · \`${en ? "weapons" : "armas"}\` · \`${en ? "implants" : "implantes"}\``,
      obras.length ? `**${tr(ctx, "Obras", "Works", "Obras")}:** ${obras.join(" · ")}` : "",
      tr(ctx, `_Combine: \`${citarInterno("game.catalogo", P)} epico fogo\` · \`${citarInterno("game.catalogo", P)} bioware\`_`, `_Mix them: \`${citarInterno("game.catalogo", P)} epic firearms\` · \`${citarInterno("game.catalogo", P)} bioware\`_`, `_Combínalos: \`${citar("game.catalogo", "es", P)} epic firearms\` · \`${citar("game.catalogo", "es", P)} bioware\`_`),
    ];
    if (f.resto && !obraFiltro) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Filtro desconhecido", "❌ Unknown filter", "❌ Filtro desconocido"),
        description: [tr(ctx, `Não conheço **${f.resto}**.`, `I don't know **${f.resto}**.`, `No conozco **${f.resto}**.`), "", ...ajudaFiltros].filter(Boolean).join("\n"), colour: COR.erro });
    }
    // dentro do tipo: dificuldade, depois o porte (leve → colossal), depois o nome
    const PORTE_ORDEM = { leve: 0, medio: 1, pesado: 2, colossal: 3 };
    const porte = (i) => PORTE_ORDEM[i.dados?.arma?.porte] ?? 9;
    const lista = todos.filter((i) => (!f.raridade || i.raridade === f.raridade) && (!f.tipos || f.tipos.includes(tipoDoItem(i))) && (!obraFiltro || i.obra === obraFiltro))
      .sort((a, b) => (a.dif ?? 0) - (b.dif ?? 0) || porte(a) - porte(b) || a.nome.localeCompare(b.nome));
    // a obra no comando sugerido: a primeira palavra que a identifica ("warhammer", "tokyo", "elder")
    const palavraObra = obraFiltro ? semAcento(obraFiltro).split(/[^a-z0-9]+/).find((w) => w.length >= 4 && w !== "the") ?? semAcento(f.resto) : null;
    const rodape = tr(ctx, `_♾️ = estoque infinito · ✦ único · preço e detalhes:_ \`${citarInterno("game.item", P)} <nome>\``, `_♾️ = infinite stock · ✦ unique · price and details:_ \`${citarInterno("game.item", P)} <name>\``, `_♾️ = stock infinito · ✦ único · precio y detalles:_ \`${citar("game.item", "es", P)} <nombre>\``);
    const contagem = (itens) => agruparPorTipo(itens).map(([t, l]) => `${TIPOS_ITEM[t].emoji}${l.length}`).join(" ");

    // Sem filtro: uma linha por raridade, com a contagem por tipo
    if (!filtro) {
      const linhas = [tr(ctx, `**${lista.length}** itens no jogo — 10 raridades, uma por dificuldade:`, `**${lista.length}** items in the game — 10 rarities, one per difficulty:`, `**${lista.length}** objetos en el juego — 10 rarezas, una por dificultad:`), ""];
      for (const r of R.ORDEM) {
        const itens = lista.filter((i) => i.raridade === r);
        if (!itens.length) continue;
        linhas.push(`${RARIDADE_INFO[r]?.emoji} **${rotuloRaridade(r, rotuloLang(ctx, en))}** _(${tr(ctx, "dificuldade", "difficulty", "dificultad")} ${R.difDaRaridade(r)})_ — ${contagem(itens)} · \`${citarInterno("game.catalogo", P)} ${palavraRaridade(r, en)}\``);
      }
      linhas.push("", ...ajudaFiltros.filter(Boolean), "", tr(ctx, `_♾️ = estoque infinito · ✦ = único (o NPC não vende)_`, `_♾️ = infinite stock · ✦ = unique (never sold by the NPC)_`, `_♾️ = stock infinito · ✦ = único (el NPC no lo vende)_`));
      return sendEmbed(message.channel, { title: tr(ctx, "📖 Itens do jogo", "📖 Game items", "📖 Objetos del juego"), description: linhas.join("\n").slice(0, 3900), colour: COR.info });
    }
    if (!lista.length) {
      return sendEmbed(message.channel, { title: tr(ctx, "📖 Nada aqui", "📖 Nothing here", "📖 Sin resultados"), colour: COR.aviso,
        description: [tr(ctx, "Nenhum item com esse filtro.", "No item matches that filter.", "Ningún objeto con ese filtro."), "", ...ajudaFiltros].filter(Boolean).join("\n") });
    }
    const titulo = [f.raridade ? `${RARIDADE_INFO[f.raridade].emoji} ${rotuloRaridade(f.raridade, rotuloLang(ctx, en))}` : null,
      f.tipos ? (f.tipos.length === 1 ? `${TIPOS_ITEM[f.tipos[0]].emoji} ${rotuloTipo(f.tipos[0], rotuloLang(ctx, en))}` : f.tipos.length === 5 ? tr(ctx, "⚔️ Armas", "⚔️ Weapons", "⚔️ Armas") : tr(ctx, "🧬 Implantes", "🧬 Implants", "🧬 Implantes")) : null,
      obraFiltro ? `📚 ${obraFiltro}` : null].filter(Boolean).join(" · ");

    // Lote grande sem tipo escolhido: o resumo por tipo, com o comando de cada um
    if (!f.tipos && lista.length > 20) {
      const L = [tr(ctx, `**${lista.length}** itens — escolha um tipo:`, `**${lista.length}** items — pick a type:`, `**${lista.length}** objetos — elige un tipo:`), ""];
      for (const [t, l] of agruparPorTipo(lista)) {
        const cmd = [P + "game catalogo", f.raridade && palavraRaridade(f.raridade, en), palavraTipo(t, en), palavraObra].filter(Boolean).join(" ");
        const amostra = l.slice(0, 3).map((i) => i.nome).join(", ") + (l.length > 3 ? "…" : "");
        L.push(`${TIPOS_ITEM[t].emoji} **${rotuloTipo(t, rotuloLang(ctx, en))}** — ${l.length} · \`${cmd}\``, `   _${amostra}_`);
      }
      return enviarLista(sendEmbed, message.channel, { titulo: `${titulo} — ${lista.length}`, linhas: L, rodape, colour: COR.info });
    }
    // Tipo escolhido sem raridade, e muitos: o resumo por raridade
    if (f.tipos && !f.raridade && lista.length > 25) {
      const L = [tr(ctx, `**${lista.length}** itens — escolha a raridade:`, `**${lista.length}** items — pick a rarity:`, `**${lista.length}** objetos — elige la rareza:`), ""];
      for (const r of R.ORDEM) {
        const l = lista.filter((i) => i.raridade === r);
        if (!l.length) continue;
        L.push(`${RARIDADE_INFO[r].emoji} **${rotuloRaridade(r, rotuloLang(ctx, en))}** — ${contagem(l)} · \`${[P + "game catalogo", palavraRaridade(r, en), f.tipos.length === 1 ? palavraTipo(f.tipos[0], en) : f.tipos.length === 5 ? (en ? "weapons" : "armas") : (en ? "implants" : "implantes"), palavraObra].filter(Boolean).join(" ")}\``);
      }
      return enviarLista(sendEmbed, message.channel, { titulo: `${titulo} — ${lista.length}`, linhas: L, rodape, colour: COR.info });
    }
    // A lista, separada por tipo
    const L = [];
    for (const [t, l] of agruparPorTipo(lista)) {
      L.push("", `${TIPOS_ITEM[t].emoji} **${rotuloTipo(t, rotuloLang(ctx, en))}** — ${l.length}`);
      for (const i of l) L.push(`${f.raridade ? "" : `${RARIDADE_INFO[i.raridade]?.emoji ?? ""} `}**${i.nome}**${i.infinito ? " ♾️" : ""}${i.especial ? " ✦" : ""}${i.obra && !obraFiltro ? ` _(${i.obra})_` : ""}\n   ${descreverItem(i, rotuloLang(ctx, en))}`);
    }
    return enviarLista(sendEmbed, message.channel, { titulo: `${titulo} — ${lista.length}`, linhas: L.slice(1), rodape, colour: COR.info });
  }

  if (["admin", "debug"].includes(sub)) {
    if (!ctx.ehSuperAdmin?.(eu)) {
      return sendEmbed(message.channel, { title: tr(ctx, "🚫 Comando restrito", "🚫 Restricted command", "🚫 Comando restringido"),
        description: tr(ctx, "Só o dono do bot usa o modo admin.", "Only the bot owner can use admin mode.", "Solo el dueño del bot puede usar el modo admin."), colour: COR.erro });
    }
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2);
    const alvoId = idEscrito(resto.join(" ")) ?? message.mentionIds?.[0] ?? eu;
    const quem = alvoId === eu ? "você" : `<@${alvoId}>`;

    if (!acao || acao === "ajuda") {
      const esP = (ref) => citar(ref, "es", P);
      return sendEmbed(message.channel, { title: tr(ctx, "🔧 Admin do RPG", "🔧 RPG admin", "🔧 Admin del RPG"),
        description: tr(ctx, [
          `\`${citarInterno("game.admin.dar", P)} <qtd> [@pessoa]\` — credita moeda`,
          `\`${citarInterno("game.admin.item", P)} <nome> [@pessoa]\` — dá um item`,
          `\`${citarInterno("game.admin.follower", P)} <nome> [nível] [@pessoa]\` — dá um companheiro`,
          `\`${citarInterno("game.admin.nivel", P)} <n> [@pessoa]\` — força o nível`,
          `\`${citarInterno("game.admin.pontos", P)} <n> [@pessoa]\` — dá pontos livres`,
          `\`${citarInterno("game.admin.energia", P)} [@pessoa]\` — enche a energia dos companheiros`,
          `\`${citarInterno("game.admin", P)} cooldown [@pessoa]\` — zera cooldown e recuperação`,
          `\`${citarInterno("game.admin.moeda", P)}\` — **as duas moedas do mundo** (renomear e ajustar)`,
          `\`${citarInterno("game.admin.teste", P)}\` — roda o jogo inteiro e diz o que funcionou`,
          `\`${citarInterno("game.admin.eco", P)}\` — números das moedas do jogo`,
          `\`${citarInterno("game.admin.simular", P)} <contrato|chefe> [n]\` — roda n vezes sem efeito`,
          `\`${citarInterno("game.admin.dungeon", P)} <qtd> [dungeon]\` — põe Ouro no tesouro de uma dungeon`,
          `\`${citarInterno("game.admin.imagem", P)} [id] [link]\` — imagens de personagens, chefes, dungeons (anexe a imagem)`,
          `\`${citarInterno("game.admin.reset", P)} <mundo|catalogo|tudo>\` — recomeça do zero`,
        ], [
          `\`${citarInterno("game.admin.dar", P)} <qty> [@person]\` — credits currency`,
          `\`${citarInterno("game.admin.item", P)} <name> [@person]\` — grants an item`,
          `\`${citarInterno("game.admin.follower", P)} <name> [level] [@person]\` — grants a companion`,
          `\`${citarInterno("game.admin.nivel", P)} <n> [@person]\` — forces the level`,
          `\`${citarInterno("game.admin.pontos", P)} <n> [@person]\` — grants free points`,
          `\`${citarInterno("game.admin.energia", P)} [@person]\` — refills companions' energy`,
          `\`${citarInterno("game.admin", P)} cooldown [@person]\` — clears cooldown and recovery`,
          `\`${citarInterno("game.admin.moeda", P)}\` — **the world's two currencies** (rename and tune)`,
          `\`${citarInterno("game.admin.teste", P)}\` — runs the whole game and reports what worked`,
          `\`${citarInterno("game.admin.eco", P)}\` — the game currencies' numbers`,
          `\`${citarInterno("game.admin.simular", P)} <contract|boss> [n]\` — runs it n times with no effect`,
          `\`${citarInterno("game.admin.dungeon", P)} <qty> [dungeon]\` — puts Gold in a dungeon's treasury`,
          `\`${citarInterno("game.admin.imagem", P)} [id] [link]\` — pictures for characters, bosses, dungeons (attach the image)`,
          `\`${citarInterno("game.admin.reset", P)} <mundo|catalogo|tudo>\` — starts over`,
        ], [
          `\`${esP("game.admin.dar")} <cantidad> [@usuario]\` — acredita moneda`,
          `\`${esP("game.admin.item")} <nombre> [@usuario]\` — da un objeto`,
          `\`${esP("game.admin.follower")} <nombre> [nivel] [@usuario]\` — da un compañero`,
          `\`${esP("game.admin.nivel")} <n> [@usuario]\` — fuerza el nivel`,
          `\`${esP("game.admin.pontos")} <n> [@usuario]\` — da puntos libres`,
          `\`${esP("game.admin.energia")} [@usuario]\` — llena la energía de los compañeros`,
          `\`${esP("game.admin")} cooldown [@usuario]\` — reinicia el cooldown y la recuperación`,
          `\`${esP("game.admin.moeda")}\` — **las dos monedas del mundo** (renombrar y ajustar)`,
          `\`${esP("game.admin.teste")}\` — prueba el juego entero y dice qué funcionó`,
          `\`${esP("game.admin.eco")}\` — los números de las monedas del juego`,
          `\`${esP("game.admin.simular")} <contrato|jefe> [n]\` — lo ejecuta n veces sin efecto`,
          `\`${esP("game.admin.dungeon")} <cantidad> [mazmorra]\` — pone Oro en el tesoro de una mazmorra`,
          `\`${esP("game.admin.imagem")} [id] [link]\` — imágenes de personajes, jefes, mazmorras (adjunta la imagen)`,
          `\`${esP("game.admin.reset")} <world|catalog|all>\` — empieza de cero`,
        ]).join("\n"), colour: COR.mod });
    }

    if (acao === "dar" || (acao === "moeda" && /^\d+$/.test(resto[0] ?? ""))) {
      const qtd = parseInt(resto[0], 10);
      if (!Number.isFinite(qtd)) return sendEmbed(message.channel, { title: tr(ctx, "❌ Quanto?", "❌ How much?", "❌ ¿Cuánto?"),
        description: tr(ctx, `\`${citarInterno("game.admin.dar", P)} 1000 [@pessoa]\``, `\`${citarInterno("game.admin.dar", P)} 1000 [@pessoa]\``, `\`${citar("game.admin.dar", "es", P)} 1000 [@usuario]\``), colour: COR.erro });
      const m = garantirMoeda(serverId);
      db.creditar(serverId, alvoId, m.id, qtd);
      return sendEmbed(message.channel, { title: tr(ctx, "🔧 Moeda creditada", "🔧 Currency credited", "🔧 Moneda acreditada"),
        description: tr(ctx, `${m.simbolo} ${fmt(qtd)} para ${quem} · saldo: ${fmt(db.getSaldo(serverId, alvoId, m.id))}`, `${m.simbolo} ${fmt(qtd)} to ${quem} · balance: ${fmt(db.getSaldo(serverId, alvoId, m.id))}`, `${m.simbolo} ${fmt(qtd)} para ${quem === "você" ? "ti" : quem} · saldo: ${fmt(db.getSaldo(serverId, alvoId, m.id))}`),
        colour: COR.mod });
    }

    // ── imagens (personagens, chefes, especiais, dungeons, únicos) ──
    if (["imagem", "imagens", "image", "images", "img"].includes(acao)) {
      const TIPO = tr(ctx, { companheiro: "👤 Companheiros", chefe: "👑 Chefes", especial: "✦ Especiais", dungeon: "🕳️ Dungeons", item: "📦 Itens únicos" },
        { companheiro: "👤 Companions", chefe: "👑 Bosses", especial: "✦ Specials", dungeon: "🕳️ Dungeons", item: "📦 Unique items" },
        Object.fromEntries(Object.entries({ companheiro: "👤 Compañeros", chefe: "👑 Jefes", especial: "✦ Especiales", dungeon: "🕳️ Mazmorras", item: "📦 Objetos únicos" }).map(([k, v]) => [k, trechoPronto(v)])));
      const anexo = IMG.anexoDe(message);
      const ultimo = resto[resto.length - 1] ?? "";
      const remover = /^(remover|apagar|tirar|remove|delete)$/i.test(ultimo);
      const link = /^https?:\/\//i.test(ultimo) ? ultimo : null;
      const nome = (link || remover ? resto.slice(0, -1) : resto).join(" ").trim();
      if (!nome) {
        const alvos = IMG.alvosDeImagem();
        const com = alvos.filter((a) => IMG.imagemDe(a.id));
        const L = [tr(ctx, `**${com.length} de ${alvos.length}** têm imagem.`, `**${com.length} of ${alvos.length}** have an image.`, `**${com.length} de ${alvos.length}** tienen imagen.`), "",
          tr(ctx, "Mande a imagem em qualquer canal do Stoat que o bot veja (melhor um privado — não apague a mensagem) e, na mesma mensagem:",
            "Upload the picture in any Stoat channel the bot can see (a private one is best — keep the message), and send in the same message:",
            "Sube la imagen en cualquier canal de Stoat que el bot vea (mejor uno privado — no borres el mensaje) y, en el mismo mensaje:"),
          tr(ctx, `\`${citarInterno("game.admin.imagem", P)} <id ou nome>\` _(com a imagem anexada)_`,
            `\`${citarInterno("game.admin.imagem", P)} <id or name>\` _(with the image attached)_`,
            `\`${citar("game.admin.imagem", "es", P)} <id o nombre>\` _(con la imagen adjunta)_`),
          tr(ctx, `ou \`${citarInterno("game.admin.imagem", P)} <id ou nome> <link>\` · \`… remover\` tira`, `or \`${citarInterno("game.admin.imagem", P)} <id or name> <link>\` · \`… remover\` takes it out`, `o \`${citar("game.admin.imagem", "es", P)} <id o nombre> <link>\` · \`… remover\` la quita`), ""];
        for (const tipo of Object.keys(TIPO)) {
          const falta = alvos.filter((a) => a.tipo === tipo && !IMG.imagemDe(a.id));
          if (!falta.length) continue;
          L.push(`**${TIPO[tipo]}** — ${tr(ctx, "faltam", "missing", "faltan")} ${falta.length}`);
          for (const a of falta) L.push(`   \`${a.id}\` ${en ? a.nomeEN ?? a.nome : a.nome}`);
        }
        return enviarLista(sendEmbed, message.channel, { titulo: tr(ctx, "🖼️ Imagens do RPG", "🖼️ RPG images", "🖼️ Imágenes del RPG"), linhas: L, colour: COR.mod });
      }
      const alvo = IMG.acharAlvo(nome);
      if (!alvo) return sendEmbed(message.channel, { title: tr(ctx, "❌ Não achei", "❌ Not found", "❌ No lo encontré"), colour: COR.erro,
        description: tr(ctx, `Nada chamado **${nome}**. \`${citarInterno("game.admin.imagem", P)}\` lista os ids.`, `Nothing called **${nome}**. \`${citarInterno("game.admin.imagem", P)}\` lists the ids.`, `Ningún resultado llamado **${nome}**. \`${citar("game.admin.imagem", "es", P)}\` lista los ids.`) });
      const rotulo = `**${en ? alvo.nomeEN ?? alvo.nome : alvo.nome}** (\`${alvo.id}\`)`;
      if (remover) {
        IMG.definirImagem(alvo.id, null);
        return sendEmbed(message.channel, { title: tr(ctx, "🖼️ Imagem removida", "🖼️ Image removed", "🖼️ Imagen quitada"), colour: COR.mod, description: rotulo });
      }
      const nova = anexo ?? link;
      if (!nova) {
        const atual = IMG.imagemDe(alvo.id);
        return sendEmbed(message.channel, { title: `🖼️ ${en ? alvo.nomeEN ?? alvo.nome : alvo.nome}`, colour: COR.mod,
          description: atual ? `${rotulo}\n${tr(ctx, "Esta é a imagem atual.", "This is the current image.", "Esta es la imagen actual.")}` : `${rotulo}\n${tr(ctx, "Ainda sem imagem — anexe uma ao comando.", "No image yet — attach one to the command.", "Todavía sin imagen — adjunta una al comando.")}`,
          ...(atual ? { imagem: atual } : {}) });
      }
      const v = validarUrlImagem(nova);
      if (!v.ok) return sendEmbed(message.channel, { title: tr(ctx, "❌ Imagem inválida", "❌ Invalid image", "❌ Imagen no válida"), colour: COR.erro, description: en ? v.motivoEn : v.motivo });
      IMG.definirImagem(alvo.id, v.url);
      return sendEmbed(message.channel, { title: tr(ctx, "🖼️ Imagem salva", "🖼️ Image saved", "🖼️ Imagen guardada"), colour: COR.sucesso, imagem: v.url,
        description: [rotulo, v.aviso ? `⚠️ ${en ? v.avisoEn : v.aviso}` : null,
          tr(ctx, "_Se ela não aparecer como capa aqui, o Stoat recusou — use uma imagem enviada no próprio Stoat._", "_If it doesn't show up as a cover above, Stoat refused it — use an image uploaded to Stoat itself._", "_Si no aparece como portada aquí, Stoat la rechazó — usa una imagen subida al propio Stoat._")].filter(Boolean).join("\n") });
    }

    if (acao === "item") {
      const nome = resto.filter((x) => !/^<[@%#]/.test(x)).join(" ");
      const item = db.acharItemPorNome(nome);
      if (!item) return sendEmbed(message.channel, { title: tr(ctx, "❌ Item desconhecido", "❌ Unknown item", "❌ Objeto desconocido"),
        description: tr(ctx, `Não achei **${nome}**.`, `I couldn't find **${nome}**.`, `No encontré **${nome}**.`), colour: COR.erro });
      db.darItem(serverId, alvoId, item.id);
      return sendEmbed(message.channel, { title: tr(ctx, "🔧 Item entregue", "🔧 Item delivered", "🔧 Objeto entregado"),
        description: tr(ctx, `**${item.nome}** para ${quem}`, `**${item.nome}** to ${quem}`, `**${item.nome}** para ${quem === "você" ? "ti" : quem}`), colour: COR.mod });
    }

    if (acao === "follower") {
      const argsLimpos = resto.filter((x) => !/^<[@%#]/.test(x));
      const nivel = /^\d+$/.test(argsLimpos[argsLimpos.length - 1] ?? "")
        ? parseInt(argsLimpos.pop(), 10) : 1;
      const cat = db.acharFollowerCatalogo(argsLimpos.join(" "));
      if (!cat) return sendEmbed(message.channel, { title: tr(ctx, "❌ Follower desconhecido", "❌ Unknown follower", "❌ Compañero desconocido"),
        description: tr(ctx, `Não achei **${argsLimpos.join(" ")}**.`, `I couldn't find **${argsLimpos.join(" ")}**.`, `No encontré **${argsLimpos.join(" ")}**.`), colour: COR.erro });
      db.recrutarFollower(serverId, alvoId, cat.id, db.getPersonagem(serverId, alvoId)?.nivel ?? nivel);
      return sendEmbed(message.channel, { title: tr(ctx, "🔧 Companheiro entregue", "🔧 Companion delivered", "🔧 Compañero entregado"),
        description: tr(ctx, `**${cat.nome}** (nv ${nivel}) para ${quem}`, `**${cat.nome}** (lv ${nivel}) to ${quem}`, `**${cat.nome}** (nv ${nivel}) para ${quem === "você" ? "ti" : quem}`), colour: COR.mod });
    }

    if (acao === "nivel" || acao === "pontos") {
      const n = parseInt(resto[0], 10);
      if (!Number.isFinite(n)) return sendEmbed(message.channel, { title: tr(ctx, "❌ Quanto?", "❌ How much?", "❌ ¿Cuánto?"),
        description: tr(ctx, `\`${citarInterno("game.admin", P)} ${acao} 10\``, `\`${citarInterno("game.admin", P)} ${acao} 10\``, `\`${citar(`game.admin.${acao}`, "es", P)} 10\``), colour: COR.erro });
      const alvo = db.getPersonagem(serverId, alvoId);
      if (!alvo) return sendEmbed(message.channel, { title: tr(ctx, "❌ Sem personagem", "❌ No character", "❌ Sin personaje"),
        description: tr(ctx, `${quem === "você" ? "Você" : quem} não tem personagem.`, `${quem === "você" ? "You" : quem} ${quem === "você" ? "don't" : "doesn't"} have a character.`, `${quem === "você" ? "No tienes" : `${quem} no tiene`} personaje.`), colour: COR.erro });
      db.salvarPersonagem(serverId, alvoId, acao === "nivel" ? { nivel: Math.max(1, n), xp: 0, progresso: 0 } : { pontos: (alvo.pontos ?? 0) + n });
      return sendEmbed(message.channel, { title: tr(ctx, "🔧 Ajustado", "🔧 Adjusted", "🔧 Ajustado"),
        description: tr(ctx, `${quem === "você" ? "Você" : quem}: ${acao} → ${n}`, `${quem === "você" ? "You" : quem}: ${acao} → ${n}`, `${quem === "você" ? "Tú" : quem}: ${acao === "nivel" ? "nivel" : "puntos"} → ${n}`), colour: COR.mod });
    }

    if (acao === "energia") {
      const meus = db.listarFollowersDe(serverId, alvoId);
      for (const f of meus) db.salvarFollower(f.id, { energia: 5, energiaEm: Date.now() });
      return sendEmbed(message.channel, { title: tr(ctx, "🔧 Energia cheia", "🔧 Energy full", "🔧 Energía llena"),
        description: tr(ctx, `${meus.length} companheiro(s) de ${quem}`, `${meus.length} companion(s) of ${quem}`, `${meus.length} compañero(s) ${quem === "você" ? "tuyo(s)" : `de ${quem}`}`), colour: COR.mod });
    }

    if (acao === "missao" || acao === "missão") {
      db.salvarPersonagem(serverId, alvoId, { ultimaMissao: 0, recuperandoAte: 0 });
      // reentra no próprio comando, agora sem cooldown
      db.limparEsperas(alvoId);
      return cmdGame(message, ["contrato", ...resto], ctx);
    }

    if (acao === "cooldown") {
      db.salvarPersonagem(serverId, alvoId, { ultimaMissao: 0, recuperandoAte: 0 });
      db.limparEsperas(alvoId);
      return sendEmbed(message.channel, { title: tr(ctx, "🔧 Cooldown zerado", "🔧 Cooldown cleared", "🔧 Cooldown reiniciado"),
        description: tr(ctx, `${quem === "você" ? "Você pode" : quem + " pode"} partir agora.`, `${quem === "você" ? "You can" : quem + " can"} set out now.`, `${quem === "você" ? "Puedes" : quem + " puede"} partir ya.`), colour: COR.mod });
    }

    if (acao === "dungeon") {
      const qtd = parseInt(resto[0], 10) || 0;
      const d = MISS.acharDungeon(resto.slice(1).filter((x) => !/^<[@%#]/.test(x)).join(" ")) ?? [...MISS.DUNGEONS.values()][0];
      const t = TS.renovar(d.id);
      db.salvarDungeon(d.id, { ouro: (t.ouro ?? 0) + qtd });
      const atual = db.getDungeon(d.id);
      return sendEmbed(message.channel, { title: tr(ctx, "🔧 Tesouro da dungeon", "🔧 Dungeon treasury", "🔧 Tesoro de la mazmorra"),
        description: tr(ctx, `**${d.nome}** agora tem 🪙${fmt(atual.ouro)} · 💎${fmt(atual.cristal)}`, `**${d.nome}** now holds 🪙${fmt(atual.ouro)} · 💎${fmt(atual.cristal)}`, `**${d.nome}** ahora tiene 🪙${fmt(atual.ouro)} · 💎${fmt(atual.cristal)}`),
        colour: COR.mod });
    }

    // ── teste geral: roda o jogo inteiro num personagem descartável ──
    if (["teste", "smoke", "testar"].includes(acao)) {
      await sendEmbed(message.channel, { title: tr(ctx, "🧪 Rodando o teste geral…", "🧪 Running the full test…", "🧪 Ejecutando la prueba general…"),
        description: tr(ctx, "Criando um personagem de teste e passando por tudo. Alguns segundos.", "Creating a test character and running through everything. A few seconds.", "Creando un personaje de prueba y recorriéndolo todo. Unos segundos."),
        colour: COR.mod });
      const r = await rodarTesteGeral(serverId, eu, { garantirMoeda, pDaMoeda });
      const cabecalho = r.falhas === 0
        ? `✅ **${r.ok} verificações, tudo passou.**`
        : `⚠️ **${r.ok} passaram, ${r.falhas} falharam.**`;
      return enviarLista(sendEmbed, message.channel, {
        titulo: r.falhas === 0 ? "🧪 Teste geral — tudo certo" : "🧪 Teste geral — com falhas",
        linhas: [cabecalho, "", ...r.linhas],
        rodape: "_Personagem de teste apagado._",
        colour: r.falhas === 0 ? COR.sucesso : COR.erro,
      });
    }

    // ── os números das moedas ──
    if (acao === "eco") {
      const linhas = [];
      for (const m of db.listarMoedas(serverId)) {
        const { pAgora, pSuave, comPlayers } = pDaMoeda(serverId, m);
        linhas.push(`**${m.nome}** ${m.simbolo} — banco ${fmt(m.mercado)} · carteiras ${fmt(comPlayers)} · P ${(pAgora * 100).toFixed(1)}% (suave ${(pSuave * 100).toFixed(1)}%) · preços ×${MERC.mult(pSuave).toFixed(2)} · cair custa ${(MERC.perda(pSuave) * 100).toFixed(0)}%`);
      }
      linhas.push("", `**Contrato** paga do banco: alvo × f(x), K = ${R.ECO.kBanco} · **dungeon** paga do tesouro, K = ${R.ECO.kDungeon} × (1 + ativos/10)`,
        `Alvo no nível 10 / 50 / 100: 🪙${fmt(R.alvoOuro(10))} / ${fmt(R.alvoOuro(50))} / ${fmt(R.alvoOuro(100))} · 💎${fmt(R.alvoCristal(10))} / ${fmt(R.alvoCristal(50))} / ${fmt(R.alvoCristal(100))}`,
        `NPC consome ${(100 - R.ECO.voltaAoBanco * 100).toFixed(0)}% do que se gasta nele · taxa do bazar ${(MERC.taxaMercado(db.volumeRecente(serverId)) * 100).toFixed(2)}%`, "", "**Tesouros**");
      for (const d of MISS.DUNGEONS.values()) {
        const t = TS.renovar(d.id), a = TS.ativos(d.id).length;
        linhas.push(`🕳️ ${d.nome} — 🪙${fmt(t.ouro)} · 💎${fmt(t.cristal)} · ${a} ativo(s)`);
      }
      return enviarLista(sendEmbed, message.channel, { titulo: tr(ctx, "🔧 Moedas do jogo", "🔧 Game currencies", "🔧 Monedas del juego"), linhas, colour: COR.mod });
    }

    if (acao === "simular") {
      const nomeM = resto.filter((x) => !/^\d+$/.test(x) && !/^<[@%#]/.test(x)).join(" ");
      const vezes = Math.min(5000, parseInt(resto.find((x) => /^\d+$/.test(x)) ?? "1000", 10));
      const missao = MISS.acharContrato(nomeM) ?? MISS.acharEspecial(nomeM) ?? MISS.acharChefe(nomeM);
      if (!missao) return sendEmbed(message.channel, { title: tr(ctx, "❌ Missão desconhecida", "❌ Unknown mission", "❌ Misión desconocida"),
        description: `\`${citarInterno("game.admin.simular", P)} <contrato|chefe> [vezes]\`\n\n\`${citarInterno("game.contratos", P)}\` · \`${citarInterno("game.chefes", P)}\``, colour: COR.erro });
      const party = CB.partyDe(serverId, alvoId);
      if (!party) return sendEmbed(message.channel, { title: tr(ctx, "❌ Sem personagem", "❌ No character", "❌ Sin personaje"),
        description: tr(ctx, `${quem === "você" ? "Você" : quem} não tem personagem.`, `${quem === "você" ? "You" : quem} ${quem === "você" ? "don't" : "doesn't"} have a character.`, `${quem === "você" ? "No tienes" : `${quem} no tiene`} personaje.`), colour: COR.erro });
      const spec = AV.montarAlvo(missao, party.p.nivel), pv = CB.prever([party], spec.alvo);
      let ok = 0, falha = 0, caiu = 0;
      for (let i = 0; i < vezes; i++) {
        const r = R.resolverLuta(pv);
        if (r.desfecho === "sucesso") ok++; else if (r.desfecho === "falha") falha++; else caiu++;
      }
      const xp = MISS.xpDa(spec.missao, spec.alvo, party.p.nivel);
      return sendEmbed(message.channel, { title: `🔧 Simulação — ${missao.nome}`,
        description: [
          `**${vezes}** tentativas · party de ${party.membros.length} · nível ${party.p.nivel}`,
          "",
          `✅ Sucesso: **${(ok / vezes * 100).toFixed(1)}%** _(previsto ${(pv.exito * pv.sobrevivencia * 100).toFixed(1)}%)_`,
          `😐 Falhou vivo: ${(falha / vezes * 100).toFixed(1)}%`,
          `💀 Caiu: **${(caiu / vezes * 100).toFixed(1)}%**`,
          `✨ Um êxito vale ${(MISS.valeNiveis(xp, party.p.nivel, party.p.progresso ?? 0) * 100).toFixed(0)}% de nível`,
          "",
          `_Poder ${fmt(pv.poder)} vs ${fmt(pv.exigidoPoder)} · Resiliência ${fmt(pv.resil)} vs ${fmt(pv.exigidoRisco)} · sinergia +${pct(pv.sinergia.bonus)}_`,
        ].join("\n"), colour: COR.mod });
    }

    if (["moeda", "moedas"].includes(acao)) {
      const op = resto[0]?.toLowerCase();
      const args2 = resto.slice(1);

      const CAMPOS = {
        nome:           { tipo: "texto", desc: "como aparece nas mensagens" },
        simbolo:        { tipo: "texto", desc: "emoji ou símbolo (🪙, $, ₿)" },
        dificuldade:    { tipo: "num",   desc: "1 = comum. Maior → aparece menos e rende menos unidades" },
        nivelMin:       { tipo: "int",   desc: "só cai em missões desse nível para cima" },
        suprimentoBase: { tipo: "num",   desc: "quanto existe no total (limita o que pode ser pago)" },
        mercado:        { tipo: "num",   desc: "quanto o mercado tem AGORA" },
      };
      const APELIDOS_CAMPO = { nivel: "nivelMin", dif: "dificuldade", suprimento: "suprimentoBase",
        simbolo: "simbolo", "símbolo": "simbolo", estoque: "mercado" };

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
        const T = (pt, e, es) => tr(ctx, pt, e, es);
        const volume = m.finita
          ? `${T("banco", "bank", "banco")} ${fmt(m.mercado)}`
          : `${T("referência", "reference", "referencia")} ${fmt(m.mercado)}`;
        const ritmo = m.dificuldade <= 2 ? T("geração alta", "high yield", "generación alta")
          : m.dificuldade <= 20 ? T("geração média", "medium yield", "generación media")
          : m.dificuldade <= 100 ? T("geração baixa", "low yield", "generación baja") : T("geração raríssima", "very rare yield", "generación rarísima");
        return [
          `${m.simbolo} **${m.nome}** \`${m.id}\`${m.padrao ? T(" ⭐ padrão", " ⭐ default", " ⭐ por defecto") : ""}`,
          `   ${m.finita ? T("🔒 finita", "🔒 finite", "🔒 finita") : T("♾️ infinita", "♾️ infinite", "♾️ infinita")} · **${ritmo}** (${T("dificuldade", "difficulty", "dificultad")} ${m.dificuldade}) · ${T("nível", "level", "nivel")} ${m.nivelMin}+`,
          `   ${volume} · ${T("com jogadores", "with players", "con jugadores")} ${fmt(db.totalNasCarteiras(serverId, m.id))}`,   // (o pote antigo da dungeon virou o tesouro de cada uma — &game admin eco)
          `   P ${(pSuave * 100).toFixed(0)}% → ${T("preços", "prices", "precios")} ×${MERC.mult(pSuave).toFixed(2)}`,
        ].join("\n");
      };

      // ── ajuda / guia ──
      if (op === "ajuda" || op === "guia" || op === "help") {
        return enviarLista(sendEmbed, message.channel, {
          titulo: tr(ctx, "🪙 Guia — as duas moedas do mundo", "🪙 Guide — the world's two currencies", "🪙 Guía — las dos monedas del mundo"),
          linhas: [
            tr(ctx, "O RPG é **um mundo só** para todos os servidores, com **duas** moedas:", "The RPG is **one world** for every server, with **two** currencies:", "El RPG es **un solo mundo** para todos los servidores, con **dos** monedas:"),
            ...MOEDAS_DO_MUNDO.map((b) => { const m = db.getMoeda(serverId, b.id) ?? b; return `${m.simbolo} **${m.nome}** \`${m.id}\` — ${m.finita ? tr(ctx, "🔒 **finita**: suprimento fixo; quando o banco esgota, só circula entre jogadores", "🔒 **finite**: a fixed supply; when the bank runs out, it only changes hands between players", "🔒 **finita**: suministro fijo; cuando el banco se agota, solo circula entre jugadores") : tr(ctx, "♾️ **infinita**: o dinheiro do dia a dia, sem teto", "♾️ **infinite**: the everyday money, no ceiling", "♾️ **infinita**: el dinero del día a día, sin techo")}`; }),
            "",
            tr(ctx, "**Ajustar** (o tipo — finita ou infinita — é fixo)", "**Adjust** (the type — finite or infinite — is fixed)", "**Ajustar** (el tipo — finita o infinita — es fijo)"),
            `\`${citarInterno("game.admin.moeda", P)} set <id> <campo> <valor>\``,
            `\`${citarInterno("game.admin.moeda", P)} set cristal dificuldade=60 nivel=8\`  ← ${tr(ctx, "vários de uma vez", "several at once", "varios a la vez")}`,
            "",
            tr(ctx, "**Os campos**", "**Fields**", "**Los campos**"),
            ...Object.entries(CAMPOS).map(([k, v]) => `\`${k}\` — ${v.desc}`),
            "",
            tr(ctx, "**Como a dificuldade funciona**", "**How difficulty works**", "**Cómo funciona la dificultad**"),
            tr(ctx, "Controla ao mesmo tempo a chance de a moeda cair numa missão **e** quantas unidades saem — dificuldade 40 aparece ~40× menos que a 1 e rende ~40× menos.", "It controls both the chance of the currency dropping in a mission **and** how many units come out — difficulty 40 shows up ~40× less than 1 and yields ~40× less.", "Controla a la vez la probabilidad de que la moneda caiga en una misión **y** cuántas unidades salen — la dificultad 40 aparece ~40× menos que la 1 y rinde ~40× menos."),
          ],
          colour: COR.mod,
        });
      }

      // Criar, apagar, perfis, modelos, trocar a principal: não existem mais
      // num mundo de duas moedas fixas.
      if (["duplicadas", "duplicates", "limpar", "dedupe", "fundir", "merge", "perfil", "perfis", "profile", "profiles",
        "add", "adicionar", "modelo", "modelos", "preset", "criar", "nova", "padrao", "padrão", "principal",
        "remover", "apagar", "deletar"].includes(op)) {
        return sendEmbed(message.channel, { title: tr(ctx, "🪙 O mundo tem duas moedas", "🪙 The world has two currencies", "🪙 El mundo tiene dos monedas"),
          description: tr(ctx,
            `O RPG agora é um mundo só para todos os servidores, com exatamente duas moedas — uma infinita e uma finita. Dá para renomear e ajustar (\`${citarInterno("game.admin.moeda", P)} set\`), não criar, apagar nem trocar.`,
            `The RPG is now one world for every server, with exactly two currencies — one infinite and one finite. You can rename them or tune them (\`${citarInterno("game.admin.moeda", P)} set\`), but not create, delete or swap them.`,
            `El RPG ahora es un solo mundo para todos los servidores, con exactamente dos monedas — una infinita y una finita. Puedes renombrarlas y ajustarlas (\`${citar("game.admin.moeda", "es", P)} set\`), pero no crearlas, borrarlas ni cambiarlas.`),
          colour: COR.info });
      }

      if (["ver", "detalhe", "info"].includes(op)) {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: tr(ctx, "❌ Moeda desconhecida", "❌ Unknown currency", "❌ Moneda desconocida"),
          description: `\`${citarInterno("game.admin.moeda", P)}\` lista as existentes.`, colour: COR.erro });
        // v4 (D8): o alvo de um êxito no próprio nível — o banco/tesouro cheio paga até 2×, vazio paga menos
        const alvoDe = m.id === "cristal" ? R.alvoCristal : R.alvoOuro;
        const exemploNv = [1, 10, 50, 100].map((nv) =>
          `   nível ${String(nv).padStart(3)}: ~${fmt(alvoDe(nv))} por êxito (banco na média)`);
        return sendEmbed(message.channel, { title: `${m.simbolo} ${m.nome}`,
          description: [
            fichaDaMoeda(m),
            "",
            "**Quanto rende**",
            ...exemploNv,
            m.nivelMin > 1 ? `   _(não aparece abaixo do nível ${m.nivelMin})_` : "",
            "",
            `_Mudar: \`${citarInterno("game.admin.moeda", P)} set ${m.id} <campo> <valor>\`_`,
            `_Campos: ${Object.keys(CAMPOS).join(", ")}_`,
          ].filter(Boolean).join("\n"), colour: COR.mod });
      }

      // ── criar ──
      if (["set", "editar", "config"].includes(op)) {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: tr(ctx, "❌ Qual moeda?", "❌ Which currency?", "❌ ¿Qué moneda?"),
          description: `\`${citarInterno("game.admin.moeda", P)} set <id> <campo> <valor>\`\n\n\`${citarInterno("game.admin.moeda", P)}\` lista as existentes.`, colour: COR.erro });

        const { pares, sobra } = extrairPares(args2.slice(1));
        // formato antigo: `set <id> <campo> <valor>`
        if (!Object.keys(pares).length && sobra.length >= 2) {
          const campo = normalizarCampo(sobra[0]);
          if (!campo) {
            return sendEmbed(message.channel, { title: tr(ctx, "❌ Campo desconhecido", "❌ Unknown field", "❌ Campo desconocido"),
              description: ["**Campos:**", ...Object.entries(CAMPOS).map(([k, v]) => `\`${k}\` — ${v.desc}`)].join("\n"),
              colour: COR.erro });
          }
          pares[campo] = converter(campo, sobra.slice(1).join(" "));
        }
        if (!Object.keys(pares).length) {
          return sendEmbed(message.channel, { title: tr(ctx, "❌ Mudar o quê?", "❌ Change what?", "❌ ¿Cambiar qué?"),
            description: [
              `\`${citarInterno("game.admin.moeda", P)} set ${m.id} dificuldade 20\``,
              `\`${citarInterno("game.admin.moeda", P)} set ${m.id} dificuldade=20 nivel=5\`  ← vários de uma vez`,
              "",
              "**Campos:**",
              ...Object.entries(CAMPOS).map(([k, v]) => `\`${k}\` — ${v.desc}`),
            ].join("\n"), colour: COR.erro });
        }
        const invalidos = Object.entries(pares).filter(([, v]) => typeof v === "number" && !Number.isFinite(v));
        if (invalidos.length) {
          return sendEmbed(message.channel, { title: tr(ctx, "❌ Valor inválido", "❌ Invalid value", "❌ Valor no válido"),
            description: tr(ctx, `**${invalidos.map(([k]) => k).join(", ")}** precisa(m) de número.`, `**${invalidos.map(([k]) => k).join(", ")}** need(s) a number.`, `**${invalidos.map(([k]) => k).join(", ")}** necesita(n) un número.`), colour: COR.erro });
        }
        db.salvarMoeda(serverId, m.id, pares);
        const atual = db.getMoeda(serverId, m.id);
        const avisos = [];
        if (!atual.finita && atual.mercado < 100) {
          avisos.push(`⚠️ A referência (${fmt(atual.mercado)}) está muito baixa para uma moeda infinita — o P vai ficar perto de 100% e os preços travam no mínimo. Use algo próximo do total que os jogadores devem acumular.`);
        }
        return sendEmbed(message.channel, { title: tr(ctx, "🪙 Ajustado", "🪙 Adjusted", "🪙 Ajustado"),
          description: [
            Object.entries(pares).map(([k, v]) => `\`${k}\` → **${v}**`).join(" · "),
            "",
            fichaDaMoeda(atual),
            ...(avisos.length ? ["", ...avisos] : []),
          ].join("\n"), colour: avisos.length ? COR.aviso : COR.mod });
      }

      // ── painel (padrão) ──
      garantirMoedasDoMundo();
      const lista = db.listarMoedas(serverId);
      return enviarLista(sendEmbed, message.channel, {
        titulo: tr(ctx, "🪙 As moedas do mundo", "🪙 The world's currencies", "🪙 Las monedas del mundo"),
        linhas: [
          ...lista.map(fichaDaMoeda),
          "",
          tr(ctx, "_Um mundo só para todos os servidores — os mesmos saldos em qualquer um._", "_One world for every server — the same balances everywhere._", "_Un solo mundo para todos los servidores — los mismos saldos en cualquiera._"),
          `\`${citarInterno("game.admin.moeda.ajuda", P)}\` — ${tr(ctx, "o que cada campo significa", "what each field means", "qué significa cada campo")}`,
          `\`${citarInterno("game.admin.moeda", P)} set <id> <campo> <valor>\` · \`${citarInterno("game.admin.moeda.ver", P)} <id>\``,
        ],
        colour: COR.mod });
    }

    if (["zerar", "reset", "resetar"].includes(acao)) {
      const escopo = ({ servidor: "mundo", server: "mundo" })[(resto[0] ?? "mundo").toLowerCase()] ?? (resto[0] ?? "mundo").toLowerCase();
      const confirmou = resto.includes("confirmar") || resto.includes("confirm");
      const escopos = { mundo: 1, catalogo: 1, "catálogo": 1, tudo: 1 };
      if (!escopos[escopo]) {
        return sendEmbed(message.channel, { title: tr(ctx, "❓ Resetar o quê?", "❓ Reset what?", "❓ ¿Reiniciar qué?"),
          description: tr(ctx, [
            `\`${citarInterno("game.admin.reset.mundo.confirmar", P)}\``,
            "   apaga o **progresso de todo mundo, em todos os servidores**: personagens, mochilas, followers, saldos e ofertas",
            "",
            `\`${citarInterno("game.admin.reset.catalogo.confirmar", P)}\``,
            "   apaga o que você **curou**, voltando só aos itens/followers genéricos",
            "",
            `\`${citarInterno("game.admin.reset.tudo.confirmar", P)}\``,
            "   os dois — o jogo volta ao estado de recém-instalado",
          ], [
            `\`${citarInterno("game.admin.reset.mundo.confirmar", P)}\``,
            "   erases **everyone's progress, on every server**: characters, bags, followers, balances and offers",
            "",
            `\`${citarInterno("game.admin.reset.catalogo.confirmar", P)}\``,
            "   erases what you **curated**, back to the generic items/followers only",
            "",
            `\`${citarInterno("game.admin.reset.tudo.confirmar", P)}\``,
            "   both — the game returns to a freshly installed state",
          ], [
            `\`${citar("game.admin.reset.mundo.confirmar", "es", P)}\``,
            "   borra el **progreso de todo el mundo, en todos los servidores**: personajes, mochilas, compañeros, saldos y ofertas",
            "",
            `\`${citar("game.admin.reset.catalogo.confirmar", "es", P)}\``,
            "   borra lo que **curaste**, volviendo solo a los objetos/compañeros genéricos",
            "",
            `\`${citar("game.admin.reset.tudo.confirmar", "es", P)}\``,
            "   los dos — el juego vuelve al estado de recién instalado",
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
            "• mochilas, equipamentos, recompensas únicas e os tesouros das dungeons", "");
        }
        if (escopo === "catalogo" || escopo === "catálogo" || escopo === "tudo") {
          linhas.push("**Catálogo:**",
            nCur ? `• ${nCur} item(ns)/follower(s) **curados por você** serão removidos`
                 : "• nada curado ainda — só os genéricos, que serão recriados",
            "");
        }
        linhas.push(`Confirme com \`${citarInterno("game.admin.reset", P)} ${escopo} confirmar\`.`);
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
        rpg_unicos: "recompensa(s) única(s) registrada(s)",
        rpg_espera: "espera(s) de chefe/especial",
        rpg_dungeons: "tesouro(s) de dungeon",
        rpg_dungeon_ativos: "registro(s) de quem jogou nas dungeons",
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
        for (const t of ["rpg_unicos", "rpg_espera", "rpg_dungeons", "rpg_dungeon_ativos"]) apagar(t, "1 = 1");
        apagar("rpg_follower_itens", "followerId IN (SELECT id FROM rpg_followers WHERE serverId = ?)", serverId);
        apagar("rpg_followers", "serverId = ?", serverId);
      }

      if (escopo === "catalogo" || escopo === "catálogo" || escopo === "tudo") {
        // remove tudo do catálogo: os genéricos são recriados logo abaixo
        apagar("rpg_itens", "1 = 1");
        apagar("rpg_followers_catalogo", "1 = 1");
        semeado = false;
        iniciarCatalogo();
      }

      garantirMoedasDoMundo();   // as duas moedas voltam na hora, com o banco cheio
      const mexeuNoCatalogo = ["catalogo", "catálogo", "tudo"].includes(escopo);

      return sendEmbed(message.channel, {
        title: tr(ctx, "🔄 Reset concluído", "🔄 Reset done", "🔄 Reinicio completado"),
        description: tr(ctx, [
          `**Escopo:** ${escopo}`,
          "",
          apagados.length ? "**Apagado:**\n" + apagados.map((x) => `• ${x}`).join("\n") : "_Nada havia para apagar._",
          mexeuNoCatalogo
            ? `\n✅ Catálogo genérico recriado: ${db.listarItens().length} itens, ${db.listarFollowersCatalogo().length} companheiros` : "",
          "",
          "_As duas moedas do mundo voltaram, com o banco cheio. Agora é só \`" + P + "game criar\`._",
        ], [
          `**Scope:** ${escopo}`,
          "",
          apagados.length ? "**Erased:**\n" + apagados.map((x) => `• ${x}`).join("\n") : "_There was nothing to erase._",
          mexeuNoCatalogo
            ? `\n✅ Generic catalog recreated: ${db.listarItens().length} items, ${db.listarFollowersCatalogo().length} companions` : "",
          "",
          "_The world's two currencies are back, with a full bank. Now just \`" + P + "game criar\`._",
        ], [
          `**Alcance:** ${escopo}`,
          "",
          apagados.length ? "**Borrado:**\n" + apagados.map((x) => `• ${x}`).join("\n") : "_No había datos que borrar._",
          mexeuNoCatalogo
            ? `\n✅ Catálogo genérico recreado: ${db.listarItens().length} objetos, ${db.listarFollowersCatalogo().length} compañeros` : "",
          "",
          "_Las dos monedas del mundo volvieron, con el banco lleno. Ahora solo falta \`" + citar("game.criar", "es", P) + "\`._",
        ].filter(Boolean)).filter(Boolean).join("\n"),
        colour: COR.sucesso });
    }

    return sendEmbed(message.channel, { title: tr(ctx, "❓ Ação desconhecida", "❓ Unknown action", "❓ Acción desconocida"),
      description: tr(ctx, `\`${citarInterno("game.admin", P)}\` lista o que dá para fazer.`, `\`${citarInterno("game.admin", P)}\` lists what you can do.`, `\`${citar("game.admin", "es", P)}\` lista lo que puedes hacer.`), colour: COR.erro });
  }

  // ── carteira / mercado ──
  if (["carteira", "saldo", "moedas"].includes(sub)) {
    garantirMoeda(serverId);
    const moedas = db.listarMoedas(serverId);
    const padrao = db.moedaPadrao(serverId);

    const linhas = [];
    let temAlgo = false;
    for (const m of moedas) {
      const saldo = db.getSaldo(serverId, eu, m.id);
      if (saldo > 0) temAlgo = true;
      const marca = saldo > 0 ? "**" : "";
      linhas.push(`${m.simbolo} ${marca}${fmt(saldo)} ${m.nome}${marca}${m.padrao ? " ⭐" : ""}`);
    }
    if (!temAlgo) linhas.push("", tr(ctx, "_Sua carteira está vazia — missões pagam em moeda._", "_Your wallet is empty — missions pay in currency._", "_Tu cartera está vacía — las misiones pagan en moneda._"));

    // O estado do mercado é o da moeda padrão: é nela que os preços aparecem.
    if (padrao) {
      const { pSuave, comPlayers } = pDaMoeda(serverId, padrao);
      linhas.push("",
        tr(ctx, `**Mercado — ${padrao.simbolo} ${padrao.nome}**`, `**Market — ${padrao.simbolo} ${padrao.nome}**`, `**Mercado — ${padrao.simbolo} ${padrao.nome}**`),
        tr(ctx,
          `Com os jogadores: ${fmt(comPlayers)} · ${padrao.finita ? "Mercado" : "Referência"}: ${fmt(padrao.mercado)}`,
          `With the players: ${fmt(comPlayers)} · ${padrao.finita ? "Market" : "Reference"}: ${fmt(padrao.mercado)}`,
          `Con los jugadores: ${fmt(comPlayers)} · ${padrao.finita ? "Mercado" : "Referencia"}: ${fmt(padrao.mercado)}`),
        tr(ctx, `Concentração (P): **${(pSuave * 100).toFixed(0)}%**`, `Concentration (P): **${(pSuave * 100).toFixed(0)}%**`, `Concentración (P): **${(pSuave * 100).toFixed(0)}%**`),
        tr(ctx,
          `Preços estão **${MERC.mult(pSuave) > 1.5 ? "altos" : MERC.mult(pSuave) > 1 ? "médios" : "baixos"}** (×${MERC.mult(pSuave).toFixed(2)})`,
          `Prices are **${MERC.mult(pSuave) > 1.5 ? "high" : MERC.mult(pSuave) > 1 ? "medium" : "low"}** (×${MERC.mult(pSuave).toFixed(2)})`,
          `Los precios están **${MERC.mult(pSuave) > 1.5 ? "altos" : MERC.mult(pSuave) > 1 ? "medios" : "bajos"}** (×${MERC.mult(pSuave).toFixed(2)})`),
        tr(ctx,
          `Cair custa **${(MERC.perda(pSuave) * 100).toFixed(0)}%** do que você carrega`,
          `Falling costs **${(MERC.perda(pSuave) * 100).toFixed(0)}%** of what you carry`,
          `Caer cuesta **${(MERC.perda(pSuave) * 100).toFixed(0)}%** de lo que llevas`),
      );
      linhas.push("", tr(ctx,
        `_Contratos são pagos pelo banco (a guilda); dungeons, pelo tesouro delas, que se renova com quem joga lá — \`${citarInterno("game.dungeons", P)}\`._`,
        `_Contracts are paid by the bank (the guild); dungeons by their own treasury, which refills as people play there — \`${citarInterno("game.dungeons", P)}\`._`,
        `_Los contratos los paga el banco (el gremio); las mazmorras, su propio tesoro, que se renueva con quien juega allí — \`${citar("game.dungeons", "es", P)}\`._`));
    }

    if (moedas.length > 1) {
      // (o painel das moedas é do dono do bot; para o jogador, o que importa é trocar)
      if (ctx.ehSuperAdmin?.(eu)) linhas.push("", tr(ctx,
        `_Cada moeda tem seu próprio P — \`${citarInterno("game.admin.moeda", P)}\`._`,
        `_Each currency has its own P — \`${citarInterno("game.admin.moeda", P)}\`._`,
        `_Cada moneda tiene su propio P — \`${citar("game.admin.moeda", "es", P)}\`._`));
      linhas.push(tr(ctx,
        `_Trocar com o banco: \`${citarInterno("game.cambio", P)} <qtd|tudo> <moeda> para <moeda>\` · taxas: \`${citarInterno("game.cambio.taxas", P)}\`_`,
        `_Exchange with the bank: \`${citarInterno("game.cambio", P)} <qty|all> <currency> to <currency>\` · rates: \`${citarInterno("game.cambio.taxas", P)}\`_`,
        `_Cambiar con el banco: \`${citar("game.cambio", "es", P)} <cantidad|all> <moneda> to <moneda>\` · tasas: \`${citar("game.cambio.taxas", "es", P)}\`_`));
    }

    return enviarLista(sendEmbed, message.channel, {
      titulo: tr(ctx, "💰 Sua carteira", "💰 Your wallet", "💰 Tu cartera"), linhas, colour: COR.info });
  }

  if (["mercado", "bazar", "p2p"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"),
      description: tr(ctx, `Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${citar("game.criar", "es", P)}\`.`), colour: COR.aviso });

    const moeda = garantirMoeda(serverId);
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2);

    if (["vender", "anunciar"].includes(acao)) {
      const preco = parseInt(resto[resto.length - 1], 10);
      const nomeItem = resto.slice(0, -1).join(" ").trim();
      if (!nomeItem || !Number.isFinite(preco) || preco < 1) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Uso", "❌ Usage", "❌ Uso"),
          description: tr(ctx,
            `\`${citarInterno("game.mercado.vender", P)} <item> <preço>\`\n\nEx.: \`${citarInterno("game.mercado.vender", P)} Espada de Ferro 250\``,
            `\`${citarInterno("game.mercado.vender", P)} <item> <price>\`\n\nE.g.: \`${citarInterno("game.mercado.vender", P)} Espada de Ferro 250\``,
            `\`${citar("game.mercado.vender", "es", P)} <objeto> <precio>\`\n\nEj.: \`${citar("game.mercado.vender", "es", P)} Iron Sword 250\``),
          colour: COR.erro });
      }
      const item = db.acharItemPorNome(nomeItem);
      if (!item || !db.temItem(serverId, eu, item.id)) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Você não tem isso", "❌ You don't have that", "❌ No tienes eso"),
          description: tr(ctx, `**${nomeItem}** não está na sua mochila.`, `**${nomeItem}** isn't in your bag.`, `**${nomeItem}** no está en tu mochila.`), colour: COR.erro });
      }
      const slot = db.slotDoItem(serverId, eu, item.id);
      if (slot) db.desequipar(serverId, eu, slot);
      db.tirarItem(serverId, eu, item.id, 1);
      const of = db.criarOferta({ serverId, tipo: "venda", autorId: eu,
        itemOferecido: item.id, moedaPedida: moeda.id, qtdPedida: preco });
      return sendEmbed(message.channel, { title: tr(ctx, "🏷️ Anunciado", "🏷️ Listed", "🏷️ Anunciado"),
        description: tr(ctx, [
          `**${item.nome}** por ${moeda.simbolo}${fmt(preco)}`,
          "_O item ficou em custódia comigo até alguém comprar ou você cancelar._",
          "",
          `Oferta **#${of.id}** · cancelar: \`${citarInterno("game.mercado.cancelar", P)} ${of.id}\``,
        ], [
          `**${item.nome}** for ${moeda.simbolo}${fmt(preco)}`,
          "_The item is held in escrow with me until someone buys it or you cancel._",
          "",
          `Offer **#${of.id}** · cancel: \`${citarInterno("game.mercado.cancelar", P)} ${of.id}\``,
        ], [
          `**${item.nome}** por ${moeda.simbolo}${fmt(preco)}`,
          "_El objeto queda en custodia conmigo hasta que alguien lo compre o lo canceles._",
          "",
          `Oferta **#${of.id}** · cancelar: \`${citar("game.mercado.cancelar", "es", P)} ${of.id}\``,
        ]).join("\n"), colour: COR.sucesso });
    }

    if (["comprar", "aceitar"].includes(acao)) {
      const id = parseInt(resto[0], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      // (31 out 2026, R6) só venda e câmbio se compram aqui: troca e duelo têm
      // custódia própria (antes "comprar" um duelo tirava a aposta da custódia)
      if (!of || of.serverId !== serverId || of.estado !== "aberta" || !TIPOS_DO_BAZAR.includes(of.tipo)) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Oferta indisponível", "❌ Offer unavailable", "❌ Oferta no disponible"),
          description: tr(ctx, `Veja as abertas com \`${citarInterno("game.mercado", P)}\`.`, `See the open ones with \`${citarInterno("game.mercado", P)}\`.`, `Mira las abiertas con \`${citar("game.mercado", "es", P)}\`.`), colour: COR.erro });
      }
      if (of.autorId === eu) {
        return sendEmbed(message.channel, { title: tr(ctx, "🤔 É sua", "🤔 It's yours", "🤔 Es tuya"),
          description: tr(ctx, `Para tirar do ar: \`${citarInterno("game.mercado.cancelar", P)} ${of.id}\`.`, `To take it down: \`${citarInterno("game.mercado.cancelar", P)} ${of.id}\`.`, `Para retirarla: \`${citar("game.mercado.cancelar", "es", P)} ${of.id}\`.`), colour: COR.aviso });
      }
      const volume = db.volumeRecente(serverId);
      const { pct, valor: taxa } = MERC.calcularTaxa(of.qtdPedida, volume);
      const total = of.qtdPedida;
      const saldo = db.getSaldo(serverId, eu, of.moedaPedida ?? moeda.id);
      if (saldo < total) {
        return sendEmbed(message.channel, { title: tr(ctx, "💸 Saldo insuficiente", "💸 Not enough balance", "💸 Saldo insuficiente"),
          description: tr(ctx, `Precisa de ${moeda.simbolo}${fmt(total)} — você tem ${moeda.simbolo}${fmt(saldo)}.`, `You need ${moeda.simbolo}${fmt(total)} — you have ${moeda.simbolo}${fmt(saldo)}.`, `Necesitas ${moeda.simbolo}${fmt(total)} — tienes ${moeda.simbolo}${fmt(saldo)}.`),
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
      return sendEmbed(message.channel, { title: tr(ctx, "🤝 Negócio fechado", "🤝 Deal closed", "🤝 Trato cerrado"),
        description: tr(ctx, [
          `Você levou ${oQue} por ${moeda.simbolo}${fmt(total)}.`,
          `_Taxa do mercado: ${moeda.simbolo}${fmt(taxa)} (${(pct * 100).toFixed(2)}%)_`,
        ], [
          `You took ${oQue} for ${moeda.simbolo}${fmt(total)}.`,
          `_Market fee: ${moeda.simbolo}${fmt(taxa)} (${(pct * 100).toFixed(2)}%)_`,
        ], [
          `Te llevaste ${oQue} por ${moeda.simbolo}${fmt(total)}.`,
          `_Comisión del mercado: ${moeda.simbolo}${fmt(taxa)} (${(pct * 100).toFixed(2)}%)_`,
        ]).join("\n"), colour: COR.sucesso });
    }

    if (["cancelar", "retirar"].includes(acao)) {
      const id = parseInt(resto[0], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      if (!of || of.autorId !== eu || of.estado !== "aberta") {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Não dá para cancelar", "❌ Can't cancel", "❌ No se puede cancelar"),
          description: tr(ctx, "A oferta não existe, não é sua, ou já fechou.", "The offer doesn't exist, isn't yours, or already closed.", "La oferta no existe, no es tuya o ya se cerró."), colour: COR.erro });
      }
      if (of.itemOferecido) db.darItem(serverId, eu, of.itemOferecido);
      if (of.moedaOferecida) db.creditar(serverId, eu, of.moedaOferecida, of.qtdOferecida);
      db.fecharOferta(of.id, "cancelada");
      return sendEmbed(message.channel, { title: tr(ctx, "↩️ Cancelada", "↩️ Cancelled", "↩️ Cancelada"),
        description: tr(ctx, "O que estava em custódia voltou para você.", "What was held in escrow came back to you.", "Lo que estaba en custodia volvió a ti."), colour: COR.mod });
    }

    const ofertas = db.listarOfertas(serverId).filter((o) => TIPOS_DO_BAZAR.includes(o.tipo));
    if (!ofertas.length) {
      return sendEmbed(message.channel, { title: tr(ctx, "🏪 Bazar vazio", "🏪 Empty bazaar", "🏪 Bazar vacío"),
        description: tr(ctx, [
          "Ninguém está vendendo nada agora.",
          "",
          `\`${citarInterno("game.mercado.vender", P)} <item> <preço>\` — anuncie o seu`,
          `\`${citarInterno("game.cambio", P)} <qtd> <moeda> para <moeda>\` — troca com o banco`,
          `\`${citarInterno("game.cambio", P)} <qtd> <moeda> por <qtd> <moeda>\` — oferta a outro jogador`,
          `\`${citarInterno("game.trocar", P)} @pessoa <seu item> por <item dela>\` — escambo`,
        ], [
          "Nobody is selling anything right now.",
          "",
          `\`${citarInterno("game.mercado.vender", P)} <item> <price>\` — list yours`,
          `\`${citarInterno("game.cambio", P)} <qty> <currency> to <currency>\` — exchange with the bank`,
          `\`${citarInterno("game.cambio", P)} <qty> <currency> for <qty> <currency>\` — offer to another player`,
          `\`${citarInterno("game.trocar", P)} @person <your item> for <their item>\` — barter`,
        ], [
          "Ahora mismo no hay ninguna venta.",
          "",
          `\`${citar("game.mercado.vender", "es", P)} <objeto> <precio>\` — anuncia el tuyo`,
          `\`${citar("game.cambio", "es", P)} <cantidad> <moneda> to <moneda>\` — cambia con el banco`,
          `\`${citar("game.cambio", "es", P)} <cantidad> <moneda> for <cantidad> <moneda>\` — oferta a otro jugador`,
          `\`${citar("game.trocar", "es", P)} @usuario <tu objeto> for <su objeto>\` — trueque`,
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
    linhas.push("", `_\`${citarInterno("game.mercado.comprar", P)} <#>\` · taxa atual: **${(MERC.taxaMercado(volume) * 100).toFixed(2)}%**_`);
    return enviarLista(sendEmbed, message.channel, { titulo: "🏪 Bazar dos jogadores", linhas, colour: COR.info });
  }

  // ── câmbio entre jogadores ──
  if (["cambio", "câmbio"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"),
      description: tr(ctx, `Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${citar("game.criar", "es", P)}\`.`), colour: COR.aviso });

    const moedas = db.listarMoedas(serverId);
    const texto = args.slice(1).join(" ");

    // ── &game cambio taxas — quanto o banco paga hoje, de cada uma para cada ──
    if (/^(taxas?|rates?|tabela|table)$/i.test(texto.trim())) {
      if (moedas.length < 2) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "💱 Taxas do banco",
            description: "Só há uma moeda aqui — o câmbio precisa de pelo menos duas.", colour: COR.aviso },
          { title: "💱 Bank rates",
            description: "There's only one currency here — exchange needs at least two.", colour: COR.aviso },
          { title: "💱 Tasas del banco",
            description: "Aquí solo hay una moneda — el cambio necesita al menos dos.", colour: COR.aviso }));
      }
      const linhas = [];
      for (const de of moedas) {
        const partes = moedas.filter((x) => x.id !== de.id).map((para) => {
          const r = MERC.converter(100, de, para);
          return `${para.simbolo}${fmt(r.recebe)} ${idDigitavel(para, en)}`;
        });
        linhas.push(`${de.simbolo} **100 ${de.nome}** → ${partes.join(" · ")}`);
      }
      linhas.push("", tr(ctx,
        `_Spread: ${(MERC.CFG.spread * 100).toFixed(0)}% — é o que impede o A→B→A dar lucro._`,
        `_Spread: ${(MERC.CFG.spread * 100).toFixed(0)}% — it's what keeps A→B→A from paying off._`,
        `_Spread: ${(MERC.CFG.spread * 100).toFixed(0)}% — es lo que impide que A→B→A dé ganancias._`));
      linhas.push(tr(ctx,
        `_A taxa é a razão entre os estoques do banco — trocas grandes a movem contra você._`,
        `_The rate is the ratio between the bank's stocks — big trades move it against you._`,
        `_La tasa es la razón entre las reservas del banco — los cambios grandes la mueven en tu contra._`));
      return enviarLista(sendEmbed, message.channel, {
        titulo: tr(ctx, "💱 Taxas do banco", "💱 Bank rates", "💱 Tasas del banco"), linhas, colour: COR.info });
    }

    const mQuanto = texto.match(/^([\d.,]+)\s+(\S+)$/);
    if (mQuanto) {
      const qtd = numeroDigitado(mQuanto[1]);
      const de = db.acharMoeda(serverId, mQuanto[2]);
      if (de && Number.isFinite(qtd) && qtd > 0) {
        const outras = moedas.filter((x) => x.id !== de.id);
        if (!outras.length) {
          return sendEmbed(message.channel, tr(ctx,
            { title: "💱 Só há uma moeda",
              description: `Só existe ${de.simbolo} **${de.nome}** no mundo agora.`,
              colour: COR.aviso },
            { title: "💱 Only one currency",
              description: `Only ${de.simbolo} **${de.nome}** exists in the world right now.`,
              colour: COR.aviso },
            { title: "💱 Solo hay una moneda",
              description: `Ahora mismo solo existe ${de.simbolo} **${de.nome}** en el mundo.`,
              colour: COR.aviso }));
        }
        const linhas = outras.map((para) => {
          const r = MERC.converter(qtd, de, para);
          const unit = MERC.taxaCambio(de, para);
          return `${para.simbolo} **${fmt(r.recebe)}** ${para.nome}`
            + `  _(1 = ${unit >= 0.01 ? unit.toFixed(2) : unit.toExponential(1)})_`;
        });
        const seu = db.getSaldo(serverId, eu, de.id);
        linhas.push("", tr(ctx,
          `_Já com o spread de ${(MERC.CFG.spread * 100).toFixed(0)}% descontado — é o que você receberia de fato._`,
          `_Already with the ${(MERC.CFG.spread * 100).toFixed(0)}% spread discounted — it's what you'd actually receive._`,
          `_Ya con el spread del ${(MERC.CFG.spread * 100).toFixed(0)}% descontado — es lo que recibirías de verdad._`));
        linhas.push(tr(ctx,
          `_Você tem ${de.simbolo}${fmt(seu)} · para trocar: \`${citarInterno("game.cambio", P)} ${qtd} ${de.id} para <moeda>\`_`,
          `_You have ${de.simbolo}${fmt(seu)} · to trade: \`${citarInterno("game.cambio", P)} ${qtd} ${idDigitavel(de, true)} to <currency>\`_`,
          `_Tienes ${de.simbolo}${fmt(seu)} · para cambiar: \`${citar("game.cambio", "es", P)} ${qtd} ${idDigitavel(de, true)} to <moneda>\`_`));
        return enviarLista(sendEmbed, message.channel, {
          titulo: tr(ctx,
            `💱 ${de.simbolo} ${fmt(qtd)} ${de.nome} vale`,
            `💱 ${de.simbolo} ${fmt(qtd)} ${de.nome} is worth`,
            `💱 ${de.simbolo} ${fmt(qtd)} ${de.nome} valen`),
          linhas, colour: COR.info });
      }
    }

    // (4 out 2026) a quantidade é opcional: sem ela — ou com "tudo" — troca o
    // saldo inteiro ("&game cambio ouro para cristal" mostrava só a ajuda)
    const mb = texto.match(/^(?:([\d.,]+|tudo|todo|all|max|máx)\s+)?(\S+)\s+(?:para|to|→|->)\s+(\S+)$/i);
    if (mb) {
      const [, qtdBruta, nomeDe, nomePara] = mb;
      const deTudo = !qtdBruta || /^(tudo|todo|all|max|máx)$/i.test(qtdBruta);
      const qtdTxt = deTudo ? String(Math.floor(db.getSaldo(serverId, eu, db.acharMoeda(serverId, nomeDe)?.id ?? "") || 0)) : qtdBruta;
      const de = db.acharMoeda(serverId, nomeDe);
      const para = db.acharMoeda(serverId, nomePara);
      if (!de || !para || de.id === para.id) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Moedas inválidas",
            description: "Precisam ser as duas moedas diferentes do mundo.", colour: COR.erro },
          { title: "❌ Invalid currencies",
            description: "They must be the world's two different currencies.", colour: COR.erro },
          { title: "❌ Monedas no válidas",
            description: "Tienen que ser las dos monedas distintas del mundo.", colour: COR.erro }));
      }
      const qtd = numeroDigitado(qtdTxt);
      const saldo = db.getSaldo(serverId, eu, de.id);
      if (Number.isFinite(qtd) && !Number.isInteger(qtd)) {
        return sendEmbed(message.channel, { title: tr(ctx, "💱 Só unidades inteiras", "💱 Whole units only", "💱 Solo unidades enteras"), colour: COR.aviso,
          description: tr(ctx, `As moedas do jogo não se dividem: use um número inteiro (ou \`tudo\`).`, `The game's currencies don't split: use a whole number (or \`tudo\`).`, `Las monedas del juego no se dividen: usa un número entero (o \`all\`).`) });
      }
      if (!(qtd > 0) || saldo + 1e-7 < qtd) {
        return sendEmbed(message.channel, {
          title: tr(ctx, "💸 Saldo insuficiente", "💸 Not enough balance", "💸 Saldo insuficiente"),
          description: tr(ctx, `Você tem ${de.simbolo}${fmt(saldo)}.`, `You have ${de.simbolo}${fmt(saldo)}.`, `Tienes ${de.simbolo}${fmt(saldo)}.`),
          colour: COR.erro });
      }

      let r = MERC.converter(qtd, de, para);
      if (r.recebe <= 0) {
        const um = MERC.converter(1e9, de, para).recebe > 0 ? Math.ceil(1 / MERC.taxaCambio(de, para) / (1 - MERC.CFG.spread)) : null;
        return sendEmbed(message.channel, tr(ctx,
          { title: "💱 Valor pequeno demais",
            description: `${fmt(qtd)} ${de.nome} não chega a 1 ${para.nome} pela taxa de hoje.${um ? ` 1 ${para.nome} custa uns ${fmt(um)} ${de.nome}.` : ""}`, colour: COR.aviso },
          { title: "💱 Amount too small",
            description: `${fmt(qtd)} ${de.nome} doesn't reach 1 ${para.nome} at today's rate.${um ? ` 1 ${para.nome} costs about ${fmt(um)} ${de.nome}.` : ""}`, colour: COR.aviso },
          { title: "💱 Cantidad demasiado pequeña",
            description: `${fmt(qtd)} ${de.nome} no llega a 1 ${para.nome} con la tasa de hoy.${um ? ` 1 ${para.nome} cuesta unos ${fmt(um)} ${de.nome}.` : ""}`, colour: COR.aviso }));
      }

      // Moeda finita tem estoque: o banco não pode pagar o que não tem. No
      // "tudo", paga o que o banco tiver (e usa só o necessário para isso).
      const atualPara = db.getMoeda(serverId, para.id);
      if (atualPara?.finita && deTudo && (atualPara.mercado ?? 0) < r.recebe && (atualPara.mercado ?? 0) >= 1) {
        let lo = 1, hi = qtd;
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (MERC.converter(mid, de, para).recebe <= atualPara.mercado) lo = mid; else hi = mid - 1; }
        r = MERC.converter(lo, de, para);
      }
      if (atualPara?.finita && (atualPara.mercado ?? 0) < r.recebe) {
        return sendEmbed(message.channel, {
          title: tr(ctx, "🏦 O banco não tem tanto", "🏦 The bank is short", "🏦 El banco no tiene tanto"),
          description: tr(ctx,
            `O banco só tem ${para.simbolo}${fmt(atualPara.mercado ?? 0)} de **${para.nome}** agora.\n\n_Moedas finitas voltam ao banco conforme as pessoas gastam. Tente um valor menor, ou use o balcão: \`${citarInterno("game.cambio", P)} ${qtd} ${de.id} por <qtd> ${para.id}\`._`,
            `The bank only holds ${para.simbolo}${fmt(atualPara.mercado ?? 0)} of **${para.nome}** right now.\n\n_Finite currencies come back to the bank as people spend them. Try a smaller amount, or the counter: \`${citarInterno("game.cambio", P)} ${qtd} ${de.id} por <qty> ${para.id}\`._`,
            `Ahora mismo el banco solo tiene ${para.simbolo}${fmt(atualPara.mercado ?? 0)} de **${para.nome}**.\n\n_Las monedas finitas vuelven al banco a medida que la gente las gasta. Prueba con una cantidad menor, o usa el mostrador: \`${citar("game.cambio", "es", P)} ${qtd} ${idDigitavel(de, true)} for <cantidad> ${idDigitavel(para, true)}\`._`),
          colour: COR.aviso });
      }

      // só o necessário para as unidades inteiras sai da carteira
      const gasto = r.gasta;
      db.debitar(serverId, eu, de.id, gasto);
      db.salvarMoeda(serverId, de.id, { mercado: (db.getMoeda(serverId, de.id)?.mercado ?? 0) + gasto });
      const recebido = r.recebe;
      db.creditar(serverId, eu, para.id, recebido);
      db.salvarMoeda(serverId, para.id, {
        mercado: Math.max(1, (db.getMoeda(serverId, para.id)?.mercado ?? 0) - recebido) });

      const carteira = db.listarMoedas(serverId)
        .map((x) => `${x.simbolo}${fmt(db.getSaldo(serverId, eu, x.id))}`).join(" · ");
      return sendEmbed(message.channel, {
        title: tr(ctx, "💱 Trocado", "💱 Exchanged", "💱 Cambiado"),
        description: tr(ctx, [
          `${de.simbolo}**${fmt(gasto)} ${de.nome}** → ${para.simbolo}**${fmt(recebido)} ${para.nome}**`,
          gasto < qtd ? `_${fmt(qtd - gasto)} ${de.nome} não foram necessários — ficaram na sua carteira._` : null,
          `_Taxa: 1 ${para.nome} ≈ ${fmt(Math.ceil(gasto / recebido))} ${de.nome} · spread ${para.simbolo}${fmt(r.taxa)}_`,
          "",
          `**Sua carteira:** ${carteira}`,
        ], [
          `${de.simbolo}**${fmt(gasto)} ${de.nome}** → ${para.simbolo}**${fmt(recebido)} ${para.nome}**`,
          gasto < qtd ? `_${fmt(qtd - gasto)} ${de.nome} weren't needed — they stayed in your wallet._` : null,
          `_Rate: 1 ${para.nome} ≈ ${fmt(Math.ceil(gasto / recebido))} ${de.nome} · spread ${para.simbolo}${fmt(r.taxa)}_`,
          "",
          `**Your wallet:** ${carteira}`,
        ], [
          `${de.simbolo}**${fmt(gasto)} ${de.nome}** → ${para.simbolo}**${fmt(recebido)} ${para.nome}**`,
          gasto < qtd ? `_${fmt(qtd - gasto)} ${de.nome} no hicieron falta — se quedaron en tu cartera._` : null,
          `_Tasa: 1 ${para.nome} ≈ ${fmt(Math.ceil(gasto / recebido))} ${de.nome} · spread ${para.simbolo}${fmt(r.taxa)}_`,
          "",
          `**Tu cartera:** ${carteira}`,
        ]).filter((x) => x !== null).join("\n"), colour: COR.sucesso });
    }

    const m = texto.match(/^([\d.,]+)\s+(\S+)\s+(?:por|for)\s+([\d.,]+)\s+(\S+)$/i);
    if (!m) {
      const linhas = tr(ctx, [
        "**Duas formas de trocar**",
        `\`${citarInterno("game.cambio", P)} <qtd> <moeda> para <moeda>\` — **com o banco**, na hora`,
        `   ex.: \`${citarInterno("game.cambio", P)} 200 ouro para cristal\` · tudo: \`${citarInterno("game.cambio.tudo", P)} ouro para cristal\``,
        `\`${citarInterno("game.cambio", P)} <qtd> <moeda> por <qtd> <moeda>\` — oferta a **outro jogador**`,
        `   ex.: \`${citarInterno("game.cambio", P)} 100 ouro por 2 cristal\``,
        "_Só unidades inteiras: o banco usa só o que as unidades inteiras custam — o resto fica com você._",
        "",
        "**Moedas do mundo:**",
        ...moedas.map((x) => `${x.simbolo} **${x.nome}** \`${x.id}\` — você tem ${fmt(db.getSaldo(serverId, eu, x.id))}`),
        "",
        `\`${citarInterno("game.cambio", P)} <qtd> <moeda>\` — quanto isso vale em TODAS as moedas`,
        `\`${citarInterno("game.cambio.taxas", P)}\` — as taxas do banco agora`,
        `_O banco sempre troca, pela taxa do dia e um spread de ${(MERC.CFG.spread * 100).toFixed(0)}%._`,
        "_No balcão você define a taxa que quiser; quem aceitar, aceita._",
      ], [
        "**Two ways to exchange**",
        `\`${citarInterno("game.cambio", P)} <qty> <currency> to <currency>\` — **with the bank**, instantly`,
        `   e.g. \`${citarInterno("game.cambio", P)} 200 gold to crystal\` · everything: \`${citarInterno("game.cambio.tudo", P)} gold to crystal\``,
        `\`${citarInterno("game.cambio", P)} <qty> <currency> for <qty> <currency>\` — offer to **another player**`,
        `   e.g. \`${citarInterno("game.cambio", P)} 100 gold for 2 crystal\``,
        "_Whole units only: the bank uses just what the whole units cost — the rest stays with you._",
        "",
        "**World currencies:**",
        ...moedas.map((x) => `${x.simbolo} **${x.nome}** \`${x.id}\` — you have ${fmt(db.getSaldo(serverId, eu, x.id))}`),
        "",
        `\`${citarInterno("game.cambio", P)} <qty> <currency>\` — what that amount is worth in EVERY currency`,
        `\`${citarInterno("game.cambio.taxas", P)}\` — the bank's current rates`,
        `_The bank always trades, at the rate of the day and a ${(MERC.CFG.spread * 100).toFixed(0)}% spread._`,
        "_At the counter you set whatever rate you like; whoever accepts, accepts._",
      ], [
        "**Dos formas de cambiar**",
        `\`${citar("game.cambio", "es", P)} <cantidad> <moneda> to <moneda>\` — **con el banco**, al momento`,
        `   ej.: \`${citar("game.cambio", "es", P)} 200 gold to crystal\` · todo: \`${citar("game.cambio.tudo", "es", P)} gold to crystal\``,
        `\`${citar("game.cambio", "es", P)} <cantidad> <moneda> for <cantidad> <moneda>\` — oferta a **otro jugador**`,
        `   ej.: \`${citar("game.cambio", "es", P)} 100 gold for 2 crystal\``,
        "_Solo unidades enteras: el banco usa solo lo que cuestan las unidades enteras — el resto se queda contigo._",
        "",
        "**Monedas del mundo:**",
        ...moedas.map((x) => `${x.simbolo} **${x.nome}** \`${x.id}\` — tienes ${fmt(db.getSaldo(serverId, eu, x.id))}`),
        "",
        `\`${citar("game.cambio", "es", P)} <cantidad> <moneda>\` — cuánto vale eso en TODAS las monedas`,
        `\`${citar("game.cambio.taxas", "es", P)}\` — las tasas del banco ahora`,
        `_El banco siempre cambia, a la tasa del día y con un spread del ${(MERC.CFG.spread * 100).toFixed(0)}%._`,
        "_En el mostrador pones la tasa que quieras; quien acepte, acepta._",
      ]);
      if (moedas.length < 2) linhas.push("", tr(ctx,
        "_Só há uma moeda aqui — o câmbio precisa de pelo menos duas._",
        "_There's only one currency here — exchange needs at least two._",
        "_Aquí solo hay una moneda — el cambio necesita al menos dos._"));
      return enviarLista(sendEmbed, message.channel, {
        titulo: tr(ctx, "💱 Balcão de câmbio", "💱 Exchange counter", "💱 Mostrador de cambio"), linhas, colour: COR.info });
    }

    const [, qtdDe, nomeDe, qtdPara, nomePara] = m;
    const de = db.acharMoeda(serverId, nomeDe);
    const para = db.acharMoeda(serverId, nomePara);
    if (!de || !para || de.id === para.id) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Moedas inválidas", "❌ Invalid currencies", "❌ Monedas no válidas"),
        description: tr(ctx, "Precisam ser as duas moedas diferentes do mundo.", "They must be the world's two different currencies.", "Tienen que ser las dos monedas distintas del mundo."), colour: COR.erro });
    }
    if (![numeroDigitado(qtdDe), numeroDigitado(qtdPara)].every((x) => Number.isInteger(x) && x > 0)) {
      return sendEmbed(message.channel, { title: tr(ctx, "💱 Só unidades inteiras", "💱 Whole units only", "💱 Solo unidades enteras"), colour: COR.aviso,
        description: tr(ctx, "As duas quantias precisam ser números inteiros acima de zero.", "Both amounts must be whole numbers above zero.", "Las dos cantidades tienen que ser números enteros mayores que cero.") });
    }
    const saldo = db.getSaldo(serverId, eu, de.id);
    if (saldo + 1e-7 < numeroDigitado(qtdDe)) {
      return sendEmbed(message.channel, { title: tr(ctx, "💸 Saldo insuficiente", "💸 Not enough balance", "💸 Saldo insuficiente"),
        description: tr(ctx, `Você tem ${de.simbolo}${fmt(saldo)}.`, `You have ${de.simbolo}${fmt(saldo)}.`, `Tienes ${de.simbolo}${fmt(saldo)}.`), colour: COR.erro });
    }
    db.debitar(serverId, eu, de.id, numeroDigitado(qtdDe));
    const of = db.criarOferta({ serverId, tipo: "cambio", autorId: eu,
      moedaOferecida: de.id, qtdOferecida: numeroDigitado(qtdDe),
      moedaPedida: para.id, qtdPedida: numeroDigitado(qtdPara) });

    const ref = MERC.converter(numeroDigitado(qtdDe), de, para);
    return sendEmbed(message.channel, { title: tr(ctx, "💱 Oferta publicada", "💱 Offer published", "💱 Oferta publicada"),
      description: tr(ctx, [
        `Oferece **${fmt(qtdDe)} ${de.nome}** ${de.simbolo} por **${fmt(qtdPara)} ${para.nome}** ${para.simbolo}`,
        `_O sistema pagaria ~${fmt(ref.recebe)} — a sua taxa é ${numeroDigitado(qtdPara) < ref.recebe ? "melhor" : "pior"} para quem aceitar._`,
        "",
        `Oferta **#${of.id}** · o valor ficou em custódia comigo.`,
      ], [
        `Offering **${fmt(qtdDe)} ${de.nome}** ${de.simbolo} for **${fmt(qtdPara)} ${para.nome}** ${para.simbolo}`,
        `_The system would pay ~${fmt(ref.recebe)} — your rate is ${numeroDigitado(qtdPara) < ref.recebe ? "better" : "worse"} for whoever accepts._`,
        "",
        `Offer **#${of.id}** · the amount is held in escrow with me.`,
      ], [
        `Ofreces **${fmt(qtdDe)} ${de.nome}** ${de.simbolo} por **${fmt(qtdPara)} ${para.nome}** ${para.simbolo}`,
        `_El sistema pagaría ~${fmt(ref.recebe)} — tu tasa es ${numeroDigitado(qtdPara) < ref.recebe ? "mejor" : "peor"} para quien acepte._`,
        "",
        `Oferta **#${of.id}** · la cantidad queda en custodia conmigo.`,
      ]).join("\n"), colour: COR.sucesso });
  }

  // ── escambo: item por item ──
  if (["trocar", "escambo", "permuta"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"),
      description: tr(ctx, `Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${citar("game.criar", "es", P)}\`.`), colour: COR.aviso });

    const acao = args[1]?.toLowerCase();

    if (["aceitar", "aceito"].includes(acao)) {
      const id = parseInt(args[2], 10);
      const of = Number.isFinite(id) ? db.getOferta(id) : null;
      if (!of || of.tipo !== "troca" || of.estado !== "aberta" || of.serverId !== serverId) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Proposta indisponível", "❌ Proposal unavailable", "❌ Propuesta no disponible"),
          description: tr(ctx, `Veja as suas com \`${citarInterno("game.trocar", P)}\`.`, `See yours with \`${citarInterno("game.trocar", P)}\`.`, `Mira las tuyas con \`${citar("game.trocar", "es", P)}\`.`), colour: COR.erro });
      }
      if (of.alvoId && of.alvoId !== eu) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Não é para você", "❌ Not for you", "❌ No es para ti"),
          description: tr(ctx, "Essa proposta foi feita a outra pessoa.", "That proposal was made to someone else.", "Esa propuesta se le hizo a otra persona."), colour: COR.erro });
      }
      if (!db.temItem(serverId, eu, of.itemPedido)) {
        const pedido = db.getItem(of.itemPedido);
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Você não tem o que ele quer", "❌ You don't have what they want", "❌ No tienes lo que pide"),
          description: tr(ctx, `A proposta pede **${pedido?.nome ?? "?"}**.`, `The proposal asks for **${pedido?.nome ?? "?"}**.`, `La propuesta pide **${pedido?.nome ?? "?"}**.`), colour: COR.erro });
      }
      const slot = db.slotDoItem(serverId, eu, of.itemPedido);
      if (slot) db.desequipar(serverId, eu, slot);
      db.tirarItem(serverId, eu, of.itemPedido, 1);
      db.darItem(serverId, eu, of.itemOferecido);
      db.darItem(serverId, of.autorId, of.itemPedido);
      db.fecharOferta(of.id, "fechada", 0);
      return sendEmbed(message.channel, { title: tr(ctx, "🔄 Trocado", "🔄 Traded", "🔄 Intercambiado"),
        description: tr(ctx, `Você deu **${db.getItem(of.itemPedido)?.nome}** e levou **${db.getItem(of.itemOferecido)?.nome}**.`, `You gave **${db.getItem(of.itemPedido)?.nome}** and took **${db.getItem(of.itemOferecido)?.nome}**.`, `Diste **${db.getItem(of.itemPedido)?.nome}** y te llevaste **${db.getItem(of.itemOferecido)?.nome}**.`),
        colour: COR.sucesso });
    }

    const texto = args.slice(1).join(" ");
    const mm = texto.match(/^(.*?)\s+(?:por|for)\s+(.*)$/i);
    if (!mm) {
      const minhas = db.listarOfertas(serverId, { tipo: "troca" })
        .filter((o) => o.autorId === eu || !o.alvoId || o.alvoId === eu);
      const linhas = minhas.length ? minhas.map((o) => {
        const ofe = db.getItem(o.itemOferecido), ped = db.getItem(o.itemPedido);
        const quem = o.autorId === eu
          ? (en ? "you offer" : "você oferece")
          : (en ? "offered to you" : "oferecem a você");
        const quemEs = o.autorId === eu ? "tú ofreces" : "te ofrecen";
        return tr(ctx,
          `\`#${o.id}\` ${quem}: **${ofe?.nome}** por **${ped?.nome}**`,
          `\`#${o.id}\` ${quem}: **${ofe?.nome}** for **${ped?.nome}**`,
          `\`#${o.id}\` ${quemEs}: **${ofe?.nome}** por **${ped?.nome}**`);
      }) : [tr(ctx, "_Nenhuma proposta aberta._", "_No open proposals._", "_Ninguna propuesta abierta._")];
      linhas.push("", tr(ctx, `\`${citarInterno("game.trocar", P)} [@pessoa] <seu item> por <item dela>\``, `\`${citarInterno("game.trocar", P)} [@person] <your item> for <their item>\``, `\`${citar("game.trocar", "es", P)} [@usuario] <tu objeto> for <su objeto>\``),
        tr(ctx, `\`${citarInterno("game.trocar.aceitar", P)} <#>\` — fecha a troca`, `\`${citarInterno("game.trocar.aceitar", P)} <#>\` — closes the trade`, `\`${citar("game.trocar.aceitar", "es", P)} <#>\` — cierra el intercambio`));
      return enviarLista(sendEmbed, message.channel, {
        titulo: tr(ctx, "🔄 Escambo", "🔄 Barter", "🔄 Trueque"), linhas, colour: COR.info });
    }

    const alvoId = idEscrito(mm[0] ?? "") ?? message.mentionIds?.[0] ?? null;
    const meuNome = mm[1].replace(/<[@%#][^>]*>/g, "").trim();
    const item = db.acharItemPorNome(meuNome);
    const quer = db.acharItemPorNome(mm[2].trim());
    if (!item || !quer) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Item desconhecido", "❌ Unknown item", "❌ Objeto desconocido"),
        description: tr(ctx,
          `Não achei ${!item ? `**${meuNome}**` : `**${mm[2].trim()}**`}.`,
          `I couldn't find ${!item ? `**${meuNome}**` : `**${mm[2].trim()}**`}.`,
          `No encontré ${!item ? `**${meuNome}**` : `**${mm[2].trim()}**`}.`), colour: COR.erro });
    }
    if (!db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Você não tem isso", "❌ You don't have that", "❌ No tienes eso"),
        description: tr(ctx, `**${item.nome}** não está na sua mochila.`, `**${item.nome}** isn't in your bag.`, `**${item.nome}** no está en tu mochila.`), colour: COR.erro });
    }
    const slot = db.slotDoItem(serverId, eu, item.id);
    if (slot) db.desequipar(serverId, eu, slot);
    db.tirarItem(serverId, eu, item.id, 1);
    const of = db.criarOferta({ serverId, tipo: "troca", autorId: eu, alvoId,
      itemOferecido: item.id, itemPedido: quer.id });
    return sendEmbed(message.channel, { title: tr(ctx, "🔄 Proposta feita", "🔄 Proposal sent", "🔄 Propuesta enviada"),
      description: [
        `Oferece **${item.nome}** por **${quer.nome}**${alvoId ? ` a <@${alvoId}>` : " (aberta a qualquer um)"}`,
        "_Seu item ficou em custódia comigo._",
        "",
        `Proposta **#${of.id}** · quem aceitar: \`${citarInterno("game.trocar.aceitar", P)} ${of.id}\``,
      ].join("\n"), colour: COR.sucesso });
  }

  if (["item", "ficha-item", "preco", "preço", "price"].includes(sub)) {
    const busca = args.slice(1).join(" ").trim();
    if (!busca) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Qual item?",
        description: `\`${citarInterno("game.item", P)} <nome>\`\n\nEx.: \`${citarInterno("game.item", P)} Espada de Ferro\`\nVeja a lista com \`${citarInterno("game.catalogo", P)}\`.`,
        colour: COR.erro,
      }, {
        title: "❌ Which item?",
        description: `\`${citarInterno("game.item", P)} <name>\`\n\nE.g.: \`${citarInterno("game.item", P)} Espada de Ferro\`\nSee the list with \`${citarInterno("game.catalogo", P)}\`.`,
        colour: COR.erro,
      }, {
        title: "❌ ¿Qué objeto?",
        description: `\`${citar("game.item", "es", P)} <nombre>\`\n\nEj.: \`${citar("game.item", "es", P)} Iron Sword\`\nMira la lista con \`${citar("game.catalogo", "es", P)}\`.`,
        colour: COR.erro,
      }));
    }
    const item = db.acharItemPorNome(busca);
    if (!item) {
      return sendEmbed(message.channel, {
        title: tr(ctx, "❌ Item desconhecido", "❌ Unknown item", "❌ Objeto desconocido"),
        description: tr(ctx, `Não achei nenhum item chamado **${busca}**.`, `I couldn't find any item called **${busca}**.`, `No encontré ningún objeto llamado **${busca}**.`),
        colour: COR.erro });
    }

    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const est = db.getEstoque(serverId, item.id);
    const estoque = item.infinito ? null : (est?.quantidade ?? est?.base ?? 0);
    const preco = MERC.precoDeVenda(item, est, pSuave);
    const p = db.getPersonagem(serverId, eu);
    const carisma = p ? atributosComEquipamento(p, serverId, eu).carisma : 0;
    const recompra = MERC.precoDeRecompra(preco, carisma);
    const r = RARIDADE_INFO[item.raridade] ?? {};
    const si = SLOT_INFO[item.slot] ?? {};
    const temNaMochila = p ? (db.getInventario(serverId, eu).find((x) => x.id === item.id)?.quantidade ?? 0) : 0;

    const emCadaMoeda = db.listarMoedas(serverId).map((m) => {
      const c = MERC.custoEm(preco, moeda, m);
      const seu = db.getSaldo(serverId, eu, m.id);
      return `${m.simbolo} ${fmt(c)} ${idDigitavel(m, en)}${seu >= c ? " ✅" : ""}`;
    });

    const naoVende = item.especial || ["contrato", "pergaminho"].includes(item.slot);
    const linhas = [
      `${r.emoji ?? ""} **${item.nome}** — ${rotuloRaridade(item.raridade, rotuloLang(ctx, en))} · ${tr(ctx, "dificuldade", "difficulty", "dificultad")} ${item.dif ?? R.difDaRaridade(item.raridade)}${item.obra ? ` · _${item.obra}_` : ""}`,
      `${si.emoji ?? "•"} **${tr(ctx, "Vaga", "Slot", "Espacio")}:** ${rotuloSlot(item.slot, rotuloLang(ctx, en))}`,
      descreverItem(item, rotuloLang(ctx, en)),
      item.descricao?.pt ? `_${en ? item.descricao.en : item.descricao.pt}_` : null,
      "",
      ...(naoVende ? [tr(ctx, "✦ **Único** — o NPC nunca vende nem compra; entre jogadores, vale tudo (`" + citarInterno("game.mercado") + "`, `" + citarInterno("game.trocar") + "`).", "✦ **Unique** — the NPC never sells or buys it; between players, anything goes (`" + citarInterno("game.mercado") + "`, `" + citarInterno("game.trocar") + "`).", "✦ **Único** — el NPC nunca lo vende ni lo compra; entre jugadores, todo vale (`" + citar("game.mercado", "es") + "`, `" + citar("game.trocar", "es") + "`).")] : [
        `**${tr(ctx, "Preço", "Price", "Precio")}:** ${moeda.simbolo}${fmt(preco)}`,
        `**${tr(ctx, "O mercado te paga", "The market pays you", "El mercado te paga")}:** ${moeda.simbolo}${fmt(recompra)} _(${tr(ctx, "seu Carisma", "your Charisma", "tu Carisma")} ${carisma})_`,
        `**${tr(ctx, "Estoque", "Stock", "Stock")}:** ${item.infinito ? tr(ctx, "♾️ infinito", "♾️ infinite", "♾️ infinito") : `${fmt(estoque)} ${tr(ctx, "restante(s)", "left", "restante(s)")}`}`,
      ]),
      temNaMochila ? `**${tr(ctx, "Na sua mochila", "In your bag", "En tu mochila")}:** ${temNaMochila}` : null,
      ...(naoVende ? [] : ["", tr(ctx, "**Em cada moeda** _(✅ = dá para pagar)_", "**In each currency** _(✅ = you can afford it)_", "**En cada moneda** _(✅ = te alcanza)_"), ...emCadaMoeda, "",
        tr(ctx, `\`${citarInterno("game.comprar", P)} ${item.nome}\` · \`${citarInterno("game.comprar", P)} ${item.nome} com <moeda>\``, `\`${citarInterno("game.comprar", P)} ${item.nome}\` · \`${citarInterno("game.comprar", P)} ${item.nome} com <currency>\``, `\`${citar("game.comprar", "es", P)} ${item.nome}\` · \`${citar("game.comprar", "es", P)} ${item.nome} with <moneda>\``)]),
    ];
    return enviarLista(sendEmbed, message.channel, {
      titulo: tr(ctx, "📦 Item", "📦 Item", "📦 Objeto"), linhas: linhas.filter(Boolean), colour: COR.info,
      imagem: IMG.imagemDe(item.id, item.dados?.companheiro) });
  }

  // ── &game magias / magia / aprender — o grimório ──
  if (["magias", "magia", "grimorio", "grimório", "aprender", "spells", "spell", "learn"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, tr(ctx,
      { title: "🎭 Sem personagem", description: `Crie o seu com \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
      { title: "🎭 No character", description: `Create yours with \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
      { title: "🎭 Sin personaje", description: `Crea el tuyo con \`${citar("game.criar", "es", P)}\`.`, colour: COR.aviso }));

    const aprender = ["aprender", "learn"].includes(sub) || ["aprender", "learn", "comprar", "buy"].includes(String(args[1] ?? "").toLowerCase());
    const restoBruto = ["aprender", "learn"].includes(sub)
      ? args.slice(1).join(" ").trim()
      : args.slice(["aprender", "learn", "comprar", "buy"].includes(String(args[1] ?? "").toLowerCase()) ? 2 : 1).join(" ").trim();

    const moedaPadrao = garantirMoeda(serverId);
    const attr = atributosComEquipamento(p, serverId, eu);
    const partyM = CB.partyDe(serverId, eu, p);
    const attrEf = partyM.attr;   // com acessórios e implantes de atributo
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
          title: tr(ctx, "❌ Magia desconhecida", "❌ Unknown spell", "❌ Hechizo desconocido"),
          description: tr(ctx,
            `Não achei **${alvo}**. Veja a lista com \`${citarInterno("game.magias", P)}\`.`,
            `I couldn't find **${alvo}**. See the list with \`${citarInterno("game.magias", P)}\`.`,
            `No encontré **${alvo}**. Mira la lista con \`${citar("game.magias", "es", P)}\`.`),
          colour: COR.erro });
      }
      if (conhecidas.has(magia.id)) {
        return sendEmbed(message.channel, {
          title: tr(ctx, "📖 Você já conhece", "📖 Already known", "📖 Ya lo conoces"),
          description: tr(ctx,
            `**${magia.nome}** já está no seu grimório.`,
            `**${magia.nome}** is already in your grimoire.`,
            `**${magia.nome}** ya está en tu grimorio.`),
          colour: COR.aviso });
      }
      if (magia.unica) {
        return sendEmbed(message.channel, { title: tr(ctx, "✦ Magia única", "✦ Unique spell", "✦ Hechizo único"), colour: COR.aviso,
          description: tr(ctx, `**${magia.nome}** não é vendida — só sai como pergaminho de uma missão especial (\`${citarInterno("game.especiais", P)}\`).`,
            `**${magia.nomeEN ?? magia.nome}** isn't sold — it only comes as a scroll from a special mission (\`${citarInterno("game.especiais", P)}\`).`,
            `**${magia.nomeEN ?? magia.nome}** no se vende — solo sale como pergamino de una misión especial (\`${citar("game.especiais", "es", P)}\`).`) });
      }
      // D10: sem nível mínimo — atributo mínimo (Inteligência ≥ 5 × dificuldade − 4)
      if (!R.podeUsarMagia(magia, attrEf)) {
        return sendEmbed(message.channel, {
          title: tr(ctx, "🔒 Inteligência insuficiente", "🔒 Not enough Intelligence", "🔒 Inteligencia insuficiente"),
          description: tr(ctx,
            `**${magia.nome}** pede Inteligência **${magia.req}** — você tem ${attrEf.inteligencia}.`,
            `**${magia.nomeEN ?? magia.nome}** needs Intelligence **${magia.req}** — you have ${attrEf.inteligencia}.`,
            `**${magia.nomeEN ?? magia.nome}** pide Inteligencia **${magia.req}** — tienes ${attrEf.inteligencia}.`),
          colour: COR.aviso });
      }

      const preco = MAG.precoComCarisma(magia.preco, attr.carisma);
      const pag = moedaEscolhida
        ? (() => {
          const custo = moedaEscolhida.id === moedaPadrao.id
            ? preco
            : MERC.custoEm(preco, moedaPadrao, moedaEscolhida);
          return { moeda: moedaEscolhida, custo, convertido: moedaEscolhida.id !== moedaPadrao.id,
            semSaldo: db.getSaldo(serverId, eu, moedaEscolhida.id) < custo, escolhida: true };
        })()
        : moedaParaPagar(serverId, eu, preco);
      if (pag.semSaldo) {
        return sendEmbed(message.channel, {
          title: tr(ctx, "💸 Saldo insuficiente", "💸 Not enough balance", "💸 Saldo insuficiente"),
          description: tr(ctx,
            `**${magia.nome}** custa ${pag.moeda.simbolo}${fmt(pag.custo)} — você tem ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`,
            `**${magia.nome}** costs ${pag.moeda.simbolo}${fmt(pag.custo)} — you have ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`,
            `**${magia.nome}** cuesta ${pag.moeda.simbolo}${fmt(pag.custo)} — tienes ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`),
          colour: COR.erro });
      }

      jogadorPaga(serverId, eu, pag.moeda, pag.custo);
      db.aprenderMagia(serverId, eu, magia.id);

      // Aprender sem Mana para lançar é o erro clássico — o aviso vem junto.
      const depois = CB.juntar([CB.partyDe(serverId, eu)]);
      depois.manaTotal = depois.mana;
      const ativa = depois.magias.some((x) => x.id === magia.id || x.nome === magia.nome);
      const esc = MAG.ESCOLAS[magia.tipo] ?? {};
      return sendEmbed(message.channel, {
        title: tr(ctx, "📖 Magia aprendida", "📖 Spell learned", "📖 Hechizo aprendido"),
        description: tr(ctx, [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotulo ?? magia.tipo} · ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%`,
          `Pagou ${pag.moeda.simbolo}${fmt(pag.custo)}${pag.convertido ? ` _(preço era ${moedaPadrao.simbolo}${fmt(preco)})_` : ""}`,
          "",
          ativa
            ? `✅ Já está ativa — mana em uso: ${depois.manaGasta}/${depois.manaTotal}`
            : `⚠️ Ainda não cabe na sua mana (${depois.manaGasta}/${depois.manaTotal} em uso). Suba **Mana** com \`${citarInterno("game.pontos", P)} mana\`.`,
        ], [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotuloEN ?? magia.tipo} · ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%`,
          `Paid ${pag.moeda.simbolo}${fmt(pag.custo)}${pag.convertido ? ` _(price was ${moedaPadrao.simbolo}${fmt(preco)})_` : ""}`,
          "",
          ativa
            ? `✅ Active now — mana in use: ${depois.manaGasta}/${depois.manaTotal}`
            : `⚠️ It doesn't fit in your mana yet (${depois.manaGasta}/${depois.manaTotal} in use). Raise **Mana** with \`${citarInterno("game.pontos", P)} mana\`.`,
        ], [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotuloEN ?? magia.tipo} · ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%`,
          `Pagaste ${pag.moeda.simbolo}${fmt(pag.custo)}${pag.convertido ? ` _(el precio era ${moedaPadrao.simbolo}${fmt(preco)})_` : ""}`,
          "",
          ativa
            ? `✅ Ya está activo — maná en uso: ${depois.manaGasta}/${depois.manaTotal}`
            : `⚠️ Todavía no cabe en tu maná (${depois.manaGasta}/${depois.manaTotal} en uso). Sube **Mana** con \`${citar("game.pontos", "es", P)} mana\`.`,
        ]).join("\n"), colour: COR.sucesso });
    }

    // ── ficha de UMA magia ──
    if (!aprender && restoBruto) {
      const magia = MAG.acharMagia(restoBruto);
      if (magia) {
        const esc = MAG.ESCOLAS[magia.tipo] ?? {};
        const preco = MAG.precoComCarisma(magia.preco, attr.carisma);
        const emCada = db.listarMoedas(serverId).map((m) => {
          const c = MERC.custoEm(preco, moedaPadrao, m);
          return `${m.simbolo} ${fmt(c)} ${idDigitavel(m, en)}${db.getSaldo(serverId, eu, m.id) >= c ? " ✅" : ""}`;
        });
        const linhas = tr(ctx, [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotulo ?? magia.tipo}`,
          `**Custo de mana:** ${magia.custo} 🔷  ·  **Poder:** +${(magia.poder * 100).toFixed(0)}%`,
          `**Pede:** Inteligência ${magia.req}  ·  **Raridade:** ${rotuloRaridade(magia.raridade, false)}${magia.unica ? " · ✦ única (só pergaminho)" : ""}`,
          `**Preço:** ${moedaPadrao.simbolo}${fmt(preco)} _(já com o seu Carisma ${attr.carisma})_`,
          conhecidas.has(magia.id) ? "📖 **Você já conhece esta.**" : null,
          "",
          "**Em cada moeda** _(✅ = dá para pagar)_",
          ...emCada,
          "",
          `\`${citarInterno("game.aprender", P)} ${magia.nome}\` · \`${citarInterno("game.aprender", P)} ${magia.nome} com <moeda>\``,
        ], [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotuloEN ?? magia.tipo}`,
          `**Mana cost:** ${magia.custo} 🔷  ·  **Power:** +${(magia.poder * 100).toFixed(0)}%`,
          `**Needs:** Intelligence ${magia.req}  ·  **Rarity:** ${rotuloRaridade(magia.raridade, true)}${magia.unica ? " · ✦ unique (scroll only)" : ""}`,
          `**Price:** ${moedaPadrao.simbolo}${fmt(preco)} _(your Charisma ${attr.carisma} is already applied)_`,
          conhecidas.has(magia.id) ? "📖 **You already know this one.**" : null,
          "",
          "**In each currency** _(✅ = you can afford it)_",
          ...emCada,
          "",
          `\`${citarInterno("game.aprender", P)} ${magia.nome}\` · \`${citarInterno("game.aprender", P)} ${magia.nome} com <currency>\``,
        ], [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotuloEN ?? magia.tipo}`,
          `**Coste de maná:** ${magia.custo} 🔷  ·  **Poder:** +${(magia.poder * 100).toFixed(0)}%`,
          `**Pide:** Inteligencia ${magia.req}  ·  **Rareza:** ${rotuloRaridade(magia.raridade, true)}${magia.unica ? " · ✦ único (solo pergamino)" : ""}`,
          `**Precio:** ${moedaPadrao.simbolo}${fmt(preco)} _(ya con tu Carisma ${attr.carisma})_`,
          conhecidas.has(magia.id) ? "📖 **Ya conoces este.**" : null,
          "",
          "**En cada moneda** _(✅ = te alcanza)_",
          ...emCada,
          "",
          `\`${citar("game.aprender", "es", P)} ${magia.nome}\` · \`${citar("game.aprender", "es", P)} ${magia.nome} with <moneda>\``,
        ].filter(Boolean));
        return enviarLista(sendEmbed, message.channel, {
          titulo: tr(ctx, "✦ Magia", "✦ Spell", "✦ Hechizo"), linhas: linhas.filter(Boolean), colour: COR.info });
      }
      return sendEmbed(message.channel, {
        title: tr(ctx, "❌ Magia desconhecida", "❌ Unknown spell", "❌ Hechizo desconocido"),
        description: tr(ctx,
          `Não achei **${restoBruto}**. Veja o catálogo inteiro com \`${citarInterno("game.magias", P)}\`.`,
          `I couldn't find **${restoBruto}**. See the whole catalog with \`${citarInterno("game.magias", P)}\`.`,
          `No encontré **${restoBruto}**. Mira el catálogo entero con \`${citar("game.magias", "es", P)}\`.`),
        colour: COR.erro });
    }

    // ── a lista ──
    const estado = CB.juntar([partyM]);
    estado.manaTotal = estado.mana;
    const ativas = new Set(estado.magias.map((m) => m.nome));
    const linhas = [];
    linhas.push(tr(ctx,
      `**Mana em uso: ${estado.manaGasta}/${estado.manaTotal}** — as magias entram da mais forte para a mais fraca, enquanto a mana durar.`,
      `**Mana in use: ${estado.manaGasta}/${estado.manaTotal}** — spells enter from the strongest down, while the mana lasts.`,
      `**Maná en uso: ${estado.manaGasta}/${estado.manaTotal}** — los hechizos entran del más fuerte al más débil, mientras dure el maná.`));
    linhas.push("");

    for (const tipo of ["ataque", "suporte"]) {
      const esc = MAG.ESCOLAS[tipo];
      linhas.push(`${esc.emoji} **${en ? esc.rotuloEN : esc.rotulo}**`);
      for (const m of MAG.CATALOGO.filter((x) => x.tipo === tipo && (!x.unica || conhecidas.has(x.id)))) {
        const tem = conhecidas.has(m.id);
        const marca = tem ? (ativas.has(m.nome) ? " ✅" : R.podeUsarMagia(m, attrEf) ? " 💤" : " 🔒") : "";
        const preco = MAG.precoComCarisma(m.preco, attr.carisma);
        const trava = !R.podeUsarMagia(m, attrEf) ? ` 🔒Int ${m.req}` : "";
        linhas.push(tem
          ? `   **${m.nome}**${marca} — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}%`
          : `   **${m.nome}**${trava} — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}% · ${moedaPadrao.simbolo}${fmt(preco)}`);
      }
      linhas.push("");
    }
    linhas.push(tr(ctx,
      "_✅ ativa · 💤 conhecida mas não cabe na mana · 🔒 pede mais Inteligência (sem nível mínimo)_",
      "_✅ active · 💤 known but doesn't fit in your mana · 🔒 needs more Intelligence (no level minimum)_",
      "_✅ activo · 💤 conocido pero no cabe en tu maná · 🔒 pide más Inteligencia (sin nivel mínimo)_"));
    linhas.push(tr(ctx,
      `\`${citarInterno("game.magia", P)} <nome>\` — detalhes · \`${citarInterno("game.aprender", P)} <nome> [com <moeda>]\``,
      `\`${citarInterno("game.magia", P)} <name>\` — details · \`${citarInterno("game.aprender", P)} <name> [with <currency>]\``,
      `\`${citar("game.magia", "es", P)} <nombre>\` — detalles · \`${citar("game.aprender", "es", P)} <nombre> [with <moneda>]\``));
    if (estado.magiasDoGrimorio === 0) {
      linhas.push(tr(ctx,
        "_Os followers também trazem magias — dividem a mesma mana._",
        "_Followers also bring their own spells — they share the same mana pool._",
        "_Los compañeros también traen sus hechizos — comparten el mismo maná._"));
    }
    return enviarLista(sendEmbed, message.channel, {
      titulo: tr(ctx, "✦ Grimório", "✦ Grimoire", "✦ Grimorio"), linhas, colour: COR.info });
  }

  if (["comprar", "loja"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"),
      description: tr(ctx, `Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${citar("game.criar", "es", P)}\`.`), colour: COR.aviso });

    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    let busca = args.slice(1).join(" ").trim();

    let moedaEscolhida = null;
    const mComMoeda = busca.match(/^(.*?)\s+(?:com|with|em|in)\s+(\S+)$/i);
    if (mComMoeda) {
      const achada = db.acharMoeda(serverId, mComMoeda[2]);
      if (achada) { busca = mComMoeda[1].trim(); moedaEscolhida = achada; }
    }

    const fLoja = lerFiltroDeItens(busca);
    if (!busca || /^\d+$/.test(busca) || ((fLoja.raridade || fLoja.tipos) && !fLoja.resto)) {
      // a loja mostra a raridade da sua faixa (ou a pedida), separada por tipo: ninguém lê 280 itens
      const rar = fLoja.raridade ?? (/^\d+$/.test(busca) ? R.faixaDaDif(Math.max(1, Math.min(10, parseInt(busca, 10)))).raridade : R.faixaDoNivel(p.nivel).raridade);
      const itens = db.listarItens({ raridade: rar }).filter((i) => !i.especial && !["contrato", "pergaminho"].includes(i.slot) && (!fLoja.tipos || fLoja.tipos.includes(tipoDoItem(i))))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      const linhas = [tr(ctx, `${RARIDADE_INFO[rar].emoji} **${rotuloRaridade(rar, false)}** — outras raridades: \`${citarInterno("game.comprar", P)} <raridade>\` · um tipo só: \`${citarInterno("game.comprar", P)} ${rar} fogo\``,
        `${RARIDADE_INFO[rar].emoji} **${rotuloRaridade(rar, true)}** — other rarities: \`${citarInterno("game.comprar", P)} <rarity>\` · one type: \`${citarInterno("game.comprar", P)} ${palavraRaridade(rar, true)} firearms\``,
        `${RARIDADE_INFO[rar].emoji} **${rotuloRaridade(rar, true)}** — otras rarezas: \`${citar("game.comprar", "es", P)} <rareza>\` · un solo tipo: \`${citar("game.comprar", "es", P)} ${palavraRaridade(rar, true)} firearms\``)];
      for (const [t, l] of agruparPorTipo(itens)) {
        linhas.push("", `${TIPOS_ITEM[t].emoji} **${rotuloTipo(t, rotuloLang(ctx, en))}**`);
        for (const i of l) {
          const est = db.getEstoque(serverId, i.id);
          const preco = MERC.precoDeVenda(i, est, pSuave);
          const qtd = i.infinito ? "♾️" : `${est?.quantidade ?? est?.base ?? 10}un`;
          linhas.push(`   **${i.nome}** — ${moeda.simbolo}${fmt(preco)} _(${qtd})_${i.obra ? ` · _${i.obra}_` : ""}`);
        }
      }
      if (!itens.length) linhas.push("", tr(ctx, "_Nada desse tipo nesta raridade._", "_Nothing of that type in this rarity._", "_Ningún objeto de ese tipo en esta rareza._"));
      linhas.push("", tr(ctx,
        `_\`${citarInterno("game.comprar", P)} <item>\` · seu saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}_`,
        `_\`${citarInterno("game.comprar", P)} <item>\` · your balance: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}_`,
        `_\`${citar("game.comprar", "es", P)} <objeto>\` · tu saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}_`));
      return enviarLista(sendEmbed, message.channel, {
        titulo: tr(ctx, "🏪 Mercado", "🏪 Market", "🏪 Mercado"), linhas, colour: COR.info });
    }

    const item = db.acharItemPorNome(busca);
    if (!item) return sendEmbed(message.channel, { title: tr(ctx, "❌ Item desconhecido", "❌ Unknown item", "❌ Objeto desconocido"),
      description: tr(ctx, `Não achei **${busca}** no mercado.`, `I couldn't find **${busca}** in the market.`, `No encontré **${busca}** en el mercado.`), colour: COR.erro });
    if (item.especial || ["contrato", "pergaminho"].includes(item.slot)) {
      return sendEmbed(message.channel, { title: tr(ctx, "✦ O NPC não vende", "✦ Not sold by the NPC", "✦ El NPC no lo vende"), colour: COR.aviso,
        description: tr(ctx, `**${item.nome}** é único: só sai de missão especial ou chefe — ou de outro jogador (\`${citarInterno("game.mercado", P)}\`).`,
          `**${item.nome}** is unique: it only comes from a special mission or a boss — or from another player (\`${citarInterno("game.mercado", P)}\`).`,
          `**${item.nome}** es único: solo sale de una misión especial o de un jefe — o de otro jugador (\`${citar("game.mercado", "es", P)}\`).`) });
    }

    const est = db.getEstoque(serverId, item.id);
    if (!item.infinito && (est?.quantidade ?? est?.base ?? 10) <= 0) {
      return sendEmbed(message.channel, { title: tr(ctx, "📦 Esgotado", "📦 Sold out", "📦 Agotado"),
        description: tr(ctx, `**${item.nome}** acabou no mercado. Itens finitos voltam quando alguém vende.`, `**${item.nome}** ran out in the market. Finite items return when someone sells.`, `**${item.nome}** se agotó en el mercado. Los objetos finitos vuelven cuando alguien vende.`), colour: COR.aviso });
    }
    const preco = MERC.precoDeVenda(item, est, pSuave);
    const pag = moedaEscolhida
      ? (() => {
        const custo = moedaEscolhida.id === moeda.id
          ? preco
          : MERC.custoEm(preco, moeda, moedaEscolhida);
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
        ? tr(ctx,
          `\nEm ${pag.moeda.nome} dá ${pag.moeda.simbolo}${fmt(pag.custo)} — você tem ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`,
          `\nIn ${pag.moeda.nome} that's ${pag.moeda.simbolo}${fmt(pag.custo)} — you have ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`,
          `\nEn ${pag.moeda.nome} son ${pag.moeda.simbolo}${fmt(pag.custo)} — tienes ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`)
        : "";
      return sendEmbed(message.channel, { title: tr(ctx, "💸 Saldo insuficiente", "💸 Not enough balance", "💸 Saldo insuficiente"),
        description: tr(ctx, `**${item.nome}** custa ${moeda.simbolo}${fmt(preco)}.${emMoeda}\nVocê tem: ${carteira}.`, `**${item.nome}** costs ${moeda.simbolo}${fmt(preco)}.${emMoeda}\nYou have: ${carteira}.`, `**${item.nome}** cuesta ${moeda.simbolo}${fmt(preco)}.${emMoeda}\nTienes: ${carteira}.`),
        colour: COR.erro });
    }
    jogadorPaga(serverId, eu, pag.moeda, pag.custo);
    db.darItem(serverId, eu, item.id);
    if (!item.infinito) db.ajustarEstoque(serverId, item.id, -1);
    return sendEmbed(message.channel, { title: tr(ctx, "🛒 Comprado", "🛒 Purchased", "🛒 Comprado"),
      description: tr(ctx, [
        `${RARIDADE_INFO[item.raridade]?.emoji ?? ""} **${item.nome}** — ${descreverItem(item, false)}`,
        `Pagou ${pag.moeda.simbolo}${fmt(pag.custo)} · resta ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}`,
        pag.convertido ? `_(preço era ${moeda.simbolo}${fmt(preco)}; pagou em ${pag.moeda.nome} pela taxa do dia)_` : "",
        "",
        `_Equipe com \`${citarInterno("game.equipar", P)} ${item.nome}\`._`,
      ], [
        `${RARIDADE_INFO[item.raridade]?.emoji ?? ""} **${item.nome}** — ${descreverItem(item, true)}`,
        `Paid ${pag.moeda.simbolo}${fmt(pag.custo)} · ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))} left`,
        pag.convertido ? `_(the price was ${moeda.simbolo}${fmt(preco)}; paid in ${pag.moeda.nome} at today's rate)_` : "",
        "",
        `_Equip it with \`${citarInterno("game.equipar", P)} ${item.nome}\`._`,
      ], [
        `${RARIDADE_INFO[item.raridade]?.emoji ?? ""} **${item.nome}** — ${descreverItem(item, true)}`,
        `Pagaste ${pag.moeda.simbolo}${fmt(pag.custo)} · te quedan ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}`,
        pag.convertido ? `_(el precio era ${moeda.simbolo}${fmt(preco)}; pagaste en ${pag.moeda.nome} a la tasa del día)_` : "",
        "",
        `_Equípalo con \`${citar("game.equipar", "es", P)} ${item.nome}\`._`,
      ]).join("\n"), colour: COR.sucesso });
  }

  if (["vender"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"),
      description: tr(ctx, `Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${citar("game.criar", "es", P)}\`.`), colour: COR.aviso });
    const busca = args.slice(1).join(" ").trim();
    if (!busca) return sendEmbed(message.channel, { title: tr(ctx, "❌ Vender o quê?", "❌ Sell what?", "❌ ¿Vender qué?"),
      description: tr(ctx,
        `\`${citarInterno("game.vender", P)} <item>\`\n\nO mercado paga **abaixo** do preço de venda — seu ✨Carisma melhora a oferta.`,
        `\`${citarInterno("game.vender", P)} <item>\`\n\nThe market pays **below** the sale price — your ✨Charisma improves the offer.`,
        `\`${citar("game.vender", "es", P)} <objeto>\`\n\nEl mercado paga **por debajo** del precio de venta — tu ✨Carisma mejora la oferta.`),
      colour: COR.erro });

    const item = db.acharItemPorNome(busca);
    if (!item || !db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: tr(ctx, "❌ Você não tem isso", "❌ You don't have that", "❌ No tienes eso"),
        description: tr(ctx, `**${busca}** não está na sua mochila.`, `**${busca}** isn't in your bag.`, `**${busca}** no está en tu mochila.`), colour: COR.erro });
    }
    if (item.especial || ["contrato", "pergaminho"].includes(item.slot)) {
      return sendEmbed(message.channel, { title: tr(ctx, "✦ Isso o mercador não compra", "✦ The merchant doesn't buy that", "✦ El mercader no compra eso"), colour: COR.aviso,
        description: tr(ctx, `Só outro jogador. \`${citarInterno("game.mercado.vender", P)} ${item.nome} <preço>\` · \`${citarInterno("game.trocar", P)}\``,
          `Only another player. \`${citarInterno("game.mercado.vender", P)} ${item.nome} <price>\` · \`${citarInterno("game.trocar", P)}\``,
          `Solo otro jugador. \`${citar("game.mercado.vender", "es", P)} ${item.nome} <precio>\` · \`${citar("game.trocar", "es", P)}\``) });
    }
    // sai de todas as vagas se for a última unidade
    const tenho = db.getInventario(serverId, eu).find((x) => x.id === item.id)?.quantidade ?? 0;
    const eqV = db.getEquipado(serverId, eu), vagas = db.SLOTS.filter((s) => eqV[s]?.id === item.id);
    const slot = vagas.length >= tenho ? vagas[0] ?? null : null;
    if (slot) db.desequipar(serverId, eu, slot);

    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const attr = atributosComEquipamento(p, serverId, eu);
    const precoVenda = MERC.precoDeVenda(item, db.getEstoque(serverId, item.id), pSuave);
    const recebe = MERC.precoDeRecompra(precoVenda, attr.carisma);

    db.tirarItem(serverId, eu, item.id, 1);
    if (!item.infinito) db.ajustarEstoque(serverId, item.id, +1);
    const pago = pagarAoJogador(serverId, eu, db.getMoeda(serverId, moeda.id), recebe);

    return sendEmbed(message.channel, { title: tr(ctx, "💵 Vendido", "💵 Sold", "💵 Vendido"),
      description: tr(ctx, [
        `**${item.nome}** → ${moeda.simbolo}${fmt(pago)}`,
        `_O mercado vende por ${moeda.simbolo}${fmt(precoVenda)}; com seu Carisma (${attr.carisma}) você tirou ${(MERC.fatorRecompra(attr.carisma) * 100).toFixed(0)}%._`,
        slot ? "\n_Estava equipado — foi desequipado._" : "",
      ], [
        `**${item.nome}** → ${moeda.simbolo}${fmt(pago)}`,
        `_The market sells for ${moeda.simbolo}${fmt(precoVenda)}; with your Charisma (${attr.carisma}) you got ${(MERC.fatorRecompra(attr.carisma) * 100).toFixed(0)}%._`,
        slot ? "\n_It was equipped — I unequipped it._" : "",
      ], [
        `**${item.nome}** → ${moeda.simbolo}${fmt(pago)}`,
        `_El mercado lo vende por ${moeda.simbolo}${fmt(precoVenda)}; con tu Carisma (${attr.carisma}) sacaste un ${(MERC.fatorRecompra(attr.carisma) * 100).toFixed(0)}%._`,
        slot ? "\n_Estaba equipado — lo desequipé._" : "",
      ].filter(Boolean)).filter(Boolean).join("\n"), colour: COR.sucesso });
  }

  // ── resetar pontos (respec, pago) — 2 out 2026 ──
  // Devolve todos os pontos gastos para redistribuir. Os atributos voltam à
  // base do nível (1 + 1 a cada 2 níveis) e o que estava acima disso vira
  // ponto livre de novo. Custa Ouro (cresce com o nível e segue o P, como
  // tudo no mercado) — o dinheiro volta para o banco.
  if (["resetar", "respec", "redistribuir", "reset"].includes(sub) && ["pontos", "points", "atributos"].includes(String(args[1] ?? "").toLowerCase())) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"), description: tr(ctx, `\`${citarInterno("game.criar", P)}\``, `\`${citarInterno("game.criar", P)}\``, `\`${citar("game.criar", "es", P)}\``), colour: COR.aviso });
    const base = 1 + baseDoNivel(p.nivel ?? 1);
    let devolver = 0;
    for (const a of db.ATRIBUTOS) devolver += Math.max(0, (p[a] ?? 1) - base);
    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const preco = Math.max(1, Math.round(RESPEC_POR_NIVEL * (p.nivel ?? 1) * MERC.mult(pSuave)));
    if (!devolver) {
      return sendEmbed(message.channel, { title: tr(ctx, "🔄 Nada para resetar", "🔄 Nothing to reset", "🔄 Sin puntos que restablecer"), colour: COR.info,
        description: tr(ctx, "Você não gastou nenhum ponto acima da base do seu nível.", "You haven't spent any points above your level's base.", "No gastaste ningún punto por encima de la base de tu nivel.") });
    }
    if (!args.slice(2).some((x) => ["confirmar", "confirm"].includes(String(x).toLowerCase()))) {
      return sendEmbed(message.channel, { title: tr(ctx, "🔄 Resetar pontos", "🔄 Reset points", "🔄 Restablecer puntos"), colour: COR.aviso, description: [
        tr(ctx, `Todos os atributos voltam à base do nível ${p.nivel} (**${base}** cada) e **${devolver}** ponto(s) voltam para você gastar de novo.`,
          `All attributes go back to the level-${p.nivel} base (**${base}** each) and **${devolver}** point(s) come back to spend again.`,
          `Todos los atributos vuelven a la base del nivel ${p.nivel} (**${base}** cada uno) y **${devolver}** punto(s) vuelven para que los gastes de nuevo.`),
        tr(ctx, `**Preço:** ${moeda.simbolo} ${fmt(preco)} ${moeda.nome} · você tem ${fmt(db.getSaldo(serverId, eu, moeda.id))}`,
          `**Price:** ${moeda.simbolo} ${fmt(preco)} ${moeda.nome} · you have ${fmt(db.getSaldo(serverId, eu, moeda.id))}`,
          `**Precio:** ${moeda.simbolo} ${fmt(preco)} ${moeda.nome} · tienes ${fmt(db.getSaldo(serverId, eu, moeda.id))}`),
        "",
        tr(ctx, `\`${citarInterno("game", P)} resetar pontos confirmar\``, `\`${citarInterno("game", P)} respec points confirm\``, `\`${citar("game", "es", P)} respec points confirm\``),
      ].join("\n") });
    }
    if (db.getSaldo(serverId, eu, moeda.id) < preco) {
      return sendEmbed(message.channel, { title: tr(ctx, "🔄 Não dá ainda", "🔄 Not enough", "🔄 Todavía no alcanza"), colour: COR.aviso,
        description: tr(ctx, `Custa ${moeda.simbolo} ${fmt(preco)}; você tem ${fmt(db.getSaldo(serverId, eu, moeda.id))}.`, `It costs ${moeda.simbolo} ${fmt(preco)}; you have ${fmt(db.getSaldo(serverId, eu, moeda.id))}.`, `Cuesta ${moeda.simbolo} ${fmt(preco)}; tienes ${fmt(db.getSaldo(serverId, eu, moeda.id))}.`) });
    }
    jogadorPaga(serverId, eu, moeda, preco);
    const campos = { pontos: (p.pontos ?? 0) + devolver };
    for (const a of db.ATRIBUTOS) campos[a] = base;
    db.salvarPersonagem(serverId, eu, campos);
    return sendEmbed(message.channel, { title: tr(ctx, "🔄 Pontos resetados", "🔄 Points reset", "🔄 Puntos restablecidos"), colour: COR.sucesso, description: tr(ctx,
      `**${devolver}** ponto(s) de volta — **${fmt(campos.pontos)}** livres agora. \`${citarInterno("game.pontos", P)} <atributo> [quantos]\``,
      `**${devolver}** point(s) back — **${fmt(campos.pontos)}** free now. \`${citarInterno("game.pontos", P)} <attribute> [how many]\``,
      `**${devolver}** punto(s) de vuelta — **${fmt(campos.pontos)}** libres ahora. \`${citar("game.pontos", "es", P)} <atributo> [cuántos]\``) });
  }

  // ── contratar mercenário ──
  if (["contratar", "recrutar"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"),
      description: tr(ctx, `Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${citar("game.criar", "es", P)}\`.`), colour: COR.aviso });
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
        const preco = Math.round(f.preco * MERC.mult(pSuave) * desconto);
        return `${r.emoji ?? ""}${cls.emoji ?? ""} **${f.nome}** _(${en ? cls.rotuloEN : cls.rotulo})_ — ${moeda.simbolo}${fmt(preco)}`;
      });
      linhas.push("", tr(ctx,
        `_Seu Carisma (${attr.carisma}) dá **${((1 - desconto) * 100).toFixed(0)}%** de desconto._`,
        `_Your Charisma (${attr.carisma}) gives a **${((1 - desconto) * 100).toFixed(0)}%** discount._`,
        `_Tu Carisma (${attr.carisma}) te da un **${((1 - desconto) * 100).toFixed(0)}%** de descuento._`),
        tr(ctx,
          `_Saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))} · \`${citarInterno("game.contratar", P)} <nome>\`_`,
          `_Balance: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))} · \`${citarInterno("game.contratar", P)} <name>\`_`,
          `_Saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))} · \`${citar("game.contratar", "es", P)} <nombre>\`_`));
      return enviarLista(sendEmbed, message.channel, {
        titulo: tr(ctx, "🤝 Mercenários disponíveis", "🤝 Mercenaries available", "🤝 Mercenarios disponibles"), linhas, colour: COR.info });
    }

    const cat = db.acharFollowerCatalogo(busca);
    if (!cat) return sendEmbed(message.channel, { title: tr(ctx, "❌ Não conheço", "❌ I don't know that", "❌ No lo conozco"),
      description: tr(ctx, `Não achei **${busca}**.`, `I couldn't find **${busca}**.`, `No encontré **${busca}**.`), colour: COR.erro });
    if (cat.dados?.unico) {
      return sendEmbed(message.channel, { title: tr(ctx, "✦ Não se contrata", "✦ Not for hire", "✦ No se contrata"), colour: COR.aviso,
        description: tr(ctx, `**${cat.nome}** só sai como contrato, uma vez por pessoa — \`${citarInterno("game.chefes", P)}\` · \`${citarInterno("game.especiais", P)}\`.`, `**${cat.nome}** only comes as a contract, once per person — \`${citarInterno("game.chefes", P)}\` · \`${citarInterno("game.especiais", P)}\`.`, `**${cat.nome}** solo sale como contrato, una vez por persona — \`${citar("game.chefes", "es", P)}\` · \`${citar("game.especiais", "es", P)}\`.`) });
    }
    if (cat.soDungeon || !cat.preco) {
      return sendEmbed(message.channel, { title: tr(ctx, "🗝️ Não está à venda", "🗝️ Not for sale", "🗝️ No está a la venta"),
        description: tr(ctx, `**${cat.nome}** só aparece como loot de dungeon.`, `**${cat.nome}** only shows up as dungeon loot.`, `**${cat.nome}** solo aparece como botín de mazmorra.`), colour: COR.aviso });
    }
    const preco = Math.round(cat.preco * MERC.mult(pSuave) * desconto);
    const pag = moedaParaPagar(serverId, eu, preco);
    if (pag.semSaldo) {
      const carteira = db.carteiraDe(serverId, eu)
        .map((c) => { const m = db.getMoeda(serverId, c.moedaId); return `${m?.simbolo ?? ""}${fmt(c.quantidade)}`; })
        .join(" · ") || "nada";
      return sendEmbed(message.channel, { title: tr(ctx, "💸 Saldo insuficiente", "💸 Not enough balance", "💸 Saldo insuficiente"),
        description: tr(ctx, `**${cat.nome}** custa ${moeda.simbolo}${fmt(preco)}.\nVocê tem: ${carteira}.`, `**${cat.nome}** costs ${moeda.simbolo}${fmt(preco)}.\nYou have: ${carteira}.`, `**${cat.nome}** cuesta ${moeda.simbolo}${fmt(preco)}.\nTienes: ${carteira}.`), colour: COR.erro });
    }
    jogadorPaga(serverId, eu, pag.moeda, pag.custo);
    db.recrutarFollower(serverId, eu, cat.id, p.nivel);
    const cls = FOL.CLASSES[cat.classe] ?? {};
    return sendEmbed(message.channel, { title: tr(ctx, "🤝 Contratado", "🤝 Hired", "🤝 Contratado"),
      description: tr(ctx, [
        `${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotulo}, nv ${p.nivel})_ entrou para o seu grupo.`,
        `Pagou ${pag.moeda.simbolo}${fmt(pag.custo)} · resta ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}`,
        pag.convertido ? `_(preço era ${moeda.simbolo}${fmt(preco)}; pagou em ${pag.moeda.nome})_` : "",
        "",
        `_Leve com \`${citarInterno("game.follower.levar", P)} ${cat.nome}\`._`,
      ], [
        `${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotuloEN}, lv ${p.nivel})_ joined your group.`,
        `Paid ${pag.moeda.simbolo}${fmt(pag.custo)} · ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))} left`,
        pag.convertido ? `_(the price was ${moeda.simbolo}${fmt(preco)}; paid in ${pag.moeda.nome})_` : "",
        "",
        `_Take them along with \`${citarInterno("game.follower.levar", P)} ${cat.nome}\`._`,
      ], [
        `${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotuloEN}, nv ${p.nivel})_ se unió a tu grupo.`,
        `Pagaste ${pag.moeda.simbolo}${fmt(pag.custo)} · te quedan ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}`,
        pag.convertido ? `_(el precio era ${moeda.simbolo}${fmt(preco)}; pagaste en ${pag.moeda.nome})_` : "",
        "",
        `_Llévalo con \`${citar("game.follower.levar", "es", P)} ${cat.nome}\`._`,
      ]).join("\n"), colour: COR.sucesso });
  }

  // ── descanso pago ──
  if (["descansar", "descanso"].includes(sub)) {
    const meus = db.listarFollowersDe(serverId, eu);
    const cansados = meus.filter((f) => energiaAtual(f) < 5);
    if (!cansados.length) {
      return sendEmbed(message.channel, { title: tr(ctx, "😌 Todos descansados", "😌 Everyone rested", "😌 Todos descansados"),
        description: tr(ctx, "Ninguém precisa de descanso agora.", "Nobody needs rest right now.", "Nadie necesita descanso ahora."), colour: COR.info });
    }
    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const faltando = cansados.reduce((acc, f) => acc + (5 - energiaAtual(f)), 0);
    const custo = Math.max(1, Math.round(faltando * 25 * MERC.mult(pSuave)));
    const saldo = db.getSaldo(serverId, eu, moeda.id);

    if (!["confirmar", "confirm"].includes(args[1]?.toLowerCase())) {
      return sendEmbed(message.channel, { title: tr(ctx, "🛏️ Descanso pago", "🛏️ Rest paid", "🛏️ Descanso de pago"),
        description: tr(ctx, [
          `Restaurar **${faltando}** ponto(s) de energia de **${cansados.length}** companheiro(s).`,
          `Custo: ${moeda.simbolo}${fmt(custo)} · seu saldo: ${moeda.simbolo}${fmt(saldo)}`,
          "",
          `Confirme com \`${citarInterno("game.descansar.confirmar", P)}\`.`,
          "_A energia também volta sozinha: 1 por hora._",
        ], [
          `Restore **${faltando}** energy point(s) for **${cansados.length}** companion(s).`,
          `Cost: ${moeda.simbolo}${fmt(custo)} · your balance: ${moeda.simbolo}${fmt(saldo)}`,
          "",
          `Confirm with \`${citarInterno("game.descansar.confirmar", P)}\`.`,
          "_Energy also comes back on its own: 1 per hour._",
        ], [
          `Restaurar **${faltando}** punto(s) de energía de **${cansados.length}** compañero(s).`,
          `Coste: ${moeda.simbolo}${fmt(custo)} · tu saldo: ${moeda.simbolo}${fmt(saldo)}`,
          "",
          `Confirma con \`${citar("game.descansar.confirmar", "es", P)}\`.`,
          "_La energía también vuelve sola: 1 por hora._",
        ]).join("\n"), colour: COR.aviso });
    }
    const pag = moedaParaPagar(serverId, eu, custo);
    if (pag.semSaldo) {
      return sendEmbed(message.channel, { title: tr(ctx, "💸 Saldo insuficiente", "💸 Not enough balance", "💸 Saldo insuficiente"),
        description: tr(ctx, `Precisa de ${moeda.simbolo}${fmt(custo)} (ou equivalente em outra moeda).`, `You need ${moeda.simbolo}${fmt(custo)} (or the equivalent in another currency).`, `Necesitas ${moeda.simbolo}${fmt(custo)} (o el equivalente en otra moneda).`), colour: COR.erro });
    }
    jogadorPaga(serverId, eu, pag.moeda, pag.custo);
    for (const f of cansados) db.salvarFollower(f.id, { energia: 5, energiaEm: Date.now() });
    return sendEmbed(message.channel, { title: tr(ctx, "🛏️ Descansaram", "🛏️ They rested", "🛏️ Descansaron"),
      description: tr(ctx, `**${cansados.length}** companheiro(s) com energia cheia. Pagou ${pag.moeda.simbolo}${fmt(pag.custo)}.`, `**${cansados.length}** companion(s) at full energy. You paid ${pag.moeda.simbolo}${fmt(pag.custo)}.`, `**${cansados.length}** compañero(s) con la energía llena. Pagaste ${pag.moeda.simbolo}${fmt(pag.custo)}.`),
      colour: COR.sucesso });
  }

  // ── followers ──
  if (["follower", "followers", "companheiro", "companheiros", "party", "equipe"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎭 Você não tem personagem",
          description: `Crie com \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${citarInterno("game.criar", P)}\`.`, colour: COR.aviso },
        { title: "🎭 No tienes personaje",
          description: `Crea uno con \`${citar("game.criar", "es", P)}\`.`, colour: COR.aviso }));
    }
    // só as que pedem UM companheiro (dar/pegar pedem companheiro + item: a ordem lá é fixa)
    const ACOES_FOLLOWER = ["ficha", "status", "ver", "sheet", "info", "levar", "adicionar", "party+", "tirar", "remover", "party-",
      "dispensar", "demitir", "fotos", "foto", "album", "álbum", "contratar", "assinar"];
    let acao = args[1]?.toLowerCase();
    let resto = args.slice(2).join(" ").trim();
    const ultima = args.at(-1)?.toLowerCase();
    if (args.length > 2 && !ACOES_FOLLOWER.includes(acao) && ACOES_FOLLOWER.includes(ultima)) {
      resto = args.slice(1, -1).join(" ").trim();
      acao = ultima;
    }

    // Acha um companheiro SEU pelo nome. Usado por quase todos os subcomandos.
    const acharMeu = (texto, lista = null) => {
      const alvoTxt = semAcento(texto);
      if (!alvoTxt) return null;
      const meus = (lista ?? db.listarFollowersDe(serverId, eu)).map((f) => ({ f, nome: semAcento(db.getFollowerCatalogo(f.catalogoId)?.nome) }));
      return (meus.find((x) => x.nome === alvoTxt) ?? meus.find((x) => x.nome.includes(alvoTxt)))?.f ?? null;
    };
    const semEsse = (texto) => sendEmbed(message.channel, {
      title: tr(ctx, "❌ Não é um dos seus", "❌ Not among yours", "❌ No es uno de los tuyos"),
      description: tr(ctx,
        `Não achei **${texto}** entre os seus companheiros. Veja com \`${citarInterno("game.followers", P)}\`.`,
        `I couldn't find **${texto}** among your companions. See them with \`${citarInterno("game.followers", P)}\`.`,
        `No encontré **${texto}** entre tus compañeros. Míralos con \`${citar("game.followers", "es", P)}\`.`),
      colour: COR.erro });

    if (["ficha", "status", "ver", "sheet", "info"].includes(acao)) {
      const todosMeus = db.listarFollowersDe(serverId, eu);
      if (!resto && todosMeus.length !== 1) {
        const nomes = todosMeus.map((x) => `\`${citarInterno("game.follower.ficha", P)} ${db.getFollowerCatalogo(x.catalogoId)?.nome ?? "?"}\``);
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Qual companheiro?",
            description: todosMeus.length ? nomes.join("\n") : `Você ainda não tem companheiros — \`${citarInterno("game.recrutas", P)}\`.`, colour: COR.erro },
          { title: "❌ Which companion?",
            description: todosMeus.length ? nomes.join("\n") : `You have no companions yet — \`${citarInterno("game.recrutas", P)}\`.`, colour: COR.erro },
          { title: "❌ ¿Qué compañero?",
            description: todosMeus.length ? todosMeus.map((x) => `\`${citar("game.follower.ficha", "es", P)} ${db.getFollowerCatalogo(x.catalogoId)?.nome ?? "?"}\``).join("\n") : `Todavía no tienes compañeros — \`${citar("game.recrutas", "es", P)}\`.`, colour: COR.erro }));
      }
      const f = resto ? acharMeu(resto) : todosMeus[0];
      if (!f) return semEsse(resto);
      const cat = db.getFollowerCatalogo(f.catalogoId);
      const cls = FOL.CLASSES[cat?.classe] ?? {};
      const rar = RARIDADE_INFO[cat?.raridade] ?? {};
      const attr = CB.atributosDoCompanheiro(cat, p.nivel);
      const magia = FOL.magiaDo(cat);
      const energia = energiaAtual(f);
      const membro = CB.membroCompanheiro(cat, p.nivel);
      const linhasAttr = db.ATRIBUTOS.filter((a) => (attr[a] ?? 0) > 0)
        .map((a) => `${ATRIB[a]?.emoji ?? "•"} **${en ? ATRIB[a]?.rotuloEN : ATRIB[a]?.rotulo}** ${fmt(attr[a])}`);
      const d = cat?.dados ?? {};
      const linhas = [
        `${rar.emoji ?? ""}${cls.emoji ?? ""} **${cat?.nome ?? "?"}**${d.unico ? " ✦" : ""} — ${en ? cls.rotuloEN : cls.rotulo} · ${tr(ctx, "nível", "level", "nivel")} ${p.nivel}`,
        `${rar.emoji ?? ""} ${rotuloRaridade(cat?.raridade, rotuloLang(ctx, en))} · ${en ? cls.descEN : cls.desc}${d.obra ? ` · _${d.obra}_` : ""}${d.tier ? ` · tier ${d.tier}` : ""}`,
        d.descricao ? `_${en ? d.descricao.en : d.descricao.pt}_` : null,
        "",
        `⚡ **${tr(ctx, "Energia", "Energy", "Energía")}:** ${energia}/${ENERGIA_MAX}${energia < ENERGIA_MAX ? tr(ctx, " _(+1 por hora)_", " _(+1 per hour)_", " _(+1 por hora)_") : ""}`,
        `🎒 **${tr(ctx, "Na party", "In the party", "En el grupo")}:** ${f.naParty ? tr(ctx, "sim", "yes", "sí") : tr(ctx, "não", "no", "no")}`,
        magia ? `✦ **${tr(ctx, "Magia", "Spell", "Hechizo")}:** ${en ? magia.nomeEN ?? magia.nome : magia.nome} — ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%` : null,
        `⚔️ **${tr(ctx, "Ataque", "Attack", "Ataque")}** ${fmt(R.poderMembro(membro))} · 🛡️ **${tr(ctx, "Defesa", "Defense", "Defensa")}** ${fmt(R.defesaMembro(membro))}`,
        "",
        tr(ctx, "**Atributos** _(sobem com você — o kit da classe já está neles)_", "**Attributes** _(they rise with you — the class kit is already in them)_", "**Atributos** _(suben contigo — el kit de la clase ya está en ellos)_"),
        ...linhasAttr,
      ];
      return enviarLista(sendEmbed, message.channel, {
        titulo: tr(ctx, "👤 Companheiro", "👤 Companion", "👤 Compañero"), linhas: linhas.filter((x) => x !== null), colour: COR.info,
        imagem: IMG.imagemDe(cat?.id) });
    }

    // ── D23: companheiro não usa item (o kit da classe já está no ganho por nível) ──
    if (["dar", "equipar", "give", "equip", "mochila", "inventario", "inventário", "bag", "pegar", "retomar", "take", "desequipar"].includes(acao)) {
      return sendEmbed(message.channel, { title: tr(ctx, "🎒 Companheiro não usa item", "🎒 Companions don't use items", "🎒 Los compañeros no usan objetos"), colour: COR.info,
        description: tr(ctx, "Todo companheiro já é um kit completo: o que o equipamento daria está no ganho por nível, e ele sobe com o seu nível. Os itens são para você.",
          "Every companion is a complete kit: what gear would give is already in the gain per level, and they rise with your level. Items are for you.",
          "Cada compañero ya es un kit completo: lo que daría el equipo ya está en su ganancia por nivel, y sube con tu nivel. Los objetos son para ti.") });
    }
    // contrato de companheiro único (ESPECIAIS §1.2)
    if (["contratar", "assinar", "hire"].includes(acao)) return cmdGame(message, ["usar", ...args.slice(2)], ctx);

    // ── levar / tirar da party ──
    if (["levar", "adicionar", "party+"].includes(acao)) {
      const alvo = acharMeu(resto);
      if (!resto || !alvo) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Levar quem?", "❌ Take who?", "❌ ¿Llevar a quién?"),
          description: tr(ctx,
            `\`${citarInterno("game.follower.levar", P)} <nome>\`\n\nVeja os seus com \`${citarInterno("game.followers", P)}\`.`,
            `\`${citarInterno("game.follower.levar", P)} <name>\`\n\nSee yours with \`${citarInterno("game.followers", P)}\`.`,
            `\`${citar("game.follower.levar", "es", P)} <nombre>\`\n\nMira los tuyos con \`${citar("game.followers", "es", P)}\`.`), colour: COR.erro });
      }
      if (alvo.naParty) {
        return sendEmbed(message.channel, { title: tr(ctx, "🎒 Já está na party", "🎒 Already in the party", "🎒 Ya está en el grupo"),
          description: descreverFollower(alvo, en, p?.nivel, true, L), colour: COR.aviso });
      }
      const naParty = db.getParty(serverId, eu);
      if (naParty.length >= 2) {
        return sendEmbed(message.channel, { title: tr(ctx, "🎒 Party cheia", "🎒 Party full", "🎒 Grupo lleno"),
          description: tr(ctx,
            `Você pode levar até **2** followers.\n\nTire alguém com \`${citarInterno("game.follower.tirar", P)} <nome>\`.`,
            `You can take up to **2** followers.\n\nRemove someone with \`${citarInterno("game.follower.tirar", P)} <name>\`.`,
            `Puedes llevar hasta **2** compañeros.\n\nSaca a alguien con \`${citar("game.follower.tirar", "es", P)} <nombre>\`.`),
          colour: COR.aviso });
      }
      if (energiaAtual(alvo) < 1) {
        return sendEmbed(message.channel, { title: tr(ctx, "😴 Sem energia", "😴 Out of energy", "😴 Sin energía"),
          description: tr(ctx, `${descreverFollower(alvo, en, p?.nivel)}\n\nPrecisa descansar — a energia volta com o tempo (1 por hora).`, `${descreverFollower(alvo, en, p?.nivel)}\n\nThey need rest — energy returns over time (1 per hour).`, `${descreverFollower(alvo, en, p?.nivel, true, L)}\n\nNecesita descansar — la energía vuelve con el tiempo (1 por hora).`),
          colour: COR.aviso });
      }
      db.salvarFollower(alvo.id, { naParty: 1 });
      return sendEmbed(message.channel, { title: tr(ctx, "🎒 Entrou na party", "🎒 Joined the party", "🎒 Se unió al grupo"),
        description: tr(ctx, `${descreverFollower(db.getFollower(alvo.id), en, p?.nivel)}\n\n_Ele gasta 1 de energia por missão de dungeon._`, `${descreverFollower(db.getFollower(alvo.id), en, p?.nivel)}\n\n_They spend 1 energy per dungeon mission._`, `${descreverFollower(db.getFollower(alvo.id), en, p?.nivel, true, L)}\n\n_Gasta 1 de energía por misión de mazmorra._`),
        colour: COR.sucesso });
    }

    if (["tirar", "remover", "party-"].includes(acao)) {
      const naParty = db.getParty(serverId, eu);
      const alvo = (resto ? acharMeu(resto, naParty) : null) ?? (naParty.length === 1 && !resto ? naParty[0] : null);
      if (!alvo) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Tirar quem?", "❌ Remove who?", "❌ ¿Sacar a quién?"),
          description: naParty.length
            ? tr(ctx, `\`${citarInterno("game.follower.tirar", P)} <nome>\``, `\`${citarInterno("game.follower.tirar", P)} <name>\``, `\`${citar("game.follower.tirar", "es", P)} <nombre>\``)
            : tr(ctx, "Sua party está vazia.", "Your party is empty.", "Tu grupo está vacío."),
          colour: COR.erro });
      }
      db.salvarFollower(alvo.id, { naParty: 0 });
      return sendEmbed(message.channel, { title: tr(ctx, "👋 Saiu da party", "👋 Left the party", "👋 Salió del grupo"),
        description: descreverFollower(db.getFollower(alvo.id), en, p?.nivel, true, L), colour: COR.mod });
    }

    // ── dispensar ──
    if (["dispensar", "demitir"].includes(acao)) {
      const alvo = acharMeu(resto);
      if (!resto || !alvo) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Dispensar quem?", "❌ Dismiss who?", "❌ ¿Despedir a quién?"),
          description: tr(ctx, `\`${citarInterno("game.follower.dispensar", P)} <nome>\``, `\`${citarInterno("game.follower.dispensar", P)} <name>\``, `\`${citar("game.follower.dispensar", "es", P)} <nombre>\``), colour: COR.erro });
      }
      const nome = db.getFollowerCatalogo(alvo.catalogoId)?.nome ?? "?";
      db.dispensarFollower(alvo.id);
      return sendEmbed(message.channel, { title: tr(ctx, "👋 Dispensado", "👋 Dismissed", "👋 Despedido"),
        description: tr(ctx, `**${nome}** seguiu seu caminho.`, `**${nome}** went their own way.`, `**${nome}** siguió su camino.`), colour: COR.mod });
    }

    // ── foto: a imagem que o dono ligou ao companheiro (&game admin imagem) ──
    if (["fotos", "foto", "album", "álbum"].includes(acao)) {
      const cat = db.acharFollowerCatalogo(resto);
      if (!cat) {
        return sendEmbed(message.channel, { title: tr(ctx, "❌ Quem?", "❌ Who?", "❌ ¿Quién?"),
          description: tr(ctx, `\`${citarInterno("game.follower.fotos", P)} <nome>\``, `\`${citarInterno("game.follower.fotos", P)} <name>\``, `\`${citar("game.follower.fotos", "es", P)} <nombre>\``), colour: COR.erro });
      }
      const img = IMG.imagemDe(cat.id) ?? cat.fotos?.[0] ?? null;
      return sendEmbed(message.channel, { title: `📷 ${cat.nome}`, colour: COR.info,
        description: img ? "" : tr(ctx, "_Ainda sem imagem._", "_No picture yet._", "_Todavía sin imagen._"), ...(img ? { imagem: img } : {}) });
    }

    // ── lista (padrão) ──
    const meus = db.listarFollowersDe(serverId, eu);
    const naParty = meus.filter((f) => f.naParty);
    if (!meus.length) {
      return sendEmbed(message.channel, { title: tr(ctx, "👥 Nenhum companheiro", "👥 No companions", "👥 Ningún compañero"),
        description: tr(ctx, [
          "Você ainda não tem followers.",
          "",
          "Eles aparecem como **loot de dungeon** — e os que têm preço também se",
          "contratam como mercenários (\`" + P + "game contratar\`).",
          "",
          `_Veja quem existe com \`${citarInterno("game.recrutas", P)}\`._`,
        ], [
          "You don't have followers yet.",
          "",
          "They show up as **dungeon loot** — and can also be hired",
          "as mercenaries.",
          "",
          `_See who exists with \`${citarInterno("game.recrutas", P)}\`._`,
        ], [
          "Todavía no tienes compañeros.",
          "",
          "Aparecen como **botín de mazmorra** — y los que tienen precio también se",
          `contratan como mercenarios (\`${citar("game.contratar", "es", P)}\`).`,
          "",
          `_Mira quién existe con \`${citar("game.recrutas", "es", P)}\`._`,
        ]).join("\n"), colour: COR.info });
    }
    const linhas = [];
    if (naParty.length) {
      linhas.push(tr(ctx, `🎒 **Na party (${naParty.length}/2)**`, `🎒 **In the party (${naParty.length}/2)**`, `🎒 **En el grupo (${naParty.length}/2)**`));
      for (const f of naParty) linhas.push(`   ${descreverFollower(f, en, p?.nivel, true, L)}`);
      linhas.push("");
    }
    const fora = meus.filter((f) => !f.naParty);
    if (fora.length) {
      linhas.push(tr(ctx, "**Disponíveis**", "**Available**", "**Disponibles**"));
      for (const f of fora) linhas.push(`   ${descreverFollower(f, en, p?.nivel, true, L)}`);
    }
    linhas.push("", tr(ctx,
      `_\`${citarInterno("game.follower.ficha", P)} <nome>\` — atributos e magia_`,
      `_\`${citarInterno("game.follower.ficha", P)} <name>\` — attributes and spell_`,
      `_\`${citar("game.follower.ficha", "es", P)} <nombre>\` — atributos y hechizo_`),
      tr(ctx,
        `_\`${citarInterno("game.follower.levar", P)} <nome>\` para colocar na party · ⚡ = energia_`,
        `_\`${citarInterno("game.follower.levar", P)} <name>\` to add to the party · ⚡ = energy_`,
        `_\`${citar("game.follower.levar", "es", P)} <nombre>\` para meterlo en el grupo · ⚡ = energía_`));
    return enviarLista(sendEmbed, message.channel, {
      titulo: tr(ctx, "👥 Seus companheiros", "👥 Your companions", "👥 Tus compañeros"), linhas, colour: COR.info });
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
      linhas.push(`${cls.emoji} **${en ? cls.rotuloEN : cls.rotulo}** — ${en ? cls.descEN : cls.desc} · ${tr(ctx, "magia", "spell", "hechizo")}: _${cls.magia.nome}_`);
      for (const f of grupo.sort((a, b) => R.ORDEM.indexOf(a.raridade) - R.ORDEM.indexOf(b.raridade))) {
        const r = RARIDADE_INFO[f.raridade] ?? {};
        const onde = f.dados?.unico ? tr(ctx, "✦ contrato (chefe ou missão especial)", "✦ contract (boss or special mission)", "✦ contrato (jefe o misión especial)")
          : f.soDungeon ? tr(ctx, "🗝️ loot", "🗝️ loot", "🗝️ botín") : `💰 ${f.preco}`;
        linhas.push(`   ${r.emoji ?? ""} ${f.nome}${f.dados?.obra ? ` _(${f.dados.obra})_` : ""} — ${onde}`);
      }
      linhas.push("");
    }
    linhas.push(tr(ctx,
      "_🗝️ = aparece como loot (dungeons, contratos, chefes) · 💰 = contratável (`" + citarInterno("game.contratar") + "`) · ✦ = único, um por jogador. Companheiros sobem com o seu nível e não usam item._",
      "_🗝️ = shows up as loot (dungeons, contracts, bosses) · 💰 = hireable (`" + citarInterno("game.contratar") + "`) · ✦ = unique, one per player. Companions rise with your level and use no items._",
      "_🗝️ = aparece como botín (mazmorras, contratos, jefes) · 💰 = contratable (`" + citar("game.contratar", "es") + "`) · ✦ = único, uno por jugador. Los compañeros suben con tu nivel y no usan objetos._"));
    return enviarLista(sendEmbed, message.channel, {
      titulo: tr(ctx, "📜 Companheiros que existem", "📜 Companions that exist", "📜 Compañeros que existen"), linhas, colour: COR.info });
  }

  // ── ranking ──
  if (["top", "ranking", "rank"].includes(sub)) {
    const lista = db.listarPersonagens(serverId, 10);
    if (!lista.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🏆 Ranking",
          description: `Ninguém criou personagem ainda. Seja o primeiro: \`${citarInterno("game.criar", P)}\`.`, colour: COR.info },
        { title: "🏆 Ranking",
          description: `Nobody created a character yet. Be the first: \`${citarInterno("game.criar", P)}\`.`, colour: COR.info },
        { title: "🏆 Ranking",
          description: `Nadie ha creado un personaje todavía. Sé el primero: \`${citar("game.criar", "es", P)}\`.`, colour: COR.info }));
    }
    const medalha = ["🥇", "🥈", "🥉"];
    const linhas = lista.map((x, i) => tr(ctx,
      `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — nível ${x.nivel} (${Math.round((x.progresso ?? 0) * 100)}%)`,
      `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — level ${x.nivel} (${Math.round((x.progresso ?? 0) * 100)}%)`,
      `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — nivel ${x.nivel} (${Math.round((x.progresso ?? 0) * 100)}%)`));
    return sendEmbed(message.channel, {
      title: tr(ctx, "🏆 Aventureiros do mundo", "🏆 Adventurers of the world", "🏆 Aventureros del mundo"),
      description: linhas.join("\n"), colour: COR.info });
  }

  // ── classe do jogador (D24): só um perfil para o evolucionador, sem bônus ──
  if (["classe", "class"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"), colour: COR.aviso, description: tr(ctx, `\`${citarInterno("game.criar", P)}\``, `\`${citarInterno("game.criar", P)}\``, `\`${citar("game.criar", "es", P)}\``) });
    const escolhida = EV.acharClasse(args.slice(1).join(" "));
    if (args[1] && !escolhida) return sendEmbed(message.channel, { title: tr(ctx, "❌ Classe desconhecida", "❌ Unknown class", "❌ Clase desconocida"), colour: COR.erro, description: tr(ctx, `\`${citarInterno("game.classe", P)}\``, `\`${citarInterno("game.classe", P)}\``, `\`${citar("game.classe", "es", P)}\``) });
    if (escolhida) {
      db.salvarPersonagem(serverId, eu, { classe: escolhida });
      const c = EV.CLASSES_JOGADOR[escolhida];
      return sendEmbed(message.channel, { title: `${c.emoji} ${en ? c.rotuloEN : c.rotulo}`, colour: COR.sucesso,
        description: tr(ctx, `Classe escolhida. É só um perfil — não dá bônus. Agora \`${citarInterno("game.evoluir", P)}\` gasta seus pontos e equipa o melhor da mochila por você (\`${citarInterno("game.evoluir.prever", P)}\` mostra antes).`,
          `Class chosen. It's only a profile — no bonus. Now \`${citarInterno("game.evoluir", P)}\` spends your points and equips the best of your bag for you (\`${citarInterno("game.evoluir.prever", P)}\` shows it first).`,
          `Clase elegida. Es solo un perfil — no da bonos. Ahora \`${citar("game.evoluir", "es", P)}\` gasta tus puntos y equipa lo mejor de tu mochila por ti (\`${citar("game.evoluir.prever", "es", P)}\` lo muestra antes).`) });
    }
    const A = (k) => (en ? ATRIB[k].abrevEN : ATRIB[k].abrev);
    const linhas = [tr(ctx, "Escolha o que quer ser — o **evoluir automático** (`" + citarInterno("game.evoluir") + "`) gasta pontos e equipa a mochila por ela. Sem bônus: é só um perfil.", "Pick what you want to be — the **auto-evolve** (`" + citarInterno("game.evoluir") + "`) spends points and equips the bag by it. No bonus: it's only a profile.", "Elige lo que quieres ser — la **evolución automática** (`" + citar("game.evoluir", "es") + "`) gasta puntos y equipa la mochila según ella. Sin bonos: es solo un perfil."), ""];
    for (const [k, c] of Object.entries(EV.CLASSES_JOGADOR)) {
      const dist = Object.entries(c.dist).map(([a, f]) => `${A(a)} ${Math.round(f * 100)}`).join(" · ");
      linhas.push(`${c.emoji} **${en ? c.rotuloEN : c.rotulo}**${p.classe === k ? " ✅" : ""} — ${dist}${c.escudo ? tr(ctx, " · escudo", " · shield", " · escudo") : ""}`);
    }
    linhas.push("", tr(ctx, `\`${citarInterno("game.classe", P)} <nome>\``, `\`${citarInterno("game.classe", P)} <name>\``, `\`${citar("game.classe", "es", P)} <nombre>\``));
    return sendEmbed(message.channel, { title: tr(ctx, "🧭 Classes", "🧭 Classes", "🧭 Clases"), description: linhas.join("\n"), colour: COR.info });
  }

  // ── evoluir automático (D24) ──
  if (["evoluir", "evolve", "auto"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"), colour: COR.aviso, description: tr(ctx, `\`${citarInterno("game.criar", P)}\``, `\`${citarInterno("game.criar", P)}\``, `\`${citar("game.criar", "es", P)}\``) });
    if (!p.classe) return cmdGame(message, ["classe"], ctx);
    const op = String(args[1] ?? "").toLowerCase();
    if (op === "auto") {
      const liga = !["off", "desligar", "nao", "não", "0"].includes(String(args[2] ?? "on").toLowerCase());
      db.salvarPersonagem(serverId, eu, { evoluirAuto: liga ? 1 : 0 });
      return sendEmbed(message.channel, { title: "⚙️", colour: COR.sucesso, description: liga
        ? tr(ctx, "Evoluir automático **ligado**: a cada nível novo e quando entrar item na mochila.", "Auto-evolve **on**: at every new level and whenever an item enters your bag.", "Evolución automática **activada**: en cada nivel nuevo y cuando entre un objeto en la mochila.")
        : tr(ctx, "Evoluir automático **desligado**.", "Auto-evolve **off**.", "Evolución automática **desactivada**.") });
    }
    if (op === "refazer") return cmdGame(message, ["resetar", "pontos", ...args.slice(2)], ctx);
    const prever = ["prever", "preview", "simular"].includes(op);
    const r = EV.evoluir(eu, { pontos: op !== "equipar", equipar: op !== "pontos", gravar: !prever });
    const c = r.cls, A = (k) => (en ? ATRIB[k].rotuloEN : ATRIB[k].rotulo);
    const linhas = [];
    const gastos = Object.entries(r.gastos ?? {});
    linhas.push(tr(ctx, `📈 **Pontos**`, `📈 **Points**`, `📈 **Puntos**`));
    linhas.push(gastos.length ? gastos.map(([k, n]) => `${A(k)} ${r.attrAntes[k]} → ${r.attr[k]}`).join(" · ") : tr(ctx, "_nenhum ponto livre_", "_no free points_", "_ningún punto libre_"));
    linhas.push("", tr(ctx, "⚔️ **Equipamento**", "⚔️ **Gear**", "⚔️ **Equipo**"));
    if (r.trocas.length) for (const t of r.trocas) linhas.push(`${SLOT_INFO[t.slot]?.emoji ?? "•"} ${rotuloSlot(t.slot, rotuloLang(ctx, en))}: ${t.saiu?.nome ?? "—"} → **${t.entrou?.nome ?? "—"}**`);
    else linhas.push(tr(ctx, "_o que você usa já é o melhor da mochila_", "_what you wear is already the best in your bag_", "_lo que llevas ya es lo mejor de tu mochila_"));
    if (r.trocas.some((t) => t.saiu)) linhas.push(tr(ctx, "_O que saiu voltou para a mochila._", "_What came off went back to the bag._", "_Lo que se quitó volvió a la mochila._"));
    linhas.push("", tr(ctx, `🎯 **Um contrato do seu nível:** vencer ${pct(r.antes.exitoReal)} → ${pct(r.depois.exitoReal)} · sobreviver ${pct(r.antes.sobrevReal)} → ${pct(r.depois.sobrevReal)}${r.depois.sinergia > 0.005 ? ` · sinergia +${pct(r.depois.sinergia)}` : ""}`,
      `🎯 **A contract of your level:** win ${pct(r.antes.exitoReal)} → ${pct(r.depois.exitoReal)} · survive ${pct(r.antes.sobrevReal)} → ${pct(r.depois.sobrevReal)}${r.depois.sinergia > 0.005 ? ` · synergy +${pct(r.depois.sinergia)}` : ""}`,
      `🎯 **Un contrato de tu nivel:** ganar ${pct(r.antes.exitoReal)} → ${pct(r.depois.exitoReal)} · sobrevivir ${pct(r.antes.sobrevReal)} → ${pct(r.depois.sobrevReal)}${r.depois.sinergia > 0.005 ? ` · sinergia +${pct(r.depois.sinergia)}` : ""}`));
    if (prever) linhas.push("", tr(ctx, `_Só a prévia — nada mudou. \`${citarInterno("game.evoluir", P)}\` aplica._`, `_Preview only — nothing changed. \`${citarInterno("game.evoluir", P)}\` applies it._`, `_Solo la vista previa — sin cambios. \`${citar("game.evoluir", "es", P)}\` lo aplica._`));
    else if (!p.evoluirAuto) linhas.push("", tr(ctx, `_\`${citarInterno("game.evoluir", P)} auto on\` faz isso sozinho a cada nível._`, `_\`${citarInterno("game.evoluir", P)} auto on\` does this by itself at every level._`, `_\`${citar("game.evoluir", "es", P)} auto on\` lo hace solo en cada nivel._`));
    return sendEmbed(message.channel, { title: `⚙️ ${prever ? tr(ctx, "Evoluir (prévia)", "Evolve (preview)", "Evolucionar (vista previa)") : tr(ctx, "Evoluir", "Evolve", "Evolucionar")} — ${en ? c.rotuloEN : c.rotulo} · ${tr(ctx, "nível", "level", "nivel")} ${p.nivel}`,
      description: linhas.join("\n"), colour: COR.sucesso });
  }

  // ── ajuda ──
  if (["ajuda", "help", "comandos"].includes(sub)) {
    const esP = (ref) => citar(ref, "es", P);
    return sendEmbed(message.channel, tr(ctx, {
      title: "🎲 RPG — comandos",
      description: [
        `\`${citarInterno("game.criar", P)} [nome]\` — cria seu personagem · \`${citarInterno("game", P)}\` — sua ficha · \`${citarInterno("game.ficha", P)} @pessoa\``,
        `\`${citarInterno("game.pontos", P)} <atributo> [quantos]\` · \`${citarInterno("game.classe", P)}\` · \`${citarInterno("game.evoluir", P)}\` — gasta os pontos e equipa por você`,
        `\`${citarInterno("game.itens", P)}\` · \`${citarInterno("game.equipar", P)} <item> [mao1|mao2]\` · \`${citarInterno("game.usar", P)} <contrato|pergaminho>\` · \`${citarInterno("game.desequipar", P)} <vaga>\``,
        `\`${citarInterno("game.catalogo", P)} [raridade] [tipo]\` · \`${citarInterno("game.item", P)} <nome>\` · \`${citarInterno("game.comprar", P)} [raridade] [tipo]\``,
        `\`${citarInterno("game.magias", P)}\` · \`${citarInterno("game.aprender", P)} <nome>\` — o grimório`,
        `\`${citarInterno("game.contratos", P)}\` — o quadro da guilda · \`${citarInterno("game.dungeons", P)}\` · \`${citarInterno("game.chefes", P)}\` · \`${citarInterno("game.especiais", P)}\``,
        `\`${citarInterno("game", P)} coop abrir <…>\` — em grupo, até 4 · \`${citarInterno("game.historia", P)}\` — sua última história`,
        `\`${citarInterno("game.followers", P)}\` · \`${citarInterno("game.follower.ficha", P)} <nome>\` · \`${citarInterno("game.recrutas", P)}\``,
        `\`${citarInterno("game.top", P)}\` — ranking do mundo inteiro · \`${citarInterno("game.apagar.confirmar", P)}\` — recomeça do zero`,
        "",
        "**Atributos:** " + Object.values(ATRIB).map((a) => a.rotulo).join(", "),
        "",
        "_A missão paga a força dela, igual para todos: um êxito no seu nível vale 80% de um nível. Falhar não paga nada._",
      ].join("\n"), colour: COR.info }, {
      title: "🎲 RPG — commands",
      description: [
        `\`${citarInterno("game.criar", P)} [name]\` — creates your character · \`${citarInterno("game", P)}\` — your sheet · \`${citarInterno("game.ficha", P)} @person\``,
        `\`${citarInterno("game.pontos", P)} <attribute> [how many]\` · \`${citarInterno("game.classe", P)}\` · \`${citarInterno("game.evoluir", P)}\` — spends points and equips for you`,
        `\`${citarInterno("game.itens", P)}\` · \`${citarInterno("game.equipar", P)} <item> [mao1|mao2]\` · \`${citarInterno("game.usar", P)} <contract|scroll>\` · \`${citarInterno("game.desequipar", P)} <slot>\``,
        `\`${citarInterno("game.catalogo", P)} [rarity] [type]\` · \`${citarInterno("game.item", P)} <name>\` · \`${citarInterno("game.comprar", P)} [rarity] [type]\``,
        `\`${citarInterno("game.magias", P)}\` · \`${citarInterno("game.aprender", P)} <name>\` — the grimoire`,
        `\`${citarInterno("game.contratos", P)}\` — the guild board · \`${citarInterno("game.dungeons", P)}\` · \`${citarInterno("game.chefes", P)}\` · \`${citarInterno("game.especiais", P)}\``,
        `\`${citarInterno("game", P)} coop abrir <…>\` — together, up to 4 · \`${citarInterno("game.historia", P)}\` — your last story`,
        `\`${citarInterno("game.followers", P)}\` · \`${citarInterno("game.follower.ficha", P)} <name>\` · \`${citarInterno("game.recrutas", P)}\``,
        `\`${citarInterno("game.top", P)}\` — ranking of the whole world · \`${citarInterno("game.apagar.confirmar", P)}\` — starts over`,
        "",
        "**Attributes:** " + Object.values(ATRIB).map((a) => a.rotuloEN).join(", "),
        "",
        "_A mission pays its strength, the same for everyone: one win at your level is 80% of a level. A failure pays nothing._",
      ].join("\n"), colour: COR.info,
    }, {
      title: "🎲 RPG — comandos",
      description: [
        `\`${esP("game.criar")} [nombre]\` — crea tu personaje · \`${esP("game")}\` — tu ficha · \`${esP("game.ficha")} @usuario\``,
        `\`${esP("game.pontos")} <atributo> [cuántos]\` · \`${esP("game.classe")}\` · \`${esP("game.evoluir")}\` — gasta los puntos y equipa por ti`,
        `\`${esP("game.itens")}\` · \`${esP("game.equipar")} <objeto> [mao1|mao2]\` · \`${esP("game.usar")} <contrato|pergamino>\` · \`${esP("game.desequipar")} <espacio>\``,
        `\`${esP("game.catalogo")} [rareza] [tipo]\` · \`${esP("game.item")} <nombre>\` · \`${esP("game.comprar")} [rareza] [tipo]\``,
        `\`${esP("game.magias")}\` · \`${esP("game.aprender")} <nombre>\` — el grimorio`,
        `\`${esP("game.contratos")}\` — el tablón del gremio · \`${esP("game.dungeons")}\` · \`${esP("game.chefes")}\` · \`${esP("game.especiais")}\``,
        `\`${esP("game")} coop open <…>\` — en grupo, hasta 4 · \`${esP("game.historia")}\` — tu última historia`,
        `\`${esP("game.followers")}\` · \`${esP("game.follower.ficha")} <nombre>\` · \`${esP("game.recrutas")}\``,
        `\`${esP("game.top")}\` — ranking del mundo entero · \`${esP("game.apagar.confirmar")}\` — empieza de cero`,
        "",
        "**Atributos:** " + Object.values(ATRIB).map((a) => a.rotuloEN).join(", "),
        "",
        "_La misión paga según su fuerza, igual para todos: una victoria en tu nivel vale el 80% de un nivel. Fallar no paga._",
      ].join("\n"), colour: COR.info }));
  }

  // ── ficha (padrão) ──
  // (31 out 2026, R9/R11) `&game <erro de digitação>` virava busca de pessoa por
  // NOME entre os membros E os banidos (e revelava se um nome batia com um
  // banido). Agora: `&game` = a sua ficha; `&game ficha <@pessoa|ID>` ou
  // `&game <@pessoa|ID>` = a de um MEMBRO deste servidor; o resto é erro curto.
  const ehFicha = !sub || ["ficha", "perfil", "status"].includes(sub);
  const entrada = ehFicha ? args[1] : args[0];
  const alvoEscrito = entrada ? mencaoOuId(entrada) : eu;
  if (!alvoEscrito) {
    return sendEmbed(message.channel, ehFicha
      ? { title: "🎭", colour: COR.aviso, description: tr(ctx, `Use uma menção ou um ID: \`${citarInterno("game.ficha", P)} @pessoa\`.`, `Use a mention or an ID: \`${citarInterno("game.ficha", P)} @person\`.`, `Usa una mención o un ID: \`${citar("game.ficha", "es", P)} @usuario\`.`) }
      : { title: "❓", colour: COR.aviso, description: tr(ctx, `Subcomando desconhecido — \`${citarInterno("game.ajuda", P)}\`.`, `Unknown subcommand — \`${citarInterno("game.ajuda", P)}\`.`, `Subcomando desconocido — \`${citar("game.ajuda", "es", P)}\`.`) });
  }
  if (alvoEscrito !== eu) {
    const server = await getServer?.(message).catch(() => null);
    const membro = await server?.fetchMember?.(alvoEscrito).catch(() => null);
    if (!membro) {
      return sendEmbed(message.channel, { title: "🎭", colour: COR.aviso,
        description: tr(ctx, "Essa pessoa não está neste servidor.", "That person isn't on this server.", "Esa persona no está en este servidor.") });
    }
  }

  const id = alvoEscrito;
  const p = db.getPersonagem(serverId, id);
  if (!p) {
    const proprio = id === eu;
    return sendEmbed(message.channel, tr(ctx, {
      title: proprio ? "🎭 Você ainda não tem personagem" : "🎭 Sem personagem",
      description: proprio
        ? `Crie o seu com \`${citarInterno("game.criar", P)} [nome]\` e comece a jogar.`
        : `Essa pessoa ainda não criou um personagem.`,
      colour: COR.aviso }, {
      title: proprio ? "🎭 You don't have a character yet" : "🎭 No character",
      description: proprio
        ? `Create yours with \`${citarInterno("game.criar", P)} [name]\` and start playing.`
        : `That person hasn't created a character yet.`,
      colour: COR.aviso,
    }, {
      title: proprio ? "🎭 Todavía no tienes personaje" : "🎭 Sin personaje",
      description: proprio
        ? `Crea el tuyo con \`${citar("game.criar", "es", P)} [nombre]\` y empieza a jugar.`
        : `Esa persona todavía no ha creado un personaje.`,
      colour: COR.aviso }));
  }

  return sendEmbed(message.channel, {
    title: `🎭 ${p.nome ?? "Aventureiro"}`,
    description: montarFicha(p, P, serverId, id, lang, L),
    colour: COR.info });
}
