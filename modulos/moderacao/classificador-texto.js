// classificador-texto.js — o classificador de texto pequeno (P5, 3 nov 2026; contrato 2 do BRIEF-P5).
//
// A bateria do dono treina, fora do repositório, uma regressão logística um-contra-todos por
// classe sobre os sinais de texto-sinais.js e grava `dados/classificador-texto.json`. Aqui o
// bot só LÊ esse arquivo e faz a conta: p = sigmoide(viés + Σ peso·valor) para cada classe.
//
// Como o resultado entra na moderação: é um SINAL na nota do sentinela (scorecard.js,
// `classificador`), com teto de pontos abaixo do menor limiar possível — sozinho, nunca pune
// (ver PONTOS_POR_CLASSE / TETO_PONTOS no scorecard). Um modelo ruim se desliga com
// `CLASSIFICADOR_TEXTO=0` no .env.
//
// Sem arquivo, arquivo de outra versão dos sinais ou arquivo inválido: o bot segue SEM o
// sinal, com uma linha no log (Reparo: falha alto no log, nunca derruba a moderação).
// Carregado sob demanda, na primeira mensagem que o sentinela olha (R11).
//
// (3 nov 2026, P5, integração) ONDE o arquivo mora — o primeiro que EXISTIR vale:
//   1. `CLASSIFICADOR_TEXTO_ARQUIVO` (se definido; caminho absoluto, conferido no boot pelo env.js);
//      senão `<pasta do DB_PATH>/classificador-texto.json` (em produção /data, o volume do bot);
//   2. por fim `modulos/moderacao/dados/classificador-texto.json` (dentro do código/imagem).
// Assim o dono troca o modelo com `docker cp … stoat-bot:/data/` + restart, sem rebuild. Achado um
// arquivo, a validação dele decide: inválido NÃO cai no próximo (um modelo quebrado não some calado
// atrás de outro). O log e o `&servidores` dizem a ORIGEM (rótulo), nunca o caminho (R10), e a
// "versão do modelo": os 8 primeiros hex do SHA-256 do arquivo (confere que o modelo trocado entrou).

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { classificadorTextoLigado, arquivoDoClassificador } from "../core/env.js";
import { sinais, DIMENSOES, VERSAO_SINAIS } from "./texto-sinais.js";

export const NOME_ARQUIVO = "classificador-texto.json";
export const CAMINHO_PADRAO = path.join(path.dirname(fileURLToPath(import.meta.url)), "dados", NOME_ARQUIVO);
// As origens possíveis (rótulos do log em pt e do `&servidores` em pt/en/es — uma fonte só)
export const ORIGENS = Object.freeze({
  variavel: Object.freeze({ pt: "variável CLASSIFICADOR_TEXTO_ARQUIVO", en: "CLASSIFICADOR_TEXTO_ARQUIVO variable", es: "variable CLASSIFICADOR_TEXTO_ARQUIVO" }),
  banco: Object.freeze({ pt: "pasta do banco (volume)", en: "database folder (volume)", es: "carpeta de la base de datos (volumen)" }),
  codigo: Object.freeze({ pt: "pasta do código (imagem)", en: "code folder (image)", es: "carpeta del código (imagen)" }),
  arquivo: Object.freeze({ pt: "arquivo indicado", en: "given file", es: "archivo indicado" }),
});

// Onde procurar, em ordem: [{ origem, caminho }]. Sem repetir o mesmo arquivo.
export function caminhosDoModelo(env = process.env) {
  const daVariavel = arquivoDoClassificador(env);
  const lista = [daVariavel
    ? { origem: "variavel", caminho: daVariavel }
    : { origem: "banco", caminho: path.join(path.dirname(env.DB_PATH || "./stoat.db"), NOME_ARQUIVO) },
  { origem: "codigo", caminho: CAMINHO_PADRAO }];
  return lista.filter((c, i) => lista.findIndex((d) => path.resolve(d.caminho) === path.resolve(c.caminho)) === i);
}
export const CLASSES_CONHECIDAS = Object.freeze(["golpe", "ameaca", "odio", "chocante"]);
export const FORMATO = 1;
export const MAX_BYTES = 8 * 1024 * 1024;      // o alvo é < 2 MB; acima disto nem se lê (R10)

let modelo = null;          // { classes, vies: Float64Array, limiares: Float64Array, pesos: Map<i, Float64Array>, n, treinadoEm }
let situacao = null;        // null = ainda não tentou; senão "ligado" | "ausente" | "invalido" | "outra-versao" | "desligado"
let detalhe = null;
let origem = null;          // de onde veio o arquivo lido (chave de ORIGENS) — null = nenhum achado
let procurados = [];        // as origens olhadas, em ordem
let impressao = null;       // a "versão do modelo": 8 hex do SHA-256 do arquivo
let placar = null;          // a soma por classe, reaproveitada a cada mensagem (sem alocar)

export const desligadoNoEnv = () => !classificadorTextoLigado();

// (P6, 3 nov 2026) `fontes.compartilhaIgual` (opcional): as bases de treino com licença que obriga a
// compartilhar igual (ex.: ["told-br (CC BY-SA 4.0)"]). Um modelo treinado com elas NUNCA entra no
// repositório público — o scripts/verificar-build.js falha se o modelo do código tiver a lista
// não vazia —, mas o bot o carrega normalmente de /data (o volume, fora do Git e da imagem).
export const MAX_COMPARTILHA_IGUAL = 20, MAX_TEXTO_FONTE = 200;
// As bases compartilha-igual declaradas no objeto do modelo (lista; vazia = nenhuma). Não valida.
export const compartilhaIgualDe = (o) => {
  const ci = o?.fontes?.compartilhaIgual;
  return Array.isArray(ci) ? ci : ci ? [ci] : [];
};
// (revisão do P6) A trava não pode ser driblada com outra grafia ("compartilhaigual",
// "compartilha_igual", "Compartilha-Igual"): a chave de `fontes` que, em minúsculas e sem `_`/`-`,
// é "compartilhaigual" mas não está escrita exatamente "compartilhaIgual" → o nome dela (senão null).
export const chaveCompartilhaIgualTorta = (o) => {
  const f = o?.fontes;
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  return Object.keys(f).find((k) => k !== "compartilhaIgual" && k.toLowerCase().replace(/[_-]/g, "") === "compartilhaigual") ?? null;
};

const finito = (x) => typeof x === "number" && Number.isFinite(x);
const objetoSimples = (x) => !!x && typeof x === "object" && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const mesmasChaves = (obj, classes) => objetoSimples(obj) && Object.keys(obj).length === classes.length && classes.every((c) => Object.hasOwn(obj, c));

// Valida o objeto lido do JSON. Devolve { modelo } ou { erro, outraVersao? } — nunca lança.
export function validar(o) {
  if (!objetoSimples(o)) return { erro: "não é um objeto" };
  if (o.formato !== FORMATO) return { erro: `formato ${JSON.stringify(o.formato)} (esperado ${FORMATO})` };
  if (typeof o.versaoSinais !== "string") return { erro: "versaoSinais ausente" };
  if (o.versaoSinais !== VERSAO_SINAIS) return { erro: `versaoSinais ${o.versaoSinais.slice(0, 40)} (esta é ${VERSAO_SINAIS})`, outraVersao: true };
  if (o.dimensoes !== DIMENSOES) return { erro: `dimensoes ${JSON.stringify(o.dimensoes)} (esperado ${DIMENSOES})` };
  const classes = o.classes;
  if (!Array.isArray(classes) || !classes.length || classes.length > CLASSES_CONHECIDAS.length
      || new Set(classes).size !== classes.length || !classes.every((c) => CLASSES_CONHECIDAS.includes(c))) {
    return { erro: `classes inválidas (só ${CLASSES_CONHECIDAS.join(", ")}, sem repetir)` };
  }
  for (const campo of ["pesos", "vies", "limiares"]) {
    if (!mesmasChaves(o[campo], classes)) return { erro: `${campo}: uma chave por classe, nem mais nem menos` };
  }
  if (o.treinadoEm !== undefined && (typeof o.treinadoEm !== "string" || o.treinadoEm.length > 40)) return { erro: "treinadoEm inválido" };
  if (o.fontes !== undefined) {
    if (!objetoSimples(o.fontes)) return { erro: "fontes não é um objeto" };
    const torta = chaveCompartilhaIgualTorta(o);
    if (torta !== null) return { erro: `fontes.${paraOLog(torta).slice(0, 40)}: escreva exatamente "compartilhaIgual"` };
    const ci = o.fontes.compartilhaIgual;
    if (ci !== undefined && (!Array.isArray(ci) || ci.length > MAX_COMPARTILHA_IGUAL
        || !ci.every((x) => typeof x === "string" && x.length <= MAX_TEXTO_FONTE))) {
      return { erro: `fontes.compartilhaIgual: uma lista de até ${MAX_COMPARTILHA_IGUAL} textos de até ${MAX_TEXTO_FONTE} caracteres` };
    }
  }
  const k = classes.length;
  const vies = new Float64Array(k), limiares = new Float64Array(k);
  const pesos = new Map();
  let n = 0;
  for (let c = 0; c < k; c++) {
    const nome = classes[c];
    if (!finito(o.vies[nome])) return { erro: `vies.${nome} não é um número finito` };
    const l = o.limiares[nome];
    if (!finito(l) || l <= 0 || l >= 1) return { erro: `limiares.${nome} fora de (0, 1)` };
    vies[c] = o.vies[nome]; limiares[c] = l;
    const lista = o.pesos[nome];
    if (!Array.isArray(lista) || lista.length > DIMENSOES) return { erro: `pesos.${nome} não é uma lista` };
    const vistos = new Set();
    for (const par of lista) {
      if (!Array.isArray(par) || par.length !== 2) return { erro: `pesos.${nome}: cada item é [índice, peso]` };
      const [i, w] = par;
      if (!Number.isInteger(i) || i < 0 || i >= DIMENSOES) return { erro: `pesos.${nome}: índice fora de 0…${DIMENSOES - 1}` };
      if (!finito(w)) return { erro: `pesos.${nome}: peso não finito` };
      if (vistos.has(i)) return { erro: `pesos.${nome}: índice ${i} repetido` };
      vistos.add(i);
      if (w === 0) continue;
      let linha = pesos.get(i);
      if (!linha) { linha = new Float64Array(k); pesos.set(i, linha); }
      linha[c] = w; n++;
    }
  }
  return { modelo: { classes: [...classes], vies, limiares, pesos, n, treinadoEm: o.treinadoEm ?? null, compartilhaIgual: [...compartilhaIgualDe(o)] } };
}

// (revisão do P5) o que vai ao log e ao painel: uma linha, sem caractere de controle nem crase, no máximo
// 120 caracteres (o motivo cita pedaços do arquivo — a versão, um índice —, que vêm de fora)
export const paraOLog = (x) => String(x ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029`]/g, " ").slice(0, 120);

// Lê o arquivo (sem argumento: procura nas origens de caminhosDoModelo; com um caminho: só ele).
// Devolve a situação ("ligado" | "ausente" | "invalido" | "outra-versao" | "desligado").
export function carregar(caminho) {
  modelo = null; placar = null; detalhe = null; origem = null; procurados = []; impressao = null;
  if (desligadoNoEnv()) {
    situacao = "desligado";
    console.log("[CLASSIFICADOR] desligado (CLASSIFICADOR_TEXTO=0) — o sentinela segue sem o sinal");
    return situacao;
  }
  const candidatos = caminho === undefined ? caminhosDoModelo() : [{ origem: "arquivo", caminho }];
  let bruto;
  situacao = "ausente";
  for (const c of candidatos) {
    procurados.push(c.origem);
    try {
      const st = fs.statSync(c.caminho);
      if (!st.isFile()) continue;                     // pasta no lugar do arquivo = não achou; olha o próximo
      origem = c.origem;
      if (st.size > MAX_BYTES) { situacao = "invalido"; detalhe = `arquivo grande demais (${(st.size / 1048576).toFixed(1)} MB)`; }
      else bruto = fs.readFileSync(c.caminho);
    } catch (e) {
      if (e?.code === "ENOENT" || e?.code === "ENOTDIR") continue;
      origem = c.origem; situacao = "invalido"; detalhe = "não consegui ler o arquivo";
    }
    break;
  }
  if (bruto !== undefined) {
    impressao = createHash("sha256").update(bruto).digest("hex").slice(0, 8);
    let o;
    try { o = JSON.parse(bruto.toString("utf8")); } catch { o = undefined; situacao = "invalido"; detalhe = "JSON inválido"; }
    if (o !== undefined) {
      const r = validar(o);
      if (r.modelo) { modelo = r.modelo; placar = new Float64Array(modelo.classes.length); situacao = "ligado"; }
      else { situacao = r.outraVersao ? "outra-versao" : "invalido"; detalhe = paraOLog(r.erro); }
    }
  }
  // uma linha no log, com a ORIGEM (rótulo) e nunca o caminho (R10)
  const de = origem ? ` · ${ORIGENS[origem].pt}` : "";
  if (situacao === "ligado") console.log(`[CLASSIFICADOR] ligado: ${modelo.classes.join(", ")} · ${modelo.n} peso(s)${modelo.treinadoEm ? ` · treinado em ${modelo.treinadoEm}` : ""} · modelo ${impressao}${de}`);
  else if (situacao === "ausente") console.log(`[CLASSIFICADOR] sem o arquivo do modelo (procurei: ${procurados.map((o) => ORIGENS[o].pt).join(", ")}) — o sentinela segue sem o sinal`);
  else console.warn(`[CLASSIFICADOR] arquivo do modelo ${situacao === "outra-versao" ? "de outra versão dos sinais" : "inválido"} (${detalhe})${de} — o sentinela segue sem o sinal`);
  return situacao;
}

// Esquece o modelo (os testes; a próxima mensagem carrega de novo).
export function descarregar() { modelo = null; placar = null; situacao = null; detalhe = null; origem = null; procurados = []; impressao = null; }

export function estado() {
  return { situacao: situacao ?? "nao-carregado", detalhe, classes: modelo?.classes ?? [], pesos: modelo?.n ?? 0, treinadoEm: modelo?.treinadoEm ?? null, versaoSinais: VERSAO_SINAIS,
    origem, procurados: [...procurados], modelo: impressao };
}

const sigmoide = (x) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

// As classes acima do limiar para um vetor de sinais: { classe: probabilidade } (vazio = nada).
// Sem modelo → null.
export function classesDoVetor(vetor) {
  if (situacao === null) carregar();
  if (!modelo) return null;
  if (!Array.isArray(vetor) || !vetor.length) return {};   // sem texto, sem sinal (o viés sozinho não decide nada)
  const k = modelo.classes.length;
  placar.set(modelo.vies);
  for (let j = 0; j < vetor.length; j++) {
    const linha = modelo.pesos.get(vetor[j][0]);
    if (!linha) continue;
    const v = vetor[j][1];
    for (let c = 0; c < k; c++) placar[c] += linha[c] * v;
  }
  let acima = null;
  for (let c = 0; c < k; c++) {
    const p = sigmoide(placar[c]);
    if (p >= modelo.limiares[c]) (acima ??= {})[modelo.classes[c]] = Math.round(p * 1000) / 1000;
  }
  return acima ?? {};
}

// O mesmo, a partir do texto (o vetor é calculado aqui). Sem modelo → null, sem calcular nada.
export function classesAcima(texto) {
  if (situacao === null) carregar();
  if (!modelo) return null;
  return classesDoVetor(sinais(texto));
}
