// ══════════════════════════════════════════════════════════
//  paginas.js — embeds com PÁGINAS, navegadas por reação
//
//  O Stoat limita o embed a ~1500 caracteres e não tem botão. Para
//  guias longos (&help, &tutorial) a saída era "uma parede por página
//  e um comando diferente para cada uma". Aqui a mensagem vira um
//  livrinho: o bot publica a primeira página, reage com ◀ ▶, e quem
//  pediu navega clicando — o embed é EDITADO no lugar.
//
//  Como funciona a navegação:
//   • o bot reage com ◀ e ▶ na própria mensagem;
//   • a pessoa clica num deles. Tanto ADICIONAR quanto REMOVER a
//     reação conta como "um clique" — assim ela pode clicar no mesmo
//     emoji várias vezes sem o bot precisar tirar a reação dela (o
//     que exigiria ManageMessages e um evento a mais para ignorar);
//   • só quem pediu a mensagem navega nela; os outros são ignorados;
//   • a sessão expira depois de um tempo (padrão 15 min). Depois
//     disso a mensagem continua legível, só não vira mais as páginas.
//
//  Sempre há saída sem reação: o rodapé diz o comando que abre cada
//  página direto (`&tutorial 3`), para celular e para canais onde a
//  pessoa não pode reagir.
// ══════════════════════════════════════════════════════════

export const EMOJI_ANTERIOR = "◀";
export const EMOJI_PROXIMA  = "▶";
export const EMOJI_INICIO   = "⏮";

const TTL_PADRAO_MS = 15 * 60 * 1000;

// messageId → sessão ativa
const sessoes = new Map();

function limparEmoji(e) {
  let v = String(e ?? "");
  try { v = decodeURIComponent(v); } catch {}
  return v.replace(/\uFE0F/g, "").trim();
}

function agora() { return Date.now(); }

// Remove sessões vencidas. Chamado a cada interação — não precisa de timer.
function varrer() {
  const t = agora();
  for (const [id, s] of sessoes) if (s.expira < t) sessoes.delete(id);
}

// Monta o embed de uma página com o rodapé de navegação.
function montar(sessao, i) {
  const { paginas, comandoPagina, lang, colour } = sessao;
  const p = paginas[i];
  const total = paginas.length;
  let desc = String(p.description ?? "");
  if (total > 1) {
    const direto = comandoPagina ? ` · \`${comandoPagina} ${i + 1}\`` : "";
    const rodape = lang === "en"
      ? `\n\n📖 Page **${i + 1}/${total}** · react ${EMOJI_ANTERIOR} ${EMOJI_PROXIMA} to turn${direto}`
      : `\n\n📖 Página **${i + 1}/${total}** · reaja ${EMOJI_ANTERIOR} ${EMOJI_PROXIMA} para virar${direto}`;
    // O limite conta o embed todo: garante espaço para o rodapé.
    const max = 1480 - rodape.length;
    if (desc.length > max) desc = desc.slice(0, max - 1) + "…";
    desc += rodape;
  }
  return { title: p.title, description: desc, colour: p.colour ?? colour };
}

// ──────────────────────────────────────────────────────────
//  enviarPaginado(ctx, canal, opções)
//   paginas:       [{ title, description, colour? }]
//   autorId:       quem pode navegar
//   paginaInicial: índice (0-based) da página a abrir
//   comandoPagina: ex.: "&tutorial" → rodapé mostra `&tutorial 3`
//   ttlMs:         tempo de vida da navegação
//  Devolve a mensagem enviada (ou undefined se o canal falhou).
// ──────────────────────────────────────────────────────────
export async function enviarPaginado(ctx, canal, {
  paginas, autorId, paginaInicial = 0, comandoPagina = null,
  ttlMs = TTL_PADRAO_MS, colour = ctx?.COR?.info,
} = {}) {
  if (!Array.isArray(paginas) || !paginas.length) return;
  varrer();
  const lang = ctx?.config?.language === "en" ? "en" : "pt";
  const idx = Math.min(Math.max(0, paginaInicial | 0), paginas.length - 1);
  const sessao = { paginas, idx, autorId, comandoPagina, lang, colour, expira: agora() + ttlMs, ctx };

  // ctx.sendEmbed traduz os `&comando` para o idioma do servidor e devolve a
  // mensagem enviada (o main garante os dois).
  const msg = await ctx.sendEmbed(canal, montar(sessao, idx));
  const msgId = msg?.id ?? msg?._id;
  if (!msgId || paginas.length < 2) return msg;

  sessao.msg = msg;
  sessoes.set(msgId, sessao);

  // Reage na ordem de leitura. Se o bot não tiver `React`, o rodapé ainda
  // aponta o comando direto — a pessoa não fica presa na página 1.
  for (const e of [EMOJI_ANTERIOR, EMOJI_PROXIMA]) {
    try { await msg.react?.(encodeURIComponent(e)); }
    catch (err) { console.warn("[PAGINAS] não consegui reagir:", err?.message ?? err); break; }
  }
  return msg;
}

// ──────────────────────────────────────────────────────────
//  aoReagir(msgId, userId, emoji) — chamado pelos eventos de reação
//  (add E remove). Devolve true se a reação era de navegação.
// ──────────────────────────────────────────────────────────
export async function aoReagir(msgId, userId, emoji) {
  if (!msgId || !sessoes.has(msgId)) return false;
  varrer();
  const s = sessoes.get(msgId);
  if (!s) return false;
  const e = limparEmoji(emoji);
  if (e !== EMOJI_ANTERIOR && e !== EMOJI_PROXIMA && e !== EMOJI_INICIO) return false;
  if (s.autorId && userId !== s.autorId) return true;   // reação de outra pessoa: ignora, mas era nossa

  const total = s.paginas.length;
  if (e === EMOJI_INICIO) s.idx = 0;
  else s.idx = (s.idx + (e === EMOJI_PROXIMA ? 1 : total - 1)) % total;
  s.expira = agora() + TTL_PADRAO_MS;   // quem está navegando ganha mais tempo

  const embed = montar(s, s.idx);
  try {
    const exibir = s.ctx?.exibir ?? ((t) => t);
    await s.msg.edit({ embeds: [{ ...embed, title: exibir(embed.title), description: exibir(embed.description) }] });
  } catch (err) {
    console.warn("[PAGINAS] falha ao editar:", err?.message ?? err);
  }
  return true;
}

// Quantas sessões ativas (para o &debug e os testes).
export function ativas() { varrer(); return sessoes.size; }

// Página atual de uma mensagem (testes).
export function paginaDe(msgId) { return sessoes.get(msgId)?.idx ?? null; }

// Divide uma lista de linhas em páginas que cabem no embed, cortando só em
// linhas em branco quando possível — para não partir um tópico ao meio.
export function paginarLinhas(linhas, { titulo, limite = 1350 } = {}) {
  const paginas = [];
  let atual = [];
  let tam = 0;
  const fechar = () => {
    if (!atual.length) return;
    paginas.push({ title: titulo, description: atual.join("\n") });
    atual = []; tam = 0;
  };
  for (const l of linhas) {
    const n = l.length + 1;
    if (tam + n > limite) {
      // tenta recuar até a última linha em branco, para a quebra cair num tópico
      const corte = atual.lastIndexOf("");
      if (corte > 0 && corte > atual.length - 12) {
        const resto = atual.splice(corte + 1);
        fechar();
        atual = resto; tam = resto.reduce((a, x) => a + x.length + 1, 0);
      } else fechar();
    }
    atual.push(l); tam += n;
  }
  fechar();
  return paginas;
}
