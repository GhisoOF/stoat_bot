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

// Monta um texto legível do fio recente, para injetar no prompt da Judy.
// Mostra quem falou e, quando há, a quem respondeu — assim ela enxerga
// as ramificações (duas conversas paralelas no mesmo canal, por exemplo).
export function contexto(canalId, { limite = 12, excluirUltima = false } = {}) {
  let arr = recentes(canalId, limite);
  if (excluirUltima && arr.length) arr = arr.slice(0, -1);
  if (!arr.length) return "";
  // As falas da PRÓPRIA Judy vêm rotuladas como dela, sem ambiguidade.
  //
  //  Até aqui o fio só tinha as mensagens das pessoas — as respostas da Judy
  //  nunca eram registradas. O modelo via "Ghiso: … / Ghiso: Continue /
  //  Ghiso: …" sem nenhuma linha sua no meio, e fazia o que dava: atribuiu
  //  a fala do usuário a si mesma ("minha resposta anterior foi: 'LLM é
  //  Large Language Model'"), não sabia o que "Continue" continuava, e
  //  tratou a própria mensagem citada como algo que o usuário "copiou".
  //
  //  As dela entram truncadas: uma resposta de 4 partes no fio inteira
  //  engoliria o teto de caracteres sozinha.
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
