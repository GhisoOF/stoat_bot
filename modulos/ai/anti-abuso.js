// A porta da IA contra spam e abuso (21 out 2026, pedido de Ghieh ao liberar a IA em
// todos os servidores: "evitar ataques futuros de spam na LLM, fazendo ela filtrar
// muito mais coisa").
//
// Tudo aqui roda ANTES do modelo e não custa nada: é conta e regex. Três famílias:
//   1. ritmo — por pessoa (minuto e hora), por canal, por servidor e no total; uma
//      conversa de cada vez por pessoa; conta nova (< 24 h) com freio mais curto;
//   2. repetição — a mesma pergunta da mesma pessoa em 10 min, e a mesma pergunta de
//      3+ contas no mesmo servidor em 2 min (o ataque com várias contas);
//   3. conteúdo — texto gigante, muitas menções ou links, caractere repetido em
//      sequência, texto "comprimível" demais (copiar-colar de spam), marcas
//      invisíveis e zalgo, blocos base64/hex, os moldes de jailbreak ("ignore as
//      instruções", "modo desenvolvedor", "DAN") e os pedidos para a própria Judy
//      fazer spam ("repita 500 vezes", "marque todo mundo").
//
// Resposta a abuso é CURTA e no máximo uma vez por janela: responder a cada
// mensagem de spam seria fazer o spam pelo atacante. O resto é silêncio.
//
// Ritmo e repetição: CHAT_ANTI_ABUSO=0 desliga (os filtros de conteúdo, nunca).
// O dono do bot (prioridade 2) passa direto. O servidor da casa (prioridade 1) tem
// os mesmos filtros de conteúdo, com o ritmo mais folgado.

export const LIMITES = {
  pessoaMinuto: 6,      // conversas por pessoa por minuto
  pessoaHora: 40,       // … por hora
  contaNovaMinuto: 1,   // conta com menos de 24 h
  canalMinuto: 10,
  servidorMinuto: 20,
  globalMinuto: 60,     // todos os servidores juntos (fora a casa e o dono)
  maxChars: 2000,       // a pergunta (sem a citação)
  repeticaoMs: 60_000,  // a mesma pergunta de novo em 1 min (depois disso, repetir é legítimo: deu erro, mudou o assunto)
  ondaMs: 2 * 60_000,   // mesma pergunta de várias contas
  ondaContas: 3,
  avisoMs: 60_000,      // no máximo um aviso por pessoa (ou canal) nessa janela
};

const MIN = 60_000, HORA = 3_600_000;
const pessoa = new Map();    // userId → [t…] (última hora)
const canal = new Map();     // canalId → [t…] (último minuto)
const servidor = new Map();  // serverId → [t…]
let global = [];             // [t…]
const emVoo = new Set();     // userId com conversa em andamento
const ultimas = new Map();   // userId → [{ chave, t }]
const onda = new Map();      // serverId → Map(chave → [{ userId, t }])
const avisado = new Map();   // "u:<id>" | "c:<id>" → t do último aviso

export function _zerar() {
  pessoa.clear(); canal.clear(); servidor.clear(); global = []; emVoo.clear();
  ultimas.clear(); onda.clear(); avisado.clear();
}

const recentes = (lista, janela, agora) => (lista ?? []).filter((t) => agora - t < janela);
// texto comparável: sem menção, sem link, sem acento, minúsculas, espaços únicos
export const chaveDe = (texto) => String(texto ?? "").replace(/<[@#%][^>]+>/g, " ").replace(/https?:\/\/\S+/g, " ")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 400);

// ── 3. conteúdo ──
const INVISIVEIS = /[\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff\u00ad]/g;
const COMBINANTES = /[\u0300-\u036f\u0483-\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;
// os moldes de jailbreak mais comuns, em pt/en/es — pegam o PEDIDO, não o assunto
// ("o que é um jailbreak?" passa; "ignore todas as instruções anteriores" não)
const JAILBREAK = [
  /\b(ignor[ae]\w*|esque[cç]a|forget|disregard|olvida)\b[^.\n]{0,40}\b(instru[cç][oõ]es|instructions?|instrucciones|regras|rules|reglas|prompt)\b[^.\n]{0,20}\b(anteriores|previous|above|prior|acima|todas|all)\b/i,
  /\b(ignor[ae]\w*|disregard)\s+(all\s+|todas\s+as\s+|tudo\s+)?(previous|prior|above|anteriores|acima)\b/i,
  /\b(developer|dev|god|jailbreak|unrestricted|unfiltered)\s+mode\b|\bmodo\s+(desenvolvedor|deus|sem\s+(filtro|restri[cç][aã]o|censura)|irrestrito)\b/i,
  /\b(you\s+are|voc[eê]\s+[eé]|eres)\s+(now\s+|agora\s+|ahora\s+)?(DAN|STAN|DUDE|AIM)\b|\bDo\s+Anything\s+Now\b/i,
  /\b(reveal|show|print|repeat|mostr[ae]|revel[ae]|repita|imprima)\b[^.\n]{0,30}\b(system\s*prompt|prompt\s+do\s+sistema|suas\s+instru[cç][oõ]es|your\s+(instructions|system\s+message))\b/i,
  /<\/?(system|assistant|im_start|im_end)>|\[\/?INST\]|<\|im_(start|end)\|>/i,
];
// pedidos para a Judy virar o canhão de spam
const PEDE_SPAM = [
  /\b(repit[ae]|repeat|repite|escrev[ae]|write|escribe|mand[ae]|send|manda|diga|say|di)\b[^.\n]{0,40}\b(\d{2,})\s*(vezes|times|veces|x)\b/i,
  /\b(marqu[ae]|mencion[ae]|ping(ue)?|tag|menciona|etiqueta)\b[^.\n]{0,20}\b(todo\s+mundo|todos|everyone|everybody|all\s+members|todo\s+el\s+mundo)\b/i,
  /@(everyone|online|here|todos)\b/i,
];

export function avaliarConteudo(texto, { maxChars = LIMITES.maxChars } = {}) {
  const t = String(texto ?? "");
  if (t.length > maxChars) return { motivo: "longa" };
  if ((t.match(INVISIVEIS) ?? []).length >= 5) return { motivo: "invisiveis", silencio: true };
  const letras = (t.match(/\p{L}/gu) ?? []).length;
  if ((t.match(COMBINANTES) ?? []).length > Math.max(10, letras * 0.5)) return { motivo: "zalgo", silencio: true };
  if ((t.match(/<@[A-Z0-9]{26}>/g) ?? []).length >= 5) return { motivo: "mencoes", silencio: true };
  if ((t.match(/https?:\/\/\S+/g) ?? []).length >= 4) return { motivo: "links", silencio: true };
  if (/(.)\1{29,}/su.test(t)) return { motivo: "caractere-repetido", silencio: true };
  if (/[A-Za-z0-9+/]{200,}={0,2}/.test(t) || /\b[0-9a-f]{200,}\b/i.test(t)) return { motivo: "bloco-codificado", silencio: true };
  // texto longo que é a mesma coisa várias vezes ("compra aqui compra aqui compra aqui…")
  const palavras = t.toLowerCase().split(/\s+/).filter((p) => p.length > 1);
  if (palavras.length >= 30 && new Set(palavras).size / palavras.length < 0.2) return { motivo: "repetitiva", silencio: true };
  if (JAILBREAK.some((re) => re.test(t))) return { motivo: "jailbreak" };
  if (PEDE_SPAM.some((re) => re.test(t))) return { motivo: "pede-spam" };
  return null;
}

// ── a porta inteira ──
// → { ok: true } | { ok: false, motivo, avisar } — `avisar` = esta é a vez de dizer
// alguma coisa (uma por janela); senão, silêncio.
// CHAT_ANTI_ABUSO=0 desliga o RITMO e a REPETIÇÃO (instância privada, testes) — os
// filtros de conteúdo valem sempre
const ritmoLigado = () => !["0", "off", "nao", "não", "false"].includes((process.env.CHAT_ANTI_ABUSO ?? "1").trim().toLowerCase());

export function avaliar({ userId, canalId = null, serverId = null, texto = "", prioridade = 0, idadeContaMs = null,
  quarentena = false, agora = Date.now() } = {}) {
  if (prioridade >= 2) return { ok: true };
  const nega = (motivo, chaveAviso = `u:${userId}`, silencio = false) => {
    const ultimo = avisado.get(chaveAviso) ?? 0;
    const avisar = !silencio && agora - ultimo >= LIMITES.avisoMs;
    if (avisar) avisado.set(chaveAviso, agora);
    if (avisado.size > 5000) avisado.clear();
    return { ok: false, motivo, avisar };
  };
  if (quarentena) return nega("quarentena", `u:${userId}`, true);

  const c = avaliarConteudo(texto);
  if (c) return nega(c.motivo, `u:${userId}`, c.silencio);

  if (!ritmoLigado()) return { ok: true };
  if (emVoo.has(userId)) return nega("em-andamento");

  const folga = prioridade === 1 ? 2 : 1;   // o servidor da casa respira mais
  const doUsuario = recentes(pessoa.get(userId), HORA, agora);
  const noMinuto = doUsuario.filter((t) => agora - t < MIN).length;
  const novaConta = idadeContaMs != null && idadeContaMs < 24 * HORA;
  if (noMinuto >= (novaConta ? LIMITES.contaNovaMinuto : LIMITES.pessoaMinuto * folga)) return nega("ritmo-pessoa");
  if (doUsuario.length >= LIMITES.pessoaHora * folga) return nega("ritmo-pessoa-hora");
  if (canalId && recentes(canal.get(canalId), MIN, agora).length >= LIMITES.canalMinuto * folga) return nega("ritmo-canal", `c:${canalId}`);
  if (serverId && recentes(servidor.get(serverId), MIN, agora).length >= LIMITES.servidorMinuto * folga) return nega("ritmo-servidor", `c:${canalId}`);
  if (prioridade === 0 && recentes(global, MIN, agora).length >= LIMITES.globalMinuto) return nega("ritmo-global", `c:${canalId}`);

  // ── 2. repetição ──
  const chave = chaveDe(texto);
  if (chave.length >= 4) {
    const minhas = (ultimas.get(userId) ?? []).filter((x) => agora - x.t < LIMITES.repeticaoMs);
    if (minhas.some((x) => x.chave === chave)) return nega("repetida", `u:${userId}`, true);
    if (serverId) {
      const doServidor = onda.get(serverId) ?? new Map();
      const quem = (doServidor.get(chave) ?? []).filter((x) => agora - x.t < LIMITES.ondaMs && x.userId !== userId);
      if (new Set(quem.map((x) => x.userId)).size >= LIMITES.ondaContas - 1) return nega("onda", `c:${canalId}`, true);
    }
  }
  return { ok: true };
}

// a conversa vai acontecer: conta no ritmo e guarda a pergunta (chame depois do `ok`)
export function registrar({ userId, canalId = null, serverId = null, texto = "", agora = Date.now() } = {}) {
  pessoa.set(userId, [...recentes(pessoa.get(userId), HORA, agora), agora]);
  if (canalId) canal.set(canalId, [...recentes(canal.get(canalId), MIN, agora), agora]);
  if (serverId) servidor.set(serverId, [...recentes(servidor.get(serverId), MIN, agora), agora]);
  global = [...recentes(global, MIN, agora), agora];
  const chave = chaveDe(texto);
  if (chave.length >= 4) {
    ultimas.set(userId, [...(ultimas.get(userId) ?? []).filter((x) => agora - x.t < LIMITES.repeticaoMs), { chave, t: agora }].slice(-20));
    if (serverId) {
      const doServidor = onda.get(serverId) ?? new Map();
      doServidor.set(chave, [...(doServidor.get(chave) ?? []).filter((x) => agora - x.t < LIMITES.ondaMs), { userId, t: agora }]);
      if (doServidor.size > 500) doServidor.clear();
      onda.set(serverId, doServidor);
    }
  }
  if (pessoa.size > 20000) pessoa.clear();
  if (ultimas.size > 20000) ultimas.clear();
}

// uma conversa por pessoa: marque ao começar, solte no fim (sempre, num finally)
export function comecou(userId) { if (userId) emVoo.add(userId); }
export function terminou(userId) { emVoo.delete(userId); }

// O aviso curto, no idioma da tela. `null` = não diga nada.
export function textoDoAviso(motivo, lang = "pt") {
  const T = (pt, en, es) => (lang === "es" ? es : lang === "en" ? en : pt);
  switch (motivo) {
    case "longa": return T(`Essa mensagem é longa demais para mim (máximo de ${LIMITES.maxChars} caracteres). Resume que eu respondo.`,
      `That message is too long for me (max ${LIMITES.maxChars} characters). Sum it up and I'll answer.`,
      `Ese mensaje es demasiado largo para mí (máximo ${LIMITES.maxChars} caracteres). Resúmelo y te respondo.`);
    case "jailbreak": return T("Não. Minhas regras não mudam por pedido na conversa.", "No. My rules don't change because someone asks in chat.", "No. Mis reglas no cambian porque alguien lo pida en el chat.");
    case "pede-spam": return T("Não vou repetir em massa nem marcar todo mundo.", "I won't mass-repeat things or ping everyone.", "No voy a repetir en masa ni a mencionar a todo el mundo.");
    case "em-andamento": return T("Ainda estou respondendo a sua mensagem anterior — um momento.", "I'm still answering your previous message — one moment.", "Todavía estoy respondiendo a tu mensaje anterior — un momento.");
    case "ritmo-pessoa": case "ritmo-pessoa-hora": return T("Calma — muitas mensagens para mim em pouco tempo. Espera um pouco e tenta de novo.",
      "Slow down — too many messages to me in a short time. Wait a bit and try again.",
      "Tranquilo — demasiados mensajes para mí en poco tiempo. Espera un poco y vuelve a intentarlo.");
    case "ritmo-canal": case "ritmo-servidor": case "ritmo-global": return T("Estou recebendo pedidos demais agora. Tenta de novo daqui a um minuto.",
      "I'm getting too many requests right now. Try again in a minute.",
      "Estoy recibiendo demasiadas peticiones ahora. Inténtalo de nuevo en un minuto.");
    default: return null;
  }
}
