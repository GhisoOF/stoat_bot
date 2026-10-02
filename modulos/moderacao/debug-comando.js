// &debug — o diagnóstico inteiro numa porta só (reescrito em 1 out 2026).
//
// Antes eram quatro comandos que cada um olhava um pedaço: `&debug` (uma
// tabela de comandos com nomes que nem existem mais: warnings, scam, setup…),
// `&debug canais [cru|<canal>]`, `&debug voz` e `&debug silence [@pessoa]`. Os
// problemas de verdade — cargo de nível acima do bot, canal de log apagado,
// falta de TimeoutMembers com a escada ligada — não apareciam em nenhum.
//
// Agora são três formas:
//   &debug           → o relatório completo: o que está quebrado primeiro,
//                      depois cada área (permissões, hierarquia, canais
//                      configurados, comandos, voz, IA, erros recentes)
//   &debug @pessoa   → o que o bot consegue fazer com essa pessoa
//   &debug #canal    → a conta de permissão do bot nesse canal
// Os nomes antigos (canais, voz, silence…) caem no relatório completo.

import * as perms from "./permissoes.js";
import { idsDeCargos, cargoDe, rankDoCargo, rankDoMembro } from "../core/hierarquia.js";
import { servidorNaLista } from "../core/env.js";
import * as db from "../core/db.js";
import { lingua } from "../core/i18n.js";
import { descreverErro } from "../core/erros.js";
import { MODULOS_AUTOMOD, moduloLigado, escadaDePunicao, GRUPOS_AUTOMOD, estadoDoGrupo } from "./automod-engine.js";
import { servidorPermitido as temIA } from "../ai/chat.js";
import { loja as lojaEconomia } from "../ferramentas/economia.js";

const ICONE = { erro: "🔴", aviso: "🟡", ok: "🟢", info: "▫️" };
const ANTIGOS = new Set(["canais", "voz", "tts", "voice", "silence", "silencio", "silêncio", "mudo", "timeout", "cru", "raw", "perms", "permissoes", "permissões", "tudo", "all", "completo"]);

function botTem(server, perm) {
  try { if (typeof server?.havePermission === "function") return !!server.havePermission(perm); } catch {}
  return null;
}

// ─── Coleta: tudo o que o relatório precisa, num objeto só ───────────────────
export async function coletar({ server, client, config, serverId, botMember, ehDono = false, fetcher = fetch }) {
  const am = config?.automod ?? {};
  const pol = am.punicao ?? {};
  const escada = (() => { try { return escadaDePunicao(pol); } catch { return []; } })();
  const usaMute = pol.modo === "confirmar" || (pol.modo === "acumular" && escada.some((d) => d?.tipo === "mute" || d?.ms));
  const usaBan = pol.modo === "banir" || (pol.modo === "acumular" && escada.some((d) => d?.tipo === "ban" || d === "ban"))
    || config?.banGlobal?.modo === "banir";
  const filtrosLigados = Object.values(MODULOS_AUTOMOD).filter((k) => moduloLigado(am, k));
  const cargosNivel = (() => { try { return db.listarCargosNivel(serverId); } catch { return []; } })();
  const reacoes = (() => { try { return db.listReactionRolesServidor(serverId); } catch { return []; } })();
  const vozAqui = servidorNaLista("TTS_SERVIDORES", serverId);
  const iaAqui = (() => { try { return temIA(serverId); } catch { return false; } })();
  const imagem = (process.env.IMAGEM ?? "1").trim() !== "0";

  return {
    server, client, config, serverId, botMember, ehDono, fetcher,
    am, pol, usaMute, usaBan, filtrosLigados, cargosNivel, reacoes, vozAqui, iaAqui, imagem,
    tickets: !!config?.tickets?.logCanal,
  };
}

// ─── As áreas ────────────────────────────────────────────────────────────────

function secaoPermissoes(d, T) {
  const usa = {
    React: d.reacoes.length > 0,
    ManageMessages: d.filtrosLigados.length > 0 || !!d.config?.tickets?.painel,   // o painel limpa as reações
    BanMembers: d.usaBan,
    TimeoutMembers: d.usaMute,
    AssignRoles: !!d.config?.autorole?.roleId || d.cargosNivel.length > 0 || d.reacoes.length > 0 || (() => { try { return lojaEconomia(d.serverId).length > 0; } catch { return false; } })(),
    ManageChannel: d.tickets || !!d.config?.tickets?.painel,
    Connect: d.vozAqui, Speak: d.vozAqui,
    UploadFiles: d.iaAqui && d.imagem,
  };
  const TABELA = [
    ["ViewChannel", "ver os canais", "see channels", true],
    ["ReadMessageHistory", "ler as mensagens", "read messages", true],
    ["SendMessage", "responder", "reply", true],
    ["SendEmbeds", "enviar os cartões de resposta", "send reply cards", true],
    ["React", "reagir — cargos por reação e as setas ◀ ▶", "react — reaction roles and the ◀ ▶ arrows"],
    ["ManageMessages", "apagar mensagens — automod e &limpar", "delete messages — automod and &limpar"],
    ["KickMembers", "expulsar — &kick", "kick — &kick"],
    ["BanMembers", "banir — &ban, automod, lista global", "ban — &ban, automod, global list"],
    ["TimeoutMembers", "silenciar — &silenciar e a escada de punição", "time out — &silenciar and the punishment ladder"],
    ["ManageRole", "criar cargos — &xp criarcargos, &cor", "create roles — &xp criarcargos, &cor"],
    ["AssignRoles", "dar cargos — cargo automático, níveis, reação", "give roles — auto role, levels, reactions"],
    ["ManageChannel", "criar canais — tickets", "create channels — tickets"],
    ["Connect", "entrar em calls — voz e música", "join calls — voice and music"],
    ["Speak", "falar nas calls — voz e música", "speak in calls — voice and music"],
    ["UploadFiles", "enviar arquivos — imagens geradas", "upload files — generated images"],
  ];
  const itens = [];
  for (const [p, pt, en, essencial] of TABELA) {
    const tem = botTem(d.server, p);
    const precisa = essencial || usa[p];
    if (tem === true) itens.push({ nivel: "ok", texto: `\`${p}\` — ${T(pt, en)}` });
    else if (tem === null) itens.push({ nivel: "aviso", texto: `\`${p}\` — ${T("não consegui verificar", "couldn't check")}` });
    else if (precisa) itens.push({ nivel: "erro", texto: `\`${p}\` ${T("falta", "missing")} — ${T(pt, en)}`,
      dica: T(`dê **${p}** ao cargo do bot`, `give the bot's role **${p}**`) });
    else itens.push({ nivel: "info", texto: `\`${p}\` ${T("falta, mas o recurso não está em uso", "missing, but the feature isn't in use")} — ${T(pt, en)}` });
  }
  return { titulo: T("🔑 Permissões do bot", "🔑 Bot permissions"), itens, compacto: true };
}

function secaoHierarquia(d, T) {
  const itens = [];
  if (!d.botMember) {
    itens.push({ nivel: "aviso", texto: T("não consegui buscar o meu próprio membro — sem ele não sei a minha posição", "couldn't fetch my own member — without it I don't know my position") });
    return { titulo: T("🪜 Hierarquia de cargos", "🪜 Role hierarchy"), itens };
  }
  const topo = rankDoMembro(d.server, d.botMember);
  if (topo === Infinity) {
    itens.push({ nivel: "erro", texto: T("o bot não tem nenhum cargo — o Stoat não deixa ele dar cargo nem punir ninguém", "the bot has no role — the Stoat won't let it give roles to or punish anyone"),
      dica: T("dê um cargo ao bot, acima dos cargos de membro", "give the bot a role above member roles") });
    return { titulo: T("🪜 Hierarquia de cargos", "🪜 Role hierarchy"), itens };
  }
  const nomeTopo = (() => { const id = idsDeCargos(d.botMember).find((x) => rankDoCargo(d.server, x) === topo); return id ? `<%${id}>` : "?"; })();
  itens.push({ nivel: "info", texto: T(`cargo mais alto do bot: ${nomeTopo}`, `bot's highest role: ${nomeTopo}`) });

  const conferir = (rotulo, ids) => {
    const apagados = ids.filter((id) => !cargoDe(d.server, id));
    const acima = ids.filter((id) => { const r = rankDoCargo(d.server, id); return r !== null && r <= topo; });
    if (apagados.length) itens.push({ nivel: "erro", texto: `${rotulo}: ${apagados.length} ${T("cargo(s) apagado(s) do servidor", "role(s) deleted from the server")}`, dica: T("reconfigure esse recurso", "set that feature up again") });
    if (acima.length) itens.push({ nivel: "erro", texto: `${rotulo}: ${acima.map((id) => `<%${id}>`).join(" ")} ${T("acima do cargo do bot — ele não consegue dar", "above the bot's role — it can't give it")}`,
      dica: T(`suba o cargo do bot (${nomeTopo}) acima deles`, `move the bot's role (${nomeTopo}) above them`) });
    if (ids.length && !apagados.length && !acima.length) itens.push({ nivel: "ok", texto: `${rotulo}: ${ids.length} ${T("cargo(s), todos abaixo do bot", "role(s), all below the bot")}` });
  };
  if (d.config?.autorole?.roleId) conferir(T("Cargo automático", "Auto role"), [d.config.autorole.roleId]);
  if (d.cargosNivel.length) conferir(T("Cargos de nível", "Level roles"), [...new Set(d.cargosNivel.map((c) => c.roleId).filter(Boolean))]);
  if (d.reacoes.length) conferir(T("Cargos por reação", "Reaction roles"), [...new Set(d.reacoes.map((r) => r.roleId).filter(Boolean))]);
  const aVenda = (() => { try { return lojaEconomia(d.serverId).map((x) => x.roleId); } catch { return []; } })();
  if (aVenda.length) conferir(T("Loja da economia", "Economy shop"), aVenda);
  if (itens.length === 1) itens.push({ nivel: "ok", texto: T("nenhum cargo configurado para o bot entregar", "no roles configured for the bot to give") });
  return { titulo: T("🪜 Hierarquia de cargos", "🪜 Role hierarchy"), itens };
}

function secaoCanaisConfigurados(d, T) {
  const c = d.config ?? {};
  const pares = [
    [T("Log", "Log"), c.log?.canalId],
    [T("Alertas do sentinela", "Sentinel alerts"), c.automod?.antiScam?.alertChannelId],
    [T("Boas-vindas", "Welcome"), c.boasVindas?.ativo ? c.boasVindas?.canalId : null],
    [T("Despedida", "Farewell"), c.adeus?.ativo ? c.adeus?.canalId : null],
    ["RSS", c.rss?.canalId],
    [T("Anúncio de nível", "Level-up announcements"), c.xp?.enabled ? c.xp?.canalAnuncio : null],
    [T("Log dos tickets", "Ticket log"), c.tickets?.logCanal],
    [T("Painel de tickets", "Ticket panel"), c.tickets?.painel?.canalId],
    [T("Comentários espontâneos", "Spontaneous comments"), d.iaAqui ? c.comentarioEspontaneo?.canalId : null],
    ...((d.iaAqui ? c.chatLivre?.canais ?? [] : []).map((id) => [T("Conversa livre", "Free chat"), id])),
  ].filter(([, id]) => id);
  const itens = [];
  const doServidor = new Set((d.server?.channels ?? []).map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean));
  for (const [rotulo, id] of pares) {
    const canal = d.client?.channels?.get?.(id) ?? (d.server?.channels ?? []).find((x) => x?.id === id) ?? null;
    if (!canal || (doServidor.size && !doServidor.has(id))) {
      itens.push({ nivel: "erro", texto: `${rotulo}: ${T("o canal não existe mais", "the channel no longer exists")} (\`${id}\`)`, dica: T("escolha outro canal para esse recurso", "pick another channel for that feature") });
      continue;
    }
    const falta = ["ViewChannel", "SendMessage", "SendEmbeds"].filter((p) => perms.podeNoCanal(canal, d.client, p, d.server, d.botMember) === false);
    if (falta.length) itens.push({ nivel: "erro", texto: `${rotulo}: <#${id}> — ${T("o bot não tem", "the bot lacks")} ${falta.join(", ")}`, dica: T(`libere ${falta.join(", ")} para o cargo do bot nesse canal`, `allow ${falta.join(", ")} for the bot's role in that channel`) });
    else itens.push({ nivel: "ok", texto: `${rotulo}: <#${id}>` });
  }
  if (!itens.length) itens.push({ nivel: "info", texto: T("nenhum canal configurado ainda", "no channels configured yet") });
  return { titulo: T("📍 Canais configurados", "📍 Configured channels"), itens };
}

function secaoCanaisGerais(d, T, lang) {
  const r = perms.diagnosticarCanais(d.server, d.client, d.botMember, lang);
  const itens = [];
  if (!r.total) itens.push({ nivel: "aviso", texto: T("não consegui listar os canais", "couldn't list the channels") });
  else {
    itens.push({ nivel: r.mudos ? "aviso" : "ok", texto: T(`${r.vistos} canal(is) visível(is)${r.cegos ? ` · ${r.cegos} invisível(is) (normal nos só-staff)` : ""}${r.mudos ? ` · **${r.mudos} com falta**` : ""}`,
      `${r.vistos} visible channel(s)${r.cegos ? ` · ${r.cegos} invisible (normal for staff-only ones)` : ""}${r.mudos ? ` · **${r.mudos} missing something**` : ""}`) });
    for (const p of r.problemas.slice(0, 5)) itens.push({ nivel: "aviso", texto: p });
    if (r.problemas.length > 5) itens.push({ nivel: "info", texto: T(`… e mais ${r.problemas.length - 5}`, `… and ${r.problemas.length - 5} more`) });
    if (r.desconhecidos) itens.push({ nivel: "aviso", texto: T(`${r.desconhecidos} canal(is) sem avaliação`, `${r.desconhecidos} channel(s) not evaluated`) });
  }
  return { titulo: T("🔍 Todos os canais", "🔍 All channels"), itens };
}

function secaoModeracao(d, T) {
  const itens = [];
  const grupos = Object.keys(GRUPOS_AUTOMOD).map((g) => ({ g, ...estadoDoGrupo(d.am, g) }));
  const resumo = grupos.map((x) => `${x.g} ${x.ligadas}/${x.total}`).join(" · ");
  itens.push({ nivel: "info", texto: T(`automod: ${resumo} · punição \`${d.pol.modo ?? "avisar"}\``, `automod: ${resumo} · punishment \`${d.pol.modo ?? "avisar"}\``) });
  if (!d.config?.log?.canalId) itens.push({ nivel: "aviso", texto: T("sem canal de log — punições e alertas não ficam registrados", "no log channel — punishments and alerts aren't recorded"), dica: T("`&log canal aqui` num canal só-staff", "`&log canal aqui` in a staff-only channel") });
  const off = d.config?.comandosDesativados ?? [];
  if (off.length) itens.push({ nivel: "info", texto: `${T("comandos desativados", "disabled commands")}: ${off.map((c) => `\`${c}\``).join(", ")}` });
  if ((d.config?.acesso?.canais?.modo ?? "todos") !== "todos") {
    const lista = d.config.acesso.canais.lista ?? [];
    itens.push({ nivel: lista.length ? "info" : "erro",
      texto: T(`comandos só ${d.config.acesso.canais.modo === "somente" ? "em" : "fora de"}: ${lista.length ? lista.map((c) => `<#${c}>`).join(", ") : "**lista vazia**"}`,
        `commands ${d.config.acesso.canais.modo === "somente" ? "only in" : "except in"}: ${lista.length ? lista.map((c) => `<#${c}>`).join(", ") : "**empty list**"}`),
      dica: lista.length ? null : T("`&acesso canal add` no canal certo — com a lista vazia, quem não é staff não usa comando nenhum", "`&acesso canal add` in the right channel — with an empty list, non-staff can't use any command") });
  }
  return { titulo: T("🛡 Moderação", "🛡 Moderation"), itens };
}

async function secaoVoz(d, T) {
  const itens = [];
  if (!d.vozAqui) {
    itens.push({ nivel: "info", texto: T("voz e música não estão liberadas neste servidor (`TTS_SERVIDORES`)", "voice and music aren't enabled on this server (`TTS_SERVIDORES`)") });
    return { titulo: T("🔊 Voz e música", "🔊 Voice and music"), itens };
  }
  const url = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
  if (!url) {
    itens.push({ nivel: "erro", texto: T("`VOZ_SERVICO_URL` não definida — o serviço de voz não é encontrado", "`VOZ_SERVICO_URL` isn't set — the voice service can't be found") });
  } else {
    const t0 = Date.now();
    try {
      const r = await d.fetcher(`${url}/saude`, { signal: AbortSignal.timeout(6000) });
      const s = await r.json();
      itens.push({ nivel: r.ok ? "ok" : "erro", texto: T(`serviço de voz respondeu em ${Date.now() - t0} ms`, `voice service answered in ${Date.now() - t0} ms`) });
      itens.push({ nivel: s.piper?.ok ? "ok" : "erro", texto: `Piper: ${s.piper?.ok ? s.piper.vozAtual ?? "ok" : s.piper?.erro ?? "?"}` });
      itens.push({ nivel: s.voz?.pronto ? "ok" : "erro", texto: `LiveKit: ${s.voz?.pronto ? T("pronto", "ready") : s.voz?.erro ?? "?"}` });
    } catch (e) {
      itens.push({ nivel: "erro", texto: T(`serviço de voz inalcançável (${e?.message ?? e})`, `voice service unreachable (${e?.message ?? e})`),
        dica: T("na máquina do bot: `bash scripts/judy-diag.sh`", "on the bot's machine: `bash scripts/judy-diag.sh`") });
    }
  }
  const c = d.config?.tts;
  itens.push({ nivel: "info", texto: c?.ativo && c?.canalVoz ? T(`na call <#${c.canalVoz}>`, `in the call <#${c.canalVoz}>`) : T("fora da call — `&entrar` dentro dela", "not in a call — `&entrar` inside one") });
  itens.push({ nivel: "info", texto: T("não entra na call? `&tts diagnostico` testa a conexão em etapas", "can't join the call? `&tts diagnostico` tests the connection step by step") });
  return { titulo: T("🔊 Voz e música", "🔊 Voice and music"), itens };
}

async function secaoIA(d, T) {
  const itens = [];
  if (!d.iaAqui) {
    itens.push({ nivel: "info", texto: T("a IA não está liberada neste servidor", "AI isn't enabled on this server") });
    return { titulo: T("🤖 IA", "🤖 AI"), itens };
  }
  const servico = (process.env.IA_SERVICO_URL || "").replace(/\/$/, "");
  if (!servico) itens.push({ nivel: "aviso", texto: T("`IA_SERVICO_URL` não definida — sem ferramentas (busca, código, imagem)", "`IA_SERVICO_URL` isn't set — no tools (search, code, images)") });
  else {
    try {
      const r = await d.fetcher(`${servico}/saude`, { signal: AbortSignal.timeout(6000) });
      const s = await r.json();
      itens.push({ nivel: s.llm?.alcancavel ? "ok" : "erro", texto: s.llm?.alcancavel
        ? T(`modelo respondendo (${(s.llm.modelos ?? []).length} carregado(s))`, `model answering (${(s.llm.modelos ?? []).length} loaded)`)
        : T("o servidor do modelo não responde — a IA fica muda", "the model server doesn't answer — the AI goes silent") });
    } catch (e) {
      itens.push({ nivel: "erro", texto: T(`serviço da IA inalcançável (${e?.message ?? e})`, `AI service unreachable (${e?.message ?? e})`) });
    }
  }
  itens.push({ nivel: process.env.SEARXNG_URL ? "ok" : "info", texto: process.env.SEARXNG_URL ? T("busca na web ligada", "web search on") : T("busca na web desligada (sem `SEARXNG_URL`)", "web search off (no `SEARXNG_URL`)") });
  itens.push({ nivel: "info", texto: d.imagem ? T("geração de imagem ligada", "image generation on") : T("geração de imagem desligada (`IMAGEM=0`)", "image generation off (`IMAGEM=0`)") });
  return { titulo: T("🤖 IA", "🤖 AI"), itens };
}

function secaoErros(d, T) {
  if (!d.ehDono) return null;
  const itens = [];
  try {
    const agora = Date.now();
    const eventos = db.eventosRelatorio(agora - 24 * 3600e3, agora + 1).filter((e) => e.tipo === "erro");
    const cont = new Map();
    for (const e of eventos) cont.set(e.titulo, (cont.get(e.titulo) ?? 0) + 1);
    const top = [...cont].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!top.length) itens.push({ nivel: "ok", texto: T("nenhum erro nas últimas 24 h", "no errors in the last 24 h") });
    for (const [t, n] of top) itens.push({ nivel: n >= 5 ? "aviso" : "info", texto: `${n}× \`${String(t).slice(0, 140)}\`` });
  } catch { itens.push({ nivel: "info", texto: T("histórico de erros indisponível", "error history unavailable") }); }
  return { titulo: T("🧾 Erros recentes (só o dono do bot vê, valem para todos os servidores)", "🧾 Recent errors (bot owner only, across all servers)"), itens };
}

function secaoBot(d, T) {
  const up = process.uptime();
  const tempo = up >= 86400 ? `${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h` : up >= 3600 ? `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}min` : `${Math.floor(up / 60)}min`;
  const mem = Math.round(process.memoryUsage().rss / 1048576);
  return { titulo: T("🤖 Bot", "🤖 Bot"), itens: [
    { nivel: "info", texto: T(`no ar há ${tempo} · ${mem} MB de memória`, `up for ${tempo} · ${mem} MB of memory`) },
    ...(d.latenciaMs != null ? [{ nivel: d.latenciaMs > 2000 ? "aviso" : "info", texto: T(`API do Stoat: ${d.latenciaMs} ms`, `Stoat API: ${d.latenciaMs} ms`) }] : []),
  ] };
}

// ─── Montagem ────────────────────────────────────────────────────────────────
export async function relatorioCompleto(d, lang = "pt") {
  const T = (pt, en) => (lang === "en" ? en : pt);
  const secoes = [
    secaoBot(d, T),
    secaoPermissoes(d, T),
    secaoHierarquia(d, T),
    secaoCanaisConfigurados(d, T),
    secaoCanaisGerais(d, T, lang),
    secaoModeracao(d, T),
    await secaoVoz(d, T),
    await secaoIA(d, T),
    secaoErros(d, T),
  ].filter(Boolean);

  const todos = secoes.flatMap((s) => s.itens);
  const erros = todos.filter((i) => i.nivel === "erro");
  const avisos = todos.filter((i) => i.nivel === "aviso");
  const linhas = [];
  linhas.push(erros.length
    ? T(`**${erros.length} problema(s)** · ${avisos.length} aviso(s)`, `**${erros.length} problem(s)** · ${avisos.length} warning(s)`)
    : avisos.length ? T(`Nada quebrado · ${avisos.length} aviso(s)`, `Nothing broken · ${avisos.length} warning(s)`)
      : T("✅ Tudo em ordem.", "✅ All good."));
  if (erros.length) {
    linhas.push("", T("**🔧 Resolva primeiro**", "**🔧 Fix these first**"));
    for (const e of erros) linhas.push(`🔴 ${e.texto}${e.dica ? ` → ${e.dica}` : ""}`);
  }
  for (const s of secoes) {
    linhas.push("", `**${s.titulo}**`);
    if (s.compacto) {
      // permissões: só o que falta, numa linha só para o que está ok
      const okP = s.itens.filter((i) => i.nivel === "ok").map((i) => i.texto.match(/`(\w+)`/)?.[1]).filter(Boolean);
      for (const i of s.itens.filter((x) => x.nivel !== "ok")) linhas.push(`${ICONE[i.nivel]} ${i.texto}`);
      if (okP.length) linhas.push(`🟢 ${okP.map((p) => `\`${p}\``).join(" ")}`);
    } else {
      for (const i of s.itens) linhas.push(`${ICONE[i.nivel]} ${i.texto}`);
    }
  }
  linhas.push("", T("_Detalhes: `&debug @pessoa` · `&debug #canal`_", "_Details: `&debug @person` · `&debug #channel`_"));
  return { titulo: T("🩺 Diagnóstico do servidor", "🩺 Server diagnostics"), texto: linhas.join("\n"), erros: erros.length, avisos: avisos.length };
}

// &debug @pessoa — o que o bot consegue fazer com ela
export function relatorioPessoa(d, member, alvoId, lang = "pt") {
  const T = (pt, en) => (lang === "en" ? en : pt);
  const L = [];
  if (!member) return { titulo: T("🔎 Pessoa", "🔎 Person"), texto: T(`<@${alvoId}> não é membro deste servidor.`, `<@${alvoId}> isn't a member of this server.`) };
  const topoBot = d.botMember ? rankDoMembro(d.server, d.botMember) : null;
  const topoAlvo = rankDoMembro(d.server, member);
  const dono = d.server?.ownerId === alvoId || d.server?.owner === alvoId;
  const acima = topoBot !== null && topoAlvo <= topoBot;
  const temTimeout = (() => { try { return !!member.hasPermission?.(d.server, "TimeoutMembers"); } catch { return false; } })();

  L.push(`**${T("Pessoa", "Person")}:** <@${alvoId}> · ${idsDeCargos(member).length} ${T("cargo(s)", "role(s)")}`);
  if (dono) L.push(T("👑 dono do servidor — nenhuma punição o alcança", "👑 server owner — no punishment reaches them"));
  else if (acima) L.push(T("🔴 está na altura do cargo do bot ou acima — o bot não consegue punir nem dar cargos a ela", "🔴 sits at or above the bot's role — the bot can't punish or give roles to them"));
  else L.push(T("🟢 está abaixo do bot — ele consegue editar essa pessoa", "🟢 sits below the bot — it can edit this person"));

  // silêncio
  if (!dono) {
    if (temTimeout) L.push(T("🔴 silêncio: tem **TimeoutMembers** — o Stoat não deixa ninguém silenciá-la", "🔴 silence: has **TimeoutMembers** — the Stoat won't let anyone time them out"));
    else if (botTem(d.server, "TimeoutMembers") === false) L.push(T("🔴 silêncio: o bot não tem **TimeoutMembers**", "🔴 silence: the bot lacks **TimeoutMembers**"));
    else if (!acima) L.push(T("🟢 silêncio: funciona com essa pessoa", "🟢 silence: works on this person"));
  }
  if (member.timeout && new Date(member.timeout).getTime() > Date.now())
    L.push(T(`🔇 silenciada agora, até ${new Date(member.timeout).toISOString().slice(0, 16).replace("T", " ")} UTC`, `🔇 timed out now, until ${new Date(member.timeout).toISOString().slice(0, 16).replace("T", " ")} UTC`));

  // punições
  const p = (() => { try { return db.lerPunicao(d.serverId, alvoId); } catch { return null; } })();
  if (p?.avisos) L.push(T(`⚠️ ${p.avisos} aviso(s) acumulado(s)`, `⚠️ ${p.avisos} warning(s) on record`));

  // cargos de nível
  if (d.config?.xp?.enabled && d.cargosNivel.length) {
    const nivel = (() => { try { return db.getXp(d.serverId, alvoId)?.nivel ?? 0; } catch { return 0; } })();
    const devidos = d.cargosNivel.filter((c) => c.nivel <= nivel).map((c) => c.roleId);
    const atuais = new Set(idsDeCargos(member));
    const faltam = devidos.filter((id) => !atuais.has(id));
    if (!devidos.length) L.push(T(`🎖 nível ${nivel} — ainda sem cargo de nível`, `🎖 level ${nivel} — no level role yet`));
    else if (!faltam.length) L.push(T(`🎖 nível ${nivel} — cargos de nível em dia`, `🎖 level ${nivel} — level roles up to date`));
    else L.push(T(`🟡 nível ${nivel} — faltam ${faltam.map((id) => `<%${id}>`).join(" ")}${acima ? " (e o bot não alcança)" : " → `&xp sincronizar @pessoa`"}`,
      `🟡 level ${nivel} — missing ${faltam.map((id) => `<%${id}>`).join(" ")}${acima ? " (and the bot can't reach them)" : " → `&xp sincronizar @person`"}`));
  }
  return { titulo: T("🔎 O bot e essa pessoa", "🔎 The bot and this person"), texto: L.join("\n") };
}

// ─── O comando ───────────────────────────────────────────────────────────────
export async function cmdDebug(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, config, serverId, client } = ctx;
  const lang = lingua(ctx);
  const T = (pt, en) => (lang === "en" ? en : pt);

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { title: T("🚫 Permissão insuficiente", "🚫 Missing permission"),
      description: T("Você precisa de **ManagePermissions** para ver o diagnóstico.", "You need **ManagePermissions** to see the diagnostics."), colour: COR.erro });
  }

  const t0 = Date.now();
  const botId = client?.user?.id;
  const botMember = (() => { try { return server?.member ?? null; } catch { return null; } })()
    ?? (botId ? await server?.fetchMember?.(botId).catch(() => null) : null);
  const latenciaMs = botMember ? Date.now() - t0 : null;
  const d = await coletar({ server, client, config, serverId: serverId ?? server?.id, botMember, ehDono: !!ctx.ehSuperAdmin?.(message.authorId) });
  d.latenciaMs = latenciaMs;

  const arg = (args[0] ?? "").trim();
  const legado = ANTIGOS.has(arg.toLowerCase());

  // &debug @pessoa
  const pessoaId = !legado && (message.mentionIds?.[0] ?? (/^<@!?([A-Z0-9]{26})>$/i.exec(arg)?.[1]));
  if (pessoaId) {
    const member = await server?.fetchMember?.(pessoaId).catch(() => null);
    const r = relatorioPessoa(d, member, pessoaId, lang);
    return sendEmbed(message.channel, { title: r.titulo, description: r.texto, colour: COR.info });
  }

  // &debug #canal (menção, ID ou nome)
  if (arg && !legado) {
    const canais = (server?.channels ?? []).map((c) => (typeof c === "string" ? client?.channels?.get?.(c) : c)).filter(Boolean);
    const id = /^<#([A-Z0-9]{26})>$/i.exec(arg)?.[1] ?? arg;
    const alvo = args.join(" ").replace(/^#/, "").toLowerCase();
    const canal = canais.find((c) => c?.id === id) ?? canais.find((c) => String(c?.name ?? "").toLowerCase() === alvo)
      ?? canais.find((c) => String(c?.name ?? "").toLowerCase().includes(alvo));
    if (!canal) {
      return sendEmbed(message.channel, { title: T("🔍 Não achei", "🔍 Not found"),
        description: T(`Nenhuma pessoa ou canal com "${args.join(" ")}".\n\n\`${PREFIXO}debug\` · \`${PREFIXO}debug @pessoa\` · \`${PREFIXO}debug #canal\``,
          `No person or channel matching "${args.join(" ")}".\n\n\`${PREFIXO}debug\` · \`${PREFIXO}debug @person\` · \`${PREFIXO}debug #channel\``), colour: COR.aviso });
    }
    const rastro = perms.rastrearPermissoes(server, canal, botMember, client);
    return sendEmbed(message.channel, {
      title: T("🔬 A conta de permissão em ", "🔬 Permission math in ") + (canal.name ?? canal.id),
      description: ("```\n" + rastro.join("\n") + "\n```").slice(0, 1950), colour: COR.info });
  }

  // &debug (e os nomes antigos)
  let r;
  try { r = await relatorioCompleto(d, lang); }
  catch (e) {
    console.error("[DEBUG]", descreverErro(e));
    return sendEmbed(message.channel, { title: T("❌ O diagnóstico falhou", "❌ Diagnostics failed"), description: descreverErro(e, lang), colour: COR.erro });
  }
  const nota = legado ? T(`_\`${PREFIXO}debug ${arg}\` virou parte do diagnóstico completo._\n\n`, `_\`${PREFIXO}debug ${arg}\` is now part of the full diagnostics._\n\n`) : "";
  return sendEmbed(message.channel, { title: r.titulo, description: nota + r.texto, colour: r.erros ? COR.erro : r.avisos ? COR.aviso : COR.sucesso });
}
