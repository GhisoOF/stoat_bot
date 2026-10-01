// Banir pelo Stoat, com o caso "já estava banido" resolvido.
//
// O backend (crates/delta/src/routes/servers/ban_create.rs) sempre termina em
// ServerBan::create → insert_one na coleção server_bans. Banir de novo quem já
// está banido bate na chave duplicada e a API devolve só {"type":"DatabaseError"}
// — o "Erro: DatabaseError" que a Lana e a Lápis viram em 27/09 ao banir alguém
// que já tinha sido banido. Não é falha: o ban que se queria já existe.
//
// Para não engolir um DatabaseError de verdade, o caso só vira "já estava" se a
// lista de bans do servidor confirmar a pessoa nela.

import { normalizarErro, tipoDoErro } from "./erros.js";

export function pareceBanDuplicado(e) {
  const o = normalizarErro(e);
  if (tipoDoErro(o) !== "DatabaseError") return false;
  if (o.collection && !/ban/i.test(String(o.collection))) return false;
  if (o.operation && !/insert/i.test(String(o.operation))) return false;
  return true;
}

export async function estaBanido(server, userId) {
  try {
    const bans = await server.fetchBans();
    return bans.some((b) => (b?.id?.user ?? b?._id?.user) === userId);
  } catch { return null; }   // sem BanMembers para listar: não dá para afirmar
}

// { ok: true, jaEstava: bool } — ou lança o erro original.
export async function banir(server, userId, opcoes = {}) {
  try {
    await server.banUser(userId, opcoes);
    return { ok: true, jaEstava: false };
  } catch (e) {
    if (pareceBanDuplicado(e)) {
      const conf = await estaBanido(server, userId);
      if (conf !== false) {   // confirmado (true) ou impossível de listar (null)
        console.log(`[BAN] ${userId} já estava banido em ${server?.id} — tratado como sucesso`);
        return { ok: true, jaEstava: true };
      }
    }
    throw e;
  }
}
