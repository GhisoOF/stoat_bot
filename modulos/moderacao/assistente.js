// ══════════════════════════════════════════════════════════
//  assistente.js — &assistente: configuração GUIADA
//
//  O &tutorial ensina; o &assistente faz junto. O bot pergunta uma
//  coisa de cada vez, a pessoa responde em texto normal (sem prefixo),
//  e no fim aparece um RESUMO do que vai mudar. Só depois do
//  `confirmar` alguma coisa é aplicada.
//
//  Como aplica: chamando os MESMOS handlers dos comandos normais
//  (`&idioma`, `&acesso cargo add`, `&log canal`, `&automod … on`…),
//  com um ctx cujo sendEmbed CAPTURA as respostas em vez de publicar.
//  Três vantagens:
//   • zero lógica de configuração duplicada — se o comando muda, o
//     assistente muda junto;
//   • as checagens de permissão dos comandos continuam valendo;
//   • o resumo final mostra o comando equivalente de cada passo, então
//     quem usou o assistente sai sabendo fazer na mão.
//
//  Sessão: uma por (canal, pessoa), expira em 10 min sem resposta.
//  Durante ela: `pular` pula, `voltar` volta, `cancelar` desiste.
//  Um comando com prefixo continua funcionando normalmente — a sessão
//  só captura texto SEM prefixo (o main.js garante isso).
//
//  Roteiros: rapido · completo · canais · protecao
// ══════════════════════════════════════════════════════════

import { lingua } from "../core/i18n.js";
import { resolverCanal, resolverCargo } from "../core/ids.js";
import { temCargoStaff } from "./acesso.js";
import { podeNoCanal } from "./permissoes.js";

const TTL_MS = 10 * 60 * 1000;
const sessoes = new Map();   // `${channelId}:${userId}` → sessão

const chaveDe = (m) => `${m.channelId}:${m.authorId}`;

export function temSessao(message) {
  const s = sessoes.get(chaveDe(message));
  if (!s) return false;
  if (s.expira < Date.now()) { sessoes.delete(chaveDe(message)); return false; }
  return true;
}

// Para os testes e o &debug.
export function sessoesAtivas() { return sessoes.size; }

// ──────────────────────────────────────────────────────────
//  Texto bilíngue curto
// ──────────────────────────────────────────────────────────
const T = (lang, pt, en) => (lang === "en" ? en : pt);

// ──────────────────────────────────────────────────────────
//  PASSOS — cada um: id, pergunta, parse(resposta) → { valor } | { erro },
//  e comandos(valor) → lista de args para aplicar via rotas.
//  `valor === null` significa "pulado".
// ──────────────────────────────────────────────────────────

function listaDeNomes(texto) {
  return String(texto).split(/[,\n;]+|\s+e\s+|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
}

const PASSOS = {
  idioma: {
    pergunta: (lang, P) => T(lang,
      "🌐 **Idioma** — em que idioma eu respondo neste servidor?\n`1` Português · `2` English",
      "🌐 **Language** — which language should I reply in on this server?\n`1` Português · `2` English"),
    parse: (r) => {
      const v = r.toLowerCase();
      if (/^(1|pt|portugu)/.test(v)) return { valor: "pt", rotulo: "Português" };
      if (/^(2|en|engl|ingl)/.test(v)) return { valor: "en", rotulo: "English" };
      return { erro: true };
    },
    comandos: (v) => [["idioma", v === "en" ? "english" : "portugues"]],
  },

  staff: {
    pergunta: (lang, P) => T(lang,
      "👥 **Staff** — quais cargos são a equipe? Eles ganham acesso aos comandos de moderação.\nMencione ou escreva os nomes separados por vírgula (ex.: `Admin, Moderador`) — ou `pular`.",
      "👥 **Staff** — which roles are the team? They get access to moderation commands.\nMention them or type the names separated by commas (e.g. `Admin, Moderator`) — or `pular`."),
    parse: (r, { server }) => {
      const nomes = listaDeNomes(r);
      const ids = [], falhas = [];
      for (const n of nomes) {
        const r = resolverCargo(n, server);   // → { id, nome } | null
        if (r) ids.push(r); else falhas.push(n);
      }
      if (!ids.length) return { erro: true, detalhe: falhas.join(", ") };
      return { valor: ids, rotulo: ids.map((x) => x.nome).join(", "), aviso: falhas.length ? falhas : null };
    },
    comandos: (v) => v.map((c) => ["acesso", "cargo", "add", c.id]),
  },

  log: {
    pergunta: (lang, P) => T(lang,
      "📋 **Registro** — em que canal eu escrevo o que aconteceu (punições, entradas, saídas)?\nO ideal é um canal 🔒 que só a staff vê. Responda `aqui`, mencione o canal, ou `pular`.",
      "📋 **Logging** — which channel should I write what happened in (punishments, joins, leaves)?\nIdeally a 🔒 staff-only channel. Answer `aqui`, mention the channel, or `pular`."),
    parse: (r, { message, server }) => {
      const id = resolverCanal(r, { message, server });
      if (!id) return { erro: true };
      return { valor: id, rotulo: `<#${id}>` };
    },
    comandos: (v) => [["log", "canal", v]],
  },

  protecao: {
    pergunta: (lang, P) => T(lang,
      [
        "🛡️ **Proteção** — que nível você quer?",
        "`1` **Leve** — antispam e anti-convite; só avisa",
        "`2` **Médio** — + anti-link, menções em massa e Sentinela (julga golpe/+18); punição em escada: aviso → mute → ban",
        "`3` **Rígido** — + caps, caracteres estranhos, repetição; Sentinela em sensibilidade alta; bane quem já foi banido em outro servidor",
        "",
        "_Dá para ajustar cada filtro depois com `&automod`._",
      ].join("\n"),
      [
        "🛡️ **Protection** — which level do you want?",
        "`1` **Light** — antispam and anti-invite; warns only",
        "`2` **Medium** — + anti-link, mass mentions and Sentinel (judges scams/NSFW); ladder punishment: warning → mute → ban",
        "`3` **Strict** — + caps, odd characters, repetition; Sentinel at high sensitivity; bans people already banned on other servers",
        "",
        "_Every filter can be tuned later with `&automod`._",
      ].join("\n")),
    parse: (r, { lang }) => {
      const v = r.toLowerCase();
      if (/^(1|leve|light)/.test(v)) return { valor: 1, rotulo: T(lang, "Leve", "Light") };
      if (/^(2|medi|medium)/.test(v)) return { valor: 2, rotulo: T(lang, "Médio", "Medium") };
      if (/^(3|rigid|rígid|strict)/.test(v)) return { valor: 3, rotulo: T(lang, "Rígido", "Strict") };
      return { erro: true };
    },
    comandos: (v, { config }) => {
      const c = [["automod", "antispam", "on"], ["automod", "antiinvite", "on"]];
      if (v === 1) { c.push(["punicao", "modo", "avisar"]); return c; }
      c.push(["automod", "antilink", "on"], ["automod", "antimassmention", "on"],
        ["sentinela", "on"], ["sentinela", "antiguidade", "on"], ["sentinela", "alerta", "on"]);
      if (v === 2) c.push(["sentinela", "sensitivity", "media"]);
      if (v === 3) c.push(["automod", "anticaps", "on"], ["automod", "anticaracteres", "on"],
        ["automod", "antirepeticao", "on"], ["sentinela", "sensitivity", "alta"], ["banglobal", "banir"]);
      // O mute da escada precisa de um cargo de silêncio — cria se não houver.
      if (!config?.automod?.punicao?.silenceRoleId) c.push(["cargomudo"]);
      c.push(["punicao", "modo", "acumular"]);
      return c;
    },
  },

  boasvindas: {
    pergunta: (lang, P) => T(lang,
      "👋 **Boas-vindas** — em que canal eu dou as boas-vindas a quem entra?\n`aqui`, mencione o canal, ou `pular`. (O texto você ajusta depois com `&boasvindas texto …` — `&help boasvindas` explica cada parâmetro.)",
      "👋 **Welcome** — which channel should I welcome newcomers in?\n`aqui`, mention the channel, or `pular`. (You tune the text later with `&boasvindas texto …` — `&help boasvindas` explains every parameter.)"),
    parse: (r, { message, server }) => {
      const id = resolverCanal(r, { message, server });
      if (!id) return { erro: true };
      return { valor: id, rotulo: `<#${id}>` };
    },
    comandos: (v) => [["boasvindas", "canal", v]],
  },

  escada: {
    pergunta: (lang, P) => T(lang,
      "🪜 **Escada de punição** (modo `acumular`) — os degraus, separados por vírgula.\nPadrão: `aviso,5m,1h,ban`. Aceita `aviso`, tempos (`10m`, `2h`, `1d`) e `ban`. Responda `padrao` para manter, ou `pular`.",
      "🪜 **Punishment ladder** (`acumular` mode) — the steps, comma-separated.\nDefault: `aviso,5m,1h,ban`. Accepts `aviso`, durations (`10m`, `2h`, `1d`) and `ban`. Answer `padrao` to keep it, or `pular`."),
    parse: (r) => {
      const v = r.toLowerCase().replace(/\s+/g, "");
      if (/^(padrao|padrão|default)$/.test(v)) return { valor: "aviso,5m,1h,ban", rotulo: "aviso,5m,1h,ban" };
      if (!/^(aviso|warning|\d+[smhd]|ban)(,(aviso|warning|\d+[smhd]|ban))*$/.test(v)) return { erro: true };
      return { valor: v, rotulo: v };
    },
    comandos: (v) => [["punicao", "escada", v]],
  },

  banglobal: {
    pergunta: (lang, P) => T(lang,
      "🌍 **Lista global** — quando entra alguém que já foi banido em outro servidor que uso:\n`1` ignorar · `2` avisar no log · `3` banir automaticamente",
      "🌍 **Global list** — when someone banned on another server I'm in joins:\n`1` ignore · `2` warn in the log · `3` ban automatically"),
    parse: (r, { lang }) => {
      const v = r.toLowerCase();
      if (/^(1|ignor|off)/.test(v)) return { valor: "off", rotulo: T(lang, "ignorar", "ignore") };
      if (/^(2|avis|warn)/.test(v)) return { valor: "avisar", rotulo: T(lang, "avisar", "warn") };
      if (/^(3|ban)/.test(v)) return { valor: "banir", rotulo: T(lang, "banir", "ban") };
      return { erro: true };
    },
    comandos: (v) => [["banglobal", v]],
  },

  xp: {
    pergunta: (lang, P) => T(lang,
      "🎮 **Níveis por XP** — ligar o sistema de níveis por mensagem? `sim` / `nao`\n(Depois: `&xp setup` escolhe cargos por nível e o canal de anúncio.)",
      "🎮 **XP levels** — turn on the message-based leveling system? `yes` / `no`\n(Later: `&xp setup` picks level roles and the announcement channel.)"),
    parse: (r, { lang }) => {
      const v = r.toLowerCase();
      if (/^(s|y|on|1)/.test(v)) return { valor: "on", rotulo: T(lang, "ligado", "on") };
      if (/^(n|off|0)/.test(v)) return { valor: "off", rotulo: T(lang, "desligado", "off") };
      return { erro: true };
    },
    comandos: (v) => [["xp", v]],
  },

  autorole: {
    pergunta: (lang, P) => T(lang,
      "🎭 **Cargo automático** — que cargo quem entra recebe na hora? Mencione ou escreva o nome — ou `pular`.",
      "🎭 **Autorole** — which role does everyone get on join? Mention it or type the name — or `pular`."),
    parse: (r, { server }) => {
      const c = resolverCargo(r, server);
      if (!c) return { erro: true };
      return { valor: c.id, rotulo: c.nome };
    },
    comandos: (v) => [["autorole", "set", v]],
  },

  // ── roteiro "canais": só coleta; o resultado é um guia, não uma aplicação ──
  canaisVer: {
    pergunta: (lang, P) => T(lang,
      "🔒 **Só a staff vê** — quais canais são de bastidores (log, alertas, staff-chat)?\nMencione ou escreva os nomes separados por vírgula — ou `pular`.",
      "🔒 **Staff-only to see** — which channels are backstage (log, alerts, staff-chat)?\nMention them or type the names separated by commas — or `pular`."),
    parse: (r, { message, server }) => resolverCanais(r, message, server),
    comandos: () => [],
  },
  canaisEscrever: {
    pergunta: (lang, P) => T(lang,
      "📢 **Só a staff escreve** — quais canais todo mundo lê mas só a staff publica (regras, avisos, painéis)?\nMencione ou escreva os nomes — ou `pular`.",
      "📢 **Staff-only to write** — which channels does everyone read but only staff posts in (rules, announcements, panels)?\nMention them or type the names — or `pular`."),
    parse: (r, { message, server }) => resolverCanais(r, message, server),
    comandos: () => [],
  },
};

function resolverCanais(r, message, server) {
  const nomes = listaDeNomes(r);
  const ids = [], falhas = [];
  for (const n of nomes) {
    const id = resolverCanal(n, { message, server });
    if (id) ids.push({ id, nome: nomeDoCanal(server, id) ?? n }); else falhas.push(n);
  }
  if (!ids.length) return { erro: true, detalhe: falhas.join(", ") };
  return { valor: ids, rotulo: ids.map((c) => `#${c.nome}`).join(", "), aviso: falhas.length ? falhas : null };
}

function nomeDoCanal(server, id) {
  const lista = Array.isArray(server?.channels) ? server.channels
    : (server?.channels && typeof server.channels.values === "function") ? [...server.channels.values()] : [];
  return lista.find((c) => (c?.id ?? c?._id) === id)?.name ?? null;
}

// ──────────────────────────────────────────────────────────
//  ROTEIROS
// ──────────────────────────────────────────────────────────
export const ROTEIROS = {
  rapido:   ["idioma", "staff", "log", "protecao", "boasvindas"],
  completo: ["idioma", "staff", "log", "protecao", "escada", "banglobal", "boasvindas", "autorole", "xp"],
  protecao: ["protecao", "escada", "banglobal", "log"],
  canais:   ["canaisVer", "canaisEscrever"],
};

const NOME_ROTEIRO = {
  rapido:   { pt: "Rápido",   en: "Quick" },
  completo: { pt: "Completo", en: "Full" },
  protecao: { pt: "Proteção", en: "Protection" },
  canais:   { pt: "Canais",   en: "Channels" },
};

// ──────────────────────────────────────────────────────────
//  &assistente [roteiro|cancelar]
// ──────────────────────────────────────────────────────────
export async function cmdAssistente(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config } = ctx;
  const lang = lingua(ctx);
  const pedido = (args[0] ?? "").toLowerCase();
  const chave = chaveDe(message);

  if (["cancelar", "cancel", "parar", "stop", "sair"].includes(pedido)) {
    const havia = sessoes.delete(chave);
    return sendEmbed(message.channel, {
      title: T(lang, "🧙 Assistente", "🧙 Wizard"),
      description: havia
        ? T(lang, "Cancelado. Nada foi alterado.", "Cancelled. Nothing was changed.")
        : T(lang, "Não havia assistente em andamento para você aqui.", "There was no wizard running for you here."),
      colour: COR.info,
    });
  }

  // Quem pode: quem pode configurar o servidor. O `canais` é só leitura, mas
  // também expõe nomes de canais de bastidores — fica restrito do mesmo jeito.
  const server = await ctx.getServer(message).catch(() => null);
  const pode = ctx.ehSuperAdmin?.(message.authorId)
    || temCargoStaff(message, config)
    || ctx.membroTemPermissao(message, server, "ManagePermissions");
  if (!pode) {
    return sendEmbed(message.channel, {
      title: T(lang, "🚫 Permissão insuficiente", "🚫 Missing permission"),
      description: T(lang,
        "O assistente mexe na configuração do servidor: precisa de **ManagePermissions** ou de um cargo de staff.",
        "The wizard changes the server's configuration: it needs **ManagePermissions** or a staff role."),
      colour: COR.erro,
    });
  }

  const roteiro = ROTEIROS[pedido] ? pedido : null;
  if (!roteiro) {
    return sendEmbed(message.channel, {
      title: T(lang, "🧙 Assistente de configuração", "🧙 Setup wizard"),
      description: [
        T(lang, "Eu pergunto, você responde em texto normal, e no fim mostro o resumo antes de aplicar qualquer coisa.",
                "I ask, you answer in plain text, and at the end I show a summary before applying anything."),
        "",
        `⚡ \`${P}assistente rapido\` — ${T(lang, "idioma, staff, log, proteção, boas-vindas (5 perguntas)", "language, staff, log, protection, welcome (5 questions)")}`,
        `🧰 \`${P}assistente completo\` — ${T(lang, "o rápido + escada, lista global, cargo automático, XP", "quick + ladder, global list, autorole, XP")}`,
        `🔀 \`${P}assistente canais\` — ${T(lang, "classifica seus canais nos 3 tipos e diz o que clicar", "sorts your channels into the 3 types and tells you what to click")}`,
        `🛡️ \`${P}assistente protecao\` — ${T(lang, "só automod, Sentinela e punição", "only automod, Sentinel and punishment")}`,
        "",
        T(lang, "Durante as perguntas: `pular` pula · `voltar` volta · `cancelar` desiste.",
                "During the questions: `pular` skips · `voltar` goes back · `cancelar` quits."),
        T(lang, `Prefere só ler? \`${P}tutorial\`.`, `Rather just read? \`${P}tutorial\`.`),
      ].join("\n"),
      colour: COR.info,
    });
  }

  sessoes.set(chave, {
    roteiro, passo: 0, respostas: {}, expira: Date.now() + TTL_MS,
    serverId: ctx.serverId, lang, fase: "perguntas",
  });
  await sendEmbed(message.channel, {
    title: T(lang, `🧙 Assistente — ${NOME_ROTEIRO[roteiro].pt}`, `🧙 Wizard — ${NOME_ROTEIRO[roteiro].en}`),
    description: T(lang,
      `${ROTEIROS[roteiro].length} pergunta(s). Responda aqui mesmo, sem prefixo. \`pular\` · \`voltar\` · \`cancelar\`.`,
      `${ROTEIROS[roteiro].length} question(s). Answer right here, no prefix. \`pular\` · \`voltar\` · \`cancelar\`.`),
    colour: COR.info,
  });
  return perguntar(message, ctx, sessoes.get(chave));
}

async function perguntar(message, ctx, s) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  const ids = ROTEIROS[s.roteiro];
  if (s.passo >= ids.length) return resumir(message, ctx, s);
  const passo = PASSOS[ids[s.passo]];
  return sendEmbed(message.channel, {
    title: T(s.lang, `❓ Pergunta ${s.passo + 1}/${ids.length}`, `❓ Question ${s.passo + 1}/${ids.length}`),
    description: passo.pergunta(s.lang, P),
    colour: COR.info,
  });
}

// ──────────────────────────────────────────────────────────
//  Resposta da pessoa (texto sem prefixo) — chamado pelo main.js
// ──────────────────────────────────────────────────────────
export async function aoResponder(message, ctx) {
  const chave = chaveDe(message);
  const s = sessoes.get(chave);
  if (!s) return false;
  if (s.expira < Date.now()) { sessoes.delete(chave); return false; }
  s.expira = Date.now() + TTL_MS;

  const { sendEmbed, COR } = ctx;
  const texto = String(message.content ?? "").trim();
  const v = texto.toLowerCase();
  const ids = ROTEIROS[s.roteiro];

  if (["cancelar", "cancel", "sair", "parar", "stop"].includes(v)) {
    sessoes.delete(chave);
    await sendEmbed(message.channel, { title: "🧙", description: T(s.lang, "Cancelado. Nada foi alterado.", "Cancelled. Nothing was changed."), colour: COR.info });
    return true;
  }

  // ── Fase de confirmação ──
  if (s.fase === "confirmar") {
    if (["confirmar", "confirm", "sim", "yes", "ok", "aplicar", "apply"].includes(v)) {
      sessoes.delete(chave);
      await aplicar(message, ctx, s);
      return true;
    }
    if (["voltar", "back"].includes(v)) {
      s.fase = "perguntas"; s.passo = Math.max(0, ids.length - 1);
      await perguntar(message, ctx, s);
      return true;
    }
    await sendEmbed(message.channel, { title: "🧙", description: T(s.lang,
      "Responda `confirmar` para aplicar, `voltar` para mudar a última resposta, ou `cancelar`.",
      "Answer `confirmar` to apply, `voltar` to change the last answer, or `cancelar`."), colour: COR.aviso });
    return true;
  }

  // ── Fase de perguntas ──
  if (["voltar", "back"].includes(v)) {
    if (s.passo > 0) { s.passo--; delete s.respostas[ids[s.passo]]; }
    await perguntar(message, ctx, s);
    return true;
  }
  if (["pular", "skip", "proximo", "próximo", "next", "-"].includes(v)) {
    s.respostas[ids[s.passo]] = { valor: null };
    s.passo++;
    await perguntar(message, ctx, s);
    return true;
  }

  const passo = PASSOS[ids[s.passo]];
  const server = await ctx.getServer(message).catch(() => null);
  const r = passo.parse(texto, { message, server, lang: s.lang, config: ctx.config });
  if (r.erro) {
    await sendEmbed(message.channel, {
      title: T(s.lang, "🤔 Não entendi", "🤔 I didn't get that"),
      description: (r.detalhe
        ? T(s.lang, `Não encontrei: \`${r.detalhe}\`.\n\n`, `Couldn't find: \`${r.detalhe}\`.\n\n`) : "")
        + T(s.lang, "Tente de novo, ou `pular`.", "Try again, or `pular`.")
        + "\n\n" + passo.pergunta(s.lang, ctx.PREFIXO),
      colour: COR.aviso,
    });
    return true;
  }
  s.respostas[ids[s.passo]] = r;
  if (r.aviso?.length) {
    await sendEmbed(message.channel, { title: "⚠️", description: T(s.lang,
      `Não encontrei: \`${r.aviso.join("`, `")}\` — segui com o resto.`,
      `Couldn't find: \`${r.aviso.join("`, `")}\` — went on with the rest.`), colour: COR.aviso });
  }
  s.passo++;
  await perguntar(message, ctx, s);
  return true;
}

// ──────────────────────────────────────────────────────────
//  Resumo: o que vai mudar e o comando equivalente de cada coisa
// ──────────────────────────────────────────────────────────
function comandosDe(s, ctx) {
  const lista = [];
  for (const id of ROTEIROS[s.roteiro]) {
    const r = s.respostas[id];
    if (!r || r.valor === null || r.valor === undefined) continue;
    for (const args of PASSOS[id].comandos(r.valor, { config: ctx.config })) lista.push({ passo: id, args });
  }
  return lista;
}

async function resumir(message, ctx, s) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  if (s.roteiro === "canais") return guiaDeCanais(message, ctx, s);

  const linhas = [];
  for (const id of ROTEIROS[s.roteiro]) {
    const r = s.respostas[id];
    const rot = (!r || r.valor === null) ? T(s.lang, "_(pulado)_", "_(skipped)_") : r.rotulo;
    linhas.push(`• **${id}** — ${rot}`);
  }
  const cmds = comandosDe(s, ctx);
  linhas.push("", T(s.lang, "**Vou rodar:**", "**I'll run:**"));
  for (const c of cmds) linhas.push(`\`${P}${c.args.join(" ")}\``);
  if (!cmds.length) linhas.push(T(s.lang, "_(nada — tudo foi pulado)_", "_(nothing — everything was skipped)_"));
  linhas.push("", T(s.lang, "Responda `confirmar` para aplicar, `voltar` para mudar a última, `cancelar` para desistir.",
                         "Answer `confirmar` to apply, `voltar` to change the last one, `cancelar` to quit."));
  s.fase = "confirmar";
  return sendEmbed(message.channel, {
    title: T(s.lang, "📝 Resumo — confirma?", "📝 Summary — confirm?"),
    description: linhas.join("\n"), colour: COR.aviso,
  });
}

// ──────────────────────────────────────────────────────────
//  Aplicar: chama os handlers com um sendEmbed que CAPTURA
// ──────────────────────────────────────────────────────────
async function aplicar(message, ctx, s) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  const rotas = ctx.estado?.rotas ?? {};
  const cmds = comandosDe(s, ctx);
  const resultado = [];

  for (const { args } of cmds) {
    const [nome, ...resto] = args;
    const handler = rotas[nome];
    if (!handler) { resultado.push({ args, ok: false, msg: T(s.lang, "comando não encontrado", "command not found") }); continue; }
    const capturadas = [];
    const ctxMudo = { ...ctx, sendEmbed: async (_c, e) => { capturadas.push(e); return { id: "capturada" }; } };
    // Recarrega a config a cada passo: o passo anterior pode ter mudado algo
    // que este lê (ex.: `cargomudo` cria o cargo que `punicao` usa).
    ctxMudo.config = ctx.configDoServidor?.(ctx.serverId) ?? ctx.config;
    try {
      await handler(message, resto, ctxMudo);
      const ult = capturadas[capturadas.length - 1];
      const falhou = ult && /^(❌|🚫)/.test(String(ult.title ?? ""));
      resultado.push({ args, ok: !falhou, msg: ult ? String(ult.title ?? "").replace(/^[^\w\p{L}]+/u, "") : "" });
    } catch (e) {
      resultado.push({ args, ok: false, msg: e?.message ?? String(e) });
    }
  }

  const okN = resultado.filter((r) => r.ok).length;
  const linhas = resultado.map((r) => `${r.ok ? "✅" : "❌"} \`${P}${r.args.join(" ")}\`${r.ok ? "" : ` — ${r.msg}`}`);
  linhas.push("", T(s.lang,
    `${okN}/${resultado.length} aplicado(s). \`${P}config\` mostra como ficou; \`${P}debug canais\` confere se o bot consegue agir em cada canal.`,
    `${okN}/${resultado.length} applied. \`${P}config\` shows the result; \`${P}debug canais\` checks whether the bot can act in each channel.`));
  if (okN < resultado.length) linhas.push(T(s.lang,
    "Para os que falharam, rode o comando na mão para ver a explicação completa.",
    "For the ones that failed, run the command by hand to see the full explanation."));
  return sendEmbed(message.channel, {
    title: T(s.lang, "🧙 Pronto", "🧙 Done"),
    description: linhas.join("\n"),
    colour: okN === resultado.length ? COR.sucesso : COR.aviso,
  });
}

// ──────────────────────────────────────────────────────────
//  Roteiro "canais": o guia clique-a-clique + checagem do bot
// ──────────────────────────────────────────────────────────
async function guiaDeCanais(message, ctx, s) {
  const { sendEmbed, COR, PREFIXO: P, config, client } = ctx;
  const server = await ctx.getServer(message).catch(() => null);
  const staff = (config?.acesso?.cargosStaff ?? []).map((id) => server?.roles?.get?.(id)?.name ?? id);
  const staffTxt = staff.length ? staff.map((n) => `**${n}**`).join(", ")
    : T(s.lang, `_(nenhum cargo de staff ainda — \`${P}acesso cargo add @Cargo\`)_`, `_(no staff role yet — \`${P}acesso cargo add @Role\`)_`);

  const ver = s.respostas.canaisVer?.valor ?? [];
  const escrever = s.respostas.canaisEscrever?.valor ?? [];
  const lista = Array.isArray(server?.channels) ? server.channels
    : (server?.channels && typeof server.channels.values === "function") ? [...server.channels.values()] : [];
  const checar = (id, perm) => {
    const canal = lista.find((c) => (c?.id ?? c?._id) === id) ?? client?.channels?.get?.(id);
    if (!canal) return null;
    try { return podeNoCanal(canal, client, perm, server, null); } catch { return null; }
  };
  const marca = (ok) => ok === null ? "❔" : ok ? "✅" : "❌";

  const linhas = [
    T(s.lang, `Cargos de staff hoje: ${staffTxt}`, `Staff roles today: ${staffTxt}`), "",
    T(s.lang, "**🔒 Só a staff vê** — em cada um, *Permissões* do canal:", "**🔒 Staff-only to see** — in each one, the channel's *Permissions*:"),
    T(s.lang, "1. **Padrão** → *Ver canal*: **negar**", "1. **Default** → *View channel*: **deny**"),
    T(s.lang, "2. cada cargo de staff → *Ver canal*: **permitir**", "2. each staff role → *View channel*: **allow**"),
    T(s.lang, "3. cargo do bot → *Ver canal* e *Enviar mensagens*: **permitir**", "3. the bot's role → *View channel* and *Send messages*: **allow**"),
  ];
  if (ver.length) for (const c of ver) linhas.push(`   • #${c.nome} — ${T(s.lang, "bot vê", "bot sees")} ${marca(checar(c.id, "ViewChannel"))} · ${T(s.lang, "escreve", "writes")} ${marca(checar(c.id, "SendMessage"))}`);
  else linhas.push(T(s.lang, "   _(nenhum informado)_", "   _(none given)_"));
  linhas.push("",
    T(s.lang, "**📢 Só a staff escreve** — em cada um:", "**📢 Staff-only to write** — in each one:"),
    T(s.lang, "1. **Padrão** → *Enviar mensagens*: **negar** (deixe *Ver canal* como está)", "1. **Default** → *Send messages*: **deny** (leave *View channel* as is)"),
    T(s.lang, "2. cada cargo de staff → *Enviar mensagens*: **permitir**", "2. each staff role → *Send messages*: **allow**"),
    T(s.lang, "3. cargo do bot → *Enviar mensagens*: **permitir** (para painéis e avisos)", "3. the bot's role → *Send messages*: **allow** (for panels and notices)"),
  );
  if (escrever.length) for (const c of escrever) linhas.push(`   • #${c.nome} — ${T(s.lang, "bot escreve", "bot writes")} ${marca(checar(c.id, "SendMessage"))}`);
  else linhas.push(T(s.lang, "   _(nenhum informado)_", "   _(none given)_"));
  linhas.push("",
    T(s.lang, "**💬 Geral** — os demais: não mexa.", "**💬 General** — the rest: leave them."),
    "",
    T(s.lang, "❌ ao lado de um canal = o bot **não** consegue agir ali hoje. Ajuste e confira com `&debug canais`.",
              "❌ next to a channel = the bot **can't** act there today. Fix it and check with `&debug canais`."),
    T(s.lang, "_(Eu não altero permissões de canal: o Stoat pede que isso seja feito na interface.)_",
              "_(I don't change channel permissions: Stoat wants that done in the UI.)_"),
  );
  sessoes.delete(chaveDe(message));
  return sendEmbed(message.channel, {
    title: T(s.lang, "🔀 Seus canais, tipo a tipo", "🔀 Your channels, type by type"),
    description: linhas.join("\n"), colour: COR.info,
  });
}
