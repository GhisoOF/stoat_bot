import { TERMOS_MAX, TERMO_MAX, termoDoFiltro } from "./rajada.js";
import { citar, citarInterno } from "../core/aliases.js";
import { descreverFiltro } from "./config-comando.js";
import { rebuildBlocklist, fonteValida, nuncaBloquear, DOMINIO_VALIDO, removerCargoSilence, MODULOS_AUTOMOD, GRUPOS_AUTOMOD, estadoDoGrupo, moduloLigado } from "./automod-engine.js";
import { tirarTimeout } from "./timeout.js";
import * as engine from "./automod-engine.js";
import * as db  from "../core/db.js";
import * as log from "../core/log.js";
import { analisarConteudo } from "./scorecard.js";
import { registrarErro } from "../core/erros.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { maisParecido } from "../core/parecido.js";
import { erroDeUso, semPermissao } from "./punir.js";
import { hostDe } from "../core/config-store.js";
import { resolverUsuario, resolverCanal } from "../core/ids.js";
import { banir } from "../core/banir.js";
import * as assuntos from "./assuntos.js";
import { nomeGrupo, nomeParte, nomeModo, nomeTema, nomeAcaoTema, nomeAcaoAvatar, nomeSens } from "../core/nomes-automod.js";
import * as avatar from "./avatar.js";
import { liberarQuarentena } from "./confianca.js";
import { lerDuracao, duracaoTexto } from "../core/duracao.js";

// Quem é o alvo de `&warn lista|limpar …`: a menção, o ID ou o nome ESCRITOS
// no comando. Antes só valia o mentionIds[0] — que vem vazio quando o Stoat
// não preenche (ID colado, nome digitado) e é outra pessoa numa resposta.
async function alvoDosAvisos(message, args, ctx, server) {
  const texto = args.join(" ").trim();
  if (!texto) return { id: null, vazio: true };
  const id = await resolverUsuario(texto, { message, server, client: ctx.client }).catch(() => null)
    ?? await resolverUsuario(args[0], { message, server, client: ctx.client }).catch(() => null);
  return { id, vazio: false, texto };
}

// &warn lista [@usuário|id|nome]  (chega aqui por warn.js)
export async function cmdWarnings(message, args, ctx) {
  const { config, sendEmbed, COR, serverId, getServer, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer?.(message).catch?.(() => null) ?? null;
  const alvo = await alvoDosAvisos(message, args, ctx, server);
  if (!alvo.vazio && !alvo.id) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não achei essa pessoa", description: `Não encontrei \`${alvo.texto.slice(0, 60)}\` no servidor.\n\`${citar("warn.lista", "pt", PREFIXO)} <@pessoa|id|nome>\``, colour: COR.erro },
      { title: "❌ Couldn't find that person", description: `I couldn't find \`${alvo.texto.slice(0, 60)}\` in the server.\n\`${citar("warn.lista", "en", PREFIXO)} <@user|id|name>\``, colour: COR.erro },
      { title: "❌ No encontré a esa persona", description: `No encontré \`${alvo.texto.slice(0, 60)}\` en el servidor.\n\`${citar("warn.lista", "es", PREFIXO)} <@usuario|id|nombre>\``, colour: COR.erro }));
  }
  const targetId = alvo.id ?? message.authorId;
  const pol = config.automod.punicao ?? {};
  const count  = db.contarAvisos(serverId, targetId, { validadeMs: engine.validadeDosAvisos(pol) });
  const degraus = engine.escadaDePunicao(pol);
  const limite = degraus.length;
  const silenciado = db.estaSilenciado(serverId, targetId);
  const motivo = db.lerPunicao(serverId, targetId)?.motivo;
  const linhas = [tr(ctx,
    `<@${targetId}> tem **${count}/${limite}** aviso(s).`,
    `<@${targetId}> has **${count}/${limite}** warning(s).`,
    `<@${targetId}> tiene **${count}/${limite}** aviso(s).`)];
  if (count && motivo) linhas.push(tr(ctx, `**Último motivo:** ${motivo}`, `**Last reason:** ${motivo}`, `**Último motivo:** ${motivo}`));
  if (pol.modo === "acumular" && degraus[count]) linhas.push(tr(ctx,
    `_O próximo: ${engine.rotuloDegrau(degraus[count], "pt")}._`, `_Next one: ${engine.rotuloDegrau(degraus[count], "en")}._`, `_El siguiente: ${engine.rotuloDegrau(degraus[count], "es")}._`));
  const dias = Math.round(engine.validadeDosAvisos(pol) / 86_400_000);
  if (count && dias) linhas.push(tr(ctx, `_Zeram depois de ${dias} dias sem um novo._`, `_They reset after ${dias} days without a new one._`, `_Se reinician tras ${dias} días sin uno nuevo._`));
  if (silenciado) linhas.push(tr(ctx,
    "🔇 Está **silenciado** (o cargo é reaplicado se sair e voltar).",
    "🔇 They are **silenced** (the role is re-applied if they leave and come back).",
    "🔇 Está **silenciado** (el rol se vuelve a aplicar si sale y vuelve)."));
  await sendEmbed(message.channel, {
    title: tr(ctx, "📋 Avisos", "📋 Warnings", "📋 Avisos"),
    description: linhas.join("\n"),
    colour: COR.info,
  });
}

// &warn limpar <@usuário|id|nome>   (ManagePermissions; chega aqui por warn.js)
export async function cmdClearwarnings(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return semPermissao(ctx, message.channel, "ManagePermissions");

  const alvo = await alvoDosAvisos(message, args, ctx, server);
  if (!alvo.id)
    return sendEmbed(message.channel, tr(ctx,
      { title: alvo.vazio ? "❌ De quem?" : "❌ Não achei essa pessoa",
        description: `${alvo.vazio ? "" : `Não encontrei \`${alvo.texto.slice(0, 60)}\` no servidor.\n`}\`${citar("warn.limpar", "pt", PREFIXO)} <@pessoa|id|nome>\``, colour: COR.erro },
      { title: alvo.vazio ? "❌ Whose?" : "❌ Couldn't find that person",
        description: `${alvo.vazio ? "" : `I couldn't find \`${alvo.texto.slice(0, 60)}\` in the server.\n`}\`${citar("warn.limpar", "en", PREFIXO)} <@user|id|name>\``, colour: COR.erro },
      { title: alvo.vazio ? "❌ ¿De quién?" : "❌ No encontré a esa persona",
        description: `${alvo.vazio ? "" : `No encontré \`${alvo.texto.slice(0, 60)}\` en el servidor.\n`}\`${citar("warn.limpar", "es", PREFIXO)} <@usuario|id|nombre>\``, colour: COR.erro }));
  const targetId = alvo.id;

  const tinha = db.zerarAvisos(ctx.serverId, targetId);
  liberarQuarentena(ctx.serverId, targetId);
  const silenciado = db.estaSilenciado(ctx.serverId, targetId);
  const extraPt = silenciado ? `\n🔇 O silêncio em curso continua — para tirar: \`${citar("silenciar.tirar", "pt", PREFIXO)} <@${targetId}>\`` : "";
  const extraEn = silenciado ? `\n🔇 The current silence stays — to lift it: \`${citar("silenciar.tirar", "en", PREFIXO)} <@${targetId}>\`` : "";
  const extraEs = silenciado ? `\n🔇 El silencio en curso sigue — para quitarlo: \`${citar("silenciar.tirar", "es", PREFIXO)} <@${targetId}>\`` : "";
  await sendEmbed(message.channel, tr(ctx,
    { title: "✅ Avisos limpos", description: (tinha
        ? (tinha === 1 ? `O aviso de <@${targetId}> foi zerado.` : `Os **${tinha}** avisos de <@${targetId}> foram zerados.`) : `<@${targetId}> não tinha avisos — nada a zerar.`) + extraPt, colour: COR.sucesso },
    { title: "✅ Warnings cleared", description: (tinha
        ? (tinha === 1 ? `<@${targetId}>'s warning was reset.` : `<@${targetId}>'s **${tinha}** warnings were reset.`) : `<@${targetId}> had no warnings — nothing to reset.`) + extraEn, colour: COR.sucesso },
    { title: "✅ Avisos borrados", description: (tinha
        ? (tinha === 1 ? `Se reinició el aviso de <@${targetId}>.` : `Se reiniciaron los **${tinha}** avisos de <@${targetId}>.`) : `<@${targetId}> no tenía avisos — nada que reiniciar.`) + extraEs, colour: COR.sucesso }));
  if (tinha) await log.registrar(ctx, "punicoes", { titulo: "🧹 Avisos limpos",
    descricao: `<@${targetId}> teve os avisos (${tinha}) zerados por <@${message.authorId}>.`,
    en: { titulo: "🧹 Warnings cleared", descricao: `<@${targetId}>'s warnings (${tinha}) were cleared by <@${message.authorId}>.` },
    es: { titulo: "🧹 Avisos borrados", descricao: `<@${message.authorId}> reinició los avisos (${tinha}) de <@${targetId}>.` } });
}

// Os parâmetros em inglês, para a tela (o que se digita em inglês o registro traduz)
const PARAM_EN = { mensagens: "messages", tempo: "time", mencoes: "mentions", tamanho: "size", limiar: "threshold", repeticao: "repetition",
  ignorar: "ignore", minuto: "minute", novato: "newcomer", vezes: "times" };
const nomeParam = (p, lang) => (lang === "en" || lang === "es" ? PARAM_EN[p] ?? p : p);

const G_AUTOMOD = GRUPOS_AUTOMOD;
// Modos de punição: os nomes em inglês que a ajuda em inglês mostra também valem.
const MODO_EN = { warn: "avisar", delete: "apagar", confirm: "confirmar", stack: "acumular", ban: "banir", inherit: "herdar" };
const MODOS_PUN = ["avisar", "apagar", "confirmar", "acumular", "banir"];
// (P2) `velocidade` e `rajada` contam a mesma lista de mensagens em duas réguas: uma
// parte só (`velocidade`) liga, desliga e pune as duas (FILTROS_JUNTOS, no engine);
// `rajada` virou apelido dela.
const filtrosDaParte = (filtro) => [filtro, ...(engine.FILTROS_JUNTOS[filtro] ?? [])];
// Os parâmetros ajustáveis de cada filtro (nome digitado → chave interna)
const PARAMS = {
  antispam:        { mensagens: "maxMessages", tempo: "windowMs" },
  antimassspam:    { mensagens: "maxMessages", tempo: "windowMs" },
  antimassmention: { mencoes: "maxMentions" },
  anticaps:        { tamanho: "minLength", limiar: "threshold" },
  anticaracteres:  { zalgo: "limiteZalgo" },
  antirepeticao:   { repeticao: "maxRepeticao", ignorar: "ignorar" },
  antiemoji:       { emojis: "maxEmojis" },
  antimidia:       { minuto: "maxPorMinuto", novato: "maxNovato" },
  antiduplicata:   { vezes: "maxRepetidas" },
};

// ── &automod … set: o tipo e a faixa de cada parâmetro (31 out 2026, R10) ──
// Contagem = inteiro; `tempo` = duração legível ("8s", "1m"); limiar/zalgo =
// fração (0,1–1) ou porcentagem (10–100). `1.5`, `Infinity`, `0`, negativo e
// NaN são recusados — antes `repeticao 1.5` gerava regex inválida e cada
// mensagem do servidor lançava exceção.
const FAIXAS = {
  maxMessages:  { min: 2, max: 100 },
  maxMentions:  { min: 1, max: 100 },
  minLength:    { min: 1, max: 2000 },
  maxRepeticao: { min: 2, max: 200 },
  maxEmojis:    { min: 1, max: 500 },
  maxPorMinuto: { min: 1, max: 100 },
  maxNovato:    { min: 1, max: 100 },
  maxRepetidas: { min: 2, max: 50 },
};
const TEMPO_MIN = 1000, TEMPO_MAX = 10 * 60_000;
export function valorDoParametro(chave, bruto) {
  const t = String(bruto ?? "").trim().toLowerCase().replace(",", ".");
  const erro = (pt, en, es) => ({ ok: false, pt, en, es });
  if (chave === "windowMs") {
    // número puro é ambíguo (segundos? ms? minutos?): pede a unidade
    const ms = /^\d+\s*(s|m|min)$/.test(t) ? lerDuracao(t) : null;
    if (!ms || ms < TEMPO_MIN || ms > TEMPO_MAX)
      return erro("O tempo é uma duração entre **1s** e **10m** — ex.: `8s`, `30s`, `1m`.", "The time is a duration between **1s** and **10m** — e.g. `8s`, `30s`, `1m`.", "El tiempo es una duración entre **1s** y **10m** — ej.: `8s`, `30s`, `1m`.");
    return { ok: true, valor: ms };
  }
  if (chave === "threshold" || chave === "limiteZalgo") {
    if (!/^\d+(\.\d+)?%?$/.test(t)) return erro("Use uma porcentagem entre **10** e **100** (ex.: `70`).", "Use a percentage between **10** and **100** (e.g. `70`).", "Usa un porcentaje entre **10** y **100** (ej.: `70`).");
    let v = Number(t.replace("%", ""));
    if (v > 1) v = v / 100;
    if (!Number.isFinite(v) || v < 0.1 || v > 1) return erro("Use uma porcentagem entre **10** e **100** (ex.: `70`).", "Use a percentage between **10** and **100** (e.g. `70`).", "Usa un porcentaje entre **10** y **100** (ej.: `70`).");
    return { ok: true, valor: Math.round(v * 100) / 100 };
  }
  const f = FAIXAS[chave];
  if (!f) return erro("Parâmetro desconhecido.", "Unknown parameter.", "Parámetro desconocido.");
  const n = /^\d+$/.test(t) ? Number(t) : NaN;
  if (!Number.isSafeInteger(n) || n < f.min || n > f.max)
    return erro(`Use um número **inteiro** entre **${f.min}** e **${f.max}**.`, `Use a **whole** number between **${f.min}** and **${f.max}**.`, `Usa un número **entero** entre **${f.min}** y **${f.max}**.`);
  return { ok: true, valor: n };
}

// ── &automod filter (P2): os termos próprios do servidor, num lugar só ──────
// Eram o `&automod antiodio add|remover|lista` e o `sentinela odio add…`. O termo é
// guardado limpo (só letras) e vira padrão LITERAL escapado, compilado uma vez
// (rajada.js); no máximo TERMOS_MAX termos × TERMO_MAX caracteres (R10).
export function mexerNoFiltro(mod, acao, bruto) {
  mod.termos ??= [];
  if (acao === "lista") return { ok: true, termos: mod.termos };
  const termo = termoDoFiltro(bruto);
  if (!termo) return { ok: false, erro: String(bruto ?? "").trim().length > TERMO_MAX ? "longo" : "termo" };
  if (acao === "add") {
    if (mod.termos.includes(termo)) return { ok: true, termos: mod.termos, termo, igual: true };
    if (mod.termos.length >= TERMOS_MAX) return { ok: false, erro: "cheio" };
    mod.termos.push(termo);
    return { ok: true, termos: mod.termos, termo };
  }
  const antes = mod.termos.length;
  mod.termos = mod.termos.filter((x) => x !== termo);
  return { ok: true, termos: mod.termos, termo, removido: antes !== mod.termos.length };
}

export async function cmdAutomod(message, args, ctx) {
  const { config, cfgGlobal, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, salvarGlobal, PREFIXO } = ctx;
  const lang = lingua(ctx), l = idiomaDe(ctx);
  const canal = message.channel;
  const linha = (cor, pt, en, es) => sendEmbed(canal, { description: tr(ctx, pt, en, es), colour: cor });
  const erroUso = (pt, en, es) => erroDeUso(ctx, canal, "automod", pt, en, es);
  const onOff = (on, nome) => linha(on ? COR.sucesso : COR.mod, `🛡 **${nome[0]}** ${on ? "🟢 ligado" : "🔴 desligado"}.`, `🛡 **${nome[1]}** ${on ? "🟢 on" : "🔴 off"}.`, `🛡 **${nome[2]}** ${on ? "🟢 activado" : "🔴 desactivado"}.`);
  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "ManagePermissions")) return semPermissao(ctx, canal, "ManagePermissions");
  config.automod ??= {};

  let sub = args[0]?.toLowerCase();
  // As partes com tabela própria moram aqui dentro: `&automod blocklist …`
  const FILHOS = { blocklist: cmdBlocklist, bloqueio: cmdBlocklist, whitelist: cmdWhitelist, permitidos: cmdWhitelist, punicao: cmdPunicao, "punição": cmdPunicao, castigo: cmdPunicao };
  if (FILHOS[sub]) return FILHOS[sub](message, args.slice(1), ctx);
  if (sub === "antiscam") sub = "sentinela";
  // `&automod antiodio add …` e `&automod sentinela odio add …`: o nome antigo do filter
  if ((sub === "antiodio" && ["add", "remover", "lista"].includes(args[1]?.toLowerCase()))
    || (sub === "sentinela" && args[1]?.toLowerCase() === "odio" && ["add", "remover", "lista"].includes(args[2]?.toLowerCase()))) {
    return cmdAutomod(message, ["filtro", ...args.slice(sub === "sentinela" ? 2 : 1)], ctx);
  }

  // quem copia a ajuda ao pé da letra (`&automod <grupo> off`)
  const ehMarcador = (x) => /^[<‹\[].+[>›\]]$/.test(String(x ?? ""));
  const listaGrupos = (lg) => Object.keys(G_AUTOMOD).map((g) => `\`${nomeGrupo(g, lg)}\``).join(", ");
  const listaPartes = (g, lg) => Object.keys(G_AUTOMOD[g].partes).map((x) => `\`${nomeParte(x, lg)}\``).join(", ");
  if (ehMarcador(sub)) return erroUso(`\`${sub}\` é um espaço para preencher: ${listaGrupos("pt")}`, `\`${sub}\` is a blank to fill in: ${listaGrupos("en")}`, `\`${sub}\` es un espacio para rellenar: ${listaGrupos("es")}`);
  if (G_AUTOMOD[sub] && ehMarcador(args[1])) return erroUso(`\`${args[1]}\` é um espaço para preencher: ${listaPartes(sub, "pt")}`, `\`${args[1]}\` is a blank to fill in: ${listaPartes(sub, "en")}`, `\`${args[1]}\` es un espacio para rellenar: ${listaPartes(sub, "es")}`);

  // ── filter [add|remover <termo> | lista | on|off] ──
  if (sub === "filtro") {
    const mod = config.automod.antiOdio ??= { enabled: true, termos: [] };
    const acao = String(args[1] ?? "lista").toLowerCase();
    if (acao === "on" || acao === "off") { mod.enabled = acao === "on"; salvarConfig(); return onOff(acao === "on", ["filtro", "filter", "filter"]); }
    if (!["add", "remover", "lista"].includes(acao)) return erroUso("Use `add`, `remover` ou `lista`", "Use `add`, `remove` or `list`", "Usa `add`, `quitar` o `lista`");
    const r = mexerNoFiltro(mod, acao, args.slice(2).join(" "));
    if (!r.ok && r.erro === "cheio") return linha(COR.erro, `❌ Já há ${TERMOS_MAX} termos (o máximo).`, `❌ There are already ${TERMOS_MAX} terms (the maximum).`, `❌ Ya hay ${TERMOS_MAX} términos (el máximo).`);
    if (!r.ok && r.erro === "longo") return linha(COR.erro, `❌ Termo longo demais: no máximo ${TERMO_MAX} letras.`, `❌ Term too long: at most ${TERMO_MAX} letters.`, `❌ Término demasiado largo: como máximo ${TERMO_MAX} letras.`);
    if (!r.ok) return erroUso(`Termo de 3 a ${TERMO_MAX} letras`, `A term of 3 to ${TERMO_MAX} letters`, `Un término de 3 a ${TERMO_MAX} letras`);
    if (acao !== "lista") salvarConfig();
    if (acao === "add") return linha(COR.sucesso, `🛡 \`${r.termo}\` no filtro (${r.termos.length}/${TERMOS_MAX}).`, `🛡 \`${r.termo}\` in the filter (${r.termos.length}/${TERMOS_MAX}).`, `🛡 \`${r.termo}\` en el filtro (${r.termos.length}/${TERMOS_MAX}).`);
    if (acao === "remover") return r.removido
      ? linha(COR.sucesso, `🛡 \`${r.termo}\` fora do filtro.`, `🛡 \`${r.termo}\` out of the filter.`, `🛡 \`${r.termo}\` fuera del filtro.`)
      : linha(COR.aviso, `🤷 \`${r.termo}\` não estava no filtro.`, `🤷 \`${r.termo}\` wasn't in the filter.`, `🤷 \`${r.termo}\` no estaba en el filtro.`);
    const lista = r.termos.length ? r.termos.map((x) => `\`${x}\``).join(", ") : "—";
    return linha(COR.mod, `🛡 Filtro (${r.termos.length}/${TERMOS_MAX}): ${lista}`, `🛡 Filter (${r.termos.length}/${TERMOS_MAX}): ${lista}`, `🛡 Filtro (${r.termos.length}/${TERMOS_MAX}): ${lista}`);
  }

  // ── `&automod off` / `&automod on` — tudo de uma vez ──
  const TUDO = { on: true, ligar: true, ativar: true, enable: true, off: false, desligar: false, desativar: false, disable: false };
  if (sub in TUDO && !args[1]) {
    const on = TUDO[sub];
    for (const chave of Object.values(MODULOS_AUTOMOD)) config.automod[chave] = { ...(config.automod[chave] ?? {}), enabled: on };
    salvarConfig();
    return onOff(on, ["AutoMod", "AutoMod", "AutoMod"]);
  }

  // ── debug on|off (global: só o dono do bot) ──
  if (sub === "debug") {
    if (!ctx.ehSuperAdmin?.(message.authorId)) return linha(COR.erro, "🔒 Só o dono do bot.", "🔒 Bot owner only.", "🔒 Solo el dueño del bot.");
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off") return erroUso("Use `on` ou `off`", "Use `on` or `off`", "Usa `on` u `off`");
    cfgGlobal.debug = (v === "on");
    salvarGlobal();
    return onOff(cfgGlobal.debug, ["debug", "debug", "debug"]);
  }

  // ── a tela de estado: os quatro grupos ──
  if (!sub || sub === "status") {
    const linhas = Object.entries(G_AUTOMOD).map(([nome, def]) => {
      const st = estadoDoGrupo(config.automod, nome);
      const icone = st.ligadas === st.total ? "🟢" : st.ligadas ? "🟡" : "🔴";
      return `${icone} **${nomeGrupo(nome, l)}** ${st.ligadas}/${st.total} — ${st.partes.map((x) => `${x.ligada ? "✓" : "✗"} ${nomeParte(x.parte, l)}`).join(" · ")}`;
    });
    linhas.push(tr(ctx, `🛡 Punição: \`${nomeModo(config.automod.punicao?.modo ?? "avisar", "pt")}\``, `🛡 Punishment: \`${nomeModo(config.automod.punicao?.modo ?? "avisar", "en")}\``, `🛡 Castigo: \`${nomeModo(config.automod.punicao?.modo ?? "avisar", "es")}\``));
    return sendEmbed(canal, { title: "🛡 AutoMod", description: linhas.join("\n"), colour: COR.mod });
  }

  // ── Os quatro grupos: antispam · antiruido · antilink · sentinela ──
  const PARA_O_FILTRO = ["on", "off", "punicao", "punição", "punishment"];
  if (G_AUTOMOD[sub]) {
    const grupo = sub, def = G_AUTOMOD[grupo];
    if (args[1] && args[1].toLowerCase() in TUDO) args[1] = TUDO[args[1].toLowerCase()] ? "on" : "off";
    if (args[2] && args[2].toLowerCase() in TUDO) args[2] = TUDO[args[2].toLowerCase()] ? "on" : "off";
    let a1 = args[1]?.toLowerCase();
    if (grupo === "antispam" && a1 === "rajada") a1 = "velocidade";   // (P2) rajada = velocidade
    const PARAM_PARTE = {
      antispam: { mensagens: "velocidade", tempo: "velocidade", mencoes: "mencoes", minuto: "midia", novato: "midia", vezes: "repeticao" },
      antiruido: { tamanho: "caps", limiar: "caps", zalgo: "caracteres", repeticao: "letras", ignorar: "letras", emojis: "emoji" },
    }[grupo] ?? {};
    if (a1 && def.partes[a1]) {
      // uma parte: vira o comando do filtro de antes
      const filtro = def.partes[a1];
      if (grupo === "sentinela" && a1 === "conteudo" && args[2] && !PARA_O_FILTRO.includes(args[2].toLowerCase())) return cmdScam(message, args.slice(2), ctx);
      return executarFiltro(filtro, [filtro, ...args.slice(2)], [nomeParte(a1, "pt"), nomeParte(a1, "en"), nomeParte(a1, "es")]);
    }
    if (!a1 || a1 === "status" || a1 === "config") return grupo === "sentinela" ? telaSentinela() : telaDoGrupo(grupo);
    const nomeG = [nomeGrupo(grupo, "pt"), nomeGrupo(grupo, "en"), nomeGrupo(grupo, "es")];
    if (a1 === "on" || a1 === "off") {
      for (const f of Object.values(def.partes)) for (const x of filtrosDaParte(f)) {
        const ck = MODULOS_AUTOMOD[x];
        config.automod[ck] = { ...(config.automod[ck] ?? {}), enabled: a1 === "on" };
      }
      salvarConfig();
      return onOff(a1 === "on", nomeG);
    }
    if (a1 === "punicao" || a1 === "punição" || a1 === "punishment") {
      const modo = MODO_EN[args[2]?.toLowerCase()] ?? args[2]?.toLowerCase();
      const herdar = ["herdar", "global", "null"].includes(modo);
      if (!herdar && !MODOS_PUN.includes(modo)) return erroUso("Modo: avisar, apagar, confirmar, acumular, banir ou herdar", "Mode: warn, delete, confirm, stack, ban or inherit", "Modo: warn, delete, confirm, stack, ban o inherit");
      for (const f of Object.values(def.partes)) for (const x of filtrosDaParte(f)) {
        const mod = config.automod[MODULOS_AUTOMOD[x]] ??= {};
        mod.punicao = herdar ? null : { ...(mod.punicao ?? {}), modo, ...(modo === "acumular" && !mod.punicao?.warnsParaBan ? { warnsParaBan: 3 } : {}) };
      }
      salvarConfig();
      const m = herdar ? ["herdada", "inherited", "heredado"] : [nomeModo(modo, "pt"), nomeModo(modo, "en"), nomeModo(modo, "es")];
      return linha(COR.sucesso, `🛡 **${nomeG[0]}** → punição \`${m[0]}\`.`, `🛡 **${nomeG[1]}** → punishment \`${m[1]}\`.`, `🛡 **${nomeG[2]}** → castigo \`${m[2]}\`.`);
    }
    if (a1 === "set" && PARAM_PARTE[args[2]?.toLowerCase()]) {
      const parte = PARAM_PARTE[args[2].toLowerCase()];
      const filtro = def.partes[parte];
      return executarFiltro(filtro, [filtro, "set", ...args.slice(2)], [nomeParte(parte, "pt"), nomeParte(parte, "en"), nomeParte(parte, "es")]);
    }
    if (grupo === "sentinela") return cmdScam(message, args.slice(1), ctx);   // o painel: sensibilidade, canal, testar…
    const parecida = maisParecido(a1, [...Object.keys(def.partes), "on", "off", "punicao", "set"]);
    const x = String(a1).slice(0, 30).replace(/`/g, "");
    if (parecida) return erroUso(`Você quis dizer \`${citar("automod", "pt", PREFIXO)} ${nomeG[0]} ${nomeParte(parecida, "pt")}\`?`, `Did you mean \`${citar("automod", "en", PREFIXO)} ${nomeG[1]} ${nomeParte(parecida, "en")}\`?`, `¿Quisiste decir \`${citar("automod", "es", PREFIXO)} ${nomeG[2]} ${nomeParte(parecida, "es")}\`?`);
    return erroUso(`\`${x}\` não é parte de ${nomeG[0]}: ${listaPartes(grupo, "pt")}`, `\`${x}\` isn't a part of ${nomeG[1]}: ${listaPartes(grupo, "en")}`, `\`${x}\` no es parte de ${nomeG[2]}: ${listaPartes(grupo, "es")}`);
  }
  if (sub === "antimassspam") sub = "antispam";   // (P2) a rajada é a velocidade
  if (MODULOS_AUTOMOD[sub]) return executarFiltro(sub, args, [sub, sub, sub]);
  const parecido = maisParecido(sub, [...Object.keys(G_AUTOMOD), "on", "off", "status", "filtro", "blocklist", "whitelist", "punicao"]);
  const resto = args.slice(1).join(" ");
  if (parecido) {
    const sug = (lg) => `\`${citar("automod", lg, PREFIXO)} ${G_AUTOMOD[parecido] ? nomeGrupo(parecido, lg) : parecido}${resto ? " " + resto : ""}\``;
    return erroUso(`Você quis dizer ${sug("pt")}?`, `Did you mean ${sug("en")}?`, `¿Quisiste decir ${sug("es")}?`);
  }
  const x = String(sub).slice(0, 30).replace(/`/g, "");
  return erroUso(`\`${x}\` não é um grupo: ${listaGrupos("pt")}`, `\`${x}\` isn't a group: ${listaGrupos("en")}`, `\`${x}\` no es un grupo: ${listaGrupos("es")}`);

  // ── A tela de um grupo: as partes, ligadas ou não, com os números ──
  function telaDoGrupo(grupo) {
    const def = G_AUTOMOD[grupo], st = estadoDoGrupo(config.automod, grupo);
    const pm = (f) => config.automod[MODULOS_AUTOMOD[f]]?.punicao?.modo;
    const linhas = st.partes.map((x) => {
      const det = descreverFiltro(config.automod, x.chave, lang, ctx.estado);
      return `${x.ligada ? "🟢" : "🔴"} \`${nomeParte(x.parte, l)}\`${det ? ` — ${det}` : ""}${pm(x.filtro) ? ` · \`${nomeModo(pm(x.filtro), l)}\`` : ""}`;
    });
    return sendEmbed(canal, { title: `${def.emoji} ${nomeGrupo(grupo, l)} ${st.ligadas}/${st.total}`, description: linhas.join("\n"), colour: COR.mod });
  }

  // ── A tela única do sentinela (P2): o grupo, o painel e os temas numa só ──
  function telaSentinela() {
    const cfg = config.automod.antiScam ?? {};
    const st = estadoDoGrupo(config.automod, "sentinela");
    const linhas = st.partes.map((x) => `${x.ligada ? "🟢" : "🔴"} \`${nomeParte(x.parte, l)}\``).join(" · ");
    const sim = (v) => (v ? "🟢" : "🔴");
    return sendEmbed(canal, { title: `🛡️ ${nomeGrupo("sentinela", l)} ${st.ligadas}/${st.total}`, colour: COR.mod, description: [
      linhas,
      tr(ctx,
        `Sensibilidade \`${nomeSens(cfg.sensitivity ?? "media", "pt")}\` (${engine.limiarBase(cfg.sensitivity)}/10) · antiguidade ${sim(cfg.porAntiguidade !== false)} · alerta ${sim(cfg.alertarAdmin !== false)} · canal ${cfg.alertChannelId ? `<#${cfg.alertChannelId}>` : "—"}`,
        `Sensitivity \`${nomeSens(cfg.sensitivity ?? "media", "en")}\` (${engine.limiarBase(cfg.sensitivity)}/10) · tenure ${sim(cfg.porAntiguidade !== false)} · alerts ${sim(cfg.alertarAdmin !== false)} · channel ${cfg.alertChannelId ? `<#${cfg.alertChannelId}>` : "—"}`,
        `Sensibilidad \`${nomeSens(cfg.sensitivity ?? "media", "es")}\` (${engine.limiarBase(cfg.sensitivity)}/10) · antigüedad ${sim(cfg.porAntiguidade !== false)} · alertas ${sim(cfg.alertarAdmin !== false)} · canal ${cfg.alertChannelId ? `<#${cfg.alertChannelId}>` : "—"}`),
    ].join("\n") });
  }

  // ── Um filtro só (a parte de um grupo, ou o nome antigo) ──
  async function executarFiltro(sub, args, nome) {
    if (sub === "antimassspam") sub = "antispam";
    // `sentinela` é também o painel: on|off e punição ficam aqui; o resto é do painel
    if (sub === "sentinela" && args[1] && !PARA_O_FILTRO.includes(args[1].toLowerCase())) return cmdScam(message, args.slice(1), ctx);
    const chave = MODULOS_AUTOMOD[sub];
    const mod = config.automod[chave] ??= {};
    const acao = args[1]?.toLowerCase();
    if (sub === "antiassuntos" && !["punicao", "punição"].includes(acao)) return painelAssuntos(mod, args.slice(1));
    if (sub === "antiavatar" && !["punicao", "punição"].includes(acao)) return painelAvatar(mod, args.slice(1));
    if (sub === "antiodio" && ["add", "remover", "lista"].includes(acao)) return cmdAutomod(message, ["filtro", ...args.slice(1)], ctx);

    // sem ação: a tela do grupo dessa parte
    if (!acao) {
      const grupo = Object.entries(G_AUTOMOD).find(([, d]) => Object.values(d.partes).includes(sub))?.[0];
      return grupo === "sentinela" ? telaSentinela() : grupo ? telaDoGrupo(grupo) : onOff(moduloLigado(config.automod, chave), nome);
    }

    // ── set <parâmetro> <valor> ──
    if (acao === "set") {
      const params = PARAMS[sub];
      if (!params) return erroUso("Essa parte não tem números", "That part has no numbers", "Esa parte no tiene números");
      const p = args[2]?.toLowerCase(), bruto = args[3], ck = params?.[p];
      if (!ck || bruto === undefined) return erroUso(`Parâmetro: ${Object.keys(params).map((x) => `\`${x}\``).join(", ")}`, `Parameter: ${Object.keys(params).map((x) => `\`${nomeParam(x, "en")}\``).join(", ")}`, `Parámetro: ${Object.keys(params).map((x) => `\`${nomeParam(x, "es")}\``).join(", ")}`);
      let mostrado;
      if (ck === "ignorar") {
        mod[ck] = String(bruto).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
        mostrado = `"${mod[ck]}"`;
      } else {
        const v = valorDoParametro(ck, bruto);
        if (!v.ok) return linha(COR.erro, `❌ ${v.pt}`, `❌ ${v.en}`, `❌ ${v.es}`);
        mod[ck] = v.valor;
        // a rajada acompanha a velocidade nos mesmos números? Não: só a parte pedida.
        mostrado = ck === "windowMs" ? duracaoTexto(v.valor, l) : (ck === "threshold" || ck === "limiteZalgo") ? `${Math.round(v.valor * 100)}%` : v.valor;
      }
      salvarConfig();
      return linha(COR.sucesso, `🛡 \`${nome[0]} ${nomeParam(p, "pt")}\` = **${mostrado}**`, `🛡 \`${nome[1]} ${nomeParam(p, "en")}\` = **${mostrado}**`, `🛡 \`${nome[2]} ${nomeParam(p, "es")}\` = **${mostrado}**`);
    }

    // ── punicao <modo|herdar> ──
    if (acao === "punicao" || acao === "punição") {
      const modo = MODO_EN[args[2]?.toLowerCase()] ?? args[2]?.toLowerCase();
      const herdar = ["herdar", "global", "null"].includes(modo);
      if (!herdar && !MODOS_PUN.includes(modo)) return erroUso("Modo: avisar, apagar, confirmar, acumular, banir ou herdar", "Mode: warn, delete, confirm, stack, ban or inherit", "Modo: warn, delete, confirm, stack, ban o inherit");
      for (const x of filtrosDaParte(sub)) {
        const m = config.automod[MODULOS_AUTOMOD[x]] ??= {};
        m.punicao = herdar ? null : { ...(m.punicao ?? {}), modo, ...(modo === "acumular" && !m.punicao?.warnsParaBan ? { warnsParaBan: 3 } : {}) };
      }
      salvarConfig();
      const m = herdar ? ["herdada", "inherited", "heredado"] : [nomeModo(modo, "pt"), nomeModo(modo, "en"), nomeModo(modo, "es")];
      return linha(COR.sucesso, `🛡 **${nome[0]}** → punição \`${m[0]}\`.`, `🛡 **${nome[1]}** → punishment \`${m[1]}\`.`, `🛡 **${nome[2]}** → castigo \`${m[2]}\`.`);
    }

    // ── on | off ──
    if (acao !== "on" && acao !== "off") return erroUso("Use `on`, `off`, `set` ou `punicao`", "Use `on`, `off`, `set` or `punishment`", "Usa `on`, `off`, `set` o `punishment`");
    for (const x of filtrosDaParte(sub)) {
      const ck = MODULOS_AUTOMOD[x];
      config.automod[ck] = { ...(config.automod[ck] ?? {}), enabled: acao === "on" };
    }
    salvarConfig();
    return onOff(acao === "on", nome);
  }

  // (31 out 2026, P3a, staff) quantos casos duvidosos a staff DESTE servidor já julgou (✅/❌) —
  // o que ajusta a Judy aqui. Nada quando ainda não há nenhum.
  function julgadosPelaStaff(tipo) {
    let n = 0;
    try { n = db.staffContarJulgados(ctx.serverId, tipo); } catch (e) { registrarErro("AUTOMOD:julgados", e); }
    return n ? [`⚖️ ${n} caso(s) duvidoso(s) julgado(s) pela staff daqui`, `⚖️ ${n} doubtful case(s) judged by the staff here`, `⚖️ ${n} caso(s) dudoso(s) juzgado(s) por el staff de aquí`] : null;
  }

  // ── &automod sentinela assuntos … (temas proibidos pela regra) ──
  // A tela mostra o estado; cada mudança responde uma linha (R1: antes o painel
  // inteiro era reenviado a cada alteração).
  async function painelAssuntos(mod, a) {
    const T = (pt, eng, es) => tr(ctx, pt, eng, es);
    mod.acoes ??= {}; mod.termos ??= {}; mod.canaisLiberados ??= [];
    const op = a[0]?.toLowerCase();
    const sensAtual = assuntos.sensibilidadeValida(mod.sensibilidade) ?? "media";
    const ok = (pt, en, es) => linha(COR.sucesso, `🛡️ ${pt}`, `🛡️ ${en}`, `🛡️ ${es}`);
    if (!op || op === "status" || op === "config") {
      return sendEmbed(canal, { title: `🛡️ ${T("Temas proibidos", "Forbidden topics", "Temas prohibidos")} ${mod.enabled ? "🟢" : "🔴"}`, colour: COR.mod, description: [
        `${T("Sensibilidade", "Sensitivity", "Sensibilidad")} \`${nomeSens(sensAtual, l)}\` (${assuntos.limiarDoAssunto(mod)}/10) · ${T("IA", "AI", "IA")} ${mod.ia === false ? "🔴" : "🟢"}`,
        ...assuntos.NOMES_TEMAS.map((t) => {
          const ac = assuntos.acaoDoTema(mod, t), extras = (mod.termos[t] ?? []).length;
          return `${assuntos.TEMAS[t].emoji} \`${nomeTema(t, l)}\` — \`${nomeAcaoTema(ac, l)}\`${extras ? ` · +${extras}` : ""}`;
        }),
        mod.canaisLiberados.length ? `${T("Liberados", "Allowed", "Permitidos")}: ${mod.canaisLiberados.map((c) => `<#${c}>`).join(" ")}` : null,
        ((j) => (j ? T(...j) : null))(julgadosPelaStaff("assunto")),
      ].filter(Boolean).join("\n") });
    }
    if (op === "on" || op === "off") {
      mod.enabled = op === "on"; salvarConfig();
      return onOff(op === "on", ["temas proibidos", "forbidden topics", "temas prohibidos"]);
    }
    if (["sensibilidade", "sensitivity", "sens"].includes(op)) {
      const nova = assuntos.sensibilidadeValida(a[1]);
      if (!nova) return erroUso("Sensibilidade: baixa, media ou alta", "Sensitivity: low, medium or high", "Sensibilidad: low, medium o high");
      mod.sensibilidade = nova; salvarConfig();
      return ok(`Sensibilidade \`${nomeSens(nova, "pt")}\` (${assuntos.LIMIAR_ASSUNTO[nova]}/10).`, `Sensitivity \`${nomeSens(nova, "en")}\` (${assuntos.LIMIAR_ASSUNTO[nova]}/10).`, `Sensibilidad \`${nomeSens(nova, "es")}\` (${assuntos.LIMIAR_ASSUNTO[nova]}/10).`);
    }
    if (op === "ia" || op === "ai") {
      const v = a[1]?.toLowerCase();
      if (v !== "on" && v !== "off") return erroUso("Use `on` ou `off`", "Use `on` or `off`", "Usa `on` u `off`");
      mod.ia = v === "on"; salvarConfig();
      return onOff(mod.ia, ["IA dos temas", "topics AI", "IA de los temas"]);
    }
    if (op === "test" || op === "testar" || op === "teste") {
      const texto = a.slice(1).join(" ").trim();
      if (!texto) return erroUso("Testar o quê?", "Test what?", "¿Probar qué?");
      const notas = assuntos.analisarAssuntos(texto, mod, { canalId: message.channelId, autor: message.authorId, todos: true });
      // (31 out 2026, P3a) ⚠️ = iria ao juiz: o tema ligado aqui, ou qualquer tema com sinal de ataque (com a IA ligada)
      const vaiAoJuiz = (n) => n.passou && (assuntos.acaoDoTema(mod, n.tema) !== "off" || (mod.ia !== false && assuntos.temAtaque(n.sinais)));
      return linha(COR.mod, ...[0, 1, 2].map((i) => notas.map((n) => `${assuntos.TEMAS[n.tema].emoji} \`${nomeTema(n.tema, ["pt", "en", "es"][i])}\` — **${n.nota}/10**${vaiAoJuiz(n) ? " ⚠️" : ""}${n.sinais?.length ? ` · ${n.sinais.slice(0, 6).join(", ")}` : ""}`).join("\n")));
    }
    if (["liberar", "allow", "vigiar", "watch"].includes(op)) {
      const bruto = String(a[1] ?? "");
      const id = resolverCanal(bruto, { message, server });
      const dele = id && server?.channelIds ? (server.channelIds.has?.(id) ?? true) : !!id;
      if (!id || !dele) return erroUso("Canal não encontrado neste servidor", "Channel not found on this server", "Canal no encontrado en este servidor");
      const liberar = op === "liberar" || op === "allow";
      mod.canaisLiberados = liberar ? [...new Set([...mod.canaisLiberados, id])] : mod.canaisLiberados.filter((c) => c !== id);
      salvarConfig();
      return liberar ? ok(`<#${id}> liberado.`, `<#${id}> allowed.`, `<#${id}> permitido.`) : ok(`<#${id}> vigiado.`, `<#${id}> watched.`, `<#${id}> vigilado.`);
    }
    const tema = assuntos.temaValido(op);
    if (!tema) return erroUso(`Tema: ${assuntos.NOMES_TEMAS.join(", ")}`, `Topic: ${assuntos.NOMES_TEMAS.map((t) => nomeTema(t, "en")).join(", ")}`, `Tema: ${assuntos.NOMES_TEMAS.map((t) => nomeTema(t, "es")).join(", ")}`);
    const op2 = a[1]?.toLowerCase();
    if (["add", "adicionar", "remover", "remove", "tirar"].includes(op2)) {
      const termo = a.slice(2).join(" ").trim().toLowerCase().slice(0, 60);
      if (!termo) return erroUso("Qual termo?", "Which term?", "¿Qué término?");
      const lista = mod.termos[tema] ?? [];
      mod.termos[tema] = ["add", "adicionar"].includes(op2) ? [...new Set([...lista, termo])].slice(0, 50) : lista.filter((x) => x !== termo);
      salvarConfig();
      return ok(`\`${nomeTema(tema, "pt")}\`: ${mod.termos[tema].length} termo(s) daqui.`, `\`${nomeTema(tema, "en")}\`: ${mod.termos[tema].length} term(s) of yours.`, `\`${nomeTema(tema, "es")}\`: ${mod.termos[tema].length} término(s) tuyos.`);
    }
    const nova = assuntos.acaoValida(op2);
    if (!nova) return erroUso("Ação: off, alertar, apagar ou punir", "Action: off, alert, delete or punish", "Acción: off, alert, delete o punish");
    mod.acoes[tema] = nova;
    if (nova !== "off") mod.enabled = true;   // escolher um tema já liga a chave geral
    salvarConfig();
    return ok(`\`${nomeTema(tema, "pt")}\` → \`${nomeAcaoTema(nova, "pt")}\`.`, `\`${nomeTema(tema, "en")}\` → \`${nomeAcaoTema(nova, "en")}\`.`, `\`${nomeTema(tema, "es")}\` → \`${nomeAcaoTema(nova, "es")}\`.`);
  }

  // ── &automod sentinela avatar … (foto de perfil) ──
  async function painelAvatar(mod, a) {
    const T = (pt, eng, es) => tr(ctx, pt, eng, es);
    const op = a[0]?.toLowerCase();
    if (!op || op === "status" || op === "config") {
      const acao = avatar.acaoDoAvatar(mod);
      const julgados = julgadosPelaStaff("perfil-");
      return linha(COR.mod,
        `🖼️ Perfil ${mod.enabled !== false ? "🟢" : "🔴"} · \`${nomeAcaoAvatar(acao, "pt")}\`${acao === "silenciar" ? " até trocar" : ""}${process.env.IA_SERVICO_URL ? "" : " · ⚠️ sem visão (só o texto)"}${julgados ? `\n${julgados[0]}` : ""}`,
        `🖼️ Profile ${mod.enabled !== false ? "🟢" : "🔴"} · \`${nomeAcaoAvatar(acao, "en")}\`${acao === "silenciar" ? " until changed" : ""}${process.env.IA_SERVICO_URL ? "" : " · ⚠️ no vision (text only)"}${julgados ? `\n${julgados[1]}` : ""}`,
        `🖼️ Perfil ${mod.enabled !== false ? "🟢" : "🔴"} · \`${nomeAcaoAvatar(acao, "es")}\`${acao === "silenciar" ? " hasta que cambie" : ""}${process.env.IA_SERVICO_URL ? "" : " · ⚠️ sin visión (solo el texto)"}${julgados ? `\n${julgados[2]}` : ""}`);
    }
    if (op === "on" || op === "off") { mod.enabled = op === "on"; salvarConfig(); return onOff(op === "on", ["perfil", "profile", "perfil"]); }
    if (op === "acao" || op === "ação" || op === "action") {
      const nova = avatar.acaoAvatarValida(a[1]);
      if (!nova) return erroUso("Ação: alertar, silenciar, expulsar ou banir", "Action: alert, silence, kick or ban", "Acción: alert, silence, kick o ban");
      mod.acao = nova; salvarConfig();
      return linha(COR.sucesso, `🖼️ → \`${nomeAcaoAvatar(nova, "pt")}\``, `🖼️ → \`${nomeAcaoAvatar(nova, "en")}\``, `🖼️ → \`${nomeAcaoAvatar(nova, "es")}\``);
    }
    // (31 out 2026, P3a) o silêncio do perfil dura até a pessoa trocar o que apitou: o `tempo`
    // não manda mais nele. Fica como apelido que explica isso (o valor salvo não é mexido).
    if (op === "tempo" || op === "time" || op === "tiempo") {
      return linha(COR.mod, "🖼️ O silêncio do perfil dura **até a pessoa trocar** o que apitou (no máximo 28 dias).",
        "🖼️ The profile timeout lasts **until the person changes** what was flagged (28 days at most).",
        "🖼️ El silencio del perfil dura **hasta que la persona cambie** lo detectado (28 días como máximo).");
    }
    if (op === "checar" || op === "check" || op === "testar" || op === "test") {
      const uid = await resolverUsuario(a.slice(1).join(" "), { server, client: ctx.client }).catch(() => null);
      if (!uid) return erroUso("De quem?", "Whose?", "¿De quién?");
      const membro = await server?.fetchMember?.(uid).catch(() => null);
      const user = membro?.user ?? await ctx.client?.users?.fetch?.(uid).catch(() => null);
      const arq = avatar.arquivoDe(membro?.avatar) ?? avatar.arquivoDe(user?.avatar);
      if (!arq) return linha(COR.mod, `🖼️ <@${uid}> não tem foto.`, `🖼️ <@${uid}> has no picture.`, `🖼️ <@${uid}> no tiene foto.`);
      if (!process.env.IA_SERVICO_URL) return linha(COR.aviso, "⚠️ Sem o modelo de visão.", "⚠️ No vision model.", "⚠️ Sin modelo de visión.");
      const r = await avatar.analisarFoto(arq);
      if (!r) return linha(COR.aviso, "⚠️ O modelo de visão não respondeu.", "⚠️ The vision model didn't answer.", "⚠️ El modelo de visión no respondió.");
      const res = r.apitou ? T(`🖼️ Apitaria: ${r.motivos.join(", ")}`, `🖼️ Would flag: ${r.motivos.join(", ")}`, `🖼️ Saltaría: ${r.motivos.join(", ")}`) : T("🖼️ Passaria.", "🖼️ Would pass.", "🖼️ Pasaría.");
      return sendEmbed(canal, { description: `<@${uid}> — ${res}\n> ${r.descricao.replace(/\n+/g, " ").slice(0, 400)}`, colour: r.apitou ? COR.aviso : COR.sucesso });
    }
    return erroUso("Use `on`, `off`, `acao`, `tempo` ou `checar`", "Use `on`, `off`, `action`, `time` or `check`", "Usa `on`, `off`, `action`, `time` o `check`");
  }
}

// &automod whitelist <add|remove|list> [link|convite]   (ManagePermissions)
export async function cmdWhitelist(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return semPermissao(ctx, message.channel, "ManagePermissions");

  // Uma lista só para quem usa, dois destinos por dentro:
  //   • convite do Stoat (stt.gg/abc, ou só "abc")  → anti-invite
  //   • qualquer outro link ou domínio             → anti-link
  // Antes tudo ia para a lista de convites, e liberar um link comum não
  // surtia efeito nenhum: quem bloqueia link comum é o anti-link.
  config.inviteWhitelist ??= [];
  config.dominiosPermitidos ??= [];
  const sub = args[0]?.toLowerCase();
  const raw = (args[1] ?? "").trim();
  const convite = raw.match(/stt\.gg\/([A-Za-z0-9]+)/i)?.[1]?.toLowerCase()
    ?? (/^[A-Za-z0-9]+$/.test(raw) ? raw.toLowerCase() : null);
  const dominio = convite ? null : hostDe(raw);
  const en = lingua(ctx) === "en";
  const erroUso = () => sendEmbed(message.channel, {
    title: tr(ctx, "❌ Uso incorreto", "❌ Wrong usage", "❌ Uso incorrecto"),
    description: tr(ctx,
      `\`${citarInterno("automod", PREFIXO)} whitelist add <link|domínio|convite|#canal>\` · \`remove\` · \`list\``,
      `\`${citarInterno("automod", PREFIXO)} whitelist add <link|domain|invite|#channel>\` · \`remove\` · \`list\``,
      `\`${citar("automod", "es", PREFIXO)} whitelist add <enlace|dominio|invitación|#canal>\` · \`remove\` · \`list\``),
    colour: COR.erro,
  });

  // (21 out 2026) `#canal` (menção, `#nome` ou `aqui`): um canal onde CONVITES podem —
  // o canal de divulgação. Só o anti-invite deixa passar; anti-link, Sentinela e
  // antispam seguem valendo lá. Um nome solto (`abc`) continua sendo código de convite.
  const ehCanal = /^<#[^>]+>$|^#\S/.test(raw) || ["aqui", "here"].includes(raw.toLowerCase());
  if ((sub === "add" || sub === "remove") && ehCanal) {
    const canal = resolverCanal(raw, { message, server });
    if (!canal) return sendEmbed(message.channel, { title: tr(ctx, "❌ Canal não encontrado", "❌ Channel not found", "❌ Canal no encontrado"), colour: COR.erro,
      description: tr(ctx, `Não achei o canal \`${raw}\` neste servidor. Use \`#canal\`, o ID ou \`aqui\`.`, `I couldn't find the \`${raw}\` channel on this server. Use \`#channel\`, the ID or \`here\`.`,
        `No encontré el canal \`${raw}\` en este servidor. Usa \`#canal\`, el ID o \`here\`.`) });
    const dele = server?.channelIds ? (server.channelIds.has?.(canal) ?? true) : true;
    if (!dele) return sendEmbed(message.channel, { title: tr(ctx, "❌ Canal de outro servidor", "❌ Channel from another server", "❌ Canal de otro servidor"), colour: COR.erro, description: `\`${canal}\`` });
    const ai = config.automod.antiInvite;
    ai.canaisLiberados = sub === "add" ? [...new Set([...(ai.canaisLiberados ?? []), canal])] : (ai.canaisLiberados ?? []).filter((c) => c !== canal);
    salvarConfig();
    return sendEmbed(message.channel, {
      title: sub === "add" ? tr(ctx, "✅ Liberado", "✅ Allowed", "✅ Permitido") : tr(ctx, "✅ Removido", "✅ Removed", "✅ Quitado"),
      description: sub === "add"
        ? tr(ctx, `Convites de outros servidores podem ser postados em <#${canal}>. O resto do automod (links maliciosos, golpe, spam) continua valendo lá.`,
          `Invites to other servers can be posted in <#${canal}>. The rest of the automod (malicious links, scams, spam) still applies there.`,
          `Las invitaciones a otros servidores se pueden publicar en <#${canal}>. El resto del automod (enlaces maliciosos, estafas, spam) sigue aplicándose ahí.`)
        : tr(ctx, `<#${canal}> voltou a bloquear convites.`, `<#${canal}> blocks invites again.`, `<#${canal}> vuelve a bloquear invitaciones.`),
      colour: COR.sucesso,
    });
  }

  if (sub === "add" || sub === "remove") {
    if (!convite && !dominio) return erroUso();
    const lista = convite ? config.inviteWhitelist : config.dominiosPermitidos;
    const valor = convite ?? dominio;
    if (sub === "add" && !lista.includes(valor)) lista.push(valor);
    if (sub === "remove") {
      const i = lista.indexOf(valor);
      if (i >= 0) lista.splice(i, 1);
    }
    salvarConfig();
    const oque = convite
      ? (en ? `the \`${valor}\` invite` : `o convite \`${valor}\``)
      : (en ? `links to \`${valor}\` (and its subdomains)` : `links para \`${valor}\` (e seus subdomínios)`);
    const descEs = sub === "add"
      ? (convite ? `A partir de ahora, la invitación \`${valor}\` pasa el automod.` : `A partir de ahora, los enlaces a \`${valor}\` (y sus subdominios) pasan el automod.`)
      : (convite ? `La invitación \`${valor}\` salió de la lista de permitidos.` : `Los enlaces a \`${valor}\` (y sus subdominios) salieron de la lista de permitidos.`);
    return sendEmbed(message.channel, {
      title: sub === "add" ? tr(ctx, "✅ Liberado", "✅ Allowed", "✅ Permitido") : tr(ctx, "✅ Removido", "✅ Removed", "✅ Quitado"),
      description: tr(ctx,
        sub === "add" ? `A partir de agora, ${oque} passam pelo automod.` : `${oque[0].toUpperCase()}${oque.slice(1)} saíram da lista de permitidos.`,
        sub === "add" ? `From now on, ${oque} pass the automod.` : `${oque} are no longer on the whitelist.`,
        descEs),
      colour: COR.sucesso,
    });
  }

  if (sub === "list" || !sub) {
    const doms = config.dominiosPermitidos.map((d) => `• \`${d}\``).join("\n") || tr(ctx, "_nenhum_", "_none_", "_ninguno_");
    const convs = config.inviteWhitelist.map((c) => `• \`${c}\``).join("\n") || tr(ctx, "_nenhum_", "_none_", "_ninguna_");
    const canais = (config.automod?.antiInvite?.canaisLiberados ?? []).map((c) => `• <#${c}>`).join("\n") || tr(ctx, "_nenhum_", "_none_", "_ninguno_");
    return sendEmbed(message.channel, {
      title: tr(ctx, "📃 Lista de permitidos", "📃 Whitelist", "📃 Lista de permitidos"),
      description: tr(ctx,
        `**Domínios** _(o anti-link nunca bloqueia)_\n${doms}\n\n**Convites do Stoat** _(anti-invite)_\n${convs}\n\n**Canais onde convites podem** _(divulgação)_\n${canais}`,
        `**Domains** _(anti-link never blocks these)_\n${doms}\n\n**Stoat invites** _(anti-invite)_\n${convs}\n\n**Channels where invites are fine** _(advertising)_\n${canais}`,
        `**Dominios** _(el anti-link nunca los bloquea)_\n${doms}\n\n**Invitaciones de Stoat** _(anti-invite)_\n${convs}\n\n**Canales donde se permiten invitaciones** _(promoción)_\n${canais}`),
      colour: COR.info,
    });
  }

  return erroUso();
}

// &automod blocklist <add|remove|adddomain|removedomain|list|clear|reload> [url|domínio]
// (ManagePermissions)
export async function cmdBlocklist(message, args, ctx) {
  const { cfgGlobal, estado, sendEmbed, COR, getServer, membroTemPermissao, salvarGlobal, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return semPermissao(ctx, message.channel, "ManagePermissions");

  const sub = args[0]?.toLowerCase();
  const arg = args[1];

  // A lista de bloqueio é UMA SÓ para todos os servidores da Judy (o índice
  // tem milhões de domínios e mora na memória uma vez). Com o bot global,
  // qualquer admin de qualquer servidor apagava a lista de todos (`clear`),
  // bloqueava um domínio em todos (`adddomain`) ou fazia o bot baixar o que
  // quisesse (`add <url>`). Mexer nela é do dono do bot; olhar, de todos
  // (12 out 2026). Para liberar um domínio só aqui: `&automod whitelist`.
  const MUDA = ["add", "remove", "adddomain", "removedomain", "clear", "reload"];
  if (MUDA.includes(sub) && !ctx.ehSuperAdmin?.(message.authorId)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🔒 Só o dono do bot",
      description: `A lista de bloqueio é **compartilhada** por todos os servidores da Judy — mudar aqui mudaria para todos.\n\n\`${citarInterno("automod", PREFIXO)} blocklist list\` — ver o que está nela\n\`${citarInterno("automod", PREFIXO)} whitelist add <link>\` — liberar um site **só neste servidor**\n\`${citarInterno("automod", PREFIXO)} antilink dominios off\` — desligar o bloqueio por lista **só aqui**`,
      colour: COR.aviso,
    }, {
      title: "🔒 Bot owner only",
      description: `The blocklist is **shared** by every server Judy is in — changing it here would change it for all of them.\n\n\`${citarInterno("automod", PREFIXO)} blocklist list\` — see what's on it\n\`${citarInterno("automod", PREFIXO)} whitelist add <link>\` — allow a site **on this server only**\n\`${citarInterno("automod", PREFIXO)} antilink dominios off\` — turn off list blocking **here only**`,
      colour: COR.aviso,
    }, {
      title: "🔒 Solo el dueño del bot",
      description: `La lista de bloqueo es **compartida** por todos los servidores de Judy — cambiarla aquí la cambiaría para todos.\n\n\`${citar("automod", "es", PREFIXO)} blocklist list\` — ver lo que tiene\n\`${citar("automod", "es", PREFIXO)} whitelist add <enlace>\` — permitir un sitio **solo en este servidor**\n\`${citar("automod", "es", PREFIXO)} antilink domains off\` — desactivar el bloqueo por lista **solo aquí**`,
      colour: COR.aviso,
    }));
  }

  // ── Adicionar uma FONTE (URL de lista Pi-hole) ──
  if (sub === "add") {
    if (!fonteValida(arg))   // (31 out 2026, R10) só https://
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: `\`${citarInterno("automod", PREFIXO)} blocklist add <https://…>\` _(só https)_\nPara um único domínio use \`${citarInterno("automod", PREFIXO)} blocklist adddomain <domínio>\``,
        colour: COR.erro,
      }, {
        title: "❌ Wrong usage",
        description: `\`${citarInterno("automod", PREFIXO)} blocklist add <https://…>\` _(https only)_\nFor a single domain use \`${citarInterno("automod", PREFIXO)} blocklist adddomain <domain>\``,
        colour: COR.erro,
      }, {
        title: "❌ Uso incorrecto",
        description: `\`${citar("automod", "es", PREFIXO)} blocklist add <https://…>\` _(solo https)_\nPara un solo dominio usa \`${citar("automod", "es", PREFIXO)} blocklist adddomain <dominio>\``,
        colour: COR.erro,
      }));
    if (cfgGlobal.linkBlocklistSources.includes(arg))
      return sendEmbed(message.channel, tr(ctx,
        { description: "Essa lista já foi adicionada.", colour: COR.aviso },
        { description: "That list was already added.", colour: COR.aviso },
        { description: "Esa lista ya estaba añadida.", colour: COR.aviso }));

    await sendEmbed(message.channel, tr(ctx,
      { description: "⏳ Baixando lista, aguarde…", colour: COR.info },
      { description: "⏳ Downloading the list, hold on…", colour: COR.info },
      { description: "⏳ Descargando la lista, espera…", colour: COR.info }));
    cfgGlobal.linkBlocklistSources.push(arg);
    salvarGlobal();
    const r = await rebuildBlocklist(ctx, { forcar: true });
    // (31 out 2026, Reparo) "fonte adicionada" só se baixou: senão ela sai da config
    if (r?.falharam?.includes(arg)) {
      cfgGlobal.linkBlocklistSources = cfgGlobal.linkBlocklistSources.filter((u) => u !== arg);
      salvarGlobal();
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não consegui baixar a lista", description: "A fonte **não foi adicionada**. Confira o endereço (precisa ser `https://` e responder com uma lista de domínios) e tente de novo.", colour: COR.erro },
        { title: "❌ Couldn't download the list", description: "The source **wasn't added**. Check the address (it must be `https://` and return a list of domains) and try again.", colour: COR.erro },
        { title: "❌ No pude descargar la lista", description: "La fuente **no se añadió**. Revisa la dirección (tiene que ser `https://` y devolver una lista de dominios) e inténtalo de nuevo.", colour: COR.erro }));
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Lista adicionada",
        description: `Fonte adicionada. Total de domínios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "✅ List added",
        description: `Source added. Total blocked domains: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "✅ Lista añadida",
        description: `Fuente añadida. Total de dominios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  // ── Adicionar um ÚNICO domínio manualmente ──
  if (sub === "adddomain") {
    const dominio = (arg ?? "")
      .replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "").toLowerCase();
    if (!dominio || !DOMINIO_VALIDO.test(dominio))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Domínio inválido", description: `Ex.: \`${citarInterno("automod", PREFIXO)} blocklist adddomain 02giga.link\``, colour: COR.erro },
        { title: "❌ Invalid domain", description: `E.g.: \`${citarInterno("automod", PREFIXO)} blocklist adddomain 02giga.link\``, colour: COR.erro },
        { title: "❌ Dominio no válido", description: `Ej.: \`${citar("automod", "es", PREFIXO)} blocklist adddomain 02giga.link\``, colour: COR.erro }));
    if (nuncaBloquear(dominio))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Domínio protegido", description: `\`${dominio}\` está na lista "nunca bloquear" (o Stoat, os CDNs dele e sites básicos).`, colour: COR.erro },
        { title: "❌ Protected domain", description: `\`${dominio}\` is on the "never block" list (Stoat, its CDNs and basic sites).`, colour: COR.erro },
        { title: "❌ Dominio protegido", description: `\`${dominio}\` está en la lista "nunca bloquear" (Stoat, sus CDN y sitios básicos).`, colour: COR.erro }));
    if (!cfgGlobal.linkBlocklistManual.includes(dominio)) {
      cfgGlobal.linkBlocklistManual.push(dominio);
      salvarGlobal();
      await rebuildBlocklist(ctx, { forcar: true });
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Domínio bloqueado",
        description: `\`${dominio}\` foi adicionado. Total: **${estado.blockedDomains.size}** domínio(s).`, colour: COR.sucesso },
      { title: "✅ Domain blocked",
        description: `\`${dominio}\` was added. Total: **${estado.blockedDomains.size}** domain(s).`, colour: COR.sucesso },
      { title: "✅ Dominio bloqueado",
        description: `\`${dominio}\` se añadió. Total: **${estado.blockedDomains.size}** dominio(s).`, colour: COR.sucesso }));
  }

  // ── Remover um único domínio manual ──
  if (sub === "removedomain") {
    const dominio = (arg ?? "").toLowerCase();
    cfgGlobal.linkBlocklistManual = cfgGlobal.linkBlocklistManual.filter((d) => d !== dominio);
    salvarGlobal();
    await rebuildBlocklist(ctx, { forcar: true });
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Domínio removido",
        description: `\`${dominio}\` foi removido. Total: **${estado.blockedDomains.size}** domínio(s).`, colour: COR.sucesso },
      { title: "✅ Domain removed",
        description: `\`${dominio}\` was removed. Total: **${estado.blockedDomains.size}** domain(s).`, colour: COR.sucesso },
      { title: "✅ Dominio quitado",
        description: `\`${dominio}\` se quitó. Total: **${estado.blockedDomains.size}** dominio(s).`, colour: COR.sucesso }));
  }

  // ── Remover uma fonte (URL) ──
  if (sub === "remove") {
    if (!arg)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${citarInterno("automod", PREFIXO)} blocklist remove <url>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${citarInterno("automod", PREFIXO)} blocklist remove <url>\``, colour: COR.erro },
        { title: "❌ Uso incorrecto", description: `\`${citar("automod", "es", PREFIXO)} blocklist remove <url>\``, colour: COR.erro }));
    cfgGlobal.linkBlocklistSources = cfgGlobal.linkBlocklistSources.filter((u) => u !== arg);
    salvarGlobal();
    await rebuildBlocklist(ctx, { forcar: true });
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Lista removida",
        description: `Total de domínios bloqueados agora: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "✅ List removed",
        description: `Total blocked domains now: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "✅ Lista quitada",
        description: `Total de dominios bloqueados ahora: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  if (sub === "list") {
    const fontes = cfgGlobal.linkBlocklistSources.length
      ? cfgGlobal.linkBlocklistSources.map((u) => `• ${u}`).join("\n")
      : tr(ctx, "_Nenhuma fonte (URL) adicionada._", "_No sources (URLs) added._", "_No hay fuentes (URL) añadidas._");
    const manuais = cfgGlobal.linkBlocklistManual.length
      ? cfgGlobal.linkBlocklistManual.map((d) => `• \`${d}\``).join("\n")
      : tr(ctx, "_Nenhum domínio manual._", "_No manual domains._", "_No hay dominios manuales._");
    return sendEmbed(message.channel, tr(ctx, {
      title: "📃 Bloqueios anti-link",
      description: `**Fontes (URLs):**\n${fontes}\n\n**Domínios manuais:**\n${manuais}\n\n**Total carregado:** ${estado.blockedDomains.size}`,
      colour: COR.info,
    }, {
      title: "📃 Anti-link blocks",
      description: `**Sources (URLs):**\n${fontes}\n\n**Manual domains:**\n${manuais}\n\n**Total loaded:** ${estado.blockedDomains.size}`,
      colour: COR.info,
    }, {
      title: "📃 Bloqueos anti-link",
      description: `**Fuentes (URL):**\n${fontes}\n\n**Dominios manuales:**\n${manuais}\n\n**Total cargado:** ${estado.blockedDomains.size}`,
      colour: COR.info,
    }));
  }

  if (sub === "clear") {
    cfgGlobal.linkBlocklistSources = [];
    cfgGlobal.linkBlocklistManual = [];
    salvarGlobal();
    estado.blockedDomains = engine.criarIndiceVazio();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🗑 Listas limpas", description: "Todas as fontes e domínios foram removidos.", colour: COR.sucesso },
      { title: "🗑 Lists cleared", description: "All sources and domains were removed.", colour: COR.sucesso },
      { title: "🗑 Listas borradas", description: "Se quitaron todas las fuentes y dominios.", colour: COR.sucesso }));
  }

  if (sub === "reload") {
    await sendEmbed(message.channel, tr(ctx,
      { description: "⏳ Recarregando listas…", colour: COR.info },
      { description: "⏳ Reloading the lists…", colour: COR.info },
      { description: "⏳ Recargando las listas…", colour: COR.info }));
    await rebuildBlocklist(ctx, { forcar: true });
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔄 Listas recarregadas",
        description: `Total de domínios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "🔄 Lists reloaded",
        description: `Total blocked domains: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "🔄 Listas recargadas",
        description: `Total de dominios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  // Só `&automod blocklist` (a ajuda o mostra assim) é uma pergunta, não um erro (17 out 2026).
  const so = !sub;
  return sendEmbed(message.channel, tr(ctx, {
    title: so ? "🧱 Lista de bloqueio" : "❌ Uso incorreto",
    description: [
      so ? `**${estado.blockedDomains.size}** domínio(s) carregado(s), compartilhados por todos os servidores.\n` : null,
      `\`${citarInterno("automod", PREFIXO)} blocklist add <url>\` — adiciona lista Pi-hole`,
      `\`${citarInterno("automod", PREFIXO)} blocklist adddomain <domínio>\` — bloqueia 1 domínio`,
      `\`${citarInterno("automod", PREFIXO)} blocklist removedomain <domínio>\``,
      `\`${citarInterno("automod", PREFIXO)} blocklist remove <url>\``,
      `\`${citarInterno("automod", PREFIXO)} blocklist list | clear | reload\``,
    ].filter((x) => x !== null).join("\n"),
    colour: so ? COR.info : COR.erro,
  }, {
    title: so ? "🧱 Blocklist" : "❌ Wrong usage",
    description: [
      so ? `**${estado.blockedDomains.size}** domain(s) loaded, shared by every server.\n` : null,
      `\`${citarInterno("automod", PREFIXO)} blocklist add <url>\` — adds a Pi-hole list`,
      `\`${citarInterno("automod", PREFIXO)} blocklist adddomain <domain>\` — blocks 1 domain`,
      `\`${citarInterno("automod", PREFIXO)} blocklist removedomain <domain>\``,
      `\`${citarInterno("automod", PREFIXO)} blocklist remove <url>\``,
      `\`${citarInterno("automod", PREFIXO)} blocklist list | clear | reload\``,
    ].filter((x) => x !== null).join("\n"),
    colour: so ? COR.info : COR.erro,
  }, {
    title: so ? "🧱 Lista de bloqueo" : "❌ Uso incorrecto",
    description: [
      so ? `**${estado.blockedDomains.size}** dominio(s) cargado(s), compartidos por todos los servidores.\n` : null,
      `\`${citar("automod", "es", PREFIXO)} blocklist add <url>\` — añade una lista Pi-hole`,
      `\`${citar("automod", "es", PREFIXO)} blocklist adddomain <dominio>\` — bloquea 1 dominio`,
      `\`${citar("automod", "es", PREFIXO)} blocklist removedomain <dominio>\``,
      `\`${citar("automod", "es", PREFIXO)} blocklist remove <url>\``,
      `\`${citar("automod", "es", PREFIXO)} blocklist list | clear | reload\``,
    ].filter((x) => x !== null).join("\n"),
    colour: so ? COR.info : COR.erro,
  }));
}

export async function cmdScam(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return semPermissao(ctx, message.channel, "ManagePermissions");

  const cfg = config.automod.antiScam;
  const pol = config.automod.punicao;
  // Os nomes do painel eram só em inglês: `&automod sentinela sensibilidade
  // alta` e `canal aqui` davam "Subcomando desconhecido" (17 out 2026). Os
  // dois idiomas valem; o nome interno continua o de antes.
  const PAINEL = {
    sensibilidade: "sensitivity", sensitivity: "sensitivity", sens: "sensitivity",
    canal: "channel", channel: "channel",
    banir: "ban", ban: "ban",
    liberar: "dismiss", dismiss: "dismiss",
    testar: "test", teste: "test", test: "test",
    simular: "test", simulate: "test",   // (P2) simular = testar
  };
  const bruto0 = args[0]?.toLowerCase();
  const sub = PAINEL[bruto0] ?? bruto0;
  const val = args[1];
  const limiarDe = (sens) => engine.limiarBase(sens);

  // (P2) uma tela só para o sentinela: a do `&automod sentinela`
  if (!sub || sub === "config" || sub === "status") return cmdAutomod(message, ["sentinela"], ctx);

  if (["on", "off", "ligar", "desligar", "enable", "disable"].includes(sub)) {
    const ligar = ["on", "ligar", "enable"].includes(sub);
    cfg.enabled = ligar;
    salvarConfig?.();
    return sendEmbed(message.channel, { description: tr(ctx, `🛡 **sentinela** ${ligar ? "🟢 ligado" : "🔴 desligado"}.`, `🛡 **sentinel** ${ligar ? "🟢 on" : "🔴 off"}.`, `🛡 **centinela** ${ligar ? "🟢 activado" : "🔴 desactivado"}.`), colour: ligar ? COR.sucesso : COR.mod });
  }

  if (["antiguidade", "tenure", "novatos"].includes(sub)) {
    const on = ["on", "sim", "yes", "true"].includes(String(val ?? "").toLowerCase());
    const off = ["off", "nao", "não", "no", "false"].includes(String(val ?? "").toLowerCase());
    if (!on && !off) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${citarInterno("automod.sentinela.antiguidade", PREFIXO)} on|off\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${citarInterno("automod.sentinela.antiguidade", PREFIXO)} on|off\``, colour: COR.erro },
        { title: "❌ Uso", description: `\`${citar("automod.sentinela.antiguidade", "es", PREFIXO)} on|off\``, colour: COR.erro }));
    }
    cfg.porAntiguidade = on; salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: on ? "🟢 Rigor por antiguidade ligado" : "🔴 Rigor por antiguidade desligado",
      description: on
        ? "Quem chegou agora é olhado de perto; quem já convive no servidor ganha margem.\nA medida de convívio é o **nível de XP** — ele só sobe conversando, ao longo do tempo."
        : "O limiar volta a ser igual para todo mundo, independente de há quanto tempo a pessoa está aqui.",
      colour: on ? COR.sucesso : COR.aviso,
    }, {
      title: on ? "🟢 Stricter with newcomers: on" : "🔴 Stricter with newcomers: off",
      description: on
        ? "Newcomers get a closer look; people who already belong here get slack.\nTenure is measured by **XP level** — it only grows by talking, over time."
        : "The threshold is the same for everyone again, regardless of how long they've been here.",
      colour: on ? COR.sucesso : COR.aviso,
    }, {
      title: on ? "🟢 Más estricto con los recién llegados: activado" : "🔴 Más estricto con los recién llegados: desactivado",
      description: on
        ? "A quien acaba de llegar se le mira de cerca; quien ya convive en el servidor gana margen.\nLa medida de convivencia es el **nivel de XP** — solo sube conversando, con el tiempo."
        : "El umbral vuelve a ser igual para todos, sin importar cuánto tiempo lleve cada uno aquí.",
      colour: on ? COR.sucesso : COR.aviso,
    }));
  }

  if (["alerta", "alertar", "alert", "staff"].includes(sub)) {
    const on = ["on", "sim", "yes", "true"].includes(String(val ?? "").toLowerCase());
    const off = ["off", "nao", "não", "no", "false"].includes(String(val ?? "").toLowerCase());
    if (!on && !off) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${citarInterno("automod.sentinela.alerta", PREFIXO)} on|off\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${citarInterno("automod.sentinela.alerta", PREFIXO)} on|off\``, colour: COR.erro },
        { title: "❌ Uso", description: `\`${citar("automod.sentinela.alerta", "es", PREFIXO)} on|off\``, colour: COR.erro }));
    }
    cfg.alertarAdmin = on; salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: on ? "🟢 Alerta à staff ligado" : "🔴 Alerta à staff desligado",
      description: on
        ? `A staff é marcada quando alguém levanta suspeita **repetidas vezes** em pouco tempo — mesmo sem chegar ao limiar de punição.\nUm sinal isolado é ruído; um padrão merece olho humano.\nCargos marcados: os de \`${citarInterno("acesso.cargo", PREFIXO)}\`.`
        : "Nada de marcações. As punições continuam normalmente; só o aviso preventivo sai de cena.",
      colour: on ? COR.sucesso : COR.aviso,
    }, {
      title: on ? "🟢 Staff alerts on" : "🔴 Staff alerts off",
      description: on
        ? `Staff gets pinged when someone raises suspicion **repeatedly** in a short window — even below the punishment threshold.\nOne signal is noise; a pattern deserves human eyes.\nRoles pinged: the ones in \`${citarInterno("acesso.cargo", PREFIXO)}\`.`
        : "No pings. Punishments still work; only the preventive heads-up goes away.",
      colour: on ? COR.sucesso : COR.aviso,
    }, {
      title: on ? "🟢 Alerta al staff activada" : "🔴 Alerta al staff desactivada",
      description: on
        ? `Se menciona al staff cuando alguien levanta sospechas **repetidas veces** en poco tiempo — aunque no llegue al umbral de castigo.\nUna señal aislada es ruido; un patrón merece una mirada humana.\nRoles mencionados: los de \`${citar("acesso.cargo", "es", PREFIXO)}\`.`
        : "Nada de menciones. Los castigos siguen funcionando; solo desaparece el aviso preventivo.",
      colour: on ? COR.sucesso : COR.aviso,
    }));
  }

  if (sub === "sensitivity") {
    const opc = ["baixa", "media", "alta"];
    const v = { low: "baixa", medium: "media", média: "media", high: "alta" }[String(val ?? "").toLowerCase()] ?? String(val ?? "").toLowerCase();
    if (!opc.includes(v))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${citarInterno("automod.sentinela.sensibilidade", PREFIXO)} <${opc.join("|")}>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${citarInterno("automod.sentinela.sensibilidade", PREFIXO)} <low|medium|high>\``, colour: COR.erro },
        { title: "❌ Uso", description: `\`${citar("automod.sentinela.sensibilidade", "es", PREFIXO)} <low|medium|high>\``, colour: COR.erro }));
    cfg.sensitivity = v; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Sensibilidade", description: `Sensibilidade: **${v}** (limiar ${limiarDe(v)}/10).`, colour: COR.sucesso },
      { title: "✅ Sensitivity", description: `Sensitivity: **${nomeSens(v, "en")}** (threshold ${limiarDe(v)}/10).`, colour: COR.sucesso },
      { title: "✅ Sensibilidad", description: `Sensibilidad: **${nomeSens(v, "en")}** (umbral ${limiarDe(v)}/10).`, colour: COR.sucesso }));
  }

  if (sub === "channel") {
    if (!val) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${citarInterno("automod.sentinela.canal", PREFIXO)} <#canal|aqui>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${citarInterno("automod.sentinela.canal", PREFIXO)} <#channel|here>\``, colour: COR.erro },
      { title: "❌ Uso", description: `\`${citar("automod.sentinela.canal", "es", PREFIXO)} <#canal|here>\``, colour: COR.erro }));
    // 17 out 2026: aceitava qualquer texto (até ID de canal de outro servidor) e não achava `#nome`;
    // e o `off` que a ajuda ensinava virava o "ID" do canal.
    if (["off", "nenhum", "none", "limpar", "clear"].includes(val.toLowerCase())) {
      cfg.alertChannelId = null; salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Canal de aviso", description: "Sem canal próprio: os avisos vão para o canal de logs (sem ele, não são enviados).", colour: COR.sucesso },
        { title: "✅ Alert channel", description: "No channel of its own: alerts go to the log channel (without one, they aren't sent).", colour: COR.sucesso },
        { title: "✅ Canal de aviso", description: "Sin canal propio: los avisos van al canal de registro (sin él, no se envían).", colour: COR.sucesso }));
    }
    const alvo = resolverCanal(val, { message, server });
    const deOutro = alvo && server?.channelIds?.size && !server.channelIds.has(alvo);
    if (!alvo || deOutro) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Canal não encontrado", description: `Não achei \`${val}\` neste servidor. Use \`#canal\`, o ID ou \`aqui\`.`, colour: COR.erro },
      { title: "❌ Channel not found", description: `I couldn't find \`${val}\` on this server. Use \`#channel\`, the ID or \`here\`.`, colour: COR.erro },
      { title: "❌ Canal no encontrado", description: `No encontré \`${val}\` en este servidor. Usa \`#canal\`, el ID o \`here\`.`, colour: COR.erro }));
    cfg.alertChannelId = alvo;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Canal de aviso", description: `Avisos irão para \`${cfg.alertChannelId}\`.`, colour: COR.sucesso },
      { title: "✅ Alert channel", description: `Alerts will go to \`${cfg.alertChannelId}\`.`, colour: COR.sucesso },
      { title: "✅ Canal de aviso", description: `Los avisos irán a \`${cfg.alertChannelId}\`.`, colour: COR.sucesso }));
  }

  // `sentinela banir <@pessoa|id> [motivo]` (o comando pronto dos alertas): é o &ban,
  // com as mesmas checagens (BanMembers, hierarquia, alvo escrito) — P2
  if (sub === "ban") return (await import("./punir.js")).cmdBan(message, args.slice(1), ctx);

  if (sub === "dismiss") {
    const uid = String(val ?? "").replace(/[<@>]/g, "").trim() || null;   // o ID escrito (numa resposta, o mentionIds é outra pessoa)
    if (!uid) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${citarInterno("automod.sentinela.liberar", PREFIXO)} <@pessoa|id>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${citarInterno("automod.sentinela.liberar", PREFIXO)} <@user|id>\``, colour: COR.erro },
      { title: "❌ Uso", description: `\`${citar("automod.sentinela.liberar", "es", PREFIXO)} <@usuario|id>\``, colour: COR.erro }));
    try {
      await tirarTimeout(server, uid);
      // quem foi silenciado ainda com o cargo antigo
      if (pol.silenceRoleId) await removerCargoSilence(server, uid, pol.silenceRoleId, ctx).catch(() => {});
      db.limparPunicao(ctx.serverId, uid);   // some do banco: não reaplica ao reentrar
      liberarQuarentena(ctx.serverId, uid);
      await log.registrar(ctx, "punicoes", { titulo: "✅ Punição removida",
        descricao: `<@${uid}> foi liberado por <@${message.authorId}>.`,
        en: { titulo: "✅ Punishment removed", descricao: `<@${uid}> was released by <@${message.authorId}>.` },
        es: { titulo: "✅ Castigo quitado", descricao: `<@${uid}> fue liberado por <@${message.authorId}>.` } });
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Liberado", description: `Punição de <@${uid}> removida.`, colour: COR.sucesso },
        { title: "✅ Released", description: `<@${uid}>'s punishment was removed.`, colour: COR.sucesso },
        { title: "✅ Liberado", description: `Se quitó el castigo de <@${uid}>.`, colour: COR.sucesso }));
    } catch (err) {
      // A API do Stoat lança objetos, não Error: `err.message` virava "undefined".
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Erro", description: `Não foi possível liberar: ${engine.descreverErro(err, "pt")}`, colour: COR.erro },
        { title: "❌ Error", description: `Couldn't release: ${engine.descreverErro(err, "en")}`, colour: COR.erro },
        { title: "❌ Error", description: `No se pudo liberar: ${engine.descreverErro(err, "es")}`, colour: COR.erro }));
    }
  }

  // `testar` (e `simular`, o mesmo): a nota que o texto teria, sem punir ninguém
  if (sub === "test") {
    const texto = args.slice(1).join(" ");
    if (!texto) return erroDeUso(ctx, message.channel, "automod", "Testar o quê?", "Test what?", "¿Probar qué?");
    const r = analisarConteudo(texto, { rate: 1 });
    const limiar = limiarDe(cfg.sensitivity);
    const flag = r.nota >= limiar;
    const sinais = r.sinais.join(", ") || "—";
    return sendEmbed(message.channel, { colour: flag ? COR.erro : COR.sucesso, description: tr(ctx,
      `${flag ? "🛑" : "✅"} **${r.nota.toFixed(1)}/10** (limiar ${limiar}${cfg.enabled ? "" : ", desligado"})${r.grave ? " · grave" : ""} · ${sinais}`,
      `${flag ? "🛑" : "✅"} **${r.nota.toFixed(1)}/10** (threshold ${limiar}${cfg.enabled ? "" : ", off"})${r.grave ? " · serious" : ""} · ${sinais}`,
      `${flag ? "🛑" : "✅"} **${r.nota.toFixed(1)}/10** (umbral ${limiar}${cfg.enabled ? "" : ", desactivado"})${r.grave ? " · grave" : ""} · ${sinais}`) });
  }

  return erroDeUso(ctx, message.channel, "automod", `\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` não existe no sentinela`, `\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` doesn't exist in the sentinel`, `\`${String(args[0]).slice(0, 30).replace(/`/g, "")}\` no existe en el centinela`);
}

export async function cmdPunicao(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return semPermissao(ctx, message.channel, "ManagePermissions");

  const pol = config.automod.punicao;
  const sub = args[0]?.toLowerCase();
  const bruto = String(args[1] ?? "").toLowerCase();
  const val = MODO_EN[bruto] ?? (["avisar", "apagar", "confirmar", "acumular", "banir"].includes(bruto) ? bruto : args[1]);

  const rotulo = (m) => tr(ctx,
      (m === "banir"     ? "banimento imediato"
     : m === "acumular"  ? `avisos acumulados → ban em ${engine.limiteDeAvisos(pol)}`
     : m === "confirmar" ? "confirmar (silencia e espera moderador)"
     :                     "apenas aviso (não apaga nem pune)"),
      (m === "banir"     ? "instant ban"
     : m === "acumular"  ? `stacked warnings → ban at ${engine.limiteDeAvisos(pol)}`
     : m === "confirmar" ? "confirm (silences and waits for a moderator)"
     :                     "warning only (doesn't delete or punish)"),
      (m === "banir"     ? "ban inmediato"
     : m === "acumular"  ? `avisos acumulados → ban en ${engine.limiteDeAvisos(pol)}`
     : m === "confirmar" ? "confirm (silencia y espera a un moderador)"
     :                     "solo aviso (no borra ni castiga)"));

  if (!sub || sub === "status" || sub === "config") {
    return sendEmbed(message.channel, tr(ctx, {
      title: "⚖️ Política de punição — vale para TODOS os automods",
      colour: COR.mod,
      description: [
        `**Modo:** ${pol.modo} — ${rotulo(pol.modo)}`,
        `**Escada (modo acumular):** ${engine.escadaDePunicao(pol).map((d) => engine.rotuloDegrau(d, "pt")).join(" → ")} — ban no aviso **${engine.limiteDeAvisos(pol)}**`,
        `**Avisos vencem:** ${engine.validadeDosAvisos(pol) ? `depois de ${Math.round(engine.validadeDosAvisos(pol) / 86_400_000)} dias sem um novo` : "nunca"}`,
        "**Filtros de ruído** (repetição, caixa alta, emoji, velocidade…): a 1ª vez em 10 min é só um toque, sem aviso (menos conta nova e em raid)",
        "**Silêncio:** timeout nativo do Stoat (o bot precisa de **TimeoutMembers**)",
        "",
        "**Níveis de agressividade:**",
        "• `avisar` — só avisa, não pune (filtro de regra fixa — ódio, convite, link da lista, spam — ainda apaga a mensagem; o sentinela não)",
        "• `apagar` — remove a mensagem, sem punir a pessoa",
        "• `confirmar` — remove, silencia e espera um moderador confirmar",
        "• `acumular` — dá avisos; ao atingir o limite, bane",
        "• `banir` — bane na hora",
        "",
        `_Não sabe por onde começar? \`${citarInterno("tutorial.moderacao", PREFIXO)}\` explica o caminho._`,
        "",
        "**Comandos:**",
        `\`${citarInterno("automod.punicao", PREFIXO)} modo <avisar|apagar|confirmar|acumular|banir>\``,
        `\`${citarInterno("automod.punicao", PREFIXO)} escada [aviso,5m,1h,ban]\` — os degraus do modo \`acumular\``,
        `\`${citarInterno("automod.punicao", PREFIXO)} warns <número>\` — quantos avisos até o ban (ajusta a escada)`,
        `\`${citarInterno("automod.punicao.validade", PREFIXO)} <dias|0>\` — em quantos dias os avisos zeram (0 = nunca)`,
        "",
        `_Para experimentar um texto, quem faz isso é o filtro: \`${citarInterno("automod.sentinela.testar", PREFIXO)} <texto>\`. Este comando só decide o que **acontece** depois._`,
      ].join("\n"),
    }, {
      title: "⚖️ Punishment policy — applies to ALL automods",
      colour: COR.mod,
      description: [
        `**Mode:** \`${nomeModo(pol.modo, "en")}\` — ${rotulo(pol.modo)}`,
        `**Ladder (\`stack\` mode):** ${engine.escadaDePunicao(pol).map((d) => engine.rotuloDegrau(d, "en")).join(" → ")} — ban at warning **${engine.limiteDeAvisos(pol)}**`,
        `**Warnings expire:** ${engine.validadeDosAvisos(pol) ? `after ${Math.round(engine.validadeDosAvisos(pol) / 86_400_000)} days without a new one` : "never"}`,
        "**Noise filters** (repeat, caps, emoji, speed…): the 1st time in 10 min is just a heads-up, without a warning (except new accounts and during a raid)",
        "**Silence:** the Stoat's native timeout (the bot needs **TimeoutMembers**)",
        "",
        "**Aggressiveness levels:**",
        "• `avisar` — warn only, no punishment (fixed-rule filters such as hate, invites, blocked links and spam still delete the message; the sentinel doesn't)",
        "• `apagar` — removes the message without punishing the person",
        "• `confirmar` — removes, silences and waits for a moderator's confirmation",
        "• `acumular` — issues warnings; at the limit, bans",
        "• `banir` — bans on the spot",
        "",
        `_Not sure where to start? \`${citarInterno("tutorial.moderacao", PREFIXO)}\` explains the path._`,
        "",
        "**Commands:**",
        `\`${citarInterno("automod.punicao", PREFIXO)} modo <avisar|apagar|confirmar|acumular|banir>\``,
        `\`${citarInterno("automod.punicao", PREFIXO)} escada [aviso,5m,1h,ban]\` — the steps of \`stack\` mode`,
        `\`${citarInterno("automod.punicao", PREFIXO)} warns <number>\` — how many warnings until the ban (adjusts the ladder)`,
        `\`${citarInterno("automod.punicao.validade", PREFIXO)} <days|0>\` — after how many days warnings reset (0 = never)`,
        "",
        `_To try a text out, that's the filter's job: \`${citarInterno("automod.sentinela.testar", PREFIXO)} <text>\`. This command only decides what **happens** afterwards._`,
      ].join("\n"),
    }, {
      title: "⚖️ Política de castigo — vale para TODOS los automods",
      colour: COR.mod,
      description: [
        `**Modo:** \`${nomeModo(pol.modo, "es")}\` — ${rotulo(pol.modo)}`,
        `**Escalera (modo \`stack\`):** ${engine.escadaDePunicao(pol).map((d) => engine.rotuloDegrau(d, "es")).join(" → ")} — ban en el aviso **${engine.limiteDeAvisos(pol)}**`,
        `**Los avisos vencen:** ${engine.validadeDosAvisos(pol) ? `tras ${Math.round(engine.validadeDosAvisos(pol) / 86_400_000)} días sin uno nuevo` : "nunca"}`,
        "**Filtros de ruido** (repetición, mayúsculas, emoji, velocidad…): la 1.ª vez en 10 min es solo un toque de atención, sin aviso (salvo cuentas nuevas y durante un raid)",
        "**Silencio:** el timeout nativo de Stoat (el bot necesita **TimeoutMembers**)",
        "",
        "**Niveles de agresividad:**",
        "• `warn` — solo avisa, no castiga (los filtros de regla fija, como odio, invitaciones, enlaces bloqueados y spam, igual borran el mensaje; el centinela no)",
        "• `delete` — borra el mensaje sin castigar a la persona",
        "• `confirm` — borra, silencia y espera la confirmación de un moderador",
        "• `stack` — da avisos; al llegar al límite, banea",
        "• `ban` — banea en el acto",
        "",
        `_¿No sabes por dónde empezar? \`${citar("tutorial.moderacao", "es", PREFIXO)}\` explica el camino._`,
        "",
        "**Comandos:**",
        `\`${citar("automod.punicao", "es", PREFIXO)} mode <warn|delete|confirm|stack|ban>\``,
        `\`${citar("automod.punicao", "es", PREFIXO)} ladder [warn,5m,1h,ban]\` — los peldaños del modo \`stack\``,
        `\`${citar("automod.punicao", "es", PREFIXO)} warns <número>\` — cuántos avisos hasta el ban (ajusta la escalera)`,
        `\`${citar("automod.punicao.validade", "es", PREFIXO)} <días|0>\` — tras cuántos días se reinician los avisos (0 = nunca)`,
        "",
        `_Para probar un texto, eso le toca al filtro: \`${citar("automod.sentinela.testar", "es", PREFIXO)} <texto>\`. Este comando solo decide lo que **pasa** después._`,
      ].join("\n"),
    }));
  }

  if (sub === "modo" || sub === "mode") {
    if (!["avisar", "apagar", "confirmar", "acumular", "banir"].includes(val))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${citarInterno("automod.punicao", PREFIXO)} modo <avisar|apagar|confirmar|acumular|banir>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${citarInterno("automod.punicao", PREFIXO)} modo <avisar|apagar|confirmar|acumular|banir>\``, colour: COR.erro },
        { title: "❌ Uso", description: `\`${citar("automod.punicao", "es", PREFIXO)} mode <warn|delete|confirm|stack|ban>\``, colour: COR.erro }));
    pol.modo = val; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Modo de punição atualizado", description: `Agora: **${val}** — ${rotulo(val)}.`, colour: COR.sucesso },
      { title: "✅ Punishment mode updated", description: `Now: **${nomeModo(val, "en")}** — ${rotulo(val)}.`, colour: COR.sucesso },
      { title: "✅ Modo de castigo actualizado", description: `Ahora: **${nomeModo(val, "es")}** — ${rotulo(val)}.`, colour: COR.sucesso }));
  }

  // ── Os degraus do modo acumular ──
  if (["escada", "degraus", "ladder", "steps"].includes(sub)) {
    const bruto = args.slice(1).join(" ").trim();
    if (!bruto) {
      const atual = engine.escadaDePunicao(pol);
      return sendEmbed(message.channel, tr(ctx, {
        title: "🪜 Escada de punição",
        description: [
          "No modo `acumular`, cada reincidência sobe um degrau:",
          "",
          ...atual.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "pt")}`),
          "",
          "Quem para no primeiro degrau nunca chega ao último.",
          "",
          `\`${citarInterno("automod.punicao", PREFIXO)} escada aviso,5m,1h,ban\` — o padrão`,
          `\`${citarInterno("automod.punicao", PREFIXO)} escada aviso,10m,1h,12h,ban\` — mais degraus`,
          "",
          "_Aceita `aviso`, `ban` e prazos como `30s`, `10m`, `2h`, `1d`._",
          "_O ban é sempre o último degrau, mesmo que você não escreva._",
        ].join("\n"), colour: COR.mod,
      }, {
        title: "🪜 Punishment ladder",
        description: [
          "In `stack` mode, each repeat offence climbs a step:",
          "",
          ...atual.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "en")}`),
          "",
          "Whoever stops at the first step never reaches the last.",
          "",
          `\`${citarInterno("automod.punicao", PREFIXO)} escada aviso,5m,1h,ban\` — the default`,
          `\`${citarInterno("automod.punicao", PREFIXO)} escada aviso,10m,1h,12h,ban\` — more steps`,
          "",
          "_Accepts `warn`, `ban` and durations like `30s`, `10m`, `2h`, `1d`._",
          "_A ban is always the last step, even if you don't write it._",
        ].join("\n"), colour: COR.mod,
      }, {
        title: "🪜 Escalera de castigos",
        description: [
          "En el modo `stack`, cada reincidencia sube un peldaño:",
          "",
          ...atual.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "es")}`),
          "",
          "Quien se detiene en el primer peldaño nunca llega al último.",
          "",
          `\`${citar("automod.punicao", "es", PREFIXO)} ladder warn,5m,1h,ban\` — el predeterminado`,
          `\`${citar("automod.punicao", "es", PREFIXO)} ladder warn,10m,1h,12h,ban\` — más peldaños`,
          "",
          "_Acepta `warn`, `ban` y plazos como `30s`, `10m`, `2h`, `1d`._",
          "_El ban siempre es el último peldaño, aunque no lo escribas._",
        ].join("\n"), colour: COR.mod,
      }));
    }
    const teste = engine.escadaDePunicao({ escada: bruto }, { estrito: true });
    if (teste.length < 2) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Escada inválida", description: `Não entendi \`${bruto}\`.\n\nEx.: \`aviso,5m,1h,ban\``, colour: COR.erro },
        { title: "❌ Invalid ladder", description: `I didn't understand \`${bruto}\`.\n\nE.g.: \`warn,5m,1h,ban\``, colour: COR.erro },
        { title: "❌ Escalera no válida", description: `No entendí \`${bruto}\`.\n\nEj.: \`warn,5m,1h,ban\``, colour: COR.erro }));
    }
    pol.escada = bruto; pol.warnsParaBan = teste.length; salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: "🪜 Escada atualizada",
      description: teste.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "pt")}`).join("\n"),
      colour: COR.sucesso,
    }, {
      title: "🪜 Ladder updated",
      description: teste.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "en")}`).join("\n"),
      colour: COR.sucesso,
    }, {
      title: "🪜 Escalera actualizada",
      description: teste.map((d, i) => `**${i + 1}.** ${engine.rotuloDegrau(d, "es")}`).join("\n"),
      colour: COR.sucesso,
    }));
  }

  if (sub === "warns" || sub === "warnsparaban") {
    const n = parseInt(val, 10);
    if (!Number.isInteger(n) || n < 1 || n > 20)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${citarInterno("automod.punicao", PREFIXO)} warns <1-20>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${citarInterno("automod.punicao", PREFIXO)} warns <1-20>\``, colour: COR.erro },
        { title: "❌ Uso", description: `\`${citar("automod.punicao", "es", PREFIXO)} warns <1-20>\``, colour: COR.erro }));
    // O ban é o último degrau da escada: "warns N" ajusta a escada para N
    // degraus — corta os do fim ou repete o último antes do ban.
    const antes = engine.escadaDePunicao(pol).slice(0, -1).map((d) => d.tipo === "aviso" ? "aviso" : d.rotulo.replace(" min", "m"));
    const passos = antes.slice(0, n - 1);
    while (passos.length < n - 1) passos.push(passos.at(-1) ?? "aviso");
    pol.escada = [...passos, "ban"].join(",");
    pol.warnsParaBan = n; salvarConfig();
    const nova = engine.escadaDePunicao(pol);
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Avisos para ban", description: `No modo \`acumular\`, o ban ocorre no aviso **${n}**.\n🪜 ${nova.map((d) => engine.rotuloDegrau(d, "pt")).join(" → ")}`, colour: COR.sucesso },
      { title: "✅ Warnings until ban", description: `In \`stack\` mode, the ban happens at warning **${n}**.\n🪜 ${nova.map((d) => engine.rotuloDegrau(d, "en")).join(" → ")}`, colour: COR.sucesso },
      { title: "✅ Avisos hasta el ban", description: `En el modo \`stack\`, el ban llega en el aviso **${n}**.\n🪜 ${nova.map((d) => engine.rotuloDegrau(d, "es")).join(" → ")}`, colour: COR.sucesso }));
  }

  if (["validade", "vencimento", "expira", "expiry", "expire"].includes(sub)) {
    // Sem valor mostra a atual, como a `escada` (17 out 2026: dava "❌ Uso").
    if (val === undefined || val === "") {
      const atual = Number(pol.validadeDias ?? engine.VALIDADE_PADRAO_DIAS ?? 30);
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Validade dos avisos", colour: COR.info, description: [
          atual ? `Os avisos zeram depois de **${atual}** dia(s) sem um novo.` : "Os avisos **nunca** zeram sozinhos.",
          `\`${citarInterno("automod.punicao.validade", PREFIXO)} <0-365>\` — muda (0 = nunca zeram)`].join("\n") },
        { title: "⏳ Warning expiry", colour: COR.info, description: [
          atual ? `Warnings reset after **${atual}** day(s) without a new one.` : "Warnings **never** reset on their own.",
          `\`${citarInterno("automod.punicao", PREFIXO)} expiry <0-365>\` — changes it (0 = never)`].join("\n") },
        { title: "⏳ Vigencia de los avisos", colour: COR.info, description: [
          atual ? `Los avisos se reinician tras **${atual}** día(s) sin uno nuevo.` : "Los avisos **nunca** se reinician solos.",
          `\`${citar("automod.punicao.validade", "es", PREFIXO)} <0-365>\` — lo cambia (0 = nunca)`].join("\n") }));
    }
    const d = parseInt(val, 10);
    if (!Number.isInteger(d) || d < 0 || d > 365)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${citarInterno("automod.punicao.validade", PREFIXO)} <0-365>\` — dias sem aviso novo até zerar (0 = nunca zeram)`, colour: COR.erro },
        { title: "❌ Usage", description: `\`${citarInterno("automod.punicao", PREFIXO)} expiry <0-365>\` — days without a new warning until they reset (0 = never)`, colour: COR.erro },
        { title: "❌ Uso", description: `\`${citar("automod.punicao.validade", "es", PREFIXO)} <0-365>\` — días sin aviso nuevo hasta reiniciarse (0 = nunca)`, colour: COR.erro }));
    pol.validadeDias = d; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Validade dos avisos", description: d ? `Os avisos zeram depois de **${d}** dia(s) sem um novo.` : "Os avisos **nunca** zeram sozinhos.", colour: COR.sucesso },
      { title: "✅ Warning expiry", description: d ? `Warnings reset after **${d}** day(s) without a new one.` : "Warnings **never** reset on their own.", colour: COR.sucesso },
      { title: "✅ Vigencia de los avisos", description: d ? `Los avisos se reinician tras **${d}** día(s) sin uno nuevo.` : "Los avisos **nunca** se reinician solos.", colour: COR.sucesso }));
  }

  if (sub === "silencerole" || sub === "cargo") {
    // Aposentado: o silêncio é o timeout nativo do Stoat, sem cargo.
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔇 Não há mais cargo de silêncio",
        description: "O silêncio da punição agora é o **timeout nativo do Stoat** — não precisa de cargo. Basta o cargo do bot ter **TimeoutMembers**.", colour: COR.info },
      { title: "🔇 There's no silence role anymore",
        description: "Punishment silences now use the **Stoat's native timeout** — no role needed. The bot's role just needs **TimeoutMembers**.", colour: COR.info },
      { title: "🔇 Ya no hay rol de silencio",
        description: "El silencio de los castigos ahora es el **timeout nativo de Stoat** — no hace falta un rol. Basta con que el rol del bot tenga **TimeoutMembers**.", colour: COR.info }));
  }

  // [onde mora, repetir a palavra digitada?] — `&automod punicao test` vira
  // `&automod sentinela test`; `&automod punicao warnings` vira `&warn lista`.
  const NOUTRO_COMANDO = {
    test: ["automod sentinela", true], testar: ["automod sentinela", true],
    simulate: ["automod sentinela", true], simular: ["automod sentinela", true],
    sensitivity: ["automod sentinela", true], sensibilidade: ["automod sentinela", true],
    limiar: ["automod sentinela", true], channel: ["automod sentinela", true],
    canal: ["automod sentinela", true], alerta: ["automod sentinela", true],
    antiguidade: ["automod sentinela", true],
    warn: ["warn", false], avisar: ["warn", false],
    warnings: ["warn lista", false], avisos: ["warn lista", false],
    clearwarnings: ["warn limpar", false],
  };
  const [destino, repete] = NOUTRO_COMANDO[sub] ?? [];
  if (destino) {
    const restante = args.slice(1).join(" ");
    const cmd = `${PREFIXO}${destino} ${repete ? `${sub} ` : ""}${restante}`.replace(/\s+/g, " ").trim();
    const refEs = destino.replace(/ /g, ".");   // "automod sentinela" → automod.sentinela (o nome em espanhol vem do citar)
    const cmdEs = `${citar(refEs, "es", PREFIXO)} ${repete ? `${sub} ` : ""}${restante}`.replace(/\s+/g, " ").trim();
    return sendEmbed(message.channel, tr(ctx, {
      title: `↪️ Isso é do \`${PREFIXO}${destino}\``,
      description: [
        `\`${citarInterno("automod.punicao", PREFIXO)}\` decide **o que acontece** com quem infringe — ele não analisa textos nem pune ninguém sozinho.`,
        "",
        `Você quis dizer:`,
        `\`${cmd}\``,
      ].join("\n"), colour: COR.aviso,
    }, {
      title: `↪️ That belongs to \`${PREFIXO}${destino}\``,
      description: [
        `\`${citarInterno("automod.punicao", PREFIXO)}\` decides **what happens** to whoever breaks a rule — it doesn't analyse text or punish anyone on its own.`,
        "",
        `You probably meant:`,
        `\`${cmd}\``,
      ].join("\n"), colour: COR.aviso,
    }, {
      title: `↪️ Eso es de \`${citar(refEs, "es", PREFIXO)}\``,
      description: [
        `\`${citar("automod.punicao", "es", PREFIXO)}\` decide **qué pasa** con quien infringe una regla — no analiza textos ni castiga a nadie por su cuenta.`,
        "",
        `Quizás quisiste decir:`,
        `\`${cmdEs}\``,
      ].join("\n"), colour: COR.aviso,
    }));
  }

  return sendEmbed(message.channel, tr(ctx, {
    title: "❌ Subcomando desconhecido",
    description: [
      `\`${sub}\` não é um subcomando do \`${citarInterno("automod.punicao", PREFIXO)}\`.`,
      "",
      `\`modo\` · \`escada\` · \`warns\` · \`status\``,
      "",
      `_\`${citarInterno("automod.punicao", PREFIXO)} status\` mostra o que cada um faz._`,
    ].join("\n"), colour: COR.erro,
  }, {
    title: "❌ Unknown subcommand",
    description: [
      `\`${sub}\` isn't a \`${citarInterno("automod.punicao", PREFIXO)}\` subcommand.`,
      "",
      `\`modo\` · \`escada\` · \`warns\` · \`status\``,
      "",
      `_\`${citarInterno("automod.punicao", PREFIXO)} status\` shows what each one does._`,
    ].join("\n"), colour: COR.erro,
  }, {
    title: "❌ Subcomando desconocido",
    description: [
      `\`${sub}\` no es un subcomando de \`${citar("automod.punicao", "es", PREFIXO)}\`.`,
      "",
      `\`mode\` · \`ladder\` · \`warns\` · \`status\``,
      "",
      `_\`${citar("automod.punicao", "es", PREFIXO)} status\` muestra lo que hace cada uno._`,
    ].join("\n"), colour: COR.erro,
  }));
}

