
import * as db from "../core/db.js";
import { resolverUsuario, idEscrito } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";
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
import { migrarParaV4 } from "./migracao.js";
import * as IMG from "./imagens.js";
import { validarUrlImagem } from "../core/midia.js";
import { rodarTesteGeral } from "./teste-geral.js";
import { traduzirEmbed, argsParaPortugues } from "./traducao.js";
import { MUNDO, prepararMundo, garantirMoedasDoMundo, MOEDAS_DO_MUNDO } from "./mundo.js";
import { ATRIB, acharAtributo, RARIDADE_INFO, SLOT_INFO, rotuloSlot, rotuloRaridade, acharRaridade, fmt, pct, semAcento,
  numeroDigitado, barraProgresso, enviarLista, descreverItem } from "./ui.js";

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
let semeado = false;
let RPG_FECHADO = null;   // o erro da migração v4, se ela falhou
export function iniciarCatalogo() {
  if (semeado) return;
  try {
    const n = semearConteudo(db);
    semeado = true;
    console.log(`[RPG] catálogo pronto (${n.itens} item(ns), ${n.companheiros} companheiro(s))`);
  } catch (e) { console.error("[RPG] falha ao semear o catálogo:", e?.message ?? e); }
  // o mundo global: zera o jogo dos servidores uma única vez e garante as duas moedas
  try { prepararMundo(); } catch (e) { console.error("[RPG] falha ao preparar o mundo:", e?.message ?? e); }
  // se a migração falhar, o jogo fica fechado: jogar o v4 em cima dos dados da v3
  // (e migrar depois por cima do que se jogou) estragaria os personagens
  try { migrarParaV4(); RPG_FECHADO = null; } catch (e) { RPG_FECHADO = e?.message ?? String(e); console.error("[RPG] falha na migração v4 — o jogo fica fechado:", RPG_FECHADO); }
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

function descreverFollower(f, en, nivelDono = null, comEnergia = true) {
  const cat = db.getFollowerCatalogo(f.catalogoId);
  if (!cat) return `_(${en ? "unknown companion" : "companheiro desconhecido"})_`;
  const cls = FOL.CLASSES[cat.classe] ?? {};
  const rar = RARIDADE_INFO[cat.raridade] ?? {};
  const e = comEnergia ? ` · ⚡${energiaAtual(f)}/${ENERGIA_MAX}` : "";
  const naParty = f.naParty ? " 🎒" : "";
  const unico = cat.dados?.unico ? " ✦" : "";
  return `${rar.emoji ?? ""}${cls.emoji ?? ""} **${cat.nome}**${unico} _(${en ? cls.rotuloEN : cls.rotulo}, ${en ? "lv" : "nv"} ${nivelDono ?? f.nivel})_${e}${naParty}`;
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

function montarFicha(p, P, serverId, userId, lang = "pt") {
  const en = lang === "en";
  const party = CB.partyDe(serverId, userId, p);
  const f = R.faixaDoNivel(p.nivel ?? 1);
  const cls = p.classe ? EV.CLASSES_JOGADOR[p.classe] : null;
  const linhas = [
    en ? `**Level ${p.nivel}** · difficulty ${f.n} (${f.nomeEN}) · ${Math.round(progressoDoNivel(p) * 100)}% to the next`
      : `**Nível ${p.nivel}** · dificuldade ${f.n} (${f.nome}) · ${Math.round(progressoDoNivel(p) * 100)}% para o próximo`,
    `${barraProgresso(progressoDoNivel(p))}`,
    cls ? `${cls.emoji} ${en ? "Class" : "Classe"}: **${en ? cls.rotuloEN : cls.rotulo}**${p.evoluirAuto ? (en ? " · auto-evolve on" : " · evoluir automático ligado") : ""}` : null,
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
    ? (en ? `🔹 **${pontos} point(s) to spend** — \`${P}game pontos <attribute> <how many>\` or \`${P}game evoluir\``
      : `🔹 **${pontos} ponto(s) para distribuir** — \`${P}game pontos <atributo> <quantos>\` ou \`${P}game evoluir\``)
    : (en ? `_No free points. Gain per level: **${R.pontosPorNivel(p.inteligencia, p.sorte).toFixed(2)}**._`
      : `_Sem pontos livres. Ganho por nível: **${R.pontosPorNivel(p.inteligencia, p.sorte).toFixed(2).replace(".", ",")}**._`));

  // força: o que a party põe contra uma missão do seu nível
  const pv = CB.prever([party], { ...R.missao(p.nivel), base: R.BASE.normal });
  linhas.push("", en ? `**Strength** — attack ${fmt(pv.poder)} · defense ${fmt(pv.resil)}` : `**Força** — ataque ${fmt(pv.poder)} · defesa ${fmt(pv.resil)}`,
    en ? `_A contract of your level: ${pct(pv.exito)} to win · ${pct(pv.sobrevivencia)} to survive${pv.sinergia.bonus > 0.005 ? ` · synergy +${pct(pv.sinergia.bonus)}` : ""}_`
      : `_Um contrato do seu nível: ${pct(pv.exito)} de vencer · ${pct(pv.sobrevivencia)} de sobreviver${pv.sinergia.bonus > 0.005 ? ` · sinergia +${pct(pv.sinergia.bonus)}` : ""}_`);

  const eq = db.getEquipado(serverId, userId);
  const ocupados = db.SLOTS.filter((s) => eq[s]).length;
  linhas.push("", en ? `**Gear — ${ocupados}/${db.SLOTS.length} slots**` : `**Equipamento — ${ocupados}/${db.SLOTS.length} vagas**`);
  const { maos, escudo } = CB.maosDe(eq);
  const linhaSlot = (s, extraTxt = "") => {
    const it = eq[s], info = SLOT_INFO[s] ?? {};
    return it ? `${info.emoji} **${rotuloSlot(s, en)}:** ${RARIDADE_INFO[it.raridade]?.emoji ?? ""} ${it.nome}${extraTxt}` : `${info.emoji} **${rotuloSlot(s, en)}:** ${en ? "_empty_" : "_vazio_"}`;
  };
  const modo = maos.length === 1 && maos[0].modo === "2m" ? (en ? " _(both hands)_" : " _(nas duas mãos)_") : "";
  const unica = maos.length === 1 ? (en ? " · single weapon +80%" : " · arma única +80%") : "";
  linhas.push(linhaSlot("mao1", eq.mao1 && CB.ehArma(eq.mao1) ? modo + unica : ""), linhaSlot("mao2", escudo && eq.mao2 === escudo ? (en ? " · +10% defense" : " · +10% de defesa") : ""));
  for (const s of ["capacete", "armadura", "acessorio1", "acessorio2", "acessorio3"]) linhas.push(linhaSlot(s));
  const implantes = ["bio1", "bio2", "bio3", "ciber1", "ciber2", "ciber3"].filter((s) => eq[s]);
  linhas.push(implantes.length ? `🧬🦾 ${implantes.map((s) => eq[s].nome).join(" · ")}` : (en ? "🧬🦾 _no implants — 3 bioware and 3 cyberware slots_" : "🧬🦾 _nenhum implante — 3 vagas de bioware e 3 de cyberware_"));
  if (ocupados < db.SLOTS.length) linhas.push(en ? `_\`${P}game itens\` shows what you can equip._` : `_\`${P}game itens\` mostra o que dá para equipar._`);

  const j = CB.juntar([party]);
  linhas.push("", en ? `**Magic — ${j.manaGasta}/${j.mana} mana in use**` : `**Magia — ${j.manaGasta}/${j.mana} de mana em uso**`);
  if (j.magias.length) for (const m of j.magias) {
    const esc = MAG.ESCOLAS[m.tipo] ?? {};
    linhas.push(`${esc.emoji ?? "✦"} **${en ? (m.nomeEN ?? m.nome) : m.nome}** — ${en ? esc.rotuloEN : esc.rotulo} · ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}%`);
  } else linhas.push(en ? `_No active spell._ Learn one with \`${P}game magias\`.` : `_Nenhuma magia ativa._ Aprenda uma com \`${P}game magias\`.`);
  const dormentes = j.todas.length - j.magias.length;
  if (dormentes > 0) linhas.push(en ? `_${dormentes} spell(s) don't fit in the mana — raise Mana to use them._` : `_${dormentes} magia(s) não cabem na mana — suba Mana para usá-las._`);
  if (party.semAtributo.length) linhas.push(en ? `_${party.semAtributo.length} spell(s) wait for more Intelligence._` : `_${party.semAtributo.length} magia(s) esperam mais Inteligência._`);
  return linhas.join("\n");
}

export async function cmdGame(message, args, ctx) {
  const { COR, PREFIXO: P, getServer } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  // Num servidor em inglês, o catálogo (missões, itens, magias, companheiros)
  // sai traduzido — todas as mensagens do jogo passam por este sendEmbed.
  const sendEmbed = en ? (canal, e) => ctx.sendEmbed(canal, traduzirEmbed(e)) : ctx.sendEmbed;
  if (en) args = argsParaPortugues(args);   // "buy Iron Sword" acha a "Espada de Ferro"
  // O jogo é um mundo só: o mesmo personagem, mercado e moedas em todo
  // servidor (ver mundo.js). O servidor da mensagem só decide se o comando vale.
  const serverId = MUNDO;
  if (RPG_FECHADO) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛠️ RPG em manutenção", description: "A atualização do jogo não terminou — nada foi perdido. O dono do bot já foi avisado no log.", colour: COR.aviso },
      { title: "🛠️ RPG under maintenance", description: "The game update didn't finish — nothing was lost. The bot owner has been notified in the log.", colour: COR.aviso }));
  }

  if (!ctx.serverId) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Fora de um servidor",
        description: "O RPG funciona dentro de um servidor — e o seu personagem é o mesmo em todos.", colour: COR.erro },
      { title: "❌ Outside a server",
        description: "The RPG works inside a server — and your character is the same in all of them.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();
  const eu = message.authorId;

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
          description: `Veja com \`${P}game\`. Para recomeçar do zero: \`${P}game apagar\`.`, colour: COR.aviso },
        { title: "🎭 You already have a character",
          description: `See it with \`${P}game\`. To start over: \`${P}game apagar\`.`, colour: COR.aviso }));
    }
    const nome = args.slice(1).join(" ").trim().slice(0, 40)
      || message.author?.username || "Aventureiro";
    let p = db.criarPersonagem(serverId, eu, nome);
    darKitInicial(serverId, eu);
    p = db.getPersonagem(serverId, eu);
    return sendEmbed(message.channel, en ? {
      title: "🎉 Character created",
      description: [
        `**${nome}** entered the world.`,
        "",
        montarFicha(p, P, serverId, eu, lang),
        "",
        `Start by picking a class: \`${P}game classe\` — or spend points by hand: \`${P}game pontos forca 1\``,
      ].join("\n"), colour: COR.sucesso,
    } : {
      title: "🎉 Personagem criado",
      description: [
        `**${nome}** entrou no mundo.`,
        "",
        montarFicha(p, P, serverId, eu, lang),
        "",
        `Comece escolhendo uma classe: \`${P}game classe\` — ou distribua à mão: \`${P}game pontos forca 1\``,
      ].join("\n"), colour: COR.sucesso });
  }

  // ── apagar ──
  // ("resetar pontos" é o respec, mais abaixo — não apaga o personagem)
  if (["apagar", "deletar", "resetar"].includes(sub) && !["pontos", "points", "atributos"].includes(String(args[1] ?? "").toLowerCase())) {
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
          `**${p.nome}** — nível ${p.nivel} — será perdido para sempre.`,
          "",
          `Se tem certeza: \`${P}game apagar confirmar\``,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "⚠️ This erases everything",
        description: [
          `**${p.nome}** — level ${p.nivel} — will be lost forever.`,
          "",
          `If you're sure: \`${P}game apagar confirmar\``,
        ].join("\n"), colour: COR.aviso,
      }));
    }
    db.apagarPersonagem(serverId, eu);
    db.limparMagias(serverId, eu);   // o grimório vai junto: recomeçar é recomeçar
    // as esperas (chefe 24 h, especial) e as recompensas únicas ficam: são por PESSOA,
    // não por personagem — apagar e criar não pode pular a espera do chefe
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
      linhas.push(`${info.emoji} **${rotuloRaridade(r, en)}**`);
      const eq = db.getEquipado(serverId, eu);
      for (const i of lista) {
        const marca = db.SLOTS.some((s) => eq[s]?.id === i.id) ? " ✅" : "";
        const qtd = i.quantidade > 1 ? ` ×${i.quantidade}` : "";
        linhas.push(`   ${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}**${qtd}${marca} — ${descreverItem(i, en)}`);
      }
    }
    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "🎒 Your bag" : "🎒 Sua mochila",
      linhas,
      rodape: en
        ? `_✅ = equipped · \`${P}game equipar <item>\` · contracts and scrolls: \`${P}game usar <item>\` · or let \`${P}game evoluir\` pick._`
        : `_✅ = equipado · \`${P}game equipar <item>\` · contratos e pergaminhos: \`${P}game usar <item>\` · ou deixe o \`${P}game evoluir\` escolher._`,
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
          description: `Crie com \`${P}game criar\`.`, colour: COR.aviso },
        { title: "🎭 You don't have a character",
          description: `Create one with \`${P}game criar\`.`, colour: COR.aviso }));
    }
    const VAGAS = { mao1: "mao1", principal: "mao1", main: "mao1", mao2: "mao2", "mão2": "mao2", secundaria: "mao2", "secundária": "mao2", off: "mao2" };
    const pedidoTxt = args.slice(1).map((a) => a.toLowerCase()).find((a) => VAGAS[a] || /^(acessorio|bio|ciber)[123]$/.test(a));
    const slotPedido = pedidoTxt ? (VAGAS[pedidoTxt] ?? pedidoTxt) : null;
    const busca = args.slice(1).filter((a) => a.toLowerCase() !== pedidoTxt).join(" ").trim();
    if (!busca) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Equipar o quê?",
        description: `\`${P}game equipar <nome do item> [mao1|mao2]\`\n\nVeja o que você tem com \`${P}game itens\`.`,
        colour: COR.erro,
      }, {
        title: "❌ Equip what?",
        description: `\`${P}game equipar <item name> [mao1|mao2]\`\n\nSee what you have with \`${P}game itens\`.`,
        colour: COR.erro,
      }));
    }
    const item = db.acharItemPorNome(busca);
    if (!item) {
      return sendEmbed(message.channel, { title: en ? "❌ Unknown item" : "❌ Item desconhecido",
        description: en ? `I couldn't find any item called **${busca}**.` : `Não achei nenhum item chamado **${busca}**.`, colour: COR.erro });
    }
    if (!db.temItem(serverId, eu, item.id)) {
      return sendEmbed(message.channel, { title: en ? "❌ You don't have that item" : "❌ Você não tem esse item",
        description: en ? `**${item.nome}** isn't in your bag.` : `**${item.nome}** não está na sua mochila.`, colour: COR.erro });
    }
    // contrato → companheiro (no nível do dono; um de cada único — D17)
    if (item.dados?.tipo === "contrato") {
      const cat = db.getFollowerCatalogo(item.dados.companheiro);
      if (!cat) return sendEmbed(message.channel, { title: "❌", description: en ? "This contract points to nobody." : "Esse contrato não aponta para ninguém.", colour: COR.erro });
      if (db.listarFollowersDe(serverId, eu).some((f) => f.catalogoId === cat.id) || db.listarCapturados(serverId).some((f) => f.catalogoId === cat.id && f.donoOriginal === eu)) {
        return sendEmbed(message.channel, { title: en ? "✦ You already have them" : "✦ Você já tem", colour: COR.aviso,
          description: en ? `**${cat.nome}** is unique — one per player. The contract can still go to the market: \`${P}game mercado vender ${item.nome} <price>\`.`
            : `**${cat.nome}** é único — um por jogador. O contrato ainda vale no mercado: \`${P}game mercado vender ${item.nome} <preço>\`.` });
      }
      db.tirarItem(serverId, eu, item.id, 1);
      db.recrutarFollower(serverId, eu, cat.id, p.nivel);
      return sendEmbed(message.channel, { title: en ? "📜 Contract signed" : "📜 Contrato assinado", colour: COR.sucesso,
        description: en ? `**${cat.nome}** is with you now, at your level (${p.nivel}). Take them along: \`${P}game follower levar ${cat.nome}\`.`
          : `**${cat.nome}** agora está com você, no seu nível (${p.nivel}). Leve na party: \`${P}game follower levar ${cat.nome}\`.` });
    }
    // pergaminho → magia no grimório
    if (item.dados?.tipo === "pergaminho") {
      const m = MAG.getMagia(item.dados.magia);
      if (!m) return sendEmbed(message.channel, { title: "❌", description: en ? "This scroll is blank." : "Esse pergaminho está em branco.", colour: COR.erro });
      if (db.listarMagias(serverId, eu).some((x) => x.magiaId === m.id)) return sendEmbed(message.channel, { title: en ? "📖 Already known" : "📖 Você já conhece", colour: COR.aviso,
        description: en ? `**${m.nomeEN ?? m.nome}** is already in your grimoire — the scroll can still be sold to another player.` : `**${m.nome}** já está no seu grimório — o pergaminho ainda vale para outro jogador.` });
      db.tirarItem(serverId, eu, item.id, 1);
      db.aprenderMagia(serverId, eu, m.id);
      return sendEmbed(message.channel, { title: en ? "📖 Spell learned" : "📖 Magia aprendida", colour: COR.sucesso,
        description: en ? `**${m.nomeEN ?? m.nome}** — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}% · needs Intelligence ${m.req}.` : `**${m.nome}** — ${m.custo} 🔷 · +${(m.poder * 100).toFixed(0)}% · pede Inteligência ${m.req}.` });
    }
    if (!["mao", "capacete", "armadura", "acessorio", "implante"].includes(item.slot)) {
      return sendEmbed(message.channel, { title: en ? "❌ Can't equip that" : "❌ Isso não se equipa", colour: COR.erro, description: descreverItem(item, en) });
    }
    const eq = db.getEquipado(serverId, eu);
    const slot = slotParaEquipar(eq, item, slotPedido);
    if (item.slot === "mao" && !["mao1", "mao2"].includes(slot)) return sendEmbed(message.channel, { title: "❌", colour: COR.erro, description: "`mao1` · `mao2`" });
    // o mesmo item em duas vagas pede duas unidades
    const usados = db.SLOTS.filter((s) => s !== slot && eq[s]?.id === item.id).length;
    const tenho = db.getInventario(serverId, eu).find((x) => x.id === item.id)?.quantidade ?? 0;
    if (usados >= tenho) {
      const jaEm = db.SLOTS.find((s) => eq[s]?.id === item.id);
      return sendEmbed(message.channel, { title: en ? "✅ Already equipped" : "✅ Já está equipado",
        description: en ? `**${item.nome}** is already in ${rotuloSlot(jaEm, en)} (you have ${tenho}).` : `**${item.nome}** já está em ${rotuloSlot(jaEm, en)} (você tem ${tenho}).`, colour: COR.aviso });
    }
    const anterior = eq[slot] ?? null;
    db.equipar(serverId, eu, slot, item.id);
    const depois = db.getEquipado(serverId, eu);
    const { maos } = CB.maosDe(depois);
    const linhas = [`${SLOT_INFO[slot]?.emoji ?? "•"} **${rotuloSlot(slot, en)}**: ${item.nome}`, descreverItem(item, en)];
    if (item.slot === "mao" && CB.ehArma(item)) {
      const st = CB.statsItem(item), m = maos.find((x) => x.item.id === item.id);
      const req = m?.modo === "2m" ? st.reqFor2 : st.reqFor1, a = CB.atributosBase(p, depois);
      if (a.forca * (m?.modo === "2m" ? 1.5 : 1) < req || a.destreza < st.reqDes || a.inteligencia < st.reqInt)
        linhas.push(en ? "⚠️ _Below the requirements: the weapon deals 40% until you get there._" : "⚠️ _Abaixo dos requisitos: a arma rende 40% até você chegar lá._");
      linhas.push(maos.length === 1 ? (en ? `_A single weapon${m?.modo === "2m" ? ", in both hands" : ""}: +80% on its damage._` : `_Arma única${m?.modo === "2m" ? ", nas duas mãos" : ""}: +80% no dano dela._`)
        : (en ? "_Two weapons: no single-weapon bonus, but they can mix damage types (synergy)._" : "_Duas armas: sem o bônus de arma única, mas podem misturar tipos de dano (sinergia)._"));
    }
    if (item.slot === "implante") {
      const st = CB.statsItem(item), a = CB.atributosBase(p, depois);
      if ((a[st.reqAtr] ?? 0) < st.req) linhas.push(en ? `⚠️ _Below the requirement (${st.reqAtr === "vida" ? "Health" : "Resistance"} ${st.req}): it works at 40%._` : `⚠️ _Abaixo do requisito (${st.reqAtr === "vida" ? "Vida" : "Resistência"} ${st.req}): rende 40%._`);
    }
    if (anterior) linhas.push("", en ? `_${anterior.nome} went back to the bag._` : `_${anterior.nome} voltou para a mochila._`);
    return sendEmbed(message.channel, { title: en ? "⚔️ Equipped" : "⚔️ Equipado",
      description: linhas.join("\n"), colour: COR.sucesso });
  }

  // ── desequipar ──
  if (["desequipar", "tirar", "remover"].includes(sub)) {
    const alvo = (args[1] ?? "").toLowerCase();
    const ALIAS = { arma: "mao1", mao: "mao1", "mão": "mao1", principal: "mao1", secundaria: "mao2", "secundária": "mao2", escudo: "mao2", cabeca: "capacete", "cabeça": "capacete", elmo: "capacete", corpo: "armadura" };
    const eq = db.getEquipado(serverId, eu);
    let slot = db.SLOTS.includes(alvo) ? alvo : (args.length === 2 ? ALIAS[alvo] : null) ?? null;
    if (!slot && alvo) {
      const item = db.acharItemPorNome(args.slice(1).join(" "));
      if (item) slot = db.SLOTS.find((s) => eq[s]?.id === item.id) ?? null;
    }
    if (!slot) {
      return sendEmbed(message.channel, { title: en ? "❌ Unequip what?" : "❌ Tirar o quê?",
        description: (en ? [`\`${P}game desequipar <slot or item>\``, "", `**Slots:** ${db.SLOTS.join(", ")}`]
          : [`\`${P}game desequipar <vaga ou item>\``, "", `**Vagas:** ${db.SLOTS.join(", ")}`]).join("\n"), colour: COR.erro });
    }
    if (!eq[slot]) {
      return sendEmbed(message.channel, { title: en ? "🔸 Nothing in that slot" : "🔸 Nada nessa vaga",
        description: en ? `Nothing is equipped in **${rotuloSlot(slot, en)}**.` : `Não há nada equipado em **${rotuloSlot(slot, en)}**.`, colour: COR.aviso });
    }
    const nome = eq[slot].nome;
    db.desequipar(serverId, eu, slot);
    return sendEmbed(message.channel, { title: en ? "🎒 Unequipped" : "🎒 Desequipado",
      description: en ? `**${nome}** went back to the bag.` : `**${nome}** voltou para a mochila.`, colour: COR.mod });
  }

  if (["catalogo", "catálogo", "itens-jogo", "loja"].includes(sub)) {
    const filtro = semAcento(args.slice(1).join(" "));
    const raridade = acharRaridade(filtro);
    const SLOTS_F = { arma: "mao", armas: "mao", mao: "mao", "mão": "mao", weapon: "mao", capacete: "capacete", cabeca: "capacete", head: "capacete",
      armadura: "armadura", corpo: "armadura", body: "armadura", armor: "armadura", acessorio: "acessorio", acessorios: "acessorio", accessory: "acessorio",
      implante: "implante", implantes: "implante", implant: "implante", bioware: "implante", cyberware: "implante" };
    const slotFiltro = SLOTS_F[filtro] ?? null;
    const todos = db.listarItens().filter((i) => !["contrato", "pergaminho"].includes(i.slot));
    const obras = [...new Set(todos.map((i) => i.obra).filter(Boolean))];
    const obraFiltro = filtro && !raridade && !slotFiltro ? obras.find((o) => semAcento(o).includes(filtro)) : null;
    const lista = todos.filter((i) => (!raridade || i.raridade === raridade) && (!slotFiltro || i.slot === slotFiltro) && (!obraFiltro || i.obra === obraFiltro));
    const ajudaFiltros = en
      ? [`**Rarities:** ${R.ORDEM.map((r) => rotuloRaridade(r, true)).join(" · ")}`, "**Slots:** arma · capacete · armadura · acessorio · implante", obras.length ? `**Works:** ${obras.join(" · ")}` : ""]
      : [`**Raridades:** ${R.ORDEM.map((r) => rotuloRaridade(r, false)).join(" · ")}`, "**Vagas:** arma · capacete · armadura · acessorio · implante", obras.length ? `**Obras:** ${obras.join(" · ")}` : ""];
    if (filtro && !raridade && !slotFiltro && !obraFiltro) {
      return sendEmbed(message.channel, { title: en ? "❌ Unknown filter" : "❌ Filtro desconhecido",
        description: [en ? `I don't know **${filtro}**.` : `Não conheço **${filtro}**.`, "", ...ajudaFiltros].filter(Boolean).join("\n"), colour: COR.erro });
    }
    // Sem filtro: resumo por raridade (cabe sempre)
    if (!filtro) {
      const linhas = [en ? `**${lista.length}** items in the game — 10 rarities, one per difficulty:` : `**${lista.length}** itens no jogo — 10 raridades, uma por dificuldade:`, ""];
      for (const r of R.ORDEM) {
        const itens = lista.filter((i) => i.raridade === r);
        if (!itens.length) continue;
        const info = RARIDADE_INFO[r] ?? {}, d = R.difDaRaridade(r);
        const porSlot = ["mao", "capacete", "armadura", "acessorio", "implante"].map((sl) => [sl, itens.filter((i) => i.slot === sl).length]).filter(([, n]) => n);
        linhas.push(`${info.emoji} **${rotuloRaridade(r, en)}** _(${en ? "difficulty" : "dificuldade"} ${d})_ — ${porSlot.map(([sl, n]) => `${SLOT_INFO[sl].emoji}${n}`).join(" ")} · \`${P}game catalogo ${r}\``);
      }
      linhas.push("", ...ajudaFiltros.filter(Boolean), "", en ? `_♾️ = infinite stock · ✦ = unique (never sold by the NPC) · details: \`${P}game item <name>\`_` : `_♾️ = estoque infinito · ✦ = único (o NPC não vende) · detalhes: \`${P}game item <nome>\`_`);
      return sendEmbed(message.channel, { title: en ? "📖 Game items" : "📖 Itens do jogo", description: linhas.join("\n").slice(0, 3900), colour: COR.info });
    }
    const titulo = raridade ? `${RARIDADE_INFO[raridade].emoji} ${rotuloRaridade(raridade, en)}` : slotFiltro ? `${SLOT_INFO[slotFiltro].emoji} ${rotuloSlot(slotFiltro, en)}` : `📚 ${obraFiltro}`;
    const linhas = lista.map((i) => `${raridade ? "" : RARIDADE_INFO[i.raridade]?.emoji ?? ""}${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}**${i.infinito ? " ♾️" : ""}${i.especial ? " ✦" : ""}${i.obra && !obraFiltro ? ` _(${i.obra})_` : ""}\n   ${descreverItem(i, en)}`);
    return enviarLista(sendEmbed, message.channel, { titulo: `${titulo} — ${lista.length}`, linhas,
      rodape: en ? `_♾️ = infinite stock · ✦ unique · price and details:_ \`${P}game item <name>\`` : `_♾️ = estoque infinito · ✦ único · preço e detalhes:_ \`${P}game item <nome>\``, colour: COR.info });
  }

  if (["admin", "debug"].includes(sub)) {
    if (!ctx.ehSuperAdmin?.(eu)) {
      return sendEmbed(message.channel, { title: en ? "🚫 Restricted command" : "🚫 Comando restrito",
        description: en ? "Only the bot owner can use admin mode." : "Só o dono do bot usa o modo admin.", colour: COR.erro });
    }
    const acao = args[1]?.toLowerCase();
    const resto = args.slice(2);
    const alvoId = idEscrito(resto.join(" ")) ?? message.mentionIds?.[0] ?? eu;
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
          `\`${P}game admin moeda\` — **the world's two currencies** (rename and tune)`,
          `\`${P}game admin teste\` — runs the whole game and reports what worked`,
          `\`${P}game admin eco\` — the game currencies' numbers`,
          `\`${P}game admin simular <contract|boss> [n]\` — runs it n times with no effect`,
          `\`${P}game admin dungeon <qty> [dungeon]\` — puts Gold in a dungeon's treasury`,
          `\`${P}game admin imagem [id] [link]\` — pictures for characters, bosses, dungeons (attach the image)`,
          `\`${P}game admin reset <mundo|catalogo|tudo>\` — starts over`,
        ] : [
          `\`${P}game admin dar <qtd> [@pessoa]\` — credita moeda`,
          `\`${P}game admin item <nome> [@pessoa]\` — dá um item`,
          `\`${P}game admin follower <nome> [nível] [@pessoa]\` — dá um companheiro`,
          `\`${P}game admin nivel <n> [@pessoa]\` — força o nível`,
          `\`${P}game admin pontos <n> [@pessoa]\` — dá pontos livres`,
          `\`${P}game admin energia [@pessoa]\` — enche a energia dos companheiros`,
          `\`${P}game admin cooldown [@pessoa]\` — zera cooldown e recuperação`,
          `\`${P}game admin moeda\` — **as duas moedas do mundo** (renomear e ajustar)`,
          `\`${P}game admin teste\` — roda o jogo inteiro e diz o que funcionou`,
          `\`${P}game admin eco\` — números das moedas do jogo`,
          `\`${P}game admin simular <contrato|chefe> [n]\` — roda n vezes sem efeito`,
          `\`${P}game admin dungeon <qtd> [dungeon]\` — põe Ouro no tesouro de uma dungeon`,
          `\`${P}game admin imagem [id] [link]\` — imagens de personagens, chefes, dungeons (anexe a imagem)`,
          `\`${P}game admin reset <mundo|catalogo|tudo>\` — recomeça do zero`,
        ]).join("\n"), colour: COR.mod });
    }

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

    // ── imagens (personagens, chefes, especiais, dungeons, únicos) ──
    if (["imagem", "imagens", "image", "images", "img"].includes(acao)) {
      const TIPO = en ? { companheiro: "👤 Companions", chefe: "👑 Bosses", especial: "✦ Specials", dungeon: "🕳️ Dungeons", item: "📦 Unique items" }
        : { companheiro: "👤 Companheiros", chefe: "👑 Chefes", especial: "✦ Especiais", dungeon: "🕳️ Dungeons", item: "📦 Itens únicos" };
      const anexo = IMG.anexoDe(message);
      const ultimo = resto[resto.length - 1] ?? "";
      const remover = /^(remover|apagar|tirar|remove|delete)$/i.test(ultimo);
      const link = /^https?:\/\//i.test(ultimo) ? ultimo : null;
      const nome = (link || remover ? resto.slice(0, -1) : resto).join(" ").trim();
      if (!nome) {
        const alvos = IMG.alvosDeImagem();
        const com = alvos.filter((a) => IMG.imagemDe(a.id));
        const L = [en ? `**${com.length} of ${alvos.length}** have an image.` : `**${com.length} de ${alvos.length}** têm imagem.`, "",
          en ? "Upload the picture in any Stoat channel the bot can see (a private one is best — keep the message), and send in the same message:"
            : "Mande a imagem em qualquer canal do Stoat que o bot veja (melhor um privado — não apague a mensagem) e, na mesma mensagem:",
          `\`${P}game admin imagem <id ${en ? "or name" : "ou nome"}>\` _(${en ? "with the image attached" : "com a imagem anexada"})_`,
          en ? `or \`${P}game admin imagem <id or name> <link>\` · \`… remover\` takes it out` : `ou \`${P}game admin imagem <id ou nome> <link>\` · \`… remover\` tira`, ""];
        for (const tipo of Object.keys(TIPO)) {
          const falta = alvos.filter((a) => a.tipo === tipo && !IMG.imagemDe(a.id));
          if (!falta.length) continue;
          L.push(`**${TIPO[tipo]}** — ${en ? "missing" : "faltam"} ${falta.length}`);
          for (const a of falta) L.push(`   \`${a.id}\` ${en ? a.nomeEN ?? a.nome : a.nome}`);
        }
        return enviarLista(sendEmbed, message.channel, { titulo: en ? "🖼️ RPG images" : "🖼️ Imagens do RPG", linhas: L, colour: COR.mod });
      }
      const alvo = IMG.acharAlvo(nome);
      if (!alvo) return sendEmbed(message.channel, { title: en ? "❌ Not found" : "❌ Não achei", colour: COR.erro,
        description: en ? `Nothing called **${nome}**. \`${P}game admin imagem\` lists the ids.` : `Nada chamado **${nome}**. \`${P}game admin imagem\` lista os ids.` });
      const rotulo = `**${en ? alvo.nomeEN ?? alvo.nome : alvo.nome}** (\`${alvo.id}\`)`;
      if (remover) {
        IMG.definirImagem(alvo.id, null);
        return sendEmbed(message.channel, { title: en ? "🖼️ Image removed" : "🖼️ Imagem removida", colour: COR.mod, description: rotulo });
      }
      const nova = anexo ?? link;
      if (!nova) {
        const atual = IMG.imagemDe(alvo.id);
        return sendEmbed(message.channel, { title: `🖼️ ${en ? alvo.nomeEN ?? alvo.nome : alvo.nome}`, colour: COR.mod,
          description: atual ? `${rotulo}\n${en ? "This is the current image." : "Esta é a imagem atual."}` : `${rotulo}\n${en ? "No image yet — attach one to the command." : "Ainda sem imagem — anexe uma ao comando."}`,
          ...(atual ? { imagem: atual } : {}) });
      }
      const v = validarUrlImagem(nova);
      if (!v.ok) return sendEmbed(message.channel, { title: en ? "❌ Invalid image" : "❌ Imagem inválida", colour: COR.erro, description: en ? v.motivoEn : v.motivo });
      IMG.definirImagem(alvo.id, v.url);
      return sendEmbed(message.channel, { title: en ? "🖼️ Image saved" : "🖼️ Imagem salva", colour: COR.sucesso, imagem: v.url,
        description: [rotulo, v.aviso ? `⚠️ ${en ? v.avisoEn : v.aviso}` : null,
          en ? "_If it doesn't show up as a cover above, Stoat refused it — use an image uploaded to Stoat itself._" : "_Se ela não aparecer como capa aqui, o Stoat recusou — use uma imagem enviada no próprio Stoat._"].filter(Boolean).join("\n") });
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
      db.recrutarFollower(serverId, alvoId, cat.id, db.getPersonagem(serverId, alvoId)?.nivel ?? nivel);
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
      db.salvarPersonagem(serverId, alvoId, acao === "nivel" ? { nivel: Math.max(1, n), xp: 0, progresso: 0 } : { pontos: (alvo.pontos ?? 0) + n });
      return sendEmbed(message.channel, { title: en ? "🔧 Adjusted" : "🔧 Ajustado",
        description: en ? `${quem === "você" ? "You" : quem}: ${acao} → ${n}` : `${quem === "você" ? "Você" : quem}: ${acao} → ${n}`, colour: COR.mod });
    }

    if (acao === "energia") {
      const meus = db.listarFollowersDe(serverId, alvoId);
      for (const f of meus) db.salvarFollower(f.id, { energia: 5, energiaEm: Date.now() });
      return sendEmbed(message.channel, { title: en ? "🔧 Energy full" : "🔧 Energia cheia",
        description: en ? `${meus.length} companion(s) of ${quem}` : `${meus.length} companheiro(s) de ${quem}`, colour: COR.mod });
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
      return sendEmbed(message.channel, { title: en ? "🔧 Cooldown cleared" : "🔧 Cooldown zerado",
        description: en ? `${quem === "você" ? "You can" : quem + " can"} set out now.` : `${quem === "você" ? "Você pode" : quem + " pode"} partir agora.`, colour: COR.mod });
    }

    if (acao === "dungeon") {
      const qtd = parseInt(resto[0], 10) || 0;
      const d = MISS.acharDungeon(resto.slice(1).filter((x) => !/^<[@%#]/.test(x)).join(" ")) ?? [...MISS.DUNGEONS.values()][0];
      const t = TS.renovar(d.id);
      db.salvarDungeon(d.id, { ouro: (t.ouro ?? 0) + qtd });
      const atual = db.getDungeon(d.id);
      return sendEmbed(message.channel, { title: en ? "🔧 Dungeon treasury" : "🔧 Tesouro da dungeon",
        description: en ? `**${d.nome}** now holds 🪙${fmt(atual.ouro)} · 💎${fmt(atual.cristal)}` : `**${d.nome}** agora tem 🪙${fmt(atual.ouro)} · 💎${fmt(atual.cristal)}`,
        colour: COR.mod });
    }

    // ── teste geral: roda o jogo inteiro num personagem descartável ──
    if (["teste", "smoke", "testar"].includes(acao)) {
      await sendEmbed(message.channel, { title: en ? "🧪 Running the full test…" : "🧪 Rodando o teste geral…",
        description: en ? "Creating a test character and running through everything. A few seconds." : "Criando um personagem de teste e passando por tudo. Alguns segundos.",
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
      return enviarLista(sendEmbed, message.channel, { titulo: en ? "🔧 Game currencies" : "🔧 Moedas do jogo", linhas, colour: COR.mod });
    }

    if (acao === "simular") {
      const nomeM = resto.filter((x) => !/^\d+$/.test(x) && !/^<[@%#]/.test(x)).join(" ");
      const vezes = Math.min(5000, parseInt(resto.find((x) => /^\d+$/.test(x)) ?? "1000", 10));
      const missao = MISS.acharContrato(nomeM) ?? MISS.acharEspecial(nomeM) ?? MISS.acharChefe(nomeM);
      if (!missao) return sendEmbed(message.channel, { title: en ? "❌ Unknown mission" : "❌ Missão desconhecida",
        description: `\`${P}game admin simular <contrato|chefe> [vezes]\`\n\n\`${P}game contratos\` · \`${P}game chefes\``, colour: COR.erro });
      const party = CB.partyDe(serverId, alvoId);
      if (!party) return sendEmbed(message.channel, { title: en ? "❌ No character" : "❌ Sem personagem",
        description: en ? `${quem === "você" ? "You" : quem} ${quem === "você" ? "don't" : "doesn't"} have a character.` : `${quem === "você" ? "Você" : quem} não tem personagem.`, colour: COR.erro });
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
        const T = (pt, e) => (en ? e : pt);
        const volume = m.finita
          ? `${T("banco", "bank")} ${fmt(m.mercado)}`
          : `${T("referência", "reference")} ${fmt(m.mercado)}`;
        const ritmo = m.dificuldade <= 2 ? T("geração alta", "high yield")
          : m.dificuldade <= 20 ? T("geração média", "medium yield")
          : m.dificuldade <= 100 ? T("geração baixa", "low yield") : T("geração raríssima", "very rare yield");
        return [
          `${m.simbolo} **${m.nome}** \`${m.id}\`${m.padrao ? T(" ⭐ padrão", " ⭐ default") : ""}`,
          `   ${m.finita ? T("🔒 finita", "🔒 finite") : T("♾️ infinita", "♾️ infinite")} · **${ritmo}** (${T("dificuldade", "difficulty")} ${m.dificuldade}) · ${T("nível", "level")} ${m.nivelMin}+`,
          `   ${volume} · ${T("com jogadores", "with players")} ${fmt(db.totalNasCarteiras(serverId, m.id))}`,   // (o pote antigo da dungeon virou o tesouro de cada uma — &game admin eco)
          `   P ${(pSuave * 100).toFixed(0)}% → ${T("preços", "prices")} ×${MERC.mult(pSuave).toFixed(2)}`,
        ].join("\n");
      };

      // ── ajuda / guia ──
      if (op === "ajuda" || op === "guia" || op === "help") {
        return enviarLista(sendEmbed, message.channel, {
          titulo: en ? "🪙 Guide — the world's two currencies" : "🪙 Guia — as duas moedas do mundo",
          linhas: [
            en ? "The RPG is **one world** for every server, with **two** currencies:" : "O RPG é **um mundo só** para todos os servidores, com **duas** moedas:",
            ...MOEDAS_DO_MUNDO.map((b) => { const m = db.getMoeda(serverId, b.id) ?? b; return `${m.simbolo} **${m.nome}** \`${m.id}\` — ${m.finita ? (en ? "🔒 **finite**: a fixed supply; when the bank runs out, it only changes hands between players" : "🔒 **finita**: suprimento fixo; quando o banco esgota, só circula entre jogadores") : (en ? "♾️ **infinite**: the everyday money, no ceiling" : "♾️ **infinita**: o dinheiro do dia a dia, sem teto")}`; }),
            "",
            en ? "**Adjust** (the type — finite or infinite — is fixed)" : "**Ajustar** (o tipo — finita ou infinita — é fixo)",
            `\`${P}game admin moeda set <id> <campo> <valor>\``,
            `\`${P}game admin moeda set cristal dificuldade=60 nivel=8\`  ← ${en ? "several at once" : "vários de uma vez"}`,
            "",
            en ? "**Fields**" : "**Os campos**",
            ...Object.entries(CAMPOS).map(([k, v]) => `\`${k}\` — ${v.desc}`),
            "",
            en ? "**How difficulty works**" : "**Como a dificuldade funciona**",
            en ? "It controls both the chance of the currency dropping in a mission **and** how many units come out — difficulty 40 shows up ~40× less than 1 and yields ~40× less." : "Controla ao mesmo tempo a chance de a moeda cair numa missão **e** quantas unidades saem — dificuldade 40 aparece ~40× menos que a 1 e rende ~40× menos.",
          ],
          colour: COR.mod,
        });
      }

      // Criar, apagar, perfis, modelos, trocar a principal: não existem mais
      // num mundo de duas moedas fixas.
      if (["duplicadas", "duplicates", "limpar", "dedupe", "fundir", "merge", "perfil", "perfis", "profile", "profiles",
        "add", "adicionar", "modelo", "modelos", "preset", "criar", "nova", "padrao", "padrão", "principal",
        "remover", "apagar", "deletar"].includes(op)) {
        return sendEmbed(message.channel, { title: en ? "🪙 The world has two currencies" : "🪙 O mundo tem duas moedas",
          description: en
            ? `The RPG is now one world for every server, with exactly two currencies — one infinite and one finite. You can rename them or tune them (\`${P}game admin moeda set\`), but not create, delete or swap them.`
            : `O RPG agora é um mundo só para todos os servidores, com exatamente duas moedas — uma infinita e uma finita. Dá para renomear e ajustar (\`${P}game admin moeda set\`), não criar, apagar nem trocar.`,
          colour: COR.info });
      }

      if (["ver", "detalhe", "info"].includes(op)) {
        const m = db.acharMoeda(serverId, args2[0]);
        if (!m) return sendEmbed(message.channel, { title: en ? "❌ Unknown currency" : "❌ Moeda desconhecida",
          description: `\`${P}game admin moeda\` lista as existentes.`, colour: COR.erro });
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
            `_Mudar: \`${P}game admin moeda set ${m.id} <campo> <valor>\`_`,
            `_Campos: ${Object.keys(CAMPOS).join(", ")}_`,
          ].filter(Boolean).join("\n"), colour: COR.mod });
      }

      // ── criar ──
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

      // ── painel (padrão) ──
      garantirMoedasDoMundo();
      const lista = db.listarMoedas(serverId);
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "🪙 The world's currencies" : "🪙 As moedas do mundo",
        linhas: [
          ...lista.map(fichaDaMoeda),
          "",
          en ? "_One world for every server — the same balances everywhere._" : "_Um mundo só para todos os servidores — os mesmos saldos em qualquer um._",
          `\`${P}game admin moeda ajuda\` — ${en ? "what each field means" : "o que cada campo significa"}`,
          `\`${P}game admin moeda set <id> <campo> <valor>\` · \`${P}game admin moeda ver <id>\``,
        ],
        colour: COR.mod });
    }

    if (["zerar", "reset", "resetar"].includes(acao)) {
      const escopo = ({ servidor: "mundo", server: "mundo" })[(resto[0] ?? "mundo").toLowerCase()] ?? (resto[0] ?? "mundo").toLowerCase();
      const confirmou = resto.includes("confirmar");
      const escopos = { mundo: 1, catalogo: 1, "catálogo": 1, tudo: 1 };
      if (!escopos[escopo]) {
        return sendEmbed(message.channel, { title: en ? "❓ Reset what?" : "❓ Resetar o quê?",
          description: (en ? [
            `\`${P}game admin reset mundo confirmar\``,
            "   erases **everyone's progress, on every server**: characters, bags, followers, balances and offers",
            "",
            `\`${P}game admin reset catalogo confirmar\``,
            "   erases what you **curated**, back to the generic items/followers only",
            "",
            `\`${P}game admin reset tudo confirmar\``,
            "   both — the game returns to a freshly installed state",
          ] : [
            `\`${P}game admin reset mundo confirmar\``,
            "   apaga o **progresso de todo mundo, em todos os servidores**: personagens, mochilas, followers, saldos e ofertas",
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
            "• mochilas, equipamentos, recompensas únicas e os tesouros das dungeons", "");
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
        title: en ? "🔄 Reset done" : "🔄 Reset concluído",
        description: (en ? [
          `**Scope:** ${escopo}`,
          "",
          apagados.length ? "**Erased:**\n" + apagados.map((x) => `• ${x}`).join("\n") : "_There was nothing to erase._",
          mexeuNoCatalogo
            ? `\n✅ Generic catalog recreated: ${db.listarItens().length} items, ${db.listarFollowersCatalogo().length} companions` : "",
          "",
          "_The world's two currencies are back, with a full bank. Now just \`" + P + "game criar\`._",
        ] : [
          `**Escopo:** ${escopo}`,
          "",
          apagados.length ? "**Apagado:**\n" + apagados.map((x) => `• ${x}`).join("\n") : "_Nada havia para apagar._",
          mexeuNoCatalogo
            ? `\n✅ Catálogo genérico recriado: ${db.listarItens().length} itens, ${db.listarFollowersCatalogo().length} companheiros` : "",
          "",
          "_As duas moedas do mundo voltaram, com o banco cheio. Agora é só \`" + P + "game criar\`._",
        ]).filter(Boolean).join("\n"),
        colour: COR.sucesso });
    }

    return sendEmbed(message.channel, { title: en ? "❓ Unknown action" : "❓ Ação desconhecida",
      description: en ? `\`${P}game admin\` lists what you can do.` : `\`${P}game admin\` lista o que dá para fazer.`, colour: COR.erro });
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
    if (!temAlgo) linhas.push("", en ? "_Your wallet is empty — missions pay in currency._" : "_Sua carteira está vazia — missões pagam em moeda._");

    // O estado do mercado é o da moeda padrão: é nela que os preços aparecem.
    if (padrao) {
      const { pSuave, comPlayers } = pDaMoeda(serverId, padrao);
      linhas.push("",
        en ? `**Market — ${padrao.simbolo} ${padrao.nome}**` : `**Mercado — ${padrao.simbolo} ${padrao.nome}**`,
        en
          ? `With the players: ${fmt(comPlayers)} · ${padrao.finita ? "Market" : "Reference"}: ${fmt(padrao.mercado)}`
          : `Com os jogadores: ${fmt(comPlayers)} · ${padrao.finita ? "Mercado" : "Referência"}: ${fmt(padrao.mercado)}`,
        en ? `Concentration (P): **${(pSuave * 100).toFixed(0)}%**` : `Concentração (P): **${(pSuave * 100).toFixed(0)}%**`,
        en
          ? `Prices are **${MERC.mult(pSuave) > 1.5 ? "high" : MERC.mult(pSuave) > 1 ? "medium" : "low"}** (×${MERC.mult(pSuave).toFixed(2)})`
          : `Preços estão **${MERC.mult(pSuave) > 1.5 ? "altos" : MERC.mult(pSuave) > 1 ? "médios" : "baixos"}** (×${MERC.mult(pSuave).toFixed(2)})`,
        en
          ? `Falling costs **${(MERC.perda(pSuave) * 100).toFixed(0)}%** of what you carry`
          : `Cair custa **${(MERC.perda(pSuave) * 100).toFixed(0)}%** do que você carrega`,
      );
      linhas.push("", en
        ? `_Contracts are paid by the bank (the guild); dungeons by their own treasury, which refills as people play there — \`${P}game dungeons\`._`
        : `_Contratos são pagos pelo banco (a guilda); dungeons, pelo tesouro delas, que se renova com quem joga lá — \`${P}game dungeons\`._`);
    }

    if (moedas.length > 1) {
      // (o painel das moedas é do dono do bot; para o jogador, o que importa é trocar)
      if (ctx.ehSuperAdmin?.(eu)) linhas.push("", en
        ? `_Each currency has its own P — \`${P}game admin moeda\`._`
        : `_Cada moeda tem seu próprio P — \`${P}game admin moeda\`._`);
      linhas.push(en
        ? `_Exchange with the bank: \`${P}game cambio <qty|tudo> <currency> para <currency>\` · rates: \`${P}game cambio taxas\`_`
        : `_Trocar com o banco: \`${P}game cambio <qtd|tudo> <moeda> para <moeda>\` · taxas: \`${P}game cambio taxas\`_`);
    }

    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "💰 Your wallet" : "💰 Sua carteira", linhas, colour: COR.info });
  }

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
      const { pct, valor: taxa } = MERC.calcularTaxa(of.qtdPedida, volume);
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
    linhas.push("", `_\`${P}game mercado comprar <#>\` · taxa atual: **${(MERC.taxaMercado(volume) * 100).toFixed(2)}%**_`);
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
      const linhas = [];
      for (const de of moedas) {
        const partes = moedas.filter((x) => x.id !== de.id).map((para) => {
          const r = MERC.converter(100, de, para);
          return `${para.simbolo}${fmt(r.recebe)} ${para.id}`;
        });
        linhas.push(`${de.simbolo} **100 ${de.nome}** → ${partes.join(" · ")}`);
      }
      linhas.push("", en
        ? `_Spread: ${(MERC.CFG.spread * 100).toFixed(0)}% — it's what keeps A→B→A from paying off._`
        : `_Spread: ${(MERC.CFG.spread * 100).toFixed(0)}% — é o que impede o A→B→A dar lucro._`);
      linhas.push(en
        ? `_The rate is the ratio between the bank's stocks — big trades move it against you._`
        : `_A taxa é a razão entre os estoques do banco — trocas grandes a movem contra você._`);
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "💱 Bank rates" : "💱 Taxas do banco", linhas, colour: COR.info });
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
              colour: COR.aviso }));
        }
        const linhas = outras.map((para) => {
          const r = MERC.converter(qtd, de, para);
          const unit = MERC.taxaCambio(de, para);
          return `${para.simbolo} **${fmt(r.recebe)}** ${para.nome}`
            + `  _(1 = ${unit >= 0.01 ? unit.toFixed(2) : unit.toExponential(1)})_`;
        });
        const seu = db.getSaldo(serverId, eu, de.id);
        linhas.push("", en
          ? `_Already with the ${(MERC.CFG.spread * 100).toFixed(0)}% spread discounted — it's what you'd actually receive._`
          : `_Já com o spread de ${(MERC.CFG.spread * 100).toFixed(0)}% descontado — é o que você receberia de fato._`);
        linhas.push(en
          ? `_You have ${de.simbolo}${fmt(seu)} · to trade: \`${P}game cambio ${qtd} ${de.id} para <currency>\`_`
          : `_Você tem ${de.simbolo}${fmt(seu)} · para trocar: \`${P}game cambio ${qtd} ${de.id} para <moeda>\`_`);
        return enviarLista(sendEmbed, message.channel, {
          titulo: en
            ? `💱 ${de.simbolo} ${fmt(qtd)} ${de.nome} is worth`
            : `💱 ${de.simbolo} ${fmt(qtd)} ${de.nome} vale`,
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
            description: "They must be the world's two different currencies.", colour: COR.erro }));
      }
      const qtd = numeroDigitado(qtdTxt);
      const saldo = db.getSaldo(serverId, eu, de.id);
      if (Number.isFinite(qtd) && !Number.isInteger(qtd)) {
        return sendEmbed(message.channel, { title: en ? "💱 Whole units only" : "💱 Só unidades inteiras", colour: COR.aviso,
          description: en ? `The game's currencies don't split: use a whole number (or \`tudo\`).` : `As moedas do jogo não se dividem: use um número inteiro (ou \`tudo\`).` });
      }
      if (!(qtd > 0) || saldo + 1e-7 < qtd) {
        return sendEmbed(message.channel, {
          title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
          description: en ? `You have ${de.simbolo}${fmt(saldo)}.` : `Você tem ${de.simbolo}${fmt(saldo)}.`,
          colour: COR.erro });
      }

      let r = MERC.converter(qtd, de, para);
      if (r.recebe <= 0) {
        const um = MERC.converter(1e9, de, para).recebe > 0 ? Math.ceil(1 / MERC.taxaCambio(de, para) / (1 - MERC.CFG.spread)) : null;
        return sendEmbed(message.channel, tr(ctx,
          { title: "💱 Valor pequeno demais",
            description: `${fmt(qtd)} ${de.nome} não chega a 1 ${para.nome} pela taxa de hoje.${um ? ` 1 ${para.nome} custa uns ${fmt(um)} ${de.nome}.` : ""}`, colour: COR.aviso },
          { title: "💱 Amount too small",
            description: `${fmt(qtd)} ${de.nome} doesn't reach 1 ${para.nome} at today's rate.${um ? ` 1 ${para.nome} costs about ${fmt(um)} ${de.nome}.` : ""}`, colour: COR.aviso }));
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
          title: en ? "🏦 The bank is short" : "🏦 O banco não tem tanto",
          description: en
            ? `The bank only holds ${para.simbolo}${fmt(atualPara.mercado ?? 0)} of **${para.nome}** right now.\n\n_Finite currencies come back to the bank as people spend them. Try a smaller amount, or the counter: \`${P}game cambio ${qtd} ${de.id} por <qty> ${para.id}\`._`
            : `O banco só tem ${para.simbolo}${fmt(atualPara.mercado ?? 0)} de **${para.nome}** agora.\n\n_Moedas finitas voltam ao banco conforme as pessoas gastam. Tente um valor menor, ou use o balcão: \`${P}game cambio ${qtd} ${de.id} por <qtd> ${para.id}\`._`,
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
        title: en ? "💱 Exchanged" : "💱 Trocado",
        description: (en ? [
          `${de.simbolo}**${fmt(gasto)} ${de.nome}** → ${para.simbolo}**${fmt(recebido)} ${para.nome}**`,
          gasto < qtd ? `_${fmt(qtd - gasto)} ${de.nome} weren't needed — they stayed in your wallet._` : null,
          `_Rate: 1 ${para.nome} ≈ ${fmt(Math.ceil(gasto / recebido))} ${de.nome} · spread ${para.simbolo}${fmt(r.taxa)}_`,
          "",
          `**Your wallet:** ${carteira}`,
        ] : [
          `${de.simbolo}**${fmt(gasto)} ${de.nome}** → ${para.simbolo}**${fmt(recebido)} ${para.nome}**`,
          gasto < qtd ? `_${fmt(qtd - gasto)} ${de.nome} não foram necessários — ficaram na sua carteira._` : null,
          `_Taxa: 1 ${para.nome} ≈ ${fmt(Math.ceil(gasto / recebido))} ${de.nome} · spread ${para.simbolo}${fmt(r.taxa)}_`,
          "",
          `**Sua carteira:** ${carteira}`,
        ]).filter((x) => x !== null).join("\n"), colour: COR.sucesso });
    }

    const m = texto.match(/^([\d.,]+)\s+(\S+)\s+por\s+([\d.,]+)\s+(\S+)$/i);
    if (!m) {
      const linhas = en ? [
        "**Two ways to exchange**",
        `\`${P}game cambio <qty> <currency> para <currency>\` — **with the bank**, instantly`,
        `   e.g. \`${P}game cambio 200 ouro para cristal\` · everything: \`${P}game cambio tudo ouro para cristal\``,
        `\`${P}game cambio <qty> <currency> por <qty> <currency>\` — offer to **another player**`,
        `   e.g. \`${P}game cambio 100 ouro por 2 cristal\``,
        "_Whole units only: the bank uses just what the whole units cost — the rest stays with you._",
        "",
        "**World currencies:**",
        ...moedas.map((x) => `${x.simbolo} **${x.nome}** \`${x.id}\` — you have ${fmt(db.getSaldo(serverId, eu, x.id))}`),
        "",
        `\`${P}game cambio <qty> <currency>\` — what that amount is worth in EVERY currency`,
        `\`${P}game cambio taxas\` — the bank's current rates`,
        `_The bank always trades, at the rate of the day and a ${(MERC.CFG.spread * 100).toFixed(0)}% spread._`,
        "_At the counter you set whatever rate you like; whoever accepts, accepts._",
      ] : [
        "**Duas formas de trocar**",
        `\`${P}game cambio <qtd> <moeda> para <moeda>\` — **com o banco**, na hora`,
        `   ex.: \`${P}game cambio 200 ouro para cristal\` · tudo: \`${P}game cambio tudo ouro para cristal\``,
        `\`${P}game cambio <qtd> <moeda> por <qtd> <moeda>\` — oferta a **outro jogador**`,
        `   ex.: \`${P}game cambio 100 ouro por 2 cristal\``,
        "_Só unidades inteiras: o banco usa só o que as unidades inteiras custam — o resto fica com você._",
        "",
        "**Moedas do mundo:**",
        ...moedas.map((x) => `${x.simbolo} **${x.nome}** \`${x.id}\` — você tem ${fmt(db.getSaldo(serverId, eu, x.id))}`),
        "",
        `\`${P}game cambio <qtd> <moeda>\` — quanto isso vale em TODAS as moedas`,
        `\`${P}game cambio taxas\` — as taxas do banco agora`,
        `_O banco sempre troca, pela taxa do dia e um spread de ${(MERC.CFG.spread * 100).toFixed(0)}%._`,
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
        description: en ? "They must be the world's two different currencies." : "Precisam ser as duas moedas diferentes do mundo.", colour: COR.erro });
    }
    if (![numeroDigitado(qtdDe), numeroDigitado(qtdPara)].every((x) => Number.isInteger(x) && x > 0)) {
      return sendEmbed(message.channel, { title: en ? "💱 Whole units only" : "💱 Só unidades inteiras", colour: COR.aviso,
        description: en ? "Both amounts must be whole numbers above zero." : "As duas quantias precisam ser números inteiros acima de zero." });
    }
    const saldo = db.getSaldo(serverId, eu, de.id);
    if (saldo + 1e-7 < numeroDigitado(qtdDe)) {
      return sendEmbed(message.channel, { title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
        description: en ? `You have ${de.simbolo}${fmt(saldo)}.` : `Você tem ${de.simbolo}${fmt(saldo)}.`, colour: COR.erro });
    }
    db.debitar(serverId, eu, de.id, numeroDigitado(qtdDe));
    const of = db.criarOferta({ serverId, tipo: "cambio", autorId: eu,
      moedaOferecida: de.id, qtdOferecida: numeroDigitado(qtdDe),
      moedaPedida: para.id, qtdPedida: numeroDigitado(qtdPara) });

    const ref = MERC.converter(numeroDigitado(qtdDe), de, para);
    return sendEmbed(message.channel, { title: en ? "💱 Offer published" : "💱 Oferta publicada",
      description: (en ? [
        `Offering **${fmt(qtdDe)} ${de.nome}** ${de.simbolo} for **${fmt(qtdPara)} ${para.nome}** ${para.simbolo}`,
        `_The system would pay ~${fmt(ref.recebe)} — your rate is ${numeroDigitado(qtdPara) < ref.recebe ? "better" : "worse"} for whoever accepts._`,
        "",
        `Offer **#${of.id}** · the amount is held in escrow with me.`,
      ] : [
        `Oferece **${fmt(qtdDe)} ${de.nome}** ${de.simbolo} por **${fmt(qtdPara)} ${para.nome}** ${para.simbolo}`,
        `_O sistema pagaria ~${fmt(ref.recebe)} — a sua taxa é ${numeroDigitado(qtdPara) < ref.recebe ? "melhor" : "pior"} para quem aceitar._`,
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

    const alvoId = idEscrito(mm[0] ?? "") ?? message.mentionIds?.[0] ?? null;
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
      return `${m.simbolo} ${fmt(c)} ${m.id}${seu >= c ? " ✅" : ""}`;
    });

    const naoVende = item.especial || ["contrato", "pergaminho"].includes(item.slot);
    const linhas = [
      `${r.emoji ?? ""} **${item.nome}** — ${rotuloRaridade(item.raridade, en)} · ${en ? "difficulty" : "dificuldade"} ${item.dif ?? R.difDaRaridade(item.raridade)}${item.obra ? ` · _${item.obra}_` : ""}`,
      `${si.emoji ?? "•"} **${en ? "Slot" : "Vaga"}:** ${rotuloSlot(item.slot, en)}`,
      descreverItem(item, en),
      item.descricao?.pt ? `_${en ? item.descricao.en : item.descricao.pt}_` : null,
      "",
      ...(naoVende ? [en ? "✦ **Unique** — the NPC never sells or buys it; between players, anything goes (`&game mercado`, `&game trocar`)." : "✦ **Único** — o NPC nunca vende nem compra; entre jogadores, vale tudo (`&game mercado`, `&game trocar`)."] : [
        `**${en ? "Price" : "Preço"}:** ${moeda.simbolo}${fmt(preco)}`,
        `**${en ? "The market pays you" : "O mercado te paga"}:** ${moeda.simbolo}${fmt(recompra)} _(${en ? "your Charisma" : "seu Carisma"} ${carisma})_`,
        `**${en ? "Stock" : "Estoque"}:** ${item.infinito ? (en ? "♾️ infinite" : "♾️ infinito") : `${fmt(estoque)} ${en ? "left" : "restante(s)"}`}`,
      ]),
      temNaMochila ? `**${en ? "In your bag" : "Na sua mochila"}:** ${temNaMochila}` : null,
      ...(naoVende ? [] : ["", en ? "**In each currency** _(✅ = you can afford it)_" : "**Em cada moeda** _(✅ = dá para pagar)_", ...emCadaMoeda, "",
        en ? `\`${P}game comprar ${item.nome}\` · \`${P}game comprar ${item.nome} com <currency>\`` : `\`${P}game comprar ${item.nome}\` · \`${P}game comprar ${item.nome} com <moeda>\``]),
    ];
    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "📦 Item" : "📦 Item", linhas: linhas.filter(Boolean), colour: COR.info,
      imagem: IMG.imagemDe(item.id, item.dados?.companheiro) });
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
      if (magia.unica) {
        return sendEmbed(message.channel, { title: en ? "✦ Unique spell" : "✦ Magia única", colour: COR.aviso,
          description: en ? `**${magia.nomeEN ?? magia.nome}** isn't sold — it only comes as a scroll from a special mission (\`${P}game especiais\`).`
            : `**${magia.nome}** não é vendida — só sai como pergaminho de uma missão especial (\`${P}game especiais\`).` });
      }
      // D10: sem nível mínimo — atributo mínimo (Inteligência ≥ 5 × dificuldade − 4)
      if (!R.podeUsarMagia(magia, attrEf)) {
        return sendEmbed(message.channel, {
          title: en ? "🔒 Not enough Intelligence" : "🔒 Inteligência insuficiente",
          description: en
            ? `**${magia.nomeEN ?? magia.nome}** needs Intelligence **${magia.req}** — you have ${attrEf.inteligencia}.`
            : `**${magia.nome}** pede Inteligência **${magia.req}** — você tem ${attrEf.inteligencia}.`,
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
          title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
          description: en
            ? `**${magia.nome}** costs ${pag.moeda.simbolo}${fmt(pag.custo)} — you have ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`
            : `**${magia.nome}** custa ${pag.moeda.simbolo}${fmt(pag.custo)} — você tem ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))}.`,
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
          const c = MERC.custoEm(preco, moedaPadrao, m);
          return `${m.simbolo} ${fmt(c)} ${m.id}${db.getSaldo(serverId, eu, m.id) >= c ? " ✅" : ""}`;
        });
        const linhas = en ? [
          `${esc.emoji ?? "✦"} **${magia.nome}** — ${esc.rotuloEN ?? magia.tipo}`,
          `**Mana cost:** ${magia.custo} 🔷  ·  **Power:** +${(magia.poder * 100).toFixed(0)}%`,
          `**Needs:** Intelligence ${magia.req}  ·  **Rarity:** ${rotuloRaridade(magia.raridade, true)}${magia.unica ? " · ✦ unique (scroll only)" : ""}`,
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
          `**Pede:** Inteligência ${magia.req}  ·  **Raridade:** ${rotuloRaridade(magia.raridade, false)}${magia.unica ? " · ✦ única (só pergaminho)" : ""}`,
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
      return sendEmbed(message.channel, {
        title: en ? "❌ Unknown spell" : "❌ Magia desconhecida",
        description: en
          ? `I couldn't find **${restoBruto}**. See the whole catalog with \`${P}game magias\`.`
          : `Não achei **${restoBruto}**. Veja o catálogo inteiro com \`${P}game magias\`.`,
        colour: COR.erro });
    }

    // ── a lista ──
    const estado = CB.juntar([partyM]);
    estado.manaTotal = estado.mana;
    const ativas = new Set(estado.magias.map((m) => m.nome));
    const linhas = [];
    linhas.push(en
      ? `**Mana in use: ${estado.manaGasta}/${estado.manaTotal}** — spells enter from the strongest down, while the mana lasts.`
      : `**Mana em uso: ${estado.manaGasta}/${estado.manaTotal}** — as magias entram da mais forte para a mais fraca, enquanto a mana durar.`);
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
    linhas.push(en
      ? "_✅ active · 💤 known but doesn't fit in your mana · 🔒 needs more Intelligence (no level minimum)_"
      : "_✅ ativa · 💤 conhecida mas não cabe na mana · 🔒 pede mais Inteligência (sem nível mínimo)_");
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

    let moedaEscolhida = null;
    const mComMoeda = busca.match(/^(.*?)\s+(?:com|with|em|in)\s+(\S+)$/i);
    if (mComMoeda) {
      const achada = db.acharMoeda(serverId, mComMoeda[2]);
      if (achada) { busca = mComMoeda[1].trim(); moedaEscolhida = achada; }
    }

    if (!busca || acharRaridade(busca) || /^\d+$/.test(busca)) {
      // a loja mostra a raridade da sua faixa (ou a pedida): ninguém lê 280 itens
      const rar = acharRaridade(busca) ?? (/^\d+$/.test(busca) ? R.faixaDaDif(Math.max(1, Math.min(10, parseInt(busca, 10)))).raridade : R.faixaDoNivel(p.nivel).raridade);
      const itens = db.listarItens({ raridade: rar }).filter((i) => !i.especial && !["contrato", "pergaminho"].includes(i.slot));
      const linhas = [en ? `${RARIDADE_INFO[rar].emoji} **${rotuloRaridade(rar, true)}** — other rarities: \`${P}game comprar <rarity>\`` : `${RARIDADE_INFO[rar].emoji} **${rotuloRaridade(rar, false)}** — outras raridades: \`${P}game comprar <raridade>\``, ""];
      for (const i of itens) {
        const est = db.getEstoque(serverId, i.id);
        const preco = MERC.precoDeVenda(i, est, pSuave);
        const qtd = i.infinito ? "♾️" : `${est?.quantidade ?? est?.base ?? 10}un`;
        linhas.push(`${SLOT_INFO[i.slot]?.emoji ?? "•"} **${i.nome}** — ${moeda.simbolo}${fmt(preco)} _(${qtd})_${i.obra ? ` · _${i.obra}_` : ""}`);
      }
      linhas.push("", en
        ? `_\`${P}game comprar <item>\` · your balance: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}_`
        : `_\`${P}game comprar <item>\` · seu saldo: ${moeda.simbolo}${fmt(db.getSaldo(serverId, eu, moeda.id))}_`);
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "🏪 Market" : "🏪 Mercado", linhas, colour: COR.info });
    }

    const item = db.acharItemPorNome(busca);
    if (!item) return sendEmbed(message.channel, { title: en ? "❌ Unknown item" : "❌ Item desconhecido",
      description: en ? `I couldn't find **${busca}** in the market.` : `Não achei **${busca}** no mercado.`, colour: COR.erro });
    if (item.especial || ["contrato", "pergaminho"].includes(item.slot)) {
      return sendEmbed(message.channel, { title: en ? "✦ Not sold by the NPC" : "✦ O NPC não vende", colour: COR.aviso,
        description: en ? `**${item.nome}** is unique: it only comes from a special mission or a boss — or from another player (\`${P}game mercado\`).`
          : `**${item.nome}** é único: só sai de missão especial ou chefe — ou de outro jogador (\`${P}game mercado\`).` });
    }

    const est = db.getEstoque(serverId, item.id);
    if (!item.infinito && (est?.quantidade ?? est?.base ?? 10) <= 0) {
      return sendEmbed(message.channel, { title: en ? "📦 Sold out" : "📦 Esgotado",
        description: en ? `**${item.nome}** ran out in the market. Finite items return when someone sells.` : `**${item.nome}** acabou no mercado. Itens finitos voltam quando alguém vende.`, colour: COR.aviso });
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
        `${RARIDADE_INFO[item.raridade]?.emoji ?? ""} **${item.nome}** — ${descreverItem(item, true)}`,
        `Paid ${pag.moeda.simbolo}${fmt(pag.custo)} · ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))} left`,
        pag.convertido ? `_(the price was ${moeda.simbolo}${fmt(preco)}; paid in ${pag.moeda.nome} at today's rate)_` : "",
        "",
        `_Equip it with \`${P}game equipar ${item.nome}\`._`,
      ] : [
        `${RARIDADE_INFO[item.raridade]?.emoji ?? ""} **${item.nome}** — ${descreverItem(item, false)}`,
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
    if (item.especial || ["contrato", "pergaminho"].includes(item.slot)) {
      return sendEmbed(message.channel, { title: en ? "✦ The merchant doesn't buy that" : "✦ Isso o mercador não compra", colour: COR.aviso,
        description: en ? `Only another player. \`${P}game mercado vender ${item.nome} <price>\` · \`${P}game trocar\``
          : `Só outro jogador. \`${P}game mercado vender ${item.nome} <preço>\` · \`${P}game trocar\`` });
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

    return sendEmbed(message.channel, { title: en ? "💵 Sold" : "💵 Vendido",
      description: (en ? [
        `**${item.nome}** → ${moeda.simbolo}${fmt(pago)}`,
        `_The market sells for ${moeda.simbolo}${fmt(precoVenda)}; with your Charisma (${attr.carisma}) you got ${(MERC.fatorRecompra(attr.carisma) * 100).toFixed(0)}%._`,
        slot ? "\n_It was equipped — I unequipped it._" : "",
      ] : [
        `**${item.nome}** → ${moeda.simbolo}${fmt(pago)}`,
        `_O mercado vende por ${moeda.simbolo}${fmt(precoVenda)}; com seu Carisma (${attr.carisma}) você tirou ${(MERC.fatorRecompra(attr.carisma) * 100).toFixed(0)}%._`,
        slot ? "\n_Estava equipado — foi desequipado._" : "",
      ]).filter(Boolean).join("\n"), colour: COR.sucesso });
  }

  // ── resetar pontos (respec, pago) — 2 out 2026 ──
  // Devolve todos os pontos gastos para redistribuir. Os atributos voltam à
  // base do nível (1 + 1 a cada 2 níveis) e o que estava acima disso vira
  // ponto livre de novo. Custa Ouro (cresce com o nível e segue o P, como
  // tudo no mercado) — o dinheiro volta para o banco.
  if (["resetar", "respec", "redistribuir", "reset"].includes(sub) && ["pontos", "points", "atributos"].includes(String(args[1] ?? "").toLowerCase())) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem", description: `\`${P}game criar\``, colour: COR.aviso });
    const base = 1 + baseDoNivel(p.nivel ?? 1);
    let devolver = 0;
    for (const a of db.ATRIBUTOS) devolver += Math.max(0, (p[a] ?? 1) - base);
    const moeda = garantirMoeda(serverId);
    const { pSuave } = pDaMoeda(serverId, moeda);
    const preco = Math.max(1, Math.round(RESPEC_POR_NIVEL * (p.nivel ?? 1) * MERC.mult(pSuave)));
    if (!devolver) {
      return sendEmbed(message.channel, { title: en ? "🔄 Nothing to reset" : "🔄 Nada para resetar", colour: COR.info,
        description: en ? "You haven't spent any points above your level's base." : "Você não gastou nenhum ponto acima da base do seu nível." });
    }
    if (!args.slice(2).some((x) => ["confirmar", "confirm"].includes(String(x).toLowerCase()))) {
      return sendEmbed(message.channel, { title: en ? "🔄 Reset points" : "🔄 Resetar pontos", colour: COR.aviso, description: [
        en ? `All attributes go back to the level-${p.nivel} base (**${base}** each) and **${devolver}** point(s) come back to spend again.`
          : `Todos os atributos voltam à base do nível ${p.nivel} (**${base}** cada) e **${devolver}** ponto(s) voltam para você gastar de novo.`,
        en ? `**Price:** ${moeda.simbolo} ${fmt(preco)} ${moeda.nome} · you have ${fmt(db.getSaldo(serverId, eu, moeda.id))}`
          : `**Preço:** ${moeda.simbolo} ${fmt(preco)} ${moeda.nome} · você tem ${fmt(db.getSaldo(serverId, eu, moeda.id))}`,
        "",
        `\`${P}game resetar pontos confirmar\``,
      ].join("\n") });
    }
    if (db.getSaldo(serverId, eu, moeda.id) < preco) {
      return sendEmbed(message.channel, { title: en ? "🔄 Not enough" : "🔄 Não dá ainda", colour: COR.aviso,
        description: en ? `It costs ${moeda.simbolo} ${fmt(preco)}; you have ${fmt(db.getSaldo(serverId, eu, moeda.id))}.` : `Custa ${moeda.simbolo} ${fmt(preco)}; você tem ${fmt(db.getSaldo(serverId, eu, moeda.id))}.` });
    }
    jogadorPaga(serverId, eu, moeda, preco);
    const campos = { pontos: (p.pontos ?? 0) + devolver };
    for (const a of db.ATRIBUTOS) campos[a] = base;
    db.salvarPersonagem(serverId, eu, campos);
    return sendEmbed(message.channel, { title: en ? "🔄 Points reset" : "🔄 Pontos resetados", colour: COR.sucesso, description: en
      ? `**${devolver}** point(s) back — **${fmt(campos.pontos)}** free now. \`${P}game pontos <attribute> [how many]\``
      : `**${devolver}** ponto(s) de volta — **${fmt(campos.pontos)}** livres agora. \`${P}game pontos <atributo> [quantos]\`` });
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
        const preco = Math.round(f.preco * MERC.mult(pSuave) * desconto);
        return `${r.emoji ?? ""}${cls.emoji ?? ""} **${f.nome}** _(${en ? cls.rotuloEN : cls.rotulo})_ — ${moeda.simbolo}${fmt(preco)}`;
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
    if (cat.dados?.unico) {
      return sendEmbed(message.channel, { title: en ? "✦ Not for hire" : "✦ Não se contrata", colour: COR.aviso,
        description: en ? `**${cat.nome}** only comes as a contract, once per person — \`${P}game chefes\` · \`${P}game especiais\`.` : `**${cat.nome}** só sai como contrato, uma vez por pessoa — \`${P}game chefes\` · \`${P}game especiais\`.` });
    }
    if (cat.soDungeon || !cat.preco) {
      return sendEmbed(message.channel, { title: en ? "🗝️ Not for sale" : "🗝️ Não está à venda",
        description: en ? `**${cat.nome}** only shows up as dungeon loot.` : `**${cat.nome}** só aparece como loot de dungeon.`, colour: COR.aviso });
    }
    const preco = Math.round(cat.preco * MERC.mult(pSuave) * desconto);
    const pag = moedaParaPagar(serverId, eu, preco);
    if (pag.semSaldo) {
      const carteira = db.carteiraDe(serverId, eu)
        .map((c) => { const m = db.getMoeda(serverId, c.moedaId); return `${m?.simbolo ?? ""}${fmt(c.quantidade)}`; })
        .join(" · ") || "nada";
      return sendEmbed(message.channel, { title: en ? "💸 Not enough balance" : "💸 Saldo insuficiente",
        description: en ? `**${cat.nome}** costs ${moeda.simbolo}${fmt(preco)}.\nYou have: ${carteira}.` : `**${cat.nome}** custa ${moeda.simbolo}${fmt(preco)}.\nVocê tem: ${carteira}.`, colour: COR.erro });
    }
    jogadorPaga(serverId, eu, pag.moeda, pag.custo);
    db.recrutarFollower(serverId, eu, cat.id, p.nivel);
    const cls = FOL.CLASSES[cat.classe] ?? {};
    return sendEmbed(message.channel, { title: en ? "🤝 Hired" : "🤝 Contratado",
      description: (en ? [
        `${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotuloEN}, lv ${p.nivel})_ joined your group.`,
        `Paid ${pag.moeda.simbolo}${fmt(pag.custo)} · ${pag.moeda.simbolo}${fmt(db.getSaldo(serverId, eu, pag.moeda.id))} left`,
        pag.convertido ? `_(the price was ${moeda.simbolo}${fmt(preco)}; paid in ${pag.moeda.nome})_` : "",
        "",
        `_Take them along with \`${P}game follower levar ${cat.nome}\`._`,
      ] : [
        `${cls.emoji ?? ""} **${cat.nome}** _(${cls.rotulo}, nv ${p.nivel})_ entrou para o seu grupo.`,
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
    const custo = Math.max(1, Math.round(faltando * 25 * MERC.mult(pSuave)));
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
      title: en ? "❌ Not among yours" : "❌ Não é um dos seus",
      description: en
        ? `I couldn't find **${texto}** among your companions. See them with \`${P}game followers\`.`
        : `Não achei **${texto}** entre os seus companheiros. Veja com \`${P}game followers\`.`,
      colour: COR.erro });

    if (["ficha", "status", "ver", "sheet", "info"].includes(acao)) {
      const todosMeus = db.listarFollowersDe(serverId, eu);
      if (!resto && todosMeus.length !== 1) {
        const nomes = todosMeus.map((x) => `\`${P}game follower ficha ${db.getFollowerCatalogo(x.catalogoId)?.nome ?? "?"}\``);
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Qual companheiro?",
            description: todosMeus.length ? nomes.join("\n") : `Você ainda não tem companheiros — \`${P}game recrutas\`.`, colour: COR.erro },
          { title: "❌ Which companion?",
            description: todosMeus.length ? nomes.join("\n") : `You have no companions yet — \`${P}game recrutas\`.`, colour: COR.erro }));
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
        `${rar.emoji ?? ""}${cls.emoji ?? ""} **${cat?.nome ?? "?"}**${d.unico ? " ✦" : ""} — ${en ? cls.rotuloEN : cls.rotulo} · ${en ? "level" : "nível"} ${p.nivel}`,
        `${rar.emoji ?? ""} ${rotuloRaridade(cat?.raridade, en)} · ${en ? cls.descEN : cls.desc}${d.obra ? ` · _${d.obra}_` : ""}${d.tier ? ` · tier ${d.tier}` : ""}`,
        d.descricao ? `_${en ? d.descricao.en : d.descricao.pt}_` : null,
        "",
        `⚡ **${en ? "Energy" : "Energia"}:** ${energia}/${ENERGIA_MAX}${energia < ENERGIA_MAX ? (en ? " _(+1 per hour)_" : " _(+1 por hora)_") : ""}`,
        `🎒 **${en ? "In the party" : "Na party"}:** ${f.naParty ? (en ? "yes" : "sim") : (en ? "no" : "não")}`,
        magia ? `✦ **${en ? "Spell" : "Magia"}:** ${en ? magia.nomeEN ?? magia.nome : magia.nome} — ${magia.custo} 🔷 · +${(magia.poder * 100).toFixed(0)}%` : null,
        `⚔️ **${en ? "Attack" : "Ataque"}** ${fmt(R.poderMembro(membro))} · 🛡️ **${en ? "Defense" : "Defesa"}** ${fmt(R.defesaMembro(membro))}`,
        "",
        en ? "**Attributes** _(they rise with you — the class kit is already in them)_" : "**Atributos** _(sobem com você — o kit da classe já está neles)_",
        ...linhasAttr,
      ];
      return enviarLista(sendEmbed, message.channel, {
        titulo: en ? "👤 Companion" : "👤 Companheiro", linhas: linhas.filter((x) => x !== null), colour: COR.info,
        imagem: IMG.imagemDe(cat?.id) });
    }

    // ── D23: companheiro não usa item (o kit da classe já está no ganho por nível) ──
    if (["dar", "equipar", "give", "equip", "mochila", "inventario", "inventário", "bag", "pegar", "retomar", "take", "desequipar"].includes(acao)) {
      return sendEmbed(message.channel, { title: en ? "🎒 Companions don't use items" : "🎒 Companheiro não usa item", colour: COR.info,
        description: en ? "Every companion is a complete kit: what gear would give is already in the gain per level, and they rise with your level. Items are for you."
          : "Todo companheiro já é um kit completo: o que o equipamento daria está no ganho por nível, e ele sobe com o seu nível. Os itens são para você." });
    }
    // contrato de companheiro único (ESPECIAIS §1.2)
    if (["contratar", "assinar", "hire"].includes(acao)) return cmdGame(message, ["usar", ...args.slice(2)], ctx);

    // ── levar / tirar da party ──
    if (["levar", "adicionar", "party+"].includes(acao)) {
      const alvo = acharMeu(resto);
      if (!resto || !alvo) {
        return sendEmbed(message.channel, { title: en ? "❌ Take who?" : "❌ Levar quem?",
          description: en
            ? `\`${P}game follower levar <name>\`\n\nSee yours with \`${P}game followers\`.`
            : `\`${P}game follower levar <nome>\`\n\nVeja os seus com \`${P}game followers\`.`, colour: COR.erro });
      }
      if (alvo.naParty) {
        return sendEmbed(message.channel, { title: en ? "🎒 Already in the party" : "🎒 Já está na party",
          description: descreverFollower(alvo, en, p?.nivel), colour: COR.aviso });
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
          description: en ? `${descreverFollower(alvo, en, p?.nivel)}\n\nThey need rest — energy returns over time (1 per hour).` : `${descreverFollower(alvo, en, p?.nivel)}\n\nPrecisa descansar — a energia volta com o tempo (1 por hora).`,
          colour: COR.aviso });
      }
      db.salvarFollower(alvo.id, { naParty: 1 });
      return sendEmbed(message.channel, { title: en ? "🎒 Joined the party" : "🎒 Entrou na party",
        description: en ? `${descreverFollower(db.getFollower(alvo.id), en, p?.nivel)}\n\n_They spend 1 energy per dungeon mission._` : `${descreverFollower(db.getFollower(alvo.id), en, p?.nivel)}\n\n_Ele gasta 1 de energia por missão de dungeon._`,
        colour: COR.sucesso });
    }

    if (["tirar", "remover", "party-"].includes(acao)) {
      const naParty = db.getParty(serverId, eu);
      const alvo = (resto ? acharMeu(resto, naParty) : null) ?? (naParty.length === 1 && !resto ? naParty[0] : null);
      if (!alvo) {
        return sendEmbed(message.channel, { title: en ? "❌ Remove who?" : "❌ Tirar quem?",
          description: naParty.length
            ? (en ? `\`${P}game follower tirar <name>\`` : `\`${P}game follower tirar <nome>\``)
            : (en ? "Your party is empty." : "Sua party está vazia."),
          colour: COR.erro });
      }
      db.salvarFollower(alvo.id, { naParty: 0 });
      return sendEmbed(message.channel, { title: en ? "👋 Left the party" : "👋 Saiu da party",
        description: descreverFollower(db.getFollower(alvo.id), en, p?.nivel), colour: COR.mod });
    }

    // ── dispensar ──
    if (["dispensar", "demitir"].includes(acao)) {
      const alvo = acharMeu(resto);
      if (!resto || !alvo) {
        return sendEmbed(message.channel, { title: en ? "❌ Dismiss who?" : "❌ Dispensar quem?",
          description: en ? `\`${P}game follower dispensar <name>\`` : `\`${P}game follower dispensar <nome>\``, colour: COR.erro });
      }
      const nome = db.getFollowerCatalogo(alvo.catalogoId)?.nome ?? "?";
      db.dispensarFollower(alvo.id);
      return sendEmbed(message.channel, { title: en ? "👋 Dismissed" : "👋 Dispensado",
        description: en ? `**${nome}** went their own way.` : `**${nome}** seguiu seu caminho.`, colour: COR.mod });
    }

    // ── foto: a imagem que o dono ligou ao companheiro (&game admin imagem) ──
    if (["fotos", "foto", "album", "álbum"].includes(acao)) {
      const cat = db.acharFollowerCatalogo(resto);
      if (!cat) {
        return sendEmbed(message.channel, { title: en ? "❌ Who?" : "❌ Quem?",
          description: en ? `\`${P}game follower foto <name>\`` : `\`${P}game follower foto <nome>\``, colour: COR.erro });
      }
      const img = IMG.imagemDe(cat.id) ?? cat.fotos?.[0] ?? null;
      return sendEmbed(message.channel, { title: `📷 ${cat.nome}`, colour: COR.info,
        description: img ? "" : (en ? "_No picture yet._" : "_Ainda sem imagem._"), ...(img ? { imagem: img } : {}) });
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
          "Eles aparecem como **loot de dungeon** — e os que têm preço também se",
          "contratam como mercenários (\`" + P + "game contratar\`).",
          "",
          `_Veja quem existe com \`${P}game recrutas\`._`,
        ]).join("\n"), colour: COR.info });
    }
    const linhas = [];
    if (naParty.length) {
      linhas.push(en ? `🎒 **In the party (${naParty.length}/2)**` : `🎒 **Na party (${naParty.length}/2)**`);
      for (const f of naParty) linhas.push(`   ${descreverFollower(f, en, p?.nivel)}`);
      linhas.push("");
    }
    const fora = meus.filter((f) => !f.naParty);
    if (fora.length) {
      linhas.push(en ? "**Available**" : "**Disponíveis**");
      for (const f of fora) linhas.push(`   ${descreverFollower(f, en, p?.nivel)}`);
    }
    linhas.push("", en
      ? `_\`${P}game follower ficha <name>\` — attributes and spell_`
      : `_\`${P}game follower ficha <nome>\` — atributos e magia_`,
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
      linhas.push(`${cls.emoji} **${en ? cls.rotuloEN : cls.rotulo}** — ${en ? cls.descEN : cls.desc} · ${en ? "spell" : "magia"}: _${cls.magia.nome}_`);
      for (const f of grupo.sort((a, b) => R.ORDEM.indexOf(a.raridade) - R.ORDEM.indexOf(b.raridade))) {
        const r = RARIDADE_INFO[f.raridade] ?? {};
        const onde = f.dados?.unico ? (en ? "✦ contract (boss or special mission)" : "✦ contrato (chefe ou missão especial)")
          : f.soDungeon ? (en ? "🗝️ loot" : "🗝️ loot") : `💰 ${f.preco}`;
        linhas.push(`   ${r.emoji ?? ""} ${f.nome}${f.dados?.obra ? ` _(${f.dados.obra})_` : ""} — ${onde}`);
      }
      linhas.push("");
    }
    linhas.push(en
      ? "_🗝️ = shows up as loot (dungeons, contracts, bosses) · 💰 = hireable (`&game contratar`) · ✦ = unique, one per player. Companions rise with your level and use no items._"
      : "_🗝️ = aparece como loot (dungeons, contratos, chefes) · 💰 = contratável (`&game contratar`) · ✦ = único, um por jogador. Companheiros sobem com o seu nível e não usam item._");
    return enviarLista(sendEmbed, message.channel, {
      titulo: en ? "📜 Companions that exist" : "📜 Companheiros que existem", linhas, colour: COR.info });
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
      ? `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — level ${x.nivel} (${Math.round((x.progresso ?? 0) * 100)}%)`
      : `${medalha[i] ?? `\`${i + 1}\``} **${x.nome ?? "?"}** — nível ${x.nivel} (${Math.round((x.progresso ?? 0) * 100)}%)`);
    return sendEmbed(message.channel, {
      title: en ? "🏆 Adventurers of the world" : "🏆 Aventureiros do mundo",
      description: linhas.join("\n"), colour: COR.info });
  }

  // ── classe do jogador (D24): só um perfil para o evolucionador, sem bônus ──
  if (["classe", "class"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem", colour: COR.aviso, description: `\`${P}game criar\`` });
    const escolhida = EV.acharClasse(args.slice(1).join(" "));
    if (args[1] && !escolhida) return sendEmbed(message.channel, { title: en ? "❌ Unknown class" : "❌ Classe desconhecida", colour: COR.erro, description: `\`${P}game classe\`` });
    if (escolhida) {
      db.salvarPersonagem(serverId, eu, { classe: escolhida });
      const c = EV.CLASSES_JOGADOR[escolhida];
      return sendEmbed(message.channel, { title: `${c.emoji} ${en ? c.rotuloEN : c.rotulo}`, colour: COR.sucesso,
        description: en ? `Class chosen. It's only a profile — no bonus. Now \`${P}game evoluir\` spends your points and equips the best of your bag for you (\`${P}game evoluir prever\` shows it first).`
          : `Classe escolhida. É só um perfil — não dá bônus. Agora \`${P}game evoluir\` gasta seus pontos e equipa o melhor da mochila por você (\`${P}game evoluir prever\` mostra antes).` });
    }
    const A = (k) => (en ? ATRIB[k].abrevEN : ATRIB[k].abrev);
    const linhas = [en ? "Pick what you want to be — the **auto-evolve** (`&game evoluir`) spends points and equips the bag by it. No bonus: it's only a profile." : "Escolha o que quer ser — o **evoluir automático** (`&game evoluir`) gasta pontos e equipa a mochila por ela. Sem bônus: é só um perfil.", ""];
    for (const [k, c] of Object.entries(EV.CLASSES_JOGADOR)) {
      const dist = Object.entries(c.dist).map(([a, f]) => `${A(a)} ${Math.round(f * 100)}`).join(" · ");
      linhas.push(`${c.emoji} **${en ? c.rotuloEN : c.rotulo}**${p.classe === k ? " ✅" : ""} — ${dist}${c.escudo ? (en ? " · shield" : " · escudo") : ""}`);
    }
    linhas.push("", `\`${P}game classe <${en ? "name" : "nome"}>\``);
    return sendEmbed(message.channel, { title: en ? "🧭 Classes" : "🧭 Classes", description: linhas.join("\n"), colour: COR.info });
  }

  // ── evoluir automático (D24) ──
  if (["evoluir", "evolve", "auto"].includes(sub)) {
    const p = db.getPersonagem(serverId, eu);
    if (!p) return sendEmbed(message.channel, { title: en ? "🎭 No character" : "🎭 Sem personagem", colour: COR.aviso, description: `\`${P}game criar\`` });
    if (!p.classe) return cmdGame(message, ["classe"], ctx);
    const op = String(args[1] ?? "").toLowerCase();
    if (op === "auto") {
      const liga = !["off", "desligar", "nao", "não", "0"].includes(String(args[2] ?? "on").toLowerCase());
      db.salvarPersonagem(serverId, eu, { evoluirAuto: liga ? 1 : 0 });
      return sendEmbed(message.channel, { title: "⚙️", colour: COR.sucesso, description: liga
        ? (en ? "Auto-evolve **on**: at every new level and whenever an item enters your bag." : "Evoluir automático **ligado**: a cada nível novo e quando entrar item na mochila.")
        : (en ? "Auto-evolve **off**." : "Evoluir automático **desligado**.") });
    }
    if (op === "refazer") return cmdGame(message, ["resetar", "pontos", ...args.slice(2)], ctx);
    const prever = ["prever", "preview", "simular"].includes(op);
    const r = EV.evoluir(eu, { pontos: op !== "equipar", equipar: op !== "pontos", gravar: !prever });
    const c = r.cls, A = (k) => (en ? ATRIB[k].rotuloEN : ATRIB[k].rotulo);
    const linhas = [];
    const gastos = Object.entries(r.gastos ?? {});
    linhas.push(en ? `📈 **Points**` : `📈 **Pontos**`);
    linhas.push(gastos.length ? gastos.map(([k, n]) => `${A(k)} ${r.attrAntes[k]} → ${r.attr[k]}`).join(" · ") : (en ? "_no free points_" : "_nenhum ponto livre_"));
    linhas.push("", en ? "⚔️ **Gear**" : "⚔️ **Equipamento**");
    if (r.trocas.length) for (const t of r.trocas) linhas.push(`${SLOT_INFO[t.slot]?.emoji ?? "•"} ${rotuloSlot(t.slot, en)}: ${t.saiu?.nome ?? "—"} → **${t.entrou?.nome ?? "—"}**`);
    else linhas.push(en ? "_what you wear is already the best in your bag_" : "_o que você usa já é o melhor da mochila_");
    if (r.trocas.some((t) => t.saiu)) linhas.push(en ? "_What came off went back to the bag._" : "_O que saiu voltou para a mochila._");
    linhas.push("", en ? `🎯 **A contract of your level:** win ${pct(r.antes.exitoReal)} → ${pct(r.depois.exitoReal)} · survive ${pct(r.antes.sobrevReal)} → ${pct(r.depois.sobrevReal)}${r.depois.sinergia > 0.005 ? ` · synergy +${pct(r.depois.sinergia)}` : ""}`
      : `🎯 **Um contrato do seu nível:** vencer ${pct(r.antes.exitoReal)} → ${pct(r.depois.exitoReal)} · sobreviver ${pct(r.antes.sobrevReal)} → ${pct(r.depois.sobrevReal)}${r.depois.sinergia > 0.005 ? ` · sinergia +${pct(r.depois.sinergia)}` : ""}`);
    if (prever) linhas.push("", en ? `_Preview only — nothing changed. \`${P}game evoluir\` applies it._` : `_Só a prévia — nada mudou. \`${P}game evoluir\` aplica._`);
    else if (!p.evoluirAuto) linhas.push("", en ? `_\`${P}game evoluir auto on\` does this by itself at every level._` : `_\`${P}game evoluir auto on\` faz isso sozinho a cada nível._`);
    return sendEmbed(message.channel, { title: `⚙️ ${prever ? (en ? "Evolve (preview)" : "Evoluir (prévia)") : (en ? "Evolve" : "Evoluir")} — ${en ? c.rotuloEN : c.rotulo} · ${en ? "level" : "nível"} ${p.nivel}`,
      description: linhas.join("\n"), colour: COR.sucesso });
  }

  // ── ajuda ──
  if (["ajuda", "help", "comandos"].includes(sub)) {
    return sendEmbed(message.channel, en ? {
      title: "🎲 RPG — commands",
      description: [
        `\`${P}game criar [name]\` — creates your character · \`${P}game\` — your sheet · \`${P}game ficha @person\``,
        `\`${P}game pontos <attribute> [how many]\` · \`${P}game classe\` · \`${P}game evoluir\` — spends points and equips for you`,
        `\`${P}game itens\` · \`${P}game equipar <item> [mao1|mao2]\` · \`${P}game usar <contract|scroll>\` · \`${P}game desequipar <slot>\``,
        `\`${P}game catalogo [rarity|slot]\` · \`${P}game item <name>\` · \`${P}game comprar [rarity|item]\``,
        `\`${P}game magias\` · \`${P}game aprender <name>\` — the grimoire`,
        `\`${P}game contratos\` — the guild board · \`${P}game dungeons\` · \`${P}game chefes\` · \`${P}game especiais\``,
        `\`${P}game coop abrir <…>\` — together, up to 4 · \`${P}game historia\` — your last story`,
        `\`${P}game followers\` · \`${P}game follower ficha <name>\` · \`${P}game recrutas\``,
        `\`${P}game top\` — ranking of the whole world · \`${P}game apagar confirmar\` — starts over`,
        "",
        "**Attributes:** " + Object.values(ATRIB).map((a) => a.rotuloEN).join(", "),
        "",
        "_A mission pays its strength, the same for everyone: one win at your level is 80% of a level. A failure pays nothing._",
      ].join("\n"), colour: COR.info,
    } : {
      title: "🎲 RPG — comandos",
      description: [
        `\`${P}game criar [nome]\` — cria seu personagem · \`${P}game\` — sua ficha · \`${P}game ficha @pessoa\``,
        `\`${P}game pontos <atributo> [quantos]\` · \`${P}game classe\` · \`${P}game evoluir\` — gasta os pontos e equipa por você`,
        `\`${P}game itens\` · \`${P}game equipar <item> [mao1|mao2]\` · \`${P}game usar <contrato|pergaminho>\` · \`${P}game desequipar <vaga>\``,
        `\`${P}game catalogo [raridade|vaga]\` · \`${P}game item <nome>\` · \`${P}game comprar [raridade|item]\``,
        `\`${P}game magias\` · \`${P}game aprender <nome>\` — o grimório`,
        `\`${P}game contratos\` — o quadro da guilda · \`${P}game dungeons\` · \`${P}game chefes\` · \`${P}game especiais\``,
        `\`${P}game coop abrir <…>\` — em grupo, até 4 · \`${P}game historia\` — sua última história`,
        `\`${P}game followers\` · \`${P}game follower ficha <nome>\` · \`${P}game recrutas\``,
        `\`${P}game top\` — ranking do mundo inteiro · \`${P}game apagar confirmar\` — recomeça do zero`,
        "",
        "**Atributos:** " + Object.values(ATRIB).map((a) => a.rotulo).join(", "),
        "",
        "_A missão paga a força dela, igual para todos: um êxito no seu nível vale 80% de um nível. Falhar não paga nada._",
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
    description: montarFicha(p, P, serverId, id, lang),
    colour: COR.info });
}
