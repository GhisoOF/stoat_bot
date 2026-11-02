// Sobe um arquivo para o Autumn (o CDN de anexos do Stoat) e devolve o id
// para mandar numa mensagem: { attachments: [id] }. Veio do chat.js (imagens
// da IA); os tickets usam para o .txt da transcrição.
// (P4.3, 2 nov 2026) E o anexo de uma mensagem RECEBIDA, uma fonte só: o CDN, o link dele
// (`urlDoAnexo`) e se é imagem (`ehImagem`) — a visão (imagem.js), o resgate do log (log.js) e a
// bateria de teste do dono (bateria.js) usam estes; nenhum baixa nada aqui.
import { sufixo } from "./aleatorio.js";

// O CDN dos anexos do Stoat (lido a cada chamada: CDN_URL no .env, senão o atual do Stoat)
export const CDN_PADRAO = "https://cdn.stoatusercontent.com";
export const cdnDosAnexos = () => (process.env.CDN_URL || CDN_PADRAO).replace(/\/$/, "");
// O id de um anexo (o File do stoat.js tem `id`; o objeto cru da API, `_id`): só letras, dígitos,
// `_` e `-` (R6) — um id com `/`, `?` ou `..` mudaria o caminho do link.
export function idDoAnexo(a) {
  const id = a?.id ?? a?._id;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}
// O link do anexo no CDN do Stoat (o mesmo que a visão analisa), ou null
export function urlDoAnexo(a) {
  const id = idDoAnexo(a);
  return id ? `${cdnDosAnexos()}/attachments/${id}` : null;
}
// É imagem? O que o Stoat diz do anexo: `metadata.type` "Image" ou o tipo `image/*`
export function ehImagem(a) {
  return /^image\//.test(String(a?.metadata?.type ?? a?.contentType ?? a?.content_type ?? "")) || a?.metadata?.type === "Image";
}

export async function subirAnexo({ base64, mime = "image/jpeg", nome = "imagem.jpg" }, client = null) {
  // A URL de upload vem da configuração VIVA da API (o servidor anuncia o seu
  // autumn no handshake) — o padrão hardcoded apodreceu quando o Stoat migrou
  // de CDN e o upload morria com "fetch failed" sem pista.
  const anunciado = client?.configuration?.features?.autumn?.url
    ?? client?.config?.features?.autumn?.url ?? null;
  // "autumn.stoat.chat" (o nome óbvio) serve certificado inválido em produção
  // — foi o que causava "fetch failed" sem pista nenhuma. O endereço real é
  // "cdn.stoatusercontent.com" (confirmado: é o que aparece nos anexos de
  // verdade do Stoat, e o que a config viva normalmente anuncia).
  const AUTUMN = (process.env.AUTUMN_URL || anunciado || "https://cdn.stoatusercontent.com").replace(/\/$/, "");
  // Multipart montado NA MÃO, como um Buffer único com Content-Length
  // explícito — em vez de deixar o fetch/undici "streamar" um FormData(Blob).
  // Esse streaming automático corta o corpo no meio em conexões com MTU
  // reduzido (o túnel WireGuard usa 1420 em vez de 1500) e o Autumn recusava
  // com "incomplete multipart stream" — sem pista nenhuma do lado do cliente.
  const boundary = `----judy${Date.now().toString(36)}${sufixo(16)}`;
  const dados = Buffer.from(base64, "base64");
  const abre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${nome.replace(/"/g, "")}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const fecha = Buffer.from(`\r\n--${boundary}--\r\n`);
  const corpo = Buffer.concat([abre, dados, fecha]);
  const r = await fetch(`${AUTUMN}/attachments`, {
    method: "POST",
    headers: {
      "X-Bot-Token": process.env.BOT_TOKEN ?? "",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(corpo.length),
    },
    body: corpo,
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Autumn HTTP ${r.status} — ${(await r.text().catch(() => "")).slice(0, 120)}`);
  const j = await r.json().catch(() => null);
  if (!j?.id) throw new Error("Autumn não devolveu o id do anexo");
  return j.id;
}
