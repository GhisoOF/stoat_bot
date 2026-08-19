// ══════════════════════════════════════════════════════════
//  ids.js — normaliza IDs colados/mencionados pelo usuário
//
//  No Stoat as menções têm formatos próprios, e nem sempre iguais
//  aos do Discord:
//    <%01ABC…>  → CARGO      (é `%`, não `&` como no Discord)
//    <@01ABC…>  → usuário
//    <#01ABC…>  → canal
//
//  Ninguém deveria precisar saber disso: se a pessoa menciona o
//  cargo, o comando tem que entender. Estas funções aceitam menção
//  (em qualquer um dos formatos), ID puro, ou o ID com lixo em volta.
// ══════════════════════════════════════════════════════════

export const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// Remove a "casca" de qualquer menção e devolve só o ID.
// Aceita <%id>, <@id>, <@&id>, <#id>, "id" e id.
export function limparId(entrada) {
  let t = String(entrada ?? "").trim();
  if (!t) return "";
  t = t.replace(/^["'`]+|["'`]+$/g, "");        // aspas
  const m = t.match(/^<\s*[%@#&]{1,2}\s*([^>\s]+)\s*>$/);
  if (m) return m[1].trim();
  return t.replace(/[<>%@&#]/g, "").trim();     // formatos parciais/quebrados
}

// Igual a limparId, mas só devolve se for um ULID válido.
export function idValido(entrada) {
  const id = limparId(entrada);
  return ULID.test(id) ? id : "";
}

// Explica o que veio errado — mensagens de erro que ajudam de verdade.
export function descreverProblemaDeId(entrada, tipo = "cargo") {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return `faltou o ID do ${tipo}`;
  const limpo = limparId(bruto);
  if (!limpo) return `não consegui ler um ID em \`${bruto}\``;
  if (limpo.length !== 26) return `\`${limpo}\` tem ${limpo.length} caracteres (um ID tem 26)`;
  return `\`${limpo}\` não parece um ID válido`;
}

// ══════════════════════════════════════════════════════════
//  Links do Stoat
//
//  Formato: https://stoat.chat/server/<sid>/channel/<cid>/<mid>
//  (o trecho da mensagem é opcional)
//
//  Copiar o ID nem sempre é possível pelo cliente, mas copiar o
//  link é. Por isso todo comando que pede ID aceita link também.
// ══════════════════════════════════════════════════════════

// Extrai as partes de um link do Stoat. Devolve {} se não for link.
export function partesDoLink(txt) {
  const t = String(txt ?? "").trim().replace(/[<>]/g, "");
  if (!/^https?:\/\//i.test(t) && !t.includes("/channel/") && !t.includes("/server/")) return {};
  const p = t.split(/[/?#]/).filter(Boolean);
  const pegar = (chave) => {
    const i = p.indexOf(chave);
    return i !== -1 && ULID.test(p[i + 1] ?? "") ? p[i + 1] : null;
  };
  const serverId = pegar("server");
  const canalId = pegar("channel");
  const ulids = p.filter((x) => ULID.test(x));
  const ultimo = ulids[ulids.length - 1] ?? null;
  const mensagemId = ultimo && ultimo !== canalId && ultimo !== serverId ? ultimo : null;
  return { serverId, canalId, mensagemId };
}

// ── Resolvedores: aceitam menção, link, ID ou nome ─────────

// Canal: <#id>, link, ID, "aqui" ou #nome
export function resolverCanal(entrada, { message, server } = {}) {
  const bruto = String(entrada ?? "").trim();
  if (!bruto || /^(aqui|here)$/i.test(bruto)) return message?.channelId ?? null;

  const doLink = partesDoLink(bruto).canalId;
  if (doLink) return doLink;

  const id = idValido(bruto);
  if (id) return id;

  const alvo = bruto.replace(/^#/, "").toLowerCase();
  for (const c of (server?.channels ?? [])) {
    if (typeof c === "string") continue;
    if ((c?.name ?? "").toLowerCase() === alvo) return c.id ?? c._id;
  }
  return null;
}

// Cargo: <%id>, <@&id>, ID ou nome (exato, depois parcial)
export function resolverCargo(entrada, server) {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return null;

  const id = idValido(bruto);
  if (id) return { id, nome: nomeDoCargo(server, id) ?? id };

  const alvo = bruto.replace(/^@/, "").toLowerCase();
  const lista = server?.roles
    ? (typeof server.roles.entries === "function" ? [...server.roles.entries()] : Object.entries(server.roles))
    : [];
  let parcial = null;
  for (const [rid, role] of lista) {
    const nome = (role?.name ?? "").toLowerCase();
    if (nome === alvo) return { id: rid, nome: role.name };
    if (!parcial && nome.includes(alvo)) parcial = { id: rid, nome: role.name };
  }
  return parcial;
}

function nomeDoCargo(server, id) {
  try {
    const r = typeof server?.roles?.get === "function" ? server.roles.get(id) : server?.roles?.[id];
    return r?.name ?? null;
  } catch { return null; }
}

// Usuário: menção da mensagem, <@id>, ID ou nome (com ou sem #tag)
export async function resolverUsuario(entrada, { message, server } = {}) {
  // a menção real da mensagem vem primeiro: é o que a pessoa clicou
  if (message?.mentionIds?.[0]) return message.mentionIds[0];
  if (message?.mentions?.[0]?.id) return message.mentions[0].id;

  const bruto = String(entrada ?? "").trim();
  if (!bruto) return null;

  const id = idValido(bruto);
  if (id) return id;

  const alvo = bruto.replace(/^@/, "").split("#")[0].toLowerCase();
  if (!alvo) return null;
  try {
    const r = await server?.fetchMembers?.();
    const membros = r?.members ?? r ?? [];
    for (const m of membros) {
      const nome = (m?.user?.username ?? m?.username ?? "").toLowerCase();
      const apelido = (m?.nickname ?? "").toLowerCase();
      if (nome === alvo || apelido === alvo) return m?.id?.user ?? m?.user?.id ?? m?.id;
    }
    for (const m of membros) {
      const nome = (m?.user?.username ?? m?.username ?? "").toLowerCase();
      if (nome.includes(alvo)) return m?.id?.user ?? m?.user?.id ?? m?.id;
    }
  } catch {}
  return null;
}

// Mensagem: ID ou link. O canal vem junto quando o link o traz.
export function resolverMensagem(entrada) {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return { id: "" };
  const id = idValido(bruto);
  if (id) return { id, canalId: null };
  const { mensagemId, canalId } = partesDoLink(bruto);
  return { id: mensagemId ?? "", canalId: canalId ?? null };
}
