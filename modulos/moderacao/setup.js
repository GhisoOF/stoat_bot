// ══════════════════════════════════════════════════════════
//  setup.js — Assistente de configuração guiado por reações
//  &setup → o bot pergunta e o usuário responde clicando nos
//  emojis. Configura a POLÍTICA DE PUNIÇÃO (todos os automods)
//  e a detecção de conteúdo proibido (scorecard).
//
//  Estado por sessão em ctx.estado.setupSessions:
//    Map(messageId → { userId, step, answers, channelId })
// ══════════════════════════════════════════════════════════

import { criarCargoMudo } from "./comandos-admin.js";

const PASSOS = [
  {
    key: "modo",
    titulo: "⚖️ Nível de punição (vale para TODOS os automods)",
    descricao: [
      "👁️ — **Só avisar** (não remove nem pune) — recomendado p/ testes",
      "🧹 — **Só apagar** a mensagem (não pune o usuário)",
      "⚠️ — **Confirmar**: remove, silencia e espera um moderador",
      "📊 — **Acumular avisos** e banir ao atingir o limite",
      "🔨 — **Banir** na hora",
    ].join("\n"),
    opcoes: [
      { emoji: "👁️", valor: "avisar" },
      { emoji: "🧹", valor: "apagar" },
      { emoji: "⚠️", valor: "confirmar" },
      { emoji: "📊", valor: "acumular" },
      { emoji: "🔨", valor: "banir" },
    ],
  },
  {
    key: "warns",
    titulo: "🔢 Quantos avisos até o banimento?",
    descricao: "3️⃣ — três    5️⃣ — cinco    🔟 — dez",
    opcoes: [
      { emoji: "3️⃣", valor: 3 },
      { emoji: "5️⃣", valor: 5 },
      { emoji: "🔟", valor: 10 },
    ],
    quando: (a) => a.modo === "acumular",
  },
  {
    key: "cargoMudo",
    titulo: "🔇 Cargo de silêncio (usado no modo Confirmar)",
    descricao: [
      "O modo **Confirmar** silencia o usuário aplicando um cargo que remove as permissões dele.",
      "",
      "🆕 — **Criar um cargo novo** (todas as permissões negadas), automaticamente",
      "📌 — **Já tenho um cargo** (você informa o ID depois com `&punicao silencerole <id>`)",
      "⏭️ — **Pular** por enquanto",
    ].join("\n"),
    opcoes: [
      { emoji: "🆕", valor: "criar" },
      { emoji: "📌", valor: "existente" },
      { emoji: "⏭️", valor: "pular" },
    ],
    quando: (a) => a.modo === "confirmar",
  },
  {
    key: "enabled",
    titulo: "🛡 Ativar detecção de conteúdo proibido?",
    descricao: [
      "Cobre golpe, +18, gore, apologia a ilícito e abuso — tudo numa nota 0–10.",
      "",
      "✅ — Sim, ativar",
      "❌ — Não",
    ].join("\n"),
    opcoes: [{ emoji: "✅", valor: true }, { emoji: "❌", valor: false }],
  },
  {
    key: "sensitivity",
    titulo: "🎚️ Sensibilidade da detecção de conteúdo",
    descricao: [
      "Define a partir de qual **nota (0–10)** o bot age. Nota mais alta = conteúdo mais claramente proibido.",
      "",
      "🟢 — **Baixa** (limiar 8): só age no que é quase certo. Menos falsos positivos, pode deixar passar casos sutis.",
      "🟡 — **Média** (limiar 6): equilíbrio recomendado para a maioria dos servidores.",
      "🔴 — **Alta** (limiar 4): pega até indícios leves. Protege mais, mas pode sinalizar mensagens inofensivas.",
      "",
      "_Você pode ajustar depois com_ `&scam sensitivity <baixa|media|alta>`.",
    ].join("\n"),
    opcoes: [
      { emoji: "🟢", valor: "baixa" },
      { emoji: "🟡", valor: "media" },
      { emoji: "🔴", valor: "alta" },
    ],
    quando: (a) => a.enabled === true,
  },
  {
    key: "channel",
    titulo: "📢 Usar ESTE canal para os avisos?",
    descricao: "✅ — Sim, este canal    ❌ — Pular",
    opcoes: [{ emoji: "✅", valor: true }, { emoji: "❌", valor: false }],
    quando: (a) => a.enabled === true,
  },
];

// Normaliza emoji recebido (pode vir URL-encoded) e compara tolerante
function normalizarEmoji(e) {
  if (!e) return "";
  let v = e;
  try { v = decodeURIComponent(e); } catch {}
  return v;
}
function casaEmoji(recebido, alvo) {
  const limpa = (x) => normalizarEmoji(x).replace(/\uFE0F/g, "");
  const r = limpa(recebido), a = limpa(alvo);
  return r === a || r.startsWith(a) || a.startsWith(r);
}

// Próximo passo aplicável (respeita os predicados `quando`)
function proximoPasso(answers, apartirDe) {
  for (let i = apartirDe; i < PASSOS.length; i++) {
    if (!PASSOS[i].quando || PASSOS[i].quando(answers)) return i;
  }
  return -1;
}

async function enviarPasso(channel, ctx, sessao, idxPasso) {
  const passo = PASSOS[idxPasso];
  const rodape = "\n\n_Clique em um emoji abaixo._";
  let msg;
  try {
    msg = await channel.sendMessage({
      embeds: [{ title: passo.titulo, description: passo.descricao + rodape, colour: ctx.COR.info }],
      interactions: { reactions: passo.opcoes.map((o) => o.emoji), restrict_reactions: false },
    });
  } catch (err) {
    console.error("[SETUP] Falha ao enviar passo:", err.message);
    try { msg = await channel.sendMessage({ embeds: [{ title: passo.titulo, description: passo.descricao + rodape, colour: ctx.COR.info }] }); } catch {}
  }
  const novoId = msg?.id ?? msg?._id;
  if (novoId) {
    sessao.step = idxPasso;
    sessao.messageId = novoId;
    ctx.estado.setupSessions.set(novoId, sessao);
  }
  return novoId;
}

export async function iniciarSetup(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions"))
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManagePermissions** para usar o assistente.", colour: COR.erro });

  const sessao = { userId: message.authorId, step: 0, answers: {},
                   channelId: message.channelId, serverId: ctx.serverId ?? message.serverId ?? null };
  await enviarPasso(message.channel, ctx, sessao, 0);
  if (ctx.cfgGlobal?.debug !== false) console.log(`[SETUP] iniciado por ${message.authorId} (msg ${sessao.messageId})`);
}

async function finalizar(channel, ctx, sessao) {
  const { config, salvarConfig, sendEmbed, COR, getServer } = ctx;
  const a = sessao.answers;
  const pol = config.automod.punicao;
  const cfg = config.automod.antiScam;

  // Política de punição (todos os automods)
  if (a.modo) pol.modo = a.modo;
  if (a.warns) pol.warnsParaBan = a.warns;

  // Cargo de silêncio (se o usuário pediu para criar no passo cargoMudo)
  let linhaCargo = null;
  if (a.cargoMudo === "criar") {
    try {
      const server = sessao.serverId
        ? await ctx.client.servers.fetch(sessao.serverId)
        : await getServer({ serverId: sessao.serverId });
      const { id, canais } = await criarCargoMudo(server, "Silenciado", true);
      pol.silenceRoleId = id;
      linhaCargo = `**Cargo de silêncio:** criado ✅ (\`${id}\`)`
                 + (canais ? ` — bloqueado em ${canais.ok}/${canais.total} canal(is)` : "");
    } catch (err) {
      console.error("[SETUP][CARGOMUDO]", err.message);
      linhaCargo = `**Cargo de silêncio:** ❌ falha ao criar (${err.message}). Use \`&cargomudo\` ou \`&punicao silencerole <id>\`.`;
    }
  } else if (a.cargoMudo === "existente") {
    linhaCargo = "**Cargo de silêncio:** defina o seu com `&punicao silencerole <id>`.";
  }

  const rotuloModo = pol.modo === "banir" ? "🔨 banir"
    : pol.modo === "acumular" ? `📊 acumular (ban em ${pol.warnsParaBan})`
    : pol.modo === "confirmar" ? "⚠️ confirmar" : "👁️ só avisar";

  const linhas = [`**Punição (todos os automods):** ${rotuloModo}`];

  // Detecção de conteúdo
  cfg.enabled = a.enabled === true;
  linhas.push(`**Detecção de conteúdo:** ${cfg.enabled ? "🟢 ativada" : "🔴 desativada"}`);
  if (cfg.enabled) {
    if (a.sensitivity) cfg.sensitivity = a.sensitivity;
    if (a.channel)     cfg.alertChannelId = sessao.channelId;
    linhas.push(
      `**Sensibilidade:** ${cfg.sensitivity}`,
      `**Canal de avisos:** ${cfg.alertChannelId ? `\`${cfg.alertChannelId}\`` : "_(canal de cada mensagem)_"}`,
    );
  }
  if (linhaCargo) linhas.push(linhaCargo);
  salvarConfig();

  const dica = pol.modo === "confirmar" && !pol.silenceRoleId
    ? "\n\n💡 O modo confirmar precisa de um cargo de silêncio: crie com `&cargomudo` ou informe um com `&punicao silencerole <id>`."
    : "";

  await sendEmbed(channel, {
    title: "✅ Configuração concluída!",
    description: linhas.join("\n") + dica + "\n\n_Ajuste fino depois com_ `&punicao` _e_ `&scam config`.",
    colour: COR.sucesso,
  });
  if (ctx.cfgGlobal?.debug !== false) console.log("[SETUP] concluído:", JSON.stringify(a));
}

export async function handleReaction(messageId, userId, emoji, ctx) {
  if (!messageId || !userId) return;
  const sessao = ctx.estado.setupSessions.get(messageId);
  if (!sessao) return;
  if (userId !== sessao.userId) return;

  const passo = PASSOS[sessao.step];
  const opcao = passo.opcoes.find((o) => casaEmoji(emoji, o.emoji));
  if (!opcao) return;

  sessao.answers[passo.key] = opcao.valor;
  ctx.estado.setupSessions.delete(messageId);

  if (ctx.cfgGlobal?.debug !== false)
    console.log(`[SETUP] ${userId} respondeu ${passo.key}=${JSON.stringify(opcao.valor)}`);

  let channel = null;
  try {
    const ch = ctx.client?.channels;
    channel = (ch?.get && ch.get(sessao.channelId)) || (ch?.fetch ? await ch.fetch(sessao.channelId) : null);
  } catch {}
  if (!channel) return;

  const prox = proximoPasso(sessao.answers, sessao.step + 1);
  if (prox === -1) return finalizar(channel, ctx, sessao);
  await enviarPasso(channel, ctx, sessao, prox);
}
