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

// O canal é de OUTRO servidor? (12 out 2026) Com o bot global, um admin do
// servidor A digitava o ID de um canal do servidor B (`&embed canal:`,
// `&webhook canal`, `&cor painel`, canal de log/boas-vindas…) e a Judy
// publicava lá o que ele quisesse. Só afirma quando sabe: canal sem servidor
// (DM) ou sem a informação não é barrado.
export function canalDeOutroServidor(canal, serverId) {
  const dele = canal?.serverId ?? canal?.server?.id ?? null;
  return !!(serverId && dele && dele !== serverId);
}

// O canal que a pessoa apontou (`<#id>`, `#id` ou o ID cru), SÓ se for deste
// servidor (31 out 2026, R9). Uma função para todos os comandos que publicam
// num canal escolhido (&embed canal:, &ticket painel, &cor painel, &webhook,
// &boasvindas, &rss, &log): canal de outro servidor, DM ou grupo → null.
export function canalDesteServidor(server, entrada) {
  const id = String(entrada ?? "").trim().replace(/^<#|>$/g, "").replace(/^#/, "");
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id) || !server) return null;
  const canal = (server.channels ?? []).find?.((c) => c?.id === id) ?? null;
  if (canal) return canal;
  return canalDoServidor(server, id) ? { id } : null;
}

// O canal onde a STAFF recebe alertas (31 out 2026, R9): o do sentinela, senão o
// de log — e só se for DESTE servidor. Sem nenhum, devolve null: o alerta NÃO vai
// para o canal público da mensagem (antes "Padrão de dano", com trechos de
// autolesão, e "Possível ameaça" caíam no canal onde a pessoa falou).
export async function canalDaStaff(ctx, server = null) {
  const id = ctx?.config?.automod?.antiScam?.alertChannelId || ctx?.config?.log?.canalId || null;
  if (!id) return null;
  let canal = null;
  try { canal = ctx?.client?.channels?.get?.(id) ?? await ctx?.client?.channels?.fetch?.(id); } catch { canal = null; }
  if (!canal) return null;
  const sid = server?.id ?? ctx?.serverId ?? null;
  if (canalDeOutroServidor(canal, sid)) return null;
  return canal;
}

// Quem pede pode ESCREVER nesse canal? (31 out 2026, R9) `&embed canal:` e
// `&cor painel <canal>` publicavam onde a pessoa não podia falar. Dono do
// servidor e dono do bot passam; os outros precisam do SendMessage lá.
export function podeEscreverNoCanal(message, canal, server, ctx) {
  if (ctx?.ehSuperAdmin?.(message?.authorId)) return true;
  if (server?.ownerId && server.ownerId === message?.authorId) return true;
  if (!canal || canal.id === message?.channelId) return true;   // o próprio canal: já está escrevendo nele
  try { return message?.member?.hasPermission?.(canal, "SendMessage") === true; } catch { return false; }
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
  zerar(config.boasVindas, "canalId", "canal");
  zerar(config.adeus, "canalId", "canal");
  zerar(config.xp, "canalAnuncio", "canal");
  zerar(config.tickets, "logCanal", "canal");
  zerar(config.comentarioEspontaneo, "canalId", "canal");
  zerar(config.servidorInfo, "regrasCanal", "canal");   // senão o &servidor regras leria outro servidor
  zerar(config.autorole, "roleId", "cargo");
  if (Array.isArray(config.automod?.antiAssuntos?.canaisLiberados) && canaisOk) {
    const antes = config.automod.antiAssuntos.canaisLiberados.length;
    config.automod.antiAssuntos.canaisLiberados = config.automod.antiAssuntos.canaisLiberados.filter((id) => canalDoServidor(server, id));
    if (config.automod.antiAssuntos.canaisLiberados.length !== antes) mudou.push("canaisLiberados");
  }
  if (Array.isArray(config.automod?.antiInvite?.canaisLiberados) && canaisOk) {
    const antes = config.automod.antiInvite.canaisLiberados.length;
    config.automod.antiInvite.canaisLiberados = config.automod.antiInvite.canaisLiberados.filter((id) => canalDoServidor(server, id));
    if (config.automod.antiInvite.canaisLiberados.length !== antes) mudou.push("antiInvite.canaisLiberados");
  }
  if (Array.isArray(config.acesso?.cargosStaff) && cargosOk) {
    const antes = config.acesso.cargosStaff.length;
    config.acesso.cargosStaff = config.acesso.cargosStaff.filter((id) => cargoDoServidor(server, id));
    if (config.acesso.cargosStaff.length !== antes) mudou.push("cargosStaff");
  }
  if (mudou.length) console.log(`[CONFIG] ${server.id}: IDs de outro servidor descartados (${mudou.join(", ")})`);
  return mudou;
}

export { limparMolde } from "../core/molde.js";
