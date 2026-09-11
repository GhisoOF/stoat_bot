// &musica — música nas calls (YouTube, SoundCloud e Spotify), com fila e
// ducking automático: quando alguém usa o &tts, a música abaixa sozinha para
// a fala ser ouvida e volta ao normal depois. O áudio roda no serviço de voz
// (voz-servico/musica.js); aqui é só o comando conversando com as rotas.

import { lingua } from "../core/i18n.js";

const VOZ_URL   = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
const VOZ_CHAVE = process.env.VOZ_CHAVE || "";

async function pedirVoz(rota, corpo = null) {
  if (!VOZ_URL) return { erro: "serviço de voz desligado (VOZ_ATIVA=1 no .env liga tudo: TTS e música)." };
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
    return { erro: e.name === "AbortError" ? "o serviço de voz demorou demais." : `serviço de voz fora do ar (${e.message}).` };
  } finally { clearTimeout(t); }
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
      title: en ? "🎵 Music" : "🎵 Música",
      description: en
        ? "`&musica <link or name>` — play (YouTube, SoundCloud, Spotify; playlists too)\n`&musica pausar` · `&musica play` — pause / resume\n`&musica skip` — next track\n`&musica fila` — current queue\n`&musica parar` — stop and clear\n`&musica volume 80` — 0 to 200%\n`&musica loop faixa|fila|nao`\n\nThe bot must be in a call (`&tts entrar #channel`). When TTS speaks, the music ducks automatically."
        : "`&musica <link ou nome>` — tocar (YouTube, SoundCloud, Spotify; playlists também)\n`&musica pausar` · `&musica play` — pausar / retomar\n`&musica skip` — próxima faixa\n`&musica fila` — lista de reprodução atual\n`&musica parar` — parar e limpar\n`&musica volume 80` — 0 a 200%\n`&musica loop faixa|fila|nao`\n\nO bot precisa estar numa call (`&tts entrar #canal`). Quando o TTS fala, a música abaixa sozinha.",
      color: ctx.COR.info,
    });
  }

  if (sub === "fila") {
    const r = await pedirVoz("/musica/fila");
    if (r.erro) return ctx.sendEmbed(msg.channel, { title: "🎵", description: `⚠️ ${r.erro}`, color: ctx.COR.aviso });
    if (!r.atual && !r.total) {
      return ctx.sendEmbed(msg.channel, {
        title: en ? "🎵 Queue" : "🎵 Fila",
        description: en ? "Nothing playing. `&musica <link or name>` to start." : "Nada tocando. `&musica <link ou nome>` para começar.",
        color: ctx.COR.info,
      });
    }
    const linhas = [];
    if (r.atual) linhas.push((en ? "**Now:** " : "**Agora:** ") + `**${r.atual.titulo}**${duracaoTxt(r.atual.duracao)}`);
    for (const i of r.fila ?? []) linhas.push(`\`${i.n}.\` ${i.titulo}${duracaoTxt(i.duracao)}`);
    if (r.total > (r.fila?.length ?? 0)) linhas.push(en ? `…and ${r.total - r.fila.length} more` : `…e mais ${r.total - r.fila.length}`);
    if (r.loop && r.loop !== "nao") linhas.push(`🔁 loop: ${r.loop}`);
    return ctx.sendEmbed(msg.channel, { title: en ? "🎵 Queue" : "🎵 Fila", description: linhas.join("\n"), color: ctx.COR.info });
  }

  let r;
  if (sub === "tocar") {
    if (!resto) {
      return ctx.sendEmbed(msg.channel, {
        title: "🎵",
        description: en ? "Tell me what to play: `&musica <link or name>`." : "Me diga o que tocar: `&musica <link ou nome>`.",
        color: ctx.COR.aviso,
      });
    }
    r = await pedirVoz("/musica/tocar", { consulta: resto });
  } else if (sub === "volume") {
    const v = Number(String(resto).replace("%", ""));
    r = await pedirVoz("/musica/volume", { valor: Number.isFinite(v) ? v / 100 : NaN });
  } else if (sub === "loop") {
    r = await pedirVoz("/musica/loop", { modo: resto || "nao" });
  } else {
    r = await pedirVoz(`/musica/${sub}`, {});
  }

  if (r.erro) return ctx.sendEmbed(msg.channel, { title: "🎵", description: `⚠️ ${r.erro}`, color: ctx.COR.aviso });
  return ctx.sendEmbed(msg.channel, { title: "🎵", description: r.mensagem ?? "ok", color: ctx.COR.sucesso });
}
