import * as perms from "./permissoes.js";
import { tr, lingua } from "../core/i18n.js";

export const CATALOGO = {
  help:          { admin: null,               bot: null },
  ping:          { admin: null,               bot: null },
  repete:        { admin: null,               bot: null },
  userinfo:      { admin: null,               bot: null },
  warnings:      { admin: null,               bot: null },
  kick:          { admin: "KickMembers",      bot: "KickMembers" },
  ban:           { admin: "BanMembers",       bot: "BanMembers" },
  limpar:        { admin: "ManageMessages",   bot: "ManageMessages" },
  clearwarnings: { admin: "ManagePermissions",bot: null },
  automod:       { admin: "ManagePermissions",bot: "ManageMessages" },
  whitelist:     { admin: "ManagePermissions",bot: null },
  blocklist:     { admin: "ManagePermissions",bot: null },
  scam:          { admin: "ManagePermissions",bot: "ManageMessages" },
  punicao:       { admin: "ManagePermissions",bot: "TimeoutMembers" },
  setup:         { admin: "ManagePermissions",bot: "React" },
  log:           { admin: "ManagePermissions",bot: "SendEmbeds" },
  config:        { admin: "ManagePermissions",bot: null },
  banglobal:     { admin: "BanMembers",       bot: "BanMembers" },
  comando:       { admin: "ManagePermissions",bot: null },
  embed:         { admin: "ManageMessages",   bot: "SendEmbeds" },
  reactionrole:  { admin: "ManageRole",       bot: "React" },
};

// Checa uma permissão do BOT no servidor, tolerando SDK/objeto incompleto.
function botTem(server, perm) {
  if (!perm) return true;
  try {
    if (typeof server?.havePermission === "function") return server.havePermission(perm);
  } catch { /* cai no desconhecido */ }
  return null;   // null = não foi possível determinar
}

export async function cmdDebug(message, args, ctx) {
  const { estado, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, config } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para ver o diagnóstico.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** to see the diagnostics.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();

  if (["voz", "tts", "voice"].includes(sub)) {
    const VOZ_URL = (process.env.VOZ_SERVICO_URL || "").replace(/\/$/, "");
    const linhas = [];
    const marca = (ok, txt) => `${ok ? "🟢" : "🔴"} ${txt}`;

    linhas.push(`**Servidores com voz:** \`${process.env.TTS_SERVIDORES || "(nenhum)"}\``);
    linhas.push(marca(!!VOZ_URL, `VOZ_SERVICO_URL: \`${VOZ_URL || "não definida"}\``));
    linhas.push(marca(!!process.env.VOZ_CHAVE, `VOZ_CHAVE: ${process.env.VOZ_CHAVE ? "definida" : "AUSENTE"}`));

    if (VOZ_URL) {
      const t0 = Date.now();
      try {
        const r = await fetch(`${VOZ_URL}/saude`, { signal: AbortSignal.timeout(6000) });
        const d = await r.json();
        const ms = Date.now() - t0;
        linhas.push("", marca(r.ok, `judy-voz respondeu em ${ms}ms`));
        linhas.push(`**Versão do serviço:** ${d.versao ?? "1 (antiga)"}`);
        linhas.push(marca(d.piper?.ok, `Piper: ${d.piper?.ok ? d.piper.vozAtual : d.piper?.erro}`));
        if (d.piper?.vozes?.length) linhas.push(`   _vozes: ${d.piper.vozes.join(", ")}_`);
        linhas.push(marca(d.voz?.pronto, `LiveKit: ${d.voz?.pronto ? "pronto" : d.voz?.erro}`));
        const con = d.voz?.conexoes ?? [];
        linhas.push(`**Em calls:** ${con.length
          ? con.map((x) => `<#${x.canalVoz}> — ${x.falas} fala(s), ${x.naFila} na fila`).join("\n")
          : "_nenhuma_"}`);
      } catch (e) {
        linhas.push("", `🔴 judy-voz inalcançável: \`${e?.message ?? e}\``);
        linhas.push("_Na máquina do bot:_ `bash scripts/judy-diag.sh`");
      }
    }

    const c = ctx.config?.tts;
    linhas.push("", `**Neste servidor:** ${c?.ativo ? "🟢 ligado" : "🔴 desligado"}`);
    if (c?.canalVoz) linhas.push(`Canal de voz: <#${c.canalVoz}>`);
    if (c?.canalTexto) linhas.push(`Transmite de: <#${c.canalTexto}>`);

    return sendEmbed(message.channel, {
      title: "🔊 Debug — voz",
      description: linhas.join("\n"),
      colour: COR.info,
    });
  }

  if (["canais", "canal", "permissoes", "permissões", "perms"].includes(sub)) {
    const botId = ctx.client?.user?.id;
    const botMember = botId ? await server?.fetchMember?.(botId).catch(() => null) : null;

    if (args[1] && !["cru", "raw", "bruto"].includes(args[1].toLowerCase())) {
      const alvo = args.slice(1).join(" ").toLowerCase();
      const canais = (server?.channels ?? [])
        .map((c) => (typeof c === "string" ? ctx.client?.channels?.get?.(c) : c))
        .filter(Boolean);
      const canal = canais.find((c) => c?.id === args[1]) ??
        canais.find((c) => String(c?.name ?? "").toLowerCase().includes(alvo));
      if (!canal) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "🔍 Canal não encontrado", description: `Nenhum canal com "${args.slice(1).join(" ")}" no nome. Uso: \`${PREFIXO}debug canais <nome-ou-id>\``, colour: COR.aviso },
          { title: "🔍 Channel not found", description: `No channel matching "${args.slice(1).join(" ")}". Usage: \`${PREFIXO}debug canais <name-or-id>\``, colour: COR.aviso }));
      }
      const rastro = perms.rastrearPermissoes(server, canal, botMember, ctx.client);
      return sendEmbed(message.channel, {
        title: (en ? "🔬 Permission math for " : "🔬 A conta de permissão de ") + (canal.name ?? canal.id),
        description: ("```\n" + rastro.join("\n") + "\n```").slice(0, 1950),
        colour: COR.info,
      });
    }

    // modo cru: mostra o que a API devolve, para descobrir o formato
    if (["cru", "raw", "bruto"].includes(args[1]?.toLowerCase())) {
      const primeiro = (server?.channels ?? []).find(Boolean);
      const canal = typeof primeiro === "string" ? ctx.client?.channels?.get?.(primeiro) : primeiro;
      const insp = perms.inspecionarCanal(canal);
      return sendEmbed(message.channel, {
        title: en ? "🔬 Data format" : "🔬 Formato dos dados",
        description: [
          en
            ? `**Bot's member:** ${botMember ? `ok (${(botMember.roles ?? []).length} role(s))` : "❌ couldn't fetch"}`
            : `**Membro do bot:** ${botMember ? `ok (${(botMember.roles ?? []).length} cargo(s))` : "❌ não consegui buscar"}`,
          en
            ? `**Server owner:** \`${server?.owner ?? server?.ownerId ?? "?"}\``
            : `**Dono do servidor:** \`${server?.owner ?? server?.ownerId ?? "?"}\``,
          "",
          en ? "**One channel, as the API delivers it:**" : "**Um canal, como a API me entrega:**",
          "```json",
          typeof insp === "string" ? insp : JSON.stringify(insp, null, 1).slice(0, 1200),
          "```",
        ].join("\n").slice(0, 1950), colour: COR.info });
    }

    const r = perms.diagnosticarCanais(server, ctx.client, botMember, lang);
    if (!r.total) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔍 Canais", description: "Não consegui listar os canais deste servidor.", colour: COR.aviso },
        { title: "🔍 Channels", description: "I couldn't list this server's channels.", colour: COR.aviso }));
    }
    const corpo = perms.formatarRelatorio(r, PREFIXO, lang);
    const aviso = !botMember
      ? (en
        ? "\n\n⚠️ _I couldn't fetch my own member in the server — without it I don't know which roles I have._"
        : "\n\n⚠️ _Não consegui buscar meu próprio membro no servidor — sem isso não sei quais cargos eu tenho._")
      : "";
    return sendEmbed(message.channel, { title: en ? "🔍 Permissions per channel" : "🔍 Permissões por canal",
      description: (corpo + aviso).slice(0, 1950),
      colour: r.problemas.length || r.desconhecidos ? COR.aviso : COR.sucesso });
  }

  // ── &debug silence [@usuário] → o silêncio (timeout) vai funcionar? ──
  // O silêncio é o timeout nativo do Stoat: depende da permissão do bot, de a
  // pessoa NÃO ter TimeoutMembers e de ela estar abaixo do cargo do bot.
  if (["silence", "silencio", "silêncio", "mudo", "timeout"].includes(sub)) {
    const linhas = [];
    const temPerm = botTem(server, "TimeoutMembers");
    linhas.push(temPerm === false
      ? (en ? "❌ The bot's role lacks **TimeoutMembers** — no silence will work; punishments fall back to quarantine." : "❌ O cargo do bot não tem **TimeoutMembers** — nenhum silêncio funciona; as punições caem na quarentena.")
      : (en ? "✅ The bot has **TimeoutMembers**." : "✅ O bot tem **TimeoutMembers**."));
    const alvoId = message.mentionIds?.[0] ?? (args[1] ? args[1].replace(/[<@%>]/g, "") : null);
    if (alvoId) {
      const member = await server?.fetchMember?.(alvoId).catch(() => null);
      linhas.push("", en ? `**Checking <@${alvoId}>:**` : `**Checando <@${alvoId}>:**`);
      if (!member) linhas.push(en ? `❔ I couldn't find the member \`${alvoId}\`.` : `❔ Não achei o membro \`${alvoId}\`.`);
      else if (server?.ownerId === alvoId) linhas.push(en ? "👑 The server owner can't be timed out." : "👑 O dono do servidor não pode ser silenciado.");
      else {
        let elevado = null, acima = null;
        try { elevado = member.hasPermission?.(server, "TimeoutMembers") ?? null; } catch {}
        try { const bot = server?.member; acima = bot ? !(member.ranking > bot.ranking) : null; } catch {}
        if (elevado) linhas.push(en ? "❌ They have **TimeoutMembers** — the Stoat doesn't let anyone time them out." : "❌ A pessoa tem **TimeoutMembers** — o Stoat não deixa ninguém silenciá-la.");
        else if (acima) linhas.push(en ? "❌ Their highest role is at or above the bot's — move the bot's role up." : "❌ O cargo mais alto dela está na altura do bot ou acima — suba o cargo do bot.");
        else linhas.push(en ? "✅ The silence will work on this person." : "✅ O silêncio vai funcionar com essa pessoa.");
        if (member.timeout && new Date(member.timeout).getTime() > Date.now())
          linhas.push(en ? `🔇 Silenced right now, until ${new Date(member.timeout).toISOString().slice(0, 16).replace("T", " ")} UTC.` : `🔇 Silenciada agora, até ${new Date(member.timeout).toISOString().slice(0, 16).replace("T", " ")} UTC.`);
      }
    } else {
      linhas.push("", en ? `_To check someone:_ \`${PREFIXO}debug silence @person\`` : `_Para checar alguém:_ \`${PREFIXO}debug silence @pessoa\``);
    }
    return sendEmbed(message.channel, { title: en ? "🔇 Silence diagnostics" : "🔇 Diagnóstico do silêncio",
      description: linhas.join("\n").slice(0, 1950),
      colour: temPerm === false ? COR.aviso : COR.info });
  }

  const rotas = estado.rotas ?? {};
  const canonico = estado.CANONICO ?? {};
  const desativados = config.comandosDesativados ?? [];

  // Reduz aliases ao nome canônico e agrupa (para não repetir clear/purge/limpar)
  const canonicos = new Set();
  for (const nome of Object.keys(rotas)) canonicos.add(canonico[nome] ?? nome);

  const ok = [];       // tudo certo
  const alertas = [];  // funciona, mas há uma ressalva (permissão faltando/desativado)
  const erros = [];    // não funciona (handler quebrado/ausente)

  for (const cmd of [...canonicos].sort()) {
    // acha o handler (por qualquer alias que aponte para o canônico)
    const aliasHandler = rotas[cmd] ?? rotas[Object.keys(rotas).find((k) => (canonico[k] ?? k) === cmd)];
    const cat = CATALOGO[cmd] ?? { admin: null, bot: null };

    // 1) SAÚDE TÉCNICA
    if (typeof aliasHandler !== "function") {
      erros.push(en
        ? `🔴 \`${cmd}\` — **no valid handler** (not a function)`
        : `🔴 \`${cmd}\` — **sem handler válido** (não é uma função)`);
      continue;
    }

    // 2) ESTADO no servidor
    const off = desativados.includes(cmd);

    // 3) PERMISSÃO do bot
    const temPerm = botTem(server, cat.bot);
    const permInfo = cat.bot
      ? (temPerm === true ? `bot: ✅ ${cat.bot}`
        : temPerm === false ? (en ? `bot: ❌ **missing ${cat.bot}**` : `bot: ❌ **falta ${cat.bot}**`)
        : (en ? `bot: ⚠️ ${cat.bot} (unverifiable)` : `bot: ⚠️ ${cat.bot} (não verificável)`))
      : "bot: —";
    const adminInfo = cat.admin ? `admin: ${cat.admin}` : (en ? "admin: open" : "admin: livre");

    const linha = `\`${cmd}\` · ${permInfo} · ${adminInfo}`;

    if (off) {
      alertas.push(en
        ? `🔴 ${linha} — **disabled** (\`${PREFIXO}comando enable ${cmd}\`)`
        : `🔴 ${linha} — **desativado** (\`${PREFIXO}comando enable ${cmd}\`)`);
    } else if (temPerm === false) {
      alertas.push(en
        ? `🟠 ${linha} — **the bot lacks the required permission**`
        : `🟠 ${linha} — **o bot não tem a permissão necessária**`);
    } else if (temPerm === null && cat.bot) {
      alertas.push(`🟡 ${linha}`);
    } else {
      ok.push(`🟢 ${linha}`);
    }
  }

  // Monta o relatório (quebra em blocos para não estourar o limite do embed)
  const blocos = [];
  blocos.push(en
    ? `**Total:** ${canonicos.size} command(s) · 🟢 ${ok.length} · ⚠️ ${alertas.length} · 🔴 ${erros.length}`
    : `**Total:** ${canonicos.size} comando(s) · 🟢 ${ok.length} · ⚠️ ${alertas.length} · 🔴 ${erros.length}`);
  if (erros.length)   blocos.push((en ? "\n**❌ Not working**\n" : "\n**❌ Não funcionam**\n") + erros.join("\n"));
  if (alertas.length) blocos.push((en ? "\n**⚠️ Attention**\n" : "\n**⚠️ Atenção**\n") + alertas.join("\n"));
  if (ok.length)      blocos.push((en ? "\n**✅ Working**\n" : "\n**✅ Funcionando**\n") + ok.join("\n"));

  blocos.push(en
    ? "\n_Legend:_ 🟢 ok · 🟠 bot missing permission · 🔴 disabled/no handler · 🟡 unverifiable permission"
    : "\n_Legenda:_ 🟢 ok · 🟠 falta permissão do bot · 🔴 desativado/sem handler · 🟡 permissão não verificável");

  // Se o relatório for muito grande, envia em partes
  const texto = blocos.join("\n");
  if (texto.length <= 3500) {
    return sendEmbed(message.channel, { title: en ? "🔧 Command diagnostics" : "🔧 Diagnóstico de comandos", description: texto, colour: COR.info });
  }
  // fatiar
  for (let i = 0; i < blocos.length; i += 3) {
    await sendEmbed(message.channel, {
      title: i === 0 ? (en ? "🔧 Command diagnostics" : "🔧 Diagnóstico de comandos") : (en ? "🔧 (continued)" : "🔧 (continuação)"),
      description: blocos.slice(i, i + 3).join("\n"),
      colour: COR.info,
    });
  }
}
