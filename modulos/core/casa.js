// O servidor da casa: o que está PELO ID em `CHAT_SERVIDORES`/`SERVIDOR`.
//
// Lá o chat e a imagem começam ligados (sem precisar de `&chat on`) e o juiz
// da moderação por IA é o modelo da conversa. O "*" não conta — "em todo
// servidor" não é escolher um.
//
// (22 out 2026) Saiu de modulos/ai/imagem-adulta.js junto com o modo +18:
// "vamos eliminar o NSFW e deixar modelos que tenham bloqueio disso". O
// servidor da casa não libera mais nada de conteúdo adulto — nem canal NSFW.
export function servidorDaCasa(serverId) {
  const lista = (process.env.CHAT_SERVIDORES || process.env.SERVIDOR || "")
    .split(",").map((x) => x.trim()).filter((x) => x && x !== "*");
  return !!serverId && lista.includes(serverId);
}
