// servidor-info.js — a Judy conhece o servidor em que está (12 out 2026).
//
// Pedido de Ghieh: poder perguntar à Judy "quem são os staffs?", "quais são as
// regras?" e afins, e um comando direto para isso. Antes ela não sabia nada do
// servidor além do nome — e, com a busca de fundo, "como está o servidor?" foi
// parar no buscador e voltou notícia de servidor PÚBLICO.
//
// De onde vem cada coisa (decisões de Ghieh):
//   • regras — o texto que a staff definir (`&servidor regras definir`) vence;
//     sem ele, o canal apontado (`&servidor regras canal #x`) ou, sozinho, o
//     canal chamado regras/rules, lido do Stoat (as mensagens, em ordem);
//   • equipe — o dono do servidor + os cargos do `&acesso`/`&staff` + o cargo
//     de equipe dos tickets + os cargos com permissão de moderar (banir,
//     expulsar, silenciar, apagar mensagens, gerenciar o servidor ou as
//     permissões), com quem tem cada um (bots fora);
//   • dados gerais, cargos com contagem, canais com descrição e o FAQ/avisos
//     que a staff cadastrar.
// O mesmo levantamento serve ao comando (`&servidor …`) e à IA (vira material
// real no prompt quando a pergunta é sobre o servidor).

import { Permission } from "stoat.js";
import { listarMembros, contarMembros } from "../core/membros.js";
import { resolverCanal, ehBot } from "../core/ids.js";
import { canalDoServidor } from "../moderacao/pertence.js";
import { tr, lingua } from "../core/i18n.js";

const CACHE_REGRAS_MS = 10 * 60_000;
const MAX_REGRAS = 3500;
const MAX_FAQ = 25;
const cacheRegras = new Map();   // canalId → { quando, texto }

export function _zerarCache() { cacheRegras.clear(); }

// ─── Leitura ─────────────────────────────────────────────────────────────────

function cfgInfo(config) {
  config.servidorInfo ??= {};
  config.servidorInfo.faq ??= [];
  return config.servidorInfo;
}

function rolesDe(server) {
  const r = server?.roles;
  if (!r) return new Map();
  if (typeof r.entries === "function") return new Map([...r.entries()]);
  return new Map(Object.entries(r));
}

function canaisDe(server) {
  try { return (server?.channels ?? []).filter((c) => c && typeof c === "object"); } catch { return []; }
}

const PERMS_MODERAR = ["BanMembers", "KickMembers", "TimeoutMembers", "ManageMessages", "ManageServer", "ManagePermissions"];
export function cargoModera(role) {
  let a;
  try { a = BigInt(role?.permissions?.a ?? role?.permissions ?? 0); } catch { return false; }
  return PERMS_MODERAR.some((p) => Permission[p] && (a & Permission[p]) === Permission[p]);
}

const uidDe = (m) => m?.id?.user ?? m?._id?.user ?? m?.userId ?? m?.user?.id ?? (typeof m?.id === "string" ? m.id : null);
const cargosDoMembro = (m) => (m?.roles ?? []).map((r) => r?.id ?? r);

function nomeDe(uid, { membro = null, client = null } = {}) {
  const u = client?.users?.get?.(uid) ?? membro?.user ?? null;
  return membro?.nickname || u?.displayName || u?.display_name || u?.username || `usuário ${String(uid).slice(-6)}`;
}
function botAqui(uid, { membro = null, client = null } = {}) {
  return ehBot(client?.users?.get?.(uid) ?? membro?.user ?? null) || ehBot(membro);
}

// Data de criação a partir do ULID (os 10 primeiros caracteres são o tempo).
export function dataDoUlid(id) {
  const ALFA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const s = String(id ?? "").toUpperCase().slice(0, 10);
  if (s.length < 10) return null;
  let t = 0;
  for (const ch of s) { const v = ALFA.indexOf(ch); if (v < 0) return null; t = t * 32 + v; }
  return new Date(t);
}
const dataBR = (d) => (d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : null);

export async function dadosGerais(server, { client = null } = {}) {
  const membros = await contarMembros(server).catch(() => null);
  const canais = canaisDe(server);
  return {
    nome: server?.name ?? "?",
    descricao: String(server?.description ?? "").trim(),
    donoId: server?.ownerId ?? null,
    dono: server?.ownerId ? nomeDe(server.ownerId, { client }) : null,
    criado: dataBR(server?.createdAt instanceof Date ? server.createdAt : dataDoUlid(server?.id ?? server?._id)),
    membros,
    nCanais: canais.length,
    nCargos: rolesDe(server).size,
  };
}

// Equipe: dono + cargos marcados + equipe dos tickets + cargos que moderam.
export async function equipe(server, config, { client = null } = {}) {
  const membros = await listarMembros(server).catch(() => null);
  const roles = rolesDe(server);
  const titulos = config?.staff?.titulos ?? {};
  const blocos = [];
  const vistos = new Set();
  const add = (roleId, origem) => {
    if (!roleId || vistos.has(roleId)) return;
    vistos.add(roleId);
    const role = roles.get(roleId);
    const pessoas = membros
      ? membros.filter((m) => cargosDoMembro(m).includes(roleId))
        .map((m) => ({ id: uidDe(m), membro: m }))
        .filter((p) => p.id && !botAqui(p.id, { membro: p.membro, client }))
        .map((p) => ({ id: p.id, nome: nomeDe(p.id, { membro: p.membro, client }) }))
      : null;
    // cargo automático (só pela permissão) sem nenhuma pessoa: é cargo de bot
    if (origem === "permissao" && pessoas && !pessoas.length) return;
    blocos.push({ roleId, nome: titulos[roleId] ?? role?.name ?? roleId, origem, rank: role?.rank ?? 9999, pessoas });
  };
  for (const id of config?.acesso?.cargosStaff ?? []) add(id, "acesso");
  if (config?.tickets?.cargoEquipe) add(config.tickets.cargoEquipe, "tickets");
  const automaticos = [...roles.entries()].filter(([, r]) => cargoModera(r)).sort((a, b) => (a[1]?.rank ?? 9999) - (b[1]?.rank ?? 9999));
  for (const [id] of automaticos) add(id, "permissao");
  return {
    donoId: server?.ownerId ?? null,
    dono: server?.ownerId ? nomeDe(server.ownerId, { client, membro: membros?.find((m) => uidDe(m) === server.ownerId) }) : null,
    blocos,
    membrosLidos: !!membros,
  };
}

export async function cargosComContagem(server) {
  const membros = await listarMembros(server).catch(() => null);
  return [...rolesDe(server).entries()]
    .map(([id, r]) => ({ id, nome: r?.name ?? id, rank: r?.rank ?? 9999, n: membros ? membros.filter((m) => cargosDoMembro(m).includes(id)).length : null }))
    .sort((a, b) => a.rank - b.rank);
}

// Canais em ordem, agrupados por categoria (como o Stoat mostra).
export function canaisOrganizados(server) {
  const canais = canaisDe(server);
  const porId = new Map(canais.map((c) => [c.id ?? c._id, c]));
  const usados = new Set();
  const grupos = [];
  for (const cat of server?.categories ?? []) {
    const lista = (cat?.channels ?? []).map((id) => porId.get(id)).filter(Boolean);
    lista.forEach((c) => usados.add(c.id ?? c._id));
    if (lista.length) grupos.push({ titulo: cat.title ?? "", canais: lista });
  }
  const soltos = canais.filter((c) => !usados.has(c.id ?? c._id));
  if (soltos.length) grupos.unshift({ titulo: "", canais: soltos });
  return grupos.map((g) => ({
    titulo: g.titulo,
    canais: g.canais.map((c) => ({ id: c.id ?? c._id, nome: c.name ?? "?", descricao: String(c.description ?? "").trim(), voz: /voice/i.test(c.type ?? c.channel_type ?? "") })),
  }));
}

const RE_CANAL_REGRAS = /regra|rule|norma|diretriz|guideline|conduta/i;
export function canalDeRegras(server, config) {
  const fixo = config?.servidorInfo?.regrasCanal;
  const canais = canaisDe(server);
  // canal fixado só vale se for DESTE servidor (senão um ID de fora leria outro servidor)
  if (fixo && canalDoServidor(server, fixo)) return canais.find((c) => (c.id ?? c._id) === fixo) ?? { id: fixo };
  const candidatos = canais.filter((c) => RE_CANAL_REGRAS.test(c?.name ?? "") && !/voice/i.test(c?.type ?? ""));
  return candidatos.find((c) => /^(📜|📌|❗|⚠️|\W)*\s*(regras|rules)\s*$/i.test(c.name ?? "")) ?? candidatos[0] ?? null;
}

function textoDaMensagem(m) {
  const partes = [String(m?.content ?? "").trim()];
  for (const e of m?.embeds ?? []) partes.push([e?.title, e?.description].filter(Boolean).join("\n"));
  return partes.filter(Boolean).join("\n").trim();
}

async function lerCanal(canal, { forcar = false } = {}) {
  const id = canal?.id ?? canal?._id;
  const c = cacheRegras.get(id);
  if (!forcar && c && Date.now() - c.quando < CACHE_REGRAS_MS) return c.texto;
  if (typeof canal?.fetchMessages !== "function") return null;
  const msgs = await canal.fetchMessages({ limit: 25 });
  const ordem = [...(msgs ?? [])].sort((a, b) => String(a?.id ?? a?._id).localeCompare(String(b?.id ?? b?._id)));   // ULID = ordem de envio
  const texto = ordem.map(textoDaMensagem).filter(Boolean).join("\n\n").slice(0, MAX_REGRAS).trim();
  cacheRegras.set(id, { quando: Date.now(), texto });
  return texto;
}

// → { fonte: "texto"|"canal", texto, canal? } ou { fonte: null, motivo }
export async function regras(server, config, { forcar = false } = {}) {
  const info = config?.servidorInfo ?? {};
  if (info.regrasTexto?.trim()) return { fonte: "texto", texto: info.regrasTexto.trim() };
  const canal = canalDeRegras(server, config);
  if (!canal) return { fonte: null, motivo: "sem-canal" };
  try {
    const texto = await lerCanal(canal, { forcar });
    if (!texto) return { fonte: null, motivo: "canal-vazio", canal: { id: canal.id ?? canal._id, nome: canal.name } };
    return { fonte: "canal", texto, canal: { id: canal.id ?? canal._id, nome: canal.name } };
  } catch (e) {
    return { fonte: null, motivo: "sem-acesso", canal: { id: canal.id ?? canal._id, nome: canal.name }, erro: e?.message ?? String(e) };
  }
}

// ─── Para a IA ───────────────────────────────────────────────────────────────

const I = "(?<![\\p{L}\\p{N}])", F = "(?![\\p{L}\\p{N}])";
const re = (s) => new RegExp(`${I}(?:${s})${F}`, "iu");
const SECOES = {
  regras: re("regras?|rules?|regulamento|é proibido|e proibido|é permitido|pode(?:mos)? (?:postar|mandar|falar|divulgar|xingar)|proibido|norma"),
  // "dono"/"dona" sozinho não: "quem é seu dono?" é sobre o criador da Judy; e
  // "mods" sozinho é mod de jogo
  equipe: re("staffs?|equipe|moderador(?:es|as?)?|moderação|adms?|admins?|administrador(?:es|as?)?|(?:dono|dona|owner) d[oa] (?:servidor|server|grupo|comunidade)|server owner|dono daqui|quem manda|quem cuida|quem modera"),
  cargos: re("cargos?|roles?|tags?"),
  canais: re("canais|canal|channels?|onde (?:posso|eu posso|devo|fica|ficam|é que)|em que canal"),
  geral: re("servidor|server|comunidade|quantos membros|quantas pessoas|quando (?:foi )?criad[oa]|sobre (?:o|este|esse) (?:servidor|server|grupo)"),
  faq: re("faq|avisos?|eventos?|links?|perguntas? frequentes?"),
};
// "regras do xadrez" não é sobre o servidor
const REGRAS_DE_OUTRA_COISA = new RegExp(`${I}regras?\\s+d[eoa]s?\\s+(?!servidor|server|grupo|chat|canal|comunidade|aqui)\\p{L}`, "iu");

export function secoesDaPergunta(texto) {
  const t = String(texto ?? "");
  const s = new Set();
  for (const [k, r] of Object.entries(SECOES)) if (r.test(t)) s.add(k);
  if (s.has("regras") && REGRAS_DE_OUTRA_COISA.test(t)) s.delete("regras");
  // "cargo" e "canal" sozinhos aparecem em conversa sobre outra coisa: só
  // contam com cara de pergunta
  if (!/\?|\b(quais|qual|quem|quantos?|onde|lista|me (?:fala|diz|mostra))\b/i.test(t)) { s.delete("cargos"); s.delete("canais"); s.delete("faq"); }
  return s;
}

const FONTE_REGRAS = { texto: "texto definido pela staff", canal: "canal" };

export async function materialParaIA(pergunta, { server, config, client = null, lang = "pt" } = {}) {
  if (!server) return "";
  const secoes = secoesDaPergunta(pergunta);
  if (!secoes.size) return "";
  const en = lang === "en";
  const partes = [];
  const g = await dadosGerais(server, { client });
  partes.push(`• ${en ? "General" : "Geral"}: ${en ? "owner" : "dono"} ${g.dono ?? "?"}${g.criado ? `; ${en ? "created" : "criado em"} ${g.criado}` : ""}${g.membros != null ? `; ${g.membros} ${en ? "members" : "membros"}` : ""}; ${g.nCanais} ${en ? "channels" : "canais"}, ${g.nCargos} ${en ? "roles" : "cargos"}${g.descricao ? `; ${en ? "description" : "descrição"}: "${g.descricao.slice(0, 400)}"` : ""}.`);

  if (secoes.has("equipe")) {
    const e = await equipe(server, config, { client });
    const linhas = e.blocos.map((b) => `${b.nome}${b.origem === "permissao" ? (en ? " (can moderate)" : " (pode moderar)") : ""}: ${b.pessoas ? (b.pessoas.length ? b.pessoas.slice(0, 15).map((p) => p.nome).join(", ") + (b.pessoas.length > 15 ? ` +${b.pessoas.length - 15}` : "") : (en ? "nobody" : "ninguém")) : (en ? "(member list unavailable)" : "(lista de membros indisponível)")}`);
    partes.push(`• ${en ? "Staff" : "Equipe"}: ${en ? "owner" : "dono"}: ${e.dono ?? "?"}${linhas.length ? `. ${linhas.join(". ")}` : en ? ". No staff role marked or found." : ". Nenhum cargo de staff marcado ou encontrado."}`);
  }
  if (secoes.has("regras")) {
    const r = await regras(server, config);
    partes.push(r.fonte
      ? `• ${en ? "Rules" : "Regras"} (${r.fonte === "canal" ? `${en ? "from channel" : "do canal"} #${r.canal?.nome ?? "?"}` : FONTE_REGRAS.texto}):\n${r.texto.slice(0, 1800)}`
      : `• ${en ? "Rules" : "Regras"}: ${en ? "none registered and no rules channel I can read" : "nenhuma cadastrada e nenhum canal de regras que eu consiga ler"}${r.canal ? ` (#${r.canal.nome})` : ""}.`);
  }
  if (secoes.has("cargos")) {
    const cs = await cargosComContagem(server);
    partes.push(`• ${en ? "Roles (highest first)" : "Cargos (do mais alto ao mais baixo)"}: ${cs.slice(0, 30).map((c) => `${c.nome}${c.n != null ? ` (${c.n})` : ""}`).join(", ") || "—"}`);
  }
  if (secoes.has("canais")) {
    const gs = canaisOrganizados(server);
    partes.push(`• ${en ? "Channels" : "Canais"}:\n${gs.map((gr) => `${gr.titulo ? `[${gr.titulo}] ` : ""}${gr.canais.map((c) => `#${c.nome}${c.voz ? (en ? " (voice)" : " (voz)") : ""}${c.descricao ? ` — ${c.descricao.slice(0, 120)}` : ""}`).join("; ")}`).join("\n").slice(0, 1500)}`);
  }
  const faq = config?.servidorInfo?.faq ?? [];
  if (faq.length && (secoes.has("faq") || secoes.has("geral") || secoes.has("regras"))) {
    partes.push(`• ${en ? "Staff notices / FAQ" : "Avisos / FAQ da staff"}:\n${faq.slice(0, 10).map((f) => `- ${f.titulo}: ${String(f.texto).slice(0, 300)}`).join("\n")}`);
  }
  return (en
    ? `REAL DATA about the server "${g.nome}" where you are (read now from Stoat and from what the staff set up — use ONLY this to talk about the server; what isn't here, you don't know: say so and point to \`&servidor\`):\n`
    : `DADOS REAIS do servidor "${g.nome}" onde você está (lidos agora do Stoat e do que a staff cadastrou — use SÓ isto para falar do servidor; o que não estiver aqui você não sabe: diga isso e indique \`&servidor\`):\n`)
    + partes.join("\n");
}

// ─── Comando ─────────────────────────────────────────────────────────────────

const SUB_EN = { rules: "regras", roles: "cargos", channels: "canais", about: "info", general: "info", notices: "faq", staff: "equipe", team: "equipe" };
export const SUBCOMANDOS = new Set(["info", "regras", "cargos", "canais", "faq"]);
// "&regras" → "você quis dizer &servidor regras?"
export function subcomandoDe(cmd) {
  const c = String(cmd ?? "").toLowerCase();
  const s = SUB_EN[c] ?? c;
  return SUBCOMANDOS.has(s) && s !== "info" ? s : null;
}

// Texto livre depois de "<sub> <ação>", com quebras de linha preservadas.
function restoDoTexto(message, ...palavras) {
  const conteudo = String(message?.content ?? "");
  const m = conteudo.match(new RegExp(`${palavras.map((p) => `(?:${p})`).join("\\s+")}\\s+([\\s\\S]+)$`, "iu"));
  return m ? m[1].trim() : "";
}

export async function cmdServidor(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P = "&", config, salvarConfig, getServer, membroTemPermissao } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  const T = (pt, eng) => (en ? eng : pt);
  const server = await getServer(message).catch(() => null);
  if (!server) return sendEmbed(message.channel, { title: "🏠", description: T("Este comando só funciona dentro de um servidor.", "This command only works inside a server."), colour: COR.aviso });
  const client = [ctx.client, message.client].find((c) => typeof c?.users?.get === "function") ?? null;
  const info = cfgInfo(config);
  const sub0 = String(args[0] ?? "").toLowerCase();
  const sub = SUB_EN[sub0] ?? sub0;
  const acao = String(args[1] ?? "").toLowerCase();
  const podeGerir = () => !membroTemPermissao || membroTemPermissao(message, server, "ManagePermissions");
  const negar = () => sendEmbed(message.channel, { title: "🚫", description: T("Para mudar isto precisa de **ManagePermissions**.", "Changing this needs **ManagePermissions**."), colour: COR.erro });

  // ── &servidor / &servidor info ──
  if (!sub || sub === "info") {
    const g = await dadosGerais(server, { client });
    const linhas = [
      g.descricao ? `> ${g.descricao.slice(0, 500).replace(/\n/g, "\n> ")}\n` : null,
      `👑 ${T("Dono", "Owner")}: ${g.donoId ? `<@${g.donoId}>` : "?"}`,
      g.criado ? `📅 ${T("Criado em", "Created")} ${g.criado}` : null,
      g.membros != null ? `👥 ${g.membros} ${T("membros", "members")}` : null,
      `💬 ${g.nCanais} ${T("canais", "channels")} · 🏷️ ${g.nCargos} ${T("cargos", "roles")}`,
      "",
      `\`${P}servidor regras\` — ${T("as regras", "the rules")}`,
      `\`${P}staff\` — ${T("quem é a equipe", "who the staff are")}`,
      `\`${P}servidor cargos\` · \`${P}servidor canais\` — ${T("cargos e canais", "roles and channels")}`,
      `\`${P}servidor faq\` — ${T("avisos e perguntas frequentes", "notices and FAQ")}`,
      "",
      T("_Também dá para perguntar à Judy: \"quais são as regras?\", \"quem é da staff?\"._", "_You can also just ask Judy: \"what are the rules?\", \"who's on staff?\"._"),
    ].filter((x) => x !== null);
    return sendEmbed(message.channel, { title: `🏠 ${g.nome}`, description: linhas.join("\n"), colour: COR.info });
  }

  // ── a equipe mora no &staff (uma porta só) ──
  if (sub === "equipe") {
    return sendEmbed(message.channel, { title: "👥", description: T(`A equipe fica em \`${P}staff\`.`, `The staff list lives in \`${P}staff\`.`), colour: COR.info });
  }

  // ── &servidor regras [definir <texto> | canal <#canal|auto> | limpar] ──
  if (sub === "regras") {
    if (["definir", "set", "texto", "text"].includes(acao)) {
      if (!podeGerir()) return negar();
      const texto = restoDoTexto(message, "regras|rules", "definir|set|texto|text").slice(0, MAX_REGRAS);
      if (!texto) return sendEmbed(message.channel, { title: "📜", description: T(`Uso: \`${P}servidor regras definir <texto>\` (pode ter várias linhas).`, `Usage: \`${P}servidor rules set <text>\` (multiple lines are fine).`), colour: COR.aviso });
      info.regrasTexto = texto;
      salvarConfig?.();
      return sendEmbed(message.channel, { title: T("📜 Regras salvas", "📜 Rules saved"), description: T(`Agora \`${P}servidor regras\` e a Judy usam este texto (ele vence o canal de regras).`, `\`${P}servidor rules\` and Judy now use this text (it beats the rules channel).`), colour: COR.sucesso });
    }
    if (["canal", "channel"].includes(acao)) {
      if (!podeGerir()) return negar();
      const alvo = String(args[2] ?? "").toLowerCase();
      if (["auto", "automatico", "automático", "off"].includes(alvo)) {
        delete info.regrasCanal; salvarConfig?.(); _zerarCache();
        const achado = canalDeRegras(server, config);
        return sendEmbed(message.channel, { title: "📜", description: T(`Canal de regras automático${achado ? `: <#${achado.id ?? achado._id}>` : " — nenhum canal chamado regras/rules por aqui"}.`, `Automatic rules channel${achado ? `: <#${achado.id ?? achado._id}>` : " — no channel named rules here"}.`), colour: COR.info });
      }
      const id = resolverCanal(args[2], { message, server });
      if (!id || !canalDoServidor(server, id)) return sendEmbed(message.channel, { title: "📜", description: T(`Não achei esse canal **neste servidor**. Uso: \`${P}servidor regras canal #canal\` (ou \`auto\`).`, `I couldn't find that channel **on this server**. Usage: \`${P}servidor rules channel #channel\` (or \`auto\`).`), colour: COR.aviso });
      info.regrasCanal = id; salvarConfig?.(); _zerarCache();
      return sendEmbed(message.channel, { title: "📜", description: T(`Regras lidas de <#${id}> (quando não houver texto definido).`, `Rules read from <#${id}> (when there's no text set).`), colour: COR.sucesso });
    }
    if (["limpar", "clear", "apagar"].includes(acao)) {
      if (!podeGerir()) return negar();
      delete info.regrasTexto; salvarConfig?.();
      return sendEmbed(message.channel, { title: "📜", description: T("Texto das regras apagado — volto a ler o canal de regras.", "Rules text cleared — back to reading the rules channel."), colour: COR.info });
    }
    const r = await regras(server, config, { forcar: true });
    if (!r.fonte) {
      const porque = r.motivo === "sem-acesso" ? T(`não consigo ler <#${r.canal.id}> (falta **ViewChannel**/**ReadMessageHistory** para a Judy)`, `I can't read <#${r.canal.id}> (Judy needs **ViewChannel**/**ReadMessageHistory**)`)
        : r.motivo === "canal-vazio" ? T(`<#${r.canal.id}> está vazio`, `<#${r.canal.id}> is empty`)
        : T("nenhum canal chamado regras/rules", "no channel named rules");
      return sendEmbed(message.channel, { title: T("📜 Regras", "📜 Rules"), description: `${T("Ainda não há regras para mostrar", "There are no rules to show yet")}: ${porque}.\n\n${T(`A staff pode definir com \`${P}servidor regras definir <texto>\` ou apontar o canal com \`${P}servidor regras canal #canal\`.`, `Staff can set them with \`${P}servidor rules set <text>\` or point to the channel with \`${P}servidor rules channel #channel\`.`)}`, colour: COR.aviso });
    }
    return sendEmbed(message.channel, { title: T("📜 Regras", "📜 Rules"), description: `${r.texto}\n\n_${r.fonte === "canal" ? T(`Lidas de <#${r.canal.id}>.`, `Read from <#${r.canal.id}>.`) : T("Definidas pela staff.", "Set by the staff.")}_`, colour: COR.info });
  }

  // ── &servidor cargos ──
  if (sub === "cargos") {
    const cs = await cargosComContagem(server);
    const linhas = cs.map((c) => `<%${c.id}>${c.n != null ? ` — ${c.n}` : ""}`);
    return sendEmbed(message.channel, { title: T("🏷️ Cargos", "🏷️ Roles"), description: linhas.join("\n") || T("Nenhum cargo.", "No roles."), colour: COR.info });
  }

  // ── &servidor canais ──
  if (sub === "canais") {
    const gs = canaisOrganizados(server);
    const linhas = gs.flatMap((g) => [g.titulo ? `**${g.titulo}**` : null, ...g.canais.map((c) => `${c.voz ? "🔊" : "#"} <#${c.id}>${c.descricao ? ` — ${c.descricao.slice(0, 120)}` : ""}`), ""]).filter((x) => x !== null);
    return sendEmbed(message.channel, { title: T("💬 Canais", "💬 Channels"), description: linhas.join("\n").trim() || T("Nenhum canal.", "No channels."), colour: COR.info });
  }

  // ── &servidor faq [add <título> | <texto> · remover <n|título> · limpar · <n|título>] ──
  if (sub === "faq") {
    if (["add", "adicionar", "novo"].includes(acao)) {
      if (!podeGerir()) return negar();
      const resto = restoDoTexto(message, "faq|notices", "add|adicionar|novo");
      const [titulo, ...txt] = resto.split("|");
      if (!titulo?.trim() || !txt.join("|").trim()) return sendEmbed(message.channel, { title: "📌", description: T(`Uso: \`${P}servidor faq add <título> | <texto>\``, `Usage: \`${P}servidor faq add <title> | <text>\``), colour: COR.aviso });
      if (info.faq.length >= MAX_FAQ) return sendEmbed(message.channel, { title: "📌", description: T(`O FAQ já tem ${MAX_FAQ} itens — o máximo. Remova um antes.`, `The FAQ already has ${MAX_FAQ} items — the maximum. Remove one first.`), colour: COR.aviso });
      info.faq.push({ titulo: titulo.trim().slice(0, 80), texto: txt.join("|").trim().slice(0, 1500) });
      salvarConfig?.();
      return sendEmbed(message.channel, { title: T("📌 Adicionado ao FAQ", "📌 Added to the FAQ"), description: `**${info.faq.length}. ${info.faq.at(-1).titulo}**`, colour: COR.sucesso });
    }
    const acharItem = (q) => {
      const n = Number(q);
      if (Number.isInteger(n) && n >= 1 && n <= info.faq.length) return n - 1;
      const t = String(q ?? "").toLowerCase();
      return t ? info.faq.findIndex((f) => f.titulo.toLowerCase().includes(t)) : -1;
    };
    if (["remover", "remove", "apagar", "del"].includes(acao)) {
      if (!podeGerir()) return negar();
      const i = acharItem(args.slice(2).join(" "));
      if (i < 0) return sendEmbed(message.channel, { title: "📌", description: T(`Não achei esse item. Veja os números em \`${P}servidor faq\`.`, `I couldn't find that item. See the numbers in \`${P}servidor faq\`.`), colour: COR.aviso });
      const [fora] = info.faq.splice(i, 1); salvarConfig?.();
      return sendEmbed(message.channel, { title: "📌", description: T(`Removido: **${fora.titulo}**`, `Removed: **${fora.titulo}**`), colour: COR.info });
    }
    if (["limpar", "clear"].includes(acao)) {
      if (!podeGerir()) return negar();
      info.faq = []; salvarConfig?.();
      return sendEmbed(message.channel, { title: "📌", description: T("FAQ esvaziado.", "FAQ cleared."), colour: COR.info });
    }
    if (acao) {
      const i = acharItem(args.slice(1).join(" "));
      if (i >= 0) return sendEmbed(message.channel, { title: `📌 ${info.faq[i].titulo}`, description: info.faq[i].texto, colour: COR.info });
    }
    if (!info.faq.length) return sendEmbed(message.channel, { title: "📌 FAQ", description: T(`Nada cadastrado ainda. A staff adiciona com \`${P}servidor faq add <título> | <texto>\`.`, `Nothing yet. Staff add items with \`${P}servidor faq add <title> | <text>\`.`), colour: COR.info });
    return sendEmbed(message.channel, { title: "📌 FAQ", description: info.faq.map((f, i) => `**${i + 1}. ${f.titulo}**\n${f.texto.slice(0, 300)}${f.texto.length > 300 ? "…" : ""}`).join("\n\n") + `\n\n_${T(`Um item inteiro: \`${P}servidor faq <número>\``, `A full item: \`${P}servidor faq <number>\``)}_`, colour: COR.info });
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "🏠 Servidor", description: `Opções: \`regras\`, \`cargos\`, \`canais\`, \`faq\` — ex.: \`${P}servidor regras\`. A equipe fica em \`${P}staff\`.`, colour: COR.aviso },
    { title: "🏠 Server", description: `Options: \`regras\`, \`cargos\`, \`canais\`, \`faq\` — e.g. \`${P}servidor regras\`. The staff list lives in \`${P}staff\`.`, colour: COR.aviso }));
}
