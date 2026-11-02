// bateria-avisos.js — os avisos da bateria na DM do dono (P4.4, 2 nov 2026). O lado do BOT do
// contrato _notas/CONTRATO-AVISOS.md; o liga/desliga mora no `&bateria avisos on|off`
// (bateria-comando.js).
//
// "O bot pode ir me notificando pelo PV sobre o ocorrido [na bateria] e eu posso ativar ou
// desativar na minha DM também?" (Ghieh). A bateria (programa à parte, no MiniPC) roda na rede
// do container do bot e só AVISA o bot; quem fala com o dono é o bot.
//
// ═══ O CANAL ════════════════════════════════════════════════════════════════════════════
// Servidor HTTP próprio e mínimo (não o dos webhooks), SÓ em 127.0.0.1 (dentro do container;
// nunca publicado no compose). Porta: BATERIA_AVISO_PORTA (env.js → portaDosAvisos; padrão 8097,
// 0 desliga). Sobe no boot (main.js, depois de abrir o banco) e fecha no desligamento.
//
// Chave: `bateria-aviso.chave` na pasta do banco (em produção, /data). No primeiro boot o bot
// grava 64 caracteres hex minúsculos (aleatorio.js), sem quebra de linha, permissão 0644 (a
// bateria roda com outro UID e lê pelo volume só leitura; quem lê o volume já lê o banco).
// Gravação sem meio-arquivo: temporário + fsync + link (o link não sobrescreve). Já existe →
// nunca regrava; existe e não é uma chave válida → os avisos ficam desligados e o log diz.
//
//   POST /aviso   x-chave: <chave>   content-type: application/json   corpo ≤ 8 KB
//   {"tipo":"inicio|progresso|fim|erro","modo":"texto|simulador|imagens|classificadores",
//    "titulo":"…","linhas":["…"],"pasta":"saida/…"}
//   titulo: texto não vazio (cortado em 100) · linhas: opcional, lista de textos (até 12 itens
//   de 200; o resto é cortado) · pasta: opcional (cortada em 120). Campo a mais é ignorado.
//
//   202 {"enviado":true} · 202 {"enviado":false,"motivo":"desligado|teto|sem-dm"}
//   400 corpo inválido · 401 chave errada · 404 outra rota · 405 outro método · 413 corpo grande
//   500 erro interno (genérico; o detalhe vai ao log — como os serviços desde o P4.1)
//
// Teto por hora (janela deslizante): 6 `inicio`/`progresso` e 20 de qualquer tipo; `fim` e
// `erro` passam enquanto houver vaga nos 20. Conta o que foi à DM (desligado e teto não contam).
// ════════════════════════════════════════════════════════════════════════════════════════
//
// Tudo o que vem no corpo é texto de fora: passa pelo textoDeFora (sem menção nenhuma, sem
// @everyone, sem link disfarçado, sem caractere de controle), vira uma linha só e é cortado.
// Nada aqui executa, abre arquivo ou faz requisição a partir do corpo.

import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { openSync, writeSync, fsyncSync, fchmodSync, closeSync, linkSync, rmSync, readFileSync, lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import * as db from "../core/db.js";
import * as store from "../core/config-store.js";
import * as aleatorio from "../core/aleatorio.js";
import { portaDosAvisos } from "../core/env.js";
import { textoDeFora } from "../core/seguranca.js";
import { registrarErro } from "../core/erros.js";
import { tr } from "../core/i18n.js";
import { dmDoDono, idiomaDoDono } from "../core/dono.js";
import { LIMITE_EMBED } from "../core/paginas.js";

export const ARQUIVO_CHAVE = "bateria-aviso.chave";
export const ENDERECO = "127.0.0.1";   // fixo: nenhuma variável muda isto (R10)
export const MAX_CORPO = 8 * 1024;
export const LIMITES = { titulo: 100, linhas: 12, linha: 200, pasta: 120 };
export const TETO = { progresso: 6, total: 20, janelaMs: 60 * 60_000 };
export const TIPOS = ["inicio", "progresso", "fim", "erro"];
export const MODOS = ["texto", "simulador", "imagens", "classificadores"];
const HEX64 = /^[0-9a-f]{64}$/;

// ── o liga/desliga (config global, padrão ligado) ──
export const avisosLigados = () => store.getGlobal()?.bateriaAvisos !== false;
export function definirAvisos(ligar) {
  store.getGlobal().bateriaAvisos = !!ligar;
  store.salvarGlobal();
  return !!ligar;
}

// ── a chave ──
// undefined = não existe; null = existe e não serve; texto = a chave
function lerChave(arq) {
  let st;
  try { st = lstatSync(arq); } catch (e) { if (e?.code === "ENOENT") return undefined; throw e; }
  if (!st.isFile() || st.size > 256) return null;
  const t = readFileSync(arq, "utf8").trim();
  return HEX64.test(t) ? t : null;
}
export function garantirChave(pasta) {
  const destino = join(pasta, ARQUIVO_CHAVE);
  const existente = lerChave(destino);
  if (existente !== undefined) return existente;
  const chave = aleatorio.codigo("0123456789abcdef", 64);
  const tmp = join(pasta, `.${ARQUIVO_CHAVE}.${process.pid}.${aleatorio.sufixo(8)}.tmp`);
  try {
    const fd = openSync(tmp, "wx", 0o644);
    try { fchmodSync(fd, 0o644); writeSync(fd, chave); fsyncSync(fd); } finally { closeSync(fd); }
    try { linkSync(tmp, destino); }
    catch (e) { if (e?.code === "EEXIST") return lerChave(destino) ?? null; throw e; }   // outro processo gravou no meio: vale a dele
    return chave;
  } finally { rmSync(tmp, { force: true }); }
}

// Comparação em tempo constante (o tamanho também não vaza: os dois lados viram SHA-256)
const resumo = (s) => createHash("sha256").update(String(s ?? "")).digest();
export function chaveConfere(dada, certa) {
  if (typeof dada !== "string" || !dada || !certa) return false;
  return timingSafeEqual(resumo(dada), resumo(certa));
}

// ── o corpo ──
// Uma linha só, sem menção nenhuma (maxMencoes 0), cortada
const umaLinha = (s, max) => textoDeFora(String(s).replace(/[\r\n\t\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim(), { max, maxMencoes: 0 });
// O aviso validado e limpo, ou null (corpo inválido → 400)
export function validarAviso(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (!TIPOS.includes(v.tipo) || !MODOS.includes(v.modo)) return null;
  if (typeof v.titulo !== "string" || !v.titulo.trim()) return null;
  if (v.linhas !== undefined && v.linhas !== null && (!Array.isArray(v.linhas) || v.linhas.some((l) => typeof l !== "string"))) return null;
  if (v.pasta !== undefined && v.pasta !== null && typeof v.pasta !== "string") return null;
  const titulo = umaLinha(v.titulo, LIMITES.titulo);
  if (!titulo) return null;
  const linhas = (v.linhas ?? []).slice(0, LIMITES.linhas).map((l) => umaLinha(l, LIMITES.linha)).filter(Boolean);
  // a pasta vai num bloco de código: sem crase
  const pasta = v.pasta ? umaLinha(v.pasta.replace(/`/g, "'"), LIMITES.pasta) || null : null;
  return { tipo: v.tipo, modo: v.modo, titulo, linhas, pasta };
}

// ── o embed (no idioma da DM do dono) ──
const NOME_TIPO = { inicio: ["início", "start", "inicio"], progresso: ["progresso", "progress", "progreso"], fim: ["fim", "done", "fin"], erro: ["erro", "error", "error"] };
const NOME_MODO = { texto: ["texto", "text", "texto"], simulador: ["simulador", "simulator", "simulador"], imagens: ["imagens", "images", "imágenes"], classificadores: ["classificadores", "classifiers", "clasificadores"] };
export const COR_TIPO = { erro: "#ED4245", fim: "#3BA55D", neutro: "#99AAB5" };
const ctxDoDono = () => ({ config: { language: idiomaDoDono() } });
export function embedDoAviso(a, ctx = ctxDoDono()) {
  const nome = (tab, k) => tr(ctx, ...tab[k]);
  const fim = a.pasta ? [`📁 \`${a.pasta}\``] : [];
  const linhas = [`**${a.titulo}**`, ...a.linhas];
  // uma mensagem só (sem as páginas ◀ ▶ do sendEmbed): as últimas linhas saem se não couber
  const tamanho = (l) => [...l, ...fim].join("\n").length;
  let cortadas = 0;
  while (linhas.length > 1 && tamanho(linhas) + 12 > LIMITE_EMBED) { linhas.pop(); cortadas++; }
  if (cortadas) linhas.push(`… (+${cortadas})`);
  return {
    title: `🧪 ${tr(ctx, "Bateria", "Test set", "Batería")} · ${nome(NOME_MODO, a.modo)} · ${nome(NOME_TIPO, a.tipo)}`,
    description: [...linhas, ...fim].join("\n"),
    colour: COR_TIPO[a.tipo] ?? COR_TIPO.neutro,
  };
}

// ── o servidor ──
class ErroDoPedido extends Error { constructor(texto, status) { super(texto); this.status = status; } }
const ERRO_INTERNO = { erro: "erro interno" };

// O servidor (sem escutar ainda). Tudo injetável para os testes:
//   chave           a chave certa
//   enviar(dm, emb) manda o embed (devolve a mensagem; vazio = não foi)
//   dm()            a DM do dono (null = sem DM)
//   ligado()        os avisos estão ligados?
//   agora()         o relógio (o teto por hora)
export function criarServidor({ chave, enviar, dm, ligado = avisosLigados, agora = Date.now }) {
  const foram = [];   // { t, tipo } do que foi à DM na última hora
  function cabe(tipo, t) {
    while (foram.length && t - foram[0].t >= TETO.janelaMs) foram.shift();
    if (foram.length >= TETO.total) return false;
    const deProgresso = (x) => x === "inicio" || x === "progresso";
    return !deProgresso(tipo) || foram.filter((x) => deProgresso(x.tipo)).length < TETO.progresso;
  }
  async function tratar(corpo) {
    let v;
    try { v = JSON.parse(corpo); } catch { throw new ErroDoPedido("corpo não é JSON válido", 400); }
    const aviso = validarAviso(v);
    if (!aviso) throw new ErroDoPedido("corpo inválido (veja o contrato)", 400);
    if (!ligado()) return { enviado: false, motivo: "desligado" };
    const t = agora();
    if (!cabe(aviso.tipo, t)) return { enviado: false, motivo: "teto" };
    const canal = await dm();
    if (!canal) return { enviado: false, motivo: "sem-dm" };
    foram.push({ t, tipo: aviso.tipo });
    const msg = await enviar(canal, embedDoAviso(aviso));
    return msg ? { enviado: true } : { enviado: false, motivo: "sem-dm" };
  }

  const srv = createServer((req, res) => {
    const responder = (codigo, obj, extra = {}) => {
      if (res.headersSent) return;
      const texto = JSON.stringify(obj);
      res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(texto),
        "X-Content-Type-Options": "nosniff", Connection: "close", ...extra });
      res.end(texto);
    };
    // o que não vai ser lido é descartado (a resposta já saiu)
    const recusar = (codigo, obj, extra) => { req.resume(); responder(codigo, obj, extra); };
    if (String(req.url ?? "").split("?")[0] !== "/aviso") return recusar(404, { erro: "rota desconhecida" });
    if (req.method !== "POST") return recusar(405, { erro: "use POST" }, { Allow: "POST" });
    if (!chaveConfere(req.headers["x-chave"], chave)) return recusar(401, { erro: "não autorizado" });
    if (!/^application\/json\s*(;|$)/i.test(String(req.headers["content-type"] ?? ""))) return recusar(400, { erro: "use content-type: application/json" });
    if (Number(req.headers["content-length"] || 0) > MAX_CORPO) return recusar(413, { erro: "corpo grande demais" });

    const partes = [];
    let bytes = 0, estourou = false;
    req.on("data", (d) => {
      if (estourou) return;
      bytes += d.length;
      if (bytes > MAX_CORPO) { estourou = true; partes.length = 0; return recusar(413, { erro: "corpo grande demais" }); }
      partes.push(d);
    });
    req.on("error", (e) => registrarErro("BATERIA:aviso", e));
    req.on("end", async () => {
      if (estourou) return;
      try { responder(202, await tratar(Buffer.concat(partes).toString("utf8"))); }
      catch (e) {
        if (e instanceof ErroDoPedido) return responder(e.status, { erro: e.message });
        registrarErro("BATERIA:aviso", e);
        responder(500, ERRO_INTERNO);
      }
    });
  });
  // pedido lento ou pendurado não segura conexão (como o receptor de webhooks)
  srv.headersTimeout = 10_000;
  srv.requestTimeout = 15_000;
  srv.keepAliveTimeout = 5_000;
  srv.maxHeadersCount = 30;
  srv.maxConnections = 8;
  return srv;
}

// ── o ciclo de vida (main.js) ──
let servidor = null;
export const escutando = () => !!servidor?.listening;
export const endereco = () => (servidor?.listening ? servidor.address() : null);   // { address, port } (testes e diagnóstico)
// Sobe o canal: lê/cria a chave e escuta em 127.0.0.1. Devolve o servidor (ou null: porta 0,
// banco em memória, chave inválida, porta ocupada — o motivo vai ao log).
export async function iniciar({ client, enviar, porta = portaDosAvisos(), pasta = null } = {}) {
  if (servidor) return servidor;
  if (!porta) { console.info("[BATERIA] avisos: canal desligado (BATERIA_AVISO_PORTA=0)"); return null; }
  const banco = pasta ?? (db.caminhoDoBanco() ? dirname(db.caminhoDoBanco()) : null);
  if (!banco) { console.warn("[BATERIA] avisos: banco em memória, sem pasta para a chave — canal desligado"); return null; }
  let chave;
  try { chave = garantirChave(banco); } catch (e) { registrarErro("BATERIA:chave", e); return null; }
  if (!chave) { console.error(`[BATERIA] avisos: ${ARQUIVO_CHAVE} existe mas não é uma chave (64 hex) — canal desligado; apague o arquivo para o bot criar outra`); return null; }
  const srv = criarServidor({ chave, enviar, dm: () => dmDoDono(client) });
  const subiu = await new Promise((ok) => {
    const falhou = (e) => { registrarErro("BATERIA:aviso", `o canal não subiu: ${e?.code ?? e?.message}`); ok(false); };
    srv.once("error", falhou);
    srv.listen(porta, ENDERECO, () => { srv.off("error", falhou); ok(true); });
  });
  if (!subiu) return null;
  srv.on("error", (e) => registrarErro("BATERIA:aviso", e));
  servidor = srv;
  console.info(`[BATERIA] avisos: canal em ${ENDERECO}:${porta} (POST /aviso)`);
  return srv;
}
export function parar() {
  if (!servidor) return false;
  const s = servidor;
  servidor = null;
  s.close();
  s.closeAllConnections?.();
  return true;
}
