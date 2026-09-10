
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
  return /abort/i.test(e?.name ?? "") || /timeout/i.test(e?.message ?? "");
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

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

export function explicarErroDeRede(e, alvo = "o serviço") {
  const c = codigoDoErro(e);
  const base = `Não consegui alcançar ${alvo}`;

  if (c === "EAI_AGAIN") {
    return `${base}: o DNS não respondeu (EAI_AGAIN) mesmo depois de algumas tentativas.`
      + ` Isso é rede do container, não credencial.`
      + ` Confira o /etc/resolv.conf da máquina: precisa ter uma linha \`nameserver\`.`
      + ` Se o serviço tem um DNS de emergência configurado (DNS_FALLBACK), ele entra sozinho no próximo boot:`
      + ` \`rc-service judy-ia restart\`.`;
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
