// Duelo entre jogadores (PvP) — pedido de Ghieh, 28 out 2026: "um player pode
// abrir um duelo e apostar algo, caso queira".
//
//   &game duelo @pessoa [<qtd> <moeda>] [item <nome>]   desafia (sem @: aberto a qualquer um DESTE servidor)
//   &game duelo aceitar [#] [item <nome>]               aceita — e a luta acontece na hora
//   &game duelo recusar [#] · &game duelo cancelar      ninguém perde nada
//   &game duelo                                         os duelos abertos
//
// Decisões (respostas do Ghieh): é do RPG, aposta em moedas e/ou itens, a luta
// é AUTOMÁTICA e o perdedor só perde a aposta (sem energia, sem ferimento).
//
// A luta é 1 contra 1: o PERSONAGEM, com os atributos, o equipamento, os
// implantes e as magias do grimório que a Inteligência e a Mana dele pagam — os
// companheiros ficam de fora (é um duelo). O poder e a resiliência saem das
// mesmas fórmulas das missões (regras.js); a luta vira golpes alternados com um
// d20: 1–3 erra, 20 é crítico. A vida é escalada para que dois iguais troquem uns
// 5 golpes, em qualquer nível.
//
// A aposta de quem desafia fica em CUSTÓDIA (a tabela de ofertas do mercado, tipo
// "duelo") até o fim: recusa, cancelamento ou 10 min sem resposta devolvem tudo.
// Quem aceita põe a mesma quantia de moeda (e um item, se o desafio tiver item)
// na hora em que aceita; a luta é imediata, então a dele nunca fica parada.

import * as db from "../core/db.js";
import { citarInterno, citar } from "../core/aliases.js";
import { tr } from "../core/i18n.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import { MUNDO } from "./mundo.js";
import { fmt } from "./ui.js";
import { quantiaValida } from "../core/seguranca.js";
import { registrarErro } from "../core/erros.js";

export const SUBS = ["duelo", "duelar", "duel", "pvp", "desafiar", "desafio"];
export const VALIDADE_MS = 10 * 60_000;
export const GOLPES_MAX = 30;
export const GOLPES_ALVO = 5;   // dois iguais se derrubam em uns 5 golpes

const ACEITAR = ["aceitar", "aceito", "accept", "aceptar", "acepto"];
const RECUSAR = ["recusar", "recuso", "decline", "refuse", "rechazar", "rechazo"];
const CANCELAR = ["cancelar", "cancel", "desistir"];
const ITEM = ["item", "objeto", "object", "itens"];

// ── A luta ───────────────────────────────────────────────────────────────────
// Um lado: o personagem sozinho, com as magias que ele mesmo paga.
export function lado(uid) {
  const pt = CB.partyDe(MUNDO, uid);
  if (!pt) return null;
  const mana = R.attrEf(pt.jogador).mana ?? 0;
  const { usadas } = R.magiasAtivas(pt.doGrimorio, mana);
  const membros = [pt.jogador];
  return {
    uid, nome: pt.p.nome, nivel: pt.p.nivel ?? 1,
    poder: Math.max(1, R.poderParty(membros, usadas, { comSinergia: true })),
    resil: Math.max(1, R.resilParty(membros, usadas)),
    agilidade: pt.attr.agilidade ?? 0,
    magias: usadas.length,
  };
}

const d20 = (aleatorio) => 1 + Math.floor(aleatorio() * 20);

// A luta inteira, golpe a golpe. `a` e `b` vêm de lado() (ou qualquer objeto com
// nome, poder, resil, agilidade). Devolve o vencedor (índice 0/1) e o registro.
export function simular(a, b, aleatorio = Math.random) {
  const lados = [a, b];
  const escala = GOLPES_ALVO * (a.poder + b.poder) / (a.resil + b.resil);
  const vidaMax = lados.map((x) => x.resil * escala);
  const vida = [...vidaMax];
  // iniciativa: agilidade + d20 (empate: quem desafiou)
  const ini = lados.map((x) => (x.agilidade ?? 0) + d20(aleatorio));
  let vez = ini[1] > ini[0] ? 1 : 0;
  const primeiro = vez;
  const golpes = [];
  while (golpes.length < GOLPES_MAX && vida[0] > 0 && vida[1] > 0) {
    const alvo = 1 - vez, dado = d20(aleatorio);
    let dano = 0, tipo = "acerto";
    if (dado <= 3) tipo = "erro";
    else {
      dano = lados[vez].poder * (0.8 + 0.4 * (dado - 4) / 16);   // 0,8× (d20 4) a 1,2× (d20 20)
      if (dado === 20) { dano *= 1.75; tipo = "critico"; }
    }
    vida[alvo] = Math.max(0, vida[alvo] - dano);
    golpes.push({ quem: vez, alvo, dado, tipo, dano, resta: vida[alvo] / vidaMax[alvo] });
    vez = alvo;
  }
  const fracao = vida.map((v, i) => v / vidaMax[i]);
  const vencedor = fracao[0] === fracao[1] ? null : fracao[0] > fracao[1] ? 0 : 1;
  return { vencedor, golpes, fracao, primeiro, nocaute: fracao.some((f) => f <= 0), iniciativa: ini };
}

// Um gerador com semente: a chance mostrada no desafio não muda a cada olhada.
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
// "@pessoa 100 ouro item Espada de Ferro" → { alvoId, qtd, moeda, itemNome }
export function lerDesafio(args, mentionIds = []) {
  const toks = args.map(String);
  let alvoId = null;
  const resto = [];
  for (const t of toks) {
    const m = t.match(/^<@!?([0-9A-Z]{26})>$/i) ?? t.match(/^([0-9A-HJKMNP-TV-Z]{26})$/);
    if (m && !alvoId) { alvoId = m[1].toUpperCase(); continue; }
    resto.push(t);
  }
  alvoId ??= mentionIds?.[0] ?? null;
  const iItem = resto.findIndex((t) => ITEM.includes(t.toLowerCase()));
  const itemNome = iItem >= 0 ? resto.slice(iItem + 1).join(" ").trim() || null : null;
  const antes = iItem >= 0 ? resto.slice(0, iItem) : resto;
  let qtd = 0, moedaTxt = null, sobra = [];
  for (let i = 0; i < antes.length; i++) {
    // (31 out 2026) aposta só em inteiro ≥ 1 ("0.5", "1e3", "-2" não são aposta)
    const n = /^\d+$/.test(String(antes[i])) ? Number(antes[i]) : NaN;
    if (!qtd && quantiaValida(n)) { qtd = n; moedaTxt = antes[i + 1] ?? null; if (moedaTxt) i++; continue; }
    sobra.push(antes[i]);
  }
  return { alvoId, qtd, moedaTxt, itemNome, sobra, itemPedidoSemNome: iItem >= 0 && !itemNome };
}

// A custódia volta para quem desafiou (recusa, cancelamento, prazo).
function devolver(of, estado = "cancelada") {
  if (of.estado !== "aberta") return false;
  db.fecharOferta(of.id, estado);
  if (of.itemOferecido) db.darItem(MUNDO, of.autorId, of.itemOferecido);
  if (of.moedaOferecida && of.qtdOferecida > 0) db.creditar(MUNDO, of.autorId, of.moedaOferecida, of.qtdOferecida);
  return true;
}
export function abertos() { return db.listarOfertas(MUNDO, { tipo: "duelo" }); }
// (31 out 2026, R9) O mundo do RPG é um só, mas o duelo é de um SERVIDOR: o
// desafio guarda o servidor de origem (na coluna `itemPedido`, que o duelo não
// usa — sem mudar o esquema) e o desafio aberto só é visto e aceito de lá.
export const servidorDoDuelo = (of) => of?.itemPedido ?? null;
const daqui = (of, sid) => !!sid && servidorDoDuelo(of) === sid;
// Os desafios vencidos devolvem a aposta (chamado a cada &game)
export function expirar(agora = Date.now()) {
  let n = 0;
  for (const of of abertos()) if (agora - of.criadoEm > VALIDADE_MS && devolver(of, "expirada")) n++;
  return n;
}

const barra = (f) => { const n = Math.round(Math.max(0, Math.min(1, f)) * 10); return "▰".repeat(n) + "▱".repeat(10 - n); };

// ── O comando ────────────────────────────────────────────────────────────────
export async function cmdDuelo(message, args, ctx, { sendEmbed }) {
  const { COR, PREFIXO: P } = ctx;
  const ce = (ref) => citar(ref, "es", P);
  const eu = message.authorId;
  const sid = ctx.serverId ?? message.serverId ?? null;   // o servidor de VERDADE (o do jogo é o MUNDO)
  const acao = String(args[1] ?? "").toLowerCase();
  const T = (pt, en, es) => tr(ctx, pt, en, es);
  const erro = (titulo, desc) => sendEmbed(message.channel, { title: titulo, description: desc, colour: COR.erro });
  expirar();

  const uso = () => [
    T(`\`${citarInterno("game.duelo", P)} @‹pessoa›\` — desafia, sem aposta`, `\`${citarInterno("game.duelo", P)} @‹person›\` — challenge, no bet`, `\`${ce("game.duelo")} @‹usuario›\` — desafía, sin apuesta`),
    T(`\`${citarInterno("game.duelo", P)} @‹pessoa› 100 ouro item <seu item>\` — com aposta (moeda, item ou os dois)`, `\`${citarInterno("game.duelo", P)} @‹person› 100 gold item <your item>\` — with a bet (currency, item or both)`, `\`${ce("game.duelo")} @‹usuario› 100 gold item <tu objeto>\` — con apuesta (moneda, objeto o los dos)`),
    T(`\`${citarInterno("game.duelo", P)} ‹qtd› ouro\` — sem @: aberto a qualquer um deste servidor`, `\`${citarInterno("game.duelo", P)} ‹qtd› gold\` — no @: open to anyone on this server`, `\`${ce("game.duelo")} ‹qtd› gold\` — sin @: abierto a cualquiera de este servidor`),
    T(`\`${citarInterno("game.duelo.aceitar", P)} [#] [item <seu item>]\` · \`${citarInterno("game.duelo.recusar", P)} [#]\` · \`${citarInterno("game.duelo.cancelar", P)}\``,
      `\`${citarInterno("game.duelo.aceitar", P)} [#] [item <your item>]\` · \`${citarInterno("game.duelo.recusar", P)} [#]\` · \`${citarInterno("game.duelo.cancelar", P)}\``,
      `\`${ce("game.duelo.aceitar")} [#] [item <tu objeto>]\` · \`${ce("game.duelo.recusar")} [#]\` · \`${ce("game.duelo.cancelar")}\``),
    "",
    T("_A luta é automática e 1 contra 1 (sem companheiros). Quem perde, perde só a aposta._",
      "_The fight is automatic and 1 on 1 (no companions). The loser only loses the bet._",
      "_La pelea es automática y 1 contra 1 (sin compañeros). Quien pierde, solo pierde la apuesta._"),
  ];
  const descreverAposta = (of) => {
    const partes = [];
    if (of.moedaOferecida && of.qtdOferecida > 0) {
      const m = db.getMoeda(MUNDO, of.moedaOferecida);
      partes.push(`${m?.simbolo ?? ""}${fmt(of.qtdOferecida)} ${m?.nome ?? of.moedaOferecida}`);
    }
    if (of.itemOferecido) partes.push(`**${db.getItem(of.itemOferecido)?.nome ?? of.itemOferecido}**`);
    return partes.length ? partes.join(" + ") : T("sem aposta", "no bet", "sin apuesta");
  };
  const meusOuParaMim = () => abertos().filter((o) => o.autorId === eu || o.alvoId === eu || (!o.alvoId && daqui(o, sid)));
  const escolher = (lista) => {
    const n = parseInt(String(args[2] ?? "").replace("#", ""), 10);
    if (Number.isFinite(n)) return lista.find((o) => o.id === n) ?? null;
    return lista.length === 1 ? lista[0] : null;
  };

  // ── cancelar (quem desafiou) ──
  if (CANCELAR.includes(acao)) {
    const meus = abertos().filter((o) => o.autorId === eu);
    if (!meus.length) return sendEmbed(message.channel, { title: T("↩️ Nenhum desafio seu aberto", "↩️ No open challenge of yours", "↩️ Ningún desafío tuyo abierto"), colour: COR.info, description: uso().join("\n") });
    for (const of of meus) devolver(of);
    return sendEmbed(message.channel, { title: T("↩️ Desafio cancelado", "↩️ Challenge cancelled", "↩️ Desafío cancelado"), colour: COR.mod ?? COR.info,
      description: T("A aposta que estava comigo voltou para você.", "The bet I was holding came back to you.", "La apuesta que tenía yo volvió a ti.") });
  }

  // ── recusar (quem foi desafiado) ──
  if (RECUSAR.includes(acao)) {
    const lista = abertos().filter((o) => o.alvoId === eu);
    const of = escolher(lista);
    if (!of) return erro(T("❌ Qual desafio?", "❌ Which challenge?", "❌ ¿Qué desafío?"),
      lista.length ? T(`Você tem ${lista.length} — diga o número: ${lista.map((o) => `\`#${o.id}\``).join(" ")}`, `You have ${lista.length} — say the number: ${lista.map((o) => `\`#${o.id}\``).join(" ")}`, `Tienes ${lista.length} — di el número: ${lista.map((o) => `\`#${o.id}\``).join(" ")}`)
        : T("Ninguém desafiou você.", "Nobody challenged you.", "Nadie te desafió."));
    devolver(of, "recusada");
    return sendEmbed(message.channel, { title: T("🏳️ Desafio recusado", "🏳️ Challenge declined", "🏳️ Desafío rechazado"), colour: COR.info,
      description: T(`<@${of.autorId}>, <@${eu}> recusou. A sua aposta voltou para você.`, `<@${of.autorId}>, <@${eu}> declined. Your bet came back to you.`, `<@${of.autorId}>, <@${eu}> lo rechazó. Tu apuesta volvió a ti.`) });
  }

  // ── aceitar: a luta ──
  if (ACEITAR.includes(acao)) {
    const lista = abertos().filter((o) => o.autorId !== eu && (o.alvoId === eu || (!o.alvoId && daqui(o, sid))));
    const paraMim = lista.filter((o) => o.alvoId === eu);
    let of = escolher(lista);
    if (!of && !Number.isFinite(parseInt(String(args[2] ?? "").replace("#", ""), 10)) && paraMim.length === 1) of = paraMim[0];
    if (!of) return erro(T("❌ Qual desafio?", "❌ Which challenge?", "❌ ¿Qué desafío?"),
      lista.length ? T(`Há ${lista.length} — diga o número: ${lista.map((o) => `\`#${o.id}\``).join(" ")}`, `There are ${lista.length} — say the number: ${lista.map((o) => `\`#${o.id}\``).join(" ")}`, `Hay ${lista.length} — di el número: ${lista.map((o) => `\`#${o.id}\``).join(" ")}`)
        : T("Não há desafio aberto para você.", "There's no open challenge for you.", "No hay ningún desafío abierto para ti."));
    const eles = lado(of.autorId), meu = lado(eu);
    if (!meu) return erro(T("🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"), T(`Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${ce("game.criar")}\`.`));
    if (!eles) { devolver(of); return erro(T("❌ Desafio desfeito", "❌ Challenge void", "❌ Desafío anulado"), T("Quem desafiou não tem mais personagem.", "The challenger no longer has a character.", "Quien desafió ya no tiene personaje.")); }
    // a parte de quem aceita: a mesma moeda e, se o desafio tem item, um item
    const itemTxt = (() => { const i = args.findIndex((t) => ITEM.includes(String(t).toLowerCase())); return i >= 0 ? args.slice(i + 1).join(" ").trim() : ""; })();
    let meuItem = null;
    if (of.itemOferecido) {
      if (!itemTxt) return erro(T("❌ Falta o seu item", "❌ Your item is missing", "❌ Falta tu objeto"),
        T(`O desafio aposta **${db.getItem(of.itemOferecido)?.nome}** — ponha um item seu na mesa: \`${citarInterno("game.duelo.aceitar", P)} ${of.id} item <nome>\`.`,
          `The challenge bets **${db.getItem(of.itemOferecido)?.nome}** — put one of yours on the table: \`${citarInterno("game.duelo.aceitar", P)} ${of.id} item <name>\`.`,
          `El desafío apuesta **${db.getItem(of.itemOferecido)?.nome}** — pon uno tuyo sobre la mesa: \`${ce("game.duelo.aceitar")} ${of.id} item <nombre>\`.`));
      meuItem = db.acharItemPorNome(itemTxt);
      if (!meuItem || !db.temItem(MUNDO, eu, meuItem.id)) return erro(T("❌ Você não tem esse item", "❌ You don't have that item", "❌ No tienes ese objeto"), T(`**${itemTxt}** não está na sua mochila.`, `**${itemTxt}** isn't in your bag.`, `**${itemTxt}** no está en tu mochila.`));
      if (db.slotDoItem(MUNDO, eu, meuItem.id)) return erro(T("❌ Item equipado", "❌ Item equipped", "❌ Objeto equipado"), T(`Desequipe **${meuItem.nome}** antes — ele não pode lutar e estar na mesa ao mesmo tempo.`, `Unequip **${meuItem.nome}** first — it can't fight and sit on the table at the same time.`, `Desequipa **${meuItem.nome}** antes — no puede pelear y estar sobre la mesa a la vez.`));
    }
    if (of.moedaOferecida && of.qtdOferecida > 0 && db.getSaldo(MUNDO, eu, of.moedaOferecida) < of.qtdOferecida) {
      const m = db.getMoeda(MUNDO, of.moedaOferecida);
      return erro(T("❌ Saldo insuficiente", "❌ Not enough balance", "❌ Saldo insuficiente"),
        T(`A aposta é ${m?.simbolo ?? ""}${fmt(of.qtdOferecida)} — você tem ${fmt(db.getSaldo(MUNDO, eu, of.moedaOferecida))}.`, `The bet is ${m?.simbolo ?? ""}${fmt(of.qtdOferecida)} — you have ${fmt(db.getSaldo(MUNDO, eu, of.moedaOferecida))}.`, `La apuesta es ${m?.simbolo ?? ""}${fmt(of.qtdOferecida)} — tienes ${fmt(db.getSaldo(MUNDO, eu, of.moedaOferecida))}.`));
    }
    // fecha ANTES de qualquer await: dois "aceitar" ao mesmo tempo não lutam duas vezes
    db.fecharOferta(of.id, "lutando");
    if (of.moedaOferecida && of.qtdOferecida > 0) db.debitar(MUNDO, eu, of.moedaOferecida, of.qtdOferecida);
    if (meuItem) db.tirarItem(MUNDO, eu, meuItem.id, 1);

    const lados = [eles, meu];
    let r, fim;
    try { r = simular(eles, meu, ctx._aleatorioDuelo ?? Math.random); }
    catch (e) {
      // a luta falhou: as duas apostas voltam
      if (of.moedaOferecida && of.qtdOferecida > 0) { db.creditar(MUNDO, of.autorId, of.moedaOferecida, of.qtdOferecida); db.creditar(MUNDO, eu, of.moedaOferecida, of.qtdOferecida); }
      if (of.itemOferecido) db.darItem(MUNDO, of.autorId, of.itemOferecido);
      if (meuItem) db.darItem(MUNDO, eu, meuItem.id);
      db.fecharOferta(of.id, "cancelada");
      registrarErro("DUELO", e);
      return erro(T("❌ O duelo não aconteceu", "❌ The duel didn't happen", "❌ El duelo no ocurrió"), T("Deu um erro na luta — as duas apostas voltaram.", "The fight hit an error — both bets came back.", "La pelea dio un error — las dos apuestas volvieron."));
    }
    if (r.vencedor === null) {
      // empate perfeito: cada um leva o seu
      if (of.moedaOferecida && of.qtdOferecida > 0) { db.creditar(MUNDO, of.autorId, of.moedaOferecida, of.qtdOferecida); db.creditar(MUNDO, eu, of.moedaOferecida, of.qtdOferecida); }
      if (of.itemOferecido) db.darItem(MUNDO, of.autorId, of.itemOferecido);
      if (meuItem) db.darItem(MUNDO, eu, meuItem.id);
      db.fecharOferta(of.id, "empate");
      fim = T("🤝 **Empate** — cada um levou a sua aposta de volta.", "🤝 **Draw** — each took their bet back.", "🤝 **Empate** — cada uno recuperó su apuesta.");
    } else {
      const ganhou = lados[r.vencedor];
      if (of.moedaOferecida && of.qtdOferecida > 0) db.creditar(MUNDO, ganhou.uid, of.moedaOferecida, of.qtdOferecida * 2);
      if (of.itemOferecido) db.darItem(MUNDO, ganhou.uid, of.itemOferecido);
      if (meuItem) db.darItem(MUNDO, ganhou.uid, meuItem.id);
      db.fecharOferta(of.id, "fechada", of.qtdOferecida * 2);
      const premio = [];
      if (of.moedaOferecida && of.qtdOferecida > 0) { const m = db.getMoeda(MUNDO, of.moedaOferecida); premio.push(`${m?.simbolo ?? ""}${fmt(of.qtdOferecida * 2)} ${m?.nome ?? ""}`.trim()); }
      if (of.itemOferecido) premio.push(`**${db.getItem(of.itemOferecido)?.nome}**`);
      if (meuItem) premio.push(`**${meuItem.nome}**`);
      fim = `🏆 **${ganhou.nome}** (<@${ganhou.uid}>) ${T("venceu", "won", "ganó")}${r.nocaute ? "" : T(" nos pontos", " on points", " a los puntos")}` +
        (premio.length ? `\n${T("Leva", "Takes", "Se lleva")}: ${premio.join(" + ")}` : "");
    }
    return sendEmbed(message.channel, {
      title: `⚔️ ${T("Duelo", "Duel", "Duelo")}: ${eles.nome} × ${meu.nome}`,
      description: [...linhasDaLuta(r, lados, T), "", fim].join("\n"),
      colour: r.vencedor === null ? COR.info : COR.sucesso,
    });
  }

  // ── sem argumento: os abertos ──
  const desafio = lerDesafio(args.slice(1), message.mentionIds);
  if (!args[1] || (!desafio.alvoId && !desafio.qtd && !desafio.itemNome && !desafio.itemPedidoSemNome)) {
    const lista = meusOuParaMim();
    const linhas = lista.length ? lista.map((o) => {
      const quem = o.autorId === eu ? T("seu desafio", "your challenge", "tu desafío") + (o.alvoId ? ` → <@${o.alvoId}>` : T(" (aberto)", " (open)", " (abierto)"))
        : `<@${o.autorId}> → ${o.alvoId ? T("você", "you", "ti") : T("qualquer um", "anyone", "cualquiera")}`;
      const min = Math.max(1, Math.ceil((VALIDADE_MS - (Date.now() - o.criadoEm)) / 60_000));
      return `\`#${o.id}\` ${quem} · ${descreverAposta(o)} · ⏳ ${min} min`;
    }) : [T("_Nenhum duelo aberto._", "_No open duels._", "_Ningún duelo abierto._")];
    return sendEmbed(message.channel, { title: T("⚔️ Duelos", "⚔️ Duels", "⚔️ Duelos"), colour: COR.info, description: [...linhas, "", ...uso()].join("\n") });
  }

  // ── desafiar ──
  const meu = lado(eu);
  if (!meu) return erro(T("🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"), T(`Crie com \`${citarInterno("game.criar", P)}\`.`, `Create one with \`${citarInterno("game.criar", P)}\`.`, `Crea uno con \`${ce("game.criar")}\`.`));
  if (desafio.alvoId === eu) return erro(T("❌ Contra você mesmo?", "❌ Against yourself?", "❌ ¿Contra ti mismo?"), T("Escolha outra pessoa.", "Pick someone else.", "Elige a otra persona."));
  // o alvo tem de ser membro DESTE servidor (antes valia qualquer ID)
  if (desafio.alvoId) {
    const server = await Promise.resolve(ctx.getServer?.(message)).catch(() => null);
    const membro = await Promise.resolve(server?.fetchMember?.(desafio.alvoId)).catch(() => null);
    if (!membro) return erro(T("❌ Não está aqui", "❌ Not here", "❌ No está aquí"), T(`<@${desafio.alvoId}> não está neste servidor.`, `<@${desafio.alvoId}> isn't on this server.`, `<@${desafio.alvoId}> no está en este servidor.`));
  }
  if (!sid) return erro("❌", T("O duelo é dentro de um servidor.", "Duels happen inside a server.", "El duelo es dentro de un servidor."));
  const alvo = desafio.alvoId ? lado(desafio.alvoId) : null;
  if (desafio.alvoId && !alvo) return erro(T("❌ Sem personagem", "❌ No character", "❌ Sin personaje"), T(`<@${desafio.alvoId}> não tem personagem no RPG.`, `<@${desafio.alvoId}> has no RPG character.`, `<@${desafio.alvoId}> no tiene personaje en el RPG.`));
  if (abertos().some((o) => o.autorId === eu)) return erro(T("❌ Você já tem um desafio aberto", "❌ You already have an open challenge", "❌ Ya tienes un desafío abierto"),
    T(`Um por vez — \`${citarInterno("game.duelo.cancelar", P)}\` desfaz o atual.`, `One at a time — \`${citarInterno("game.duelo.cancelar", P)}\` undoes the current one.`, `Uno a la vez — \`${ce("game.duelo.cancelar")}\` deshace el actual.`));
  if (desafio.sobra.length || desafio.itemPedidoSemNome || (desafio.qtd && !desafio.moedaTxt && !db.moedaPadrao(MUNDO))) {
    return erro(T("❌ Não entendi a aposta", "❌ I didn't get the bet", "❌ No entendí la apuesta"), uso().join("\n"));
  }
  let moeda = null;
  if (desafio.qtd) {
    moeda = desafio.moedaTxt ? db.acharMoeda(MUNDO, desafio.moedaTxt) : db.moedaPadrao(MUNDO);
    if (!moeda) return erro(T("❌ Moeda desconhecida", "❌ Unknown currency", "❌ Moneda desconocida"), T(`Não conheço **${desafio.moedaTxt}**. As do jogo: ${db.listarMoedas(MUNDO).map((m) => `${m.simbolo}${m.nome}`).join(", ")}.`, `I don't know **${desafio.moedaTxt}**. The game's: ${db.listarMoedas(MUNDO).map((m) => `${m.simbolo}${m.nome}`).join(", ")}.`, `No conozco **${desafio.moedaTxt}**. Las del juego: ${db.listarMoedas(MUNDO).map((m) => `${m.simbolo}${m.nome}`).join(", ")}.`));
    if (db.getSaldo(MUNDO, eu, moeda.id) < desafio.qtd) return erro(T("❌ Saldo insuficiente", "❌ Not enough balance", "❌ Saldo insuficiente"), T(`Você tem ${moeda.simbolo}${fmt(db.getSaldo(MUNDO, eu, moeda.id))}.`, `You have ${moeda.simbolo}${fmt(db.getSaldo(MUNDO, eu, moeda.id))}.`, `Tienes ${moeda.simbolo}${fmt(db.getSaldo(MUNDO, eu, moeda.id))}.`));
  }
  let item = null;
  if (desafio.itemNome) {
    item = db.acharItemPorNome(desafio.itemNome);
    if (!item || !db.temItem(MUNDO, eu, item.id)) return erro(T("❌ Você não tem esse item", "❌ You don't have that item", "❌ No tienes ese objeto"), T(`**${desafio.itemNome}** não está na sua mochila.`, `**${desafio.itemNome}** isn't in your bag.`, `**${desafio.itemNome}** no está en tu mochila.`));
    if (db.slotDoItem(MUNDO, eu, item.id)) return erro(T("❌ Item equipado", "❌ Item equipped", "❌ Objeto equipado"), T(`Desequipe **${item.nome}** antes — ele não pode lutar e estar na mesa ao mesmo tempo.`, `Unequip **${item.nome}** first — it can't fight and sit on the table at the same time.`, `Desequipa **${item.nome}** antes — no puede pelear y estar sobre la mesa a la vez.`));
  }
  // a custódia
  if (moeda) db.debitar(MUNDO, eu, moeda.id, desafio.qtd);
  if (item) db.tirarItem(MUNDO, eu, item.id, 1);
  const of = db.criarOferta({ serverId: MUNDO, tipo: "duelo", autorId: eu, alvoId: desafio.alvoId, itemPedido: sid,
    itemOferecido: item?.id ?? null, moedaOferecida: moeda?.id ?? null, qtdOferecida: moeda ? desafio.qtd : 0 });
  const linhas = [
    alvo ? T(`<@${eu}> desafia <@${desafio.alvoId}> para um duelo!`, `<@${eu}> challenges <@${desafio.alvoId}> to a duel!`, `¡<@${eu}> desafía a <@${desafio.alvoId}> a un duelo!`)
      : T(`<@${eu}> abriu um duelo — qualquer um deste servidor pode aceitar.`, `<@${eu}> opened a duel — anyone on this server can accept.`, `<@${eu}> abrió un duelo — cualquiera de este servidor puede aceptar.`),
    `**${T("Aposta", "Bet", "Apuesta")}:** ${descreverAposta(of)}${(moeda || item) ? T(" _(a minha parte está em custódia)_", " _(mine is held in escrow)_", " _(la mía está en custodia)_") : ""}`,
    item ? T("_Quem aceitar põe um item seu na mesa; quem vencer leva os dois._", "_Whoever accepts puts one of their items on the table; the winner takes both._", "_Quien acepte pone un objeto suyo sobre la mesa; quien gane se lleva los dos._") : "",
    "",
    `⚔️ **${meu.nome}** (${T("nível", "level", "nivel")} ${meu.nivel}) — ${T("ataque", "attack", "ataque")} ${fmt(meu.poder)} · ${T("defesa", "defense", "defensa")} ${fmt(meu.resil)}`,
    alvo ? `🛡️ **${alvo.nome}** (${T("nível", "level", "nivel")} ${alvo.nivel}) — ${T("ataque", "attack", "ataque")} ${fmt(alvo.poder)} · ${T("defesa", "defense", "defensa")} ${fmt(alvo.resil)}` : "",
    alvo ? T(`📊 Chance estimada: **${meu.nome} ${Math.round(chance(meu, alvo) * 100)}%**`, `📊 Estimated odds: **${meu.nome} ${Math.round(chance(meu, alvo) * 100)}%**`, `📊 Probabilidad estimada: **${meu.nome} ${Math.round(chance(meu, alvo) * 100)}%**`) : "",
    "",
    `${T("Aceitar", "Accept", "Aceptar")}: \`${citarInterno("game.duelo.aceitar", P)} ${of.id}${item ? " item <nome>" : ""}\` · ${T("recusar", "decline", "rechazar")}: \`${citarInterno("game.duelo.recusar", P)} ${of.id}\``,
    T(`_Vale por ${VALIDADE_MS / 60_000} min; depois a aposta volta sozinha._`, `_Valid for ${VALIDADE_MS / 60_000} min; then the bet comes back on its own._`, `_Vale ${VALIDADE_MS / 60_000} min; después la apuesta vuelve sola._`),
  ].filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "");
  return sendEmbed(message.channel, { title: T("⚔️ Desafio de duelo", "⚔️ Duel challenge", "⚔️ Desafío de duelo"), colour: COR.aviso ?? COR.info, description: linhas.join("\n") });
}

// O relato: até 10 golpes (os 4 primeiros e os 5 últimos, se for longo) e as vidas.
export function linhasDaLuta(r, lados, T) {
  const linha = (g) => {
    const a = lados[g.quem].nome, b = lados[g.alvo].nome;
    if (g.tipo === "erro") return `💨 ${a} ${T("erra", "misses", "falla")} _(d20: ${g.dado})_`;
    const pct = Math.round(g.resta * 100);
    return `${g.tipo === "critico" ? "💥" : "⚔️"} ${a} → ${b}: −${fmt(g.dano)}${g.tipo === "critico" ? T(" **crítico**", " **critical**", " **crítico**") : ""} _(${b} ${pct}%)_`;
  };
  const g = r.golpes;
  const corpo = g.length <= 10 ? g.map(linha) : [...g.slice(0, 4).map(linha), `… ${g.length - 9} ${T("golpes depois", "blows later", "golpes después")} …`, ...g.slice(-5).map(linha)];
  return [
    T(`🎲 Iniciativa: **${lados[r.primeiro].nome}** começa`, `🎲 Initiative: **${lados[r.primeiro].nome}** goes first`, `🎲 Iniciativa: **${lados[r.primeiro].nome}** empieza`),
    ...corpo,
    "",
    ...lados.map((x, i) => `${x.nome}: ${barra(r.fracao[i])} ${Math.round(r.fracao[i] * 100)}%`),
  ];
}
