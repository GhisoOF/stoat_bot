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
import { lingua, idiomaDe, tr } from "../core/i18n.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import { descreverErro } from "../core/erros.js";
import { MODULOS_AUTOMOD, moduloLigado, escadaDePunicao, GRUPOS_AUTOMOD, estadoDoGrupo, validadeDosAvisos } from "./automod-engine.js";
// (22 out 2026) `iaExiste` = a IA está disponível aqui; `iaAqui` = e o chat está ligado
import { servidorPermitido as temIA, iaDisponivel, imagemLigadaAqui } from "../ai/chat.js";
import { loja as lojaEconomia } from "../ferramentas/economia.js";
import { nomeModo, nomeGrupo } from "../core/nomes-automod.js";

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
    || ["banir", "imediato", "consenso"].includes(config?.banGlobal?.modo);
  const filtrosLigados = Object.values(MODULOS_AUTOMOD).filter((k) => moduloLigado(am, k));
  const cargosNivel = (() => { try { return db.listarCargosNivel(serverId); } catch { return []; } })();
  const reacoes = (() => { try { return db.listReactionRolesServidor(serverId); } catch { return []; } })();
  const vozAqui = servidorNaLista("TTS_SERVIDORES", serverId);
  const iaAqui = (() => { try { return temIA(serverId); } catch { return false; } })();
  const iaExiste = (() => { try { return iaDisponivel(serverId); } catch { return false; } })();
  const imagem = (process.env.IMAGEM ?? "1").trim() !== "0";
  const imagemAqui = (() => { try { return imagemLigadaAqui(serverId); } catch { return false; } })();

  return {
    server, client, config, serverId, botMember, ehDono, fetcher,
    am, pol, usaMute, usaBan, filtrosLigados, cargosNivel, reacoes, vozAqui, iaAqui, iaExiste, imagem, imagemAqui,
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
    UploadFiles: d.iaAqui && d.imagemAqui,
  };
  const TABELA = [
    ["ViewChannel", "ver os canais", "see channels", "ver los canales", true],
    ["ReadMessageHistory", "ler as mensagens", "read messages", "leer los mensajes", true],
    ["SendMessage", "responder", "reply", "responder", true],
    ["SendEmbeds", "enviar os cartões de resposta", "send reply cards", "enviar las tarjetas de respuesta", true],
    ["React", "reagir — cargos por reação e as setas ◀ ▶", "react — reaction roles and the ◀ ▶ arrows", "reaccionar — roles por reacción y las flechas ◀ ▶"],
    ["ManageMessages", `apagar mensagens — automod e ${citar("limpar", "pt")}`, `delete messages — automod and ${citar("limpar", "en")}`, `borrar mensajes — automod y ${citar("limpar", "es")}`],
    ["KickMembers", `expulsar — ${citar("kick", "pt")}`, `kick — ${citar("kick", "en")}`, `expulsar — ${citar("kick", "es")}`],
    ["BanMembers", `banir — ${citar("ban", "pt")}, automod, lista global`, `ban — ${citar("ban", "en")}, automod, global list`, `banear — ${citar("ban", "es")}, automod, lista global`],
    ["TimeoutMembers", `silenciar — ${citar("silenciar", "pt")} e a escada de punição`, `time out — ${citar("silenciar", "en")} and the punishment ladder`, `silenciar — ${citar("silenciar", "es")} y la escalera de castigos`],
    ["ManageRole", "criar cargos — " + citarInterno("xp.criarcargos") + ", " + citarInterno("cor") + "", "create roles — " + citarInterno("xp.criarcargos") + ", " + citarInterno("cor") + "", "crear roles — " + citar("xp.criarcargos", "es") + ", " + citar("cor", "es")],
    ["AssignRoles", "dar cargos — cargo automático, níveis, reação", "give roles — auto role, levels, reactions", "dar roles — rol automático, niveles, reacciones"],
    ["ManageChannel", `criar canais — tickets, ${citar("assistente.servidor", "pt")}`, `create channels — tickets, ${citar("assistente.servidor", "en")}`, `crear canales — tickets, ${citar("assistente.servidor", "es")}`],
    ["ManagePermissions", `permissões de canais e cargos — ${citar("assistente.servidor", "pt")}`, `channel and role permissions — ${citar("assistente.servidor", "en")}`, `permisos de canales y roles — ${citar("assistente.servidor", "es")}`],
    ["Connect", "entrar em calls — voz e música", "join calls — voice and music", "entrar en llamadas — voz y música"],
    ["Speak", "falar nas calls — voz e música", "speak in calls — voice and music", "hablar en llamadas — voz y música"],
    ["UploadFiles", "enviar arquivos — imagens geradas", "upload files — generated images", "subir archivos — imágenes generadas"],
  ];
  const itens = [];
  for (const [p, pt, en, es, essencial] of TABELA) {
    const tem = botTem(d.server, p);
    const precisa = essencial || usa[p];
    if (tem === true) itens.push({ nivel: "ok", texto: `\`${p}\` — ${T(pt, en, es)}` });
    else if (tem === null) itens.push({ nivel: "aviso", texto: `\`${p}\` — ${T("não consegui verificar", "couldn't check", "no pude comprobarlo")}` });
    else if (precisa) itens.push({ nivel: "erro", texto: `\`${p}\` ${T("falta", "missing", "falta")} — ${T(pt, en, es)}`,
      dica: T(`dê **${p}** ao cargo do bot`, `give the bot's role **${p}**`, `dale **${p}** al rol del bot`) });
    else itens.push({ nivel: "info", texto: `\`${p}\` ${T("falta, mas o recurso não está em uso", "missing, but the feature isn't in use", "falta, pero la función no está en uso")} — ${T(pt, en, es)}` });
  }
  return { titulo: T("🔑 Permissões do bot", "🔑 Bot permissions", "🔑 Permisos del bot"), itens, compacto: true };
}

function secaoHierarquia(d, T) {
  const itens = [];
  if (!d.botMember) {
    itens.push({ nivel: "aviso", texto: T("não consegui buscar o meu próprio membro — sem ele não sei a minha posição", "couldn't fetch my own member — without it I don't know my position", "no pude obtener mi propio miembro — sin él no sé mi posición") });
    return { titulo: T("🪜 Hierarquia de cargos", "🪜 Role hierarchy", "🪜 Jerarquía de roles"), itens };
  }
  const topo = rankDoMembro(d.server, d.botMember);
  if (topo === Infinity) {
    itens.push({ nivel: "erro", texto: T("o bot não tem nenhum cargo — o Stoat não deixa ele dar cargo nem punir ninguém", "the bot has no role — the Stoat won't let it give roles to or punish anyone", "el bot no tiene ningún rol — Stoat no le deja dar roles ni castigar a nadie"),
      dica: T("dê um cargo ao bot, acima dos cargos de membro", "give the bot a role above member roles", "dale al bot un rol por encima de los roles de miembro") });
    return { titulo: T("🪜 Hierarquia de cargos", "🪜 Role hierarchy", "🪜 Jerarquía de roles"), itens };
  }
  const nomeTopo = (() => { const id = idsDeCargos(d.botMember).find((x) => rankDoCargo(d.server, x) === topo); return id ? `<%${id}>` : "?"; })();
  itens.push({ nivel: "info", texto: T(`cargo mais alto do bot: ${nomeTopo}`, `bot's highest role: ${nomeTopo}`, `rol más alto del bot: ${nomeTopo}`) });

  const conferir = (rotulo, ids) => {
    const apagados = ids.filter((id) => !cargoDe(d.server, id));
    const acima = ids.filter((id) => { const r = rankDoCargo(d.server, id); return r !== null && r <= topo; });
    if (apagados.length) itens.push({ nivel: "erro", texto: `${rotulo}: ${apagados.length} ${T("cargo(s) apagado(s) do servidor", "role(s) deleted from the server", "rol(es) borrado(s) del servidor")}`, dica: T("reconfigure esse recurso", "set that feature up again", "vuelve a configurar esa función") });
    if (acima.length) itens.push({ nivel: "erro", texto: `${rotulo}: ${acima.map((id) => `<%${id}>`).join(" ")} ${T("acima do cargo do bot — ele não consegue dar", "above the bot's role — it can't give it", "por encima del rol del bot — no puede darlo")}`,
      dica: T(`suba o cargo do bot (${nomeTopo}) acima deles`, `move the bot's role (${nomeTopo}) above them`, `sube el rol del bot (${nomeTopo}) por encima de ellos`) });
    if (ids.length && !apagados.length && !acima.length) itens.push({ nivel: "ok", texto: `${rotulo}: ${ids.length} ${T("cargo(s), todos abaixo do bot", "role(s), all below the bot", "rol(es), todos por debajo del bot")}` });
  };
  if (d.config?.autorole?.roleId) conferir(T("Cargo automático", "Auto role", "Rol automático"), [d.config.autorole.roleId]);
  if (d.cargosNivel.length) conferir(T("Cargos de nível", "Level roles", "Roles de nivel"), [...new Set(d.cargosNivel.map((c) => c.roleId).filter(Boolean))]);
  if (d.reacoes.length) conferir(T("Cargos por reação", "Reaction roles", "Roles por reacción"), [...new Set(d.reacoes.map((r) => r.roleId).filter(Boolean))]);
  const aVenda = (() => { try { return lojaEconomia(d.serverId).map((x) => x.roleId); } catch { return []; } })();
  if (aVenda.length) conferir(T("Loja da economia", "Economy shop", "Tienda de la economía"), aVenda);
  if (itens.length === 1) itens.push({ nivel: "ok", texto: T("nenhum cargo configurado para o bot entregar", "no roles configured for the bot to give", "ningún rol configurado para que el bot lo dé") });
  return { titulo: T("🪜 Hierarquia de cargos", "🪜 Role hierarchy", "🪜 Jerarquía de roles"), itens };
}

function secaoCanaisConfigurados(d, T) {
  const c = d.config ?? {};
  const pares = [
    [T("Log", "Log", "Registro"), c.log?.canalId],
    [T("Alertas do sentinela", "Sentinel alerts", "Alertas del centinela"), c.automod?.antiScam?.alertChannelId],
    [T("Boas-vindas", "Welcome", "Bienvenida"), c.boasVindas?.ativo ? c.boasVindas?.canalId : null],
    [T("Despedida", "Farewell", "Despedida"), c.adeus?.ativo ? c.adeus?.canalId : null],
    ["RSS", c.rss?.canalId],
    [T("Anúncio de nível", "Level-up announcements", "Anuncio de nivel"), c.xp?.enabled ? c.xp?.canalAnuncio : null],
    [T("Log dos tickets", "Ticket log", "Registro de tickets"), c.tickets?.logCanal],
    [T("Painel de tickets", "Ticket panel", "Panel de tickets"), c.tickets?.painel?.canalId],
    [T("Comentários espontâneos", "Spontaneous comments", "Comentarios espontáneos"), d.iaAqui ? c.comentarioEspontaneo?.canalId : null],
    ...((d.iaAqui ? c.chatLivre?.canais ?? [] : []).map((id) => [T("Conversa livre", "Free chat", "Conversación libre"), id])),
    // (22 out 2026) canais de divulgação: lá o anti-invite não age, mas o resto do
    // automod sim — o bot só precisa VER o canal
    ...((c.automod?.antiInvite?.canaisLiberados ?? []).map((id) => [T("Divulgação (convites liberados)", "Promotion (invites allowed)", "Promoción (invitaciones permitidas)"), id, ["ViewChannel"]])),
  ].filter(([, id]) => id);
  const itens = [];
  const doServidor = new Set((d.server?.channels ?? []).map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean));
  for (const [rotulo, id, precisa = ["ViewChannel", "SendMessage", "SendEmbeds"]] of pares) {
    const canal = d.client?.channels?.get?.(id) ?? (d.server?.channels ?? []).find((x) => x?.id === id) ?? null;
    if (!canal || (doServidor.size && !doServidor.has(id))) {
      itens.push({ nivel: "erro", texto: `${rotulo}: ${T("o canal não existe mais", "the channel no longer exists", "el canal ya no existe")} (\`${id}\`)`, dica: T("escolha outro canal para esse recurso", "pick another channel for that feature", "elige otro canal para esa función") });
      continue;
    }
    const falta = precisa.filter((p) => perms.podeNoCanal(canal, d.client, p, d.server, d.botMember) === false);
    if (falta.length) itens.push({ nivel: "erro", texto: `${rotulo}: <#${id}> — ${T("o bot não tem", "the bot lacks", "al bot le falta")} ${falta.join(", ")}`, dica: T(`libere ${falta.join(", ")} para o cargo do bot nesse canal`, `allow ${falta.join(", ")} for the bot's role in that channel`, `permite ${falta.join(", ")} al rol del bot en ese canal`) });
    else itens.push({ nivel: "ok", texto: `${rotulo}: <#${id}>` });
  }
  if (!itens.length) itens.push({ nivel: "info", texto: T("nenhum canal configurado ainda", "no channels configured yet", "ningún canal configurado todavía") });
  return { titulo: T("📍 Canais configurados", "📍 Configured channels", "📍 Canales configurados"), itens };
}

function secaoCanaisGerais(d, T, l) {
  const r = perms.diagnosticarCanais(d.server, d.client, d.botMember, l);
  const itens = [];
  if (!r.total) itens.push({ nivel: "aviso", texto: T("não consegui listar os canais", "couldn't list the channels", "no pude listar los canales") });
  else {
    itens.push({ nivel: r.mudos ? "aviso" : "ok", texto: T(`${r.vistos} canal(is) visível(is)${r.cegos ? ` · ${r.cegos} invisível(is) (normal nos só-staff)` : ""}${r.mudos ? ` · **${r.mudos} com falta**` : ""}`,
      `${r.vistos} visible channel(s)${r.cegos ? ` · ${r.cegos} invisible (normal for staff-only ones)` : ""}${r.mudos ? ` · **${r.mudos} missing something**` : ""}`, `${r.vistos} canal(es) visible(s)${r.cegos ? ` · ${r.cegos} invisible(s) (normal en los solo para staff)` : ""}${r.mudos ? ` · **${r.mudos} con algo que falta**` : ""}`) });
    for (const p of r.problemas.slice(0, 5)) itens.push({ nivel: "aviso", texto: p });
    if (r.problemas.length > 5) itens.push({ nivel: "info", texto: T(`… e mais ${r.problemas.length - 5}`, `… and ${r.problemas.length - 5} more`, `… y ${r.problemas.length - 5} más`) });
    if (r.desconhecidos) itens.push({ nivel: "aviso", texto: T(`${r.desconhecidos} canal(is) sem avaliação`, `${r.desconhecidos} channel(s) not evaluated`, `${r.desconhecidos} canal(es) sin evaluar`) });
  }
  return { titulo: T("🔍 Todos os canais", "🔍 All channels", "🔍 Todos los canales"), itens };
}

function secaoModeracao(d, T) {
  const itens = [];
  const grupos = Object.keys(GRUPOS_AUTOMOD).map((g) => ({ g, ...estadoDoGrupo(d.am, g) }));
  const resumo = grupos.map((x) => `${x.g} ${x.ligadas}/${x.total}`).join(" · ");
  const resumoEn = grupos.map((x) => `${nomeGrupo(x.g, "en")} ${x.ligadas}/${x.total}`).join(" · ");
  itens.push({ nivel: "info", texto: T(`automod: ${resumo} · punição \`${d.pol.modo ?? "avisar"}\``, `automod: ${resumoEn} · punishment \`${nomeModo(d.pol.modo ?? "avisar", "en")}\``, `automod: ${resumoEn} · castigo \`${nomeModo(d.pol.modo ?? "avisar", "es")}\``) });
  if (!d.config?.log?.canalId) itens.push({ nivel: "aviso", texto: T("sem canal de log — punições e alertas não ficam registrados", "no log channel — punishments and alerts aren't recorded", "sin canal de registro — los castigos y las alertas no quedan registrados"), dica: T(`\`${citar("log.canal.aqui", "pt")}\` num canal só-staff`, `\`${citar("log.canal.aqui", "en")}\` in a staff-only channel`, `\`${citar("log.canal.aqui", "es")}\` en un canal solo para staff`) });
  const off = d.config?.comandosDesativados ?? [];
  if (off.length) itens.push({ nivel: "info", texto: `${T("comandos desativados", "disabled commands", "comandos desactivados")}: ${off.map((c) => `\`${c}\``).join(", ")}` });
  if ((d.config?.acesso?.canais?.modo ?? "todos") !== "todos") {
    const lista = d.config.acesso.canais.lista ?? [];
    itens.push({ nivel: lista.length ? "info" : "erro",
      texto: T(`comandos só ${d.config.acesso.canais.modo === "somente" ? "em" : "fora de"}: ${lista.length ? lista.map((c) => `<#${c}>`).join(", ") : "**lista vazia**"}`,
        `commands ${d.config.acesso.canais.modo === "somente" ? "only in" : "except in"}: ${lista.length ? lista.map((c) => `<#${c}>`).join(", ") : "**empty list**"}`,
        `comandos solo ${d.config.acesso.canais.modo === "somente" ? "en" : "fuera de"}: ${lista.length ? lista.map((c) => `<#${c}>`).join(", ") : "**lista vacía**"}`),
      dica: lista.length ? null : T("`" + citarInterno("acesso.canal.add") + "` no canal certo — com a lista vazia, quem não é staff não usa comando nenhum", "`" + citarInterno("acesso.canal.add") + "` in the right channel — with an empty list, non-staff can't use any command", "`" + citar("acesso.canal.add", "es") + "` en el canal correcto — con la lista vacía, quien no es staff no puede usar ningún comando") });
  }
  return { titulo: T("🛡 Moderação", "🛡 Moderation", "🛡 Moderación"), itens };
}

async function secaoVoz(d, T) {
  const itens = [];
  if (!d.vozAqui) {
    itens.push({ nivel: "info", texto: T("voz e música não estão liberadas neste servidor (`TTS_SERVIDORES`)", "voice and music aren't enabled on this server (`TTS_SERVIDORES`)", "la voz y la música no están habilitadas en este servidor (`TTS_SERVIDORES`)") });
    return { titulo: T("🔊 Voz e música", "🔊 Voice and music", "🔊 Voz y música"), itens };
  }
  const url = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
  if (!url) {
    itens.push({ nivel: "erro", texto: T("`VOZ_SERVICO_URL` não definida — o serviço de voz não é encontrado", "`VOZ_SERVICO_URL` isn't set — the voice service can't be found", "`VOZ_SERVICO_URL` no está definida — no se encuentra el servicio de voz") });
  } else {
    const t0 = Date.now();
    try {
      const r = await d.fetcher(`${url}/saude`, { signal: AbortSignal.timeout(6000) });
      const s = await r.json();
      itens.push({ nivel: r.ok ? "ok" : "erro", texto: T(`serviço de voz respondeu em ${Date.now() - t0} ms`, `voice service answered in ${Date.now() - t0} ms`, `el servicio de voz respondió en ${Date.now() - t0} ms`) });
      itens.push({ nivel: s.piper?.ok ? "ok" : "erro", texto: `Piper: ${s.piper?.ok ? s.piper.vozAtual ?? "ok" : s.piper?.erro ?? "?"}` });
      itens.push({ nivel: s.voz?.pronto ? "ok" : "erro", texto: `LiveKit: ${s.voz?.pronto ? T("pronto", "ready", "listo") : s.voz?.erro ?? "?"}` });
    } catch (e) {
      itens.push({ nivel: "erro", texto: T(`serviço de voz inalcançável (${e?.message ?? e})`, `voice service unreachable (${e?.message ?? e})`, `servicio de voz inalcanzable (${e?.message ?? e})`),
        dica: T("na máquina do bot: `bash scripts/judy-diag.sh`", "on the bot's machine: `bash scripts/judy-diag.sh`", "en la máquina del bot: `bash scripts/judy-diag.sh`") });
    }
  }
  const c = d.config?.tts;
  itens.push({ nivel: "info", texto: c?.ativo && c?.canalVoz ? T(`na call <#${c.canalVoz}>`, `in the call <#${c.canalVoz}>`, `en la llamada <#${c.canalVoz}>`) : T("fora da call — `" + citarInterno("entrar") + "` dentro dela", "not in a call — `" + citarInterno("entrar") + "` inside one", "fuera de la llamada — `" + citar("entrar", "es") + "` dentro de ella") });
  itens.push({ nivel: "info", texto: T("não entra na call? `" + citarInterno("tts.diagnostico") + "` testa a conexão em etapas", "can't join the call? `" + citarInterno("tts.diagnostico") + "` tests the connection step by step", "¿no entra en la llamada? `" + citar("tts.diagnostico", "es") + "` prueba la conexión paso a paso") });
  return { titulo: T("🔊 Voz e música", "🔊 Voice and music", "🔊 Voz y música"), itens };
}

async function secaoIA(d, T) {
  const itens = [];
  if (!d.iaExiste) {
    itens.push({ nivel: "info", texto: T("a IA de conversa não está liberada neste servidor (o dono do bot escolhe em `SERVIDOR`)",
      "the chat AI isn't enabled on this server (the bot owner picks in `SERVIDOR`)", "la IA de conversación no está habilitada en este servidor (el dueño del bot elige en `SERVIDOR`)") });
    return { titulo: T("🤖 IA", "🤖 AI", "🤖 IA"), itens };
  }
  // (22 out 2026) o chat e a imagem são escolha do servidor (começam desligados)
  itens.push(d.iaAqui
    ? { nivel: "ok", texto: T("chat ligado neste servidor", "chat on for this server", "chat activado en este servidor") }
    : { nivel: "info", texto: T(`chat desligado neste servidor — \`${citarInterno("chat.on")}\` liga`, `chat off for this server — \`${citarInterno("chat.on")}\` turns it on`, `chat desactivado en este servidor — \`${citar("chat.on", "es")}\` lo activa`) });
  const visao = !!(process.env.LLM_MODEL_VISAO || process.env.LLM_MODEL_MODERACAO);
  if (!d.imagem) itens.push({ nivel: "info", texto: T("geração de imagem desligada no bot (`IMAGEM=0`)", "image generation off in the bot (`IMAGEM=0`)", "generación de imágenes desactivada en el bot (`IMAGEM=0`)") });
  else if (!d.imagemAqui) itens.push({ nivel: "info", texto: T(`geração de imagem desligada neste servidor — \`${citarInterno("chat.imagem")} on\` liga`, `image generation off for this server — \`${citarInterno("chat.imagem")} on\` turns it on`, `generación de imágenes desactivada en este servidor — \`${citar("chat.imagem", "es")} on\` la activa`) });
  else if (!visao) itens.push({ nivel: "aviso", texto: T("geração de imagem ligada, mas sem modelo de visão: toda imagem é conferida antes de sair, então nenhuma sai",
      "image generation on, but no vision model: every image is checked before it goes out, so none will", "generación de imágenes activada, pero sin modelo de visión: toda imagen se revisa antes de salir, así que no saldrá ninguna"),
    dica: T("defina `MODELO_VISAO` no `.env`", "set `MODELO_VISAO` in `.env`", "define `MODELO_VISAO` en el `.env`") });
  else itens.push({ nivel: "ok", texto: T("geração de imagem ligada (cada imagem conferida pela visão)", "image generation on (each image checked by the vision model)", "generación de imágenes activada (cada imagen revisada por la visión)") });
  const servico = (process.env.IA_SERVICO_URL || "").replace(/\/$/, "");
  if (!servico) itens.push({ nivel: "aviso", texto: T("`IA_SERVICO_URL` não definida — sem ferramentas (busca, código, imagem)", "`IA_SERVICO_URL` isn't set — no tools (search, code, images)", "`IA_SERVICO_URL` no está definida — sin herramientas (búsqueda, código, imágenes)") });
  else {
    try {
      const r = await d.fetcher(`${servico}/saude`, { signal: AbortSignal.timeout(6000),
        headers: process.env.IA_SERVICO_CHAVE ? { "x-chave": process.env.IA_SERVICO_CHAVE } : {} });
      const s = await r.json();
      itens.push({ nivel: s.llm?.alcancavel ? "ok" : "erro", texto: s.llm?.alcancavel
        ? T(`modelo respondendo (${(s.llm.modelos ?? []).length} carregado(s))`, `model answering (${(s.llm.modelos ?? []).length} loaded)`, `modelo respondiendo (${(s.llm.modelos ?? []).length} cargado(s))`)
        : T("o servidor do modelo não responde — a IA fica muda", "the model server doesn't answer — the AI goes silent", "el servidor del modelo no responde — la IA se queda muda") });
    } catch (e) {
      itens.push({ nivel: "erro", texto: T(`serviço da IA inalcançável (${e?.message ?? e})`, `AI service unreachable (${e?.message ?? e})`, `servicio de la IA inalcanzable (${e?.message ?? e})`) });
    }
  }
  itens.push({ nivel: process.env.SEARXNG_URL ? "ok" : "info", texto: process.env.SEARXNG_URL ? T("busca na web ligada", "web search on", "búsqueda web activada") : T("busca na web desligada (sem `SEARXNG_URL`)", "web search off (no `SEARXNG_URL`)", "búsqueda web desactivada (sin `SEARXNG_URL`)") });
  return { titulo: T("🤖 IA", "🤖 AI", "🤖 IA"), itens };
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
    if (!top.length) itens.push({ nivel: "ok", texto: T("nenhum erro nas últimas 24 h", "no errors in the last 24 h", "ningún error en las últimas 24 h") });
    for (const [t, n] of top) itens.push({ nivel: n >= 5 ? "aviso" : "info", texto: `${n}× \`${String(t).slice(0, 140)}\`` });
  } catch { itens.push({ nivel: "info", texto: T("histórico de erros indisponível", "error history unavailable", "historial de errores no disponible") }); }
  return { titulo: T("🧾 Erros recentes (só o dono do bot vê, valem para todos os servidores)", "🧾 Recent errors (bot owner only, across all servers)", "🧾 Errores recientes (solo los ve el dueño del bot, valen para todos los servidores)"), itens };
}

function secaoBot(d, T) {
  const up = process.uptime();
  const tempo = up >= 86400 ? `${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h` : up >= 3600 ? `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}min` : `${Math.floor(up / 60)}min`;
  const mem = Math.round(process.memoryUsage().rss / 1048576);
  return { titulo: T("🤖 Bot", "🤖 Bot", "🤖 Bot"), itens: [
    { nivel: "info", texto: T(`no ar há ${tempo} · ${mem} MB de memória`, `up for ${tempo} · ${mem} MB of memory`, `en línea desde hace ${tempo} · ${mem} MB de memoria`) },
    ...(d.latenciaMs != null ? [{ nivel: d.latenciaMs > 2000 ? "aviso" : "info", texto: T(`API do Stoat: ${d.latenciaMs} ms`, `Stoat API: ${d.latenciaMs} ms`, `API de Stoat: ${d.latenciaMs} ms`) }] : []),
  ] };
}

// ─── Montagem ────────────────────────────────────────────────────────────────
// `l`: o idioma da tela ("pt" | "en" | "es"); o espanhol sai pronto
export async function relatorioCompleto(d, lang = "pt", l = lang) {
  const T = (pt, en, es) => (l === "es" && es !== undefined ? trechoPronto(es) : lang === "en" ? en : pt);
  const secoes = [
    secaoBot(d, T),
    secaoPermissoes(d, T),
    secaoHierarquia(d, T),
    secaoCanaisConfigurados(d, T),
    secaoCanaisGerais(d, T, l),
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
    ? T(`**${erros.length} problema(s)** · ${avisos.length} aviso(s)`, `**${erros.length} problem(s)** · ${avisos.length} warning(s)`, `**${erros.length} problema(s)** · ${avisos.length} aviso(s)`)
    : avisos.length ? T(`Nada quebrado · ${avisos.length} aviso(s)`, `Nothing broken · ${avisos.length} warning(s)`, `Nada roto · ${avisos.length} aviso(s)`)
      : T("✅ Tudo em ordem.", "✅ All good.", "✅ Todo en orden."));
  if (erros.length) {
    linhas.push("", T("**🔧 Resolva primeiro**", "**🔧 Fix these first**", "**🔧 Resuelve esto primero**"));
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
  linhas.push("", T("_Detalhes: `" + citarInterno("debug") + " @pessoa` · `" + citarInterno("debug") + " #canal`_", "_Details: `" + citarInterno("debug") + " @person` · `" + citarInterno("debug") + " #channel`_", "_Detalles: `" + citar("debug", "es") + " @usuario` · `" + citar("debug", "es") + " #canal`_"));
  return { titulo: T("🩺 Diagnóstico do servidor", "🩺 Server diagnostics", "🩺 Diagnóstico del servidor"), texto: linhas.join("\n"), erros: erros.length, avisos: avisos.length };
}

// &debug @pessoa — o que o bot consegue fazer com ela
export function relatorioPessoa(d, member, alvoId, lang = "pt", l = lang) {
  const T = (pt, en, es) => (l === "es" && es !== undefined ? trechoPronto(es) : lang === "en" ? en : pt);
  const L = [];
  if (!member) return { titulo: T("🔎 Pessoa", "🔎 Person", "🔎 Usuario"), texto: T(`<@${alvoId}> não é membro deste servidor.`, `<@${alvoId}> isn't a member of this server.`, `<@${alvoId}> no es miembro de este servidor.`) };
  const topoBot = d.botMember ? rankDoMembro(d.server, d.botMember) : null;
  const topoAlvo = rankDoMembro(d.server, member);
  const dono = d.server?.ownerId === alvoId || d.server?.owner === alvoId;
  const acima = topoBot !== null && topoAlvo <= topoBot;
  const temTimeout = (() => { try { return !!member.hasPermission?.(d.server, "TimeoutMembers"); } catch { return false; } })();

  L.push(`**${T("Pessoa", "Person", "Usuario")}:** <@${alvoId}> · ${idsDeCargos(member).length} ${T("cargo(s)", "role(s)", "rol(es)")}`);
  if (dono) L.push(T("👑 dono do servidor — nenhuma punição o alcança", "👑 server owner — no punishment reaches them", "👑 dueño del servidor — ningún castigo le alcanza"));
  else if (acima) L.push(T("🔴 está na altura do cargo do bot ou acima — o bot não consegue punir nem dar cargos a ela", "🔴 sits at or above the bot's role — the bot can't punish or give roles to them", "🔴 está a la altura del rol del bot o por encima — el bot no puede castigarle ni darle roles"));
  else L.push(T("🟢 está abaixo do bot — ele consegue editar essa pessoa", "🟢 sits below the bot — it can edit this person", "🟢 está por debajo del bot — puede editar a esta persona"));

  // silêncio
  if (!dono) {
    if (temTimeout) L.push(T("🔴 silêncio: tem **TimeoutMembers** — o Stoat não deixa ninguém silenciá-la", "🔴 silence: has **TimeoutMembers** — the Stoat won't let anyone time them out", "🔴 silencio: tiene **TimeoutMembers** — Stoat no deja que nadie le silencie"));
    else if (botTem(d.server, "TimeoutMembers") === false) L.push(T("🔴 silêncio: o bot não tem **TimeoutMembers**", "🔴 silence: the bot lacks **TimeoutMembers**", "🔴 silencio: al bot le falta **TimeoutMembers**"));
    else if (!acima) L.push(T("🟢 silêncio: funciona com essa pessoa", "🟢 silence: works on this person", "🟢 silencio: funciona con esta persona"));
  }
  if (member.timeout && new Date(member.timeout).getTime() > Date.now())
    L.push(T(`🔇 silenciada agora, até ${new Date(member.timeout).toISOString().slice(0, 16).replace("T", " ")} UTC`, `🔇 timed out now, until ${new Date(member.timeout).toISOString().slice(0, 16).replace("T", " ")} UTC`, `🔇 silenciado ahora, hasta ${new Date(member.timeout).toISOString().slice(0, 16).replace("T", " ")} UTC`));

  // punições
  const p = (() => { try { return db.lerPunicao(d.serverId, alvoId); } catch { return null; } })();
  const vigentes = db.avisosVigentes(p, validadeDosAvisos(d.pol));
  if (vigentes) L.push(T(`⚠️ ${vigentes} aviso(s) valendo — de ${escadaDePunicao(d.pol).length} até o ban`, `⚠️ ${vigentes} active warning(s) — of ${escadaDePunicao(d.pol).length} until a ban`, `⚠️ ${vigentes} aviso(s) vigente(s) — de ${escadaDePunicao(d.pol).length} hasta el ban`));
  else if (p?.avisos) L.push(T(`✓ ${p.avisos} aviso(s) antigo(s), já vencido(s)`, `✓ ${p.avisos} old warning(s), already expired`, `✓ ${p.avisos} aviso(s) antiguo(s), ya vencido(s)`));

  // cargos de nível
  if (d.config?.xp?.enabled && d.cargosNivel.length) {
    const nivel = (() => { try { return db.getXp(d.serverId, alvoId)?.nivel ?? 0; } catch { return 0; } })();
    const devidos = d.cargosNivel.filter((c) => c.nivel <= nivel).map((c) => c.roleId);
    const atuais = new Set(idsDeCargos(member));
    const faltam = devidos.filter((id) => !atuais.has(id));
    if (!devidos.length) L.push(T(`🎖 nível ${nivel} — ainda sem cargo de nível`, `🎖 level ${nivel} — no level role yet`, `🎖 nivel ${nivel} — todavía sin rol de nivel`));
    else if (!faltam.length) L.push(T(`🎖 nível ${nivel} — cargos de nível em dia`, `🎖 level ${nivel} — level roles up to date`, `🎖 nivel ${nivel} — roles de nivel al día`));
    else L.push(T(`🟡 nível ${nivel} — faltam ${faltam.map((id) => `<%${id}>`).join(" ")}${acima ? " (e o bot não alcança)" : " → `" + citarInterno("xp.sincronizar") + " @pessoa`"}`,
      `🟡 level ${nivel} — missing ${faltam.map((id) => `<%${id}>`).join(" ")}${acima ? " (and the bot can't reach them)" : " → `" + citarInterno("xp.sincronizar") + " @person`"}`, `🟡 nivel ${nivel} — faltan ${faltam.map((id) => `<%${id}>`).join(" ")}${acima ? " (y el bot no los alcanza)" : " → `" + citar("xp.sincronizar", "es") + " @usuario`"}`));
  }
  return { titulo: T("🔎 O bot e essa pessoa", "🔎 The bot and this person", "🔎 El bot y esta persona"), texto: L.join("\n") };
}

// ─── O comando ───────────────────────────────────────────────────────────────
export async function cmdDebug(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, config, serverId, client } = ctx;
  const lang = lingua(ctx);
  const l = idiomaDe(ctx);   // o idioma da tela ("pt" | "en" | "es")
  const T = (pt, en, es) => tr(ctx, pt, en, es);

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { title: T("🚫 Permissão insuficiente", "🚫 Missing permission", "🚫 Permiso insuficiente"),
      description: T("Você precisa de **ManagePermissions** para ver o diagnóstico.", "You need **ManagePermissions** to see the diagnostics.", "Necesitas **ManagePermissions** para ver el diagnóstico."), colour: COR.erro });
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
    const r = relatorioPessoa(d, member, pessoaId, lang, l);
    return sendEmbed(message.channel, { title: r.titulo, description: r.texto, colour: COR.info });
  }

  // &debug #canal (menção, ID ou nome)
  if (arg && !legado) {
    const canais = (server?.channels ?? []).map((c) => (typeof c === "string" ? client?.channels?.get?.(c) : c)).filter(Boolean);
    const id = /^<#([A-Z0-9]{26})>$/i.exec(arg)?.[1] ?? arg;
    const alvo = args.join(" ").replace(/^#/, "").toLowerCase();
    let canal = canais.find((c) => c?.id === id) ?? canais.find((c) => String(c?.name ?? "").toLowerCase() === alvo)
      ?? canais.find((c) => String(c?.name ?? "").toLowerCase().includes(alvo));
    // Menção/ID de um canal que não está no cache: pergunta à API (15 out
    // 2026 — o canal ao qual a Judy acabara de ganhar acesso dava "Não achei")
    if (!canal && /^[A-Z0-9]{26}$/i.test(id)) {
      const daApi = await client?.channels?.fetch?.(id).catch(() => null);
      const sidDele = daApi?.serverId ?? daApi?.server?.id ?? null;
      if (daApi && (!sidDele || sidDele === (serverId ?? server?.id))) canal = daApi;
      else {
        return sendEmbed(message.channel, { title: T("🔒 Não vejo esse canal", "🔒 I can't see that channel", "🔒 No veo ese canal"), colour: COR.aviso,
          description: daApi
            ? T("Esse canal é de **outro servidor**.", "That channel belongs to **another server**.", "Ese canal es de **otro servidor**.")
            : T(`O Stoat não me deixa abrir <#${id}>: falta **Ver canal** para o cargo da Judy nele (permissões do canal, ou da categoria acima dele).

_Se você acabou de dar a permissão e eu continuo sem ver, me reinicie (\`docker compose restart\`)._`,
                `Stoat won't let me open <#${id}>: Judy's role is missing **View channel** there (the channel's permissions, or the category above it).

_If you just granted it and I still can't see it, restart me (\`docker compose restart\`)._`,
                `Stoat no me deja abrir <#${id}>: al rol de Judy le falta **Ver canal** ahí (los permisos del canal, o de la categoría de arriba).

_Si acabas de dar el permiso y sigo sin verlo, reiníciame (\`docker compose restart\`)._`) });
      }
    }
    if (!canal) {
      return sendEmbed(message.channel, { title: T("🔍 Não achei", "🔍 Not found", "🔍 No lo encontré"),
        description: T(`Nenhuma pessoa ou canal com "${args.join(" ")}".\n\n\`${citarInterno("debug", PREFIXO)}\` · \`${citarInterno("debug", PREFIXO)} @pessoa\` · \`${citarInterno("debug", PREFIXO)} #canal\``,
          `No person or channel matching "${args.join(" ")}".\n\n\`${citarInterno("debug", PREFIXO)}\` · \`${citarInterno("debug", PREFIXO)} @person\` · \`${citarInterno("debug", PREFIXO)} #channel\``, `Ningún usuario ni canal con "${args.join(" ")}".\n\n\`${citar("debug", "es", PREFIXO)}\` · \`${citar("debug", "es", PREFIXO)} @usuario\` · \`${citar("debug", "es", PREFIXO)} #canal\``), colour: COR.aviso });
    }
    const rastro = perms.rastrearPermissoes(server, canal, botMember, client, l);
    return sendEmbed(message.channel, {
      title: T("🔬 A conta de permissão em ", "🔬 Permission math in ", "🔬 El cálculo de permisos en ") + (canal.name ?? canal.id),
      description: ("```\n" + rastro.join("\n") + "\n```").slice(0, 1950), colour: COR.info });
  }

  // &debug (e os nomes antigos)
  let r;
  try { r = await relatorioCompleto(d, lang, l); }
  catch (e) {
    console.error("[DEBUG]", descreverErro(e));
    return sendEmbed(message.channel, { title: T("❌ O diagnóstico falhou", "❌ Diagnostics failed", "❌ El diagnóstico falló"), description: descreverErro(e, lang), colour: COR.erro });
  }
  const nota = legado ? T(`_\`${citarInterno("debug", PREFIXO)} ${arg}\` virou parte do diagnóstico completo._\n\n`, `_\`${citarInterno("debug", PREFIXO)} ${arg}\` is now part of the full diagnostics._\n\n`, `_\`${citar("debug", "es", PREFIXO)} ${arg}\` ahora es parte del diagnóstico completo._\n\n`) : "";
  return sendEmbed(message.channel, { title: r.titulo, description: nota + r.texto, colour: r.erros ? COR.erro : r.avisos ? COR.aviso : COR.sucesso });
}
