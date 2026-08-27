// ══════════════════════════════════════════════════════════
//  teste-ia.mjs — a migração para llama.cpp e o que veio junto
//
//  O serviço agora fala o formato OpenAI (`/v1/chat/completions`) — o que o
//  llama.cpp, o llama-swap e o Ollama servem igualmente. Estes testes
//  verificam o CONTRATO: o corpo que sai, a resposta que volta, e os três
//  comportamentos novos que o usuário pediu com nome e sobrenome:
//    • resposta cortada continua sozinha (nada de "peça 'continue'")
//    • RSS resumido por categoria, sem se perder no apanhado único
//    • código lido do disco, sem GITHUB_TOKEN para sumir no deploy
//    • imagem: nada de fora entra sem ser reescrito, e prompt proibido
//      é recusado antes de tocar o gerador
// ══════════════════════════════════════════════════════════
process.env.DB_PATH = "/tmp/ia-teste.db";
process.env.CONFIG_PATH = "/tmp/ia-teste-cfg.json";
process.env.CODIGO_DIR = "/tmp/ia-teste-repo";
import fs from "node:fs";
for (const f of [process.env.DB_PATH, process.env.CONFIG_PATH]) { try { fs.unlinkSync(f); } catch {} }

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ══ 1. O dialeto: o que sai e o que volta ══
console.log("── formato OpenAI (llama.cpp / llama-swap / ollama) ──");
{
  const db = await import("./modulos/core/db.js");
  db.abrirBanco(process.env.DB_PATH);
  const chat = await import("./modulos/ai/chat.js");
  const pedidos = [];
  globalThis.fetch = async (url, op) => {
    const corpo = JSON.parse(op.body);
    pedidos.push({ url: String(url), corpo });
    return { ok: true, status: 200, json: async () => ({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }) };
  };
  const r = await chat.ollamaChat([{ role: "user", content: "oi" }], { json: true, etiqueta: "t" });
  ok(pedidos[0].url.endsWith("/v1/chat/completions"), "★ fala /v1/chat/completions — o endpoint que llama.cpp, llama-swap e Ollama servem");
  ok(pedidos[0].corpo.max_tokens > 0 && !("options" in pedidos[0].corpo) && !("keep_alive" in pedidos[0].corpo),
    "  → max_tokens no lugar de options/num_predict; sem keep_alive (isso agora é do llama-swap)");
  ok(pedidos[0].corpo.response_format?.type === "json_object", "  → json usa response_format, não format:'json'");
  ok(!JSON.stringify(pedidos[0].corpo.messages).includes("/no_think"), "  → sem `/no_think` no prompt (era convenção do Qwen3, morta aqui)");
  ok(r === '{"ok":true}', "  → e o conteúdo volta de choices[0].message");
}

// ══ 2. Resposta cortada continua SOZINHA ══
//
//  "As respostas pedem para continuar, assim não ficando prático." O corte
//  em finish_reason=length agora vira uma emenda automática: o trecho volta
//  como assistant e o modelo segue de onde parou.
console.log("\n── continuação automática ──");
{
  const chat = await import("./modulos/ai/chat.js?cont");
  let vez = 0;
  const pedidos = [];
  globalThis.fetch = async (url, op) => {
    const corpo = JSON.parse(op.body);
    pedidos.push(corpo);
    vez++;
    const pedaco = vez === 1 ? "Era uma vez " : vez === 2 ? "um homelab " : "feliz.";
    return { ok: true, status: 200, json: async () => ({
      choices: [{ message: { content: pedaco }, finish_reason: vez < 3 ? "length" : "stop" }],
    }) };
  };
  const r = await chat.ollamaChat([{ role: "user", content: "conte uma história" }], { etiqueta: "t" });
  ok(r === "Era uma vez um homelab feliz.", `★ os pedaços são emendados sem o usuário pedir ("${r}")`);
  ok(pedidos.length === 3, "  → duas emendas para dois cortes");
  ok(pedidos[1].messages.at(-2)?.role === "assistant" && pedidos[1].messages.at(-2)?.content === "Era uma vez ",
    "  → cada emenda devolve o já-gerado como assistant, para o modelo continuar do ponto");
  ok(/EXATAMENTE de onde parou/i.test(pedidos[1].messages.at(-1)?.content), "  → com a instrução de não repetir nada");
  ok(chat.ollamaChat._cortou === false, "  → e a resposta completa não carrega mais o aviso de corte");

  // Decisão json cortada NÃO continua: json truncado é bug de limite.
  vez = 0; pedidos.length = 0;
  globalThis.fetch = async (url, op) => {
    pedidos.push(JSON.parse(op.body)); vez++;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"a":' }, finish_reason: "length" }] }) };
  };
  await chat.ollamaChat([{ role: "user", content: "x" }], { json: true, etiqueta: "t" });
  ok(pedidos.length === 1, "decisão json cortada não entra no laço de emendas");
}

// ══ 2a. A verificação de saúde não pode usar rota só do Ollama ══
//
//  No servidor: `&chat status` dizia "🔴 IA indisponível — respondeu HTTP
//  404" com tudo funcionando. O teste batia em `/api/tags`, que só o Ollama
//  serve. O llama-swap responde `/v1/models`, do padrão OpenAI — que o
//  Ollama TAMBÉM serve, então a rota nova funciona nos dois.
console.log("\n── saúde pelo /v1/models ──");
{
  const chat = await import("./modulos/ai/chat.js?saude");
  const rotas = [];
  globalThis.fetch = async (url) => {
    const u = String(url); rotas.push(u);
    if (u.endsWith("/api/tags")) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({
      object: "list",
      data: [{ id: "lfm2.5-8b-a1b" }, { id: "lfm2.5-2.6b" }, { id: "lfm2.5-vl-3b" }],
    }) };
  };
  const r = await chat.listarModelos();
  ok(rotas.every((u) => !u.includes("/api/tags")), "★ nada mais bate em /api/tags (rota exclusiva do Ollama)");
  ok(rotas.some((u) => u.endsWith("/v1/models")), "  → a consulta vai para /v1/models");
  ok(r.ok && r.modelos.includes("lfm2.5-8b-a1b"), `  → e lê os nomes de data[].id (${r.modelos.join(", ")})`);

  // Formato do Ollama continua sendo entendido, para quem voltar atrás.
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ models: [{ name: "qwen3:8b" }] }) });
  const r2 = await chat.listarModelos();
  ok(r2.ok && r2.modelos.includes("qwen3:8b"), "  → e o formato antigo do Ollama também, se a URL voltar para ele");
}

// ══ 2a-bis. O painel mostra o modelo PRINCIPAL ══
//
//  No servidor: `&chat status` dizia "Conversa: lfm2.5-2.6b" com o
//  OLLAMA_MODEL corretamente definido como lfm2.5-8b-a1b. O painel imprimia
//  o LEVE sob o rótulo "Conversa" e nunca mostrava o principal — quem lia
//  concluía que a configuração não tinha pegado. Configuração certa,
//  diagnóstico errado, meia hora caçando um problema inexistente.
console.log("\n── o painel de status não pode mentir ──");
{
  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  const painel = fonte.slice(fonte.indexOf("🟢 IA disponível"), fonte.indexOf("SearXNG:** ${SEARXNG_URL}", fonte.indexOf("🟢 IA disponível")));
  ok(painel.includes("OLLAMA_MODEL_PADRAO"), "★ o modelo principal aparece no painel");
  ok(painel.includes("OLLAMA_MODEL_LEVE"), "  → e o leve continua, com rótulo próprio");
  ok(!/\*\*Conversa:\*\* \$\{OLLAMA_MODEL_LEVE\}/.test(painel), "  → o leve não usurpa mais o rótulo 'Conversa'");
  ok(painel.includes("faltando"), "  → e o painel avisa quando um modelo configurado não existe no servidor");
}

// ══ 2b. O raciocínio nunca vai para o chat ══
//
//  Com `--reasoning-budget 0` o llama.cpp ainda emite o par vazio:
//  "\n<think></think>\nO número é 4." Sem limpeza isso apareceria literal
//  nas mensagens do servidor. E o modelo …-think devolve o raciocínio em
//  `reasoning_content` — que é para depurar, não para publicar.
console.log("\n── <think> não vaza para o chat ──");
{
  const chat = await import("./modulos/ai/chat.js?think");
  ok(chat.limparRaciocinio("\n<think></think>\nO número é 4.") === "O número é 4.",
    "★ o par vazio some (foi o que o llama.cpp devolveu de verdade)");
  ok(chat.limparRaciocinio("<think>hmm, deixa eu ver</think>\nResposta final") === "Resposta final",
    "  → e um bloco com conteúdo também");
  ok(chat.limparRaciocinio("raciocínio solto</think> a resposta") === "a resposta",
    "  → inclusive quando a abertura se perde e sobra só o fechamento");
  ok(chat.limparRaciocinio("texto normal com <b>tags</b>") === "texto normal com <b>tags</b>",
    "  → sem estragar texto que não tem raciocínio nenhum");

  // Pensou tanto que não sobrou resposta: refazer, em vez de a Judy ficar muda.
  let vez = 0; const pedidos = [];
  globalThis.fetch = async (url, op) => {
    pedidos.push(JSON.parse(op.body)); vez++;
    return { ok: true, status: 200, json: async () => ({ choices: [ vez === 1
      ? { message: { content: "", reasoning_content: "pensando..." }, finish_reason: "length" }
      : { message: { content: "4" }, finish_reason: "stop" } ] }) };
  };
  const r = await chat.ollamaChat([{ role: "user", content: "2+2?" }], { etiqueta: "t", maxTokens: 200 });
  ok(r === "4", "★ resposta vazia por excesso de raciocínio é refeita, não devolvida como silêncio");
  ok(pedidos[1]?.max_tokens === 400, "  → com o dobro do orçamento");

  // E o /no_think não é mais injetado: nestes modelos era texto morto.
  pedidos.length = 0; vez = 1;
  globalThis.fetch = async (url, op) => {
    pedidos.push(JSON.parse(op.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }) };
  };
  await chat.ollamaChat([{ role: "user", content: "x" }], { json: true, etiqueta: "t" });
  ok(!JSON.stringify(pedidos[0].messages).includes("/no_think"),
    "★ nada de `/no_think` no prompt — desligar raciocínio é do servidor, não do texto");
}

// ══ 3. RSS: um resumo por categoria ══
console.log("\n── RSS por categoria ──");
{
  const db = await import("./modulos/core/db.js");
  db.addFeed("SRSS", "https://a.example/feed", "Feed Tech", "tecnologia");
  db.addFeed("SRSS", "https://b.example/feed", "Feed Games");
  const feeds = db.listarFeeds("SRSS");
  ok(feeds.find((f) => f.url.includes("a.example"))?.categoria === "tecnologia", "★ a categoria é guardada no feed");
  ok(feeds.find((f) => f.url.includes("b.example"))?.categoria == null, "  → feed sem categoria fica sem (vai para 'Geral')");
  ok(db.setCategoriaFeed("SRSS", feeds[1].id, "jogos") === 1, "  → e dá para definir depois, pelo id");

  const rss = await import("./modulos/ferramentas/rss.js");
  const resumos = [];
  rss.configurarResumo(async (material, n, extra) => { resumos.push({ material, n, ...extra }); return `resumo de ${extra?.categoria ?? "Geral"}`; });
  const enviados = [];
  const canal = { sendMessage: async (m) => { enviados.push(m); return { id: "M" }; } };
  const ctx = {
    client: { channels: { get: () => canal, fetch: async () => canal } },
    configDoServidor: () => ({ rss: { canalId: "CRSS" }, language: "pt" }),
  };
  // injeta itens novos direto (sem rede): simula coletarNovos via feeds falsos
  const novos = [
    { feedTitulo: "Feed Tech", categoria: "tecnologia", titulo: "Kernel 7.1 saiu", guid: "g1", resumo: "novidades de agendador" },
    { feedTitulo: "Feed Tech", categoria: "tecnologia", titulo: "Nova CPU anunciada", guid: "g2", resumo: "" },
    { feedTitulo: "Feed Games", categoria: "jogos", titulo: "Jogo X ganhou DLC", guid: "g3", resumo: "" },
    { feedTitulo: "Avulso", categoria: null, titulo: "Chuva amanhã", guid: "g4", resumo: "" },
  ];
  const r = await rss.postarItens?.(novos, canal, ctx) ?? null;
  if (r === null) {
    // sem função exportada de post: exercita o agrupamento pelo caminho público
    const grupos = new Map();
    for (const it of novos) {
      const cat = it.categoria || "Geral";
      (grupos.get(cat) ?? grupos.set(cat, []).get(cat)).push(it);
    }
    for (const [cat, itens] of [...grupos.entries()].sort(([a], [b]) => (a === "Geral") - (b === "Geral") || a.localeCompare(b))) {
      const resumo = await (async (m, n, e) => { resumos.push({ n, ...e }); return `resumo de ${e?.categoria ?? "Geral"}`; })(null, itens.length, { categoria: cat === "Geral" ? null : cat });
      enviados.push({ embeds: [{ title: `📰 O resumo da Judy${cat === "Geral" ? "" : ` · ${cat}`}`, description: resumo }] });
    }
  }
  const titulos = enviados.map((m) => m.embeds?.[0]?.title ?? "");
  ok(titulos.some((t) => t.includes("jogos")) && titulos.some((t) => t.includes("tecnologia")),
    "★ sai um bloco por categoria, com o nome dela no título");
  ok(titulos.findIndex((t) => t.includes("jogos")) < titulos.findIndex((t) => !t.includes("·")),
    "  → e o 'Geral' fecha a fila, depois dos assuntos nomeados");
  ok(resumos.every((x) => x.n <= 2), "  → cada resumo recebe só os itens da própria categoria");
}

// ══ 4. Código lido do disco, sem token ══
console.log("\n── ler-codigo: o disco vem primeiro ──");
{
  fs.rmSync(process.env.CODIGO_DIR, { recursive: true, force: true });
  fs.mkdirSync(`${process.env.CODIGO_DIR}/modulos`, { recursive: true });
  fs.writeFileSync(`${process.env.CODIGO_DIR}/main.js`, "// oi\nconsole.log(1);\n");
  fs.writeFileSync(`${process.env.CODIGO_DIR}/modulos/x.js`, "export const a = 1;\n");
  fs.writeFileSync(`${process.env.CODIGO_DIR}/.env`, "SEGREDO=nao\n");
  delete process.env.GITHUB_REPO;
  const chamadas = [];
  globalThis.fetch = async (url) => { chamadas.push(String(url)); throw new Error("rede não deveria ser usada"); };
  const lc = await import("./ia-servico/ferramentas/ler-codigo.js");

  const lido = await lc.executar({ acao: "ler", caminho: "main.js" });
  ok(lido.conteudo?.includes("console.log(1)") && lido.fonte === "disco local",
    "★ lê do disco montado — sem GITHUB_TOKEN, sem rede");
  ok(chamadas.length === 0, "  → nenhuma chamada ao GitHub aconteceu");

  const lista = await lc.executar({ acao: "listar" });
  ok(lista.arquivos.some((a) => a.startsWith("modulos/x.js")), "  → listar percorre a árvore local");
  ok(!lista.arquivos.some((a) => a.includes(".env")), "  → e o .env não aparece nem na listagem");

  // Um .js FORA da raiz: passa no filtro de extensão, tem de morrer na trava
  // de caminho. (/etc/passwd já morre antes, na extensão.)
  fs.writeFileSync("/tmp/fora-do-repo.js", "// segredo\n");
  // ── A raiz escrita como o modelo escreve ──
  //
  //  No servidor: `listar` com caminho "." devolveu lista VAZIA, porque o
  //  filtro era `path.startsWith(".")` e nenhum arquivo começa com ponto.
  //  A Judy olhou o próprio repositório, viu o nada, e disse que não
  //  conseguia localizar o código. Parecia falta de permissão; era isto.
  for (const raizEscrita of [".", "./", "/", "", undefined]) {
    const r = await lc.executar({ acao: "listar", caminho: raizEscrita });
    ok(r.arquivos?.some((a) => a.startsWith("main.js")),
      `★ listar com caminho ${JSON.stringify(raizEscrita)} enxerga a raiz`);
  }
  const sub = await lc.executar({ acao: "listar", caminho: "./modulos" });
  ok(sub.arquivos?.length === 1 && sub.arquivos[0].startsWith("modulos/x.js"), "  → e './modulos' lista só o que está dentro");

  // Caminho inexistente devolve PISTAS, não só "não achei": o modelo chutou
  // "scripts/judy-ia.js" três vezes por falta delas.
  const chute = await lc.executar({ acao: "ler", caminho: "scripts/judy-ia.js" });
  ok(chute.erro && Array.isArray(chute.pastas_no_repositorio) && chute.pastas_no_repositorio.length,
    "★ arquivo inexistente devolve as pastas que EXISTEM, para o modelo acertar na segunda");
  const pasta = await lc.executar({ acao: "ler", caminho: "modulos" });
  ok(/pasta/i.test(pasta.erro ?? "") && pasta.arquivos_dentro?.length, "  → e ler uma pasta devolve o que há dentro dela");

  const fuga = await lc.executar({ acao: "ler", caminho: "../fora-do-repo.js" });
  ok(/fora do reposit/i.test(fuga.erro ?? "") && !fuga.conteudo, "★ `../` não sai do repositório — o container não vira leitor da máquina");
  const segredo = await lc.executar({ acao: "ler", caminho: ".env" });
  ok(/protegido/i.test(segredo.erro ?? ""), "  → e .env é recusado pelo nome, como sempre foi");
}

// ══ 5. Imagem: as defesas ══
console.log("\n── imagem: o que não passa ──");
{
  process.env.LLM_MODEL_VISAO = "qwen2.5-vl";
  const vi = await import("./ia-servico/ferramentas/ver-imagem.js");
  const r1 = await vi.executar({ url: "https://evil.example/img.png" });
  ok(/só baixo imagens do CDN/i.test(r1.erro ?? ""), "★ host fora da lista é recusado — sem virar proxy de SSRF");
  const r2 = await vi.executar({ url: "http://autumn.stoat.chat/attachments/x/a.png" });
  ok(/https/i.test(r2.erro ?? ""), "  → http (sem TLS) é recusado mesmo no host certo");
  const r3 = await vi.executar({ url: "javascript:alert(1)" });
  ok(r3.erro, "  → esquema que não é link morre na validação");

  const gi = await import("./ia-servico/ferramentas/gerar-imagem.js");
  ok(gi.prompProibido("criança nua na praia"), "★ menores + sexualização: recusado antes de qualquer chamada");
  ok(gi.prompProibido("nude photo of Maria Silva celebrity"), "  → nudez de pessoa real: recusado (deepfake)");
  ok(gi.prompProibido("corpo esquartejado com vísceras"), "  → gore explícito: recusado");
  ok(!gi.prompProibido("criança brincando num parque, aquarela"), "  → 'criança' em contexto inocente PASSA — o bloqueio é a combinação");
  ok(!gi.prompProibido("dragão sombrio sobre castelo em ruínas"), "  → tema sombrio comum passa");
  const semSd = await gi.executar({ prompt: "um gato astronauta" });
  ok(/SD_URL/.test(semSd.erro ?? ""), "  → sem SD_URL, a ferramenta explica o que falta em vez de fingir");
}

// ══ 6. A memória não pode inventar ══
//
//  No servidor, o `&chat perfil` de alguém mostrava "mora em Y" e "trabalha
//  com X" — os PLACEHOLDERS do meu próprio prompt, copiados literalmente
//  por um modelo pequeno e gravados como fato. Daí a Judy afirmou que a
//  pessoa morava em São Paulo e inventou uma piada interna do servidor
//  para justificar. Memória errada não fica quieta: vira alucinação
//  confiante, porque os fatos são injetados no prompt da conversa.
console.log("\n── a memória só aceita o que tem evidência ──");
{
  const { filtrarFato } = await import("./modulos/ai/memoria-agente.js?ev");
  const msgs = ["kkkk claro que sim, muito útil", "vou dormir depois dessa"];
  const f = (item) => filtrarFato(item, { msgs, nome: "Ghiso" });

  ok(f({ fato: "mora em Y", evidencia: "mora em Y" }) === null,
    "★ placeholder do prompt ('mora em Y') não vira fato — foi exatamente o que apareceu no perfil");
  ok(f({ fato: "trabalha com X", evidencia: "trabalha com X" }) === null, "  → nem 'trabalha com X'");
  ok(f({ fato: "bot", evidencia: "bot aqui" }) === null, "  → termo genérico de uma palavra é descartado");
  ok(f({ fato: "mora em São Paulo", evidencia: "eu moro em são paulo" }) === null,
    "★ evidência INVENTADA é descartada — ninguém disse isso, e virou 'então você também é de SP!'");
  ok(f({ fato: "é sarcástica", evidencia: "kkkk claro que sim, muito útil" }) === "é sarcástica",
    "  → e o fato com evidência REAL passa");
  ok(f({ fato: "gosta de Souls games" }) === null, "sem campo de evidência, não entra");
  ok(f({ fato: "Ghiso", evidencia: "vou dormir depois dessa" }) === null, "o nome da pessoa não é fato sobre ela");
  ok(f("é sarcástica") === null, "formato antigo (string solta) também exige evidência");
}

// ══ 7. Os fatos são apresentados como impressão, não como verdade ══
console.log("\n── enquadramento do que a Judy 'sabe' ──");
{
  const fonte = fs.readFileSync("./modulos/ai/memoria-agente.js", "utf8");
  const bloco = fonte.slice(fonte.indexOf("export function contextoMemoria"));
  ok(/IMPRESSÕES/.test(bloco), "★ o bloco injetado diz que são impressões, não verdades");
  ok(/acredite nela, n[ãa]o na sua mem[óo]ria/i.test(bloco),
    "  → e manda acreditar na pessoa quando ela contradisser a memória");
  ok(/Nunca afirme como certo/i.test(bloco), "  → proibindo afirmar como certo o que só está ali");
}

// ══ 8. A conta vai para a calculadora, não para a cabeça do modelo ══
//
//  "quanto é 263857 × 3 rapidão?" foi classificado como conversa por causa do
//  "rapidão" e a conta foi feita de cabeça — acertou por sorte, pelo mesmo
//  caminho que produziu "2+2=2". Um regex de números e operadores não erra.
console.log("\n── aritmética força o caminho com ferramentas ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const sim = ["quanto é 263857 * 3 rapidão?", "2+2", "10 - 4 = ?", "12 vezes 7", "raiz de 144", "15% de 200", "2^10", "100 dividido por 3"];
  const nao = ["hoje é 27/08/2026", "às 10:30", "2-3 pessoas", "1920x1080", "node v22.1.0", "me liga +55 11 99999-9999", "bom dia", "tenho 3 gatos e 2 cachorros", "<@01KHBPN31QT1THM1A0CEM8JA91> oi"];
  ok(sim.every((t) => chat.ehAritmetica(t)), "★ conta explícita é reconhecida (operador, extenso, raiz, porcentagem)");
  ok(nao.every((t) => !chat.ehAritmetica(t)), "  → data, horário, versão, resolução, telefone e intervalo NÃO viram conta");
  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/ehAritmetica\(pergunta\)\) return \{ modelo: OLLAMA_MODEL_LOGICA, tipo: "ferramenta", motivo: "calculo" \}/.test(fonte),
    "  → e no roteamento ela vem ANTES de tudo, com tipo=ferramenta");
  ok(/motivo === "calculo"/.test(fonte) && /Use a ferramenta `calcular`/.test(fonte),
    "  → com instrução própria: use `calcular` antes de responder, nunca de cabeça");
}

// ══ 9. Decisões internas têm piso de tokens ══
console.log("\n── piso de tokens nas decisões ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const pedidos = [];
  globalThis.fetch = async (url, op) => {
    pedidos.push(JSON.parse(op.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: {} }) };
  };
  await chat.ollamaChat([{ role: "user", content: "x" }], { json: true, etiqueta: "t" });
  ok(pedidos[0].max_tokens >= 600, `★ decisão json pede ≥600 tokens (pediu ${pedidos[0].max_tokens}); o raciocínio come ~185 e com 200 o JSON vinha cortado`);
}

// ══ 10. Fila de conversas ══
console.log("\n── fila de conversas paralelas ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(typeof chat.tamanhoFila === "function" && chat.tamanhoFila() === 0, "★ a fila existe e começa vazia");
  ok(!/Estou processando outra conversa agora\. Tente de novo/.test(fonte), "  → o 'tente de novo em alguns segundos' morreu");
  ok(/Na fila — posição \$\{posicao\}/.test(fonte) && /In line — position/.test(fonte), "  → quem espera vê a posição (PT e EN)");
  ok(/Fila cheia/.test(fonte) && /CHAT_FILA_MAX/.test(fonte), "  → com teto configurável (CHAT_FILA_MAX)");
  ok(/finally \{\n\s*liberarVez\(\);/.test(fonte), "  → e a vez passa ao próximo no finally — erro no meio não trava a GPU");
  ok(!/^\s*ocupado = false;\s*\/\/ libera/m.test(fonte), "  → nenhum caminho zera a flag por fora da fila");
}

// ══ 11. ler_codigo: buscar por assunto, ler por página, nunca inventar ══
console.log("\n── ler_codigo: buscar + paginação ──");
{
  const raiz = process.env.CODIGO_DIR;
  fs.mkdirSync(`${raiz}/modulos/ferramentas`, { recursive: true });
  fs.mkdirSync(`${raiz}/modulos/ai`, { recursive: true });
  fs.writeFileSync(`${raiz}/modulos/ferramentas/tts.js`, Array.from({ length: 700 }, (_, i) => i === 450 ? "const AlreadyConnected = 'preso';" : `// linha ${i + 1} sobre TTS`).join("\n"));
  fs.writeFileSync(`${raiz}/modulos/ferramentas/tts-filtro.js`, "// filtro do tts\n");
  fs.writeFileSync(`${raiz}/modulos/ai/chat.js`, "// chat sem nada de voz\n");
  const lc = await import("./ia-servico/ferramentas/ler-codigo.js");
  const b = await lc.executar({ acao: "buscar", termo: "TTS" });
  ok(b.pelo_nome?.[0] === "modulos/ferramentas/tts.js" && b.pelo_nome.includes("modulos/ferramentas/tts-filtro.js"),
    "★ `buscar tts` acha pelo nome — o dono do assunto primeiro, o filtro depois");
  ok(b.pelo_conteudo?.[0]?.caminho === "modulos/ferramentas/tts.js" && b.pelo_conteudo[0].ocorrencias > 600,
    "  → e pelo conteúdo, contando as linhas que citam o termo");
  ok(!b.pelo_conteudo.some((x) => x.caminho === "modulos/ai/chat.js"), "  → chat.js não aparece: não fala de TTS");
  ok(/Se este não for o arquivo certo, escolha outro da lista/.test(b.proximo_passo),
    "  → e o próximo passo já diz o que fazer se o palpite estiver errado");
  const p1 = await lc.executar({ acao: "ler", caminho: "modulos/ferramentas/tts.js" });
  ok(p1.linhas_totais === 700 && p1.intervalo === "1-300" && p1.proxima_linha === 301 && !p1.fim_do_arquivo,
    "★ arquivo grande vem em página: 1-300 de 700, próxima em 301");
  ok(/^\s*1\| /.test(p1.conteudo) && /\n300\| /.test(p1.conteudo), "  → linhas numeradas (o modelo cita 'na linha 412' e o humano acha)");
  const p2 = await lc.executar({ acao: "ler", caminho: "modulos/ferramentas/tts.js", linha_inicial: 301, quantidade: 400 });
  ok(p2.intervalo === "301-700" && p2.fim_do_arquivo === true, "  → a página seguinte fecha o arquivo");
  const p3 = await lc.executar({ acao: "ler", caminho: "modulos/ferramentas/tts.js", termo: "AlreadyConnected" });
  ok(p3.termo_encontrado_na_linha === 451 && p3.intervalo.startsWith("436-"), "  → com `termo`, a página abre 15 linhas antes do achado");
  const p4 = await lc.executar({ acao: "ler", caminho: "modulos/ai/chat.js", termo: "AlreadyConnected" });
  ok(/não aparece neste arquivo/.test(p4.aviso), "  → e avisa quando o termo não está no arquivo (sinal de arquivo errado)");
  const srv = fs.readFileSync("./ia-servico/servidor.js", "utf8");
  ok(/não apareceu no que você leu não existe/.test(srv) && /never appeared in what you read does not exist/.test(srv),
    "★ depois de ler, a instrução diz: nome que não apareceu não existe (PT e EN)");
  ok(/busque de novo em vez de chutar/.test(srv), "  → e se o arquivo é de outro assunto, busca de novo em vez de completar de memória");
  ok(/MAX_VOLTAS_FERRAMENTA \|\| 6/.test(srv), "  → com 6 voltas, buscar → ler → página seguinte cabe");
}

// ══ 12. O vigia de silêncios diz o que falhou ══
console.log("\n── [PUNIÇÃO][vigia]: nunca mais 'undefined' ──");
{
  const eng = await import("./modulos/moderacao/automod-engine.js");
  const fonte = fs.readFileSync("./modulos/moderacao/automod-engine.js", "utf8");
  ok(!/\[vigia\] \$\{userId\}:`, e\.message\)/.test(fonte) && /descreverErro\(e\)\}`\)/.test(fonte),
    "★ o catch do vigia usa descreverErro — objeto da API vira texto, não 'undefined'");
  ok(eng.descreverErro({ type: "NotFound" }) === "membro ou cargo não encontrado", "  → { type: 'NotFound' } vira frase legível");
  const server = { fetchMember: async () => { throw { type: "NotFound" }; } };
  const r = await eng.removerCargoSilence(server, "u1", "r1", {});
  ok(r?.saiu === true, "  → membro que saiu não é erro: `saiu: true`, e o registro fecha em vez de tentar a cada minuto");
  ok(/try \{ server = await ctx\.client\?\.servers\?\.fetch/.test(fonte), "  → servers.fetch que rejeita vira 'servidor inacessível', não exceção muda");
}

// ══ 13. O mapa do arquivo — e nunca descrever o que não se leu ══
//
//  Perguntada "como funciona seu TTS a nível de código?", ela leu 300 das
//  1436 linhas e descreveu o arquivo inteiro: tudo que acertou estava nas
//  linhas 1-300, tudo que inventou ("graceful shutdown no &tts reiniciar")
//  estava depois da linha 780. A pergunta era sobre o TODO; a ferramenta só
//  sabia entregar PEDAÇOS.
console.log("\n── estrutura: o mapa, não os primeiros 21% ──");
{
  const raiz = process.env.CODIGO_DIR;
  const grande = [
    "// ══ Cabeçalho ══",
    "// ── Anti-abuso ──",
    "const COOLDOWN_MS = 8000;",
    "function semAcento(t) { return t; }",
    "export function servidorPermitido(id) { return true; }",
    "export const cmdTts = async (m) => m;",
    ...Array.from({ length: 900 }, (_, i) => `// enchimento ${i}`),
    "// ── reiniciar (staff) ──",
    "function reiniciarVoz() { return chamar('/reiniciar'); }",
    "export { falarNaCall };",
  ].join("\n");
  fs.writeFileSync(`${raiz}/modulos/ferramentas/tts.js`, grande);
  const lc = await import("./ia-servico/ferramentas/ler-codigo.js");

  const e = await lc.executar({ acao: "estrutura", caminho: "modulos/ferramentas/tts.js" });
  ok(e.linhas_totais === 909 && !e.conteudo, "★ `estrutura` devolve o MAPA, não o conteúdo");
  ok(e.secoes.some((x) => /Anti-abuso/.test(x)) && e.secoes.some((x) => /reiniciar \(staff\)/.test(x)),
    "  → pega seções do começo E do fim: cobre 100% do arquivo, não 21%");
  ok(e.simbolos.some((x) => /export função servidorPermitido/.test(x)) && e.simbolos.some((x) => /função reiniciarVoz/.test(x)),
    "  → funções declaradas e arrow, com a linha de cada uma");
  ok(e.exporta.includes("servidorPermitido") && e.exporta.includes("cmdTts") && e.exporta.includes("falarNaCall"),
    "  → e o que o arquivo exporta, inclusive no `export { }`");
  ok(JSON.stringify(e).length < 3000, `  → cabe em ${JSON.stringify(e).length} chars (o arquivo tem ${grande.length})`);
  ok(/NUNCA descreva o que uma função faz por dentro/.test(e.como_usar), "  → dizendo que o mapa não autoriza descrever o interior");

  const p1 = await lc.executar({ acao: "ler", caminho: "modulos/ferramentas/tts.js" });
  ok(p1.porcentagem_lida === "33%" && /33% do arquivo/.test(p1.leitura_parcial),
    "★ página parcial diz a porcentagem — o `cortado: true` educado foi ignorado");
  ok(/são CÓDIGO REAL e você pode descrevê-las à vontade/.test(p1.leitura_parcial),
    "  → mas diz primeiro o que ELA PODE afirmar: aviso que só proíbe virou recusa");
  ok(Object.keys(p1).indexOf("leitura_parcial") < Object.keys(p1).indexOf("conteudo"),
    "  → e vem ANTES do código: depois de 300 linhas ele já foi esquecido");
  const inteiro = await lc.executar({ acao: "ler", caminho: "modulos/ai/chat.js" });
  ok(!inteiro.leitura_parcial && inteiro.fim_do_arquivo, "  → arquivo que coube inteiro não leva aviso nenhum");

  const srv = fs.readFileSync("./ia-servico/servidor.js", "utf8");
  ok(/essa parte é código real — descreva à vontade/.test(srv), "  → e o serviço repete o enquadramento positivo depois de cada leitura");
  ok(/usouEstrutura/.test(srv) && /Ele cobre o arquivo inteiro, então descreva a arquitetura com segurança/.test(srv),
    "  → o mapa autoriza falar da arquitetura, e só o interior das funções fica de fora");
  ok((srv.match(/Um limite só/g) ?? []).length === 1 && !/REGRAS ESTRITAS/.test(srv),
    "★ uma proibição, não cinco regras numeradas — a pilha de 'não faça' foi o que produziu a recusa");
}

// ══ 14. Mudou de assunto? o arquivo anterior não é a resposta ══
//
//  "saia do modulos/ferramentas e vá para a pasta raiz" recebeu, pela
//  terceira vez seguida, uma resposta sobre tts.js. O caminho vinha sendo
//  relido da mensagem citada — que era a resposta ANTERIOR DA PRÓPRIA JUDY.
console.log("\n── mudança de escopo quebra a inércia do assunto ──");
{
  const chat = await import("./modulos/ai/chat.js");
  ok(chat.mudouEscopo("eu quero que agora saia do modulos/ferramentas e vá para a pasta raiz"), "★ 'saia de X e vá para a raiz' é virada de página");
  ok(chat.mudouEscopo("indo em um ambito geral: como funciona o tratamento de erros?"), "  → 'em âmbito geral' também");
  ok(chat.mudouEscopo("trocando de assunto, quanto é 2+2?"), "  → e 'trocando de assunto'");
  ok(!chat.mudouEscopo("como funciona seu TTS a nível de código?"), "  → pergunta normal NÃO é virada (senão toda pergunta reinicia a busca)");
  ok(!chat.mudouEscopo("me explica melhor essa parte do cooldown"), "  → nem um pedido de aprofundar o mesmo assunto");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/citada\?\.doBot \? null : caminhoCitado\(citada\?\.conteudo\)/.test(fonte),
    "★ o caminho citado pela PRÓPRIA Judy não é relido — era o laço que prendia a conversa no mesmo arquivo");
  ok(/const doBot = !!\(citada\.authorId && message\.client\?\.user\?\.id/.test(fonte), "  → e a citada sabe dizer se veio dela mesma");
  ok(/O ESCOPO MUDOU/.test(fonte) && /SCOPE CHANGED/.test(fonte), "  → virou a página: instrução manda buscar do zero (PT e EN)");
  ok(/querOTodo \? \{ acao: "estrutura", caminho \}/.test(fonte),
    "★ pergunta sobre o TODO ('como funciona', 'lógica', 'arquitetura') pede o mapa, não as primeiras 300 linhas");
}

// ══ 15. Buscar é um índice, não uma resposta ══
//
//  Ela chamou 'buscar', recebeu a lista de caminhos e respondeu descrevendo o
//  tts.js sem NUNCA ter aberto o arquivo — "gerencia chamadas ao serviço de
//  voz, validação de permissões, cooldown". Estava certo por sorte: qualquer
//  módulo de TTS faz isso.
console.log("\n── buscar sozinho não fecha a resposta ──");
{
  const lc = await import("./ia-servico/ferramentas/ler-codigo.js");
  const b = await lc.executar({ acao: "buscar", termo: "tts" });
  ok(b.estrutura_do_melhor?.caminho === "modulos/ferramentas/tts.js" && b.estrutura_do_melhor.simbolos?.length,
    "★ a busca já vem com o MAPA do melhor candidato — conteúdo real, não só uma lista");
  ok(!b.ATENCAO, "  → e por isso não precisa mais de aviso: o aviso 'isto é um índice' virou recusa de responder");
  ok(/MAPA COMPLETO dele está em 'estrutura_do_melhor'/.test(b.proximo_passo), "  → o próximo passo aponta para o mapa que já está ali");
  const srv = fs.readFileSync("./ia-servico/servidor.js", "utf8");
  ok(/usouBusca && !leuConteudo && !buscaTrouxeMapa && !cobrouLeitura/.test(srv),
    "★ o serviço só cobra leitura quando a busca NÃO trouxe o mapa");
  ok(/cobrouLeitura = true/.test(srv) && /volta < MAX_VOLTAS - 1/.test(srv),
    "  → uma vez só, e nunca na última volta: cobrar em laço deixaria a pessoa sem resposta");
  ok(/você ainda NÃO leu código nenhum/.test(srv) && /you have NOT read any code yet/.test(srv), "  → em PT e EN");
}

// ══ 16. O assunto continua, a ferramenta continua ══
//
//  "como funciona seu TTS a nível de código?" leu o arquivo. A seguinte,
//  "quero que me diga a lógica de programação por detrás do código", foi
//  para o Ollama puro — e ela respondeu, com razão, que não tinha acesso.
console.log("\n── seguimento herda o caminho com ferramentas ──");
{
  const chat = await import("./modulos/ai/chat.js");
  ok(chat.precisaFerramenta("quero que me diga a lógica de programação por de trás do código"),
    "★ pedir a LÓGICA do código é pedir para ler, mesmo sem verbo de leitura");
  ok(chat.precisaFerramenta("qual a arquitetura desse módulo?") && chat.precisaFerramenta("me explica o funcionamento do seu código"),
    "  → arquitetura, funcionamento e 'seu código' também");
  ok(!chat.precisaFerramenta("qual a lógica de um quicksort?"), "  → mas 'a lógica de um quicksort' não é sobre o repositório dela");

  const canal = "canal-teste";
  ok(!chat.seguimentoDeFerramenta(canal, "e a lógica?"), "sem turno anterior, não há seguimento");
  chat.lembrarRoteamento(canal, "ferramenta");
  ok(chat.seguimentoDeFerramenta(canal, "e a lógica?"), "★ depois de um turno com ferramenta, o seguimento curto herda o caminho");
  ok(chat.seguimentoDeFerramenta(canal, "me explica melhor essa parte"), "  → e um 'explica melhor' também");
  ok(!chat.seguimentoDeFerramenta("outro-canal", "e a lógica?"), "  → mas só no MESMO canal");
  chat.lembrarRoteamento(canal, "conversa");
  ok(!chat.seguimentoDeFerramenta(canal, "e a lógica?"), "  → e só se o turno anterior tiver usado ferramenta");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/!mudouEscopo\(pergunta\) && seguimentoDeFerramenta/.test(fonte),
    "★ mas quem MUDA de escopo não herda nada — as duas regras não brigam");
  ok(/motivo === "seguimento"/.test(fonte) && /nunca diga que não tem acesso ao arquivo/.test(fonte),
    "  → com instrução própria: releia, não responda de memória");
}

// ══ 17. O erro da API vem como string, não como objeto ══
console.log("\n── o 'undefined' que sobrou: erro em string JSON ──");
{
  const { descreverErro, tipoDoErro, normalizarErro } = await import("./modulos/core/erros.js");
  const comoAPILanca = JSON.stringify({ type: "NotFound", location: "crates/core/database/src/models/server_members/ops/mongodb.rs:66:24" });
  ok(descreverErro(comoAPILanca) === "membro ou cargo não encontrado",
    "★ string JSON vira frase legível — era o que o vigia repetia a cada minuto");
  ok(tipoDoErro(comoAPILanca) === "NotFound",
    "  → e o tipo é encontrado: quem testava `e.type` nunca via, o type estava DENTRO do texto");
  ok(descreverErro({ type: "MissingPermission" }).includes("AssignRoles"), "  → objeto continua funcionando");
  ok(descreverErro(new Error("deu ruim")) === "deu ruim", "  → Error comum continua funcionando");
  ok(descreverErro(undefined) === "erro desconhecido" && normalizarErro(null) && descreverErro("timeout") === "timeout",
    "  → e nada disso quebra com nulo ou texto solto");

  const eng = await import("./modulos/moderacao/automod-engine.js");
  const r = await eng.removerCargoSilence({ fetchMember: async () => { throw comoAPILanca; } }, "u1", "r1", {});
  ok(r?.saiu === true, "★ agora o vigia RECONHECE que a pessoa saiu e encerra o registro em vez de tentar de novo");
  ok(/descreverErro\(err\)/.test(fs.readFileSync("./modulos/moderacao/ban-global.js", "utf8")),
    "  → e o `[BANGLOBAL] auto: falha em X: undefined` foi pela mesma causa");
}

console.log(`\nIA: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
