// llama-swap-config.js — o /data/llama-swap.yaml que o iniciar.js escreve.
//
// O bot pede o modelo por PAPEL: "conversa" e "visao". Com dois modelos
// diferentes, são duas entradas e o llama-swap troca um pelo outro sob
// demanda. Mas em produção o MESMO modelo faz os dois papéis (Gemma 4,
// multimodal, desde 11 set 2026) — e duas entradas com o mesmo `cmd` são,
// para o llama-swap, dois modelos: cada imagem descarregava a conversa e
// carregava uma 2ª cópia do mesmo arquivo, e a volta descarregava de novo.
// Com o E2B (~3 GB) isso custava segundos; com um modelo de 17 GB (Gemma 4
// 26B-A4B) seriam dezenas de segundos por troca, ou duas cópias na RAM.
// Mesmo modelo → UMA entrada, e "visao" vira apelido (`aliases`) dela.
//
// "moderacao" (16 out 2026, MODELO_MODERACAO): um modelo PEQUENO só para o
// juiz da moderação (temas proibidos, &modia). Ele fica num grupo próprio
// sem troca (swap: false), não exclusivo e persistente: carregar a conversa
// não o derruba, e carregar ele não derruba a conversa — os dois ficam na
// memória juntos, e uma onda de mensagens a julgar não trava o chat. Usa o
// `groups:` do topo (o formato antigo, que todas as versões do llama-swap
// leem); o bloco `routing.router` novo não pode aparecer junto.
// Sem visão (só conversa + moderação): nenhuma entrada "visao".
// `ctxModeracao`: contexto próprio do juiz (as mensagens a julgar são curtas;
// com o LLAMA_CTX da conversa, 32k, ele reservava ~1 GB de KV à toa).
export function montarConfigSwap({ conversa, visao, moderacao = null, comando, ttlConversa = 3600, ttlVisao = 600, ttlModeracao = ttlConversa, ctxModeracao = null }) {
  const linhas = [
    // 10min de tolerância para o servidor ficar de pé: o padrão de 2min do
    // llama-swap matava cargas lentas (e qualquer download residual) no meio.
    "healthCheckTimeout: 600",
    "models:",
    "  conversa:",
    `    cmd: ${comando(conversa)}`,
    `    ttl: ${ttlConversa}`,
  ];
  const apelidos = [];
  if (visao === conversa || visao === undefined) apelidos.push("visao");
  if (moderacao && moderacao === conversa) apelidos.push("moderacao");
  if (apelidos.length) {
    linhas.push("    aliases:", ...apelidos.map((a) => `      - ${a}`));
    // /v1/models lista o apelido também (o &chat status e quem confere a
    // lista de modelos continuam vendo "visao")
    linhas.splice(1, 0, "includeAliasesInList: true");
  }
  if (visao && visao !== conversa) {
    linhas.push("  visao:", `    cmd: ${comando(visao)}`, `    ttl: ${ttlVisao}`);
  }
  if (moderacao && moderacao !== conversa) {
    linhas.push("  moderacao:", `    cmd: ${ctxModeracao ? comando(moderacao, ctxModeracao) : comando(moderacao)}`, `    ttl: ${ttlModeracao}`);
    linhas.push("groups:", "  moderacao:", "    swap: false", "    exclusive: false", "    persistent: true",
      "    members:", "      - moderacao");
  }
  return linhas.join("\n") + "\n";
}
