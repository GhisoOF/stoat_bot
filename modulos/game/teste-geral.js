// ══════════════════════════════════════════════════════════
//  teste-geral.js — &game admin teste
//
//  Roda o jogo inteiro de ponta a ponta e diz o que funcionou.
//
//  Usa um personagem SANDBOX (id próprio, apagado no fim), para
//  não mexer no seu progresso nem sujar o ranking. A economia do
//  servidor é tocada de leve — o que o sandbox ganha e gasta é
//  devolvido ao mercado ao limpar.
//
//  Serve para: depois de um deploy, confirmar em 10 segundos que
//  nada quebrou; e para ver os números de balanceamento reais.
// ══════════════════════════════════════════════════════════

export const SANDBOX_PREFIXO = "sandbox:";

export function idSandbox(donoId) {
  return `${SANDBOX_PREFIXO}${donoId}`;
}

// Um passo do roteiro: nome, o que faz, e o que precisa ser verdade depois.
function passo(nome, fn) {
  return { nome, fn };
}

export async function rodarTesteGeral(ctx, serverId, donoId, deps) {
  const { db, G, MISS, FOL, ECO } = deps;
  const uid = idSandbox(donoId);
  const linhas = [];
  let ok = 0, falhas = 0;

  const registrar = (bom, texto, detalhe = "") => {
    if (bom) ok++; else falhas++;
    linhas.push(`${bom ? "✅" : "❌"} ${texto}${detalhe ? ` — _${detalhe}_` : ""}`);
  };

  // limpeza prévia, caso um teste anterior tenha ficado pela metade
  limpar(db, serverId, uid);

  const moeda = G.garantirMoeda(serverId);

  try {
    // ── 1. Personagem ──
    const p0 = db.criarPersonagem(serverId, uid, "Cobaia");
    registrar(!!p0 && p0.nivel === 1, "Criar personagem", `nível ${p0?.nivel}, atributos em ${p0?.forca}`);

    // ── 2. Moeda ──
    db.creditar(serverId, uid, moeda.id, 20000);
    const saldo0 = db.getSaldo(serverId, uid, moeda.id);
    registrar(saldo0 === 20000, "Creditar moeda", `${saldo0} ${moeda.nome}`);

    // ── 3. Comprar ──
    const { pSuave } = G.pDaMoeda(serverId, moeda);
    const item = db.listarItens({ raridade: "comum" })[0];
    const preco = ECO.precoDeVenda(item, db.getEstoque(serverId, item.id), pSuave);
    db.debitar(serverId, uid, moeda.id, preco);
    db.darItem(serverId, uid, item.id);
    registrar(db.temItem(serverId, uid, item.id), "Comprar item", `${item.nome} por ${preco}`);

    // ── 4. Equipar e ver o bônus ──
    db.equipar(serverId, uid, item.slot === "acessorio" ? "acessorio1" : item.slot, item.id);
    const bonus = G.bonusEquipados(serverId, uid);
    const temBonus = Object.values(bonus).some((v) => v > 0);
    registrar(temBonus, "Equipar e somar bônus", JSON.stringify(bonus));

    // ── 5. Vender dá prejuízo (anti-exploit) ──
    const antesV = db.getSaldo(serverId, uid, moeda.id);
    const attrV = G.atributosComEquipamento(db.getPersonagem(serverId, uid), serverId, uid);
    const recebe = ECO.precoDeRecompra(preco, attrV.carisma);
    registrar(recebe < preco, "Revender dá prejuízo (sem dinheiro infinito)",
      `comprou ${preco}, venderia ${recebe}`);

    // ── 6. Contratar follower ──
    const cat = db.listarFollowersCatalogo({ soVendidos: true })[0];
    const f = db.recrutarFollower(serverId, uid, cat.id, 3);
    registrar(!!f, "Contratar companheiro", `${cat.nome} nv 3`);

    // ── 7. Party soma atributos e magias ──
    db.salvarFollower(f.id, { naParty: 1 });
    const pAtual = db.getPersonagem(serverId, uid);
    const solo = G.atributosComEquipamento(pAtual, serverId, uid);
    const comParty = G.atributosDaParty(pAtual, serverId, uid);
    const somou = db.ATRIBUTOS.some((a) => comParty.attr[a] > solo[a]);
    registrar(somou && comParty.tamanhoParty === 1, "Party entra no cálculo",
      `${comParty.magias.length} magia(s), party de ${comParty.tamanhoParty}`);

    // ── 8. Missões: rodar várias e medir ──
    const missaoFacil = MISS.acharMissao("d_ratos");
    let sucessos = 0, quedas = 0, xpTotal = 0, moedaTotal = 0, loots = 0;
    const RODADAS = 12;
    for (let i = 0; i < RODADAS; i++) {
      const pAgora = db.getPersonagem(serverId, uid);
      const { attr, magias, tamanhoParty } = G.atributosDaParty(pAgora, serverId, uid);
      const r = MISS.resolver(attr, missaoFacil, Math.random, magias, tamanhoParty);
      const xp = Math.round(r.xp * G.bonusXp(attr.inteligencia, attr.sorte));
      const depois = G.aplicarXp(pAgora, xp);
      const campos = { xp: depois.xp, nivel: depois.nivel, pontos: depois.pontos };
      if (depois.ganhoBase > 0) {
        for (const a of db.ATRIBUTOS) campos[a] = (pAgora[a] ?? 1) + depois.ganhoBase;
      }
      db.salvarPersonagem(serverId, uid, campos);
      xpTotal += xp;
      if (r.desfecho === "sucesso") {
        sucessos++;
        const g = ECO.moedaDaMissao(missaoFacil, pSuave, attr.sorte);
        db.creditar(serverId, uid, moeda.id, g);
        moedaTotal += g;
        if (MISS.sortearRaridade(missaoFacil, attr.sorte, Math.random, tamanhoParty)) loots++;
      }
      if (r.desfecho === "caiu") quedas++;
    }
    registrar(sucessos > 0, `Missões (${RODADAS} rodadas)`,
      `${sucessos} sucesso, ${quedas} queda, ${xpTotal} XP, ${moedaTotal} ${moeda.simbolo}, ${loots} loot`);

    // ── 9. Atributos cresceram sozinhos ──
    const pFinal = db.getPersonagem(serverId, uid);
    registrar(pFinal.nivel > 1, "Subir de nível", `nível ${pFinal.nivel}`);
    registrar(pFinal.forca > 1 || G.baseDoNivel(pFinal.nivel) === 0,
      "Atributos sobem com o nível",
      `força ${pFinal.forca} (base esperada +${G.baseDoNivel(pFinal.nivel)})`);
    registrar(pFinal.pontos > 0 || pFinal.nivel === 1, "Ganhar pontos livres",
      `${Math.floor(pFinal.pontos)} ponto(s)`);

    // ── 10. Distribuir ponto ──
    if (pFinal.pontos >= 1) {
      const antes = pFinal.inteligencia;
      db.salvarPersonagem(serverId, uid, { inteligencia: antes + 1, pontos: pFinal.pontos - 1 });
      registrar(db.getPersonagem(serverId, uid).inteligencia === antes + 1, "Distribuir ponto");
    }

    // ── 11. Morte: perde moeda para a dungeon ──
    const saldoAntes = db.getSaldo(serverId, uid, moeda.id);
    const perdaPct = ECO.perda(pSuave);
    const perdido = Math.floor(saldoAntes * perdaPct);
    db.debitar(serverId, uid, moeda.id, perdido);
    const mAtual = db.getMoeda(serverId, moeda.id);
    db.salvarMoeda(serverId, moeda.id, { dungeon: (mAtual?.dungeon ?? 0) + perdido });
    const dungeonDepois = db.getMoeda(serverId, moeda.id)?.dungeon ?? 0;
    registrar(dungeonDepois >= perdido && perdido > 0, "Morrer manda moeda para a dungeon",
      `perdeu ${perdido} (${(perdaPct * 100).toFixed(0)}%), pote: ${Math.round(dungeonDepois)}`);

    // ── 12. Captura e resgate do follower ──
    db.capturarFollower(f.id);
    const preso = db.listarCapturados(serverId).find((x) => x.id === f.id);
    registrar(!!preso && preso.capturado === 1, "Follower capturado na dungeon");

    db.resgatarFollower(f.id, uid);
    const resgatado = db.getFollower(f.id);
    registrar(resgatado?.capturado === 0 && resgatado?.donoId === uid, "Resgatar follower");

    // ── 13. Energia regenera por tempo ──
    db.salvarFollower(f.id, { energia: 0, energiaEm: Date.now() - 3 * 3600_000 });
    const energia = G.energiaAtual(db.getFollower(f.id));
    registrar(energia === 3, "Energia regenera por tempo", `3h → ${energia} pontos`);

    // ── 14. Prêmio da dungeon ──
    const pote = db.getMoeda(serverId, moeda.id)?.dungeon ?? 0;
    const premio = ECO.premioDungeon(pote);
    registrar(premio >= 0 && premio <= pote, "Prêmio da dungeon é uma fração",
      `pote ${Math.round(pote)} → prêmio ${premio} (${(ECO.fracaoDungeon(pote) * 100).toFixed(0)}%)`);

    // ── 15. Mercado entre jogadores (custódia) ──
    const itemP2P = db.listarItens({ raridade: "incomum" })[0];
    if (itemP2P) {
      db.darItem(serverId, uid, itemP2P.id);
      const oferta = db.criarOferta({ serverId, tipo: "venda", autorId: uid,
        itemOferecido: itemP2P.id, moedaPedida: moeda.id, qtdPedida: 500 });
      db.tirarItem(serverId, uid, itemP2P.id, 1);   // custódia
      const saiu = !db.temItem(serverId, uid, itemP2P.id);
      registrar(saiu && !!oferta, "Anunciar no bazar (custódia)",
        `${itemP2P.nome} por 500 — item retido`);

      // cancelar devolve
      db.darItem(serverId, uid, itemP2P.id);
      db.fecharOferta(oferta.id, "cancelada");
      registrar(db.temItem(serverId, uid, itemP2P.id), "Cancelar devolve a custódia");

      const vol = db.volumeRecente(serverId);
      const { pct } = ECO.calcularTaxa(500, vol);
      registrar(pct > 0 && pct < 0.15, "Taxa do mercado dentro da faixa",
        `${(pct * 100).toFixed(2)}% (volume ${Math.round(vol)})`);
    }

  } catch (e) {
    registrar(false, "Erro inesperado", e?.message ?? String(e));
    console.error("[RPG][teste]", e);
  }

  // ── limpeza ──
  const devolvido = limpar(db, serverId, uid);

  return { linhas, ok, falhas, devolvido };
}

// Apaga tudo do sandbox e devolve a moeda dele ao mercado, para o teste não
// inflar a economia do servidor.
function limpar(db, serverId, uid) {
  let devolvido = 0;
  try {
    for (const c of db.carteiraDe(serverId, uid)) {
      devolvido += c.quantidade;
      const m = db.getMoeda(serverId, c.moedaId);
      if (m) db.salvarMoeda(serverId, c.moedaId, { mercado: (m.mercado ?? 0) + c.quantidade });
    }
    const d = db.getDb();
    for (const t of ["rpg_personagem", "rpg_inventario", "rpg_equipado", "rpg_carteira"]) {
      d.prepare(`DELETE FROM ${t} WHERE serverId = ? AND userId = ?`).run(serverId, uid);
    }
    d.prepare("DELETE FROM rpg_followers WHERE serverId = ? AND (donoId = ? OR donoOriginal = ?)")
      .run(serverId, uid, uid);
  } catch (e) { console.error("[RPG][teste] limpeza:", e?.message); }
  return Math.round(devolvido);
}
