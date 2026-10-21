
export const URL_MAX = 512;

const IPV4_INTERNO = [
  /^127\./,                        // loopback
  /^10\./,                         // privada
  /^192\.168\./,                   // privada
  /^172\.(1[6-9]|2\d|3[01])\./,    // privada
  /^169\.254\./,                   // link-local (inclui metadata 169.254.169.254)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT — é onde a Tailscale vive
  /^0\./,                          // "este host"
];

const HOST_INTERNO = /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home|umbrel.*)$/i;

const PROXY_DE_BUSCA = /(?:search\.brave\.com|encrypted-tbn|gstatic\.com|lookaside|bing\.net\/th|duckduckgo\.com\/i\/)/i;

const TEM_EXTENSAO = /\.(?:png|jpe?g|gif|webp|avif)(?:$|[?#])/i;

function ehIpLiteral(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host);
}

/**
 * Valida uma URL de imagem para uso no campo `media` de um embed.
 * @returns {{ok: boolean, motivo?: string, motivoEn?: string,
 *            aviso?: string, avisoEn?: string, motivoEs?: string, avisoEs?: string, noStoat?: boolean, url?: string}}
 */
export function validarUrlImagem(entrada) {
  const bruto = String(entrada ?? "").trim();

  if (!bruto) {
    return { ok: false, motivo: "faltou o link da imagem", motivoEn: "the image link is missing", motivoEs: "falta el enlace de la imagen" };
  }
  if (bruto.length > URL_MAX) {
    return {
      ok: false,
      motivo: `o link tem ${bruto.length} caracteres (máximo ${URL_MAX})`,
      motivoEn: `the link is ${bruto.length} characters long (maximum ${URL_MAX})`,
      motivoEs: `el enlace tiene ${bruto.length} caracteres (máximo ${URL_MAX})`,
    };
  }

  let u;
  try { u = new URL(bruto); } catch {
    return { ok: false, motivo: "não é um link válido", motivoEn: "that isn't a valid link", motivoEs: "no es un enlace válido" };
  }

  // Só http(s): corta `javascript:`, `data:`, `file:` e afins de saída.
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return {
      ok: false,
      motivo: `\`${u.protocol}\` não é aceito — use um link \`https\``,
      motivoEn: `\`${u.protocol}\` isn't accepted — use an \`https\` link`,
      motivoEs: `\`${u.protocol}\` no se acepta — usa un enlace \`https\``,
    };
  }

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // ── Bloqueio de alvos internos (SSRF) ──
  if (HOST_INTERNO.test(host) || (ehIpLiteral(host) && (
    IPV4_INTERNO.some((re) => re.test(host)) || host === "::1" || host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")
  ))) {
    return {
      ok: false,
      motivo: "esse endereço é de **rede interna**. Links assim não são aceitos: além de não funcionarem para quem vê a mensagem, guardá-los transformaria a configuração do servidor num atalho para a rede local da máquina do bot.",
      motivoEn: "that address is on an **internal network**. Links like this aren't accepted: besides not working for whoever sees the message, storing them would turn the server config into a shortcut into the bot machine's local network.",
      motivoEs: "esa dirección es de una **red interna**. Los enlaces así no se aceptan: además de no funcionar para quien ve el mensaje, guardarlos convertiría la configuración del servidor en un atajo hacia la red local de la máquina del bot.",
    };
  }

  // Porta fora do comum = quase sempre um serviço interno, não um CDN.
  if (u.port && u.port !== "80" && u.port !== "443") {
    return {
      ok: false,
      motivo: `a porta \`${u.port}\` não é aceita — imagens públicas ficam em 80/443.`,
      motivoEn: `port \`${u.port}\` isn't accepted — public images live on 80/443.`,
      motivoEs: `el puerto \`${u.port}\` no se acepta — las imágenes públicas están en 80/443.`,
    };
  }

  // IP cru público: funciona, mas é sinal de servidor caseiro. Não bloqueia.
  const avisos = [];
  const avisosEn = [];
  const avisosEs = [];

  if (u.protocol === "http:") {
    avisos.push("⚠️ O link é `http` (sem criptografia): muitos clientes recusam carregar. Prefira `https`.");
    avisosEn.push("⚠️ The link is `http` (not encrypted): many clients refuse to load it. Prefer `https`.");
    avisosEs.push("⚠️ El enlace es `http` (sin cifrado): muchos clientes se niegan a cargarlo. Mejor usa `https`.");
  }
  if (PROXY_DE_BUSCA.test(bruto)) {
    avisos.push("⚠️ É um link de **resultado de busca** (Brave/Google/Bing). Costuma exibir, mas é enorme e a miniatura pode expirar sem aviso — o link fica quebrado meses depois.");
    avisosEn.push("⚠️ This is a **search result** link (Brave/Google/Bing). It usually displays, but it's huge and the thumbnail may expire silently — leaving a broken link months later.");
    avisosEs.push("⚠️ Es un enlace de **resultado de búsqueda** (Brave/Google/Bing). Suele mostrarse, pero es enorme y la miniatura puede caducar sin aviso — el enlace queda roto meses después.");
  } else if (!TEM_EXTENSAO.test(bruto)) {
    avisos.push("⚠️ O link não termina em `.png`/`.jpg`/`.gif`/`.webp`, então pode não ser a imagem em si.");
    avisosEn.push("⚠️ The link doesn't end in `.png`/`.jpg`/`.gif`/`.webp`, so it may not be the image itself.");
    avisosEs.push("⚠️ El enlace no termina en `.png`/`.jpg`/`.gif`/`.webp`, así que puede que no sea la imagen en sí.");
  }

  const noStoat = /(^|\.)stoat\.(chat|gg)$/i.test(host)
    || /(^|\.)stoatusercontent\.com$/i.test(host)
    || /(^|\.)autumn\./i.test(host);
  if (!noStoat) {
    avisos.push("🔒 A imagem fica num site de terceiros: **o dono daquele site vê o IP de cada pessoa que carregar a mensagem** — numa mensagem de boas-vindas, o de todo mundo que entrar. Enviar o arquivo aqui no Stoat e usar o link do anexo evita isso.");
    avisosEn.push("🔒 The image lives on a third-party site: **its owner sees the IP of everyone who loads the message** — in a welcome message, everyone who joins. Uploading the file here on Stoat and using the attachment link avoids that.");
    avisosEs.push("🔒 La imagen está en un sitio de terceros: **su dueño ve la IP de cada persona que carga el mensaje** — en un mensaje de bienvenida, la de todos los que entren. Subir el archivo aquí en Stoat y usar el enlace del adjunto lo evita.");
  }

  return {
    ok: true,
    url: bruto,
    noStoat,
    aviso: avisos.length ? avisos.join("\n") : null,
    avisoEn: avisosEn.length ? avisosEn.join("\n") : null,
    avisoEs: avisosEs.length ? avisosEs.join("\n") : null,
  };
}

// `stoatusercontent.com` é o CDN ATUAL do Stoat: sem ele aqui, um anexo do
// próprio Stoat não virava capa de embed (`media`) e ainda levava o aviso de
// "site de terceiros", que era falso.
const ANEXO_STOAT = /^https?:\/\/[^/]*(?:autumn|cdn|media)[^/]*\.(?:stoat\.(?:chat|gg)|stoatusercontent\.com|revolt\.chat)\/[^/]+\/([0-9A-HJKMNP-TV-Z]{26})(?:\/|$|\?)/i;

export function extrairAnexoStoat(url) {
  const m = String(url ?? "").match(ANEXO_STOAT);
  return m ? m[1] : null;
}

export function comoExibir(url) {
  if (!url) return null;
  const id = extrairAnexoStoat(url);
  if (id) return { modo: "media", id };
  return { modo: "link", url };
}

const ROTULO_INVISIVEL = "\u2800";

export function formatarLinkConteudo(url, ocultar = true) {
  if (!url) return null;
  return ocultar ? `[${ROTULO_INVISIVEL}](${url})` : url;
}
