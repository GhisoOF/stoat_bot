// ══════════════════════════════════════════════════════════
//  gerar-imagem.js — a Judy desenha (Stable Diffusion via API A1111)
//
//  Fala com qualquer servidor compatível com a API do AUTOMATIC1111
//  (`/sdapi/v1/txt2img`): Forge, SD.Next, ou o próprio A1111. É o formato
//  mais suportado no homelab, e roda em Vulkan na mesma GPU do LLM.
//
//  Segurança em três camadas, porque um gerador de imagens num servidor
//  público é um convite a dois abusos distintos:
//
//  1. CONTEÚDO — o filtro de prompt recusa pedidos que envolvam menores em
//     qualquer contexto sexualizado, nudez de pessoas reais nomeadas, e
//     gore gratuito. A recusa acontece ANTES de qualquer chamada, e o
//     negative prompt fixo reforça do lado do gerador o que o filtro
//     bloqueia do lado do pedido.
//
//  2. RECURSOS — dimensões e passos têm teto (768px, 30 passos): uma GPU
//     de homelab presa 10 minutos numa imagem 2048² é negação de serviço
//     com um comando só.
//
//  3. BYTES — a imagem que o gerador devolve é REESCRITA pelo sharp antes
//     de sair daqui, como toda imagem (ver ver-imagem.js). O servidor de
//     SD é nosso, mas "é nosso" não é um argumento de segurança: se ele
//     for comprometido, o que ele devolver continua não chegando cru a
//     ninguém.
// ══════════════════════════════════════════════════════════

const SD_URL       = (process.env.SD_URL || "").replace(/\/$/, "");
const LADO_MAX     = Number(process.env.IMAGEM_LADO_GERACAO || 768);
const PASSOS_MAX   = Number(process.env.IMAGEM_PASSOS_MAX || 30);
const TIMEOUT_MS   = Number(process.env.IMAGEM_GERACAO_TIMEOUT_MS || 180_000);
const MAX_PIXELS   = Number(process.env.IMAGEM_MAX_PIXELS || 32_000_000);

// Reusa a reescrita do ver-imagem (mesma política, mesmo código).
import * as visao from "./ver-imagem.js";

let sharpMod = null;
async function sharp() {
  if (sharpMod) return sharpMod;
  sharpMod = (await import("sharp")).default;
  return sharpMod;
}

// ── O filtro de conteúdo ──────────────────────────────────
//
//  Padrões, não palavras soltas: "criança" sozinha é um pedido legítimo
//  ("criança brincando num parque"); o bloqueio exige a COMBINAÇÃO com
//  termos sexualizantes/de nudez — a mesma lógica de conjunção do
//  sentinela. Gore e conteúdo de ódio têm padrões próprios.
const MENOR   = /\b(crian[çc]a|menor(?:es)?|adolescente|teen|loli|shota|infantil|kid|child|underage|1[0-7]\s*(anos|years?|yo)\b)/i;
const SEXUAL  = /\b(nu[aá]?s?|nude?s?|naked|pelad[ao]s?|sem\s+roupa|nsfw|sexual\w*|er[óo]tic\w*|sensual\w*|lingerie|fetiche|fetish|hentai|porn\w*|explicit\w*|seminu\w*)\b/i;
const PESSOA_REAL = /\b(da|do|de)\s+[A-ZÀ-Ú][a-zà-ú]+\s+[A-ZÀ-Ú][a-zà-ú]+|celebridade|celebrity|famos[ao]/;
const GORE    = /\b(gore|decapita\w+|desmembr\w+|mutila\w+|v[íi]sceras|entranhas|tortura(?:ndo|r)?\b.*\b(real|pessoa)|corpo\s+esquartejado)\b/i;
const ODIO    = /\b(su[áa]stica|swastika|nazi\w*|kkk\b|supremac\w+)\b/i;

export function prompProibido(prompt) {
  const p = String(prompt ?? "");
  if (MENOR.test(p) && SEXUAL.test(p)) {
    return "esse pedido combina menores com conteúdo sexualizado — recusado, sem exceção, e fica registrado no log.";
  }
  if (SEXUAL.test(p) && PESSOA_REAL.test(p)) {
    return "nudez ou conteúdo sexual de pessoa real identificável é deepfake — recusado.";
  }
  if (GORE.test(p)) return "gore explícito não — posso fazer algo sombrio ou sinistro sem vísceras.";
  if (ODIO.test(p)) return "símbolos de ódio não saem daqui.";
  return null;
}

// O reforço do lado do gerador: mesmo que uma redação criativa passe pelo
// filtro, o negative prompt puxa o resultado para longe do que é proibido.
const NEGATIVO_FIXO = "nsfw, nude, naked, child, loli, underage, gore, dismemberment, watermark, text, low quality, deformed";

const multiploDe64 = (n) => Math.max(256, Math.min(LADO_MAX, Math.round(n / 64) * 64));

export const definicao = {
  type: "function",
  function: {
    name: "gerar_imagem",
    description: "Gera uma imagem a partir de uma descrição em texto (Stable Diffusion local). Use quando pedirem para desenhar, criar, gerar ou imaginar uma imagem/arte/ilustração. A imagem sai anexada na sua resposta.",
    parameters: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "Descrição do que desenhar, em inglês de preferência (o modelo entende melhor). Detalhes de estilo ajudam: 'watercolor', 'pixel art', 'photo'…" },
        largura: { type: "number", description: `Largura em px (máx ${LADO_MAX})` },
        altura: { type: "number", description: `Altura em px (máx ${LADO_MAX})` },
      },
    },
  },
};

export async function executar({ prompt, largura, altura }) {
  if (!SD_URL) {
    return { erro: "geração de imagem desligada: defina SD_URL no judy-ia apontando para um servidor compatível com a API do A1111 (Forge/SD.Next) — ver ia-servico/README." };
  }
  const texto = String(prompt ?? "").trim();
  if (!texto) return { erro: "descreva o que desenhar." };
  const recusa = prompProibido(texto);
  if (recusa) {
    console.warn(`[IA][gerar_imagem] RECUSADO: ${texto.slice(0, 160)}`);
    return { erro: `recusado: ${recusa}` };
  }

  const corpo = {
    prompt: texto.slice(0, 1500),
    negative_prompt: NEGATIVO_FIXO,
    width: multiploDe64(Number(largura) || LADO_MAX),
    height: multiploDe64(Number(altura) || LADO_MAX),
    steps: Math.min(PASSOS_MAX, Number(process.env.IMAGEM_PASSOS || 22)),
    cfg_scale: 6.5,
    sampler_name: process.env.IMAGEM_SAMPLER || "Euler a",
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${SD_URL}/sdapi/v1/txt2img`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo), signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`SD HTTP ${r.status} — ${(await r.text()).slice(0, 150)}`);
    const j = await r.json();
    const b64 = j?.images?.[0];
    if (!b64) return { erro: "o gerador não devolveu imagem" };

    // Reescrita de saída: os bytes do gerador não seguem crus (ver cabeçalho).
    const s = await sharp();
    const limpa = await s(Buffer.from(b64, "base64"), { limitInputPixels: MAX_PIXELS })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return {
      ok: true,
      dimensoes: `${corpo.width}x${corpo.height}`,
      anexo_base64: limpa.toString("base64"),
      anexo_mime: "image/jpeg",
      anexo_nome: "judy-arte.jpg",
    };
  } catch (e) {
    return { erro: `gerador de imagem: ${e?.message ?? e}` };
  } finally { clearTimeout(t); }
}
