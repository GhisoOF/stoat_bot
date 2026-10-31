
import { lingua, idiomaDe } from "./i18n.js";
import { trechoPronto } from "./aliases.js";
import { carimbo } from "./tempo.js";
import * as relatorioHora from "../ferramentas/relatorio.js";
import { canalDeOutroServidor } from "../moderacao/pertence.js";

// Rótulos amigáveis de cada categoria
export const EVENTOS = {
  punicoes:  "punições (avisos, silêncios, bans)",
  membros:   "entradas e saídas de membros",
  mensagens: "mensagens apagadas e editadas",
  cargos:    "cargos criados e atribuídos",
  comandos:  "tentativas de uso de comandos",
};
export const EVENTOS_EN = {
  punicoes:  "punishments (warnings, silences, bans)",
  membros:   "member joins and leaves",
  mensagens: "deleted and edited messages",
  cargos:    "roles created and assigned",
  comandos:  "command usage attempts",
};
export const EVENTOS_ES = {
  punicoes:  "sanciones (avisos, silencios, bans)",
  membros:   "entradas y salidas de miembros",
  mensagens: "mensajes borrados y editados",
  cargos:    "roles creados y asignados",
  comandos:  "intentos de uso de comandos",
};

// Cores por categoria (mantém o padrão de embeds do bot)
const CORES = {
  punicoes:  "#e74c3c",
  membros:   "#2ecc71",
  mensagens: "#f1c40f",
  cargos:    "#9b59b6",
  comandos:  "#3498db",
  novidades: "#5865F2",   // (P2) as novidades da Judy e os avisos do dono do bot (anunciarNoLog)
};

const RESGATE_MAX_BYTES = Number(process.env.LOG_MIDIA_MAX_BYTES || 10 * 1024 * 1024);
export async function resgatarMidias(atts, { baixar = fetch, subir } = {}) {
  const CDN = (process.env.CDN_URL || "https://cdn.stoatusercontent.com").replace(/\/$/, "");
  const ids = [];
  const perdidas = [];
  if (typeof subir !== "function") return { ids, perdidas };
  for (const a of (atts ?? []).slice(0, 3)) {
    const id = a?.id ?? a?._id;
    const tipo = String(a?.metadata?.type ?? a?.content_type ?? "");
    const nome = a?.filename ?? "midia";
    if (!id || !/image|video/i.test(tipo)) continue;
    if ((a?.size ?? 0) > RESGATE_MAX_BYTES) { perdidas.push(`${nome} (grande demais para reanexar)`); continue; }
    try {
      const r = await baixar(`${CDN}/attachments/${id}`, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length > RESGATE_MAX_BYTES) { perdidas.push(`${nome} (grande demais)`); continue; }
      const mime = r.headers.get("content-type") || (/video/i.test(tipo) ? "video/mp4" : "image/png");
      const novoId = await subir({ base64: bytes.toString("base64"), mime, nome });
      if (novoId) ids.push(novoId); else perdidas.push(nome);
    } catch (e) {
      perdidas.push(`${nome} (${e?.message ?? "irrecuperável"})`);
    }
  }
  return { ids, perdidas };
}

// `en: { titulo, descricao }` é a versão em inglês — usada quando o servidor
// está em inglês (14 out 2026: num servidor EN o log saía todo em português).
// Toda chamada de `registrar` passa as duas línguas; o teste `log-en-14out`
// confere isso no código-fonte.
// `es: { titulo, descricao }` (etapa 4b, 21 out 2026): a versão em espanhol, que sai
// pronta (como a do i18n.tr); sem ela, o servidor em espanhol recebe o inglês.
export async function registrar(ctx, categoria, { titulo, descricao, en = null, es = null, imagem = null, anexos = null }) {
  // Todo evento conta para o relatório horário do dono do bot, inclusive nos
  // servidores sem canal de log (é justamente a visão de todos os servidores).
  relatorioHora.evento(ctx?.serverId, categoria, titulo);
  if (es && idiomaDe(ctx) === "es") {
    titulo = trechoPronto(es.titulo ?? en?.titulo ?? titulo);
    descricao = trechoPronto(es.descricao ?? en?.descricao ?? descricao);
  } else if (en && lingua(ctx) === "en") {
    titulo = en.titulo ?? titulo;
    descricao = en.descricao ?? descricao;
  }
  try {
    const cfg = ctx?.config?.log;
    if (!cfg?.canalId) return;                 // sem canal configurado
    if (cfg.eventos?.[categoria] === false) return; // categoria desligada

    const canal = ctx.client.channels.get(cfg.canalId)
              ?? await ctx.client.channels.fetch(cfg.canalId).catch(() => null);
    if (!canal) return;
    // o log de um servidor nunca sai no canal de OUTRO (15 out 2026)
    if (canalDeOutroServidor(canal, ctx.serverId)) return;

    // (P2) o horário pelo timestamp do Stoat: cada um vê no próprio fuso
    await ctx.sendEmbed(canal, {
      title: titulo,
      description: `${descricao}\n\n${carimbo(Date.now(), "f")}`,
      colour: CORES[categoria] ?? "#95a5a6",
      imagem,
      anexos,
    });
  } catch (err) {
    console.error("[LOG] Falha ao registrar:", err?.message);
  }
}

// (P2, 31 out 2026) o `&log` (cmdLog) virou `&config log`: mora em modulos/moderacao/config-log.js
// (o core não tem handler de comando).


// Freio do resgate de mídia (2 out 2026): por autor, no máximo 3 anexos
// resgatados a cada 10 min, e a mesma imagem (tamanho + dimensões) uma vez só.
const resgates = new Map();   // chave → { t: [quando…], digitais: Map(digital → quando) }
export function freioDeResgate(chave, anexos, { agora = Date.now(), max = 3, janelaMs = 10 * 60_000 } = {}) {
  const st = resgates.get(chave) ?? { t: [], digitais: new Map() };
  st.t = st.t.filter((x) => agora - x < janelaMs);
  for (const [d, x] of st.digitais) if (agora - x > janelaMs) st.digitais.delete(d);
  const resgatar = [];
  let segurados = 0;
  for (const a of anexos ?? []) {
    const d = `${a?.size ?? "?"}:${a?.metadata?.width ?? "?"}x${a?.metadata?.height ?? "?"}`;
    if (st.digitais.has(d) || st.t.length >= max) { segurados++; continue; }
    st.digitais.set(d, agora); st.t.push(agora); resgatar.push(a);
  }
  resgates.set(chave, st);
  if (resgates.size > 500) resgates.delete(resgates.keys().next().value);
  return { resgatar, segurados };
}
