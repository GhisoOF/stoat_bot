// bateria.js — a bateria de teste da moderação de imagem (P4.3, 2 nov 2026). O handler (o
// `&bateria`, só do dono do bot, só na DM com a Judy) mora em bateria-comando.js; a tabela, no
// bloco "P4.3 bateria" do core/db.js.
//
// "Quero poder enviar, pelo próprio privado do bot, a imagem com a categoria dela, para caso eu
// ache algo na internet enquanto estou utilizando, eu possa usar para isso" (Ghieh). "Isso" é a
// bateria: um programa à parte (fora deste repositório, no MiniPC) que passa imagens rotuladas
// pela visão da Judy e mede o acerto.
//
// REGRA DO DONO: o bot NUNCA baixa nem copia a imagem (pode ser imagem sexual ou de gore achada
// na internet). Fica só o LINK do anexo no CDN do Stoat (validado por revisao.linkDeOrigem, o
// mesmo da fila de revisão) e o que o próprio Stoat manda do anexo. A bateria busca a imagem
// pelo link na hora de analisar. Nada aqui faz requisição de rede.
//
// ═══ O CONTRATO COM A BATERIA ═══════════════════════════════════════════════════════════
// Arquivo: `bateria-imagens.jsonl`, na MESMA pasta do banco (a do DB_PATH; em produção, o
// volume: /data/bateria-imagens.jsonl). A bateria monta o volume só leitura e lê só ele.
// Reescrito por inteiro a cada mudança (registro, remoção, limpeza), de forma ATÔMICA: um
// arquivo temporário na mesma pasta (`.bateria-imagens.jsonl.<pid>.<aleatório>.tmp`), fsync e
// rename por cima — quem lê vê o arquivo velho inteiro ou o novo inteiro, nunca a metade.
// Sem registro nenhum, o arquivo existe e está vazio.
// Codificação UTF-8, uma imagem por linha (JSON Lines), na ordem em que entraram, cada linha
// terminada em "\n":
//
//   {"id":"K7F2Q","categoria":"anime","url":"https://cdn.stoatusercontent.com/attachments/<id>",
//    "nome":"x.png","tipo":"image/png","tamanho":12345,"largura":800,"altura":600,
//    "criadoEm":"2026-11-02T22:00:00.000Z"}
//
//   id         string   o código do registro: 5 caracteres de [2-9] e consoantes maiúsculas
//                       (o que o `&bateria remover` recebe). Único.
//   categoria  string   o rótulo que o dono deu: [a-z0-9-], 2 a 30 caracteres, sem hífen nas
//                       pontas nem repetido (ex.: anime, meme, praia, nudez, gore, simbolo-odio)
//   url        string   https, no CDN do Stoat (stoatusercontent.com/stoat.chat e os antigos
//                       revoltusercontent.com/revolt.chat). Única. A imagem só existe lá: se o
//                       dono apagar a mensagem da DM, o link pode morrer — a bateria trata o
//                       erro de download como "imagem indisponível", não como acerto/erro.
//   nome       string   o nome do arquivo que o Stoat informa (sem caractere de controle, até
//                       200 caracteres)                                         — opcional
//   tipo       string   o tipo MIME image/* que o Stoat informa                — opcional
//   tamanho    inteiro  bytes, segundo o Stoat                                 — opcional
//   largura    inteiro  pixels, segundo o Stoat                                — opcional
//   altura     inteiro  pixels, segundo o Stoat                                — opcional
//   criadoEm   string   ISO 8601 em UTC, quando entrou
//
// Campo opcional que o Stoat não mandou (ou veio inválido) é OMITIDO, nunca null. Campo novo,
// se um dia vier, só se ACRESCENTA (a bateria ignora o que não conhece).
// ════════════════════════════════════════════════════════════════════════════════════════

import { openSync, writeSync, fsyncSync, closeSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import * as db from "../core/db.js";
import * as aleatorio from "../core/aleatorio.js";
import { registrarErro } from "../core/erros.js";
import { ehImagem, idDoAnexo, urlDoAnexo } from "../core/anexos.js";
import { linkDeOrigem } from "./revisao.js";   // só link https do CDN do Stoat (DRY com a fila de revisão)

export const ARQUIVO = "bateria-imagens.jsonl";
export const TETO = 5000;           // registros no total
export const MAX_POR_MENSAGEM = 10; // anexos numa mensagem
export const PRAZO_LIMPAR_MS = 2 * 60_000;   // a confirmação do `limpar` (como o `&privacidade apagar`)

// O código de um registro: 5 caracteres sem os que se confundem (0/O, 1/I/L, vogais: sem palavra)
const ALFABETO = "23456789BCDFGHJKMNPQRSTVWXZ";
export const CODIGO = /^[2-9BCDFGHJKMNPQRSTVWXZ]{5}$/;
export const ehCodigo = (txt) => CODIGO.test(String(txt ?? "").toUpperCase());

// A categoria: minúsculas, sem acento, espaço/sublinhado → hífen; só [a-z0-9-], 2–30 caracteres.
// O que sobra fora disso (pontuação, emoji, outra escrita) é recusado — não é "limpo" em silêncio.
export function normalizarCategoria(txt) {
  const s = String(txt ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .trim().replace(/[\s_]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return /^[a-z0-9-]{2,30}$/.test(s) ? s : null;
}

// O que o Stoat informa do anexo, validado (R6): o inválido some
const inteiro = (n, max) => (Number.isSafeInteger(n) && n >= 0 && n <= max ? n : undefined);
function metadadosDo(a) {
  const nome = typeof a?.filename === "string" ? a.filename.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 200) : "";
  const tipo = String(a?.contentType ?? a?.content_type ?? "").trim().toLowerCase();
  const largura = inteiro(a?.metadata?.width, 100_000), altura = inteiro(a?.metadata?.height, 100_000);
  return {
    nome: nome || undefined,
    tipo: /^image\/[a-z0-9.+-]{1,60}$/.test(tipo) ? tipo : undefined,
    tamanho: inteiro(a?.size, Number.MAX_SAFE_INTEGER),
    largura: largura || undefined, altura: altura || undefined,
  };
}

// Uma linha do arquivo (sem o "\n"): só os campos do contrato, na ordem dele
export function linhaDoArquivo(r) {
  const o = { id: r.codigo, categoria: r.categoria, url: r.url };
  for (const k of ["nome", "tipo", "tamanho", "largura", "altura"]) if (r[k] !== null && r[k] !== undefined) o[k] = r[k];
  o.criadoEm = new Date(Number(r.criadoEm)).toISOString();
  return JSON.stringify(o);
}

// Reescreve o arquivo inteiro (temporário + fsync + rename). true = gravou; false = falhou (o
// banco continua certo, o erro vai ao log e a próxima mudança tenta de novo); null = banco em
// memória (não há pasta).
export function reescreverArquivo() {
  const banco = db.caminhoDoBanco();
  if (!banco) return null;
  const pasta = dirname(banco);
  const destino = join(pasta, ARQUIVO);
  const tmp = join(pasta, `.${ARQUIVO}.${process.pid}.${aleatorio.sufixo(8)}.tmp`);
  try {
    const texto = db.bateriaTodas().map((r) => `${linhaDoArquivo(r)}\n`).join("");
    const fd = openSync(tmp, "wx", 0o644);
    try { writeSync(fd, texto); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, destino);
    return true;
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* o temporário pode nem ter sido criado: o erro que importa é o de cima */ }
    registrarErro("BATERIA:arquivo", e);
    return false;
  }
}

// Registra os anexos de UMA mensagem numa categoria (já normalizada). Nenhum download: o link
// sai do id do anexo. Devolve os códigos novos e o que ficou de fora, por motivo.
export function registrar(anexos, categoria, { agora = Date.now() } = {}) {
  const r = { codigos: [], repetidas: 0, naoImagem: 0, foraDoCdn: 0, acimaDoTeto: 0, total: 0, arquivo: undefined };
  const vistos = new Set();
  let total = db.bateriaTotal();
  for (const a of anexos ?? []) {
    if (!ehImagem(a)) { r.naoImagem++; continue; }
    const anexoId = idDoAnexo(a);
    const url = linkDeOrigem(urlDoAnexo(a));
    if (!anexoId || !url) { r.foraDoCdn++; continue; }
    if (vistos.has(anexoId)) { r.repetidas++; continue; }
    vistos.add(anexoId);
    if (total >= TETO) { r.acimaDoTeto++; continue; }
    const dados = { anexoId, url, categoria, criadoEm: agora, ...metadadosDo(a) };
    let res = "codigo";
    for (let i = 0; i < 20 && res === "codigo"; i++) {
      const codigo = aleatorio.codigo(ALFABETO, 5);
      res = db.bateriaInserir({ ...dados, codigo });
      if (res === "ok") { r.codigos.push(codigo); total++; }
    }
    if (res === "repetida") r.repetidas++;
    else if (res !== "ok") throw new Error("bateria: não achei código livre");
  }
  r.total = total;
  if (r.codigos.length) r.arquivo = reescreverArquivo();
  return r;
}

export const contarCategoria = (categoria) => db.bateriaContarCategoria(categoria);
export function contagem() {
  return { total: db.bateriaTotal(), categorias: db.bateriaPorCategoria() };
}

// `ultima` (já traduzido pelo registro) ou um código. Devolve o registro removido (ou null) e o arquivo.
export function remover(qual) {
  const alvo = qual === "ultima" ? db.bateriaUltima() : ehCodigo(qual) ? db.bateriaPorCodigo(String(qual).toUpperCase()) : null;
  if (!alvo || !db.bateriaRemover(alvo.codigo)) return { removido: null };
  return { removido: alvo, total: db.bateriaTotal(), arquivo: reescreverArquivo() };
}

export function limpar(categoria) {
  const n = db.bateriaLimpar(categoria);
  return { n, total: db.bateriaTotal(), arquivo: n ? reescreverArquivo() : undefined };
}
