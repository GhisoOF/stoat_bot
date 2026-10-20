// &privacidade — o que a Judy guarda sobre quem pergunta, e o consentimento (20 out 2026).
// As telas saem prontas nos três idiomas (tr com o espanhol).

import * as db from "../core/db.js";
import { tr } from "../core/i18n.js";
import { citar } from "../core/aliases.js";
import { randomBytes } from "node:crypto";
import * as retencao from "../core/retencao.js";

// A política de privacidade (o PRIVACIDADE.md do repositório). Quem roda a sua
// própria Judy aponta para a dela no .env.
export const URL_POLITICA = process.env.POLITICA_PRIVACIDADE_URL || "https://github.com/GhisoOF/stoat_bot/blob/main/PRIVACIDADE.md";

// `&privacidade apagar` → código; `… apagar confirmar <código>` em até 2 min
const PRAZO_APAGAR_MS = 2 * 60_000;
const pedidosApagar = new Map();   // userId → { codigo, ate }

const ON = new Set(["on", "sim", "yes", "si", "sí", "ligar", "ativar"]);
const OFF = new Set(["off", "nao", "não", "no", "desligar", "desativar"]);

export async function cmdPrivacidade(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  const uid = message.authorId;
  const sub = args[0]?.toLowerCase();
  const c = (ref, l) => `\`${citar(ref, l, P)}\``;

  // ── memoria on|off ──
  if (sub === "memoria") {
    const v = args[1]?.toLowerCase();
    if (!ON.has(v) && !OFF.has(v)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔒 Privacidade", description: `${c("privacidade.memoria", "pt")} on · ${c("privacidade.memoria", "pt")} off`, colour: COR.aviso },
        { title: "🔒 Privacy", description: `${c("privacidade.memoria", "en")} on · ${c("privacidade.memoria", "en")} off`, colour: COR.aviso },
        { title: "🔒 Privacidad", description: `${c("privacidade.memoria", "es")} on · ${c("privacidade.memoria", "es")} off`, colour: COR.aviso }));
    }
    const ligar = ON.has(v);
    db.setConsentimento(uid, { memoria: ligar, respondido: true });
    const ap = ligar ? null : db.apagarMemoriaDaPessoaGlobal(uid);
    const n = ap ? ap.fatos + ap.perfil + ap.memoria : 0;
    return sendEmbed(message.channel, tr(ctx, ligar
      ? { title: "🧠 Memória ligada", description: "A Judy vai lembrar do que você conta nas conversas, em qualquer servidor.", colour: COR.sucesso }
      : { title: "🧠 Memória desligada", description: `A Judy não guarda mais nada sobre você${n ? ` — apaguei ${n} registro(s)` : ""}.`, colour: COR.sucesso },
    ligar
      ? { title: "🧠 Memory on", description: "Judy will remember what you tell her in conversations, on any server.", colour: COR.sucesso }
      : { title: "🧠 Memory off", description: `Judy no longer keeps anything about you${n ? ` — I erased ${n} record(s)` : ""}.`, colour: COR.sucesso },
    ligar
      ? { title: "🧠 Memoria activada", description: "Judy va a recordar lo que le cuentas en las conversaciones, en cualquier servidor.", colour: COR.sucesso }
      : { title: "🧠 Memoria desactivada", description: `Judy ya no guarda nada sobre ti${n ? ` — borré ${n} registro(s)` : ""}.`, colour: COR.sucesso }));
  }

  // ── apagar [confirmar <código>] ──
  if (sub === "apagar") {
    const L = { pt: "pt", en: "en", es: "es" };
    if (args[1]?.toLowerCase() === "confirmar") {
      const p = pedidosApagar.get(uid);
      const certo = p && p.ate >= Date.now() && String(args[2] ?? "").toUpperCase() === p.codigo;
      if (!certo) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Código errado ou vencido", description: `Peça outro com ${c("privacidade.apagar", "pt")}.`, colour: COR.erro },
          { title: "❌ Wrong or expired code", description: `Ask for a new one with ${c("privacidade.apagar", "en")}.`, colour: COR.erro },
          { title: "❌ Código incorrecto o vencido", description: `Pide otro con ${c("privacidade.apagar", "es")}.`, colour: COR.erro }));
      }
      pedidosApagar.delete(uid);
      const r = retencao.dadosDaPessoa(uid, { apagar: true });
      const total = r.reduce((t, x) => t + x.n, 0);
      console.info(`[PRIVACIDADE] ${uid} apagou os próprios dados (${total} registro(s))`);
      return sendEmbed(message.channel, tr(ctx,
        { title: "🗑️ Pronto", description: `Apaguei **${total}** registro(s) seus. A Judy não vai perguntar de novo se pode lembrar de você — ${c("privacidade.memoria", "pt")} on, se mudar de ideia.`, colour: COR.sucesso },
        { title: "🗑️ Done", description: `I erased **${total}** record(s) of yours. Judy won't ask again whether she can remember you — ${c("privacidade.memoria", "en")} on, if you change your mind.`, colour: COR.sucesso },
        { title: "🗑️ Listo", description: `Borré **${total}** registro(s) tuyos. Judy no volverá a preguntar si puede recordarte — ${c("privacidade.memoria", "es")} on, si cambias de idea.`, colour: COR.sucesso }));
    }
    const r = retencao.dadosDaPessoa(uid);
    const codigo = randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
    pedidosApagar.set(uid, { codigo, ate: Date.now() + PRAZO_APAGAR_MS });
    const lista = (l) => r.map((x) => `• ${x.rotulo[l]}: **${x.n}**`).join("\n");
    const tela = (l, titulo, intro, fica, confirma) => ({ title: titulo, colour: COR.aviso, description: [
      intro, "", lista(l), "", `_${fica}: ${retencao.FICA_DA_PESSOA[l]}._`, "", confirma(`\`${citar("privacidade.apagar.confirmar", L[l], P)} ${codigo}\``)].join("\n") });
    return sendEmbed(message.channel, tr(ctx,
      tela("pt", "🗑️ Apagar tudo o que é seu?", "Isto apaga, em **todos os servidores** e sem volta:", "Fica", (x) => `Para confirmar, em até 2 min: ${x}`),
      tela("en", "🗑️ Erase everything that's yours?", "This erases, on **every server** and for good:", "What stays", (x) => `To confirm, within 2 min: ${x}`),
      tela("es", "🗑️ ¿Borrar todo lo tuyo?", "Esto borra, en **todos los servidores** y sin vuelta atrás:", "Lo que queda", (x) => `Para confirmar, en 2 min: ${x}`)));
  }

  // ── fio global|canal ──
  if (sub === "fio") {
    const v = args[1]?.toLowerCase();
    if (v !== "global" && v !== "canal") {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔒 Privacidade", description: `${c("privacidade.fio", "pt")} global · ${c("privacidade.fio.canal", "pt")}`, colour: COR.aviso },
        { title: "🔒 Privacy", description: `${c("privacidade.fio", "en")} global · ${c("privacidade.fio.canal", "en")}`, colour: COR.aviso },
        { title: "🔒 Privacidad", description: `${c("privacidade.fio", "es")} global · ${c("privacidade.fio.canal", "es")}`, colour: COR.aviso }));
    }
    const global = v === "global";
    db.setConsentimento(uid, { fioGlobal: global });
    return sendEmbed(message.channel, tr(ctx,
      { title: "🧵 Fio da conversa", description: global ? "A conversa com a Judy agora continua de um servidor e canal para outro." : "Cada canal volta a ter a sua conversa com a Judy.", colour: COR.sucesso },
      { title: "🧵 Conversation thread", description: global ? "Your conversation with Judy now carries over between servers and channels." : "Each channel has its own conversation with Judy again.", colour: COR.sucesso },
      { title: "🧵 Hilo de la conversación", description: global ? "La conversación con Judy ahora sigue de un servidor y canal a otro." : "Cada canal vuelve a tener su propia conversación con Judy.", colour: COR.sucesso }));
  }

  // ── status (sem argumento) ──
  const cons = db.getConsentimento(uid);
  const r = db.resumoIADaPessoa(uid, ctx.serverId);
  const fora = ctx.serverId ? db.xpFora(ctx.serverId, uid) : false;
  const xp = ctx.serverId ? db.getXp(ctx.serverId, uid).xp : 0;
  const linhaXp = (l) => ({
    pt: `• XP neste servidor: ${fora ? "**fora** (não conta)" : `**${xp}**`} — ${c(fora ? "xp.entrar" : "xp.sair", "pt")}`,
    en: `• XP on this server: ${fora ? "**out** (doesn't count)" : `**${xp}**`} — ${c(fora ? "xp.entrar" : "xp.sair", "en")}`,
    es: `• XP en este servidor: ${fora ? "**fuera** (no cuenta)" : `**${xp}**`} — ${c(fora ? "xp.entrar" : "xp.sair", "es")}`,
  })[l];
  const estado = (l) => {
    const t = { pt: ["✅ ligada", "❌ desligada", "❔ você ainda não respondeu (desligada)"], en: ["✅ on", "❌ off", "❔ you haven't answered yet (off)"], es: ["✅ activada", "❌ desactivada", "❔ todavía no respondiste (desactivada)"] }[l];
    return cons?.memoria === 1 ? t[0] : cons?.respondidoEm ? t[1] : t[2];
  };
  const fio = (l) => (cons?.fioGlobal ? "global" : { pt: "por canal", en: "per channel", es: "por canal" }[l]);
  const tela = (l) => ({
    pt: { title: "🔒 Sua privacidade com a Judy", linhas: [
      `**Memória da conversa:** ${estado("pt")}`,
      `**Fio da conversa:** ${fio("pt")}`,
      "",
      "**O que ela guarda sobre você**",
      `• fatos que aprendeu: **${r.fatosAqui}** neste servidor · **${r.fatosTotal}** em todos`,
      `• perfil mapeado (bio/status): **${r.perfis}**`,
      `• memória geral: **${r.memoria}** item(ns)`,
      `• histórico de conversa: **${r.historico}** mensagem(ns) — apagado depois de ${db.HISTORICO_HORAS} h`,
      linhaXp("pt"),
      "",
      `${c("privacidade.memoria", "pt")} on|off · ${c("privacidade.fio", "pt")} global|canal · ${c("privacidade.apagar", "pt")}`,
      `📄 [Política de privacidade](<${URL_POLITICA}>)`,
    ] },
    en: { title: "🔒 Your privacy with Judy", linhas: [
      `**Conversation memory:** ${estado("en")}`,
      `**Conversation thread:** ${fio("en")}`,
      "",
      "**What she keeps about you**",
      `• facts she learned: **${r.fatosAqui}** on this server · **${r.fatosTotal}** on all`,
      `• mapped profile (bio/status): **${r.perfis}**`,
      `• general memory: **${r.memoria}** item(s)`,
      `• conversation history: **${r.historico}** message(s) — deleted after ${db.HISTORICO_HORAS} h`,
      linhaXp("en"),
      "",
      `${c("privacidade.memoria", "en")} on|off · ${c("privacidade.fio", "en")} global|channel · ${c("privacidade.apagar", "en")}`,
      `📄 [Privacy policy](<${URL_POLITICA}>)`,
    ] },
    es: { title: "🔒 Tu privacidad con Judy", linhas: [
      `**Memoria de la conversación:** ${estado("es")}`,
      `**Hilo de la conversación:** ${fio("es")}`,
      "",
      "**Lo que guarda sobre ti**",
      `• datos que aprendió: **${r.fatosAqui}** en este servidor · **${r.fatosTotal}** en todos`,
      `• perfil mapeado (bio/estado): **${r.perfis}**`,
      `• memoria general: **${r.memoria}** elemento(s)`,
      `• historial de conversación: **${r.historico}** mensaje(s) — se borra a las ${db.HISTORICO_HORAS} h`,
      linhaXp("es"),
      "",
      `${c("privacidade.memoria", "es")} on|off · ${c("privacidade.fio", "es")} global|canal · ${c("privacidade.apagar", "es")}`,
      `📄 [Política de privacidad](<${URL_POLITICA}>)`,
    ] },
  })[l];
  const emb = (l) => ({ title: tela(l).title, description: tela(l).linhas.join("\n"), colour: COR.info });
  return sendEmbed(message.channel, tr(ctx, emb("pt"), emb("en"), emb("es")));
}
