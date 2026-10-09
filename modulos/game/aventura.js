// As lutas do RPG v4 (G3, G3b, G3c, G4): contratos da guilda, bicos, missões
// especiais, dungeons e chefes — e o co-op, que serve para todas. A luta é uma
// só (regras.preverLuta/resolverLuta); muda quem paga a moeda (o banco ou o
// tesouro da dungeon), o loot (tema só na dungeon), a captura (só na dungeon) e
// a recompensa única (especial e chefe com nome, uma vez por pessoa).

import * as db from "../core/db.js";
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
  if (!p) return en ? "has no character" : "não tem personagem";
  const agora = Date.now();
  if ((p.recuperandoAte ?? 0) > agora) return en ? `is still recovering (~${Math.ceil((p.recuperandoAte - agora) / MIN)} min)` : `ainda está se recuperando (~${Math.ceil((p.recuperandoAte - agora) / MIN)} min)`;
  const libera = (p.ultimaMissao ?? 0) + spec.esperaMin * MIN;
  if (libera > agora) return en ? `is still resting (~${Math.ceil((libera - agora) / MIN)} min)` : `ainda está na espera (~${Math.ceil((libera - agora) / MIN)} min)`;
  if (spec.chaveEspera) {
    const ate = db.esperaAte(uid, spec.chaveEspera);
    if (ate > agora) {
      const h = (ate - agora) / HORA;
      return en ? `already tried this one recently (~${h >= 1 ? `${Math.ceil(h)} h` : `${Math.ceil(h * 60)} min`})` : `já tentou esta há pouco (~${h >= 1 ? `${Math.ceil(h)} h` : `${Math.ceil(h * 60)} min`})`;
    }
  }
  if (spec.missao.requer && !db.temUnico(uid, `chefe:${spec.missao.requer}`) && !db.temUnico(uid, `especial:${spec.missao.requer}`)) {
    const req = MISS.CHEFES.get(spec.missao.requer) ?? MISS.ESPECIAIS.find((e) => e.id === spec.missao.requer);
    return en ? `must first beat **${req?.nomeEN ?? req?.nome ?? spec.missao.requer}**` : `precisa vencer antes **${req?.nome ?? spec.missao.requer}**`;
  }
  if (spec.missao.tipo !== "bico" && db.getParty(MUNDO, uid).some((f) => energiaAtual(f) < 1)) return en ? "has a companion out of energy" : "tem companheiro sem energia";
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
  if (x.subiu) return en ? `🎉 **level ${x.nivelDepois}!** (+${Math.round(ganho * 100)}% of a level · +${x.pontos.toFixed(2)} point(s))` : `🎉 **nível ${x.nivelDepois}!** (+${Math.round(ganho * 100)}% de nível · +${x.pontos.toFixed(2).replace(".", ",")} ponto(s))`;
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
  for (const it of x.unicos) L.push(`✦ **${it.nome}** — ${en ? "unique, once per person" : "único, uma vez por pessoa"}`);
  for (const it of x.itens) L.push(`🎁 ${RARIDADE_INFO[it.raridade]?.emoji ?? ""} **${it.nome}**${curto ? "" : ` — ${descreverItem(it, en)}`}`);
  if (x.companheiro) L.push(en ? `👥 **${x.companheiro.nome}** joined you` : `👥 **${x.companheiro.nome}** se juntou a você`);
  if (x.capturados.length) L.push(`⛓️ ${x.capturados.join(", ")}`);
  if (x.resgatados.length) L.push(`🔓 ${x.resgatados.map((y) => y.nome).join(", ")}`);
  if (x.evoluiu?.trocas?.length || Object.keys(x.evoluiu?.gastos ?? {}).length) L.push(en ? "⚙️ _auto-evolve applied_" : "⚙️ _evoluir automático aplicado_");
  return L;
}
export function embedResultado(res, { en, COR, P }) {
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
  if (resultados.some((x) => x.capturados.length)) L.push(en ? `_Captured companions stay in this dungeon — \`${P}game dungeon\` shows who; every return from it is a rescue attempt._`
    : `_Os capturados ficam nesta dungeon — \`${P}game dungeon\` mostra quem; toda volta dela é uma tentativa de resgate._`);
  // a capa: o chefe ou a especial; senão, a dungeon onde foi; o único que saiu, por último
  const imagem = bico ? null : imagemDe(m.tipo === "chefe" || m.tipo === "especial" ? m.id : null, spec.fonte.tipo === "dungeon" ? spec.fonte.id : null,
    ...resultados.flatMap((x) => x.unicos.map((it) => it.id)));
  return { title: titulo, description: L.join("\n").slice(0, 3900), colour: { sucesso: COR.sucesso, falha: COR.aviso, caiu: COR.erro }[r.desfecho], ...(imagem ? { imagem } : {}) };
}

// ── Listas ───────────────────────────────────────────────────────────────────
function chanceDe(uid, missao) {
  const party = CB.partyDe(MUNDO, uid); if (!party) return null;
  const spec = montarAlvo(missao, party.p.nivel);
  if (spec.missao.tipo === "bico") return { exito: 1, sobrevivencia: 1, spec, party };
  return { ...CB.prever([party], spec.alvo), spec, party };
}
const valeTxt = (xp, p, en) => { const v = MISS.valeNiveis(xp, p.nivel, p.progresso ?? 0); return en ? `+${Math.round(v * 100)}% lv` : `+${Math.round(v * 100)}% nv`; };

export const SUBS = ["missao", "missão", "missoes", "missões", "quest", "contrato", "contratos", "bico", "bicos",
  "especial", "especiais", "dungeon", "dungeons", "resgate", "resgatar", "chefe", "chefes", "boss", "coop", "co-op", "grupo", "chamado", "group", "historia", "história", "story"];

export async function cmdAventura(message, args, ctx, { sendEmbed, en }) {
  const { COR, PREFIXO: P } = ctx;
  const sub = String(args[0] ?? "").toLowerCase(), eu = message.authorId;
  const p = db.getPersonagem(MUNDO, eu);
  const semPersonagem = () => sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem", colour: COR.aviso,
    description: en ? `Create one with \`${P}game criar\`.` : `Crie com \`${P}game criar\`.` });
  const resto = args.slice(1).join(" ").trim();
  const partir = async (missao) => {
    const spec = montarAlvo(missao, p.nivel);
    const imp = impedimento(eu, spec, en);
    if (imp) return sendEmbed(message.channel, { title: en ? "⏳ Not now" : "⏳ Agora não", colour: COR.aviso, description: `<@${eu}> ${imp}.` });
    const res = lutar([eu], missao, { lingua: en ? "en" : "pt" });
    return sendEmbed(message.channel, embedResultado(res, { en, COR, P }));
  };

  // ── &game historia — reexibe a última ──
  if (["historia", "história", "story"].includes(sub)) {
    if (!p) return semPersonagem();
    let h = null; try { h = JSON.parse(p.historia ?? "null"); } catch {}
    return sendEmbed(message.channel, { title: en ? "📖 Your last story" : "📖 Sua última história", colour: COR.info,
      description: h?.texto ? `**${h.missao}**\n\n${h.texto}` : (en ? "_No story yet — go on a mission._" : "_Nenhuma história ainda — vá a uma missão._") });
  }

  // ── contratos (o quadro da guilda) e bicos ──
  if (["missao", "missão", "missoes", "missões", "quest", "contrato", "contratos", "bico", "bicos"].includes(sub)) {
    if (!p) return semPersonagem();
    const difPedida = /^\d+$/.test(resto) ? Math.max(1, Math.min(10, parseInt(resto, 10))) : null;
    if (resto && !difPedida) {
      const m = MISS.acharContrato(resto);
      if (!m) return sendEmbed(message.channel, { title: en ? "❌ Unknown contract" : "❌ Contrato desconhecido", colour: COR.erro,
        description: en ? `I couldn't find **${resto}**. See the board with \`${P}game contratos\`.` : `Não achei **${resto}**. Veja o quadro com \`${P}game contratos\`.` });
      return partir(m);
    }
    const dif = difPedida ?? R.faixaDoNivel(p.nivel).n;
    const difs = difPedida ? [dif] : [dif - 1, dif, dif + 1].filter((d) => d >= 1 && d <= 10);
    const L = [];
    if ((p.recuperandoAte ?? 0) > Date.now()) L.push(en ? `🩹 **You're recovering** (~${Math.ceil((p.recuperandoAte - Date.now()) / MIN)} min).` : `🩹 **Você está se recuperando** (~${Math.ceil((p.recuperandoAte - Date.now()) / MIN)} min).`, "");
    L.push(en ? "🧺 **Jobs** — no risk, small pay" : "🧺 **Bicos** — sem risco, pagam pouco");
    for (const m of MISS.BICOS) L.push(`   • **${m.nome}**`);
    for (const d of difs) {
      const f = R.faixaDaDif(d);
      L.push("", `${RARIDADE_INFO[f.raridade].emoji} **${en ? "Difficulty" : "Dificuldade"} ${d} — ${en ? f.nomeEN : f.nome}** _(${en ? "levels" : "níveis"} ${f.niveis[0]}–${f.niveis[1]})_`);
      for (const m of MISS.CONTRATOS.filter((x) => R.faixaDoNivel(x.nivel).n === d)) {
        const c = chanceDe(eu, m), com = c.exito * c.sobrevivencia;
        const perigo = m.perigo === "baixo" ? (en ? " · 🌿 low danger" : " · 🌿 perigo baixo") : "";
        L.push(com >= 0.9995 ? `   • **${m.nome}** _(${en ? "lv" : "nv"} ${m.nivel})_ — ✅ ${en ? "guaranteed" : "garantida"} · ${valeTxt(MISS.xpDa(m, c.spec.alvo, p.nivel), p, en)}${perigo}`
          : `   • **${m.nome}** _(${en ? "lv" : "nv"} ${m.nivel})_ — 🏆 **${pct(com)}** _(${pct(c.exito)} × ${pct(c.sobrevivencia)})_ · ${valeTxt(MISS.xpDa(m, c.spec.alvo, p.nivel), p, en)}${perigo}`);
      }
    }
    L.push("", en ? `_🏆 = win AND come back alive. "+% lv" = what one win is worth to you. The guild (the bank) pays. With 3× the strength a contract was made for, it's guaranteed — never by level._`
      : `_🏆 = vencer E voltar vivo. "+% nv" = quanto um êxito vale para você. Quem paga é a guilda (o banco). Com 3× a força para a qual o contrato foi feito, é garantido — nunca pelo nível._`,
      en ? `\`${P}game contrato <name>\` · \`${P}game contratos <1-10>\` — another difficulty · \`${P}game dungeons\` · \`${P}game especiais\``
        : `\`${P}game contrato <nome>\` · \`${P}game contratos <1-10>\` — outra dificuldade · \`${P}game dungeons\` · \`${P}game especiais\``);
    return enviarLista(sendEmbed, message.channel, { titulo: en ? "📜 Guild board — contracts" : "📜 Quadro da guilda — contratos", linhas: L, colour: COR.info });
  }

  // ── missões especiais ──
  if (["especial", "especiais"].includes(sub)) {
    if (!p) return semPersonagem();
    if (resto) {
      const m = MISS.acharEspecial(resto);
      if (!m) return sendEmbed(message.channel, { title: en ? "❌ Unknown special mission" : "❌ Especial desconhecida", colour: COR.erro, description: `\`${P}game especiais\`` });
      return partir(m);
    }
    const L = [en ? "One-of-a-kind reward — **once per person** (the first win). After that, it still pays like any contract." : "Recompensa que não existe em outro lugar — **uma vez por pessoa** (o primeiro êxito). Depois, paga como qualquer contrato.", ""];
    for (const m of [...MISS.ESPECIAIS].sort((a, b) => a.nivel - b.nivel)) {
      const feita = db.temUnico(eu, `especial:${m.id}`), c = chanceDe(eu, m);
      const rec = m.recompensa?.tipo === "companheiro" ? (en ? "companion" : "companheiro") : m.recompensa?.tipo === "magia" ? (en ? "spell" : "magia") : "item";
      L.push(`${feita ? "✅" : "✦"} **${m.nome}** _(${en ? "lv" : "nv"} ${m.nivel})_ — ${rec}${feita ? (en ? " · already yours" : " · já é sua") : ""} · 🏆 ${pct(c.exito * c.sobrevivencia)}`);
      L.push(`   _${en ? m.descricao.en : m.descricao.pt}_`);
    }
    L.push("", en ? `_30% / 60% at their own level; 2 h between attempts until the first win. \`${P}game especial <name>\`_` : `_30% / 60% no próprio nível; 2 h entre tentativas até o primeiro êxito. \`${P}game especial <nome>\`_`);
    return enviarLista(sendEmbed, message.channel, { titulo: en ? "✦ Special missions" : "✦ Missões especiais", linhas: L, colour: COR.info });
  }

  // ── chefes ──
  if (["chefe", "chefes", "boss"].includes(sub)) {
    if (!p) return semPersonagem();
    if (resto) {
      const c = MISS.acharChefe(resto);
      if (!c) return sendEmbed(message.channel, { title: en ? "❌ Unknown boss" : "❌ Chefe desconhecido", colour: COR.erro, description: `\`${P}game chefes\`` });
      return partir(c);
    }
    const L = [en ? "A boss fights like a mission: 35% win / 60% survival for 4 players of its level (~8% alone). Wait: 24 h per person, per boss." : "Chefe luta como missão: 35% de vitória / 60% de sobrevivência com 4 jogadores do nível dele (~8% sozinho). Espera: 24 h por pessoa, por chefe.", ""];
    for (const c of [...MISS.CHEFES.values()].sort((a, b) => a.nivel - b.nivel)) {
      const ch = chanceDe(eu, c), venceu = db.temUnico(eu, `chefe:${c.id}`), espera = db.esperaAte(eu, `chefe:${c.id}`) > Date.now();
      const onde = c.dungeon ? `🕳️ ${MISS.DUNGEONS.get(c.dungeon)?.nome ?? c.dungeon}` : (en ? "standalone" : "avulso");
      const rec = c.recompensa ? (venceu ? (en ? " · ✦ already received" : " · ✦ já recebido") : (en ? " · ✦ unique reward" : " · ✦ recompensa única")) : "";
      L.push(`${venceu ? "🏅" : "💀"} **${c.nome}** _(${en ? "lv" : "nv"} ${c.nivel})_ — ${onde} · 🏆 ${pct(ch.exito * ch.sobrevivencia)}${rec}${espera ? " · ⏳" : ""}${c.requer && !db.temUnico(eu, `chefe:${c.requer}`) ? " · 🔒" : ""}`);
    }
    L.push("", en ? `_\`${P}game chefe <name>\` alone · \`${P}game coop abrir chefe <name>\` in a group (up to ${COOP_MAX}) · 🔒 = beat the previous act first_` : `_\`${P}game chefe <nome>\` sozinho · \`${P}game coop abrir chefe <nome>\` em grupo (até ${COOP_MAX}) · 🔒 = vença o ato anterior antes_`);
    return enviarLista(sendEmbed, message.channel, { titulo: en ? "💀 Bosses" : "💀 Chefes", linhas: L, colour: COR.info });
  }

  // ── dungeons ──
  if (["dungeon", "dungeons", "resgate", "resgatar"].includes(sub)) {
    if (!p) return semPersonagem();
    const chefe = /\s(chefe|boss)$/i.test(resto);
    const nomeD = resto.replace(/\s(chefe|boss)$/i, "").trim();
    if (nomeD && sub !== "dungeons") {
      const d = MISS.acharDungeon(nomeD);
      if (!d) return sendEmbed(message.channel, { title: en ? "❌ Unknown dungeon" : "❌ Dungeon desconhecida", colour: COR.erro, description: `\`${P}game dungeons\`` });
      if (chefe) { const c = MISS.CHEFES.get(d.chefe); if (c) return partir(c); }
      return partir({ id: d.id, tipo: "dungeon-encontro", dungeon: d.id, nome: d.nome });
    }
    const L = [en ? "Open world: each one pays from **its own treasury**, which refills with the players who play there (the only new money in the game). 70% of the loot is themed; companions can be **captured** here (20% each if you fall)." : "Mundo aberto: cada uma paga do **tesouro dela**, que se renova com quem joga lá (a única moeda nova do jogo). 70% do loot é do tema; aqui os companheiros podem ser **capturados** (20% cada, se você cair).", ""];
    for (const d of [...MISS.DUNGEONS.values()].sort((a, b) => a.niveis[0] - b.niveis[0] || a.niveis[1] - b.niveis[1])) {
      const t = TS.estadoDoTesouro(d.id, MISS.nivelDoEncontro(d, p.nivel));
      const dentro = p.nivel >= d.niveis[0] && p.nivel <= d.niveis[1];
      L.push(`${dentro ? "➡️" : "•"} **${d.nome}** _(${en ? "levels" : "níveis"} ${d.niveis[0]}–${d.niveis[1]})_ — 💰 ${en ? t.rotuloEN : t.rotulo}${d.obra ? ` · _${d.obra}_` : ""}`);
    }
    const presos = db.listarCapturados(MUNDO);
    if (presos.length) {
      L.push("", en ? `⛓️ **Captured (${presos.length})**` : `⛓️ **Capturados (${presos.length})**`);
      for (const f of presos.slice(0, 15)) {
        const cat = db.getFollowerCatalogo(f.catalogoId), meu = f.donoOriginal === eu, h = (Date.now() - (f.capturadoEm ?? 0)) / HORA;
        const onde = MISS.DUNGEONS.get(f.dungeonId)?.nome ?? (en ? "a dungeon" : "uma dungeon");
        L.push(`   ${RARIDADE_INFO[cat?.raridade]?.emoji ?? ""} **${cat?.nome ?? "?"}** — ${onde}${meu ? (en ? " · 👤 yours" : " · 👤 seu") : h < JANELA_DONO_H ? (en ? ` · ⏳ owner's window (~${Math.ceil(JANELA_DONO_H - h)}h)` : ` · ⏳ janela do dono (~${Math.ceil(JANELA_DONO_H - h)}h)`) : (en ? " · 🔓 anyone can bring them back" : " · 🔓 qualquer um pode trazer")}`);
      }
      L.push(en ? "_The rescue is automatic: every return from that dungeon is one attempt (a win doubles it)._" : "_O resgate é automático: toda volta daquela dungeon é uma tentativa (vencer dobra a chance)._");
    }
    L.push("", en ? `\`${P}game dungeon <name>\` — one encounter at your level · \`${P}game dungeon <name> chefe\` — its boss` : `\`${P}game dungeon <nome>\` — um encontro no seu nível · \`${P}game dungeon <nome> chefe\` — o chefe dela`);
    return enviarLista(sendEmbed, message.channel, { titulo: en ? "🕳️ Dungeons" : "🕳️ Dungeons", linhas: L, colour: COR.info });
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
    return { title: titulo ?? (en ? `⚔️ Group for ${nomeDe(g.missao)}` : `⚔️ Grupo para ${nomeDe(g.missao)}`), colour: COR.info, description: [
      `${en ? "**Members**" : "**Membros**"} (${g.membros.length}/${COOP_MAX}): ${g.membros.map((u) => `<@${u}>`).join(" · ")}`,
      en ? `**Together:** ${pct(pv.exito)} to win · ${pct(pv.sobrevivencia)} to survive${pv.sinergia?.bonus > 0.005 ? ` · synergy +${pct(pv.sinergia.bonus)}` : ""}`
        : `**Juntos:** ${pct(pv.exito)} de vencer · ${pct(pv.sobrevivencia)} de sobreviver${pv.sinergia?.bonus > 0.005 ? ` · sinergia +${pct(pv.sinergia.bonus)}` : ""}`,
      "",
      en ? `\`${P}game coop entrar\` — join · \`${P}game coop sair\` — leave` : `\`${P}game coop entrar\` — entra · \`${P}game coop sair\` — sai`,
      en ? `_<@${g.lider}>: \`${P}game coop partir\` leaves now · \`${P}game coop cancelar\`. It leaves by itself at ${COOP_MAX}, and expires in 10 min._`
        : `_<@${g.lider}>: \`${P}game coop partir\` parte agora · \`${P}game coop cancelar\`. Parte sozinho com ${COOP_MAX}, e expira em 10 min._`,
    ].join("\n") };
  };
  const specDe = (missao) => montarAlvo(missao, db.getPersonagem(MUNDO, eu)?.nivel ?? 1);

  if (!acao) {
    return sendEmbed(message.channel, grupo ? painel(grupo) : { title: en ? "⚔️ Co-op" : "⚔️ Co-op", colour: COR.info, description: [
      en ? "Up to 4 people (each with their companions) take on a contract, a special mission, a dungeon or a boss together." : "Até 4 pessoas (cada uma com seus companheiros) encaram juntas um contrato, uma missão especial, uma dungeon ou um chefe.",
      en ? "One outcome for the group — everyone's attack and defense add up; the mission pays its strength to **each one** (XP, coins and loot of their own)."
        : "Um desfecho para o grupo — o ataque e a defesa de todos somam; a missão paga a força dela a **cada um** (XP, moedas e loot de cada um).",
      "",
      `\`${P}game coop abrir <${en ? "contract" : "contrato"}>\` · \`${P}game coop abrir dungeon <${en ? "name" : "nome"}>\` · \`${P}game coop abrir chefe <${en ? "name" : "nome"}>\``,
      `\`${P}game coop entrar\` · \`${P}game coop partir\``,
    ].join("\n") });
  }
  if (["abrir", "open", "criar"].includes(acao)) {
    if (grupo) return sendEmbed(message.channel, painel(grupo, en ? "⚔️ There's already an open group here" : "⚔️ Já tem um grupo aberto aqui"));
    const missao = acharAlvoCoop(args.slice(2).join(" "));
    if (!missao) return sendEmbed(message.channel, { title: en ? "❓ Which one?" : "❓ Qual?", colour: COR.aviso, description: `\`${P}game contratos\` · \`${P}game dungeons\` · \`${P}game chefes\`` });
    if (missao.tipo === "bico") return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: en ? "Jobs are solo — co-op is for fights." : "Bico é solo — o co-op é para as lutas." });
    const imp = impedimento(eu, specDe(missao), en);
    if (imp) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: `<@${eu}> ${imp}.` });
    const novo = { lider: eu, missao, membros: [eu], criadoEm: agora, canalId };
    GRUPOS_COOP.set(canalId, novo);
    setTimeout(() => { if (GRUPOS_COOP.get(canalId) === novo) GRUPOS_COOP.delete(canalId); }, COOP_VALIDADE_MS).unref?.();
    return sendEmbed(message.channel, painel(novo));
  }
  if (!grupo) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: en ? `No open group in this channel. \`${P}game coop abrir <mission>\`` : `Nenhum grupo aberto neste canal. \`${P}game coop abrir <missão>\`` });
  if (["entrar", "join"].includes(acao)) {
    if (grupo.membros.includes(eu)) return sendEmbed(message.channel, painel(grupo));
    if (grupo.membros.length >= COOP_MAX) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: en ? "The group is full." : "O grupo está cheio." });
    const imp = impedimento(eu, specDe(grupo.missao), en);
    if (imp) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: `<@${eu}> ${imp}.` });
    grupo.membros.push(eu);
    if (grupo.membros.length < COOP_MAX) return sendEmbed(message.channel, painel(grupo));
  } else if (["sair", "leave"].includes(acao)) {
    if (eu === grupo.lider) { GRUPOS_COOP.delete(canalId); return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: en ? "The leader left — the group was disbanded." : "Quem abriu saiu — o grupo foi desfeito." }); }
    grupo.membros = grupo.membros.filter((u) => u !== eu);
    return sendEmbed(message.channel, painel(grupo));
  } else if (["cancelar", "cancel", "fechar"].includes(acao)) {
    if (eu !== grupo.lider) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: en ? "Only whoever opened it can cancel." : "Só quem abriu pode cancelar." });
    GRUPOS_COOP.delete(canalId);
    return sendEmbed(message.channel, { title: "⚔️", colour: COR.info, description: en ? "Group cancelled." : "Grupo cancelado." });
  } else if (["partir", "ir", "go", "start"].includes(acao)) {
    if (eu !== grupo.lider) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: en ? "Only whoever opened it decides when to leave." : "Só quem abriu decide a hora de partir." });
  } else return sendEmbed(message.channel, painel(grupo));

  GRUPOS_COOP.delete(canalId);
  const vao = [], ficaram = [];
  for (const uid of grupo.membros) {
    const imp = impedimento(uid, montarAlvo(grupo.missao, db.getPersonagem(MUNDO, uid)?.nivel ?? 1), en);
    if (imp) ficaram.push(`<@${uid}> ${imp}`); else vao.push(uid);
  }
  if (!vao.length) return sendEmbed(message.channel, { title: "⚔️", colour: COR.aviso, description: ficaram.join("\n") });
  const res = lutar(vao, grupo.missao, { lingua: en ? "en" : "pt" });
  const e = embedResultado(res, { en, COR, P });
  if (ficaram.length) e.description += `\n\n${en ? "**Stayed behind:** " : "**Ficaram para trás:** "}${ficaram.join(" · ")}`;
  e.title = `${e.title} — ${vao.length} ${en ? "adventurer(s)" : "aventureiro(s)"}`;
  return sendEmbed(message.channel, e);
}
