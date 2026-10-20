
import { tr, lingua, idiomaDe } from "./i18n.js";
import { citar } from "../core/aliases.js";
import { resolverCanal } from "./ids.js";
import { subExibido } from "./aliases.js";
import * as relatorioHora from "../ferramentas/relatorio.js";
import { canalDeOutroServidor } from "../moderacao/pertence.js";

// Rótulos amigáveis de cada categoria
export const EVENTOS = {
  punicoes:  "punições (avisos, silêncios, bans)",
  membros:   "entradas e saídas de membros",
  mensagens: "mensagens apagadas e editadas",
  cargos:    "cargos criados e atribuídos",
  comandos:  "tentativas de uso de comandos",
  atualizacoes: "novidades da Judy a cada atualização",
};
export const EVENTOS_EN = {
  punicoes:  "punishments (warnings, silences, bans)",
  membros:   "member joins and leaves",
  mensagens: "deleted and edited messages",
  cargos:    "roles created and assigned",
  comandos:  "command usage attempts",
  atualizacoes: "Judy's news on every update",
};

// Cores por categoria (mantém o padrão de embeds do bot)
const CORES = {
  punicoes:  "#e74c3c",
  membros:   "#2ecc71",
  mensagens: "#f1c40f",
  cargos:    "#9b59b6",
  comandos:  "#3498db",
  atualizacoes: "#5865F2",
};

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

// `en: { titulo, descricao }` é a versão em inglês — usada quando o servidor
// está em inglês (14 out 2026: num servidor EN o log saía todo em português).
// Toda chamada de `registrar` passa as duas línguas; o teste `log-en-14out`
// confere isso no código-fonte.
export async function registrar(ctx, categoria, { titulo, descricao, en = null, imagem = null, anexos = null }) {
  // Todo evento conta para o relatório horário do dono do bot, inclusive nos
  // servidores sem canal de log (é justamente a visão de todos os servidores).
  relatorioHora.evento(ctx?.serverId, categoria, titulo);
  if (en && lingua(ctx) === "en") {
    titulo = en.titulo ?? titulo;
    descricao = en.descricao ?? descricao;
  }
  try {
    const cfg = ctx?.config?.log;
    if (!cfg?.canalId) return;                 // sem canal configurado
    if (cfg.eventos?.[categoria] === false) return; // categoria desligada

    const canal = ctx.client.channels.get(cfg.canalId)
              ?? await ctx.client.channels.fetch(cfg.canalId).catch(() => null);
    if (!canal) return;
    // o log de um servidor nunca sai no canal de OUTRO (15 out 2026)
    if (canalDeOutroServidor(canal, ctx.serverId)) return;

    const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
    await ctx.sendEmbed(canal, {
      title: titulo,
      description: `${descricao}\n\n_${agora} UTC_`,
      colour: CORES[categoria] ?? "#95a5a6",
      imagem,
      anexos,
    });
  } catch (err) {
    console.error("[LOG] Falha ao registrar:", err?.message);
  }
}

export async function cmdLog(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const ROTULOS = lang === "en" ? EVENTOS_EN : EVENTOS;
  const nomeEvento = (k) => subExibido("log", k, idiomaDe(ctx));   // `mensagens` → `messages` em inglês, `mensajes` em espanhol

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
      return `${on ? "🟢" : "🔴"} **${nomeEvento(chave)}** — ${desc}`;
    });
    // P4: o relatório anônimo de ataques ao dono da Judy (não é um evento do canal)
    linhas.push("", `${config.relatorioDono ? "🟢" : "🔴"} **${nomeEvento("relatorio")}** — ${lang === "en"
      ? "anonymous attack report to Judy's owner (no names or IDs)"
      : "relatório anônimo de ataques ao dono da Judy (sem nomes nem IDs)"}`);
    return sendEmbed(message.channel, lang === "en" ? {
      title: "📜 Log channel",
      description: [
        `**Channel:** ${canal}`,
        "",
        ...linhas,
        "",
        "**Commands:**",
        `\`${citar("log.here", "en", PREFIXO)}\` — use this channel`,
        `\`${citar("log", "en", PREFIXO)} <channelId>\` — set by ID`,
        `\`${citar("log.off", "en", PREFIXO)}\` — disable`,
        `\`${citar("log", "en", PREFIXO)} <event> <on|off>\` — toggle an event`,
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
        `\`${citar("log.here", "pt", PREFIXO)}\` — usar este canal`,
        `\`${citar("log", "pt", PREFIXO)} <idDoCanal>\` — definir por ID`,
        `\`${citar("log.off", "pt", PREFIXO)}\` — desativar`,
        `\`${citar("log", "pt", PREFIXO)} <evento> <on|off>\` — ligar/desligar um evento`,
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

  // ── &log relatorio on|off ── (privacidade P4) o servidor escolhe se o dono da
  // Judy fica sabendo dos ataques daqui — anônimo: o servidor vira um código, e
  // só entram bans, punições, raids e imagens suspeitas, sem nomes nem IDs.
  if (sub === "relatorio") {
    const v = args[1]?.toLowerCase();
    if (v === "on" || v === "off") { config.relatorioDono = v === "on"; salvarConfig(); }
    const on = !!config.relatorioDono;
    const cmd = (l) => `\`${citar("log.relatorio", l, PREFIXO)} ${on ? "off" : "on"}\``;
    return sendEmbed(message.channel, tr(ctx,
      { title: `🛰️ Relatório de ataques ${on ? "ligado 🟢" : "desligado 🔴"}`, colour: COR.mod, description: [
        on ? "Os ataques daqui vão, **anônimos**, para o relatório do dono da Judy: bans, punições, raids e imagens suspeitas — sem nomes, sem IDs, e o servidor aparece como um código. Nada da conversa vai."
          : "Nada deste servidor vai para o relatório do dono da Judy.",
        "", `${on ? "Para desligar" : "Para ligar"}: ${cmd("pt")}`].join("\n") },
      { title: `🛰️ Attack report ${on ? "on 🟢" : "off 🔴"}`, colour: COR.mod, description: [
        on ? "This server's attacks go, **anonymously**, into the report of Judy's owner: bans, punishments, raids and suspicious images — no names, no IDs, and the server shows up as a code. Nothing from the conversation goes."
          : "Nothing from this server goes into the report of Judy's owner.",
        "", `${on ? "To turn it off" : "To turn it on"}: ${cmd("en")}`].join("\n") },
      { title: `🛰️ Informe de ataques ${on ? "activado 🟢" : "desactivado 🔴"}`, colour: COR.mod, description: [
        on ? "Los ataques de aquí van, **anónimos**, al informe del dueño de Judy: bans, sanciones, raids e imágenes sospechosas — sin nombres, sin IDs, y el servidor aparece como un código. Nada de la conversación va."
          : "Nada de este servidor va al informe del dueño de Judy.",
        "", `${on ? "Para desactivarlo" : "Para activarlo"}: ${cmd("es")}`].join("\n") }));
  }

  // ── &log <evento> <on|off> ──
  if (Object.hasOwn(EVENTOS, sub)) {
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off") {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: `\`${citar("log", "pt", PREFIXO)} ${sub} <on|off>\``,
        colour: COR.erro,
      }, {
        title: "❌ Wrong usage",
        description: `\`${citar("log", "en", PREFIXO)} ${nomeEvento(sub)} <on|off>\``,
        colour: COR.erro,
      }));
    }
    config.log.eventos[sub] = (v === "on");
    salvarConfig();
    return sendEmbed(message.channel, {
      title: lang === "en" ? "📜 Log updated" : "📜 Log atualizado",
      description: lang === "en"
        ? `**${nomeEvento(sub)}** — ${ROTULOS[sub]}: **${v === "on" ? "enabled 🟢" : "disabled 🔴"}**.`
        : `**${sub}** — ${ROTULOS[sub]}: **${v === "on" ? "ativado 🟢" : "desativado 🔴"}**.`,
      colour: COR.mod,
    });
  }

  let alvoBruto = args[0];
  if (sub === "canal") alvoBruto = args[1] ?? "here";   // `channel` chega traduzido pelo registro

  const srv = await ctx.getServer?.(message).catch(() => null);
  const id = resolverCanal(alvoBruto, { message, server: srv });
  if (!id) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Canal inválido",
      description: [
        `Não consegui identificar um canal em \`${alvoBruto}\`.`,
        "",
        `Aceito: **menção** (\`#canal\`), **link** do canal, **ID** ou o **nome**.`,
        `Ou use \`${citar("log.here", "pt", PREFIXO)}\` para usar o canal atual.`,
        `Eventos disponíveis: ${Object.keys(EVENTOS).map((e) => `\`${e}\``).join(", ")}`,
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "❌ Invalid channel",
      description: [
        `I couldn't identify a channel in \`${alvoBruto}\`.`,
        "",
        `I accept: a **mention** (\`#channel\`), the channel's **link**, its **ID** or its **name**.`,
        `Or use \`${citar("log.here", "en", PREFIXO)}\` to use the current channel.`,
        `Available events: ${Object.keys(EVENTOS).map((e) => `\`${nomeEvento(e)}\``).join(", ")}`,
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

  if (canalDeOutroServidor(canal, ctx.serverId)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Canal de outro servidor", description: "Esse canal é de outro servidor — escolha um canal daqui.", colour: COR.erro },
      { title: "🚫 Channel from another server", description: "That channel belongs to another server — pick one from here.", colour: COR.erro }));
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


// Freio do resgate de mídia (2 out 2026): por autor, no máximo 3 anexos
// resgatados a cada 10 min, e a mesma imagem (tamanho + dimensões) uma vez só.
const resgates = new Map();   // chave → { t: [quando…], digitais: Map(digital → quando) }
export function freioDeResgate(chave, anexos, { agora = Date.now(), max = 3, janelaMs = 10 * 60_000 } = {}) {
  const st = resgates.get(chave) ?? { t: [], digitais: new Map() };
  st.t = st.t.filter((x) => agora - x < janelaMs);
  for (const [d, x] of st.digitais) if (agora - x > janelaMs) st.digitais.delete(d);
  const resgatar = [];
  let segurados = 0;
  for (const a of anexos ?? []) {
    const d = `${a?.size ?? "?"}:${a?.metadata?.width ?? "?"}x${a?.metadata?.height ?? "?"}`;
    if (st.digitais.has(d) || st.t.length >= max) { segurados++; continue; }
    st.digitais.set(d, agora); st.t.push(agora); resgatar.push(a);
  }
  resgates.set(chave, st);
  if (resgates.size > 500) resgates.delete(resgates.keys().next().value);
  return { resgatar, segurados };
}
