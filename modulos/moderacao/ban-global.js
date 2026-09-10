
import * as db  from "../core/db.js";
import { descreverErro } from "../core/erros.js";
import * as log from "../core/log.js";
import { resolverUsuario as resolverUser, resolverUsuarioDetalhado, ehBot } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";

const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");

export const MODOS = {
  off:    "ignora a lista global",
  avisar: "alerta os moderadores quando um banido entra",
  banir:  "bane automaticamente quem está na lista",
};
export const MODOS_EN = {
  off:    "ignores the global list",
  avisar: "alerts the moderators when a banned user joins",
  banir:  "automatically bans anyone on the list",
};

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
  try {
    const r = await fetch(`${API}/bots/${userId}/invite`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return guardar(true, "/bots/{id}/invite");
  } catch { /* rede: segue para as outras */ }

  // 2. O cliente, que sabe quando há servidor em comum.
  try {
    const u = await client?.users?.fetch?.(userId)?.catch?.(() => null);
    if (u && ehBot(u)) return guardar(true, "users.fetch");
  } catch {}

  // 3. A API direta — mesma limitação do item 2, mas funciona com o cache frio.
  try {
    const token = process.env.BOT_TOKEN;
    if (token) {
      const r = await fetch(`${API}/users/${userId}`, {
        headers: { "X-Bot-Token": token },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok && ehBot(await r.json().catch(() => null))) return guardar(true, "/users/{id}");
    }
  } catch {}

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

function embedAlvoNaoResolvido(ctx, r, entrada, uso) {
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
    });
  }
  return tr(ctx, {
    title: "❌ Não achei essa pessoa",
    description: [
      `\`${uso}\``,
      "",
      entrada ? `Procurei por **${entrada}** entre os membros, os banidos e a própria lista global.` : "",
      "Aceito **menção**, **ID**, **link do perfil**, o **nome** ou `Nome#0000`.",
      "",
      `_Se a pessoa não está em nenhum servidor em comum, só o **ID** funciona — ele aparece em \`${PREFIXO}banglobal lista\`._`,
    ].filter(Boolean).join("\n"), colour: COR.erro,
  }, {
    title: "❌ Couldn't find that person",
    description: [
      `\`${uso}\``,
      "",
      entrada ? `I looked for **${entrada}** among the members, the banned users and the global list itself.` : "",
      "I accept a **mention**, an **ID**, a **profile link**, the **name** or `Name#0000`.",
      "",
      `_If they're not in any shared server, only the **ID** works — it shows in \`${PREFIXO}banglobal lista\`._`,
    ].filter(Boolean).join("\n"), colour: COR.erro,
  });
}

export function rotularUsuario(userId, { nome = null, client = null } = {}) {
  const conhecido = nome
    ?? (() => { try { return db.nomeDeBanido(userId); } catch { return null; } })()
    ?? (() => { try { return client?.users?.get?.(userId)?.username ?? null; } catch { return null; } })();
  return conhecido ? `**${conhecido}** \`${userId}\`` : `\`${userId}\` _(nome desconhecido)_`;
}

export function estaIsento(config, userId) {
  return (config?.banGlobal?.isentos ?? []).includes(userId);
}

async function desbanir(server, serverId, userId) {
  try {
    if (typeof server?.unbanUser === "function") { await server.unbanUser(userId); return { ok: true }; }
  } catch (e) { /* cai no REST */ }
  const token = process.env.BOT_TOKEN;
  if (!token) return { ok: false, erro: "sem BOT_TOKEN para falar com a API" };
  try {
    const r = await fetch(`${API}/servers/${serverId}/bans/${userId}`, {
      method: "DELETE", headers: { "X-Bot-Token": token },
    });
    if (!r.ok && r.status !== 404) {
      const corpo = await r.text().catch(() => "");
      return { ok: false, erro: `HTTP ${r.status} ${corpo.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e?.message ?? String(e) };
  }
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
      });
    }
  } catch (err) {
    console.error(`[BANGLOBAL] servidor novo ${sid}:`, err?.message);
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

export async function verificarEntrada(member, ctx) {
  const serverId = member?.id?.server;
  const userId   = member?.id?.user;
  if (!serverId || !userId) return false;

  const modo = ctx.config?.banGlobal?.modo ?? "off";
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

  const n = historico.length;
  const motivos = historico.slice(0, 3)
    .map((b) => `• \`${b.serverId}\` — ${b.motivo ?? "_sem motivo_"} _(${data(b.criadoEm)})_`)
    .join("\n");
  const quemEntrou = member?.user?.username ?? member?.nickname ?? null;
  const resumo = `${rotularUsuario(userId, { nome: quemEntrou, client: ctx.client })} consta na lista global: banido em **${n}** servidor(es).\n${motivos}`
    + (n > 3 ? `\n_… e mais ${n - 3}._` : "");

  // ── modo avisar: só alerta, não age ──
  if (modo === "avisar") {
    await log.registrar(ctx, "punicoes", {
      titulo: "⚠️ Usuário da lista global entrou",
      descricao: `${resumo}\n\n_Modo **avisar**: nenhuma ação automática foi tomada._`,
    });
    console.log(`[BANGLOBAL] ⚠️ ${userId} (na lista, ${n} servidor(es)) entrou em ${serverId} — só aviso`);
    return false;
  }

  // ── modo banir: bane automaticamente ──
  if (modo === "banir") {
    try {
      const server = member.server ?? await ctx.client.servers.fetch(serverId);
      await server.banUser(userId, { reason: `[Ban global] banido em ${n} outro(s) servidor(es)` });
      db.registrarBanGlobal(userId, serverId, `ban global (${n} servidores)`, "banglobal",
        { nome: member?.user?.username ?? member?.nickname ?? null });
      await log.registrar(ctx, "punicoes", {
        titulo: "🔨 Ban automático (lista global)",
        descricao: `${resumo}\n\n_Modo **banir**: usuário banido automaticamente._`,
      });
      console.log(`[BANGLOBAL] 🔨 ${userId} banido automaticamente em ${serverId}`);
      return true;
    } catch (err) {
      console.error("[BANGLOBAL][BAN]", err?.message);
      await log.registrar(ctx, "punicoes", {
        titulo: "❌ Falha no ban automático",
        descricao: `${resumo}\n\n**Erro:** ${err?.message}`,
      });
      return false;
    }
  }
  return false;
}

export async function varrer(ctx, message, { aplicar = true } = {}) {
  const serverId = ctx.serverId;
  const modo = ctx.config?.banGlobal?.modo ?? "off";
  const server = await ctx.getServer?.(message);
  if (!server) return { erro: "não consegui acessar o servidor" };

  let membros = [];
  try {
    const r = await server.fetchMembers();
    membros = r?.members ?? r ?? [];
  } catch (e) {
    return { erro: `não consegui listar os membros (${e?.message ?? e})` };
  }

  const achados = [];
  const isentos = [];
  for (const m of membros) {
    const uid = m?.id?.user ?? m?.user?.id ?? m?.id;
    if (!uid) continue;
    if (ehBot(m) || ehBot(m?.user)) continue;   // bots não são varridos
    const hist = db.historicoBans(uid).filter((b) => b.serverId !== serverId);
    if (!hist.length) continue;
    const nome = m?.user?.username ?? m?.nickname ?? db.nomeDeBanido(uid) ?? uid;
    if (estaIsento(ctx.config, uid)) { isentos.push({ uid, nome, n: hist.length }); continue; }
    achados.push({ uid, nome, n: hist.length, membro: m });
  }

  if (!aplicar || modo !== "banir") return { total: membros.length, achados, isentos, aplicados: [], modo };

  const aplicados = [];
  for (const a of achados) {
    try {
      await server.banUser(a.uid, { reason: `[Ban global] banido em ${a.n} outro(s) servidor(es)` });
      db.registrarBanGlobal(a.uid, serverId, `ban global (${a.n} servidores, varredura)`, "banglobal", { nome: a.nome });
      aplicados.push({ ...a, ok: true });
      console.log(`[BANGLOBAL] 🔨 ${a.uid} banido na varredura de ${serverId}`);
    } catch (e) {
      aplicados.push({ ...a, ok: false, erro: e?.message ?? String(e) });
      console.error(`[BANGLOBAL][varredura] falha em ${a.uid}:`, e?.message);
    }
  }
  if (aplicados.length) {
    await log.registrar(ctx, "punicoes", {
      titulo: "🔨 Varredura da lista global",
      descricao: aplicados.map((a) => `${a.ok ? "🔨" : "❌"} ${a.nome} \`${a.uid}\` — ${a.n} servidor(es)${a.ok ? "" : ` — erro: ${a.erro}`}`).join("\n").slice(0, 1800),
    });
  }
  return { total: membros.length, achados, isentos, aplicados, modo };
}

export async function cmdBanGlobal(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO, serverId } = ctx;
  const lang = lingua(ctx);
  const L_MODOS = lang === "en" ? MODOS_EN : MODOS;

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
    }));
  }

  config.banGlobal ??= { modo: "off" };
  const sub = args[0]?.toLowerCase();

  // ── &banglobal → status ──
  if (!sub) {
    const modo = config.banGlobal.modo ?? "off";
    if (lang === "en") return sendEmbed(message.channel, {
      title: "🌐 Global ban list",
      description: [
        `**Current mode:** \`${modo}\` — ${L_MODOS[modo]}`,
        "",
        "**Available modes:**",
        ...Object.entries(L_MODOS).map(([k, v]) => `\`${k}\` — ${v}`),
        "",
        `**Listed:** ${db.usuariosBanidosDistintos()} user(s), ${db.totalBansGlobais()} record(s) — ${db.bansGlobaisDoServidor(serverId)} from this server.`,
        `**Exempt here:** ${(config.banGlobal.isentos ?? []).length} person(s) this server accepts despite the list.`,
        "",
        "**Commands:**",
        `\`${PREFIXO}banglobal <off|avisar|banir>\` — sets the mode`,
        `\`${PREFIXO}banglobal lista\` — **everyone on the list** · \`lista servidor\` for this server's only`,
        `\`${PREFIXO}banglobal historico <@user|id>\` — one user's history`,
        `\`${PREFIXO}banglobal revisar\` — checks who's already here. **Shows only, never acts**`,
        `\`${PREFIXO}banglobal varrer confirmar\` — ⚠️ actually **bans** the ones found`,
        `\`${PREFIXO}banglobal isentar <@user>\` — accept someone despite the list _(and unban them here)_`,
        `\`${PREFIXO}banglobal isentos\` — who is exempt here`,
        `\`${PREFIXO}banglobal desfazer\` — ↩️ reverts the bans the list applied here`,
        `\`${PREFIXO}banglobal esquecer <@user|id> [nota]\` — removes a user from the list **for everyone**, and keeps them out for good`,
        `\`${PREFIXO}banglobal ignorados\` — who is kept out · \`lembrar <@user>\` undoes it`,
        `\`${PREFIXO}banglobal bots\` — finds bots on the list and drops them`,
        "",
        `**Contribution:** 🟢 always on — this server's bans (old and new) feed the list on their own. There's nothing to configure and no command to run.`,
        "",
        "_The mode above only decides whether this server **benefits** from the list. You can opt out of using it, but not out of feeding it._",
        "",
        "⚠️ _The `banir` mode acts on its own based on bans from **other** servers. Use it only if you trust the sources._",
        "",
        "_`revisar` **looks**; `varrer confirmar` **bans**. They used to be the same thing and that already caused accidental bans — now they're separate commands, and the sweep always shows the list first._",
      ].join("\n"),
      colour: COR.mod,
    });
    return sendEmbed(message.channel, {
      title: "🌐 Lista global de banimentos",
      description: [
        `**Modo atual:** \`${modo}\` — ${L_MODOS[modo]}`,
        "",
        "**Modos disponíveis:**",
        ...Object.entries(L_MODOS).map(([k, v]) => `\`${k}\` — ${v}`),
        "",
        `**Na lista:** ${db.usuariosBanidosDistintos()} usuário(s), ${db.totalBansGlobais()} registro(s) — ${db.bansGlobaisDoServidor(serverId)} deste servidor.`,
        `**Isentos aqui:** ${(config.banGlobal.isentos ?? []).length} pessoa(s) que este servidor aceita apesar da lista.`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}banglobal <off|avisar|banir>\` — define o modo`,
        `\`${PREFIXO}banglobal lista\` — **todos os banidos** · \`lista servidor\` só os deste servidor`,
        `\`${PREFIXO}banglobal historico <@usuário|id>\` — histórico de uma pessoa`,
        `\`${PREFIXO}banglobal revisar\` — confere quem já está aqui. **Só mostra, nunca age**`,
        `\`${PREFIXO}banglobal varrer confirmar\` — ⚠️ **bane** de verdade quem for encontrado`,
        `\`${PREFIXO}banglobal isentar <@pessoa>\` — aceitar alguém apesar da lista _(e desbanir aqui)_`,
        `\`${PREFIXO}banglobal isentos\` — quem está isento neste servidor`,
        `\`${PREFIXO}banglobal desfazer\` — ↩️ reverte os bans que a lista aplicou aqui`,
        `\`${PREFIXO}banglobal esquecer <@usuário|id> [nota]\` — tira alguém da lista **para todos os servidores**, e o mantém fora`,
        `\`${PREFIXO}banglobal ignorados\` — quem está fora · \`lembrar <@pessoa>\` desfaz`,
        `\`${PREFIXO}banglobal bots\` — acha bots na lista e os tira`,
        "",
        `**Contribuição:** 🟢 sempre ligada — os bans deste servidor (antigos e novos) alimentam a lista sozinhos. Não há o que configurar nem comando a rodar.`,
        "",
        "_O modo acima decide só se este servidor **se aproveita** da lista. Dá para não usar a lista, mas não dá para usá-la sem alimentá-la._",
        "",
        "⚠️ _O modo `banir` age sozinho com base em bans de **outros** servidores. Use com confiança na origem._",
        "",
        "_`revisar` **olha**; `varrer confirmar` **bane**. Os dois eram a mesma coisa e isso já custou bans por engano — agora são comandos separados, e a varredura sempre mostra a lista antes._",
      ].join("\n"),
      colour: COR.mod,
    });
  }

  // ── &banglobal <off|avisar|banir> ──
  if (Object.hasOwn(MODOS, sub)) {
    config.banGlobal.modo = sub;
    salvarConfig();
    const extra = sub === "banir"
      ? (lang === "en"
        ? "\n\n⚠️ _From now on, anyone on the list will be **automatically banned** on joining._"
        : "\n\n⚠️ _A partir de agora, quem consta na lista será **banido automaticamente** ao entrar._")
      : "";
    await log.registrar(ctx, "punicoes", {
      titulo: "🌐 Ban global reconfigurado",
      descricao: `Modo alterado para **${sub}** por <@${message.authorId}>.`,
    });
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🌐 Global ban updated" : "🌐 Ban global atualizado",
      description: lang === "en"
        ? `**Mode:** \`${sub}\` — ${L_MODOS[sub]}.${extra}`
        : `**Modo:** \`${sub}\` — ${L_MODOS[sub]}.${extra}`,
      colour: COR.mod,
    });
  }

  // ── &banglobal historico <usuário> ──
  if (["historico", "histórico", "history", "ver", "porque"].includes(sub)) {
    const alvo = await alvoDoComando(args.slice(1).join(" "), { message, server, ctx });
    if (alvo.erro) return sendEmbed(message.channel,
      embedAlvoNaoResolvido(ctx, alvo.erro, args.slice(1).join(" "), `${PREFIXO}banglobal historico <@pessoa|id|nome>`));
    const uid = alvo.id;
    const nome = rotularUsuario(uid, { nome: alvo.nome, client: ctx.client });

    const hist = db.historicoBans(uid);
    if (!hist.length) return sendEmbed(message.channel, tr(ctx,
      { title: "🌐 Histórico global",
        description: `${nome} **não consta** na lista global de banimentos.`, colour: COR.sucesso },
      { title: "🌐 Global history",
        description: `${nome} is **not** on the global ban list.`, colour: COR.sucesso }));

    return sendEmbed(message.channel, tr(ctx, {
      title: "🌐 Histórico global",
      description: [
        `${nome} — banido em **${hist.length}** servidor(es):`,
        "",
        ...hist.slice(0, 10).map((b) =>
          `• \`${b.serverId}\` — ${b.motivo ?? "_sem motivo_"} _(${data(b.criadoEm)}, ${b.origem})_`),
        hist.length > 10 ? `\n_… e mais ${hist.length - 10}._` : "",
        "",
        `_Aceita aqui mesmo assim: \`${PREFIXO}banglobal isentar ${uid}\`_`,
      ].filter(Boolean).join("\n"),
      colour: COR.aviso,
    }, {
      title: "🌐 Global history",
      description: [
        `${nome} — banned on **${hist.length}** server(s):`,
        "",
        ...hist.slice(0, 10).map((b) =>
          `• \`${b.serverId}\` — ${b.motivo ?? "_no reason_"} _(${data(b.criadoEm)}, ${b.origem})_`),
        hist.length > 10 ? `\n_… and ${hist.length - 10} more._` : "",
        "",
        `_Accept them here anyway: \`${PREFIXO}banglobal isentar ${uid}\`_`,
      ].filter(Boolean).join("\n"),
      colour: COR.aviso,
    }));
  }

  if (["revisar", "review", "conferir", "checar", "ver"].includes(sub)) {
    await sendEmbed(message.channel, tr(ctx,
      { title: "🔎 Revisando…", description: "Conferindo os membros contra a lista global. Nada será feito.", colour: COR.info },
      { title: "🔎 Reviewing…", description: "Checking members against the global list. Nothing will be done.", colour: COR.info }));

    const r = await varrer(ctx, message, { aplicar: false });
    if (r.erro) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Revisão falhou", description: `${r.erro}\n\n_O bot precisa de permissão para ver os membros._`, colour: COR.erro },
        { title: "❌ Review failed", description: `${r.erro}\n\n_The bot needs permission to see the members._`, colour: COR.erro }));
    }
    if (!r.achados.length && !r.isentos.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nenhum encontrado", description: `Conferi **${r.total}** membro(s) e ninguém consta na lista global.`, colour: COR.sucesso },
        { title: "✅ Nobody found", description: `I checked **${r.total}** member(s) and nobody is on the global list.`, colour: COR.sucesso }));
    }

    const linhas = [
      tr(ctx, `De **${r.total}** membro(s) do servidor:`, `Out of **${r.total}** server member(s):`), "",
      ...r.achados.map((a) => tr(ctx,
        `• **${a.nome}** \`${a.uid}\` — banido em ${a.n} servidor(es)`,
        `• **${a.nome}** \`${a.uid}\` — banned on ${a.n} server(s)`)),
    ];
    if (r.isentos.length) {
      linhas.push("", tr(ctx, `**Isentos** _(este servidor já decidiu aceitar)_`, `**Exempt** _(this server already chose to accept them)_`),
        ...r.isentos.map((a) => `• **${a.nome}** \`${a.uid}\` — ${a.n}`));
    }
    linhas.push("", tr(ctx,
      `_Revisão: **nada foi feito**._\n\`${PREFIXO}banglobal isentar <@pessoa>\` — aceitar alguém apesar da lista\n\`${PREFIXO}banglobal historico <@pessoa>\` — ver por que ela está lá\n\`${PREFIXO}banglobal varrer\` — se você realmente quiser **banir** os de cima`,
      `_Review: **nothing was done**._\n\`${PREFIXO}banglobal isentar <@user>\` — accept someone despite the list\n\`${PREFIXO}banglobal historico <@user>\` — see why they're on it\n\`${PREFIXO}banglobal varrer\` — if you really want to **ban** the ones above`));

    const paginas = paginarLinhas(linhas, {
      titulo: tr(ctx, `🔎 Revisão — ${r.achados.length} na lista global`, `🔎 Review — ${r.achados.length} on the global list`),
      limite: 1300,
    });
    return enviarPaginado(ctx, message.channel, { paginas, autorId: message.authorId, colour: COR.aviso });
  }

  // ── varrer: age, mas só depois de você ver a lista e confirmar ──
  if (["varrer", "varredura", "scan", "sweep"].includes(sub)) {
    const arg1 = (args[1] ?? "").toLowerCase();
    const confirmou = ["confirmar", "confirm", "sim", "yes"].includes(arg1);
    const modo = config?.banGlobal?.modo ?? "off";

    if (modo !== "banir") {
      return sendEmbed(message.channel, tr(ctx, {
        title: "🌐 A varredura só bane no modo `banir`",
        description: [
          `O modo atual é \`${modo}\`.`,
          "",
          `Para **só conferir**, use \`${PREFIXO}banglobal revisar\` — ele mostra quem consta na lista e não faz nada.`,
          `Para banir, mude o modo com \`${PREFIXO}banglobal banir\` e varra de novo.`,
        ].join("\n"), colour: COR.aviso,
      }, {
        title: "🌐 The sweep only bans in `banir` mode",
        description: [
          `The current mode is \`${modo}\`.`,
          "",
          `To **just check**, use \`${PREFIXO}banglobal revisar\` — it shows who's on the list and does nothing.`,
          `To ban, switch with \`${PREFIXO}banglobal banir\` and sweep again.`,
        ].join("\n"), colour: COR.aviso,
      }));
    }

    await sendEmbed(message.channel, tr(ctx,
      { title: "🔎 Varrendo os membros…", description: "Conferindo quem já está no servidor contra a lista global.", colour: COR.info },
      { title: "🔎 Sweeping the members…", description: "Checking everyone already in the server against the global list.", colour: COR.info }));

    const previa = await varrer(ctx, message, { aplicar: false });
    if (previa.erro) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Varredura falhou", description: `${previa.erro}\n\n_O bot precisa de permissão para ver os membros._`, colour: COR.erro },
        { title: "❌ Sweep failed", description: `${previa.erro}\n\n_The bot needs permission to see the members._`, colour: COR.erro }));
    }
    if (!previa.achados.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nenhum encontrado", description: `Conferi **${previa.total}** membro(s) e ninguém a banir.`, colour: COR.sucesso },
        { title: "✅ Nobody found", description: `I checked **${previa.total}** member(s) and there's nobody to ban.`, colour: COR.sucesso }));
    }

    const lista = previa.achados.slice(0, 15)
      .map((a) => tr(ctx, `• **${a.nome}** \`${a.uid}\` — ${a.n} servidor(es)`, `• **${a.nome}** \`${a.uid}\` — ${a.n} server(s)`)).join("\n");
    const extra = previa.achados.length > 15
      ? tr(ctx, `\n_… e mais ${previa.achados.length - 15}._`, `\n_… and ${previa.achados.length - 15} more._`) : "";

    if (!confirmou) {
      return sendEmbed(message.channel, tr(ctx, {
        title: `⚠️ Confirmar: banir ${previa.achados.length} pessoa(s)?`,
        description: [
          `De **${previa.total}** membro(s), estas constam na lista global:`, "", lista + extra, "",
          "**Nada foi feito ainda.**",
          "",
          `Para banir todas: \`${PREFIXO}banglobal varrer confirmar\``,
          `Para poupar alguém antes: \`${PREFIXO}banglobal isentar <@pessoa>\``,
          `Para entender um caso: \`${PREFIXO}banglobal historico <@pessoa>\``,
          "",
          "_Banir é irreversível pelo lado de quem levou o ban: ela precisa de convite novo para voltar._",
        ].join("\n").slice(0, 1900), colour: COR.aviso,
      }, {
        title: `⚠️ Confirm: ban ${previa.achados.length} people?`,
        description: [
          `Out of **${previa.total}** member(s), these are on the global list:`, "", lista + extra, "",
          "**Nothing has been done yet.**",
          "",
          `To ban them all: \`${PREFIXO}banglobal varrer confirmar\``,
          `To spare someone first: \`${PREFIXO}banglobal isentar <@user>\``,
          `To understand a case: \`${PREFIXO}banglobal historico <@user>\``,
          "",
          "_A ban is irreversible from the other side: they need a fresh invite to come back._",
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
        `_Errou? \`${PREFIXO}banglobal desfazer\` reverte os bans que EU apliquei aqui._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso,
    }, {
      title: `🔨 Sweep finished — ${ok} banned`,
      description: [
        `I checked **${r.total}** member(s); **${r.achados.length}** were on the list.`, "", lista + extra,
        falhas.length ? `\n**Failures (${falhas.length}):**\n` + falhas.slice(0, 5).map((f) => `• ${f.nome}: ${f.erro}`).join("\n") : "",
        falhas.length ? "_Common failure: the bot's role needs **BanMembers** and must sit above the person's role._" : "",
        "",
        `_Wrong call? \`${PREFIXO}banglobal desfazer\` reverts the bans I applied here._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas.length ? COR.aviso : COR.sucesso,
    }));
  }

  if (["desfazer", "undo", "reverter", "revert"].includes(sub)) {
    const confirmou = ["confirmar", "confirm", "sim", "yes"].includes((args[1] ?? "").toLowerCase());
    const aplicados = db.bansGlobaisPorOrigem(serverId, ["banglobal"]);
    if (!aplicados.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Nada a desfazer", description: "Não há ban aplicado pela lista global neste servidor.", colour: COR.sucesso },
        { title: "✅ Nothing to undo", description: "There's no ban applied by the global list on this server.", colour: COR.sucesso }));
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
          `Confirme com \`${PREFIXO}banglobal desfazer confirmar\`.`,
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
          `Confirm with \`${PREFIXO}banglobal desfazer confirmar\`.`,
          "",
          "_Manual and automod bans are left alone._",
        ].filter(Boolean).join("\n").slice(0, 1900), colour: COR.aviso,
      }));
    }

    config.banGlobal.isentos ??= [];
    const feitos = [], falhou = [];
    for (const b of aplicados) {
      const r = await desbanir(server, serverId, b.userId);
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
    });
    return sendEmbed(message.channel, tr(ctx, {
      title: `↩️ ${feitos.length} ban(s) desfeito(s)`,
      description: [
        feitos.length ? feitos.map((u) => `✅ ${rotularUsuario(u, { client: ctx.client })} — desbanido e isento aqui`).join("\n") : "",
        falhou.length ? `\n**Não consegui (${falhou.length}):**\n` + falhou.slice(0, 5).map((f) => `❌ ${rotularUsuario(f.uid, { client: ctx.client })} — ${f.erro}`).join("\n") : "",
        "",
        "As pessoas precisam de um **convite novo** para voltar: o desban só remove o impedimento.",
        `_Ver quem está isento: \`${PREFIXO}banglobal isentos\`._`,
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhou.length ? COR.aviso : COR.sucesso,
    }, {
      title: `↩️ ${feitos.length} ban(s) undone`,
      description: [
        feitos.length ? feitos.map((u) => `✅ ${rotularUsuario(u, { client: ctx.client })} — unbanned and exempt here`).join("\n") : "",
        falhou.length ? `\n**Couldn't do (${falhou.length}):**\n` + falhou.slice(0, 5).map((f) => `❌ ${rotularUsuario(f.uid, { client: ctx.client })} — ${f.erro}`).join("\n") : "",
        "",
        "They need a **fresh invite** to come back: unbanning only removes the block.",
        `_See who's exempt: \`${PREFIXO}banglobal isentos\`._`,
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
          `\`${PREFIXO}banglobal isentar <@pessoa|id>\` — aceitar alguém`,
          `\`${PREFIXO}banglobal isentar remover <@pessoa|id>\` — voltar atrás`,
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
          `\`${PREFIXO}banglobal isentar <@user|id>\` — accept someone`,
          `\`${PREFIXO}banglobal isentar remover <@user|id>\` — take it back`,
        ].join("\n").slice(0, 1900), colour: COR.info,
      }));
    }

    const removendo = ["remover", "remove", "tirar", "off"].includes(acao);
    const entrada = removendo ? args.slice(2).join(" ") : args.slice(1).join(" ");
    const alvo = await alvoDoComando(entrada, { message, server, ctx });
    if (alvo.erro) return sendEmbed(message.channel,
      embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${PREFIXO}banglobal isentar <@pessoa|id|nome>`));
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
          description: `${rot} is subject to the global list again on this server.`, colour: COR.mod }));
    }

    if (!config.banGlobal.isentos.includes(uid)) config.banGlobal.isentos.push(uid);
    salvarConfig();

    const nossoBan = db.bansGlobaisPorOrigem(serverId, ["banglobal"]).some((b) => b.userId === uid);
    let desbanida = false, erroDesban = null;
    if (nossoBan) {
      const r = await desbanir(server, serverId, uid);
      if (r.ok) { db.removerBanGlobal(uid, serverId); desbanida = true; } else erroDesban = r.erro;
    }
    await log.registrar(ctx, "punicoes", {
      titulo: "🛡️ Isenção da lista global",
      descricao: `<@${message.authorId}> isentou <@${uid}>${desbanida ? " (e desfez o ban aplicado pela lista)" : ""}.`,
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
    }));
  }

  // ── lista: TODO MUNDO que consta na lista global ──
  if (["lista", "list", "banidos", "banned", "todos", "all"].includes(sub)) {
    const soDaqui = ["servidor", "server", "aqui", "here", "daqui"].includes((args[1] ?? "").toLowerCase());
    const linhas0 = db.listarBanidosGlobais({ limite: 500, serverId: soDaqui ? serverId : null });
    if (!linhas0.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🌐 Lista vazia", description: "Ninguém na lista global ainda.", colour: COR.info },
        { title: "🌐 Empty list", description: "Nobody on the global list yet.", colour: COR.info }));
    }
    const isentos = config.banGlobal?.isentos ?? [];
    const linhas = [
      soDaqui
        ? tr(ctx, `**${linhas0.length}** pessoa(s) banida(s) **por este servidor**:`, `**${linhas0.length}** person(s) banned **by this server**:`)
        : tr(ctx, `**${linhas0.length}** pessoa(s) na lista global (todos os servidores):`, `**${linhas0.length}** person(s) on the global list (all servers):`),
      "",
      ...linhas0.map((b) => {
        const marca = isentos.includes(b.userId) ? "🛡️ " : "";
        const quem = rotularUsuario(b.userId, { nome: b.nome, client: ctx.client });
        const motivo = (b.motivo ?? "").slice(0, 60);
        return soDaqui
          ? `${marca}${quem} — ${motivo || tr(ctx, "_sem motivo_", "_no reason_")} _(${data(b.ultimo)})_`
          : `${marca}${quem} — ${b.servidores} ${tr(ctx, "servidor(es)", "server(s)")} _(${data(b.ultimo)})_`;
      }),
      "",
      tr(ctx,
        `🛡️ = isento aqui · \`${PREFIXO}banglobal historico <@pessoa>\` mostra o porquê de cada caso\n\`${PREFIXO}banglobal lista servidor\` — só os banidos por este servidor`,
        `🛡️ = exempt here · \`${PREFIXO}banglobal historico <@user>\` shows the reason for each case\n\`${PREFIXO}banglobal lista servidor\` — only those banned by this server`),
    ];
    const paginas = paginarLinhas(linhas, {
      titulo: soDaqui
        ? tr(ctx, "🌐 Banidos por este servidor", "🌐 Banned by this server")
        : tr(ctx, "🌐 Todos na lista global", "🌐 Everyone on the global list"),
      limite: 1300,
    });
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, comandoPagina: `${PREFIXO}banglobal lista`, colour: COR.mod,
    });
  }

  if (["auto", "automatico", "automático", "automatic", "autoimport",
       "importar", "import", "sincronizar", "sync"].includes(sub)) {
    const registros = db.bansGlobaisDoServidor?.(serverId) ?? null;
    const linhaServidor = registros === null
      ? null
      : (lang === "en"
        ? `**From this server:** ${registros} record(s) already in the list.`
        : `**Deste servidor:** ${registros} registro(s) já na lista.`);

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
        `A única escolha deste servidor é se ele **se aproveita** da lista: \`${PREFIXO}banglobal <off|avisar|banir>\`.`,
        "",
        `_Um registro específico que não se sustente pode sair com \`${PREFIXO}banglobal esquecer <@usuário>\`._`,
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
        `This server's only choice is whether it **benefits** from the list: \`${PREFIXO}banglobal <off|avisar|banir>\`.`,
        "",
        `_A specific record that doesn't hold up can be dropped with \`${PREFIXO}banglobal esquecer <@user>\`._`,
      ].join("\n"),
      colour: COR.mod,
    }));
  }

  // ── &banglobal esquecer <usuário> ──
  if (["esquecer", "forget", "remover", "apagar"].includes(sub)) {
    const entrada = args.slice(1).join(" ");
    const alvo = await alvoDoComando(entrada, { message, server, ctx });
    if (alvo.erro) return sendEmbed(message.channel,
      embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${PREFIXO}banglobal esquecer <@pessoa|id|nome>`));
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
    });
    return sendEmbed(message.channel, tr(ctx, {
      title: n ? "🌐 Removido da lista global" : "🌐 Marcado para ficar de fora",
      description: [
        n
          ? `${nome} saiu da lista: **${n}** registro(s) apagado(s) — em **todos** os servidores.`
          : `${nome} não constava na lista, mas agora está marcado para **não entrar**.`,
        "",
        "**E não volta:** bans futuros em qualquer servidor, e a importação automática a cada 6h, passam a ignorá-lo.",
        `_Desfazer: \`${PREFIXO}banglobal lembrar ${uid}\` · ver todos: \`${PREFIXO}banglobal ignorados\`_`,
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
        `_Undo: \`${PREFIXO}banglobal lembrar ${uid}\` · see them all: \`${PREFIXO}banglobal ignorados\`_`,
      ].join("\n"),
      colour: COR.sucesso,
    }));
  }

  // ── &banglobal ignorados — quem está marcado para ficar fora ──
  if (["ignorados", "ignored", "excecoes", "exceções", "foradalista"].includes(sub)) {
    const linhas = db.listarIgnoradosGlobais().map((i) =>
      `• ${rotularUsuario(i.userId, { nome: i.nome, client: ctx.client })} — ${i.motivo ?? (lang === "en" ? "_no note_" : "_sem nota_")}`
      + (i.porQuem ? ` _(<@${i.porQuem}>)_` : ""));
    if (!linhas.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "📋 Ninguém marcado", description: `Ninguém está marcado para ficar fora da lista global.\n\n\`${PREFIXO}banglobal esquecer <@pessoa>\` tira alguém e o mantém fora.`, colour: COR.info },
        { title: "📋 Nobody marked", description: `Nobody is marked to stay off the global list.\n\n\`${PREFIXO}banglobal esquecer <@user>\` removes someone and keeps them out.`, colour: COR.info }));
    }
    const paginas = paginarLinhas([
      ...linhas,
      "",
      tr(ctx,
        `Bans nestes **nunca** entram na lista. Desfazer: \`${PREFIXO}banglobal lembrar <@pessoa>\``,
        `Bans on these **never** enter the list. Undo: \`${PREFIXO}banglobal lembrar <@user>\``),
    ], {
      titulo: tr(ctx, `📋 Fora da lista global — ${linhas.length}`, `📋 Kept off the global list — ${linhas.length}`),
    });
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, comandoPagina: `${PREFIXO}banglobal ignorados`, colour: COR.info,
    });
  }

  // ── &banglobal lembrar — desfaz o esquecer ──
  if (["lembrar", "remember", "desesquecer", "unforget", "reincluir"].includes(sub)) {
    const entrada = args.slice(1).join(" ");
    const alvo = await alvoDoComando(entrada, { message, server, ctx });
    if (alvo.erro) return sendEmbed(message.channel,
      embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${PREFIXO}banglobal lembrar <@pessoa|id|nome>`));
    const n = db.deixarDeIgnorarGlobal(alvo.id);
    const nome = rotularUsuario(alvo.id, { nome: alvo.nome, client: ctx.client });
    if (n) {
      await log.registrar(ctx, "punicoes", {
        titulo: "🌐 Marca de exceção removida",
        descricao: `<@${message.authorId}> permitiu que ${alvo.nome ?? alvo.id} volte a entrar na lista global.`,
      });
    }
    return sendEmbed(message.channel, tr(ctx, {
      title: n ? "🌐 Pode voltar para a lista" : "🤷 Não estava marcado",
      description: n
        ? `${nome} volta a entrar na lista global quando for banido de novo.\n\n_Os registros antigos continuam apagados — isto só reabre a porta._`
        : `${nome} não estava marcado para ficar fora. \`${PREFIXO}banglobal ignorados\` lista quem está.`,
      colour: n ? COR.sucesso : COR.info,
    }, {
      title: n ? "🌐 Can rejoin the list" : "🤷 Wasn't marked",
      description: n
        ? `${nome} will enter the global list again on their next ban.\n\n_The old records stay deleted — this only reopens the door._`
        : `${nome} wasn't marked to stay out. \`${PREFIXO}banglobal ignorados\` shows who is.`,
      colour: n ? COR.sucesso : COR.info,
    }));
  }

  if (["bots", "limparbots", "podar"].includes(sub)) {
    const arg1 = (args[1] ?? "").toLowerCase();
    const confirmou = ["confirmar", "confirm", "sim", "yes"].includes(arg1);

    if (args[1] && !confirmou) {
      const entrada = args.slice(1).join(" ");
      const alvo = await alvoDoComando(entrada, { message, server, ctx });
      if (alvo.erro) return sendEmbed(message.channel,
        embedAlvoNaoResolvido(ctx, alvo.erro, entrada, `${PREFIXO}banglobal bots <@pessoa|id>`));
      const v = await confirmarSeEhBot(alvo.id, { client: ctx.client });
      const disc = await idsDoDiscover();
      return sendEmbed(message.channel, {
        title: v.ehBot ? (lang === "en" ? "🤖 It's a bot" : "🤖 É um bot") : (lang === "en" ? "🙋 I couldn't prove it's a bot" : "🙋 Não consegui provar que é bot"),
        description: [
          `${rotularUsuario(alvo.id, { nome: alvo.nome, client: ctx.client })} — \`${alvo.id}\``,
          "",
          v.ehBot
            ? tr(ctx, `Descoberto por: **${v.via}**`, `Found via: **${v.via}**`)
            : tr(ctx,
                "Nenhum dos sinais respondeu sim: a vitrine `/bots/{id}/invite` (só responde por bots **públicos**), o cliente e a API (`/users/{id}` só responde sobre quem divide servidor comigo) e o discover.",
                "None of the signals said yes: the `/bots/{id}/invite` showcase (only answers for **public** bots), the client and the API (`/users/{id}` only answers about users I share a server with), and discover."),
          "",
          `**Discover:** ${disc.erro ? `🔴 ${disc.erro}` : `🟢 ${disc.ids.size} ${tr(ctx, "id(s) lidos", "id(s) read")}`} _(${DISCOVER_URL})_`,
          "",
          v.ehBot
            ? `\`${PREFIXO}banglobal bots confirmar\` ${tr(ctx, "tira todos os bots da lista", "removes every bot from the list")}`
            : `${tr(ctx, "Sabendo que é bot, tire-o à mão:", "If you know it's a bot, remove it by hand:")} \`${PREFIXO}banglobal esquecer ${alvo.id} é um bot\``,
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
          `**Discover:** ${disc.erro ? `🔴 ${disc.erro}` : `🟢 ${disc.ids.size} id(s) lidos`} _(${DISCOVER_URL})_`,
          "",
          `Se você está **vendo** um bot na lista, \`${PREFIXO}banglobal bots <@ele>\` diz qual sinal falhou.`,
        ].join("\n"), colour: COR.sucesso,
      }, {
        title: "✅ No bots on the list",
        description: [
          `I checked **${ids.length}** record(s) through four routes and none flagged a bot.`,
          "",
          `**Discover:** ${disc.erro ? `🔴 ${disc.erro}` : `🟢 ${disc.ids.size} id(s) read`} _(${DISCOVER_URL})_`,
          "",
          `If you can **see** a bot on the list, \`${PREFIXO}banglobal bots <@it>\` says which signal failed.`,
        ].join("\n"), colour: COR.sucesso,
      }));
    }
    const lista = achados.slice(0, 20).map((a) => `• **${a.nome}** — \`${a.id}\``).join("\n");
    if (!confirmou) {
      return sendEmbed(message.channel, tr(ctx, {
        title: `🤖 ${achados.length} bot(s) na lista global`,
        description: [lista, achados.length > 20 ? `\n_… e mais ${achados.length - 20}._` : "", "",
          "Bots não escolhem entrar em servidor nenhum — alguém os adiciona. Manter isso na lista faria o modo `banir` derrubar integrações que o dono acabou de instalar.",
          "", `_Descobertos por: ${[...porVia].map(([v, n]) => `${v} (${n})`).join(" · ")}_`,
          "", `Remover todos: \`${PREFIXO}banglobal bots confirmar\``].filter(Boolean).join("\n").slice(0, 1900),
        colour: COR.aviso,
      }, {
        title: `🤖 ${achados.length} bot(s) on the global list`,
        description: [lista, achados.length > 20 ? `\n_… and ${achados.length - 20} more._` : "", "",
          "Bots don't choose to join anywhere — someone adds them. Keeping them listed would make `banir` mode knock out integrations the owner just installed.",
          "", `_Found via: ${[...porVia].map(([v, n]) => `${v} (${n})`).join(" · ")}_`,
          "", `Remove them all: \`${PREFIXO}banglobal bots confirmar\``].filter(Boolean).join("\n").slice(0, 1900),
        colour: COR.aviso,
      }));
    }
    const n = db.removerBotsDaLista(achados);
    await log.registrar(ctx, "punicoes", {
      titulo: "🤖 Bots removidos da lista global",
      descricao: `<@${message.authorId}> removeu **${achados.length}** bot(s) (**${n}** registro(s)).`,
    });
    return sendEmbed(message.channel, tr(ctx,
      { title: `🤖 ${achados.length} bot(s) removido(s)`,
        description: `**${n}** registro(s) apagado(s), e estes ficam **marcados**: um ban futuro num deles não os traz de volta.\n\n_\`${PREFIXO}banglobal ignorados\` mostra a lista._`, colour: COR.sucesso },
      { title: `🤖 ${achados.length} bot(s) removed`,
        description: `**${n}** record(s) deleted, and these are now **marked**: a future ban on one of them won't bring it back.\n\n_\`${PREFIXO}banglobal ignorados\` shows the list._`, colour: COR.sucesso }));
  }

  return sendEmbed(message.channel, tr(ctx, {
    title: "❌ Subcomando desconhecido",
    description: `Use \`${PREFIXO}banglobal\` para ver as opções.`,
    colour: COR.erro,
  }, {
    title: "❌ Unknown subcommand",
    description: `Use \`${PREFIXO}banglobal\` to see the options.`,
    colour: COR.erro,
  }));
}
