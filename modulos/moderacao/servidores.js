// &servidores — painel do dono do bot (SUPER_ADMINS). Só no grupo "dono" do &help.
//
//   &servidores                          → onde o bot está: membros e ritmo
//   &servidores relatorio                → como está o relatório horário
//   &servidores relatorio canal <#canal|aqui>
//   &servidores relatorio agora          → a última hora, já (não esvazia a contagem)
//   &servidores relatorio on|off
//   &servidores relatorio vazias on|off  → mandar (ou pular) as horas sem nada
//   &servidores relatorio assuntos [add|remove <id> [id…]]
//   &servidores pseudonimo <id> [id…]    → como esse ID aparece no log (privacidade P2)
//   &servidores aviso <texto>            → (P2) prévia; com o ✅ do dono, vai ao canal de log de cada servidor
//   &servidores palavras                 → (P2) o que tentam digitar e não existe; os comandos nunca usados
//
// (P2, 31 out 2026) as telas saem nos três idiomas e só com o resultado (R1/R2).

import { porMinuto, tempoDePe, listarServidores } from "../core/metricas.js";
import { contarMembros } from "../core/membros.js";
import { limparId } from "../core/ids.js";
import * as relatorio from "../ferramentas/relatorio.js";
import * as store from "../core/config-store.js";
import * as db from "../core/db.js";
import { pseudonimo } from "../core/pseudonimo.js";
import { citar } from "../core/aliases.js";
import { tr } from "../core/i18n.js";
import { descreverErro, registrarErro } from "../core/erros.js";
import { textoDeFora } from "../core/seguranca.js";
import { anunciarNoLog } from "../ferramentas/novidades.js";
import { REGISTRO } from "../comandos/index.js";

const T = (ctx, pt, en, es) => tr(ctx, pt, en, es);
const ajudaDe = (ctx, ref) => `\`${citar("help", "pt", ctx.PREFIXO ?? "&")} ${citar(ref, "pt", "")}\``;

export async function cmdServidores(message, args, ctx) {
  const { sendEmbed, COR, client, ehSuperAdmin } = ctx;
  if (!ehSuperAdmin?.(message.authorId)) {
    return sendEmbed(message.channel, { colour: COR.erro, title: T(ctx, "🚫 Comando restrito", "🚫 Restricted command", "🚫 Comando restringido"), description: T(ctx, "Só o dono do bot.", "Bot owner only.", "Solo el dueño del bot.") });
  }
  // (31 out 2026, R9) O painel só abre no servidor do relatório (RELATORIO_SERVIDOR)
  // ou na DM do dono: num servidor qualquer, os números dos outros ficavam à vista.
  const fixo = relatorio.servidorDoRelatorio();
  const aqui = ctx.serverId ?? message.server?.id ?? message.channel?.serverId ?? null;
  if (aqui && aqui !== fixo) {
    return sendEmbed(message.channel, { colour: COR.erro, title: T(ctx, "🚫 Aqui não", "🚫 Not here", "🚫 Aquí no"), description: T(ctx,
      "Este painel só abre na DM ou no servidor do relatório.",
      "This panel only opens in DMs or in the report's server.",
      "Este panel solo se abre por DM o en el servidor del informe.") });
  }
  const sub = args[0]?.toLowerCase();
  if (sub === "relatorio" || sub === "relatório" || sub === "report") return cmdRelatorio(message, args.slice(1), ctx);
  if (sub === "aviso") return cmdAviso(message, args.slice(1), ctx);
  if (["adulto", "+18", "18", "nsfw", "adult"].includes(sub)) {
    // (22 out 2026) o modo +18 da IA saiu — o subcomando só avisa
    return sendEmbed(message.channel, { colour: COR.info, title: T(ctx, "🔞 +18 da IA: removido", "🔞 AI 18+: removed", "🔞 +18 de la IA: eliminado"), description: T(ctx,
      "A IA não tem modo adulto: chat e imagem recusam conteúdo sexual em qualquer servidor e canal, inclusive canais NSFW. A moderação do que os membros postam continua igual.",
      "The AI has no adult mode: chat and images refuse sexual content on every server and channel, NSFW channels included. Moderation of what members post is unchanged.",
      "La IA no tiene modo adulto: el chat y las imágenes rechazan contenido sexual en cualquier servidor y canal, incluidos los canales NSFW. La moderación de lo que publican los miembros sigue igual.") });
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
  return sendEmbed(message.channel, { title: `🌐 ${T(ctx, "Servidores", "Servers", "Servidores")} (${dados.length})`, description: linhas.join("\n"), colour: COR.info });
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
  const g = store.getGlobal();
  g.relatorio ??= { canalId: null, ativo: true, pularVazias: false, assuntos: [] };
  const cfg = g.relatorio;
  const salvar = () => store.salvarGlobal();
  const sub = args[0]?.toLowerCase();
  const ok = (pt, en, es) => sendEmbed(message.channel, { colour: COR.sucesso, description: T(ctx, pt, en, es) });
  const erro = (pt, en, es) => sendEmbed(message.channel, { colour: COR.erro, description: T(ctx, pt, en, es) });

  if (sub === "canal") {
    const alvo = ["aqui", "here"].includes(args[1]?.toLowerCase()) ? message.channel?.id : limparId(args[1] ?? "");
    if (!alvo) return erro(`❓ ${ajudaDe(ctx, "servidores.relatorio")}`, `❓ ${ajudaDe(ctx, "servidores.relatorio")}`, `❓ ${ajudaDe(ctx, "servidores.relatorio")}`);
    const fixo = relatorio.servidorDoRelatorio();
    if (fixo) {
      const canal = client.channels.get?.(alvo) ?? await client.channels.fetch?.(alvo).catch(() => null);
      if (canal?.serverId !== fixo) return erro("❌ O canal tem de ser do servidor do relatório.", "❌ The channel must be in the report's server.", "❌ El canal tiene que ser del servidor del informe.");
    }
    cfg.canalId = alvo; cfg.ativo = true; salvar();
    return ok(`📊 <#${alvo}> 🟢`, `📊 <#${alvo}> 🟢`, `📊 <#${alvo}> 🟢`);
  }
  if (sub === "on" || sub === "off") {
    cfg.ativo = sub === "on"; salvar();
    return ok(`📊 ${cfg.ativo ? "🟢" : "🔴"}${cfg.canalId ? ` <#${cfg.canalId}>` : " — sem canal"}`, `📊 ${cfg.ativo ? "🟢" : "🔴"}${cfg.canalId ? ` <#${cfg.canalId}>` : " — no channel"}`, `📊 ${cfg.ativo ? "🟢" : "🔴"}${cfg.canalId ? ` <#${cfg.canalId}>` : " — sin canal"}`);
  }
  if (sub === "vazias") {
    cfg.pularVazias = args[1]?.toLowerCase() === "off"; salvar();
    return ok(`📊 ${cfg.pularVazias ? "horas vazias puladas" : "horas vazias enviadas"}`, `📊 ${cfg.pularVazias ? "empty hours skipped" : "empty hours sent"}`, `📊 ${cfg.pularVazias ? "horas vacías omitidas" : "horas vacías enviadas"}`);
  }
  if (sub === "assuntos") {
    const acao = args[1]?.toLowerCase();
    const ids = [...new Set(args.slice(2).join(" ").split(/[\s,;]+/).map((x) => limparId(x)).filter(Boolean))];
    const nomeDe = (id) => client.servers.get(id)?.name;
    const fixo = relatorio.servidorDoRelatorio();
    const avisos = [];
    if ((acao === "add" || acao === "remove") && !ids.length) avisos.push(`❓ ${ajudaDe(ctx, "servidores.relatorio")}`);
    // (P4, privacidade) a conversa de um servidor ALHEIO não vai para o relatório
    const alheios = acao === "add" ? ids.filter((id) => !relatorio.ehDoDono(client.servers.get(id) ?? { id })) : [];
    if (alheios.length) avisos.push(`🔒 ${T(ctx, "Fora:", "Out:", "Fuera:")} ${alheios.map((x) => nomeDe(x) ? `**${nomeDe(x)}**` : `\`${x}\``).join(", ")} — ${T(ctx, "não é seu", "not yours", "no es tuyo")}`);
    if ((acao === "add" || acao === "remove") && ids.length) {
      const antes = new Set(cfg.assuntos ?? []);
      cfg.assuntos = (cfg.assuntos ?? []).filter((x) => !ids.includes(x));
      if (acao === "add") cfg.assuntos.push(...ids.filter((id) => id !== fixo && !alheios.includes(id)));
      salvar();
      const novos = acao === "add" ? ids.filter((id) => id !== fixo && !antes.has(id) && !alheios.includes(id)) : ids.filter((id) => antes.has(id));
      if (novos.length) avisos.push(`${acao === "add" ? T(ctx, "✅ Entraram:", "✅ Added:", "✅ Entraron:") : T(ctx, "✅ Saíram:", "✅ Removed:", "✅ Salieron:")} ${novos.map((x) => nomeDe(x) ? `**${nomeDe(x)}**` : `\`${x}\``).join(", ")}`);
    }
    const linha = (x, extra = "") => `• ${nomeDe(x) ? `**${nomeDe(x)}** ` : ""}\`${x}\`${extra}`;
    const listados = (cfg.assuntos ?? []).filter((x) => x !== fixo);
    const lista = [fixo ? linha(fixo, " _(RELATORIO_SERVIDOR — sempre)_") : null, ...listados.map((x) => linha(x))].filter(Boolean);
    return sendEmbed(message.channel, { title: "🗣️", colour: COR.info, description: [...(lista.length ? lista : ["—"]), ...(avisos.length ? ["", ...avisos] : [])].join("\n") });
  }
  if (sub === "agora") {
    await sendEmbed(message.channel, { colour: COR.info, description: T(ctx, "⏳ Montando o relatório…", "⏳ Building the report…", "⏳ Armando el informe…") });
    const rel = await relatorio.gerar({ client, cfg, esvaziar: false });
    let destino = cfg.canalId ? await client.channels.fetch(cfg.canalId).catch(() => message.channel) : message.channel;
    const fixo = relatorio.servidorDoRelatorio();
    if (fixo && destino?.serverId !== fixo) destino = message.channel;   // canal antigo de outro servidor
    // o painel é do dono do bot: o canal do relatório pode ser de outro servidor (o dele)
    const enviarGlobal = ctx.criarContexto?.(null)?.sendEmbed ?? sendEmbed;
    return enviarGlobal(destino, { title: rel.title, description: rel.description, colour: COR.info });
  }

  const estado = cfg.canalId && cfg.ativo !== false ? `🟢 <#${cfg.canalId}>` : cfg.canalId ? "⏸️" : "—";
  return sendEmbed(message.channel, {
    title: T(ctx, "📊 Relatório horário", "📊 Hourly report", "📊 Informe por hora"),
    description: [
      `${T(ctx, "**Estado:**", "**State:**", "**Estado:**")} ${estado}`,
      `${T(ctx, "**Horas vazias:**", "**Empty hours:**", "**Horas vacías:**")} ${cfg.pularVazias ? "⏭️" : "✅"}`,
      `${T(ctx, "**Modelo:**", "**Model:**", "**Modelo:**")} \`${process.env.LLM_MODEL_RELATORIO || process.env.LLM_MODEL || "—"}\``,
    ].join("\n"),
    colour: COR.info,
  });
}
