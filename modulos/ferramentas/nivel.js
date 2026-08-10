// ══════════════════════════════════════════════════════════
//  game.js — sistema de níveis por XP (mensagens)
//
//  Cada mensagem dá XP (com cooldown p/ não farmar por spam). Ao juntar XP
//  suficiente, o usuário sobe de nível. A cada N níveis, pode ganhar um cargo.
//
//  ⚠️ XP por tempo em call NÃO é suportado: a SDK do Stoat não emite eventos
//     de voz (join/leave), então não há como cronometrar call de forma
//     confiável. Todo o XP vem de mensagens.
//
//  Comandos:
//   &game                    → seu nível, XP e progresso
//   &game rank [@usuário]     → idem, de outra pessoa
//   &game top                 → leaderboard (ranking + XP + nível)
//   &game setup               → assistente de configuração
//   &game cargos              → lista os cargos de nível
//   &game criarcargos         → cria os cargos automaticamente
//   &game reset               → zera o XP do servidor (cuidado!)
//   &game on | off            → liga/desliga o sistema
//
//  Config (via &game setup): multiplicador de dificuldade, nível máximo,
//  intervalo de cargos (5 ou 10), canal de anúncio.
//
//  ── Segurança de hierarquia ──
//  Todos os cargos criados aqui são ordenados ABAIXO do cargo de silêncio
//  (mute), se existir, para que ninguém possa usar um cargo de nível para
//  escapar do mute.
// ══════════════════════════════════════════════════════════

import * as db from "../core/db.js";
import { limparId } from "../core/ids.js";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// ── Fórmula de progressão ──────────────────────────────────
// XP total necessário para ATINGIR um nível N.
// Cresce de forma polinomial pelo multiplicador (dificuldade).
// nível 1 = base; cada nível seguinte exige mais, escalado por `mult`.
function xpParaNivel(nivel, base = 100, mult = 1.5) {
  if (nivel <= 0) return 0;
  // soma de base * i^(mult) para i de 1..nivel → curva suave e crescente
  let total = 0;
  for (let i = 1; i <= nivel; i++) total += Math.floor(base * Math.pow(i, mult));
  return total;
}

// Dado um XP total, calcula o nível atingido (respeitando o teto).
function nivelPorXp(xp, mult = 1.5, nivelMax = 100, base = 100) {
  let nivel = 0;
  while (nivel < nivelMax && xp >= xpParaNivel(nivel + 1, base, mult)) nivel++;
  return nivel;
}

// Progresso dentro do nível atual (para a barra): {atual, necessario, pct}
function progresso(xp, nivel, mult, base = 100) {
  const inicioNivel = xpParaNivel(nivel, base, mult);
  const fimNivel = xpParaNivel(nivel + 1, base, mult);
  const atual = xp - inicioNivel;
  const necessario = Math.max(1, fimNivel - inicioNivel);
  return { atual, necessario, pct: Math.min(100, Math.round((atual / necessario) * 100)) };
}

function barra(pct, tam = 12) {
  const cheio = Math.round((pct / 100) * tam);
  return "▰".repeat(cheio) + "▱".repeat(tam - cheio);
}

// ── Descobre o cargo de mute (silêncio) do servidor ────────
// Aceita o cargo salvo na config (cargoMudo) e/ou detecta por nome.
function acharCargoMute(server, config) {
  const salvo = config?.cargoMudoId ?? config?.automod?.punicao?.silenceRoleId ?? null;
  if (salvo && server.roles?.get?.(salvo)) return server.roles.get(salvo);
  // fallback: procura por nome
  for (const [id, role] of server.roles ?? []) {
    if (/mud[oa]|mute|silenc|silêncio/i.test(role.name || "")) return role;
  }
  return null;
}

// ── Reordena os cargos para ficarem ABAIXO do mute ─────────
// No Stoat, rank menor = mais alto. "Abaixo do mute" = rank MAIOR que o do mute.
async function ordenarAbaixoDoMute(server, config, idsCargosNivel) {
  const mute = acharCargoMute(server, config);
  if (!mute) return { ok: true, semMute: true };

  try {
    // pega a ordem atual (orderedRoles: mais alto → mais baixo)
    const ordenados = server.orderedRoles ?? [];
    const ids = ordenados.map((r) => r.id ?? r.role?.id).filter(Boolean);

    // remove os cargos de nível da lista e reinsere logo DEPOIS do mute
    const semNiveis = ids.filter((id) => !idsCargosNivel.includes(id));
    const posMute = semNiveis.indexOf(mute.id);
    if (posMute === -1) return { ok: false, motivo: "mute não está na ordenação" };

    const nova = [
      ...semNiveis.slice(0, posMute + 1),   // tudo até o mute (inclusive)
      ...idsCargosNivel,                     // cargos de nível logo abaixo
      ...semNiveis.slice(posMute + 1),       // o resto
    ];
    await server.setRoleOrdering(nova);
    return { ok: true };
  } catch (e) {
    console.error("[GAME][ordenar]", e.message);
    return { ok: false, motivo: e.message };
  }
}

// ── Concede o cargo do nível (e remove o do nível anterior, opcional) ──
async function aplicarCargoNivel(server, member, serverId, nivel, config) {
  const roleId = db.cargoDoNivel(serverId, nivel);
  if (!roleId) return null;
  try {
    const atuais = new Set(member.roles ?? []);
    atuais.add(roleId);
    await member.edit({ roles: [...atuais] });
    return roleId;
  } catch (e) {
    console.error("[GAME][cargo]", e.message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
//  Handler de mensagem — concede XP
// ──────────────────────────────────────────────────────────
export async function aoMensagem(message, ctx) {
  const { config, serverId } = ctx;
  const g = config.game;
  const DBG = process.env.XP_DEBUG === "1";
  if (!g?.enabled) { if (DBG) console.log(`[XP] pulado: sistema desligado (serverId=${serverId})`); return; }
  if (!serverId) { if (DBG) console.log("[XP] pulado: serverId nulo"); return; }

  const userId = message.authorId;
  if (!userId) { if (DBG) console.log("[XP] pulado: authorId nulo"); return; }

  const agora = Date.now();
  const atual = db.getXp(serverId, userId);

  // cooldown: só ganha XP a cada g.cooldownMs
  if (atual.ultimaMsg && agora - new Date(atual.ultimaMsg).getTime() < g.cooldownMs) {
    if (DBG) console.log(`[XP] pulado: cooldown (faltam ${Math.round((g.cooldownMs - (agora - new Date(atual.ultimaMsg).getTime()))/1000)}s) user=${userId}`);
    return;
  }

  const ganho = Math.floor(g.xpMin + Math.random() * (g.xpMax - g.xpMin + 1));
  const novoXp = atual.xp + ganho;
  const novoNivel = nivelPorXp(novoXp, g.multiplicador, g.nivelMaximo);

  db.setXp(serverId, userId, novoXp, novoNivel, new Date(agora).toISOString());
  if (DBG) console.log(`[XP] +${ganho} para ${userId} → ${novoXp} XP (nível ${novoNivel}) em ${serverId}`);

  // subiu de nível?
  if (novoNivel > atual.nivel) {
    let ganhouCargo = null;
    try {
      const server = await ctx.getServer(message);
      const member = await server.fetchMember(userId).catch(() => null);
      if (member) {
        // concede o cargo do nível novo (ou do maior múltiplo alcançado)
        ganhouCargo = await aplicarCargoNivel(server, member, serverId, novoNivel, config);
      }
    } catch (e) { console.error("[GAME][levelup]", e.message); }

    if (g.anunciarLevelUp) {
      const canal = g.canalAnuncio
        ? (ctx.client?.channels?.get?.(g.canalAnuncio) ?? message.channel)
        : message.channel;
      const extra = ganhouCargo ? `\n🎖 Você ganhou um novo cargo!` : "";
      try {
        await canal.sendMessage({ embeds: [{
          title: "🎉 Level Up!",
          description: `<@${userId}> subiu para o **nível ${novoNivel}**!${extra}`,
          colour: "#FFD700",
        }] });
      } catch (e) { console.error("[GAME][anuncio]", e.message); }
    }
  }
}

// ──────────────────────────────────────────────────────────
//  Comando &game
// ──────────────────────────────────────────────────────────
export async function cmdGame(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config, serverId, getServer, membroTemPermissao } = ctx;
  const g = config.game;
  const sub = args[0]?.toLowerCase();

  // Aviso: se o sistema está desligado, quase nada faz sentido. Avisa (exceto
  // para 'on', 'setup' e 'criarcargos', que são justamente para configurá-lo).
  if (!g?.enabled && !["on", "setup", "config", "configurar", "criarcargos", "criar"].includes(sub)) {
    return sendEmbed(message.channel, {
      title: "💤 Sistema de níveis desligado",
      description: `O sistema de XP está **desativado** neste servidor, por isso ninguém está ganhando XP.\n\nPara ativar: \`${PREFIXO}game on\` *(precisa de ManagePermissions)*.\nDepois, configure com \`${PREFIXO}game setup\` se quiser.`,
      colour: COR.aviso,
    });
  }

  // ── top / leaderboard ──
  if (sub === "top" || sub === "leaderboard" || sub === "ranking") {
    const top = db.topXp(serverId, 10);
    if (!top.length)
      return sendEmbed(message.channel, { title: "🏆 Ranking", description: "Ainda não há ninguém com XP.", colour: COR.mod });
    const linhas = top.map((e, i) => {
      const medalha = ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;
      return `${medalha} <@${e.userId}> — nível **${e.nivel}** · ${e.xp} XP`;
    });
    // nota: só XP de texto (call não é suportado pela plataforma)
    return sendEmbed(message.channel, {
      title: "🏆 Ranking de níveis",
      description: linhas.join("\n") + "\n\n_XP é ganho por mensagens (o Stoat não permite medir tempo em call)._",
      colour: COR.info,
    });
  }

  // ── setup ──
  if (sub === "setup" || sub === "config" || sub === "configurar") {
    return setupGame(message, args.slice(1), ctx);
  }

  // ── on / off ──
  if (sub === "on" || sub === "off") {
    if (!(await podeConfigurar(message, ctx))) return;
    config.game.enabled = (sub === "on");
    ctx.salvarConfig();
    return sendEmbed(message.channel, { title: "🎮 Sistema de níveis",
      description: `Sistema **${sub === "on" ? "ativado 🟢" : "desativado 🔴"}**.`, colour: COR.mod });
  }

  // ── cargos (lista) ──
  if (sub === "cargos") {
    const cargos = db.listarCargosNivel(serverId);
    if (!cargos.length)
      return sendEmbed(message.channel, { title: "🎖 Cargos de nível",
        description: `Nenhum cargo configurado. Use \`${PREFIXO}game criarcargos\` para criar automaticamente.`, colour: COR.mod });
    return sendEmbed(message.channel, { title: "🎖 Cargos de nível",
      description: cargos.map((c) => `Nível **${c.nivel}** → <@&${c.roleId}>`).join("\n"), colour: COR.mod });
  }

  // ── criarcargos ──
  if (sub === "criarcargos" || sub === "criar") {
    return criarCargos(message, ctx);
  }

  // ── reset ──
  if (sub === "reset" || sub === "zerar") {
    if (!(await podeConfigurar(message, ctx))) return;
    if (args[1] !== "confirmar")
      return sendEmbed(message.channel, { title: "⚠️ Confirmar reset",
        description: `Isso apaga TODO o XP do servidor. Para confirmar: \`${PREFIXO}game reset confirmar\``, colour: COR.aviso });
    const n = db.resetXp(serverId);
    return sendEmbed(message.channel, { title: "🧹 XP zerado",
      description: `Removido o XP de ${n} usuário(s).`, colour: COR.sucesso });
  }

  // ── rank [@usuário] ou perfil próprio (padrão) ──
  let alvoId = message.authorId;
  if (sub === "rank" && args[1]) {
    const bruto = limparId(args[1]);
    if (ULID.test(bruto)) alvoId = bruto;
  }

  const dados = db.getXp(serverId, alvoId);
  const pos = db.posicaoXp(serverId, alvoId);
  const p = progresso(dados.xp, dados.nivel, g.multiplicador);
  return sendEmbed(message.channel, {
    title: "📊 Perfil de nível",
    description: [
      `<@${alvoId}>`,
      `**Nível:** ${dados.nivel}${dados.nivel >= g.nivelMaximo ? " (máximo!)" : ""}`,
      `**XP:** ${dados.xp}`,
      pos ? `**Ranking:** #${pos}` : "",
      "",
      `${barra(p.pct)} ${p.pct}%`,
      `${p.atual} / ${p.necessario} XP para o próximo nível`,
    ].filter(Boolean).join("\n"),
    colour: COR.info,
  });
}

// ── Verificação de permissão para configurar ───────────────
async function podeConfigurar(message, ctx) {
  const { getServer, membroTemPermissao, sendEmbed, COR } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    await sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManagePermissions** para isso.", colour: COR.erro });
    return false;
  }
  return true;
}

// ──────────────────────────────────────────────────────────
//  Setup do game
// ──────────────────────────────────────────────────────────
async function setupGame(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config } = ctx;
  if (!(await podeConfigurar(message, ctx))) return;

  const param = args[0]?.toLowerCase();
  const valor = args[1];

  if (!param) {
    const g = config.game;
    return sendEmbed(message.channel, {
      title: "🎮 Configuração do sistema de níveis",
      description: [
        `**Ativo:** ${g.enabled ? "🟢 sim" : "🔴 não"}`,
        `**XP por mensagem:** ${g.xpMin}–${g.xpMax}`,
        `**Cooldown:** ${Math.round(g.cooldownMs / 1000)}s`,
        `**Multiplicador (dificuldade):** ${g.multiplicador}`,
        `**Nível máximo:** ${g.nivelMaximo}`,
        `**Cargos a cada:** ${g.intervaloCargos} níveis`,
        `**Anúncio de level up:** ${g.anunciarLevelUp ? "sim" : "não"}${g.canalAnuncio ? ` (canal definido)` : ""}`,
        "",
        "**Ajustar:**",
        `\`${PREFIXO}game setup multiplicador <número>\` (ex.: 1.5)`,
        `\`${PREFIXO}game setup nivelmaximo <número>\``,
        `\`${PREFIXO}game setup intervalo <5|10>\``,
        `\`${PREFIXO}game setup xp <min> <max>\``,
        `\`${PREFIXO}game setup cooldown <segundos>\``,
        `\`${PREFIXO}game setup canal <aqui|off>\``,
        `\`${PREFIXO}game setup anuncio <on|off>\``,
        "",
        `Depois: \`${PREFIXO}game criarcargos\` e \`${PREFIXO}game on\`.`,
      ].join("\n"),
      colour: COR.mod,
    });
  }

  const g = config.game;
  const num = Number(valor);
  switch (param) {
    case "multiplicador": case "mult":
      if (!(num >= 1 && num <= 5)) return erro(ctx, message, "Multiplicador deve ser entre 1 e 5 (ex.: 1.5).");
      g.multiplicador = num; break;
    case "nivelmaximo": case "nivelmax": case "max":
      if (!(num >= 5 && num <= 1000)) return erro(ctx, message, "Nível máximo deve ser entre 5 e 1000.");
      g.nivelMaximo = Math.floor(num); break;
    case "intervalo":
      if (num !== 5 && num !== 10) return erro(ctx, message, "Intervalo deve ser 5 ou 10.");
      g.intervaloCargos = num; break;
    case "xp":
      { const mn = Number(args[1]), mx = Number(args[2]);
        if (!(mn > 0 && mx >= mn)) return erro(ctx, message, "Uso: `game setup xp <min> <max>` (max ≥ min).");
        g.xpMin = Math.floor(mn); g.xpMax = Math.floor(mx); } break;
    case "cooldown":
      if (!(num >= 0)) return erro(ctx, message, "Cooldown em segundos (número positivo).");
      g.cooldownMs = Math.floor(num * 1000); break;
    case "canal":
      if ((valor || "").toLowerCase() === "off") g.canalAnuncio = null;
      else g.canalAnuncio = message.channelId;
      break;
    case "anuncio": case "anúncio":
      g.anunciarLevelUp = (valor || "").toLowerCase() === "on"; break;
    default:
      return erro(ctx, message, `Parâmetro desconhecido: \`${param}\`.`);
  }
  ctx.salvarConfig();
  return sendEmbed(message.channel, { title: "✅ Configuração salva",
    description: `\`${param}\` atualizado.`, colour: COR.sucesso });
}

function erro(ctx, message, texto) {
  return ctx.sendEmbed(message.channel, { title: "❌ Valor inválido", description: texto, colour: ctx.COR.erro });
}

// ──────────────────────────────────────────────────────────
//  Criar cargos automaticamente (a cada N níveis)
// ──────────────────────────────────────────────────────────
export async function criarCargos(message, ctx) {
  const { sendEmbed, COR, config, serverId } = ctx;
  if (!(await podeConfigurar(message, ctx))) return;

  const g = config.game;
  const server = await ctx.getServer(message);
  const intervalo = g.intervaloCargos;
  const niveis = [];
  for (let n = intervalo; n <= g.nivelMaximo; n += intervalo) niveis.push(n);

  if (!niveis.length)
    return sendEmbed(message.channel, { title: "❌ Nada a criar",
      description: "Verifique o nível máximo e o intervalo.", colour: COR.erro });

  await sendEmbed(message.channel, { title: "⏳ Criando cargos…",
    description: `Vou criar ${niveis.length} cargo(s), um a cada ${intervalo} níveis. Isso pode levar um instante.`, colour: COR.info });

  const criados = [];
  for (const nivel of niveis) {
    // se já existe cargo para este nível, pula
    if (db.cargoDoNivel(serverId, nivel)) continue;
    try {
      const { id } = await server.createRole(`Nível ${nivel}`);
      db.setCargoNivel(serverId, nivel, id);
      criados.push(id);
    } catch (e) { console.error("[GAME][criarCargo]", e.message); }
  }

  // ⚠️ Segurança: ordena TODOS os cargos de nível abaixo do mute
  const todosIds = db.listarCargosNivel(serverId).map((c) => c.roleId);
  const ord = await ordenarAbaixoDoMute(server, config, todosIds);

  const notaMute = ord.semMute
    ? "\n\n⚠️ Nenhum cargo de mute detectado — quando você criar/definir um, rode `&game criarcargos` de novo para reordenar."
    : ord.ok
      ? "\n\n🔒 Todos os cargos de nível foram posicionados **abaixo** do cargo de mute."
      : `\n\n⚠️ Não consegui reordenar abaixo do mute (${ord.motivo}). Ajuste manualmente.`;

  return sendEmbed(message.channel, {
    title: "🎖 Cargos de nível criados",
    description: `${criados.length} novo(s) cargo(s) criado(s), a cada ${intervalo} níveis (até o nível ${g.nivelMaximo}).${notaMute}`,
    colour: COR.sucesso,
  });
}

// Exportado para testes
export const _interno = { xpParaNivel, nivelPorXp, progresso, acharCargoMute };
