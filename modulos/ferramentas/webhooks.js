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
import { randomBytes, timingSafeEqual } from "node:crypto";
import * as db from "../core/db.js";
import { tr, lingua } from "../core/i18n.js";

const PORTA = Number(process.env.WEBHOOK_PORTA || 8095);
const URL_BASE = (process.env.WEBHOOK_URL_BASE || "").replace(/\/$/, "");
const MAX_CORPO = 256 * 1024;
const TETO_POR_MIN = Number(process.env.WEBHOOK_TETO_MIN || 30);

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
  const cor = Number.isFinite(emb?.color) ? `#${Number(emb.color).toString(16).padStart(6, "0")}` : CORES.info;
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

function estourou(ganchoId) {
  const agora = Date.now();
  const lista = (usoRecente.get(ganchoId) ?? []).filter((t) => agora - t < 60_000);
  lista.push(agora);
  usoRecente.set(ganchoId, lista);
  return lista.length > TETO_POR_MIN;
}

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
    const fim = (codigo, obj) => { res.writeHead(codigo, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    const m = req.url?.match(/^\/gancho\/(\d+)\/([A-Za-z0-9_-]+)$/);
    if (!m || req.method !== "POST") return fim(404, { erro: "use POST /gancho/<id>/<token>" });

    let corpo = "";
    req.on("data", (d) => { corpo += d; if (corpo.length > MAX_CORPO) { req.destroy(); } });
    req.on("end", async () => {
      try {
        const gancho = db.ganchoPorId(Number(m[1]));
        if (!gancho || !tokenConfere(gancho.token, m[2])) return fim(401, { erro: "gancho ou token inválido" });
        if (estourou(gancho.id)) return fim(429, { erro: "calma: teto de publicações por minuto atingido" });

        let json = null;
        try { json = JSON.parse(corpo || "{}"); } catch { json = { text: corpo.slice(0, 900) }; }
        // GitHub com content-type form-urlencoded embrulha o JSON em payload=
        if (json?.payload && typeof json.payload === "string") { try { json = JSON.parse(json.payload); } catch {} }

        const { evento, embed } = formatar(Object.fromEntries(Object.entries(req.headers)), json);
        const eventos = gancho.eventos ? gancho.eventos.split(",").map((x) => x.trim()).filter(Boolean) : [];
        if (eventos.length && !eventos.includes(evento) && evento !== "ping") {
          return fim(200, { ok: true, ignorado: `evento "${evento}" fora do filtro deste gancho` });
        }
        if (!embed) return fim(200, { ok: true, ignorado: "evento sem conteúdo publicável" });

        db.registrarUsoGancho(gancho.id);
        const canal = await canalPorId(ctx, gancho.canalId);
        if (!canal) { console.error(`[WEBHOOK] canal ${gancho.canalId} não encontrado — o bot está nesse servidor?`); return fim(200, { ok: true, aviso: "canal não encontrado" }); }
        await ctx.sendEmbed(canal, {
          title: embed.titulo,
          description: (embed.url ? `${embed.descricao}\n[abrir ↗](${embed.url})` : embed.descricao).slice(0, 1900),
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
  srv.on("error", (e) => console.error(`[WEBHOOK] receptor não subiu na porta ${PORTA}: ${e.message}`));
  srv.listen(PORTA, () => console.log(`[WEBHOOK] receptor de pé na porta ${PORTA} (POST /gancho/<id>/<token>)`));
  return srv;
}

// ── Comando &webhook ────────────────────────────────────────────────────────
function urlDoGancho(g) {
  const base = URL_BASE || `http://IP-DA-MÁQUINA:${PORTA}`;
  return `${base}/gancho/${g.id}/${g.token}`;
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
        `\`${P}webhook criar <nome> [#canal]\` — novo gancho (a URL secreta aparece uma vez)`,
        `\`${P}webhook lista\` — os ganchos deste servidor`,
        `\`${P}webhook canal <nome> <#canal>\` — muda o destino`,
        `\`${P}webhook eventos <nome> <push,issues,…|todos>\` — filtra o que este gancho publica`,
        `\`${P}webhook url <nome>\` — mostra a URL de novo · \`${P}webhook testar <nome>\` — publica um teste`,
        `\`${P}webhook remover <nome>\` — apaga (a URL morre na hora)`,
        "",
        "_Separar por chats = um gancho por assunto: `issues` → #issues, `workflow_run` → #ci, o Crafty → #minecraft._",
      ].join("\n"),
      colour: COR.info,
    }, {
      title: "🪝 Webhooks",
      description: [
        "External services post here: **GitHub** (push, issues, PRs, releases, Actions…), **Crafty/Minecraft** and anything that speaks the Discord format (Uptime Kuma, Grafana…).",
        "",
        `\`${P}webhook criar <name> [#channel]\` — new hook (the secret URL shows once)`,
        `\`${P}webhook lista\` — this server's hooks`,
        `\`${P}webhook canal <name> <#channel>\` — change destination`,
        `\`${P}webhook eventos <name> <push,issues,…|todos>\` — filter what this hook posts`,
        `\`${P}webhook url <name>\` — show the URL again · \`${P}webhook testar <name>\` — post a test`,
        `\`${P}webhook remover <name>\` — delete (the URL dies instantly)`,
        "",
        "_Per-chat separation = one hook per subject: `issues` → #issues, `workflow_run` → #ci, Crafty → #minecraft._",
      ].join("\n"),
      colour: COR.info,
    }));
  }

  if (sub === "lista" || sub === "list") {
    const ganchos = db.listarGanchos(serverId);
    return sendEmbed(message.channel, {
      title: en ? "🪝 Hooks on this server" : "🪝 Ganchos deste servidor",
      description: ganchos.length
        ? ganchos.map((g) => `**${g.nome}** → <#${g.canalId}> · eventos: ${g.eventos || (en ? "all" : "todos")} · ${g.usos} uso(s)`).join("\n")
        : (en ? `None yet. \`${P}webhook criar <name>\`` : `Nenhum ainda. \`${P}webhook criar <nome>\``),
      colour: COR.info,
    });
  }

  if (!podeGerir) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🔒 Sem permissão", description: "Gerir webhooks pede **ManageMessages** (ou cargo de staff).", colour: COR.aviso },
      { title: "🔒 No permission", description: "Managing webhooks requires **ManageMessages** (or a staff role).", colour: COR.aviso }));
  }

  const nome = String(args[1] ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  const acharGancho = () => db.listarGanchos(serverId).find((g) => g.nome === nome);

  if (sub === "criar" || sub === "novo" || sub === "add") {
    if (!nome) return sendEmbed(message.channel, { title: "🪝", description: en ? `Give it a name: \`${P}webhook criar github\`` : `Dê um nome: \`${P}webhook criar github\``, colour: COR.aviso });
    if (acharGancho()) return sendEmbed(message.channel, { title: "🪝", description: en ? `**${nome}** already exists — \`${P}webhook url ${nome}\`.` : `**${nome}** já existe — \`${P}webhook url ${nome}\`.`, colour: COR.aviso });
    const canalId = ctx.limparId?.(args[2]) || args[2]?.replace(/[<#>]/g, "") || message.channelId;
    const token = randomBytes(16).toString("base64url");
    const g = db.criarGancho(serverId, nome, canalId, token);
    return sendEmbed(message.channel, tr(ctx, {
      title: `🪝 Gancho "${nome}" criado`,
      description: `Publica em <#${canalId}>.\n\n**A URL secreta** _(cole no serviço externo; quem tem a URL publica no canal)_:\n\`\`\`\n${urlDoGancho(g)}\n\`\`\`\nGitHub: Settings → Webhooks → Add, content type \`application/json\`.\nCrafty: Config do servidor → Webhooks → provider **Discord**, cole a URL.\n${URL_BASE ? "" : "\n⚠️ Defina \`WEBHOOK_URL_BASE\` no \`.env\` com o endereço público/da rede para a URL sair pronta."}`,
      colour: COR.sucesso,
    }, {
      title: `🪝 Hook "${nome}" created`,
      description: `Posts to <#${canalId}>.\n\n**The secret URL** _(paste it in the external service; whoever holds it can post)_:\n\`\`\`\n${urlDoGancho(g)}\n\`\`\`\nGitHub: Settings → Webhooks → Add, content type \`application/json\`.\nCrafty: server config → Webhooks → provider **Discord**, paste the URL.\n${URL_BASE ? "" : "\n⚠️ Set \`WEBHOOK_URL_BASE\` in \`.env\` with the public/LAN address so the URL comes out ready."}`,
      colour: COR.sucesso,
    }));
  }

  const g = acharGancho();
  if (!g) return sendEmbed(message.channel, { title: "🪝", description: en ? `I don't know **${nome || "?"}** — \`${P}webhook lista\`.` : `Não conheço **${nome || "?"}** — \`${P}webhook lista\`.`, colour: COR.aviso });

  if (sub === "url") {
    return sendEmbed(message.channel, { title: `🪝 ${g.nome}`, description: `\`\`\`\n${urlDoGancho(g)}\n\`\`\``, colour: COR.info });
  }
  if (sub === "canal") {
    const canalId = ctx.limparId?.(args[2]) || args[2]?.replace(/[<#>]/g, "");
    if (!canalId) return sendEmbed(message.channel, { title: "🪝", description: en ? "Which channel?" : "Qual canal?", colour: COR.aviso });
    db.atualizarGancho(g.id, { canalId });
    return sendEmbed(message.channel, { title: "🪝", description: (en ? `**${g.nome}** now posts to ` : `**${g.nome}** agora publica em `) + `<#${canalId}>.`, colour: COR.sucesso });
  }
  if (sub === "eventos" || sub === "filtro") {
    const lista = String(args.slice(2).join(",") ?? "").toLowerCase().replace(/\s+/g, "");
    const eventos = ["todos", "all", ""].includes(lista) ? "" : lista;
    db.atualizarGancho(g.id, { eventos });
    return sendEmbed(message.channel, { title: "🪝", description: eventos ? (en ? `**${g.nome}** only posts: \`${eventos}\`` : `**${g.nome}** só publica: \`${eventos}\``) : (en ? `**${g.nome}** posts every event.` : `**${g.nome}** publica todos os eventos.`), colour: COR.sucesso });
  }
  if (sub === "remover" || sub === "remove" || sub === "apagar") {
    db.removerGancho(g.id);
    return sendEmbed(message.channel, { title: "🪝", description: en ? `**${g.nome}** deleted — its URL is dead.` : `**${g.nome}** apagado — a URL dele morreu.`, colour: COR.sucesso });
  }
  if (sub === "testar" || sub === "test" || sub === "teste") {
    const canal = await canalPorId(ctx, g.canalId);
    if (!canal) return sendEmbed(message.channel, { title: "🪝", description: en ? `I can't reach <#${g.canalId}> — does it still exist?` : `Não alcancei <#${g.canalId}> — ele ainda existe?`, colour: COR.aviso });
    await ctx.sendEmbed(canal, {
      title: en ? "🧪 Webhook test" : "🧪 Teste de webhook",
      description: (en ? `Hook **${g.nome}** working — this is where its events land.` : `Gancho **${g.nome}** funcionando — é aqui que os eventos dele chegam.`),
      colour: COR.sucesso,
    });
    return sendEmbed(message.channel, { title: "🪝", description: en ? `Test sent to <#${g.canalId}>.` : `Teste enviado para <#${g.canalId}>.`, colour: COR.sucesso });
  }

  return sendEmbed(message.channel, { title: "🪝", description: en ? `Unknown subcommand — \`${P}webhook\` shows the list.` : `Subcomando desconhecido — \`${P}webhook\` mostra a lista.`, colour: COR.aviso });
}
