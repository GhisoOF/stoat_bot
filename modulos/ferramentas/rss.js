import ParserRSS from "rss-parser";   // dependência: sem ele, o boot para (antes caía num leitor por regex)
import { buscarSeguro, lerTexto, erroEmIngles, erroEmEspanhol, textoDeFora } from "../core/seguranca.js";
import * as db from "../core/db.js";
import { canalDeOutroServidor, canalDesteServidor } from "../moderacao/pertence.js";
import { registrarErro } from "../core/erros.js";
import * as log from "../core/log.js";
import { idiomaDaTela } from "../core/i18n.js";
import { numero } from "../core/env.js";
import { carimbo } from "../core/tempo.js";
import { fusoDoServidor, lerHorario, instanteEm, proximoInstante, diaEm, buscarFuso, fusoValido, cidadeDoFuso } from "../core/fusos.js";
import { idiomaDe } from "../core/i18n.js";
import { salvarConfigServidor } from "../core/config-store.js";
import { responder, erroDeUso, erro, semPermissao } from "../core/saida.js";

const RSS_SERVIDORES = (process.env.RSS_SERVIDORES || "")
  .split(",").map((x) => x.trim()).filter(Boolean);
function servidorPermitido(serverId) {
  if (!RSS_SERVIDORES.length) return true;   // sem allowlist = liberado
  return RSS_SERVIDORES.includes(serverId);
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

// ── P2 (31 out 2026): o telejornal ──────────────────────────────────────────
//
// O ciclo (a cada RSS_INTERVALO_MS) lê os feeds e separa as notícias novas:
//   • urgentes (só por REGRA, sem modelo item a item): CVE crítica, termo da lista
//     do servidor (`&rss urgente`), ou o mesmo assunto em 3+ fontes → saem na hora;
//   • o resto entra na fila do dia e sai num resumo só, no horário do servidor
//     (`&rss horario 21:00`, hora local do fuso do servidor). (P4, 2 nov 2026) Sem
//     modelo: o chat IA saiu, e com ele o resumo, o relatório por categoria e o
//     comentário da Judy que o modelo escrevia — o telejornal é a lista das notícias.
// Um timer só, armado só enquanto algum servidor tem feed: ele dorme até o próximo
// ciclo ou o próximo telejornal, o que vier antes.

export const HORARIO_PADRAO = "21:00";
const MAX_PENDENTES = MAX_ITENS * 4;   // a fila do dia (o telejornal mostra até MAX_ITENS)
const MAX_URGENTES = 20, MAX_TERMO = 40;

// o horário salvo ("21:00") e o fuso do servidor
export function horarioDoServidor(config) {
  return lerHorario(config?.rss?.horario) ?? lerHorario(HORARIO_PADRAO);
}
// (P2.3) o fuso do telejornal: o que a staff escolheu no `&rss horario 13:00 <cidade>`;
// senão, o de referência do servidor (&fuso) ou o do idioma
const fusoDe = (config) => (config?.rss?.fuso && fusoValido(config.rss.fuso)) ? config.rss.fuso : fusoDoServidor(config, idiomaDe({ config }));

// O telejornal de hoje (no fuso do servidor) já devia ter saído e ainda não saiu?
export function telejornalDevido(config, agora = Date.now()) {
  const zona = fusoDe(config);
  const hoje = diaEm(zona, new Date(agora));
  if (config?.rss?.ultimoTelejornal === hoje) return false;
  return agora >= instanteEm(horarioDoServidor(config), zona, new Date(agora));
}

// ── Urgência por regra ──
const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const RE_CVE_CRITICA = /\bcritical\b|\bcr[ií]tic[ao]s?\b|\bcvss(?:v?3(?:\.\d)?)?\s*(?:score)?\s*[:=]?\s*(?:9(?:\.\d)?|10(?:\.0)?)\b/i;
export function cveCritica(item) {
  const txt = `${item?.titulo ?? ""} ${item?.resumo ?? ""}`;
  return RE_CVE.test(txt) && RE_CVE_CRITICA.test(txt);
}
// termo literal (sem regex do usuário), sem acento e sem caixa, como palavra inteira
export function temTermo(item, termos = []) {
  const txt = ` ${normalizar(`${item?.titulo ?? ""} ${item?.resumo ?? ""}`).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return termos.find((t) => {
    const n = normalizar(t).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return n && txt.includes(` ${n} `);
  }) ?? null;
}
// As palavras que dizem o assunto (4+ letras, fora as muito comuns).
const COMUNS = new Set(("about after their there these those which while would could should years first being under where other into from with that this have will been were what when your more than over also just only some news says said após sobre para como mais pelo pela entre ainda depois antes quando porque sobre desde contra está estão foram será sido tem têm novo nova novos novas para este esta esse essa isso aquele pelos pelas muito muita cada tras entre sobre desde hasta para como pero porque cuando este esta están será nuevo nueva nuevos nuevas")
  .split(/\s+/));
function palavrasDoAssunto(item) {
  return new Set(normalizar(item?.titulo).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !COMUNS.has(w) && !/^\d+$/.test(w)));
}
// Grupos do mesmo assunto em 3+ fontes (feeds diferentes): dois itens são do mesmo
// assunto quando o título deles divide 2+ palavras do assunto. Só valem os grupos com
// algum item novo (`novo: true`). Devolve listas de itens.
export function assuntosEmAlta(itens, minFontes = 3) {
  const pal = itens.map(palavrasDoAssunto);
  const pai = itens.map((_, i) => i);
  const raiz = (i) => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let i = 0; i < itens.length; i++) for (let j = i + 1; j < itens.length; j++) {
    if (itens[i].feedId === itens[j].feedId) continue;
    let comuns = 0;
    for (const w of pal[i]) if (pal[j].has(w) && ++comuns >= 2) break;
    if (comuns >= 2) pai[raiz(i)] = raiz(j);
  }
  const grupos = new Map();
  itens.forEach((it, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(it); });
  return [...grupos.values()].filter((g) => new Set(g.map((x) => x.feedId)).size >= minFontes && g.some((x) => x.novo));
}

// Separa os novos em urgentes (com o motivo) e o resto. `fila`: o que já espera o telejornal.
export function separarUrgentes(novos, fila = [], termos = []) {
  const urgentes = [], motivo = new Map();
  for (const it of novos) {
    if (cveCritica(it)) motivo.set(it, "cve");
    else { const t = temTermo(it, termos); if (t) motivo.set(it, `termo:${t}`); }
  }
  const tirarDaFila = [];
  for (const g of assuntosEmAlta([...fila.map((x) => ({ ...x, novo: false })), ...novos.filter((x) => !motivo.has(x)).map((x) => ({ ...x, novo: true, _orig: x }))])) {
    for (const x of g) {
      if (x._orig) motivo.set(x._orig, "fontes");
      else if (x._id) { tirarDaFila.push(x._id); urgentes.push({ ...x, motivo: "fontes" }); }
    }
  }
  for (const it of novos) if (motivo.has(it)) urgentes.push({ ...it, motivo: motivo.get(it) });
  return { urgentes, comuns: novos.filter((it) => !motivo.has(it)), tirarDaFila };
}

// O motivo guardado do feed (pt) na língua da tela
const GENERICO_PT = "não consegui ler esse endereço como RSS/Atom";
export function motivoNaTela(m, lang) {
  if (lang === "pt" || !m) return m ?? "";
  if (m === GENERICO_PT) return lang === "es" ? "no pude leer esa dirección como RSS/Atom" : "I couldn't read that address as RSS/Atom";
  return lang === "es" ? erroEmEspanhol(m) : erroEmIngles(m);
}

// ── Coleta os itens NOVOS de todos os feeds de um servidor ──
async function coletarNovos(serverId) {
  const feeds = db.listarFeeds(serverId);
  const novos = [];   // { feedId, feedTitulo, titulo, link, data, resumo, categoria }
  for (const f of feeds) {
    try {
      const feed = await parseFeed(f.url);
      const tituloFeed = textoDeFora(f.titulo || feed.titulo || f.url, { max: 200 });
      for (const item of feed.itens) {
        if (!item.guid) continue;
        if (db.marcarVisto(f.id, item.guid)) {   // true = era novo
          novos.push({ feedId: f.id, feedTitulo: tituloFeed, categoria: categoriaDoItem(item, f.categoria),
            titulo: item.titulo, link: item.link, data: item.data, resumo: item.resumo });
        }
      }
      if (!f.titulo && feed.titulo) {   // o feed não tinha título salvo: guarda agora
        try { db.addFeed(serverId, f.url, feed.titulo); } catch (e) { registrarErro("RSS", e); }
      }
      db.rssLimparErro(f.id);
    } catch (err) {
      // (31 out 2026, R9) sem a URL (nem o servidor) no aviso: só o número do feed
      registrarErro("RSS", `falha ao ler o feed #${f.id}: ${semUrl(err?.message)}`);
      db.rssGuardarErro(f.id, motivoDoFeed(err, "pt"));
    }
  }
  return novos;
}

// Os motivos do rodarCiclo, para a tela em inglês do `&rss testar`
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

// Lista de notícias em blocos de ~1800 caracteres (o limite do embed é ~2000)
function blocosDeItens(itens, cortados, rotulos) {
  const linhas = itens.map((it) => `**${it.titulo}**\n${it.feedTitulo}${it.data && carimbo(it.data, "f") ? ` · ${carimbo(it.data, "f")}` : ""}${it.link ? `\n${it.link}` : ""}`);
  const blocos = [];
  let atual = "";
  for (const l of linhas) {
    if ((atual + "\n\n" + l).length > 1800 && atual) { blocos.push(atual); atual = ""; }
    atual = atual ? atual + "\n\n" + l : l;
  }
  if (atual) blocos.push(atual);
  if (cortados && blocos.length) blocos[blocos.length - 1] += `\n\n_(+${cortados} ${rotulos.alem})_`;
  return blocos;
}

async function enviar(canal, title, description, colour = "#5865F2") {
  try { await canal.sendMessage({ embeds: [{ title, description: String(description).slice(0, 1990), colour }] }); return true; }
  catch (e) { registrarErro("RSS", e); return false; }
}

// As urgentes saem na hora, sem modelo: título, fonte, link e o porquê.
async function publicarUrgentes(canal, urgentes, tela) {
  const porque = (m) => m === "cve" ? (tela === "es" ? "CVE crítica" : tela === "en" ? "critical CVE" : "CVE crítica")
    : m === "fontes" ? (tela === "es" ? "3+ fuentes" : tela === "en" ? "3+ sources" : "3+ fontes")
    : m.slice("termo:".length);
  const linhas = urgentes.slice(0, MAX_ITENS).map((it) => `**${it.titulo}** · _${porque(it.motivo)}_\n${it.feedTitulo}${it.link ? `\n${it.link}` : ""}`);
  const titulo = tela === "es" ? "🚨 Urgente" : tela === "en" ? "🚨 Breaking" : "🚨 Urgente";
  for (const b of blocosDe(linhas.join("\n\n"), 1800)) await enviar(canal, titulo, b, "#e5484d");
}

// O telejornal: a lista de notícias.
async function publicarTelejornal(canal, itens, { config, cortados = 0 }) {
  const tela = idiomaDaTela(config?.language);
  const quando = carimbo(Date.now(), "D");
  const nome = tela === "es" ? "📰 Telediario" : tela === "en" ? "📰 News digest" : "📰 Telejornal";
  const blocos = blocosDeItens(itens, cortados, { alem: tela === "es" ? "más" : tela === "en" ? "more" : "a mais" });
  for (let i = 0; i < blocos.length; i++) await enviar(canal, `${nome}${blocos.length > 1 ? ` (${i + 1}/${blocos.length})` : ""} — ${quando}`, blocos[i]);
}

// Um ciclo de um servidor. `forcado` (o `&rss testar`): publica o telejornal agora,
// com o que houver na fila.
export async function rodarCiclo(serverId, ctx, { forcado = false, agora = Date.now() } = {}) {
  if (!servidorPermitido(serverId)) return { ok: false, motivo: "servidor não permitido" };
  const config = ctx.configDoServidor ? ctx.configDoServidor(serverId) : ctx.config;
  const canalId = getCanalId(config);
  if (!canalId) return { ok: false, motivo: "canal não configurado" };
  const canal = ctx.client.channels.get(canalId) ?? await ctx.client.channels.fetch(canalId).catch(() => null);
  if (!canal) return { ok: false, motivo: "canal inacessível" };
  // canal de OUTRO servidor nunca recebe o resumo (15 out 2026)
  if (canalDeOutroServidor(canal, serverId)) return { ok: false, motivo: "canal de outro servidor" };
  const tela = idiomaDaTela(config?.language);

  const novos = await coletarNovos(serverId);
  const { urgentes, comuns, tirarDaFila } = separarUrgentes(novos, db.rssPendentes(serverId), config?.rss?.urgentes ?? []);
  if (urgentes.length) {
    await publicarUrgentes(canal, urgentes, tela);
    db.rssTirarPendentes(serverId, tirarDaFila);
  }
  let foraDaFila = 0;
  for (const it of comuns) if (!db.rssEnfileirar(serverId, it.feedId, it, MAX_PENDENTES, agora)) foraDaFila++;
  if (foraDaFila) registrarErro("RSS", `fila do telejornal cheia: ${foraDaFila} notícia(s) ficaram de fora`);

  let publicados = 0;
  if (forcado || telejornalDevido(config, agora)) {
    const fila = db.rssPendentes(serverId);
    const itens = fila.slice(-MAX_ITENS);
    if (itens.length) {
      await publicarTelejornal(canal, itens, { config, cortados: fila.length - itens.length });
      db.rssTirarPendentes(serverId, fila.map((x) => x._id));
      publicados = itens.length;
    } else if (forcado) {
      await enviar(canal, "📰 RSS", tela === "es" ? "No hay noticias nuevas." : tela === "en" ? "No new stories." : "Nenhuma notícia nova.");
    }
    if (!forcado) {
      config.rss ??= {};
      config.rss.ultimoTelejornal = diaEm(fusoDe(config), new Date(agora));
      if (ctx.configDoServidor) salvarConfigServidor(serverId); else ctx.salvarConfig?.();
    }
  }

  if (urgentes.length || publicados) {
    try {
      const n = urgentes.length + publicados;
      await log.registrar({ ...ctx, serverId, config }, "mensagens", {
        titulo: "📰 RSS publicado",
        descricao: `${n} notícia(s) postada(s) em <#${canalId}>.`,
        en: { titulo: "📰 RSS posted", descricao: `${n} news item(s) posted in <#${canalId}>.` },
        es: { titulo: "📰 RSS publicado", descricao: `${n} noticia(s) publicada(s) en <#${canalId}>.` },
      });
    } catch (e) { registrarErro("RSS", e); }
  }
  return { ok: true, quantidade: novos.length, urgentes: urgentes.length, publicados };
}

// ── O agendador: um timer só, e só enquanto algum servidor tem feed ──
let timer = null, ctxAgendador = null, ultimaColeta = 0;

// O próximo instante em que há o que fazer: o próximo ciclo de leitura ou o
// próximo telejornal de algum servidor, o que vier antes. Sem feed → null.
export function proximoTrabalho(agora = Date.now(), configDe = ctxAgendador?.configDoServidor) {
  const servidores = [...new Set(db.todosOsFeeds().map((f) => f.serverId))].filter(servidorPermitido);
  if (!servidores.length) return null;
  let t = (ultimaColeta || agora) + INTERVALO_MS;
  for (const sid of servidores) {
    const cfg = configDe?.(sid);
    if (!getCanalId(cfg)) continue;
    const zona = fusoDe(cfg);
    const hm = horarioDoServidor(cfg);
    const hoje = instanteEm(hm, zona, new Date(agora));
    const proximo = hoje > agora && cfg?.rss?.ultimoTelejornal !== diaEm(zona, new Date(agora)) ? hoje : proximoInstante(hm, zona, agora);
    t = Math.min(t, proximo + 1000);
  }
  return Math.max(t, agora + 1000);
}

async function tick() {
  timer = null;
  const ctx = ctxAgendador;
  try {
    const agora = Date.now();
    const coletar = agora - ultimaColeta >= INTERVALO_MS - 1000;
    const servidores = [...new Set(db.todosOsFeeds().map((f) => f.serverId))].filter(servidorPermitido);
    for (const sid of servidores) {
      const cfg = ctx.configDoServidor ? ctx.configDoServidor(sid) : null;
      if (!getCanalId(cfg)) continue;
      // fora da hora de ler, só entra quem tem o telejornal devido
      if (!coletar && !telejornalDevido(cfg, agora)) continue;
      const r = await rodarCiclo(sid, ctx, { agora });
      if (r.ok && (r.urgentes || r.publicados)) console.log(`[RSS] ${sid}: ${r.urgentes} urgente(s), ${r.publicados} no telejornal`);
    }
    if (coletar) { ultimaColeta = agora; db.limparVistosAntigos(30); }
  } catch (err) {
    registrarErro("RSS", err);
  }
  armarAgendador();
}

// (31 out 2026, R11) setTimeout encadeado: o próximo só é marcado quando o atual
// termina — um ciclo lento nunca se sobrepõe ao seguinte.
export function armarAgendador(agora = Date.now()) {
  if (timer || !ctxAgendador) return false;
  const t = proximoTrabalho(agora);
  if (t == null) return false;   // nenhum feed: sem timer (o `&rss add` arma de novo)
  timer = setTimeout(tick, Math.min(t - agora, 2 ** 31 - 1));
  timer.unref?.();
  return true;
}

export function iniciarAgendador(ctx) {
  if (ctxAgendador) return;
  ctxAgendador = ctx;
  ultimaColeta = Date.now();
  if (armarAgendador()) console.log(`[RSS] agendador ligado (leitura a cada ${Math.round(INTERVALO_MS / 60000)} min; telejornal no horário de cada servidor)`);
}
// para o teste: desarma e esquece o contexto
export function _pararAgendador() { if (timer) clearTimeout(timer); timer = null; ctxAgendador = null; }

const ultimoTeste = new Map();   // serverId → ms do último `&rss testar`

export async function cmdRss(message, args, ctx) {
  const { getServer, membroTemPermissao, serverId, config, salvarConfig } = ctx;
  const canal = message.channel;
  config.rss ??= {};

  if (!servidorPermitido(serverId)) return erro(ctx, canal, "O RSS não está habilitado neste servidor.", "RSS isn't enabled on this server.", "El RSS no está habilitado en este servidor.");
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) return semPermissao(ctx, canal, "ManagePermissions");

  const sub = args[0]?.toLowerCase();

  // ── add <url> [#canal | categoria] ──
  if (sub === "add" || sub === "adicionar") {
    const url = args[1];
    if (!url || !/^https?:\/\//i.test(url) || url.length > 500) return erroDeUso(ctx, canal, "rss", "A URL precisa começar com http(s).", "The URL must start with http(s).", "La URL tiene que empezar por http(s).");
    let destino = null, categoria = null;
    const resto = args.slice(2);
    if (resto.length === 1 && /^<?#?[0-9A-HJKMNP-TV-Z]{26}>?$/i.test(resto[0])) {
      destino = canalDesteServidor(server, resto[0]);
      if (!destino) return erro(ctx, canal, "Esse canal é de outro servidor.", "That channel belongs to another server.", "Ese canal es de otro servidor.");
    } else categoria = resto.join(" ").trim().slice(0, 40) || null;
    const feeds = db.listarFeeds(serverId);
    // teto por servidor: cada feed é uma busca por ciclo saindo da máquina do bot
    if (feeds.length >= MAX_FEEDS_SERVIDOR && !feeds.some((f) => f.url === url))
      return erro(ctx, canal, `Máximo de ${MAX_FEEDS_SERVIDOR} feeds.`, `Maximum of ${MAX_FEEDS_SERVIDOR} feeds.`, `Máximo de ${MAX_FEEDS_SERVIDOR} feeds.`);
    // valida lendo o feed UMA vez — e é essa leitura que marca o conteúdo atual como
    // visto (31 out 2026: antes eram duas, e se a segunda falhasse o ciclo despejava tudo)
    let feed = null;
    try { feed = await parseFeed(url); }
    catch (err) {
      return erro(ctx, canal, `Feed inacessível: ${motivoDoFeed(err, "pt")}`, `Unreachable feed: ${motivoDoFeed(err, "en")}`, `Feed inaccesible: ${motivoDoFeed(err, "es")}`);
    }
    const novo = db.addFeed(serverId, url, feed.titulo, categoria);
    if (novo) {
      const f = db.listarFeeds(serverId).find((x) => x.url === url);
      for (const it of feed.itens) if (it.guid) db.marcarVisto(f.id, it.guid);
    }
    if (destino) config.rss.canalId = destino.id;
    else if (!getCanalId(config)) config.rss.canalId = message.channelId;   // sem canal ainda: este
    salvarConfig?.();
    armarAgendador();
    const nome = textoDeFora(feed.titulo || url, { max: 200 });
    return novo
      ? responder(ctx, canal, `✅ **${nome}** → <#${config.rss.canalId}>`, `✅ **${nome}** → <#${config.rss.canalId}>`, `✅ **${nome}** → <#${config.rss.canalId}>`)
      : responder(ctx, canal, `**${nome}** já estava na lista.`, `**${nome}** was already on the list.`, `**${nome}** ya estaba en la lista.`, "aviso");
  }

  // ── remove <id|url> ──
  if (sub === "remove" || sub === "remover" || sub === "rm") {
    const alvo = args[1];
    if (!alvo) return erroDeUso(ctx, canal, "rss", "Faltou o id ou a URL do feed.", "Missing the feed id or URL.", "Falta el id o la URL del feed.");
    const n = db.removeFeed(serverId, alvo);
    return n
      ? responder(ctx, canal, "🗑️ Feed removido.", "🗑️ Feed removed.", "🗑️ Feed quitado.")
      : erro(ctx, canal, "Nenhum feed com esse id/URL.", "No feed with that id/URL.", "Ningún feed con ese id/URL.");
  }

  // ── list (com o último erro de cada feed) ──
  if (sub === "list" || sub === "lista") {
    const feeds = db.listarFeeds(serverId);
    if (!feeds.length) return responder(ctx, canal, "Nenhum feed.", "No feeds.", "No hay feeds.", "info");
    const erros = db.rssErros(serverId);
    const linhas = (l) => feeds.map((f) => {
      const e = erros.get(f.id);
      return `**${f.id}.** ${f.titulo ? textoDeFora(f.titulo, { max: 200 }) : f.url}${f.categoria ? ` · 🏷️ ${textoDeFora(f.categoria, { max: 40 })}` : ""}\n${f.url}`
        + (e ? `\n⚠️ ${motivoNaTela(e.erro, l)}${carimbo(e.erroEm, "R") ? ` (${carimbo(e.erroEm, "R")})` : ""}` : "");
    }).join("\n\n");
    return responder(ctx, canal, linhas("pt"), linhas("en"), linhas("es"), "info");
  }

  // ── horario <HH:MM> ──
  if (sub === "horario" || sub === "horário" || sub === "hora") {   // `time` chega traduzido pelo registro
    // (P2.3) `&rss horario 13:00 Madrid`: a hora é a da cidade dita (antes valia o fuso do
    // idioma — pt = São Paulo — e 13:00 virava 17:00 para quem está em Madrid)
    const termoCidade = args.slice(2).join(" ").trim();
    if (termoCidade) {
      const r = buscarFuso(termoCidade.slice(0, 60));
      if (!r.exato) return erroDeUso(ctx, canal, "rss", "Cidade não encontrada (ex.: Madrid, Sao Paulo, Tokyo).", "City not found (e.g. Madrid, Sao Paulo, Tokyo).", "Ciudad no encontrada (ej.: Madrid, Sao Paulo, Tokyo).");
      if (!args[1] || !lerHorario(args[1])) return erroDeUso(ctx, canal, "rss", "Horário inválido (ex.: 21:00).", "Invalid time (e.g. 21:00).", "Hora no válida (ej.: 21:00).");
      config.rss.fuso = r.exato;
    }
    const zona = fusoDe(config);
    if (args[1]) {
      const hm = lerHorario(args[1]);
      if (!hm) return erroDeUso(ctx, canal, "rss", "Horário inválido (ex.: 21:00).", "Invalid time (e.g. 21:00).", "Hora no válida (ej.: 21:00).");
      config.rss.horario = `${String(hm.h).padStart(2, "0")}:${String(hm.m).padStart(2, "0")}`;
      // já passou hoje: o de hoje fica por conta do que já saiu; o próximo é amanhã
      if (Date.now() >= instanteEm(hm, zona)) config.rss.ultimoTelejornal = diaEm(zona);
      salvarConfig?.();
      if (timer) { clearTimeout(timer); timer = null; }
      armarAgendador();
    }
    const prox = proximoInstante(horarioDoServidor(config), zona);
    // a hora como foi pedida, na cidade (texto fixo), e o timestamp (na hora de quem lê)
    const linha = `📰 **${config.rss.horario ?? HORARIO_PADRAO}** ${cidadeDoFuso(zona)} · ${carimbo(prox, "t")} (${carimbo(prox, "R")})`;
    return responder(ctx, canal, linha, linha, linha, args[1] ? "sucesso" : "info");
  }

  // ── urgente [termo] — liga/desliga um termo; sem termo, a lista ──
  if (sub === "urgente") {   // `urgent` chega traduzido pelo registro
    const lista = (config.rss.urgentes ??= []);
    const termo = args.slice(1).join(" ").trim();
    if (!termo) {
      const l = lista.length ? lista.map((t) => `\`${t}\``).join(" · ") : null;
      return responder(ctx, canal, l ?? "Nenhum termo.", l ?? "No terms.", l ?? "Ningún término.", "info");
    }
    if (termo.length > MAX_TERMO || /[`\n]/.test(termo)) return erroDeUso(ctx, canal, "rss", `Termo de até ${MAX_TERMO} caracteres.`, `Terms take up to ${MAX_TERMO} characters.`, `Términos de hasta ${MAX_TERMO} caracteres.`);
    const i = lista.findIndex((t) => normalizar(t) === normalizar(termo));
    if (i >= 0) { lista.splice(i, 1); salvarConfig?.(); return responder(ctx, canal, `🗑️ \`${termo}\``, `🗑️ \`${termo}\``, `🗑️ \`${termo}\``); }
    if (lista.length >= MAX_URGENTES) return erro(ctx, canal, `Máximo de ${MAX_URGENTES} termos.`, `Maximum of ${MAX_URGENTES} terms.`, `Máximo de ${MAX_URGENTES} términos.`);
    lista.push(termo); salvarConfig?.();
    return responder(ctx, canal, `✅ \`${termo}\``, `✅ \`${termo}\``, `✅ \`${termo}\``);
  }

  // ── categoria <id|url> <nome|off> (fora da ajuda) ──
  if (sub === "categoria" || sub === "category") {
    const alvo = args[1];
    const nome = args.slice(2).join(" ").trim().slice(0, 40);
    if (!alvo) return erroDeUso(ctx, canal, "rss", "Faltou o feed.", "Missing the feed.", "Falta el feed.");
    const valor = /^(off|nenhuma|none)$/i.test(nome) ? null : (nome || null);
    return db.setCategoriaFeed(serverId, alvo, valor)
      ? responder(ctx, canal, `🏷️ ${valor ?? "—"}`, `🏷️ ${valor ?? "—"}`, `🏷️ ${valor ?? "—"}`)
      : erro(ctx, canal, "Nenhum feed com esse id/URL.", "No feed with that id/URL.", "Ningún feed con ese id/URL.");
  }

  // ── canal <#canal|aqui|off> · off (fora da ajuda: o `add … #canal` faz o mesmo) ──
  if (sub === "canal" || sub === "channel" || sub === "off") {
    const arg = sub === "off" ? "off" : (args[1] || "").toLowerCase();
    if (arg === "off" || arg === "desativar") {
      config.rss.canalId = null; salvarConfig?.();
      return responder(ctx, canal, "📰 RSS desligado.", "📰 RSS turned off.", "📰 RSS desactivado.");
    }
    let canalId = null;
    if (!arg || arg === "aqui" || arg === "here" || arg === "aquí") canalId = message.channelId;
    else if (/^<?#?[0-9A-HJKMNP-TV-Z]{26}>?$/i.test(args[1])) canalId = canalDesteServidor(server, args[1])?.id ?? "fora";
    else return erroDeUso(ctx, canal, "rss", "Canal inválido.", "Invalid channel.", "Canal no válido.");
    // o canal precisa ser DESTE servidor (conferido pela lista do servidor, não pelo cache)
    if (canalId === "fora") return erro(ctx, canal, "Esse canal é de outro servidor.", "That channel belongs to another server.", "Ese canal es de otro servidor.");
    config.rss.canalId = canalId; salvarConfig?.();
    armarAgendador();
    return responder(ctx, canal, `📰 <#${canalId}>`, `📰 <#${canalId}>`, `📰 <#${canalId}>`);
  }

  // ── testar (e o antigo `agora`): lê os feeds e publica o telejornal agora ──
  if (sub === "testar" || sub === "agora") {   // `test`/`now` chegam traduzidos pelo registro
    const espera = AGORA_MIN_MS - (Date.now() - (ultimoTeste.get(serverId) ?? 0));
    if (espera > 0) {
      const min = Math.ceil(espera / 60_000);
      return erro(ctx, canal, `Acabou de rodar — tente de novo em ${min} min.`, `It just ran — try again in ${min} min.`, `Acaba de ejecutarse — vuelve a intentarlo en ${min} min.`);
    }
    if (!getCanalId(config)) return erroDeUso(ctx, canal, "rss", "Nenhum canal definido.", "No channel set.", "No hay canal definido.");
    for (const [sid, t] of ultimoTeste) if (Date.now() - t >= AGORA_MIN_MS) ultimoTeste.delete(sid);   // o Map só guarda quem está na espera
    ultimoTeste.set(serverId, Date.now());
    try {
      const r = await rodarCiclo(serverId, ctx, { forcado: true });
      if (!r.ok) return erro(ctx, canal, r.motivo, MOTIVO_EN[r.motivo] ?? r.motivo, MOTIVO_ES[r.motivo] ?? MOTIVO_EN[r.motivo] ?? r.motivo);
    } catch (err) {
      registrarErro("RSS", err);
      return erro(ctx, canal, "O RSS falhou no meio do caminho.", "RSS failed partway through.", "El RSS falló a mitad de camino.");
    }
    return;   // o próprio ciclo já postou
  }

  if (sub) return erroDeUso(ctx, canal, "rss", "Subcomando desconhecido.", "Unknown subcommand.", "Subcomando desconocido.");

  // ── sem subcomando: o estado ──
  const feeds = db.listarFeeds(serverId).length;
  const canalId = getCanalId(config);
  const prox = proximoInstante(horarioDoServidor(config), fusoDe(config));
  const est = (rot) => `${rot[0]}: ${feeds} · ${rot[1]}: ${canalId ? `<#${canalId}>` : "—"} · 📰 ${carimbo(prox, "t")}`;
  return responder(ctx, canal, est(["Feeds", "Canal"]), est(["Feeds", "Channel"]), est(["Feeds", "Canal"]), "info");
}

// A categoria de uma notícia: CVE é sempre "Vulnerabilidades"; o resto, a do feed.
const RE_CVE = /\bCVE-\d{4}-\d{4,}\b/i;
export function categoriaDoItem(item, categoriaDoFeed = null) {
  if (RE_CVE.test(item?.titulo ?? "")) return "Vulnerabilidades";
  return categoriaDoFeed || null;
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
