// ══════════════════════════════════════════════════════════
//  rss.js — curadoria de notícias por RSS + resumo com LLM local
//
//  &rss                       → status (feeds, canal, próximo ciclo)
//  &rss add <url>             → adiciona um feed RSS
//  &rss remove <id|url>       → remove um feed
//  &rss list                  → lista os feeds cadastrados
//  &rss canal [aqui|<id>|off] → define o canal onde os resumos são postados
//  &rss agora                 → força um ciclo imediato (teste)
//
//  A cada hora, o bot busca os itens NOVOS de cada feed. Se a IA estiver
//  ligada, a Judy escreve um resumo geral (no tom dela) e depois lista os itens.
//
//  Restrições:
//   • só funciona no servidor permitido (mesma allowlist do &chat)
//   • teto de itens por ciclo: RSS_MAX_ITENS (padrão 50)
//   • exige ManagePermissions para configurar
// ══════════════════════════════════════════════════════════

import * as db from "../core/db.js";
import * as log from "../core/log.js";

// Resumo por IA (injetado pelo main, usando o pipeline do chat). Se não for
// configurado, o RSS posta os itens sem resumo (comportamento antigo).
let resumirIA = null;
export function configurarResumo(fn) { resumirIA = fn; }

// Allowlist de servidores para o RSS (mesma lógica do antigo import do chat).
const RSS_SERVIDORES = (process.env.RSS_SERVIDORES || process.env.CHAT_SERVIDORES || "")
  .split(",").map((x) => x.trim()).filter(Boolean);
function servidorPermitido(serverId) {
  if (!RSS_SERVIDORES.length) return true;   // sem allowlist = liberado
  return RSS_SERVIDORES.includes(serverId);
}

const MAX_ITENS   = Number(process.env.RSS_MAX_ITENS || 50);
const INTERVALO_MS = Number(process.env.RSS_INTERVALO_MS || 3600_000);  // 1 hora
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// O canal de destino por servidor fica na config (rss.canalId).
function getCanalId(config) { return config?.rss?.canalId ?? null; }

// ── Parser de RSS ──────────────────────────────────────────
// Usa rss-parser se estiver instalado; senão, cai num parser mínimo de regex.
// Exportado para permitir testes injetarem um parser controlado.
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
          novos.push({ feedTitulo: tituloFeed, ...item });
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

// ── Executa um ciclo de curadoria para um servidor ─────────
// (Sem IA: apenas posta os itens novos no canal configurado.)
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
      await canal.sendMessage({ embeds: [{ title: "📰 RSS",
        description: "Nenhuma notícia nova desde o último ciclo.", colour: "#5865F2" }] });
    }
    return { ok: true, quantidade: 0 };
  }

  // teto de itens por ciclo (evita um lote gigante de uma vez)
  let cortados = 0;
  if (novos.length > MAX_ITENS) { cortados = novos.length - MAX_ITENS; novos = novos.slice(0, MAX_ITENS); }

  const agora = new Date().toLocaleString("pt-BR", { timeZone: process.env.TZ || "UTC" });

  // ── Resumo geral com IA (tom da Judy), se configurado ──
  if (resumirIA) {
    try {
      const material = novos.map((it, i) =>
        `${i + 1}. [${it.feedTitulo}] ${it.titulo}${it.resumo ? ` — ${it.resumo.slice(0, 200)}` : ""}`
      ).join("\n");
      const resumo = await resumirIA(material, novos.length);
      if (resumo && resumo.trim()) {
        await canal.sendMessage({ embeds: [{
          title: `📰 O resumo da Judy — ${agora}`,
          description: resumo.trim().slice(0, 1900),
          colour: "#a78bfa",
        }] });
      }
    } catch (e) {
      console.error("[RSS] resumo IA falhou:", e.message);   // segue postando os itens
    }
  }

  // Posta cada notícia como um item (título, feed, horário, link).
  // Agrupa em blocos para não exceder o limite do embed.
  const linhas = novos.map((it) => {
    const quando = it.data ? new Date(it.data).toLocaleString("pt-BR", { timeZone: process.env.TZ || "UTC" }) : "—";
    return `**${it.titulo}**\n${it.feedTitulo} · ${quando}${it.link ? `\n${it.link}` : ""}`;
  });

  // fragmenta em mensagens de até ~3500 chars
  const blocos = [];
  let atual = "";
  for (const l of linhas) {
    if ((atual + "\n\n" + l).length > 3500 && atual) { blocos.push(atual); atual = ""; }
    atual = atual ? atual + "\n\n" + l : l;
  }
  if (atual) blocos.push(atual);

  for (let i = 0; i < blocos.length; i++) {
    const titulo = blocos.length > 1 ? `📰 Notícias (${i + 1}/${blocos.length}) — ${agora}` : `📰 Notícias — ${agora}`;
    const rodape = (i === blocos.length - 1 && cortados) ? `\n\n_(+${cortados} além do limite deste ciclo)_` : "";
    await canal.sendMessage({ embeds: [{ title: titulo, description: blocos[i] + rodape, colour: "#5865F2" }] });
  }

  try {
    await log.registrar({ ...ctx, serverId, config }, "mensagens", {
      titulo: "📰 RSS publicado",
      descricao: `${novos.length} notícia(s) postada(s) em <#${canalId}>.`,
    });
  } catch {}

  return { ok: true, quantidade: novos.length };
}

// ── Agendador: dispara o ciclo a cada hora ─────────────────
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

// ──────────────────────────────────────────────────────────
//  Comando &rss
// ──────────────────────────────────────────────────────────
export async function cmdRss(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId, config, salvarConfig } = ctx;

  if (!servidorPermitido(serverId)) {
    return sendEmbed(message.channel, { title: "🚫 Indisponível aqui",
      description: "A curadoria RSS não está habilitada neste servidor.", colour: COR.aviso });
  }

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManagePermissions** para configurar a curadoria RSS.", colour: COR.erro });
  }

  const sub = args[0]?.toLowerCase();

  // ── add ──
  if (sub === "add" || sub === "adicionar") {
    const url = args[1];
    if (!url || !/^https?:\/\//i.test(url))
      return sendEmbed(message.channel, { title: "❌ URL inválida",
        description: `\`${PREFIXO}rss add <url>\` — a URL precisa começar com http(s).`, colour: COR.erro });
    // valida buscando o feed uma vez
    let titulo = null;
    try { titulo = (await parseFeed(url)).titulo; }
    catch (err) {
      return sendEmbed(message.channel, { title: "❌ Feed inacessível",
        description: `Não consegui ler esse RSS.\n**Erro:** ${err.message}`, colour: COR.erro });
    }
    const novo = db.addFeed(serverId, url, titulo);
    // já marca os itens atuais como vistos (só resume o que vier DEPOIS)
    if (novo) {
      const feeds = db.listarFeeds(serverId);
      const f = feeds.find((x) => x.url === url);
      try { for (const it of (await parseFeed(url)).itens) if (it.guid) db.marcarVisto(f.id, it.guid); } catch {}
    }
    return sendEmbed(message.channel, {
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
      return sendEmbed(message.channel, { title: "❌ Uso incorreto",
        description: `\`${PREFIXO}rss remove <id|url>\` (veja os IDs em \`${PREFIXO}rss list\`)`, colour: COR.erro });
    const n = db.removeFeed(serverId, alvo);
    return sendEmbed(message.channel, { title: n ? "🗑 Feed removido" : "❓ Não encontrado",
      description: n ? `Removido(s) ${n} feed(s).` : "Nenhum feed com esse id/url.", colour: n ? COR.sucesso : COR.aviso });
  }

  // ── list ──
  if (sub === "list" || sub === "lista") {
    const feeds = db.listarFeeds(serverId);
    if (!feeds.length)
      return sendEmbed(message.channel, { title: "📰 Feeds RSS",
        description: `Nenhum feed. Adicione com \`${PREFIXO}rss add <url>\`.`, colour: COR.mod });
    return sendEmbed(message.channel, { title: "📰 Feeds RSS",
      description: feeds.map((f) => `**${f.id}.** ${f.titulo || f.url}\n${f.url}`).join("\n\n"), colour: COR.mod });
  }

  // ── canal ──
  if (sub === "canal" || sub === "channel") {
    config.rss ??= {};
    const arg = (args[1] || "").toLowerCase();
    if (arg === "off" || arg === "desativar") {
      config.rss.canalId = null; salvarConfig();
      return sendEmbed(message.channel, { title: "📰 Canal desativado",
        description: "A curadoria não será mais postada até você definir um canal.", colour: COR.mod });
    }
    let canalId = null;
    if (!arg || arg === "aqui" || arg === "here") canalId = message.channelId;
    else if (ULID.test(args[1].replace(/[<#>]/g, ""))) canalId = args[1].replace(/[<#>]/g, "");
    else return sendEmbed(message.channel, { title: "❌ Uso incorreto",
      description: `\`${PREFIXO}rss canal aqui\` · \`${PREFIXO}rss canal <id>\` · \`${PREFIXO}rss canal off\``, colour: COR.erro });
    config.rss.canalId = canalId; salvarConfig();
    return sendEmbed(message.channel, { title: "📰 Canal definido",
      description: `Os resumos serão postados em <#${canalId}>.`, colour: COR.sucesso });
  }

  // ── agora (forçar ciclo) ──
  if (sub === "agora" || sub === "now" || sub === "testar") {
    if (!getCanalId(config))
      return sendEmbed(message.channel, { title: "❌ Sem canal",
        description: `Defina primeiro com \`${PREFIXO}rss canal aqui\`.`, colour: COR.erro });
    await sendEmbed(message.channel, { title: "⏳ Rodando curadoria…",
      description: "Buscando e resumindo as novidades. Pode levar um tempo.", colour: COR.info });
    const r = await rodarCiclo(serverId, ctx, { forcado: true });
    if (!r.ok)
      return sendEmbed(message.channel, { title: "❌ Falhou", description: r.motivo, colour: COR.erro });
    return; // o próprio ciclo já postou
  }

  // ── status (padrão) ──
  const feeds = db.listarFeeds(serverId);
  const canalId = getCanalId(config);
  return sendEmbed(message.channel, {
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
