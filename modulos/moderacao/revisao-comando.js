// &caso — o dono do bot e a amostra diária (P3a, 31 out 2026). A fila: revisao.js.
//
//   &caso                                  os próximos casos agora (até o teto do dia)
//   &caso <código>                         o caso de novo, na DM (com ✅/❌)
//   &caso <código> certo|errou             o mesmo que reagir
//   &caso exportar                         arquivo sem nome nem ID (imagem só como hash)
//
// Só o dono do bot, só na DM com a Judy. Num servidor (mesmo o dele) o `&caso` não mostra
// NADA da fila — nem código, nem contagem: uma linha pedindo a DM (31 out 2026, P3a, revisão).
// (31 out 2026, P3a, staff — R13) Saíram `&caso perdeu` (o dono apontava o que o bot deixou
// passar num servidor) e `&caso servidor <id> rigido|padrao` (configuração de servidor): os
// casos e a regra de cada servidor são da staff dele.

import * as revisao from "./revisao.js";
import { tr } from "../core/i18n.js";
import { normalizarArgs } from "../core/aliases.js";
import { erroDeUso, erro, responder } from "../core/saida.js";
import { subirAnexo } from "../core/anexos.js";
import { registrarErro } from "../core/erros.js";
import * as db from "../core/db.js";

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

  // ── &caso <código> [certo|errou] ──
  if (revisao.ehCodigo(sub)) {
    const codigo = sub.toUpperCase();
    const caso = db.filaCaso(codigo);
    if (!caso) return erro(ctx, message.channel, `Não há caso \`${codigo}\`.`, `There's no case \`${codigo}\`.`, `No hay caso \`${codigo}\`.`);
    if (args.length > 2) return uso();
    if (args[1] !== undefined) {
      const veredito = normalizarArgs("caso", [String(args[1]).toLowerCase()])[0];
      if (veredito !== "certo" && veredito !== "errou") return uso();
      revisao.julgar(codigo, veredito);
      return responder(ctx, message.channel, `\`${codigo}\` ${veredito === "certo" ? "✅" : "❌"}`, `\`${codigo}\` ${veredito === "certo" ? "✅" : "❌"}`, null, "sucesso");
    }
    const msg = await sendEmbed(message.channel, revisao.embedDoCaso(caso, ctx));
    if (msg?.id) {
      if (caso.dmMsgId && caso.dmMsgId !== msg.id) await revisao.encurtarDmAntiga(caso);   // a antiga perde o trecho
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
    return erroDeUso(ctx, message.channel, "caso", "Use um código de caso ou `exportar`.", "Use a case code or `export`.", "Usa un código de caso o `exportar`.");
  }
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
