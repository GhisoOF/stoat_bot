// &privacidade — o centro de privacidade (20 out 2026; P2, 31 out 2026).
//
// O que a Judy guarda sobre quem pergunta, e tudo o que a pessoa faz com isso num
// lugar só: sair/voltar do XP e apagar tudo, em todos os servidores.
// (P4, 2 nov 2026) O chat IA saiu, e com ele a memória, o fio da conversa, o
// sair/voltar da conversa, o perfil, o mapear, a gentileza extra e o esquecer: a Judy
// não guarda mais nada de conversa.
//
// Saída mínima (R1/R2): cada ação responde o resultado numa linha; a explicação mora
// no `&help privacidade`. Telas em pt/en/es; datas com carimbo() (fuso de quem lê).

import * as db from "../core/db.js";
import { tr } from "../core/i18n.js";
import { citar } from "../core/aliases.js";
import { carimbo } from "../core/tempo.js";
import { registrarErro } from "../core/erros.js";
import * as aleatorio from "../core/aleatorio.js";
import * as retencao from "../core/retencao.js";

// A política de privacidade (o PRIVACIDADE.md do repositório). Quem roda a sua
// própria Judy aponta para a dela no .env.
export const URL_POLITICA = process.env.POLITICA_PRIVACIDADE_URL || "https://github.com/GhisoOF/stoat_bot/blob/main/PRIVACIDADE.md";

// `&privacidade apagar` → código; `… apagar confirmar <código>` em até 2 min
const PRAZO_APAGAR_MS = 2 * 60_000;
const pedidosApagar = new Map();   // userId → { codigo, ate }

// uma linha (o resultado) com a cor
const linha = (ctx, cor, pt, en, es) => tr(ctx, { description: pt, colour: cor }, { description: en, colour: cor }, { description: es, colour: cor });

export async function cmdPrivacidade(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId } = ctx;
  const uid = message.authorId;
  const sub = String(args[0] ?? "").toLowerCase();
  const arg = (i) => String(args[i] ?? "").toLowerCase();
  const c = (ref, l) => `\`${citar(ref, l, P)}\``;
  const enviar = (pt, en, es, cor = COR.sucesso) => sendEmbed(message.channel, linha(ctx, cor, pt, en, es));
  // erro de uso: uma linha + o &help
  const ajuda = (l) => `\`${citar("help", l, P)} ${citar("privacidade", l, "")}\``;
  const uso = () => enviar(`❓ ${ajuda("pt")}`, `❓ ${ajuda("en")}`, `❓ ${ajuda("es")}`, COR.aviso);

  // ── xp sair|voltar ── (era `&xp sair|entrar`; o XP é de cada servidor). A regra é a
// `participarDoXp` do nivel.js (área das ferramentas).
  if (sub === "xp") {
    const v = arg(1);
    if (v !== "sair" && v !== "voltar" && v !== "entrar") return uso();
    if (!serverId) return uso();
    const sair = v === "sair";
    // a função da área das ferramentas (a mesma do `&xp sair|entrar`); sem ela, o banco direto
    const nivel = await import("./nivel.js").catch((e) => { registrarErro("PRIVACIDADE][xp", e); return {}; });
    if (typeof nivel.participarDoXp === "function") await nivel.participarDoXp(serverId, uid, !sair);
    else db.setXpFora(serverId, uid, sair);
    return sair
      ? enviar("🚪 Fora do XP neste servidor — o seu XP foi apagado.", "🚪 Out of XP on this server — your XP was erased.", "🚪 Fuera del XP en este servidor — tu XP se borró.", COR.info)
      : enviar("🎮 De volta ao XP neste servidor (do zero).", "🎮 Back in XP on this server (from zero).", "🎮 De vuelta al XP en este servidor (desde cero).");
  }

  // ── apagar [confirmar <código>] ── (tudo, em todos os servidores)
  if (sub === "apagar") {
    if (arg(1) === "confirmar") {
      const p = pedidosApagar.get(uid);
      const certo = p && p.ate >= Date.now() && String(args[2] ?? "").toUpperCase() === p.codigo;
      if (!certo) return enviar(`❌ Código errado ou vencido — ${c("privacidade.apagar", "pt")}.`, `❌ Wrong or expired code — ${c("privacidade.apagar", "en")}.`, `❌ Código incorrecto o vencido — ${c("privacidade.apagar", "es")}.`, COR.erro);
      pedidosApagar.delete(uid);
      const r = retencao.dadosDaPessoa(uid, { apagar: true });
      const total = r.reduce((t, x) => t + x.n, 0);
      console.info(`[PRIVACIDADE] ${uid} apagou os próprios dados (${total} registro(s))`);
      return enviar(`🗑️ Apaguei **${total}** registro(s) seus.`, `🗑️ I erased **${total}** record(s) of yours.`, `🗑️ Borré **${total}** registro(s) tuyos.`);
    }
    if (args.length > 1) return uso();
    const r = retencao.dadosDaPessoa(uid);
    const codigo = aleatorio.codigo("0123456789ABCDEF", 4);
    pedidosApagar.set(uid, { codigo, ate: Date.now() + PRAZO_APAGAR_MS });
    const lista = (l) => r.map((x) => `• ${x.rotulo[l]}: **${x.n}**`).join("\n");
    const tela = (l, titulo, fica, confirma) => ({ title: titulo, colour: COR.aviso, description: [
      lista(l), "", `_${fica}: ${retencao.FICA_DA_PESSOA[l]}._`, "", confirma(`\`${citar("privacidade.apagar.confirmar", l, P)} ${codigo}\``)].join("\n") });
    return sendEmbed(message.channel, tr(ctx,
      tela("pt", "🗑️ Apagar tudo o que é seu, em todos os servidores?", "Fica", (x) => `${x} — até ${carimbo(Date.now() + PRAZO_APAGAR_MS, "t")}`),
      tela("en", "🗑️ Erase everything that's yours, on every server?", "What stays", (x) => `${x} — until ${carimbo(Date.now() + PRAZO_APAGAR_MS, "t")}`),
      tela("es", "🗑️ ¿Borrar todo lo tuyo, en todos los servidores?", "Lo que queda", (x) => `${x} — hasta ${carimbo(Date.now() + PRAZO_APAGAR_MS, "t")}`)));
  }

  if (sub && sub !== "status") return uso();

  // ── status (sem argumento): o que é guardado ── (as mesmas contas do `apagar`)
  const r = retencao.dadosDaPessoa(uid);
  const fora = serverId ? db.xpFora(serverId, uid) : false;
  const xp = serverId ? db.getXp(serverId, uid).xp : 0;
  const T = {
    pt: { titulo: "🔒 Sua privacidade com a Judy", guarda: "O que ela guarda sobre você",
      xp: fora ? "XP neste servidor: **fora** (não conta)" : `XP neste servidor: **${xp}**`, politica: "Política de privacidade" },
    en: { titulo: "🔒 Your privacy with Judy", guarda: "What she keeps about you",
      xp: fora ? "XP on this server: **out** (doesn't count)" : `XP on this server: **${xp}**`, politica: "Privacy policy" },
    es: { titulo: "🔒 Tu privacidad con Judy", guarda: "Lo que guarda sobre ti",
      xp: fora ? "XP en este servidor: **fuera** (no cuenta)" : `XP en este servidor: **${xp}**`, politica: "Política de privacidad" },
  };
  const emb = (l) => {
    const t = T[l];
    return { title: t.titulo, colour: COR.info, description: [
      ...(serverId ? [t.xp, ""] : []),
      `**${t.guarda}**`,
      ...r.map((x) => `• ${x.rotulo[l]}: **${x.n}**`),
      "",
      `📄 [${t.politica}](<${URL_POLITICA}>)`,
    ].join("\n") };
  };
  return sendEmbed(message.channel, tr(ctx, emb("pt"), emb("en"), emb("es")));
}
