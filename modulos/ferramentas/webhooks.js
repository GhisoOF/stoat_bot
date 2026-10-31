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
import { trechoPronto } from "../core/aliases.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import * as db from "../core/db.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { canalDeOutroServidor, canalDesteServidor, podeEscreverNoCanal } from "../moderacao/pertence.js";
import { numero } from "../core/env.js";
import { textoDeFora } from "../core/seguranca.js";
import { registrarErro } from "../core/erros.js";
import { erroDeUso, semPermissao } from "../core/saida.js";

const PORTA = numero("WEBHOOK_PORTA", 8095, { min: 1, max: 65535, inteiro: true });
// (31 out 2026, R10) fora de container, o receptor escuta só na própria máquina.
// Dentro do container o compose define WEBHOOK_ESCUTA=0.0.0.0 (a rede do container
// é isolada) e quem decide a exposição na máquina é o WEBHOOK_BIND da porta
// publicada no compose (padrão 127.0.0.1). Duas variáveis porque são dois lados.
const BIND = (process.env.WEBHOOK_ESCUTA || "127.0.0.1").trim();
const URL_BASE = (process.env.WEBHOOK_URL_BASE || "").replace(/\/$/, "");
const MAX_CORPO = 256 * 1024;
const TETO_POR_MIN = numero("WEBHOOK_TETO_MIN", 30, { min: 1, inteiro: true });
// ── Exposição (12 out 2026) ──
// O receptor fica na internet (Tailscale Funnel) e, com o bot global, qualquer
// admin de qualquer servidor criava ganchos nele. Tetos que não dependem de
// quem pede: total por minuto (todos os ganchos somados), tentativas com token
// errado, conexões abertas, tempo para mandar o pedido, ganchos por servidor.
const TETO_GLOBAL_MIN = numero("WEBHOOK_TETO_GLOBAL_MIN", 240, { min: 1, inteiro: true });
const TETO_ERROS_MIN = numero("WEBHOOK_TETO_ERROS_MIN", 60, { min: 1, inteiro: true });
const MAX_GANCHOS_SERVIDOR = numero("WEBHOOK_MAX_POR_SERVIDOR", 10, { min: 1, inteiro: true });
const MAX_CONEXOES = numero("WEBHOOK_MAX_CONEXOES", 64, { min: 1, inteiro: true });
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

// (31 out 2026, R11) O receptor só sobe se existir pelo menos um gancho: sem
// gancho, nenhuma porta aberta à toa. O main.js chama `iniciarReceptor(ctx)` no
// boot (a função lembra o ctx); o `&webhook criar` sobe o receptor na hora, e o
// `&webhook remover` do último gancho o desliga.
let receptor = null, ctxDoReceptor = null;
export const temGanchos = () => (db.getDb().prepare("SELECT COUNT(*) AS n FROM ganchos").get()?.n ?? 0) > 0;
export function iniciarReceptor(ctx = null) {
  if (ctx) ctxDoReceptor = ctx;
  if (receptor || !ctxDoReceptor || !temGanchos()) return receptor;
  receptor = criarReceptor(ctxDoReceptor);
  return receptor;
}
export function pararReceptorSeVazio() {
  if (!receptor || temGanchos()) return false;
  receptor.close(); receptor = null;
  console.log("[WEBHOOK] receptor desligado (nenhum gancho)");
  return true;
}
export const receptorLigado = () => !!receptor;

function criarReceptor(ctx) {
  const srv = createServer((req, res) => {
    const fim = (codigo, obj) => { res.writeHead(codigo, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" }); res.end(JSON.stringify(obj)); };
    const m = req.url?.match(/^\/gancho\/(\d+)\/([A-Za-z0-9_-]+)$/);
    if (!m || req.method !== "POST") return fim(404, { erro: "use POST /gancho/<id>/<token>" });
    // quem erra o token demais (varredura) leva 429 antes de tocar no banco
    if ((usoRecente.get("__erros__") ?? []).filter((t) => Date.now() - t < 60_000).length >= TETO_ERROS_MIN) return fim(429, { erro: "tentativas demais" });
    if (Number(req.headers["content-length"] || 0) > MAX_CORPO) { res.setHeader("Connection", "close"); return fim(413, { erro: "corpo grande demais" }); }

    let corpo = "", estourouCorpo = false;
    req.on("data", (d) => { corpo += d; if (corpo.length > MAX_CORPO) { estourouCorpo = true; req.destroy(); } });
    req.on("end", async () => {
      if (estourouCorpo) return;
      try {
        const gancho = db.ganchoPorId(Number(m[1]));
        if (!gancho || !tokenConfere(gancho.token, m[2])) { estourou("__erros__", Infinity); return fim(401, { erro: "gancho ou token inválido" }); }
        // (31 out 2026) o teto global só conta DEPOIS do token: antes, uma
        // varredura com token errado gastava o teto de todos e travava os ganchos de verdade
        if (estourou("__todos__", TETO_GLOBAL_MIN)) return fim(429, { erro: "calma: teto de publicações por minuto atingido" });
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
        // canal sumido: 410 (o serviço de fora entende que a URL morreu, em vez de "ok")
        if (!canal) { registrarErro("WEBHOOK", "o canal de um gancho não existe mais (ou o bot perdeu o acesso)"); return fim(410, { erro: "o canal deste gancho não existe mais" }); }
        // o gancho é do servidor que o criou: nunca publica em canal de outro
        if (canalDeOutroServidor(canal, gancho.serverId)) {
          console.warn(`[SEGURANCA] gancho ${gancho.id} (servidor ${gancho.serverId}) aponta para canal de outro servidor (${canal.serverId}) — bloqueado`);
          return fim(403, { erro: "o canal deste gancho não é do servidor dele" });
        }
        // título e texto vêm de fora: sem ping em massa, sem link mascarado (textoDeFora)
        const link = linkSeguro(embed.url);
        const descricao = textoDeFora(embed.descricao, { max: 1700 });
        await ctx.sendEmbed(canal, {
          title: textoDeFora(embed.titulo, { max: 100 }),
          description: link ? `${descricao}\n[abrir ↗](${link})` : descricao,
          colour: embed.cor,
        });
        console.log(`[WEBHOOK] gancho "${gancho.nome}" publicou "${evento}" em ${gancho.canalId}`);
        return fim(200, { ok: true });
      } catch (e) {
        registrarErro("WEBHOOK", e);
        return fim(500, { erro: "falha ao publicar" });
      }
    });
  });
  // pedido lento ou pendurado não segura conexão aberta (slowloris)
  srv.headersTimeout = 10_000;
  srv.requestTimeout = 15_000;
  srv.keepAliveTimeout = 5_000;
  srv.maxHeadersCount = 50;
  srv.maxConnections = MAX_CONEXOES;
  srv.on("error", (e) => { registrarErro("WEBHOOK", `o receptor não subiu: ${e?.code ?? e?.message}`); if (receptor === srv) receptor = null; });
  srv.listen(PORTA, BIND, () => console.log(`[WEBHOOK] receptor de pé em ${BIND}:${PORTA} (POST /gancho/<id>/<token>)`));
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
// A URL e, só para o dono do bot (SUPER_ADMINS), as dicas de endereço da máquina dele
// (Tailscale, a ponte do Docker, o WEBHOOK_URL_BASE): para quem não hospeda o bot elas
// não servem e mostrariam detalhe da instalação (P2, 31 out 2026).
function blocoDeUrl(g, en, l = null, dono = false) {
  const rota = `/gancho/${g.id}/${g.token}`;
  const es = l === "es";
  const linhas = [es ? "**La URL secreta** (selecciona y copia la línea entera):" : en ? "**The secret URL** (select and copy the whole line):" : "**A URL secreta** (seleciona e copia a linha inteira):", "", urlDoGancho(g)];
  if (dono) {
    linhas.push("");
    if (es) {
      linhas.push("🌐 **Servicio de internet** (GitHub…): la base tiene que ser PÚBLICA por https — ej.: `sudo tailscale funnel --bg " + PORTA + "` y `WEBHOOK_URL_BASE=https://<máquina>.<tailnet>.ts.net` en el `.env`.");
      linhas.push("🏠 **Contenedor en la misma máquina** (Crafty…): usa el puente de Docker: `http://172.17.0.1:" + PORTA + rota + "`");
      if (!URL_BASE) linhas.push("⚠️ `WEBHOOK_URL_BASE` no está definido — cambia el marcador de arriba por la dirección de tu máquina.");
    } else if (en) {
      linhas.push("🌐 **Internet service** (GitHub…): the base must be PUBLIC over https — e.g. `sudo tailscale funnel --bg " + PORTA + "` and set `WEBHOOK_URL_BASE=https://<machine>.<tailnet>.ts.net` in `.env`.");
      linhas.push("🏠 **Same-machine container** (Crafty…): use the Docker bridge instead: `http://172.17.0.1:" + PORTA + rota + "`");
      if (!URL_BASE) linhas.push("⚠️ `WEBHOOK_URL_BASE` is not set — replace the placeholder above with your machine's address.");
    } else {
      linhas.push("🌐 **Serviço da internet** (GitHub…): a base precisa ser PÚBLICA em https — ex.: `sudo tailscale funnel --bg " + PORTA + "` e `WEBHOOK_URL_BASE=https://<máquina>.<tailnet>.ts.net` no `.env`.");
      linhas.push("🏠 **Container na mesma máquina** (Crafty…): use a ponte do Docker: `http://172.17.0.1:" + PORTA + rota + "`");
      if (!URL_BASE) linhas.push("⚠️ `WEBHOOK_URL_BASE` não está definido — troque o marcador acima pelo endereço da sua máquina.");
    }
  }
  return es ? trechoPronto(linhas.join("\n")) : linhas.join("\n");
}

// (31 out 2026, R6) A URL tem o token secreto: vai por DM a quem pediu, nunca
// para o canal. Direto pela DM (sem o `sendEmbed` do bot, que copia o texto no
// log local). Devolve true se a DM saiu.
async function urlPorDM(message, embed) {
  try {
    const dm = await message.author?.openDM?.();
    if (typeof dm?.sendMessage !== "function") return false;
    const limpo = (t) => String(t ?? "").replace(/[\u2063\u2064]/g, "");
    await dm.sendMessage({ embeds: [{ title: limpo(embed.title), description: limpo(embed.description), colour: embed.colour }] });
    return true;
  } catch (e) {
    registrarErro("WEBHOOK", "a DM com a URL do gancho não foi entregue");
    return false;
  }
}

export async function cmdWebhook(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId, membroTemPermissao, getServer } = ctx;
  const en = lingua(ctx) === "en";
  const sub = String(args[0] ?? "").toLowerCase();
  const dono = !!ctx.ehSuperAdmin?.(message.authorId);
  const curto = (pt, eng, es, colour = COR.sucesso) => sendEmbed(message.channel, { description: tr(ctx, pt, eng, es), colour });

  const podeGerir = ctx.temCargoStaff?.(message, ctx.config)
    || membroTemPermissao(message, await getServer(message).catch(() => null), "ManageMessages");

  if (!sub || ["ajuda", "help"].includes(sub)) return erroDeUso(ctx, message.channel, "webhook", "Faltou o subcomando.", "Missing the subcommand.", "Falta el subcomando.");

  // `list`, `create`, `remove`, `test`… chegam traduzidos pelo registro (fase 3)
  if (sub === "lista") {
    const ganchos = db.listarGanchos(serverId);
    if (!ganchos.length) return curto("Nenhum gancho.", "No hooks.", "Ningún gancho.", COR.info);
    return curto(
      ganchos.map((g) => `**${g.nome}** → <#${g.canalId}> · eventos: ${g.eventos || "todos"} · ${g.usos} uso(s)`).join("\n"),
      ganchos.map((g) => `**${g.nome}** → <#${g.canalId}> · events: ${g.eventos || "all"} · ${g.usos} use(s)`).join("\n"),
      ganchos.map((g) => `**${g.nome}** → <#${g.canalId}> · eventos: ${g.eventos || "todos"} · ${g.usos} uso(s)`).join("\n"), COR.info);
  }

  if (!podeGerir) return semPermissao(ctx, message.channel, "ManageMessages");

  const nome = String(args[1] ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  const acharGancho = () => db.listarGanchos(serverId).find((g) => g.nome === nome);

  // O canal precisa ser DESTE servidor (antes dava para apontar um gancho para
  // o canal de outro servidor e publicar lá pela Judy) e quem pede precisa poder
  // escrever nele (31 out 2026: senão o gancho virava um jeito de falar onde a
  // pessoa não fala). → { id } ou { erro: "fora" | "mudo" }
  const servidor = await getServer(message).catch(() => null);
  const escolherCanal = (entrada) => {
    if (!entrada) return { id: message.channelId };
    const c = canalDesteServidor(servidor, entrada);
    if (!c) return { erro: "fora" };
    const obj = ctx.client?.channels?.get?.(c.id) ?? c;
    if (!podeEscreverNoCanal(message, obj, servidor, ctx)) return { erro: "mudo" };
    return { id: c.id };
  };
  const canalRecusado = (erro) => erro === "mudo"
    ? curto("❌ Você não pode escrever nesse canal.", "❌ You can't send messages in that channel.", "❌ No puedes escribir en ese canal.", COR.aviso)
    : curto("❌ Esse canal não é deste servidor.", "❌ That channel isn't on this server.", "❌ Ese canal no es de este servidor.", COR.aviso);
  const semDM = tr(ctx, "⚠️ A DM com a URL não foi entregue — abra as DMs e peça a URL de novo.", "⚠️ The DM with the URL didn't go through — open your DMs and ask for the URL again.", "⚠️ El DM con la URL no se entregó — abre tus DMs y pide la URL de nuevo.");
  // `[eventos]`: lista separada por vírgula; `todos`/`all`/vazio = todos
  const lerEventos = (partes) => {
    const lista = String(partes.join(",") ?? "").toLowerCase().replace(/\s+/g, "").replace(/,+/g, ",").replace(/^,|,$/g, "");
    if (["todos", "all", ""].includes(lista)) return "";
    return /^[a-z0-9_.,*-]{1,300}$/.test(lista) ? lista : null;
  };

  if (sub === "criar" || sub === "novo" || sub === "add") {
    if (!nome) return erroDeUso(ctx, message.channel, "webhook", "Dê um nome ao gancho.", "Give the hook a name.", "Ponle un nombre al gancho.");
    if (acharGancho()) return curto(`**${nome}** já existe.`, `**${nome}** already exists.`, `**${nome}** ya existe.`, COR.aviso);
    if (!servidorPodeTerWebhook(serverId)) return curto("🚫 Webhooks não estão liberados neste servidor.", "🚫 Webhooks aren't enabled on this server.", "🚫 Los webhooks no están habilitados en este servidor.", COR.aviso);
    if (db.listarGanchos(serverId).length >= MAX_GANCHOS_SERVIDOR) return curto(`❌ Máximo de ${MAX_GANCHOS_SERVIDOR} ganchos.`, `❌ Maximum of ${MAX_GANCHOS_SERVIDOR} hooks.`, `❌ Máximo de ${MAX_GANCHOS_SERVIDOR} ganchos.`, COR.aviso);
    // `[#canal]` é opcional: o que vier depois do nome e não for canal são os eventos
    const temCanal = args[2] && /^<?#?[0-9A-HJKMNP-TV-Z]{26}>?$/i.test(args[2]);
    const escolhido = escolherCanal(temCanal ? args[2] : null);
    if (escolhido.erro) return canalRecusado(escolhido.erro);
    const eventos = lerEventos(args.slice(temCanal ? 3 : 2));
    if (eventos === null) return erroDeUso(ctx, message.channel, "webhook", "Eventos: nomes separados por vírgula.", "Events: names separated by commas.", "Eventos: nombres separados por comas.");
    const canalId = escolhido.id;
    const token = randomBytes(16).toString("base64url");
    const g = db.criarGancho(serverId, nome, canalId, token);
    if (eventos) db.atualizarGancho(g.id, { eventos });
    iniciarReceptor();   // o primeiro gancho sobe o receptor
    const naDM = await urlPorDM(message, tr(ctx, {
      title: `🪝 Gancho "${nome}"`,
      description: `Publica em <#${canalId}>. Quem tem a URL publica no canal — trate como senha.\n\n${blocoDeUrl(g, false, "pt", dono)}\n\nGitHub: Settings → Webhooks → Add, content type \`application/json\`.\nCrafty: Config do servidor → Webhooks → provider **Discord**, cole a URL.`,
      colour: COR.info,
    }, {
      title: `🪝 Hook "${nome}"`,
      description: `Posts to <#${canalId}>. Whoever holds the URL can post — treat it like a password.\n\n${blocoDeUrl(g, true, "en", dono)}\n\nGitHub: Settings → Webhooks → Add, content type \`application/json\`.\nCrafty: server config → Webhooks → provider **Discord**, paste the URL.`,
      colour: COR.info,
    }, {
      title: `🪝 Gancho "${nome}"`,
      description: `Publica en <#${canalId}>. Quien tenga la URL puede publicar en el canal — trátala como una contraseña.\n\n${blocoDeUrl(g, true, "es", dono)}\n\nGitHub: Settings → Webhooks → Add, content type \`application/json\`.\nCrafty: configuración del servidor → Webhooks → provider **Discord**, pega la URL.`,
      colour: COR.info,
    }));
    return sendEmbed(message.channel, {
      description: tr(ctx, `🪝 **${nome}** → <#${canalId}>`, `🪝 **${nome}** → <#${canalId}>`, `🪝 **${nome}** → <#${canalId}>`) + "\n"
        + (naDM ? tr(ctx, "📬 URL enviada por DM.", "📬 URL sent by DM.", "📬 URL enviada por DM.") : semDM),
      colour: naDM ? COR.sucesso : COR.aviso,
    });
  }

  const g = acharGancho();
  if (!g) return curto(`❌ Gancho não encontrado: **${nome || "?"}**.`, `❌ Hook not found: **${nome || "?"}**.`, `❌ Gancho no encontrado: **${nome || "?"}**.`, COR.aviso);

  if (sub === "url") {
    const naDM = await urlPorDM(message, { title: `🪝 ${g.nome}`, description: blocoDeUrl(g, en, idiomaDe(ctx), dono), colour: COR.info });
    return sendEmbed(message.channel, { colour: naDM ? COR.sucesso : COR.aviso,
      description: naDM ? tr(ctx, "📬 URL enviada por DM.", "📬 URL sent by DM.", "📬 URL enviada por DM.") : semDM });
  }
  if (sub === "canal") {
    if (!args[2]) return erroDeUso(ctx, message.channel, "webhook", "Qual canal?", "Which channel?", "¿Qué canal?");
    const escolhido = escolherCanal(args[2]);
    if (escolhido.erro) return canalRecusado(escolhido.erro);
    db.atualizarGancho(g.id, { canalId: escolhido.id });
    return curto(`🪝 **${g.nome}** → <#${escolhido.id}>`, `🪝 **${g.nome}** → <#${escolhido.id}>`, `🪝 **${g.nome}** → <#${escolhido.id}>`);
  }
  if (sub === "eventos" || sub === "filtro") {
    const eventos = lerEventos(args.slice(2));
    if (eventos === null) return erroDeUso(ctx, message.channel, "webhook", "Eventos: nomes separados por vírgula.", "Events: names separated by commas.", "Eventos: nombres separados por comas.");
    db.atualizarGancho(g.id, { eventos });
    return eventos ? curto(`🪝 **${g.nome}**: \`${eventos}\``, `🪝 **${g.nome}**: \`${eventos}\``, `🪝 **${g.nome}**: \`${eventos}\``)
      : curto(`🪝 **${g.nome}**: todos os eventos.`, `🪝 **${g.nome}**: every event.`, `🪝 **${g.nome}**: todos los eventos.`);
  }
  if (sub === "remover" || sub === "apagar") {
    db.removerGancho(g.id);
    pararReceptorSeVazio();
    return curto(`🗑️ **${g.nome}** apagado.`, `🗑️ **${g.nome}** deleted.`, `🗑️ **${g.nome}** borrado.`);
  }
  if (sub === "testar" || sub === "teste") {
    const canal = await canalPorId(ctx, g.canalId);
    if (!canal) return curto(`❌ Não alcancei <#${g.canalId}>.`, `❌ I can't reach <#${g.canalId}>.`, `❌ No llego a <#${g.canalId}>.`, COR.aviso);
    await ctx.sendEmbed(canal, {
      title: tr(ctx, "🧪 Teste de webhook", "🧪 Webhook test", "🧪 Prueba de webhook"),
      description: tr(ctx, `Gancho **${g.nome}** funcionando.`, `Hook **${g.nome}** working.`, `Gancho **${g.nome}** funcionando.`),
      colour: COR.sucesso,
    });
    return curto(`🧪 <#${g.canalId}>`, `🧪 <#${g.canalId}>`, `🧪 <#${g.canalId}>`);
  }

  return erroDeUso(ctx, message.channel, "webhook", "Subcomando desconhecido.", "Unknown subcommand.", "Subcomando desconocido.");
}
