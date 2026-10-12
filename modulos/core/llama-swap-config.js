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
export function montarConfigSwap({ conversa, visao, comando, ttlConversa = 3600, ttlVisao = 600 }) {
  const linhas = [
    // 10min de tolerância para o servidor ficar de pé: o padrão de 2min do
    // llama-swap matava cargas lentas (e qualquer download residual) no meio.
    "healthCheckTimeout: 600",
    "models:",
    "  conversa:",
    `    cmd: ${comando(conversa)}`,
    `    ttl: ${ttlConversa}`,
  ];
  if (!visao || visao === conversa) {
    linhas.push("    aliases:", "      - visao");
    // /v1/models lista o apelido também (o &chat status e quem confere a
    // lista de modelos continuam vendo "visao")
    linhas.splice(1, 0, "includeAliasesInList: true");
  } else {
    linhas.push("  visao:", `    cmd: ${comando(visao)}`, `    ttl: ${ttlVisao}`);
  }
  return linhas.join("\n") + "\n";
}
