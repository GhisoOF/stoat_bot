// llama-swap-config.js — o /data/llama-swap.yaml que o iniciar.js escreve.
//
// (P4, 2 nov 2026) O chat IA saiu: o bot pede o modelo por PAPEL, e os papéis são só
// os da moderação — "moderacao" (o juiz dos temas proibidos) e "visao" (as imagens).
// Mesmo modelo nos dois (um multimodal) → UMA entrada, e "visao" vira apelido
// (`aliases`) dela: duas entradas com o mesmo `cmd` são, para o llama-swap, dois
// modelos — cada imagem carregaria uma 2ª cópia do mesmo arquivo.
// Modelos diferentes → duas entradas num grupo sem troca (swap: false), não
// exclusivo: os dois ficam na memória juntos, e uma onda de imagens num raid não
// derruba o juiz (nem o contrário). Usa o `groups:` do topo (o formato antigo, que
// todas as versões do llama-swap leem); o bloco `routing.router` novo não pode
// aparecer junto. Sem visão: só o juiz.
// `ctxJuiz` (LLAMA_CTX_MODERACAO): contexto próprio do juiz (as mensagens a julgar
// são curtas); sem ele, o LLAMA_CTX de todos (`ctx`, o padrão do `comando`).
// (P4, 2 nov 2026, revisão) Juiz e visão no MESMO modelo = uma entrada só: ela usa o MAIOR
// dos dois contextos — a imagem precisa do contexto da visão, e um LLAMA_CTX_MODERACAO
// pequeno não pode cortá-lo. Modelos diferentes: cada um com o seu.

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

export function montarConfigSwap({ juiz, visao = null, comando, ttlJuiz = 300, ttlVisao = 600, ctxJuiz = null, ctx = null }) {
  // O formato completo (usuario/repo:quant) o iniciar.js confere no boot com
  // modeloValido; aqui, a última barreira do YAML: nome sem espaço, aspas, #
  // ou quebra de linha, e nenhum `cmd` com mais de uma linha.
  for (const m of [juiz, visao]) {
    if (m != null && !/^[\w.\/:-]{1,200}$/.test(String(m))) throw new Error(`modelo inválido para o llama-swap: ${JSON.stringify(String(m).slice(0, 80))}`);
  }
  if (juiz == null) throw new Error("llama-swap sem o modelo do juiz");
  if (ctxJuiz != null && !/^\d{1,7}$/.test(String(ctxJuiz))) throw new Error("LLAMA_CTX_MODERACAO tem de ser um número inteiro");
  if (ctx != null && !/^\d{1,7}$/.test(String(ctx))) throw new Error("LLAMA_CTX tem de ser um número inteiro");
  const cmd = (...a) => {
    const c = String(comando(...a));
    if (/[\r\n]/.test(c)) throw new Error("comando do llama-swap com quebra de linha");
    return c;
  };
  const mesmo = !!visao && visao === juiz;
  // o mesmo modelo nos dois papéis: o maior contexto (sem `ctx` conhecido, o padrão do comando, que é o da visão)
  const cmdDoJuiz = () => {
    if (!ctxJuiz) return cmd(juiz);
    if (!mesmo) return cmd(juiz, ctxJuiz);
    return ctx == null ? cmd(juiz) : cmd(juiz, String(Math.max(Number(ctxJuiz), Number(ctx))));
  };
  const linhas = [
    // 10min de tolerância para o servidor ficar de pé: o padrão de 2min do
    // llama-swap matava cargas lentas (e qualquer download residual) no meio.
    "healthCheckTimeout: 600",
    "models:",
    "  moderacao:",
    `    cmd: ${cmdDoJuiz()}`,
    `    ttl: ${ttlJuiz}`,
  ];
  if (mesmo) {
    // /v1/models lista o apelido também (o &debug e quem confere a lista de modelos veem "visao")
    linhas.push("    aliases:", "      - visao");
    linhas.splice(1, 0, "includeAliasesInList: true");
  } else if (visao) {
    linhas.push("  visao:", `    cmd: ${cmd(visao)}`, `    ttl: ${ttlVisao}`);
    linhas.push("groups:", "  moderacao:", "    swap: false", "    exclusive: false", "    persistent: true",
      "    members:", "      - moderacao", "      - visao");
  }
  return linhas.join("\n") + "\n";
}
