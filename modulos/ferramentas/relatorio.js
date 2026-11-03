// Relatório horário do dono do bot.
//
// A cada hora cheia, um resumo do que aconteceu em todos os servidores vai
// para a DM do dono do bot (o primeiro de SUPER_ADMINS — P4, 2 nov 2026; antes, um
// canal escolhido com `&servidores relatorio canal`, que saiu):
// banimentos, punições, entradas, alertas, ritmo de conversa, erros e bugs.
//
// Tudo sai do código. (P4, 2 nov 2026, área da IA) O chat IA saiu e a IA ficou só na
// moderação: o texto que o modelo escrevia (Destaques, Assuntos a partir de amostras
// de conversa, a leitura dos erros) saiu junto — o relatório é só os números, e o
// texto das pessoas não é mais guardado nem por uma hora.
//
// Quem entra (privacidade P4, 20 out 2026, decisão do Ghieh):
//   • os servidores do PRÓPRIO dono do bot (RELATORIO_SERVIDOR, ou de que um
//     SUPER_ADMIN é dono): completos, como antes — números e eventos;
//   • os outros, SÓ se o servidor aderiu (`&log relatorio on`): anônimos — o
//     servidor vira um pseudônimo, e só os eventos de ataque (punições, raids,
//     imagens suspeitas), sem nomes, menções nem IDs;
//   • os que não aderiram: nada (nem números).

import * as db from "../core/db.js";
import { pseudonimo } from "../core/pseudonimo.js";
import { registrarErro } from "../core/erros.js";
import { donos, dmDoDono, idiomaDoDono } from "../core/dono.js";
import * as tempoAutomod from "../core/tempo-automod.js";   // (P5) o tempo do automod na hora (só números)

// "completo" | "anonimo" | null — o main.js liga a regra de verdade no boot
// (precisa do dono de cada servidor e da config). Sem ela, ninguém entra.
let regraDeAdesao = () => null;
export function configurarAdesao(fn) { regraDeAdesao = fn; }
export function modoDe(serverId) {
  if (!serverId) return "completo";   // eventos do bot (boot, erros) não são de servidor
  try { return regraDeAdesao(serverId) ?? null; } catch { return null; }
}
const TIPOS_DE_ATAQUE = new Set(["punicoes", "raid", "imagem"]);
// "Imagem suspeita (x) — <@u> em <#c> (msg m)" → "Imagem suspeita (x)"
export function anonimizarTitulo(t) {
  return String(t ?? "").replace(/<[@#%][^>]*>/g, " ").replace(/[0-9A-HJKMNP-TV-Z]{26}/g, " ")
    .split(/\s+—\s+/)[0].replace(/\(msg[^)]*\)/g, "").replace(/\s+/g, " ").trim();
}
export const nomeAnonimo = (serverId) => `Servidor ${pseudonimo(serverId)}`;
// Um evento como ele pode entrar no relatório (ou null, se não entra)
export function filtrarEvento(e) {
  const modo = modoDe(e.serverId);
  if (!modo) return null;
  if (modo === "anonimo") return TIPOS_DE_ATAQUE.has(e.tipo) ? { ...e, titulo: anonimizarTitulo(e.titulo) } : null;
  return e;
}

const HORA = 3600_000;
const ERROS_MAX_HORA = 300;        // teto de linhas de erro gravadas por hora

// ─── Coleta ─────────────────────────────────────────────────────────────────
export function evento(serverId, tipo, titulo, t = Date.now()) {
  // servidor que não aderiu nem é do dono: nem é gravado
  const e = filtrarEvento({ serverId, tipo, titulo: limparTitulo(titulo) });
  if (!e) return;
  try { db.registrarEventoRelatorio(t, serverId, tipo, e.titulo); }
  catch (err) { if (tipo !== "erro") registrarErro("RELATORIO", err); }   // relatório nunca derruba nada (e erro de erro não vira laço)
}

// "📥 Membro entrou" → "Membro entrou": o emoji varia, o assunto não.
export function limparTitulo(t) {
  return String(t ?? "").replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").replace(/\s+/g, " ").trim();
}

// Erros: a mesma falha repetida vira UMA linha com contagem no relatório.
// IDs, números e horários saem, para que "falha em X" e "falha em Y" se somem.
export function normalizarErro(texto) {
  return String(texto ?? "")
    .replace(/^\S+Z\s+/, "")
    // marcadores com chaves, não com <…>: o Stoat esconde "<id>" como se fosse
    // tag, e o relatório saía "repor <> em :" e "fila cheia ()" (2 out 2026)
    .replace(/[0-9A-HJKMNP-TV-Z]{26}/g, "{id}")
    .replace(/https?:\/\/\S+/g, (u) => u.replace(/^(https?:\/\/[^/]+).*/, "$1/…"))
    .replace(/\b\d+([.,]\d+)?\b/g, "{n}")
    .replace(/\s+/g, " ").trim().slice(0, 180);
}
// (31 out 2026, R9) O relatório guarda só a ETIQUETA do erro ("[RSS]",
// "[BANGLOBAL]"…) e uma frase fixa: nunca o texto livre, onde ia nome de
// servidor que não aderiu, URL de feed ou trecho de mensagem. O texto inteiro
// fica só no log local (quem escreve no console é o registrarErro).
export function etiquetaDoErro(texto) {
  const m = String(texto ?? "").match(/^\s*\[([A-Za-z0-9À-ÿ_:\- ]{1,40})\]/);
  return m ? `[${m[1].trim()}]` : "[sem etiqueta]";
}
let errosNestaHora = 0, horaDosErros = 0;
export function erro(texto, t = Date.now()) {
  const h = Math.floor(t / HORA);
  if (h !== horaDosErros) { horaDosErros = h; errosNestaHora = 0; }
  if (++errosNestaHora > ERROS_MAX_HORA) return;
  evento(null, "erro", `${etiquetaDoErro(texto)} falha (detalhes só no log local)`, t);
}

// O ritmo de conversa fica só em memória (contar não precisa de disco); o texto
// das mensagens não é guardado (P4: sem o modelo, as amostras saíram).
const atividade = new Map();   // serverId → { msgs, autores:Set }
export function mensagem(serverId, { autorId = null, ehBot = false } = {}) {
  if (!serverId || ehBot) return;
  const modo = modoDe(serverId);
  if (!modo) return;                       // não aderiu: nem o ritmo é contado
  // anônimo: só os ataques entram (a política promete isso) — nem o ritmo de conversa
  // (revisão do P4: o "· N msg de M pessoa(s)" do servidor anônimo ia ao relatório)
  if (modo === "anonimo") return;
  const a = atividade.get(serverId) ?? { msgs: 0, autores: new Set() };
  a.msgs++;
  if (autorId) a.autores.add(autorId);
  atividade.set(serverId, a);
}
export function esvaziarAtividade() {
  const copia = new Map(atividade);
  atividade.clear();
  return copia;
}
// Leitura sem esvaziar: o `relatorio agora` não pode roubar a contagem da hora.
export function copiaAtividade() { return new Map(atividade); }

// ─── Montagem ───────────────────────────────────────────────────────────────
// Cada boot herda a causa do último "desligar" registrado antes dele
// (deploy/restart, watchdog, login falhou). Boot sem "desligar" antes = o
// processo morreu sem conseguir avisar (queda, falta de memória...).
// `eventos` pode começar ANTES da hora (o gerar busca 30 min a mais) — só os
// boots de dentro da hora contam, mas o "desligar" pode ter vindo antes dela.
export function agrupar(eventos, { desde = -Infinity } = {}) {
  const porServidor = new Map();
  const erros = new Map();
  const causas = new Map();
  let reinicios = 0, ultimoDesligar = null;
  for (const e of eventos) {
    if (e.tipo === "desligar") { ultimoDesligar = e.titulo; continue; }
    if (e.tipo === "boot") {
      if (e.t >= desde) {
        reinicios++;
        const causa = ultimoDesligar ?? "queda sem aviso";
        causas.set(causa, (causas.get(causa) ?? 0) + 1);
      }
      ultimoDesligar = null;
      continue;
    }
    if (e.t < desde) continue;
    if (e.tipo === "erro") { erros.set(e.titulo, (erros.get(e.titulo) ?? 0) + 1); continue; }
    const s = porServidor.get(e.serverId) ?? new Map();
    const chave = e.titulo || e.tipo;
    s.set(chave, (s.get(chave) ?? 0) + 1);
    porServidor.set(e.serverId, s);
  }
  return {
    porServidor,
    erros: [...erros].sort((a, b) => b[1] - a[1]),
    reinicios,
    causas: [...causas],
  };
}

// Eventos que não dizem nada numa visão por hora: a conversa normal.
const RUIDO = /^(Comando usado|Mensagem editada)$/i;

export function montarNumeros({ grupos, atividade, nomes, desde, ate }) {
  const ids = new Set([...grupos.porServidor.keys(), ...atividade.keys()].filter(Boolean));
  const linhas = [`**${hhmm(desde)}–${hhmm(ate)} UTC**`, ""];
  const ordenados = [...ids].sort((a, b) => (atividade.get(b)?.msgs ?? 0) - (atividade.get(a)?.msgs ?? 0));
  let algo = false;
  for (const id of ordenados) {
    const a = atividade.get(id);
    const ev = [...(grupos.porServidor.get(id) ?? new Map())].filter(([k]) => !RUIDO.test(k))
      .sort((x, y) => y[1] - x[1]);
    if (!a?.msgs && !ev.length) continue;
    algo = true;
    const ritmo = a?.msgs ? ` · ${a.msgs} msg de ${a.autores.size} pessoa(s)` : "";
    linhas.push(`**${nomes.get(id) ?? id}**${ritmo}`);
    for (const [k, n] of ev.slice(0, 8)) linhas.push(`• ${k}${n > 1 ? ` ×${n}` : ""}`);
    linhas.push("");
  }
  if (!algo) linhas.push("_Hora tranquila: nenhum evento em nenhum servidor._", "");
  if (grupos.reinicios) {
    const porCausa = (grupos.causas ?? []).map(([c, n]) => `${n}× ${c}`).join(" · ");
    linhas.push(`🔄 **O bot reiniciou ${grupos.reinicios}×** nesta hora${porCausa ? ` — ${porCausa}` : ""}.`, "");
  }
  if (grupos.erros.length) {
    linhas.push("**Erros**");
    for (const [msg, n] of grupos.erros.slice(0, 8)) {
      const h = grupos.persistencia?.get(msg) ?? 1;
      const hist = h >= 2 ? ` · **em ${h} das últimas 24 h**` : " · primeira vez nas últimas 24 h";
      linhas.push(`• \`${cortar(msg, 140)}\`${n > 1 ? ` ×${n}` : ""}${hist}`);
    }
    if (grupos.erros.length > 8) linhas.push(`_… e mais ${grupos.erros.length - 8} tipo(s) de erro._`);
  }
  return { texto: linhas.join("\n").trim(), algo: algo || grupos.erros.length > 0 || grupos.reinicios > 0 };
}

const hhmm = (t) => new Date(t).toISOString().slice(11, 16);
// Corta no último espaço antes do limite ("...acima do car" → "...acima do…").
export function cortar(txt, max) {
  const s = String(txt ?? "");
  if (s.length <= max) return s;
  const i = s.lastIndexOf(" ", max - 1);
  return `${s.slice(0, i > max * 0.6 ? i : max - 1)}…`;
}

// ─── Uma hora inteira: coleta → números → envio ────────────────────────────
export async function gerar({ client, cfg, ate = Date.now(), esvaziar = true }) {
  const desde = ate - HORA;
  const nomes = new Map();
  for (const s of client?.servers?.values?.() ?? []) nomes.set(s.id, modoDe(s.id) === "anonimo" ? nomeAnonimo(s.id) : (s.name ?? s.id));
  // o que foi gravado antes de a regra mudar passa pelo mesmo filtro
  const grupos = agrupar(db.eventosRelatorio(desde - 30 * 60_000, ate).map(filtrarEvento).filter(Boolean), { desde });
  grupos.persistencia = persistenciaDosErros(db.eventosRelatorio(ate - 24 * HORA, ate), ate);
  const ativ = esvaziar ? esvaziarAtividade() : copiaAtividade();
  // servidor que já não está na lista (a Judy saiu nesta hora): nunca o ID cru —
  // só o do dono sai com o ID; os outros, com o pseudônimo (revisão do P4)
  for (const id of [...grupos.porServidor.keys(), ...ativ.keys()]) {
    if (id && !nomes.has(id)) nomes.set(id, modoDe(id) === "completo" ? id : nomeAnonimo(id));
  }
  const numeros = montarNumeros({ grupos, atividade: ativ, nomes, desde, ate });
  podar(ate);
  // (P5, R11) quanto o automod levou por mensagem nesta hora — de todos os servidores somados, sem
  // nenhum dado de servidor ou pessoa; não conta como "algo aconteceu" (a hora vazia continua vazia)
  const tempo = linhaDoTempo(desde);
  return {
    title: `📊 Relatório ${hhmm(desde)}–${hhmm(ate)} UTC`,
    description: tempo ? `${numeros.texto}\n\n${tempo}` : numeros.texto,
    vazio: !numeros.algo,
  };
}

// (P5) A linha do tempo do automod da hora que começa em `desde` (null = nada medido), no idioma do
// dono (revisão do P5: antes, sempre em português).
export function linhaDoTempo(desde, idioma = idiomaDoDono()) {
  const d = tempoAutomod.descrever(tempoAutomod.resumo(tempoAutomod.horaDe(desde)), idioma);
  return d ? `⏱️ **Automod:** ${d}` : null;
}

// Os donos do bot (SUPER_ADMINS): os servidores deles entram completos.
export function listaSuperAdmins() {
  return donos();
}
// RELATORIO_SERVIDOR: o servidor do dono do bot (o idioma da DM dele, e o relatório
// completo — P4: o painel e o relatório agora só na DM).
export function servidorDoRelatorio() {
  return (process.env.RELATORIO_SERVIDOR || "").trim() || null;
}
// (P4) Os servidores do próprio dono do bot: completos no relatório.
export const ehDoDono = (server, superAdmins = listaSuperAdmins()) =>
  !!server?.id && (server.id === servidorDoRelatorio() || (!!server.ownerId && superAdmins.includes(server.ownerId)));

// O banco guarda só 48 h de eventos.
export function podar(ate = Date.now()) {
  try { db.podarRelatorio(ate - 48 * HORA); } catch (e) { registrarErro("RELATORIO", e); }
}

// (P4, 2 nov 2026) A config: { ativo, pularVazias, … }. A antiga tinha `canalId` (o
// canal escolhido): ela é lida sem quebrar — ligado só se tinha canal e não estava pausado,
// como antes — e o canal é esquecido. Sem config, desligado (`&servidores relatorio on`).
export function configDoRelatorio(global) {
  if (!global || typeof global !== "object") return { ativo: false, pularVazias: false };
  const cfg = global.relatorio ??= { ativo: false, pularVazias: false };
  if (Object.hasOwn(cfg, "canalId")) {
    cfg.ativo = !!cfg.canalId && cfg.ativo !== false;
    delete cfg.canalId;
  }
  return cfg;
}
// O relatório vai à DM do dono do bot — nunca a um canal. `enviar(canal, embed)`.
export async function entregar(rel, { client, enviar }) {
  const dm = await dmDoDono(client);
  if (!dm) { console.warn("[RELATORIO] sem DM com o dono do bot (SUPER_ADMINS) — relatório não enviado"); return null; }
  return enviar(dm, { title: rel.title, description: rel.description });
}

let timer = null;
export function agendar({ client, getCfg, enviar }) {
  if (timer) return;
  const proxima = () => HORA - (Date.now() % HORA) + 5_000;   // 5s depois da hora cheia
  const rodar = async () => {
    // (31 out 2026, R11) a poda roda toda hora, MESMO com o relatório desligado:
    // antes, sem canal, a tabela relatorio_eventos crescia para sempre
    podar();
    const cfg = getCfg();
    if (cfg?.ativo === true) {
      try {
        const rel = await gerar({ client, cfg, ate: Math.floor(Date.now() / HORA) * HORA });
        if (!(rel.vazio && cfg.pularVazias)) await entregar(rel, { client, enviar });
      } catch (e) { registrarErro("RELATORIO", e); }
    }
    timer = setTimeout(rodar, proxima());
  };
  timer = setTimeout(rodar, proxima());
  timer.unref?.();
}

// (P4, 2 nov 2026) Os erros das últimas 24 h, os mais frequentes primeiro: [[etiqueta, n], …]. São de
// todos os servidores: só o dono do bot vê, no `&servidores` (na DM). Antes, no `&debug` de um servidor.
export function errosRecentes(agora = Date.now(), max = 5) {
  const cont = new Map();
  for (const e of db.eventosRelatorio(agora - 24 * HORA, agora + 1)) if (e.tipo === "erro") cont.set(e.titulo, (cont.get(e.titulo) ?? 0) + 1);
  return [...cont].sort((a, b) => b[1] - a[1]).slice(0, max);
}

// Em quantas das últimas 24 horas cada padrão de erro apareceu ("em N das
// últimas 24 h"): o erro persistente não se passa por temporário.
export function persistenciaDosErros(eventos, ate) {
  const horas = new Map();
  for (const e of eventos) {
    if (e.tipo !== "erro") continue;
    const h = Math.floor((ate - 1 - e.t) / HORA);
    if (!horas.has(e.titulo)) horas.set(e.titulo, new Set());
    horas.get(e.titulo).add(h);
  }
  return new Map([...horas].map(([k, s]) => [k, s.size]));
}
