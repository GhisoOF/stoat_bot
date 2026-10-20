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

const d = () => db.getDb();
const existe = (tabela) => !!d().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabela);
const colunas = (tabela) => d().prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
const contar = (sql, ...p) => d().prepare(sql).get(...p)?.n ?? 0;

// ── A pessoa ──
// Cada grupo: rótulo (pt/en/es) e o que apaga. A ordem importa no RPG (os itens
// dos companheiros antes dos companheiros).
const DA_PESSOA = [
  { id: "ia", rotulo: { pt: "memória da IA (fatos, perfil, conversa)", en: "AI memory (facts, profile, conversation)", es: "memoria de la IA (datos, perfil, conversación)" },
    partes: [["ia_fatos_pessoa", "userId = ?"], ["ia_perfil", "userId = ?"], ["ia_memoria", "userId = ?"], ["ia_historico", "userId = ?"]] },
  { id: "xp", rotulo: { pt: "XP e nível", en: "XP and level", es: "XP y nivel" }, partes: [["xp_usuarios", "userId = ?"]] },
  { id: "economia", rotulo: { pt: "saldo da economia", en: "economy balance", es: "saldo de la economía" }, partes: [["eco_saldos", "userId = ?"]] },
  { id: "rpg", rotulo: { pt: "personagem do RPG (itens, moedas, companheiros, ofertas)", en: "RPG character (items, coins, companions, offers)", es: "personaje del RPG (objetos, monedas, compañeros, ofertas)" },
    // Só o que é DELA. O companheiro que ela trocou (donoOriginal = ela, donoId = outro)
    // e a proposta que outro fez a ela (alvoId = ela — o item do autor está em custódia
    // nela) são do outro jogador: ver `desligarDaPessoa`. (20 out 2026, revisão do P2:
    // antes o apagar levava junto o companheiro e o item em custódia de outra pessoa.)
    partes: [
      ["rpg_follower_itens", "followerId IN (SELECT id FROM rpg_followers WHERE donoId = ?)"],
      ["rpg_followers", "donoId = ?"],
      ["rpg_ofertas", "autorId = ?"],
      ["rpg_personagem", "userId = ?"], ["rpg_inventario", "userId = ?"], ["rpg_equipado", "userId = ?"],
      ["rpg_carteira", "userId = ?"], ["rpg_magias", "userId = ?"], ["rpg_unicos", "userId = ?"],
      ["rpg_espera", "userId = ?"], ["rpg_dungeon_ativos", "userId = ?"],
    ] },
];
// O que fica, e por quê (o &privacidade apagar diz à pessoa)
export const FICA_DA_PESSOA = {
  pt: "avisos, punições e a lista global de bans — são registros de moderação dos servidores",
  en: "warnings, punishments and the global ban list — they're the servers' moderation records",
  es: "advertencias, sanciones y la lista global de bans — son registros de moderación de los servidores",
};

// O que cita a pessoa em registros de OUTRO jogador: o registro fica, sem ela.
// A proposta aberta que outro fez a ela é cancelada e o item (ou as moedas) em
// custódia volta ao autor — como o `&game mercado cancelar` faria.
function desligarDaPessoa(u, apagar) {
  let n = 0;
  if (existe("rpg_ofertas")) {
    if (!apagar) n += contar("SELECT COUNT(*) n FROM rpg_ofertas WHERE alvoId = ? AND autorId <> ?", u, u);
    else {
      for (const of of d().prepare("SELECT * FROM rpg_ofertas WHERE alvoId = ? AND autorId <> ? AND estado = 'aberta'").all(u, u)) {
        if (of.itemOferecido) db.darItem(of.serverId, of.autorId, of.itemOferecido);
        if (of.moedaOferecida) db.creditar(of.serverId, of.autorId, of.moedaOferecida, of.qtdOferecida);
        db.fecharOferta(of.id, "cancelada");
      }
      n += d().prepare("UPDATE rpg_ofertas SET alvoId = NULL WHERE alvoId = ? AND autorId <> ?").run(u, u).changes ?? 0;
    }
  }
  if (existe("rpg_followers")) {
    n += apagar
      ? (d().prepare("UPDATE rpg_followers SET donoOriginal = NULL WHERE donoOriginal = ? AND (donoId IS NULL OR donoId <> ?)").run(u, u).changes ?? 0)
      : contar("SELECT COUNT(*) n FROM rpg_followers WHERE donoOriginal = ? AND (donoId IS NULL OR donoId <> ?)", u, u);
  }
  return n;
}

// Quanto há de cada grupo (para a tela de confirmação) ou apaga (apagar: true)
export function dadosDaPessoa(userId, { apagar = false } = {}) {
  const u = String(userId);
  const r = [];
  for (const g of DA_PESSOA) {
    let n = g.id === "rpg" ? desligarDaPessoa(u, apagar) : 0;
    for (const [tabela, onde, vezes = 1] of g.partes) {
      if (!existe(tabela)) continue;
      const p = Array(vezes).fill(u);
      n += apagar ? (d().prepare(`DELETE FROM ${tabela} WHERE ${onde}`).run(...p).changes ?? 0)
        : contar(`SELECT COUNT(*) n FROM ${tabela} WHERE ${onde}`, ...p);
    }
    r.push({ id: g.id, rotulo: g.rotulo, n });
  }
  if (apagar) db.setConsentimento(u, { memoria: false, fioGlobal: false, respondido: true });   // a escolha dela fica: não perguntar de novo
  return r;
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

// Tudo o que tem `serverId` (config, XP, tickets, ganchos, feeds, punições, IA…),
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
