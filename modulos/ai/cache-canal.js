
const MAX_MSGS = Number(process.env.CACHE_CANAL_MSGS || 20);
const cache = new Map();   // canalId → [{ nome, userId, texto, respondeuA, momento }]

// Registra uma mensagem no cache do canal.
export function registrar(canalId, { nome, userId, texto, respondeuA = null, ehJudy = false }) {
  if (!canalId || !texto) return;
  let arr = cache.get(canalId);
  if (!arr) { arr = []; cache.set(canalId, arr); }
  arr.push({
    nome: nome || "alguém",
    ehJudy: !!ehJudy,
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

export function contexto(canalId, { limite = 12, excluirUltima = false } = {}) {
  let arr = recentes(canalId, limite);
  if (excluirUltima && arr.length) arr = arr.slice(0, -1);
  if (!arr.length) return "";
  const linhas = arr.map((m) => {
    const resp = m.respondeuA ? ` (respondendo a ${m.respondeuA})` : "";
    if (m.ehJudy) {
      const t = String(m.texto ?? "");
      const curto = t.length > 400 ? `${t.slice(0, 400)}… [resposta continua]` : t;
      return `Judy (VOCÊ MESMA, sua resposta anterior): ${curto}`;
    }
    return `${m.nome}${resp}: ${m.texto}`;
  });
  return linhas.join("\n");
}

// Limpa o cache de um canal (ex.: comando de reset).
export function limpar(canalId) {
  if (canalId) cache.delete(canalId);
  else cache.clear();
}
