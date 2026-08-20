// ══════════════════════════════════════════════════════════
//  tts.js — &tts: a Judy fala nas calls
//
//  O trabalho pesado (LiveKit + Piper) vive no `judy-voz`, nativo no
//  Gentoo. Aqui ficam só o comando, as permissões e os limites.
//
//   &tts <texto>             → fala agora na call configurada
//   &tts canal <#voz>        → define em qual call falar   (ManageMessages)
//   &tts transmitir <#texto> → tudo que for escrito lá é falado na call
//   &tts entrar | sair       → conecta/desconecta da call
//   &tts on | off            → liga/desliga sem perder a configuração
//   &tts voz [nome]          → escolhe a voz do Piper
//   &tts estado              → diagnóstico da cadeia inteira
//
//  ── Isolamento ──
//  Recurso caro e barulhento: só funciona nos servidores listados em
//  TTS_SERVIDORES. Mesmo padrão do chat de IA. Sem a variável, fica
//  desligado em todo lugar — nunca "ligado por engano".
//
//  ── Anti-abuso ──
//  TTS numa call é um megafone. Cooldown por pessoa, teto de tamanho e
//  um `&tts off` que qualquer moderador alcança rápido.
// ══════════════════════════════════════════════════════════

import { resolverCanal } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";

const VOZ_URL   = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
const VOZ_CHAVE = process.env.VOZ_CHAVE || "";
const SERVIDORES = (process.env.TTS_SERVIDORES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const COOLDOWN_MS = Number(process.env.TTS_COOLDOWN_MS || 8000);
const MAX_CHARS   = Number(process.env.TTS_MAX_CHARS || 400);

const ultimaFala = new Map();   // `${serverId}:${userId}` → timestamp
setInterval(() => {
  const corte = Date.now() - COOLDOWN_MS * 10;
  for (const [k, t] of ultimaFala) if (t < corte) ultimaFala.delete(k);
}, 10 * 60_000).unref?.();

export function servidorPermitido(serverId) {
  return !!serverId && SERVIDORES.includes(serverId);
}

function garantirConfig(config) {
  config.tts ??= {};
  config.tts.ativo ??= false;
  config.tts.canalVoz ??= null;
  config.tts.canalTexto ??= null;   // transmissão automática
  config.tts.voz ??= null;
  return config.tts;
}

// ── Conversa com o judy-voz ───────────────────────────────
async function chamar(rota, corpo = null, metodo = "POST") {
  if (!VOZ_URL) throw new Error("VOZ_SERVICO_URL não configurada no ambiente do bot");
  const res = await fetch(`${VOZ_URL}${rota}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...(VOZ_CHAVE ? { "x-chave": VOZ_CHAVE } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS || 40_000)),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados?.erro ?? `HTTP ${res.status}`);
  return dados;
}

// Fala um texto na call configurada. Usado pelo comando E pela
// transmissão automática — por isso vive separado.
export async function falarNaCall(config, texto, ctx) {
  const c = garantirConfig(config);
  if (!c.ativo || !c.canalVoz) return { ok: false, erro: "desligado" };
  return chamar("/falar", { canalVoz: c.canalVoz, texto, voz: c.voz });
}

// ── Transmissão automática ────────────────────────────────
// Chamado pelo main a cada mensagem. Sai cedo e barato quando não é o
// caso — isto roda no caminho quente.
export async function aoMensagem(message, ctx) {
  try {
    const serverId = ctx.serverId;
    if (!servidorPermitido(serverId)) return false;
    const c = ctx.config?.tts;
    if (!c?.ativo || !c.canalTexto || !c.canalVoz) return false;
    if (message.channelId !== c.canalTexto) return false;
    if (message.author?.bot) return false;

    const texto = (message.content ?? "").trim();
    if (!texto || texto.startsWith(ctx.PREFIXO)) return false;

    const chave = `${serverId}:${message.authorId}`;
    const agora = Date.now();
    if (agora - (ultimaFala.get(chave) ?? 0) < COOLDOWN_MS) return false;
    ultimaFala.set(chave, agora);

    const nome = message.author?.username ?? "alguém";
    await chamar("/falar", {
      canalVoz: c.canalVoz,
      texto: `${nome} disse: ${texto.slice(0, MAX_CHARS)}`,
      voz: c.voz,
    });
    return true;
  } catch (e) {
    console.error("[TTS] transmissão:", e?.message ?? e);
    return false;
  }
}

// ── Comando ───────────────────────────────────────────────
export async function cmdTts(message, args, ctx) {
  const { config, sendEmbed, COR, PREFIXO, getServer, membroTemPermissao, salvarConfig, serverId } = ctx;
  const lang = lingua(ctx);
  const c = garantirConfig(config);
  const sub = args[0]?.toLowerCase();
  const resto = args.slice(1).join(" ").trim();

  if (!servidorPermitido(serverId)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Indisponível aqui",
        description: `A voz da Judy não está habilitada neste servidor.`, colour: COR.aviso },
      { title: "🚫 Unavailable here",
        description: `Judy's voice isn't enabled on this server.`, colour: COR.aviso }));
  }

  // ── estado (público) ──
  if (sub === "estado" || sub === "status" || sub === "diagnostico") {
    let saude = null, erroSaude = null;
    try { saude = await chamar("/saude", null, "GET"); }
    catch (e) { erroSaude = e?.message ?? String(e); }

    const linhas = [
      `**${lang === "en" ? "Enabled" : "Ligado"}:** ${c.ativo ? "🟢" : "🔴"}`,
      `**${lang === "en" ? "Voice channel" : "Canal de voz"}:** ${c.canalVoz ? `<#${c.canalVoz}>` : "_—_"}`,
      `**${lang === "en" ? "Broadcast from" : "Transmite de"}:** ${c.canalTexto ? `<#${c.canalTexto}>` : "_—_"}`,
      "",
      `**${lang === "en" ? "Voice service" : "Serviço de voz"}:** ${saude ? "🟢 ok" : `🔴 ${erroSaude}`}`,
    ];
    if (saude) {
      linhas.push(`**Piper:** ${saude.piper?.ok ? `🟢 ${saude.piper.vozAtual}` : `🔴 ${saude.piper?.erro}`}`);
      linhas.push(`**LiveKit:** ${saude.voz?.pronto ? "🟢 pronto" : `🔴 ${saude.voz?.erro}`}`);
      const con = saude.voz?.conexoes ?? [];
      linhas.push(`**${lang === "en" ? "In calls" : "Em calls"}:** ${con.length
        ? con.map((x) => `<#${x.canalVoz}> (${x.falas} ${lang === "en" ? "utterances" : "falas"})`).join(", ")
        : "_—_"}`);
    }
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🔊 Voice status" : "🔊 Estado da voz",
      description: linhas.join("\n"),
      colour: saude?.piper?.ok && saude?.voz?.pronto ? COR.sucesso : COR.aviso,
    });
  }

  const server = await getServer(message).catch(() => null);
  const ehStaff = membroTemPermissao(message, server, "ManageMessages");

  // ── configuração (staff) ──
  if (["canal", "channel", "transmitir", "broadcast", "entrar", "join", "sair", "leave",
       "on", "off", "voz", "voice"].includes(sub)) {
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para configurar a voz.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to configure the voice.", colour: COR.erro }));
    }

    if (["canal", "channel"].includes(sub)) {
      const id = resolverCanal(resto, { message, server });
      if (!id) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido",
            description: `Uso: \`${PREFIXO}tts canal <#canal-de-voz>\`\n_Precisa ser um canal de **voz**._`, colour: COR.erro },
          { title: "❌ Invalid channel",
            description: `Usage: \`${PREFIXO}tts canal <#voice-channel>\`\n_It must be a **voice** channel._`, colour: COR.erro }));
      }
      c.canalVoz = id; c.ativo = true; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Canal de voz definido",
          description: `A Judy vai falar em <#${id}>.\n\nTeste: \`${PREFIXO}tts olá pessoal\``, colour: COR.sucesso },
        { title: "✅ Voice channel set",
          description: `Judy will speak in <#${id}>.\n\nTest: \`${PREFIXO}tts hello everyone\``, colour: COR.sucesso }));
    }

    if (["transmitir", "broadcast"].includes(sub)) {
      if (["off", "limpar", "clear", "nao", "não"].includes(resto.toLowerCase())) {
        c.canalTexto = null; salvarConfig?.();
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Transmissão desligada",
            description: `Só o \`${PREFIXO}tts <texto>\` fala agora.`, colour: COR.sucesso },
          { title: "✅ Broadcast off",
            description: `Only \`${PREFIXO}tts <text>\` speaks now.`, colour: COR.sucesso }));
      }
      const id = resolverCanal(resto || "aqui", { message, server });
      if (!id) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido", description: `Uso: \`${PREFIXO}tts transmitir <#canal-de-texto>\``, colour: COR.erro },
          { title: "❌ Invalid channel", description: `Usage: \`${PREFIXO}tts transmitir <#text-channel>\``, colour: COR.erro }));
      }
      c.canalTexto = id; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Transmissão ligada",
          description: `Tudo escrito em <#${id}> será **falado na call**.\n\n⚠️ Vale para todo mundo que escrever lá — desligue com \`${PREFIXO}tts transmitir off\`.`,
          colour: COR.aviso },
        { title: "✅ Broadcast on",
          description: `Everything written in <#${id}> will be **spoken in the call**.\n\n⚠️ That applies to everyone writing there — turn it off with \`${PREFIXO}tts transmitir off\`.`,
          colour: COR.aviso }));
    }

    if (["entrar", "join"].includes(sub)) {
      if (!c.canalVoz) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falta o canal", description: `Defina antes: \`${PREFIXO}tts canal <#voz>\``, colour: COR.erro },
          { title: "❌ No channel yet", description: `Set it first: \`${PREFIXO}tts canal <#voice>\``, colour: COR.erro }));
      }
      try {
        await chamar("/entrar", { canalVoz: c.canalVoz });
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Entrei na call", description: `Estou em <#${c.canalVoz}>.`, colour: COR.sucesso },
          { title: "✅ Joined the call", description: `I'm in <#${c.canalVoz}>.`, colour: COR.sucesso }));
      } catch (e) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "❌ Couldn't join" : "❌ Não consegui entrar",
          description: `\`${e.message}\`\n\n${lang === "en" ? "See" : "Veja"} \`${PREFIXO}tts estado\``,
          colour: COR.erro });
      }
    }

    if (["sair", "leave"].includes(sub)) {
      try { await chamar("/sair", { canalVoz: c.canalVoz }); } catch {}
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Saí da call", description: "Até a próxima.", colour: COR.sucesso },
        { title: "✅ Left the call", description: "See you.", colour: COR.sucesso }));
    }

    if (sub === "on" || sub === "off") {
      c.ativo = sub === "on"; salvarConfig?.();
      if (!c.ativo) { try { await chamar("/sair", { canalVoz: c.canalVoz }); } catch {} }
      return sendEmbed(message.channel, tr(ctx,
        { title: c.ativo ? "✅ Voz ligada" : "🔴 Voz desligada",
          description: c.ativo ? "A Judy volta a falar." : "Nada será falado até religar.", colour: COR.mod },
        { title: c.ativo ? "✅ Voice on" : "🔴 Voice off",
          description: c.ativo ? "Judy speaks again." : "Nothing will be spoken until re-enabled.", colour: COR.mod }));
    }

    if (["voz", "voice"].includes(sub)) {
      let saude = null;
      try { saude = await chamar("/saude", null, "GET"); } catch {}
      const vozes = saude?.piper?.vozes ?? [];
      if (!resto) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "🔊 Available voices" : "🔊 Vozes disponíveis",
          description: vozes.length
            ? vozes.map((v) => `• \`${v}\`${v === (c.voz ?? saude?.piper?.vozAtual) ? " ←" : ""}`).join("\n")
            : (lang === "en" ? "_none installed_" : "_nenhuma instalada_"),
          colour: COR.info });
      }
      if (vozes.length && !vozes.includes(resto)) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "❌ Unknown voice" : "❌ Voz desconhecida",
          description: `\`${resto}\`\n\n${vozes.map((v) => `\`${v}\``).join(", ")}`, colour: COR.erro });
      }
      c.voz = resto; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Voz alterada", description: `Agora falo com \`${resto}\`.`, colour: COR.sucesso },
        { title: "✅ Voice changed", description: `Now speaking with \`${resto}\`.`, colour: COR.sucesso }));
    }
  }

  // ── &tts <texto> → falar ──
  const texto = args.join(" ").trim();
  if (!texto) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🔊 Voz da Judy",
      description: [
        `\`${PREFIXO}tts <texto>\` — fala na call`,
        `\`${PREFIXO}tts estado\` — diagnóstico`,
        "",
        `**Configuração** _(ManageMessages)_`,
        `\`${PREFIXO}tts canal <#voz>\` · \`${PREFIXO}tts transmitir <#texto>\``,
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` · \`${PREFIXO}tts on|off\``,
        `\`${PREFIXO}tts voz [nome]\` — escolhe a voz`,
      ].join("\n"), colour: COR.info,
    }, {
      title: "🔊 Judy's voice",
      description: [
        `\`${PREFIXO}tts <text>\` — speaks in the call`,
        `\`${PREFIXO}tts estado\` — diagnostics`,
        "",
        `**Configuration** _(ManageMessages)_`,
        `\`${PREFIXO}tts canal <#voice>\` · \`${PREFIXO}tts transmitir <#text>\``,
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` · \`${PREFIXO}tts on|off\``,
        `\`${PREFIXO}tts voz [name]\` — pick the voice`,
      ].join("\n"), colour: COR.info,
    }));
  }

  if (!c.ativo || !c.canalVoz) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Voz não configurada", description: `Defina o canal: \`${PREFIXO}tts canal <#voz>\``, colour: COR.erro },
      { title: "❌ Voice not set up", description: `Set the channel: \`${PREFIXO}tts canal <#voice>\``, colour: COR.erro }));
  }

  // Cooldown: o megafone precisa de freio, mesmo para quem é da casa.
  const chave = `${serverId}:${message.authorId}`;
  const espera = COOLDOWN_MS - (Date.now() - (ultimaFala.get(chave) ?? 0));
  if (espera > 0 && !ehStaff) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "⏳ Calma lá", description: `Espere ${Math.ceil(espera / 1000)}s para falar de novo.`, colour: COR.aviso },
      { title: "⏳ Slow down", description: `Wait ${Math.ceil(espera / 1000)}s before speaking again.`, colour: COR.aviso }));
  }
  ultimaFala.set(chave, Date.now());

  try {
    const r = await chamar("/falar", { canalVoz: c.canalVoz, texto, voz: c.voz });
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🔊 Speaking" : "🔊 Falando",
      description: `${texto.length > 120 ? texto.slice(0, 120) + "…" : texto}${
        r.naFila > 1 ? `\n\n_${lang === "en" ? "in queue" : "na fila"}: ${r.naFila}_` : ""}`,
      colour: COR.sucesso });
  } catch (e) {
    return sendEmbed(message.channel, {
      title: lang === "en" ? "❌ Couldn't speak" : "❌ Não consegui falar",
      description: `\`${e.message}\`\n\n${lang === "en" ? "Diagnose with" : "Diagnostique com"} \`${PREFIXO}tts estado\``,
      colour: COR.erro });
  }
}
