// ══════════════════════════════════════════════════════════
//  automod-engine.js — LÓGICA PESADA do AutoMod
//  Motor de análise: detecção (golpe/CSAM/+18/gore), listas de
//  bloqueio (Pi-hole), rastreio de spam, punições e o runAutomod.
//  Não contém comandos — só o "trabalho pesado".
//  Recebe tudo pelo objeto de contexto `ctx` (sem imports do main).
// ══════════════════════════════════════════════════════════

import { analisarConteudo } from "./scorecard.js";
import * as db  from "../core/db.js";
import * as log from "../core/log.js";
import * as banGlobal from "./ban-global.js";
import * as confianca from "./confianca.js";
import { analisarCaracteres, analisarRepeticao } from "./caracteres.js";
import { lingua } from "../core/i18n.js";

const INVITE_REGEX = /https?:\/\/stt\.gg\/([A-Za-z0-9]+)/gi;

// Logger de depuração — só imprime se config.debug !== false
function dbg(ctx, ...args) {
  if (ctx?.cfgGlobal?.debug !== false) console.log("[AUTOMOD]", ...args);
}

// Validação simples de domínio (ex.: 02giga.link, sub.exemplo.com.br)
export const DOMINIO_VALIDO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
// ──────────────────────────────────────────────────────────
//  Listas de bloqueio (estilo Pi-hole / hosts / AdBlock)
// ──────────────────────────────────────────────────────────

// Converte o texto bruto de uma lista em um array de domínios
export function parseBlocklist(text) {
  const domains = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#") || line.startsWith("!") || line.startsWith("[")) continue;

    // formato hosts: "0.0.0.0 dominio.com" / "127.0.0.1 dominio.com"
    const parts = line.split(/\s+/);
    let domain = parts.length > 1 ? parts[1] : parts[0];

    domain = domain.toLowerCase()
      .replace(/^\*\./, "")      // remove curinga "*."
      .replace(/^\|\|/, "")      // formato AdBlock "||dominio^"
      .replace(/[\^|].*$/, "");  // remove sufixos AdBlock

    if (DOMINIO_VALIDO.test(domain)) domains.push(domain);
  }
  return domains;
}

// Reconstrói o conjunto de domínios bloqueados a partir das fontes + manuais
export async function rebuildBlocklist(ctx) {
  const { cfgGlobal, estado } = ctx;
  const novo = new Set();

  for (const d of cfgGlobal.linkBlocklistManual) novo.add(d.toLowerCase());
  dbg(ctx, `[BLOCKLIST] ${cfgGlobal.linkBlocklistManual.length} domínio(s) manual(is) carregado(s)`);

  for (const url of cfgGlobal.linkBlocklistSources) {
    try {
      dbg(ctx, `[BLOCKLIST] Baixando ${url} …`);
      const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      const doms = parseBlocklist(text);
      for (const d of doms) novo.add(d);
      console.info(`[BLOCKLIST] ${doms.length} domínios de ${url}`);
    } catch (err) {
      console.error(`[BLOCKLIST] Falha ao buscar ${url}:`, err.message);
    }
  }

  estado.blockedDomains = novo;
  console.info(`[BLOCKLIST] Total de domínios bloqueados: ${estado.blockedDomains.size}`);
}

// Extrai todos os domínios presentes numa mensagem.
// AGORA reconhece links COM e SEM esquema (http/https), com ou sem
// "www.", com caminho/query, e remove pontuação ao redor.
//   "02giga.link"                  → 02giga.link
//   "https://02giga.link/abc?x=1"  → 02giga.link
//   "(www.02giga.link)!"           → 02giga.link
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

// Resolve o canal da mensagem de forma robusta (antes de qualquer delete).
// Tenta a referência direta e, se faltar, busca pelo channelId.
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

// ──────────────────────────────────────────────────────────
//  Limpeza periódica do rastreio de spam
// ──────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────
//  Taxa de mensagens por segundo de um autor (feature do scorecard)
// ──────────────────────────────────────────────────────────
function taxaPorSegundo(estado, userId) {
  const now = Date.now();
  const ts = estado.spamData.get(userId) ?? [];
  return ts.filter((t) => now - t < 1000).length + 1; // +1 conta a atual
}

// ──────────────────────────────────────────────────────────
//  PUNIÇÃO — política GLOBAL (config.automod.punicao), usada por
//  TODOS os automods. Modos: avisar | confirmar | acumular | banir.
//  opts: { server, channel, message, userId, motivo, apagar?, nota?, grave? }
// ──────────────────────────────────────────────────────────
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
    ? `\n**${lang === "en" ? "Score" : "Nota"}:** ${nota.toFixed(1)}/10` : "";
  const blocoGrave = grave ? [
    "",
    lang === "en"
      ? "🚨 **Serious content.** Preserve evidence (the user's ID) and report it to the platform/authorities — child abuse: report.cybertip.org."
      : "🚨 **Conteúdo grave.** Preserve evidências (ID do usuário) e denuncie à plataforma/autoridades — no Brasil: SaferNet + Polícia Federal; abuso infantil: report.cybertip.org.",
  ] : [];

  // ── avisar: só notifica, não apaga, não pune ──
  if (pol.modo === "avisar") {
    await sendEmbed(channel, {
      title: grave
        ? (lang === "en" ? "🚨 Detection (warning only)" : "🚨 Detecção (somente aviso)")
        : (lang === "en" ? "👁 AutoMod notice" : "👁 Aviso do AutoMod"),
      description: [`<@${userId}> — ${motivo}${linhaNota}`,
        lang === "en"
          ? "_Warn-only mode: nothing was removed or punished automatically._"
          : "_Modo apenas-aviso: nada foi removido ou punido automaticamente._",
        ...blocoGrave].join("\n"),
      colour: grave ? COR.erro : COR.aviso,
    });
    return;
  }

  // demais modos removem a mensagem ofensora
  if (apagar && message) { try { await message.delete(); } catch (e) { console.error("[PUNIÇÃO][DEL]", e.message); } }

  // ── apagar: só remove a mensagem, sem punir o usuário ──
  if (pol.modo === "apagar") {
    await sendEmbed(channel, {
      title: lang === "en" ? "🧹 Message removed" : "🧹 Mensagem removida",
      description: [`<@${userId}> — ${motivo}${linhaNota}`,
        lang === "en"
          ? "_The message was deleted. No punishment applied to the user._"
          : "_A mensagem foi apagada. Nenhuma punição aplicada ao usuário._",
        ...blocoGrave].join("\n"),
      colour: COR.mod,
    });
    await log.registrar(ctx, "punicoes", { titulo: "🧹 Mensagem removida (automod)",
      descricao: `<@${userId}> — ${motivo}` });
    return;
  }

  // ── banir: ban imediato ──
  if (pol.modo === "banir") {
    let acao = lang === "en" ? "message removed" : "mensagem removida";
    try {
      await server.banUser(userId, { reason: `[AutoMod] ${motivo}` });
      acao = lang === "en" ? "🔨 user BANNED" : "🔨 usuário BANIDO";
      banGlobal.registrar(ctx, userId, motivo, "automod");   // alimenta a lista global
    }
    catch (e) { console.error("[PUNIÇÃO][BAN]", e.message);
      acao = lang === "en" ? `failed to ban (${e.message})` : `falha ao banir (${e.message})`; }
    await sendEmbed(channel, { title: lang === "en" ? "🔨 Instant ban" : "🔨 Banimento imediato",
      description: [`<@${userId}> — ${motivo}${linhaNota}`,
        `**${lang === "en" ? "Action" : "Ação"}:** ${acao}`, ...blocoGrave].join("\n"),
      colour: COR.erro });
    await log.registrar(ctx, "punicoes", { titulo: "🔨 Banimento imediato",
      descricao: `<@${userId}> — ${acao}.\n**Motivo:** ${motivo}` });
    return;
  }

  // ── confirmar: silencia (se houver cargo) e pede confirmação ──
  if (pol.modo === "confirmar") {
    let acao = lang === "en" ? "message removed" : "mensagem removida";
    if (pol.silenceRoleId) {
      try {
        await aplicarCargoSilence(server, userId, pol.silenceRoleId, ctx);
        acao = lang === "en" ? "user silenced" : "usuário silenciado";
        // A permissão do canal e o rank dos cargos vencem o cargo de silêncio.
        // Se a pessoa tem cargo acima que libera falar, avisamos AGORA — senão
        // você só descobre quando ela continuar conversando normalmente.
        try {
          const perms = await import("./permissoes.js");
          const membro = await server.fetchMember(userId).catch(() => null);
          const c = membro ? perms.conflitosDeSilencio(server, membro, pol.silenceRoleId) : null;
          if (c?.conflitantes?.length) {
            acao = lang === "en"
              ? `silenced, but **the silence likely won't work** (role(s) above: ${c.conflitantes.map((x) => x.nome).join(", ")})`
              : `silenciado, mas **o silêncio não deve funcionar** (cargo(s) acima: ${c.conflitantes.map((x) => x.nome).join(", ")})`;
            console.log(`[PUNIÇÃO][SILENCE] ⚠️ ${userId} tem cargo acima do silêncio: ${c.conflitantes.map((x) => x.nome).join(", ")}`);
          }
        } catch {}
        // Marca no banco: se ele sair e voltar, o cargo é REAPLICADO.
        db.definirSilenciado(ctx.serverId ?? server?.id, userId, true, motivo);
      }
      catch (e) { console.error("[PUNIÇÃO][SILENCE]", e.message);
        acao = lang === "en" ? `failed to silence (${e.message})` : `falha ao silenciar (${e.message})`; }
    }
    await sendEmbed(channel, {
      title: lang === "en" ? "⚠️ Violation — confirmation needed" : "⚠️ Violação — confirmação necessária",
      description: [`<@${userId}> — ${motivo}${linhaNota}`,
        `**${lang === "en" ? "Action" : "Ação"}:** ${acao}`,
        lang === "en"
          ? `Confirm the ban with \`${PREFIXO}scam ban ${userId}\` or release with \`${PREFIXO}scam dismiss ${userId}\`.`
          : `Confirme o ban com \`${PREFIXO}scam ban ${userId}\` ou libere com \`${PREFIXO}scam dismiss ${userId}\`.`,
        ...blocoGrave].join("\n"),
      colour: COR.mod,
    });
    await log.registrar(ctx, "punicoes", { titulo: "⚠️ Violação — aguardando confirmação",
      descricao: `<@${userId}> — ${acao}.\n**Motivo:** ${motivo}` });
    return;
  }

  // ── acumular: escada progressiva ──
  //
  // Antes eram N avisos e, no limite, ban — do nada. Isso pune igual quem
  // errou uma vez e quem está claramente atacando o servidor, e dá ao membro
  // comum um susto desproporcional na única punição que ele vê.
  //
  // A escada dá peso crescente e, principalmente, dá CHANCE: aviso → 5 min →
  // 1 hora → ban. Quem parou no primeiro degrau nunca chega ao último; quem
  // insiste sobe sozinho.
  //
  // Os avisos ficam no BANCO, por (servidor, usuário): sobrevivem a restart do
  // bot e a sair/reentrar no servidor.
  const sid   = ctx.serverId ?? server?.id;
  const count = db.somarAviso(sid, userId, motivo);
  const degraus = escadaDePunicao(pol);
  // Passou do último degrau definido? Fica no último (que é o ban).
  const degrau = degraus[Math.min(count, degraus.length) - 1];
  console.log(`[AUTOMOD] ⚠️ Aviso #${count} para ${userId} → ${degrau.tipo} — ${motivo}`);

  if (degrau.tipo === "aviso") {
    await sendEmbed(channel, { title: lang === "en" ? "⚠️ AutoMod warning" : "⚠️ Aviso do AutoMod",
      description: [
        lang === "en"
          ? `<@${userId}> — ${motivo} *(warning ${count})*${linhaNota}`
          : `<@${userId}> — ${motivo} *(aviso ${count})*${linhaNota}`,
        lang === "en"
          ? `_Next step: ${rotuloDegrau(degraus[count], "en")}._`
          : `_Próximo passo: ${rotuloDegrau(degraus[count], "pt")}._`,
        ...blocoGrave].join("\n"),
      colour: COR.aviso });
    await log.registrar(ctx, "punicoes", { titulo: "⚠️ Aviso aplicado",
      descricao: `<@${userId}> recebeu o aviso **${count}**.\n**Motivo:** ${motivo}` });
    return;
  }

  if (degrau.tipo === "mute") {
    const ate = Date.now() + degrau.ms;
    let acao = lang === "en" ? `silenced for ${degrau.rotulo}` : `silenciado por ${degrau.rotulo}`;
    if (pol.silenceRoleId) {
      try {
        await aplicarCargoSilence(server, userId, pol.silenceRoleId, ctx);
        db.silenciarAte(sid, userId, ate, motivo);
      } catch (e) {
        console.error("[PUNIÇÃO][MUTE]", e.message);
        acao = lang === "en" ? `failed to silence (${e.message})` : `falha ao silenciar (${e.message})`;
      }
    } else {
      // Sem cargo configurado o degrau não tem como ser cumprido. Dizer isso é
      // melhor do que fingir que puniu.
      acao = lang === "en"
        ? "would be silenced, but there is no silence role configured"
        : "seria silenciado, mas não há cargo de silêncio configurado";
    }
    await sendEmbed(channel, { title: lang === "en" ? "🔇 Temporary silence" : "🔇 Silêncio temporário",
      description: [
        `<@${userId}> — ${acao}. *(${lang === "en" ? "warning" : "aviso"} ${count})*`,
        `**${lang === "en" ? "Reason" : "Motivo"}:** ${motivo}${linhaNota}`,
        degraus[count]
          ? (lang === "en" ? `_Next step: ${rotuloDegrau(degraus[count], "en")}._`
                           : `_Próximo passo: ${rotuloDegrau(degraus[count], "pt")}._`)
          : null,
        ...blocoGrave].filter(Boolean).join("\n"),
      colour: COR.mod });
    await log.registrar(ctx, "punicoes", { titulo: "🔇 Silêncio temporário",
      descricao: `<@${userId}> silenciado por **${degrau.rotulo}** (aviso ${count}).\n**Motivo:** ${motivo}` });
    return;
  }

  // ── último degrau: ban ──
  let acao = lang === "en" ? "banned" : "banido";
  try {
    await server.banUser(userId, { reason: `[AutoMod] ${motivo} (${count} avisos)` });
    banGlobal.registrar(ctx, userId, `${motivo} (${count} avisos)`, "automod");
  } catch (e) {
    console.error("[PUNIÇÃO][BAN]", e.message);
    acao = lang === "en" ? `failed to ban (${e.message})` : `falha ao banir (${e.message})`;
  }
  db.limparPunicao(sid, userId);
  await sendEmbed(channel, { title: lang === "en" ? "🔨 User banned" : "🔨 Usuário banido",
    description: [
      lang === "en" ? `<@${userId}> ${acao} after ${count} warnings.` : `<@${userId}> ${acao} após ${count} avisos.`,
      `**${lang === "en" ? "Reason" : "Motivo"}:** ${motivo}${linhaNota}`, ...blocoGrave].join("\n"),
    colour: COR.erro });
  await log.registrar(ctx, "punicoes", { titulo: "🔨 Ban automático",
    descricao: `<@${userId}> banido após **${count}** avisos.\n**Motivo:** ${motivo}` });
}

// ──────────────────────────────────────────────────────────
//  Alerta à administração: "olhem isto, agora".
//
//  Separado da punição de propósito. Nem todo padrão suspeito merece punir —
//  mas todo padrão suspeito merece um par de olhos humanos ENQUANTO está
//  acontecendo. O alerta chega no canal de alerta do sentinela (ou no de logs),
//  marcando quem pode agir.
// ──────────────────────────────────────────────────────────
async function alertarAdministracao(ctx, { server, canal, userId, sinal, faixa, nivel, nota }) {
  const { config, sendEmbed, COR, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const am = config.automod ?? {};

  // Onde avisar: o canal do sentinela, senão o de logs, senão o próprio canal.
  const destinoId = am.antiScam?.alertChannelId || config.log?.canalId || null;
  let destino = canal;
  if (destinoId) {
    try { destino = await ctx.client.channels.fetch(destinoId); } catch { destino = canal; }
  }

  // Quem marcar: os cargos de staff configurados no &acesso. Sem eles, o
  // alerta ainda sai — só não marca ninguém, o que é melhor que não alertar.
  const cargos = config.acesso?.cargosStaff ?? [];
  const mencao = cargos.length ? cargos.map((id) => `<%${id}>`).join(" ") : "";

  const linhas = lang === "en" ? [
    mencao,
    `**Possible threat** — <@${userId}> tripped the sentinel **${sinal.vezes}×** in ${sinal.janelaMin} min.`,
    `**Profile:** ${faixa ? faixa.rotuloEN : "unknown"}${nivel != null ? ` (level ${nivel})` : ""} · **highest score:** ${nota.toFixed(1)}/10`,
    sinal.sinais.length ? `**Signals:** ${sinal.sinais.join(", ")}` : null,
    "",
    "Nothing was punished — the score stayed below the threshold. This is a **pattern**, and patterns are worth a human look.",
    `\`${PREFIXO}scam ban ${userId}\` · \`${PREFIXO}scam dismiss ${userId}\` · \`${PREFIXO}warnings ${userId}\``,
  ] : [
    mencao,
    `**Possível ameaça** — <@${userId}> acionou o sentinela **${sinal.vezes}×** em ${sinal.janelaMin} min.`,
    `**Perfil:** ${faixa ? faixa.rotulo : "desconhecido"}${nivel != null ? ` (nível ${nivel})` : ""} · **maior nota:** ${nota.toFixed(1)}/10`,
    sinal.sinais.length ? `**Sinais:** ${sinal.sinais.join(", ")}` : null,
    "",
    "Nada foi punido — a nota ficou abaixo do limiar. Isto é um **padrão**, e padrão merece olho humano.",
    `\`${PREFIXO}scam ban ${userId}\` · \`${PREFIXO}scam dismiss ${userId}\` · \`${PREFIXO}warnings ${userId}\``,
  ];

  try {
    await sendEmbed(destino, {
      title: lang === "en" ? "🚨 Possible threat" : "🚨 Possível ameaça",
      description: linhas.filter(Boolean).join("\n"),
      colour: COR.erro,
    });
  } catch (e) { console.error("[SENTINELA][alerta]", e.message); }

  await log.registrar(ctx, "punicoes", {
    titulo: "🚨 Possível ameaça",
    descricao: `<@${userId}> acionou o sentinela **${sinal.vezes}×** em ${sinal.janelaMin} min`
      + ` (${faixa?.rotulo ?? "?"}, nível ${nivel ?? "?"}). Sinais: ${sinal.sinais.join(", ") || "—"}`,
  });
  console.log(`[SENTINELA] 🚨 Alerta: ${userId} — ${sinal.vezes}× em ${sinal.janelaMin}min`);
}

// ──────────────────────────────────────────────────────────
//  A escada do modo `acumular`.
//
//  Configurável: `punicao escada aviso,5m,1h,ban`. O padrão é o que a maioria
//  quer sem pensar — uma chance, dois mutes crescentes, e ban só no fim.
// ──────────────────────────────────────────────────────────
export const ESCADA_PADRAO = "aviso,5m,1h,ban";

// ──────────────────────────────────────────────────────────
//  Devolver a voz quando o prazo vence.
//
//  O vencimento vive no banco, então um mute de 1 hora sobrevive a restart do
//  bot — e é justamente por isso que precisa de alguém conferindo: sem esta
//  rotina, um mute temporário viraria permanente se o processo reiniciasse.
// ──────────────────────────────────────────────────────────
let timerSilencios = null;

export function iniciarVigiaDeSilencios(ctx, intervaloMs = 60_000) {
  if (timerSilencios) clearInterval(timerSilencios);
  timerSilencios = setInterval(() => {
    liberarSilenciosVencidos(ctx).catch((e) => console.error("[PUNIÇÃO][vigia]", e.message));
  }, intervaloMs);
  if (timerSilencios.unref) timerSilencios.unref();
  // Uma passada imediata: se o bot ficou fora por mais tempo que o mute,
  // a pessoa não deve esperar mais um ciclo para poder falar.
  liberarSilenciosVencidos(ctx).catch(() => {});
}

export async function liberarSilenciosVencidos(ctx) {
  const vencidos = db.silenciosVencidos();
  if (!vencidos.length) return 0;
  let soltos = 0;
  for (const { serverId, userId, motivo } of vencidos) {
    try {
      const cfg = ctx.estado?.configDoServidor?.(serverId) ?? ctx.config;
      const roleId = cfg?.automod?.punicao?.silenceRoleId;
      const server = await ctx.client?.servers?.fetch?.(serverId);
      if (server && roleId) await removerCargoSilence(server, userId, roleId, ctx);
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
      });
    } catch (e) {
      console.error(`[PUNIÇÃO][vigia] ${userId}:`, e.message);
    }
  }
  return soltos;
}

export function escadaDePunicao(pol = {}, { estrito = false } = {}) {
  const bruto = String(pol.escada || ESCADA_PADRAO).split(",").map((x) => x.trim()).filter(Boolean);
  const degraus = bruto.map(interpretarDegrau).filter(Boolean);
  // No modo estrito (usado ao CONFIGURAR), texto que não vira degrau nenhum é
  // erro do usuário e precisa ser recusado. Em uso normal, cai no padrão —
  // uma config estranha não pode desligar a punição sem ninguém perceber.
  if (estrito && degraus.length !== bruto.length) return [];
  // Sem um ban no fim, um usuário insistente ficaria em loop de mute para
  // sempre. O último degrau é sempre terminal.
  if (!degraus.length) return [{ tipo: "aviso" }, { tipo: "ban" }];
  if (degraus[degraus.length - 1].tipo !== "ban") degraus.push({ tipo: "ban" });
  return degraus;
}

function interpretarDegrau(txt) {
  const t = String(txt).toLowerCase();
  if (/^(aviso|warn|warning)$/.test(t)) return { tipo: "aviso" };
  if (/^(ban|banir)$/.test(t)) return { tipo: "ban" };
  const m = t.match(/^(\d+)\s*(s|seg|m|min|h|hora|d|dia)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unidade = m[2][0];
  const ms = unidade === "s" ? n * 1000
    : unidade === "m" ? n * 60_000
    : unidade === "h" ? n * 3_600_000
    : n * 86_400_000;
  const rotulo = unidade === "s" ? `${n}s` : unidade === "m" ? `${n} min` : unidade === "h" ? `${n}h` : `${n}d`;
  return { tipo: "mute", ms, rotulo };
}

export function rotuloDegrau(degrau, lang = "pt") {
  if (!degrau) return lang === "en" ? "nothing further" : "nada além disso";
  if (degrau.tipo === "aviso") return lang === "en" ? "warning" : "aviso";
  if (degrau.tipo === "ban") return lang === "en" ? "ban" : "ban";
  return lang === "en" ? `${degrau.rotulo} of silence` : `silêncio de ${degrau.rotulo}`;
}

// ──────────────────────────────────────────────────────────
//  Motor principal — executado em TODAS as mensagens.
//  Retorna true se a mensagem foi bloqueada.
// ──────────────────────────────────────────────────────────
export async function runAutomod(message, ctx) {
  const { config, estado, getServer } = ctx;
  const userId  = message.authorId;
  const content = message.content ?? "";
  const am = config.automod;

  dbg(ctx, "────────────────────────────────────────────");
  dbg(ctx, `▶ Analisando mensagem de ${userId}`);
  dbg(ctx, `  conteúdo: ${JSON.stringify(content)}`);

  let server;
  try {
    server = await getServer(message);
  } catch (err) {
    dbg(ctx, `  ✗ Não foi possível resolver o servidor (${err.message}) — pulando automod`);
    return false;
  }

  // Captura o canal ANTES de qualquer message.delete(), pois apos a
  // delecao a referencia message.channel pode ficar indisponivel.
  const canal = await resolverCanal(message, ctx);

  // ── Anti-invite (respeita a whitelist de códigos) ──
  if (am.antiInvite.enabled) {
    INVITE_REGEX.lastIndex = 0;
    const codigos = [...content.matchAll(INVITE_REGEX)].map((m) => m[1]);
    dbg(ctx, `  [anti-invite] ON → convites encontrados: [${codigos.join(", ") || "nenhum"}]`);
    if (codigos.length > 0) {
      const naoPermitidos = codigos.filter((c) => !config.inviteWhitelist.includes(c.toLowerCase()));
      dbg(ctx, `  [anti-invite] não permitidos: [${naoPermitidos.join(", ") || "nenhum"}]`);
      if (naoPermitidos.length > 0) {
        dbg(ctx, "  ✗ BLOQUEADA por anti-invite");
        try { await message.delete(); } catch (e) { dbg(ctx, `  (falha ao deletar: ${e.message})`); }
        await aplicarPunicao(ctx, { server, channel: canal, message, userId, pol: am.antiInvite.punicao,
          motivo: "não é permitido enviar convites neste servidor" });
        return true;
      }
    }
  } else {
    dbg(ctx, "  [anti-invite] OFF");
  }

  // ── Conteúdo proibido (scorecard único: golpe/+18/gore/ilícito/CSAM) ──
  if (am.antiScam?.enabled) {
    const rate = taxaPorSegundo(estado, userId);
    const r = analisarConteudo(content, { rate });
    const base = ({ baixa: 7, media: 6, alta: 5 })[am.antiScam.sensitivity] ?? 6;

    // ── Rigor por antiguidade ──
    // Só o sentinela usa isto: ele julga, não mede. Conta nova mandando link
    // de venda é o padrão do golpe; a mesma frase de quem está há semanas no
    // servidor quase sempre é brincadeira que o detector não entende.
    const { limiar, faixa, nivel } = confianca.limiarPara(
      ctx.serverId ?? server?.id, userId, base,
      { ativo: am.antiScam.porAntiguidade !== false },
    );
    dbg(ctx, `  [sentinela] ON → nota ${r.nota.toFixed(1)}/10 (limiar ${limiar}`
      + `${faixa ? `, ${faixa.rotulo} nv${nivel}` : ""})${r.grave ? " GRAVE" : ""}`
      + ` sinais: [${r.sinais.join(", ") || "nenhum"}]`);

    // ── Alerta à administração ──
    // Um sinal isolado não vira punição nem alarme; um PADRÃO vira. Isto roda
    // mesmo quando a nota não chegou ao limiar: é justamente o caso em que a
    // moderação humana precisa olhar antes de o bot decidir sozinho.
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
    dbg(ctx, `  [anti-link] domínios extraídos da mensagem: [${dominios.join(", ") || "nenhum"}]`);

    if (estado.blockedDomains.size === 0) {
      dbg(ctx, "  [anti-link] ⚠️ lista VAZIA — adicione com %blocklist add <url> ou %blocklist adddomain <domínio>");
    }

    const bloqueado = dominios.find((d) => dominioBloqueado(d, estado.blockedDomains));
    if (bloqueado) {
      dbg(ctx, `  ✗ BLOQUEADA por anti-link (domínio: ${bloqueado})`);
      try { await message.delete(); } catch (e) { dbg(ctx, `  (falha ao deletar: ${e.message})`); }
      await aplicarPunicao(ctx, { server, channel: canal, message, userId,
        pol: am.antiLink.punicao, motivo: "este link está em uma lista de bloqueio do servidor" });
      return true;
    } else if (dominios.length > 0) {
      dbg(ctx, "  [anti-link] nenhum domínio da mensagem está na lista");
    }
  } else {
    dbg(ctx, "  [anti-link] OFF");
  }

  // ── Anti-mass-mention ──
  if (am.antiMassMention.enabled) {
    const n = message.mentionIds?.length ?? 0;
    dbg(ctx, `  [anti-mass-mention] ON → ${n} menção(ões) (limite ${am.antiMassMention.maxMentions})`);
    if (n > am.antiMassMention.maxMentions) {
      dbg(ctx, "  ✗ BLOQUEADA por anti-mass-mention");
      try { await message.delete(); } catch {}
      await aplicarPunicao(ctx, { server, channel: canal, message, userId,
        pol: am.antiMassMention.punicao, motivo: `você mencionou ${n} usuários de uma só vez` });
      return true;
    }
  } else {
    dbg(ctx, "  [anti-mass-mention] OFF");
  }

  // ── Anti-caps ──
  if (am.antiCaps.enabled && content.length >= am.antiCaps.minLength) {
    const letras = content.replace(/[^a-zA-ZÀ-ÿ]/g, "");
    if (letras.length > 0) {
      const maius = letras.replace(/[^A-ZÀÁÂÃÄÉÊÍÓÔÕÚÜÇ]/g, "").length;
      const ratio = maius / letras.length;
      dbg(ctx, `  [anti-caps] ON → ${(ratio * 100).toFixed(0)}% maiúsculas (limite ${(am.antiCaps.threshold * 100).toFixed(0)}%)`);
      if (ratio >= am.antiCaps.threshold) {
        dbg(ctx, "  ✗ BLOQUEADA por anti-caps");
        try { await message.delete(); } catch {}
        await aplicarPunicao(ctx, { server, channel: canal, message, userId,
          pol: am.antiCaps.punicao, motivo: "evite escrever em CAIXA ALTA em excesso" });
        return true;
      }
    }
  } else if (am.antiCaps.enabled) {
    dbg(ctx, `  [anti-caps] ON → mensagem curta (<${am.antiCaps.minLength}), ignorada`);
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
      dbg(ctx, `  ✗ BLOQUEADA por anti-caracteres (${r.tipo})`);
      try { await message.delete(); } catch {}
      await aplicarPunicao(ctx, { server, channel: canal, message, userId, pol: am.antiCaracteres.punicao, motivo: r.motivo });
      return true;
    }
  } else {
    dbg(ctx, "  [anti-caracteres] OFF");
  }

  // ── Anti-repetição (letra repetida na mesma mensagem) ──
  // Desligado por padrão: em servidores BR o "kkkkk" é risada. Quando ligado,
  // ignora por padrão o "k" (configurável em antiRepeticao.ignorar).
  if (am.antiRepeticao?.enabled) {
    const r = analisarRepeticao(content, {
      maxRepeticao: am.antiRepeticao.maxRepeticao ?? 15,
      ignorar:      am.antiRepeticao.ignorar ?? "k",
    });
    dbg(ctx, `  [anti-repeticao] ON → ${r ? "detectado" : "ok"} (ignora "${am.antiRepeticao.ignorar ?? "k"}")`);
    if (r) {
      dbg(ctx, "  ✗ BLOQUEADA por anti-repeticao");
      try { await message.delete(); } catch {}
      await aplicarPunicao(ctx, { server, channel: canal, message, userId, pol: am.antiRepeticao.punicao, motivo: r.motivo });
      return true;
    }
  } else {
    dbg(ctx, "  [anti-repeticao] OFF");
  }

  // ── Anti-spam / Anti-mass-spam ──
  if (am.antiSpam.enabled || am.antiMassSpam.enabled) {
    const now = Date.now();
    const maxWindow = Math.max(am.antiSpam.windowMs, am.antiMassSpam.windowMs);
    const prev = (estado.spamData.get(userId) ?? []).filter((t) => now - t < maxWindow);
    prev.push(now);
    estado.spamData.set(userId, prev);

    if (am.antiMassSpam.enabled) {
      const c = prev.filter((t) => now - t < am.antiMassSpam.windowMs).length;
      dbg(ctx, `  [anti-mass-spam] ON → ${c} msg em ${am.antiMassSpam.windowMs}ms (limite ${am.antiMassSpam.maxMessages})`);
      if (c >= am.antiMassSpam.maxMessages) {
        dbg(ctx, "  ✗ BLOQUEADA por anti-mass-spam");
        estado.spamData.delete(userId);
        await aplicarPunicao(ctx, { server, channel: canal, message, userId,
          pol: am.antiMassSpam.punicao, motivo: "flood de mensagens (mass spam)" });
        return true;
      }
    }

    if (am.antiSpam.enabled) {
      const c = prev.filter((t) => now - t < am.antiSpam.windowMs).length;
      dbg(ctx, `  [anti-spam] ON → ${c} msg em ${am.antiSpam.windowMs}ms (limite ${am.antiSpam.maxMessages})`);
      if (c >= am.antiSpam.maxMessages) {
        dbg(ctx, "  ✗ BLOQUEADA por anti-spam");
        estado.spamData.set(userId, []);
        try { await message.delete(); } catch {}
        await aplicarPunicao(ctx, { server, channel: canal, message, userId,
          pol: am.antiSpam.punicao, motivo: "você está enviando mensagens muito rapidamente" });
        return true;
      }
    }
  } else {
    dbg(ctx, "  [anti-spam/mass-spam] OFF");
  }

  dbg(ctx, "  ✓ Nenhuma violação detectada");
  return false;
}

// Aplica o cargo de silêncio a um usuário (mantém os cargos atuais)
async function aplicarCargoSilence(server, userId, roleId, ctx) {
  const member = await server.fetchMember(userId);
  const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
  if (!atuais.includes(roleId)) atuais.push(roleId);
  await member.edit({ roles: atuais });
}

// ──────────────────────────────────────────────────────────
//  Reaplica a punição quando um membro ENTRA no servidor.
//  Fecha o furo de "sair e voltar para escapar do silêncio":
//  o estado vive no banco, não no cargo que se perde ao sair.
// ──────────────────────────────────────────────────────────
export async function reaplicarPunicao(member, ctx) {
  const serverId = member?.id?.server;
  const userId   = member?.id?.user;
  if (!serverId || !userId) return false;

  if (!db.estaSilenciado(serverId, userId)) return false;

  const roleId = ctx.config?.automod?.punicao?.silenceRoleId;
  if (!roleId) {
    dbg(ctx, `  ↩ ${userId} estava silenciado, mas não há cargo de silêncio configurado`);
    return false;
  }

  try {
    const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
    if (!atuais.includes(roleId)) atuais.push(roleId);
    await member.edit({ roles: atuais });
    console.log(`[PUNIÇÃO] ↩ Silêncio REAPLICADO a ${userId} ao reentrar em ${serverId}`);

    const motivo = db.lerPunicao(serverId, userId)?.motivo ?? "punição ativa";
    await log.registrar(ctx, "punicoes", {
      titulo: "↩ Punição reaplicada",
      descricao: `<@${userId}> saiu e voltou ao servidor — o silêncio foi **reaplicado**.\n**Motivo original:** ${motivo}`,
    });
    return true;
  } catch (err) {
    console.error("[PUNIÇÃO][REAPLICAR]", err?.message);
    return false;
  }
}

// Remove o cargo de silêncio de um usuário
export async function removerCargoSilence(server, userId, roleId, ctx) {
  const member = await server.fetchMember(userId);
  const atuais = (member.roles ?? []).map((r) => r?.id ?? r).filter((id) => id && id !== roleId);
  await member.edit({ roles: atuais });
}

// Resolve o canal de aviso configurado (ou usa o canal atual como fallback)
async function canalDeAviso(ctx, canalAtual) {
  const id = ctx.config.automod.antiScam.alertChannelId;
  if (!id) return canalAtual;
  try {
    const ch = ctx.client?.channels;
    if (ch?.get) { const c = ch.get(id); if (c) return c; }
    if (ch?.fetch) return await ch.fetch(id);
  } catch (e) {
    console.error("[ANTI-GOLPE] Falha ao resolver canal de aviso:", e.message);
  }
  return canalAtual;
}

export async function simularDeteccao(texto, ctx, canalAtual) {
  const { sendEmbed, COR, config } = ctx;
  const t = texto ?? "";
  const r = analisarConteudo(t, { rate: 1 });
  const limiar = ({ baixa: 7, media: 6, alta: 5 })[config.automod.antiScam.sensitivity] ?? 6;
  const flag = r.nota >= limiar;
  const canalAviso = await canalDeAviso(ctx, canalAtual);
  const resumoSeguro = r.grave ? "[conteúdo não exibido por segurança]"
                              : (t.length > 200 ? t.slice(0, 200) + "…" : t);

  console.log(`[SIMULATE] nota=${r.nota.toFixed(1)}/${limiar} flag=${flag} grave=${r.grave} sinais=[${r.sinais.join(", ") || "nenhum"}]`);

  await sendEmbed(canalAviso, {
    title: flag ? `🧪 [SIMULAÇÃO] SERIA sinalizado (nota ${r.nota.toFixed(1)})` : `🧪 [SIMULAÇÃO] não seria sinalizado (nota ${r.nota.toFixed(1)})`,
    description: [
      `**Nota:** ${r.nota.toFixed(1)} / limiar ${limiar}`,
      `**Grave?** ${r.grave ? "sim" : "não"}`,
      `**Sinais:** ${r.sinais.join(", ") || "nenhum"}`,
      `**Mensagem:** ${resumoSeguro}`,
      "",
      "_Simulação: nada foi apagado ou punido. Se você está vendo isto, o canal de avisos está funcionando._",
    ].join("\n"),
    colour: flag ? COR.erro : COR.sucesso,
  });
  return r;
}