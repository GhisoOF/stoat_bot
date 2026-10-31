// gating.js — QUANDO a Judy conversa (31 out 2026, P2).
//
// Antes eram 8 predicados soltos no chat.js (iaDisponivel, chatLigadoAqui,
// imagemLigadaAqui, imagemNoBot, servidorPermitido, naoFalarCom, modIAPermitida,
// comandoIAPermitido), uns chamando os outros, e cada módulo importava um par
// diferente. Ficam três perguntas:
//
//   conversaAqui(serverId, config?)  — a Judy conversa neste servidor? (.env + escolha do servidor)
//   imagemAqui(serverId, config?)    — ela gera imagem aqui? (.env + escolha do servidor)
//   falaCom(userId)                  — a pessoa não pediu silêncio (`&privacidade chat sair`)?
//
// e, para a tela que liga/desliga (`&config`/`&assistente`), `iaNoEnv(serverId)`:
// o .env deixa a conversa rodar aqui? (sem isso o botão não tem efeito).
//
// A escolha do servidor continua nas MESMAS chaves de sempre — `config.ia.chat` e
// `config.ia.imagem` (true/false; sem escolha = padrão) —, então quem tinha a
// conversa ligada continua ligada. Um servidor que desligou o antigo `&chat` com o
// `&comando desativar chat` continua sem conversa até ligar de novo pela tela nova
// (`definirConversa` tira o "chat" da lista dos desativados).
//
// E a conversa livre (a Judy entra sem ser chamada): para quem é a mensagem e se
// vale entrar — o código decide antes do juiz (que custa modelo).

import * as store from "../core/config-store.js";
import * as db from "../core/db.js";
import { servidorDaCasa } from "../core/casa.js";
import { iaLigada, conversaLigada, ligado } from "../core/env.js";
import { MapaCurto } from "./mapa-curto.js";
import * as cacheCanal from "./cache-canal.js";

// ─── As três perguntas ─────────────────────────────────────────────────────

// CHAT_SERVIDORES ("*" = todos) é lido na hora (os testes e o env.js mudam).
const servidoresDoEnv = () => (process.env.CHAT_SERVIDORES || "").split(",").map((s) => s.trim()).filter(Boolean);

// O .env deixa a IA de conversa rodar AQUI? (o antigo iaDisponivel)
export function iaNoEnv(serverId) {
  if (!iaLigada() || !conversaLigada()) return false;   // IA=0 ou CONVERSA=0: em lugar nenhum
  const lista = servidoresDoEnv();
  return lista.includes("*") || (!!serverId && lista.includes(serverId));
}

function configDe(serverId, config) {
  if (config || !serverId) return config ?? null;
  try { return store.configDoServidor(serverId); } catch { return null; }
}
// true/false = o servidor escolheu; null = sem escolha
function escolha(cfg, chave) {
  const v = cfg?.ia?.[chave];
  return typeof v === "boolean" ? v : null;
}
// CHAT_PADRAO=on (o .env de quem hospeda): sem escolha, começa LIGADO — o jeito
// antigo. Sem ele, só os servidores pelo ID em SERVIDOR (a casa) começam ligados.
const padraoLigado = (serverId) => ["on", "1", "sim", "true", "ligado"].includes((process.env.CHAT_PADRAO ?? "").trim().toLowerCase())
  || servidorDaCasa(serverId);

export function conversaAqui(serverId, config = null) {
  if (!iaNoEnv(serverId)) return false;
  const cfg = configDe(serverId, config);
  if ((cfg?.comandosDesativados ?? []).includes("chat")) return false;   // o `&comando desativar chat` de antes
  return escolha(cfg, "chat") ?? padraoLigado(serverId);
}

// IMAGEM=1 no .env (o gerador só existe com ele) e a escolha do servidor
export const imagemNoEnv = () => ligado("IMAGEM", false);
export function imagemAqui(serverId, config = null) {
  if (!imagemNoEnv()) return false;
  return escolha(configDe(serverId, config), "imagem") ?? padraoLigado(serverId);
}

// Quem disse "não fale comigo": vale em todo servidor
export function falaCom(userId) {
  try { return !!userId && !db.iaSilenciada(userId); } catch { return true; }
}

// A tela que liga/desliga grava aqui (as chaves de sempre). Ligar tira o "chat"
// que o `&comando desativar` antigo tinha posto na lista.
export function definirConversa(config, ligar) {
  config.ia = { ...(config.ia ?? {}), chat: !!ligar };
  if (ligar && Array.isArray(config.comandosDesativados)) config.comandosDesativados = config.comandosDesativados.filter((c) => c !== "chat");
}
export function definirImagem(config, ligar) {
  config.ia = { ...(config.ia ?? {}), imagem: !!ligar };
}

// ─── Conversa livre: para quem é a mensagem, e se vale entrar ──────────────

export function canalTemChatLivre(config, canalId) {
  return !!config?.chatLivre?.canais?.includes(canalId);
}

// ─── Para quem é a mensagem? (12 out 2026) ───────────────────────────────────
// Os prints: "@CabeçaComÇedilha" sozinho virou "você está me enviando o seu
// próprio identificador?"; "Obrigado :) @CabeçaComÇedilha" virou "de nada";
// "Que" (respondendo a outra pessoa) virou um parágrafo sobre Ctrl+F. Agora o
// código decide primeiro para quem é a mensagem — e só o que é para ela, ou
// para o grupo, chega ao juiz.
export function destinoDaMensagem(message, { botId = null, canalId = null } = {}) {
  const conteudo = String(message?.content ?? "");
  const mencoes = [...conteudo.matchAll(/<@!?([0-9A-Za-z]{20,32})>/g)].map((m) => m[1]);
  if (botId && mencoes.includes(botId)) return "judy";
  if (/(?<![\p{L}\p{N}])(judy|cobaia)(?![\p{L}\p{N}])/iu.test(conteudo)) return "judy";
  const respondeu = message?.replyIds?.[0] ?? message?.reply_ids?.[0] ?? null;
  if (respondeu) {
    const alvo = cacheCanal.recentes(canalId).find((m) => m.id === respondeu);
    return alvo && (alvo.ehJudy || (botId && alvo.userId === botId)) ? "judy" : "outra-pessoa";
  }
  if (mencoes.some((id) => id !== botId)) return "outra-pessoa";
  // vocativo: "obrigado, Fulano", "Fulano, viu isso?", "... né Fulano"
  const t = conteudo.toLowerCase().trim();
  const nomes = [...cacheCanal.nomesDoCanal(canalId)]
    .filter(([id, n]) => id !== botId && id !== message?.authorId && typeof n === "string" && n.trim().length >= 3 && !/^judy$/i.test(n.trim()))
    .map(([, n]) => n.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  for (const n of nomes) {
    if (new RegExp(`^@?${n}(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])@?${n}[\\s!?.,:;)]*$`, "u").test(t)) return "outra-pessoa";
  }
  return "grupo";
}

const RE_PERGUNTA = /\?|(?<![\p{L}])(como|qual|quais|quem|quando|onde|porque|por que|quanto|algu[eé]m sabe|algu[eé]m tem|me ajuda|recomenda|indica|o que [eé])(?![\p{L}])/iu;
const RE_SO_REACAO = /^(?:[kKhHaAsSrR]{3,}|ixi+|oxe+|eita+|vish+|que|q|kk+|lol|uai|af+|mds|pqp|ue|hm+|ah+|oh+|ok|blz|sim|n[aã]o|[.!?…]+)[\s!?.…]*$/i;

const LIVRE_MIN_CHARS = () => Number(process.env.CHAT_LIVRE_MIN_CHARS || 12);
const LIVRE_INTERVALO_MS = () => Number(process.env.CHAT_LIVRE_INTERVALO_MS || 5 * 60_000);   // entre entradas sem convite, por canal
const LIVRE_POR_HORA = () => Number(process.env.CHAT_LIVRE_POR_HORA || 4);
const _entradasLivres = new MapaCurto({ ttlMs: 60 * 60_000, max: 2000 });   // canalId → [timestamps] (a última hora)

// → { entrar, avaliar, motivo }. `avaliar`: ainda passa pelo juiz (modelo).
export function decidirEntradaLivre(message, { botId = null, canalId = null, modo = "relevante", engajado = false, agora = Date.now() } = {}) {
  const destino = destinoDaMensagem(message, { botId, canalId });
  if (destino === "judy") return { entrar: true, avaliar: false, motivo: "falou com ela" };
  if (destino === "outra-pessoa") return { entrar: false, motivo: "fala com outra pessoa" };
  const texto = String(message?.content ?? "").replace(/<@!?[0-9A-Za-z]{20,32}>/g, "").trim();
  if (RE_SO_REACAO.test(texto) || texto.replace(/[^\p{L}\p{N}]/gu, "").length < 4) return { entrar: false, motivo: "só reação" };
  const pergunta = RE_PERGUNTA.test(texto);
  if (engajado) {
    // continuação de uma conversa COM ela: pergunta ou frase com conteúdo
    return pergunta || texto.length >= 20 ? { entrar: true, avaliar: false, motivo: "continua a conversa com ela" } : { entrar: false, motivo: "curta demais para continuar" };
  }
  if (modo === "todas") return texto.length >= LIVRE_MIN_CHARS() ? { entrar: true, avaliar: false, motivo: "modo todas" } : { entrar: false, motivo: "curta demais" };
  // Mostrar algo ao grupo com foto é deixa boa — e foi o acerto que Ghieh quer manter.
  const mostrou = (message?.attachments?.length ?? 0) > 0;
  if (!pergunta && !mostrou) return { entrar: false, motivo: "não é pergunta nem algo mostrado ao grupo" };
  if (!mostrou && texto.length < LIVRE_MIN_CHARS()) return { entrar: false, motivo: "curta demais" };
  const recentes = (_entradasLivres.get(canalId) ?? []).filter((t) => agora - t < 3_600_000);
  if (recentes.length && agora - recentes.at(-1) < LIVRE_INTERVALO_MS()) return { entrar: false, motivo: "entrou sem convite há pouco" };
  if (recentes.length >= LIVRE_POR_HORA()) return { entrar: false, motivo: "teto de entradas sem convite por hora" };
  return { entrar: true, avaliar: true, motivo: mostrou && !pergunta ? "mostrou algo ao grupo (com foto)" : "pergunta ao grupo" };
}
export function registrarEntradaLivre(canalId, agora = Date.now()) {
  const l = (_entradasLivres.get(canalId) ?? []).filter((t) => agora - t < 3_600_000);
  l.push(agora); _entradasLivres.set(canalId, l);
}

// Cooldown por canal para o juiz da conversa livre (evita avaliar toda mensagem).
const _ultimaAvaliacaoLivre = new MapaCurto({ ttlMs: 30 * 60_000, max: 2000 });   // canalId → timestamp
const LIVRE_COOLDOWN_MS = () => Number(process.env.CHAT_LIVRE_COOLDOWN || 20000);
export function podeAvaliarLivre(canalId, agora = Date.now()) {
  if (agora - (_ultimaAvaliacaoLivre.get(canalId) || 0) < LIVRE_COOLDOWN_MS()) return false;
  _ultimaAvaliacaoLivre.set(canalId, agora);
  return true;
}

// Quem falava com ela há pouco (90 s) continua a conversa sem chamá-la.
const ENGAJAMENTO_MS = () => Number(process.env.CHAT_ENGAJAMENTO_MS || 90000);
const _engajamento = new MapaCurto({ ttlMs: 10 * 60_000, max: 5000 });   // `${canalId}:${userId}` → expira em
const chaveEng = (canalId, userId) => `${canalId}:${userId}`;
export function estaEngajado(canalId, userId, agora = Date.now()) {
  const exp = _engajamento.get(chaveEng(canalId, userId));
  if (!exp) return false;
  if (agora > exp) { _engajamento.delete(chaveEng(canalId, userId)); return false; }
  return true;
}
export function marcarEngajado(canalId, userId, agora = Date.now()) {
  _engajamento.set(chaveEng(canalId, userId), agora + ENGAJAMENTO_MS());
}

// Esquece o estado da conversa livre: de uma lista de canais, ou de tudo (null).
export function limparLivre(canais = null) {
  const engajamento = _engajamento.size;
  if (Array.isArray(canais)) {
    for (const c of canais) {
      _ultimaAvaliacaoLivre.delete(c);
      _entradasLivres.delete(c);
      for (const k of [..._engajamento.keys()]) if (String(k).startsWith(`${c}:`)) _engajamento.delete(k);
    }
  } else {
    _ultimaAvaliacaoLivre.clear();
    _entradasLivres.clear();
    _engajamento.clear();
  }
  return { engajamento };
}
