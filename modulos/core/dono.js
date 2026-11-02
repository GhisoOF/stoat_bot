// O dono do bot (SUPER_ADMINS) — uma fonte só (P4, 2 nov 2026, decisão do Ghieh).
//
//   donos()                  os IDs de SUPER_ADMINS
//   ehDono(id)               esse ID é do dono do bot?
//   idiomaDoDono()           o idioma da DM: o do servidor do dono (RELATORIO_SERVIDOR), senão o padrão
//   dmDoDono(client)         a DM com o dono (o PRIMEIRO de SUPER_ADMINS): para onde vão a fila de
//                            revisão (revisao.js) e o relatório por hora (relatorio.js)
//   pedirDM(ctx)             a linha que um comando de dono responde num servidor (main.js)
//   servidorDoArgumento()    na DM, o comando de dono que age NUM servidor recebe o ID dele (no fim)
//
// "Todos os comandos privados que eram só meus sejam feitos apenas no meu privado, além do
// relatório ser enviado para o meu privado." Quais são os comandos de dono: o MAPA do visao.js.

import { tr } from "./i18n.js";
import { limparId } from "./ids.js";
import { registrarErro } from "./erros.js";
import * as store from "./config-store.js";

export const donos = () => (process.env.SUPER_ADMINS || "").split(",").map((x) => x.trim()).filter(Boolean);
export const ehDono = (id) => !!id && donos().includes(String(id));

// O idioma do que vai à DM do dono (a fila de revisão, os comandos dele na DM): o do servidor dele
// (RELATORIO_SERVIDOR), senão o padrão do bot — na DM não há servidor de onde tirar o idioma.
export function idiomaDoDono() {
  const sid = (process.env.RELATORIO_SERVIDOR || "").trim() || null;
  try { return store.configDoServidor(sid)?.language ?? store.configDoServidor(null)?.language ?? "en"; }
  catch { return "en"; }
}

// A DM é aberta uma vez por cliente (e por dono: trocar SUPER_ADMINS abre a do novo).
const dms = new WeakMap();   // client → { id, dm }
export async function dmDoDono(client) {
  const id = donos()[0];
  if (!id || !client || typeof client !== "object") return null;
  const guardada = dms.get(client);
  if (guardada?.id === id) return guardada.dm;
  try {
    const user = client.users?.get?.(id) ?? await client.users?.fetch?.(id).catch(() => null);
    const dm = (await user?.openDM?.()) ?? null;
    if (dm) dms.set(client, { id, dm });
    return dm;
  } catch (e) { registrarErro("DONO:dm", e); return null; }
}
export function esquecerDm(client) { if (client && typeof client === "object") dms.delete(client); }

// Num servidor, o comando de dono não roda: só esta linha (nem o que o comando mostraria).
export const pedirDM = (ctx) => ({ colour: ctx?.COR?.info, description: tr(ctx, "🔒 Use na DM com a Judy.", "🔒 Use it in your DM with Judy.", "🔒 Úsalo por DM con Judy.") });

// O ID do servidor de um comando de dono que age NUM servidor: só na posição prevista — o ÚLTIMO
// argumento (`&banglobal imediato ‹servidor›`, `desfazer confirmar ‹servidor›`). Devolve
// { sid, server, resto } (resto = os argumentos sem ele). Só o que bate com um servidor dela (R6):
// ID de pessoa, de canal, de servidor onde ela não está ou texto qualquer → null.
// (P4, revisão) antes varria todos os argumentos: um ID de servidor no meio de um motivo mudava o
// servidor do comando. Quais subcomandos recebem o ID é de quem chama (ban-global.js).
export function servidorDoArgumento(args, client) {
  const lista = Array.isArray(args) ? args : [];
  if (!lista.length) return null;
  const id = limparId(lista.at(-1));
  const server = id && id.length <= 40 ? client?.servers?.get?.(id) ?? client?.servers?.get?.(id.toUpperCase()) : null;
  return server ? { sid: server.id ?? id, server, resto: lista.slice(0, -1) } : null;
}
