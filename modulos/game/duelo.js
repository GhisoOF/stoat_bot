// Duelo entre jogadores (PvP) — pedido de Ghieh, 28 out 2026; simplificado no P2
// (31 out 2026): só entre membros do MESMO servidor, só a pessoa desafiada aceita
// (✅ na mensagem ou `&game duelo aceitar`), e a aposta é só Ouro, inteiro.
//
//   &game duelo @pessoa [quantia]     desafia (a quantia fica em custódia)
//   &game duelo aceitar | recusar     a pessoa desafiada
//   &game duelo cancelar              quem desafiou
//
// A luta é 1 contra 1: o PERSONAGEM, com atributos, equipamento, implantes e as
// magias que a Mana dele paga — os aliados ficam de fora. O poder e a
// resiliência saem das fórmulas das missões (regras.js); a luta vira golpes
// alternados com um d20: 1–3 erra, 20 é crítico. Quem perde só perde a aposta.
// A Sorte não entra (é luta, como as missões).
//
// A custódia é a tabela de ofertas (tipo "duelo", serverId = a era; o servidor
// de origem fica em `itemPedido`). Recusa, cancelamento ou 10 min sem resposta
// devolvem a aposta.

import * as db from "../core/db.js";
import { registrarErro } from "../core/erros.js";
import { carimbo } from "../core/tempo.js";
import { quantiaValida } from "../core/seguranca.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import * as TS from "./tesouro.js";
import { ERA } from "./era.js";
import { T, cmd, fmt, enviar } from "./telas.js";

export const VALIDADE_MS = 10 * 60_000;
export const GOLPES_MAX = 30;
export const GOLPES_ALVO = 5;   // dois iguais se derrubam em uns 5 golpes cada
export const ACOES = { aceitar: "aceitar", recusar: "recusar", cancelar: "cancelar" };

// ── A luta ───────────────────────────────────────────────────────────────────
export function lado(uid) {
  const pt = CB.partyDe(ERA, uid);
  if (!pt) return null;
  const { usadas } = R.magiasAtivas(pt.doGrimorio, R.attrEf(pt.jogador).mana ?? 0);
  const membros = [pt.jogador];
  return { uid, nome: pt.p.nome, nivel: pt.p.nivel ?? 1,
    poder: Math.max(1, R.poderParty(membros, usadas, { comSinergia: true })), resil: Math.max(1, R.resilParty(membros, usadas)),
    agilidade: pt.attr.agilidade ?? 0, magias: usadas.length };
}
const d20 = (aleatorio) => 1 + Math.floor(aleatorio() * 20);
export function simular(a, b, aleatorio = Math.random) {
  const lados = [a, b];
  const escala = GOLPES_ALVO * (a.poder + b.poder) / (a.resil + b.resil);
  const vidaMax = lados.map((x) => x.resil * escala), vida = [...vidaMax];
  const ini = lados.map((x) => (x.agilidade ?? 0) + d20(aleatorio));
  let vez = ini[1] > ini[0] ? 1 : 0;
  const primeiro = vez, golpes = [];
  while (golpes.length < GOLPES_MAX && vida[0] > 0 && vida[1] > 0) {
    const alvo = 1 - vez, dado = d20(aleatorio);
    let dano = 0, tipo = "acerto";
    if (dado <= 3) tipo = "erro";
    else { dano = lados[vez].poder * (0.8 + 0.4 * (dado - 4) / 16); if (dado === 20) { dano *= 1.75; tipo = "critico"; } }
    vida[alvo] = Math.max(0, vida[alvo] - dano);
    golpes.push({ quem: vez, alvo, dado, tipo, dano, resta: vida[alvo] / vidaMax[alvo] });
    vez = alvo;
  }
  const fracao = vida.map((v, i) => v / vidaMax[i]);
  return { vencedor: fracao[0] === fracao[1] ? null : fracao[0] > fracao[1] ? 0 : 1, golpes, fracao, primeiro, nocaute: fracao.some((f) => f <= 0) };
}
// Um gerador com semente: a chance mostrada não muda a cada olhada
export function semente(n) {
  let s = n >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function chance(a, b, vezes = 400) {
  const r = semente(7919);
  let ganhaA = 0;
  for (let i = 0; i < vezes; i++) if (simular(a, b, r).vencedor === 0) ganhaA++;
  return ganhaA / vezes;
}

// ── A aposta ─────────────────────────────────────────────────────────────────
// ["<@ID>", "100"] → { alvoId, qtd, sobra }. Só Ouro, inteiro ≥ 1 ("0.5", "1e3", "-2" não valem).
export function lerDesafio(args, mentionIds = []) {
  let alvoId = null, qtd = 0;
  const sobra = [];
  for (const t of args.map(String)) {
    const m = t.match(/^<@!?([0-9A-HJKMNP-TV-Z]{26})>$/i) ?? t.match(/^([0-9A-HJKMNP-TV-Z]{26})$/i);
    if (m && !alvoId) { alvoId = m[1].toUpperCase(); continue; }
    if (!qtd && /^\d+$/.test(t) && quantiaValida(Number(t))) { qtd = Number(t); continue; }
    if (qtd && /^(ouro|gold|oro|🪙)$/i.test(t)) continue;
    sobra.push(t);
  }
  return { alvoId: alvoId ?? mentionIds?.[0] ?? null, qtd, sobra };
}
function devolver(of, estado = "cancelada") {
  if (of.estado !== "aberta") return false;
  db.fecharOferta(of.id, estado);
  // quem desafiou e apagou o personagem não recebe nada (o ouro iria para uma carteira sem dono)
  if (!db.getPersonagem(ERA, of.autorId)) return true;
  if (of.moedaOferecida && of.qtdOferecida > 0) db.creditar(ERA, of.autorId, of.moedaOferecida, of.qtdOferecida);
  if (of.itemOferecido) db.darItem(ERA, of.autorId, of.itemOferecido);
  return true;
}
export const abertos = () => db.listarOfertas(ERA, { tipo: "duelo" });
export const servidorDoDuelo = (of) => of?.itemPedido ?? null;
// Os desafios vencidos devolvem a aposta (chamado a cada &game)
export function expirar(agora = Date.now()) {
  let n = 0;
  for (const of of abertos()) if (agora - of.criadoEm > VALIDADE_MS && devolver(of, "expirada")) n++;
  return n;
}
const MENSAGENS = new Map();   // id da mensagem do desafio → { oferta, ctx, canal, l }

// A luta valendo: quem desafiou × quem aceitou. → o embed
function lutarValendo(of, uidAceita, l, COR, aleatorio = Math.random) {
  const eles = lado(of.autorId), meu = lado(uidAceita);
  if (!eles) { devolver(of); return { title: "❌", colour: COR.erro, description: T(l, "Quem desafiou não tem mais personagem.", "The challenger no longer has a character.", "Quien desafió ya no tiene personaje.") }; }
  const q = of.qtdOferecida > 0 ? of.qtdOferecida : 0;
  if (q && TS.saldo(uidAceita) < q) return { title: "❌", colour: COR.erro, description: T(l, `A aposta é 🪙 ${fmt(q, l)}.`, `The bet is 🪙 ${fmt(q, l)}.`, `La apuesta es 🪙 ${fmt(q, l)}.`) };
  // fecha ANTES de lutar: dois "aceitar" ao mesmo tempo não lutam duas vezes
  db.fecharOferta(of.id, "lutando");
  if (q) db.debitar(ERA, uidAceita, TS.MOEDA, q);
  const lados = [eles, meu];
  let r;
  try { r = simular(eles, meu, aleatorio); }
  catch (e) {
    if (q) { db.creditar(ERA, of.autorId, TS.MOEDA, q); db.creditar(ERA, uidAceita, TS.MOEDA, q); }
    db.fecharOferta(of.id, "cancelada");
    registrarErro("DUELO", e);
    return { title: "❌", colour: COR.erro, description: T(l, "A luta deu erro — as apostas voltaram.", "The fight hit an error — the bets came back.", "La pelea dio un error — las apuestas volvieron.") };
  }
  let fim;
  if (r.vencedor === null) {
    if (q) { db.creditar(ERA, of.autorId, TS.MOEDA, q); db.creditar(ERA, uidAceita, TS.MOEDA, q); }
    db.fecharOferta(of.id, "empate");
    fim = T(l, "🤝 **Empate**", "🤝 **Draw**", "🤝 **Empate**");
  } else {
    const g = lados[r.vencedor];
    if (q) db.creditar(ERA, g.uid, TS.MOEDA, q * 2);
    db.fecharOferta(of.id, "fechada", q * 2);
    fim = `🏆 **${g.nome}** (<@${g.uid}>)${q ? ` · 🪙 +${fmt(q * 2, l)}` : ""}`;
  }
  return { title: `⚔️ ${eles.nome} × ${meu.nome}`, colour: r.vencedor === null ? COR.info : COR.sucesso, description: [...linhasDaLuta(r, lados, l), "", fim].join("\n") };
}
// ✅ da pessoa desafiada na mensagem do desafio
export async function aoReagir(msgId, userId, emoji) {
  const d = MENSAGENS.get(msgId);
  if (!d) return false;
  let e = String(emoji ?? "");
  try { e = decodeURIComponent(e); } catch (erro) { e = String(emoji ?? ""); }
  const of = db.getOferta(d.oferta);
  if (!of || of.estado !== "aberta") { MENSAGENS.delete(msgId); return true; }
  if (e !== "✅" || userId !== of.alvoId) return true;
  MENSAGENS.delete(msgId);
  await enviar(d.ctx, d.canal, d.l, lutarValendo(of, userId, d.l, d.ctx.COR));
  return true;
}

// ── O comando ────────────────────────────────────────────────────────────────
export async function cmdDuelo(message, args, ctx, l) {
  const { COR, PREFIXO: P } = ctx;
  const eu = message.authorId, sid = ctx.serverId ?? message.serverId ?? null;
  const acao = String(args[1] ?? "").toLowerCase();
  const erro = (desc) => enviar(ctx, message.channel, l, { title: "❌", colour: COR.erro, description: desc });
  expirar();

  if (acao === ACOES.cancelar) {
    const meus = abertos().filter((o) => o.autorId === eu);
    for (const of of meus) devolver(of);
    return enviar(ctx, message.channel, l, { title: "↩️", colour: COR.info,
      description: meus.length ? T(l, "Desafio cancelado.", "Challenge cancelled.", "Desafío cancelado.") : T(l, "Nenhum desafio seu aberto.", "No open challenge of yours.", "Ningún desafío tuyo abierto.") });
  }
  if (acao === ACOES.recusar || acao === ACOES.aceitar) {
    const of = abertos().filter((o) => o.alvoId === eu && servidorDoDuelo(o) === sid).at(-1);
    if (!of) return erro(T(l, "Ninguém desafiou você aqui.", "Nobody challenged you here.", "Nadie te desafió aquí."));
    for (const [id, d] of MENSAGENS) if (d.oferta === of.id) MENSAGENS.delete(id);
    if (acao === ACOES.recusar) {
      devolver(of, "recusada");
      return enviar(ctx, message.channel, l, { title: "🏳️", colour: COR.info, description: T(l, `<@${eu}> recusou.`, `<@${eu}> declined.`, `<@${eu}> lo rechazó.`) });
    }
    if (!lado(eu)) return erro(T(l, `Crie um personagem: \`${cmd(l, "game.criar", P)} <nome>\`.`, `Create a character: \`${cmd(l, "game.criar", P)} <name>\`.`, `Crea un personaje: \`${cmd(l, "game.criar", P)} <nombre>\`.`));
    return enviar(ctx, message.channel, l, lutarValendo(of, eu, l, COR, ctx._aleatorioDuelo ?? Math.random));
  }

  // ── desafiar ──
  const d = lerDesafio(args.slice(1), message.mentionIds);
  if (!d.alvoId || d.sobra.length) return erro(`\`${cmd(l, "game.duelo", P)} @${T(l, "pessoa", "person", "usuario")} [100]\` · \`${cmd(l, "help", P)} game\``);
  if (d.alvoId === eu) return erro(T(l, "Escolha outra pessoa.", "Pick someone else.", "Elige a otra persona."));
  if (!sid) return erro(T(l, "O duelo é dentro de um servidor.", "Duels happen inside a server.", "El duelo es dentro de un servidor."));
  const server = await Promise.resolve(ctx.getServer?.(message)).catch(() => null);
  const membro = await Promise.resolve(server?.fetchMember?.(d.alvoId)).catch(() => null);
  if (!membro) return erro(T(l, `<@${d.alvoId}> não está neste servidor.`, `<@${d.alvoId}> isn't on this server.`, `<@${d.alvoId}> no está en este servidor.`));
  const meu = lado(eu), alvo = lado(d.alvoId);
  if (!meu) return erro(T(l, `Crie um personagem: \`${cmd(l, "game.criar", P)} <nome>\`.`, `Create a character: \`${cmd(l, "game.criar", P)} <name>\`.`, `Crea un personaje: \`${cmd(l, "game.criar", P)} <nombre>\`.`));
  if (!alvo) return erro(T(l, `<@${d.alvoId}> não tem personagem.`, `<@${d.alvoId}> has no character.`, `<@${d.alvoId}> no tiene personaje.`));
  if (abertos().some((o) => o.autorId === eu)) return erro(T(l, `Um por vez — \`${cmd(l, "game.duelo.cancelar", P)}\`.`, `One at a time — \`${cmd(l, "game.duelo.cancelar", P)}\`.`, `Uno a la vez — \`${cmd(l, "game.duelo.cancelar", P)}\`.`));
  if (d.qtd && TS.saldo(eu) < d.qtd) return erro(T(l, `Você tem 🪙 ${fmt(TS.saldo(eu), l)}.`, `You have 🪙 ${fmt(TS.saldo(eu), l)}.`, `Tienes 🪙 ${fmt(TS.saldo(eu), l)}.`));
  TS.garantirOuro();
  if (d.qtd) db.debitar(ERA, eu, TS.MOEDA, d.qtd);
  const of = db.criarOferta({ serverId: ERA, tipo: "duelo", autorId: eu, alvoId: d.alvoId, itemPedido: sid, itemOferecido: null,
    moedaOferecida: d.qtd ? TS.MOEDA : null, qtdOferecida: d.qtd || 0 });
  const msg = await enviar(ctx, message.channel, l, { title: T(l, "⚔️ Desafio de duelo", "⚔️ Duel challenge", "⚔️ Desafío de duelo"), colour: COR.aviso ?? COR.info, description: [
    `<@${eu}> × <@${d.alvoId}>${d.qtd ? ` · 🪙 ${fmt(d.qtd, l)}` : ""} · ${Math.round(chance(meu, alvo) * 100)}% × ${100 - Math.round(chance(meu, alvo) * 100)}%`,
    `✅ <@${d.alvoId}> · ${T(l, "vale até", "valid until", "vale hasta")} ${carimbo(Date.now() + VALIDADE_MS, "t")}`,
  ].join("\n") });
  const id = msg?.id ?? msg?._id;
  if (id) {
    MENSAGENS.set(id, { oferta: of.id, ctx, canal: message.channel, l });
    setTimeout(() => MENSAGENS.delete(id), VALIDADE_MS).unref?.();
    try { await msg.react?.(encodeURIComponent("✅")); } catch (e) { registrarErro("DUELO", e); }
  }
  return msg;
}

// O relato: até 10 golpes (os 4 primeiros e os 5 últimos, se for longo) e as vidas
export function linhasDaLuta(r, lados, l) {
  const barra = (f) => { const n = Math.round(Math.max(0, Math.min(1, f)) * 10); return "▰".repeat(n) + "▱".repeat(10 - n); };
  const linha = (g) => {
    const a = lados[g.quem].nome, b = lados[g.alvo].nome;
    if (g.tipo === "erro") return `💨 ${a} ${T(l, "erra", "misses", "falla")}`;
    return `${g.tipo === "critico" ? "💥" : "⚔️"} ${a} → ${b}: −${fmt(g.dano, l)}${g.tipo === "critico" ? ` **${T(l, "crítico", "critical", "crítico")}**` : ""}`;
  };
  const g = r.golpes;
  const corpo = g.length <= 10 ? g.map(linha) : [...g.slice(0, 4).map(linha), `… ${g.length - 9} …`, ...g.slice(-5).map(linha)];
  return [...corpo, "", ...lados.map((x, i) => `${x.nome}: ${barra(r.fracao[i])} ${Math.round(r.fracao[i] * 100)}%`)];
}
