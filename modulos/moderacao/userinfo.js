// &userinfo — ID, conta, entrada, cargos e foto de perfil de alguém (P2: saiu do
// geral.js). O histórico de moderação é só da staff (R9, P1): avisos e silêncio
// deste servidor, e da lista global só a contagem — nada do ID nem do motivo que
// a staff de OUTRO servidor escreveu.

import * as db from "../core/db.js";
import { tr, idiomaDe } from "../core/i18n.js";
import { idEscrito } from "../core/ids.js";
import { registrarErro } from "../core/erros.js";
import { carimbo } from "../core/tempo.js";
import { validadeDosAvisos } from "./automod-engine.js";
import { criacaoDaConta } from "./confianca.js";
import { arquivoDe } from "./avatar.js";
import { resolverAlvo, responderAlvoRuim } from "./punir.js";

const X3 = (l, pt, en, es) => (l === "es" ? es : l === "en" ? en : pt);

// A foto de perfil: a do servidor (se a pessoa pôs uma), senão a da conta.
export const fotoDePerfil = (membro, usuario) => arquivoDe(membro?.avatar ?? usuario?.avatar)?.url ?? null;

// As linhas do histórico (só staff), num idioma
export function linhasDoHistorico(serverId, userId, lang, { validadeMs } = {}) {
  const L = (pt, en, es) => X3(lang, pt, en, es);
  const avisos = db.contarAvisos(serverId, userId, { validadeMs });
  const silenciado = db.estaSilenciado(serverId, userId);
  const outros = new Set(db.historicoBans(userId).filter((b) => b.serverId !== serverId).map((b) => b.serverId)).size;
  const partes = [];
  if (avisos > 0) partes.push(L(`**${avisos}** aviso(s) neste servidor`, `**${avisos}** warning(s) on this server`, `**${avisos}** aviso(s) en este servidor`));
  if (silenciado) partes.push(L("🔇 **silenciado**", "🔇 **timed out**", "🔇 **silenciado**"));
  if (!partes.length) partes.push(L("Sem avisos neste servidor.", "No warnings on this server.", "Sin avisos en este servidor."));
  return [
    L("**📋 Histórico de moderação**", "**📋 Moderation history**", "**📋 Historial de moderación**"),
    partes.join(" · "),
    outros
      ? L(`🌐 **Lista global:** banido em **${outros}** outro(s) servidor(es).`, `🌐 **Global list:** banned on **${outros}** other server(s).`, `🌐 **Lista global:** baneado en **${outros}** servidor(es) más.`)
      : L("🌐 **Lista global:** não consta.", "🌐 **Global list:** not listed.", "🌐 **Lista global:** no figura."),
  ];
}

export async function cmdUserinfo(message, args, ctx) {
  const { sendEmbed, COR, getServer, serverId } = ctx;
  const l = idiomaDe(ctx);
  const L = (pt, en, es) => X3(l, pt, en, es);
  const server = await getServer(message).catch(() => null);
  const ehStaff = !!(server && ctx.membroTemPermissao?.(message, server, "ManageMessages"));

  // quem não é staff aponta por menção/ID (o nome também procuraria entre os banidos)
  let alvoId = message.authorId;
  if (ehStaff) {
    const r = await resolverAlvo(message, args, server, ctx);
    if (r.id) alvoId = r.id;
    else if (r.erro !== "vazio") return responderAlvoRuim(ctx, message.channel, "userinfo", r);
  } else if (args.length) {
    const id = idEscrito(args.join(" "));
    if (!id) return responderAlvoRuim(ctx, message.channel, "userinfo", { erro: "nao-encontrado", entrada: args[0] });
    alvoId = id;
  }

  const membro = (alvoId === message.authorId && message.member) ? message.member
    : await server?.fetchMember?.(alvoId)?.catch?.(() => null) ?? null;
  const usuario = membro?.user ?? ctx.client?.users?.get?.(alvoId) ?? { id: alvoId };
  const criada = carimbo(usuario.createdAt ?? criacaoDaConta(alvoId), "D");
  const entrou = membro?.joinedAt ? carimbo(membro.joinedAt, "D") : null;
  const cargos = (membro?.roles ?? []).map((r) => {
    const id = r?.id ?? r;
    return server?.roles?.get?.(id)?.name ?? r?.name ?? null;
  }).filter(Boolean).join(", ");
  const foto = fotoDePerfil(membro, usuario);

  const linhas = [
    `**ID:** \`${alvoId}\``,
    criada ? L(`**Conta criada:** ${criada}`, `**Account created:** ${criada}`, `**Cuenta creada:** ${criada}`) : null,
    membro
      ? (entrou ? L(`**Entrou:** ${entrou}`, `**Joined:** ${entrou}`, `**Entró:** ${entrou}`) : null)
      : L("**Não está no servidor.**", "**Not on this server.**", "**No está en el servidor.**"),
    membro ? L(`**Cargos:** ${cargos || "—"}`, `**Roles:** ${cargos || "—"}`, `**Roles:** ${cargos || "—"}`) : null,
    foto ? L(`**Foto:** ${foto}`, `**Picture:** ${foto}`, `**Foto:** ${foto}`) : null,
  ].filter(Boolean);
  if (ehStaff) {
    try { linhas.push("", ...linhasDoHistorico(serverId, alvoId, l, { validadeMs: validadeDosAvisos(ctx.config?.automod?.punicao) })); }
    catch (e) { registrarErro("USERINFO:hist", e); }
  }
  return sendEmbed(message.channel, {
    title: `👤 ${String(usuario.username ?? membro?.nickname ?? L("Usuário", "User", "Usuario")).slice(0, 64)}`,
    description: tr(ctx, linhas.join("\n"), linhas.join("\n"), linhas.join("\n")),
    colour: COR.info,
  });
}
