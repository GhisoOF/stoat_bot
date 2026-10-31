
import * as rajada from "./rajada.js";
import { citar, citarInterno } from "../core/aliases.js";
import { analisarConteudo, normalizarParaAnalise } from "./scorecard.js";
import * as db  from "../core/db.js";
import { descreverErro, tipoDoErro, registrarErro } from "../core/erros.js";
import { banir } from "../core/banir.js";
import * as log from "../core/log.js";
import * as banGlobal from "./ban-global.js";
import * as confianca from "./confianca.js";
import { curarIds, canalDaStaff } from "./pertence.js";
import { buscarSeguro } from "../core/seguranca.js";
import { aplicarTimeout, CONFIRMAR_MS } from "./timeout.js";
import { editarCargos } from "../core/hierarquia.js";
import * as imagemSentinela from "./imagem.js";
import * as assuntos from "./assuntos.js";
import { analisarCaracteres, analisarRepeticao, analisarDuplicata, digital, textoHumano, razaoDeCaixaAlta } from "./caracteres.js";
import { lingua, tr } from "../core/i18n.js";
import {
  ConstrutorIndice, criarIndiceVazio, carregarCache, salvarCache, idadeDoCache,
} from "./indice-dominios.js";

export { criarIndiceVazio };   // usado pelo main (estado inicial) e pelo &automod blocklist clear

// Convite do Stoat, com ou sem https:// (o Stoat torna "stt.gg/abc" clicável
// do mesmo jeito) e também no formato stoat.chat/invite/abc. Antes só o com
// https:// era pego: na bateria de 17 out 2026, a divulgação escrita
// "stt.gg/código" passou quase toda, e "stt . gg / código" passou toda.
// "sttgg/abc" (sem o ponto) não vira link, mas qualquer um digita o convite
// de volta: na 3ª bateria (17 out 2026) foi o disfarce mais comum que passou
const INVITE_REGEX = /(?<![\w.@/-])(?:https?:\/\/)?(?:www\.)?(?:stt\.?gg|(?:app\.)?stoat\.chat\/invite)\/([A-Za-z0-9]+)/gi;
// os códigos do texto como está E do texto sem disfarce (stt[.]gg, stt . gg / x)
const CONVITE_COLADO = /(?:stt\.?gg|stoat\.chat\/invite)\/([A-Za-z0-9]+)/gi;   // sem fronteira: o texto junto não tem espaços
export function codigosDeConvite(texto) {
  const codigos = new Set();
  const normal = normalizarParaAnalise(texto);
  for (const t of [texto, normal]) {
    INVITE_REGEX.lastIndex = 0;
    for (const m of t.matchAll(INVITE_REGEX)) codigos.add(m[1]);
  }
  // Letra por letra ("s t t . g g / a b c"): sem nada achado, junta tudo e
  // procura de novo. O código pode sair com letras a mais (o resto da frase
  // grudado) — para punir basta saber que há convite. (bateria de 17 out 2026)
  // (só quando o domínio NÃO aparece inteiro: "gostt.gg/x" não é convite)
  if (!codigos.size && !/stt\.?gg|stoat\.chat/i.test(String(texto ?? ""))) {
    const junto = String(texto ?? "").normalize("NFKC").replace(/[\s\u200B-\u200F\u2060\uFEFF]+/g, "").replace(/\[\.\]|\(\.\)/g, ".");
    for (const m of junto.matchAll(CONVITE_COLADO)) codigos.add(m[1]);
  }
  return [...codigos];
}

function dbg(ctx, ...args) {
  const ligado = process.env.AUTOMOD_DEBUG === "1" || ctx?.cfgGlobal?.debug === true;
  if (ligado) console.log("[AUTOMOD]", ...args);
}

// Validação simples de domínio (ex.: 02giga.link, sub.exemplo.com.br)
export const DOMINIO_VALIDO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function normalizarLinha(line) {
  line = line.trim();
  if (!line || line.startsWith("#") || line.startsWith("!") || line.startsWith("[")) return null;

  // formato hosts: "0.0.0.0 dominio.com" / "127.0.0.1 dominio.com"
  const parts = line.split(/\s+/);
  let domain = parts.length > 1 ? parts[1] : parts[0];

  domain = domain.toLowerCase()
    .replace(/^\*\./, "")      // remove curinga "*."
    .replace(/^\|\|/, "")      // formato AdBlock "||dominio^"
    .replace(/[\^|].*$/, "");  // remove sufixos AdBlock

  return DOMINIO_VALIDO.test(domain) ? domain : null;
}

// Converte o texto bruto de uma lista em um array de domínios
export function parseBlocklist(text) {
  const domains = [];
  for (const line of text.split(/\r?\n/)) {
    const d = normalizarLinha(line);
    if (d) domains.push(d);
  }
  return domains;
}

// ── Nunca bloquear (31 out 2026, R10) ─────────────────────────────────────────
// Uma lista de terceiros com um erro (ou maldosa) não pode tirar do ar o próprio
// Stoat, os CDNs dele nem os sites que todo mundo usa. Vale para o domínio e os
// subdomínios, ao montar o índice E na hora de conferir (o cache do disco pode
// ter sido montado antes).
export const NUNCA_BLOQUEAR = new Set([
  "stoat.chat", "stt.gg", "stoatusercontent.com", "revolt.chat", "rvlt.gg", "revoltusercontent.com", "autumn.revolt.chat",
  "youtube.com", "youtu.be", "github.com", "githubusercontent.com", "google.com", "wikipedia.org", "wikimedia.org",
]);
export function nuncaBloquear(dominio) {
  const partes = String(dominio ?? "").toLowerCase().split(".");
  for (let i = 0; i < partes.length - 1; i++) if (NUNCA_BLOQUEAR.has(partes.slice(i).join("."))) return true;
  return false;
}
// Fonte de lista: só https (R10) — http deixa qualquer um no caminho trocar a lista.
export const fonteValida = (url) => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(String(url ?? ""));
// O índice do disco com menos de 24 h não é baixado de novo no boot (R11).
const CACHE_FRESCO_MS = 24 * 3600_000;

// A fonte é uma URL: busca pela trava anti-SSRF (IP conferido na conexão) e
// com teto de tamanho — antes era um fetch cru, sem limite (12 out 2026).
const MAX_LISTA_BYTES = Number(process.env.BLOCKLIST_MAX_MB || 200) * 1024 * 1024;
async function baixarParaIndice(url, construtor, { buscar = buscarSeguro } = {}) {
  const res = await buscar(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) { res.descartar?.(); throw new Error(`HTTP ${res.status}`); }
  const dec = new TextDecoder();
  let resto = "", n = 0, bytes = 0;
  for await (const pedaco of res.body) {
    bytes += pedaco.length;
    if (bytes > MAX_LISTA_BYTES) { res.body.destroy?.(); throw new Error(`lista grande demais (mais de ${MAX_LISTA_BYTES / 1024 / 1024} MB)`); }
    const linhas = (resto + dec.decode(pedaco, { stream: true })).split("\n");
    resto = linhas.pop();
    for (const l of linhas) {
      const d = normalizarLinha(l);
      if (d && !nuncaBloquear(d)) { construtor.adicionar(d); n++; }
    }
  }
  resto += dec.decode();
  if (resto) {
    const d = normalizarLinha(resto);
    if (d && !nuncaBloquear(d)) { construtor.adicionar(d); n++; }
  }
  return n;
}

export function carregarBlocklistCache(ctx) {
  const { cfgGlobal, estado } = ctx;
  const idx = carregarCache(cfgGlobal);
  if (idx) {
    estado.blockedDomains = idx;
    estado.blocklistDoCache = true;
    console.info(`[BLOCKLIST] Cache do disco: ${idx.size.toLocaleString("pt-BR")} domínios prontos no boot.`);
    return true;
  }
  return false;
}

// Reconstrói o índice de domínios bloqueados a partir das fontes + manuais.
// Devolve { pulou, falharam: [url…], total }. `forcar`: os comandos que mudam a
// lista; sem ele (o boot), um cache do disco com menos de 24 h basta.
export async function rebuildBlocklist(ctx, { forcar = false } = {}) {
  const { cfgGlobal, estado } = ctx;
  if (!forcar && estado.blocklistDoCache && idadeDoCache() < CACHE_FRESCO_MS) {
    console.info("[BLOCKLIST] cache do disco com menos de 24 h — sem baixar as listas de novo");
    return { pulou: true, falharam: [], total: estado.blockedDomains?.size ?? 0 };
  }
  const construtor = new ConstrutorIndice();
  let falhas = 0;
  const falharam = [];

  for (const d of cfgGlobal.linkBlocklistManual) if (!nuncaBloquear(d)) construtor.adicionar(d.toLowerCase());
  dbg(ctx, `[BLOCKLIST] ${cfgGlobal.linkBlocklistManual.length} domínio(s) manual(is) carregado(s)`);

  for (const url of cfgGlobal.linkBlocklistSources) {
    if (!fonteValida(url)) {
      falhas++; falharam.push(url);
      console.warn(`[BLOCKLIST] fonte ignorada (só https): ${String(url).slice(0, 120)}`);
      continue;
    }
    try {
      dbg(ctx, `[BLOCKLIST] Baixando ${url} …`);
      const n = await baixarParaIndice(url, construtor, ctx?.buscarLista ? { buscar: ctx.buscarLista } : {});   // buscarLista: só teste (servidor local)
      console.info(`[BLOCKLIST] ${n.toLocaleString("pt-BR")} domínios de ${url}`);
    } catch (err) {
      falhas++; falharam.push(url);
      registrarErro("BLOCKLIST", `falha ao buscar ${url}: ${err?.message ?? err}`);
    }
  }

  const novo = construtor.construir();

  const atual = estado.blockedDomains?.size ?? 0;
  if (falhas > 0 && novo.size < atual) {
    console.warn(
      `[BLOCKLIST] ${falhas} fonte(s) falharam e o novo índice (${novo.size.toLocaleString("pt-BR")}) ` +
      `é menor que o atual (${atual.toLocaleString("pt-BR")}). Mantendo o índice atual.`
    );
    return { pulou: false, falharam, total: atual };
  }

  estado.blockedDomains = novo;
  estado.blocklistDoCache = false;
  console.info(`[BLOCKLIST] Total de domínios bloqueados: ${novo.size.toLocaleString("pt-BR")} (~${Math.round(novo.size * 8 / 1024 / 1024)} MB no índice)`);
  salvarCache(novo, cfgGlobal);   // grava em background; boot seguinte carrega na hora
  return { pulou: false, falharam, total: novo.size };
}

function extrairDominios(content) {
  const out = [];
  for (let token of (content ?? "").split(/\s+/)) {
    if (!token) continue;
    token = token.replace(/^https?:\/\//i, "");       // remove esquema
    token = token.split(/[/?#]/)[0];                  // mantém só o host
    token = token.replace(/^www\./i, "");             // remove www.
    token = token.replace(/^[^a-z0-9]+/i, "")         // pontuação à esquerda
                 .replace(/[^a-z0-9]+$/i, "");        // pontuação à direita
    token = token.toLowerCase();
    if (!DOMINIO_VALIDO.test(token)) continue;
    // Ignora IPs (ex.: 0.0.0.0): TLD de domínio real nunca é só números
    const partes = token.split(".");
    if (/^\d+$/.test(partes[partes.length - 1])) continue;
    out.push(token);
  }
  return out;
}

async function resolverCanal(message, ctx) {
  if (message.channel) return message.channel;
  try {
    const ch = ctx?.client?.channels;
    if (ch?.get) {
      const c = ch.get(message.channelId);
      if (c) return c;
    }
    if (ch?.fetch) return await ch.fetch(message.channelId);
  } catch (e) {
    console.error("[CANAL] Falha ao resolver canal:", e.message);
  }
  return null;
}

// Um domínio está bloqueado se ele ou um domínio-pai estiver na lista
function dominioBloqueado(dominio, blockedDomains) {
  const partes = dominio.split(".");
  for (let i = 0; i < partes.length - 1; i++) {
    if (blockedDomains.has(partes.slice(i).join("."))) return true;
  }
  return false;
}

export function agendarLimpezaSpam(ctx) {
  const { config, estado } = ctx;
  setInterval(() => {
    const maxWindow = Math.max(config.automod.antiSpam.windowMs, config.automod.antiMassSpam.windowMs);
    const cutoff = Date.now() - maxWindow;
    for (const [userId, ts] of estado.spamData.entries()) {
      const recent = ts.filter((t) => t > cutoff);
      if (recent.length === 0) estado.spamData.delete(userId);
      else estado.spamData.set(userId, recent);
    }
  }, 5 * 60_000);
}

function taxaPorSegundo(estado, userId, serverId = null) {
  const now = Date.now();
  const ts = estado.spamData.get(`${serverId ?? "?"}:${userId}`) ?? estado.spamData.get(userId) ?? [];
  return ts.filter((t) => now - t < 1000).length + 1; // +1 conta a atual
}

// ── Primeiro toque (9 out 2026) ─────────────────────────────────────────────
// Os filtros de "ruído" (repetir mensagem, caixa alta, emoji, velocidade,
// letras repetidas, caracteres estranhos, muitos anexos) pegam gente normal
// empolgada — "Miguel miguel" três vezes chamando um amigo virou aviso. Para
// quem NÃO é conta nova e fora de uma onda de raid, a primeira vez em
// TOQUE_MS só apaga e explica, sem contar aviso. Se repetir dentro da
// janela, aí segue a escada normal. Só vale no modo `acumular` (nos modos
// avisar/apagar já não há aviso; confirmar/banir foi escolha explícita).
export const TOQUE_MS = 10 * 60_000;
const toques = new Map();   // "server:user" → quando levou o último toque
export function primeiroToque(sid, userId, { agora = Date.now(), novato = false, raid = false } = {}) {
  if (novato || raid) return false;
  const chave = `${sid}:${userId}`;
  const ultimo = toques.get(chave);
  if (ultimo && agora - ultimo < TOQUE_MS) return false;
  toques.set(chave, agora);
  if (toques.size > 5000) for (const [k, t] of toques) if (agora - t > TOQUE_MS) toques.delete(k);
  return true;
}
function modoEfetivo(config, pol) {
  return (pol && pol.modo) ? pol.modo : (config.automod?.punicao?.modo ?? "avisar");
}
async function darToque(ctx, { server, channel, message, userId, motivo }) {
  const { sendEmbed, COR } = ctx;
  // (31 out 2026, Reparo) "a mensagem foi apagada" só se foi mesmo
  let apagou = false;
  if (message) { try { await message.delete(); apagou = true; } catch (e) { registrarErro("AUTOMOD:toque", e); } }
  let aviso = null;
  try {
    aviso = await sendEmbed(channel, {
      title: tr(ctx, "🙂 Só um toque", "🙂 Just a heads-up", "🙂 Solo un toque de atención"),
      description: apagou ? tr(ctx,
        `<@${userId}> — ${motivo}.\n_A mensagem foi apagada, **sem contar aviso**. Se repetir nos próximos 10 min, aí conta._`,
        `<@${userId}> — ${motivo}.\n_Message removed, **no warning counted**. If it happens again in the next 10 min, it counts._`,
        `<@${userId}> — ${motivo}.\n_Se borró el mensaje, **sin contar aviso**. Si se repite en los próximos 10 min, ahí sí cuenta._`)
        : tr(ctx,
        `<@${userId}> — ${motivo}.\n_**Sem contar aviso** desta vez. Se repetir nos próximos 10 min, aí conta._`,
        `<@${userId}> — ${motivo}.\n_**No warning counted** this time. If it happens again in the next 10 min, it counts._`,
        `<@${userId}> — ${motivo}.\n_**Sin contar aviso** esta vez. Si se repite en los próximos 10 min, ahí sí cuenta._`),
      colour: COR.aviso,
    });
  } catch (e) { registrarErro("AUTOMOD:toque", e); }
  // some sozinho: é um lembrete, não um registro público
  if (aviso?.delete) setTimeout(() => aviso.delete().catch?.(() => {}), 20_000).unref?.();
  await log.registrar(ctx, "punicoes", { titulo: "🙂 Toque do AutoMod (sem aviso)",
    descricao: `<@${userId}> — ${motivo}`,
    en: { titulo: "🙂 AutoMod heads-up (no warning)", descricao: `<@${userId}> — ${motivo}` },
    es: { titulo: "🙂 Toque de atención del AutoMod (sin aviso)", descricao: `<@${userId}> — ${motivo}` } });
}

async function aplicarPunicao(ctx, opts) {
  const { server, channel, message, userId, motivo } = opts;
  const apagar = opts.apagar !== false;
  const nota = opts.nota ?? null;
  const grave = opts.grave ?? false;
  const { config, estado, sendEmbed, COR, PREFIXO } = ctx;
  const lang = lingua(ctx);   // idioma dos avisos vistos pelos membros
  // Política: a do MÓDULO (opts.pol) tem prioridade; senão, a global do servidor.
  const polGlobal = config.automod.punicao ?? { modo: "avisar", warnsParaBan: 3, silenceRoleId: null };
  const polModulo = opts.pol && opts.pol.modo ? opts.pol : null;
  const pol = {
    ...polGlobal,
    ...(polModulo ?? {}),
    silenceRoleId: polGlobal.silenceRoleId,   // o cargo de silêncio é sempre o do servidor
  };

  const linhaNota = (nota != null)
    ? `\n**${tr(ctx, "Nota", "Score", "Puntuación")}:** ${nota.toFixed(1)}/10` : "";
  const blocoGrave = grave ? [
    "",
    tr(ctx,
      "🚨 **Conteúdo grave.** Preserve evidências (ID do usuário) e denuncie à plataforma/autoridades — no Brasil: SaferNet + Polícia Federal; abuso infantil: report.cybertip.org.",
      "🚨 **Serious content.** Preserve evidence (the user's ID) and report it to the platform/authorities — child abuse: report.cybertip.org.",
      "🚨 **Contenido grave.** Conserva las pruebas (el ID del usuario) y denúncialo a la plataforma/autoridades — abuso infantil: report.cybertip.org."),
  ] : [];

  // ── avisar: só notifica, não pune ──
  // Os filtros de regra fixa (ódio, convite, link da lista, spam, caps…)
  // apagam a mensagem mesmo assim — é o que segurou o ataque de 2 out. O
  // sentinela (nota, pode errar) não apaga. Antes o texto dizia "nada foi
  // removido" com a mensagem já apagada (15 out 2026).
  if (pol.modo === "avisar") {
    const apagou = opts.regraFixa === true && apagar && !!message
      && await Promise.resolve(message.delete()).then(() => true, (e) => { console.error("[PUNIÇÃO][DEL]", descreverErro(e)); return false; });
    await sendEmbed(channel, {
      title: grave
        ? tr(ctx, "🚨 Detecção (somente aviso)", "🚨 Detection (warning only)", "🚨 Detección (solo aviso)")
        : tr(ctx, "👁 Aviso do AutoMod", "👁 AutoMod notice", "👁 Aviso del AutoMod"),
      description: [`<@${userId}> — ${motivo}${linhaNota}`,
        apagou
          ? tr(ctx, "_Modo apenas-aviso: a mensagem foi apagada, mas ninguém foi punido._",
                    "_Warn-only mode: the message was removed, but nobody was punished._",
                    "_Modo solo aviso: se borró el mensaje, pero nadie fue castigado._")
          : tr(ctx, "_Modo apenas-aviso: nada foi removido ou punido automaticamente._",
                    "_Warn-only mode: nothing was removed or punished automatically._",
                    "_Modo solo aviso: no se borró ni se castigó nada automáticamente._"),
        ...blocoGrave].join("\n"),
      colour: grave ? COR.erro : COR.aviso,
    });
    return;
  }

  // demais modos removem a mensagem ofensora
  let apagou = false;
  if (apagar && message) { try { await message.delete(); apagou = true; } catch (e) { registrarErro("PUNIÇÃO:DEL", e); } }

  // ── apagar: só remove a mensagem, sem punir o usuário ──
  if (pol.modo === "apagar") {
    await sendEmbed(channel, {
      title: tr(ctx, "🧹 Mensagem removida", "🧹 Message removed", "🧹 Mensaje eliminado"),
      description: [`<@${userId}> — ${motivo}${linhaNota}`,
        apagou
          ? tr(ctx, "_A mensagem foi apagada. Nenhuma punição aplicada ao usuário._",
                "_The message was deleted. No punishment applied to the user._",
                "_Se borró el mensaje. No se aplicó ningún castigo al usuario._")
          : tr(ctx, "_Não consegui apagar a mensagem (falta **ManageMessages** ao bot?). Nenhuma punição aplicada._",
                "_I couldn't delete the message (does the bot lack **ManageMessages**?). No punishment applied._",
                "_No pude borrar el mensaje (¿le falta **ManageMessages** al bot?). No se aplicó ningún castigo._"),
        ...blocoGrave].join("\n"),
      colour: COR.mod,
    });
    await log.registrar(ctx, "punicoes", { titulo: "🧹 Mensagem removida (automod)",
      descricao: `<@${userId}> — ${motivo}`,
      en: { titulo: "🧹 Message removed (automod)", descricao: `<@${userId}> — ${motivo}` },
      es: { titulo: "🧹 Mensaje eliminado (automod)", descricao: `<@${userId}> — ${motivo}` } });
    return;
  }

  // ── banir: ban imediato ──
  if (pol.modo === "banir") {
    let acao = tr(ctx, "mensagem removida", "message removed", "mensaje eliminado");
    try {
      await banir(server, userId, { reason: `[AutoMod] ${motivo}` });
      acao = tr(ctx, "🔨 usuário BANIDO", "🔨 user BANNED", "🔨 usuario BANEADO");
      await banGlobal.registrar(ctx, userId, motivo, "automod",
        { nome: message?.author?.username ?? null, membro: message?.member ?? message?.author ?? null });
    }
    catch (e) { console.error("[PUNIÇÃO][BAN]", descreverErro(e));
      acao = tr(ctx, `falha ao banir (${descreverErro(e)})`, `failed to ban (${descreverErro(e, "en")})`, `no se pudo banear (${descreverErro(e, "es")})`); }
    await sendEmbed(channel, { title: tr(ctx, "🔨 Banimento imediato", "🔨 Instant ban", "🔨 Ban inmediato"),
      description: [`<@${userId}> — ${motivo}${linhaNota}`,
        `**${tr(ctx, "Ação", "Action", "Acción")}:** ${acao}`, ...blocoGrave].join("\n"),
      colour: COR.erro });
    await log.registrar(ctx, "punicoes", { titulo: "🔨 Banimento imediato",
      descricao: `<@${userId}> — ${acao}.\n**Motivo:** ${motivo}`,
      en: { titulo: "🔨 Instant ban", descricao: `<@${userId}> — ${acao}.\n**Reason:** ${motivo}` },
      es: { titulo: "🔨 Ban inmediato", descricao: `<@${userId}> — ${acao}.\n**Motivo:** ${motivo}` } });
    return;
  }

  // ── confirmar: silencia (se houver cargo) e pede confirmação ──
  if (pol.modo === "confirmar") {
    let acao = tr(ctx, "mensagem removida", "message removed", "mensaje eliminado");
    // Silêncio = timeout nativo do Stoat (não mais o cargo de silêncio), até a
    // staff decidir — com teto de AUTOMOD_CONFIRMAR_HORAS (24 h por padrão).
    try {
      const ms = CONFIRMAR_MS();
      await aplicarTimeout(server, userId, ms);
      const horas = Math.round(ms / 3600e3);
      acao = tr(ctx, `usuário silenciado (timeout) até a staff decidir — no máximo ${horas} h`, `user silenced (timeout) until the staff decides — at most ${horas} h`, `usuario silenciado (timeout) hasta que el staff decida — como máximo ${horas} h`);
      // Marca no banco: se sair e voltar, o timeout é REAPLICADO pelo tempo que falta.
      db.silenciarAte(ctx.serverId ?? server?.id, userId, Date.now() + ms, motivo);
    } catch (e) {
      const detalhe = descreverErro(e, lang);
      console.error("[PUNIÇÃO][SILENCE]", detalhe);
      acao = tr(ctx, `falha ao silenciar — ${detalhe}`, `failed to silence — ${detalhe}`, `no se pudo silenciar — ${detalhe}`);
      // Sem silêncio, a pessoa seguia postando (raid de 27/09: suásticas por
      // mais 1 min, e as mensagens só sumiram quando a staff acordou).
      confianca.quarentenar(ctx.serverId ?? server?.id, userId);
      acao += tr(ctx,
        " — enquanto isso, **tudo o que a pessoa mandar nos próximos 30 min é apagado**",
        " — until then, **everything they post in the next 30 min is deleted**",
        " — mientras tanto, **todo lo que publique en los próximos 30 min se borra**");
    }
    await sendEmbed(channel, {
      title: tr(ctx, "⚠️ Violação — confirmação necessária", "⚠️ Violation — confirmation needed", "⚠️ Infracción — se necesita confirmación"),
      description: [`<@${userId}> — ${motivo}${linhaNota}`,
        `**${tr(ctx, "Ação", "Action", "Acción")}:** ${acao}`,
        tr(ctx,
          `Confirme o ban com \`${citarInterno("automod.sentinela.banir", PREFIXO)} ${userId}\` ou libere com \`${citarInterno("automod.sentinela.liberar", PREFIXO)} ${userId}\`.`,
          `Confirm the ban with \`${citar("automod.sentinela.banir", "en", PREFIXO)} ${userId}\` or release with \`${citar("automod.sentinela.liberar", "en", PREFIXO)} ${userId}\`.`,
          `Confirma el ban con \`${citar("automod.sentinela.banir", "es", PREFIXO)} ${userId}\` o libéralo con \`${citar("automod.sentinela.liberar", "es", PREFIXO)} ${userId}\`.`),
        ...blocoGrave].join("\n"),
      colour: COR.mod,
    });
    await log.registrar(ctx, "punicoes", { titulo: "⚠️ Violação — aguardando confirmação",
      descricao: `<@${userId}> — ${acao}.\n**Motivo:** ${motivo}`,
      en: { titulo: "⚠️ Violation — awaiting confirmation", descricao: `<@${userId}> — ${acao}.\n**Reason:** ${motivo}` },
      es: { titulo: "⚠️ Infracción — esperando confirmación", descricao: `<@${userId}> — ${acao}.\n**Motivo:** ${motivo}` } });
    return;
  }

  const sid   = ctx.serverId ?? server?.id;
  const count = db.somarAviso(sid, userId, motivo, { validadeMs: validadeDosAvisos(polGlobal) });
  const degraus = escadaDePunicao(pol);
  // Passou do último degrau definido? Fica no último (que é o ban).
  const degrau = degraus[Math.min(count, degraus.length) - 1];
  console.log(`[AUTOMOD] ⚠️ Aviso #${count} para ${userId} → ${degrau.tipo} — ${motivo}`);

  if (degrau.tipo === "aviso") {
    await sendEmbed(channel, { title: tr(ctx, "⚠️ Aviso do AutoMod", "⚠️ AutoMod warning", "⚠️ Aviso del AutoMod"),
      description: [
        tr(ctx,
          `<@${userId}> — ${motivo} *(aviso ${count})*${linhaNota}`,
          `<@${userId}> — ${motivo} *(warning ${count})*${linhaNota}`,
          `<@${userId}> — ${motivo} *(aviso ${count})*${linhaNota}`),
        tr(ctx,
          `_Próximo passo: ${rotuloDegrau(degraus[count], "pt")}._`,
          `_Next step: ${rotuloDegrau(degraus[count], "en")}._`,
          `_Siguiente paso: ${rotuloDegrau(degraus[count], "es")}._`),
        ...blocoGrave].join("\n"),
      colour: COR.aviso });
    await log.registrar(ctx, "punicoes", { titulo: "⚠️ Aviso aplicado",
      descricao: `<@${userId}> recebeu o aviso **${count}**.\n**Motivo:** ${motivo}`,
      en: { titulo: "⚠️ Warning given", descricao: `<@${userId}> got warning **${count}**.\n**Reason:** ${motivo}` },
      es: { titulo: "⚠️ Aviso aplicado", descricao: `<@${userId}> recibió el aviso **${count}**.\n**Motivo:** ${motivo}` } });
    return;
  }

  if (degrau.tipo === "mute") {
    const ate = Date.now() + degrau.ms;
    let acao = tr(ctx, `silenciado por ${degrau.rotulo}`, `silenced for ${degrau.rotulo}`, `silenciado por ${degrau.rotulo}`);
    // Timeout nativo: o próprio Stoat tira na hora certa (o vigia só limpa o registro).
    try {
      await aplicarTimeout(server, userId, degrau.ms);
      db.silenciarAte(sid, userId, ate, motivo);
    } catch (e) {
      const detalhe = descreverErro(e, lang);
      console.error("[PUNIÇÃO][MUTE]", detalhe);
      acao = tr(ctx, `falha ao silenciar — ${detalhe}`, `failed to silence — ${detalhe}`, `no se pudo silenciar — ${detalhe}`);
      // Sem silêncio, a pessoa seguia postando (raid de 27/09: suásticas por
      // mais 1 min, e as mensagens só sumiram quando a staff acordou).
      // Mas só para o que é grave ou para conta nova: quem já é do servidor e
      // escorregou num filtro de ruído não fica 30 min com tudo apagado
      // porque o BOT não tinha a permissão (9 out 2026).
      if (!opts.ruido || confianca.contaNova(sid, userId) || confianca.emModoRaid(sid)) {
        confianca.quarentenar(ctx.serverId ?? server?.id, userId);
        acao += tr(ctx,
          " — enquanto isso, **tudo o que a pessoa mandar nos próximos 30 min é apagado**",
          " — until then, **everything they post in the next 30 min is deleted**",
          " — mientras tanto, **todo lo que publique en los próximos 30 min se borra**");
      }
    }
    await sendEmbed(channel, { title: tr(ctx, "🔇 Silêncio temporário", "🔇 Temporary silence", "🔇 Silencio temporal"),
      description: [
        `<@${userId}> — ${acao}. *(${tr(ctx, "aviso", "warning", "aviso")} ${count})*`,
        `**${tr(ctx, "Motivo", "Reason", "Motivo")}:** ${motivo}${linhaNota}`,
        degraus[count]
          ? tr(ctx, `_Próximo passo: ${rotuloDegrau(degraus[count], "pt")}._`,
                    `_Next step: ${rotuloDegrau(degraus[count], "en")}._`,
                    `_Siguiente paso: ${rotuloDegrau(degraus[count], "es")}._`)
          : null,
        ...blocoGrave].filter(Boolean).join("\n"),
      colour: COR.mod });
    await log.registrar(ctx, "punicoes", { titulo: "🔇 Silêncio temporário",
      descricao: `<@${userId}> silenciado por **${degrau.rotulo}** (aviso ${count}).\n**Motivo:** ${motivo}`,
      en: { titulo: "🔇 Temporary silence", descricao: `<@${userId}> silenced for **${degrau.rotulo}** (warning ${count}).\n**Reason:** ${motivo}` },
      es: { titulo: "🔇 Silencio temporal", descricao: `<@${userId}> silenciado por **${degrau.rotulo}** (aviso ${count}).\n**Motivo:** ${motivo}` } });
    return;
  }

  // ── último degrau: ban ──
  let acao = tr(ctx, "banido", "banned", "baneado");
  try {
    await banir(server, userId, { reason: `[AutoMod] ${motivo} (${count} avisos)` });
    await banGlobal.registrar(ctx, userId, `${motivo} (${count} avisos)`, "automod",
      { nome: message?.author?.username ?? null, membro: message?.member ?? message?.author ?? null });
  } catch (e) {
    console.error("[PUNIÇÃO][BAN]", descreverErro(e));
    acao = tr(ctx, `falha ao banir (${descreverErro(e)})`, `failed to ban (${descreverErro(e, "en")})`, `no se pudo banear (${descreverErro(e, "es")})`);
  }
  db.limparPunicao(sid, userId);
  await sendEmbed(channel, { title: tr(ctx, "🔨 Usuário banido", "🔨 User banned", "🔨 Usuario baneado"),
    description: [
      tr(ctx, `<@${userId}> ${acao} após ${count} avisos.`, `<@${userId}> ${acao} after ${count} warnings.`, `<@${userId}> ${acao} tras ${count} avisos.`),
      `**${tr(ctx, "Motivo", "Reason", "Motivo")}:** ${motivo}${linhaNota}`, ...blocoGrave].join("\n"),
    colour: COR.erro });
  await log.registrar(ctx, "punicoes", { titulo: "🔨 Ban automático",
    descricao: `<@${userId}> banido após **${count}** avisos.\n**Motivo:** ${motivo}`,
    en: { titulo: "🔨 Automatic ban", descricao: `<@${userId}> banned after **${count}** warnings.\n**Reason:** ${motivo}` },
    es: { titulo: "🔨 Ban automático", descricao: `<@${userId}> baneado tras **${count}** avisos.\n**Motivo:** ${motivo}` } });
}

// Padrão de dano (desafios, humilhação, doxxing): nada foi punido, mas a
// soma das mensagens de uma pessoa merece olho humano. Mostra os trechos,
// porque é a conversa inteira — não uma frase — que conta a história.
async function alertarPadraoDano(ctx, { server = null, userId, p }) {
  const { config, sendEmbed, COR, PREFIXO } = ctx;
  // (31 out 2026, R9) sem canal da staff, o alerta NÃO cai no canal público
  const destino = await canalDaStaff(ctx, server);
  const cargos = config.acesso?.cargosStaff ?? [];
  const mencao = cargos.length ? cargos.map((id) => `<%${id}>`).join(" ") : "";
  const trechos = p.trechos.map((t) => `> ${t}`).join("\n");
  if (!destino) console.warn(`[SENTINELA][dano] alerta NÃO entregue: servidor ${ctx.serverId ?? server?.id} sem canal de alerta do sentinela nem de log`);
  else try {
    await sendEmbed(destino, {
      title: tr(ctx, "🚩 Padrão de dano", "🚩 Harmful pattern", "🚩 Patrón de daño"),
      description: [
        mencao,
        tr(ctx,
          `<@${userId}> soma **${p.soma.toFixed(1)}** em sinais de dano, em ${p.mensagens} mensagem(ns) nas últimas ~${p.horas}h.`,
          `<@${userId}> adds up **${p.soma.toFixed(1)}** in harm signals across ${p.mensagens} message(s) in ~${p.horas}h.`,
          `<@${userId}> suma **${p.soma.toFixed(1)}** en señales de daño, en ${p.mensagens} mensaje(s) en las últimas ~${p.horas}h.`),
        `**${tr(ctx, "Categorias", "Categories", "Categorías")}:** ${p.categorias.join(", ")}`,
        "",
        trechos,
        "",
        tr(ctx,
          "Nenhuma mensagem sozinha passou do limite, então nada foi punido. É o **padrão** — desafios, humilhação, expor gente — que merece olho humano.",
          "No single message crossed the line, so nothing was punished. The **pattern** — challenges, humiliation, exposing people — is what's worth a human look.",
          "Ningún mensaje por sí solo cruzó el límite, así que no se castigó nada. Es el **patrón** — retos, humillación, exponer a gente — lo que merece una mirada humana."),
        tr(ctx,
          `\`${citarInterno("automod.sentinela.banir", PREFIXO)} ${userId}\` · \`${citarInterno("automod.sentinela.liberar", PREFIXO)} ${userId}\``,
          `\`${citar("automod.sentinela.banir", "en", PREFIXO)} ${userId}\` · \`${citar("automod.sentinela.liberar", "en", PREFIXO)} ${userId}\``,
          `\`${citar("automod.sentinela.banir", "es", PREFIXO)} ${userId}\` · \`${citar("automod.sentinela.liberar", "es", PREFIXO)} ${userId}\``),
      ].filter((l) => l !== null && l !== undefined).join("\n"),
      colour: COR.erro,
    });
  } catch (e) { registrarErro("SENTINELA:dano", e); }
  await log.registrar(ctx, "punicoes", {
    titulo: "🚩 Padrão de dano",
    descricao: `<@${userId}> — ${p.soma.toFixed(1)} em ${p.mensagens} mensagem(ns): ${p.categorias.join(", ")}`,
    en: { titulo: "🚩 Harm pattern", descricao: `<@${userId}> — ${p.soma.toFixed(1)} across ${p.mensagens} message(s): ${p.categorias.join(", ")}` },
    es: { titulo: "🚩 Patrón de daño", descricao: `<@${userId}> — ${p.soma.toFixed(1)} en ${p.mensagens} mensaje(s): ${p.categorias.join(", ")}` },
  });
}

// O perfil de confiança (confianca.js) em espanhol, pelo id da faixa
const FAIXA_ES = { novato: "recién llegado", conhecido: "conocido", frequente: "habitual", estabelecido: "establecido", veterano: "veterano" };

async function alertarAdministracao(ctx, { server, canal, userId, sinal, faixa, nivel, nota }) {
  const { config, sendEmbed, COR, PREFIXO } = ctx;
  const am = config.automod ?? {};

  // Onde avisar: o canal do sentinela, senão o de logs. Nunca o canal público
  // da mensagem (31 out 2026, R9): sem destino, fica só no log local.
  const destino = await canalDaStaff(ctx, server);

  const cargos = config.acesso?.cargosStaff ?? [];
  const mencao = cargos.length ? cargos.map((id) => `<%${id}>`).join(" ") : "";

  const linhas = tr(ctx, [
    mencao,
    `**Possível ameaça** — <@${userId}> acionou o sentinela **${sinal.vezes}×** em ${sinal.janelaMin} min.`,
    `**Perfil:** ${faixa ? faixa.rotulo : "desconhecido"}${nivel != null ? ` (nível ${nivel})` : ""} · **maior nota:** ${nota.toFixed(1)}/10`,
    sinal.sinais.length ? `**Sinais:** ${sinal.sinais.join(", ")}` : null,
    "",
    "Nada foi punido — a nota ficou abaixo do limiar. Isto é um **padrão**, e padrão merece olho humano.",
    `\`${citarInterno("automod.sentinela.banir", PREFIXO)} ${userId}\` · \`${citarInterno("automod.sentinela.liberar", PREFIXO)} ${userId}\` · \`${citar("warn.lista", "pt", PREFIXO)} ${userId}\``,
  ], [
    mencao,
    `**Possible threat** — <@${userId}> tripped the sentinel **${sinal.vezes}×** in ${sinal.janelaMin} min.`,
    `**Profile:** ${faixa ? faixa.rotuloEN : "unknown"}${nivel != null ? ` (level ${nivel})` : ""} · **highest score:** ${nota.toFixed(1)}/10`,
    sinal.sinais.length ? `**Signals:** ${sinal.sinais.join(", ")}` : null,
    "",
    "Nothing was punished — the score stayed below the threshold. This is a **pattern**, and patterns are worth a human look.",
    `\`${citar("automod.sentinela.banir", "en", PREFIXO)} ${userId}\` · \`${citar("automod.sentinela.liberar", "en", PREFIXO)} ${userId}\` · \`${citar("warn.lista", "en", PREFIXO)} ${userId}\``,
  ], [
    mencao,
    `**Posible amenaza** — <@${userId}> activó el centinela **${sinal.vezes}×** en ${sinal.janelaMin} min.`,
    `**Perfil:** ${faixa ? (FAIXA_ES[faixa.id] ?? faixa.rotuloEN ?? faixa.rotulo) : "desconocido"}${nivel != null ? ` (nivel ${nivel})` : ""} · **nota más alta:** ${nota.toFixed(1)}/10`,
    sinal.sinais.length ? `**Señales:** ${sinal.sinais.join(", ")}` : null,
    "",
    "No se castigó nada — la nota quedó por debajo del umbral. Esto es un **patrón**, y los patrones merecen una mirada humana.",
    `\`${citar("automod.sentinela.banir", "es", PREFIXO)} ${userId}\` · \`${citar("automod.sentinela.liberar", "es", PREFIXO)} ${userId}\` · \`${citar("warn.lista", "es", PREFIXO)} ${userId}\``,
  ]);

  if (!destino) console.warn(`[SENTINELA][alerta] alerta NÃO entregue: servidor ${ctx.serverId ?? server?.id} sem canal de alerta do sentinela nem de log`);
  else try {
    await sendEmbed(destino, {
      title: tr(ctx, "🚨 Possível ameaça", "🚨 Possible threat", "🚨 Posible amenaza"),
      description: linhas.filter(Boolean).join("\n"),
      colour: COR.erro,
    });
  } catch (e) { registrarErro("SENTINELA:alerta", e); }

  await log.registrar(ctx, "punicoes", {
    titulo: "🚨 Possível ameaça",
    descricao: `<@${userId}> acionou o sentinela **${sinal.vezes}×** em ${sinal.janelaMin} min`
      + ` (${faixa?.rotulo ?? "?"}, nível ${nivel ?? "?"}). Sinais: ${sinal.sinais.join(", ") || "—"}`,
    en: { titulo: "🚨 Possible threat",
      descricao: `<@${userId}> tripped the sentinel **${sinal.vezes}×** in ${sinal.janelaMin} min`
        + ` (${faixa?.rotuloEN ?? faixa?.rotulo ?? "?"}, level ${nivel ?? "?"}). Signals: ${sinal.sinais.join(", ") || "—"}` },
    es: { titulo: "🚨 Posible amenaza",
      descricao: `<@${userId}> activó el centinela **${sinal.vezes}×** en ${sinal.janelaMin} min`
        + ` (${(faixa && FAIXA_ES[faixa.id]) ?? faixa?.rotuloEN ?? faixa?.rotulo ?? "?"}, nivel ${nivel ?? "?"}). Señales: ${sinal.sinais.join(", ") || "—"}` },
  });
  console.log(`[SENTINELA] 🚨 Alerta: ${userId} — ${sinal.vezes}× em ${sinal.janelaMin}min`);
}

export const ESCADA_PADRAO = "aviso,5m,1h,ban";

// Quantos avisos até o ban = o tamanho da escada (o ban é o último degrau).
// Antes havia DOIS números: o automod seguia a escada (ban no 4º) e o `&warn`
// manual banía no `warnsParaBan` (3) — um aviso manual depois de dois do
// automod banía quem o automod só teria silenciado por 1h.
export function limiteDeAvisos(pol = {}) {
  return escadaDePunicao(pol).length;
}
// Depois de quantos dias sem punição nova os avisos zeram (0 = nunca).
export const VALIDADE_PADRAO_DIAS = 30;
export function validadeDosAvisos(pol = {}) {
  const d = Number(pol?.validadeDias ?? VALIDADE_PADRAO_DIAS);
  return Number.isFinite(d) && d > 0 ? d * 86_400_000 : 0;
}

// Os filtros do automod: nome do comando → chave na config. Uma lista só para
// o &automod, o &config e o &info (o &info contava 9 de 11, e o &config não
// mostrava o anticaracteres nem o antirepeticao).
export const MODULOS_AUTOMOD = {
  antiodio:        "antiOdio",
  antiemoji:       "antiEmoji",
  antimidia:       "antiMidia",
  antispam:        "antiSpam",
  antimassspam:    "antiMassSpam",
  antiinvite:      "antiInvite",
  antimassmention: "antiMassMention",
  anticaps:        "antiCaps",
  antilink:        "antiLink",
  sentinela:       "antiScam",
  anticaracteres:  "antiCaracteres",
  antiduplicata:   "antiDuplicata",
  antiimagem:      "antiImagem",
  antirepeticao:   "antiRepeticao",
  antiassuntos:    "antiAssuntos",   // temas proibidos (13 out 2026)
  antiavatar:      "antiAvatar",     // foto de perfil (13 out 2026)
};
// ── Os quatro grupos (pedido de Ghieh, 2 out 2026) ──────────────────────────
// Eram 14 filtros soltos, vários fazendo quase a mesma coisa com outra régua
// (antispam e antimassspam são a mesma conta em duas velocidades) e quase
// sempre ligados juntos. Para quem configura, agora são QUATRO — cada um com
// partes que dá para ajustar ou desligar uma a uma. Por baixo, as partes
// continuam sendo os filtros de antes (a mesma config, a mesma lógica): nada
// de configuração antiga se perde.
// (P2) filtros que andam juntos com outro: ligar, desligar ou punir a `velocidade`
// (antispam) vale também para a rajada (antimassspam) — a mesma conta em outra régua.
export const FILTROS_JUNTOS = { antispam: ["antimassspam"] };
export const GRUPOS_AUTOMOD = {
  antispam: {
    emoji: "🌊", pt: "enxurrada de mensagens", en: "message floods", es: "avalancha de mensajes",
    // (P2) a `rajada` (antimassspam) é a mesma conta da `velocidade` em outra régua: uma
    // parte só, que liga, desliga e pune as duas (FILTROS_JUNTOS, acima)
    partes: { velocidade: "antispam", repeticao: "antiduplicata", midia: "antimidia", mencoes: "antimassmention" },
  },
  antiruido: {
    emoji: "🔊", pt: "texto poluído", en: "noisy text", es: "texto contaminado",
    partes: { caps: "anticaps", caracteres: "anticaracteres", letras: "antirepeticao", emoji: "antiemoji" },
  },
  antilink: {
    emoji: "🔗", pt: "links e convites", en: "links and invites", es: "enlaces e invitaciones",
    partes: { dominios: "antilink", convites: "antiinvite" },
  },
  sentinela: {
    emoji: "🛡️", pt: "conteúdo nocivo (golpe, +18, gore, ódio, imagens, temas proibidos, foto de perfil)", en: "harmful content (scams, NSFW, gore, hate, images, forbidden topics, profile pictures)",
    es: "contenido dañino (estafas, +18, gore, odio, imágenes, temas prohibidos, foto de perfil)",
    partes: { conteudo: "sentinela", odio: "antiodio", imagens: "antiimagem", assuntos: "antiassuntos", avatar: "antiavatar" },
  },
};
// Rótulos das partes (o nome que se digita é a chave; este é o que se lê)
export function estadoDoGrupo(am, grupo) {
  const partes = Object.entries(GRUPOS_AUTOMOD[grupo]?.partes ?? {});
  const ligadas = partes.filter(([, f]) => moduloLigado(am, MODULOS_AUTOMOD[f]));
  return { ligadas: ligadas.length, total: partes.length, partes: partes.map(([p, f]) => ({ parte: p, filtro: f, chave: MODULOS_AUTOMOD[f], ligada: moduloLigado(am, MODULOS_AUTOMOD[f]) })) };
}

// Ligado de verdade: os que nascem ligados contam como ligados até alguém desligar.
// Nota a partir da qual o sentinela age, por sensibilidade (+0,5 desde 12 out
// 2026 — mais suave). Um lugar só: engine, &automod sentinela, &config, ajuda.
export const LIMIAR_BASE = { baixa: 7.5, media: 6.5, alta: 5.5 };
export const limiarBase = (sens) => LIMIAR_BASE[sens] ?? LIMIAR_BASE.media;

const PADRAO_LIGADO = new Set(["antiDuplicata", "antiImagem", "antiOdio", "antiEmoji", "antiMidia", "antiAvatar"]);
export function moduloLigado(am, chave) {
  const m = am?.[chave];
  // temas: ligado = chave geral E ao menos um tema com ação
  if (chave === "antiAssuntos") return assuntos.temasAtivos(m).length > 0;
  return PADRAO_LIGADO.has(chave) ? m?.enabled !== false : !!m?.enabled;
}

let timerSilencios = null;

export function iniciarVigiaDeSilencios(ctx, intervaloMs = 60_000) {
  if (timerSilencios) clearInterval(timerSilencios);
  timerSilencios = setInterval(() => {
    liberarSilenciosVencidos(ctx).catch((e) => console.error("[PUNIÇÃO][vigia]", descreverErro(e)));
  }, intervaloMs);
  if (timerSilencios.unref) timerSilencios.unref();
  liberarSilenciosVencidos(ctx).catch(() => {});
}

export async function liberarSilenciosVencidos(ctx) {
  const vencidos = db.silenciosVencidos();
  if (!vencidos.length) return 0;
  let soltos = 0;
  for (const { serverId, userId, motivo } of vencidos) {
    try {
      const cfg = ctx.configDoServidor?.(serverId)
        ?? ctx.estado?.configDoServidor?.(serverId)
        ?? ctx.config;
      // O timeout vence sozinho no Stoat; aqui só se limpa o registro. Quem foi
      // silenciado ainda com o CARGO antigo (antes do timeout) perde o cargo.
      const roleId = cfg?.automod?.punicao?.silenceRoleId;
      if (roleId) {
        let server = null;
        try { server = await ctx.client?.servers?.fetch?.(serverId); }
        catch (e) { console.error(`[PUNIÇÃO][vigia] ${serverId}: não consegui buscar o servidor (${descreverErro(e)})`); }
        if (server) {
          try { await removerCargoSilence(server, userId, roleId, ctx); }
          catch (e) { console.warn(`[PUNIÇÃO][vigia] cargo antigo de ${userId} em ${serverId}: ${descreverErro(e)}`); }
        }
      }

      db.definirSilenciado(serverId, userId, false, motivo);
      db.silenciarAte(serverId, userId, 0, motivo);
      db.gravarPunicao(serverId, userId, {
        avisos: db.lerPunicao(serverId, userId)?.avisos ?? 0,
        silenciado: 0, motivo, silencioAte: 0,
      });
      soltos++;
      console.log(`[PUNIÇÃO] 🔊 Silêncio expirado — ${userId} liberado em ${serverId}`);
      await log.registrar({ ...ctx, serverId }, "punicoes", {
        titulo: "🔊 Silêncio expirado",
        descricao: `<@${userId}> voltou a falar — o prazo da punição terminou.\n**Motivo original:** ${motivo ?? "—"}`,
        en: { titulo: "🔊 Silence expired", descricao: `<@${userId}> can talk again — the punishment ran out.\n**Original reason:** ${motivo ?? "—"}` },
        es: { titulo: "🔊 Silencio expirado", descricao: `<@${userId}> puede volver a hablar — terminó el plazo del castigo.\n**Motivo original:** ${motivo ?? "—"}` },
      });
    } catch (e) {
      console.error(`[PUNIÇÃO][vigia] ${userId} em ${serverId}: ${descreverErro(e)}`);
    }
  }
  return soltos;
}

export function escadaDePunicao(pol = {}, { estrito = false } = {}) {
  const bruto = String(pol?.escada || ESCADA_PADRAO).split(",").map((x) => x.trim()).filter(Boolean);
  const degraus = bruto.map(interpretarDegrau).filter(Boolean);
  if (estrito && degraus.length !== bruto.length) return [];
  // (31 out 2026, Reparo) escada estragada no banco virava "aviso → ban" (ban no
  // 2º aviso!) ou perdia degraus calada. Agora: a escada padrão, e o log diz.
  if (!degraus.length || degraus.length !== bruto.length) {
    registrarErro("AUTOMOD:escada", `escada inválida na config ("${String(pol?.escada).slice(0, 60)}") — usando a padrão (${ESCADA_PADRAO})`);
    return ESCADA_PADRAO.split(",").map(interpretarDegrau);
  }
  if (degraus[degraus.length - 1].tipo !== "ban") degraus.push({ tipo: "ban" });
  return degraus;
}

function interpretarDegrau(txt) {
  const t = String(txt).toLowerCase();
  if (/^(aviso|warn|warning)$/.test(t)) return { tipo: "aviso" };
  if (/^(ban|banir)$/.test(t)) return { tipo: "ban" };
  const m = t.match(/^(\d+)\s*(s|seg|segundos?|m|min|minutos?|h|horas?|d|dias?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  const unidade = m[2][0];
  const ms = unidade === "s" ? n * 1000
    : unidade === "m" ? n * 60_000
    : unidade === "h" ? n * 3_600_000
    : n * 86_400_000;
  const rotulo = unidade === "s" ? `${n}s` : unidade === "m" ? `${n} min` : unidade === "h" ? `${n}h` : `${n}d`;
  return { tipo: "mute", ms, rotulo };
}

export function rotuloDegrau(degrau, lang = "pt") {
  if (lang === "es") {
    if (!degrau) return "nada más";
    if (degrau.tipo === "aviso") return "aviso";
    if (degrau.tipo === "ban") return "ban";
    return `silencio de ${degrau.rotulo}`;
  }
  if (!degrau) return lang === "en" ? "nothing further" : "nada além disso";
  if (degrau.tipo === "aviso") return lang === "en" ? "warning" : "aviso";
  if (degrau.tipo === "ban") return lang === "en" ? "ban" : "ban";
  return lang === "en" ? `${degrau.rotulo} of silence` : `silêncio de ${degrau.rotulo}`;
}

// opts.soConteudo (15 out 2026): só os filtros de CONTEÚDO — para comandos e
// mensagens editadas. Antes, `&ping <convite>` e `&help <12 menções>` passavam
// por fora do automod, e editar uma mensagem inocente para um golpe também.
// Os filtros de ritmo (spam, rajada de mídia, repetição) ficam de fora: dez
// comandos seguidos não são flood, e uma edição não é mensagem nova.
// (31 out 2026, R10) uma falha aqui dentro (config ruim vinda do banco, API fora)
// não pode derrubar o processamento da mensagem — antes, `repeticao 1.5` lançava
// exceção em TODA mensagem e os comandos de quem não é staff morriam junto.
export async function runAutomod(message, ctx, opts = {}) {
  try {
    return await analisarMensagem(message, ctx, opts);
  } catch (e) {
    registrarErro("AUTOMOD", e);
    return false;
  }
}

async function analisarMensagem(message, ctx, opts = {}) {
  const soConteudo = opts.soConteudo === true;
  const { config, estado, getServer } = ctx;
  const userId  = message.authorId;
  const content = String(message.content ?? "").normalize("NFC");
  const am = config.automod;

  dbg(ctx, "────────────────────────────────────────────");
  // (31 out 2026, R9) o conteúdo da mensagem NUNCA vai para o log
  dbg(ctx, `▶ Analisando mensagem de ${userId} (${content.length} caractere(s))`);

  // O fio do canal para o juiz dos temas proibidos (inclui a fala da staff,
  // que sai do automod logo abaixo — ela também faz parte da conversa).
  if (!soConteudo && assuntos.temasAtivos(am?.antiAssuntos).length) {
    assuntos.anotar(message.channelId, { id: message.id, autor: userId, texto: content });
  }

  let server;
  try {
    server = await getServer(message);
  } catch (err) {
    dbg(ctx, `  ✗ Não foi possível resolver o servidor (${err.message}) — pulando automod`);
    return false;
  }

  const canal = await resolverCanal(message, ctx);

  // ── IDs de outro servidor (herdados do molde antigo) saem antes de tudo ──
  if (curarIds(config, server).length) ctx.salvarConfig?.();

  // ── Quem modera não é moderado ──
  // Dono do servidor, super admin e os cargos do `&staff`/`&acesso` (tudo que
  // o membroTemPermissao reconhece como ManageMessages) passam direto. Antes
  // ninguém era isento: o dono de um servidor foi silenciado por 2h no
  // próprio servidor ao divulgar o próprio link. `isentarStaff: false` na
  // config do automod desliga a isenção, para testar os filtros em si mesmo.
  // Bots (contas de bot de verdade, que só entram adicionados pela staff) não
  // são moderados: o card de outro bot de moderação repetido não é spam.
  if (message.author?.bot) {
    dbg(ctx, "  ✓ Autor é um bot — automod não se aplica");
    return false;
  }
  if (am.isentarStaff !== false && ctx.membroTemPermissao?.(message, server, "ManageMessages")) {
    dbg(ctx, "  ✓ Autor é da staff (ou dono/super admin) — automod não se aplica");
    return false;
  }

  // ── Quarentena: a punição falhou antes; tudo desta pessoa é apagado ──
  // (só com algum filtro ligado: "automod off" é off de verdade)
  if (algumFiltroLigado(am) && confianca.emQuarentena(ctx.serverId ?? server?.id, userId)) {
    dbg(ctx, "  ✗ Autor em quarentena (punição anterior falhou) — apagando");
    try { await message.delete(); } catch (err) { dbg(ctx, `  (falha ao deletar: ${err.message})`); }
    return true;
  }

  const sid = ctx.serverId ?? server?.id;
  const barrar = async (pol, motivo, rotulo) => {
    dbg(ctx, `  ✗ BLOQUEADA por ${rotulo}`);
    // quem apaga é o aplicarPunicao, uma vez só (15 out 2026: antes apagava
    // aqui E lá). Regra fixa apaga até no modo avisar — e agora o aviso diz isso.
    await aplicarPunicao(ctx, { server, channel: canal, message, userId, pol, motivo, regraFixa: true });
    return true;
  };

  // Filtros de ruído: a primeira vez é só um toque (ver primeiroToque).
  const novato = confianca.contaNova(sid, userId);
  const raid = confianca.emModoRaid(sid);
  const punirRuido = async (pol, motivo, rotulo) => {
    dbg(ctx, `  ✗ BLOQUEADA por ${rotulo}`);
    if (modoEfetivo(config, pol) === "acumular" && primeiroToque(sid, userId, { novato, raid })) {
      dbg(ctx, "  → primeiro toque: apaga e explica, sem contar aviso");
      await darToque(ctx, { server, channel: canal, message, userId, motivo });
      return true;
    }
    await aplicarPunicao(ctx, { server, channel: canal, message, userId, pol, motivo, ruido: true, regraFixa: true });
    return true;
  };

  // ── Termos de ódio (2 out 2026: a ofensa racial passou por todos os filtros) ──
  if (am.antiOdio?.enabled !== false) {
    const termo = rajada.acharOdio(content, am.antiOdio?.termos ?? []);
    dbg(ctx, `  [anti-ódio] ${termo ? "ACHOU termo da lista" : "nada"}`);
    // o termo não vai para o motivo: a punição é publicada no canal
    if (termo) return barrar(am.antiOdio?.punicao, "linguagem de ódio não é tolerada aqui", "anti-ódio");
  }

  // ── Enxurrada de emoji (o ataque colava ~170 emojis por mensagem) ──
  if (am.antiEmoji?.enabled !== false) {
    // "quase só emoji" (10+ e 70% da mensagem) só para conta nova: "😭" ×10
    // é reação normal de quem já está no servidor.
    const maxE = am.antiEmoji?.maxEmojis ?? 20;
    const e = rajada.enxurradaDeEmoji(content, { max: maxE, minimo: novato ? 10 : maxE });
    dbg(ctx, `  [anti-emoji] ${rajada.contarEmojis(content)} emoji(s)${e ? " — ENXURRADA" : ""}`);
    if (e) return punirRuido(am.antiEmoji?.punicao, `muitos emojis numa mensagem só (${e.n})`, "anti-emoji");
  }

  // ── Rajada de mídia: muitos anexos em pouco tempo, somando TODOS os canais ──
  // A conta de 2 minutos repostou a mesma bandeira em #RSS e #Midia sem parar.
  // Conta nova tem limite menor.
  const anexos = (message.attachments ?? []).length;
  if (!soConteudo && anexos && am.antiMidia?.enabled !== false) {
    estado.midiaData ??= new Map();
    const n = rajada.contarMidias(estado.midiaData, `${sid}:${userId}`, anexos);
    const max = novato ? (am.antiMidia?.maxNovato ?? 3) : (am.antiMidia?.maxPorMinuto ?? 8);
    dbg(ctx, `  [anti-mídia] ${n} anexo(s) no último minuto (máx. ${max}${novato ? ", conta nova" : ""})`);
    if (n > max) return punirRuido(am.antiMidia?.punicao, `muitas imagens/arquivos em pouco tempo (${n} em 1 min)`, "anti-mídia");
  }

  // ── Quantas vezes esta MESMA mensagem já veio deste autor ──
  // Fica aqui em cima porque o sentinela usa este número: uma mensagem
  // repetida pesa na nota dele, mesmo quando o texto em si é inofensivo.
  const dup = am.antiDuplicata ?? {};
  let repetidas = 1, registrarDigital = null, anterioresDigitais = [];
  if (!soConteudo && dup.enabled !== false) {
    const agora = Date.now();
    const janela = dup.windowMs ?? 120_000;
    const chaveEco = `${ctx.serverId ?? server?.id ?? "?"}:${userId}`;
    const recentes = (estado.ecoData?.get(chaveEco) ?? []).filter((x) => agora - x.t < janela);
    // texto, ou — mensagem só com anexo — a digital da mídia (tamanho + dimensões):
    // antes a mesma imagem repostada nunca contava como repetição
    const d = digital(content) ?? rajada.digitalMidia(message);
    if (d) {
      anterioresDigitais = recentes.map((x) => x.d);
      repetidas = recentes.filter((x) => x.d === d).length + 1;
      // Só registra se a mensagem SOBREVIVER às regras abaixo: uma mensagem
      // apagada por outro motivo não deve contar como repetição depois.
      registrarDigital = () => {
        recentes.push({ d, t: agora });
        estado.ecoData?.set(chaveEco, recentes.slice(-40));
      };
    } else if (estado.ecoData) {
      estado.ecoData.set(chaveEco, recentes);
    }
  }

  // ── Anti-invite (respeita a whitelist de códigos e os canais de divulgação) ──
  if (am.antiInvite.enabled && (am.antiInvite.canaisLiberados ?? []).includes(message.channelId)) {
    dbg(ctx, "  [anti-invite] canal liberado para convites — não se aplica aqui");
  } else if (am.antiInvite.enabled) {
    const codigos = codigosDeConvite(content);
    dbg(ctx, `  [anti-invite] ON → ${codigos.length} convite(s)`);
    if (codigos.length > 0) {
      const naoPermitidos = codigos.filter((c) => !config.inviteWhitelist.includes(c.toLowerCase()));
      dbg(ctx, `  [anti-invite] ${naoPermitidos.length} fora da lista de permitidos`);
      if (naoPermitidos.length > 0) {
        // (P2) convite e link bloqueado seguem a MESMA rota de punição (regra fixa)
        return barrar(am.antiInvite.punicao, "não é permitido enviar convites neste servidor", "anti-invite");
      }
    }
  } else {
    dbg(ctx, "  [anti-invite] OFF");
  }

  // ── Conteúdo proibido (scorecard único: golpe/+18/gore/ilícito/CSAM) ──
  if (am.antiScam?.enabled) {
    const rate = taxaPorSegundo(estado, userId, ctx.serverId ?? server?.id);
    const r = analisarConteudo(content, { rate, repetidas });
    // +0,5 em cada sensibilidade desde 12 out 2026 (mais suave)
    const base = limiarBase(am.antiScam.sensitivity);

    const { limiar, faixa, nivel } = confianca.limiarPara(
      ctx.serverId ?? server?.id, userId, base,
      { ativo: am.antiScam.porAntiguidade !== false,
        xpAtivo: config.xp?.enabled === true,
        entrouEm: message.member?.joinedAt ?? null },
    );
    dbg(ctx, `  [sentinela] ON → nota ${r.nota.toFixed(1)}/10 (limiar ${limiar}`
      + `${faixa ? `, ${faixa.rotulo}${nivel != null ? ` nv${nivel}` : " (tempo no servidor)"}` : ""})${r.grave ? " GRAVE" : ""}`
      + ` sinais: [${r.sinais.join(", ") || "nenhum"}]`);

    // Padrão de dano: soma por pessoa, alerta a staff, nunca pune (confianca.js)
    if (r.dano?.soma > 0 && am.antiScam.alertarAdmin !== false) {
      const p = confianca.registrarDano(ctx.serverId ?? server?.id, userId, r.dano, content);
      dbg(ctx, `  [sentinela/dano] +${r.dano.soma} (${r.dano.categorias.join(",")}) → acumulado ${p.soma?.toFixed?.(1) ?? "?"}`);
      if (p.alertar) await alertarPadraoDano(ctx, { server, userId, p });
    }

    if (r.nota >= Math.max(3, limiar - 2) && am.antiScam.alertarAdmin !== false) {
      const sinal = confianca.registrarSinal(ctx.serverId ?? server?.id, userId,
        { nota: r.nota, sinais: r.sinais });
      if (sinal.alertar) {
        await alertarAdministracao(ctx, {
          server, canal, userId, sinal, faixa, nivel, nota: r.nota,
        });
      }
    }

    if (r.nota >= limiar) {
      dbg(ctx, `  ✗ CONTEÚDO PROIBIDO (nota ${r.nota.toFixed(1)} ≥ ${limiar})`);
      await aplicarPunicao(ctx, { server, channel: canal, message, userId,
        pol: am.antiScam.punicao, motivo: "conteúdo proibido detectado", nota: r.nota, grave: r.grave });
      return true;
    }
  } else {
    dbg(ctx, "  [conteúdo] OFF");
  }

  // ── Anti-link (listas estilo Pi-hole) ──
  if (am.antiLink.enabled) {
    const dominios = extrairDominios(content);
    dbg(ctx, `  [anti-link] ON → lista tem ${estado.blockedDomains.size} domínio(s)`);
    dbg(ctx, `  [anti-link] ${dominios.length} domínio(s) na mensagem`);

    if (estado.blockedDomains.size === 0) {
      dbg(ctx, "  [anti-link] ⚠️ lista VAZIA — adicione com " + citarInterno("automod") + " blocklist add <url> ou " + citarInterno("automod") + " blocklist adddomain <domínio>");
    }

    const permitidos = new Set(config.dominiosPermitidos ?? []);
    // Permitido vence a lista (vale para o domínio e seus subdomínios).
    const bloqueado = dominios.find((d) =>
      !nuncaBloquear(d) && !dominioBloqueado(d, permitidos) && dominioBloqueado(d, estado.blockedDomains));
    if (bloqueado) {
      return barrar(am.antiLink.punicao, "este link está em uma lista de bloqueio do servidor", "anti-link");
    } else if (dominios.length > 0) {
      dbg(ctx, "  [anti-link] nenhum domínio da mensagem está na lista");
    }
  } else {
    dbg(ctx, "  [anti-link] OFF");
  }

  // ── Anti-mass-mention ──
  if (am.antiMassMention.enabled) {
    const unicas = new Set((message.mentionIds ?? []).filter((id) => id && id !== userId));
    const n = unicas.size;
    dbg(ctx, `  [anti-mass-mention] ON → ${n} menção(ões) (limite ${am.antiMassMention.maxMentions})`);
    if (n > am.antiMassMention.maxMentions) {
      return punirRuido(am.antiMassMention.punicao, `você mencionou ${n} usuários diferentes de uma só vez`, "anti-mass-mention");
    }
  } else {
    dbg(ctx, "  [anti-mass-mention] OFF");
  }

  const textoEstilo = textoHumano(content);
  if (am.antiCaps.enabled && textoEstilo.length >= am.antiCaps.minLength) {
    // Siglas curtas ficam fora da conta; `null` = texto insuficiente.
    const ratio = razaoDeCaixaAlta(textoEstilo);
    if (ratio !== null) {
      dbg(ctx, `  [anti-caps] ON → ${(ratio * 100).toFixed(0)}% maiúsculas (limite ${(am.antiCaps.threshold * 100).toFixed(0)}%)`);
      if (ratio >= am.antiCaps.threshold) {
        return punirRuido(am.antiCaps.punicao, "evite escrever em CAIXA ALTA em excesso", "anti-caps");
      }
    }
  } else if (am.antiCaps.enabled) {
    dbg(ctx, `  [anti-caps] ON → pouco texto digitado (<${am.antiCaps.minLength} após remover menções/links), ignorada`);
  } else {
    dbg(ctx, "  [anti-caps] OFF");
  }

  // ── Anti-caracteres (zalgo, invisíveis) ──
  if (am.antiCaracteres?.enabled) {
    const r = analisarCaracteres(content, {
      limiteZalgo:  am.antiCaracteres.limiteZalgo ?? 0.6,
    });
    dbg(ctx, `  [anti-caracteres] ON → ${r ? "detectado: " + r.tipo : "ok"}`);
    if (r) {
      return punirRuido(am.antiCaracteres.punicao, r.motivo, `anti-caracteres (${r.tipo})`);
    }
  } else {
    dbg(ctx, "  [anti-caracteres] OFF");
  }

  if (am.antiRepeticao?.enabled) {
    const r = analisarRepeticao(textoEstilo, {
      maxRepeticao: am.antiRepeticao.maxRepeticao ?? 15,
      ignorar:      am.antiRepeticao.ignorar ?? "k",
    });
    dbg(ctx, `  [anti-repeticao] ON → ${r ? "detectado" : "ok"} (ignora "${am.antiRepeticao.ignorar ?? "k"}")`);
    if (r) {
      return punirRuido(am.antiRepeticao.punicao, r.motivo, "anti-repeticao");
    }
  } else {
    dbg(ctx, "  [anti-repeticao] OFF");
  }

  // ── Anti-duplicata: a mesma mensagem, de novo e de novo ──
  // O anti-spam abaixo mede VELOCIDADE (N mensagens em X segundos). Quem
  // repete o mesmo texto num ritmo calmo passava por ele e por todo o resto.
  if (!soConteudo && dup.enabled !== false) {
    // Conta nova repete 2× e já é pega (no raid, as contas tinham minutos de vida).
    const limiteDup = novato ? Math.max(2, (dup.maxRepetidas ?? 3) - 1) : (dup.maxRepetidas ?? 3);
    const r = analisarDuplicata(content, anterioresDigitais, { maxRepetidas: limiteDup });
    dbg(ctx, `  [anti-duplicata] ON → ${repetidas}ª vez desta mensagem (limite ${limiteDup})`);
    if (r) {
      return punirRuido(dup.punicao, r.motivo, "anti-duplicata");
    }
  } else {
    dbg(ctx, "  [anti-duplicata] OFF");
  }

  // ── Anti-spam / Anti-mass-spam ──
  if (!soConteudo && (am.antiSpam.enabled || am.antiMassSpam.enabled)) {
    const now = Date.now();
    const maxWindow = Math.max(am.antiSpam.windowMs, am.antiMassSpam.windowMs);
    const chaveSpam = `${ctx.serverId ?? server?.id ?? "?"}:${userId}`;
    const prev = (estado.spamData.get(chaveSpam) ?? []).filter((t) => now - t < maxWindow);
    prev.push(now);
    estado.spamData.set(chaveSpam, prev);

    if (am.antiMassSpam.enabled) {
      const c = prev.filter((t) => now - t < am.antiMassSpam.windowMs).length;
      dbg(ctx, `  [anti-mass-spam] ON → ${c} msg em ${am.antiMassSpam.windowMs}ms (limite ${am.antiMassSpam.maxMessages})`);
      if (c >= am.antiMassSpam.maxMessages) {
        dbg(ctx, "  ✗ BLOQUEADA por anti-mass-spam");
        estado.spamData.delete(chaveSpam);
        await aplicarPunicao(ctx, { server, channel: canal, message, userId,
          pol: am.antiMassSpam.punicao, motivo: "flood de mensagens (mass spam)" });
        return true;
      }
    }

    if (am.antiSpam.enabled) {
      const c = prev.filter((t) => now - t < am.antiSpam.windowMs).length;
      dbg(ctx, `  [anti-spam] ON → ${c} msg em ${am.antiSpam.windowMs}ms (limite ${am.antiSpam.maxMessages})`);
      if (c >= am.antiSpam.maxMessages) {
        estado.spamData.set(chaveSpam, []);
        return punirRuido(am.antiSpam.punicao, "você está enviando mensagens muito rapidamente", "anti-spam");
      }
    }
  } else {
    dbg(ctx, "  [anti-spam/mass-spam] OFF");
  }

  registrarDigital?.();

  // ── Imagens: descritas pelo modelo e pontuadas em segundo plano ──
  // Não segura a mensagem nem pune: se apitar, a staff é chamada no log.
  // (No raid de 27/09 as mensagens "vazias" eram imagens que ninguém viu.)
  // Fica no FIM: o que já foi barrado não ocupa a fila do modelo.
  if (!soConteudo && imagemSentinela.deveAnalisar(config, sid, userId)) {
    for (const img of imagemSentinela.imagensDa(message)) {
      imagemSentinela.agendar({ ctx, userId, canalId: message.channelId, messageId: message.id, url: img.url, digital: img.digital });
    }
  }

  // ── Temas proibidos pela regra do servidor (13 out 2026) ──
  // Nota por peso (termos, debate, ataque, risada, contexto do canal); passou
  // do limiar, o modelo lê o fio e confirma se é discussão ou zoeira. Em
  // segundo plano: a mensagem não espera. Fica no FIM (15 out 2026): antes
  // rodava antes dos outros filtros, e a mesma mensagem levava dois avisos —
  // um do tema e outro do caps/link/etc.
  if (!soConteudo && assuntos.temasAtivos(am.antiAssuntos).length) {
    const p = assuntos.verificar({ ctx, server, canal, message, userId,
      aplicarPunicao: (opts) => aplicarPunicao(ctx, opts) });
    ultimaVerificacaoDeAssunto = p;
    p.catch((e) => console.error("[ASSUNTOS]", descreverErro(e)));
  }

  dbg(ctx, "  ✓ Nenhuma violação detectada");
  return false;
}

// Algum filtro do automod ligado? (a quarentena só vale com algum)
export function algumFiltroLigado(am) {
  if (!am) return false;
  return Object.values(MODULOS_AUTOMOD).some((chave) => chave !== "antiAvatar" && moduloLigado(am, chave));
}

export { descreverErro, tipoDoErro, normalizarErro } from "../core/erros.js";

export async function reaplicarPunicao(member, ctx) {
  const serverId = member?.id?.server;
  const userId   = member?.id?.user;
  if (!serverId || !userId) return false;

  if (!db.estaSilenciado(serverId, userId)) return false;

  // Sair e voltar zera o timeout (é um campo do membro): reaplica pelo que falta.
  const reg = db.lerPunicao(serverId, userId);
  const falta = Number(reg?.silencioAte ?? 0) > 0 ? Number(reg.silencioAte) - Date.now() : CONFIRMAR_MS();
  if (falta <= 0) return false;

  try {
    const server = member.server ?? await ctx.client?.servers?.fetch?.(serverId);
    await aplicarTimeout(server, userId, falta);
    console.log(`[PUNIÇÃO] ↩ Silêncio (timeout) REAPLICADO a ${userId} ao reentrar em ${serverId}`);

    const motivo = db.lerPunicao(serverId, userId)?.motivo ?? null;
    await log.registrar(ctx, "punicoes", {
      titulo: "↩ Punição reaplicada",
      descricao: `<@${userId}> saiu e voltou ao servidor — o silêncio foi **reaplicado**.\n**Motivo original:** ${motivo ?? "punição ativa"}`,
      en: { titulo: "↩ Punishment reapplied", descricao: `<@${userId}> left and rejoined — the silence was **reapplied**.\n**Original reason:** ${motivo ?? "active punishment"}` },
      es: { titulo: "↩ Castigo reaplicado", descricao: `<@${userId}> salió y volvió al servidor — el silencio se **reaplicó**.\n**Motivo original:** ${motivo ?? "castigo activo"}` },
    });
    return true;
  } catch (err) {
    console.error("[PUNIÇÃO][REAPLICAR]", descreverErro(err));
    return false;
  }
}

// Remove o cargo de silêncio de um usuário
export async function removerCargoSilence(server, userId, roleId, ctx) {
  let member;
  try { member = await server.fetchMember(userId); }
  catch (e) {
    if (tipoDoErro(e) === "NotFound") return { saiu: true };
    throw e;
  }
  if (!member) return { saiu: true };

  const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
  if (!atuais.includes(roleId)) return { jaEstavaSemCargo: true };

  await editarCargos(server, member, (a) => a.filter((id) => id !== roleId));

  try {
    const depois = await server.fetchMember(userId);
    const aindaTem = (depois?.roles ?? []).map((r) => r?.id ?? r).includes(roleId);
    if (aindaTem) throw new Error("a API aceitou mas o cargo continua — confira se o cargo do bot está ACIMA do cargo de silêncio e se ele tem AssignRoles");
  } catch (e) {
    if (/continua/.test(e?.message ?? "")) throw e;   // erro real; o resto é falha ao reconferir
  }
  return { removido: true };
}
// Só para testes: a checagem de tema da última mensagem (roda em segundo plano).
let ultimaVerificacaoDeAssunto = null;
export const _ultimaVerificacaoDeAssunto = () => ultimaVerificacaoDeAssunto;
// Só para testes: a punição inteira, sem passar pelo detector.
export const _aplicarPunicao = aplicarPunicao;
// Só para testes: os dois avisos à staff do sentinela (padrão de dano e possível ameaça).
export const _alertarPadraoDano = alertarPadraoDano;
export const _alertarAdministracao = alertarAdministracao;
