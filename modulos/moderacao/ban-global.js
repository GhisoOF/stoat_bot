
import * as db  from "../core/db.js";
import { citar, citarInterno } from "../core/aliases.js";
import { descreverErro, tipoDoErro, registrarErro } from "../core/erros.js";
import { banir } from "../core/banir.js";
import * as log from "../core/log.js";
import { resolverUsuarioDetalhado, ehBot, idValido } from "../core/ids.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
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
// nomes antigos e em inglês → o modo de hoje (`banir` salvo antes continua valendo, como imediato)
const MODO_SINONIMO = {
  banir: "imediato", ban: "imediato", instant: "imediato", immediate: "imediato", cego: "imediato",
  consensus: "consenso", cautela: "consenso", cautious: "consenso",
  warn: "avisar", alert: "avisar", alertar: "avisar", ignorar: "off", ignore: "off",
};
export const nomeModoBG = (m, en = false) => (en ? { off: "off", avisar: "warn", imediato: "instant", consenso: "consensus" }[m] ?? m : m);
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
export function ehAutomatico(b) {
  return b?.origem === "automod" || b?.origem === "avatar" || /^\s*\[automod\]/i.test(String(b?.motivo ?? ""));
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
// Formata uma data legível a partir de um timestamp
const data = (ms) => new Date(ms).toISOString().slice(0, 10);

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

function embedAlvoNaoResolvido(ctx, r, entrada, uso, usoEs = uso) {
  const { COR, PREFIXO } = ctx;
  if (r?.ambiguo) {
    const lista = r.candidatos.map((c) => `• **${c.nome}** — \`${c.id}\``).join("\n");
    return tr(ctx, {
      title: "🤔 Mais de uma pessoa com esse nome",
      description: `Encontrei ${r.candidatos.length} para \`${entrada}\`:\n\n${lista}\n\nRepita usando o **ID** de quem você quer — assim não corro o risco de agir sobre a pessoa errada.`,
      colour: COR.aviso,
    }, {
      title: "🤔 More than one person with that name",
      description: `I found ${r.candidatos.length} for \`${entrada}\`:\n\n${lista}\n\nRun it again with the **ID** of the one you mean — that way I can't act on the wrong person.`,
      colour: COR.aviso,
    }, {
      title: "🤔 Más de una persona con ese nombre",
      description: `Encontré ${r.candidatos.length} para \`${entrada}\`:\n\n${lista}\n\nRepite usando el **ID** de quien quieres — así no corro el riesgo de actuar sobre la persona equivocada.`,
      colour: COR.aviso,
    });
  }
  // Sem ninguém no comando (`&banglobal esquecer` sozinho) é pergunta, não "não achei" (17 out 2026)
  const vazio = !String(entrada ?? "").trim();
  return tr(ctx, {
    title: vazio ? "❓ Quem?" : "❌ Não achei essa pessoa",
    description: [
      `\`${uso}\``,
      "",
      entrada ? `Procurei por **${entrada}** entre os membros, os banidos e a própria lista global.` : "",
      "Aceito **menção**, **ID**, **link do perfil**, o **nome** ou `Nome#0000`.",
      "",
      `_Se a pessoa não está em nenhum servidor em comum, só o **ID** funciona — ele aparece em \`${citarInterno("banglobal.lista", PREFIXO)}\`._`,
    ].filter(Boolean).join("\n"), colour: vazio ? COR.aviso : COR.erro,
  }, {
    title: vazio ? "❓ Who?" : "❌ Couldn't find that person",
    description: [
      `\`${uso}\``,
      "",
      entrada ? `I looked for **${entrada}** among the members, the banned users and the global list itself.` : "",
      "I accept a **mention**, an **ID**, a **profile link**, the **name** or `Name#0000`.",
      "",
      `_If they're not in any shared server, only the **ID** works — it shows in \`${citarInterno("banglobal.lista", PREFIXO)}\`._`,
    ].filter(Boolean).join("\n"), colour: vazio ? COR.aviso : COR.erro,
  }, {
    title: vazio ? "❓ ¿Quién?" : "❌ No encontré a esa persona",
    description: [
      `\`${usoEs}\``,
      "",
      entrada ? `Busqué **${entrada}** entre los miembros, los baneados y la propia lista global.` : "",
      "Acepto **mención**, **ID**, **enlace del perfil**, el **nombre** o `Nombre#0000`.",
      "",
      `_Si la persona no está en ningún servidor en común, solo funciona el **ID** — aparece en \`${citar("banglobal.lista", "es", PREFIXO)}\`._`,
    ].filter(Boolean).join("\n"), colour: vazio ? COR.aviso : COR.erro,
  });
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
async function desbanir(server, serverId, userId, lang = "pt") {
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
    if (db.registrarBanGlobal(uid, serverId, b?.reason ?? "importado do servidor", "importado", { nome })) novos++;
  }
  return { total: lista.length, novos, bots, ignorados };
}

const INTERVALO_MS = Number(process.env.BANGLOBAL_IMPORT_MS || 6 * 60 * 60_000);   // 6h
const ATRASO_BOOT_MS = Number(process.env.BANGLOBAL_IMPORT_BOOT_MS || 60_000);     // 1min após o boot
const ESPACO_MS = Number(process.env.BANGLOBAL_ESPACO_MS || 3000);   // respiro entre servidores, para não estourar rate limit

async function sincronizarTodos(client, criarContexto) {
  const servidores = [...(client.servers?.values?.() ?? [])];
  if (!servidores.length) return;

  let somaNovos = 0, tocados = 0;
  for (const server of servidores) {
    const sid = server?.id ?? server?._id;
    if (!sid) continue;
    let ctx;
    try { ctx = criarContexto(sid); } catch { continue; }
    if (typeof server.fetchBans !== "function") continue;

    try {
      const { total, novos } = await importarBansDoServidor(server, sid, client);
      tocados++;
      if (novos > 0) {
        somaNovos += novos;
        console.info(`[BANGLOBAL] auto: ${novos} novo(s) de ${total} ban(s) em ${server.name ?? sid}`);
        await log.registrar(ctx, "punicoes", {
          titulo: "🌐 Bans importados automaticamente",
          descricao: `**${novos}** ban(s) deste servidor entraram na lista global.`,
en: { titulo: "🌐 Bans imported automatically", descricao: `**${novos}** ban(s) from this server joined the global list.` },
          es: { titulo: "🌐 Bans importados automáticamente", descricao: `**${novos}** ban(s) de este servidor entraron en la lista global.` },
        });
      }
    } catch (err) {
      // `err?.message` era undefined: a API do Stoat rejeita com string JSON.
      console.error(`[BANGLOBAL] auto: falha em ${server?.name ?? sid}: ${descreverErro(err)}`);
    }
    await new Promise((r) => setTimeout(r, ESPACO_MS));
  }
  if (tocados) {
    console.info(`[BANGLOBAL] auto: ${tocados} servidor(es) sincronizado(s), ${somaNovos} registro(s) novo(s).`);
  }
}

export async function sincronizarServidor(server, criarContexto) {
  const sid = server?.id ?? server?._id;
  if (!sid || typeof server?.fetchBans !== "function") return;
  try {
    const ctx = criarContexto(sid);
    const { total, novos } = await importarBansDoServidor(server, sid, ctx?.client ?? null);
    if (novos > 0) {
      console.info(`[BANGLOBAL] servidor novo ${server.name ?? sid}: ${novos} de ${total} ban(s) importado(s).`);
      await log.registrar(ctx, "punicoes", {
        titulo: "🌐 Bans importados automaticamente",
        descricao: `**${novos}** ban(s) deste servidor entraram na lista global.`,
en: { titulo: "🌐 Bans imported automatically", descricao: `**${novos}** ban(s) from this server joined the global list.` },
        es: { titulo: "🌐 Bans importados automáticamente", descricao: `**${novos}** ban(s) de este servidor entraron en la lista global.` },
      });
    }
  } catch (err) {
    console.error(`[BANGLOBAL] servidor novo ${server?.name ?? sid}: ${descreverErro(err)}`);   // (err?.message vinha vazio: o erro da API é texto)
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

export async function cmdBanGlobal(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO, serverId } = ctx;
  const lang = lingua(ctx);
  const L_MODOS = lang === "en" ? MODOS_EN : MODOS;
  const MODO_BG_EN = { avisar: "warn", imediato: "instant", consenso: "consensus", off: "off" };

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "BanMembers")) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **BanMembers** para usar este comando.",
      colour: COR.erro,
    }, {
      title: "🚫 Missing permission",
      description: "You need the **BanMembers** permission to use this command.",
      colour: COR.erro,
    }, {
      title: "🚫 Permiso insuficiente",
      description: "Necesitas el permiso **BanMembers** para usar este comando.",
      colour: COR.erro,
    }));
  }

  config.banGlobal ??= { modo: "off" };
  const sub = args[0]?.toLowerCase();

  // ── &banglobal → status ──
  if (!sub) {
    const modo = modoDe(config);
    const telaEn = {
      title: "🌐 Global ban list",
      description: [
        `**Current mode:** \`${MODO_BG_EN[modo] ?? modo}\` — ${L_MODOS[modo]}`,
        "",
        "**Available modes:**",
        ...Object.entries(L_MODOS).map(([k, v]) => `\`${k}\` — ${v}`),
        "",
        `**Listed:** ${db.usuariosBanidosDistintos()} user(s), ${db.totalBansGlobais()} record(s) — ${db.bansGlobaisDoServidor(serverId)} from this server.`,
        `**Exempt here:** ${(config.banGlobal.isentos ?? []).length} person(s) this server accepts despite the list.`,
        `**Contribution:** 🟢 always on — this server's bans (old and new) feed the list on their own. There's nothing to configure and no command to run.`,
        "",
        "**Commands:**",
        `\`${citarInterno("banglobal", PREFIXO)} <off|avisar|imediato|consenso>\` — sets the mode`,
        `\`${citarInterno("banglobal.lista", PREFIXO)}\` — the ones banned by this server _(bot owner: every server)_`,
        `\`${citarInterno("banglobal.historico", PREFIXO)} <@user|id>\` — one user's history`,
        `\`${citarInterno("banglobal.revisar", PREFIXO)}\` — checks who's already here. **Shows only, never acts**`,
        `\`${citarInterno("banglobal.varrer.confirmar", PREFIXO)}\` — ⚠️ actually **bans** the ones found`,
        `\`${citarInterno("banglobal.isentar", PREFIXO)} <@user>\` — accept someone despite the list _(and unban them here)_`,
        `\`${citarInterno("banglobal.isentos", PREFIXO)}\` — who is exempt here`,
        `\`${citarInterno("banglobal.desfazer", PREFIXO)}\` — ↩️ reverts the bans the list applied here`,
        `\`${citarInterno("banglobal", PREFIXO)} add <id> [id…] [reason]\` — puts someone on the list **by ID**, even if they're in none of Judy's servers _(bot owner)_`,
        `\`${citarInterno("banglobal.esquecer", PREFIXO)} <@user|id> [nota]\` — removes a user from the list **for everyone**, and keeps them out for good`,
        `\`${citarInterno("banglobal.ignorados", PREFIXO)}\` — who is kept out · \`lembrar <@user>\` undoes it`,
        `\`${citarInterno("banglobal.bots", PREFIXO)}\` — finds bots on the list and drops them`,
        "",
        "_The mode above only decides whether this server **benefits** from the list. You can opt out of using it, but not out of feeding it._",
        "",
        `⚠️ _\`imediato\` acts on a **single** ban from another server — use it only if you trust the other servers. \`consenso\` waits for ${MINIMO_CONSENSO} different servers: much harder to abuse._`,
        "",
        "_`revisar` **looks**; `varrer confirmar` **bans**. They used to be the same thing and that already caused accidental bans — now they're separate commands, and the sweep always shows the list first._",
      ].join("\n"),
      colour: COR.mod,
    };
    const telaPt = {
      title: "🌐 Lista global de banimentos",
      description: [
        `**Modo atual:** \`${modo}\` — ${L_MODOS[modo]}`,
        "",
        "**Modos disponíveis:**",
        ...Object.entries(L_MODOS).map(([k, v]) => `\`${k}\` — ${v}`),
        "",
        `**Na lista:** ${db.usuariosBanidosDistintos()} usuário(s), ${db.totalBansGlobais()} registro(s) — ${db.bansGlobaisDoServidor(serverId)} deste servidor.`,
        `**Isentos aqui:** ${(config.banGlobal.isentos ?? []).length} pessoa(s) que este servidor aceita apesar da lista.`,
        `**Contribuição:** 🟢 sempre ligada — os bans deste servidor (antigos e novos) alimentam a lista sozinhos. Não há o que configurar nem comando a rodar.`,
        "",
        "**Comandos:**",
        `\`${citarInterno("banglobal", PREFIXO)} <off|avisar|imediato|consenso>\` — define o modo`,
        `\`${citarInterno("banglobal.lista", PREFIXO)}\` — os banidos por este servidor _(dono do bot: todos os servidores)_`,
        `\`${citarInterno("banglobal.historico", PREFIXO)} <@usuário|id>\` — histórico de uma pessoa`,
        `\`${citarInterno("banglobal.revisar", PREFIXO)}\` — confere quem já está aqui. **Só mostra, nunca age**`,
        `\`${citarInterno("banglobal.varrer.confirmar", PREFIXO)}\` — ⚠️ **bane** de verdade quem for encontrado`,
        `\`${citarInterno("banglobal.isentar", PREFIXO)} <@pessoa>\` — aceitar alguém apesar da lista _(e desbanir aqui)_`,
        `\`${citarInterno("banglobal.isentos", PREFIXO)}\` — quem está isento neste servidor`,
        `\`${citarInterno("banglobal.desfazer", PREFIXO)}\` — ↩️ reverte os bans que a lista aplicou aqui`,
        `\`${citarInterno("banglobal", PREFIXO)} add <id> [id…] [motivo]\` — põe alguém na lista **pelo ID**, mesmo sem estar em nenhum servidor da Judy _(dono do bot)_`,
        `\`${citarInterno("banglobal.esquecer", PREFIXO)} <@usuário|id> [nota]\` — tira alguém da lista **para todos os servidores**, e o mantém fora`,
        `\`${citarInterno("banglobal.ignorados", PREFIXO)}\` — quem está fora · \`lembrar <@pessoa>\` desfaz`,
        `\`${citarInterno("banglobal.bots", PREFIXO)}\` — acha bots na lista e os tira`,
        "",
        "_O modo acima decide só se este servidor **se aproveita** da lista. Dá para não usar a lista, mas não dá para usá-la sem alimentá-la._",
        "",
        `⚠️ _\`imediato\` age com **um só** ban de outro servidor — use só se confia nos outros servidores. \`consenso\` espera ${MINIMO_CONSENSO} servidores diferentes: bem mais difícil de abusar._`,
        "",
        "_`revisar` **olha**; `varrer confirmar` **bane**. Os dois eram a mesma coisa e isso já custou bans por engano — agora são comandos separados, e a varredura sempre mostra a lista antes._",
      ].join("\n"),
      colour: COR.mod,
    };
    const telaEs = {
      title: "🌐 Lista global de baneos",
      description: [
        `**Modo actual:** \`${nomeModoBG(modo, true)}\` — ${MODOS_ES[modo]}`,
        "",
        "**Modos disponibles:**",
        ...Object.entries(MODOS_ES).map(([k, v]) => `\`${nomeModoBG(k, true)}\` — ${v}`),
        "",
        `**En la lista:** ${db.usuariosBanidosDistintos()} usuario(s), ${db.totalBansGlobais()} registro(s) — ${db.bansGlobaisDoServidor(serverId)} de este servidor.`,
        `**Exentos aquí:** ${(config.banGlobal.isentos ?? []).length} persona(s) que este servidor acepta a pesar de la lista.`,
        `**Contribución:** 🟢 siempre activa — los bans de este servidor (antiguos y nuevos) alimentan la lista solos. No hay nada que configurar ni comando que ejecutar.`,
        "",
        "**Comandos:**",
        `\`${citar("banglobal", "es", PREFIXO)} <off|warn|instant|consensus>\` — define el modo`,
        `\`${citar("banglobal.lista", "es", PREFIXO)}\` — los baneados por este servidor _(dueño del bot: todos los servidores)_`,
        `\`${citar("banglobal.historico", "es", PREFIXO)} <@usuario|id>\` — historial de una persona`,
        `\`${citar("banglobal.revisar", "es", PREFIXO)}\` — comprueba quién ya está aquí. **Solo muestra, nunca actúa**`,
        `\`${citar("banglobal.varrer.confirmar", "es", PREFIXO)}\` — ⚠️ **banea** de verdad a quien encuentre`,
        `\`${citar("banglobal.isentar", "es", PREFIXO)} <@usuario>\` — aceptar a alguien a pesar de la lista _(y desbanearlo aquí)_`,
        `\`${citar("banglobal.isentos", "es", PREFIXO)}\` — quién está exento en este servidor`,
        `\`${citar("banglobal.desfazer", "es", PREFIXO)}\` — ↩️ revierte los bans que la lista aplicó aquí`,
        `\`${citar("banglobal", "es", PREFIXO)} add <id> [id…] [motivo]\` — pone a alguien en la lista **por ID**, aunque no esté en ningún servidor de Judy _(dueño del bot)_`,
        `\`${citar("banglobal.esquecer", "es", PREFIXO)} <@usuario|id> [nota]\` — saca a alguien de la lista **para todos los servidores**, y lo mantiene fuera`,
        `\`${citar("banglobal.ignorados", "es", PREFIXO)}\` — quién está fuera · \`${citar("banglobal.lembrar", "es", PREFIXO)} <@usuario>\` lo deshace`,
        `\`${citar("banglobal.bots", "es", PREFIXO)}\` — encuentra bots en la lista y los saca`,
        "",
        "_El modo de arriba solo decide si este servidor **se aprovecha** de la lista. Puedes no usarla, pero no puedes dejar de alimentarla._",
        "",
        `⚠️ _\`instant\` actúa con **un solo** ban de otro servidor — úsalo solo si confías en los otros servidores. \`consensus\` espera ${MINIMO_CONSENSO} servidores diferentes: mucho más difícil de abusar._`,
        "",
        "_`review` **mira**; `sweep confirm` **banea**. Antes eran lo mismo y eso ya costó bans por error — ahora son comandos separados, y el barrido siempre muestra la lista antes._",
      ].join("\n"),
      colour: COR.mod,
    };
    return sendEmbed(message.channel, tr(ctx, telaPt, telaEn, telaEs));
  }

  // ── &banglobal <off|avisar|imediato|consenso> (e `banir`, o nome antigo do imediato) ──
  if (lerModo(sub)) {
    const novo = lerModo(sub);
    config.banGlobal.modo = novo;
    salvarConfig();
    const extra = novo === "imediato"
      ? tr(ctx,
        "\n\n⚠️ _A partir de agora, quem foi banido em **qualquer** outro servidor será **banido automaticamente** ao entrar._",
        "\n\n⚠️ _From now on, anyone banned on **any** other server will be **automatically banned** on joining._",
        "\n\n⚠️ _A partir de ahora, quien haya sido baneado en **cualquier** otro servidor será **baneado automáticamente** al entrar._")
      : novo === "consenso"
        ? tr(ctx,
          `\n\n_A partir de agora, quem foi banido em **${MINIMO_CONSENSO}+ servidores diferentes** é banido ao entrar; com menos, a staff recebe um aviso no log._`,
          `\n\n_From now on, anyone banned on **${MINIMO_CONSENSO}+ different servers** is banned on joining; with fewer, the staff gets a warning in the log._`,
          `\n\n_A partir de ahora, quien haya sido baneado en **${MINIMO_CONSENSO}+ servidores diferentes** es baneado al entrar; con menos, el staff recibe un aviso en el log._`)
        : "";
    const sub2 = novo;
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Ban global reconfigurado",
      descricao: `Modo alterado para **${sub2}** por <@${message.authorId}>.`,
      en: { titulo: "🌐 Global ban reconfigured", descricao: `Mode changed to **${MODO_BG_EN[sub2] ?? sub2}** by <@${message.authorId}>.` },
      es: { titulo: "🌐 Ban global reconfigurado", descricao: `Modo cambiado a **${MODO_BG_EN[sub2] ?? sub2}** por <@${message.authorId}>.` },
    });
    return sendEmbed(message.channel, {
      title: tr(ctx, "🌐 Ban global atualizado", "🌐 Global ban updated", "🌐 Ban global actualizado"),
      description: tr(ctx,
        `**Modo:** \`${sub2}\` — ${L_MODOS[sub2]}.${extra}`,
        `**Mode:** \`${MODO_BG_EN[sub2] ?? sub2}\` — ${L_MODOS[sub2]}.${extra}`,
        `**Modo:** \`${MODO_BG_EN[sub2] ?? sub2}\` — ${MODOS_ES[sub2]}.${extra}`),
      colour: COR.mod,
    });
  }

  // ── &banglobal historico <usuário> ──
  if (["historico", "histórico", "history", "ver", "porque"].includes(sub)) {
    const alvo = await alvoDoComando(args.slice(1).join(" "), { message, server, ctx });
    if (alvo.erro) return sendEmbed(message.channel,
      embedAlvoNaoResolvido(ctx, alvo.erro, args.slice(1).join(" "), `${citarInterno("banglobal.historico", PREFIXO)} <@pessoa|id|nome>`, `${citar("banglobal.historico", "es", PREFIXO)} <@usuario|id|nombre>`));
    const uid = alvo.id;
    const nome = rotularUsuario(uid, { nome: alvo.nome, client: ctx.client });

    const hist = db.historicoBans(uid);
    if (!hist.length) return sendEmbed(message.channel, tr(ctx,
      { title: "🌐 Histórico global",
        description: `${nome} **não consta** na lista global de banimentos.`, colour: COR.sucesso },
      { title: "🌐 Global history",
        description: `${nome} is **not** on the global ban list.`, colour: COR.sucesso },
      { title: "🌐 Historial global",
        description: `${nome} **no está** en la lista global de baneos.`, colour: COR.sucesso }));

    return sendEmbed(message.channel, tr(ctx, {
      title: "🌐 Histórico global",
      description: [
        `${nome} — banido em **${hist.length}** servidor(es):`,
        "",
        ...hist.slice(0, 10).map((b) => linhaDoBan(b, serverId, "pt")),
        hist.length > 10 ? `\n_… e mais ${hist.length - 10}._` : "",
        "",
        `_Aceita aqui mesmo assim: \`${citarInterno("banglobal.isentar", PREFIXO)} ${uid}\`_`,
      ].filter(Boolean).join("\n"),
      colour: COR.aviso,
    }, {
      title: "🌐 Global history",
      description: [
        `${nome} — banned on **${hist.length}** server(s):`,
        "",
        ...hist.slice(0, 10).map((b) => linhaDoBan(b, serverId, "en")),
        hist.length > 10 ? `\n_… and ${hist.length - 10} more._` : "",
        "",
        `_Accept them here anyway: \`${citarInterno("banglobal.isentar", PREFIXO)} ${uid}\`_`,
      ].filter(Boolean).join("\n"),
      colour: COR.aviso,
    }, {
      title: "🌐 Historial global",
      description: [
        `${nome} — baneado en **${hist.length}** servidor(es):`,
        "",
        ...hist.slice(0, 10).map((b) => linhaDoBan(b, serverId, "es")),
        hist.length > 10 ? `\n_… y ${hist.length - 10} más._` : "",
        "",
        `_Aceptarlo aquí de todos modos: \`${citar("banglobal.isentar", "es", PREFIXO)} ${uid}\`_`,
      ].filter(Boolean).join("\n"),
      colour: COR.aviso,
    }));
  }

  if (["revisar", "review", "conferir", "checar", "ver"].includes(sub)) {
    await sendEmbed(message.channel, tr(ctx,
      { title: "🔎 Revisando…", description: "Conferindo os membros contra a lista global. Nada será feito.", colour: COR.info },
      { title: "🔎 Reviewing…", description: "Checking members against the global list. Nothing will be done.", colour: COR.info },
      { title: "🔎 Revisando…", description: "Comprobando a los miembros contra la lista global. No se hará nada.", colour: COR.info }));

    const r = await varrer(ctx, message, { aplicar: false });
    if (r.erro) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Revisão falhou", description: `${r.erro}\n\n_O bot precisa de permissão para ver os membros._`, colour: COR.erro },
        { title: "❌ Review failed", description: `${r.erro}\n\n_The bot needs permission to see the members._`, colour: COR.erro },
        { title: "❌ Falló la revisión", description: `${r.erro}\n\n_El bot necesita permiso para ver a los miembros._`, colour: COR.erro }));
    }
    if (!r.achados.length && !r.isentos.length && !r.abaixo?.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nenhum encontrado", description: `Conferi **${r.total}** membro(s) e ninguém consta na lista global.`, colour: COR.sucesso },
        { title: "✅ Nobody found", description: `I checked **${r.total}** member(s) and nobody is on the global list.`, colour: COR.sucesso },
        { title: "✅ No se encontró a nadie", description: `Comprobé **${r.total}** miembro(s) y nadie está en la lista global.`, colour: COR.sucesso }));
    }

    const linhas = [
      tr(ctx, `De **${r.total}** membro(s) do servidor:`, `Out of **${r.total}** server member(s):`, `De **${r.total}** miembro(s) del servidor:`), "",
      ...r.achados.map((a) => tr(ctx,
        `• **${a.nome}** \`${a.uid}\` — banido em ${a.n} servidor(es)`,
        `• **${a.nome}** \`${a.uid}\` — banned on ${a.n} server(s)`,
        `• **${a.nome}** \`${a.uid}\` — baneado en ${a.n} servidor(es)`)),
    ];
    if (r.abaixo?.length) {
      linhas.push("", tr(ctx, `**Não seriam banidos** _(abaixo do consenso de ${MINIMO_CONSENSO} servidores, ou só com ban automático, que só alerta)_`, `**Wouldn't be banned** _(below the ${MINIMO_CONSENSO}-server consensus, or with only automatic bans, which only alert)_`, `**No serían baneados** _(por debajo del consenso de ${MINIMO_CONSENSO} servidores, o solo con bans automáticos, que solo alertan)_`),
        ...r.abaixo.map((a) => `• **${a.nome}** \`${a.uid}\` — ${a.n}`));
    }
    if (r.isentos.length) {
      linhas.push("", tr(ctx, `**Isentos** _(este servidor já decidiu aceitar)_`, `**Exempt** _(this server already chose to accept them)_`, `**Exentos** _(este servidor ya decidió aceptarlos)_`),
        ...r.isentos.map((a) => `• **${a.nome}** \`${a.uid}\` — ${a.n}`));
    }
    linhas.push("", tr(ctx,
      `_Revisão: **nada foi feito**._\n\`${citarInterno("banglobal.isentar", PREFIXO)} <@pessoa>\` — aceitar alguém apesar da lista\n\`${citarInterno("banglobal.historico", PREFIXO)} <@pessoa>\` — ver por que ela está lá\n\`${citarInterno("banglobal.varrer", PREFIXO)}\` — se você realmente quiser **banir** os de cima`,
      `_Review: **nothing was done**._\n\`${citarInterno("banglobal.isentar", PREFIXO)} <@user>\` — accept someone despite the list\n\`${citarInterno("banglobal.historico", PREFIXO)} <@user>\` — see why they're on it\n\`${citarInterno("banglobal.varrer", PREFIXO)}\` — if you really want to **ban** the ones above`,
      `_Revisión: **no se hizo nada**._\n\`${citar("banglobal.isentar", "es", PREFIXO)} <@usuario>\` — aceptar a alguien a pesar de la lista\n\`${citar("banglobal.historico", "es", PREFIXO)} <@usuario>\` — ver por qué está ahí\n\`${citar("banglobal.varrer", "es", PREFIXO)}\` — si de verdad quieres **banear** a los de arriba`));

    const paginas = paginarLinhas(linhas, {
      titulo: tr(ctx, `🔎 Revisão — ${r.achados.length} na lista global`, `🔎 Review — ${r.achados.length} on the global list`, `🔎 Revisión — ${r.achados.length} en la lista global`),
      limite: 1300,
    });
    return enviarPaginado(ctx, message.channel, { paginas, autorId: message.authorId, colour: COR.aviso });
  }

  // ── varrer: age, mas só depois de você ver a lista e confirmar ──
  if (["varrer", "varredura", "scan", "sweep"].includes(sub)) {
    const arg1 = (args[1] ?? "").toLowerCase();
    const confirmou = ["confirmar", "confirm", "sim", "yes"].includes(arg1);
    const modo = modoDe(config);

    if (!modoBane(modo)) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "🌐 A varredura só bane nos modos `imediato` e `consenso`",
        description: [
          `O modo atual é \`${modo}\`.`,
          "",
          `Para **só conferir**, use \`${citarInterno("banglobal.revisar", PREFIXO)}\` — ele mostra quem consta na lista e não faz nada.`,
          `Para banir, mude o modo com \`${citarInterno("banglobal.consenso", PREFIXO)}\` (ou \`imediato\`) e varra de novo.`,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "🌐 The sweep only bans in `imediato` and `consenso` modes",
        description: [
          `The current mode is \`${MODO_BG_EN[modo] ?? modo}\`.`,
          "",
          `To **just check**, use \`${citarInterno("banglobal.revisar", PREFIXO)}\` — it shows who's on the list and does nothing.`,
          `To ban, switch with \`${citarInterno("banglobal.consenso", PREFIXO)}\` (or \`imediato\`) and sweep again.`,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "🌐 El barrido solo banea en los modos `instant` y `consensus`",
        description: [
          `El modo actual es \`${MODO_BG_EN[modo] ?? modo}\`.`,
          "",
          `Para **solo comprobar**, usa \`${citar("banglobal.revisar", "es", PREFIXO)}\` — muestra quién está en la lista y no hace nada.`,
          `Para banear, cambia el modo con \`${citar("banglobal.consenso", "es", PREFIXO)}\` (o \`instant\`) y vuelve a barrer.`,
        ].join("\n"), colour: COR.aviso,
      }));
    }

    await sendEmbed(message.channel, tr(ctx,
      { title: "🔎 Varrendo os membros…", description: "Conferindo quem já está no servidor contra a lista global.", colour: COR.info },
      { title: "🔎 Sweeping the members…", description: "Checking everyone already in the server against the global list.", colour: COR.info },
      { title: "🔎 Barriendo a los miembros…", description: "Comprobando a quien ya está en el servidor contra la lista global.", colour: COR.info }));

    const previa = await varrer(ctx, message, { aplicar: false });
    if (previa.erro) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Varredura falhou", description: `${previa.erro}\n\n_O bot precisa de permissão para ver os membros._`, colour: COR.erro },
        { title: "❌ Sweep failed", description: `${previa.erro}\n\n_The bot needs permission to see the members._`, colour: COR.erro },
        { title: "❌ Falló el barrido", description: `${previa.erro}\n\n_El bot necesita permiso para ver a los miembros._`, colour: COR.erro }));
    }
    if (!previa.achados.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nenhum encontrado", description: `Conferi **${previa.total}** membro(s) e ninguém a banir.`, colour: COR.sucesso },
        { title: "✅ Nobody found", description: `I checked **${previa.total}** member(s) and there's nobody to ban.`, colour: COR.sucesso },
        { title: "✅ No se encontró a nadie", description: `Comprobé **${previa.total}** miembro(s) y no hay nadie que banear.`, colour: COR.sucesso }));
    }

    const lista = previa.achados.slice(0, 15)
      .map((a) => tr(ctx, `• **${a.nome}** \`${a.uid}\` — ${a.n} servidor(es)`, `• **${a.nome}** \`${a.uid}\` — ${a.n} server(s)`, `• **${a.nome}** \`${a.uid}\` — ${a.n} servidor(es)`)).join("\n");
    const extra = previa.achados.length > 15
      ? tr(ctx, `\n_… e mais ${previa.achados.length - 15}._`, `\n_… and ${previa.achados.length - 15} more._`, `\n_… y ${previa.achados.length - 15} más._`) : "";

    if (!confirmou) {
      return sendEmbed(message.channel, tr(ctx, {
        title: `⚠️ Confirmar: banir ${previa.achados.length} pessoa(s)?`,
        description: [
          `De **${previa.total}** membro(s), estas constam na lista global:`, "", lista + extra, "",
          "**Nada foi feito ainda.**",
          "",
          `Para banir todas: \`${citarInterno("banglobal.varrer.confirmar", PREFIXO)}\``,
          `Para poupar alguém antes: \`${citarInterno("banglobal.isentar", PREFIXO)} <@pessoa>\``,
          `Para entender um caso: \`${citarInterno("banglobal.historico", PREFIXO)} <@pessoa>\``,
          "",
          "_Banir é irreversível pelo lado de quem levou o ban: ela precisa de convite novo para voltar._",
        ].join("\n").slice(0, 1900), colour: COR.aviso,
      }, {
        title: `⚠️ Confirm: ban ${previa.achados.length} people?`,
        description: [
          `Out of **${previa.total}** member(s), these are on the global list:`, "", lista + extra, "",
          "**Nothing has been done yet.**",
          "",
          `To ban them all: \`${citarInterno("banglobal.varrer.confirmar", PREFIXO)}\``,
          `To spare someone first: \`${citarInterno("banglobal.isentar", PREFIXO)} <@user>\``,
          `To understand a case: \`${citarInterno("banglobal.historico", PREFIXO)} <@user>\``,
          "",
          "_A ban is irreversible from the other side: they need a fresh invite to come back._",
        ].join("\n").slice(0, 1900), colour: COR.aviso,
      }, {
        title: `⚠️ Confirmar: ¿banear a ${previa.achados.length} persona(s)?`,
        description: [
          `De **${previa.total}** miembro(s), estos están en la lista global:`, "", lista + extra, "",
          "**Todavía no se hizo nada.**",
          "",
          `Para banearlos a todos: \`${citar("banglobal.varrer.confirmar", "es", PREFIXO)}\``,
          `Para salvar a alguien antes: \`${citar("banglobal.isentar", "es", PREFIXO)} <@usuario>\``,
          `Para entender un caso: \`${citar("banglobal.historico", "es", PREFIXO)} <@usuario>\``,
          "",
          "_El ban es irreversible del lado de quien lo recibe: necesita una invitación nueva para volver._",
        ].join("\n").slice(0, 1900), colour: COR.aviso,
      }));
    }

    const r = await varrer(ctx, message, { aplicar: true });
    const ok = r.aplicados.filter((a) => a.ok).length;
    const falhas = r.aplicados.filter((a) => !a.ok);
    return sendEmbed(message.channel, tr(ctx, {
      title: `🔨 Varredura concluída — ${ok} banido(s)`,
      description: [
        `Conferi **${r.total}** membro(s); **${r.achados.length}** constavam na lista.`, "", lista + extra,
        falhas.length ? `\n**Falhas (${falhas.length}):**\n` + falhas.slice(0, 5).map((f) => `• ${f.nome}: ${f.erro}`).join("\n") : "",
        falhas.length ? "_Falha comum: o cargo do bot precisa de **BanMembers** e estar acima do cargo da pessoa._" : "",
        "",
        `_Errou? \`${citarInterno("banglobal.desfazer", PREFIXO)}\` reverte os bans que EU apliquei aqui._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso,
    }, {
      title: `🔨 Sweep finished — ${ok} banned`,
      description: [
        `I checked **${r.total}** member(s); **${r.achados.length}** were on the list.`, "", lista + extra,
        falhas.length ? `\n**Failures (${falhas.length}):**\n` + falhas.slice(0, 5).map((f) => `• ${f.nome}: ${f.erro}`).join("\n") : "",
        falhas.length ? "_Common failure: the bot's role needs **BanMembers** and must sit above the person's role._" : "",
        "",
        `_Wrong call? \`${citarInterno("banglobal.desfazer", PREFIXO)}\` reverts the bans I applied here._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso,
    }, {
      title: `🔨 Barrido terminado — ${ok} baneado(s)`,
      description: [
        `Comprobé **${r.total}** miembro(s); **${r.achados.length}** estaban en la lista.`, "", lista + extra,
        falhas.length ? `\n**Fallos (${falhas.length}):**\n` + falhas.slice(0, 5).map((f) => `• ${f.nome}: ${f.erro}`).join("\n") : "",
        falhas.length ? "_Fallo común: el rol del bot necesita **BanMembers** y estar por encima del rol de la persona._" : "",
        "",
        `_¿Te equivocaste? \`${citar("banglobal.desfazer", "es", PREFIXO)}\` revierte los bans que YO apliqué aquí._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso,
    }));
  }

  if (["desfazer", "undo", "reverter", "revert"].includes(sub)) {
    const confirmou = ["confirmar", "confirm", "sim", "yes"].includes((args[1] ?? "").toLowerCase());

    // &banglobal desfazer <pessoa> — só essa pessoa. Antes, o argumento era
    // ignorado e a resposta "nada a desfazer" não explicava que estar NA LISTA
    // é diferente de ter sido BANIDO AQUI pela lista.
    if (args[1] && !confirmou) {
      const entrada = args.slice(1).join(" ");
      const alvo = await alvoDoComando(entrada, { message, server, ctx });
      if (alvo.erro) return sendEmbed(message.channel,
        embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${citarInterno("banglobal.desfazer", PREFIXO)} <@pessoa|id|nome>`, `${citar("banglobal.desfazer", "es", PREFIXO)} <@usuario|id|nombre>`));
      const quem = rotularUsuario(alvo.id, { nome: alvo.nome, client: ctx.client });
      const aplicado = db.bansGlobaisPorOrigem(serverId, ["banglobal"]).find((b) => b.userId === alvo.id);
      if (aplicado) {
        const r = await desbanir(server, serverId, alvo.id, idiomaDe(ctx));
        if (!r.ok) return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Não consegui desbanir", description: `${quem}: ${r.erro}`, colour: COR.erro },
          { title: "❌ Couldn't unban", description: `${quem}: ${r.erro}`, colour: COR.erro },
          { title: "❌ No pude desbanear", description: `${quem}: ${r.erro}`, colour: COR.erro }));
        db.removerBanGlobal(alvo.id, serverId);
        config.banGlobal.isentos ??= [];
        if (!config.banGlobal.isentos.includes(alvo.id)) config.banGlobal.isentos.push(alvo.id);
        salvarConfig();
        await log.registrar(ctx, "punicoes", {
          titulo: "↩️ Ban da lista global desfeito",
          descricao: `<@${message.authorId}> desfez o ban que a lista global aplicou em ${alvo.nome ?? alvo.id}.`,
          en: { titulo: "↩️ Global list ban undone", descricao: `<@${message.authorId}> undid the ban the global list applied to ${alvo.nome ?? alvo.id}.` },
          es: { titulo: "↩️ Ban de la lista global deshecho", descricao: `<@${message.authorId}> deshizo el ban que la lista global aplicó a ${alvo.nome ?? alvo.id}.` },
        });
        return sendEmbed(message.channel, tr(ctx, {
          title: "↩️ Ban desfeito",
          description: `${quem} foi **desbanido** e fica **isento** aqui — a próxima varredura não bane de novo.\n\nA pessoa precisa de um **convite novo** para voltar.`,
          colour: COR.sucesso,
        }, {
          title: "↩️ Ban undone",
          description: `${quem} was **unbanned** and is **exempt** here — the next sweep won't ban them again.\n\nThey need a **fresh invite** to come back.`,
          colour: COR.sucesso,
        }, {
          title: "↩️ Ban deshecho",
          description: `${quem} fue **desbaneado** y queda **exento** aquí — el próximo barrido no lo vuelve a banear.\n\nNecesita una **invitación nueva** para volver.`,
          colour: COR.sucesso,
        }));
      }
      const servidores = new Set(db.historicoBans(alvo.id).map((b) => b.serverId)).size;
      const dono = ctx.ehSuperAdmin?.(message.authorId);
      return sendEmbed(message.channel, tr(ctx, {
        title: "ℹ️ A lista não baniu essa pessoa aqui",
        description: [
          servidores
            ? `${quem} está **na lista global** (banido em ${servidores} servidor(es)), mas **não foi banido neste servidor** pela lista — não há ban para desfazer.`
            : `${quem} não está na lista global e não foi banido aqui por ela.`,
          "",
          servidores ? "**O que você quer?**" : "",
          servidores ? `• Que ela não seja afetada **aqui**: \`${citarInterno("banglobal.isentar", PREFIXO)} ${alvo.id}\`` : "",
          servidores && dono ? `• Tirar da lista **de todos os servidores** (e ela não volta): \`${citarInterno("banglobal.esquecer", PREFIXO)} ${alvo.id}\`` : "",
          servidores && !dono ? "• Tirar da lista de todos os servidores: só o dono do bot." : "",
        ].filter(Boolean).join("\n"),
        colour: COR.info,
      }, {
        title: "ℹ️ The list didn't ban this person here",
        description: [
          servidores
            ? `${quem} is **on the global list** (banned on ${servidores} server(s)), but was **not banned on this server** by the list — there's no ban to undo.`
            : `${quem} isn't on the global list and wasn't banned here by it.`,
          "",
          servidores ? "**What do you want?**" : "",
          servidores ? `• Keep them unaffected **here**: \`${citarInterno("banglobal.isentar", PREFIXO)} ${alvo.id}\`` : "",
          servidores && dono ? `• Take them off the list **for every server** (they won't come back): \`${citarInterno("banglobal.esquecer", PREFIXO)} ${alvo.id}\`` : "",
          servidores && !dono ? "• Taking them off the list for every server: bot owner only." : "",
        ].filter(Boolean).join("\n"),
        colour: COR.info,
      }, {
        title: "ℹ️ La lista no baneó a esta persona aquí",
        description: [
          servidores
            ? `${quem} está **en la lista global** (baneado en ${servidores} servidor(es)), pero **no fue baneado en este servidor** por la lista — no hay ban que deshacer.`
            : `${quem} no está en la lista global y no fue baneado aquí por ella.`,
          "",
          servidores ? "**¿Qué quieres?**" : "",
          servidores ? `• Que no se vea afectado **aquí**: \`${citar("banglobal.isentar", "es", PREFIXO)} ${alvo.id}\`` : "",
          servidores && dono ? `• Sacarlo de la lista **de todos los servidores** (y no vuelve): \`${citar("banglobal.esquecer", "es", PREFIXO)} ${alvo.id}\`` : "",
          servidores && !dono ? "• Sacarlo de la lista de todos los servidores: solo el dueño del bot." : "",
        ].filter(Boolean).join("\n"),
        colour: COR.info,
      }));
    }
    const aplicados = db.bansGlobaisPorOrigem(serverId, ["banglobal"]);
    if (!aplicados.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nada a desfazer", description: "Não há ban aplicado pela lista global neste servidor.\n\n"
            + `_Quer que alguém da lista não seja afetado aqui? \`${citarInterno("banglobal.isentar", PREFIXO)} <pessoa>\`._`, colour: COR.sucesso },
        { title: "✅ Nothing to undo", description: "There's no ban applied by the global list on this server.\n\n"
            + `_Want someone on the list left alone here? \`${citarInterno("banglobal.isentar", PREFIXO)} <user>\`._`, colour: COR.sucesso },
        { title: "✅ Nada que deshacer", description: "No hay ningún ban aplicado por la lista global en este servidor.\n\n"
            + `_¿Quieres que alguien de la lista no se vea afectado aquí? \`${citar("banglobal.isentar", "es", PREFIXO)} <usuario>\`._`, colour: COR.sucesso }));
    }

    const lista = aplicados.slice(0, 20)
      .map((b) => `• ${rotularUsuario(b.userId, { nome: b.userNome, client: ctx.client })} _(${data(b.criadoEm)})_`).join("\n");
    if (!confirmou) {
      return sendEmbed(message.channel, tr(ctx, {
        title: `↩️ Desfazer ${aplicados.length} ban(s) da lista global?`,
        description: [
          "Estes bans foram aplicados **pelo bot**, por causa da lista global:", "", lista,
          aplicados.length > 20 ? `\n_… e mais ${aplicados.length - 20}._` : "", "",
          "Ao desfazer, cada pessoa é **desbanida** e passa a ficar **isenta** aqui — senão a próxima varredura banaria de novo.",
          "",
          `Confirme com \`${citarInterno("banglobal.desfazer.confirmar", PREFIXO)}\`.`,
          "",
          "_Bans manuais e do automod não são tocados._",
        ].filter(Boolean).join("\n").slice(0, 1900), colour: COR.aviso,
      }, {
        title: `↩️ Undo ${aplicados.length} global-list ban(s)?`,
        description: [
          "These bans were applied **by the bot**, because of the global list:", "", lista,
          aplicados.length > 20 ? `\n_… and ${aplicados.length - 20} more._` : "", "",
          "Undoing unbans each person and marks them **exempt** here — otherwise the next sweep would ban them again.",
          "",
          `Confirm with \`${citarInterno("banglobal.desfazer.confirmar", PREFIXO)}\`.`,
          "",
          "_Manual and automod bans are left alone._",
        ].filter(Boolean).join("\n").slice(0, 1900), colour: COR.aviso,
      }, {
        title: `↩️ ¿Deshacer ${aplicados.length} ban(s) de la lista global?`,
        description: [
          "Estos bans los aplicó **el bot**, por la lista global:", "", lista,
          aplicados.length > 20 ? `\n_… y ${aplicados.length - 20} más._` : "", "",
          "Al deshacerlo, cada persona es **desbaneada** y queda **exenta** aquí — si no, el próximo barrido la volvería a banear.",
          "",
          `Confirma con \`${citar("banglobal.desfazer.confirmar", "es", PREFIXO)}\`.`,
          "",
          "_Los bans manuales y del automod no se tocan._",
        ].filter(Boolean).join("\n").slice(0, 1900), colour: COR.aviso,
      }));
    }

    config.banGlobal.isentos ??= [];
    const feitos = [], falhou = [];
    for (const b of aplicados) {
      const r = await desbanir(server, serverId, b.userId, idiomaDe(ctx));
      if (r.ok) {
        db.removerBanGlobal(b.userId, serverId);
        if (!config.banGlobal.isentos.includes(b.userId)) config.banGlobal.isentos.push(b.userId);
        feitos.push(b.userId);
      } else {
        falhou.push({ uid: b.userId, erro: r.erro });
      }
    }
    salvarConfig();
    await log.registrar(ctx, "punicoes", {
      titulo: "↩️ Bans da lista global desfeitos",
      descricao: `<@${message.authorId}> reverteu **${feitos.length}** ban(s) aplicado(s) pela lista global.`,
      en: { titulo: "↩️ Global list bans undone", descricao: `<@${message.authorId}> reverted **${feitos.length}** ban(s) applied by the global list.` },
      es: { titulo: "↩️ Bans de la lista global deshechos", descricao: `<@${message.authorId}> revirtió **${feitos.length}** ban(s) aplicado(s) por la lista global.` },
    });
    return sendEmbed(message.channel, tr(ctx, {
      title: `↩️ ${feitos.length} ban(s) desfeito(s)`,
      description: [
        feitos.length ? feitos.map((u) => `✅ ${rotularUsuario(u, { client: ctx.client })} — desbanido e isento aqui`).join("\n") : "",
        falhou.length ? `\n**Não consegui (${falhou.length}):**\n` + falhou.slice(0, 5).map((f) => `❌ ${rotularUsuario(f.uid, { client: ctx.client })} — ${f.erro}`).join("\n") : "",
        "",
        "As pessoas precisam de um **convite novo** para voltar: o desban só remove o impedimento.",
        `_Ver quem está isento: \`${citarInterno("banglobal.isentos", PREFIXO)}\`._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhou.length ? COR.aviso : COR.sucesso,
    }, {
      title: `↩️ ${feitos.length} ban(s) undone`,
      description: [
        feitos.length ? feitos.map((u) => `✅ ${rotularUsuario(u, { client: ctx.client })} — unbanned and exempt here`).join("\n") : "",
        falhou.length ? `\n**Couldn't do (${falhou.length}):**\n` + falhou.slice(0, 5).map((f) => `❌ ${rotularUsuario(f.uid, { client: ctx.client })} — ${f.erro}`).join("\n") : "",
        "",
        "They need a **fresh invite** to come back: unbanning only removes the block.",
        `_See who's exempt: \`${citarInterno("banglobal.isentos", PREFIXO)}\`._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhou.length ? COR.aviso : COR.sucesso,
    }, {
      title: `↩️ ${feitos.length} ban(s) deshecho(s)`,
      description: [
        feitos.length ? feitos.map((u) => `✅ ${rotularUsuario(u, { client: ctx.client })} — desbaneado y exento aquí`).join("\n") : "",
        falhou.length ? `\n**No pude (${falhou.length}):**\n` + falhou.slice(0, 5).map((f) => `❌ ${rotularUsuario(f.uid, { client: ctx.client })} — ${f.erro}`).join("\n") : "",
        "",
        "Las personas necesitan una **invitación nueva** para volver: el desbaneo solo quita el impedimento.",
        `_Ver quién está exento: \`${citar("banglobal.isentos", "es", PREFIXO)}\`._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhou.length ? COR.aviso : COR.sucesso,
    }));
  }

  // ── isentar / isentos: o bypass deste servidor ──
  if (["isentar", "isento", "isentos", "exempt", "permitir", "aceitar", "allow", "bypass"].includes(sub)) {
    const acao = (args[1] ?? "").toLowerCase();
    const listar = ["isentos", "exempt"].includes(sub) || ["lista", "list", "ver"].includes(acao) || !args[1];
    config.banGlobal.isentos ??= [];

    if (listar) {
      const ids = config.banGlobal.isentos;
      return sendEmbed(message.channel, tr(ctx, {
        title: `🛡️ Isentos da lista global — ${ids.length}`,
        description: [
          ids.length
            ? ids.map((u) => `• ${rotularUsuario(u, { client: ctx.client })} _(${db.contarBansGlobais(u)} servidor(es) na lista)_`).join("\n")
            : "_Ninguém._",
          "",
          "Quem está aqui **entra e fica**, mesmo constando na lista global. A lista dos outros servidores não é apagada — só deixa de valer aqui.",
          "",
          `\`${citarInterno("banglobal.isentar", PREFIXO)} <@pessoa|id>\` — aceitar alguém`,
          `\`${citarInterno("banglobal.isentar.remover", PREFIXO)} <@pessoa|id>\` — voltar atrás`,
        ].join("\n").slice(0, 1900), colour: COR.info,
      }, {
        title: `🛡️ Exempt from the global list — ${ids.length}`,
        description: [
          ids.length
            ? ids.map((u) => `• ${rotularUsuario(u, { client: ctx.client })} _(${db.contarBansGlobais(u)} server(s) on the list)_`).join("\n")
            : "_Nobody._",
          "",
          "People here **join and stay**, even if they're on the global list. Other servers' records aren't deleted — they just stop applying here.",
          "",
          `\`${citarInterno("banglobal.isentar", PREFIXO)} <@user|id>\` — accept someone`,
          `\`${citarInterno("banglobal.isentar.remover", PREFIXO)} <@user|id>\` — take it back`,
        ].join("\n").slice(0, 1900), colour: COR.info,
      }, {
        title: `🛡️ Exentos de la lista global — ${ids.length}`,
        description: [
          ids.length
            ? ids.map((u) => `• ${rotularUsuario(u, { client: ctx.client, en: "es" })} _(${db.contarBansGlobais(u)} servidor(es) en la lista)_`).join("\n")
            : "_Nadie._",
          "",
          "Quien está aquí **entra y se queda**, aunque esté en la lista global. La lista de los otros servidores no se borra — solo deja de valer aquí.",
          "",
          `\`${citar("banglobal.isentar", "es", PREFIXO)} <@usuario|id>\` — aceptar a alguien`,
          `\`${citar("banglobal.isentar.remover", "es", PREFIXO)} <@usuario|id>\` — dar marcha atrás`,
        ].join("\n").slice(0, 1900), colour: COR.info,
      }));
    }

    const removendo = ["remover", "remove", "tirar", "off"].includes(acao);
    const entrada = removendo ? args.slice(2).join(" ") : args.slice(1).join(" ");
    const alvo = await alvoDoComando(entrada, { message, server, ctx });
    if (alvo.erro) return sendEmbed(message.channel,
      embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${citarInterno("banglobal.isentar", PREFIXO)} <@pessoa|id|nome>`, `${citar("banglobal.isentar", "es", PREFIXO)} <@usuario|id|nombre>`));
    const uid = alvo.id;

    if (removendo) {
      const antes = config.banGlobal.isentos.length;
      config.banGlobal.isentos = config.banGlobal.isentos.filter((u) => u !== uid);
      salvarConfig();
      const rot = rotularUsuario(uid, { nome: alvo.nome, client: ctx.client });
      return sendEmbed(message.channel, tr(ctx,
        { title: antes === config.banGlobal.isentos.length ? "🤷 Não estava isento" : "🛡️ Isenção removida",
          description: `${rot} volta a ser tratado pela lista global neste servidor.`, colour: COR.mod },
        { title: antes === config.banGlobal.isentos.length ? "🤷 Wasn't exempt" : "🛡️ Exemption removed",
          description: `${rot} is subject to the global list again on this server.`, colour: COR.mod },
        { title: antes === config.banGlobal.isentos.length ? "🤷 No estaba exento" : "🛡️ Exención quitada",
          description: `${rot} vuelve a estar sujeto a la lista global en este servidor.`, colour: COR.mod }));
    }

    if (!config.banGlobal.isentos.includes(uid)) config.banGlobal.isentos.push(uid);
    salvarConfig();

    const nossoBan = db.bansGlobaisPorOrigem(serverId, ["banglobal"]).some((b) => b.userId === uid);
    let desbanida = false, erroDesban = null;
    if (nossoBan) {
      const r = await desbanir(server, serverId, uid, idiomaDe(ctx));
      if (r.ok) { db.removerBanGlobal(uid, serverId); desbanida = true; } else erroDesban = r.erro;
    }
    await log.registrar(ctx, "punicoes", {
      titulo: "🛡️ Isenção da lista global",
      descricao: `<@${message.authorId}> isentou <@${uid}>${desbanida ? " (e desfez o ban aplicado pela lista)" : ""}.`,
      en: { titulo: "🛡️ Global list exemption", descricao: `<@${message.authorId}> exempted <@${uid}>${desbanida ? " (and undid the ban applied by the list)" : ""}.` },
      es: { titulo: "🛡️ Exención de la lista global", descricao: `<@${message.authorId}> eximió a <@${uid}>${desbanida ? " (y deshizo el ban aplicado por la lista)" : ""}.` },
    });
    const n = db.contarBansGlobais(uid);
    return sendEmbed(message.channel, tr(ctx, {
      title: "🛡️ Isento aqui",
      description: [
        `${rotularUsuario(uid, { nome: alvo.nome, client: ctx.client })} é aceito neste servidor, mesmo constando na lista global${n ? ` (**${n}** servidor(es))` : ""}.`,
        desbanida ? "\n✅ O ban que a lista tinha aplicado aqui foi **desfeito** — mande um convite novo para a pessoa voltar." : "",
        erroDesban ? `\n⚠️ Não consegui desfazer o ban: \`${erroDesban}\`` : "",
        "",
        "_A lista dos outros servidores continua intacta: a isenção vale só aqui._",
      ].filter(Boolean).join("\n"), colour: COR.sucesso,
    }, {
      title: "🛡️ Exempt here",
      description: [
        `${rotularUsuario(uid, { nome: alvo.nome, client: ctx.client })} is accepted on this server, even though they're on the global list${n ? ` (**${n}** server(s))` : ""}.`,
        desbanida ? "\n✅ The ban the list had applied here was **undone** — send them a fresh invite to come back." : "",
        erroDesban ? `\n⚠️ Couldn't undo the ban: \`${erroDesban}\`` : "",
        "",
        "_Other servers' records stay intact: the exemption applies here only._",
      ].filter(Boolean).join("\n"), colour: COR.sucesso,
    }, {
      title: "🛡️ Exento aquí",
      description: [
        `${rotularUsuario(uid, { nome: alvo.nome, client: ctx.client })} es aceptado en este servidor, aunque esté en la lista global${n ? ` (**${n}** servidor(es))` : ""}.`,
        desbanida ? "\n✅ El ban que la lista había aplicado aquí se **deshizo** — mándale una invitación nueva para que vuelva." : "",
        erroDesban ? `\n⚠️ No pude deshacer el ban: \`${erroDesban}\`` : "",
        "",
        "_La lista de los otros servidores sigue intacta: la exención vale solo aquí._",
      ].filter(Boolean).join("\n"), colour: COR.sucesso,
    }));
  }

  // ── lista: TODO MUNDO que consta na lista global ──
  if (["lista", "list", "banidos", "banned", "todos", "all"].includes(sub)) {
    // (31 out 2026, R9) a lista de TODOS os servidores é só do dono do bot; a staff
    // de um servidor vê os banidos por ele
    const soDaqui = ["servidor", "server", "aqui", "here", "daqui"].includes((args[1] ?? "").toLowerCase())
      || !ctx.ehSuperAdmin?.(message.authorId);
    const linhas0 = db.listarBanidosGlobais({ limite: 500, serverId: soDaqui ? serverId : null });
    if (!linhas0.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🌐 Lista vazia", description: "Ninguém na lista global ainda.", colour: COR.info },
        { title: "🌐 Empty list", description: "Nobody on the global list yet.", colour: COR.info },
        { title: "🌐 Lista vacía", description: "Todavía no hay nadie en la lista global.", colour: COR.info }));
    }
    const isentos = config.banGlobal?.isentos ?? [];
    const linhas = [
      soDaqui
        ? tr(ctx, `**${linhas0.length}** pessoa(s) banida(s) **por este servidor**:`, `**${linhas0.length}** person(s) banned **by this server**:`, `**${linhas0.length}** persona(s) baneada(s) **por este servidor**:`)
        : tr(ctx, `**${linhas0.length}** pessoa(s) na lista global (todos os servidores):`, `**${linhas0.length}** person(s) on the global list (all servers):`, `**${linhas0.length}** persona(s) en la lista global (todos los servidores):`),
      "",
      ...linhas0.map((b) => {
        const marca = isentos.includes(b.userId) ? "🛡️ " : "";
        const quem = rotularUsuario(b.userId, { nome: b.nome, client: ctx.client });
        const motivo = (b.motivo ?? "").slice(0, 60);
        return soDaqui
          ? `${marca}${quem} — ${motivo || tr(ctx, "_sem motivo_", "_no reason_", "_sin motivo_")} _(${data(b.ultimo)})_`
          : `${marca}${quem} — ${b.servidores} ${tr(ctx, "servidor(es)", "server(s)", "servidor(es)")} _(${data(b.ultimo)})_`;
      }),
      "",
      tr(ctx,
        `🛡️ = isento aqui · \`${citarInterno("banglobal.historico", PREFIXO)} <@pessoa>\` mostra o porquê de cada caso\nNão afetar alguém aqui: \`${citarInterno("banglobal.isentar", PREFIXO)} <pessoa>\`${ctx.ehSuperAdmin?.(message.authorId) ? ` · tirar da lista de todos: \`${citarInterno("banglobal.esquecer", PREFIXO)} <pessoa>\`` : ""}\n\`${citarInterno("banglobal.lista.servidor", PREFIXO)}\` — só os banidos por este servidor`,
        `🛡️ = exempt here · \`${citarInterno("banglobal.historico", PREFIXO)} <@user>\` shows the reason for each case\nLeave someone alone here: \`${citarInterno("banglobal.isentar", PREFIXO)} <user>\`${ctx.ehSuperAdmin?.(message.authorId) ? ` · take off the list for all: \`${citarInterno("banglobal.esquecer", PREFIXO)} <user>\`` : ""}\n\`${citarInterno("banglobal.lista.servidor", PREFIXO)}\` — only those banned by this server`,
        `🛡️ = exento aquí · \`${citar("banglobal.historico", "es", PREFIXO)} <@usuario>\` muestra el porqué de cada caso\nNo afectar a alguien aquí: \`${citar("banglobal.isentar", "es", PREFIXO)} <usuario>\`${ctx.ehSuperAdmin?.(message.authorId) ? ` · sacarlo de la lista de todos: \`${citar("banglobal.esquecer", "es", PREFIXO)} <usuario>\`` : ""}\n\`${citar("banglobal.lista.servidor", "es", PREFIXO)}\` — solo los baneados por este servidor`),
    ];
    const paginas = paginarLinhas(linhas, {
      titulo: soDaqui
        ? tr(ctx, "🌐 Banidos por este servidor", "🌐 Banned by this server", "🌐 Baneados por este servidor")
        : tr(ctx, "🌐 Todos na lista global", "🌐 Everyone on the global list", "🌐 Todos en la lista global"),
      limite: 1300,
    });
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, comandoPagina: `${citarInterno("banglobal.lista", PREFIXO)}`, colour: COR.mod,
    });
  }

  if (["auto", "automatico", "automático", "automatic", "autoimport",
       "importar", "import", "sincronizar", "sync"].includes(sub)) {
    const registros = db.bansGlobaisDoServidor?.(serverId) ?? null;
    const linhaServidor = registros === null
      ? null
      : tr(ctx,
        `**Deste servidor:** ${registros} registro(s) já na lista.`,
        `**From this server:** ${registros} record(s) already in the list.`,
        `**De este servidor:** ${registros} registro(s) ya en la lista.`);

    return sendEmbed(message.channel, tr(ctx, {
      title: "🌐 Importação: agora é automática e permanente",
      description: [
        "Não existe mais o que ligar, desligar ou importar à mão.",
        "",
        "**Como funciona hoje**",
        "• Os bans **novos** entram na lista no instante em que acontecem.",
        "• Os bans **antigos** deste servidor são sincronizados sozinhos: logo após o bot subir e a cada 6 horas.",
        ...(linhaServidor ? ["", linhaServidor] : []),
        "",
        `A única escolha deste servidor é se ele **se aproveita** da lista: \`${citarInterno("banglobal", PREFIXO)} <off|avisar|imediato|consenso>\`.`,
        "",
        `_Um registro específico que não se sustente pode sair com \`${citarInterno("banglobal.esquecer", PREFIXO)} <@usuário>\`._`,
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "🌐 Importing: now automatic and permanent",
      description: [
        "There's nothing left to enable, disable or import by hand.",
        "",
        "**How it works now**",
        "• **New** bans join the list the moment they happen.",
        "• This server's **old** bans sync on their own: shortly after the bot boots and every 6 hours.",
        ...(linhaServidor ? ["", linhaServidor] : []),
        "",
        `This server's only choice is whether it **benefits** from the list: \`${citarInterno("banglobal", PREFIXO)} <off|avisar|imediato|consenso>\`.`,
        "",
        `_A specific record that doesn't hold up can be dropped with \`${citarInterno("banglobal.esquecer", PREFIXO)} <@user>\`._`,
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "🌐 Importación: ahora es automática y permanente",
      description: [
        "Ya no hay nada que activar, desactivar ni importar a mano.",
        "",
        "**Cómo funciona hoy**",
        "• Los bans **nuevos** entran en la lista en el instante en que ocurren.",
        "• Los bans **antiguos** de este servidor se sincronizan solos: poco después de que el bot arranca y cada 6 horas.",
        ...(linhaServidor ? ["", linhaServidor] : []),
        "",
        `La única elección de este servidor es si **se aprovecha** de la lista: \`${citar("banglobal", "es", PREFIXO)} <off|warn|instant|consensus>\`.`,
        "",
        `_Un registro concreto que no se sostenga puede salir con \`${citar("banglobal.esquecer", "es", PREFIXO)} <@usuario>\`._`,
      ].join("\n"),
      colour: COR.mod,
    }));
  }

  // ── &banglobal add <id> [id…] [motivo] — pôr na lista quem não está em servidor nenhum ──
  // (pedido de Ghieh, 11 out 2026). Só o dono do bot: a lista vale para TODOS
  // os servidores (nos modos que banem, entrar na lista = ser banido em todos),
  // pelo mesmo motivo que o `esquecer` é só dele.
  if (["add", "adicionar", "incluir", "colocar"].includes(sub)) {
    if (!ctx.ehSuperAdmin?.(message.authorId)) return sendEmbed(message.channel, tr(ctx, {
      title: "🔒 Só o dono do bot",
      description: "A lista global é **compartilhada** por todos os servidores da Judy — pôr alguém nela vale para todos.\n\n"
        + `Para tirar alguém **deste servidor**, use o ban normal: \`${citar("ban", "pt", PREFIXO)} <@pessoa|id> [motivo]\` — ele alimenta a lista sozinho.`,
      colour: COR.aviso,
    }, {
      title: "🔒 Bot owner only",
      description: "The global list is **shared** by every server Judy is in — putting someone on it applies to all of them.\n\n"
        + `To remove someone from **this server**, use the normal ban: \`${citar("ban", "en", PREFIXO)} <@user|id> [reason]\` — it feeds the list by itself.`,
      colour: COR.aviso,
    }, {
      title: "🔒 Solo el dueño del bot",
      description: "La lista global es **compartida** por todos los servidores de Judy — poner a alguien en ella vale para todos.\n\n"
        + `Para sacar a alguien de **este servidor**, usa el ban normal: \`${citar("ban", "es", PREFIXO)} <@usuario|id> [motivo]\` — alimenta la lista solo.`,
      colour: COR.aviso,
    }));
    const { ids, motivo, descartados } = separarIdsEMotivo(args.slice(1));
    if (!ids.length) return sendEmbed(message.channel, tr(ctx, {
      title: "🌐 Adicionar à lista global",
      description: [
        `\`${citarInterno("banglobal", PREFIXO)} add <id> [id…] [motivo]\``,
        "",
        "Põe na lista **pelo ID** — a pessoa não precisa estar em nenhum servidor da Judy. Aceito até 25 IDs de uma vez (menção e link de perfil também valem).",
        `Ex.: \`${citarInterno("banglobal", PREFIXO)} add 01KMBX60MHVS8F0P0CJ0VK3326 01KMBX60MHVS8F0P0CJ0VK3327 raid de 27/09\``,
        "",
        "_Quem já estiver num servidor da Judy sente na hora: banido onde o modo é `imediato` ou `consenso` (a lista do dono vale como consenso), aviso à staff onde é `avisar`._",
      ].join("\n"), colour: COR.info,
    }, {
      title: "🌐 Add to the global list",
      description: [
        `\`${citarInterno("banglobal", PREFIXO)} add <id> [id…] [reason]\``,
        "",
        "Puts someone on the list **by ID** — they don't need to be in any of Judy's servers. Up to 25 IDs at once (mentions and profile links work too).",
        `E.g.: \`${citarInterno("banglobal", PREFIXO)} add 01KMBX60MHVS8F0P0CJ0VK3326 01KMBX60MHVS8F0P0CJ0VK3327 raid of 09/27\``,
        "",
        "_Anyone already in one of Judy's servers feels it right away: banned where the mode is `imediato` or `consenso` (the owner's list counts as consensus), staff warned where it's `avisar`._",
      ].join("\n"), colour: COR.info,
    }, {
      title: "🌐 Agregar a la lista global",
      description: [
        `\`${citar("banglobal", "es", PREFIXO)} add <id> [id…] [motivo]\``,
        "",
        "Pone en la lista **por ID** — la persona no necesita estar en ningún servidor de Judy. Acepto hasta 25 IDs de una vez (mención y enlace de perfil también valen).",
        `Ej.: \`${citar("banglobal", "es", PREFIXO)} add 01KMBX60MHVS8F0P0CJ0VK3326 01KMBX60MHVS8F0P0CJ0VK3327 raid del 27/09\``,
        "",
        "_Quien ya esté en un servidor de Judy lo nota al instante: baneado donde el modo es `instant` o `consensus` (la lista del dueño vale como consenso), aviso al staff donde es `warn`._",
      ].join("\n"), colour: COR.info,
    }));

    const r = await adicionarPorId(ids, { ctx, motivo, porId: message.authorId });
    const en = lang === "en";
    const X = (pt, eng, es) => tr(ctx, pt, eng, es);
    const L = [];
    for (const a of r.adicionados) {
      const onde = a.acoes.filter((x) => x.acao === "banido").length, avisos = a.acoes.filter((x) => x.acao === "avisado").length;
      L.push(`✅ ${rotularUsuario(a.id, { nome: a.nome })}`
        + (a.jaEstava ? X(" — já estava na lista (registro atualizado)", " — was already listed (record updated)", " — ya estaba en la lista (registro actualizado)") : "")
        + (a.voltouDosIgnorados ? X(" — estava nos ignorados; saiu de lá", " — was on the ignored list; taken off it", " — estaba en los ignorados; salió de ahí") : "")
        + (a.semConfirmar ? X(" — ⚠️ não consegui confirmar a conta no Stoat", " — ⚠️ I couldn't confirm the account with Stoat", " — ⚠️ no pude confirmar la cuenta en Stoat") : "")
        + (onde ? X(` — **banido agora** em ${onde} servidor(es)`, ` — **banned now** in ${onde} server(s)`, ` — **baneado ahora** en ${onde} servidor(es)`) : "")
        + (avisos ? X(` — staff avisada em ${avisos}`, ` — staff warned in ${avisos}`, ` — staff avisado en ${avisos}`) : ""));
    }
    const MOTIVOS = en
      ? { "nao-existe": "no Stoat account has this ID", bot: "it's a bot", "eu": "that's me", dono: "that's the bot owner" }
      : { "nao-existe": "nenhuma conta do Stoat tem esse ID", bot: "é um bot", "eu": "sou eu", dono: "é o dono do bot" };
    const MOTIVOS_ES = { "nao-existe": "ninguna cuenta de Stoat tiene ese ID", bot: "es un bot", "eu": "soy yo", dono: "es el dueño del bot" };
    for (const x of r.recusados) L.push(`❌ \`${x.id}\` — ${X(MOTIVOS[x.motivo] ?? x.motivo, MOTIVOS[x.motivo] ?? x.motivo, MOTIVOS_ES[x.motivo] ?? x.motivo)}`);
    if (descartados.length) L.push("", X(
      `_Não são IDs (entraram no motivo): ${descartados.map((d) => `\`${d}\``).join(" ")}_`,
      `_Not IDs (they went into the reason): ${descartados.map((d) => `\`${d}\``).join(" ")}_`,
      `_No son IDs (entraron en el motivo): ${descartados.map((d) => `\`${d}\``).join(" ")}_`));
    L.push("", `**${X("Motivo", "Reason", "Motivo")}:** ${motivo || X("_sem motivo_", "_none_", "_sin motivo_")}`);
    if (r.adicionados.length) L.push(X(
      `_Mudou de ideia: \`${citarInterno("banglobal.esquecer", PREFIXO)} <id>\`._`,
      `_Changed your mind: \`${citarInterno("banglobal.esquecer", PREFIXO)} <id>\`._`,
      `_¿Cambiaste de idea?: \`${citar("banglobal.esquecer", "es", PREFIXO)} <id>\`._`));

    if (r.adicionados.length) await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Adicionado(s) à lista global pelo dono",
      descricao: `<@${message.authorId}> pôs ${r.adicionados.map((a) => `**${a.nome ?? a.id}** \`${a.id}\``).join(", ")} na lista global.${motivo ? `\n**Motivo:** ${motivo}` : ""}`,
      en: { titulo: "🌐 Added to the global list by the owner",
        descricao: `<@${message.authorId}> put ${r.adicionados.map((a) => `**${a.nome ?? a.id}** \`${a.id}\``).join(", ")} on the global list.${motivo ? `\n**Reason:** ${motivo}` : ""}` },
      es: { titulo: "🌐 Agregado(s) a la lista global por el dueño",
        descricao: `<@${message.authorId}> puso a ${r.adicionados.map((a) => `**${a.nome ?? a.id}** \`${a.id}\``).join(", ")} en la lista global.${motivo ? `\n**Motivo:** ${motivo}` : ""}` },
    });
    return enviarPaginado(ctx, message.channel, {
      paginas: paginarLinhas(L, { titulo: X(`🌐 Lista global — ${r.adicionados.length} adicionado(s)`, `🌐 Global list — ${r.adicionados.length} added`, `🌐 Lista global — ${r.adicionados.length} agregado(s)`), limite: 1500 }),
      autorId: message.authorId,
      colour: r.recusados.length ? COR.aviso : COR.mod,
    });
  }

  // ── &banglobal esquecer <usuário> ──
  if (["esquecer", "forget", "remover", "apagar"].includes(sub)) {
    // A lista é compartilhada por todos os servidores da Judy: apagar alguém
    // dela vale para todos. Com BanMembers em QUALQUER servidor, um invasor
    // limparia o próprio nome em dois comandos — por isso, só o dono do bot.
    // Admin de servidor tem o `isentar`, que vale só no servidor dele.
    if (!ctx.ehSuperAdmin?.(message.authorId)) return sendEmbed(message.channel, tr(ctx, {
      title: "🔒 Só o dono do bot",
      description: "A lista global é **compartilhada** por todos os servidores da Judy — tirar alguém dela vale para todos.\n\n"
        + `Para essa pessoa não ser afetada **neste servidor**: \`${citarInterno("banglobal.isentar", PREFIXO)} <@pessoa|id|nome>\`.`,
      colour: COR.aviso,
    }, {
      title: "🔒 Bot owner only",
      description: "The global list is **shared** by every server Judy is in — taking someone off it applies to all of them.\n\n"
        + `To keep this person unaffected **on this server**: \`${citarInterno("banglobal.isentar", PREFIXO)} <@user|id|name>\`.`,
      colour: COR.aviso,
    }, {
      title: "🔒 Solo el dueño del bot",
      description: "La lista global es **compartida** por todos los servidores de Judy — sacar a alguien de ella vale para todos.\n\n"
        + `Para que esa persona no se vea afectada **en este servidor**: \`${citar("banglobal.isentar", "es", PREFIXO)} <@usuario|id|nombre>\`.`,
      colour: COR.aviso,
    }));
    const entrada = args.slice(1).join(" ");
    const alvo = await alvoDoComando(entrada, { message, server, ctx });
    if (alvo.erro) return sendEmbed(message.channel,
      embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${citarInterno("banglobal.esquecer", PREFIXO)} <@pessoa|id|nome>`, `${citar("banglobal.esquecer", "es", PREFIXO)} <@usuario|id|nombre>`));
    const uid = alvo.id;
    const nome = rotularUsuario(uid, { nome: alvo.nome, client: ctx.client });

    const motivoNota = args.slice(2).join(" ").trim() || null;
    const n = db.esquecerUsuario(uid, {
      nome: alvo.nome ?? null,
      motivo: motivoNota,
      porQuem: message.authorId,
    });
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Usuário removido da lista global",
      descricao: `<@${message.authorId}> removeu ${alvo.nome ?? uid} da lista global (**${n}** registro(s)) — e ela não voltará com bans futuros.`,
      en: { titulo: "🌐 User removed from the global list", descricao: `<@${message.authorId}> removed ${alvo.nome ?? uid} from the global list (**${n}** record(s)) — and future bans won't bring them back.` },
      es: { titulo: "🌐 Usuario quitado de la lista global", descricao: `<@${message.authorId}> quitó a ${alvo.nome ?? uid} de la lista global (**${n}** registro(s)) — y los bans futuros no lo traerán de vuelta.` },
    });
    return sendEmbed(message.channel, tr(ctx, {
      title: n ? "🌐 Removido da lista global" : "🌐 Marcado para ficar de fora",
      description: [
        n
          ? `${nome} saiu da lista: **${n}** registro(s) apagado(s) — em **todos** os servidores.`
          : `${nome} não constava na lista, mas agora está marcado para **não entrar**.`,
        "",
        "**E não volta:** bans futuros em qualquer servidor, e a importação automática a cada 6h, passam a ignorá-lo.",
        `_Desfazer: \`${citarInterno("banglobal.lembrar", PREFIXO)} ${uid}\` · ver todos: \`${citarInterno("banglobal.ignorados", PREFIXO)}\`_`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: n ? "🌐 Removed from the global list" : "🌐 Marked to stay out",
      description: [
        n
          ? `${nome} was removed: **${n}** record(s) deleted — across **every** server.`
          : `${nome} wasn't on the list, but is now marked **not to enter** it.`,
        "",
        "**And it won't come back:** future bans in any server, and the 6-hourly import, will skip them from now on.",
        `_Undo: \`${citarInterno("banglobal.lembrar", PREFIXO)} ${uid}\` · see them all: \`${citarInterno("banglobal.ignorados", PREFIXO)}\`_`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: n ? "🌐 Quitado de la lista global" : "🌐 Marcado para quedar fuera",
      description: [
        n
          ? `${nome} salió de la lista: **${n}** registro(s) borrado(s) — en **todos** los servidores.`
          : `${nome} no estaba en la lista, pero ahora está marcado para **no entrar**.`,
        "",
        "**Y no vuelve:** los bans futuros en cualquier servidor, y la importación automática cada 6 h, pasan a ignorarlo.",
        `_Deshacer: \`${citar("banglobal.lembrar", "es", PREFIXO)} ${uid}\` · ver todos: \`${citar("banglobal.ignorados", "es", PREFIXO)}\`_`,
      ].join("\n"),
      colour: COR.sucesso,
    }));
  }

  // ── &banglobal ignorados — quem está marcado para ficar fora ──
  if (["ignorados", "ignored", "excecoes", "exceções", "foradalista"].includes(sub)) {
    const linhas = db.listarIgnoradosGlobais().map((i) =>
      `• ${rotularUsuario(i.userId, { nome: i.nome, client: ctx.client })} — ${i.motivo ?? tr(ctx, "_sem nota_", "_no note_", "_sin nota_")}`
      + (i.porQuem ? ` _(<@${i.porQuem}>)_` : ""));
    if (!linhas.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "📋 Ninguém marcado", description: `Ninguém está marcado para ficar fora da lista global.\n\n\`${citarInterno("banglobal.esquecer", PREFIXO)} <@pessoa>\` tira alguém e o mantém fora.`, colour: COR.info },
        { title: "📋 Nobody marked", description: `Nobody is marked to stay off the global list.\n\n\`${citarInterno("banglobal.esquecer", PREFIXO)} <@user>\` removes someone and keeps them out.`, colour: COR.info },
        { title: "📋 Nadie marcado", description: `Nadie está marcado para quedar fuera de la lista global.\n\n\`${citar("banglobal.esquecer", "es", PREFIXO)} <@usuario>\` saca a alguien y lo mantiene fuera.`, colour: COR.info }));
    }
    const paginas = paginarLinhas([
      ...linhas,
      "",
      tr(ctx,
        `Bans nestes **nunca** entram na lista. Desfazer: \`${citarInterno("banglobal.lembrar", PREFIXO)} <@pessoa>\``,
        `Bans on these **never** enter the list. Undo: \`${citarInterno("banglobal.lembrar", PREFIXO)} <@user>\``,
        `Los bans de estos **nunca** entran en la lista. Deshacer: \`${citar("banglobal.lembrar", "es", PREFIXO)} <@usuario>\``),
    ], {
      titulo: tr(ctx, `📋 Fora da lista global — ${linhas.length}`, `📋 Kept off the global list — ${linhas.length}`, `📋 Fuera de la lista global — ${linhas.length}`),
    });
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, comandoPagina: `${citarInterno("banglobal.ignorados", PREFIXO)}`, colour: COR.info,
    });
  }

  // ── &banglobal lembrar — desfaz o esquecer ──
  if (["lembrar", "remember", "desesquecer", "unforget", "reincluir"].includes(sub)) {
    // A lista é compartilhada por todos os servidores da Judy: apagar alguém
    // dela vale para todos. Com BanMembers em QUALQUER servidor, um invasor
    // limparia o próprio nome em dois comandos — por isso, só o dono do bot.
    // Admin de servidor tem o `isentar`, que vale só no servidor dele.
    if (!ctx.ehSuperAdmin?.(message.authorId)) return sendEmbed(message.channel, tr(ctx, {
      title: "🔒 Só o dono do bot",
      description: "A lista global é **compartilhada** por todos os servidores da Judy — tirar alguém dela vale para todos.\n\n"
        + `Para essa pessoa não ser afetada **neste servidor**: \`${citarInterno("banglobal.isentar", PREFIXO)} <@pessoa|id|nome>\`.`,
      colour: COR.aviso,
    }, {
      title: "🔒 Bot owner only",
      description: "The global list is **shared** by every server Judy is in — taking someone off it applies to all of them.\n\n"
        + `To keep this person unaffected **on this server**: \`${citarInterno("banglobal.isentar", PREFIXO)} <@user|id|name>\`.`,
      colour: COR.aviso,
    }, {
      title: "🔒 Solo el dueño del bot",
      description: "La lista global es **compartida** por todos los servidores de Judy — sacar a alguien de ella vale para todos.\n\n"
        + `Para que esa persona no se vea afectada **en este servidor**: \`${citar("banglobal.isentar", "es", PREFIXO)} <@usuario|id|nombre>\`.`,
      colour: COR.aviso,
    }));
    const entrada = args.slice(1).join(" ");
    const alvo = await alvoDoComando(entrada, { message, server, ctx });
    if (alvo.erro) return sendEmbed(message.channel,
      embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${citarInterno("banglobal.lembrar", PREFIXO)} <@pessoa|id|nome>`, `${citar("banglobal.lembrar", "es", PREFIXO)} <@usuario|id|nombre>`));
    const n = db.deixarDeIgnorarGlobal(alvo.id);
    const nome = rotularUsuario(alvo.id, { nome: alvo.nome, client: ctx.client });
    if (n) {
      await log.registrar(ctx, "punicoes", {
        titulo: "🌐 Marca de exceção removida",
        descricao: `<@${message.authorId}> permitiu que ${alvo.nome ?? alvo.id} volte a entrar na lista global.`,
        en: { titulo: "🌐 Exception mark removed", descricao: `<@${message.authorId}> allowed ${alvo.nome ?? alvo.id} back onto the global list.` },
        es: { titulo: "🌐 Marca de excepción quitada", descricao: `<@${message.authorId}> permitió que ${alvo.nome ?? alvo.id} vuelva a entrar en la lista global.` },
      });
    }
    return sendEmbed(message.channel, tr(ctx, {
      title: n ? "🌐 Pode voltar para a lista" : "🤷 Não estava marcado",
      description: n
        ? `${nome} volta a entrar na lista global quando for banido de novo.\n\n_Os registros antigos continuam apagados — isto só reabre a porta._`
        : `${nome} não estava marcado para ficar fora. \`${citarInterno("banglobal.ignorados", PREFIXO)}\` lista quem está.`,
      colour: n ? COR.sucesso : COR.info,
    }, {
      title: n ? "🌐 Can rejoin the list" : "🤷 Wasn't marked",
      description: n
        ? `${nome} will enter the global list again on their next ban.\n\n_The old records stay deleted — this only reopens the door._`
        : `${nome} wasn't marked to stay out. \`${citarInterno("banglobal.ignorados", PREFIXO)}\` shows who is.`,
      colour: n ? COR.sucesso : COR.info,
    }, {
      title: n ? "🌐 Puede volver a la lista" : "🤷 No estaba marcado",
      description: n
        ? `${nome} vuelve a entrar en la lista global cuando lo baneen de nuevo.\n\n_Los registros antiguos siguen borrados — esto solo reabre la puerta._`
        : `${nome} no estaba marcado para quedar fuera. \`${citar("banglobal.ignorados", "es", PREFIXO)}\` muestra quién lo está.`,
      colour: n ? COR.sucesso : COR.info,
    }));
  }

  if (["bots", "limparbots", "podar"].includes(sub)) {
    const arg1 = (args[1] ?? "").toLowerCase();
    const confirmou = ["confirmar", "confirm", "sim", "yes"].includes(arg1);
    // (31 out 2026, R9) apagar registros da lista GLOBAL é do dono do bot (como o `esquecer`)
    if (confirmou && !ctx.ehSuperAdmin?.(message.authorId)) return sendEmbed(message.channel, tr(ctx,
      { title: "🔒 Só o dono do bot", description: "Tirar registros da lista global vale para **todos os servidores** — só o dono do bot faz isso.", colour: COR.erro },
      { title: "🔒 Bot owner only", description: "Removing records from the global list affects **every server** — only the bot owner can do it.", colour: COR.erro },
      { title: "🔒 Solo el dueño del bot", description: "Quitar registros de la lista global afecta a **todos los servidores** — solo el dueño del bot puede hacerlo.", colour: COR.erro }));

    if (args[1] && !confirmou) {
      const entrada = args.slice(1).join(" ");
      const alvo = await alvoDoComando(entrada, { message, server, ctx });
      if (alvo.erro) return sendEmbed(message.channel,
        embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${citarInterno("banglobal.bots", PREFIXO)} <@pessoa|id>`, `${citar("banglobal.bots", "es", PREFIXO)} <@usuario|id>`));
      const v = await confirmarSeEhBot(alvo.id, { client: ctx.client });
      const disc = await idsDoDiscover();
      return sendEmbed(message.channel, {
        title: v.ehBot ? tr(ctx, "🤖 É um bot", "🤖 It's a bot", "🤖 Es un bot") : tr(ctx, "🙋 Não consegui provar que é bot", "🙋 I couldn't prove it's a bot", "🙋 No pude demostrar que es un bot"),
        description: [
          `${rotularUsuario(alvo.id, { nome: alvo.nome, client: ctx.client })} — \`${alvo.id}\``,
          "",
          v.ehBot
            ? tr(ctx, `Descoberto por: **${v.via}**`, `Found via: **${v.via}**`, `Descubierto por: **${v.via}**`)
            : tr(ctx,
                "Nenhum dos sinais respondeu sim: a vitrine `/bots/{id}/invite` (só responde por bots **públicos**), o cliente e a API (`/users/{id}` só responde sobre quem divide servidor comigo) e o discover.",
                "None of the signals said yes: the `/bots/{id}/invite` showcase (only answers for **public** bots), the client and the API (`/users/{id}` only answers about users I share a server with), and discover.",
                "Ninguna de las señales dijo que sí: el escaparate `/bots/{id}/invite` (solo responde por bots **públicos**), el cliente y la API (`/users/{id}` solo responde sobre quien comparte servidor conmigo) y el discover."),
          "",
          `**Discover:** ${disc.erro ? `🔴 ${tr(ctx, "fora do ar", "unavailable", "no disponible")}` : `🟢 ${disc.ids.size} ${tr(ctx, "id(s) lidos", "id(s) read", "id(s) leídos")}`} _(${DISCOVER_URL})_`,
          "",
          v.ehBot
            ? `\`${citarInterno("banglobal.bots.confirmar", PREFIXO)}\` ${tr(ctx, "tira todos os bots da lista", "removes every bot from the list", "saca todos los bots de la lista")}`
            : tr(ctx,
              `Sabendo que é bot, tire-o à mão: \`${citarInterno("banglobal.esquecer", PREFIXO)} ${alvo.id} é um bot\``,
              `If you know it's a bot, remove it by hand: \`${citarInterno("banglobal.esquecer", PREFIXO)} ${alvo.id} é um bot\``,
              `Si sabes que es un bot, sácalo a mano: \`${citar("banglobal.esquecer", "es", PREFIXO)} ${alvo.id} es un bot\``),
        ].join("\n"), colour: v.ehBot ? COR.info : COR.aviso });
    }

    const ids = db.idsBanidosGlobais();
    const achados = [];
    const porVia = new Map();
    await idsDoDiscover();
    for (const uid of ids) {
      const v = await confirmarSeEhBot(uid, { client: ctx.client });
      if (!v.ehBot) continue;
      porVia.set(v.via, (porVia.get(v.via) ?? 0) + 1);
      achados.push({ id: uid, nome: db.nomeDeBanido(uid) ?? ctx.client?.users?.get?.(uid)?.username ?? uid });
    }
    if (!achados.length) {
      const disc = await idsDoDiscover();
      return sendEmbed(message.channel, tr(ctx, {
        title: "✅ Nenhum bot na lista",
        description: [
          `Conferi **${ids.length}** registro(s) por quatro caminhos e nenhum acusou bot.`,
          "",
          `**Discover:** ${disc.erro ? `🔴 fora do ar` : `🟢 ${disc.ids.size} id(s) lidos`} _(${DISCOVER_URL})_`,
          "",
          `Se você está **vendo** um bot na lista, \`${citarInterno("banglobal.bots", PREFIXO)} <@ele>\` diz qual sinal falhou.`,
        ].join("\n"), colour: COR.sucesso,
      }, {
        title: "✅ No bots on the list",
        description: [
          `I checked **${ids.length}** record(s) through four routes and none flagged a bot.`,
          "",
          `**Discover:** ${disc.erro ? `🔴 unavailable` : `🟢 ${disc.ids.size} id(s) read`} _(${DISCOVER_URL})_`,
          "",
          `If you can **see** a bot on the list, \`${citarInterno("banglobal.bots", PREFIXO)} <@it>\` says which signal failed.`,
        ].join("\n"), colour: COR.sucesso,
      }, {
        title: "✅ Ningún bot en la lista",
        description: [
          `Comprobé **${ids.length}** registro(s) por cuatro caminos y ninguno señaló un bot.`,
          "",
          `**Discover:** ${disc.erro ? `🔴 no disponible` : `🟢 ${disc.ids.size} id(s) leídos`} _(${DISCOVER_URL})_`,
          "",
          `Si estás **viendo** un bot en la lista, \`${citar("banglobal.bots", "es", PREFIXO)} <@él>\` dice qué señal falló.`,
        ].join("\n"), colour: COR.sucesso,
      }));
    }
    const lista = achados.slice(0, 20).map((a) => `• **${a.nome}** — \`${a.id}\``).join("\n");
    if (!confirmou) {
      return sendEmbed(message.channel, tr(ctx, {
        title: `🤖 ${achados.length} bot(s) na lista global`,
        description: [lista, achados.length > 20 ? `\n_… e mais ${achados.length - 20}._` : "", "",
          "Bots não escolhem entrar em servidor nenhum — alguém os adiciona. Manter isso na lista faria o ban automático derrubar integrações que o dono acabou de instalar.",
          "", `_Descobertos por: ${[...porVia].map(([v, n]) => `${v} (${n})`).join(" · ")}_`,
          "", `Remover todos: \`${citarInterno("banglobal.bots.confirmar", PREFIXO)}\``].filter(Boolean).join("\n").slice(0, 1900),
        colour: COR.aviso,
      }, {
        title: `🤖 ${achados.length} bot(s) on the global list`,
        description: [lista, achados.length > 20 ? `\n_… and ${achados.length - 20} more._` : "", "",
          "Bots don't choose to join anywhere — someone adds them. Keeping them listed would make the auto-ban knock out integrations the owner just installed.",
          "", `_Found via: ${[...porVia].map(([v, n]) => `${v} (${n})`).join(" · ")}_`,
          "", `Remove them all: \`${citarInterno("banglobal.bots.confirmar", PREFIXO)}\``].filter(Boolean).join("\n").slice(0, 1900),
        colour: COR.aviso,
      }, {
        title: `🤖 ${achados.length} bot(s) en la lista global`,
        description: [lista, achados.length > 20 ? `\n_… y ${achados.length - 20} más._` : "", "",
          "Los bots no eligen entrar en ningún servidor — alguien los agrega. Mantenerlos en la lista haría que el ban automático tumbara integraciones que el dueño acaba de instalar.",
          "", `_Descubiertos por: ${[...porVia].map(([v, n]) => `${v} (${n})`).join(" · ")}_`,
          "", `Quitarlos todos: \`${citar("banglobal.bots.confirmar", "es", PREFIXO)}\``].filter(Boolean).join("\n").slice(0, 1900),
        colour: COR.aviso,
      }));
    }
    const n = db.removerBotsDaLista(achados);
    await log.registrar(ctx, "punicoes", {
      titulo: "🤖 Bots removidos da lista global",
      descricao: `<@${message.authorId}> removeu **${achados.length}** bot(s) (**${n}** registro(s)).`,
      en: { titulo: "🤖 Bots removed from the global list", descricao: `<@${message.authorId}> removed **${achados.length}** bot(s) (**${n}** record(s)).` },
      es: { titulo: "🤖 Bots quitados de la lista global", descricao: `<@${message.authorId}> quitó **${achados.length}** bot(s) (**${n}** registro(s)).` },
    });
    return sendEmbed(message.channel, tr(ctx,
      { title: `🤖 ${achados.length} bot(s) removido(s)`,
        description: `**${n}** registro(s) apagado(s), e estes ficam **marcados**: um ban futuro num deles não os traz de volta.\n\n_\`${citarInterno("banglobal.ignorados", PREFIXO)}\` mostra a lista._`, colour: COR.sucesso },
      { title: `🤖 ${achados.length} bot(s) removed`,
        description: `**${n}** record(s) deleted, and these are now **marked**: a future ban on one of them won't bring it back.\n\n_\`${citarInterno("banglobal.ignorados", PREFIXO)}\` shows the list._`, colour: COR.sucesso },
      { title: `🤖 ${achados.length} bot(s) quitado(s)`,
        description: `**${n}** registro(s) borrado(s), y estos quedan **marcados**: un ban futuro en uno de ellos no los trae de vuelta.\n\n_\`${citar("banglobal.ignorados", "es", PREFIXO)}\` muestra la lista._`, colour: COR.sucesso }));
  }

  return sendEmbed(message.channel, tr(ctx, {
    title: "❌ Subcomando desconhecido",
    description: `Use \`${citarInterno("banglobal", PREFIXO)}\` para ver as opções.`,
    colour: COR.erro,
  }, {
    title: "❌ Unknown subcommand",
    description: `Use \`${citarInterno("banglobal", PREFIXO)}\` to see the options.`,
    colour: COR.erro,
  }, {
    title: "❌ Subcomando desconocido",
    description: `Usa \`${citar("banglobal", "es", PREFIXO)}\` para ver las opciones.`,
    colour: COR.erro,
  }));
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
  db.registrarBanGlobal(userId, serverId, ban?.reason ?? "banido no servidor", "propagado", { nome });
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
