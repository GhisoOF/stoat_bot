import ParserRSS from "rss-parser";   // dependência: sem ele, o boot para (antes caía num leitor por regex)
import { buscarSeguro, lerTexto, erroEmIngles, erroEmEspanhol, textoDeFora } from "../core/seguranca.js";
import { citar, citarInterno } from "../core/aliases.js";
import * as db from "../core/db.js";
import { canalDeOutroServidor, canalDesteServidor } from "../moderacao/pertence.js";
import { registrarErro } from "../core/erros.js";
import * as log from "../core/log.js";
import { tr, lingua, textoDoIdioma, idiomaDaTela } from "../core/i18n.js";
import { servidorNaLista, numero } from "../core/env.js";
import { servidorDaCasa } from "../core/casa.js";

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

// O resumo da Judy no RSS: só onde a IA de conversa roda (SERVIDOR/CHAT_SERVIDORES) E o
// servidor quer a IA (`&chat on`; sem escolha, só os da casa — ou todos com CHAT_PADRAO=on).
// Nos outros, a lista de notícias sai do mesmo jeito, sem modelo. (21 out 2026)
export function iaNoRssAqui(serverId, config) {
  if (!servidorNaLista("CHAT_SERVIDORES", serverId)) return false;
  if (typeof config?.ia?.chat === "boolean") return config.ia.chat;
  return ["on", "1", "sim", "true", "ligado"].includes((process.env.CHAT_PADRAO ?? "").trim().toLowerCase()) || servidorDaCasa(serverId);
}

const MAX_ITENS   = numero("RSS_MAX_ITENS", 50, { min: 1, max: 500, inteiro: true });
const MAX_FEEDS_SERVIDOR = numero("RSS_MAX_FEEDS", 25, { min: 1, inteiro: true });
const INTERVALO_MS = numero("RSS_INTERVALO_MS", 3600_000, { min: 60_000, inteiro: true });  // 1 hora
// (31 out 2026, R11) o `&rss agora` baixa todos os feeds do servidor: no máximo
// um a cada RSS_AGORA_MIN_MS por servidor
const AGORA_MIN_MS = numero("RSS_AGORA_MIN_MS", 5 * 60_000, { min: 0, inteiro: true });

// O canal de destino por servidor fica na config (rss.canalId).
function getCanalId(config) { return config?.rss?.canalId ?? null; }

export const _interno = { parseFeed: null };   // gancho de teste (opcional)

// Título, resumo e link vêm de FORA (31 out 2026): passam aqui, uma vez, pelo
// textoDeFora (sem ping em massa, sem link mascarado) e o link só se for http(s).
const linkHttp = (u) => { try { const x = new URL(String(u ?? "")); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
export function limparFeed(feed, url) {
  return {
    titulo: textoDeFora(feed?.titulo || url, { max: 200 }),
    itens: (feed?.itens ?? []).map((i) => ({
      ...i,
      titulo: textoDeFora(String(i.titulo ?? "").trim(), { max: 300 }),
      resumo: textoDeFora(String(i.resumo ?? "").replace(/\s+/g, " ").trim(), { max: 400 }),
      link: linkHttp(i.link),
    })),
  };
}

async function parseFeed(url) {
  if (_interno.parseFeed) return limparFeed(await _interno.parseFeed(url), url);   // usado só em testes
  // O rss-parser buscava a URL SOZINHO (parseURL), por fora da trava
  // anti-SSRF — qualquer staff de qualquer servidor fazia o bot sondar a
  // rede interna. Agora a busca é nossa (IP conferido, teto de tamanho) e o
  // rss-parser só interpreta o texto (12 out 2026).
  const feed = await new ParserRSS().parseString(await baixarFeed(url));
  return limparFeed({
    titulo: feed.title || url,
    itens: (feed.items || []).map((i) => ({
      guid:  i.guid || i.id || i.link || i.title,
      titulo: i.title || "",
      link:  i.link || "",
      data:  i.isoDate || i.pubDate || null,
      resumo: i.contentSnippet || i.content || "",
    })),
  }, url);
}

// O endereço vem da staff: só internet pública (um feed em 127.0.0.1 ou na
// rede interna fazia o bot sondar os próprios serviços), com teto de tamanho.
const MAX_FEED = numero("RSS_MAX_BYTES", 3 * 1024 * 1024, { min: 1024, inteiro: true });
async function baixarFeed(url) {
  const r = await buscarSeguro(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "JudyRSS/1.0" } });
  if (!r.ok) { r.descartar?.(); throw new Error(`HTTP ${r.status}`); }
  return await lerTexto(r, MAX_FEED);
}

// O motivo que pode ir para a tela: só os nossos (bloqueado, HTTP n, tempo,
// tamanho); erro de biblioteca ou de rede vira uma frase só (R10).
export function motivoDoFeed(err, lang = "pt") {
  const m = String(err?.message ?? "").replace(/\s*\([^)]*\)\s*$/, "");   // sem o endereço entre parênteses
  if (/^(bloqueado: |HTTP \d{3}$|tempo esgotado|redirects demais|resposta grande demais)/.test(m)) return lang === "pt" ? m : lang === "es" ? erroEmEspanhol(m) : erroEmIngles(m);
  return lang === "es" ? "no pude leer esa dirección como RSS/Atom" : lang === "en" ? "I couldn't read that address as RSS/Atom" : "não consegui ler esse endereço como RSS/Atom";
}
const semUrl = (t) => String(t ?? "").replace(/https?:\/\/\S+/g, "‹url›");

// ── Coleta os itens NOVOS de todos os feeds de um servidor ──
async function coletarNovos(serverId) {
  const feeds = db.listarFeeds(serverId);
  const novos = [];   // { feedTitulo, titulo, link, data, resumo }
  for (const f of feeds) {
    try {
      const feed = await parseFeed(f.url);
      const tituloFeed = textoDeFora(f.titulo || feed.titulo || f.url, { max: 200 });
      for (const item of feed.itens) {
        if (!item.guid) continue;
        // marcarVisto devolve true se era novo
        if (db.marcarVisto(f.id, item.guid)) {
          novos.push({ feedTitulo: tituloFeed, categoria: categoriaDoItem(item, f.categoria), ...item });
        }
      }
      // se o feed não tinha título salvo, guarda agora
      if (!f.titulo && feed.titulo) {
        try { db.addFeed(serverId, f.url, feed.titulo); } catch (e) { registrarErro("RSS", e); }
      }
    } catch (err) {
      // (31 out 2026, R9) sem a URL (nem o servidor) no aviso: só o número do feed
      registrarErro("RSS", `falha ao ler o feed #${f.id}: ${semUrl(err?.message)}`);
    }
  }
  return novos;
}

// Os motivos do rodarCiclo, para a tela em inglês do `&rss now`
const MOTIVO_EN = {
  "servidor não permitido": "server not allowed",
  "canal não configurado": "no channel set",
  "canal inacessível": "the channel can't be reached",
  "canal de outro servidor": "the channel belongs to another server",
};
// …e para a tela em espanhol (etapa 4b)
const MOTIVO_ES = {
  "servidor não permitido": "servidor no permitido",
  "canal não configurado": "no hay canal configurado",
  "canal inacessível": "no se puede acceder al canal",
  "canal de outro servidor": "el canal es de otro servidor",
};

export async function rodarCiclo(serverId, ctx, { forcado = false } = {}) {
  if (!servidorPermitido(serverId)) return { ok: false, motivo: "servidor não permitido" };

  const config = ctx.configDoServidor ? ctx.configDoServidor(serverId) : ctx.config;
  const canalId = getCanalId(config);
  if (!canalId) return { ok: false, motivo: "canal não configurado" };

  const canal = ctx.client.channels.get(canalId)
    ?? await ctx.client.channels.fetch(canalId).catch(() => null);
  if (!canal) return { ok: false, motivo: "canal inacessível" };
  // canal de OUTRO servidor nunca recebe o resumo (15 out 2026)
  if (canalDeOutroServidor(canal, serverId)) return { ok: false, motivo: "canal de outro servidor" };

  let novos = await coletarNovos(serverId);
  if (!novos.length) {
    if (forcado) {
      const rlang = textoDoIdioma(config?.language);
      // (o envio é direto no canal, sem a tradução da tela: o espanhol vai sem marca)
      await canal.sendMessage({ embeds: [{ title: "📰 RSS",
        description: idiomaDaTela(config?.language) === "es" ? "No hay noticias nuevas desde el último ciclo." : rlang === "en" ? "No new stories since the last cycle." : "Nenhuma notícia nova desde o último ciclo.", colour: "#5865F2" }] });
    }
    return { ok: true, quantidade: 0 };
  }

  // teto de itens por ciclo (evita um lote gigante de uma vez)
  let cortados = 0;
  if (novos.length > MAX_ITENS) { cortados = novos.length - MAX_ITENS; novos = novos.slice(0, MAX_ITENS); }

  const cicloEn = textoDoIdioma(config?.language) === "en";
  // espanhol (etapa 4b): só os rótulos; o texto do modelo segue o `lang` de antes
  const cicloEs = idiomaDaTela(config?.language) === "es";
  const agora = new Date().toLocaleString(cicloEs ? "es-ES" : cicloEn ? "en-US" : "pt-BR", { timeZone: process.env.TZ || "UTC" });

  // A parte de IA do RSS (o relatório e o comentário da Judy) só nos servidores
  // da conversa (SERVIDOR/CHAT_SERVIDORES; 16 out 2026). Nos outros, a lista
  // de notícias sai do mesmo jeito, sem modelo.
  const iaNoRss = iaNoRssAqui(serverId, config);
  if (relatorioIA && iaNoRss) {
    try { await publicarRelatorio(canal, novos, { lang: cicloEn ? "en" : "pt", agora, serverId, idioma: cicloEs ? "es" : null }); }
    catch (e) { console.error("[RSS] relatório falhou:", e.message); }
  } else if (resumirIA && iaNoRss) {
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
            title: cicloEs ? `📰 El resumen de Judy${rotulo} — ${agora}` : cicloEn ? `📰 Judy's digest${rotulo} — ${agora}` : `📰 O resumo da Judy${rotulo} — ${agora}`,
            description: textoDeFora(fecharResumo(resumo, itens)),   // o modelo leu texto de fora: a saída também passa
            colour: "#a78bfa",
          }] });
        }
      } catch (e) {
        console.error(`[RSS] resumo IA (${cat}) falhou:`, e.message);   // segue para os outros blocos
      }
    }
  }

  const linhas = novos.map((it) => {
    const quando = it.data ? new Date(it.data).toLocaleString(cicloEs ? "es-ES" : cicloEn ? "en-US" : "pt-BR", { timeZone: process.env.TZ || "UTC" }) : "—";
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
    const titulo = cicloEs
      ? (blocos.length > 1 ? `📰 Noticias (${i + 1}/${blocos.length}) — ${agora}` : `📰 Noticias — ${agora}`)
      : cicloEn
      ? (blocos.length > 1 ? `📰 News (${i + 1}/${blocos.length}) — ${agora}` : `📰 News — ${agora}`)
      : (blocos.length > 1 ? `📰 Notícias (${i + 1}/${blocos.length}) — ${agora}` : `📰 Notícias — ${agora}`);
    const rodape = (i === blocos.length - 1 && cortados)
      ? (cicloEs ? `\n\n_(+${cortados} más allá del límite de este ciclo)_` : cicloEn ? `\n\n_(+${cortados} beyond this cycle's limit)_` : `\n\n_(+${cortados} além do limite deste ciclo)_`) : "";
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
      en: { titulo: "📰 RSS posted", descricao: `${novos.length} news item(s) posted in <#${canalId}>.` },
      es: { titulo: "📰 RSS publicado", descricao: `${novos.length} noticia(s) publicada(s) en <#${canalId}>.` },
    });
  } catch (e) { registrarErro("RSS", e); }

  return { ok: true, quantidade: novos.length };
}

// (31 out 2026, R11) setTimeout encadeado: o próximo ciclo só é marcado quando o
// atual termina — um ciclo lento (muitos feeds, modelo devagar) nunca se sobrepõe
// ao seguinte, como acontecia com o setInterval.
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
      registrarErro("RSS", err);
    }
    timer = setTimeout(tick, INTERVALO_MS);
    timer.unref?.();
  };
  timer = setTimeout(tick, INTERVALO_MS);
  timer.unref?.();
  console.log(`[RSS] agendador ligado (a cada ${Math.round(INTERVALO_MS / 60000)} min)`);
}

const ultimoAgora = new Map();   // serverId → ms do último `&rss agora`

export async function cmdRss(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, serverId, config, salvarConfig } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";

  if (!servidorPermitido(serverId)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Indisponível aqui", description: "A curadoria RSS não está habilitada neste servidor.", colour: COR.aviso },
      { title: "🚫 Unavailable here", description: "RSS curation isn't enabled on this server.", colour: COR.aviso },
      { title: "🚫 No disponible aquí", description: "La curaduría RSS no está habilitada en este servidor.", colour: COR.aviso }));
  }

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para configurar a curadoria RSS.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to configure RSS curation.", colour: COR.erro },
      { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManagePermissions** para configurar la curaduría RSS.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();

  // ── add ──
  if (sub === "add" || sub === "adicionar") {
    const url = args[1];
    const categoria = args.slice(2).join(" ").trim() || null;
    if (!url || !/^https?:\/\//i.test(url))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ URL inválida",
          description: `\`${citarInterno("rss.add", PREFIXO)} <url> [categoria]\` — a URL precisa começar com http(s). A categoria agrupa os resumos: \`${citarInterno("rss.add", PREFIXO)} https://... tecnologia\`.`, colour: COR.erro },
        { title: "❌ Invalid URL",
          description: `\`${citarInterno("rss.add", PREFIXO)} <url> [category]\` — the URL must start with http(s). The category groups the digests: \`${citarInterno("rss.add", PREFIXO)} https://... tech\`.`, colour: COR.erro },
        { title: "❌ URL no válida",
          description: `\`${citar("rss.add", "es", PREFIXO)} <url> [categoría]\` — la URL tiene que empezar por http(s). La categoría agrupa los resúmenes: \`${citar("rss.add", "es", PREFIXO)} https://... tecnología\`.`, colour: COR.erro }));
    // teto por servidor: cada feed é uma busca por hora saindo da máquina do bot
    if (db.listarFeeds(serverId).length >= MAX_FEEDS_SERVIDOR && !db.listarFeeds(serverId).some((f) => f.url === url))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Feeds demais", description: `Este servidor já tem **${MAX_FEEDS_SERVIDOR}** feeds — o máximo. Tire um com \`${citarInterno("rss.remove", PREFIXO)} <id>\`.`, colour: COR.erro },
        { title: "❌ Too many feeds", description: `This server already has **${MAX_FEEDS_SERVIDOR}** feeds — the maximum. Remove one with \`${citarInterno("rss.remove", PREFIXO)} <id>\`.`, colour: COR.erro },
        { title: "❌ Demasiados feeds", description: `Este servidor ya tiene **${MAX_FEEDS_SERVIDOR}** feeds — el máximo. Quita uno con \`${citar("rss.remove", "es", PREFIXO)} <id>\`.`, colour: COR.erro }));
    // valida lendo o feed UMA vez — e é essa leitura que marca o conteúdo atual
    // como visto (31 out 2026: antes eram duas leituras, e se a segunda falhasse
    // nada era marcado e o próximo ciclo despejava até 50 itens velhos)
    let feed = null;
    try { feed = await parseFeed(url); }
    catch (err) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Feed inacessível",
          description: `Não consegui ler esse RSS.\n**Erro:** ${motivoDoFeed(err, "pt")}`, colour: COR.erro },
        { title: "❌ Unreachable feed",
          description: `I couldn't read that RSS.\n**Error:** ${motivoDoFeed(err, "en")}`, colour: COR.erro },
        { title: "❌ Feed inaccesible",
          description: `No pude leer ese RSS.\n**Error:** ${motivoDoFeed(err, "es")}`, colour: COR.erro }));
    }
    const titulo = feed.titulo;
    const novo = db.addFeed(serverId, url, titulo, categoria);
    if (novo) {
      const f = db.listarFeeds(serverId).find((x) => x.url === url);
      for (const it of feed.itens) if (it.guid) db.marcarVisto(f.id, it.guid);
    }
    return sendEmbed(message.channel, tr(ctx, {
      title: novo ? "✅ Feed adicionado" : "ℹ️ Já cadastrado",
      description: novo
        ? `**${titulo || url}**\nO conteúdo atual foi marcado como visto; você receberá só as **próximas** notícias.`
        : "Esse feed já estava na lista.",
      colour: novo ? COR.sucesso : COR.mod }, {
      title: novo ? "✅ Feed added" : "ℹ️ Already registered",
      description: novo
        ? `**${titulo || url}**\nThe current content was marked as seen; you'll only get the **next** stories.`
        : "That feed was already on the list.",
      colour: novo ? COR.sucesso : COR.mod,
    }, {
      title: novo ? "✅ Feed añadido" : "ℹ️ Ya registrado",
      description: novo
        ? `**${titulo || url}**\nEl contenido actual se marcó como visto; solo recibirás las **próximas** noticias.`
        : "Ese feed ya estaba en la lista.",
      colour: novo ? COR.sucesso : COR.mod,
    }));
  }

  // ── remove ──
  if (sub === "remove" || sub === "remover" || sub === "rm") {
    const alvo = args[1];
    if (!alvo)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto",
          description: `\`${citarInterno("rss.remove", PREFIXO)} <id|url>\` (veja os IDs em \`${citarInterno("rss.list", PREFIXO)}\`)`, colour: COR.erro },
        { title: "❌ Wrong usage",
          description: `\`${citarInterno("rss.remove", PREFIXO)} <id|url>\` (see the IDs with \`${citarInterno("rss.list", PREFIXO)}\`)`, colour: COR.erro },
        { title: "❌ Uso incorrecto",
          description: `\`${citar("rss.remove", "es", PREFIXO)} <id|url>\` (mira los IDs con \`${citar("rss.list", "es", PREFIXO)}\`)`, colour: COR.erro }));
    const n = db.removeFeed(serverId, alvo);
    return sendEmbed(message.channel, tr(ctx, {
      title: n ? "🗑 Feed removido" : "❓ Não encontrado",
      description: n ? `Removido(s) ${n} feed(s).` : "Nenhum feed com esse id/url.", colour: n ? COR.sucesso : COR.aviso }, {
      title: n ? "🗑 Feed removed" : "❓ Not found",
      description: n ? `Removed ${n} feed(s).` : "No feed with that id/url.", colour: n ? COR.sucesso : COR.aviso,
    }, {
      title: n ? "🗑 Feed quitado" : "❓ No encontrado",
      description: n ? `Se quitaron ${n} feed(s).` : "No hay ningún feed con ese id/url.", colour: n ? COR.sucesso : COR.aviso,
    }));
  }

  // ── list ──
  if (sub === "list" || sub === "lista") {
    const feeds = db.listarFeeds(serverId).map((f) => ({ ...f, titulo: f.titulo ? textoDeFora(f.titulo, { max: 200 }) : null }));
    if (!feeds.length)
      return sendEmbed(message.channel, tr(ctx,
        { title: "📰 Feeds RSS", description: `Nenhum feed. Adicione com \`${citarInterno("rss.add", PREFIXO)} <url>\`.`, colour: COR.mod },
        { title: "📰 RSS feeds", description: `No feeds. Add one with \`${citarInterno("rss.add", PREFIXO)} <url>\`.`, colour: COR.mod },
        { title: "📰 Feeds RSS", description: `No hay feeds. Añade uno con \`${citar("rss.add", "es", PREFIXO)} <url>\`.`, colour: COR.mod }));
    return sendEmbed(message.channel, { title: tr(ctx, "📰 Feeds RSS", "📰 RSS feeds", "📰 Feeds RSS"),
      description: feeds.map((f) => `**${f.id}.** ${f.titulo || f.url}${f.categoria ? ` · 🏷️ ${f.categoria}` : ""}\n${f.url}`).join("\n\n"), colour: COR.mod });
  }

  // ── canal ──
  if (sub === "categoria" || sub === "category") {
    const alvo = args[1];
    const nome = args.slice(2).join(" ").trim();
    if (!alvo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🏷️ Categoria de feed",
          description: `\`${citarInterno("rss.categoria", PREFIXO)} <id|url> <nome>\` — os resumos saem agrupados por categoria, um bloco por assunto.\n\`${citarInterno("rss.categoria", PREFIXO)} <id|url> off\` tira a categoria (o feed volta para "Geral").\n\n\`${citarInterno("rss.list", PREFIXO)}\` mostra os ids.`, colour: COR.info },
        { title: "🏷️ Feed category",
          description: `\`${citarInterno("rss.categoria", PREFIXO)} <id|url> <name>\` — digests come out grouped by category, one block per topic.\n\`${citarInterno("rss.categoria", PREFIXO)} <id|url> off\` clears it (the feed goes back to "Geral").\n\n\`${citarInterno("rss.list", PREFIXO)}\` shows the ids.`, colour: COR.info },
        { title: "🏷️ Categoría de feed",
          description: `\`${citar("rss.categoria", "es", PREFIXO)} <id|url> <nombre>\` — los resúmenes salen agrupados por categoría, un bloque por tema.\n\`${citar("rss.categoria", "es", PREFIXO)} <id|url> off\` quita la categoría (el feed vuelve a "Geral").\n\n\`${citar("rss.list", "es", PREFIXO)}\` muestra los ids.`, colour: COR.info }));
    }
    const valor = /^(off|nenhuma|none)$/i.test(nome) ? null : (nome || null);
    const n = db.setCategoriaFeed(serverId, alvo, valor);
    return sendEmbed(message.channel, tr(ctx, {
      title: n ? "🏷️ Categoria atualizada" : "❌ Feed não encontrado",
      description: n
        ? (valor ? `O feed agora resume no bloco **${valor}**.` : `O feed voltou para o bloco **Geral**.`)
        : `Não achei o feed \`${alvo}\` — \`${citarInterno("rss.list", PREFIXO)}\` mostra os ids.`,
      colour: n ? COR.sucesso : COR.erro,
    }, {
      title: n ? "🏷️ Category updated" : "❌ Feed not found",
      description: n
        ? (valor ? `The feed now digests under **${valor}**.` : `The feed is back under **Geral**.`)
        : `I couldn't find feed \`${alvo}\` — \`${citarInterno("rss.list", PREFIXO)}\` shows the ids.`,
      colour: n ? COR.sucesso : COR.erro,
    }, {
      title: n ? "🏷️ Categoría actualizada" : "❌ Feed no encontrado",
      description: n
        ? (valor ? `El feed ahora se resume en el bloque **${valor}**.` : `El feed volvió al bloque **Geral**.`)
        : `No encontré el feed \`${alvo}\` — \`${citar("rss.list", "es", PREFIXO)}\` muestra los ids.`,
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
          description: "The curation won't be posted until you set a channel again.", colour: COR.mod },
        { title: "📰 Canal desactivado",
          description: "La curaduría no se publicará hasta que vuelvas a definir un canal.", colour: COR.mod }));
    }
    let canalId = null;
    if (!arg || arg === "aqui" || arg === "here" || arg === "aquí") canalId = message.channelId;
    else if (/^<?#?[0-9A-HJKMNP-TV-Z]{26}>?$/i.test(args[1])) canalId = canalDesteServidor(server, args[1])?.id ?? "fora";
    else return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso incorreto",
        description: `\`${citarInterno("rss.canal.aqui", PREFIXO)}\` · \`${citarInterno("rss.canal", PREFIXO)} <id>\` · \`${citarInterno("rss.canal.off", PREFIXO)}\``, colour: COR.erro },
      { title: "❌ Wrong usage",
        description: `\`${citarInterno("rss.canal.aqui", PREFIXO)}\` · \`${citarInterno("rss.canal", PREFIXO)} <id>\` · \`${citarInterno("rss.canal.off", PREFIXO)}\``, colour: COR.erro },
      { title: "❌ Uso incorrecto",
        description: `\`${citar("rss.canal.aqui", "es", PREFIXO)}\` · \`${citar("rss.canal", "es", PREFIXO)} <id>\` · \`${citar("rss.canal.off", "es", PREFIXO)}\``, colour: COR.erro }));
    // o canal precisa ser DESTE servidor (15 out 2026: um ID de outro servidor
    // fazia a Judy postar o resumo lá; 31 out: conferido pela lista do servidor,
    // não pelo canal buscado — um canal fora do cache passava)
    if (canalId === "fora")
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Canal de outro servidor", description: "Esse canal é de outro servidor — escolha um canal daqui.", colour: COR.erro },
        { title: "🚫 Channel from another server", description: "That channel belongs to another server — pick one from here.", colour: COR.erro },
        { title: "🚫 Canal de otro servidor", description: "Ese canal es de otro servidor — elige un canal de aquí.", colour: COR.erro }));
    config.rss.canalId = canalId; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "📰 Canal definido", description: `Os resumos serão postados em <#${canalId}>.`, colour: COR.sucesso },
      { title: "📰 Channel set", description: `The digests will be posted in <#${canalId}>.`, colour: COR.sucesso },
      { title: "📰 Canal definido", description: `Los resúmenes se publicarán en <#${canalId}>.`, colour: COR.sucesso }));
  }

  // ── agora (forçar ciclo) ──
  if (sub === "agora" || sub === "now" || sub === "testar") {
    const espera = AGORA_MIN_MS - (Date.now() - (ultimoAgora.get(serverId) ?? 0));
    if (espera > 0) {
      const min = Math.ceil(espera / 60_000);
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Calma", description: `A curadoria acabou de rodar aqui — tente de novo em ${min} min.`, colour: COR.aviso },
        { title: "⏳ Hold on", description: `The curation just ran here — try again in ${min} min.`, colour: COR.aviso },
        { title: "⏳ Calma", description: `La curaduría acaba de ejecutarse aquí — vuelve a intentarlo en ${min} min.`, colour: COR.aviso }));
    }
    if (!getCanalId(config))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Sem canal", description: `Defina primeiro com \`${citarInterno("rss.canal.aqui", PREFIXO)}\`.`, colour: COR.erro },
        { title: "❌ No channel", description: `Set one first with \`${citarInterno("rss.canal.aqui", PREFIXO)}\`.`, colour: COR.erro },
        { title: "❌ Sin canal", description: `Define uno primero con \`${citar("rss.canal.aqui", "es", PREFIXO)}\`.`, colour: COR.erro }));
    await sendEmbed(message.channel, tr(ctx,
      { title: "⏳ Rodando curadoria…",
        description: "Buscando e resumindo as novidades. Pode levar um tempo.", colour: COR.info },
      { title: "⏳ Running the curation…",
        description: "Fetching and summarizing the news. This may take a while.", colour: COR.info },
      { title: "⏳ Ejecutando la curaduría…",
        description: "Buscando y resumiendo las novedades. Puede tardar un rato.", colour: COR.info }));
    for (const [sid, t] of ultimoAgora) if (Date.now() - t >= AGORA_MIN_MS) ultimoAgora.delete(sid);   // o Map só guarda quem está na espera
    ultimoAgora.set(serverId, Date.now());
    try {
      const r = await rodarCiclo(serverId, ctx, { forcado: true });
      if (!r.ok)
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falhou", description: r.motivo, colour: COR.erro },
          { title: "❌ Failed", description: MOTIVO_EN[r.motivo] ?? r.motivo, colour: COR.erro },
          { title: "❌ Falló", description: MOTIVO_ES[r.motivo] ?? MOTIVO_EN[r.motivo] ?? r.motivo, colour: COR.erro }));
    } catch (err) {
      registrarErro("RSS", err);
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Erro na curadoria",
          description: "O resumo pode ter sido postado, mas algo falhou depois.", colour: COR.erro },
        { title: "❌ Error in the curation",
          description: "The digest may have been posted, but something failed afterwards.", colour: COR.erro },
        { title: "❌ Error en la curaduría",
          description: "Puede que el resumen se haya publicado, pero algo falló después.", colour: COR.erro }));
    }
    return; // o próprio ciclo já postou
  }

  // ── status (padrão) ──
  const feeds = db.listarFeeds(serverId);
  const canalId = getCanalId(config);
  return sendEmbed(message.channel, tr(ctx, {
    title: "📰 Curadoria RSS",
    description: [
      `**Feeds:** ${feeds.length}`,
      `**Canal:** ${canalId ? `<#${canalId}>` : "_(não definido)_"}`,
      `**Ciclo:** a cada ${Math.round(INTERVALO_MS / 60000)} min · teto ${MAX_ITENS} itens`,
      "",
      "**Comandos**",
      `\`${citarInterno("rss.add", PREFIXO)} <url>\` · \`${citarInterno("rss.remove", PREFIXO)} <id>\` · \`${citarInterno("rss.list", PREFIXO)}\``,
      `\`${citarInterno("rss.canal", PREFIXO)} <aqui|id|off>\` · \`${citarInterno("rss.agora", PREFIXO)}\``,
    ].join("\n"),
    colour: COR.mod,
  }, {
    title: "📰 RSS curation",
    description: [
      `**Feeds:** ${feeds.length}`,
      `**Channel:** ${canalId ? `<#${canalId}>` : "_(not set)_"}`,
      `**Cycle:** every ${Math.round(INTERVALO_MS / 60000)} min · cap ${MAX_ITENS} items`,
      "",
      "**Commands**",
      `\`${citarInterno("rss.add", PREFIXO)} <url>\` · \`${citarInterno("rss.remove", PREFIXO)} <id>\` · \`${citarInterno("rss.list", PREFIXO)}\``,
      `\`${citarInterno("rss.canal", PREFIXO)} <aqui|id|off>\` · \`${citarInterno("rss.agora", PREFIXO)}\``,
    ].join("\n"),
    colour: COR.mod,
  }, {
    title: "📰 Curaduría RSS",
    description: [
      `**Feeds:** ${feeds.length}`,
      `**Canal:** ${canalId ? `<#${canalId}>` : "_(sin definir)_"}`,
      `**Ciclo:** cada ${Math.round(INTERVALO_MS / 60000)} min · máximo ${MAX_ITENS} elementos`,
      "",
      "**Comandos**",
      `\`${citar("rss.add", "es", PREFIXO)} <url>\` · \`${citar("rss.remove", "es", PREFIXO)} <id>\` · \`${citar("rss.list", "es", PREFIXO)}\``,
      `\`${citar("rss.canal", "es", PREFIXO)} <here|id|off>\` · \`${citar("rss.agora", "es", PREFIXO)}\``,
    ].join("\n"),
    colour: COR.mod,
  }));
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

// `idioma: "es"` (etapa 4b): os títulos em espanhol; o `lang` (do modelo) fica como está
export async function publicarRelatorio(canal, novos, { lang = "pt", agora = "", serverId = null, idioma = null } = {}) {
  const en = lang === "en";
  const es = idioma === "es";
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
      ? (es ? `📋 Informe de vulnerabilidades` : en ? `📋 Vulnerability report` : `📋 Relatório de vulnerabilidades`)
      : (es ? `📰 Resumen · ${cat}` : en ? `📰 Summary · ${cat}` : `📰 Resumo · ${cat}`);
    const blocos = blocosDe(texto);
    for (let i = 0; i < blocos.length; i++) {
      await canal.sendMessage({ embeds: [{
        title: `${titulo}${blocos.length > 1 ? ` (${i + 1}/${blocos.length})` : ""} — ${agora}`,
        description: textoDeFora(blocos[i]), colour: cve ? "#e5484d" : "#a78bfa",
      }] });
    }
  }

  // O comentário da Judy: no tom dela, sobre o conjunto, e com a mesma trava.
  try {
    const bruto = await relatorioIA.comentario(materialNumerado(novos), { lang, serverId });
    const comentario = cortarEmFrase(tirarNumerosInventados(String(bruto ?? "").trim(),
      novos.map((it) => ({ ...it, resumo: `${it.resumo ?? ""} ${pistaDoLink(it.link)}` }))), 700);
    if (comentario) {
      await canal.sendMessage({ embeds: [{ title: es ? "💬 Judy opina" : en ? "💬 Judy's take" : "💬 A Judy comenta", description: textoDeFora(comentario), colour: "#a78bfa" }] });
    }
  } catch (e) { console.error("[RSS] comentário falhou:", e.message); }
}
