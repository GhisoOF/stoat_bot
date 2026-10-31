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
// alta → age (o padrão: silenciar ATÉ TROCAR); média/baixa → (31 out 2026, P3a, staff)
// alerta à STAFF do servidor com ✅/❌ (casos-staff.js), sem punir — antes ia à fila do
// dono. O que a staff DESTE servidor já julgou (✅/❌) vale antes da nota, só aqui.
// A amostra do dono (revisao.js) só mede: nunca age sobre ninguém.
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
import { maisParecido } from "./revisao.js";
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
// categorias que a staff do servidor pode ter julgado numa imagem (a herança, por servidor)
const CATEGORIAS_IMAGEM = ["sexual", "odio", "gore"];
// o motivo de um achado que a staff deste servidor já confirmou num caso parecido
const MOTIVO_STAFF = "confirmado pela staff";
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

// → { achado, visto, consultas }. `achado`: o que vai à decisão; `visto`: o que pode ir à
// amostra; `consultas`: o que perguntar à herança de cada servidor (casos-staff.js).
// (31 out 2026, P3a, staff) antes a herança (do dono) era consultada aqui, uma vez para todos
// os servidores; agora é por servidor, em `aplicarNoServidor`.
export async function avaliarTexto(campo, texto) {
  const t = String(texto ?? "");
  if (!t.trim()) return { achado: null, visto: null, consultas: [] };
  const arte = detectarArte(t);
  if (arte) {
    // a arte em si nunca vai para a fila nem para a staff: o resumo, o hash e a impressão
    const evidencia = { trecho: resumoArte(arte), texto: t, hash: hashUtil(arte.conjunto.dhash) ? arte.conjunto.dhash : null };
    const k = arteConhecida(arte, conhecidos);
    if (k) return { achado: { campo, tipo: "perfil-texto", categoria: categoriaDeTexto(k.categoria), nota: 1, motivos: ["arte em texto conhecida"], conhecido: k.id, herdado: null, evidencia }, visto: null, consultas: [] };
    const categoria = categoriaDeTexto("arte-texto");
    // (revisão staff) a herança da staff numa arte só casa pelo sha256 EXATO do texto normalizado (a
    // tolerância do dHash fica só para a lista CONHECIDOS): o caso da staff guarda só esse sha256
    const exato = arte.impressoes?.[0] ?? null;
    return {
      achado: { campo, tipo: "perfil-texto", categoria, nota: 0.6, motivos: ["arte em texto"], herdado: null, evidencia, evidenciaStaff: { hash: exato } }, visto: null,
      consultas: exato ? [{ categoria, hash: exato }] : [],
    };
  }
  const n = notaDoTexto(t);
  const cat = n.categoria ? categoriaDeTexto(n.categoria) : null;
  const evidencia = { trecho: t.slice(0, 300), texto: t };
  const visto = { campo, tipo: "perfil-texto", categoria: cat ?? categoriaDeTexto("sexual"), nota: n.nota, evidencia };
  if (!cat) return { achado: null, visto, consultas: [] };
  return { achado: { campo, tipo: "perfil-texto", categoria: cat, nota: n.nota, motivos: n.motivos, herdado: null, evidencia }, visto, consultas: [{ categoria: cat, texto: t }] };
}

// ── A imagem ────────────────────────────────────────────────────────────────
// A impressão de uma imagem para a fila é o próprio hash (ou o arquivo): a
// descrição do modelo vai como trecho, mas não pode virar a "impressão" (duas
// imagens diferentes com descrições parecidas não são a mesma imagem).
const impressaoDaImagem = (arquivo, hash) => (hash ? `dhash:${hash}` : `arquivo:${arquivo.id}`);
// `falhou: true` = a análise não aconteceu (modelo fora do ar, fila cheia, erro, arquivo
// ilegível): a parte conta como "não sei" — nunca como "trocou e passou limpo".
// (31 out 2026, P3a, staff) antes, o que o dono já tinha julgado era consultado ANTES do
// modelo (para todos os servidores); agora a herança é por servidor (`consultas`), depois.
export async function avaliarImagem(campo, valor) {
  const arquivo = av.arquivoDe(valor, TAG[campo] ?? "avatars");
  if (!arquivo) return { achado: null, visto: null, falhou: true, consultas: [] };
  const h = await av.hashDaFoto(arquivo);
  const hash = hashUtil(h) ? h : null;
  const evidencia = { link: arquivo.url, hash, impressao: impressaoDaImagem(arquivo, hash) };
  const base = { campo, tipo: "perfil-imagem" };
  // 1. conhecido proibido (a lista do repositório, global)
  const k = hash ? conhecidos.find((c) => c.tipo === "perfil-imagem" && (c.dhash ?? []).some((r) => parecido(r, hash))) : null;
  if (k) return { achado: { ...base, categoria: k.categoria, nota: 1, motivos: ["já conhecido (lista do bot)"], conhecido: k.id, herdado: null, evidencia }, visto: null, consultas: [] };
  const consultas = CATEGORIAS_IMAGEM.map((categoria) => ({ categoria, hash, impressao: evidencia.impressao }));
  // 2. o modelo de visão
  const r = await av.analisarFoto(arquivo);
  if (!r) return { achado: null, visto: null, falhou: true, consultas, evidencia };
  const comTrecho = { ...evidencia, trecho: String(r.descricao ?? "").slice(0, 300) };
  const visto = { ...base, categoria: r.categoria ?? "sexual", nota: r.nota ?? 0, evidencia: comTrecho };
  if (!r.categoria) return { achado: null, visto, consultas, evidencia: comTrecho };
  return {
    achado: { ...base, categoria: r.categoria, nota: r.nota, motivos: r.motivos, grave: !!r.grave, descricao: String(r.descricao ?? ""), herdado: null, evidencia: comTrecho },
    visto, consultas,
  };
}

// Uma vez por evento (vale para todos os servidores da pessoa). `incertos`: as partes que
// não deu para analisar (imagem sem o modelo de visão, ou a análise falhou) — "não sei".
// `consultas`: por parte, o que perguntar à herança de cada servidor.
export async function avaliarValores(valores) {
  const achados = [], vistos = [], incertos = [], consultas = [];
  for (const [campo, valor] of Object.entries(valores ?? {})) {
    if (vazio(valor)) continue;   // apagou a parte: limpa
    let r = null;
    if (CAMPOS_TEXTO.includes(campo)) r = await avaliarTexto(campo, valor);
    else if (CAMPOS_IMAGEM.includes(campo)) r = av.temVisao() ? await avaliarImagem(campo, valor) : { falhou: true };
    else continue;
    if (r?.falhou) incertos.push(campo);
    if (r?.achado) achados.push(r.achado);
    if (r?.visto) vistos.push(r.visto);
    if (r?.consultas?.length) {
      const tipo = CAMPOS_IMAGEM.includes(campo) ? "perfil-imagem" : "perfil-texto";
      consultas.push({ campo, tipo, lista: r.consultas, evidencia: r.achado?.evidencia ?? r.visto?.evidencia ?? r.evidencia ?? {} });
    }
  }
  return { achados, vistos, incertos, consultas };
}

// A herança DESTE servidor (o que a staff dele já julgou): o ✅ vale antes do ❌
async function herancaNoServidor(lista, serverId) {
  let errou = false;
  for (const q of lista) {
    const v = await cz.vereditoParecido({ ...q, serverId });
    if (v === "certo") return { veredito: "certo", categoria: q.categoria };
    if (v === "errou") errou = true;
  }
  return errou ? { veredito: "errou" } : null;
}
// Os achados deste servidor: a herança acrescenta (✅) ou tira (❌) — a lista de conhecidos
// (global) não muda. Uma parte que a staff disse ❌ e o modelo não conseguiu ver conta como limpa.
async function comHeranca(aval, serverId) {
  const achados = [...(aval?.achados ?? [])];
  const incertos = new Set(aval?.incertos ?? []);
  for (const c of aval?.consultas ?? []) {
    const h = await herancaNoServidor(c.lista, serverId);
    if (!h) continue;
    const i = achados.findIndex((a) => a.campo === c.campo);
    if (i >= 0 && achados[i].conhecido) continue;
    if (h.veredito === "errou") { if (i >= 0) achados.splice(i, 1); incertos.delete(c.campo); continue; }
    if (i >= 0) achados[i] = { ...achados[i], herdado: "certo", motivos: [...new Set([...(achados[i].motivos ?? []), MOTIVO_STAFF])] };
    else achados.push({ campo: c.campo, tipo: c.tipo, categoria: h.categoria, nota: null, motivos: [MOTIVO_STAFF], herdado: "certo", evidencia: c.evidencia });
    incertos.delete(c.campo);
  }
  return { achados, vistos: aval?.vistos ?? [], incertos: [...incertos] };
}

// ── A amostra do dono e o alerta à staff: um por pessoa, parte e conteúdo (6 h) ──
const registrados = new Map();   // chave → quando
const REGISTRO_MS = 6 * 3600_000;
const chaveDo = (userId, d) => `${userId}:${d.campo}:${d.evidencia?.hash ?? d.evidencia?.impressao ?? sha256(d.evidencia?.texto ?? d.evidencia?.link ?? "")}`;
function umaVez(chave, agora) {
  for (const [k, t] of registrados) if (agora - t > REGISTRO_MS) registrados.delete(k);
  if (registrados.has(chave)) return false;
  registrados.set(chave, agora);
  if (registrados.size > 5000) registrados.delete(registrados.keys().next().value);
  return true;
}
async function registrarUmaVez(d, { serverId, userId, acao, origem = "detector", certeza = d.certeza }, agora = Date.now()) {
  if (!umaVez(`${origem}:${chaveDo(userId, d)}`, agora)) return { repetido: true };
  return cz.registrar({
    tipo: d.tipo, categoria: d.categoria, serverId, userId, canalId: null, msgId: null, origem,
    certeza, nota: typeof d.nota === "number" ? d.nota : null, acao, evidencia: d.evidencia, detector: `perfil:${d.campo}`,
  });
}
// O que o ✅ da staff faz, no alerta (a ação do módulo)
const O_QUE_FAZ = {
  silenciar: ["silenciar até trocar", "silence until changed", "silenciar hasta que cambie"],
  expulsar: ["expulsar", "kick", "expulsar"], banir: ["banir", "ban", "banear"],
  alertar: ["registrar que é violação", "record it as a violation", "registrar que es una infracción"],
};
// O caso duvidoso vai à staff deste servidor (uma vez por pessoa, parte e conteúdo, a cada 6 h)
async function alertarDuvida({ ctx, server, userId, origem, d, L }, agora = Date.now()) {
  if (!umaVez(`staff:${server.id}:${chaveDo(userId, d)}`, agora)) return { repetido: true };
  const acao = av.acaoDoAvatar(ctx.config?.automod?.antiAvatar ?? {});
  const feito = L === "es" ? "nada todavía — decide el staff" : L === "en" ? "nothing yet — the staff decides" : "nada ainda — a staff decide";
  const embed = av.embedDoAlerta(ctx, { server, userId, origem, achados: [d], feito, acao, L, conferir: true });
  return cz.alertarStaff({ ctx, server, embed, oQueFaz: O_QUE_FAZ[acao],
    caso: { tipo: d.tipo, categoria: d.categoria, userId, nota: typeof d.nota === "number" ? d.nota : null, parte: d.campo, evidencia: d.evidenciaStaff ?? d.evidencia } });
}

// ── Num servidor ────────────────────────────────────────────────────────────
// `valores`: as partes checadas neste evento (uma parte com valor null foi
// apagada — conta como "trocou" para devolver a voz). Devolve o que fez.
// `limpas`: partes que a staff deste servidor disse (❌) que não são violação, com o mesmo
// conteúdo de agora (ver `decisaoDaStaff`) — contam como trocadas e limpas.
export async function aplicarNoServidor({ ctx, server, userId, aval: avalBruta, valores, origem, limpas = null }) {
  const L = idiomaDe(ctx);
  const herdada = await comHeranca(avalBruta, server.id);
  const aval = limpas?.size ? {
    achados: herdada.achados.filter((a) => !limpas.has(a.campo)),
    vistos: herdada.vistos.filter((v) => !limpas.has(v.campo)),
    incertos: herdada.incertos.filter((c) => !limpas.has(c)),
  } : herdada;
  const decididos = [];
  for (const a of aval?.achados ?? []) {
    const certeza = a.conhecido || a.herdado === "certo" ? "alta"
      : cz.certezaDe(a.nota, await cz.limiarAlta(a.categoria, cz.PADRAO.alta, server.id));
    const decisao = cz.decidir({ certeza, herdado: a.conhecido ? null : a.herdado, punivel: PUNIVEIS.has(categoriaBase(a.categoria)) || !!a.conhecido });
    decididos.push({ ...a, certeza, decisao });
  }
  const punir = decididos.filter((d) => d.decisao === "punir");
  const paraStaff = decididos.filter((d) => d.decisao === "staff");
  const campos = Object.keys(valores ?? {});
  const cfg = ctx.config?.automod?.antiAvatar ?? {};
  let antes = db.perfilSilencioLer(server.id, userId);
  // a staff já tirou o silêncio (`&automod sentinela liberar`, `&untimeout`): o registro não vale mais
  if (antes && !db.estaSilenciado(server.id, userId)) { db.perfilSilencioTirar(server.id, userId); antes = null; }
  // (31 out 2026, P3a, revisão) só sai do silêncio a parte que foi trocada E reanalisada com
  // sucesso E limpa (nada para punir nem para a staff). Análise que falhou = "não sei": fica.
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

  // os casos duvidosos: alerta à staff deste servidor, com ✅/❌ (ninguém é punido)
  const alertados = new Set();
  for (const d of paraStaff) if ((await alertarDuvida({ ctx, server, userId, origem, d, L }))?.id) alertados.add(d);
  // a amostra do dono (a fila sorteia): o punido e o que foi à staff — só para medir o acerto
  for (const d of [...punir, ...paraStaff]) {
    const acaoCaso = d.decisao !== "punir" ? (alertados.has(d) ? "alertado" : "nenhuma") : ok && acao !== "alertar" ? "punido" : "alertado";
    await registrarUmaVez(d, { serverId: server.id, userId, acao: acaoCaso });
  }
  // a amostra aleatória (a fila decide): só do que não apitou nada
  if (!decididos.length && aval?.vistos?.length && await cz.amostrar({ serverId: server.id })) {
    const v = aval.vistos[Math.floor(Math.random() * aval.vistos.length)];
    await registrarUmaVez(v, { serverId: server.id, userId, acao: "nenhuma", origem: "amostra", certeza: "baixa" });
  }
  console.log(`[PERFIL] ${userId} em ${server.id} (${origem}; ${campos.join(",") || "—"}): ${punir.length ? `PUNIU [${punir.map((p) => `${p.campo}:${p.categoria}`).join(", ")}]` : paraStaff.length ? `staff [${paraStaff.map((p) => `${p.campo}:${p.categoria}:${p.certeza}`).join(", ")}]` : "ok"}${devolveu ? " · voz devolvida" : ""}`);
  return {
    apitou: punir.length > 0,
    suspeita: !punir.length && paraStaff.some((d) => d.certeza === "media"),
    acao: punir.length ? acao : paraStaff.length ? "staff" : null,
    feito, motivos: (punir.length ? punir : paraStaff).flatMap((d) => d.motivos), achados: decididos, devolveu,
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
// (revisão staff) Os servidores em que a pessoa está silenciada pelo perfil também entram, mesmo fora
// do cache (depois de reiniciar o cache está vazio, e o silêncio "até trocar" ficaria preso): só
// nesses há uma busca do membro — o resto continua só pelo cache.
async function membroSilenciado(server, userId) {
  try { return await server.fetchMember(userId); } catch { return null; }
}
async function checarEmTodos({ user, userId, valores, client, criarContexto, origem, limpas = null }) {
  const alvos = [];
  const silenciada = new Set(db.perfilSilencioServidores(userId));
  for (const server of [...(client?.servers?.values?.() ?? [])]) {
    let member = client?.serverMembers?.getByKey?.({ server: server.id, user: userId }) ?? null;
    if (!member && silenciada.has(server.id)) member = await membroSilenciado(server, userId);
    if (!member) continue;   // não está no cache deste servidor (nem silenciada ali): não é checado aqui
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

// ── O ✅/❌ da staff num caso duvidoso de perfil (casos-staff.js) ──────────────
// (31 out 2026, P3a, staff) Antes era o dono do bot que, pela fila, punia ou devolvia a voz
// (`aoJulgar`). Agora é a staff do servidor do caso, e só ali.
const PERMISSAO = { alertar: "ManageMessages", silenciar: "TimeoutMembers", expulsar: "KickMembers", banir: "BanMembers" };
// A permissão que a reação pede: a da ação do módulo (a mesma do comando de moderação)
export const permissaoDaStaff = (_caso, ctx) => PERMISSAO[av.acaoDoAvatar(ctx?.config?.automod?.antiAvatar ?? {})];
// O valor atual da parte, sem chamar a API por servidor: usuário (cache ou uma busca), perfil
// (bio/banner, guardado 6 h) e membro (só o cache). `ok: false` = não deu para ler.
async function valorAtual(client, serverId, userId, campo) {
  if (campo === "apelido" || campo === "avatarServidor") {
    const member = client?.serverMembers?.getByKey?.({ server: serverId, user: userId }) ?? null;
    return { ok: !!member, valor: member ? valoresDe({ member })[campo] : null };
  }
  const user = client?.users?.get?.(userId) ?? await client?.users?.fetch?.(userId).catch(() => null) ?? null;
  if (!user) return { ok: false, valor: null };
  if (campo === "bio" || campo === "banner") {
    const p = await buscarPerfil(user);
    return { ok: !!p, valor: p ? p[campo] ?? null : null };
  }
  return { ok: true, valor: valoresDe({ user })[campo] };
}
// O que a staff julgou é o que está no perfil agora? Imagem: o mesmo hash (ou o mesmo arquivo);
// texto: a mesma impressão (ou o mesmo desenho).
async function mesmoConteudo(campo, valor, caso) {
  if (vazio(valor)) return false;
  const ref = [{ hash: caso.hash ?? null, impressao: caso.impressao ?? null }];
  if (CAMPOS_IMAGEM.includes(campo)) {
    const arquivo = av.arquivoDe(valor, TAG[campo] ?? "avatars");
    if (!arquivo) return false;
    const h = caso.hash ? await av.hashDaFoto(arquivo) : null;
    return !!maisParecido(ref, { hash: hashUtil(h) ? h : null, impressao: impressaoDaImagem(arquivo, null) });
  }
  const arte = detectarArte(String(valor));
  if (arte) return !!caso.hash && arte.impressoes?.[0] === caso.hash;   // arte: só o sha256 exato
  return !!maisParecido(ref, { texto: String(valor) });
}
export async function decisaoDaStaff({ ctx, server, caso, veredito }) {
  const L = idiomaDe(ctx);
  const campo = caso?.parte;
  if (!caso?.userId || !server || (!CAMPOS_TEXTO.includes(campo) && !CAMPOS_IMAGEM.includes(campo))) return null;
  // (revisão staff) o módulo desligado depois do alerta: o ✅ não age
  if (veredito === "certo" && !ligado(ctx.config)) return L === "es" ? "nada — el módulo se desactivó" : L === "en" ? "nothing — the module was turned off" : "nada — o módulo foi desligado";
  const atual = await valorAtual(ctx.client, server.id, caso.userId, campo);
  // (revisão staff) sem conseguir ler o perfil agora (teto de buscas, a API falhou): o ✅ não age às cegas —
  // o caso volta a esperar; o ❌ vale (não pune ninguém), só não devolve a voz sem conferir
  if (!atual.ok && veredito === "certo") return { reabrir: true, feito: L === "es" ? "nada — no pude leer el perfil ahora" : L === "en" ? "nothing — couldn't read the profile now" : "nada — não deu para ler o perfil agora" };
  if (!atual.ok) return null;
  const mesmo = await mesmoConteudo(campo, atual.valor, caso);
  if (veredito === "errou") {
    // nada acontece — só a voz volta, se ela ainda estava silenciada por esta parte, com o mesmo conteúdo
    const antes = db.perfilSilencioLer(server.id, caso.userId);
    if (!antes?.campos.includes(campo) || !mesmo) return null;
    const r = await aplicarNoServidor({ ctx, server, userId: caso.userId, aval: { achados: [], vistos: [], incertos: [], consultas: [] },
      valores: { [campo]: atual.valor ?? null }, origem: "staff", limpas: new Set([campo]) });
    return r?.devolveu ? (L === "es" ? "se le devolvió la voz" : L === "en" ? "voice given back" : "voz devolvida") : null;
  }
  if (!mesmo) return L === "es" ? "nada — la persona ya lo cambió" : L === "en" ? "nothing — the person already changed it" : "nada — a pessoa já trocou";
  const acao = av.acaoDoAvatar(ctx.config?.automod?.antiAvatar ?? {});
  const motivo = av.motivoDaPunicao([{ campo, motivos: [MOTIVO_STAFF] }], L);
  const { feito, ok, ate = null } = await av.aplicarAcao({ ctx, server, userId: caso.userId, acao, motivo, L });
  if (ok && acao === "silenciar") {
    const antes = db.perfilSilencioLer(server.id, caso.userId);
    db.perfilSilencioGravar(server.id, caso.userId, [...(antes?.campos ?? []), campo], motivo, Date.now(), ate);
  }
  // (revisão staff) o ban pelo ✅ entra na lista global como o de um `&ban` manual (decisão humana)
  if (ok && acao === "banir") {
    try { await (await import("./ban-global.js")).registrar(ctx, caso.userId, motivo, "manual", { nome: ctx.client?.users?.get?.(caso.userId)?.username ?? null }); }
    catch (e) { registrarErro("PERFIL:banglobal", e); }
  }
  return feito;
}

// ── Ligar (main.js, uma vez): o evento cru (a bio e o banner) ───────────────
let ligadoA = null;
export async function ligar({ client, criarContexto }) {
  if (!client || ligadoA === client) return false;
  ligadoA = client;
  client.events?.on?.("event", (ev) => {
    if (ev?.type !== "UserUpdate") return;
    aoEventoCru(ev, { client, criarContexto }).catch((e) => registrarErro("PERFIL:evento", e));
  });
  return true;
}

// Só para testes
export function _zerar() { perfis.clear(); buscando.clear(); registrados.clear(); janela = { t: 0, n: 0, avisou: false }; ligadoA = null; }
