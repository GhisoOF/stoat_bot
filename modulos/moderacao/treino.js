// treino.js — a impressão de treino dos casos julgados e o arquivo que a bateria lê (P5, 3 nov 2026).
//
// "Guardar, junto do veredito, os pedaços de palavra passados por hash (sem texto, sem pessoa,
// sem servidor) para treinar o classificador" (decisão do dono, 3 nov 2026). O vetor sai do
// extrator de sinais de texto (contrato 1: modulos/moderacao/texto-sinais.js, da área sinais),
// calculado NO MOMENTO DO REGISTRO do caso — quando o texto ainda existe — e guardado no caso
// (coluna `vetor`, com `versaoSinais`). Só texto tem vetor (perfil-texto, assunto, mensagem).
// (3 nov 2026, P5 revisão) antes: "o texto sai em 7 dias; o vetor fica" (1 ano). agora: a revisão
// remontou mensagens inteiras a partir do vetor (hash sem chave + n-gramas que se sobrepõem) — ele
// é tratado COMO O PRÓPRIO TEXTO: sai com o trecho, 7 dias depois do registro, em todo caso (amostra,
// segunda análise, staff), e com o `&privacidade apagar`. O que dura é o modelo que a bateria treina.
//
// ═══ O CONTRATO 3 COM A BATERIA ═════════════════════════════════════════════════════════
// Arquivo: `bateria-treino.jsonl`, na MESMA pasta do banco (em produção, /data). Reescrito por
// inteiro, de forma ATÔMICA (temporário `.bateria-treino.jsonl.<pid>.<aleatório>.tmp` na mesma
// pasta, fsync e rename por cima — como o `bateria-imagens.jsonl` do P4.3): a cada veredito do
// dono, a cada veredito da staff num caso com vetor, depois do `&privacidade apagar` e no ciclo
// de limpeza (6 h e na subida — só se algo mudou). Sem caso nenhum, o arquivo existe e está vazio.
// UTF-8, uma linha por caso julgado que tem vetor (JSON Lines), do mais antigo ao mais novo,
// cada linha terminada em "\n", exatamente estes campos, nesta ordem:
//
//   {"id":"K7FQ2","uso":"treino","origem":"amostra","categoria":"assunto:politica","rotulo":"violacao",
//    "certeza":"alta","nota":0.7,"versaoSinais":"s1","vetor":[[12,0.1],[907,-0.2]],"julgadoEm":"2026-11-03T21:00:00.000Z"}
//
//   id            o código do caso: o da fila do dono (5 caracteres, ex. K7FQ2) ou, da staff,
//                 "S" + o número interno do caso (ex. S42). Nada que leve a alguém.
//   uso           "treino" = julgado pelo DONO (amostra diária e segunda análise);
//                 "medir"  = julgado pela STAFF de um servidor — SÓ medição, nunca treino
//                 (decisão do dono, 3 nov 2026: opção A).
//   origem        "amostra" | "problema" (a segunda análise) | "staff"
//   categoria     a categoria do caso (ex.: assunto:politica, perfil-texto:sexual, sentinela)
//   rotulo        "violacao" | "ok" — o que quem julgou disse (dono: ✅/❌ cruzado com o que o
//                 bot fez; staff: ✅ = violacao, ❌ = ok)
//   certeza       "alta" | "media" | "baixa" | null (a do detector; null = não registrada)
//   nota          0–1 | null
//   versaoSinais  a VERSAO_SINAIS do extrator que fez o vetor (outra versão: a bateria ignora)
//   vetor         [[indice, valor], …] esparso, como o `sinais()` devolve (valores com 6 casas)
//   julgadoEm     ISO 8601 em UTC
//
// Nenhuma linha leva texto, trecho, link, pessoa, canal, mensagem, servidor (nem o pseudônimo).
// Teto: os TETO (20 000) julgados mais recentes. Só vetor VIVO: registrado há menos de DIAS_VETOR
// (7) dias — o banco o apaga nesse prazo (rodada e ciclo de 6 h) e o arquivo nunca o leva depois disso.
// `&privacidade apagar` tira o vetor de todo caso da pessoa enquanto ele existe (o da staff, já sem
// o userId, pelo pseudônimo `vetorPessoa`). ATENÇÃO: o vetor permite reconstruir a mensagem — quem lê
// este arquivo (a bateria) não guarda linhas nem vetores além da execução (BRIEF-P5, R2).
// ════════════════════════════════════════════════════════════════════════════════════════

import { open, rename, rm } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import * as db from "../core/db.js";
import * as aleatorio from "../core/aleatorio.js";
import { registrarErro } from "../core/erros.js";
import * as temporarios from "../core/temporarios.js";   // (P5, integração) o temporário não fica órfão se o processo sair no meio

export const ARQUIVO = "bateria-treino.jsonl";
export const TETO = 20000;
export const DIAS_VETOR = db.TREINO_DIAS_VETOR;   // uma fonte só: o db.js (a retenção, = o prazo do trecho)
export const TIPOS_TEXTO = new Set(["perfil-texto", "assunto", "mensagem"]);
export const MAX_ENTRADAS = 2000;     // o teto do contrato 1, conferido de novo aqui
const TEXTO_MAX = 4000;              // o extrator recebe no máximo isto (uma mensagem do Stoat cabe)

// ── o extrator (contrato 1), carregado uma vez; sem ele, os casos seguem sem vetor ──
let extrator = null;
try { extrator = await import("./texto-sinais.js"); }
catch (e) {
  if (e?.code !== "ERR_MODULE_NOT_FOUND") registrarErro("TREINO:extrator", e);
  else console.warn("[TREINO] sem o extrator de sinais (texto-sinais.js): os casos ficam sem vetor");
}
// Só para testes: põe um dublê no lugar (null = não há). Devolve o de antes.
export function _trocarExtrator(duble) { const antes = extrator; extrator = duble; return antes; }

// O vetor de um texto, pronto para o banco: { vetor: "[[i,v],…]" | null, versaoSinais | null }.
// Imagem (ou tipo sem texto), texto vazio, extrator ausente ou saída fora do contrato → sem vetor.
export function vetorDe(tipo, texto) {
  const nada = { vetor: null, versaoSinais: null };
  if (!TIPOS_TEXTO.has(String(tipo)) || !extrator || typeof extrator.sinais !== "function") return nada;
  const t = String(texto ?? "").slice(0, TEXTO_MAX);
  if (!t.trim()) return nada;
  try {
    const versao = limparVersao(extrator.VERSAO_SINAIS);
    const v = limparVetor(extrator.sinais(t));
    return versao && v ? { vetor: v, versaoSinais: versao } : nada;
  } catch (e) { registrarErro("TREINO:vetor", e); return nada; }
}
export const limparVersao = (v) => { const s = String(v ?? ""); return /^[\w.:-]{1,40}$/.test(s) ? s : null; };
// Confere o vetor (lista de [inteiro ≥ 0, número finito], índices crescentes, até MAX_ENTRADAS) e o
// devolve como texto JSON com 6 casas. Aceita a lista ou o texto já guardado. Fora disso: null.
export function limparVetor(v) {
  let lista = v;
  if (typeof v === "string") { try { lista = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(lista) || !lista.length || lista.length > MAX_ENTRADAS) return null;
  const partes = [];
  let anterior = -1;
  for (const par of lista) {
    if (!Array.isArray(par) || par.length !== 2) return null;
    const [i, x] = par;
    if (!Number.isSafeInteger(i) || i <= anterior || typeof x !== "number" || !Number.isFinite(x)) return null;
    anterior = i;
    const r = Math.round(x * 1e6) / 1e6;
    if (r !== 0) partes.push(`[${i},${r}]`);
  }
  return partes.length ? `[${partes.join(",")}]` : null;
}
// O texto guardado só pode ter dígitos, colchetes, vírgula, ponto, sinal e expoente: nada que vire campo
const VETOR_GUARDADO = /^\[\[[0-9.,eE+\-[\]]*\]\]$/;

// ── as linhas ──
const iso = (ms) => new Date(Number(ms)).toISOString();
const CERTEZAS = new Set(["alta", "media", "baixa"]);
// Uma linha (sem o "\n") de um caso do dono (`revisao_casos`) ou da staff (`staff_casos`); null = não entra
export function linhaDoArquivo(r, fonte) {
  if (!r?.vetor || !VETOR_GUARDADO.test(r.vetor) || !limparVersao(r.versaoSinais) || !Number.isFinite(Number(r.julgadoEm))) return null;
  const nota = typeof r.nota === "number" && Number.isFinite(r.nota) ? r.nota : null;
  let o;
  if (fonte === "staff") {
    if (r.veredito !== "certo" && r.veredito !== "errou") return null;
    o = { id: `S${Number(r.id)}`, uso: "medir", origem: "staff", categoria: r.categoria, rotulo: r.veredito === "certo" ? "violacao" : "ok", certeza: CERTEZAS.has(r.certeza) ? r.certeza : null, nota };
  } else {
    if (r.estado !== "julgado" || (r.violacao !== 0 && r.violacao !== 1)) return null;
    o = { id: r.codigo, uso: "treino", origem: r.origem === "problema" ? "problema" : "amostra", categoria: r.categoria, rotulo: r.violacao ? "violacao" : "ok", certeza: CERTEZAS.has(r.certeza) ? r.certeza : null, nota };
  }
  o.versaoSinais = r.versaoSinais;
  // o vetor entra como está no banco (já conferido na entrada e pelo VETOR_GUARDADO): sem reparsear 20 mil linhas
  return `${JSON.stringify(o).slice(0, -1)},"vetor":${r.vetor},"julgadoEm":${JSON.stringify(iso(r.julgadoEm))}}`;
}

// ── a escrita (atômica, assíncrona, uma de cada vez) ──
let ultimaAssinatura = null;
let rodando = null, deNovo = false, forcarProxima = false, agoraPedido = null;
// Reescreve o arquivo. Pedidos durante uma escrita viram UMA escrita a mais no fim. `forcar`: escreve
// mesmo que nada tenha mudado. Resolve com true (gravou), false (falhou: o erro vai ao log e a próxima
// tenta de novo), "igual" (nada mudou desde a última) ou null (banco em memória: não há pasta).
// `agora` (testes): o relógio do "vetor vivo".
export function reescrever({ forcar = false, agora = null } = {}) {
  if (forcar) forcarProxima = true;
  if (agora !== null) agoraPedido = agora;
  if (rodando) { deNovo = true; return rodando; }
  rodando = (async () => {
    let r;
    do { deNovo = false; const f = forcarProxima, a = agoraPedido ?? Date.now(); forcarProxima = false; agoraPedido = null; r = await gravar(f, a); } while (deNovo);
    return r;
  })().finally(() => { rodando = null; });
  return rodando;
}
export const emAndamento = () => rodando ?? Promise.resolve(null);
// O mesmo, sem esperar e sem deixar erro solto (os ganchos do veredito, da retenção e do apagar)
export function pedirReescrita(opcoes) { reescrever(opcoes).catch((e) => registrarErro("TREINO:arquivo", e)); }

const LOTE = 200;
async function gravar(forcar, agora) {
  const banco = db.caminhoDoBanco();
  if (!banco) return null;
  const chaves = db.treinoChaves(teto, agora - DIAS_VETOR * 86400e3);   // (P5 revisão) só o vetor vivo   // as mais recentes, do mais velho ao mais novo: [{ f: "d"|"s", k }]
  const assinatura = createHash("sha256").update(chaves.map((c) => `${c.f}${c.k}`).join(",")).digest("hex");
  if (!forcar && assinatura === ultimaAssinatura) return "igual";
  const pasta = dirname(banco);
  const tmp = temporarios.abrir(join(pasta, `.${ARQUIVO}.${process.pid}.${aleatorio.sufixo(8)}.tmp`));
  let fh = null;
  try {
    // (P5 revisão) o temporário nasce SÍNCRONO, na thread principal: um `open` assíncrono ainda na fila do libuv podia
    // criá-lo DEPOIS do gancho de saída do core/temporarios.js (o órfão em /tmp que a rodada de testes achou)
    closeSync(openSync(tmp, "wx", 0o644));
    fh = await open(tmp, "r+");
    for (let i = 0; i < chaves.length; i += LOTE) {
      const lote = chaves.slice(i, i + LOTE);
      const dono = new Map(db.treinoDono(lote.filter((c) => c.f === "d").map((c) => c.k)).map((r) => [r.rowid, r]));
      const staff = new Map(db.treinoStaff(lote.filter((c) => c.f === "s").map((c) => c.k)).map((r) => [r.id, r]));
      let texto = "";
      for (const c of lote) {
        const l = c.f === "d" ? linhaDoArquivo(dono.get(c.k), "dono") : linhaDoArquivo(staff.get(c.k), "staff");
        if (l) texto += `${l}\n`;
      }
      if (texto) await fh.write(texto);
    }
    await fh.sync();
    await fh.close(); fh = null;
    await rename(tmp, join(pasta, ARQUIVO));
    ultimaAssinatura = assinatura;
    return true;
  } catch (e) {
    try { await fh?.close(); } catch { /* o erro que importa é o de cima */ }
    try { await rm(tmp, { force: true }); } catch { /* o temporário pode nem existir */ }
    registrarErro("TREINO:arquivo", e);
    return false;
  } finally { temporarios.fechar(tmp); }
}

// Só para testes
let teto = TETO;
export function _zerar() { ultimaAssinatura = null; teto = TETO; }
export function _trocarTeto(n) { teto = n; }
