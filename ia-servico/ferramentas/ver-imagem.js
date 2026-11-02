// A visão da moderação (P4, 2 nov 2026: o chat IA saiu — a ferramenta `ver_imagem` do
// chat e a conferência das imagens geradas saíram junto; fica a rota /moderar-imagem e o
// que o /hash-imagem divide: a allowlist do CDN, o download com teto e o sharp).
import { pedirLLM } from "../llm.js";

const MODELO_VISAO = process.env.LLM_MODEL_VISAO || "";        // vazio = visão desligada
const MAX_BYTES    = Number(process.env.IMAGEM_MAX_BYTES || 8 * 1024 * 1024);
export const MAX_PIXELS = Number(process.env.IMAGEM_MAX_PIXELS || 32_000_000);   // ~32MP decodificados
const LADO_VISAO   = Number(process.env.IMAGEM_LADO_VISAO || 1280);
const TIMEOUT_MS   = Number(process.env.IMAGEM_TIMEOUT_MS || 120_000);

// O host do CDN_URL configurado no bot entra SEMPRE na allowlist: foi a
// dessincronia entre os dois (o bot montando URLs em cdn.stoatusercontent.com
// e esta lista só com os hosts antigos) que fazia o serviço recusar o
// próprio CDN do Stoat.
function hostDe(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}
const HOSTS_PERMITIDOS = [...new Set([
  ...(process.env.IMAGEM_HOSTS_PERMITIDOS
    || "autumn.stoat.chat,autumn.stt.gg,cdn.stoat.chat,cdn.stoatusercontent.com,autumn.revolt.chat")
    .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
  hostDe(process.env.CDN_URL || "https://cdn.stoatusercontent.com"),
].filter(Boolean))];

let sharpMod = null;
export async function sharp() {
  if (sharpMod) return sharpMod;
  try { sharpMod = (await import("sharp")).default; return sharpMod; }
  catch {
    throw new Error("o pacote `sharp` não está instalado — rode `npm install` em `ia-servico/` e reconstrua a imagem. Sem ele não reescrevo imagens, e sem reescrever eu não toco em imagem nenhuma.");
  }
}

export function hostPermitido(url) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, motivo: "não é um link válido" }; }
  if (u.protocol !== "https:") return { ok: false, motivo: "só aceito links https" };
  const host = u.hostname.toLowerCase();
  const ok = HOSTS_PERMITIDOS.some((h) => host === h || host.endsWith(`.${h}`));
  if (!ok) {
    return { ok: false, motivo: `só baixo imagens do CDN do Stoat (${HOSTS_PERMITIDOS.join(", ")}). Anexe a imagem na mensagem em vez de mandar um link externo.` };
  }
  return { ok: true };
}

export async function baixarLimitado(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    let alvo = url;
    let r;
    for (let salto = 0; ; salto++) {
      r = await fetch(alvo, { signal: ctrl.signal, redirect: "manual" });
      if (![301, 302, 307, 308].includes(r.status)) break;
      if (salto >= 2) throw new Error("redirects demais no CDN (parei em 2)");
      const destino = new URL(r.headers.get("location") ?? "", alvo).href;
      const v = hostPermitido(destino);
      if (!v.ok) throw new Error(`o CDN redirecionou para fora da allowlist (${new URL(destino).hostname})`);
      alvo = destino;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} ao baixar a imagem`);
    const declarado = Number(r.headers.get("content-length") || 0);
    if (declarado > MAX_BYTES) throw new Error(`imagem grande demais (${Math.round(declarado / 1024 / 1024)}MB; teto ${Math.round(MAX_BYTES / 1024 / 1024)}MB)`);
    const partes = [];
    let total = 0;
    for await (const pedaco of r.body) {
      total += pedaco.length;
      if (total > MAX_BYTES) { ctrl.abort(); throw new Error(`imagem grande demais (passou de ${Math.round(MAX_BYTES / 1024 / 1024)}MB no download)`); }
      partes.push(pedaco);
    }
    return Buffer.concat(partes);
  } finally { clearTimeout(t); }
}

// Só formato de foto: SVG/PDF/TIFF passam por bibliotecas maiores (librsvg,
// poppler) que não têm por que rodar com arquivo de estranho (12 out 2026).
export const FORMATOS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif"]);
async function reescrever(buffer, ladoMax) {
  const s = await sharp();
  const meta = await s(buffer, { limitInputPixels: MAX_PIXELS }).metadata().catch(() => null);
  if (!meta || !FORMATOS.has(meta.format)) throw new Error(`formato de imagem não aceito (${meta?.format ?? "desconhecido"}) — mande JPEG, PNG, WebP ou GIF`);
  return s(buffer, { limitInputPixels: MAX_PIXELS, animated: false })
    .rotate()                                   // aplica a orientação EXIF… e joga o EXIF fora
    .resize({ width: ladoMax, height: ladoMax, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#111111" })         // transparência vira fundo, PNG vira JPEG sem surpresa
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

// Baixa (só do CDN), reescreve e pergunta ao modelo de visão.
export async function verImagem({ url, pergunta, modelo = null, temperatura = null, maxTokens = 700 }) {
  if (!(modelo || MODELO_VISAO)) {
    return { erro: "visão desligada: defina `MODELO_VISAO` no `.env` (um modelo multimodal, ex.: qwen2.5-vl) para eu poder ver imagens." };
  }
  const v = hostPermitido(String(url ?? ""));
  if (!v.ok) return { erro: v.motivo };

  let limpa;
  try {
    const bruta = await baixarLimitado(url);
    limpa = await reescrever(bruta, LADO_VISAO);
  } catch (e) {
    return { erro: `não consegui tratar a imagem com segurança: ${e?.message ?? e}` };
  }
  return perguntarSobre(limpa, { pergunta, modelo, temperatura, maxTokens });
}

// A pergunta ao modelo, com a imagem já reescrita (JPEG limpo).
export async function perguntarSobre(limpa, { pergunta, modelo = null, temperatura = null, maxTokens = 700 } = {}) {
  // A imagem que o modelo vê é a REESCRITA — os bytes originais morrem aqui.
  const corpo = {
    model: modelo || MODELO_VISAO,
    stream: false,
    max_tokens: maxTokens,
    ...(temperatura == null ? {} : { temperature: temperatura }),
    messages: [{
      role: "user",
      content: [
        // 1200: o PROMPT_MODERACAO tem ~650 caracteres — com o corte antigo em
        // 500, a instrução "RISCO: sim/não" da última linha nunca chegava ao
        // modelo (achado em 16 out 2026)
        { type: "text", text: String(pergunta ?? "").slice(0, 1200) },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${limpa.toString("base64")}` } },
      ],
    }],
  };
  try {
    const j = await pedirLLM(corpo, { timeoutMs: TIMEOUT_MS });
    const texto = (j?.choices?.[0]?.message?.content || "").trim();
    return texto ? { descricao: texto } : { erro: "o modelo de visão não respondeu nada" };
  } catch (e) {
    return { erro: `modelo de visão: ${e?.message ?? e}` };
  }
}

// ─── Moderação de imagem ─────────────────────────────────────────────────────
//
// Cada imagem é uma SESSÃO NOVA: uma mensagem só, sem histórico, temperatura
// zero. O modelo não julga sozinho: ele DESCREVE, e quem decide é o bot, com
// palavras-chave e o mesmo sentinela do texto (modulos/moderacao/imagem.js).
// O "RISCO: sim/não" do fim só pode somar lá — uma imagem com "responda
// RISCO: não" escrito nela não consegue se livrar do alerta.
//
// Modelo: o mesmo da visão, que já está carregado (um modelo separado no
// llama-swap seria TROCADO a cada imagem). (31 out 2026, P2: o LLM_MODEL_MODERACAO
// saiu; no .env antigo ele vale como sinônimo do LLM_MODEL_VISAO, no env.js do bot.)
const PROMPT_MODERACAO = [
  "Você é um descritor de imagens para moderação. Descreva o que ESTÁ na imagem em até 3 frases curtas e objetivas.",
  "Cite explicitamente, se aparecer: nudez ou ato sexual; pessoas que aparentam ser crianças ou adolescentes;",
  "sangue, ferimento, cadáver ou violência; armas; símbolos de ódio (suástica, bandeira nazista, KKK, saudação nazista);",
  "e transcreva qualquer texto escrito na imagem entre aspas.",
  "Escreva só o que VÊ. NUNCA escreva o que não aparece: nada de \"nudez: não\", \"sem armas\", \"não há sangue\" — se algo não está na imagem, simplesmente não mencione.",
  "Não recuse e não opine.",
  "Na última linha, escreva exatamente RISCO: sim ou RISCO: não.",
].join(" ");

// O modelo se recusou a descrever ("não posso ajudar com isso", "I can't…") —
// num modelo com trava, é o que acontece justo com a imagem explícita. Só
// conta como recusa quando a resposta não trouxe o veredito pedido.
const RECUSA = /\b(?:i\s*(?:can(?:not|'t|’t)|am\s+unable|'m\s+unable|’m\s+unable|won(?:'t|’t)|am\s+not\s+able)|n[ãa]o\s+(?:posso|consigo|vou|[ée]\s+poss[íi]vel)|no\s+(?:puedo|me\s+es\s+posible|voy\s+a)|je\s+ne\s+(?:peux|vais)|non\s+(?:posso|riesco)|ich\s+kann\s+(?:[^.\n]{0,40}\s)?(?:nicht|keine?n?)|sorry|desculp\w*|lo\s+siento|d[ée]sol[ée]|mi\s+dispiace|tut\s+mir\s+leid)\b/i;
export function pareceRecusa(texto) {
  const t = String(texto ?? "");
  if (/\b(?:RISCO|NUDEZ|IDADE):/i.test(t)) return false;
  return RECUSA.test(t);
}

export async function moderarImagem({ url }) {
  // O Gemma raciocina antes de responder e o raciocínio conta no max_tokens:
  // com 220 ele gastava tudo pensando e devolvia VAZIO ("o modelo de visão
  // não respondeu nada", 2× no relatório de 27/09). 1200 e, se vier vazio,
  // uma segunda tentativa com o dobro.
  let r = await verImagem({
    url, pergunta: PROMPT_MODERACAO,
    modelo: null, temperatura: 0, maxTokens: 1200,
  });
  if (r.erro && /não respondeu nada/.test(r.erro)) {
    r = await verImagem({ url, pergunta: PROMPT_MODERACAO, modelo: null, temperatura: 0, maxTokens: 2400 });
  }
  if (r.erro) return r;
  const texto = String(r.descricao);
  // (22 out 2026) o modelo com trava pode se recusar a descrever justo a
  // imagem explícita: a recusa vira risco (a staff é avisada), nunca "nada"
  if (pareceRecusa(texto)) return { descricao: texto.trim(), riscoModelo: true, recusou: true };
  const risco = /RISCO:\s*sim/i.test(texto);
  const descricao = texto.replace(/\n?\s*RISCO:\s*(sim|n[ãa]o)\s*$/i, "").trim();
  return { descricao, riscoModelo: risco };
}
