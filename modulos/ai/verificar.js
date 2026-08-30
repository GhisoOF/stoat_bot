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

// ── Camada 2c: comandos citados existem de verdade? ──────────────────────────
// A Judy recomendou `&assistente automod` — subcomando que não existe (os
// reais são rapido/completo/canais/protecao). Quem digitou caiu no menu
// genérico e a recomendação virou beco. A checagem compara `&comando sub`
// citados na resposta contra o registro REAL (passado por quem chama):
//   • base desconhecida → problema ("&assistencia");
//   • subcomando inválido → problema, mas SÓ para comandos cujo conjunto de
//     subcomandos é fechado e conhecido (senão "&mute João" viraria falso
//     positivo — João não é subcomando, é argumento).
export function conferirComandos(resposta, comandos) {
  const problemas = [];
  if (!resposta || !comandos?.bases?.size) return problemas;
  const { bases, subs = {}, prefixo = "&" } = comandos;
  const p = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${p}([a-zá-úç]{2,})(?:[ \\t]+([a-zá-úç]{2,}))?`, "gi");
  for (const m of resposta.matchAll(re)) {
    const base = m[1].toLowerCase();
    const sub  = (m[2] || "").toLowerCase();
    if (!bases.has(base)) {
      problemas.push(`o comando \`${prefixo}${base}\` não existe`);
      continue;
    }
    const validos = subs[base];
    if (sub && validos instanceof Set && validos.size && !validos.has(sub)) {
      const lista = [...validos].slice(0, 6).join(", ");
      problemas.push(`\`${prefixo}${base} ${sub}\` não existe — os subcomandos reais são: ${lista}`);
    }
  }
  return [...new Set(problemas)];
}
// ── Camada 2d: respondeu à pessoa certa? ─────────────────────────────────────
// A Judy passou uma conversa inteira chamando a Mangetsuki de "Ghiso" — os
// turnos eram anônimos e o único nome à vista era o do dono. O turno agora
// leva rótulo, mas rótulo é prompt, e prompt não segura comportamento: isto
// aqui segura. Vocativo (nome no começo, ou depois de vírgula/travessão,
// seguido de pontuação) dirigido a alguém que NÃO é quem falou → problema.
// Nome citado na própria pergunta é pulado: falar SOBRE alguém é normal.
export function conferirDestinatario(resposta, autor, pergunta = "") {
  const problemas = [];
  if (!resposta || !autor) return problemas;
  // Só vocativo DEPOIS de vírgula/travessão: no meio da frase, maiúscula é
  // quase sempre nome próprio. Início de frase fica de fora de propósito —
  // "Entendi, ..." é indistinguível de "Mangetsuki, ..." por posição, e falso
  // positivo aqui custa mais que o caso perdido.
  const reVocativo = /[,—–-]\s+([A-ZÀ-Þ][a-zà-þ]{2,20})\s*[,.!?—–:]/g;
  const pergLower = (pergunta || "").toLowerCase();
  const autorLower = String(autor).toLowerCase();
  for (const m of resposta.matchAll(reVocativo)) {
    const nome = m[1];
    const nomeLower = nome.toLowerCase();
    if (autorLower.includes(nomeLower) || nomeLower.includes(autorLower)) continue;
    if (pergLower.includes(nomeLower)) continue;             // falou SOBRE a pessoa
    problemas.push(`dirige-se a "${nome}", mas quem falou foi ${autor}`);
  }
  return [...new Set(problemas)].slice(0, 2);
}

// ── Camada 2e: negou capacidade que existe? ──────────────────────────────────
// "N\u00e3o tenho acesso \u00e0 internet" \u00e9 mentira operacional em dois cen\u00e1rios: quando
// a pessoa PEDIU busca (a ferramenta existe e o caminho devia t\u00ea-la usado) e
// quando a evid\u00eancia mostra que a busca RODOU. Nos dois, \u00e9 problema.
export function conferirNegacaoDeCapacidade(resposta, { pediuBusca = false, evidencia = "" } = {}) {
  if (!resposta) return [];
  const negou = /(n[\u00e3a]o|sem)\s+(tenho|tem|possuo)\s+(como\s+)?acess(o|ar)\s+([\u00e0a]\s+)?(internet|web)|n[\u00e3a]o\s+(consigo|posso)\s+(buscar|pesquisar|acessar\s+a\s+internet)|tempo\s+real/i.test(resposta);
  if (!negou) return [];
  if (String(evidencia).includes("[buscar")) return ["nega acesso \u00e0 internet, mas a busca RODOU e trouxe resultados (est\u00e3o na evid\u00eancia)"];
  if (pediuBusca) return ["nega acesso \u00e0 internet num pedido expl\u00edcito de busca — a ferramenta existe e n\u00e3o foi usada"];
  return [];
}

// ── Camada 2 completa ────────────────────────────────────────────────────────
export function verificarDeterministico({ resposta, evidencia = "", pergunta = "", comandos = null, autor = "", pediuBusca = false } = {}) {
  const problemas = [
    ...conferirContas(resposta),
    ...conferirNomes(resposta, evidencia, pergunta),
    ...conferirComandos(resposta, comandos),
    ...conferirDestinatario(resposta, autor, pergunta),
    ...conferirNegacaoDeCapacidade(resposta, { pediuBusca, evidencia }),
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
export async function verificar({ pergunta = "", resposta = "", evidencia = "", comandos = null, autor = "", pediuBusca = false, chamarModelo = null, dlog = () => {} } = {}) {
  const det = verificarDeterministico({ resposta, evidencia, pergunta, comandos, autor, pediuBusca });

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
