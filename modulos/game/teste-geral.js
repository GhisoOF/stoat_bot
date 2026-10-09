// &game admin teste — roda o jogo inteiro num personagem descartável e diz o
// que funcionou (RPG v4). Ele não mexe na moeda do mundo: as lutas dele não
// recebem do banco nem dos tesouros (aventura.js, ehSandbox), e a carteira —
// só a moeda criada para o teste — é apagada no fim.

import * as db from "../core/db.js";
import * as R from "./regras.js";
import * as CB from "./combate.js";
import * as MISS from "./missoes.js";
import * as MERC from "./mercado.js";
import * as AV from "./aventura.js";
import * as EV from "./evolucionador.js";

import { SANDBOX } from "./mundo.js";

const idSandbox = (donoId) => `${SANDBOX}${donoId}`;

export async function rodarTesteGeral(serverId, donoId, G) {
  const uid = idSandbox(donoId);
  const linhas = [];
  let ok = 0, falhas = 0;
  const registrar = (bom, texto, detalhe = "") => {
    if (bom) ok++; else falhas++;
    linhas.push(`${bom ? "✅" : "❌"} ${texto}${detalhe ? ` — _${detalhe}_` : ""}`);
  };
  limpar(serverId, uid);
  const moeda = G.garantirMoeda(serverId);
  try {
    const p0 = db.criarPersonagem(serverId, uid, "Cobaia");
    registrar(!!p0 && p0.nivel === 1, "Criar personagem", `nível ${p0?.nivel}`);
    db.creditar(serverId, uid, moeda.id, 20000);
    registrar(db.getSaldo(serverId, uid, moeda.id) === 20000, "Creditar moeda");

    // comprar e equipar uma arma: dá dano, não atributo (v4)
    const { pSuave } = G.pDaMoeda(serverId, moeda);
    const arma = db.listarItens({ raridade: "comum" }).find((i) => i.dados?.tipo === "arma");
    const preco = MERC.precoDeVenda(arma, db.getEstoque(serverId, arma.id), pSuave);
    db.debitar(serverId, uid, moeda.id, preco);
    db.darItem(serverId, uid, arma.id);
    db.equipar(serverId, uid, "mao1", arma.id);
    const party0 = CB.partyDe(serverId, uid);
    registrar(party0.jogador.maos.length === 1 && party0.jogador.maos[0].modo === "2m", "Arma sozinha vai nas duas mãos", `${arma.nome}, dano ${CB.statsItem(arma).dano}`);
    registrar(MERC.precoDeRecompra(preco, 0) < preco, "Revender dá prejuízo (sem dinheiro infinito)");

    // companheiro no nível do dono, com o kit
    const cat = db.listarFollowersCatalogo({ soVendidos: true })[0];
    const f = db.recrutarFollower(serverId, uid, cat.id, 1);
    db.salvarFollower(f.id, { naParty: 1 });
    const party1 = CB.partyDe(serverId, uid);
    registrar(party1.companheiros.length === 1 && R.poderParty(party1.membros) > R.poderParty(party0.membros), "Companheiro entra na party", cat.nome);

    // contratos: a chance-base e o progresso
    // (a sorte é fixada: aqui se testa o caminho do êxito, não o equilíbrio)
    const contrato = MISS.acharContrato("d_ratos");
    const pv = AV.lutar([uid], contrato, { aleatorio: () => 0.001 });
    const p1 = db.getPersonagem(serverId, uid);
    registrar(pv.r.desfecho === "sucesso" && (p1.nivel > 1 || (p1.progresso ?? 0) > 0), "Contratos pagam a força da missão", `${Math.round(pv.pv.exito * 100)}% de chance, nível ${p1.nivel} (${Math.round((p1.progresso ?? 0) * 100)}%)`);
    registrar(Number.isInteger(db.getSaldo(serverId, uid, "ouro")), "Moedas inteiras");

    // evolucionador: prévia não grava
    db.salvarPersonagem(serverId, uid, { classe: "guerreiro", pontos: 3 });
    const antes = db.getPersonagem(serverId, uid);
    const ev = EV.evoluir(uid, { gravar: false });
    registrar(!ev.erro && db.getPersonagem(serverId, uid).forca === antes.forca, "Evoluir (prévia) não muda nada", ev.cls?.rotulo ?? ev.erro);

    // dungeon: o tesouro paga e quem cai deixa moeda lá
    const d = [...MISS.DUNGEONS.values()][0];
    db.salvarPersonagem(serverId, uid, { ultimaMissao: 0, recuperandoAte: 0 });
    const r2 = AV.lutar([uid], { id: d.id, tipo: "dungeon-encontro", dungeon: d.id, nome: d.nome });
    registrar(!!r2.spec && r2.spec.fonte.tipo === "dungeon", "Encontro de dungeon", `${d.nome}: ${r2.r.desfecho}`);

    // captura e resgate
    db.capturarFollower(f.id, d.id);
    registrar(!!db.listarCapturados(serverId).find((x) => x.id === f.id), "Companheiro capturado na dungeon");
    db.resgatarFollower(f.id, uid);
    registrar(db.getFollower(f.id)?.donoId === uid, "Resgatar companheiro");
    db.salvarFollower(f.id, { energia: 0, energiaEm: Date.now() - 3 * 3600_000 });
    registrar(AV.energiaAtual(db.getFollower(f.id)) === 3, "Energia regenera por tempo");
  } catch (e) {
    registrar(false, "Erro inesperado", e?.message ?? String(e));
    console.error("[RPG][teste]", e);
  }
  limpar(serverId, uid);
  return { linhas, ok, falhas };
}

function limpar(serverId, uid) {
  try {
    const d = db.getDb();
    for (const t of ["rpg_personagem", "rpg_inventario", "rpg_equipado", "rpg_carteira", "rpg_magias"]) {
      d.prepare(`DELETE FROM ${t} WHERE serverId = ? AND userId = ?`).run(serverId, uid);
    }
    for (const t of ["rpg_unicos", "rpg_espera", "rpg_dungeon_ativos"]) d.prepare(`DELETE FROM ${t} WHERE userId = ?`).run(uid);
    d.prepare("DELETE FROM rpg_followers WHERE serverId = ? AND (donoId = ? OR donoOriginal = ?)").run(serverId, uid, uid);
  } catch (e) { console.error("[RPG][teste] limpeza:", e?.message); }
}
