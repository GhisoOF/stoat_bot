// O fio recente de cada canal — o "o que estava rolando" que a IA lê.
//
// Problemas vistos em 1 out 2026 (#chat principal):
//   • as perguntas feitas À Judy (com menção) não entravam no fio, mas as
//     respostas dela sim: o modelo via respostas soltas, sem a pergunta, e a
//     última fala de OUTRA pessoa parecia ser o assunto ("o que acha de minha
//     pessoa?" foi respondido com a mensagem da krayaend);
//   • "respondendo a…" nunca aparecia (o main lia `reply_ids`, que a stoat.js
//     não tem — o campo é `replyIds`);
//   • menções chegavam cruas: `<@01KZS973…>` no lugar de um nome.
// Agora cada mensagem guarda o id, a quem respondeu vira um NOME, e as
// menções viram `@nome`.

import { MapaCurto } from "./mapa-curto.js";

const MAX_MSGS = Number(process.env.CACHE_CANAL_MSGS || 20);
// (31 out 2026, P1, R9/R11) O fio vive 30 min (a PRIVACIDADE.md promete "os últimos
// minutos") e no máximo 2000 canais: canal parado sai inteiro, mensagem velha sai do fio.
const PRAZO_MS = 30 * 60_000;
const cache = new MapaCurto({ ttlMs: PRAZO_MS, max: 2000 });   // canalId → [{ id, nome, userId, texto, respondeuAId, respondeuA, ehJudy, momento }]
const vivas = (arr) => (arr || []).filter((m) => Date.now() - m.momento <= PRAZO_MS);

// Registra uma mensagem no cache do canal. `id` e `respondeuAId` são opcionais.
export function registrar(canalId, { id = null, nome, userId, texto, respondeuA = null, respondeuAId = null, ehJudy = false }) {
  if (!canalId || !texto) return;
  const arr = vivas(cache.get(canalId));
  cache.set(canalId, arr);   // renova o prazo do canal
  if (id && arr.some((m) => m.id === id)) return;   // a mesma mensagem não entra duas vezes
  arr.push({
    id: id || null,
    nome: nome || "alguém",
    ehJudy: !!ehJudy,
    userId: userId || null,
    texto: String(texto).slice(0, 500),
    respondeuA: respondeuA || null,
    respondeuAId: respondeuAId || null,
    momento: Date.now(),
  });
  if (arr.length > MAX_MSGS) arr.shift();
}

// Devolve as mensagens recentes do canal (as mais novas por último).
export function recentes(canalId, limite = MAX_MSGS) {
  return vivas(cache.get(canalId)).slice(-limite);
}

// Os canais com fio vivo (o `&chat esquecer tudo` filtra os do servidor dele).
export function canais() {
  return [...cache.podar().keys()];
}

// `<@ID>` → `@nome` (de quem já falou no canal), ou `@alguém`.
export function mencoesLegiveis(texto, nomes = new Map()) {
  return String(texto ?? "").replace(/<@!?([A-Za-z0-9]{20,32})>/g, (_, id) => `@${nomes.get(id) ?? "alguém"}`);
}
// Menções que a JUDY escreve (12 out 2026): "crie um ship aleatório meu" saiu
// com `<@01M3NGY6WP3CB4GESV5DRYVV1T:>` — um ID que não existe (01M… seria uma
// data de 2027: inventado) e com ":" que o Stoat não entende; na tela, lixo.
// Ela nunca vê IDs (o fio mostra @nome), então quem decide é o código:
//   • `<@ID>`, `<@!ID>`, `<@ID:>` de alguém que está MESMO na conversa → menção limpa;
//     ID que ninguém conhece → "@alguém" (nunca um ID inventado);
//   • `@Nome` de quem está na conversa → menção de verdade `<@id>`.
const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function mencoesReais(texto, { pessoas = new Map(), botId = null } = {}) {
  let t = String(texto ?? "");
  t = t.replace(/<@!?\s*([0-9A-Za-z]{10,40})\s*[:;,.]?\s*>/g, (_, id) => (pessoas.has(id) && id !== botId ? `<@${id}>` : "@alguém"));
  const nomes = [...pessoas.entries()]
    .filter(([id, n]) => id !== botId && typeof n === "string" && n.trim().length >= 2 && !/^(judy|alguém|alguem)$/i.test(n.trim()))
    .sort((a, b) => b[1].length - a[1].length);   // "Ana Clara" antes de "Ana"
  for (const [id, nome] of nomes) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}<@])@${escapar(nome.trim())}(?![\\p{L}\\p{N}])`, "giu");
    t = t.replace(re, (_, antes) => `${antes}<@${id}>`);
  }
  return t;
}

export function nomesDoCanal(canalId) {
  const todas = vivas(cache.get(canalId));
  return new Map(todas.filter((m) => m.userId).map((m) => [m.userId, m.ehJudy ? "Judy" : m.nome]));
}

// `excluirId`: a mensagem que está sendo respondida agora (ela vai à parte,
// destacada) — sem isso ela apareceria duas vezes.
export function contexto(canalId, { limite = 12, excluirUltima = false, excluirId = null } = {}) {
  const todas = vivas(cache.get(canalId));
  const nomes = nomesDoCanal(canalId);
  const porId = new Map(todas.filter((m) => m.id).map((m) => [m.id, m]));
  let arr = todas.filter((m) => !excluirId || m.id !== excluirId).slice(-limite);
  if (excluirUltima && arr.length) arr = arr.slice(0, -1);
  if (!arr.length) return "";
  const linhas = arr.map((m) => {
    const alvo = m.respondeuAId ? porId.get(m.respondeuAId) : null;
    const quem = alvo ? (alvo.ehJudy ? "Judy (você)" : alvo.nome) : m.respondeuA;
    const resp = quem ? ` (respondendo a ${quem})` : "";
    if (m.ehJudy) {
      const t = mencoesLegiveis(m.texto, nomes);
      const curto = t.length > 400 ? `${t.slice(0, 400)}… [resposta continua]` : t;
      return `Judy (VOCÊ MESMA, sua resposta anterior): ${curto}`;
    }
    return `${m.nome}${resp}: ${mencoesLegiveis(m.texto, nomes)}`;
  });
  return linhas.join("\n");
}

// Limpa o cache de um canal (ex.: comando de reset).
export function limpar(canalId) {
  if (canalId) cache.delete(canalId);
  else cache.clear();
}
