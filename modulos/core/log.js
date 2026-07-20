// ══════════════════════════════════════════════════════════
//  log.js — Chat de logs configurável por servidor
//
//  &log                      → mostra o status e o canal atual
//  &log here                 → define o canal ATUAL como chat de log
//  &log <idDoCanal>          → define um canal por ID
//  &log off                  → desativa o chat de log
//  &log <evento> <on|off>    → liga/desliga um tipo de evento
//
//  Eventos disponíveis (config.log.eventos):
//    punicoes   — avisos, silêncios e bans do automod/moderação
//    membros    — entradas e saídas do servidor
//    mensagens  — mensagens apagadas e editadas
//    cargos     — cargos criados/apagados e cargos dados a usuários
//    comandos   — tentativas de uso de comandos do bot
// ══════════════════════════════════════════════════════════

// Rótulos amigáveis de cada categoria
export const EVENTOS = {
  punicoes:  "punições (avisos, silêncios, bans)",
  membros:   "entradas e saídas de membros",
  mensagens: "mensagens apagadas e editadas",
  cargos:    "cargos criados e atribuídos",
  comandos:  "tentativas de uso de comandos",
};

// Cores por categoria (mantém o padrão de embeds do bot)
const CORES = {
  punicoes:  "#e74c3c",
  membros:   "#2ecc71",
  mensagens: "#f1c40f",
  cargos:    "#9b59b6",
  comandos:  "#3498db",
};

// Registra um evento no chat de log, se estiver ativo para o servidor.
// Nunca lança: uma falha de log jamais deve derrubar a moderação.
export async function registrar(ctx, categoria, { titulo, descricao }) {
  try {
    const cfg = ctx?.config?.log;
    if (!cfg?.canalId) return;                 // sem canal configurado
    if (cfg.eventos?.[categoria] === false) return; // categoria desligada

    const canal = ctx.client.channels.get(cfg.canalId)
              ?? await ctx.client.channels.fetch(cfg.canalId).catch(() => null);
    if (!canal) return;

    const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
    await ctx.sendEmbed(canal, {
      title: titulo,
      description: `${descricao}\n\n_${agora} UTC_`,
      colour: CORES[categoria] ?? "#95a5a6",
    });
  } catch (err) {
    console.error("[LOG] Falha ao registrar:", err?.message);
  }
}

// ── Comando &log ───────────────────────────────────────────
export async function cmdLog(message, args, ctx) {
  const { config, sendEmbed, COR, getServer, membroTemPermissao, salvarConfig, PREFIXO } = ctx;

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, {
      title: "🚫 Permissão insuficiente",
      description: "Você precisa da permissão **ManagePermissions** para usar este comando.",
      colour: COR.erro,
    });
  }

  // Garante a estrutura (servidores criados antes desta versão)
  config.log ??= { canalId: null, eventos: {} };
  config.log.eventos ??= {};

  const sub = args[0]?.toLowerCase();

  // ── &log  → status ──
  if (!sub) {
    const canal = config.log.canalId ? `<#${config.log.canalId}>` : "_(nenhum)_";
    const linhas = Object.entries(EVENTOS).map(([chave, desc]) => {
      const on = config.log.eventos[chave] !== false; // padrão: ligado
      return `${on ? "🟢" : "🔴"} **${chave}** — ${desc}`;
    });
    return sendEmbed(message.channel, {
      title: "📜 Chat de logs",
      description: [
        `**Canal:** ${canal}`,
        "",
        ...linhas,
        "",
        "**Comandos:**",
        `\`${PREFIXO}log here\` — usar este canal`,
        `\`${PREFIXO}log <idDoCanal>\` — definir por ID`,
        `\`${PREFIXO}log off\` — desativar`,
        `\`${PREFIXO}log <evento> <on|off>\` — ligar/desligar um evento`,
      ].join("\n"),
      colour: COR.mod,
    });
  }

  // ── &log off ──
  if (sub === "off") {
    config.log.canalId = null;
    salvarConfig();
    return sendEmbed(message.channel, {
      title: "📜 Chat de logs desativado",
      description: "Nenhum evento será registrado até você definir um canal novamente.",
      colour: COR.mod,
    });
  }

  // ── &log here ──
  if (sub === "here") {
    config.log.canalId = message.channelId;
    salvarConfig();
    return sendEmbed(message.channel, {
      title: "📜 Chat de logs definido",
      description: `Os eventos passarão a ser registrados **neste canal**.`,
      colour: COR.mod,
    });
  }

  // ── &log <evento> <on|off> ──
  if (Object.hasOwn(EVENTOS, sub)) {
    const v = args[1]?.toLowerCase();
    if (v !== "on" && v !== "off") {
      return sendEmbed(message.channel, {
        title: "❌ Uso incorreto",
        description: `\`${PREFIXO}log ${sub} <on|off>\``,
        colour: COR.erro,
      });
    }
    config.log.eventos[sub] = (v === "on");
    salvarConfig();
    return sendEmbed(message.channel, {
      title: "📜 Log atualizado",
      description: `**${sub}** — ${EVENTOS[sub]}: **${v === "on" ? "ativado 🟢" : "desativado 🔴"}**.`,
      colour: COR.mod,
    });
  }

  // ── &log <idDoCanal> ──
  // IDs do Stoat são ULIDs: 26 caracteres alfanuméricos maiúsculos.
  const id = args[0].replace(/[<#>]/g, "");   // aceita <#ID> colado do cliente
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) {
    return sendEmbed(message.channel, {
      title: "❌ Canal inválido",
      description: [
        `\`${id}\` não parece um ID de canal válido.`,
        "",
        `Use \`${PREFIXO}log here\` para usar o canal atual, ou informe um ID de 26 caracteres.`,
        `Eventos disponíveis: ${Object.keys(EVENTOS).map((e) => `\`${e}\``).join(", ")}`,
      ].join("\n"),
      colour: COR.erro,
    });
  }

  // Confirma que o canal existe e que o bot o alcança
  const canal = ctx.client.channels.get(id) ?? await ctx.client.channels.fetch(id).catch(() => null);
  if (!canal) {
    return sendEmbed(message.channel, {
      title: "❌ Canal não encontrado",
      description: `Não consegui acessar o canal \`${id}\`. Verifique o ID e as permissões do bot.`,
      colour: COR.erro,
    });
  }

  config.log.canalId = id;
  salvarConfig();
  return sendEmbed(message.channel, {
    title: "📜 Chat de logs definido",
    description: `Os eventos serão registrados em <#${id}>.`,
    colour: COR.mod,
  });
}
