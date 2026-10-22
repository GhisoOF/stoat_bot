import { limparId, ULID } from "../core/ids.js";
import { citar, citarInterno } from "../core/aliases.js";
import * as db from "../core/db.js";
import { CORES as NOMES, CORES_EN, CORES_ES, normalizarCor as corSolida, nomesDeCor } from "../core/cores.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { chamarApi } from "../core/stoat-api.js";
import { canalDeOutroServidor } from "./pertence.js";
import { segundosPara } from "../core/ritmo-api.js";

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
  // (P6, 20 out 2026) mais oito — o painel de gradientes fica com 20, o limite de reações do Stoat
  aurora:       "linear-gradient(90deg, #00F5A0 0%, #00D9F5 50%, #7B2FF7 100%)",
  galaxia:      "linear-gradient(90deg, #0F0C29 0%, #302B63 50%, #B24592 100%)",
  sakura:       "linear-gradient(90deg, #FFC0CB 0%, #FF8FAB 50%, #FB6F92 100%)",
  menta:        "linear-gradient(90deg, #A8FF78 0%, #78FFD6 100%)",
  pessego:      "linear-gradient(90deg, #FFB88C 0%, #DE6262 100%)",
  lava:         "linear-gradient(90deg, #200122 0%, #6F0000 50%, #FF4E00 100%)",
  crepusculo:   "linear-gradient(90deg, #0B486B 0%, #F56217 100%)",
  "algodao-doce": "linear-gradient(90deg, #FFAFBD 0%, #C9FFFF 100%)",
};

const EMOJI_PRESET = {
  "arco-iris": "🏳️‍🌈", fogo: "🔥", oceano: "🌊", neon: "🚨", vaporwave: "🚬",
  poente: "🌅", floresta: "🌳", ouro: "🥇", cyberpunk: "🌆", sangue: "🩸",
  gelo: "🧊", trans: "🏳️‍⚧️",
  aurora: "🌌", galaxia: "🪐", sakura: "🌸", menta: "🌿", pessego: "🍑", lava: "🌋",
  crepusculo: "🌙", "algodao-doce": "🍬",
};

// Os nomes em inglês (16 out 2026, o bot ficou global): a entrada aceita os
// dois, e a tela em inglês mostra o inglês. A chave interna segue em
// português (os cargos antigos se chamam assim).
const PRESET_EN = {
  rainbow: "arco-iris", fire: "fogo", ocean: "oceano", neon: "neon", vaporwave: "vaporwave",
  sunset: "poente", forest: "floresta", gold: "ouro", cyberpunk: "cyberpunk", blood: "sangue",
  ice: "gelo", trans: "trans",
  aurora: "aurora", galaxy: "galaxia", sakura: "sakura", mint: "menta", peach: "pessego", lava: "lava",
  twilight: "crepusculo", "cotton-candy": "algodao-doce",
};
const EN_DO_PRESET = Object.fromEntries(Object.entries(PRESET_EN).map(([en, pt]) => [pt, en]));
export const presetDe = (t) => { const k = String(t ?? "").toLowerCase(); return PRESETS[k] ? k : PRESET_EN[k] ?? null; };
export const nomePreset = (k, en) => (en ? EN_DO_PRESET[k] ?? k : k);
const listaPresets = (en) => Object.keys(PRESETS).map((k) => `\`${nomePreset(k, en)}\``).join(", ");

// ── Cores sólidas no painel (P6, 20 out 2026) ───────────────────────────────
// As dez básicas, com o mesmo tom do `&cor <cargo> vermelho` (core/cores.js). Os
// cargos se chamam como a cor, no idioma do servidor.
export const SOLIDAS = ["vermelho", "laranja", "amarelo", "verde", "azul", "roxo", "rosa", "marrom", "preto", "branco"];
const EMOJI_SOLIDA = {
  vermelho: "🔴", laranja: "🟠", amarelo: "🟡", verde: "🟢", azul: "🔵",
  roxo: "🟣", rosa: "💗", marrom: "🟤", preto: "⚫", branco: "⚪",
};
const EN_DA_SOLIDA = Object.fromEntries(Object.entries(CORES_EN).reverse().filter(([, pt]) => SOLIDAS.includes(pt)).map(([en, pt]) => [pt, en]));
export const solidaDe = (t) => {
  const k = String(t ?? "").toLowerCase();
  const pt = SOLIDAS.includes(k) ? k : CORES_EN[k] ?? CORES_ES[k] ?? null;
  return pt && SOLIDAS.includes(pt) ? pt : null;
};
const nomeSolida = (k, en) => (en ? EN_DA_SOLIDA[k] ?? k : k);
const listaSolidas = (en) => SOLIDAS.map((k) => `\`${nomeSolida(k, en)}\``).join(", ");

// Uma cor do painel: { tipo: "g" (gradiente) | "s" (sólida), nome }
const valorDoItem = (it) => (it.tipo === "s" ? NOMES[it.nome] : PRESETS[it.nome]);
const emojiDoItem = (it) => (it.tipo === "s" ? EMOJI_SOLIDA[it.nome] : EMOJI_PRESET[it.nome]);
const nomeDoItem = (it, en) => (it.tipo === "s" ? nomeSolida(it.nome, en) : nomePreset(it.nome, en));
const PALAVRAS_SOLIDAS = ["solidas", "sólidas", "solida", "sólida", "solid", "solids", "solidos", "sólidos"];
const PALAVRAS_GRADIENTES = ["gradientes", "gradients", "gradiente", "gradient", "degradados", "presets", "prontos"];
// Um painel por mensagem tem no máximo 20 reações (limite do Stoat: message_reactions = 20)
export const MAX_REACOES = 20;
// Um cargo com o nome da cor que JÁ tem permissões não vira cor de painel: qualquer
// um poderia pegá-lo reagindo (um "Verde" de time, um "Ouro" de staff…).
// a cor que o cargo já tem é a pedida? (não gasta pedido à toa: o Stoat aceita 5 a cada 10 s)
export function mesmaCor(atual, nova) {
  const n = (x) => String(x ?? "").toLowerCase().replace(/\s+/g, "");
  return !!atual && n(atual) === n(nova);
}

// quanto tempo o lote leva: cargo novo = criar + pintar; existente = pintar (ou nada)
export function tempoDoLote(alvos, existentes, nomeDe, valorDe) {
  let pedidos = 0;
  for (const it of alvos) {
    const ja = existentes.get(nomeDe(it, false)) ?? existentes.get(nomeDe(it, true));
    pedidos += !ja ? 2 : mesmaCor(ja.r?.colour, valorDe(it)) ? 0 : 1;
  }
  return segundosPara(pedidos);
}

function temPermissoes(role) {
  try { return BigInt(role?.permissions?.a ?? 0) !== 0n; } catch { return false; }
}

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
// `en`: true (inglês), false (português) ou "es" (espanhol) — vale para as três funções abaixo
const X3 = (en, pt, eng, es) => (en === "es" ? es : en ? eng : pt);
function motivoDoGradiente(t, en) {
  const M = [];
  if (t.length > 128) M.push(X3(en, `tem ${t.length} caracteres — o Stoat aceita no máximo **128**`, `it has ${t.length} characters — Stoat takes at most **128**`, `tiene ${t.length} caracteres — Stoat acepta como máximo **128**`));
  if (/hsla?\(|oklch\(|lab\(|hwb\(/i.test(t)) M.push(X3(en, "cores `hsl()`/`oklch()` não são aceitas — use hex (`#73E696`) ou `rgb()`", "`hsl()`/`oklch()` colors aren't accepted — use hex (`#73E696`) or `rgb()`", "los colores `hsl()`/`oklch()` no se aceptan — usa hex (`#73E696`) o `rgb()`"));
  if (/\d+(?:px|em|rem|turn|rad|grad)\b/i.test(t)) M.push(X3(en, "paradas e ângulos só em `%` e `deg`", "stops and angles only in `%` and `deg`", "paradas y ángulos solo en `%` y `deg`"));
  if (!t.includes(")")) M.push(X3(en, "faltou fechar o `)`", "the closing `)` is missing", "falta cerrar el `)`"));
  if ((t.match(/,/g) ?? []).length < 1) M.push(X3(en, "um gradiente precisa de pelo menos duas cores", "a gradient needs at least two colors", "un degradado necesita al menos dos colores"));
  return M;
}

function validarCss(txt, en = false) {
  const t = arrumarCss(txt);
  if (/^(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i.test(t)) {
    if (corAceitaPeloStoat(t)) return { valor: t, arrumado: t !== String(txt ?? "").trim() };
    const motivos = motivoDoGradiente(t, en);
    const ex = "linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)";
    return { erro: [
      X3(en, "O Stoat não aceita esse gradiente como está escrito.", "Stoat won't accept this gradient as written.", "Stoat no acepta este degradado tal como está escrito."),
      ...motivos.map((m) => `• ${m}`),
      "",
      X3(en, "**O que ele aceita:** cores em hex/`rgb()`/nome, ângulo como `224deg`, paradas em `%` inteiro, nada entre `gradient` e `(`. Ex.:",
        "**What it accepts:** colors in hex/`rgb()`/name, angle as `224deg`, stops as whole `%`, nothing between `gradient` and `(`. E.g.:",
        "**Lo que acepta:** colores en hex/`rgb()`/nombre, ángulo como `224deg`, paradas en `%` entero, nada entre `gradient` y `(`. Ej.:"),
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
  if (!process.env.BOT_TOKEN) return { ok: false, erro: X3(en, "BOT_TOKEN não está definido no ambiente do bot.", "BOT_TOKEN isn't set in the bot's environment.", "BOT_TOKEN no está definido en el entorno del bot.") };

  const r = await chamarApi(`/servers/${serverId}/roles/${roleId}`, {
    metodo: "PATCH",
    corpo: colour === null ? { remove: ["Colour"] } : { colour },
    ms: 15_000,
  });
  if (r.ok) return { ok: true };
  if (r.erro) return { ok: false, erro: X3(en, `Não consegui falar com a API: ${r.erro}`, `I couldn't reach the API: ${r.erro}`, `No pude comunicarme con la API: ${r.erro}`) };

  const dica = en === "es"
    ? (r.status === 403 ? " — el rol del bot necesita **ManageRole** y estar **por encima** del rol que está editando."
      : r.status === 400 ? " — Stoat rechazó el valor del color (acepta: hex/`rgb()`/nombre, o `linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — ángulo en `deg`, `%` entero, hasta 128 caracteres)."
      : r.status === 404 ? " — rol o servidor no encontrado."
      : "")
    : en
    ? (r.status === 403 ? " — the bot's role needs **ManageRole** and must sit **above** the role it's editing."
      : r.status === 400 ? " — Stoat rejected the color value (accepted: hex/`rgb()`/name, or `linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — angle in `deg`, whole `%`, up to 128 characters)."
      : r.status === 404 ? " — role or server not found."
      : "")
    : (r.status === 403 ? " — o cargo do bot precisa de **ManageRole** e estar **acima** do cargo que está editando."
      : r.status === 400 ? " — o Stoat recusou o valor da cor (aceita: hex/`rgb()`/nome, ou `linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — ângulo em `deg`, `%` inteiro, até 128 caracteres)."
      : r.status === 404 ? " — cargo ou servidor não encontrado."
      : "");
  return { ok: false, erro: `${X3(en, "API respondeu", "The API answered", "La API respondió")} ${r.status}${dica}${r.texto ? `\n\`\`\`\n${r.texto.slice(0, 300)}\n\`\`\`` : ""}` };
}

export async function cmdCor(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, getServer, membroTemPermissao, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  // para as funções acima e os textos montados em pedaços: "es" no servidor em espanhol
  const L = idiomaDe(ctx) === "es" ? "es" : en;
  const X = (pt, eng, es) => X3(L, pt, eng, es);
  const ce = (ref) => citar(ref, "es", P);   // a citação no espanhol

  const server = await getServer(message);
  if (!server) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Fora de um servidor", description: "Este comando só funciona dentro de um servidor.", colour: COR.erro },
      { title: "❌ Outside a server", description: "This command only works inside a server.", colour: COR.erro },
      { title: "❌ Fuera de un servidor", description: "Este comando solo funciona dentro de un servidor.", colour: COR.erro }));
  }

  const sub = args[0]?.toLowerCase();

  // ── Ajuda ──
  if (!sub || sub === "ajuda" || sub === "help") {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🎨 Cor dos cargos",
      description: [
        "**Cor sólida**",
        `\`${citarInterno("cor", P)} <cargo> #FF00AA\` · \`${citarInterno("cor", P)} <cargo> roxo\``,
        "",
        "**Gradiente** (2 ou mais cores)",
        `\`${citarInterno("cor", P)} <cargo> gradiente #FF0000 #00FF00 #0000FF\``,
        `\`${citarInterno("cor", P)} <cargo> gradiente 45 vermelho azul\` — o número no início é o ângulo`,
        "",
        "**Automático — faz tudo sozinho**",
        `\`${citarInterno("cor.painel.aqui", P)}\` — cria os cargos, publica a mensagem de escolha, reage e liga os cargos por reação`,
        `\`${citarInterno("cor.painel", P)} <id-do-canal>\` — publica o painel em outro canal`,
        `\`${citarInterno("cor.criar", P)}\` — só cria/pinta os cargos, sem publicar nada`,
        `\`${citarInterno("cor.painel.aqui", P)} fogo gelo neon\` — só as cores escolhidas`,
        `\`${citarInterno("cor.painel.aqui", P)} solidas\` · \`${citarInterno("cor.painel.aqui", P)} gradientes\` — só um grupo`,
        "",
        "**Prontos**",
        `\`${citarInterno("cor", P)} <cargo> preset <nome>\` — ${listaPresets(false)}`,
        `_No painel, também as sólidas:_ ${listaSolidas(false)}`,
        "",
        "**CSS na mão**",
        `\`${citarInterno("cor", P)} <cargo> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)\``,
        "_Regras do Stoat: ângulo como `224deg`, paradas em `%` inteiro, cores em hex/`rgb()`, até 128 caracteres. Espaços como `linear-gradient (224 deg, …)` eu conserto sozinha._",
        "",
        "**Outros**",
        `\`${citarInterno("cor", P)} <cargo> remover\` — volta à cor padrão`,
        `\`${citarInterno("cor.lista", P)}\` — cargos e suas cores atuais`,
        `\`${citarInterno("cor.presets", P)}\` — vê os gradientes prontos`,
        "",
        "_O cargo: **menção** (`@Cargo`), o **nome exato** — pode ter espaço: `" + citarInterno("cor") + " Le Gooby #FF00AA` — ou o ID (`" + citarInterno("tutorial") + " ids`)._",
      ].join("\n"),
      colour: COR.info,
    }, {
      title: "🎨 Role colors",
      description: [
        "**Solid color**",
        `\`${citarInterno("cor", P)} <role> #FF00AA\` · \`${citarInterno("cor", P)} <role> purple\``,
        "",
        "**Gradient** (2 or more colors)",
        `\`${citarInterno("cor", P)} <role> gradiente #FF0000 #00FF00 #0000FF\``,
        `\`${citarInterno("cor", P)} <role> gradiente 45 red blue\` — the leading number is the angle`,
        "",
        "**Automatic — does everything for you**",
        `\`${citarInterno("cor.painel.aqui", P)}\` — creates the roles, posts the picker message, reacts and wires the reaction roles`,
        `\`${citarInterno("cor.painel", P)} <channel-id>\` — posts the panel in another channel`,
        `\`${citarInterno("cor.criar", P)}\` — only creates/paints the roles, posts nothing`,
        `\`${citarInterno("cor.painel.aqui", P)} fire ice neon\` — only the chosen colors`,
        `\`${citarInterno("cor.painel.aqui", P)} solid\` · \`${citarInterno("cor.painel.aqui", P)} gradients\` — only one group`,
        "",
        "**Presets**",
        `\`${citarInterno("cor", P)} <role> preset <name>\` — ${listaPresets(true)}`,
        `_In the panel, also the solid ones:_ ${listaSolidas(true)}`,
        "",
        "**Raw CSS**",
        `\`${citarInterno("cor", P)} <role> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)\``,
        "_Stoat's rules: angle as `224deg`, stops as whole `%`, colors in hex/`rgb()`, up to 128 characters. I fix spaces like `linear-gradient (224 deg, …)` myself._",
        "",
        "**Others**",
        `\`${citarInterno("cor", P)} <role> remover\` — back to the default color`,
        `\`${citarInterno("cor.lista", P)}\` — roles and their current colors`,
        `\`${citarInterno("cor.presets", P)}\` — see the ready-made gradients`,
        "",
        "_The role: a **mention** (`@Role`), its **exact name** — spaces are fine: `" + citarInterno("cor") + " Le Gooby #FF00AA` — or its ID (`" + citarInterno("tutorial") + " ids`)._",
      ].join("\n"),
      colour: COR.info,
    }, {
      title: "🎨 Colores de los roles",
      description: [
        "**Color sólido**",
        `\`${ce("cor")} <rol> #FF00AA\` · \`${ce("cor")} <rol> purple\``,
        "",
        "**Degradado** (2 o más colores)",
        `\`${ce("cor")} <rol> gradient #FF0000 #00FF00 #0000FF\``,
        `\`${ce("cor")} <rol> gradient 45 red blue\` — el número del principio es el ángulo`,
        "",
        "**Automático — lo hace todo por ti**",
        `\`${ce("cor.painel.aqui")}\` — crea los roles, publica el mensaje para elegir, reacciona y conecta los roles por reacción`,
        `\`${ce("cor.painel")} <id-del-canal>\` — publica el panel en otro canal`,
        `\`${ce("cor.criar")}\` — solo crea/pinta los roles, sin publicar nada`,
        `\`${ce("cor.painel.aqui")} fire ice neon\` — solo los colores elegidos`,
        `\`${ce("cor.painel.aqui")} solid\` · \`${ce("cor.painel.aqui")} gradients\` — solo un grupo`,
        "",
        "**Predefinidos**",
        `\`${ce("cor")} <rol> preset <nombre>\` — ${listaPresets(true)}`,
        `_En el panel, también los sólidos:_ ${listaSolidas(true)}`,
        "",
        "**CSS a mano**",
        `\`${ce("cor")} <rol> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)\``,
        "_Reglas de Stoat: ángulo como `224deg`, paradas en `%` entero, colores en hex/`rgb()`, hasta 128 caracteres. Los espacios como `linear-gradient (224 deg, …)` los arreglo yo._",
        "",
        "**Otros**",
        `\`${ce("cor")} <rol> remove\` — vuelve al color predeterminado`,
        `\`${ce("cor.lista")}\` — los roles y sus colores actuales`,
        `\`${ce("cor.presets")}\` — ve los degradados predefinidos`,
        "",
        "_El rol: una **mención** (`@Rol`), su **nombre exacto** — puede tener espacios: `" + ce("cor") + " Le Gooby #FF00AA` — o su ID (`" + ce("tutorial") + " ids`)._",
      ].join("\n"),
      colour: COR.info,
    }));
  }

  // ── Presets ──
  if (["presets", "preset", "prontos"].includes(sub) && !args[1]) {
    return sendEmbed(message.channel, {
      title: tr(ctx, "🎨 Gradientes prontos", "🎨 Ready-made gradients", "🎨 Degradados predefinidos"),
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
        { title: "🎨 Roles", description: "I couldn't read this server's roles.", colour: COR.aviso },
        { title: "🎨 Roles", description: "No pude leer los roles de este servidor.", colour: COR.aviso }));
    }
    const linhas = lista.slice(0, 25).map(([id, r]) => {
      const c = r?.colour ?? r?.color;
      const desc = !c ? tr(ctx, "_padrão_", "_default_", "_predeterminado_") : /gradient/i.test(c) ? tr(ctx, "🌈 gradiente", "🌈 gradient", "🌈 degradado") : `\`${c}\``;
      return `• **${r?.name ?? id}** — ${desc}`;
    });
    return sendEmbed(message.channel, { title: tr(ctx, "🎨 Cores dos cargos", "🎨 Role colors", "🎨 Colores de los roles"),
      description: linhas.join("\n").slice(0, 1900), colour: COR.info });
  }

  // ── painel / criar → cria os cargos, publica o embed e liga tudo ──
  if (["painel", "criar", "criarpresets", "criartodos", "gerar"].includes(sub)) {
    if (membroTemPermissao && !membroTemPermissao(message, server, "ManageRole")) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: "Você precisa de **ManageRole** para criar cargos.", colour: COR.erro },
        { title: "🚫 Missing permission",
          description: "You need **ManageRole** to create roles.", colour: COR.erro },
        { title: "🚫 Permiso insuficiente",
          description: "Necesitas **ManageRole** para crear roles.", colour: COR.erro }));
    }

    // Argumentos: um canal (menção/ID/"aqui"), nomes de cor (sólida ou gradiente)
    // e/ou um grupo inteiro (`solidas`, `gradientes`). Sem cor nenhuma: todas.
    let canalAlvoId = null;
    const pedidos = [], invalidos = [];
    const pedir = (it) => { if (!pedidos.some((p) => p.tipo === it.tipo && p.nome === it.nome)) pedidos.push(it); };
    for (const a of args.slice(1)) {
      const t = a.toLowerCase();
      if (["aqui", "here", "aquí", "acá", "aca"].includes(t)) { canalAlvoId = message.channelId; continue; }
      const id = limparId(a);
      if (ULID.test(id)) { canalAlvoId = id; continue; }
      if (["todos", "todas", "all"].includes(t)) continue;
      if (PALAVRAS_SOLIDAS.includes(t)) { SOLIDAS.forEach((n) => pedir({ tipo: "s", nome: n })); continue; }
      if (PALAVRAS_GRADIENTES.includes(t)) { Object.keys(PRESETS).forEach((n) => pedir({ tipo: "g", nome: n })); continue; }
      const g = presetDe(t);
      if (g) { pedir({ tipo: "g", nome: g }); continue; }
      const so = solidaDe(t);
      if (so) { pedir({ tipo: "s", nome: so }); continue; }
      invalidos.push(t);
    }
    if (invalidos.length) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Cor desconhecida",
        description: `Não conheço: ${invalidos.map((i) => `\`${i}\``).join(", ")}.\n\n**Sólidas:** ${listaSolidas(false)}\n**Gradientes:** ${listaPresets(false)}\n\n_Ou um grupo inteiro: \`solidas\`, \`gradientes\`._`,
        colour: COR.erro,
      }, {
        title: "❌ Unknown color",
        description: `I don't know: ${invalidos.map((i) => `\`${i}\``).join(", ")}.\n\n**Solid:** ${listaSolidas(true)}\n**Gradients:** ${listaPresets(true)}\n\n_Or a whole group: \`solid\`, \`gradients\`._`,
        colour: COR.erro,
      }, {
        title: "❌ Color desconocido",
        description: `No conozco: ${invalidos.map((i) => `\`${i}\``).join(", ")}.\n\n**Sólidos:** ${listaSolidas(true)}\n**Degradados:** ${listaPresets(true)}\n\n_O un grupo entero: \`solid\`, \`gradients\`._`,
        colour: COR.erro,
      }));
    }
    // o canal do painel tem de ser deste servidor — confere ANTES de criar cargos
    if (canalAlvoId && canalAlvoId !== message.channelId) {
      const alvo = ctx.client?.channels?.get?.(canalAlvoId) ?? await ctx.client?.channels?.fetch?.(canalAlvoId).catch(() => null);
      if (!alvo || canalDeOutroServidor(alvo, ctx.serverId)) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido", description: `<#${canalAlvoId}> não é um canal **deste servidor** onde eu possa escrever. Use \`${citarInterno("cor.painel.aqui", P)}\`.`, colour: COR.erro },
          { title: "❌ Invalid channel", description: `<#${canalAlvoId}> isn't a channel **on this server** I can write to. Use \`${citarInterno("cor.painel.aqui", P)}\`.`, colour: COR.erro },
          { title: "❌ Canal inválido", description: `<#${canalAlvoId}> no es un canal **de este servidor** donde yo pueda escribir. Usa \`${ce("cor.painel.aqui")}\`.`, colour: COR.erro }));
      }
    }
    // sólidas primeiro, depois os gradientes — cada grupo na sua mensagem
    const alvos = pedidos.length
      ? [...pedidos.filter((p) => p.tipo === "s"), ...pedidos.filter((p) => p.tipo === "g")]
      : [...SOLIDAS.map((n) => ({ tipo: "s", nome: n })), ...Object.keys(PRESETS).map((n) => ({ tipo: "g", nome: n }))];
    const soCargos = !canalAlvoId && ["criar", "criarpresets", "criartodos", "gerar"].includes(sub);

    // ── 1. Cargos ──
    const existentes = new Map();
    for (const [id, r] of (server.roles ?? [])) existentes.set((r?.name ?? "").toLowerCase(), { id, r });

    // (22 out 2026) o Stoat aceita 5 mudanças no servidor a cada 10 s: 30 cores novas
    // são 60 pedidos, ~2 min. O bot espera a vez (core/ritmo-api.js) — e avisa quanto.
    const seg = tempoDoLote(alvos, existentes, nomeDoItem, valorDoItem);
    const quanto = (l) => seg < 20 ? X3(l, "Pode levar alguns segundos.", "This may take a few seconds.", "Puede tardar unos segundos.")
      : X3(l, `Leva uns **${Math.ceil(seg / 60)} min** — o Stoat aceita 5 mudanças no servidor a cada 10 s, e eu espero a vez.`,
        `Takes about **${Math.ceil(seg / 60)} min** — Stoat accepts 5 server changes every 10 s, and I wait my turn.`,
        `Tarda unos **${Math.ceil(seg / 60)} min** — Stoat acepta 5 cambios en el servidor cada 10 s, y espero mi turno.`);
    await sendEmbed(message.channel, tr(ctx, {
      title: "🎨 Preparando…",
      description: `Criando/pintando **${alvos.length}** cargo(s)${soCargos ? "" : " e montando o painel"}. ${quanto(false)}`,
      colour: COR.info }, {
      title: "🎨 Getting ready…",
      description: `Creating/painting **${alvos.length}** role(s)${soCargos ? "" : " and assembling the panel"}. ${quanto(true)}`,
      colour: COR.info,
    }, {
      title: "🎨 Preparando…",
      description: `Creando/pintando **${alvos.length}** rol(es)${soCargos ? "" : " y montando el panel"}. ${quanto("es")}`,
      colour: COR.info }));

    const prontos = [], falhas = [];
    let novosCargos = 0, reaproveitados = 0;   // (o "-1 reaproveitado(s)": criado e não pintado contava como criado e saía da conta)
    for (const it of alvos) {
      // o cargo já existe com o nome em português OU em inglês; o novo nasce no idioma do servidor
      const jaExiste = existentes.get(nomeDoItem(it, false)) ?? existentes.get(nomeDoItem(it, true));
      if (jaExiste && temPermissoes(jaExiste.r)) {
        falhas.push({ ...it, erro: X("já existe um cargo com esse nome, e ele tem permissões — renomeie-o", "a role with this name already exists and has permissions — rename it", "ya existe un rol con ese nombre y tiene permisos — cámbiale el nombre") });
        continue;
      }
      let roleId = jaExiste?.id ?? null;
      let criado = false;
      if (!roleId) {
        try {
          const r = await server.createRole(nomeDoItem(it, en));
          roleId = r?.id ?? r?._id ?? r;
          criado = true;
        } catch (e) { falhas.push({ ...it, erro: X(`não consegui criar (${e?.message ?? e})`, `couldn't create (${e?.message ?? e})`, `no pude crearlo (${e?.message ?? e})`) }); continue; }
      }
      const r = jaExiste && mesmaCor(jaExiste.r?.colour, valorDoItem(it)) ? { ok: true } : await aplicarCor(serverId, roleId, valorDoItem(it), L);
      if (!r.ok) { falhas.push({ ...it, erro: r.erro.split("\n")[0] }); continue; }
      if (criado) novosCargos++; else reaproveitados++;
      prontos.push({ ...it, roleId });
      await new Promise((s) => setTimeout(s, 350));   // limite de taxa
    }
    // (22 out 2026) o motivo aparece sempre — curto, e uma vez só quando é o mesmo para todas
    const listaFalhas = (emIngles) => {
      const motivos = [...new Set(falhas.map((f) => String(f.erro).slice(0, 120)))];
      if (motivos.length === 1) return `${falhas.map((f) => nomeDoItem(f, emIngles)).join(", ")} — ${motivos[0]}`;
      return falhas.map((f) => `${nomeDoItem(f, emIngles)} (${String(f.erro).slice(0, 80)})`).join(", ");
    };

    if (!prontos.length) {
      const itensFalhos = falhas.slice(0, 8).map((f) => `• \`${nomeDoItem(f, en)}\` — ${f.erro}`).join("\n");
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Não consegui preparar os cargos",
        description: itensFalhos + "\n\n_O cargo do bot precisa de **ManageRole** e estar **acima** dos cargos que cria._",
        colour: COR.erro }, {
        title: "❌ Couldn't prepare the roles",
        description: itensFalhos + "\n\n_The bot's role needs **ManageRole** and must sit **above** the roles it creates._",
        colour: COR.erro }, {
        title: "❌ No pude preparar los roles",
        description: itensFalhos + "\n\n_El rol del bot necesita **ManageRole** y estar **por encima** de los roles que crea._",
        colour: COR.erro }));
    }

    // ── 2. Só os cargos? termina aqui ──
    if (soCargos) {
      return sendEmbed(message.channel, tr(ctx, {
        title: falhas.length ? "🎨 Cargos prontos (com pendências)" : "🎨 Cargos prontos",
        description: [
          `**${novosCargos}** criado(s), **${reaproveitados}** já existia(m) e foi(ram) pintado(s).`,
          prontos.map((c) => `${emojiDoItem(c) ?? "•"} <%${c.roleId}>`).join("  "),
          falhas.length ? `\n**Falharam:** ${listaFalhas(false)}` : "",
          "",
          `_Para publicar o painel de escolha automaticamente:_ \`${citarInterno("cor.painel.aqui", P)}\``,
        ].filter(Boolean).join("\n").slice(0, 1900),
        colour: falhas.length ? COR.aviso : COR.sucesso }, {
        title: falhas.length ? "🎨 Roles ready (with issues)" : "🎨 Roles ready",
        description: [
          `**${novosCargos}** created, **${reaproveitados}** already existed and got painted.`,
          prontos.map((c) => `${emojiDoItem(c) ?? "•"} <%${c.roleId}>`).join("  "),
          falhas.length ? `\n**Failed:** ${listaFalhas(true)}` : "",
          "",
          `_To publish the picker panel automatically:_ \`${citarInterno("cor.painel.aqui", P)}\``,
        ].filter(Boolean).join("\n").slice(0, 1900),
        colour: falhas.length ? COR.aviso : COR.sucesso,
      }, {
        title: falhas.length ? "🎨 Roles listos (con pendientes)" : "🎨 Roles listos",
        description: [
          `**${novosCargos}** creado(s), **${reaproveitados}** ya existía(n) y se pintó/pintaron.`,
          prontos.map((c) => `${emojiDoItem(c) ?? "•"} <%${c.roleId}>`).join("  "),
          falhas.length ? `\n**Fallaron:** ${listaFalhas(true)}` : "",
          "",
          `_Para publicar el panel para elegir automáticamente:_ \`${ce("cor.painel.aqui")}\``,
        ].filter(Boolean).join("\n").slice(0, 1900),
        colour: falhas.length ? COR.aviso : COR.sucesso }));
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
        description: `Não consegui acessar <#${destinoId}>. Use \`${citarInterno("cor.painel.aqui", P)}\` ou passe o ID de um canal onde eu possa escrever.`,
        colour: COR.erro,
      }, {
        title: "❌ Invalid channel",
        description: `I couldn't access <#${destinoId}>. Use \`${citarInterno("cor.painel.aqui", P)}\` or pass the ID of a channel where I can write.`,
        colour: COR.erro,
      }, {
        title: "❌ Canal inválido",
        description: `No pude acceder a <#${destinoId}>. Usa \`${ce("cor.painel.aqui")}\` o pasa el ID de un canal donde yo pueda escribir.`,
        colour: COR.erro,
      }));
    }

    // Uma mensagem para as sólidas e outra para os gradientes (cada uma com até 20
    // reações). O embed lista os CARGOS mencionados (aparecem coloridos), não os nomes.
    const partes = [];
    for (const tipo of ["s", "g"]) {
      const doTipo = prontos.filter((c) => c.tipo === tipo);
      for (let i = 0; i < doTipo.length; i += MAX_REACOES) partes.push({ tipo, itens: doTipo.slice(i, i + MAX_REACOES) });
    }
    const varias = partes.length > 1;
    // (a mensagem do painel vai direto pelo canal.sendMessage, sem a tradução da tela:
    // o espanhol entra como texto puro, sem a marca de pronto)
    const TITULO = { s: { pt: "🎨 Cores sólidas", en: "🎨 Solid colors", es: "🎨 Colores sólidos" }, g: { pt: "🌈 Gradientes", en: "🌈 Gradients", es: "🌈 Degradados" } };
    const chaveTitulo = L === "es" ? "es" : en ? "en" : "pt";
    const publicadas = [];   // ids das mensagens do painel
    let ligados = 0; const semReacao = [];
    for (const [n, parte] of partes.entries()) {
      const linhasPainel = parte.itens.map((c) => `${emojiDoItem(c) ?? "•"}  <%${c.roleId}>`);
      const titulo = varias ? TITULO[parte.tipo][chaveTitulo] : X("🎨 Escolha sua cor", "🎨 Pick your color", "🎨 Elige tu color");
      const rodape = varias
        ? X("_Só uma cor por vez, valendo todas as mensagens do painel: escolher outra troca a anterior._",
            "_Only one color at a time, counting every panel message: picking another swaps the previous one._",
            "_Solo un color a la vez, contando todos los mensajes del panel: elegir otro cambia el anterior._")
        : X("_Só uma cor por vez: escolher outra troca a anterior._", "_Only one color at a time: picking another swaps the previous one._", "_Solo un color a la vez: elegir otro cambia el anterior._");
      let painelMsg;
      try {
        painelMsg = await canal.sendMessage({ embeds: [{
          title: titulo,
          description: [X("Reaja no emoji da cor que você quer.", "React with the emoji of the color you want.", "Reacciona con el emoji del color que quieres."), "", ...linhasPainel,
            "", rodape].join("\n").slice(0, 1990),
          colour: "#FF00FF",
        }] });
      } catch (e) {
        if (n === 0) {
          return sendEmbed(message.channel, tr(ctx,
            { title: "❌ Não consegui publicar",
              description: `Erro ao enviar no canal: ${e?.message ?? e}\n\n_Falta **SendMessage**/**SendEmbeds** ali?_`, colour: COR.erro },
            { title: "❌ Couldn't publish",
              description: `Error sending in the channel: ${e?.message ?? e}\n\n_Missing **SendMessage**/**SendEmbeds** there?_`, colour: COR.erro },
            { title: "❌ No pude publicar",
              description: `Error al enviar en el canal: ${e?.message ?? e}\n\n_¿Falta **SendMessage**/**SendEmbeds** ahí?_`, colour: COR.erro }));
        }
        semReacao.push(`${TITULO[parte.tipo][chaveTitulo]} (${e?.message ?? e})`);
        continue;
      }

      const painelId = painelMsg?.id ?? painelMsg?._id;
      if (!painelId) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "⚠️ Publiquei, mas…",
            description: "não consegui o ID da mensagem para ligar as reações. Ligue à mão com `" + citarInterno("reactionrole.add") + "`.", colour: COR.aviso },
          { title: "⚠️ Published, but…",
            description: "I couldn't get the message ID to wire the reactions. Wire them manually with `" + citarInterno("reactionrole.add") + "`.", colour: COR.aviso },
          { title: "⚠️ Publiqué, pero…",
            description: "no pude obtener el ID del mensaje para conectar las reacciones. Conéctalas a mano con `" + citar("reactionrole.add", "es") + "`.", colour: COR.aviso }));
      }

      // ── 4. Reage e registra cada cor ──
      for (const c of parte.itens) {
        const emoji = emojiDoItem(c);
        if (!emoji) continue;
        try {
          db.addReactionRole(serverId, painelId, emoji.replace(/️/g, ""), c.roleId, destinoId);
          await painelMsg.react(encodeURIComponent(emoji));
          ligados++;
        } catch (e) {
          semReacao.push(`${nomeDoItem(c, en)} (${e?.message ?? e})`);
        }
        await new Promise((s) => setTimeout(s, 300));   // limite de taxa das reações
      }
      db.setReactionRoleExclusivo(painelId, true);
      publicadas.push(painelId);
    }
    // as mensagens do painel valem como uma só no modo exclusivo
    if (publicadas.length > 1) db.setReactionRoleGrupo(publicadas, publicadas[0]);

    return sendEmbed(message.channel, tr(ctx, {
      title: "✅ Painel publicado",
      description: [
        `Painel em <#${destinoId}> com **${ligados}** cor(es) prontas para escolher${publicadas.length > 1 ? ` (${publicadas.length} mensagens)` : ""}.`,
        `**${novosCargos}** cargo(s) criado(s), **${reaproveitados}** reaproveitado(s).`,
        "🎯 Modo **exclusivo** ligado: escolher uma cor troca a anterior.",
        falhas.length ? `\n⚠️ **Não entraram:** ${listaFalhas(false)}` : "",
        semReacao.length ? `\n⚠️ **Sem reação:** ${semReacao.slice(0, 4).join(", ")}` : "",
        semReacao.length ? "_O bot precisa de **React** nesse canal._" : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: (falhas.length || semReacao.length) ? COR.aviso : COR.sucesso }, {
      title: "✅ Panel published",
      description: [
        `Panel in <#${destinoId}> with **${ligados}** color(s) ready to pick${publicadas.length > 1 ? ` (${publicadas.length} messages)` : ""}.`,
        `**${novosCargos}** role(s) created, **${reaproveitados}** reused.`,
        "🎯 **Exclusive** mode on: picking a color swaps the previous one.",
        falhas.length ? `\n⚠️ **Left out:** ${listaFalhas(true)}` : "",
        semReacao.length ? `\n⚠️ **No reaction:** ${semReacao.slice(0, 4).join(", ")}` : "",
        semReacao.length ? "_The bot needs **React** in that channel._" : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: (falhas.length || semReacao.length) ? COR.aviso : COR.sucesso,
    }, {
      title: "✅ Panel publicado",
      description: [
        `Panel en <#${destinoId}> con **${ligados}** color(es) listos para elegir${publicadas.length > 1 ? ` (${publicadas.length} mensajes)` : ""}.`,
        `**${novosCargos}** rol(es) creado(s), **${reaproveitados}** reutilizado(s).`,
        "🎯 Modo **exclusivo** activado: elegir un color cambia el anterior.",
        falhas.length ? `\n⚠️ **No entraron:** ${listaFalhas(true)}` : "",
        semReacao.length ? `\n⚠️ **Sin reacción:** ${semReacao.slice(0, 4).join(", ")}` : "",
        semReacao.length ? "_El bot necesita **React** en ese canal._" : "",
      ].filter(Boolean).join("\n").slice(0, 1900),
      colour: (falhas.length || semReacao.length) ? COR.aviso : COR.sucesso }));
  }

  // A partir daqui mexe em cargo → precisa de permissão
  if (membroTemPermissao && !membroTemPermissao(message, server, "ManageRole")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageRole** para mudar a cor dos cargos.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageRole** to change role colors.", colour: COR.erro },
      { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManageRole** para cambiar el color de los roles.", colour: COR.erro }));
  }

  const achado = separarCargoECor(server, args);
  const cargo = achado.cargo;
  if (!cargo) {
    const comoApontar = en
      ? "Mention the role (`@Role` — pick it from the list), use its **exact name** (spaces are fine: `Le Gooby`) or its ID (*Server settings → Roles → Copy role ID*). `" + citarInterno("tutorial") + " ids` explains."
      : "Mencione o cargo (`@Cargo` — escolha na lista), use o **nome exato** (pode ter espaço: `Le Gooby`) ou o ID (*Configurações do servidor → Cargos → Copy role ID*). `" + citarInterno("tutorial") + " ids` explica.";
    const title = achado.exemplo ? (en ? "❌ Which role?" : "❌ Qual cargo?")
      : achado.ambiguos ? (en ? "❌ More than one role matches" : "❌ Mais de um cargo serve")
      : (en ? "❌ Role not found" : "❌ Cargo não encontrado");
    const corpo = achado.exemplo
      ? (en ? `\`${achado.alvo}\` is the placeholder from the example — put **your** role there.` : `\`${achado.alvo}\` é a palavra do exemplo — no lugar dela vai o **seu** cargo.`)
      : achado.ambiguos
        ? (en ? `**${achado.alvo}** matches: ${achado.ambiguos.map((c) => `**${c.nome}**`).join(", ")}.` : `**${achado.alvo}** serve para: ${achado.ambiguos.map((c) => `**${c.nome}**`).join(", ")}.`)
        : (en ? `I couldn't find the role **${achado.alvo || args[0]}**. \`${citarInterno("cor.lista", P)}\` shows the names.` : `Não achei o cargo **${achado.alvo || args[0]}**. \`${citarInterno("cor.lista", P)}\` mostra os nomes.`);
    const emb = { title, description: [corpo, "", comoApontar,
      "", `\`${citarInterno("cor", P)} @VIP #FF00AA\` · \`${citarInterno("cor", P)} Le Gooby linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)\``].join("\n"), colour: COR.erro };
    const corpoEs = achado.exemplo
      ? `\`${achado.alvo}\` es la palabra del ejemplo — en su lugar va **tu** rol.`
      : achado.ambiguos
        ? `**${achado.alvo}** sirve para: ${achado.ambiguos.map((c) => `**${c.nome}**`).join(", ")}.`
        : `No encontré el rol **${achado.alvo || args[0]}**. \`${ce("cor.lista")}\` muestra los nombres.`;
    const embEs = {
      title: achado.exemplo ? "❌ ¿Qué rol?" : achado.ambiguos ? "❌ Más de un rol coincide" : "❌ Rol no encontrado",
      description: [corpoEs, "",
        "Menciona el rol (`@Rol` — elígelo en la lista), usa su **nombre exacto** (puede tener espacios: `Le Gooby`) o su ID (*Ajustes del servidor → Roles → Copy role ID*). `" + citar("tutorial", "es") + " ids` lo explica.",
        "", `\`${ce("cor")} @VIP #FF00AA\` · \`${ce("cor")} Le Gooby linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)\``].join("\n"),
      colour: COR.erro };
    return sendEmbed(message.channel, tr(ctx, emb, emb, embEs));
  }

  const resto = achado.resto;
  if (!resto.length) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Faltou a cor",
      description: `\`${citarInterno("cor", P)} ${achado.alvo} <cor|gradiente ...|preset <nome>|remover>\`\nVeja as opções com \`${citarInterno("cor", P)}\`.`,
      colour: COR.erro,
    }, {
      title: "❌ Missing the color",
      description: `\`${citarInterno("cor", P)} ${achado.alvo} <color|gradient ...|preset <name>|remove>\`\nSee the options with \`${citarInterno("cor", P)}\`.`,
      colour: COR.erro,
    }, {
      title: "❌ Falta el color",
      description: `\`${ce("cor")} ${achado.alvo} <color|gradient ...|preset <nombre>|remove>\`\nMira las opciones con \`${ce("cor")}\`.`,
      colour: COR.erro,
    }));
  }

  const acao = resto[0].toLowerCase();
  let colour = null, descricao = "";

  // ── remover ──
  if (["remover", "remove", "limpar", "padrao", "padrão"].includes(acao)) {
    const r = await aplicarCor(serverId, cargo.id, null, L);
    if (!r.ok) return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não consegui remover", description: r.erro, colour: COR.erro },
      { title: "❌ Couldn't remove it", description: r.erro, colour: COR.erro },
      { title: "❌ No pude quitarlo", description: r.erro, colour: COR.erro }));
    return sendEmbed(message.channel, tr(ctx,
      { title: "🎨 Cor removida", description: `**${cargo.nome}** voltou à cor padrão.`, colour: COR.sucesso },
      { title: "🎨 Color removed", description: `**${cargo.nome}** is back to the default color.`, colour: COR.sucesso },
      { title: "🎨 Color quitado", description: `**${cargo.nome}** volvió al color predeterminado.`, colour: COR.sucesso }));
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
          description: `Pick one: ${listaPresets(true)}`, colour: COR.erro },
        { title: "❌ Predefinido desconocido",
          description: `Elige uno: ${listaPresets(true)}`, colour: COR.erro }));
    }
    colour = PRESETS[nome];
    descricao = X(`preset **${nome}**`, `the **${nomePreset(nome, true)}** preset`, `el predefinido **${nomePreset(nome, true)}**`);
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
        }, {
          title: "❌ Color inválido en el degradado",
          description: `No entendí **${bruto}**. Usa hex (\`#FF0000\`) o un nombre: ${nomesDeCor(8, "en").map((n) => `\`${n}\``).join(", ")}…`,
          colour: COR.erro,
        }));
      }
      cores.push(c);
    }
    if (cores.length < 2) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Gradiente precisa de 2+ cores",
          description: `\`${citarInterno("cor", P)} ${achado.alvo} gradiente #FF0000 #0000FF\``, colour: COR.erro },
        { title: "❌ A gradient needs 2+ colors",
          description: `\`${citarInterno("cor", P)} ${achado.alvo} gradiente #FF0000 #0000FF\``, colour: COR.erro },
        { title: "❌ Un degradado necesita 2+ colores",
          description: `\`${ce("cor")} ${achado.alvo} gradient #FF0000 #0000FF\``, colour: COR.erro }));
    }
    colour = montarGradiente(cores, angulo);
    descricao = X(`gradiente de ${cores.length} cores (${angulo}°)`, `a ${cores.length}-color gradient (${angulo}°)`, `un degradado de ${cores.length} colores (${angulo}°)`);
  }

  // ── CSS/cor colada direto ──
  else {
    const bruto = resto.join(" ");
    const v = validarCss(bruto, L);
    if (!v) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "❌ Não entendi a cor",
        description: `\`${bruto.slice(0, 100)}\` não é uma cor que eu reconheça.\n\nUse hex (\`#FF00AA\`), um nome (\`roxo\`), \`gradiente <cores>\`, \`preset <nome>\` ou um \`linear-gradient(...)\` completo.`,
        colour: COR.erro,
      }, {
        title: "❌ I didn't understand the color",
        description: `\`${bruto.slice(0, 100)}\` isn't a color I recognize.\n\nUse hex (\`#FF00AA\`), a name (\`purple\`), \`gradient <colors>\`, \`preset <name>\` or a full \`linear-gradient(...)\`.`,
        colour: COR.erro,
      }, {
        title: "❌ No entendí el color",
        description: `\`${bruto.slice(0, 100)}\` no es un color que yo reconozca.\n\nUsa hex (\`#FF00AA\`), un nombre (\`purple\`), \`gradient <colores>\`, \`preset <nombre>\` o un \`linear-gradient(...)\` completo.`,
        colour: COR.erro,
      }));
    }
    if (v.erro) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Gradiente malformado", description: v.erro, colour: COR.erro },
        { title: "❌ Malformed gradient", description: v.erro, colour: COR.erro },
        { title: "❌ Degradado mal formado", description: v.erro, colour: COR.erro }));
    }
    colour = v.valor;
    descricao = /gradient/i.test(colour)
      ? X("gradiente personalizado", "a custom gradient", "un degradado personalizado")
      : X(`cor \`${colour}\``, `the color \`${colour}\``, `el color \`${colour}\``);
    if (v.arrumado) descricao += X(" _(ajustei a escrita para o formato do Stoat)_", " _(I fixed the spacing to Stoat's format)_", " _(ajusté la escritura al formato de Stoat)_");
  }

  // a regra do Stoat, conferida ANTES da API (o gradiente montado também
  // passa por aqui: muitas cores estouram os 128 caracteres)
  if (/gradient/i.test(colour) && !corAceitaPeloStoat(colour)) {
    const motivos = motivoDoGradiente(colour, L);
    const description = [...motivos.map((m) => `• ${m}`), "", `\`${colour.slice(0, 200)}\``].join("\n");
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ O Stoat não aceita esse gradiente", description, colour: COR.erro },
      { title: "❌ Stoat won't accept this gradient", description, colour: COR.erro },
      { title: "❌ Stoat no acepta este degradado", description, colour: COR.erro }));
  }
  const r = await aplicarCor(serverId, cargo.id, colour, L);
  if (!r.ok) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não consegui aplicar", description: r.erro, colour: COR.erro },
      { title: "❌ Couldn't apply it", description: r.erro, colour: COR.erro },
      { title: "❌ No pude aplicarlo", description: r.erro, colour: COR.erro }));
  }
  const aplicada = (titulo, usa, nota) => ({
    title: titulo,
    description: [usa, "", `\`\`\`\n${colour.slice(0, 400)}\n\`\`\``, /gradient/i.test(colour) ? nota : ""].filter(Boolean).join("\n"),
    colour: /gradient/i.test(colour) ? COR.sucesso : colour,
  });
  return sendEmbed(message.channel, tr(ctx,
    aplicada("🎨 Cor aplicada", `**${cargo.nome}** agora usa ${descricao}.`, "_O gradiente aparece no nome do cargo em clientes que suportam CSS._"),
    aplicada("🎨 Color applied", `**${cargo.nome}** now uses ${descricao}.`, "_The gradient shows on the role name in clients that support CSS._"),
    aplicada("🎨 Color aplicado", `**${cargo.nome}** ahora usa ${descricao}.`, "_El degradado aparece en el nombre del rol en los clientes que admiten CSS._")));
}
