// As builds do RPG (P2, 31 out 2026): a escolha do jogador. Os pontos, o
// equipamento e as magias saem dela, sozinhos (evolucionador.js). Os dados estão
// em dados/builds.json; aqui só se lê, se confere e se acha pelo nome.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "./regras.js";

const ARQ = path.join(path.dirname(fileURLToPath(import.meta.url)), "dados", "builds.json");
const BRUTO = JSON.parse(fs.readFileSync(ARQ, "utf8"));
const IDIOMAS = ["pt", "en", "es"];
const TIPOS_ARMA = new Set(["branca", "fogo", "magica", ...Object.keys(R.ARMAS), "branca_leve", "fogo_leve", "magica_leve"]);

// Confere uma build (o boot para se o JSON estiver errado — Regra do Reparo)
export function validarBuild(b) {
  const erros = [];
  if (!/^[a-z_]+$/.test(b?.id ?? "")) erros.push(`id inválido: ${b?.id}`);
  for (const campo of ["nome", "desc"]) for (const l of IDIOMAS) if (!String(b?.[campo]?.[l] ?? "").trim()) erros.push(`${b?.id}: falta ${campo}.${l}`);
  const soma = Object.values(b?.dist ?? {}).reduce((s, x) => s + x, 0);
  if (Math.abs(soma - 1) > 1e-6) erros.push(`${b?.id}: dist soma ${soma}`);
  for (const k of Object.keys(b?.dist ?? {})) if (!R.ATR.includes(k)) erros.push(`${b?.id}: atributo desconhecido ${k}`);
  if (!(b?.peso > 0 && b.peso < 1)) erros.push(`${b?.id}: peso fora de (0, 1)`);
  if (!Array.isArray(b?.armas) || !b.armas.length || b.armas.some((a) => !TIPOS_ARMA.has(a))) erros.push(`${b?.id}: armas inválidas`);
  for (const e of b?.estilo ?? []) if (e[0] !== "escudo" && (!R.ARMAS[e[0]] || !["1m", "2m"].includes(e[1]))) erros.push(`${b?.id}: estilo inválido ${e.join(" ")}`);
  for (const m of b?.magias ?? []) if (!["ataque", "suporte"].includes(m)) erros.push(`${b?.id}: escola desconhecida ${m}`);
  return erros;
}

export const BUILDS = Object.fromEntries(BRUTO.builds.map((b) => [b.id, Object.freeze({ apelidos: [], magias: [], ...b })]));
export const LISTA = Object.values(BUILDS);
export const PADRAO = BRUTO.padrao;
{
  const erros = LISTA.flatMap(validarBuild);
  if (!BUILDS[PADRAO]) erros.push(`a build padrão "${PADRAO}" não existe`);
  if (erros.length) throw new Error(`[RPG] builds.json inválido: ${erros.join("; ")}`);
}

const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s_-]+/g, "");
// Pelo id, pelo nome em qualquer idioma ou por um apelido (as classes do v4); depois pelo começo
export function acharBuild(txt) {
  const a = semAcento(txt);
  if (!a) return null;
  const nomes = (b) => [b.id, ...IDIOMAS.map((l) => b.nome[l]), ...b.apelidos].map(semAcento);
  return LISTA.find((b) => nomes(b).includes(a)) ?? (a.length >= 3 ? LISTA.find((b) => nomes(b).some((n) => n.startsWith(a))) : null) ?? null;
}
// A build guardada no personagem (a coluna `classe`); a padrão se não houver
export const buildDe = (p) => acharBuild(p?.classe) ?? BUILDS[PADRAO];
