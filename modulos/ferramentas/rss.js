
import { buscarSeguro } from "../core/seguranca.js";
import * as db from "../core/db.js";
import { ULID } from "../core/ids.js";
import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";

let resumirIA = null;
export function configurarResumo(fn) { resumirIA = fn; }
// Relatório por categoria (neutro, uma linha por item) + comentário da Judy no fim.
let relatorioIA = null;
export function configurarRelatorio(fns) { relatorioIA = fns; }

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
    // o endereço vem da staff: só internet pública (um feed em 127.0.0.1 ou na
    // rede interna fazia o bot sondar os próprios serviços)
    const r = await buscarSeguro(url, { signal: ctrl.signal, headers: { "User-Agent": "JudyRSS/1.0" } });
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
          novos.push({ feedTitulo: tituloFeed, categoria: categoriaDoItem(item, f.categoria), ...item });
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

  if (relatorioIA) {
    try { await publicarRelatorio(canal, novos, { lang: cicloEn ? "en" : "pt", agora, serverId }); }
    catch (e) { console.error("[RSS] relatório falhou:", e.message); }
  } else if (resumirIA) {
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
        // Item sem texto de verdade é marcado como tal: sem isso o modelo
        // preenchia a lacuna (o "Comments" do Hacker News virou "os comentários
        // confirmaram que…" num resumo de 27/09).
        const material = itens.map((it, i) => {
          const texto = textoDoItem(it.resumo, it.titulo);
          return `${i + 1}. [${it.feedTitulo}] ${it.titulo}${texto ? ` — ${texto.slice(0, 250)}` : " — (só o título; não há texto da notícia)"}`;
        }).join("\n");
        const resumo = await resumirIA(material, itens.length, { categoria: cat === "Geral" ? null : cat, lang: cicloEn ? "en" : "pt", serverId: serverId ?? null });
        if (resumo && resumo.trim()) {
          const rotulo = cat === "Geral" ? "" : ` · ${cat}`;
          await canal.sendMessage({ embeds: [{
            title: cicloEn ? `📰 Judy's digest${rotulo} — ${agora}` : `📰 O resumo da Judy${rotulo} — ${agora}`,
            description: fecharResumo(resumo, itens),
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

// ─── Precisão do resumo ─────────────────────────────────────────────────────

// O que não é texto de notícia: o "Comments" do Hacker News, as linhas de
// metadados do hnrss ("Article URL:", "Points:", "# Comments:") e a descrição
// que só repete o título.
export function textoDoItem(resumo, titulo = "") {
  let t = String(resumo ?? "")
    .replace(/\b(Article URL|Comments URL|Points|# Comments)\s*:\s*\S*/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ").trim();
  if (/^(comments?|coment[áa]rios?|read more|leia mais|continue reading|\[?…\]?)$/i.test(t)) t = "";
  const norm = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (t && norm(t) === norm(titulo)) t = "";
  return t.length < 20 ? "" : t;
}

// Número que não está em nenhuma notícia é invenção: a frase sai inteira.
// (Números por extenso — "três" — não são checados; os dígitos, sim.)
function numerosDe(txt) {
  return (String(txt).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
}
export function tirarNumerosInventados(resumo, itens) {
  const fonte = new Set(itens.flatMap((it) => numerosDe(`${it.titulo} ${it.resumo ?? ""} ${it.feedTitulo ?? ""}`)));
  return String(resumo).split(/(?<=[.!?…])\s+/).filter((frase) => {
    const nums = numerosDe(frase);
    return nums.every((n) => fonte.has(n) || n.length <= 1);
  }).join(" ");
}

// Corta na última frase COMPLETA que cabe — nunca no meio da palavra
// (o resumo das 21:55 de 27/09 terminou em "A m").
export function cortarEmFrase(txt, max = 1900) {
  const s = String(txt).trim();
  if (s.length <= max) return s;
  const pedaco = s.slice(0, max);
  const fim = Math.max(pedaco.lastIndexOf(". "), pedaco.lastIndexOf(".\n"), pedaco.lastIndexOf("! "), pedaco.lastIndexOf("? "));
  return fim > max * 0.5 ? pedaco.slice(0, fim + 1) : `${pedaco.slice(0, pedaco.lastIndexOf(" "))}…`;
}

export function fecharResumo(resumo, itens) {
  // preserva as quebras de parágrafo: filtra número por parágrafo
  const paragrafos = String(resumo).trim().split(/\n\s*\n/).map((p) => tirarNumerosInventados(p, itens)).filter((p) => p.trim());
  return cortarEmFrase(paragrafos.join("\n\n"), 1900);
}

// ─── Relatório por categoria ────────────────────────────────────────────────
//
// O texto corrido com sarcasmo errava do jeito que importa num resumo: CVE
// sumia no meio da lista (3 de 18 em 28/09), "authorization" virou
// "autenticação", "every household receives $10k" virou "a vila recebe dez
// mil dólares". Agora cada categoria é um relatório NEUTRO, uma linha por
// item, e o código confere a cobertura: todo item da entrada aparece uma vez,
// nada inventado entra, e o que o modelo não trouxer volta pelo título. O tom
// da Judy fica num comentário curto no fim, sobre o conjunto.

const RE_CVE = /\bCVE-\d{4}-\d{4,}\b/i;
export function categoriaDoItem(item, categoriaDoFeed = null) {
  if (RE_CVE.test(item?.titulo ?? "")) return "Vulnerabilidades";
  return categoriaDoFeed || null;
}

// "…/coltranes-shadow-tiberi-tapes" → "coltranes shadow tiberi tapes": o link
// costuma dizer do que a notícia é quando o feed só manda o título.
export function pistaDoLink(url) {
  try {
    const u = new URL(url);
    const partes = u.pathname.split("/").filter(Boolean)
      .filter((x) => /[a-z]/i.test(x) && x.includes("-"));
    const ultima = partes.at(-1) ?? "";
    return ultima.replace(/\.[a-z]{2,5}$/i, "").split("-")
      .filter((w) => w && !/^[0-9a-f]{6,}$/i.test(w))   // ids no fim do slug
      .join(" ").slice(0, 120);
  } catch { return ""; }
}

function materialNumerado(itens, numeros = null) {
  return itens.map((it, i) => {
    const n = numeros ? numeros[i] : i + 1;
    const texto = textoDoItem(it.resumo, it.titulo);
    const pista = pistaDoLink(it.link);
    return `${n}. ${it.titulo}${texto ? ` — ${texto.slice(0, 250)}` : ""}${pista ? ` (endereço: ${pista})` : ""}`;
  }).join("\n");
}

// Resposta do modelo: "N | frase" — tolerante ao que o modelo costuma variar
// ("**1** | …", "[1] …", "1) …", "Notícia 1: …").
export function lerLinhasNumeradas(resposta) {
  const porN = new Map();
  for (const bruta of String(resposta ?? "").split("\n")) {
    const linha = bruta.replace(/\*\*/g, "").replace(/^\s*[-*•]\s*/, "");
    const m = linha.match(/^\s*(?:not[ií]cia|item|story)?\s*\[?(\d+)\]?\s*[|.)\-–—:]+\s*\|?\s*(.+?)\s*$/i);
    if (m && !porN.has(Number(m[1]))) porN.set(Number(m[1]), m[2]);
  }
  return porN;
}

// Cada item vira UMA linha; o que faltar ou trouxer número que não está
// naquele item volta pelo título original (marcado com doModelo: false).
export function linhasDoResumo(resposta, itens) {
  const porN = lerLinhasNumeradas(resposta);
  return itens.map((it, i) => {
    let frase = porN.get(i + 1) ?? "";
    if (frase) frase = tirarNumerosInventados(frase, [{ ...it, resumo: `${it.resumo ?? ""} ${pistaDoLink(it.link)}` }]).trim();
    return frase ? { texto: frase, doModelo: true } : { texto: it.titulo, doModelo: false };
  });
}
export function montarResumoNoticias(resposta, itens) {
  return linhasDoResumo(resposta, itens).map((l) => `• ${l.texto}`).join("\n");
}

// ─── Idioma ─────────────────────────────────────────────────────────────────
// Quando o modelo falhava num item, o título voltava CRU — "Extraction is Still
// a Major Part of Marathon" e "Miracle on FlyDubai" no resumo em português de
// 01/10. O pareceIngles do chat exige 4 palavras inglesas (feito para
// respostas longas); um título curto precisa de um teste próprio.
export { pareceOutroIdioma } from "../core/idioma.js";
import { pareceOutroIdioma } from "../core/idioma.js";

// Traduz as linhas "• …" de um bloco que não estão em português. O sufixo
// "(CVE-…)" fica de fora da tradução e volta igual. Sem tradutor, ou se a
// tradução falhar, o bloco sai como estava.
export async function portuguesNoBloco(texto, traduzir) {
  if (typeof traduzir !== "function") return texto;
  const linhas = String(texto).split("\n");
  const alvos = [];
  linhas.forEach((l, i) => {
    const m = l.match(/^(\s*•\s*)(.+?)(\s*\(CVE-\d{4}-\d+\))?$/i);
    if (m && pareceOutroIdioma(m[2])) alvos.push({ i, prefixo: m[1], corpo: m[2], sufixo: m[3] ?? "" });
  });
  if (!alvos.length) return texto;
  let porN = new Map();
  try {
    const r = await traduzir(alvos.map((a, k) => `${k + 1} | ${a.corpo}`).join("\n"), alvos.length);
    porN = lerLinhasNumeradas(r);
  } catch (e) { console.error("[RSS] tradução falhou:", e?.message ?? e); }
  for (const [k, a] of alvos.entries()) {
    const tr = (porN.get(k + 1) ?? "").trim();
    if (tr && !pareceOutroIdioma(tr)) linhas[a.i] = `${a.prefixo}${tr}${a.sufixo}`;
  }
  const restam = alvos.filter((a) => pareceOutroIdioma(linhas[a.i])).length;
  if (restam) console.warn(`[RSS] ${restam} linha(s) seguem em outro idioma depois da tradução`);
  return linhas.join("\n");
}

// Resposta do modelo: "CVE-ID | produto | falha". Toda CVE da entrada aparece
// exatamente uma vez; CVE que não estava na entrada é descartada; a esquecida
// volta com o título original, em "Outros".
export function montarRelatorioCVE(resposta, itens) {
  const idDe = (t) => (String(t).match(RE_CVE)?.[0] ?? "").toUpperCase();
  const entrada = new Map(itens.map((it) => [idDe(it.titulo), it]));
  const linhas = new Map();
  for (const l of String(resposta ?? "").split("\n")) {
    const partes = l.split("|").map((x) => x.replace(/^\s*[-*•]\s*/, "").trim());
    if (partes.length < 3) continue;
    const id = idDe(partes[0]);
    if (!entrada.has(id) || linhas.has(id)) continue;          // inventada ou repetida
    linhas.set(id, { produto: partes[1] || "Outros", falha: partes.slice(2).join(" | ") });
  }
  for (const [id, it] of entrada) {
    if (!linhas.has(id)) linhas.set(id, { produto: "Outros", falha: String(it.titulo).replace(RE_CVE, "").replace(/^\s*[-–—]\s*/, "") });
  }
  const grupos = new Map();
  for (const [id, l] of linhas) {
    const chave = l.produto.toLowerCase();
    if (!grupos.has(chave)) grupos.set(chave, { nome: l.produto, itens: [] });
    grupos.get(chave).itens.push(`• ${l.falha} (${id})`);
  }
  const ordem = [...grupos.values()].sort((a, b) => (a.nome === "Outros") - (b.nome === "Outros"));
  return ordem.map((g) => `**${g.nome}**\n${g.itens.join("\n")}`).join("\n\n");
}

// Divide em blocos de até `max` sem cortar linha no meio.
export function blocosDe(texto, max = 1900) {
  const out = [];
  let atual = "";
  for (const linha of String(texto).split("\n")) {
    if ((atual + "\n" + linha).length > max && atual) { out.push(atual); atual = linha; }
    else atual = atual ? `${atual}\n${linha}` : linha;
  }
  if (atual) out.push(atual);
  return out;
}

export async function publicarRelatorio(canal, novos, { lang = "pt", agora = "", serverId = null } = {}) {
  const en = lang === "en";
  const grupos = new Map();
  for (const it of novos) {
    const cat = it.categoria || (en ? "General" : "Geral");
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat).push(it);
  }
  const ordenados = [...grupos.entries()].sort(([a], [b]) =>
    (b === "Vulnerabilidades") - (a === "Vulnerabilidades") || a.localeCompare(b));

  for (const [cat, itens] of ordenados) {
    const cve = cat === "Vulnerabilidades";
    let resposta = "";
    try { resposta = await relatorioIA.linhas(materialNumerado(itens), { modo: cve ? "cve" : "noticias", lang, quantidade: itens.length }); }
    catch (e) { console.error(`[RSS] relatório (${cat}) sem o modelo:`, e.message); }
    let texto;
    if (cve) texto = montarRelatorioCVE(resposta, itens);
    else {
      // Itens sem linha do modelo: uma segunda chance só para eles, com os
      // números originais, antes de cair no título cru.
      let linhas = linhasDoResumo(resposta, itens);
      const faltam = linhas.map((l, i) => (l.doModelo ? -1 : i)).filter((i) => i >= 0);
      if (faltam.length && resposta) {
        try {
          const r2 = await relatorioIA.linhas(materialNumerado(faltam.map((i) => itens[i]), faltam.map((i) => i + 1)),
            { modo: "noticias", lang, quantidade: faltam.length });
          const novas = linhasDoResumo(r2, itens);
          for (const i of faltam) if (novas[i].doModelo) linhas[i] = novas[i];
        } catch (e) { console.error(`[RSS] 2ª tentativa (${cat}) falhou:`, e?.message ?? e); }
      }
      const semModelo = linhas.filter((l) => !l.doModelo).length;
      if (semModelo) console.warn(`[RSS] resumo (${cat}): ${semModelo} de ${itens.length} item(ns) sem frase do modelo — vão pelo título`);
      texto = linhas.map((l) => `• ${l.texto}`).join("\n");
    }
    if (!en) texto = await portuguesNoBloco(texto, relatorioIA.traduzir);
    const titulo = cve
      ? (en ? `📋 Vulnerability report` : `📋 Relatório de vulnerabilidades`)
      : (en ? `📰 Summary · ${cat}` : `📰 Resumo · ${cat}`);
    const blocos = blocosDe(texto);
    for (let i = 0; i < blocos.length; i++) {
      await canal.sendMessage({ embeds: [{
        title: `${titulo}${blocos.length > 1 ? ` (${i + 1}/${blocos.length})` : ""} — ${agora}`,
        description: blocos[i], colour: cve ? "#e5484d" : "#a78bfa",
      }] });
    }
  }

  // O comentário da Judy: no tom dela, sobre o conjunto, e com a mesma trava.
  try {
    const bruto = await relatorioIA.comentario(materialNumerado(novos), { lang, serverId });
    const comentario = cortarEmFrase(tirarNumerosInventados(String(bruto ?? "").trim(),
      novos.map((it) => ({ ...it, resumo: `${it.resumo ?? ""} ${pistaDoLink(it.link)}` }))), 700);
    if (comentario) {
      await canal.sendMessage({ embeds: [{ title: en ? "💬 Judy's take" : "💬 A Judy comenta", description: comentario, colour: "#a78bfa" }] });
    }
  } catch (e) { console.error("[RSS] comentário falhou:", e.message); }
}
