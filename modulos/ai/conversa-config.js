// conversa-config.js — o que o SERVIDOR escolhe sobre a Judy (31 out 2026, P2).
//
// Era o `&chat on|off`, `&chat imagem on|off`, `&chat livre …` e `&chat comentar …`.
// O &chat saiu; a tela que liga e desliga é a do `&config`/`&assistente` (área do
// registro), que chama este handler para a parte da IA. As chaves são as de sempre:
//   config.ia.chat / config.ia.imagem        (true/false; sem escolha = padrão)
//   config.chatLivre.canais / .modo          ("relevante" | "todas")
//   config.comentarioEspontaneo.canalId / .porDia
// Quem tinha a conversa ligada continua ligada (nada é migrado nem apagado).
//
// Uso (args): chat on|off · imagem on|off · livre on|off|todas|relevante ·
// comentar [aqui|off|<1-20>|status]; os caminhos antigos (`livre modo todas`,
// `comentar pordia <n>`) também valem. Pede ManagePermissions. Saída mínima, pt/en/es.

import { tr } from "../core/i18n.js";
import { citar } from "../core/aliases.js";
import * as gating from "./gating.js";

const ON = new Set(["on", "ligar", "ativar", "activar", "enable", "sim", "yes", "si", "sí"]);
const OFF = new Set(["off", "desligar", "desativar", "desactivar", "disable", "nao", "não", "no"]);

// O estado, para a tela do &config (uma linha por chave, nos 3 idiomas)

export async function cmdConfigIA(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  const cfg = ctx.config;
  const qual = String(args[0] ?? "").toLowerCase();
  // `livre modo todas` (o caminho antigo) = `livre todas`
  let valor = String(args[1] ?? "").toLowerCase();
  if (qual === "livre" && (valor === "modo" || valor === "mode")) valor = String(args[2] ?? "").toLowerCase();
  const enviar = (cor, pt, en, es) => sendEmbed(message.channel, tr(ctx, { description: pt, colour: cor }, { description: en, colour: cor }, { description: es, colour: cor }));
  const ajuda = (l) => `\`${citar("help", l, P)} ${citar("config", l, "")}\``;
  const uso = () => enviar(COR.aviso, `❓ ${ajuda("pt")}`, `❓ ${ajuda("en")}`, `❓ ${ajuda("es")}`);

  const server = await Promise.resolve(ctx.getServer?.(message)).catch(() => null);
  if (ctx.membroTemPermissao && !ctx.membroTemPermissao(message, server, "ManagePermissions")) {
    return enviar(COR.erro, "🚫 Pede **ManagePermissions**.", "🚫 Needs **ManagePermissions**.", "🚫 Requiere **ManagePermissions**.");
  }
  const salvar = () => ctx.salvarConfig?.();
  const ligar = ON.has(valor), desligar = OFF.has(valor);

  const estado = (on) => (on ? ["ligada", "on", "activada"] : ["desligada", "off", "desactivada"]);
  if ((qual === "chat" || qual === "imagem") && (!valor || valor === "status")) {
    const e = estado(qual === "chat" ? gating.conversaAqui(ctx.serverId, cfg) : gating.imagemAqui(ctx.serverId, cfg));
    return qual === "chat"
      ? enviar(COR.info, `💬 Conversa com a Judy: ${e[0]}.`, `💬 Chatting with Judy: ${e[1]}.`, `💬 Conversación con Judy: ${e[2]}.`)
      : enviar(COR.info, `🎨 Geração de imagem: ${e[0]}.`, `🎨 Image generation: ${e[1]}.`, `🎨 Generación de imágenes: ${e[2]}.`);
  }

  // Ligar o que o .env não deixa rodar aqui (fora do CHAT_SERVIDORES, CONVERSA=0, IA=0)
  // gravaria e diria "ligada" sem a Judy conversar: recusa em uma linha, sem gravar
  // (revisão do P2). Desligar sempre pode (é verdade de qualquer jeito).
  const indisponivel = () => enviar(COR.aviso, "🚫 A conversa com a Judy não está disponível neste servidor.",
    "🚫 Chatting with Judy isn't available on this server.", "🚫 La conversación con Judy no está disponible en este servidor.");
  const semIA = !gating.iaNoEnv(ctx.serverId);

  if (qual === "chat") {
    if (!ligar && !desligar) return uso();
    if (ligar && semIA) return indisponivel();
    gating.definirConversa(cfg, ligar);
    salvar();
    return ligar
      ? enviar(COR.sucesso, "💬 Conversa com a Judy: ligada.", "💬 Chatting with Judy: on.", "💬 Conversación con Judy: activada.")
      : enviar(COR.aviso, "💤 Conversa com a Judy: desligada.", "💤 Chatting with Judy: off.", "💤 Conversación con Judy: desactivada.");
  }

  if (qual === "imagem") {
    if (!ligar && !desligar) return uso();
    gating.definirImagem(cfg, ligar);
    salvar();
    if (ligar && !gating.imagemNoEnv()) {
      return enviar(COR.aviso, "🎨 Geração de imagem: ligada aqui, mas desligada no bot inteiro.", "🎨 Image generation: on here, but off for the whole bot.", "🎨 Generación de imágenes: activada aquí, pero desactivada en todo el bot.");
    }
    return ligar
      ? enviar(COR.sucesso, "🎨 Geração de imagem: ligada.", "🎨 Image generation: on.", "🎨 Generación de imágenes: activada.")
      : enviar(COR.aviso, "🎨 Geração de imagem: desligada.", "🎨 Image generation: off.", "🎨 Generación de imágenes: desactivada.");
  }

  if (qual === "livre") {
    cfg.chatLivre ??= { canais: [], modo: "relevante" };
    cfg.chatLivre.canais ??= [];
    const canalId = message.channelId;
    if (valor === "todas" || valor === "relevante" || valor === "all" || valor === "every" || valor === "relevant") {
      cfg.chatLivre.modo = valor === "todas" || valor === "all" || valor === "every" ? "todas" : "relevante";
      salvar();
      return cfg.chatLivre.modo === "todas"
        ? enviar(COR.sucesso, "💬 Conversa livre: responde todas as mensagens.", "💬 Free chat: replies to every message.", "💬 Conversación libre: responde todos los mensajes.")
        : enviar(COR.sucesso, "💬 Conversa livre: responde só o que for relevante.", "💬 Free chat: replies only to what's relevant.", "💬 Conversación libre: responde solo lo relevante.");
    }
    if (!valor || valor === "status") {
      const aqui = cfg.chatLivre.canais.includes(canalId), todas = cfg.chatLivre.modo === "todas";
      return enviar(COR.info,
        `💬 Conversa livre em <#${canalId}>: ${aqui ? "ligada" : "desligada"} (${todas ? "todas as mensagens" : "só o relevante"}).`,
        `💬 Free chat in <#${canalId}>: ${aqui ? "on" : "off"} (${todas ? "every message" : "only what's relevant"}).`,
        `💬 Conversación libre en <#${canalId}>: ${aqui ? "activada" : "desactivada"} (${todas ? "todos los mensajes" : "solo lo relevante"}).`);
    }
    if (!ligar && !desligar) return uso();
    if (ligar && semIA) return indisponivel();
    cfg.chatLivre.canais = ligar
      ? [...new Set([...cfg.chatLivre.canais, canalId])]
      : cfg.chatLivre.canais.filter((c) => c !== canalId);
    salvar();
    return ligar
      ? enviar(COR.sucesso, `💬 Conversa livre ligada em <#${canalId}>.`, `💬 Free chat on in <#${canalId}>.`, `💬 Conversación libre activada en <#${canalId}>.`)
      : enviar(COR.aviso, `💬 Conversa livre desligada em <#${canalId}>.`, `💬 Free chat off in <#${canalId}>.`, `💬 Conversación libre desactivada en <#${canalId}>.`);
  }

  if (qual === "comentar") {
    cfg.comentarioEspontaneo ??= { canalId: null, porDia: 4, minParaFalar: 4 };
    const ce = cfg.comentarioEspontaneo;
    if (!valor || valor === "status") {
      return ce.canalId
        ? enviar(COR.info, `💬 Comentários espontâneos em <#${ce.canalId}>, até ${ce.porDia ?? 4} por dia.`, `💬 Spontaneous comments in <#${ce.canalId}>, up to ${ce.porDia ?? 4} a day.`, `💬 Comentarios espontáneos en <#${ce.canalId}>, hasta ${ce.porDia ?? 4} al día.`)
        : enviar(COR.info, "💬 Comentários espontâneos: desligados.", "💬 Spontaneous comments: off.", "💬 Comentarios espontáneos: desactivados.");
    }
    if (valor === "aqui" || valor === "here" || valor === "aquí" || ligar) {
      if (semIA) return indisponivel();
      ce.canalId = message.channelId;
      salvar();
      return enviar(COR.sucesso, `💬 Comentários espontâneos em <#${ce.canalId}> (até ${ce.porDia ?? 4} por dia).`, `💬 Spontaneous comments in <#${ce.canalId}> (up to ${ce.porDia ?? 4} a day).`, `💬 Comentarios espontáneos en <#${ce.canalId}> (hasta ${ce.porDia ?? 4} al día).`);
    }
    if (desligar) {
      ce.canalId = null;
      salvar();
      return enviar(COR.aviso, "💬 Comentários espontâneos: desligados.", "💬 Spontaneous comments: off.", "💬 Comentarios espontáneos: desactivados.");
    }
    // `comentar pordia <n>` (o caminho antigo) ou `comentar <n>`
    const n = Number(valor === "pordia" || valor === "perday" ? args[2] : valor);
    if (!Number.isInteger(n) || n < 1 || n > 20) return uso();
    ce.porDia = n;
    salvar();
    return enviar(COR.sucesso, `💬 Até ${n} comentário(s) espontâneo(s) por dia.`, `💬 Up to ${n} spontaneous comment(s) a day.`, `💬 Hasta ${n} comentario(s) espontáneo(s) al día.`);
  }

  return uso();
}
