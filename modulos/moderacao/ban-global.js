
import * as db  from "../core/db.js";
import { citar, citarInterno } from "../core/aliases.js";
import { descreverErro, tipoDoErro, registrarErro } from "../core/erros.js";
import { banir } from "../core/banir.js";
import * as log from "../core/log.js";
import { resolverUsuarioDetalhado, ehBot, idValido } from "../core/ids.js";
import { tr, idiomaDe } from "../core/i18n.js";
import { carimbo } from "../core/tempo.js";
import { semPermissao } from "./punir.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";
import { chamarApi } from "../core/stoat-api.js";

// ── Os modos (15 out 2026, pedido de Ghieh) ─────────────────────────────────
// Eram três: off · avisar · banir — e no `banir` UM ban em QUALQUER servidor da
// Judy já derrubava a pessoa em todos os outros. Um servidor mal-intencionado
// (ou um ban por engano) virava ban em toda parte. Agora o ban automático tem
// dois níveis:
//   • imediato — um ban em outro servidor basta (era o `banir`)
//   • consenso — só bane quem foi banido em pelo menos MINIMO_CONSENSO
//     servidores DIFERENTES; abaixo disso, avisa a staff e não faz nada
// Os bans que a própria lista aplicou não contam para o consenso: senão um
// único ban, repassado por três servidores no modo imediato, viraria "três".
export const MINIMO_CONSENSO = 3;
export const MODOS = {
  off:      "ignora a lista global",
  avisar:   "alerta os moderadores quando um banido entra",
  imediato: "bane quem foi banido em **qualquer** outro servidor (1 ban basta)",
  consenso: `bane só quem foi banido em **${MINIMO_CONSENSO}+ servidores diferentes**; com menos, só avisa a staff`,
};
export const MODOS_EN = {
  off:      "ignores the global list",
  avisar:   "alerts the moderators when a banned user joins",
  imediato: "bans anyone banned on **any** other server (1 ban is enough)",
  consenso: `bans only people banned on **${MINIMO_CONSENSO}+ different servers**; below that, just alerts the staff`,
};
export const MODOS_ES = {
  off:      "ignora la lista global",
  avisar:   "avisa a los moderadores cuando entra un baneado",
  imediato: "banea a quien fue baneado en **cualquier** otro servidor (1 ban basta)",
  consenso: `banea solo a quien fue baneado en **${MINIMO_CONSENSO}+ servidores diferentes**; con menos, solo avisa al staff`,
};
// o modo GRAVADO numa config antiga (`banir` era o imediato). Os sinônimos digitados
// (instant, ban, cego, consensus…) moram no registro (P2) e chegam aqui no nome interno.
const MODO_SINONIMO = { banir: "imediato" };
// o nome do modo na tela: o interno em português; inglês e espanhol usam o nome inglês
// (`lang` aceita também o `true` antigo = inglês)
export const nomeModoBG = (m, lang = "pt") => (lang && lang !== "pt" ? { off: "off", avisar: "warn", imediato: "instant", consenso: "consensus" }[m] ?? m : m);
export function lerModo(valor) {
  const v = String(valor ?? "").toLowerCase();
  return Object.hasOwn(MODOS, v) ? v : (MODO_SINONIMO[v] ?? null);
}
export function modoDe(config) { return lerModo(config?.banGlobal?.modo) ?? "off"; }
export const modoBane = (m) => m === "imediato" || m === "consenso";

// Ban que a PRÓPRIA lista aplicou (ou que veio dele: importado/propagado de um
// servidor onde a lista baniu) — o motivo começa com "[Ban global]" ou "ban global (".
export function ehDaPropriaLista(b) {
  return b?.origem === "banglobal" || /^\s*(\[ban global\]|ban global \()/i.test(String(b?.motivo ?? ""));
}
// Ban de origem AUTOMÁTICA (31 out 2026, R9): o automod ou o filtro de foto de
// perfil baniu sozinho, sem ninguém decidir. Um falso positivo não pode virar
// ban em todos os servidores: esse registro só ALERTA a staff dos outros
// servidores — não bane, nem no `imediato`, e não conta para o consenso.
// (A origem "automod"/"avatar" pode ter sido sobrescrita pela propagação ou
// pela importação; o motivo do ban no Stoat começa com "[AutoMod]".)
// (P2) só a ORIGEM gravada decide: um ban manual com motivo "[AutoMod] …" é humano.
// A importação e a propagação não sobrescrevem mais uma origem automática (ver
// `origemParaGravar`).
export const ORIGENS_AUTOMATICAS = new Set(["automod", "avatar"]);
export function ehAutomatico(b) {
  return ORIGENS_AUTOMATICAS.has(b?.origem);
}
// A origem a gravar num registro que pode já existir: uma origem automática fica.
export function origemParaGravar(userId, serverId, nova) {
  const atual = db.origemDoBanGlobal(userId, serverId);
  return ORIGENS_AUTOMATICAS.has(atual) ? atual : nova;
}

// Quantos servidores DIFERENTES baniram de verdade (fora o atual, que o
// chamador já tirou). A lista do dono do bot vale como decisão de confiança.
export function forcaNaLista(historico) {
  const lista = historico ?? [];
  const automaticos = lista.filter(ehAutomatico).length;
  const humanos = lista.filter((b) => !ehAutomatico(b));
  const reais = humanos.filter((b) => !ehDaPropriaLista(b));
  const servidores = new Set(reais.map((b) => b.serverId));
  return { servidores: servidores.size, doDono: servidores.has(ORIGEM_DONO), daLista: humanos.length - reais.length, total: humanos.length, automaticos };
}
export function bastaParaBanir(modo, forca) {
  if (modo === "imediato") return forca.total > 0;
  if (modo === "consenso") return forca.doDono || forca.servidores >= MINIMO_CONSENSO;
  return false;
}

// pt | en | es, sem a marca de "pronto" do `tr` (para trechos que entram num `tr`)
const X3 = (l, pt, en, es) => (l === "es" ? es : l === "en" ? en : pt);
// a data na tela: timestamp do Stoat (o cliente mostra no fuso de quem lê)
const data = (ms) => carimbo(ms, "d");

export function ehBotConhecido(userId, { client, membro = null } = {}) {
  if (membro && ehBot(membro)) return true;
  try {
    const u = client?.users?.get?.(userId);
    if (u && ehBot(u)) return true;
  } catch {}
  return false;
}

const cacheBot = new Map();   // userId → { ehBot, via }

const NEGATIVO_MS = Number(process.env.BANGLOBAL_BOT_CACHE_MS || 30 * 60_000);

export async function confirmarSeEhBot(userId, { client, membro = null, comDiscover = true } = {}) {
  if (!userId) return { ehBot: false, via: null };
  if (ehBotConhecido(userId, { client, membro })) return { ehBot: true, via: "cache do cliente" };

  const lembrado = cacheBot.get(userId);
  if (lembrado?.ehBot) return lembrado;
  if (lembrado && Date.now() - lembrado.quando < NEGATIVO_MS) return lembrado;

  const guardar = (ehBot, via) => {
    const r = { ehBot, via, quando: Date.now() };
    cacheBot.set(userId, r);
    return r;
  };

  // 1. A vitrine de bots: pública, sem token, sem conexão mútua.
  if ((await chamarApi(`/bots/${userId}/invite`, { token: "", ms: 8000 })).ok) {
    return guardar(true, "/bots/{id}/invite");
  }

  // 2. O cliente, que sabe quando há servidor em comum.
  try {
    const u = await client?.users?.fetch?.(userId)?.catch?.(() => null);
    if (u && ehBot(u)) return guardar(true, "users.fetch");
  } catch {}

  // 3. A API direta — mesma limitação do item 2, mas funciona com o cache frio.
  if (process.env.BOT_TOKEN) {
    const r = await chamarApi(`/users/${userId}`, { ms: 8000 });
    if (r.ok && ehBot(r.json)) return guardar(true, "/users/{id}");
  }

  // 4. O discover: bot privado, sem servidor em comum, ainda pode estar lá.
  if (comDiscover && await estaNoDiscover(userId)) return guardar(true, "discover");

  return guardar(false, null);
}

const DISCOVER_URL = process.env.BANGLOBAL_DISCOVER_URL || "https://stt.gg/discover/bots";
const DISCOVER_VALIDADE_MS = Number(process.env.BANGLOBAL_DISCOVER_MS || 6 * 60 * 60_000);
let discoverCache = null;   // { ids:Set, quando:number, erro:string|null }

export async function idsDoDiscover({ forcar = false } = {}) {
  if (!forcar && discoverCache && Date.now() - discoverCache.quando < DISCOVER_VALIDADE_MS) {
    return discoverCache;
  }
  try {
    const r = await fetch(DISCOVER_URL, {
      headers: { accept: "application/json, text/html" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text();
    const ids = new Set((txt.match(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g) ?? []));
    discoverCache = { ids, quando: Date.now(), erro: ids.size ? null : "a página não trouxe nenhum id" };
    console.info(`[BANGLOBAL] discover: ${ids.size} id(s) em ${DISCOVER_URL}`);
  } catch (e) {
    discoverCache = { ids: new Set(), quando: Date.now(), erro: e?.message ?? String(e) };
    console.error("[BANGLOBAL] discover:", discoverCache.erro);
  }
  return discoverCache;
}

async function estaNoDiscover(userId) {
  const d = await idsDoDiscover();
  return d.ids.has(userId);
}

async function alvoDoComando(entrada, { message, server, ctx }) {
  const extras = (() => {
    try { return db.buscarBanidosPorNome(entrada ?? "").map((b) => ({ id: b.userId, username: b.nome })); }
    catch { return []; }
  })();
  const r = await resolverUsuarioDetalhado(entrada, { message, server, client: ctx.client, extras });
  if (r?.id) return { id: r.id, nome: r.nome ?? db.nomeDeBanido(r.id) };
  return { erro: r };
}

// Quem o dono do bot põe na lista à mão (`&banglobal add`) fica registrado
// numa origem própria, não no servidor onde o comando foi digitado: o
// `verificarEntrada` ignora os bans do PRÓPRIO servidor (ele já baniu), e
// a pessoa adicionada a partir do Vapor Nexus nunca seria barrada lá.
export const ORIGEM_DONO = "lista-do-dono";
// `en` aceita também "es" (o espanhol)
export const rotuloOrigem = (serverId, en = false) =>
  serverId === ORIGEM_DONO ? (en === "es" ? "_añadido por el dueño del bot_" : en ? "_added by the bot owner_" : "_adicionado pelo dono do bot_") : `\`${serverId}\``;

// Uma linha do histórico de alguém, para a TELA (31 out 2026, R9): de outro
// servidor só a data — nem o ID dele, nem o motivo que a staff de lá escreveu.
// O motivo aparece só quando o ban é DESTE servidor ou da lista do dono do bot.
export function linhaDoBan(b, serverIdAtual, lang = "pt") {
  const L = (pt, en, es) => (lang === "es" ? es : lang === "en" ? en : pt);
  const auto = ehAutomatico(b) ? L(" · automático", " · automatic", " · automático") : "";
  const motivo = String(b?.motivo ?? "").slice(0, 120) || L("_sem motivo_", "_no reason_", "_sin motivo_");
  if (b?.serverId === serverIdAtual) return `• ${L("**este servidor**", "**this server**", "**este servidor**")} — ${motivo} _(${data(b.criadoEm)}${auto})_`;
  if (b?.serverId === ORIGEM_DONO) return `• ${rotuloOrigem(ORIGEM_DONO, lang === "es" ? "es" : lang === "en")} — ${motivo} _(${data(b.criadoEm)})_`;
  return `• ${L("outro servidor", "another server", "otro servidor")} _(${data(b.criadoEm)}${auto})_`;
}

export function rotularUsuario(userId, { nome = null, client = null, en = false } = {}) {
  const conhecido = nome
    ?? (() => { try { return db.nomeDeBanido(userId); } catch { return null; } })()
    ?? (() => { try { return client?.users?.get?.(userId)?.username ?? null; } catch { return null; } })();
  return conhecido ? `**${conhecido}** \`${userId}\`` : `\`${userId}\` ${en === "es" ? "_(nombre desconocido)_" : en ? "_(unknown name)_" : "_(nome desconhecido)_"}`;
}

export function estaIsento(config, userId) {
  return (config?.banGlobal?.isentos ?? []).includes(userId);
}

// (31 out 2026, R10) o erro que vai para a TELA é curto e sem detalhe interno
// (nada de nome de variável, código HTTP ou corpo da API); o cru fica no log.
export async function desbanir(server, serverId, userId, lang = "pt") {
  const L = (pt, en, es) => (lang === "es" ? es : lang === "en" ? en : pt);
  try {
    if (typeof server?.unbanUser === "function") { await server.unbanUser(userId); return { ok: true }; }
  } catch (e) { registrarErro("BANGLOBAL:desbanir", e); /* cai no REST */ }
  const r = await chamarApi(`/servers/${serverId}/bans/${userId}`, { metodo: "DELETE" });
  // 404 = já não estava banido: para desbanir, isso é sucesso.
  if (r.ok || r.status === 404) return { ok: true };
  registrarErro("BANGLOBAL:desbanir", r.erro ?? `HTTP ${r.status} ${String(r.texto ?? "").slice(0, 200)}`);
  if (r.status === 403) return { ok: false, erro: L("falta ao bot a permissão **BanMembers** aqui", "the bot lacks the **BanMembers** permission here", "al bot le falta el permiso **BanMembers** aquí") };
  return { ok: false, erro: L("o Stoat recusou o pedido — tente de novo", "the Stoat refused the request — try again", "Stoat rechazó la petición — inténtalo de nuevo") };
}

export async function importarBansDoServidor(server, serverId, client = null) {
  const bans = await server.fetchBans();
  const lista = bans?.bans ?? bans ?? [];
  const porId = new Map();
  for (const u of bans?.users ?? []) porId.set(u?.id ?? u?._id, u);

  let novos = 0, bots = 0, ignorados = 0;
  for (const b of lista) {
    const uid = b?.id?.user ?? b?.user?.id ?? b?.id;
    if (!uid) continue;
    // Decisão já tomada por alguém: nem consulta a API, nem conta como bot.
    if (db.estaIgnoradoGlobal(uid)) { ignorados++; continue; }
    const u = b?.user ?? porId.get(uid) ?? null;
    if (ehBot(b) || ehBot(u)) {
      bots++;
      db.ignorarNaListaGlobal(uid, { nome: u?.username ?? b?.username ?? null, motivo: "é um bot" });
      continue;
    }
    const nome = u?.username ?? b?.username ?? null;
    const v = await confirmarSeEhBot(uid, { client });
    if (v.ehBot) {
      bots++;
      db.ignorarNaListaGlobal(uid, { nome, motivo: `é um bot (${v.via})` });
      continue;
    }
    if (db.registrarBanGlobal(uid, serverId, b?.reason ?? "importado do servidor", origemParaGravar(uid, serverId, "importado"), { nome })) novos++;
  }
  return { total: lista.length, novos, bots, ignorados };
}

const INTERVALO_MS = Number(process.env.BANGLOBAL_IMPORT_MS || 6 * 60 * 60_000);   // 6h
const ATRASO_BOOT_MS = Number(process.env.BANGLOBAL_IMPORT_BOOT_MS || 60_000);     // 1min após o boot
const ESPACO_MS = Number(process.env.BANGLOBAL_ESPACO_MS || 3000);   // respiro entre servidores, para não estourar rate limit

// Um servidor por vez, com respiro entre eles (rate limit); cada um pelo mesmo
// caminho do servidor novo (`sincronizarServidor`).
async function sincronizarTodos(client, criarContexto) {
  for (const server of [...(client.servers?.values?.() ?? [])]) {
    await sincronizarServidor(server, criarContexto);
    await new Promise((r) => setTimeout(r, ESPACO_MS));
  }
}

export async function sincronizarServidor(server, criarContexto) {
  const sid = server?.id ?? server?._id;
  if (!sid || typeof server?.fetchBans !== "function") return;
  try {
    const ctx = criarContexto(sid);
    const { total, novos } = await importarBansDoServidor(server, sid, ctx?.client ?? null);
    if (novos > 0) {
      console.info(`[BANGLOBAL] ${sid}: ${novos} de ${total} ban(s) importado(s).`);
      await log.registrar(ctx, "punicoes", {
        titulo: "🌐 Bans importados automaticamente",
        descricao: `**${novos}** ban(s) deste servidor entraram na lista global.`,
en: { titulo: "🌐 Bans imported automatically", descricao: `**${novos}** ban(s) from this server joined the global list.` },
        es: { titulo: "🌐 Bans importados automáticamente", descricao: `**${novos}** ban(s) de este servidor entraron en la lista global.` },
      });
    }
  } catch (err) {
    registrarErro("BANGLOBAL:sincronizar", err);
  }
}

export function iniciarAutoImportacao(client, criarContexto) {
  const rodar = () => sincronizarTodos(client, criarContexto)
    .catch((e) => console.error("[BANGLOBAL] auto:", e?.message));

  setTimeout(rodar, ATRASO_BOOT_MS).unref?.();
  setInterval(rodar, INTERVALO_MS).unref?.();
  console.info(`[BANGLOBAL] Contribuição automática ativa (sincroniza a cada ${Math.round(INTERVALO_MS / 3600000)}h; não é desligável).`);
}

export async function registrar(ctx, userId, motivo, origem = "manual", { nome = null, membro = null } = {}) {
  const serverId = ctx?.serverId;
  if (!serverId || !userId) return;
  if (db.estaIgnoradoGlobal(userId)) {
    console.log(`[BANGLOBAL] ${userId} está na lista de ignorados — não volta para a lista global`);
    return;
  }
  const veredito = await confirmarSeEhBot(userId, { client: ctx?.client, membro });
  if (veredito.ehBot) {
    console.log(`[BANGLOBAL] ${userId} é bot (${veredito.via}) — não entra na lista global`);
    db.ignorarNaListaGlobal(userId, {
      nome: nome ?? ctx?.client?.users?.get?.(userId)?.username ?? null,
      motivo: `é um bot (${veredito.via})`,
    });
    return;
  }
  try {
    const nomeFinal = nome
      ?? ctx?.client?.users?.get?.(userId)?.username
      ?? null;
    db.registrarBanGlobal(userId, serverId, motivo, origem, { nome: nomeFinal });
  } catch (err) {
    console.error("[BANGLOBAL] Falha ao registrar:", err?.message);
  }
}

export async function verificarEntrada(member, ctx, { propagado = false } = {}) {
  const serverId = member?.id?.server;
  const userId   = member?.id?.user;
  if (!serverId || !userId) return false;

  const modo = modoDe(ctx.config);
  if (modo === "off") return false;

  // Bot: não escolheu entrar, alguém o adicionou. A lista não vale para ele.
  if (ehBot(member) || ehBot(member?.user) || ehBotConhecido(userId, { client: ctx.client })) {
    return false;
  }

  // Isento: este servidor já decidiu que aceita esta pessoa.
  if (estaIsento(ctx.config, userId)) {
    console.log(`[BANGLOBAL] ${userId} entrou em ${serverId} e está ISENTO — nada a fazer`);
    return false;
  }

  const historico = db.historicoBans(userId)
    .filter((b) => b.serverId !== serverId);   // bans deste próprio servidor não contam
  if (!historico.length) return false;

  const forca = forcaNaLista(historico);
  const n = forca.servidores || historico.length;
  const daLista = forca.daLista ? ` _(+${forca.daLista} pela própria lista)_` : "";
  const daListaEn = forca.daLista ? ` _(+${forca.daLista} by the list itself)_` : "";
  // (31 out 2026, R9) só contagem e data: nada do ID nem do motivo de outro servidor
  const motivos = historico.slice(0, 3).map((b) => linhaDoBan(b, serverId, "pt")).join("\n");
  const quemEntrou = member?.user?.username ?? member?.nickname ?? null;
  const resumo = `${rotularUsuario(userId, { nome: quemEntrou, client: ctx.client })} consta na lista global: banido em **${n}** servidor(es)${daLista}.\n${motivos}`
    + (n > 3 ? `\n_… e mais ${n - 3}._` : "");
  const resumoEn = `${rotularUsuario(userId, { nome: quemEntrou, client: ctx.client, en: true })} is on the global list: banned in **${n}** server(s)${daListaEn}.\n`
    + historico.slice(0, 3).map((b) => linhaDoBan(b, serverId, "en")).join("\n")
    + (n > 3 ? `\n_… and ${n - 3} more._` : "");
  const daListaEs = forca.daLista ? ` _(+${forca.daLista} por la propia lista)_` : "";
  const resumoEs = `${rotularUsuario(userId, { nome: quemEntrou, client: ctx.client, en: "es" })} está en la lista global: baneado en **${n}** servidor(es)${daListaEs}.\n`
    + historico.slice(0, 3).map((b) => linhaDoBan(b, serverId, "es")).join("\n")
    + (n > 3 ? `\n_… y ${n - 3} más._` : "");
  const tituloEs = propagado ? "⚠️ Un miembro acaba de ser baneado en otro servidor" : "⚠️ Entró un usuario de la lista global";

  // ── modo que bane, mas sem força para banir: avisa como o `avisar`, dizendo por quê ──
  // (consenso abaixo do mínimo; ou, em qualquer modo, só bans AUTOMÁTICOS — 31 out 2026)
  if (modoBane(modo) && !bastaParaBanir(modo, forca)) {
    const soAuto = forca.total === 0 && forca.automaticos > 0;
    await log.registrar(ctx, "punicoes", {
      titulo: propagado ? "⚠️ Membro acabou de ser banido em outro servidor" : "⚠️ Usuário da lista global entrou",
      descricao: `${resumo}\n\n${soAuto
        ? "_Os bans que constam são **automáticos** (do automod), e ban automático só alerta — não bane aqui. Nada foi feito._"
        : `_Modo **consenso**: só bane com ${MINIMO_CONSENSO}+ servidores diferentes — aqui são ${forca.servidores}. Nada foi feito._`}`,
      en: { titulo: propagado ? "⚠️ Member was just banned on another server" : "⚠️ User from the global list joined",
        descricao: `${resumoEn}\n\n${soAuto
          ? "_The listed bans are **automatic** (by the automod), and an automatic ban only alerts — it doesn't ban here. Nothing was done._"
          : `_**Consensus** mode: bans only with ${MINIMO_CONSENSO}+ different servers — this is ${forca.servidores}. Nothing was done._`}` },
      es: { titulo: tituloEs,
        descricao: `${resumoEs}\n\n${soAuto
          ? "_Los bans que figuran son **automáticos** (del automod), y un ban automático solo alerta — no banea aquí. No se hizo nada._"
          : `_Modo **consensus**: solo banea con ${MINIMO_CONSENSO}+ servidores diferentes — aquí son ${forca.servidores}. No se hizo nada._`}` },
    });
    console.log(`[BANGLOBAL] ⚠️ ${userId} (${forca.servidores} servidor(es), ${forca.automaticos} automático(s)) entrou em ${serverId} — só aviso`);
    return false;
  }

  // ── modo avisar: só alerta, não age ──
  if (modo === "avisar") {
    await log.registrar(ctx, "punicoes", {
      titulo: propagado ? "⚠️ Membro acabou de ser banido em outro servidor" : "⚠️ Usuário da lista global entrou",
      descricao: `${resumo}\n\n_Modo **avisar**: nenhuma ação automática foi tomada._`,
      en: { titulo: propagado ? "⚠️ Member was just banned on another server" : "⚠️ User from the global list joined",
        descricao: `${resumoEn}\n\n_**Warn** mode: no automatic action was taken._` },
      es: { titulo: tituloEs,
        descricao: `${resumoEs}\n\n_Modo **warn**: no se tomó ninguna acción automática._` },
    });
    console.log(`[BANGLOBAL] ⚠️ ${userId} (na lista, ${n} servidor(es)) entrou em ${serverId} — só aviso`);
    return false;
  }

  // ── imediato / consenso (com o mínimo): bane automaticamente ──
  if (modoBane(modo) && bastaParaBanir(modo, forca)) {
    try {
      const server = member.server ?? await ctx.client.servers.fetch(serverId);
      await banir(server, userId, { reason: `[Ban global] banido em ${n} outro(s) servidor(es)` });
      db.registrarBanGlobal(userId, serverId, `ban global (${n} servidores)`, "banglobal",
        { nome: member?.user?.username ?? member?.nickname ?? null });
      await log.registrar(ctx, "punicoes", {
        titulo: "🔨 Ban automático (lista global)",
        descricao: `${resumo}\n\n_Modo **${modo}**: usuário banido automaticamente._`,
        en: { titulo: "🔨 Automatic ban (global list)", descricao: `${resumoEn}\n\n_**${nomeModoBG(modo, true)}** mode: user banned automatically._` },
        es: { titulo: "🔨 Ban automático (lista global)", descricao: `${resumoEs}\n\n_Modo **${nomeModoBG(modo, true)}**: usuario baneado automáticamente._` },
      });
      console.log(`[BANGLOBAL] 🔨 ${userId} banido automaticamente em ${serverId}`);
      return true;
    } catch (err) {
      console.error("[BANGLOBAL][BAN]", descreverErro(err));
      await log.registrar(ctx, "punicoes", {
        titulo: "❌ Falha no ban automático",
        descricao: `${resumo}\n\n**Erro:** ${descreverErro(err)}`,
        en: { titulo: "❌ Automatic ban failed", descricao: `${resumoEn}\n\n**Error:** ${descreverErro(err, "en")}` },
        es: { titulo: "❌ Falló el ban automático", descricao: `${resumoEs}\n\n**Error:** ${descreverErro(err, "es")}` },
      });
      return false;
    }
  }
  return false;
}

export async function varrer(ctx, message, { aplicar = true } = {}) {
  const serverId = ctx.serverId;
  const modo = modoDe(ctx.config);
  const server = await ctx.getServer?.(message);
  if (!server) return { erro: X3(idiomaDe(ctx), "não consegui acessar o servidor", "I couldn't reach the server", "no pude acceder al servidor") };

  let membros = [];
  try {
    const r = await server.fetchMembers();
    membros = r?.members ?? r ?? [];
  } catch (e) {
    registrarErro("BANGLOBAL:varrer", e);
    return { erro: X3(idiomaDe(ctx), "não consegui listar os membros", "I couldn't list the members", "no pude listar a los miembros") };
  }

  const achados = [];
  const isentos = [];
  const abaixo = [];   // no consenso: na lista, mas com menos de MINIMO_CONSENSO servidores
  for (const m of membros) {
    const uid = m?.id?.user ?? m?.user?.id ?? m?.id;
    if (!uid) continue;
    if (ehBot(m) || ehBot(m?.user)) continue;   // bots não são varridos
    const hist = db.historicoBans(uid).filter((b) => b.serverId !== serverId);
    if (!hist.length) continue;
    const nome = m?.user?.username ?? m?.nickname ?? db.nomeDeBanido(uid) ?? uid;
    if (estaIsento(ctx.config, uid)) { isentos.push({ uid, nome, n: hist.length }); continue; }
    const forca = forcaNaLista(hist);
    // no consenso, quem está abaixo do mínimo não é achado da varredura; em
    // qualquer modo, quem só tem ban AUTOMÁTICO também não (31 out 2026)
    const conta = modo === "consenso" ? bastaParaBanir(modo, forca) : forca.total > 0;
    if (!conta) { abaixo.push({ uid, nome, n: forca.servidores }); continue; }
    achados.push({ uid, nome, n: forca.servidores || hist.length, membro: m });
  }

  if (!aplicar || !modoBane(modo)) return { total: membros.length, achados, isentos, abaixo, aplicados: [], modo };

  const aplicados = [];
  for (const a of achados) {
    try {
      await banir(server, a.uid, { reason: `[Ban global] banido em ${a.n} outro(s) servidor(es)` });
      db.registrarBanGlobal(a.uid, serverId, `ban global (${a.n} servidores, varredura)`, "banglobal", { nome: a.nome });
      aplicados.push({ ...a, ok: true });
      console.log(`[BANGLOBAL] 🔨 ${a.uid} banido na varredura de ${serverId}`);
    } catch (e) {
      aplicados.push({ ...a, ok: false, erro: descreverErro(e) });
      console.error(`[BANGLOBAL][varredura] falha em ${a.uid}:`, descreverErro(e));
    }
  }
  if (aplicados.length) {
    await log.registrar(ctx, "punicoes", {
      titulo: "🔨 Varredura da lista global",
      descricao: aplicados.map((a) => `${a.ok ? "🔨" : "❌"} ${a.nome} \`${a.uid}\` — ${a.n} servidor(es)${a.ok ? "" : ` — erro: ${a.erro}`}`).join("\n").slice(0, 1800),
      en: { titulo: "🔨 Global list sweep",
        descricao: aplicados.map((a) => `${a.ok ? "🔨" : "❌"} ${a.nome} \`${a.uid}\` — ${a.n} server(s)${a.ok ? "" : ` — error: ${a.erro}`}`).join("\n").slice(0, 1800) },
      es: { titulo: "🔨 Barrido de la lista global",
        descricao: aplicados.map((a) => `${a.ok ? "🔨" : "❌"} ${a.nome} \`${a.uid}\` — ${a.n} servidor(es)${a.ok ? "" : ` — error: ${a.erro}`}`).join("\n").slice(0, 1800) },
    });
  }
  return { total: membros.length, achados, isentos, abaixo, aplicados, modo };
}

// ── &banglobal (P2, 31 out 2026) ─────────────────────────────────────────────
// A staff (BanMembers) vê o modo, isenta pessoas aqui e consulta o histórico. O
// resto mexe na lista que vale para TODOS os servidores (ou banira em massa) e é
// só do dono do bot — e some da ajuda de quem não é dono. Os sinônimos de modo e os
// nomes antigos dos subcomandos moram no registro (chegam aqui no nome interno).
const SO_DONO = new Set(["off", "avisar", "imediato", "consenso", "lista", "varrer", "revisar", "desfazer", "add", "esquecer", "lembrar", "ignorados", "bots"]);

export async function cmdBanGlobal(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO, serverId } = ctx;
  const l = idiomaDe(ctx);
  const L = (pt, en, es) => X3(l, pt, en, es);
  const canal = message.channel;
  const linha = (cor, pt, en, es) => sendEmbed(canal, { description: tr(ctx, pt, en, es), colour: cor });
  const ajuda = () => `\`${citar("help", l, PREFIXO)} ${citar("banglobal", l, "")}\``;
  const erroUso = (pt, en, es, emoji = "❌") => linha(COR.erro, `${emoji} ${pt} · ${ajuda()}`, `${emoji} ${en} · ${ajuda()}`, `${emoji} ${es} · ${ajuda()}`);

  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "BanMembers")) return semPermissao(ctx, canal, "BanMembers");
  config.banGlobal ??= { modo: "off" };
  config.banGlobal.isentos ??= [];
  let sub = String(args[0] ?? "").toLowerCase();
  // `desfazer <pessoa>` é o `isentar` (da staff); `desfazer [confirmar]` sozinho é do dono
  if (sub === "desfazer" && args[1] && args[1] !== "confirmar") sub = "isentar";
  const dono = !!ctx.ehSuperAdmin?.(message.authorId);
  if (SO_DONO.has(sub) && !dono) return linha(COR.erro, "🔒 Só o dono do bot.", "🔒 Bot owner only.", "🔒 Solo el dueño del bot.");

  // a pessoa de um subcomando (menção, ID, link, nome — entre membros, banidos e a própria lista)
  const alvoDe = async (entrada) => {
    const a = await alvoDoComando(entrada, { message, server, ctx });
    if (!a.erro) return a;
    if (a.erro?.ambiguo) {
      const nomes = a.erro.candidatos.slice(0, 5).map((c) => `**${String(c.nome).slice(0, 32)}** \`${c.id}\``).join(", ");
      await erroUso(`Mais de uma pessoa: ${nomes} — use o ID`, `More than one person: ${nomes} — use the ID`, `Más de una persona: ${nomes} — usa el ID`);
    } else if (!String(entrada ?? "").trim()) await erroUso("Quem?", "Who?", "¿Quién?", "❓");
    else {
      const e = String(entrada).slice(0, 40).replace(/`/g, "");
      await erroUso(`Não achei \`${e}\``, `Couldn't find \`${e}\``, `No encontré \`${e}\``);
    }
    return null;
  };

  // ── &banglobal (e os nomes antigos `auto`/`importar`, que só mostravam o estado) → o modo ──
  if (!sub || sub === "auto" || sub === "importar") {
    const modo = modoDe(config);
    const daqui = db.bansGlobaisDoServidor(serverId);
    // o tamanho da lista inteira é coisa do dono do bot (a lista vale para todos os servidores)
    const total = dono ? db.usuariosBanidosDistintos() : null;
    return linha(COR.info,
      `🌐 Modo: **${nomeModoBG(modo, "pt")}** — ${MODOS[modo]}\n${daqui} registro(s) deste servidor · ${config.banGlobal.isentos.length} isento(s)${total !== null ? ` · ${total} pessoa(s) na lista` : ""}\nContribuição automática: sempre ligada`,
      `🌐 Mode: **${nomeModoBG(modo, "en")}** — ${MODOS_EN[modo]}\n${daqui} record(s) from this server · ${config.banGlobal.isentos.length} exempt${total !== null ? ` · ${total} person(s) on the list` : ""}\nContribution (automatic): always on`,
      `🌐 Modo: **${nomeModoBG(modo, "es")}** — ${MODOS_ES[modo]}\n${daqui} registro(s) de este servidor · ${config.banGlobal.isentos.length} exento(s)${total !== null ? ` · ${total} persona(s) en la lista` : ""}\nContribución automática: siempre activa`);
  }

  // ── <modo> (só o dono do bot) ──
  if (Object.hasOwn(MODOS, sub)) {
    config.banGlobal.modo = sub;
    salvarConfig();
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Modo da lista global", descricao: `<@${message.authorId}> → **${nomeModoBG(sub, "pt")}**`,
      en: { titulo: "🌐 Global list mode", descricao: `<@${message.authorId}> → **${nomeModoBG(sub, "en")}**` },
      es: { titulo: "🌐 Modo de la lista global", descricao: `<@${message.authorId}> → **${nomeModoBG(sub, "es")}**` } });
    return linha(COR.sucesso, `🌐 Modo: **${nomeModoBG(sub, "pt")}**.`, `🌐 Mode: **${nomeModoBG(sub, "en")}**.`, `🌐 Modo: **${nomeModoBG(sub, "es")}**.`);
  }

  // ── historico <pessoa> ──
  if (sub === "historico") {
    const alvo = await alvoDe(args.slice(1).join(" "));
    if (!alvo) return;
    const quem = rotularUsuario(alvo.id, { nome: alvo.nome, client: ctx.client, en: l === "es" ? "es" : l === "en" });
    const hist = db.historicoBans(alvo.id);
    if (!hist.length) return linha(COR.sucesso, `🌐 ${quem} não consta na lista.`, `🌐 ${quem} isn't on the list.`, `🌐 ${quem} no está en la lista.`);
    const n = new Set(hist.map((b) => b.serverId)).size;
    const linhas = [L(`banido em **${n}** servidor(es):`, `banned on **${n}** server(s):`, `baneado en **${n}** servidor(es):`), ...hist.slice(0, 10).map((b) => linhaDoBan(b, serverId, l))];
    if (hist.length > 10) linhas.push(L(`_… e mais ${hist.length - 10}._`, `_… and ${hist.length - 10} more._`, `_… y ${hist.length - 10} más._`));
    return sendEmbed(canal, { title: `🌐 ${quem}`, description: tr(ctx, linhas.join("\n"), linhas.join("\n"), linhas.join("\n")), colour: COR.aviso });
  }

  // ── isentar [remover] <pessoa> | isentar (sem pessoa) = os isentos ──
  // `desfazer <pessoa>` é o mesmo que `isentar <pessoa>`; `isentos` lista.
  if (sub === "isentar" || sub === "isentos") {
    const removendo = sub === "isentar" && args[1] === "remover";
    const entrada = args.slice(removendo ? 2 : 1).join(" ");
    if (sub === "isentos" || !entrada.trim()) {
      const ids = config.banGlobal.isentos;
      if (!ids.length) return linha(COR.info, "🛡️ Ninguém isento aqui.", "🛡️ Nobody exempt here.", "🛡️ Nadie exento aquí.");
      const linhas = ids.map((u) => `• ${rotularUsuario(u, { client: ctx.client, en: l === "es" ? "es" : l === "en" })}`);
      return enviarPaginado(ctx, canal, { paginas: paginarLinhas(linhas, { titulo: L(`🛡️ Isentos — ${ids.length}`, `🛡️ Exempt — ${ids.length}`, `🛡️ Exentos — ${ids.length}`) }), autorId: message.authorId, colour: COR.info });
    }
    const alvo = await alvoDe(entrada);
    if (!alvo) return;
    const uid = alvo.id;
    const quem = rotularUsuario(uid, { nome: alvo.nome, client: ctx.client, en: l === "es" ? "es" : l === "en" });
    if (removendo) {
      const estava = config.banGlobal.isentos.includes(uid);
      config.banGlobal.isentos = config.banGlobal.isentos.filter((u) => u !== uid);
      salvarConfig();
      return linha(COR.mod, estava ? `🛡️ ${quem} não está mais isento.` : `🤷 ${quem} não estava isento.`, estava ? `🛡️ ${quem} is no longer exempt.` : `🤷 ${quem} wasn't exempt.`, estava ? `🛡️ ${quem} ya no está exento.` : `🤷 ${quem} no estaba exento.`);
    }
    if (!config.banGlobal.isentos.includes(uid)) config.banGlobal.isentos.push(uid);
    salvarConfig();
    // se foi a LISTA que o baniu aqui, o ban é desfeito junto
    let extra = ["", "", ""];
    if (db.bansGlobaisPorOrigem(serverId, ["banglobal"]).some((b) => b.userId === uid)) {
      const r = await desbanir(server, serverId, uid, l);
      if (r.ok) { db.removerBanGlobal(uid, serverId); extra = [" — ban da lista desfeito", " — the list's ban undone", " — ban de la lista deshecho"]; }
      else extra = [` — ⚠️ Não consegui desbanir: ${r.erro}`, ` — ⚠️ couldn't unban: ${r.erro}`, ` — ⚠️ no pude desbanear: ${r.erro}`];
    }
    await log.registrar(ctx, "punicoes", {
      titulo: "🛡️ Isenção da lista global", descricao: `<@${message.authorId}> isentou <@${uid}>${extra[0]}.`,
      en: { titulo: "🛡️ Global list exemption", descricao: `<@${message.authorId}> exempted <@${uid}>${extra[1]}.` },
      es: { titulo: "🛡️ Exención de la lista global", descricao: `<@${message.authorId}> eximió a <@${uid}>${extra[2]}.` } });
    return linha(COR.sucesso, `🛡️ ${quem} isento aqui${extra[0]}.`, `🛡️ ${quem} exempt here${extra[1]}.`, `🛡️ ${quem} exento aquí${extra[2]}.`);
  }

  // ── lista [servidor] (dono do bot: a de todos; `servidor` = só a deste) ──
  if (sub === "lista") {
    const soDaqui = args[1] === "servidor";
    const regs = db.listarBanidosGlobais({ limite: 500, serverId: soDaqui ? serverId : null });
    if (!regs.length) return linha(COR.info, "🌐 Lista vazia.", "🌐 Empty list.", "🌐 Lista vacía.");
    const isentos = config.banGlobal.isentos;
    const linhas = regs.map((b) => `${isentos.includes(b.userId) ? "🛡️ " : ""}${rotularUsuario(b.userId, { nome: b.nome, client: ctx.client, en: l === "es" ? "es" : l === "en" })} — ${soDaqui ? (String(b.motivo ?? "").slice(0, 60) || "—") : `${b.servidores} ${L("servidor(es)", "server(s)", "servidor(es)")}`} · ${carimbo(b.ultimo, "d")}`);
    return enviarPaginado(ctx, canal, {
      paginas: paginarLinhas(linhas, { titulo: soDaqui ? L("🌐 Banidos por este servidor", "🌐 Banned by this server", "🌐 Baneados por este servidor") : L(`🌐 Lista global (todos os servidores) — ${regs.length}`, `🌐 Global list (all servers) — ${regs.length}`, `🌐 Lista global (todos los servidores) — ${regs.length}`), limite: 1300 }),
      autorId: message.authorId, comandoPagina: citarInterno("banglobal.lista", PREFIXO), colour: COR.mod,
    });
  }

  // ── varrer [confirmar] (o `revisar` antigo = a prévia, sem confirmar) ──
  if (sub === "varrer" || sub === "revisar") {
    const confirmou = sub === "varrer" && args[1] === "confirmar";
    const r = await varrer(ctx, message, { aplicar: confirmou });
    if (r.erro) return linha(COR.erro, `❌ ${r.erro}`, `❌ ${r.erro}`, `❌ ${r.erro}`);
    if (!r.achados.length) {
      const ise = r.isentos.length ? [` · 🛡️ ${r.isentos.length} isento(s)`, ` · 🛡️ ${r.isentos.length} exempt`, ` · 🛡️ ${r.isentos.length} exento(s)`] : ["", "", ""];
      return linha(COR.sucesso, `✅ ${r.total} membro(s), ninguém a banir${ise[0]}. Nada foi feito.`, `✅ ${r.total} member(s), nobody to ban${ise[1]}. Nothing was done.`, `✅ ${r.total} miembro(s), nadie que banear${ise[2]}. No se hizo nada.`);
    }
    const nomes = r.achados.slice(0, 15).map((a) => `• **${String(a.nome).slice(0, 32)}** \`${a.uid}\` — ${a.n}`);
    if (r.achados.length > 15) nomes.push(L(`… e mais ${r.achados.length - 15}`, `… and ${r.achados.length - 15} more`, `… y ${r.achados.length - 15} más`));
    if (!confirmou) {
      // a prévia (o `revisar` de antes): mostra, diz que nada foi feito e quem está isento
      const cmd = `\`${citar("banglobal.varrer.confirmar", l, PREFIXO)}\``;
      const pre = modoBane(r.modo)
        ? [`Nada foi feito. Para banir: ${cmd}`, `Nothing was done. To ban: ${cmd}`, `No se hizo nada. Para banear: ${cmd}`]
        : [`Nada foi feito: o modo **${nomeModoBG(r.modo, "pt")}** não bane.`, `Nothing was done: **${nomeModoBG(r.modo, "en")}** mode doesn't ban.`, `No se hizo nada: el modo **${nomeModoBG(r.modo, "es")}** no banea.`];
      const ise = r.isentos.length ? [L(`🛡️ Isentos: ${r.isentos.map((x) => `\`${x.uid}\``).join(", ")}`, `🛡️ Exempt: ${r.isentos.map((x) => `\`${x.uid}\``).join(", ")}`, `🛡️ Exentos: ${r.isentos.map((x) => `\`${x.uid}\``).join(", ")}`)] : [];
      return sendEmbed(canal, { title: L(`🔎 Revisão — ${r.achados.length} na lista`, `🔎 Review — ${r.achados.length} on the list`, `🔎 Revisión — ${r.achados.length} en la lista`),
        description: tr(ctx, [...nomes, ...ise, "", pre[0]].join("\n"), [...nomes, ...ise, "", pre[1]].join("\n"), [...nomes, ...ise, "", pre[2]].join("\n")), colour: COR.aviso });
    }
    if (!modoBane(r.modo)) return linha(COR.aviso, `⚠️ O modo **${nomeModoBG(r.modo, "pt")}** não bane.`, `⚠️ **${nomeModoBG(r.modo, "en")}** mode doesn't ban.`, `⚠️ El modo **${nomeModoBG(r.modo, "es")}** no banea.`);
    const ok = r.aplicados.filter((a) => a.ok).length, falhas = r.aplicados.filter((a) => !a.ok);
    const f = falhas.slice(0, 5).map((x) => `❌ ${String(x.nome).slice(0, 32)}: ${x.erro}`);
    return linha(falhas.length ? COR.aviso : COR.sucesso, [`🔨 ${ok} banido(s).`, ...f].join("\n"), [`🔨 ${ok} banned.`, ...f].join("\n"), [`🔨 ${ok} baneado(s).`, ...f].join("\n"));
  }

  // ── desfazer [confirmar]: reverte os bans que a LISTA aplicou aqui (e isenta) ──
  if (sub === "desfazer") {
    const aplicados = db.bansGlobaisPorOrigem(serverId, ["banglobal"]);
    if (!aplicados.length) return linha(COR.sucesso, "✅ A lista não baniu ninguém aqui.", "✅ The list banned nobody here.", "✅ La lista no baneó a nadie aquí.");
    if (args[1] !== "confirmar") {
      const cmd = `\`${citar("banglobal.desfazer.confirmar", l, PREFIXO)}\``;
      return linha(COR.aviso, `↩️ ${aplicados.length} ban(s) da lista aqui. Para desfazer e isentar: ${cmd}`, `↩️ ${aplicados.length} ban(s) by the list here. To undo and exempt: ${cmd}`, `↩️ ${aplicados.length} ban(s) de la lista aquí. Para deshacer y eximir: ${cmd}`);
    }
    let ok = 0;
    const falhas = [];
    for (const b of aplicados) {
      const r = await desbanir(server, serverId, b.userId, l);
      if (!r.ok) { falhas.push(`❌ \`${b.userId}\`: ${r.erro}`); continue; }
      db.removerBanGlobal(b.userId, serverId);
      if (!config.banGlobal.isentos.includes(b.userId)) config.banGlobal.isentos.push(b.userId);
      ok++;
    }
    salvarConfig();
    await log.registrar(ctx, "punicoes", {
      titulo: "↩️ Bans da lista global desfeitos", descricao: `<@${message.authorId}>: ${ok} desfeito(s), isento(s) aqui.`,
      en: { titulo: "↩️ Global list bans undone", descricao: `<@${message.authorId}>: ${ok} undone, exempt here.` },
      es: { titulo: "↩️ Bans de la lista global deshechos", descricao: `<@${message.authorId}>: ${ok} deshecho(s), exento(s) aquí.` } });
    const f = falhas.slice(0, 5);
    return linha(falhas.length ? COR.aviso : COR.sucesso, [`↩️ ${ok} desfeito(s) e isento(s).`, ...f].join("\n"), [`↩️ ${ok} undone and exempt.`, ...f].join("\n"), [`↩️ ${ok} deshecho(s) y exento(s).`, ...f].join("\n"));
  }

  // ── add <id> [id…] [motivo] — pôr na lista quem não está em servidor nenhum ──
  if (sub === "add") {
    const { ids, motivo, descartados } = separarIdsEMotivo(args.slice(1));
    if (!ids.length) return erroUso("Quais IDs?", "Which IDs?", "¿Qué IDs?");
    const r = await adicionarPorId(ids, { ctx, motivo, porId: message.authorId });
    const MOT = { "nao-existe": ["nenhuma conta do Stoat tem esse ID", "no Stoat account has this ID", "ninguna cuenta de Stoat tiene ese ID"], bot: ["é um bot", "it's a bot", "es un bot"], eu: ["sou eu", "that's me", "soy yo"], dono: ["é o dono do bot", "that's the bot owner", "es el dueño del bot"] };
    const i = l === "es" ? 2 : l === "en" ? 1 : 0;
    // o resultado de cada ID (o que aconteceu com ele é o resultado do comando)
    const linhas = [
      ...r.adicionados.map((a) => {
        const banidos = a.acoes.filter((x) => x.acao === "banido").length, avisados = a.acoes.filter((x) => x.acao === "avisado").length;
        return `✅ ${rotularUsuario(a.id, { nome: a.nome, en: l === "es" ? "es" : l === "en" })}`
          + (a.jaEstava ? L(" — já estava na lista", " — was already listed", " — ya estaba en la lista") : "")
          + (a.voltouDosIgnorados ? L(" — estava nos ignorados; saiu de lá", " — was on the ignored list; taken off it", " — estaba en los ignorados; salió de ahí") : "")
          + (a.semConfirmar ? L(" — ⚠️ não consegui confirmar a conta no Stoat", " — ⚠️ I couldn't confirm the account with Stoat", " — ⚠️ no pude confirmar la cuenta en Stoat") : "")
          + (banidos ? L(` — **banido agora** em ${banidos} servidor(es)`, ` — **banned now** in ${banidos} server(s)`, ` — **baneado ahora** en ${banidos} servidor(es)`) : "")
          + (avisados ? L(` — staff avisada em ${avisados}`, ` — staff warned in ${avisados}`, ` — staff avisado en ${avisados}`) : "");
      }),
      ...r.recusados.map((x) => `❌ \`${x.id}\` — ${(MOT[x.motivo] ?? [x.motivo, x.motivo, x.motivo])[i]}`),
      ...(descartados.length ? [L(`_Não são IDs: ${descartados.map((d) => `\`${d}\``).join(" ")}_`, `_Not IDs: ${descartados.map((d) => `\`${d}\``).join(" ")}_`, `_No son IDs: ${descartados.map((d) => `\`${d}\``).join(" ")}_`)] : []),
      `**${L("Motivo", "Reason", "Motivo")}:** ${motivo || "—"}`,
    ];
    if (r.adicionados.length) await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Adicionado(s) à lista global pelo dono", descricao: `<@${message.authorId}>: ${r.adicionados.map((a) => `\`${a.id}\``).join(", ")}${motivo ? ` — ${motivo}` : ""}`,
      en: { titulo: "🌐 Added to the global list by the owner", descricao: `<@${message.authorId}>: ${r.adicionados.map((a) => `\`${a.id}\``).join(", ")}${motivo ? ` — ${motivo}` : ""}` },
      es: { titulo: "🌐 Agregado(s) a la lista global por el dueño", descricao: `<@${message.authorId}>: ${r.adicionados.map((a) => `\`${a.id}\``).join(", ")}${motivo ? ` — ${motivo}` : ""}` } });
    const n = r.adicionados.length;
    return enviarPaginado(ctx, canal, { paginas: paginarLinhas(linhas, { titulo: L(`🌐 Lista global — ${n} adicionado(s)`, `🌐 Global list — ${n} added`, `🌐 Lista global — ${n} agregado(s)`) }), autorId: message.authorId, colour: r.recusados.length ? COR.aviso : COR.mod });
  }

  // ── esquecer <pessoa> [nota] — apaga para todos e a mantém fora ──
  if (sub === "esquecer") {
    const alvo = await alvoDe(args[1] ?? "");
    if (!alvo) return;
    const n = db.esquecerUsuario(alvo.id, { nome: alvo.nome ?? null, motivo: args.slice(2).join(" ").trim().slice(0, 200) || null, porQuem: message.authorId });
    const quem = rotularUsuario(alvo.id, { nome: alvo.nome, client: ctx.client, en: l === "es" ? "es" : l === "en" });
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Removido da lista global", descricao: `<@${message.authorId}>: \`${alvo.id}\` (${n} registro(s)).`,
      en: { titulo: "🌐 Removed from the global list", descricao: `<@${message.authorId}>: \`${alvo.id}\` (${n} record(s)).` },
      es: { titulo: "🌐 Quitado de la lista global", descricao: `<@${message.authorId}>: \`${alvo.id}\` (${n} registro(s)).` } });
    return linha(COR.sucesso, `🌐 ${quem} fora da lista (${n} registro(s)) e não volta.`, `🌐 ${quem} off the list (${n} record(s)) and won't come back.`, `🌐 ${quem} fuera de la lista (${n} registro(s)) y no vuelve.`);
  }

  // ── lembrar <pessoa> — desfaz o esquecer ──
  if (sub === "lembrar") {
    const alvo = await alvoDe(args.slice(1).join(" "));
    if (!alvo) return;
    const n = db.deixarDeIgnorarGlobal(alvo.id);
    const quem = rotularUsuario(alvo.id, { nome: alvo.nome, client: ctx.client, en: l === "es" ? "es" : l === "en" });
    return n
      ? linha(COR.sucesso, `🌐 ${quem} pode voltar à lista.`, `🌐 ${quem} can be listed again.`, `🌐 ${quem} puede volver a la lista.`)
      : linha(COR.info, `🤷 ${quem} não estava marcado.`, `🤷 ${quem} wasn't marked.`, `🤷 ${quem} no estaba marcado.`);
  }

  // ── ignorados — quem está marcado para ficar fora ──
  if (sub === "ignorados") {
    const regs = db.listarIgnoradosGlobais();
    if (!regs.length) return linha(COR.info, "📋 Ninguém marcado.", "📋 Nobody marked.", "📋 Nadie marcado.");
    const linhas = regs.map((x) => `• ${rotularUsuario(x.userId, { nome: x.nome, client: ctx.client, en: l === "es" ? "es" : l === "en" })}${x.motivo ? ` — ${String(x.motivo).slice(0, 60)}` : ""}`);
    return enviarPaginado(ctx, canal, { paginas: paginarLinhas(linhas, { titulo: L(`📋 Fora da lista — ${regs.length}`, `📋 Kept off the list — ${regs.length}`, `📋 Fuera de la lista — ${regs.length}`) }), autorId: message.authorId, colour: COR.info });
  }

  // ── bots [confirmar|<pessoa>] — os bots que estavam na lista ──
  if (sub === "bots") {
    if (args[1] && args[1] !== "confirmar") {
      const alvo = await alvoDe(args.slice(1).join(" "));
      if (!alvo) return;
      const v = await confirmarSeEhBot(alvo.id, { client: ctx.client });
      return v.ehBot
        ? linha(COR.info, `🤖 \`${alvo.id}\` é bot (${v.via}).`, `🤖 \`${alvo.id}\` is a bot (${v.via}).`, `🤖 \`${alvo.id}\` es un bot (${v.via}).`)
        : linha(COR.aviso, `🙋 Nenhum sinal diz que \`${alvo.id}\` é bot.`, `🙋 No signal says \`${alvo.id}\` is a bot.`, `🙋 Ninguna señal dice que \`${alvo.id}\` sea un bot.`);
    }
    await idsDoDiscover();
    const achados = [];
    for (const uid of db.idsBanidosGlobais()) {
      const v = await confirmarSeEhBot(uid, { client: ctx.client });
      if (v.ehBot) achados.push({ id: uid, nome: db.nomeDeBanido(uid) ?? null });
    }
    if (!achados.length) return linha(COR.sucesso, "✅ Nenhum bot na lista.", "✅ No bots on the list.", "✅ Ningún bot en la lista.");
    if (args[1] !== "confirmar") {
      const cmd = `\`${citar("banglobal.bots.confirmar", l, PREFIXO)}\``;
      const nomes = achados.slice(0, 15).map((a) => `• ${a.nome ? `**${String(a.nome).slice(0, 32)}** ` : ""}\`${a.id}\``).join("\n");
      return linha(COR.aviso, `🤖 ${achados.length} bot(s):\n${nomes}\nPara tirar: ${cmd}`, `🤖 ${achados.length} bot(s):\n${nomes}\nTo remove: ${cmd}`, `🤖 ${achados.length} bot(s):\n${nomes}\nPara quitarlos: ${cmd}`);
    }
    const n = db.removerBotsDaLista(achados);
    await log.registrar(ctx, "punicoes", {
      titulo: "🤖 Bots removidos da lista global", descricao: `<@${message.authorId}>: ${achados.length} bot(s), ${n} registro(s).`,
      en: { titulo: "🤖 Bots removed from the global list", descricao: `<@${message.authorId}>: ${achados.length} bot(s), ${n} record(s).` },
      es: { titulo: "🤖 Bots quitados de la lista global", descricao: `<@${message.authorId}>: ${achados.length} bot(s), ${n} registro(s).` } });
    return linha(COR.sucesso, `🤖 ${achados.length} bot(s) fora da lista.`, `🤖 ${achados.length} bot(s) off the list.`, `🤖 ${achados.length} bot(s) fuera de la lista.`);
  }

  return erroUso(`\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` não existe`, `\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` doesn't exist`, `\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` no existe`);
}

// ─── Propagação: um ban num servidor da Judy vale na hora para os outros ────
//
// No raid de 27/09 as mesmas contas pularam entre 3 servidores da Judy. O ban
// num servidor só chegava aos outros na sincronização de 6h — tarde demais.
// Agora, quando alguém SAI de um servidor, o bot confere se foi ban; se foi,
// registra na lista global na hora e aplica o modo de cada OUTRO servidor onde
// a pessoa ainda está (off: nada · avisar: alerta a staff · imediato/consenso: bane, o consenso só com o mínimo).
// A sincronização de 6h continua como rede de segurança.
const ESPERA_BAN_MS = Number(process.env.BANGLOBAL_PROPAGAR_ESPERA_MS || 1500);

export async function propagarSeFoiBan(serverId, userId, { client, criarContexto, espera = ESPERA_BAN_MS } = {}) {
  const saida = { foiBan: false, acoes: [] };
  if (!serverId || !userId || !client) return saida;
  if (db.estaIgnoradoGlobal(userId) || ehBotConhecido(userId, { client })) return saida;

  // O evento de saída pode chegar antes do ban aparecer na lista.
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  let origem;
  try { origem = client.servers?.get?.(serverId) ?? await client.servers.fetch(serverId); } catch { return saida; }

  let ban = null, porId = new Map();
  try {
    const bans = await origem.fetchBans();       // exige BanMembers na origem
    for (const u of bans?.users ?? []) porId.set(u?.id ?? u?._id, u);
    ban = (bans?.bans ?? bans ?? []).find((x) => (x?.id?.user ?? x?.user?.id ?? x?.id) === userId) ?? null;
  } catch (e) {
    console.log(`[BANGLOBAL] propagar: não consegui ler os bans de ${serverId} (${descreverErro(e)}) — fica para a sincronização de 6h`);
    return saida;
  }
  if (!ban) return saida;                        // saiu ou foi expulso: não é ban
  saida.foiBan = true;

  const u = ban?.user ?? porId.get(userId) ?? null;
  if (ehBot(ban) || ehBot(u)) return saida;
  const nome = u?.username ?? null;
  // Ban que a PRÓPRIA lista aplicou ali: registra como dela e não repassa —
  // senão um ban só, ecoando por servidores no modo imediato, inflava a
  // contagem do consenso (15 out 2026).
  if (ehDaPropriaLista({ motivo: ban?.reason })) {
    db.registrarBanGlobal(userId, serverId, ban.reason, "banglobal", { nome });
    return saida;
  }
  db.registrarBanGlobal(userId, serverId, ban?.reason ?? "banido no servidor", origemParaGravar(userId, serverId, "propagado"), { nome });
  console.log(`[BANGLOBAL] propagado: ${userId} banido em ${serverId} — conferindo os outros servidores`);

  saida.acoes = await aplicarNosServidores(userId, { client, criarContexto, exceto: serverId });
  return saida;
}

// Aplica o modo de cada servidor onde a pessoa ESTÁ agora (off: nada ·
// avisar: alerta a staff · imediato/consenso: bane). Usado pela propagação de ban e pelo
// `&banglobal add`.
export async function aplicarNosServidores(userId, { client, criarContexto, exceto = null } = {}) {
  const acoes = [];
  if (!criarContexto) return acoes;
  for (const outro of client?.servers?.values?.() ?? []) {
    const sid = outro?.id;
    if (!sid || sid === exceto) continue;
    let membro;
    try { membro = await outro.fetchMember(userId); } catch { continue; }   // não é membro ali
    if (!membro) continue;
    const ctx = criarContexto(sid);
    const modo = modoDe(ctx.config);
    const baniu = await verificarEntrada(membro, ctx, { propagado: true });
    acoes.push({ serverId: sid, modo, acao: baniu ? "banido" : (modo === "avisar" || modo === "consenso") ? "avisado" : "nada" });
  }
  return acoes;
}

// ── &banglobal add: o núcleo, testável sem comando ──────────────────────────
// Separa os IDs (no começo) do motivo (o resto). Menção e link de perfil valem.
export function separarIdsEMotivo(tokens, max = 25) {
  const ids = [], descartados = [];
  let i = 0;
  for (; i < tokens.length; i++) {
    const t = String(tokens[i] ?? "").trim();
    if (!t) continue;
    const id = idValido(t) || (t.match(/(?:\/user\/|\/@)([0-9A-HJKMNP-TV-Z]{26})/i)?.[1]?.toUpperCase() ?? "");
    if (!id) break;
    if (!ids.includes(id)) ids.push(id);
  }
  // algo com cara de ID logo depois (ex.: um caractere a menos) não some calado
  for (const t of tokens.slice(i, i + 3)) if (/^<?@?[0-9A-Za-z]{20,30}>?$/.test(String(t))) descartados.push(String(t));
  return { ids: ids.slice(0, max), motivo: tokens.slice(i).join(" ").trim().slice(0, 300), descartados };
}

export async function adicionarPorId(ids, { ctx, motivo = "", porId = null }) {
  const client = ctx?.client;
  const r = { adicionados: [], recusados: [] };
  for (const id of ids) {
    if (id === client?.user?.id) { r.recusados.push({ id, motivo: "eu" }); continue; }
    if (ctx?.ehSuperAdmin?.(id)) { r.recusados.push({ id, motivo: "dono" }); continue; }
    // A conta existe? (o ID pode ter um caractere trocado — e então entraria
    // na lista para sempre sem ninguém notar)
    let usuario = null, semConfirmar = false;
    try { usuario = await client?.users?.fetch?.(id); }
    catch (e) {
      if (tipoDoErro(e) === "NotFound") { r.recusados.push({ id, motivo: "nao-existe" }); continue; }
      semConfirmar = true;
      console.log(`[BANGLOBAL] add: não confirmei ${id} (${descreverErro(e)}) — entra assim mesmo`);
    }
    if (ehBot(usuario) || ehBotConhecido(id, { client })) { r.recusados.push({ id, motivo: "bot" }); continue; }
    // o dono pediu pelo ID: a marca de "não volta" de um `esquecer` antigo cede
    const voltouDosIgnorados = db.estaIgnoradoGlobal(id) ? db.deixarDeIgnorarGlobal(id) > 0 : false;
    const jaEstava = db.historicoBans(id).length > 0;
    const nome = usuario?.username ?? db.nomeDeBanido(id) ?? null;
    db.registrarBanGlobal(id, ORIGEM_DONO, motivo || "adicionado pelo dono do bot", "adicionado", { nome });
    console.log(`[BANGLOBAL] add: ${id} (${nome ?? "?"}) posto na lista por ${porId ?? "?"}`);
    const acoes = await aplicarNosServidores(id, { client, criarContexto: ctx?.criarContexto });
    r.adicionados.push({ id, nome, jaEstava, voltouDosIgnorados, semConfirmar, acoes });
  }
  return r;
}
