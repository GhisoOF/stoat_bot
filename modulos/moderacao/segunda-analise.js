// segunda-analise.js — os casos que deram problema vão ao dono do bot (P5, 3 nov 2026).
//
// Decisão do dono (3 nov 2026): a amostra diária continua 100% aleatória; À PARTE, a Judy manda
// ao dono os casos que deram problema, para uma segunda análise. O veredito dele só calibra e
// treina (R13): não pune, não libera, não desfaz nada nem muda o que a staff decidiu. A gravação,
// o cartão "🔁" na DM, o teto diário (REVISAO_PROBLEMAS_POR_DIA) e a retenção são os da fila
// (revisao.js: `registrarProblema`). Aqui, só os EVENTOS:
//
//   desfeita      a staff desfez uma punição AUTOMÁTICA da Judy (&unban, &untimeout, ↩️ na
//                 mensagem da punição, `&automod sentinela liberar`) — punir.js e
//                 automod-comandos.js chamam `aoDesfazer`
//   staff-errou   a staff marcou ❌ num alerta de caso duvidoso (casos-staff.js chama `staffErrou`)
//   discordancia  os detectores discordaram (a origem "discordancia" no revisao.registrarCaso)
//   quarentena    a punição automática falhou e a pessoa caiu na quarentena (automod-engine.js
//                 chama `quarentena`)
//
// Para saber, no &unban/&untimeout/liberar, que a punição era AUTOMÁTICA (e de quê), a Judy lembra
// a última punição automática de cada pessoa em cada servidor — só na memória do processo, com
// teto (MAX) e validade (VALIDADE_MS, a mesma do ↩️), já preparada como caso: só o trecho seguro de
// até 300 caracteres, a categoria, a nota e as impressões — nem o texto inteiro nem o vetor (R11).
// (3 nov 2026, P5 revisão) antes: o vetor do texto inteiro, teto 500. agora: o vetor sai do trecho
// só quando o caso vai mesmo à segunda análise; teto 200. Reiniciou: esquece (como o ↩️). Uma
// punição manual da staff depois apaga a lembrança (o que ela desfizer depois é dela).

import * as revisao from "./revisao.js";
import { registrarErro } from "../core/erros.js";

export const MAX = 200;
export const VALIDADE_MS = 7 * 86_400_000;
const lembradas = new Map();   // `${serverId}:${userId}` → { caso (revisao.prepararCaso, com vetor), quando }
const chave = (serverId, userId) => `${String(serverId).toUpperCase()}:${String(userId).toUpperCase()}`;

// A punição automática que acabou de acontecer (o automod numa mensagem, o perfil). `dados`: o
// formato do revisao.registrarCaso (tipo, categoria, serverId, userId, canalId, msgId, nota,
// certeza, detector, evidencia: { texto, trecho, link, hash, impressao }). Devolve o caso preparado
// (para a `quarentena` usar) ou null.
export function lembrarPunicao(dados, { agora = Date.now() } = {}) {
  try {
    if (!dados?.serverId || !dados?.userId) return null;
    const caso = revisao.prepararCaso({ ...dados, origem: "problema", acao: "punido" });
    if (!caso?.serverId || !caso?.userId) return null;
    caso._texto = caso.trecho ?? "";   // (P5 revisão) o texto inteiro sai: o vetor, se um dia for preciso, sai do trecho
    const k = chave(caso.serverId, caso.userId);
    lembradas.delete(k);
    lembradas.set(k, { caso, quando: agora });
    while (lembradas.size > MAX) lembradas.delete(lembradas.keys().next().value);
    return caso;
  } catch (e) { registrarErro("SEGUNDA:lembrar", e); return null; }
}
// A punição automática do automod numa mensagem (`opts` do automod-engine.aplicarPunicao). O tipo e a
// categoria vêm do detector quando ele diz (os temas: "assunto", `assunto:<tema>`); senão, "mensagem"
// e a família do filtro: "sentinela" (a nota de conteúdo), "automod:regra" (regra fixa) ou
// "automod:ruido" (spam, caps, repetição…). A nota do automod é de 0 a 10; o caso guarda de 0 a 1.
// Sem texto (só imagem, só anexo) → nada.
const CATEGORIA = /^[a-z0-9][a-z0-9:_-]{0,39}$/;
export function lembrarDoAutomod(opts = {}, serverId = null, { agora = Date.now() } = {}) {
  const m = opts.message;
  const texto = typeof m?.content === "string" ? m.content : "";
  if (!texto.trim() || !serverId || !opts.userId) return null;
  const tipo = opts.tipo === "assunto" ? "assunto" : "mensagem";
  const categoria = CATEGORIA.test(String(opts.categoria ?? "")) ? String(opts.categoria)
    : opts.ruido ? "automod:ruido" : opts.regraFixa ? "automod:regra" : typeof opts.nota === "number" ? "sentinela" : "automod";
  const nota = typeof opts.nota === "number" && Number.isFinite(opts.nota) ? Math.round(opts.nota * 10) / 100 : null;
  return lembrarPunicao({
    tipo, categoria, serverId, userId: opts.userId, canalId: m?.channelId ?? null, msgId: m?.id ?? null,
    certeza: "alta", nota, detector: `automod:${categoria}`,
    evidencia: { texto, trecho: revisao.trechoSeguro(texto) },
  }, { agora });
}
// A staff puniu à mão depois: o que ela desfizer é dela, não do automod
export function esquecerPunicao(serverId, userId) {
  if (serverId && userId) lembradas.delete(chave(serverId, userId));
}
// `&privacidade apagar`: a pessoa sai da memória (de todos os servidores)
export function esquecerPessoa(userId) {
  const sufixo = `:${String(userId ?? "").toUpperCase()}`;
  let n = 0;
  if (sufixo.length > 1) for (const k of [...lembradas.keys()]) if (k.endsWith(sufixo)) { lembradas.delete(k); n++; }
  return n;
}
export function punicaoLembrada(serverId, userId, agora = Date.now()) {
  const k = chave(serverId, userId);
  const l = lembradas.get(k);
  if (l && agora - l.quando > VALIDADE_MS) { lembradas.delete(k); return null; }
  return l?.caso ?? null;
}

// ── os eventos ──
// A staff desfez (unban, untimeout, liberar): se a última punição dessa pessoa ali foi automática,
// o caso vai à segunda análise. Nada muda no que a staff fez. Devolve { codigo } ou null.
export function aoDesfazer(serverId, userId, { agora = Date.now() } = {}) {
  try {
    const caso = punicaoLembrada(serverId, userId, agora);
    if (!caso) return null;
    lembradas.delete(chave(serverId, userId));   // um desfazer, um caso
    return revisao.registrarProblema(caso, { evento: "desfeita", agora, preparado: true });
  } catch (e) { registrarErro("SEGUNDA:desfazer", e); return null; }
}
// A punição automática falhou e a pessoa caiu na quarentena
export function quarentena(caso, { agora = Date.now() } = {}) {
  try { return caso ? revisao.registrarProblema(caso, { evento: "quarentena", agora, preparado: true }) : null; }
  catch (e) { registrarErro("SEGUNDA:quarentena", e); return null; }
}
// A staff marcou ❌ num alerta: `caso` é a linha do staff_casos ANTES do veredito (ainda com a
// pessoa, o trecho, o link e o vetor). O que a staff decidiu continua valendo.
export function staffErrou(caso, { agora = Date.now() } = {}) {
  try {
    if (!caso) return null;
    return revisao.registrarProblema({
      tipo: caso.tipo, categoria: caso.categoria, serverId: caso.serverId, userId: caso.userId, canalId: caso.canalId, msgId: caso.msgId,
      certeza: caso.certeza ?? null, nota: caso.nota, acao: "alertado", detector: `staff:${caso.tipo}`,
      vetor: caso.vetor ?? null, versaoSinais: caso.versaoSinais ?? null,
      evidencia: { trecho: caso.trecho ?? null, link: caso.link ?? null, hash: caso.hash ?? null, impressao: caso.impressao ?? null },
    }, { evento: "staff-errou", agora });
  } catch (e) { registrarErro("SEGUNDA:staff", e); return null; }
}

// Só para testes
export function _zerar() { lembradas.clear(); }
export const _tamanho = () => lembradas.size;
