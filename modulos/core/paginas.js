import * as db from "./db.js";

export const EMOJI_ANTERIOR = "◀";
export const EMOJI_PROXIMA  = "▶";
export const EMOJI_INICIO   = "⏮";

const TTL_PADRAO_MS = 15 * 60 * 1000;
// No banco a sessão dura dias: quem abre o relatório de madrugada vira a
// página de manhã, e um reinício do container não mata os botões.
const TTL_BANCO_MS = Number(process.env.PAGINAS_DIAS || 7) * 24 * 3600e3;

// O banco é opcional: sem ele (testes, banco fechado) fica o comportamento antigo.
function gravar(msgId, s) {
  try {
    db.salvarSessaoPaginas(msgId, {
      paginas: s.paginas, idx: s.idx, autorId: s.autorId ?? null,
      comandoPagina: s.comandoPagina ?? null, lang: s.lang, colour: s.colour ?? null,
    }, Date.now() + TTL_BANCO_MS);
  } catch {}
}
function recuperar(msgId) {
  try { return db.carregarSessaoPaginas(msgId); } catch { return null; }
}
let ultimaPoda = 0;
function podarBanco() {
  if (Date.now() - ultimaPoda < 3600e3) return;
  ultimaPoda = Date.now();
  try { db.podarSessoesPaginas(); } catch {}
}

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

export async function enviarPaginado(ctx, canal, {
  paginas, autorId, paginaInicial = 0, comandoPagina = null,
  ttlMs = TTL_PADRAO_MS, colour = ctx?.COR?.info,
} = {}) {
  if (!Array.isArray(paginas) || !paginas.length) return;
  varrer();
  const lang = ctx?.config?.language === "en" ? "en" : "pt";
  const idx = Math.min(Math.max(0, paginaInicial | 0), paginas.length - 1);
  const sessao = { paginas, idx, autorId, comandoPagina, lang, colour, expira: agora() + ttlMs, ctx };
  // O que vai para o banco já sai traduzido (o ctx não sobrevive a um reinício).
  const exibir = ctx?.exibir ?? ((t) => t);
  const paraBanco = () => ({
    ...sessao,
    paginas: paginas.map((p) => ({ ...p, title: exibir(p.title), description: exibir(p.description) })),
    comandoPagina: comandoPagina ? exibir(comandoPagina) : null,
  });

  const msg = await ctx.sendEmbed(canal, montar(sessao, idx));
  const msgId = msg?.id ?? msg?._id;
  if (!msgId || paginas.length < 2) return msg;

  sessao.msg = msg;
  sessoes.set(msgId, sessao);
  gravar(msgId, paraBanco());
  podarBanco();

  for (const e of [EMOJI_ANTERIOR, EMOJI_PROXIMA]) {
    try { await msg.react?.(encodeURIComponent(e)); }
    catch (err) { console.warn("[PAGINAS] não consegui reagir:", err?.message ?? err); break; }
  }
  return msg;
}

// `msgObj`: a mensagem que o evento de reação traz — é com ela que uma sessão
// recuperada do banco (sem o objeto original) consegue editar.
export async function aoReagir(msgId, userId, emoji, msgObj = null) {
  if (!msgId) return false;
  const e = limparEmoji(emoji);
  if (e !== EMOJI_ANTERIOR && e !== EMOJI_PROXIMA && e !== EMOJI_INICIO) return false;
  varrer();
  let s = sessoes.get(msgId);
  if (!s) {
    const salva = recuperar(msgId);
    if (!salva?.paginas?.length) return false;
    s = { ...salva, expira: agora() + TTL_PADRAO_MS, ctx: null, msg: (typeof msgObj?.edit === "function") ? msgObj : null, doBanco: true };
    sessoes.set(msgId, s);
  }
  if (!s.msg && typeof msgObj?.edit === "function") s.msg = msgObj;
  if (s.autorId && userId !== s.autorId) return true;   // reação de outra pessoa: ignora, mas era nossa

  const total = s.paginas.length;
  if (e === EMOJI_INICIO) s.idx = 0;
  else s.idx = (s.idx + (e === EMOJI_PROXIMA ? 1 : total - 1)) % total;
  s.expira = agora() + TTL_PADRAO_MS;   // quem está navegando ganha mais tempo

  const embed = montar(s, s.idx);
  if (!s.msg) { console.warn(`[PAGINAS] sessão de ${msgId} sem a mensagem para editar`); return true; }
  try {
    const exibir = s.ctx?.exibir ?? ((t) => t);
    await s.msg.edit({ embeds: [{ ...embed, title: exibir(embed.title), description: exibir(embed.description) }] });
  } catch (err) {
    console.warn("[PAGINAS] falha ao editar:", err?.message ?? err);
  }
  // a página atual também fica no banco (a próxima reação continua dela)
  if (s.doBanco) gravar(msgId, s);
  else { const salva = recuperar(msgId); if (salva) gravar(msgId, { ...salva, idx: s.idx }); }
  return true;
}

// Quantas sessões ativas (para o &debug e os testes).
export function ativas() { varrer(); return sessoes.size; }

// Página atual de uma mensagem (testes).
export function paginaDe(msgId) { return sessoes.get(msgId)?.idx ?? null; }

export function paginarLinhas(linhas, { titulo, limite = 1350 } = {}) {
  const paginas = [];
  let atual = [];
  let tam = 0;
  const fechar = () => {
    if (!atual.length) return;
    paginas.push({ title: titulo, description: atual.join("\n") });
    atual = []; tam = 0;
  };
  // Uma linha sozinha maior que a página era cortada com "…" lá no montar.
  // Quebra ela antes, de preferência num espaço.
  const partes = [];
  for (const l of linhas) {
    let resto = String(l);
    while (resto.length > limite) {
      let corte = resto.lastIndexOf(" ", limite);
      if (corte < limite * 0.6) corte = limite;
      partes.push(resto.slice(0, corte));
      resto = resto.slice(corte).replace(/^ /, "");
    }
    partes.push(resto);
  }
  for (const l of partes) {
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

// ─── Qualquer resposta longa vira páginas ────────────────────────────────────
//
// O sendEmbed cortava em silêncio toda descrição acima de LIMITE_EMBED e punha
// um "…". O `&config` em português (1717 caracteres) perdia o final inteiro, e
// qualquer LISTA que cresce com o uso (blocklist, avisos, reaction roles,
// feeds, ranking) acabaria igual. Em vez de converter comando por comando, o
// próprio envio pagina — o mesmo sistema do &help e do &tutorial.
export const LIMITE_EMBED = 1500;

export function precisaPaginar({ description, imagem, anexos } = {}) {
  // Com imagem ou anexo não dá para dividir (a mídia iria só na 1ª página).
  return String(description ?? "").length > LIMITE_EMBED && !imagem && !(anexos?.length);
}

export async function enviarEmPaginas(enviar, canal, embed, { lang = "pt", COR = {} } = {}) {
  const paginas = paginarLinhas(String(embed.description ?? "").split("\n"), { titulo: embed.title })
    .map((p) => ({ ...p, colour: embed.colour }));
  const ctx = { sendEmbed: enviar, COR, config: { language: lang } };
  return enviarPaginado(ctx, canal, { paginas, autorId: null, colour: embed.colour });
}
