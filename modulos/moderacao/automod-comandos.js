import { TERMOS_ODIO } from "./rajada.js";
import { citar, citarInterno } from "../core/aliases.js";
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
    `_O próximo: ${engine.rotuloDegrau(degraus[count], "pt")}._`, `_Next one: ${engine.rotuloDegrau(degraus[count], "es")}._`, `_El siguiente: ${engine.rotuloDegrau(degraus[count], "es")}._`));
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
    return negarPermissao(ctx, message.channel, "ManagePermissions");

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

// Os parâmetros em inglês, para a tela (o que se digita em inglês o aliases.js traduz)
const PARAM_EN = { mensagens: "messages", tempo: "time", mencoes: "mentions", tamanho: "size", limiar: "threshold", repeticao: "repetition",
  ignorar: "ignore", minuto: "minute", novato: "newcomer", vezes: "times" };
const nomeParam = (p, lang) => (lang === "en" ? PARAM_EN[p] ?? p : p);

// %automod status | %automod <módulo> <on|off> | %automod debug <on|off>   (ManagePermissions)
const G_AUTOMOD = GRUPOS_AUTOMOD;

// A cola dos quatro grupos, com exemplos que dá para copiar como estão.
function guiaDosGrupos(lang, P, abertura, ctx) {
  const T = (pt, eng, es) => tr(ctx, pt, eng, es);
  return [
    abertura, "",
    ...Object.entries(G_AUTOMOD).map(([nome, d]) => `${d.emoji} \`${nomeGrupo(nome, lang)}\` — ${T(d.pt, d.en, d.es)}`),
    "",
    T("**Copie assim mesmo:**", "**Copy as is:**", "**Cópialo tal cual:**"),
    `\`${citarInterno("automod", P)} antispam off\` — ${T("desliga um grupo", "turns one group off", "desactiva un grupo")}`,
    `\`${citarInterno("automod", P)} ${nomeGrupo("antiruido", lang)} caps off\` — ${T("desliga só uma parte", "turns off just one part", "desactiva solo una parte")}`,
    `\`${citarInterno("automod", P)} off\` · \`${citarInterno("automod", P)} on\` — ${T("tudo de uma vez", "everything at once", "todo a la vez")}`,
    `\`${citarInterno("automod", P)}\` — ${T("o que está ligado agora", "what's on and off right now", "lo que está activado ahora")}`,
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
    return sendEmbed(message.channel, { title: tr(ctx, "✏️ Troque o ‹…› por um valor", "✏️ Replace the ‹…› with a value", "✏️ Cambia el ‹…› por un valor"), colour: COR.aviso,
      description: guiaDosGrupos(lang, PREFIXO, ehMarcador(sub)
        ? tr(ctx, `\`${sub}\` na ajuda é um **espaço para preencher**, não para digitar. Use um dos grupos abaixo:`,
            `\`${sub}\` in the help is a **blank to fill in**, not something to type. Use one of the groups below:`,
            `\`${sub}\` en la ayuda es un **espacio para rellenar**, no para escribir. Usa uno de los grupos de abajo:`)
        : tr(ctx, `\`${args[1]}\` é um **espaço para preencher** — as partes de \`${sub}\` são: ${Object.keys(G_AUTOMOD[sub].partes).map((x) => `\`${x}\``).join(", ")}.`,
            `\`${args[1]}\` is a **blank to fill in** — the parts of \`${sub}\` are: ${Object.keys(G_AUTOMOD[sub].partes).map((x) => `\`${x}\``).join(", ")}.`,
            `\`${args[1]}\` es un **espacio para rellenar** — las partes de \`${nomeGrupo(sub, "en")}\` son: ${Object.keys(G_AUTOMOD[sub].partes).map((x) => `\`${nomeParte(x, "en")}\``).join(", ")}.`), ctx) });
  }

  // ── `&automod off` / `&automod on` — tudo de uma vez ─────────────────
  const TUDO = { on: true, ligar: true, ativar: true, enable: true, off: false, desligar: false, desativar: false, disable: false };
  if (sub in TUDO && !args[1]) {
    const on = TUDO[sub];
    for (const chave of Object.values(MODULOS_AUTOMOD)) config.automod[chave] = { ...(config.automod[chave] ?? {}), enabled: on };
    salvarConfig();
    return sendEmbed(message.channel, { title: "🛡 AutoMod", colour: on ? COR.sucesso : COR.mod, description: tr(ctx,
      (on ? `**Tudo ligado** 🟢 — os 4 grupos: \`antispam\`, \`antiruido\`, \`antilink\`, \`sentinela\`.\n\nPara desligar um: \`${citarInterno("automod.antiruido", PREFIXO)} off\` · ver cada um: \`${citarInterno("automod", PREFIXO)}\``
          : `**Tudo desligado** 🔴 — nada é filtrado nem punido automaticamente agora.\n\nPara ligar só um: \`${citarInterno("automod", PREFIXO)} antispam on\` · tudo de volta: \`${citarInterno("automod", PREFIXO)} on\``),
      (on ? `**Everything on** 🟢 — the 4 groups: \`antispam\`, \`antiruido\`, \`antilink\`, \`sentinela\`.\n\nTo turn one off: \`${citarInterno("automod.antiruido", PREFIXO)} off\` · see each one: \`${citarInterno("automod", PREFIXO)}\``
          : `**Everything off** 🔴 — nothing is filtered or punished automatically now.\n\nTo turn just one on: \`${citarInterno("automod", PREFIXO)} antispam on\` · all back: \`${citarInterno("automod", PREFIXO)} on\``),
      (on ? `**Todo activado** 🟢 — los 4 grupos: \`antispam\`, \`antinoise\`, \`antilink\`, \`sentinel\`.\n\nPara desactivar uno: \`${citar("automod.antiruido", "es", PREFIXO)} off\` · ver cada uno: \`${citar("automod", "es", PREFIXO)}\``
          : `**Todo desactivado** 🔴 — ahora no se filtra ni se castiga nada automáticamente.\n\nPara activar solo uno: \`${citar("automod", "es", PREFIXO)} antispam on\` · todo de vuelta: \`${citar("automod", "es", PREFIXO)} on\``)) });
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
    const T = (pt, eng, es) => tr(ctx, pt, eng, es);
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
      return sendEmbed(message.channel, { title: `${def.emoji} ${nomeGrupo(grupo, lang)} — ${T(def.pt, def.en, def.es)}`, colour: COR.mod, description: [
        `**${st.ligadas}/${st.total}** ${T("partes ligadas", "parts on", "partes activadas")}`,
        "",
        ...st.partes.map((x) => `${x.ligada ? "🟢" : "🔴"} \`${nomeParte(x.parte, lang)}\` — ${(ROTULO_PARTE[x.parte] ? tr(ctx, ...ROTULO_PARTE[x.parte]) : null) ?? x.parte}`
          + `${descreverFiltro(config.automod, x.chave, lang, ctx.estado) ? ` _(${descreverFiltro(config.automod, x.chave, lang, ctx.estado)})_` : ""}`
          + `${pm(x.filtro) ? ` · ${T("punição", "punishment", "castigo")} \`${nomeModo(pm(x.filtro), lang)}\`` : ""}`),
        "",
        `\`${citarInterno("automod", PREFIXO)} ${grupo} on|off\` — ${T("o grupo inteiro", "the whole group", "el grupo entero")}`,
        `\`${citarInterno("automod", PREFIXO)} ${grupo} <${T("parte", "part", "parte")}> on|off\` — ${T("só uma parte", "one part only", "solo una parte")}`,
        Object.keys(PARAM_PARTE).length ? `\`${citarInterno("automod", PREFIXO)} ${grupo} set <${Object.keys(PARAM_PARTE).join("|")}> <${T("valor", "value", "valor")}>\`` : null,
        `\`${citarInterno("automod", PREFIXO)} ${grupo} punicao <avisar|apagar|confirmar|acumular|banir|herdar>\``,
        grupo === "sentinela" ? T(`_Painel do sentinela: \`${citarInterno("automod.sentinela.config", PREFIXO)}\` · \`sensitivity\` · \`test <texto>\` · \`odio add <termo>\`_`, `_Sentinel panel: \`${citarInterno("automod.sentinela.config", PREFIXO)}\` · \`sensitivity\` · \`test <text>\` · \`odio add <term>\`_`,
          `_Panel del centinela: \`${citar("automod.sentinela.config", "es", PREFIXO)}\` · \`sensitivity\` · \`test <texto>\` · \`hate add <término>\`_`) : null,
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
        `**${nomeGrupo(grupo, "en")}** ${a1 === "on" ? "enabled 🟢" : "disabled 🔴"} — ${Object.keys(def.partes).length} part(s): ${Object.keys(def.partes).map((x) => `\`${nomeParte(x, "en")}\``).join(", ")}.`,
        `**${nomeGrupo(grupo, "en")}** ${a1 === "on" ? "activado 🟢" : "desactivado 🔴"} — ${Object.keys(def.partes).length} parte(s): ${Object.keys(def.partes).map((x) => `\`${nomeParte(x, "en")}\``).join(", ")}.`) });
    }
    if (a1 === "punicao" || a1 === "punição" || a1 === "punishment") {
      const modo = MODO_EN[args[2]?.toLowerCase()] ?? args[2]?.toLowerCase();
      const MODOS = ["avisar", "apagar", "confirmar", "acumular", "banir"];
      const herdar = ["herdar", "global", "null"].includes(modo);
      if (!herdar && !MODOS.includes(modo)) {
        return sendEmbed(message.channel, { title: T("❌ Modo inválido", "❌ Invalid mode", "❌ Modo no válido"), colour: COR.erro,
          description: `\`${citarInterno("automod", PREFIXO)} ${grupo} punicao <${MODOS.join("|")}|herdar>\`` });
      }
      for (const f of Object.values(def.partes)) {
        const mod = config.automod[MODULOS_AUTOMOD[f]] ??= {};
        mod.punicao = herdar ? null : { ...(mod.punicao ?? {}), modo, ...(modo === "acumular" && !mod.punicao?.warnsParaBan ? { warnsParaBan: 3 } : {}) };
      }
      salvarConfig();
      return sendEmbed(message.channel, { title: "🛡 AutoMod", colour: COR.sucesso, description: herdar
        ? T(`**${grupo}** agora herda a punição global.`, `**${grupo}** now inherits the global punishment.`, `**${nomeGrupo(grupo, "es")}** ahora hereda el castigo global.`)
        : T(`**${grupo}** agora usa a punição **\`${modo}\`** (todas as partes).`, `**${nomeGrupo(grupo, "en")}** now uses the **\`${nomeModo(modo, "en")}\`** punishment (all parts).`,
            `**${nomeGrupo(grupo, "es")}** ahora usa el castigo **\`${nomeModo(modo, "es")}\`** (todas las partes).`) });
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
    return sendEmbed(message.channel, { title: T("❌ Parte desconhecida", "❌ Unknown part", "❌ Parte desconocida"), colour: COR.erro,
      description: [
        parecida ? T(`Você quis dizer \`${citarInterno("automod", PREFIXO)} ${grupo} ${parecida}\`?`, `Did you mean \`${citarInterno("automod", PREFIXO)} ${grupo} ${parecida}\`?`,
          `¿Quisiste decir \`${citar("automod", "es", PREFIXO)} ${nomeGrupo(grupo, "en")} ${parecida}\`?`) + "\n" : null,
        `${T("Partes", "Parts", "Partes")} ${T("de", "of", "de")} \`${nomeGrupo(grupo, lang)}\`: ${Object.keys(def.partes).map((x) => `\`${nomeParte(x, lang)}\``).join(", ")}`,
        "",
        `\`${citarInterno("automod", PREFIXO)} ${grupo} on|off\` — ${T("o grupo inteiro", "the whole group", "el grupo entero")}`,
        `${T("Ex.:", "E.g.:", "Ej.:")} \`${citarInterno("automod", PREFIXO)} ${grupo} ${Object.keys(def.partes)[0]} off\` — ${T("só essa parte", "just that part", "solo esa parte")}`,
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
        { title: "🔒 Bot owner only", description: "Debug logs are **global** — they apply to every server Judy is in.", colour: COR.aviso },
        { title: "🔒 Solo el dueño del bot", description: "Los registros de depuración son **globales** — valen para todos los servidores de Judy.", colour: COR.aviso }));
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off")
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${citarInterno("automod.debug", PREFIXO)} <on|off>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${citarInterno("automod.debug", PREFIXO)} <on|off>\``, colour: COR.erro },
        { title: "❌ Uso incorrecto", description: `\`${citar("automod.debug", "es", PREFIXO)} <on|off>\``, colour: COR.erro }));
    cfgGlobal.debug = (v === "on");
    salvarGlobal();
    return sendEmbed(message.channel, { title: "🐛 Debug",
      description: tr(ctx,
        `Logs de depuração **${cfgGlobal.debug ? "ativados 🟢" : "desativados 🔴"}** (global).`,
        `Debug logs **${cfgGlobal.debug ? "enabled 🟢" : "disabled 🔴"}** (global).`,
        `Registros de depuración **${cfgGlobal.debug ? "activados 🟢" : "desactivados 🔴"}** (global).`),
      colour: COR.mod });
  }

  const modulos = MODULOS_AUTOMOD;


  if (!sub || sub === "status") {
    const linhas = Object.entries(GRUPOS_AUTOMOD).flatMap(([nome, def]) => {
      const st = estadoDoGrupo(config.automod, nome);
      const icone = st.ligadas === st.total ? "🟢" : st.ligadas ? "🟡" : "🔴";
      return [`${icone} **${nomeGrupo(nome, lang)}** — ${tr(ctx, def.pt, def.en, def.es)} · ${st.ligadas}/${st.total}`,
        `   ${st.partes.map((x) => `${x.ligada ? "✓" : "✗"} ${nomeParte(x.parte, lang)}`).join(" · ")}`];
    });
    linhas.push("", tr(ctx,
      `_Detalhes de um grupo: \`${citarInterno("automod", PREFIXO)} antispam\` · desligar um: \`${citarInterno("automod", PREFIXO)} antispam off\` · tudo: \`${citarInterno("automod", PREFIXO)} off\`_`,
      `_Details of one group: \`${citarInterno("automod", PREFIXO)} antispam\` · turn one off: \`${citarInterno("automod", PREFIXO)} antispam off\` · everything: \`${citarInterno("automod", PREFIXO)} off\`_`,
      `_Detalles de un grupo: \`${citar("automod", "es", PREFIXO)} antispam\` · desactivar uno: \`${citar("automod", "es", PREFIXO)} antispam off\` · todo: \`${citar("automod", "es", PREFIXO)} off\`_`));
    linhas.push(tr(ctx,
      `${cfgGlobal.debug !== false ? "🟢" : "🔴"} **debug (global)** — ${cfgGlobal.debug !== false ? "ativado" : "desativado"}`,
      `${cfgGlobal.debug !== false ? "🟢" : "🔴"} **debug (global)** — ${cfgGlobal.debug !== false ? "enabled" : "disabled"}`,
      `${cfgGlobal.debug !== false ? "🟢" : "🔴"} **debug (global)** — ${cfgGlobal.debug !== false ? "activado" : "desactivado"}`));
    return sendEmbed(message.channel, {
      title: tr(ctx, "🛡 Status do AutoMod", "🛡 AutoMod status", "🛡 Estado del AutoMod"),
      description: linhas.join("\n"), colour: COR.mod });
  }

  const chave = modulos[sub];
  if (!chave) {
    // Os nomes antigos (antiodio, anticaps…) continuam valendo, mas não se
    // ensinam mais: quem erra vê os QUATRO grupos, com exemplo pronto.
    const parecidoInterno = maisParecido(sub, [...Object.keys(G_AUTOMOD), ...Object.keys(G_AUTOMOD).map((g) => nomeGrupo(g, "en")), ...Object.keys(modulos), "on", "off", "blocklist", "whitelist", "punicao", "punishment"]);
    const parecido = parecidoInterno && lang === "en" ? nomeGrupo(parecidoInterno, "en") : parecidoInterno;
    return sendEmbed(message.channel, { title: tr(ctx, "❌ Não conheço esse", "❌ I don't know that one", "❌ No conozco ese"), colour: COR.erro,
      description: guiaDosGrupos(lang, PREFIXO, parecido
        ? tr(ctx, `Você quis dizer \`${citarInterno("automod", PREFIXO)} ${parecido}\`?`, `Did you mean \`${citarInterno("automod", PREFIXO)} ${parecido}\`?`,
            `¿Quisiste decir \`${citar("automod", "es", PREFIXO)} ${parecido}\`?`)
        : tr(ctx, `\`${String(sub).slice(0, 30)}\` não é um grupo. O automod tem quatro:`, `\`${String(sub).slice(0, 30)}\` isn't a group. The automod has four:`,
            `\`${String(sub).slice(0, 30)}\` no es un grupo. El automod tiene cuatro:`), ctx) });
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
    const linhas = [tr(ctx,
      `${mod.enabled ? "🟢 ativado" : "🔴 desativado"}`,
      `${mod.enabled ? "🟢 enabled" : "🔴 disabled"}`,
      `${mod.enabled ? "🟢 activado" : "🔴 desactivado"}`)];
    if (params) {
      linhas.push("", tr(ctx, "**Parâmetros:**", "**Parameters:**", "**Parámetros:**"));
      for (const [nome, ck] of Object.entries(params)) linhas.push(`• \`${nomeParam(nome, lang)}\` = ${mod[ck]}`);
    }
    const pm = mod.punicao?.modo;
    linhas.push("", tr(ctx,
      `**Punição:** ${pm ? `\`${pm}\` (própria)` : "_herda a global_ (`" + (config.automod.punicao?.modo ?? "avisar") + "`)"}`,
      `**Punishment:** ${pm ? `\`${pm}\` (its own)` : "_inherits the global one_ (`" + (config.automod.punicao?.modo ?? "avisar") + "`)"}`,
      `**Castigo:** ${pm ? `\`${nomeModo(pm, "es")}\` (propio)` : "_hereda el global_ (`" + nomeModo(config.automod.punicao?.modo ?? "avisar", "es") + "`)"}`));
    linhas.push("", tr(ctx, "**Como configurar:**", "**How to configure:**", "**Cómo configurarlo:**"),
      `\`${citarInterno("automod", PREFIXO)} ${sub} <on|off>\``,
      params ? `\`${citarInterno("automod", PREFIXO)} ${sub} set <${tr(ctx, "parâmetro", "parameter", "parámetro")}> <${tr(ctx, "valor", "value", "valor")}>\`` : null,
      `\`${citarInterno("automod", PREFIXO)} ${sub} punicao <${MODOS_PUN.join("|")}|herdar>\``,
      // O sentinela tem um painel próprio além do liga/desliga.
      sub === "sentinela" ? tr(ctx,
        `\n**Painel do sentinela:** \`${citarInterno("automod.sentinela.config", PREFIXO)}\` · \`sensitivity\` · \`antiguidade\` · \`alerta\` · \`test <texto>\` — detalhes em \`${PREFIXO}help automod sentinela\``,
        `\n**Sentinel panel:** \`${citarInterno("automod.sentinela.config", PREFIXO)}\` · \`sensitivity\` · \`antiguidade\` · \`alerta\` · \`test <text>\` — details in \`${PREFIXO}help automod sentinela\``,
        `\n**Panel del centinela:** \`${citar("automod.sentinela.config", "es", PREFIXO)}\` · \`sensitivity\` · \`tenure\` · \`alerts\` · \`test <texto>\` — detalles en \`${citar("help", "es", PREFIXO)} automod sentinel\``) : null,
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
      tr(ctx, `**Termos de fábrica:** ${TERMOS_ODIO.length} (ofensas inequívocas, PT e EN)`, `**Built-in terms:** ${TERMOS_ODIO.length} (unambiguous slurs, PT and EN)`,
        `**Términos de fábrica:** ${TERMOS_ODIO.length} (insultos inequívocos, PT y EN)`),
      `**${tr(ctx, "Acrescentados aqui", "Added here", "Añadidos aquí")}:** ${mod.termos.length ? mod.termos.map((x) => `\`${x}\``).join(", ") : "—"}`,
      "",
      tr(ctx, "_Os disfarces também são pegos: n.i.g.g.a, N1GG4, niiiigga._", "_Spelling tricks are caught too: n.i.g.g.a, N1GG4, niiiigga._",
        "_Los disfraces también se detectan: n.i.g.g.a, N1GG4, niiiigga._"),
    ].join("\n") });
  }

  // ── set <parâmetro> <valor> ──
  if (acao === "set") {
    const params = PARAMS[sub];
    if (!params)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Sem parâmetros", description: `O módulo \`${sub}\` não tem parâmetros ajustáveis.`, colour: COR.erro },
        { title: "❌ No parameters", description: `The \`${sub}\` module has no adjustable parameters.`, colour: COR.erro },
        { title: "❌ Sin parámetros", description: `El módulo \`${sub}\` no tiene parámetros ajustables.`, colour: COR.erro }));
    const nome = args[2]?.toLowerCase();
    const bruto = args[3];
    const ck = params[nome];
    if (!ck || bruto === undefined)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Uso incorreto", description: `\`${citarInterno("automod", PREFIXO)} ${sub} set <${Object.keys(params).join("|")}> <valor>\``, colour: COR.erro },
        { title: "❌ Wrong usage", description: `\`${citarInterno("automod", PREFIXO)} ${sub} set <${Object.keys(params).join("|")}> <value>\``, colour: COR.erro },
        { title: "❌ Uso incorrecto", description: `\`${citar("automod", "es", PREFIXO)} ${nomeGrupo(sub, "en")} set <${Object.keys(params).map((p) => nomeParam(p, "en")).join("|")}> <valor>\``, colour: COR.erro }));
    // 'ignorar' é texto (letras a ignorar, ex.: "k"); os demais são numéricos.
    if (ck === "ignorar") {
      mod[ck] = String(bruto).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
      salvarConfig();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🛡 Parâmetro atualizado",
          description: `\`${sub}.${nome}\` = **"${mod[ck]}"** (letras ignoradas na repetição)`, colour: COR.sucesso },
        { title: "🛡 Parameter updated",
          description: `\`${sub}.${nomeParam(nome, "en")}\` = **"${mod[ck]}"** (letters ignored in repetition)`, colour: COR.sucesso },
        { title: "🛡 Parámetro actualizado",
          description: `\`${sub}.${nomeParam(nome, "en")}\` = **"${mod[ck]}"** (letras ignoradas en la repetición)`, colour: COR.sucesso }));
    }
    let valor = Number(bruto);
    if (Number.isNaN(valor) || valor < 0)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Valor inválido", description: "O valor precisa ser um número positivo.", colour: COR.erro },
        { title: "❌ Invalid value", description: "The value must be a positive number.", colour: COR.erro },
        { title: "❌ Valor no válido", description: "El valor tiene que ser un número positivo.", colour: COR.erro }));
    // limiar/zalgo aceitam 0–1 (fração) ou 0–100 (porcentagem)
    if ((ck === "threshold" || ck === "limiteZalgo") && valor > 1) valor = valor / 100;
    mod[ck] = valor;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛡 Parâmetro atualizado", description: `\`${sub}.${nome}\` = **${valor}**`, colour: COR.sucesso },
      { title: "🛡 Parameter updated", description: `\`${sub}.${nomeParam(nome, "en")}\` = **${valor}**`, colour: COR.sucesso },
      { title: "🛡 Parámetro actualizado", description: `\`${sub}.${nomeParam(nome, "en")}\` = **${valor}**`, colour: COR.sucesso }));
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
          description: `\`${sub}\` now **inherits the server's global punishment**.`, colour: COR.sucesso },
        { title: "🛡 Castigo del módulo",
          description: `\`${sub}\` ahora **hereda el castigo global** del servidor.`, colour: COR.sucesso }));
    }
    if (!MODOS_PUN.includes(modo))
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Modo inválido",
        description: `Modos: ${MODOS_PUN.map((m) => `\`${m}\``).join(", ")}, ou \`herdar\`.\n\n`
          + "• `avisar` — só avisa, não pune (filtro de regra fixa ainda apaga; o sentinela não)\n• `apagar` — só remove a mensagem\n• `confirmar` — silencia e espera mod\n• `acumular` — soma avisos até banir\n• `banir` — ban imediato",
        colour: COR.erro,
      }, {
        title: "❌ Invalid mode",
        description: `Modes: ${MODOS_PUN.map((m) => `\`${nomeModo(m, "es")}\``).join(", ")}, or \`inherit\`.\n\n`
          + "• `warn` — warn only, no punishment (fixed-rule filters still delete; the sentinel doesn't)\n• `delete` — remove the message only\n• `confirm` — silence and wait for a mod\n• `stack` — stack warnings until a ban\n• `ban` — instant ban",
        colour: COR.erro,
      }, {
        title: "❌ Modo no válido",
        description: `Modos: ${MODOS_PUN.map((m) => `\`${nomeModo(m, "es")}\``).join(", ")}, o \`inherit\`.\n\n`
          + "• `warn` — solo avisa, no castiga (los filtros de regla fija igual borran; el centinela no)\n• `delete` — solo borra el mensaje\n• `confirm` — silencia y espera a un mod\n• `stack` — acumula avisos hasta el ban\n• `ban` — ban inmediato",
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
        colour: COR.sucesso },
      { title: "🛡 Castigo del módulo",
        description: `\`${sub}\` ahora usa el castigo **\`${nomeModo(modo, "es")}\`** (propio, independiente del global).`,
        colour: COR.sucesso }));
  }

  // ── on | off ──
  const novoEstado = acao;
  if (novoEstado !== "on" && novoEstado !== "off")
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Uso incorreto",
      description: [
        `\`${citarInterno("automod", PREFIXO)} ${sub} <on|off>\``,
        PARAMS[sub] ? `\`${citarInterno("automod", PREFIXO)} ${sub} set <parâmetro> <valor>\`` : null,
        `\`${citarInterno("automod", PREFIXO)} ${sub} punicao <modo>\``,
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: [
        `\`${citarInterno("automod", PREFIXO)} ${sub} <on|off>\``,
        PARAMS[sub] ? `\`${citarInterno("automod", PREFIXO)} ${sub} set <parameter> <value>\`` : null,
        `\`${citarInterno("automod", PREFIXO)} ${sub} punicao <mode>\``,
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }, {
      title: "❌ Uso incorrecto",
      description: [
        `\`${citar("automod", "es", PREFIXO)} ${nomeGrupo(sub, "en")} <on|off>\``,
        PARAMS[sub] ? `\`${citar("automod", "es", PREFIXO)} ${nomeGrupo(sub, "en")} set <parámetro> <valor>\`` : null,
        `\`${citar("automod", "es", PREFIXO)} ${nomeGrupo(sub, "en")} punishment <modo>\``,
      ].filter(Boolean).join("\n"), colour: COR.erro,
    }));

  config.automod[chave].enabled = (novoEstado === "on");
  salvarConfig();
  return sendEmbed(message.channel, tr(ctx,
    { title: "🛡 AutoMod atualizado",
      description: `**${sub}** foi **${novoEstado === "on" ? "ativado 🟢" : "desativado 🔴"}**.`, colour: COR.mod },
    { title: "🛡 AutoMod updated",
      description: `**${sub}** was **${novoEstado === "on" ? "enabled 🟢" : "disabled 🔴"}**.`, colour: COR.mod },
    { title: "🛡 AutoMod actualizado",
      description: `**${sub}** fue **${novoEstado === "on" ? "activado 🟢" : "desactivado 🔴"}**.`, colour: COR.mod }));
  }

  // ── &automod sentinela assuntos … (temas proibidos pela regra) ──────────
  async function painelAssuntos(mod, a) {
    const T = (pt, eng, es) => tr(ctx, pt, eng, es);
    const P = PREFIXO, base = `${citarInterno("automod.sentinela.assuntos", P)}`;
    mod.acoes ??= {}; mod.termos ??= {}; mod.canaisLiberados ??= [];
    const op = a[0]?.toLowerCase();
    const ROT_ACAO = { off: T("desligado", "off", "desactivado"), alertar: T("só alerta a staff", "alerts staff only", "solo alerta al staff"), apagar: T("apaga a mensagem", "deletes the message", "borra el mensaje"), punir: T("apaga e pune (escada)", "deletes and punishes (ladder)", "borra y castiga (escalera)") };
    const SENS_ROT = { baixa: T("baixa", "low", "baja"), media: T("média", "medium", "media"), alta: T("alta", "high", "alta") };
    const sensAtual = assuntos.sensibilidadeValida(mod.sensibilidade) ?? "media";
    const painel = (titulo = null) => sendEmbed(message.channel, { title: titulo ?? `🛡️ ${T("Temas proibidos", "Forbidden topics", "Temas prohibidos")}`, colour: COR.mod, description: [
      T("Cada mensagem ganha uma **nota de 0 a 10** por tema: termos com peso, sinais de debate e de ataque, e o **contexto** do canal sobem; \"kkkk\", emoji de riso e \"zoeira\" amenizam. Passou do limiar, a IA confirma se é **discussão de verdade** ou zoeira.",
        "Each message gets a **0–10 score** per topic: weighted terms, debate and attack signals, and the channel's **context** raise it; \"lol\", laughing emoji and \"joking\" soften it. Above the threshold, the AI confirms whether it's a **real discussion** or banter.",
        "Cada mensaje recibe una **nota de 0 a 10** por tema: los términos con peso, las señales de debate y de ataque, y el **contexto** del canal la suben; \"jajaja\", el emoji de risa y \"broma\" la suavizan. Si pasa del umbral, la IA confirma si es una **discusión de verdad** o una broma."),
      "",
      `**${T("Chave geral", "Master switch", "Interruptor general")}:** ${mod.enabled ? T("🟢 ligada", "🟢 on", "🟢 activado") : T("🔴 desligada", "🔴 off", "🔴 desactivado")}`,
      `**${T("Sensibilidade", "Sensitivity", "Sensibilidad")}:** ${SENS_ROT[sensAtual]} (${T("limiar", "threshold", "umbral")} ${assuntos.limiarDoAssunto(mod)}/10) · **${T("IA", "AI", "IA")}:** ${mod.ia === false ? T("🔴 desligada — a nota decide sozinha", "🔴 off — the score decides alone", "🔴 desactivada — la nota decide sola") : T("🟢 confirma", "🟢 confirms", "🟢 confirma")}`,
      ...assuntos.NOMES_TEMAS.map((t) => {
        const ac = assuntos.acaoDoTema(mod, t), d = assuntos.TEMAS[t];
        const extras = (mod.termos[t] ?? []).length;
        return `${d.emoji} \`${nomeTema(t, lang)}\` — **${nomeAcaoTema(ac, lang)}** · ${ROT_ACAO[ac]}${extras ? T(` · +${extras} termo(s) daqui`, ` · +${extras} term(s) of yours`, ` · +${extras} término(s) tuyos`) : ""}`;
      }),
      `**${T("Canais liberados", "Allowed channels", "Canales permitidos")}:** ${mod.canaisLiberados.length ? mod.canaisLiberados.map((c) => `<#${c}>`).join(" ") : "—"}`,
      `**${T("Punição do `punir`", "Punishment of `punish`", "Castigo de `punish`")}:** \`${nomeModo(mod.punicao?.modo ?? "acumular", lang)}\``,
      "",
      `\`${base} <${assuntos.NOMES_TEMAS.join("|")}> <off|alertar|apagar|punir>\``,   // a tela em inglês traduz (família automod.assuntos)
      `\`${base} <${T("tema", "topic", "tema")}> add|remover <${T("termo", "term", "término")}>\` — ${T("palavras a mais (peso de nome: 2,5)", "extra words (name weight: 2.5)", "palabras de más (peso de nombre: 2,5)")}`,
      `\`${base} liberar|vigiar <#${T("canal", "channel", "canal")}|aqui>\` — ${T("um canal onde o tema pode (ex.: #debate)", "a channel where the topic is fine (e.g. #debate)", "un canal donde el tema está permitido (ej.: #debate)")}`,
      `\`${base} sensibilidade <baixa|media|alta>\` · \`${base} ia on|off\``,
      `\`${base} test <${T("texto", "text", "texto")}>\` — ${T("a nota de cada tema, sem punir", "each topic's score, without punishing", "la nota de cada tema, sin castigar")}`,
      `\`${base} on|off\` · \`${base} punicao <${T("modo", "mode", "modo")}>\``,
      T("_Alertas vão para o canal do sentinela (ou o de log)._", "_Alerts go to the sentinel channel (or the log channel)._", "_Las alertas van al canal del centinela (o al de registro)._"),
    ].join("\n") });

    if (!op || op === "status" || op === "config") return painel();
    if (op === "on" || op === "off") {
      mod.enabled = op === "on"; salvarConfig();
      const nenhum = op === "on" && !assuntos.temasAtivos(mod).length;
      return painel(op === "on" ? (nenhum ? T("🟡 Ligado — falta escolher os temas", "🟡 On — now pick the topics", "🟡 Activado — ahora elige los temas") : T("🟢 Temas proibidos ligados", "🟢 Forbidden topics on", "🟢 Temas prohibidos activados")) : T("🔴 Temas proibidos desligados", "🔴 Forbidden topics off", "🔴 Temas prohibidos desactivados"));
    }
    if (["sensibilidade", "sensitivity", "sens"].includes(op)) {
      const nova = assuntos.sensibilidadeValida(a[1]);
      if (!nova) return sendEmbed(message.channel, { title: T("❌ Sensibilidade inválida", "❌ Invalid sensitivity", "❌ Sensibilidad no válida"), colour: COR.erro,
        description: Object.entries(assuntos.LIMIAR_ASSUNTO).map(([k, v]) => `• \`${nomeSens(k, lang)}\` — ${T("age a partir de", "acts from", "actúa a partir de")} ${v}/10`).join("\n") });
      mod.sensibilidade = nova; salvarConfig();
      return painel(`🛡️ ${T("Sensibilidade", "Sensitivity", "Sensibilidad")} → ${SENS_ROT[nova]} (${assuntos.LIMIAR_ASSUNTO[nova]}/10)`);
    }
    if (op === "ia" || op === "ai") {
      const v = a[1]?.toLowerCase();
      if (v !== "on" && v !== "off") return sendEmbed(message.channel, { title: T("❌ Uso", "❌ Usage", "❌ Uso"), colour: COR.erro, description: `\`${base} ia on|off\`` });
      mod.ia = v === "on"; salvarConfig();
      return painel(mod.ia ? T("🟢 A IA confirma antes de agir", "🟢 The AI confirms before acting", "🟢 La IA confirma antes de actuar") : T("🔴 Sem IA: a nota decide sozinha", "🔴 No AI: the score decides alone", "🔴 Sin IA: la nota decide sola"));
    }
    if (op === "test" || op === "testar" || op === "teste") {
      const texto = a.slice(1).join(" ").trim();
      if (!texto) return sendEmbed(message.channel, { title: T("❌ Uso", "❌ Usage", "❌ Uso"), colour: COR.erro, description: `\`${base} test <${T("texto", "text", "texto")}>\`` });
      const notas = assuntos.analisarAssuntos(texto, mod, { canalId: message.channelId, autor: message.authorId, todos: true });
      return sendEmbed(message.channel, { title: `🧪 ${T("Nota por tema", "Score per topic", "Nota por tema")}`, colour: COR.mod, description: [
        ...notas.map((n) => `${assuntos.TEMAS[n.tema].emoji} \`${nomeTema(n.tema, lang)}\` — **${n.nota}/10** ${n.passou ? "⚠️" : "·"} ${assuntos.acaoDoTema(mod, n.tema) === "off" ? T("_(tema desligado)_", "_(topic off)_", "_(tema desactivado)_") : ""}${n.sinais.length ? `\n   ${n.sinais.join(", ")}` : ""}`),
        "",
        T(`_Limiar ${assuntos.limiarDoAssunto(mod)}/10; o contexto é o deste canal. ${mod.ia === false ? "Sem IA, passar do limiar já age." : "Passando do limiar, a IA ainda confirma."} Ninguém foi punido._`,
          `_Threshold ${assuntos.limiarDoAssunto(mod)}/10; context is this channel's. ${mod.ia === false ? "Without AI, crossing it already acts." : "Crossing it, the AI still confirms."} Nobody was punished._`,
          `_Umbral ${assuntos.limiarDoAssunto(mod)}/10; el contexto es el de este canal. ${mod.ia === false ? "Sin IA, pasar el umbral ya actúa." : "Si pasa el umbral, la IA aún confirma."} No se castigó a nadie._`),
      ].join("\n") });
    }
    if (["liberar", "allow", "vigiar", "watch"].includes(op)) {
      // 17 out 2026: o ID ia para minúsculas antes de conferir — `<#canal>` de
      // verdade dava "canal de outro servidor"; e `#nome` nem era procurado.
      const bruto = String(a[1] ?? "");
      const canal = resolverCanal(bruto, { message, server });
      if (!canal) return sendEmbed(message.channel, { title: T("❌ Canal não encontrado", "❌ Channel not found", "❌ Canal no encontrado"), colour: COR.erro,
        description: T(`Não achei o canal \`${bruto}\` neste servidor. Use \`#canal\`, o ID ou \`aqui\`.`, `I couldn't find the \`${bruto}\` channel on this server. Use \`#channel\`, the ID or \`here\`.`,
          `No encontré el canal \`${bruto}\` en este servidor. Usa \`#canal\`, el ID o \`here\`.`) });
      const dele = server?.channelIds ? (server.channelIds.has?.(canal) ?? true) : true;
      if (!dele) return sendEmbed(message.channel, { title: T("❌ Canal de outro servidor", "❌ Channel from another server", "❌ Canal de otro servidor"), colour: COR.erro, description: `\`${canal}\`` });
      const liberar = op === "liberar" || op === "allow";
      mod.canaisLiberados = liberar ? [...new Set([...mod.canaisLiberados, canal])] : mod.canaisLiberados.filter((c) => c !== canal);
      salvarConfig();
      return painel(liberar ? T(`✅ <#${canal}> liberado: os temas podem lá`, `✅ <#${canal}> allowed: topics are fine there`, `✅ <#${canal}> permitido: ahí los temas están bien`) : T(`✅ <#${canal}> vigiado de novo`, `✅ <#${canal}> watched again`, `✅ <#${canal}> vigilado de nuevo`));
    }
    const tema = assuntos.temaValido(op);
    if (!tema) {
      return sendEmbed(message.channel, { title: T("❌ Tema desconhecido", "❌ Unknown topic", "❌ Tema desconocido"), colour: COR.erro,
        description: `${T("Temas", "Topics", "Temas")}: ${assuntos.NOMES_TEMAS.map((t) => `\`${t}\``).join(", ")}\n${T("Ex.:", "E.g.:", "Ej.:")} \`${base} politica apagar\`` });
    }
    const op2 = a[1]?.toLowerCase();
    if (["add", "adicionar", "remover", "remove", "tirar"].includes(op2)) {
      const termo = a.slice(2).join(" ").trim().toLowerCase().slice(0, 60);
      if (!termo) return sendEmbed(message.channel, { title: T("❌ Falta o termo", "❌ Missing term", "❌ Falta el término"), colour: COR.erro, description: `\`${base} ${tema} ${op2} <${T("termo", "term", "término")}>\`` });
      const lista = mod.termos[tema] ?? [];
      mod.termos[tema] = ["add", "adicionar"].includes(op2) ? [...new Set([...lista, termo])] : lista.filter((x) => x !== termo);
      salvarConfig();
      return painel(T(`✅ ${tema}: ${mod.termos[tema].length} termo(s) daqui`, `✅ ${tema}: ${mod.termos[tema].length} term(s) of yours`, `✅ ${nomeTema(tema, "en")}: ${mod.termos[tema].length} término(s) tuyos`));
    }
    const nova = assuntos.acaoValida(op2);
    if (!nova) {
      return sendEmbed(message.channel, { title: T("❌ Ação inválida", "❌ Invalid action", "❌ Acción no válida"), colour: COR.erro, description: [
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
    const T = (pt, eng, es) => tr(ctx, pt, eng, es);
    const P = PREFIXO, base = `${citarInterno("automod.sentinela.avatar", P)}`;
    const op = a[0]?.toLowerCase();
    const ROT = { alertar: T("só alerta a staff", "alerts staff only", "solo alerta al staff"), silenciar: T("silencia (timeout) e alerta", "silences (timeout) and alerts", "silencia (timeout) y alerta"), expulsar: T("expulsa e alerta", "kicks and alerts", "expulsa y alerta"), banir: T("bane e alerta", "bans and alerts", "banea y alerta") };
    const painel = (titulo = null) => sendEmbed(message.channel, { title: titulo ?? `🖼️ ${T("Foto de perfil", "Profile picture", "Foto de perfil")}`, colour: COR.mod, description: [
      T("A foto de quem **entra** e de quem **troca** passa pelo modelo de visão. Apita com genitália, ato sexual ou pornografia descritos — ou nudez, gore e símbolo de ódio com o voto de risco do modelo.",
        "The picture of whoever **joins** or **changes** it goes through the vision model. It flags genitals, sex acts or porn described — or nudity, gore and hate symbols with the model's risk vote.",
        "La foto de quien **entra** y de quien la **cambia** pasa por el modelo de visión. Salta con genitales, actos sexuales o pornografía descritos — o con desnudez, gore y símbolos de odio con el voto de riesgo del modelo."),
      "",
      `**${T("Estado", "State", "Estado")}:** ${mod.enabled !== false ? T("🟢 ligado", "🟢 on", "🟢 activado") : T("🔴 desligado", "🔴 off", "🔴 desactivado")}${process.env.IA_SERVICO_URL ? "" : T(" · ⚠️ sem IA_SERVICO_URL: não analisa", " · ⚠️ no IA_SERVICO_URL: nothing is analysed", " · ⚠️ sin IA_SERVICO_URL: no se analiza nada")}`,
      `**${T("Ação", "Action", "Acción")}:** \`${nomeAcaoAvatar(avatar.acaoDoAvatar(mod), lang)}\` — ${ROT[avatar.acaoDoAvatar(mod)]}`,
      avatar.acaoDoAvatar(mod) === "silenciar" ? `**${T("Tempo", "Time", "Tiempo")}:** ${duracaoTexto(avatar.tempoDoAvatar(mod), lang)}` : null,
      "",
      `\`${base} on|off\``,
      `\`${base} acao <alertar|silenciar|expulsar|banir>\``,
      `\`${base} tempo <24h|2d|…>\` — ${T("quanto dura o silêncio", "how long the silence lasts", "cuánto dura el silencio")}`,
      `\`${base} checar <@${T("pessoa", "person", "usuario")}>\` — ${T("analisa a foto agora, sem punir", "analyses the picture now, without punishing", "analiza la foto ahora, sin castigar")}`,
      T("_Staff, dono e bots não passam pela checagem. A foto nunca é republicada no alerta._", "_Staff, owner and bots are skipped. The picture is never reposted in the alert._",
        "_El staff, el dueño y los bots no pasan por la revisión. La foto nunca se vuelve a publicar en la alerta._"),
    ].filter((x) => x !== null).join("\n") });

    if (!op || op === "status" || op === "config") return painel();
    if (op === "on" || op === "off") { mod.enabled = op === "on"; salvarConfig(); return painel(); }
    if (op === "acao" || op === "ação" || op === "action") {
      const nova = avatar.acaoAvatarValida(a[1]);
      if (!nova) return sendEmbed(message.channel, { title: T("❌ Ação inválida", "❌ Invalid action", "❌ Acción no válida"), colour: COR.erro,
        description: [`\`${base} acao <alertar|silenciar|expulsar|banir>\``, "", ...avatar.ACOES_AVATAR.map((x) => `• \`${nomeAcaoAvatar(x, lang)}\` — ${ROT[x]}`)].join("\n") });
      mod.acao = nova; salvarConfig();
      return painel(`🖼️ ${T("Ação", "Action", "Acción")} → ${nomeAcaoAvatar(nova, lang)}`);
    }
    if (op === "tempo" || op === "time") {
      const ms = lerDuracao(a[1]);
      if (!ms) return sendEmbed(message.channel, { title: T("❌ Tempo inválido", "❌ Invalid time", "❌ Tiempo no válido"), colour: COR.erro, description: `\`${base} tempo 24h\` · \`2d\` · \`30m\`` });
      mod.tempo = String(a[1]).toLowerCase(); salvarConfig();
      return painel(`🖼️ ${T("Tempo", "Time", "Tiempo")} → ${duracaoTexto(avatar.tempoDoAvatar(mod), lang)}`);
    }
    if (op === "checar" || op === "check" || op === "testar" || op === "test") {
      const uid = await resolverUsuario(a.slice(1).join(" "), { message, server, client: ctx.client }).catch(() => null);
      if (!uid) return sendEmbed(message.channel, { title: T("❌ De quem?", "❌ Whose?", "❌ ¿De quién?"), colour: COR.erro, description: `\`${base} checar @${T("pessoa", "person", "usuario")}\`` });
      const membro = await server?.fetchMember?.(uid).catch(() => null);
      const user = membro?.user ?? await ctx.client?.users?.fetch?.(uid).catch(() => null);
      const arq = avatar.arquivoDe(membro?.avatar) ?? avatar.arquivoDe(user?.avatar);
      if (!arq) return sendEmbed(message.channel, { title: T("🖼️ Sem foto", "🖼️ No picture", "🖼️ Sin foto"), colour: COR.mod, description: T(`<@${uid}> não tem foto de perfil.`, `<@${uid}> has no profile picture.`, `<@${uid}> no tiene foto de perfil.`) });
      if (!process.env.IA_SERVICO_URL) return sendEmbed(message.channel, { title: T("⚠️ Sem modelo de visão", "⚠️ No vision model", "⚠️ Sin modelo de visión"), colour: COR.aviso, description: T("Falta `IA_SERVICO_URL` no `.env`.", "`IA_SERVICO_URL` is missing from `.env`.", "Falta `IA_SERVICO_URL` en el `.env`.") });
      const r = await avatar.analisarFoto(arq);
      if (!r) return sendEmbed(message.channel, { title: T("⚠️ Não consegui analisar", "⚠️ Couldn't analyse it", "⚠️ No pude analizarla"), colour: COR.aviso, description: T("O modelo de visão não respondeu — veja o log do container.", "The vision model didn't answer — check the container log.", "El modelo de visión no respondió — revisa el log del contenedor.") });
      return sendEmbed(message.channel, { title: r.apitou ? T("🖼️ Apitaria", "🖼️ Would flag", "🖼️ Saltaría") : T("🖼️ Passaria", "🖼️ Would pass", "🖼️ Pasaría"), colour: r.apitou ? COR.aviso : COR.sucesso, description: [
        `<@${uid}>${r.apitou ? ` · **${T("Sinais", "Signals", "Señales")}:** ${r.motivos.join(", ")}` : ""}`,
        `> ${r.descricao.replace(/\n+/g, " ").slice(0, 400)}`,
        T("_Só checagem: ninguém foi punido._", "_Check only: nobody was punished._", "_Solo revisión: no se castigó a nadie._"),
      ].join("\n") });
    }
    const parecida = maisParecido(op, ["on", "off", "acao", "tempo", "checar"]);
    return sendEmbed(message.channel, { title: T("❌ Não conheço esse", "❌ I don't know that one", "❌ No conozco ese"), colour: COR.erro,
      description: `${parecida ? T(`Você quis dizer \`${base} ${parecida}\`?\n\n`, `Did you mean \`${base} ${parecida}\`?\n\n`,
        `¿Quisiste decir \`${citar("automod.sentinela.avatar", "es", P)} ${{ acao: "action", tempo: "time", checar: "check" }[parecida] ?? parecida}\`?\n\n`) : ""}\`${base} on|off\` · \`acao\` · \`tempo\` · \`checar\`` });
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
    if (!arg || !/^https?:\/\//.test(arg))
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Uso incorreto",
        description: `\`${citarInterno("automod", PREFIXO)} blocklist add <url>\`\nPara um único domínio use \`${citarInterno("automod", PREFIXO)} blocklist adddomain <domínio>\``,
        colour: COR.erro,
      }, {
        title: "❌ Wrong usage",
        description: `\`${citarInterno("automod", PREFIXO)} blocklist add <url>\`\nFor a single domain use \`${citarInterno("automod", PREFIXO)} blocklist adddomain <domain>\``,
        colour: COR.erro,
      }, {
        title: "❌ Uso incorrecto",
        description: `\`${citar("automod", "es", PREFIXO)} blocklist add <url>\`\nPara un solo dominio usa \`${citar("automod", "es", PREFIXO)} blocklist adddomain <dominio>\``,
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
    await rebuildBlocklist(ctx);
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
    if (!cfgGlobal.linkBlocklistManual.includes(dominio)) {
      cfgGlobal.linkBlocklistManual.push(dominio);
      salvarGlobal();
      await rebuildBlocklist(ctx);
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
    await rebuildBlocklist(ctx);
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
    await rebuildBlocklist(ctx);
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
    await rebuildBlocklist(ctx);
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
    return sendEmbed(message.channel, tr(ctx, {
      title: "🛡 Sentinela — moderação por julgamento",
      colour: COR.mod,
      description: [
        "Pesa o *conteúdo* e dá uma nota de suspeita. Diferente dos outros",
        "módulos — que medem coisas exatas, como caixa alta ou ritmo de mensagem —",
        "este **julga**, e por isso se adapta a quem está escrevendo.",
        "",
        `**Ativado:** ${cfg.enabled ? "🟢 sim" : "🔴 não"}  (ligue com \`${citarInterno("automod.sentinela", PREFIXO)} on\`)`,
        `**Sensibilidade:** ${cfg.sensitivity}  (limiar base: ${limiarDe(cfg.sensitivity)}/10)`,
        `**Mais rígido com quem chegou agora:** ${cfg.porAntiguidade !== false ? "🟢 ligado" : "🔴 desligado"} — o limiar acompanha o nível do membro`,
        `**Avisar a staff:** ${cfg.alertarAdmin !== false ? "🟢 ligado" : "🔴 desligado"} — marca a staff diante de um *padrão* suspeito, antes de punir`,
        `**Canal de aviso:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(usa o canal da mensagem)_"}`,
        `**Punição:** definida em \`${citarInterno("automod.punicao", PREFIXO)}\` (modo atual: **${pol.modo}**) — vale para todos os automods`,
        "",
        "**Comandos:**",
        `\`${citarInterno("automod.sentinela.sensibilidade", PREFIXO)} <baixa|media|alta>\``,
        `\`${citarInterno("automod.sentinela.antiguidade", PREFIXO)} on|off\` · \`${citarInterno("automod.sentinela.alerta", PREFIXO)} on|off\``,
        `\`${citarInterno("automod.sentinela.canal", PREFIXO)} <#canal|aqui>\``,
        `\`${citarInterno("automod.sentinela.testar", PREFIXO)} <texto>\` · \`${citarInterno("automod.sentinela.simular", PREFIXO)} <texto>\``,
        `\`${citarInterno("automod.sentinela.banir", PREFIXO)} <@pessoa|id>\` · \`${citarInterno("automod.sentinela.liberar", PREFIXO)} <@pessoa|id>\``,
      ].join("\n"),
    }, {
      title: "🛡 Sentinel — judgement-based moderation",
      colour: COR.mod,
      description: [
        "Weighs the *content* and gives it a suspicion score. Unlike the other",
        "modules — which measure exact things like caps or message rate — this one",
        "**judges**, so it adapts to who is writing.",
        "",
        `**Enabled:** ${cfg.enabled ? "🟢 yes" : "🔴 no"}  (enable with \`${citarInterno("automod.sentinela", PREFIXO)} on\`)`,
        `**Sensitivity:** ${nomeSens(cfg.sensitivity, "en")}  (base threshold: ${limiarDe(cfg.sensitivity)}/10)`,
        `**Stricter with newcomers:** ${cfg.porAntiguidade !== false ? "🟢 on" : "🔴 off"} — threshold moves with the member's level`,
        `**Alert the staff:** ${cfg.alertarAdmin !== false ? "🟢 on" : "🔴 off"} — pings staff on a suspicious *pattern*, before punishing`,
        `**Alert channel:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(uses the message's channel)_"}`,
        `**Punishment:** set with \`${citarInterno("automod.punicao", PREFIXO)}\` (current mode: **${nomeModo(pol.modo, "en")}**) — applies to all automods`,
        "",
        "**Commands:**",
        `\`${citarInterno("automod.sentinela.sensibilidade", PREFIXO)} <low|medium|high>\``,
        `\`${citarInterno("automod.sentinela.antiguidade", PREFIXO)} on|off\` · \`${citarInterno("automod.sentinela.alerta", PREFIXO)} on|off\``,
        `\`${citarInterno("automod.sentinela.canal", PREFIXO)} <#channel|here>\``,
        `\`${citarInterno("automod.sentinela.testar", PREFIXO)} <text>\` · \`${citarInterno("automod.sentinela.simular", PREFIXO)} <text>\``,
        `\`${citarInterno("automod.sentinela.banir", PREFIXO)} <@user|id>\` · \`${citarInterno("automod.sentinela.liberar", PREFIXO)} <@user|id>\``,
      ].join("\n"),
    }, {
      title: "🛡 Centinela — moderación por criterio",
      colour: COR.mod,
      description: [
        "Pesa el *contenido* y le da una nota de sospecha. A diferencia de los otros",
        "módulos — que miden cosas exactas, como mayúsculas o ritmo de mensajes —",
        "este **juzga**, y por eso se adapta a quien está escribiendo.",
        "",
        `**Activado:** ${cfg.enabled ? "🟢 sí" : "🔴 no"}  (actívalo con \`${citar("automod.sentinela", "es", PREFIXO)} on\`)`,
        `**Sensibilidad:** ${nomeSens(cfg.sensitivity, "en")}  (umbral base: ${limiarDe(cfg.sensitivity)}/10)`,
        `**Más estricto con los recién llegados:** ${cfg.porAntiguidade !== false ? "🟢 activado" : "🔴 desactivado"} — el umbral sigue el nivel del miembro`,
        `**Avisar al staff:** ${cfg.alertarAdmin !== false ? "🟢 activado" : "🔴 desactivado"} — menciona al staff ante un *patrón* sospechoso, antes de castigar`,
        `**Canal de aviso:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(usa el canal del mensaje)_"}`,
        `**Castigo:** se define en \`${citar("automod.punicao", "es", PREFIXO)}\` (modo actual: **${nomeModo(pol.modo, "es")}**) — vale para todos los automods`,
        "",
        "**Comandos:**",
        `\`${citar("automod.sentinela.sensibilidade", "es", PREFIXO)} <low|medium|high>\``,
        `\`${citar("automod.sentinela.antiguidade", "es", PREFIXO)} on|off\` · \`${citar("automod.sentinela.alerta", "es", PREFIXO)} on|off\``,
        `\`${citar("automod.sentinela.canal", "es", PREFIXO)} <#canal|here>\``,
        `\`${citar("automod.sentinela.testar", "es", PREFIXO)} <texto>\` · \`${citar("automod.sentinela.simular", "es", PREFIXO)} <texto>\``,
        `\`${citar("automod.sentinela.banir", "es", PREFIXO)} <@usuario|id>\` · \`${citar("automod.sentinela.liberar", "es", PREFIXO)} <@usuario|id>\``,
      ].join("\n"),
    }));
  }

  if (["on", "off", "ligar", "desligar", "enable", "disable"].includes(sub)) {
    const ligar = ["on", "ligar", "enable"].includes(sub);
    cfg.enabled = ligar;
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🛡 Sentinela", description: `O Sentinela foi **${ligar ? "ativado 🟢" : "desativado 🔴"}**.${ligar ? `\n\nSensibilidade: \`${cfg.sensitivity ?? "media"}\` · punição: a do \`${citarInterno("automod.punicao", PREFIXO)}\`.` : ""}`, colour: COR.mod },
      { title: "🛡 Sentinel", description: `The Sentinel was **${ligar ? "enabled 🟢" : "disabled 🔴"}**.${ligar ? `\n\nSensitivity: \`${nomeSens(cfg.sensitivity ?? "media", "en")}\` · punishment: the one from \`${citarInterno("automod.punicao", PREFIXO)}\`.` : ""}`, colour: COR.mod },
      { title: "🛡 Centinela", description: `El Centinela fue **${ligar ? "activado 🟢" : "desactivado 🔴"}**.${ligar ? `\n\nSensibilidad: \`${nomeSens(cfg.sensitivity ?? "media", "en")}\` · castigo: el de \`${citar("automod.punicao", "es", PREFIXO)}\`.` : ""}`, colour: COR.mod }));
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
        { title: "✅ Canal de aviso", description: "Sem canal próprio: os avisos vão para o canal de logs (ou o da mensagem).", colour: COR.sucesso },
        { title: "✅ Alert channel", description: "No channel of its own: alerts go to the log channel (or the message's channel).", colour: COR.sucesso },
        { title: "✅ Canal de aviso", description: "Sin canal propio: los avisos van al canal de registro (o al del mensaje).", colour: COR.sucesso }));
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

  if (sub === "ban") {
    const uid = (val ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
    if (!uid) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${citarInterno("automod.sentinela.banir", PREFIXO)} <@pessoa|id>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${citarInterno("automod.sentinela.banir", PREFIXO)} <@user|id>\``, colour: COR.erro },
      { title: "❌ Uso", description: `\`${citar("automod.sentinela.banir", "es", PREFIXO)} <@usuario|id>\``, colour: COR.erro }));
    try {
      await banir(server, uid, { reason: "[AutoMod] Confirmado por moderador" });
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔨 Banido", description: `<@${uid}> foi banido (confirmado).`, colour: COR.erro },
        { title: "🔨 Banned", description: `<@${uid}> was banned (confirmed).`, colour: COR.erro },
        { title: "🔨 Baneado", description: `<@${uid}> fue baneado (confirmado).`, colour: COR.erro }));
    } catch (err) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Erro", description: `Não foi possível banir: ${descreverErroBan(err)}`, colour: COR.erro },
        { title: "❌ Error", description: `Couldn't ban: ${descreverErroBan(err, "en")}`, colour: COR.erro },
        { title: "❌ Error", description: `No se pudo banear: ${descreverErroBan(err, "en")}`, colour: COR.erro }));
    }
  }

  if (sub === "dismiss") {
    const uid = (val ?? "").replace(/[<@>]/g, "") || message.mentionIds?.[0];
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

  if (sub === "test") {
    const texto = args.slice(1).join(" ");
    if (!texto) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${citarInterno("automod.sentinela.testar", PREFIXO)} <texto>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${citarInterno("automod.sentinela.testar", PREFIXO)} <text>\``, colour: COR.erro },
      { title: "❌ Uso", description: `\`${citar("automod.sentinela.testar", "es", PREFIXO)} <texto>\``, colour: COR.erro }));
    const r = analisarConteudo(texto, { rate: 1 });
    const limiar = limiarDe(cfg.sensitivity);
    const flag = r.nota >= limiar;

    console.log(`[SCAM TEST] nota=${r.nota.toFixed(1)}/${limiar} flag=${flag} grave=${r.grave} sinais=[${r.sinais.join(", ") || "nenhum"}]`);

    const acaoTxt = tr(ctx,
      (!cfg.enabled
        ? `módulo **DESATIVADO** (ative com \`${citarInterno("automod.sentinela", PREFIXO)} on\`)`
        : `aplicaria a política global **${pol.modo}** (veja \`${citarInterno("automod.punicao", PREFIXO)}\`)`),
      (!cfg.enabled
        ? `module **DISABLED** (enable with \`${citarInterno("automod.sentinela", PREFIXO)} on\`)`
        : `it would apply the global policy **${nomeModo(pol.modo, "en")}** (see \`${citarInterno("automod.punicao", PREFIXO)}\`)`),
      (!cfg.enabled
        ? `módulo **DESACTIVADO** (actívalo con \`${citar("automod.sentinela", "es", PREFIXO)} on\`)`
        : `aplicaría la política global **${nomeModo(pol.modo, "es")}** (mira \`${citar("automod.punicao", "es", PREFIXO)}\`)`));

    return sendEmbed(message.channel, tr(ctx, {
      title: flag ? `🛑 SERIA sinalizado (nota ${r.nota.toFixed(1)}/10)` : `✅ NÃO seria sinalizado (nota ${r.nota.toFixed(1)}/10)`,
      description: [
        `**Módulo:** ${cfg.enabled ? "🟢 ativado" : "🔴 desativado"}  •  **Sensibilidade:** ${cfg.sensitivity} (limiar ${limiar})`,
        `**Nota:** ${r.nota.toFixed(1)} / 10`,
        `**Grave?** ${r.grave ? "sim ⚠️" : "não"}`,
        `**Sinais:** ${r.sinais.join(", ") || "nenhum"}`,
        flag ? `**O que faria:** ${acaoTxt}` : null,
        "",
        `💡 Fluxo real no canal de avisos: \`${citarInterno("automod.sentinela.simular", PREFIXO)} <texto>\``,
      ].filter(Boolean).join("\n"),
      colour: flag ? COR.erro : COR.sucesso,
    }, {
      title: flag ? `🛑 WOULD be flagged (score ${r.nota.toFixed(1)}/10)` : `✅ Would NOT be flagged (score ${r.nota.toFixed(1)}/10)`,
      description: [
        `**Module:** ${cfg.enabled ? "🟢 enabled" : "🔴 disabled"}  •  **Sensitivity:** ${nomeSens(cfg.sensitivity, "en")} (threshold ${limiar})`,
        `**Score:** ${r.nota.toFixed(1)} / 10`,
        `**Serious?** ${r.grave ? "yes ⚠️" : "no"}`,
        `**Signals:** ${r.sinais.join(", ") || "none"}`,
        flag ? `**What it would do:** ${acaoTxt}` : null,
        "",
        `💡 Real flow in the alert channel: \`${citarInterno("automod.sentinela.simular", PREFIXO)} <text>\``,
      ].filter(Boolean).join("\n"),
      colour: flag ? COR.erro : COR.sucesso,
    }, {
      title: flag ? `🛑 SÍ se marcaría (nota ${r.nota.toFixed(1)}/10)` : `✅ NO se marcaría (nota ${r.nota.toFixed(1)}/10)`,
      description: [
        `**Módulo:** ${cfg.enabled ? "🟢 activado" : "🔴 desactivado"}  •  **Sensibilidad:** ${nomeSens(cfg.sensitivity, "en")} (umbral ${limiar})`,
        `**Nota:** ${r.nota.toFixed(1)} / 10`,
        `**¿Grave?** ${r.grave ? "sí ⚠️" : "no"}`,
        `**Señales:** ${r.sinais.join(", ") || "ninguna"}`,
        flag ? `**Qué haría:** ${acaoTxt}` : null,
        "",
        `💡 Flujo real en el canal de avisos: \`${citar("automod.sentinela.simular", "es", PREFIXO)} <texto>\``,
      ].filter(Boolean).join("\n"),
      colour: flag ? COR.erro : COR.sucesso,
    }));
  }

  if (sub === "simulate" || sub === "simular") {
    const texto = args.slice(1).join(" ");
    if (!texto) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Uso", description: `\`${citarInterno("automod.sentinela.simular", PREFIXO)} <texto>\``, colour: COR.erro },
      { title: "❌ Usage", description: `\`${citarInterno("automod.sentinela.simular", PREFIXO)} <text>\``, colour: COR.erro },
      { title: "❌ Uso", description: `\`${citar("automod.sentinela.simular", "es", PREFIXO)} <texto>\``, colour: COR.erro }));
    await simularDeteccao(texto, ctx, message.channel);
    return sendEmbed(message.channel, tr(ctx, {
      title: "🧪 Simulação enviada",
      description: `Resultado enviado ao canal de avisos${cfg.alertChannelId ? ` (\`${cfg.alertChannelId}\`)` : " (este canal)"}. Nada foi punido.`,
      colour: COR.info,
    }, {
      title: "🧪 Simulation sent",
      description: `Result sent to the alert channel${cfg.alertChannelId ? ` (\`${cfg.alertChannelId}\`)` : " (this channel)"}. Nothing was punished.`,
      colour: COR.info,
    }, {
      title: "🧪 Simulación enviada",
      description: `Resultado enviado al canal de avisos${cfg.alertChannelId ? ` (\`${cfg.alertChannelId}\`)` : " (este canal)"}. No se castigó nada.`,
      colour: COR.info,
    }));
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "❌ Subcomando desconhecido", description: `Use \`${citarInterno("automod.sentinela.config", PREFIXO)}\` para ver as opções.`, colour: COR.erro },
    { title: "❌ Unknown subcommand", description: `Use \`${citarInterno("automod.sentinela.config", PREFIXO)}\` to see the options.`, colour: COR.erro },
    { title: "❌ Subcomando desconocido", description: `Usa \`${citar("automod.sentinela.config", "es", PREFIXO)}\` para ver las opciones.`, colour: COR.erro }));
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
        `**Mode:** \`${nomeModo(pol.modo, "es")}\` — ${rotulo(pol.modo)}`,
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

function negarPermissao(ctx, channel, permName) {
  return ctx.sendEmbed(channel, tr(ctx, {
    title: "🚫 Permissão insuficiente",
    description: `Você precisa da permissão **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  }, {
    title: "🚫 Missing permission",
    description: `You need the **${permName}** permission to use this command.`,
    colour: ctx.COR.erro,
  }, {
    title: "🚫 Permiso insuficiente",
    description: `Necesitas el permiso **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  }));
}
