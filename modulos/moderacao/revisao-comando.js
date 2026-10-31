// &caso — o dono do bot e a fila de revisão (P3a, 31 out 2026). A fila: revisao.js.
//
//   &caso                                  os próximos casos agora (até o teto do dia)
//   &caso <código>                         o caso de novo, na DM (com ✅/❌)
//   &caso <código> certo|errou             o mesmo que reagir
//   &caso perdeu @pessoa avatar|banner|bio [categoria]
//   &caso perdeu <link> [categoria]        mensagem ou imagem que o bot deixou passar
//   &caso servidor <id> [rigido|padrao]
//   &caso exportar                         arquivo sem nome nem ID (imagem só como hash)
//
// Só o dono do bot, só na DM com a Judy. Num servidor (mesmo o dele) o `&caso` não mostra
// NADA da fila — nem código, nem contagem: uma linha pedindo a DM (31 out 2026, P3a, revisão).

import * as revisao from "./revisao.js";
import { tr } from "../core/i18n.js";
import { normalizarArgs } from "../core/aliases.js";
import { erroDeUso, erro, responder } from "../core/saida.js";
import { idValido, idEscrito, partesDoLink } from "../core/ids.js";
import { pseudonimo } from "../core/pseudonimo.js";
import { subirAnexo } from "../core/anexos.js";
import { registrarErro } from "../core/erros.js";
import * as db from "../core/db.js";

const PARTES = new Set(["avatar", "banner", "bio"]);
const CATEGORIA = /^[a-z0-9][a-z0-9:_-]{0,39}$/;

export async function cmdCaso(message, args, ctx) {
  const { sendEmbed, COR } = ctx;
  if (!ctx.ehSuperAdmin?.(message.authorId)) {
    return sendEmbed(message.channel, { colour: COR.erro, description: tr(ctx, "🚫 Só o dono do bot.", "🚫 Bot owner only.", "🚫 Solo el dueño del bot.") });
  }
  const aqui = ctx.serverId ?? message.serverId ?? message.channel?.serverId ?? null;
  if (aqui) {
    return sendEmbed(message.channel, { colour: COR.info, description: tr(ctx, "🔒 Use na DM com a Judy.", "🔒 Use it in your DM with Judy.", "🔒 Úsalo por DM con Judy.") });
  }
  const sub = String(args[0] ?? "").toLowerCase();

  // ── &caso: os próximos agora ──
  if (!sub) {
    const enviados = await revisao.enviarAgora();
    if (enviados.length) return null;   // os casos são a resposta
    const s = revisao.situacao();
    return responder(ctx, message.channel,
      `📋 Esperando **${s.esperando}** · enviados hoje **${s.hoje}/${s.teto}**`,
      `📋 Waiting **${s.esperando}** · sent today **${s.hoje}/${s.teto}**`,
      `📋 Esperando **${s.esperando}** · enviados hoy **${s.hoje}/${s.teto}**`, "info");
  }

  if (sub === "exportar") return exportar(message, ctx);
  if (sub === "servidor") return servidor(message, args.slice(1), ctx);
  if (sub === "perdeu") return perdeu(message, args.slice(1), ctx);

  // ── &caso <código> [certo|errou] ──
  if (revisao.ehCodigo(sub)) {
    const codigo = sub.toUpperCase();
    const caso = db.filaCaso(codigo);
    if (!caso) return erro(ctx, message.channel, `Não há caso \`${codigo}\`.`, `There's no case \`${codigo}\`.`, `No hay caso \`${codigo}\`.`);
    if (args.length > 2) return uso();
    if (args[1] !== undefined) {
      const veredito = normalizarArgs("caso", [String(args[1]).toLowerCase()])[0];
      if (veredito !== "certo" && veredito !== "errou") return uso();
      await revisao.julgar(codigo, veredito);
      return responder(ctx, message.channel, `\`${codigo}\` ${veredito === "certo" ? "✅" : "❌"}`, `\`${codigo}\` ${veredito === "certo" ? "✅" : "❌"}`, null, "sucesso");
    }
    const msg = await sendEmbed(message.channel, revisao.embedDoCaso(caso, ctx));
    if (msg?.id) {
      db.filaAtualizar(codigo, { dmMsgId: msg.id, dmCanalId: message.channel?.id ?? message.channelId ?? null,
        ...(caso.estado === "candidato" || caso.estado === "amostra" || caso.estado === "registro" ? { estado: "enviado", enviadoEm: Date.now() } : {}) });
      if (!caso.veredito) for (const e of ["✅", "❌"]) {
        try { await msg.react?.(encodeURIComponent(e)); } catch (err) { registrarErro("CASO:react", err); break; }
      }
    }
    return msg;
  }
  return uso();

  function uso() {
    return erroDeUso(ctx, message.channel, "caso", "Use um código de caso, `perdeu`, `servidor` ou `exportar`.", "Use a case code, `missed`, `server` or `export`.", "Usa un código de caso, `perdio`, `servidor` o `exportar`.");
  }
}

// ── &caso servidor <id> [rigido|padrao] ──
async function servidor(message, args, ctx) {
  const { client } = ctx;
  const id = idValido(args[0]);
  if (!id || args.length > 2) return erroDeUso(ctx, message.channel, "caso", "Falta o ID do servidor.", "The server ID is missing.", "Falta el ID del servidor.");
  if (!client?.servers?.get?.(id)) return erro(ctx, message.channel, "A Judy não está nesse servidor.", "Judy isn't on that server.", "Judy no está en ese servidor.");
  const p = pseudonimo(id);
  const nomeModo = (m) => (m === "rigido" ? tr(ctx, "rígido", "strict", "estricto") : tr(ctx, "padrão", "default", "predeterminado"));
  if (args[1] === undefined) return responder(ctx, message.channel, `\`${p}\` · ${nomeModo(revisao.modoDoServidor(id))}`, `\`${p}\` · ${nomeModo(revisao.modoDoServidor(id))}`, null, "info");
  const modo = String(args[1]).toLowerCase();
  if (!revisao.definirModoServidor(id, modo)) return erroDeUso(ctx, message.channel, "caso", "O modo é `rigido` ou `padrao`.", "The mode is `strict` or `default`.", "El modo es `estricto` o `predeterminado`.");
  return responder(ctx, message.channel, `✅ \`${p}\` · ${nomeModo(modo)}`, `✅ \`${p}\` · ${nomeModo(modo)}`, null, "sucesso");
}

// ── &caso perdeu … ──
async function perdeu(message, args, ctx) {
  const { client } = ctx;
  const alvo = String(args[0] ?? "");
  const ganchos = revisao.ganchosDoPerfil();
  const usoPerdeu = () => erroDeUso(ctx, message.channel, "caso", "Diga quem (e `avatar`, `banner` ou `bio`) ou cole o link.", "Say who (and `avatar`, `banner` or `bio`) or paste the link.", "Di quién (y `avatar`, `banner` o `bio`) o pega el enlace.");
  const naoAchei = () => erro(ctx, message.channel, "Não achei o que apontar.", "I couldn't find anything to flag.", "No encontré nada que señalar.");
  let caso = null;
  if (/^<?https?:\/\//i.test(alvo)) {
    const categoria = args[1] ? String(args[1]).toLowerCase() : "perdeu";
    if (args.length > 2 || !CATEGORIA.test(categoria)) return usoPerdeu();
    const link = alvo.replace(/^<|>$/g, "");
    const { mensagemId, canalId } = partesDoLink(link);
    if (mensagemId && canalId) {
      const canal = client?.channels?.get?.(canalId) ?? await client?.channels?.fetch?.(canalId).catch(() => null);
      const msg = canal ? await canal.fetchMessage?.(mensagemId).catch(() => null) : null;
      if (!msg) return naoAchei();
      const anexo = msg.attachments?.[0] ?? null;
      const linkAnexo = anexo ? (anexo.url ?? anexo.createFileURL?.() ?? null) : null;
      const extra = linkAnexo && ganchos.evidenciaDoLink ? await ganchos.evidenciaDoLink({ client, link: linkAnexo }).catch((e) => { registrarErro("CASO:perdeu-link", e); return null; }) : null;
      const texto = String(msg.content ?? "");
      caso = await revisao.registrarPerdido({
        tipo: texto.trim() ? "assunto" : "imagem", categoria, serverId: canal.serverId ?? null, userId: msg.authorId ?? null, canalId, msgId: mensagemId,
        evidencia: { link: linkAnexo, trecho: texto || null, texto: texto || null, hash: extra?.hash ?? null },
      });
    } else {
      const origem = revisao.linkDeOrigem(link);
      if (!origem) return usoPerdeu();
      const extra = ganchos.evidenciaDoLink ? await ganchos.evidenciaDoLink({ client, link: origem }).catch((e) => { registrarErro("CASO:perdeu-link", e); return null; }) : null;
      caso = await revisao.registrarPerdido({ tipo: "imagem", categoria, evidencia: { link: origem, hash: extra?.hash ?? null } });
    }
  } else {
    const userId = idEscrito(alvo) ?? idValido(alvo);
    const parte = String(args[1] ?? "").toLowerCase();
    const categoria = args[2] ? String(args[2]).toLowerCase() : "perdeu";
    if (!userId || !PARTES.has(parte) || args.length > 3 || !CATEGORIA.test(categoria)) return usoPerdeu();
    let ev = null;
    try { ev = ganchos.evidenciaDoPerfil ? await ganchos.evidenciaDoPerfil({ client, userId, parte }) : await evidenciaSimples(client, userId, parte); }
    catch (e) { registrarErro("CASO:perdeu-perfil", e); }
    if (!ev) return naoAchei();
    caso = await revisao.registrarPerdido({ tipo: parte === "bio" ? "perfil-texto" : "perfil-imagem", categoria, userId, evidencia: ev });
  }
  if (!caso) return naoAchei();
  return responder(ctx, message.channel, `🎯 \`${caso.codigo}\``, `🎯 \`${caso.codigo}\``, null, "sucesso");
}

// Sem a área perfil registrada: o link do avatar/banner (sem hash) ou a bio (impressão).
const CDN = () => (process.env.CDN_URL || "https://cdn.stoatusercontent.com").replace(/\/$/, "");
const urlDoArquivo = (f, tag) => { const id = f?.id ?? f?._id; return id ? `${CDN()}/${f?.tag || tag}/${id}` : null; };
async function evidenciaSimples(client, userId, parte) {
  const user = client?.users?.get?.(userId) ?? await client?.users?.fetch?.(userId).catch(() => null);
  if (!user) return null;
  if (parte === "avatar") { const link = urlDoArquivo(user.avatar, "avatars"); return link ? { link } : null; }
  const perfil = await user.fetchProfile?.().catch(() => null);
  if (parte === "banner") { const link = urlDoArquivo(perfil?.background, "backgrounds"); return link ? { link } : null; }
  const bio = String(perfil?.content ?? "");
  return bio.trim() ? { trecho: bio, texto: bio } : null;
}

// ── &caso exportar ──
async function exportar(message, ctx) {
  const dados = revisao.exportar();
  let anexo = null;
  try {
    anexo = await subirAnexo({ base64: Buffer.from(JSON.stringify(dados, null, 1), "utf8").toString("base64"), mime: "application/json", nome: `fila-${dados.geradoEm}.json` }, ctx.client);
  } catch (e) { registrarErro("CASO:exportar", e); }
  if (!anexo) return erro(ctx, message.channel, "Não consegui subir o arquivo.", "I couldn't upload the file.", "No pude subir el archivo.");
  return ctx.sendEmbed(message.channel, { description: `📦 ${dados.casos.length}`, colour: ctx.COR?.info, anexos: [anexo] });
}
