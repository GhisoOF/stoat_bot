// &fuso — conversor de horário e relógio (P2, 31 out 2026).
//
//   &fuso 21:30 [cidade]   o timestamp daquele horário (cada pessoa vê no próprio fuso)
//   &fuso [cidade]         a hora atual lá (sem cidade: a lista do servidor, ou o fuso padrão)
//   &fuso add|remove <cidade>   a lista do servidor (ManageMessages)
//
// Sem cidade, o horário é lido no fuso do servidor (`fusoDoServidor`: a cidade de
// referência da lista, senão o fuso do idioma — pt → São Paulo, es → Madrid, en → UTC).
// Os subcomandos antigos (`ver`, `buscar`, `apelido`, `principal`, `formato`, `limpar`)
// continuam funcionando, fora da ajuda.

import { buscarFuso, agoraEm, diferenca, cidadeDoFuso, fusoDoServidor, lerHorario, instanteEm } from "../core/fusos.js";
import { lingua, idiomaDe } from "../core/i18n.js";
import { carimbo } from "../core/tempo.js";
import { responder, erroDeUso, erro, semPermissao } from "../core/saida.js";

const LIMITE = 12;   // além disso o embed vira parede de texto

function garantirConfig(config) {
  config.fusos ??= {};
  config.fusos.lista ??= [];        // [{ zona, apelido }]
  config.fusos.principal ??= null;  // zona de referência das diferenças
  config.fusos.formato24 ??= true;
  return config.fusos;
}

const rotulo = (item) => item.apelido || cidadeDoFuso(item.zona);

function naoAchei(ctx, canal, termo, candidatos) {
  const t = String(termo).slice(0, 60);
  const sug = candidatos.length ? ` (${candidatos.slice(0, 5).map((z) => cidadeDoFuso(z)).join(", ")})` : "";
  return erro(ctx, canal, `Cidade não encontrada: \`${t}\`${sug}.`, `City not found: \`${t}\`${sug}.`, `Ciudad no encontrada: \`${t}\`${sug}.`);
}

// "21:30 · Madrid → <t:…:t> (<t:…:R>)" — a linha do conversor. Exportada para o teste.
export function converter(hm, zona, base = new Date()) {
  const t = instanteEm(hm, zona, base);
  const hh = `${String(hm.h).padStart(2, "0")}:${String(hm.m).padStart(2, "0")}`;
  return { instante: t, linha: `**${hh}** ${cidadeDoFuso(zona)} → ${carimbo(t, "F")} (${carimbo(t, "R")})\n\`${carimbo(t, "t")}\`` };
}

// A hora agora numa cidade, em uma linha.
function horaLa(zona, lang, formato24) {
  const t = agoraEm(zona, { lang, formato24 });
  return `**${t.hora}** · ${t.diaSemana} ${t.data} — ${cidadeDoFuso(zona)} (${t.offset})`;
}

export async function cmdFuso(message, args, ctx) {
  const { config, getServer, membroTemPermissao, salvarConfig } = ctx;
  const canal = message.channel;
  const lang = lingua(ctx);
  const cfg = garantirConfig(config);
  const padrao = fusoDoServidor(config, idiomaDe(ctx));

  const sub = args[0]?.toLowerCase();
  const resto = args.slice(1).join(" ").trim();

  // ── &fuso 21:30 [cidade] → o timestamp ──
  const hm = lerHorario(args[0]);
  if (hm) {
    let zona = padrao;
    if (resto) {
      const r = buscarFuso(resto);
      if (!r.exato) return naoAchei(ctx, canal, resto, r.candidatos);
      zona = r.exato;
    }
    const { linha } = converter(hm, zona);
    return responder(ctx, canal, linha, linha, linha, "info");
  }

  // ── &fuso → a lista do servidor, ou a hora no fuso padrão ──
  if (!sub || sub === "lista" || sub === "list") {
    if (!cfg.lista.length) return responder(ctx, canal, horaLa(padrao, lang, cfg.formato24), horaLa(padrao, lang, cfg.formato24), horaLa(padrao, "es", cfg.formato24), "info");
    const quando = new Date();
    // do fuso mais atrasado ao mais adiantado — a leitura natural
    const ordenada = [...cfg.lista].sort((a, b) => agoraEm(a.zona, { quando }).offsetMin - agoraEm(b.zona, { quando }).offsetMin);
    const principal = cfg.principal && cfg.lista.some((i) => i.zona === cfg.principal) ? cfg.principal : null;
    const linhas = (l) => ordenada.map((item) => {
      const t = agoraEm(item.zona, { lang: l, formato24: cfg.formato24, quando });
      const dif = !principal ? ""
        : item.zona === principal ? ` · _${l === "es" ? "referencia" : l === "en" ? "reference" : "referência"}_`
        : ` · _${diferenca(item.zona, principal, l, quando)}_`;
      return `**${t.hora}** — ${rotulo(item)} · ${t.diaSemana} ${t.data} · ${t.offset}${dif}`;
    }).join("\n");
    return responder(ctx, canal, linhas("pt"), linhas("en"), linhas("es"), "info");
  }

  // ── &fuso ver <cidade> · &fuso buscar <termo> (fora da ajuda) ──
  if (["ver", "hora", "agora", "check", "now", "time"].includes(sub)) {
    if (!resto) return erroDeUso(ctx, canal, "fuso", "Faltou a cidade.", "Missing city.", "Falta la ciudad.");
    const r = buscarFuso(resto);
    if (!r.exato) return naoAchei(ctx, canal, resto, r.candidatos);
    return responder(ctx, canal, horaLa(r.exato, "pt", cfg.formato24), horaLa(r.exato, "en", cfg.formato24), horaLa(r.exato, "es", cfg.formato24), "info");
  }
  if (["buscar", "procurar", "search", "find"].includes(sub)) {
    if (!resto) return erroDeUso(ctx, canal, "fuso", "Faltou o termo.", "Missing search term.", "Falta el término.");
    const r = buscarFuso(resto);
    const achados = r.exato ? [r.exato, ...r.candidatos] : r.candidatos;
    if (!achados.length) return naoAchei(ctx, canal, resto, []);
    const lista = (l) => achados.slice(0, 10).map((z) => `**${cidadeDoFuso(z)}** — ${agoraEm(z, { lang: l, formato24: cfg.formato24 }).hora} · \`${z}\``).join("\n");
    return responder(ctx, canal, lista("pt"), lista("en"), lista("es"), "info");
  }

  const CONFIG = ["add", "adicionar", "incluir", "remove", "remover", "rem", "del", "tirar",
    "apelido", "nome", "rotulo", "rótulo", "alias", "label", "name",
    "principal", "referencia", "referência", "base", "main", "reference",
    "formato", "format", "hora12", "hora24", "limpar", "clear", "reset"];

  // ── &fuso <cidade> → a hora lá ──
  if (!CONFIG.includes(sub)) {
    const r = buscarFuso(args.join(" "));
    if (!r.exato) return naoAchei(ctx, canal, args.join(" "), r.candidatos);
    return responder(ctx, canal, horaLa(r.exato, "pt", cfg.formato24), horaLa(r.exato, "en", cfg.formato24), horaLa(r.exato, "es", cfg.formato24), "info");
  }

  // ── daqui em diante: configuração (ManageMessages) ──
  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "ManageMessages")) return semPermissao(ctx, canal, "ManageMessages");

  if (["add", "adicionar", "incluir"].includes(sub)) {
    if (!resto) return erroDeUso(ctx, canal, "fuso", "Faltou a cidade.", "Missing city.", "Falta la ciudad.");
    if (cfg.lista.length >= LIMITE) return erro(ctx, canal, `Lista cheia (${LIMITE} cidades).`, `The list is full (${LIMITE} cities).`, `Lista llena (${LIMITE} ciudades).`);
    const r = buscarFuso(resto);
    if (!r.exato) return naoAchei(ctx, canal, resto, r.candidatos);
    const nome = cidadeDoFuso(r.exato);
    if (cfg.lista.some((i) => i.zona === r.exato)) return responder(ctx, canal, `🕐 **${nome}** já está na lista.`, `🕐 **${nome}** is already on the list.`, `🕐 **${nome}** ya está en la lista.`, "aviso");
    cfg.lista.push({ zona: r.exato, apelido: null });
    if (!cfg.principal) cfg.principal = r.exato;   // a primeira vira referência
    salvarConfig?.();
    return responder(ctx, canal, `✅ **${nome}** adicionada.`, `✅ **${nome}** added.`, `✅ **${nome}** añadida.`);
  }

  if (["remove", "remover", "rem", "del", "tirar"].includes(sub)) {
    if (!resto) return erroDeUso(ctx, canal, "fuso", "Faltou a cidade.", "Missing city.", "Falta la ciudad.");
    const r = buscarFuso(resto);
    const porApelido = cfg.lista.find((i) => (i.apelido ?? "").toLowerCase() === resto.toLowerCase());   // "casa da vó"
    const zona = porApelido?.zona ?? r.exato;
    if (!zona) return naoAchei(ctx, canal, resto, r.candidatos);
    const antes = cfg.lista.length;
    cfg.lista = cfg.lista.filter((i) => i.zona !== zona);
    if (cfg.principal === zona) cfg.principal = cfg.lista[0]?.zona ?? null;
    salvarConfig?.();
    const nome = cidadeDoFuso(zona);
    return cfg.lista.length < antes
      ? responder(ctx, canal, `🗑️ **${nome}** removida.`, `🗑️ **${nome}** removed.`, `🗑️ **${nome}** quitada.`)
      : responder(ctx, canal, `**${nome}** não estava na lista.`, `**${nome}** wasn't on the list.`, `**${nome}** no estaba en la lista.`, "aviso");
  }

  if (["apelido", "nome", "rotulo", "rótulo", "alias", "label", "name"].includes(sub)) {
    const partes = resto.split(/\s+/);
    let alvo = null, texto = "";
    for (let corte = partes.length; corte >= 1; corte--) {
      const item = cfg.lista.find((i) => i.zona === buscarFuso(partes.slice(0, corte).join(" ")).exato);
      if (item) { alvo = item; texto = partes.slice(corte).join(" ").trim(); break; }
    }
    if (!alvo) return erroDeUso(ctx, canal, "fuso", "A cidade não está na lista.", "That city isn't on the list.", "La ciudad no está en la lista.");
    if (!texto || ["limpar", "clear", "off", "reset"].includes(texto.toLowerCase())) {
      alvo.apelido = null; salvarConfig?.();
      const n = cidadeDoFuso(alvo.zona);
      return responder(ctx, canal, `✅ **${n}** sem apelido.`, `✅ **${n}** has no label.`, `✅ **${n}** sin apodo.`);
    }
    alvo.apelido = texto.slice(0, 40);
    salvarConfig?.();
    const n = cidadeDoFuso(alvo.zona);
    return responder(ctx, canal, `✅ **${n}** → **${alvo.apelido}**`, `✅ **${n}** → **${alvo.apelido}**`, `✅ **${n}** → **${alvo.apelido}**`);
  }

  if (["principal", "referencia", "referência", "base", "main", "reference"].includes(sub)) {
    const r = buscarFuso(resto);
    if (!r.exato || !cfg.lista.some((i) => i.zona === r.exato)) return erroDeUso(ctx, canal, "fuso", "A referência tem de estar na lista.", "The reference must be on the list.", "La referencia tiene que estar en la lista.");
    cfg.principal = r.exato; salvarConfig?.();
    const n = cidadeDoFuso(r.exato);
    return responder(ctx, canal, `✅ Referência: **${n}**.`, `✅ Reference: **${n}**.`, `✅ Referencia: **${n}**.`);
  }

  if (["formato", "format", "hora12", "hora24"].includes(sub)) {
    const q12 = /12/.test(resto) || sub === "hora12", q24 = /24/.test(resto) || sub === "hora24";
    if (!q12 && !q24) return erroDeUso(ctx, canal, "fuso", "Formato: 12 ou 24.", "Format: 12 or 24.", "Formato: 12 o 24.");
    cfg.formato24 = q24; salvarConfig?.();
    const ex = agoraEm(cfg.principal ?? "UTC", { lang, formato24: cfg.formato24 }).hora;
    return responder(ctx, canal, `✅ Formato: **${ex}**`, `✅ Format: **${ex}**`, `✅ Formato: **${ex}**`);
  }

  // limpar
  cfg.lista = []; cfg.principal = null; salvarConfig?.();
  return responder(ctx, canal, "🗑️ Lista esvaziada.", "🗑️ List cleared.", "🗑️ Lista vaciada.");
}
