// ══════════════════════════════════════════════════════════
//  permissoes.js — diagnóstico de permissões por CANAL
//
//  No Stoat, a permissão do CANAL tem prioridade sobre a do cargo:
//  o bot pode ter SendMessage no servidor inteiro e ainda assim estar
//  mudo num canal específico. Sem enxergar isso canal a canal, o
//  sintoma vira "o bot ignorou meu comando ali" sem explicação.
//
//  Aqui a gente lê as permissões efetivas de cada canal e mostra o
//  que o bot realmente consegue fazer em cada um.
// ══════════════════════════════════════════════════════════

// Bits de permissão do Stoat/Revolt (os que importam para o bot).
export const BITS = {
  ManageChannel:      1 << 0,
  ManageServer:       1 << 1,
  ManagePermissions:  1 << 2,
  ManageRole:         1 << 3,
  ManageCustomisation:1 << 4,
  KickMembers:        1 << 6,
  BanMembers:         1 << 7,
  TimeoutMembers:     1 << 8,
  AssignRoles:        1 << 9,
  ChangeNickname:     1 << 10,
  ManageNicknames:    1 << 11,
  ChangeAvatar:       1 << 12,
  RemoveAvatars:      1 << 13,
  ViewChannel:        1 << 20,
  ReadMessageHistory: 1 << 21,
  SendMessage:        1 << 22,
  ManageMessages:     1 << 23,
  ManageWebhooks:     1 << 24,
  InviteOthers:       1 << 25,
  SendEmbeds:         1 << 26,
  UploadFiles:        1 << 27,
  Masquerade:         1 << 28,
  React:              1 << 29,
  Connect:            1 << 30,
};

// O que cada permissão destrava, em português — para o relatório.
const PARA_QUE = {
  ViewChannel: "ver o canal",
  ReadMessageHistory: "ler as mensagens",
  SendMessage: "responder",
  SendEmbeds: "enviar os cartões de resposta",
  React: "reagir (cargos por reação, 👀)",
  ManageMessages: "apagar mensagens (automod, &limpar, &modia)",
  ManageChannel: "editar o canal",
};
const PARA_QUE_EN = {
  ViewChannel: "see the channel",
  ReadMessageHistory: "read the messages",
  SendMessage: "reply",
  SendEmbeds: "send the reply cards",
  React: "react (reaction roles, 👀)",
  ManageMessages: "delete messages (automod, &limpar, &modia)",
  ManageChannel: "edit the channel",
};

// Permissões que o bot precisa em QUALQUER canal onde deva atuar.
const ESSENCIAIS = ["ViewChannel", "ReadMessageHistory", "SendMessage", "SendEmbeds"];
// Úteis, mas cuja falta só limita alguns recursos.
const DESEJAVEIS = ["React", "ManageMessages"];

const temBit = (valor, bit) => typeof valor === "number" && (valor & bit) === bit;

// ── Cálculo de permissões ─────────────────────────────────
//
//  Não dá para depender de um helper da lib (os nomes variam entre versões
//  e podem simplesmente não existir). Então calculamos como o próprio
//  Revolt/Stoat define, a partir dos dados brutos:
//
//    1. permissões padrão do SERVIDOR
//    2. cargos do membro, aplicados do rank mais baixo para o mais alto
//       (rank menor = mais importante, aplicado por último e vence)
//    3. permissões padrão do CANAL
//    4. sobrescritas de cargo NO CANAL, na mesma ordem de rank
//
//  Cada etapa aplica "allow" (a) e "deny" (d) sobre o acumulado.
//  Se o servidor der Administrator, tudo é liberado.

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);

// Extrai {a, d} de formatos possíveis (objeto {a,d}, {allow,deny} ou número puro)
function paraAD(p) {
  if (p == null) return { a: 0, d: 0 };
  if (typeof p === "number") return { a: p, d: 0 };
  return { a: num(p.a ?? p.allow), d: num(p.d ?? p.deny) };
}

const aplicar = (base, { a, d }) => (base & ~d) | a;

// Cargos do membro ordenados: rank MAIOR primeiro (menos importante),
// para que o rank menor (mais importante) seja aplicado por último.
function cargosOrdenados(server, member) {
  const roles = server?.roles;
  const pegar = (id) => (typeof roles?.get === "function" ? roles.get(id) : roles?.[id]);
  const ids = (member?.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
  return ids
    .map((id) => ({ id, role: pegar(id) }))
    .filter((x) => x.role)
    .sort((x, y) => (y.role.rank ?? 0) - (x.role.rank ?? 0));
}

// Permissões efetivas do membro NO CANAL. Devolve { valor, via } ou
// { valor: null, motivo } quando faltam dados para calcular.
export function calcularPermissoes(server, canal, member) {
  if (!server) return { valor: null, motivo: "servidor indisponível" };
  // Sem o membro não dá para saber os cargos — melhor admitir do que calcular
  // zero e reportar "não enxergo nada", que seria um alarme falso.
  if (!member) return { valor: null, motivo: "membro do bot indisponível" };
  if (server.owner && member && (server.owner === (member.id?.user ?? member.user?.id ?? member.id))) {
    return { valor: 0x7FFFFFFF, via: "dono do servidor" };
  }

  const padraoServidor = paraAD(server.default_permissions ?? server.defaultPermissions ?? 0);
  let perm = padraoServidor.a || num(server.default_permissions ?? server.defaultPermissions);

  const cargos = cargosOrdenados(server, member);
  for (const { role } of cargos) perm = aplicar(perm, paraAD(role.permissions));

  // Administrator libera tudo (bit 0 do conjunto de servidor no Revolt)
  if (temBit(perm, BITS.ManageServer) && temBit(perm, BITS.ManagePermissions) && temBit(perm, BITS.ManageRole)) {
    // não é exatamente "admin", mas com essas três o bot passa em tudo que checamos
  }

  if (canal) {
    const padraoCanal = canal.default_permissions ?? canal.defaultPermissions;
    if (padraoCanal != null) perm = aplicar(perm, paraAD(padraoCanal));

    const sobre = canal.role_permissions ?? canal.rolePermissions;
    if (sobre) {
      for (const { id } of cargos) {
        const ov = sobre[id];
        if (ov != null) perm = aplicar(perm, paraAD(ov));
      }
    }
  }

  return { valor: perm, via: "cálculo" };
}

// Fachada: tenta o helper da lib e, se não houver, calcula.
export function permissoesDoBotNoCanal(canal, client, server, botMember) {
  for (const [via, fn] of [
    ["lib.permission", () => canal?.permission],
    ["lib.permissionsFor", () => canal?.permissionsFor?.(client?.user)],
  ]) {
    try { const v = fn(); if (typeof v === "number" && v > 0) return { valor: v, via }; } catch {}
  }
  return calcularPermissoes(server, canal, botMember);
}

// Checa uma permissão específica.
export function podeNoCanal(canal, client, nome, server, botMember) {
  const { valor } = permissoesDoBotNoCanal(canal, client, server, botMember);
  if (valor != null && BITS[nome] != null) return temBit(valor, BITS[nome]);
  try {
    if (typeof canal?.havePermission === "function") return !!canal.havePermission(nome);
  } catch {}
  return null;
}

const nomeCanal = (c) => c?.name ?? c?.id ?? "?";
const ehTexto = (c) => (c?.type ?? "").includes("Text") || c?.type === "TextChannel";

// ── 1 e 2: o que o bot enxerga e o que consegue fazer em cada canal ──
export function diagnosticarCanais(server, client, botMember = null, lang = "pt") {
  const en = lang === "en";
  const ROTULO = en ? PARA_QUE_EN : PARA_QUE;
  const canais = (server?.channels ?? []).filter(Boolean);
  const grupos = { ok: [], parcial: [], mudo: [], cego: [], desconhecido: [] };
  const problemas = [];
  let amostra = null;   // um canal cru, para diagnóstico quando nada é lido

  for (const c of canais) {
    const canal = typeof c === "string" ? (client?.channels?.get?.(c) ?? null) : c;
    if (!canal) { grupos.desconhecido.push(String(c).slice(0, 20)); continue; }
    if (!ehTexto(canal) && canal.type !== "VoiceChannel") continue;

    const { valor } = permissoesDoBotNoCanal(canal, client, server, botMember);
    if (valor == null) {
      if (!amostra) amostra = canal;
      grupos.desconhecido.push(nomeCanal(canal));
      continue;
    }

    if (!temBit(valor, BITS.ViewChannel)) { grupos.cego.push(nomeCanal(canal)); continue; }

    const falta = ESSENCIAIS.filter((p) => !temBit(valor, BITS[p]));
    const faltaExtra = DESEJAVEIS.filter((p) => !temBit(valor, BITS[p]));
    if (falta.length) {
      grupos.mudo.push(`${nomeCanal(canal)} _(${en ? "no" : "sem"} ${falta.join(", ")})_`);
      problemas.push(`**${nomeCanal(canal)}**: ${en ? "can't" : "sem"} ${falta.map((f) => ROTULO[f] ?? f).join(", ")}`);
    } else if (faltaExtra.length) {
      grupos.parcial.push(`${nomeCanal(canal)} _(${en ? "no" : "sem"} ${faltaExtra.join(", ")})_`);
    } else {
      grupos.ok.push(nomeCanal(canal));
    }
  }

  return {
    grupos, problemas, amostra,
    vistos: grupos.ok.length + grupos.parcial.length + grupos.mudo.length,
    mudos: grupos.mudo.length,
    cegos: grupos.cego.length,
    desconhecidos: grupos.desconhecido.length,
    total: canais.length,
  };
}

// Monta o texto do relatório agrupado — canais OK viram uma linha só, e o
// detalhe fica para o que tem problema. Assim cabe no embed mesmo com 30+ canais.
export function formatarRelatorio(r, PREFIXO = "&", lang = "pt") {
  const en = lang === "en";
  const linhas = [];
  const lista = (arr, max = 12) =>
    arr.slice(0, max).join(", ") + (arr.length > max ? ` _… +${arr.length - max}_` : "");

  linhas.push(
    en
      ? `**${r.vistos}** visible`
        + (r.cegos ? ` · **${r.cegos}** invisible` : "")
        + (r.mudos ? ` · **${r.mudos}** missing something` : "")
        + (r.desconhecidos ? ` · **${r.desconhecidos}** not evaluated` : "")
      : `**${r.vistos}** visível(is)`
        + (r.cegos ? ` · **${r.cegos}** invisível(is)` : "")
        + (r.mudos ? ` · **${r.mudos}** com falta` : "")
        + (r.desconhecidos ? ` · **${r.desconhecidos}** não avaliado(s)` : ""),
    "",
  );
  if (r.grupos.mudo.length)   linhas.push(`⚠️ **${en ? "Missing the essentials" : "Falta o essencial"}:**\n${r.grupos.mudo.join("\n")}`, "");
  if (r.grupos.cego.length)   linhas.push(`🚫 **${en ? "I can't see" : "Não enxergo"}:** ${lista(r.grupos.cego)}`, "");
  if (r.grupos.parcial.length) linhas.push(`🟡 **${en ? "Ok, but incomplete" : "Ok, mas incompleto"}:** ${lista(r.grupos.parcial)}`, "");
  if (r.grupos.ok.length)     linhas.push(`✅ **${en ? "All good" : "Tudo certo"} (${r.grupos.ok.length}):** ${lista(r.grupos.ok, 20)}`, "");
  if (r.grupos.desconhecido.length) {
    linhas.push(`❔ **${en ? "Couldn't evaluate" : "Não consegui avaliar"} (${r.grupos.desconhecido.length}):** ${lista(r.grupos.desconhecido)}`);
    linhas.push(en
      ? `_Run \`${PREFIXO}debug canais cru\` and I'll show what the API returns._`
      : `_Rode \`${PREFIXO}debug canais cru\` para eu mostrar o que a API me devolve._`, "");
  }
  if (r.problemas.length) {
    linhas.push(en ? "**Where I'll fail:**" : "**Onde eu vou falhar:**");
    for (const p of r.problemas.slice(0, 6)) linhas.push(`• ${p}`);
  } else if (r.vistos) {
    linhas.push(en
      ? "✅ I have what I need in every channel I can see."
      : "✅ Tenho o necessário em todos os canais que enxergo.");
  }
  return linhas.join("\n");
}

// Diagnóstico do formato: mostra o que a API realmente devolve num canal.
// É o que permite descobrir onde estão as permissões quando o cálculo falha.
export function inspecionarCanal(canal) {
  if (!canal) return "canal indisponível";
  const chaves = Object.keys(canal).filter((k) => typeof canal[k] !== "function");
  const alvo = {};
  for (const k of ["permission", "permissions", "default_permissions", "defaultPermissions",
                   "role_permissions", "rolePermissions", "type", "name"]) {
    if (canal[k] !== undefined) {
      const v = canal[k];
      alvo[k] = typeof v === "object" ? JSON.stringify(v).slice(0, 100) : String(v);
    }
  }
  return { chaves: chaves.slice(0, 25), relevantes: alvo };
}

// ── 4: um cargo acima do silêncio pode anular o silenciamento? ──
//
//  No Stoat as permissões dos cargos são combinadas por RANK. Se a pessoa
//  tem um cargo melhor colocado que o "Silenciado" e esse cargo LIBERA
//  SendMessage explicitamente, o silêncio não faz efeito — ela continua
//  falando. Este teste avisa antes de você descobrir na prática.
export function conflitosDeSilencio(server, member, silenceRoleId) {
  if (!silenceRoleId) return { erro: "não há cargo de silêncio configurado" };
  // O DONO do servidor ignora qualquer permissão — silenciá-lo nunca funciona.
  const uid = member?.id?.user ?? member?.user?.id ?? member?.id;
  const dono = server?.owner ?? server?.ownerId ?? server?.owner_id;
  const donoId = typeof dono === "object" ? (dono?.id ?? dono?._id) : dono;
  if (donoId && uid && String(donoId) === String(uid)) {
    return { dono: true, conflitantes: [], aviso: "essa pessoa é a **dona do servidor** — nenhuma permissão a limita, o silêncio nunca vai funcionar com ela" };
  }
  const roles = server?.roles;
  if (!roles) return { erro: "não consegui ler os cargos do servidor" };

  const pegar = (id) => (typeof roles.get === "function" ? roles.get(id) : roles[id]);
  const silence = pegar(silenceRoleId);
  if (!silence) return { erro: "o cargo de silêncio configurado não existe mais" };

  // rank menor = mais alto na hierarquia (padrão do Revolt/Stoat)
  const rankSilence = silence.rank ?? 0;
  const doMembro = (member?.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);

  const conflitantes = [];
  for (const id of doMembro) {
    if (id === silenceRoleId) continue;
    const role = pegar(id);
    if (!role) continue;
    const rank = role.rank ?? 0;
    const acima = rank < rankSilence;
    const permite = temBit(role.permissions?.a ?? role.permissions?.allow ?? role.permissions, BITS.SendMessage);
    if (acima && permite) {
      conflitantes.push({ id, nome: role.name ?? id, rank });
    }
  }
  return { rankSilence, conflitantes, temSilence: doMembro.includes(silenceRoleId) };
}
