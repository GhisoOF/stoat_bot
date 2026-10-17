import { TERMOS_ODIO } from "./rajada.js";
import { citar } from "../core/aliases.js";
import { descreverFiltro } from "./config-comando.js";
import { rebuildBlocklist, DOMINIO_VALIDO, simularDeteccao, removerCargoSilence, MODULOS_AUTOMOD, GRUPOS_AUTOMOD, ROTULO_PARTE, estadoDoGrupo } from "./automod-engine.js";
import { tirarTimeout } from "./timeout.js";
import * as engine from "./automod-engine.js";
import * as db  from "../core/db.js";
import * as log from "../core/log.js";
import { analisarConteudo } from "./scorecard.js";
import { tr, lingua } from "../core/i18n.js";
import { hostDe } from "../core/config-store.js";
import { resolverUsuario, resolverCanal } from "../core/ids.js";
import { banir } from "../core/banir.js";
import { descreverErro as descreverErroBan } from "../core/erros.js";
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
      { title: "❌ Couldn't find that person", description: `I couldn't find \`${alvo.texto.slice(0, 60)}\` in the server.\n\`${citar("warn.lista", "en", PREFIXO)} <@user|id|name>\``, colour: COR.erro }));
  }
  const targetId = alvo.id ?? message.authorId;
  const pol = config.automod.punicao ?? {};
  const count  = db.contarAvisos(serverId, targetId, { validadeMs: engine.validadeDosAvisos(pol) });
  const degraus = engine.escadaDePunicao(pol);
  const limite = degraus.length;
  const silenciado = db.estaSilenciado(serverId, targetId);
  const motivo = db.lerPunicao(serverId, targetId)?.motivo;
  const linhas = [lang === "en"
    ? `<@${targetId}> has **${count}/${limite}** warning(s).`
    : `<@${targetId}> tem **${count}/${limite}** aviso(s).`];
  if (count && motivo) linhas.push(lang === "en" ? `**Last reason:** ${motivo}` : `**Último motivo:** ${motivo}`);
  if (pol.modo === "acumular" && degraus[count]) linhas.push(lang === "en"
    ? `_Next one: ${engine.rotuloDegrau(degraus[count], "en")}._` : `_O próximo: ${engine.rotuloDegrau(degraus[count], "pt")}._`);
  const dias = Math.round(engine.validadeDosAvisos(pol) / 86_400_000);
  if (count && dias) linhas.push(lang === "en" ? `_They reset after ${dias} days without a new one._` : `_Zeram depois de ${dias} dias sem um novo._`);
  if (silenciado) linhas.push(lang === "en"
    ? "🔇 They are **silenced** (the role is re-applied if they leave and come back)."
    : "🔇 Está **silenciado** (o cargo é reaplicado se sair e voltar).");
  await sendEmbed(message.channel, {
    title: lang === "en" ? "📋 Warnings" : "📋 Avisos",
    description: linhas.join("\n"),
    colour: COR.info,
  });
}

// &warn limpar <@usuário|id|nome>   (ManagePermissions; chega aqui por warn.js)
export async function cmdClearwarnings(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const alvo = await alvoDosAvisos(message, args, ctx, server);
  if (!alvo.id)
    return sendEmbed(message.channel, tr(ctx,
      { title: alvo.vazio ? "❌ De quem?" : "❌ Não achei essa pessoa",
        description: `${alvo.vazio ? "" : `Não encontrei \`${alvo.texto.slice(0, 60)}\` no servidor.\n`}\`${citar("warn.limpar", "pt", PREFIXO)} <@pessoa|id|nome>\``, colour: COR.erro },
      { title: alvo.vazio ? "❌ Whose?" : "❌ Couldn't find that person",
        description: `${alvo.vazio ? "" : `I couldn't find \`${alvo.texto.slice(0, 60)}\` in the server.\n`}\`${citar("warn.limpar", "en", PREFIXO)} <@user|id|name>\``, colour: COR.erro }));
  const targetId = alvo.id;

  const tinha = db.zerarAvisos(ctx.serverId, targetId);
  liberarQuarentena(ctx.serverId, targetId);
  const silenciado = db.estaSilenciado(ctx.serverId, targetId);
  const extraPt = silenciado ? `\n🔇 O silêncio em curso continua — para tirar: \`${citar("silenciar.tirar", "pt", PREFIXO)} <@${targetId}>\`` : "";
  const extraEn = silenciado ? `\n🔇 The current silence stays — to lift it: \`${citar("silenciar.tirar", "en", PREFIXO)} <@${targetId}>\`` : "";
  await sendEmbed(message.channel, tr(ctx,
    { title: "✅ Avisos limpos", description: (tinha
        ? (tinha === 1 ? `O aviso de <@${targetId}> foi zerado.` : `Os **${tinha}** avisos de <@${targetId}> foram zerados.`) : `<@${targetId}> não tinha avisos — nada a zerar.`) + extraPt, colour: COR.sucesso },
    { title: "✅ Warnings cleared", description: (tinha
        ? (tinha === 1 ? `<@${targetId}>'s warning was reset.` : `<@${targetId}>'s **${tinha}** warnings were reset.`) : `<@${targetId}> had no warnings — nothing to reset.`) + extraEn, colour: COR.sucesso }));
  if (tinha) await log.registrar(ctx, "punicoes", { titulo: "🧹 Avisos limpos",
    descricao: `<@${targetId}> teve os avisos (${tinha}) zerados por <@${message.authorId}>.`,
    en: { titulo: "🧹 Warnings cleared", descricao: `<@${targetId}>'s warnings (${tinha}) were cleared by <@${message.authorId}>.` } });
}

// Os parâmetros em inglês, para a tela (o que se digita em inglês o aliases.js traduz)
const PARAM_EN = { mensagens: "messages", tempo: "time", mencoes: "mentions", tamanho: "size", limiar: "threshold", repeticao: "repetition",
  ignorar: "ignore", minuto: "minute", novato: "newcomer", vezes: "times" };
const nomeParam = (p, lang) => (lang === "en" ? PARAM_EN[p] ?? p : p);

// %automod status | %automod <módulo> <on|off> | %automod debug <on|off>   (ManagePermissions)
const G_AUTOMOD = GRUPOS_AUTOMOD;

// A cola dos quatro grupos, com exemplos que dá para copiar como estão.
function guiaDosGrupos(lang, P, abertura) {
  const en = lang === "en";
  return [
    abertura, "",
    ...Object.entries(G_AUTOMOD).map(([nome, d]) => `${d.emoji} \`${nomeGrupo(nome, lang)}\` — ${en ? d.en : d.pt}`),
    "",
    en ? "**Copy as is:**" : "**Copie assim mesmo:**",
    `\`${P}automod antispam off\` — ${en ? "turns one group off" : "desliga um grupo"}`,
    `\`${P}automod ${nomeGrupo("antiruido", lang)} caps off\` — ${en ? "turns off just one part" : "desliga só uma parte"}`,
    `\`${P}automod off\` · \`${P}automod on\` — ${en ? "everything at once" : "tudo de uma vez"}`,
    `\`${P}automod\` — ${en ? "what's on and off right now" : "o que está ligado agora"}`,
  ].join("\n");
}

// Distância de edição curta (o "você quis dizer"): até 2 letras de diferença.
function maisParecido(digitado, nomes) {
  const a = String(digitado ?? "").toLowerCase();
  if (!a) return null;
  const d = (x, y) => {
    const m = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
    for (let j = 1; j <= y.length; j++) m[0][j] = j;
    for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    return m[x.length][y.length];
  };
  let melhor = null, menor = 3;
  for (const n of nomes) { const k = d(a, n); if (k < menor && k <= Math.max(1, Math.floor(n.length / 3))) { menor = k; melhor = n; } }
  return melhor;
}

// Modos de punição: os nomes em inglês que a ajuda em inglês mostra também valem.
const MODO_EN = { warn: "avisar", delete: "apagar", confirm: "confirmar", stack: "acumular", ban: "banir", inherit: "herdar" };

export async function cmdAutomod(message, args, ctx) {
  const { config, cfgGlobal, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, salvarGlobal, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  let sub = args[0]?.toLowerCase();

  // ── A família do automod mora aqui dentro ──────────────────────────────
  // As partes do automod moram aqui dentro: `&automod blocklist ...`. Os nomes
  // soltos (`&blocklist`, `&punicao`) não são comandos — respondem "comando
  // desconhecido" (conferido em 17 out 2026).
  const FILHOS = {
    blocklist: cmdBlocklist, bloqueio: cmdBlocklist,
    whitelist: cmdWhitelist, permitidos: cmdWhitelist,
    punicao: cmdPunicao, "punição": cmdPunicao, castigo: cmdPunicao,
  };
  if (FILHOS[sub]) return FILHOS[sub](message, args.slice(1), ctx);
  if (sub === "antiscam") sub = "sentinela";

  // ── Quem copia a ajuda ao pé da letra (12 out 2026) ──────────────────
  // `&automod <group> off` chegava assim mesmo, com os sinais, e a resposta
  // era uma lista de nomes antigos que ninguém reconhecia.
  const ehMarcador = (x) => /^[<‹\[].+[>›\]]$/.test(String(x ?? ""));
  if (ehMarcador(sub) || (G_AUTOMOD[sub] && ehMarcador(args[1]))) {
    return sendEmbed(message.channel, { title: lang === "en" ? "✏️ Replace the ‹…› with a value" : "✏️ Troque o ‹…› por um valor", colour: COR.aviso,
      description: guiaDosGrupos(lang, PREFIXO, ehMarcador(sub)
        ? (lang === "en" ? `\`${sub}\` in the help is a **blank to fill in**, not something to type. Use one of the groups below:` : `\`${sub}\` na ajuda é um **espaço para preencher**, não para digitar. Use um dos grupos abaixo:`)
        : (lang === "en" ? `\`${args[1]}\` is a **blank to fill in** — the parts of \`${sub}\` are: ${Object.keys(G_AUTOMOD[sub].partes).map((x) => `\`${x}\``).join(", ")}.` : `\`${args[1]}\` é um **espaço para preencher** — as partes de \`${sub}\` são: ${Object.keys(G_AUTOMOD[sub].partes).map((x) => `\`${x}\``).join(", ")}.`)) });
  }

  // ── `&automod off` / `&automod on` — tudo de uma vez ─────────────────
  const TUDO = { on: true, ligar: true, ativar: true, enable: true, off: false, desligar: false, desativar: false, disable: false };
  if (sub in TUDO && !args[1]) {
    const on = TUDO[sub];
    for (const chave of Object.values(MODULOS_AUTOMOD)) config.automod[chave] = { ...(config.automod[chave] ?? {}), enabled: on };
    salvarConfig();
    return sendEmbed(message.channel, { title: "🛡 AutoMod", colour: on ? COR.sucesso : COR.mod, description: lang === "en"
      ? (on ? `**Everything on** 🟢 — the 4 groups: \`antispam\`, \`antiruido\`, \`antilink\`, \`sentinela\`.\n\nTo turn one off: \`${PREFIXO}automod antiruido off\` · see each one: \`${PREFIXO}automod\``
            : `**Everything off** 🔴 — nothing is filtered or punished automatically now.\n\nTo turn just one on: \`${PREFIXO}automod antispam on\` · all back: \`${PREFIXO}automod on\``)
      : (on ? `**Tudo ligado** 🟢 — os 4 grupos: \`antispam\`, \`antiruido\`, \`antilink\`, \`sentinela\`.\n\nPara desligar um: \`${PREFIXO}automod antiruido off\` · ver cada um: \`${PREFIXO}automod\``
            : `**Tudo desligado** 🔴 — nada é filtrado nem punido automaticamente agora.\n\nPara ligar só um: \`${PREFIXO}automod antispam on\` · tudo de volta: \`${PREFIXO}automod on\``) });
  }

  // ── Os quatro grupos (2 out 2026) ──────────────────────────────────────
  // antispam · antiruido · antilink · sentinela. `on|off` e `punicao` valem
  // para o grupo inteiro; `&automod <grupo> <parte> …` ajusta uma parte (que
  // por baixo é um dos filtros de antes — os nomes antigos continuam valendo).
  const G = GRUPOS_AUTOMOD;
  // o que é do FILTRO (liga/desliga/punição), não do painel do sentinela —
  // antes `&automod sentinela conteudo punicao banir` caía no painel e dava
  // "subcomando desconhecido" (15 out 2026)
  const PARA_O_FILTRO = ["on", "off", "punicao", "punição", "punishment"];
  if (G[sub]) {
    const grupo = sub, def = G[grupo];
    // `desligar`/`disable`/`ativar`… valem como off/on no grupo e na parte
    // (15 out 2026: `&automod sentinel disable` desligava só o conteúdo, dizendo
    // que tinha desligado o sentinela; `&automod antispam disable` dava erro)
    if (args[1] && args[1].toLowerCase() in TUDO) args[1] = TUDO[args[1].toLowerCase()] ? "on" : "off";
    if (args[2] && def.partes[args[1]?.toLowerCase()] && args[2].toLowerCase() in TUDO) args[2] = TUDO[args[2].toLowerCase()] ? "on" : "off";
    const a1 = args[1]?.toLowerCase();
    const T = (pt, en) => (lang === "en" ? en : pt);
    const PARAM_PARTE = {
      antispam: { mensagens: "velocidade", tempo: "velocidade", mencoes: "mencoes", minuto: "midia", novato: "midia", vezes: "repeticao" },
      antiruido: { tamanho: "caps", limiar: "caps", zalgo: "caracteres", repeticao: "letras", ignorar: "letras", emojis: "emoji" },
    }[grupo] ?? {};
    if (a1 && def.partes[a1]) {
      // uma parte: vira o comando do filtro de antes
      args = [def.partes[a1], ...args.slice(2)];
      sub = args[0];
      if (grupo === "sentinela" && a1 === "conteudo" && args[1] && !PARA_O_FILTRO.includes(args[1].toLowerCase())) {
        return cmdScam(message, args.slice(1), ctx);
      }
      return executarFiltro(sub, args);
    }
    if (!a1) {
      const st = estadoDoGrupo(config.automod, grupo);
      const pm = (f) => config.automod[MODULOS_AUTOMOD[f]]?.punicao?.modo;
      return sendEmbed(message.channel, { title: `${def.emoji} ${nomeGrupo(grupo, lang)} — ${T(def.pt, def.en)}`, colour: COR.mod, description: [
        `**${st.ligadas}/${st.total}** ${T("partes ligadas", "parts on")}`,
        "",
        ...st.partes.map((x) => `${x.ligada ? "🟢" : "🔴"} \`${nomeParte(x.parte, lang)}\` — ${ROTULO_PARTE[x.parte]?.[lang === "en" ? 1 : 0] ?? x.parte}`
          + `${descreverFiltro(config.automod, x.chave, lang, ctx.estado) ? ` _(${descreverFiltro(config.automod, x.chave, lang, ctx.estado)})_` : ""}`
          + `${pm(x.filtro) ? ` · ${T("punição", "punishment")} \`${nomeModo(pm(x.filtro), lang)}\`` : ""}`),
        "",
        `\`${PREFIXO}automod ${grupo} on|off\` — ${T("o grupo inteiro", "the whole group")}`,
        `\`${PREFIXO}automod ${grupo} <${T("parte", "part")}> on|off\` — ${T("só uma parte", "one part only")}`,
        Object.keys(PARAM_PARTE).length ? `\`${PREFIXO}automod ${grupo} set <${Object.keys(PARAM_PARTE).join("|")}> <${T("valor", "value")}>\`` : null,
        `\`${PREFIXO}automod ${grupo} punicao <avisar|apagar|confirmar|acumular|banir|herdar>\``,
        grupo === "sentinela" ? T(`_Painel do sentinela: \`${PREFIXO}automod sentinela config\` · \`sensitivity\` · \`test <texto>\` · \`odio add <termo>\`_`, `_Sentinel panel: \`${PREFIXO}automod sentinela config\` · \`sensitivity\` · \`test <text>\` · \`odio add <term>\`_`) : null,
      ].filter((x) => x !== null).join("\n") });
    }
    if (a1 === "on" || a1 === "off") {
      for (const f of Object.values(def.partes)) {
        const ck = MODULOS_AUTOMOD[f];
        config.automod[ck] = { ...(config.automod[ck] ?? {}), enabled: a1 === "on" };
      }
      salvarConfig();
      return sendEmbed(message.channel, { title: "🛡 AutoMod", colour: COR.mod, description: T(
        `**${grupo}** ${a1 === "on" ? "ligado 🟢" : "desligado 🔴"} — ${Object.keys(def.partes).length} parte(s): ${Object.keys(def.partes).map((x) => `\`${x}\``).join(", ")}.`,
        `**${nomeGrupo(grupo, "en")}** ${a1 === "on" ? "enabled 🟢" : "disabled 🔴"} — ${Object.keys(def.partes).length} part(s): ${Object.keys(def.partes).map((x) => `\`${nomeParte(x, "en")}\``).join(", ")}.`) });
    }
    if (a1 === "punicao" || a1 === "punição" || a1 === "punishment") {
      const modo = MODO_EN[args[2]?.toLowerCase()] ?? args[2]?.toLowerCase();
      const MODOS = ["avisar", "apagar", "confirmar", "acumular", "banir"];
      const herdar = ["herdar", "global", "null"].includes(modo);
      if (!herdar && !MODOS.includes(modo)) {
        return sendEmbed(message.channel, { title: T("❌ Modo inválido", "❌ Invalid mode"), colour: COR.erro,
          description: `\`${PREFIXO}automod ${grupo} punicao <${MODOS.join("|")}|herdar>\`` });
      }
      for (const f of Object.values(def.partes)) {
        const mod = config.automod[MODULOS_AUTOMOD[f]] ??= {};
        mod.punicao = herdar ? null : { ...(mod.punicao ?? {}), modo, ...(modo === "acumular" && !mod.punicao?.warnsParaBan ? { warnsParaBan: 3 } : {}) };
      }
      salvarConfig();
      return sendEmbed(message.channel, { title: "🛡 AutoMod", colour: COR.sucesso, description: herdar
        ? T(`**${grupo}** agora herda a punição global.`, `**${grupo}** now inherits the global punishment.`)
        : T(`**${grupo}** agora usa a punição **\`${modo}\`** (todas as partes).`, `**${nomeGrupo(grupo, "en")}** now uses the **\`${nomeModo(modo, "en")}\`** punishment (all parts).`) });
    }
    if (a1 === "set" && PARAM_PARTE[args[2]?.toLowerCase()]) {
      const parte = PARAM_PARTE[args[2].toLowerCase()];
      args = [def.partes[parte], "set", ...args.slice(2)];
      sub = args[0];
      return executarFiltro(sub, args);
    }
    if (grupo === "sentinela") return cmdScam(message, args.slice(1), ctx);   // o painel: config, sensitivity, test…
    const parecidaInterna = maisParecido(a1, [...Object.keys(def.partes), ...Object.keys(def.partes).map((x) => nomeParte(x, "en")), "on", "off", "punicao", "punishment", "set"]);
    const parecida = parecidaInterna && lang === "en" ? nomeParte(parecidaInterna, "en") : parecidaInterna;
    return sendEmbed(message.channel, { title: T("❌ Parte desconhecida", "❌ Unknown part"), colour: COR.erro,
      description: [
        parecida ? T(`Você quis dizer \`${PREFIXO}automod ${grupo} ${parecida}\`?`, `Did you mean \`${PREFIXO}automod ${grupo} ${parecida}\`?`) + "\n" : null,
        `${T("Partes", "Parts")} ${T("de", "of")} \`${nomeGrupo(grupo, lang)}\`: ${Object.keys(def.partes).map((x) => `\`${nomeParte(x, lang)}\``).join(", ")}`,
        "",
        `\`${PREFIXO}automod ${grupo} on|off\` — ${T("o grupo inteiro", "the whole group")}`,
        `${T("Ex.:", "E.g.:")} \`${PREFIXO}automod ${grupo} ${Object.keys(def.partes)[0]} off\` — ${T("só essa parte", "just that part")}`,
      ].filter((x) => x !== null).join("\n") });
  }
  return executarFiltro(sub, args);

  // ── Um filtro só (o nome antigo, ou a parte de um grupo) ──
  async function executarFiltro(sub, args) {

  // `sentinela` é os dois: um módulo que liga/desliga (como anticaps) E um
  // painel com ajustes próprios. `on|off` fica na lista de módulos abaixo;
  // qualquer outra coisa é assunto do painel.
  if ((sub === "sentinela" || sub === "antiscam")
      && args[1] && !PARA_O_FILTRO.includes(args[1].toLowerCase())) {
    return cmdScam(message, args.slice(1), ctx);
  }

  // %automod debug <on|off> — liga/desliga os logs (GLOBAL, todos os servidores)
  if (sub === "debug") {
    // vale para todos os servidores (e enche o log da máquina): só o dono do bot
    if (!ctx.ehSuperAdmin?.(message.authorId))
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔒 Só o dono do bot", description: "Os logs de depuração são **globais** — valem para todos os servidores da Judy.", colour: COR.aviso },
        { title: "🔒 Bot owner only", description: "Debug logs are **global** — they apply to every server Judy is in.", colour: COR.aviso }));
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off")
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${PREFIXO}automod debug <on|off>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${PREFIXO}automod debug <on|off>\``, colour: COR.erro }));
    cfgGlobal.debug = (v === "on");
    salvarGlobal();
    return sendEmbed(message.channel, { title: "🐛 Debug",
      description: lang === "en"
        ? `Debug logs **${cfgGlobal.debug ? "enabled 🟢" : "disabled 🔴"}** (global).`
        : `Logs de depuração **${cfgGlobal.debug ? "ativados 🟢" : "desativados 🔴"}** (global).`,
      colour: COR.mod });
  }

  const modulos = MODULOS_AUTOMOD;


  if (!sub || sub === "status") {
    const linhas = Object.entries(GRUPOS_AUTOMOD).flatMap(([nome, def]) => {
      const st = estadoDoGrupo(config.automod, nome);
      const icone = st.ligadas === st.total ? "🟢" : st.ligadas ? "🟡" : "🔴";
      return [`${icone} **${nomeGrupo(nome, lang)}** — ${lang === "en" ? def.en : def.pt} · ${st.ligadas}/${st.total}`,
        `   ${st.partes.map((x) => `${x.ligada ? "✓" : "✗"} ${nomeParte(x.parte, lang)}`).join(" · ")}`];
    });
    linhas.push("", lang === "en"
      ? `_Details of one group: \`${PREFIXO}automod antispam\` · turn one off: \`${PREFIXO}automod antispam off\` · everything: \`${PREFIXO}automod off\`_`
      : `_Detalhes de um grupo: \`${PREFIXO}automod antispam\` · desligar um: \`${PREFIXO}automod antispam off\` · tudo: \`${PREFIXO}automod off\`_`);
    linhas.push(lang === "en"
      ? `${cfgGlobal.debug !== false ? "🟢" : "🔴"} **debug (global)** — ${cfgGlobal.debug !== false ? "enabled" : "disabled"}`
      : `${cfgGlobal.debug !== false ? "🟢" : "🔴"} **debug (global)** — ${cfgGlobal.debug !== false ? "ativado" : "desativado"}`);
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🛡 AutoMod status" : "🛡 Status do AutoMod",
      description: linhas.join("\n"), colour: COR.mod });
  }

  const chave = modulos[sub];
  if (!chave) {
    // Os nomes antigos (antiodio, anticaps…) continuam valendo, mas não se
    // ensinam mais: quem erra vê os QUATRO grupos, com exemplo pronto.
    const parecidoInterno = maisParecido(sub, [...Object.keys(G_AUTOMOD), ...Object.keys(G_AUTOMOD).map((g) => nomeGrupo(g, "en")), ...Object.keys(modulos), "on", "off", "blocklist", "whitelist", "punicao", "punishment"]);
    const parecido = parecidoInterno && lang === "en" ? nomeGrupo(parecidoInterno, "en") : parecidoInterno;
    return sendEmbed(message.channel, { title: lang === "en" ? "❌ I don't know that one" : "❌ Não conheço esse", colour: COR.erro,
      description: guiaDosGrupos(lang, PREFIXO, parecido
        ? (lang === "en" ? `Did you mean \`${PREFIXO}automod ${parecido}\`?` : `Você quis dizer \`${PREFIXO}automod ${parecido}\`?`)
        : (lang === "en" ? `\`${String(sub).slice(0, 30)}\` isn't a group. The automod has four:` : `\`${String(sub).slice(0, 30)}\` não é um grupo. O automod tem quatro:`)) });
  }

  const mod = config.automod[chave] ??= {};
  const acao = args[1]?.toLowerCase();

  // Os dois painéis novos do sentinela (13 out 2026). `punicao` segue o
  // caminho comum lá embaixo (vale para o `punir` dos temas).
  if (sub === "antiassuntos" && !["punicao", "punição"].includes(acao)) return painelAssuntos(mod, args.slice(1));
  if (sub === "antiavatar" && !["punicao", "punição"].includes(acao)) return painelAvatar(mod, args.slice(1));

  // Parâmetros configuráveis por módulo (nome do arg → chave interna + validação)
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
  const MODOS_PUN = ["avisar", "apagar", "confirmar", "acumular", "banir"];

  // ── &automod <módulo>  → detalhes do módulo ──
  if (!acao) {
    const params = PARAMS[sub];
    const linhas = [lang === "en"
      ? `${mod.enabled ? "🟢 enabled" : "🔴 disabled"}`
      : `${mod.enabled ? "🟢 ativado" : "🔴 desativado"}`];
    if (params) {
      linhas.push("", lang === "en" ? "**Parameters:**" : "**Parâmetros:**");
      for (const [nome, ck] of Object.entries(params)) linhas.push(`• \`${nomeParam(nome, lang)}\` = ${mod[ck]}`);
    }
    const pm = mod.punicao?.modo;
    linhas.push("", lang === "en"
      ? `**Punishment:** ${pm ? `\`${pm}\` (its own)` : "_inherits the global one_ (`" + (config.automod.punicao?.modo ?? "avisar") + "`)"}`
      : `**Punição:** ${pm ? `\`${pm}\` (própria)` : "_herda a global_ (`" + (config.automod.punicao?.modo ?? "avisar") + "`)"}`);
    linhas.push("", lang === "en" ? "**How to configure:**" : "**Como configurar:**",
      `\`${PREFIXO}automod ${sub} <on|off>\``,
      params ? `\`${PREFIXO}automod ${sub} set <${lang === "en" ? "parameter" : "parâmetro"}> <${lang === "en" ? "value" : "valor"}>\`` : null,
      `\`${PREFIXO}automod ${sub} punicao <${MODOS_PUN.join("|")}|herdar>\``,
      // O sentinela tem um painel próprio além do liga/desliga.
      sub === "sentinela" ? (lang === "en"
        ? `\n**Sentinel panel:** \`${PREFIXO}automod sentinela config\` · \`sensitivity\` · \`antiguidade\` · \`alerta\` · \`test <text>\` — details in \`${PREFIXO}help automod sentinela\``
        : `\n**Painel do sentinela:** \`${PREFIXO}automod sentinela config\` · \`sensitivity\` · \`antiguidade\` · \`alerta\` · \`test <texto>\` — detalhes em \`${PREFIXO}help automod sentinela\``) : null,
    );
    const subEn = nomeGrupo(sub, "en") !== sub ? nomeGrupo(sub, "en") : nomeParte(sub, "en");
    return sendEmbed(message.channel, { title: `🛡 ${lang === "en" ? subEn : sub}`,
      description: linhas.filter((l) => l !== null).join("\n"), colour: COR.mod });
  }

  // ── &automod antiodio add|remover|lista <termo> — termos além dos de fábrica ──
  if (sub === "antiodio" && ["add", "adicionar", "remover", "remove", "tirar", "lista", "list"].includes(acao)) {
    mod.termos ??= [];
    const termo = args.slice(2).join(" ").trim().toLowerCase().slice(0, 60);
    if (["add", "adicionar"].includes(acao) && termo && !mod.termos.includes(termo)) mod.termos.push(termo);
    if (["remover", "remove", "tirar"].includes(acao)) mod.termos = mod.termos.filter((x) => x !== termo);
    if (!["lista", "list"].includes(acao)) salvarConfig();
    return sendEmbed(message.channel, { title: "🛡 antiodio", colour: COR.mod, description: [
      lang === "en" ? `**Built-in terms:** ${TERMOS_ODIO.length} (unambiguous slurs, PT and EN)` : `**Termos de fábrica:** ${TERMOS_ODIO.length} (ofensas inequívocas, PT e EN)`,
      `**${lang === "en" ? "Added here" : "Acrescentados aqui"}:** ${mod.termos.length ? mod.termos.map((x) => `\`${x}\``).join(", ") : "—"}`,
      "",
      lang === "en" ? "_Spelling tricks are caught too: n.i.g.g.a, N1GG4, niiiigga._" : "_Os disfarces também são pegos: n.i.g.g.a, N1GG4, niiiigga._",
    ].join("\n") });
  }

  // ── set <parâmetro> <valor> ──
  if (acao === "set") {
    const params = PARAMS[sub];
    if (!params)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Sem parâmetros", description: `O módulo \`${sub}\` não tem parâmetros ajustáveis.`, colour: COR.erro },
        { title: "❌ No parameters", description: `The \`${sub}\` module has no adjustable parameters.`, colour: COR.erro }));
    const nome = args[2]?.toLowerCase();
    const bruto = args[3];
    const ck = params[nome];
    if (!ck || bruto === undefined)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${PREFIXO}automod ${sub} set <${Object.keys(params).join("|")}> <valor>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${PREFIXO}automod ${sub} set <${Object.keys(params).join("|")}> <value>\``, colour: COR.erro }));
    // 'ignorar' é texto (letras a ignorar, ex.: "k"); os demais são numéricos.
    if (ck === "ignorar") {
      mod[ck] = String(bruto).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
      salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🛡 Parâmetro atualizado",
          description: `\`${sub}.${nome}\` = **"${mod[ck]}"** (letras ignoradas na repetição)`, colour: COR.sucesso },
        { title: "🛡 Parameter updated",
          description: `\`${sub}.${nomeParam(nome, "en")}\` = **"${mod[ck]}"** (letters ignored in repetition)`, colour: COR.sucesso }));
    }
    let valor = Number(bruto);
    if (Number.isNaN(valor) || valor < 0)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Valor inválido", description: "O valor precisa ser um número positivo.", colour: COR.erro },
        { title: "❌ Invalid value", description: "The value must be a positive number.", colour: COR.erro }));
    // limiar/zalgo aceitam 0–1 (fração) ou 0–100 (porcentagem)
    if ((ck === "threshold" || ck === "limiteZalgo") && valor > 1) valor = valor / 100;
    mod[ck] = valor;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛡 Parâmetro atualizado", description: `\`${sub}.${nome}\` = **${valor}**`, colour: COR.sucesso },
      { title: "🛡 Parameter updated", description: `\`${sub}.${nomeParam(nome, "en")}\` = **${valor}**`, colour: COR.sucesso }));
  }

  // ── punicao <modo|herdar> ──
  if (acao === "punicao" || acao === "punição") {
    const modo = args[2]?.toLowerCase();
    if (modo === "herdar" || modo === "global" || modo === "null") {
      mod.punicao = null; salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🛡 Punição do módulo",
          description: `\`${sub}\` agora **herda a punição global** do servidor.`, colour: COR.sucesso },
        { title: "🛡 Module punishment",
          description: `\`${sub}\` now **inherits the server's global punishment**.`, colour: COR.sucesso }));
    }
    if (!MODOS_PUN.includes(modo))
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Modo inválido",
        description: `Modos: ${MODOS_PUN.map((m) => `\`${m}\``).join(", ")}, ou \`herdar\`.\n\n`
          + "• `avisar` — só avisa, não pune (filtro de regra fixa ainda apaga; o sentinela não)\n• `apagar` — só remove a mensagem\n• `confirmar` — silencia e espera mod\n• `acumular` — soma avisos até banir\n• `banir` — ban imediato",
        colour: COR.erro,
      }, {
        title: "❌ Invalid mode",
        description: `Modes: ${MODOS_PUN.map((m) => `\`${nomeModo(m, "en")}\``).join(", ")}, or \`inherit\`.\n\n`
          + "• `warn` — warn only, no punishment (fixed-rule filters still delete; the sentinel doesn't)\n• `delete` — remove the message only\n• `confirm` — silence and wait for a mod\n• `stack` — stack warnings until a ban\n• `ban` — instant ban",
        colour: COR.erro,
      }));
    mod.punicao = { ...(mod.punicao ?? {}), modo };
    if (modo === "acumular" && !mod.punicao.warnsParaBan) mod.punicao.warnsParaBan = 3;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛡 Punição do módulo",
        description: `\`${sub}\` agora usa a punição **\`${modo}\`** (própria, independente da global).`,
        colour: COR.sucesso },
      { title: "🛡 Module punishment",
        description: `\`${sub}\` now uses the **\`${modo}\`** punishment (its own, independent of the global one).`,
        colour: COR.sucesso }));
  }

  // ── on | off ──
  const novoEstado = acao;
  if (novoEstado !== "on" && novoEstado !== "off")
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Uso incorreto",
      description: [
        `\`${PREFIXO}automod ${sub} <on|off>\``,
        PARAMS[sub] ? `\`${PREFIXO}automod ${sub} set <parâmetro> <valor>\`` : null,
        `\`${PREFIXO}automod ${sub} punicao <modo>\``,
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: [
        `\`${PREFIXO}automod ${sub} <on|off>\``,
        PARAMS[sub] ? `\`${PREFIXO}automod ${sub} set <parameter> <value>\`` : null,
        `\`${PREFIXO}automod ${sub} punicao <mode>\``,
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }));

  config.automod[chave].enabled = (novoEstado === "on");
  salvarConfig();
  return sendEmbed(message.channel, tr(ctx,
    { title: "🛡 AutoMod atualizado",
      description: `**${sub}** foi **${novoEstado === "on" ? "ativado 🟢" : "desativado 🔴"}**.`, colour: COR.mod },
    { title: "🛡 AutoMod updated",
      description: `**${sub}** was **${novoEstado === "on" ? "enabled 🟢" : "disabled 🔴"}**.`, colour: COR.mod }));
  }

  // ── &automod sentinela assuntos … (temas proibidos pela regra) ──────────
  async function painelAssuntos(mod, a) {
    const T = (pt, en) => (lang === "en" ? en : pt);
    const P = PREFIXO, base = `${P}automod sentinela assuntos`;
    mod.acoes ??= {}; mod.termos ??= {}; mod.canaisLiberados ??= [];
    const op = a[0]?.toLowerCase();
    const ROT_ACAO = { off: T("desligado", "off"), alertar: T("só alerta a staff", "alerts staff only"), apagar: T("apaga a mensagem", "deletes the message"), punir: T("apaga e pune (escada)", "deletes and punishes (ladder)") };
    const SENS_ROT = { baixa: T("baixa", "low"), media: T("média", "medium"), alta: T("alta", "high") };
    const sensAtual = assuntos.sensibilidadeValida(mod.sensibilidade) ?? "media";
    const painel = (titulo = null) => sendEmbed(message.channel, { title: titulo ?? `🛡️ ${T("Temas proibidos", "Forbidden topics")}`, colour: COR.mod, description: [
      T("Cada mensagem ganha uma **nota de 0 a 10** por tema: termos com peso, sinais de debate e de ataque, e o **contexto** do canal sobem; \"kkkk\", emoji de riso e \"zoeira\" amenizam. Passou do limiar, a IA confirma se é **discussão de verdade** ou zoeira.",
        "Each message gets a **0–10 score** per topic: weighted terms, debate and attack signals, and the channel's **context** raise it; \"lol\", laughing emoji and \"joking\" soften it. Above the threshold, the AI confirms whether it's a **real discussion** or banter."),
      "",
      `**${T("Chave geral", "Master switch")}:** ${mod.enabled ? T("🟢 ligada", "🟢 on") : T("🔴 desligada", "🔴 off")}`,
      `**${T("Sensibilidade", "Sensitivity")}:** ${SENS_ROT[sensAtual]} (${T("limiar", "threshold")} ${assuntos.limiarDoAssunto(mod)}/10) · **${T("IA", "AI")}:** ${mod.ia === false ? T("🔴 desligada — a nota decide sozinha", "🔴 off — the score decides alone") : T("🟢 confirma", "🟢 confirms")}`,
      ...assuntos.NOMES_TEMAS.map((t) => {
        const ac = assuntos.acaoDoTema(mod, t), d = assuntos.TEMAS[t];
        const extras = (mod.termos[t] ?? []).length;
        return `${d.emoji} \`${nomeTema(t, lang)}\` — **${nomeAcaoTema(ac, lang)}** · ${ROT_ACAO[ac]}${extras ? T(` · +${extras} termo(s) daqui`, ` · +${extras} term(s) of yours`) : ""}`;
      }),
      `**${T("Canais liberados", "Allowed channels")}:** ${mod.canaisLiberados.length ? mod.canaisLiberados.map((c) => `<#${c}>`).join(" ") : "—"}`,
      `**${T("Punição do `punir`", "Punishment of `punish`")}:** \`${nomeModo(mod.punicao?.modo ?? "acumular", lang)}\``,
      "",
      `\`${base} <${assuntos.NOMES_TEMAS.join("|")}> <off|alertar|apagar|punir>\``,   // a tela em inglês traduz (família automod.assuntos)
      `\`${base} <${T("tema", "topic")}> add|remover <${T("termo", "term")}>\` — ${T("palavras a mais (peso de nome: 2,5)", "extra words (name weight: 2.5)")}`,
      `\`${base} liberar|vigiar <#${T("canal", "channel")}|aqui>\` — ${T("um canal onde o tema pode (ex.: #debate)", "a channel where the topic is fine (e.g. #debate)")}`,
      `\`${base} sensibilidade <baixa|media|alta>\` · \`${base} ia on|off\``,
      `\`${base} test <${T("texto", "text")}>\` — ${T("a nota de cada tema, sem punir", "each topic's score, without punishing")}`,
      `\`${base} on|off\` · \`${base} punicao <${T("modo", "mode")}>\``,
      T("_Alertas vão para o canal do sentinela (ou o de log)._", "_Alerts go to the sentinel channel (or the log channel)._"),
    ].join("\n") });

    if (!op || op === "status" || op === "config") return painel();
    if (op === "on" || op === "off") {
      mod.enabled = op === "on"; salvarConfig();
      const nenhum = op === "on" && !assuntos.temasAtivos(mod).length;
      return painel(op === "on" ? (nenhum ? T("🟡 Ligado — falta escolher os temas", "🟡 On — now pick the topics") : T("🟢 Temas proibidos ligados", "🟢 Forbidden topics on")) : T("🔴 Temas proibidos desligados", "🔴 Forbidden topics off"));
    }
    if (["sensibilidade", "sensitivity", "sens"].includes(op)) {
      const nova = assuntos.sensibilidadeValida(a[1]);
      if (!nova) return sendEmbed(message.channel, { title: T("❌ Sensibilidade inválida", "❌ Invalid sensitivity"), colour: COR.erro,
        description: Object.entries(assuntos.LIMIAR_ASSUNTO).map(([k, v]) => `• \`${nomeSens(k, lang)}\` — ${T("age a partir de", "acts from")} ${v}/10`).join("\n") });
      mod.sensibilidade = nova; salvarConfig();
      return painel(`🛡️ ${T("Sensibilidade", "Sensitivity")} → ${SENS_ROT[nova]} (${assuntos.LIMIAR_ASSUNTO[nova]}/10)`);
    }
    if (op === "ia" || op === "ai") {
      const v = a[1]?.toLowerCase();
      if (v !== "on" && v !== "off") return sendEmbed(message.channel, { title: T("❌ Uso", "❌ Usage"), colour: COR.erro, description: `\`${base} ia on|off\`` });
      mod.ia = v === "on"; salvarConfig();
      return painel(mod.ia ? T("🟢 A IA confirma antes de agir", "🟢 The AI confirms before acting") : T("🔴 Sem IA: a nota decide sozinha", "🔴 No AI: the score decides alone"));
    }
    if (op === "test" || op === "testar" || op === "teste") {
      const texto = a.slice(1).join(" ").trim();
      if (!texto) return sendEmbed(message.channel, { title: T("❌ Uso", "❌ Usage"), colour: COR.erro, description: `\`${base} test <${T("texto", "text")}>\`` });
      const notas = assuntos.analisarAssuntos(texto, mod, { canalId: message.channelId, autor: message.authorId, todos: true });
      return sendEmbed(message.channel, { title: `🧪 ${T("Nota por tema", "Score per topic")}`, colour: COR.mod, description: [
        ...notas.map((n) => `${assuntos.TEMAS[n.tema].emoji} \`${nomeTema(n.tema, lang)}\` — **${n.nota}/10** ${n.passou ? "⚠️" : "·"} ${assuntos.acaoDoTema(mod, n.tema) === "off" ? T("_(tema desligado)_", "_(topic off)_") : ""}${n.sinais.length ? `\n   ${n.sinais.join(", ")}` : ""}`),
        "",
        T(`_Limiar ${assuntos.limiarDoAssunto(mod)}/10; o contexto é o deste canal. ${mod.ia === false ? "Sem IA, passar do limiar já age." : "Passando do limiar, a IA ainda confirma."} Ninguém foi punido._`,
          `_Threshold ${assuntos.limiarDoAssunto(mod)}/10; context is this channel's. ${mod.ia === false ? "Without AI, crossing it already acts." : "Crossing it, the AI still confirms."} Nobody was punished._`),
      ].join("\n") });
    }
    if (["liberar", "allow", "vigiar", "watch"].includes(op)) {
      // 17 out 2026: o ID ia para minúsculas antes de conferir — `<#canal>` de
      // verdade dava "canal de outro servidor"; e `#nome` nem era procurado.
      const bruto = String(a[1] ?? "");
      const canal = resolverCanal(bruto, { message, server });
      if (!canal) return sendEmbed(message.channel, { title: T("❌ Canal não encontrado", "❌ Channel not found"), colour: COR.erro,
        description: T(`Não achei o canal \`${bruto}\` neste servidor. Use \`#canal\`, o ID ou \`aqui\`.`, `I couldn't find the \`${bruto}\` channel on this server. Use \`#channel\`, the ID or \`here\`.`) });
      const dele = server?.channelIds ? (server.channelIds.has?.(canal) ?? true) : true;
      if (!dele) return sendEmbed(message.channel, { title: T("❌ Canal de outro servidor", "❌ Channel from another server"), colour: COR.erro, description: `\`${canal}\`` });
      const liberar = op === "liberar" || op === "allow";
      mod.canaisLiberados = liberar ? [...new Set([...mod.canaisLiberados, canal])] : mod.canaisLiberados.filter((c) => c !== canal);
      salvarConfig();
      return painel(liberar ? T(`✅ <#${canal}> liberado: os temas podem lá`, `✅ <#${canal}> allowed: topics are fine there`) : T(`✅ <#${canal}> vigiado de novo`, `✅ <#${canal}> watched again`));
    }
    const tema = assuntos.temaValido(op);
    if (!tema) {
      return sendEmbed(message.channel, { title: T("❌ Tema desconhecido", "❌ Unknown topic"), colour: COR.erro,
        description: `${T("Temas", "Topics")}: ${assuntos.NOMES_TEMAS.map((t) => `\`${t}\``).join(", ")}\n${T("Ex.:", "E.g.:")} \`${base} politica apagar\`` });
    }
    const op2 = a[1]?.toLowerCase();
    if (["add", "adicionar", "remover", "remove", "tirar"].includes(op2)) {
      const termo = a.slice(2).join(" ").trim().toLowerCase().slice(0, 60);
      if (!termo) return sendEmbed(message.channel, { title: T("❌ Falta o termo", "❌ Missing term"), colour: COR.erro, description: `\`${base} ${tema} ${op2} <${T("termo", "term")}>\`` });
      const lista = mod.termos[tema] ?? [];
      mod.termos[tema] = ["add", "adicionar"].includes(op2) ? [...new Set([...lista, termo])] : lista.filter((x) => x !== termo);
      salvarConfig();
      return painel(T(`✅ ${tema}: ${mod.termos[tema].length} termo(s) daqui`, `✅ ${tema}: ${mod.termos[tema].length} term(s) of yours`));
    }
    const nova = assuntos.acaoValida(op2);
    if (!nova) {
      return sendEmbed(message.channel, { title: T("❌ Ação inválida", "❌ Invalid action"), colour: COR.erro, description: [
        `\`${base} ${tema} <off|alertar|apagar|punir>\``, "",
        ...assuntos.ACOES.map((x) => `• \`${nomeAcaoTema(x, lang)}\` — ${ROT_ACAO[x]}`),
      ].join("\n") });
    }
    mod.acoes[tema] = nova;
    if (nova !== "off") mod.enabled = true;   // escolher um tema já liga a chave geral
    salvarConfig();
    return painel(`${assuntos.TEMAS[tema].emoji} ${nomeTema(tema, lang)} → ${nomeAcaoTema(nova, lang)}`);
  }

  // ── &automod sentinela avatar … (foto de perfil) ─────────────────────────
  async function painelAvatar(mod, a) {
    const T = (pt, en) => (lang === "en" ? en : pt);
    const P = PREFIXO, base = `${P}automod sentinela avatar`;
    const op = a[0]?.toLowerCase();
    const ROT = { alertar: T("só alerta a staff", "alerts staff only"), silenciar: T("silencia (timeout) e alerta", "silences (timeout) and alerts"), expulsar: T("expulsa e alerta", "kicks and alerts"), banir: T("bane e alerta", "bans and alerts") };
    const painel = (titulo = null) => sendEmbed(message.channel, { title: titulo ?? `🖼️ ${T("Foto de perfil", "Profile picture")}`, colour: COR.mod, description: [
      T("A foto de quem **entra** e de quem **troca** passa pelo modelo de visão. Apita com genitália, ato sexual ou pornografia descritos — ou nudez, gore e símbolo de ódio com o voto de risco do modelo.",
        "The picture of whoever **joins** or **changes** it goes through the vision model. It flags genitals, sex acts or porn described — or nudity, gore and hate symbols with the model's risk vote."),
      "",
      `**${T("Estado", "State")}:** ${mod.enabled !== false ? T("🟢 ligado", "🟢 on") : T("🔴 desligado", "🔴 off")}${process.env.IA_SERVICO_URL ? "" : T(" · ⚠️ sem IA_SERVICO_URL: não analisa", " · ⚠️ no IA_SERVICO_URL: nothing is analysed")}`,
      `**${T("Ação", "Action")}:** \`${nomeAcaoAvatar(avatar.acaoDoAvatar(mod), lang)}\` — ${ROT[avatar.acaoDoAvatar(mod)]}`,
      avatar.acaoDoAvatar(mod) === "silenciar" ? `**${T("Tempo", "Time")}:** ${duracaoTexto(avatar.tempoDoAvatar(mod), lang)}` : null,
      "",
      `\`${base} on|off\``,
      `\`${base} acao <alertar|silenciar|expulsar|banir>\``,
      `\`${base} tempo <24h|2d|…>\` — ${T("quanto dura o silêncio", "how long the silence lasts")}`,
      `\`${base} checar <@${T("pessoa", "person")}>\` — ${T("analisa a foto agora, sem punir", "analyses the picture now, without punishing")}`,
      T("_Staff, dono e bots não passam pela checagem. A foto nunca é republicada no alerta._", "_Staff, owner and bots are skipped. The picture is never reposted in the alert._"),
    ].filter((x) => x !== null).join("\n") });

    if (!op || op === "status" || op === "config") return painel();
    if (op === "on" || op === "off") { mod.enabled = op === "on"; salvarConfig(); return painel(); }
    if (op === "acao" || op === "ação" || op === "action") {
      const nova = avatar.acaoAvatarValida(a[1]);
      if (!nova) return sendEmbed(message.channel, { title: T("❌ Ação inválida", "❌ Invalid action"), colour: COR.erro,
        description: [`\`${base} acao <alertar|silenciar|expulsar|banir>\``, "", ...avatar.ACOES_AVATAR.map((x) => `• \`${nomeAcaoAvatar(x, lang)}\` — ${ROT[x]}`)].join("\n") });
      mod.acao = nova; salvarConfig();
      return painel(`🖼️ ${T("Ação", "Action")} → ${nomeAcaoAvatar(nova, lang)}`);
    }
    if (op === "tempo" || op === "time") {
      const ms = lerDuracao(a[1]);
      if (!ms) return sendEmbed(message.channel, { title: T("❌ Tempo inválido", "❌ Invalid time"), colour: COR.erro, description: `\`${base} tempo 24h\` · \`2d\` · \`30m\`` });
      mod.tempo = String(a[1]).toLowerCase(); salvarConfig();
      return painel(`🖼️ ${T("Tempo", "Time")} → ${duracaoTexto(avatar.tempoDoAvatar(mod), lang)}`);
    }
    if (op === "checar" || op === "check" || op === "testar" || op === "test") {
      const uid = await resolverUsuario(a.slice(1).join(" "), { message, server, client: ctx.client }).catch(() => null);
      if (!uid) return sendEmbed(message.channel, { title: T("❌ De quem?", "❌ Whose?"), colour: COR.erro, description: `\`${base} checar @${T("pessoa", "person")}\`` });
      const membro = await server?.fetchMember?.(uid).catch(() => null);
      const user = membro?.user ?? await ctx.client?.users?.fetch?.(uid).catch(() => null);
      const arq = avatar.arquivoDe(membro?.avatar) ?? avatar.arquivoDe(user?.avatar);
      if (!arq) return sendEmbed(message.channel, { title: T("🖼️ Sem foto", "🖼️ No picture"), colour: COR.mod, description: T(`<@${uid}> não tem foto de perfil.`, `<@${uid}> has no profile picture.`) });
      if (!process.env.IA_SERVICO_URL) return sendEmbed(message.channel, { title: T("⚠️ Sem modelo de visão", "⚠️ No vision model"), colour: COR.aviso, description: T("Falta `IA_SERVICO_URL` no `.env`.", "`IA_SERVICO_URL` is missing from `.env`.") });
      const r = await avatar.analisarFoto(arq);
      if (!r) return sendEmbed(message.channel, { title: T("⚠️ Não consegui analisar", "⚠️ Couldn't analyse it"), colour: COR.aviso, description: T("O modelo de visão não respondeu — veja o log do container.", "The vision model didn't answer — check the container log.") });
      return sendEmbed(message.channel, { title: r.apitou ? T("🖼️ Apitaria", "🖼️ Would flag") : T("🖼️ Passaria", "🖼️ Would pass"), colour: r.apitou ? COR.aviso : COR.sucesso, description: [
        `<@${uid}>${r.apitou ? ` · **${T("Sinais", "Signals")}:** ${r.motivos.join(", ")}` : ""}`,
        `> ${r.descricao.replace(/\n+/g, " ").slice(0, 400)}`,
        T("_Só checagem: ninguém foi punido._", "_Check only: nobody was punished._"),
      ].join("\n") });
    }
    const parecida = maisParecido(op, ["on", "off", "acao", "tempo", "checar"]);
    return sendEmbed(message.channel, { title: T("❌ Não conheço esse", "❌ I don't know that one"), colour: COR.erro,
      description: `${parecida ? T(`Você quis dizer \`${base} ${parecida}\`?\n\n`, `Did you mean \`${base} ${parecida}\`?\n\n`) : ""}\`${base} on|off\` · \`acao\` · \`tempo\` · \`checar\`` });
  }
}

// &automod whitelist <add|remove|list> [link|convite]   (ManagePermissions)
export async function cmdWhitelist(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

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
    title: en ? "❌ Wrong usage" : "❌ Uso incorreto",
    description: en
      ? `\`${PREFIXO}automod whitelist add <link|domain|invite>\` · \`remove\` · \`list\``
      : `\`${PREFIXO}automod whitelist add <link|domínio|convite>\` · \`remove\` · \`list\``,
    colour: COR.erro,
  });

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
    return sendEmbed(message.channel, {
      title: sub === "add" ? (en ? "✅ Allowed" : "✅ Liberado") : (en ? "✅ Removed" : "✅ Removido"),
      description: sub === "add"
        ? (en ? `From now on, ${oque} pass the automod.` : `A partir de agora, ${oque} passam pelo automod.`)
        : (en ? `${oque} are no longer on the whitelist.` : `${oque[0].toUpperCase()}${oque.slice(1)} saíram da lista de permitidos.`),
      colour: COR.sucesso,
    });
  }

  if (sub === "list" || !sub) {
    const doms = config.dominiosPermitidos.map((d) => `• \`${d}\``).join("\n") || (en ? "_none_" : "_nenhum_");
    const convs = config.inviteWhitelist.map((c) => `• \`${c}\``).join("\n") || (en ? "_none_" : "_nenhum_");
    return sendEmbed(message.channel, {
      title: en ? "📃 Whitelist" : "📃 Lista de permitidos",
      description: en
        ? `**Domains** _(anti-link never blocks these)_\n${doms}\n\n**Stoat invites** _(anti-invite)_\n${convs}`
        : `**Domínios** _(o anti-link nunca bloqueia)_\n${doms}\n\n**Convites do Stoat** _(anti-invite)_\n${convs}`,
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
    return negarPermissao(ctx, message.channel, "ManagePermissions");

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
      description: `A lista de bloqueio é **compartilhada** por todos os servidores da Judy — mudar aqui mudaria para todos.\n\n\`${PREFIXO}automod blocklist list\` — ver o que está nela\n\`${PREFIXO}automod whitelist add <link>\` — liberar um site **só neste servidor**\n\`${PREFIXO}automod antilink dominios off\` — desligar o bloqueio por lista **só aqui**`,
      colour: COR.aviso,
    }, {
      title: "🔒 Bot owner only",
      description: `The blocklist is **shared** by every server Judy is in — changing it here would change it for all of them.\n\n\`${PREFIXO}automod blocklist list\` — see what's on it\n\`${PREFIXO}automod whitelist add <link>\` — allow a site **on this server only**\n\`${PREFIXO}automod antilink dominios off\` — turn off list blocking **here only**`,
      colour: COR.aviso,
    }));
  }

  // ── Adicionar uma FONTE (URL de lista Pi-hole) ──
  if (sub === "add") {
    if (!arg || !/^https?:\/\//.test(arg))
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: `\`${PREFIXO}automod blocklist add <url>\`\nPara um único domínio use \`${PREFIXO}automod blocklist adddomain <domínio>\``,
        colour: COR.erro,
      }, {
        title: "❌ Wrong usage",
        description: `\`${PREFIXO}automod blocklist add <url>\`\nFor a single domain use \`${PREFIXO}automod blocklist adddomain <domain>\``,
        colour: COR.erro,
      }));
    if (cfgGlobal.linkBlocklistSources.includes(arg))
      return sendEmbed(message.channel, tr(ctx,
        { description: "Essa lista já foi adicionada.", colour: COR.aviso },
        { description: "That list was already added.", colour: COR.aviso }));

    await sendEmbed(message.channel, tr(ctx,
      { description: "⏳ Baixando lista, aguarde…", colour: COR.info },
      { description: "⏳ Downloading the list, hold on…", colour: COR.info }));
    cfgGlobal.linkBlocklistSources.push(arg);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Lista adicionada",
        description: `Fonte adicionada. Total de domínios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "✅ List added",
        description: `Source added. Total blocked domains: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  // ── Adicionar um ÚNICO domínio manualmente ──
  if (sub === "adddomain") {
    const dominio = (arg ?? "")
      .replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "").toLowerCase();
    if (!dominio || !DOMINIO_VALIDO.test(dominio))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Domínio inválido", description: `Ex.: \`${PREFIXO}automod blocklist adddomain 02giga.link\``, colour: COR.erro },
        { title: "❌ Invalid domain", description: `E.g.: \`${PREFIXO}automod blocklist adddomain 02giga.link\``, colour: COR.erro }));
    if (!cfgGlobal.linkBlocklistManual.includes(dominio)) {
      cfgGlobal.linkBlocklistManual.push(dominio);
      salvarGlobal();
      await rebuildBlocklist(ctx);
    }
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Domínio bloqueado",
        description: `\`${dominio}\` foi adicionado. Total: **${estado.blockedDomains.size}** domínio(s).`, colour: COR.sucesso },
      { title: "✅ Domain blocked",
        description: `\`${dominio}\` was added. Total: **${estado.blockedDomains.size}** domain(s).`, colour: COR.sucesso }));
  }

  // ── Remover um único domínio manual ──
  if (sub === "removedomain") {
    const dominio = (arg ?? "").toLowerCase();
    cfgGlobal.linkBlocklistManual = cfgGlobal.linkBlocklistManual.filter((d) => d !== dominio);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Domínio removido",
        description: `\`${dominio}\` foi removido. Total: **${estado.blockedDomains.size}** domínio(s).`, colour: COR.sucesso },
      { title: "✅ Domain removed",
        description: `\`${dominio}\` was removed. Total: **${estado.blockedDomains.size}** domain(s).`, colour: COR.sucesso }));
  }

  // ── Remover uma fonte (URL) ──
  if (sub === "remove") {
    if (!arg)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${PREFIXO}automod blocklist remove <url>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${PREFIXO}automod blocklist remove <url>\``, colour: COR.erro }));
    cfgGlobal.linkBlocklistSources = cfgGlobal.linkBlocklistSources.filter((u) => u !== arg);
    salvarGlobal();
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Lista removida",
        description: `Total de domínios bloqueados agora: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "✅ List removed",
        description: `Total blocked domains now: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  if (sub === "list") {
    const fontes = cfgGlobal.linkBlocklistSources.length
      ? cfgGlobal.linkBlocklistSources.map((u) => `• ${u}`).join("\n")
      : (lang === "en" ? "_No sources (URLs) added._" : "_Nenhuma fonte (URL) adicionada._");
    const manuais = cfgGlobal.linkBlocklistManual.length
      ? cfgGlobal.linkBlocklistManual.map((d) => `• \`${d}\``).join("\n")
      : (lang === "en" ? "_No manual domains._" : "_Nenhum domínio manual._");
    return sendEmbed(message.channel, lang === "en" ? {
      title: "📃 Anti-link blocks",
      description: `**Sources (URLs):**\n${fontes}\n\n**Manual domains:**\n${manuais}\n\n**Total loaded:** ${estado.blockedDomains.size}`,
      colour: COR.info,
    } : {
      title: "📃 Bloqueios anti-link",
      description: `**Fontes (URLs):**\n${fontes}\n\n**Domínios manuais:**\n${manuais}\n\n**Total carregado:** ${estado.blockedDomains.size}`,
      colour: COR.info,
    });
  }

  if (sub === "clear") {
    cfgGlobal.linkBlocklistSources = [];
    cfgGlobal.linkBlocklistManual = [];
    salvarGlobal();
    estado.blockedDomains = engine.criarIndiceVazio();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🗑 Listas limpas", description: "Todas as fontes e domínios foram removidos.", colour: COR.sucesso },
      { title: "🗑 Lists cleared", description: "All sources and domains were removed.", colour: COR.sucesso }));
  }

  if (sub === "reload") {
    await sendEmbed(message.channel, tr(ctx,
      { description: "⏳ Recarregando listas…", colour: COR.info },
      { description: "⏳ Reloading the lists…", colour: COR.info }));
    await rebuildBlocklist(ctx);
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔄 Listas recarregadas",
        description: `Total de domínios bloqueados: **${estado.blockedDomains.size}**.`, colour: COR.sucesso },
      { title: "🔄 Lists reloaded",
        description: `Total blocked domains: **${estado.blockedDomains.size}**.`, colour: COR.sucesso }));
  }

  // Só `&automod blocklist` (a ajuda o mostra assim) é uma pergunta, não um erro (17 out 2026).
  const so = !sub;
  return sendEmbed(message.channel, tr(ctx, {
    title: so ? "🧱 Lista de bloqueio" : "❌ Uso incorreto",
    description: [
      so ? `**${estado.blockedDomains.size}** domínio(s) carregado(s), compartilhados por todos os servidores.\n` : null,
      `\`${PREFIXO}automod blocklist add <url>\` — adiciona lista Pi-hole`,
      `\`${PREFIXO}automod blocklist adddomain <domínio>\` — bloqueia 1 domínio`,
      `\`${PREFIXO}automod blocklist removedomain <domínio>\``,
      `\`${PREFIXO}automod blocklist remove <url>\``,
      `\`${PREFIXO}automod blocklist list | clear | reload\``,
    ].filter((x) => x !== null).join("\n"),
    colour: so ? COR.info : COR.erro,
  }, {
    title: so ? "🧱 Blocklist" : "❌ Wrong usage",
    description: [
      so ? `**${estado.blockedDomains.size}** domain(s) loaded, shared by every server.\n` : null,
      `\`${PREFIXO}automod blocklist add <url>\` — adds a Pi-hole list`,
      `\`${PREFIXO}automod blocklist adddomain <domain>\` — blocks 1 domain`,
      `\`${PREFIXO}automod blocklist removedomain <domain>\``,
      `\`${PREFIXO}automod blocklist remove <url>\``,
      `\`${PREFIXO}automod blocklist list | clear | reload\``,
    ].filter((x) => x !== null).join("\n"),
    colour: so ? COR.info : COR.erro,
  }));
}

export async function cmdScam(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

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
    simular: "simulate", simulate: "simulate",
  };
  const bruto0 = args[0]?.toLowerCase();
  const sub = PAINEL[bruto0] ?? bruto0;
  const val = args[1];
  const limiarDe = (sens) => engine.limiarBase(sens);

  if (!sub || sub === "config" || sub === "status") {
    return sendEmbed(message.channel, lang === "en" ? {
      title: "🛡 Sentinel — judgement-based moderation",
      colour: COR.mod,
      description: [
        "Weighs the *content* and gives it a suspicion score. Unlike the other",
        "modules — which measure exact things like caps or message rate — this one",
        "**judges**, so it adapts to who is writing.",
        "",
        `**Enabled:** ${cfg.enabled ? "🟢 yes" : "🔴 no"}  (enable with \`${PREFIXO}automod sentinela on\`)`,
        `**Sensitivity:** ${nomeSens(cfg.sensitivity, "en")}  (base threshold: ${limiarDe(cfg.sensitivity)}/10)`,
        `**Stricter with newcomers:** ${cfg.porAntiguidade !== false ? "🟢 on" : "🔴 off"} — threshold moves with the member's level`,
        `**Alert the staff:** ${cfg.alertarAdmin !== false ? "🟢 on" : "🔴 off"} — pings staff on a suspicious *pattern*, before punishing`,
        `**Alert channel:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(uses the message's channel)_"}`,
        `**Punishment:** set with \`${PREFIXO}automod punicao\` (current mode: **${nomeModo(pol.modo, "en")}**) — applies to all automods`,
        "",
        "**Commands:**",
        `\`${PREFIXO}automod sentinel sensitivity <low|medium|high>\``,
        `\`${PREFIXO}automod sentinel tenure on|off\` · \`${PREFIXO}automod sentinel alert on|off\``,
        `\`${PREFIXO}automod sentinel channel <#channel|here>\``,
        `\`${PREFIXO}automod sentinel test <text>\` · \`${PREFIXO}automod sentinel simulate <text>\``,
        `\`${PREFIXO}automod sentinel ban <@user|id>\` · \`${PREFIXO}automod sentinel dismiss <@user|id>\``,
      ].join("\n"),
    } : {
      title: "🛡 Sentinela — moderação por julgamento",
      colour: COR.mod,
      description: [
        "Pesa o *conteúdo* e dá uma nota de suspeita. Diferente dos outros",
        "módulos — que medem coisas exatas, como caixa alta ou ritmo de mensagem —",
        "este **julga**, e por isso se adapta a quem está escrevendo.",
        "",
        `**Ativado:** ${cfg.enabled ? "🟢 sim" : "🔴 não"}  (ligue com \`${PREFIXO}automod sentinela on\`)`,
        `**Sensibilidade:** ${cfg.sensitivity}  (limiar base: ${limiarDe(cfg.sensitivity)}/10)`,
        `**Mais rígido com quem chegou agora:** ${cfg.porAntiguidade !== false ? "🟢 ligado" : "🔴 desligado"} — o limiar acompanha o nível do membro`,
        `**Avisar a staff:** ${cfg.alertarAdmin !== false ? "🟢 ligado" : "🔴 desligado"} — marca a staff diante de um *padrão* suspeito, antes de punir`,
        `**Canal de aviso:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(usa o canal da mensagem)_"}`,
        `**Punição:** definida em \`${PREFIXO}automod punicao\` (modo atual: **${pol.modo}**) — vale para todos os automods`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}automod sentinela sensibilidade <baixa|media|alta>\``,
        `\`${PREFIXO}automod sentinela antiguidade on|off\` · \`${PREFIXO}automod sentinela alerta on|off\``,
        `\`${PREFIXO}automod sentinela canal <#canal|aqui>\``,
        `\`${PREFIXO}automod sentinela testar <texto>\` · \`${PREFIXO}automod sentinela simular <texto>\``,
        `\`${PREFIXO}automod sentinela banir <@pessoa|id>\` · \`${PREFIXO}automod sentinela liberar <@pessoa|id>\``,
      ].join("\n"),
    });
  }

  if (["on", "off", "ligar", "desligar", "enable", "disable"].includes(sub)) {
    const ligar = ["on", "ligar", "enable"].includes(sub);
    cfg.enabled = ligar;
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛡 Sentinela", description: `O Sentinela foi **${ligar ? "ativado 🟢" : "desativado 🔴"}**.${ligar ? `\n\nSensibilidade: \`${cfg.sensitivity ?? "media"}\` · punição: a do \`${PREFIXO}automod punicao\`.` : ""}`, colour: COR.mod },
      { title: "🛡 Sentinel", description: `The Sentinel was **${ligar ? "enabled 🟢" : "disabled 🔴"}**.${ligar ? `\n\nSensitivity: \`${nomeSens(cfg.sensitivity ?? "media", "en")}\` · punishment: the one from \`${PREFIXO}automod punicao\`.` : ""}`, colour: COR.mod }));
  }

  if (["antiguidade", "tenure", "novatos"].includes(sub)) {
    const on = ["on", "sim", "yes", "true"].includes(String(val ?? "").toLowerCase());
    const off = ["off", "nao", "não", "no", "false"].includes(String(val ?? "").toLowerCase());
    if (!on && !off) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}automod sentinela antiguidade on|off\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}automod sentinela antiguidade on|off\``, colour: COR.erro }));
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
    }));
  }

  if (["alerta", "alertar", "alert", "staff"].includes(sub)) {
    const on = ["on", "sim", "yes", "true"].includes(String(val ?? "").toLowerCase());
    const off = ["off", "nao", "não", "no", "false"].includes(String(val ?? "").toLowerCase());
    if (!on && !off) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}automod sentinela alerta on|off\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}automod sentinela alert on|off\``, colour: COR.erro }));
    }
    cfg.alertarAdmin = on; salvarConfig();
    return sendEmbed(message.channel, tr(ctx, {
      title: on ? "🟢 Alerta à staff ligado" : "🔴 Alerta à staff desligado",
      description: on
        ? `A staff é marcada quando alguém levanta suspeita **repetidas vezes** em pouco tempo — mesmo sem chegar ao limiar de punição.\nUm sinal isolado é ruído; um padrão merece olho humano.\nCargos marcados: os de \`${PREFIXO}acesso cargo\`.`
        : "Nada de marcações. As punições continuam normalmente; só o aviso preventivo sai de cena.",
      colour: on ? COR.sucesso : COR.aviso,
    }, {
      title: on ? "🟢 Staff alerts on" : "🔴 Staff alerts off",
      description: on
        ? `Staff gets pinged when someone raises suspicion **repeatedly** in a short window — even below the punishment threshold.\nOne signal is noise; a pattern deserves human eyes.\nRoles pinged: the ones in \`${PREFIXO}acesso cargo\`.`
        : "No pings. Punishments still work; only the preventive heads-up goes away.",
      colour: on ? COR.sucesso : COR.aviso,
    }));
  }

  if (sub === "sensitivity") {
    const opc = ["baixa", "media", "alta"];
    const v = { low: "baixa", medium: "media", média: "media", high: "alta" }[String(val ?? "").toLowerCase()] ?? String(val ?? "").toLowerCase();
    if (!opc.includes(v))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}automod sentinela sensibilidade <${opc.join("|")}>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}automod sentinel sensitivity <low|medium|high>\``, colour: COR.erro }));
    cfg.sensitivity = v; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Sensibilidade", description: `Sensibilidade: **${v}** (limiar ${limiarDe(v)}/10).`, colour: COR.sucesso },
      { title: "✅ Sensitivity", description: `Sensitivity: **${nomeSens(v, "en")}** (threshold ${limiarDe(v)}/10).`, colour: COR.sucesso }));
  }

  if (sub === "channel") {
    if (!val) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}automod sentinela canal <#canal|aqui>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}automod sentinel channel <#channel|here>\``, colour: COR.erro }));
    // 17 out 2026: aceitava qualquer texto (até ID de canal de outro servidor) e não achava `#nome`;
    // e o `off` que a ajuda ensinava virava o "ID" do canal.
    if (["off", "nenhum", "none", "limpar", "clear"].includes(val.toLowerCase())) {
      cfg.alertChannelId = null; salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Canal de aviso", description: "Sem canal próprio: os avisos vão para o canal de logs (ou o da mensagem).", colour: COR.sucesso },
        { title: "✅ Alert channel", description: "No channel of its own: alerts go to the log channel (or the message's channel).", colour: COR.sucesso }));
    }
    const alvo = resolverCanal(val, { message, server });
    const deOutro = alvo && server?.channelIds?.size && !server.channelIds.has(alvo);
    if (!alvo || deOutro) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Canal não encontrado", description: `Não achei \`${val}\` neste servidor. Use \`#canal\`, o ID ou \`aqui\`.`, colour: COR.erro },
      { title: "❌ Channel not found", description: `I couldn't find \`${val}\` on this server. Use \`#channel\`, the ID or \`here\`.`, colour: COR.erro }));
    cfg.alertChannelId = alvo;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Canal de aviso", description: `Avisos irão para \`${cfg.alertChannelId}\`.`, colour: COR.sucesso },
      { title: "✅ Alert channel", description: `Alerts will go to \`${cfg.alertChannelId}\`.`, colour: COR.sucesso }));
  }

  if (sub === "ban") {
    const uid = (val ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}automod sentinela banir <@pessoa|id>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}automod sentinel ban <@user|id>\``, colour: COR.erro }));
    try {
      await banir(server, uid, { reason: "[AutoMod] Confirmado por moderador" });
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔨 Banido", description: `<@${uid}> foi banido (confirmado).`, colour: COR.erro },
        { title: "🔨 Banned", description: `<@${uid}> was banned (confirmed).`, colour: COR.erro }));
    } catch (err) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Erro", description: `Não foi possível banir: ${descreverErroBan(err)}`, colour: COR.erro },
        { title: "❌ Error", description: `Couldn't ban: ${descreverErroBan(err, "en")}`, colour: COR.erro }));
    }
  }

  if (sub === "dismiss") {
    const uid = (val ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}automod sentinela liberar <@pessoa|id>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}automod sentinel dismiss <@user|id>\``, colour: COR.erro }));
    try {
      await tirarTimeout(server, uid);
      // quem foi silenciado ainda com o cargo antigo
      if (pol.silenceRoleId) await removerCargoSilence(server, uid, pol.silenceRoleId, ctx).catch(() => {});
      db.limparPunicao(ctx.serverId, uid);   // some do banco: não reaplica ao reentrar
      liberarQuarentena(ctx.serverId, uid);
      await log.registrar(ctx, "punicoes", { titulo: "✅ Punição removida",
        descricao: `<@${uid}> foi liberado por <@${message.authorId}>.`,
        en: { titulo: "✅ Punishment removed", descricao: `<@${uid}> was released by <@${message.authorId}>.` } });
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Liberado", description: `Punição de <@${uid}> removida.`, colour: COR.sucesso },
        { title: "✅ Released", description: `<@${uid}>'s punishment was removed.`, colour: COR.sucesso }));
    } catch (err) {
      // A API do Stoat lança objetos, não Error: `err.message` virava "undefined".
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Erro", description: `Não foi possível liberar: ${engine.descreverErro(err, "pt")}`, colour: COR.erro },
        { title: "❌ Error", description: `Couldn't release: ${engine.descreverErro(err, "en")}`, colour: COR.erro }));
    }
  }

  if (sub === "test") {
    const texto = args.slice(1).join(" ");
    if (!texto) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}automod sentinela testar <texto>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}automod sentinel test <text>\``, colour: COR.erro }));
    const r = analisarConteudo(texto, { rate: 1 });
    const limiar = limiarDe(cfg.sensitivity);
    const flag = r.nota >= limiar;

    console.log(`[SCAM TEST] nota=${r.nota.toFixed(1)}/${limiar} flag=${flag} grave=${r.grave} sinais=[${r.sinais.join(", ") || "nenhum"}]`);

    const acaoTxt = lang === "en"
      ? (!cfg.enabled
        ? `module **DISABLED** (enable with \`${PREFIXO}automod sentinela on\`)`
        : `it would apply the global policy **${nomeModo(pol.modo, "en")}** (see \`${PREFIXO}automod punicao\`)`)
      : (!cfg.enabled
        ? `módulo **DESATIVADO** (ative com \`${PREFIXO}automod sentinela on\`)`
        : `aplicaria a política global **${pol.modo}** (veja \`${PREFIXO}automod punicao\`)`);

    return sendEmbed(message.channel, lang === "en" ? {
      title: flag ? `🛑 WOULD be flagged (score ${r.nota.toFixed(1)}/10)` : `✅ Would NOT be flagged (score ${r.nota.toFixed(1)}/10)`,
      description: [
        `**Module:** ${cfg.enabled ? "🟢 enabled" : "🔴 disabled"}  •  **Sensitivity:** ${nomeSens(cfg.sensitivity, "en")} (threshold ${limiar})`,
        `**Score:** ${r.nota.toFixed(1)} / 10`,
        `**Serious?** ${r.grave ? "yes ⚠️" : "no"}`,
        `**Signals:** ${r.sinais.join(", ") || "none"}`,
        flag ? `**What it would do:** ${acaoTxt}` : null,
        "",
        `💡 Real flow in the alert channel: \`${PREFIXO}automod sentinel simulate <text>\``,
      ].filter(Boolean).join("\n"),
      colour: flag ? COR.erro : COR.sucesso,
    } : {
      title: flag ? `🛑 SERIA sinalizado (nota ${r.nota.toFixed(1)}/10)` : `✅ NÃO seria sinalizado (nota ${r.nota.toFixed(1)}/10)`,
      description: [
        `**Módulo:** ${cfg.enabled ? "🟢 ativado" : "🔴 desativado"}  •  **Sensibilidade:** ${cfg.sensitivity} (limiar ${limiar})`,
        `**Nota:** ${r.nota.toFixed(1)} / 10`,
        `**Grave?** ${r.grave ? "sim ⚠️" : "não"}`,
        `**Sinais:** ${r.sinais.join(", ") || "nenhum"}`,
        flag ? `**O que faria:** ${acaoTxt}` : null,
        "",
        `💡 Fluxo real no canal de avisos: \`${PREFIXO}automod sentinela simular <texto>\``,
      ].filter(Boolean).join("\n"),
      colour: flag ? COR.erro : COR.sucesso,
    });
  }

  if (sub === "simulate" || sub === "simular") {
    const texto = args.slice(1).join(" ");
    if (!texto) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${PREFIXO}automod sentinela simular <texto>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${PREFIXO}automod sentinel simulate <text>\``, colour: COR.erro }));
    await simularDeteccao(texto, ctx, message.channel);
    return sendEmbed(message.channel, tr(ctx, {
      title: "🧪 Simulação enviada",
      description: `Resultado enviado ao canal de avisos${cfg.alertChannelId ? ` (\`${cfg.alertChannelId}\`)` : " (este canal)"}. Nada foi punido.`,
      colour: COR.info,
    }, {
      title: "🧪 Simulation sent",
      description: `Result sent to the alert channel${cfg.alertChannelId ? ` (\`${cfg.alertChannelId}\`)` : " (this channel)"}. Nothing was punished.`,
      colour: COR.info,
    }));
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "❌ Subcomando desconhecido", description: `Use \`${PREFIXO}automod sentinela config\` para ver as opções.`, colour: COR.erro },
    { title: "❌ Unknown subcommand", description: `Use \`${PREFIXO}automod sentinela config\` to see the options.`, colour: COR.erro }));
}

export async function cmdPunicao(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return negarPermissao(ctx, message.channel, "ManagePermissions");

  const pol = config.automod.punicao;
  const sub = args[0]?.toLowerCase();
  const bruto = String(args[1] ?? "").toLowerCase();
  const val = MODO_EN[bruto] ?? (["avisar", "apagar", "confirmar", "acumular", "banir"].includes(bruto) ? bruto : args[1]);

  const rotulo = (m) => lang === "en"
    ? (m === "banir"     ? "instant ban"
     : m === "acumular"  ? `stacked warnings → ban at ${engine.limiteDeAvisos(pol)}`
     : m === "confirmar" ? "confirm (silences and waits for a moderator)"
     :                     "warning only (doesn't delete or punish)")
    : (m === "banir"     ? "banimento imediato"
     : m === "acumular"  ? `avisos acumulados → ban em ${engine.limiteDeAvisos(pol)}`
     : m === "confirmar" ? "confirmar (silencia e espera moderador)"
     :                     "apenas aviso (não apaga nem pune)");

  if (!sub || sub === "status" || sub === "config") {
    return sendEmbed(message.channel, lang === "en" ? {
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
        `_Not sure where to start? \`${PREFIXO}tutorial moderacao\` explains the path._`,
        "",
        "**Commands:**",
        `\`${PREFIXO}automod punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
        `\`${PREFIXO}automod punicao escada [aviso,5m,1h,ban]\` — the steps of \`stack\` mode`,
        `\`${PREFIXO}automod punicao warns <number>\` — how many warnings until the ban (adjusts the ladder)`,
        `\`${PREFIXO}automod punicao validade <days|0>\` — after how many days warnings reset (0 = never)`,
        "",
        `_To try a text out, that's the filter's job: \`${PREFIXO}automod sentinela test <text>\`. This command only decides what **happens** afterwards._`,
      ].join("\n"),
    } : {
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
        `_Não sabe por onde começar? \`${PREFIXO}tutorial moderacao\` explica o caminho._`,
        "",
        "**Comandos:**",
        `\`${PREFIXO}automod punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
        `\`${PREFIXO}automod punicao escada [aviso,5m,1h,ban]\` — os degraus do modo \`acumular\``,
        `\`${PREFIXO}automod punicao warns <número>\` — quantos avisos até o ban (ajusta a escada)`,
        `\`${PREFIXO}automod punicao validade <dias|0>\` — em quantos dias os avisos zeram (0 = nunca)`,
        "",
        `_Para experimentar um texto, quem faz isso é o filtro: \`${PREFIXO}automod sentinela test <texto>\`. Este comando só decide o que **acontece** depois._`,
      ].join("\n"),
    });
  }

  if (sub === "modo" || sub === "mode") {
    if (!["avisar", "apagar", "confirmar", "acumular", "banir"].includes(val))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}automod punicao modo <avisar|apagar|confirmar|acumular|banir>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}automod punicao modo <avisar|apagar|confirmar|acumular|banir>\``, colour: COR.erro }));
    pol.modo = val; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Modo de punição atualizado", description: `Agora: **${val}** — ${rotulo(val)}.`, colour: COR.sucesso },
      { title: "✅ Punishment mode updated", description: `Now: **${nomeModo(val, "en")}** — ${rotulo(val)}.`, colour: COR.sucesso }));
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
          `\`${PREFIXO}automod punicao escada aviso,5m,1h,ban\` — o padrão`,
          `\`${PREFIXO}automod punicao escada aviso,10m,1h,12h,ban\` — mais degraus`,
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
          `\`${PREFIXO}automod punicao escada aviso,5m,1h,ban\` — the default`,
          `\`${PREFIXO}automod punicao escada aviso,10m,1h,12h,ban\` — more steps`,
          "",
          "_Accepts `warn`, `ban` and durations like `30s`, `10m`, `2h`, `1d`._",
          "_A ban is always the last step, even if you don't write it._",
        ].join("\n"), colour: COR.mod,
      }));
    }
    const teste = engine.escadaDePunicao({ escada: bruto }, { estrito: true });
    if (teste.length < 2) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Escada inválida", description: `Não entendi \`${bruto}\`.\n\nEx.: \`aviso,5m,1h,ban\``, colour: COR.erro },
        { title: "❌ Invalid ladder", description: `I didn't understand \`${bruto}\`.\n\nE.g.: \`warn,5m,1h,ban\``, colour: COR.erro }));
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
    }));
  }

  if (sub === "warns" || sub === "warnsparaban") {
    const n = parseInt(val, 10);
    if (!Number.isInteger(n) || n < 1 || n > 20)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}automod punicao warns <1-20>\``, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}automod punicao warns <1-20>\``, colour: COR.erro }));
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
      { title: "✅ Warnings until ban", description: `In \`stack\` mode, the ban happens at warning **${n}**.\n🪜 ${nova.map((d) => engine.rotuloDegrau(d, "en")).join(" → ")}`, colour: COR.sucesso }));
  }

  if (["validade", "vencimento", "expira", "expiry", "expire"].includes(sub)) {
    // Sem valor mostra a atual, como a `escada` (17 out 2026: dava "❌ Uso").
    if (val === undefined || val === "") {
      const atual = Number(pol.validadeDias ?? engine.VALIDADE_PADRAO_DIAS ?? 30);
      return sendEmbed(message.channel, tr(ctx,
        { title: "⏳ Validade dos avisos", colour: COR.info, description: [
          atual ? `Os avisos zeram depois de **${atual}** dia(s) sem um novo.` : "Os avisos **nunca** zeram sozinhos.",
          `\`${PREFIXO}automod punicao validade <0-365>\` — muda (0 = nunca zeram)`].join("\n") },
        { title: "⏳ Warning expiry", colour: COR.info, description: [
          atual ? `Warnings reset after **${atual}** day(s) without a new one.` : "Warnings **never** reset on their own.",
          `\`${PREFIXO}automod punishment expiry <0-365>\` — changes it (0 = never)`].join("\n") }));
    }
    const d = parseInt(val, 10);
    if (!Number.isInteger(d) || d < 0 || d > 365)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso", description: `\`${PREFIXO}automod punicao validade <0-365>\` — dias sem aviso novo até zerar (0 = nunca zeram)`, colour: COR.erro },
        { title: "❌ Usage", description: `\`${PREFIXO}automod punishment expiry <0-365>\` — days without a new warning until they reset (0 = never)`, colour: COR.erro }));
    pol.validadeDias = d; salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "✅ Validade dos avisos", description: d ? `Os avisos zeram depois de **${d}** dia(s) sem um novo.` : "Os avisos **nunca** zeram sozinhos.", colour: COR.sucesso },
      { title: "✅ Warning expiry", description: d ? `Warnings reset after **${d}** day(s) without a new one.` : "Warnings **never** reset on their own.", colour: COR.sucesso }));
  }

  if (sub === "silencerole" || sub === "cargo") {
    // Aposentado: o silêncio é o timeout nativo do Stoat, sem cargo.
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔇 Não há mais cargo de silêncio",
        description: "O silêncio da punição agora é o **timeout nativo do Stoat** — não precisa de cargo. Basta o cargo do bot ter **TimeoutMembers**.", colour: COR.info },
      { title: "🔇 There's no silence role anymore",
        description: "Punishment silences now use the **Stoat's native timeout** — no role needed. The bot's role just needs **TimeoutMembers**.", colour: COR.info }));
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
    return sendEmbed(message.channel, tr(ctx, {
      title: `↪️ Isso é do \`${PREFIXO}${destino}\``,
      description: [
        `\`${PREFIXO}automod punicao\` decide **o que acontece** com quem infringe — ele não analisa textos nem pune ninguém sozinho.`,
        "",
        `Você quis dizer:`,
        `\`${cmd}\``,
      ].join("\n"), colour: COR.aviso,
    }, {
      title: `↪️ That belongs to \`${PREFIXO}${destino}\``,
      description: [
        `\`${PREFIXO}automod punicao\` decides **what happens** to whoever breaks a rule — it doesn't analyse text or punish anyone on its own.`,
        "",
        `You probably meant:`,
        `\`${cmd}\``,
      ].join("\n"), colour: COR.aviso,
    }));
  }

  return sendEmbed(message.channel, tr(ctx, {
    title: "❌ Subcomando desconhecido",
    description: [
      `\`${sub}\` não é um subcomando do \`${PREFIXO}automod punicao\`.`,
      "",
      `\`modo\` · \`escada\` · \`warns\` · \`status\``,
      "",
      `_\`${PREFIXO}automod punicao status\` mostra o que cada um faz._`,
    ].join("\n"), colour: COR.erro,
  }, {
    title: "❌ Unknown subcommand",
    description: [
      `\`${sub}\` isn't a \`${PREFIXO}automod punicao\` subcommand.`,
      "",
      `\`modo\` · \`escada\` · \`warns\` · \`status\``,
      "",
      `_\`${PREFIXO}automod punicao status\` shows what each one does._`,
    ].join("\n"), colour: COR.erro,
  }));
}

function negarPermissao(ctx, channel, permName) {
  return ctx.sendEmbed(channel, tr(ctx, {
    title: "🚫 Permissão insuficiente",
    description: `Você precisa da permissão **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  }, {
    title: "🚫 Missing permission",
    description: `You need the **${permName}** permission to use this command.`,
    colour: ctx.COR.erro,
  }));
}
