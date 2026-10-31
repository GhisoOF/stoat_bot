import { resolverCargo } from "../core/ids.js";
import { editarCargos, podeUsarCargo, cargoDe } from "../core/hierarquia.js";
import { tr } from "../core/i18n.js";
import { erroDeUso, semPermissao } from "../moderacao/punir.js";
import { registrarErro } from "../core/erros.js";

// &autorole @cargo | off (P2): o cargo que todo membro novo recebe ao entrar. Sem
// nada, mostra o cargo de hoje. `set` (o nome antigo) continua valendo na frente.
export async function cmdAutorole(message, args, ctx) {
  const { sendEmbed, COR, config, getServer, membroTemPermissao, salvarConfig } = ctx;
  const canal = message.channel;
  const linha = (cor, pt, en, es) => sendEmbed(canal, { description: tr(ctx, pt, en, es), colour: cor });
  config.autorole ??= { roleId: null };
  const sub = String(args[0] ?? "").toLowerCase();

  // o estado (não exige permissão)
  if (!sub) {
    const atual = config.autorole.roleId;
    return atual
      ? linha(COR.mod, `🎭 Quem entra recebe <%${atual}>.`, `🎭 Newcomers get <%${atual}>.`, `🎭 Quien entra recibe <%${atual}>.`)
      : linha(COR.mod, "🎭 Sem cargo automático.", "🎭 No automatic role.", "🎭 Sin rol automático.");
  }

  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "ManageRole")) return semPermissao(ctx, canal, "ManageRole");

  if (sub === "off" || sub === "desativar" || sub === "remover") {
    config.autorole.roleId = null;
    salvarConfig();
    return linha(COR.sucesso, "🎭 Cargo automático desligado.", "🎭 Automatic role off.", "🎭 Rol automático desactivado.");
  }

  const entrada = (sub === "set" ? args.slice(1) : args).join(" ");
  const roleId = resolverCargo(entrada, server)?.id ?? null;
  if (!roleId || !cargoDe(server, roleId)) {
    const e = entrada.slice(0, 40).replace(/`/g, "");
    return erroDeUso(ctx, canal, "autorole", e ? `Não achei o cargo \`${e}\`` : "Qual cargo?", e ? `Couldn't find the role \`${e}\`` : "Which role?", e ? `No encontré el rol \`${e}\`` : "¿Qué rol?");
  }
  // quem configura precisa estar ACIMA do cargo (15 out 2026)
  const pode = await podeUsarCargo(server, message, roleId, ctx);
  if (!pode.ok) return linha(COR.erro, `🚫 Acima de você: ${pode.pt}.`, `🚫 Above you: ${pode.en}.`, `🚫 Por encima de ti: ${pode.es ?? pode.en}.`);
  config.autorole.roleId = roleId;
  salvarConfig();
  return linha(COR.sucesso, `🎭 Quem entra recebe <%${roleId}>.`, `🎭 Newcomers get <%${roleId}>.`, `🎭 Quien entra recibe <%${roleId}>.`);
}

export async function aoEntrar(member, ctx) {
  const roleId = ctx.config?.autorole?.roleId;
  if (!roleId) return;
  try {
    const userId = member?.id?.user;
    const server = await ctx.getServer({ serverId: ctx.serverId });
    const alvo = await server.fetchMember(userId).catch(() => null);
    if (!alvo) return;
    if ((alvo.roles ?? []).map((r) => r?.id ?? r).includes(roleId)) return;   // já tem
    await editarCargos(server, alvo, (a) => [...a, roleId]);
    console.log(`[AUTOROLE] cargo ${roleId} dado a ${userId} em ${ctx.serverId}`);
  } catch (e) {
    registrarErro("AUTOROLE", e);
  }
}
