// Quanto tempo a Judy guarda o quê (privacidade P2, 20 out 2026).
//
// As respostas do Trust & Safety do Stoat (10 out 2026): dado pessoal até 30 dias
// salvo motivo explícito (ex.: um caso de moderação); dado operacional enquanto
// for relevante — no máximo até o bot sair do servidor. Daqui saem:
//   • o `&privacidade apagar`: tudo o que é da pessoa, menos os registros de
//     moderação (avisos, punições, a lista de bans), que o servidor precisa;
//   • a limpeza de um servidor 30 dias depois de a Judy sair dele (voltando
//     antes, nada é apagado).

import * as db from "./db.js";
import { pseudonimo } from "./pseudonimo.js";
import { dirname } from "node:path";
import { limparOrfaos } from "./temporarios.js";

const d = () => db.getDb();
const existe = (tabela) => !!d().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabela);
const colunas = (tabela) => d().prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
const contar = (sql, ...p) => d().prepare(sql).get(...p)?.n ?? 0;

// ── A pessoa ──
// Cada grupo: rótulo (pt/en/es) e o que apaga.
const DA_PESSOA = [
  { id: "xp", rotulo: { pt: "XP e nível", en: "XP and level", es: "XP y nivel" }, partes: [["xp_usuarios", "userId = ?"]] },
  { id: "economia", rotulo: { pt: "saldo da economia", en: "economy balance", es: "saldo de la economía" }, partes: [["eco_saldos", "userId = ?"]] },
];
// (3 nov 2026, P5) + a segunda análise (os mesmos casos da fila do dono)
const REVISAO_ROTULO = {
  pt: "casos na amostra e na segunda análise do dono do bot (o caso fica, sem você)",
  en: "cases in the bot owner's sample and second review (the case stays, without you)",
  es: "casos en la muestra y el segundo análisis del dueño del bot (el caso queda, sin ti)",
};
const STAFF_ROTULO = {
  pt: "alertas de caso duvidoso esperando a staff (saem)",
  en: "doubtful-case alerts waiting for the staff (removed)",
  es: "alertas de caso dudoso esperando al staff (se quitan)",
};
// O que fica, e por quê (o &privacidade apagar diz à pessoa)
export const FICA_DA_PESSOA = {
  pt: "avisos, punições e a lista global de bans — são registros de moderação dos servidores",
  en: "warnings, punishments and the global ban list — they're the servers' moderation records",
  es: "advertencias, sanciones y la lista global de bans — son registros de moderación de los servidores",
};

// Quanto há de cada grupo (para a tela de confirmação) ou apaga (apagar: true)
export function dadosDaPessoa(userId, { apagar = false } = {}) {
  const u = String(userId);
  const r = [];
  for (const g of DA_PESSOA) {
    let n = 0;
    for (const [tabela, onde, vezes = 1] of g.partes) {
      if (!existe(tabela)) continue;
      const p = Array(vezes).fill(u);
      n += apagar ? (d().prepare(`DELETE FROM ${tabela} WHERE ${onde}`).run(...p).changes ?? 0)
        : contar(`SELECT COUNT(*) n FROM ${tabela} WHERE ${onde}`, ...p);
    }
    r.push({ id: g.id, rotulo: g.rotulo, n });
  }
  // (31 out 2026, P3a) os casos dela na fila de revisão do dono do bot: o caso fica (é o que
  // ensina a moderação), sem ela — sem conta, canal, mensagem, trecho nem link.
  if (existe("revisao_casos")) {
    const n = apagar ? db.filaEsquecerUsuario(u) : contar("SELECT COUNT(*) n FROM revisao_casos WHERE userId = ?", u);
    r.push({ id: "revisao", rotulo: REVISAO_ROTULO, n });
  }
  // (3 nov 2026, P5) a impressão de treino (o vetor) dos casos ligados a ela saiu junto (filaEsquecerUsuario): o
  // arquivo da bateria é regravado; e a última punição automática dela, lembrada para a segunda análise, é esquecida
  if (apagar) depoisDeApagar(u);
  // (31 out 2026, P3a, staff) os casos duvidosos dela que esperam a staff de um servidor saem
  // (o julgado já não tem a pessoa: só impressão, categoria, nota, veredito e servidor)
  // (3 nov 2026, P5 revisão) e o vetor dos julgados dela que ainda vivem (achados pelo pseudônimo)
  if (existe("staff_casos")) r.push({ id: "staff", rotulo: STAFF_ROTULO, n: db.staffDaPessoa(u, { apagar, pseudo: apagar ? pseudonimo(u) : null }) });
  return r;
}

// Os módulos de moderação carregam sob demanda (o core não depende deles)
export const _depoisDeApagar = { pronto: Promise.resolve() };
function depoisDeApagar(u) {
  _depoisDeApagar.pronto = Promise.all([import("../moderacao/segunda-analise.js"), import("../moderacao/casos-staff.js"), import("../moderacao/treino.js")])
    .then(([segunda, staff, treino]) => { segunda.esquecerPessoa(u); staff.esquecerPessoa(u); return treino.reescrever(); })
    .catch((e) => console.error("[PRIVACIDADE] depois de apagar:", e?.message));
}

// ── O servidor ──
export function marcarSaida(serverId, quando = new Date()) {
  if (!serverId) return;
  d().prepare("INSERT OR IGNORE INTO servidores_saida (serverId, saiuEm) VALUES (?, ?)").run(String(serverId), quando.toISOString());
}
export function desmarcarSaida(serverId) {
  if (!serverId) return 0;
  return d().prepare("DELETE FROM servidores_saida WHERE serverId = ?").run(String(serverId)).changes ?? 0;
}
export const saidaDe = (serverId) => d().prepare("SELECT saiuEm FROM servidores_saida WHERE serverId = ?").get(String(serverId))?.saiuEm ?? null;

// Tudo o que tem `serverId` (config, XP, tickets, ganchos, feeds, punições…),
// e o que ficou órfão disso (as notícias já vistas dos feeds apagados).
export function apagarDadosDoServidor(serverId) {
  const sid = String(serverId);
  if (!sid || sid.startsWith("__")) return 0;
  let n = 0;
  const tabelas = d().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((x) => x.name);
  for (const t of tabelas) {
    if (t === "servidores_saida" || !colunas(t).includes("serverId")) continue;
    n += d().prepare(`DELETE FROM ${t} WHERE serverId = ?`).run(sid).changes ?? 0;
  }
  if (existe("rss_vistos")) n += d().prepare("DELETE FROM rss_vistos WHERE feedId NOT IN (SELECT id FROM rss_feeds)").run().changes ?? 0;
  // a cópia que o &reset guarda (`__reset__:<id>`) também é config do servidor (revisão do P2)
  n += d().prepare("DELETE FROM config WHERE serverId = ?").run(`__reset__:${sid}`).changes ?? 0;
  desmarcarSaida(sid);
  return n;
}

export const DIAS_APOS_SAIDA = Number(process.env.DIAS_APOS_SAIDA || 30);

// O que vence sozinho, no mesmo ciclo da limpeza dos servidores (a cada 6 h e na subida).
// (revisão P2) as palavras tentadas como comando: 30 dias — antes só se limpavam quando
// alguém digitava outra palavra desconhecida, e num servidor quieto ficavam para sempre.
// (31 out 2026, P3a, revisão) o registro do silêncio do perfil vencido (28 dias, o teto do
// timeout do Stoat): antes só saía quando alguém o lia.
// (31 out 2026, P3a, staff) o caso duvidoso que esperou 14 dias sem reação da staff; e, dos julgados,
// o que passou dos 500 mais recentes daquele servidor e categoria.
// (3 nov 2026, P5) e o arquivo de treino da bateria (moderacao/treino.js), que só é regravado se algo mudou
// (vetor vencido, caso que saiu, servidor apagado) — e é criado (vazio) na primeira subida
// (3 nov 2026, P5, integração) e os temporários órfãos das escritas atômicas (core/temporarios.js) na pasta
// do banco, com mais de 10 min — de um processo que morreu no meio da escrita
export function limparVencidos(agora = Date.now()) {
  const banco = db.caminhoDoBanco();
  const temporarios = banco ? limparOrfaos(dirname(banco)) : 0;   // o relógio de verdade (não o `agora` dos testes): a idade é do disco
  const staff = db.staffReter(agora);
  db.filaReterVetores(agora);   // (3 nov 2026, P5 revisão) o vetor da fila do dono também sai aqui (7 dias), não só na rodada
  import("../moderacao/treino.js").then((m) => m.pedirReescrita()).catch((e) => console.error("[PRIVACIDADE] arquivo de treino:", e?.message));
  return { palavras: db.limparPalavrasVencidas(agora, { forcar: true }), perfilSilencio: db.perfilSilencioLimparVencidos(agora), casosStaff: staff.pendentes, casosStaffAntigos: staff.antigos, temporarios };
}

// No `ready`: o servidor que tem config mas a Judy não está nele saiu enquanto
// ela estava desligada; o que está na lista e ela está nele, voltou.
export function conferirSaidas(idsPresentes, agora = new Date()) {
  const presentes = new Set([...idsPresentes].map(String));
  const salvos = d().prepare("SELECT serverId FROM config WHERE serverId NOT LIKE '\\_\\_%' ESCAPE '\\'").all().map((x) => x.serverId);
  let saiu = 0, voltou = 0;
  for (const sid of salvos) if (!presentes.has(sid) && !saidaDe(sid)) { marcarSaida(sid, agora); saiu++; }
  for (const sid of presentes) voltou += desmarcarSaida(sid);
  return { saiu, voltou };
}

// Os que saíram há mais de DIAS_APOS_SAIDA dias: apaga. Devolve [{ serverId, linhas }].
// `presentes`: os servidores em que a Judy está AGORA. Um deles marcado como "saiu"
// (a lista da subida veio incompleta, um evento de saída falso) não é apagado — a
// marca sai. Sem isso, um servidor ativo perdia tudo 30 dias depois de uma subida ruim.
export function limparServidoresQueSairam(agora = Date.now(), dias = DIAS_APOS_SAIDA, presentes = null) {
  const limite = new Date(agora - dias * 86_400_000).toISOString();
  const aqui = presentes ? new Set([...presentes].map(String)) : null;
  const apagados = [];
  for (const { serverId } of d().prepare("SELECT serverId FROM servidores_saida WHERE saiuEm < ?").all(limite)) {
    if (aqui?.has(String(serverId))) { desmarcarSaida(serverId); continue; }
    apagados.push({ serverId, linhas: apagarDadosDoServidor(serverId) });
  }
  return apagados;
}
