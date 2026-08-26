// ══════════════════════════════════════════════════════════
//  imagem.js — a Judy vê imagens e cria imagens
//
//  As duas ferramentas lidam com o tipo de dado mais perigoso que chega
//  num chat: arquivos que outra pessoa controla. A regra de segurança é
//  uma só, aplicada duas vezes:
//
//      NENHUM byte vindo de fora segue adiante como chegou.
//
//  Toda imagem — recebida para ver, ou devolvida pelo gerador — passa pelo
//  sharp, que DECODIFICA os pixels e reescreve um arquivo novo. O que
//  sobrevive é a fotografia; o que morre é todo o resto: metadados EXIF,
//  payloads escondidos em chunks, arquivos-poliglota (imagem válida que
//  também é zip/script), e qualquer exploit que dependa dos bytes originais
//  chegarem a outro decodificador. Se o sharp não consegue decodificar, o
//  arquivo não era uma imagem honesta e morre aqui — dentro DESTE container,
//  que é descartável, e não no cliente de quem vai olhar a mensagem.
//
//  Além da reescrita:
//    • só https, só hosts da lista (o CDN do Stoat por padrão) — nada de
//      buscar URL arbitrária: isso seria um proxy de SSRF com a minha cara
//    • teto de bytes ANTES de decodificar, e teto de pixels NO decodificador
//      (`limitInputPixels` corta bombas de descompressão: 300×300 que viram
//      30.000×30.000 na memória)
//    • nada encosta no disco: tudo em memória, tudo morre com a requisição
// ══════════════════════════════════════════════════════════

const LLM_URL      = (process.env.LLM_URL || process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const MODELO_VISAO = process.env.LLM_MODEL_VISAO || "";        // vazio = visão desligada
const SD_URL       = (process.env.SD_URL || "").replace(/\/$/, "");  // vazio = geração desligada
const MAX_BYTES    = Number(process.env.IMAGEM_MAX_BYTES || 8 * 1024 * 1024);
const MAX_PIXELS   = Number(process.env.IMAGEM_MAX_PIXELS || 32_000_000);   // ~32MP decodificados
const LADO_VISAO   = Number(process.env.IMAGEM_LADO_VISAO || 1280);
const LADO_GERACAO = Number(process.env.IMAGEM_LADO_GERACAO || 768);
const TIMEOUT_MS   = Number(process.env.IMAGEM_TIMEOUT_MS || 120_000);

// Hosts de onde aceito BAIXAR imagem. Por padrão, só o CDN do próprio Stoat:
// é de lá que vêm os anexos das mensagens. Mais hosts via env, um por vírgula.
const HOSTS_PERMITIDOS = (process.env.IMAGEM_HOSTS_PERMITIDOS
  || "autumn.stoat.chat,autumn.stt.gg,cdn.stoat.chat,autumn.revolt.chat")
  .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

// sharp é opcional na instalação, obrigatório no uso: sem ele, as ferramentas
// se recusam a funcionar em vez de deixarem passar bytes crus.
let sharpMod = null;
async function sharp() {
  if (sharpMod) return sharpMod;
  try { sharpMod = (await import("sharp")).default; return sharpMod; }
  catch {
    throw new Error("o pacote `sharp` não está instalado no judy-ia — `npm install` no ia-servico e reinicie. Sem ele não reescrevo imagens, e sem reescrever eu não toco em imagem nenhuma.");
  }
}

function hostPermitido(url) {
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

// Baixa com teto de bytes DURANTE o download — `content-length` é declaração
// do servidor, não promessa; quem mente nela recebe o corte no streaming.
async function baixarLimitado(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "error" });
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

// A reescrita: decodifica os pixels e emite um JPEG novo, limitado em
// dimensão. É por aqui que TODA imagem passa, na entrada e na saída.
async function reescrever(buffer, ladoMax) {
  const s = await sharp();
  return s(buffer, { limitInputPixels: MAX_PIXELS, animated: false })
    .rotate()                                   // aplica a orientação EXIF… e joga o EXIF fora
    .resize({ width: ladoMax, height: ladoMax, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#111111" })         // transparência vira fundo, PNG vira JPEG sem surpresa
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

// ── ver_imagem ────────────────────────────────────────────
export const definicao = {
  type: "function",
  function: {
    name: "ver_imagem",
    description: "Vê e descreve uma imagem anexada na conversa (a URL do anexo vem no contexto da mensagem). Use quando alguém mandar uma imagem e perguntar sobre ela, ou pedir para você olhar/ler/descrever algo visual.",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "URL do anexo da mensagem (CDN do Stoat)" },
        pergunta: { type: "string", description: "O que responder sobre a imagem (ex.: 'descreva', 'que erro aparece nessa tela?')" },
      },
    },
  },
};

export async function executar({ url, pergunta }) {
  return verImagem({ url, pergunta });
}

export async function verImagem({ url, pergunta }) {
  if (!MODELO_VISAO) {
    return { erro: "visão desligada: defina LLM_MODEL_VISAO no judy-ia (um modelo multimodal no llama-swap, ex.: qwen2.5-vl) para eu poder ver imagens." };
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

  // A imagem que o modelo vê é a REESCRITA — os bytes originais morrem aqui.
  const corpo = {
    model: MODELO_VISAO,
    stream: false,
    max_tokens: 700,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: (pergunta || "Descreva esta imagem com detalhes úteis.").slice(0, 500) },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${limpa.toString("base64")}` } },
      ],
    }],
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo), signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status} — ${(await r.text()).slice(0, 150)}`);
    const j = await r.json();
    const texto = (j?.choices?.[0]?.message?.content || "").trim();
    return texto ? { descricao: texto } : { erro: "o modelo de visão não respondeu nada" };
  } catch (e) {
    return { erro: `modelo de visão: ${e?.message ?? e}` };
  } finally { clearTimeout(t); }
}
