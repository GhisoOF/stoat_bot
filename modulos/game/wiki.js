// A wiki do RPG (P2, 31 out 2026) — o `&tutorial rpg` mostra estas páginas.
// Tudo sai dos dados e das regras: builds (dados/builds.json), rótulos
// (dados/rotulos.json), números (regras.js, missoes.js, sorte.js, lutas.js,
// duelo.js). Nenhum número copiado à mão: se a regra muda, a wiki muda junto.

import * as R from "./regras.js";
import * as MISS from "./missoes.js";
import * as S from "./sorte.js";
const { SORTE } = S;
import { RECUPERACAO_MS, COOP_MAX, CONVITE_MS, CHANCE_ESPECIAL } from "./lutas.js";
import { VALIDADE_MS } from "./duelo.js";
import { LISTA as BUILDS } from "./builds.js";
import { T, cmd, ROTULOS, atributo, efeitoAtributo, emojiAtributo, nomeBuild, descBuild, classeAliado, efeitoClasse, emojiClasse, faixa, emojiRaridade, fmt } from "./telas.js";

const MIN = 60_000;
const p100 = (x) => `${Math.round(x * 100)}%`;

// → [{ titulo, texto }] no idioma pedido (pt | en | es)
export function paginasWikiRpg(lang = "pt", P = "&") {
  const l = lang === "es" ? "es" : lang === "en" ? "en" : "pt";
  const c = (ref) => `\`${cmd(l, ref, P)}\``;
  const pg = (titulo, linhas) => ({ titulo, texto: linhas.filter((x) => x !== null).join("\n") });
  const espera = MISS.ESPERA_MIN.contrato, recup = RECUPERACAO_MS / MIN;
  const ex = (SORTE.teto / 1) ** 2;   // a sorte que leva ao teto
  const b = R.BASE;

  return [
    pg(T(l, "🎲 RPG — como jogar", "🎲 RPG — how to play", "🎲 RPG — cómo jugar"), [
      T(l, "Um mundo só, o mesmo personagem em todo servidor. Você escolhe a build; o resto é automático.",
        "One world, the same character on every server. You pick the build; everything else is automatic.",
        "Un solo mundo, el mismo personaje en todos los servidores. Tú eliges la build; lo demás es automático."),
      "",
      `${c("game.criar")} <${T(l, "nome", "name", "nombre")}> — ${T(l, "cria o personagem (com kit e dois aliados)", "creates the character (with a kit and two allies)", "crea el personaje (con kit y dos aliados)")}`,
      `${c("game")} — ${T(l, "a sua ficha", "your sheet", "tu ficha")}`,
      `${c("game.build")} [build] — ${T(l, "escolhe a build", "picks the build", "elige la build")}`,
      `${c("game.missao")} [@${T(l, "amigos", "friends", "amigos")}] — ${T(l, "uma missão sorteada, sozinho ou em grupo", "a random mission, alone or in a group", "una misión al azar, solo o en grupo")}`,
      `${c("game.chefe")} [@${T(l, "amigos", "friends", "amigos")}] — ${T(l, "um chefe", "a boss", "un jefe")}`,
      `${c("game.comprar")} — ${T(l, "a loja", "the shop", "la tienda")} · ${c("game.aliado")} — ${T(l, "aliados", "allies", "aliados")}`,
      `${c("game.duelo")} @${T(l, "pessoa", "person", "usuario")} [${T(l, "ouro", "gold", "oro")}] · ${c("game.top")} · ${c("game.apagar")}`,
    ]),
    pg(T(l, "🧭 Builds", "🧭 Builds", "🧭 Builds"), [
      T(l, `${BUILDS.length} builds. A build decide sozinha onde vão os pontos, o que equipar e que magias aprender. Trocar de build devolve todos os pontos e refaz o equipamento.`,
        `${BUILDS.length} builds. The build decides on its own where points go, what to equip and which spells to learn. Changing build gives all points back and redoes the gear.`,
        `${BUILDS.length} builds. La build decide sola dónde van los puntos, qué equipar y qué hechizos aprender. Cambiar de build devuelve todos los puntos y rehace el equipo.`),
      "",
      ...BUILDS.map((x) => {
        const principais = Object.entries(x.dist).sort((a, d) => d[1] - a[1]).slice(0, 2).map(([k]) => atributo(k, l)).join(", ");
        return `${x.emoji} **${nomeBuild(x, l)}** — ${descBuild(x, l)} _(${principais})_`;
      }),
    ]),
    pg(T(l, "💪 Atributos", "💪 Attributes", "💪 Atributos"), [
      T(l, `Todos sobem 1 a cada 2 níveis; os pontos de cada nível (1 + ¼ × √(${atributo("inteligencia", l)} + ${atributo("sorte", l)})) a build distribui.`,
        `All of them go up by 1 every 2 levels; the build spends each level's points (1 + ¼ × √(${atributo("inteligencia", l)} + ${atributo("sorte", l)})).`,
        `Todos suben 1 cada 2 niveles; la build reparte los puntos de cada nivel (1 + ¼ × √(${atributo("inteligencia", l)} + ${atributo("sorte", l)})).`),
      "",
      ...Object.keys(ROTULOS.atributos).map((k) => `${emojiAtributo(k)} **${atributo(k, l)}** — ${efeitoAtributo(k, l)}`),
    ]),
    pg(T(l, "📜 Missões", "📜 Missions", "📜 Misiones"), [
      T(l, `A missão é sorteada: contrato da guilda (paga o banco), encontro de dungeon (paga o tesouro dela) ou, às vezes (${p100(CHANCE_ESPECIAL)}), uma missão especial.`,
        `The mission is drawn: a guild contract (the bank pays), a dungeon encounter (its treasury pays) or, sometimes (${p100(CHANCE_ESPECIAL)}), a special mission.`,
        `La misión se sortea: contrato del gremio (paga el banco), encuentro de mazmorra (paga su tesoro) o, a veces (${p100(CHANCE_ESPECIAL)}), una misión especial.`),
      T(l, `No seu nível, com o kit da referência: **${p100(b.normal.exito)}** de vencer e **${p100(b.normal.sobrev)}** de sobreviver. Um êxito no seu nível vale **${p100(R.MISSAO.exitoVale)}** de um nível (no máximo ${MISS.NIVEIS_POR_LUTA} níveis por luta); falhar não paga nada.`,
        `At your level, with the reference kit: **${p100(b.normal.exito)}** to win and **${p100(b.normal.sobrev)}** to survive. A win at your level is worth **${p100(R.MISSAO.exitoVale)}** of a level (at most ${MISS.NIVEIS_POR_LUTA} levels per fight); a failure pays nothing.`,
        `En tu nivel, con el kit de referencia: **${p100(b.normal.exito)}** de ganar y **${p100(b.normal.sobrev)}** de sobrevivir. Una victoria en tu nivel vale **${p100(R.MISSAO.exitoVale)}** de un nivel (como mucho ${MISS.NIVEIS_POR_LUTA} niveles por pelea); fallar no paga nada.`),
      T(l, `Com ${R.FOLGA.garantida}× a força para a qual a missão foi feita, é garantida — nunca pelo nível.`,
        `With ${R.FOLGA.garantida}× the strength the mission was made for, it's guaranteed — never by level.`,
        `Con ${R.FOLGA.garantida}× la fuerza para la que se hizo la misión, está garantizada — nunca por nivel.`),
      T(l, `**Especial:** ${p100(b.especial.exito)} / ${p100(b.especial.sobrev)}; a recompensa única sai no primeiro êxito, uma vez por pessoa; ${MISS.ESPECIAL_PRIMEIRA_H} h entre tentativas até lá.`,
        `**Special:** ${p100(b.especial.exito)} / ${p100(b.especial.sobrev)}; the unique reward comes with the first win, once per person; ${MISS.ESPECIAL_PRIMEIRA_H} h between attempts until then.`,
        `**Especial:** ${p100(b.especial.exito)} / ${p100(b.especial.sobrev)}; la recompensa única sale con la primera victoria, una vez por persona; ${MISS.ESPECIAL_PRIMEIRA_H} h entre intentos hasta entonces.`),
      T(l, `**Chefe:** ${p100(b.chefe.exito)} / ${p100(b.chefe.sobrev)} com ${COOP_MAX} jogadores do nível dele; ${MISS.CHEFE_ESPERA_H} h por pessoa, por chefe.`,
        `**Boss:** ${p100(b.chefe.exito)} / ${p100(b.chefe.sobrev)} with ${COOP_MAX} players of its level; ${MISS.CHEFE_ESPERA_H} h per person, per boss.`,
        `**Jefe:** ${p100(b.chefe.exito)} / ${p100(b.chefe.sobrev)} con ${COOP_MAX} jugadores de su nivel; ${MISS.CHEFE_ESPERA_H} h por persona, por jefe.`),
      T(l, `**Espera:** ${espera} min entre missões; quem cai fica ${recup} min se recuperando e deixa ${p100(R.ECO.perdaAoCair)} do ouro.`,
        `**Wait:** ${espera} min between missions; whoever falls spends ${recup} min recovering and leaves ${p100(R.ECO.perdaAoCair)} of their gold behind.`,
        `**Espera:** ${espera} min entre misiones; quien cae pasa ${recup} min recuperándose y deja el ${p100(R.ECO.perdaAoCair)} de su oro.`),
      "",
      T(l, `**Co-op:** marque até ${COOP_MAX - 1} amigos deste servidor. Só eles entram, com ✅ (ou digitando o mesmo comando); em ${CONVITE_MS / MIN} min o grupo parte com quem aceitou. A força de todos soma e cada um recebe a sua parte.`,
        `**Co-op:** tag up to ${COOP_MAX - 1} friends from this server. Only they can join, with ✅ (or by typing the same command); in ${CONVITE_MS / MIN} min the group leaves with whoever accepted. Everyone's strength adds up and each gets their own share.`,
        `**Co-op:** menciona hasta ${COOP_MAX - 1} amigos de este servidor. Solo ellos entran, con ✅ (o escribiendo el mismo comando); en ${CONVITE_MS / MIN} min el grupo sale con quien aceptó. La fuerza de todos se suma y cada uno recibe su parte.`),
    ]),
    pg(T(l, "🍀 Sorte", "🍀 Luck", "🍀 Suerte"), [
      T(l, `A ${atributo("sorte", l)} entra em todo sorteio — item, aliado, missão especial — e nunca na luta. Na sorte média do seu nível nada muda; acima, a chance sobe com a raiz (${ex}× a média → ${S.fatorSorte(ex)}× a chance), até **${SORTE.teto}×**; abaixo, cai até **${SORTE.piso}×**. Nenhuma chance passa de ${p100(1)}.`,
        `${atributo("sorte", l)} enters every draw — item, ally, special mission — and never the fight. At your level's average luck nothing changes; above it, the chance grows with the square root (${ex}× the average → ${S.fatorSorte(ex)}× the chance), up to **${SORTE.teto}×**; below it, it drops down to **${SORTE.piso}×**. No chance goes above ${p100(1)}.`,
        `La ${atributo("sorte", l)} entra en todo sorteo — objeto, aliado, misión especial — y nunca en la pelea. Con la suerte media de tu nivel nada cambia; por encima, la probabilidad sube con la raíz (${ex}× la media → ${S.fatorSorte(ex)}× la probabilidad), hasta **${SORTE.teto}×**; por debajo, baja hasta **${SORTE.piso}×**. Ninguna probabilidad pasa del ${p100(1)}.`),
      "",
      T(l, `Num êxito, sem sorte nenhuma: um item (${Object.entries(R.loot(1)).map(([r, x]) => `${emojiRaridade(r)} ${p100(x)}`).join(" · ")} no nível 1) e um aliado novo em ${p100(MISS.COMPANHEIRO_LOOT)} das vezes.`,
        `On a win, with plain luck: an item (${Object.entries(R.loot(1)).map(([r, x]) => `${emojiRaridade(r)} ${p100(x)}`).join(" · ")} at level 1) and a new ally ${p100(MISS.COMPANHEIRO_LOOT)} of the time.`,
        `En una victoria, con suerte normal: un objeto (${Object.entries(R.loot(1)).map(([r, x]) => `${emojiRaridade(r)} ${p100(x)}`).join(" · ")} en el nivel 1) y un aliado nuevo el ${p100(MISS.COMPANHEIRO_LOOT)} de las veces.`),
    ]),
    pg(T(l, "👥 Aliados", "👥 Allies", "👥 Aliados"), [
      T(l, "Os dois aliados mais fortes vão junto sozinhos e sobem com você. Cada classe traz um bônus fixo e uma magia própria:",
        "Your two strongest allies come along on their own and level up with you. Each class brings a fixed bonus and a spell of its own:",
        "Tus dos aliados más fuertes van contigo solos y suben contigo. Cada clase trae un bono fijo y un hechizo propio:"),
      ...Object.keys(R.CLASSES).map((k) => `${emojiClasse(k)} **${classeAliado(k, l)}** — ${efeitoClasse(k, l)}`),
      "",
      T(l, `Novos aliados chegam das missões e dos chefes, ou se contratam com ouro (${c("game.aliado")}). O ${atributo("carisma", l)} faz todos renderem mais.`,
        `New allies come from missions and bosses, or are hired with gold (${c("game.aliado")}). ${atributo("carisma", l)} makes all of them perform better.`,
        `Los aliados nuevos llegan de las misiones y de los jefes, o se contratan con oro (${c("game.aliado")}). El ${atributo("carisma", l)} hace que todos rindan más.`),
    ]),
    pg(T(l, "🪙 Ouro e itens", "🪙 Gold and items", "🪙 Oro y objetos"), [
      T(l, "Uma moeda só: o Ouro. Contratos e especiais pagam do banco; a dungeon paga do tesouro dela, que se renova com quem joga lá.",
        "One currency: Gold. Contracts and specials pay from the bank; a dungeon pays from its treasury, which refills with the people who play there.",
        "Una sola moneda: el Oro. Los contratos y las especiales pagan del banco; la mazmorra paga de su tesoro, que se renueva con quien juega allí."),
      T(l, `Item que chega melhor que o da vaga dele é equipado na hora; pior, vira ouro (${p100(R.ECO.revenda)} do preço). Itens únicos ficam guardados.`,
        `An item that's better than the one in its slot is equipped right away; a worse one becomes gold (${p100(R.ECO.revenda)} of its price). Unique items are kept.`,
        `Un objeto mejor que el de su espacio se equipa al momento; uno peor se vuelve oro (${p100(R.ECO.revenda)} de su precio). Los objetos únicos se guardan.`),
      T(l, `A loja (${c("game.comprar")}) só mostra o que melhora a sua build, da raridade do seu nível e da de baixo. Metade do que se gasta volta ao banco.`,
        `The shop (${c("game.comprar")}) only shows what improves your build, of your level's rarity and the one below. Half of what's spent goes back to the bank.`,
        `La tienda (${c("game.comprar")}) solo muestra lo que mejora tu build, de la rareza de tu nivel y la de abajo. La mitad de lo que se gasta vuelve al banco.`),
      T(l, "Sem trocas entre jogadores: o ouro só muda de mão no duelo.", "No trading between players: gold only changes hands in a duel.", "Sin intercambios entre jugadores: el oro solo cambia de manos en un duelo."),
    ]),
    pg(T(l, "⚔️ Duelo", "⚔️ Duel", "⚔️ Duelo"), [
      T(l, `${c("game.duelo")} @pessoa [ouro] — só entre membros do mesmo servidor; só a pessoa desafiada aceita (✅). Vale ${VALIDADE_MS / MIN} min; depois a aposta volta.`,
        `${c("game.duelo")} @person [gold] — only between members of the same server; only the challenged person accepts (✅). Valid for ${VALIDADE_MS / MIN} min; then the bet comes back.`,
        `${c("game.duelo")} @usuario [oro] — solo entre miembros del mismo servidor; solo la persona desafiada acepta (✅). Vale ${VALIDADE_MS / MIN} min; después la apuesta vuelve.`),
      T(l, "1 contra 1, sem aliados: golpes alternados com um d20 (1–3 erra, 20 é crítico). Quem vence leva as duas apostas; quem perde só perde a aposta.",
        "1 on 1, no allies: alternating blows with a d20 (1–3 misses, 20 is a critical). The winner takes both bets; the loser only loses the bet.",
        "1 contra 1, sin aliados: golpes alternos con un d20 (1–3 falla, 20 es crítico). Quien gana se lleva las dos apuestas; quien pierde solo pierde la apuesta."),
    ]),
    pg(T(l, "📈 Níveis", "📈 Levels", "📈 Niveles"), [
      T(l, `${R.FAIXAS.length} dificuldades de 10 níveis; cada uma tem a raridade dos itens dela:`,
        `${R.FAIXAS.length} difficulties of 10 levels each; each one has its item rarity:`,
        `${R.FAIXAS.length} dificultades de 10 niveles; cada una tiene la rareza de sus objetos:`),
      ...R.FAIXAS.map((f) => `${emojiRaridade(f.raridade)} **${f.n}. ${faixa(f.n, l)}** — ${T(l, "níveis", "levels", "niveles")} ${f.niveis[0]}–${f.niveis[1]}`),
      "",
      T(l, `O ouro de um contrato no nível 1: ~🪙 ${fmt(R.alvoOuro(1), l)}; no nível 50: ~🪙 ${fmt(R.alvoOuro(50), l)}.`,
        `A contract's gold at level 1: ~🪙 ${fmt(R.alvoOuro(1), l)}; at level 50: ~🪙 ${fmt(R.alvoOuro(50), l)}.`,
        `El oro de un contrato en el nivel 1: ~🪙 ${fmt(R.alvoOuro(1), l)}; en el nivel 50: ~🪙 ${fmt(R.alvoOuro(50), l)}.`),
    ]),
  ];
}
