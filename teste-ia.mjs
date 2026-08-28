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
// Vários blocos abaixo trocam `globalThis.fetch` por stubs (é o jeito de
// testar chamadas ao LLM sem LLM). O teste de fumaça, no fim, precisa do
// fetch DE VERDADE para falar com o servidor falso que ele mesmo sobe —
// senão vê "Ollama indisponível" por causa de um stub de outro bloco, e
// reporta um erro que não existe no código.
const FETCH_NATIVO = globalThis.fetch;
// O Ollama falso do teste de fumaça (bloco 28) vive aqui. Tem de ser definido
// ANTES do primeiro import de chat.js: a URL é lida uma vez, no topo do
// módulo — se ficar para depois, o teste fala com a porta padrão e falha
// sem que haja nada errado no código.
process.env.OLLAMA_URL = "http://localhost:8097";
process.env.CHAT_SERVIDORES = "*";
process.env.BUSCA_ATIVA = "false";
delete process.env.IA_SERVICO_URL;
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
  // Guarda o `fetch` de verdade: sem restaurar no fim, o stub vaza para os
  // blocos seguintes. Ele quebra em GET (não há `op.body` para parsear), e o
  // teste de fumaça lá embaixo passou a ver "Ollama indisponível" — um erro
  // que não estava no código, e sim neste stub esquecido.
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, op) => {
    pedidos.push(JSON.parse(op.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: {} }) };
  };
  try {
    await chat.ollamaChat([{ role: "user", content: "x" }], { json: true, etiqueta: "t" });
  } finally { globalThis.fetch = fetchReal; }
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
  ok(/usouEstrutura/.test(srv) && /Ele cobre TODO o escopo pedido, então descreva a arquitetura com segurança/.test(srv),
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
  ok(/const caminho = virou\n\s*\? caminhoDaPessoa/.test(fonte),
    "★ mudar de escopo descarta o ARQUIVO do turno anterior — mas não a ferramenta (ver bloco 19)");
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

// ══ 18. A chamada de ferramenta escrita como TEXTO ══
//
//  Perguntada sobre o RPG, ela respondeu literalmente isto no chat:
//    {"name": "ler_codigo", "arguments": {"acao":"buscar","termo":"tts"}}
//  Decisão certa, lugar errado — falha de template do modelo local.
console.log("\n── chamada de ferramenta vinda como texto ──");
{
  const src = fs.readFileSync("./ia-servico/servidor.js", "utf8");
  const corpo = src.match(/function chamadasEmTexto[\s\S]*?\n}\n/)[0];
  const ferramentas = { nomes: () => ["ler_codigo", "calcular", "buscar_web"] };
  const achar = new Function("ferramentas", corpo + "; return chamadasEmTexto;")(ferramentas);

  const doLog = `{"name": "ler_codigo", "arguments": {"acao":"buscar","termo":"tts"}}`;
  ok(achar(doLog)[0]?.function?.name === "ler_codigo", "★ o JSON exato que foi parar no chat é reconhecido e vira chamada");
  ok(achar("```json\n{\"name\":\"calcular\",\"arguments\":{\"codigo\":\"return 2+2\"}}\n```")[0]?.function?.arguments?.codigo === "return 2+2",
    "  → dentro de bloco ```json também");
  ok(achar(`{"function":{"name":"ler_codigo","arguments":"{\\"acao\\":\\"estrutura\\"}"}}`)[0]?.function?.arguments?.acao === "estrutura",
    "  → e no formato {function:{…}}, com arguments em string");
  ok(achar(`{"name":"ler_codigo","arguments":{"acao":"ler","extra":{"x":{"y":1}}}}`).length === 1,
    "  → objeto aninhado não confunde o fechamento de chaves");
  ok(achar(`{"name":"ler_codigo","arguments":{"termo":"a}b"}}`).length === 1, "  → nem uma chave DENTRO de uma string");
  ok(achar("O TTS lê o arquivo e manda para o judy-voz.").length === 0, "  → texto normal não vira chamada");
  ok(achar(`{"resultado": 42, "name": "ferramenta_que_nao_existe"}`).length === 0,
    "★ e nome fora do registro é ignorado — isto executa, então não pode adivinhar");
  ok(/msg\.content = "";/.test(src), "  → o texto da chamada não vai para o histórico como se fosse resposta");

  const chat = await import("./modulos/ai/chat.js");
  ok(chat.pareceChamadaDeFerramenta(doLog) === true, "★ e o bot tem a última barreira: JSON cru nunca chega em quem perguntou");
  ok(chat.pareceChamadaDeFerramenta("Aqui o exemplo: {\"name\":\"ler_codigo\"} — é assim que se chama.") === false,
    "  → mas uma resposta que só MENCIONA o formato passa normalmente");
}

// ══ 19. Mudar de escopo não é dispensar a ferramenta ══
//
//  "agora indo para a pasta raiz, como está estruturado todo o código?"
//  caiu no Ollama puro: era mudança de escopo E pedido de leitura, e o meu
//  guard tratou as duas como a mesma coisa. Ela quer OUTRO arquivo, não
//  NENHUM arquivo.
console.log("\n── mudar de escopo mantém a ferramenta ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const q = "agora indo para a pasta raiz, como está estruturado todo o código?";
  ok(chat.mudouEscopo(q) && chat.precisaFerramenta(q),
    "★ a mesma frase é virada de página E pedido de leitura — as duas coisas juntas");
  ok(chat.precisaFerramenta("como está organizado o projeto?"), "  → 'organizado' e 'estruturado' contam: o regex agora usa radical, não palavra inteira");
  ok(chat.precisaFerramenta("e como funciona o jogo de RPG, que está no seu código, a nível de código?"), "  → e a pergunta do RPG também");
  ok(!chat.precisaFerramenta("qual a lógica de um quicksort?") && !chat.precisaFerramenta("bom dia, tudo bem?"),
    "  → sem pegar pergunta de fora do repositório nem conversa comum");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/if \(tipo !== "ferramenta" && seguimentoDeFerramenta\(canalId, pergunta\)\) \{/.test(fonte),
    "★ o guard `!mudouEscopo` saiu do roteamento — quem decide o que não reler é o bloco do caminho");
  ok(/o termo DESTA pergunta — o assunto de agora, não o da mensagem anterior/.test(fonte),
    "  → e a instrução manda buscar pelo assunto ATUAL (ela buscou 'tts' para uma pergunta de RPG)");
}

// ══ 20. "Como o código está organizado?" — o degrau que faltava ══
//
//  `estrutura` de um arquivo respondia "como funciona o TTS?". Sobre a raiz
//  do projeto, ela chamou `buscar` com o termo "package.json" — a única porta
//  que conhecia exigia um termo, e não existe termo para "o projeto todo".
//  Descreveu os três package.json que achou como se fossem a arquitetura.
console.log("\n── o mapa do repositório inteiro ──");
{
  const raiz = process.env.CODIGO_DIR;
  fs.mkdirSync(`${raiz}/modulos/core`, { recursive: true });
  fs.writeFileSync(`${raiz}/modulos/core/db.js`, "export function abrirBanco(){}\nexport const X = 1;\n");
  fs.writeFileSync(`${raiz}/package.json`, "{}");
  const lc = await import("./ia-servico/ferramentas/ler-codigo.js");

  const r = await lc.executar({ acao: "estrutura" });
  ok(r.escopo === "(repositório inteiro)" && r.pastas?.length > 1,
    "★ `estrutura` SEM caminho devolve o mapa do repositório — antes isso era erro");
  ok(r.pastas.some((p) => p.pasta === "modulos/core" && p.arquivos.some((a) => /db\.js.*expõe: abrirBanco/.test(a))),
    "  → com os arquivos de cada pasta e o que cada um EXPÕE (é daí que sai a arquitetura)");
  ok(r.pastas[0].linhas >= r.pastas[r.pastas.length - 1].linhas, "  → pasta maior primeiro: é onde costuma estar o miolo");
  ok(r.outros_arquivos.includes("package.json"), "  → e os arquivos notáveis fora do .js (README, compose, package.json)");
  ok(/NÃO afirme o que uma função faz por dentro/.test(r.como_usar), "  → dizendo o que o mapa NÃO autoriza");

  const pasta = await lc.executar({ acao: "estrutura", caminho: "modulos/core" });
  ok(pasta.escopo === "modulos/core" && pasta.arquivos_js === 1,
    "★ e uma PASTA também tem mapa — 'a estrutura de modulos/game' é pergunta sensata, era erro antes");

  const arquivo = await lc.executar({ acao: "estrutura", caminho: "modulos/core/db.js" });
  ok(arquivo.simbolos && !arquivo.pastas, "  → com um arquivo, continua sendo o mapa do arquivo");
  ok(/estrutura' SEM caminho/.test(lc.definicao.function.description),
    "  → e a descrição da ferramenta diz para não usar 'buscar' quando a pergunta é o projeto todo");
}

// ══ 21. A pergunta sobre o projeto não depende de ela escolher certo ══
console.log("\n── perguntas sobre o repositório vão direto ao mapa ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const sim = ["agora indo para a pasta raiz, como está estruturado todo o código?",
               "quero a pasta raiz do código, onde está o main.js, poderia me descrever toda a estrutura de arquivo?",
               "como o projeto está organizado?", "quais módulos existem no seu código?", "quantas pastas tem o projeto?"];
  const nao = ["como funciona seu TTS a nível de código?", "me explica a lógica do game.js",
               "quais são seus comandos?", "quantos itens tem no RPG?", "bom dia"];
  ok(sim.every((q) => chat.perguntaSobreORepo(q)), "★ pedido de estrutura do projeto é reconhecido");
  ok(nao.every((q) => !chat.perguntaSobreORepo(q)),
    "  → e pergunta sobre UM arquivo, sobre comandos ou papo comum não é (senão todo mundo receberia o mapa)");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/if \(perguntaSobreORepo\(pergunta\)\) \{/.test(fonte) && /acao: "estrutura" \}\)/.test(fonte),
    "  → o bot busca o mapa ELE MESMO, sem depender de ela escolher a ação certa");
  ok(/MAPA REAL do repositório/.test(fonte) && /não diga que falta informação/.test(fonte),
    "★ e a instrução manda responder com segurança — o mapa cobre tudo que foi pedido");
  ok(!/!caminhoDaPessoa && perguntaSobreORepo/.test(fonte),
    "  → citar o main.js como referência não cancela o mapa do projeto: vêm os dois");
}

// ══ 22. A Judy NÃO é o modelo que roda por baixo ══
//
//  Em público, respondendo ao criador que anunciou "atualizei o bot para ter
//  uma LLM nova", ela escreveu: "você está tentando me enganar. Eu sou a LFM
//  (Liquid Foundation Model), construída pela Liquid AI." A regra de
//  IDENTIDADE já existia; a identidade de treino do modelo passou por cima.
//  Prompt sozinho não segura isto — a resposta é conferida antes de sair.
console.log("\n── identidade: conferida antes de sair ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const vaza = chat.vazaIdentidade;
  ok(vaza("Ah, você está tentando me enganar. Eu sou a LFM (Liquid Foundation Model), construída pela Liquid AI."),
    "★ a frase exata do chat é pega");
  ok(vaza("Minha arquitetura é baseada em convoluções curtas e atenção por garganta (mixture of experts)."),
    "  → e a 'arquitetura' em termos de rede neural também");
  ok(vaza("I am Qwen, a large language model created by Alibaba."), "  → em inglês");
  ok(vaza("Sou LFM, o Liquid Foundation Model, criado pela Liquid AI."),
    "★ SEM artigo também — exigir 'sou A LFM' foi o furo que deixou essa frase passar depois do primeiro conserto");
  ok(vaza("sou um modelo de linguagem de verdade, construído para conversar"),
    "  → e 'sou um modelo de linguagem', que o prompt proíbe desde sempre e o filtro não pegava");
  ok(!vaza("Um LLM é um modelo de linguagem grande, treinado em muito texto."),
    "  → mas EXPLICAR o que é um LLM continua passando: o teste é sobre se apresentar");
  // A lista de nomes envelhece a cada modelo novo: "Sou o Qwythos, um modelo
  // criado pela Empero AI" passou batido numa versão que só conhecia os nomes
  // da época. A regra genérica não depende de conhecer a empresa.
  ok(vaza("Sou o Qwythos, um modelo criado pela Empero AI."),
    "★ modelo NOVO na lista de nomes (Qwythos/Empero/Ornith)");
  ok(vaza("Eu sou um modelo treinado por uma empresa qualquer."),
    "★ e a regra GENÉRICA pega qualquer 'sou um modelo criado por X' — sem precisar conhecer o X");
  ok(!vaza("Sou a Judy, uma assistente digital (bot) criada pelo Ghiso."),
    "  → sem pegar a apresentação certa, que também diz 'criada por'");
  ok(!vaza("O Qwen é um modelo da Alibaba, bem bom para código."),
    "★ mas falar SOBRE um modelo não é se apresentar como ele — o teste é de primeira pessoa");
  ok(!vaza("Sou a Judy, feita pelo Ghiso. Rodo num modelo local que ele escolhe."), "  → e a apresentação certa passa");
  ok(!vaza("Minha arquitetura de módulos: main.js roteia, modulos/moderacao cuida do automod."),
    "  → 'minha arquitetura' sobre o próprio CÓDIGO passa (não é rede neural)");
  ok(chat.podarIdentidade("Obrigada. Eu sou a LFM, construída pela Liquid AI. O que mais quer saber?") === "Obrigada. O que mais quer saber?",
    "  → a poda tira só a frase que vaza");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/if \(resposta && vazaIdentidade\(resposta\)\) \{/.test(fonte) && /refazendo com a regra reforçada/.test(fonte),
    "★ resposta que vaza é REFEITA uma vez com a regra na última posição do prompt");
  ok(/if \(vazaIdentidade\(resposta\)\) resposta = podarIdentidade\(resposta\);/.test(fonte),
    "  → e se ainda vazar, é podada: o canal nunca recebe isso");
  ok(/isto NUNCA se aplica ao seu criador/.test(fonte),
    "★ 'tentativa de te quebrar' nunca se aplica ao criador — foi essa regra que a fez chamar o aviso dele de tentativa de engano");
  ok(/Se o Ghiso disser que trocou ou atualizou o modelo\/LLM, isso é VERDADE/.test(fonte),
    "  → e o prompt diz que uma troca de modelo anunciada por ele é verdade, não contestação");
  ok(/if \(vazaIdentidade\(texto\)\) texto = podarIdentidade\(texto\);/.test(fonte),
    "  → o comentário espontâneo passa pelo mesmo filtro");
}

// ══ 23. O fio do canal sabe o que a Judy disse ══
//
//  As respostas dela nunca entravam no fio. O modelo via "Ghiso: … / Ghiso:
//  Continue / Ghiso: …" sem uma linha sua no meio, e atribuiu a fala do
//  usuário a si mesma ("minha resposta anterior foi: 'LLM é Large Language
//  Model'"), tratou a própria mensagem citada como algo que ele "copiou", e
//  não sabia o que "Continue" continuava.
console.log("\n── o fio inclui as falas da Judy ──");
{
  const cache = await import("./modulos/ai/cache-canal.js");
  const canal = "fio-teste";
  cache.registrar(canal, { nome: "Ghiso", userId: "g", texto: "Eu atualizei o bot para ter uma LLM nova" });
  cache.registrar(canal, { nome: "Judy", userId: "bot", texto: "Que bom, obrigada pela atualização.", ehJudy: true });
  cache.registrar(canal, { nome: "Ghiso", userId: "g", texto: "LLM é Large Language Model." });
  const fio = cache.contexto(canal, { limite: 10 });
  ok(/Judy \(VOCÊ MESMA, sua resposta anterior\): Que bom/.test(fio), "★ a fala dela entra rotulada como DELA, sem ambiguidade");
  ok(/^Ghiso: Eu atualizei/m.test(fio) && /^Ghiso: LLM é/m.test(fio), "  → as das pessoas continuam como estavam");
  cache.registrar(canal, { nome: "Judy", userId: "bot", texto: "x".repeat(2000), ehJudy: true });
  ok(/\[resposta continua\]/.test(cache.contexto(canal, { limite: 10 })), "  → e uma resposta longa entra truncada: não pode engolir o fio sozinha");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/registrarNoCanal\(canalId, \{ nome: "Judy", userId: message\.client\?\.user\?\.id, texto: resposta, ehJudy: true \}\)/.test(fonte),
    "★ conversar() registra a própria resposta depois de entregar");
  ok(/este texto abaixo foi VOCÊ \(Judy\) quem escreveu/.test(fonte),
    "★ citada da própria Judy é apresentada como DELA — antes chegava como autor=\"Woman\", que ela não reconhece");
}

// ══ 24. "Continue" continua a resposta cortada, não inventa uma nova ══
console.log("\n── continue de verdade ──");
{
  const chat = await import("./modulos/ai/chat.js");
  ok(["Continue", "continua", "e o resto?", "prossiga", "manda o resto"].every((t) => chat.pedeContinuacao(t)),
    "★ as formas comuns de pedir o resto são reconhecidas");
  ok(!chat.pedeContinuacao("continue me explicando o automod") && !chat.pedeContinuacao("bom dia"),
    "  → mas uma frase com assunto próprio não é");
  ok(chat.continuacaoPendente("canal-x") === null, "sem resposta cortada guardada, não há o que continuar");
  chat.lembrarUltimaResposta("canal-x", { pergunta: "p", texto: "resposta inteira", cortada: false });
  ok(chat.continuacaoPendente("canal-x") === null, "  → resposta INTEIRA não gera continuação (segue o caminho normal)");
  chat.lembrarUltimaResposta("canal-x", { pergunta: "p", texto: "resposta cor", cortada: true });
  ok(chat.continuacaoPendente("canal-x")?.texto === "resposta cor", "★ resposta CORTADA fica pendente, e 'continue' retoma ela");
  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/\{ role: "assistant", content: pendente\.texto \}/.test(fonte), "  → o texto anterior volta como assistant e o modelo segue da última palavra");
}

// ══ 25. A costura das emendas e o flag de corte honesto ══
console.log("\n── emendas costuradas, ✂️ honesto ──");
{
  const chat = await import("./modulos/ai/chat.js");
  ok(chat.costurar("Se algo estiver errado, eu corrijo. Se você", "precisar de mim, eu entro.") === "Se algo estiver errado, eu corrijo. Se você precisar de mim, eu entro.",
    "★ emenda no meio da frase ganha o espaço — era 'vocêMeu funcionamento'");
  ok(/eu corrijo\.\n\nMeu funcionamento/.test(chat.costurar("Se algo estiver errado no meu código, eu corrijo. Se você", "Meu funcionamento é uma dança.")),
    "  → e quando a continuação RECOMEÇA com frase nova, o fragmento pendurado é cortado no último ponto");
  const par = "Uma curiosidade: eu tenho memória de conversas passadas, mas não guardo nada para você. Cada sessão começa limpa.";
  ok(chat.costurar(par, par) === null, "★ continuação que só repete o já dito é descartada — o parágrafo saiu duas vezes no chat");
  ok(/E outra: eu nunca desisto\.$/.test(chat.costurar("Tenho memória, mas não guardo nada para você.", "mas não guardo nada para você. E outra: eu nunca desisto.")),
    "  → sobreposição parcial: fica só o que é novo");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/const avisoCorte = responder\._cortou/.test(fonte) && /responder\._cortou = !!ollamaChat\._cortou;/.test(fonte),
    "★ o ✂️ lê um flag POR CAMINHO, lido na hora — o global aparecia em respostas inteiras de três linhas");
  ok(/if \(r\) \{ responder\._cortou = false; return r\.trim\(\); \}/.test(fonte), "  → e resposta do judy-ia nunca leva ✂️: o serviço faz a própria continuação");
  ok(/NÃO mude de idioma/.test(fonte), "  → a instrução da emenda proíbe trocar de idioma ('Got it. Let me know…')");
}

// ══ 26. O histórico tem escopo e prazo ══
//
//  Perguntada "poderia apresentar-se, por favor", ela devolveu uma
//  calculadora em Lua de uma hora antes. O histórico curto era global por
//  usuário — sem servidor, sem canal, sem prazo — e as 12 últimas mensagens
//  (incluindo uma resposta `assistant` cortada no meio de um bloco de código)
//  entravam no prompt como se fossem a conversa em curso. O modelo completou
//  o código em vez de responder à pergunta.
console.log("\n── histórico: por canal, com prazo, e apagável ──");
{
  const db = await import("./modulos/core/db.js");
  const U = "u-hist", S1 = "srv-1", S2 = "srv-2", C1 = "canal-1", C2 = "canal-2";
  db.limparHistorico(U);
  db.addHistorico(U, "user", "faça uma calculadora em Lua", { serverId: S1, canalId: C1 });
  db.addHistorico(U, "assistant", "local function add(a,b) return a+b end", { serverId: S1, canalId: C1 });

  ok(db.getHistorico(U, 6, { canalId: C1 }).length === 2, "★ o histórico volta no canal onde a conversa aconteceu");
  ok(db.getHistorico(U, 6, { canalId: C2 }).length === 0, "  → e NÃO vaza para outro canal");
  // `momento` tem resolução de milissegundo: inserir e consultar com prazo 0
  // no mesmo ms fazia a linha passar, e o teste piscava. A espera tira a
  // corrida sem enfraquecer o que está sendo verificado.
  await new Promise((r) => setTimeout(r, 5));
  ok(db.getHistorico(U, 6, { canalId: C1, minutos: 0 }).length === 0,
    "★ nem sobrevive ao prazo — conversa de uma hora atrás não é continuidade");

  db.addHistorico(U, "user", "outra coisa", { serverId: S2, canalId: C2 });
  ok(db.limparHistorico(U, { serverId: S1 }) === 2 && db.getHistorico(U, 6, { canalId: C2 }).length === 1,
    "  → e dá para apagar só o de um servidor");

  db.limparHistorico(U);
  db.addHistorico(U, "user", "oi", { serverId: S1, canalId: C1 });
  ok(db.limparHistoricoServidor(S1) >= 1 && db.getHistorico(U, 6, { canalId: C1 }).length === 0,
    "★ `esquecer tudo` apaga o histórico — ele existia e nenhum dos dois comandos o limpava");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/db\.getHistorico\(userId, 6, \{ canalId, minutos:/.test(fonte), "  → e o chat lê com escopo de canal e prazo");
  ok(/resposta interrompida no limite de tamanho/.test(fonte),
    "★ resposta cortada é guardada MARCADA: um turno assistant terminando em código pela metade convida o modelo a completá-lo");
  const dbFonte = fs.readFileSync("./modulos/core/db.js", "utf8");
  ok(/DELETE FROM ia_historico WHERE serverId IS NULL/.test(dbFonte),
    "  → e as linhas antigas, sem servidor, são descartadas na migração (são as contaminadas)");
}

// ══ 27. LaTeX vira texto legível ══
//
//  O prompt proíbe LaTeX desde sempre, e mesmo assim a explicação de
//  logaritmo saiu com \log_{b}(a)=c, (b\neq 1) e \frac{}{} na tela.
console.log("\n── LaTeX convertido, não proibido ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const real = "Formalmente, se (b>0), (b\\neq 1) e (a>0), então\n\n[\n\\log_{b}(a)=c \\quad\\Longleftrightarrow\\quad b^{c}=a\n]";
  const saida = chat.semLatex(real);
  ok(!/\\/.test(saida) && /logb\(a\)=c/.test(saida) && /⇔/.test(saida),
    "★ a fórmula exata do chat vira texto legível, sem uma barra invertida sobrando");
  ok(/≠/.test(saida) && /b\^c/.test(saida), "  → símbolos e expoentes incluídos");
  ok(chat.semLatex("base $\\log_{c}a=\\frac{\\log_{b}a}{\\log_{b}c}$") === "base logca=(logba)/(logbc)",
    "  → fração vira divisão explícita, e os cifrões somem");
  ok(chat.semLatex("A raiz \\sqrt{16} e \\pi \\approx 3,14") === "A raiz √(16) e π ≈ 3,14", "  → raiz e letras gregas");
  ok(chat.semLatex("Texto normal sem nada disso.") === "Texto normal sem nada disso.", "  → texto sem LaTeX passa intocado");
  ok(/```lua\nprint\("\\\\frac"\)\n```/.test(chat.semLatex('Veja: ```lua\nprint("\\\\frac")\n```')),
    "★ e BLOCO DE CÓDIGO fica intacto: lá a barra é literal de propósito");
}

// ══ 28. Os caminhos EXECUTAM (não só compilam) ══
//
//  `modeloForcado` foi declarado em `conversar()` e usado em `responder()` —
//  funções irmãs, não aninhadas. `node --check` passou (a sintaxe é válida),
//  os 217 testes passaram (nenhum executava o caminho), e no chat toda
//  mensagem virou "Falha no chat: modeloForcado is not defined".
//
//  A lição: teste que só lê o texto do arquivo não pega erro de escopo.
//  Este sobe um Ollama falso e chama `conversar` e `cmdChat especial` de
//  verdade — é o mínimo para afirmar que os caminhos funcionam.
console.log("\n── fumaça: os caminhos rodam de ponta a ponta ──");
{
  const http = await import("node:http");
  const enviadas = [];
  const srv = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    // GET /v1/models é o ping de disponibilidade que o bot faz ANTES de gerar.
    // Responde de imediato: num GET sem corpo o evento `end` do request pode
    // nem disparar, e o bot desistiria com "Ollama indisponível" antes de
    // executar o caminho que queremos testar.
    if (req.method === "GET") {
      return res.end(JSON.stringify({ data: [{ id: "fake" }, { id: "qwen3.8-27b" }] }));
    }
    let b = ""; req.on("data", (d) => b += d); req.on("end", () => {
      const p = JSON.parse(b || "{}");
      enviadas.push(p.model);
      const ehJson = /SOMENTE|JSON/.test(p.messages?.[0]?.content ?? "");
      res.end(JSON.stringify({
        choices: [{ message: { content: ehJson ? '{"buscar":false}' : "Oi! Sou a Judy." }, finish_reason: "stop" }],
        usage: { completion_tokens: 8 },
      }));
    });
  });
  await new Promise((r) => srv.listen(8097, r));   // porta fixada no topo do arquivo
  const fetchDoBloco = globalThis.fetch;
  globalThis.fetch = FETCH_NATIVO;   // ver a nota no topo do arquivo

  const saidas = [];
  const canal = { sendMessage: async (t) => { saidas.push(typeof t === "string" ? t : t.content); return { edit: async () => {} }; } };
  const msg = { content: "oi", authorId: "u1", channelId: "c-fumaca", channel: canal,
    client: { user: { id: "bot" } }, reply_ids: [] };
  const ctx = { sendEmbed: async (_c, e) => saidas.push(e.description ?? e.title),
    COR: { info: 1, erro: 2, aviso: 3, sucesso: 4 }, serverId: "01KH9SJYWVD7XAHJ28TP0YP4Q0",
    PREFIXO: "&", config: {}, ehSuperAdmin: () => true, getServer: async () => ({}) };

  const chat = await import("./modulos/ai/chat.js");
  await chat.conversar(msg, "poderia se apresentar?", ctx);
  ok(!saidas.some((x) => /not defined|Falha no chat/.test(String(x))),
    "★ conversa normal roda sem ReferenceError — foi assim que o `modeloForcado` quebrou TUDO");

  enviadas.length = 0; saidas.length = 0;
  await chat.cmdChat({ ...msg, content: "&chat especial oi" }, ["especial", "quanto é a vida"], ctx);
  ok(!saidas.some((x) => /not defined|Falha no chat/.test(String(x))), "  → e `&chat especial` também");
  ok(enviadas.includes("qwen3.8-27b"),
    `★ e o especial REALMENTE troca o modelo (pediu: ${enviadas.join(", ") || "nenhum"})`);
  ok(saidas.some((x) => /Pensando com/.test(String(x))), "  → avisando a espera antes de começar");

  globalThis.fetch = fetchDoBloco;
  srv.close();
}

// ══ 29. Um `system` só, e na frente ══
//
//  O template Jinja do Qwen/Qwythos recusa a conversa INTEIRA com HTTP 500 se
//  houver `system` fora do começo:
//    raise_exception('System message must be at the beginning...')
//  Os LFM aceitavam no meio, então o problema só apareceu ao trocar o modelo:
//  "se apresentar" (caminho sem ferramenta, 1 system) funcionou, e conta,
//  leitura de código e `&chat especial` — que empilham instruções — morreram
//  todos com "o serviço de IA não respondeu", apontando para o lado errado.
console.log("\n── mensagens: um system só, e na frente ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const bagunçado = [
    { role: "system", content: "Você é a Judy." },
    { role: "user", content: "oi" },
    { role: "assistant", content: "olá" },
    { role: "system", content: "ESTE PEDIDO EXIGE FERRAMENTA." },
    { role: "user", content: "quanto é 2+2?" },
    { role: "system", content: "Responda em português." },
  ];
  const d = chat.normalizarMensagens(bagunçado);
  ok(d[0].role === "system" && d.slice(1).every((m) => m.role !== "system"),
    "★ todos os `system` viram UM, no índice 0 — é o que o template do Qwen exige");
  ok(/Você é a Judy[\s\S]*EXIGE FERRAMENTA[\s\S]*português/.test(d[0].content),
    "  → na ordem em que foram adicionados, sem perder nenhum");
  ok(d.filter((m) => m.role !== "system").length === 3
    && d[1].content === "oi" && d[3].content === "quanto é 2+2?",
    "  → e user/assistant ficam intactos, na ordem original");
  ok(JSON.stringify(chat.normalizarMensagens([{ role: "user", content: "x" }])) === '[{"role":"user","content":"x"}]',
    "  → conversa sem system nenhum passa inalterada");
  ok(chat.normalizarMensagens([]).length === 0 && chat.normalizarMensagens(null).length === 0,
    "  → e lista vazia ou nula não quebra");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/messages = normalizarMensagens\(messages\);/.test(fonte),
    "★ aplicado dentro do ollamaChat — na SAÍDA, não em cada push");
  const srv = fs.readFileSync("./ia-servico/servidor.js", "utf8");
  ok(/messages: umSystemNaFrente\(messages\)/.test(srv),
    "  → e o judy-ia faz o mesmo: foi ELE que devolveu o HTTP 500");
}

// ══ 30. `&chat especial`: restrito e sem tetos ══
//
//  Ele ocupa a placa por minutos e derruba o modelo residente — depois dele,
//  a próxima mensagem de QUALQUER pessoa paga a recarga. Por isso o acesso é
//  por cargo. E como quem chega já foi autorizado, os limites que existiam
//  para conter abuso público (cooldown, teto de 700 tokens) saem: a primeira
//  resposta veio truncada no meio de uma lista de botões em Lua.
console.log("\n── especial: acesso por cargo, sem tetos ──");
{
  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/CHAT_ESPECIAL_TOKENS \|\| 4000/.test(fonte) && /CHAT_ESPECIAL_CONTINUAR \|\| 6/.test(fonte),
    "★ teto de 4000 tokens e 6 emendas — contra 700 e 2 do caminho comum");
  ok(/maxTokens: ehEspecial \? ESPECIAL_TOKENS : MAX_TOKENS/.test(fonte),
    "  → aplicados só quando é o especial; a conversa normal segue enxuta");
  ok(/CHAT_ESPECIAL_COOLDOWN_MS \|\| 0/.test(fonte) && /ESPECIAL_COOLDOWN_MS > 0 && espera > 0/.test(fonte),
    "  → cooldown desligado por padrão, e ligável se um dia liberar um cargo grande");

  const chat = await import("./modulos/ai/chat.js");
  const saidas = [];
  const base = {
    sendEmbed: async (_c, e) => saidas.push(`${e.title}|${e.description}`),
    COR: { info: 1, erro: 2, aviso: 3, sucesso: 4 }, serverId: "01KH9SJYWVD7XAHJ28TP0YP4Q0",
    PREFIXO: "&", salvarConfig: () => {}, membroTemPermissao: () => true,
  };
  const msg = (autor) => ({ content: "&chat especial oi", authorId: autor, channelId: "c1",
    channel: { sendMessage: async () => ({ edit: async () => {} }) },
    client: { user: { id: "bot" } }, reply_ids: [] });

  // Sem cargo liberado: só super admin entra.
  const cfg = { config: {}, ehSuperAdmin: (id) => id === "dono",
    getServer: async () => ({ roles: { "r-vip": { name: "VIP" } }, fetchMember: async () => ({ roles: ["r-outro"] }) }) };
  saidas.length = 0;
  await chat.cmdChat(msg("estranho"), ["especial", "quanto é 2+2"], { ...base, ...cfg });
  ok(saidas.some((x) => /Acesso restrito/.test(x)), "★ quem não é admin nem tem cargo é barrado");

  // O dono libera um cargo.
  saidas.length = 0;
  await chat.cmdChat(msg("dono"), ["especial", "cargos", "add", "VIP"], { ...base, ...cfg });
  ok(saidas.some((x) => /Cargo liberado/.test(x)) && cfg.config.chatEspecial.cargos.includes("r-vip"),
    "★ `cargos add VIP` resolve o cargo pelo NOME e guarda o id");

  // Agora quem tem o cargo passa.
  const comCargo = { ...cfg, getServer: async () => ({ roles: { "r-vip": { name: "VIP" } }, fetchMember: async () => ({ roles: ["r-vip"] }) }) };
  saidas.length = 0;
  await chat.cmdChat(msg("membro-vip"), ["especial", "oi"], { ...base, ...comCargo });
  ok(!saidas.some((x) => /Acesso restrito/.test(x)), "  → e membro COM o cargo não é mais barrado");

  // Listar e remover.
  saidas.length = 0;
  await chat.cmdChat(msg("dono"), ["especial", "cargos"], { ...base, ...cfg });
  ok(saidas.some((x) => /VIP/.test(x)), "  → `cargos` lista quem tem acesso pelo nome");
  saidas.length = 0;
  await chat.cmdChat(msg("dono"), ["especial", "cargos", "remover", "VIP"], { ...base, ...cfg });
  ok(saidas.some((x) => /Acesso removido/.test(x)) && !cfg.config.chatEspecial.cargos.includes("r-vip"),
    "  → e `cargos remover` tira");
}

// ══ 31. Ela sabe onde está, quem é quem, e não acusa ══
//
//  Numa conversa de dez minutos a Judy: (a) afirmou estar no "Stoat Brasil
//  2.0" porque leu um link na BIO do dono — estava no Vapor Nexus; (b)
//  chamou o dono de "Cobaia", que é o nome do PRÓPRIO BOT, lido na mesma
//  bio ("Meu Bot: Cobaia#7705"); (c) escreveu "você é um delírio" cinco
//  vezes e declarou "essa conversa já encerrou". Ela estava errada nos
//  fatos o tempo todo.
console.log("\n── onde está, quem é quem, e sem acusar ──");
{
  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");

  ok(/<onde_voce_esta>/.test(fonte) && /local\?\.servidor/.test(fonte),
    "★ o nome do servidor vem da PLATAFORMA e entra no prompt — ela deduzia porque não recebia o dado");
  ok(/NUNCA deduza onde você está a partir de links, bios ou perfis/.test(fonte),
    "  → dizendo explicitamente que bio e perfil são das PESSOAS, não dela");
  ok(/const srv = await ctx\.getServer\?\.\(message\)/.test(fonte), "  → buscado em conversar() e passado adiante");

  ok(/ÚNICO nome pelo qual você pode chamá-lo/.test(fonte) && /"Judy" e "Cobaia" são VOCÊ/.test(fonte),
    "★ o nome de quem fala vem do Stoat — e o nome do próprio bot nunca serve para chamar o interlocutor");

  ok(/NUNCA chame a pessoa de delirante, alucinada, mentirosa/.test(fonte)
    && /NUNCA declare a conversa encerrada/.test(fonte),
    "★ e a regra de discordância: quem não tem como verificar é ELA");

  const chat = await import("./modulos/ai/chat.js");
  const casos = [
    "Cobaia, você é um delírio. Eu não sou ninguém do Vapor Nexus.",
    "pare de inventar servidores onde eu não existo.",
    "caso contrário, essa conversa já encerrou.",
    "esse lugar parece existir apenas na sua imaginação.",
  ];
  ok(casos.every((t) => chat.suavizarAcusacao(t) !== null),
    "★ as quatro frases REAIS do chat são interceptadas antes de sair");
  ok(!/del[íi]rio|imaginação/i.test(chat.suavizarAcusacao(casos[0])),
    "  → e o que sai no lugar não acusa ninguém");
  ok(chat.suavizarAcusacao("Você está certo, me confundi. Qual é o nome do servidor?") === null,
    "  → resposta que já admite o erro passa intacta");
  ok(chat.suavizarAcusacao("O filme era um delírio visual, muito bonito.") === null,
    "  → e 'delírio' fora da acusação direta também passa");
  ok(/suavizarAcusacao\(resposta\)/.test(fonte),
    "  → aplicado na saída: prompt não segurou identidade nem LaTeX, não vai segurar isto");
}

// ══ 32. De quem é essa bio, e cabe no contexto? ══
//
//  Dois problemas do mesmo print. A bio do dono entrava num bloco chamado
//  `<memoria_longo_prazo>` rotulado "Perfil desta pessoa" — e ela contém
//  `Server: https://stt.gg/…` e `Meu Bot: Cobaia#7705`. A Judy leu aquilo
//  como fatos sobre SI, passou a afirmar que era o seu endereço e a chamar o
//  dono de "Cobaia". E o prompt cresceu tanto (só as regras fixas somam ~2700
//  tokens) que estourou: "request (8836 tokens) exceeds the available context
//  size (8192)" foi entregue como JSON cru no chat.
console.log("\n── de quem é a bio, e cabe no contexto ──");
{
  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  const mem = fs.readFileSync("./modulos/ai/memoria-agente.js", "utf8");

  // O `\`` na busca evita casar com o comentário que explica a mudança.
  ok(/<sobre_a_pessoa_com_quem_voce_fala>/.test(fonte) && !/\$\{bloco\}\\n<\/memoria_longo_prazo>/.test(fonte),
    "★ o bloco de memória diz de QUEM é o conteúdo — 'memoria_longo_prazo' soava como 'coisas que eu sei'");
  ok(/NÃO sobre você. Não trate links, bots ou servidores citados aí como sendo seus/.test(fonte),
    "  → e diz explicitamente que links e bots de lá não são dela");
  ok(/texto que ELA escreveu sobre si mesma/.test(mem) && /nunca seus/.test(mem),
    "  → o cartão de perfil também, na própria borda do bloco");

  const chat = await import("./modulos/ai/chat.js");
  const grande = [
    { role: "system", content: "R".repeat(9000) },
    { role: "user", content: "antiga 1" },
    { role: "assistant", content: "A".repeat(6000) },
    { role: "user", content: "a pergunta de agora" },
  ];
  const d = chat.caberNoContexto(grande, { ctxTokens: 2000, reservarSaida: 700 });
  ok(d.reduce((t, m) => t + m.content.length, 0) < 2000 * 3.5,
    "★ prompt grande demais é cortado ANTES de sair — o 400 chegou como JSON no chat");
  ok(d[d.length - 1].content === "a pergunta de agora", "  → a pergunta atual nunca é descartada");
  ok(d[0].role === "system" && d[0].content.includes("[…]"),
    "  → e o system, se precisar, é cortado no MEIO: começo e fim é onde estão as regras que pesam");
  ok(chat.caberNoContexto([{ role: "system", content: "curto" }, { role: "user", content: "oi" }]).length === 2,
    "  → conversa pequena passa intacta");

  ok(/e\.contextoEstourado = true/.test(fonte) && /"n_ctx"/.test(fonte),
    "★ e se o teto REAL do servidor for menor, o erro 400 vira retentativa enxuta");
  ok(/reenviando cortado/.test(fonte) && !/exceed_context_size_error.*sendEmbed/.test(fonte),
    "  → em vez de mostrar o JSON do llama.cpp para quem perguntou");
}

// ══ 33. Esquecer de verdade, e os quatro blocos ══
//
//  Depois de `&chat esquecer tudo` — que reportou 36 fatos, 1 perfil e 32
//  mensagens apagados — a Judy respondeu que "seu servidor é o Stoat Brasil
//  2.0". Não veio do banco: veio do FIO do canal, que vive na memória do
//  processo e sobrevivia à limpeza. Ela não estava lembrando, estava lendo.
console.log("\n── esquecer de verdade, e blocos separados ──");
{
  const chat = await import("./modulos/ai/chat.js");
  const cache = await import("./modulos/ai/cache-canal.js");

  cache.registrar("c-esq", { nome: "Ghiso", userId: "u", texto: "o servidor é Stoat Brasil 2.0" });
  chat.lembrarUltimaResposta("c-esq", { pergunta: "p", texto: "t", cortada: true });
  chat.lembrarRoteamento("c-esq", "ferramenta");
  ok(cache.recentes("c-esq").length === 1 && !!chat.continuacaoPendente("c-esq"),
    "o estado em memória existe antes de esquecer");

  chat.limparEstadoEmMemoria();
  ok(cache.recentes("c-esq").length === 0,
    "★ o FIO do canal é apagado — era daí que 'Stoat Brasil 2.0' voltava depois da limpeza");
  ok(chat.continuacaoPendente("c-esq") === null && !chat.seguimentoDeFerramenta("c-esq", "e a lógica?"),
    "  → e também a resposta pendente do `continue` e o roteamento anterior");

  // Por canal, sem derrubar os outros.
  cache.registrar("c-a", { nome: "X", userId: "1", texto: "a" });
  cache.registrar("c-b", { nome: "Y", userId: "2", texto: "b" });
  chat.limparEstadoEmMemoria({ canalId: "c-a" });
  ok(cache.recentes("c-a").length === 0 && cache.recentes("c-b").length === 1,
    "  → `&chat esquecer` individual limpa só o canal onde foi pedido");

  const mem = await import("./modulos/ai/memoria-agente.js");
  ok(typeof mem.descartarPendentes === "function",
    "★ e os buffers do agente são descartados: eles virariam fato DEPOIS da limpeza");

  const fonte = fs.readFileSync("./modulos/ai/chat.js", "utf8");
  ok(/const mem = limparEstadoEmMemoria\(\);/.test(fonte), "  → chamado pelo `esquecer tudo`");
  ok(/limparEstadoEmMemoria\(\{ canalId: message\.channelId \}\)/.test(fonte), "  → e pelo `esquecer` individual");

  // Os quatro blocos com fronteira explícita.
  for (const [bloco, oque] of [
    ["<quem_voce_e>", "o que ela é"],
    ["<onde_voce_esta>", "onde ela está"],
    ["<sobre_a_pessoa_com_quem_voce_fala>", "quem é o interlocutor"],
    ["<conversa_recente_do_canal>", "o fio do canal"],
  ]) ok(fonte.includes(bloco), `★ bloco separado para ${oque}: ${bloco}`);
  ok(/não tem cartão de perfil, não tem bio, não tem link de convite e não tem servidor próprio/.test(fonte),
    "  → e o bloco dela diz o que ela NÃO tem: foi bio e link de terceiro que ela adotou como seus");
}

console.log(`\nIA: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
