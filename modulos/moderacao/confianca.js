import * as db from "../core/db.js";

// Ajustes mais suaves desde 12 out 2026 (pedido de Ghieh: o sentinela punia
// gente comum — "cool"/"YO" de um membro deu timeout num servidor sem XP).
export const FAIXAS = [
  { ate: 0,  ajuste: -0.75, id: "novato",     rotulo: "recém-chegado", rotuloEN: "newcomer" },
  { ate: 2,  ajuste: -0.5,  id: "conhecido",  rotulo: "conhecido",     rotuloEN: "getting known" },
  { ate: 5,  ajuste: -0.25, id: "frequente",  rotulo: "frequente",     rotuloEN: "regular" },
  { ate: 10, ajuste: 0,     id: "estabelecido", rotulo: "estabelecido", rotuloEN: "established" },
  { ate: Infinity, ajuste: +0.5, id: "veterano", rotulo: "veterano",  rotuloEN: "veteran" },
];

// Sem XP no servidor, o nível é 0 para TODO MUNDO, para sempre — e todos eram
// tratados como recém-chegados (o limiar mais baixo). A confiança passa a vir
// do TEMPO no servidor; sem saber quando a pessoa entrou, fica neutra.
const DIA = 86_400_000;
export function faixaPorTempo(entrouEm, agora = Date.now()) {
  const t = entrouEm ? Date.parse(entrouEm) || Number(entrouEm) : NaN;
  if (!Number.isFinite(t)) return { ...FAIXAS[3], porTempo: true };          // desconhecido: neutro
  const dias = (agora - t) / DIA;
  if (dias < 1)  return { ...FAIXAS[0], porTempo: true };
  if (dias < 7)  return { ...FAIXAS[2], porTempo: true };
  if (dias < 30) return { ...FAIXAS[3], porTempo: true };
  return { ...FAIXAS[4], porTempo: true };
}

export function nivelDe(serverId, userId) {
  try { return db.getXp(serverId, userId)?.nivel ?? 0; } catch { return 0; }
}

export function faixaDe(nivel) {
  return FAIXAS.find((f) => nivel <= f.ate) ?? FAIXAS[FAIXAS.length - 1];
}

// ─── Anti-raid: três peças que se somam ─────────────────────────────────────
//
// Não é um "modo anti-raid" para ligar. É o que o raid de 27/09 mostrou que
// faltava, espalhado nas peças que já decidem o rigor:
//   1. IDADE DA CONTA — o ID (ULID) carrega a data de criação. No raid, 7
//      contas foram criadas 2 a 7 min antes de entrar, uma a cada ban.
//   2. ONDA — várias contas novas entrando no mesmo servidor em pouco tempo
//      liga a proteção por 30 min e avisa a staff uma vez.
//   3. QUARENTENA — quando a punição FALHA (no raid, faltava AssignRoles e o
//      autor seguiu postando suásticas), tudo que a pessoa mandar é apagado.

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function criacaoDaConta(userId) {
  const id = String(userId ?? "").toUpperCase();
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return null;
  let ms = 0;
  for (const c of id.slice(0, 10)) ms = ms * 32 + B32.indexOf(c);
  return ms;
}
export function idadeDaConta(userId, agora = Date.now()) {
  const c = criacaoDaConta(userId);
  return c == null ? null : Math.max(0, agora - c);
}

const HORA = 3600_000;
function ajusteIdade(idade) {
  if (idade == null) return 0;
  if (idade < HORA) return -2.5;        // criada agora: rigor máximo (as contas do raid tinham 2–7 min)
  if (idade < 24 * HORA) return -1;     // criada hoje
  return 0;
}

const RAID_JANELA_MS = Number(process.env.RAID_JANELA_MS || 15 * 60_000);
const RAID_MIN_CONTAS = Number(process.env.RAID_MIN_CONTAS || 3);
const RAID_DURACAO_MS = Number(process.env.RAID_DURACAO_MS || 30 * 60_000);
const entradas = new Map();   // serverId → [{ userId, t }] (só contas com < 24h)
const raidAte = new Map();    // serverId → até quando a proteção vale

export function registrarEntrada(serverId, userId, agora = Date.now()) {
  const idade = idadeDaConta(userId, agora);
  if (idade == null || idade >= 24 * HORA) return { raid: emModoRaid(serverId, agora), iniciou: false };
  const lista = (entradas.get(serverId) ?? []).filter((e) => agora - e.t < RAID_JANELA_MS);
  if (!lista.some((e) => e.userId === userId)) lista.push({ userId, t: agora });
  entradas.set(serverId, lista);
  const jaEstava = emModoRaid(serverId, agora);
  if (lista.length >= RAID_MIN_CONTAS) raidAte.set(serverId, agora + RAID_DURACAO_MS);
  return {
    raid: emModoRaid(serverId, agora),
    iniciou: !jaEstava && emModoRaid(serverId, agora),
    contas: lista.map((e) => e.userId),
    minutos: Math.round(RAID_DURACAO_MS / 60_000),
  };
}
export function emModoRaid(serverId, agora = Date.now()) {
  return (raidAte.get(serverId) ?? 0) > agora;
}

const QUARENTENA_MS = Number(process.env.QUARENTENA_MS || 30 * 60_000);
const quarentena = new Map();   // "server:user" → até quando
export function quarentenar(serverId, userId, agora = Date.now()) {
  quarentena.set(`${serverId}:${userId}`, agora + QUARENTENA_MS);
}
// A staff liberou a pessoa (&automod sentinela dismiss, &warn limpar,
// &silenciar tirar): a quarentena acaba junto (15 out 2026 — antes ela
// continuava apagando tudo por até 30 min, mesmo com o automod desligado).
export function liberarQuarentena(serverId, userId) {
  return quarentena.delete(`${serverId}:${userId}`);
}
export function emQuarentena(serverId, userId, agora = Date.now()) {
  const ate = quarentena.get(`${serverId}:${userId}`) ?? 0;
  if (ate <= agora) { quarentena.delete(`${serverId}:${userId}`); return false; }
  return true;
}

// Conta nova = criada há menos de 24h, ou qualquer conta de < 7 dias durante
// uma onda. É ela que recebe o rigor extra no anti-duplicata.
export function contaNova(serverId, userId, agora = Date.now()) {
  const idade = idadeDaConta(userId, agora);
  if (idade == null) return false;
  return idade < 24 * HORA || (emModoRaid(serverId, agora) && idade < 7 * 24 * HORA);
}

// `xpAtivo: false` = o servidor não usa XP → a faixa vem do tempo no servidor
// (`entrouEm`, o joinedAt do membro), não do nível.
export function limiarPara(serverId, userId, base, { ativo = true, agora = Date.now(), xpAtivo = true, entrouEm = null } = {}) {
  if (!ativo) return { limiar: base, faixa: null, nivel: null };
  const nivel = xpAtivo ? nivelDe(serverId, userId) : null;
  const faixa = xpAtivo ? faixaDe(nivel) : faixaPorTempo(entrouEm, agora);
  const idade = idadeDaConta(userId, agora);
  let ajuste = faixa.ajuste + ajusteIdade(idade);
  if (emModoRaid(serverId, agora) && idade != null && idade < 7 * 24 * HORA) ajuste -= 1;
  const limiar = Math.max(3.5, Math.min(9, base + ajuste));
  return { limiar, faixa, nivel, idade };
}

const JANELA_MS = Number(process.env.SENTINELA_JANELA_MS || 10 * 60_000);
const MIN_SINAIS = Number(process.env.SENTINELA_MIN_SINAIS || 3);
const RECARGA_MS = Number(process.env.SENTINELA_RECARGA_MS || 30 * 60_000);

const historico = new Map();   // chave → { marcas: [ts], avisadoEm }

setInterval(() => {
  const agora = Date.now();
  for (const [k, h] of historico) {
    const ultimoSinal = h.marcas.length ? h.marcas[h.marcas.length - 1] : 0;
    if (agora - ultimoSinal > JANELA_MS && agora - h.avisadoEm > RECARGA_MS) {
      historico.delete(k);
    }
  }
}, 30 * 60_000).unref?.();

const chave = (s, u) => `${s}:${u}`;

// Registra um sinal e diz se é hora de chamar a administração.
export function registrarSinal(serverId, userId, { nota, sinais = [] } = {}) {
  const k = chave(serverId, userId);
  const agora = Date.now();
  const h = historico.get(k) ?? { marcas: [], avisadoEm: 0, sinais: new Set() };
  h.marcas = h.marcas.filter((t) => agora - t < JANELA_MS);
  h.marcas.push(agora);
  for (const x of sinais) h.sinais.add(x);
  historico.set(k, h);

  if (agora - h.avisadoEm < RECARGA_MS) return { alertar: false, vezes: h.marcas.length };
  if (h.marcas.length < MIN_SINAIS) return { alertar: false, vezes: h.marcas.length };

  h.avisadoEm = agora;
  const lista = [...h.sinais];
  h.sinais = new Set();
  return { alertar: true, vezes: h.marcas.length, janelaMin: Math.round(JANELA_MS / 60000), sinais: lista, nota };
}

export function esquecerSinais(serverId, userId) {
  historico.delete(chave(serverId, userId));
  padraoDano.delete(chave(serverId, userId));
}

// ─── Padrão de dano a pessoas, somado ao longo das horas ────────────────────
//
// Quem recruta para comunidades de "desafio" e humilhação raramente escreve
// uma frase que condene sozinha. O caso real que motivou isto: em ~7 horas a
// mesma pessoa divulgou outra comunidade, falou de gente se cortando, de
// gostar de ver alguém "passando vergonha", de desafios "no extremo" e de
// mandar alguém "comer merda". Cada mensagem tirou 0 a 2,5 no sentinela —
// nenhuma chegava perto de alertar. A conversa inteira, sim.
//
// Aqui cada pessoa acumula o peso dos sinais de dano (PESO_DANO no
// scorecard). O alerta exige TRÊS coisas ao mesmo tempo, para não virar ruído
// nem acusar quem está mal:
//   • soma acima do limiar;
//   • sinais de pelo menos DUAS categorias diferentes;
//   • pelo menos um sinal do lado de quem AGRIDE — falar só de se machucar
//     nunca dispara isto: essa pessoa precisa de ajuda, não de suspeita.
//
// Nunca pune. Só chama a staff, com as mensagens que motivaram o alerta.

const DANO_JANELA_MS = Number(process.env.SENTINELA_DANO_JANELA_MS || 12 * 3600_000);
const DANO_LIMIAR = Number(process.env.SENTINELA_DANO_LIMIAR || 4);
const DANO_RECARGA_MS = Number(process.env.SENTINELA_DANO_RECARGA_MS || 6 * 3600_000);
const padraoDano = new Map();   // chave → { eventos: [{ t, soma, categorias, agressor, trecho }], avisadoEm }

setInterval(() => {
  const agora = Date.now();
  for (const [k, p] of padraoDano) {
    p.eventos = p.eventos.filter((e) => agora - e.t < DANO_JANELA_MS);
    if (!p.eventos.length && agora - p.avisadoEm > DANO_RECARGA_MS) padraoDano.delete(k);
  }
}, 30 * 60_000).unref?.();

export function registrarDano(serverId, userId, dano, texto = "", agora = Date.now()) {
  if (!dano || !(dano.soma > 0)) return { alertar: false };
  const k = chave(serverId, userId);
  const p = padraoDano.get(k) ?? { eventos: [], avisadoEm: 0 };
  p.eventos = p.eventos.filter((e) => agora - e.t < DANO_JANELA_MS);
  p.eventos.push({
    t: agora, soma: dano.soma, categorias: dano.categorias, agressor: dano.agressor,
    trecho: String(texto).replace(/\s+/g, " ").slice(0, 140),
  });
  padraoDano.set(k, p);

  const soma = p.eventos.reduce((a, e) => a + e.soma, 0);
  const categorias = new Set(p.eventos.flatMap((e) => e.categorias));
  const agressor = p.eventos.some((e) => e.agressor);

  const pronto = soma >= DANO_LIMIAR && categorias.size >= 2 && agressor;
  if (!pronto || agora - p.avisadoEm < DANO_RECARGA_MS) {
    return { alertar: false, soma, categorias: [...categorias] };
  }
  p.avisadoEm = agora;
  return {
    alertar: true, soma, categorias: [...categorias],
    mensagens: p.eventos.length,
    horas: Math.max(1, Math.round((agora - p.eventos[0].t) / 3600_000)),
    trechos: p.eventos.slice(-6).map((e) => e.trecho),
  };
}

