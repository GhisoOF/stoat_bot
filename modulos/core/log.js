// ══════════════════════════════════════════════════════════
//  log.js — Chat de logs configurável por servidor
//
//  &log                      → mostra o status e o canal atual
//  &log here                 → define o canal ATUAL como chat de log
//  &log <idDoCanal>          → define um canal por ID
//  &log off                  → desativa o chat de log
//  &log <evento> <on|off>    → liga/desliga um tipo de evento
//
//  Eventos disponíveis (config.log.eventos):
//    punicoes   — avisos, silêncios e bans do automod/moderação
//    membros    — entradas e saídas do servidor
//    mensagens  — mensagens apagadas e editadas
//    cargos     — cargos criados/apagados e cargos dados a usuários
//    comandos   — tentativas de uso de comandos do bot
// ══════════════════════════════════════════════════════════

import { tr, lingua } from "./i18n.js";
import { resolverCanal } from "./ids.js";

// Rótulos amigáveis de cada categoria
export const EVENTOS = {
  punicoes:  "punições (avisos, silêncios, bans)",
  membros:   "entradas e saídas de membros",
  mensagens: "mensagens apagadas e editadas",
  cargos:    "cargos criados e atribuídos",
  comandos:  "tentativas de uso de comandos",
};
export const EVENTOS_EN = {
  punicoes:  "punishments (warnings, silences, bans)",
  membros:   "member joins and leaves",
  mensagens: "deleted and edited messages",
  cargos:    "roles created and assigned",
  comandos:  "command usage attempts",
};

// Cores por categoria (mantém o padrão de embeds do bot)
const CORES = {
  punicoes:  "#e74c3c",
  membros:   "#2ecc71",
  mensagens: "#f1c40f",
  cargos:    "#9b59b6",
  comandos:  "#3498db",
};

// Registra um evento no chat de log, se estiver ativo para o servidor.
// Nunca lança: uma falha de log jamais deve derrubar a moderação.
// ── Resgate de mídia de mensagem apagada ───────────────────
//
//  Id de anexo no Stoat é de uso único: não dá para reaproveitar o da
//  mensagem morta. O caminho é resgatar os BYTES do CDN (que costuma servir
//  o arquivo por um instante depois da deleção — e no automod o evento chega
//  logo após o próprio bot apagar) e re-subir via Autumn. Melhor esforço
//  declarado: se o CDN já purgou, o log diz isso em vez de fingir que não
//  havia mídia. `baixar` e `subir` são injetáveis para o teste executar o
//  caminho de verdade sem rede (lição do embedIdioma/modeloForcado).
const RESGATE_MAX_BYTES = Number(process.env.LOG_MIDIA_MAX_BYTES || 10 * 1024 * 1024);
export async function resgatarMidias(atts, { baixar = fetch, subir } = {}) {
  const CDN = (process.env.CDN_URL || "https://cdn.stoatusercontent.com").replace(/\/$/, "");
  const ids = [];
  const perdidas = [];
  if (typeof subir !== "function") return { ids, perdidas };
  for (const a of (atts ?? []).slice(0, 3)) {
    const id = a?.id ?? a?._id;
    const tipo = String(a?.metadata?.type ?? a?.content_type ?? "");
    const nome = a?.filename ?? "midia";
    if (!id || !/image|video/i.test(tipo)) continue;
    if ((a?.size ?? 0) > RESGATE_MAX_BYTES) { perdidas.push(`${nome} (grande demais para reanexar)`); continue; }
    try {
      const r = await baixar(`${CDN}/attachments/${id}`, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length > RESGATE_MAX_BYTES) { perdidas.push(`${nome} (grande demais)`); continue; }
      const mime = r.headers.get("content-type") || (/video/i.test(tipo) ? "video/mp4" : "image/png");
      const novoId = await subir({ base64: bytes.toString("base64"), mime, nome });
      if (novoId) ids.push(novoId); else perdidas.push(nome);
    } catch (e) {
      perdidas.push(`${nome} (${e?.message ?? "irrecuperável"})`);
    }
  }
  return { ids, perdidas };
}

export async function registrar(ctx, categoria, { titulo, descricao, imagem = null, anexos = null }) {
  try {
    const cfg = ctx?.config?.log;
    if (!cfg?.canalId) return;                 // sem canal configurado
    if (cfg.eventos?.[categoria] === false) return; // categoria desligada

    const canal = ctx.client.channels.get(cfg.canalId)
              ?? await ctx.client.channels.fetch(cfg.canalId).catch(() => null);
    if (!canal) return;

    const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
    await ctx.sendEmbed(canal, {
      title: titulo,
      description: `${descricao}\n\n_${agora} UTC_`,
      colour: CORES[categoria] ?? "#95a5a6",
      // Mídia resgatada de mensagem apagada: a primeira imagem entra no
      // corpo do embed; o resto (e vídeos) vai como anexo da mensagem.
      imagem,
      anexos,
    });
  } catch (err) {
    console.error("[LOG] Falha ao registrar:", err?.message);
  }
}

// ── Comando &log ───────────────────────────────────────────
export async function cmdLog(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const ROTULOS = lang === "en" ? EVENTOS_EN : EVENTOS;

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **ManagePermissions** para usar este comando.",
      colour: COR.erro,
    }, {
      title: "🚫 Missing permission",
      description: "You need the **ManagePermissions** permission to use this command.",
      colour: COR.erro,
    }));
  }

  // Garante a estrutura (servidores criados antes desta versão)
  config.log ??= { canalId: null, eventos: {} };
  config.log.eventos ??= {};

  const sub = args[0]?.toLowerCase();

  // ── &log  → status ──
  if (!sub) {
    const canal = config.log.canalId ? `<#${config.log.canalId}>` : (lang === "en" ? "_(none)_" : "_(nenhum)_");
    const linhas = Object.entries(ROTULOS).map(([chave, desc]) => {
      const on = config.log.eventos[chave] !== false; // padrão: ligado
      return `${on ? "🟢" : "🔴"} **${chave}** — ${desc}`;
    });
    return sendEmbed(message.channel, lang === "en" ? {
      title: "📜 Log channel",
      description: [
        `**Channel:** ${canal}`,
        "",
        ...linhas,
        "",
        "**Commands:**",
        `\`${PREFIXO}log here\` — use this channel`,
        `\`${PREFIXO}log <channelId>\` — set by ID`,
        `\`${PREFIXO}log off\` — disable`,
        `\`${PREFIXO}log <event> <on|off>\` — toggle an event`,
      ].join("\n"),
      colour: COR.mod,
    } : {
      title: "📜 Chat de logs",
      description: [
        `**Canal:** ${canal}`,
        "",
        ...linhas,
        "",
        "**Comandos:**",
        `\`${PREFIXO}log here\` — usar este canal`,
        `\`${PREFIXO}log <idDoCanal>\` — definir por ID`,
        `\`${PREFIXO}log off\` — desativar`,
        `\`${PREFIXO}log <evento> <on|off>\` — ligar/desligar um evento`,
      ].join("\n"),
      colour: COR.mod,
    });
  }

  // ── &log off ──
  if (sub === "off") {
    config.log.canalId = null;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: "📜 Chat de logs desativado",
      description: "Nenhum evento será registrado até você definir um canal novamente.",
      colour: COR.mod,
    }, {
      title: "📜 Log channel disabled",
      description: "No events will be recorded until you set a channel again.",
      colour: COR.mod,
    }));
  }

  // ── &log here ──
  if (sub === "here") {
    config.log.canalId = message.channelId;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: "📜 Chat de logs definido",
      description: `Os eventos passarão a ser registrados **neste canal**.`,
      colour: COR.mod,
    }, {
      title: "📜 Log channel set",
      description: `Events will now be recorded **in this channel**.`,
      colour: COR.mod,
    }));
  }

  // ── &log <evento> <on|off> ──
  if (Object.hasOwn(EVENTOS, sub)) {
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off") {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: `\`${PREFIXO}log ${sub} <on|off>\``,
        colour: COR.erro,
      }, {
        title: "❌ Wrong usage",
        description: `\`${PREFIXO}log ${sub} <on|off>\``,
        colour: COR.erro,
      }));
    }
    config.log.eventos[sub] = (v === "on");
    salvarConfig();
    return sendEmbed(message.channel, {
      title: lang === "en" ? "📜 Log updated" : "📜 Log atualizado",
      description: lang === "en"
        ? `**${sub}** — ${ROTULOS[sub]}: **${v === "on" ? "enabled 🟢" : "disabled 🔴"}**.`
        : `**${sub}** — ${ROTULOS[sub]}: **${v === "on" ? "ativado 🟢" : "desativado 🔴"}**.`,
      colour: COR.mod,
    });
  }

  // ── &log <canal> ── aceita menção, link, ID ou nome do canal.
  // Também aceita a forma explícita `&log canal <alvo>` / `&log channel <target>`
  // (é a sintaxe que o &tutorial ensina); sem alvo, usa o canal atual.
  let alvoBruto = args[0];
  if (sub === "canal" || sub === "channel") alvoBruto = args[1] ?? "here";

  const srv = await ctx.getServer?.(message).catch(() => null);
  const id = resolverCanal(alvoBruto, { message, server: srv });
  if (!id) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Canal inválido",
      description: [
        `Não consegui identificar um canal em \`${alvoBruto}\`.`,
        "",
        `Aceito: **menção** (\`#canal\`), **link** do canal, **ID** ou o **nome**.`,
        `Ou use \`${PREFIXO}log here\` para usar o canal atual.`,
        `Eventos disponíveis: ${Object.keys(EVENTOS).map((e) => `\`${e}\``).join(", ")}`,
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "❌ Invalid channel",
      description: [
        `I couldn't identify a channel in \`${alvoBruto}\`.`,
        "",
        `I accept: a **mention** (\`#channel\`), the channel's **link**, its **ID** or its **name**.`,
        `Or use \`${PREFIXO}log here\` to use the current channel.`,
        `Available events: ${Object.keys(EVENTOS).map((e) => `\`${e}\``).join(", ")}`,
      ].join("\n"),
      colour: COR.erro,
    }));
  }

  // Confirma que o canal existe e que o bot o alcança
  const canal = ctx.client.channels.get(id) ?? await ctx.client.channels.fetch(id).catch(() => null);
  if (!canal) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Canal não encontrado",
      description: `Não consegui acessar o canal \`${id}\`. Verifique o ID e as permissões do bot.`,
      colour: COR.erro,
    }, {
      title: "❌ Channel not found",
      description: `I couldn't access the \`${id}\` channel. Check the ID and the bot's permissions.`,
      colour: COR.erro,
    }));
  }

  config.log.canalId = id;
  salvarConfig();
  return sendEmbed(message.channel, tr(ctx, {
    title: "📜 Chat de logs definido",
    description: `Os eventos serão registrados em <#${id}>.`,
    colour: COR.mod,
  }, {
    title: "📜 Log channel set",
    description: `Events will be recorded in <#${id}>.`,
    colour: COR.mod,
  }));
}
