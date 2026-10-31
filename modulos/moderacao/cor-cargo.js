import { limparId, ULID } from "../core/ids.js";
import * as db from "../core/db.js";
import { CORES as NOMES, CORES_EN, CORES_ES, normalizarCor as corSolida } from "../core/cores.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { chamarApi } from "../core/stoat-api.js";
import { canalDesteServidor, podeEscreverNoCanal } from "./pertence.js";
import { podeUsarCargo } from "../core/hierarquia.js";
import { descreverErro, registrarErro } from "../core/erros.js";
import { segundosPara } from "../core/ritmo-api.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";
import { erroDeUso, semPermissao } from "./punir.js";

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

// ── Só reaproveita cargo que JÁ é de painel de cor (31 out 2026, R9) ────────
// Antes, qualquer cargo com o nome da cor ("Verde", "Ouro") entrava no painel,
// e qualquer membro o pegava reagindo. Cargo de painel = criado pelo `&cor
// painel|criar` (a lista fica na config) ou já ligado por reação a um painel de
// cor deste servidor com o emoji daquela cor (os painéis de antes desta regra).
const MAX_CARGOS_PAINEL = 200;
export function ehCargoDePainel(config, serverId, roleId, emoji = null) {
  if ((config?.corPainel?.cargos ?? []).includes(roleId)) return true;
  if (!emoji) return false;
  const e = String(emoji).replace(/\uFE0F/g, "");
  try { return db.listReactionRolesServidor(serverId).some((r) => r.roleId === roleId && String(r.emoji).replace(/\uFE0F/g, "") === e); }
  catch { return false; }
}
function lembrarCargoDePainel(config, roleId) {
  if (!config) return;
  config.corPainel ??= { cargos: [] };
  config.corPainel.cargos ??= [];
  if (!config.corPainel.cargos.includes(roleId)) config.corPainel.cargos.push(roleId);
  if (config.corPainel.cargos.length > MAX_CARGOS_PAINEL) config.corPainel.cargos.splice(0, config.corPainel.cargos.length - MAX_CARGOS_PAINEL);
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
  const r = await chamarApi(`/servers/${serverId}/roles/${roleId}`, {
    metodo: "PATCH",
    corpo: colour === null ? { remove: ["Colour"] } : { colour },
    ms: 15_000,
  });
  if (r.ok) return { ok: true };
  // (31 out 2026, R10) nada de nome de variável, código HTTP nem corpo da API na tela: vai ao log
  registrarErro("COR:api", r.erro ?? `HTTP ${r.status} ${String(r.texto ?? "").slice(0, 300)}`);
  if (r.erro) return { ok: false, erro: X3(en, "Não consegui falar com o Stoat agora — tente de novo.", "I couldn't reach the Stoat right now — try again.", "No pude comunicarme con Stoat ahora — inténtalo de nuevo.") };

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
  return { ok: false, erro: `${X3(en, "O Stoat recusou", "The Stoat refused it", "Stoat lo rechazó")}${dica}` };
}

export async function cmdCor(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  // para as funções acima e os textos montados em pedaços: "es" no servidor em espanhol
  const L = idiomaDe(ctx) === "es" ? "es" : en;
  const X = (pt, eng, es) => X3(L, pt, eng, es);

  const server = await getServer(message).catch(() => null);
  if (!server) return sendEmbed(message.channel, { description: tr(ctx, "❌ Só dentro de um servidor.", "❌ Only inside a server.", "❌ Solo dentro de un servidor."), colour: COR.erro });
  const erroUso = (pt, eng, es) => erroDeUso(ctx, message.channel, "cor", pt, eng, es);

  const sub = args[0]?.toLowerCase();

  // ── presets: os nomes prontos (os gradientes) ──
  if (sub === "presets" && !args[1]) {
    return sendEmbed(message.channel, { title: tr(ctx, "🌈 Presets", "🌈 Presets", "🌈 Predefinidos"), description: listaPresets(L), colour: COR.info });
  }

  // ── &cor sozinho (e `lista`): os cargos e as cores de hoje ──
  if (!sub || sub === "lista" || sub === "ajuda") {
    const lista = server.roles ? [...server.roles.entries()] : [];
    if (!lista.length) return sendEmbed(message.channel, { description: tr(ctx, "🎨 Nenhum cargo.", "🎨 No roles.", "🎨 Ningún rol."), colour: COR.info });
    const linhas = lista.map(([id, r]) => {
      const c = r?.colour ?? r?.color;
      const desc = !c ? "—" : /gradient/i.test(c) ? tr(ctx, "🌈 gradiente", "🌈 gradient", "🌈 degradado") : `\`${c}\``;
      return `• **${String(r?.name ?? id).slice(0, 40)}** — ${desc}`;
    });
    return enviarPaginado(ctx, message.channel, { paginas: paginarLinhas(linhas, { titulo: tr(ctx, "🎨 Cores dos cargos", "🎨 Role colors", "🎨 Colores de los roles") }), autorId: message.authorId, colour: COR.info });
  }

  // ── painel / criar → cria os cargos, publica o embed e liga tudo ──
  if (["painel", "criar", "criarpresets", "criartodos", "gerar"].includes(sub)) {
    if (membroTemPermissao && !membroTemPermissao(message, server, "ManageRole")) return semPermissao(ctx, message.channel, "ManageRole");

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
      // os nomes que valem são o resultado útil do erro
      const q = invalidos.map((i) => `\`${i.slice(0, 20).replace(/`/g, "")}\``).join(", ");
      return erroUso(`Não conheço: ${q}. **Sólidas:** ${listaSolidas(false)} · **Gradientes:** ${listaPresets(false)}`,
        `I don't know: ${q}. **Solid:** ${listaSolidas(true)} · **Gradients:** ${listaPresets(true)}`,
        `No conozco: ${q}. **Sólidos:** ${listaSolidas(true)} · **Degradados:** ${listaPresets(true)}`);
    }
    // o canal do painel tem de ser deste servidor — confere ANTES de criar cargos
    if (canalAlvoId && canalAlvoId !== message.channelId) {
      // (31 out 2026, R9) só canal DESTE servidor, e onde quem pede pode escrever
      const deste = canalDesteServidor(server, canalAlvoId);
      const alvo = deste ? (ctx.client?.channels?.get?.(deste.id) ?? await ctx.client?.channels?.fetch?.(deste.id)?.catch?.(() => null) ?? null) : null;
      if (alvo && !podeEscreverNoCanal(message, alvo, server, ctx)) {
        return sendEmbed(message.channel, { description: tr(ctx, `🚫 Sem permissão nesse canal: <#${canalAlvoId}>.`, `🚫 No permission in that channel: <#${canalAlvoId}>.`, `🚫 Sin permiso en ese canal: <#${canalAlvoId}>.`), colour: COR.erro });
      }
      if (!alvo) return sendEmbed(message.channel, { description: tr(ctx, "❌ Esse canal não é deste servidor.", "❌ That channel isn't on this server.", "❌ Ese canal no es de este servidor."), colour: COR.erro });
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
    // a espera é o resultado que importa enquanto ele trabalha (o Stoat aceita 5 mudanças a cada 10 s)
    const min = Math.ceil(seg / 60);
    await sendEmbed(message.channel, { description: tr(ctx,
      `🎨 Criando/pintando ${alvos.length} cargo(s).${seg >= 20 ? ` Leva uns **${min} min**.` : ""}`,
      `🎨 Creating/painting ${alvos.length} role(s).${seg >= 20 ? ` Takes about **${min} min**.` : ""}`,
      `🎨 Creando/pintando ${alvos.length} rol(es).${seg >= 20 ? ` Tarda unos **${min} min**.` : ""}`), colour: COR.info });

    const prontos = [], falhas = [];
    let novosCargos = 0, reaproveitados = 0;
    for (const it of alvos) {
      // o cargo já existe com o nome em português OU em inglês; o novo nasce no idioma do servidor
      const jaExiste = existentes.get(nomeDoItem(it, false)) ?? existentes.get(nomeDoItem(it, true));
      if (jaExiste && temPermissoes(jaExiste.r)) {
        falhas.push({ ...it, erro: X("já existe um cargo com esse nome, e ele tem permissões — renomeie-o", "a role with this name already exists and has permissions — rename it", "ya existe un rol con ese nombre y tiene permisos — cámbiale el nombre") });
        continue;
      }
      if (jaExiste && !ehCargoDePainel(ctx.config, serverId, jaExiste.id, emojiDoItem(it))) {
        falhas.push({ ...it, erro: X("já existe um cargo com esse nome que não é de um painel de cor — renomeie-o", "a role with this name already exists and isn't from a color panel — rename it", "ya existe un rol con ese nombre que no es de un panel de colores — cámbiale el nombre") });
        continue;
      }
      let roleId = jaExiste?.id ?? null;
      if (!roleId) {
        try {
          const r = await server.createRole(nomeDoItem(it, en));
          roleId = r?.id ?? r?._id ?? r;
        } catch (e) { const d = descreverErro(e, L === true ? "en" : L === false ? "pt" : L); falhas.push({ ...it, erro: X(`não consegui criar (${d})`, `couldn't create (${d})`, `no pude crearlo (${d})`) }); continue; }
      }
      const r = jaExiste && mesmaCor(jaExiste.r?.colour, valorDoItem(it)) ? { ok: true } : await aplicarCor(serverId, roleId, valorDoItem(it), L);
      if (!r.ok) { falhas.push({ ...it, erro: r.erro.split("\n")[0] }); continue; }
      // só conta depois de pintado (criado e não pintado ficava fora da conta e a deixava negativa)
      if (jaExiste) reaproveitados++; else novosCargos++;
      lembrarCargoDePainel(ctx.config, roleId);
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
      return sendEmbed(message.channel, { description: tr(ctx, `❌ Nenhum cargo pronto: ${listaFalhas(false)}`, `❌ No role ready: ${listaFalhas(true)}`, `❌ Ningún rol listo: ${listaFalhas(true)}`).slice(0, 1900), colour: COR.erro });
    }

    ctx.salvarConfig?.();   // a lista dos cargos de painel (corPainel.cargos)
    // ── 2. Só os cargos? termina aqui ──
    if (soCargos) {
      const extra = (en_) => (falhas.length ? `\n⚠️ ${listaFalhas(en_)}` : "");
      return sendEmbed(message.channel, { description: tr(ctx,
        `🎨 **${prontos.length}** cargo(s) pronto(s) (**${novosCargos}** criado(s), **${reaproveitados}** reaproveitado(s)): ${prontos.map((c) => `<%${c.roleId}>`).join(" ")}${extra(false)}`,
        `🎨 **${prontos.length}** role(s) ready (**${novosCargos}** created, **${reaproveitados}** reused): ${prontos.map((c) => `<%${c.roleId}>`).join(" ")}${extra(true)}`,
        `🎨 **${prontos.length}** rol(es) listo(s) (**${novosCargos}** creado(s), **${reaproveitados}** reutilizado(s)): ${prontos.map((c) => `<%${c.roleId}>`).join(" ")}${extra(true)}`).slice(0, 1900), colour: falhas.length ? COR.aviso : COR.sucesso });
    }

    // ── 3. Publica o painel no canal escolhido ──
    const destinoId = canalAlvoId ?? message.channelId;
    let canal = null;
    try {
      canal = destinoId === message.channelId ? message.channel
        : (ctx.client?.channels?.get?.(destinoId) ?? await ctx.client?.channels?.fetch?.(destinoId));
    } catch {}
    if (destinoId !== message.channelId && !canalDesteServidor(server, destinoId)) canal = null;   // canal de outro servidor: não
    if (!canal?.sendMessage) return sendEmbed(message.channel, { description: tr(ctx, "❌ Canal não encontrado neste servidor.", "❌ Channel not found on this server.", "❌ Canal no encontrado en este servidor."), colour: COR.erro });

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
        if (n === 0) return sendEmbed(message.channel, { description: tr(ctx, `❌ Não consegui publicar: ${descreverErro(e, "pt")}`, `❌ Couldn't publish: ${descreverErro(e, "en")}`, `❌ No pude publicar: ${descreverErro(e, "es")}`), colour: COR.erro });
        semReacao.push(`${TITULO[parte.tipo][chaveTitulo]} (${descreverErro(e, chaveTitulo)})`);
        continue;
      }

      const painelId = painelMsg?.id ?? painelMsg?._id;
      if (!painelId) return sendEmbed(message.channel, { description: tr(ctx, "⚠️ Publiquei, mas sem o ID da mensagem as reações não foram ligadas.", "⚠️ Published, but without the message ID the reactions weren't wired.", "⚠️ Publicado, pero sin el ID del mensaje las reacciones no se conectaron."), colour: COR.aviso });

      // ── 4. Reage e registra cada cor ──
      for (const c of parte.itens) {
        const emoji = emojiDoItem(c);
        if (!emoji) continue;
        try {
          db.addReactionRole(serverId, painelId, emoji.replace(/️/g, ""), c.roleId, destinoId);
          await painelMsg.react(encodeURIComponent(emoji));
          ligados++;
        } catch (e) {
          semReacao.push(`${nomeDoItem(c, en)} (${descreverErro(e, chaveTitulo)})`);
        }
        await new Promise((s) => setTimeout(s, 300));   // limite de taxa das reações
      }
      db.setReactionRoleExclusivo(painelId, true);
      publicadas.push(painelId);
    }
    // as mensagens do painel valem como uma só no modo exclusivo
    if (publicadas.length > 1) db.setReactionRoleGrupo(publicadas, publicadas[0]);

    const n = publicadas.length;
    const pend = (l3) => [falhas.length ? X3(l3, `⚠️ **Não entraram:** ${listaFalhas(false)}`, `⚠️ **Left out:** ${listaFalhas(true)}`, `⚠️ **No entraron:** ${listaFalhas(true)}`) : null,
      semReacao.length ? X3(l3, `⚠️ **Sem reação:** `, `⚠️ **No reaction:** `, `⚠️ **Sin reacción:** `) + semReacao.slice(0, 4).join(", ") : null].filter(Boolean).map((x) => `\n${x}`).join("");
    return sendEmbed(message.channel, { description: tr(ctx,
      `✅ Painel em <#${destinoId}>: **${ligados}** cor(es)${n > 1 ? ` (${n} mensagens)` : ""} · **${novosCargos}** cargo(s) criado(s), **${reaproveitados}** reaproveitado(s).${pend(false)}`,
      `✅ Panel in <#${destinoId}>: **${ligados}** color(s)${n > 1 ? ` (${n} messages)` : ""} · **${novosCargos}** role(s) created, **${reaproveitados}** reused.${pend(true)}`,
      `✅ Panel en <#${destinoId}>: **${ligados}** color(es)${n > 1 ? ` (${n} mensajes)` : ""} · **${novosCargos}** rol(es) creado(s), **${reaproveitados}** reutilizado(s).${pend("es")}`).slice(0, 1900), colour: (falhas.length || semReacao.length) ? COR.aviso : COR.sucesso });
  }

  // A partir daqui mexe em cargo → precisa de permissão
  if (membroTemPermissao && !membroTemPermissao(message, server, "ManageRole")) return semPermissao(ctx, message.channel, "ManageRole");

  const achado = separarCargoECor(server, args);
  const cargo = achado.cargo;
  if (!cargo) {
    const alvo = String(achado.alvo || args[0] || "").slice(0, 40).replace(/`/g, "");
    if (achado.ambiguos) {
      const nomes = achado.ambiguos.map((c) => `**${String(c.nome).slice(0, 32)}**`).join(", ");
      return erroUso(`Mais de um cargo: ${nomes}`, `More than one role: ${nomes}`, `Más de un rol: ${nomes}`);
    }
    if (achado.exemplo) return erroUso("Qual cargo?", "Which role?", "¿Qué rol?");
    return erroUso(`Não achei o cargo \`${alvo}\``, `Couldn't find the role \`${alvo}\``, `No encontré el rol \`${alvo}\``);
  }

  // (31 out 2026, R6) quem pinta tem de estar ACIMA do cargo (como no &reactionrole)
  {
    const pode = await podeUsarCargo(server, message, cargo.id, ctx);
    if (!pode.ok) return sendEmbed(message.channel, { description: tr(ctx, `🚫 Acima de você: ${pode.pt}.`, `🚫 Above you: ${pode.en}.`, `🚫 Por encima de ti: ${pode.es ?? pode.en}.`), colour: COR.erro });
  }

  const resto = achado.resto;
  if (!resto.length) return erroUso("Qual cor?", "Which color?", "¿Qué color?");
  const { colour, descricao, erro } = lerCorPedida(resto, L);
  if (erro) return erroUso(...erro);

  if (colour !== null && /gradient/i.test(colour) && !corAceitaPeloStoat(colour)) {
    const motivos = motivoDoGradiente(colour, L).join(" · ");
    return erroUso(motivos, motivos, motivos);
  }
  const r = await aplicarCor(serverId, cargo.id, colour, L);
  if (!r.ok) return sendEmbed(message.channel, { description: tr(ctx, `❌ Não consegui aplicar: ${r.erro}`, `❌ Couldn't apply it: ${r.erro}`, `❌ No pude aplicarlo: ${r.erro}`), colour: COR.erro });
  const nome = String(cargo.nome).slice(0, 40);
  return sendEmbed(message.channel, { description: tr(ctx, `🎨 **${nome}** → ${descricao[0]}`, `🎨 **${nome}** → ${descricao[1]}`, `🎨 **${nome}** → ${descricao[2]}`),
    colour: colour && !/gradient/i.test(colour) ? colour : COR.sucesso });
}

// A cor pedida depois do cargo (P2): uma cor = sólida; duas ou mais = gradiente (um
// número no começo é o ângulo); nome de preset = preset; `remover` = a padrão; CSS
// colado (`linear-gradient(…)`) passa pela checagem do Stoat. As palavras antigas
// `gradiente` e `preset` continuam valendo na frente.
// → { colour, descricao: [pt, en, es] } | { erro: [pt, en, es] }
export function lerCorPedida(resto, L = false) {
  let tokens = [...resto];
  const acao = String(tokens[0] ?? "").toLowerCase();
  if (["remover", "remove", "limpar", "padrao", "padrão", "reset"].includes(acao) && tokens.length === 1) {
    return { colour: null, descricao: ["cor padrão", "default color", "color predeterminado"] };
  }
  // `preset <nome>` ou só o nome
  if (["preset", "pronto"].includes(acao) || (tokens.length === 1 && !corSolida(acao) && presetDe(acao))) {
    const nome = presetDe(acao === "preset" || acao === "pronto" ? tokens[1] : acao);
    if (!nome || !PRESETS[nome]) return { erro: ["Preset desconhecido", "Unknown preset", "Predefinido desconocido"] };
    return { colour: PRESETS[nome], descricao: [`preset **${nome}**`, `preset **${nomePreset(nome, true)}**`, `predefinido **${nomePreset(nome, true)}**`] };
  }
  if (["gradiente", "gradient", "grad"].includes(acao)) tokens = tokens.slice(1);
  // ângulo opcional + 2 ou mais cores = gradiente
  let angulo = 90;
  const ang = String(tokens[0] ?? "").match(/^(\d{1,3})(?:deg|°)?$/i);
  const cores = (ang ? tokens.slice(1) : tokens).map((t) => corSolida(t));
  if (cores.length >= 2 && cores.every(Boolean)) {
    if (ang) angulo = Number(ang[1]) % 360;
    return { colour: montarGradiente(cores, angulo), descricao: [`gradiente de ${cores.length} cores`, `${cores.length}-color gradient`, `degradado de ${cores.length} colores`] };
  }
  if (["gradiente", "gradient", "grad"].includes(acao)) return { erro: ["Um gradiente precisa de 2+ cores válidas", "A gradient needs 2+ valid colors", "Un degradado necesita 2+ colores válidos"] };
  // uma cor só, ou CSS colado
  const v = validarCss(tokens.join(" "), L);
  if (!v) {
    const e = tokens.join(" ").slice(0, 40).replace(/`/g, "");
    return { erro: [`Não entendi a cor \`${e}\``, `I didn't understand the color \`${e}\``, `No entendí el color \`${e}\``] };
  }
  if (v.erro) return { erro: [v.erro, v.erro, v.erro] };
  // a escrita foi arrumada para o formato do Stoat (espaços, °, %): o resultado diz
  const aj = v.arrumado ? [" _(escrita ajustada ao formato do Stoat)_", " _(fixed the spacing to Stoat's format)_", " _(escritura ajustada al formato de Stoat)_"] : ["", "", ""];
  return /gradient/i.test(v.valor)
    ? { colour: v.valor, descricao: ["gradiente" + aj[0], "gradient" + aj[1], "degradado" + aj[2]] }
    : { colour: v.valor, descricao: [`\`${v.valor}\`` + aj[0], `\`${v.valor}\`` + aj[1], `\`${v.valor}\`` + aj[2]] };
}
