// &musica — música nas calls (YouTube, SoundCloud e Spotify), com fila e
// ducking automático: quando alguém usa o &tts, a música abaixa sozinha para
// a fala ser ouvida e volta ao normal depois. O áudio roda no serviço de voz
// (voz-servico/musica.js); aqui é só o comando conversando com as rotas.

import { lingua, tr } from "../core/i18n.js";
import { citar, citarInterno } from "../core/aliases.js";
import { callParaMusica } from "./tts.js";
import { nivelDePrioridade } from "../core/prioridade.js";
import { registrarErro } from "../core/erros.js";

const VOZ_URL   = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
const VOZ_CHAVE = process.env.VOZ_CHAVE || "";

// (31 out 2026, P1, R10) Os erros daqui são frases curtas, sem nome de variável nem a
// mensagem crua da rede (o detalhe vai ao log). `codigo` escolhe a frase nos 3 idiomas.
async function pedirVoz(rota, corpo = null) {
  if (!VOZ_URL) return { erro: true, codigo: "sem-servico" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);   // resolver playlist demora
  try {
    const r = await fetch(`${VOZ_URL}${rota}`, {
      method: corpo ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...(VOZ_CHAVE ? { "x-chave": VOZ_CHAVE } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
    });
    return await r.json();
  } catch (e) {
    registrarErro("MUSICA", e);
    return { erro: true, codigo: e.name === "AbortError" ? "demorou" : "fora" };
  } finally { clearTimeout(t); }
}
function erroDaVoz(r, ctx) {
  if (r?.codigo === "sem-servico") return tr(ctx, "o serviço de voz não está ligado nesta instalação.", "the voice service isn't running on this install.", "el servicio de voz no está activo en esta instalación.");
  if (r?.codigo === "demorou") return tr(ctx, "o serviço de voz demorou demais.", "the voice service took too long.", "el servicio de voz tardó demasiado.");
  if (r?.codigo === "fora") return tr(ctx, "o serviço de voz está fora do ar agora.", "the voice service is down right now.", "el servicio de voz está caído ahora.");
  return String(r?.erro ?? "");
}

function duracaoTxt(s) {
  if (!s) return "";
  const m = Math.floor(s / 60), r = String(Math.floor(s % 60)).padStart(2, "0");
  return ` \`${m}:${r}\``;
}

const APELIDOS = {
  tocar: "tocar", play: "retomar", p: "tocar", add: "tocar",
  pausar: "pausar", pausa: "pausar", pause: "pausar",
  retomar: "retomar", voltar: "retomar", resume: "retomar", continuar: "retomar",
  pular: "pular", skip: "pular", proxima: "pular", "próxima": "pular", next: "pular",
  fila: "fila", lista: "fila", queue: "fila", np: "fila",
  parar: "parar", stop: "parar", limpar: "parar",
  volume: "volume", vol: "volume",
  loop: "loop", repetir: "loop",
  ajuda: "ajuda", help: "ajuda",
};

// O modo do `&musica loop`: o serviço de voz entende faixa|fila|nao; a tela em
// inglês ensina track|queue|off (17 out 2026: o `track` chegava cru e o serviço
// respondia "modos: nao, faixa ou fila").
export function modoDoLoop(texto) {
  return { track: "faixa", song: "faixa", queue: "fila", off: "nao", no: "nao", none: "nao", não: "nao" }[String(texto ?? "").toLowerCase()] ?? (texto || "nao");
}

export async function cmdMusica(msg, args, ctx) {
  const lang = lingua(ctx);
  const en = lang === "en";
  const sub0 = String(args[0] ?? "").toLowerCase();
  let sub = APELIDOS[sub0] ?? null;
  let resto = args.slice(1).join(" ").trim();

  // `&musica <link ou nome>` direto = tocar; `&musica play <algo>` também toca
  if (!sub && sub0) { sub = "tocar"; resto = args.join(" ").trim(); }
  if (sub === "retomar" && resto) sub = "tocar";
  if (!sub) sub = "ajuda";

  if (sub === "ajuda") {
    return ctx.sendEmbed(msg.channel, {
      title: tr(ctx, "🎵 Música", "🎵 Music", "🎵 Música"),
      description: tr(ctx,
        "`" + citarInterno("musica") + " <link ou nome>` — tocar (YouTube, SoundCloud, Spotify; playlists também)\n`" + citarInterno("musica.pausar") + "` · `" + citarInterno("musica") + " play` — pausar / retomar\n`" + citarInterno("musica") + " skip` — próxima faixa\n`" + citarInterno("musica.fila") + "` — lista de reprodução atual\n`" + citarInterno("musica.parar") + "` — parar e limpar\n`" + citarInterno("musica") + " volume 80` — 0 a 200%\n`" + citarInterno("musica") + " loop faixa|fila|nao`\n\nO bot precisa estar numa call (`" + citarInterno("entrar") + "`). Quando o TTS fala, a música abaixa sozinha.",
        "`" + citarInterno("musica") + " <link or name>` — play (YouTube, SoundCloud, Spotify; playlists too)\n`" + citarInterno("musica") + " pause` · `" + citarInterno("musica") + " play` — pause / resume\n`" + citarInterno("musica") + " skip` — next track\n`" + citarInterno("musica") + " queue` — current queue\n`" + citarInterno("musica") + " stop` — stop and clear\n`" + citarInterno("musica") + " volume 80` — 0 to 200%\n`" + citarInterno("musica") + " loop track|queue|off`\n\nThe bot must be in a call (`" + citarInterno("entrar") + "`). When TTS speaks, the music ducks automatically.",
        "`" + citar("musica", "es") + " <link o nombre>` — reproducir (YouTube, SoundCloud, Spotify; también playlists)\n`" + citar("musica.pausar", "es") + "` · `" + citar("musica", "es") + " play` — pausar / reanudar\n`" + citar("musica", "es") + " skip` — siguiente pista\n`" + citar("musica.fila", "es") + "` — cola actual\n`" + citar("musica.parar", "es") + "` — detener y vaciar\n`" + citar("musica", "es") + " volume 80` — de 0 a 200%\n`" + citar("musica", "es") + " loop track|queue|off`\n\nEl bot tiene que estar en una llamada (`" + citar("entrar", "es") + "`). Cuando el TTS habla, la música baja sola."),
      colour: ctx.COR.info,
    });
  }

  // A call deste servidor (ou a da pessoa, entrando nela) — de qualquer canal.
  const alvo = await callParaMusica(msg, ctx);
  if (alvo.erro) {
    const txt = {
      fora: tr(ctx, "A música não está liberada neste servidor.", "Music isn't enabled on this server.", "La música no está habilitada en este servidor."),
      "sem-call": tr(ctx, "Não estou em nenhuma call deste servidor. Entre numa call e use `" + citarInterno("musica") + "` (ou `" + citarInterno("entrar") + "`) de qualquer canal — eu vou até você.", "I'm not in a call on this server. Join a call and use `" + citarInterno("musica") + "` (or `" + citarInterno("entrar") + "`) from any channel — I'll come to you.", "No estoy en ninguna llamada de este servidor. Entra en una llamada y usa `" + citar("musica", "es") + "` (o `" + citar("entrar", "es") + "`) desde cualquier canal — yo voy contigo."),
      entrar: tr(ctx, "Não consegui entrar na sua call — tente de novo daqui a pouco.", "I couldn't join your call — try again in a moment.", "No pude entrar en tu llamada — inténtalo de nuevo en un momento."),
    }[alvo.erro];
    if (alvo.detalhe) registrarErro("MUSICA", alvo.detalhe);
    return ctx.sendEmbed(msg.channel, { title: "🎵", description: `⚠️ ${txt}`, colour: ctx.COR.aviso });
  }
  const canal = alvo.canal;
  const aviso = alvo.entrou ? tr(ctx, `_Entrei em <#${canal}>._\n`, `_Joined <#${canal}>._\n`, `_Entré en <#${canal}>._\n`) : "";

  if (sub === "fila") {
    const r = await pedirVoz(`/musica/fila?canal=${encodeURIComponent(canal)}`);
    if (r.erro) return ctx.sendEmbed(msg.channel, { title: "🎵", description: `⚠️ ${erroDaVoz(r, ctx)}`, colour: ctx.COR.aviso });
    if (!r.atual && !r.total && !r.ultimoAviso) {
      return ctx.sendEmbed(msg.channel, {
        title: tr(ctx, "🎵 Fila", "🎵 Queue", "🎵 Cola"),
        description: tr(ctx, "Nada tocando. `" + citarInterno("musica") + " <link ou nome>` para começar.", "Nothing playing. `" + citarInterno("musica") + " <link or name>` to start.", "No suena nada. `" + citar("musica", "es") + " <link o nombre>` para empezar."),
        colour: ctx.COR.info,
      });
    }
    const linhas = [];
    if (r.atual) linhas.push(tr(ctx, "**Agora:** ", "**Now:** ", "**Ahora:** ") + `**${r.atual.titulo}**${duracaoTxt(r.atual.duracao)}`);
    for (const i of r.fila ?? []) linhas.push(`\`${i.n}.\` ${i.titulo}${duracaoTxt(i.duracao)}`);
    if (r.total > (r.fila?.length ?? 0)) linhas.push(tr(ctx, `…e mais ${r.total - r.fila.length}`, `…and ${r.total - r.fila.length} more`, `…y ${r.total - r.fila.length} más`));
    if (r.loop && r.loop !== "nao") linhas.push(`🔁 loop: ${r.loop}`);
    if (r.ultimoAviso) linhas.push(tr(ctx, `⚠️ Não tocou: **${r.ultimoAviso.titulo}** — ${r.ultimoAviso.motivo}`, `⚠️ Didn't play: **${r.ultimoAviso.titulo}** — ${r.ultimoAviso.motivo}`, `⚠️ No se reprodujo: **${r.ultimoAviso.titulo}** — ${r.ultimoAviso.motivo}`));
    return ctx.sendEmbed(msg.channel, { title: tr(ctx, "🎵 Fila", "🎵 Queue", "🎵 Cola"), description: linhas.join("\n"), colour: ctx.COR.info });
  }

  let r;
  if (sub === "tocar") {
    if (!resto) {
      return ctx.sendEmbed(msg.channel, {
        title: "🎵",
        description: tr(ctx, "Me diga o que tocar: `" + citarInterno("musica") + " <link ou nome>`.", "Tell me what to play: `" + citarInterno("musica") + " <link or name>`.", "Dime qué reproducir: `" + citar("musica", "es") + " <link o nombre>`."),
        colour: ctx.COR.aviso,
      });
    }
    // servidor do dono do bot / o dono: passa na frente se a máquina estiver no teto de músicas
    const server = await Promise.resolve(ctx.getServer?.(msg)).catch(() => null);
    r = await pedirVoz("/musica/tocar", { canal, consulta: resto, prioridade: nivelDePrioridade({ userId: msg.authorId, serverId: ctx.serverId, server }) });
  } else if (sub === "volume") {
    const v = Number(String(resto).replace("%", ""));
    r = await pedirVoz("/musica/volume", { canal, valor: Number.isFinite(v) ? v / 100 : NaN });
  } else if (sub === "loop") {
    r = await pedirVoz("/musica/loop", { canal, modo: modoDoLoop(resto) });
  } else {
    r = await pedirVoz(`/musica/${sub}`, { canal });
  }

  if (r.erro) return ctx.sendEmbed(msg.channel, { title: "🎵", description: `⚠️ ${erroDaVoz(r, ctx)}`, colour: ctx.COR.aviso });
  return ctx.sendEmbed(msg.channel, { title: "🎵", description: aviso + (r.mensagem ?? "ok"), colour: ctx.COR.sucesso });
}
