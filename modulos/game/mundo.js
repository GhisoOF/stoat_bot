// O RPG é um MUNDO SÓ (decisão de Ghieh, 1 out 2026).
//
// Antes cada servidor tinha o seu jogo: personagem, mochila, companheiros,
// moedas e mercado próprios — e o dono configurava quantas moedas quisesse
// (12 perfis prontos, modelos "mundo real", "fantasia"…). Agora:
//   • um personagem por PESSOA, o mesmo em qualquer servidor onde a Judy está;
//   • um mercado, uma dungeon e um câmbio para todos;
//   • só DUAS moedas: uma infinita (o dinheiro do dia a dia, sem teto) e uma
//     finita (suprimento fixo — quando o banco esgota, só circula entre
//     jogadores).
// Por baixo, as tabelas continuam com a coluna serverId: o mundo é o
// "servidor" MUNDO. Assim a lógica do jogo não precisou ser reescrita.

import * as db from "../core/db.js";

export const MUNDO = "mundo";
// O personagem descartável do `&game admin teste`: luta de verdade, mas não mexe
// na moeda do mundo (banco, tesouros) nem resgata companheiro de ninguém.
export const SANDBOX = "sandbox:";
export const ehSandbox = (uid) => String(uid ?? "").startsWith(SANDBOX);

// As duas moedas. Nome e símbolo podem mudar (&game admin moeda set); o tipo,
// não — é o que define o mundo.
export const MOEDAS_DO_MUNDO = [
  { id: "ouro", nome: "Ouro", simbolo: "🪙", finita: false, padrao: true,
    dificuldade: 1, nivelMin: 1, suprimentoBase: 200000 },   // infinita: o suprimento é só a referência do P
  // Cristal: 40× mais raro nas missões e com suprimento 40× menor — então
  // 1 Cristal vale ~40 Ouro no câmbio do banco (que segue a razão das reservas).
  { id: "cristal", nome: "Cristal", simbolo: "💎", finita: true, padrao: false,
    dificuldade: 40, nivelMin: 5, suprimentoBase: 5000 },    // finita: existe só isso, para sempre
];
export const IDS_MOEDAS = new Set(MOEDAS_DO_MUNDO.map((m) => m.id));

// Garante as duas moedas (sem desfazer nome/símbolo que o dono trocou) e
// apaga qualquer outra que tenha sobrado.
export function garantirMoedasDoMundo() {
  const atuais = db.listarMoedas(MUNDO);
  for (const base of MOEDAS_DO_MUNDO) {
    const ja = atuais.find((m) => m.id === base.id);
    if (!ja) {
      db.upsertMoeda(MUNDO, { ...base, mercado: base.suprimentoBase });
      continue;
    }
    // o tipo e a posição de padrão são fixos
    const fix = {};
    if (!!ja.finita !== base.finita) fix.finita = base.finita ? 1 : 0;
    if (!!ja.padrao !== base.padrao) fix.padrao = base.padrao ? 1 : 0;
    if (Object.keys(fix).length) db.salvarMoeda(MUNDO, base.id, fix);
  }
  for (const m of db.listarMoedas(MUNDO)) if (!IDS_MOEDAS.has(m.id)) db.removerMoeda(MUNDO, m.id);
  return db.moedaPadrao(MUNDO);
}

// Progresso do jogo (todas as linhas, de todos os servidores). O catálogo de
// itens e companheiros — a curadoria do dono — fica.
export const TABELAS_DE_PROGRESSO = ["rpg_personagem", "rpg_inventario", "rpg_equipado", "rpg_follower_itens",
  "rpg_magias", "rpg_followers", "rpg_moedas", "rpg_carteira", "rpg_estoque", "rpg_ofertas"];

const MARCA = "__rpg_mundo__";
export const VERSAO_MUNDO = 1;

// Na primeira subida com o mundo global, o jogo de cada servidor é zerado
// (pedido de Ghieh: "reseta o game nos servidores"). Só uma vez — a marca
// fica na tabela de config.
//
// (31 out 2026, R3/Regra do Reparo) A marca é lida AQUI, crua: o `lerConfig`
// devolve null tanto para "não existe" quanto para "não consegui ler" — e o null
// virava "falta migrar", apagando o jogo de todo mundo. Agora só apaga quando a
// marca DIZ que falta (versão menor) ou quando ela não existe E o mundo ainda não
// tem ninguém; marca ilegível, ou mundo com gente e sem marca, para tudo em voz
// alta (o jogo fica fechado — ver game.js).
export function lerMarcaDoMundo() {
  const d = db.getDb();
  const linha = d.prepare("SELECT json FROM config WHERE serverId = ?").get(MARCA);
  if (!linha) {
    const noMundo = d.prepare("SELECT COUNT(*) AS n FROM rpg_personagem WHERE serverId = ?").get(MUNDO)?.n ?? 0;
    if (noMundo > 0) throw new Error("a marca do mundo sumiu, mas o mundo já tem personagens — nada foi apagado");
    return { versao: 0 };
  }
  let marca;
  try { marca = JSON.parse(linha.json); } catch { marca = null; }
  if (!marca || typeof marca !== "object" || !Number.isInteger(marca.versao)) throw new Error("a marca do mundo está ilegível — nada foi apagado");
  return marca;
}
export function prepararMundo({ log = console.log } = {}) {
  const marca = lerMarcaDoMundo();
  if (marca.versao < VERSAO_MUNDO) {
    const d = db.getDb();
    const apagados = {};
    for (const t of TABELAS_DE_PROGRESSO) {
      try { apagados[t] = d.prepare(`DELETE FROM ${t}`).run().changes ?? 0; }
      catch (e) { log(`[RPG][mundo] ${t}: ${e.message}`); }
    }
    db.gravarConfig(MARCA, { versao: VERSAO_MUNDO, resetEm: Date.now(), apagados });
    log(`[RPG] mundo global criado — jogo dos servidores zerado: ${Object.entries(apagados).filter(([, n]) => n).map(([t, n]) => `${t}=${n}`).join(" ") || "nada a apagar"}`);
  }
  arredondarSaldosUmaVez({ log });
  return garantirMoedasDoMundo();
}

// (4 out 2026) As moedas passaram a ser inteiras. Os saldos com fração que já
// existiam ("0,1849 Ouro", "4,02 Cristal") são arredondados para baixo uma vez.
const MARCA_INTEIROS = "__rpg_inteiros__";
export function arredondarSaldosUmaVez({ log = console.log } = {}) {
  if (db.lerConfig(MARCA_INTEIROS)?.feito) return;
  const d = db.getDb();
  let n = 0;
  try { n += d.prepare("UPDATE rpg_carteira SET quantidade = CAST(quantidade AS INTEGER) WHERE quantidade != CAST(quantidade AS INTEGER)").run().changes ?? 0; } catch (e) { log(`[RPG] inteiros (carteira): ${e.message}`); }
  try { d.prepare("UPDATE rpg_moedas SET mercado = CAST(mercado AS INTEGER), dungeon = CAST(dungeon AS INTEGER)").run(); } catch (e) { log(`[RPG] inteiros (moedas): ${e.message}`); }
  try { d.prepare("UPDATE rpg_ofertas SET qtdOferecida = CAST(qtdOferecida AS INTEGER), qtdPedida = CAST(qtdPedida AS INTEGER)").run(); } catch (e) { log(`[RPG] inteiros (ofertas): ${e.message}`); }
  db.gravarConfig(MARCA_INTEIROS, { feito: true, em: Date.now(), saldos: n });
  if (n) log(`[RPG] moedas inteiras: ${n} saldo(s) com fração arredondado(s) para baixo`);
}
