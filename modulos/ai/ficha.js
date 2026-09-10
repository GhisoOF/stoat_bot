
import * as srv from "../core/metricas.js";
import { contarMembros } from "../core/membros.js";
import * as db from "../core/db.js";

const seg = (ms) => Math.round(ms / 1000);

const MAX_SERVIDORES = Number(process.env.FICHA_MAX_SERVIDORES || 12);

/**
 * Junta o estado real do processo num texto curto para o prompt.
 * Nada aqui é opinião ou suposição: tudo vem do cliente, do banco ou do env.
 */
export async function fichaTecnica(ctx, { serverIdAtual = null } = {}) {
  const client = ctx?.client;
  const linhas = [];

  try {
    const lista = srv.listarServidores(client);
    if (lista.length) {
      const dados = [];
      for (const s of lista) {
        let membros = null;
        try { membros = await contarMembros(s, client); } catch {}
        const id = s?._id ?? s?.id ?? "?";
        let mpm = 0;
        try { mpm = srv.porMinuto(id) ?? 0; } catch {}
        dados.push({
          nome: s?.name ?? "(sem nome)",
          id,
          membros: Number(membros) || 0,
          mpm,
          atual: id === serverIdAtual,
        });
      }
      dados.sort((a, b) => b.membros - a.membros);
      const total = dados.reduce((t, d) => t + d.membros, 0);
      linhas.push(`Servidores em que você está: ${dados.length} (${total} membros no total).`);
      const ritmo = (m) => (m >= 0.1 ? `${m.toFixed(1)} msg/min` : m > 0 ? "<0,1 msg/min" : "parado");
      for (const d of dados.slice(0, MAX_SERVIDORES)) {
        linhas.push(`- ${d.nome} — ${d.membros} membro(s), ${ritmo(d.mpm)}${d.atual ? "  ← VOCÊ ESTÁ AQUI AGORA" : ""} [id ${d.id}]`);
      }
      const totalMpm = dados.reduce((t, d) => t + d.mpm, 0);
      linhas.push(`Ritmo somado: ${ritmo(totalMpm)} (medido nos últimos 15 minutos).`);
      if (dados.length > MAX_SERVIDORES) linhas.push(`- (e mais ${dados.length - MAX_SERVIDORES})`);
    }
  } catch (e) { linhas.push(`Servidores: não consegui listar (${e?.message ?? e}).`); }

  try { linhas.push(`De pé há: ${srv.tempoDePe()}.`); } catch {}

  const modelos = {
    conversa: process.env.OLLAMA_MODEL_LEVE,
    código: process.env.OLLAMA_MODEL_CODIGO,
    ferramentas: process.env.OLLAMA_MODEL_LOGICA,
    decisões: process.env.OLLAMA_MODEL_DECISAO,
  };
  const usados = Object.entries(modelos).filter(([, v]) => v);
  if (usados.length) {
    const unicos = [...new Set(usados.map(([, v]) => v))];
    linhas.push(unicos.length === 1
      ? `Modelo local que te executa: ${unicos[0]} (o mesmo para tudo).`
      : `Modelos locais que te executam: ${usados.map(([k, v]) => `${k}=${v}`).join(", ")}.`);
  }

  const servicos = [
    ["serviço de IA (ferramentas)", process.env.IA_SERVICO_URL],
    ["servidor de modelos", process.env.OLLAMA_URL],
    ["voz nas calls", process.env.VOZ_SERVICO_URL],
    ["busca na web", process.env.SEARXNG_URL],
  ].filter(([, u]) => u);
  if (servicos.length) {
    linhas.push(`Serviços ligados: ${servicos.map(([n]) => n).join(", ")}.`);
  }

  try {
    const sid = serverIdAtual;
    if (sid) {
      const fatosP = db.getFatosPessoa?.(sid, ctx?.userIdAtual ?? "", { limite: 50, minConf: 0 })?.length ?? 0;
      const fatosS = db.getFatosServidor?.(sid, { limite: 50, minConf: 0 })?.length ?? 0;
      linhas.push(`Memória neste servidor: ${fatosP} fato(s) sobre a pessoa com quem você fala, ${fatosS} sobre o servidor.`);
    }
  } catch {}

  linhas.push(
    "O que você observa ao vivo: toda mensagem dos canais que enxerga, "
    + "edições e exclusões (é assim que o automod age), entradas e saídas de membros, "
    + "e o fio recente de cada canal. O que você NÃO tem: o arquivo de log do "
    + "container (aquele com linhas [EVENTO], [CHAT][debug]) — esse só o Ghiso lê "
    + "no terminal. Se te colarem uma linha de log, você pode interpretá-la; "
    + "o que você não pode é buscá-la sozinha.",
  );

  if (!linhas.length) return "";
  return `\n\n<sua_ficha_tecnica>\n${linhas.join("\n")}\n</sua_ficha_tecnica>\nEstes números vêm do seu próprio processo, agora. São a resposta certa para perguntas sobre você — quantos servidores, há quanto tempo no ar, qual modelo, o que você lembra. Não chute nenhum deles, e não os confunda com informação sobre a pessoa com quem você fala.`;
}

export function perguntaSobreOEstado(texto) {
  const t = String(texto ?? "").toLowerCase();
  if (!t.trim()) return false;
  if (/\b(quantos|quais|em que|onde)\b[^.?!]{0,40}\b(servidor|servidores|server|servers|comunidade)\b/.test(t)) return true;
  if (/\bvoc[êe] (está|esta|tá|ta|fica|mora|roda|rodando|opera)\b[^.?!]{0,30}\b(em|no|na|onde)\b/.test(t)) return true;
  if (/\bonde\b[^.?!]{0,25}voc[êe][^.?!]{0,20}\b(roda|rodando|est[áa]|mora|vive|hospedad)/.test(t)) return true;
  if (/\b(mais algum|outro|outros|algum outro)\b[^.?!]{0,20}\b(servidor|server|lugar|canal)\b/.test(t)) return true;
  if (/\b(quanto tempo|desde quando|h[áa] quanto)\b[^.?!]{0,30}\b(no ar|de p[ée]|ligad|rodando|ativ)/.test(t)) return true;
  if (/\b(msg\/min|mensagens por minuto)\b/.test(t)) return true;
  if (/\b(atividade|movimento|movimentad|ritmo|movimentaç)\w*\b[^.?!]{0,40}\b(servidor|servidores|server|canal|canais|chat|aqui|bot)\b/.test(t)
    || /\b(servidor|servidores|server|canal|canais|chat)\b[^.?!]{0,30}\b(atividade|movimento|movimentad|ritmo)\w*/.test(t)) return true;
  if (/\b(id|identificador)\b[^.?!]{0,25}\b(canal|servidor|server)\b/.test(t)
    || /\b(canal|servidor|server)\b[^.?!]{0,20}\b(id|identificador)\b/.test(t)) return true;
  if (/\b(modelo|llm|motor)\b[^.?!]{0,30}(voc[êe]|\b(seu|sua)\b)/.test(t)
    || /(voc[êe]|\b(seu|sua)\b)[^.?!]{0,20}\b(modelo|llm|motor)\b/.test(t)) return true;
  if (/\b(seu|sua)\b[^.?!]{0,15}\b(estado|status|uptime|ficha|diagn[óo]stico|situa[çc][ãa]o)\b/.test(t)) return true;
  if (/\b(sabe|lembra|tem|guardou|guarda|mapeou|mapeado|armazen)\w*\b[^.?!]{0,30}\b(de mim|sobre mim|a meu respeito|da minha pessoa|de minha pessoa)\b/.test(t)) return true;
  if (/\b(voc[êe]|tu)\s+(dorme|desliga|reinicia|cai|trava)\b/.test(t)) return true;
  if (/\b(log|logs)\b[^.?!]{0,30}(voc[êe]|\b(seu|sua)\b)/.test(t)
    || /(voc[êe]|\b(seu|sua)\b)[^.?!]{0,25}\b(log|logs)\b/.test(t)) return true;
  if (/voc[êe]\s+(v[êe]|enxerga|observa|monitora|l[êe]|acompanha|tem acesso)/.test(t)) return true;
  return false;
}
