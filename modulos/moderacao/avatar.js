// avatar.js — a foto de perfil de quem entra (ou troca) vista pelo modelo de
// visão (13 out 2026).
//
// Pedido de Ghieh: contas entrando com foto de genitália no ícone. A foto é
// analisada AO ENTRAR e AO TROCAR (a do perfil, que vale em todo servidor, e a
// de servidor), pelo mesmo caminho das imagens do sentinela: o ia-servico
// descreve (/moderar-imagem, sessão nova por imagem) e o bot decide.
//
// Decisão mais rígida que a das imagens do chat (que só avisam): aqui há ação
// automática, então "torso nu na praia" não basta. Apita com:
//   • genitália, ato sexual ou pornografia DESCRITOS (sozinhos bastam);
//   • nudez, gore ou símbolo de ódio COM o voto de risco do modelo.
//
// A ação é por servidor (`&automod sentinela avatar acao …`): `alertar`,
// `silenciar` (padrão: timeout nativo + alerta), `expulsar` ou `banir`. A staff
// é sempre avisada — e o alerta nunca republica a foto.

import * as log from "../core/log.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import { textoDoIdioma, idiomaDe } from "../core/i18n.js";
import * as db from "../core/db.js";
import { banir } from "../core/banir.js";
import { lerDuracao, duracaoTexto } from "../core/duracao.js";
import { aplicarTimeout, CONFIRMAR_MS, MAX_TIMEOUT_MS } from "./timeout.js";
import { pontuarDescricao } from "./imagem.js";
import { descreverErro, tipoDoErro } from "../core/erros.js";

export const ACOES_AVATAR = ["alertar", "silenciar", "expulsar", "banir"];
const ACAO_EN = { alert: "alertar", silence: "silenciar", mute: "silenciar", timeout: "silenciar", kick: "expulsar", ban: "banir" };
export const acaoAvatarValida = (x) => {
  const a = String(x ?? "").toLowerCase();
  const v = ACAO_EN[a] ?? a;
  return ACOES_AVATAR.includes(v) ? v : null;
};
export const acaoDoAvatar = (cfg) => acaoAvatarValida(cfg?.acao) ?? "silenciar";
export const tempoDoAvatar = (cfg) => Math.min(MAX_TIMEOUT_MS, lerDuracao(cfg?.tempo) ?? CONFIRMAR_MS());

const iaUrl = () => (process.env.IA_SERVICO_URL || "").replace(/\/$/, "");
const CDN = () => (process.env.CDN_URL || "https://cdn.stoatusercontent.com").replace(/\/$/, "");

// Ligado: nasce ligado nos servidores que já existiam (como as imagens);
// servidor novo nasce com o automod inteiro desligado.
export function ligado(config) {
  return config?.automod?.antiAvatar?.enabled !== false && !!iaUrl();
}

// File da stoat.js (`id`, `tag`) ou o objeto cru da API (`_id`, `tag`).
export function arquivoDe(avatar) {
  const id = avatar?.id ?? avatar?._id ?? null;
  if (!id) return null;
  return { id, url: `${CDN()}/${avatar?.tag || "avatars"}/${id}` };
}

const EXPLICITO = /(?<![\p{L}\p{N}])(genit\p{L}*|p[eê]nis|vaginas?|vulvas?|[aâ]nus|test[ií]culos?|escroto|ere[cç][aã]o|pornogr\p{L}*|ato sexual|sexo (oral|expl[ií]cito)|masturba\p{L}*|penetra[cç][aã]o|genitals?|penis|testicles?|erect penis|porn\p{L}*|sexual act|oral sex|masturbat\p{L}*|intercourse)(?![\p{L}\p{N}])/iu;

// Só o que a descrição AFIRMA (13 out 2026). O modelo, mesmo instruído a não
// fazer isso, escreve o que NÃO há: "Dois homens de terno… Não há armas nem
// símbolos de ódio; o ato sexual ou nudez não são explícitos na imagem" — e o
// "ato sexual" antes do "não" silenciou uma foto inocente. Agora a descrição é
// partida em orações e TODA oração com negação sai, em qualquer posição.
// ("no" fica de fora: em português é "em + o".)
const NEGA = /(?<![\p{L}\p{N}])(n[ãa]o|sem|nenhum[a]?|nem|nunca|jamais|not|without|none|nor|never|isn'?t|aren'?t|doesn'?t|don'?t)(?![\p{L}\p{N}])/iu;
export function afirmado(descricao) {
  return String(descricao ?? "")
    .replace(/\bsem\s+roupas?\b/gi, "nua").replace(/\bwithout\s+clothes\b/gi, "naked")
    .split(/[.;!?\n,]|\s+(?:mas|porém|but)\s+/i)   // ":" não: "Genitália: não" é uma oração só
    .map((c) => c.trim()).filter((c) => c && !NEGA.test(c)).join(". ");
}

// Decide sobre a foto. Para AGIR (silenciar, expulsar, banir) é preciso o voto
// de risco do modelo junto com o que a descrição afirma; termo explícito sem o
// voto vira só `suspeita` — a staff é avisada, ninguém é punido.
export function avaliarAvatar(descricao, { riscoModelo = false } = {}) {
  const ali = afirmado(descricao);
  const r = pontuarDescricao(ali, { riscoModelo });
  const explicito = EXPLICITO.test(ali);
  const motivos = [];
  if (explicito && riscoModelo) motivos.push("sexual explícito");
  else if (r.grave) motivos.push("menor + sexual");
  else if (riscoModelo) {
    for (const c of ["sexual", "gore", "odio"]) if (r.categorias.includes(c)) motivos.push(c === "sexual" ? "nudez" : c === "odio" ? "ódio" : c);
  }
  const apitou = motivos.length > 0;
  const suspeita = !apitou && explicito;
  return { apitou, suspeita, motivos: suspeita ? ["possível conteúdo sexual (o modelo não confirmou o risco)"] : motivos, grave: r.grave };
}

// ── Análise (uma por vez; a mesma foto, uma vez só) ─────────────────────────
// Num raid entram muitas contas juntas, e a mesma foto vale em vários
// servidores: o resultado fica guardado por foto por 6 h.
let analisar = async (url) => {
  const chave = process.env.IA_SERVICO_CHAVE || "";
  const resp = await fetch(`${iaUrl()}/moderar-imagem`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(chave ? { "x-chave": chave } : {}) },
    body: JSON.stringify({ url }), signal: AbortSignal.timeout(120_000),
  });
  return resp.json().catch(() => ({}));
};
export function _trocarAnalise(fn) { const antes = analisar; analisar = fn; return antes; }

const CACHE_MS = 6 * 3600_000, FILA_MAX = 30;
const resultados = new Map();   // id da foto → { t, promessa }
let fila = Promise.resolve(), naFila = 0;

export function analisarFoto(arquivo, agora = Date.now()) {
  for (const [k, v] of resultados) if (agora - v.t > CACHE_MS) resultados.delete(k);
  const guardado = resultados.get(arquivo.id);
  if (guardado) return guardado.promessa;
  if (naFila >= FILA_MAX) { console.warn(`[AVATAR] fila cheia (${FILA_MAX}) — foto ${arquivo.id} não analisada`); return Promise.resolve(null); }
  naFila++;
  const promessa = fila.then(async () => {
    try {
      const j = await analisar(arquivo.url);
      if (j?.erro || !j?.descricao) { console.warn(`[AVATAR] ${arquivo.id}: ${j?.erro ?? "sem descrição"}`); resultados.delete(arquivo.id); return null; }
      return { descricao: String(j.descricao), ...avaliarAvatar(j.descricao, { riscoModelo: !!j.riscoModelo }) };
    } catch (e) {
      console.warn(`[AVATAR] ${arquivo.id}: ${e?.message ?? e}`); resultados.delete(arquivo.id); return null;
    } finally { naFila--; }
  });
  fila = promessa.catch(() => {});
  resultados.set(arquivo.id, { t: agora, promessa });
  return promessa;
}

// ── Quem não passa pela checagem ────────────────────────────────────────────
function isento(ctx, server, userId, member, user) {
  if (user?.bot || member?.user?.bot) return true;
  if (server?.ownerId && server.ownerId === userId) return true;
  if (ctx.ehSuperAdmin?.(userId)) return true;
  try {
    return !!ctx.membroTemPermissao?.({ authorId: userId, serverId: server?.id, member, author: user }, server, "ManageMessages");
  } catch { return false; }
}

// Uma checagem num servidor. Devolve o que fez (os testes esperam; os eventos não).
export async function verificar({ ctx, server, userId, avatar, origem = "entrada", member = null, user = null }) {
  if (!ligado(ctx?.config)) return null;
  const arquivo = arquivoDe(avatar);
  if (!arquivo || !server || !userId) return null;
  if (isento(ctx, server, userId, member, user)) return null;
  const r = await analisarFoto(arquivo);
  console.log(`[AVATAR] ${userId} em ${server.id} (${origem}): ${r ? (r.apitou ? `APITOU [${r.motivos.join(", ")}]` : r.suspeita ? "suspeita (só alerta)" : "ok") : "sem análise"}`);
  if (!r?.apitou && !r?.suspeita) return { apitou: false };

  const cfg = ctx.config.automod.antiAvatar ?? {};
  // suspeita (termo sem o voto do modelo): avisa a staff, não pune
  const acao = r.apitou ? acaoDoAvatar(cfg) : "alertar";
  const en = textoDoIdioma(ctx.config?.language) === "en";
  // espanhol (etapa 4b): `es` vem antes de `en` (num servidor em espanhol, `en` também é true)
  const es = idiomaDe(ctx) === "es";
  const motivo = es ? `foto de perfil inapropiada (${r.motivos.map((m) => MOTIVO_ES[m] ?? m).join(", ")})`
    : en ? `profile picture flagged (${r.motivos.map((m) => MOTIVO_EN[m] ?? m).join(", ")})` : `foto de perfil imprópria (${r.motivos.join(", ")})`;
  let feito = r.apitou ? (es ? "nada — solo alerta" : en ? "nothing — alert only" : "nada — só alerta")
    : (es ? "nada — el modelo no confirmó el riesgo; revisa el perfil" : en ? "nothing — the model didn't confirm the risk; check the profile" : "nada — o modelo não confirmou o risco; confira o perfil");

  try {
    if (acao === "silenciar") {
      const ms = tempoDoAvatar(cfg);
      await aplicarTimeout(server, userId, ms);
      db.silenciarAte(server.id, userId, Date.now() + ms, motivo);   // sair e voltar reaplica
      feito = es ? `silenciado (timeout) durante ${duracaoTexto(ms, "es")}` : en ? `silenced (timeout) for ${duracaoTexto(ms, "es")}` : `silenciado (timeout) por ${duracaoTexto(ms, "pt")}`;
    } else if (acao === "expulsar") {
      await server.kickUser(userId);
      feito = es ? "expulsado" : en ? "kicked" : "expulso";
    } else if (acao === "banir") {
      await banir(server, userId, { reason: `[AutoMod] ${motivo}` });
      feito = es ? "baneado" : en ? "banned" : "banido";
    }
  } catch (e) {
    // o erro do Stoat chega como JSON cru ({"type":"MissingPermission",…}) — em
    // texto de gente, com o que fazer (13 out 2026)
    const lang = en ? "en" : "pt";
    const det = descreverErro(e, lang);
    const P = ctx.PREFIXO ?? "&";
    const dica = tipoDoErro(e) === "MissingPermission"
      ? (es ? `dale ese permiso al rol de Judy, o cambia la acción: \`${citar("automod.sentinela.avatar.acao.alertar", "es", P)}\``
        : en ? `give Judy's role that permission, or change the action: \`${citarInterno("automod.sentinela.avatar.acao.alertar", P)}\``
            : `dê essa permissão ao cargo da Judy, ou mude a ação: \`${citarInterno("automod.sentinela.avatar.acao.alertar", P)}\``)
      : tipoDoErro(e) === "NotElevated"
        ? (es ? "sube el rol de Judy por encima de los roles de la persona" : en ? "move Judy's role above the member's roles" : "suba o cargo da Judy acima dos cargos da pessoa")
        : (es ? "revisa el rol y los permisos del bot" : en ? "check the bot's role and permissions" : "confira o cargo e as permissões do bot");
    const nomeAcao = es ? ({ silenciar: "silenciar", expulsar: "expulsar", banir: "banear" }[acao] ?? acao)
      : en ? ({ silenciar: "silence", expulsar: "kick", banir: "ban" }[acao] ?? acao) : acao;
    feito = es ? `no pude ${nomeAcao} — ${det}. ${dica[0].toUpperCase()}${dica.slice(1)}.` : en ? `couldn't ${nomeAcao} — ${det}. ${dica[0].toUpperCase()}${dica.slice(1)}.` : `não consegui ${nomeAcao} — ${det}. ${dica[0].toUpperCase()}${dica.slice(1)}.`;
    console.warn(`[AVATAR] ${acao} de ${userId} em ${server.id}: ${det}`);
  }

  const alertouEm = await alertar(ctx, { server, userId, origem, r, feito, acao, en, es });
  // o alerta já foi para o canal de log (sem canal do sentinela): não repete
  if (r.apitou && alertouEm !== ctx.config?.log?.canalId) await log.registrar(ctx, "punicoes", {
    titulo: en ? "🖼️ Profile picture flagged" : "🖼️ Foto de perfil imprópria",
    descricao: `<@${userId}> — ${motivo} (${origem === "troca" ? (en ? "changed picture" : "trocou a foto") : (en ? "on join" : "ao entrar")}).\n**${en ? "Action" : "Ação"}:** ${feito}`,
    es: { titulo: "🖼️ Foto de perfil inapropiada",
      descricao: `<@${userId}> — ${motivo} (${origem === "troca" ? "cambió la foto" : "al entrar"}).\n**Acción:** ${feito}` },
  });
  return { apitou: r.apitou, suspeita: !!r.suspeita, acao, feito, motivos: r.motivos };
}

async function alertar(ctx, { server, userId, origem, r, feito, acao, en, es = false }) {
  const destinoId = ctx.config?.automod?.antiScam?.alertChannelId || ctx.config?.log?.canalId || null;
  const achado = destinoId ? await Promise.resolve(ctx.client?.channels?.get?.(destinoId) ?? ctx.client?.channels?.fetch?.(destinoId)).catch(() => null) : null;
  const destino = achado && (achado.serverId ?? achado.server?.id ?? server.id) === server.id ? achado : null;
  if (!destino) { console.warn(`[AVATAR] alerta NÃO entregue: servidor ${server.id} sem canal de alerta do sentinela nem de log`); return null; }
  const P = ctx.PREFIXO ?? "&";
  const staff = (ctx.config?.acesso?.cargosStaff ?? []).map((id) => `<%${id}>`).join(" ");
  // o espanhol sai pronto (como o de um `tr`); no pt e no en, o texto fica igual
  const pronto = (t) => (es ? trechoPronto(t) : t);
  await ctx.sendEmbed(destino, {
    title: pronto(r.grave ? (es ? "🚨 Foto de perfil — posible material de abuso" : en ? "🚨 Profile picture — possible abuse material" : "🚨 Foto de perfil — possível material de abuso")
      : r.suspeita ? (es ? "🖼️ Foto de perfil para revisar" : en ? "🖼️ Profile picture to check" : "🖼️ Foto de perfil para conferir")
      : (es ? "🖼️ Foto de perfil inapropiada" : en ? "🖼️ Inappropriate profile picture" : "🖼️ Foto de perfil imprópria")),
    description: pronto([
      staff || null,
      `<@${userId}> · ${origem === "troca" ? (es ? "cambió su foto" : en ? "changed their picture" : "trocou a foto") : (es ? "acaba de entrar" : en ? "just joined" : "acabou de entrar")}`,
      `**${es ? "Señales" : en ? "Signals" : "Sinais"}:** ${r.motivos.map((m) => (es ? MOTIVO_ES[m] ?? m : en ? MOTIVO_EN[m] ?? m : m)).join(", ")}`,
      `**${es ? "Acción" : en ? "Action" : "Ação"}:** ${feito}`,
      "",
      `> ${r.descricao.replace(/\n+/g, " ").slice(0, 400)}`,
      "",
      es ? "**La foto NO se vuelve a publicar aquí.** Es la descripción de un modelo — revisa el perfil." : en ? "**The picture is NOT reposted here.** It's a model's description — check the profile." : "**A foto NÃO é repostada aqui.** É a descrição de um modelo — confira o perfil.",
      acao !== "banir" ? (es ? `\`${citar("automod.sentinela.liberar", "es", P)} ${userId}\` · \`${citar("automod.sentinela.banir", "es", P)} ${userId}\`` : en ? `\`${citarInterno("automod.sentinela.liberar", P)} ${userId}\` · \`${citarInterno("automod.sentinela.banir", P)} ${userId}\`` : `\`${citarInterno("automod.sentinela.liberar", P)} ${userId}\` · \`${citarInterno("automod.sentinela.banir", P)} ${userId}\``) : null,
    ].filter((x) => x !== null).join("\n")),
    colour: r.grave ? ctx.COR?.erro : ctx.COR?.aviso,
  });
  return destino.id ?? destinoId;
}
const MOTIVO_EN = { "sexual explícito": "explicit sexual", "menor + sexual": "minor + sexual", nudez: "nudity", "ódio": "hate", gore: "gore",
  "possível conteúdo sexual (o modelo não confirmou o risco)": "possible sexual content (the model didn't confirm the risk)" };
const MOTIVO_ES = { "sexual explícito": "sexual explícito", "menor + sexual": "menor + sexual", nudez: "desnudez", "ódio": "odio", gore: "gore",
  "possível conteúdo sexual (o modelo não confirmou o risco)": "posible contenido sexual (el modelo no confirmó el riesgo)" };

// ── Os eventos ──────────────────────────────────────────────────────────────
// Entrou: a foto do perfil e, se tiver, a de servidor.
export async function aoEntrar(member, ctx) {
  const serverId = member?.id?.server, userId = member?.id?.user;
  if (!serverId || !userId || !ligado(ctx?.config)) return [];
  const server = member.server ?? await ctx.client?.servers?.fetch?.(serverId).catch(() => null);
  const user = member.user ?? ctx.client?.users?.get?.(userId) ?? await ctx.client?.users?.fetch?.(userId).catch(() => null);
  const feitos = [];
  for (const avatar of [member.avatar, user?.avatar]) {
    if (!avatar) continue;
    const r = await verificar({ ctx, server, userId, avatar, origem: "entrada", member, user });
    feitos.push(r);
    if (r?.apitou) break;   // uma ação basta
  }
  return feitos;
}

const idDe = (a) => a?.id ?? a?._id ?? null;

// Trocou a foto DESTE servidor.
export async function aoTrocarNoServidor(member, anterior, ctx) {
  const novo = idDe(member?.avatar);
  if (!novo || novo === idDe(anterior?.avatar)) return null;
  const serverId = member?.id?.server, userId = member?.id?.user;
  if (!serverId || !userId || !ligado(ctx?.config)) return null;
  const server = member.server ?? await ctx.client?.servers?.fetch?.(serverId).catch(() => null);
  return verificar({ ctx, server, userId, avatar: member.avatar, origem: "troca", member, user: member.user });
}

// Trocou a foto do PERFIL: vale em todo servidor da Judy onde a pessoa está.
// (O evento de presença também chega como userUpdate — sem foto nova, nada.)
export async function aoTrocarPerfil(user, anterior, { client, criarContexto }) {
  const novo = idDe(user?.avatar);
  if (!novo || novo === idDe(anterior?.avatar)) return [];
  const userId = user.id ?? user._id;
  const feitos = [];
  for (const server of [...(client?.servers?.values?.() ?? [])]) {
    const ctx = criarContexto(server.id);
    if (!ligado(ctx?.config)) continue;
    let member = client.serverMembers?.getByKey?.({ server: server.id, user: userId }) ?? null;
    if (!member) {
      try { member = await server.fetchMember(userId); } catch { member = null; }
    }
    if (!member) continue;   // não é membro deste servidor
    feitos.push(await verificar({ ctx, server, userId, avatar: user.avatar, origem: "troca", member, user }));
  }
  return feitos;
}

// Só para testes
export function _zerar() { resultados.clear(); }
