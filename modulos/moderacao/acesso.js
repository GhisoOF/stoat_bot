// ══════════════════════════════════════════════════════════
//  acesso.js — quem pode usar os comandos, e onde
//
//  Duas perguntas independentes:
//   1. A pessoa é staff? (permissão nativa do Stoat OU um cargo que
//      você marcou como staff — útil quando você não quer dar
//      permissões reais a um moderador)
//   2. O comando vale NESTE canal? (para não poluir os canais de
//      conversa com gente testando comando)
// ══════════════════════════════════════════════════════════

import { limparId, ULID } from "../core/ids.js";
import { tr, lingua } from "../core/i18n.js";

// Cargos do autor da mensagem, em IDs.
function cargosDe(message) {
  const m = message?.member;
  return (m?.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
}

// A pessoa tem algum dos cargos marcados como staff?
export function temCargoStaff(message, config) {
  const marcados = config?.acesso?.cargosStaff ?? [];
  if (!marcados.length) return false;
  const meus = cargosDe(message);
  return meus.some((id) => marcados.includes(id));
}

// O comando pode rodar neste canal?
// Devolve { ok } ou { ok:false, motivo } para a mensagem de recusa.
export function canalPermitido(message, config, { ehStaff = false } = {}) {
  const a = config?.acesso?.canais ?? { modo: "todos", lista: [] };
  const modo = a.modo ?? "todos";
  if (modo === "todos") return { ok: true };

  // staff pode moderar de qualquer lugar, se assim configurado
  if (ehStaff && (config?.acesso?.staffIgnoraCanais ?? true)) return { ok: true };

  const lista = a.lista ?? [];
  const canalId = message?.channelId;
  const estaNaLista = lista.includes(canalId);

  if (modo === "somente") {
    return estaNaLista ? { ok: true } : {
      ok: false,
      motivo: lista.length
        ? `os comandos só funcionam em ${lista.slice(0, 5).map((c) => `<#${c}>`).join(", ")}${lista.length > 5 ? "…" : ""}`
        : "nenhum canal de comandos foi definido ainda",
    };
  }
  if (modo === "exceto") {
    return estaNaLista
      ? { ok: false, motivo: "os comandos estão desligados neste canal" }
      : { ok: true };
  }
  return { ok: true };
}

// ══════════════════════════════════════════════════════════
//  &acesso — configuração
// ══════════════════════════════════════════════════════════
export async function cmdAcesso(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config, salvarConfig, getServer, membroTemPermissao } = ctx;
  const lang = lingua(ctx);

  const server = await getServer(message);
  const podeGerir = !membroTemPermissao || membroTemPermissao(message, server, "ManagePermissions");

  config.acesso ??= { cargosStaff: [], canais: { modo: "todos", lista: [] }, staffIgnoraCanais: true };
  const a = config.acesso;
  a.cargosStaff ??= [];
  a.canais ??= { modo: "todos", lista: [] };

  const sub = args[0]?.toLowerCase();

  // ── painel ──
  if (!sub || sub === "status") {
    const cargos = a.cargosStaff.length
      ? a.cargosStaff.map((r) => `<%${r}>`).join(" ")
      : (lang === "en" ? "_none — only Stoat's native permission counts_" : "_nenhum — vale só a permissão nativa do Stoat_");
    const canais = lang === "en"
      ? (a.canais.modo === "todos"
        ? "any channel"
        : `${a.canais.modo === "somente" ? "**only** in" : "everywhere **except**"} ${
            a.canais.lista.length ? a.canais.lista.map((c) => `<#${c}>`).join(", ") : "_(empty list)_"}`)
      : (a.canais.modo === "todos"
        ? "qualquer canal"
        : `${a.canais.modo === "somente" ? "**só** em" : "em todos, **menos**"} ${
            a.canais.lista.length ? a.canais.lista.map((c) => `<#${c}>`).join(", ") : "_(lista vazia)_"}`);
    return sendEmbed(message.channel, lang === "en" ? {
      title: "🔐 Command access",
      description: [
        `**Staff roles:** ${cargos}`,
        `**Commands work in:** ${canais}`,
        `**Staff bypasses the channel restriction:** ${a.staffIgnoraCanais ? "yes" : "no"}`,
        "",
        "**Staff roles**",
        `\`${P}acesso cargo add <@role|id>\` · \`${P}acesso cargo remove <@role|id>\``,
        "_Anyone with one of these roles can use the moderation commands even without the native permission._",
        "",
        "**Channels**",
        `\`${P}acesso canal todos\` — commands in any channel`,
        `\`${P}acesso canal somente\` — only in the listed channels`,
        `\`${P}acesso canal exceto\` — everywhere except the listed ones`,
        `\`${P}acesso canal add|remove [#channel]\` — edits the list (no channel = this one)`,
        `\`${P}acesso staffignora on|off\` — whether staff bypasses the restriction`,
      ].join("\n"),
      colour: COR.info,
    } : {
      title: "🔐 Acesso aos comandos",
      description: [
        `**Cargos de staff:** ${cargos}`,
        `**Comandos funcionam em:** ${canais}`,
        `**Staff ignora a restrição de canal:** ${a.staffIgnoraCanais ? "sim" : "não"}`,
        "",
        "**Cargos de staff**",
        `\`${P}acesso cargo add <@cargo|id>\` · \`${P}acesso cargo remove <@cargo|id>\``,
        "_Quem tiver um desses cargos usa os comandos de moderação mesmo sem a permissão nativa._",
        "",
        "**Canais**",
        `\`${P}acesso canal todos\` — comandos em qualquer canal`,
        `\`${P}acesso canal somente\` — só nos canais da lista`,
        `\`${P}acesso canal exceto\` — em todos, menos os da lista`,
        `\`${P}acesso canal add|remove [#canal]\` — mexe na lista (sem canal, usa este)`,
        `\`${P}acesso staffignora on|off\` — se o staff escapa da restrição`,
      ].join("\n"),
      colour: COR.info,
    });
  }

  if (!podeGerir) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para mexer no acesso aos comandos.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to change command access.", colour: COR.erro }));
  }

  // ── cargos de staff ──
  if (["cargo", "cargos", "staff"].includes(sub)) {
    const acao = args[1]?.toLowerCase();
    const alvo = limparId(args[2] ?? "");
    if (!["add", "remove", "adicionar", "remover", "limpar"].includes(acao)) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "Uso",
        description: `\`${P}acesso cargo add <@cargo|id>\`\n\`${P}acesso cargo remove <@cargo|id>\`\n\`${P}acesso cargo limpar\``,
        colour: COR.info,
      }, {
        title: "Usage",
        description: `\`${P}acesso cargo add <@role|id>\`\n\`${P}acesso cargo remove <@role|id>\`\n\`${P}acesso cargo limpar\``,
        colour: COR.info,
      }));
    }
    if (acao === "limpar") {
      a.cargosStaff = []; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔐 Cargos de staff limpos",
          description: "Voltou a valer só a permissão nativa do Stoat.", colour: COR.sucesso },
        { title: "🔐 Staff roles cleared",
          description: "Only Stoat's native permission counts again.", colour: COR.sucesso }));
    }
    if (!ULID.test(alvo)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cargo inválido",
          description: `Mencione o cargo ou passe o ID.\nEx.: \`${P}acesso cargo add <%01ABC…>\``, colour: COR.erro },
        { title: "❌ Invalid role",
          description: `Mention the role or pass its ID.\nE.g.: \`${P}acesso cargo add <%01ABC…>\``, colour: COR.erro }));
    }
    if (acao === "add" || acao === "adicionar") {
      if (!a.cargosStaff.includes(alvo)) a.cargosStaff.push(alvo);
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔐 Cargo de staff adicionado",
          description: `Quem tiver <%${alvo}> passa a usar os comandos de moderação.`, colour: COR.sucesso },
        { title: "🔐 Staff role added",
          description: `Anyone with <%${alvo}> can now use the moderation commands.`, colour: COR.sucesso }));
    }
    a.cargosStaff = a.cargosStaff.filter((r) => r !== alvo);
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔐 Cargo removido",
        description: `<%${alvo}> não vale mais como staff.`, colour: COR.aviso },
      { title: "🔐 Role removed",
        description: `<%${alvo}> no longer counts as staff.`, colour: COR.aviso }));
  }

  // ── canais ──
  if (["canal", "canais"].includes(sub)) {
    const acao = args[1]?.toLowerCase();

    if (["todos", "somente", "exceto"].includes(acao)) {
      a.canais.modo = acao; salvarConfig?.();
      const txt = (lang === "en" ? {
        todos: "Commands work in **any channel**.",
        somente: `Commands only work in the listed channels. Add with \`${P}acesso canal add\`.`,
        exceto: `Commands work everywhere **except** the listed channels. Add with \`${P}acesso canal add\`.`,
      } : {
        todos: "Os comandos funcionam em **qualquer canal**.",
        somente: `Os comandos só funcionam nos canais da lista. Adicione com \`${P}acesso canal add\`.`,
        exceto: `Os comandos funcionam em todos, **menos** nos da lista. Adicione com \`${P}acesso canal add\`.`,
      })[acao];
      return sendEmbed(message.channel, {
        title: lang === "en" ? "🔐 Mode changed" : "🔐 Modo alterado",
        description: txt, colour: COR.sucesso });
    }

    if (["add", "adicionar", "remove", "remover"].includes(acao)) {
      const bruto = args[2] ? limparId(args[2]) : message.channelId;
      if (!ULID.test(bruto)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido",
            description: `Use \`${P}acesso canal ${acao}\` no canal desejado, ou passe o ID.`, colour: COR.erro },
          { title: "❌ Invalid channel",
            description: `Run \`${P}acesso canal ${acao}\` in the desired channel, or pass its ID.`, colour: COR.erro }));
      }
      const add = acao.startsWith("add") || acao === "adicionar";
      if (add) { if (!a.canais.lista.includes(bruto)) a.canais.lista.push(bruto); }
      else a.canais.lista = a.canais.lista.filter((c) => c !== bruto);
      salvarConfig?.();
      const aviso = a.canais.modo === "todos"
        ? (lang === "en"
          ? `\n\n⚠️ The mode is \`todos\`, so the list has no effect. Use \`${P}acesso canal somente\` or \`${P}acesso canal exceto\`.`
          : `\n\n⚠️ O modo está \`todos\`, então a lista não tem efeito. Use \`${P}acesso canal somente\` ou \`${P}acesso canal exceto\`.`)
        : "";
      return sendEmbed(message.channel, lang === "en" ? {
        title: add ? "🔐 Channel added to the list" : "🔐 Channel removed from the list",
        description: `<#${bruto}> ${add ? "joined" : "left"} the list (**${a.canais.lista.length}** total).${aviso}`,
        colour: COR.sucesso,
      } : {
        title: add ? "🔐 Canal adicionado à lista" : "🔐 Canal removido da lista",
        description: `<#${bruto}> ${add ? "entrou na" : "saiu da"} lista (**${a.canais.lista.length}** no total).${aviso}`,
        colour: COR.sucesso });
    }

    if (acao === "limpar") {
      a.canais.lista = []; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔐 Lista de canais limpa", description: "A lista ficou vazia.", colour: COR.aviso },
        { title: "🔐 Channel list cleared", description: "The list is now empty.", colour: COR.aviso }));
    }

    return sendEmbed(message.channel, tr(ctx, {
      title: "Uso",
      description: `\`${P}acesso canal <todos|somente|exceto>\`\n\`${P}acesso canal add|remove [#canal]\`\n\`${P}acesso canal limpar\``,
      colour: COR.info,
    }, {
      title: "Usage",
      description: `\`${P}acesso canal <todos|somente|exceto>\`\n\`${P}acesso canal add|remove [#channel]\`\n\`${P}acesso canal limpar\``,
      colour: COR.info,
    }));
  }

  // ── staff ignora canais ──
  if (["staffignora", "staffignoracanais"].includes(sub)) {
    const v = args[1]?.toLowerCase();
    a.staffIgnoraCanais = !["off", "nao", "não", "0"].includes(v);
    salvarConfig?.();
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🔐 Adjusted" : "🔐 Ajustado",
      description: lang === "en"
        ? (a.staffIgnoraCanais
          ? "Staff can use commands in **any** channel, even with the restriction on."
          : "Staff is also subject to the channel restriction.")
        : (a.staffIgnoraCanais
          ? "O staff pode usar comandos em **qualquer** canal, mesmo com restrição ligada."
          : "O staff também fica sujeito à restrição de canais."),
      colour: COR.sucesso });
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "❓ Subcomando desconhecido",
      description: `Use: \`cargo\`, \`canal\`, \`staffignora\` ou \`status\`.`, colour: COR.erro },
    { title: "❓ Unknown subcommand",
      description: `Use: \`cargo\`, \`canal\`, \`staffignora\` or \`status\`.`, colour: COR.erro }));
}
