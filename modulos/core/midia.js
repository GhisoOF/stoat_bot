// ══════════════════════════════════════════════════════════
//  midia.js — validação de URLs de imagem usadas em embeds
//
//  ── Modelo de ameaça (por que este arquivo existe) ──
//
//  INVARIANTE: **o bot nunca baixa a imagem.** Ele só guarda a URL e a
//  repassa ao Stoat no campo `media` do embed. Quem busca o arquivo é a
//  infraestrutura do Stoat e/ou o cliente de cada pessoa que vê a
//  mensagem. Nenhum byte de terceiro entra no processo do bot, então
//  não há aqui superfície de "arquivo malicioso executado no servidor".
//  Se algum dia alguém for acrescentar um `fetch()` nessa URL, é
//  preciso reavaliar tudo abaixo — em especial o item SSRF.
//
//  O que sobra de risco, e o que fazemos:
//
//  1. SSRF (o mais sério). Quem quer que busque a URL pode ser induzido
//     a bater em endereços que só a rede interna alcança. Este bot roda
//     em `network_mode: host` no Umbrel e enxerga o Ollama e o judy-ia
//     pela Tailscale — uma URL como `http://100.74.70.106:11434/...`
//     salva na config é uma rota pronta para a rede de casa. Bloqueamos
//     loopback, redes privadas, link-local, `.local`, a faixa da
//     Tailscale/CGNAT e portas fora de 80/443.
//
//  2. Privacidade dos membros. Uma URL em host de terceiro é buscada
//     quando a mensagem é exibida: o dono daquele host vê o IP e o
//     User-Agent de quem carregou. Numa mensagem de boas-vindas, isso é
//     o IP de **todo mundo que entra no servidor**. Não dá para impedir
//     tecnicamente, mas dá para avisar e recomendar hospedar no Stoat.
//
//  3. Exploits de decodificador de imagem (ex.: libwebp CVE-2023-4863)
//     atingem os CLIENTES, não o bot. Fora do nosso alcance; entra no
//     mesmo aviso do item 2 — preferir arquivo hospedado no Stoat.
//
//  4. Conteúdo impróprio. Quem configura precisa de ManageMessages, ou
//     seja, já é da moderação. É risco social, não técnico.
//
//  5. Poluição da config. Impomos limite de tamanho para a URL não virar
//     um despejo de dados dentro do JSON de configuração do servidor.
// ══════════════════════════════════════════════════════════

export const URL_MAX = 512;

// Faixas que NUNCA devem ser alvo: se a URL aponta para cá, ou é engano
// ou é tentativa de usar o bot como ponte para a rede interna.
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

// Proxies de resultado de busca: apontam para miniatura temporária, não
// para o arquivo. Não é risco de segurança, é link que quebra.
const PROXY_DE_BUSCA = /(?:search\.brave\.com|encrypted-tbn|gstatic\.com|lookaside|bing\.net\/th|duckduckgo\.com\/i\/)/i;

const TEM_EXTENSAO = /\.(?:png|jpe?g|gif|webp|avif)(?:$|[?#])/i;

function ehIpLiteral(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host);
}

/**
 * Valida uma URL de imagem para uso no campo `media` de um embed.
 * @returns {{ok: boolean, motivo?: string, motivoEn?: string,
 *            aviso?: string, avisoEn?: string, noStoat?: boolean, url?: string}}
 */
export function validarUrlImagem(entrada) {
  const bruto = String(entrada ?? "").trim();

  if (!bruto) {
    return { ok: false, motivo: "faltou o link da imagem", motivoEn: "the image link is missing" };
  }
  if (bruto.length > URL_MAX) {
    return {
      ok: false,
      motivo: `o link tem ${bruto.length} caracteres (máximo ${URL_MAX})`,
      motivoEn: `the link is ${bruto.length} characters long (maximum ${URL_MAX})`,
    };
  }

  let u;
  try { u = new URL(bruto); } catch {
    return { ok: false, motivo: "não é um link válido", motivoEn: "that isn't a valid link" };
  }

  // Só http(s): corta `javascript:`, `data:`, `file:` e afins de saída.
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return {
      ok: false,
      motivo: `\`${u.protocol}\` não é aceito — use um link \`https\``,
      motivoEn: `\`${u.protocol}\` isn't accepted — use an \`https\` link`,
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
    };
  }

  // Porta fora do comum = quase sempre um serviço interno, não um CDN.
  if (u.port && u.port !== "80" && u.port !== "443") {
    return {
      ok: false,
      motivo: `a porta \`${u.port}\` não é aceita — imagens públicas ficam em 80/443.`,
      motivoEn: `port \`${u.port}\` isn't accepted — public images live on 80/443.`,
    };
  }

  // IP cru público: funciona, mas é sinal de servidor caseiro. Não bloqueia.
  const avisos = [];
  const avisosEn = [];

  if (u.protocol === "http:") {
    avisos.push("⚠️ O link é `http` (sem criptografia): muitos clientes recusam carregar. Prefira `https`.");
    avisosEn.push("⚠️ The link is `http` (not encrypted): many clients refuse to load it. Prefer `https`.");
  }
  if (PROXY_DE_BUSCA.test(bruto)) {
    avisos.push("⚠️ Parece um link de **resultado de busca** (Brave/Google/Bing), que aponta para uma miniatura temporária em vez do arquivo. Costuma falhar.");
    avisosEn.push("⚠️ This looks like a **search result** link (Brave/Google/Bing), pointing to a temporary thumbnail instead of the file. It usually fails.");
  } else if (!TEM_EXTENSAO.test(bruto)) {
    avisos.push("⚠️ O link não termina em `.png`/`.jpg`/`.gif`/`.webp`, então pode não ser a imagem em si.");
    avisosEn.push("⚠️ The link doesn't end in `.png`/`.jpg`/`.gif`/`.webp`, so it may not be the image itself.");
  }

  const noStoat = /(^|\.)stoat\.(chat|gg)$/i.test(host) || /(^|\.)autumn\./i.test(host);
  if (!noStoat) {
    avisos.push("🔒 A imagem fica num site de terceiros: **o dono daquele site vê o IP de cada pessoa que carregar a mensagem** — numa mensagem de boas-vindas, o de todo mundo que entrar. Enviar o arquivo aqui no Stoat e usar o link do anexo evita isso.");
    avisosEn.push("🔒 The image lives on a third-party site: **its owner sees the IP of everyone who loads the message** — in a welcome message, everyone who joins. Uploading the file here on Stoat and using the attachment link avoids that.");
  }

  return {
    ok: true,
    url: bruto,
    noStoat,
    aviso: avisos.length ? avisos.join("\n") : null,
    avisoEn: avisosEn.length ? avisosEn.join("\n") : null,
  };
}

// ── Anexo hospedado no Stoat ───────────────────────────────
//
// O campo `media` do embed no Revolt/Stoat NÃO aceita URL externa: ele espera
// o **ID do arquivo no Autumn** (o serviço de anexos). Passar uma URL de outro
// site faz o embed sair sem capa, em silêncio — foi exatamente o que aconteceu.
//
// Quando a pessoa usa o link de um anexo do próprio Stoat, dá para extrair o ID
// e usar `media` do jeito certo: a imagem vira capa do embed de verdade.
// Para links de fora, o caminho é outro (ver `comoExibir` abaixo).
const ANEXO_STOAT = /^https?:\/\/[^/]*(?:autumn|cdn|media)[^/]*\.(?:stoat\.(?:chat|gg)|revolt\.chat)\/[^/]+\/([0-9A-HJKMNP-TV-Z]{26})(?:\/|$|\?)/i;

export function extrairAnexoStoat(url) {
  const m = String(url ?? "").match(ANEXO_STOAT);
  return m ? m[1] : null;
}

/**
 * Decide COMO exibir a imagem, já que os dois caminhos são diferentes:
 *
 *  • { modo: "media", id }  → anexo do Stoat: vira capa do embed (o ideal).
 *  • { modo: "link", url }  → site de fora: a URL vai no CONTEÚDO da mensagem,
 *    e o Stoat gera a pré-visualização da imagem sozinho. Não fica dentro do
 *    embed, aparece logo abaixo dele — mas aparece, que é o que importa.
 *  • null → sem imagem.
 */
export function comoExibir(url) {
  if (!url) return null;
  const id = extrairAnexoStoat(url);
  if (id) return { modo: "media", id };
  return { modo: "link", url };
}
