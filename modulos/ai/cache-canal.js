// ══════════════════════════════════════════════════════════
//  cache-canal.js — memória curta da conversa de cada canal
//
//  Guarda as últimas ~20 mensagens de cada canal (quem falou, o quê, e a
//  quem respondeu). Serve para a Judy entender o CONTEXTO ao vivo: quando
//  ela é chamada, ela vê o fio recente da conversa e percebe se o assunto
//  mudou — mesmo enquanto ela ainda gera uma resposta anterior.
//
//  É memória VOLÁTIL (em RAM), por canal. Não vai para o banco: é o
//  "aqui e agora" do canal, não conhecimento durável.
// ══════════════════════════════════════════════════════════

const MAX_MSGS = Number(process.env.CACHE_CANAL_MSGS || 20);
const cache = new Map();   // canalId → [{ nome, userId, texto, respondeuA, momento }]

// Registra uma mensagem no cache do canal.
export function registrar(canalId, { nome, userId, texto, respondeuA = null }) {
  if (!canalId || !texto) return;
  let arr = cache.get(canalId);
  if (!arr) { arr = []; cache.set(canalId, arr); }
  arr.push({
    nome: nome || "alguém",
    userId: userId || null,
    texto: String(texto).slice(0, 500),
    respondeuA: respondeuA || null,
    momento: Date.now(),
  });
  if (arr.length > MAX_MSGS) arr.shift();
}

// Devolve as mensagens recentes do canal (as mais novas por último).
export function recentes(canalId, limite = MAX_MSGS) {
  const arr = cache.get(canalId) || [];
  return arr.slice(-limite);
}

// Monta um texto legível do fio recente, para injetar no prompt da Judy.
// Mostra quem falou e, quando há, a quem respondeu — assim ela enxerga
// as ramificações (duas conversas paralelas no mesmo canal, por exemplo).
export function contexto(canalId, { limite = 12, excluirUltima = false } = {}) {
  let arr = recentes(canalId, limite);
  if (excluirUltima && arr.length) arr = arr.slice(0, -1);
  if (!arr.length) return "";
  const linhas = arr.map((m) => {
    const resp = m.respondeuA ? ` (respondendo a ${m.respondeuA})` : "";
    return `${m.nome}${resp}: ${m.texto}`;
  });
  return linhas.join("\n");
}

// Limpa o cache de um canal (ex.: comando de reset).
export function limpar(canalId) {
  if (canalId) cache.delete(canalId);
  else cache.clear();
}
