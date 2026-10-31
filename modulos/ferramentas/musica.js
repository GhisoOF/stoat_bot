// &musica — música nas calls (YouTube, SoundCloud e Spotify), com fila e
// ducking automático: quando alguém usa o &tts, a música abaixa sozinha para
// a fala ser ouvida e volta ao normal depois. O áudio roda no serviço de voz
// (voz-servico/musica.js); aqui é só o comando conversando com as rotas.

import { lingua, tr, idiomaDe } from "../core/i18n.js";
import { erroDeUso, ajudaDe } from "../core/saida.js";
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

// (P2, 31 out 2026) O serviço de voz responde em português; a tela em inglês e em
// espanhol troca as frases conhecidas aqui (o título da faixa, entre **, fica como veio).
const FRASES_MUSICA = [
  [/^⏸ Pausado\.$/, "⏸ Paused.", "⏸ En pausa."],
  [/^▶ Voltando\.$/, "▶ Resuming.", "▶ Reanudando."],
  [/^não há nada tocando\.$/, "nothing is playing.", "no suena nada."],
  [/^não há nada pausado\.$/, "nothing is paused.", "no hay nada en pausa."],
  [/^⏹ Parei e limpei a fila\.$/, "⏹ Stopped and cleared the queue.", "⏹ Detenido y cola vaciada."],
  [/^já estava tudo parado\.$/, "everything was already stopped.", "ya estaba todo detenido."],
  [/^🔊 Volume em (\d+)%\.$/, "🔊 Volume at $1%.", "🔊 Volumen al $1%."],
  [/^volume entre 0 e 200 \(em %\)\.$/, "volume between 0 and 200 (in %).", "volumen entre 0 y 200 (en %)."],
  [/^modos: `nao`, `faixa` ou `fila`\.$/, "modes: `off`, `track` or `queue`.", "modos: `off`, `track` o `queue`."],
  [/^🔁 Loop desligado\.$/, "🔁 Loop off.", "🔁 Bucle desactivado."],
  [/^🔁 Loop de faixa ligado\.$/, "🔁 Track loop on.", "🔁 Bucle de pista activado."],
  [/^🔁 Loop de fila ligado\.$/, "🔁 Queue loop on.", "🔁 Bucle de cola activado."],
  [/^➕ (\*\*.+\*\*)(.*) na fila \(posição (\d+)\)\.$/, "➕ $1$2 queued (position $3).", "➕ $1$2 en la cola (posición $3)."],
  [/^(\d+) faixa\(s\) de (\*\*.+\*\*) na fila\.$/, "$1 track(s) from $2 queued.", "$1 pista(s) de $2 en la cola."],
  [/^⏭ Pulei (\*\*.+\*\*)\.$/, "⏭ Skipped $1.", "⏭ Salté $1."],
  [/^Fila vazia\.$/, "Queue empty.", "Cola vacía."],
  [/^▶ Tocando (\*\*.+\*\*)(.*?)\.$/, "▶ Playing $1$2.", "▶ Sonando $1$2."],
  [/^▶ Tocando (\*\*.+\*\*)(.*?) — a versão pedida \((\*\*.+\*\*)\) tem (.+), então achei outra\.$/, "▶ Playing $1$2 — the requested version ($3) has $4, so I found another.", "▶ Sonando $1$2 — la versión pedida ($3) tiene $4, así que busqué otra."],
  [/^⚠️ Não consegui tocar (\*\*.+\*\*) — (.+), e nenhuma outra versão funcionou\.(.*)$/, "⚠️ Couldn't play $1 — $2, and no other version worked.", "⚠️ No pude reproducir $1 — $2, y ninguna otra versión funcionó."],
  [/^Não consegui tocar (\*\*.+\*\*) — (.+), e nenhuma outra versão funcionou\.(.*)$/, "Couldn't play $1 — $2, and no other version worked.", "No pude reproducir $1 — $2, y ninguna otra versión funcionó."],
  [/^estou tocando música em (\d+) calls agora — o máximo desta máquina \((\d+)\)\. Tenta de novo daqui a pouco\.$/, "I'm playing music in $1 calls right now — this machine's maximum ($2). Try again in a bit.", "estoy reproduciendo música en $1 llamadas ahora — el máximo de esta máquina ($2). Inténtalo de nuevo en un rato."],
];
const MOTIVOS_MUSICA = {
  "restrição de idade no YouTube": ["age restriction on YouTube", "restricción de edad en YouTube"],
  "o YouTube pediu verificação anti-robô": ["YouTube asked for an anti-bot check", "YouTube pidió una verificación anti-robot"],
  "bloqueado na região": ["blocked in this region", "bloqueado en esta región"],
  "vídeo indisponível": ["video unavailable", "vídeo no disponible"],
  "o vídeo não abriu": ["the video didn't open", "el vídeo no se abrió"],
  "parei para dar lugar a um servidor com prioridade (a máquina estava no limite de músicas ao mesmo tempo)": ["stopped to make room for a priority server (the machine was at its music limit)", "lo detuve para dar lugar a un servidor con prioridad (la máquina estaba en su límite de música)"],
};
export function traduzirMusica(texto, lang) {
  if (lang !== "en" && lang !== "es") return String(texto ?? "");
  const k = lang === "en" ? 1 : 2;
  return String(texto ?? "").split("\n").map((linha) => {
    let l = linha;
    for (const [pt, tr2] of Object.entries(MOTIVOS_MUSICA)) l = l.replaceAll(pt, tr2[k - 1]);
    for (const f of FRASES_MUSICA) if (f[0].test(l)) return l.replace(f[0], f[k]);
    return l;
  }).join("\n");
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
  const tela = idiomaDe(ctx);
  const doServico = (t) => traduzirMusica(t, tela);

  // sem nada: erro de uso, uma linha (a explicação mora no `&help musica`)
  if (sub === "ajuda" && !sub0) return erroDeUso(ctx, msg.channel, "musica", "Faltou o link ou o nome.", "Missing the link or name.", "Falta el enlace o el nombre.");
  if (sub === "ajuda") return ctx.sendEmbed(msg.channel, { description: `ℹ️ ${ajudaDe(ctx, "musica")}`, colour: ctx.COR.info });

  // A call deste servidor (ou a da pessoa, entrando nela) — de qualquer canal.
  const alvo = await callParaMusica(msg, ctx);
  if (alvo.erro) {
    const txt = {
      fora: tr(ctx, "A música não está liberada neste servidor.", "Music isn't enabled on this server.", "La música no está habilitada en este servidor."),
      "sem-call": tr(ctx, "Não estou em nenhuma call deste servidor — entre numa call primeiro.", "I'm not in a call on this server — join a call first.", "No estoy en ninguna llamada de este servidor — entra en una llamada primero."),
      entrar: tr(ctx, "Não consegui entrar na sua call — tente de novo daqui a pouco.", "I couldn't join your call — try again in a moment.", "No pude entrar en tu llamada — inténtalo de nuevo en un momento."),
    }[alvo.erro];
    if (alvo.detalhe) registrarErro("MUSICA", alvo.detalhe);
    return ctx.sendEmbed(msg.channel, { description: `⚠️ ${txt}`, colour: ctx.COR.aviso });
  }
  const canal = alvo.canal;
  const aviso = alvo.entrou ? tr(ctx, `_Entrei em <#${canal}>._\n`, `_Joined <#${canal}>._\n`, `_Entré en <#${canal}>._\n`) : "";

  if (sub === "fila") {
    const r = await pedirVoz(`/musica/fila?canal=${encodeURIComponent(canal)}`);
    if (r.erro) return ctx.sendEmbed(msg.channel, { description: `⚠️ ${erroDaVoz(r, ctx)}`, colour: ctx.COR.aviso });
    if (!r.atual && !r.total && !r.ultimoAviso) {
      return ctx.sendEmbed(msg.channel, { description: tr(ctx, "🎵 Nada tocando.", "🎵 Nothing playing.", "🎵 No suena nada."), colour: ctx.COR.info });
    }
    const linhas = [];
    if (r.atual) linhas.push(tr(ctx, "**Agora:** ", "**Now:** ", "**Ahora:** ") + `**${r.atual.titulo}**${duracaoTxt(r.atual.duracao)}`);
    for (const i of r.fila ?? []) linhas.push(`\`${i.n}.\` ${i.titulo}${duracaoTxt(i.duracao)}`);
    if (r.total > (r.fila?.length ?? 0)) linhas.push(tr(ctx, `…e mais ${r.total - r.fila.length}`, `…and ${r.total - r.fila.length} more`, `…y ${r.total - r.fila.length} más`));
    if (r.loop && r.loop !== "nao") linhas.push(`🔁 loop: ${r.loop}`);
    if (r.ultimoAviso) linhas.push(tr(ctx, `⚠️ Não tocou: **${r.ultimoAviso.titulo}** — ${r.ultimoAviso.motivo}`, `⚠️ Didn't play: **${r.ultimoAviso.titulo}** — ${doServico(r.ultimoAviso.motivo)}`, `⚠️ No se reprodujo: **${r.ultimoAviso.titulo}** — ${doServico(r.ultimoAviso.motivo)}`));
    return ctx.sendEmbed(msg.channel, { title: tr(ctx, "🎵 Fila", "🎵 Queue", "🎵 Cola"), description: linhas.join("\n"), colour: ctx.COR.info });
  }

  let r;
  if (sub === "tocar") {
    if (!resto) {
      return erroDeUso(ctx, msg.channel, "musica", "Faltou o link ou o nome.", "Missing the link or name.", "Falta el enlace o el nombre.");
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

  if (r.erro) return ctx.sendEmbed(msg.channel, { description: `⚠️ ${r.codigo ? erroDaVoz(r, ctx) : doServico(r.erro)}`, colour: ctx.COR.aviso });
  return ctx.sendEmbed(msg.channel, { description: aviso + doServico(r.mensagem ?? "ok"), colour: ctx.COR.sucesso });
}
