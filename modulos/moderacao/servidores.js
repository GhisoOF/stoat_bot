// ══════════════════════════════════════════════════════════
//  servidores.js — &servidores (só o dono do bot)
//
//  Panorama de onde o bot está: nome do servidor, membros e o
//  ritmo de mensagens por minuto.
//
//  O contador de mensagens é mantido em memória, numa janela
//  deslizante — não vai para o banco. É métrica operacional, não
//  dado a preservar; e gravar cada mensagem em disco só para
//  contar seria caro à toa.
// ══════════════════════════════════════════════════════════

const JANELA_MIN = Number(process.env.STATS_JANELA_MIN || 15);   // minutos observados
const MAX_AMOSTRAS = 5000;   // teto por servidor, para a memória não crescer sem limite

// serverId → array de timestamps
const mensagens = new Map();
// serverId → nome (cache, para não refazer fetch a cada listagem)
const nomes = new Map();

const agora = () => Date.now();
const limite = () => agora() - JANELA_MIN * 60_000;

// Chamado a cada mensagem recebida.
export function registrar(serverId) {
  if (!serverId) return;
  let arr = mensagens.get(serverId);
  if (!arr) { arr = []; mensagens.set(serverId, arr); }
  arr.push(agora());
  // poda o que saiu da janela (e o excesso, se um servidor for muito ativo)
  const corte = limite();
  let i = 0;
  while (i < arr.length && arr[i] < corte) i++;
  if (i) arr.splice(0, i);
  if (arr.length > MAX_AMOSTRAS) arr.splice(0, arr.length - MAX_AMOSTRAS);
}

// Mensagens por minuto na janela observada.
export function porMinuto(serverId) {
  const arr = mensagens.get(serverId);
  if (!arr?.length) return 0;
  const corte = limite();
  const recentes = arr.filter((t) => t >= corte).length;
  return recentes / JANELA_MIN;
}

// Quanto tempo o bot está de pé (usado no rodapé).
let inicio = agora();
export function marcarInicio() { inicio = agora(); }
function tempoDePe() {
  const s = Math.floor((agora() - inicio) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`;
}

// Contagem de membros: a lógica (campos diretos → fetchMembers → cache) vive
// no core, compartilhada com o &staff e as boas-vindas.
import { contarMembros } from "../core/membros.js";

import { tr, lingua } from "../core/i18n.js";

export async function cmdServidores(message, args, ctx) {
  const { sendEmbed, COR, client, ehSuperAdmin } = ctx;
  const lang = lingua(ctx);

  if (!ehSuperAdmin?.(message.authorId)) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Comando restrito", description: "Só o dono do bot pode ver isso.", colour: COR.erro },
      { title: "🚫 Restricted command", description: "Only the bot's owner can see this.", colour: COR.erro }));
  }

  // Modo cru: mostra o que a API entrega, para descobrir onde está a contagem.
  if (["cru", "raw", "bruto"].includes(args[0]?.toLowerCase())) {
    let um = null;
    try {
      const s = client?.servers;
      um = s?.values ? [...s.values()][0] : (Array.isArray(s) ? s[0] : Object.values(s ?? {})[0]);
    } catch {}
    if (!um) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🔬 Diagnóstico", description: "Não consegui pegar nenhum servidor do cliente.", colour: COR.erro },
        { title: "🔬 Diagnostics", description: "I couldn't get any server from the client.", colour: COR.erro }));
    }
    const chaves = Object.keys(um).filter((k) => typeof um[k] !== "function");
    const metodos = Object.getOwnPropertyNames(Object.getPrototypeOf(um) ?? {})
      .filter((k) => typeof um[k] === "function").slice(0, 20);
    const amostra = {};
    for (const k of ["name", "memberCount", "member_count", "approximate_member_count", "members"]) {
      if (um[k] !== undefined) {
        const v = um[k];
        amostra[k] = typeof v === "object" ? `${v?.constructor?.name ?? "obj"}(size=${v?.size ?? "?"})` : String(v);
      }
    }
    return sendEmbed(message.channel, {
      title: lang === "en" ? "🔬 How the API delivers the server" : "🔬 Como a API entrega o servidor",
      description: [
        lang === "en" ? "**Fields:**" : "**Campos:**", "```", chaves.join(", ").slice(0, 500), "```",
        lang === "en" ? "**Methods:**" : "**Métodos:**", "```", metodos.join(", ").slice(0, 400), "```",
        lang === "en" ? "**Relevant:**" : "**Relevantes:**", "```json", JSON.stringify(amostra, null, 1).slice(0, 500), "```",
      ].join("\n").slice(0, 1950), colour: COR.info });
  }

  // Coleta os servidores conhecidos pelo cliente.
  let lista = [];
  try {
    const s = client?.servers;
    if (s?.values) lista = [...s.values()];
    else if (Array.isArray(s)) lista = s;
    else if (s && typeof s === "object") lista = Object.values(s);
  } catch (e) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Não consegui listar",
        description: `Erro ao acessar os servidores: ${e?.message ?? e}`, colour: COR.erro },
      { title: "❌ Couldn't list them",
        description: `Error accessing the servers: ${e?.message ?? e}`, colour: COR.erro }));
  }

  if (!lista.length) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🌐 Servidores", description: "Não consegui enxergar nenhum servidor pela API.", colour: COR.aviso },
      { title: "🌐 Servers", description: "I couldn't see any server through the API.", colour: COR.aviso }));
  }

  const linhas = [];
  let totalMembros = 0, totalMpm = 0, semContagem = 0;

  // Busca em paralelo: com poucos servidores é rápido, e evita somar timeouts.
  const dados = (await Promise.all(lista.map(async (srv) => {
    const id = srv?.id ?? srv?._id;
    const nome = srv?.name ?? nomes.get(id) ?? id ?? "?";
    if (id && srv?.name) nomes.set(id, srv.name);
    const membros = await contarMembros(srv);
    const mpm = porMinuto(id);
    return { id, nome, membros, mpm };
  }))).sort((a, b) => b.mpm - a.mpm || (b.membros ?? 0) - (a.membros ?? 0));

  for (const d of dados) {
    if (typeof d.membros === "number") totalMembros += d.membros; else semContagem++;
    totalMpm += d.mpm;
    const membrosTxt = typeof d.membros === "number"
      ? (lang === "en" ? `${d.membros} member(s)` : `${d.membros} membro(s)`)
      : (lang === "en" ? "members: ?" : "membros: ?");
    const ritmo = lang === "en"
      ? (d.mpm >= 0.1 ? `${d.mpm.toFixed(1)} msg/min` : d.mpm > 0 ? "<0.1 msg/min" : "idle")
      : (d.mpm >= 0.1 ? `${d.mpm.toFixed(1)} msg/min` : d.mpm > 0 ? "<0,1 msg/min" : "parado");
    // O ID em `código` vai junto: este comando é do dono, e o ID é
    // justamente o que ele precisa para configurar qualquer coisa por
    // servidor (TTS_SERVIDORES, chat de IA, etc.). Sem isso, era preciso
    // caçá-lo no cliente — e o Stoat nem sempre oferece "Copiar ID".
    linhas.push(`**${d.nome}**\n   ${membrosTxt} · ${ritmo}\n   \`${d.id}\``);
  }

  const resumo = (lang === "en" ? [
    `**${dados.length}** server(s) · **${totalMembros}** member(s)`
      + (semContagem ? ` _(+${semContagem} uncounted)_` : "")
      + ` · **${totalMpm.toFixed(1)}** msg/min in total`,
    "",
    ...linhas.slice(0, 25),
    dados.length > 25 ? `_… and ${dados.length - 25} more._` : "",
    "",
    `_Rate measured over the last ${JANELA_MIN} min · bot up for ${tempoDePe()}_`,
  ] : [
    `**${dados.length}** servidor(es) · **${totalMembros}** membro(s)`
      + (semContagem ? ` _(+${semContagem} sem contagem)_` : "")
      + ` · **${totalMpm.toFixed(1)}** msg/min no total`,
    "",
    ...linhas.slice(0, 25),
    dados.length > 25 ? `_… e mais ${dados.length - 25}._` : "",
    "",
    `_Ritmo medido nos últimos ${JANELA_MIN} min · bot de pé há ${tempoDePe()}_`,
  ]).filter(Boolean).join("\n");

  return sendEmbed(message.channel, {
    title: lang === "en" ? "🌐 Where the bot lives" : "🌐 Onde o bot está",
    description: resumo.slice(0, 1950),
    colour: COR.info,
  });
}
