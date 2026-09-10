
const LLM_URL      = (process.env.LLM_URL || "").replace(/\/$/, "");
const MODELO_VISAO = process.env.LLM_MODEL_VISAO || "";        // vazio = visão desligada
const SD_URL       = (process.env.SD_URL || "").replace(/\/$/, "");  // vazio = geração desligada
const MAX_BYTES    = Number(process.env.IMAGEM_MAX_BYTES || 8 * 1024 * 1024);
const MAX_PIXELS   = Number(process.env.IMAGEM_MAX_PIXELS || 32_000_000);   // ~32MP decodificados
const LADO_VISAO   = Number(process.env.IMAGEM_LADO_VISAO || 1280);
const LADO_GERACAO = Number(process.env.IMAGEM_LADO_GERACAO || 768);
const TIMEOUT_MS   = Number(process.env.IMAGEM_TIMEOUT_MS || 120_000);

// O host do CDN_URL configurado no bot entra SEMPRE na allowlist: foi a
// dessincronia entre os dois (chat.js montando URLs em cdn.stoatusercontent.com
// e esta lista só com os hosts antigos) que fazia a ferramenta recusar o
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

async function baixarLimitado(url) {
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

async function reescrever(buffer, ladoMax) {
  const s = await sharp();
  return s(buffer, { limitInputPixels: MAX_PIXELS, animated: false })
    .rotate()                                   // aplica a orientação EXIF… e joga o EXIF fora
    .resize({ width: ladoMax, height: ladoMax, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#111111" })         // transparência vira fundo, PNG vira JPEG sem surpresa
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

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
