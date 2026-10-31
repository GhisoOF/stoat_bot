// &privacidade — o centro de privacidade (20 out 2026; P2, 31 out 2026).
//
// O que a Judy guarda sobre quem pergunta, e tudo o que a pessoa faz com isso num
// lugar só: a memória (opt-in), o fio da conversa, sair/voltar da conversa e do XP,
// o perfil, o mapeamento do cartão, a gentileza extra, esquecer (a pessoa, ou o
// servidor inteiro — staff) e apagar tudo, em todos os servidores e em todas as eras
// do RPG. Antes isso estava espalhado pelo &chat e pelo &xp.
//
// Saída mínima (R1/R2): cada ação responde o resultado numa linha; a explicação mora
// no `&help privacidade`. Telas em pt/en/es; datas com carimbo() (fuso de quem lê).

import * as db from "../core/db.js";
import { tr } from "../core/i18n.js";
import { citar } from "../core/aliases.js";
import { carimbo } from "../core/tempo.js";
import { descreverErro, registrarErro } from "../core/erros.js";
import { idEscrito } from "../core/ids.js";
import { randomBytes } from "node:crypto";
import * as retencao from "../core/retencao.js";

// A política de privacidade (o PRIVACIDADE.md do repositório). Quem roda a sua
// própria Judy aponta para a dela no .env.
export const URL_POLITICA = process.env.POLITICA_PRIVACIDADE_URL || "https://github.com/GhisoOF/stoat_bot/blob/main/PRIVACIDADE.md";

// `&privacidade apagar` → código; `… apagar confirmar <código>` em até 2 min
const PRAZO_APAGAR_MS = 2 * 60_000;
const pedidosApagar = new Map();   // userId → { codigo, ate }

const ON = new Set(["on", "sim", "yes", "si", "sí", "ligar", "ativar", "activar"]);
const OFF = new Set(["off", "nao", "não", "no", "desligar", "desativar", "desactivar"]);

// O chat.js (a IA) só carrega quando a ação precisa dele (esquecer)
const ia = () => import("../ai/chat.js");

// ── RPG: apagar o jogador em TODAS as eras ──
// A área do RPG exporta a função (combinado em _notas/rpg.md). Enquanto ela não
// existe, o `retencao.dadosDaPessoa` (as tabelas de hoje) é o que apaga.
export const FUNCAO_RPG = "apagarJogadorTodasAsEras";
async function apagarRpgTodasAsEras(userId) {
  try {
    const m = await import("../game/game.js");
    if (typeof m[FUNCAO_RPG] === "function") return Number(await m[FUNCAO_RPG](userId)) || 0;
  } catch (e) { registrarErro("PRIVACIDADE][rpg", e); }
  return 0;
}

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
  // perfil, mapear e cuidado são só da própria pessoa (privacidade, 20 out 2026)
  const deOutro = () => {
    const alvo = idEscrito(args.slice(1).filter((a) => !ON.has(String(a).toLowerCase()) && !OFF.has(String(a).toLowerCase())).join(" "))
      || message.mentionIds?.[0] || message.mentions?.[0]?.id || uid;
    return alvo !== uid;
  };
  const soOSeu = () => enviar("🔒 Só o seu.", "🔒 Only your own.", "🔒 Solo el tuyo.", COR.aviso);

  // ── memoria on|off ──
  if (sub === "memoria") {
    const v = arg(1);
    if (!ON.has(v) && !OFF.has(v)) return uso();
    const ligar = ON.has(v);
    db.setConsentimento(uid, { memoria: ligar, respondido: true });
    const ap = ligar ? null : db.apagarMemoriaDaPessoaGlobal(uid);
    const n = ap ? ap.fatos + ap.perfil + ap.memoria : 0;
    return ligar
      ? enviar("🧠 Memória ligada.", "🧠 Memory on.", "🧠 Memoria activada.")
      : enviar(`🧠 Memória desligada${n ? ` — ${n} registro(s) apagado(s)` : ""}.`, `🧠 Memory off${n ? ` — ${n} record(s) erased` : ""}.`, `🧠 Memoria desactivada${n ? ` — ${n} registro(s) borrado(s)` : ""}.`);
  }

  // ── fio global|canal ──
  if (sub === "fio") {
    const v = arg(1);
    if (v !== "global" && v !== "canal") return uso();
    db.setConsentimento(uid, { fioGlobal: v === "global" });
    return v === "global"
      ? enviar("🧵 Fio da conversa: global.", "🧵 Conversation thread: global.", "🧵 Hilo de la conversación: global.")
      : enviar("🧵 Fio da conversa: por canal.", "🧵 Conversation thread: per channel.", "🧵 Hilo de la conversación: por canal.");
  }

  // ── chat sair|voltar ── (era `&chat sair|voltar`)
  if (sub === "chat") {
    const v = arg(1);
    if (v !== "sair" && v !== "voltar" && v !== "entrar") return uso();
    const sair = v === "sair";
    db.setIaSilenciada(uid, sair);
    return sair
      ? enviar("🤐 A Judy não conversa mais com você.", "🤐 Judy won't chat with you anymore.", "🤐 Judy ya no conversará contigo.", COR.info)
      : enviar("💬 A Judy volta a conversar com você.", "💬 Judy will chat with you again.", "💬 Judy vuelve a conversar contigo.");
  }

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

  // ── cuidado on|off ── (era `&chat cuidado`; só para si: marcar OUTRA pessoa, mesmo
  // sendo staff, é rotulá-la sem o consentimento dela)
  if (sub === "cuidado") {
    if (deOutro()) return soOSeu();
    if (!serverId) return uso();
    const ligar = !args.slice(1).some((a) => OFF.has(String(a).toLowerCase()));
    try {
      db.setCuidado(serverId, uid, ligar);
      return ligar
        ? enviar("🌿 Gentileza extra: ligada.", "🌿 Extra kindness: on.", "🌿 Amabilidad extra: activada.")
        : enviar("🌿 Gentileza extra: desligada.", "🌿 Extra kindness: off.", "🌿 Amabilidad extra: desactivada.");
    } catch (e) {
      registrarErro("PRIVACIDADE][cuidado", e);
      return enviar(`❌ ${descreverErro(e, "pt")}.`, `❌ ${descreverErro(e, "en")}.`, `❌ ${descreverErro(e, "es")}.`, COR.erro);
    }
  }

  // ── perfil ── (era `&chat perfil`)
  if (sub === "perfil") {
    if (deOutro()) return soOSeu();
    const perfil = serverId ? db.getPerfil?.(serverId, uid) : null;
    const fatos = (serverId ? db.getFatosPessoa?.(serverId, uid, { limite: 20, minConf: 0.4 }) : null) || [];
    if (!perfil && !fatos.length) return enviar("👤 Nada guardado sobre você aqui.", "👤 Nothing kept about you here.", "👤 Nada guardado sobre ti aquí.", COR.info);
    const tela = (l) => {
      const R = {
        pt: { cuidado: "🌿 gentileza extra", personalidade: "🧠 Personalidade", gosto: "❤️ Gostos", info: "📌 Informações", jogos: "Jogos", grupos: "Grupos" },
        en: { cuidado: "🌿 extra kindness", personalidade: "🧠 Personality", gosto: "❤️ Likes", info: "📌 Information", jogos: "Games", grupos: "Groups" },
        es: { cuidado: "🌿 amabilidad extra", personalidade: "🧠 Personalidad", gosto: "❤️ Gustos", info: "📌 Información", jogos: "Juegos", grupos: "Grupos" },
      }[l];
      const linhas = [];
      if (perfil?.cuidado) linhas.push(R.cuidado);
      if (perfil?.bio) linhas.push(`**Bio:** ${perfil.bio}`);
      if (perfil?.grupos) linhas.push(`**${R.grupos}:** ${perfil.grupos}`);
      if (perfil?.jogos) linhas.push(`**${R.jogos}:** ${perfil.jogos}`);
      const porCat = { personalidade: [], gosto: [], info: [] };
      for (const f of fatos) (porCat[f.categoria] ?? porCat.info).push(f);
      for (const cat of ["personalidade", "gosto", "info"]) {
        if (!porCat[cat].length) continue;
        linhas.push(`\n**${R[cat]}**`);
        for (const f of porCat[cat]) {
          const quando = f.momento ? carimbo(f.momento, "d") : "";
          linhas.push(`• ${f.fato}${quando ? ` — ${quando}` : ""}`);
        }
      }
      return { title: { pt: "👤 Seu perfil", en: "👤 Your profile", es: "👤 Tu perfil" }[l], description: linhas.join("\n").slice(0, 1990), colour: COR.info };
    };
    return sendEmbed(message.channel, tr(ctx, tela("pt"), tela("en"), tela("es")));
  }

  // ── mapear ── (era `&chat mapear`; só o seu: ler o perfil de outra pessoa sem a
  // permissão dela é o scraping que as regras do Stoat proíbem)
  if (sub === "mapear") {
    if (deOutro()) return soOSeu();
    if (!serverId) return uso();
    try {
      const member = message.member ?? null;
      const user = message.author ?? member?.user ?? null;
      const nome = user?.username ?? member?.nickname ?? uid;
      let bio = null, status = null;
      try { status = user?.status?.text ?? null; } catch (e) { registrarErro("PRIVACIDADE][mapear-status", e); }
      try { const prof = await (user?.fetchProfile?.() ?? member?.fetchProfile?.()); bio = prof?.content ?? prof?.bio ?? null; }
      catch (e) { registrarErro("PRIVACIDADE][mapear-bio", e); }
      const entrou = member?.joinedAt ? new Date(member.joinedAt).toISOString() : null;
      db.setPerfil(serverId, uid, {
        nome,
        bio: bio ? String(bio).slice(0, 500) : undefined,
        status: typeof status === "string" && status ? status.slice(0, 200) : undefined,
        entrou: entrou || undefined,
      });
      const achou = (l) => [bio && "bio", status && { pt: "status", en: "status", es: "estado" }[l], entrou && { pt: "entrada", en: "join date", es: "entrada" }[l]].filter(Boolean).join(", ");
      return achou("pt")
        ? enviar(`👤 Mapeado: ${achou("pt")}.`, `👤 Mapped: ${achou("en")}.`, `👤 Mapeado: ${achou("es")}.`)
        : enviar("👤 A API não deu bio nem status.", "👤 The API gave no bio or status.", "👤 La API no dio bio ni estado.", COR.info);
    } catch (e) {
      registrarErro("PRIVACIDADE][mapear", e);
      return enviar(`❌ ${descreverErro(e, "pt")}.`, `❌ ${descreverErro(e, "en")}.`, `❌ ${descreverErro(e, "es")}.`, COR.erro);
    }
  }

  // ── esquecer [tudo] ── (era `&chat esquecer [tudo]`)
  if (sub === "esquecer") {
    if (!serverId) return uso();
    const chat = await ia();
    if (arg(1) === "tudo") {
      const server = await Promise.resolve(ctx.getServer?.(message)).catch(() => null);
      if (ctx.membroTemPermissao && !ctx.membroTemPermissao(message, server, "ManageServer")) {
        return enviar("🚫 Pede **ManageServer**.", "🚫 Needs **ManageServer**.", "🚫 Requiere **ManageServer**.", COR.erro);
      }
      try {
        const r = chat.esquecerServidor({ serverId, server, canalId: message.channelId });
        const n = r.fatosPessoa + r.fatosServidor + r.perfis + r.historico + r.memoriaGeral;
        return enviar(`🧹 Memória do servidor apagada (${n} registro(s)).`, `🧹 Server memory erased (${n} record(s)).`, `🧹 Memoria del servidor borrada (${n} registro(s)).`);
      } catch (e) {
        registrarErro("PRIVACIDADE][esquecer-tudo", e);
        return enviar(`❌ ${descreverErro(e, "pt")}.`, `❌ ${descreverErro(e, "en")}.`, `❌ ${descreverErro(e, "es")}.`, COR.erro);
      }
    }
    if (args.length > 1) return uso();
    try {
      const r = chat.esquecerPessoa({ serverId, userId: uid, canalId: message.channelId });
      const n = r.fatos + r.memoriaGeral;
      return enviar(`🧹 Esqueci o que sabia de você aqui (${n} registro(s)).`, `🧹 I forgot what I knew about you here (${n} record(s)).`, `🧹 Olvidé lo que sabía de ti aquí (${n} registro(s)).`);
    } catch (e) {
      registrarErro("PRIVACIDADE][esquecer", e);
      return enviar(`❌ ${descreverErro(e, "pt")}.`, `❌ ${descreverErro(e, "en")}.`, `❌ ${descreverErro(e, "es")}.`, COR.erro);
    }
  }

  // ── apagar [confirmar <código>] ── (tudo, em todos os servidores e todas as eras do RPG)
  if (sub === "apagar") {
    if (arg(1) === "confirmar") {
      const p = pedidosApagar.get(uid);
      const certo = p && p.ate >= Date.now() && String(args[2] ?? "").toUpperCase() === p.codigo;
      if (!certo) return enviar(`❌ Código errado ou vencido — ${c("privacidade.apagar", "pt")}.`, `❌ Wrong or expired code — ${c("privacidade.apagar", "en")}.`, `❌ Código incorrecto o vencido — ${c("privacidade.apagar", "es")}.`, COR.erro);
      pedidosApagar.delete(uid);
      const r = retencao.dadosDaPessoa(uid, { apagar: true });
      const total = r.reduce((t, x) => t + x.n, 0) + await apagarRpgTodasAsEras(uid);
      console.info(`[PRIVACIDADE] ${uid} apagou os próprios dados (${total} registro(s))`);
      return enviar(`🗑️ Apaguei **${total}** registro(s) seus.`, `🗑️ I erased **${total}** record(s) of yours.`, `🗑️ Borré **${total}** registro(s) tuyos.`);
    }
    if (args.length > 1) return uso();
    const r = retencao.dadosDaPessoa(uid);
    const codigo = randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
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

  // ── status (sem argumento): o que é guardado ──
  const cons = db.getConsentimento(uid);
  const r = db.resumoIADaPessoa(uid, serverId);
  const fora = serverId ? db.xpFora(serverId, uid) : false;
  const xp = serverId ? db.getXp(serverId, uid).xp : 0;
  const silencio = db.iaSilenciada(uid);
  const cuidado = serverId ? !!db.getPerfil?.(serverId, uid)?.cuidado : false;
  const T = {
    pt: { titulo: "🔒 Sua privacidade com a Judy", memoria: "Memória da conversa", fio: "Fio da conversa", conversa: "Conversa com a Judy", cuidado: "Gentileza extra (aqui)",
      estados: ["✅ ligada", "❌ desligada", "❔ sem resposta (desligada)"], porCanal: "por canal", fala: "✅ sim", calada: "🤐 você pediu silêncio", sim: "✅", nao: "—",
      guarda: "O que ela guarda sobre você", fatos: (a, t) => `fatos que aprendeu: **${a}** neste servidor · **${t}** em todos`, perfis: "perfil mapeado (bio/status)",
      memGeral: "memória curta", historico: (n) => `histórico de conversa: **${n}** mensagem(ns) — apagado depois de ${db.HISTORICO_HORAS} h`,
      xp: fora ? "XP neste servidor: **fora** (não conta)" : `XP neste servidor: **${xp}**`, politica: "Política de privacidade" },
    en: { titulo: "🔒 Your privacy with Judy", memoria: "Conversation memory", fio: "Conversation thread", conversa: "Chatting with Judy", cuidado: "Extra kindness (here)",
      estados: ["✅ on", "❌ off", "❔ not answered (off)"], porCanal: "per channel", fala: "✅ yes", calada: "🤐 you asked for silence", sim: "✅", nao: "—",
      guarda: "What she keeps about you", fatos: (a, t) => `facts she learned: **${a}** on this server · **${t}** on all`, perfis: "mapped profile (bio/status)",
      memGeral: "short memory", historico: (n) => `conversation history: **${n}** message(s) — deleted after ${db.HISTORICO_HORAS} h`,
      xp: fora ? "XP on this server: **out** (doesn't count)" : `XP on this server: **${xp}**`, politica: "Privacy policy" },
    es: { titulo: "🔒 Tu privacidad con Judy", memoria: "Memoria de la conversación", fio: "Hilo de la conversación", conversa: "Conversar con Judy", cuidado: "Amabilidad extra (aquí)",
      estados: ["✅ activada", "❌ desactivada", "❔ sin respuesta (desactivada)"], porCanal: "por canal", fala: "✅ sí", calada: "🤐 pediste silencio", sim: "✅", nao: "—",
      guarda: "Lo que guarda sobre ti", fatos: (a, t) => `datos que aprendió: **${a}** en este servidor · **${t}** en todos`, perfis: "perfil mapeado (bio/estado)",
      memGeral: "memoria corta", historico: (n) => `historial de conversación: **${n}** mensaje(s) — se borra a las ${db.HISTORICO_HORAS} h`,
      xp: fora ? "XP en este servidor: **fuera** (no cuenta)" : `XP en este servidor: **${xp}**`, politica: "Política de privacidad" },
  };
  const emb = (l) => {
    const t = T[l];
    const estado = cons?.memoria === 1 ? t.estados[0] : cons?.respondidoEm ? t.estados[1] : t.estados[2];
    return { title: t.titulo, colour: COR.info, description: [
      `**${t.memoria}:** ${estado}`,
      `**${t.fio}:** ${cons?.fioGlobal ? "global" : t.porCanal}`,
      `**${t.conversa}:** ${silencio ? t.calada : t.fala}`,
      ...(serverId ? [`**${t.cuidado}:** ${cuidado ? t.sim : t.nao}`] : []),
      "",
      `**${t.guarda}**`,
      `• ${t.fatos(r.fatosAqui, r.fatosTotal)}`,
      `• ${t.perfis}: **${r.perfis}**`,
      `• ${t.memGeral}: **${r.memoria}**`,
      `• ${t.historico(r.historico)}`,
      ...(serverId ? [`• ${t.xp}`] : []),
      "",
      `📄 [${t.politica}](<${URL_POLITICA}>)`,
    ].join("\n") };
  };
  return sendEmbed(message.channel, tr(ctx, emb("pt"), emb("en"), emb("es")));
}
