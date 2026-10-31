// As lutas do RPG (P2, 31 out 2026): `&game missao [@amigos]` e `&game chefe [@amigos]`.
//
// A missão é sorteada por baixo — contrato da guilda, encontro de dungeon ou
// missão especial (decisão de Ghieh) — e a luta é uma só (regras.preverLuta e
// resolverLuta, calibradas em 40% de êxito / 70% de sobrevivência no próprio
// nível). Muda quem paga o ouro (o banco ou o tesouro da dungeon), o loot (tema
// só na dungeon) e a recompensa única (especial e chefe, uma vez por pessoa).
//
// Tudo o que vem depois da luta é automático: pontos e magias pela build, item
// melhor equipa, item pior vira ouro, contrato vira aliado, pergaminho vira
// magia. A Sorte entra em cada sorteio (sorte.js) — nunca na luta.
//
// Co-op: quem chama marca os amigos (até 3, membros DESTE servidor, com
// personagem); só eles entram, com ✅ na mensagem do convite (ou digitando
// `&game missao`/`&game chefe` no mesmo canal). Em 2 min o grupo parte com
// quem aceitou.

import * as db from "../core/db.js";
import { registrarErro } from "../core/erros.js";
import { carimbo } from "../core/tempo.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import * as MISS from "./missoes.js";
import * as TS from "./tesouro.js";
import * as EV from "./evolucionador.js";
import * as S from "./sorte.js";
import * as E from "./era.js";
import { ERA } from "./era.js";
import { imagemDe } from "./imagens.js";
import { T, cmd, nomeMissao, nomeItem, nomeAliado, nomeMagia, desfecho, emojiRaridade, emojiMissao, tipoMissao, fmt, pct, enviar } from "./telas.js";

const MIN = 60_000, HORA = 60 * MIN;
export const RECUPERACAO_MS = 30 * MIN;
export const COOP_MAX = 4;
export const CONVITE_MS = 2 * MIN;
export const CHANCE_ESPECIAL = 0.15;   // a vez de uma missão especial no sorteio (a Sorte aumenta)
export const CHANCE_DUNGEON = 0.4;     // contrato × encontro de dungeon

// ── O alvo ───────────────────────────────────────────────────────────────────
// { missao, alvo, fonte: { tipo: "banco" } | { tipo: "dungeon", id }, esperaMin, chaveEspera?, esperaChaveMs? }
export function montarAlvo(missao, nivelGrupo) {
  if (missao.tipo === "dungeon-encontro") {
    const d = MISS.DUNGEONS.get(missao.dungeon);
    const enc = MISS.encontro(d, nivelGrupo);
    return { missao: enc, alvo: MISS.alvoDe({ ...enc, tipo: "contrato" }), fonte: { tipo: "dungeon", id: d.id }, esperaMin: MISS.ESPERA_MIN.dungeon };
  }
  if (missao.tipo === "chefe") {
    return { missao, alvo: MISS.alvoDe(missao), fonte: missao.dungeon ? { tipo: "dungeon", id: missao.dungeon } : { tipo: "banco" },
      esperaMin: MISS.ESPERA_MIN.contrato, chaveEspera: `chefe:${missao.id}`, esperaChaveMs: MISS.CHEFE_ESPERA_H * HORA };
  }
  if (missao.tipo === "especial") return { missao, alvo: MISS.alvoDe(missao), fonte: { tipo: "banco" }, esperaMin: MISS.ESPERA_MIN.especial,
    chaveEspera: `especial:${missao.id}`, esperaChaveMs: MISS.ESPECIAL_PRIMEIRA_H * HORA };
  // contrato: jogado no nível do grupo (como o encontro de dungeon)
  const m = { ...missao, nivel: Math.max(1, Math.round(nivelGrupo)) };
  return { missao: m, alvo: MISS.alvoDe(m), fonte: { tipo: "banco" }, esperaMin: MISS.ESPERA_MIN.contrato };
}

// O que impede alguém de ir agora → null ou { motivo: "sem-personagem" | "recuperando" | "espera" | "chefe" | "requer", ate? }
export function impedimento(uid, spec, agora = Date.now()) {
  const p = db.getPersonagem(ERA, uid);
  if (!p) return { motivo: "sem-personagem" };
  if ((p.recuperandoAte ?? 0) > agora) return { motivo: "recuperando", ate: p.recuperandoAte };
  const libera = (p.ultimaMissao ?? 0) + spec.esperaMin * MIN;
  if (libera > agora) return { motivo: "espera", ate: libera };
  if (spec.chaveEspera) { const ate = E.esperaAte(uid, spec.chaveEspera); if (ate > agora) return { motivo: "chefe", ate }; }
  if (spec.missao.requer && !E.temUnico(uid, `chefe:${spec.missao.requer}`) && !E.temUnico(uid, `especial:${spec.missao.requer}`)) return { motivo: "requer" };
  return null;
}
export function textoImpedimento(imp, l, quem = null) {
  const q = quem ? `<@${quem}> ` : "";
  const quando = imp.ate ? carimbo(imp.ate, "R") : "";
  return {
    "sem-personagem": T(l, `${q}não tem personagem.`, `${q}has no character.`, `${q}no tiene personaje.`),
    recuperando: T(l, `🩹 ${q}se recupera — volta ${quando}.`, `🩹 ${q}is recovering — back ${quando}.`, `🩹 ${q}se recupera — vuelve ${quando}.`),
    espera: T(l, `⏳ ${q}pode ir de novo ${quando}.`, `⏳ ${q}can go again ${quando}.`, `⏳ ${q}puede volver a ir ${quando}.`),
    chefe: T(l, `⏳ ${q}enfrenta este chefe de novo ${quando}.`, `⏳ ${q}can face this boss again ${quando}.`, `⏳ ${q}puede enfrentar a este jefe otra vez ${quando}.`),
    requer: T(l, `🔒 ${q}precisa vencer o ato anterior antes.`, `🔒 ${q}must beat the previous act first.`, `🔒 ${q}tiene que vencer antes el acto anterior.`),
  }[imp.motivo] ?? "";
}

// ── Sorteios ─────────────────────────────────────────────────────────────────
const sortear = (lista, aleatorio) => lista[Math.floor(aleatorio() * lista.length)] ?? null;
export const sorteDe = (party) => S.sorteRelativa(party?.attr?.sorte ?? 0, party?.p?.nivel ?? 1);
const requerOk = (uid, m) => !m.requer || E.temUnico(uid, `chefe:${m.requer}`) || E.temUnico(uid, `especial:${m.requer}`);

// A missão do grupo: especial (rara; a Sorte de quem chama aumenta), encontro de
// dungeon ou contrato da faixa do nível
export function sortearMissao(lider, nivel, sorte = 1, aleatorio = Math.random, agora = Date.now()) {
  const esp = MISS.ESPECIAIS.filter((m) => m.nivel <= nivel && !E.temUnico(lider, `especial:${m.id}`) && E.esperaAte(lider, `especial:${m.id}`) <= agora && requerOk(lider, m));
  if (esp.length && S.rolar(CHANCE_ESPECIAL, sorte, aleatorio)) return sortear(esp, aleatorio);
  const dgs = [...MISS.DUNGEONS.values()].filter((d) => nivel >= d.niveis[0] && nivel <= d.niveis[1]);
  const faixa = R.faixaDoNivel(nivel).n;
  const cts = MISS.CONTRATOS.filter((m) => R.faixaDoNivel(m.nivel).n === faixa);
  if (dgs.length && (!cts.length || aleatorio() < CHANCE_DUNGEON)) { const d = sortear(dgs, aleatorio); return { id: d.id, tipo: "dungeon-encontro", dungeon: d.id, nome: d.nome, nomeEN: d.nomeEN }; }
  return sortear(cts.length ? cts : MISS.CONTRATOS, aleatorio);
}
// O chefe do grupo: o de nível mais baixo que ainda não seja abaixo do grupo, que
// todos possam enfrentar agora (sem espera de 24 h, ato anterior vencido)
export function escolherChefe(uids, nivel, aleatorio = Math.random, agora = Date.now()) {
  const pode = [...MISS.CHEFES.values()].filter((c) => uids.every((u) => E.esperaAte(u, `chefe:${c.id}`) <= agora && requerOk(u, c)));
  const acima = pode.filter((c) => c.nivel >= nivel);
  const lista = acima.length ? acima : pode;
  if (!lista.length) return null;
  const alvo = acima.length ? Math.min(...lista.map((c) => c.nivel)) : Math.max(...lista.map((c) => c.nivel));
  return sortear(lista.filter((c) => c.nivel === alvo), aleatorio);
}

// ── Aliados: os dois mais fortes vão junto, sozinhos ─────────────────────────
export function ajustarParty(uid) {
  const p = db.getPersonagem(ERA, uid);
  if (!p) return [];
  const forca = (f) => { const cat = db.getFollowerCatalogo(f.catalogoId); if (!cat) return -1; const m = CB.membroCompanheiro(cat, p.nivel); return R.poderMembro(m) + 0.5 * R.defesaMembro(m); };
  const todos = db.listarFollowersDe(ERA, uid).map((f) => [f, forca(f)]).sort((a, b) => b[1] - a[1]);
  todos.forEach(([f], i) => { const n = i < 2 ? 1 : 0; if ((f.naParty ?? 0) !== n) db.salvarFollower(f.id, { naParty: n }); });
  return todos.slice(0, 2).map(([f]) => f);
}
export function recrutar(uid, catId, nivel) {
  const f = db.recrutarFollower(ERA, uid, catId, nivel);
  ajustarParty(uid);
  return f;
}

// ── O que chega depois da luta ───────────────────────────────────────────────
const EQUIPAVEIS = new Set(["mao", "capacete", "armadura", "acessorio", "implante"]);
function sortearItem(raridade, fonte, aleatorio) {
  if (!raridade) return null;
  if (fonte.tipo === "dungeon" && aleatorio() < MISS.LOOT_TEMA) {
    const tema = new Set(MISS.DUNGEONS.get(fonte.id)?.tema ?? []);
    const pool = db.listarItens({ raridade }).filter((i) => tema.has(i.id));
    if (pool.length) return sortear(pool, aleatorio);
  }
  return sortear(db.listarItens({ raridade }).filter((i) => EQUIPAVEIS.has(i.slot) && !i.especial && !i.obra), aleatorio);
}
function sortearAliado(raridades, { soMercenarios = false } = {}, aleatorio) {
  return sortear(db.listarFollowersCatalogo().filter((c) => raridades.includes(c.raridade) && !c.dados?.unico && (!soMercenarios || !c.soDungeon)), aleatorio);
}
export const valorDeRevenda = (item) => Math.max(1, Math.floor((item?.precoBase ?? 0) * R.ECO.revenda));
// Um item que chegou: contrato → aliado; pergaminho → magia; o resto equipa se
// for melhor na vaga dele, senão vira ouro (o único fica na mochila).
// Registra em `out` (o resumo da luta ou da compra).
export function entregarItem(uid, item, out, { nivel = 1 } = {}) {
  const d = item?.dados ?? {};
  if (d.tipo === "contrato") {
    if (db.listarFollowersDe(ERA, uid).some((f) => f.catalogoId === d.companheiro)) return;
    const cat = db.getFollowerCatalogo(d.companheiro);
    if (cat) { recrutar(uid, cat.id, nivel); out.aliados.push(cat); }
    return;
  }
  if (d.tipo === "pergaminho") {
    const m = CB.getMagia(d.magia);
    if (m) { db.aprenderMagia(ERA, uid, m.id); out.magias.push(m); }
    return;
  }
  db.darItem(ERA, uid, item.id);
  const r = EV.receberItem(uid, item);
  if (r.equipou) { out.equipados.push(item); return; }
  if (item.especial) { out.guardados.push(item); return; }
  db.tirarItem(ERA, uid, item.id, 1);
  const q = TS.pagarFixo(uid, valorDeRevenda(item));
  out.vendidos.push(item); out.vendido += q;
}
export const resumoVazio = (uid, p) => ({ uid, nome: p?.nome ?? "?", nivelAntes: p?.nivel ?? 1, progressoAntes: p?.progresso ?? 0, nivelDepois: p?.nivel ?? 1, progressoDepois: p?.progresso ?? 0,
  xp: 0, subiu: false, ouro: 0, perdido: 0, vendido: 0, equipados: [], vendidos: [], guardados: [], aliados: [], magias: [], unicos: [] });

function aplicar({ uid, p, party, spec, r, aleatorio }) {
  const agora = Date.now(), { missao, alvo, fonte } = spec;
  const out = resumoVazio(uid, p);
  const campos = { ultimaMissao: agora, missoesFeitas: (p.missoesFeitas ?? 0) + 1 };
  const dg = fonte.tipo === "dungeon" ? fonte.id : null;
  const sorte = sorteDe(party);
  if (dg) TS.marcarAtivo(dg, uid, MISS.nivelPago(missao, alvo, p.nivel));
  if (spec.chaveEspera && !(missao.tipo === "especial" && r.exito && r.sobreviveu)) E.marcarEspera(uid, spec.chaveEspera, agora + spec.esperaChaveMs);
  const chegou = [];
  if (r.exito && r.sobreviveu) {
    out.xp = MISS.xpDa(missao, alvo, p.nivel);
    let s = R.subirForca(p.nivel, p.progresso ?? 0, out.xp);
    if (s.nivel > p.nivel + MISS.NIVEIS_POR_LUTA) s = { nivel: p.nivel + MISS.NIVEIS_POR_LUTA, progresso: 0 };
    const ganhos = s.nivel - p.nivel;
    if (ganhos > 0) {
      out.subiu = true;
      let pts = 0;
      for (let k = 0; k < ganhos; k++) pts += R.pontosPorNivel(p.inteligencia, p.sorte);
      campos.pontos = Math.round(((p.pontos ?? 0) + pts) * 100) / 100;
      const ganhoBase = R.baseDoNivel(s.nivel) - R.baseDoNivel(p.nivel);
      if (ganhoBase > 0) for (const a of R.ATR) campos[a] = (p[a] ?? 1) + ganhoBase;
    }
    campos.nivel = s.nivel; campos.progresso = s.progresso;
    out.nivelDepois = s.nivel; out.progressoDepois = s.progresso;
    const mult = MISS.multRecompensa(alvo), nivelPago = MISS.nivelPago(missao, alvo, p.nivel);
    out.ouro = dg ? TS.pagarDaDungeon(dg, uid, nivelPago, { mult }) : TS.pagarDoBanco(uid, nivelPago, { mult });
    const rar = R.faixaDoNivel(alvo.nivel).raridade;
    if (missao.tipo === "chefe") {
      const prox = R.ORDEM[R.ORDEM.indexOf(rar) + 1] ?? rar;
      for (const [rr, chance] of [[rar, 1], [prox, 0.25]]) if (S.rolar(chance, sorte, aleatorio)) { const it = sortearItem(rr, fonte, aleatorio); if (it) chegou.push(it); }
      if (S.rolar(0.20, sorte, aleatorio)) { const c = sortearAliado([rar], {}, aleatorio); if (c) { recrutar(uid, c.id, s.nivel); out.aliados.push(c); } }
      if (missao.recompensa && E.marcarUnico(uid, `chefe:${missao.id}`)) {
        for (const id of [missao.recompensa.contrato ? `c_${missao.recompensa.contrato}` : null, missao.recompensa.item ?? null].filter(Boolean)) {
          const it = db.getItem(id); if (it) { out.unicos.push(it); chegou.push(it); }
        }
      } else if (!missao.recompensa) E.marcarUnico(uid, `chefe:${missao.id}`);
    } else {
      const it = sortearItem(S.sortear(R.loot(alvo.nivel), sorte, aleatorio), fonte, aleatorio);
      if (it) chegou.push(it);
      if (S.rolar(MISS.COMPANHEIRO_LOOT, sorte, aleatorio)) {
        const abaixo = R.ORDEM[Math.max(0, R.ORDEM.indexOf(rar) - 1)];
        const c = sortearAliado([rar, abaixo], { soMercenarios: !dg }, aleatorio);
        if (c) { recrutar(uid, c.id, s.nivel); out.aliados.push(c); }
      }
    }
    if (missao.tipo === "especial" && missao.recompensa && E.marcarUnico(uid, `especial:${missao.id}`)) {
      const rec = missao.recompensa;
      const it = db.getItem(rec.tipo === "companheiro" ? `c_${rec.id}` : rec.tipo === "magia" ? `p_${rec.id}` : rec.id);
      if (it) { out.unicos.push(it); chegou.push(it); }
      E.marcarEspera(uid, spec.chaveEspera, 0);
    }
  } else if (!r.sobreviveu) {
    campos.recuperandoAte = agora + RECUPERACAO_MS;
    out.recuperandoAte = campos.recuperandoAte;
    out.perdido = TS.cair(uid, dg);
  }
  db.salvarPersonagem(ERA, uid, campos);
  if (out.subiu) { EV.aplicarPontos(uid); ajustarParty(uid); }
  for (const it of chegou) entregarItem(uid, it, out, { nivel: campos.nivel ?? p.nivel });
  return out;
}

// ── A luta completa (solo ou co-op) ─────────────────────────────────────────
export function lutar(uids, missaoBase, { aleatorio = Math.random } = {}) {
  const parties = uids.map((uid) => CB.partyDe(ERA, uid)).filter(Boolean);
  const nivelGrupo = Math.round(parties.reduce((s, x) => s + x.p.nivel, 0) / Math.max(1, parties.length));
  const spec = montarAlvo(missaoBase, nivelGrupo);
  const pv = CB.prever(parties, spec.alvo);
  const r = R.resolverLuta(pv, aleatorio);   // a Sorte fica fora: a luta é calibrada em 40/70
  const resultados = parties.map((x) => aplicar({ uid: x.uid, p: x.p, party: x, spec, r, aleatorio }));
  return { spec, pv, r, resultados };
}

// ── A tela do resultado ──────────────────────────────────────────────────────
function ganhos(x, l, curto) {
  const L = [];
  if (x.subiu) L.push(T(l, `🎉 **nível ${x.nivelDepois}!**`, `🎉 **level ${x.nivelDepois}!**`, `🎉 **¡nivel ${x.nivelDepois}!**`));
  else if (x.xp) { const g = Math.round(((x.nivelDepois - x.nivelAntes) + (x.progressoDepois - x.progressoAntes)) * 100); L.push(T(l, `✨ +${g}% de nível`, `✨ +${g}% of a level`, `✨ +${g}% de nivel`)); }
  const moeda = [x.ouro ? `🪙 +${fmt(x.ouro, l)}` : null, x.vendido ? `🪙 +${fmt(x.vendido, l)} ${T(l, "(revenda)", "(resale)", "(reventa)")}` : null, x.perdido ? `🪙 −${fmt(x.perdido, l)}` : null].filter(Boolean);
  if (moeda.length) L.push(moeda.join(" · "));
  for (const it of x.unicos) L.push(`✦ **${nomeItem(it, l)}**`);
  for (const it of x.equipados) if (!x.unicos.includes(it)) L.push(`🎁 ${emojiRaridade(it.raridade)} **${nomeItem(it, l)}** ${T(l, "— equipado", "— equipped", "— equipado")}`);
  if (!curto) for (const it of x.vendidos) L.push(`🎁 ${emojiRaridade(it.raridade)} ${nomeItem(it, l)} → 🪙`);
  for (const c of x.aliados) L.push(`👥 **${nomeAliado(c, l)}**`);
  for (const m of x.magias) L.push(`🔮 **${nomeMagia(m, l)}**`);
  if (x.recuperandoAte) L.push(T(l, `🩹 volta ${carimbo(x.recuperandoAte, "R")}`, `🩹 back ${carimbo(x.recuperandoAte, "R")}`, `🩹 vuelve ${carimbo(x.recuperandoAte, "R")}`));
  return L;
}
export function embedResultado(res, l, COR) {
  const { spec, pv, r, resultados } = res;
  const m = spec.missao, tipo = m.tipo === "dungeon" ? "dungeon" : m.tipo;
  const L = [`${emojiMissao(tipo)} ${tipoMissao(tipo, l)} · ${T(l, "nível", "level", "nivel")} ${spec.alvo.nivel} · ${pct(pv.exito)} × ${pct(pv.sobrevivencia)}`];
  if (resultados.length === 1) L.push(...ganhos(resultados[0], l, false));
  else for (const x of resultados) L.push(`<@${x.uid}> ${ganhos(x, l, true).join(" · ") || "—"}`);
  const imagem = imagemDe(m.tipo === "chefe" || m.tipo === "especial" ? m.id : null, spec.fonte.tipo === "dungeon" ? spec.fonte.id : null,
    ...resultados.flatMap((x) => x.unicos.map((it) => it.id)));
  return { title: `${desfecho(r.desfecho, l)} — ${nomeMissao(m, l)}`, description: L.join("\n").slice(0, 3900),
    colour: { sucesso: COR.sucesso, falha: COR.aviso, caiu: COR.erro }[r.desfecho], ...(imagem ? { imagem } : {}) };
}

// ── Convites de co-op (✅ só de quem foi convidado) ─────────────────────────
const CONVITES = new Map();   // id da mensagem → convite
export const convitesAbertos = () => CONVITES.size;
const decodificar = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };   // "%E2%9C%85" ou "✅"
const ehOk = (emoji) => ["✅", "✔️", "☑️"].includes(decodificar(String(emoji ?? "")));
// O convite aberto para `uid` neste canal (para quem digita o comando em vez do ✅)
export function convitePara(uid, canalId) {
  for (const [id, c] of CONVITES) if (c.canalId === canalId && c.convidados.includes(uid) && !c.aceitos.has(uid)) return [id, c];
  return null;
}
async function partir(id, c) {
  if (!CONVITES.has(id)) return null;
  CONVITES.delete(id);
  clearTimeout(c.relogio);
  const l = c.l;
  try {
    const quem = [c.lider, ...c.convidados.filter((u) => c.aceitos.has(u))];
    const lider = CB.partyDe(ERA, c.lider);
    if (!lider) return null;
    const nivel = Math.round(quem.reduce((s, u) => s + (db.getPersonagem(ERA, u)?.nivel ?? 1), 0) / quem.length);
    const missao = c.tipo === "chefe" ? escolherChefe(quem, nivel) : sortearMissao(c.lider, nivel, sorteDe(lider));
    if (!missao) return enviar(c.ctx, c.canal, l, { title: "💀", colour: c.ctx.COR.aviso, description: T(l, "Nenhum chefe disponível agora.", "No boss available right now.", "Ningún jefe disponible ahora.") });
    const ficaram = [], vao = [];
    for (const u of quem) { const imp = impedimento(u, montarAlvo(missao, nivel)); if (imp) ficaram.push(textoImpedimento(imp, l, u)); else vao.push(u); }
    if (!vao.includes(c.lider)) return enviar(c.ctx, c.canal, l, { title: "⚔️", colour: c.ctx.COR.aviso, description: ficaram.join("\n") });
    const e = embedResultado(lutar(vao, missao), l, c.ctx.COR);
    if (ficaram.length) e.description += `\n${ficaram.join("\n")}`;
    return enviar(c.ctx, c.canal, l, e);
  } catch (e) {
    registrarErro("RPG", e);
    return enviar(c.ctx, c.canal, l, { title: "❌", colour: c.ctx.COR.erro, description: T(l, "A missão em grupo falhou — nada mudou.", "The group mission failed — nothing changed.", "La misión en grupo falló — nada cambió.") });
  }
}
// Reação numa mensagem: se é um convite, conta o ✅ de quem foi convidado e devolve true
export async function aoReagir(msgId, userId, emoji) {
  const c = CONVITES.get(msgId);
  if (!c) return false;
  if (!ehOk(emoji) || !c.convidados.includes(userId) || c.aceitos.has(userId)) return true;
  c.aceitos.add(userId);
  if (c.aceitos.size === c.convidados.length) await partir(msgId, c);
  return true;
}
// Quem foi convidado digita o comando: vale como ✅
export async function aceitarPorTexto(uid, canalId) {
  const achado = convitePara(uid, canalId);
  if (!achado) return false;
  const [id, c] = achado;
  c.aceitos.add(uid);
  if (c.aceitos.size === c.convidados.length) await partir(id, c);
  return true;
}
export async function abrirConvite({ ctx, message, l, tipo, lider, convidados }) {
  const canal = message.channel, canalId = message.channelId ?? canal?.id;
  const titulo = tipo === "chefe" ? T(l, "💀 Chefe em grupo", "💀 Group boss", "💀 Jefe en grupo") : T(l, "⚔️ Missão em grupo", "⚔️ Group mission", "⚔️ Misión en grupo");
  const msg = await enviar(ctx, canal, l, { title: titulo, colour: ctx.COR.info,
    description: `${convidados.map((u) => `<@${u}>`).join(" ")} — ✅ ${T(l, "para entrar", "to join", "para entrar")} · ${T(l, "parte", "leaves", "sale")} ${carimbo(Date.now() + CONVITE_MS, "R")}` });
  // sem o id da mensagem não há reação: o convite vale pelo comando digitado e pelo prazo
  const id = msg?.id ?? msg?._id ?? `sem-id:${canalId}:${Date.now()}`;
  const c = { lider, convidados, aceitos: new Set(), tipo, l, ctx, canal, canalId, criadoEm: Date.now() };
  CONVITES.set(id, c);
  c.relogio = setTimeout(() => { partir(id, c).catch((e) => registrarErro("RPG", e)); }, CONVITE_MS);
  c.relogio.unref?.();
  try { await msg.react?.(encodeURIComponent("✅")); } catch (e) { registrarErro("RPG", e); }
  return id;
}
// (testes) parte um convite agora, como se o prazo tivesse acabado
export const partirAgora = (id) => { const c = CONVITES.get(id); return c ? partir(id, c) : null; };

// ── Os comandos: &game missao [@amigos] e &game chefe [@amigos] ─────────────
const mencao = (t) => (String(t ?? "").trim().match(/^<@!?([0-9A-HJKMNP-TV-Z]{26})>$|^([0-9A-HJKMNP-TV-Z]{26})$/i) ?? []).slice(1).find(Boolean)?.toUpperCase() ?? null;
export async function cmdLuta(g, tipo) {
  const { message, args, ctx, eu, p, l, COR, responder, erro } = g;
  const canalId = message.channelId ?? message.channel?.id;
  const marcados = [...new Set([...args.slice(1).map(mencao), ...(message.mentionIds ?? [])].filter(Boolean).map((u) => String(u).toUpperCase()))].filter((u) => u !== eu);
  const sobra = args.slice(1).filter((a) => !mencao(a));
  if (sobra.length) return erro(`\`${cmd(l, `game.${tipo}`, g.P)} [@${T(l, "amigos", "friends", "amigos")}]\``);
  const geral = { missao: {}, esperaMin: MISS.ESPERA_MIN.contrato };
  if (!marcados.length) {
    // quem foi convidado e digita o comando entra no grupo (vale como ✅)
    if (convitePara(eu, canalId)) { await aceitarPorTexto(eu, canalId); return null; }
    const imp = impedimento(eu, geral);
    if (imp) return erro(textoImpedimento(imp, l));
    const party = CB.partyDe(ERA, eu, p);
    const missao = tipo === "chefe" ? escolherChefe([eu], p.nivel) : sortearMissao(eu, p.nivel, sorteDe(party));
    if (!missao) return erro(T(l, "Nenhum chefe disponível agora.", "No boss available right now.", "Ningún jefe disponible ahora."));
    const imp2 = impedimento(eu, montarAlvo(missao, p.nivel));
    if (imp2) return erro(textoImpedimento(imp2, l));
    return responder(embedResultado(lutar([eu], missao), l, COR));
  }
  if (marcados.length > COOP_MAX - 1) return erro(T(l, `No máximo ${COOP_MAX - 1} amigos.`, `At most ${COOP_MAX - 1} friends.`, `Como mucho ${COOP_MAX - 1} amigos.`));
  const imp = impedimento(eu, geral);
  if (imp) return erro(textoImpedimento(imp, l));
  // só membros DESTE servidor, com personagem
  const server = await Promise.resolve(ctx.getServer?.(message)).catch(() => null);
  for (const u of marcados) {
    const membro = await Promise.resolve(server?.fetchMember?.(u)).catch(() => null);
    if (!membro) return erro(T(l, `<@${u}> não está neste servidor.`, `<@${u}> isn't on this server.`, `<@${u}> no está en este servidor.`));
    if (!db.getPersonagem(ERA, u)) return erro(T(l, `<@${u}> não tem personagem.`, `<@${u}> has no character.`, `<@${u}> no tiene personaje.`));
  }
  await abrirConvite({ ctx, message, l, tipo, lider: eu, convidados: marcados });
  return null;
}
