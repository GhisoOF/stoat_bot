
const DECISAO_TOKENS   = Number(process.env.CHAT_DECISAO_TOKENS   || 600);
const VERIF_EVID_MIN   = Number(process.env.VERIF_EVID_MIN        || 50);    // evidência menor que isso não ancora nada
const VERIF_EVID_MAX   = Number(process.env.VERIF_EVID_MAX        || 6000);  // corte p/ caber no contexto do 9B
const VERIF_RESP_MAX   = Number(process.env.VERIF_RESP_MAX        || 3000);
const VERIF_PERG_MAX   = Number(process.env.VERIF_PERG_MAX        || 1000);
const VERIF_TIMEOUT_MS = Number(process.env.VERIF_TIMEOUT_MS      || 25000);

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
export function conferirDestinatario(resposta, autor, pergunta = "") {
  const problemas = [];
  if (!resposta || !autor) return problemas;
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

// A evidência tem resultado REAL desta ferramenta (não só um erro dela)?
function evidenciaTem(evidencia, nome) {
  const e = String(evidencia ?? "");
  const re = new RegExp(`\\[${nome}[^\\]]*\\]\\n(.{0,30})`, "g");
  for (const m of e.matchAll(re)) {
    if (!/^\s*\{"erro"/.test(m[1] ?? "")) return true;   // veio conteúdo, não erro
  }
  return false;
}

export function conferirNegacaoDeCapacidade(resposta, { pediuBusca = false, evidencia = "", pediuCodigo = false, pediuImagem = false } = {}) {
  if (!resposta) return [];
  const problemas = [];

  const negouInternet = /(n[\u00e3a]o|sem)\s+(tenho|tem|possuo)\s+(como\s+)?acess(o|ar)\s+([\u00e0a]\s+)?(internet|web)|n[\u00e3a]o\s+(consigo|posso)\s+(buscar|pesquisar|acessar\s+a\s+internet)|tempo\s+real/i.test(resposta);
  if (negouInternet) {
    if (String(evidencia).includes("[buscar")) problemas.push("nega acesso \u00e0 internet, mas a busca RODOU e trouxe resultados (est\u00e3o na evid\u00eancia)");
    else if (pediuBusca) problemas.push("nega acesso \u00e0 internet num pedido expl\u00edcito de busca — a ferramenta existe e n\u00e3o foi usada");
  }

  // "não consigo acessar o arquivo/código/repositório" (PT e EN)
  const NEGA = "(n[\u00e3a]o\\s+(?:consigo|posso|tenho\\s+(?:como|acesso))|sem\\s+acesso|i\\s+can(?:no|')t|cannot|unable\\s+to|i\\s+do\\s+not\\s+have\\s+access)";
  // O trecho entre a negação e o alvo não pode cruzar fronteira de frase, mas
  // um ponto DENTRO de nome de arquivo (main.js) é permitido: `\.(?=\w)`.
  const negouArquivo = new RegExp(`${NEGA}(?:[^.!?\\n]|\\.(?=\\w)){0,60}\\b(arquivo|c[\u00f3o]digo|reposit[\u00f3o]rio|\\brepo\\b|file|repository|code)\\b`, "i").test(resposta);
  if (negouArquivo) {
    if (evidenciaTem(evidencia, "ler_codigo")) problemas.push("nega acesso ao arquivo, mas o ler_codigo RODOU e o conte\u00fado est\u00e1 na evid\u00eancia");
    else if (pediuCodigo) problemas.push("nega acesso ao arquivo num pedido de leitura de c\u00f3digo — a ferramenta ler_codigo existe e n\u00e3o foi usada");
  }

  // "não consigo ver/acessar a imagem / o CDN" (PT e EN)
  const negouImagem = new RegExp(`${NEGA}[^.!?\\n]{0,60}\\b(imagens?|anexos?|images?|attachments?|cdn)\\b`, "i").test(resposta);
  if (negouImagem) {
    if (evidenciaTem(evidencia, "ver_imagem")) problemas.push("nega conseguir ver a imagem, mas o ver_imagem RODOU e a descri\u00e7\u00e3o est\u00e1 na evid\u00eancia");
    else if (pediuImagem) problemas.push("nega conseguir ver a imagem com anexo presente — a ferramenta ver_imagem existe e n\u00e3o foi usada");
  }

  return [...new Set(problemas)];
}

export function verificarDeterministico({ resposta, evidencia = "", pergunta = "", comandos = null, autor = "", pediuBusca = false, pediuCodigo = false, pediuImagem = false } = {}) {
  const problemas = [
    ...conferirContas(resposta),
    ...conferirNomes(resposta, evidencia, pergunta),
    ...conferirComandos(resposta, comandos),
    ...conferirDestinatario(resposta, autor, pergunta),
    ...conferirNegacaoDeCapacidade(resposta, { pediuBusca, evidencia, pediuCodigo, pediuImagem }),
  ];
  return { ok: problemas.length === 0, problemas };
}

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

export async function verificar({ pergunta = "", resposta = "", evidencia = "", comandos = null, autor = "", pediuBusca = false, pediuCodigo = false, pediuImagem = false, chamarModelo = null, dlog = () => {} } = {}) {
  const det = verificarDeterministico({ resposta, evidencia, pergunta, comandos, autor, pediuBusca, pediuCodigo, pediuImagem });

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
