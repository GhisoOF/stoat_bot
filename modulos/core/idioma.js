// Detector de idioma para textos CURTOS (títulos, consultas de busca).
// O pareceIngles do chat exige 4 palavras inglesas — feito para respostas
// longas; um título de notícia ou uma consulta tem duas ou três.
export const MARCAS_PT = /[ãõçáéíóúâêôà]|\b(n[aã]o|que|com|para|uma|um|dos|das|pela|pelo|sobre|novo|nova|como|mais|terá|ser[aá]|est[aá]|s[aã]o|tem|seu|sua|ap[oó]s|entre|at[eé])\b/i;
export const MARCAS_EN = /\b(the|of|and|to|in|on|at|for|with|is|are|from|by|how|why|what|new|your|its|this|that|after|over|still|into|about|says|will|has|have|was|were|weekly|edition|look|through|released|announces|launches|now|more|than|not|can|you|we|our|it|first|up|out|vs)\b/i;
export function pareceOutroIdioma(texto) {
  const t = String(texto ?? "").replace(/\(CVE-\d{4}-\d+\)/gi, " ").replace(/https?:\/\/\S+/g, " ").replace(/`[^`]*`/g, " ");
  if (!t.trim() || MARCAS_PT.test(t)) return false;
  return MARCAS_EN.test(t);
}

