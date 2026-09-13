
import * as lerCodigo from "./ler-codigo.js";
import * as calcular  from "./calcular.js";
import * as rss       from "./rss.js";
import * as buscarWeb from "./buscar-web.js";
import * as verImagem from "./ver-imagem.js";
import * as gerarImagem from "./gerar-imagem.js";

const MODULOS = [lerCodigo, calcular, rss, buscarWeb, verImagem, gerarImagem];

import { existsSync } from "node:fs";

if (!process.env.LLM_MODEL_VISAO) MODULOS.splice(MODULOS.indexOf(verImagem), 1);

// gerar_imagem liga com QUALQUER um dos dois motores: SD_URL (A1111/Forge
// externo) OU o sd-cpp embutido que a imagem Docker já traz — o gate antigo
// só conhecia o externo e removia a ferramenta em silêncio no modo padrão.
const sdBin = process.env.SD_BIN || "/usr/local/bin/sd-cpp";
const imagemLigada = (process.env.IMAGEM ?? "1").trim() !== "0";
const temGerador = !!process.env.SD_URL || existsSync(sdBin);
if (!imagemLigada || !temGerador) {
  MODULOS.splice(MODULOS.indexOf(gerarImagem), 1);
  console.log(`[IA] gerar_imagem desligada: ${!imagemLigada ? "IMAGEM=0" : `sem SD_URL e sem binário embutido em ${sdBin}`}`);
}

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
