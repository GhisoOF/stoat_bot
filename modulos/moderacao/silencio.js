// O cargo de silêncio — criado e CONFERIDO na configuração, não na hora da
// punição.
//
// Como o Stoat decide (stoat.js, permissions/calculator.js): os cargos de um
// membro são aplicados do de posição MAIS BAIXA para o MAIS ALTO, e o último
// vence — nas permissões do servidor e nas de cada canal. Um cargo de
// silêncio ABAIXO do cargo automático perde para ele: se o autorole libera
// SendMessage num canal, a pessoa "silenciada" continua falando.
//
// Por isso o cargo de silêncio certo:
//   1. nega tudo no servidor e em CADA canal (canal com permissão própria
//      também);
//   2. fica LOGO ABAIXO do cargo mais alto do bot — acima do autorole e de
//      todo cargo de membro (o bot só consegue mexer abaixo do dele);
//   3. é conferido simulando alguém com o autorole + o silêncio em cada canal.

import { criarCargoMudo, negarEmTodosOsCanais, GRANT_ALL_SAFE as BITS_TUDO } from "./comandos-admin.js";   // o mesmo "nega tudo"
import { calcularPermissoes, BITS } from "./permissoes.js";

const pegar = (server, id) => (typeof server?.roles?.get === "function" ? server.roles.get(id) : server?.roles?.[id]);
const idsDosCargos = (server) => (typeof server?.roles?.keys === "function" ? [...server.roles.keys()] : Object.keys(server?.roles ?? {}));
const rankDe = (server, id) => pegar(server, id)?.rank ?? Infinity;
const canaisDeTexto = (server) => (server?.channels ?? []).filter((c) => c && (c.type === "TextChannel" || c.type === "VoiceChannel"));

export const cargoExiste = (server, id) => !!pegar(server, id);

export async function membroDoBot(server, client) {
  const botId = client?.user?.id;
  if (!botId) return null;
  return client.serverMembers?.getByKey?.({ server: server.id, user: botId })
    ?? await server.fetchMember?.(botId).catch(() => null) ?? null;
}

// Rank do cargo mais alto do bot (menor número = mais alto).
export function topoDoBot(server, botMember) {
  const ranks = (botMember?.roles ?? []).map((r) => rankDe(server, r?.id ?? r)).filter(Number.isFinite);
  return ranks.length ? Math.min(...ranks) : null;
}

// Nova ordem: o silêncio logo abaixo do cargo mais alto do bot. Os cargos
// acima do bot ficam onde estão (o bot não pode mexer neles).
export function ordemComSilencio(server, roleId, rankTopoBot) {
  const ordem = idsDosCargos(server).sort((a, b) => rankDe(server, a) - rankDe(server, b)).filter((id) => id !== roleId);
  const idxBot = ordem.findIndex((id) => rankDe(server, id) === rankTopoBot);
  ordem.splice(idxBot + 1, 0, roleId);
  return ordem;
}

export async function posicionar(server, roleId, botMember) {
  const topo = topoDoBot(server, botMember);
  if (topo === null) return { ok: false, motivo: "o bot não tem cargo neste servidor — dê um cargo a ele, acima dos cargos de membro" };
  if (rankDe(server, roleId) === topo + 1 || acimaSoOBot(server, roleId, topo)) return { ok: true, mudou: false };
  const nova = ordemComSilencio(server, roleId, topo);
  await server.setRoleOrdering(nova);
  return { ok: true, mudou: true };
}
// Entre o topo do bot e o silêncio não há nenhum cargo (ranks podem ter buracos).
function acimaSoOBot(server, roleId, topo) {
  const r = rankDe(server, roleId);
  return r > topo && !idsDosCargos(server).some((id) => id !== roleId && rankDe(server, id) > topo && rankDe(server, id) < r);
}

// A conferência. Devolve { ok, problemas[], canais: {ok,total} }.
export function conferir(server, roleId, { botMember = null, autoroleId = null, lang = "pt" } = {}) {
  const en = lang === "en";
  const problemas = [];
  const cargo = pegar(server, roleId);
  if (!cargo) return { ok: false, problemas: [en ? "the silence role doesn't exist on this server" : "o cargo de silêncio não existe neste servidor"], canais: { ok: 0, total: 0 } };

  // 1) o bot consegue dar o cargo?
  const topo = topoDoBot(server, botMember);
  if (topo === null) problemas.push(en ? "the bot has no role here — give it one above member roles" : "o bot não tem cargo aqui — dê um cargo a ele, acima dos cargos de membro");
  else if (!(topo < rankDe(server, roleId))) problemas.push(en ? "the silence role is ABOVE the bot's role — the bot can't assign it" : "o cargo de silêncio está ACIMA do cargo do bot — o bot não consegue dá-lo");

  // 2) algum cargo que libera fala está acima do silêncio (e abaixo do bot)?
  const rs = rankDe(server, roleId);
  for (const id of idsDosCargos(server)) {
    if (id === roleId) continue;
    const r = rankDe(server, id);
    if (topo !== null && r <= topo) continue;             // o bot e o que está acima dele
    if (r < rs) {
      const nome = pegar(server, id)?.name ?? id;
      problemas.push(id === autoroleId
        ? (en ? `the **auto role** (${nome}) is above the silence role — whoever has it keeps talking` : `o **cargo automático** (${nome}) está acima do silêncio — quem tem ele continua falando`)
        : (en ? `**${nome}** is above the silence role — whoever has it may keep talking` : `**${nome}** está acima do silêncio — quem tem ele pode continuar falando`));
    }
  }

  // 3) cada canal: alguém com o autorole + o silêncio consegue falar?
  const simulado = { id: "__simulado__", roles: [autoroleId, roleId].filter(Boolean) };
  const canais = canaisDeTexto(server);
  const furados = [];
  for (const c of canais) {
    const p = calcularPermissoes(server, c, simulado).valor;
    if (p != null && (Number(p) & BITS.SendMessage)) furados.push(c.name ?? c.id);
  }
  if (furados.length) problemas.push(en
    ? `a silenced member can still talk in: ${furados.slice(0, 8).map((n) => `#${n}`).join(", ")}${furados.length > 8 ? "…" : ""}`
    : `um silenciado ainda consegue falar em: ${furados.slice(0, 8).map((n) => `#${n}`).join(", ")}${furados.length > 8 ? "…" : ""}`);

  return { ok: !problemas.length, problemas, canais: { ok: canais.length - furados.length, total: canais.length } };
}

// Cria (ou adota um existente), nega em tudo, posiciona e confere.
export async function preparar(server, client, { roleId = null, nome = "Silenciado", autoroleId = null, lang = "pt" } = {}) {
  let id = roleId, criado = false;
  if (!id) { id = (await criarCargoMudo(server, nome, false)).id; criado = true; }
  else await server.setPermissions(id, { allow: 0, deny: Number(BITS_TUDO) });
  const canais = await negarEmTodosOsCanais(server, id);
  const botMember = await membroDoBot(server, client);
  let posicao;
  try { posicao = await posicionar(server, id, botMember); }
  catch (e) { posicao = { ok: false, motivo: String(e?.message ?? e) }; }
  const conferencia = conferir(server, id, { botMember, autoroleId, lang });
  return { id, criado, canais, posicao, conferencia };
}
