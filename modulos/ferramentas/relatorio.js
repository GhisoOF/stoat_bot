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
    "**Assuntos** — SÓ para os servidores que aparecem em \"Amostras de conversa\", 1 a 3 assuntos mais comentados. Sem amostra, não há assunto: nunca deduza assunto pelo NOME do servidor. Sem citar nomes de pessoas nem copiar frases.",
    "Reinício por deploy/restart é manutenção normal, não instabilidade; só \"queda sem aviso\" e \"watchdog\" merecem atenção.",
    "**Erros** — se houver erros, em até 3 linhas: a causa provável de cada tipo e se parece grave. Erro que aparece \"em N das últimas 24 h\" é PERSISTENTE, nunca \"temporário\". Se não houver, omita a seção.",
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
  const grupos = agrupar(db.eventosRelatorio(desde - 30 * 60_000, ate), { desde });
  grupos.persistencia = persistenciaDosErros(db.eventosRelatorio(ate - 24 * HORA, ate), ate);
  const ativ = esvaziar ? esvaziarAtividade() : copiaAtividade();
  const numeros = montarNumeros({ grupos, atividade: ativ, nomes, desde, ate });
  const bruta = numeros.algo ? await redigir(montarPrompt({ numeros: numeros.texto, amostras: ativ, nomes }), { fetcher }) : null;
  const prosa = bruta ? limparAssuntos(bruta, ativ, nomes) : null;
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

// O modelo escreveu assunto para servidores SEM amostras, deduzido do nome
// ("Queremos acordar tarde" → "foco no despertar tardio"), e copiou a frase de
// um membro entre aspas. O prompt pede para não fazer isso; aqui é o código
// que garante: na seção **Assuntos** só ficam os servidores que tinham
// amostras, e trecho entre aspas copiado de uma amostra sai.
export function limparAssuntos(texto, amostras, nomes) {
  const comAmostra = new Set([...amostras].filter(([, a]) => a.amostras?.length).map(([id]) => (nomes.get(id) ?? id).toLowerCase()));
  const frases = [...amostras].flatMap(([, a]) => a.amostras ?? []).map((f) => f.toLowerCase());
  const saida = [];
  let naSecao = false, manter = true;
  for (const linha of String(texto).split("\n")) {
    const t = linha.trim();
    if (/^\*\*(Destaques|Erros)\*\*/i.test(t)) { naSecao = false; manter = true; }
    else if (/^\*\*Assuntos\*\*/i.test(t)) { naSecao = true; manter = true; saida.push(linha); continue; }
    else if (naSecao && t && !/^[-*•]\s/.test(t)) {
      // cabeçalho de servidor dentro de Assuntos: **Nome**, ### Nome ou Nome:
      const nome = t.replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").replace(/:$/, "").trim().toLowerCase();
      manter = comAmostra.has(nome);
    }
    if (naSecao && !manter) continue;
    const limpa = naSecao
      ? linha.replace(/\s*\(?["“]([^"”]{3,})["”]\)?/g, (m, q) => (frases.some((f) => f.includes(q.toLowerCase())) ? "" : m))
      : linha;
    saida.push(limpa);
  }
  // Assuntos sem cabeçalho de servidor (aconteceu com um servidor só): se só um
  // tinha amostras, o nome é dele — o código põe, em vez de deixar ambíguo.
  const idx = saida.findIndex((l) => /^\s*\*\*Assuntos\*\*/i.test(l));
  if (idx >= 0 && comAmostra.size === 1) {
    const prox = saida.slice(idx + 1).find((l) => l.trim());
    if (prox && /^\s*[-*•]\s/.test(prox)) {
      const nome = [...amostras].filter(([, a]) => a.amostras?.length).map(([id]) => nomes.get(id) ?? id)[0];
      saida.splice(idx + 1, 0, `**${nome}**`);
    }
  }
  return saida.join("\n")
    .replace(/\*\*Assuntos\*\*\s*\n(\s*\n)*(?=\*\*(Erros|Destaques)\*\*|$)/i, "")
    .trim();
}

// Em quantas das últimas 24 horas cada padrão de erro apareceu. Sem isto o
// modelo chamou de "falha temporária" o nitter.net recusando o dia inteiro.
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
