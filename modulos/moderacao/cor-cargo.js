import { limparId, ULID } from "../core/ids.js";
import * as db from "../core/db.js";
import { CORES as NOMES, normalizarCor as corSolida, nomesDeCor } from "../core/cores.js";
import { tr, lingua } from "../core/i18n.js";
import { chamarApi } from "../core/stoat-api.js";
import { canalDeOutroServidor } from "./pertence.js";

// Gradientes prontos — o atalho para o efeito bonito sem montar nada.
export const PRESETS = {
  "arco-iris":  "linear-gradient(90deg, #FF0018 0%, #FFA52C 17%, #FFFF41 33%, #008018 50%, #0000F9 67%, #86007D 100%)",
  fogo:         "linear-gradient(90deg, #FF0000 0%, #FF7A00 50%, #FFD600 100%)",
  oceano:       "linear-gradient(90deg, #0EA5E9 0%, #2563EB 50%, #1E1B4B 100%)",
  neon:         "linear-gradient(90deg, #00F0FF 0%, #FF00E5 50%, #FFE600 100%)",
  vaporwave:    "linear-gradient(90deg, #FF71CE 0%, #01CDFE 50%, #05FFA1 100%)",
  poente:       "linear-gradient(90deg, #FF512F 0%, #F09819 100%)",
  floresta:     "linear-gradient(90deg, #134E5E 0%, #71B280 100%)",
  ouro:         "linear-gradient(90deg, #BF953F 0%, #FCF6BA 45%, #B38728 100%)",
  cyberpunk:    "linear-gradient(90deg, #F8EF00 0%, #FF00A0 50%, #00E0FF 100%)",
  sangue:       "linear-gradient(90deg, #7F0000 0%, #FF0000 60%, #FF6A6A 100%)",
  gelo:         "linear-gradient(90deg, #E0F7FF 0%, #7DD3FC 50%, #0369A1 100%)",
  trans:        "linear-gradient(90deg, #5BCEFA 0%, #F5A9B8 33%, #FFFFFF 50%, #F5A9B8 67%, #5BCEFA 100%)",
};

const EMOJI_PRESET = {
  "arco-iris": "🏳️‍🌈", fogo: "🔥", oceano: "🌊", neon: "🚨", vaporwave: "🚬",
  poente: "🌅", floresta: "🌳", ouro: "🥇", cyberpunk: "🌆", sangue: "🩸",
  gelo: "🧊", trans: "🏳️‍⚧️",
};

// Os nomes em inglês (16 out 2026, o bot ficou global): a entrada aceita os
// dois, e a tela em inglês mostra o inglês. A chave interna segue em
// português (os cargos antigos se chamam assim).
const PRESET_EN = {
  rainbow: "arco-iris", fire: "fogo", ocean: "oceano", neon: "neon", vaporwave: "vaporwave",
  sunset: "poente", forest: "floresta", gold: "ouro", cyberpunk: "cyberpunk", blood: "sangue",
  ice: "gelo", trans: "trans",
};
const EN_DO_PRESET = Object.fromEntries(Object.entries(PRESET_EN).map(([en, pt]) => [pt, en]));
export const presetDe = (t) => { const k = String(t ?? "").toLowerCase(); return PRESETS[k] ? k : PRESET_EN[k] ?? null; };
export const nomePreset = (k, en) => (en ? EN_DO_PRESET[k] ?? k : k);
const listaPresets = (en) => Object.keys(PRESETS).map((k) => `\`${nomePreset(k, en)}\``).join(", ");

function montarGradiente(cores, angulo = 90) {
  const paradas = cores.map((c, i) => {
    const pct = cores.length === 1 ? 0 : Math.round((i / (cores.length - 1)) * 100);
    return `${c} ${pct}%`;
  });
  return `linear-gradient(${angulo}deg, ${paradas.join(", ")})`;
}

// ── O que o Stoat aceita como cor de cargo (16 out 2026) ────────────────────
// Cópia do RE_COLOUR do stoatchat (crates/core/models/src/v0/server_members.rs):
// cor = nome, var(--x), rgb()/rgba() ou hex; gradiente = linear/radial/conic
// (ou repeating-) colado no "(", ângulo SÓ como `224deg`, paradas SÓ em %
// inteiro (ou 0), até 128 caracteres. Fora disso a API devolve 400
// "FailedValidation" — o caso de 16 out: `linear-gradient (224 deg, …)`.
const V_COR = String.raw`(?:[a-z ]+|var\(--[a-z\d-]+\)|rgba?\([\d, ]+\)|#[a-f0-9]+)`;
const PARADA = String.raw`(?:[ ]+(?:\d{1,3}%|0))?`;
const RE_COR_STOAT = new RegExp(String.raw`^(?:${V_COR}|(?:repeating-)?(?:linear|conic|radial)-gradient\((?:${V_COR}|\d+deg)(?:[ ]+in[ ]+[a-z-]+(?:[ ]+(?:shorter|longer|increasing|decreasing)[ ]+hue)?)?${PARADA}(?:,[ ]*${V_COR}${PARADA})+\))$`, "i");
export const corAceitaPeloStoat = (v) => typeof v === "string" && v.length >= 1 && v.length <= 128 && RE_COR_STOAT.test(v);

// Conserta a escrita "quase certa" antes de mandar: espaço antes do "(",
// "224 deg", "45°", espaço antes da vírgula, % com casa decimal, a declaração
// CSS inteira colada (`background: …;`) e o `gradient(` sem o `linear-`.
export function arrumarCss(txt) {
  let t = String(txt ?? "").trim().replace(/\s+/g, " ")
    .replace(/^background(?:-image)?\s*:\s*/i, "").replace(/\s*;\s*$/, "");
  t = t.replace(/^gradient\s*\(/i, "linear-gradient(");
  t = t.replace(/((?:repeating-)?(?:linear|radial|conic)-gradient)\s+\(/gi, "$1(");
  t = t.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:deg\b|°|graus?\b|degrees?\b)/gi, (m, n) => `${Math.round(Number(n))}deg`);
  t = t.replace(/(\d+\.\d+)\s*%/g, (m, n) => `${Math.round(Number(n))}%`).replace(/(\d+)\s+%/g, "$1%");
  t = t.replace(/\s+,/g, ",").replace(/,(?=\S)/g, ", ");
  return t;
}

// O que está errado num gradiente que nem arrumado o Stoat aceita.
function motivoDoGradiente(t, en) {
  const M = [];
  if (t.length > 128) M.push(en ? `it has ${t.length} characters — Stoat takes at most **128**` : `tem ${t.length} caracteres — o Stoat aceita no máximo **128**`);
  if (/hsla?\(|oklch\(|lab\(|hwb\(/i.test(t)) M.push(en ? "`hsl()`/`oklch()` colors aren't accepted — use hex (`#73E696`) or `rgb()`" : "cores `hsl()`/`oklch()` não são aceitas — use hex (`#73E696`) ou `rgb()`");
  if (/\d+(?:px|em|rem|turn|rad|grad)\b/i.test(t)) M.push(en ? "stops and angles only in `%` and `deg`" : "paradas e ângulos só em `%` e `deg`");
  if (!t.includes(")")) M.push(en ? "the closing `)` is missing" : "faltou fechar o `)`");
  if ((t.match(/,/g) ?? []).length < 1) M.push(en ? "a gradient needs at least two colors" : "um gradiente precisa de pelo menos duas cores");
  return M;
}

function validarCss(txt, en = false) {
  const t = arrumarCss(txt);
  if (/^(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i.test(t)) {
    if (corAceitaPeloStoat(t)) return { valor: t, arrumado: t !== String(txt ?? "").trim() };
    const motivos = motivoDoGradiente(t, en);
    const ex = "linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)";
    return { erro: [
      en ? "Stoat won't accept this gradient as written." : "O Stoat não aceita esse gradiente como está escrito.",
      ...motivos.map((m) => `• ${m}`),
      "",
      en ? "**What it accepts:** colors in hex/`rgb()`/name, angle as `224deg`, stops as whole `%`, nothing between `gradient` and `(`. E.g.:"
         : "**O que ele aceita:** cores em hex/`rgb()`/nome, ângulo como `224deg`, paradas em `%` inteiro, nada entre `gradient` e `(`. Ex.:",
      "`" + ex + "`",
    ].join("\n") };
  }
  const solida = corSolida(t);
  if (solida) return { valor: solida };
  return null;   // não reconhecido: quem chamou decide o que fazer
}

// ── Qual cargo? (16 out 2026) ──────────────────────────────────────────────
// Antes era SÓ a primeira palavra, com busca parcial: "&color Le Gooby …"
// achava "Le" e mandava "Gooby linear-gradient…" como cor; "&color role …"
// (a palavra do exemplo) caía num cargo qualquer que contivesse "role".
// Agora o cargo é tudo até a primeira palavra que COMEÇA uma cor (#, rgb,
// gradient, preset, remove, nome de cor/preset); vale menção, ID ou o nome
// exato — e a busca parcial só quando há UM cargo que serve.
const INICIO_DA_COR = /^(?:#|rgba?\(|var\(|(?:repeating-)?(?:linear|radial|conic)-gradient|gradient\(|background|gradiente$|gradient$|grad$|preset$|pronto$|remover$|remove$|limpar$|padr[aã]o$|reset$)/i;
const ehInicioDaCor = (tok) => INICIO_DA_COR.test(tok) || !!corSolida(tok) || !!presetDe(tok);
const PALAVRA_DO_EXEMPLO = /^[<‹\[]?(?:role|cargo|rolename|role-name|nome|name|nome-do-cargo)[>›\]]?$/i;

function cargosDe(server) {
  return server.roles ? [...server.roles.entries()].map(([id, r]) => ({ id, nome: r?.name ?? id })) : [];
}
function cargoExato(server, alvo) {
  const t = String(alvo ?? "").trim();
  if (!t) return null;
  const limpo = limparId(t);
  if (ULID.test(limpo) && (/^<%|^<@&/.test(t) || /^[0-9A-Z]{26}$/i.test(t))) {
    const r = server.roles?.get?.(limpo);
    return { id: limpo, nome: r?.name ?? limpo };
  }
  const busca = t.replace(/^@/, "").toLowerCase();
  return cargosDe(server).find((c) => c.nome.toLowerCase() === busca) ?? null;
}
function cargoParcial(server, alvo) {
  const busca = String(alvo ?? "").trim().replace(/^@/, "").toLowerCase();
  if (busca.length < 3) return { lista: [] };
  return { lista: cargosDe(server).filter((c) => c.nome.toLowerCase().includes(busca)) };
}
export function separarCargoECor(server, args) {
  const pontos = [];
  for (let i = 1; i < args.length; i++) if (ehInicioDaCor(args[i])) pontos.push(i);
  if (!pontos.length) pontos.push(Math.min(1, args.length));
  for (const i of pontos) {
    const c = cargoExato(server, args.slice(0, i).join(" "));
    if (c) return { cargo: c, resto: args.slice(i), alvo: args.slice(0, i).join(" ") };
  }
  const alvo = args.slice(0, pontos[0]).join(" ");
  if (PALAVRA_DO_EXEMPLO.test(alvo)) return { cargo: null, exemplo: true, alvo, resto: args.slice(pontos[0]) };
  for (const i of pontos) {
    const { lista } = cargoParcial(server, args.slice(0, i).join(" "));
    if (lista.length === 1) return { cargo: lista[0], resto: args.slice(i), alvo: args.slice(0, i).join(" ") };
    if (lista.length > 1) return { cargo: null, ambiguos: lista.slice(0, 8), alvo: args.slice(0, i).join(" "), resto: args.slice(i) };
  }
  return { cargo: null, alvo, resto: args.slice(pontos[0]) };
}

async function aplicarCor(serverId, roleId, colour, en = false) {
  if (!process.env.BOT_TOKEN) return { ok: false, erro: en ? "BOT_TOKEN isn't set in the bot's environment." : "BOT_TOKEN não está definido no ambiente do bot." };

  const r = await chamarApi(`/servers/${serverId}/roles/${roleId}`, {
    metodo: "PATCH",
    corpo: colour === null ? { remove: ["Colour"] } : { colour },
    ms: 15_000,
  });
  if (r.ok) return { ok: true };
  if (r.erro) return { ok: false, erro: en ? `I couldn't reach the API: ${r.erro}` : `Não consegui falar com a API: ${r.erro}` };

  const dica = en
    ? (r.status === 403 ? " — the bot's role needs **ManageRole** and must sit **above** the role it's editing."
      : r.status === 400 ? " — Stoat rejected the color value (accepted: hex/`rgb()`/name, or `linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — angle in `deg`, whole `%`, up to 128 characters)."
      : r.status === 404 ? " — role or server not found."
      : "")
    : (r.status === 403 ? " — o cargo do bot precisa de **ManageRole** e estar **acima** do cargo que está editando."
      : r.status === 400 ? " — o Stoat recusou o valor da cor (aceita: hex/`rgb()`/nome, ou `linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — ângulo em `deg`, `%` inteiro, até 128 caracteres)."
      : r.status === 404 ? " — cargo ou servidor não encontrado."
      : "");
  return { ok: false, erro: `${en ? "The API answered" : "API respondeu"} ${r.status}${dica}${r.texto ? `\n\`\`\`\n${r.texto.slice(0, 300)}\n\`\`\`` : ""}` };
}

export async function cmdCor(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, getServer, membroTemPermissao, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";

  const server = await getServer(message);
  if (!server) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Fora de um servidor", description: "Este comando só funciona dentro de um servidor.", colour: COR.erro },
      { title: "❌ Outside a server", description: "This command only works inside a server.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();

  // ── Ajuda ──
  if (!sub || sub === "ajuda" || sub === "help") {
    return sendEmbed(message.channel, en ? {
      title: "🎨 Role colors",
      description: [
        "**Solid color**",
        `\`${P}cor <role> #FF00AA\` · \`${P}cor <role> purple\``,
        "",
        "**Gradient** (2 or more colors)",
        `\`${P}cor <role> gradiente #FF0000 #00FF00 #0000FF\``,
        `\`${P}cor <role> gradiente 45 red blue\` — the leading number is the angle`,
        "",
        "**Automatic — does everything for you**",
        `\`${P}cor painel aqui\` — creates the roles, posts the picker message, reacts and wires the reaction roles`,
        `\`${P}cor painel <channel-id>\` — posts the panel in another channel`,
        `\`${P}cor criar\` — only creates/paints the roles, posts nothing`,
        `\`${P}cor painel aqui fire ice neon\` — only the chosen colors`,
        "",
        "**Presets**",
        `\`${P}cor <role> preset <name>\` — ${listaPresets(true)}`,
        "",
        "**Raw CSS**",
        `\`${P}cor <role> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)\``,
        "_Stoat's rules: angle as `224deg`, stops as whole `%`, colors in hex/`rgb()`, up to 128 characters. I fix spaces like `linear-gradient (224 deg, …)` myself._",
        "",
        "**Others**",
        `\`${P}cor <role> remover\` — back to the default color`,
        `\`${P}cor lista\` — roles and their current colors`,
        `\`${P}cor presets\` — see the ready-made gradients`,
        "",
        "_The role: a **mention** (`@Role`), its **exact name** — spaces are fine: `&color Le Gooby #FF00AA` — or its ID (`&tutorial ids`)._",
      ].join("\n"),
      colour: COR.info,
    } : {
      title: "🎨 Cor dos cargos",
      description: [
        "**Cor sólida**",
        `\`${P}cor <cargo> #FF00AA\` · \`${P}cor <cargo> roxo\``,
        "",
        "**Gradiente** (2 ou mais cores)",
        `\`${P}cor <cargo> gradiente #FF0000 #00FF00 #0000FF\``,
        `\`${P}cor <cargo> gradiente 45 vermelho azul\` — o número no início é o ângulo`,
        "",
        "**Automático — faz tudo sozinho**",
        `\`${P}cor painel aqui\` — cria os cargos, publica a mensagem de escolha, reage e liga os cargos por reação`,
        `\`${P}cor painel <id-do-canal>\` — publica o painel em outro canal`,
        `\`${P}cor criar\` — só cria/pinta os cargos, sem publicar nada`,
        `\`${P}cor painel aqui fogo gelo neon\` — só as cores escolhidas`,
        "",
        "**Prontos**",
        `\`${P}cor <cargo> preset <nome>\` — ${listaPresets(false)}`,
        "",
        "**CSS na mão**",
        `\`${P}cor <cargo> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)\``,
        "_Regras do Stoat: ângulo como `224deg`, paradas em `%` inteiro, cores em hex/`rgb()`, até 128 caracteres. Espaços como `linear-gradient (224 deg, …)` eu conserto sozinha._",
        "",
        "**Outros**",
        `\`${P}cor <cargo> remover\` — volta à cor padrão`,
        `\`${P}cor lista\` — cargos e suas cores atuais`,
        `\`${P}cor presets\` — vê os gradientes prontos`,
        "",
        "_O cargo: **menção** (`@Cargo`), o **nome exato** — pode ter espaço: `&cor Le Gooby #FF00AA` — ou o ID (`&tutorial ids`)._",
      ].join("\n"),
      colour: COR.info,
    });
  }

  // ── Presets ──
  if (["presets", "preset", "prontos"].includes(sub) && !args[1]) {
    return sendEmbed(message.channel, {
      title: en ? "🎨 Ready-made gradients" : "🎨 Gradientes prontos",
      description: Object.entries(PRESETS).map(([k, v]) =>
        `**${nomePreset(k, en)}**\n\`${v.slice(0, 90)}${v.length > 90 ? "…" : ""}\``).join("\n\n").slice(0, 1900),
      colour: COR.info,
    });
  }

  // ── Lista ──
  if (["lista", "list", "cargos"].includes(sub)) {
    const lista = server.roles ? [...server.roles.entries()] : [];
    if (!lista.length) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🎨 Cargos", description: "Não consegui ler os cargos deste servidor.", colour: COR.aviso },
        { title: "🎨 Roles", description: "I couldn't read this server's roles.", colour: COR.aviso }));
    }
    const linhas = lista.slice(0, 25).map(([id, r]) => {
      const c = r?.colour ?? r?.color;
      const desc = !c ? (en ? "_default_" : "_padrão_") : /gradient/i.test(c) ? (en ? "🌈 gradient" : "🌈 gradiente") : `\`${c}\``;
      return `• **${r?.name ?? id}** — ${desc}`;
    });
    return sendEmbed(message.channel, { title: en ? "🎨 Role colors" : "🎨 Cores dos cargos",
      description: linhas.join("\n").slice(0, 1900), colour: COR.info });
  }

  // ── painel / criar → cria os cargos, publica o embed e liga tudo ──
  if (["painel", "criar", "criarpresets", "criartodos", "gerar"].includes(sub)) {
    if (membroTemPermissao && !membroTemPermissao(message, server, "ManageRole")) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageRole** para criar cargos.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageRole** to create roles.", colour: COR.erro }));
    }

    // Argumentos: um canal (menção/ID/"aqui") e/ou nomes de preset.
    let canalAlvoId = null;
    const pedidos = [];
    for (const a of args.slice(1)) {
      const t = a.toLowerCase();
      if (["aqui", "here"].includes(t)) { canalAlvoId = message.channelId; continue; }
      const id = limparId(a);
      if (ULID.test(id)) { canalAlvoId = id; continue; }
      if (!["todos", "all"].includes(t)) pedidos.push(presetDe(t) ?? t);
    }
    const invalidos = pedidos.filter((p) => !PRESETS[p]);
    if (invalidos.length) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Preset desconhecido",
        description: `Não conheço: ${invalidos.map((i) => `\`${i}\``).join(", ")}.\n\nDisponíveis: ${listaPresets(false)}`,
        colour: COR.erro,
      }, {
        title: "❌ Unknown preset",
        description: `I don't know: ${invalidos.map((i) => `\`${i}\``).join(", ")}.\n\nAvailable: ${listaPresets(true)}`,
        colour: COR.erro,
      }));
    }
    // o canal do painel tem de ser deste servidor — confere ANTES de criar cargos
    if (canalAlvoId && canalAlvoId !== message.channelId) {
      const alvo = ctx.client?.channels?.get?.(canalAlvoId) ?? await ctx.client?.channels?.fetch?.(canalAlvoId).catch(() => null);
      if (!alvo || canalDeOutroServidor(alvo, ctx.serverId)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido", description: `<#${canalAlvoId}> não é um canal **deste servidor** onde eu possa escrever. Use \`${P}cor painel aqui\`.`, colour: COR.erro },
          { title: "❌ Invalid channel", description: `<#${canalAlvoId}> isn't a channel **on this server** I can write to. Use \`${P}cor painel aqui\`.`, colour: COR.erro }));
      }
    }
    const alvos = pedidos.length ? pedidos : Object.keys(PRESETS);
    const soCargos = !canalAlvoId && ["criar", "criarpresets", "criartodos", "gerar"].includes(sub);

    // ── 1. Cargos ──
    const existentes = new Map();
    for (const [id, r] of (server.roles ?? [])) existentes.set((r?.name ?? "").toLowerCase(), id);

    await sendEmbed(message.channel, en ? {
      title: "🎨 Getting ready…",
      description: `Creating/painting **${alvos.length}** role(s)${soCargos ? "" : " and assembling the panel"}. This may take a few seconds.`,
      colour: COR.info,
    } : {
      title: "🎨 Preparando…",
      description: `Criando/pintando **${alvos.length}** cargo(s)${soCargos ? "" : " e montando o painel"}. Pode levar alguns segundos.`,
      colour: COR.info });

    const prontos = [], falhas = [];
    let novosCargos = 0;
    for (const nome of alvos) {
      // o cargo já existe com o nome em português OU em inglês; o novo nasce no idioma do servidor
      const jaExiste = existentes.get(nome) ?? existentes.get(nomePreset(nome, true));
      let roleId = jaExiste ?? null;
      if (!roleId) {
        try {
          const r = await server.createRole(nomePreset(nome, en));
          roleId = r?.id ?? r?._id ?? r;
          novosCargos++;
        } catch (e) { falhas.push({ nome, erro: en ? `couldn't create (${e?.message ?? e})` : `não consegui criar (${e?.message ?? e})` }); continue; }
      }
      const r = await aplicarCor(serverId, roleId, PRESETS[nome], en);
      if (!r.ok) { falhas.push({ nome, erro: r.erro.split("\n")[0] }); continue; }
      prontos.push({ nome, roleId });
      await new Promise((s) => setTimeout(s, 350));   // limite de taxa
    }

    if (!prontos.length) {
      return sendEmbed(message.channel, {
        title: en ? "❌ Couldn't prepare the roles" : "❌ Não consegui preparar os cargos",
        description: falhas.slice(0, 8).map((f) => `• \`${nomePreset(f.nome, en)}\` — ${f.erro}`).join("\n")
          + (en
            ? "\n\n_The bot's role needs **ManageRole** and must sit **above** the roles it creates._"
            : "\n\n_O cargo do bot precisa de **ManageRole** e estar **acima** dos cargos que cria._"),
        colour: COR.erro });
    }

    // ── 2. Só os cargos? termina aqui ──
    if (soCargos) {
      return sendEmbed(message.channel, en ? {
        title: falhas.length ? "🎨 Roles ready (with issues)" : "🎨 Roles ready",
        description: [
          `**${novosCargos}** created, **${prontos.length - novosCargos}** already existed and got painted.`,
          prontos.map((c) => `${EMOJI_PRESET[c.nome] ?? "•"} <%${c.roleId}>`).join("  "),
          falhas.length ? `\n**Failed:** ${falhas.map((f) => nomePreset(f.nome, true)).join(", ")}` : "",
          "",
          `_To publish the picker panel automatically:_ \`${P}cor painel aqui\``,
        ].filter(Boolean).join("\n").slice(0, 1900),
        colour: falhas.length ? COR.aviso : COR.sucesso,
      } : {
        title: falhas.length ? "🎨 Cargos prontos (com pendências)" : "🎨 Cargos prontos",
        description: [
          `**${novosCargos}** criado(s), **${prontos.length - novosCargos}** já existia(m) e foi(ram) pintado(s).`,
          prontos.map((c) => `${EMOJI_PRESET[c.nome] ?? "•"} <%${c.roleId}>`).join("  "),
          falhas.length ? `\n**Falharam:** ${falhas.map((f) => f.nome).join(", ")}` : "",
          "",
          `_Para publicar o painel de escolha automaticamente:_ \`${P}cor painel aqui\``,
        ].filter(Boolean).join("\n").slice(0, 1900),
        colour: falhas.length ? COR.aviso : COR.sucesso });
    }

    // ── 3. Publica o painel no canal escolhido ──
    const destinoId = canalAlvoId ?? message.channelId;
    let canal = null;
    try {
      canal = destinoId === message.channelId ? message.channel
        : (ctx.client?.channels?.get?.(destinoId) ?? await ctx.client?.channels?.fetch?.(destinoId));
    } catch {}
    if (canalDeOutroServidor(canal, ctx.serverId)) canal = null;   // canal de outro servidor: não
    if (!canal?.sendMessage) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Canal inválido",
        description: `Não consegui acessar <#${destinoId}>. Use \`${P}cor painel aqui\` ou passe o ID de um canal onde eu possa escrever.`,
        colour: COR.erro,
      }, {
        title: "❌ Invalid channel",
        description: `I couldn't access <#${destinoId}>. Use \`${P}cor painel aqui\` or pass the ID of a channel where I can write.`,
        colour: COR.erro,
      }));
    }

    // O embed lista os CARGOS mencionados (aparecem coloridos), não os nomes.
    const linhasPainel = prontos.map((c) => `${EMOJI_PRESET[c.nome] ?? "•"}  <%${c.roleId}>`);
    let painelMsg;
    try {
      painelMsg = await canal.sendMessage({ embeds: [en ? {
        title: "🎨 Pick your color",
        description: ["React with the emoji of the color you want.", "", ...linhasPainel,
          "", "_Only one color at a time: picking another swaps the previous one._"].join("\n").slice(0, 1990),
        colour: "#FF00FF",
      } : {
        title: "🎨 Escolha sua cor",
        description: ["Reaja no emoji da cor que você quer.", "", ...linhasPainel,
          "", "_Só uma cor por vez: escolher outra troca a anterior._"].join("\n").slice(0, 1990),
        colour: "#FF00FF",
      }] });
    } catch (e) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Não consegui publicar",
          description: `Erro ao enviar no canal: ${e?.message ?? e}\n\n_Falta **SendMessage**/**SendEmbeds** ali?_`, colour: COR.erro },
        { title: "❌ Couldn't publish",
          description: `Error sending in the channel: ${e?.message ?? e}\n\n_Missing **SendMessage**/**SendEmbeds** there?_`, colour: COR.erro }));
    }

    const painelId = painelMsg?.id ?? painelMsg?._id;
    if (!painelId) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "⚠️ Publiquei, mas…",
          description: "não consegui o ID da mensagem para ligar as reações. Ligue à mão com `&reactionrole add`.", colour: COR.aviso },
        { title: "⚠️ Published, but…",
          description: "I couldn't get the message ID to wire the reactions. Wire them manually with `&reactionrole add`.", colour: COR.aviso }));
    }

    // ── 4. Reage e registra cada cor ──
    let ligados = 0; const semReacao = [];
    for (const c of prontos) {
      const emoji = EMOJI_PRESET[c.nome];
      if (!emoji) continue;
      try {
        db.addReactionRole(serverId, painelId, emoji.replace(/\uFE0F/g, ""), c.roleId, destinoId);
        await painelMsg.react(encodeURIComponent(emoji));
        ligados++;
      } catch (e) {
        semReacao.push(`${nomePreset(c.nome, en)} (${e?.message ?? e})`);
      }
      await new Promise((s) => setTimeout(s, 300));   // limite de taxa das reações
    }
    db.setReactionRoleExclusivo(painelId, true);

    return sendEmbed(message.channel, en ? {
      title: "✅ Panel published",
      description: [
        `Panel in <#${destinoId}> with **${ligados}** color(s) ready to pick.`,
        `**${novosCargos}** role(s) created, **${prontos.length - novosCargos}** reused.`,
        "🎯 **Exclusive** mode on: picking a color swaps the previous one.",
        falhas.length ? `\n⚠️ **Left out:** ${falhas.map((f) => nomePreset(f.nome, true)).join(", ")}` : "",
        semReacao.length ? `\n⚠️ **No reaction:** ${semReacao.slice(0, 4).join(", ")}` : "",
        semReacao.length ? "_The bot needs **React** in that channel._" : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: (falhas.length || semReacao.length) ? COR.aviso : COR.sucesso,
    } : {
      title: "✅ Painel publicado",
      description: [
        `Painel em <#${destinoId}> com **${ligados}** cor(es) prontas para escolher.`,
        `**${novosCargos}** cargo(s) criado(s), **${prontos.length - novosCargos}** reaproveitado(s).`,
        "🎯 Modo **exclusivo** ligado: escolher uma cor troca a anterior.",
        falhas.length ? `\n⚠️ **Não entraram:** ${falhas.map((f) => f.nome).join(", ")}` : "",
        semReacao.length ? `\n⚠️ **Sem reação:** ${semReacao.slice(0, 4).join(", ")}` : "",
        semReacao.length ? "_O bot precisa de **React** nesse canal._" : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: (falhas.length || semReacao.length) ? COR.aviso : COR.sucesso });
  }

  // A partir daqui mexe em cargo → precisa de permissão
  if (membroTemPermissao && !membroTemPermissao(message, server, "ManageRole")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageRole** para mudar a cor dos cargos.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageRole** to change role colors.", colour: COR.erro }));
  }

  const achado = separarCargoECor(server, args);
  const cargo = achado.cargo;
  if (!cargo) {
    const comoApontar = en
      ? "Mention the role (`@Role` — pick it from the list), use its **exact name** (spaces are fine: `Le Gooby`) or its ID (*Server settings → Roles → Copy role ID*). `&tutorial ids` explains."
      : "Mencione o cargo (`@Cargo` — escolha na lista), use o **nome exato** (pode ter espaço: `Le Gooby`) ou o ID (*Configurações do servidor → Cargos → Copy role ID*). `&tutorial ids` explica.";
    const title = achado.exemplo ? (en ? "❌ Which role?" : "❌ Qual cargo?")
      : achado.ambiguos ? (en ? "❌ More than one role matches" : "❌ Mais de um cargo serve")
      : (en ? "❌ Role not found" : "❌ Cargo não encontrado");
    const corpo = achado.exemplo
      ? (en ? `\`${achado.alvo}\` is the placeholder from the example — put **your** role there.` : `\`${achado.alvo}\` é a palavra do exemplo — no lugar dela vai o **seu** cargo.`)
      : achado.ambiguos
        ? (en ? `**${achado.alvo}** matches: ${achado.ambiguos.map((c) => `**${c.nome}**`).join(", ")}.` : `**${achado.alvo}** serve para: ${achado.ambiguos.map((c) => `**${c.nome}**`).join(", ")}.`)
        : (en ? `I couldn't find the role **${achado.alvo || args[0]}**. \`${P}cor lista\` shows the names.` : `Não achei o cargo **${achado.alvo || args[0]}**. \`${P}cor lista\` mostra os nomes.`);
    return sendEmbed(message.channel, { title, description: [corpo, "", comoApontar,
      "", `\`${P}cor @VIP #FF00AA\` · \`${P}cor Le Gooby linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)\``].join("\n"), colour: COR.erro });
  }

  const resto = achado.resto;
  if (!resto.length) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Faltou a cor",
      description: `\`${P}cor ${achado.alvo} <cor|gradiente ...|preset <nome>|remover>\`\nVeja as opções com \`${P}cor\`.`,
      colour: COR.erro,
    }, {
      title: "❌ Missing the color",
      description: `\`${P}cor ${achado.alvo} <color|gradient ...|preset <name>|remove>\`\nSee the options with \`${P}cor\`.`,
      colour: COR.erro,
    }));
  }

  const acao = resto[0].toLowerCase();
  let colour = null, descricao = "";

  // ── remover ──
  if (["remover", "remove", "limpar", "padrao", "padrão"].includes(acao)) {
    const r = await aplicarCor(serverId, cargo.id, null, en);
    if (!r.ok) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não consegui remover", description: r.erro, colour: COR.erro },
      { title: "❌ Couldn't remove it", description: r.erro, colour: COR.erro }));
    return sendEmbed(message.channel, tr(ctx,
      { title: "🎨 Cor removida", description: `**${cargo.nome}** voltou à cor padrão.`, colour: COR.sucesso },
      { title: "🎨 Color removed", description: `**${cargo.nome}** is back to the default color.`, colour: COR.sucesso }));
  }

  // ── preset ── (também sem a palavra: `&cor VIP fire`)
  const presetDireto = resto.length === 1 && !corSolida(acao) ? presetDe(acao) : null;
  if (["preset", "pronto"].includes(acao) || presetDireto) {
    const nome = presetDireto ?? presetDe(resto[1]);
    if (!nome || !PRESETS[nome]) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Preset desconhecido",
          description: `Escolha um: ${listaPresets(false)}`, colour: COR.erro },
        { title: "❌ Unknown preset",
          description: `Pick one: ${listaPresets(true)}`, colour: COR.erro }));
    }
    colour = PRESETS[nome];
    descricao = en ? `the **${nomePreset(nome, true)}** preset` : `preset **${nome}**`;
  }

  // ── gradiente montado ──
  else if (["gradiente", "gradient", "grad"].includes(acao)) {
    let idx = 1, angulo = 90;
    const ang = String(resto[1] ?? "").match(/^(\d{1,3})(?:deg|°)?$/i);
    if (ang) { angulo = Number(ang[1]); idx = 2; }
    const cores = [];
    for (const bruto of resto.slice(idx)) {
      const c = corSolida(bruto);
      if (!c) {
        return sendEmbed(message.channel, tr(ctx, {
          title: "❌ Cor inválida no gradiente",
          description: `Não entendi **${bruto}**. Use hex (\`#FF0000\`) ou nome: ${Object.keys(NOMES).slice(0, 8).map((n) => `\`${n}\``).join(", ")}…`,
          colour: COR.erro,
        }, {
          title: "❌ Invalid color in the gradient",
          description: `I didn't understand **${bruto}**. Use hex (\`#FF0000\`) or a name: ${nomesDeCor(8, "en").map((n) => `\`${n}\``).join(", ")}…`,
          colour: COR.erro,
        }));
      }
      cores.push(c);
    }
    if (cores.length < 2) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Gradiente precisa de 2+ cores",
          description: `\`${P}cor ${achado.alvo} gradiente #FF0000 #0000FF\``, colour: COR.erro },
        { title: "❌ A gradient needs 2+ colors",
          description: `\`${P}cor ${achado.alvo} gradiente #FF0000 #0000FF\``, colour: COR.erro }));
    }
    colour = montarGradiente(cores, angulo);
    descricao = en ? `a ${cores.length}-color gradient (${angulo}°)` : `gradiente de ${cores.length} cores (${angulo}°)`;
  }

  // ── CSS/cor colada direto ──
  else {
    const bruto = resto.join(" ");
    const v = validarCss(bruto, en);
    if (!v) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Não entendi a cor",
        description: `\`${bruto.slice(0, 100)}\` não é uma cor que eu reconheça.\n\nUse hex (\`#FF00AA\`), um nome (\`roxo\`), \`gradiente <cores>\`, \`preset <nome>\` ou um \`linear-gradient(...)\` completo.`,
        colour: COR.erro,
      }, {
        title: "❌ I didn't understand the color",
        description: `\`${bruto.slice(0, 100)}\` isn't a color I recognize.\n\nUse hex (\`#FF00AA\`), a name (\`purple\`), \`gradient <colors>\`, \`preset <name>\` or a full \`linear-gradient(...)\`.`,
        colour: COR.erro,
      }));
    }
    if (v.erro) {
      return sendEmbed(message.channel, {
        title: en ? "❌ Malformed gradient" : "❌ Gradiente malformado",
        description: v.erro,
        colour: COR.erro });
    }
    colour = v.valor;
    descricao = /gradient/i.test(colour)
      ? (en ? "a custom gradient" : "gradiente personalizado")
      : (en ? `the color \`${colour}\`` : `cor \`${colour}\``);
    if (v.arrumado) descricao += en ? " _(I fixed the spacing to Stoat's format)_" : " _(ajustei a escrita para o formato do Stoat)_";
  }

  // a regra do Stoat, conferida ANTES da API (o gradiente montado também
  // passa por aqui: muitas cores estouram os 128 caracteres)
  if (/gradient/i.test(colour) && !corAceitaPeloStoat(colour)) {
    const motivos = motivoDoGradiente(colour, en);
    return sendEmbed(message.channel, { title: en ? "❌ Stoat won't accept this gradient" : "❌ O Stoat não aceita esse gradiente",
      description: [...motivos.map((m) => `• ${m}`), "", `\`${colour.slice(0, 200)}\``].join("\n"), colour: COR.erro });
  }
  const r = await aplicarCor(serverId, cargo.id, colour, en);
  if (!r.ok) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não consegui aplicar", description: r.erro, colour: COR.erro },
      { title: "❌ Couldn't apply it", description: r.erro, colour: COR.erro }));
  }
  return sendEmbed(message.channel, {
    title: en ? "🎨 Color applied" : "🎨 Cor aplicada",
    description: [
      en ? `**${cargo.nome}** now uses ${descricao}.` : `**${cargo.nome}** agora usa ${descricao}.`,
      "",
      `\`\`\`\n${colour.slice(0, 400)}\n\`\`\``,
      /gradient/i.test(colour)
        ? (en ? "_The gradient shows on the role name in clients that support CSS._" : "_O gradiente aparece no nome do cargo em clientes que suportam CSS._")
        : "",
    ].filter(Boolean).join("\n"),
    colour: /gradient/i.test(colour) ? COR.sucesso : colour,
  });
}
