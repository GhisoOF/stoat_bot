// O personagem (P2, 31 out 2026): a ficha curta, criar, build, comprar, aliado,
// top e apagar. Cada ação mostra só o resultado (R1/R2); o "como usar" está no
// `&help game <subcomando>`.

import * as db from "../core/db.js";
import { carimbo } from "../core/tempo.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import * as MISS from "./missoes.js";
import * as TS from "./tesouro.js";
import * as EV from "./evolucionador.js";
import * as E from "./era.js";
import { ERA } from "./era.js";
import { LISTA as BUILDS, PADRAO, acharBuild, buildDe } from "./builds.js";
import { ajustarParty, recrutar, resumoVazio, entregarItem } from "./lutas.js";
import { T, cmd, nomeBuild, descBuild, nomeItem, nomeAliado, classeAliado, emojiClasse, emojiRaridade, fmt, pct, barra, CATALOGO_ES, atributo, emojiAtributo, nomeMagia } from "./telas.js";

const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// `<@ID>` ou o ID cru (26 caracteres) — nunca busca por nome
export function mencaoOuId(entrada) {
  const m = String(entrada ?? "").trim().match(/^<@!?([0-9A-HJKMNP-TV-Z]{26})>$|^([0-9A-HJKMNP-TV-Z]{26})$/i);
  return m ? (m[1] ?? m[2]).toUpperCase() : null;
}

// O nome aparece para todos (ficha, duelo, top de todos os servidores). (31 out
// 2026, R6) Sem menção, @everyone, markdown nem link; até 32 caracteres. (P2)
// Obrigatório: vazio depois de limpo → "" (o `criar` recusa).
export const NOME_MAX = 32;
export function nomeDePersonagem(bruto) {
  let t = String(bruto ?? "").normalize("NFKC")
    .replace(/<[@%#][^>]*>/g, " ")
    .split(/\s+/).filter((p) => !/^\W*@|:\/\/|^www\.|\.[a-z]{2,}(\/|$)/i.test(p)).join(" ")
    .replace(/[^\p{L}\p{M}\p{N} '\-]/gu, " ")
    .replace(/\s+/g, " ").trim();
  if (t.length > NOME_MAX) t = t.slice(0, NOME_MAX).trim();
  return t;
}

// Kit inicial: as missões são calibradas para a party de referência (arma,
// cabeça, corpo, acessórios e dois aliados). Uma vez por pessoa nesta era.
export const KIT_INICIAL = {
  itens: ["g_espada_ferro", "g_elmo_amassado", "g_tunica_puida", "g_amuleto_opaco", "g_cordao_couro", "g_cordao_couro"],
  aliados: ["f_mercenario_novato", "f_guarda_bisonho"],
};
function darKit(uid) {
  if (!E.marcarUnico(uid, "kit")) return;
  for (const id of KIT_INICIAL.itens) if (db.getItem(id)) db.darItem(ERA, uid, id);
  for (const id of KIT_INICIAL.aliados) if (db.getFollowerCatalogo(id)) db.recrutarFollower(ERA, uid, id, 1);
  ajustarParty(uid);
}

// ── A ficha curta ────────────────────────────────────────────────────────────
export function ficha(p, l, COR, agora = Date.now()) {
  const b = buildDe(p), party = CB.partyDe(ERA, p.userId, p);
  const pv = CB.prever([party], { ...R.missao(p.nivel), base: R.BASE.normal });
  const prog = Math.max(0, Math.min(1, p.progresso ?? 0));
  const espera = Math.max((p.recuperandoAte ?? 0), (p.ultimaMissao ?? 0) + MISS.ESPERA_MIN.contrato * 60_000);
  const L = [
    `${b.emoji} ${nomeBuild(b, l)} · ${T(l, "nível", "level", "nivel")} **${p.nivel}** ${barra(prog)} ${pct(prog)}`,
    `🪙 ${fmt(TS.saldo(p.userId), l)} · 👥 ${party.companheiros.length} · 🏆 ${pct(pv.exito * pv.sobrevivencia)}`,
  ];
  if (espera > agora) L.push(`⏳ ${carimbo(espera, "R")}`);
  return { title: `🎭 ${p.nome}`, description: L.join("\n"), colour: COR.info };
}

// ── criar ────────────────────────────────────────────────────────────────────
export async function criar({ args, eu, l, P, COR, responder, erro }) {
  if (db.getPersonagem(ERA, eu)) return responder({ title: "🎭", colour: COR.aviso, description: T(l, "Você já tem personagem.", "You already have a character.", "Ya tienes personaje.") });
  const nome = nomeDePersonagem(args.slice(1).join(" "));
  if (!nome) return erro(`\`${cmd(l, "game.criar", P)} <${T(l, "nome", "name", "nombre")}>\``);
  db.criarPersonagem(ERA, eu, nome);
  db.salvarPersonagem(ERA, eu, { classe: PADRAO });
  TS.garantirOuro();
  darKit(eu);
  EV.trocarBuild(eu, PADRAO);
  const f = ficha(db.getPersonagem(ERA, eu), l, COR);
  return responder({ ...f, title: `🎉 ${nome}`, colour: COR.sucesso });
}

// ── A montagem da build (P2.5, pedido do Ghieh): atributos, equipamento, magias e
// aliados, tudo o que a build escolheu sozinha ────────────────────────────────
const VAGAS = [
  ["mao1", "🗡️", "mão 1", "hand 1", "mano 1"], ["mao2", "🛡️", "mão 2", "hand 2", "mano 2"],
  ["capacete", "⛑️", "cabeça", "head", "cabeza"], ["armadura", "🥋", "corpo", "body", "cuerpo"],
  ["acessorio1", "💍", "acessório", "accessory", "accesorio"], ["acessorio2", "💍", "acessório", "accessory", "accesorio"], ["acessorio3", "💍", "acessório", "accessory", "accesorio"],
  ["bio1", "🧬", "bio", "bio", "bio"], ["bio2", "🧬", "bio", "bio", "bio"], ["bio3", "🧬", "bio", "bio", "bio"],
  ["ciber1", "🦾", "ciber", "cyber", "ciber"], ["ciber2", "🦾", "ciber", "cyber", "ciber"], ["ciber3", "🦾", "ciber", "cyber", "ciber"],
];
export function montagem(p, l, COR) {
  const b = buildDe(p), party = CB.partyDe(ERA, p.userId, p), eq = party.eq ?? db.getEquipado(ERA, p.userId);
  const attr = party.attr ?? Object.fromEntries(R.ATR.map((k) => [k, p[k] ?? 0]));
  const atr = R.ATR.map((k) => `${emojiAtributo(k)} ${atributo(k, l)} **${Math.round(attr[k] ?? 0)}**`).join(" · ");
  const vagas = VAGAS.filter(([v]) => eq[v]).map(([v, e, pt, en, es]) => `${e} ${T(l, pt, en, es)}: ${emojiRaridade(eq[v].raridade)} ${nomeItem(eq[v], l)}`);
  const magias = (party.doGrimorio ?? []).map((m) => nomeMagia(m, l));
  const aliados = (party.companheiros ?? []).map((c) => `${emojiClasse(c.cat.classe)} ${nomeAliado(c.cat, l)}`);
  const vazio = T(l, "_nenhum_", "_none_", "_ninguno_");
  const L = [
    `**${T(l, "Atributos", "Attributes", "Atributos")}:** ${atr}`,
    `**${T(l, "Equipamento", "Gear", "Equipo")}:**`, ...(vagas.length ? vagas : [vazio]),
    `**${T(l, "Magias", "Spells", "Hechizos")}:** ${magias.length ? magias.join(" · ") : vazio}`,
    `**${T(l, "Aliados", "Allies", "Aliados")}:** ${aliados.length ? aliados.join(" · ") : vazio}`,
  ];
  return { title: `${b.emoji} ${nomeBuild(b, l)} — ${p.nome}`, description: L.join("\n"), colour: COR.info };
}
// "lista" em pt/en/es (e `&game builds`): as 18 builds
const LISTAR = new Set(["lista", "list", "listar", "todas", "all", "builds", "classes"]);

// ── build ────────────────────────────────────────────────────────────────────
export async function build({ args, eu, p, l, P, COR, responder, erro, palavra }) {
  const pedido = args.slice(1).join(" ").trim();
  const atual = buildDe(p);
  // (P2.5) sem nada: como a SUA build está montada; `lista` (ou `&game builds`): as builds
  if (!pedido && !LISTAR.has(palavra)) return responder(montagem(p, l, COR));
  if (!pedido || LISTAR.has(semAcento(pedido))) {
    const L = BUILDS.map((b) => `${b.id === atual.id ? "➡️" : b.emoji} **${nomeBuild(b, l)}** — ${descBuild(b, l)}`);
    return responder({ title: T(l, "🧭 Builds", "🧭 Builds", "🧭 Builds"), colour: COR.info, description: L.join("\n") });
  }
  const b = acharBuild(pedido);
  if (!b) return erro(T(l, `Build desconhecida: **${pedido.slice(0, 40)}**.`, `Unknown build: **${pedido.slice(0, 40)}**.`, `Build desconocida: **${pedido.slice(0, 40)}**.`));
  const r = EV.trocarBuild(eu, b.id);
  return responder({ title: `${b.emoji} ${nomeBuild(b, l)}`, colour: COR.sucesso,
    description: T(l, `${r.trocas} vaga(s) de equipamento mudaram.`, `${r.trocas} gear slot(s) changed.`, `${r.trocas} espacio(s) de equipo cambiaron.`) });
}

// ── comprar ──────────────────────────────────────────────────────────────────
const EQUIPAVEIS = new Set(["mao", "capacete", "armadura", "acessorio", "implante"]);
const MAX_LOJA = 40, OFERTAS = 5;
const naLoja = (i) => i && EQUIPAVEIS.has(i.slot) && !i.especial && !i.obra && i.ativo !== 0;
// As melhorias à venda para esta build: da raridade da faixa e da de baixo, a
// que mais sobe a nota primeiro (cada uma comparada só com a vaga dela)
export function ofertasDaLoja(uid, p = db.getPersonagem(ERA, uid)) {
  const b = buildDe(p), eq = db.getEquipado(ERA, uid), party = CB.partyDe(ERA, uid, p);
  const attr = Object.fromEntries(R.ATR.map((k) => [k, p[k]]));
  const f = R.faixaDoNivel(p.nivel).n;
  const pool = [R.ORDEM[f - 1], R.ORDEM[f - 2]].filter(Boolean).flatMap((r) => db.listarItens({ raridade: r }))
    .filter((i) => naLoja(i) && EV.vagasDoItem(b, i, eq).length).slice(0, MAX_LOJA);
  return pool.map((i) => ({ item: i, ...EV.compararNaVaga(p, attr, eq, party, b, i) }))
    .filter((o) => o.melhora).sort((a, c) => c.ganho - a.ganho).slice(0, OFERTAS);
}
// Pelo nome em português, inglês ou espanhol
export function acharItem(txt) {
  const a = semAcento(txt);
  if (!a) return null;
  const porEs = Object.entries(CATALOGO_ES.itens).find(([, n]) => semAcento(n) === a)?.[0];
  return db.acharItemPorNome(txt) ?? (porEs ? db.getItem(porEs) : null);
}
export async function comprar({ args, eu, p, l, P, COR, responder, erro }) {
  const pedido = args.slice(1).join(" ").trim();
  const ofertas = ofertasDaLoja(eu, p);
  if (!pedido) {
    const L = ofertas.map((o, i) => `\`${i + 1}\` ${emojiRaridade(o.item.raridade)} **${nomeItem(o.item, l)}** — 🪙 ${fmt(o.item.precoBase, l)}`);
    return responder({ title: T(l, "🏪 Loja", "🏪 Shop", "🏪 Tienda"), colour: COR.info,
      description: L.length ? `${L.join("\n")}\n🪙 ${fmt(TS.saldo(eu), l)}` : T(l, "Nada à venda melhora a sua build agora.", "Nothing for sale improves your build right now.", "Nada a la venta mejora tu build ahora.") });
  }
  const n = /^\d+$/.test(pedido) ? Number(pedido) : null;
  const item = n ? ofertas[n - 1]?.item : acharItem(pedido);
  if (!item) return erro(n ? T(l, `Não há a oferta ${n}.`, `There's no offer ${n}.`, `No hay oferta ${n}.`)
    : T(l, `Não achei **${pedido.slice(0, 40)}**.`, `I couldn't find **${pedido.slice(0, 40)}**.`, `No encontré **${pedido.slice(0, 40)}**.`));
  const nome = nomeItem(item, l);
  if (!naLoja(item)) return erro(T(l, `**${nome}** não se vende.`, `**${nome}** isn't sold.`, `**${nome}** no se vende.`));
  const b = buildDe(p), eq = db.getEquipado(ERA, eu);
  const c = EV.compararNaVaga(p, Object.fromEntries(R.ATR.map((k) => [k, p[k]])), eq, CB.partyDe(ERA, eu, p), b, item);
  if (!c.melhora) return erro(T(l, `**${nome}** não melhora a sua build.`, `**${nome}** doesn't improve your build.`, `**${nome}** no mejora tu build.`));
  if (!TS.cobrar(eu, item.precoBase)) return erro(T(l, `**${nome}** custa 🪙 ${fmt(item.precoBase, l)} — você tem 🪙 ${fmt(TS.saldo(eu), l)}.`,
    `**${nome}** costs 🪙 ${fmt(item.precoBase, l)} — you have 🪙 ${fmt(TS.saldo(eu), l)}.`, `**${nome}** cuesta 🪙 ${fmt(item.precoBase, l)} — tienes 🪙 ${fmt(TS.saldo(eu), l)}.`));
  const out = resumoVazio(eu, p);
  entregarItem(eu, item, out, { nivel: p.nivel });
  return responder({ title: T(l, "🛒 Comprado", "🛒 Purchased", "🛒 Comprado"), colour: COR.sucesso,
    description: `${emojiRaridade(item.raridade)} **${nome}** ${out.equipados.length ? T(l, "— equipado", "— equipped", "— equipado") : ""} · 🪙 ${fmt(TS.saldo(eu), l)}` });
}

// ── aliado ───────────────────────────────────────────────────────────────────
export function acharAliado(txt) {
  const a = semAcento(txt);
  if (!a) return null;
  const porEs = Object.entries(CATALOGO_ES.aliados).find(([, n]) => semAcento(n) === a)?.[0];
  return db.acharFollowerCatalogo(txt) ?? (porEs ? db.getFollowerCatalogo(porEs) : null);
}
const forcaAliado = (cat, nivel) => { const m = CB.membroCompanheiro(cat, nivel); return R.poderMembro(m) + 0.5 * R.defesaMembro(m); };
// Os mercenários que dá para contratar: até a raridade da sua faixa, os 3 mais fortes
export function mercenarios(p) {
  const f = R.faixaDoNivel(p.nivel).n;
  return db.listarFollowersCatalogo().filter((c) => c.preco > 0 && !c.soDungeon && !c.dados?.unico && R.ORDEM.indexOf(c.raridade) < f)
    .sort((a, b) => forcaAliado(b, p.nivel) - forcaAliado(a, p.nivel)).slice(0, 3);
}
export async function aliado({ args, eu, p, l, P, COR, responder, erro }) {
  const pedido = args.slice(1).join(" ").trim();
  if (!pedido) {
    const vao = new Set(ajustarParty(eu).map((f) => f.id));
    const meus = db.listarFollowersDe(ERA, eu).map((f) => [f, db.getFollowerCatalogo(f.catalogoId)]).filter(([, c]) => c)
      .sort(([a], [b]) => (vao.has(b.id) ? 1 : 0) - (vao.has(a.id) ? 1 : 0));
    const L = meus.map(([f, c]) => `${vao.has(f.id) ? "⭐" : "▫️"} ${emojiClasse(c.classe)} **${nomeAliado(c, l)}** — ${classeAliado(c.classe, l)}`);
    const merc = mercenarios(p);
    if (merc.length) L.push("", ...merc.map((c) => `🪙 ${fmt(c.preco, l)} · ${emojiRaridade(c.raridade)}${emojiClasse(c.classe)} ${nomeAliado(c, l)} — \`${cmd(l, "game.aliado", P)} ${nomeAliado(c, l)}\``));
    return responder({ title: T(l, "👥 Aliados", "👥 Allies", "👥 Aliados"), colour: COR.info, description: L.join("\n") || "—" });
  }
  const cat = acharAliado(pedido);
  if (!cat) return erro(T(l, `Não achei **${pedido.slice(0, 40)}**.`, `I couldn't find **${pedido.slice(0, 40)}**.`, `No encontré **${pedido.slice(0, 40)}**.`));
  const nome = nomeAliado(cat, l);
  if (!(cat.preco > 0) || cat.soDungeon || cat.dados?.unico || R.ORDEM.indexOf(cat.raridade) >= R.faixaDoNivel(p.nivel).n)
    return erro(T(l, `**${nome}** não está para contratar.`, `**${nome}** isn't for hire.`, `**${nome}** no se puede contratar.`));
  if (!TS.cobrar(eu, cat.preco)) return erro(T(l, `**${nome}** custa 🪙 ${fmt(cat.preco, l)} — você tem 🪙 ${fmt(TS.saldo(eu), l)}.`,
    `**${nome}** costs 🪙 ${fmt(cat.preco, l)} — you have 🪙 ${fmt(TS.saldo(eu), l)}.`, `**${nome}** cuesta 🪙 ${fmt(cat.preco, l)} — tienes 🪙 ${fmt(TS.saldo(eu), l)}.`));
  const f = recrutar(eu, cat.id, p.nivel);
  const vai = db.getFollower(f.id)?.naParty;
  return responder({ title: T(l, "👥 Contratado", "👥 Hired", "👥 Contratado"), colour: COR.sucesso,
    description: `${vai ? "⭐" : "▫️"} ${emojiClasse(cat.classe)} **${nome}** · 🪙 ${fmt(TS.saldo(eu), l)}` });
}

// ── top ──────────────────────────────────────────────────────────────────────
export async function top({ l, COR, responder }) {
  const lista = db.listarPersonagens(ERA, 10);
  const medalha = ["🥇", "🥈", "🥉"];
  return responder({ title: T(l, "🏆 Ranking", "🏆 Ranking", "🏆 Clasificación"), colour: COR.info,
    description: lista.map((x, i) => `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — ${T(l, "nível", "level", "nivel")} ${x.nivel} (${pct(x.progresso)})`).join("\n") || "—" });
}

// ── apagar ───────────────────────────────────────────────────────────────────
export async function apagar({ args, eu, p, l, P, COR, responder }) {
  if (String(args[1] ?? "").toLowerCase() !== "confirmar") {
    return responder({ title: T(l, "⚠️ Isso apaga o personagem", "⚠️ This erases the character", "⚠️ Esto borra el personaje"), colour: COR.aviso,
      description: `**${p.nome}** · ${T(l, "nível", "level", "nivel")} ${p.nivel} — \`${cmd(l, "game.apagar.confirmar", P)}\`` });
  }
  E.apagarDaEra(eu);
  return responder({ title: T(l, "🗑️ Personagem apagado", "🗑️ Character deleted", "🗑️ Personaje borrado"), colour: COR.mod ?? COR.info, description: `**${p.nome}**` });
}
