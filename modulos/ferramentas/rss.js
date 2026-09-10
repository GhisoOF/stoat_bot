
import * as db from "../core/db.js";
import { ULID } from "../core/ids.js";
import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";

let resumirIA = null;
export function configurarResumo(fn) { resumirIA = fn; }

const RSS_SERVIDORES = (process.env.RSS_SERVIDORES || "")
  .split(",").map((x) => x.trim()).filter(Boolean);
function servidorPermitido(serverId) {
  if (!RSS_SERVIDORES.length) return true;   // sem allowlist = liberado
  return RSS_SERVIDORES.includes(serverId);
}

const MAX_ITENS   = Number(process.env.RSS_MAX_ITENS || 50);
const INTERVALO_MS = Number(process.env.RSS_INTERVALO_MS || 3600_000);  // 1 hora

// O canal de destino por servidor fica na config (rss.canalId).
function getCanalId(config) { return config?.rss?.canalId ?? null; }

let ParserRSS = null;
export const _interno = { parseFeed: null };   // gancho de teste (opcional)

async function parseFeed(url) {
  if (_interno.parseFeed) return _interno.parseFeed(url);   // usado só em testes
  if (ParserRSS === null) {
    try { ParserRSS = (await import("rss-parser")).default; }
    catch { ParserRSS = false; }   // não instalado → usa fallback
  }
  if (ParserRSS) {
    const parser = new ParserRSS({ timeout: 20000 });
    const feed = await parser.parseURL(url);
    return {
      titulo: feed.title || url,
      itens: (feed.items || []).map((i) => ({
        guid:  i.guid || i.id || i.link || i.title,
        titulo: (i.title || "").trim(),
        link:  i.link || "",
        data:  i.isoDate || i.pubDate || null,
        resumo: (i.contentSnippet || i.content || "").replace(/\s+/g, " ").trim().slice(0, 400),
      })),
    };
  }
  return await parseFeedManual(url);
}

// Fallback sem dependência: regex simples para <item>/<entry>
async function parseFeedManual(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let xml;
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "CobaiaRSS/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    xml = await r.text();
  } finally { clearTimeout(t); }

  const tituloFeed = (xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || url).trim();
  const blocos = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) || [];
  const pega = (b, tag) => {
    const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim() : "";
  };
  const pegaLink = (b) =>
    b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || pega(b, "link");

  const itens = blocos.map((b) => ({
    guid:  pega(b, "guid") || pega(b, "id") || pegaLink(b) || pega(b, "title"),
    titulo: pega(b, "title"),
    link:  pegaLink(b),
    data:  pega(b, "pubDate") || pega(b, "updated") || pega(b, "published") || null,
    resumo: (pega(b, "description") || pega(b, "summary") || pega(b, "content"))
              .replace(/\s+/g, " ").slice(0, 400),
  }));
  return { titulo: tituloFeed, itens };
}

// ── Coleta os itens NOVOS de todos os feeds de um servidor ──
async function coletarNovos(serverId) {
  const feeds = db.listarFeeds(serverId);
  const novos = [];   // { feedTitulo, titulo, link, data, resumo }
  for (const f of feeds) {
    try {
      const feed = await parseFeed(f.url);
      const tituloFeed = f.titulo || feed.titulo || f.url;
      for (const item of feed.itens) {
        if (!item.guid) continue;
        // marcarVisto devolve true se era novo
        if (db.marcarVisto(f.id, item.guid)) {
          novos.push({ feedTitulo: tituloFeed, categoria: f.categoria || null, ...item });
        }
      }
      // se o feed não tinha título salvo, guarda agora
      if (!f.titulo && feed.titulo) {
        try { db.addFeed(serverId, f.url, feed.titulo); } catch {}
      }
    } catch (err) {
      console.error(`[RSS] falha ao ler ${f.url}:`, err.message);
    }
  }
  return novos;
}

export async function rodarCiclo(serverId, ctx, { forcado = false } = {}) {
  if (!servidorPermitido(serverId)) return { ok: false, motivo: "servidor não permitido" };

  const config = ctx.configDoServidor ? ctx.configDoServidor(serverId) : ctx.config;
  const canalId = getCanalId(config);
  if (!canalId) return { ok: false, motivo: "canal não configurado" };

  const canal = ctx.client.channels.get(canalId)
    ?? await ctx.client.channels.fetch(canalId).catch(() => null);
  if (!canal) return { ok: false, motivo: "canal inacessível" };

  let novos = await coletarNovos(serverId);
  if (!novos.length) {
    if (forcado) {
      const rlang = config?.language === "en" ? "en" : "pt";
      await canal.sendMessage({ embeds: [{ title: "📰 RSS",
        description: rlang === "en" ? "No new stories since the last cycle." : "Nenhuma notícia nova desde o último ciclo.", colour: "#5865F2" }] });
    }
    return { ok: true, quantidade: 0 };
  }

  // teto de itens por ciclo (evita um lote gigante de uma vez)
  let cortados = 0;
  if (novos.length > MAX_ITENS) { cortados = novos.length - MAX_ITENS; novos = novos.slice(0, MAX_ITENS); }

  const cicloEn = config?.language === "en";
  const agora = new Date().toLocaleString(cicloEn ? "en-US" : "pt-BR", { timeZone: process.env.TZ || "UTC" });

  if (resumirIA) {
    const grupos = new Map();
    for (const it of novos) {
      const cat = it.categoria || "Geral";
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat).push(it);
    }
    // "Geral" por último: os assuntos nomeados vêm primeiro.
    const ordenados = [...grupos.entries()].sort(([a], [b]) =>
      (a === "Geral") - (b === "Geral") || a.localeCompare(b));
    for (const [cat, itens] of ordenados) {
      try {
        const material = itens.map((it, i) =>
          `${i + 1}. [${it.feedTitulo}] ${it.titulo}${it.resumo ? ` — ${it.resumo.slice(0, 250)}` : ""}`
        ).join("\n");
        const resumo = await resumirIA(material, itens.length, { categoria: cat === "Geral" ? null : cat, lang: cicloEn ? "en" : "pt", serverId: serverId ?? null });
        if (resumo && resumo.trim()) {
          const rotulo = cat === "Geral" ? "" : ` · ${cat}`;
          await canal.sendMessage({ embeds: [{
            title: cicloEn ? `📰 Judy's digest${rotulo} — ${agora}` : `📰 O resumo da Judy${rotulo} — ${agora}`,
            description: resumo.trim().slice(0, 1900),
            colour: "#a78bfa",
          }] });
        }
      } catch (e) {
        console.error(`[RSS] resumo IA (${cat}) falhou:`, e.message);   // segue para os outros blocos
      }
    }
  }

  const linhas = novos.map((it) => {
    const quando = it.data ? new Date(it.data).toLocaleString(cicloEn ? "en-US" : "pt-BR", { timeZone: process.env.TZ || "UTC" }) : "—";
    return `**${it.titulo}**\n${it.feedTitulo} · ${quando}${it.link ? `\n${it.link}` : ""}`;
  });

  // fragmenta em mensagens de até ~1800 chars (o limite de embed do Stoat é ~2000)
  const blocos = [];
  let atual = "";
  for (const l of linhas) {
    if ((atual + "\n\n" + l).length > 1800 && atual) { blocos.push(atual); atual = ""; }
    atual = atual ? atual + "\n\n" + l : l;
  }
  if (atual) blocos.push(atual);

  for (let i = 0; i < blocos.length; i++) {
    const titulo = cicloEn
      ? (blocos.length > 1 ? `📰 News (${i + 1}/${blocos.length}) — ${agora}` : `📰 News — ${agora}`)
      : (blocos.length > 1 ? `📰 Notícias (${i + 1}/${blocos.length}) — ${agora}` : `📰 Notícias — ${agora}`);
    const rodape = (i === blocos.length - 1 && cortados)
      ? (cicloEn ? `\n\n_(+${cortados} beyond this cycle's limit)_` : `\n\n_(+${cortados} além do limite deste ciclo)_`) : "";
    try {
      await canal.sendMessage({ embeds: [{ title: titulo, description: (blocos[i] + rodape).slice(0, 1990), colour: "#5865F2" }] });
    } catch (e) {
      console.error("[RSS] falha ao postar bloco de itens:", e?.message || e);
    }
  }

  try {
    await log.registrar({ ...ctx, serverId, config }, "mensagens", {
      titulo: "📰 RSS publicado",
      descricao: `${novos.length} notícia(s) postada(s) em <#${canalId}>.`,
    });
  } catch {}

  return { ok: true, quantidade: novos.length };
}

let timer = null;
export function iniciarAgendador(ctx) {
  if (timer) return;
  const tick = async () => {
    try {
      // roda para cada servidor permitido que tenha canal configurado
      const feeds = db.todosOsFeeds();
      const servidores = [...new Set(feeds.map((f) => f.serverId))].filter(servidorPermitido);
      for (const sid of servidores) {
        const cfg = ctx.configDoServidor ? ctx.configDoServidor(sid) : null;
        if (getCanalId(cfg)) {
          const r = await rodarCiclo(sid, ctx);
          if (r.ok && r.quantidade) console.log(`[RSS] ciclo em ${sid}: ${r.quantidade} nova(s)`);
        }
      }
      db.limparVistosAntigos(30);
    } catch (err) {
      console.error("[RSS] erro no ciclo:", err.message);
    }
  };
  timer = setInterval(tick, INTERVALO_MS);
  console.log(`[RSS] agendador ligado (a cada ${Math.round(INTERVALO_MS / 60000)} min)`);
}

export async function cmdRss(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId, config, salvarConfig } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";

  if (!servidorPermitido(serverId)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Indisponível aqui", description: "A curadoria RSS não está habilitada neste servidor.", colour: COR.aviso },
      { title: "🚫 Unavailable here", description: "RSS curation isn't enabled on this server.", colour: COR.aviso }));
  }

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para configurar a curadoria RSS.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to configure RSS curation.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();

  // ── add ──
  if (sub === "add" || sub === "adicionar") {
    const url = args[1];
    const categoria = args.slice(2).join(" ").trim() || null;
    if (!url || !/^https?:\/\//i.test(url))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ URL inválida",
          description: `\`${PREFIXO}rss add <url> [categoria]\` — a URL precisa começar com http(s). A categoria agrupa os resumos: \`${PREFIXO}rss add https://... tecnologia\`.`, colour: COR.erro },
        { title: "❌ Invalid URL",
          description: `\`${PREFIXO}rss add <url> [category]\` — the URL must start with http(s). The category groups the digests: \`${PREFIXO}rss add https://... tech\`.`, colour: COR.erro }));
    // valida buscando o feed uma vez
    let titulo = null;
    try { titulo = (await parseFeed(url)).titulo; }
    catch (err) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Feed inacessível",
          description: `Não consegui ler esse RSS.\n**Erro:** ${err.message}`, colour: COR.erro },
        { title: "❌ Unreachable feed",
          description: `I couldn't read that RSS.\n**Error:** ${err.message}`, colour: COR.erro }));
    }
    const novo = db.addFeed(serverId, url, titulo, categoria);
    // já marca os itens atuais como vistos (só resume o que vier DEPOIS)
    if (novo) {
      const feeds = db.listarFeeds(serverId);
      const f = feeds.find((x) => x.url === url);
      try { for (const it of (await parseFeed(url)).itens) if (it.guid) db.marcarVisto(f.id, it.guid); } catch {}
    }
    return sendEmbed(message.channel, en ? {
      title: novo ? "✅ Feed added" : "ℹ️ Already registered",
      description: novo
        ? `**${titulo || url}**\nThe current content was marked as seen; you'll only get the **next** stories.`
        : "That feed was already on the list.",
      colour: novo ? COR.sucesso : COR.mod,
    } : {
      title: novo ? "✅ Feed adicionado" : "ℹ️ Já cadastrado",
      description: novo
        ? `**${titulo || url}**\nO conteúdo atual foi marcado como visto; você receberá só as **próximas** notícias.`
        : "Esse feed já estava na lista.",
      colour: novo ? COR.sucesso : COR.mod });
  }

  // ── remove ──
  if (sub === "remove" || sub === "remover" || sub === "rm") {
    const alvo = args[1];
    if (!alvo)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto",
          description: `\`${PREFIXO}rss remove <id|url>\` (veja os IDs em \`${PREFIXO}rss list\`)`, colour: COR.erro },
        { title: "❌ Wrong usage",
          description: `\`${PREFIXO}rss remove <id|url>\` (see the IDs with \`${PREFIXO}rss list\`)`, colour: COR.erro }));
    const n = db.removeFeed(serverId, alvo);
    return sendEmbed(message.channel, en ? {
      title: n ? "🗑 Feed removed" : "❓ Not found",
      description: n ? `Removed ${n} feed(s).` : "No feed with that id/url.", colour: n ? COR.sucesso : COR.aviso,
    } : {
      title: n ? "🗑 Feed removido" : "❓ Não encontrado",
      description: n ? `Removido(s) ${n} feed(s).` : "Nenhum feed com esse id/url.", colour: n ? COR.sucesso : COR.aviso });
  }

  // ── list ──
  if (sub === "list" || sub === "lista") {
    const feeds = db.listarFeeds(serverId);
    if (!feeds.length)
      return sendEmbed(message.channel, tr(ctx,
        { title: "📰 Feeds RSS", description: `Nenhum feed. Adicione com \`${PREFIXO}rss add <url>\`.`, colour: COR.mod },
        { title: "📰 RSS feeds", description: `No feeds. Add one with \`${PREFIXO}rss add <url>\`.`, colour: COR.mod }));
    return sendEmbed(message.channel, { title: en ? "📰 RSS feeds" : "📰 Feeds RSS",
      description: feeds.map((f) => `**${f.id}.** ${f.titulo || f.url}${f.categoria ? ` · 🏷️ ${f.categoria}` : ""}\n${f.url}`).join("\n\n"), colour: COR.mod });
  }

  // ── canal ──
  if (sub === "categoria" || sub === "category") {
    const alvo = args[1];
    const nome = args.slice(2).join(" ").trim();
    if (!alvo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🏷️ Categoria de feed",
          description: `\`${PREFIXO}rss categoria <id|url> <nome>\` — os resumos saem agrupados por categoria, um bloco por assunto.\n\`${PREFIXO}rss categoria <id|url> off\` tira a categoria (o feed volta para "Geral").\n\n\`${PREFIXO}rss list\` mostra os ids.`, colour: COR.info },
        { title: "🏷️ Feed category",
          description: `\`${PREFIXO}rss categoria <id|url> <name>\` — digests come out grouped by category, one block per topic.\n\`${PREFIXO}rss categoria <id|url> off\` clears it (the feed goes back to "Geral").\n\n\`${PREFIXO}rss list\` shows the ids.`, colour: COR.info }));
    }
    const valor = /^(off|nenhuma|none)$/i.test(nome) ? null : (nome || null);
    const n = db.setCategoriaFeed(serverId, alvo, valor);
    return sendEmbed(message.channel, tr(ctx, {
      title: n ? "🏷️ Categoria atualizada" : "❌ Feed não encontrado",
      description: n
        ? (valor ? `O feed agora resume no bloco **${valor}**.` : `O feed voltou para o bloco **Geral**.`)
        : `Não achei o feed \`${alvo}\` — \`${PREFIXO}rss list\` mostra os ids.`,
      colour: n ? COR.sucesso : COR.erro,
    }, {
      title: n ? "🏷️ Category updated" : "❌ Feed not found",
      description: n
        ? (valor ? `The feed now digests under **${valor}**.` : `The feed is back under **Geral**.`)
        : `I couldn't find feed \`${alvo}\` — \`${PREFIXO}rss list\` shows the ids.`,
      colour: n ? COR.sucesso : COR.erro,
    }));
  }

  if (sub === "canal" || sub === "channel") {
    config.rss ??= {};
    const arg = (args[1] || "").toLowerCase();
    if (arg === "off" || arg === "desativar") {
      config.rss.canalId = null; salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: "📰 Canal desativado",
          description: "A curadoria não será mais postada até você definir um canal.", colour: COR.mod },
        { title: "📰 Channel disabled",
          description: "The curation won't be posted until you set a channel again.", colour: COR.mod }));
    }
    let canalId = null;
    if (!arg || arg === "aqui" || arg === "here") canalId = message.channelId;
    else if (ULID.test(args[1].replace(/[<#>]/g, ""))) canalId = args[1].replace(/[<#>]/g, "");
    else return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}rss canal aqui\` · \`${PREFIXO}rss canal <id>\` · \`${PREFIXO}rss canal off\``, colour: COR.erro },
      { title: "❌ Wrong usage",
        description: `\`${PREFIXO}rss canal aqui\` · \`${PREFIXO}rss canal <id>\` · \`${PREFIXO}rss canal off\``, colour: COR.erro }));
    config.rss.canalId = canalId; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "📰 Canal definido", description: `Os resumos serão postados em <#${canalId}>.`, colour: COR.sucesso },
      { title: "📰 Channel set", description: `The digests will be posted in <#${canalId}>.`, colour: COR.sucesso }));
  }

  // ── agora (forçar ciclo) ──
  if (sub === "agora" || sub === "now" || sub === "testar") {
    if (!getCanalId(config))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Sem canal", description: `Defina primeiro com \`${PREFIXO}rss canal aqui\`.`, colour: COR.erro },
        { title: "❌ No channel", description: `Set one first with \`${PREFIXO}rss canal aqui\`.`, colour: COR.erro }));
    await sendEmbed(message.channel, tr(ctx,
      { title: "⏳ Rodando curadoria…",
        description: "Buscando e resumindo as novidades. Pode levar um tempo.", colour: COR.info },
      { title: "⏳ Running the curation…",
        description: "Fetching and summarizing the news. This may take a while.", colour: COR.info }));
    try {
      const r = await rodarCiclo(serverId, ctx, { forcado: true });
      if (!r.ok)
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falhou", description: r.motivo, colour: COR.erro },
          { title: "❌ Failed", description: r.motivo, colour: COR.erro }));
    } catch (err) {
      console.error("[RSS] erro no ciclo forçado:", err);
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Erro na curadoria",
          description: `O resumo pode ter sido postado, mas algo falhou depois.\n**Erro:** ${err.message}`, colour: COR.erro },
        { title: "❌ Error in the curation",
          description: `The digest may have been posted, but something failed afterwards.\n**Error:** ${err.message}`, colour: COR.erro }));
    }
    return; // o próprio ciclo já postou
  }

  // ── status (padrão) ──
  const feeds = db.listarFeeds(serverId);
  const canalId = getCanalId(config);
  return sendEmbed(message.channel, en ? {
    title: "📰 RSS curation",
    description: [
      `**Feeds:** ${feeds.length}`,
      `**Channel:** ${canalId ? `<#${canalId}>` : "_(not set)_"}`,
      `**Cycle:** every ${Math.round(INTERVALO_MS / 60000)} min · cap ${MAX_ITENS} items`,
      "",
      "**Commands**",
      `\`${PREFIXO}rss add <url>\` · \`${PREFIXO}rss remove <id>\` · \`${PREFIXO}rss list\``,
      `\`${PREFIXO}rss canal <aqui|id|off>\` · \`${PREFIXO}rss agora\``,
    ].join("\n"),
    colour: COR.mod,
  } : {
    title: "📰 Curadoria RSS",
    description: [
      `**Feeds:** ${feeds.length}`,
      `**Canal:** ${canalId ? `<#${canalId}>` : "_(não definido)_"}`,
      `**Ciclo:** a cada ${Math.round(INTERVALO_MS / 60000)} min · teto ${MAX_ITENS} itens`,
      "",
      "**Comandos**",
      `\`${PREFIXO}rss add <url>\` · \`${PREFIXO}rss remove <id>\` · \`${PREFIXO}rss list\``,
      `\`${PREFIXO}rss canal <aqui|id|off>\` · \`${PREFIXO}rss agora\``,
    ].join("\n"),
    colour: COR.mod,
  });
}
