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

const MAX_MSGS = Number(process.env.CACHE_CANAL_MSGS || 20);
const cache = new Map();   // canalId → [{ id, nome, userId, texto, respondeuAId, respondeuA, ehJudy, momento }]

// Registra uma mensagem no cache do canal. `id` e `respondeuAId` são opcionais.
export function registrar(canalId, { id = null, nome, userId, texto, respondeuA = null, respondeuAId = null, ehJudy = false }) {
  if (!canalId || !texto) return;
  let arr = cache.get(canalId);
  if (!arr) { arr = []; cache.set(canalId, arr); }
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
  const arr = cache.get(canalId) || [];
  return arr.slice(-limite);
}

// `<@ID>` → `@nome` (de quem já falou no canal), ou `@alguém`.
export function mencoesLegiveis(texto, nomes = new Map()) {
  return String(texto ?? "").replace(/<@!?([A-Za-z0-9]{20,32})>/g, (_, id) => `@${nomes.get(id) ?? "alguém"}`);
}
export function nomesDoCanal(canalId) {
  const todas = cache.get(canalId) || [];
  return new Map(todas.filter((m) => m.userId).map((m) => [m.userId, m.ehJudy ? "Judy" : m.nome]));
}

// `excluirId`: a mensagem que está sendo respondida agora (ela vai à parte,
// destacada) — sem isso ela apareceria duas vezes.
export function contexto(canalId, { limite = 12, excluirUltima = false, excluirId = null } = {}) {
  const todas = cache.get(canalId) || [];
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
