// Balanceamento do RPG — v4.1 (10 faixas × 10 níveis; armas com dano e escala; bioware/cyberware; evolucionador).
// As fórmulas vêm de modulos/game/regras.js — a MESMA fonte que o jogo usa — e este
// script gera as tabelas dos docs/rpg/*.md.
//   node scripts/balanceamento-rpg.mjs <modo> [args]
// modos: faixas · tiers · curva · tempo · escolha · missoes · chefes · itens · implantes · evolucionador ·
//        maos · folga · magias · companheiros · economia · precisao · atalho · builds · sinergia · fatias ·
//        calibrar-kit · economia2 · tudo
//        ficha "<tier>" "<atr=★,...>" [níveis] [classe] · chefe "<tier>"
import * as R from "../modulos/game/regras.js";
import {
  ATR, TIERS, FAIXAS, faixaDoNivel, faixaDoTier, RARIDADES, ORDEM, MOLDES, itemGenerico, GRIMORIO, KIT,
  atributosCompanheiro, magiaCompanheiro, fichaPersonagem, precisao, statsArma, ataqueArma, IMPLANTES, IMPL, attrEf,
  poderMembro, defesaMembro, sinergia, poderParty, resilParty, ARMAS, IMPLANTES_REF, party, ref, curvas, ESC2,
  MISSAO, missao, recompensa, fatorTentativa, subirForca, loot, chefeDungeon, chanceComFolga, magiasAtivas, ECO,
  alvoOuro, alvoCristal, pagamento } from "../modulos/game/regras.js";
export * from "../modulos/game/regras.js";

const fmt = (x) => Math.round(x).toLocaleString("pt-BR");
const pct = (x) => `${Math.round(x * 100)}%`;
const r2 = (x) => Math.round(x * 100) / 100;

// Quanto um companheiro muda a party de referência, no lugar do combatente genérico da faixa.
export function impacto(n, attr, magia) {
  const base = party(n), rar = faixaDoNivel(n).raridade;
  const p0 = poderParty(base.membros, base.magias), r0 = resilParty(base.membros, base.magias);
  const mc = magiaCompanheiro("combatente", rar);
  const buff = 1 + 0.05 * Math.sqrt(base.membros[0].attr.carisma);
  const membros = base.membros.map((m) => (m.classe === "combatente" ? { attr: Object.fromEntries(ATR.map((a) => [a, Math.round((attr[a] ?? 0) * buff)])), nivel: n } : m));
  const mana = membros.reduce((s, m) => s + (m.attr.mana ?? 0), 0);
  const { usadas } = magiasAtivas(base.magias.filter((x) => x.nome !== mc.nome).concat([magia]), mana);
  return { dano: poderParty(membros, usadas) / p0 - 1, sobrev: resilParty(membros, usadas) / r0 - 1 };
}

// Curva suave: ln(valor) = a + b·ln(n) + c·n, ajustada nos níveis 1–100.
function ajustar(get) {
  const X = [], y = [];
  for (let n = 1; n <= 100; n++) { X.push([1, Math.log(n), n]); y.push(Math.log(get(n))); }
  const XtX = [[0,0,0],[0,0,0],[0,0,0]], Xty = [0,0,0];
  for (let i = 0; i < X.length; i++) for (let j = 0; j < 3; j++) { Xty[j] += X[i][j] * y[i]; for (let k = 0; k < 3; k++) XtX[j][k] += X[i][j] * X[i][k]; }
  const M = XtX.map((row, i) => [...row, Xty[i]]);
  for (let i = 0; i < 3; i++) { let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]];
    for (let k = 0; k < 3; k++) if (k !== i) { const fct = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= fct * M[i][j]; } }
  const [a, b, c] = M.map((row, i) => row[3] / row[i]);
  return { a, b, c, f: (n) => Math.exp(a + b * Math.log(n) + c * n) };
}
const _memoAj = new Map();
const refMemo = (n) => { if (!_memoAj.has(n)) _memoAj.set(n, ref(n)); return _memoAj.get(n); };
let _ajuste = null;
export function ajuste() { return (_ajuste ??= { poder: ajustar((n) => refMemo(n).poder), resil: ajustar((n) => refMemo(n).resil) }); }
// Regras antigas (só para comparar nas tabelas): XP ×1,5 por nível, custo 100 × 1,5^(n−2), D6 da v3.
export const xpMissao = (nivel) => MISSAO.xp * Math.pow(1.5, nivel - 1);
export const custoNivel = (n) => 100 * Math.pow(1.5, Math.max(2, n) - 2);
export const g = (r) => (r <= 1 ? r : 1 + Math.log(r));
export function subir(nivel, progresso, ganho) { let p = progresso + ganho, n = nivel; while (p >= 1) { p = (p - 1) / 1.5; n++; } return { nivel: n, progresso: p }; }
export function duelo(nivel, ex = .10, sb = .40) {
  const c = curvas();
  return { poder: Math.round(c.poder.f(nivel) * (1 / ex - 1) / ESC2), risco: Math.round(c.resil.f(nivel) * (1 / sb - 1) / ESC2) };
}
// Ouro de antes do v4 (×1,35 por nível, missão média, P = 0,5) — só para comparar.
export const ouroHoje = (nivel) => Math.max(1, Math.round(60 * Math.pow(1.35, nivel - 1)));
export const ouroProposto = (nivel) => Math.round(60 * Math.pow(1.141, nivel - 1));
export const FRACAO_CRISTAL = { facil: 1, medio: 2, dificil: 4, chefe: 10 };
export const cristalProposto = (estoque, nivel, dif = "medio") => Math.max(1, Math.round(estoque * 0.0005 * (1 + nivel / 20) * FRACAO_CRISTAL[dif]));

// ── 9. Tempo para subir ───────────────────────────────────────────────────────
// Tentativas no próprio nível por nível ganho (XP e custo sobem 1,5× juntos).
export function tentativasPorNivel(exito = MISSAO.exito) { return 1 / (MISSAO.exitoVale * exito); }
// Missão k níveis acima (k>0) ou abaixo (k<0) do jogador: chance e XP por tentativa,
// em "níveis ganhos", com o nível efetivo (D6).
export function escolha(nj, k) {
  const nm = Math.max(1, nj + k), c = curvas(), m = missao(nm), P = c.poder.f(nj), R = c.resil.f(nj);
  const ex = chanceComFolga(P, m.poder * ESC2, MISSAO.exito), sb = chanceComFolga(R, m.risco * ESC2, MISSAO.sobrev);
  const q = (P / (m.poder * ESC2)) / (MISSAO.exito / (1 - MISSAO.exito));
  const fator0 = ex + (1 - ex) * 0.3 * (sb + (1 - sb) * 0.15);
  const hoje = MISSAO.xp * Math.pow(1.5, nm - 1) * fator0 / custoNivel(nj + 1);
  const rc = recompensa(nj, m.poder);
  return { ex, sb, hoje, v3: (MISSAO.xp / 100) * g(rc.r) * fator0, niveisPorTentativa: rc.nivel * fatorTentativa(ex), mult: rc.mult, ouro: ouroProposto(nm) / ouroProposto(nj) };
}

// ═════════════════════════════════════════════════════════════════════════════
const direto = import.meta.url === new URL(process.argv[1] ?? "", "file://").href;
const modo = process.argv[2] ?? "tudo";
const quer = (m) => direto && (modo === "tudo" || modo === m);
const args = process.argv.slice(3);

if (quer("faixas")) {
  console.log("\n## Faixas\n\n| faixa | nome | tiers VSB | níveis | raridade | mult. companheiro | orçamento item | preço (2 mãos) | magia ataque (custo/poder) |\n|---|---|---|---|---|---|---|---|---|");
  for (const f of FAIXAS) { const R = RARIDADES[f.raridade], m = GRIMORIO.find((g) => g.raridade === f.raridade && g.tipo === "ataque");
    console.log(`| ${f.n} | ${f.nome} | ${f.de} – ${f.ate} | ${f.niveis[0]}–${f.niveis[1]}${f.n === 10 ? "+" : ""} | ${f.raridade} | ×${R.mult} | ${R.item} | ${fmt(itemGenerico("branca_2m", f.raridade).preco)} | ${m.custo} / ${m.poder} |`); }
}
if (quer("tiers")) {
  console.log("\n## Tier → faixa → nível\n\n| tier | faixa | nível | destaque |\n|---|---|---|---|");
  for (const t of TIERS) { const f = faixaDoTier(t); console.log(`| ${t} | ${f.n} ${f.nome} | ${f.nivel} | ×${f.destaque.toFixed(2)} |`); }
}
if (quer("curva")) {
  const c = ajuste();
  console.log(`\n## Curva da party de referência\nln PR = ${c.poder.a.toFixed(3)} + ${c.poder.b.toFixed(3)}·ln n + ${c.poder.c.toFixed(4)}·n · ln RR = ${c.resil.a.toFixed(3)} + ${c.resil.b.toFixed(3)}·ln n + ${c.resil.c.toFixed(4)}·n\n`);
  console.log("| nível | faixa | poder | resiliência |\n|---|---|---|---|");
  for (const n of [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) { const r = ref(n); console.log(`| ${n} | ${faixaDoNivel(n).n} | ${fmt(r.poder)} | ${fmt(r.resil)} |`); }
}
if (quer("tempo")) {
  console.log(`\n## Tempo: ${tentativasPorNivel().toFixed(2)} tentativas no próprio nível por nível ganho · chefe de dungeon no próprio nível: paga ×${(chefeDungeon(50).poder / missao(50).poder).toFixed(2)} de uma missão do mesmo nível (D6 de 8 out)`);
}
if (quer("escolha")) {
  console.log("\n## Missão acima/abaixo do seu nível (jogador no 45, com a folga pela força)\n\n| diferença | êxito | sobrev. | níveis por tentativa — regra de hoje | — D6 da v3 (pelo seu nível) | — D6 de 8 out (pela força da missão) | XP da missão | Ouro da missão |\n|---|---|---|---|---|---|---|---|");
  for (const k of [-10, -5, -3, -1, 0, 1, 3, 5, 6, 8, 10, 16]) { const a = escolha(45, k);
    console.log(`| ${k > 0 ? "+" : ""}${k} | ${pct(a.ex)} | ${pct(a.sb)} | ${a.hoje.toFixed(2).replace(".", ",")} | ${a.v3.toFixed(2).replace(".", ",")} | ${a.niveisPorTentativa.toFixed(2).replace(".", ",")} | ×${a.mult.toFixed(2).replace(".", ",")} | ×${a.ouro.toFixed(2).replace(".", ",")} |`); }
}
if (quer("missoes")) {
  console.log("\n## Missões por nível\n\n| nível | dificuldade | poder | risco | XP | loot |\n|---|---|---|---|---|---|");
  for (const n of [1,3,5,7,10,11,15,20,21,25,30,31,35,40,41,45,50,51,55,60,61,65,70,71,75,80,81,85,90,91,95,100]) { const m = missao(n);
    console.log(`| ${n} | ${m.dificuldade} | ${fmt(m.poder)} | ${fmt(m.risco)} | ${xpMissao(n).toExponential(2)} | ${Object.entries(loot(n)).map(([k, v]) => `${k} ${pct(v)}`).join(" · ")} |`); }
}
if (quer("chefes")) {
  console.log("\n## Chefes de dungeon (último nível de cada faixa)\n\n| faixa | nível | poder | risco | sozinho | 2 | 3 | 4 | missão do mesmo nível |\n|---|---|---|---|---|---|---|---|---|");
  for (const f of FAIXAS) { const n = f.niveis[1], c = chefeDungeon(n);
    console.log(`| ${f.n} | ${n} | ${fmt(c.poder)} | ${fmt(c.risco)} | ${c.chances.map(([e, s]) => `${pct(e)}/${pct(s)}`).join(" | ")} | ${fmt(missao(n).poder)} |`); }
}
if (quer("itens")) {
  console.log("\n## Itens genéricos por raridade (bônus · preço)\n");
  for (const r of ORDEM) console.log(`${r}: ` + Object.keys(MOLDES).map((m) => `${m} ${JSON.stringify(itemGenerico(m, r).bonus)} $${fmt(itemGenerico(m, r).preco)}`).join(" · "));
}
if (quer("magias")) {
  console.log("\n## Grimório\n\n| magia | tipo | raridade | nível mín. | custo | poder | preço |\n|---|---|---|---|---|---|---|");
  for (const m of GRIMORIO) console.log(`| ${m.nome} | ${m.tipo} | ${m.raridade} | ${m.nivelMin} | ${m.custo} | ${m.poder} | ${fmt(m.preco)} |`);
}
if (quer("companheiros")) {
  console.log("\n## Companheiros genéricos (soma dos atributos no início/fim da faixa · magia)\n\n| faixa | raridade | combatente | tank | mago | suporte |\n|---|---|---|---|---|---|");
  for (const f of FAIXAS) { const [a, b] = f.niveis;
    console.log(`| ${f.n} | ${f.raridade} | ${["combatente","tank","mago","suporte"].map((c) => `${ATR.reduce((s, x) => s + atributosCompanheiro(c, f.raridade, a)[x], 0)}–${ATR.reduce((s, x) => s + atributosCompanheiro(c, f.raridade, b)[x], 0)} · ${magiaCompanheiro(c, f.raridade).poder}`).join(" | ")} |`); }
}
if (quer("economia")) {
  console.log("\n## Economia (missão do próprio nível, P = 0,5)\n\n| nível | faixa | Ouro hoje (×1,35) | Ouro proposto (×1,141) | arma 2 mãos da faixa | armas por missão (proposto) | Cristal hoje | Cristal proposto (banco 5 000) |\n|---|---|---|---|---|---|---|---|");
  for (const n of [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) { const pr = itemGenerico("branca_2m", faixaDoNivel(n).raridade).preco, op = ouroProposto(n);
    const cHoje = Math.min(5000, Math.max(1, Math.round(60 * Math.pow(1.35, n - 1) / 40)));
    console.log(`| ${n} | ${faixaDoNivel(n).n} | ${ouroHoje(n).toExponential(1)} | ${fmt(op)} | ${fmt(pr)} | ${(op / pr).toFixed(0)} | ${fmt(cHoje)} | ${fmt(cristalProposto(5000, n))} |`); }
}
if (quer("precisao")) {
  const seguro = Number.MAX_SAFE_INTEGER, int64 = 9.223e18;
  const primeiro = (f, lim) => { for (let n = 2; n <= 200; n++) if (f(n) > lim) return n; return null; };
  console.log(`\n## Precisão: custo do nível passa do inteiro seguro do JS no nível ${primeiro(custoNivel, seguro)} e do inteiro do SQLite no ${primeiro(custoNivel, int64)}; XP de uma missão passa do inteiro seguro no ${primeiro(xpMissao, seguro)}. Ouro hoje (×1,35) passa do seguro no ${primeiro(ouroHoje, seguro)}.`);
}
if (quer("atalho")) {
  const nivelCom = (xp) => { let n = 1; while (xp >= custoNivel(n + 1)) { xp -= custoNivel(n + 1); n++; } return n; };
  console.log("\n## Atalho (nível 1 numa missão de nível 20 / 50 / 100)\n\n| caso | nível depois (hoje) | (D6 da v3) | (D6 de 8 out) |\n|---|---|---|---|");
  for (const alvo of [20, 50, 100]) for (const [rot, fr, frF] of [["cai sozinho", .3 * .15, 0], ["carregado num co-op que cumpre", 1, 1]]) {
    const v3 = subir(1, 0, (MISSAO.xp / 100) * g(missao(alvo).poder / missao(1).poder) * fr), novo = subirForca(1, 0, missao(alvo).poder * frF);
    console.log(`| ${rot}, missão ${alvo} | ${nivelCom(xpMissao(alvo) * fr)} | ${v3.nivel} | ${novo.nivel} |`); }
}
if (direto && modo === "ficha") {
  const [tier, est = "", niveis = "", classeArg = "", bonusArg = "1"] = args;
  const classe = classeArg || null, bonus = Number(bonusArg) || 1;
  const estrelas = Object.fromEntries(est.split(",").filter(Boolean).map((p) => { const [k, v] = p.split("="); return [k.trim(), Number(v)]; }));
  const f0 = faixaDoTier(tier); const nvs = (niveis || String(f0.nivel)).split(",").map(Number);
  const r0 = fichaPersonagem(tier, estrelas, nvs[0], classe, bonus);
  console.log(`\n## ${tier} → faixa ${f0.n} ${f0.nome} · ${f0.raridade} (×${r0.mult}) · nível ${f0.nivel} · destaque ×${f0.destaque.toFixed(2)}${bonus !== 1 ? ` · bônus ×${bonus}` : ""} · ${r0.porNivel.toFixed(1)} pts/nível · ${r0.classe} · magia ${r0.magia.tipo} custo ${r0.magia.custo} poder ${r0.magia.poder}\n`);
  console.log(`| nível | ${ATR.join(" | ")} | soma | genérico da classe | dano / sobrev. (ele) | dano / sobrev. (genérico da classe) |\n|---|${ATR.map(() => "---").join("|")}|---|---|---|---|`);
  const sg = (x) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
  for (const n of nvs) { const r = fichaPersonagem(tier, estrelas, n, classe, bonus); const g = ATR.reduce((s, a) => s + atributosCompanheiro(r.classe, f0.raridade, n)[a], 0); const im = impacto(n, r.attr, r.magia);
    const ig = impacto(n, atributosCompanheiro(r.classe, f0.raridade, n), magiaCompanheiro(r.classe, f0.raridade));
    console.log(`| ${n} | ${ATR.map((a) => r.attr[a]).join(" | ")} | ${r.soma} | ${g} | ${sg(im.dano)} / ${sg(im.sobrev)} | ${sg(ig.dano)} / ${sg(ig.sobrev)} |`); }
}
if (direto && modo === "chefe") {
  const [tier] = args; const f = faixaDoTier(tier), c = chefeDungeon(f.nivel);
  console.log(`\n## Chefe de dungeon — ${tier} → faixa ${f.n}, nível ${f.nivel}: poder ${fmt(c.poder)} · risco ${fmt(c.risco)} · ${c.chances.map(([e, s], i) => `${i + 1}: ${pct(e)}/${pct(s)}`).join(" · ")}`);
}

// ── Builds: o jogador muda atributos e arma; companheiros iguais ──
export const BUILDS = {
  "Força + montante (2 mãos)":        { dist: { forca: .6, vida: .2, resistencia: .2 }, maos: [["branca_pesada", "2m"]] },
  "Força + martelo (2 mãos)":         { dist: { forca: .6, vida: .2, resistencia: .2 }, maos: [["impacto", "2m"]] },
  "Destreza + rifle (2 mãos)":        { dist: { destreza: .6, vida: .2, resistencia: .2 }, maos: [["fogo_pesada", "2m"]] },
  "Inteligência + cajado (2 mãos)":   { dist: { inteligencia: .6, mana: .2, vida: .2 }, maos: [["magica_pesada", "2m"]] },
  "For/Des + espada e pistola":       { dist: { forca: .3, destreza: .3, vida: .2, resistencia: .2 }, maos: [["branca_media", "1m"], ["fogo_leve", "1m"]] },
  "Força + duas espadas":             { dist: { forca: .6, vida: .2, resistencia: .2 }, maos: [["branca_media", "1m"], ["branca_media", "1m"]] },
  "Inteligência + rifle (fora da build)": { dist: { inteligencia: .6, mana: .2, vida: .2 }, maos: [["fogo_pesada", "2m"]] },
};
// Implantes de uma build: os cyberware da referência (fixos, servem a qualquer
// build) e as biowares da cor do atributo principal.
const COR_DO_ATR = { forca: "rubro", destreza: "ambar", inteligencia: "ceruleo" };
export function implantesDaBuild(build) {
  if (build.implantes) return build.implantes;
  const principal = Object.entries(build.dist).filter(([k]) => COR_DO_ATR[k]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "forca", c = COR_DO_ATR[principal];
  return ["c_lamina", "c_esqueleto", "c_reflexos", `b_${c}_of`, `b_${c}_mut`, "b_verde_def"];
}
export function jogadorBuild(n, build, rar) {
  const base = 1 + Math.floor((n - 1) / 2);
  const p = Object.fromEntries(ATR.map((a) => [a, base]));
  let pts = 0; for (let k = 2; k <= n; k++) pts += 1 + 0.25 * Math.sqrt(2 * base);
  for (const [a, f] of Object.entries(build.dist)) p[a] += Math.round(Math.floor(pts) * f);
  for (const m of ["acess_sorte","acess_vigor","acess_vigor"]) for (const [k, x] of Object.entries(itemGenerico(m, rar).bonus)) p[k] += x;
  return { attr: p, nivel: n, maos: build.maos.map(([a, modo]) => ({ arma: ARMAS[a], raridade: rar, modo })), defesa: [{ tipo: "capacete", raridade: rar }, { tipo: "armadura", raridade: rar }],
    implantes: implantesDaBuild(build).map((id) => ({ id, raridade: rar })) };
}
if (direto && (modo === "builds" || modo === "tudo")) {
  console.log("\n## Builds — poder do jogador sozinho e da party (vs. a de referência)\n");
  console.log("| build | " + [15, 45, 75, 95].map((n) => `${n}: jogador · party`).join(" | ") + " |\n|---|---|---|---|---|");
  for (const [nome, b] of Object.entries(BUILDS)) {
    const cel = [15, 45, 75, 95].map((n) => {
      const rar = faixaDoNivel(n).raridade, ref0 = party(n), j = jogadorBuild(n, b, rar);
      const pj = poderMembro(j), pj0 = poderMembro(ref0.membros[0]);
      const membros = [j, ...ref0.membros.slice(1)];
      const pp = poderParty(membros, ref0.magias) / poderParty(ref0.membros, ref0.magias) - 1;
      return `${Math.round(pj)} · ${pp >= 0 ? "+" : ""}${Math.round(pp * 100)}%`;
    });
    console.log(`| ${nome} | ${cel.join(" | ")} |`);
  }
  console.log("\n## Quanto do poder da party vem de cada parte (referência)\n\n| nível | arma do jogador | atributos do jogador | implantes do jogador | companheiros |\n|---|---|---|---|---|");
  for (const n of [15, 45, 75, 95]) {
    const r = party(n), j = r.membros[0], semImp = { ...j, implantes: [] };
    const ar = ataqueArma(j.maos[0].arma, j.maos[0].raridade, j.attr, j.maos[0].modo).ar;
    const k = precisao(j.attr.destreza) * (1 + n / 100), tot = r.membros.reduce((s, m) => s + poderMembro(m), 0);
    const pa = ar * k, pt = (j.attr.forca + 0.7 * j.attr.inteligencia) * k, pi = poderMembro(j) - poderMembro(semImp);
    console.log(`| ${n} | ${Math.round(pa / tot * 100)}% | ${Math.round(pt / tot * 100)}% | ${Math.round(pi / tot * 100)}% | ${Math.round((tot - pa - pt - pi) / tot * 100)}% |`);
  }
}

if (direto && (modo === "sinergia" || modo === "tudo")) {
  ARMAS.arma_forca ??= { porte: "medio", tipo: "branca", esc: { forca: "D", inteligencia: "S" }, reqDes: 1, reqInt: 4 };
  const FOR = { forca: .6, vida: .2, resistencia: .2 }, DES = { destreza: .6, vida: .2, resistencia: .2 }, INT = { inteligencia: .6, mana: .2, vida: .2 };
  const TRES = { forca: .2, destreza: .25, inteligencia: .35, vida: .2 };
  const SEM = [];   // sem implantes
  const MISTO = ["c_lancador", "c_esqueleto", "c_reflexos", "b_rubro_of", "b_ceruleo_of", "b_verde_def"];
  const j = (dist, maos, implantes) => ({ dist, maos, implantes });
  const casos = [
    ["montante + combatente + tank (referência)", [[j(FOR, [["branca_pesada", "2m"]]), [["combatente"], ["tank"]]]]],
    ["rifle + combatente + tank", [[j(DES, [["fogo_pesada", "2m"]], SEM), [["combatente"], ["tank"]]]]],
    ["montante + combatente + mago", [[j(FOR, [["branca_pesada", "2m"]], SEM), [["combatente"], ["mago"]]]]],
    ["rifle + combatente + mago (cada um focado)", [[j(DES, [["fogo_pesada", "2m"]], SEM), [["combatente"], ["mago"]]]]],
    ["espada + varinha, sozinho", [[j({ forca: .3, inteligencia: .3, vida: .2, resistencia: .2 }, [["branca_media", "1m"], ["magica_leve", "1m"]], SEM), []]]],
    ["arma de força + pistola, sozinho (os 3 tipos)", [[j(TRES, [["arma_forca", "1m"], ["fogo_leve", "1m"]], SEM), []]]],
    ["montante + implantes de outros tipos + combatente + tank", [[j(FOR, [["branca_pesada", "2m"]], MISTO), [["combatente"], ["tank"]]]]],
    ["arma de força + pistola + implantes mistos + combatente + mago", [[j(TRES, [["arma_forca", "1m"], ["fogo_leve", "1m"]], MISTO), [["combatente"], ["mago"]]]]],
    ["co-op de 2: um de montante, um de rifle, cada um com combatente + mago", [[j(FOR, [["branca_pesada", "2m"]]), [["combatente"], ["mago"]]], [j(DES, [["fogo_pesada", "2m"]]), [["combatente"], ["mago"]]]]],
    ["co-op de 4, todos com arma de força + pistola + implantes mistos, combatente + mago", Array.from({ length: 4 }, () => [j(TRES, [["arma_forca", "1m"], ["fogo_leve", "1m"]], MISTO), [["combatente"], ["mago"]]])],
  ];
  console.log("\n## Sinergia — nível 45 (sem teto)\n\n| composição | corpo a corpo / à distância / mágico | diversidade | fontes | bônus |\n|---|---|---|---|---|");
  for (const [nome, jogadores] of casos) {
    const n = 45, rar = faixaDoNivel(n).raridade, membros = [];
    for (const [b, comps] of jogadores) {
      const jj = jogadorBuild(n, b, rar), buff = 1 + 0.05 * Math.sqrt(jj.attr.carisma);
      membros.push(jj, ...comps.map(([c, arma]) => { const at = atributosCompanheiro(c, rar, n); const mb = { attr: Object.fromEntries(ATR.map((x) => [x, Math.round(at[x] * buff)])), nivel: n }; if (arma) mb.maos = [{ arma: ARMAS[arma], raridade: rar, modo: "2m" }]; return mb; }));
    }
    const sg = sinergia(membros);
    console.log(`| ${nome} | ${sg.partes.map((x) => Math.round(x * 100) + "%").join(" / ")} | ${sg.D.toFixed(2).replace(".", ",")} | ${sg.fontes} | +${Math.round(sg.bonus * 100)}% |`);
  }
}

// ── 10. Evolucionador automático (D24) ────────────────────────────────────────
// O jogador escolhe uma classe (só um perfil — não dá bônus nenhum). O
// evolucionador (1) gasta os pontos livres: primeiro o que falta para os
// requisitos do estilo da classe, depois pelas proporções dela, sempre no
// atributo mais atrasado; (2) equipa o melhor que está na mochila, testando
// combinações reais com as fórmulas do combate e escolhendo a que dá a maior
// nota = êxito^peso × sobrevivência^(1 − peso) numa missão do nível do jogador,
// com os companheiros que estão na party e a sinergia.
export const CLASSES_JOGADOR = {
  guerreiro: { rotulo: "Guerreiro",  emoji: "⚔️", dist: { forca: .5, resistencia: .2, vida: .15, mana: .15 }, peso: .6, armas: ["branca"], escudo: true, estilo: [["branca_pesada", "2m"]] },
  duelista:  { rotulo: "Duelista",   emoji: "🤺", dist: { forca: .3, destreza: .3, resistencia: .15, vida: .15, agilidade: .1 }, peso: .6, armas: ["branca", "fogo_leve"], escudo: false, estilo: [["branca_media", "1m"], ["branca_leve", "1m"]] },
  atirador:  { rotulo: "Atirador",   emoji: "🎯", dist: { destreza: .5, resistencia: .15, vida: .15, agilidade: .1, mana: .1 }, peso: .6, armas: ["fogo", "branca_leve"], escudo: false, estilo: [["fogo_pesada", "2m"]] },
  mago:      { rotulo: "Mago",       emoji: "🔮", dist: { inteligencia: .5, mana: .2, vida: .15, resistencia: .15 }, peso: .6, armas: ["magica"], escudo: false, estilo: [["magica_pesada", "2m"]] },
  guardiao:  { rotulo: "Guardião",   emoji: "🛡️", dist: { resistencia: .35, vida: .3, forca: .2, agilidade: .15 }, peso: .35, armas: ["branca"], escudo: true, estilo: [["branca_media", "1m"], ["escudo"]] },
  templario: { rotulo: "Templário",  emoji: "✝️", dist: { forca: .3, inteligencia: .3, resistencia: .15, vida: .15, mana: .1 }, peso: .6, armas: ["branca", "magica"], escudo: true, estilo: [["arma_forca", "2m"]] },
  andarilho: { rotulo: "Andarilho",  emoji: "🌀", dist: { forca: .2, destreza: .2, inteligencia: .25, vida: .15, resistencia: .1, mana: .1 }, peso: .6, armas: ["branca", "fogo", "magica"], escudo: true, estilo: [["arma_forca", "1m"], ["fogo_leve", "1m"]] },
  bardo:     { rotulo: "Bardo",      emoji: "🎻", dist: { carisma: .25, sorte: .25, mana: .2, inteligencia: .1, vida: .1, resistencia: .1 }, peso: .4, armas: ["magica_leve", "branca_leve", "fogo_leve"], escudo: true, estilo: [["magica_leve", "1m"], ["escudo"]] },
};
ARMAS.arma_forca ??= { porte: "medio", tipo: "branca", esc: { forca: "D", inteligencia: "S" }, reqDes: 1, reqInt: 4 };

// Pontos livres até o nível n (a mesma conta da party de referência)
export function pontosAte(n) { const base = 1 + Math.floor((n - 1) / 2); let pts = 0; for (let k = 2; k <= n; k++) pts += 1 + 0.25 * Math.sqrt(2 * base); return { base, pts: Math.floor(pts) }; }
// (1) distribuir: requisitos do estilo primeiro, depois o atributo mais atrasado
export function distribuir(n, classe, rar) {
  const cls = CLASSES_JOGADOR[classe], { base, pts } = pontosAte(n);
  const a = Object.fromEntries(ATR.map((k) => [k, base])), gasto = Object.fromEntries(ATR.map((k) => [k, 0]));
  let livre = pts;
  for (const [mold, modo] of cls.estilo) {
    if (mold === "escudo") continue;
    const st = statsArma(ARMAS[mold], rar), alvo = { forca: Math.ceil((modo === "2m" ? st.reqFor2 / 1.5 : st.reqFor1)), destreza: st.reqDes, inteligencia: st.reqInt };
    for (const [k, v] of Object.entries(alvo)) { const falta = Math.max(0, Math.min(livre, v - a[k])); a[k] += falta; gasto[k] += falta; livre -= falta; }
  }
  for (const k of ["resistencia", "vida"]) { const falta = Math.max(0, Math.min(livre, IMPL.req * (ORDEM.indexOf(rar) + 1) - a[k])); a[k] += falta; gasto[k] += falta; livre -= falta; }
  const total = pts;
  while (livre > 0) {
    let melhor = null, d0 = -Infinity;
    for (const [k, f] of Object.entries(cls.dist)) { const d = f * total - gasto[k]; if (d > d0) { d0 = d; melhor = k; } }
    a[melhor]++; gasto[melhor]++; livre--;
  }
  return a;
}
const ACESSORIOS = ["acess_sorte", "acess_vigor"];
// mochila de teste: um de cada molde da raridade
export function mochilaTeste(rar) {
  return { armas: Object.keys(ARMAS), implantes: Object.keys(IMPLANTES), acessorios: ACESSORIOS, rar };
}
function montarJogador(n, attrBase, rar, maos, escudo, acess, implantes) {
  const p = { ...attrBase };
  for (const m of acess) for (const [k, x] of Object.entries(itemGenerico(m, rar).bonus)) p[k] += x;
  const defesa = [{ tipo: "capacete", raridade: rar }, { tipo: "armadura", raridade: rar }];
  if (escudo) defesa.push({ tipo: "escudo", raridade: rar });
  return { attr: p, nivel: n, maos: maos.map(([a, modo]) => ({ arma: ARMAS[a], raridade: rar, modo })), defesa, implantes: implantes.map((id) => ({ id, raridade: rar })) };
}
export function avaliar(jogador, companheiros, magias, n, peso) {
  const membros = [jogador, ...companheiros], m = missao(n);
  const P = poderParty(membros, magias, { comSinergia: true }), R = resilParty(membros, magias);
  const ex = P / (P + m.poder * ESC2), sb = R / (R + m.risco * ESC2);
  return { ex, sb, nota: Math.pow(ex, peso) * Math.pow(sb, 1 - peso), sg: sinergia(membros) };
}
function combos(xs, k, ok = () => true, ini = 0, acc = [], out = []) {
  if (acc.length === k) { if (ok(acc)) out.push([...acc]); return out; }
  for (let i = ini; i < xs.length; i++) { acc.push(xs[i]); combos(xs, k, ok, i + 1, acc, out); acc.pop(); }
  return out;
}
// (2) equipar: mãos → implantes → acessórios → mãos de novo (duas voltas)
export function evoluir(n, classe, { companheiros = ["combatente", "tank"], mochila = null } = {}) {
  const rar = faixaDoNivel(n).raridade, cls = CLASSES_JOGADOR[classe], bag = mochila ?? mochilaTeste(rar);
  const attr = distribuir(n, classe, rar);
  const ref0 = party(n, { companheiros: companheiros.length }), comps = ref0.membros.slice(1), mags = ref0.magias;
  // a classe filtra as armas que o evolucionador usa (à mão, o jogador usa o que quiser)
  const pode = (w) => cls.armas.some((t) => t === ARMAS[w].tipo || t === w || t === `${ARMAS[w].tipo}_${ARMAS[w].porte}`);
  const armas = bag.armas.filter(pode), opMaos = [];
  // escudo: "sempre" = o estilo da classe manda (o Guardião sem escudo não é Guardião — D27)
  if (cls.escudo !== "sempre") {
    for (const w of armas) opMaos.push({ maos: [[w, "2m"]], escudo: false });
    for (const [w1, w2] of combos(armas, 2)) opMaos.push({ maos: [[w1, "1m"], [w2, "1m"]], escudo: false });
  }
  if (cls.escudo) for (const w of armas) opMaos.push({ maos: [[w, "1m"]], escudo: true });
  const cib = bag.implantes.filter((i) => IMPLANTES[i].fam === "ciber"), bio = bag.implantes.filter((i) => IMPLANTES[i].fam === "bio");
  const opCiber = combos(cib, 3, (c) => new Set(c.map((i) => IMPLANTES[i].regiao)).size === c.length);
  const opBio = combos(bio, 3);
  const opAcess = [["acess_sorte", "acess_sorte", "acess_sorte"], ["acess_sorte", "acess_sorte", "acess_vigor"], ["acess_sorte", "acess_vigor", "acess_vigor"], ["acess_vigor", "acess_vigor", "acess_vigor"]];
  let atual = { mao: opMaos[0], ciber: opCiber[0], bio: opBio[0], acess: opAcess[2] };
  const nota = (s) => avaliar(montarJogador(n, attr, rar, s.mao.maos, s.mao.escudo, s.acess, [...s.ciber, ...s.bio]), comps, mags, n, cls.peso);
  const melhorDe = (campo, ops) => { let best = null, nb = -1; for (const o of ops) { const s = { ...atual, [campo]: o }, r = nota(s).nota; if (r > nb) { nb = r; best = o; } } atual = { ...atual, [campo]: best }; };
  for (let volta = 0; volta < 2; volta++) { melhorDe("mao", opMaos); melhorDe("ciber", opCiber); melhorDe("bio", opBio); melhorDe("acess", opAcess); }
  const r = nota(atual);
  return { classe, attr, escolha: atual, ...r };
}
if (direto && (modo === "evolucionador" || modo === "tudo")) {
  console.log("\n## Evolucionador — cada classe no próprio nível, mochila com um de cada molde da faixa, companheiros combatente + tank\n");
  console.log("| classe | " + [15, 45, 75, 95].map((n) => `${n}: êxito/sobrev.`).join(" | ") + " | escolha no 45 |\n|---|---|---|---|---|---|");
  for (const c of Object.keys(CLASSES_JOGADOR)) {
    const cel = [15, 45, 75, 95].map((n) => { const r = evoluir(n, c); return `${pct(r.ex)}/${pct(r.sb)}${r.sg.bonus > 0.005 ? ` (+${Math.round(r.sg.bonus * 100)}%)` : ""}`; });
    const e = evoluir(45, c).escolha;
    console.log(`| ${CLASSES_JOGADOR[c].emoji} ${CLASSES_JOGADOR[c].rotulo} | ${cel.join(" | ")} | ${e.mao.maos.map(([a, m]) => `${a} ${m}`).join(" + ")}${e.mao.escudo ? " + escudo" : ""} · ${[...e.ciber, ...e.bio].join(", ")} · ${e.acess.map((x) => x.replace("acess_", "")).join("/")} |`);
  }
  const rf = (n) => { const r = ref(n), m = missao(n); return `${pct(r.poder / (r.poder + m.poder * ESC2))}/${pct(r.resil / (r.resil + m.risco * ESC2))}`; };
  console.log(`| (party de referência, sem sinergia) | ${[15, 45, 75, 95].map(rf).join(" | ")} | branca_pesada 2m · ${IMPLANTES_REF.join(", ")} |`);
}

const pc0 = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;
if (direto && (modo === "implantes" || modo === "tudo")) {
  console.log("\n## Implantes por raridade\n\n| raridade | requisito (Res cyber / Vida bio) | cyber ofensivo (dano) / defensivo (defesa) | cyber reforço | cyber atributo (pontos) | bio ofensivo/defensivo | bio atributo | preço |\n|---|---|---|---|---|---|---|---|");
  for (const r of ORDEM) { const b = ORDEM.indexOf(r) + 1, orc = RARIDADES[r].item, hi = 1 + IMPL.escBio;
    console.log(`| ${r} | ${IMPL.req * b} | ${Math.round(IMPL.potencia * orc)} | +${(IMPL.reforco(b) * 100).toFixed(1).replace(".", ",")}% | ${Math.round(IMPL.atributo * orc)} | ${Math.round(IMPL.bio * IMPL.potencia * orc)}–${Math.round(IMPL.bio * IMPL.potencia * orc * hi)} | ${Math.round(IMPL.bio * IMPL.atributo * orc)}–${Math.round(IMPL.bio * IMPL.atributo * orc * hi)} | ${fmt(itemGenerico("acess_vigor", r).preco)} |`); }
  console.log("\n## Implantes da referência no nível 45 — o que cada um rende na party\n\n| implante | poder | resiliência |\n|---|---|---|");
  const r0 = party(45), P0 = poderParty(r0.membros, r0.magias), R0 = resilParty(r0.membros, r0.magias);
  for (const id of IMPLANTES_REF) { const sem = party(45, { implantes: IMPLANTES_REF.filter((x) => x !== id) });
    console.log(`| ${id} | +${Math.round((P0 / poderParty(sem.membros, sem.magias) - 1) * 100)}% | +${Math.round((R0 / resilParty(sem.membros, sem.magias) - 1) * 100)}% |`); }
  for (const [sai, entra] of [["c_reflexos", "c_for"], ["b_rubro_mut", "b_rubro_atr"]]) { const t = party(45, { implantes: IMPLANTES_REF.map((x) => x === sai ? entra : x) });
    console.log(`| (${entra} no lugar de ${sai}) | ${pc0(poderParty(t.membros, t.magias) / P0 - 1)} | ${pc0(resilParty(t.membros, t.magias) / R0 - 1)} |`); }
  const sem = party(45, { implantes: [] });
  console.log(`| os seis | +${Math.round((P0 / poderParty(sem.membros, sem.magias) - 1) * 100)}% | +${Math.round((R0 / resilParty(sem.membros, sem.magias) - 1) * 100)}% |`);
}

// ── 11. Folga pela força (D26) ────────────────────────────────────────────────
// Substitui a "folga de nível" do commit 1156a1a (1/6 por nível acima da missão).
// Nada por nível. Toda missão é feita para uma força: o poder e o risco dela são
// os que dão a chance-base (40% de êxito / 70% de sobrevivência; especial 30/60;
// chefe 35/60) para quem tem exatamente essa força. q = a SUA força ÷ essa força
// (pelos mesmos números que o resolver compara, já com a escala do co-op). Com
// q ≤ 1 nada muda; acima, fecha (q − 1)/2 do que falta para 100% — com 3× a força
// para a qual a missão foi feita, garantido. Êxito e sobrevivência, cada um o seu.
if (direto && (modo === "folga" || modo === "tudo")) {
  const fat = (ex, sb) => ex + (1 - ex) * 0.3 * (sb + (1 - sb) * 0.15), c = curvas();
  console.log("\n## Folga pela força — jogador no 45 descendo de nível\n\n| missão | r | êxito / sobrev. sem folga | níveis por tentativa | com a folga pela força | níveis por tentativa |\n|---|---|---|---|---|---|");
  for (const k of [0, 3, 5, 10, 15, 20, 30, 44]) { const nj = 45, m = missao(nj - k), P = c.poder.f(nj), Rr = c.resil.f(nj);
    const ex = P / (P + m.poder * ESC2), sb = Rr / (Rr + m.risco * ESC2), ex2 = chanceComFolga(P, m.poder * ESC2, MISSAO.exito), sb2 = chanceComFolga(Rr, m.risco * ESC2, MISSAO.sobrev), rc = recompensa(nj, m.poder);
    console.log(`| nível ${nj - k} (dif. ${m.dificuldade}) | ${rc.r.toFixed(2).replace(".", ",")} | ${pct(ex)} / ${pct(sb)} | ${(rc.nivel * fat(ex, sb)).toFixed(3).replace(".", ",")} | ${pct(ex2)} / ${pct(sb2)} | ${(rc.nivel * fat(ex2, sb2)).toFixed(3).replace(".", ",")} |`); }
  console.log("\n## \"Recolher planta\" (missão de nível 1) para cada nível\n\n| party no nível | êxito / sobrev. sem folga | com a folga pela força |\n|---|---|---|");
  for (const nj of [1, 2, 3, 5, 7, 10, 20]) { const m = missao(1), P = c.poder.f(nj), Rr = c.resil.f(nj);
    console.log(`| ${nj} | ${pct(P / (P + m.poder * ESC2))} / ${pct(Rr / (Rr + m.risco * ESC2))} | ${pct(chanceComFolga(P, m.poder * ESC2, MISSAO.exito))} / ${pct(chanceComFolga(Rr, m.risco * ESC2, MISSAO.sobrev))} |`); }
}

// ── 12. Mãos: escudo e arma única (D27) ───────────────────────────────────────
if (direto && (modo === "maos" || modo === "tudo")) {
  const SET = {
    "montante nas duas mãos (referência)": { maos: [["branca_pesada", "2m"]] },
    "montante numa mão, a outra livre": { maos: [["branca_pesada", "1m"]] },
    "montante numa mão + escudo": { maos: [["branca_pesada", "1m"]], escudo: true },
    "espada numa mão + escudo": { maos: [["branca_media", "1m"]], escudo: true },
    "duas pesadas, uma em cada mão": { maos: [["branca_pesada", "1m"], ["impacto", "1m"]] },
    "martelo + espada": { maos: [["impacto", "1m"], ["branca_media", "1m"]] },
  };
  console.log("\n## Mãos — poder / resiliência da party contra o montante nas duas mãos\n\n| como segura | " + [15, 45, 75, 95].join(" | ") + " |\n|---|---|---|---|---|");
  const res = {};
  for (const n of [15, 45, 75, 95]) { const p = party(n), j = p.membros[0], rar = faixaDoNivel(n).raridade;
    const calc = (s) => { const x = { ...j, maos: s.maos.map(([a, m]) => ({ arma: ARMAS[a], raridade: rar, modo: m })), defesa: [...j.defesa, ...(s.escudo ? [{ tipo: "escudo", raridade: rar }] : [])] };
      const ms = [x, ...p.membros.slice(1)]; return [poderParty(ms, p.magias), resilParty(ms, p.magias)]; };
    const [P0, R0] = calc(Object.values(SET)[0]);
    for (const [k, s] of Object.entries(SET)) { const [P, R] = calc(s); (res[k] ??= []).push(`${pc0(P / P0 - 1)} / ${pc0(R / R0 - 1)}`); } }
  for (const [k, v] of Object.entries(res)) console.log(`| ${k} | ${v.join(" | ")} |`);
}

// ── 14. Fatia de cada membro na party (D23: 34% jogador / 33% / 33%) ─────────
// Fatia = metade do ataque + metade da defesa que cada membro põe na party:
//   ataque do membro = poderMembro + 0,3 × Carisma
//   defesa do membro = defesaMembro + 0,6 × Sorte
// (as mesmas parcelas de poderParty/resilParty). As magias multiplicam a party
// inteira e ficam de fora da conta — são da party, não de um membro.
// Cenários: as 10 duplas de classes (com repetição), níveis 15/45/75/95, jogador
// da party de referência. O kit de cada classe é ajustado para que, NA MÉDIA dos
// cenários em que aparece, a classe faça 33% — sem forçar nenhum cenário.
const CLS = ["combatente", "tank", "mago", "suporte"];
export function fatias(n, c1, c2) {
  const p = party(n, { companheiros: 0 }), j = p.membros[0], rar = faixaDoNivel(n).raridade, buff = 1 + 0.05 * Math.sqrt(j.attr.carisma);
  const comp = (c) => { const a = atributosCompanheiro(c, rar, n); return { attr: Object.fromEntries(ATR.map((x) => [x, Math.round(a[x] * buff)])), nivel: n }; };
  const ms = [j, comp(c1), comp(c2)];
  const P = ms.map((m) => poderMembro(m) + 0.3 * (attrEf(m).carisma ?? 0)), D = ms.map((m) => defesaMembro(m) + 0.6 * (attrEf(m).sorte ?? 0));
  const sP = P.reduce((a, b) => a + b, 0), sD = D.reduce((a, b) => a + b, 0);
  return ms.map((_, i) => 0.5 * P[i] / sP + 0.5 * D[i] / sD);
}
export function mediaFatias() {
  const soma = Object.fromEntries(CLS.map((c) => [c, [0, 0]])); let jog = 0, k = 0;
  for (const n of [15, 45, 75, 95]) for (let a = 0; a < 4; a++) for (let b = a; b < 4; b++) {
    const f = fatias(n, CLS[a], CLS[b]); jog += f[0]; k++;
    soma[CLS[a]][0] += f[1]; soma[CLS[a]][1]++; soma[CLS[b]][0] += f[2]; soma[CLS[b]][1]++; }
  return { jogador: jog / k, ...Object.fromEntries(CLS.map((c) => [c, soma[c][0] / soma[c][1]])) };
}
export function calibrarKit(alvo = 0.33, voltas = 40) {
  for (let v = 0; v < voltas; v++) { const m = mediaFatias(); for (const c of CLS) KIT[c] *= Math.pow(alvo / m[c], 1.2); }
  for (const c of CLS) KIT[c] = Math.round(KIT[c] * 100) / 100;
  return mediaFatias();
}
if (direto && modo === "calibrar-kit") {
  const antes = mediaFatias(), kit0 = { ...KIT }, depois = calibrarKit();
  console.log("kit antes", kit0, "fatias", antes); console.log("kit depois", KIT, "fatias", depois);
}
if (direto && (modo === "fatias" || modo === "tudo")) {
  console.log("\n## Fatia de cada membro (½ ataque + ½ defesa) — jogador da referência + dois companheiros\n\n| dupla | 15 | 45 | 75 | 95 |\n|---|---|---|---|---|");
  for (let a = 0; a < 4; a++) for (let b = a; b < 4; b++) console.log(`| ${CLS[a]} + ${CLS[b]} | ${[15, 45, 75, 95].map((n) => fatias(n, CLS[a], CLS[b]).map((x) => Math.round(x * 100)).join(" / ")).join(" | ")} |`);
  const m = mediaFatias();
  console.log(`\nMédia: jogador ${pct(m.jogador)} · ${CLS.map((c) => `${c} ${pct(m[c])}`).join(" · ")} · kit ${CLS.map((c) => `${c} ×${String(KIT[c]).replace(".", ",")}`).join(", ")}`);
}

// ── 15. Economia: contrato (paga o banco) e dungeon (gera sem fim) — D8 ───────
// Dois jeitos de ganhar moeda:
//   CONTRATO (missão da guilda): paga do BANCO. O banco não cria moeda: enche com
//     o que os jogadores gastam no NPC (loja, magias, respec, mercenários) e com o
//     que perdem ao cair num contrato.
//   DUNGEON (mundo aberto): paga do TESOURO DA DUNGEON, que se renova sozinho —
//     é a única fonte de moeda nova do jogo (Ouro e Cristal). Renova na velocidade
//     de quem joga nela, então a inflação acompanha a atividade.
// Quanto paga: alvo do nível da missão × f(x), x = estoque ÷ (alvo × K):
//   f(x) = 2x / (1 + x) — 0 com o estoque vazio, 1 com K pagamentos guardados,
//   tende a 2 com o estoque cheio; nunca paga mais que o estoque.
// alvo de Ouro = D12 (60 × 1,141^(nível − 1)); alvo de Cristal = 1/4 do valor
// em Ouro, ao câmbio de referência (40) — muito mais Cristal que hoje.
// Simulação: jogadores entram aos poucos, cada um faz 5 contratos e 5 dungeons por dia
// no próprio nível (40% de êxito, 70% de sobrevivência; cair perde 10% do que carrega).
export function simularEconomia({ dias = 90, inicio = 40, porDia = 2, banco = { ouro: 200000, cristal: 5000 }, semente = 7 } = {}) {
  let rng = semente; const rand = () => { rng = (rng * 1103515245 + 12345) % 2147483648; return rng / 2147483648; };
  const B = { ...banco }, dung = Array.from({ length: 10 }, () => ({ ouro: 0, cristal: 0, ativos: 0 }));
  const jog = []; const add = () => jog.push({ nivel: 1, prog: 0, ouro: 0, cristal: 0 });
  for (let i = 0; i < inicio; i++) add();
  // dungeon começa vazia: o tesouro dela é moeda que ainda não existe (é criado ao renovar)
  const linhas = []; let criadoO = 0, criadoC = 0;
  for (let dia = 1; dia <= dias; dia++) {
    for (let i = 0; i < porDia; i++) add();
    const pagos = { contrato: [0, 0], dungeon: [0, 0] };
    for (const d of dung) { d.ativos = 0; d.alvoO = 0; d.alvoC = 0; }
    for (const p of jog) { const d = dung[Math.min(9, Math.ceil(p.nivel / 10) - 1)]; d.ativos++; d.alvoO += alvoOuro(p.nivel); d.alvoC += alvoCristal(p.nivel); }
    // renovação da dungeon (moeda nova), na velocidade de quem joga nela: cada
    // jogador ativo traz `regenPorJogador` pagamentos do nível dele por dia; o
    // tesouro não passa de 1,5 × a capacidade (K pagamentos do nível médio de quem está lá)
    // capacidade = K pagamentos do nível médio × (1 + ativos/10): cresce com quem joga lá
    dung.forEach((d, i) => { if (!d.ativos) return; const esc = 1 + d.ativos / 10, capO = d.alvoO / d.ativos * ECO.kDungeon * esc, capC = d.alvoC / d.ativos * ECO.kDungeon * esc;
      const rO = Math.min(Math.max(0, capO * 1.5 - d.ouro), d.alvoO * ECO.regenPorJogador), rC = Math.min(Math.max(0, capC * 1.5 - d.cristal), d.alvoC * ECO.regenPorJogador);
      d.ouro += rO; d.cristal += rC; criadoO += rO; criadoC += rC; });
    for (const p of jog) {
      for (let t = 0; t < 10; t++) {
        const contrato = t % 2 === 0, d = dung[Math.min(9, Math.ceil(p.nivel / 10) - 1)];
        const fonte = contrato ? B : d, K = contrato ? ECO.kBanco : ECO.kDungeon;
        if (rand() < MISSAO.exito) {
          const Kef = contrato ? K : K * (1 + d.ativos / 10);
          const o = Math.floor(pagamento(alvoOuro(p.nivel), fonte.ouro, Kef)), cr = Math.floor(pagamento(alvoCristal(p.nivel), fonte.cristal, Kef) + rand());
          fonte.ouro -= o; fonte.cristal -= Math.min(cr, fonte.cristal); p.ouro += o; p.cristal += cr;
          const k = contrato ? "contrato" : "dungeon"; pagos[k][0] += o / alvoOuro(p.nivel); pagos[k][1]++;
          p.prog += MISSAO.exitoVale; while (p.prog >= 1 && p.nivel < 100) { p.prog -= 1; p.nivel++; }
        } else if (rand() > MISSAO.sobrev) { const perdeO = Math.floor(p.ouro * 0.1), perdeC = Math.floor(p.cristal * 0.1); p.ouro -= perdeO; p.cristal -= perdeC; fonte.ouro += perdeO; fonte.cristal += perdeC; }
      }
      // gasta no NPC → banco
      const gO = Math.floor(p.ouro * ECO.gastoOuro), gC = Math.floor(p.cristal * ECO.gastoCristal); p.ouro -= gO; p.cristal -= gC; B.ouro += Math.floor(gO * ECO.voltaAoBanco); B.cristal += Math.floor(gC * ECO.voltaAoBanco);
    }
    if ([1, 3, 7, 14, 30, 45, 60, 90].includes(dia)) {
      const totO = B.ouro + jog.reduce((s, p) => s + p.ouro, 0), totC = B.cristal + jog.reduce((s, p) => s + p.cristal, 0);   // em circulação (banco + jogadores)
      const niv = jog.map((p) => p.nivel).sort((a, b) => a - b);
      linhas.push({ dia, jogadores: jog.length, nivelMediano: niv[Math.floor(niv.length / 2)], contratoPaga: pagos.contrato[1] ? pagos.contrato[0] / pagos.contrato[1] : 0, dungeonPaga: pagos.dungeon[1] ? pagos.dungeon[0] / pagos.dungeon[1] : 0, bancoO: B.ouro, bancoC: B.cristal, totO, totC, cambio: B.ouro / Math.max(1, B.cristal) });
    }
  }
  return linhas;
}
if (direto && (modo === "economia2" || modo === "tudo")) {
  console.log("\n## Economia — contratos pagos pelo banco, dungeons que se renovam (simulação de 90 dias)\n\n| dia | jogadores | nível mediano | contrato paga (× alvo) | dungeon paga (× alvo) | banco: Ouro | banco: Cristal | Ouro em circulação | Cristal em circulação | câmbio do banco |\n|---|---|---|---|---|---|---|---|---|---|");
  for (const l of simularEconomia()) console.log(`| ${l.dia} | ${l.jogadores} | ${l.nivelMediano} | ×${l.contratoPaga.toFixed(2).replace(".", ",")} | ×${l.dungeonPaga.toFixed(2).replace(".", ",")} | ${fmt(l.bancoO)} | ${fmt(l.bancoC)} | ${fmt(l.totO)} | ${fmt(l.totC)} | ${l.cambio.toFixed(1).replace(".", ",")} |`);
}
