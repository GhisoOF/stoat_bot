// ══════════════════════════════════════════════════════════
//  teste-midia.mjs — segurança das URLs de imagem em embeds
//
//  O que estes testes travam:
//   • o bot nunca aceita URL apontando para a rede interna (SSRF)
//   • só http(s) — nada de javascript:, data:, file:
//   • limite de tamanho (a config não vira depósito de dados)
//   • os avisos úteis (privacidade, link de busca, http) continuam saindo
// ══════════════════════════════════════════════════════════

import { validarUrlImagem, URL_MAX } from "./modulos/core/midia.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ── 1. SSRF: alvos internos são recusados ──
console.log("── bloqueio de rede interna (SSRF) ──");
const internos = [
  ["http://localhost:8080/x.png",              "localhost"],
  ["http://127.0.0.1/x.png",                   "loopback"],
  ["http://192.168.1.10/x.png",                "rede privada 192.168"],
  ["http://10.0.0.5/x.png",                    "rede privada 10.x"],
  ["http://172.16.4.4/x.png",                  "rede privada 172.16"],
  ["http://169.254.169.254/latest/meta-data",  "metadata link-local (clássico de SSRF)"],
  ["http://100.74.70.106:11434/x.png",         "★ o Ollama do Gentoo pela Tailscale"],
  ["http://umbrel.local/x.png",                "host .local"],
  ["http://nas.lan/foto.png",                  "host .lan"],
  ["http://[::1]/x.png",                       "loopback IPv6"],
];
for (const [url, oque] of internos) {
  const v = validarUrlImagem(url);
  ok(!v.ok, `recusa ${oque}`);
}

// ── 2. Portas fora de 80/443 ──
console.log("\n── portas ──");
ok(!validarUrlImagem("https://exemplo.com:8090/x.png").ok, "recusa porta 8090 (é o judy-ia)");
ok(!validarUrlImagem("https://exemplo.com:11434/x.png").ok, "recusa porta 11434");
ok(validarUrlImagem("https://exemplo.com:443/x.png").ok, "aceita 443 explícita");
ok(validarUrlImagem("http://exemplo.com:80/x.png").ok, "aceita 80 explícita");

// ── 3. Esquemas perigosos ──
console.log("\n── esquemas ──");
for (const u of [
  "javascript:alert(1)",
  "data:image/png;base64,iVBORw0KGgo=",
  "file:///etc/passwd",
  "ftp://exemplo.com/x.png",
]) {
  ok(!validarUrlImagem(u).ok, `recusa \`${u.slice(0, 24)}…\``);
}

// ── 4. Tamanho ──
console.log("\n── tamanho ──");
ok(!validarUrlImagem("https://x.com/" + "a".repeat(URL_MAX)).ok, `recusa URL acima de ${URL_MAX} chars`);
ok(validarUrlImagem("https://x.com/" + "a".repeat(50) + ".png").ok, "aceita URL de tamanho normal");
ok(!validarUrlImagem("").ok, "recusa vazio");
ok(!validarUrlImagem("não é url").ok, "recusa texto solto");

// ── 5. URLs legítimas passam ──
console.log("\n── links válidos ──");
const bom = validarUrlImagem("https://cdn.exemplo.com/capa.png");
ok(bom.ok, "aceita https com extensão de imagem");
ok(bom.url === "https://cdn.exemplo.com/capa.png", "  → devolve a URL");

// ── 6. Avisos (aceita, mas alerta) ──
console.log("\n── avisos ──");
ok(bom.aviso?.includes("IP"), "★ avisa que o host de terceiros vê o IP de quem carrega");
ok(bom.avisoEn?.includes("IP"), "  → e em inglês");

const busca = validarUrlImagem("https://imgs.search.brave.com/abc/def");
ok(busca.ok && busca.aviso?.includes("busca"), "aceita link de busca, mas avisa que costuma falhar");

const semExt = validarUrlImagem("https://cdn.exemplo.com/abc123");
ok(semExt.ok && semExt.aviso?.includes("termina em"), "avisa quando não tem extensão de imagem");

const inseguro = validarUrlImagem("http://cdn.exemplo.com/capa.png");
ok(inseguro.ok && inseguro.aviso?.includes("http"), "aceita http externo, mas avisa que não é criptografado");

// ── 7. Hospedado no próprio Stoat: o caminho recomendado ──
console.log("\n── arquivo no Stoat ──");
const noStoat = validarUrlImagem("https://autumn.stoat.chat/attachments/01ABC/capa.png");
ok(noStoat.ok && noStoat.noStoat === true, "★ reconhece anexo hospedado no Stoat");
ok(!noStoat.aviso?.includes("IP"), "  → e não alerta sobre IP (não há terceiro envolvido)");

console.log(`\nMÍDIA: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
