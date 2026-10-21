
import { idiomaDe } from "../core/i18n.js";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import { resolverCanal, resolverCargo } from "../core/ids.js";
import { temCargoStaff } from "./acesso.js";
import { podeNoCanal } from "./permissoes.js";
import { curarIds } from "./pertence.js";

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

// `lang` é o idioma do servidor (idiomaDe: pt | en | es). O espanhol sai pronto;
// sem ele, o servidor em espanhol recebe o inglês, como antes.
const T = (lang, pt, en, es) => (lang === "es" && es !== undefined ? trechoPronto(es) : lang === "en" || lang === "es" ? en : pt);

function listaDeNomes(texto) {
  return String(texto).split(/[,\n;]+|\s+e\s+|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
}

export const PASSOS = {
  idioma: {
    pergunta: (lang, P) => T(lang,
      "🌐 **Idioma** — em que idioma eu respondo neste servidor?\n`1` Português · `2` English",
      "🌐 **Language** — which language should I reply in on this server?\n`1` Português · `2` English",
      "🌐 **Idioma** — ¿en qué idioma respondo en este servidor?\n`1` Português · `2` English · `3` Español"),
    parse: (r, { lang } = {}) => {
      const v = r.toLowerCase();
      if (/^(1|pt|portugu)/.test(v)) return { valor: "pt", rotulo: "Português" };
      if (/^(2|en|engl|ingl)/.test(v)) return { valor: "en", rotulo: "English" };
      // a opção 3 só é oferecida (e aceita) no assistente em espanhol
      if (lang === "es" && /^(3|es|espa|cast)/.test(v)) return { valor: "es", rotulo: "Español" };
      return { erro: true };
    },
    comandos: (v) => [["idioma", v === "en" ? "english" : v === "es" ? "espanol" : "portugues"]],
  },

  staff: {
    pergunta: (lang, P) => T(lang,
      "👥 **Staff** — quais cargos são a equipe? Eles ganham acesso aos comandos de moderação.\nMencione ou escreva os nomes separados por vírgula (ex.: `Admin, Moderador`) — ou `pular`.",
      "👥 **Staff** — which roles are the team? They get access to moderation commands.\nMention them or type the names separated by commas (e.g. `Admin, Moderator`) — or `skip`.",
      "👥 **Staff** — ¿qué roles son el equipo? Tendrán acceso a los comandos de moderación.\nMenciónalos o escribe los nombres separados por comas (ej.: `Admin, Moderador`) — o `skip`."),
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
      "📋 **Logging** — which channel should I write what happened in (punishments, joins, leaves)?\nIdeally a 🔒 staff-only channel. Answer `here`, mention the channel, or `skip`.",
      "📋 **Registro** — ¿en qué canal escribo lo que pasó (sanciones, entradas, salidas)?\nLo ideal es un canal 🔒 que solo vea el staff. Responde `here`, menciona el canal, o `skip`."),
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
        "`3` **Rígido** — + caps, caracteres estranhos, repetição; Sentinela em sensibilidade alta; bane quem já foi banido em 3+ outros servidores (consenso)",
        "",
        "_Dá para ajustar cada filtro depois com `" + citarInterno("automod") + "`._",
      ].join("\n"),
      [
        "🛡️ **Protection** — which level do you want?",
        "`1` **Light** — antispam and anti-invite; warns only",
        "`2` **Medium** — + anti-link, mass mentions and Sentinel (judges scams/NSFW); ladder punishment: warning → mute → ban",
        "`3` **Strict** — + caps, odd characters, repetition; Sentinel at high sensitivity; bans people already banned on 3+ other servers (consensus)",
        "",
        "_Every filter can be tuned later with `" + citarInterno("automod") + "`._",
      ].join("\n"),
      [
        "🛡️ **Protección** — ¿qué nivel quieres?",
        "`1` **Ligero** — antispam y anti-invitación; solo avisa",
        "`2` **Medio** — + anti-link, menciones masivas y Centinela (juzga estafas/+18); sanción en escalera: aviso → silencio → ban",
        "`3` **Estricto** — + mayúsculas, caracteres raros, repetición; Centinela con sensibilidad alta; banea a quien ya fue baneado en 3+ servidores más (consenso)",
        "",
        "_Cada filtro se puede ajustar después con `" + citar("automod", "es", P) + "`._",
      ].join("\n")),
    parse: (r, { lang }) => {
      const v = r.toLowerCase();
      if (/^(1|leve|light)/.test(v)) return { valor: 1, rotulo: T(lang, "Leve", "Light", "Ligero") };
      if (/^(2|medi|medium)/.test(v)) return { valor: 2, rotulo: T(lang, "Médio", "Medium", "Medio") };
      if (/^(3|rigid|rígid|strict)/.test(v)) return { valor: 3, rotulo: T(lang, "Rígido", "Strict", "Estricto") };
      return { erro: true };
    },
    comandos: (v, { config }) => {
      const c = [["automod", "antispam", "on"], ["automod", "antiinvite", "on"]];
      if (v === 1) { c.push(["automod", "punicao", "modo", "avisar"]); return c; }
      c.push(["automod", "antilink", "on"], ["automod", "antimassmention", "on"],
        // as partes, uma a uma: `sentinela on` é o GRUPO, e ligaria também a foto de
        // perfil (que silencia na entrada) — escolha que o assistente não faz por ninguém
        ["automod", "sentinela", "conteudo", "on"], ["automod", "sentinela", "odio", "on"], ["automod", "sentinela", "imagens", "on"],
        ["automod", "sentinela", "antiguidade", "on"], ["automod", "sentinela", "alerta", "on"]);
      if (v === 2) c.push(["automod", "sentinela", "sensitivity", "media"]);
      if (v === 3) c.push(["automod", "anticaps", "on"], ["automod", "anticaracteres", "on"],
        ["automod", "antirepeticao", "on"], ["automod", "sentinela", "sensitivity", "alta"], ["banglobal", "consenso"]);
      c.push(["automod", "punicao", "modo", "acumular"]);
      return c;
    },
  },

  boasvindas: {
    pergunta: (lang, P) => T(lang,
      "👋 **Boas-vindas** — em que canal eu dou as boas-vindas a quem entra?\n`aqui`, mencione o canal, ou `pular`. (O texto você ajusta depois com `" + citarInterno("boasvindas.texto") + " …` — `&help boasvindas` explica cada parâmetro.)",
      "👋 **Welcome** — which channel should I welcome newcomers in?\n`here`, mention the channel, or `skip`. (You tune the text later with `" + citarInterno("boasvindas.texto") + " …` — `&help boasvindas` explains every parameter.)",
      "👋 **Bienvenida** — ¿en qué canal doy la bienvenida a quien entra?\n`here`, menciona el canal, o `skip`. (El texto lo ajustas después con `" + citar("boasvindas.texto", "es", P) + " …` — `" + citar("help", "es", P) + " " + citar("boasvindas", "es", "") + "` explica cada parámetro.)"),
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
      "🪜 **Punishment ladder** (`stack` mode) — the steps, comma-separated.\nDefault: `warn,5m,1h,ban`. Accepts `warn`, durations (`10m`, `2h`, `1d`) and `ban`. Answer `default` to keep it, or `skip`.",
      "🪜 **Escalera de sanciones** (modo `stack`) — los peldaños, separados por comas.\nPor defecto: `warn,5m,1h,ban`. Acepta `warn`, tiempos (`10m`, `2h`, `1d`) y `ban`. Responde `default` para mantenerla, o `skip`."),
    parse: (r) => {
      const v = r.toLowerCase().replace(/\s+/g, "");
      if (/^(padrao|padrão|default)$/.test(v)) return { valor: "aviso,5m,1h,ban", rotulo: "aviso,5m,1h,ban" };
      if (!/^(aviso|warn|warning|\d+[smhd]|ban)(,(aviso|warn|warning|\d+[smhd]|ban))*$/.test(v)) return { erro: true };
      return { valor: v, rotulo: v };
    },
    comandos: (v) => [["automod", "punicao", "escada", v]],
  },

  banglobal: {
    pergunta: (lang, P) => T(lang,
      "🌍 **Lista global** — quando entra alguém que já foi banido em outro servidor que uso:\n`1` ignorar · `2` avisar no log · `3` banir se foi banido em **3+ servidores** (consenso) · `4` banir com **um** ban (imediato)",
      "🌍 **Global list** — when someone banned on another server I'm in joins:\n`1` ignore · `2` warn in the log · `3` ban if banned on **3+ servers** (consensus) · `4` ban on **one** ban (instant)",
      "🌍 **Lista global** — cuando entra alguien que ya fue baneado en otro servidor donde estoy:\n`1` ignorar · `2` avisar en el registro · `3` banear si fue baneado en **3+ servidores** (consenso) · `4` banear con **un** solo ban (inmediato)"),
    parse: (r, { lang }) => {
      const v = r.toLowerCase();
      if (/^(1|ignor|off)/.test(v)) return { valor: "off", rotulo: T(lang, "ignorar", "ignore", "ignorar") };
      if (/^(2|avis|warn)/.test(v)) return { valor: "avisar", rotulo: T(lang, "avisar", "warn", "avisar") };
      if (/^(3|cons)/.test(v)) return { valor: "consenso", rotulo: T(lang, "consenso (3+ servidores)", "consensus (3+ servers)", "consenso (3+ servidores)") };
      if (/^(4|imed|inst|ban)/.test(v)) return { valor: "imediato", rotulo: T(lang, "imediato", "instant", "inmediato") };
      return { erro: true };
    },
    comandos: (v) => [["banglobal", v]],
  },

  xp: {
    pergunta: (lang, P) => T(lang,
      "🎮 **Níveis por XP** — ligar o sistema de níveis por mensagem? `sim` / `nao`\n(Depois: `" + citarInterno("xp.setup") + "` escolhe cargos por nível e o canal de anúncio.)",
      "🎮 **XP levels** — turn on the message-based leveling system? `yes` / `no`\n(Later: `" + citarInterno("xp.setup") + "` picks level roles and the announcement channel.)",
      "🎮 **Niveles por XP** — ¿activo el sistema de niveles por mensaje? `yes` / `no`\n(Después: `" + citar("xp.setup", "es", P) + "` elige roles por nivel y el canal de anuncios.)"),
    parse: (r, { lang }) => {
      const v = r.toLowerCase();
      if (/^(s|y|on|1)/.test(v)) return { valor: "on", rotulo: T(lang, "ligado", "on", "activado") };
      if (/^(n|off|0)/.test(v)) return { valor: "off", rotulo: T(lang, "desligado", "off", "desactivado") };
      return { erro: true };
    },
    comandos: (v) => [["xp", v]],
  },

  autorole: {
    pergunta: (lang, P) => T(lang,
      "🎭 **Cargo automático** — que cargo quem entra recebe na hora? Mencione ou escreva o nome — ou `pular`.",
      "🎭 **Autorole** — which role does everyone get on join? Mention it or type the name — or `skip`.",
      "🎭 **Rol automático** — ¿qué rol recibe al momento quien entra? Menciónalo o escribe el nombre — o `skip`."),
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
      "🔒 **Staff-only to see** — which channels are backstage (log, alerts, staff-chat)?\nMention them or type the names separated by commas — or `skip`.",
      "🔒 **Solo el staff ve** — ¿qué canales son de bastidores (registro, alertas, chat del staff)?\nMenciónalos o escribe los nombres separados por comas — o `skip`."),
    parse: (r, { message, server }) => resolverCanais(r, message, server),
    comandos: () => [],
  },
  canaisEscrever: {
    pergunta: (lang, P) => T(lang,
      "📢 **Só a staff escreve** — quais canais todo mundo lê mas só a staff publica (regras, avisos, painéis)?\nMencione ou escreva os nomes — ou `pular`.",
      "📢 **Staff-only to write** — which channels does everyone read but only staff posts in (rules, announcements, panels)?\nMention them or type the names — or `skip`.",
      "📢 **Solo el staff escribe** — ¿qué canales lee todo el mundo pero solo el staff publica (reglas, avisos, paneles)?\nMenciónalos o escribe los nombres — o `skip`."),
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

export const ROTEIROS = {
  // O silêncio é o timeout nativo: não há passo de cargo — o resumo final
  // confere se o bot tem TimeoutMembers.
  rapido:   ["idioma", "staff", "log", "protecao", "boasvindas"],
  completo: ["idioma", "staff", "log", "protecao", "escada", "banglobal", "boasvindas", "autorole", "xp"],
  protecao: ["protecao", "escada", "banglobal", "log"],
  canais:   ["canaisVer", "canaisEscrever"],
};

const NOME_ROTEIRO = {
  rapido:   { pt: "Rápido",   en: "Quick",      es: "Rápido" },
  completo: { pt: "Completo", en: "Full",       es: "Completo" },
  protecao: { pt: "Proteção", en: "Protection", es: "Protección" },
  canais:   { pt: "Canais",   en: "Channels",   es: "Canales" },
};

export async function cmdAssistente(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config } = ctx;
  // IDs herdados de outro servidor (molde antigo) saem antes das perguntas:
  // senão um passo é pulado por um cargo ou canal que nem existe aqui.
  try { const srv = await ctx.getServer?.(message); if (curarIds(config, srv).length) ctx.salvarConfig?.(); } catch {}
  const lang = idiomaDe(ctx);
  const pedido = (args[0] ?? "").toLowerCase();
  const chave = chaveDe(message);

  if (["cancelar", "cancel", "parar", "stop", "sair"].includes(pedido)) {
    const havia = sessoes.delete(chave);
    return sendEmbed(message.channel, {
      title: T(lang, "🧙 Assistente", "🧙 Wizard", "🧙 Asistente"),
      description: havia
        ? T(lang, "Cancelado. Nada foi alterado.", "Cancelled. Nothing was changed.", "Cancelado. No se cambió nada.")
        : T(lang, "Não havia assistente em andamento para você aqui.", "There was no wizard running for you here.", "No había ningún asistente en curso para ti aquí."),
      colour: COR.info,
    });
  }

  const server = await ctx.getServer(message).catch(() => null);
  const pode = ctx.ehSuperAdmin?.(message.authorId)
    || temCargoStaff(message, config)
    || ctx.membroTemPermissao(message, server, "ManagePermissions");
  if (!pode) {
    return sendEmbed(message.channel, {
      title: T(lang, "🚫 Permissão insuficiente", "🚫 Missing permission", "🚫 Permiso insuficiente"),
      description: T(lang,
        "O assistente mexe na configuração do servidor: precisa de **ManagePermissions** ou de um cargo de staff.",
        "The wizard changes the server's configuration: it needs **ManagePermissions** or a staff role.",
        "El asistente cambia la configuración del servidor: necesita **ManagePermissions** o un rol de staff."),
      colour: COR.erro,
    });
  }

  const roteiro = ROTEIROS[pedido] ? pedido : null;
  if (!roteiro) {
    return sendEmbed(message.channel, {
      title: T(lang, "🧙 Assistente de configuração", "🧙 Setup wizard", "🧙 Asistente de configuración"),
      description: [
        T(lang, "Eu pergunto, você responde em texto normal, e no fim mostro o resumo antes de aplicar qualquer coisa.",
                "I ask, you answer in plain text, and at the end I show a summary before applying anything.",
                "Yo pregunto, tú respondes en texto normal, y al final te muestro el resumen antes de aplicar nada."),
        "",
        `⚡ \`${T(lang, citarInterno("assistente.rapido", P), citarInterno("assistente.rapido", P), citar("assistente.rapido", "es", P))}\` — ${T(lang, "idioma, staff, log, proteção, boas-vindas (5 perguntas)", "language, staff, log, protection, welcome (5 questions)", "idioma, staff, registro, protección, bienvenida (5 preguntas)")}`,
        `🧰 \`${T(lang, citarInterno("assistente.completo", P), citarInterno("assistente.completo", P), citar("assistente.completo", "es", P))}\` — ${T(lang, "o rápido + escada, lista global, cargo automático, XP", "quick + ladder, global list, autorole, XP", "el rápido + escalera, lista global, rol automático, XP")}`,
        `🔀 \`${T(lang, citarInterno("assistente.canais", P), citarInterno("assistente.canais", P), citar("assistente.canais", "es", P))}\` — ${T(lang, "classifica seus canais nos 3 tipos e diz o que clicar", "sorts your channels into the 3 types and tells you what to click", "clasifica tus canales en los 3 tipos y te dice qué pulsar")}`,
        `🛡️ \`${T(lang, citarInterno("assistente.protecao", P), citarInterno("assistente.protecao", P), citar("assistente.protecao", "es", P))}\` — ${T(lang, "só automod, Sentinela e punição", "only automod, Sentinel and punishment", "solo automod, Centinela y sanciones")}`,
        "",
        T(lang, "Durante as perguntas: `pular` pula · `voltar` volta · `cancelar` desiste.",
                "During the questions: `skip` skips · `back` goes back · `cancel` quits.",
                "Durante las preguntas: `skip` salta · `back` vuelve · `cancel` abandona."),
        T(lang, `Prefere só ler? \`${citarInterno("tutorial", P)}\`.`, `Rather just read? \`${citarInterno("tutorial", P)}\`.`, `¿Prefieres solo leer? \`${citar("tutorial", "es", P)}\`.`),
      ].join("\n"),
      colour: COR.info,
    });
  }

  sessoes.set(chave, {
    roteiro, passo: 0, respostas: {}, expira: Date.now() + TTL_MS,
    serverId: ctx.serverId, lang, fase: "perguntas",
  });
  await sendEmbed(message.channel, {
    title: T(lang, `🧙 Assistente — ${NOME_ROTEIRO[roteiro].pt}`, `🧙 Wizard — ${NOME_ROTEIRO[roteiro].en}`, `🧙 Asistente — ${NOME_ROTEIRO[roteiro].es}`),
    description: T(lang,
      `${ROTEIROS[roteiro].length} pergunta(s). Responda aqui mesmo, sem prefixo. \`pular\` · \`voltar\` · \`cancelar\`.`,
      `${ROTEIROS[roteiro].length} question(s). Answer right here, no prefix. \`skip\` · \`back\` · \`cancel\`.`,
      `${ROTEIROS[roteiro].length} pregunta(s). Responde aquí mismo, sin prefijo. \`skip\` · \`back\` · \`cancel\`.`),
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
    title: T(s.lang, `❓ Pergunta ${s.passo + 1}/${ids.length}`, `❓ Question ${s.passo + 1}/${ids.length}`, `❓ Pregunta ${s.passo + 1}/${ids.length}`),
    description: passo.pergunta(s.lang, P),
    colour: COR.info,
  });
}

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
    await sendEmbed(message.channel, { title: "🧙", description: T(s.lang, "Cancelado. Nada foi alterado.", "Cancelled. Nothing was changed.", "Cancelado. No se cambió nada."), colour: COR.info });
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
      "Answer `confirm` to apply, `back` to change the last answer, or `cancel`.",
      "Responde `confirm` para aplicar, `back` para cambiar la última respuesta, o `cancel`."), colour: COR.aviso });
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
      title: T(s.lang, "🤔 Não entendi", "🤔 I didn't get that", "🤔 No lo entendí"),
      description: (r.detalhe
        ? T(s.lang, `Não encontrei: \`${r.detalhe}\`.\n\n`, `Couldn't find: \`${r.detalhe}\`.\n\n`, `No encontré: \`${r.detalhe}\`.\n\n`) : "")
        + T(s.lang, "Tente de novo, ou `pular`.", "Try again, or `skip`.", "Inténtalo de nuevo, o `skip`.")
        + "\n\n" + passo.pergunta(s.lang, ctx.PREFIXO),
      colour: COR.aviso,
    });
    return true;
  }
  s.respostas[ids[s.passo]] = r;
  if (r.aviso?.length) {
    await sendEmbed(message.channel, { title: "⚠️", description: T(s.lang,
      `Não encontrei: \`${r.aviso.join("`, `")}\` — segui com o resto.`,
      `Couldn't find: \`${r.aviso.join("`, `")}\` — went on with the rest.`,
      `No encontré: \`${r.aviso.join("`, `")}\` — seguí con el resto.`), colour: COR.aviso });
  }
  s.passo++;
  await perguntar(message, ctx, s);
  return true;
}

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
    const rot = (!r || r.valor === null) ? T(s.lang, "_(pulado)_", "_(skipped)_", "_(saltado)_") : r.rotulo;
    linhas.push(`• **${id}** — ${rot}`);
  }
  const cmds = comandosDe(s, ctx);
  linhas.push("", T(s.lang, "**Vou rodar:**", "**I'll run:**", "**Voy a ejecutar:**"));
  for (const c of cmds) linhas.push(`\`${P}${c.args.join(" ")}\``);
  if (!cmds.length) linhas.push(T(s.lang, "_(nada — tudo foi pulado)_", "_(nothing — everything was skipped)_", "_(nada — se saltó todo)_"));
  linhas.push("", T(s.lang, "Responda `confirmar` para aplicar, `voltar` para mudar a última, `cancelar` para desistir.",
                         "Answer `confirm` to apply, `back` to change the last one, `cancel` to quit.",
                         "Responde `confirm` para aplicar, `back` para cambiar la última, `cancel` para abandonar."));
  s.fase = "confirmar";
  return sendEmbed(message.channel, {
    title: T(s.lang, "📝 Resumo — confirma?", "📝 Summary — confirm?", "📝 Resumen — ¿confirmas?"),
    description: linhas.join("\n"), colour: COR.aviso,
  });
}

async function aplicar(message, ctx, s) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  const rotas = ctx.estado?.rotas ?? {};
  const cmds = comandosDe(s, ctx);
  const resultado = [];

  for (const { args } of cmds) {
    const [nome, ...resto] = args;
    const handler = rotas[nome];
    if (!handler) { resultado.push({ args, ok: false, msg: T(s.lang, "comando não encontrado", "command not found", "comando no encontrado") }); continue; }
    const capturadas = [];
    const ctxMudo = { ...ctx, sendEmbed: async (_c, e) => { capturadas.push(e); return { id: "capturada" }; } };
    ctxMudo.config = ctx.configDoServidor?.(ctx.serverId) ?? ctx.config;
    try {
      await handler(message, resto, ctxMudo);
      const ult = capturadas[capturadas.length - 1];
      const falhou = ult && /^(❌|🚫)/.test(String(ult.title ?? ""));
      // ⚠️ = aplicou, mas com pendência: não pode aparecer como ✅ limpo.
      const pendente = !falhou && ult && /^⚠️/.test(String(ult.title ?? ""));
      resultado.push({ args, ok: !falhou, pendente, msg: ult ? String(ult.title ?? "").replace(/^[^\w\p{L}]+/u, "") : "" });
    } catch (e) {
      resultado.push({ args, ok: false, msg: e?.message ?? String(e) });
    }
  }

  const okN = resultado.filter((r) => r.ok).length;
  const linhas = resultado.map((r) => `${!r.ok ? "❌" : r.pendente ? "⚠️" : "✅"} \`${P}${r.args.join(" ")}\`${!r.ok || r.pendente ? ` — ${r.msg}` : ""}`);
  linhas.push("", T(s.lang,
    `${okN}/${resultado.length} aplicado(s). \`${citar("config", "pt", P)}\` mostra como ficou; \`${citarInterno("debug", P)}\` confere se o bot consegue agir em cada canal.`,
    `${okN}/${resultado.length} applied. \`${citar("config", "en", P)}\` shows the result; \`${citarInterno("debug", P)}\` checks whether the bot can act in each channel.`,
    `${okN}/${resultado.length} aplicado(s). \`${citar("config", "es", P)}\` muestra cómo quedó; \`${citar("debug", "es", P)}\` comprueba si el bot puede actuar en cada canal.`));
  // O silêncio (mute da escada, modo confirmar, &silenciar) é o timeout
  // nativo: sem TimeoutMembers, toda punição de silêncio vira quarentena.
  try {
    const srv = await ctx.getServer?.(message);
    if (srv && typeof srv.havePermission === "function" && !srv.havePermission("TimeoutMembers")) {
      linhas.push("", T(s.lang,
        "⚠️ O cargo do bot não tem **TimeoutMembers** — sem ela o silêncio da escada e do modo `confirmar` não funciona (a pessoa cai na quarentena). Dê essa permissão ao cargo do bot.",
        "⚠️ The bot's role lacks **TimeoutMembers** — without it the ladder's and `confirm` mode's silence doesn't work (the person falls into quarantine). Give the bot's role that permission.",
        "⚠️ El rol del bot no tiene **TimeoutMembers** — sin ella el silencio de la escalera y del modo `confirm` no funciona (la persona cae en la cuarentena). Dale ese permiso al rol del bot."));
    }
  } catch {}
  if (okN < resultado.length) linhas.push(T(s.lang,
    "Para os que falharam, rode o comando na mão para ver a explicação completa.",
    "For the ones that failed, run the command by hand to see the full explanation.",
    "Para los que fallaron, ejecuta el comando a mano para ver la explicación completa."));
  const resumo = await sendEmbed(message.channel, {
    title: T(s.lang, "🧙 Pronto", "🧙 Done", "🧙 Listo"),
    description: linhas.join("\n"),
    colour: okN === resultado.length ? COR.sucesso : COR.aviso,
  });
  return resumo;
}

async function guiaDeCanais(message, ctx, s) {
  const { sendEmbed, COR, PREFIXO: P, config, client } = ctx;
  const server = await ctx.getServer(message).catch(() => null);
  const staff = (config?.acesso?.cargosStaff ?? []).map((id) => server?.roles?.get?.(id)?.name ?? id);
  const staffTxt = staff.length ? staff.map((n) => `**${n}**`).join(", ")
    : T(s.lang, `_(nenhum cargo de staff ainda — \`${citarInterno("acesso.cargo.add", P)} @Cargo\`)_`, `_(no staff role yet — \`${citarInterno("acesso.cargo.add", P)} @Role\`)_`, `_(todavía no hay rol de staff — \`${citar("acesso.cargo.add", "es", P)} @Rol\`)_`);

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
    T(s.lang, `Cargos de staff hoje: ${staffTxt}`, `Staff roles today: ${staffTxt}`, `Roles de staff hoy: ${staffTxt}`), "",
    T(s.lang, "**🔒 Só a staff vê** — em cada um, *Permissões* do canal:", "**🔒 Staff-only to see** — in each one, the channel's *Permissions*:", "**🔒 Solo el staff ve** — en cada uno, *Permisos* del canal:"),
    T(s.lang, "1. **Padrão** → *Ver canal*: **negar**", "1. **Default** → *View channel*: **deny**", "1. **Por defecto** → *Ver canal*: **denegar**"),
    T(s.lang, "2. cada cargo de staff → *Ver canal*: **permitir**", "2. each staff role → *View channel*: **allow**", "2. cada rol de staff → *Ver canal*: **permitir**"),
    T(s.lang, "3. cargo do bot → *Ver canal* e *Enviar mensagens*: **permitir**", "3. the bot's role → *View channel* and *Send messages*: **allow**", "3. rol del bot → *Ver canal* y *Enviar mensajes*: **permitir**"),
  ];
  if (ver.length) for (const c of ver) linhas.push(`   • #${c.nome} — ${T(s.lang, "bot vê", "bot sees", "el bot ve")} ${marca(checar(c.id, "ViewChannel"))} · ${T(s.lang, "escreve", "writes", "escribe")} ${marca(checar(c.id, "SendMessage"))}`);
  else linhas.push(T(s.lang, "   _(nenhum informado)_", "   _(none given)_", "   _(ninguno indicado)_"));
  linhas.push("",
    T(s.lang, "**📢 Só a staff escreve** — em cada um:", "**📢 Staff-only to write** — in each one:", "**📢 Solo el staff escribe** — en cada uno:"),
    T(s.lang, "1. **Padrão** → *Enviar mensagens*: **negar** (deixe *Ver canal* como está)", "1. **Default** → *Send messages*: **deny** (leave *View channel* as is)", "1. **Por defecto** → *Enviar mensajes*: **denegar** (deja *Ver canal* como está)"),
    T(s.lang, "2. cada cargo de staff → *Enviar mensagens*: **permitir**", "2. each staff role → *Send messages*: **allow**", "2. cada rol de staff → *Enviar mensajes*: **permitir**"),
    T(s.lang, "3. cargo do bot → *Enviar mensagens*: **permitir** (para painéis e avisos)", "3. the bot's role → *Send messages*: **allow** (for panels and notices)", "3. rol del bot → *Enviar mensajes*: **permitir** (para paneles y avisos)"),
  );
  if (escrever.length) for (const c of escrever) linhas.push(`   • #${c.nome} — ${T(s.lang, "bot escreve", "bot writes", "el bot escribe")} ${marca(checar(c.id, "SendMessage"))}`);
  else linhas.push(T(s.lang, "   _(nenhum informado)_", "   _(none given)_", "   _(ninguno indicado)_"));
  linhas.push("",
    T(s.lang, "**💬 Geral** — os demais: não mexa.", "**💬 General** — the rest: leave them.", "**💬 General** — los demás: no los toques."),
    "",
    T(s.lang, "❌ ao lado de um canal = o bot **não** consegue agir ali hoje. Ajuste e confira com `" + citarInterno("debug") + "`.",
              "❌ next to a channel = the bot **can't** act there today. Fix it and check with `" + citarInterno("debug") + "`.",
              "❌ al lado de un canal = el bot **no** puede actuar ahí hoy. Ajústalo y compruébalo con `" + citar("debug", "es", P) + "`."),
    T(s.lang, "_(Eu não altero permissões de canal: o Stoat pede que isso seja feito na interface.)_",
              "_(I don't change channel permissions: Stoat wants that done in the UI.)_",
              "_(No cambio permisos de canal: Stoat pide que eso se haga en la interfaz.)_"),
  );
  sessoes.delete(chaveDe(message));
  return sendEmbed(message.channel, {
    title: T(s.lang, "🔀 Seus canais, tipo a tipo", "🔀 Your channels, type by type", "🔀 Tus canales, tipo por tipo"),
    description: linhas.join("\n"), colour: COR.info,
  });
}
