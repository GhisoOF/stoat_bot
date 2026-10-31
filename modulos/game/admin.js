// &game admin — só o dono do bot (SUPER_ADMINS), escondido da ajuda de quem não é
// dono (P2, 31 out 2026). O que sobrou das ferramentas de teste do v4:
//   &game admin                       as eras, o banco e o prazo da purga
//   &game admin dar <qtd> [@pessoa]   ouro
//   &game admin nivel <n> [@pessoa]   o nível (os pontos se redistribuem pela build)
//   &game admin item <nome> [@pessoa] um item do catálogo (entra como loot)
//   &game admin imagem [id] [link]    imagens de chefes, especiais, dungeons e aliados com nome

import * as db from "../core/db.js";
import { validarUrlImagem } from "../core/midia.js";
import * as R from "./regras.js";
import * as TS from "./tesouro.js";
import * as EV from "./evolucionador.js";
import * as IMG from "./imagens.js";
import * as E from "./era.js";
import { ERA } from "./era.js";
import { mencaoOuId, acharItem } from "./jogador.js";
import { resumoVazio, entregarItem } from "./lutas.js";
import { T, cmd, fmt, nomeItem } from "./telas.js";

const SAIRAM = new Set(["moeda", "eco", "teste", "simular", "reset", "energia", "cooldown", "follower", "dungeon", "pontos", "anunciar"]);
const quem = (args, eu, mentionIds = []) => args.map(mencaoOuId).find(Boolean) ?? mentionIds?.[0] ?? eu;
const semMencao = (args) => args.filter((a) => !mencaoOuId(a));

export async function cmdAdmin({ message, args, ctx, eu, l, P, COR, responder, erro }) {
  if (!ctx.ehSuperAdmin?.(eu)) return responder({ title: T(l, "🔒 Restrito", "🔒 Restricted", "🔒 Restringido"), colour: COR.erro,
    description: T(l, "Só o dono do bot.", "Bot owner only.", "Solo el dueño del bot.") });
  const acao = String(args[1] ?? "").toLowerCase(), resto = args.slice(2);
  const alvo = quem(resto, eu, message.mentionIds);
  const p = db.getPersonagem(ERA, alvo);
  const semP = () => erro(T(l, `<@${alvo}> não tem personagem.`, `<@${alvo}> has no character.`, `<@${alvo}> no tiene personaje.`));

  if (!acao) {
    const eras = E.resumoDasEras();
    return responder({ title: "🛠️ RPG", colour: COR.mod ?? COR.info, description: [
      `${T(l, "Era", "Era", "Era")} \`${ERA}\` · ${eras.atual} ${T(l, "personagem(ns)", "character(s)", "personaje(s)")} · 🏦 🪙 ${fmt(TS.garantirOuro()?.mercado, l)}`,
      ...eras.antigas.map((x) => `\`${x.era}\` · ${x.n} — ${T(l, "purga em", "purge on", "purga el")} ${E.PURGA.prazo}`),
    ].join("\n") });
  }
  if (acao === "dar") {
    const n = Number(semMencao(resto)[0]);
    if (!Number.isInteger(n) || n < 1 || n > 1e9) return responder({ title: T(l, "❌ Quanto?", "❌ How much?", "❌ ¿Cuánto?"), colour: COR.erro,
      description: `\`${cmd(l, "game.admin.dar", P)} 1000 [@${T(l, "pessoa", "person", "usuario")}]\`` });
    if (!p) return semP();
    TS.garantirOuro();
    db.creditar(ERA, alvo, TS.MOEDA, n);
    return responder({ title: "🪙", colour: COR.sucesso, description: `<@${alvo}> +${fmt(n, l)} · 🪙 ${fmt(TS.saldo(alvo), l)}` });
  }
  if (acao === "nivel") {
    const n = Number(semMencao(resto)[0]);
    if (!Number.isInteger(n) || n < 1 || n > 100) return erro(`\`${cmd(l, "game.admin.nivel", P)} 10 [@${T(l, "pessoa", "person", "usuario")}]\``);
    if (!p) return semP();
    const base = 1 + R.baseDoNivel(n);
    db.salvarPersonagem(ERA, alvo, { nivel: n, progresso: 0, pontos: R.pontosAte(n).pts, ...Object.fromEntries(R.ATR.map((a) => [a, base])) });
    EV.aplicarPontos(alvo);
    return responder({ title: "🛠️", colour: COR.sucesso, description: `<@${alvo}> · ${T(l, "nível", "level", "nivel")} ${n}` });
  }
  if (acao === "item") {
    const item = acharItem(semMencao(resto).join(" "));
    if (!item) return erro(`\`${cmd(l, "game.admin.item", P)} <${T(l, "nome", "name", "nombre")}> [@${T(l, "pessoa", "person", "usuario")}]\``);
    if (!p) return semP();
    const out = resumoVazio(alvo, p);
    entregarItem(alvo, item, out, { nivel: p.nivel });
    return responder({ title: "🎁", colour: COR.sucesso, description: `<@${alvo}> · **${nomeItem(item, l)}**${out.equipados.length ? ` ${T(l, "— equipado", "— equipped", "— equipado")}` : out.vendido ? ` → 🪙 ${fmt(out.vendido, l)}` : ""}` });
  }
  if (acao === "imagem") return imagem({ message, resto, l, P, COR, responder, erro });
  // as ferramentas do v4 que saíram (moedas, banco, teste, simulação, reset do mundo…)
  if (SAIRAM.has(acao)) return responder({ title: "ℹ️", colour: COR.aviso, description: T(l, "Isso saiu do jogo.", "That's no longer in the game.", "Eso ya no está en el juego.") });
  return erro(`\`${cmd(l, "help", P)} game admin\``);
}

async function imagem({ message, resto, l, P, COR, responder, erro }) {
  const ultimo = resto.at(-1) ?? "";
  const remover = /^(remover|remove)$/i.test(ultimo);
  const link = /^https?:\/\//i.test(ultimo) ? ultimo : null;
  const nome = (link || remover ? resto.slice(0, -1) : resto).join(" ").trim();
  if (!nome) {
    const alvos = IMG.alvosDeImagem(), falta = alvos.filter((a) => !IMG.imagemDe(a.id));
    return responder({ title: "🖼️", colour: COR.mod ?? COR.info,
      description: [`**${alvos.length - falta.length} / ${alvos.length}**`, ...falta.slice(0, 40).map((a) => `\`${a.id}\``)].join("\n") });
  }
  const alvo = IMG.acharAlvo(nome);
  if (!alvo) return erro(T(l, `Nada chamado **${nome.slice(0, 40)}**.`, `Nothing called **${nome.slice(0, 40)}**.`, `Nada llamado **${nome.slice(0, 40)}**.`));
  if (remover) { IMG.definirImagem(alvo.id, null); return responder({ title: T(l, "🖼️ Imagem removida", "🖼️ Image removed", "🖼️ Imagen quitada"), colour: COR.mod ?? COR.info, description: `\`${alvo.id}\`` }); }
  const nova = IMG.anexoDe(message) ?? link;
  if (!nova) { const atual = IMG.imagemDe(alvo.id); return responder({ title: "🖼️", colour: COR.mod ?? COR.info, description: `\`${alvo.id}\``, ...(atual ? { imagem: atual } : {}) }); }
  const v = validarUrlImagem(nova);
  if (!v.ok) return erro(T(l, v.motivo, v.motivoEn, v.motivoEs ?? v.motivoEn));
  IMG.definirImagem(alvo.id, v.url);
  return responder({ title: T(l, "🖼️ Imagem salva", "🖼️ Image saved", "🖼️ Imagen guardada"), colour: COR.sucesso, imagem: v.url, description: `\`${alvo.id}\`` });
}
