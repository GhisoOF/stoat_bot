// perfil.js — a moderação do perfil INTEIRO: bio, nome de exibição, status,
// foto, banner (e, por servidor, o apelido e a foto de servidor), ao entrar e ao
// trocar (31 out 2026, P3a).
//
// Até o P2 só a foto de perfil era vista. O caso real de 30 out (_notas/
// casos-perfil.md) era uma BIO com desenhos NSFW em braille — e o banner, a bio,
// o nome e o status passavam sem olhar nenhum.
//
// Como cada parte é vista:
//   • texto (bio, nome, status, apelido): a arte em texto (arte-texto.js) e o
//     mesmo sentinela das mensagens (scorecard.js);
//   • imagem (foto, foto de servidor, banner): o hash (dHash) ANTES do modelo —
//     o que o dono já julgou não gasta GPU —, depois o modelo de visão (avatar.js).
// Cada achado tem uma nota (0–1) e uma categoria; a CERTEZA decide (certeza.js):
// alta → age (o padrão: silenciar ATÉ TROCAR); média/baixa → fila do dono, sem
// punir. O que o dono julgou (✅/❌) vale antes da nota, pela fila.
//
// De onde vem cada parte, sem chamar a API por servidor (decisão do dono):
//   • nome, status e foto: o cache de usuários da stoat.js (evento userUpdate);
//   • apelido e foto de servidor: o cache de membros (evento serverMemberUpdate);
//   • bio e banner: a stoat.js descarta o `profile` do UserUpdate — eles chegam
//     pelo evento CRU (`ligar` assina `client.events`). Na ENTRADA, uma busca do
//     perfil por pessoa (não por servidor), guardada 6 h e com teto por minuto.
//   • em quais servidores a pessoa está: só o cache de membros. Quem não está no
//     cache daquele servidor não é checado ali (nada de fetchMember por evento).

import { analisarConteudo } from "./scorecard.js";
import * as av from "./avatar.js";
import * as cz from "./certeza.js";
import { detectarArte, conhecido as arteConhecida, idiomaDoTexto } from "./arte-texto.js";
import { parecido, hashUtil, sha256 } from "./hash.js";
import { CONHECIDOS } from "./conhecidos.js";
import * as db from "../core/db.js";
import * as log from "../core/log.js";
import { tirarTimeout } from "./timeout.js";
import { idiomaDe } from "../core/i18n.js";
import { registrarErro } from "../core/erros.js";

export const CAMPOS_TEXTO = ["nome", "apelido", "status", "bio"];
export const CAMPOS_IMAGEM = ["avatar", "avatarServidor", "banner"];
const TAG = { avatar: "avatars", avatarServidor: "avatars", banner: "backgrounds" };
// o que a NOTA pode punir sozinha (com certeza alta); o resto só vai à fila
export const PUNIVEIS = new Set(["sexual", "odio", "gore"]);
// (31 out 2026, P3a, revisão) Um limiar por detector: os casos de TEXTO do perfil têm a
// categoria prefixada (`perfil-texto:sexual`, `perfil-texto:odio`, `perfil-texto:golpe`,
// `perfil-texto:arte-texto`), separada da de imagem (`sexual`, `odio`, `gore`) — a herança
// (`vereditoParecido`) e o `limiar` da fila são por categoria, e o texto não calibra a imagem.
export const PREFIXO_TEXTO = "perfil-texto:";
export const categoriaDeTexto = (c) => `${PREFIXO_TEXTO}${c}`;
const categoriaBase = (c) => String(c ?? "").replace(PREFIXO_TEXTO, "");
// categorias que o dono pode ter julgado numa imagem (a consulta antes do modelo)
const CATEGORIAS_IMAGEM = ["sexual", "odio", "gore", "perdeu"];
let conhecidos = CONHECIDOS;
// Só para testes: o caso 1 não pode ser reproduzido (a arte não existe em lugar nenhum)
export function _trocarConhecidos(lista) { const antes = conhecidos; conhecidos = lista ?? CONHECIDOS; return antes; }

// O perfil é o mesmo módulo da foto (`&automod sentinela avatar`); o texto não
// precisa do modelo de visão, as imagens precisam (avatar.temVisao).
export const ligado = (config) => config?.automod?.antiAvatar?.enabled !== false;

const idDe = (a) => a?.id ?? a?._id ?? null;
const vazio = (v) => v == null || (typeof v === "string" && !v.trim());

// ── Bio e banner guardados (o evento cru e a busca da entrada) ──────────────
const PERFIL_MS = 6 * 3600_000, PERFIL_MAX = 5000, BUSCAS_POR_MINUTO = 20;
const perfis = new Map();   // userId → { t, bio?, banner? }
export function lembrarPerfil(userId, dados, agora = Date.now()) {
  if (!userId) return;
  const atual = perfis.get(userId) ?? {};
  perfis.delete(userId);
  perfis.set(userId, { ...atual, ...dados, t: agora });
  // a ordem do Map é a da última gravação: os vencidos estão no começo (a bio não fica além das 6 h)
  for (const [k, v] of perfis) { if (agora - v.t <= PERFIL_MS && perfis.size <= PERFIL_MAX) break; perfis.delete(k); }
}
export function perfilGuardado(userId, agora = Date.now()) {
  const p = perfis.get(userId);
  return p && agora - p.t <= PERFIL_MS ? p : null;
}
let janela = { t: 0, n: 0, avisou: false };
const buscando = new Map();
// Uma chamada por PESSOA (não por servidor), com teto por minuto (num raid, a
// bio de quem passou do teto não é vista — e o log diz isso, uma vez por minuto).
export function buscarPerfil(user, agora = Date.now()) {
  const userId = user?.id ?? user?._id;
  if (!userId) return Promise.resolve(null);
  const g = perfilGuardado(userId, agora);
  if (g && "bio" in g && "banner" in g) return Promise.resolve(g);
  if (typeof user?.fetchProfile !== "function") return Promise.resolve(null);
  if (buscando.has(userId)) return buscando.get(userId);
  if (agora - janela.t > 60_000) janela = { t: agora, n: 0, avisou: false };
  if (janela.n >= BUSCAS_POR_MINUTO) {
    if (!janela.avisou) { console.warn(`[PERFIL] teto de ${BUSCAS_POR_MINUTO} buscas de perfil por minuto — bio/banner de quem entrar agora não são vistos`); janela.avisou = true; }
    return Promise.resolve(null);
  }
  janela.n++;
  const p = (async () => {
    try {
      const prof = await user.fetchProfile();
      const d = { bio: prof?.content ?? null, banner: prof?.banner ?? prof?.background ?? null };
      lembrarPerfil(userId, d, agora);
      return d;
    } catch (e) { registrarErro("PERFIL:buscar", e); return null; }
    finally { buscando.delete(userId); }
  })();
  buscando.set(userId, p);
  return p;
}

export function valoresDe({ user = null, member = null, perfil = null } = {}) {
  const v = { nome: user?.displayName ?? null, status: user?.status?.text ?? null, avatar: user?.avatar ?? null };
  if (member) { v.apelido = member.nickname ?? null; v.avatarServidor = member.avatar ?? null; }
  if (perfil) { v.bio = perfil.bio ?? null; v.banner = perfil.banner ?? null; }
  return v;
}

// ── O texto ─────────────────────────────────────────────────────────────────
const MOTIVO_TEXTO = { sexual: "texto sexual", odio: "texto de ódio", golpe: "texto de golpe" };
export function notaDoTexto(texto) {
  const r = analisarConteudo(texto, { rate: 1, repetidas: 1 });
  const f = r.features ?? {};
  const categoria = r.grave || f.adulto ? "sexual"
    : f.odio || f.simbolo_odio || f.injuria || f.ameaca ? "odio"
      : f.scam || f.oferta || f.link_filehost || f.link_encurtador || f.conj_golpe_dados ? "golpe" : null;
  if (!categoria) return { categoria: null, nota: 0, motivos: [] };
  return { categoria, nota: Math.min(1, Math.max(r.grave ? 0.95 : 0, r.nota / 10)), motivos: [MOTIVO_TEXTO[categoria]] };
}

// Para o dono entender o caso sem ver a arte: só números e o idioma do texto comum que a
// acompanha — nunca o texto livre (revisão P3a: antes ia o `textoSolto` inteiro).
export const resumoArte = (arte) => {
  const idioma = idiomaDoTexto(arte.textoSolto);
  return `arte em texto: ${arte.linhasArte} linhas, ${arte.desenhos.length} desenho(s), ${arte.conjunto.w}×${arte.conjunto.h} pontos`
    + (idioma ? ` · idioma: ${idioma}` : "");
};

// O dono já julgou uma arte parecida? Pelo conjunto (hash + impressão do texto) e por desenho.
async function herancaDaArte(arte, texto) {
  const consultas = [{ hash: arte.conjunto.dhash, texto }, ...arte.desenhos.map((d) => ({ hash: d.dhash }))];
  let errou = false;
  for (const q of consultas) {
    const v = await cz.vereditoParecido({ tipo: "perfil-texto", categoria: categoriaDeTexto("arte-texto"), ...q });
    if (v === "certo") return "certo";
    if (v === "errou") errou = true;
  }
  return errou ? "errou" : null;
}

// → { achado, visto }. `achado`: o que vai à decisão; `visto`: o que pode ir à amostra.
export async function avaliarTexto(campo, texto) {
  const t = String(texto ?? "");
  if (!t.trim()) return { achado: null, visto: null };
  const arte = detectarArte(t);
  if (arte) {
    // a arte em si nunca vai para a fila nem para a staff: o resumo, o hash e a impressão
    const evidencia = { trecho: resumoArte(arte), texto: t, hash: hashUtil(arte.conjunto.dhash) ? arte.conjunto.dhash : null };
    const k = arteConhecida(arte, conhecidos);
    if (k) return { achado: { campo, tipo: "perfil-texto", categoria: categoriaDeTexto(k.categoria), nota: 1, motivos: ["arte em texto conhecida"], conhecido: k.id, herdado: null, evidencia }, visto: null };
    const herdado = await herancaDaArte(arte, t);
    if (herdado === "errou") return { achado: null, visto: null };
    return { achado: { campo, tipo: "perfil-texto", categoria: categoriaDeTexto("arte-texto"), nota: 0.6, motivos: ["arte em texto"], herdado, evidencia }, visto: null };
  }
  const n = notaDoTexto(t);
  const cat = n.categoria ? categoriaDeTexto(n.categoria) : null;
  const evidencia = { trecho: t.slice(0, 300), texto: t };
  // sem categoria: só o que o dono apontou (`&caso perdeu`, que vale para qualquer categoria)
  const herdado = await cz.vereditoParecido({ tipo: "perfil-texto", categoria: cat ?? "perdeu", texto: t });
  const visto = { campo, tipo: "perfil-texto", categoria: cat ?? categoriaDeTexto("sexual"), nota: n.nota, evidencia };
  if (herdado === "errou") return { achado: null, visto };
  if (!cat && herdado !== "certo") return { achado: null, visto };
  return {
    achado: { campo, tipo: "perfil-texto", categoria: cat ?? "perdeu", nota: n.nota, motivos: cat ? n.motivos : ["confirmado pelo dono do bot"], herdado, evidencia },
    visto,
  };
}

// ── A imagem ────────────────────────────────────────────────────────────────
// A impressão de uma imagem para a fila é o próprio hash (ou o arquivo): a
// descrição do modelo vai como trecho, mas não pode virar a "impressão" (duas
// imagens diferentes com descrições parecidas não são a mesma imagem).
const impressaoDaImagem = (arquivo, hash) => (hash ? `dhash:${hash}` : `arquivo:${arquivo.id}`);
// `falhou: true` = a análise não aconteceu (modelo fora do ar, fila cheia, erro, arquivo
// ilegível): a parte conta como "não sei" — nunca como "trocou e passou limpo".
export async function avaliarImagem(campo, valor) {
  const arquivo = av.arquivoDe(valor, TAG[campo] ?? "avatars");
  if (!arquivo) return { achado: null, visto: null, falhou: true };
  const h = await av.hashDaFoto(arquivo);
  const hash = hashUtil(h) ? h : null;
  const evidencia = { link: arquivo.url, hash, impressao: impressaoDaImagem(arquivo, hash) };
  const base = { campo, tipo: "perfil-imagem" };
  // 1. conhecido proibido (a lista do repositório)
  const k = hash ? conhecidos.find((c) => c.tipo === "perfil-imagem" && (c.dhash ?? []).some((r) => parecido(r, hash))) : null;
  if (k) return { achado: { ...base, categoria: k.categoria, nota: 1, motivos: ["confirmado pelo dono do bot"], conhecido: k.id, herdado: null, evidencia }, visto: null };
  // 2. o que o dono já julgou, antes do modelo
  if (hash) {
    let errou = false;
    for (const categoria of CATEGORIAS_IMAGEM) {
      const v = await cz.vereditoParecido({ tipo: "perfil-imagem", categoria, hash });
      if (v === "certo") return { achado: { ...base, categoria, nota: null, motivos: ["confirmado pelo dono do bot"], herdado: "certo", evidencia }, visto: null };
      if (v === "errou") errou = true;
    }
    if (errou) return { achado: null, visto: null };   // o dono disse que algo assim não é violação: nem gasta o modelo
  }
  // 3. o modelo de visão
  const r = await av.analisarFoto(arquivo);
  if (!r) return { achado: null, visto: null, falhou: true };
  const comTrecho = { ...evidencia, trecho: String(r.descricao ?? "").slice(0, 300) };
  const visto = { ...base, categoria: r.categoria ?? "sexual", nota: r.nota ?? 0, evidencia: comTrecho };
  if (!r.categoria) return { achado: null, visto };
  return {
    achado: { ...base, categoria: r.categoria, nota: r.nota, motivos: r.motivos, grave: !!r.grave, descricao: String(r.descricao ?? ""), herdado: null, evidencia: comTrecho },
    visto,
  };
}

// Uma vez por evento (vale para todos os servidores da pessoa). `incertos`: as partes que
// não deu para analisar (imagem sem o modelo de visão, ou a análise falhou) — "não sei".
export async function avaliarValores(valores) {
  const achados = [], vistos = [], incertos = [];
  for (const [campo, valor] of Object.entries(valores ?? {})) {
    if (vazio(valor)) continue;   // apagou a parte: limpa
    let r = null;
    if (CAMPOS_TEXTO.includes(campo)) r = await avaliarTexto(campo, valor);
    else if (CAMPOS_IMAGEM.includes(campo)) r = av.temVisao() ? await avaliarImagem(campo, valor) : { falhou: true };
    else continue;
    if (r?.falhou) incertos.push(campo);
    if (r?.achado) achados.push(r.achado);
    if (r?.visto) vistos.push(r.visto);
  }
  return { achados, vistos, incertos };
}

// ── A fila do dono: um caso por pessoa, parte e conteúdo (6 h) ──────────────
const registrados = new Map();   // chave → quando
const REGISTRO_MS = 6 * 3600_000;
const chaveDo = (userId, d) => `${userId}:${d.campo}:${d.evidencia?.hash ?? d.evidencia?.impressao ?? sha256(d.evidencia?.texto ?? d.evidencia?.link ?? "")}`;
async function registrarUmaVez(d, { serverId, userId, acao, origem = "detector", certeza = d.certeza }, agora = Date.now()) {
  for (const [k, t] of registrados) if (agora - t > REGISTRO_MS) registrados.delete(k);
  const chave = `${origem}:${chaveDo(userId, d)}`;
  if (registrados.has(chave)) return { repetido: true };
  const r = await cz.registrar({
    tipo: d.tipo, categoria: d.categoria, serverId, userId, canalId: null, msgId: null, origem,
    certeza, nota: typeof d.nota === "number" ? d.nota : null, acao, evidencia: d.evidencia, detector: `perfil:${d.campo}`,
  });
  if (r) { registrados.set(chave, agora); if (registrados.size > 5000) registrados.delete(registrados.keys().next().value); }
  return r;
}

// ── Num servidor ────────────────────────────────────────────────────────────
// `valores`: as partes checadas neste evento (uma parte com valor null foi
// apagada — conta como "trocou" para devolver a voz). Devolve o que fez.
// `limpas`: partes que o dono já disse (❌) que não são violação, com o mesmo conteúdo de agora
// (ver `aoJulgar`) — contam como trocadas e limpas, seja o que for que a análise diga.
export async function aplicarNoServidor({ ctx, server, userId, aval: avalBruta, valores, origem, limpas = null }) {
  const L = idiomaDe(ctx);
  const aval = limpas?.size ? {
    achados: (avalBruta?.achados ?? []).filter((a) => !limpas.has(a.campo)),
    vistos: (avalBruta?.vistos ?? []).filter((v) => !limpas.has(v.campo)),
    incertos: (avalBruta?.incertos ?? []).filter((c) => !limpas.has(c)),
  } : avalBruta;
  const decididos = [];
  for (const a of aval?.achados ?? []) {
    const certeza = a.conhecido || a.herdado === "certo" ? "alta"
      : cz.certezaDe(a.nota, await cz.limiarAlta(a.categoria, cz.PADRAO.alta, server.id));
    const decisao = cz.decidir({ certeza, herdado: a.conhecido ? null : a.herdado, punivel: PUNIVEIS.has(categoriaBase(a.categoria)) || !!a.conhecido });
    decididos.push({ ...a, certeza, decisao });
  }
  const punir = decididos.filter((d) => d.decisao === "punir");
  const paraFila = decididos.filter((d) => d.decisao === "fila");
  const campos = Object.keys(valores ?? {});
  const cfg = ctx.config?.automod?.antiAvatar ?? {};
  let antes = db.perfilSilencioLer(server.id, userId);
  // a staff já tirou o silêncio (`&automod sentinela liberar`, `&untimeout`): o registro não vale mais
  if (antes && !db.estaSilenciado(server.id, userId)) { db.perfilSilencioTirar(server.id, userId); antes = null; }
  // (31 out 2026, P3a, revisão) só sai do silêncio a parte que foi trocada E reanalisada com
  // sucesso E limpa (nada para punir nem para a fila). Análise que falhou = "não sei": fica.
  const incertos = new Set(aval?.incertos ?? []);
  const comAchado = new Set(decididos.filter((d) => d.decisao !== "nada").map((d) => d.campo));
  const limpos = campos.filter((c) => !incertos.has(c) && !comAchado.has(c));
  const restantes = antes ? antes.campos.filter((c) => !limpos.includes(c)) : [];
  let acao = null, feito = null, ok = false, ate = null, devolveu = false;

  if (punir.length) {
    acao = av.acaoDoAvatar(cfg);
    const motivo = av.motivoDaPunicao(punir, L);
    ({ feito, ok, ate = null } = await av.aplicarAcao({ ctx, server, userId, acao, motivo, L }));
    if (ok && acao === "silenciar") db.perfilSilencioGravar(server.id, userId, [...restantes, ...punir.map((p) => p.campo)], motivo, Date.now(), ate);
    const alertouEm = await av.alertar(ctx, { server, userId, origem, achados: punir, feito, acao, L });
    await av.registrarNoLog(ctx, { userId, origem, motivo, feito, alertouEm, L });
  } else if (antes && restantes.length < antes.campos.length) {
    // trocou (ou apagou) o que tinha apitado, e o novo passou: a voz volta quando nada mais falta
    if (restantes.length) db.perfilSilencioGravar(server.id, userId, restantes, antes.motivo, antes.criadoEm);
    else devolveu = await devolverVoz({ ctx, server, userId, L, fim: antes.fimAplicado ?? null });
  }

  // a fila do dono: o punido (para medir o acerto) e o de certeza média/baixa (para julgar)
  const semFila = [];
  for (const d of [...punir, ...paraFila]) {
    const acaoCaso = d.decisao !== "punir" ? "nenhuma" : ok && acao !== "alertar" ? "punido" : "alertado";
    const r = await registrarUmaVez(d, { serverId: server.id, userId, acao: acaoCaso });
    if (r === null && d.decisao === "fila" && d.certeza === "media") semFila.push(d);
  }
  // sem a fila (pacote sem ela, ou ela falhou): o caminho antigo — a staff confere, ninguém é punido
  if (semFila.length) {
    feito = L === "es" ? "nada — revisa el perfil" : L === "en" ? "nothing — check the profile" : "nada — confira o perfil";
    await av.alertar(ctx, { server, userId, origem, achados: semFila, feito, acao: "alertar", L, conferir: true });
  }
  // a amostra aleatória (a fila decide): só do que não apitou nada
  if (!decididos.length && aval?.vistos?.length && await cz.amostrar({ serverId: server.id })) {
    const v = aval.vistos[Math.floor(Math.random() * aval.vistos.length)];
    await registrarUmaVez(v, { serverId: server.id, userId, acao: "nenhuma", origem: "amostra", certeza: "baixa" });
  }
  console.log(`[PERFIL] ${userId} em ${server.id} (${origem}; ${campos.join(",") || "—"}): ${punir.length ? `PUNIU [${punir.map((p) => `${p.campo}:${p.categoria}`).join(", ")}]` : paraFila.length ? `fila [${paraFila.map((p) => `${p.campo}:${p.categoria}:${p.certeza}`).join(", ")}]` : "ok"}${devolveu ? " · voz devolvida" : ""}`);
  return {
    apitou: punir.length > 0,
    suspeita: !punir.length && paraFila.some((d) => d.certeza === "media"),
    acao: punir.length ? acao : paraFila.length ? "fila" : null,
    feito, motivos: (punir.length ? punir : paraFila).flatMap((d) => d.motivos), achados: decididos, devolveu,
  };
}

// (31 out 2026, P3a, revisão) Só tira o timeout que o PERFIL pôs: o fim do timeout atual do
// membro tem de estar a ±5 min do `fim` aplicado. Outro (a staff silenciou depois) fica, e o
// registro do silêncio dela (sair e voltar reaplica) também.
async function devolverVoz({ ctx, server, userId, L, fim = null }) {
  let r;
  try { r = await tirarTimeout(server, userId, { soSeAte: fim }); }
  catch (e) { registrarErro("PERFIL:devolver", e); return false; }
  db.perfilSilencioTirar(server.id, userId);
  if (r?.outro) {
    console.log(`[PERFIL] ${userId} em ${server.id}: o silêncio do perfil acabou, mas o timeout atual é outro (da staff) — fica`);
    return false;
  }
  db.silenciarAte(server.id, userId, 0); db.definirSilenciado(server.id, userId, false);
  await log.registrar(ctx, "punicoes", {
    titulo: "🔊 Silêncio do perfil acabou",
    descricao: `<@${userId}> trocou o que tinha apitado no perfil.`,
    en: { titulo: "🔊 Profile timeout lifted", descricao: `<@${userId}> changed what was flagged on their profile.` },
    es: { titulo: "🔊 Terminó el silencio del perfil", descricao: `<@${userId}> cambió lo que se había detectado en su perfil.` },
  });
  return true;
}

// Uma checagem num servidor (o perfil já em `valores`).
export async function verificarPerfil({ ctx, server, userId, member = null, user = null, valores, origem = "entrada" }) {
  if (!ligado(ctx?.config) || !server || !userId) return null;
  if (av.isento(ctx, server, userId, member, user)) return null;
  const aval = await avaliarValores(valores);
  return aplicarNoServidor({ ctx, server, userId, aval, valores, origem });
}

// A mesma troca em todo servidor da Judy onde a pessoa está — pelo cache de
// membros; a avaliação é uma só.
async function checarEmTodos({ user, userId, valores, client, criarContexto, origem, limpas = null }) {
  const alvos = [];
  for (const server of [...(client?.servers?.values?.() ?? [])]) {
    const member = client?.serverMembers?.getByKey?.({ server: server.id, user: userId }) ?? null;
    if (!member) continue;   // não está no cache deste servidor: não é checado aqui (sem fetchMember)
    const ctx = criarContexto(server.id);
    if (!ligado(ctx?.config) || av.isento(ctx, server, userId, member, user)) continue;
    alvos.push({ server, ctx });
  }
  if (!alvos.length) return [];
  const aval = await avaliarValores(valores);
  const feitos = [];
  for (const { server, ctx } of alvos) feitos.push(await aplicarNoServidor({ ctx, server, userId, aval, valores, origem, limpas }));
  return feitos;
}

// ── Os eventos ──────────────────────────────────────────────────────────────
// Entrou: o perfil inteiro (bio e banner com uma busca por pessoa, guardada 6 h).
export async function aoEntrar(member, ctx) {
  const serverId = member?.id?.server, userId = member?.id?.user;
  if (!serverId || !userId || !ligado(ctx?.config)) return null;
  const server = member.server ?? ctx.client?.servers?.get?.(serverId) ?? await ctx.client?.servers?.fetch?.(serverId).catch(() => null);
  const user = member.user ?? ctx.client?.users?.get?.(userId) ?? await ctx.client?.users?.fetch?.(userId).catch(() => null);
  if (!server || av.isento(ctx, server, userId, member, user)) return null;
  const perfil = await buscarPerfil(user);
  return verificarPerfil({ ctx, server, userId, member, user, origem: "entrada", valores: valoresDe({ user, member, perfil }) });
}

// Trocou a foto ou o apelido DESTE servidor (o evento também chega por cargo: sem troca, nada).
export async function aoTrocarNoServidor(member, anterior, ctx) {
  const valores = {};
  if (idDe(member?.avatar) !== idDe(anterior?.avatar)) valores.avatarServidor = member?.avatar ?? null;
  if ((member?.nickname ?? null) !== (anterior?.nickname ?? null)) valores.apelido = member?.nickname ?? null;
  if (!Object.keys(valores).length) return null;
  const serverId = member?.id?.server, userId = member?.id?.user;
  if (!serverId || !userId || !ligado(ctx?.config)) return null;
  const server = member.server ?? ctx.client?.servers?.get?.(serverId) ?? await ctx.client?.servers?.fetch?.(serverId).catch(() => null);
  return verificarPerfil({ ctx, server, userId, member, user: member.user ?? null, valores, origem: "troca" });
}

// Trocou nome, status ou foto do PERFIL (o userUpdate da stoat.js). A presença
// (online/offline) também chega por aqui — sem troca, nada.
export async function aoTrocarUsuario(user, anterior, { client, criarContexto }) {
  const valores = {};
  if ((user?.displayName ?? null) !== (anterior?.displayName ?? null)) valores.nome = user?.displayName ?? null;
  if ((user?.status?.text ?? null) !== (anterior?.status?.text ?? null)) valores.status = user?.status?.text ?? null;
  if (idDe(user?.avatar) !== idDe(anterior?.avatar)) valores.avatar = user?.avatar ?? null;
  const userId = user?.id ?? user?._id;
  if (!userId || !Object.keys(valores).length) return [];
  return checarEmTodos({ user, userId, valores, client, criarContexto, origem: "troca" });
}

// O evento CRU UserUpdate: a bio (`profile.content`) e o banner (`profile.background`),
// que a stoat.js joga fora. Só o que mudou em relação ao guardado é checado.
export async function aoEventoCru(ev, { client, criarContexto }) {
  if (ev?.type !== "UserUpdate" || !ev.id) return [];
  const p = ev.data?.profile && typeof ev.data.profile === "object" ? ev.data.profile : null;
  const limpar = Array.isArray(ev.clear) ? ev.clear : [];
  const novo = {};
  if (p && "content" in p) novo.bio = p.content ?? null;
  if (p && "background" in p) novo.banner = p.background ?? null;
  if (limpar.includes("ProfileContent")) novo.bio = null;
  if (limpar.includes("ProfileBackground")) novo.banner = null;
  const antes = perfilGuardado(ev.id) ?? {};
  const valores = {};
  if ("bio" in novo && !("bio" in antes && (antes.bio ?? null) === novo.bio)) valores.bio = novo.bio;
  if ("banner" in novo && !("banner" in antes && idDe(antes.banner) === idDe(novo.banner))) valores.banner = novo.banner;
  if (Object.keys(novo).length) lembrarPerfil(ev.id, novo);
  if (!Object.keys(valores).length) return [];
  const user = client?.users?.get?.(ev.id) ?? { id: ev.id };
  return checarEmTodos({ user, userId: ev.id, valores, client, criarContexto, origem: "troca" });
}

// O dono julgou um caso de perfil e o bot tinha feito o contrário — é violação e
// não puniu (✅ num caso de certeza média, ❌ na amostra, `&caso perdeu`), ou puniu
// e não era (❌ num punido): o perfil ATUAL da pessoa é revisto. O caso julgado já
// está no banco da fila — o que ainda for parecido herda o veredito: o "certo"
// pune, o "errou" devolve a voz; o que a pessoa já trocou fica como está.
// (31 out 2026, P3a, revisão) A pessoa ainda silenciada pelo perfil no servidor do caso também é
// revista, mesmo que o bot não tenha punido aquele caso: o ❌ do dono (não é violação) numa parte
// que estava "não sei"/média, com o mesmo conteúdo de agora, conta como limpa — e, se todas as
// partes que apitaram estão limpas, a voz volta (só o timeout do perfil: `soSeAte`). O ✅ mantém.
export async function aoJulgar(info, { client, criarContexto }) {
  if (!String(info?.tipo ?? "").startsWith("perfil-") || !info.userId) return [];
  const punido = info.acao === "punido";
  const silenciado = !!(info.serverId && db.perfilSilencioLer(info.serverId, info.userId));
  if (!!info.violacao === punido && !silenciado) return [];   // o bot já tinha feito o certo
  const user = client?.users?.get?.(info.userId) ?? null;
  if (!user) return [];
  const p = await buscarPerfil(user);
  const valores = valoresDe({ user, perfil: p });
  const limpas = new Set();
  const campo = String(info.detector ?? "").startsWith("perfil:") ? String(info.detector).slice(7) : null;
  if (silenciado && !info.violacao && campo && campo in valores && await mesmoConteudo(campo, valores[campo], info.evidencia)) limpas.add(campo);
  return checarEmTodos({ user, userId: info.userId, valores, client, criarContexto, origem: "revisao", limpas });
}
// O que o dono julgou é o que está no perfil agora? Imagem: o mesmo arquivo (link) ou o mesmo hash;
// texto: a herança pela impressão já cuida (o ❌ vira "errou" no `avaliarTexto`).
async function mesmoConteudo(campo, valor, ev = {}) {
  if (!CAMPOS_IMAGEM.includes(campo) || vazio(valor)) return false;
  const arquivo = av.arquivoDe(valor, TAG[campo] ?? "avatars");
  if (!arquivo) return false;
  if (ev?.link && ev.link === arquivo.url) return true;
  if (!ev?.hash) return false;
  const h = await av.hashDaFoto(arquivo);
  return !!(hashUtil(h) && parecido(ev.hash, h));
}

// ── O `&caso perdeu` da fila: a evidência do perfil (com o hash) ────────────
export async function evidenciaDoPerfil({ client, userId, parte }) {
  const user = client?.users?.get?.(userId) ?? await client?.users?.fetch?.(userId).catch(() => null);
  if (!user) return null;
  const daImagem = async (valor, tag) => {
    const arq = av.arquivoDe(valor, tag);
    if (!arq) return null;
    const h = await av.hashDaFoto(arq);
    const hash = hashUtil(h) ? h : null;
    return { link: arq.url, hash, impressao: impressaoDaImagem(arq, hash) };
  };
  if (parte === "avatar") return daImagem(user.avatar, "avatars");
  const p = await buscarPerfil(user);
  if (parte === "banner") return daImagem(p?.banner, "backgrounds");
  const bio = String(p?.bio ?? "");
  if (!bio.trim()) return null;
  const arte = detectarArte(bio);
  return arte ? { trecho: resumoArte(arte), texto: bio, hash: hashUtil(arte.conjunto.dhash) ? arte.conjunto.dhash : null }
    : { trecho: bio.slice(0, 300), texto: bio };
}
export async function evidenciaDoLink({ link }) {
  const h = await av.hashDaFoto({ id: `link:${link}`, url: link });
  return hashUtil(h) ? { hash: h } : null;
}

// ── Ligar (main.js, uma vez): o evento cru e os ganchos da fila ─────────────
let ligadoA = null;
export async function ligar({ client, criarContexto }) {
  if (!client || ligadoA === client) return false;
  ligadoA = client;
  client.events?.on?.("event", (ev) => {
    if (ev?.type !== "UserUpdate") return;
    aoEventoCru(ev, { client, criarContexto }).catch((e) => registrarErro("PERFIL:evento", e));
  });
  const f = await cz.fila();
  f?.configurarPerfil?.({ evidenciaDoPerfil, evidenciaDoLink });
  f?.quandoJulgado?.((info) => aoJulgar(info, { client, criarContexto }));
  return true;
}

// Só para testes
export function _zerar() { perfis.clear(); buscando.clear(); registrados.clear(); janela = { t: 0, n: 0, avisou: false }; ligadoA = null; }
