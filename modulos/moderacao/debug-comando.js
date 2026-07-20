// ══════════════════════════════════════════════════════════
//  debug-comando.js — &debug
//
//  Relatório completo do estado de cada comando:
//   1) Saúde técnica  — o handler existe e é uma função válida
//   2) Estado         — ativo ou desativado por config neste servidor
//   3) Permissões     — a que o BOT precisa ter (e se tem) + a que o
//                       admin precisa ter para usar
//
//  Quando algo está "não ok", o motivo é mostrado.
//  Exige ManagePermissions.
// ══════════════════════════════════════════════════════════

// Catálogo dos comandos canônicos: qual permissão o ADMIN precisa para usar,
// e qual permissão o BOT precisa ter no servidor para a ação funcionar.
// bot: null  → não requer permissão especial do bot (só responder)
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
  punicao:       { admin: "ManagePermissions",bot: "AssignRoles" },
  setup:         { admin: "ManagePermissions",bot: "React" },
  log:           { admin: "ManagePermissions",bot: "SendEmbeds" },
  config:        { admin: "ManagePermissions",bot: null },
  banglobal:     { admin: "BanMembers",       bot: "BanMembers" },
  comando:       { admin: "ManagePermissions",bot: null },
  cargomudo:     { admin: "ManagePermissions",bot: "ManageRole" },
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

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManagePermissions** para ver o diagnóstico.", colour: COR.erro });
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
      erros.push(`🔴 \`${cmd}\` — **sem handler válido** (não é uma função)`);
      continue;
    }

    // 2) ESTADO no servidor
    const off = desativados.includes(cmd);

    // 3) PERMISSÃO do bot
    const temPerm = botTem(server, cat.bot);
    const permInfo = cat.bot
      ? (temPerm === true ? `bot: ✅ ${cat.bot}`
        : temPerm === false ? `bot: ❌ **falta ${cat.bot}**`
        : `bot: ⚠️ ${cat.bot} (não verificável)`)
      : "bot: —";
    const adminInfo = cat.admin ? `admin: ${cat.admin}` : "admin: livre";

    const linha = `\`${cmd}\` · ${permInfo} · ${adminInfo}`;

    if (off) {
      alertas.push(`🔴 ${linha} — **desativado** (\`${PREFIXO}comando enable ${cmd}\`)`);
    } else if (temPerm === false) {
      alertas.push(`🟠 ${linha} — **o bot não tem a permissão necessária**`);
    } else if (temPerm === null && cat.bot) {
      alertas.push(`🟡 ${linha}`);
    } else {
      ok.push(`🟢 ${linha}`);
    }
  }

  // Monta o relatório (quebra em blocos para não estourar o limite do embed)
  const blocos = [];
  blocos.push(`**Total:** ${canonicos.size} comando(s) · 🟢 ${ok.length} · ⚠️ ${alertas.length} · 🔴 ${erros.length}`);
  if (erros.length)   blocos.push("\n**❌ Não funcionam**\n" + erros.join("\n"));
  if (alertas.length) blocos.push("\n**⚠️ Atenção**\n" + alertas.join("\n"));
  if (ok.length)      blocos.push("\n**✅ Funcionando**\n" + ok.join("\n"));

  blocos.push("\n_Legenda:_ 🟢 ok · 🟠 falta permissão do bot · 🔴 desativado/sem handler · 🟡 permissão não verificável");

  // Se o relatório for muito grande, envia em partes
  const texto = blocos.join("\n");
  if (texto.length <= 3500) {
    return sendEmbed(message.channel, { title: "🔧 Diagnóstico de comandos", description: texto, colour: COR.info });
  }
  // fatiar
  for (let i = 0; i < blocos.length; i += 3) {
    await sendEmbed(message.channel, {
      title: i === 0 ? "🔧 Diagnóstico de comandos" : "🔧 (continuação)",
      description: blocos.slice(i, i + 3).join("\n"),
      colour: COR.info,
    });
  }
}
