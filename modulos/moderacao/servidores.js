// &servidores — painel do dono do bot (SUPER_ADMINS). Só no grupo "dono" do &help, e só na
// DM com a Judy (P4, 2 nov 2026: num servidor o main.js responde só a linha da DM).
//
//   &servidores                          → onde o bot está: membros e ritmo; os erros das últimas 24 h
//   &servidores relatorio                → como está o relatório horário (vai à DM do dono)
//   &servidores relatorio agora          → a última hora, já, na DM (não esvazia a contagem)
//   &servidores relatorio on|off
//   &servidores relatorio vazias on|off  → mandar (ou pular) as horas sem nada
//   &servidores pseudonimo <id> [id…]    → como esse ID aparece no log (privacidade P2)
//   &servidores aviso <texto>            → (P2) prévia; com o ✅ do dono, vai ao canal de log de cada servidor
//   &servidores palavras                 → (P2) o que tentam digitar e não existe; os comandos nunca usados
//
// (P2, 31 out 2026) as telas saem nos três idiomas e só com o resultado (R1/R2).

import { porMinuto, tempoDePe, listarServidores } from "../core/metricas.js";
import { contarMembros } from "../core/membros.js";
import { limparId } from "../core/ids.js";
import * as relatorio from "../ferramentas/relatorio.js";
import * as modelo from "./modelo.js";   // (P4, revisão) o estado da IA com o detalhe, só aqui (na DM)
import * as store from "../core/config-store.js";
import * as db from "../core/db.js";
import { pseudonimo } from "../core/pseudonimo.js";
import { citar } from "../core/aliases.js";
import { tr, idiomaDe } from "../core/i18n.js";
import { descreverErro, registrarErro } from "../core/erros.js";
import { textoDeFora } from "../core/seguranca.js";
import { anunciarNoLog } from "../ferramentas/novidades.js";
import { REGISTRO } from "../comandos/index.js";
import * as classificador from "./classificador-texto.js";      // (P5) o estado do classificador de texto
import * as tempoAutomod from "../core/tempo-automod.js";       // (P5) o tempo do automod por mensagem

const T = (ctx, pt, en, es) => tr(ctx, pt, en, es);
const ajudaDe = (ctx, ref) => `\`${citar("help", "pt", ctx.PREFIXO ?? "&")} ${citar(ref, "pt", "")}\``;

export async function cmdServidores(message, args, ctx) {
  const { sendEmbed, COR, client, ehSuperAdmin } = ctx;
  if (!ehSuperAdmin?.(message.authorId)) {
    return sendEmbed(message.channel, { colour: COR.erro, title: T(ctx, "🚫 Comando restrito", "🚫 Restricted command", "🚫 Comando restringido"), description: T(ctx, "Só o dono do bot.", "Bot owner only.", "Solo el dueño del bot.") });
  }
  // (31 out 2026, R9) num servidor, os números dos outros ficavam à vista. (P4, 2 nov 2026) Só na DM:
  // o main.js barra o comando de dono num servidor (até no do relatório) antes de chegar aqui.
  const sub = args[0]?.toLowerCase();
  if (sub === "relatorio" || sub === "relatório" || sub === "report") return cmdRelatorio(message, args.slice(1), ctx);
  if (sub === "aviso") return cmdAviso(message, args.slice(1), ctx);
  if (["adulto", "+18", "18", "nsfw", "adult"].includes(sub)) {
    // (22 out 2026) o modo +18 da IA saiu — o subcomando só avisa (P4: o texto sem o chat, que saiu)
    return sendEmbed(message.channel, { colour: COR.info, title: T(ctx, "🔞 +18 da IA: removido", "🔞 AI 18+: removed", "🔞 +18 de la IA: eliminado"), description: T(ctx,
      "A IA não tem modo adulto: ela ficou só na moderação (a conversa e a geração de imagem saíram). A moderação do que os membros postam continua igual em todo servidor e canal, inclusive canais NSFW.",
      "The AI has no adult mode: it's only in moderation now (chat and image generation are gone). Moderation of what members post is the same on every server and channel, NSFW channels included.",
      "La IA no tiene modo adulto: quedó solo en la moderación (la conversación y la generación de imágenes salieron). La moderación de lo que publican los miembros sigue igual en todo servidor y canal, incluidos los canales NSFW.") });
  }
  if (sub === "palavras") return cmdPalavras(message, ctx);
  // O log guarda os IDs como pseudônimo: para procurar alguém, o dono calcula como o ID aparece lá.
  if (sub === "pseudonimo") {
    const ids = args.slice(1).map((a) => limparId(a)).filter(Boolean);
    if (!ids.length) return sendEmbed(message.channel, { colour: COR.erro, description: `❓ ${ajudaDe(ctx, "servidores")}` });
    return sendEmbed(message.channel, { title: "🕶️", colour: COR.info, description: ids.map((id) => `\`${id}\` → \`${pseudonimo(id)}\``).join("\n") });
  }

  let lista = [];
  try { lista = listarServidores(client); } catch (e) {
    return sendEmbed(message.channel, { colour: COR.erro, description: `❌ ${descreverErro(e)}` });
  }
  if (!lista.length) return sendEmbed(message.channel, { colour: COR.aviso, description: T(ctx, "🌐 Nenhum servidor visível pela API.", "🌐 No server visible through the API.", "🌐 Ningún servidor visible por la API.") });

  const dados = (await Promise.all(lista.map(async (srv) => ({
    id: srv?.id, nome: srv?.name ?? srv?.id, membros: await contarMembros(srv).catch(() => null), mpm: porMinuto(srv?.id),
  })))).sort((a, b) => b.mpm - a.mpm || (b.membros ?? 0) - (a.membros ?? 0));

  // (31 out 2026, R9) individualmente, só quem aderiu ao relatório: os do dono
  // (completos) e os que ligaram `&config log relatorio on` (por pseudônimo, sem nome).
  let total = 0, mpmTotal = 0;
  const ritmo = (mpm) => (mpm >= 0.1 ? `${mpm.toFixed(1)} msg/min` : mpm > 0 ? "<0.1 msg/min" : "0 msg/min");
  const membrosTxt = (n) => (typeof n === "number" ? T(ctx, `${n} membro(s)`, `${n} member(s)`, `${n} miembro(s)`) : "?");
  const outros = { n: 0, membros: 0, mpm: 0 };
  const linhas = [];
  for (const d of dados) {
    if (typeof d.membros === "number") total += d.membros;
    mpmTotal += d.mpm;
    const modo = relatorio.modoDe(d.id);
    if (modo !== "completo" && modo !== "anonimo") {
      outros.n++; outros.membros += typeof d.membros === "number" ? d.membros : 0; outros.mpm += d.mpm;
      continue;
    }
    const quem = modo === "completo" ? `**${d.nome}** \`${d.id}\`` : `🕶️ \`${pseudonimo(d.id)}\``;
    linhas.push(`${quem} — ${membrosTxt(d.membros)} · ${ritmo(d.mpm)}`);
  }
  if (outros.n) linhas.push(T(ctx,
    `_+ ${outros.n} servidor(es) que não aderiram: ${membrosTxt(outros.membros)} · ${ritmo(outros.mpm)}_`,
    `_+ ${outros.n} server(s) that didn't opt in: ${membrosTxt(outros.membros)} · ${ritmo(outros.mpm)}_`,
    `_+ ${outros.n} servidor(es) que no se adhirieron: ${membrosTxt(outros.membros)} · ${ritmo(outros.mpm)}_`));
  linhas.push("", `**${T(ctx, "Total", "Total", "Total")}:** ${membrosTxt(total)} · ${ritmo(mpmTotal)} · ${tempoDePe()}`);
  // (P4, revisão) o tamanho da lista global (antes no `&banglobal` do dono, num canal de servidor)
  try {
    const n = db.usuariosBanidosDistintos();
    linhas.push(T(ctx, `**🌐 Lista global:** ${n} pessoa(s)`, `**🌐 Global list:** ${n} person(s)`, `**🌐 Lista global:** ${n} persona(s)`));
  } catch (e) { registrarErro("SERVIDORES", e); }
  // (P4, revisão) o estado da IA da moderação COM o detalhe (o nome da variável, o erro do serviço): no
  // `&debug` de um servidor a staff vê só o estado (R10); o dono, que mexe na máquina, vê aqui, na DM
  linhas.push(await linhaDaIA(ctx));
  // (P5, 3 nov 2026) o classificador de texto e o tempo do automod (R11: medir antes de otimizar)
  linhas.push(linhaDoClassificador(ctx), ...linhasDoTempo(ctx));
  // (P4, 2 nov 2026) os erros de todos os servidores: antes no `&debug` de um servidor (R13), agora aqui, na DM
  let erros = null;
  try { erros = relatorio.errosRecentes(); } catch (e) { registrarErro("SERVIDORES", e); }
  linhas.push("", `**🧾 ${T(ctx, "Erros (24 h)", "Errors (24 h)", "Errores (24 h)")}**`, ...(erros === null
    ? [T(ctx, "histórico de erros indisponível", "error history unavailable", "historial de errores no disponible")]
    : erros.length ? erros.map(([t, n]) => `${n}× \`${String(t).slice(0, 140)}\``)
      : [T(ctx, "nenhum erro nas últimas 24 h", "no errors in the last 24 h", "ningún error en las últimas 24 h")]));
  return sendEmbed(message.channel, { title: `🌐 ${T(ctx, "Servidores", "Servers", "Servidores")} (${dados.length})`, description: linhas.join("\n"), colour: COR.info });
}

// (P5) O classificador de texto: ligado (com o quê), sem arquivo, de outra versão, inválido ou desligado.
// Só o motivo da validação, nunca o caminho (R10). (P5, integração) A ORIGEM do arquivo (variável,
// pasta do banco, código — o rótulo, sem caminho) e a versão do modelo (8 hex do SHA-256 do arquivo):
// depois de um `docker cp` + restart, o dono confere aqui que o modelo novo entrou.
export function linhaDoClassificador(ctx) {
  const rotulo = `**🧠 ${T(ctx, "Classificador de texto", "Text classifier", "Clasificador de texto")}:**`;
  let e = classificador.estado();
  if (e.situacao === "nao-carregado") { classificador.carregar(); e = classificador.estado(); }
  const rotuloDe = (o) => T(ctx, classificador.ORIGENS[o].pt, classificador.ORIGENS[o].en, classificador.ORIGENS[o].es);
  const deOnde = e.origem ? ` · ${T(ctx, "origem", "source", "origen")}: ${rotuloDe(e.origem)}` : "";
  const versao = e.modelo ? ` · ${T(ctx, "modelo", "model", "modelo")} \`${e.modelo}\`` : "";
  if (e.situacao === "ligado") {
    return `${rotulo} ${T(ctx, "ligado", "on", "activado")} — ${e.classes.join(", ")} · ${e.pesos} ${T(ctx, "peso(s)", "weight(s)", "peso(s)")}`
      + `${e.treinadoEm ? ` · ${T(ctx, "treinado em", "trained on", "entrenado el")} ${e.treinadoEm.slice(0, 10)}` : ""}${versao}${deOnde}`;
  }
  if (e.situacao === "desligado") return `${rotulo} ${T(ctx, "desligado", "off", "desactivado")} (\`CLASSIFICADOR_TEXTO=0\`)`;
  if (e.situacao === "ausente") {
    return `${rotulo} ${T(ctx, "sem o arquivo do modelo (o sentinela segue sem ele)", "no model file (the sentinel works without it)", "sin el archivo del modelo (el centinela sigue sin él)")}`
      + `${e.procurados.length ? ` · ${T(ctx, "procurado em", "looked in", "buscado en")}: ${e.procurados.map(rotuloDe).join(", ")}` : ""}`;
  }
  const qual = e.situacao === "outra-versao"
    ? T(ctx, "arquivo de outra versão dos sinais", "file from another signal version", "archivo de otra versión de las señales")
    : T(ctx, "arquivo inválido", "invalid file", "archivo inválido");
  return `${rotulo} ${qual} (${String(e.detalhe ?? "").replace(/`/g, "").slice(0, 120)}) — ${T(ctx, "o sentinela segue sem ele", "the sentinel works without it", "el centinela sigue sin él")}${versao}${deOnde}`;
}

// (P5) O tempo do automod por mensagem: a hora atual (até agora) e a anterior, p50/p95/máx por etapa.
export function linhasDoTempo(ctx, agora = Date.now()) {
  const idioma = idiomaDe(ctx);
  const h = tempoAutomod.horaDe(agora);
  const atual = tempoAutomod.descrever(tempoAutomod.resumo(h), idioma);
  const anterior = tempoAutomod.descrever(tempoAutomod.resumo(h - 1), idioma);
  if (!atual && !anterior) return [`**⏱️ Automod:** ${T(ctx, "nenhuma mensagem medida nas últimas 2 h", "no messages measured in the last 2 h", "ningún mensaje medido en las últimas 2 h")}`];
  const out = [];
  if (atual) out.push(`**⏱️ Automod (${T(ctx, "esta hora", "this hour", "esta hora")}):** ${atual}`);
  if (anterior) out.push(`**⏱️ Automod (${T(ctx, "hora anterior", "previous hour", "hora anterior")}):** ${anterior}`);
  return out;
}

async function linhaDaIA(ctx) {
  const rotulo = `**🤖 ${T(ctx, "IA da moderação", "Moderation AI", "IA de la moderación")}:**`;
  if (!modelo.ligada()) return `${rotulo} ${T(ctx, "desligada", "off", "desactivada")} (\`IA=0\`)`;
  const partes = [modelo.temJuiz() ? T(ctx, "juiz ✓", "judge ✓", "juez ✓") : T(ctx, "sem juiz", "no judge", "sin juez") + " (`LLM_URL`)"];
  if (!modelo.temServico()) partes.push(T(ctx, "sem serviço", "no service", "sin servicio") + " (`IA_SERVICO_URL`)");
  else {
    try {
      const s = await modelo.saude();
      partes.push(s.alcancavel ? T(ctx, `modelo ✓ (${s.modelos.length})`, `model ✓ (${s.modelos.length})`, `modelo ✓ (${s.modelos.length})`)
        : T(ctx, "o servidor do modelo não responde", "the model server doesn't answer", "el servidor del modelo no responde") + " (`LLM_URL`)");
    } catch (e) {
      partes.push(`${T(ctx, "serviço fora do ar", "service down", "servicio caído")} (\`IA_SERVICO_URL\`: ${String(e?.message ?? e).replace(/`/g, "").slice(0, 120)})`);
    }
    partes.push(modelo.modeloVisao() ? T(ctx, "visão ✓", "vision ✓", "visión ✓") : T(ctx, "sem visão", "no vision", "sin visión") + " (`MODELO_VISAO`)");
  }
  return `${rotulo} ${partes.join(" · ")}`;
}

// ── &servidores aviso <texto> ── (P2) uma mensagem do dono do bot a todos os servidores,
// no canal de LOG de cada um (servidor sem log não recebe). Mostra a prévia e só publica
// com o ✅ do próprio dono (aoReagirAviso, chamado pelo main.js), em até 10 min.
const AVISO_TTL_MS = 10 * 60_000;
const avisosPendentes = new Map();   // msgId → { autorId, texto, ate }
export const TITULO_AVISO = { pt: "📣 Aviso do dono da Judy", en: "📣 A notice from Judy's owner", es: "📣 Aviso del dueño de Judy" };

async function cmdAviso(message, args, ctx) {
  const { sendEmbed, COR } = ctx;
  // o texto como foi digitado (com as quebras de linha), sem o `&servidores aviso`
  const bruto = String(message.content ?? "").replace(/^\S+\s+\S+\s*/, "").trim() || args.join(" ").trim();
  const texto = textoDeFora(bruto, { max: 1800 });
  if (!texto) return sendEmbed(message.channel, { colour: COR.erro, description: `❓ ${ajudaDe(ctx, "servidores")}` });
  const comLog = [...(ctx.client?.servers?.values?.() ?? [])].filter((s) => store.configDoServidor(s.id)?.log?.canalId).length;
  const previa = await sendEmbed(message.channel, {
    title: T(ctx, TITULO_AVISO.pt, TITULO_AVISO.en, TITULO_AVISO.es),
    description: `${texto}\n\n${T(ctx, `✅ publica em ${comLog} servidor(es) com canal de log (10 min).`, `✅ posts to ${comLog} server(s) with a log channel (10 min).`, `✅ lo publica en ${comLog} servidor(es) con canal de registro (10 min).`)}`,
    colour: COR.aviso,
  });
  if (!previa?.id) return previa;
  for (const [id, p] of avisosPendentes) if (p.ate < Date.now()) avisosPendentes.delete(id);
  avisosPendentes.set(previa.id, { autorId: message.authorId, texto, ate: Date.now() + AVISO_TTL_MS, canal: message.channel });
  try { await previa.react?.(encodeURIComponent("✅")); }
  catch (e) { registrarErro("SERVIDORES:aviso-react", e); }
  return previa;
}

// O ✅ na prévia. true = a reação era deste painel (publicou ou recusou em silêncio).
export async function aoReagirAviso(msgId, userId, emoji, { client, criarContexto, enviar = null } = {}) {
  const p = avisosPendentes.get(msgId);
  if (!p) return false;
  let e = String(emoji ?? "");
  try { e = decodeURIComponent(e); } catch { /* emoji já decodificado */ }
  if (e.replace(/️/g, "") !== "✅") return false;
  if (userId !== p.autorId) return true;   // só o próprio dono confirma
  avisosPendentes.delete(msgId);
  if (p.ate < Date.now()) return true;
  const r = await anunciarNoLog(client, (lang) => ({ title: TITULO_AVISO[lang], description: p.texto, colour: "#5865F2" }), {
    configDoServidor: store.configDoServidor,
    enviar: enviar ?? ((canal, emb, sid) => criarContexto(sid).sendEmbed(canal, emb)),
  });
  try {
    await criarContexto(p.canal?.serverId ?? null).sendEmbed(p.canal, { description: `✅ ${r.enviados} · ⛔ ${r.semLog}${r.falhas ? ` · ❌ ${r.falhas}` : ""}`, colour: "#22C55E" });
  } catch (err) { registrarErro("SERVIDORES:aviso-fim", err); }
  return true;
}
export const _avisosPendentes = avisosPendentes;   // testes

// ── &servidores palavras ── (P2) o bot cresce pelo uso
async function cmdPalavras(message, ctx) {
  const { sendEmbed, COR } = ctx;
  const palavras = db.palavrasTentadas({ limite: 25 });
  const uso = db.usoDeComandos();
  const nunca = REGISTRO.map((c) => c.id).filter((id) => !uso[id]);
  const P = ctx.PREFIXO ?? "&";
  const linhas = [
    `**${T(ctx, "Tentadas e inexistentes", "Tried, not existing", "Intentadas e inexistentes")}** _(${db.PALAVRAS_DIAS} ${T(ctx, "dias", "days", "días")})_`,
    palavras.length ? palavras.map((x) => `\`${P}${x.palavra}\` ${x.servidores}×🌐 ${x.vezes}×`).join(" · ") : "—",
    "",
    `**${T(ctx, "Nunca usados", "Never used", "Nunca usados")}**`,
    nunca.length ? nunca.map((id) => `\`${citar(id, "pt", P)}\``).join(" ") : "—",
  ];
  return sendEmbed(message.channel, { title: "🔎", description: linhas.join("\n"), colour: COR.info });
}

async function cmdRelatorio(message, args, ctx) {
  const { sendEmbed, COR, client } = ctx;
  // (P4) a config antiga (com o canal) é lida sem quebrar: relatorio.configDoRelatorio
  const cfg = relatorio.configDoRelatorio(store.getGlobal());
  const salvar = () => store.salvarGlobal();
  const sub = args[0]?.toLowerCase();
  const ok = (pt, en, es) => sendEmbed(message.channel, { colour: COR.sucesso, description: T(ctx, pt, en, es) });
  const erro = (pt, en, es) => sendEmbed(message.channel, { colour: COR.erro, description: T(ctx, pt, en, es) });

  // (P4, 2 nov 2026) o relatório vai à DM do dono do bot: o `canal` saiu
  if (sub === "on" || sub === "off") {
    cfg.ativo = sub === "on"; salvar();
    return ok(`📊 ${estadoDe(cfg, "pt")}`, `📊 ${estadoDe(cfg, "en")}`, `📊 ${estadoDe(cfg, "es")}`);
  }
  if (sub === "vazias") {
    cfg.pularVazias = args[1]?.toLowerCase() === "off"; salvar();
    return ok(`📊 ${cfg.pularVazias ? "horas vazias puladas" : "horas vazias enviadas"}`, `📊 ${cfg.pularVazias ? "empty hours skipped" : "empty hours sent"}`, `📊 ${cfg.pularVazias ? "horas vacías omitidas" : "horas vacías enviadas"}`);
  }
  if (sub === "agora") {
    await sendEmbed(message.channel, { colour: COR.info, description: T(ctx, "⏳ Montando o relatório…", "⏳ Building the report…", "⏳ Armando el informe…") });
    const rel = await relatorio.gerar({ client, cfg, esvaziar: false });
    // (P4) a mesma entrega do relatório por hora: a DM do dono do bot (o painel não é de servidor nenhum)
    const enviarGlobal = ctx.criarContexto?.(null)?.sendEmbed ?? sendEmbed;
    const r = await relatorio.entregar(rel, { client, enviar: (canal, emb) => enviarGlobal(canal, { ...emb, colour: COR.info }) });
    return r ?? erro("❌ A DM do dono do bot não abriu.", "❌ The bot owner's DM didn't open.", "❌ No se abrió la DM del dueño del bot.");
  }
  if (sub) return erro(`❓ ${ajudaDe(ctx, "servidores.relatorio")}`, `❓ ${ajudaDe(ctx, "servidores.relatorio")}`, `❓ ${ajudaDe(ctx, "servidores.relatorio")}`);

  return sendEmbed(message.channel, {
    title: T(ctx, "📊 Relatório horário", "📊 Hourly report", "📊 Informe por hora"),
    description: [
      `${T(ctx, "**Estado:**", "**State:**", "**Estado:**")} ${T(ctx, estadoDe(cfg, "pt"), estadoDe(cfg, "en"), estadoDe(cfg, "es"))}`,
      `${T(ctx, "**Horas vazias:**", "**Empty hours:**", "**Horas vacías:**")} ${cfg.pularVazias ? "⏭️" : "✅"}`,
    ].join("\n"),
    colour: COR.info,
  });
}

// (P4) ligado = à DM do dono do bot; desligado = 🔴
const estadoDe = (cfg, l) => (cfg.ativo === true ? { pt: "🟢 na sua DM", en: "🟢 in your DM", es: "🟢 por DM" }[l] : "🔴");
