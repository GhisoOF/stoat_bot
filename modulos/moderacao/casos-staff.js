// casos-staff.js — os casos duvidosos ficam com a STAFF de cada servidor (31 out 2026, P3a, R13).
//
// Palavras do dono (Ghieh): "Casos que ocorram em servers devem ser cuidados por eles e não
// por mim." Quando a moderação automática fica em dúvida (certeza média/baixa, discordância
// entre detectores) num tema proibido (assuntos.js) ou num perfil (perfil.js), ninguém é
// punido: a staff DAQUELE servidor recebe um alerta, no mesmo canal dos alertas do sentinela
// (sem canal configurado, o log; sem nenhum dos dois, nada é enviado nem guardado), com ✅ e
// ❌ postos pela Judy e uma linha dizendo o que cada um faz.
//   - Só vale a reação de quem tem, ali, a permissão da ação do módulo — o mesmo critério dos
//     comandos de moderação (`membroTemPermissao`), SEM o atalho do dono do bot: ele só conta
//     se também for staff daquele servidor. Bot e membro comum não contam. O ✅ também pede a
//     hierarquia de sempre (`podeAgirSobre`: quem decide está acima da pessoa).
//   - ✅ → a ação configurada do módulo (o detector executa: `decisaoDaStaff`), e o log do
//     servidor diz quem decidiu. ❌ → nada acontece com a pessoa (o perfil devolve a voz, se a
//     pessoa ainda estava silenciada por aquela parte).
//   - O veredito vale SÓ neste servidor: caso parecido herda (`vereditoParecido`: ❌ → nem
//     alerta; ✅ → age direto, como certeza alta) e o limiar do servidor é recalculado uma vez por
//     dia, no ciclo de 6 h (`recalcularLimiares`, a mesma conta do limiar global, partindo dele).
// Retenção (PRIVACIDADE.md; db.js, bloco "P3a staff"): esperando reação, o mínimo para agir,
// no máximo 14 dias; julgado, só impressão/hash + categoria + nota + veredito + servidor.

import * as db from "../core/db.js";
import * as revisao from "./revisao.js";
import * as log from "../core/log.js";
import { canalDaStaff } from "./pertence.js";
import { podeAgirSobre } from "../core/hierarquia.js";
import { registrarErro } from "../core/erros.js";
import { tr } from "../core/i18n.js";
import { LIMIAR_ALTA_PADRAO } from "./assuntos.js";
import { PADRAO as PADRAO_CERTEZA } from "./certeza.js";

export const TIPOS = new Set(["assunto", "perfil-imagem", "perfil-texto"]);
const CATEGORIA = /^[a-z0-9][a-z0-9:_-]{0,39}$/;
// IDs do Stoat (ULID); só letras e dígitos, até 40 — nada de caminho, menção nem espaço
const ID = /^[0-9A-Za-z]{1,40}$/;
const id = (x) => (ID.test(String(x ?? "")) ? String(x) : null);
const PARTE = /^[a-zA-Z]{1,20}$/;
export const POR_CATEGORIA = 500;   // os julgados mais recentes de cada servidor e categoria (limiar)

// ── a herança (só deste servidor) ──
let refs = new Map();   // `${serverId} ${categoria}` → linhas (cache com teto; zera a cada veredito)
function refsDe(serverId, categoria) {
  const k = `${serverId} ${categoria}`;
  if (!refs.has(k)) {
    if (refs.size > 500) refs = new Map();
    refs.set(k, db.staffReferencias(serverId, categoria));
  }
  return refs.get(k);
}
// "certo" = a staff deste servidor confirmou (✅) algo muito parecido; "errou" = disse que não
// era (❌); null = nada parecido julgado AQUI. Outro servidor nunca entra.
export function vereditoParecido({ serverId = null, categoria, hash = null, impressao = null, texto = null } = {}) {
  const sid = id(serverId), cat = String(categoria ?? "").toLowerCase();
  if (!sid || !CATEGORIA.test(cat)) return null;
  try {
    const r = revisao.maisParecido(refsDe(sid, cat), { hash, impressao, texto });
    return r?.veredito === "certo" || r?.veredito === "errou" ? r.veredito : null;
  } catch (e) { registrarErro("STAFF:heranca", e); return null; }
}

// ── o limiar (o do servidor, calibrado pela staff dele; senão o global) ──
const limiares = new Map();   // `${serverId} ${categoria}` → número | null
export function limiar(categoria, padrao, { serverId = null } = {}) {
  const global = revisao.limiar(categoria, padrao);
  const sid = id(serverId), cat = String(categoria ?? "").toLowerCase();
  if (!sid) return global;
  const k = `${sid} ${cat}`;
  if (!limiares.has(k)) {
    if (limiares.size > 2000) limiares.clear();
    let r = null;
    try { r = db.staffLimiar(sid, cat); } catch (e) { registrarErro("STAFF:limiar", e); }
    limiares.set(k, r && r.casos >= revisao.MIN_JULGADOS ? r.limiar : null);
  }
  return limiares.get(k) ?? global;
}
// A mesma conta do limiar global (≥ 95% de precisão, ≥ 10 na faixa, ≥ 20 julgados, [0,5; 0,98],
// ±0,05 por noite), com os vereditos da staff de cada servidor, partindo do padrão global.
// (31 out 2026, P3a, staff — decisão do coordenador) Roda no ciclo de 6 h do main.js (o da
// limpeza, que roda sempre) — não depende da fila do dono (`REVISAO_*`). Cada servidor e
// categoria anda no máximo uma vez por dia UTC (o "por noite"). Devolve o que mudou.
export function recalcularLimiares(agora = Date.now()) {
  const hoje = Math.floor(agora / 86400e3) * 86400e3;
  const grupos = new Map();
  for (const c of db.staffJulgadosComNota()) {
    const k = `${c.serverId} ${c.categoria}`;
    const l = grupos.get(k) ?? [];
    if (l.length < POR_CATEGORIA) l.push({ nota: c.nota, violacao: c.veredito === "certo" });
    grupos.set(k, l);
  }
  const mudou = [];
  for (const [k, casos] of grupos) {
    const [serverId, categoria] = k.split(" ");
    // (revisão staff) a 1ª vez parte do padrão do DETECTOR daquela categoria (ou do global já
    // calibrado) — nunca salta direto ao alvo; categoria sem padrão conhecido não é calculada
    const doDetector = padraoDoDetector(categoria);
    if (doDetector === null) continue;
    const antes = db.staffLimiar(serverId, categoria);
    if (antes && antes.calculadoEm >= hoje) continue;   // já andou hoje
    const anterior = antes && antes.casos >= revisao.MIN_JULGADOS ? antes.limiar : null;
    const r = revisao.calcularLimiar(casos, { anterior, padrao: revisao.limiar(categoria, doDetector) });
    if (!r) continue;
    db.staffSalvarLimiar(serverId, categoria, { limiar: r.limiar, casos: r.casos, precisao: r.precisao, calculadoEm: agora });
    if (anterior !== r.limiar) mudou.push({ serverId, categoria, de: anterior, para: r.limiar });
  }
  limiares.clear();
  return mudou;
}

// O padrão que cada detector passa ao `limiar(...)`: temas (`assunto:<tema>`) → o dos temas;
// perfil (`perfil-texto:*`, e as imagens `sexual`/`odio`/`gore`) → o da certeza. Outro: null.
export function padraoDoDetector(categoria) {
  const c = String(categoria ?? "");
  if (/^assunto:[a-z]+$/.test(c)) return LIMIAR_ALTA_PADRAO;
  if (/^perfil-texto:[a-z-]+$/.test(c) || ["sexual", "odio", "gore"].includes(c)) return PADRAO_CERTEZA.alta;
  return null;
}

// ── o alerta ──
// `embed`: o alerta do detector (nunca a imagem, a arte nem o texto do perfil); `oQueFaz`:
// [pt, en, es] do que o ✅ faz. `caso`: { tipo, categoria, userId, canalId?, msgId?, nota,
// parte, evidencia: { hash?, impressao?, texto? } }. Devolve { id, msgId } ou null (sem canal
// da staff, ou o envio falhou: nada é guardado).
export async function alertar({ ctx, server, embed, caso, oQueFaz, agora = Date.now() }) {
  const serverId = id(server?.id ?? ctx?.serverId);
  const tipo = String(caso?.tipo ?? ""), categoria = String(caso?.categoria ?? "").toLowerCase();
  if (!serverId || !TIPOS.has(tipo) || !CATEGORIA.test(categoria) || !id(caso?.userId)) {
    console.error(`[STAFF] alerta recusado: ${!serverId ? "servidor" : !TIPOS.has(tipo) ? `tipo "${tipo.slice(0, 20)}"` : !CATEGORIA.test(categoria) ? `categoria "${categoria.slice(0, 40)}"` : "pessoa"} inválido`);
    return null;
  }
  const destino = await canalDaStaff(ctx, server);
  if (!destino) { console.warn(`[STAFF] alerta de caso duvidoso NÃO entregue: servidor ${serverId} sem canal de alerta do sentinela nem de log`); return null; }
  const [pt, en, es] = oQueFaz ?? ["aplicar a ação do módulo", "apply the module's action", "aplicar la acción del módulo"];
  const linha = tr(ctx, `✅ ${pt} · ❌ não fazer nada — vale só para este servidor`,
    `✅ ${en} · ❌ do nothing — it only counts for this server`,
    `✅ ${es} · ❌ no hacer nada — solo vale para este servidor`);
  let msg = null;
  try { msg = await ctx.sendEmbed(destino, { ...embed, description: [embed?.description ?? "", "", linha].join("\n") }); }
  catch (e) { registrarErro("STAFF:alerta", e); }
  if (!msg?.id) return null;
  const nota = typeof caso.nota === "number" && Number.isFinite(caso.nota) ? Math.min(1, Math.max(0, caso.nota)) : null;
  const { hash, impressao } = revisao.impressoesDe(caso.evidencia ?? {});
  const novo = db.staffInserir({
    serverId, tipo, categoria, nota, parte: PARTE.test(String(caso.parte ?? "")) ? String(caso.parte) : null,
    userId: id(caso.userId), canalId: id(caso.canalId), msgId: id(caso.msgId),
    alertaCanalId: destino.id ?? null, alertaMsgId: String(msg.id), hash, impressao, criadoEm: agora,
  });
  for (const e of ["✅", "❌"]) {
    try { await msg.react?.(encodeURIComponent(e)); } catch (err) { registrarErro("STAFF:react", err); break; }
  }
  return { id: novo, msgId: String(msg.id) };
}

// ── a reação da staff ──
// Cada tipo de caso tem o seu executor (o detector):
//   `permissaoDaStaff(caso, ctx, veredito)` → a permissão que a reação pede (nos temas, a do degrau);
//   `permissaoParaEnsinar(caso, ctx)` (opcional) → a mais forte que o módulo pode aplicar: sem ela, o ✅
//     vale só para o caso (não entra na herança nem no limiar);
//   `decisaoDaStaff({ ctx, server, caso, veredito, quem, podeAplicar })` → o que fez (texto no idioma do
//     servidor), `{ feito, reabrir: true }` (não deu para agir agora: o caso volta a esperar) ou null.
const EXECUTORES = { assunto: () => import("./assuntos.js"), "perfil-imagem": () => import("./perfil.js"), "perfil-texto": () => import("./perfil.js") };
// (revisão staff) Uma decisão por pessoa e servidor de cada vez: a permissão de quem reagiu e a
// execução ficam na mesma vez da fila — o 2º ✅ só confere a permissão depois que o 1º puniu.
const travas = new Map();   // `${serverId} ${userId}` → a promessa da última decisão
function comTrava(chave, fn) {
  const antes = travas.get(chave) ?? Promise.resolve();
  const agora = antes.then(fn, fn);
  const fim = agora.catch(() => {}).finally(() => { if (travas.get(chave) === fim) travas.delete(chave); });
  travas.set(chave, fim);
  return agora;
}
// true = a mensagem era um alerta de caso duvidoso (a reação foi tratada ou ignorada de propósito)
export async function aoReagir(msgId, userId, emoji, { client, criarContexto, agora = Date.now() } = {}) {
  const achado = msgId ? db.staffPorAlerta(msgId) : null;
  if (!achado) return false;
  let e = String(emoji ?? "");
  try { e = decodeURIComponent(e); } catch { /* emoji já decodificado */ }
  e = e.replace(/\uFE0F/g, "");
  if (e !== "✅" && e !== "❌") return true;
  if (!userId || userId === client?.user?.id || typeof criarContexto !== "function") return true;
  await comTrava(`${achado.serverId} ${achado.userId}`, async () => {
    try {
      const caso = db.staffPorAlerta(msgId);   // de novo, dentro da vez: outra reação pode ter decidido
      if (!caso) return;
      const server = client?.servers?.get?.(caso.serverId) ?? await client?.servers?.fetch?.(caso.serverId).catch(() => null);
      if (!server) return;
      const user = client?.users?.get?.(userId) ?? null;
      if (user?.bot) return;
      const member = await server.fetchMember?.(userId).catch(() => null) ?? null;
      if (!member || member.user?.bot) return;
      const ctx = criarContexto(caso.serverId);
      const mod = await EXECUTORES[caso.tipo]?.();
      if (!mod) return;
      const quem = { authorId: userId, serverId: caso.serverId, member, author: user ?? member.user ?? null };
      // a mesma permissão dos comandos de moderação, sem o atalho do dono do bot
      const tem = (perm) => !!ctx.membroTemPermissao?.(quem, server, perm, { semDono: true });
      const veredito = e === "✅" ? "certo" : "errou";
      if (!tem(await mod.permissaoDaStaff(caso, ctx, veredito))) return;
      let ensina = true;
      if (veredito === "certo" && caso.userId) {
        // a hierarquia de sempre, sem o dono do bot passar por cima pela reação
        const h = await podeAgirSobre(server, quem, caso.userId, { ...ctx, ehSuperAdmin: () => false });
        if (!h.ok) { console.log(`[STAFF] ✅ de ${userId} no caso ${caso.id} (${caso.serverId}) não conta: hierarquia`); return; }
        // só ensina (herança e limiar do servidor) quem tem a permissão mais forte que o módulo pode aplicar
        const maxima = await mod.permissaoParaEnsinar?.(caso, ctx);
        if (maxima) ensina = tem(maxima);
      }
      await julgar(caso, veredito, { ctx, server, quem: userId, mod, agora, ensina, podeAplicar: tem });
    } catch (err) { registrarErro("STAFF:reacao", err); }
  });
  return true;
}
// Marca primeiro (duas reações juntas não aplicam duas vezes), depois executa e registra no log.
// O detector pode pedir para o caso voltar a esperar (`{ reabrir: true }`: não deu para agir agora).
// (O limiar do servidor muda no ciclo de 6 h: `recalcularLimiares`.)
export async function julgar(caso, veredito, { ctx, server, quem, mod = null, agora = Date.now(), ensina = true, podeAplicar = null }) {
  if (!db.staffJulgar(caso.id, veredito, agora, { ensina })) return null;
  refs = new Map();
  let r = null;
  try { r = await (mod ?? await EXECUTORES[caso.tipo]?.())?.decisaoDaStaff?.({ ctx, server, caso, veredito, quem, podeAplicar }) ?? null; }
  catch (e) { registrarErro("STAFF:executar", e); }
  const reabrir = !!r?.reabrir;
  const feito = typeof r === "string" ? r : r?.feito ?? null;
  if (reabrir) db.staffReabrir(caso);
  const s = veredito === "certo" ? "✅" : "❌";
  const alvo = caso.userId ? `<@${caso.userId}>` : "—";
  const t3 = reabrir
    ? ["\n_O caso continua esperando._", "\n_The case is still waiting._", "\n_El caso sigue esperando._"]
    : ensina ? ["", "", ""] : ["\n_Vale só para este caso (falta a permissão mais forte do módulo para ensinar)._", "\n_Counts only for this case (missing the module's strongest permission to teach)._", "\n_Vale solo para este caso (falta el permiso más fuerte del módulo para enseñar)._"];
  await log.registrar(ctx, "punicoes", {
    titulo: `⚖️ Caso duvidoso julgado pela staff ${s}`,
    descricao: `<@${quem}> decidiu ${s} · ${alvo} · \`${caso.categoria}\`${feito ? `\n**Ação:** ${feito}` : ""}${t3[0]}`,
    en: { titulo: `⚖️ Doubtful case judged by the staff ${s}`, descricao: `<@${quem}> decided ${s} · ${alvo} · \`${caso.categoria}\`${feito ? `\n**Action:** ${feito}` : ""}${t3[1]}` },
    es: { titulo: `⚖️ Caso dudoso juzgado por el staff ${s}`, descricao: `<@${quem}> decidió ${s} · ${alvo} · \`${caso.categoria}\`${feito ? `\n**Acción:** ${feito}` : ""}${t3[2]}` },
  }).catch((e) => registrarErro("STAFF:log", e));
  console.log(`[STAFF] caso ${caso.id} (${caso.serverId}, ${caso.categoria}) ${s} por ${quem}${feito ? ` → ${feito}` : ""}${reabrir ? " (volta a esperar)" : ensina ? "" : " (só este caso)"}`);
  return { veredito, feito, reabrir, ensina };
}

// Só para testes
export function _zerar() { refs = new Map(); limiares.clear(); travas.clear(); }
