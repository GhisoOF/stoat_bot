
const URL_BASE = process.env.LLM_URL || "http://localhost:8081";
const REPETIR = Number(process.env.REPETIR || 1);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 600_000);
const TENTATIVAS_429 = Number(process.env.TENTATIVAS_429 || 4);

// A ferramenta é uma cópia fiel da que o bot usa — testar com uma inventada
// mediria outra coisa.
const FERRAMENTA = {
  type: "function",
  function: {
    name: "calcular",
    description: "Executa uma expressão matemática e devolve o resultado exato. Use SEMPRE que houver uma conta.",
    parameters: {
      type: "object",
      required: ["codigo"],
      properties: { codigo: { type: "string", description: "Expressão JS, ex.: 'return 2+2'" } },
    },
  },
};

async function chamar(modelo, body, tentativa = 0) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${URL_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelo, stream: false, ...body }),
      signal: ctrl.signal,
    });
    if (r.status === 429 && tentativa < TENTATIVAS_429) {
      clearTimeout(timer);
      const espera = 5000 * (tentativa + 1);
      process.stdout.write(`\r  (servidor ocupado trocando de modelo; nova tentativa em ${espera / 1000}s)   `);
      await new Promise((x) => setTimeout(x, espera));
      return chamar(modelo, body, tentativa + 1);
    }
    const j = await r.json();
    if (!r.ok || !j?.choices) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
    const msg = j.choices[0]?.message ?? {};
    return {
      texto: (msg.content ?? "").trim(),
      // O raciocínio aparece em `reasoning_content` ou em <think>…</think>.
      raciocinio: (msg.reasoning_content ?? "").length
        + ((msg.content ?? "").match(/<think>[\s\S]*?<\/think>/g) ?? []).join("").length,
      chamadas: msg.tool_calls ?? [],
      fim: j.choices[0]?.finish_reason,
      tokens: j.usage?.completion_tokens ?? 0,
      ms: Date.now() - t0,
    };
  } finally { clearTimeout(timer); }
}

const PROVAS = [
  {
    nome: "ferramenta",
    ajuda: "emite tool_calls de verdade (não JSON como texto)",
    async rodar(m) {
      const r = await chamar(m, {
        max_tokens: 700,
        tools: [FERRAMENTA],
        messages: [
          { role: "system", content: "Você é uma assistente. Use a ferramenta `calcular` para qualquer conta." },
          { role: "user", content: "quanto é 263857 * 3?" },
        ],
      });
      if (r.chamadas.length) {
        const args = typeof r.chamadas[0].function?.arguments === "string"
          ? r.chamadas[0].function.arguments : JSON.stringify(r.chamadas[0].function?.arguments);
        return { ok: true, nota: `chamou ${r.chamadas[0].function?.name}`, extra: args?.slice(0, 40), r };
      }
      // O erro exato que aconteceu no chat: a chamada veio no texto.
      if (/"(name|function)"\s*:/.test(r.texto)) {
        return { ok: false, nota: "JSON COMO TEXTO ⚠️", extra: r.texto.slice(0, 45), r };
      }
      return { ok: false, nota: "não chamou", extra: r.texto.slice(0, 45), r };
    },
  },
  {
    nome: "json",
    ajuda: "devolve JSON puro e parseável nas decisões internas",
    async rodar(m) {
      const r = await chamar(m, {
        max_tokens: 600,
        messages: [
          { role: "system", content: 'Responda SOMENTE com JSON, sem texto antes ou depois, sem markdown. Formato: {"buscar": true|false, "query": "..."}' },
          { role: "user", content: "A pergunta é: quem ganhou a eleição de 2026? Precisa buscar na internet?" },
        ],
      });
      const limpo = r.texto.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "").trim();
      try {
        const o = JSON.parse(limpo);
        return { ok: typeof o?.buscar === "boolean", nota: typeof o?.buscar === "boolean" ? "ok" : "campo errado", extra: limpo.slice(0, 40), r };
      } catch {
        return { ok: false, nota: r.fim === "length" ? "cortou pensando" : "não é JSON", extra: limpo.slice(0, 40) || "(vazio)", r };
      }
    },
  },
  {
    nome: "idioma",
    ajuda: "responde em português quando perguntado em português",
    async rodar(m) {
      const r = await chamar(m, {
        max_tokens: 300,
        messages: [
          { role: "system", content: "Responda em português do Brasil, sempre." },
          { role: "user", content: "Explique em duas frases o que é um cache." },
        ],
      });
      const t = r.texto.toLowerCase();
      const pt = /\b(é|são|um|uma|para|com|que|não|dados|memória|rápido|acesso)\b/.test(t);
      const en = /\b(the|is|are|that|data|memory|faster|access|stored)\b/.test(t);
      return { ok: pt && !en, nota: pt && !en ? "português" : en ? "INGLÊS ⚠️" : "?", extra: r.texto.slice(0, 45), r };
    },
  },
  {
    nome: "identidade",
    ajuda: "aceita o nome que você deu, sem se apresentar como o modelo",
    async rodar(m) {
      const r = await chamar(m, {
        max_tokens: 400,
        messages: [
          { role: "system", content: "Você é a Judy, uma bot feita pelo Ghiso para a plataforma Stoat. Você NÃO é um modelo de linguagem nem tem nome de empresa de IA. Responda em português." },
          { role: "user", content: "quem é você? qual modelo você usa por baixo?" },
        ],
      });
      const vaza = /(eu sou|sou|i am|i'm)\s+(a |o |um |uma |the |an? )?(lfm|liquid|qwen\S*|qwythos|empero|ornith|llama|gemma|mistral|gpt|claude|deepseek|hauhau\S*|modelo de linguagem|large language model)/i.test(r.texto)
        || /(eu sou|sou|i am|i'm)\s+(um |uma |a |an? )?(modelo|model)\b[^.!?\n]{0,40}\b(criad|treinad|desenvolvid|constru|built|trained|created)\S*\s+(por|pela|pelo|by)\b/i.test(r.texto);
      return { ok: !vaza, nota: vaza ? "VAZOU ⚠️" : "manteve o papel", extra: r.texto.slice(0, 45), r };
    },
  },
  {
    nome: "concisão",
    ajuda: "responde curto quando se pede curto",
    async rodar(m) {
      const r = await chamar(m, {
        max_tokens: 400,
        messages: [
          { role: "system", content: "Seja BREVE: uma ou duas frases, no máximo. Responda em português." },
          { role: "user", content: "bom dia, tudo bem?" },
        ],
      });
      const n = r.texto.length;
      return { ok: n > 0 && n <= 220, nota: `${n} chars`, extra: r.texto.slice(0, 45), r };
    },
  },
];

const modelos = process.argv.slice(2);
if (!modelos.length) {
  const r = await fetch(`${URL_BASE}/v1/models`).then((x) => x.json()).catch(() => null);
  for (const m of r?.data ?? []) modelos.push(m.id);
}
if (!modelos.length) {
  console.error(`Nenhum modelo. O servidor em ${URL_BASE} respondeu?`);
  process.exit(1);
}

console.log(`Servidor: ${URL_BASE}`);
console.log(`Provas:   ${PROVAS.map((p) => p.nome).join(", ")}${REPETIR > 1 ? `  (${REPETIR}× cada)` : ""}\n`);

const placar = [];
for (const m of modelos) {
  console.log(`\n\u001b[1m${m}\u001b[0m`);
  try {
    process.stdout.write("  (carregando…)");
    const t = Date.now();
    await chamar(m, { max_tokens: 1, messages: [{ role: "user", content: "oi" }] });
    process.stdout.write(`\r  (carregou em ${((Date.now() - t) / 1000).toFixed(0)}s)          \n`);
  } catch (e) {
    console.log(`\r  \u001b[31m✗ não carregou: ${e.message}\u001b[0m                    `);
    placar.push({ m, acertos: 0, total: PROVAS.length * REPETIR, ms: 0, pensou: 0 });
    continue;
  }
  let acertos = 0, msTotal = 0, pensou = 0, provas = 0;
  for (const prova of PROVAS) {
    let ok = 0; let ultimo = null;
    for (let i = 0; i < REPETIR; i++) {
      try {
        const res = await prova.rodar(m);
        ultimo = res; if (res.ok) ok++;
        msTotal += res.r.ms; pensou += res.r.raciocinio; provas++;
      } catch (e) {
        ultimo = { ok: false, nota: `ERRO: ${e.message}`.slice(0, 40), extra: "", r: { ms: 0, raciocinio: 0 } };
        provas++;
      }
    }
    acertos += ok;
    const marca = ok === REPETIR ? "\u001b[32m✓\u001b[0m" : ok === 0 ? "\u001b[31m✗\u001b[0m" : "\u001b[33m~\u001b[0m";
    const cont = REPETIR > 1 ? ` ${ok}/${REPETIR}` : "";
    console.log(`  ${marca} ${prova.nome.padEnd(11)}${cont} ${String(ultimo?.nota ?? "").padEnd(18)} ${ultimo?.extra ? `“${String(ultimo.extra).replace(/\n/g, " ")}…”` : ""}`);
  }
  const total = PROVAS.length * REPETIR;
  placar.push({ m, acertos, total, ms: Math.round(msTotal / (provas || 1)), pensou: Math.round(pensou / (provas || 1)) });
}

console.log("\n\n\u001b[1mRESUMO\u001b[0m");
console.log("MODELO                PROVAS   MÉDIA/chamada   RACIOCÍNIO DESCARTADO");
console.log("----------------------------------------------------------------------");
for (const p of placar.sort((a, b) => b.acertos - a.acertos || a.ms - b.ms)) {
  console.log(`${p.m.padEnd(22)}${String(`${p.acertos}/${p.total}`).padEnd(9)}${String(`${(p.ms / 1000).toFixed(1)}s`).padEnd(16)}${p.pensou ? `${p.pensou} chars/resposta` : "—"}`);
}

console.log(`
Como ler:
  ferramenta  ELIMINATÓRIA para LLM_MODEL_LOGICA. "JSON COMO TEXTO" é o bug
              que mandou {"name":"ler_codigo"…} para o chat.
  json        ELIMINATÓRIA para LLM_MODEL_DECISAO. "cortou pensando" quer
              dizer que o orçamento foi todo para o <think>.
  idioma
  identidade  falhas aqui o bot corrige sozinho, mas cada correção custa uma
  concisão    inferência inteira — melhor um modelo que já acerta.

  RACIOCÍNIO DESCARTADO é tempo pago e jogado fora. Um modelo com 4.000
  chars/resposta é bem mais lento na prática do que o tok/s sugere.

Depois: rode ./scripts/medir-modelos.sh nos que passaram nas eliminatórias.
Velocidade só importa entre modelos que fazem o serviço.
`);
