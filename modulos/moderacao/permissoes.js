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

// Permissões que o bot precisa em QUALQUER canal onde deva atuar.
const ESSENCIAIS = ["ViewChannel", "ReadMessageHistory", "SendMessage", "SendEmbeds"];
// Úteis, mas cuja falta só limita alguns recursos.
const DESEJAVEIS = ["React", "ManageMessages"];

const temBit = (valor, bit) => typeof valor === "number" && (valor & bit) === bit;

// Tenta descobrir as permissões do BOT num canal, testando os caminhos que a
// lib pode expor. Devolve { valor, via } ou { valor: null } se não der.
export function permissoesDoBotNoCanal(canal, client) {
  const tentativas = [
    ["permission", () => canal?.permission],
    ["permissionsFor", () => canal?.permissionsFor?.(client?.user)],
    ["havePermission", () => null],   // só booleano; tratado abaixo
  ];
  for (const [via, fn] of tentativas) {
    try {
      const v = fn();
      if (typeof v === "number") return { valor: v, via };
    } catch {}
  }
  return { valor: null, via: null };
}

// Checa uma permissão específica, usando o bitfield ou o helper da lib.
export function podeNoCanal(canal, client, nome) {
  const { valor } = permissoesDoBotNoCanal(canal, client);
  if (valor != null && BITS[nome] != null) return temBit(valor, BITS[nome]);
  try {
    if (typeof canal?.havePermission === "function") return !!canal.havePermission(nome);
  } catch {}
  return null;   // desconhecido
}

const nomeCanal = (c) => c?.name ?? c?.id ?? "?";
const ehTexto = (c) => (c?.type ?? "").includes("Text") || c?.type === "TextChannel";

// ── 1 e 2: o que o bot enxerga e o que consegue fazer em cada canal ──
export function diagnosticarCanais(server, client) {
  const canais = (server?.channels ?? []).filter(Boolean);
  const linhas = [], problemas = [];
  let vistos = 0, mudos = 0, cegos = 0, desconhecidos = 0;

  for (const c of canais) {
    const canal = typeof c === "string"
      ? (client?.channels?.get?.(c) ?? null)
      : c;
    if (!canal) { desconhecidos++; continue; }
    if (!ehTexto(canal) && canal.type !== "VoiceChannel") continue;

    const { valor } = permissoesDoBotNoCanal(canal, client);
    if (valor == null) {
      desconhecidos++;
      linhas.push(`❔ **${nomeCanal(canal)}** — não consegui ler as permissões`);
      continue;
    }

    const falta = ESSENCIAIS.filter((p) => !temBit(valor, BITS[p]));
    const faltaExtra = DESEJAVEIS.filter((p) => !temBit(valor, BITS[p]));
    const veo = temBit(valor, BITS.ViewChannel);
    if (!veo) { cegos++; linhas.push(`🚫 **${nomeCanal(canal)}** — não enxergo este canal`); continue; }
    vistos++;

    if (falta.length) {
      mudos++;
      linhas.push(`⚠️ **${nomeCanal(canal)}** — falta: ${falta.map((f) => `\`${f}\``).join(", ")}`);
      problemas.push(`**${nomeCanal(canal)}**: sem ${falta.map((f) => PARA_QUE[f] ?? f).join(", ")}`);
    } else if (faltaExtra.length) {
      linhas.push(`🟡 **${nomeCanal(canal)}** — ok, mas sem ${faltaExtra.map((f) => `\`${f}\``).join(", ")}`);
    } else {
      linhas.push(`✅ **${nomeCanal(canal)}**`);
    }
  }

  return { linhas, problemas, vistos, mudos, cegos, desconhecidos, total: canais.length };
}

// ── 4: um cargo acima do silêncio pode anular o silenciamento? ──
//
//  No Stoat as permissões dos cargos são combinadas por RANK. Se a pessoa
//  tem um cargo melhor colocado que o "Silenciado" e esse cargo LIBERA
//  SendMessage explicitamente, o silêncio não faz efeito — ela continua
//  falando. Este teste avisa antes de você descobrir na prática.
export function conflitosDeSilencio(server, member, silenceRoleId) {
  if (!silenceRoleId) return { erro: "não há cargo de silêncio configurado" };
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
