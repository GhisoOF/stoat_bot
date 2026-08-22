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

// ══════════════════════════════════════════════════════════
//  Usuário — o resolvedor mais exigido do bot
//
//  Quem digita um comando de moderação tem na mão o que o cliente deixa
//  copiar, e isso varia: às vezes é a menção, às vezes só o nome que está
//  na tela, às vezes o `Nome#0800` do perfil, às vezes o link. Aceitar só
//  menção e ID transfere para a pessoa o trabalho de descobrir o ID — e em
//  moderação isso costuma acontecer justo quando ela está com pressa.
//
//  Pior: os comandos que mais precisam disso (`esquecer`, `isentar`,
//  `historico`) tratam de gente que **já não está no servidor**. Procurar
//  só entre os membros falha exatamente nesses casos. Por isso a busca
//  passa por várias fontes, da mais confiável para a mais frouxa:
//
//    1. menção real da mensagem      (a pessoa clicou: não há dúvida)
//    2. ID cru ou dentro de <@…>
//    3. link de perfil (/user/ID, @ID)
//    4. membros do servidor          — nome, apelido, display name, Nome#0000
//    5. banidos do servidor          — quem já foi expulso não é mais membro
//    6. cache de usuários do client
//    7. candidatos extras            — quem chama passa (ex.: a lista global,
//                                      que guarda o nome de quem registrou)
//
//  Devolve `{ id, nome, fonte }`. Quando o nome bate em mais de uma pessoa,
//  devolve `{ ambiguo, candidatos }` em vez de escolher no chute — banir a
//  pessoa errada por causa de um apelido parecido é o tipo de erro que não
//  se desfaz com um pedido de desculpas.
// ══════════════════════════════════════════════════════════

// Bot ou gente? No Revolt/Stoat o campo `bot` existe (e é um objeto com o
// dono) só para bots.
export function ehBot(u) {
  const b = u?.bot ?? u?.user?.bot;
  return b === true || (typeof b === "object" && b !== null);
}

const minusculo = (t) => String(t ?? "").trim().toLowerCase();

// Todos os apelidos pelos quais um membro/usuário pode ser chamado.
function nomesDe(m) {
  const u = m?.user ?? m;
  const disc = u?.discriminator ?? m?.discriminator ?? null;
  const base = [
    u?.username, m?.username, m?.nickname, m?.display_name, u?.display_name,
  ].filter(Boolean).map(String);
  const comTag = disc ? base.map((n) => `${n}#${disc}`) : [];
  return [...base, ...comTag];
}

function idDe(m) {
  return m?.id?.user ?? m?.user?.id ?? (typeof m?.id === "string" ? m.id : null) ?? m?._id ?? null;
}

function rotuloDe(m) {
  const u = m?.user ?? m;
  return u?.username ?? m?.nickname ?? m?.display_name ?? idDe(m) ?? "?";
}

export async function resolverUsuarioDetalhado(entrada, { message, server, client, extras = [] } = {}) {
  const bruto = String(entrada ?? "").trim();
  const pareceMencao = /^<[@%]?[^>]+>$/.test(bruto);

  // 1. A menção real da mensagem. Só vale quando a entrada está vazia ou É a
  //    própria menção — senão `&comando @alguem OutroNome` resolveria para a
  //    menção e ignoraria o que a pessoa escreveu.
  if ((!bruto || pareceMencao) && (message?.mentionIds?.[0] || message?.mentions?.[0]?.id)) {
    const id = message.mentionIds?.[0] ?? message.mentions[0].id;
    return { id, nome: null, fonte: "menção" };
  }
  if (!bruto) return { erro: "vazio" };

  // 2. ID (cru, entre <@…> ou com aspas)
  const id = idValido(bruto);
  if (id) return { id, nome: null, fonte: "id" };

  // 3. Link de perfil: .../user/ID  ou  .../@ID
  const doLink = bruto.match(/(?:\/user\/|\/@)([0-9A-HJKMNP-TV-Z]{26})/i);
  if (doLink) return { id: doLink[1], nome: null, fonte: "link" };

  // ── busca por NOME ──
  const alvo = minusculo(bruto.replace(/^@/, ""));
  const semTag = alvo.split("#")[0];
  if (!alvo) return { erro: "vazio" };

  const vistos = new Map();   // id → { id, nome, fonte }
  const juntar = (lista, fonte) => {
    for (const m of lista ?? []) {
      const uid = idDe(m);
      if (!uid || vistos.has(uid)) continue;
      vistos.set(uid, { id: uid, nome: rotuloDe(m), fonte, nomes: nomesDe(m).map(minusculo) });
    }
  };

  try { const r = await server?.fetchMembers?.(); juntar(r?.members ?? r ?? [], "membro"); } catch {}
  // Banidos: `esquecer` e `isentar` tratam justamente de quem não é membro.
  try {
    const bans = await server?.fetchBans?.();
    const lista = bans?.bans ?? bans ?? [];
    juntar(lista.map((b) => ({
      id: b?.id?.user ?? b?.user?.id ?? b?.id,
      user: b?.user ?? null,
      username: b?.user?.username ?? b?.username ?? null,
    })), "banido");
  } catch {}
  try { juntar([...(client?.users?.values?.() ?? [])], "conhecido"); } catch {}
  juntar(extras, "lista");

  const todos = [...vistos.values()];
  const casa = (c, termo) => c.nomes.some((n) => n === termo);
  const contem = (c, termo) => c.nomes.some((n) => n.includes(termo));

  // exato com tag → exato sem tag → parcial
  for (const termo of [alvo, semTag]) {
    const exatos = todos.filter((c) => casa(c, termo));
    if (exatos.length === 1) return { ...exatos[0], fonte: exatos[0].fonte };
    if (exatos.length > 1) return { ambiguo: true, candidatos: exatos.slice(0, 8) };
  }
  const parciais = todos.filter((c) => contem(c, semTag));
  if (parciais.length === 1) return { ...parciais[0] };
  if (parciais.length > 1) return { ambiguo: true, candidatos: parciais.slice(0, 8) };

  return { erro: "nao-encontrado" };
}

// Compatível com o uso antigo: devolve só o ID (ou null).
export async function resolverUsuario(entrada, opcoes = {}) {
  const r = await resolverUsuarioDetalhado(entrada, opcoes);
  return r?.id ?? null;
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
