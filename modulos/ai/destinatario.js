// Para quem é a mensagem? (1 out 2026)
//
// No Stoat, RESPONDER a uma mensagem da Judy com a menção ligada põe o id dela
// em mentionIds — mesmo quando o texto fala com outra pessoa. Foi o caso de
// "@Not Bob são que horas em Goiás?" (resposta a uma mensagem da Judy): a
// Judy respondeu uma pergunta que era para o Not Bob.
//
// Regra: menção ESCRITA à Judy no texto → é com ela. Só a menção da resposta
// (o "ping" de responder) → é com ela, a não ser que o texto mencione outra
// pessoa por escrito — aí a conversa é com essa pessoa.

export function mencoesNoTexto(conteudo) {
  return [...String(conteudo ?? "").matchAll(/<@!?([A-Za-z0-9]{20,32})>/g)].map((m) => m[1]);
}

export function dirigidoAoBot({ conteudo, mentionIds = [], botId }) {
  if (!botId) return false;
  const escritas = mencoesNoTexto(conteudo);
  if (escritas.includes(botId)) return true;
  const pingDaResposta = Array.isArray(mentionIds) && mentionIds.includes(botId);
  if (!pingDaResposta) return false;
  return !escritas.some((id) => id !== botId);
}
