
import * as lerCodigo from "./ler-codigo.js";
import * as calcular  from "./calcular.js";
import * as rss       from "./rss.js";
import * as buscarWeb from "./buscar-web.js";
import * as verImagem from "./ver-imagem.js";
import * as gerarImagem from "./gerar-imagem.js";

const MODULOS = [lerCodigo, calcular, rss, buscarWeb, verImagem, gerarImagem];

if (!process.env.LLM_MODEL_VISAO) MODULOS.splice(MODULOS.indexOf(verImagem), 1);
if (!process.env.SD_URL) MODULOS.splice(MODULOS.indexOf(gerarImagem), 1);

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
