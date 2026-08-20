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
import * as abrev from "../core/abreviacoes.js";

const VOZ_URL   = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
const VOZ_CHAVE = process.env.VOZ_CHAVE || "";
const SERVIDORES = (process.env.TTS_SERVIDORES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Versão da interface que ESTE código espera do judy-voz. O serviço roda no
// Gentoo, fora do Docker, então os dois são atualizados por caminhos
// diferentes e podem ficar defasados — o pior estado possível, porque tudo
// "parece" atualizado e a fala sai sem efeito, em silêncio.
const VOZ_API_ESPERADA = 3;

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
  config.tts.cooldown ??= null;    // ms; null = usa o padrão do ambiente
  config.tts.anunciarNome ??= true;
  config.tts.dicionario ??= {};      // abreviações extras deste servidor
  config.tts.expandir ??= true;      // usar o dicionário embutido
  config.tts.efeito ??= null;        // caráter: glados, robo, radio…
  config.tts.tom ??= null;           // altura da voz (1.0 = original)
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
    const espera = c.cooldown ?? COOLDOWN_MS;
    if (agora - (ultimaFala.get(chave) ?? 0) < espera) return false;
    ultimaFala.set(chave, agora);

    // Numa conversa de verdade, ouvir "Fulano disse:" antes de cada frase
    // cansa rápido. Configurável, e o padrão continua anunciando porque numa
    // call com várias pessoas escrevendo é o que faz sentido.
    const nome = message.author?.username ?? "alguém";
    // Expande antes de cortar: "vc" ocupa 2 chars, "você" ocupa 4 — cortar
    // primeiro deixaria uma abreviação pela metade no fim da frase.
    const corpo = (c.expandir === false
      ? texto
      : abrev.expandir(texto, c.dicionario ?? {})).slice(0, MAX_CHARS);
    await chamar("/falar", {
      canalVoz: c.canalVoz,
      texto: c.anunciarNome === false ? corpo : `${nome} disse: ${corpo}`,
      voz: c.voz, efeito: c.efeito, tom: c.tom,
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

  // ── entrar / sair: LIBERADOS a todos ──
  //
  // O canal já foi escolhido pela staff; entrar nele é reversível e é
  // justamente o que quem está na call precisa fazer. Exigir ManageMessages
  // aqui significava que só o dono conseguia chamar a Judy — o recurso
  // existia para todos no papel e para uma pessoa na prática.
  //
  // O freio contra vai-e-vem é o mesmo cooldown das falas: quem não é staff
  // espera entre uma ação e outra.
  if (["entrar", "join", "sair", "leave"].includes(sub)) {
    const entrando = ["entrar", "join"].includes(sub);
    const chaveAcao = `${serverId}:${message.authorId}`;
    const faltam = (c.cooldown ?? COOLDOWN_MS) - (Date.now() - (ultimaFala.get(chaveAcao) ?? 0));
    if (faltam > 0 && !ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Calma lá", description: `Espere ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso },
        { title: "⏳ Slow down", description: `Wait ${Math.ceil(faltam / 1000)}s.`, colour: COR.aviso }));
    }
    ultimaFala.set(chaveAcao, Date.now());

    if (entrando) {
      if (!c.canalVoz) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falta configurar o canal",
            description: `Ninguém definiu em qual call a Judy fala.\n\nQuem tem **ManageMessages** resolve com \`${PREFIXO}tts canal aqui\` dentro da call.`,
            colour: COR.erro },
          { title: "❌ No channel configured",
            description: `Nobody set which call Judy speaks in.\n\nAnyone with **ManageMessages** can fix it with \`${PREFIXO}tts canal here\` inside the call.`,
            colour: COR.erro }));
      }
      if (!c.ativo) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "🔴 A voz está desligada",
            description: `Peça a alguém da equipe para religar com \`${PREFIXO}tts on\`.`, colour: COR.aviso },
          { title: "🔴 Voice is off",
            description: `Ask a staff member to turn it back on with \`${PREFIXO}tts on\`.`, colour: COR.aviso }));
      }
      try {
        await chamar("/entrar", { canalVoz: c.canalVoz });
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Entrei na call", description: `Estou em <#${c.canalVoz}>.\n\nManda o que eu falo: \`${PREFIXO}tts oi pessoal\``, colour: COR.sucesso },
          { title: "✅ Joined the call", description: `I'm in <#${c.canalVoz}>.\n\nTell me what to say: \`${PREFIXO}tts hello\``, colour: COR.sucesso }));
      } catch (e) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "❌ Couldn't join" : "❌ Não consegui entrar",
          description: `\`${e.message}\`\n\n${lang === "en" ? "See" : "Veja"} \`${PREFIXO}tts estado\``,
          colour: COR.erro });
      }
    }

    try { await chamar("/sair", { canalVoz: c.canalVoz }); } catch {}
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Saí da call", description: "Até a próxima.", colour: COR.sucesso },
      { title: "✅ Left the call", description: "See you.", colour: COR.sucesso }));
  }


  // ── configuração (staff) ──
  // ── &tts dicionario ── (consulta é pública, edição é staff)
  if (["dicionario", "dicionário", "dictionary", "dic", "abreviacoes", "abreviações"].includes(sub)) {
    const acao = (args[1] ?? "").toLowerCase();
    const arg = args.slice(2).join(" ").trim();

    if (!acao || ["lista", "list", "ver"].includes(acao)) {
      const meus = Object.entries(c.dicionario ?? {});
      return sendEmbed(message.channel, tr(ctx, {
        title: "📖 Dicionário da voz",
        description: [
          `**Embutido:** ${c.expandir === false ? "🔴 desligado" : `🟢 ${Object.keys(abrev.PADRAO).length} abreviações comuns`}`,
          `_(vc → você, n → não, pq → porque, kkkk → risada…)_`,
          "",
          `**Deste servidor:** ${meus.length ? meus.length : "_nenhuma_"}`,
          ...(meus.length ? [meus.map(([k, v]) => `\`${k}\` → ${v}`).join("\n")] : []),
          "",
          `\`${PREFIXO}tts dicionario add <abrev> <texto>\``,
          `\`${PREFIXO}tts dicionario remove <abrev>\` · \`${PREFIXO}tts dicionario padrao on|off\``,
        ].join("\n"),
        colour: COR.info,
      }, {
        title: "📖 Voice dictionary",
        description: [
          `**Built-in:** ${c.expandir === false ? "🔴 off" : `🟢 ${Object.keys(abrev.PADRAO).length} common abbreviations`}`,
          `_(vc → você, n → não, pq → porque, kkkk → laughter…)_`,
          "",
          `**This server's:** ${meus.length ? meus.length : "_none_"}`,
          ...(meus.length ? [meus.map(([k, v]) => `\`${k}\` → ${v}`).join("\n")] : []),
          "",
          `\`${PREFIXO}tts dicionario add <abbrev> <text>\``,
          `\`${PREFIXO}tts dicionario remove <abbrev>\` · \`${PREFIXO}tts dicionario padrao on|off\``,
        ].join("\n"),
        colour: COR.info,
      }));
    }

    const server0 = await getServer(message).catch(() => null);
    if (!membroTemPermissao(message, server0, "ManageMessages")) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para mexer no dicionário.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to change the dictionary.", colour: COR.erro }));
    }

    if (["add", "adicionar", "set"].includes(acao)) {
      const partes = arg.split(/\s+/);
      const chave = (partes.shift() ?? "").toLowerCase();
      const valor = partes.join(" ").trim();
      if (!chave || !valor) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Faltou algo",
            description: `Uso: \`${PREFIXO}tts dicionario add <abrev> <texto>\`\nEx.: \`${PREFIXO}tts dicionario add rt retuíte\``, colour: COR.erro },
          { title: "❌ Missing something",
            description: `Usage: \`${PREFIXO}tts dicionario add <abbrev> <text>\``, colour: COR.erro }));
      }
      if (chave.length > 20 || valor.length > 80) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Longo demais", description: "Abreviação até 20 e expansão até 80 caracteres.", colour: COR.erro },
          { title: "❌ Too long", description: "Abbreviation up to 20 and expansion up to 80 characters.", colour: COR.erro }));
      }
      if (Object.keys(c.dicionario).length >= 200) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Dicionário cheio", description: "O limite é de 200 entradas por servidor.", colour: COR.erro },
          { title: "❌ Dictionary full", description: "The limit is 200 entries per server.", colour: COR.erro }));
      }
      c.dicionario[chave] = valor; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "📖 Adicionado",
          description: `\`${chave}\` → **${valor}**\n\n_Exemplo:_ "${abrev.expandir(`teste ${chave} aqui`, c.dicionario)}"`,
          colour: COR.sucesso },
        { title: "📖 Added",
          description: `\`${chave}\` → **${valor}**`, colour: COR.sucesso }));
    }

    if (["remove", "remover", "rem", "del"].includes(acao)) {
      const chave = arg.toLowerCase();
      const tinha = chave in (c.dicionario ?? {});
      delete c.dicionario[chave]; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: tinha ? "📖 Removido" : "📖 Não estava no dicionário",
          description: tinha
            ? `\`${chave}\` não é mais expandido.`
            : `\`${chave}\` não constava. _(As abreviações embutidas não se removem uma a uma — use \`padrao off\`.)_`,
          colour: tinha ? COR.sucesso : COR.aviso },
        { title: tinha ? "📖 Removed" : "📖 Not in the dictionary",
          description: tinha ? `\`${chave}\` is no longer expanded.` : `\`${chave}\` wasn't there.`,
          colour: tinha ? COR.sucesso : COR.aviso }));
    }

    if (["padrao", "padrão", "default", "embutido"].includes(acao)) {
      c.expandir = !["off", "nao", "não", "no"].includes(arg.toLowerCase());
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: c.expandir ? "📖 Dicionário embutido ligado" : "📖 Dicionário embutido desligado",
          description: c.expandir
            ? "As abreviações comuns voltam a ser expandidas."
            : "Só o dicionário deste servidor vale agora — a escrita de chat será lida como está.",
          colour: COR.sucesso },
        { title: c.expandir ? "📖 Built-in dictionary on" : "📖 Built-in dictionary off",
          description: c.expandir ? "Common abbreviations are expanded again." : "Only this server's dictionary applies now.",
          colour: COR.sucesso }));
    }

    if (["limpar", "clear"].includes(acao)) {
      c.dicionario = {}; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "📖 Dicionário do servidor esvaziado", description: "As abreviações embutidas continuam valendo.", colour: COR.sucesso },
        { title: "📖 Server dictionary cleared", description: "The built-in abbreviations still apply.", colour: COR.sucesso }));
    }
  }

  if (["canal", "channel", "transmitir", "broadcast",
       "on", "off", "voz", "voice", "cooldown", "espera", "nomes", "names",
       "efeito", "effect", "timbre", "tom", "pitch", "altura"].includes(sub)) {
    if (!ehStaff) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageMessages** para configurar a voz.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageMessages** to configure the voice.", colour: COR.erro }));
    }

    if (["canal", "channel"].includes(sub)) {
      // Canais de voz do Stoat têm chat próprio, então `aqui` é o atalho
      // natural: você digita dentro da call que quer configurar. Sem alvo
      // nenhum, assume `aqui` — é o que a pessoa quis dizer.
      const alvo = resto || "aqui";
      const id = resolverCanal(alvo, { message, server });
      if (!id) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido",
            description: [
              `Não identifiquei um canal em \`${alvo}\`.`,
              "",
              `\`${PREFIXO}tts canal aqui\` — usa **este** canal (digite dentro da call)`,
              `\`${PREFIXO}tts canal <#canal>\` — por menção, link, ID ou nome`,
              "",
              "_Precisa ser um canal de **voz**._",
            ].join("\n"), colour: COR.erro },
          { title: "❌ Invalid channel",
            description: [
              `I couldn't identify a channel in \`${alvo}\`.`,
              "",
              `\`${PREFIXO}tts canal here\` — uses **this** channel (type it inside the call)`,
              `\`${PREFIXO}tts canal <#channel>\` — by mention, link, ID or name`,
              "",
              "_It must be a **voice** channel._",
            ].join("\n"), colour: COR.erro }));
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

    if (sub === "on" || sub === "off") {
      c.ativo = sub === "on"; salvarConfig?.();
      if (!c.ativo) { try { await chamar("/sair", { canalVoz: c.canalVoz }); } catch {} }
      return sendEmbed(message.channel, tr(ctx,
        { title: c.ativo ? "✅ Voz ligada" : "🔴 Voz desligada",
          description: c.ativo ? "A Judy volta a falar." : "Nada será falado até religar.", colour: COR.mod },
        { title: c.ativo ? "✅ Voice on" : "🔴 Voice off",
          description: c.ativo ? "Judy speaks again." : "Nothing will be spoken until re-enabled.", colour: COR.mod }));
    }

    if (["tom", "pitch", "altura"].includes(sub)) {
      if (!resto) {
        return sendEmbed(message.channel, tr(ctx, {
          title: "🎚️ Tom da voz",
          description: [
            `**Agora:** ${c.tom ?? 1}${c.tom && c.tom !== 1 ? "" : " _(original)_"}`,
            "",
            `\`${PREFIXO}tts tom 1.10\` — mais agudo · \`${PREFIXO}tts tom 0.92\` — mais grave`,
            `\`${PREFIXO}tts tom 1\` — volta ao original`,
            "",
            "_Sobe **tom e formantes juntos**: uma voz masculina vira feminina de verdade, não 'homem falando fino'._",
            "_Se a voz base já é feminina (como a `dii`), mexa pouco — acima de 1.05 começa a soar infantil._",
          ].join("\n"),
          colour: COR.info,
        }, {
          title: "🎚️ Voice pitch",
          description: [
            `**Now:** ${c.tom ?? 1}${c.tom && c.tom !== 1 ? "" : " _(original)_"}`,
            "",
            `\`${PREFIXO}tts tom 1.10\` — higher · \`${PREFIXO}tts tom 0.92\` — lower`,
            `\`${PREFIXO}tts tom 1\` — back to original`,
            "",
            "_Shifts **pitch and formants together**: a male voice becomes properly feminine, not a sped-up man._",
            "_If the base voice is already female (like `dii`), go easy — above 1.05 starts sounding childlike._",
          ].join("\n"),
          colour: COR.info,
        }));
      }
      const n = Number(resto.replace(",", "."));
      if (!Number.isFinite(n) || n < 0.5 || n > 2) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Valor inválido", description: `Entre 0.5 e 2.0. Ex.: \`${PREFIXO}tts tom 1.08\``, colour: COR.erro },
          { title: "❌ Invalid value", description: `Between 0.5 and 2.0. E.g.: \`${PREFIXO}tts tom 1.08\``, colour: COR.erro }));
      }
      c.tom = n === 1 ? null : n; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎚️ Tom ajustado",
          description: `${n === 1 ? "Voltou ao tom original." : `Tom em **${n}**.`}\n\nOuça: \`${PREFIXO}tts teste de voz\``,
          colour: COR.sucesso },
        { title: "🎚️ Pitch adjusted",
          description: `${n === 1 ? "Back to the original pitch." : `Pitch at **${n}**.`}`,
          colour: COR.sucesso }));
    }

    if (["efeito", "effect", "timbre"].includes(sub)) {
      let saude = null;
      try { saude = await chamar("/saude", null, "GET"); } catch {}
      const disp = saude?.efeitos ?? ["nenhum", "glados", "robo", "radio", "grave", "agudo", "sussurro"];
      const alvo = resto.toLowerCase();

      if (!alvo) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "🎛️ Voice effects" : "🎛️ Efeitos de voz",
          description: [
            ...disp.map((e) => `• \`${e}\`${e === (c.efeito ?? "nenhum") ? " ←" : ""}`),
            "",
            "",
            lang === "en"
              ? `_These change the **character** only — pitch is a separate knob: \`${PREFIXO}tts tom <n>\`. That way an effect sounds the same over any base voice._`
              : `_Estes mudam só o **caráter** — a altura é um controle à parte: \`${PREFIXO}tts tom <n>\`. Assim um efeito soa igual sobre qualquer voz base._`,
            "",
            lang === "en"
              ? "_There's no GLaDOS voice trained in Portuguese — the ready-made ones are English models from Portal. `glados` here is the **processing** (narrow band, metallic ring, chamber, slight pitch), applied over the voice you already use._"
              : "_Não existe voz GLaDOS treinada em português — as prontas são modelos ingleses do Portal. O `glados` aqui é o **processamento** (banda estreita, ressonância metálica, câmara e leve mudança de tom), aplicado sobre a voz que você já usa._",
          ].join("\n"),
          colour: COR.info });
      }

      // O serviço de voz é atualizado à parte (roda no Gentoo, fora do
      // Docker). Se ele não conhece efeitos que este código já conhece, está
      // com versão antiga — e aceitar o pedido faria a fala sair SEM efeito,
      // silenciosamente. Melhor dizer o que houve e como resolver.
      if (saude && Number(saude.versao ?? 0) < VOZ_API_ESPERADA) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "⚠️ Serviço de voz desatualizado",
            description: [
              `O bot espera a versão **${VOZ_API_ESPERADA}** do serviço de voz, mas o \`judy-voz\` responde **${saude.versao ?? "1"}** — a fala sairia sem efeito.`,
              "",
              "No Gentoo:",
              "```sudo rc-service judy-voz restart```",
              `Depois: \`${PREFIXO}tts efeito\` para ver a lista completa.`,
            ].join("\n"), colour: COR.aviso },
          { title: "⚠️ Voice service is outdated",
            description: [
              `The bot expects voice service version **${VOZ_API_ESPERADA}**, but \`judy-voz\` reports **${saude.versao ?? "1"}** — speech would come out with no effect.`,
              "",
              "On the Gentoo box:",
              "```sudo rc-service judy-voz restart```",
            ].join("\n"), colour: COR.aviso }));
      }

      if (!disp.includes(alvo)) {
        return sendEmbed(message.channel, {
          title: lang === "en" ? "❌ Unknown effect" : "❌ Efeito desconhecido",
          description: `\`${alvo}\`\n\n${disp.map((e) => `\`${e}\``).join(", ")}`, colour: COR.erro });
      }
      c.efeito = alvo === "nenhum" ? null : alvo; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎛️ Efeito aplicado",
          description: `Agora falo com \`${alvo}\`.\n\nOuça: \`${PREFIXO}tts teste de voz\``, colour: COR.sucesso },
        { title: "🎛️ Effect applied",
          description: `Now speaking with \`${alvo}\`.\n\nHear it: \`${PREFIXO}tts voice test\``, colour: COR.sucesso }));
    }

    if (["cooldown", "espera"].includes(sub)) {
      const seg = Number(resto.replace(",", "."));
      if (!Number.isFinite(seg) || seg < 0 || seg > 300) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Valor inválido",
            description: `Uso: \`${PREFIXO}tts cooldown <segundos>\` (0 a 300)\n_0 desliga o freio — cuidado em canal movimentado._`, colour: COR.erro },
          { title: "❌ Invalid value",
            description: `Usage: \`${PREFIXO}tts cooldown <seconds>\` (0 to 300)\n_0 removes the brake — careful on a busy channel._`, colour: COR.erro }));
      }
      c.cooldown = Math.round(seg * 1000); salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Freio ajustado",
          description: seg === 0
            ? "Sem espera entre falas da mesma pessoa.\n\n⚠️ Num canal movimentado isso vira uma fila enorme de fala."
            : `Cada pessoa espera **${seg}s** entre uma fala e outra.`,
          colour: seg === 0 ? COR.aviso : COR.sucesso },
        { title: "✅ Brake adjusted",
          description: seg === 0
            ? "No wait between the same person's utterances.\n\n⚠️ On a busy channel this builds a huge speech queue."
            : `Each person waits **${seg}s** between utterances.`,
          colour: seg === 0 ? COR.aviso : COR.sucesso }));
    }

    if (["nomes", "names"].includes(sub)) {
      const ligar = !["off", "nao", "não", "no"].includes(resto.toLowerCase());
      c.anunciarNome = ligar; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: ligar ? "✅ Anunciando quem falou" : "✅ Só o texto",
          description: ligar ? '_"Fulano disse: bom dia"_' : '_"bom dia"_',
          colour: COR.sucesso },
        { title: ligar ? "✅ Announcing who spoke" : "✅ Text only",
          description: ligar ? '_"Someone said: good morning"_' : '_"good morning"_',
          colour: COR.sucesso }));
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
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` — chama ou dispensa a Judy`,
        `\`${PREFIXO}tts estado\` — diagnóstico`,
        "_Estes valem para **todo mundo**._",
        "",
        `**Configuração** _(ManageMessages)_`,
        `\`${PREFIXO}tts canal aqui\` — define a call em que você está`
        + `\n\`${PREFIXO}tts transmitir aqui\` — **tudo** que for escrito aqui vira fala`
        + `\n\`${PREFIXO}tts canal <#voz>\` · \`${PREFIXO}tts voz\` · \`${PREFIXO}tts efeito\``
        + `\n\`${PREFIXO}tts tom <n>\` · \`${PREFIXO}tts cooldown <s>\` · \`${PREFIXO}tts nomes on|off\` · \`${PREFIXO}tts dicionario\``,
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` · \`${PREFIXO}tts on|off\``,
        `\`${PREFIXO}tts voz [nome]\` — escolhe a voz`,
      ].join("\n"), colour: COR.info,
    }, {
      title: "🔊 Judy's voice",
      description: [
        `\`${PREFIXO}tts <text>\` — speaks in the call`,
        `\`${PREFIXO}tts entrar\` · \`${PREFIXO}tts sair\` — call or dismiss Judy`,
        `\`${PREFIXO}tts estado\` — diagnostics`,
        "_These are open to **everyone**._",
        "",
        `**Configuration** _(ManageMessages)_`,
        `\`${PREFIXO}tts canal here\` — sets the call you are in`
        + `\n\`${PREFIXO}tts transmitir here\` — **everything** written here becomes speech`
        + `\n\`${PREFIXO}tts canal <#voice>\` · \`${PREFIXO}tts cooldown <s>\` · \`${PREFIXO}tts nomes on|off\``,
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
  const espera = (c.cooldown ?? COOLDOWN_MS) - (Date.now() - (ultimaFala.get(chave) ?? 0));
  if (espera > 0 && !ehStaff) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "⏳ Calma lá", description: `Espere ${Math.ceil(espera / 1000)}s para falar de novo.`, colour: COR.aviso },
      { title: "⏳ Slow down", description: `Wait ${Math.ceil(espera / 1000)}s before speaking again.`, colour: COR.aviso }));
  }
  ultimaFala.set(chave, Date.now());

  const falado = c.expandir === false ? texto : abrev.expandir(texto, c.dicionario ?? {});
  try {
    const r = await chamar("/falar", { canalVoz: c.canalVoz, texto: falado, voz: c.voz, efeito: c.efeito, tom: c.tom });
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🔊 Speaking" : "🔊 Falando",
      description: `${falado.length > 120 ? falado.slice(0, 120) + "…" : falado}${
        r.naFila > 1 ? `\n\n_${lang === "en" ? "in queue" : "na fila"}: ${r.naFila}_` : ""}`,
      colour: COR.sucesso });
  } catch (e) {
    return sendEmbed(message.channel, {
      title: lang === "en" ? "❌ Couldn't speak" : "❌ Não consegui falar",
      description: `\`${e.message}\`\n\n${lang === "en" ? "Diagnose with" : "Diagnostique com"} \`${PREFIXO}tts estado\``,
      colour: COR.erro });
  }
}
