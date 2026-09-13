// Testes do receptor de webhooks: detecção de fonte, formatadores (puros) e
// filtro de eventos. O HTTP de verdade fica para o teste ao vivo.
let pass = 0, fail = 0;
const ok = (cond, rotulo) => { cond ? pass++ : fail++; console.log(`  ${cond ? "✅" : "❌"} ${rotulo}`); };

const w = await import("./modulos/ferramentas/webhooks.js");

console.log("── detecção da fonte ──");
ok(w.nomeDoEvento({ "x-github-event": "push" }, {}).fonte === "github",
  "★ header do GitHub decide a fonte");
ok(w.nomeDoEvento({}, { content: "oi" }).fonte === "discord",
  "★ corpo com content é formato Discord (Crafty, Uptime Kuma…)");
ok(w.nomeDoEvento({}, { embeds: [{ title: "x" }] }).fonte === "discord",
  "  → só embeds também");
ok(w.nomeDoEvento({}, { qualquer: "coisa" }).fonte === "generico",
  "  → o resto é genérico");

console.log("\n── formatador do GitHub ──");
{
  const push = w.formatarGitHub("push", {
    repository: { full_name: "GhisoOF/stoat_bot" },
    ref: "refs/heads/main",
    compare: "https://github.com/x/compare",
    commits: [{ id: "abc1234def", message: "fix: allowlist do CDN\n\ndetalhes", author: { name: "Ghiso" } }],
  });
  ok(push.titulo.includes("GhisoOF/stoat_bot") && push.titulo.includes("main"),
    "★ push: repo e branch no título");
  ok(push.descricao.includes("abc1234") && push.descricao.includes("fix: allowlist do CDN") && !push.descricao.includes("detalhes"),
    "  → hash curto + primeira linha do commit");
  ok(w.formatarGitHub("push", { repository: { full_name: "x/y" }, commits: [] }) === null,
    "  → push sem commits (tag/delete) fica em silêncio");

  const issue = w.formatarGitHub("issues", {
    repository: { full_name: "x/y" }, action: "opened", sender: { login: "sulista" },
    issue: { number: 7, title: "bot não canta", html_url: "https://g/7" },
  });
  ok(issue.titulo.includes("aberta") && issue.descricao.includes("#7") && issue.url === "https://g/7",
    "★ issue aberta com número, título e link");

  const acao = w.formatarGitHub("workflow_run", {
    repository: { full_name: "x/y" }, action: "completed",
    workflow_run: { name: "Docker", conclusion: "failure", head_branch: "main", html_url: "https://g/run" },
  });
  ok(acao.titulo.includes("❌") && acao.descricao.includes("failure"),
    "★ Action que falhou sai com ❌ e a conclusão");
  ok(w.formatarGitHub("workflow_run", { action: "requested", workflow_run: {} }) === null,
    "  → Action ainda rodando fica em silêncio (só o completed publica)");
  ok(w.formatarGitHub("ping", { repository: { full_name: "x/y" }, zen: "Design for failure." }).titulo.includes("conectado"),
    "  → ping vira aviso de conexão");
  ok(w.formatarGitHub("watch", { repository: { full_name: "x/y" }, sender: { login: "a" } }).descricao.includes("watch"),
    "  → evento desconhecido cai no aviso genérico em vez de sumir");
}

console.log("\n── formato Discord (Crafty e afins) ──");
{
  const d = w.formatarDiscord({
    embeds: [{ title: "Servidor iniciado", description: "O mundo carregou.", color: 4437377,
      fields: [{ name: "Servidor", value: "sobrevivência" }], footer: { text: "Crafty Controller" } }],
  });
  ok(d.titulo === "Servidor iniciado" && d.descricao.includes("O mundo carregou"),
    "★ embed do Crafty vira embed da Judy");
  ok(d.descricao.includes("**Servidor:** sobrevivência") && d.descricao.includes("Crafty Controller"),
    "  → fields e footer preservados");
  ok(d.cor.startsWith("#"), "  → cor numérica do Discord vira hex");
  ok(w.formatarDiscord({ content: "só texto" }).descricao.includes("só texto"),
    "  → content puro também funciona");
  ok(w.formatarDiscord({}) === null, "  → vazio fica em silêncio");
}

console.log("\n── genérico ──");
ok(w.formatarGenerico({ event: "backup_done", message: "backup ok em 42s" }).descricao.includes("backup ok"),
  "★ chaves conhecidas (event/message) viram título e texto");
ok(w.formatarGenerico({ a: 1, b: { c: 2 } }).descricao.includes("**a:** 1"),
  "  → JSON qualquer vira lista chave: valor");
ok(w.formatarGenerico(null) === null, "  → nulo fica em silêncio");

console.log("\n── formatar() de ponta a ponta ──");
{
  const r = w.formatar({ "x-github-event": "release" }, {
    repository: { full_name: "x/y" }, action: "published",
    release: { tag_name: "v1.0", name: "Primeira", body: "changelog", html_url: "https://g/r" },
  });
  ok(r.evento === "release" && r.embed.titulo.includes("v1.0"),
    "★ header + corpo → evento nomeado (é o que o filtro `eventos` usa) + embed");
}

console.log("\n── content type form do GitHub (o bug do payload oco) ──");
{
  const original = { repository: { full_name: "GhisoOF/stoat_bot" }, sender: { login: "ghiso" }, action: "published", registry_package: { name: "stoat_bot", package_type: "CONTAINER", package_version: { version: "latest" } } };
  const form = "payload=" + encodeURIComponent(JSON.stringify(original)).replace(/%20/g, "+");
  const j = w.desembrulharCorpo(form);
  ok(j?.repository?.full_name === "GhisoOF/stoat_bot",
    "★ corpo form-urlencoded é decodificado (era o que deixava tudo anônimo)");
  ok(w.desembrulharCorpo(JSON.stringify(original))?.sender?.login === "ghiso",
    "  → JSON puro continua funcionando");
  ok(typeof w.desembrulharCorpo("lixo não-json").text === "string",
    "  → corpo inválido vira {text} sem explodir");
}

console.log("\n── ruído do Actions silenciado e package formatado ──");
ok(w.formatarGitHub("check_run", { repository: { full_name: "x/y" } }) === null,
  "★ check_run fica em silêncio (o workflow_run já conta a história)");
ok(w.formatarGitHub("check_suite", {}) === null && w.formatarGitHub("workflow_job", {}) === null,
  "  → check_suite e workflow_job também");
{
  const p = w.formatarGitHub("registry_package", { repository: { full_name: "GhisoOF/stoat_bot" }, sender: { login: "ghiso" }, action: "published", registry_package: { name: "stoat_bot", package_type: "CONTAINER", package_version: { version: "latest" } } });
  ok(p.titulo.includes("pacote publicado") && p.descricao.includes("stoat_bot") && p.descricao.includes("latest"),
    "★ publicação de imagem no ghcr vira embed com nome e versão");
  ok(w.formatarGitHub("package", { action: "created", package: {} }) === null,
    "  → ações de package que não são publish/update ficam em silêncio");
}

console.log(`\nWEBHOOKS: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
