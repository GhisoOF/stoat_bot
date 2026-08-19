// ══════════════════════════════════════════════════════════
//  index.js — registro central das ferramentas
//
//  Para adicionar uma ferramenta nova: crie o arquivo exportando
//  `definicao` (schema no formato do Ollama) e `executar(args)`,
//  e registre aqui. Mais nada muda.
// ══════════════════════════════════════════════════════════

import * as lerCodigo from "./ler-codigo.js";
import * as calcular  from "./calcular.js";
import * as rss       from "./rss.js";
import * as buscarWeb from "./buscar-web.js";

const MODULOS = [lerCodigo, calcular, rss, buscarWeb];

// Ferramentas podem ser desligadas por env: FERRAMENTAS_OFF=calcular,buscar_rss
const desligadas = new Set(
  (process.env.FERRAMENTAS_OFF || "").split(",").map((s) => s.trim()).filter(Boolean),
);

const registro = new Map();
for (const m of MODULOS) {
  const nome = m.definicao?.function?.name;
  if (!nome || desligadas.has(nome)) continue;
  registro.set(nome, m);
}

// Schemas para mandar ao Ollama no campo `tools`.
export function definicoes() {
  return [...registro.values()].map((m) => m.definicao);
}

export function nomes() { return [...registro.keys()]; }

// Executa uma ferramenta pelo nome. Nunca lança: erro vira resultado.
export async function executar(nome, args) {
  const mod = registro.get(nome);
  if (!mod) return { erro: `Ferramenta desconhecida: ${nome}` };
  try {
    return await mod.executar(args || {});
  } catch (e) {
    return { erro: `Falha em ${nome}: ${(e?.message ?? e).toString().slice(0, 300)}` };
  }
}
