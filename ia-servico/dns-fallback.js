// ══════════════════════════════════════════════════════════
//  dns-fallback.js — resolver de emergência
//
//  O container pode acabar com um /etc/resolv.conf SEM nenhuma linha
//  `nameserver` — só os comentários que o dhcpcd deixa. Quando isso
//  acontece, `getaddrinfo` devolve EAI_AGAIN para tudo, e como o
//  `fetch` do Node usa `dns.lookup` (que lê esse arquivo), o serviço
//  inteiro fica sem rede mesmo com o host navegando normalmente.
//
//  Consertar o arquivo é a solução certa, mas depende de mexer no
//  host e de recriar o container — e enquanto isso a Judy fica muda.
//  Aqui resolvemos por dentro: o Node também sabe consultar DNS por
//  c-ares (`dns.Resolver`), que aceita servidores explícitos e NÃO lê
//  o resolv.conf. Basta apontar o `dns.lookup` para ele.
//
//  A troca só acontece se o resolvedor do sistema estiver realmente
//  quebrado. Com DNS funcionando, nada muda — inclusive nomes locais
//  e do Tailscale, que os servidores públicos não conheceriam.
//
//  Env:
//    DNS_FALLBACK=1.1.1.1,8.8.8.8   servidores (padrão)
//    DNS_FALLBACK=off               desliga a rede de segurança
// ══════════════════════════════════════════════════════════
import dns from "node:dns";

const SERVIDORES = (process.env.DNS_FALLBACK ?? "1.1.1.1,8.8.8.8")
  .split(",").map((x) => x.trim()).filter(Boolean);

const lookupDoSistema = dns.lookup;
let instalado = false;

// O resolvedor do sistema consegue traduzir um nome conhecido?
export async function sistemaResolve(nome = "api.github.com", ms = 4000) {
  return new Promise((ok) => {
    const timer = setTimeout(() => ok(false), ms);
    try {
      lookupDoSistema(nome, (erro) => { clearTimeout(timer); ok(!erro); });
    } catch { clearTimeout(timer); ok(false); }
  });
}

// Substitui o dns.lookup por um que usa c-ares com servidores fixos.
// O `fetch` do Node chega aqui através do net.connect, então passa a
// funcionar sem que nenhum outro arquivo precise saber disso.
export function instalarFallback() {
  if (instalado || !SERVIDORES.length) return false;

  const resolvedor = new dns.promises.Resolver();
  resolvedor.setServers(SERVIDORES);

  dns.lookup = (nome, opcoes, retorno) => {
    const cb = typeof opcoes === "function" ? opcoes : retorno;
    const op = typeof opcoes === "function" ? {} : (opcoes ?? {});

    // localhost e IPs literais nunca precisam de rede: resolver esses
    // por DNS público seria lento e, no caso do localhost, errado.
    if (/^(localhost|127\.0\.0\.1|::1)$/i.test(nome)) {
      return op.all
        ? cb(null, [{ address: "127.0.0.1", family: 4 }])
        : cb(null, "127.0.0.1", 4);
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(nome)) {
      return op.all ? cb(null, [{ address: nome, family: 4 }]) : cb(null, nome, 4);
    }

    resolvedor.resolve4(nome)
      .then((ips) => {
        if (!ips?.length) throw Object.assign(new Error("sem resposta"), { code: "EAI_AGAIN" });
        if (op.all) cb(null, ips.map((address) => ({ address, family: 4 })));
        else cb(null, ips[0], 4);
      })
      .catch((e) => {
        const codigo = e?.code === "ENOTFOUND" ? "ENOTFOUND" : (e?.code ?? "EAI_AGAIN");
        cb(Object.assign(new Error(`getaddrinfo ${codigo} ${nome}`), { code: codigo, hostname: nome }));
      });
  };

  instalado = true;
  return true;
}

export function estaInstalado() { return instalado; }
export function servidoresUsados() { return [...SERVIDORES]; }

// Chamado no boot: só troca se precisar, e devolve o que aconteceu
// para o diagnóstico contar a história certa.
export async function garantirDNS() {
  if (process.env.DNS_FALLBACK === "off") {
    return { trocou: false, motivo: "desligado por DNS_FALLBACK=off" };
  }
  if (await sistemaResolve()) {
    return { trocou: false, motivo: "o DNS do sistema está resolvendo" };
  }
  const trocou = instalarFallback();
  if (!trocou) return { trocou: false, motivo: "sem servidores de fallback configurados" };

  const funciona = await new Promise((ok) => {
    dns.lookup("api.github.com", (erro) => ok(!erro));
  });
  return {
    trocou: true, funciona, servidores: SERVIDORES,
    motivo: funciona
      ? `o resolvedor do sistema falhou; usando ${SERVIDORES.join(", ")} por dentro`
      : `o resolvedor do sistema falhou e o fallback também não respondeu`,
  };
}
