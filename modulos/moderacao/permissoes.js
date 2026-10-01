
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

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);

// Extrai {a, d} de formatos possíveis (objeto {a,d}, {allow,deny} ou número puro)
function paraAD(p) {
  if (p == null) return { a: 0, d: 0 };
  if (typeof p === "number") return { a: p, d: 0 };
  return { a: num(p.a ?? p.allow), d: num(p.d ?? p.deny) };
}

const aplicar = (base, { a, d }) => (base & ~d) | a;

function cargosOrdenados(server, member) {
  const roles = server?.roles;
  const pegar = (id) => (typeof roles?.get === "function" ? roles.get(id) : roles?.[id]);
  const ids = (member?.roles ?? []).map((r) => r?.id ?? r).filter(Boolean);
  return ids
    .map((id) => ({ id, role: pegar(id) }))
    .filter((x) => x.role)
    .sort((x, y) => (y.role.rank ?? 0) - (x.role.rank ?? 0));
}

export function calcularPermissoes(server, canal, member) {
  if (!server) return { valor: null, motivo: "servidor indisponível" };
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

export function rastrearPermissoes(server, canal, member, client = null) {
  const L = [];
  const bits = (v) => (typeof v === "number"
    ? ESSENCIAIS.map((n) => `${temBit(v, BITS[n]) ? "✅" : "❌"}${n}`).join(" ") + ` (raw=${v})`
    : String(v));

  // o que a LIB acha (é o que a fachada usa primeiro, quando > 0)
  let libPerm = null; try { libPerm = canal?.permission; } catch (e) { libPerm = `erro: ${e?.message}`; }
  L.push(`lib.permission: ${typeof libPerm === "number" ? bits(libPerm) : (libPerm ?? "ausente")}`);

  if (!server) { L.push("server: AUSENTE"); return L; }
  if (!member) { L.push("membro do bot: AUSENTE — sem cargos, sem conta"); return L; }

  const idsBrutos = member?.roles ?? [];
  const cargos = cargosOrdenados(server, member);
  L.push(`cargos do bot: ${idsBrutos.length} no membro, ${cargos.length} resolvidos no servidor` +
         (idsBrutos.length !== cargos.length ? " ⚠️ (diferença = cargo não hidratado)" : ""));

  const padraoSrv = server.default_permissions ?? server.defaultPermissions;
  let perm = paraAD(padraoSrv).a || num(padraoSrv);
  L.push(`servidor padrão: ${bits(perm)}`);

  for (const { id, role } of cargos) {
    const ad = paraAD(role.permissions);
    perm = aplicar(perm, ad);
    L.push(`cargo "${role.name ?? id}" (rank ${role.rank ?? "?"}) a=${ad.a} d=${ad.d} → ${bits(perm)}`);
  }

  if (canal) {
    const padraoCanal = canal.default_permissions ?? canal.defaultPermissions;
    if (padraoCanal != null) {
      const ad = paraAD(padraoCanal);
      perm = aplicar(perm, ad);
      L.push(`canal padrão: a=${ad.a} d=${ad.d} → ${bits(perm)}`);
    } else L.push("canal padrão: (sem sobrescrita)");

    const sobre = canal.role_permissions ?? canal.rolePermissions;
    const chaves = sobre ? Object.keys(sobre) : [];
    L.push(`sobrescritas de cargo no canal: ${chaves.length}` +
           (chaves.length ? ` (cargos: ${chaves.map((k) => server?.roles?.get?.(k)?.name ?? (server?.roles?.[k]?.name) ?? k).join(", ")})` : ""));
    if (sobre) for (const { id, role } of cargos) {
      const ov = sobre[id];
      if (ov != null) {
        const ad = paraAD(ov);
        perm = aplicar(perm, ad);
        L.push(`  ↳ aplica a do bot "${role.name ?? id}": a=${ad.a} d=${ad.d} → ${bits(perm)}`);
      }
    }
  }
  L.push(`FINAL (cálculo próprio): ${bits(perm)}`);
  const fachada = permissoesDoBotNoCanal(canal, client, server, member);
  L.push(`o relatório usa: via=${fachada.via ?? fachada.motivo} → ${bits(fachada.valor)}`);
  return L;
}

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

