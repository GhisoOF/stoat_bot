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

export function instalarFallback() {
  if (instalado || !SERVIDORES.length) return false;

  const resolvedor = new dns.promises.Resolver();
  resolvedor.setServers(SERVIDORES);

  dns.lookup = (nome, opcoes, retorno) => {
    const cb = typeof opcoes === "function" ? opcoes : retorno;
    const op = typeof opcoes === "function" ? {} : (opcoes ?? {});

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
