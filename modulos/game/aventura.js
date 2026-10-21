// As lutas do RPG v4 (G3, G3b, G3c, G4): contratos da guilda, bicos, missões
// especiais, dungeons e chefes — e o co-op, que serve para todas. A luta é uma
// só (regras.preverLuta/resolverLuta); muda quem paga a moeda (o banco ou o
// tesouro da dungeon), o loot (tema só na dungeon), a captura (só na dungeon) e
// a recompensa única (especial e chefe com nome, uma vez por pessoa).

import * as db from "../core/db.js";
import { citarInterno, citar, trechoPronto } from "../core/aliases.js";
import { tr, idiomaDe } from "../core/i18n.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import * as MISS from "./missoes.js";
import * as MERC from "./mercado.js";
import * as TS from "./tesouro.js";
import * as H from "./historia.js";
import * as EV from "./evolucionador.js";
import { MUNDO, ehSandbox } from "./mundo.js";
import { RARIDADE_INFO, fmt, pct, enviarLista, descreverItem } from "./ui.js";
import { imagemDe } from "./imagens.js";

const MIN = 60_000, HORA = 60 * MIN;
const ENERGIA_MAX = 5, ENERGIA_MS = HORA;
const CHANCE_RESGATE = 0.25, BONUS_DONO = 3, JANELA_DONO_H = 6;
export const COOP_MAX = 4;
const COOP_VALIDADE_MS = 10 * MIN;
const GRUPOS_COOP = new Map();
const RECUPERACAO_MS = 30 * MIN;
// Os auxiliares de texto abaixo recebem `en`: true/false, ou "es" (o espanhol sai pronto)
const ES = (t) => trechoPronto(t);
const TESOURO_ES = { full: "lleno", average: "en la media", "nearly empty": "casi vacío", empty: "vacío" };

export function energiaAtual(f) {
  const base = f.energia ?? 0, desde = f.energiaEm ?? 0;
  if (!desde) return Math.min(ENERGIA_MAX, base);
  return Math.min(ENERGIA_MAX, base + Math.max(0, Math.floor((Date.now() - desde) / ENERGIA_MS)));
}
export { ENERGIA_MAX, JANELA_DONO_H };
function gastarEnergia(f, quanto = 1) {
  db.salvarFollower(f.id, { energia: Math.max(0, energiaAtual(f) - quanto), energiaEm: Date.now() });
}

// ── O alvo: o que se vai enfrentar ──────────────────────────────────────────
// { missao, alvo, fonte: { tipo: "banco" } | { tipo: "dungeon", id }, chaveEspera, esperaMs }
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
  return { missao, alvo: MISS.alvoDe(missao, nivelGrupo), fonte: { tipo: "banco" }, esperaMin: MISS.ESPERA_MIN[missao.tipo] ?? MISS.ESPERA_MIN.contrato };
}

// O que impede alguém de ir agora (null = pode)
export function impedimento(uid, spec, en = false) {
  const p = db.getPersonagem(MUNDO, uid);
  if (!p) return en === "es" ? ES("no tiene personaje") : en ? "has no character" : "não tem personagem";
  const agora = Date.now();
  if ((p.recuperandoAte ?? 0) > agora) return en === "es" ? ES(`todavía se está recuperando (~${Math.ceil((p.recuperandoAte - agora) / MIN)} min)`) : en ? `is still recovering (~${Math.ceil((p.recuperandoAte - agora) / MIN)} min)` : `ainda está se recuperando (~${Math.ceil((p.recuperandoAte - agora) / MIN)} min)`;
  const libera = (p.ultimaMissao ?? 0) + spec.esperaMin * MIN;
  if (libera > agora) return en === "es" ? ES(`todavía está en espera (~${Math.ceil((libera - agora) / MIN)} min)`) : en ? `is still resting (~${Math.ceil((libera - agora) / MIN)} min)` : `ainda está na espera (~${Math.ceil((libera - agora) / MIN)} min)`;
  if (spec.chaveEspera) {
    const ate = db.esperaAte(uid, spec.chaveEspera);
    if (ate > agora) {
      const h = (ate - agora) / HORA;
      if (en === "es") return ES(`ya lo intentó hace poco (~${h >= 1 ? `${Math.ceil(h)} h` : `${Math.ceil(h * 60)} min`})`);
      return en ? `already tried this one recently (~${h >= 1 ? `${Math.ceil(h)} h` : `${Math.ceil(h * 60)} min`})` : `já tentou esta há pouco (~${h >= 1 ? `${Math.ceil(h)} h` : `${Math.ceil(h * 60)} min`})`;
    }
  }
  if (spec.missao.requer && !db.temUnico(uid, `chefe:${spec.missao.requer}`) && !db.temUnico(uid, `especial:${spec.missao.requer}`)) {
    const req = MISS.CHEFES.get(spec.missao.requer) ?? MISS.ESPECIAIS.find((e) => e.id === spec.missao.requer);
    if (en === "es") return ES(`primero tiene que vencer a **${req?.nomeEN ?? req?.nome ?? spec.missao.requer}**`);
    return en ? `must first beat **${req?.nomeEN ?? req?.nome ?? spec.missao.requer}**` : `precisa vencer antes **${req?.nome ?? spec.missao.requer}**`;
  }
  if (spec.missao.tipo !== "bico" && db.getParty(MUNDO, uid).some((f) => energiaAtual(f) < 1)) return en === "es" ? ES("tiene un compañero sin energía") : en ? "has a companion out of energy" : "tem companheiro sem energia";
  return null;
}

// ── Loot ─────────────────────────────────────────────────────────────────────
const EQUIPAVEIS = new Set(["mao", "capacete", "armadura", "acessorio", "implante"]);
function poolGenerico(raridade, { semObra = true } = {}) {
  return db.listarItens({ raridade }).filter((i) => EQUIPAVEIS.has(i.slot) && !i.especial && (!semObra || !i.obra));
}
function sortearItem(raridade, fonte, aleatorio = Math.random) {
  if (!raridade) return null;
  if (fonte.tipo === "dungeon" && aleatorio() < MISS.LOOT_TEMA) {
    const tema = new Set(MISS.DUNGEONS.get(fonte.id)?.tema ?? []);
    const pool = db.listarItens({ raridade }).filter((i) => tema.has(i.id));
    if (pool.length) return pool[Math.floor(aleatorio() * pool.length)];
  }
  const pool = poolGenerico(raridade);
  return pool.length ? pool[Math.floor(aleatorio() * pool.length)] : null;
}
function sortearCompanheiro(raridades, { soMercenarios = false } = {}, aleatorio = Math.random) {
  const pool = db.listarFollowersCatalogo().filter((c) => raridades.includes(c.raridade) && !c.dados?.unico && (!soMercenarios || !c.soDungeon));
  return pool.length ? pool[Math.floor(aleatorio() * pool.length)] : null;
}

// ── Aplicar o resultado a UM participante ───────────────────────────────────
function aplicar({ uid, p, party, spec, r, coop, aleatorio = Math.random }) {
  const agora = Date.now(), { missao, alvo, fonte } = spec;
  const out = { uid, nome: p.nome, nivelAntes: p.nivel, progressoAntes: p.progresso ?? 0, xp: 0, pago: { ouro: 0, cristal: 0 }, perdido: { ouro: 0, cristal: 0 },
    itens: [], companheiro: null, unicos: [], capturados: [], resgatados: [], subiu: false, pontos: 0, ganhoBase: 0 };
  const campos = { ultimaMissao: agora, missoesFeitas: (p.missoesFeitas ?? 0) + 1 };
  const dg = fonte.tipo === "dungeon" ? fonte.id : null;
  const sandbox = ehSandbox(uid);
  // o tesouro se renova pelo nível que se joga NA dungeon (o do encontro, que
  // fica na faixa dela), não pelo nível de quem entrou
  if (dg && !sandbox) db.marcarAtivoDungeon(dg, uid, MISS.nivelPago(missao, alvo, p.nivel));
  if (spec.chaveEspera && !(missao.tipo === "especial" && r.exito && r.sobreviveu)) db.marcarEspera(uid, spec.chaveEspera, agora + spec.esperaChaveMs);

  if (r.exito && r.sobreviveu) {
    // XP: a força da missão, igual para todos (D6)
    out.xp = MISS.xpDa(missao, alvo, p.nivel);
    let s = R.subirForca(p.nivel, p.progresso ?? 0, out.xp);
    if (s.nivel > p.nivel + MISS.NIVEIS_POR_LUTA) s = { nivel: p.nivel + MISS.NIVEIS_POR_LUTA, progresso: 0 };
    const ganhos = s.nivel - p.nivel;
    if (ganhos > 0) {
      out.subiu = true;
      for (let k = 0; k < ganhos; k++) out.pontos += R.pontosPorNivel(p.inteligencia, p.sorte);
      out.ganhoBase = R.baseDoNivel(s.nivel) - R.baseDoNivel(p.nivel);
      campos.pontos = Math.round(((p.pontos ?? 0) + out.pontos) * 100) / 100;
      if (out.ganhoBase > 0) for (const a of R.ATR) campos[a] = (p[a] ?? 1) + out.ganhoBase;
    }
    campos.nivel = s.nivel; campos.progresso = s.progresso;
    out.nivelDepois = s.nivel; out.progressoDepois = s.progresso;
    // moeda: o banco paga contrato e especial; o tesouro paga a dungeon (D8)
    const mult = MISS.multRecompensa(alvo), nivelPago = MISS.nivelPago(missao, alvo, p.nivel);
    out.pago = sandbox ? { ouro: 0, cristal: 0 } : missao.tipo === "bico" ? TS.pagarDoBanco(uid, nivelPago, { mult: 0.1 * mult, cristal: false, aleatorio })
      : dg ? TS.pagarDaDungeon(dg, uid, nivelPago, { mult, aleatorio }) : TS.pagarDoBanco(uid, nivelPago, { mult, aleatorio });
    // loot
    if (missao.tipo === "chefe") {
      const rar = R.faixaDoNivel(alvo.nivel).raridade, prox = R.ORDEM[R.ORDEM.indexOf(rar) + 1] ?? rar;
      for (const [rr, chance] of [[rar, 1], [prox, 0.25]]) if (aleatorio() < chance) { const it = sortearItem(rr, fonte, aleatorio); if (it) { db.darItem(MUNDO, uid, it.id); out.itens.push(it); } }
      if (aleatorio() < 0.20) { const c = sortearCompanheiro([rar], {}, aleatorio); if (c) { db.recrutarFollower(MUNDO, uid, c.id, s.nivel); out.companheiro = c; } }
      // a recompensa única do chefe com nome — uma vez por pessoa
      const jaTinha = db.temUnico(uid, `chefe:${missao.id}`);
      if (!jaTinha) {
        db.marcarUnico(uid, `chefe:${missao.id}`);
        for (const id of [missao.recompensa?.contrato ? `c_${missao.recompensa.contrato}` : null, missao.recompensa?.item ?? null].filter(Boolean)) {
          const it = db.getItem(id); if (it) { db.darItem(MUNDO, uid, it.id); out.unicos.push(it); }
        }
      } else if (missao.recompensa) out.jaTinhaUnico = true;
    } else if (missao.tipo !== "bico") {
      const it = sortearItem(R.sortearLoot(alvo.nivel, aleatorio), fonte, aleatorio);
      if (it) { db.darItem(MUNDO, uid, it.id); out.itens.push(it); }
      if (aleatorio() < MISS.COMPANHEIRO_LOOT) {
        const rar = R.faixaDoNivel(alvo.nivel).raridade, abaixo = R.ORDEM[Math.max(0, R.ORDEM.indexOf(rar) - 1)];
        const c = sortearCompanheiro([rar, abaixo], { soMercenarios: !dg }, aleatorio);
        if (c) { db.recrutarFollower(MUNDO, uid, c.id, s.nivel); out.companheiro = c; }
      }
    }
    // missão especial: a recompensa única no primeiro êxito
    if (missao.tipo === "especial" && missao.recompensa) {
      const jaTinha = db.temUnico(uid, `especial:${missao.id}`);
      const rec = missao.recompensa;
      const id = rec.tipo === "companheiro" ? `c_${rec.id}` : rec.tipo === "magia" ? `p_${rec.id}` : rec.id;
      const it = db.getItem(id);
      out.especial = { item: it, jaTinha };
      if (!jaTinha && it) { db.marcarUnico(uid, `especial:${missao.id}`); db.darItem(MUNDO, uid, it.id); out.unicos.push(it); db.marcarEspera(uid, spec.chaveEspera, 0); }
    }
  } else if (!r.sobreviveu) {
    campos.recuperandoAte = agora + RECUPERACAO_MS;
    const pS = db.getMoeda(MUNDO, "ouro")?.pSuave ?? 0.5;
    out.perdido = sandbox ? { ouro: 0, cristal: 0 } : TS.cair(uid, MERC.perda(pS), dg);
    for (const f of party.companheiros.map((c) => c.f)) {
      const cat = db.getFollowerCatalogo(f.catalogoId);
      if (dg && aleatorio() < MISS.CAPTURA) { db.capturarFollower(f.id, dg); out.capturados.push(cat?.nome ?? "?"); }
      else db.salvarFollower(f.id, { naParty: 0, energia: 0, energiaEm: agora });
    }
  }
  // resgate: na dungeon onde ele caiu, quem volta tem uma chance (o dono, mais)
  if (dg && r.sobreviveu && !sandbox) {
    // companheiro único (D17): quem já tem um não resgata outro igual
    const jaTem = new Set(db.listarFollowersDe(MUNDO, uid).map((f) => f.catalogoId));
    const presos = db.listarCapturados(MUNDO).filter((f) => (f.dungeonId ?? dg) === dg
      && (f.donoOriginal === uid || !(db.getFollowerCatalogo(f.catalogoId)?.dados?.unico && jaTem.has(f.catalogoId))));
    const meus = presos.filter((f) => f.donoOriginal === uid);
    const livres = presos.filter((f) => f.donoOriginal !== uid && (agora - (f.capturadoEm ?? 0)) / HORA >= JANELA_DONO_H);
    const cand = meus[0] ?? livres[0] ?? null;
    if (cand) {
      const ehDono = cand.donoOriginal === uid;
      if (aleatorio() < Math.min(0.95, CHANCE_RESGATE * (ehDono ? BONUS_DONO : 1) * (r.exito ? 1 : 0.5))) {
        db.resgatarFollower(cand.id, uid);
        db.salvarFollower(cand.id, { nivel: campos.nivel ?? p.nivel, dungeonId: null });
        out.resgatados.push({ nome: db.getFollowerCatalogo(cand.catalogoId)?.nome ?? "?", ehDono });
      }
    }
  }
  if (missao.tipo !== "bico") for (const f of db.getParty(MUNDO, uid)) gastarEnergia(f, 1);
  db.salvarPersonagem(MUNDO, uid, campos);
  // companheiros sobem com o dono (o nível guardado é só para a lista)
  if (campos.nivel && campos.nivel !== p.nivel) for (const f of db.listarFollowersDe(MUNDO, uid)) db.salvarFollower(f.id, { nivel: campos.nivel });
  // evolucionador automático (D24): a cada nível novo e quando entra item
  const pDepois = db.getPersonagem(MUNDO, uid);
  if (pDepois?.evoluirAuto && pDepois.classe && (out.subiu || out.itens.length || out.unicos.length)) {
    try { out.evoluiu = EV.evoluir(uid); } catch (e) { console.error("[RPG] evoluir auto:", e?.message ?? e); }
  }
  return out;
}

// ── A luta completa (solo ou co-op) ─────────────────────────────────────────
export function lutar(uids, missaoBase, { lingua = "pt", aleatorio = Math.random } = {}) {
  const parties = uids.map((uid) => CB.partyDe(MUNDO, uid)).filter(Boolean);
  const nivelGrupo = Math.round(parties.reduce((s, x) => s + x.p.nivel, 0) / Math.max(1, parties.length));
  const spec = montarAlvo(missaoBase, nivelGrupo);
  const bico = spec.missao.tipo === "bico";
  const pv = bico ? { exito: 1, sobrevivencia: 1, poder: 0, resil: 0, magias: [], sinergia: { bonus: 0 } } : CB.prever(parties, spec.alvo);
  const r = bico ? { exito: true, sobreviveu: true, rolagens: { exito: 0, sobrev: 0 }, desfecho: "sucesso", previsao: pv } : R.resolverLuta(pv, aleatorio);
  const resultados = parties.map((x) => aplicar({ uid: x.uid, p: x.p, party: x, spec, r, coop: parties.length > 1, aleatorio }));
  // a história: uma só para o grupo
  const lider = parties[0];
  const recentes = (() => { try { return JSON.parse(lider.p.historia ?? "{}").ids ?? []; } catch { return []; } })();
  const semente = H.sementeDe(lider.uid, spec.missao.id, Date.now());
  const rr = resultados[0];
  const hist = H.contarHistoria({
    jogador: lider.p.nome ?? "?", missao: spec.missao, desfecho: r.desfecho, lingua,
    chances: { exito: pv.exito, sobrevivencia: pv.sobrevivencia }, rolagens: r.rolagens,
    contribuicoes: CB.contribuicoes(parties), magias: pv.magias ?? [], coop: parties.length > 1,
    extras: { loot: rr.itens[0] ?? null, companheiroNovo: rr.companheiro, capturados: resultados.flatMap((x) => x.capturados),
      resgatados: resultados.flatMap((x) => x.resgatados.map((y) => y.nome)), subiu: rr.subiu,
      especial: rr.especial?.item ? { nome: rr.especial.item.nome, jaTinha: rr.especial.jaTinha } : null },
  }, { semente, recentes });
  for (const x of parties) {
    const anteriores = x.uid === lider.uid ? recentes : [];
    db.salvarPersonagem(MUNDO, x.uid, { historia: JSON.stringify({ texto: hist.texto, missao: spec.missao.nome, desfecho: r.desfecho, em: Date.now(), ids: [...hist.ids, ...anteriores].slice(0, 12) }) });
  }
  return { spec, pv, r, resultados, historia: hist, parties };
}

// ── Texto do resultado ───────────────────────────────────────────────────────
const nivelTxt = (x, en) => {
  if (!x.xp) return null;
  const ganho = (x.nivelDepois - x.nivelAntes) + (x.progressoDepois - x.progressoAntes);
  if (x.subiu && en === "es") return ES(`🎉 **¡nivel ${x.nivelDepois}!** (+${Math.round(ganho * 100)}% de nivel · +${x.pontos.toFixed(2).replace(".", ",")} punto(s))`);
  if (x.subiu) return en ? `🎉 **level ${x.nivelDepois}!** (+${Math.round(ganho * 100)}% of a level · +${x.pontos.toFixed(2)} point(s))` : `🎉 **nível ${x.nivelDepois}!** (+${Math.round(ganho * 100)}% de nível · +${x.pontos.toFixed(2).replace(".", ",")} ponto(s))`;
  if (en === "es") return ES(`✨ **+${Math.round(ganho * 100)}% de nivel** (${Math.round(x.progressoDepois * 100)}% para el nivel ${x.nivelDepois + 1})`);
  return en ? `✨ **+${Math.round(ganho * 100)}% of a level** (${Math.round(x.progressoDepois * 100)}% to level ${x.nivelDepois + 1})` : `✨ **+${Math.round(ganho * 100)}% de nível** (${Math.round(x.progressoDepois * 100)}% para o nível ${x.nivelDepois + 1})`;
};
function linhasDe(x, en, curto = false) {
  const L = [];
  const nv = nivelTxt(x, en); if (nv) L.push(nv);
  const m = [];
  if (x.pago.ouro) m.push(`🪙 +${fmt(x.pago.ouro)}`);
  if (x.pago.cristal) m.push(`💎 +${fmt(x.pago.cristal)}`);
  if (x.perdido.ouro) m.push(`🪙 −${fmt(x.perdido.ouro)}`);
  if (x.perdido.cristal) m.push(`💎 −${fmt(x.perdido.cristal)}`);
  if (m.length) L.push(m.join(" · "));
  for (const it of x.unicos) L.push(en === "es" ? ES(`✦ **${it.nome}** — único, una vez por persona`) : `✦ **${it.nome}** — ${en ? "unique, once per person" : "único, uma vez por pessoa"}`);
  for (const it of x.itens) L.push(`🎁 ${RARIDADE_INFO[it.raridade]?.emoji ?? ""} **${it.nome}**${curto ? "" : ` — ${descreverItem(it, en)}`}`);
  if (x.companheiro) L.push(en === "es" ? ES(`👥 **${x.companheiro.nome}** se unió a ti`) : en ? `👥 **${x.companheiro.nome}** joined you` : `👥 **${x.companheiro.nome}** se juntou a você`);
  if (x.capturados.length) L.push(`⛓️ ${x.capturados.join(", ")}`);
  if (x.resgatados.length) L.push(`🔓 ${x.resgatados.map((y) => y.nome).join(", ")}`);
  if (x.evoluiu?.trocas?.length || Object.keys(x.evoluiu?.gastos ?? {}).length) L.push(en === "es" ? ES("⚙️ _evolución automática aplicada_") : en ? "⚙️ _auto-evolve applied_" : "⚙️ _evoluir automático aplicado_");
  return L;
}
export function embedResultado(res, { en, COR, P }) {
  if (en === "es") return embedResultadoEs(res, { COR, P });
  const { spec, pv, r, resultados, historia } = res;
  const m = spec.missao, bico = m.tipo === "bico";
  const titulo = bico ? (en ? "🧺 Job done" : "🧺 Serviço feito")
    : (en ? { sucesso: "🏆 Victory", falha: "😐 Didn't work out", caiu: "💀 You fell" } : { sucesso: "🏆 Vitória", falha: "😐 Não deu certo", caiu: "💀 Você caiu" })[r.desfecho];
  const nomeM = en ? (m.nomeEN ?? m.nome) : m.nome;
  const cab = bico ? `**${nomeM}**` : `**${nomeM}** · ${en ? "level" : "nível"} ${spec.alvo.nivel} · ${en ? "difficulty" : "dificuldade"} ${R.faixaDoNivel(spec.alvo.nivel).n}`;
  const L = [cab, ""];
  if (historia?.texto) L.push(historia.texto, "");
  if (!bico) L.push(en ? `_${pct(pv.exito)} to win · ${pct(pv.sobrevivencia)} to survive${pv.sinergia?.bonus > 0.005 ? ` · synergy +${pct(pv.sinergia.bonus)}` : ""}_`
    : `_${pct(pv.exito)} de vencer · ${pct(pv.sobrevivencia)} de sobreviver${pv.sinergia?.bonus > 0.005 ? ` · sinergia +${pct(pv.sinergia.bonus)}` : ""}_`);
  if (resultados.length === 1) {
    L.push(...linhasDe(resultados[0], en));
  } else {
    for (const x of resultados) L.push(`<@${x.uid}> — ${linhasDe(x, en, true).join(" · ") || (en ? "nothing this time" : "nada desta vez")}`);
  }
  if (r.desfecho === "falha") L.push("", en ? "_A failure is a failure: it pays nothing. Gear and level are never lost._" : "_Falha é falha: não paga nada. Nível e equipamento nunca se perdem._");
  if (r.desfecho === "caiu") L.push("", en ? `_~30 min recovering. Coins went to ${spec.fonte.tipo === "dungeon" ? "the dungeon's treasury" : "the bank"}; level and gear are never lost._`
    : `_~30 min se recuperando. A moeda foi para ${spec.fonte.tipo === "dungeon" ? "o tesouro da dungeon" : "o banco"}; nível e equipamento nunca se perdem._`);
  if (resultados.some((x) => x.capturados.length)) L.push(en ? `_Captured companions stay in this dungeon — \`${citarInterno("game.dungeon", P)}\` shows who; every return from it is a rescue attempt._`
    : `_Os capturados ficam nesta dungeon — \`${citarInterno("game.dungeon", P)}\` mostra quem; toda volta dela é uma tentativa de resgate._`);
  // a capa: o chefe ou a especial; senão, a dungeon onde foi; o único que saiu, por último
  const imagem = bico ? null : imagemDe(m.tipo === "chefe" || m.tipo === "especial" ? m.id : null, spec.fonte.tipo === "dungeon" ? spec.fonte.id : null,
    ...resultados.flatMap((x) => x.unicos.map((it) => it.id)));
  return { title: titulo, description: L.join("\n").slice(0, 3900), colour: { sucesso: COR.sucesso, falha: COR.aviso, caiu: COR.erro }[r.desfecho], ...(imagem ? { imagem } : {}) };
}
function embedResultadoEs(res, { COR, P }) {
  const { spec, pv, r, resultados, historia } = res;
  const m = spec.missao, bico = m.tipo === "bico";
  const titulo = bico ? "🧺 Trabajo hecho" : { sucesso: "🏆 Victoria", falha: "😐 No salió bien", caiu: "💀 Caíste" }[r.desfecho];
  const nomeM = m.nomeEN ?? m.nome;
  const cab = bico ? `**${nomeM}**` : `**${nomeM}** · nivel ${spec.alvo.nivel} · dificultad ${R.faixaDoNivel(spec.alvo.nivel).n}`;
  const L = [cab, ""];
  if (historia?.texto) L.push(historia.texto, "");
  if (!bico) L.push(`_${pct(pv.exito)} de ganar · ${pct(pv.sobrevivencia)} de sobrevivir${pv.sinergia?.bonus > 0.005 ? ` · sinergia +${pct(pv.sinergia.bonus)}` : ""}_`);
  if (resultados.length === 1) {
    L.push(...linhasDe(resultados[0], "es"));
  } else {
    for (const x of resultados) L.push(`<@${x.uid}> — ${linhasDe(x, "es", true).join(" · ") || "sin premio esta vez"}`);
  }
  if (r.desfecho === "falha") L.push("", "_Un fallo es un fallo: no paga. El nivel y el equipo nunca se pierden._");
  if (r.desfecho === "caiu") L.push("", `_~30 min recuperándote. La moneda fue ${spec.fonte.tipo === "dungeon" ? "al tesoro de la mazmorra" : "al banco"}; el nivel y el equipo nunca se pierden._`);
  if (resultados.some((x) => x.capturados.length)) L.push(`_Los capturados se quedan en esta mazmorra — \`${citar("game.dungeon", "es", P)}\` muestra quiénes; cada vuelta de ella es un intento de rescate._`);
  const imagem = bico ? null : imagemDe(m.tipo === "chefe" || m.tipo === "especial" ? m.id : null, spec.fonte.tipo === "dungeon" ? spec.fonte.id : null,
    ...resultados.flatMap((x) => x.unicos.map((it) => it.id)));
  return { title: ES(titulo), description: ES(L.join("\n").slice(0, 3900)), colour: { sucesso: COR.sucesso, falha: COR.aviso, caiu: COR.erro }[r.desfecho], ...(imagem ? { imagem } : {}) };
}

// ── Listas ───────────────────────────────────────────────────────────────────
function chanceDe(uid, missao) {
  const party = CB.partyDe(MUNDO, uid); if (!party) return null;
  const spec = montarAlvo(missao, party.p.nivel);
  if (spec.missao.tipo === "bico") return { exito: 1, sobrevivencia: 1, spec, party };
  return { ...CB.prever([party], spec.alvo), spec, party };
}
const valeTxt = (xp, p, en) => { const v = MISS.valeNiveis(xp, p.nivel, p.progresso ?? 0); return en === "es" ? ES(`+${Math.round(v * 100)}% nv`) : en ? `+${Math.round(v * 100)}% lv` : `+${Math.round(v * 100)}% nv`; };

export const SUBS = ["missao", "missão", "missoes", "missões", "quest", "contrato", "contratos", "bico", "bicos",
  "especial", "especiais", "dungeon", "dungeons", "resgate", "resgatar", "chefe", "chefes", "boss", "coop", "co-op", "grupo", "chamado", "group", "historia", "história", "story"];

export async function cmdAventura(message, args, ctx, { sendEmbed, en }) {
  const { COR, PREFIXO: P } = ctx;
  const lg = idiomaDe(ctx) === "es" ? "es" : en;   // o idioma para os auxiliares
  const ce = (ref) => citar(ref, "es", P);         // o comando citado no espanhol
  const sub = String(args[0] ?? "").toLowerCase(), eu = message.authorId;
  const p = db.getPersonagem(MUNDO, eu);
  const semPersonagem = () => sendEmbed(message.channel, { title: tr(ctx, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"), colour: COR.aviso,
    description: tr(ctx, `Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${ce("game.criar")}\`.`) });
  const resto = args.slice(1).join(" ").trim();
  const partir = async (missao) => {
    const spec = montarAlvo(missao, p.nivel);
    const imp = impedimento(eu, spec, lg);
    if (imp) return sendEmbed(message.channel, { title: tr(ctx, "⏳ Agora não", "⏳ Not now", "⏳ Ahora no"), colour: COR.aviso, description: `<@${eu}> ${imp}.` });
    const res = lutar([eu], missao, { lingua: en ? "en" : "pt" });
    return sendEmbed(message.channel, embedResultado(res, { en: lg, COR, P }));
  };

  // ── &game historia — reexibe a última ──
  if (["historia", "história", "story"].includes(sub)) {
    if (!p) return semPersonagem();
    let h = null; try { h = JSON.parse(p.historia ?? "null"); } catch {}
    return sendEmbed(message.channel, { title: tr(ctx, "📖 Sua última história", "📖 Your last story", "📖 Tu última historia"), colour: COR.info,
      description: h?.texto ? `**${h.missao}**\n\n${h.texto}` : tr(ctx, "_Nenhuma história ainda — vá a uma missão._", "_No story yet — go on a mission._", "_Todavía no hay historia — ve a una misión._") });
  }

  // ── contratos (o quadro da guilda) e bicos ──
  if (["missao", "missão", "missoes", "missões", "quest", "contrato", "contratos", "bico", "bicos"].includes(sub)) {
    if (!p) return semPersonagem();
    const difPedida = /^\d+$/.test(resto) ? Math.max(1, Math.min(10, parseInt(resto, 10))) : null;
    if (resto && !difPedida) {
      const m = MISS.acharContrato(resto);
      if (!m) return sendEmbed(message.channel, { title: tr(ctx, "❌ Contrato desconhecido", "❌ Unknown contract", "❌ Contrato desconocido"), colour: COR.erro,
        description: tr(ctx, `Não achei **${resto}**. Veja o quadro com \`${citarInterno("game.contratos", P)}\`.`, `I couldn't find **${resto}**. See the board with \`${citarInterno("game.contratos", P)}\`.`,
          `No encontré **${resto}**. Mira el tablón con \`${ce("game.contratos")}\`.`) });
      return partir(m);
    }
    const dif = difPedida ?? R.faixaDoNivel(p.nivel).n;
    const difs = difPedida ? [dif] : [dif - 1, dif, dif + 1].filter((d) => d >= 1 && d <= 10);
    const L = [];
    if ((p.recuperandoAte ?? 0) > Date.now()) L.push(tr(ctx, `🩹 **Você está se recuperando** (~${Math.ceil((p.recuperandoAte - Date.now()) / MIN)} min).`, `🩹 **You're recovering** (~${Math.ceil((p.recuperandoAte - Date.now()) / MIN)} min).`,
      `🩹 **Te estás recuperando** (~${Math.ceil((p.recuperandoAte - Date.now()) / MIN)} min).`), "");
    L.push(tr(ctx, "🧺 **Bicos** — sem risco, pagam pouco", "🧺 **Jobs** — no risk, small pay", "🧺 **Trabajos** — sin riesgo, pagan poco"));
    for (const m of MISS.BICOS) L.push(`   • **${m.nome}**`);
    for (const d of difs) {
      const f = R.faixaDaDif(d);
      L.push("", tr(ctx, `${RARIDADE_INFO[f.raridade].emoji} **Dificuldade ${d} — ${f.nome}** _(níveis ${f.niveis[0]}–${f.niveis[1]})_`,
        `${RARIDADE_INFO[f.raridade].emoji} **Difficulty ${d} — ${f.nomeEN}** _(levels ${f.niveis[0]}–${f.niveis[1]})_`,
        `${RARIDADE_INFO[f.raridade].emoji} **Dificultad ${d} — ${f.nomeEN}** _(niveles ${f.niveis[0]}–${f.niveis[1]})_`));
      for (const m of MISS.CONTRATOS.filter((x) => R.faixaDoNivel(x.nivel).n === d)) {
        const c = chanceDe(eu, m), com = c.exito * c.sobrevivencia;
        const perigo = m.perigo === "baixo" ? tr(ctx, " · 🌿 perigo baixo", " · 🌿 low danger", " · 🌿 peligro bajo") : "";
        const nv = tr(ctx, "nv", "lv", "nv"), vale = valeTxt(MISS.xpDa(m, c.spec.alvo, p.nivel), p, lg);
        L.push(com >= 0.9995 ? `   • **${m.nome}** _(${nv} ${m.nivel})_ — ✅ ${tr(ctx, "garantida", "guaranteed", "garantizada")} · ${vale}${perigo}`
          : `   • **${m.nome}** _(${nv} ${m.nivel})_ — 🏆 **${pct(com)}** _(${pct(c.exito)} × ${pct(c.sobrevivencia)})_ · ${vale}${perigo}`);
      }
    }
    L.push("", tr(ctx, `_🏆 = vencer E voltar vivo. "+% nv" = quanto um êxito vale para você. Quem paga é a guilda (o banco). Com 3× a força para a qual o contrato foi feito, é garantido — nunca pelo nível._`,
      `_🏆 = win AND come back alive. "+% lv" = what one win is worth to you. The guild (the bank) pays. With 3× the strength a contract was made for, it's guaranteed — never by level._`,
      `_🏆 = ganar Y volver con vida. "+% nv" = lo que vale para ti una victoria. Paga el gremio (el banco). Con 3× la fuerza para la que se hizo el contrato, está garantizado — nunca por nivel._`),
      tr(ctx, `\`${citarInterno("game.contrato", P)} <nome>\` · \`${citarInterno("game.contratos", P)} <1-10>\` — outra dificuldade · \`${citarInterno("game.dungeons", P)}\` · \`${citarInterno("game.especiais", P)}\``,
        `\`${citarInterno("game.contrato", P)} <name>\` · \`${citarInterno("game.contratos", P)} <1-10>\` — another difficulty · \`${citarInterno("game.dungeons", P)}\` · \`${citarInterno("game.especiais", P)}\``,
        `\`${ce("game.contrato")} <nombre>\` · \`${ce("game.contratos")} <1-10>\` — otra dificultad · \`${ce("game.dungeons")}\` · \`${ce("game.especiais")}\``));
    return enviarLista(sendEmbed, message.channel, { titulo: tr(ctx, "📜 Quadro da guilda — contratos", "📜 Guild board — contracts", "📜 Tablón del gremio — contratos"), linhas: L, colour: COR.info });
  }

  // ── missões especiais ──
  if (["especial", "especiais"].includes(sub)) {
    if (!p) return semPersonagem();
    if (resto) {
      const m = MISS.acharEspecial(resto);
      if (!m) return sendEmbed(message.channel, { title: tr(ctx, "❌ Especial desconhecida", "❌ Unknown special mission", "❌ Misión especial desconocida"), colour: COR.erro,
        description: tr(ctx, `\`${citarInterno("game.especiais", P)}\``, `\`${citarInterno("game.especiais", P)}\``, `\`${ce("game.especiais")}\``) });
      return partir(m);
    }
    const L = [tr(ctx, "Recompensa que não existe em outro lugar — **uma vez por pessoa** (o primeiro êxito). Depois, paga como qualquer contrato.", "One-of-a-kind reward — **once per person** (the first win). After that, it still pays like any contract.",
      "Una recompensa que no existe en ningún otro sitio — **una vez por persona** (la primera victoria). Después, paga como cualquier contrato."), ""];
    for (const m of [...MISS.ESPECIAIS].sort((a, b) => a.nivel - b.nivel)) {
      const feita = db.temUnico(eu, `especial:${m.id}`), c = chanceDe(eu, m);
      const rec = m.recompensa?.tipo === "companheiro" ? tr(ctx, "companheiro", "companion", "compañero") : m.recompensa?.tipo === "magia" ? tr(ctx, "magia", "spell", "hechizo") : tr(ctx, "item", "item", "objeto");
      L.push(`${feita ? "✅" : "✦"} **${m.nome}** _(${tr(ctx, "nv", "lv", "nv")} ${m.nivel})_ — ${rec}${feita ? tr(ctx, " · já é sua", " · already yours", " · ya es tuya") : ""} · 🏆 ${pct(c.exito * c.sobrevivencia)}`);
      L.push(`   _${tr(ctx, m.descricao.pt, m.descricao.en, m.descricao.es ?? m.descricao.en)}_`);
    }
    L.push("", tr(ctx, `_30% / 60% no próprio nível; 2 h entre tentativas até o primeiro êxito. \`${citarInterno("game.especial", P)} <nome>\`_`, `_30% / 60% at their own level; 2 h between attempts until the first win. \`${citarInterno("game.especial", P)} <name>\`_`,
      `_30% / 60% en su propio nivel; 2 h entre intentos hasta la primera victoria. \`${ce("game.especial")} <nombre>\`_`));
    return enviarLista(sendEmbed, message.channel, { titulo: tr(ctx, "✦ Missões especiais", "✦ Special missions", "✦ Misiones especiales"), linhas: L, colour: COR.info });
  }

  // ── chefes ──
  if (["chefe", "chefes", "boss"].includes(sub)) {
    if (!p) return semPersonagem();
    if (resto) {
      const c = MISS.acharChefe(resto);
      if (!c) return sendEmbed(message.channel, { title: tr(ctx, "❌ Chefe desconhecido", "❌ Unknown boss", "❌ Jefe desconocido"), colour: COR.erro,
        description: tr(ctx, `\`${citarInterno("game.chefes", P)}\``, `\`${citarInterno("game.chefes", P)}\``, `\`${ce("game.chefes")}\``) });
      return partir(c);
    }
    const L = [tr(ctx, "Chefe luta como missão: 35% de vitória / 60% de sobrevivência com 4 jogadores do nível dele (~8% sozinho). Espera: 24 h por pessoa, por chefe.", "A boss fights like a mission: 35% win / 60% survival for 4 players of its level (~8% alone). Wait: 24 h per person, per boss.",
      "Un jefe pelea como una misión: 35% de victoria / 60% de supervivencia con 4 jugadores de su nivel (~8% solo). Espera: 24 h por persona, por jefe."), ""];
    for (const c of [...MISS.CHEFES.values()].sort((a, b) => a.nivel - b.nivel)) {
      const ch = chanceDe(eu, c), venceu = db.temUnico(eu, `chefe:${c.id}`), espera = db.esperaAte(eu, `chefe:${c.id}`) > Date.now();
      const onde = c.dungeon ? `🕳️ ${MISS.DUNGEONS.get(c.dungeon)?.nome ?? c.dungeon}` : tr(ctx, "avulso", "standalone", "suelto");
      const rec = c.recompensa ? (venceu ? tr(ctx, " · ✦ já recebido", " · ✦ already received", " · ✦ ya recibida") : tr(ctx, " · ✦ recompensa única", " · ✦ unique reward", " · ✦ recompensa única")) : "";
      L.push(`${venceu ? "🏅" : "💀"} **${c.nome}** _(${tr(ctx, "nv", "lv", "nv")} ${c.nivel})_ — ${onde} · 🏆 ${pct(ch.exito * ch.sobrevivencia)}${rec}${espera ? " · ⏳" : ""}${c.requer && !db.temUnico(eu, `chefe:${c.requer}`) ? " · 🔒" : ""}`);
    }
    L.push("", tr(ctx, `_\`${citarInterno("game.chefe", P)} <nome>\` sozinho · \`${citarInterno("game", P)} coop abrir chefe <nome>\` em grupo (até ${COOP_MAX}) · 🔒 = vença o ato anterior antes_`,
      `_\`${citarInterno("game.chefe", P)} <name>\` alone · \`${citarInterno("game", P)} coop abrir chefe <name>\` in a group (up to ${COOP_MAX}) · 🔒 = beat the previous act first_`,
      `_\`${ce("game.chefe")} <nombre>\` solo · \`${ce("game")} coop open boss <nombre>\` en grupo (hasta ${COOP_MAX}) · 🔒 = vence antes el acto anterior_`));
    return enviarLista(sendEmbed, message.channel, { titulo: tr(ctx, "💀 Chefes", "💀 Bosses", "💀 Jefes"), linhas: L, colour: COR.info });
  }

  // ── dungeons ──
  if (["dungeon", "dungeons", "resgate", "resgatar"].includes(sub)) {
    if (!p) return semPersonagem();
    const chefe = /\s(chefe|boss)$/i.test(resto);
    const nomeD = resto.replace(/\s(chefe|boss)$/i, "").trim();
    if (nomeD && sub !== "dungeons") {
      const d = MISS.acharDungeon(nomeD);
      if (!d) return sendEmbed(message.channel, { title: tr(ctx, "❌ Dungeon desconhecida", "❌ Unknown dungeon", "❌ Mazmorra desconocida"), colour: COR.erro,
        description: tr(ctx, `\`${citarInterno("game.dungeons", P)}\``, `\`${citarInterno("game.dungeons", P)}\``, `\`${ce("game.dungeons")}\``) });
      if (chefe) { const c = MISS.CHEFES.get(d.chefe); if (c) return partir(c); }
      return partir({ id: d.id, tipo: "dungeon-encontro", dungeon: d.id, nome: d.nome });
    }
    const L = [tr(ctx, "Mundo aberto: cada uma paga do **tesouro dela**, que se renova com quem joga lá (a única moeda nova do jogo). 70% do loot é do tema; aqui os companheiros podem ser **capturados** (20% cada, se você cair).",
      "Open world: each one pays from **its own treasury**, which refills with the players who play there (the only new money in the game). 70% of the loot is themed; companions can be **captured** here (20% each if you fall).",
      "Mundo abierto: cada una paga de **su propio tesoro**, que se renueva con quien juega allí (la única moneda nueva del juego). El 70% del botín es del tema; aquí los compañeros pueden ser **capturados** (20% cada uno, si caes)."), ""];
    for (const d of [...MISS.DUNGEONS.values()].sort((a, b) => a.niveis[0] - b.niveis[0] || a.niveis[1] - b.niveis[1])) {
      const t = TS.estadoDoTesouro(d.id, MISS.nivelDoEncontro(d, p.nivel));
      const dentro = p.nivel >= d.niveis[0] && p.nivel <= d.niveis[1];
      L.push(`${dentro ? "➡️" : "•"} **${d.nome}** _(${tr(ctx, "níveis", "levels", "niveles")} ${d.niveis[0]}–${d.niveis[1]})_ — 💰 ${tr(ctx, t.rotulo, t.rotuloEN, TESOURO_ES[t.rotuloEN] ?? t.rotuloEN)}${d.obra ? ` · _${d.obra}_` : ""}`);
    }
    const presos = db.listarCapturados(MUNDO);
    if (presos.length) {
      L.push("", tr(ctx, `⛓️ **Capturados (${presos.length})**`, `⛓️ **Captured (${presos.length})**`, `⛓️ **Capturados (${presos.length})**`));
      for (const f of presos.slice(0, 15)) {
        const cat = db.getFollowerCatalogo(f.catalogoId), meu = f.donoOriginal === eu, h = (Date.now() - (f.capturadoEm ?? 0)) / HORA;
        const onde = MISS.DUNGEONS.get(f.dungeonId)?.nome ?? tr(ctx, "uma dungeon", "a dungeon", "una mazmorra");
        L.push(`   ${RARIDADE_INFO[cat?.raridade]?.emoji ?? ""} **${cat?.nome ?? "?"}** — ${onde}${meu ? tr(ctx, " · 👤 seu", " · 👤 yours", " · 👤 tuyo") : h < JANELA_DONO_H ? tr(ctx, ` · ⏳ janela do dono (~${Math.ceil(JANELA_DONO_H - h)}h)`, ` · ⏳ owner's window (~${Math.ceil(JANELA_DONO_H - h)}h)`, ` · ⏳ turno del dueño (~${Math.ceil(JANELA_DONO_H - h)}h)`) : tr(ctx, " · 🔓 qualquer um pode trazer", " · 🔓 anyone can bring them back", " · 🔓 cualquiera puede traerlo")}`);
      }
      L.push(tr(ctx, "_O resgate é automático: toda volta daquela dungeon é uma tentativa (vencer dobra a chance)._", "_The rescue is automatic: every return from that dungeon is one attempt (a win doubles it)._",
        "_El rescate es automático: cada vuelta de esa mazmorra es un intento (ganar duplica la probabilidad)._"));
    }
    L.push("", tr(ctx, `\`${citarInterno("game.dungeon", P)} <nome>\` — um encontro no seu nível · \`${citarInterno("game.dungeon", P)} <nome> chefe\` — o chefe dela`, `\`${citarInterno("game.dungeon", P)} <name>\` — one encounter at your level · \`${citarInterno("game.dungeon", P)} <name> chefe\` — its boss`,
      `\`${ce("game.dungeon")} <nombre>\` — un encuentro en tu nivel · \`${ce("game.dungeon")} <nombre> boss\` — su jefe`));
    return enviarLista(sendEmbed, message.channel, { titulo: tr(ctx, "🕳️ Dungeons", "🕳️ Dungeons", "🕳️ Mazmorras"), linhas: L, colour: COR.info });
  }

  // ── co-op (2 out 2026; v4: serve para contrato, especial, dungeon e chefe) ──
  if (["coop", "co-op", "grupo", "chamado", "group"].includes(sub)) return coop(message, args, ctx, { sendEmbed, en });
  return null;
}

function acharAlvoCoop(txt) {
  const t = String(txt ?? "").trim();
  const m = t.match(/^(chefe|boss|dungeon|especial|contrato)\s+(.+)$/i);
  if (m) {
    const tipo = m[1].toLowerCase();
    if (tipo === "chefe" || tipo === "boss") return MISS.acharChefe(m[2]);
    if (tipo === "especial") return MISS.acharEspecial(m[2]);
    if (tipo === "contrato") return MISS.acharContrato(m[2]);
    const d = MISS.acharDungeon(m[2].replace(/\s(chefe|boss)$/i, ""));
    if (!d) return null;
    if (/\s(chefe|boss)$/i.test(m[2])) return MISS.CHEFES.get(d.chefe) ?? null;
    return { id: d.id, tipo: "dungeon-encontro", dungeon: d.id, nome: d.nome };
  }
  return MISS.acharContrato(t) ?? MISS.acharEspecial(t) ?? MISS.acharChefe(t) ?? null;
}

async function coop(message, args, ctx, { sendEmbed, en }) {
  const { COR, PREFIXO: P } = ctx;
  const lg = idiomaDe(ctx) === "es" ? "es" : en;   // o idioma para os auxiliares
  const cg = citar("game", "es", P);                // o comando citado no espanhol
  const eu = message.authorId, acao = String(args[1] ?? "").toLowerCase();
  const canalId = message.channelId ?? message.channel?.id, agora = Date.now();
  const g0 = GRUPOS_COOP.get(canalId);
  if (g0 && agora - g0.criadoEm > COOP_VALIDADE_MS) GRUPOS_COOP.delete(canalId);
  const grupo = GRUPOS_COOP.get(canalId) ?? null;
  const nomeDe = (m) => (en ? m.nomeEN ?? m.nome : m.nome);
  const painel = (g, titulo) => {
    const parties = g.membros.map((u) => CB.partyDe(MUNDO, u)).filter(Boolean);
    const nivel = Math.round(parties.reduce((s, x) => s + x.p.nivel, 0) / Math.max(1, parties.length));
    const spec = montarAlvo(g.missao, nivel), pv = CB.prever(parties, spec.alvo);
    return { title: titulo ?? tr(ctx, `⚔️ Grupo para ${nomeDe(g.missao)}`, `⚔️ Group for ${nomeDe(g.missao)}`, `⚔️ Grupo para ${nomeDe(g.missao)}`), colour: COR.info, description: tr(ctx, [
      `**Membros** (${g.membros.length}/${COOP_MAX}): ${g.membros.map((u) => `<@${u}>`).join(" · ")}`,
      `**Juntos:** ${pct(pv.exito)} de vencer · ${pct(pv.sobrevivencia)} de sobreviver${pv.sinergia?.bonus > 0.005 ? ` · sinergia +${pct(pv.sinergia.bonus)}` : ""}`,
      "",
      `\`${citarInterno("game", P)} coop entrar\` — entra · \`${citarInterno("game", P)} coop sair\` — sai`,
      `_<@${g.lider}>: \`${citarInterno("game", P)} coop partir\` parte agora · \`${citarInterno("game", P)} coop cancelar\`. Parte sozinho com ${COOP_MAX}, e expira em 10 min._`,
    ].join("\n"), [
      `**Members** (${g.membros.length}/${COOP_MAX}): ${g.membros.map((u) => `<@${u}>`).join(" · ")}`,
      `**Together:** ${pct(pv.exito)} to win · ${pct(pv.sobrevivencia)} to survive${pv.sinergia?.bonus > 0.005 ? ` · synergy +${pct(pv.sinergia.bonus)}` : ""}`,
      "",
      `\`${citarInterno("game", P)} coop entrar\` — join · \`${citarInterno("game", P)} coop sair\` — leave`,
      `_<@${g.lider}>: \`${citarInterno("game", P)} coop partir\` leaves now · \`${citarInterno("game", P)} coop cancelar\`. It leaves by itself at ${COOP_MAX}, and expires in 10 min._`,
    ].join("\n"), [
      `**Miembros** (${g.membros.length}/${COOP_MAX}): ${g.membros.map((u) => `<@${u}>`).join(" · ")}`,
      `**Juntos:** ${pct(pv.exito)} de ganar · ${pct(pv.sobrevivencia)} de sobrevivir${pv.sinergia?.bonus > 0.005 ? ` · sinergia +${pct(pv.sinergia.bonus)}` : ""}`,
      "",
      `\`${cg} coop join\` — entra · \`${cg} coop leave\` — sale`,
      `_<@${g.lider}>: \`${cg} coop go\` sale ahora · \`${cg} coop cancel\`. Sale solo al llegar a ${COOP_MAX}, y caduca en 10 min._`,
    ].join("\n")) };
  };
  const specDe = (missao) => montarAlvo(missao, db.getPersonagem(MUNDO, eu)?.nivel ?? 1);

  if (!acao) {
    return sendEmbed(message.channel, grupo ? painel(grupo) : { title: tr(ctx, "⚔️ Co-op", "⚔️ Co-op", "⚔️ Co-op"), colour: COR.info, description: tr(ctx, [
      "Até 4 pessoas (cada uma com seus companheiros) encaram juntas um contrato, uma missão especial, uma dungeon ou um chefe.",
      "Um desfecho para o grupo — o ataque e a defesa de todos somam; a missão paga a força dela a **cada um** (XP, moedas e loot de cada um).",
      "",
      `\`${citarInterno("game", P)} coop abrir <contrato>\` · \`${citarInterno("game", P)} coop abrir dungeon <nome>\` · \`${citarInterno("game", P)} coop abrir chefe <nome>\``,
      `\`${citarInterno("game", P)} coop entrar\` · \`${citarInterno("game", P)} coop partir\``,
    ].join("\n"), [
      "Up to 4 people (each with their companions) take on a contract, a special mission, a dungeon or a boss together.",
      "One outcome for the group — everyone's attack and defense add up; the mission pays its strength to **each one** (XP, coins and loot of their own).",
      "",
      `\`${citarInterno("game", P)} coop abrir <contract>\` · \`${citarInterno("game", P)} coop abrir dungeon <name>\` · \`${citarInterno("game", P)} coop abrir chefe <name>\``,
      `\`${citarInterno("game", P)} coop entrar\` · \`${citarInterno("game", P)} coop partir\``,
    ].join("\n"), [
      "Hasta 4 personas (cada una con sus compañeros) se enfrentan juntas a un contrato, una misión especial, una mazmorra o un jefe.",
      "Un solo desenlace para el grupo — el ataque y la defensa de todos se suman; la misión paga su fuerza a **cada uno** (XP, monedas y botín propios).",
      "",
      `\`${cg} coop open <contrato>\` · \`${cg} coop open dungeon <nombre>\` · \`${cg} coop open boss <nombre>\``,
      `\`${cg} coop join\` · \`${cg} coop go\``,
    ].join("\n")) });
  }
  if (["abrir", "open", "criar"].includes(acao)) {
    if (grupo) return sendEmbed(message.channel, painel(grupo, tr(ctx, "⚔️ Já tem um grupo aberto aqui", "⚔️ There's already an open group here", "⚔️ Ya hay un grupo abierto aquí")));
    const missao = acharAlvoCoop(args.slice(2).join(" "));
    if (!missao) return sendEmbed(message.channel, { title: tr(ctx, "❓ Qual?", "❓ Which one?", "❓ ¿Cuál?"), colour: COR.aviso,
      description: tr(ctx, `\`${citarInterno("game.contratos", P)}\` · \`${citarInterno("game.dungeons", P)}\` · \`${citarInterno("game.chefes", P)}\``, `\`${citarInterno("game.contratos", P)}\` · \`${citarInterno("game.dungeons", P)}\` · \`${citarInterno("game.chefes", P)}\``,
        `\`${citar("game.contratos", "es", P)}\` · \`${citar("game.dungeons", "es", P)}\` · \`${citar("game.chefes", "es", P)}\``) });
    if (missao.tipo === "bico") return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: tr(ctx, "Bico é solo — o co-op é para as lutas.", "Jobs are solo — co-op is for fights.", "Los trabajos son en solitario — el co-op es para las peleas.") });
    const imp = impedimento(eu, specDe(missao), lg);
    if (imp) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: `<@${eu}> ${imp}.` });
    const novo = { lider: eu, missao, membros: [eu], criadoEm: agora, canalId };
    GRUPOS_COOP.set(canalId, novo);
    setTimeout(() => { if (GRUPOS_COOP.get(canalId) === novo) GRUPOS_COOP.delete(canalId); }, COOP_VALIDADE_MS).unref?.();
    return sendEmbed(message.channel, painel(novo));
  }
  if (!grupo) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: tr(ctx, `Nenhum grupo aberto neste canal. \`${citarInterno("game", P)} coop abrir <missão>\``, `No open group in this channel. \`${citarInterno("game", P)} coop abrir <mission>\``,
    `No hay ningún grupo abierto en este canal. \`${cg} coop open <misión>\``) });
  if (["entrar", "join"].includes(acao)) {
    if (grupo.membros.includes(eu)) return sendEmbed(message.channel, painel(grupo));
    if (grupo.membros.length >= COOP_MAX) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: tr(ctx, "O grupo está cheio.", "The group is full.", "El grupo está lleno.") });
    const imp = impedimento(eu, specDe(grupo.missao), lg);
    if (imp) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: `<@${eu}> ${imp}.` });
    grupo.membros.push(eu);
    if (grupo.membros.length < COOP_MAX) return sendEmbed(message.channel, painel(grupo));
  } else if (["sair", "leave"].includes(acao)) {
    if (eu === grupo.lider) { GRUPOS_COOP.delete(canalId); return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: tr(ctx, "Quem abriu saiu — o grupo foi desfeito.", "The leader left — the group was disbanded.", "Quien lo abrió se fue — el grupo se deshizo.") }); }
    grupo.membros = grupo.membros.filter((u) => u !== eu);
    return sendEmbed(message.channel, painel(grupo));
  } else if (["cancelar", "cancel", "fechar"].includes(acao)) {
    if (eu !== grupo.lider) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: tr(ctx, "Só quem abriu pode cancelar.", "Only whoever opened it can cancel.", "Solo quien lo abrió puede cancelarlo.") });
    GRUPOS_COOP.delete(canalId);
    return sendEmbed(message.channel, { title: "⚔️", colour: COR.info, description: tr(ctx, "Grupo cancelado.", "Group cancelled.", "Grupo cancelado.") });
  } else if (["partir", "ir", "go", "start"].includes(acao)) {
    if (eu !== grupo.lider) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: tr(ctx, "Só quem abriu decide a hora de partir.", "Only whoever opened it decides when to leave.", "Solo quien lo abrió decide cuándo partir.") });
  } else return sendEmbed(message.channel, painel(grupo));

  GRUPOS_COOP.delete(canalId);
  const vao = [], ficaram = [];
  for (const uid of grupo.membros) {
    const imp = impedimento(uid, montarAlvo(grupo.missao, db.getPersonagem(MUNDO, uid)?.nivel ?? 1), lg);
    if (imp) ficaram.push(`<@${uid}> ${imp}`); else vao.push(uid);
  }
  if (!vao.length) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: ficaram.join("\n") });
  const res = lutar(vao, grupo.missao, { lingua: en ? "en" : "pt" });
  const e = embedResultado(res, { en: lg, COR, P });
  if (lg === "es") {
    if (ficaram.length) e.description = ES(`${e.description}\n\n**Se quedaron atrás:** ${ficaram.join(" · ")}`);
    e.title = ES(`${e.title} — ${vao.length} aventurero(s)`);
    return sendEmbed(message.channel, e);
  }
  if (ficaram.length) e.description += `\n\n${en ? "**Stayed behind:** " : "**Ficaram para trás:** "}${ficaram.join(" · ")}`;
  e.title = `${e.title} — ${vao.length} ${en ? "adventurer(s)" : "aventureiro(s)"}`;
  return sendEmbed(message.channel, e);
}
