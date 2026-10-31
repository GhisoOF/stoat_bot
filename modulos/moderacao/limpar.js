
import * as log from "../core/log.js";
import { descreverErro, registrarErro } from "../core/erros.js";
import { tr, idiomaDe } from "../core/i18n.js";
import { citar, JA_TRADUZIDO, FIM_PRONTO } from "../core/aliases.js";
import { erroDeUso, semPermissao, resolverAlvo, responderAlvoRuim } from "./punir.js";

const MAX = 100;

const pendentes = new Map();   // canalId → { codigo, autorId, expira, servidor }
const VALIDADE_MS = 60_000;

setInterval(() => {
  const agora = Date.now();
  for (const [k, p] of pendentes) if (agora > p.expira) pendentes.delete(k);
}, 30_000).unref?.();

function novoCodigo() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join("");
}

async function apagarTudo(canal, idComando, aoProgredir) {
  let total = 0;
  const TETO = Number(process.env.LIMPAR_TUDO_MAX || 5000);

  for (let volta = 0; volta < Math.ceil(TETO / 100); volta++) {
    const lote = await canal.fetchMessages({ limit: 100 });
    const ids = (lote ?? [])
      .map((m) => m.id ?? m._id)
      .filter((id) => id && id !== idComando);

    if (!ids.length) break;
    await canal.deleteMessages(ids);
    total += ids.length;
    if (aoProgredir && volta % 5 === 4) await aoProgredir(total);
    if (ids.length < 100) break;         // acabou o histórico
    await new Promise((r) => setTimeout(r, 400));   // respiro para a API
  }
  return total;
}

// &purge (id `limpar`): `&purge 50`, `&purge @pessoa 50` (ou `&purge 50 @pessoa`),
// `&purge tudo` (só o DONO do servidor — o dono do bot só nos servidores dele, R9).
export async function cmdLimpar(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const canal = message.channel;
  const linha = (cor, pt, en, es) => sendEmbed(canal, { description: tr(ctx, pt, en, es), colour: cor });

  const server = await getServer(message).catch(() => null);
  if (!server) return linha(COR.erro, "❌ Só dentro de um servidor.", "❌ Only inside a server.", "❌ Solo dentro de un servidor.");
  if (!membroTemPermissao(message, server, "ManageMessages")) return semPermissao(ctx, canal, "ManageMessages");

  // Os nomes já chegam traduzidos (`all`, `confirm` → `tudo`, `confirmar`) pelo registro.
  const sub = (args[0] ?? "").toLowerCase();

  if (sub === "confirmar") {
    const p = pendentes.get(message.channelId);
    if (!p || Date.now() > p.expira) {
      pendentes.delete(message.channelId);
      return linha(COR.aviso, "⌛ Nada a confirmar neste canal.", "⌛ Nothing to confirm in this channel.", "⌛ Nada que confirmar en este canal.");
    }
    if (message.authorId !== p.autorId) return linha(COR.erro, "🚫 Só quem pediu confirma.", "🚫 Only whoever asked can confirm.", "🚫 Solo quien lo pidió puede confirmar.");
    // (31 out 2026, achado de 30/10) o código errado NÃO mostra o certo: quem não viu
    // o pedido (ou digitou às cegas) não ganha o código de presente.
    if ((args[1] ?? "").toUpperCase() !== p.codigo) return linha(COR.erro, "❌ Código errado.", "❌ Wrong code.", "❌ Código incorrecto.");

    pendentes.delete(message.channelId);
    const aviso = await sendEmbedRetornando(ctx, canal, { description: tr(ctx, "🧹 Esvaziando o canal…", "🧹 Emptying the channel…", "🧹 Vaciando el canal…"), colour: COR.mod });
    try {
      const total = await apagarTudo(canal, message.id);
      await linha(COR.sucesso, `🧹 ${total} mensagem(ns) apagada(s).`, `🧹 ${total} message(s) deleted.`, `🧹 ${total} mensaje(s) borrado(s).`);
      await log.registrar(ctx, "mensagens", {
        titulo: "🧹 LIMPEZA TOTAL do canal",
        descricao: `<@${message.authorId}> esvaziou <#${message.channelId}> — **${total}** mensagem(ns) apagada(s).`,
        en: { titulo: "🧹 Channel FULLY cleared", descricao: `<@${message.authorId}> emptied <#${message.channelId}> — **${total}** message(s) deleted.` },
        es: { titulo: "🧹 LIMPIEZA TOTAL del canal", descricao: `<@${message.authorId}> vació <#${message.channelId}> — **${total}** mensaje(s) borrado(s).` },
      });
      console.log(`[LIMPAR][TUDO] ${message.authorId} esvaziou ${message.channelId}: ${total} msg`);
    } catch (err) {
      registrarErro("LIMPAR:tudo", err);
      await linha(COR.erro, `❌ Parou no meio: ${descreverErro(err, "pt")}`, `❌ Stopped midway: ${descreverErro(err, "en")}`, `❌ Se detuvo a medias: ${descreverErro(err, "es")}`);
    } finally {
      try { await aviso?.delete?.(); } catch (e) { registrarErro("LIMPAR:aviso", e); }
    }
    return;
  }

  if (sub === "tudo") {
    if ((server?.ownerId ?? server?.owner) !== message.authorId) {
      return linha(COR.erro, "🚫 Só o dono do servidor.", "🚫 Server owner only.", "🚫 Solo el dueño del servidor.");
    }
    const codigo = novoCodigo();
    pendentes.set(message.channelId, { codigo, autorId: message.authorId, expira: Date.now() + VALIDADE_MS });
    const l = idiomaDe(ctx);
    const conf = `\`${citar("limpar.confirmar", l, PREFIXO)} ${codigo}\``;
    return linha(COR.erro,
      `⚠️ Apagar **tudo** de <#${message.channelId}>? Não há volta. Para confirmar em 60 s: ${conf}`,
      `⚠️ Delete **everything** in <#${message.channelId}>? There's no undo. To confirm within 60 s: ${conf}`,
      `⚠️ ¿Borrar **todo** en <#${message.channelId}>? No se puede deshacer. Para confirmar en 60 s: ${conf}`);
  }

  // Quantidade e (opcional) a pessoa, em qualquer ordem: `50`, `@pessoa 50`, `50 @pessoa`
  const iNum = args.findIndex((a) => /^\d+$/.test(String(a)));
  const n = iNum >= 0 ? parseInt(args[iNum], 10) : NaN;
  if (!Number.isInteger(n) || n < 1) return erroDeUso(ctx, canal, "limpar", "Quantas mensagens? (1–100)", "How many messages? (1–100)", "¿Cuántos mensajes? (1–100)");
  if (n > MAX) return erroDeUso(ctx, canal, "limpar", `O máximo é ${MAX}`, `The maximum is ${MAX}`, `El máximo es ${MAX}`);

  // A pessoa: o que sobra além do número. Não achou → NÃO apaga as de todo mundo.
  const resto = args.filter((_, i) => i !== iNum);
  let alvo = null;
  if (resto.length) {
    const r = await resolverAlvo(message, resto, server, ctx);
    if (!r.id) return responderAlvoRuim(ctx, canal, "limpar", r);
    alvo = r.id;
  }

  try {
    // busca um pouco mais que n para conseguir filtrar por pessoa
    const mensagens = await canal.fetchMessages({ limit: alvo ? Math.min(MAX, n * 4) : n });
    let candidatas = (mensagens ?? []).filter((m) => (m.id ?? m._id) !== message.id);
    if (alvo) candidatas = candidatas.filter((m) => (m.authorId ?? m.author?.id) === alvo);
    const ids = candidatas.slice(0, n).map((m) => m.id ?? m._id).filter(Boolean);
    if (!ids.length) return linha(COR.mod, "🧹 Nada para apagar.", "🧹 Nothing to delete.", "🧹 Nada que borrar.");

    await canal.deleteMessages(ids);
    const conf = await sendEmbedRetornando(ctx, canal, { description: tr(ctx,
      `🧹 ${ids.length} mensagem(ns) apagada(s)${alvo ? ` de <@${alvo}>` : ""}.`,
      `🧹 ${ids.length} message(s) deleted${alvo ? ` from <@${alvo}>` : ""}.`,
      `🧹 ${ids.length} mensaje(s) borrado(s)${alvo ? ` de <@${alvo}>` : ""}.`), colour: COR.sucesso });

    await log.registrar(ctx, "mensagens", {
      titulo: "🧹 Limpeza de chat",
      descricao: `<@${message.authorId}> apagou **${ids.length}** mensagem(ns) em <#${message.channelId}>` + (alvo ? ` (só de <@${alvo}>).` : "."),
      en: { titulo: "🧹 Chat cleanup", descricao: `<@${message.authorId}> deleted **${ids.length}** message(s) in <#${message.channelId}>` + (alvo ? ` (only from <@${alvo}>).` : ".") },
      es: { titulo: "🧹 Limpieza de chat", descricao: `<@${message.authorId}> borró **${ids.length}** mensaje(s) en <#${message.channelId}>` + (alvo ? ` (solo de <@${alvo}>).` : ".") },
    });
    console.log(`[LIMPAR] ${message.authorId} apagou ${ids.length} msg em ${message.channelId}${alvo ? ` (alvo ${alvo})` : ""}`);
    // a confirmação some sozinha (não deixa lixo no chat)
    if (conf) setTimeout(() => { conf.delete?.().catch((e) => registrarErro("LIMPAR:conf", e)); }, 6000).unref?.();
  } catch (err) {
    registrarErro("LIMPAR", err);
    await linha(COR.erro, `❌ Não consegui apagar: ${descreverErro(err, "pt")}`, `❌ Couldn't delete: ${descreverErro(err, "en")}`, `❌ No pude borrar: ${descreverErro(err, "es")}`);
  }
}

// Envia um embed e devolve o objeto da mensagem (para podermos apagá-la depois).
// (etapa 4b) o envio direto não passa pela tradução da tela: tira as marcas do
// espanhol pronto (`tr`) — no pt e no en elas não existem, o texto fica igual.
const semMarcas = (t) => (typeof t === "string" ? t.replaceAll(JA_TRADUZIDO, "").replaceAll(FIM_PRONTO, "") : t);
async function sendEmbedRetornando(ctx, channel, embed) {
  try {
    return await channel.sendMessage({
      embeds: [{
        ...(embed.title ? { title: semMarcas(embed.title) } : {}),
        description: semMarcas(embed.description),
        colour: embed.colour,
      }],
    });
  } catch (e) {
    registrarErro("LIMPAR:enviar", e);
    // fallback: usa o helper padrão (não retorna a msg, mas não quebra)
    await ctx.sendEmbed(channel, embed);
    return null;
  }
}
