
import * as db from "../core/db.js";
import { limparId, ULID, resolverUsuario } from "../core/ids.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import * as log from "../core/log.js";
import { idsDeCargos, rankDoCargo, rankDoMembro, editarCargos } from "../core/hierarquia.js";
import { descreverErro, tipoDoErro, registrarErro } from "../core/erros.js";
import { canalDeOutroServidor } from "../moderacao/pertence.js";
import { numero } from "../core/env.js";
import { canalDesteServidor, cargoDoServidor } from "../moderacao/pertence.js";
import { resolverCargo } from "../core/ids.js";
import { podeUsarCargo } from "../core/hierarquia.js";
import { erroDeUso } from "../core/saida.js";

// Cada membro escolhe se o XP dele conta (privacidade P3). `participar: false` apaga o
// XP dele neste servidor e para de contar; `true` volta (do zero). É a função que o
// `&privacidade xp sair|voltar` chama (P2, 31 out 2026) — e o apelido `&xp sair|entrar`.
export function participarDoXp(serverId, userId, participar) {
  const n = db.setXpFora(serverId, userId, !participar);
  return { apagados: participar ? 0 : n };   // ao voltar, o que sai é só a marca de "fora"
}

const _tabelasXp = new Map();   // `${base}|${mult}` → number[] (acumulado por nível)
function tabelaXp(base, mult, ateNivel) {
  const k = `${base}|${mult}`;
  let tab = _tabelasXp.get(k);
  if (!tab) { tab = [0]; _tabelasXp.set(k, tab); if (_tabelasXp.size > 64) _tabelasXp.clear(); }
  while (tab.length <= ateNivel) {
    const i = tab.length;
    tab.push(tab[i - 1] + Math.floor(base * Math.pow(i, mult)));
  }
  return tab;
}

function xpParaNivel(nivel, base = 100, mult = 1.5) {
  if (nivel <= 0) return 0;
  return tabelaXp(base, mult, nivel)[nivel];
}

function nivelPorXp(xp, mult = 1.5, nivelMax = 100, base = 100) {
  const tab = tabelaXp(base, mult, nivelMax);
  let lo = 0, hi = nivelMax;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xp >= tab[mid]) lo = mid; else hi = mid - 1;
  }
  return lo;
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

// ── Hierarquia do Stoat (crates/delta/src/routes/servers/member_edit.rs) ──
// O bot só edita quem está ABAIXO do cargo mais alto dele, e só dá cargos que
// também estão abaixo dele; cargo apagado vira InvalidRole. A sincronização
// mandava todos os cargos que faltavam numa edição só: UM cargo acima do bot
// derrubava a edição inteira com NotElevated, e a pessoa ficava sem nenhum —
// para sempre, porque só se tentava de novo no próximo nível.

// Divide os cargos que faltam entre os que o bot consegue dar e os que não.
// Sem saber quem é o bot (testes, cache vazio), não bloqueia nada: tenta.
export function planejarCargos({ server, botMember, member, faltando }) {
  if (!botMember) return { dar: [...faltando], acimaDoBot: [], membroAcima: false, botSemCargo: false };
  const topo = rankDoMembro(server, botMember);
  if (topo === Infinity) return { dar: [], acimaDoBot: [], membroAcima: false, botSemCargo: true };
  const membroAcima = rankDoMembro(server, member) <= topo;
  const acimaDoBot = faltando.filter((id) => { const r = rankDoCargo(server, id); return r !== null && r <= topo; });
  const dar = membroAcima ? [] : faltando.filter((id) => !acimaDoBot.includes(id));
  return { dar, acimaDoBot, membroAcima, botSemCargo: false };
}

function botDoServidor(server, botMember) {
  if (botMember) return botMember;
  try { return server?.member ?? null; } catch { return null; }   // stoat.js: o membro do próprio bot
}

// Falha de configuração (cargo acima do bot, falta de AssignRoles) se repete a
// cada mensagem; no log e no relatório ela entra UMA vez a cada 6 h por servidor.
// (31 out 2026, R9) o aviso vai pelo registrarErro com a etiqueta [XP], sem o
// nome do servidor (o relatório do dono recebe só a etiqueta); o Map tem teto.
const avisados = new Map();
const AVISO_MS = 6 * 3600e3;
const MAX_AVISADOS = 2000;
function avisarUmaVez(chave, texto) {
  const t = avisados.get(chave) ?? 0;
  if (Date.now() - t < AVISO_MS) return;
  if (avisados.size >= MAX_AVISADOS) avisados.clear();
  avisados.set(chave, Date.now());
  registrarErro("XP", texto);
}

export async function sincronizarCargos(server, member, serverId, { nivel = null, botMember = null } = {}) {
  if (!server || !member || !serverId) return null;
  const userId = member?.id?.user ?? member?.user?.id ?? member?.id;
  if (!userId) return null;

  const nivelAtual = nivel ?? db.getXp(serverId, userId)?.nivel ?? 0;
  if (nivelAtual < 1) return null;

  const marcos = db.listarCargosNivel(serverId).filter((c) => c.nivel <= nivelAtual);
  if (!marcos.length) return null;

  const atuais = new Set(idsDeCargos(member));
  const existe = (id) => {
    try { return !!(server.roles?.get?.(id) ?? server.roles?.[id]); } catch { return true; }
  };
  const apagados = marcos.map((c) => c.roleId).filter((id) => id && !existe(id));
  if (apagados.length) avisarUmaVez(`apagado:${serverId}`, `sincronizar: ${apagados.length} cargo(s) de nível foram apagados do servidor — recrie com ${citarInterno("xp.criarcargos")}`);
  const faltando = marcos.map((c) => c.roleId).filter((id) => id && !atuais.has(id) && existe(id));
  if (!faltando.length) return { concedidos: [], nivel: nivelAtual, bloqueados: null };

  const plano = planejarCargos({ server, botMember: botDoServidor(server, botMember), member, faltando });
  const bloqueados = (plano.membroAcima || plano.acimaDoBot.length || plano.botSemCargo)
    ? { membroAcima: plano.membroAcima, acimaDoBot: plano.acimaDoBot, botSemCargo: plano.botSemCargo } : null;
  if (plano.botSemCargo) avisarUmaVez(`semcargo:${serverId}`, `sincronizar: o bot não tem nenhum cargo — o Stoat não deixa ele dar cargos a ninguém; dê um cargo ao bot acima dos cargos de nível`);
  if (plano.acimaDoBot.length) avisarUmaVez(`acima:${serverId}`, `sincronizar: ${plano.acimaDoBot.length} cargo(s) de nível acima do cargo do bot — suba o cargo do bot (${citarInterno("xp.cargos")} mostra quais)`);
  if (plano.membroAcima) console.log(`[XP] ${userId} em ${serverId} está acima do bot na hierarquia — cargos de nível não podem ser dados`);
  if (!plano.dar.length) return { concedidos: [], nivel: nivelAtual, bloqueados };

  const editar = (ids) => editarCargos(server, member, (atuais) => [...atuais, ...ids]);
  try {
    await editar(plano.dar);
    console.log(`[XP] cargos sincronizados para ${userId} em ${serverId}: +${plano.dar.length} (nível ${nivelAtual})`);
    return { concedidos: plano.dar, nivel: nivelAtual, bloqueados };
  } catch (e) {
    const tipo = tipoDoErro(e);
    if (tipo === "MissingPermission") {
      avisarUmaVez(`perm:${serverId}`, `sincronizar: falta a permissão AssignRoles ao bot — sem ela nenhum cargo de nível é dado`);
      return { concedidos: [], nivel: nivelAtual, bloqueados, erro: descreverErro(e) };
    }
    // Cache desatualizado (alguém mexeu na ordem agora): tenta um a um, para
    // que o cargo problemático não leve os outros junto.
    const dados = [];
    let ultimoErro = e;
    for (const id of plano.dar) {
      try { await editar([...dados, id]); dados.push(id); }
      catch (e2) { ultimoErro = e2; }
    }
    if (dados.length) {
      console.log(`[XP] cargos sincronizados (um a um) para ${userId} em ${serverId}: +${dados.length} de ${plano.dar.length}`);
      return { concedidos: dados, nivel: nivelAtual, bloqueados };
    }
    avisarUmaVez(`erro:${serverId}:${tipoDoErro(ultimoErro)}`, `sincronizar: ${descreverErro(ultimoErro)}`);
    return { concedidos: [], nivel: nivelAtual, bloqueados, erro: descreverErro(ultimoErro) };
  }
}

// Quem já tinha o nível quando os cargos foram criados, ou falhou uma vez,
// nunca era tentado de novo (só no próximo nível ou ao reentrar). Agora, ao
// ganhar XP, confere de novo — no máximo a cada 6 h por pessoa.
const conferidos = new Map();
const RECONFERIR_MS = numero("XP_RECONFERIR_MS", 6 * 3600e3, { min: 0 });
export function deveReconferir(serverId, userId, agora = Date.now()) {
  const k = `${serverId}:${userId}`;
  if (conferidos.has(k) && agora - conferidos.get(k) < RECONFERIR_MS) return false;
  conferidos.set(k, agora);
  if (conferidos.size > 20000) conferidos.clear();
  return true;
}

export async function aoEntrar(member, ctx) {
  try {
    const serverId = member?.id?.server ?? ctx?.serverId;
    if (!serverId || !ctx?.config?.xp?.enabled) return null;
    const server = member.server
      ?? ctx.client?.servers?.get?.(serverId)
      ?? await ctx.client?.servers?.fetch?.(serverId).catch(() => null);
    if (!server) return null;
    const r = await sincronizarCargos(server, member, serverId);
    if (r?.concedidos?.length) {
      await log.registrar(ctx, "cargos", {
        titulo: "🎖 Cargos de nível devolvidos",
        descricao: `<@${member?.id?.user}> voltou e recuperou **${r.concedidos.length}** cargo(s) de nível (nível ${r.nivel}).`,
        en: { titulo: "🎖 Level roles restored", descricao: `<@${member?.id?.user}> came back and got **${r.concedidos.length}** level role(s) back (level ${r.nivel}).` },
        es: { titulo: "🎖 Roles de nivel devueltos", descricao: `<@${member?.id?.user}> volvió y recuperó **${r.concedidos.length}** rol(es) de nivel (nivel ${r.nivel}).` },
      });
    }
    return r;
  } catch (e) {
    console.error("[XP][aoEntrar]", e?.message ?? e);
    return null;
  }
}

export async function aoMensagem(message, ctx) {
  const { config, serverId } = ctx;
  const g = config.xp;
  const DBG = process.env.XP_DEBUG === "1";
  if (!g?.enabled) { if (DBG) console.log(`[XP] pulado: sistema desligado (serverId=${serverId})`); return; }
  if (!serverId) { if (DBG) console.log("[XP] pulado: serverId nulo"); return; }

  const userId = message.authorId;
  if (!userId) { if (DBG) console.log("[XP] pulado: authorId nulo"); return; }
  if (db.xpFora(serverId, userId)) { if (DBG) console.log(`[XP] pulado: ${userId} saiu do XP`); return; }   // &xp sair

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

  // não subiu, mas pode estar devendo cargo (cargos criados depois, falha antiga)
  if (novoNivel <= atual.nivel && novoNivel >= 1 && deveReconferir(serverId, userId)) {
    try {
      if (db.listarCargosNivel(serverId).some((c) => c.nivel <= novoNivel)) {
        const server = await ctx.getServer(message);
        const member = message.member?.roles ? message.member : await server.fetchMember(userId).catch(() => null);
        if (member) {
          const r = await sincronizarCargos(server, member, serverId, { nivel: novoNivel });
          if (r?.concedidos?.length) {
            await log.registrar(ctx, "cargos", { titulo: "🎖 Cargos de nível acertados",
              descricao: `<@${userId}> (nível ${novoNivel}) recebeu **${r.concedidos.length}** cargo(s) de nível que estavam faltando.`,
              en: { titulo: "🎖 Level roles fixed", descricao: `<@${userId}> (level ${novoNivel}) got **${r.concedidos.length}** missing level role(s).` },
              es: { titulo: "🎖 Roles de nivel corregidos", descricao: `<@${userId}> (nivel ${novoNivel}) recibió **${r.concedidos.length}** rol(es) de nivel que le faltaban.` } });
          }
        }
      }
    } catch (e) { console.error("[XP][reconferir]", descreverErro(e)); }
  }

  // subiu de nível?
  if (novoNivel > atual.nivel) {
    let ganhouCargo = null;
    try {
      const server = await ctx.getServer(message);
      const member = await server.fetchMember(userId).catch(() => null);
      if (member) {
        const r = await sincronizarCargos(server, member, serverId, { nivel: novoNivel });
        // (o sincronizar já cobre o cargo deste nível; o caminho antigo
        // tentava de novo e repetia o mesmo NotElevated no log)
        ganhouCargo = r?.concedidos?.length ? r.concedidos[r.concedidos.length - 1] : null;
      }
    } catch (e) { console.error("[GAME][levelup]", e.message); }

    if (g.anunciarLevelUp) {
      let canal = g.canalAnuncio
        ? (ctx.client?.channels?.get?.(g.canalAnuncio) ?? message.channel)
        : message.channel;
      if (canalDeOutroServidor(canal, ctx.serverId)) canal = message.channel;   // canal de outro servidor: anuncia aqui
      const lvLang = lingua(ctx);
      const lvES = idiomaDe(ctx) === "es";   // (o anúncio vai cru ao Stoat: o espanhol sai sem a marca do `tr`)
      const extra = ganhouCargo
        ? (lvES ? `\n🎖 ¡Ganaste un rol nuevo!` : lvLang === "en" ? `\n🎖 You earned a new role!` : `\n🎖 Você ganhou um novo cargo!`) : "";
      try {
        await canal.sendMessage({ embeds: [{
          title: "🎉 Level Up!",
          description: lvES ? `¡<@${userId}> llegó al **nivel ${novoNivel}**!${extra}` : lvLang === "en"
            ? `<@${userId}> reached **level ${novoNivel}**!${extra}`
            : `<@${userId}> subiu para o **nível ${novoNivel}**!${extra}`,
          colour: "#FFD700",
        }] });
      } catch (e) { console.error("[GAME][anuncio]", e.message); }
    }
  }
}

export function explicarBloqueio(r, lang = "pt") {
  const b = r?.bloqueados;
  if (!b) return "";
  const en = lang === "en";
  const L = [];
  // (etapa 4b) o espanhol, pronto (a tradução da tela não passa por ele)
  if (lang === "es") {
    if (b.botSemCargo) L.push("⚠️ El bot **no tiene ningún rol** — el Stoat no le deja dar roles a nadie. Dale un rol por encima de los roles de nivel.");
    if (b.acimaDoBot?.length) L.push(`⚠️ ${b.acimaDoBot.map((id) => `<@&${id}>`).join(" ")} ${b.acimaDoBot.length > 1 ? "están" : "está"} **por encima del rol del bot** — sube el rol del bot.`);
    if (b.membroAcima) L.push(`ℹ️ ${r.membrosAcima ? `**${r.membrosAcima}** persona(s) tienen` : "Esta persona tiene"} un rol a la altura del bot o por encima (normalmente staff) — el Stoat no deja que el bot la(s) edite.`);
    return L.length ? trechoPronto(L.join("\n")) : "";
  }
  if (b.botSemCargo) L.push(en ? "⚠️ The bot has **no role** — the Stoat doesn't let it give roles to anyone. Give it a role above the level roles."
    : "⚠️ O bot **não tem nenhum cargo** — o Stoat não deixa ele dar cargos a ninguém. Dê a ele um cargo acima dos cargos de nível.");
  if (b.acimaDoBot?.length) L.push(en
    ? `⚠️ ${b.acimaDoBot.map((id) => `<@&${id}>`).join(" ")} ${b.acimaDoBot.length > 1 ? "are" : "is"} **above the bot's role** — move the bot's role up.`
    : `⚠️ ${b.acimaDoBot.map((id) => `<@&${id}>`).join(" ")} ${b.acimaDoBot.length > 1 ? "estão" : "está"} **acima do cargo do bot** — suba o cargo do bot.`);
  if (b.membroAcima) L.push(en
    ? `ℹ️ ${r.membrosAcima ? `**${r.membrosAcima}** person(s) have` : "This person has"} a role at or above the bot's (usually staff) — the Stoat doesn't let the bot edit them.`
    : `ℹ️ ${r.membrosAcima ? `**${r.membrosAcima}** pessoa(s) têm` : "Essa pessoa tem"} um cargo na altura do bot ou acima (normalmente staff) — o Stoat não deixa o bot editá-la(s).`);
  return L.join("\n");
}

// O aviso aos membros quando o servidor liga o XP (pt, en, es)
export function avisoXpLigado(l, P, COR = {}) {
  const sair = `\`${citar("xp.sair", l, P)}\``, priv = `\`${citar("privacidade", l, P)}\``;
  const textos = {
    pt: { title: "🎮 O XP foi ligado neste servidor", description: `A partir de agora, a Judy conta as mensagens de cada membro para dar XP e nível (só a contagem — o texto não é guardado).\n\nNão quer participar? ${sair} — o seu XP é apagado e deixa de contar. ${priv} mostra tudo o que a Judy guarda sobre você.` },
    en: { title: "🎮 XP is now on for this server", description: `From now on, Judy counts each member's messages to award XP and levels (just the count — the text isn't kept).\n\nDon't want to take part? ${sair} — your XP is erased and stops counting. ${priv} shows everything Judy keeps about you.` },
    es: { title: "🎮 El XP está activado en este servidor", description: `Desde ahora, Judy cuenta los mensajes de cada miembro para dar XP y nivel (solo el conteo — el texto no se guarda).\n\n¿No quieres participar? ${sair} — tu XP se borra y deja de contar. ${priv} muestra todo lo que Judy guarda sobre ti.` },
  };
  return { ...textos[l], colour: COR.info };
}

export async function cmdXp(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config, serverId, getServer, membroTemPermissao } = ctx;
  const g = config.xp;
  const lang = lingua(ctx);
  const sub = args[0]?.toLowerCase();

  // ── sair / entrar (voltar): cada membro escolhe se o XP dele conta (privacidade P3) ──
  // Vale com o XP ligado ou não. A tela de verdade mora no `&privacidade xp …` (P2);
  // aqui fica o apelido, com a mesma função.
  if (sub === "sair" || sub === "entrar" || sub === "voltar") {
    const sair = sub === "sair";
    const { apagados } = participarDoXp(serverId, message.authorId, !sair);
    return sendEmbed(message.channel, { description: tr(ctx,
      sair ? `🚪 Fora do XP${apagados ? " — o seu XP foi apagado" : ""}.` : "🎮 De volta ao XP (do zero).",
      sair ? `🚪 Out of XP${apagados ? " — your XP was erased" : ""}.` : "🎮 Back in XP (from zero).",
      sair ? `🚪 Fuera del XP${apagados ? " — tu XP se borró" : ""}.` : "🎮 De vuelta al XP (desde cero)."), colour: COR.sucesso });
  }

  if (!g?.enabled && !["on", "setup", "config", "configurar", "criarcargos", "criar", "cargo", "canal"].includes(sub)) {
    return erroDeUso(ctx, message.channel, "xp", "O XP está desligado neste servidor.", "XP is off on this server.", "El XP está desactivado en este servidor.");
  }

  // ── top / leaderboard ──
  if (sub === "top" || sub === "leaderboard" || sub === "ranking") {
    const top = db.topXp(serverId, 10);
    if (!top.length)
      return sendEmbed(message.channel, tr(ctx,
        { title: "🏆 Ranking", description: "Ainda não há ninguém com XP.", colour: COR.mod },
        { title: "🏆 Ranking", description: "Nobody has XP yet.", colour: COR.mod }, { title: "🏆 Ranking", description: "Todavía nadie tiene XP.", colour: COR.mod }));
    const linhas = top.map((e, i) => {
      const medalha = ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;
      return tr(ctx,
        `${medalha} <@${e.userId}> — nível **${e.nivel}** · ${e.xp} XP`,
        `${medalha} <@${e.userId}> — level **${e.nivel}** · ${e.xp} XP`,
        `${medalha} <@${e.userId}> — nivel **${e.nivel}** · ${e.xp} XP`);
    });
    // nota: só XP de texto (call não é suportado pela plataforma)
    return sendEmbed(message.channel, {
      title: tr(ctx, "🏆 Ranking de níveis", "🏆 Level ranking", "🏆 Ranking de niveles"),
      description: linhas.join("\n"),
      colour: COR.info,
    });
  }

  if (["sincronizar", "sync", "recargos", "resync", "reaplicar"].includes(sub)) {
    if (!(await podeConfigurar(message, ctx))) return;
    const server = await getServer(message);
    const alvoTexto = args.slice(1).join(" ").trim();

    // Uma pessoa só
    if (alvoTexto && !["todos", "all", "servidor", "server"].includes(alvoTexto.toLowerCase())) {
      const alvoId = await resolverUsuario(alvoTexto, { message, server, client: ctx.client });
      if (!alvoId) return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não achei essa pessoa",
          description: `\`${citarInterno("xp.sincronizar", PREFIXO)} [@pessoa|todos]\`\n\nAceito menção, ID ou nome.`, colour: COR.erro },
        { title: "❌ Couldn't find that person",
          description: `\`${citarInterno("xp.sincronizar", PREFIXO)} [@user|todos]\`\n\nI accept a mention, ID or name.`, colour: COR.erro }, { title: "❌ No encontré a esa persona",
          description: `\`${citar("xp.sincronizar", "es", PREFIXO)} [@usuario|all]\`\n\nAcepto mención, ID o nombre.`, colour: COR.erro }));

      const membro = await server.fetchMember(alvoId).catch(() => null);
      if (!membro) return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não está no servidor",
          description: `<@${alvoId}> precisa estar aqui para receber os cargos. O XP dela continua guardado — assim que voltar, eu devolvo sozinho.`, colour: COR.aviso },
        { title: "❌ Not in the server",
          description: `<@${alvoId}> has to be here to receive the roles. Their XP is still stored — as soon as they return, I hand the roles back on my own.`, colour: COR.aviso }, { title: "❌ No está en el servidor",
          description: `<@${alvoId}> tiene que estar aquí para recibir los roles. Su XP sigue guardado — en cuanto vuelva, le devuelvo los roles yo sola.`, colour: COR.aviso }));

      const r = await sincronizarCargos(server, membro, serverId);
      if (!r) return sendEmbed(message.channel, tr(ctx,
        { title: "🤷 Nada a fazer", description: `<@${alvoId}> ainda não alcançou nenhum cargo de nível.`, colour: COR.info },
        { title: "🤷 Nothing to do", description: `<@${alvoId}> hasn't reached any level role yet.`, colour: COR.info }, { title: "🤷 Nada que hacer", description: `<@${alvoId}> todavía no ha alcanzado ningún rol de nivel.`, colour: COR.info }));

      const pend = explicarBloqueio(r, idiomaDe(ctx));
      return sendEmbed(message.channel, tr(ctx, {
        title: r.concedidos.length ? "🎖 Cargos devolvidos" : (pend || r.erro ? "⚠️ Não consegui dar os cargos" : "✅ Já estava em dia"),
        description: (r.concedidos.length
          ? `<@${alvoId}> (nível **${r.nivel}**) recebeu **${r.concedidos.length}** cargo(s):\n${r.concedidos.map((id) => `<@&${id}>`).join(" ")}`
          : (pend || r.erro ? `<@${alvoId}> (nível **${r.nivel}**) está sem cargo(s) do nível dela.` : `<@${alvoId}> (nível **${r.nivel}**) já tinha todos os cargos do nível dela.`))
          + (pend ? `\n\n${pend}` : "") + (r.erro ? `\n\n**Erro:** ${r.erro}` : ""),
        colour: r.concedidos.length ? COR.sucesso : (pend || r.erro ? COR.aviso : COR.info),
      }, {
        title: r.concedidos.length ? "🎖 Roles restored" : (pend || r.erro ? "⚠️ Couldn't give the roles" : "✅ Already up to date"),
        description: (r.concedidos.length
          ? `<@${alvoId}> (level **${r.nivel}**) received **${r.concedidos.length}** role(s):\n${r.concedidos.map((id) => `<@&${id}>`).join(" ")}`
          : (pend || r.erro ? `<@${alvoId}> (level **${r.nivel}**) is missing level role(s).` : `<@${alvoId}> (level **${r.nivel}**) already had every role for their level.`))
          + (pend ? `\n\n${pend}` : "") + (r.erro ? `\n\n**Error:** ${r.erro}` : ""),
        colour: r.concedidos.length ? COR.sucesso : (pend || r.erro ? COR.aviso : COR.info),
      }, {
        title: r.concedidos.length ? "🎖 Roles devueltos" : (pend || r.erro ? "⚠️ No pude dar los roles" : "✅ Ya estaba al día"),
        description: (r.concedidos.length
          ? `<@${alvoId}> (nivel **${r.nivel}**) recibió **${r.concedidos.length}** rol(es):\n${r.concedidos.map((id) => `<@&${id}>`).join(" ")}`
          : (pend || r.erro ? `<@${alvoId}> (nivel **${r.nivel}**) no tiene rol(es) de su nivel.` : `<@${alvoId}> (nivel **${r.nivel}**) ya tenía todos los roles de su nivel.`))
          + (pend ? `\n\n${pend}` : "") + (r.erro ? `\n\n**Error:** ${r.erro}` : ""),
        colour: r.concedidos.length ? COR.sucesso : (pend || r.erro ? COR.aviso : COR.info),
      }));
    }

    // O servidor inteiro
    if (!db.listarCargosNivel(serverId).length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não há cargos de nível", description: `Crie-os primeiro com \`${citarInterno("xp.criarcargos", PREFIXO)}\`.`, colour: COR.erro },
        { title: "❌ No level roles", description: `Create them first with \`${citarInterno("xp.criarcargos", PREFIXO)}\`.`, colour: COR.erro }, { title: "❌ No hay roles de nivel", description: `Créalos primero con \`${citar("xp.criarcargos", "es", PREFIXO)}\`.`, colour: COR.erro }));
    }
    await sendEmbed(message.channel, tr(ctx,
      { title: "⏳ Conferindo todo mundo…", description: "Vou devolver os cargos que cada pessoa já conquistou. Pode levar um instante.", colour: COR.info },
      { title: "⏳ Checking everyone…", description: "I'll hand back the roles each person already earned. This may take a moment.", colour: COR.info }, { title: "⏳ Revisando a todos…", description: "Voy a devolver los roles que cada persona ya ha ganado. Puede tardar un momento.", colour: COR.info }));

    let membros = [];
    try {
      const r = await server.fetchMembers();
      membros = r?.members ?? r ?? [];
    } catch (e) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não consegui listar os membros", description: `${e?.message ?? e}`, colour: COR.erro },
        { title: "❌ Couldn't list the members", description: `${e?.message ?? e}`, colour: COR.erro }, { title: "❌ No pude listar a los miembros", description: `${e?.message ?? e}`, colour: COR.erro }));
    }

    const arrumados = [];
    let falhas = 0, acimaDoBot = new Set(), membrosAcima = 0, botSemCargo = false;
    const erros = new Set();
    for (const m of membros) {
      const uid = m?.id?.user ?? m?.user?.id;
      if (!uid) continue;
      const r = await sincronizarCargos(server, m, serverId);
      if (r?.bloqueados) {
        r.bloqueados.acimaDoBot.forEach((id) => acimaDoBot.add(id));
        if (r.bloqueados.membroAcima) membrosAcima++;
        if (r.bloqueados.botSemCargo) botSemCargo = true;
      }
      if (r?.erro) { falhas++; erros.add(r.erro); }
      if (r?.concedidos?.length) arrumados.push({ uid, n: r.concedidos.length, nivel: r.nivel });
    }
    const pendencias = explicarBloqueio({ bloqueados: { acimaDoBot: [...acimaDoBot], membroAcima: membrosAcima > 0, botSemCargo }, membrosAcima }, idiomaDe(ctx));

    const lista = arrumados.slice(0, 20)
      .map((a) => `• <@${a.uid}> — nível ${a.nivel}, +${a.n} cargo(s)`).join("\n");
    const listaES = arrumados.slice(0, 20)
      .map((a) => `• <@${a.uid}> — nivel ${a.nivel}, +${a.n} rol(es)`).join("\n");
    return sendEmbed(message.channel, tr(ctx, {
      title: `🎖 ${arrumados.length} pessoa(s) atualizada(s)`,
      description: [
        `Conferi **${membros.length}** membro(s).`,
        arrumados.length ? "\n" + lista : "\n_Todo mundo já estava com os cargos certos._",
        arrumados.length > 20 ? `\n_… e mais ${arrumados.length - 20}._` : "",
        pendencias ? `\n${pendencias}` : "",
        falhas ? `\n⚠️ **${falhas}** falha(s): ${[...erros].slice(0, 2).join(" · ")}` : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas || pendencias ? COR.aviso : COR.sucesso,
    }, {
      title: `🎖 ${arrumados.length} person(s) updated`,
      description: [
        `I checked **${membros.length}** member(s).`,
        arrumados.length ? "\n" + lista : "\n_Everyone already had the right roles._",
        arrumados.length > 20 ? `\n_… and ${arrumados.length - 20} more._` : "",
        pendencias ? `\n${pendencias}` : "",
        falhas ? `\n⚠️ **${falhas}** failure(s): ${[...erros].slice(0, 2).join(" · ")}` : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas || pendencias ? COR.aviso : COR.sucesso,
    }, {
      title: `🎖 ${arrumados.length} persona(s) actualizada(s)`,
      description: [
        `Revisé **${membros.length}** miembro(s).`,
        arrumados.length ? "\n" + listaES : "\n_Todos ya tenían los roles correctos._",
        arrumados.length > 20 ? `\n_… y ${arrumados.length - 20} más._` : "",
        pendencias ? `\n${pendencias}` : "",
        falhas ? `\n⚠️ **${falhas}** fallo(s): ${[...erros].slice(0, 2).join(" · ")}` : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: falhas || pendencias ? COR.aviso : COR.sucesso,
    }));
  }

  if (sub === "setup" || sub === "config" || sub === "configurar") {
    return setupGame(message, args.slice(1), ctx);
  }

  // ── on / off ──
  if (sub === "on" || sub === "off") {
    if (!(await podeConfigurar(message, ctx))) return;
    const ligou = sub === "on" && !config.xp.enabled;
    config.xp.enabled = (sub === "on");
    ctx.salvarConfig();
    await sendEmbed(message.channel, { description: tr(ctx,
      `🎮 XP ${sub === "on" ? "ligado 🟢" : "desligado 🔴"}.`,
      `🎮 XP ${sub === "on" ? "on 🟢" : "off 🔴"}.`,
      `🎮 XP ${sub === "on" ? "activado 🟢" : "desactivado 🔴"}.`), colour: COR.mod });
    // Ao ligar, a Judy avisa os membros (privacidade P3, opção B): o XP é uma
    // estatística de cada pessoa, e cada uma pode ficar de fora.
    if (ligou) {
      const aviso = tr(ctx, ...["pt", "en", "es"].map((l) => avisoXpLigado(l, PREFIXO, COR)));
      await sendEmbed(message.channel, aviso);
      const anuncio = g.canalAnuncio && g.canalAnuncio !== message.channelId
        ? await ctx.client?.channels?.fetch?.(g.canalAnuncio).catch(() => null) : null;
      if (anuncio?.sendMessage && anuncio.serverId === serverId) await sendEmbed(anuncio, aviso).catch((e) => registrarErro("XP", e));
    }
    return;
  }

  // ── cargo <nível> @cargo|off (staff) ──
  if (sub === "cargo" && args[1]) {
    if (!(await podeConfigurar(message, ctx))) return;
    const nivel = Number(args[1]);
    if (!Number.isInteger(nivel) || nivel < 1 || nivel > (g?.nivelMaximo ?? 100))
      return erroDeUso(ctx, message.channel, "xp", `Nível de 1 a ${g?.nivelMaximo ?? 100}.`, `Level from 1 to ${g?.nivelMaximo ?? 100}.`, `Nivel de 1 a ${g?.nivelMaximo ?? 100}.`);
    if (/^(off|remover|remove|nenhum|none)$/i.test(args[2] ?? "")) {
      db.xpTirarCargoNivel(serverId, nivel);
      return sendEmbed(message.channel, { description: tr(ctx, `🗑️ Nível **${nivel}** sem cargo.`, `🗑️ Level **${nivel}** has no role.`, `🗑️ Nivel **${nivel}** sin rol.`), colour: COR.sucesso });
    }
    const server = await getServer(message);
    const roleId = resolverCargo(args.slice(2).join(" "), server)?.id;
    if (!roleId || !cargoDoServidor(server, roleId))
      return erroDeUso(ctx, message.channel, "xp", "Cargo não encontrado neste servidor.", "Role not found on this server.", "Rol no encontrado en este servidor.");
    const pode = await podeUsarCargo(server, message, roleId, ctx);
    if (!pode.ok) return sendEmbed(message.channel, { description: `🚫 ${tr(ctx, pode.pt, pode.en, pode.es)}`, colour: COR.erro });
    db.setCargoNivel(serverId, nivel, roleId);
    return sendEmbed(message.channel, { description: tr(ctx, `✅ Nível **${nivel}** → <%${roleId}>`, `✅ Level **${nivel}** → <%${roleId}>`, `✅ Nivel **${nivel}** → <%${roleId}>`), colour: COR.sucesso });
  }

  // ── canal <#canal|aqui|off> (staff): onde anunciar quem sobe de nível ──
  if (sub === "canal") {
    if (!(await podeConfigurar(message, ctx))) return;
    const arg = (args[1] ?? "").toLowerCase();
    if (/^(off|nenhum|none|desligar)$/.test(arg)) {
      config.xp.canalAnuncio = null; ctx.salvarConfig();
      return sendEmbed(message.channel, { description: tr(ctx, "📢 Anúncio no próprio canal da conversa.", "📢 Announced in the chat's own channel.", "📢 Anuncio en el propio canal de la conversación."), colour: COR.sucesso });
    }
    const server = await getServer(message);
    const alvo = !arg || ["aqui", "here", "aquí"].includes(arg) ? message.channel : canalDesteServidor(server, args[1]);
    if (!alvo) return erroDeUso(ctx, message.channel, "xp", "Canal deste servidor: #canal, aqui ou off.", "A channel on this server: #channel, here or off.", "Un canal de este servidor: #canal, aquí u off.");
    config.xp.canalAnuncio = alvo.id; ctx.salvarConfig();
    return sendEmbed(message.channel, { description: `📢 <#${alvo.id}>`, colour: COR.sucesso });
  }

  // ── cargos (lista; também `&xp cargo` sem nada) ──
  if (sub === "cargos" || sub === "cargo") {
    const cargos = db.listarCargosNivel(serverId);
    if (!cargos.length)
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎖 Cargos de nível",
          description: `Nenhum cargo configurado. Use \`${citarInterno("xp.criarcargos", PREFIXO)}\` para criar automaticamente.`, colour: COR.mod },
        { title: "🎖 Level roles",
          description: `No roles configured. Use \`${citarInterno("xp.criarcargos", PREFIXO)}\` to create them automatically.`, colour: COR.mod }, { title: "🎖 Roles de nivel",
          description: `No hay roles configurados. Usa \`${citar("xp.criarcargos", "es", PREFIXO)}\` para crearlos automáticamente.`, colour: COR.mod }));
    const srv = await getServer(message).catch(() => null);
    const bot = botDoServidor(srv, null);
    const topo = bot ? rankDoMembro(srv, bot) : null;
    const marca = (id) => {
      if (!srv) return "";
      const existe = !!(srv.roles?.get?.(id) ?? srv.roles?.[id]);
      if (!existe) return tr(ctx, " ⚠️ _apagado do servidor_", " ⚠️ _deleted from the server_", " ⚠️ _borrado del servidor_");
      const r = rankDoCargo(srv, id);
      if (topo !== null && r !== null && r <= topo) return tr(ctx, " ⚠️ _acima do bot — ele não consegue dar_", " ⚠️ _above the bot — it can't give this one_", " ⚠️ _por encima del bot — no puede darlo_");
      return "";
    };
    const linhas = cargos.map((c) => tr(ctx, `Nível **${c.nivel}** → <@&${c.roleId}>`, `Level **${c.nivel}** → <@&${c.roleId}>`, `Nivel **${c.nivel}** → <@&${c.roleId}>`) + marca(c.roleId));
    const algum = linhas.some((l) => l.includes("⚠️"));
    return sendEmbed(message.channel, {
      title: tr(ctx, "🎖 Cargos de nível", "🎖 Level roles", "🎖 Roles de nivel"),
      description: linhas.join("\n") + (algum ? tr(ctx,
        "\n\n_Suba o cargo do bot acima dos marcados (ou recrie os apagados com `" + citarInterno("xp.criarcargos") + "`) e rode `" + citarInterno("xp.sincronizar.todos") + "`._",
        "\n\n_Move the bot's role above the marked roles (or recreate the deleted ones with `" + citarInterno("xp.criarcargos") + "`), then run `" + citarInterno("xp.sincronizar.todos") + "`._",
        "\n\n_Sube el rol del bot por encima de los marcados (o vuelve a crear los borrados con `" + citar("xp.criarcargos", "es") + "`) y ejecuta `" + citar("xp.sincronizar.todos", "es") + "`._") : ""),
      colour: algum ? COR.aviso : COR.mod });
  }

  // ── criarcargos ──
  if (sub === "criarcargos" || sub === "criar") {
    return criarCargos(message, ctx);
  }

  // ── reset ──
  if (sub === "reset" || sub === "zerar") {
    if (!(await podeConfigurar(message, ctx))) return;
    if (!["confirmar", "confirm"].includes(args[1]?.toLowerCase()))
      return sendEmbed(message.channel, tr(ctx,
        { title: "⚠️ Confirmar reset",
          description: `Isso apaga TODO o XP do servidor. Para confirmar: \`${citarInterno("xp.reset", PREFIXO)} confirmar\``, colour: COR.aviso },
        { title: "⚠️ Confirm reset",
          description: `This erases ALL the server's XP. To confirm: \`${citarInterno("xp.reset", PREFIXO)} confirm\``, colour: COR.aviso }, { title: "⚠️ Confirmar reinicio",
          description: `Esto borra TODO el XP del servidor. Para confirmar: \`${citar("xp.reset", "es", PREFIXO)} confirm\``, colour: COR.aviso }));
    const n = db.resetXp(serverId);
    return sendEmbed(message.channel, tr(ctx,
      { title: "🧹 XP zerado", description: `Removido o XP de ${n} usuário(s).`, colour: COR.sucesso },
      { title: "🧹 XP reset", description: `Removed the XP of ${n} user(s).`, colour: COR.sucesso }, { title: "🧹 XP reiniciado", description: `Se borró el XP de ${n} usuario(s).`, colour: COR.sucesso }));
  }

  // ── rank [@usuário] ou perfil próprio (padrão) ──
  let alvoId = message.authorId;
  const quem = sub === "rank" ? args[1] : args[0];
  if (quem) {
    const bruto = limparId(quem);
    if (ULID.test(bruto)) alvoId = bruto;
    else if (sub !== "rank") return erroDeUso(ctx, message.channel, "xp", "Subcomando desconhecido.", "Unknown subcommand.", "Subcomando desconocido.");
  }

  const dados = db.getXp(serverId, alvoId);
  const pos = db.posicaoXp(serverId, alvoId);
  const p = progresso(dados.xp, dados.nivel, g.multiplicador);
  return sendEmbed(message.channel, {
    title: tr(ctx, "📊 Perfil de nível", "📊 Level profile", "📊 Perfil de nivel"),
    description: tr(ctx, [
      `<@${alvoId}>`,
      `**Nível:** ${dados.nivel}${dados.nivel >= g.nivelMaximo ? " (máximo!)" : ""}`,
      `**XP:** ${dados.xp}`,
      pos ? `**Ranking:** #${pos}` : "",
      "",
      `${barra(p.pct)} ${p.pct}%`,
      `${p.atual} / ${p.necessario} XP para o próximo nível`,
    ], [
      `<@${alvoId}>`,
      `**Level:** ${dados.nivel}${dados.nivel >= g.nivelMaximo ? " (max!)" : ""}`,
      `**XP:** ${dados.xp}`,
      pos ? `**Ranking:** #${pos}` : "",
      "",
      `${barra(p.pct)} ${p.pct}%`,
      `${p.atual} / ${p.necessario} XP to the next level`,
    ], [
      `<@${alvoId}>`,
      `**Nivel:** ${dados.nivel}${dados.nivel >= g.nivelMaximo ? " (¡máximo!)" : ""}`,
      `**XP:** ${dados.xp}`,
      pos ? `**Ranking:** #${pos}` : "",
      "",
      `${barra(p.pct)} ${p.pct}%`,
      `${p.atual} / ${p.necessario} XP para el siguiente nivel`,
    ]).filter(Boolean).join("\n"),
    colour: COR.info,
  });
}

async function podeConfigurar(message, ctx) {
  const { getServer, membroTemPermissao, sendEmbed, COR } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    await sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManagePermissions** para isso.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManagePermissions** for that.", colour: COR.erro }, { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManagePermissions** para eso.", colour: COR.erro }));
    return false;
  }
  return true;
}

async function setupGame(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, config } = ctx;
  if (!(await podeConfigurar(message, ctx))) return;

  const param = args[0]?.toLowerCase();
  const valor = args[1];

  if (!param) {
    const g = config.xp;
    const sl = lingua(ctx);
    return sendEmbed(message.channel, tr(ctx, {
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
        `\`${citarInterno("xp.setup.multiplicador", PREFIXO)} <número>\` (ex.: 1.5)`,
        `\`${citarInterno("xp.setup.nivelmaximo", PREFIXO)} <número>\``,
        `\`${citarInterno("xp.setup.intervalo", PREFIXO)} <5|10>\``,
        `\`${citarInterno("xp.setup", PREFIXO)} xp <min> <max>\``,
        `\`${citarInterno("xp.setup", PREFIXO)} cooldown <segundos>\``,
        `\`${citarInterno("xp.setup.canal", PREFIXO)} <aqui|off>\``,
        `\`${citarInterno("xp.setup.anuncio", PREFIXO)} <on|off>\``,
        "",
        `Depois: \`${citarInterno("xp.criarcargos", PREFIXO)}\` e \`${citarInterno("xp", PREFIXO)} on\`.`,
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "🎮 Leveling system configuration",
      description: [
        `**Enabled:** ${g.enabled ? "🟢 yes" : "🔴 no"}`,
        `**XP per message:** ${g.xpMin}–${g.xpMax}`,
        `**Cooldown:** ${Math.round(g.cooldownMs / 1000)}s`,
        `**Multiplier (difficulty):** ${g.multiplicador}`,
        `**Level cap:** ${g.nivelMaximo}`,
        `**Roles every:** ${g.intervaloCargos} levels`,
        `**Level-up announcement:** ${g.anunciarLevelUp ? "yes" : "no"}${g.canalAnuncio ? ` (channel set)` : ""}`,
        "",
        "**Adjust:**",
        `\`${citarInterno("xp.setup.multiplicador", PREFIXO)} <number>\` (e.g. 1.5)`,
        `\`${citarInterno("xp.setup.nivelmaximo", PREFIXO)} <number>\``,
        `\`${citarInterno("xp.setup.intervalo", PREFIXO)} <5|10>\``,
        `\`${citarInterno("xp.setup", PREFIXO)} xp <min> <max>\``,
        `\`${citarInterno("xp.setup", PREFIXO)} cooldown <seconds>\``,
        `\`${citarInterno("xp.setup.canal", PREFIXO)} <aqui|off>\``,
        `\`${citarInterno("xp.setup.anuncio", PREFIXO)} <on|off>\``,
        "",
        `Then: \`${citarInterno("xp.criarcargos", PREFIXO)}\` and \`${citarInterno("xp", PREFIXO)} on\`.`,
      ].join("\n"),
      colour: COR.mod,
    }, {
      title: "🎮 Configuración del sistema de niveles",
      description: [
        `**Activo:** ${g.enabled ? "🟢 sí" : "🔴 no"}`,
        `**XP por mensaje:** ${g.xpMin}–${g.xpMax}`,
        `**Cooldown:** ${Math.round(g.cooldownMs / 1000)}s`,
        `**Multiplicador (dificultad):** ${g.multiplicador}`,
        `**Nivel máximo:** ${g.nivelMaximo}`,
        `**Roles cada:** ${g.intervaloCargos} niveles`,
        `**Anuncio de subida de nivel:** ${g.anunciarLevelUp ? "sí" : "no"}${g.canalAnuncio ? ` (canal definido)` : ""}`,
        "",
        "**Ajustar:**",
        `\`${citar("xp.setup.multiplicador", "es", PREFIXO)} <número>\` (p. ej.: 1.5)`,
        `\`${citar("xp.setup.nivelmaximo", "es", PREFIXO)} <número>\``,
        `\`${citar("xp.setup.intervalo", "es", PREFIXO)} <5|10>\``,
        `\`${citar("xp.setup", "es", PREFIXO)} xp <min> <max>\``,
        `\`${citar("xp.setup", "es", PREFIXO)} cooldown <segundos>\``,
        `\`${citar("xp.setup.canal", "es", PREFIXO)} <here|off>\``,
        `\`${citar("xp.setup.anuncio", "es", PREFIXO)} <on|off>\``,
        "",
        `Después: \`${citar("xp.criarcargos", "es", PREFIXO)}\` y \`${citar("xp", "es", PREFIXO)} on\`.`,
      ].join("\n"),
      colour: COR.mod,
    }));
  }

  const g = config.xp;
  const num = Number(valor);
  switch (param) {
    case "multiplicador": case "mult":
      if (!(num >= 1 && num <= 5)) return erro(ctx, message, tr(ctx, "Multiplicador deve ser entre 1 e 5 (ex.: 1.5).", "The multiplier must be between 1 and 5 (e.g. 1.5).", "El multiplicador debe estar entre 1 y 5 (p. ej.: 1.5)."));
      g.multiplicador = num; break;
    case "nivelmaximo": case "nivelmax": case "max":
      if (!(num >= 5 && num <= 1000)) return erro(ctx, message, tr(ctx, "Nível máximo deve ser entre 5 e 1000.", "The level cap must be between 5 and 1000.", "El nivel máximo debe estar entre 5 y 1000."));
      g.nivelMaximo = Math.floor(num); break;
    case "intervalo":
      if (num !== 5 && num !== 10) return erro(ctx, message, tr(ctx, "Intervalo deve ser 5 ou 10.", "The interval must be 5 or 10.", "El intervalo debe ser 5 o 10."));
      g.intervaloCargos = num; break;
    case "xp":
      { const mn = Number(args[1]), mx = Number(args[2]);
        if (!(mn > 0 && mx >= mn)) return erro(ctx, message, tr(ctx, "Uso: `xp setup xp <min> <max>` (max ≥ min).", "Usage: `xp setup xp <min> <max>` (max ≥ min).", "Uso: `xp setup xp <min> <max>` (max ≥ min)."));
        g.xpMin = Math.floor(mn); g.xpMax = Math.floor(mx); } break;
    case "cooldown":
      if (!(num >= 0)) return erro(ctx, message, tr(ctx, "Cooldown em segundos (número positivo).", "Cooldown in seconds (a positive number).", "Cooldown en segundos (un número positivo)."));
      g.cooldownMs = Math.floor(num * 1000); break;
    case "canal":
      if ((valor || "").toLowerCase() === "off") g.canalAnuncio = null;
      else g.canalAnuncio = message.channelId;
      break;
    case "anuncio": case "anúncio":
      g.anunciarLevelUp = (valor || "").toLowerCase() === "on"; break;
    default:
      return erro(ctx, message, tr(ctx, `Parâmetro desconhecido: \`${param}\`.`, `Unknown parameter: \`${param}\`.`, `Parámetro desconocido: \`${param}\`.`));
  }
  ctx.salvarConfig();
  return sendEmbed(message.channel, tr(ctx,
    { title: "✅ Configuração salva", description: `\`${param}\` atualizado.`, colour: COR.sucesso },
    // o nome do ajuste na tela em inglês (17 out 2026: saía "`canal` updated.")
    { title: "✅ Configuration saved", description: `\`${({ canal: "channel", anuncio: "announce", intervalo: "interval", multiplicador: "multiplier", nivelmaximo: "maxlevel" })[param] ?? param}\` updated.`, colour: COR.sucesso },
    { title: "✅ Configuración guardada", description: `\`${({ canal: "channel", anuncio: "announce", intervalo: "interval", multiplicador: "multiplier", nivelmaximo: "maxlevel" })[param] ?? param}\` actualizado.`, colour: COR.sucesso }));
}

function erro(ctx, message, texto) {
  return ctx.sendEmbed(message.channel, {
    title: tr(ctx, "❌ Valor inválido", "❌ Invalid value", "❌ Valor no válido"),
    description: texto, colour: ctx.COR.erro });
}

export async function criarCargos(message, ctx) {
  const { sendEmbed, COR, config, serverId } = ctx;
  if (!(await podeConfigurar(message, ctx))) return;

  const g = config.xp;
  const server = await ctx.getServer(message);
  const intervalo = g.intervaloCargos;
  const niveis = [];
  for (let n = intervalo; n <= g.nivelMaximo; n += intervalo) niveis.push(n);

  if (!niveis.length)
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Nada a criar", description: "Verifique o nível máximo e o intervalo.", colour: COR.erro },
      { title: "❌ Nothing to create", description: "Check the level cap and the interval.", colour: COR.erro }, { title: "❌ Nada que crear", description: "Revisa el nivel máximo y el intervalo.", colour: COR.erro }));

  await sendEmbed(message.channel, tr(ctx,
    { title: "⏳ Criando cargos…",
      description: `Vou criar ${niveis.length} cargo(s), um a cada ${intervalo} níveis. Isso pode levar um instante.`, colour: COR.info },
    { title: "⏳ Creating roles…",
      description: `I'll create ${niveis.length} role(s), one every ${intervalo} levels. This may take a moment.`, colour: COR.info }, { title: "⏳ Creando roles…",
      description: `Voy a crear ${niveis.length} rol(es), uno cada ${intervalo} niveles. Puede tardar un momento.`, colour: COR.info }));

  const criados = [];
  for (const nivel of niveis) {
    // se já existe cargo para este nível, pula
    if (db.cargoDoNivel(serverId, nivel)) continue;
    try {
      // (o nome do cargo é dado gravado no Stoat: sem a marca do `tr`)
      const { id } = await server.createRole(idiomaDe(ctx) === "es" ? `Nivel ${nivel}` : lingua(ctx) === "en" ? `Level ${nivel}` : `Nível ${nivel}`);
      db.setCargoNivel(serverId, nivel, id);
      criados.push(id);
    } catch (e) { console.error("[GAME][criarCargo]", e.message); }
  }

  // Cargo novo nasce no fim da lista — abaixo do bot e de todo cargo de membro.
  // O silêncio é o timeout nativo, então não há cargo de mute para ordenar.
  const ccLang = lingua(ctx);
  const notaMute = ccLang === "en"
    ? `\n\n_New roles are born at the bottom of the list, below the bot. Already-reached levels are handed out as people talk, or now with \`${ctx.PREFIXO ?? "&"}xp sincronizar todos\`._`
    : `\n\n_Cargos novos nascem no fim da lista, abaixo do bot. Os níveis já alcançados são entregues conforme as pessoas conversam, ou agora com \`${ctx.PREFIXO ?? "&"}xp sincronizar todos\`._`;
  const notaES = `\n\n_Los roles nuevos nacen al final de la lista, por debajo del bot. Los niveles ya alcanzados se entregan a medida que la gente habla, o ahora con \`${citar("xp.sincronizar.todos", "es", ctx.PREFIXO ?? "&")}\`._`;

  return sendEmbed(message.channel, tr(ctx, {
    title: "🎖 Cargos de nível criados",
    description: `${criados.length} novo(s) cargo(s) criado(s), a cada ${intervalo} níveis (até o nível ${g.nivelMaximo}).${notaMute}`,
    colour: COR.sucesso,
  }, {
    title: "🎖 Level roles created",
    description: `${criados.length} new role(s) created, one every ${intervalo} levels (up to level ${g.nivelMaximo}).${notaMute}`,
    colour: COR.sucesso,
  }, {
    title: "🎖 Roles de nivel creados",
    description: `${criados.length} rol(es) nuevo(s) creado(s), uno cada ${intervalo} niveles (hasta el nivel ${g.nivelMaximo}).${notaES}`,
    colour: COR.sucesso,
  }));
}

// Exportado para testes
export const _interno = { xpParaNivel, nivelPorXp, progresso };
