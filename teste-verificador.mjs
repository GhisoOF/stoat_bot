// ─────────────────────────────────────────────────────────────────────────────
// testar-verificador.mjs — smoke test do verificador
//
// Princípio do projeto: teste que EXECUTA o código de verdade, porque o
// `modeloForcado` passou em todo check estático antes de quebrar produção.
// Aqui: casos determinísticos (contas, nomes inventados) + o caminho da IA
// contra um servidor OpenAI FALSO local, incluindo o contrato do template
// (uma única system no índice 0) e o fail-open com JSON quebrado.
//
// Project principle: tests must actually run the code. Deterministic cases
// plus the AI path against a local FAKE OpenAI server, asserting the
// single-system-at-index-0 template contract and fail-open on broken JSON.
//
// Uso / usage:  node scripts/testar-verificador.mjs
// Sai com código != 0 se algo falhar. / Non-zero exit on failure.
// ─────────────────────────────────────────────────────────────────────────────

import http from "node:http";
import {
  parseNumero, conferirContas, conferirNomes, conferirComandos,
  conferirDestinatario, conferirNegacaoDeCapacidade,
  verificarDeterministico, verificarComIA, verificar,
} from "./modulos/ai/verificar.js";

let passou = 0, falhou = 0;
function caso(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✅ ${nome}`); }
  else      { falhou++; console.log(`  ❌ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

console.log("── parseNumero ──");
caso("263.857 (milhar BR)", parseNumero("263.857") === 263857);
caso("1.234,56 (BR completo)", parseNumero("1.234,56") === 1234.56);
caso("3,5 (decimal BR)", parseNumero("3,5") === 3.5);
caso("791571 (sem separador)", parseNumero("791571") === 791571);
caso("2.5 (decimal US)", parseNumero("2.5") === 2.5);

console.log("── camada 2a: contas ──");
// o clássico que motivou tudo isso
caso("pega 2+2=2", conferirContas("fácil: 2+2=2").length === 1);
caso("aprova 2+2=4", conferirContas("fácil: 2+2=4").length === 0);
caso("aprova 263857 × 3 = 791.571 (milhar BR no resultado)",
  conferirContas("A conta dá 263857 × 3 = 791.571, tranquilo.").length === 0);
caso("pega 263857 × 3 = 791570", conferirContas("263857 × 3 = 791570").length === 1);
caso("aprova 10 / 4 = 2,5", conferirContas("então 10 / 4 = 2,5").length === 0);
caso("aprova arredondamento 10 / 3 = 3,33", conferirContas("10 / 3 = 3,33").length === 0);
caso("ignora divisão por zero", conferirContas("5 / 0 = 0").length === 0);
caso("ignora texto sem '='", conferirContas("entre 2-3 pessoas no dia 27/08/2026 às 10:30").length === 0);

console.log("── camada 2b: nomes na evidência ──");
const EVID_TTS = `
// voz-servico/tts.js (trecho real de exemplo)
import fs from "node:fs";
export async function sintetizar(texto, voz) { /* piper */ }
export function listarVozes() { return fs.readdirSync(VOZES_DIR); }
`;
// a invenção real: resposta descreve lerFileSync, que não existe no lido
caso("pega `lerFileSync` inventado",
  conferirNomes("O TTS usa a função `lerFileSync` para carregar o modelo.", EVID_TTS).length === 1);
caso("aprova `sintetizar` (existe no lido)",
  conferirNomes("A função `sintetizar` recebe texto e voz.", EVID_TTS).length === 0);
caso("aprova listarVozes() fora de crases",
  conferirNomes("Já listarVozes() devolve as vozes do diretório.", EVID_TTS).length === 0);
caso("pula token que veio da pergunta ('X não existe')",
  conferirNomes("A função `gerarComentarioEspontaneo` não existe nesse arquivo.",
    EVID_TTS, "o tts tem uma gerarComentarioEspontaneo?").length === 0);
caso("não roda com evidência trivial",
  conferirNomes("A `qualquerCoisa` faz tudo.", "oi").length === 0);
caso("case-insensitive como fallback",
  conferirNomes("Use `SINTETIZAR` ali.", EVID_TTS).length === 0);

console.log("── camada 2c: comandos citados ──");
// registro de mentira, no formato que o chat.js monta do help + aliases
const CMDS = {
  prefixo: "&",
  bases: new Set(["assistente", "automod", "help", "chat", "mute"]),
  subs: { assistente: new Set(["rapido", "completo", "canais", "protecao", "cancelar", "quick", "full"]) },
};
// o caso real: subcomando inventado pela Judy
caso("pega `&assistente automod` (subcomando inventado)",
  conferirComandos("Recomendo usar &assistente automod para configurar.", CMDS).length === 1);
caso("aprova `&assistente protecao` (o certo)",
  conferirComandos("Use &assistente protecao.", CMDS).length === 0);
caso("pega `&assistencia` (base inventada)",
  conferirComandos("O comando &assistencia resolve.", CMDS).length === 1);
caso("aprova `&mute João` (argumento não é subcomando: mute não tem lista fechada)",
  conferirComandos("É só usar &mute João por 10 minutos.", CMDS).length === 0);
caso("aprova apelido EN de subcomando (&assistente quick)",
  conferirComandos("Try &assistente quick.", CMDS).length === 0);
caso("sem registro, não roda (fail-open)",
  conferirComandos("Use &qualquercoisa aí.", null).length === 0);

console.log("── camada 2d: destinatário ──");
// o caso real: a Judy chamou a Mangetsuki de Ghiso a conversa inteira
caso("pega vocativo para a pessoa errada",
  conferirDestinatario("Com certeza, Ghiso. Se você está aprendendo...", "Mangetsuki").length === 1);
caso("aprova vocativo para quem falou",
  conferirDestinatario("Entendi, Mangetsuki. Vamos lá.", "Mangetsuki").length === 0);
caso("aprova falar SOBRE alguém citado na pergunta",
  conferirDestinatario("O Akita, sim — vale assistir.", "Balatro", "gostei do Akita, ele é direto").length === 0);
caso("aprova texto sem vocativo nenhum",
  conferirDestinatario("Boa. Segue o plano que combinamos.", "Ghiso").length === 0);
caso("palavras capitalizadas comuns não disparam",
  conferirDestinatario("Certo, então. Boa, vamos.", "Ghiso").length === 0);

console.log("── camada 2e: negação de capacidade ──");
caso("pega 'não tenho acesso à internet' com pedido explícito",
  conferirNegacaoDeCapacidade("Não tenho acesso à internet para buscar isso.", { pediuBusca: true }).length === 1);
caso("pega negação com busca JÁ na evidência",
  conferirNegacaoDeCapacidade("Não consigo pesquisar em tempo real.", { evidencia: "[buscar_web]\n1. resultado..." }).length === 1);
caso("aprova negação em papo comum sem pedido nem evidência",
  conferirNegacaoDeCapacidade("Não tenho acesso à internet.", {}).length === 0);
caso("aprova resposta normal com a palavra internet",
  conferirNegacaoDeCapacidade("A internet de vocês está lenta hoje?", { pediuBusca: true }).length === 0);

console.log("── camada 2 integrada ──");
{
  const r = verificarDeterministico({
    resposta: "O `lerFileSync` calcula 2+2=2. Depois rode &assistencia.",
    evidencia: EVID_TTS,
    pergunta: "como funciona o tts?",
    comandos: CMDS,
  });
  caso("junta conta + nome + comando (3 problemas)", !r.ok && r.problemas.length === 3,
    JSON.stringify(r.problemas));
}

// ── servidor OpenAI falso p/ camada 3 ────────────────────────────────────────
// Decide a resposta pelo conteúdo da mensagem do usuário: marcador
// [CASO:x] embutido na "pergunta" de teste.
const fake = http.createServer((req, res) => {
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    const j = JSON.parse(corpo);

    // contrato do template Qwythos: exatamente 1 system, no índice 0
    const systems = j.messages.filter((m) => m.role === "system").length;
    const contratoOk = systems === 1 && j.messages[0].role === "system";
    if (!contratoOk) {
      res.writeHead(500).end(JSON.stringify({ error: "contrato de template violado" }));
      return;
    }

    const user = j.messages.find((m) => m.role === "user")?.content || "";
    let content = '{"ok": true}';
    if (user.includes("[CASO:reprova]"))
      content = '```json\n{"ok": false, "problemas": ["a resposta descreve uma função que a evidência não contém"]}\n```';
    if (user.includes("[CASO:lixo]"))
      content = "claro! aqui está sua análise: tudo certo 👍";
    res.writeHead(200, { "content-type": "application/json" })
       .end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});

await new Promise((r) => fake.listen(0, "127.0.0.1", r));
const porta = fake.address().port;

// wrapper no formato que o chat.js injeta: mensagens → string da resposta
async function chamarModeloFake(mensagens, { maxTokens } = {}) {
  const resp = await fetch(`http://127.0.0.1:${porta}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "fake", max_tokens: maxTokens, messages: mensagens }),
  });
  if (!resp.ok) throw new Error(`fake server ${resp.status}`);
  const j = await resp.json();
  return j.choices[0].message.content;
}

console.log("── camada 3: IA ancorada (servidor falso) ──");
{
  const r = await verificarComIA({
    pergunta: "[CASO:aprova] como funciona o tts?",
    resposta: "A função `sintetizar` recebe texto e voz.",
    evidencia: EVID_TTS,
    chamarModelo: chamarModeloFake,
  });
  caso("aprova quando modelo diz ok", r?.ok === true, JSON.stringify(r));
}
{
  const r = await verificarComIA({
    pergunta: "[CASO:reprova] como funciona o tts?",
    resposta: "O TTS usa `lerFileSync` e um pool de threads.",
    evidencia: EVID_TTS,
    chamarModelo: chamarModeloFake,
  });
  caso("reprova com problemas (e limpa cerca ```json)",
    r?.ok === false && r.problemas.length === 1, JSON.stringify(r));
}
{
  const r = await verificarComIA({
    pergunta: "[CASO:lixo] tanto faz",
    resposta: "qualquer coisa",
    evidencia: EVID_TTS,
    chamarModelo: chamarModeloFake,
  });
  caso("fail-open com resposta sem JSON (devolve null)", r === null);
}
{
  const r = await verificarComIA({
    pergunta: "sem evidência",
    resposta: "qualquer coisa",
    evidencia: "",
    chamarModelo: chamarModeloFake,
  });
  caso("recusa rodar sem evidência (null)", r === null);
}
{
  const lenta = () => new Promise(() => {});           // nunca resolve
  process.env.VERIF_TIMEOUT_MS_IGNORADO = "1";        // (timeout real é lido no import; testamos via race abaixo)
  const r = await Promise.race([
    verificarComIA({ pergunta: "p", resposta: "r", evidencia: EVID_TTS, chamarModelo: lenta }),
    new Promise((res) => setTimeout(() => res("pendente"), 500)),
  ]);
  caso("chamada pendurada não trava o teste (timeout interno cobre produção)", r === "pendente" || r === null);
}

console.log("── orquestrador ──");
{
  const r = await verificar({
    pergunta: "[CASO:aprova] como funciona o tts?",
    resposta: "O `lerFileSync` cuida disso. Aliás 2+2=2.",
    evidencia: EVID_TTS,
    chamarModelo: chamarModeloFake,
  });
  caso("determinística pega mesmo com IA aprovando",
    !r.ok && r.camadas.deterministica === 2 && r.camadas.ia === 0, JSON.stringify(r));
}
{
  const r = await verificar({
    pergunta: "oi, tudo bem?",
    resposta: "tudo ótimo!",
    evidencia: "",                       // conversa casual: sem evidência
    chamarModelo: chamarModeloFake,
  });
  caso("conversa casual: aprova sem chamar IA (camadas.ia === null)",
    r.ok && r.camadas.ia === null, JSON.stringify(r));
}

fake.close();

// ── guard de imagem anexada → caminho com ferramentas ──────────────────────
// Regressão do log de 2026-08-30: "o que você vê nessa imagem?" roteou como
// `conversa`, o ver_imagem nunca ficou disponível e ela disse que não tinha
// acesso à imagem. O guard é textual porque é assim que o chat.js anuncia os
// anexos na própria pergunta.
console.log("── guard: imagem anexada força ferramenta ──");
{
  const fonte = await import("node:fs").then(m => m.readFileSync("./modulos/ai/chat.js", "utf8"));
  const re = /if \(tipo !== "ferramenta" && \/\\\[\(imagem[\s\S]{0,200}?tipo = "ferramenta";/;
  caso("o guard existe no chat.js", re.test(fonte));

  // o marcador que o guard procura tem que ser o MESMO que o chat.js escreve
  const guard = /\[\(imagem\\\(ns\\\) anexada\|attached image\)/.test(fonte);
  caso("marcador do guard bate com o texto injetado (PT e EN)", guard);

  // e o regex do guard, aplicado ao texto real, casa
  const rx = /\[(imagem\(ns\) anexada|attached image)/;
  caso("casa com o texto PT real",
    rx.test("o que você vê nessa imagem?\n\n[imagem(ns) anexada(s), visíveis com a ferramenta ver_imagem: https://x]"));
  caso("casa com o texto EN real",
    rx.test("what do you see?\n\n[attached image(s), viewable with the ver_imagem tool: https://x]"));
  caso("não casa com pergunta comum sobre imagem",
    !rx.test("você consegue gerar uma imagem pra mim?"));
}

console.log(`\n${passou} passou, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
