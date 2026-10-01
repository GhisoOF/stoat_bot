// &servidores — painel do dono do bot (SUPER_ADMINS). Não aparece no &help.
//
//   &servidores                          → onde o bot está: membros e ritmo
//   &servidores relatorio                → como está o relatório horário
//   &servidores relatorio canal <#canal|aqui>
//   &servidores relatorio agora          → a última hora, já (não esvazia a contagem)
//   &servidores relatorio on|off
//   &servidores relatorio vazias on|off  → mandar (ou pular) as horas sem nada
//   &servidores relatorio assuntos [add|remove <id> [id…]]
//
// Voltou depois de ter saído na versão pública: aqui ele só mostra números
// sobre os servidores do próprio bot de quem roda a instância.

import { porMinuto, tempoDePe, listarServidores } from "../core/metricas.js";
import { contarMembros } from "../core/membros.js";
import { limparId } from "../core/ids.js";
import * as relatorio from "../ferramentas/relatorio.js";
import * as store from "../core/config-store.js";

export async function cmdServidores(message, args, ctx) {
  const { sendEmbed, COR, client, ehSuperAdmin } = ctx;
  if (!ehSuperAdmin?.(message.authorId)) {
    return sendEmbed(message.channel, { title: "🚫 Comando restrito", description: "Só o dono do bot pode ver isso.", colour: COR.erro });
  }
  // Com RELATORIO_SERVIDOR, o painel só abre no servidor do dono: nos outros
  // servidores da Judy ele não mostra (nem confirma) nada.
  const fixo = relatorio.servidorDoRelatorio();
  // (a Message da stoat.js NÃO tem `serverId` — o servidor vem do ctx ou do
  // canal; com `message.serverId` o painel dizia "Aqui não" até no servidor certo)
  const aqui = ctx.serverId ?? message.server?.id ?? message.channel?.serverId ?? null;
  if (fixo && aqui !== fixo) {
    return sendEmbed(message.channel, { title: "🚫 Aqui não", description: "Este painel só funciona no servidor configurado em `RELATORIO_SERVIDOR`.", colour: COR.erro });
  }
  if (["relatorio", "relatório", "report"].includes(args[0]?.toLowerCase())) {
    return cmdRelatorio(message, args.slice(1), ctx);
  }

  let lista = [];
  try { lista = listarServidores(client); } catch (e) {
    return sendEmbed(message.channel, { title: "❌ Não consegui listar", description: String(e?.message ?? e), colour: COR.erro });
  }
  if (!lista.length) return sendEmbed(message.channel, { title: "🌐 Servidores", description: "Não enxerguei nenhum servidor pela API.", colour: COR.aviso });

  const dados = (await Promise.all(lista.map(async (srv) => ({
    id: srv?.id, nome: srv?.name ?? srv?.id, membros: await contarMembros(srv).catch(() => null), mpm: porMinuto(srv?.id),
  })))).sort((a, b) => b.mpm - a.mpm || (b.membros ?? 0) - (a.membros ?? 0));

  let total = 0, mpmTotal = 0;
  const linhas = dados.map((d) => {
    if (typeof d.membros === "number") total += d.membros;
    mpmTotal += d.mpm;
    const ritmo = d.mpm >= 0.1 ? `${d.mpm.toFixed(1)} msg/min` : d.mpm > 0 ? "<0.1 msg/min" : "parado";
    return `**${d.nome}** — ${typeof d.membros === "number" ? `${d.membros} membro(s)` : "membros: ?"} · ${ritmo}\n\`${d.id}\``;
  });
  return sendEmbed(message.channel, {
    title: `🌐 Servidores (${dados.length})`,
    description: [...linhas, "",
      `**Total:** ${total} membro(s) · ${mpmTotal.toFixed(1)} msg/min · de pé há ${tempoDePe()}`,
      "_Ritmo = média dos últimos minutos, em memória (zera se o bot reiniciar)._"].join("\n"),
    colour: COR.info,
  });
}

async function cmdRelatorio(message, args, ctx) {
  const { sendEmbed, COR, client } = ctx;
  const g = store.getGlobal();
  g.relatorio ??= { canalId: null, ativo: true, pularVazias: false, assuntos: [] };
  const cfg = g.relatorio;
  const salvar = () => store.salvarGlobal();
  const sub = args[0]?.toLowerCase();

  if (sub === "canal") {
    const alvo = ["aqui", "here"].includes(args[1]?.toLowerCase()) ? message.channel?.id : limparId(args[1] ?? "");
    if (!alvo) return sendEmbed(message.channel, { title: "❌ Qual canal?", description: "`&servidores relatorio canal #canal` ou `&servidores relatorio canal aqui`", colour: COR.erro });
    const fixo = relatorio.servidorDoRelatorio();
    if (fixo) {
      const canal = client.channels.get?.(alvo) ?? await client.channels.fetch?.(alvo).catch(() => null);
      if (canal?.serverId !== fixo) return sendEmbed(message.channel, { title: "❌ Canal de outro servidor", description: "O relatório só pode ir para um canal do servidor de `RELATORIO_SERVIDOR`.", colour: COR.erro });
    }
    cfg.canalId = alvo; cfg.ativo = true; salvar();
    return sendEmbed(message.channel, { title: "✅ Relatório ligado", description: `Toda hora cheia, o resumo vai para <#${alvo}>.`, colour: COR.sucesso });
  }
  if (sub === "on" || sub === "off") {
    cfg.ativo = sub === "on"; salvar();
    return sendEmbed(message.channel, { title: cfg.ativo ? "✅ Relatório ligado" : "⏸️ Relatório pausado", description: cfg.canalId ? `Canal: <#${cfg.canalId}>` : "Falta escolher o canal.", colour: COR.info });
  }
  if (sub === "vazias") {
    cfg.pularVazias = args[1]?.toLowerCase() === "off"; salvar();
    return sendEmbed(message.channel, { title: "✅ Feito", description: cfg.pularVazias ? "Horas sem nenhum evento serão puladas." : "Horas tranquilas também são enviadas (uma linha).", colour: COR.sucesso });
  }
  if (sub === "assuntos") {
    // Vários IDs de uma vez: separados por espaço, vírgula ou ponto e vírgula.
    const acao = args[1]?.toLowerCase();
    const ids = [...new Set(args.slice(2).join(" ").split(/[\s,;]+/).map((x) => limparId(x)).filter(Boolean))];
    const nomeDe = (id) => client.servers.get(id)?.name;
    const avisos = [];
    if ((acao === "add" || acao === "remove") && ids.length) {
      cfg.assuntos = (cfg.assuntos ?? []).filter((x) => !ids.includes(x));
      if (acao === "add") cfg.assuntos.push(...ids);
      salvar();
      const fora = ids.filter((id) => !nomeDe(id));
      if (acao === "add" && fora.length) avisos.push(`⚠️ A Judy não está em: ${fora.map((x) => `\`${x}\``).join(", ")} — ficam na lista, mas sem mensagens não há assunto.`);
    }
    const fixo = relatorio.servidorDoRelatorio();
    const lista = fixo
      ? `• ${nomeDe(fixo) ? `**${nomeDe(fixo)}** ` : ""}\`${fixo}\`\n\n_Fixado por \`RELATORIO_SERVIDOR\`: só este servidor entra nos assuntos (a lista abaixo é ignorada)._`
      : cfg.assuntos?.length
        ? cfg.assuntos.map((x) => `• ${nomeDe(x) ? `**${nomeDe(x)}** ` : ""}\`${x}\``).join("\n")
        : "_Nenhum listado: valem os servidores de que um dono do bot é dono._";
    return sendEmbed(message.channel, { title: "🗣️ Servidores com assuntos",
      description: [lista, ...avisos.map((x) => `\n${x}`)].join("\n"), colour: COR.info });
  }
  if (sub === "agora" || sub === "now") {
    const aviso = await sendEmbed(message.channel, { title: "⏳ Montando o relatório…", description: "Pode levar até alguns minutos (o modelo escreve os destaques).", colour: COR.info });
    const rel = await relatorio.gerar({ client, cfg, esvaziar: false });
    void aviso;
    let destino = cfg.canalId ? await client.channels.fetch(cfg.canalId).catch(() => message.channel) : message.channel;
    const fixo = relatorio.servidorDoRelatorio();
    if (fixo && destino?.serverId !== fixo) destino = message.channel;   // canal antigo de outro servidor
    return sendEmbed(destino,
      { title: rel.title, description: rel.description, colour: COR.info });
  }

  return sendEmbed(message.channel, {
    title: "📊 Relatório horário",
    description: [
      `**Estado:** ${cfg.canalId && cfg.ativo !== false ? `ligado → <#${cfg.canalId}>` : cfg.canalId ? "pausado" : "sem canal"}`,
      `**Horas tranquilas:** ${cfg.pularVazias ? "puladas" : "enviadas"}`,
      `**Modelo:** \`${process.env.LLM_MODEL_RELATORIO || process.env.LLM_MODEL || "nenhum — só números"}\``,
      "",
      "`&servidores relatorio canal <#canal|aqui>` · `agora` · `on|off` · `vazias on|off` · `assuntos [add|remove <id> [id…]]`",
    ].join("\n"),
    colour: COR.info,
  });
}
