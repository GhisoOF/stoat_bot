// &info (id `sobre`) e &ping — saíram do geral.js no P2 (31 out 2026).
// (namespace: os módulos de outras áreas mudam no P2 — um nome que sumir dá `false`, não derruba o boot)
import * as modelo from "./modelo.js";   // (P4) a IA que sobrou: só a da moderação
import { citar, citarInterno } from "../core/aliases.js";
import { URL_POLITICA } from "../ferramentas/privacidade.js";
import { GRUPOS_AUTOMOD, estadoDoGrupo, escadaDePunicao, rotuloDegrau } from "./automod-engine.js";
import { servidorNaLista } from "../core/env.js";
import * as db from "../core/db.js";
import * as banGlobal from "./ban-global.js";
import { soDoDono } from "./visao.js";   // (P4) os comandos só do dono do bot (só na DM) não contam aqui
import { nomeModo } from "../core/nomes-automod.js";
import { tr, lingua } from "../core/i18n.js";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";


// Conta as linhas de código do projeto (uma vez, com cache).
let _linhasCache = null;
function contarLinhas() {
  if (_linhasCache !== null) return _linhasCache;
  try {
    const aqui = dirname(fileURLToPath(import.meta.url));      // modulos/moderacao
    const raizModulos = join(aqui, "..");                       // modulos/
    const raizProjeto = join(raizModulos, "..");               // raiz
    let total = 0;
    try { total += readFileSync(join(raizProjeto, "main.js"), "utf8").split("\n").length; } catch { /* arquivo ilegível: fica fora da conta */ }
    for (const sub of readdirSync(raizModulos, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const pasta = join(raizModulos, sub.name);
      for (const f of readdirSync(pasta)) {
        if (f.endsWith(".js")) {
          try { total += readFileSync(join(pasta, f), "utf8").split("\n").length; } catch { /* arquivo ilegível: fica fora da conta */ }
        }
      }
    }
    _linhasCache = total || null;
  } catch { _linhasCache = null; }
  return _linhasCache;
}


// %ping — mede a latência entre o envio da mensagem e o processamento
export async function cmdPing(message, args, ctx) {
  const { sendEmbed, COR } = ctx;
  // 17 out 2026: era `Date.now() - message.createdAt` — o relógio DESTA máquina
  // contra o do Stoat (o createdAt sai do ID da mensagem). Com o relógio da
  // máquina adiantado, o ping marcava 64973 ms com a resposta no mesmo minuto.
  // Agora as duas pontas vêm do Stoat: o ID do comando e o ID da resposta.
  const tempo = (m) => { const t = new Date(m?.createdAt ?? NaN).getTime(); return Number.isFinite(t) ? t : null; };
  const t0 = Date.now();
  const resposta = await sendEmbed(message.channel, { title: "🏓 Pong!", description: tr(ctx, "Medindo…", "Measuring…", "Midiendo…"), colour: COR.sucesso });
  const api = Date.now() - t0;
  const doComando = tempo(message), daResposta = tempo(resposta);
  if (typeof resposta?.edit !== "function") return resposta;
  const ida = doComando != null && daResposta != null ? Math.max(0, daResposta - doComando) : null;
  // quanto o relógio da máquina difere do Stoat: o meio do envio ≈ a hora da resposta lá
  const desvio = daResposta != null ? Math.round(t0 + api / 2 - daResposta) : 0;
  const verDesvio = Math.abs(desvio) >= 2000 && ctx.ehSuperAdmin?.(message.authorId);
  const s = (ms) => (Math.abs(ms) >= 10000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`);
  const description = tr(ctx, [
    ida != null ? `Resposta: **${s(ida)}** _(do seu comando até esta mensagem, pelo relógio do Stoat)_` : null,
    `Envio à API: **${s(api)}**`,
    verDesvio ? `\n⚠️ O relógio da máquina do bot está **${s(Math.abs(desvio))} ${desvio > 0 ? "adiantado" : "atrasado"}** em relação ao Stoat. Prazos e a idade das contas usam esse relógio — ligue a sincronização de hora (NTP) na máquina.` : null,
  ], [
    ida != null ? `Reply: **${s(ida)}** _(from your command to this message, by the Stoat's clock)_` : null,
    `API send: **${s(api)}**`,
    verDesvio ? `\n⚠️ The bot machine's clock is **${s(Math.abs(desvio))} ${desvio > 0 ? "ahead of" : "behind"}** the Stoat's. Timers and account age use that clock — turn on time sync (NTP) on the machine.` : null,
  ], [
    ida != null ? `Respuesta: **${s(ida)}** _(desde tu comando hasta este mensaje, según el reloj del Stoat)_` : null,
    `Envío a la API: **${s(api)}**`,
    verDesvio ? `\n⚠️ El reloj de la máquina del bot va **${s(Math.abs(desvio))} ${desvio > 0 ? "adelantado" : "atrasado"}** respecto al Stoat. Los plazos y la antigüedad de las cuentas usan ese reloj — activa la sincronización de hora (NTP) en la máquina.` : null,
  ]).filter(Boolean).join("\n")
    .replace(/[\u2063\u2064]/g, "");   // a edição vai crua ao Stoat: tira a marca de "texto pronto" do espanhol
  await resposta.edit({ embeds: [{ title: "🏓 Pong!", description, colour: COR.sucesso }] }).catch(() => {});
  return resposta;
}


// &info (id `sobre`) — o bot neste servidor, os números, os créditos e o suporte
export async function cmdInfo(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, estado, config, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  // (P4) a IA ficou só na moderação: o juiz dos temas proibidos e a visão das imagens
  const juiz = modelo.temJuiz();
  const visao = modelo.temServico() && !!modelo.modeloVisao();
  const comIA = juiz || visao;

  // conta comandos, linhas e uptime de forma resiliente
  // Um comando por função (os apelidos apontam para a mesma), sem os que não
  // valem aqui: desativados neste servidor, os só do dono do bot (P4: só na DM — o nível
  // "dono" do MAPA do visao.js) e o &cargomudo aposentado.
  const nComandos = (() => {
    if (!estado?.rotas) return null;
    const porFuncao = new Map();
    for (const [nome, fn] of Object.entries(estado.rotas)) if (!porFuncao.has(fn)) porFuncao.set(fn, nome);
    const fora = new Set(["cargomudo", ...(config?.comandosDesativados ?? [])]);
    return [...porFuncao.values()].filter((n) => !fora.has(n) && !soDoDono(n)).length;
  })();
  const nLinhas = contarLinhas();
  const up = process.uptime();
  const dias = Math.floor(up / 86400);
  const horas = Math.floor((up % 86400) / 3600);
  const mins = Math.floor((up % 3600) / 60);
  const uptime = dias > 0 ? `${dias}d ${horas}h` : horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;

  const am = config?.automod ?? {};
  // A mesma lista do &automod (antes: 9 fixos, sem o antiduplicata e o antiimagem).
  // os quatro grupos do automod (um grupo conta como ligado se alguma parte está)
  const gruposAm = Object.keys(GRUPOS_AUTOMOD).map((g) => estadoDoGrupo(am, g));
  const modulosOn = gruposAm.filter((x) => x.ligadas > 0).length;
  const nModulos = gruposAm.length;
  const vozAqui = servidorNaLista("TTS_SERVIDORES", serverId);
  const nomeBot = ctx.client?.user?.displayName || "Judy";   // o nome de exibição; a conta (username) pode chamar outra coisa, como "Cobaia"
  const criador = (process.env.CRIADOR || "").trim();
  const xpOn = !!config?.xp?.enabled;
  const logOn = !!config?.log?.canalId;
  const rssN = (() => { try { return db.listarFeeds?.(serverId)?.length ?? 0; } catch { return 0; } })();
  const banGlobalModo = banGlobal.modoDe(config);
  const idioma = en ? "English" : "Português";

  const sim = (v) => v ? "🟢" : "🔴";
  const estadoEN = () => [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/${nModulos} groups on${am.antiScam?.enabled ? ` · sentinel ${am.antiScam.porAntiguidade !== false ? "(stricter with newcomers)" : "on"}` : ""}`,
    `⚖️ **Punishment** — \`${nomeModo(config?.automod?.punicao?.modo ?? "avisar", "en")}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "es")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Leveling (XP)** — ${xpOn ? "on" : "off"}`,
    `${sim(logOn)} **Log channel** — ${logOn ? `<#${config.log.canalId}>` : "not set"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Global ban list** — mode \`${banGlobalModo}\``,
    `${sim(comIA)} **Moderation AI** — ${comIA ? [juiz && "confirms banned topics", visao && "looks at images and profile pictures"].filter(Boolean).join(" · ") : "off"}`,
    `🎫🪝🔊 **Tickets · Webhooks · Voice** — ${db.listarTickets(serverId).length} open ticket(s) · ${db.listarGanchos(serverId).length} webhook(s) · ${!vozAqui ? "voice and music not available here" : config?.tts?.ativo && config?.tts?.canalVoz ? `voice and music in <#${config.tts.canalVoz}>` : `voice and music: \`${citarInterno("entrar", PREFIXO)}\` from any channel, while in a call`}`,
  ];
  const estadoPT = () => [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/${nModulos} grupos ligados${am.antiScam?.enabled ? ` · sentinela ${am.antiScam.porAntiguidade !== false ? "(mais rígido com novatos)" : "ligado"}` : ""}`,
    `⚖️ **Punição** — \`${config?.automod?.punicao?.modo ?? "avisar"}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "pt")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Níveis (XP)** — ${xpOn ? "ligado" : "desligado"}`,
    `${sim(logOn)} **Canal de log** — ${logOn ? `<#${config.log.canalId}>` : "não definido"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Lista global de bans** — modo \`${banGlobalModo}\``,
    `${sim(comIA)} **IA da moderação** — ${comIA ? [juiz && "confirma os temas proibidos", visao && "olha imagens e fotos de perfil"].filter(Boolean).join(" · ") : "desligada"}`,
    `🎫🪝🔊 **Tickets · Webhooks · Voz** — ${db.listarTickets(serverId).length} ticket(s) aberto(s) · ${db.listarGanchos(serverId).length} webhook(s) · ${!vozAqui ? "voz e música indisponíveis aqui" : config?.tts?.ativo && config?.tts?.canalVoz ? `voz e música em <#${config.tts.canalVoz}>` : `voz e música: \`${citarInterno("entrar", PREFIXO)}\` de qualquer canal, estando numa call`}`,
  ];
  const estadoES = () => [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/${nModulos} grupos activados${am.antiScam?.enabled ? ` · centinela ${am.antiScam.porAntiguidade !== false ? "(más estricto con los recién llegados)" : "activado"}` : ""}`,
    `⚖️ **Sanción** — \`${nomeModo(config?.automod?.punicao?.modo ?? "avisar", "es")}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "es")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Niveles (XP)** — ${xpOn ? "activado" : "desactivado"}`,
    `${sim(logOn)} **Canal de registro** — ${logOn ? `<#${config.log.canalId}>` : "no definido"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Lista global de bans** — modo \`${banGlobalModo}\``,
    `${sim(comIA)} **IA de la moderación** — ${comIA ? [juiz && "confirma los temas prohibidos", visao && "mira imágenes y fotos de perfil"].filter(Boolean).join(" · ") : "desactivada"}`,
    `🎫🪝🔊 **Tickets · Webhooks · Voz** — ${db.listarTickets(serverId).length} ticket(s) abierto(s) · ${db.listarGanchos(serverId).length} webhook(s) · ${!vozAqui ? "voz y música no disponibles aquí" : config?.tts?.ativo && config?.tts?.canalVoz ? `voz y música en <#${config.tts.canalVoz}>` : `voz y música: \`${citar("entrar", "es", PREFIXO)}\` desde cualquier canal, estando en una llamada`}`,
  ];
  // só o idioma da tela é montado (cada lista consulta o banco)
  const estadoLinhas = tr(ctx, estadoPT, estadoEN, estadoES)();

  // Links entre < >: continuam clicáveis, sem a prévia que o Stoat gera.
  const creditos = `_${criador ? `Criada por **${criador}**. ` : ""}Software livre ([código](<https://github.com/GhisoOF/stoat_bot>), [privacidade](<${URL_POLITICA}>)), feito com [stoat.js](<https://github.com/stoatchat/javascript-client-sdk>) — rode o seu! 🚀_`;
  const creditosEN = `_${criador ? `Made by **${criador}**. ` : ""}Free software ([source](<https://github.com/GhisoOF/stoat_bot>), [privacy](<${URL_POLITICA}>)), built with [stoat.js](<https://github.com/stoatchat/javascript-client-sdk>) — run your own! 🚀_`;
  const creditosES = `_${criador ? `Creada por **${criador}**. ` : ""}Software libre ([código](<https://github.com/GhisoOF/stoat_bot>), [privacidad](<${URL_POLITICA}>)), hecha con [stoat.js](<https://github.com/stoatchat/javascript-client-sdk>) — ¡monta la tuya! 🚀_`;

  await sendEmbed(message.channel, tr(ctx, {
    title: `🤖 ${nomeBot}`,
    description: [
      `Bot de moderação, automod, níveis${comIA ? ", voz e IA" : " e voz"} para o Stoat.`,
      "",
      "**Neste servidor**",
      ...estadoLinhas.filter(Boolean),
      "",
      "**O bot**",
      nComandos ? `**Comandos disponíveis aqui:** ${nComandos}` : null,
      nLinhas ? `**Linhas de código:** ${nLinhas.toLocaleString("pt-BR")}` : null,
      `**No ar há:** ${uptime}  ·  **Idioma:** ${idioma}`,
      "",
      "**Suporte:** Chame **Ghiso#4419** no privado",
      creditos,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  }, {
    title: `🤖 ${nomeBot}`,
    description: [
      `Moderation, automod, levels${comIA ? ", voice and AI" : " and voice"} bot for Stoat.`,
      "",
      "**On this server**",
      ...estadoLinhas.filter(Boolean),
      "",
      "**The bot**",
      nComandos ? `**Commands available here:** ${nComandos}` : null,
      nLinhas ? `**Lines of code:** ${nLinhas.toLocaleString("en-US")}` : null,
      `**Uptime:** ${uptime}  ·  **Language:** ${idioma}`,
      "",
      "**Support:** DM **Ghiso#4419**",
      creditosEN,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  }, {
    title: `🤖 ${nomeBot}`,
    description: [
      `Bot de moderación, automod, niveles${comIA ? ", voz e IA" : " y voz"} para el Stoat.`,
      "",
      "**En este servidor**",
      ...estadoLinhas.filter(Boolean),
      "",
      "**El bot**",
      nComandos ? `**Comandos disponibles aquí:** ${nComandos}` : null,
      nLinhas ? `**Líneas de código:** ${nLinhas.toLocaleString("es-ES")}` : null,
      `**En línea desde hace:** ${uptime}  ·  **Idioma:** Español`,
      "",
      "**Soporte:** Escribe a **Ghiso#4419** por privado",
      creditosES,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  }));
}


// o nome antigo (os testes e quem importava)
export const cmdSobre = cmdInfo;
