// ─────────────────────────────────────────────────────────────────────────────
// verificar.js — verificação em camadas da resposta da IA
//                layered verification of the AI response
//
// Camada 2 (determinística): refaz contas escritas na resposta e confere se
//   nomes citados (funções, arquivos) existem na evidência lida pelas
//   ferramentas. Código puro, custo zero de GPU, zero latência de modelo.
// Layer 2 (deterministic): recomputes any "a op b = c" found in the reply and
//   checks that cited identifiers exist in the tool evidence. Pure JS.
//
// Camada 3 (IA ancorada): segundo passe do MESMO modelo residente, stateless,
//   sem persona, recebendo (pergunta, resposta, evidência). Só julga o que a
//   camada 2 não alcança: paráfrase errada, conclusão que não decorre da
//   evidência. NUNCA roda sem evidência — sem âncora, o modelo aprova o
//   próprio erro.
// Layer 3 (grounded AI): stateless second pass of the SAME resident model,
//   no persona, (question, answer, evidence). Never runs without evidence.
//
// Regras herdadas do projeto / project-settled constraints honored here:
//   • uma ÚNICA mensagem system, no índice 0 (template Qwen/Qwythos);
//   • piso de tokens de decisão (o raciocínio come ~185 antes do JSON);
//   • fail-open: se o verificador falhar, a resposta original fica como está;
//   • a saída do verificador nunca é verificada de novo (sem loop).
// ─────────────────────────────────────────────────────────────────────────────

const DECISAO_TOKENS   = Number(process.env.CHAT_DECISAO_TOKENS   || 600);
const VERIF_EVID_MIN   = Number(process.env.VERIF_EVID_MIN        || 50);    // evidência menor que isso não ancora nada
const VERIF_EVID_MAX   = Number(process.env.VERIF_EVID_MAX        || 6000);  // corte p/ caber no contexto do 9B
const VERIF_RESP_MAX   = Number(process.env.VERIF_RESP_MAX        || 3000);
const VERIF_PERG_MAX   = Number(process.env.VERIF_PERG_MAX        || 1000);
const VERIF_TIMEOUT_MS = Number(process.env.VERIF_TIMEOUT_MS      || 25000);

// ── util: número em formato BR ou US → Number ────────────────────────────────
// "263.857" → 263857 · "1.234,56" → 1234.56 · "3,5" → 3.5 · "791571" → 791571
export function parseNumero(txt) {
  if (txt == null) return NaN;
  let s = String(txt).trim();
  if (!s) return NaN;
  if (s.includes(",")) {
    // vírgula presente → vírgula é decimal, pontos são milhar (formato BR)
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // só pontos, em grupos de 3 → milhar BR ("791.571")
    s = s.replace(/\./g, "");
  }
  // senão: ponto é decimal (formato US) ou não há separador — fica como está
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// ── Camada 2a: refazer contas escritas na resposta ───────────────────────────
// Procura padrões "número operador número = número" e recalcula em JS.
// A mesma classe de erro do "2+2=2": o modelo escreve a conta e erra o
// resultado. Comparação com tolerância para decimais arredondados.
export function conferirContas(resposta) {
  const problemas = [];
  if (!resposta) return problemas;
  const re = /(-?\d[\d.,]*)\s*([+\u00d7xX*\/\u00f7-])\s*(-?\d[\d.,]*)\s*=\s*(-?\d[\d.,]*)/g;
  let m;
  while ((m = re.exec(resposta)) !== null) {
    const [bruto, aTxt, op, bTxt, rTxt] = m;
    const a = parseNumero(aTxt), b = parseNumero(bTxt), escrito = parseNumero(rTxt);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(escrito)) continue;
    let esperado;
    switch (op) {
      case "+": esperado = a + b; break;
      case "-": esperado = a - b; break;
      case "*": case "x": case "X": case "\u00d7": esperado = a * b; break;
      case "/": case "\u00f7":
        if (b === 0) continue;               // divisão por zero: não é conta, é outra conversa
        esperado = a / b; break;
      default: continue;
    }
    // tolerância: absoluta p/ arredondamento de 2 casas, relativa p/ números grandes
    const tol = Math.max(0.005, Math.abs(esperado) * 1e-9);
    if (Math.abs(esperado - escrito) > tol) {
      const bonito = Number.isInteger(esperado) ? String(esperado) : String(Number(esperado.toFixed(6)));
      problemas.push(`conta errada: "${bruto.trim()}" — o resultado correto é ${bonito}`);
    }
  }
  return problemas;
}

// ── Camada 2b: nomes citados existem na evidência? ───────────────────────────
// Pega identificadores citados na resposta (entre crases, ou "nome()") e
// confere se aparecem no que o ler_codigo/busca realmente retornou. É o que
// pegaria o `lerFileSync` inventado: a resposta afirma um símbolo que não
// está em lugar nenhum do material lido.
//
// Cuidados contra falso positivo:
//   • só roda com evidência não-trivial (>= VERIF_EVID_MIN chars);
//   • token que aparece na PERGUNTA é pulado (a pessoa pode perguntar por
//     algo que não existe, e a resposta "X não existe" citaria X);
//   • comparação também sem "()" e case-insensitive como fallback.
export function conferirNomes(resposta, evidencia, pergunta = "") {
  const problemas = [];
  if (!resposta || !evidencia || evidencia.length < VERIF_EVID_MIN) return problemas;

  const tokens = new Set();
  // `assim` — qualquer coisa curta entre crases que pareça identificador/caminho
  for (const m of resposta.matchAll(/`([^`\n]{2,80})`/g)) {
    const t = m[1].trim();
    if (/^[\w$][\w$.\/-]*(\(\))?$/.test(t) && /[a-zA-Z]/.test(t)) tokens.add(t);
  }
  // nomeDeFuncao() fora de crases
  for (const m of resposta.matchAll(/\b([a-zA-Z_$][a-zA-Z0-9_$]{2,})\(\)/g)) tokens.add(m[1] + "()");

  const evid = evidencia;
  const evidLower = evidencia.toLowerCase();
  const pergLower = (pergunta || "").toLowerCase();

  for (const t of tokens) {
    const semParens = t.replace(/\(\)$/, "");
    if (semParens.length < 3) continue;
    if (pergLower.includes(semParens.toLowerCase())) continue;         // veio da pergunta
    const existe = evid.includes(semParens) || evidLower.includes(semParens.toLowerCase());
    if (!existe) problemas.push(`cita \`${semParens}\`, que não aparece no material lido`);
  }
  return [...new Set(problemas)];
}

// ── Camada 2 completa ────────────────────────────────────────────────────────
export function verificarDeterministico({ resposta, evidencia = "", pergunta = "" } = {}) {
  const problemas = [
    ...conferirContas(resposta),
    ...conferirNomes(resposta, evidencia, pergunta),
  ];
  return { ok: problemas.length === 0, problemas };
}

// ── Camada 3: verificador de IA ancorado na evidência ────────────────────────
// `chamarModelo(mensagens, { json, maxTokens })` é injetado pelo chat.js e
// deve devolver a string da resposta do modelo (o wrapper que já existe).
// Mantém o contrato do template: UMA system, índice 0. Fail-open: qualquer
// erro (timeout, JSON quebrado, formato inesperado) devolve null e nada muda.

const PROMPT_VERIFICADOR =
  "Você é um verificador interno. Você não conversa com pessoas e não tem nome. " +
  "Recebe PERGUNTA, EVIDÊNCIA (o material realmente lido pelas ferramentas) e RESPOSTA. " +
  "Sua única tarefa: apontar afirmações da RESPOSTA que a EVIDÊNCIA não sustenta ou que a contradizem, " +
  "e defeitos graves de coerência (a resposta se contradiz, ignora a pergunta, ou está no idioma errado). " +
  "REGRAS: não use conhecimento próprio sobre o assunto — só a EVIDÊNCIA conta como fonte; " +
  "não julgue estilo, tom, formatação nem completude; na dúvida, aprove. " +
  "Responda APENAS com JSON, sem texto antes ou depois: " +
  '{"ok": true} se não houver problema grave, ou {"ok": false, "problemas": ["descrição curta", ...]} com no máximo 3 itens.';

function cortar(txt, max) {
  const s = String(txt || "");
  return s.length <= max ? s : s.slice(0, max) + "\n[... cortado / truncated ...]";
}

export async function verificarComIA({ pergunta, resposta, evidencia, chamarModelo, dlog = () => {} }) {
  if (typeof chamarModelo !== "function") return null;
  if (!evidencia || String(evidencia).length < VERIF_EVID_MIN) return null;   // sem âncora, não julga

  const mensagens = [
    { role: "system", content: PROMPT_VERIFICADOR },                          // única system, índice 0
    {
      role: "user",
      content:
        `PERGUNTA:\n${cortar(pergunta, VERIF_PERG_MAX)}\n\n` +
        `EVIDÊNCIA:\n${cortar(evidencia, VERIF_EVID_MAX)}\n\n` +
        `RESPOSTA:\n${cortar(resposta, VERIF_RESP_MAX)}`,
    },
  ];

  let bruto;
  try {
    bruto = await Promise.race([
      chamarModelo(mensagens, { json: true, maxTokens: DECISAO_TOKENS }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), VERIF_TIMEOUT_MS)),
    ]);
  } catch (e) {
    dlog(`verificador: chamada falhou (${e?.message}) — fail-open`);
    return null;
  }

  try {
    const limpo = String(bruto || "").replace(/```json|```/g, "").trim();
    const ini = limpo.indexOf("{"), fim = limpo.lastIndexOf("}");
    if (ini === -1 || fim === -1) throw new Error("sem JSON");
    const j = JSON.parse(limpo.slice(ini, fim + 1));
    if (typeof j.ok !== "boolean") throw new Error("sem campo ok");
    const problemas = Array.isArray(j.problemas)
      ? j.problemas.filter((p) => typeof p === "string" && p.trim()).slice(0, 3)
      : [];
    return { ok: j.ok || problemas.length === 0, problemas };
  } catch (e) {
    dlog(`verificador: JSON inválido (${e?.message}) — fail-open`);
    return null;
  }
}

// ── Orquestrador ─────────────────────────────────────────────────────────────
// Camada 2 sempre; camada 3 só com evidência e wrapper injetado. Junta e
// deduplica, teto de 5 problemas. `camadas` diz de onde veio cada achado —
// útil no CHAT_DEBUG para saber o que a IA pegou que o código não pegou.
export async function verificar({ pergunta = "", resposta = "", evidencia = "", chamarModelo = null, dlog = () => {} } = {}) {
  const det = verificarDeterministico({ resposta, evidencia, pergunta });

  let ia = null;
  if (evidencia && String(evidencia).length >= VERIF_EVID_MIN) {
    ia = await verificarComIA({ pergunta, resposta, evidencia, chamarModelo, dlog });
  }

  const problemas = [...new Set([
    ...det.problemas,
    ...((ia && !ia.ok) ? ia.problemas : []),
  ])].slice(0, 5);

  return {
    ok: problemas.length === 0,
    problemas,
    camadas: { deterministica: det.problemas.length, ia: ia ? (ia.ok ? 0 : ia.problemas.length) : null },
  };
}
