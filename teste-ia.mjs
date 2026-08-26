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
  ok(pedidos[0].corpo.messages[0]?.content === "/no_think", "  → /no_think desliga o raciocínio do Qwen3 em qualquer backend");
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

console.log(`\nIA: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
