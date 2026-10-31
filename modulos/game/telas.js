// O que o &game escreve na tela (P2, 31 out 2026): os rótulos do motor e os nomes
// do catálogo no idioma de quem lê (pt | en | es), números, barras e o envio.
// Os rótulos estão em dados/rotulos.json; o espanhol do catálogo em
// dados/catalogo-es.json (o pt e o en vêm do próprio conteúdo).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { citar, citarInterno, trechoPronto } from "../core/aliases.js";
import { idiomaDe } from "../core/i18n.js";

const DADOS = path.join(path.dirname(fileURLToPath(import.meta.url)), "dados");
const ler = (n) => JSON.parse(fs.readFileSync(path.join(DADOS, n), "utf8"));
export const ROTULOS = ler("rotulos.json");
export const CATALOGO_ES = ler("catalogo-es.json");

export const idioma = (ctx) => idiomaDe(ctx);
// O texto do idioma: pt | en | es
export const T = (l, pt, en, es) => (l === "es" ? es : l === "en" ? en : pt);
const doIdioma = (v, l) => v?.[l] ?? v?.en ?? v?.pt ?? "";
// Um comando citado: no pt/en a tela traduz a marca; no espanhol sai pronto
export const cmd = (l, ref, P = "&") => (l === "es" ? citar(ref, "es", P) : citarInterno(ref, P));

// ── Rótulos do motor ─────────────────────────────────────────────────────────
export const atributo = (k, l) => doIdioma(ROTULOS.atributos[k]?.nome, l) || k;
export const emojiAtributo = (k) => ROTULOS.atributos[k]?.emoji ?? "";
export const efeitoAtributo = (k, l) => doIdioma(ROTULOS.atributos[k]?.efeito, l);
export const raridade = (r, l) => doIdioma(ROTULOS.raridades[r]?.nome, l) || r;
export const emojiRaridade = (r) => ROTULOS.raridades[r]?.emoji ?? "";
export const faixa = (n, l) => doIdioma(ROTULOS.faixas[String(n)], l);
export const classeAliado = (c, l) => doIdioma(ROTULOS.classesAliado[c]?.nome, l) || c;
export const emojiClasse = (c) => ROTULOS.classesAliado[c]?.emoji ?? "";
export const efeitoClasse = (c, l) => doIdioma(ROTULOS.classesAliado[c]?.efeito, l);
export const tipoMissao = (t, l) => doIdioma(ROTULOS.missoes[t]?.nome, l) || t;
export const emojiMissao = (t) => ROTULOS.missoes[t]?.emoji ?? "";
export const desfecho = (d, l) => `${ROTULOS.desfechos[d]?.emoji ?? ""} ${doIdioma(ROTULOS.desfechos[d]?.nome, l)}`.trim();
export const nomeBuild = (b, l) => doIdioma(b?.nome, l);
export const descBuild = (b, l) => doIdioma(b?.desc, l);

// ── Nomes do catálogo ────────────────────────────────────────────────────────
const ES = CATALOGO_ES;
export function nomeAliado(cat, l) {
  if (!cat) return "?";
  if (l === "es") return ES.aliados[cat.id] ?? cat.dados?.nomeEN ?? cat.nome;
  return l === "en" ? (cat.dados?.nomeEN ?? cat.nome) : cat.nome;
}
export function nomeMagia(m, l) {
  if (!m) return "?";
  if (l === "es") return ES.magias[m.id] ?? m.nomeEN ?? m.nome;
  return l === "en" ? (m.nomeEN ?? m.nome) : m.nome;
}
export function nomeItem(it, l) {
  if (!it) return "?";
  if (l !== "es") return l === "en" ? (it.nomeEN ?? it.nome) : it.nome;
  if (ES.itens[it.id]) return ES.itens[it.id];
  if (it.dados?.tipo === "contrato") return `Contrato: ${ES.aliados[it.dados.companheiro] ?? it.nomeEN}`;
  if (it.dados?.tipo === "pergaminho") return `Pergamino: ${ES.magias[it.dados.magia] ?? it.nomeEN}`;
  return it.nomeEN ?? it.nome;
}
export function nomeDungeon(d, l) {
  if (!d) return "?";
  if (l === "es") return ES.dungeons[d.id] ?? d.nomeEN ?? d.nome;
  return l === "en" ? (d.nomeEN ?? d.nome) : d.nome;
}
// Missão: contrato, especial e chefe pelo id; o encontro de dungeon pelo nome da dungeon
export function nomeMissao(m, l) {
  if (!m) return "?";
  if (m.tipo === "dungeon" || m.tipo === "dungeon-encontro") return nomeDungeon({ id: m.dungeon, nome: m.nome, nomeEN: m.nomeEN }, l);
  if (l === "es") return ES.missoes[m.id] ?? m.nomeEN ?? m.nome;
  return l === "en" ? (m.nomeEN ?? m.nome) : m.nome;
}
// Os ids do catálogo que aparecem na tela e precisam de nome em espanhol (o teste confere)
export function idsSemEspanhol(C) {
  const falta = [];
  for (const it of C.ITENS.values()) if (!["contrato", "pergaminho"].includes(it.slot) && !ES.itens[it.id]) falta.push(it.id);
  for (const c of C.COMPANHEIROS.values()) if (!ES.aliados[c.id]) falta.push(c.id);
  for (const m of C.MAGIAS) if (!ES.magias[m.id]) falta.push(m.id);
  for (const m of [...C.CONTRATOS, ...C.ESPECIAIS, ...C.CHEFES.values()]) if (!ES.missoes[m.id]) falta.push(m.id);
  for (const d of C.DUNGEONS.values()) if (!ES.dungeons[d.id]) falta.push(d.id);
  return falta;
}

// ── Números ──────────────────────────────────────────────────────────────────
export function fmt(n, l = "pt") {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString(l === "en" ? "en-US" : l === "es" ? "es-ES" : "pt-BR", { useGrouping: Math.abs(v) >= 10000 || l !== "es" });
}
export const pct = (x) => `${Math.round(Math.max(0, Math.min(1, x ?? 0)) * 100)}%`;
export function barra(fracao, largura = 10) {
  const v = Math.max(0, Math.min(1, fracao || 0)), cheias = Math.round(v * largura);
  return "▰".repeat(cheias) + "▱".repeat(largura - cheias);
}
export const ouro = (n, l) => `🪙 ${fmt(n, l)}`;

// ── Envio ────────────────────────────────────────────────────────────────────
// O embed já está no idioma `l`; no espanhol ele sai pronto (a tradução da tela não mexe)
export function embed(l, e) {
  if (l !== "es") return e;
  return { ...e, title: trechoPronto(e.title), description: trechoPronto(e.description) };
}
export const enviar = (ctx, canal, l, e) => ctx.sendEmbed(canal, embed(l, e));
