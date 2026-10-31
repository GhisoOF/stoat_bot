// &config — tudo o que o servidor configura (P2, 31 out 2026).
//
// `&config log|idioma|acesso|comando …` são as partes que eram comandos soltos (os
// nomes antigos são atalhos, ver modulos/comandos/config.js). O `&config` sozinho
// mostra a configuração INTEIRA, gerada do `padraoServidor` (core/config-store.js):
// cada chave de lá vira uma linha com o rótulo de config-rotulos.js — chave nova no
// molde aparece aqui sem ninguém lembrar de escrever a linha (o teste confere).
import { citar, trechoPronto } from "../core/aliases.js";
import { tr, idiomaDe } from "../core/i18n.js";
import { padraoServidor } from "../core/config-store.js";
import { paginarLinhas, enviarPaginado } from "../core/paginas.js";
import { SECOES, rotulo } from "./config-rotulos.js";
import { cmdLog } from "./config-log.js";
import { cmdIdioma } from "./config-idioma.js";
import { cmdAcesso } from "./acesso.js";
import { cmdComando } from "./comandos-admin.js";
import { nomeModo, nomeSens, nomeAcaoTema, nomeAcaoAvatar } from "../core/nomes-automod.js";
import { subExibido } from "../core/aliases.js";
import * as db from "../core/db.js";
import { servidorNaLista } from "../core/env.js";
// (namespace: módulos de outras áreas mudam no P2; um nome que sumir não derruba o boot)
import * as economiaMod from "../ferramentas/economia.js";
import * as gating from "../ai/gating.js";
import * as iaMod from "../ai/conversa-config.js";   // &config ia (o handler é da área da IA)
// a CHAVE do padraoServidor (`config.language`), não o subcomando em inglês (o registro traduz `language` → `idioma`)
const CHAVE_IDIOMA = "language";
const ECO_PADRAO = economiaMod.PADRAO ?? { nome: "Moeda", simbolo: "🪙", ganhoMin: 10, ganhoMax: 30, intervaloMs: 3600e3 };
const iaNoEnv = (sid) => !!gating.iaNoEnv?.(sid), conversaAqui = (sid, c) => !!gating.conversaAqui?.(sid, c), imagemAqui = (sid, c) => !!gating.imagemAqui?.(sid, c);

const SENSIBILIDADE = { baixa: "baixa (limiar 7,5/10)", media: "média (limiar 6,5/10)", alta: "alta (limiar 5,5/10)" };
const SENSIBILIDADE_EN = { baixa: "low (threshold 7.5/10)", media: "medium (threshold 6.5/10)", alta: "high (threshold 5.5/10)" };
const SENSIBILIDADE_ES = { baixa: "baja (umbral 7,5/10)", media: "media (umbral 6,5/10)", alta: "alta (umbral 5,5/10)" };

// ── As partes (os comandos que o &config absorveu) ──
const PARTES = { log: cmdLog, idioma: cmdIdioma, acesso: cmdAcesso, comando: cmdComando, ia: (m, a, c) => iaMod.cmdConfigIA(m, a, c) };

export async function cmdConfig(message, args, ctx) {
  const parte = String(args[0] ?? "").toLowerCase();
  if (PARTES[parte]) return PARTES[parte](message, args.slice(1), ctx);

  const { config, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO: P } = ctx;
  const lang = idiomaDe(ctx);
  if (args.length) {
    const ajuda = `\`${citar("help", lang, P)} ${citar("config", lang, "")}\``;
    return sendEmbed(message.channel, { colour: COR.erro, description: tr(ctx,
      `❓ \`${String(args[0]).slice(0, 30)}\` não é parte do config. ${ajuda}`,
      `❓ \`${String(args[0]).slice(0, 30)}\` isn't part of config. ${ajuda}`,
      `❓ \`${String(args[0]).slice(0, 30)}\` no es parte de config. ${ajuda}`) });
  }
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { colour: COR.erro, description: tr(ctx,
      "🚫 Ver as configurações pede **ManagePermissions**.",
      "🚫 Viewing the settings needs **ManagePermissions**.",
      "🚫 Ver la configuración requiere **ManagePermissions**.") });
  }
  const { linhas } = telaDoConfig(config, { lang, serverId: ctx.serverId, P: ctx.PREFIXO });
  const titulo = tr(ctx, "⚙️ Configurações deste servidor", "⚙️ This server's settings", "⚙️ Configuración de este servidor");
  // o espanhol sai pronto (a tradução da tela é feita para o inglês)
  const marca = lang === "es" ? (t) => trechoPronto(t) : (t) => t;
  return enviarPaginado(ctx, message.channel, {
    paginas: paginarLinhas(linhas.map(marca), { titulo }),
    autorId: message.authorId,
    colour: COR.info,
  });
}

// ── A tela inteira, gerada do padraoServidor ──
// Devolve as linhas e os caminhos cobertos (o teste confere que são TODOS os do molde).
const BANDEIRAS = ["enabled", "ativo", "ativa"];
const ehObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const ID = /^[0-9A-Z]{20,32}$/;
const ehCanal = (k) => /^(canal|canais|canaisLiberados|alertChannelId|logCanal|canalAnuncio|canalId|canalVoz|canalTexto|regrasCanal)$/.test(k);
const ehCargo = (k) => /^(roleId|silenceRoleId|cargoEquipe|cargosStaff|cargos)$/.test(k);
const visaoNoEnv = () => !!(process.env.LLM_MODEL_VISAO || process.env.MODELO_VISAO || process.env.LLM_MODEL_MODERACAO || process.env.MODELO_MODERACAO);

export function telaDoConfig(config, { lang = "pt", serverId = null, P = "&" } = {}) {
  const T = (pt, en, es) => (lang === "es" ? es : lang === "en" ? en : pt);
  const cobertos = new Set();
  const nada = "—";
  const listaIds = (ids, f) => (ids.length ? ids.slice(0, 5).map(f).join(" ") + (ids.length > 5 ? ` +${ids.length - 5}` : "") : nada);

  const valor = (cam, v) => {
    const k = cam.at(-1);
    if (v === undefined || v === null || v === "") {
      if (k === "punicao") return T("a geral", "the global one", "el general");
      // (P2) sem canal próprio, o alerta vai ao LOG (a tela antiga dizia "o canal da mensagem")
      if (k === "alertChannelId") return config?.log?.canalId ? T("(o log)", "(the log)", "(el registro)") : T("— (sem log, não há alerta)", "— (no log, no alerts)", "— (sin registro, no hay alertas)");
      return nada;
    }
    if (typeof v === "boolean") return v ? "🟢" : "🔴";
    if (typeof v === "number") {
      if (/Ms$/.test(k) || k === "cooldown") return `${Math.round(v / 100) / 10}s`;
      if (k === "threshold" || k === "limiteZalgo") return `${Math.round(v * 100)}%`;
      return String(v);
    }
    if (typeof v === "string") {
      if (ehCanal(k) && ID.test(v)) return `<#${v}>`;
      if (ehCargo(k) && ID.test(v)) return `<%${v}>`;
      // (P2) o valor guardado é o nome interno (português): na tela, o nome do idioma (o que se digita)
      const L = lang === "es" ? "es" : lang;
      if (k === "modo" && cam[1] === "punicao") return `\`${nomeModo(v, L)}\``;
      if (k === "modo" && cam[0] === "acesso") return `\`${subExibido("config.acesso", v, L)}\``;
      if (k === "modo" && cam[0] === "chatLivre") return `\`${subExibido("config.ia", v, L)}\``;
      if (k === "acao" && cam[1] === "antiAvatar") return `\`${nomeAcaoAvatar(v, L)}\``;
      if (k === "sensibilidade" || k === "sensitivity") return `\`${nomeSens(v, L)}\``;
      if (cam[2] === "acoes") return `\`${nomeAcaoTema(v, L)}\``;
      if (k === "escada") return `\`${v.split(",").map((d) => (d.trim() === "aviso" ? T("aviso", "warn", "warn") : d.trim())).join(",")}\``;
      if (v.length > 40) return T(`✓ (${v.length} caracteres)`, `✓ (${v.length} characters)`, `✓ (${v.length} caracteres)`);
      return `\`${v}\``;
    }
    if (Array.isArray(v)) {
      if (!v.length) return nada;
      if (ehCanal(k) || (k === "lista" && cam[0] === "acesso")) return listaIds(v.filter((x) => typeof x === "string"), (x) => `<#${x}>`);
      if (ehCargo(k)) return listaIds(v.filter((x) => typeof x === "string"), (x) => `<%${x}>`);
      if (k === "comandosDesativados" || k === "livres" || k === "inviteWhitelist" || k === "dominiosPermitidos") return v.slice(0, 8).map((x) => `\`${String(x).slice(0, 30)}\``).join(" ") + (v.length > 8 ? ` +${v.length - 8}` : "");
      return String(v.length);
    }
    if (ehObj(v)) {
      if (k === "punicao") return v.modo ? `\`${nomeModo(v.modo, lang === "es" ? "es" : lang)}\`` : T("a geral", "the global one", "el general");
      const n = Object.keys(v).length;
      return n ? String(n) : nada;
    }
    return String(v);
  };

  // uma linha "rótulo valor · rótulo valor" com as folhas de um objeto (desce nos objetos de dentro)
  const folhas = (cam, padrao, atual) => {
    const partes = [];
    for (const [k, p] of Object.entries(padrao)) {
      const c = [...cam, k];
      cobertos.add(c.join("."));
      if (BANDEIRAS.includes(k)) continue;   // o 🟢/🔴 do começo da linha
      const v = atual?.[k];
      if (ehObj(p) && Object.keys(p).length && k !== "punicao") {
        // um objeto com chaves conhecidas (os eventos do log, as ações dos assuntos): cada uma
        const dentro = Object.entries(p).map(([k2]) => { cobertos.add([...c, k2].join(".")); return `${rotulo([...c, k2], lang)} ${valor([...c, k2], v?.[k2])}`; });
        partes.push(`${rotulo(c, lang)}: ${dentro.join(", ")}`);
        continue;
      }
      if (ehObj(p) && k === "punicao") for (const k2 of Object.keys(p)) cobertos.add([...c, k2].join("."));
      // a punição própria de um módulo só aparece quando existe (sem ela, vale a geral, logo abaixo)
      if (k === "punicao" && cam.length > 1 && !v) continue;
      partes.push(`${rotulo(c, lang)} ${valor(c, v)}`);
    }
    return partes.join(" · ");
  };
  const bandeira = (padrao, atual) => { const k = BANDEIRAS.find((b) => b in padrao); return k ? (atual?.[k] === true ? "🟢" : "🔴") : "•"; };

  // as partes que não funcionam sem o modelo de visão: nem ✓ nem 🟢 (estavam "ligadas" mortas)
  const semVisao = !visaoNoEnv();
  const morto = (cam) => semVisao && (cam === "automod.antiImagem" || cam === "automod.antiAvatar");

  // as chaves cujo padrão depende do idioma do servidor (o módulo preenche): um resumo próprio
  const resumoProprio = {
    boasVindas: (v) => (v?.ativo && v?.canalId ? `🟢 <#${v.canalId}>` : "🔴"),
    adeus: (v) => (v?.ativo && v?.canalId ? `🟢 <#${v.canalId}>` : "🔴"),
    // a escolha do servidor (null = o padrão de quem hospeda): mostra o que vale de fato
    ia: () => (!iaNoEnv(serverId) ? T("_indisponível neste servidor_", "_not available on this server_", "_no disponible en este servidor_")
      : `${rotulo(["ia", "chat"], lang)} ${conversaAqui(serverId, config) ? "🟢" : "🔴"} · ${rotulo(["ia", "imagem"], lang)} ${imagemAqui(serverId, config) ? "🟢" : "🔴"}`),
    economia: (v) => { const e = { ...ECO_PADRAO, ...(v ?? {}) }; return `${e.simbolo} ${v?.nome ?? T(ECO_PADRAO.nome, "Coin", "Moneda")} · +${e.ganhoMin}–${e.ganhoMax} / ${Math.round(e.intervaloMs / 60000)} min`; },
  };

  // o que não é chave de config mas mora junto (contagens do banco): no fim da linha da seção
  const conta = (f) => { try { return f() ?? 0; } catch (e) { void e; return 0; } };
  const extras = {
    rss: () => ` · ${conta(() => db.listarFeeds(serverId).length)} feed(s)`,
    xp: () => ` · ${T("cargos de nível", "level roles", "roles de nivel")} ${conta(() => db.listarCargosNivel(serverId).length)}`,
    autorole: () => `\n🎭 **${T("Cargos por reação", "Reaction roles", "Roles por reacción")}** — ${conta(() => db.listReactionRolesServidor(serverId).length)} ${T("regra(s)", "rule(s)", "regla(s)")}`,
    tickets: () => ` · ${T("abertos agora", "open now", "abiertos ahora")} ${conta(() => db.listarTickets(serverId).length)}`,
  };
  const linhas = [];
  for (const [k, p] of Object.entries(padraoServidor)) {
    const sec = SECOES[k];
    const nome = sec?.[lang] ?? k;
    const v = config?.[k];
    cobertos.add(k);
    if (resumoProprio[k]) {
      for (const k2 of Object.keys(p)) cobertos.add(`${k}.${k2}`);
      linhas.push(`${sec.emoji} **${nome}:** ${resumoProprio[k](v)}`);
      continue;
    }
    if (k === CHAVE_IDIOMA) { linhas.push(`${sec.emoji} **${nome}:** ${({ pt: "Português", en: "English", es: "Español" })[v] ?? v}`); continue; }
    if (!ehObj(p)) { linhas.push(`${sec.emoji} **${nome}:** ${valor([k], v)}`); continue; }
    const temSubsecoes = Object.values(p).some((x) => ehObj(x) && BANDEIRAS.some((b) => b in x));
    if (!temSubsecoes) {
      // a voz só existe nos servidores de TTS_SERVIDORES: fora deles, nem 🟢 nem 🔴
      const semVoz = k === "tts" && !servidorNaLista("TTS_SERVIDORES", serverId);
      const b = semVoz ? "⚫" : bandeira(p, v);
      const nota = semVoz ? ` ${T("_(indisponível neste servidor)_", "_(not available on this server)_", "_(no disponible en este servidor)_")}`
        : k === "tts" && !(v?.ativo && v?.canalVoz) ? ` ${T(`_(fora da call — \`${citar("entrar", "pt", P)}\`)_`, `_(not in a call — \`${citar("entrar", "en", P)}\`)_`, `_(fuera de la llamada — \`${citar("entrar", "es", P)}\`)_`)}` : "";
      linhas.push(`${sec.emoji}${b === "•" ? "" : ` ${b}`} **${nome}**${nota} — ${folhas([k], p, v)}${extras[k]?.() ?? ""}`);
      continue;
    }
    // uma seção com módulos (o automod): cabeçalho, uma linha por módulo, e o resto numa linha
    linhas.push("", `**${sec.emoji} ${nome}**`);
    const resto = {};
    for (const [k2, p2] of Object.entries(p)) {
      const c = `${k}.${k2}`;
      if (!(ehObj(p2) && BANDEIRAS.some((b) => b in p2))) { resto[k2] = p2; continue; }
      cobertos.add(c);
      const st = morto(c) ? "⚫" : bandeira(p2, v?.[k2]);
      const extra = morto(c) ? ` ${T("_(sem o modelo de visão)_", "_(no vision model)_", "_(sin el modelo de visión)_")}` : "";
      linhas.push(`${st} **${rotulo([k, k2], lang)}**${extra} — ${folhas([k, k2], p2, v?.[k2])}`);
    }
    if (Object.keys(resto).length) {
      for (const [k2, p2] of Object.entries(resto)) {
        const c = [k, k2];
        cobertos.add(c.join("."));
        if (ehObj(p2) && Object.keys(p2).length) linhas.push(`• **${rotulo(c, lang)}** — ${folhas(c, p2, v?.[k2])}`);
        else linhas.push(`• **${rotulo(c, lang)}:** ${valor(c, v?.[k2])}`);
      }
    }
    linhas.push("");
  }
  // as punições ativas agora (não é configuração, mas é o que a staff procura aqui)
  try {
    const agora = Date.now();
    const vivas = db.getDb().prepare("SELECT userId, avisos, silenciado, silencioAte FROM punicoes WHERE serverId = ? AND (avisos > 0 OR silenciado = 1) ORDER BY avisos DESC LIMIT 5").all(serverId)
      .map((x) => ({ ...x, calado: x.silenciado && (!x.silencioAte || x.silencioAte > agora) })).filter((x) => x.avisos > 0 || x.calado);
    if (vivas.length) linhas.push("", `**🚨 ${T("Punições ativas", "Active punishments", "Castigos activos")}**`,
      ...vivas.map((x) => `• <@${x.userId}> — ${x.avisos} ${T("aviso(s)", "warning(s)", "aviso(s)")}${x.calado ? T(" · 🔇 silenciado", " · 🔇 timed out", " · 🔇 silenciado") : ""}`));
  } catch (e) { void e; /* banco fechado (testes de tela): segue sem a seção */ }
  return { linhas: linhas.filter((l, i, a) => !(l === "" && (i === 0 || a[i - 1] === ""))), cobertos };
}


// O que cada parte do automod faz, com os números DESTE servidor — usado no
// painel `&automod <grupo>` (no &config as partes saem só pelo nome).
export function descreverFiltro(am, chave, lang = "pt", estado = {}) {
  const en = lang === "en";
  const L_SENS = lang === "es" ? SENSIBILIDADE_ES : en ? SENSIBILIDADE_EN : SENSIBILIDADE;
  const T = (pt, enTxt, es) => (lang === "es" ? trechoPronto(es) : en ? enTxt : pt);
  const seg = (ms) => `${Math.round((ms ?? 0) / 100) / 10}s`;
  const detalhe = {
    antiSpam:        () => T(`${am.antiSpam.maxMessages} msg em ${seg(am.antiSpam.windowMs)}`, `${am.antiSpam.maxMessages} msg in ${seg(am.antiSpam.windowMs)}`, `${am.antiSpam.maxMessages} msg en ${seg(am.antiSpam.windowMs)}`),
    antiMassSpam:    () => T(`${am.antiMassSpam.maxMessages} msg em ${seg(am.antiMassSpam.windowMs)}`, `${am.antiMassSpam.maxMessages} msg in ${seg(am.antiMassSpam.windowMs)}`, `${am.antiMassSpam.maxMessages} msg en ${seg(am.antiMassSpam.windowMs)}`),
    antiDuplicata:   () => T(`${am.antiDuplicata?.maxRepetidas ?? 3}× a mesma mensagem em ${seg(am.antiDuplicata?.windowMs ?? 120000)} (curta: ${(am.antiDuplicata?.maxRepetidas ?? 3) + 2}×)`, `${am.antiDuplicata?.maxRepetidas ?? 3}× the same message in ${seg(am.antiDuplicata?.windowMs ?? 120000)} (short: ${(am.antiDuplicata?.maxRepetidas ?? 3) + 2}×)`, `${am.antiDuplicata?.maxRepetidas ?? 3}× el mismo mensaje en ${seg(am.antiDuplicata?.windowMs ?? 120000)} (corto: ${(am.antiDuplicata?.maxRepetidas ?? 3) + 2}×)`),
    antiImagem:      () => T("imagens de contas novas descritas pelo modelo de visão; avisa a staff", "images from new accounts described by the vision model; alerts staff", "imágenes de cuentas nuevas descritas por el modelo de visión; avisa al staff"),
    antiAssuntos:    () => {
      const ativos = Object.entries(am.antiAssuntos?.acoes ?? {}).filter(([, a]) => a && a !== "off");
      return ativos.length ? ativos.map(([t, a]) => `${t} → ${a}`).join(", ") : T("nenhum tema ligado", "no topic on", "ningún tema activado");
    },
    antiAvatar:      () => T(`ao entrar e ao trocar → ${am.antiAvatar?.acao ?? "silenciar"}`, `on join and on change → ${am.antiAvatar?.acao ?? "silenciar"}`, `al entrar y al cambiarla → ${am.antiAvatar?.acao ?? "silenciar"}`),
    antiInvite:      () => T("bloqueia convites", "blocks invites", "bloquea invitaciones"),
    antiMassMention: () => T(`máx. ${am.antiMassMention.maxMentions} menções`, `max ${am.antiMassMention.maxMentions} mentions`, `máx. ${am.antiMassMention.maxMentions} menciones`),
    antiCaps:        () => T(`≥${am.antiCaps.minLength} caracteres e ${Math.round(am.antiCaps.threshold * 100)}% maiúsculas`, `≥${am.antiCaps.minLength} chars and ${Math.round(am.antiCaps.threshold * 100)}% uppercase`, `≥${am.antiCaps.minLength} caracteres y ${Math.round(am.antiCaps.threshold * 100)}% mayúsculas`),
    antiLink:        () => T(`${(estado?.blockedDomains?.size ?? 0).toLocaleString("pt-BR")} domínio(s) na lista`, `${(estado?.blockedDomains?.size ?? 0).toLocaleString("en-US")} domain(s) listed`, `${(estado?.blockedDomains?.size ?? 0).toLocaleString("es-ES")} dominio(s) en la lista`),
    antiScam:        () => T(`sensibilidade ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`, `sensitivity ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`, `sensibilidad ${L_SENS[am.antiScam.sensitivity] ?? am.antiScam.sensitivity}`),
    antiCaracteres:  () => T("texto distorcido (zalgo) e caracteres invisíveis", "distorted (zalgo) text and invisible characters", "texto distorsionado (zalgo) y caracteres invisibles"),
    antiOdio:        () => T(`ofensas raciais/homofóbicas (de fábrica${am.antiOdio?.termos?.length ? ` + ${am.antiOdio.termos.length}` : ""})`, `racial/homophobic slurs (built-in${am.antiOdio?.termos?.length ? ` + ${am.antiOdio.termos.length}` : ""})`, `insultos racistas/homófobos (de fábrica${am.antiOdio?.termos?.length ? ` + ${am.antiOdio.termos.length}` : ""})`),
    antiEmoji:       () => T(`${am.antiEmoji?.maxEmojis ?? 20}+ emojis numa mensagem`, `${am.antiEmoji?.maxEmojis ?? 20}+ emojis in one message`, `${am.antiEmoji?.maxEmojis ?? 20}+ emojis en un mensaje`),
    antiMidia:       () => T(`mais de ${am.antiMidia?.maxPorMinuto ?? 8} anexos/min (conta nova: ${am.antiMidia?.maxNovato ?? 3})`, `over ${am.antiMidia?.maxPorMinuto ?? 8} attachments/min (new account: ${am.antiMidia?.maxNovato ?? 3})`, `más de ${am.antiMidia?.maxPorMinuto ?? 8} adjuntos/min (cuenta nueva: ${am.antiMidia?.maxNovato ?? 3})`),
    antiRepeticao:   () => T(`mais de ${am.antiRepeticao?.maxRepeticao ?? 15} caracteres repetidos${am.antiRepeticao?.ignorar ? ` (ignora \`${am.antiRepeticao.ignorar}\`)` : ""}`, `over ${am.antiRepeticao?.maxRepeticao ?? 15} repeated characters${am.antiRepeticao?.ignorar ? ` (ignores \`${am.antiRepeticao.ignorar}\`)` : ""}`, `más de ${am.antiRepeticao?.maxRepeticao ?? 15} caracteres repetidos${am.antiRepeticao?.ignorar ? ` (ignora \`${am.antiRepeticao.ignorar}\`)` : ""}`),
  };  return detalhe[chave]?.() ?? "";
}
