// Relatório horário do dono do bot.
//
// A cada hora cheia, um resumo do que aconteceu em todos os servidores vai
// para um canal configurável (`&servidores relatorio canal #x`):
// banimentos, punições, entradas, alertas, ritmo de conversa, assuntos mais
// comentados, erros e bugs.
//
// Divisão de trabalho (a mesma de sempre no projeto): os NÚMEROS saem do
// código — o modelo nunca conta nada. O modelo só escreve os destaques, os
// assuntos (a partir de amostras) e uma leitura dos erros. Se o modelo falhar,
// o relatório sai assim mesmo, só com a parte do código.
//
// Assuntos: só dos servidores que o dono do bot é dono (ou os que ele listar).
// Os outros servidores entram com números, não com o que as pessoas falam —
// essas comunidades não combinaram de ter a conversa resumida para terceiros.

import * as db from "../core/db.js";

const HORA = 3600_000;
const AMOSTRAS_MAX = 120;          // mensagens guardadas por servidor, por hora
const ERROS_MAX_HORA = 300;        // teto de linhas de erro gravadas por hora
const LLM_URL = () => (process.env.LLM_URL || "").replace(/\/$/, "");
const MODELO = () => process.env.LLM_MODEL_RELATORIO || process.env.LLM_MODEL || "";

// ─── Coleta ─────────────────────────────────────────────────────────────────
export function evento(serverId, tipo, titulo, t = Date.now()) {
  try { db.registrarEventoRelatorio(t, serverId, tipo, limparTitulo(titulo)); } catch { /* relatório nunca derruba nada */ }
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
    .replace(/[0-9A-HJKMNP-TV-Z]{26}/g, "<id>")
    .replace(/https?:\/\/\S+/g, (u) => u.replace(/^(https?:\/\/[^/]+).*/, "$1/…"))
    .replace(/\b\d+([.,]\d+)?\b/g, "<n>")
    .replace(/\s+/g, " ").trim().slice(0, 180);
}
let errosNestaHora = 0, horaDosErros = 0;
export function erro(texto, t = Date.now()) {
  const h = Math.floor(t / HORA);
  if (h !== horaDosErros) { horaDosErros = h; errosNestaHora = 0; }
  if (++errosNestaHora > ERROS_MAX_HORA) return;
  evento(null, "erro", normalizarErro(texto), t);
}

// Ritmo e amostras de conversa ficam só em memória: contar não precisa de
// disco, e o texto das pessoas não deve ficar gravado para gerar um resumo.
const atividade = new Map();   // serverId → { msgs, autores:Set, amostras:[] }
export function mensagem(serverId, texto, { autorId = null, ehBot = false, comAssunto = false } = {}) {
  if (!serverId || ehBot) return;
  const a = atividade.get(serverId) ?? { msgs: 0, autores: new Set(), amostras: [] };
  a.msgs++;
  if (autorId) a.autores.add(autorId);
  const limpo = String(texto ?? "").replace(/<[@#%][^>]+>/g, "").replace(/https?:\/\/\S+/g, "").trim();
  if (comAssunto && limpo.length >= 8 && !limpo.startsWith("&")) {
    a.amostras.push(limpo.slice(0, 160));
    if (a.amostras.length > AMOSTRAS_MAX) a.amostras.shift();
  }
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
export function agrupar(eventos) {
  const porServidor = new Map();
  const erros = new Map();
  let reinicios = 0;
  for (const e of eventos) {
    if (e.tipo === "erro") { erros.set(e.titulo, (erros.get(e.titulo) ?? 0) + 1); continue; }
    if (e.tipo === "boot") { reinicios++; continue; }
    const s = porServidor.get(e.serverId) ?? new Map();
    const chave = e.titulo || e.tipo;
    s.set(chave, (s.get(chave) ?? 0) + 1);
    porServidor.set(e.serverId, s);
  }
  return {
    porServidor,
    erros: [...erros].sort((a, b) => b[1] - a[1]),
    reinicios,
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
  if (grupos.reinicios) linhas.push(`🔄 **O bot reiniciou ${grupos.reinicios}×** nesta hora.`, "");
  if (grupos.erros.length) {
    linhas.push("**Erros**");
    for (const [msg, n] of grupos.erros.slice(0, 8)) linhas.push(`• \`${msg.slice(0, 120)}\`${n > 1 ? ` ×${n}` : ""}`);
    if (grupos.erros.length > 8) linhas.push(`_… e mais ${grupos.erros.length - 8} tipo(s) de erro._`);
  }
  return { texto: linhas.join("\n").trim(), algo: algo || grupos.erros.length > 0 || grupos.reinicios > 0 };
}

const hhmm = (t) => new Date(t).toISOString().slice(11, 16);

// ─── A parte do modelo ─────────────────────────────────────────────────────
// Sessão nova a cada hora: uma mensagem só, sem histórico.
export function montarPrompt({ numeros, amostras, nomes }) {
  const blocos = [...amostras].filter(([, a]) => a.amostras.length)
    .map(([id, a]) => `### ${nomes.get(id) ?? id}\n${a.amostras.slice(-60).map((m) => `- ${m}`).join("\n")}`);
  return [
    "Você escreve o relatório horário de um bot de moderação, para o dono dele. Português do Brasil, direto, sem floreio.",
    "Os NÚMEROS abaixo já estão certos e já vão aparecer no relatório — não repita contagens nem invente números.",
    "Escreva só três seções curtas, com estes títulos exatos:",
    "**Destaques** — até 4 linhas: o que merece atenção nesta hora (banimentos, alertas, algo fora do normal). Se foi tranquila, diga em uma linha.",
    "**Assuntos** — para cada servidor com amostras de conversa, 1 a 3 assuntos mais comentados. Sem citar nomes de pessoas nem copiar frases.",
    "**Erros** — se houver erros, em até 3 linhas: a causa provável de cada tipo e se parece grave. Se não houver, omita a seção.",
    "",
    "## Números da hora",
    numeros,
    "",
    blocos.length ? "## Amostras de conversa (só destes servidores)\n" + blocos.join("\n\n") : "## Amostras de conversa\n(nenhuma)",
  ].join("\n");
}

export async function redigir(prompt, { fetcher = fetch } = {}) {
  if (!LLM_URL() || !MODELO()) return null;
  try {
    const r = await fetcher(`${LLM_URL()}/v1/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json",
        ...(process.env.TOKEN_IA ? { Authorization: `Bearer ${process.env.TOKEN_IA}` } : {}) },
      body: JSON.stringify({ model: MODELO(), stream: false, max_tokens: 1500, temperature: 0.3,
        messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(240_000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const texto = String(j?.choices?.[0]?.message?.content ?? "")
      .replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "").trim();
    return texto || null;
  } catch { return null; }
}

// ─── Uma hora inteira: coleta → números → modelo → envio ───────────────────
export async function gerar({ client, cfg, ate = Date.now(), fetcher = fetch, esvaziar = true }) {
  const desde = ate - HORA;
  const nomes = new Map();
  for (const s of client?.servers?.values?.() ?? []) nomes.set(s.id, s.name ?? s.id);
  const grupos = agrupar(db.eventosRelatorio(desde, ate));
  const ativ = esvaziar ? esvaziarAtividade() : copiaAtividade();
  const numeros = montarNumeros({ grupos, atividade: ativ, nomes, desde, ate });
  const prosa = numeros.algo ? await redigir(montarPrompt({ numeros: numeros.texto, amostras: ativ, nomes }), { fetcher }) : null;
  try { db.podarRelatorio(ate - 48 * HORA); } catch {}
  return {
    title: `📊 Relatório ${hhmm(desde)}–${hhmm(ate)} UTC`,
    description: [prosa, prosa ? "━━━━━━━━━━" : null, numeros.texto,
      prosa || !numeros.algo ? null : "_O modelo não respondeu — seguem só os números._"]
      .filter(Boolean).join("\n\n"),
    vazio: !numeros.algo,
  };
}

// Assuntos: servidores listados à mão, ou — sem lista — os que pertencem a um
// dono do bot (SUPER_ADMINS). Os demais aparecem só em números.
export function listaSuperAdmins() {
  return (process.env.SUPER_ADMINS || "").split(",").map((x) => x.trim()).filter(Boolean);
}
export function temAssunto(server, cfg, superAdmins = listaSuperAdmins()) {
  const lista = cfg?.assuntos ?? [];
  if (lista.length) return lista.includes(server?.id);
  return !!server?.ownerId && superAdmins.includes(server.ownerId);
}

let timer = null;
export function agendar({ client, getCfg, enviar }) {
  if (timer) return;
  const proxima = () => HORA - (Date.now() % HORA) + 5_000;   // 5s depois da hora cheia
  const rodar = async () => {
    const cfg = getCfg();
    if (cfg?.canalId && cfg.ativo !== false) {
      try {
        const rel = await gerar({ client, cfg, ate: Math.floor(Date.now() / HORA) * HORA });
        if (!(rel.vazio && cfg.pularVazias)) await enviar(cfg.canalId, rel);
      } catch (e) { console.warn("[RELATORIO] falhou:", e?.message ?? e); }
    }
    timer = setTimeout(rodar, proxima());
  };
  timer = setTimeout(rodar, proxima());
  timer.unref?.();
}
