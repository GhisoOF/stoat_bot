// ══════════════════════════════════════════════════════════
//  rede.js — fetch com retentativa para falhas transitórias
//
//  EAI_AGAIN não é "não existe": é o resolver dizendo **tente de
//  novo**. Costuma acontecer quando o DNS do host é reescrito (o
//  systemd-resolved e o Tailscale fazem isso ao reconectar) e há uma
//  janela de alguns segundos sem resposta.
//
//  Antes, qualquer piscada dessas virava uma resposta de erro para o
//  usuário — que então tinha de perguntar de novo. Uma retentativa
//  curta resolve a maioria sem que ninguém perceba, e o que sobra
//  chega com um diagnóstico específico em vez de "fetch failed".
// ══════════════════════════════════════════════════════════

// Erros que vale repetir: são de rede e costumam passar sozinhos.
// ENOTFOUND fica de fora de propósito — nome que não existe não vai
// passar a existir na segunda tentativa.
const TRANSITORIOS = new Set([
  "EAI_AGAIN",      // resolver temporariamente indisponível
  "ECONNRESET",     // conexão derrubada no meio
  "ETIMEDOUT",      // estourou o tempo
  "ECONNREFUSED",   // serviço subindo ainda
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export function codigoDoErro(e) {
  return e?.cause?.code ?? e?.code ?? "";
}

export function ehTransitorio(e) {
  const c = codigoDoErro(e);
  if (TRANSITORIOS.has(c)) return true;
  // AbortSignal.timeout dispara AbortError; num serviço remoto isso é
  // quase sempre lentidão passageira, não indisponibilidade.
  return /abort/i.test(e?.name ?? "") || /timeout/i.test(e?.message ?? "");
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch com até `tentativas` tentativas e espera crescente entre elas.
// A espera é curta de propósito: quem chama está esperando uma resposta
// no chat, e melhor devolver um erro claro em 3s do que travar 30s.
export async function buscar(url, opcoes = {}, { tentativas = 3, esperaMs = 400 } = {}) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fetch(url, opcoes);
    } catch (e) {
      ultimo = e;
      if (!ehTransitorio(e) || i === tentativas - 1) break;
      await dorme(esperaMs * Math.pow(2, i));   // 400ms, 800ms, 1600ms…
    }
  }
  throw ultimo;
}

// Transforma o erro cru numa frase que diz o que fazer. "fetch failed"
// sozinho não ajuda ninguém: pode ser DNS, rota, firewall ou timeout.
export function explicarErroDeRede(e, alvo = "o serviço") {
  const c = codigoDoErro(e);
  const base = `Não consegui alcançar ${alvo}`;

  if (c === "EAI_AGAIN") {
    return `${base}: o DNS não respondeu (EAI_AGAIN) mesmo depois de algumas tentativas.`
      + ` Isso é rede do container, não credencial.`
      + ` Quase sempre é o /etc/resolv.conf preso num arquivo antigo — recrie o container:`
      + ` \`docker compose up -d --force-recreate judy-ia\`.`
      + ` Para conferir: \`docker exec judy-ia cat /etc/resolv.conf\` (tem que ter uma linha \`nameserver\`).`;
  }
  if (c === "ENOTFOUND") {
    return `${base}: o nome não existe no DNS (ENOTFOUND). Confira o endereço configurado.`;
  }
  if (c === "ECONNREFUSED") {
    return `${base}: a conexão foi recusada (ECONNREFUSED) — o serviço no destino está no ar?`;
  }
  if (c === "ETIMEDOUT" || /abort|timeout/i.test(e?.name ?? e?.message ?? "")) {
    return `${base}: tempo esgotado. Pode ser lentidão passageira ou firewall bloqueando a saída.`;
  }
  return `${base}: ${c || e?.message || "erro de rede"}.`;
}
