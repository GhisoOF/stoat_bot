// &ticket — suporte com canal privado por pedido, comandado por REAÇÕES
// (pedido de Ghieh, 1 out 2026).
//
//   painel  → a staff escolhe um canal e o bot posta lá uma mensagem com uma
//             reação por categoria (🎫 Suporte, 🚨 Denúncia, 💡 Sugestão…).
//             Reagiu = abriu um ticket daquela categoria.
//   ticket  → canal privado (quem abriu + staff) com uma mensagem de controle:
//             🔒 fecha — só a staff.
//   fechar  → a conversa TRAVA (quem abriu continua vendo, não escreve mais),
//             o registro inteiro vai para o canal de log como um arquivo .txt,
//             e o canal ganha um 🗑️ para a staff apagar quando quiser.
// Os comandos (&ticket abrir/fechar/apagar) continuam valendo para quem
// prefere digitar. Permissões no servidor: ManageChannel, ManageRole,
// AssignRoles, ManagePermissions — e ManageMessages para limpar as reações.

import * as db from "../core/db.js";
import { erroDeUso } from "../core/saida.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import { tr, lingua, textoDoIdioma, idiomaDe, idiomaDaTela } from "../core/i18n.js";
import { descreverErro, registrarErro } from "../core/erros.js";
import { subirAnexo } from "../core/anexos.js";
import { chamarApi } from "../core/stoat-api.js";
import { editarCargos, cargoDe, rankDoCargo, rankDoMembro, idsDeCargos } from "../core/hierarquia.js";
import { tipoDoErro } from "../core/erros.js";
import { canalDeOutroServidor, canalDesteServidor } from "../moderacao/pertence.js";
import { numero } from "../core/env.js";
import { textoDeFora } from "../core/seguranca.js";

const DENY_TUDO = 0x000fffffffffffffn;            // mesmo GRANT_ALL_SAFE do resto do bot
const VER_E_LER = (1n << 20n) | (1n << 21n);      // ViewChannel + ReadMessageHistory
// O que quem abriu (e a staff) faz no ticket. Não é "tudo": o Stoat só deixa o
// bot conceder permissão que ELE tem — e a máscara "tudo" (0x000F_FFFF_FFFF_FFFF)
// tem 52 bits, dos quais só uns 33 são permissões de verdade. Ninguém "tem" os
// bits vazios, então o pedido era recusado (CannotGiveMissingPermissions) até
// com o bot tendo todas as permissões que o Stoat oferece — o erro de 2 out 2026.
const PERMS_TICKET = { ViewChannel: 1n << 20n, ReadMessageHistory: 1n << 21n, SendMessage: 1n << 22n, SendEmbeds: 1n << 26n, UploadFiles: 1n << 27n, React: 1n << 29n };
const ESCREVER = PERMS_TICKET.SendMessage | PERMS_TICKET.SendEmbeds | PERMS_TICKET.UploadFiles | PERMS_TICKET.React;
// só as que o bot tem no servidor (sem como saber, pede todas e o Stoat decide)
function permsQueOBotDa(server) {
  let bits = 0n;
  for (const [nome, bit] of Object.entries(PERMS_TICKET)) {
    let tem = null;
    try { tem = typeof server?.havePermission === "function" ? server.havePermission(nome) : null; } catch {}
    if (tem !== false) bits |= bit;
  }
  return bits;
}
const MAX_MSGS_TRANSCRICAO = numero("TICKET_MAX_MSGS", 1000, { min: 1, max: 10_000, inteiro: true });
// (31 out 2026, R9/R11) uma raid não abre N canais e N cargos: teto de tickets
// abertos por servidor, e conta que acabou de entrar não abre.
export const MAX_ABERTOS_SERVIDOR = numero("TICKET_MAX_ABERTOS", 20, { min: 1, inteiro: true });
export const ENTRADA_MIN_MS = 10 * 60_000;
export const E_FECHAR = "🔒";
export const E_APAGAR = "🗑️";
export const CATEGORIAS_PADRAO = [
  { emoji: "🎫", nome: "Suporte" },
  { emoji: "🚨", nome: "Denúncia" },
  { emoji: "💡", nome: "Sugestão" },
];
export const CATEGORIAS_PADRAO_EN = [
  { emoji: "🎫", nome: "Support" },
  { emoji: "🚨", nome: "Report" },
  { emoji: "💡", nome: "Suggestion" },
];
export const CATEGORIAS_PADRAO_ES = [
  { emoji: "🎫", nome: "Soporte" },
  { emoji: "🚨", nome: "Denuncia" },
  { emoji: "💡", nome: "Sugerencia" },
];

const semVS = (e) => { let v = String(e ?? ""); try { v = decodeURIComponent(v); } catch {} return v.replace(/\uFE0F/g, ""); };
const mesmoEmoji = (a, b) => semVS(a) === semVS(b);
const num4 = (n) => String(n).padStart(4, "0");

// (P2, 31 out 2026) o registro dos tickets vai para o log dos tickets; sem um, para o
// canal de log do servidor (`&config`) — sem precisar de mais um passo antes do primeiro ticket
const logDosTickets = (ctx, cfg) => cfg.logCanal ?? ctx?.config?.log?.canalId ?? null;

function garantirCfg(config) {
  config.tickets ??= {};
  const c = config.tickets;
  c.contador ??= 0;
  c.logCanal ??= null;
  // os assuntos padrão no idioma do servidor (e trocam junto se ninguém mexeu neles)
  const en = textoDoIdioma(config.language) === "en";
  const es = idiomaDaTela(config.language) === "es";
  const padrao = (es ? CATEGORIAS_PADRAO_ES : en ? CATEGORIAS_PADRAO_EN : CATEGORIAS_PADRAO).map((x) => ({ ...x }));
  const ehPadrao = (lista) => JSON.stringify(lista) === JSON.stringify(CATEGORIAS_PADRAO) || JSON.stringify(lista) === JSON.stringify(CATEGORIAS_PADRAO_EN) || JSON.stringify(lista) === JSON.stringify(CATEGORIAS_PADRAO_ES);
  if (!c.categorias || ehPadrao(c.categorias)) c.categorias = padrao;
  c.painel ??= null;   // { canalId, msgId }
  return c;
}

// ── Transcrição (puro, testável) ────────────────────────────────────────────
export function formatarTranscricao(mensagens, { nomeCanal = "ticket", en = false, l = null, cabecalho = [] } = {}) {
  // mensagens: [{autor, quando, texto, anexos, embeds}] em ordem cronológica
  const es = l === "es";   // o arquivo .txt não passa pela tela: o espanhol vai sem marca
  const linhas = [es ? `Transcripción de #${nomeCanal}` : en ? `Transcript of #${nomeCanal}` : `Transcrição de #${nomeCanal}`, ...cabecalho, "─".repeat(40)];
  for (const m of mensagens) {
    const hora = m.quando ? new Date(m.quando).toISOString().replace("T", " ").slice(0, 19) : "??";
    const partes = [];
    const texto = String(m.texto ?? "").trim();
    if (texto) partes.push(texto);
    for (const e of m.embeds ?? []) {
      const t = [e.title, e.description].filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
      if (t) partes.push(`[embed] ${t}`);
    }
    if (m.anexos) partes.push(es ? `(${m.anexos} adjunto(s))` : en ? `(${m.anexos} attachment(s))` : `(${m.anexos} anexo(s))`);
    linhas.push(`[${hora}] ${m.autor}: ${partes.join(" ") || (es ? "(vacío)" : en ? "(empty)" : "(vazio)")}`);
  }
  return linhas.join("\n");
}

export function fatiarTranscricao(texto, tamanho = 1800) {
  const fatias = [];
  let atual = "";
  for (const l of String(texto ?? "").split("\n")) {
    if ((atual + "\n" + l).length > tamanho && atual) { fatias.push(atual); atual = l; }
    else atual = atual ? atual + "\n" + l : l;
  }
  if (atual) fatias.push(atual);
  return fatias;
}

async function coletarHistorico(canal) {
  const todas = [];
  let antes;
  while (todas.length < MAX_MSGS_TRANSCRICAO) {
    const lote = await canal.fetchMessages?.({ limit: 100, ...(antes ? { before: antes } : {}) }).catch(() => null);
    if (!lote?.length) break;
    todas.push(...lote);
    if (lote.length < 100) break;
    antes = lote[lote.length - 1].id;
  }
  return todas.slice(0, MAX_MSGS_TRANSCRICAO).reverse().map((m) => ({
    autor: m.member?.nickname ?? m.author?.username ?? m.authorId ?? "?",
    quando: m.createdAt ?? m.created_at ?? null,
    texto: m.content ?? "",
    anexos: m.attachments?.length ?? 0,
    embeds: (m.embeds ?? []).map((e) => ({ title: e.title ?? null, description: e.description ?? null })),
  }));
}

// ── Quem é staff (para 🔒 e 🗑️) ─────────────────────────────────────────────
export async function ehStaff(server, userId, config, ctx = null) {
  if (!server || !userId) return false;
  if (server.ownerId === userId) return true;
  try { if (ctx?.ehSuperAdmin?.(userId)) return true; } catch {}
  const membro = await server.fetchMember?.(userId).catch(() => null);
  if (!membro) return false;
  const cargos = (membro.roles ?? []).map((r) => r?.id ?? r);
  if ((config?.acesso?.cargosStaff ?? []).some((r) => cargos.includes(r))) return true;
  if (config?.tickets?.cargoEquipe && cargos.includes(config.tickets.cargoEquipe)) return true;
  try { return !!membro.hasPermission?.(server, "ManageChannel"); } catch { return false; }
}

// ── A staff dentro do ticket (11 out 2026) ──────────────────────────────────
// "O ticket não está adicionando as staffs": o canal nasce fechado para todos
// e cada cargo de staff ganha uma permissão própria nele. Duas falhas, ambas
// mudas (o `.catch(() => {})` engolia o erro):
//  1. só os cargos do `&acesso` entravam — num servidor onde a staff é só
//     "quem tem Gerenciar canais", nenhum cargo entrava;
//  2. regra do Stoat (crates/delta/src/routes/channels/permissions_set.rs):
//     o bot só mexe na permissão de canal de cargo ABAIXO do cargo mais alto
//     dele (rank maior). Cargo de staff acima da Judy → NotElevated. E dar o
//     cargo do ticket para a pessoa também não dá: o bot não edita membro que
//     está acima dele (member_edit.rs).
// Solução: os cargos de staff passam a ser os do `&acesso` + os que têm
// Gerenciar canais/servidor; os que estão abaixo da Judy entram direto; para
// os que estão acima existe a "Equipe de tickets" — um cargo que a Judy cria
// (nasce embaixo de todos, então ela pode usá-lo), dá a quem ela alcança e
// pede que um admin dê a quem está acima dela. A conferência roda no
// `&ticket painel` e no `&ticket equipe`, e cada ticket aberto com staff de
// fora avisa no log — nada mais fica mudo.
const B_MANAGE_CHANNEL = 1n << 0n, B_MANAGE_SERVER = 1n << 1n;
const B_VER_TUDO = PERMS_TICKET.ViewChannel | PERMS_TICKET.ReadMessageHistory | PERMS_TICKET.SendMessage;

function entradasDeCargos(server) {
  const r = server?.roles;
  if (!r) return [];
  try { if (typeof r.entries === "function") return [...r.entries()]; } catch {}
  return Object.entries(r);
}
const permissoesDoCargo = (cargo) => { try { return BigInt(cargo?.permissions?.a ?? 0); } catch { return 0n; } };

async function membroDoBot(server, client) {
  try { if (server?.member) return server.member; } catch {}
  return await server?.fetchMember?.(client?.user?.id).catch(() => null) ?? null;
}

// Puro (testável): quais cargos são de staff e o que a Judy consegue fazer com cada um.
export function classificarStaff(server, config, botMembro) {
  const cfg = config?.tickets ?? {};
  const doBot = new Set(idsDeCargos(botMembro));
  const ids = new Set(config?.acesso?.cargosStaff ?? []);
  for (const [id, cargo] of entradasDeCargos(server)) {
    if (permissoesDoCargo(cargo) & (B_MANAGE_CHANNEL | B_MANAGE_SERVER)) ids.add(id);
  }
  const rankBot = rankDoMembro(server, botMembro);
  const r = { entram: [], acima: [], veemSozinhos: [], sumidos: [] };
  for (const id of ids) {
    if (doBot.has(id) || id === cfg.cargoEquipe) continue;
    const cargo = cargoDe(server, id);
    if (!cargo && entradasDeCargos(server).length) { r.sumidos.push(id); continue; }
    const rank = rankDoCargo(server, id);
    // rank desconhecido: tenta mesmo assim (o Stoat decide)
    if (rank === null || rank > rankBot) r.entram.push(id);
    // permissão própria de ver/escrever no servidor vence o "fechado para todos"
    // (o Stoat aplica o padrão do canal ANTES dos cargos do servidor — impl.rs)
    else if ((permissoesDoCargo(cargo) & B_VER_TUDO) === B_VER_TUDO) r.veemSozinhos.push(id);
    else r.acima.push(id);
  }
  return r;
}

// O cargo mais alto da Judy — é ele que precisa subir na lista de cargos.
export function cargoMaisAltoDoBot(server, botMembro) {
  const ids = idsDeCargos(botMembro).filter((id) => rankDoCargo(server, id) !== null);
  return ids.sort((a, b) => rankDoCargo(server, a) - rankDoCargo(server, b))[0] ?? null;
}

// As três saídas para cargos acima da Judy, do melhor para o pior (13 out
// 2026: o aviso só oferecia o `&ticket equipe`, que não resolve para quem tem
// esses cargos — eles também estão acima dela, então ela não lhes dá cargo).
export function saidasParaAcima({ acima, cargoBot = null, en = false, l = null, P = "&" }) {
  const cargos = acima.map((id) => `<%${id}>`).join(" ");
  if (l === "es") {
    const meuEs = cargoBot ? `<%${cargoBot}>` : "el rol de Judy";
    return [
      `**1. Lo mejor:** en Configuración del servidor → Roles, arrastra ${meuEs} **por encima** de ${cargos}. Así cada ticket ya incluye esos roles solo.`,
      `**2. O:** en los **permisos del servidor** de cada uno de esos roles, activa *Ver canal*, *Leer historial* y *Enviar mensajes* — pasan a ver todos los tickets sin que Judy los toque.`,
      `**3. O:** \`${citar("ticket.equipe", "es", P)}\` crea el rol **Equipo de tickets** — pero quien tiene esos roles también está por encima de Judy, así que un admin tiene que dárselo a mano.`,
      "_El dueño del servidor siempre ve todos los tickets._",
    ].map(trechoPronto);
  }
  const meu = cargoBot ? `<%${cargoBot}>` : (en ? "Judy's role" : "o cargo da Judy");
  return en ? [
    `**1. Best:** in Server settings → Roles, drag ${meu} **above** ${cargos}. Every ticket then includes them on its own.`,
    `**2. Or:** in each of those roles' **server permissions**, turn on *View channel*, *Read message history* and *Send messages* — they'll see every ticket without Judy touching them.`,
    `**3. Or:** \`${citarInterno("ticket.equipe", P)}\` creates a **Ticket team** role — but whoever holds those roles is above Judy too, so an admin has to give it to them by hand.`,
    "_The server owner always sees every ticket._",
  ] : [
    `**1. Melhor:** em Configurações do servidor → Cargos, arraste ${meu} para **cima** de ${cargos}. Aí todo ticket já inclui esses cargos sozinho.`,
    `**2. Ou:** nas **permissões do servidor** de cada um desses cargos, ligue *Ver canal*, *Ler histórico* e *Enviar mensagens* — eles passam a ver todo ticket sem a Judy mexer neles.`,
    `**3. Ou:** \`${citarInterno("ticket.equipe", P)}\` cria o cargo **Equipe de tickets** — mas quem tem esses cargos também está acima da Judy, então um admin precisa dar o cargo à mão.`,
    "_O dono do servidor sempre vê todos os tickets._",
  ];
}

const ultimoAvisoEquipe = new Map();   // serverId → ms
const AVISO_EQUIPE_MS = 6 * 3600_000;

function linhasDoRelatorioStaff(cls, { equipe = null, deram = [], faltam = [], en = false, l = null, P = "&", cargoBot = null } = {}) {
  const cargos = (lista) => lista.map((id) => `<%${id}>`).join(" ");
  // l === "es" → o espanhol, pronto (marcado); senão o en/pt de sempre
  const X = (pt, eng, es) => (l === "es" ? trechoPronto(es) : en ? eng : pt);
  const L = [];
  if (cls.entram.length) L.push(`✅ ${X("Entram em todo ticket:", "Enter every ticket:", "Entran en todos los tickets:")} ${cargos(cls.entram)}`);
  if (cls.veemSozinhos.length) L.push(`✅ ${X("Veem pela permissão própria no servidor:", "See it through their own server permissions:", "Lo ven por su propio permiso en el servidor:")} ${cargos(cls.veemSozinhos)}`);
  if (equipe) L.push(`✅ ${X("Cargo da equipe de tickets:", "Ticket team role:", "Rol del equipo de tickets:")} <%${equipe}>${deram.length ? ` — ${X("dado a", "given to", "dado a")} ${deram.map((u) => `<@${u}>`).join(" ")}` : ""}`);
  if (cls.acima.length && !equipe) {
    L.push(`⚠️ ${X("Acima da Judy — o Stoat não deixa ela pôr no ticket:", "Above Judy — Stoat won't let her add them:", "Por encima de Judy — Stoat no la deja añadirlos al ticket:")} ${cargos(cls.acima)}`);
    L.push(...saidasParaAcima({ acima: cls.acima, cargoBot, en, l, P }));
  }
  if (faltam.length) {
    L.push(`⚠️ ${X("Estão acima da Judy, então ela não consegue dar o cargo — um admin dá à mão:", "Above Judy, so she can't give them the role — an admin gives it by hand:", "Están por encima de Judy, así que no puede darles el rol — un admin se lo da a mano:")} ${faltam.map((u) => `<@${u}>`).join(" ")}`);
    L.push(X(`_Ou suba ${cargoBot ? `<%${cargoBot}>` : "o cargo da Judy"} acima dos cargos dessas pessoas — aí ela mesma dá._`,
      `_Or move ${cargoBot ? `<%${cargoBot}>` : "Judy's role"} above their roles — then she does it herself._`,
      `_O sube ${cargoBot ? `<%${cargoBot}>` : "el rol de Judy"} por encima de los roles de esas personas — así lo da ella misma._`));
  }
  if (!cls.entram.length && !cls.veemSozinhos.length && !cls.acima.length && !equipe) {
    L.push(X(`⚠️ Nenhum cargo de staff encontrado. Marque com \`${citarInterno("staff.add", P)} @cargo\` (ou dê **Gerenciar canais** a um cargo).`,
      `⚠️ No staff role found. Mark them with \`${citarInterno("staff.add", P)} @role\` (or give a role **Manage channels**).`,
      `⚠️ No se encontró ningún rol de staff. Márcalos con \`${citar("staff.add", "es", P)} @rol\` (o da **Gestionar canales** a un rol).`));
  }
  return L;
}

// Cria (ou reaproveita) o cargo da equipe, dá a quem a Judy alcança e põe nos
// tickets que já estão abertos. Devolve o relatório para mostrar à staff.
export async function prepararEquipe({ ctx, server, criar = true }) {
  const cfg = garantirCfg(ctx.config);
  const en = lingua(ctx) === "en";
  const l = idiomaDe(ctx);
  const bot = await membroDoBot(server, ctx.client);
  let cls = classificarStaff(server, ctx.config, bot);
  if (cfg.cargoEquipe && entradasDeCargos(server).length && !cargoDe(server, cfg.cargoEquipe)) {
    cfg.cargoEquipe = null; ctx.salvarConfig?.();     // apagado por alguém: recria
  }
  const precisa = cls.acima.length > 0;
  const cargoBot = cargoMaisAltoDoBot(server, bot);
  if (!cfg.cargoEquipe && (!precisa || !criar)) return { cls, equipe: null, deram: [], faltam: [], linhas: linhasDoRelatorioStaff(cls, { en, l, P: ctx.PREFIXO, cargoBot }) };

  if (!cfg.cargoEquipe) {
    try {
      const criado = await server.createRole(l === "es" ? "Equipo de tickets" : en ? "Ticket team" : "Equipe de tickets");
      cfg.cargoEquipe = criado?.id ?? criado?.role?._id ?? criado?.role?.id ?? null;
      ctx.salvarConfig?.();
    } catch (e) {
      const L = linhasDoRelatorioStaff(cls, { en, l, P: ctx.PREFIXO, cargoBot });
      L.push(`❌ ${tr(ctx, "Não consegui criar o cargo", "I couldn't create the role", "No pude crear el rol")}: ${descreverErro(e, en ? "en" : "pt")}`);
      return { cls, equipe: null, deram: [], faltam: [], linhas: L, erro: true };
    }
  }
  const equipe = cfg.cargoEquipe;

  // quem é staff: tem um dos cargos de staff (inclusive os acima da Judy)
  const cargosStaff = new Set([...cls.entram, ...cls.acima, ...cls.veemSozinhos]);
  const rankBot = rankDoMembro(server, bot);
  const deram = [], faltam = [];
  let membros = [];
  try { const r = await server.fetchMembers(); membros = r?.members ?? r ?? []; } catch (e) { registrarErro("TICKET", e); }
  const botId = ctx.client?.user?.id;
  for (const m of membros) {
    const uid = m?.id?.user ?? m?.id;
    if (!uid || uid === botId || uid === server.ownerId || m?.user?.bot) continue;
    const ids = idsDeCargos(m);
    if (!ids.some((id) => cargosStaff.has(id)) || ids.includes(equipe)) continue;
    if (rankDoMembro(server, m) <= rankBot) { faltam.push(uid); continue; }
    try { await editarCargos(server, m, (atuais) => [...atuais, equipe]); deram.push(uid); }
    catch (e) { if (tipoDoErro(e) === "NotElevated") faltam.push(uid); else console.error(`[TICKET] equipe → ${uid}: ${descreverErro(e)}`); }
  }

  // os tickets que já existem passam a aceitar a equipe também
  const perms = Number(permsQueOBotDa(server));
  for (const t of db.listarTickets(ctx.serverId)) {
    const canal = await canalPorId(ctx.client, t.canalId);
    await canal?.setPermissions?.(equipe, { allow: perms, deny: 0 }).catch((e) => console.error(`[TICKET] equipe no #${t.numero}: ${descreverErro(e)}`));
  }
  cls = classificarStaff(server, ctx.config, bot);
  return { cls, equipe, deram, faltam, linhas: linhasDoRelatorioStaff(cls, { equipe, deram, faltam, en, l, P: ctx.PREFIXO, cargoBot }) };
}

// Põe a staff no canal recém-criado. Nunca derruba a abertura: o que não
// entrou volta na lista `fora` (e vira aviso no log).
async function porStaffNoCanal({ ctx, server, canal, permitidas }) {
  const cfg = garantirCfg(ctx.config);
  const bot = await membroDoBot(server, ctx.client);
  const cls = classificarStaff(server, ctx.config, bot);
  const fora = [...cls.acima];
  const alvos = [...cls.entram, ...(cfg.cargoEquipe ? [cfg.cargoEquipe] : [])];
  for (const id of alvos) {
    try { await canal.setPermissions(id, { allow: permitidas, deny: 0 }); }
    catch (e) {
      console.error(`[TICKET] cargo de staff ${id} não entrou no ${canal.name ?? canal.id}: ${descreverErro(e)}`);
      if (id !== cfg.cargoEquipe) fora.push(id);
    }
  }
  return { cls, fora, temEquipe: !!cfg.cargoEquipe, cargoBot: cargoMaisAltoDoBot(server, bot) };
}

async function avisarStaffDeFora({ ctx, fora, numero, cargoBot = null }) {
  const cfg = garantirCfg(ctx.config);
  if (!fora.length || cfg.cargoEquipe || !logDosTickets(ctx, cfg)) return false;
  const agora = Date.now();
  if (agora - (ultimoAvisoEquipe.get(ctx.serverId) ?? 0) < AVISO_EQUIPE_MS) return false;
  ultimoAvisoEquipe.set(ctx.serverId, agora);
  const logCanal = await canalPorId(ctx.client, logDosTickets(ctx, cfg));
  if (!logCanal) return false;
  const P = ctx.PREFIXO ?? "&";
  await ctx.sendEmbed(logCanal, tr(ctx, {
    title: `⚠️ Ticket #${numero}: parte da staff ficou de fora`,
    description: [
      `Os cargos ${fora.map((id) => `<%${id}>`).join(" ")} estão **acima da Judy**${cargoBot ? ` (o cargo dela é <%${cargoBot}>)` : ""} — o Stoat não deixa ela pô-los no canal do ticket.`,
      "",
      ...saidasParaAcima({ acima: fora, cargoBot, en: false, P }),
      "",
      `_Este aviso volta no máximo a cada 6 h. Conferir agora: \`${citarInterno("ticket.equipe", P)}\`._`,
    ].join("\n"),
    colour: ctx.COR.aviso,
  }, {
    title: `⚠️ Ticket #${numero}: part of the staff was left out`,
    description: [
      `The roles ${fora.map((id) => `<%${id}>`).join(" ")} are **above Judy**${cargoBot ? ` (her role is <%${cargoBot}>)` : ""} — Stoat won't let her add them to the ticket channel.`,
      "",
      ...saidasParaAcima({ acima: fora, cargoBot, en: true, P }),
      "",
      `_This warning comes back at most every 6 h. Check now: \`${citarInterno("ticket.equipe", P)}\`._`,
    ].join("\n"),
    colour: ctx.COR.aviso,
  }, {
    title: `⚠️ Ticket #${numero}: parte del staff quedó fuera`,
    description: [
      `Los roles ${fora.map((id) => `<%${id}>`).join(" ")} están **por encima de Judy**${cargoBot ? ` (su rol es <%${cargoBot}>)` : ""} — Stoat no la deja añadirlos al canal del ticket.`,
      "",
      ...saidasParaAcima({ acima: fora, cargoBot, en: true, l: "es", P }),
      "",
      `_Este aviso vuelve como máximo cada 6 h. Comprobar ahora: \`${citar("ticket.equipe", "es", P)}\`._`,
    ].join("\n"),
    colour: ctx.COR.aviso,
  })).catch((e) => registrarErro("TICKET", e));
  return true;
}

const canalPorId = async (client, id) => client?.channels?.get?.(id) ?? await client?.channels?.fetch?.(id).catch(() => null) ?? null;

// Tira a reação da pessoa (para a mensagem não acumular e dar para reagir de novo).
async function tirarReacao(canalId, msgId, emoji, userId) {
  await chamarApi(`/channels/${canalId}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}?user_id=${userId}`, { metodo: "DELETE" });
}

// ── Painel ───────────────────────────────────────────────────────────────────
export async function publicarPainel({ ctx, canal }) {
  const cfg = garantirCfg(ctx.config);
  const en = lingua(ctx) === "en";
  const l = idiomaDe(ctx);
  // o painel antigo deixa de valer
  if (cfg.painel?.msgId) {
    db.esquecerMsgTicket(cfg.painel.msgId);
    const velho = await canalPorId(ctx.client, cfg.painel.canalId);
    await velho?.fetchMessage?.(cfg.painel.msgId).then((m) => m?.delete?.()).catch(() => {});
  }
  const msg = await ctx.sendEmbed(canal, {
    title: tr(ctx, "🎫 Abrir um ticket", "🎫 Open a ticket", "🎫 Abrir un ticket"),
    description: [
      tr(ctx, "Reaja com o assunto e eu abro um **canal privado** entre você e a staff:", "React with the topic and I'll open a **private channel** between you and the staff:", "Reacciona con el tema y abro un **canal privado** entre tú y el staff:"),
      "",
      ...cfg.categorias.map((c) => `${c.emoji} — **${c.nome}**`),
      "",
      tr(ctx, "_Um ticket aberto por pessoa de cada vez._", "_One open ticket per person at a time._", "_Un ticket abierto por persona a la vez._"),
    ].join("\n"),
    colour: ctx.COR.info,
  });
  if (!msg?.id) throw new Error(l === "es" ? "no pude publicar en ese canal" : en ? "I couldn't post in that channel" : "não consegui postar nesse canal");
  for (const c of cfg.categorias) await msg.react?.(encodeURIComponent(c.emoji)).catch(() => msg.react?.(c.emoji).catch(() => {}));
  db.registrarMsgTicket(msg.id, ctx.serverId, canal.id ?? canal._id, "painel");
  cfg.painel = { canalId: canal.id ?? canal._id, msgId: msg.id };
  ctx.salvarConfig?.();
  return msg;
}

// ── Abrir ────────────────────────────────────────────────────────────────────
export async function abrirTicket({ ctx, server, userId, motivo = "", categoria = null }) {
  const cfg = garantirCfg(ctx.config);
  const en = lingua(ctx) === "en";
  const lang = en ? "en" : "pt";
  // erros e nome/descrição do canal: texto puro (vão dentro de outro texto ou para o Stoat)
  const es = idiomaDe(ctx) === "es";
  const X = (pt, eng, esp) => (es ? esp : en ? eng : pt);
  const abertos = db.listarTickets(ctx.serverId);
  const jaTem = abertos.find((t) => t.autorId === userId);
  if (jaTem) return { jaTem: jaTem.canalId };
  if (!logDosTickets(ctx, cfg)) return { semLog: true };
  if (abertos.length >= MAX_ABERTOS_SERVIDOR) return { cheio: true };
  // quem entrou há menos de 10 min não abre (conta de raid); sem a data, o Stoat decide
  const quem = await server.fetchMember?.(userId).catch(() => null);
  const entrou = quem?.joinedAt ? new Date(quem.joinedAt).getTime() : NaN;
  if (Number.isFinite(entrou) && Date.now() - entrou < ENTRADA_MIN_MS) return { novo: true };

  const numero = ++cfg.contador;
  ctx.salvarConfig?.();
  const nome = `ticket-${num4(numero)}`;
  let roleId = null, canal = null, staffFora = [], cargoBotTicket = null;
  try {
    const criado = await server.createRole(nome);
    roleId = criado?.id ?? criado?.role?._id ?? criado?.role?.id;
    if (!roleId) throw new Error(X("a API não devolveu o id do cargo (falta ManageRole?)", "the API didn't return the role id (missing ManageRole?)", "la API no devolvió el id del rol (¿falta ManageRole?)"));
    // o cargo do ticket vai para quem abriu
    const membro = quem ?? await server.fetchMember(userId).catch(() => null);
    if (!membro) throw new Error(X("não te achei no servidor", "I couldn't find you on the server", "no te encontré en el servidor"));
    await editarCargos(server, membro, (atuais) => [...atuais, roleId]).catch((e) => { throw new Error(descreverErro(e, lang)); });
    // e o bot entra no canal pelo cargo DELE (antes ele se dava o cargo do ticket —
    // mais uma edição de membro, mais uma chance de tropeçar num cargo velho)
    const bot = (() => { try { return server.member ?? null; } catch { return null; } })()
      ?? await server.fetchMember(ctx.client?.user?.id).catch(() => null);
    // O bot também ganha o cargo do ticket: é por ele que enxerga o canal. (Pôr a
    // permissão no cargo do PRÓPRIO bot não dá: o Stoat recusa mexer no cargo de
    // quem está na mesma altura — NotElevated.)
    if (bot) await editarCargos(server, bot, (atuais) => [...atuais, roleId]).catch((e) => { throw new Error(descreverErro(e, lang)); });
    const descricao = [categoria?.nome, motivo].filter(Boolean).join(" — ") || X("Ticket de suporte", "Support ticket", "Ticket de soporte");
    canal = await server.createChannel({ type: "Text", name: nome, description: descricao.slice(0, 1000) });
    if (!canal?.id) throw new Error(X("a API não devolveu o canal (falta ManageChannel?)", "the API didn't return the channel (missing ManageChannel?)", "la API no devolvió el canal (¿falta ManageChannel?)"));
    const permitidas = Number(permsQueOBotDa(server));
    // primeiro quem pode entrar, depois fecha para o resto
    await canal.setPermissions(roleId, { allow: permitidas, deny: 0 }).catch((e) => { throw new Error(descreverErro(e, lang)); });
    const st = await porStaffNoCanal({ ctx, server, canal, permitidas });
    staffFora = st.fora; cargoBotTicket = st.cargoBot;
    await canal.setPermissions("default", { allow: 0, deny: Number(DENY_TUDO) }).catch((e) => { throw new Error(descreverErro(e, lang)); });
  } catch (e) {
    // desfaz o que já foi criado; o que não sair fica no log (canal/cargo órfão)
    try { if (canal?.delete) await canal.delete(); } catch (e2) { registrarErro("TICKET", e2); }
    try { if (roleId) await server.deleteRole?.(roleId); } catch (e2) { registrarErro("TICKET", e2); }
    return { erro: e instanceof Error ? e.message : descreverErro(e, lang) };
  }

  const ticketId = db.criarTicket(ctx.serverId, numero, canal.id, roleId, userId, motivo, categoria?.nome ?? null);
  const controle = await ctx.sendEmbed(canal, tr(ctx, {
    title: `${categoria?.emoji ?? "🎫"} Ticket #${numero}${categoria ? ` — ${categoria.nome}` : ""}`,
    description: [
      `Aberto por <@${userId}>${motivo ? `\n**Motivo:** ${motivo}` : ""}`,
      "",
      "Só você e a staff enxergam este canal. Conte o que precisa.",
      "",
      `${E_FECHAR} — **a staff fecha o ticket** (ou \`${citarInterno("ticket.fechar")}\`): a conversa trava e o registro vai para o log.`,
    ].join("\n"),
    colour: ctx.COR.sucesso,
  }, {
    title: `${categoria?.emoji ?? "🎫"} Ticket #${numero}${categoria ? ` — ${categoria.nome}` : ""}`,
    description: [
      `Opened by <@${userId}>${motivo ? `\n**Reason:** ${motivo}` : ""}`,
      "",
      "Only you and staff can see this channel. Tell us what you need.",
      "",
      `${E_FECHAR} — **staff closes the ticket** (or \`${citarInterno("ticket.fechar")}\`): the conversation locks and the record goes to the log.`,
    ].join("\n"),
    colour: ctx.COR.sucesso,
  }, {
    title: `${categoria?.emoji ?? "🎫"} Ticket #${numero}${categoria ? ` — ${categoria.nome}` : ""}`,
    description: [
      `Abierto por <@${userId}>${motivo ? `\n**Motivo:** ${motivo}` : ""}`,
      "",
      "Solo tú y el staff ven este canal. Cuenta lo que necesitas.",
      "",
      `${E_FECHAR} — **el staff cierra el ticket** (o \`${citar("ticket.fechar", "es")}\`): la conversación se bloquea y el registro va al log.`,
    ].join("\n"),
    colour: ctx.COR.sucesso,
  }));
  if (controle?.id) {
    await controle.react?.(encodeURIComponent(E_FECHAR)).catch((e) => registrarErro("TICKET", e));   // sem o 🔒, só o comando fecha
    db.registrarMsgTicket(controle.id, ctx.serverId, canal.id, "controle", ticketId);
  }
  if (staffFora.length) await avisarStaffDeFora({ ctx, fora: staffFora, numero, cargoBot: cargoBotTicket });
  return { ok: true, canal, numero, ticketId, staffFora };
}

// ── Fechar ───────────────────────────────────────────────────────────────────
export async function fecharTicket({ ctx, server, ticket, porId, nota = "" }) {
  const cfg = garantirCfg(ctx.config);
  const en = lingua(ctx) === "en";
  const l = idiomaDe(ctx);
  // o .txt não passa pela tela: o espanhol vai sem marca
  const X = (pt, eng, es) => (l === "es" ? es : en ? eng : pt);
  const canal = await canalPorId(ctx.client, ticket.canalId);
  const nome = `ticket-${num4(ticket.numero)}`;
  const msgs = canal ? await coletarHistorico(canal) : [];
  const dur = ticket.abertoEm ? Math.round((Date.now() - new Date(ticket.abertoEm).getTime()) / 60000) : null;
  const agoraIso = new Date().toISOString().replace("T", " ").slice(0, 19);
  const texto = formatarTranscricao(msgs, { nomeCanal: nome, en, l, cabecalho: [
    `${X("Categoria", "Category", "Categoría")}: ${ticket.categoria ?? "—"}`,
    `${X("Aberto por", "Opened by", "Abierto por")}: ${ticket.autorId} · ${ticket.abertoEm?.replace("T", " ").slice(0, 19) ?? "?"} UTC`,
    `${X("Fechado por", "Closed by", "Cerrado por")}: ${porId} · ${agoraIso} UTC`,
    ticket.motivo ? `${X("Motivo", "Reason", "Motivo")}: ${ticket.motivo}` : null,
    nota ? `${X("Nota de fechamento", "Closing note", "Nota de cierre")}: ${nota}` : null,
  ].filter(Boolean) });

  // 2) o registro vai para o log como .txt (e, se o upload falhar, em blocos de texto)
  let travou = false;
  let logCanal = logDosTickets(ctx, cfg) ? await canalPorId(ctx.client, logDosTickets(ctx, cfg)) : null;
  if (canalDeOutroServidor(logCanal, ctx.serverId)) logCanal = null;   // o registro nunca vai para outro servidor
  let arquivo = false, registroCompleto = false;
  if (logCanal) {
    let anexoId = null;
    try {
      anexoId = await subirAnexo({ base64: Buffer.from(texto, "utf8").toString("base64"), mime: "text/plain", nome: `${nome}.txt` }, ctx.client);
    } catch (e) { registrarErro("TICKET", e); }
    const resumo = await ctx.sendEmbed(logCanal, {
      title: `🗂️ Ticket #${ticket.numero} ${tr(ctx, "fechado", "closed", "cerrado")}`,
      description: [
        `${tr(ctx, "Aberto por", "Opened by", "Abierto por")} <@${ticket.autorId}> · ${tr(ctx, "fechado por", "closed by", "cerrado por")} <@${porId}>`,
        ticket.categoria ? `**${tr(ctx, "Categoria", "Category", "Categoría")}:** ${ticket.categoria}` : null,
        ticket.motivo ? `**${tr(ctx, "Motivo", "Reason", "Motivo")}:** ${ticket.motivo}` : null,
        nota ? `**${tr(ctx, "Nota de fechamento", "Closing note", "Nota de cierre")}:** ${nota}` : null,
        `${msgs.length} ${tr(ctx, "mensagem(ns)", "message(s)", "mensaje(s)")}${dur != null ? ` · ${dur} min` : ""} · <#${ticket.canalId}>`,
        anexoId ? tr(ctx, "📎 Registro completo no arquivo anexo.", "📎 Full record attached.", "📎 Registro completo en el archivo adjunto.") : null,
      ].filter(Boolean).join("\n"),
      colour: ctx.COR.mod ?? ctx.COR.info,
      anexos: anexoId ? [anexoId] : null,
    });
    if (anexoId) { arquivo = true; registroCompleto = !!resumo; }
    else {
      // (31 out 2026) em texto, a transcrição é mensagem COMUM: o que as pessoas
      // escreveram passa por textoDeFora (sem @everyone, sem link mascarado), e
      // o "foi para o log" só aparece se TODAS as partes saíram
      let todas = !!resumo;
      for (const fatia of fatiarTranscricao(textoDeFora(texto, { max: 5_000_000 }))) {
        try { await logCanal.sendMessage({ content: "```text\n" + fatia.replace(/```/g, "ˋˋˋ") + "\n```" }); }
        catch (e) { todas = false; registrarErro("TICKET", e); }
      }
      registroCompleto = todas;
    }
  }

  db.marcarTicketFechado(ticket.id, porId);
  for (const m of db.getDb().prepare("SELECT msgId FROM ticket_mensagens WHERE ticketId = ? AND tipo = 'controle'").all(ticket.id)) db.esquecerMsgTicket(m.msgId);

  // 3) aviso no próprio canal, com o 🗑️ para a staff apagar depois
  if (canal) {
    const aviso = await ctx.sendEmbed(canal, tr(ctx, {
      title: `${E_FECHAR} Ticket fechado`,
      description: [
        `Fechado por <@${porId}>.${nota ? `\n**Nota:** ${nota}` : ""}`,
        "A conversa está travada: dá para ler, não dá para escrever.",
        registroCompleto ? `O registro completo foi para <#${logDosTickets(ctx, cfg)}>.` : logCanal ? "⚠️ O registro não foi inteiro para o log — confira o canal de log e as permissões da Judy lá." : "⚠️ Sem canal de log configurado — o registro não foi guardado.",
        "",
        `${E_APAGAR} — a staff apaga este canal.`,
      ].join("\n"),
      colour: ctx.COR.aviso,
    }, {
      title: `${E_FECHAR} Ticket closed`,
      description: [
        `Closed by <@${porId}>.${nota ? `\n**Note:** ${nota}` : ""}`,
        "The conversation is locked: it can be read, not written.",
        registroCompleto ? `The full record went to <#${logDosTickets(ctx, cfg)}>.` : logCanal ? "⚠️ The record didn't fully reach the log — check the log channel and Judy's permissions there." : "⚠️ No log channel set — the record wasn't kept.",
        "",
        `${E_APAGAR} — staff deletes this channel.`,
      ].join("\n"),
      colour: ctx.COR.aviso,
    }, {
      title: `${E_FECHAR} Ticket cerrado`,
      description: [
        `Cerrado por <@${porId}>.${nota ? `\n**Nota:** ${nota}` : ""}`,
        "La conversación está bloqueada: se puede leer, no escribir.",
        registroCompleto ? `El registro completo fue a <#${logDosTickets(ctx, cfg)}>.` : logCanal ? "⚠️ El registro no llegó completo al log — revisa el canal de log y los permisos de Judy allí." : "⚠️ No hay canal de log configurado — el registro no se guardó.",
        "",
        `${E_APAGAR} — el staff borra este canal.`,
      ].join("\n"),
      colour: ctx.COR.aviso,
    })).catch(() => null);
    if (aviso?.id) {
      await aviso.react?.(encodeURIComponent(E_APAGAR)).catch((e) => registrarErro("TICKET", e));
      db.registrarMsgTicket(aviso.id, ctx.serverId, ticket.canalId, "fechado", ticket.id);
    }
  }
  // 4) trava — DEPOIS do aviso: o bot também tem o cargo do ticket, e depois
  //    de travar nem ele escreve ali. Só o que é escrever sai (ler fica; e o bot
  //    segue podendo apagar o canal e limpar reações, que vêm do cargo dele).
  if (canal && ticket.roleId) {
    try {
      await canal.setPermissions(ticket.roleId, { allow: Number(VER_E_LER), deny: Number(ESCREVER) });
      travou = true;
    } catch (e) { console.error(`[TICKET] não travei ${nome}: ${descreverErro(e)}`); }
  }

  if (!travou && canal) await canal.sendMessage?.({ content: X("⚠️ Não consegui travar este canal (falta ManagePermissions?).", "⚠️ I couldn't lock this channel (missing ManagePermissions?).", "⚠️ No pude bloquear este canal (¿falta ManagePermissions?).") }).catch(() => {});
  return { ok: true, travou, arquivo, registroCompleto, mensagens: msgs.length };
}

// ── Apagar (depois de fechado) ───────────────────────────────────────────────
export async function apagarTicket({ ctx, server, ticket }) {
  const canal = await canalPorId(ctx.client, ticket.canalId);
  try { if (ticket.roleId) await server?.deleteRole?.(ticket.roleId); } catch (e) { registrarErro("TICKET", e); }   // cargo órfão: fica no log
  try { await canal?.delete?.(); } catch (e) { return { erro: descreverErro(e) }; }
  db.marcarTicketApagado(ticket.id);
  for (const m of db.getDb().prepare("SELECT msgId FROM ticket_mensagens WHERE ticketId = ?").all(ticket.id)) db.esquecerMsgTicket(m.msgId);
  return { ok: true };
}

// Os dois "não abre" novos (31 out 2026), nos 3 idiomas: [pt, en, es]
const avisoCheio = (u) => [`<@${u}>, este servidor já tem **${MAX_ABERTOS_SERVIDOR}** tickets abertos — espere a staff fechar algum.`,
  `<@${u}>, this server already has **${MAX_ABERTOS_SERVIDOR}** open tickets — wait for staff to close one.`,
  `<@${u}>, este servidor ya tiene **${MAX_ABERTOS_SERVIDOR}** tickets abiertos — espera a que el staff cierre alguno.`];
const avisoNovo = (u) => [`<@${u}>, você entrou há pouco — espere alguns minutos para abrir um ticket.`,
  `<@${u}>, you just joined — wait a few minutes before opening a ticket.`,
  `<@${u}>, acabas de entrar — espera unos minutos para abrir un ticket.`];

// ── Reações (painel 🎫, controle 🔒, fechado 🗑️) ─────────────────────────────
// `criarContexto(serverId)` vem do main: a reação chega sem servidor.
export async function aoReagir(msgObj, userId, emoji, { client, criarContexto }) {
  const msgId = msgObj?.id ?? msgObj?._id ?? msgObj;
  const reg = msgId ? db.msgTicket(msgId) : null;
  if (!reg || !userId || userId === client?.user?.id) return false;
  const ctx = { ...criarContexto(reg.serverId), client };
  const server = await client.servers.fetch(reg.serverId).catch(() => null);
  if (!server) return true;
  const avisar = async (txtPt, txtEn, txtEs) => {
    const canal = await canalPorId(client, reg.canalId);
    const m = await ctx.sendEmbed(canal, tr(ctx, { description: txtPt, colour: ctx.COR.aviso }, { description: txtEn, colour: ctx.COR.aviso }, { description: txtEs, colour: ctx.COR.aviso })).catch(() => null);
    if (m?.delete) setTimeout(() => m.delete().catch(() => {}), 15_000);
  };

  if (reg.tipo === "painel") {
    const cfg = garantirCfg(ctx.config);
    const categoria = cfg.categorias.find((c) => mesmoEmoji(c.emoji, emoji));
    if (!categoria) return true;
    await tirarReacao(reg.canalId, msgId, emoji, userId);
    const r = await abrirTicket({ ctx, server, userId, categoria });
    if (r.jaTem) await avisar(`<@${userId}>, você já tem um ticket aberto: <#${r.jaTem}>`, `<@${userId}>, you already have an open ticket: <#${r.jaTem}>`, `<@${userId}>, ya tienes un ticket abierto: <#${r.jaTem}>`);
    else if (r.cheio) await avisar(...avisoCheio(userId));
    else if (r.novo) await avisar(...avisoNovo(userId));
    else if (r.semLog) await avisar("A staff ainda não definiu o canal de log.", "Staff hasn't set a log channel yet.", "El staff todavía no definió el canal de log.");
    else if (r.erro) { console.error(`[TICKET] abrir falhou: ${r.erro}`); await avisar(`Não consegui abrir o ticket: ${r.erro}`, `I couldn't open the ticket: ${r.erro}`, `No pude abrir el ticket: ${r.erro}`); }
    return true;
  }

  const ticket = reg.ticketId ? db.ticketPorId(reg.ticketId) : null;
  if (!ticket) return true;
  console.log(`[TICKET] ${semVS(emoji)} de ${userId} no ticket #${ticket.numero} (${reg.tipo}, ${ticket.status})`);
  if (reg.tipo === "controle" && mesmoEmoji(emoji, E_FECHAR)) {
    if (!(await ehStaff(server, userId, ctx.config, ctx))) {
      await tirarReacao(reg.canalId, msgId, emoji, userId);
      await avisar(`<@${userId}>, só a staff fecha o ticket.`, `<@${userId}>, only staff can close the ticket.`, `<@${userId}>, solo el staff cierra el ticket.`);
      return true;
    }
    if (ticket.status === "aberto") await fecharTicket({ ctx, server, ticket, porId: userId });
    return true;
  }
  if (reg.tipo === "fechado" && mesmoEmoji(emoji, E_APAGAR)) {
    if (!(await ehStaff(server, userId, ctx.config, ctx))) { await tirarReacao(reg.canalId, msgId, emoji, userId); return true; }
    await apagarTicket({ ctx, server, ticket });
    return true;
  }
  return true;
}

// ── Comando ─────────────────────────────────────────────────────────────────
export async function cmdTicket(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId, config, salvarConfig, getServer, membroTemPermissao } = ctx;
  const en = lingua(ctx) === "en";
  const sub = String(args[0] ?? "").toLowerCase();
  const server = await getServer(message).catch(() => null);
  const cfg = garantirCfg(config);
  const staff = ctx.temCargoStaff?.(message, config) || membroTemPermissao(message, server, "ManageChannel")
    || (!!cfg.cargoEquipe && idsDeCargos(message.member).includes(cfg.cargoEquipe));
  const enviar = (title, description, colour = COR.info) => sendEmbed(message.channel, { title, description, colour });
  const T = (pt, eng, es) => tr(ctx, pt, eng, es);
  // o canal que a staff apontou: "aqui"/vazio = este; senão só se for DESTE servidor
  const canalEscolhido = (entrada) => (!entrada || /^(aqui|here|aquí)$/i.test(String(entrada)))
    ? { id: message.channelId } : canalDesteServidor(server, entrada);
  const semPermissao = () => sendEmbed(message.channel, { description: T("🔒 Só a staff.", "🔒 Staff only.", "🔒 Solo el staff."), colour: COR.aviso });
  const curto = (txt, colour = COR.info) => sendEmbed(message.channel, { description: txt, colour });

  // sem subcomando: a lista (staff); a explicação mora no `&help ticket`
  if (!sub && staff) return cmdTicket(message, ["lista"], ctx);
  if (!sub || ["ajuda", "help"].includes(sub)) return erroDeUso(ctx, message.channel, "ticket", "Faltou o subcomando.", "Missing the subcommand.", "Falta el subcomando.");

  if (sub === "painel" || sub === "panel") {
    if (!staff) return semPermissao();
    // (31 out 2026, R9) só canal DESTE servidor: antes um ID de outro servidor publicava o painel lá
    const escolhido = canalEscolhido(args[1]);
    const canal = escolhido ? await canalPorId(ctx.client, escolhido.id) ?? (escolhido.id === message.channelId ? message.channel : null) : null;
    if (!escolhido) return curto(T("❌ Esse canal não é deste servidor.", "❌ That channel isn't on this server.", "❌ Ese canal no es de este servidor."), COR.erro);
    if (!canal) return curto(T("❌ Não achei esse canal.", "❌ I couldn't find that channel.", "❌ No encontré ese canal."), COR.erro);
    try { await publicarPainel({ ctx, canal }); }
    catch (e) { return curto(`❌ ${descreverErro(e, idiomaDe(ctx))}`, COR.erro); }
    const avisoLog = logDosTickets(ctx, cfg) ? "" : T(`\n⚠️ Sem canal de log: defina um no \`${citarInterno("config", P)}\`.`, `\n⚠️ No log channel: set one in \`${citarInterno("config", P)}\`.`, `\n⚠️ Sin canal de log: define uno en \`${citar("config", "es", P)}\`.`);
    // a staff é conferida aqui, na configuração — não na hora do primeiro ticket
    const eq = server ? await prepararEquipe({ ctx, server }).catch((e) => ({ linhas: [`❌ ${descreverErro(e)}`], erro: true })) : null;
    const pendente = !!eq && (eq.erro || eq.faltam?.length || (eq.cls?.acima?.length && !eq.equipe));
    // a conferência da staff só aparece quando falta algo (equipe automática)
    const avisa = !!eq && (pendente || eq.linhas.some((l) => String(l).includes("⚠️")));
    const blocoStaff = avisa ? `\n\n**${T("Staff nos tickets", "Staff in the tickets", "Staff en los tickets")}**\n${eq.linhas.join("\n")}` : "";
    return curto(T(`🎫 Painel em <#${canal.id}>.`, `🎫 Panel in <#${canal.id}>.`, `🎫 Panel en <#${canal.id}>.`) + avisoLog + blocoStaff, avisoLog || avisa ? COR.aviso : COR.sucesso);
  }

  if (["equipe", "team", "staff"].includes(sub)) {
    if (!staff) return semPermissao();
    if (!server) return enviar("🎫", "⚠️", COR.aviso);
    const eq = await prepararEquipe({ ctx, server });
    const pendente = eq.erro || eq.faltam.length || (eq.cls.acima.length && !eq.equipe);
    return enviar(T("🎫 Staff nos tickets", "🎫 Staff in the tickets", "🎫 Staff en los tickets"), eq.linhas.join("\n"), pendente ? COR.aviso : COR.sucesso);
  }

  if (sub === "categorias" || sub === "categories") {
    const resto = args.slice(1).join(" ").trim();
    if (resto) {
      if (!staff) return semPermissao();
      const novas = resto.split("|").map((x) => x.trim()).filter(Boolean).map((x) => {
        const [emoji, ...nome] = x.split(/\s+/);
        return { emoji, nome: nome.join(" ").slice(0, 40) };
      }).filter((c) => c.emoji && c.nome);
      if (!novas.length || novas.length > 10) return erroDeUso(ctx, message.channel, "ticket", "De 1 a 10 assuntos: `🎫 Suporte | 🚨 Denúncia`.", "1 to 10 topics: `🎫 Support | 🚨 Report`.", "De 1 a 10 temas: `🎫 Soporte | 🚨 Denuncia`.");
      cfg.categorias = novas;
      salvarConfig();
    }
    return enviar(T("🎫 Assuntos do painel", "🎫 Panel topics", "🎫 Temas del panel"),
      cfg.categorias.map((c) => `${c.emoji} — ${c.nome}`).join("\n"), resto ? COR.sucesso : COR.info);
  }

  if (sub === "log") {
    if (!staff) return semPermissao();
    if (!args[1]) return erroDeUso(ctx, message.channel, "ticket", "Qual canal?", "Which channel?", "¿Qué canal?");
    const canalId = canalEscolhido(args[1])?.id;
    if (!canalId) return curto(T("❌ Esse canal não é deste servidor.", "❌ That channel isn't on this server.", "❌ Ese canal no es de este servidor."), COR.erro);
    cfg.logCanal = canalId;
    salvarConfig();
    return curto(`🎫 <#${canalId}>`, COR.sucesso);
  }

  if (sub === "lista" || sub === "list") {
    if (!staff) return semPermissao();
    const abertos = db.listarTickets(serverId);
    return enviar(T("🎫 Tickets abertos", "🎫 Open tickets", "🎫 Tickets abiertos"), abertos.length
      ? abertos.map((t) => `**#${t.numero}** <#${t.canalId}> — <@${t.autorId}>${t.categoria ? ` · ${t.categoria}` : ""}${t.motivo ? ` · _${t.motivo.slice(0, 60)}_` : ""}`).join("\n")
      : T("Nenhum.", "None.", "Ninguno."));
  }

  if (["abrir", "open", "novo"].includes(sub)) {
    if (!server) return enviar("🎫", "⚠️", COR.aviso);
    const r = await abrirTicket({ ctx: { ...ctx, client: ctx.client }, server, userId: message.authorId, motivo: args.slice(1).join(" ").trim().slice(0, 200) });
    if (r.jaTem) return enviar("🎫", T("Você já tem um ticket aberto: ", "You already have an open ticket: ", "Ya tienes un ticket abierto: ") + `<#${r.jaTem}>`, COR.aviso);
    if (r.cheio) return enviar("🎫", T(...avisoCheio(message.authorId)), COR.aviso);
    if (r.novo) return enviar("🎫", T(...avisoNovo(message.authorId)), COR.aviso);
    if (r.semLog) return curto(T("⚠️ A staff ainda não definiu o canal de log.", "⚠️ Staff hasn't set a log channel yet.", "⚠️ El staff todavía no definió el canal de log."), COR.aviso);
    if (r.erro) return curto(T("❌ Não consegui abrir o ticket: ", "❌ I couldn't open the ticket: ", "❌ No pude abrir el ticket: ") + r.erro
      + T(" — o bot precisa de **ManageChannel, ManageRole, AssignRoles, ManagePermissions**.", " — the bot needs **ManageChannel, ManageRole, AssignRoles, ManagePermissions**.", " — el bot necesita **ManageChannel, ManageRole, AssignRoles, ManagePermissions**."), COR.aviso);
    return enviar("🎫", T("Ticket aberto: ", "Ticket open: ", "Ticket abierto: ") + `<#${r.canal.id}>`, COR.sucesso);
  }

  if (["fechar", "close", "encerrar"].includes(sub)) {
    const ticket = db.ticketPorCanal(message.channelId);
    if (!ticket) return enviar("🎫", T("Este canal não é de um ticket aberto.", "This isn't an open ticket channel.", "Este canal no es de un ticket abierto."), COR.aviso);
    if (!staff) return semPermissao();
    await fecharTicket({ ctx, server, ticket, porId: message.authorId, nota: args.slice(1).join(" ").trim().slice(0, 200) });
    return;
  }

  if (["apagar", "delete", "excluir"].includes(sub)) {
    const ticket = db.ticketDoCanal(message.channelId);
    if (!ticket || ticket.status === "apagado") return enviar("🎫", T("Este canal não é de um ticket.", "This isn't a ticket channel.", "Este canal no es de un ticket."), COR.aviso);
    if (!staff) return semPermissao();
    if (ticket.status === "aberto") return enviar("🎫", T(`Feche antes (${E_FECHAR} ou \`${citarInterno("ticket.fechar", P)}\`) — é o fechar que guarda o registro.`, `Close it first (${E_FECHAR} or \`${citarInterno("ticket.fechar", P)}\`) — that's what saves the record.`, `Ciérralo antes (${E_FECHAR} o \`${citar("ticket.fechar", "es", P)}\`) — es el cierre lo que guarda el registro.`), COR.aviso);
    const r = await apagarTicket({ ctx, server, ticket });
    if (r.erro) return enviar("🎫", T("Não consegui apagar o canal: ", "I couldn't delete the channel: ", "No pude borrar el canal: ") + r.erro, COR.aviso);
    return;
  }

  return erroDeUso(ctx, message.channel, "ticket", "Subcomando desconhecido.", "Unknown subcommand.", "Subcomando desconocido.");
}

// ── Vigia das reações (2 out 2026) ───────────────────────────────────────────
// O 🔒 no ticket #8 não chegou ao bot: nenhuma linha de reação no log. O canal
// do ticket nasce no meio da sessão, e a sessão do bot no Stoat não recebeu os
// eventos dele (o painel, num canal que já existia, funcionou). Em vez de
// depender do evento, o bot confere de tempos em tempos, pela API, quem reagiu
// nas mensagens de controle (🔒) e de fechado (🗑️) — e trata como se fosse o
// evento. Quem não é staff tem a reação tirada, então nada é tratado duas vezes.
const VIGIA_MS = numero("TICKET_VIGIA_MS", 15_000, { min: 1000, inteiro: true });
const VIGIA_MAX_MS = 5 * 60_000;
// (31 out 2026, R11) Antes: uma consulta à API a cada 15 s por mensagem, de
// ticket aberto OU fechado, para sempre. Agora a vigia olha só o 🔒 dos tickets
// ABERTOS, e cada mensagem tem o seu recuo: sem reação nova, o intervalo dobra
// (15 s → 30 s → … → 5 min); com reação, volta a 15 s. Mensagem que a API diz
// não existir (404) ou que o bot não pode mais ver (403) é esquecida.
const emAndamento = new Set();
const recuo = new Map();   // msgId → { proxima, intervalo } (só das mensagens vigiadas)
export async function conferirReacoes({ client, criarContexto, api = chamarApi, agora = Date.now() }) {
  const regs = db.getDb().prepare(`SELECT tm.* FROM ticket_mensagens tm JOIN tickets t ON t.id = tm.ticketId
    WHERE tm.tipo = 'controle' AND t.status = 'aberto'`).all();
  const vigiadas = new Set(regs.map((r) => r.msgId));
  for (const id of recuo.keys()) if (!vigiadas.has(id)) recuo.delete(id);   // o Map nunca passa do que é vigiado
  for (const reg of regs) {
    if (emAndamento.has(reg.msgId)) continue;
    const st = recuo.get(reg.msgId) ?? { proxima: 0, intervalo: VIGIA_MS };
    if (agora < st.proxima) continue;
    const r = await api(`/channels/${reg.canalId}/messages/${reg.msgId}`);
    // (31 out 2026) só 404 (a mensagem sumiu) esquece o registro; 403 pode ser
    // passageiro (troca de cargo) e cai no recuo como qualquer outra falha
    if (r.status === 404) { db.esquecerMsgTicket(reg.msgId); recuo.delete(reg.msgId); continue; }
    const reacoes = r.json?.reactions ?? {};
    const quem = Object.entries(reacoes).filter(([e]) => mesmoEmoji(e, E_FECHAR)).flatMap(([, ids]) => ids ?? [])
      .filter((u) => u !== client?.user?.id);
    // sem ninguém (ou a API falhou): espera o dobro da última vez, até 5 min
    if (!quem.length) { recuo.set(reg.msgId, { proxima: agora + st.intervalo, intervalo: Math.min(st.intervalo * 2, VIGIA_MAX_MS) }); continue; }
    recuo.set(reg.msgId, { proxima: agora + VIGIA_MS, intervalo: VIGIA_MS });
    for (const userId of quem) {
      emAndamento.add(reg.msgId);
      try {
        console.log(`[TICKET] vigia: ${E_FECHAR} de ${userId} na mensagem ${reg.msgId}`);
        await aoReagir({ id: reg.msgId }, userId, E_FECHAR, { client, criarContexto });
      } catch (e) { registrarErro("TICKET", e); }
      finally { emAndamento.delete(reg.msgId); }
      if (!db.msgTicket(reg.msgId)) break;   // fechou: essa mensagem não vale mais
    }
  }
}
export function iniciarVigia(client, criarContexto) {
  const t = setInterval(() => conferirReacoes({ client, criarContexto }).catch((e) => registrarErro("TICKET", e)), VIGIA_MS);
  t.unref?.();
  return t;
}
