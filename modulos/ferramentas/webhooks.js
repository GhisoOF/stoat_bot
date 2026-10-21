// &webhook — receptor universal de webhooks: serviços externos (GitHub,
// Crafty/Minecraft, Uptime Kuma, Grafana, qualquer coisa) POSTam numa URL
// secreta e a Judy publica um embed formatado no canal daquele gancho.
//
// O desenho que torna o sistema "universal de verdade":
// - cada GANCHO tem nome, canal próprio e filtro de eventos — separar GitHub
//   issues num chat e Actions noutro é criar dois ganchos e apontar cada um;
// - a detecção do formato é automática, por camadas:
//     1. header X-GitHub-Event  → formatador do GitHub (push, issues, PR,
//        release, workflow/Actions, star, fork, ping…);
//     2. corpo com content/embeds → FORMATO DISCORD: tudo que sabe postar em
//        webhook do Discord (Crafty, Uptime Kuma, Grafana…) funciona aqui
//        sem configurar nada — é o formato de fato da internet;
//     3. qualquer outro JSON → embed genérico legível.
// - o segredo é a própria URL (token de 128 bits, comparação em tempo
//   constante) + teto de 30 publicações/min por gancho contra flood.

import { createServer } from "node:http";
import { citar, trechoPronto } from "../core/aliases.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import * as db from "../core/db.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { canalDeOutroServidor, canalDoServidor } from "../moderacao/pertence.js";

const PORTA = Number(process.env.WEBHOOK_PORTA || 8095);
const URL_BASE = (process.env.WEBHOOK_URL_BASE || "").replace(/\/$/, "");
const MAX_CORPO = 256 * 1024;
const TETO_POR_MIN = Number(process.env.WEBHOOK_TETO_MIN || 30);
// ── Exposição (12 out 2026) ──
// O receptor fica na internet (Tailscale Funnel) e, com o bot global, qualquer
// admin de qualquer servidor criava ganchos nele. Tetos que não dependem de
// quem pede: total por minuto (todos os ganchos somados), tentativas com token
// errado, conexões abertas, tempo para mandar o pedido, ganchos por servidor.
const TETO_GLOBAL_MIN = Number(process.env.WEBHOOK_TETO_GLOBAL_MIN || 240);
const TETO_ERROS_MIN = Number(process.env.WEBHOOK_TETO_ERROS_MIN || 60);
const MAX_GANCHOS_SERVIDOR = Number(process.env.WEBHOOK_MAX_POR_SERVIDOR || 10);
// Quem pode criar ganchos: ids de servidor separados por vírgula, ou `*` (padrão: todos)
const SERVIDORES_PERMITIDOS = (process.env.WEBHOOK_SERVIDORES || "*").split(",").map((x) => x.trim()).filter(Boolean);
export function servidorPodeTerWebhook(serverId) {
  return SERVIDORES_PERMITIDOS.includes("*") || SERVIDORES_PERMITIDOS.includes(serverId);
}
// O link "abrir ↗" do embed vem do corpo do pedido: só http(s)
export function linkSeguro(url) {
  try { const u = new URL(String(url ?? "")); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}

// ── Formatadores (puros, testáveis) ─────────────────────────────────────────
const CORES = { ok: "#43B581", aviso: "#FAA61A", erro: "#F04747", info: "#5865F2", git: "#6e5494" };

export function formatarGitHub(evento, c) {
  const repo = c?.repository?.full_name ?? "repositório";
  const quem = c?.sender?.login ?? "alguém";
  const e = String(evento ?? "").toLowerCase();

  if (e === "ping") {
    return { titulo: "🔗 GitHub conectado", descricao: `O webhook de **${repo}** está falando comigo. ${c?.zen ? `\n_"${c.zen}"_` : ""}`, cor: CORES.ok };
  }
  if (e === "push") {
    const branch = String(c?.ref ?? "").replace("refs/heads/", "");
    const commits = (c?.commits ?? []).slice(0, 5)
      .map((x) => `\`${(x.id ?? "").slice(0, 7)}\` ${String(x.message ?? "").split("\n")[0].slice(0, 80)} — _${x.author?.name ?? quem}_`);
    const extra = (c?.commits?.length ?? 0) > 5 ? `\n…e mais ${c.commits.length - 5}` : "";
    if (!commits.length) return null;   // push de tag/branch delete sem commits: silêncio
    return { titulo: `📦 ${repo} — push em ${branch}`, descricao: commits.join("\n") + extra, cor: CORES.git, url: c?.compare };
  }
  if (e === "issues") {
    const acao = { opened: "aberta", closed: "fechada", reopened: "reaberta" }[c?.action] ?? c?.action;
    return { titulo: `🐛 ${repo} — issue ${acao}`, descricao: `**#${c?.issue?.number} ${c?.issue?.title}**\npor ${quem}`, cor: c?.action === "closed" ? CORES.ok : CORES.aviso, url: c?.issue?.html_url };
  }
  if (e === "issue_comment") {
    return { titulo: `💬 ${repo} — comentário na #${c?.issue?.number}`, descricao: `**${c?.issue?.title}**\n${quem}: ${String(c?.comment?.body ?? "").slice(0, 300)}`, cor: CORES.info, url: c?.comment?.html_url };
  }
  if (e === "pull_request") {
    const acao = { opened: "aberto", closed: c?.pull_request?.merged ? "mesclado 🎉" : "fechado", reopened: "reaberto", ready_for_review: "pronto para revisão" }[c?.action] ?? c?.action;
    return { titulo: `🔀 ${repo} — PR ${acao}`, descricao: `**#${c?.number} ${c?.pull_request?.title}**\npor ${quem}`, cor: c?.pull_request?.merged ? CORES.ok : CORES.info, url: c?.pull_request?.html_url };
  }
  if (e === "release") {
    if (c?.action !== "published") return null;
    return { titulo: `🚀 ${repo} — release ${c?.release?.tag_name}`, descricao: `**${c?.release?.name ?? c?.release?.tag_name}**\n${String(c?.release?.body ?? "").slice(0, 400)}`, cor: CORES.ok, url: c?.release?.html_url };
  }
  if (e === "workflow_run") {
    if (c?.action !== "completed") return null;
    const ok = c?.workflow_run?.conclusion === "success";
    return { titulo: `${ok ? "✅" : "❌"} ${repo} — Action "${c?.workflow_run?.name}"`, descricao: `${ok ? "concluída com sucesso" : `terminou em **${c?.workflow_run?.conclusion}**`} na branch \`${c?.workflow_run?.head_branch}\``, cor: ok ? CORES.ok : CORES.erro, url: c?.workflow_run?.html_url };
  }
  if (e === "star") {
    if (c?.action !== "created") return null;
    return { titulo: `⭐ ${repo}`, descricao: `${quem} deu uma estrela (${c?.repository?.stargazers_count ?? "?"} no total)`, cor: CORES.aviso };
  }
  // Sub-eventos do Actions: o workflow_run com ✅/❌ já conta a história —
  // publicar cada check_run/check_suite/workflow_job é poluição pura.
  if (["check_run", "check_suite", "workflow_job", "status"].includes(e)) return null;
  if (e === "package" || e === "registry_package") {
    if (!["published", "updated"].includes(c?.action)) return null;
    const p = c?.package ?? c?.registry_package ?? {};
    const ver = p?.package_version?.version ?? p?.package_version?.name ?? "";
    return { titulo: `📦 ${repo} — pacote ${c?.action === "published" ? "publicado" : "atualizado"}`,
      descricao: `**${p?.name ?? "pacote"}**${ver ? ` \`${ver}\`` : ""}${p?.package_type ? ` (${p.package_type})` : ""}\npor ${quem}`,
      cor: CORES.ok, url: p?.package_version?.html_url ?? p?.html_url };
  }
  if (e === "fork") {
    return { titulo: `🍴 ${repo}`, descricao: `${quem} fez um fork → ${c?.forkee?.full_name}`, cor: CORES.info, url: c?.forkee?.html_url };
  }
  return { titulo: `📡 ${repo} — ${e}`, descricao: `evento \`${e}\`${c?.action ? ` (\`${c.action}\`)` : ""} de ${quem}`, cor: CORES.info };
}

export function formatarDiscord(c) {
  const partes = [];
  if (c?.content) partes.push(String(c.content).slice(0, 900));
  const emb = Array.isArray(c?.embeds) ? c.embeds[0] : null;
  const titulo = emb?.title ? String(emb.title).slice(0, 100) : null;
  if (emb?.description) partes.push(String(emb.description).slice(0, 900));
  for (const f of (emb?.fields ?? []).slice(0, 8)) {
    partes.push(`**${String(f.name ?? "").slice(0, 60)}:** ${String(f.value ?? "").slice(0, 200)}`);
  }
  if (emb?.footer?.text) partes.push(`_${String(emb.footer.text).slice(0, 120)}_`);
  if (!titulo && !partes.length) return null;
  // só uma cor válida (#rrggbb): `color: 16777216` virava "#1000000", o Stoat
  // recusava o embed e a mensagem ia como texto comum (15 out 2026)
  const cor = Number.isInteger(emb?.color) && emb.color >= 0 && emb.color <= 0xffffff
    ? `#${emb.color.toString(16).padStart(6, "0")}` : CORES.info;
  return { titulo: titulo ?? "🔔 Aviso", descricao: partes.join("\n") || "_(sem texto)_", cor, url: emb?.url };
}

export function formatarGenerico(c) {
  if (c == null || (typeof c === "object" && !Object.keys(c).length)) return null;
  if (typeof c !== "object") return { titulo: "🔔 Webhook", descricao: String(c).slice(0, 900), cor: CORES.info };
  const titulo = c.title ?? c.titulo ?? c.subject ?? c.event ?? c.evento ?? "🔔 Webhook";
  const texto = c.message ?? c.msg ?? c.text ?? c.body ?? c.description ?? null;
  if (texto) return { titulo: String(titulo).slice(0, 100), descricao: String(texto).slice(0, 900), cor: CORES.info };
  const linhas = Object.entries(c).slice(0, 10)
    .map(([k, v]) => `**${k}:** ${typeof v === "object" ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 160)}`);
  return { titulo: String(titulo).slice(0, 100), descricao: linhas.join("\n"), cor: CORES.info };
}

// GitHub com content type form manda \`payload=<json urlencoded>\` — sem
// decodificar, o formatador recebia um corpo oco e tudo caía no fallback
// anônimo ("repositório — evento X de alguém"). Aceitamos os dois formatos.
export function desembrulharCorpo(bruto) {
  const t = String(bruto ?? "");
  if (t.startsWith("payload=")) {
    try { return JSON.parse(decodeURIComponent(t.slice(8).replace(/\+/g, "%20"))); } catch {}
  }
  try {
    const j = JSON.parse(t || "{}");
    if (j?.payload && typeof j.payload === "string") { try { return JSON.parse(j.payload); } catch {} }
    return j;
  } catch { return { text: t.slice(0, 900) }; }
}

// Que evento é, para o filtro? ("push", "issues"… no GitHub; "discord"/"generico" nos demais)
export function nomeDoEvento(headers, corpo) {
  const gh = headers?.["x-github-event"];
  if (gh) return { fonte: "github", evento: String(gh).toLowerCase() };
  if (corpo && (corpo.content != null || Array.isArray(corpo.embeds))) return { fonte: "discord", evento: "discord" };
  return { fonte: "generico", evento: "generico" };
}

export function formatar(headers, corpo) {
  const { fonte, evento } = nomeDoEvento(headers, corpo);
  if (fonte === "github") return { evento, embed: formatarGitHub(evento, corpo) };
  if (fonte === "discord") return { evento, embed: formatarDiscord(corpo) };
  return { evento, embed: formatarGenerico(corpo) };
}

// ── Receptor HTTP ───────────────────────────────────────────────────────────
const usoRecente = new Map();   // ganchoId → timestamps do último minuto

function estourou(ganchoId, teto = TETO_POR_MIN) {
  const agora = Date.now();
  const lista = (usoRecente.get(ganchoId) ?? []).filter((t) => agora - t < 60_000);
  lista.push(agora);
  usoRecente.set(ganchoId, lista);
  return lista.length > teto;
}
export function _zerarTetos() { usoRecente.clear(); }   // só testes

function tokenConfere(a, b) {
  const A = Buffer.from(String(a ?? "")), B = Buffer.from(String(b ?? ""));
  return A.length === B.length && A.length > 0 && timingSafeEqual(A, B);
}

// Resolve o objeto de canal a partir do id (o padrão do RSS): sem isso o
// sendEmbed responde "Canal indisponível" e a publicação morre em silêncio.
async function canalPorId(ctx, canalId) {
  return ctx.client?.channels?.get?.(canalId)
    ?? await ctx.client?.channels?.fetch?.(canalId).catch(() => null)
    ?? null;
}

export function iniciarReceptor(ctx) {
  const srv = createServer((req, res) => {
    const fim = (codigo, obj) => { res.writeHead(codigo, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" }); res.end(JSON.stringify(obj)); };
    const m = req.url?.match(/^\/gancho\/(\d+)\/([A-Za-z0-9_-]+)$/);
    if (!m || req.method !== "POST") return fim(404, { erro: "use POST /gancho/<id>/<token>" });
    // quem erra o token demais (varredura) leva 429 antes de tocar no banco
    if ((usoRecente.get("__erros__") ?? []).filter((t) => Date.now() - t < 60_000).length >= TETO_ERROS_MIN) return fim(429, { erro: "tentativas demais" });
    if (estourou("__todos__", TETO_GLOBAL_MIN)) return fim(429, { erro: "calma: teto de publicações por minuto atingido" });
    if (Number(req.headers["content-length"] || 0) > MAX_CORPO) { res.setHeader("Connection", "close"); return fim(413, { erro: "corpo grande demais" }); }

    let corpo = "", estourouCorpo = false;
    req.on("data", (d) => { corpo += d; if (corpo.length > MAX_CORPO) { estourouCorpo = true; req.destroy(); } });
    req.on("end", async () => {
      if (estourouCorpo) return;
      try {
        const gancho = db.ganchoPorId(Number(m[1]));
        if (!gancho || !tokenConfere(gancho.token, m[2])) { estourou("__erros__", Infinity); return fim(401, { erro: "gancho ou token inválido" }); }
        if (estourou(gancho.id)) return fim(429, { erro: "calma: teto de publicações por minuto atingido" });

        const json = desembrulharCorpo(corpo);

        const { evento, embed } = formatar(Object.fromEntries(Object.entries(req.headers)), json);
        const eventos = gancho.eventos ? gancho.eventos.split(",").map((x) => x.trim()).filter(Boolean) : [];
        if (eventos.length && !eventos.includes(evento) && evento !== "ping") {
          return fim(200, { ok: true, ignorado: `evento "${evento}" fora do filtro deste gancho` });
        }
        if (!embed) return fim(200, { ok: true, ignorado: "evento sem conteúdo publicável" });

        db.registrarUsoGancho(gancho.id);
        const canal = await canalPorId(ctx, gancho.canalId);
        if (!canal) { console.error(`[WEBHOOK] canal ${gancho.canalId} não encontrado — o bot está nesse servidor?`); return fim(200, { ok: true, aviso: "canal não encontrado" }); }
        // o gancho é do servidor que o criou: nunca publica em canal de outro
        if (canalDeOutroServidor(canal, gancho.serverId)) {
          console.warn(`[SEGURANCA] gancho ${gancho.id} (servidor ${gancho.serverId}) aponta para canal de outro servidor (${canal.serverId}) — bloqueado`);
          return fim(403, { erro: "o canal deste gancho não é do servidor dele" });
        }
        const link = linkSeguro(embed.url);
        await ctx.sendEmbed(canal, {
          title: embed.titulo,
          description: (link ? `${embed.descricao}\n[abrir ↗](${link})` : embed.descricao).slice(0, 1900),
          colour: embed.cor,
        });
        console.log(`[WEBHOOK] gancho "${gancho.nome}" publicou "${evento}" em ${gancho.canalId}`);
        return fim(200, { ok: true });
      } catch (e) {
        console.error(`[WEBHOOK] erro: ${e?.message ?? e}`);
        return fim(500, { erro: "falha ao publicar" });
      }
    });
  });
  // pedido lento ou pendurado não segura conexão aberta (slowloris)
  srv.headersTimeout = 10_000;
  srv.requestTimeout = 15_000;
  srv.keepAliveTimeout = 5_000;
  srv.maxHeadersCount = 50;
  srv.maxConnections = Number(process.env.WEBHOOK_MAX_CONEXOES || 64);
  srv.on("error", (e) => console.error(`[WEBHOOK] receptor não subiu na porta ${PORTA}: ${e.message}`));
  srv.listen(PORTA, () => console.log(`[WEBHOOK] receptor de pé na porta ${PORTA} (POST /gancho/<id>/<token>)`));
  return srv;
}

// ── Comando &webhook ────────────────────────────────────────────────────────
function urlDoGancho(g) {
  const base = URL_BASE || `http://IP-DA-MÁQUINA:${PORTA}`;
  return `${base}/gancho/${g.id}/${g.token}`;
}

// Bloco padrão de exibição da URL: em TEXTO PLANO (bloco de código não quebra
// linha no Stoat e cortava a URL — só dava para copiar pela sorte), com as
// dicas de qual endereço usar em cada caso — a armadilha clássica é colar a
// URL interna num serviço da internet e ganhar um "failed to connect" mudo.
// `l` (etapa 4b): o idioma do servidor ("pt" | "en" | "es"); no espanhol o texto sai pronto
function blocoDeUrl(g, en, l = null) {
  const rota = `/gancho/${g.id}/${g.token}`;
  if (l === "es") {
    const linhasEs = ["**La URL secreta** (selecciona y copia la línea entera):", "", urlDoGancho(g), ""];
    linhasEs.push("🌐 **Servicio de internet** (GitHub…): la base tiene que ser PÚBLICA por https — ej.: `sudo tailscale funnel --bg " + PORTA + "` y `WEBHOOK_URL_BASE=https://<máquina>.<tailnet>.ts.net` en el `.env`.");
    linhasEs.push("🏠 **Contenedor en la misma máquina** (Crafty…): usa el puente de Docker: `http://172.17.0.1:" + PORTA + rota + "`");
    if (!URL_BASE) linhasEs.push("⚠️ `WEBHOOK_URL_BASE` no está definido — cambia el marcador de arriba por la dirección de tu máquina.");
    return trechoPronto(linhasEs.join("\n"));
  }
  const linhas = [en ? "**The secret URL** (select and copy the whole line):" : "**A URL secreta** (seleciona e copia a linha inteira):", "", urlDoGancho(g), ""];
  if (en) {
    linhas.push("🌐 **Internet service** (GitHub…): the base must be PUBLIC over https — e.g. `sudo tailscale funnel --bg " + PORTA + "` and set `WEBHOOK_URL_BASE=https://<machine>.<tailnet>.ts.net` in `.env`.");
    linhas.push("🏠 **Same-machine container** (Crafty…): use the Docker bridge instead: `http://172.17.0.1:" + PORTA + rota + "`");
    if (!URL_BASE) linhas.push("⚠️ `WEBHOOK_URL_BASE` is not set — replace the placeholder above with your machine's address.");
  } else {
    linhas.push("🌐 **Serviço da internet** (GitHub…): a base precisa ser PÚBLICA em https — ex.: `sudo tailscale funnel --bg " + PORTA + "` e `WEBHOOK_URL_BASE=https://<máquina>.<tailnet>.ts.net` no `.env`.");
    linhas.push("🏠 **Container na mesma máquina** (Crafty…): use a ponte do Docker: `http://172.17.0.1:" + PORTA + rota + "`");
    if (!URL_BASE) linhas.push("⚠️ `WEBHOOK_URL_BASE` não está definido — troque o marcador acima pelo endereço da sua máquina.");
  }
  return linhas.join("\n");
}

export async function cmdWebhook(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId, membroTemPermissao, getServer } = ctx;
  const en = lingua(ctx) === "en";
  const sub = String(args[0] ?? "").toLowerCase();

  const podeGerir = ctx.temCargoStaff?.(message, ctx.config)
    || membroTemPermissao(message, await getServer(message).catch(() => null), "ManageMessages");

  if (!sub || ["ajuda", "help"].includes(sub)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🪝 Webhooks",
      description: [
        "Serviços externos publicam aqui: **GitHub** (push, issues, PR, releases, Actions…), **Crafty/Minecraft** e qualquer ferramenta que fale o formato Discord (Uptime Kuma, Grafana…).",
        "",
        `\`${citar("webhook.criar", "pt", P)} <nome> [#canal]\` — novo gancho (a URL secreta aparece uma vez)`,
        `\`${citar("webhook.lista", "pt", P)}\` — os ganchos deste servidor`,
        `\`${citar("webhook.canal", "pt", P)} <nome> <#canal>\` — muda o destino`,
        `\`${citar("webhook.eventos", "pt", P)} <nome> <push,issues,…|todos>\` — filtra o que este gancho publica`,
        `\`${citar("webhook", "pt", P)} url <nome>\` — mostra a URL de novo · \`${citar("webhook.testar", "pt", P)} <nome>\` — publica um teste`,
        `\`${citar("webhook.remover", "pt", P)} <nome>\` — apaga (a URL morre na hora)`,
        "",
        "_Separar por chats = um gancho por assunto: `issues` → #issues, `workflow_run` → #ci, o Crafty → #minecraft._",
      ].join("\n"),
      colour: COR.info,
    }, {
      title: "🪝 Webhooks",
      description: [
        "External services post here: **GitHub** (push, issues, PRs, releases, Actions…), **Crafty/Minecraft** and anything that speaks the Discord format (Uptime Kuma, Grafana…).",
        "",
        `\`${citar("webhook.criar", "en", P)} <name> [#channel]\` — new hook (the secret URL shows once)`,
        `\`${citar("webhook.lista", "en", P)}\` — this server's hooks`,
        `\`${citar("webhook.canal", "en", P)} <name> <#channel>\` — change destination`,
        `\`${citar("webhook.eventos", "en", P)} <name> <push,issues,…|all>\` — filter what this hook posts`,
        `\`${citar("webhook", "en", P)} url <name>\` — show the URL again · \`${citar("webhook.testar", "en", P)} <name>\` — post a test`,
        `\`${citar("webhook.remover", "en", P)} <name>\` — delete (the URL dies instantly)`,
        "",
        "_Per-chat separation = one hook per subject: `issues` → #issues, `workflow_run` → #ci, Crafty → #minecraft._",
      ].join("\n"),
      colour: COR.info,
    }, {
      title: "🪝 Webhooks",
      description: [
        "Los servicios externos publican aquí: **GitHub** (push, issues, PR, releases, Actions…), **Crafty/Minecraft** y cualquier herramienta que hable el formato de Discord (Uptime Kuma, Grafana…).",
        "",
        `\`${citar("webhook.criar", "es", P)} <nombre> [#canal]\` — nuevo gancho (la URL secreta aparece una sola vez)`,
        `\`${citar("webhook.lista", "es", P)}\` — los ganchos de este servidor`,
        `\`${citar("webhook.canal", "es", P)} <nombre> <#canal>\` — cambia el destino`,
        `\`${citar("webhook.eventos", "es", P)} <nombre> <push,issues,…|all>\` — filtra lo que publica este gancho`,
        `\`${citar("webhook", "es", P)} url <nombre>\` — muestra la URL de nuevo · \`${citar("webhook.testar", "es", P)} <nombre>\` — publica una prueba`,
        `\`${citar("webhook.remover", "es", P)} <nombre>\` — lo borra (la URL deja de funcionar al instante)`,
        "",
        "_Separar por chats = un gancho por tema: `issues` → #issues, `workflow_run` → #ci, Crafty → #minecraft._",
      ].join("\n"),
      colour: COR.info,
    }));
  }

  // `list`, `create`, `remove`, `test`… chegam traduzidos pelo registro (fase 3)
  if (sub === "lista") {
    const ganchos = db.listarGanchos(serverId);
    return sendEmbed(message.channel, {
      title: tr(ctx, "🪝 Ganchos deste servidor", "🪝 Hooks on this server", "🪝 Ganchos de este servidor"),
      description: ganchos.length
        ? tr(ctx,
          ganchos.map((g) => `**${g.nome}** → <#${g.canalId}> · eventos: ${g.eventos || "todos"} · ${g.usos} uso(s)`).join("\n"),
          ganchos.map((g) => `**${g.nome}** → <#${g.canalId}> · events: ${g.eventos || "all"} · ${g.usos} use(s)`).join("\n"),
          ganchos.map((g) => `**${g.nome}** → <#${g.canalId}> · eventos: ${g.eventos || "todos"} · ${g.usos} uso(s)`).join("\n"))
        : tr(ctx, `Nenhum ainda. \`${citar("webhook.criar", "pt", P)} <nome>\``, `None yet. \`${citar("webhook.criar", "en", P)} <name>\``, `Ninguno todavía. \`${citar("webhook.criar", "es", P)} <nombre>\``),
      colour: COR.info,
    });
  }

  if (!podeGerir) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔒 Sem permissão", description: "Gerir webhooks pede **ManageMessages** (ou cargo de staff).", colour: COR.aviso },
      { title: "🔒 No permission", description: "Managing webhooks requires **ManageMessages** (or a staff role).", colour: COR.aviso },
      { title: "🔒 Sin permiso", description: "Gestionar webhooks requiere **ManageMessages** (o un rol de staff).", colour: COR.aviso }));
  }

  const nome = String(args[1] ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  const acharGancho = () => db.listarGanchos(serverId).find((g) => g.nome === nome);

  // O canal precisa ser DESTE servidor (antes dava para apontar um gancho para
  // o canal de outro servidor e publicar lá pela Judy).
  const servidor = await getServer(message).catch(() => null);
  const canalValido = async (canalId) => {
    if (!canalId) return false;
    if (canalDoServidor(servidor, canalId)) return true;
    const c = ctx.client?.channels?.get?.(canalId) ?? await ctx.client?.channels?.fetch?.(canalId).catch(() => null);
    return !!c && !canalDeOutroServidor(c, serverId) && (c.serverId ?? c.server?.id) === serverId;
  };
  const canalDeOutro = () => sendEmbed(message.channel, tr(ctx,
    { title: "🪝", description: "Esse canal não é **deste servidor** — um gancho só publica nos canais daqui.", colour: COR.aviso },
    { title: "🪝", description: "That channel isn't **on this server** — a hook can only post to channels here.", colour: COR.aviso },
    { title: "🪝", description: "Ese canal no es **de este servidor** — un gancho solo publica en los canales de aquí.", colour: COR.aviso }));

  if (sub === "criar" || sub === "novo" || sub === "add") {
    if (!nome) return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, `Dê um nome: \`${citar("webhook.criar", "pt", P)} github\``, `Give it a name: \`${citar("webhook.criar", "en", P)} github\``, `Ponle un nombre: \`${citar("webhook.criar", "es", P)} github\``), colour: COR.aviso });
    if (acharGancho()) return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, `**${nome}** já existe — \`${citar("webhook", "pt", P)} url ${nome}\`.`, `**${nome}** already exists — \`${citar("webhook", "pt", P)} url ${nome}\`.`, `**${nome}** ya existe — \`${citar("webhook", "es", P)} url ${nome}\`.`), colour: COR.aviso });
    if (!servidorPodeTerWebhook(serverId)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🪝", description: "Webhooks não estão liberados neste servidor (`WEBHOOK_SERVIDORES`).", colour: COR.aviso },
        { title: "🪝", description: "Webhooks aren't enabled on this server (`WEBHOOK_SERVIDORES`).", colour: COR.aviso },
        { title: "🪝", description: "Los webhooks no están habilitados en este servidor (`WEBHOOK_SERVIDORES`).", colour: COR.aviso }));
    }
    if (db.listarGanchos(serverId).length >= MAX_GANCHOS_SERVIDOR) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🪝", description: `Este servidor já tem **${MAX_GANCHOS_SERVIDOR}** ganchos — o máximo. Apague um com \`${citar("webhook.remover", "pt", P)} <nome>\`.`, colour: COR.aviso },
        { title: "🪝", description: `This server already has **${MAX_GANCHOS_SERVIDOR}** hooks — the maximum. Delete one with \`${citar("webhook.remover", "en", P)} <name>\`.`, colour: COR.aviso },
        { title: "🪝", description: `Este servidor ya tiene **${MAX_GANCHOS_SERVIDOR}** ganchos — el máximo. Borra uno con \`${citar("webhook.remover", "es", P)} <nombre>\`.`, colour: COR.aviso }));
    }
    const canalId = ctx.limparId?.(args[2]) || args[2]?.replace(/[<#>]/g, "") || message.channelId;
    if (canalId !== message.channelId && !(await canalValido(canalId))) return canalDeOutro();
    const token = randomBytes(16).toString("base64url");
    const g = db.criarGancho(serverId, nome, canalId, token);
    return sendEmbed(message.channel, tr(ctx, {
      title: `🪝 Gancho "${nome}" criado`,
      description: `Publica em <#${canalId}>. Quem tem a URL publica no canal — trate como senha.\n\n${blocoDeUrl(g, false)}\n\nGitHub: Settings → Webhooks → Add, content type \`application/json\`.\nCrafty: Config do servidor → Webhooks → provider **Discord**, cole a URL.`,
      colour: COR.sucesso,
    }, {
      title: `🪝 Hook "${nome}" created`,
      description: `Posts to <#${canalId}>. Whoever holds the URL can post — treat it like a password.\n\n${blocoDeUrl(g, true)}\n\nGitHub: Settings → Webhooks → Add, content type \`application/json\`.\nCrafty: server config → Webhooks → provider **Discord**, paste the URL.`,
      colour: COR.sucesso,
    }, {
      title: `🪝 Gancho "${nome}" creado`,
      description: `Publica en <#${canalId}>. Quien tenga la URL puede publicar en el canal — trátala como una contraseña.\n\n${blocoDeUrl(g, true, "es")}\n\nGitHub: Settings → Webhooks → Add, content type \`application/json\`.\nCrafty: configuración del servidor → Webhooks → provider **Discord**, pega la URL.`,
      colour: COR.sucesso,
    }));
  }

  const g = acharGancho();
  if (!g) return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, `Não conheço **${nome || "?"}** — \`${citar("webhook.lista", "pt", P)}\`.`, `I don't know **${nome || "?"}** — \`${citar("webhook.lista", "pt", P)}\`.`, `No conozco **${nome || "?"}** — \`${citar("webhook.lista", "es", P)}\`.`), colour: COR.aviso });

  if (sub === "url") {
    return sendEmbed(message.channel, { title: `🪝 ${g.nome}`, description: blocoDeUrl(g, en, idiomaDe(ctx)), colour: COR.info });
  }
  if (sub === "canal") {
    const canalId = ctx.limparId?.(args[2]) || args[2]?.replace(/[<#>]/g, "");
    if (!canalId) return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, "Qual canal?", "Which channel?", "¿Qué canal?"), colour: COR.aviso });
    if (canalId !== message.channelId && !(await canalValido(canalId))) return canalDeOutro();
    db.atualizarGancho(g.id, { canalId });
    return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, `**${g.nome}** agora publica em <#${canalId}>.`, `**${g.nome}** now posts to <#${canalId}>.`, `**${g.nome}** ahora publica en <#${canalId}>.`), colour: COR.sucesso });
  }
  if (sub === "eventos" || sub === "filtro") {
    const lista = String(args.slice(2).join(",") ?? "").toLowerCase().replace(/\s+/g, "");
    const eventos = ["todos", "all", ""].includes(lista) ? "" : lista;
    db.atualizarGancho(g.id, { eventos });
    return sendEmbed(message.channel, { title: "🪝", description: eventos ? tr(ctx, `**${g.nome}** só publica: \`${eventos}\``, `**${g.nome}** only posts: \`${eventos}\``, `**${g.nome}** solo publica: \`${eventos}\``) : tr(ctx, `**${g.nome}** publica todos os eventos.`, `**${g.nome}** posts every event.`, `**${g.nome}** publica todos los eventos.`), colour: COR.sucesso });
  }
  if (sub === "remover" || sub === "apagar") {
    db.removerGancho(g.id);
    return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, `**${g.nome}** apagado — a URL dele morreu.`, `**${g.nome}** deleted — its URL is dead.`, `**${g.nome}** borrado — su URL ya no funciona.`), colour: COR.sucesso });
  }
  if (sub === "testar" || sub === "teste") {
    const canal = await canalPorId(ctx, g.canalId);
    if (!canal) return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, `Não alcancei <#${g.canalId}> — ele ainda existe?`, `I can't reach <#${g.canalId}> — does it still exist?`, `No llego a <#${g.canalId}> — ¿todavía existe?`), colour: COR.aviso });
    await ctx.sendEmbed(canal, {
      title: tr(ctx, "🧪 Teste de webhook", "🧪 Webhook test", "🧪 Prueba de webhook"),
      description: tr(ctx, `Gancho **${g.nome}** funcionando — é aqui que os eventos dele chegam.`, `Hook **${g.nome}** working — this is where its events land.`, `Gancho **${g.nome}** funcionando — aquí es donde llegan sus eventos.`),
      colour: COR.sucesso,
    });
    return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, `Teste enviado para <#${g.canalId}>.`, `Test sent to <#${g.canalId}>.`, `Prueba enviada a <#${g.canalId}>.`), colour: COR.sucesso });
  }

  return sendEmbed(message.channel, { title: "🪝", description: tr(ctx, `Subcomando desconhecido — \`${citar("webhook", "pt", P)}\` mostra a lista.`, `Unknown subcommand — \`${citar("webhook", "en", P)}\` shows the list.`, `Subcomando desconocido — \`${citar("webhook", "es", P)}\` muestra la lista.`), colour: COR.aviso });
}
