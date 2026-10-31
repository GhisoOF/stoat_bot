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
//
// (31 out 2026, R10) O que vem do .env e entra na linha de comando do llama ou
// no YAML passa por aqui antes. Um MODELO com quebra de linha escrevia chaves
// novas no YAML; um LLAMA_FLAGS com `--host 0.0.0.0` abria o modelo para a rede.

// Modelo no formato -hf do llama.cpp: usuario/repositorio[:quantizacao].
// Regex fechada (âncoras, classes simples, sem grupos aninhados = sem ReDoS);
// começa por letra ou dígito (nada de "-…" virando flag) e não aceita "..".
const MODELO_HF = /^(?!.*\.\.)[A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95}(?::[A-Za-z0-9][\w.-]{0,47})?$/;
export const modeloValido = (m) => typeof m === "string" && MODELO_HF.test(m);

// Flags que o .env NÃO pode passar ao llama-server: endereço, porta, chave e
// arquivos servidos são do iniciar.js (os serviços ficam em 127.0.0.1).
const FLAGS_PROIBIDAS = ["--host", "--port", "--api-key", "--api-key-file", "--path"];
// um "pedaço" de flag: letras, dígitos e . , = + / _ - (e ":" no meio); nada
// de aspas, $, espaço, # ou quebra de linha — que mudariam o YAML ou o shell
const PEDACO = /^[\w.,=+\/-]+(?::[\w.,=+\/-]+)*$/;

// LLAMA_FLAGS → lista de argumentos. Inválido lança erro (o boot para).
export function flagsDoLlama(texto = "") {
  const pedacos = String(texto).trim().split(/\s+/).filter(Boolean);
  for (const p of pedacos) {
    const nome = p.split("=")[0].toLowerCase();
    if (FLAGS_PROIBIDAS.includes(nome)) throw new Error(`LLAMA_FLAGS não pode ter ${nome} (endereço, porta e chave são fixos)`);
    if (!PEDACO.test(p)) throw new Error(`LLAMA_FLAGS: "${p.slice(0, 40)}" tem caractere não aceito`);
  }
  return pedacos;
}

export function montarConfigSwap({ conversa, visao, moderacao = null, comando, ttlConversa = 3600, ttlVisao = 600, ttlModeracao = ttlConversa, ctxModeracao = null }) {
  // O formato completo (usuario/repo:quant) o iniciar.js confere no boot com
  // modeloValido; aqui, a última barreira do YAML: nome sem espaço, aspas, #
  // ou quebra de linha, e nenhum `cmd` com mais de uma linha.
  for (const m of [conversa, visao, moderacao]) {
    if (m != null && !/^[\w.\/:-]{1,200}$/.test(String(m))) throw new Error(`modelo inválido para o llama-swap: ${JSON.stringify(String(m).slice(0, 80))}`);
  }
  if (ctxModeracao != null && !/^\d{1,7}$/.test(String(ctxModeracao))) throw new Error("LLAMA_CTX_MODERACAO tem de ser um número inteiro");
  const cmd = (...a) => {
    const c = String(comando(...a));
    if (/[\r\n]/.test(c)) throw new Error("comando do llama-swap com quebra de linha");
    return c;
  };
  const linhas = [
    // 10min de tolerância para o servidor ficar de pé: o padrão de 2min do
    // llama-swap matava cargas lentas (e qualquer download residual) no meio.
    "healthCheckTimeout: 600",
    "models:",
    "  conversa:",
    `    cmd: ${cmd(conversa)}`,
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
    linhas.push("  visao:", `    cmd: ${cmd(visao)}`, `    ttl: ${ttlVisao}`);
  }
  if (moderacao && moderacao !== conversa) {
    linhas.push("  moderacao:", `    cmd: ${ctxModeracao ? cmd(moderacao, ctxModeracao) : cmd(moderacao)}`, `    ttl: ${ttlModeracao}`);
    linhas.push("groups:", "  moderacao:", "    swap: false", "    exclusive: false", "    persistent: true",
      "    members:", "      - moderacao");
  }
  return linhas.join("\n") + "\n";
}
