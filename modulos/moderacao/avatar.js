// avatar.js — as imagens do perfil (foto, foto de servidor, banner) vistas pelo
// modelo de visão, e o que o bot faz quando o perfil apita (13 out 2026; P3a
// em 31 out 2026).
//
// Pedido de Ghieh: contas entrando com foto de genitália no ícone. A imagem é
// analisada AO ENTRAR e AO TROCAR, pelo mesmo caminho das imagens do sentinela:
// o ia-servico descreve (/moderar-imagem, sessão nova por imagem) e o bot decide.
//
// (31 out 2026, P3a) O perfil inteiro (bio, nome, status, foto e banner) passou
// para perfil.js; aqui fica o que é de IMAGEM — a nota da descrição, o hash
// (dHash, pelo ia-servico) — e a execução da ação com o alerta à staff. A
// decisão passa pela CERTEZA (certeza.js): nota alta → age; média/baixa → fila
// do dono, sem punir. Os nomes antigos (`aoEntrar`, `verificar`…) continuam
// aqui e levam ao perfil.js (o main.js e os testes os usam).
//
// A ação é por servidor (`&automod sentinela avatar acao …`): `alertar`,
// `silenciar` (padrão: timeout nativo ATÉ TROCAR o que apitou + alerta),
// `expulsar` ou `banir`. A staff é sempre avisada quando há ação — e o alerta
// nunca republica a imagem nem o texto.

import { chaveServicoIA } from "../ai/servicos.js";
import * as log from "../core/log.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import * as db from "../core/db.js";
import { banir } from "../core/banir.js";
import { lerDuracao, duracaoTexto } from "../core/duracao.js";
import { aplicarTimeout, CONFIRMAR_MS, MAX_TIMEOUT_MS } from "./timeout.js";
import { pontuarDescricao } from "./imagem.js";
import { descreverErro, tipoDoErro } from "../core/erros.js";
import { canalDaStaff } from "./pertence.js";
import { PADRAO } from "./certeza.js";
import { hashValido } from "./hash.js";
import * as perfil from "./perfil.js";

export const ACOES_AVATAR = ["alertar", "silenciar", "expulsar", "banir"];
const ACAO_EN = { alert: "alertar", silence: "silenciar", mute: "silenciar", timeout: "silenciar", kick: "expulsar", ban: "banir" };
export const acaoAvatarValida = (x) => {
  const a = String(x ?? "").toLowerCase();
  const v = ACAO_EN[a] ?? a;
  return ACOES_AVATAR.includes(v) ? v : null;
};
export const acaoDoAvatar = (cfg) => acaoAvatarValida(cfg?.acao) ?? "silenciar";
export const tempoDoAvatar = (cfg) => Math.min(MAX_TIMEOUT_MS, lerDuracao(cfg?.tempo) ?? CONFIRMAR_MS());
// (31 out 2026, P3a) decisão do dono: o silêncio do perfil dura ATÉ A PESSOA TROCAR
// o que apitou (perfil.js devolve a voz na troca) — o teto é o do próprio Stoat.
export const ATE_TROCAR_MS = MAX_TIMEOUT_MS;

const iaUrl = () => (process.env.IA_SERVICO_URL || "").replace(/\/$/, "");
const CDN = () => (process.env.CDN_URL || "https://cdn.stoatusercontent.com").replace(/\/$/, "");

// As IMAGENS do perfil precisam do modelo de visão; o texto do perfil não (perfil.ligado).
export const temVisao = () => !!iaUrl();
export function ligado(config) {
  return config?.automod?.antiAvatar?.enabled !== false && !!iaUrl();
}

// File da stoat.js (`id`, `tag`) ou o objeto cru da API (`_id`, `tag`). O banner
// chega como `background` (tag `backgrounds`).
export function arquivoDe(avatar, tag = "avatars") {
  const id = avatar?.id ?? avatar?._id ?? null;
  if (!id || !/^[\w-]{1,128}$/.test(String(id))) return null;
  const t = /^[a-z]{1,32}$/.test(String(avatar?.tag ?? "")) ? avatar.tag : tag;
  return { id: String(id), url: `${CDN()}/${t}/${id}` };
}

// (31 out 2026, P3a) "partes íntimas", "órgão sexual", "seios à mostra"… passavam:
// o modelo descrevia a genitália sem a palavra que a lista conhecia.
const EXPLICITO = /(?<![\p{L}\p{N}])(genit\p{L}*|p[eê]nis|vaginas?|vulvas?|[aâ]nus|test[ií]culos?|escroto|ere[cç][aã]o|pornogr\p{L}*|ato sexual|sexo (oral|expl[ií]cito)|masturba\p{L}*|penetra[cç][aã]o|partes [ií]ntimas|[oó]rg[aã]os? sexua(l|is)|[oó]rg[aã]os? genita(l|is)|seios? (nus|à mostra|a mostra|expostos?)|mamilos?|nudez (expl[ií]cita|frontal|total)|genitals?|penis|testicles?|erect penis|porn\p{L}*|sexual act|oral sex|masturbat\p{L}*|intercourse|private parts|sex organs?|nipples?|exposed breasts?|full(-| )frontal|explicit nudity)(?![\p{L}\p{N}])/iu;

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
export function avaliarAvatar(descricao, { riscoModelo = false, recusou = false } = {}) {
  // (22 out 2026) o modelo se recusou a descrever a foto: ninguém é punido
  // por isso, mas a staff é avisada (é o que um modelo com trava faz com nudez)
  if (recusou) return { apitou: false, suspeita: true, motivos: ["o modelo de visão se recusou a descrever a foto — confira"], grave: false };
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

// ── A nota (0–1) e a categoria da imagem (31 out 2026, P3a) ─────────────────
// Os erros que o dono relatou viram regra:
//   • anime comum muito vermelho ou em preto e branco sendo pego: num DESENHO,
//     nudez sem genitália e "sangue" não passam de certeza média (fila, sem punir);
//   • genitália passando: as palavras novas do EXPLICITO; e termo explícito sem
//     o voto do modelo vai à fila (antes só avisava a staff);
//   • apoio a regimes da 2ª Guerra passando: os símbolos e as palavras abaixo
//     levam o caso à fila mesmo sem o voto do modelo; com o voto, o símbolo pune.
// O torso masculino nu (praia, academia) não é nudez e sai antes de tudo.
const DESENHO = /(?<![\p{L}])(anime|mang[áa]|desenh\p{L}*|ilustra\p{L}*|cartoon|chibi|quadrinhos?|personagem|animação|fan ?art|arte digital|drawing|drawn|illustrat\p{L}*|comic|character|digital art)(?![\p{L}])/iu;
const TORSO = /(?<![\p{L}])((torso|peito|tronco|abd[oô]men)\s+(nu|desnudo|exposto)|sem camisa|shirtless|bare[- ]chest\p{L}*|topless man|homem de sunga)(?![\p{L}])/giu;
const SUGESTIVO = /(?<![\p{L}])(lingerie|roupa [ií]ntima|calcinha|suti[ãa]|pose sensual|sensual|provocante|seminu\p{L}*|underwear|suggestive|seductive|lewd|nsfw|hentai)(?![\p{L}])/iu;
const ODIO_SIMBOLO = /[卐卍]|(?<![\p{L}])(su[áa]sticas?|swastikas?|bandeira nazista|nazi flag|runas? (da )?ss|ss runes|sieg heil|sauda[çc][ãa]o nazista|nazi salute|kkk|ku klux|white power|totenkopf|sol negro|black sun|1488)(?![\p{L}])/iu;
const ODIO_SUGESTIVO = /(?<![\p{L}])(hitler|nazis\p{L}*|nazi|terceiro reich|third reich|reichsadler|[áa]guia (imperial|nazista|do reich)|imperial eagle|wehrmacht|waffen|fascis\p{L}*|mussolini|uniforme (militar )?(alem[ãa]o|nazista) da segunda guerra|wwii german uniform|bandeira vermelha com (um )?c[íi]rculo branco|red flag with a white circle|catorze palavras|fourteen words)(?![\p{L}])/iu;

const MOTIVO = { explicito: "sexual explícito", grave: "menor + sexual", nudez: "nudez", sugestivo: "sugestivo", gore: "gore", odio: "ódio", simbolo: "símbolo de ódio", recusa: "o modelo de visão se recusou a descrever a foto — confira" };

export function notaDaFoto(descricao, { riscoModelo = false, recusou = false } = {}) {
  if (recusou) return { categoria: "sexual", nota: 0.6, motivos: [MOTIVO.recusa], grave: false, desenho: false };
  const ali = afirmado(String(descricao ?? "").replace(TORSO, " "));
  const r = pontuarDescricao(ali, { riscoModelo });
  const desenho = DESENHO.test(ali);
  const op = [];   // [categoria, nota, motivo]
  if (r.grave) op.push(["sexual", 0.99, MOTIVO.grave]);
  if (EXPLICITO.test(ali)) op.push(["sexual", riscoModelo ? 0.95 : 0.7, MOTIVO.explicito]);
  if (r.categorias.includes("sexual")) op.push(["sexual", riscoModelo ? (desenho ? 0.6 : 0.9) : 0.4, MOTIVO.nudez]);
  if (SUGESTIVO.test(ali)) op.push(["sexual", riscoModelo ? 0.5 : 0.35, MOTIVO.sugestivo]);
  if (ODIO_SIMBOLO.test(ali)) op.push(["odio", riscoModelo ? 0.95 : 0.7, MOTIVO.simbolo]);
  if (r.categorias.includes("odio")) op.push(["odio", riscoModelo ? 0.9 : 0.6, MOTIVO.odio]);
  else if (ODIO_SUGESTIVO.test(ali)) op.push(["odio", riscoModelo ? 0.75 : 0.45, MOTIVO.odio]);
  if (r.categorias.includes("gore")) op.push(["gore", riscoModelo ? (desenho ? 0.55 : 0.9) : 0.35, "gore"]);
  if (!op.length) return { categoria: null, nota: 0, motivos: [], grave: false, desenho };
  op.sort((a, b) => b[1] - a[1]);
  const [categoria, nota] = op[0];
  return { categoria, nota, motivos: [...new Set(op.filter((o) => o[0] === categoria).map((o) => o[2]))], grave: !!r.grave, desenho };
}

// ── Análise (uma por vez; a mesma foto, uma vez só) ─────────────────────────
// Num raid entram muitas contas juntas, e a mesma foto vale em vários
// servidores: o resultado fica guardado por foto por 6 h.
let analisar = async (url) => {
  const chave = chaveServicoIA();
  const resp = await fetch(`${iaUrl()}/moderar-imagem`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(chave ? { "x-chave": chave } : {}) },
    body: JSON.stringify({ url }), signal: AbortSignal.timeout(120_000),
  });
  return resp.json().catch(() => ({}));
};
export function _trocarAnalise(fn) { const antes = analisar; analisar = fn; return antes; }

const CACHE_MS = 6 * 3600_000, FILA_MAX = 30, CACHE_MAX = 2000;
const resultados = new Map();   // id da foto → { t, promessa }
let fila = Promise.resolve(), naFila = 0;
const podar = (mapa, ttl, agora) => {
  for (const [k, v] of mapa) if (agora - v.t > ttl) mapa.delete(k);
  while (mapa.size > CACHE_MAX) mapa.delete(mapa.keys().next().value);
};

export function analisarFoto(arquivo, agora = Date.now()) {
  podar(resultados, CACHE_MS, agora);
  const guardado = resultados.get(arquivo.id);
  if (guardado) return guardado.promessa;
  if (naFila >= FILA_MAX) { console.warn(`[AVATAR] fila cheia (${FILA_MAX}) — foto ${arquivo.id} não analisada`); return Promise.resolve(null); }
  naFila++;
  const promessa = fila.then(async () => {
    try {
      const j = await analisar(arquivo.url);
      if (j?.erro || !j?.descricao) { console.warn(`[AVATAR] ${arquivo.id}: ${j?.erro ?? "sem descrição"}`); resultados.delete(arquivo.id); return null; }
      const opts = { riscoModelo: !!j.riscoModelo, recusou: j.recusou === true };
      const n = notaDaFoto(j.descricao, opts);
      // `apitou`/`suspeita`: a opinião do detector com o limiar padrão (o `&automod sentinela avatar checar`)
      return { descricao: String(j.descricao), ...avaliarAvatar(j.descricao, { riscoModelo: !!j.riscoModelo, recusou: j.recusou === true }),
        ...(n.categoria ? { motivos: n.motivos } : {}),
        apitou: n.nota >= PADRAO.alta, suspeita: n.nota < PADRAO.alta && n.nota >= PADRAO.baixa,
        nota: n.nota, categoria: n.categoria, desenho: n.desenho, grave: n.grave };
    } catch (e) {
      console.warn(`[AVATAR] ${arquivo.id}: ${e?.message ?? e}`); resultados.delete(arquivo.id); return null;
    } finally { naFila--; }
  });
  fila = promessa.catch(() => {});
  resultados.set(arquivo.id, { t: agora, promessa });
  return promessa;
}

// ── O hash da imagem (dHash 8×8), pelo ia-servico (/hash-imagem) ─────────────
// Barato (sem modelo) e determinístico: vem ANTES do modelo — o que o dono já
// julgou não gasta GPU. O arquivo do CDN nunca muda: o hash fica 24 h.
let hashear = async (url) => {
  const chave = chaveServicoIA();
  const resp = await fetch(`${iaUrl()}/hash-imagem`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(chave ? { "x-chave": chave } : {}) },
    body: JSON.stringify({ url }), signal: AbortSignal.timeout(30_000),
  });
  return resp.json().catch(() => ({}));
};
export function _trocarHash(fn) { const antes = hashear; hashear = fn; return antes; }
const hashes = new Map();   // id da foto → { t, promessa }
export function hashDaFoto(arquivo, agora = Date.now()) {
  if (!arquivo?.id || !iaUrl()) return Promise.resolve(null);
  podar(hashes, 24 * 3600_000, agora);
  const guardado = hashes.get(arquivo.id);
  if (guardado) return guardado.promessa;
  const promessa = (async () => {
    try {
      const j = await hashear(arquivo.url);
      if (!hashValido(j?.dhash)) { if (j?.erro) console.warn(`[AVATAR] hash ${arquivo.id}: ${j.erro}`); hashes.delete(arquivo.id); return null; }
      return j.dhash;
    } catch (e) { console.warn(`[AVATAR] hash ${arquivo.id}: ${e?.message ?? e}`); hashes.delete(arquivo.id); return null; }
  })();
  hashes.set(arquivo.id, { t: agora, promessa });
  return promessa;
}

// ── Quem não passa pela checagem ────────────────────────────────────────────
export function isento(ctx, server, userId, member, user) {
  if (user?.bot || member?.user?.bot) return true;
  if (server?.ownerId && server.ownerId === userId) return true;
  if (ctx.ehSuperAdmin?.(userId)) return true;
  try {
    return !!ctx.membroTemPermissao?.({ authorId: userId, serverId: server?.id, member, author: user }, server, "ManageMessages");
  } catch { return false; }
}

// ── Os rótulos de cada parte do perfil ──────────────────────────────────────
export const CAMPO = {
  avatar:         { pt: "foto de perfil", en: "profile picture", es: "foto de perfil", troca: ["trocou a foto", "changed their picture", "cambió su foto"] },
  avatarServidor: { pt: "foto deste servidor", en: "server picture", es: "foto de este servidor", troca: ["trocou a foto", "changed their picture", "cambió su foto"] },
  banner:         { pt: "banner", en: "banner", es: "banner", troca: ["trocou o banner", "changed their banner", "cambió su banner"] },
  bio:            { pt: "bio", en: "bio", es: "bio", troca: ["trocou a bio", "changed their bio", "cambió su bio"] },
  nome:           { pt: "nome de exibição", en: "display name", es: "nombre visible", troca: ["trocou o nome", "changed their name", "cambió su nombre"] },
  apelido:        { pt: "apelido no servidor", en: "server nickname", es: "apodo en el servidor", troca: ["trocou o apelido", "changed their nickname", "cambió su apodo"] },
  status:         { pt: "status", en: "status", es: "estado", troca: ["trocou o status", "changed their status", "cambió su estado"] },
};
const IMAGEM = new Set(["avatar", "avatarServidor", "banner"]);
const MOTIVO_EN = { "sexual explícito": "explicit sexual", "menor + sexual": "minor + sexual", nudez: "nudity", "ódio": "hate", gore: "gore",
  sugestivo: "suggestive", "símbolo de ódio": "hate symbol", "arte em texto": "text art", "arte em texto conhecida": "known text art",
  "texto sexual": "sexual text", "texto de ódio": "hateful text", "texto de golpe": "scam text", "confirmado pelo dono do bot": "confirmed by the bot owner",
  "possível conteúdo sexual (o modelo não confirmou o risco)": "possible sexual content (the model didn't confirm the risk)",
  "o modelo de visão se recusou a descrever a foto — confira": "the vision model refused to describe the picture — check it" };
const MOTIVO_ES = { "sexual explícito": "sexual explícito", "menor + sexual": "menor + sexual", nudez: "desnudez", "ódio": "odio", gore: "gore",
  sugestivo: "sugerente", "símbolo de ódio": "símbolo de odio", "arte em texto": "arte en texto", "arte em texto conhecida": "arte en texto conocida",
  "texto sexual": "texto sexual", "texto de ódio": "texto de odio", "texto de golpe": "texto de estafa", "confirmado pelo dono do bot": "confirmado por el dueño del bot",
  "possível conteúdo sexual (o modelo não confirmou o risco)": "posible contenido sexual (el modelo no confirmó el riesgo)",
  "o modelo de visão se recusou a descrever a foto — confira": "el modelo de visión se negó a describir la foto — revísala" };
const motivoEm = (m, L) => (L === "es" ? MOTIVO_ES[m] ?? m : L === "en" ? MOTIVO_EN[m] ?? m : m);

// "foto de perfil: nudez" — com uma parte só e ela sendo a foto, só o motivo (como antes)
export function sinaisDe(achados, L) {
  const soFoto = achados.length === 1 && achados[0].campo === "avatar";
  return achados.map((a) => {
    const m = a.motivos.map((x) => motivoEm(x, L)).join(", ");
    return soFoto ? m : `${CAMPO[a.campo]?.[L] ?? a.campo}: ${m}`;
  }).join("; ");
}
export function motivoDaPunicao(achados, L) {
  const soFotos = achados.every((a) => a.campo === "avatar" || a.campo === "avatarServidor");
  const s = sinaisDe(achados, L);
  if (soFotos && achados.length === 1) return L === "es" ? `foto de perfil inapropiada (${s})` : L === "en" ? `profile picture flagged (${s})` : `foto de perfil imprópria (${s})`;
  return L === "es" ? `perfil inapropiado (${s})` : L === "en" ? `profile flagged (${s})` : `perfil impróprio (${s})`;
}

// ── A ação, num servidor ────────────────────────────────────────────────────
// Devolve { feito, ok, ate }: `feito` é o texto para o alerta, no idioma do servidor; `ate`
// (silenciar), quando o timeout aplicado acaba (ms) — o perfil só devolve a voz se ainda é esse.
export async function aplicarAcao({ ctx, server, userId, acao, motivo, L }) {
  const en = L === "en", es = L === "es";
  let feito = es ? "nada — solo alerta" : en ? "nothing — alert only" : "nada — só alerta";
  let ate = null;
  try {
    if (acao === "silenciar") {
      const ms = ATE_TROCAR_MS;
      const fim = await aplicarTimeout(server, userId, ms);
      ate = fim instanceof Date ? fim.getTime() : Date.now() + ms;
      db.silenciarAte(server.id, userId, ate, motivo);   // sair e voltar reaplica
      feito = es ? `silenciado (timeout) durante ${duracaoTexto(ms, "es")}, hasta que cambie el perfil`
        : en ? `silenced (timeout) for ${duracaoTexto(ms, "en")}` + ", until the profile changes" : `silenciado (timeout) por ${duracaoTexto(ms, "pt")}, até trocar o perfil`;
    } else if (acao === "expulsar") {
      await server.kickUser(userId);
      feito = es ? "expulsado" : en ? "kicked" : "expulso";
    } else if (acao === "banir") {
      await banir(server, userId, { reason: `[AutoMod] ${motivo}` });
      feito = es ? "baneado" : en ? "banned" : "banido";
    }
    return { feito, ok: true, ate };
  } catch (e) {
    // o erro do Stoat chega como JSON cru ({"type":"MissingPermission",…}) — em
    // texto de gente, com o que fazer (13 out 2026)
    const det = descreverErro(e, en ? "en" : es ? "es" : "pt");
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
    return { feito, ok: false };
  }
}

// O alerta à staff (só quando o bot agiu — ou, sem a fila do dono, o "para conferir").
// Nunca leva a imagem nem o texto do perfil: o que apitou e a descrição do modelo.
export async function alertar(ctx, { server, userId, origem, achados, feito, acao, L, conferir = false }) {
  const destino = await canalDaStaff(ctx, server);
  if (!destino) { console.warn(`[AVATAR] alerta NÃO entregue: servidor ${server.id} sem canal de alerta do sentinela nem de log`); return null; }
  const en = L === "en", es = L === "es";
  const P = ctx.PREFIXO ?? "&";
  const staff = (ctx.config?.acesso?.cargosStaff ?? []).map((id) => `<%${id}>`).join(" ");
  // o espanhol sai pronto (como o de um `tr`); no pt e no en, o texto fica igual
  const pronto = (t) => (es ? trechoPronto(t) : t);
  const grave = achados.some((a) => a.grave);
  const soFotos = achados.every((a) => a.campo === "avatar" || a.campo === "avatarServidor");
  const temImagem = achados.some((a) => IMAGEM.has(a.campo));
  const i = es ? 2 : en ? 1 : 0;
  const trocou = achados.length === 1 ? CAMPO[achados[0].campo]?.troca?.[i] : null;
  const descricoes = achados.filter((a) => a.descricao).map((a) => `> ${a.descricao.replace(/\n+/g, " ").slice(0, 400)}`);
  await ctx.sendEmbed(destino, {
    title: pronto(grave ? (es ? "🚨 Perfil — posible material de abuso" : en ? "🚨 Profile — possible abuse material" : "🚨 Perfil — possível material de abuso")
      : conferir ? (soFotos ? (es ? "🖼️ Foto de perfil para revisar" : en ? "🖼️ Profile picture to check" : "🖼️ Foto de perfil para conferir") : (es ? "🪪 Perfil para revisar" : en ? "🪪 Profile to check" : "🪪 Perfil para conferir"))
      : soFotos ? (es ? "🖼️ Foto de perfil inapropiada" : en ? "🖼️ Inappropriate profile picture" : "🖼️ Foto de perfil imprópria")
      : (es ? "🪪 Perfil inapropiado" : en ? "🪪 Inappropriate profile" : "🪪 Perfil impróprio")),
    description: pronto([
      staff || null,
      `<@${userId}> · ${origem === "troca" ? (trocou ?? (es ? "cambió su perfil" : en ? "changed their profile" : "trocou o perfil"))
        : origem === "revisao" ? (es ? "el dueño del bot confirmó un caso parecido" : en ? "the bot owner confirmed a similar case" : "o dono do bot confirmou um caso parecido")
          : (es ? "acaba de entrar" : en ? "just joined" : "acabou de entrar")}`,
      `**${es ? "Señales" : en ? "Signals" : "Sinais"}:** ${sinaisDe(achados, L)}`,
      `**${es ? "Acción" : en ? "Action" : "Ação"}:** ${feito}`,
      ...(descricoes.length ? ["", ...descricoes] : []),
      "",
      temImagem
        ? (es ? "**La foto NO se vuelve a publicar aquí.** Es la descripción de un modelo — revisa el perfil." : en ? "**The picture is NOT reposted here.** It's a model's description — check the profile." : "**A foto NÃO é repostada aqui.** É a descrição de um modelo — confira o perfil.")
        : (es ? "**El texto del perfil NO se vuelve a publicar aquí** — revisa el perfil." : en ? "**The profile text is NOT reposted here** — check the profile." : "**O texto do perfil NÃO é repostado aqui** — confira o perfil."),
      acao !== "banir" ? (es ? `\`${citar("automod.sentinela.liberar", "es", P)} ${userId}\` · \`${citar("automod.sentinela.banir", "es", P)} ${userId}\`` : en ? `\`${citarInterno("automod.sentinela.liberar", P)} ${userId}\` · \`${citarInterno("automod.sentinela.banir", P)} ${userId}\`` : `\`${citarInterno("automod.sentinela.liberar", P)} ${userId}\` · \`${citarInterno("automod.sentinela.banir", P)} ${userId}\``) : null,
    ].filter((x) => x !== null).join("\n")),
    colour: grave ? ctx.COR?.erro : ctx.COR?.aviso,
  });
  return destino.id ?? null;
}

// O registro no canal de log de punições (o alerta já foi para lá? não repete).
// `motivo` e `feito` já vêm no idioma do servidor (L); o log escolhe o título.
export async function registrarNoLog(ctx, { userId, origem, motivo, feito, alertouEm }) {
  if (alertouEm && alertouEm === ctx.config?.log?.canalId) return;
  const quando = { troca: ["trocou o perfil", "changed the profile", "cambió el perfil"], revisao: ["revisão do dono do bot", "bot owner's review", "revisión del dueño del bot"] }[origem]
    ?? ["ao entrar", "on join", "al entrar"];
  await log.registrar(ctx, "punicoes", {
    titulo: "🖼️ Perfil impróprio",
    descricao: `<@${userId}> — ${motivo} (${quando[0]}).\n**Ação:** ${feito}`,
    en: { titulo: "🖼️ Profile flagged", descricao: `<@${userId}> — ${motivo} (${quando[1]}).\n**Action:** ${feito}` },
    es: { titulo: "🖼️ Perfil inapropiado", descricao: `<@${userId}> — ${motivo} (${quando[2]}).\n**Acción:** ${feito}` },
  });
}

// ── Os nomes antigos (main.js, &automod, testes) → perfil.js ────────────────
// Uma checagem de uma foto de perfil num servidor (o resultado no formato antigo).
export function verificar({ ctx, server, userId, avatar, origem = "entrada", member = null, user = null }) {
  return perfil.verificarPerfil({ ctx, server, userId, member, user, origem, valores: { avatar } });
}
export async function aoEntrar(member, ctx) {
  const r = await perfil.aoEntrar(member, ctx);
  return r ? [r] : [];
}
export const aoTrocarNoServidor = (member, anterior, ctx) => perfil.aoTrocarNoServidor(member, anterior, ctx);
export const aoTrocarPerfil = (user, anterior, deps) => perfil.aoTrocarUsuario(user, anterior, deps);

// Só para testes
export function _zerar() { resultados.clear(); hashes.clear(); perfil._zerar(); }
