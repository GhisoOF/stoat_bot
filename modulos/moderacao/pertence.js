// "Este ID é DESTE servidor?"
//
// Na migração da era de um servidor só, a config daquele servidor virou o
// MOLDE de todo servidor novo — com o cargo de silêncio e o canal de avisos
// dele dentro. Resultado (28/09): servidor novo com cargo de silêncio
// "inexistente" (o bot achava que já tinha um e não criava) e, pior, alertas
// do sentinela apontando para o #log de OUTRO servidor.
//
// Aqui fica a checagem, sem chamada à API: o stoat.js já traz os cargos e os
// IDs de canais de cada servidor no estado da conexão.

import { criarCargoMudo } from "./comandos-admin.js";

function temChave(colecao, id) {
  if (!colecao || !id) return false;
  if (typeof colecao.has === "function") return colecao.has(id);
  return Object.prototype.hasOwnProperty.call(colecao, id);
}
// Sem a coleção carregada não dá para afirmar nada — melhor não mexer.
function conhecido(colecao) {
  if (!colecao) return false;
  const n = typeof colecao.size === "number" ? colecao.size : Object.keys(colecao).length;
  return n > 0;
}

export function cargoDoServidor(server, id) {
  return temChave(server?.roles, id);
}
export function canalDoServidor(server, id) {
  return temChave(server?.channelIds, id) || (server?.channels ?? []).some?.((c) => c?.id === id);
}

// Tira da config os IDs que não são deste servidor. Devolve o que mudou.
export function curarIds(config, server) {
  if (!config || !server) return [];
  const mudou = [];
  const cargosOk = conhecido(server.roles), canaisOk = conhecido(server.channelIds) || (server.channels?.length ?? 0) > 0;
  const zerar = (obj, chave, tipo) => {
    const id = obj?.[chave];
    if (!id) return;
    if (tipo === "cargo" && cargosOk && !cargoDoServidor(server, id)) { obj[chave] = null; mudou.push(chave); }
    if (tipo === "canal" && canaisOk && !canalDoServidor(server, id)) { obj[chave] = null; mudou.push(chave); }
  };
  zerar(config.automod?.punicao, "silenceRoleId", "cargo");
  zerar(config.automod?.antiScam, "alertChannelId", "canal");
  zerar(config.log, "canalId", "canal");
  zerar(config.rss, "canalId", "canal");
  zerar(config.autorole, "roleId", "cargo");
  if (Array.isArray(config.acesso?.cargosStaff) && cargosOk) {
    const antes = config.acesso.cargosStaff.length;
    config.acesso.cargosStaff = config.acesso.cargosStaff.filter((id) => cargoDoServidor(server, id));
    if (config.acesso.cargosStaff.length !== antes) mudou.push("cargosStaff");
  }
  if (mudou.length) console.log(`[CONFIG] ${server.id}: IDs de outro servidor descartados (${mudou.join(", ")})`);
  return mudou;
}

// O cargo de silêncio deste servidor — e, se não houver, cria um.
// Uma criação por servidor de cada vez: num raid chegam várias punições
// juntas, e cada uma não pode criar o seu próprio cargo.
const criando = new Map();
export async function garantirCargoSilencio(server, ctx) {
  const pol = (ctx.config.automod.punicao ??= {});
  if (pol.silenceRoleId && (!conhecido(server?.roles) || cargoDoServidor(server, pol.silenceRoleId))) return pol.silenceRoleId;
  pol.silenceRoleId = null;
  if (criando.has(server.id)) return criando.get(server.id);
  const tarefa = (async () => {
    try {
      const nome = ctx.config?.language === "en" ? "Silenced" : "Silenciado";
      const { id } = await criarCargoMudo(server, nome, true);
      pol.silenceRoleId = id;
      ctx.salvarConfig?.();
      console.log(`[PUNIÇÃO] ${server.id}: cargo de silêncio criado sozinho (${id})`);
      return id;
    } catch (e) {
      console.warn(`[PUNIÇÃO] ${server.id}: não consegui criar o cargo de silêncio — ${e?.message ?? e}`);
      return null;
    } finally { criando.delete(server.id); }
  })();
  criando.set(server.id, tarefa);
  return tarefa;
}

export { limparMolde } from "../core/molde.js";
