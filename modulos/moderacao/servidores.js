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

// Extrai a contagem de membros, aceitando os vários nomes que a lib pode usar.
function contarMembros(server) {
  const direto = server?.memberCount ?? server?.member_count
    ?? server?.approximate_member_count ?? server?.approximateMemberCount;
  if (typeof direto === "number") return direto;
  try {
    const m = server?.members;
    if (m?.size != null) return m.size;
    if (Array.isArray(m)) return m.length;
  } catch {}
  return null;
}

export async function cmdServidores(message, args, ctx) {
  const { sendEmbed, COR, client, ehSuperAdmin } = ctx;

  if (!ehSuperAdmin?.(message.authorId)) {
    return sendEmbed(message.channel, { title: "🚫 Comando restrito",
      description: "Só o dono do bot pode ver isso.", colour: COR.erro });
  }

  // Coleta os servidores conhecidos pelo cliente.
  let lista = [];
  try {
    const s = client?.servers;
    if (s?.values) lista = [...s.values()];
    else if (Array.isArray(s)) lista = s;
    else if (s && typeof s === "object") lista = Object.values(s);
  } catch (e) {
    return sendEmbed(message.channel, { title: "❌ Não consegui listar",
      description: `Erro ao acessar os servidores: ${e?.message ?? e}`, colour: COR.erro });
  }

  if (!lista.length) {
    return sendEmbed(message.channel, { title: "🌐 Servidores",
      description: "Não consegui enxergar nenhum servidor pela API.", colour: COR.aviso });
  }

  const linhas = [];
  let totalMembros = 0, totalMpm = 0, semContagem = 0;

  const dados = lista.map((srv) => {
    const id = srv?.id ?? srv?._id;
    const nome = srv?.name ?? nomes.get(id) ?? id ?? "?";
    if (id && srv?.name) nomes.set(id, srv.name);
    const membros = contarMembros(srv);
    const mpm = porMinuto(id);
    return { id, nome, membros, mpm };
  }).sort((a, b) => b.mpm - a.mpm || (b.membros ?? 0) - (a.membros ?? 0));

  for (const d of dados) {
    if (typeof d.membros === "number") totalMembros += d.membros; else semContagem++;
    totalMpm += d.mpm;
    const membrosTxt = typeof d.membros === "number" ? `${d.membros} membro(s)` : "membros: ?";
    const ritmo = d.mpm >= 0.1 ? `${d.mpm.toFixed(1)} msg/min` : d.mpm > 0 ? "<0,1 msg/min" : "parado";
    linhas.push(`**${d.nome}**\n   ${membrosTxt} · ${ritmo}`);
  }

  const resumo = [
    `**${dados.length}** servidor(es) · **${totalMembros}** membro(s)`
      + (semContagem ? ` _(+${semContagem} sem contagem)_` : "")
      + ` · **${totalMpm.toFixed(1)}** msg/min no total`,
    "",
    ...linhas.slice(0, 25),
    dados.length > 25 ? `_… e mais ${dados.length - 25}._` : "",
    "",
    `_Ritmo medido nos últimos ${JANELA_MIN} min · bot de pé há ${tempoDePe()}_`,
  ].filter(Boolean).join("\n");

  return sendEmbed(message.channel, {
    title: "🌐 Onde o bot está",
    description: resumo.slice(0, 1950),
    colour: COR.info,
  });
}
