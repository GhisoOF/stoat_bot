// ══════════════════════════════════════════════════════════
//  ficha.js — o que a Judy sabe sobre si, de verdade
//
//  Perguntada "você está em mais algum servidor?", ela respondeu "só neste
//  aqui" — enquanto o `&servidores` listava dez, com 4.575 membros. Ela não
//  mentiu: ninguém tinha contado a ela. Todo o resto do prompt fala de tom,
//  de regras e da pessoa do outro lado; nada falava do estado do processo.
//
//  ── Por que aqui e não uma ferramenta ────────────────────
//
//  A ideia natural seria uma tool no `judy-ia`, ao lado do `ler_codigo`. Não
//  funciona: aquele serviço roda na máquina Gentoo e não tem o cliente Stoat
//  nem o banco — não conseguiria listar servidor nenhum. O dado existe só
//  aqui, no processo do bot, então é aqui que a ficha é montada e injetada.
//
//  Ela é montada SOB DEMANDA (só quando a pergunta é sobre o bot), porque
//  são ~600 tokens que não têm por que entrar num "bom dia".
// ══════════════════════════════════════════════════════════

import * as srv from "../moderacao/servidores.js";
import { contarMembros } from "../core/membros.js";
import * as db from "../core/db.js";

const seg = (ms) => Math.round(ms / 1000);

// Quanto a lista de servidores pode ocupar: num bot em 50 servidores, listar
// todos comeria o contexto inteiro. Os maiores contam a história.
const MAX_SERVIDORES = Number(process.env.FICHA_MAX_SERVIDORES || 12);

/**
 * Junta o estado real do processo num texto curto para o prompt.
 * Nada aqui é opinião ou suposição: tudo vem do cliente, do banco ou do env.
 */
export async function fichaTecnica(ctx, { serverIdAtual = null } = {}) {
  const client = ctx?.client;
  const linhas = [];

  // ── Onde ela está ──────────────────────────────────────
  try {
    const lista = srv.listarServidores(client);
    if (lista.length) {
      const dados = [];
      for (const s of lista) {
        let membros = null;
        try { membros = await contarMembros(s, client); } catch {}
        dados.push({
          nome: s?.name ?? "(sem nome)",
          id: s?._id ?? s?.id ?? "?",
          membros: Number(membros) || 0,
          atual: (s?._id ?? s?.id) === serverIdAtual,
        });
      }
      dados.sort((a, b) => b.membros - a.membros);
      const total = dados.reduce((t, d) => t + d.membros, 0);
      linhas.push(`Servidores em que você está: ${dados.length} (${total} membros no total).`);
      for (const d of dados.slice(0, MAX_SERVIDORES)) {
        linhas.push(`- ${d.nome} — ${d.membros} membro(s)${d.atual ? "  ← VOCÊ ESTÁ AQUI AGORA" : ""}`);
      }
      if (dados.length > MAX_SERVIDORES) linhas.push(`- (e mais ${dados.length - MAX_SERVIDORES})`);
    }
  } catch (e) { linhas.push(`Servidores: não consegui listar (${e?.message ?? e}).`); }

  // ── Quanto tempo de pé ─────────────────────────────────
  try { linhas.push(`De pé há: ${srv.tempoDePe()}.`); } catch {}

  // ── Os motores por baixo ───────────────────────────────
  //
  //  Ela pode DIZER quais modelos usa — isso é configuração do dono, não a
  //  identidade dela. O que continua proibido é se apresentar COMO o modelo.
  const modelos = {
    conversa: process.env.OLLAMA_MODEL_LEVE,
    código: process.env.OLLAMA_MODEL_CODIGO,
    ferramentas: process.env.OLLAMA_MODEL_LOGICA,
    decisões: process.env.OLLAMA_MODEL_DECISAO,
    "&chat especial": process.env.OLLAMA_MODEL_ESPECIAL,
  };
  const usados = Object.entries(modelos).filter(([, v]) => v);
  if (usados.length) {
    const unicos = [...new Set(usados.map(([, v]) => v))];
    linhas.push(unicos.length === 1
      ? `Modelo local que te executa: ${unicos[0]} (o mesmo para tudo).`
      : `Modelos locais que te executam: ${usados.map(([k, v]) => `${k}=${v}`).join(", ")}.`);
  }

  // ── Os serviços de que ela depende ─────────────────────
  const servicos = [
    ["serviço de IA (ferramentas)", process.env.IA_SERVICO_URL],
    ["servidor de modelos", process.env.OLLAMA_URL],
    ["voz nas calls", process.env.VOZ_SERVICO_URL],
    ["busca na web", process.env.SEARXNG_URL],
  ].filter(([, u]) => u);
  if (servicos.length) {
    linhas.push(`Serviços ligados: ${servicos.map(([n]) => n).join(", ")}.`);
  }

  // ── O que ela lembra, em número ────────────────────────
  //
  //  Perguntada "o que você tem mapeado de mim?", ela chutava. Agora tem a
  //  contagem — e pode dizer "nada" com convicção quando for nada.
  try {
    const sid = serverIdAtual;
    if (sid) {
      const fatosP = db.getFatosPessoa?.(sid, ctx?.userIdAtual ?? "", { limite: 50, minConf: 0 })?.length ?? 0;
      const fatosS = db.getFatosServidor?.(sid, { limite: 50, minConf: 0 })?.length ?? 0;
      linhas.push(`Memória neste servidor: ${fatosP} fato(s) sobre a pessoa com quem você fala, ${fatosS} sobre o servidor.`);
    }
  } catch {}

  if (!linhas.length) return "";
  return `\n\n<sua_ficha_tecnica>\n${linhas.join("\n")}\n</sua_ficha_tecnica>\nEstes números vêm do seu próprio processo, agora. São a resposta certa para perguntas sobre você — quantos servidores, há quanto tempo no ar, qual modelo, o que você lembra. Não chute nenhum deles, e não os confunda com informação sobre a pessoa com quem você fala.`;
}

// A ficha é cara (conta membros de cada servidor), então só é montada quando a
// pergunta é mesmo sobre o estado dela. Estas são as formas de perguntar.
export function perguntaSobreOEstado(texto) {
  const t = String(texto ?? "").toLowerCase();
  if (!t.trim()) return false;
  if (/\b(quantos|quais|em que|onde)\b[^.?!]{0,40}\b(servidor|servidores|server|servers|comunidade)\b/.test(t)) return true;
  if (/\bvoc[êe] (está|esta|tá|ta|fica|mora|roda|rodando|opera)\b[^.?!]{0,30}\b(em|no|na|onde)\b/.test(t)) return true;
  if (/\bonde\b[^.?!]{0,25}voc[êe][^.?!]{0,20}\b(roda|rodando|est[áa]|mora|vive|hospedad)/.test(t)) return true;
  if (/\b(mais algum|outro|outros|algum outro)\b[^.?!]{0,20}\b(servidor|server|lugar|canal)\b/.test(t)) return true;
  if (/\b(quanto tempo|desde quando|h[áa] quanto)\b[^.?!]{0,30}\b(no ar|de p[ée]|ligad|rodando|ativ)/.test(t)) return true;
  // Sem `\b` DEPOIS de `voc[êe]`: `ê` não é caractere de palavra em JS, então
  // não existe fronteira entre ele e o espaço — e o padrão nunca casaria.
  if (/\b(modelo|llm|motor)\b[^.?!]{0,30}(voc[êe]|\b(seu|sua)\b)/.test(t)
    || /(voc[êe]|\b(seu|sua)\b)[^.?!]{0,20}\b(modelo|llm|motor)\b/.test(t)) return true;
  if (/\b(seu|sua)\b[^.?!]{0,15}\b(estado|status|uptime|ficha|diagn[óo]stico|situa[çc][ãa]o)\b/.test(t)) return true;
  if (/\b(sabe|lembra|tem|guardou|guarda|mapeou|mapeado|armazen)\w*\b[^.?!]{0,30}\b(de mim|sobre mim|a meu respeito|da minha pessoa|de minha pessoa)\b/.test(t)) return true;
  if (/\b(voc[êe]|tu)\s+(dorme|desliga|reinicia|cai|trava)\b/.test(t)) return true;
  return false;
}
